import type { Todo } from "./db";
import { isPastSingapore } from "./timezone";

export interface SortedTodos<T extends Todo = Todo> {
  overdue: T[];
  pending: T[];
  completed: T[];
}

const PRIORITY_RANK: Record<Todo["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** priority(high→med→low) -> due_date(earliest→latest, nulls last) -> created_at(newest→oldest) */
function compareActive(a: Todo, b: Todo): number {
  const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  if (a.due_date !== b.due_date) {
    if (a.due_date === null) return 1;
    if (b.due_date === null) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }

  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

/** Buckets todos into Overdue / Pending / Completed and sorts each section. */
export function sortTodos<T extends Todo>(todos: T[]): SortedTodos<T> {
  const overdue: T[] = [];
  const pending: T[] = [];
  const completed: T[] = [];

  for (const todo of todos) {
    if (todo.completed) {
      completed.push(todo);
      continue;
    }
    if (todo.due_date && isPastSingapore(todo.due_date)) {
      overdue.push(todo);
    } else {
      pending.push(todo);
    }
  }

  overdue.sort(compareActive);
  pending.sort(compareActive);
  completed.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { overdue, pending, completed };
}
