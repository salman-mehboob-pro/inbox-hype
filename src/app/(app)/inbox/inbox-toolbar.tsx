"use client";

import { Loader2Icon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { plural } from "@/lib/format";
import { syncNow } from "./actions";
import { CATEGORIES } from "./categories";

const ALL = "__all__";
const categoryItems = [
  { value: ALL, label: "All categories" },
  ...CATEGORIES.map((c) => ({ value: c.key as string, label: c.label })),
  { value: "none", label: "No category" },
];

// Search box + category filter (both keep the chosen tab).
export function InboxToolbar({ q, filter, category }: { q: string; filter: string; category: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(q);
  const [, startNavigation] = useTransition();

  function go(next: { q: string; category: string }) {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (next.category) params.set("category", next.category);
    if (next.q.trim()) params.set("q", next.q.trim());
    const query = params.toString();
    startNavigation(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  useEffect(() => {
    if (search.trim() === q) return;
    const timer = setTimeout(() => go({ q: search, category }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, q]);

  return (
    <div className="grid gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, subject…"
          className="pl-8"
          aria-label="Search messages"
        />
      </div>
      <Select
        items={categoryItems}
        value={category || ALL}
        onValueChange={(v) => go({ q: search, category: v === ALL ? "" : String(v) })}
      >
        <SelectTrigger className="w-full" aria-label="Filter by category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {categoryItems.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CheckRepliesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function check() {
    startTransition(async () => {
      const result = await syncNow();
      if (!result.summary) {
        toast.error(result.error ?? "Could not check for replies.");
        return;
      }
      const { replies, bounces, autoReplies, inboxes, errors } = result.summary;
      const found = replies + bounces + autoReplies;
      if (errors) toast.error(result.error ?? "Could not check one of the inboxes.");
      else if (inboxes === 0) toast.info("No inbox with reading (IMAP) turned on.");
      else toast.success(found ? `${plural(replies, "new reply", "new replies")}, ${plural(bounces, "bounce")}` : "No new replies");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" onClick={check} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      {pending ? "Checking…" : "Check for replies"}
    </Button>
  );
}
