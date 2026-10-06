"use client";

import { Loader2Icon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { saveSchedule } from "../actions";
import { DAYS, type ScheduleInput } from "../schema";

type Schedule = Required<ScheduleInput>;

export function ScheduleForm({ campaignId, initial }: { campaignId: string; initial: Schedule }) {
  const [form, setForm] = useState<Schedule>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      send_days: f.send_days.includes(day) ? f.send_days.filter((d) => d !== day) : [...f.send_days, day].sort(),
    }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    startTransition(async () => {
      const res = await saveSchedule(campaignId, form);
      if (res.ok) toast.success("Schedule saved");
      else {
        setFieldErrors(res.fieldErrors ?? {});
        if (res.error) toast.error(res.error);
      }
    });
  }

  const err = (k: keyof Schedule) =>
    fieldErrors[k]?.[0] && <p className="text-xs text-destructive">{fieldErrors[k]![0]}</p>;

  return (
    <form onSubmit={save} className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">When to send</CardTitle>
          <CardDescription>Emails only go out on these days, between these times.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label>Sending days</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sending days">
              {DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={form.send_days.includes(d.value)}
                  onClick={() => toggleDay(d.value)}
                  className={cn(
                    "h-8 w-12 rounded-lg border text-sm transition-colors",
                    form.send_days.includes(d.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {d.short}
                </button>
              ))}
            </div>
            {err("send_days")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="window_start">From</Label>
              <Input
                id="window_start"
                type="time"
                value={form.window_start}
                onChange={(e) => setForm((f) => ({ ...f, window_start: e.target.value }))}
              />
              {err("window_start")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="window_end">To</Label>
              <Input
                id="window_end"
                type="time"
                value={form.window_end}
                onChange={(e) => setForm((f) => ({ ...f, window_end: e.target.value }))}
              />
              {err("window_end")}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            >
              {!timezones.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            {err("timezone")}
          </div>

          <label className="flex items-start gap-3">
            <Switch
              aria-label="Use the lead's timezone"
              checked={form.use_lead_timezone}
              onCheckedChange={(v) => setForm((f) => ({ ...f, use_lead_timezone: v }))}
              className="mt-0.5"
            />
            <span className="grid gap-0.5 text-sm">
              <span className="font-medium">Use the lead&apos;s timezone when known</span>
              <span className="text-muted-foreground">
                A lead in Asia/Karachi gets the email between {form.window_start} and {form.window_end} Karachi time.
                Leads without a timezone use the one above.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !dirty}>
          {pending && <Loader2Icon className="animate-spin" />}
          Save schedule
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </form>
  );
}
