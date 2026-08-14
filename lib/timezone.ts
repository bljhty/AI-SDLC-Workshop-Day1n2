// All app date/time logic goes through this file. Never use `new Date()`
// directly elsewhere — Singapore has a fixed UTC+8 offset (no DST), but
// centralizing the conversion keeps every call site correct and testable.

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Current instant. The one sanctioned use of `new Date()` in the app. */
export function getSingaporeNow(): Date {
  return new Date();
}

/**
 * Formats a Date as a Singapore-local wall-clock string: `YYYY-MM-DDTHH:mm:ss`.
 * No trailing `Z` — this is local time, not UTC. Fixed-width, so it sorts
 * lexicographically the same as chronologically.
 */
export function formatSingaporeDate(date: Date = getSingaporeNow()): string {
  const sgt = new Date(date.getTime() + SGT_OFFSET_MS);
  return sgt.toISOString().slice(0, 19);
}

/** `YYYY-MM-DD` only, Singapore-local. */
export function formatSingaporeDateOnly(date: Date = getSingaporeNow()): string {
  return formatSingaporeDate(date).slice(0, 10);
}

/**
 * Parses a Singapore-local wall-clock string (as produced by
 * `formatSingaporeDate`) back into the real UTC instant it represents.
 * Parses components manually rather than `new Date(string)` — the latter's
 * behavior for offset-less date-time strings depends on the host's own
 * timezone, which would silently break this on a non-SGT server.
 */
export function parseSingaporeDate(isoLocal: string): Date {
  const [datePart, timePart = "00:00:00"] = isoLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second || 0) - SGT_OFFSET_MS;
  return new Date(utcMs);
}

/** Singapore-local calendar/time components of a given instant (or now). */
export function getSingaporeParts(date: Date = getSingaporeNow()) {
  const iso = formatSingaporeDate(date);
  const [datePart, timePart] = iso.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);
  return { year, month, day, hour, minute, second };
}

/** Builds a Singapore-local ISO string from calendar/time components. */
export function formatSingaporeParts(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/** `now + minutes`, returned as a Singapore-local ISO string. */
export function addMinutesFromSingaporeNow(minutes: number): string {
  return formatSingaporeDate(new Date(getSingaporeNow().getTime() + minutes * 60_000));
}

/** `isoLocal + minutes` (negative allowed), returned as a Singapore-local ISO string. */
export function addMinutesToSingaporeDate(isoLocal: string, minutes: number): string {
  return formatSingaporeDate(new Date(parseSingaporeDate(isoLocal).getTime() + minutes * 60_000));
}

/** True if `isoLocal` (a Singapore-local due_date string) is before now. */
export function isPastSingapore(isoLocal: string): boolean {
  return parseSingaporeDate(isoLocal).getTime() < getSingaporeNow().getTime();
}
