import { describe, expect, it } from "vitest";
import {
  buildMessage,
  makeMessageId,
  reSubject,
  safeHref,
  sanitizeEmailHtml,
  threadHeaders,
  unsubscribeUrl,
  type BuildMessageInput,
} from "./message";

const lead = { email: "ann@acme.test", first_name: "Ann", last_name: "Lee", company: "Acme", website: "acme.test" };
const account = { email: "me@sender.test", from_name: "Sam", signature: "Sam\nBuildberg" };

function build(overrides: Partial<BuildMessageInput> = {}) {
  return buildMessage({
    step: { position: 1, subject: "Hi {{firstName|there}}", body: "<p>Hello {{firstName}} at {{company}}</p>", body_format: "rich" },
    lead,
    account,
    seed: "cl1:1",
    ...overrides,
  });
}

describe("safeHref", () => {
  it("keeps http, https, mailto and tel links", () => {
    expect(safeHref("https://acme.test/a?b=1&amp;c=2")).toBe("https://acme.test/a?b=1&amp;c=2");
    expect(safeHref("http://acme.test")).toBe("http://acme.test");
    expect(safeHref("mailto:ann@acme.test")).toBe("mailto:ann@acme.test");
    expect(safeHref("tel:+15550100")).toBe("tel:+15550100");
  });

  it("adds https:// to a bare domain", () => {
    expect(safeHref("acme.test")).toBe("https://acme.test");
    expect(safeHref("www.acme.test/pricing")).toBe("https://www.acme.test/pricing");
    expect(safeHref("acme.test:8080/x")).toBe("https://acme.test:8080/x");
  });

  it("drops dangerous or useless links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("  JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(safeHref("java&#115;cript:alert(1)")).toBeNull();
    expect(safeHref("javascript&colon;alert(1)")).toBeNull();
    expect(safeHref("data:text/html;base64,AAAA")).toBeNull();
    expect(safeHref("vbscript:x")).toBeNull();
    expect(safeHref("//evil.test")).toBeNull();
    expect(safeHref("#top")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref("just some text")).toBeNull();
  });
});

describe("sanitizeEmailHtml", () => {
  it("removes target and rel from links and keeps the href", () => {
    const html = sanitizeEmailHtml('<a href="https://acme.test" target="_blank" rel="noopener">x</a>');
    expect(html).toBe('<a href="https://acme.test">x</a>');
  });

  it("removes the href of an unsafe link but keeps its text", () => {
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>')).toBe("<a>click</a>");
  });

  it("removes scripts, iframes and event handlers", () => {
    const html = sanitizeEmailHtml('<p onclick="x()">a</p><script>alert(1)</script><iframe src="https://x.test"></iframe><b>b</b>');
    expect(html).toBe("<p>a</p><b>b</b>");
  });

  it("keeps https images and drops other images", () => {
    expect(sanitizeEmailHtml('<img src="https://acme.test/a.png" alt="A">')).toBe('<img src="https://acme.test/a.png" alt="A">');
    expect(sanitizeEmailHtml('<img src="data:image/png;base64,AAA">')).toBe("");
    expect(sanitizeEmailHtml('<img src="javascript:x">')).toBe("");
  });

  it("leaves normal formatting alone", () => {
    const html = '<p style="color:red"><strong>Hi</strong><br>there</p><ul><li>a</li></ul>';
    expect(sanitizeEmailHtml(html)).toBe(html);
  });
});

