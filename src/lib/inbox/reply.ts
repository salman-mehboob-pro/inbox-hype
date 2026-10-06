import "server-only";
import { loadAccountConfig } from "@/lib/email/account-secrets";
import { createSmtpTransport } from "@/lib/email/clients";
import { escapeHtml, textToHtml } from "@/lib/email/template";
import { classifySendError } from "@/lib/sending/errors";
import { makeMessageId, reSubject } from "@/lib/sending/message";
import type { Tables } from "@/lib/supabase/database.types";

// A reply written by the user in the Unibox, sent from the SAME inbox the
// lead answered. It continues the lead's thread (In-Reply-To / References).

export type ReplyResult =
  | { ok: true; messageId: string; subject: string; html: string; references: string }
  | { ok: false; error: string };

export async function sendManualReply(args: {
  inbox: Tables<"email_accounts">;
  original: Pick<Tables<"inbox_messages">, "message_id" | "references_header" | "subject" | "from_email">;
  text: string;
}): Promise<ReplyResult> {
  const { inbox, original } = args;
  const text = args.text.replace(/\r\n/g, "\n").trim();

  const subject = reSubject(original.subject) || "Re:";
  const signature = inbox.signature.trim();
  const html =
    `<!doctype html><html><head><meta charset="utf-8"></head><body>${textToHtml(text)}` +
    (signature ? `<div style="margin-top:16px">${escapeHtml(signature).replace(/\n/g, "<br>")}</div>` : "") +
    `</body></html>`;
  const plain = signature ? `${text}\n\n${signature}` : text;

  const referenceIds = [...(original.references_header?.match(/<[^<>\s]+>/g) ?? []), original.message_id];
  const references = [...new Set(referenceIds)].slice(-10).join(" ");
  const messageId = makeMessageId(inbox.email);

  try {
    const config = await loadAccountConfig(inbox);
    const transport = await createSmtpTransport(config.smtp);
    try {
      await transport.sendMail({
        from: inbox.from_name ? { name: inbox.from_name, address: inbox.email } : inbox.email,
        to: original.from_email,
        envelope: { from: inbox.email, to: original.from_email },
        subject,
        text: plain,
        html,
        messageId,
        inReplyTo: original.message_id,
        references,
      });
    } finally {
      transport.close();
    }
  } catch (error) {
    return { ok: false, error: classifySendError(error).message };
  }
  return { ok: true, messageId, subject, html, references };
}
