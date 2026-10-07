import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { publicEnv } from "@/lib/env";
import { timeAgo } from "@/lib/format";
import { postalInboundUrl, postalWebhookUrl } from "@/lib/postal/core";
import { createClient } from "@/lib/supabase/server";
import { AccountActions } from "../account-actions";
import { AccountStatusBadge } from "../status-badge";
import { ApiKeyForm, SettingsForm, TestButton } from "./account-forms";
import { PostalSetup } from "./postal-setup";

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

  // Inboxes send through the Postal API and need the one-time setup.
  const { data: server, error: serverError } = await supabase
    .from("postal_servers")
    .select("api_url, hook_token, webhook_ok_at, route_ok_at, check_sent_at, warning, warning_at")
    .eq("id", account.postal_server_id)
    .single();
  if (serverError) throw serverError;
  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  const postal = {
    apiUrl: server.api_url,
    inboundUrl: postalInboundUrl(appUrl, server.hook_token),
    webhookUrl: postalWebhookUrl(appUrl, server.hook_token),
    server: {
      webhookOkAt: server.webhook_ok_at,
      routeOkAt: server.route_ok_at,
      checkSentAt: server.check_sent_at,
      warning: server.warning,
      warningAt: server.warning_at,
    },
  };
  const isLocalUrl = /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(publicEnv.NEXT_PUBLIC_APP_URL);

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
            <CardDescription>Postal (API) · last tested {timeAgo(account.last_tested_at)}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {account.status === "error" && account.last_error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {account.last_error}
              </p>
            )}
            <dl className="grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
              <dt className="text-muted-foreground">Sending</dt>
              <dd className="break-all">Postal API · {postal.apiUrl}</dd>
              <dt className="text-muted-foreground">Replies</dt>
              <dd>
                {postal.server.routeOkAt ? "Postal reply route (working)" : "Postal reply route (not confirmed yet)"}
              </dd>
            </dl>
            <TestButton id={account.id} />
            <p className="text-xs text-muted-foreground">
              To change the Postal server or the email address, remove this account and add it again.
            </p>
          </CardContent>
        </Card>

        <PostalSetup
          accountId={account.id}
          email={account.email}
          inboundUrl={postal.inboundUrl}
          webhookUrl={postal.webhookUrl}
          isLocalUrl={isLocalUrl}
          server={postal.server}
          renderedAt={new Date().getTime()}
        />

        <SettingsForm
          id={account.id}
          initial={{
            fromName: account.from_name,
            dailyLimit: String(account.daily_limit),
            signature: account.signature,
          }}
        />

        <ApiKeyForm id={account.id} />
      </div>
    </>
  );
}
