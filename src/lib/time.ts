// Timezone helpers using Intl only (no extra library).

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Wall-clock parts of `date` in `timeZone`. weekday: 1 = Monday … 7 = Sunday.
export function zonedParts(date: Date, timeZone: string): Parts {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS[p.weekday] ?? 0,
  };
}

// How far `timeZone` is ahead of UTC at `date`, in ms.
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// The UTC instant for a wall-clock time in `timeZone` (handles DST changes).
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall - timeZoneOffsetMs(new Date(wall), timeZone);
  guess = wall - timeZoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

// Midnight (start of the current day) in `timeZone`, as a UTC Date.
export function startOfDayInTimeZone(now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  return zonedTimeToUtc(timeZone, p.year, p.month, p.day);
}
