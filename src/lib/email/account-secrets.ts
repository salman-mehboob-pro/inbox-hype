import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import type { PostalConfig } from "@/lib/postal/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import type { ServerConfig } from "./clients";

// Reads/writes encrypted inbox passwords. Uses the service role, so callers
// MUST check the user owns the account first (or run as a server job).
// A Postal inbox keeps its API key in the same column as an SMTP password
// (`smtp_password_enc`), encrypted for a different purpose so the two can't be mixed up.

const smtpContext = (accountId: string) => `${accountId}:smtp`;
const imapContext = (accountId: string) => `${accountId}:imap`;
const postalContext = (accountId: string) => `${accountId}:postal`;

export async function saveAccountSecrets(
  accountId: string,
  smtpPassword: string,
  imapPassword: string | null,
) {
  const key = serverEnv().ENCRYPTION_KEY;
  const { error } = await createAdminClient()
    .from("email_account_secrets")
    .upsert({
      email_account_id: accountId,
      smtp_password_enc: encryptSecret(smtpPassword, key, smtpContext(accountId)),
      imap_password_enc: imapPassword ? encryptSecret(imapPassword, key, imapContext(accountId)) : null,
    });
  if (error) throw error;
}

export async function savePostalKey(accountId: string, apiKey: string) {
  const { error } = await createAdminClient()
    .from("email_account_secrets")
    .upsert({
      email_account_id: accountId,
      smtp_password_enc: encryptSecret(apiKey, serverEnv().ENCRYPTION_KEY, postalContext(accountId)),
      imap_password_enc: null,
    });
  if (error) throw error;
}

type AccountConnectionFields = Pick<
  Tables<"email_accounts">,
  | "id"
  | "smtp_host"
  | "smtp_port"
  | "smtp_secure"
  | "smtp_username"
  | "imap_host"
  | "imap_port"
  | "imap_secure"
  | "imap_username"
>;

async function loadEncrypted(accountId: string) {
  const { data, error } = await createAdminClient()
    .from("email_account_secrets")
    .select("smtp_password_enc, imap_password_enc")
    .eq("email_account_id", accountId)
    .single();
  if (error) throw error;
  return data;
}

// SMTP / IMAP login of a normal inbox (not Postal).
export async function loadAccountConfig(
  account: AccountConnectionFields,
): Promise<{ smtp: ServerConfig; imap: ServerConfig | null }> {
  if (!account.smtp_host || !account.smtp_port || !account.smtp_username) {
    throw new Error("This inbox has no SMTP settings");
  }
  const data = await loadEncrypted(account.id);
  const key = serverEnv().ENCRYPTION_KEY;
  const smtpPassword = decryptSecret(data.smtp_password_enc, key, smtpContext(account.id));
  const imapPassword = data.imap_password_enc
    ? decryptSecret(data.imap_password_enc, key, imapContext(account.id))
    : smtpPassword;

  return {
    smtp: {
      host: account.smtp_host,
      port: account.smtp_port,
      secure: account.smtp_secure,
      username: account.smtp_username,
      password: smtpPassword,
    },
    imap:
      account.imap_host && account.imap_port && account.imap_username
        ? {
            host: account.imap_host,
            port: account.imap_port,
            secure: account.imap_secure,
            username: account.imap_username,
            password: imapPassword,
          }
        : null,
  };
}

// URL + API key of a Postal inbox.
export async function loadPostalConfig(
  account: Pick<Tables<"email_accounts">, "id" | "postal_server_id">,
): Promise<PostalConfig> {
  if (!account.postal_server_id) throw new Error("This inbox is not a Postal inbox");
  const [server, secrets] = await Promise.all([
    createAdminClient().from("postal_servers").select("api_url").eq("id", account.postal_server_id).single(),
    loadEncrypted(account.id),
  ]);
  if (server.error) throw server.error;
  return {
    apiUrl: server.data.api_url,
    apiKey: decryptSecret(secrets.smtp_password_enc, serverEnv().ENCRYPTION_KEY, postalContext(account.id)),
  };
}
