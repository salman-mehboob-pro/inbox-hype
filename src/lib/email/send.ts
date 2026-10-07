import "server-only";
import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";
import { postalSendRaw } from "@/lib/postal/client";
import { InboxConfigError } from "@/lib/sending/errors";
import type { Tables } from "@/lib/supabase/database.types";
import { loadAccountConfig, loadPostalConfig } from "./account-secrets";
import { createSmtpTransport } from "./clients";

// Sends one email from one of the user's inboxes: over SMTP for normal inboxes,
// through the Postal HTTP API for Postal inboxes. The email itself (headers,
// Message-ID, threading, unsubscribe) is built the same way for both.

export type OutgoingMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string>;
};

export type SendResult = {
  // Postal's own id for the message (null for SMTP).
  providerMessageId: string | null;
};

type Inbox = Pick<
  Tables<"email_accounts">,
  | "id"
  | "email"
  | "from_name"
  | "provider"
  | "postal_server_id"
  | "smtp_host"
  | "smtp_port"
  | "smtp_secure"
  | "smtp_username"
  | "imap_host"
  | "imap_port"
  | "imap_secure"
  | "imap_username"
>;

export function isPostalInbox(inbox: Pick<Tables<"email_accounts">, "provider">): boolean {
  return inbox.provider === "postal";
}

function mailOptions(inbox: Inbox, mail: OutgoingMail) {
  return {
    from: inbox.from_name ? { name: inbox.from_name, address: inbox.email } : inbox.email,
    to: mail.to,
    envelope: { from: inbox.email, to: mail.to },
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    messageId: mail.messageId,
    ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo } : {}),
    ...(mail.references ? { references: mail.references } : {}),
    headers: mail.headers ?? {},
  };
}

// The complete email as it would go over SMTP (headers + MIME body).
async function buildRaw(options: ReturnType<typeof mailOptions>): Promise<Buffer> {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "crlf" });
  const info = await composer.sendMail(options);
  if (!Buffer.isBuffer(info.message)) throw new Error("Could not build the email");
  return info.message;
}

export async function sendFromInbox(inbox: Inbox, mail: OutgoingMail): Promise<SendResult> {
  const options = mailOptions(inbox, mail);

  if (isPostalInbox(inbox)) {
    let config: Awaited<ReturnType<typeof loadPostalConfig>>;
    try {
      config = await loadPostalConfig(inbox);
    } catch (error) {
      logger.error("could not read a Postal inbox's saved API key", { error, inboxId: inbox.id });
      throw new InboxConfigError("The saved Postal API key could not be read. Update the API key on the inbox page.");
    }
    const raw = await buildRaw(options);
    const result = await postalSendRaw(config, { mailFrom: inbox.email, rcptTo: mail.to, raw });
    return { providerMessageId: result.postalId };
  }

  let config: Awaited<ReturnType<typeof loadAccountConfig>>;
  try {
    config = await loadAccountConfig(inbox);
  } catch (error) {
    logger.error("could not read an inbox's saved login", { error, inboxId: inbox.id });
    throw new InboxConfigError("The inbox's saved password could not be read. Remove the inbox and add it again.");
  }
  const transport = await createSmtpTransport(config.smtp);
  try {
    await transport.sendMail(options);
  } finally {
    transport.close();
  }
  return { providerMessageId: null };
}
