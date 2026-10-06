import { describe, expect, it } from "vitest";
import {
  addOpenPixel,
  deriveTrackingKey,
  oneClickUnsubscribeUrl,
  openPixelUrl,
  PIXEL_PNG,
  rewriteLinks,
  signClick,
  trackedLinkUrl,
  unsubscribePageUrl,
  verifyClick,
} from "./tracking";

const key = deriveTrackingKey(Buffer.alloc(32, 7).toString("base64"));
const ID = "3f2a1c9e-1111-4222-8333-444455556666";

describe("signed click links", () => {
  it("accepts the link we signed", () => {
    const sig = signClick(key, ID, "https://acme.test/pricing?a=1&b=2");
    expect(verifyClick(key, ID, "https://acme.test/pricing?a=1&b=2", sig)).toBe(true);
  });

  it("rejects another link, another email id, a wrong or empty signature", () => {
    const sig = signClick(key, ID, "https://acme.test/");
    expect(verifyClick(key, ID, "https://evil.test/", sig)).toBe(false);
    expect(verifyClick(key, "other-id", "https://acme.test/", sig)).toBe(false);
    expect(verifyClick(key, ID, "https://acme.test/", sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifyClick(key, ID, "https://acme.test/", "")).toBe(false);
  });

  it("rejects a signature made with another key", () => {
    const other = deriveTrackingKey(Buffer.alloc(32, 9).toString("base64"));
    expect(verifyClick(key, ID, "https://acme.test/", signClick(other, ID, "https://acme.test/"))).toBe(false);
  });
});

describe("urls", () => {
  it("builds the tracking addresses without double slashes", () => {
    expect(openPixelUrl("https://app.test/", ID)).toBe(`https://app.test/o/${ID}.png`);
    expect(unsubscribePageUrl("https://app.test", ID)).toBe(`https://app.test/u/${ID}`);
    expect(oneClickUnsubscribeUrl("https://app.test/", ID)).toBe(`https://app.test/u/${ID}/one-click`);
    expect(trackedLinkUrl("https://app.test", ID, "https://acme.test/a?b=1&c=2", "SIG")).toBe(
      `https://app.test/c/${ID}?u=https%3A%2F%2Facme.test%2Fa%3Fb%3D1%26c%3D2&s=SIG`,
    );
  });
});

describe("rewriteLinks", () => {
  const rewrite = (url: string) => `https://app.test/c/x?u=${encodeURIComponent(url)}`;

  it("rewrites http(s) links and keeps everything else", () => {
    const html = '<p><a href="https://acme.test/a" style="color:red">A</a> <a href="mailto:a@b.test">M</a> <a>no href</a></p>';
    expect(rewriteLinks(html, rewrite)).toBe(
      '<p><a href="https://app.test/c/x?u=https%3A%2F%2Facme.test%2Fa" style="color:red">A</a> <a href="mailto:a@b.test">M</a> <a>no href</a></p>',
    );
  });

  it("reads &amp; in the original link and writes a safe attribute", () => {
    const seen: string[] = [];
    const out = rewriteLinks('<a href="https://acme.test/?a=1&amp;b=2">x</a>', (url) => {
      seen.push(url);
      return "https://app.test/c/x?u=1&s=2";
    });
    expect(seen).toEqual(["https://acme.test/?a=1&b=2"]);
    expect(out).toBe('<a href="https://app.test/c/x?u=1&amp;s=2">x</a>');
  });

  it("leaves a link alone when told to (null)", () => {
    const html = '<a href="https://app.test/u/1">unsubscribe</a>';
    expect(rewriteLinks(html, () => null)).toBe(html);
  });
});

describe("addOpenPixel", () => {
  it("adds a 1x1 image at the end of the body", () => {
    const html = addOpenPixel("<html><body><p>Hi</p></body></html>", "https://app.test/o/1.png");
    expect(html).toBe(
      '<html><body><p>Hi</p><img src="https://app.test/o/1.png" width="1" height="1" alt="" style="width:1px;height:1px;border:0"></body></html>',
    );
  });

  it("appends when there is no body tag", () => {
    expect(addOpenPixel("<p>Hi</p>", "https://app.test/o/1.png").startsWith("<p>Hi</p><img")).toBe(true);
  });
});

describe("pixel image", () => {
  it("is a real PNG", () => {
    expect(PIXEL_PNG.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});
