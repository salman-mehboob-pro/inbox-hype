import { describe, expect, it } from "vitest";
import { decodeHtmlFile, hasDesign, previewDocument } from "./html-file";

describe("hasDesign", () => {
  it("is false for what the Text editor writes", () => {
    expect(hasDesign('<p>Hi <strong>there</strong>, <a href="https://x.com">link</a></p><ul><li>a</li></ul>')).toBe(false);
  });
  it("is true for a full page, tables, CSS or inline styles", () => {
    expect(hasDesign("<!DOCTYPE html><html><body>Hi</body></html>")).toBe(true);
    expect(hasDesign("<table><tr><td>Hi</td></tr></table>")).toBe(true);
    expect(hasDesign('<p style="color:red">Hi</p>')).toBe(true);
    expect(hasDesign("<style>p{}</style><p>Hi</p>")).toBe(true);
  });
  it("does not match look-alike tags", () => {
    expect(hasDesign("<header>x</header><p>Hi</p>")).toBe(false);
  });
});

describe("decodeHtmlFile", () => {
  it("reads UTF-8", () => {
    expect(decodeHtmlFile(new TextEncoder().encode("Café – “hi”"))).toBe("Café – “hi”");
  });
  it("falls back to Windows-1252 instead of showing �", () => {
    // "Café" + non-breaking space + "“hi”" saved as Windows-1252.
    const bytes = new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0xa0, 0x93, 0x68, 0x69, 0x94]);
    expect(decodeHtmlFile(bytes)).toBe("Café “hi”");
  });
});

describe("previewDocument", () => {
  it("keeps a full email file as it is and adds the preview head", () => {
    const html = '<!DOCTYPE html><html lang="en"><head><title>T</title><style>p{color:red}</style></head><body><p>Hi</p></body></html>';
    const doc = previewDocument(html);
    expect(doc.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(doc).toContain('<head><meta charset="utf-8"><base target="_blank"><title>T</title>');
    expect(doc.match(/<html/gi)).toHaveLength(1);
  });
  it("adds a head when the file has none", () => {
    expect(previewDocument("<html><body>Hi</body></html>")).toBe(
      '<html><head><meta charset="utf-8"><base target="_blank"></head><body>Hi</body></html>',
    );
  });
  it("wraps an editor body in a page with default styles", () => {
    const doc = previewDocument("<p>Hi</p>");
    expect(doc).toContain("<body><p>Hi</p></body>");
    expect(doc).toContain("font-family:Arial");
  });
});
