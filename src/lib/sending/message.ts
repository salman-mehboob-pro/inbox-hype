import { randomUUID } from "node:crypto";
import { convert } from "html-to-text";
import { escapeHtml, looksLikeHtml, render, textToHtml, type TemplateLead } from "@/lib/email/template";
import { addOpenPixel, openPixelUrl, rewriteLinks, trackedLinkUrl } from "./tracking";

// Builds the email that one lead receives (pure, no I/O).
//   subject + body -> variables + spin text -> safe HTML + plain-text part.

// Entities --------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  colon: ":",
  tab: "\t",
  newline: "\n",
  nbsp: " ",
};

// Decodes the entities a browser would decode inside a URL, so
// "java&#115;cript:" can't hide from the check below.
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

// Links --------------------------------------------------------------------------

// A link value we are willing to send, or null. Only http(s), mailto and tel
// are allowed (a `{{website}}` value could be anything, including javascript:).
// "example.com" gets https:// in front, because a bare name would be a broken link.
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  const decoded = decodeEntities(value).replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!decoded || decoded.startsWith("//") || decoded.startsWith("#")) return null;

  // "www.example.com:8080/path" looks like a scheme, but it is a host with a port.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+:\d/i.test(decoded)) return `https://${value}`;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(decoded);
  if (scheme) return /^(https?|mailto|tel)$/i.test(scheme[1]) ? value : null;

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]|$)/i.test(decoded)) return `https://${value}`;
  return null;
}

// Only http(s) images (no data:, no javascript:).
function safeImageSrc(raw: string): string | null {
  const decoded = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]/g, "");
  return /^https?:\/\//i.test(decoded) ? raw.trim() : null;
}

// Tags + attributes ---------------------------------------------------------------

const TAG_RE = /<([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttributes(source: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of source.matchAll(ATTR_RE)) {
    out.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? ""]);
  }
  return out;
}

const quote = (value: string) => value.replace(/"/g, "&quot;");

const URL_ATTRIBUTES = new Set(["href", "src", "background", "action", "formaction", "xlink:href", "poster"]);

function cleanTag(name: string, attributeSource: string): string {
  const tag = name.toLowerCase();
  const selfClosing = /\/\s*$/.test(attributeSource);
  const kept: string[] = [];

  for (const [attr, value] of parseAttributes(attributeSource)) {
    if (attr.startsWith("on")) continue; // onclick, onerror ...
    if (tag === "a") {
      if (attr === "href") {
        const href = safeHref(value);
        if (href) kept.push(`href="${quote(href)}"`);
      } else if (attr === "style" || attr === "title") {
        kept.push(`${attr}="${quote(value)}"`); // no target / rel: we don't want them in emails
      }
      continue;
    }
    if (tag === "img" && attr === "src") {
      const src = safeImageSrc(value);
      if (!src) return ""; // an image we can't load is dropped
      kept.push(`src="${quote(src)}"`);
      continue;
    }
    if (URL_ATTRIBUTES.has(attr)) {
      const decoded = decodeEntities(value).replace(/[\u0000- \u007f-\u009f]/g, "");
      if (/^(javascript|vbscript|data):/i.test(decoded)) continue;
    }
    kept.push(`${attr}="${quote(value)}"`);
  }

  return `<${tag}${kept.length ? " " + kept.join(" ") : ""}${selfClosing ? " /" : ""}>`;
}

// Removes scripts and other active content, event handlers and unsafe links.
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|applet|base)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|iframe|object|embed|applet|base)\b[^>]*>/gi, "")
    .replace(TAG_RE, (_m, name: string, attributes: string) => cleanTag(name, attributes));
}

// Plain text ------------------------------------------------------------------------

export function htmlToPlainText(html: string): string {
  const withoutHead = html
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return convert(withoutHead, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  }).trim();
}

// Subject + headers ----------------------------------------------------------------