describe("buildMessage", () => {
  it("fills in variables in the subject and body", () => {
    const m = build();
    expect(m.subject).toBe("Hi Ann");
    expect(m.html).toContain("Hello Ann at Acme");
    expect(m.text).toContain("Hello Ann at Acme");
    expect(m.missing).toEqual([]);
  });

  it("uses fallbacks and reports variables with no value", () => {
    const m = build({
      lead: { email: "x@y.test" },
      step: { position: 1, subject: "Hi {{firstName|there}}", body: "<p>{{city}}</p>", body_format: "rich" },
    });
    expect(m.subject).toBe("Hi there");
    expect(m.missing).toEqual(["city"]);
  });

  it("escapes lead values so they cannot add HTML", () => {
    const m = build({ lead: { email: "x@y.test", first_name: "<script>alert(1)</script>" } });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });

  it("makes an unsafe {{website}} link harmless", () => {
    const m = build({
      lead: { email: "x@y.test", website: "javascript:alert(1)" },
      step: { position: 1, subject: "s", body: '<p><a href="{{website}}">site</a></p>', body_format: "rich" },
    });
    expect(m.html).not.toContain("javascript:");
    expect(m.html).toContain("<a>site</a>");
  });

  it("turns a bare {{website}} into a working https link", () => {
    const m = build({ step: { position: 1, subject: "s", body: '<p><a href="{{website}}">site</a></p>', body_format: "rich" } });
    expect(m.html).toContain('<a href="https://acme.test">site</a>');
  });

  it("picks the same spin text every time for the same seed", () => {
    const step = { position: 1, subject: "{Hi|Hello|Hey} there", body: "<p>{Hi|Hello|Hey}</p>", body_format: "rich" };
    expect(build({ step, seed: "a:1" }).subject).toBe(build({ step, seed: "a:1" }).subject);
  });

  it("turns an old plain-text body into paragraphs", () => {
    const m = build({ step: { position: 1, subject: "s", body: "Line one\n\nLine two", body_format: "rich" } });
    expect(m.html).toContain("<p>Line one</p><p>Line two</p>");
  });

  it("adds the signature, escaped, after the body", () => {
    const m = build({ account: { ...account, signature: "Sam <b>\nBuildberg" } });
    expect(m.html).toContain("Sam &lt;b&gt;<br>Buildberg");
    expect(m.text).toContain("Buildberg");
    expect(m.html.indexOf("Hello Ann")).toBeLessThan(m.html.indexOf("Buildberg"));
  });

  it("adds an unsubscribe link only when asked", () => {
    const url = unsubscribeUrl("https://app.test/", "abc");
    expect(url).toBe("https://app.test/u/abc");
    const withLink = build({ unsubscribeUrl: url });
    expect(withLink.html).toContain('<a href="https://app.test/u/abc">Unsubscribe</a>');
    expect(withLink.text).toContain("https://app.test/u/abc");
    expect(build().html).not.toContain("Unsubscribe");
  });

  it("always has a plain-text version", () => {
    const m = build({
      step: { position: 1, subject: "s", body: "<p>Hi <b>there</b></p><style>p{color:red}</style>", body_format: "html" },
      account: { ...account, signature: "" },
    });
    expect(m.text).toBe("Hi there"); // the <style> block is not in the text
  });

  it("wraps fragments in a full HTML document but keeps full documents", () => {
    expect(build().html.startsWith("<!doctype html>")).toBe(true);
    const full = build({
      step: { position: 1, subject: "s", body: "<html><body><p>Hi</p></body></html>", body_format: "html" },
      unsubscribeUrl: "https://app.test/u/1",
    });
    expect(full.html.match(/<html/g)).toHaveLength(1);
    expect(full.html.indexOf("Unsubscribe")).toBeLessThan(full.html.indexOf("</body>"));
  });

  describe("follow-ups", () => {
    const followUp = { position: 2, subject: "", body: "<p>Bumping this</p>", body_format: "rich" };

    it("an empty subject replies in the same thread", () => {
      const m = build({ step: followUp, threadSubject: "Hi Ann" });
      expect(m.subject).toBe("Re: Hi Ann");
      expect(m.inThread).toBe(true);
    });

    it("does not stack Re: prefixes", () => {
      expect(reSubject("Re: Hi Ann")).toBe("Re: Hi Ann");
      expect(reSubject("RE: Hi Ann")).toBe("RE: Hi Ann");
    });

    it("a follow-up with its own subject starts a new thread", () => {
      const m = build({ step: { ...followUp, subject: "Quick question, {{firstName}}" }, threadSubject: "Hi Ann" });
      expect(m.subject).toBe("Quick question, Ann");
      expect(m.inThread).toBe(false);
    });

    it("has no subject when the first email's subject is unknown", () => {
      const m = build({ step: followUp, threadSubject: null });
      expect(m.subject).toBe("");
      expect(m.inThread).toBe(false);
    });
  });
});

