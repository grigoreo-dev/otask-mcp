import { describe, expect, test } from "bun:test";
import {
  DUE_SCAN_MAX_PAGES,
  filterTasksByDue,
  matchesDue,
  startOfDayUtcMs,
} from "../src/services/due-filter.ts";

describe("due-filter", () => {
  test("DUE_SCAN_MAX_PAGES is 5", () => {
    expect(DUE_SCAN_MAX_PAGES).toBe(5);
  });

  test("null end_at never matches overdue/today/week", () => {
    const now = new Date("2026-07-09T12:00:00+03:00");
    expect(matchesDue(null, "overdue", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue(null, "today", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue(null, "week", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue(null, "none", now, "Europe/Moscow")).toBe(true);
  });

  test("today matches calendar day in Europe/Moscow", () => {
    const now = new Date("2026-07-09T15:00:00+03:00");
    expect(matchesDue("2026-07-09T10:00:00+03:00", "today", now, "Europe/Moscow")).toBe(true);
    expect(matchesDue("2026-07-08T23:00:00+03:00", "today", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue("2026-07-10T01:00:00+03:00", "today", now, "Europe/Moscow")).toBe(false);
  });

  test("overdue is before start of today in tz", () => {
    const now = new Date("2026-07-09T01:00:00+03:00");
    expect(matchesDue("2026-07-08T23:59:00+03:00", "overdue", now, "Europe/Moscow")).toBe(true);
    expect(matchesDue("2026-07-09T00:00:00+03:00", "overdue", now, "Europe/Moscow")).toBe(false);
  });

  test("week is [startOfToday, startOfToday+7d)", () => {
    const now = new Date("2026-07-09T12:00:00+03:00");
    expect(matchesDue("2026-07-09T12:00:00+03:00", "week", now, "Europe/Moscow")).toBe(true);
    expect(matchesDue("2026-07-15T23:00:00+03:00", "week", now, "Europe/Moscow")).toBe(true);
    expect(matchesDue("2026-07-16T00:00:00+03:00", "week", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue("2026-07-08T12:00:00+03:00", "week", now, "Europe/Moscow")).toBe(false);
  });

  test("filterTasksByDue keeps matching only", () => {
    const now = new Date("2026-07-09T12:00:00Z");
    const tasks = [
      { id: 1, end_at: "2026-07-01T00:00:00Z" },
      { id: 2, end_at: "2026-07-09T18:00:00Z" },
      { id: 3, end_at: null },
    ];
    expect(filterTasksByDue(tasks, "overdue", now, "UTC").map((t) => t.id)).toEqual([1]);
    expect(filterTasksByDue(tasks, "none", now, "UTC")).toHaveLength(3);
  });

  test("startOfDayUtcMs is stable for UTC", () => {
    const now = new Date("2026-07-09T15:30:00Z");
    expect(startOfDayUtcMs(now, "UTC")).toBe(Date.parse("2026-07-09T00:00:00.000Z"));
  });
});
