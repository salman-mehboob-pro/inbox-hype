import { describe, expect, it } from "vitest";
import { splitQuotedHtml, splitQuotedText } from "./quote";

describe("splitQuotedHtml", () => {
  it("splits a Gmail reply: new text visible, the whole quote hidden", () => {
    const html =
      '<div dir="ltr">there?</div><br><div class="gmail_quote gmail_quote_container">' +
      '<div dir="ltr" class="gmail_attr">On Tue, Oct 6, 2026 at 5:57 PM Sam &lt;s@x.test&gt; wrote:<br></div>' +
      '<blockquote class="gmail_quote" style="margin:0">hi there</blockquote></div>';
    const { main, quoted } = splitQuotedHtml(html);
    expect(main).toBe('<div dir="ltr">there?</div><br>');
    expect(quoted.startsWith('<div class="gmail_quote gmail_quote_container">')).toBe(true);
    expect(main + quoted).toBe(html);
  });

  it("splits an Apple Mail style reply and moves the 'wrote:' line into the quote", () => {
    const html = "<div>Sounds good</div><div>On Oct 6, 2026, at 5:13 PM, Sam wrote:</div><blockquote type=\"cite\">Hi</blockquote>";
    const { main, quoted } = splitQuotedHtml(html);
    expect(main).toBe("<div>Sounds good</div>");
    expect(quoted).toContain("wrote:");
    expect(quoted).toContain("<blockquote");
  });

  it("splits an Outlook reply", () => {
    const html = '<p>Thanks!</p><div id="appendonsend"></div><hr><div id="divRplyFwdMsg"><b>From:</b> Sam</div><div>old text</div>';
    expect(splitQuotedHtml(html).main).toBe("<p>Thanks!</p>");
  });

  it("leaves a message without a quote alone", () => {
    const html = "<p>Hello</p>";
    expect(splitQuotedHtml(html)).toEqual({ main: html, quoted: "" });
  });

  it("never hides everything: a message that is only a quote stays as it is", () => {
    const html = '<div class="gmail_quote"><blockquote>forwarded text</blockquote></div>';
    expect(splitQuotedHtml(html)).toEqual({ main: html, quoted: "" });
  });
});

describe("splitQuotedText", () => {
  it("cuts at 'On ... wrote:'", () => {
    const text = "there?\n\nOn Tue, Oct 6, 2026 at 5:57 PM Salman Mehboob <a@x.test> wrote:\n> hi there\n> bye";
    const { main, quoted } = splitQuotedText(text);
    expect(main).toBe("there?");
    expect(quoted.startsWith("On Tue")).toBe(true);
    expect(quoted).toContain("> hi there");
  });

  it("handles the wrapped form (name on the next line)", () => {
    const text = "Yes\n\nOn Tue, Oct 6, 2026 at 5:57 PM Salman Mehboob <salmanfbinsta12@gmail.com>\nwrote:\n> hi";
    expect(splitQuotedText(text).main).toBe("Yes");
  });

  it("cuts at 'Original Message' and at a block of > lines", () => {
    expect(splitQuotedText("OK\n\n-----Original Message-----\nFrom: Sam").main).toBe("OK");
    expect(splitQuotedText("OK\n> quoted\n> more").main).toBe("OK");
  });

  it("leaves plain text without a quote alone, and never hides everything", () => {
    expect(splitQuotedText("just a reply")).toEqual({ main: "just a reply", quoted: "" });
    const onlyQuote = "> everything is quoted";
    expect(splitQuotedText(onlyQuote)).toEqual({ main: onlyQuote, quoted: "" });
  });
});
