import {
  EyeIcon,
  MousePointerClickIcon,
  ReplyIcon,
  SendIcon,
  TriangleAlertIcon,
  UserXIcon,
  XCircleIcon,
} from "lucide-react";

// How each kind of event looks in the dashboard's activity feed.
export const EVENT_TYPES: Record<
  string,
  { verb: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  sent: { verb: "Email sent to", icon: SendIcon, className: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  opened: { verb: "Opened by", icon: EyeIcon, className: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  clicked: {
    verb: "Link clicked by",
    icon: MousePointerClickIcon,
    className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  },
  replied: { verb: "Reply from", icon: ReplyIcon, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  bounced: { verb: "Bounced:", icon: TriangleAlertIcon, className: "bg-destructive/10 text-destructive" },
  unsubscribed: {
    verb: "Unsubscribed:",
    icon: UserXIcon,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  failed: { verb: "Failed to send to", icon: XCircleIcon, className: "bg-destructive/10 text-destructive" },
};
