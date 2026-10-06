"use client";

import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plural, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addLeadsToCampaign, removeCampaignLeads } from "../actions";
import { CampaignLeadStatusBadge, LEAD_STATUS_LABELS } from "../status-badge";

type Row = {
  id: string;
  status: string;
  next_step: number;
  last_sent_at: string | null;
  lead: { id: string; email: string; first_name: string | null; last_name: string | null; company: string | null };
};

export function CampaignLeads({
  campaignId,
  rows,
  total,
  page,
  pageSize,
  counts,
  tags,
  completed,
}: {
  campaignId: string;
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  tags: { tag: string; lead_count: number }[];
  completed: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "tag">("all");
  const [tag, setTag] = useState("");
  const [pending, startTransition] = useTransition();

  const visibleSelected = new Set([...selected].filter((id) => rows.some((r) => r.id === id)));
  const allChecked = rows.length > 0 && visibleSelected.size === rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const pageHref = (p: number) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", "leads");
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    return `${pathname}?${sp.toString()}`;
  };

  function add() {
    startTransition(async () => {
      const res = await addLeadsToCampaign(campaignId, mode === "all" ? { mode } : { mode, tag });
      if (res.ok) {
        toast.success(res.count ? `${plural(res.count, "lead")} added` : "No new leads to add (already in this campaign)");
        setAddOpen(false);
      } else toast.error(res.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeCampaignLeads(campaignId, [...visibleSelected]);
      if (res.ok) {
        toast.success(`${plural(res.count ?? 0, "lead")} removed`);
        setSelected(new Set());
      } else toast.error(res.error);
    });
  }

  const summary = Object.entries(counts).filter(([, n]) => n > 0);
  const tagItems = tags.map((t) => ({ value: t.tag, label: `${t.tag} (${t.lead_count})` }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {summary.length === 0 ? (
            <span className="text-muted-foreground">No leads in this campaign yet.</span>
          ) : (
            summary.map(([status, n]) => (
              <span key={status} className="rounded-md border px-2 py-1">
                {LEAD_STATUS_LABELS[status] ?? status}: <span className="font-medium tabular-nums">{n.toLocaleString()}</span>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-2">
          {visibleSelected.size > 0 && (
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              Remove {visibleSelected.size}
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)} disabled={completed}>
            <PlusIcon />
            Add leads
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all leads on this page"
                    checked={allChecked}
                    indeterminate={visibleSelected.size > 0 && !allChecked}
                    onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Next step</TableHead>
                <TableHead className="hidden lg:table-cell">Last sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={visibleSelected.has(r.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${r.lead.email}`}
                      checked={visibleSelected.has(r.id)}
                      onCheckedChange={(c) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (c) next.add(r.id);
                          else next.delete(r.id);
                          return next;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="max-w-64">
                    <Link href={`/leads/${r.lead.id}`} className="block truncate font-medium hover:underline">
                      {r.lead.email}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {[r.lead.first_name, r.lead.last_name].filter(Boolean).join(" ")}
                  </TableCell>
                  <TableCell>
                    <CampaignLeadStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {["queued", "in_progress"].includes(r.status) ? r.next_step : "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell" suppressHydrationWarning>
                    {r.last_sent_at ? timeAgo(r.last_sent_at) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
              render={<Link href={pageHref(page - 1)} scroll={false} />}
              className={cn(page <= 1 && "pointer-events-none opacity-50")}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={pageHref(page + 1)} scroll={false} />}
              className={cn(page >= pages && "pointer-events-none opacity-50")}
            >
              Next
            </Button>
          </div>
        </nav>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add leads</DialogTitle>
            <DialogDescription>Leads already in this campaign are skipped.</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2">
            <legend className="sr-only">Which leads</legend>
            <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm", mode === "all" && "border-primary bg-primary/5")}>
              <input type="radio" className="accent-primary" checked={mode === "all"} onChange={() => setMode("all")} />
              All leads
            </label>
            <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm", mode === "tag" && "border-primary bg-primary/5")}>
              <input
                type="radio"
                className="accent-primary"
                checked={mode === "tag"}
                disabled={tags.length === 0}
                onChange={() => setMode("tag")}
              />
              Leads with a tag
              {tags.length === 0 && <span className="text-xs text-muted-foreground">(no tags yet)</span>}
            </label>
            {mode === "tag" && (
              <Select items={tagItems} value={tag || null} onValueChange={(v) => setTag(String(v ?? ""))}>
                <SelectTrigger className="w-full" aria-label="Tag">
                  <SelectValue placeholder="Choose a tag" />
                </SelectTrigger>
                <SelectContent>
                  {tagItems.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </fieldset>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={add} disabled={pending || (mode === "tag" && !tag)}>
              {pending && <Loader2Icon className="animate-spin" />}
              Add leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
