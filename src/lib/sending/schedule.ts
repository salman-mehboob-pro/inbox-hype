import { isValidTimeZone } from "@/lib/leads/import";
import { zonedParts, zonedTimeToUtc } from "@/lib/time";

// Send-window rules (pure, no I/O). Used by the sending tick.

export type SendWindow = {
  timeZone: string;
  // 1 = Monday ... 7 = Sunday
  days: number[];
  // Postgres "time" values: "09:00" or "09:00:00"
  start: string;
  end: string;
};

// "09:30:00" -> 570 (minutes since midnight).
export function clockMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

// Which timezone a lead is emailed in: its own when the campaign allows it
// and the name is valid, otherwise the campaign's timezone.
export function resolveTimeZone(
  campaign: { timezone: string; use_lead_timezone: boolean },
  leadTimeZone: string | null | undefined,
): string {
  if (campaign.use_lead_timezone && leadTimeZone && isValidTimeZone(leadTimeZone)) return leadTimeZone;
  return isValidTimeZone(campaign.timezone) ? campaign.timezone : "UTC";
}

export function isInSendWindow(now: Date, window: SendWindow): boolean {
  const p = zonedParts(now, window.timeZone);
  if (!window.days.includes(p.weekday)) return false;
  const minutes = p.hour * 60 + p.minute;
  return minutes >= clockMinutes(window.start) && minutes < clockMinutes(window.end);
}

// The first moment we may send: `now` when the window is open, otherwise the
// next time it opens. Used to postpone leads that are outside their window.
export function nextWindowOpen(now: Date, window: SendWindow): Date {
  if (isInSendWindow(now, window)) return now;

  const startMinutes = clockMinutes(window.start);
  const hour = Math.floor(startMinutes / 60);
  const minute = startMinutes % 60;
  const today = zonedParts(now, window.timeZone);

  for (let offset = 0; offset <= 8; offset++) {
    // Calendar arithmetic on the local date (UTC fields are only used as a calendar).
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = ((day.getUTCDay() + 6) % 7) + 1;
    if (!window.days.includes(weekday)) continue;
    const open = zonedTimeToUtc(
      window.timeZone,
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      hour,
      minute,
    );
    if (open.getTime() > now.getTime()) return open;
  }
  // No sending day at all (the database forbids this). Look again tomorrow.
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
