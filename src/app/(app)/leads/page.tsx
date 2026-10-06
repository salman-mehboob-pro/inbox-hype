import { UploadIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { AddLeadDialog } from "./add-lead-dialog";
import { LeadsTable } from "./leads-table";
import { LeadsToolbar } from "./leads-toolbar";

export const metadata: Metadata = { title: "Leads" };

const PAGE_SIZE = 50;

// Remove characters that have meaning in PostgREST filter strings.
function cleanSearch(q: string) {
  return q.replace(/[%_,()\\*"':]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? cleanSearch(params.q) : "";
  const tag = typeof params.tag === "string" ? params.tag.slice(0, 50) : "";
  const page = Math.max(1, Number(params.page) || 1);

  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(
      "id, email, first_name, last_name, company, title, phone, website, linkedin_url, timezone, tags, custom_fields, created_at",
      { count: "exact" },
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    query = query.or(
      ["email", "first_name", "last_name", "company"].map((c) => `${c}.ilike.%${q}%`).join(","),
    );
  }
  if (tag) query = query.contains("tags", [tag]);

  const [
    { data: leads, count, error },
    { data: tags, error: tagsError },
    { data: campaigns, error: campaignsError },
  ] = await Promise.all([
    query,
    supabase.rpc("workspace_lead_tags", { p_workspace_id: workspace.id }),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .neq("status", "completed")
      .order("created_at", { ascending: false }),
  ]);
  if (error) throw error;
  if (tagsError) throw tagsError;
  if (campaignsError) throw campaignsError;

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFiltered = Boolean(q || tag);

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (tag) sp.set("tag", tag);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/leads?${s}` : "/leads";
  };

  const actions = (
    <>
      <AddLeadDialog campaigns={campaigns ?? []} />
      <Button nativeButton={false} render={<Link href="/leads/import" />}>
        <UploadIcon />
        Import CSV
      </Button>
    </>
  );

  if (total === 0 && !isFiltered) {
    return (
      <>
        <PageHeader title="Leads" description="The people your campaigns will email." />
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <UsersIcon className="size-5 text-muted-foreground" />
          </span>
          <div className="grid gap-1">
            <p className="font-medium">No leads yet</p>
            <p className="text-sm text-muted-foreground">Import a CSV file or add a lead by hand.</p>
          </div>
          <div className="flex gap-2">{actions}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Leads"
        description={isFiltered ? `${plural(total, "matching lead")}` : plural(total, "lead")}
        actions={actions}
      />
      <LeadsToolbar q={q} tag={tag} tags={tags ?? []} />
      <LeadsTable leads={leads ?? []} allTags={(tags ?? []).map((t) => t.tag)} />
      {pages > 1 && (
        <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Pagination">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={pageHref(page - 1)} />}
              disabled={page <= 1}
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={pageHref(page + 1)} />}
              aria-disabled={page >= pages}
              className={page >= pages ? "pointer-events-none opacity-50" : undefined}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}
