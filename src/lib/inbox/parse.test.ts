import { describe, expect, it } from "vitest";
import {
  classifyInbound,
  extractMessageIds,
  isAutoReply,
  isMailerDaemon,
  parseDeliveryReport,
  parseHeaderBlock,
  snippet,
} from "./parse";

const GMAIL_BOUNCE = `From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
To: me@sender.test
Subject: Delivery Status Notification (Failure)
Message-ID: <report-1@mail.gmail.com>
Content-Type: multipart/report; boundary="000"; report-type=delivery-status

--000
Content-Type: text/plain; charset="UTF-8"

** Address not found **

Your message wasn't delivered to nobody@example.com because the address couldn't be found.

--000
Content-Type: message/delivery-status

Reporting-MTA: dns; googlemail.com
Final-Recipient: rfc822; Nobody@Example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.

--000
Content-Type: message/rfc822

Received: by 2002:a1 with SMTP id x
Message-ID: <original-1@sender.test>
Subject: Hello
`;

describe("extractMessageIds", () => {
  it("finds every id, lower case, once", () => {
    expect(extractMessageIds("<A@x.test>", ["<b@x.test> <A@X.test>", "junk"], null)).toEqual(["<a@x.test>", "<b@x.test>"]);
  });
  it("returns nothing for empty input", () => {
    expect(extractMessageIds(undefined, "", null)).toEqual([]);
  });
});

describe("parseHeaderBlock", () => {
  it("reads names in lower case and joins folded lines", () => {
    const block = [
      "References: <a@x>",
      " <b@x>",
      "Auto-Submitted: auto-replied",
      "Content-Type: multipart/report;",
      "\treport-type=delivery-status",
      "",
      "",
    ].join("\r\n");
    expect(parseHeaderBlock(block)).toEqual({
      references: "<a@x> <b@x>",
      "auto-submitted": "auto-replied",
      "content-type": "multipart/report; report-type=delivery-status",
    });
  });
  it("keeps the first value of a repeated header and accepts bytes or nothing", () => {
    expect(parseHeaderBlock("X-A: one\r\nX-A: two\r\n")).toEqual({ "x-a": "one" });
    expect(parseHeaderBlock(new TextEncoder().encode("Precedence: bulk\r\n"))).toEqual({ precedence: "bulk" });
    expect(parseHeaderBlock(undefined)).toEqual({});
  });
});

describe("isMailerDaemon", () => {
  it("recognises bounce senders", () => {
    expect(isMailerDaemon("MAILER-DAEMON@googlemail.com")).toBe(true);
    expect(isMailerDaemon("postmaster@corp.test")).toBe(true);
    expect(isMailerDaemon("ann@corp.test")).toBe(false);
    expect(isMailerDaemon(null)).toBe(false);
  });
});

describe("isAutoReply", () => {
  it("uses the standard headers", () => {
    expect(isAutoReply({ "auto-submitted": "auto-replied" }, "Re: Hi")).toBe(true);
    expect(isAutoReply({ "auto-submitted": "no" }, "Re: Hi")).toBe(false);
    expect(isAutoReply({ "x-autoreply": "yes" }, "Re: Hi")).toBe(true);
    expect(isAutoReply({ precedence: "bulk" }, "Re: Hi")).toBe(true);
  });
  it("uses typical subjects", () => {
    expect(isAutoReply({}, "Automatic reply: Hi there")).toBe(true);
    expect(isAutoReply({}, "Out of Office: Hi there")).toBe(true);
    expect(isAutoReply({}, "Autoreply: Hi")).toBe(true);
  });
  it("does not flag a normal reply", () => {
    expect(isAutoReply({}, "Re: Quick test")).toBe(false);
    expect(isAutoReply({}, "I am out of office next week, can we talk after?")).toBe(false);
  });
});

describe("parseDeliveryReport", () => {
  it("reads a Gmail failure report", () => {
    const report = parseDeliveryReport(GMAIL_BOUNCE);
    expect(report).toEqual({
      hard: true,
      recipient: "nobody@example.com",
      status: "5.1.1",
      originalMessageIds: ["<report-1@mail.gmail.com>", "<original-1@sender.test>"],
    });
  });

  it("treats 4.x.x and delayed reports as temporary", () => {
    const delayed = GMAIL_BOUNCE.replace("Action: failed", "Action: delayed").replace("Status: 5.1.1", "Status: 4.4.1");
    expect(parseDeliveryReport(delayed)).toBeNull();
    const soft = GMAIL_BOUNCE.replace("Action: failed", "Action: failed").replace("Status: 5.1.1", "Status: 4.2.2");
    expect(parseDeliveryReport(soft)?.hard).toBe(false);
  });

  it("falls back to the text when there is no machine-readable part", () => {
    const text = `From: MAILER-DAEMON@old.test\nSubject: Mail delivery failed\n\nYour message wasn't delivered to ghost@corp.test.\n550 5.1.1 user unknown\n`;
    const report = parseDeliveryReport(text);
    expect(report?.recipient).toBe("ghost@corp.test");
    expect(report?.hard).toBe(true);
  });

  it("returns null for mail that is not a report", () => {
    expect(parseDeliveryReport("From: ann@x.test\nSubject: Hi\n\nThanks!")).toBeNull();
  });
});

describe("classifyInbound", () => {
  it("a bounce from the mail system", () => {
    const result = classifyInbound({
      fromAddress: "mailer-daemon@googlemail.com",
      subject: "Delivery Status Notification (Failure)",
      headers: { "content-type": 'multipart/report; report-type=delivery-status; boundary="000"' },
      raw: GMAIL_BOUNCE,
    });
    expect(result.kind).toBe("bounce");
  });

  it("a delayed-delivery notice is ignored, not a bounce", () => {
    const result = classifyInbound({
      fromAddress: "mailer-daemon@googlemail.com",
      subject: "Delivery Status Notification (Delay)",
      headers: {},
      raw: GMAIL_BOUNCE.replace("Action: failed", "Action: delayed").replace("Status: 5.1.1", "Status: 4.4.1"),
    });
    expect(result.kind).toBe("other");
  });

  it("an out-of-office answer", () => {
    expect(
      classifyInbound({ fromAddress: "ann@corp.test", subject: "Automatic reply: Hi", headers: {}, raw: "" }).kind,
    ).toBe("auto_reply");
  });

  it("a real reply", () => {
    expect(
      classifyInbound({ fromAddress: "ann@corp.test", subject: "Re: Hi", headers: {}, raw: "Thanks, sounds good" }).kind,
    ).toBe("reply");
  });

  it("a person's reply that mentions a 5.1.1 style code is still a reply", () => {
    expect(
      classifyInbound({ fromAddress: "ann@corp.test", subject: "Re: Hi", headers: {}, raw: "Status: 5.1.1 is what I got, why?" }).kind,
    ).toBe("reply");
  });
});

describe("snippet", () => {
  it("shows the new text only, without quoted lines or the quote header", () => {
    const text = "Sounds good, call me.\n\nOn Tue, Oct 6, 2026 at 10:00 AM Sam <sam@x.test> wrote:\n> Hi there\n> test";
    expect(snippet(text)).toBe("Sounds good, call me.");
  });
  it("is empty for no text and cut to the limit", () => {
    expect(snippet(null)).toBe("");
    expect(snippet("a".repeat(300), 20)).toHaveLength(20);
  });
});
