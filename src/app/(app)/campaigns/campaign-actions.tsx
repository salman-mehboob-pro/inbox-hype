"use client";

import { CopyIcon, ExternalLinkIcon, Loader2Icon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
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
import { deleteCampaign, duplicateCampaign } from "./actions";

export function CampaignActions({ id, name, status }: { id: string; name: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function duplicate() {
    startTransition(async () => {
      const res = await duplicateCampaign(id);
      if (res.ok && res.id) {
        const newId = res.id;
        toast.success("Campaign copied (as a draft, without leads)", {
          action: { label: "Open", onClick: () => router.push(`/campaigns/${newId}`) },
        });
      } else toast.error(res.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteCampaign(id);
      setConfirmDelete(false);
      if (res.ok) toast.success("Campaign deleted");
      else toast.error(res.error);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} disabled={pending} />}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <MoreHorizontalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem render={<Link href={`/campaigns/${id}`} />}>
            <ExternalLinkIcon />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem onClick={duplicate}>
            <CopyIcon />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              {status === "active" ? "It stops sending right away. " : ""}
              Its sequence, stats and sent history are deleted. Your leads and inboxes stay, and replies stay in the
              Unibox. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Delete campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
