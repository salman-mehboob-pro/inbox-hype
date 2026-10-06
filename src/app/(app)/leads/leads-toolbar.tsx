"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export function LeadsToolbar({
  q,
  tag,
  tags,
}: {
  q: string;
  tag: string;
  tags: { tag: string; lead_count: number }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(q);
  const [, startTransition] = useTransition();

  function navigate(next: { q?: string; tag?: string }) {
    const sp = new URLSearchParams();
    const nq = next.q ?? search;
    const nt = next.tag ?? tag;
    if (nq.trim()) sp.set("q", nq.trim());
    if (nt) sp.set("tag", nt);
    const s = sp.toString();
    startTransition(() => router.replace(s ? `${pathname}?${s}` : pathname));
  }

  // Search as you type (after a short pause).
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => navigate({ q: search }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const tagItems = [
    { value: ALL, label: "All tags" },
    ...tags.map((t) => ({ value: t.tag, label: `${t.tag} (${t.lead_count})` })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search leads"
          placeholder="Search email, name, company"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {tags.length > 0 && (
        <Select
          items={tagItems}
          value={tag || ALL}
          onValueChange={(v) => navigate({ tag: v === ALL ? "" : String(v) })}
        >
          <SelectTrigger className="w-48" aria-label="Filter by tag">
            <SelectValue />
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
      {(q || tag) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            navigate({ q: "", tag: "" });
          }}
        >
          <XIcon />
          Clear filters
        </Button>
      )}
    </div>
  );
}
