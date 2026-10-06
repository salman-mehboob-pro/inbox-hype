import { ArrowLeftIcon, MailWarningIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { CategoryBadge } from "./categories";
import { MessageBody } from "./email-frame";
import { KIND_LABEL, KindBadge } from "./kind-badge";
import { LocalTime } from "./local-time";
import { MarkRead } from "./mark-read";
import { ReplyBox } from "./reply-box";
import { ThreadActions } from "./thread-actions";

type Item = {
  key: string;
  at: string;
  outgoing: boolean;
  from: string;
  to: string;
  label: string;
  subject: string;
  html: string | null;
  text: string | null;
  selected: boolean;
};

// One message and the whole conversation around it (what we sent, what they
// answered, what we answered).
export async function Thread({ id, backHref }: { id: string; backHref: string }) {
  const supabase = await createClient();
  const { data: message, error } = await supabase
    .from("inbox_messages")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!message) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        This message was not found.
      </div>
    );
  }

  const { lead_id: leadId, campaign_id: campaignId, email_account_id: inboxId } = message;

  const [inbox, lead, campaign, sent, others] = await Promise.all([
    supabase.from("email_accounts").select("id, email, status").eq("id", inboxId).maybeSingle(),
    leadId
      ? supabase.from("leads").select("id, email, first_name, last_name, company").eq("id", leadId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    campaignId
      ? supabase.from("campaigns").select("id, name").eq("id", campaignId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    leadId && campaignId
      ? supabase
          .from("sent_messages")
          .select("id, step_position, subject, sent_at, body_html, to_email")
          .eq("lead_id", leadId)
          .eq("campaign_id", campaignId)
          .eq("email_account_id", inboxId)
          .in("status", ["sent", "bounced"])
      : Promise.resolve({ data: [], error: null }),
    leadId && campaignId
      ? supabase
          .from("inbox_messages")
          .select(
            "id, direction, kind, from_email, from_name, to_email, subject, text_body, html_body, received_at, category, is_read",
          )
          .eq("lead_id", leadId)
          .eq("campaign_id", campaignId)
          .eq("email_account_id", inboxId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [inbox, lead, campaign, sent, others]) if (result.error) throw result.error;

  const inboxEmail = inbox.data?.email ?? "your inbox";
  const items: Item[] = [
    ...(sent.data ?? []).map((m) => ({
      key: `s-${m.id}`,
      at: m.sent_at ?? message.received_at,
      outgoing: true,
      from: inboxEmail,
      to: m.to_email,
      label: `Step ${m.step_position}`,
      subject: m.subject,
      html: m.body_html,
      text: null,
      selected: false,
    })),
    ...(others.data ?? []).map((m) => ({
      key: `m-${m.id}`,
      at: m.received_at,
      outgoing: m.direction === "outbound",
      from: m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email,
      to: m.to_email ?? "",
      label: m.direction === "outbound" ? "Your reply" : (KIND_LABEL[m.kind] ?? "Reply"),
      subject: m.subject,
      html: m.html_body,
      text: m.text_body,
      selected: m.id === message.id,
    })),
  ];
  // The message itself is always shown, even if the lead was deleted.
  if (!items.some((i) => i.selected)) {
    items.push({
      key: `m-${message.id}`,
      at: message.received_at,
      outgoing: false,
      from: message.from_name ? `${message.from_name} <${message.from_email}>` : message.from_email,
      to: message.to_email ?? "",
      label: KIND_LABEL[message.kind] ?? "Reply",
      subject: message.subject,
      html: message.html_body,
      text: message.text_body,
      selected: true,
    });
  }
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // The category of the conversation = the newest one that was set on any message of it.
  const thread = others.data ?? [];
  const category =
    [...thread]
      .filter((m) => m.category)
      .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())[0]?.category ??
    message.category;
  const hasUnread = !message.is_read || thread.some((m) => m.direction === "inbound" && !m.is_read);

  const leadName = lead.data
    ? [lead.data.first_name, lead.data.last_name].filter(Boolean).join(" ") || lead.data.email
    : message.from_name || message.from_email;

  return (
    <div className="grid gap-4">
      {hasUnread && <MarkRead id={message.id} />}

      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden">
        <ArrowLeftIcon className="size-4" />
        All messages
      </Link>

      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{message.subject || "(no subject)"}</h2>
            <KindBadge kind={message.kind} />
            <CategoryBadge category={category} />
          </div>
          <ThreadActions messageId={message.id} category={category} backHref={backHref} />
        </div>
        <p className="text-sm text-muted-foreground">
          {lead.data ? (
            <Link href={`/leads/${lead.data.id}`} className="font-medium text-foreground hover:underline">
              {leadName}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{leadName}</span>
          )}
          {lead.data?.company && <> · {lead.data.company}</>}
          {campaign.data && (
            <>
              {" · "}
              <Link href={`/campaigns/${campaign.data.id}`} className="hover:underline">
                {campaign.data.name}
              </Link>
            </>
          )}
          {" · to "}
          {inboxEmail}
        </p>
      </div>

      <div className="grid gap-2">
        {items.map((item) => (
          <details key={item.key} open={item.selected} className="group rounded-lg border bg-card">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm marker:hidden">
              <span className="font-medium">{item.outgoing ? "You" : item.from}</span>
              <Badge variant={item.outgoing ? "secondary" : "outline"}>{item.label}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                <LocalTime iso={item.at} />
              </span>
            </summary>
            <div className="border-t p-3">
              <MessageBody html={item.html} text={item.text} title={`${item.label}: ${item.subject}`} />
            </div>
          </details>
        ))}
      </div>

      {message.kind === "reply" && inbox.data && inbox.data.status !== "error" && (
        <ReplyBox messageId={message.id} to={message.from_email} from={inboxEmail} />
      )}
      {message.kind === "reply" && inbox.data?.status === "error" && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <MailWarningIcon className="size-4 shrink-0" />
          {inboxEmail} has a problem, so you can&apos;t reply from it. Fix it in Email accounts first.
        </p>
      )}
      {message.kind === "bounce" && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          This address could not be reached. It was added to the suppression list, so no more emails will be sent to it.
        </p>
      )}
      {message.kind === "auto_reply" && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          This is an automatic reply. The sequence keeps going.
        </p>
      )}
    </div>
  );
}
