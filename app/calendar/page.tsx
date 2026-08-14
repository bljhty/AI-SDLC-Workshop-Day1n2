"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Holiday, Priority, Todo } from "@/lib/db";
import { generateCalendarGrid, formatMonthLabel } from "@/lib/calendar";
import { formatSingaporeDateOnly, getSingaporeNow } from "@/lib/timezone";

const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-blue-500",
};

const MAX_VISIBLE_PER_DAY = 3;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function currentYearMonth(): { year: number; month: number } {
  const [y, m] = formatSingaporeDateOnly(getSingaporeNow()).split("-").map(Number);
  return { year: y, month: m };
}

function parseMonthParam(param: string | null): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12 && y >= 1970 && y <= 9999) {
      return { year: y, month: m };
    }
  }
  return currentYearMonth();
}

function monthParam(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading…</p>}>
      <CalendarView />
    </Suspense>
  );
}

function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { year, month } = parseMonthParam(searchParams.get("month"));

  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/todos")
      .then((res) => (res.ok ? res.json() : []))
      .then(setTodos);
  }, []);

  useEffect(() => {
    fetch(`/api/holidays?year=${year}&month=${month}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setHolidays);
  }, [year, month]);

  const days = useMemo(() => generateCalendarGrid(year, month), [year, month]);
  const holidayByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidays) map.set(h.date, h.name);
    return map;
  }, [holidays]);
  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of todos) {
      if (!todo.due_date) continue;
      const date = todo.due_date.slice(0, 10);
      const list = map.get(date) ?? [];
      list.push(todo);
      map.set(date, list);
    }
    return map;
  }, [todos]);

  function goToMonth(y: number, m: number) {
    router.push(`/calendar?month=${monthParam(y, m)}`);
  }

  function goPrev() {
    goToMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  }
  function goNext() {
    goToMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);
  }
  function goToday() {
    const { year: y, month: m } = currentYearMonth();
    goToMonth(y, m);
  }

  const monthLabel = formatMonthLabel(year, month);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          Todos
        </Link>
      </header>

      <div className="mb-4 flex items-center justify-between">
        <button onClick={goPrev} className="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-600">
          ‹ Prev
        </button>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">{monthLabel}</h2>
          <button onClick={goToday} className="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-600">
            Today
          </button>
        </div>
        <button onClick={goNext} className="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-600">
          Next ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-xs dark:border-slate-700 dark:bg-slate-700">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="bg-slate-50 px-2 py-1 text-center font-medium text-slate-500 dark:bg-slate-800"
          >
            {label}
          </div>
        ))}
        {days.map((d) => {
          const dayTodos = todosByDate.get(d.date) ?? [];
          const holidayName = holidayByDate.get(d.date);
          const visible = dayTodos.slice(0, MAX_VISIBLE_PER_DAY);
          const overflow = dayTodos.length - visible.length;

          return (
            <button
              key={d.date}
              onClick={() => setSelectedDate(d.date)}
              className={`flex min-h-20 flex-col items-start gap-1 bg-white p-1.5 text-left dark:bg-slate-900 ${
                !d.isCurrentMonth ? "opacity-40" : ""
              } ${d.isWeekend ? "bg-slate-50 dark:bg-slate-950" : ""}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  d.isToday ? "bg-blue-600 font-semibold text-white" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {d.day}
              </span>
              {holidayName && (
                <span className="truncate text-[10px] text-purple-600 dark:text-purple-300">
                  {holidayName}
                </span>
              )}
              <div className="w-full space-y-0.5">
                {visible.map((t) => (
                  <div key={t.id} className="flex items-center gap-1 truncate">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                    <span className="truncate text-[10px] text-slate-600 dark:text-slate-300">
                      {t.title}
                    </span>
                  </div>
                ))}
                {overflow > 0 && (
                  <span className="text-[10px] text-slate-400">+{overflow} more</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <DayModal
          date={selectedDate}
          todos={todosByDate.get(selectedDate) ?? []}
          holidayName={holidayByDate.get(selectedDate)}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </main>
  );
}

function DayModal({
  date,
  todos,
  holidayName,
  onClose,
}: {
  date: string;
  todos: Todo[];
  holidayName?: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={`Todos for ${date}`}
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{date}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        {holidayName && (
          <p className="mb-3 text-sm text-purple-600 dark:text-purple-300">🎉 {holidayName}</p>
        )}
        {todos.length === 0 ? (
          <p className="text-sm text-slate-400">No todos due this day.</p>
        ) : (
          <ul className="space-y-2">
            {todos.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[t.priority]}`} />
                <span className={t.completed ? "text-slate-400 line-through" : ""}>{t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
