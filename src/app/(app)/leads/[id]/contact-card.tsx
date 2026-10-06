"use client";

import {
  BriefcaseIcon,
  Building2Icon,
  ClockIcon,
  ExternalLinkIcon,
  GlobeIcon,
  Loader2Icon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  UserIcon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateLeadContact } from "../actions";
import type { ContactInput } from "../schema";

type Contact = Required<{ [K in keyof ContactInput]: string }>;

export function ContactCard({ id, initial }: { id: string; initial: Contact }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  const bind = (key: keyof Contact) => ({
    name: key,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    errors: fieldErrors[key],
  });

  function save(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    startTransition(async () => {
      const res = await updateLeadContact(id, form);
      if (res.ok) {
        toast.success("Contact saved");
        setEditing(false);
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        if (res.error) toast.error(res.error);
      }
    });
  }

  const name = [initial.first_name, initial.last_name].filter(Boolean).join(" ");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserIcon className="size-4 text-primary" />
          Contact information
        </CardTitle>
        {!editing && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon />
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={save} className="grid gap-4">
            <Field label="Email Address" type="email" required {...bind("email")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First Name" {...bind("first_name")} />
              <Field label="Last Name" {...bind("last_name")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company" {...bind("company")} />
              <Field label="Job Title" {...bind("title")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" type="tel" {...bind("phone")} />
              <Field label="Timezone" placeholder="e.g. Europe/Paris" {...bind("timezone")} />
            </div>
            <Field label="LinkedIn URL" placeholder="https://linkedin.com/in/…" {...bind("linkedin_url")} />
            <Field label="Website" placeholder="https://example.com" {...bind("website")} />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" />}
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setForm(initial);
                  setFieldErrors({});
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <dl className="divide-y">
            <Row icon={MailIcon} label="Email" value={initial.email} />
            <Row icon={UserIcon} label="Name" value={name} />
            <Row icon={Building2Icon} label="Company" value={initial.company} />
            <Row icon={BriefcaseIcon} label="Job Title" value={initial.title} />
            <Row icon={PhoneIcon} label="Phone" value={initial.phone} />
            <Row icon={GlobeIcon} label="LinkedIn" value={initial.linkedin_url} link="View Profile" />
            <Row icon={GlobeIcon} label="Website" value={initial.website} link={initial.website} />
            <Row icon={ClockIcon} label="Timezone" value={initial.timezone} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  link,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  link?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="grid min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm">
          {!value ? (
            <span className="text-muted-foreground">—</span>
          ) : link ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              {link}
              <ExternalLinkIcon className="size-3" />
            </a>
          ) : (
            value
          )}
        </dd>
      </div>
    </div>
  );
}
