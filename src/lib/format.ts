// plural(1, "lead") -> "1 lead", plural(3, "lead") -> "3 leads"
export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? word : pluralWord}`;
}

const rtf =new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

// "3 minutes ago", "yesterday", ...
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "Never";
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
