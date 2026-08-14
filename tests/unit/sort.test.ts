import { describe, it, expect } from "vitest";
import { sortTodos } from "@/lib/sort";
import type { Todo } from "@/lib/db";
import { formatSingaporeDate, getSingaporeNow } from "@/lib/timezone";

const NOW = getSingaporeNow();
const PAST = formatSingaporeDate(new Date(NOW.getTime() - 60 * 60_000)); // 1h ago
const FUTURE_SOON = formatSingaporeDate(new Date(NOW.getTime() + 60 * 60_000)); // +1h
const FUTURE_LATER = formatSingaporeDate(new Date(NOW.getTime() + 2 * 60 * 60_000)); // +2h

let nextId = 1;

function makeTodo(overrides: Partial<Todo>): Todo {
  return {
    id: nextId++,
    user_id: 1,
    title: `todo-${nextId}`,
    completed: false,
    due_date: null,
    priority: "medium",
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: null,
    ...overrides,
  };
}

describe("sortTodos bucketing", () => {
  it("buckets completed todos into `completed` regardless of due date", () => {
    const todo = makeTodo({ completed: true, due_date: PAST });
    const { overdue, pending, completed } = sortTodos([todo]);
    expect(completed).toEqual([todo]);
    expect(overdue).toEqual([]);
    expect(pending).toEqual([]);
  });

  it("buckets an incomplete todo with a past due date into `overdue`", () => {
    const todo = makeTodo({ completed: false, due_date: PAST });
    const { overdue, pending } = sortTodos([todo]);
    expect(overdue).toEqual([todo]);
    expect(pending).toEqual([]);
  });

  it("buckets an incomplete todo with a future due date into `pending`", () => {
    const todo = makeTodo({ completed: false, due_date: FUTURE_SOON });
    const { overdue, pending } = sortTodos([todo]);
    expect(pending).toEqual([todo]);
    expect(overdue).toEqual([]);
  });

  it("buckets an incomplete todo with no due date into `pending`", () => {
    const todo = makeTodo({ completed: false, due_date: null });
    const { pending, overdue } = sortTodos([todo]);
    expect(pending).toEqual([todo]);
    expect(overdue).toEqual([]);
  });
});

describe("sortTodos ordering within active buckets (priority -> due_date -> created_at)", () => {
  it("sorts by priority first: high before medium before low", () => {
    const low = makeTodo({ priority: "low", due_date: FUTURE_SOON });
    const high = makeTodo({ priority: "high", due_date: FUTURE_SOON });
    const medium = makeTodo({ priority: "medium", due_date: FUTURE_SOON });
    const { pending } = sortTodos([low, high, medium]);
    expect(pending.map((t) => t.priority)).toEqual(["high", "medium", "low"]);
  });

  it("within the same priority, sorts by due_date earliest first", () => {
    const later = makeTodo({ priority: "medium", due_date: FUTURE_LATER });
    const sooner = makeTodo({ priority: "medium", due_date: FUTURE_SOON });
    const { pending } = sortTodos([later, sooner]);
    expect(pending).toEqual([sooner, later]);
  });

  it("within the same priority, a null due_date sorts after any set due_date", () => {
    const withDate = makeTodo({ priority: "medium", due_date: FUTURE_SOON });
    const withoutDate = makeTodo({ priority: "medium", due_date: null });
    const { pending } = sortTodos([withoutDate, withDate]);
    expect(pending).toEqual([withDate, withoutDate]);
  });

  it("within same priority and due_date, sorts by created_at newest first", () => {
    const older = makeTodo({
      priority: "medium",
      due_date: FUTURE_SOON,
      created_at: "2026-01-01T00:00:00",
    });
    const newer = makeTodo({
      priority: "medium",
      due_date: FUTURE_SOON,
      created_at: "2026-02-01T00:00:00",
    });
    const { pending } = sortTodos([older, newer]);
    expect(pending).toEqual([newer, older]);
  });

  it("applies the same ordering rules to the overdue bucket", () => {
    const lowOverdue = makeTodo({ priority: "low", due_date: PAST });
    const highOverdue = makeTodo({ priority: "high", due_date: PAST });
    const { overdue } = sortTodos([lowOverdue, highOverdue]);
    expect(overdue).toEqual([highOverdue, lowOverdue]);
  });
});

describe("sortTodos ordering within completed bucket", () => {
  it("sorts completed todos by created_at newest first (priority/due_date ignored)", () => {
    const older = makeTodo({
      completed: true,
      priority: "low",
      created_at: "2026-01-01T00:00:00",
    });
    const newer = makeTodo({
      completed: true,
      priority: "high",
      created_at: "2026-03-01T00:00:00",
    });
    const { completed } = sortTodos([older, newer]);
    expect(completed).toEqual([newer, older]);
  });
});
