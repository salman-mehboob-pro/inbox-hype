"use client";

import { ChevronDownIcon, Loader2Icon, MailIcon, TagIcon, Trash2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { bulkAction } from "./actions";
import { CATEGORIES, categoryInfo, type CategoryKey } from "./categories";

// Category, "mark unread" and "delete" for the conversation that is open.
export function ThreadActions({
  messageId,
  category,
  backHref,
}: {
  messageId: string;
  category: string | null;
  backHref: string;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = categoryInfo(category);

  function run(action: "delete" | "unread" | "category", value: CategoryKey | null = null) {
    startTransition(async () => {
      const result = await bulkAction({ ids: [messageId], action, value });
      setConfirmDelete(false);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (action === "delete" || action === "unread") {
        // Back to the list: an open conversation would be marked read again at once.
        toast.success(action === "delete" ? "Conversation deleted" : "Marked unread");
        router.replace(backHref);
      } else {
        toast.success(value ? `Set to ${categoryInfo(value)?.label}` : "Category removed");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
          {current ? <span className={cn("size-2 rounded-full", current.className.split(" ")[0])} /> : <TagIcon />}
          {current ? current.label : "Set category"}
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {CATEGORIES.map((c) => (
            <DropdownMenuItem key={c.key} onClick={() => run("category", c.key)}>
              <span className={cn("size-2 rounded-full", c.className.split(" ")[0])} />
              {c.label}
            </DropdownMenuItem>
          ))}
          {current && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => run("category", null)}>
                <XIcon />
                Remove category
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run("unread")}>
        <MailIcon />
        Mark unread
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}>
        {pending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
        Delete
      </Button>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this conversation?</DialogTitle>
            <DialogDescription>
              It is removed from the Unibox, with all its messages. Your sent emails, campaign numbers and the lead stay
              as they are. A new reply from the same person starts a new conversation.
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
