"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadPostalConfig, savePostalKey } from "@/lib/email/account-secrets";
import { testPostal, type CheckResult } from "@/lib/email/connection-test";
import { logger } from "@/lib/logger";
import { ensurePostalServer, sendSetupCheck } from "@/lib/postal/servers";
import { classifySendError } from "@/lib/sending/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { apiKeySchema, createAccountSchema, settingsSchema } from "./schema";

export type ActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  test?: CheckResult;
  id?: string;
};

const idSchema = z.uuid();
const GENERIC_ERROR = "Something went wrong. Please try again.";

// Loads an account only if it belongs to the user's workspace (RLS enforces it).
async function getOwnedAccount(id: unknown) {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// The Postal URL of an inbox (also works when its saved key can't be read).
async function postalUrlOf(account: { postal_server_id: string }): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("postal_servers")
    .select("api_url")
    .eq("id", account.postal_server_id)
    .maybeSingle();
  if (error) throw error;
  return data?.api_url ?? null;
}

function alreadyConnected(inThisWorkspace: boolean) {
  return inThisWorkspace
    ? "This inbox is already connected."
    : "This inbox is already connected in another workspace. Remove it there first.";
}

// A Postal inbox: URL + API key, checked before saving (without sending an email).
export async function createEmailAccount(input: unknown): Promise<ActionResult> {
  const { workspace } = await getCurrentWorkspace();

  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;

  const supabase = await createClient();
  // One inbox can be in only ONE workspace (so its replies land in one place).
  // RLS hides other workspaces, so this check reads with the server key.
  const { data: existing, error: existingError } = await createAdminClient()
    .from("email_accounts")
    .select("workspace_id")
    .eq("email", v.email)
    .maybeSingle();
  if (existingError) {
    logger.error("inbox duplicate check failed", { error: existingError, workspaceId: workspace.id });
    return { ok: false, error: GENERIC_ERROR };
  }
  if (existing) return { ok: false, fieldErrors: { email: [alreadyConnected(existing.workspace_id === workspace.id)] } };

  const test = await testPostal({ apiUrl: v.apiUrl, apiKey: v.apiKey }, v.email);
  if (!test.ok) return { ok: false, test, error: test.error };

  let serverId: string;
  try {
    serverId = (await ensurePostalServer(workspace.id, v.apiUrl)).id;
  } catch (error) {
    logger.error("could not save the Postal server", { error, workspaceId: workspace.id });
    return { ok: false, test, error: GENERIC_ERROR };
  }

  const id = randomUUID();
  const { error: insertError } = await supabase.from("email_accounts").insert({
    id,
    workspace_id: workspace.id,
    email: v.email,
    from_name: v.fromName,
    postal_server_id: serverId,
    daily_limit: v.dailyLimit,
    status: "active",
    last_tested_at: new Date().toISOString(),
  });
  if (insertError) {
    // Added at the same moment somewhere else.
    if (insertError.code === "23505") return { ok: false, fieldErrors: { email: [alreadyConnected(false)] } };
    logger.error("create email account failed", { error: insertError, workspaceId: workspace.id });
    return { ok: false, test, error: GENERIC_ERROR };
  }

  try {
    await savePostalKey(id, v.apiKey);
  } catch (error) {
    logger.error("saving postal api key failed", { error, accountId: id });
    await supabase.from("email_accounts").delete().eq("id", id);
    return { ok: false, test, error: GENERIC_ERROR };
  }

  logger.info("postal inbox connected", { accountId: id, workspaceId: workspace.id });
  revalidatePath("/email-accounts");
  return { ok: true, id, test };
}

// Sends the "Check setup" test email. The page then watches for it to come back
// through the webhook and the route.
export async function checkPostalSetup(id: string): Promise<ActionResult> {
  const account = await getOwnedAccount(id);
  if (!account) return { ok: false, error: "Email account not found." };

  try {
    await sendSetupCheck(account);
  } catch (error) {
    const failure = classifySendError(error);
    logger.warn("postal setup check could not be sent", { accountId: account.id, reason: failure.message });
    return { ok: false, error: failure.message };
  } finally {
    revalidatePath(`/email-accounts/${account.id}`);
  }
  return { ok: true };
}

