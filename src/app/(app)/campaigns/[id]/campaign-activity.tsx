"use client";

import {
  CalendarIcon,
  ColumnsIcon,
  EyeIcon,
  MousePointerClickIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  TriangleAlertIcon,
  UserXIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ActivityRow = {
  id: number;
  type: string;
  created_at: string;
  lead_id: string | null;
  lead_email: string | null;
  lead_name: string | null;
  step_position: number | null;
  subject: string | null;
  inbox_email: string | null;
};

export type ActivityFilters = { q: string; date: string; type: string; step: string; page: number };

const TYPES: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  sent: { label: "Sent", icon: SendIcon, className: "text-sky-700 dark:text-sky-400" },
  opened: { label: "Opened", icon: EyeIcon, className: "text-violet-700 dark:text-violet-400" },
  clicked: { label: "Clicked", icon: MousePointerClickIcon, className: "text-indigo-700 dark:text-indigo-400" },
  replied: { label: "Replied", icon: ReplyIcon, className: "text-emerald-700 dark:text-emerald-400" },
  bounced: { label: "Bounced", icon: TriangleAlertIcon, className: "text-destructive" },
  unsubscribed: { label: "Unsubscribed", icon: UserXIcon, className: "text-amber-700 dark:text-amber-400" },
  failed: { label: "Failed", icon: XCircleIcon, className: "text-destructive" },
};

const DATE_ITEMS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const COLUMNS = [
  { key: "lead", label: "Lead" },
  { key: "type", label: "Event" },
  { key: "step", label: "Step" },
  { key: "subject", label: "Subject" },
  { key: "inbox", label: "Inbox" },
  { key: "time", label: "Time" },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];

const COLUMNS_STORAGE_KEY = "inboxhype.activity.columns";
const COLUMNS_EVENT = "inboxhype:activity-columns";
const DEFAULT_COLUMNS: ColumnKey[] = ["lead", "type", "step", "subject", "time"];

function readColumns(): string | null {
  try {
    return localStorage.getItem(COLUMNS_STORAGE_KEY);
  } catch {
    return null; // storage blocked
  }
}

function writeColumns(columns: ColumnKey[]) {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
  } catch {
    // storage blocked: the change just won't be remembered
  }
  window.dispatchEvent(new Event(COLUMNS_EVENT));
}

function subscribeColumns(onChange: () => void) {
  window.addEventListener(COLUMNS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLUMNS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function parseColumns(raw: string | null): ColumnKey[] {
  try {
    const saved: unknown = JSON.parse(raw ?? "null");
    if (Array.isArray(saved)) {
      const valid = COLUMNS.map((c) => c.key).filter((k) => saved.includes(k));
      if (valid.length) return valid;
    }
  } catch {
    // bad data: use defaults
  }
  return DEFAULT_COLUMNS;
}

export function CampaignActivity({
  rows,
  total,
  pageSize,
  filters,
  stepCount,
}: {
  rows: ActivityRow[];
  total: number;
  pageSize: number;
  filters: ActivityFilters;
  stepCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.q);
  const [, startTransition] = useTransition();

  // Which columns are shown is remembered per browser.
  const storedColumns = useSyncExternalStore(subscribeColumns, readColumns, () => null);
  const columns = useMemo(() => parseColumns(storedColumns), [storedColumns]);

  function toggleColumn(key: ColumnKey, on: boolean) {
    const next = on
      ? COLUMNS.map((c) => c.key).filter((k) => k === key || columns.includes(k))
      : columns.filter((c) => c !== key);
    writeColumns(next);
  }

  function setParam(changes: Partial<Record<"aq" | "adate" | "atype" | "astep", string>>) {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", "activity");
    sp.delete("apage");
    for (const [k, v] of Object.entries(changes)) {
      if (v && v !== "all") sp.set(k, v);
      else sp.delete(k);
    }
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (search.trim() === filters.q) return;
    const t = setTimeout(() => setParam({ aq: search.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", "activity");
    if (p > 1) sp.set("apage", String(p));
    else sp.delete("apage");
    return `${pathname}?${sp.toString()}`;
  };

  const typeItems = [{ value: "all", label: "All types" }, ...Object.entries(TYPES).map(([value, t]) => ({ value, label: t.label }))];
  const stepItems = [
    { value: "all", label: "All steps" },
    ...Array.from({ length: stepCount }, (_, i) => ({ value: String(i + 1), label: `Step ${i + 1}` })),
  ];
  const show = (k: ColumnKey) => columns.includes(k);
  const filtered = Boolean(filters.q || filters.date !== "all" || filters.type !== "all" || filters.step !== "all");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search activity by email or subject"
            placeholder="Search by email or subject…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterSelect label="Date" items={DATE_ITEMS} value={filters.date} onChange={(v) => setParam({ adate: v })} />
        <FilterSelect label="Type" items={typeItems} value={filters.type} onChange={(v) => setParam({ atype: v })} />
        <FilterSelect label="Step" items={stepItems} value={filters.step} onChange={(v) => setParam({ astep: v })} />
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <ColumnsIcon />
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={show(c.key)}
                  disabled={show(c.key) && columns.length === 1}
                  onCheckedChange={(on) => toggleColumn(c.key, Boolean(on))}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted">
            <CalendarIcon className="size-5 text-muted-foreground" />
          </span>
          <p className="font-medium">{filtered ? "No activity matches these filters" : "No activity yet"}</p>
          <p className="text-sm text-muted-foreground">
            {filtered ? "Try other filters." : "Emails sent from this campaign will appear here."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.filter((c) => show(c.key)).map((c) => (
                  <TableHead key={c.key} className={c.key === "step" ? "text-right" : undefined}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const t = TYPES[r.type] ?? { label: r.type, icon: SendIcon, className: "" };
                return (
                  <TableRow key={r.id}>
                    {show("lead") && (
                      <TableCell className="max-w-56">
                        {r.lead_id ? (
                          <Link href={`/leads/${r.lead_id}`} className="grid hover:underline">
                            <span className="truncate font-medium">{r.lead_email}</span>
                            {r.lead_name && <span className="truncate text-xs text-muted-foreground">{r.lead_name}</span>}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Deleted lead</span>
                        )}
                      </TableCell>
                    )}
                    {show("type") && (
                      <TableCell>
                        <span className={cn("inline-flex items-center gap-1.5 font-medium", t.className)}>
                          <t.icon className="size-4" />
                          {t.label}
                        </span>
                      </TableCell>
                    )}
                    {show("step") && (
                      <TableCell className="text-right tabular-nums">{r.step_position ?? "—"}</TableCell>
                    )}
                    {show("subject") && <TableCell className="max-w-72 truncate">{r.subject ?? "—"}</TableCell>}
                    {show("inbox") && (
                      <TableCell className="max-w-56 truncate text-muted-foreground">{r.inbox_email ?? "—"}</TableCell>
                    )}
                    {show("time") && (
                      <TableCell
                        className="whitespace-nowrap text-muted-foreground"
                        title={new Date(r.created_at).toLocaleString()}
                        suppressHydrationWarning
                      >
                        {timeAgo(r.created_at)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Pagination">
          <span className="text-muted-foreground">
            Page {filters.page} of {pages} · {total.toLocaleString()} events
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={pageHref(filters.page - 1)} scroll={false} />}
              className={cn(filters.page <= 1 && "pointer-events-none opacity-50")}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={pageHref(filters.page + 1)} scroll={false} />}
              className={cn(filters.page >= pages && "pointer-events-none opacity-50")}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(String(v))}>
      <SelectTrigger aria-label={`Filter by ${label.toLowerCase()}`} className="min-w-36">
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
