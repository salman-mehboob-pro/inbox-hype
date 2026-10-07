import { describe, expect, it } from "vitest";
import { classifySendError } from "@/lib/sending/errors";
import {
  isAddressProblem,
  isHookToken,
  normalizeMessageId,
  normalizePostalUrl,
  parseWebhook,
  PostalApiError,
  postalInboundUrl,
  postalWebhookUrl,
  readInboundMail,
  readPostalAnswer,
  readSendResult,
} from "./core";

describe("normalizePostalUrl", () => {
  it("keeps only the https origin", () => {
    expect(normalizePostalUrl("postal.say-vi.com")).toBe("https://postal.say-vi.com");
    expect(normalizePostalUrl(" https://Postal.Say-Vi.com/org/ignacio/servers/sayvi ")).toBe("https://postal.say-vi.com");
    expect(normalizePostalUrl("https://postal.example.com:8443/")).toBe("https://postal.example.com:8443");
  });
  it("refuses http, credentials and odd hosts", () => {
    expect(normalizePostalUrl("http://postal.example.com")).toBeNull();
    expect(normalizePostalUrl("https://user:pw@postal.example.com")).toBeNull();
    expect(normalizePostalUrl("localhost")).toBeNull();
    expect(normalizePostalUrl("")).toBeNull();
    expect(normalizePostalUrl("ftp://postal.example.com")).toBeNull();
  });
});

describe("hook urls", () => {
  it("builds both urls without double slashes", () => {
    expect(postalWebhookUrl("https://app.test/", "tok")).toBe("https://app.test/api/postal/webhook/tok");
    expect(postalInboundUrl("https://app.test", "tok")).toBe("https://app.test/api/postal/inbound/tok");
  });
  it("accepts only token-like values", () => {
    expect(isHookToken("a".repeat(43))).toBe(true);
    expect(isHookToken("short")).toBe(false);
    expect(isHookToken(`${"a".repeat(40)}/../x`)).toBe(false);
  });
});

describe("normalizeMessageId", () => {
  it("adds brackets and lower-cases", () => {
    expect(normalizeMessageId("ABC@Host.com")).toBe("<abc@host.com>");
    expect(normalizeMessageId("<abc@host.com>")).toBe("<abc@host.com>");
    expect(normalizeMessageId("")).toBeNull();
    expect(normalizeMessageId(null)).toBeNull();
    expect(normalizeMessageId("a b@c")).toBeNull();
  });
});

