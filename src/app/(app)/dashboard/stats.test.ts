import { describe, expect, it } from "vitest";
import { formatPercent, parseDashboardStats, percent, percentChange } from "./stats";

describe("parseDashboardStats", () => {
  it("fills in everything that is missing with zeros", () => {
    const s = parseDashboardStats({ days: 7, totals: { sent: 8 } });
    expect(s.totals).toEqual({ sent: 8, opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0, failed: 0 });
    expect(s.previous.sent).toBe(0);
    expect(s.daily).toEqual([]);
    expect(s.campaigns).toEqual([]);
    expect(s.inboxes).toEqual([]);
    expect(s.today).toEqual({ sent: 0, capacity: 0 });
    expect(s.counts.active_campaigns).toBe(0);
    expect(s.timezone).toBe("UTC");
  });

  it("does not fail on an empty or null answer", () => {
    expect(parseDashboardStats(null).totals.sent).toBe(0);
    expect(parseDashboardStats(undefined).daily).toEqual([]);
    expect(parseDashboardStats("nonsense").counts.leads).toBe(0);
  });

  it("keeps real values", () => {
    const s = parseDashboardStats({
      days: 7,
      timezone: "Europe/Paris",
      contacted: 5,
      replied_leads: 2,
      daily: [{ date: "2026-10-06", sent: 8, opened: 4, replied: 3, bounced: 0 }],
      inboxes: [
        {
          id: "i1",
          email: "a@b.test",
          status: "active",
          last_error: null,
          daily_limit: 30,
          sent_today: 8,
          last_sent_at: "2026-10-06T16:32:03+00:00",
          reads_replies: true,
          last_checked_at: null,
        },
      ],
    });
    expect(s.timezone).toBe("Europe/Paris");
    expect(s.daily[0]).toEqual({ date: "2026-10-06", sent: 8, opened: 4, replied: 3, bounced: 0 });
    expect(s.inboxes[0].reads_replies).toBe(true);
    expect(s.inboxes[0].last_checked_at).toBeNull();
  });
});

describe("percent", () => {
  it("is 0 when there is nothing to divide by", () => {
    expect(percent(3, 0)).toBe(0);
  });
  it("calculates and never goes above 100", () => {
    expect(percent(2, 5)).toBe(40);
    expect(percent(9, 5)).toBe(100);
  });
  it("formats with one decimal", () => {
    expect(formatPercent(33.333)).toBe("33.3%");
  });
});

describe("percentChange", () => {
  it("is null without an earlier number", () => {
    expect(percentChange(5, 0)).toBeNull();
  });
  it("shows growth and decline", () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(10, 10)).toBe(0);
  });
});
