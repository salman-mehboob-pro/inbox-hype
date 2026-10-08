import { z } from "zod";
import { isValidTimeZone } from "@/lib/leads/import";

export const MAX_STEPS = 20;

export const stepSchema = z.object({
  id: z.uuid().optional(),
  delay_days: z.coerce.number().int().min(0, "0 or more").max(365, "Max 365 days"),
  delay_hours: z.coerce.number().int().min(0, "0 or more").max(23, "Max 23 hours"),
  subject: z.string().max(500, "Subject is too long (max 500)"),
  body: z.string().max(200_000, "Email is too long (max 200,000 characters of HTML)"),
  body_format: z.enum(["rich", "html"]).default("rich"),
});

export const sequenceSchema = z.array(stepSchema).min(1, "Add at least one step").max(MAX_STEPS);

export type StepInput = z.input<typeof stepSchema>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const scheduleSchema = z
  .object({
    timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
    send_days: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Pick at least one day")
      .transform((d) => [...new Set(d)].sort()),
    window_start: time,
    window_end: time,
    use_lead_timezone: z.boolean(),
  })
  .refine((v) => v.window_end > v.window_start, {
    message: "End time must be after start time",
    path: ["window_end"],
  });

export type ScheduleInput = z.input<typeof scheduleSchema>;

export const optionsSchema = z
  .object({
    daily_limit: z.coerce.number().int().min(1, "At least 1").max(10000, "Max 10,000"),
    // The random pause between two emails from the same inbox, in minutes.
    gap_min_minutes: z.coerce.number().int().min(1, "At least 1 minute").max(1440, "Max 1440 (one day)"),
    gap_max_minutes: z.coerce.number().int().min(1, "At least 1 minute").max(1440, "Max 1440 (one day)"),
    track_opens: z.boolean(),
    track_clicks: z.boolean(),
    stop_on_reply: z.boolean(),
    include_unsubscribe: z.boolean(),
    // Pause the campaign when this many of its last 100 emails bounced (= this %). "off" = off.
    bounce_pause_percent: z.preprocess(
      (v) => (v === "" || v === "off" ? null : v),
      z.coerce.number().int().min(1, "At least 1%").max(100, "Max 100%").nullable(),
    ),
    email_account_ids: z.array(z.uuid()).max(100),
  })
  .refine((v) => v.gap_max_minutes >= v.gap_min_minutes, {
    message: "The maximum must be at least the minimum",
    path: ["gap_max_minutes"],
  });

export type OptionsInput = z.input<typeof optionsSchema>;

// Choices for "Pause when bounces reach" (% of the last 100 emails).
export const BOUNCE_PAUSE_CHOICES = [2, 3, 4, 5, 6, 8, 10, 15, 20] as const;

export const nameSchema = z.string().trim().min(1, "Enter a name").max(200, "Max 200 characters");

export const addLeadsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("tag"), tag: z.string().trim().min(1, "Choose a tag").max(50) }),
]);

export const DAYS = [
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
  { value: 7, short: "Sun" },
] as const;
