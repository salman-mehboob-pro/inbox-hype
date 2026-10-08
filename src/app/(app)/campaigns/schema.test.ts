import { describe, expect, it } from "vitest";
import { optionsSchema } from "./schema";

const base = {
  daily_limit: "100",
  gap_min_minutes: "1",
  gap_max_minutes: "2",
  track_opens: false,
  track_clicks: false,
  stop_on_reply: true,
  include_unsubscribe: true,
  email_account_ids: [],
};

describe("optionsSchema bounce_pause_percent", () => {
  it("off means no bounce pause", () => {
    expect(optionsSchema.parse({ ...base, bounce_pause_percent: "off" }).bounce_pause_percent).toBeNull();
    expect(optionsSchema.parse({ ...base, bounce_pause_percent: "" }).bounce_pause_percent).toBeNull();
    expect(optionsSchema.parse({ ...base, bounce_pause_percent: null }).bounce_pause_percent).toBeNull();
  });

  it("a percent is stored as a number", () => {
    expect(optionsSchema.parse({ ...base, bounce_pause_percent: "6" }).bounce_pause_percent).toBe(6);
  });

  it("rejects values outside 1-100", () => {
    expect(optionsSchema.safeParse({ ...base, bounce_pause_percent: "0" }).success).toBe(false);
    expect(optionsSchema.safeParse({ ...base, bounce_pause_percent: "101" }).success).toBe(false);
    expect(optionsSchema.safeParse({ ...base, bounce_pause_percent: "abc" }).success).toBe(false);
  });
});
