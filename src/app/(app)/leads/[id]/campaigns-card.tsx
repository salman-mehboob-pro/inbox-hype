"use client";

import { Loader2Icon, MegaphoneIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignLeadStatusBadge } from "../../campaigns/status-badge";
import { addLeadToCampaign } from "../actions";

type InCampaign = { id: string; name: string; campaignStatus: string; leadStatus: string };

export function CampaignsCard({
  id,
  inCampaigns,
  available,
}: {
  id: string;
  inCampaigns: InCampaign[];
  available: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const items = available.map((c) => ({ value: c.id, label: c.name }));

  function add() {
    startTransition(async () => {
      const res = await addLeadToCampaign(id, campaignId);
      if (res.ok) {
        toast.success("Added to campaign");
        setOpen(false);
        setCampaignId("");
      } else toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MegaphoneIcon className="size-4 text-primary" />
          Campaigns
        </CardTitle>
        <CardDescription>Add this lead to a campaign to start sending sequences.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {inCampaigns.length > 0 && (
          <ul className="grid gap-2">
            {inCampaigns.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/campaigns/${c.id}`} className="truncate hover:underline">
                  {c.name}
                </Link>
                <CampaignLeadStatusBadge status={c.leadStatus} />
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <PlusIcon />
          Add to campaign
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to campaign</DialogTitle>
            <DialogDescription>The lead is queued and gets the campaign&apos;s emails in order.</DialogDescription>
          </DialogHeader>
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {inCampaigns.length
                ? "This lead is already in every open campaign."
                : "No campaigns yet. Create a campaign first."}
            </p>
          ) : (
            <Select items={items} value={campaignId || null} onValueChange={(v) => setCampaignId(String(v ?? ""))}>
              <SelectTrigger className="w-full" aria-label="Campaign">
                <SelectValue placeholder="Choose a campaign" />
              </SelectTrigger>
              <SelectContent>
                {items.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={add} disabled={pending || !campaignId}>
              {pending && <Loader2Icon className="animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
