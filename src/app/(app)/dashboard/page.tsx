import { BarChart3Icon, EyeIcon, InboxIcon, MegaphoneIcon, ReplyIcon, SendIcon, TriangleAlertIcon, UserXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ActivityChart } from "./activity-chart";
import { ActivityFeed, CampaignsCard, InboxHealthCard, SendingToday, SmallStat, StatCard } from "./sections";
import { formatPercent, parseDashboardStats, percent } from "./stats";

export const metadata: Metadata = { title: "Dashboard" };

const RANGES = [7, 30] as const;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const days = Number(params.range) === 30 ? 30 : 7;

  const { workspace } = await getCurrentWorkspace();
  const supabase = await createClient();

  const [statsResult, activityResult] = await Promise.all([
    supabase.rpc("dashboard_stats", { p_workspace_id: workspace.id, p_days: days }),
    supabase.rpc("dashboard_activity", { p_workspace_id: workspace.id, p_limit: 10 }),
  ]);
  if (statsResult.error) throw statsResult.error;
  if (activityResult.error) throw activityResult.error;

  const stats = parseDashboardStats(statsResult.data);
  const { totals, previous, counts } = stats;

  const replyRate = percent(stats.replied_leads, stats.contacted);
  const previousReplyRate = percent(stats.previous_replied_leads, stats.previous_contacted);
  const showOpens = totals.opened > 0; // opens are only recorded for campaigns that track them

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Overview for ${workspace.name}`}
        actions={
          <nav className="flex gap-1" aria-label="Time range">
            {RANGES.map((range) => (
              <Link
                key={range}
                href={range === 7 ? "/dashboard" : `/dashboard?range=${range}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  range === days ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                Last {range} days
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Emails sent"
          value={totals.sent.toLocaleString()}
          icon={SendIcon}
          tone="sky"
          current={totals.sent}
          previous={previous.sent}
          days={days}
          note={`Last ${days} days`}
          href="/inbox?filter=sent"
        />
        <StatCard
          label="Replies"
          value={stats.replied_leads.toLocaleString()}
          icon={ReplyIcon}
          tone="emerald"
          current={stats.replied_leads}
          previous={stats.previous_replied_leads}
          days={days}
          note="People who answered"
        />
        <StatCard
          label="Reply rate"
          value={formatPercent(replyRate)}
          icon={BarChart3Icon}
          tone="violet"
          current={replyRate}
          previous={previousReplyRate}
          days={days}
          note={`${stats.replied_leads.toLocaleString()} of ${stats.contacted.toLocaleString()} people contacted`}
        />
        <StatCard
          label="Active campaigns"
          value={counts.active_campaigns.toLocaleString()}
          icon={MegaphoneIcon}
          tone="primary"
          note={`${counts.campaigns.toLocaleString()} in total · ${counts.leads.toLocaleString()} leads`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SmallStat
          label="Opened"
          value={`${totals.opened.toLocaleString()} · ${formatPercent(percent(totals.opened, totals.sent))}`}
          icon={EyeIcon}
        />
        <SmallStat
          label="Bounced"
          value={`${totals.bounced.toLocaleString()} · ${formatPercent(percent(totals.bounced, totals.sent))}`}
          icon={TriangleAlertIcon}
        />
        <SmallStat label="Unsubscribed" value={totals.unsubscribed.toLocaleString()} icon={UserXIcon} />
        <SmallStat
          label="Unread replies"
          value={counts.unread_replies.toLocaleString()}
          icon={InboxIcon}
          href="/inbox?filter=unread"
        />
      </div>

      <SendingToday sent={stats.today.sent} capacity={stats.today.capacity} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last {days} days</CardTitle>
          <CardDescription>Emails sent, opened and replied to, per day ({stats.timezone}).</CardDescription>
        </CardHeader>
        <CardContent>
          {totals.sent === 0 && totals.replied === 0 ? (
            <p className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              No emails in this period yet.
            </p>
          ) : (
            <ActivityChart data={stats.daily} showOpens={showOpens} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <CampaignsCard campaigns={stats.campaigns} total={counts.campaigns} />
          <ActivityFeed rows={activityResult.data} />
        </div>
        <div className="grid content-start gap-4">
          <InboxHealthCard inboxes={stats.inboxes} />
        </div>
      </div>
    </>
  );
}
