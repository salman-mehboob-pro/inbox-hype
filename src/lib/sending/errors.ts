import { BlockedHostError } from "@/lib/email/host-guard";
import { PostalApiError } from "@/lib/postal/core";

// What to do when sending an email failed (pure, no I/O).
//
// The one rule that matters: we never send twice. A failure only becomes
// "release" (try again later) when we KNOW Postal did not take the email. When
// we can't be sure (no clear answer after the request was sent), the email is
// marked failed and never retried.

// The inbox's saved API key could not be read (missing, or the encryption key changed).
export class InboxConfigError extends Error {}

export type InboxEffect =
  // The inbox can't be used until the user fixes it (wrong API key ...).
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
  // Short, safe to store and show. Never contains secrets.
  message: string;
};

const QUOTA_RE = /daily (user )?(sending )?(limit|quota)|sending (limit|quota)|quota exceeded|rate limit|too many (messages|emails)/i;

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

  // Anything else: we can't tell what happened, so we do not retry.
  const text = oneLine(String((err as { message?: unknown } | null)?.message ?? err ?? "Unknown error"));
  return { mode: "fail", countAttempt: false, retryInSeconds: 0, inbox: null, message: `Delivery unknown: ${text}` };
}

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
