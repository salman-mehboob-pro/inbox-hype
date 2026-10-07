import "server-only";
import { logger } from "@/lib/logger";
import { postalCheckSender, type PostalConfig } from "@/lib/postal/client";
import { friendlyPostalError } from "@/lib/postal/core";
import { createImapClient, createSmtpTransport, type ServerConfig } from "./clients";
import { BlockedHostError } from "./host-guard";

export type CheckResult = { ok: true } | { ok: false; error: string };

export type ConnectionTestResult = {
  // How emails are sent. `smtp` holds that check's result in both cases.
  via?: "smtp" | "postal";
  smtp: CheckResult;
  imap: CheckResult | null; // null = IMAP not used (e.g. Postal)
};

type ErrorLike = { code?: string; responseCode?: number; authenticationFailed?: boolean; message?: string };

// Turns library errors into short, plain messages for the user.
export function friendlyError(kind: "SMTP" | "IMAP", err: unknown): string {
  if (err instanceof BlockedHostError) return err.message;
  const e = (err ?? {}) as ErrorLike;
  const code = e.code ?? "";
  const msg = e.message ?? "";

  if (code === "EAUTH" || e.authenticationFailed || e.responseCode === 535 || /auth|credentials|login/i.test(msg)) {
    return `${kind}: login failed. Check the email/username and the app password.`;
  }
  if (code === "ENOTFOUND" || code === "EDNS") return `${kind}: server not found. Check the host name.`;
  if (code === "ECONNREFUSED") return `${kind}: the server refused the connection. Check the port.`;
  if (code === "ETIMEDOUT" || code === "CONNECT_TIMEOUT" || code === "GREETING_TIMEOUT" || /timed? ?out/i.test(msg)) {
    return `${kind}: no answer from the server (timeout). Check the host, port and SSL setting.`;
  }
  if (code === "ESOCKET" || /certificate|ssl|tls|wrong version number/i.test(msg)) {
    return `${kind}: secure connection failed. Check the port and SSL/STARTTLS setting.`;
  }
  return `${kind}: connection failed (${code || msg || "unknown error"}).`;
}

export async function testSmtp(config: ServerConfig): Promise<CheckResult> {
  let transport: Awaited<ReturnType<typeof createSmtpTransport>> | undefined;
  try {
    transport = await createSmtpTransport(config);
    await transport.verify();
    return { ok: true };
  } catch (err) {
    logger.warn("smtp test failed", { host: config.host, port: config.port, error: err });
    return { ok: false, error: friendlyError("SMTP", err) };
  } finally {
    transport?.close();
  }
}

export async function testImap(config: ServerConfig): Promise<CheckResult> {
  let client: Awaited<ReturnType<typeof createImapClient>> | undefined;
  try {
    client = await createImapClient(config);
    client.on("error", () => {
      // Handled by the awaited calls; prevents an unhandled 'error' event crash.
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
    await client.logout();
    return { ok: true };
  } catch (err) {
    logger.warn("imap test failed", { host: config.host, port: config.port, error: err });
    client?.close();
    return { ok: false, error: friendlyError("IMAP", err) };
  }
}

export async function testConnection(
  smtp: ServerConfig,
  imap: ServerConfig | null,
): Promise<ConnectionTestResult> {
  const [smtpResult, imapResult] = await Promise.all([
    testSmtp(smtp),
    imap ? testImap(imap) : Promise.resolve(null),
  ]);
  return { smtp: smtpResult, imap: imapResult };
}

// Postal: checks the URL, the API key and that Postal may send from this
// address (its domain is set up in Postal), without sending an email.
export async function testPostal(config: PostalConfig, fromEmail: string): Promise<ConnectionTestResult> {
  try {
    await postalCheckSender(config, fromEmail);
    return { via: "postal", smtp: { ok: true }, imap: null };
  } catch (err) {
    logger.warn("postal test failed", { apiUrl: config.apiUrl, error: err });
    return { via: "postal", smtp: { ok: false, error: friendlyPostalError(err) }, imap: null };
  }
}

export function connectionOk(result: ConnectionTestResult): boolean {
  return result.smtp.ok && (result.imap === null || result.imap.ok);
}

export function connectionError(result: ConnectionTestResult): string | null {
  const errors = [result.smtp, result.imap]
    .filter((r): r is { ok: false; error: string } => r !== null && !r.ok)
    .map((r) => r.error);
  return errors.length ? errors.join(" ") : null;
}