export function reSubject(subject: string): string {
  const s = subject.trim();
  if (!s) return "";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

// A Message-ID that belongs to the sending inbox's domain.
export function makeMessageId(fromEmail: string): string {
  const domain = fromEmail.split("@")[1]?.toLowerCase().replace(/[^a-z0-9.-]/g, "") || "inboxhype.local";
  return `<${randomUUID()}@${domain}>`;
}

// In-Reply-To + References for a follow-up that continues the thread.
export function threadHeaders(
  priorMessageIds: string[],
  inThread: boolean,
): { inReplyTo: string; references: string } | null {
  if (!inThread || priorMessageIds.length === 0) return null;
  return {
    inReplyTo: priorMessageIds[priorMessageIds.length - 1],
    references: priorMessageIds.slice(-10).join(" "),
  };
}

export function unsubscribeUrl(appUrl: string, sentMessageId: string): string {
  return `${appUrl.replace(/\/+$/, "")}/u/${sentMessageId}`;
}

// The whole message ----------------------------------------------------------------

export type BuildMessageInput = {
  step: { position: number; subject: string; body: string; body_format: string };
  lead: TemplateLead;
  account: { email: string; from_name: string; signature: string };
  // Makes spin text stable: the same lead + step always renders the same email.
  seed: string;
  // Rendered subject of step 1, for follow-ups whose own subject is empty ("Re: ...").
  threadSubject?: string | null;
  // Unsubscribe link for the footer; null = no footer.
  unsubscribeUrl?: string | null;
  // Open / click tracking (campaign options). null = off.
  tracking?: {
    appUrl: string;
    sentMessageId: string;
    opens: boolean;
    clicks: boolean;
    // Signs a link so the click route accepts it (see tracking.ts).
    sign: (url: string) => string;
  } | null;
};

export type BuiltMessage = {
  subject: string;
  html: string;
  text: string;
  // Variables that had no value and no fallback (sent as empty).
  missing: string[];
  // True when this email continues the lead's first email's thread.
  inThread: boolean;
};

function appendHtml(html: string, fragment: string): string {
  const close = html.search(/<\/body\s*>/i);
  return close === -1 ? html + fragment : html.slice(0, close) + fragment + html.slice(close);
}

export function buildMessage(input: BuildMessageInput): BuiltMessage {
  const { step, lead, account, seed } = input;
  const sender = { name: account.from_name, email: account.email };
  const missing = new Set<string>();

  // Subject. A follow-up with an empty subject replies in the same thread.
  const replyInThread = step.position > 1 && !step.subject.trim();
  let subject: string;
  if (replyInThread) {
    subject = reSubject(input.threadSubject ?? "");
  } else {
    const rendered = render(step.subject, lead, sender, `${seed}:subject`);
    rendered.missing.forEach((m) => missing.add(m));
    subject = rendered.text.replace(/\s+/g, " ").trim();
  }

  // Body: the editor and pasted HTML are HTML already; old bodies are plain text.
  const source = step.body_format === "html" || looksLikeHtml(step.body) ? step.body : textToHtml(step.body);
  const renderedBody = render(source, lead, sender, `${seed}:body`, { html: true });
  renderedBody.missing.forEach((m) => missing.add(m));
  const body = sanitizeEmailHtml(renderedBody.text);

  // Everything after the body: signature (plain text typed in the inbox settings,
  // may use variables) and the unsubscribe footer.
  let tail = "";
  if (account.signature.trim()) {
    const sig = render(account.signature, lead, sender, `${seed}:signature`);
    sig.missing.forEach((m) => missing.add(m));
    const sigHtml = escapeHtml(sig.text.trim()).replace(/\r?\n/g, "<br>");
    tail += `<div style="margin-top:16px">${sigHtml}</div>`;
  }
  if (input.unsubscribeUrl) {
    const url = quote(input.unsubscribeUrl);
    tail += `<p style="margin-top:24px;font-size:12px;color:#6b7280">Not interested? <a href="${url}">Unsubscribe</a></p>`;
  }

  const assemble = (bodyHtml: string) => {
    const withTail = appendHtml(bodyHtml, tail);
    return /<html[\s>]/i.test(withTail)
      ? withTail
      : `<!doctype html><html><head><meta charset="utf-8"></head><body>${withTail}</body></html>`;
  };

  // The plain-text part keeps the real links (it is not tracked).
  const text = htmlToPlainText(assemble(body));

  // The HTML part: links go through our click route when "track clicks" is on
  // (the unsubscribe link is added after, so it is never rewritten), and a 1x1
  // image is added when "track opens" is on.
  const tracking = input.tracking;
  let trackedBody = body;
  if (tracking?.clicks) {
    trackedBody = rewriteLinks(body, (url) =>
      url.startsWith(tracking.appUrl.replace(/\/+$/, "") + "/")
        ? null
        : trackedLinkUrl(tracking.appUrl, tracking.sentMessageId, url, tracking.sign(url)),
    );
  }
  let html = assemble(trackedBody);
  if (tracking?.opens) html = addOpenPixel(html, openPixelUrl(tracking.appUrl, tracking.sentMessageId));

  return {
    subject,
    html,
    text,
    missing: [...missing],
    inThread: replyInThread && subject !== "",
  };
}
