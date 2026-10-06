import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CAMPAIGN_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  paused: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  completed: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

export function CampaignStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn("gap-1.5 font-medium capitalize", CAMPAIGN_STYLES[status])}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </Badge>
  );
}

const LEAD_STYLES: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  replied: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  bounced: "bg-destructive/10 text-destructive",
  unsubscribed: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  stopped: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  queued: "Not started",
  in_progress: "In progress",
  completed: "Finished",
  replied: "Replied",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  stopped: "Stopped",
  failed: "Failed",
};

export function CampaignLeadStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", LEAD_STYLES[status])}>
      {LEAD_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
