import { BarChart3Icon, EyeIcon, MousePointerClickIcon, ReplyIcon, SendIcon, TriangleAlertIcon, UserXIcon, UsersIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type CampaignStats = {
  total_leads: number;
  contacted: number;
  finished: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  sent: number;
  sent_today: number;
  opened: number;
  clicked: number;
  failed: number;
  daily_limit: number;
  steps: { position: number; sent: number; opened: number; clicked: number; replied: number }[];
};

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function CampaignAnalytics({
  stats,
  trackOpens,
  trackClicks,
}: {
  stats: CampaignStats;
  trackOpens: boolean;
  trackClicks: boolean;
}) {
  const replyRate = pct(stats.replied, stats.contacted);
  const contactedPct = pct(stats.contacted, stats.total_leads);
  const dailyPct = pct(stats.sent_today, stats.daily_limit);
  const remaining = Math.max(0, stats.daily_limit - stats.sent_today);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total leads" value={stats.total_leads.toLocaleString()} icon={UsersIcon} tone="primary" />
        <StatCard label="Emails sent" value={stats.sent.toLocaleString()} icon={SendIcon} tone="sky" />
        <StatCard label="Replies" value={stats.replied.toLocaleString()} icon={ReplyIcon} tone="emerald" />
        <StatCard label="Reply rate" value={fmtPct(replyRate)} icon={BarChart3Icon} tone="emerald" highlight />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SmallStat
          label="Opened"
          value={trackOpens ? `${stats.opened.toLocaleString()} · ${fmtPct(pct(stats.opened, stats.sent))}` : "Tracking off"}
          icon={EyeIcon}
        />
        <SmallStat
          label="Clicked"
          value={trackClicks ? `${stats.clicked.toLocaleString()} · ${fmtPct(pct(stats.clicked, stats.sent))}` : "Tracking off"}
          icon={MousePointerClickIcon}
        />
        <SmallStat
          label="Bounced"
          value={`${stats.bounced.toLocaleString()} · ${fmtPct(pct(stats.bounced, stats.contacted))}`}
          icon={TriangleAlertIcon}
        />
        <SmallStat label="Unsubscribed" value={stats.unsubscribed.toLocaleString()} icon={UserXIcon} />
      </div>

      <Card>
        <CardContent className="grid gap-6">
          <Progress
            title="Campaign progress"
            right={`${stats.contacted.toLocaleString()} / ${stats.total_leads.toLocaleString()} leads contacted`}
            value={contactedPct}
            leftNote={`${Math.round(contactedPct)}% complete`}
            rightNote={`${stats.sent_today.toLocaleString()} sent today`}
          />
          <Progress
            title="Daily progress"
            right={`${stats.sent_today.toLocaleString()} / ${stats.daily_limit.toLocaleString()} emails today`}
            value={dailyPct}
            leftNote={`${Math.round(dailyPct)}% of daily limit`}
            rightNote={`${remaining.toLocaleString()} remaining`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By step</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Opened</TableHead>
                  <TableHead className="text-right">Clicked</TableHead>
                  <TableHead className="text-right">Replied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.steps.map((s) => (
                  <TableRow key={s.position}>
                    <TableCell>Step {s.position}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.sent.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{trackOpens ? s.opened.toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{trackClicks ? s.clicked.toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.replied.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {stats.failed > 0 && (
            <p className="mt-3 text-xs text-destructive">
              {stats.failed.toLocaleString()} email{stats.failed === 1 ? "" : "s"} failed to send. See the Activity tab.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const TONES = {
  primary: "bg-primary/10 text-primary",
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("text-3xl font-semibold tabular-nums", highlight && "text-emerald-700 dark:text-emerald-400")}>
            {value}
          </p>
        </div>
        <span className={cn("flex size-11 items-center justify-center rounded-xl", TONES[tone])}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function SmallStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <Icon className="size-4 text-muted-foreground" />
      <div className="grid">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums">{value}</span>
      </div>
    </div>
  );
}

function Progress({
  title,
  right,
  value,
  leftNote,
  rightNote,
}: {
  title: string;
  right: string;
  value: number;
  leftNote: string;
  rightNote: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{right}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{leftNote}</span>
        <span>{rightNote}</span>
      </div>
    </div>
  );
}