describe("readPostalAnswer", () => {
  it("returns data on success", () => {
    expect(readPostalAnswer(200, JSON.stringify({ status: "success", data: { x: 1 } }))).toEqual({ x: 1 });
  });
  it("throws a response error with Postal's code", () => {
    try {
      readPostalAnswer(200, JSON.stringify({ status: "error", data: { code: "InvalidServerAPIKey", message: "bad key" } }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PostalApiError);
      expect((e as PostalApiError).phase).toBe("response");
      expect((e as PostalApiError).code).toBe("InvalidServerAPIKey");
    }
  });
  it("a proxy error page means Postal never got the request", () => {
    expect(() => readPostalAnswer(502, "<html>Bad gateway</html>")).toThrow(
      expect.objectContaining({ phase: "connect" }),
    );
  });
  it("an unreadable 200 means we can't know if it was sent", () => {
    expect(() => readPostalAnswer(200, "oops")).toThrow(expect.objectContaining({ phase: "unknown" }));
  });
});

describe("readSendResult", () => {
  it("reads Postal's id for the recipient", () => {
    const data = { message_id: "abc@postal.example.com", messages: { "ann@example.com": { id: 37, token: "t" } } };
    expect(readSendResult(data, "ann@example.com")).toEqual({ messageId: "<abc@postal.example.com>", postalId: "37" });
  });
  it("copes with a missing answer", () => {
    expect(readSendResult(null, "ann@example.com")).toEqual({ messageId: null, postalId: null });
  });
});

describe("classifySendError with Postal errors", () => {
  it("could not connect = try again later, inbox rests", () => {
    const f = classifySendError(new PostalApiError("connect", "ECONNREFUSED"));
    expect(f.mode).toBe("release");
    expect(f.countAttempt).toBe(false);
    expect(f.inbox?.action).toBe("backoff");
  });
  it("no answer after sending = never retried (no double send)", () => {
    const f = classifySendError(new PostalApiError("unknown", "socket hang up"));
    expect(f.mode).toBe("fail");
    expect(f.inbox).toBeNull();
  });
  it("wrong API key or sender = inbox error, lead released", () => {
    for (const code of ["InvalidServerAPIKey", "UnauthenticatedFromAddress"]) {
      const f = classifySendError(new PostalApiError("response", code, 200, code));
      expect(f.mode).toBe("release");
      expect(f.inbox?.action).toBe("error");
    }
  });
  it("other refusals fail the email", () => {
    const f = classifySendError(new PostalApiError("response", "Bad content", 200, "NoContent"));
    expect(f.mode).toBe("fail");
  });
});

describe("isAddressProblem", () => {
  it("bad address = bounce", () => {
    expect(isAddressProblem("550 5.1.1 The email account that you tried to reach does not exist")).toBe(true);
    expect(isAddressProblem("No MX records found for domain")).toBe(true);
  });
  it("refused by policy = not the lead's fault", () => {
    expect(isAddressProblem("550 5.7.1 Message rejected due to spam content")).toBe(false);
    expect(isAddressProblem("554 5.7.1 Recipient address rejected: Access denied")).toBe(false);
    expect(isAddressProblem("Connection timed out")).toBe(false);
  });
});

const message = { id: 12, token: "x", direction: "outgoing", message_id: "Abc@Example.com", to: "Ann@Example.com" };

describe("parseWebhook", () => {
  it("MessageSent", () => {
    const e = parseWebhook({
      event: "MessageSent",
      payload: { message, status: "Sent", details: "Message for ann accepted", output: "250 OK" },
    });
    expect(e).toEqual({
      type: "sent",
      message: { postalId: "12", messageId: "<abc@example.com>", to: "ann@example.com" },
      detail: "Message for ann accepted · 250 OK",
    });
  });
  it("MessageDeliveryFailed knows a bad address from a refusal", () => {
    const bad = parseWebhook({
      event: "MessageDeliveryFailed",
      payload: { message, status: "HardFail", details: "550 5.1.1 user unknown" },
    });
    expect(bad).toMatchObject({ type: "failed", addressProblem: true });
    const spam = parseWebhook({
      event: "MessageDeliveryFailed",
      payload: { message, status: "HardFail", details: "550 5.7.1 blocked by spam filter" },
    });
    expect(spam).toMatchObject({ type: "failed", addressProblem: false });
  });
  it("MessageBounced points at the original email", () => {
    const e = parseWebhook({
      event: "MessageBounced",
      payload: { original_message: message, bounce: { id: 99, message_id: "b@x" } },
    });
    expect(e).toEqual({
      type: "bounced",
      message: { postalId: "12", messageId: "<abc@example.com>", to: "ann@example.com" },
      bounceId: "99",
    });
  });
  it("incoming messages and unknown events are ignored", () => {
    expect(parseWebhook({ event: "MessageSent", payload: { message: { ...message, direction: "incoming" } } }).type).toBe(
      "ignored",
    );
    expect(parseWebhook({ event: "MessageLinkClicked", payload: {} }).type).toBe("ignored");
    expect(parseWebhook("nonsense").type).toBe("ignored");
  });
  it("DomainDNSError lists the problems", () => {
    const e = parseWebhook({
      event: "DomainDNSError",
      payload: { domain: "say-vi.com", spf_status: "OK", dkim_status: "Invalid", dkim_error: "No DKIM record" },
    });
    expect(e).toEqual({ type: "dns_error", detail: "DNS problem on say-vi.com (DKIM: No DKIM record)" });
  });
});

describe("readInboundMail", () => {
  it("decodes the raw message", () => {
    const raw = "From: a@b.com\r\nSubject: Hi\r\n\r\nHello";
    const mail = readInboundMail({ id: 5, rcpt_to: "Me@Say-Vi.com", message: Buffer.from(raw).toString("base64"), base64: true });
    expect(mail).toEqual({ ok: true, postalId: "5", rcptTo: "me@say-vi.com", raw: Buffer.from(raw) });
  });
  it("refuses the hash format", () => {
    expect(readInboundMail({ id: 5, plain_body: "Hello", subject: "Hi" })).toMatchObject({ ok: false });
  });
});
