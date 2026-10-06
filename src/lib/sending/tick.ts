import "server-only";
import { loadAccountConfig } from "@/lib/email/account-secrets";
import { createSmtpTransport } from "@/lib/email/clients";
import { publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { classifySendError, InboxConfigError, type InboxEffect } from "./errors";
import { buildMessage, makeMessageId, threadHeaders, unsubscribeUrl } from "./message";
import { isInSendWindow, nextWindowOpen, resolveTimeZone } from "./schedule";

// The sending tick. Called every minute (Supabase pg_cron -> /api/cron/tick).
//
// Each tick, every healthy inbox sends AT MOST ONE email:
//   1. follow-ups waiting on this inbox, then
//   2. new leads from campaigns that use this inbox.
// Every send is reserved first (claim_send, in the database), so running two
// ticks at the same time can never send the same email twice.

type Admin = ReturnType<typeof createAdminClient>;
type Inbox = Tables<"email_accounts">;
type CampaignLead = Tables<"campaign_leads"> & { lead: Tables<"leads"> | null };
type ActiveCampaign = Tables<"campaigns"> & {
  steps: Tables<"sequence_steps">[];
  inboxes: { email_account_id: string }[];
};

export type TickSummary = {
  startedAt: string;
  durationMs: number;
  dryRun: boolean;
  inboxes: number;
  sent: number;
  failed: number;
  bounced: number;
  released: number;
  postponed: number;
  swept: number;
  errors: number;
};

const CANDIDATES_PER_INBOX = 25;
const INBOXES_AT_ONCE = 4;
const DEFAULT_BUDGET_MS = 240_000; // the route allows 300 s

const LEAD_COLUMNS = "*, lead:leads(*)";

type Outcome =
  | { kind: "sent" }
  | { kind: "failed" } // claimed, but the email did not go out (inbox's turn is used up)
  | { kind: "skipped" } // nothing happened, try the next candidate
  | { kind: "stop" } // this inbox can't send now
  | { kind: "campaign_cap"; campaignId: string };

// Dry run (local only): everything happens except the SMTP call, so the whole
// flow can be checked without emailing anyone. Ignored in production.
function isDryRun() {
  return process.env.TICK_DRY_RUN === "true" && process.env.NODE_ENV !== "production";
}

export async function runTick(options: { budgetMs?: number } = {}): Promise<TickSummary> {
  const started = Date.now();
  const deadline = started + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  const dryRun = isDryRun();
  const admin = createAdminClient();
  const summary: TickSummary = {
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    dryRun,
    inboxes: 0,
    sent: 0,
    failed: 0,
    bounced: 0,
    released: 0,
    postponed: 0,
    swept: 0,
    errors: 0,
  };

  // Claims left in "sending" by a tick that died mid-send.
  const swept = await admin.rpc("sweep_stale_sends");
  if (swept.error) {
    logger.error("sweep stale sends failed", { error: swept.error });
    summary.errors++;
  } else {
    summary.swept = swept.data ?? 0;
  }

  const now = new Date();
  const [campaignsResult, inboxesResult] = await Promise.all([
    admin
      .from("campaigns")
      .select("*, steps:sequence_steps(*), inboxes:campaign_email_accounts(email_account_id)")
      .eq("status", "active"),
    admin
      .from("email_accounts")
      .select("*")
      .eq("status", "active")
      .or(`next_available_at.is.null,next_available_at.lte.${now.toISOString()}`)
      .order("last_sent_at", { ascending: true, nullsFirst: true }),
  ]);
  if (campaignsResult.error || inboxesResult.error) {
    logger.error("tick could not load campaigns or inboxes", {
      error: campaignsResult.error ?? inboxesResult.error,
    });
    summary.errors++;
    summary.durationMs = Date.now() - started;
    return summary;
  }

  const campaigns = new Map<string, ActiveCampaign>(
    (campaignsResult.data as ActiveCampaign[]).map((c) => [c.id, c]),
  );
  const inboxes = inboxesResult.data;
  summary.inboxes = inboxes.length;

  if (campaigns.size > 0 && inboxes.length > 0) {
    await runPool(inboxes, INBOXES_AT_ONCE, async (inbox) => {
      if (Date.now() > deadline) return; // out of time: the next tick continues
      try {
        await runInbox(admin, inbox, campaigns, summary, dryRun);
      } catch (error) {
        summary.errors++;
        logger.error("tick failed for an inbox", { error, inboxId: inbox.id });
      }
    });
  }

  summary.durationMs = Date.now() - started;
  if (summary.sent || summary.failed || summary.bounced || summary.released || summary.errors || summary.swept) {
    logger.info("tick done", { ...summary });
  }
  return summary;
}

// One inbox: find its next email and send it ---------------------------------------

async function runInbox(
  admin: Admin,
  inbox: Inbox,
  campaigns: Map<string, ActiveCampaign>,
  summary: TickSummary,
  dryRun: boolean,
) {
  const nowIso = new Date().toISOString();
  const activeIds = [...campaigns.keys()];
  const usingInbox = [...campaigns.values()]
    .filter((c) => c.inboxes.some((i) => i.email_account_id === inbox.id))
    .map((c) => c.id);

  // Follow-ups that belong to this inbox come first, then brand-new leads.
  const [followUps, fresh] = await Promise.all([
    admin
      .from("campaign_leads")
      .select(LEAD_COLUMNS)
      .eq("email_account_id", inbox.id)
      .eq("status", "in_progress")
      .in("campaign_id", activeIds)
      .lte("next_send_at", nowIso)
      .order("next_send_at", { ascending: true })
      .limit(CANDIDATES_PER_INBOX),
    usingInbox.length
      ? admin
          .from("campaign_leads")
          .select(LEAD_COLUMNS)
          .is("email_account_id", null)
          .in("status", ["queued", "in_progress"])
          .in("campaign_id", usingInbox)
          .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`)
          .order("created_at", { ascending: true })
          .limit(CANDIDATES_PER_INBOX)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (followUps.error || fresh.error) {
    throw followUps.error ?? fresh.error;
  }

  // Follow-ups only go out while we can see replies. If this inbox reads its
  // mail over IMAP but has not been checked for a while, a lead may already have
  // answered, so we wait (new leads are not affected).
  const followUpCandidates = repliesAreFresh(inbox) ? (followUps.data as CampaignLead[]) : [];
  const candidates = [...followUpCandidates, ...(fresh.data as CampaignLead[])];
  const cappedCampaigns = new Set<string>();

  for (const candidate of candidates) {
    if (cappedCampaigns.has(candidate.campaign_id)) continue;
    const campaign = campaigns.get(candidate.campaign_id);
    if (!campaign) continue;

    const outcome = await trySend(admin, inbox, campaign, candidate, summary, dryRun);
    if (outcome.kind === "campaign_cap") {
      cappedCampaigns.add(outcome.campaignId);
      continue;
    }
    if (outcome.kind === "skipped") continue;
    return; // sent, failed or "stop": this inbox is done for this tick
  }
}

async function trySend(
  admin: Admin,
  inbox: Inbox,
  campaign: ActiveCampaign,
  cl: CampaignLead,
  summary: TickSummary,
  dryRun: boolean,
): Promise<Outcome> {
  const lead = cl.lead;
  if (!lead) return { kind: "skipped" };

  // The sequence has no such step any more (it was deleted): the lead is done.
  const step = campaign.steps.find((s) => s.position === cl.next_step);
  if (!step) {
    await admin.rpc("complete_lead", { p_campaign_lead_id: cl.id });
    return { kind: "skipped" };
  }

  // Only inside the campaign's sending days and hours, in the lead's timezone.
  const window = {
    timeZone: resolveTimeZone(campaign, lead.timezone),
    days: campaign.send_days,
    start: campaign.window_start,
    end: campaign.window_end,
  };
  const now = new Date();
  if (!isInSendWindow(now, window)) {
    const opensAt = nextWindowOpen(now, window);
    await admin
      .from("campaign_leads")
      .update({ next_send_at: opensAt.toISOString() })
      .eq("id", cl.id)
      .in("status", ["queued", "in_progress"]);
    summary.postponed++;
    return { kind: "skipped" };
  }

  // Earlier emails to this lead (for "Re:" subjects and threading headers).
  let prior: { message_id: string; step_position: number; subject: string }[] = [];
  if (step.position > 1) {
    const { data, error } = await admin
      .from("sent_messages")
      .select("message_id, step_position, subject")
      .eq("campaign_lead_id", cl.id)
      .in("status", ["sent", "bounced"])
      .order("step_position", { ascending: true });
    if (error) throw error;
    prior = data;
  }
  const threadSubject = prior.find((m) => m.step_position === 1)?.subject ?? null;
  const replyingInThread = step.position > 1 && !step.subject.trim();
  const headers = threadHeaders(
    prior.map((m) => m.message_id),
    replyingInThread,
  );

  // Reserve the send. From here on this email is ours.
  const messageId = makeMessageId(inbox.email);
  const claim = await admin.rpc("claim_send", {
    p_campaign_lead_id: cl.id,
    p_step_id: step.id,
    p_account_id: inbox.id,
    p_message_id: messageId,
    ...(headers ? { p_in_reply_to: headers.inReplyTo } : {}),
  });
  if (claim.error) throw claim.error;
  const result = claim.data?.[0]?.out_result;
  const sentMessageId = claim.data?.[0]?.out_sent_message_id;

  switch (result) {
    case "claimed":
      break;
    case "inbox_busy":
    case "inbox_inactive":
    case "inbox_cap":
      return { kind: "stop" };
    case "campaign_cap":
      return { kind: "campaign_cap", campaignId: campaign.id };
    default: // lead_busy, not_due, already_sent, suppressed, campaign_inactive
      return { kind: "skipped" };
  }
  if (!sentMessageId) return { kind: "skipped" };

  const context = { campaignId: campaign.id, inboxId: inbox.id, step: step.position, sentMessageId };

  // Build the email. A failure here is a bug or bad content, never an SMTP problem.
  let message: ReturnType<typeof buildMessage>;
  try {
    message = buildMessage({
      step,
      lead: { ...lead, custom_fields: lead.custom_fields as Record<string, unknown> },
      account: { email: inbox.email, from_name: inbox.from_name, signature: inbox.signature },
      seed: `${cl.id}:${step.position}`,
      threadSubject,
      unsubscribeUrl: campaign.include_unsubscribe
        ? unsubscribeUrl(publicEnv.NEXT_PUBLIC_APP_URL, sentMessageId)
        : null,
    });
  } catch (error) {
    logger.error("could not build an email", { ...context, error });
    await closeFailed(admin, sentMessageId, "fail", "The email could not be built. Check the step's text.", summary);
    return { kind: "failed" };
  }
  if (!message.subject) {
    await closeFailed(admin, sentMessageId, "fail", "The subject is empty after filling in the variables.", summary);
    return { kind: "failed" };
  }

  // Send it.
  if (dryRun) {
    logger.info("dry run: email not sent", { ...context, subject: message.subject, text: message.text });
  } else {
    try {
      await deliver(inbox, lead.email, message, messageId, headers, campaign.include_unsubscribe ? sentMessageId : null);
    } catch (error) {
      const failure = classifySendError(error);
      logger.warn("send failed", { ...context, mode: failure.mode, reason: failure.message });
      await closeFailed(admin, sentMessageId, failure.mode, failure.message, summary, {
        retryInSeconds: failure.retryInSeconds,
        count: failure.countAttempt,
      });
      if (failure.inbox) await applyInboxEffect(admin, inbox.id, failure.inbox);
      return { kind: "failed" };
    }
  }

  // The email is out. Record it. If this keeps failing the claim stays in
  // "sending" and the stale-send sweep marks it failed (never retried).
  try {
    await finalize(
      admin,
      sentMessageId,
      message.subject,
      message.html,
      {
        inbox: inbox.email,
        ...(message.missing.length ? { missing_variables: message.missing } : {}),
        ...(dryRun ? { dry_run: true } : {}),
      },
      context,
    );
  } catch {
    summary.errors++;
    return { kind: "failed" };
  }
  summary.sent++;
  return { kind: "sent" };
}

const REPLIES_MAX_AGE_MS = 30 * 60 * 1000;

// Inboxes without IMAP (for example Postal) can't be checked, so they are always "fresh".
function repliesAreFresh(inbox: Inbox): boolean {
  if (!inbox.imap_host) return true;
  if (!inbox.imap_last_synced_at) return false;
  return Date.now() - new Date(inbox.imap_last_synced_at).getTime() < REPLIES_MAX_AGE_MS;
}

// SMTP ---------------------------------------------------------------------------------

async function deliver(
  inbox: Inbox,
  to: string,
  message: ReturnType<typeof buildMessage>,
  messageId: string,
  thread: { inReplyTo: string; references: string } | null,
  unsubscribeId: string | null,
) {
  let config: Awaited<ReturnType<typeof loadAccountConfig>>;
  try {
    config = await loadAccountConfig(inbox);
  } catch (error) {
    logger.error("could not read an inbox's saved login", { error, inboxId: inbox.id });
    throw new InboxConfigError("The inbox's saved password could not be read. Remove the inbox and add it again.");
  }
  const transport = await createSmtpTransport(config.smtp);
  try {
    await transport.sendMail({
      from: inbox.from_name ? { name: inbox.from_name, address: inbox.email } : inbox.email,
      to,
      envelope: { from: inbox.email, to },
      subject: message.subject,
      html: message.html,
      text: message.text,
      messageId,
      ...(thread ? { inReplyTo: thread.inReplyTo, references: thread.references } : {}),
      headers: unsubscribeId
        ? {
            "List-Unsubscribe": `<${unsubscribeUrl(publicEnv.NEXT_PUBLIC_APP_URL, unsubscribeId)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : {},
    });
  } finally {
    transport.close();
  }
}

// Database bookkeeping -------------------------------------------------------------

async function finalize(
  admin: Admin,
  sentMessageId: string,
  subject: string,
  bodyHtml: string,
  metadata: Record<string, unknown>,
  context: Record<string, unknown>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await admin.rpc("finalize_send", {
      p_sent_message_id: sentMessageId,
      p_subject: subject,
      p_body_html: bodyHtml,
      p_metadata: metadata as Json,
    });
    if (!error) return;
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
  }
  // The email went out but we could not record it. The stale-send sweep will
  // mark it failed after 10 minutes (never retried, so no double send).
  logger.error("CRITICAL: email sent but could not be recorded", { ...context, error: lastError });
  throw new Error("Could not record a sent email");
}

