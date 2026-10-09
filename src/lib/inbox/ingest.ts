import "server-only";
import { simpleParser } from "mailparser";
import { sanitizeEmailHtml } from "@/lib/sending/message";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { classifyInbound, extractMessageIds, isBulkMail, parseHeaderBlock, type InboundKind } from "./parse";

// Records one incoming email (a whole raw message, from the Postal route) if it
// belongs to one of our emails: a reply, an out-of-office, or a bounce report
// (a reply stops the lead's sequence), or a new email from someone we wrote to.
// Anything else (strangers, newsletters, notices) is not stored.

type Admin = ReturnType<typeof createAdminClient>;
type SentRef = Pick<
  Tables<"sent_messages">,
  "id" | "message_id" | "to_email" | "status" | "created_at" | "replied_at" | "campaign_lead_id" | "email_account_id"
>;

const SENT_COLUMNS = "id, message_id, to_email, status, created_at, replied_at, campaign_lead_id, email_account_id";

// What happened to the message: stored as one of the kinds, or not stored.
export type IngestResult = InboundKind | "ignored";

// The header lines of a raw email (everything before the first empty line).
export function rawHeaderBlock(raw: Buffer): string {
  const text = raw.subarray(0, 256 * 1024).toString("utf8");
  const end = text.search(/\r?\n\r?\n/);
  return end === -1 ? text : text.slice(0, end);
}

export async function ingestRawMessage(
  admin: Admin,
  args: {
    // The inboxes the message may belong to (all inboxes of the Postal server).
    accountIds: string[];
    raw: Buffer;
    // Used when the message has no Message-ID header (it must be unique per inbox).
    fallbackMessageId: string;
    // The address it was delivered to, when nothing in the message says it.
    defaultTo: string | null;
    source: "postal_route";
  },
): Promise<IngestResult> {
  if (args.accountIds.length === 0) return "ignored";
  const fields = parseHeaderBlock(rawHeaderBlock(args.raw));
  const parsed = await simpleParser(args.raw).catch(() => null);
  if (!parsed) return "ignored"; // unreadable: skip it, it would never get better

  const from = parsed.from?.value?.[0];
  const fromAddress = (from?.address ?? "").toLowerCase();
  const subject = parsed.subject ?? "";
  const references = Array.isArray(parsed.references) ? parsed.references.join(" ") : (parsed.references ?? null);
  const message = {
    message_id: parsed.messageId ?? args.fallbackMessageId,
    in_reply_to: parsed.inReplyTo ?? null,
    references,
    from_email: fromAddress || "unknown@unknown.invalid",
    from_name: from?.name || null,
    to_email: parsed.to
      ? Array.isArray(parsed.to)
        ? parsed.to.map((t) => t.text).join(", ")
        : parsed.to.text
      : args.defaultTo,
    subject,
    text_body: parsed.text ?? null,
    html_body: typeof parsed.html === "string" ? sanitizeEmailHtml(parsed.html) : null,
    received_at: (parsed.date ?? new Date()).toISOString(),
    source: args.source,
  } satisfies Json;

  const classified = classifyInbound({ fromAddress, subject, headers: fields, raw: args.raw.toString("utf8") });
  if (classified.kind === "other") return "ignored";

  // Which of our emails is this about?
  const ownId = parsed.messageId?.toLowerCase();
  let ids: string[];
  let leadEmail: string | null;
  if (classified.kind === "bounce") {
    ids = classified.report.originalMessageIds.filter((id) => id !== ownId);
    leadEmail = classified.report.recipient;
  } else {
    ids = extractMessageIds(parsed.inReplyTo, fields["in-reply-to"], fields["references"]);
    leadEmail = fromAddress || null;
  }
  const match = await findSentMessage(admin, args.accountIds, ids, leadEmail, classified.kind === "bounce");
  if (!match?.sent.email_account_id) return "ignored"; // not about one of our emails
  // Found only by the sender's address (a new email from someone we wrote to):
  // a newsletter or list mail from that address is not an answer to us.
  if (match.method === "sender" && isBulkMail(fields)) return "ignored";

  const { data, error } = await admin.rpc("ingest_inbound", {
    p_account_id: match.sent.email_account_id,
    p_kind: classified.kind,
    p_sent_message_id: match.sent.id,
    p_match_method: match.method,
    p_message: message,
  });
  if (error) throw error;
  return data === "stored" ? classified.kind : "ignored";
}

// The sent email an inbound message belongs to.
//   1. By message id (our id in In-Reply-To / References, or quoted in a bounce).
//   2. Otherwise by the lead's address: its most recent email from these inboxes.
//      Needed because some servers replace our Message-ID with their own.
async function findSentMessage(
  admin: Admin,
  accountIds: string[],
  ids: string[],
  leadEmail: string | null,
  isBounce: boolean,
): Promise<{ sent: SentRef; method: "header" | "sender" | "bounce" } | null> {
  if (ids.length > 0) {
    const { data, error } = await admin
      .from("sent_messages")
      .select(SENT_COLUMNS)
      .in("email_account_id", accountIds)
      .in("message_id", ids);
    if (error) throw error;
    // The first id in the list is the most specific (In-Reply-To comes first).
    for (const id of ids) {
      const hit = data.find((row) => row.message_id.toLowerCase() === id);
      if (hit) return { sent: hit, method: isBounce ? "bounce" : "header" };
    }
  }

  if (leadEmail) {
    const { data, error } = await admin
      .from("sent_messages")
      .select(SENT_COLUMNS)
      .in("email_account_id", accountIds)
      .eq("to_email", leadEmail)
      .in("status", ["sent", "bounced"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data[0]) return { sent: data[0], method: isBounce ? "bounce" : "sender" };
  }
  return null;
}
