"use client";

import { Loader2Icon, TagIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Json } from "@/lib/supabase/database.types";
import { parseTags } from "@/lib/leads/import";
import { plural, timeAgo } from "@/lib/format";
import { changeLeadTags, deleteLeads } from "./actions";

export type LeadRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  website: string | null;
  linkedin_url: string | null;
  timezone: string | null;
  tags: string[];
  custom_fields: Json;
  created_at: string;
};

const fullName = (l: LeadRow) => [l.first_name, l.last_name].filter(Boolean).join(" ");

export function LeadsTable({ leads, allTags }: { leads: LeadRow[]; allTags: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"delete" | "tags" | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [pending, startTransition] = useTransition();

  // Drop selections that are no longer on this page (after delete / navigation).
  const visibleSelected = new Set([...selected].filter((id) => leads.some((l) => l.id === id)));
  const allChecked = leads.length > 0 && visibleSelected.size === leads.length;

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function runDelete() {
    startTransition(async () => {
      const res = await deleteLeads([...visibleSelected]);
      if (res.ok) {
        toast.success(`${plural(res.count ?? 0, "lead")} deleted`);
        setSelected(new Set());
        setDialog(null);
      } else toast.error(res.error);
    });
  }

  function runTags(mode: "add" | "remove") {
    const tags = parseTags(tagInput);
    startTransition(async () => {
      const res = await changeLeadTags([...visibleSelected], tags, mode);
      if (res.ok) {
        const n = plural(res.count ?? 0, "lead");
        toast.success(mode === "add" ? `Tags added to ${n}` : `Tags removed from ${n}`);
        setDialog(null);
        setTagInput("");
      } else toast.error(res.error);
    });
  }

  return (
    <>
      {visibleSelected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{visibleSelected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => setDialog("tags")}>
            <TagIcon />
            Tags
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDialog("delete")}>
            <Trash2Icon />
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {leads.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No leads match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all leads on this page"
                    checked={allChecked}
                    indeterminate={visibleSelected.size > 0 && !allChecked}
                    onCheckedChange={(checked) => setSelected(checked ? new Set(leads.map((l) => l.id)) : new Set())}
                  />
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Name</TableHead>
                <TableHead className="hidden md:table-cell">Company</TableHead>
                <TableHead className="hidden lg:table-cell">Tags</TableHead>
                <TableHead className="hidden xl:table-cell">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.id} data-state={visibleSelected.has(l.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${l.email}`}
                      checked={visibleSelected.has(l.id)}
                      onCheckedChange={(checked) => toggle(l.id, Boolean(checked))}
                    />
                  </TableCell>
                  <TableCell className="max-w-64">
                    <Link href={`/leads/${l.id}`} className="block truncate font-medium hover:underline">
                      {l.email}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Link href={`/leads/${l.id}`} className="hover:underline">
                      {fullName(l)}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{l.company}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {l.tags.slice(0, 4).map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                      {l.tags.length > 4 && <Badge variant="outline">+{l.tags.length - 4}</Badge>}
                    </div>
                  </TableCell>
                  {/* Relative time can differ by a minute between server and browser. */}
                  <TableCell className="hidden text-muted-foreground xl:table-cell" suppressHydrationWarning>
                    {timeAgo(l.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {plural(visibleSelected.size, "lead")}?</DialogTitle>
            <DialogDescription>
              They are removed from all campaigns too. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" disabled={pending} onClick={runDelete}>
              {pending && <Loader2Icon className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "tags"} onOpenChange={(o) => setDialog(o ? "tags" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tags for {plural(visibleSelected.size, "lead")}</DialogTitle>
            <DialogDescription>Separate tags with commas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="bulkTags">Tags</Label>
            <Input
              id="bulkTags"
              list="known-tags"
              placeholder="e.g. vip, follow-up"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
            />
            <datalist id="known-tags">
              {allTags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pending || !tagInput.trim()} onClick={() => runTags("remove")}>
              Remove tags
            </Button>
            <Button disabled={pending || !tagInput.trim()} onClick={() => runTags("add")}>
              {pending && <Loader2Icon className="animate-spin" />}
              Add tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

