"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteWorkspace, renameWorkspace } from "../workspaces/actions";

export function RenameWorkspace({ name }: { name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  const changed = value.trim() !== "" && value.trim() !== name;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace name</CardTitle>
        <CardDescription>Shown in the workspace switcher at the bottom of the sidebar.</CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await renameWorkspace(value);
            if (!res.ok) {
              toast.error(res.error ?? "Could not rename the workspace.");
              return;
            }
            toast.success("Workspace renamed");
            router.refresh();
          });
        }}
      >
        <CardContent className="grid gap-2">
          <Label htmlFor="workspace-name">Name</Label>
          <Input id="workspace-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={100} />
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" disabled={pending || !changed}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function DeleteWorkspace({ name, canDelete }: { name: string; canDelete: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle>Delete workspace</CardTitle>
        <CardDescription>
          {canDelete
            ? "Deletes this workspace with all its inboxes, leads, campaigns, Unibox and stats. This can't be undone."
            : "Your only workspace can't be deleted. Create another workspace first."}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="destructive" disabled={!canDelete} onClick={() => setOpen(true)}>
          Delete workspace
        </Button>
      </CardFooter>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirm("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{name}&quot;?</DialogTitle>
            <DialogDescription>
              Everything in this workspace is deleted: inboxes, leads, campaigns, Unibox and stats. Running campaigns
              stop. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await deleteWorkspace(confirm);
                if (!res.ok) {
                  toast.error(res.error ?? "Could not delete the workspace.");
                  return;
                }
                toast.success(`Workspace "${name}" deleted`);
                setOpen(false);
                router.push("/dashboard");
                router.refresh();
              });
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="confirm-name">Type the workspace name to confirm</Label>
              <Input id="confirm-name" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" variant="destructive" disabled={pending || confirm.trim() !== name}>
                {pending ? "Deleting..." : "Delete workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