async function closeFailed(
  admin: Admin,
  sentMessageId: string,
  mode: "release" | "fail" | "bounce",
  message: string,
  summary: TickSummary,
  options: { retryInSeconds?: number; count?: boolean } = {},
): Promise<void> {
  const { data, error } = await admin.rpc("fail_send", {
    p_sent_message_id: sentMessageId,
    p_mode: mode,
    p_error: message,
    p_retry_in: `${options.retryInSeconds ?? 900} seconds`,
    p_count: options.count ?? true,
  });
  if (error) {
    logger.error("fail_send failed", { error, sentMessageId });
    summary.errors++;
    return;
  }
  if (data === "released") summary.released++;
  else if (data === "bounced") summary.bounced++;
  else if (data === "failed") summary.failed++;
}

async function applyInboxEffect(admin: Admin, inboxId: string, effect: InboxEffect) {
  const update =
    effect.action === "error"
      ? { status: "error", last_error: effect.reason.slice(0, 500) }
      : { next_available_at: new Date(Date.now() + effect.seconds * 1000).toISOString() };
  const query = admin.from("email_accounts").update(update).eq("id", inboxId);
  const { error } = await (effect.action === "error" ? query.eq("status", "active") : query);
  if (error) logger.error("could not update inbox after a send problem", { error, inboxId });
  else logger.warn("inbox affected by a send problem", { inboxId, action: effect.action, reason: effect.reason });
}

// Runs `work` for every item, at most `limit` at the same time.
async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
    }
  });
  await Promise.all(workers);
}
