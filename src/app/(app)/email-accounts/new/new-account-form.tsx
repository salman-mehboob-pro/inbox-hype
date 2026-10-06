"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ConnectionTestResult } from "@/lib/email/connection-test";
import { PROVIDERS, PROVIDER_PRESETS, type Provider } from "@/lib/email/providers";
import { cn } from "@/lib/utils";
import { createEmailAccount } from "../actions";
import { ConnectionResult } from "../connection-result";
import type { CreateAccountInput } from "../schema";

type FormState = {
  provider: Provider;
  email: string;
  fromName: string;
  password: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  imapEnabled: boolean;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  dailyLimit: string;
};

function stateForProvider(provider: Provider, prev?: FormState): FormState {
  const p = PROVIDER_PRESETS[provider];
  return {
    provider,
    email: prev?.email ?? "",
    fromName: prev?.fromName ?? "",
    password: prev?.password ?? "",
    smtpHost: p.smtp?.host ?? "",
    smtpPort: String(p.smtp?.port ?? 587),
    smtpSecure: p.smtp?.secure ?? false,
    smtpUsername: "",
    imapEnabled: p.supportsImap,
    imapHost: p.imap?.host ?? "",
    imapPort: String(p.imap?.port ?? 993),
    imapSecure: p.imap?.secure ?? true,
    imapUsername: "",
    imapPassword: "",
    dailyLimit: String(p.recommendedDailyLimit),
  };
}

const SECURITY_ITEMS = [
  { value: "ssl", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
];

export function NewAccountForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => stateForProvider("gmail"));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [error, setError] = useState<string>();
  const [test, setTest] = useState<ConnectionTestResult>();
  const [showServer, setShowServer] = useState(false);
  const [pending, startTransition] = useTransition();

  const preset = PROVIDER_PRESETS[form.provider];
  const needsServerFields = preset.smtp === null;
  const serverOpen = needsServerFields || showServer;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const bind = (key: keyof FormState) => ({
    name: key,
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value as never),
    errors: fieldErrors[key],
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setFieldErrors({});
    setTest(undefined);

    const input: CreateAccountInput = {
      ...form,
      smtpUsername: form.smtpUsername.trim() || form.email.trim(),
      imapUsername: form.imapUsername.trim() || form.email.trim(),
      imapPassword: form.imapPassword || undefined,
    };

    startTransition(async () => {
      const result = await createEmailAccount(input);
      if (result.ok) {
        toast.success(`${form.email} connected`);
        router.push("/email-accounts");
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      setTest(result.test);
      setError(result.test ? undefined : (result.error ?? "Please fix the errors below."));
      // Open server settings if a server field has an error.
      if (result.fieldErrors && Object.keys(result.fieldErrors).some((k) => /^(smtp|imap)/.test(k))) {
        setShowServer(true);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Provider</CardTitle>
          <CardDescription>Where is this inbox hosted?</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div role="radiogroup" aria-label="Provider" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={form.provider === p}
                onClick={() => {
                  setForm((f) => stateForProvider(p, f));
                  setShowServer(false);
                  setTest(undefined);
                }}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  form.provider === p && "border-primary bg-primary/5 ring-1 ring-primary",
                )}
              >
                {PROVIDER_PRESETS[p].label}
              </button>
            ))}
          </div>
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{preset.help}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Email address" type="email" autoComplete="off" required {...bind("email")} />
          <Field
            label="From name"
            placeholder="e.g. Sarah from Buildberg"
            hint="Shown as the sender name. Optional."
            {...bind("fromName")}
          />
          <Field
            label={form.provider === "postal" ? "SMTP password" : "App password"}
            type="password"
            autoComplete="new-password"
            required
            hint="Saved encrypted. Never shown again."
            {...bind("password")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Server settings</CardTitle>
          <CardDescription>
            {needsServerFields
              ? "Enter your SMTP (sending) and IMAP (reading replies) details."
              : `Filled in for ${preset.label}. Change only if needed.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {!serverOpen ? (
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => setShowServer(true)}>
              Show server settings
            </Button>
          ) : (
            <>
              <fieldset className="grid gap-4">
                <legend className="mb-2 text-sm font-medium">Sending (SMTP)</legend>
                <div className="grid gap-4 sm:grid-cols-[1fr_110px_150px]">
                  <Field label="Host" placeholder="smtp.example.com" {...bind("smtpHost")} />
                  <Field label="Port" inputMode="numeric" {...bind("smtpPort")} />
                  <SecuritySelect
                    id="smtpSecure"
                    secure={form.smtpSecure}
                    onChange={(secure) => set("smtpSecure", secure)}
                  />
                </div>
                <Field label="Username" placeholder="Same as email address" {...bind("smtpUsername")} />
              </fieldset>

              {preset.supportsImap && (
                <fieldset className="grid gap-4">
                  <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Switch
                      id="imapEnabled"
                      aria-label="Read replies (IMAP)"
                      checked={form.imapEnabled}
                      onCheckedChange={(checked) => set("imapEnabled", checked)}
                    />
                    <Label htmlFor="imapEnabled">Read replies (IMAP)</Label>
                  </legend>
                  {form.imapEnabled && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-[1fr_110px_150px]">
                        <Field label="Host" placeholder="imap.example.com" {...bind("imapHost")} />
                        <Field label="Port" inputMode="numeric" {...bind("imapPort")} />
                        <SecuritySelect
                          id="imapSecure"
                          secure={form.imapSecure}
                          onChange={(secure) => set("imapSecure", secure)}
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Username" placeholder="Same as email address" {...bind("imapUsername")} />
                        <Field
                          label="Password"
                          type="password"
                          autoComplete="new-password"
                          placeholder="Same as above"
                          {...bind("imapPassword")}
                        />
                      </div>
                    </>
                  )}
                </fieldset>
              )}
            </>
          )}
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

function SecuritySelect({
  id,
  secure,
  onChange,
}: {
  id: string;
  secure: boolean;
  onChange: (secure: boolean) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Security</Label>
      <Select
        items={SECURITY_ITEMS}
        value={secure ? "ssl" : "starttls"}
        onValueChange={(v) => onChange(v === "ssl")}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SECURITY_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
