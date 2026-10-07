import { z } from "zod";

// Postal (pure, no I/O): URL checks, API answers, webhook payloads.
//
// Postal is a self-hosted mail server. We send through its HTTP API
// (POST /api/v1/send/raw with the X-Server-API-Key header), and it tells us
// back through two URLs the user pastes into Postal once:
//   - a webhook  (/api/postal/webhook/<token>): what happened to emails we sent
//   - a route    (/api/postal/inbound/<token>): emails sent to us (replies)

// URLs -----------------------------------------------------------------------------

// "postal.example.com", "https://postal.example.com/org/x" -> "https://postal.example.com".
// Only https; the path is dropped (the API lives at the root). null = not valid.
export function normalizePostalUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return url.port ? `https://${host}:${url.port}` : `https://${host}`;
}

export function postalWebhookUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/postal/webhook/${token}`;
}

export function postalInboundUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/postal/inbound/${token}`;
}

// Tokens are 43 url-safe characters (32 random bytes).
export function isHookToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,100}$/.test(value);
}

// "<abc@host>" in lower case, from "abc@host" or "<abc@host>". null if empty.
export function normalizeMessageId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/^<|>$/g, "").trim().toLowerCase();
  return v && !/[\s<>]/.test(v) ? `<${v}>` : null;
}

// API errors -------------------------------------------------------------------------

export type PostalErrorPhase =
  // Could not reach Postal, nothing was sent.
  | "connect"
  // The request went out but no clear answer came back: it may have been accepted.
  | "unknown"
  // Postal answered with an error.
  | "response";

export class PostalApiError extends Error {
  constructor(
    readonly phase: PostalErrorPhase,
    message: string,
    readonly httpStatus: number | null = null,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "PostalApiError";
  }
}

const apiAnswer = z.object({
  status: z.string(),
  data: z.unknown().optional(),
});

const errorData = z.object({ code: z.string().optional(), message: z.string().optional() }).loose();

// Reads a Postal API answer. Returns `data` on success, throws PostalApiError otherwise.
export function readPostalAnswer(httpStatus: number, body: string): unknown {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  const parsed = apiAnswer.safeParse(json);
  if (!parsed.success) {
    // 502 / 503: a proxy in front of Postal answered, Postal never saw the request.
    const phase = httpStatus === 502 || httpStatus === 503 ? "connect" : httpStatus >= 200 && httpStatus < 300 ? "unknown" : "response";
    throw new PostalApiError(phase, `Postal gave an unexpected answer (HTTP ${httpStatus}).`, httpStatus);
  }
  if (parsed.data.status === "success") return parsed.data.data;

  const data = errorData.safeParse(parsed.data.data ?? {});
  const code = data.success ? (data.data.code ?? null) : null;
  const message = (data.success ? data.data.message : undefined) ?? code ?? parsed.data.status;
  throw new PostalApiError("response", message.replace(/\s+/g, " ").trim().slice(0, 300), httpStatus, code);
}

// The answer of /api/v1/send/raw: Postal's id for the message to this recipient.
const sendData = z.object({
  message_id: z.string().optional(),
  messages: z.record(z.string(), z.object({ id: z.union([z.number(), z.string()]) }).loose()).optional(),
});

export function readSendResult(data: unknown, recipient: string): { messageId: string | null; postalId: string | null } {
  const parsed = sendData.safeParse(data);
  if (!parsed.success) return { messageId: null, postalId: null };
  const messages = parsed.data.messages ?? {};
  const entry = messages[recipient] ?? messages[recipient.toLowerCase()] ?? Object.values(messages)[0];
  return {
    messageId: normalizeMessageId(parsed.data.message_id),
    postalId: entry ? String(entry.id) : null,
  };
}

// Plain-word message for the connection test.
export function friendlyPostalError(err: unknown): string {
  if (err instanceof PostalApiError) {
    if (err.code === "InvalidServerAPIKey" || err.code === "AccessDenied") {
      return "Postal: the API key was not accepted. Copy the key of an API credential (Postal → Credentials).";
    }
    if (err.code === "ServerSuspended") return "Postal: this mail server is suspended in Postal.";
    if (err.code === "UnauthenticatedFromAddress") {
      return "Postal: this email's domain is not set up on this Postal server. Add and verify the domain in Postal (Domains) first, or use an address on a verified domain.";
    }
    if (err.phase === "connect") return `Postal: could not reach the server. Check the URL. (${err.message})`;
    if (err.httpStatus === 404) return "Postal: no Postal API at this address. Check the URL (for example https://postal.example.com).";
    return `Postal: ${err.message}`;
  }
  return err instanceof Error ? `Postal: ${err.message}` : "Postal: connection failed.";
}

// Webhooks ---------------------------------------------------------------------------

const messageRef = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    message_id: z.string().nullish(),
    direction: z.string().nullish(),
    to: z.string().nullish(),
  })
  .loose();

export const webhookBody = z
  .object({
    event: z.string(),
    payload: z.record(z.string(), z.unknown()).nullish(),
  })
  .loose();

const deliveryPayload = z
  .object({
    message: messageRef,
    status: z.string().nullish(),
    details: z.string().nullish(),
    output: z.string().nullish(),
  })
  .loose();

const bouncePayload = z.object({ original_message: messageRef, bounce: messageRef.nullish() }).loose();

const dnsPayload = z
  .object({
    domain: z.string().nullish(),
    spf_status: z.string().nullish(),
    spf_error: z.string().nullish(),
    dkim_status: z.string().nullish(),
    dkim_error: z.string().nullish(),
    mx_status: z.string().nullish(),
    mx_error: z.string().nullish(),
    return_path_status: z.string().nullish(),
    return_path_error: z.string().nullish(),
  })
  .loose();