export async function testEmailAccount(id: string): Promise<ActionResult> {
  const account = await getOwnedAccount(id);
  if (!account) return { ok: false, error: "Email account not found." };

  let test: CheckResult;
  try {
    test = await testPostal(await loadPostalConfig(account), account.email);
  } catch (error) {
    logger.error("email account test failed to run", { error, accountId: account.id });
    return { ok: false, error: "The saved API key could not be read. Save the API key again." };
  }

  const supabase = await createClient();
  await supabase
    .from("email_accounts")
    .update({
      last_tested_at: new Date().toISOString(),
      last_error: test.ok ? null : test.error,
      // A failed test marks the inbox as "error" so it stops sending.
      // A passing test only revives "error" inboxes; paused stays paused.
      status: test.ok ? (account.status === "error" ? "active" : account.status) : "error",
    })
    .eq("id", account.id);

  revalidatePath("/email-accounts");
  revalidatePath(`/email-accounts/${account.id}`);
  return { ok: test.ok, test, error: test.ok ? undefined : test.error };
}

export async function updateEmailAccountSettings(id: string, input: unknown): Promise<ActionResult> {
  const account = await getOwnedAccount(id);
  if (!account) return { ok: false, error: "Email account not found." };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_accounts")
    .update({
      from_name: v.fromName,
      daily_limit: v.dailyLimit,
      signature: v.signature,
    })
    .eq("id", account.id);
  if (error) {
    logger.error("update email account settings failed", { error, accountId: account.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath("/email-accounts");
  revalidatePath(`/email-accounts/${account.id}`);
  return { ok: true };
}

// A new Postal API key: tested before it is saved.
export async function updateEmailAccountApiKey(id: string, input: unknown): Promise<ActionResult> {
  const account = await getOwnedAccount(id);
  if (!account) return { ok: false, error: "Email account not found." };

  const parsed = apiKeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const apiKey = parsed.data.apiKey;

  let test: CheckResult;
  try {
    const apiUrl = await postalUrlOf(account);
    if (!apiUrl) return { ok: false, error: "This inbox has no Postal server. Remove it and add it again." };
    test = await testPostal({ apiUrl, apiKey }, account.email);
    if (!test.ok) return { ok: false, test, error: test.error };
    await savePostalKey(account.id, apiKey);
  } catch (error) {
    logger.error("updating postal api key failed", { error, accountId: account.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  await supabase
    .from("email_accounts")
    .update({
      last_tested_at: new Date().toISOString(),
      last_error: null,
      status: account.status === "error" ? "active" : account.status,
    })
    .eq("id", account.id);

  revalidatePath("/email-accounts");
  revalidatePath(`/email-accounts/${account.id}`);
  return { ok: true, test };
}

export async function setEmailAccountPaused(id: string, paused: boolean): Promise<ActionResult> {
  const account = await getOwnedAccount(id);
  if (!account) return { ok: false, error: "Email account not found." };
  if (!paused && account.status === "error") {
    return { ok: false, error: "Fix the connection first: run a test or update the API key." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_accounts")
    .update({ status: paused ? "paused" : "active" })
    .eq("id", account.id);
  if (error) {
    logger.error("pause/resume email account failed", { error, accountId: account.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath("/email-accounts");
  revalidatePath(`/email-accounts/${account.id}`);
  return { ok: true };
}

export async function deleteEmailAccount(id: string): Promise<ActionResult> {
  const account = await getOwnedAccount(id);
  if (!account) return { ok: false, error: "Email account not found." };

  const supabase = await createClient();
  // Secrets and campaign links are removed by ON DELETE CASCADE.
  const { error } = await supabase.from("email_accounts").delete().eq("id", account.id);
  if (error) {
    logger.error("delete email account failed", { error, accountId: account.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  logger.info("email account deleted", { accountId: account.id });
  revalidatePath("/email-accounts");
  return { ok: true };
}
