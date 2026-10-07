import { BlockedHostError } from "@/lib/email/host-guard";
import { PostalApiError } from "@/lib/postal/core";

// What to do when sending an email failed (pure, no I/O).
//
// The one rule that matters: we never send twice. A failure only becomes
// "release" (try again later) when we KNOW the email was not accepted by the
// mail server. When we can't be sure (connection lost while sending), the
// email is marked failed and never retried.

// The inbox's saved login could not be read (missing, or the encryption key changed).
export class InboxConfigError extends Error {}

export type InboxEffect =
  // The inbox can't be used until the user fixes it (login failed ...).
  | { action: "error"; reason: string }
  // The inbox is fine but must rest for a while (limit reached, server busy ...).
  | { action: "backoff"; seconds: number; reason: string };

export type SendFailure = {
  // release = not sent, try again later; fail = give up on this lead;
  // bounce = the address was rejected (lead bounced + suppressed).
  mode: "release" | "fail" | "bounce";
  // For "release": does it use up one of the lead's 5 attempts?
  // (Inbox problems must not.)
  countAttempt: boolean;
  retryInSeconds: number;
  inbox: InboxEffect | null;
  // Short, safe to store and show. Never contains passwords.
  message: string;
};

type SmtpError = {
  code?: unknown;
  command?: unknown;
  response?: unknown;
  responseCode?: unknown;
  rejected?: unknown;
  message?: unknown;
};

// Steps before the message body is sent. A failure here means nothing was delivered.
const BEFORE_DATA = new Set(["CONN", "EHLO", "HELO", "STARTTLS", "MAIL FROM", "RCPT TO", "API"]);
const CONNECTION_CODES = new Set([
  "ECONNECTION",
  "ETIMEDOUT",
  "ESOCKET",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EDNS",
  "ETLS",
  "EREQUIRETLS",
  "EPROTOCOL",
]);
const QUOTA_RE =
  /daily (user )?(sending )?(limit|quota)|sending (limit|quota)|quota exceeded|rate limit|too many (messages|emails)|\b5\.4\.5\b/i;
const POLICY_RE = /relay|\b5\.7\.\d+\b|policy|blocked|blacklist|blocklist|spam|denied/i;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);

