// Splits a reply into "what the person wrote" and "the quoted older messages"
// (pure, no I/O). The quoted part is hidden behind "Show quoted text".
//
// It only cuts at well-known markers (Gmail, Apple Mail, Outlook, plain-text
// "On ... wrote:"), and never when that would leave nothing visible.

export type SplitMessage = { main: string; quoted: string };

const hasVisibleText = (html: string) =>
  html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|\s/g, "")
    .length > 0;

// Where the quoted part of an HTML message starts.
const HTML_QUOTE_STARTS: RegExp[] = [
  /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>/i, // Gmail
  /<div\b[^>]*\bid\s*=\s*["']appendonsend["'][^>]*>/i, // Outlook on the web
  /<div\b[^>]*\bid\s*=\s*["']divRplyFwdMsg["'][^>]*>/i, // Outlook
  /<blockquote\b[^>]*>/i, // Apple Mail and most others
];

// "On Tue, Oct 6, 2026 at 5:13 PM Sam <sam@x.test> wrote:" right before a quote.
const ATTRIBUTION_AT_END = /<(div|p)\b[^>]*>(?:(?!<(?:div|p)\b)[\s\S])*?\bwrote:\s*(?:<br\s*\/?>\s*)*<\/\1>\s*$/i;

export function splitQuotedHtml(html: string): SplitMessage {
  let start = -1;
  for (const pattern of HTML_QUOTE_STARTS) {
    const index = html.search(pattern);
    if (index !== -1 && (start === -1 || index < start)) start = index;
  }
  if (start === -1) return { main: html, quoted: "" };

  let main = html.slice(0, start);
  let quoted = html.slice(start);

  // Move the "On ... wrote:" line (and an Outlook rule) into the quoted part.
  const attribution = ATTRIBUTION_AT_END.exec(main);
  if (attribution) {
    quoted = main.slice(attribution.index) + quoted;
    main = main.slice(0, attribution.index);
  }

  if (!hasVisibleText(main)) return { main: html, quoted: "" };
  return { main, quoted };
}

const TEXT_QUOTE_LINE = [
  /^On\s.+\swrote:\s*$/i, // "On Tue, Oct 6 ... wrote:"
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^_{10,}\s*$/, // Outlook rule before "From:"
  /^>/, // a block of quoted lines
];

export function splitQuotedText(text: string): SplitMessage {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const wrapped = /^On\s/i.test(line) && /(^|\s)wrote:\s*$/i.test(lines[i + 1]?.trim() ?? "");
    if (wrapped || TEXT_QUOTE_LINE.some((re) => re.test(line))) {
      start = i;
      break;
    }
  }
  if (start === -1) return { main: text, quoted: "" };

  const main = lines.slice(0, start).join("\n").trimEnd();
  if (!main.trim()) return { main: text, quoted: "" };
  return { main, quoted: lines.slice(start).join("\n") };
}
