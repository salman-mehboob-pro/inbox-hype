"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CheckResult } from "@/lib/email/connection-test";
import { createEmailAccount } from "../actions";
import { ConnectionResult } from "../connection-result";
import type { CreateAccountInput } from "../schema";

type FormState = {
  email: string;
  fromName: string;
  apiUrl: string;
  apiKey: string;
  dailyLimit: string;
};

const INITIAL: FormState = { email: "", fromName: "", apiUrl: "", apiKey: "", dailyLimit: "30" };

// Connects a Postal inbox: address + Postal URL + API key. Tested before saving.
export function NewAccountForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [error, setError] = useState<string>();
  const [test, setTest] = useState<CheckResult>();
  const [pending, startTransition] = useTransition();

  const bind = (key: keyof FormState) => ({
    name: key,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    errors: fieldErrors[key],
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setFieldErrors({});
    setTest(undefined);

    const input: CreateAccountInput = { ...form };
    startTransition(async () => {
      const result = await createEmailAccount(input);
      if (result.ok && result.id) {
        toast.success(`${form.email} connected. Now finish the Postal setup.`);
        router.push(`/email-accounts/${result.id}`);
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      setTest(result.test);
      setError(result.test ? undefined : (result.error ?? "Please fix the errors below."));
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Postal inbox</CardTitle>
          <CardDescription>
            Use your Postal address and the key of an API credential (Postal → your mail server → Credentials →
            type API). After saving, the inbox page shows a one-time setup for replies and bounces.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field
            label="Email address"
            type="email"
            autoComplete="off"
            required
            hint="An address on a domain that is set up in Postal."
            {...bind("email")}
          />
          <Field
            label="From name"
            placeholder="e.g. Sarah from Buildberg"
            hint="Shown as the sender name. Optional."
            {...bind("fromName")}
          />
          <Field
            label="Postal address"
            placeholder="https://postal.example.com"
            autoComplete="off"
            required
            hint="The web address of your Postal server."
            {...bind("apiUrl")}
          />
          <Field
            label="API key"
            type="password"
            autoComplete="new-password"
            required
            hint="Key of an API credential in Postal. Saved encrypted. Never shown again."
            {...bind("apiKey")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sending limits</CardTitle>
          <CardDescription>Keep it low for cold email. 30–50 a day per inbox is safe.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-xs">
          <Field
            label="Emails per day"
            inputMode="numeric"
            hint="The time gap between emails is set per campaign (campaign → Options)."
            {...bind("dailyLimit")}
          />
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {test && <ConnectionResult test={test} />}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {pending ? "Testing connection…" : "Test & save"}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={() => router.push("/email-accounts")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
