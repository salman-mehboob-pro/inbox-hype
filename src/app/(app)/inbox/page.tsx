import { InboxIcon } from "lucide-react";
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
import { Thread } from "./thread";
import { ThreadList, type ThreadRow } from "./thread-list";

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
  const category =
    typeof params.category === "string" && (params.category === "none" || (CATEGORY_KEYS as string[]).includes(params.category))
      ? params.category
      : "";
  const q = typeof params.q === "string" ? cleanSearch(params.q) : "";
  const page = Math.max(1, Number(params.page) || 1);
  const idParam = z.uuid().safeParse(params.id);

  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();

  const [list, unread, readable] = await Promise.all([
    supabase.rpc("unibox_list", {
      p_filter: filter,
      p_category: category || undefined,
      p_search: q || undefined,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
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
  if (unread.error) throw unread.error;
  if (readable.error) throw readable.error;

  const threads = list.data;
  const total = threads[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedId = idParam.success ? idParam.data : undefined;
  // Nothing is open until the user picks a conversation: opening one marks it as
  // read, so opening the newest one automatically would hide new replies.
  const openId = selectedId;

  const href = (next: { id?: string; filter?: string; page?: number }) => {
    const sp = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== "all") sp.set("filter", f);
    if (category) sp.set("category", category);
    if (q) sp.set("q", q);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    if (next.id) sp.set("id", next.id);
    const s = sp.toString();
    return s ? `/inbox?${s}` : "/inbox";
  };

  const rows: ThreadRow[] = threads.map((t) => ({
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

  const isEmpty = total === 0 && filter === "all" && !q && !category;

  return (
    <>
      <PageHeader
        title="Unibox"
        description="All replies from all your inboxes in one place."
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
                ? "When a lead answers one of your campaign emails, it shows up here right away. Bounces and out-of-office answers appear here too."
                : "Replies can't arrive yet. Open your Postal inbox in Email accounts and finish the one-time Postal setup."}
            </p>
          </div>
        </div>
      ) : (
        // Wide screens: the list and the conversation each fill the window height
        // and scroll on their own. Phones: one column, the page scrolls.
        <div className="grid gap-4 lg:h-[calc(100svh-11rem)] lg:min-h-[28rem] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <section className={cn("flex min-h-0 flex-col gap-3", selectedId && "hidden lg:flex")}>
            <InboxToolbar q={q} filter={filter} category={category} />
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

            <div className="grid min-h-0 content-start gap-3 lg:flex-1 lg:overflow-y-auto">
              {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No conversations match.
                </p>
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

          <section className={cn("min-h-0 min-w-0 lg:overflow-y-auto", !selectedId && "hidden lg:block")}>
            {openId ? (
              <Thread id={openId} backHref={href({ page })} />
            ) : (
              <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Select a conversation to read it.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
