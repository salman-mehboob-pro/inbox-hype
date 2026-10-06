import { describe, expect, it } from "vitest";
import { startOfDayInTimeZone, timeZoneOffsetMs, zonedParts, zonedTimeToUtc } from "./time";

describe("zonedParts", () => {
  it("gives wall-clock time and weekday in a timezone", () => {
    // 2026-10-05 is a Monday.
    const p = zonedParts(new Date("2026-10-05T03:00:00Z"), "Asia/Karachi");
    expect(p).toMatchObject({ year: 2026, month: 10, day: 5, hour: 8, minute: 0, weekday: 1 });
  });

  it("can be on a different day than UTC", () => {
    const p = zonedParts(new Date("2026-10-05T02:00:00Z"), "America/New_York");
    expect(p).toMatchObject({ day: 4, hour: 22, weekday: 7 });
  });
});

describe("timeZoneOffsetMs", () => {
  it("knows fixed and DST offsets", () => {
    expect(timeZoneOffsetMs(new Date("2026-10-05T12:00:00Z"), "Asia/Karachi")).toBe(5 * 3600_000);
    expect(timeZoneOffsetMs(new Date("2026-07-01T12:00:00Z"), "America/New_York")).toBe(-4 * 3600_000);
    expect(timeZoneOffsetMs(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe(-5 * 3600_000);
    expect(timeZoneOffsetMs(new Date("2026-10-05T12:00:00Z"), "UTC")).toBe(0);
  });
});

describe("zonedTimeToUtc", () => {
  it("converts wall-clock time to UTC", () => {
    expect(zonedTimeToUtc("Asia/Karachi", 2026, 10, 5, 9, 0).toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(zonedTimeToUtc("America/New_York", 2026, 1, 15, 9, 0).toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(zonedTimeToUtc("America/New_York", 2026, 7, 1, 9, 0).toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });

  it("handles the day DST starts", () => {
    // US DST starts 2026-03-08 at 02:00 local; 09:00 that day is EDT (UTC-4).
    expect(zonedTimeToUtc("America/New_York", 2026, 3, 8, 9, 0).toISOString()).toBe("2026-03-08T13:00:00.000Z");
  });
});

describe("startOfDayInTimeZone", () => {
  it("returns local midnight as UTC", () => {
    expect(startOfDayInTimeZone(new Date("2026-10-05T03:00:00Z"), "Asia/Karachi").toISOString()).toBe(
      "2026-10-04T19:00:00.000Z",
    );
    expect(startOfDayInTimeZone(new Date("2026-10-05T02:00:00Z"), "America/New_York").toISOString()).toBe(
      "2026-10-04T04:00:00.000Z",
    );
  });
});
