import "server-only";
import { loadAccountConfig } from "@/lib/email/account-secrets";
import { createImapClient } from "@/lib/email/clients";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { ingestRawMessage } from "./ingest";
import { extractMessageIds, isMailerDaemon, parseHeaderBlock, type InboundKind } from "./parse";

// Reads replies and bounces from each inbox over IMAP.
//
// For every inbox with IMAP, we look at new mail in INBOX only. Mail from
// people we never emailed is NOT read or stored: we first look at the sender
// and the reply headers, and only download messages that can belong to one of
// our emails. Reading is done with PEEK, so nothing is marked as read.

type Admin = ReturnType<typeof createAdminClient>;
type Inbox = Tables<"email_accounts">;

export type SyncSummary = {
  inboxes: number;
  checked: number;
  replies: number;
  autoReplies: number;
  bounces: number;
  ignored: number;
  errors: number;
};

// Look at each inbox about every 2 minutes (the tick runs every minute).
const MIN_SECONDS_BETWEEN_SYNCS = 100;
// At most this many UIDs are scanned per inbox per run; the next run continues.
const MAX_UIDS_PER_RUN = 300;
const MAX_SOURCE_BYTES = 1_500_000;
const INBOXES_AT_ONCE = 4;

export async function runInboxSync(
  options: { budgetMs?: number; force?: boolean; workspaceId?: string } = {},
): Promise<SyncSummary> {
  const deadline = Date.now() + (options.budgetMs ?? 90_000);
  const admin = createAdminClient();
  const summary: SyncSummary = { inboxes: 0, checked: 0, replies: 0, autoReplies: 0, bounces: 0, ignored: 0, errors: 0 };

  let query = admin
    .from("email_accounts")
    .select("*")
    .in("status", ["active", "paused"])
    .not("imap_host", "is", null)
    .order("imap_last_synced_at", { ascending: true, nullsFirst: true });
  if (options.workspaceId) query = query.eq("workspace_id", options.workspaceId);
  const { data, error } = await query;
  if (error) {
    logger.error("inbox sync could not load inboxes", { error });
    summary.errors++;
    return summary;
  }

  const dueBefore = Date.now() - MIN_SECONDS_BETWEEN_SYNCS * 1000;
  const inboxes = data.filter(
    (i) => options.force || !i.imap_last_synced_at || new Date(i.imap_last_synced_at).getTime() < dueBefore,
  );
  summary.inboxes = inboxes.length;

  let next = 0;
  const workers = Array.from({ length: Math.min(INBOXES_AT_ONCE, inboxes.length) }, async () => {
    while (next < inboxes.length && Date.now() < deadline) {
      const inbox = inboxes[next++];
      try {
        const result = await syncInbox(admin, inbox);
        summary.checked++;
        summary.replies += result.replies;
        summary.autoReplies += result.autoReplies;
        summary.bounces += result.bounces;
        summary.ignored += result.ignored;
      } catch (error) {
        summary.errors++;
        await handleSyncError(admin, inbox, error);
      }
    }
  });
  await Promise.all(workers);

  if (summary.replies || summary.autoReplies || summary.bounces || summary.errors) {
    logger.info("inbox sync done", { ...summary });
  }
  return summary;
}

async function handleSyncError(admin: Admin, inbox: Inbox, error: unknown) {
  const authFailed = typeof error === "object" && error !== null && (error as { authenticationFailed?: boolean }).authenticationFailed;
  logger.error("inbox sync failed", { inboxId: inbox.id, error, authFailed: Boolean(authFailed) });
  // A wrong password will not fix itself. Stop using the inbox until the user does.
  if (authFailed && inbox.status === "active") {
    await admin
      .from("email_accounts")
      .update({
        status: "error",
        last_error: "Could not log in to read replies (IMAP). Check the app password.",
      })
      .eq("id", inbox.id)
      .eq("status", "active");
  }
}

type SyncResult = { replies: number; autoReplies: number; bounces: number; ignored: number };

