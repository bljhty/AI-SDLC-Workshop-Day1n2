import { describe, it, expect } from "vitest";
import {
  formatSingaporeDate,
  parseSingaporeDate,
  formatSingaporeDateOnly,
  addMinutesToSingaporeDate,
  isPastSingapore,
  getSingaporeNow,
} from "@/lib/timezone";

describe("formatSingaporeDate / parseSingaporeDate round-trip", () => {
  it("parsing a formatted Singapore-local string reproduces the same instant", () => {
    const original = new Date("2026-06-15T10:00:00Z"); // an arbitrary UTC instant
    const formatted = formatSingaporeDate(original);
    const parsed = parseSingaporeDate(formatted);
    expect(parsed.getTime()).toBe(original.getTime());
  });

  it("formats as Singapore-local wall clock (UTC+8, no trailing Z)", () => {
    const utc = new Date("2026-01-01T00:00:00Z");
    expect(formatSingaporeDate(utc)).toBe("2026-01-01T08:00:00");
  });

  it("parses a Singapore-local string back into the correct UTC instant", () => {
    const parsed = parseSingaporeDate("2026-01-01T08:00:00");
    expect(parsed.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("formatSingaporeDateOnly returns just the YYYY-MM-DD portion", () => {
    const utc = new Date("2026-03-10T23:30:00Z"); // 2026-03-11 07:30 SGT
    expect(formatSingaporeDateOnly(utc)).toBe("2026-03-11");
  });
});

describe("addMinutesToSingaporeDate", () => {
  it("adds positive minutes, crossing an hour boundary", () => {
    expect(addMinutesToSingaporeDate("2026-03-10T09:45:00", 30)).toBe(
      "2026-03-10T10:15:00"
    );
  });

  it("adds negative minutes (subtracts time), crossing a day boundary", () => {
    expect(addMinutesToSingaporeDate("2026-03-10T00:10:00", -20)).toBe(
      "2026-03-09T23:50:00"
    );
  });

  it("adding zero minutes returns the same wall-clock time", () => {
    expect(addMinutesToSingaporeDate("2026-03-10T09:45:00", 0)).toBe(
      "2026-03-10T09:45:00"
    );
  });
});

describe("isPastSingapore", () => {
  it("returns true for a date far in the past", () => {
    expect(isPastSingapore("2000-01-01T00:00:00")).toBe(true);
  });

  it("returns false for a date far in the future", () => {
    expect(isPastSingapore("2999-01-01T00:00:00")).toBe(false);
  });

  it("returns false for a moment a few minutes ahead of now", () => {
    const future = formatSingaporeDate(
      new Date(getSingaporeNow().getTime() + 5 * 60_000)
    );
    expect(isPastSingapore(future)).toBe(false);
  });

  it("returns true for a moment a few minutes behind now", () => {
    const past = formatSingaporeDate(
      new Date(getSingaporeNow().getTime() - 5 * 60_000)
    );
    expect(isPastSingapore(past)).toBe(true);
  });
});
