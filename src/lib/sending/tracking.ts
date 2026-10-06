import { createHmac, timingSafeEqual } from "node:crypto";

// Open + click tracking helpers (pure, no I/O).
//
//   open pixel : <app>/o/<sent_message_id>.png
//   click link : <app>/c/<sent_message_id>?u=<real link>&s=<signature>
//   unsubscribe: <app>/u/<sent_message_id>            (page the person sees)
//                <app>/u/<sent_message_id>/one-click  (POST from the mail app)
//
// The click link carries a signature, so only links WE wrote into an email can
// be followed. Without it the click route would be an "open redirect" that
// anyone could use to send people to any website through our domain.

const base = (appUrl: string) => appUrl.replace(/\/+$/, "");

// A separate key for tracking, derived from the encryption key, so no new
// environment variable is needed.
export function deriveTrackingKey(encryptionKeyBase64: string): Buffer {
  return createHmac("sha256", Buffer.from(encryptionKeyBase64, "base64"))
    .update("inboxhype-click-tracking-v1")
    .digest();
}

export function signClick(key: Buffer, sentMessageId: string, url: string): string {
  return createHmac("sha256", key).update(`${sentMessageId}\n${url}`).digest("base64url");
}

export function verifyClick(key: Buffer, sentMessageId: string, url: string, signature: string): boolean {
  const expected = Buffer.from(signClick(key, sentMessageId, url));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function trackedLinkUrl(appUrl: string, sentMessageId: string, url: string, signature: string): string {
  return `${base(appUrl)}/c/${sentMessageId}?u=${encodeURIComponent(url)}&s=${signature}`;
}

export function openPixelUrl(appUrl: string, sentMessageId: string): string {
  return `${base(appUrl)}/o/${sentMessageId}.png`;
}

export function unsubscribePageUrl(appUrl: string, sentMessageId: string): string {
  return `${base(appUrl)}/u/${sentMessageId}`;
}

// What goes into the List-Unsubscribe header (the mail app POSTs here).
export function oneClickUnsubscribeUrl(appUrl: string, sentMessageId: string): string {
  return `${base(appUrl)}/u/${sentMessageId}/one-click`;
}

const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const unattr = (value: string) => value.replace(/&quot;/g, '"').replace(/&amp;/g, "&");

// Replaces the href of every http(s) link. `rewrite` returns the new URL, or
// null to leave that link alone. Expects cleaned HTML (see sanitizeEmailHtml),
// where every href is written as href="...".
export function rewriteLinks(html: string, rewrite: (url: string) => string | null): string {
  return html.replace(/(<a\b[^>]*?\bhref=")([^"]*)(")/gi, (match, open: string, value: string, close: string) => {
    const url = unattr(value);
    if (!/^https?:\/\//i.test(url)) return match;
    const next = rewrite(url);
    return next === null ? match : `${open}${attr(next)}${close}`;
  });
}

// Turns web addresses written as plain text into real links (for example the
// result of {{website}}). Mail apps like Gmail show such text as a link, but the
// email itself has no <a>, so there would be nothing to track. Text that is
// already inside a link, and tag attributes, are left alone.
const BARE_URL = /\bhttps?:\/\/(?:(?!&(?:quot|lt|gt|#39);)[^\s<>"'])+/gi;

export function autoLinkUrls(html: string): string {
  return html
    .split(/(<a\b[\s\S]*?<\/a\s*>|<style\b[\s\S]*?<\/style\s*>|<[^>]*>)/gi)
    .map((part, index) => {
      if (index % 2 === 1) return part; // a tag, an existing link or a style block
      return part.replace(BARE_URL, (found) => {
        // Sentence punctuation right after the address is not part of it.
        const trimmed = found.replace(/(?:[.,;:!?)\]]|&amp;)+$/, "");
        const rest = found.slice(trimmed.length);
        if (!/^https?:\/\/[^/?#\s]+\.[^/?#\s]+/i.test(trimmed)) return found;
        return `<a href="${trimmed}">${trimmed}</a>${rest}`;
      });
    })
    .join("");
}

// A 1x1 image at the end of the email body.
export function addOpenPixel(html: string, pixelUrl: string): string {
  const pixel = `<img src="${attr(pixelUrl)}" width="1" height="1" alt="" style="width:1px;height:1px;border:0">`;
  const close = html.search(/<\/body\s*>/i);
  return close === -1 ? html + pixel : html.slice(0, close) + pixel + html.slice(close);
}

// A real 1x1 transparent PNG (what the pixel route returns).
export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
