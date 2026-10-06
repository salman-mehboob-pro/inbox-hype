import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for inbox passwords.
// Format: "v1.<iv>.<tag>.<ciphertext>" (base64url parts).
// `context` (e.g. the email account id) is bound as AAD, so a ciphertext copied
// to another account fails to decrypt.

const VERSION = "v1";
const IV_BYTES = 12;

function loadKey(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (base64)");
  return key;
}

export function encryptSecret(plaintext: string, keyB64: string, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", loadKey(keyB64), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(payload: string, keyB64: string, context: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Unknown secret format");
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", loadKey(keyB64), Buffer.from(ivB64, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}