export async function syncInbox(admin: Admin, inbox: Inbox): Promise<SyncResult> {
  const result: SyncResult = { replies: 0, autoReplies: 0, bounces: 0, ignored: 0 };
  const config = await loadAccountConfig(inbox);
  if (!config.imap) return result;

  const client = await createImapClient(config.imap);
  client.on("error", () => {
    // Connection errors surface through the awaited calls below.
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("INBOX could not be opened");
      const uidValidity = Number(mailbox.uidValidity);
      const lastUidInMailbox = mailbox.uidNext - 1;

      // Where to start. First time (or the mailbox was reset by the server):
      // only mail from around our first send, never the whole history.
      let fromUid: number;
      const mailboxChanged = inbox.imap_uid_validity === null || Number(inbox.imap_uid_validity) !== uidValidity;
      if (mailboxChanged || inbox.imap_last_uid === null) {
        const since = await firstSentAt(admin, inbox.id);
        if (!since) {
          await saveCheckpoint(admin, inbox.id, uidValidity, lastUidInMailbox);
          return result;
        }
        const found = await client.search({ since: new Date(since.getTime() - 24 * 3600 * 1000) }, { uid: true });
        const uids = Array.isArray(found) ? found : [];
        if (uids.length === 0) {
          await saveCheckpoint(admin, inbox.id, uidValidity, lastUidInMailbox);
          return result;
        }
        fromUid = Math.min(...uids);
      } else {
        fromUid = Number(inbox.imap_last_uid) + 1;
      }

      if (fromUid > lastUidInMailbox) {
        await saveCheckpoint(admin, inbox.id, uidValidity, Math.max(lastUidInMailbox, Number(inbox.imap_last_uid ?? 0)));
        return result;
      }
      const toUid = Math.min(lastUidInMailbox, fromUid + MAX_UIDS_PER_RUN - 1);

      // Stage 1: who is it from, what does it reply to? (small, no bodies)
      const headers: Envelope[] = [];
      for await (const message of client.fetch(
        `${fromUid}:${toUid}`,
        {
          uid: true,
          envelope: true,
          headers: ["references", "in-reply-to", "auto-submitted", "precedence", "x-autoreply", "x-autorespond", "content-type"],
        },
        { uid: true },
      )) {
        if (message.uid < fromUid) continue;
        const fields = parseHeaderBlock(message.headers);
        headers.push({
          uid: message.uid,
          fromAddress: message.envelope?.from?.[0]?.address?.toLowerCase() ?? null,
          subject: message.envelope?.subject ?? "",
          date: message.envelope?.date ? new Date(message.envelope.date) : null,
          replyIds: extractMessageIds(message.envelope?.inReplyTo, fields["in-reply-to"], fields["references"]),
          fields,
        });
      }

      // Stage 2: keep only mail that can belong to one of our emails.
      const relevant = await filterRelevant(admin, inbox.id, headers);

      // Stage 3: download, read and record those.
      let processedUpTo = toUid;
      for (const header of relevant) {
        try {
          const outcome = await handleMessage(admin, inbox, client, header);
          if (outcome === "reply") result.replies++;
          else if (outcome === "auto_reply") result.autoReplies++;
          else if (outcome === "bounce") result.bounces++;
          else result.ignored++;
        } catch (error) {
          // Could not record it (database problem?). Stop here and retry from this
          // message next time, so nothing is lost.
          logger.error("could not record an inbound message", { inboxId: inbox.id, uid: header.uid, error });
          processedUpTo = header.uid - 1;
          break;
        }
      }

      await saveCheckpoint(admin, inbox.id, uidValidity, Math.max(processedUpTo, Number(inbox.imap_last_uid ?? 0)));
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
  return result;
}

type Envelope = {
  uid: number;
  fromAddress: string | null;
  subject: string;
  date: Date | null;
  replyIds: string[];
  fields: Record<string, string>;
};

async function firstSentAt(admin: Admin, inboxId: string): Promise<Date | null> {
  const { data, error } = await admin
    .from("sent_messages")
    .select("created_at")
    .eq("email_account_id", inboxId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? new Date(data.created_at) : null;
}

async function saveCheckpoint(admin: Admin, inboxId: string, uidValidity: number, lastUid: number) {
  const { error } = await admin
    .from("email_accounts")
    .update({
      imap_uid_validity: uidValidity,
      imap_last_uid: lastUid,
      imap_last_synced_at: new Date().toISOString(),
    })
    .eq("id", inboxId);
  if (error) throw error;
}

// From the lead we emailed, a reply to one of our messages, or the mail system.
async function filterRelevant(admin: Admin, inboxId: string, headers: Envelope[]): Promise<Envelope[]> {
  if (headers.length === 0) return [];
  const senders = [...new Set(headers.map((h) => h.fromAddress).filter((a): a is string => Boolean(a) && !isMailerDaemon(a)))];
  const ids = [...new Set(headers.flatMap((h) => h.replyIds))];

  const [bySender, byId] = await Promise.all([
    senders.length
      ? admin.from("sent_messages").select("to_email").eq("email_account_id", inboxId).in("to_email", senders)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? admin.from("sent_messages").select("message_id").eq("email_account_id", inboxId).in("message_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bySender.error) throw bySender.error;
  if (byId.error) throw byId.error;

  const knownSenders = new Set(bySender.data.map((r) => String(r.to_email).toLowerCase()));
  const knownIds = new Set(byId.data.map((r) => r.message_id.toLowerCase()));

  return headers.filter(
    (h) =>
      isMailerDaemon(h.fromAddress) ||
      (h.fromAddress !== null && knownSenders.has(h.fromAddress)) ||
      h.replyIds.some((id) => knownIds.has(id)),
  );
}

async function handleMessage(
  admin: Admin,
  inbox: Inbox,
  client: Awaited<ReturnType<typeof createImapClient>>,
  header: Envelope,
): Promise<InboundKind> {
  const fetched = await client.fetchOne(String(header.uid), { source: { maxLength: MAX_SOURCE_BYTES } }, { uid: true });
  if (!fetched || !fetched.source) return "other";
  return ingestRawMessage(admin, {
    accountIds: [inbox.id],
    raw: fetched.source,
    fallbackMessageId: `<imap-${inbox.id}-${header.uid}@inboxhype.local>`,
    defaultTo: inbox.email,
    imapUid: header.uid,
    source: "imap",
  });
}
