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

// A conversation: what we sent (campaign steps), what they answered, what we
// answered from the Unibox. Opened from an incoming message (Thread) or from
// the Sent tab (SentThread).

type Supabase = Awaited<ReturnType<typeof createClient>>;

type Item = {
  key: string;
  at: string;
  outgoing: boolean;
  from: string;
  label: string;
  subject: string;
  html: string | null;
  text: string | null;
  selected: boolean;
};

type InboxMessage = {
  id: string;
  direction: string;
  kind: string;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string;
  text_body: string | null;
  html_body: string | null;
  received_at: string;
  category: string | null;
  is_read: boolean;
  message_id: string;
};

// Which conversation: one inbox + one lead in one campaign, or (no campaign)
// one lead / one outside address on that inbox.
type ConversationKey = {
  inboxId: string;
  leadId: string | null;
  campaignId: string | null;
  peerEmail: string;
};

const MESSAGE_COLUMNS =
  "id, direction, kind, from_email, from_name, to_email, subject, text_body, html_body, received_at, category, is_read, message_id";

// A plain address can be used in a PostgREST filter (quoted).
const SAFE_EMAIL = /^[^\s"\\,()]+@[^\s"\\,()]+$/;

async function loadConversation(supabase: Supabase, key: ConversationKey) {
  const { inboxId, leadId, campaignId, peerEmail } = key;
  let messages = supabase
    .from("inbox_messages")
    .select(MESSAGE_COLUMNS)
    .eq("email_account_id", inboxId)
    .is("deleted_at", null);
  messages = campaignId ? messages.eq("campaign_id", campaignId) : messages.is("campaign_id", null);
  if (leadId) messages = messages.eq("lead_id", leadId);
  else if (SAFE_EMAIL.test(peerEmail)) {
    messages = messages.is("lead_id", null).or(`from_email.eq."${peerEmail}",to_email.eq."${peerEmail}"`);
  } else messages = messages.eq("from_email", peerEmail);

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
          .select("id, step_position, subject, sent_at, created_at, body_html")
          .eq("lead_id", leadId)
          .eq("campaign_id", campaignId)
          .eq("email_account_id", inboxId)
          .in("status", ["sent", "bounced"])
      : Promise.resolve({ data: [], error: null }),
    messages,
  ]);
  for (const result of [inbox, lead, campaign, sent, others]) if (result.error) throw result.error;
  return {
    inbox: inbox.data,
    lead: lead.data,
    campaign: campaign.data,
    sent: sent.data ?? [],
    messages: (others.data ?? []) as InboxMessage[],
  };
}

type Conversation = Awaited<ReturnType<typeof loadConversation>>;

function buildItems(conversation: Conversation, selectedKey: string): Item[] {
  const inboxEmail = conversation.inbox?.email ?? "your inbox";
  const items: Item[] = [
    ...conversation.sent.map((m) => ({
      key: `s-${m.id}`,
      at: m.sent_at ?? m.created_at,
      outgoing: true,
      from: inboxEmail,
      label: `Step ${m.step_position}`,
      subject: m.subject,
      html: m.body_html,
      text: null,
      selected: `s-${m.id}` === selectedKey,
    })),
    ...conversation.messages.map((m) => ({
      key: `m-${m.id}`,
      at: m.received_at,
      outgoing: m.direction === "outbound",
      from: m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email,
      label: m.direction === "outbound" ? "Your reply" : (KIND_LABEL[m.kind] ?? "Reply"),
      subject: m.subject,
      html: m.html_body,
      text: m.text_body,
      selected: `m-${m.id}` === selectedKey,
    })),
  ];
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function personName(conversation: Conversation, fallbackName: string | null, fallbackEmail: string) {
  const lead = conversation.lead;
  if (lead) return [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email;
  return fallbackName || fallbackEmail;
}

function Header({
  conversation,
  title,
  badges,
  actions,
  name,
  backHref,
}: {
  conversation: Conversation;
  title: string;
  badges: React.ReactNode;
  actions?: React.ReactNode;
  name: string;
  backHref: string;
}) {
  const { lead, campaign } = conversation;
  return (
    <>
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden">
        <ArrowLeftIcon className="size-4" />
        All messages
      </Link>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{title || "(no subject)"}</h2>
            {badges}
          </div>
          {actions}
        </div>
        <p className="text-sm text-muted-foreground">
          {lead ? (
            <Link href={`/leads/${lead.id}`} className="font-medium text-foreground hover:underline">
              {name}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{name}</span>
          )}
          {lead?.company && <> · {lead.company}</>}
          {campaign && (
            <>
              {" · "}
              <Link href={`/campaigns/${campaign.id}`} className="hover:underline">
                {campaign.name}
              </Link>
            </>
          )}
          {" · "}
          {conversation.inbox?.email ?? "removed inbox"}
        </p>
      </div>
    </>
  );
}

function Messages({ items }: { items: Item[] }) {
  return (
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
  );
}

// The reply box answers the newest message the person sent (a real reply or other mail).
function Reply({ conversation, target }: { conversation: Conversation; target: InboxMessage | undefined }) {
  const inbox = conversation.inbox;
  if (!target || !inbox) return null;
  if (inbox.status === "error") {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <MailWarningIcon className="size-4 shrink-0" />
        {inbox.email} has a problem, so you can&apos;t reply from it. Fix it in Email accounts first.
      </p>
    );
  }
  return <ReplyBox messageId={target.id} to={target.from_email} from={inbox.email} />;
}

function replyTarget(messages: InboxMessage[]) {
  return messages
    .filter((m) => m.direction === "inbound" && (m.kind === "reply" || m.kind === "other"))
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())[0];
}

