import { describe, expect, it } from "vitest";
import { BlockedHostError } from "@/lib/email/host-guard";
import { PostalApiError } from "@/lib/postal/core";
import { classifySendError, InboxConfigError } from "./errors";

// Postal API errors are covered in src/lib/postal/core.test.ts.
describe("classifySendError", () => {
  it("private/unknown Postal host: not sent, inbox waits", () => {
    const f = classifySendError(new BlockedHostError('Server "x" is not allowed (private network address).'));
    expect(f.mode).toBe("release");
    expect(f.countAttempt).toBe(false);
    expect(f.inbox?.action).toBe("backoff");
  });

  it("saved API key can't be read: inbox goes to error, the lead is kept", () => {
    const f = classifySendError(new InboxConfigError("The saved Postal API key could not be read."));
    expect(f.mode).toBe("release");
    expect(f.inbox?.action).toBe("error");
  });

  it("Postal limit (429): not sent, inbox rests", () => {
    const f = classifySendError(new PostalApiError("response", "Too many requests", 429));
    expect(f.mode).toBe("release");
    expect(f.inbox).toMatchObject({ action: "backoff", seconds: 3600 });
  });

  it("anything we don't understand: fail (never retry blindly)", () => {
    expect(classifySendError(new Error("something odd")).mode).toBe("fail");
    expect(classifySendError("weird").mode).toBe("fail");
  });

  it("never puts more than one short line in the message", () => {
    const f = classifySendError(new PostalApiError("response", "a\n\nb ".repeat(200), 200, "Other"));
    expect(f.message).not.toMatch(/\n/);
    expect(f.message.length).toBeLessThan(350);
  });
});
