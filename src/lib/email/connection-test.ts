import "server-only";
import { logger } from "@/lib/logger";
import { postalCheckSender, type PostalConfig } from "@/lib/postal/client";
import { friendlyPostalError } from "@/lib/postal/core";

export type CheckResult = { ok: true } | { ok: false; error: string };

// Postal: checks the URL, the API key and that Postal may send from this
// address (its domain is set up in Postal), without sending an email.
export async function testPostal(config: PostalConfig, fromEmail: string): Promise<CheckResult> {
  try {
    await postalCheckSender(config, fromEmail);
    return { ok: true };
  } catch (err) {
    logger.warn("postal test failed", { apiUrl: config.apiUrl, error: err });
    return { ok: false, error: friendlyPostalError(err) };
  }
}
