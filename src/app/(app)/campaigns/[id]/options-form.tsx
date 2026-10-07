"use client";

import { Loader2Icon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { AccountStatusBadge } from "../../email-accounts/status-badge";
import { deleteCampaign, saveOptions } from "../actions";

type Options = {
  daily_limit: string;
  gap_min_minutes: string;
  gap_max_minutes: string;
  track_opens: boolean;
  track_clicks: boolean;
  stop_on_reply: boolean;
  include_unsubscribe: boolean;
  email_account_ids: string[];
};

type Account = { id: string; email: string; from_name: string; status: string; daily_limit: number };

export function OptionsForm({
  campaignId,
  accounts,
  initial,
}: {
  campaignId: string;
  accounts: Account[];
  initial: Options;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setForm((f) => ({ ...f, [k]: v }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    startTransition(async () => {
      const res = await saveOptions(campaignId, form);
      if (res.ok) toast.success("Options saved");
      else {
        setFieldErrors(res.fieldErrors ?? {});
        if (res.error) toast.error(res.error);
      }
    });
  }

  // About how many emails per hour the campaign sends with this gap.
  const gapMin = Number(form.gap_min_minutes);
  const gapMax = Number(form.gap_max_minutes);
  const gapValid = Number.isInteger(gapMin) && Number.isInteger(gapMax) && gapMin >= 1 && gapMax >= gapMin;

  const chosen = form.email_account_ids
    .map((id) => accounts.find((a) => a.id === id))
    .filter((a): a is Account => Boolean(a));
  const notChosen = accounts.filter((a) => !form.email_account_ids.includes(a.id));

  const inboxCapacity = accounts
    .filter((a) => form.email_account_ids.includes(a.id) && a.status === "active")
    .reduce((sum, a) => sum + a.daily_limit, 0);

  return (
    <div className="grid max-w-2xl gap-6">
      <form onSubmit={save} className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send from these inboxes</CardTitle>
            <CardDescription>
              The inboxes take turns (inbox rotation): one email, then the next email from the next inbox. Each lead
              stays on one inbox, so follow-ups come from the same address.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {chosen.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No inbox chosen yet. Add at least one inbox to start this campaign.
              </p>
            ) : (
              chosen.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{a.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.from_name ? `${a.from_name} · ` : ""}
                      {a.daily_limit}/day
                    </span>
                  </span>
                  <AccountStatusBadge status={a.status} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${a.email}`}
                    onClick={() => set("email_account_ids", form.email_account_ids.filter((x) => x !== a.id))}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                disabled={notChosen.length === 0}
                onClick={() => {
                  setToAdd([]);
                  setAdding(true);
                }}
              >
                <PlusIcon />
                Add inbox
              </Button>
              {accounts.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  No inboxes connected yet.{" "}
                  <Link href="/email-accounts/new" className="text-primary underline-offset-4 hover:underline">
                    Connect an inbox
                  </Link>
                </span>
              ) : (
                notChosen.length === 0 && <span className="text-sm text-muted-foreground">All your inboxes are added.</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limits and pace</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field
              label="Max emails per day for this campaign"
              name="daily_limit"
              inputMode="numeric"
              className="max-w-40"
              value={form.daily_limit}
              onChange={(e) => set("daily_limit", e.target.value)}
              errors={fieldErrors.daily_limit}
              hint={`Each inbox also keeps its own daily limit. Chosen active inboxes can send up to ${inboxCapacity}/day in total.`}
            />

            <div className="grid gap-2">
              <p className="text-sm font-medium">Time gap between emails</p>
              <div className="flex flex-wrap items-start gap-3">
                <Field
                  label="Minimum (minutes)"
                  name="gap_min_minutes"
                  inputMode="numeric"
                  className="w-32"
                  value={form.gap_min_minutes}
                  onChange={(e) => set("gap_min_minutes", e.target.value)}
                  errors={fieldErrors.gap_min_minutes}
                />
                <Field
                  label="Maximum (minutes)"
                  name="gap_max_minutes"
                  inputMode="numeric"
                  className="w-32"
                  value={form.gap_max_minutes}
                  onChange={(e) => set("gap_max_minutes", e.target.value)}
                  errors={fieldErrors.gap_max_minutes}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                After each email, this campaign waits a random time between these two values before it sends the
                next one, from the next inbox in turn. Its inboxes never send at the same time.{" "}
                {gapValid &&
                  `With ${gapMin}–${gapMax} minutes, the campaign sends about ${Math.max(1, Math.floor(60 / gapMax))}–${Math.max(1, Math.floor(60 / gapMin))} emails per hour in total (and never more than the daily limits). `}
                The shortest gap is 1 minute, because sending is checked once a minute.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracking and behaviour</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Toggle
              checked={form.stop_on_reply}
              onChange={(v) => set("stop_on_reply", v)}
              title="Stop when the lead replies"
              description="No more follow-ups after a reply. Recommended."
            />
            <Toggle
              checked={form.track_opens}
              onChange={(v) => set("track_opens", v)}
              title="Track opens"
              description="Adds a tiny hidden image. Not exact (Apple Mail, blocked images) and can hurt inbox placement."
            />
            <Toggle
              checked={form.track_clicks}
              onChange={(v) => set("track_clicks", v)}
              title="Track link clicks"
              description="Links go through our server first. Can hurt inbox placement for cold email."
            />
            <Toggle
              checked={form.include_unsubscribe}
              onChange={(v) => set("include_unsubscribe", v)}
              title="Add an unsubscribe link"
              description="Adds an unsubscribe link and header. Recommended (required by Gmail/Yahoo for bulk senders)."
            />
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || !dirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save options
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </form>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>Deleting removes the campaign, its sequence and its stats. Leads are kept.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon />
            Delete campaign
          </Button>
        </CardContent>
      </Card>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add inboxes</DialogTitle>
            <DialogDescription>Choose the inboxes this campaign sends from. Save the options afterwards.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-80 gap-2 overflow-y-auto">
            {notChosen.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm">
                <Checkbox
                  checked={toAdd.includes(a.id)}
                  onCheckedChange={(c) => setToAdd((prev) => (c ? [...prev, a.id] : prev.filter((x) => x !== a.id)))}
                />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{a.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.from_name ? `${a.from_name} · ` : ""}
                    {a.daily_limit}/day
                  </span>
                </span>
                <AccountStatusBadge status={a.status} />
              </label>
            ))}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              disabled={toAdd.length === 0}
              onClick={() => {
                set("email_account_ids", [...form.email_account_ids, ...toAdd]);
                setAdding(false);
              }}
            >
              <PlusIcon />
              Add {toAdd.length > 0 ? toAdd.length : ""} {toAdd.length === 1 ? "inbox" : "inboxes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this campaign?</DialogTitle>
            <DialogDescription>Its sequence, sending history and stats are removed. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteCampaign(campaignId);
                  if (res.ok) {
                    toast.success("Campaign deleted");
                    router.push("/campaigns");
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
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <Switch aria-label={title} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="grid gap-0.5 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
