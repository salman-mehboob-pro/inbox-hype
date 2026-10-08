// Helpers for pasted / imported HTML emails (pure, no I/O).

// HTML the Text editor can't keep (a full page, layout, CSS): switching to Text
// would turn it into plain paragraphs, so the editor asks first.
export function hasDesign(html: string): boolean {
  return /<(!doctype|html|head|body|style|table|div|font|center|button)\b|\sstyle\s*=/i.test(html);
}

// Email files are often saved as Windows-1252, not UTF-8. Reading those as
// UTF-8 turns special characters into "�", so fall back to Windows-1252.
export function decodeHtmlFile(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return decodeWindows1252(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  }
}

// Bytes 0x80-0x9F in Windows-1252 (curly quotes, dashes, €, …); the rest
// match Unicode. Done by hand because TextDecoder differs between runtimes.
const CP1252_HIGH =
  "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";

function decodeWindows1252(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b);
  return out;
}

const PREVIEW_HEAD = '<meta charset="utf-8"><base target="_blank">';

// A full email file (<!doctype html><html>…) is shown as it is, like it is
// sent; a body from the editor gets a simple page with default email styles.
export function previewDocument(html: string): string {
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) return html.replace(/<head(\s[^>]*)?>/i, (m) => m + PREVIEW_HEAD);
    return html.replace(/<html(\s[^>]*)?>/i, (m) => `${m}<head>${PREVIEW_HEAD}</head>`);
  }
  return `<!doctype html><html><head>${PREVIEW_HEAD}<style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;margin:12px;}
    p{margin:0 0 .75em} img{max-width:100%;height:auto} blockquote{border-left:3px solid #ddd;margin:0 0 .75em;padding-left:.75em;color:#555}
  </style></head><body>${html}</body></html>`;
}
