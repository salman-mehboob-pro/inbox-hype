"use client";

import {
  Loader2Icon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlugZapIcon,
  Trash2Icon,
} from "lucide-react";
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
import { deleteEmailAccount, setEmailAccountPaused, testEmailAccount } from "./actions";

export function AccountActions({
  id,
  email,
  status,
  redirectAfterDelete,
}: {
  id: string;
  email: string;
  status: string;
  redirectAfterDelete?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function runTest() {
    startTransition(async () => {
      const result = await testEmailAccount(id);
      if (result.ok) toast.success(`${email}: connection works`);
      else toast.error(result.error ?? "Connection test failed");
    });
  }

  function togglePause() {
    startTransition(async () => {
      const result = await setEmailAccountPaused(id, status !== "paused");
      if (result.ok) toast.success(status === "paused" ? `${email} resumed` : `${email} paused`);
      else toast.error(result.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteEmailAccount(id);
      setConfirmDelete(false);
      if (result.ok) {
        toast.success(`${email} removed`);
        if (redirectAfterDelete) router.push(redirectAfterDelete);
      } else toast.error(result.error);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${email}`} disabled={pending} />
          }
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <MoreHorizontalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onClick={runTest}>
            <PlugZapIcon />
            Test connection
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/email-accounts/${id}`} />}>
            <PencilIcon />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={togglePause}>
            {status === "paused" ? <PlayIcon /> : <PauseIcon />}
            {status === "paused" ? "Resume" : "Pause"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {email}?</DialogTitle>
            <DialogDescription>
              It stops sending right away and is removed from all campaigns. Sent history is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
