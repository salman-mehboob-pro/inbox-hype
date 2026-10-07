import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { sendFromInbox } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { normalizeMessageId } from "./core";
import { CHECK_HEADER } from "./hooks";

// Postal servers of a workspace (one row per Postal URL). Written by the server
// only, so the secret token in the webhook / route URLs is always random.

export async function ensurePostalServer(workspaceId: string, apiUrl: string): Promise<Tables<"postal_servers">> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("postal_servers")
    .upsert(
      { workspace_id: workspaceId, api_url: apiUrl, hook_token: randomBytes(32).toString("base64url") },
      { onConflict: "workspace_id,api_url", ignoreDuplicates: true },
    );
  if (error) throw error;
  const { data, error: readError } = await admin
    .from("postal_servers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("api_url", apiUrl)
    .single();
  if (readError) throw readError;
  return data;
}

// "Check setup": sends a short test email from the inbox to itself through
// Postal. When the webhook reports it, the webhook works; when it comes back in
// through the route, the route works (see hooks.ts).
export async function sendSetupCheck(inbox: Tables<"email_accounts">): Promise<void> {
  if (!inbox.postal_server_id) throw new Error("Not a Postal inbox");
  const check = randomUUID();
  const domain = inbox.email.split("@")[1]?.toLowerCase() || "inboxhype.local";
  const messageId = `<inboxhype-check-${check}@${domain}>`;

  const { error } = await createAdminClient()
    .from("postal_servers")
    .update({ check_message_id: normalizeMessageId(messageId), check_sent_at: new Date().toISOString() })
    .eq("id", inbox.postal_server_id);
  if (error) throw error;

  const text =
    "This is an automatic test email from InboxHype. It checks that your Postal webhook and reply route " +
    "reach InboxHype. You can delete it.";
  await sendFromInbox(inbox, {
    to: inbox.email,
    subject: "InboxHype setup check",
    text,
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body><p>${text}</p></body></html>`,
    messageId,
    headers: { [CHECK_HEADER]: check },
  });
}
