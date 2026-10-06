"use client";

import { Loader2Icon, MailIcon, MailOpenIcon, TagIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { plural, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bulkAction } from "./actions";
import { CATEGORIES, CategoryBadge, type CategoryKey } from "./categories";
import { KindBadge } from "./kind-badge";

export type ThreadRow = {
  // The newest message of the conversation (what a click opens).
  id: string;
  href: string;
  kind: string;
  name: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
  messageCount: number;
  category: string | null;
  campaignName: string | null;
};

export function ThreadList({
  rows,
  openId,
  clearHref,
}: {
  rows: ThreadRow[];
  // The conversation currently open on the right.
  openId: string | undefined;
  // Where to go when the open conversation is deleted.
  clearHref: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  function run(action: "delete" | "read" | "unread" | "category", value: CategoryKey | null = null) {
    const ids = selected;
    startTransition(async () => {
      const result = await bulkAction({ ids, action, value });
      setConfirmDelete(false);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      const n = plural(ids.length, "conversation");
      if (action === "delete") toast.success(`${n} deleted`);
      else if (action === "category") toast.success(value ? `${n} set to ${CATEGORIES.find((c) => c.key === value)?.label}` : `Category removed from ${n}`);
      else toast.success(`${n} marked ${action === "read" ? "read" : "unread"}`);
      setSelected([]);
      if (action === "delete" && openId && ids.includes(openId)) router.replace(clearHref);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-2 px-1 text-sm">
        <Checkbox
          checked={allSelected}
          onCheckedChange={(checked) => setSelected(checked ? rows.map((r) => r.id) : [])}
          aria-label="Select all conversations on this page"
          disabled={rows.length === 0 || pending}
        />
        {selected.length === 0 ? (
          <span className="text-muted-foreground">Select conversations to delete or label them</span>
        ) : (
          <>
            <span className="font-medium">{selected.length} selected</span>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
                <TagIcon />
                Category
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {CATEGORIES.map((c) => (
                  <DropdownMenuItem key={c.key} onClick={() => run("category", c.key)}>
                    <span className={cn("size-2 rounded-full", c.className.split(" ")[0])} />
                    {c.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => run("category", null)}>
                  <XIcon />
                  Remove category
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run("read")}>
              <MailOpenIcon />
              Read
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run("unread")}>
              <MailIcon />
              Unread
            </Button>
            <Button variant="destructive" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}>
              {pending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              Delete
            </Button>
          </>
        )}
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border">
        {rows.map((row) => (
          <li key={row.id} className={cn("flex items-start gap-1 hover:bg-muted/60", row.id === openId && "bg-muted")}>
            <label className="flex cursor-pointer items-start py-3.5 pr-1 pl-3">
              <Checkbox
                checked={selected.includes(row.id)}
                onCheckedChange={() => toggle(row.id)}
                aria-label={`Select the conversation with ${row.name}`}
                disabled={pending}
              />
            </label>
            <Link href={row.href} className="grid min-w-0 flex-1 gap-0.5 py-2.5 pr-3 text-sm">
              <span className="flex items-center gap-2">
                {row.unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                <span className={cn("min-w-0 flex-1 truncate", row.unread && "font-semibold")}>{row.name}</span>
                {row.messageCount > 1 && (
                  <span className="shrink-0 text-xs text-muted-foreground" title={`${row.messageCount} messages`}>
                    {row.messageCount}
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                  {timeAgo(row.receivedAt)}
                </span>
              </span>
              <span className={cn("truncate", row.unread && "font-medium")}>{row.subject || "(no subject)"}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{row.preview || " "}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <CategoryBadge category={row.category} />
                {row.kind !== "reply" && <KindBadge kind={row.kind} />}
                {row.campaignName && <span className="truncate">{row.campaignName}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {plural(selected.length, "conversation")}?</DialogTitle>
            <DialogDescription>
              {selected.length === 1 ? "It is" : "They are"} removed from the Unibox, with all the messages in{" "}
              {selected.length === 1 ? "it" : "them"}. Your sent emails, campaign numbers and the lead stay as they are. A
              new reply from the same person starts a new conversation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" disabled={pending} onClick={() => run("delete")}>
              {pending && <Loader2Icon className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
