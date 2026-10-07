import "server-only";
import { createHash } from "node:crypto";
import { ingestRawMessage, rawHeaderBlock } from "@/lib/inbox/ingest";
import { parseHeaderBlock } from "@/lib/inbox/parse";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { normalizeMessageId, parseWebhook, readInboundMail, type MessageRef } from "./core";

// What Postal tells us, through the two URLs the user pastes into Postal:
//   webhook: delivered / delayed / failed / held / bounced / DNS problems
//   route:   emails sent to the user's addresses (replies)
// Both are safe to receive twice (Postal retries until we answer 2xx).

type Admin = ReturnType<typeof createAdminClient>;
type Server = Tables<"postal_servers">;

export type HookResult = { status: number; result: string };

// Header added to the "Check setup" test email, so it is recognised even if a
// server changes its Message-ID.
export const CHECK_HEADER = "X-InboxHype-Check";

async function findServer(admin: Admin, token: string): Promise<Server | null> {
  const { data, error } = await admin.from("postal_servers").select("*").eq("hook_token", token).maybeSingle();
  if (error) throw error;
  return data;
}

async function serverInboxes(admin: Admin, serverId: string) {
  const { data, error } = await admin.from("email_accounts").select("id, email").eq("postal_server_id", serverId);
  if (error) throw error;
  return data;
}

async function updateServer(admin: Admin, id: string, values: Partial<Server>) {
  const { error } = await admin.from("postal_servers").update(values).eq("id", id);
  if (error) throw error;
}

function setWarning(admin: Admin, server: Server, warning: string) {
  return updateServer(admin, server.id, { warning: warning.slice(0, 500), warning_at: new Date().toISOString() });
}

const isCheckMessage = (server: Server, messageId: string | null) =>
  Boolean(messageId && server.check_message_id && messageId === server.check_message_id);

// Webhook ------------------------------------------------------------------------------

export async function handlePostalWebhook(token: string, body: unknown): Promise<HookResult> {
  const admin = createAdminClient();
  const server = await findServer(admin, token);
  if (!server) return { status: 404, result: "unknown_token" };

  const event = parseWebhook(body);
  const now = new Date().toISOString();
  await updateServer(admin, server.id, { last_webhook_at: now });

  if (event.type === "ignored") return { status: 200, result: `ignored: ${event.reason}` };
  if (event.type === "dns_error") {
    await setWarning(admin, server, `Postal: ${event.detail}`);
    return { status: 200, result: "dns_warning" };
  }

  // The "Check setup" email: proves the webhook works.
  if (isCheckMessage(server, event.message.messageId)) {
    await updateServer(admin, server.id, { webhook_ok_at: now });
    if (event.type === "held" || event.type === "failed") {
      await setWarning(admin, server, `Postal could not deliver the test email: ${event.detail}`);
    }
    return { status: 200, result: "check_ok" };
  }

  const sent = await findSent(admin, server.id, event.message);
  if (!sent) return { status: 200, result: "not_ours" };

  switch (event.type) {
    case "sent":
      await setDelivery(admin, sent.id, { delivery_status: "delivered", delivery_detail: event.detail, delivered_at: now }, [
        "delayed",
        "held",
      ]);
      return { status: 200, result: "delivered" };
    case "delayed":
      await setDelivery(admin, sent.id, { delivery_status: "delayed", delivery_detail: event.detail }, ["delayed", "held"]);
      return { status: 200, result: "delayed" };
    case "held":
      await setDelivery(admin, sent.id, { delivery_status: "held", delivery_detail: event.detail }, ["delayed", "held"]);
      await setWarning(admin, server, `Postal is holding an email to ${sent.to_email}: ${event.detail}`);
      return { status: 200, result: "held" };
    case "failed":
      await setDelivery(admin, sent.id, { delivery_status: "failed", delivery_detail: event.detail }, null);
      if (event.addressProblem) {
        await recordBounce(admin, server, sent, event.detail, `failed-${event.message.postalId ?? sent.id}`);
        return { status: 200, result: "bounced" };
      }
      // The receiving server refused us (spam filter, policy): not the lead's fault.
      await setWarning(admin, server, `An email to ${sent.to_email} was refused: ${event.detail}`);
      return { status: 200, result: "failed" };
    case "bounced":
      await setDelivery(admin, sent.id, { delivery_status: "failed", delivery_detail: "Bounced" }, null);
      await recordBounce(admin, server, sent, "The receiving server sent a bounce message.", `bounce-${event.bounceId ?? sent.id}`);
      return { status: 200, result: "bounced" };
  }
}

