"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES } from "./categories";

const ALL = "__all__";
const categoryItems = [
  { value: ALL, label: "All categories" },
  ...CATEGORIES.map((c) => ({ value: c.key as string, label: c.label })),
  { value: "none", label: "No category" },
];

// Search box + category filter (both keep the chosen tab). The Sent tab has no categories.
export function InboxToolbar({
  q,
  filter,
  category,
  showCategory = true,
}: {
  q: string;
  filter: string;
  category: string;
  showCategory?: boolean;
}) {
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
      {showCategory && (
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
      )}
    </div>
  );
}