export function classifySendError(err: unknown): SendFailure {
  if (err instanceof InboxConfigError) {
    return {
      mode: "release",
      countAttempt: false,
      retryInSeconds: 300,
      inbox: { action: "error", reason: err.message },
      message: err.message,
    };
  }

  if (err instanceof BlockedHostError) {
    return {
      mode: "release",
      countAttempt: false,
      retryInSeconds: 300,
      inbox: { action: "backoff", seconds: 600, reason: err.message },
      message: err.message,
    };
  }

  if (err instanceof PostalApiError) return classifyPostalError(err);

  const e: SmtpError = typeof err === "object" && err !== null ? (err as SmtpError) : {};
  const code = typeof e.code === "string" ? e.code : "";
  const command = typeof e.command === "string" ? e.command : "";
  const rc = typeof e.responseCode === "number" ? e.responseCode : 0;
  const text = oneLine(String(e.response ?? e.message ?? "Unknown error"));
  const isRejectedRecipient =
    command === "RCPT TO" ||
    (code === "EENVELOPE" && Array.isArray(e.rejected) && e.rejected.length > 0) ||
    (code === "EENVELOPE" && command === "API" && /recipient/i.test(text));

  // 1. Login problems: the inbox is unusable until the user fixes the password.
  if (code === "EAUTH" || command.startsWith("AUTH") || [530, 534, 535, 538].includes(rc)) {
    const reason = "The mail server rejected the inbox login. Check the app password.";
    return {
      mode: "release",
      countAttempt: false,
      retryInSeconds: 60,
      inbox: { action: "error", reason },
      message: reason,
    };
  }

  // 2. The inbox reached its sending limit at the provider: let it rest.
  if (QUOTA_RE.test(text)) {
    const reason = `The inbox hit its provider sending limit: ${text}`;
    return {
      mode: "release",
      countAttempt: false,
      retryInSeconds: 3600,
      inbox: { action: "backoff", seconds: 4 * 3600, reason },
      message: reason,
    };
  }

  // 3. Connection problems.
  if (CONNECTION_CODES.has(code)) {
    if (!command || BEFORE_DATA.has(command)) {
      const reason = `Could not connect to the mail server: ${text}`;
      return {
        mode: "release",
        countAttempt: false,
        retryInSeconds: 120,
        inbox: { action: "backoff", seconds: 600, reason },
        message: reason,
      };
    }
    // The connection died while the message was being sent: it may have gone out.
    return {
      mode: "fail",
      countAttempt: false,
      retryInSeconds: 0,
      inbox: null,
      message: `Connection lost while sending. The email may or may not have been delivered: ${text}`,
    };
  }

  // 4. The recipient address was rejected.
  if (isRejectedRecipient) {
    if (rc >= 400 && rc < 500) {
      return { mode: "release", countAttempt: true, retryInSeconds: 1800, inbox: null, message: `Recipient deferred: ${text}` };
    }
    if (POLICY_RE.test(text)) {
      return { mode: "fail", countAttempt: false, retryInSeconds: 0, inbox: null, message: `Refused by the mail server: ${text}` };
    }
    return { mode: "bounce", countAttempt: false, retryInSeconds: 0, inbox: null, message: `Address rejected: ${text}` };
  }

  // 5. The server refused the sender address: an inbox problem.
  if (command === "MAIL FROM" && rc >= 500) {
    const reason = `The mail server refused the sender address: ${text}`;
    return {
      mode: "release",
      countAttempt: false,
      retryInSeconds: 300,
      inbox: { action: "error", reason },
      message: reason,
    };
  }

  // 6. Temporary problem on the server's side.
  if (rc >= 400 && rc < 500) {
    return {
      mode: "release",
      countAttempt: true,
      retryInSeconds: 1800,
      inbox: { action: "backoff", seconds: 900, reason: `The mail server is busy: ${text}` },
      message: `Temporary error: ${text}`,
    };
  }

  // 7. The server refused the message itself (spam filter, content ...). Retrying won't help.
  if (rc >= 500) {
    return { mode: "fail", countAttempt: false, retryInSeconds: 0, inbox: null, message: `Refused by the mail server: ${text}` };
  }

  // 8. Anything else: we can't tell what happened, so we do not retry.
  return {
    mode: "fail",
    countAttempt: false,
    retryInSeconds: 0,
    inbox: null,
    message: `Delivery unknown: ${text}`,
  };
}

// Postal HTTP API. Same rule: only retry when Postal surely did not take the email.
function classifyPostalError(err: PostalApiError): SendFailure {
  const text = oneLine(err.message);

  if (err.phase === "connect") {
    const reason = `Could not reach the Postal server: ${text}`;
    return {
      mode: "release",
      countAttempt: false,
      retryInSeconds: 120,
      inbox: { action: "backoff", seconds: 600, reason },
      message: reason,
    };
  }
  if (err.phase === "unknown") {
    return {
      mode: "fail",
      countAttempt: false,
      retryInSeconds: 0,
      inbox: null,
      message: `No clear answer from Postal. The email may or may not have been sent: ${text}`,
    };
  }

  // Postal answered with an error: the email was not accepted.
  const inboxError = (reason: string): SendFailure => ({
    mode: "release",
    countAttempt: false,
    retryInSeconds: 300,
    inbox: { action: "error", reason },
    message: reason,
  });
  switch (err.code) {
    case "InvalidServerAPIKey":
    case "AccessDenied":
      return inboxError("Postal rejected the API key. Update the API key on the inbox page.");
    case "ServerSuspended":
      return inboxError("The Postal mail server is suspended.");
    case "UnauthenticatedFromAddress":
      return inboxError("Postal does not allow sending from this address. Add and verify its domain in Postal.");
  }
  if (err.httpStatus === 429 || QUOTA_RE.test(text)) {
    const reason = `Postal sending limit reached: ${text}`;
    return {
      mode: "release",
      countAttempt: false,
      retryInSeconds: 3600,
      inbox: { action: "backoff", seconds: 3600, reason },
      message: reason,
    };
  }
  return { mode: "fail", countAttempt: false, retryInSeconds: 0, inbox: null, message: `Postal refused the email: ${text}` };
}
