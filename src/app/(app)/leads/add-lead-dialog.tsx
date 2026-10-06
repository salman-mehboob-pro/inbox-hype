"use client";

import { Loader2Icon, PlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseTags } from "@/lib/leads/import";
import { createLead } from "./actions";

const EMPTY = {
  email: "",
  first_name: "",
  last_name: "",
  company: "",
  title: "",
  phone: "",
  linkedin_url: "",
  website: "",
  tags: "",
};

const NO_CAMPAIGN = "__none__";

export type CampaignOption = { id: string; name: string };

export function AddLeadDialog({ campaigns }: { campaigns: CampaignOption[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [campaignId, setCampaignId] = useState(NO_CAMPAIGN);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  const campaignItems = [
    { value: NO_CAMPAIGN, label: "No campaign" },
    ...campaigns.map((c) => ({ value: c.id, label: c.name })),
  ];

  const bind = (key: keyof typeof EMPTY) => ({
    name: key,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    errors: fieldErrors[key],
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    const optional = (v: string) => v.trim() || undefined;
    startTransition(async () => {
      const res = await createLead({
        email: form.email,
        first_name: optional(form.first_name),
        last_name: optional(form.last_name),
        company: optional(form.company),
        title: optional(form.title),
        phone: optional(form.phone),
        linkedin_url: optional(form.linkedin_url),
        website: optional(form.website),
        tags: parseTags(form.tags),
        campaignId: campaignId === NO_CAMPAIGN ? undefined : campaignId,
      });
      if (res.ok) {
        toast.success(`${form.email} added`);
        setForm(EMPTY);
        setCampaignId(NO_CAMPAIGN);
        setOpen(false);
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        if (res.error) toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <PlusIcon />
        Add lead
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add new lead</DialogTitle>
          <DialogDescription>Only the email address is required.</DialogDescription>
        </DialogHeader>
        <form id="add-lead" onSubmit={submit} className="grid gap-4">
          <Field
            label="Email Address"
            type="email"
            required
            autoComplete="off"
            placeholder="john@example.com"
            {...bind("email")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First Name" placeholder="John" {...bind("first_name")} />
            <Field label="Last Name" placeholder="Doe" {...bind("last_name")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" placeholder="Acme Inc." {...bind("company")} />
            <Field label="Job Title" placeholder="Marketing Manager" {...bind("title")} />
          </div>
          <Field label="Phone" type="tel" placeholder="+1 (555) 123-4567" {...bind("phone")} />
          <Field label="LinkedIn URL" placeholder="https://linkedin.com/in/johndoe" {...bind("linkedin_url")} />
          <Field label="Website" placeholder="https://example.com" {...bind("website")} />
          <Field label="Tags" placeholder="e.g. vip, saas" hint="Optional. Separate with commas." {...bind("tags")} />
          <div className="grid gap-1.5">
            <Label htmlFor="campaignId">Add to Campaign (optional)</Label>
            <Select items={campaignItems} value={campaignId} onValueChange={(v) => setCampaignId(String(v))}>
              <SelectTrigger id="campaignId" className="w-full" aria-invalid={Boolean(fieldErrors.campaignId) || undefined}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {campaignItems.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.campaignId ? (
              <p className="text-xs text-destructive">{fieldErrors.campaignId[0]}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                The lead is added to your database either way. Choosing a campaign also queues it there.
              </p>
            )}
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="add-lead" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Add lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
