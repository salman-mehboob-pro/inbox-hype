"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  loadAccountConfig,
  loadPostalConfig,
  saveAccountSecrets,
  savePostalKey,
} from "@/lib/email/account-secrets";
import type { ServerConfig } from "@/lib/email/clients";
import {
  connectionError,
  connectionOk,
  testConnection,
  testPostal,
  type ConnectionTestResult,
} from "@/lib/email/connection-test";
import { isPostalInbox } from "@/lib/email/send";
import { logger } from "@/lib/logger";
import { ensurePostalServer, sendSetupCheck } from "@/lib/postal/servers";
import { classifySendError } from "@/lib/sending/errors";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import {
  createAccountSchema,
  createPostalAccountSchema,
  normalizePassword,
  passwordSchema,
  settingsSchema,
} from "./schema";

export type ActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  test?: ConnectionTestResult;
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

export async function createEmailAccount(input: unknown): Promise<ActionResult> {
  const { workspace } = await getCurrentWorkspace();

  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("email_accounts")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("email", v.email)
    .maybeSingle();
  if (existing) return { ok: false, fieldErrors: { email: ["This inbox is already connected."] } };

  const password = normalizePassword(v.provider, v.password);
  const imapPassword = v.imapPassword ? normalizePassword(v.provider, v.imapPassword) : null;

  const smtp: ServerConfig = {
    host: v.smtpHost,
    port: v.smtpPort,
    secure: v.smtpSecure,
    username: v.smtpUsername,
    password,
  };
  const imap: ServerConfig | null = v.imapEnabled
    ? {
        host: v.imapHost!.trim().toLowerCase(),
        port: v.imapPort!,
        secure: v.imapSecure,
        username: v.imapUsername!,
        password: imapPassword ?? password,
      }
    : null;

  // Only save inboxes that actually work.
  const test = await testConnection(smtp, imap);
  if (!connectionOk(test)) return { ok: false, test, error: connectionError(test) ?? undefined };

  const id = randomUUID();
  const { error: insertError } = await supabase.from("email_accounts").insert({
    id,
    workspace_id: workspace.id,
    email: v.email,
    from_name: v.fromName,
    provider: v.provider,
    smtp_host: smtp.host,
    smtp_port: smtp.port,
    smtp_secure: smtp.secure,
    smtp_username: smtp.username,
    imap_host: imap?.host ?? null,
    imap_port: imap?.port ?? null,
    imap_secure: imap?.secure ?? true,
    imap_username: imap?.username ?? null,
    daily_limit: v.dailyLimit,
    status: "active",
    last_tested_at: new Date().toISOString(),
  });
  if (insertError) {
    logger.error("create email account failed", { error: insertError, workspaceId: workspace.id });
    return { ok: false, test, error: GENERIC_ERROR };
  }

  try {
    await saveAccountSecrets(id, password, imapPassword);
  } catch (error) {
    logger.error("saving email account secrets failed", { error, accountId: id });
    await supabase.from("email_accounts").delete().eq("id", id);
    return { ok: false, test, error: GENERIC_ERROR };
  }

  logger.info("email account connected", { accountId: id, workspaceId: workspace.id, provider: v.provider });
  revalidatePath("/email-accounts");
  return { ok: true, id, test };
}

