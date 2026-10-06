import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PROVIDER_PRESETS, type Provider } from "@/lib/email/providers";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AccountActions } from "../account-actions";
import { AccountStatusBadge } from "../status-badge";
import { PasswordForm, SettingsForm, TestButton } from "./account-forms";

export const metadata: Metadata = { title: "Email account" };

export default async function EmailAccountPage({ params }: PageProps<"/email-accounts/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!account) notFound();

  const security = (secure: boolean) => (secure ? "SSL/TLS" : "STARTTLS");

  return (
    <>
      <div className="grid gap-3">
        <Link
          href="/email-accounts"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Email accounts
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-xl font-semibold tracking-tight">{account.email}</h1>
            <AccountStatusBadge status={account.status} />
          </div>
          <AccountActions
            id={account.id}
            email={account.email}
            status={account.status}
            redirectAfterDelete="/email-accounts"
          />
        </div>
      </div>

      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>
              {PROVIDER_PRESETS[account.provider as Provider]?.label ?? account.provider} · last tested{" "}
              {timeAgo(account.last_tested_at)}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {account.status === "error" && account.last_error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {account.last_error}
              </p>
            )}
            <dl className="grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
              <dt className="text-muted-foreground">Sending (SMTP)</dt>
              <dd className="break-all">
                {account.smtp_host}:{account.smtp_port} · {security(account.smtp_secure)} ·{" "}
                {account.smtp_username}
              </dd>
              <dt className="text-muted-foreground">Replies (IMAP)</dt>
              <dd className="break-all">
                {account.imap_host
                  ? `${account.imap_host}:${account.imap_port} · ${security(account.imap_secure)} · ${account.imap_username}`
                  : "Not read (no IMAP)"}
              </dd>
            </dl>
            <TestButton id={account.id} />
            <p className="text-xs text-muted-foreground">
              To change the server or email address, remove this account and add it again.
            </p>
          </CardContent>
        </Card>

        <SettingsForm
          id={account.id}
          initial={{
            fromName: account.from_name,
            dailyLimit: String(account.daily_limit),
            signature: account.signature,
          }}
        />

        <PasswordForm id={account.id} hasImap={Boolean(account.imap_host)} provider={account.provider} />
      </div>
    </>
  );
}
