"use client";

import { CheckIcon, Loader2Icon, PauseIcon, PencilIcon, PlayIcon, TriangleAlertIcon, XIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { pauseCampaign, renameCampaign, startCampaign } from "../actions";
import { CampaignStatusBadge } from "../status-badge";

export function CampaignHeader({
  id,
  name,
  status,
  pausedReason,
}: {
  id: string;
  name: string;
  status: string;
  pausedReason: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [renaming, startRename] = useTransition();

  function saveName(e: React.FormEvent) {
    e.preventDefault();
    startRename(async () => {
      const res = await renameCampaign(id, draft);
      if (res.ok) setEditing(false);
      else toast.error(res.error);
    });
  }

  function start() {
    startTransition(async () => {
      const res = await startCampaign(id);
      if (res.ok) toast.success(status === "paused" ? "Campaign resumed" : "Campaign started");
      else if (res.problems?.length) setProblems(res.problems);
      else toast.error(res.error);
    });
  }

  function pause() {
    startTransition(async () => {
      const res = await pauseCampaign(id);
      if (res.ok) toast.success("Campaign paused");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {editing ? (
          <form onSubmit={saveName} className="flex items-center gap-1">
            <Input
              aria-label="Campaign name"
              className="h-9 w-72 text-base"
              maxLength={200}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit" size="icon" variant="ghost" aria-label="Save name" disabled={renaming}>
              {renaming ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Cancel"
              onClick={() => {
                setDraft(name);
                setEditing(false);
              }}
            >
              <XIcon />
            </Button>
          </form>
        ) : (
          <>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
            <Button size="icon-sm" variant="ghost" aria-label="Rename campaign" onClick={() => setEditing(true)}>
              <PencilIcon />
            </Button>
          </>
        )}
        <CampaignStatusBadge status={status} />
      </div>

      {status === "active" ? (
        <Button variant="outline" onClick={pause} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PauseIcon />}
          Pause
        </Button>
      ) : status !== "completed" ? (
        <Button onClick={start} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
          {status === "paused" ? "Resume" : "Start campaign"}
        </Button>
      ) : null}

      {pausedReason && (
        <p
          role="status"
          className="flex basis-full items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>
            {pausedReason} Check the bounced leads (Unibox → Bounced), then press Resume. Only emails sent after you
            resume count toward the limit.
          </span>
        </p>
      )}

      <Dialog open={problems.length > 0} onOpenChange={(o) => !o && setProblems([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlertIcon className="size-4 text-amber-600" />
              Not ready to start
            </DialogTitle>
            <DialogDescription>Fix these first:</DialogDescription>
          </DialogHeader>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <DialogFooter>
            <DialogClose render={<Button />}>OK</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
