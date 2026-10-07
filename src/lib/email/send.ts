import "server-only";
import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";
import { postalSendRaw } from "@/lib/postal/client";
import { InboxConfigError } from "@/lib/sending/errors";
import type { Tables } from "@/lib/supabase/database.types";
import { loadPostalConfig } from "./account-secrets";

// Sends one email from one of the user's Postal inboxes, through the Postal
// HTTP API. The email (headers, Message-ID, threading, unsubscribe) is built
// here as a complete raw message and handed to Postal as is.

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
  // Postal's own id for the message.
  providerMessageId: string | null;
};

type Inbox = Pick<Tables<"email_accounts">, "id" | "email" | "from_name" | "postal_server_id">;

// The complete email (headers + MIME body), built by nodemailer without sending it.
async function buildRaw(inbox: Inbox, mail: OutgoingMail): Promise<Buffer> {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "crlf" });
  const info = await composer.sendMail({
    from: inbox.from_name ? { name: inbox.from_name, address: inbox.email } : inbox.email,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    messageId: mail.messageId,
    ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo } : {}),
    ...(mail.references ? { references: mail.references } : {}),
    headers: mail.headers ?? {},
  });
  if (!Buffer.isBuffer(info.message)) throw new Error("Could not build the email");
  return info.message;
}

export async function sendFromInbox(inbox: Inbox, mail: OutgoingMail): Promise<SendResult> {
  let config: Awaited<ReturnType<typeof loadPostalConfig>>;
  try {
    config = await loadPostalConfig(inbox);
  } catch (error) {
    logger.error("could not read a Postal inbox's saved API key", { error, inboxId: inbox.id });
    throw new InboxConfigError("The saved Postal API key could not be read. Update the API key on the inbox page.");
  }
  const raw = await buildRaw(inbox, mail);
  const result = await postalSendRaw(config, { mailFrom: inbox.email, rcptTo: mail.to, raw });
  return { providerMessageId: result.postalId };
}
