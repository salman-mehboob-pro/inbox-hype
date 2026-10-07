import "server-only";
import https from "node:https";
import { isIP } from "node:net";
import { resolvePublicHost } from "@/lib/email/host-guard";
import { PostalApiError, readPostalAnswer, readSendResult } from "./core";

// Talks to a Postal server's HTTP API. HTTPS only, and like SMTP/IMAP the host
// must resolve to a public address (we connect to the address we checked).

const TIMEOUT_MS = 30_000;
const MAX_ANSWER_BYTES = 1_000_000;

export type PostalConfig = { apiUrl: string; apiKey: string };

async function postalRequest(config: PostalConfig, path: string, body: unknown): Promise<unknown> {
  const url = new URL(path, config.apiUrl);
  const ip = await resolvePublicHost(url.hostname);
  const family = isIP(ip);
  const payload = Buffer.from(JSON.stringify(body));

  return new Promise((resolve, reject) => {
    // "sent" = the whole request was handed to the network. A failure after
    // that point means Postal may have accepted the email.
    let sent = false;
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "POST",
        // Use the address we checked, never a second DNS answer.
        lookup: (_host, options, callback) => {
          if ((options as { all?: boolean }).all) {
            (callback as (err: null, addresses: { address: string; family: number }[]) => void)(null, [
              { address: ip, family },
            ]);
          } else {
            callback(null, ip, family);
          }
        },
        minVersion: "TLSv1.2",
        timeout: TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": payload.length,
          "X-Server-API-Key": config.apiKey,
          "User-Agent": "InboxHype",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= MAX_ANSWER_BYTES) chunks.push(chunk);
        });
        res.on("end", () => {
          try {
            resolve(readPostalAnswer(res.statusCode ?? 0, Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
        res.on("error", (error) => reject(new PostalApiError("unknown", `Connection lost: ${error.message}`)));
      },
    );
    req.on("finish", () => {
      sent = true;
    });
    req.on("timeout", () => req.destroy(new Error(`no answer within ${TIMEOUT_MS / 1000} s`)));
    req.on("error", (error) =>
      reject(
        new PostalApiError(
          sent ? "unknown" : "connect",
          sent ? `No answer from Postal after sending: ${error.message}` : `Could not connect: ${error.message}`,
        ),
      ),
    );
    req.end(payload);
  });
}

// Sends one ready-made email (the whole raw message, like SMTP would).
export async function postalSendRaw(
  config: PostalConfig,
  args: { mailFrom: string; rcptTo: string; raw: Buffer },
): Promise<{ messageId: string | null; postalId: string | null }> {
  const data = await postalRequest(config, "/api/v1/send/raw", {
    mail_from: args.mailFrom,
    rcpt_to: [args.rcptTo],
    data: args.raw.toString("base64"),
  });
  return readSendResult(data, args.rcptTo);
}

// Checks the URL, the API key AND that Postal may send from this address,
// WITHOUT sending anything: a raw message with zero recipients. Postal checks
// the key ("InvalidServerAPIKey") and the From domain ("UnauthenticatedFromAddress")
// first, then queues one copy per recipient, so nothing goes out.
export async function postalCheckSender(config: PostalConfig, fromEmail: string): Promise<void> {
  const raw = `From: ${fromEmail}\r\nTo: ${fromEmail}\r\nSubject: InboxHype connection check\r\n\r\nNot sent.\r\n`;
  const data = await postalRequest(config, "/api/v1/send/raw", {
    mail_from: fromEmail,
    rcpt_to: [],
    data: Buffer.from(raw).toString("base64"),
  });
  if (readSendResult(data, fromEmail).postalId !== null) {
    throw new PostalApiError("response", "Postal queued the connection check. Please report this.");
  }
}