// Postal inbox: URL + API key, checked before saving. No SMTP / IMAP.
export async function createPostalAccount(input: unknown): Promise<ActionResult> {
  const { workspace } = await getCurrentWorkspace();

  const parsed = createPostalAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("email_accounts")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("email", v.email)
    .maybeSingle();
  if (existing) return { ok: false, fieldErrors: { email: ["This inbox is already connected."] } };

  const test = await testPostal({ apiUrl: v.apiUrl, apiKey: v.apiKey }, v.email);
  if (!connectionOk(test)) return { ok: false, test, error: connectionError(test) ?? undefined };

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
    provider: "postal",
    postal_server_id: serverId,
    smtp_host: null,
    smtp_port: null,
    smtp_username: null,
    daily_limit: v.dailyLimit,
    status: "active",
    last_tested_at: new Date().toISOString(),
  });
  if (insertError) {
    logger.error("create postal account failed", { error: insertError, workspaceId: workspace.id });
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

// Sends the "Check setup" test email (Postal inboxes). The page then watches
// for it to come back through the webhook and the route.
export async function checkPostalSetup(id: string): Promise<ActionResult> {
  const account = await getOwnedAccount(id);
  if (!account) return { ok: false, error: "Email account not found." };
  if (!isPostalInbox(account)) return { ok: false, error: "This is not a Postal inbox." };

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

  let test: ConnectionTestResult;
  try {
    if (isPostalInbox(account)) {
      test = await testPostal(await loadPostalConfig(account), account.email);
    } else {
      const config = await loadAccountConfig(account);
      test = await testConnection(config.smtp, config.imap);
    }
  } catch (error) {
    logger.error("email account test failed to run", { error, accountId: account.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  const ok = connectionOk(test);
  const supabase = await createClient();
  await supabase
    .from("email_accounts")
    .update({
      last_tested_at: new Date().toISOString(),
      last_error: ok ? null : connectionError(test),
      // A failed test marks the inbox as "error" so it stops sending.
      // A passing test only revives "error" inboxes; paused stays paused.
      status: ok ? (account.status === "error" ? "active" : account.status) : "error",
    })
    .eq("id", account.id);

  revalidatePath("/email-accounts");
  revalidatePath(`/email-accounts/${account.id}`);
  return { ok, test, error: ok ? undefined : (connectionError(test) ?? undefined) };
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

export async function updateEmailAccountPassword(id: string, input: unknown): Promise<ActionResult> {
  const account = await getOwnedAccount(id);
  if (!account) return { ok: false, error: "Email account not found." };

  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };

  if (isPostalInbox(account)) return updatePostalKey(account, parsed.data.password);
  if (!account.smtp_host || !account.smtp_port || !account.smtp_username) {
    return { ok: false, error: "This inbox has no SMTP settings." };
  }

  const password = normalizePassword(account.provider, parsed.data.password);
  const imapPassword = parsed.data.imapPassword
    ? normalizePassword(account.provider, parsed.data.imapPassword)
    : null;

  const smtp: ServerConfig = {
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_secure,
    username: account.smtp_username,
    password,
  };
  const imap: ServerConfig | null =
    account.imap_host && account.imap_port && account.imap_username
      ? {
          host: account.imap_host,
          port: account.imap_port,
          secure: account.imap_secure,
          username: account.imap_username,
          password: imapPassword ?? password,
        }
      : null;

  const test = await testConnection(smtp, imap);
  if (!connectionOk(test)) return { ok: false, test, error: connectionError(test) ?? undefined };

  try {
    await saveAccountSecrets(account.id, password, imapPassword);
  } catch (error) {
    logger.error("updating email account password failed", { error, accountId: account.id });
    return { ok: false, test, error: GENERIC_ERROR };
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

async function updatePostalKey(account: Tables<"email_accounts">, apiKey: string): Promise<ActionResult> {
  let test: ConnectionTestResult;
  try {
    const { apiUrl } = await loadPostalConfig(account).catch(async () => {
      // The old key can't be read; the URL is all we need.
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("postal_servers")
        .select("api_url")
        .eq("id", account.postal_server_id ?? "")
        .single();
      if (error) throw error;
      return { apiUrl: data.api_url };
    });
    test = await testPostal({ apiUrl, apiKey: apiKey.trim() }, account.email);
    if (!connectionOk(test)) return { ok: false, test, error: connectionError(test) ?? undefined };
    await savePostalKey(account.id, apiKey.trim());
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
    return { ok: false, error: "Fix the connection first: run a test or update the password." };
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
