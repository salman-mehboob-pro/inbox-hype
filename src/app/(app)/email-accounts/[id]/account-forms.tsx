"use client";

import { Loader2Icon, PlugZapIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CheckResult } from "@/lib/email/connection-test";
import { testEmailAccount, updateEmailAccountApiKey, updateEmailAccountSettings } from "../actions";
import { ConnectionResult } from "../connection-result";

export function TestButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [test, setTest] = useState<CheckResult>();

  return (
    <div className="grid gap-3">
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await testEmailAccount(id);
            setTest(result.test);
            if (result.ok) toast.success("Connection works");
            else if (!result.test) toast.error(result.error ?? "Test failed");
          })
        }
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />}
        {pending ? "Testing…" : "Test connection"}
      </Button>
      {test && <ConnectionResult test={test} />}
    </div>
  );
}

type Settings = {
  fromName: string;
  dailyLimit: string;
  signature: string;
};

export function SettingsForm({ id, initial }: { id: string; initial: Settings }) {
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  const bind = (key: Exclude<keyof Settings, "signature">) => ({
    name: key,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    errors: fieldErrors[key],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sending settings</CardTitle>
        <CardDescription>Keep it low for cold email. 30–50 a day per inbox is safe.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFieldErrors({});
            startTransition(async () => {
              const result = await updateEmailAccountSettings(id, form);
              if (result.ok) toast.success("Settings saved");
              else {
                setFieldErrors(result.fieldErrors ?? {});
                if (result.error) toast.error(result.error);
              }
            });
          }}
        >
          <Field label="From name" placeholder="e.g. Sarah from Buildberg" {...bind("fromName")} />
          <div className="grid gap-4 sm:max-w-xs">
            <Field
              label="Emails per day"
              inputMode="numeric"
              hint="The time gap between emails is set per campaign (campaign → Options)."
              {...bind("dailyLimit")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="signature">Signature</Label>
            <Textarea
              id="signature"
              name="signature"
              rows={4}
              placeholder={"Sarah Khan\nBuildberg"}
              value={form.signature}
              onChange={(e) => setForm((f) => ({ ...f, signature: e.target.value }))}
              aria-invalid={Boolean(fieldErrors.signature) || undefined}
            />
            {fieldErrors.signature ? (
              <p className="text-xs text-destructive">{fieldErrors.signature[0]}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Added under emails sent from this inbox.</p>
            )}
          </div>
          <Button type="submit" className="justify-self-start" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ApiKeyForm({ id }: { id: string }) {
  const [apiKey, setApiKey] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [test, setTest] = useState<CheckResult>();
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Update API key</CardTitle>
        <CardDescription>Use this if you made a new Postal API credential. We test it before saving.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFieldErrors({});
            setTest(undefined);
            startTransition(async () => {
              const result = await updateEmailAccountApiKey(id, { apiKey });
              setTest(result.test);
              if (result.ok) {
                toast.success("API key updated");
                setApiKey("");
              } else {
                setFieldErrors(result.fieldErrors ?? {});
                if (!result.test && result.error) toast.error(result.error);
              }
            });
          }}
        >
          <Field
            label="New API key"
            name="apiKey"
            type="password"
            autoComplete="new-password"
            required
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            errors={fieldErrors.apiKey}
          />
          {test && <ConnectionResult test={test} />}
          <Button type="submit" className="justify-self-start" disabled={pending || !apiKey}>
            {pending && <Loader2Icon className="animate-spin" />}
            {pending ? "Testing…" : "Test & save API key"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