// Opened from an incoming message (Unibox list) --------------------------------------

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

  const conversation = await loadConversation(supabase, {
    inboxId: message.email_account_id,
    leadId: message.lead_id,
    campaignId: message.campaign_id,
    peerEmail: message.from_email,
  });
  const items = buildItems(conversation, `m-${message.id}`);
  // The message itself is always shown (even if its lead or campaign was deleted).
  if (!items.some((i) => i.selected)) {
    items.push({
      key: `m-${message.id}`,
      at: message.received_at,
      outgoing: false,
      from: message.from_name ? `${message.from_name} <${message.from_email}>` : message.from_email,
      label: KIND_LABEL[message.kind] ?? "Reply",
      subject: message.subject,
      html: message.html_body,
      text: message.text_body,
      selected: true,
    });
  }

  // The category of the conversation = the newest one that was set on any message of it.
  const thread = conversation.messages;
  const category =
    [...thread]
      .filter((m) => m.category)
      .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())[0]?.category ??
    message.category;
  const hasUnread = !message.is_read || thread.some((m) => m.direction === "inbound" && !m.is_read);

  return (
    <div className="grid gap-4">
      {hasUnread && <MarkRead id={message.id} />}
      <Header
        conversation={conversation}
        title={message.subject}
        badges={
          <>
            <KindBadge kind={message.kind} />
            <CategoryBadge category={category} />
          </>
        }
        actions={<ThreadActions messageId={message.id} category={category} backHref={backHref} />}
        name={personName(conversation, message.from_name, message.from_email)}
        backHref={backHref}
      />
      <Messages items={items} />
      <Reply conversation={conversation} target={replyTarget(thread)} />
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

// Opened from the Sent tab -------------------------------------------------------------

// source "c" = a campaign email (sent_messages), "r" = a reply written in the Unibox.
export async function SentThread({ source, id, backHref }: { source: "c" | "r"; id: string; backHref: string }) {
  const supabase = await createClient();
  let key: ConversationKey | null = null;
  let title = "";
  let selectedKey = "";
  let status: { delivery: string | null; opened: boolean; clicked: boolean; replied: boolean; bounced: boolean } | null =
    null;

  if (source === "c") {
    const { data, error } = await supabase
      .from("sent_messages")
      .select("id, email_account_id, lead_id, campaign_id, to_email, subject, status, delivery_status, opened_at, clicked_at, replied_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (data?.email_account_id) {
      key = { inboxId: data.email_account_id, leadId: data.lead_id, campaignId: data.campaign_id, peerEmail: data.to_email };
      title = data.subject;
      selectedKey = `s-${data.id}`;
      status = {
        delivery: data.delivery_status,
        opened: Boolean(data.opened_at),
        clicked: Boolean(data.clicked_at),
        replied: Boolean(data.replied_at),
        bounced: data.status === "bounced",
      };
    }
  } else {
    const { data, error } = await supabase
      .from("inbox_messages")
      .select("id, email_account_id, lead_id, campaign_id, to_email, subject")
      .eq("id", id)
      .eq("direction", "outbound")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      key = { inboxId: data.email_account_id, leadId: data.lead_id, campaignId: data.campaign_id, peerEmail: data.to_email ?? "" };
      title = data.subject;
      selectedKey = `m-${data.id}`;
    }
  }

  if (!key) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        This email was not found (its inbox may have been removed).
      </div>
    );
  }

  const conversation = await loadConversation(supabase, key);
  const items = buildItems(conversation, selectedKey);

  return (
    <div className="grid gap-4">
      <Header
        conversation={conversation}
        title={title}
        badges={
          <>
            <Badge variant="secondary">Sent</Badge>
            {status?.bounced && <Badge variant="destructive">Bounced</Badge>}
            {status?.delivery === "delivered" && !status.bounced && <Badge variant="outline">Delivered</Badge>}
            {status?.delivery === "delayed" && <Badge variant="outline">Delayed</Badge>}
            {status?.delivery === "held" && <Badge variant="outline">Held by Postal</Badge>}
            {status?.opened && <Badge variant="outline">Opened</Badge>}
            {status?.clicked && <Badge variant="outline">Clicked</Badge>}
            {status?.replied && <Badge variant="outline">Replied</Badge>}
          </>
        }
        name={personName(conversation, null, key.peerEmail)}
        backHref={backHref}
      />
      <Messages items={items} />
      <Reply conversation={conversation} target={replyTarget(conversation.messages)} />
    </div>
  );
}
