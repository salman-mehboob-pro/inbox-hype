import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

const key = randomBytes(32).toString("base64");

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a password", () => {
    const enc = encryptSecret("abcd efgh ijkl mnop", key, "account-1");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("abcd");
    expect(decryptSecret(enc, key, "account-1")).toBe("abcd efgh ijkl mnop");
  });

  it("uses a new IV every time", () => {
    expect(encryptSecret("same", key, "a")).not.toBe(encryptSecret("same", key, "a"));
  });

  it("fails for a different account (context)", () => {
    const enc = encryptSecret("secret", key, "account-1");
    expect(() => decryptSecret(enc, key, "account-2")).toThrow();
  });

  it("fails with the wrong key", () => {
    const enc = encryptSecret("secret", key, "account-1");
    const otherKey = randomBytes(32).toString("base64");
    expect(() => decryptSecret(enc, otherKey, "account-1")).toThrow();
  });

  it("fails if the ciphertext was changed", () => {
    const enc = encryptSecret("secret", key, "account-1");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key, "account-1")).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"), "a")).toThrow();
  });
});
