import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import type { PostalConfig } from "@/lib/postal/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";

// Reads/writes an inbox's encrypted Postal API key (`email_account_secrets.api_key_enc`).
// Uses the service role, so callers MUST check the user owns the account first
// (or run as a server job).

const postalContext = (accountId: string) => `${accountId}:postal`;

export async function savePostalKey(accountId: string, apiKey: string) {
  const { error } = await createAdminClient()
    .from("email_account_secrets")
    .upsert({
      email_account_id: accountId,
      api_key_enc: encryptSecret(apiKey, serverEnv().ENCRYPTION_KEY, postalContext(accountId)),
    });
  if (error) throw error;
}

// URL + API key of a Postal inbox.
export async function loadPostalConfig(
  account: Pick<Tables<"email_accounts">, "id" | "postal_server_id">,
): Promise<PostalConfig> {
  const admin = createAdminClient();
  const [server, secrets] = await Promise.all([
    admin.from("postal_servers").select("api_url").eq("id", account.postal_server_id).single(),
    admin.from("email_account_secrets").select("api_key_enc").eq("email_account_id", account.id).single(),
  ]);
  if (server.error) throw server.error;
  if (secrets.error) throw secrets.error;
  return {
    apiUrl: server.data.api_url,
    apiKey: decryptSecret(secrets.data.api_key_enc, serverEnv().ENCRYPTION_KEY, postalContext(account.id)),
  };
}
