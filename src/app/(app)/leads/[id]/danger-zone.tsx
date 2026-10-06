"use client";

import { CircleAlertIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteLeads } from "../actions";

export function DangerZone({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <CircleAlertIcon className="size-4" />
          Danger zone
        </CardTitle>
        <CardDescription>Once deleted, this lead can&apos;t be recovered.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" className="w-full" onClick={() => setOpen(true)}>
          <Trash2Icon />
          Delete lead
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {email}?</DialogTitle>
            <DialogDescription>It is removed from all campaigns too. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteLeads([id]);
                  if (res.ok) {
                    toast.success(`${email} deleted`);
                    router.push("/leads");
                  } else toast.error(res.error);
                })
              }
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
