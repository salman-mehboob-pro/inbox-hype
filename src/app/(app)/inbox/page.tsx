import { InboxIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { snippet } from "@/lib/inbox/parse";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { CheckRepliesButton, InboxToolbar } from "./inbox-toolbar";
import { KindBadge, Thread } from "./thread";

export const metadata: Metadata = { title: "Unibox" };

const PAGE_SIZE = 40;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "replies", label: "Replies" },
  { key: "auto", label: "Out of office" },
  { key: "bounced", label: "Bounced" },
] as const;

// Remove characters that have meaning in filter strings.
function cleanSearch(q: string) {
  return q.replace(/[%_,()\\*"':]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.filter)?.key ?? "all";
  const q = typeof params.q === "string" ? cleanSearch(params.q) : "";
  const page = Math.max(1, Number(params.page) || 1);
  const idParam = z.uuid().safeParse(params.id);

  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();

  const [list, unread, readable] = await Promise.all([
    supabase.rpc("unibox_list", {
      p_filter: filter,
      p_search: q || undefined,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("direction", "inbound")
      .eq("is_read", false),
    supabase
      .from("email_accounts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .not("imap_host", "is", null),
  ]);
  if (list.error) throw list.error;
  if (unread.error) throw unread.error;
  if (readable.error) throw readable.error;

  const messages = list.data;
  const total = messages[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedId = idParam.success ? idParam.data : undefined;
  // On wide screens the newest message is open by default.
  const openId = selectedId ?? messages[0]?.id;

  const href = (next: { id?: string; filter?: string; page?: number }) => {
    const sp = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== "all") sp.set("filter", f);
    if (q) sp.set("q", q);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    if (next.id) sp.set("id", next.id);
    const s = sp.toString();
    return s ? `/inbox?${s}` : "/inbox";
  };

  const isEmpty = total === 0 && filter === "all" && !q;

  return (
    <>
      <PageHeader
        title="Unibox"
        description="All replies from all your inboxes in one place."
        actions={readable.count ? <CheckRepliesButton /> : undefined}
      />

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <InboxIcon className="size-5 text-muted-foreground" />
          </span>
          <div className="grid max-w-md gap-1">
            <p className="font-medium">No replies yet</p>
            <p className="text-sm text-muted-foreground">
              {readable.count
                ? "When a lead answers one of your campaign emails, it shows up here within a couple of minutes. Bounces and out-of-office answers appear here too."
                : "None of your inboxes can read replies yet. Add an inbox with reading (IMAP) turned on."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
          <section className={cn("grid gap-3", selectedId && "hidden lg:grid")}>
            <InboxToolbar q={q} filter={filter} />
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

            {messages.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No messages match.
              </p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border">
                {messages.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={href({ id: m.id, page })}
                      className={cn(
                        "grid gap-0.5 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60",
                        m.id === openId && "bg-muted",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {!m.is_read && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        <span className={cn("min-w-0 flex-1 truncate", !m.is_read && "font-semibold")}>
                          {m.lead_name || m.from_name || m.from_email}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                          {timeAgo(m.received_at)}
                        </span>
                      </span>
                      <span className={cn("truncate", !m.is_read && "font-medium")}>{m.subject || "(no subject)"}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{snippet(m.preview) || " "}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {m.kind !== "reply" && <KindBadge kind={m.kind} />}
                        {m.campaign_name && <span className="truncate">{m.campaign_name}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
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
          </section>

          <section className={cn("min-w-0", !selectedId && "hidden lg:block")}>
            {openId ? (
              <Thread id={openId} backHref={href({ page })} />
            ) : (
              <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select a message to read it.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
