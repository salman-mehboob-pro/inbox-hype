import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SentRow = {
  key: string; // "c:<id>" campaign email, "r:<id>" Unibox reply
  href: string;
  name: string;
  subject: string;
  preview: string;
  sentAt: string;
  label: string; // "Step 1", "Your reply"
  campaignName: string | null;
  inboxEmail: string | null;
  bounced: boolean;
  opened: boolean;
  clicked: boolean;
  replied: boolean;
};

// The Sent tab: every email we sent, newest first.
export function SentList({ rows, openKey }: { rows: SentRow[]; openKey: string | undefined }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {rows.map((row) => (
        <li key={row.key} className={cn("hover:bg-muted/60", row.key === openKey && "bg-muted")}>
          <Link href={row.href} className="grid min-w-0 gap-0.5 px-3 py-2.5 text-sm">
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground">To </span>
                {row.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                {timeAgo(row.sentAt)}
              </span>
            </span>
            <span className="truncate">{row.subject || "(no subject)"}</span>
            <span className="line-clamp-2 text-xs text-muted-foreground">{row.preview || " "}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary">{row.label}</Badge>
              {row.bounced && <Badge variant="destructive">Bounced</Badge>}
              {row.replied && <Badge variant="outline">Replied</Badge>}
              {row.clicked ? <Badge variant="outline">Clicked</Badge> : row.opened && <Badge variant="outline">Opened</Badge>}
              {row.campaignName && <span className="truncate">{row.campaignName}</span>}
              {row.inboxEmail && <span className="truncate">from {row.inboxEmail}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
