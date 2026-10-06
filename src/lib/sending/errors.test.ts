import { describe, expect, it } from "vitest";
import { BlockedHostError } from "@/lib/email/host-guard";
import { classifySendError, InboxConfigError } from "./errors";

// Shapes copied from what nodemailer throws.
const smtp = (fields: Record<string, unknown>) => Object.assign(new Error(String(fields.response ?? "error")), fields);

describe("classifySendError", () => {
  it("login failure: not sent, inbox goes to error, does not use up the lead's attempts", () => {
    const f = classifySendError(smtp({ code: "EAUTH", command: "AUTH PLAIN", responseCode: 535, response: "535 5.7.8 Username and Password not accepted" }));
    expect(f).toMatchObject({ mode: "release", countAttempt: false, inbox: { action: "error" } });
  });

  it("provider sending limit: not sent, inbox rests for hours", () => {
    const f = classifySendError(smtp({ code: "EMESSAGE", command: "DATA", responseCode: 550, response: "550 5.4.5 Daily user sending quota exceeded." }));
    expect(f.mode).toBe("release");
    expect(f.countAttempt).toBe(false);
    expect(f.inbox).toMatchObject({ action: "backoff", seconds: 4 * 3600 });
  });

  it("cannot connect: not sent, inbox waits a bit", () => {
    const f = classifySendError(smtp({ code: "ECONNECTION", command: "CONN", response: undefined, message: "connect ECONNREFUSED" }));
    expect(f).toMatchObject({ mode: "release", countAttempt: false, inbox: { action: "backoff" } });
    expect(classifySendError(smtp({ code: "ETIMEDOUT", command: "CONN" })).mode).toBe("release");
    expect(classifySendError(smtp({ code: "ESOCKET", command: "STARTTLS" })).mode).toBe("release");
  });

  it("connection lost while sending the message: NOT retried (it may have been delivered)", () => {
    for (const code of ["ECONNECTION", "ETIMEDOUT", "ESOCKET"]) {
      const f = classifySendError(smtp({ code, command: "DATA" }));
      expect(f.mode).toBe("fail");
      expect(f.message).toContain("may or may not have been delivered");
    }
  });

  it("address does not exist: bounce", () => {
    const f = classifySendError(smtp({ code: "EENVELOPE", command: "RCPT TO", responseCode: 550, response: "550 5.1.1 The email account that you tried to reach does not exist", rejected: ["x@y.test"] }));
    expect(f).toMatchObject({ mode: "bounce", inbox: null });
  });

  it("null MX / domain does not accept mail: bounce", () => {
    const f = classifySendError(smtp({ code: "EENVELOPE", command: "RCPT TO", responseCode: 556, response: "556 5.1.10 Domain does not accept mail (nullMX)", rejected: ["x@example.com"] }));
    expect(f.mode).toBe("bounce");
  });

  it("recipient refused by policy (relay denied, blocklist): fail, not a bounce", () => {
    const f = classifySendError(smtp({ code: "EENVELOPE", command: "RCPT TO", responseCode: 554, response: "554 5.7.1 Relay access denied", rejected: ["x@y.test"] }));
    expect(f.mode).toBe("fail");
  });

  it("recipient temporarily refused (greylisting): retry later and count the attempt", () => {
    const f = classifySendError(smtp({ code: "EENVELOPE", command: "RCPT TO", responseCode: 451, response: "451 4.7.1 Greylisted", rejected: ["x@y.test"] }));
    expect(f).toMatchObject({ mode: "release", countAttempt: true, inbox: null });
  });

  it("message refused after the body (spam filter): fail", () => {
    const f = classifySendError(smtp({ code: "EMESSAGE", command: "DATA", responseCode: 550, response: "550-5.7.1 Our system has detected that this message is likely unsolicited mail" }));
    expect(f.mode).toBe("fail");
    expect(f.inbox).toBeNull();
  });

  it("temporary server error: retry later, inbox waits", () => {
    const f = classifySendError(smtp({ code: "EMESSAGE", command: "DATA", responseCode: 421, response: "421 4.7.0 Try again later" }));
    expect(f).toMatchObject({ mode: "release", countAttempt: true, inbox: { action: "backoff" } });
  });

  it("sender address refused: inbox goes to error", () => {
    const f = classifySendError(smtp({ code: "EENVELOPE", command: "MAIL FROM", responseCode: 553, response: "553 5.7.1 Sender address rejected: not owned by user" }));
    expect(f).toMatchObject({ mode: "release", countAttempt: false, inbox: { action: "error" } });
  });

  it("private/unknown server host: not sent, inbox waits", () => {
    const f = classifySendError(new BlockedHostError('Server "x" is not allowed (private network address).'));
    expect(f).toMatchObject({ mode: "release", countAttempt: false, inbox: { action: "backoff" } });
  });

  it("saved password can't be read: inbox goes to error, the lead is kept", () => {
    const f = classifySendError(new InboxConfigError("The inbox's saved password could not be read."));
    expect(f).toMatchObject({ mode: "release", countAttempt: false, inbox: { action: "error" } });
  });

  it("anything we don't understand: fail (never retry blindly)", () => {
    expect(classifySendError(new Error("boom")).mode).toBe("fail");
    expect(classifySendError("weird").mode).toBe("fail");
    expect(classifySendError(null).mode).toBe("fail");
  });

  it("never puts more than one short line in the message", () => {
    const f = classifySendError(smtp({ code: "EMESSAGE", command: "DATA", responseCode: 550, response: "550-5.7.1 line one\n550-5.7.1 " + "x".repeat(2000) }));
    expect(f.message).not.toContain("\n");
    expect(f.message.length).toBeLessThan(400);
  });
});