describe("threadHeaders", () => {
  it("points at the last email and lists the earlier ones", () => {
    expect(threadHeaders(["<a@x>", "<b@x>"], true)).toEqual({ inReplyTo: "<b@x>", references: "<a@x> <b@x>" });
  });

  it("is empty when not in a thread or nothing was sent before", () => {
    expect(threadHeaders(["<a@x>"], false)).toBeNull();
    expect(threadHeaders([], true)).toBeNull();
  });

  it("keeps only the last 10 references", () => {
    const ids = Array.from({ length: 15 }, (_, i) => `<m${i}@x>`);
    expect(threadHeaders(ids, true)?.references.split(" ")).toHaveLength(10);
  });
});

describe("makeMessageId", () => {
  it("uses the inbox's domain and is unique", () => {
    const a = makeMessageId("Me@Sender.Test");
    expect(a).toMatch(/^<[0-9a-f-]{36}@sender\.test>$/);
    expect(makeMessageId("me@sender.test")).not.toBe(a);
  });
});

describe("tracking", () => {
  const ID = "3f2a1c9e-1111-4222-8333-444455556666";
  const tracking = (opens: boolean, clicks: boolean) => ({
    appUrl: "https://app.test",
    sentMessageId: ID,
    opens,
    clicks,
    sign: (url: string) => `sig(${url.length})`,
  });
  const linkStep = {
    position: 1,
    subject: "s",
    body: '<p>See <a href="https://acme.test/a?x=1&amp;y=2">our page</a> or <a href="mailto:hi@acme.test">write</a>.</p>',
    body_format: "rich",
  };

  it("does nothing when both toggles are off", () => {
    const m = build({ step: linkStep, tracking: tracking(false, false), unsubscribeUrl: "https://app.test/u/1" });
    expect(m.html).not.toContain("/c/");
    expect(m.html).not.toContain("/o/");
    expect(m.html).toContain('href="https://acme.test/a?x=1&amp;y=2"');
  });

  it("click tracking sends web links through our route, but not mailto or the unsubscribe link", () => {
    const m = build({ step: linkStep, tracking: tracking(false, true), unsubscribeUrl: "https://app.test/u/1" });
    expect(m.html).toContain(`href="https://app.test/c/${ID}?u=https%3A%2F%2Facme.test%2Fa%3Fx%3D1%26y%3D2&amp;s=sig(`);
    expect(m.html).toContain('href="mailto:hi@acme.test"');
    expect(m.html).toContain('<a href="https://app.test/u/1">Unsubscribe</a>');
    expect(m.html).not.toContain("/o/");
  });

  it("the plain-text part keeps the real links", () => {
    const m = build({ step: linkStep, tracking: tracking(true, true) });
    expect(m.text).toContain("https://acme.test/a?x=1&y=2");
    expect(m.text).not.toContain("/c/");
    expect(m.text).not.toContain("/o/");
  });

  it("open tracking adds one 1x1 image and nothing else", () => {
    const m = build({ step: linkStep, tracking: tracking(true, false) });
    expect(m.html.match(/<img /g)).toHaveLength(1);
    expect(m.html).toContain(`src="https://app.test/o/${ID}.png"`);
    expect(m.html).toContain('href="https://acme.test/a?x=1&amp;y=2"');
  });

  it("does not rewrite a link that already points at our own app", () => {
    const own = { ...linkStep, body: '<p><a href="https://app.test/pricing">us</a></p>' };
    const m = build({ step: own, tracking: tracking(false, true) });
    expect(m.html).toContain('href="https://app.test/pricing"');
  });
});
