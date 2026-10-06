import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import type { ServerConfig } from "./clients";

// Reads/writes encrypted inbox passwords. Uses the service role, so callers
// MUST check the user owns the account first (or run as a server job).

const smtpContext = (accountId: string) => `${accountId}:smtp`;
const imapContext = (accountId: string) => `${accountId}:imap`;

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

export async function loadAccountConfig(
  account: AccountConnectionFields,
): Promise<{ smtp: ServerConfig; imap: ServerConfig | null }> {
  const { data, error } = await createAdminClient()
    .from("email_account_secrets")
    .select("smtp_password_enc, imap_password_enc")
    .eq("email_account_id", account.id)
    .single();
  if (error) throw error;

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
