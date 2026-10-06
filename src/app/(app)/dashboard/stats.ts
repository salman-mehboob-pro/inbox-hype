import { z } from "zod";

// What `dashboard_stats` (database function) returns, checked and filled in so a
// missing number never breaks the page. Event types that did not happen in the
// period are simply absent from the database answer, so every number defaults to 0.

const n = z.number().catch(0);
const text = z.string().catch("");
const maybeText = z.string().nullable().catch(null);
const obj = <T extends z.ZodType>(schema: T) => z.preprocess((value) => value ?? {}, schema);
const list = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (Array.isArray(value) ? value : []), z.array(schema));

const totalsSchema = z.object({
  sent: n,
  opened: n,
  clicked: n,
  replied: n,
  bounced: n,
  unsubscribed: n,
  failed: n,
});

const dashboardSchema = z.object({
  days: n,
  timezone: z.string().catch("UTC"),
  totals: obj(totalsSchema),
  previous: obj(totalsSchema),
  contacted: n,
  previous_contacted: n,
  replied_leads: n,
  previous_replied_leads: n,
  daily: list(z.object({ date: text, sent: n, opened: n, replied: n, bounced: n })),
  today: obj(z.object({ sent: n, capacity: n })),
  counts: obj(z.object({ campaigns: n, active_campaigns: n, leads: n, inboxes: n, unread_replies: n })),
  campaigns: list(
    z.object({
      id: text,
      name: text,
      status: text,
      total_leads: n,
      contacted: n,
      replied: n,
      bounced: n,
      sent: n,
    }),
  ),
  inboxes: list(
    z.object({
      id: text,
      email: text,
      status: text,
      last_error: maybeText,
      daily_limit: n,
      sent_today: n,
      last_sent_at: maybeText,
      reads_replies: z.boolean().catch(false),
      last_checked_at: maybeText,
    }),
  ),
});

export type DashboardStats = z.infer<typeof dashboardSchema>;
export type DashboardDay = DashboardStats["daily"][number];
export type DashboardCampaign = DashboardStats["campaigns"][number];
export type DashboardInbox = DashboardStats["inboxes"][number];

export function parseDashboardStats(raw: unknown): DashboardStats {
  return dashboardSchema.parse(typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {});
}

// part / whole as a percentage, 0 when there is nothing to divide by. Never above 100.
export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, (part / whole) * 100);
}

export const formatPercent = (value: number) => `${value.toFixed(1)}%`;

// How much `current` grew or shrank against `previous`, in percent.
// null when there is no earlier number to compare with.
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
