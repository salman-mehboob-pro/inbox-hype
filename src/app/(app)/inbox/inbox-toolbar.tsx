"use client";

import { Loader2Icon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { plural } from "@/lib/format";
import { syncNow } from "./actions";

// Search box (keeps the chosen filter) + "Check for replies".
export function InboxToolbar({ q, filter }: { q: string; filter: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(q);
  const [, startNavigation] = useTransition();

  useEffect(() => {
    if (search.trim() === q) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (search.trim()) params.set("q", search.trim());
      const query = params.toString();
      startNavigation(() => router.replace(query ? `${pathname}?${query}` : pathname));
    }, 350);
    return () => clearTimeout(timer);
  }, [search, q, filter, pathname, router]);

  return (
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
