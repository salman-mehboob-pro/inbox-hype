import { splitQuotedText } from "./quote";

// Reading incoming mail (pure, no I/O): is it a real reply, an automatic
// reply (out of office) or a bounce report, and which of our emails is it about?

export type InboundKind = "reply" | "auto_reply" | "bounce" | "other";

// All message ids ("<abc@host>") found in the given header values, lower case,
// without duplicates, in order of appearance.
export function extractMessageIds(...values: Array<string | string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values.flat()) {
    if (!value) continue;
    for (const match of value.matchAll(/<[^<>\s]+>/g)) seen.add(match[0].toLowerCase());
  }
  return [...seen];
}

// A block of raw header lines (the top of a raw email) -> { "header-name": "value" }.
// Names in lower case, folded lines joined, a repeated header keeps its first value.
export function parseHeaderBlock(block: string | Uint8Array | null | undefined): Record<string, string> {
  const text = typeof block === "string" ? block : block ? new TextDecoder().decode(block) : "";
  const out: Record<string, string> = {};
  let current: string | null = null;
  let skip = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (/^[ \t]/.test(line)) {
      if (current && !skip) out[current] += ` ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) {
      current = null;
      continue;
    }
    current = line.slice(0, colon).trim().toLowerCase();
    skip = current in out;
    if (!skip) out[current] = line.slice(colon + 1).trim();
  }
  return out;
}

export function isMailerDaemon(address: string | null | undefined): boolean {
  if (!address) return false;
  const local = address.split("@")[0]?.toLowerCase() ?? "";
  return /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon)$/.test(local);
}

const AUTO_SUBJECT_RE =
  /^\s*(auto(matic)?[\s:-]*(reply|response|respond)|autoreply|auto:|out of (the )?office|vacation (reply|response)|away from (the )?office|abwesenheit|absence)/i;

// "Out of office" and similar. These must not stop a sequence: the person has
// not really answered.
export function isAutoReply(headers: Record<string, string>, subject: string): boolean {
  const autoSubmitted = headers["auto-submitted"]?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headers["x-autoreply"] || headers["x-autorespond"]) return true;
  if (/^(bulk|junk|auto_reply)$/i.test(headers["precedence"]?.trim() ?? "")) return true;
  return AUTO_SUBJECT_RE.test(subject);
}

export type DeliveryReport = {
  // true = permanent failure (5.x.x). false = delayed / temporary.
  hard: boolean;
  // The address that could not be reached.
  recipient: string | null;
  status: string | null;
  // Message ids of the original email, quoted inside the report.
  originalMessageIds: string[];
};

const EMAIL_IN_TEXT = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

// Reads a bounce message (RFC 3464 delivery status report). `raw` is the whole
// message source. Returns null when it is not a failure we can act on.
export function parseDeliveryReport(raw: string): DeliveryReport | null {
  const field = (name: string) =>
    new RegExp(`^${name}:[ \\t]*(.+)$`, "im").exec(raw)?.[1]?.trim() ?? null;

  const action = field("Action")?.toLowerCase() ?? null;
  const status = /^Status:[ \t]*(\d\.\d{1,3}\.\d{1,3})/im.exec(raw)?.[1] ?? null;
  const finalRecipient = field("Final-Recipient") ?? field("Original-Recipient");
  let recipient = finalRecipient ? (EMAIL_IN_TEXT.exec(finalRecipient)?.[0] ?? null) : null;

  // Not every server sends the machine-readable part. Fall back to the text.
  if (!recipient) {
    const text = /(?:delivered to|delivery to the following recipient|couldn't be delivered to|wasn't delivered to)[^A-Za-z0-9<]*<?([^\s<>]+@[^\s<>,;:]+)/i.exec(raw);
    recipient = text?.[1]?.replace(/[.,;:]+$/, "") ?? null;
  }

  let hard: boolean;
  if (status) hard = status.startsWith("5");
  else if (action) hard = action === "failed";
  else hard = /\b5\.\d{1,3}\.\d{1,3}\b/.test(raw) && !/\b4\.\d{1,3}\.\d{1,3}\b/.test(raw);

  if (action === "delayed" || action === "delivered" || action === "relayed" || action === "expanded") return null;
  if (!recipient && !status && !action) return null;

  // Every Message-ID header in the report: the report's own and the quoted original's.
  const ids = [...raw.matchAll(/^Message-ID:[ \t]*(<[^<>\s]+>)/gim)].map((m) => m[1].toLowerCase());
  return { hard, recipient: recipient?.toLowerCase() ?? null, status, originalMessageIds: [...new Set(ids)] };
}

export type InboundInput = {
  fromAddress: string | null;
  subject: string;
  // Header names in lower case. Values as plain strings.
  headers: Record<string, string>;
  // Whole message source, only needed for bounce detection.
  raw: string;
};

export type InboundClass =
  | { kind: "reply" }
  | { kind: "auto_reply" }
  | { kind: "bounce"; report: DeliveryReport }
  // A report we ignore (delayed delivery, unreadable ...).
  | { kind: "other" };

export function classifyInbound(input: InboundInput): InboundClass {
  const contentType = input.headers["content-type"]?.toLowerCase() ?? "";
  const looksLikeReport =
    isMailerDaemon(input.fromAddress) ||
    contentType.includes("report-type=delivery-status") ||
    /^(delivery status notification|undeliverable|returned mail|mail delivery (failed|failure)|failure notice)/i.test(input.subject.trim());

  if (looksLikeReport) {
    const report = parseDeliveryReport(input.raw);
    if (report?.hard) return { kind: "bounce", report };
    return { kind: "other" };
  }

  if (isAutoReply(input.headers, input.subject)) return { kind: "auto_reply" };
  return { kind: "reply" };
}

// The visible start of a message: first lines of the text, quotes removed.
export function snippet(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  // The new text only: older quoted messages are cut off (see quote.ts).
  const body = splitQuotedText(text)
    .main.split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
  return body.length > max ? `${body.slice(0, max - 1)}…` : body;
}
