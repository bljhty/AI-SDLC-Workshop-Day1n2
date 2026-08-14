import { describe, it, expect } from "vitest";
import { calculateNextDueDate } from "@/lib/recurrence";

describe("calculateNextDueDate", () => {
  it("daily pattern advances by exactly one day", () => {
    expect(calculateNextDueDate("2026-03-10T09:00:00", "daily")).toBe(
      "2026-03-11T09:00:00"
    );
  });

  it("daily pattern rolls over a month boundary", () => {
    expect(calculateNextDueDate("2026-01-31T09:00:00", "daily")).toBe(
      "2026-02-01T09:00:00"
    );
  });

  it("weekly pattern advances by exactly seven days", () => {
    expect(calculateNextDueDate("2026-03-10T09:00:00", "weekly")).toBe(
      "2026-03-17T09:00:00"
    );
  });

  it("weekly pattern rolls over a month boundary", () => {
    expect(calculateNextDueDate("2026-01-28T18:30:00", "weekly")).toBe(
      "2026-02-04T18:30:00"
    );
  });

  it("monthly pattern keeps the same day-of-month", () => {
    expect(calculateNextDueDate("2026-03-15T12:00:00", "monthly")).toBe(
      "2026-04-15T12:00:00"
    );
  });

  it("monthly pattern rolls over a year boundary", () => {
    expect(calculateNextDueDate("2026-12-05T08:00:00", "monthly")).toBe(
      "2027-01-05T08:00:00"
    );
  });

  it("monthly pattern clamps Jan 31 to Feb 28 in a non-leap year", () => {
    expect(calculateNextDueDate("2026-01-31T10:00:00", "monthly")).toBe(
      "2026-02-28T10:00:00"
    );
  });

  it("monthly pattern clamps Jan 31 to Feb 29 in a leap year", () => {
    expect(calculateNextDueDate("2028-01-31T10:00:00", "monthly")).toBe(
      "2028-02-29T10:00:00"
    );
  });

  it("monthly pattern does not clamp when the target month has enough days", () => {
    expect(calculateNextDueDate("2026-04-30T10:00:00", "monthly")).toBe(
      "2026-05-30T10:00:00"
    );
  });

  it("yearly pattern keeps the same month/day", () => {
    expect(calculateNextDueDate("2026-06-15T07:00:00", "yearly")).toBe(
      "2027-06-15T07:00:00"
    );
  });

  it("yearly pattern clamps Feb 29 to Feb 28 on a non-leap target year", () => {
    // 2028 is a leap year; 2029 is not.
    expect(calculateNextDueDate("2028-02-29T00:00:00", "yearly")).toBe(
      "2029-02-28T00:00:00"
    );
  });

  it("yearly pattern on a non-Feb-29 date is unaffected by leap-year logic", () => {
    expect(calculateNextDueDate("2027-02-28T00:00:00", "yearly")).toBe(
      "2028-02-28T00:00:00"
    );
  });
});
