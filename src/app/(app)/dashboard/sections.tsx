import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  CircleIcon,
  InboxIcon,
  MegaphoneIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CampaignStatusBadge } from "../campaigns/status-badge";
import { AccountStatusBadge } from "../email-accounts/status-badge";
import { EVENT_TYPES } from "./event-types";
import { formatPercent, percent, percentChange, type DashboardCampaign, type DashboardInbox, type DashboardStats } from "./stats";

// Top cards ---------------------------------------------------------------------------

const TONES = {
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  primary: "bg-primary/10 text-primary",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  current,
  previous,
  days,
  note,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
  // Both given: shows the change against the period before.
  current?: number;
  previous?: number;
  days?: number;
  note?: string;
}) {
  const change = current !== undefined && previous !== undefined ? percentChange(current, previous) : null;
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tabular-nums">{value}</p>
          {change !== null ? (
            <p
              className={cn(
                "flex items-center gap-1 text-xs",
                change > 0 ? "text-emerald-700 dark:text-emerald-400" : change < 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {change > 0 ? <ArrowUpRightIcon className="size-3.5" /> : change < 0 ? <ArrowDownRightIcon className="size-3.5" /> : null}
              {change > 0 ? "+" : ""}
              {Math.round(change)}% vs previous {days} days
            </p>
          ) : (
            note && <p className="text-xs text-muted-foreground">{note}</p>
          )}
        </div>
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

export function SmallStat({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const content = (
    <>
      <Icon className="size-4 text-muted-foreground" />
      <div className="grid">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums">{value}</span>
      </div>
    </>
  );
  const className = "flex items-center gap-3 rounded-xl border bg-card px-4 py-3";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-muted")}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div
        className={cn("h-full rounded-full transition-all", value >= 100 ? "bg-amber-500" : "bg-primary")}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

// Today's sending against what the active inboxes can send in a day.
export function SendingToday({ sent, capacity }: { sent: number; capacity: number }) {
  const used = percent(sent, capacity);
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">Sending today</span>
          <span className="text-muted-foreground">
            {capacity > 0
              ? `${sent.toLocaleString()} of ${capacity.toLocaleString()} emails (daily limits of your active inboxes)`
              : `${sent.toLocaleString()} sent · no active inbox`}
          </span>
        </div>
        <Meter value={used} label="Sending today" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.round(used)}% of today&apos;s capacity</span>
          <span>{Math.max(0, capacity - sent).toLocaleString()} left</span>
        </div>
      </CardContent>
    </Card>
  );
}

// Campaigns ---------------------------------------------------------------------------

export function CampaignsCard({ campaigns, total }: { campaigns: DashboardCampaign[]; total: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle className="text-base">Campaigns</CardTitle>
          <CardDescription>Active ones first.</CardDescription>
        </div>
        {total > 0 && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/campaigns" />}>
            View all{total > campaigns.length ? ` (${total})` : ""}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <Empty
            icon={MegaphoneIcon}
            title="No campaigns yet"
            text="A campaign sends your emails to a list of leads, one after another."
            href="/campaigns"
            action="Create a campaign"
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Replied</TableHead>
                  <TableHead className="text-right">Reply rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-56">
                      <Link href={`/campaigns/${c.id}`} className="block truncate font-medium hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.total_leads.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.sent.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.replied.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(percent(c.replied, c.contacted))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Inbox health ------------------------------------------------------------------------

function inboxProblem(inbox: DashboardInbox): string | null {
  if (inbox.status === "error") return inbox.last_error || "This inbox has an error and is not sending.";
  if (inbox.status === "active" && !inbox.reads_replies) return "Replies are not read for this inbox (turn on IMAP).";
  if (inbox.status === "active" && inbox.daily_limit > 0 && inbox.sent_today >= inbox.daily_limit) {
    return "Daily limit reached. Sending continues tomorrow.";
  }
  return null;
}

export function InboxHealthCard({ inboxes }: { inboxes: DashboardInbox[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle className="text-base">Inbox health</CardTitle>
          <CardDescription>Emails sent today against each daily limit.</CardDescription>
        </div>
        {inboxes.length > 0 && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/email-accounts" />}>
            Manage
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {inboxes.length === 0 ? (
          <Empty
            icon={InboxIcon}
            title="No inbox connected"
            text="Connect the email address you want to send from."
            href="/email-accounts/new"
            action="Connect an inbox"
          />
        ) : (
          <ul className="grid gap-4">
            {inboxes.map((inbox) => {
              const problem = inboxProblem(inbox);
              const used = percent(inbox.sent_today, inbox.daily_limit);
              return (
                <li key={inbox.id} className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/email-accounts/${inbox.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                      {inbox.email}
                    </Link>
                    <AccountStatusBadge status={inbox.status} />
                  </div>
                  <Meter value={used} label={`${inbox.email} sent today`} />
                  <div className="flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground">
                    <span>
                      {inbox.sent_today.toLocaleString()} / {inbox.daily_limit.toLocaleString()} today
                    </span>
                    <span>Last sent: {timeAgo(inbox.last_sent_at)}</span>
                  </div>
                  {problem && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                      <span>{problem}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// Recent activity ---------------------------------------------------------------------

export type FeedRow = {
  id: number;
  type: string;
  created_at: string;
  lead_id: string | null;
  lead_email: string | null;
  lead_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  step_position: number | null;
};

export function ActivityFeed({ rows }: { rows: FeedRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
        <CardDescription>The newest events from all campaigns.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing yet. Sent emails, opens, replies and bounces will show up here.
          </p>
        ) : (
          <ul className="grid gap-3">
            {rows.map((row) => {
              const type = EVENT_TYPES[row.type] ?? EVENT_TYPES.sent;
              const who = row.lead_email ?? "a deleted lead";
              return (
                <li key={row.id} className="flex items-start gap-3">
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", type.className)}>
                    <type.icon className="size-3.5" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="truncate text-sm">
                      <span className="text-muted-foreground">{type.verb} </span>
                      {row.lead_id ? (
                        <Link href={`/leads/${row.lead_id}`} className="font-medium hover:underline">
                          {who}
                        </Link>
                      ) : (
                        <span className="font-medium">{who}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.campaign_id && row.campaign_name ? (
                        <Link href={`/campaigns/${row.campaign_id}`} className="hover:underline">
                          {row.campaign_name}
                        </Link>
                      ) : (
                        "Deleted campaign"
                      )}
                      {row.step_position ? ` · step ${row.step_position}` : ""}
                      {" · "}
                      <span title={new Date(row.created_at).toLocaleString()} suppressHydrationWarning>
                        {timeAgo(row.created_at)}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// First steps (only while something is still missing) ---------------------------------

export function GettingStarted({ counts, started }: { counts: DashboardStats["counts"]; started: boolean }) {
  const steps = [
    { done: counts.inboxes > 0, label: "Connect an inbox", text: "The email address emails are sent from.", href: "/email-accounts/new" },
    { done: counts.leads > 0, label: "Add leads", text: "Import a CSV or add people by hand.", href: "/leads" },
    { done: counts.campaigns > 0, label: "Create a campaign", text: "Write the emails and pick the leads.", href: "/campaigns" },
    { done: started, label: "Start it", text: "Emails go out slowly during your sending hours.", href: "/campaigns" },
  ];
  if (steps.every((s) => s.done)) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Get started</CardTitle>
        <CardDescription>Four steps to your first campaign.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.label}>
              <Link
                href={s.href}
                className={cn(
                  "flex h-full items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted",
                  i === next && "border-primary",
                )}
              >
                {s.done ? (
                  <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                ) : (
                  <CircleIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                )}
                <span className="grid gap-0.5">
                  <span className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Empty({
  icon: Icon,
  title,
  text,
  href,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
      <Button size="sm" nativeButton={false} render={<Link href={href} />}>
        {action}
      </Button>
    </div>
  );
}