export type MessageRef = { postalId: string | null; messageId: string | null; to: string | null };

export type WebhookEvent =
  | { type: "sent"; message: MessageRef; detail: string }
  | { type: "delayed"; message: MessageRef; detail: string }
  | { type: "failed"; message: MessageRef; detail: string; addressProblem: boolean }
  | { type: "held"; message: MessageRef; detail: string }
  | { type: "bounced"; message: MessageRef; bounceId: string | null }
  | { type: "dns_error"; detail: string }
  // Incoming mail, events we don't use, or a payload we can't read.
  | { type: "ignored"; reason: string };

function ref(m: z.infer<typeof messageRef>): MessageRef {
  return {
    postalId: m.id === undefined ? null : String(m.id),
    messageId: normalizeMessageId(m.message_id),
    to: m.to?.trim().toLowerCase() || null,
  };
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 500);

// A permanent delivery failure is a bounce only when the ADDRESS is the problem
// (no such user, no such domain). When the receiving server refused us (spam
// filter, blocklist, policy) the lead is fine and must not be suppressed.
const ADDRESS_PROBLEM_RE =
  /\b5\.1\.\d{1,3}\b|\b5\.2\.1\b|user unknown|unknown user|no such (user|mailbox|recipient)|does not exist|doesn'?t exist|mailbox (unavailable|not found|disabled)|recipient (address )?rejected|invalid (recipient|mailbox|address)|address rejected|account (has been )?disabled|no mx|domain not found|host not found|nxdomain|unrouteable/i;
const POLICY_RE = /\b5\.7\.\d{1,3}\b|spam|blocked|block ?list|blacklist|policy|reputation|denied|not allowed|rejected for policy/i;

export function isAddressProblem(text: string): boolean {
  return ADDRESS_PROBLEM_RE.test(text) && !POLICY_RE.test(text);
}

export function parseWebhook(body: unknown): WebhookEvent {
  const parsed = webhookBody.safeParse(body);
  if (!parsed.success) return { type: "ignored", reason: "unreadable" };
  const { event } = parsed.data;
  const payload = parsed.data.payload ?? {};

  switch (event) {
    case "MessageSent":
    case "MessageDelayed":
    case "MessageDeliveryFailed":
    case "MessageHeld": {
      const p = deliveryPayload.safeParse(payload);
      if (!p.success) return { type: "ignored", reason: `${event}: unreadable payload` };
      // Postal also reports mail it delivered to OUR route (incoming): not ours to track.
      if (p.data.message.direction && p.data.message.direction !== "outgoing") {
        return { type: "ignored", reason: `${event}: ${p.data.message.direction}` };
      }
      const message = ref(p.data.message);
      const detail = oneLine([p.data.details, p.data.output].filter(Boolean).join(" · ") || p.data.status || event);
      if (event === "MessageSent") return { type: "sent", message, detail };
      if (event === "MessageDelayed") return { type: "delayed", message, detail };
      if (event === "MessageHeld") return { type: "held", message, detail };
      return { type: "failed", message, detail, addressProblem: isAddressProblem(detail) };
    }
    case "MessageBounced": {
      const p = bouncePayload.safeParse(payload);
      if (!p.success) return { type: "ignored", reason: "MessageBounced: unreadable payload" };
      const bounceId = p.data.bounce?.id;
      return {
        type: "bounced",
        message: ref(p.data.original_message),
        bounceId: bounceId === undefined ? null : String(bounceId),
      };
    }
    case "DomainDNSError": {
      const p = dnsPayload.safeParse(payload);
      if (!p.success) return { type: "ignored", reason: "DomainDNSError: unreadable payload" };
      const d = p.data;
      const problems = (
        [
          ["SPF", d.spf_status, d.spf_error],
          ["DKIM", d.dkim_status, d.dkim_error],
          ["MX", d.mx_status, d.mx_error],
          ["Return path", d.return_path_status, d.return_path_error],
        ] as const
      )
        .filter(([, status]) => status && status.toLowerCase() !== "ok")
        .map(([name, status, error]) => `${name}: ${error || status}`);
      return {
        type: "dns_error",
        detail: oneLine(`DNS problem on ${d.domain ?? "a domain"}${problems.length ? ` (${problems.join("; ")})` : ""}`),
      };
    }
    default:
      return { type: "ignored", reason: event };
  }
}

// Route (incoming mail) ---------------------------------------------------------------

const inboundBody = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    rcpt_to: z.string().nullish(),
    mail_from: z.string().nullish(),
    message: z.string().optional(),
    base64: z.boolean().optional(),
  })
  .loose();

export type InboundMail =
  | { ok: true; postalId: string | null; rcptTo: string | null; raw: Buffer }
  // The route sends the "hash" format (or something else): we need the raw message.
  | { ok: false; reason: string };

// Postal's HTTP endpoint with format "raw message": the whole email, base64.
export function readInboundMail(body: unknown): InboundMail {
  const parsed = inboundBody.safeParse(body);
  if (!parsed.success || typeof parsed.data.message !== "string" || !parsed.data.message) {
    return { ok: false, reason: "Not the raw message format. In Postal set the HTTP endpoint Format to \"Delivered as the raw message\"." };
  }
  const { message } = parsed.data;
  const raw = parsed.data.base64 === false ? Buffer.from(message, "utf8") : Buffer.from(message, "base64");
  if (raw.length === 0) return { ok: false, reason: "Empty message." };
  return {
    ok: true,
    postalId: parsed.data.id === undefined ? null : String(parsed.data.id),
    rcptTo: parsed.data.rcpt_to?.trim().toLowerCase() || null,
    raw,
  };
}