type SentRow = Pick<Tables<"sent_messages">, "id" | "email_account_id" | "to_email" | "step_position">;

// Our email that Postal is talking about: by Message-ID, else by Postal's own id.
async function findSent(admin: Admin, serverId: string, message: MessageRef): Promise<SentRow | null> {
  const inboxIds = (await serverInboxes(admin, serverId)).map((i) => i.id);
  if (inboxIds.length === 0) return null;
  const columns = "id, email_account_id, to_email, step_position";
  if (message.messageId) {
    const { data, error } = await admin
      .from("sent_messages")
      .select(columns)
      .in("email_account_id", inboxIds)
      .eq("message_id", message.messageId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (message.postalId) {
    const { data, error } = await admin
      .from("sent_messages")
      .select(columns)
      .in("email_account_id", inboxIds)
      .eq("provider_message_id", message.postalId)
      .limit(1);
    if (error) throw error;
    if (data[0]) return data[0];
  }
  return null;
}

// Updates the delivery state. `onlyFrom` = the states that may be replaced
// (null state is always replaceable); null = always replace.
async function setDelivery(
  admin: Admin,
  id: string,
  values: Pick<Partial<Tables<"sent_messages">>, "delivery_status" | "delivery_detail" | "delivered_at">,
  onlyFrom: string[] | null,
) {
  let query = admin
    .from("sent_messages")
    .update({ ...values, delivery_detail: values.delivery_detail?.slice(0, 1000) ?? null })
    .eq("id", id);
  if (onlyFrom) query = query.or(`delivery_status.is.null,delivery_status.in.(${onlyFrom.join(",")})`);
  const { error } = await query;
  if (error) throw error;
}

// A bounce reported by Postal: same as a bounce found over IMAP (lead bounced,
// address suppressed, shown in the Unibox "Bounced" tab).
async function recordBounce(admin: Admin, server: Server, sent: SentRow, detail: string, key: string) {
  if (!sent.email_account_id) return;
  const host = new URL(server.api_url).hostname;
  const message = {
    message_id: `<postal-${key}@${host}>`,
    in_reply_to: null,
    references: null,
    from_email: `mailer-daemon@${host}`,
    from_name: "Postal",
    to_email: null,
    subject: `Delivery failed: ${sent.to_email}`,
    text_body: `Postal could not deliver the email to ${sent.to_email}.\n\n${detail}`,
    html_body: null,
    imap_uid: null,
    received_at: new Date().toISOString(),
    source: "postal_webhook",
  } satisfies Json;
  const { error } = await admin.rpc("ingest_inbound", {
    p_account_id: sent.email_account_id,
    p_kind: "bounce",
    p_sent_message_id: sent.id,
    p_match_method: "bounce",
    p_message: message,
  });
  if (error) throw error;
}

// Route (incoming mail) -------------------------------------------------------------------

export async function handlePostalInbound(token: string, body: unknown): Promise<HookResult> {
  const admin = createAdminClient();
  const server = await findServer(admin, token);
  if (!server) return { status: 404, result: "unknown_token" };

  const now = new Date().toISOString();
  const mail = readInboundMail(body);
  if (!mail.ok) {
    await updateServer(admin, server.id, { last_inbound_at: now });
    await setWarning(admin, server, `Reply route: ${mail.reason}`);
    // 200: sending it again would not help.
    return { status: 200, result: "wrong_format" };
  }
  await updateServer(admin, server.id, { last_inbound_at: now });

  // The "Check setup" email came back: the route works. Not stored.
  const headers = parseHeaderBlock(rawHeaderBlock(mail.raw));
  const checkHeader = headers[CHECK_HEADER.toLowerCase()]?.trim();
  if (
    isCheckMessage(server, normalizeMessageId(headers["message-id"])) ||
    (checkHeader && server.check_message_id?.includes(checkHeader.toLowerCase()))
  ) {
    await updateServer(admin, server.id, { route_ok_at: now });
    return { status: 200, result: "check_ok" };
  }

  const inboxes = await serverInboxes(admin, server.id);
  const fallbackId = mail.postalId ?? createHash("sha256").update(mail.raw).digest("hex").slice(0, 32);
  const kind = await ingestRawMessage(admin, {
    accountIds: inboxes.map((i) => i.id),
    raw: mail.raw,
    fallbackMessageId: `<postal-in-${fallbackId}@${new URL(server.api_url).hostname}>`,
    defaultTo: mail.rcptTo,
    source: "postal_route",
  });
  if (kind !== "other") logger.info("postal route: message recorded", { serverId: server.id, kind });
  return { status: 200, result: kind === "other" ? "ignored" : kind };
}
