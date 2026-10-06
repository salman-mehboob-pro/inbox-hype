import { describe, expect, it } from "vitest";
import { clockMinutes, isInSendWindow, nextWindowOpen, resolveTimeZone, type SendWindow } from "./schedule";

const weekdays = [1, 2, 3, 4, 5];
const newYork: SendWindow = { timeZone: "America/New_York", days: weekdays, start: "09:00", end: "17:00" };

describe("clockMinutes", () => {
  it("reads Postgres time values", () => {
    expect(clockMinutes("09:00")).toBe(540);
    expect(clockMinutes("17:30:00")).toBe(1050);
  });
});

describe("isInSendWindow", () => {
  it("is open during the day on a sending day (New York is UTC-4 in October)", () => {
    // Tuesday 2026-10-06 10:00 in New York = 14:00 UTC
    expect(isInSendWindow(new Date("2026-10-06T14:00:00Z"), newYork)).toBe(true);
  });

  it("is closed before the start and from the end time on", () => {
    expect(isInSendWindow(new Date("2026-10-06T12:59:00Z"), newYork)).toBe(false); // 08:59
    expect(isInSendWindow(new Date("2026-10-06T13:00:00Z"), newYork)).toBe(true); // 09:00
    expect(isInSendWindow(new Date("2026-10-06T20:59:00Z"), newYork)).toBe(true); // 16:59
    expect(isInSendWindow(new Date("2026-10-06T21:00:00Z"), newYork)).toBe(false); // 17:00
  });

  it("is closed on days that are not sending days", () => {
    // Saturday 2026-10-10 11:00 in New York
    expect(isInSendWindow(new Date("2026-10-10T15:00:00Z"), newYork)).toBe(false);
  });

  it("uses the timezone's own calendar day, not UTC's", () => {
    // Friday 22:00 in Tokyo is still Friday there, but already Friday 13:00 UTC.
    const tokyo: SendWindow = { timeZone: "Asia/Tokyo", days: [5], start: "21:00", end: "23:00" };
    expect(isInSendWindow(new Date("2026-10-09T13:00:00Z"), tokyo)).toBe(true);
    // Saturday 00:30 in Tokyo = Friday 15:30 UTC: Saturday there, so closed.
    expect(isInSendWindow(new Date("2026-10-09T15:30:00Z"), tokyo)).toBe(false);
  });
});

describe("nextWindowOpen", () => {
  it("returns now when the window is open", () => {
    const now = new Date("2026-10-06T14:00:00Z");
    expect(nextWindowOpen(now, newYork)).toEqual(now);
  });

  it("opens later the same day when it is too early", () => {
    // Tuesday 07:00 in New York -> 09:00 the same day = 13:00 UTC
    expect(nextWindowOpen(new Date("2026-10-06T11:00:00Z"), newYork).toISOString()).toBe("2026-10-06T13:00:00.000Z");
  });

  it("opens the next sending day after the window closed", () => {
    // Tuesday 18:00 in New York -> Wednesday 09:00 = 13:00 UTC
    expect(nextWindowOpen(new Date("2026-10-06T22:00:00Z"), newYork).toISOString()).toBe("2026-10-07T13:00:00.000Z");
  });

  it("skips the weekend", () => {
    // Friday 2026-10-09 18:00 in New York -> Monday 2026-10-12 09:00 = 13:00 UTC
    expect(nextWindowOpen(new Date("2026-10-09T22:00:00Z"), newYork).toISOString()).toBe("2026-10-12T13:00:00.000Z");
  });

  it("follows the clock change (US daylight saving ends 2026-11-01)", () => {
    // Friday 2026-10-30 18:00 EDT -> Monday 2026-11-02 09:00 EST = 14:00 UTC
    expect(nextWindowOpen(new Date("2026-10-30T22:00:00Z"), newYork).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("never returns a time in the past", () => {
    const now = new Date("2026-10-06T23:59:00Z");
    expect(nextWindowOpen(now, newYork).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("resolveTimeZone", () => {
  const campaign = { timezone: "America/New_York", use_lead_timezone: true };

  it("uses the lead's timezone when allowed and valid", () => {
    expect(resolveTimeZone(campaign, "Europe/London")).toBe("Europe/London");
  });

  it("falls back to the campaign timezone", () => {
    expect(resolveTimeZone(campaign, null)).toBe("America/New_York");
    expect(resolveTimeZone(campaign, "Not/AZone")).toBe("America/New_York");
    expect(resolveTimeZone({ ...campaign, use_lead_timezone: false }, "Europe/London")).toBe("America/New_York");
  });

  it("falls back to UTC when even the campaign timezone is invalid", () => {
    expect(resolveTimeZone({ timezone: "nope", use_lead_timezone: true }, null)).toBe("UTC");
  });
});
