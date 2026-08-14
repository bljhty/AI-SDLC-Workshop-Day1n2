import { formatSingaporeParts } from "./timezone";
import type { RecurrencePattern } from "./db";

function daysInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of the *next* month is the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Next due date for a recurring todo, given its current Singapore-local
 * due_date and pattern. Handles the edge cases that are easy to get subtly
 * wrong: month-end clamping (Jan 31 -> Feb 28/29) and leap-day yearly
 * recurrence (Feb 29 -> Feb 28 on a non-leap target year).
 */
export function calculateNextDueDate(
  currentIsoLocal: string,
  pattern: RecurrencePattern
): string {
  const [datePart, timePart = "00:00:00"] = currentIsoLocal.split("T");
  let [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);

  switch (pattern) {
    case "daily": {
      const d = new Date(Date.UTC(year, month - 1, day + 1));
      year = d.getUTCFullYear();
      month = d.getUTCMonth() + 1;
      day = d.getUTCDate();
      break;
    }
    case "weekly": {
      const d = new Date(Date.UTC(year, month - 1, day + 7));
      year = d.getUTCFullYear();
      month = d.getUTCMonth() + 1;
      day = d.getUTCDate();
      break;
    }
    case "monthly": {
      let nextMonth = month + 1;
      let nextYear = year;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      day = Math.min(day, daysInMonth(nextYear, nextMonth));
      month = nextMonth;
      year = nextYear;
      break;
    }
    case "yearly": {
      const nextYear = year + 1;
      if (month === 2 && day === 29 && !isLeapYear(nextYear)) {
        day = 28;
      }
      year = nextYear;
      break;
    }
  }

  return formatSingaporeParts({ year, month, day, hour, minute, second });
}
