import { cn } from "@/lib/utils";

// Categories the user can give to a conversation. They are labels only: they
// don't send, stop or suppress anything. The same keys are checked in the
// database (inbox_messages.category + unibox_bulk), so add a new one in both.
export const CATEGORIES = [
  { key: "interested", label: "Interested", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { key: "meeting_booked", label: "Meeting booked", className: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  { key: "not_interested", label: "Not interested", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { key: "wrong_person", label: "Wrong person", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { key: "follow_up_later", label: "Follow up later", className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];

export function categoryInfo(key: string | null | undefined) {
  return CATEGORIES.find((c) => c.key === key) ?? null;
}

export function CategoryBadge({ category, className }: { category: string | null | undefined; className?: string }) {
  const info = categoryInfo(category);
  if (!info) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        info.className,
        className,
      )}
    >
      {info.label}
    </span>
  );
}
