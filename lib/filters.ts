import type { Priority, Todo } from "./db";

export interface FilterState {
  search: string;
  priority: Priority | "";
  tagId: number | "";
  completion: "all" | "completed" | "incomplete";
  dueDateFrom: string; // YYYY-MM-DD or ""
  dueDateTo: string; // YYYY-MM-DD or ""
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  priority: "",
  tagId: "",
  completion: "all",
  dueDateFrom: "",
  dueDateTo: "",
};

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.priority !== "" ||
    filters.tagId !== "" ||
    filters.completion !== "all" ||
    filters.dueDateFrom !== "" ||
    filters.dueDateTo !== ""
  );
}

/**
 * Filters apply in this exact order: search -> priority -> tag -> completion
 * -> date range. Each stage narrows what the next stage sees.
 *
 * The search stage matches (case-insensitively, partial match) against the
 * todo title, subtask titles, and tag names.
 */
export function applyFilters<T extends Todo>(todos: T[], filters: FilterState): T[] {
  let result = todos;

  const query = filters.search.trim().toLowerCase();
  if (query) {
    result = result.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        (t.subtasks ?? []).some((s) => s.title.toLowerCase().includes(query)) ||
        (t.tags ?? []).some((tag) => tag.name.toLowerCase().includes(query))
    );
  }

  if (filters.priority) {
    result = result.filter((t) => t.priority === filters.priority);
  }

  if (filters.tagId !== "") {
    result = result.filter((t) => (t.tags ?? []).some((tag) => tag.id === filters.tagId));
  }

  if (filters.completion !== "all") {
    const wantCompleted = filters.completion === "completed";
    result = result.filter((t) => t.completed === wantCompleted);
  }

  if (filters.dueDateFrom) {
    result = result.filter((t) => !!t.due_date && t.due_date.slice(0, 10) >= filters.dueDateFrom);
  }
  if (filters.dueDateTo) {
    result = result.filter((t) => !!t.due_date && t.due_date.slice(0, 10) <= filters.dueDateTo);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Saved filter presets (localStorage — client-only, no server round trip)
// ---------------------------------------------------------------------------

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

const PRESETS_KEY = "todo-app:filter-presets";

export function loadFilterPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    return raw ? (JSON.parse(raw) as FilterPreset[]) : [];
  } catch {
    return [];
  }
}

export function saveFilterPreset(name: string, filters: FilterState): FilterPreset[] {
  const preset: FilterPreset = {
    id: crypto.randomUUID(),
    name,
    filters,
    createdAt: new Date().toISOString(),
  };
  const next = [...loadFilterPresets(), preset];
  window.localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  return next;
}

export function deleteFilterPreset(id: string): FilterPreset[] {
  const next = loadFilterPresets().filter((p) => p.id !== id);
  window.localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  return next;
}
