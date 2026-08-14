import { formatSingaporeDateOnly, getSingaporeNow } from "./timezone";

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "March 2026" — pure calendar-label formatting, not a real-world instant. */
export function formatMonthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function makeDay(year: number, month: number, day: number, isCurrentMonth: boolean, todayStr: string): CalendarDay {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const date = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    date,
    day,
    isCurrentMonth,
    isToday: date === todayStr,
    isPast: date < todayStr,
    isWeekend: weekday === 0 || weekday === 6,
  };
}

/**
 * Always produces a full grid — 5 or 6 rows of 7 days — with leading and
 * trailing days from the adjacent months filled in, so the calendar layout
 * never jumps height between months.
 */
export function generateCalendarGrid(year: number, month: number): CalendarDay[] {
  const todayStr = formatSingaporeDateOnly(getSingaporeNow());
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const thisMonthDays = daysInMonth(year, month);
  const prevMonthDays = daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);

  const totalRows = Math.ceil((firstWeekday + thisMonthDays) / 7);
  const totalCells = totalRows * 7;

  const days: CalendarDay[] = [];

  for (let i = 0; i < firstWeekday; i++) {
    const day = prevMonthDays - firstWeekday + 1 + i;
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    days.push(makeDay(y, m, day, false, todayStr));
  }

  for (let day = 1; day <= thisMonthDays; day++) {
    days.push(makeDay(year, month, day, true, todayStr));
  }

  let nextDay = 1;
  while (days.length < totalCells) {
    const y = month === 12 ? year + 1 : year;
    const m = month === 12 ? 1 : month + 1;
    days.push(makeDay(y, m, nextDay, false, todayStr));
    nextDay++;
  }

  return days;
}
