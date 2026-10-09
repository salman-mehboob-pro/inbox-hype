import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { snippet } from "@/lib/inbox/parse";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getCurrentWorkspace } from "@/lib/workspace";
import { CATEGORY_KEYS } from "./categories";
import { InboxToolbar } from "./inbox-toolbar";
import { SentList, type SentRow } from "./sent-list";
import { SentThread, Thread } from "./thread";
import { ThreadList, type ThreadRow } from "./thread-list";

export const metadata: Metadata = { title: "Unibox" };

const PAGE_SIZE = 40;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "replies", label: "Replies" },
  { key: "auto", label: "Out of office" },
  { key: "bounced", label: "Bounced" },
  { key: "sent", label: "Sent" },
] as const;

// An open sent email: "c:<id>" (campaign email) or "r:<id>" (reply written here).
const sentParam = z.string().regex(/^[cr]:[0-9a-f-]{36}$/i);

// Remove characters that have meaning in filter strings.
function cleanSearch(q: string) {
  return q.replace(/[%_,()\\*"':]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

// Text from the database preview: HTML entities back to characters.
function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.filter)?.key ?? "all";
  const isSent = filter === "sent";
  const category =
    !isSent && typeof params.category === "string" && (params.category === "none" || (CATEGORY_KEYS as string[]).includes(params.category))
      ? params.category
      : "";
  const q = typeof params.q === "string" ? cleanSearch(params.q) : "";
  const page = Math.max(1, Number(params.page) || 1);
  const idParam = z.uuid().safeParse(params.id);
  const sentOpen = sentParam.safeParse(params.sent);

  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();

  const [list, sentList, unread, readable] = await Promise.all([
    isSent
      ? Promise.resolve({ data: [], error: null })
      : supabase.rpc("unibox_list", {
          p_filter: filter,
          p_category: category || undefined,
          p_search: q || undefined,
          p_limit: PAGE_SIZE,
          p_offset: (page - 1) * PAGE_SIZE,
        }),
    isSent
      ? supabase.rpc("unibox_sent_list", { p_search: q || undefined, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("direction", "inbound")
      .eq("is_read", false)
      .is("deleted_at", null),
    // Postal servers whose reply route is confirmed (replies can arrive).
    supabase
      .from("postal_servers")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .not("route_ok_at", "is", null),
  ]);
  if (list.error) throw list.error;
  if (sentList.error) throw sentList.error;
  if (unread.error) throw unread.error;
  if (readable.error) throw readable.error;

  const total = isSent ? (sentList.data[0]?.total_count ?? 0) : (list.data[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Nothing is open until the user picks a conversation: opening one marks it as
  // read, so opening the newest one automatically would hide new replies.
  const openId = !isSent && idParam.success ? idParam.data : undefined;
  const openSent = isSent && sentOpen.success ? sentOpen.data.toLowerCase() : undefined;
  const somethingOpen = Boolean(openId || openSent);

  const href = (next: { id?: string; sent?: string; filter?: string; page?: number }) => {
    const sp = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== "all") sp.set("filter", f);
    if (category && f !== "sent") sp.set("category", category);
    if (q) sp.set("q", q);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    if (next.id) sp.set("id", next.id);
    if (next.sent) sp.set("sent", next.sent);
    const s = sp.toString();
    return s ? `/inbox?${s}` : "/inbox";
  };

  const rows: ThreadRow[] = list.data.map((t) => ({
    id: t.id,
    href: href({ id: t.id, page }),
    kind: t.kind,
    name: t.lead_name || t.from_name || t.from_email,
    subject: t.subject,
    preview: snippet(t.preview),
    receivedAt: t.received_at,
    unread: !t.is_read,
    messageCount: Number(t.message_count),
    category: t.category,
    campaignName: t.campaign_name,
  }));

  const sentRows: SentRow[] = sentList.data.map((s) => {
    const key = `${s.source}:${s.id}`;
    return {
      key,
      href: href({ sent: key, page }),
      name: s.lead_name ? `${s.lead_name} <${s.to_email}>` : s.to_email,
      subject: s.subject,
      preview: decodeEntities(s.preview),
      sentAt: s.sent_at,
      label: s.source === "c" ? `Step ${s.step_position ?? 1}` : "Your reply",
      campaignName: s.campaign_name,
      inboxEmail: s.inbox_email,
      bounced: s.status === "bounced",
      opened: s.opened,
      clicked: s.clicked,
      replied: s.replied,
    };
  });

  const emptyText = isSent
    ? q
      ? "No sent emails match."
      : "No emails sent yet. Campaign emails and your replies show up here."
    : filter === "all" && !q && !category
      ? readable.count
        ? "No replies yet. When a lead answers one of your campaign emails, it shows up here right away. Bounces and out-of-office answers appear here too."
        : "Replies can't arrive yet. Open your Postal inbox in Email accounts and finish the one-time Postal setup."
      : "No conversations match.";

  return (
    <>
      <PageHeader title="Unibox" description="All replies from all your inboxes in one place, and everything you sent." />

      {/* Wide screens: the list and the conversation each fill the window height
          and scroll on their own. Phones: one column, the page scrolls. */}
      <div className="grid gap-4 lg:h-[calc(100svh-11rem)] lg:min-h-[28rem] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <section className={cn("flex min-h-0 flex-col gap-3", somethingOpen && "hidden lg:flex")}>
          <InboxToolbar q={q} filter={filter} category={category} showCategory={!isSent} />
          <nav className="flex flex-wrap gap-1" aria-label="Filter messages">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href({ filter: f.key })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  f.key === filter ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {f.label}
                {f.key === "unread" && unread.count ? ` (${unread.count})` : ""}
              </Link>
            ))}
          </nav>

          {/* auto-rows-max: rows keep their full height (the Sent list clips its
              corners with overflow-hidden, which would let it shrink), so this box scrolls. */}
          <div className="grid min-h-0 auto-rows-max content-start gap-3 lg:flex-1 lg:overflow-y-auto">
            {(isSent ? sentRows.length : rows.length) === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : isSent ? (
              <SentList rows={sentRows} openKey={openSent} />
            ) : (
              <ThreadList rows={rows} openId={openId} clearHref={href({})} />
            )}

            {pages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                {page > 1 ? <Link href={href({ page: page - 1 })}>← Newer</Link> : <span />}
                <span>
                  Page {page} of {pages}
                </span>
                {page < pages ? <Link href={href({ page: page + 1 })}>Older →</Link> : <span />}
              </div>
            )}
          </div>
        </section>

        <section className={cn("min-h-0 min-w-0 lg:overflow-y-auto", !somethingOpen && "hidden lg:block")}>
          {openId ? (
            <Thread id={openId} backHref={href({ page })} />
          ) : openSent ? (
            <SentThread source={openSent[0] as "c" | "r"} id={openSent.slice(2)} backHref={href({ page })} />
          ) : (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {isSent ? "Select a sent email to see it." : "Select a conversation to read it."}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
