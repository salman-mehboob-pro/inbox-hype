"use client";

import { CheckCircle2Icon, CircleDashedIcon, CopyIcon, Loader2Icon, SendIcon, TriangleAlertIcon, XCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { timeAgo } from "@/lib/format";
import { checkPostalSetup } from "../actions";

// One-time Postal setup for an inbox: the two URLs to paste into Postal (reply
// route + webhook) and a "Check setup" test that proves both reach us.

type ServerState = {
  webhookOkAt: string | null;
  routeOkAt: string | null;
  checkSentAt: string | null;
  warning: string | null;
  warningAt: string | null;
};

// How long we wait for the test email to come back before calling it failed.
const CHECK_WAIT_MS = 120_000;

type Status = "ok" | "waiting" | "failed" | "unchecked";

function statusOf(okAt: string | null, checkSentAt: string | null, now: number): Status {
  const ok = okAt ? new Date(okAt).getTime() : null;
  const sent = checkSentAt ? new Date(checkSentAt).getTime() : null;
  if (sent !== null && (ok === null || ok < sent)) {
    return now - sent < CHECK_WAIT_MS ? "waiting" : "failed";
  }
  return ok !== null ? "ok" : "unchecked";
}

function StatusLine({ label, status, okAt, now }: { label: string; status: Status; okAt: string | null; now: number }) {
  const icon = {
    ok: <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />,
    waiting: <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />,
    failed: <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />,
    unchecked: <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />,
  }[status];
  const text = {
    ok: `${label}: working (confirmed ${timeAgo(okAt, now)})`,
    waiting: `${label}: waiting for the test email…`,
    failed: `${label}: the test email did not arrive. Check the steps above and try again.`,
    unchecked: `${label}: not checked yet`,
  }[status];
  return (
    <li className={status === "failed" ? "flex items-start gap-2 text-destructive" : "flex items-start gap-2"}>
      {icon}
      <span>{text}</span>
    </li>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-2">
        <Input readOnly value={value} aria-label={label} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            navigator.clipboard.writeText(value).then(
              () => toast.success("Copied"),
              () => toast.error("Could not copy. Select the text and copy it by hand."),
            )
          }
        >
          <CopyIcon />
          Copy
        </Button>
      </div>
    </div>
  );
}

export function PostalSetup({
  accountId,
  email,
  inboundUrl,
  webhookUrl,
  isLocalUrl,
  server,
  renderedAt,
}: {
  accountId: string;
  email: string;
  inboundUrl: string;
  webhookUrl: string;
  isLocalUrl: boolean;
  server: ServerState;
  renderedAt: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(renderedAt);

  const webhook = statusOf(server.webhookOkAt, server.checkSentAt, now);
  const route = statusOf(server.routeOkAt, server.checkSentAt, now);
  const waiting = webhook === "waiting" || route === "waiting";

  // While a check is running, reload the numbers every few seconds.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Postal setup (one time)</CardTitle>
        <CardDescription>
          Paste these two addresses into Postal so InboxHype hears about replies and bounces. All inboxes on the
          same Postal server share them.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {isLocalUrl && (
          <p className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            These addresses point to this computer. Postal can only reach the live site, so do this setup on the live
            app.
          </p>
        )}
        {server.warning && (
          <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {server.warning}
              {server.warningAt && <span className="text-muted-foreground"> · {timeAgo(server.warningAt, now)}</span>}
            </span>
          </p>
        )}

        <section className="grid gap-3">
          <h3 className="font-medium">1. Replies: route</h3>
          <CopyField label="Reply route URL" value={inboundUrl} />
          <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
            <li>
              In Postal open your mail server → <b>Routing</b> → <b>HTTP Endpoints</b> → add an endpoint with this
              URL.
            </li>
            <li>
              Settings: Encoding <b>Sent in the body as JSON</b>, Format <b>Delivered as the raw message</b>, Strip
              replies <b>Send the full message as received</b>, <b>Don&apos;t include attachment data</b>, Timeout{" "}
              <b>the highest</b>.
            </li>
            <li>
              Open <b>Routes</b>, open the route of your address (for example <code>*@{email.split("@")[1]}</code>) and
              add the endpoint under <b>Additional endpoints</b>. Keep the existing endpoint if mail is forwarded
              somewhere.
            </li>
          </ol>
        </section>

        <section className="grid gap-3">
          <h3 className="font-medium">2. Bounces and delivery: webhook</h3>
          <CopyField label="Webhook URL" value={webhookUrl} />
          <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
            <li>
              In Postal open your mail server → <b>Webhooks</b> → add a webhook with this URL.
            </li>
            <li>
              Choose the events yourself and tick: <b>MessageSent</b>, <b>MessageDelayed</b>,{" "}
              <b>MessageDeliveryFailed</b>, <b>MessageHeld</b>, <b>MessageBounced</b>, <b>DomainDNSError</b>. Leave{" "}
              <b>MessageLinkClicked</b> and <b>MessageLoaded</b> off (InboxHype counts opens and clicks itself).
            </li>
          </ol>
        </section>

        <section className="grid gap-3">
          <h3 className="font-medium">3. Check it</h3>
          <p className="text-sm text-muted-foreground">
            Sends a short test email from {email} to itself through Postal. A copy may also land in any mailbox your
            Postal route forwards to.
          </p>
          <ul role="status" className="grid gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
            <StatusLine label="Webhook" status={webhook} okAt={server.webhookOkAt} now={now} />
            <StatusLine label="Reply route" status={route} okAt={server.routeOkAt} now={now} />
          </ul>
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={pending || waiting}
            onClick={() =>
              startTransition(async () => {
                const result = await checkPostalSetup(accountId);
                if (result.ok) {
                  toast.success("Test email sent. Waiting for it to come back…");
                  setNow(Date.now());
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Could not send the test email.");
                }
              })
            }
          >
            {pending || waiting ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {pending ? "Sending…" : waiting ? "Checking…" : "Check setup"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Until the reply route works, campaigns send only their first email from this inbox. Follow-ups wait, so
            nobody who already answered gets another email.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
