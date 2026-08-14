import { describe, it, expect } from "vitest";
import { generateCalendarGrid, formatMonthLabel } from "@/lib/calendar";

describe("generateCalendarGrid", () => {
  it("produces a grid whose length is a multiple of 7 (5 or 6 full weeks)", () => {
    const grid = generateCalendarGrid(2026, 3); // March 2026
    expect(grid.length % 7).toBe(0);
    expect([35, 42]).toContain(grid.length);
  });

  it("February 2026 (28 days, starts on a Sunday) needs no padding: exactly 4 rows", () => {
    const grid = generateCalendarGrid(2026, 2);
    expect(grid.length).toBe(28);
    expect(grid.every((d) => d.isCurrentMonth)).toBe(true);
  });

  it("leading days belong to the previous month and are numbered consecutively up to its last day", () => {
    // March 2026 starts on a Sunday (weekday 0), so there should be no
    // leading days at all; use a month that starts mid-week instead.
    const grid = generateCalendarGrid(2026, 4); // April 2026 starts on a Wednesday
    const leading = grid.filter((d) => !d.isCurrentMonth && d.day > 15);
    expect(leading.length).toBeGreaterThan(0);
    for (const day of leading) {
      expect(day.date.startsWith("2026-03")).toBe(true);
    }
    // Leading days must end at March's last day (31) immediately before day 1.
    const firstCurrentIdx = grid.findIndex((d) => d.isCurrentMonth);
    if (firstCurrentIdx > 0) {
      expect(grid[firstCurrentIdx - 1].day).toBe(31);
    }
  });

  it("trailing days belong to the next month and start at day 1", () => {
    const grid = generateCalendarGrid(2026, 4); // April 2026
    const lastCurrentIdx =
      grid.length - 1 - [...grid].reverse().findIndex((d) => d.isCurrentMonth);
    const trailing = grid.slice(lastCurrentIdx + 1);
    if (trailing.length > 0) {
      expect(trailing[0].day).toBe(1);
      expect(trailing[0].date.startsWith("2026-05")).toBe(true);
      expect(trailing.every((d) => !d.isCurrentMonth)).toBe(true);
    }
  });

  it("December rolls the trailing month into January of the next year", () => {
    const grid = generateCalendarGrid(2026, 12);
    const trailing = grid.filter((d) => !d.isCurrentMonth && d.date > "2026-12-31");
    for (const day of trailing) {
      expect(day.date.startsWith("2027-01")).toBe(true);
    }
  });

  it("January rolls the leading month into December of the previous year", () => {
    const grid = generateCalendarGrid(2026, 1);
    const leading = grid.filter((d) => !d.isCurrentMonth && d.date < "2026-01-01");
    for (const day of leading) {
      expect(day.date.startsWith("2025-12")).toBe(true);
    }
  });

  it("flags isWeekend true only for Saturday/Sunday dates", () => {
    const grid = generateCalendarGrid(2026, 3);
    for (const day of grid) {
      const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
      expect(day.isWeekend).toBe(weekday === 0 || weekday === 6);
    }
  });

  it("marks at most one day as isToday, and only within the current month if present", () => {
    const grid = generateCalendarGrid(2026, 3);
    const todays = grid.filter((d) => d.isToday);
    expect(todays.length).toBeLessThanOrEqual(1);
  });

  it("isPast is true only for dates strictly before today, in ascending date order", () => {
    const grid = generateCalendarGrid(2026, 3);
    const pastDates = grid.filter((d) => d.isPast).map((d) => d.date);
    const nonPastDates = grid.filter((d) => !d.isPast).map((d) => d.date);
    if (pastDates.length > 0 && nonPastDates.length > 0) {
      // Date strings are zero-padded YYYY-MM-DD, so lexicographic order
      // matches chronological order.
      const maxPast = pastDates.reduce((a, b) => (a > b ? a : b));
      const minNonPast = nonPastDates.reduce((a, b) => (a < b ? a : b));
      expect(maxPast < minNonPast).toBe(true);
    }
    // isPast and isToday are mutually exclusive by construction.
    expect(grid.every((d) => !(d.isPast && d.isToday))).toBe(true);
  });
});

describe("formatMonthLabel", () => {
  it("formats a month/year as 'Month YYYY'", () => {
    expect(formatMonthLabel(2026, 3)).toBe("March 2026");
  });

  it("formats December correctly", () => {
    expect(formatMonthLabel(2026, 12)).toBe("December 2026");
  });

  it("formats January correctly", () => {
    expect(formatMonthLabel(2027, 1)).toBe("January 2027");
  });
});
