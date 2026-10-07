"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORY_KEYS } from "./categories";
import { sendManualReply } from "@/lib/inbox/reply";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";

export type InboxActionResult = { ok: boolean; error?: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";
const idSchema = z.uuid();
const replySchema = z.string().trim().min(1, "Write a reply first.").max(20_000, "The reply is too long.");

export async function markMessageRead(id: string): Promise<InboxActionResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false };
  await getCurrentWorkspace();
  const supabase = await createClient();
  // Opening a conversation marks the whole conversation as read (RLS: own workspace only).
  const { error } = await supabase.rpc("unibox_bulk", { p_ids: [parsed.data], p_action: "read" });
  if (error) {
    logger.error("mark message read failed", { error, id });
    return { ok: false };
  }
  revalidatePath("/inbox");
  return { ok: true };
}

const bulkSchema = z.object({
  // One message id per selected conversation (the list sends the newest).
  ids: z.array(z.uuid()).min(1, "Select at least one conversation.").max(200, "Select at most 200 at a time."),
  action: z.enum(["delete", "read", "unread", "category"]),
  // For "category": the category, or null to remove it.
  value: z.enum(CATEGORY_KEYS).nullable().optional(),
});

// Delete / mark read / mark unread / set a category, on whole conversations.
export async function bulkAction(input: unknown): Promise<InboxActionResult & { count?: number }> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the selection." };
  await getCurrentWorkspace();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("unibox_bulk", {
    p_ids: parsed.data.ids,
    p_action: parsed.data.action,
    p_value: parsed.data.action === "category" ? (parsed.data.value ?? undefined) : undefined,
  });
  if (error) {
    logger.error("unibox bulk action failed", { error, action: parsed.data.action });
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath("/inbox");
  return { ok: true, count: data ?? 0 };
}

export async function sendReply(id: string, body: unknown): Promise<InboxActionResult> {
  const messageId = idSchema.safeParse(id);
  const text = replySchema.safeParse(body);
  if (!messageId.success) return { ok: false, error: "Message not found." };
  if (!text.success) return { ok: false, error: text.error.issues[0]?.message };

  await getCurrentWorkspace();
  const supabase = await createClient();

  // Both reads go through RLS, so they only find the user's own data.
  const { data: original, error } = await supabase.from("inbox_messages").select("*").eq("id", messageId.data).maybeSingle();
  if (error) {
    logger.error("reply: load message failed", { error, id });
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!original) return { ok: false, error: "Message not found." };
  if (original.direction !== "inbound" || (original.kind !== "reply" && original.kind !== "other")) {
    return { ok: false, error: "You can only reply to an email a person sent." };
  }

  const { data: inbox, error: inboxError } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("id", original.email_account_id)
    .maybeSingle();
  if (inboxError || !inbox) return { ok: false, error: "The inbox this message came to was removed." };
  if (inbox.status === "error") return { ok: false, error: `${inbox.email} has a problem. Fix it in Email accounts first.` };

  const sent = await sendManualReply({ inbox, original, text: text.data });
  if (!sent.ok) {
    logger.warn("manual reply failed", { inboxId: inbox.id, reason: sent.error });
    return { ok: false, error: `The reply was not sent: ${sent.error}` };
  }

  // Keep a copy in the conversation (server-only table writes).
  const { error: saveError } = await createAdminClient().from("inbox_messages").insert({
    workspace_id: original.workspace_id,
    email_account_id: inbox.id,
    lead_id: original.lead_id,
    campaign_id: original.campaign_id,
    sent_message_id: original.sent_message_id,
    direction: "outbound",
    kind: "reply",
    message_id: sent.messageId,
    in_reply_to: original.message_id,
    references_header: sent.references,
    from_email: inbox.email,
    from_name: inbox.from_name || null,
    to_email: original.from_email,
    subject: sent.subject,
    text_body: text.data,
    html_body: sent.html,
    received_at: new Date().toISOString(),
    is_read: true,
  });
  // The email IS sent. If only the copy failed, say so but don't call it a failure.
  if (saveError) logger.error("reply sent but copy not saved", { error: saveError, inboxId: inbox.id });

  revalidatePath("/inbox");
  return { ok: true };
}
