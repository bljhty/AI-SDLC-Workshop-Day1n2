"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Priority, RecurrencePattern, Tag, Template, Todo } from "@/lib/db";

/**
 * `_key` is a stable client-side identity for React's `key` prop, separate
 * from `id`. Optimistic creation renders a todo under a temporary negative
 * `id` before the server assigns the real one; if `key` were `todo.id`
 * directly, that id swap would make React treat it as a brand-new element —
 * unmounting and remounting the row (and wiping any in-progress interaction,
 * like a subtask being typed) the instant the create request resolves.
 * `_key` is generated once at optimistic-insert time and carried through
 * the swap so the same component instance persists across it.
 */
type ClientTodo = Todo & { _key: string };
import { sortTodos } from "@/lib/sort";
import { useNotifications } from "@/lib/hooks/useNotifications";
import {
  applyFilters,
  DEFAULT_FILTERS,
  deleteFilterPreset,
  hasActiveFilters,
  loadFilterPresets,
  saveFilterPreset,
  type FilterPreset,
  type FilterState,
} from "@/lib/filters";

const PRIORITY_BADGE: Record<Priority, string> = {
  high: "bg-red-50 text-[#EF4444] dark:bg-red-950 dark:text-[#F87171]",
  medium: "bg-amber-50 text-[#F59E0B] dark:bg-amber-950 dark:text-[#FBBF24]",
  low: "bg-blue-50 text-[#3B82F6] dark:bg-blue-950 dark:text-[#60A5FA]",
};

const RECURRENCE_PATTERNS: RecurrencePattern[] = ["daily", "weekly", "monthly", "yearly"];

const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 120, label: "2h" },
  { value: 1440, label: "1d" },
  { value: 2880, label: "2d" },
  { value: 10080, label: "1w" },
];
const REMINDER_LABEL: Record<number, string> = Object.fromEntries(
  REMINDER_OPTIONS.map((o) => [o.value, o.label])
);

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [todos, setTodos] = useState<ClientTodo[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Todo | null>(null);
  const [templateSeed, setTemplateSeed] = useState<Todo | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [presets, setPresets] = useState<FilterPreset[]>([]);

  useEffect(() => {
    setPresets(loadFilterPresets());
  }, []);

  // Debounce search 300ms — everything else in `filters` applies immediately.
  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput }));
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [newRecurring, setNewRecurring] = useState(false);
  const [newRecurrencePattern, setNewRecurrencePattern] = useState<RecurrencePattern>("daily");
  const [newReminderMinutes, setNewReminderMinutes] = useState<number | "">("");
  const [creating, setCreating] = useState(false);

  const { permission: notificationPermission, requestPermission: enableNotifications } =
    useNotifications(!loading);

  const loadTodos = useCallback(async () => {
    const res = await fetch("/api/todos");
    if (res.ok) {
      const data: Todo[] = await res.json();
      // Preserve each todo's existing `_key` across the refetch — reassigning
      // it from scratch would change the React key for every already-known
      // todo and remount its row, even though nothing about it changed.
      setTodos((prev) => {
        const keyById = new Map(prev.map((t) => [t.id, t._key]));
        return data.map((t) => ({ ...t, _key: keyById.get(t.id) ?? String(t.id) }));
      });
    } else {
      setError("Could not load todos.");
    }
    setLoading(false);
  }, []);

  const loadTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    if (res.ok) setTags(await res.json());
  }, []);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/templates");
    if (res.ok) setTemplates(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUsername(data?.username ?? null));
    loadTodos();
    loadTags();
    loadTemplates();
  }, [loadTodos, loadTags, loadTemplates]);

  async function useTemplate(templateId: number) {
    const res = await fetch(`/api/templates/${templateId}/use`, { method: "POST" });
    if (res.ok) await loadTodos();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch("/api/todos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed.");
      setImportMessage(`Imported ${data.imported} todo(s).`);
      await loadTodos();
      await loadTags();
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : "Import failed.");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    if (newRecurring && !newDueDate) {
      setError("Recurring todos need a due date.");
      return;
    }
    setCreating(true);
    setError(null);

    const due_date = newDueDate ? `${newDueDate}T00:00:00` : null;

    // Optimistic UI: show the todo immediately, roll back on failure.
    const tempId = -Date.now();
    const optimistic: ClientTodo = {
      id: tempId,
      _key: crypto.randomUUID(),
      user_id: 0,
      title,
      completed: false,
      due_date,
      priority: newPriority,
      is_recurring: newRecurring,
      recurrence_pattern: newRecurring ? newRecurrencePattern : null,
      reminder_minutes: newReminderMinutes === "" ? null : newReminderMinutes,
      last_notification_sent: null,
      created_at: new Date().toISOString(),
      updated_at: null,
      subtasks: [],
      tags: [],
    };
    setTodos((prev) => [...prev, optimistic]);
    setNewTitle("");

    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          priority: newPriority,
          due_date,
          is_recurring: newRecurring,
          recurrence_pattern: newRecurring ? newRecurrencePattern : null,
          reminder_minutes: newReminderMinutes === "" ? null : newReminderMinutes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create todo.");
      setTodos((prev) =>
        prev.map((t) => (t.id === tempId ? { ...data, _key: t._key } : t))
      );
      setNewDueDate("");
      setNewPriority("medium");
      setNewRecurring(false);
      setNewReminderMinutes("");
    } catch (err) {
      setTodos((prev) => prev.filter((t) => t.id !== tempId));
      setError(err instanceof Error ? err.message : "Could not create todo.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleComplete(todo: Todo) {
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, completed: !t.completed } : t))
    );
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !todo.completed }),
    });
    if (res.ok) {
      const updated = await res.json();
      // A recurring todo's completion may also create a new instance server-side.
      loadTodos();
      setTodos((prev) =>
        prev.map((t) => (t.id === updated.id ? { ...updated, _key: t._key } : t))
      );
    } else {
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, completed: todo.completed } : t))
      );
    }
  }

  async function performDelete(id: number) {
    const previous = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (!res.ok) setTodos(previous);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await performDelete(deleteTarget.id);
    setDeleteTarget(null);
  }

  async function saveEditedTodo(id: number, fields: Partial<Todo>) {
    const res = await fetch(`/api/todos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const updated = await res.json();
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...updated, _key: t._key } : t))
      );
      setEditingTodo(null);
      return true;
    }
    return false;
  }

  function handleSubtasksChange(todoId: number, subtasks: Todo["subtasks"]) {
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, subtasks } : t)));
  }

  function startSaveAsTemplate(todo: Todo) {
    setTemplateSeed(todo);
    setTemplateManagerOpen(true);
  }

  async function attachTag(todo: Todo, tagId: number) {
    const tag = tags.find((t) => t.id === tagId);
    if (!tag || todo.tags?.some((t) => t.id === tagId)) return;
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, tags: [...(t.tags ?? []), tag] } : t))
    );
    await fetch(`/api/todos/${todo.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tagId }),
    });
  }

  async function detachTag(todo: Todo, tagId: number) {
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todo.id ? { ...t, tags: (t.tags ?? []).filter((tg) => tg.id !== tagId) } : t
      )
    );
    await fetch(`/api/todos/${todo.id}/tags?tag_id=${tagId}`, { method: "DELETE" });
  }

  const filteredTodos = applyFilters(todos, filters);
  const { overdue, pending, completed } = sortTodos(filteredTodos);

  function applyPreset(preset: FilterPreset) {
    setFilters(preset.filters);
    setSearchInput(preset.filters.search);
  }

  function handleSavePreset() {
    const name = window.prompt("Name this filter preset:");
    if (!name || !name.trim()) return;
    setPresets(saveFilterPreset(name.trim(), filters));
  }

  function handleDeletePreset(id: string) {
    setPresets(deleteFilterPreset(id));
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Todos</h1>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          {username && <span>{username}</span>}
          {notificationPermission === "default" && (
            <button onClick={enableNotifications} className="underline">
              Enable Notifications
            </button>
          )}
          {notificationPermission === "denied" && (
            <span title="Notifications blocked in browser settings">Notifications blocked</span>
          )}
          <button onClick={() => setTagManagerOpen(true)} className="underline">
            Manage Tags
          </button>
          <button onClick={() => setTemplateManagerOpen(true)} className="underline">
            Templates
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page route */}
          <a href="/api/todos/export?format=json" className="underline">
            Export JSON
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page route */}
          <a href="/api/todos/export?format=csv" className="underline">
            Export CSV
          </a>
          <label className="cursor-pointer underline">
            Import
            <input
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>
          <Link href="/calendar" className="underline">
            Calendar
          </Link>
          <button onClick={handleLogout} className="underline">
            Sign out
          </button>
        </div>
      </header>

      {importMessage && (
        <p className="mb-4 rounded-md bg-slate-100 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {importMessage}
        </p>
      )}

      {tagManagerOpen && (
        <TagManagerModal
          tags={tags}
          onClose={() => setTagManagerOpen(false)}
          onTagsChange={(next) => {
            setTags(next);
            loadTodos();
          }}
        />
      )}

      {templateManagerOpen && (
        <TemplateManagerModal
          templates={templates}
          onClose={() => {
            setTemplateManagerOpen(false);
            setTemplateSeed(null);
          }}
          onTemplatesChange={setTemplates}
          onUse={useTemplate}
          seed={templateSeed}
        />
      )}

      {editingTodo && (
        <EditTodoModal
          todo={editingTodo}
          onClose={() => setEditingTodo(null)}
          onSave={saveEditedTodo}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          title={deleteTarget.title}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      <form onSubmit={handleCreate} className="mb-8 flex flex-wrap gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a todo…"
          className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800"
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as Priority)}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          type="date"
          value={newDueDate}
          onChange={(e) => setNewDueDate(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={newRecurring}
            disabled={!newDueDate}
            onChange={(e) => setNewRecurring(e.target.checked)}
            className="h-4 w-4"
          />
          Recurring
        </label>
        {newRecurring && (
          <select
            value={newRecurrencePattern}
            onChange={(e) => setNewRecurrencePattern(e.target.value as RecurrencePattern)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            {RECURRENCE_PATTERNS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        <select
          value={newReminderMinutes}
          disabled={!newDueDate}
          onChange={(e) =>
            setNewReminderMinutes(e.target.value === "" ? "" : Number(e.target.value))
          }
          className="rounded-md border border-slate-300 px-2 py-2 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="">No reminder</option>
          {REMINDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              🔔 {o.label} before
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creating || !newTitle.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="mb-6 space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, subtasks, or tags…"
            className="min-w-[160px] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <select
            value={filters.priority}
            onChange={(e) =>
              setFilters((f) => ({ ...f, priority: e.target.value as Priority | "" }))
            }
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">Any priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={filters.tagId}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                tagId: e.target.value === "" ? "" : Number(e.target.value),
              }))
            }
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">Any tag</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <select
            value={filters.completion}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                completion: e.target.value as FilterState["completion"],
              }))
            }
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="all">All</option>
            <option value="incomplete">Incomplete</option>
            <option value="completed">Completed</option>
          </select>
          <input
            type="date"
            value={filters.dueDateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dueDateFrom: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <span className="self-center text-xs text-slate-400">to</span>
          <input
            type="date"
            value={filters.dueDateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dueDateTo: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          {hasActiveFilters(filters) && (
            <button
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setSearchInput("");
              }}
              className="text-xs text-slate-400 underline"
            >
              Clear
            </button>
          )}
          <button onClick={handleSavePreset} className="text-xs text-blue-600 underline">
            Save preset
          </button>
        </div>
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <span
                key={preset.id}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800"
              >
                <button onClick={() => applyPreset(preset)}>{preset.name}</button>
                <button
                  onClick={() => handleDeletePreset(preset.id)}
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`Delete preset ${preset.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-8">
          <TodoSection
            title="Overdue"
            todos={overdue}
            onToggle={toggleComplete}
            onDelete={setDeleteTarget}
            onEdit={setEditingTodo}
            onSaveAsTemplate={startSaveAsTemplate}
            onSubtasksChange={handleSubtasksChange}
            allTags={tags}
            onAttachTag={attachTag}
            onDetachTag={detachTag}
            onFilterByTag={(tagId) => setFilters((f) => ({ ...f, tagId }))}
          />
          <TodoSection
            title="Pending"
            todos={pending}
            onToggle={toggleComplete}
            onDelete={setDeleteTarget}
            onEdit={setEditingTodo}
            onSaveAsTemplate={startSaveAsTemplate}
            onSubtasksChange={handleSubtasksChange}
            allTags={tags}
            onAttachTag={attachTag}
            onDetachTag={detachTag}
            onFilterByTag={(tagId) => setFilters((f) => ({ ...f, tagId }))}
          />
          <TodoSection
            title="Completed"
            todos={completed}
            onToggle={toggleComplete}
            onDelete={setDeleteTarget}
            onEdit={setEditingTodo}
            onSaveAsTemplate={startSaveAsTemplate}
            onSubtasksChange={handleSubtasksChange}
            allTags={tags}
            onAttachTag={attachTag}
            onDetachTag={detachTag}
            onFilterByTag={(tagId) => setFilters((f) => ({ ...f, tagId }))}
          />
        </div>
      )}
    </main>
  );
}

function TodoSection({
  title,
  todos,
  onToggle,
  onDelete,
  onEdit,
  onSaveAsTemplate,
  onSubtasksChange,
  allTags,
  onAttachTag,
  onDetachTag,
  onFilterByTag,
}: {
  title: string;
  todos: ClientTodo[];
  onToggle: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onSaveAsTemplate: (todo: Todo) => void;
  onSubtasksChange: (todoId: number, subtasks: Todo["subtasks"]) => void;
  allTags: Tag[];
  onAttachTag: (todo: Todo, tagId: number) => void;
  onDetachTag: (todo: Todo, tagId: number) => void;
  onFilterByTag: (tagId: number) => void;
}) {
  if (todos.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-500">
        {title} ({todos.length})
      </h2>
      <ul className="space-y-2">
        {todos.map((todo) => (
          <TodoItem
            key={todo._key}
            todo={todo}
            onToggle={onToggle}
            onDelete={onDelete}
            onEdit={onEdit}
            onSaveAsTemplate={onSaveAsTemplate}
            onSubtasksChange={onSubtasksChange}
            allTags={allTags}
            onAttachTag={onAttachTag}
            onDetachTag={onDetachTag}
            onFilterByTag={onFilterByTag}
          />
        ))}
      </ul>
    </section>
  );
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
  onEdit,
  onSaveAsTemplate,
  onSubtasksChange,
  allTags,
  onAttachTag,
  onDetachTag,
  onFilterByTag,
}: {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onSaveAsTemplate: (todo: Todo) => void;
  onSubtasksChange: (todoId: number, subtasks: Todo["subtasks"]) => void;
  allTags: Tag[];
  onAttachTag: (todo: Todo, tagId: number) => void;
  onDetachTag: (todo: Todo, tagId: number) => void;
  onFilterByTag: (tagId: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [newSubtask, setNewSubtask] = useState("");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const attachedTagIds = new Set((todo.tags ?? []).map((t) => t.id));
  const availableTags = allTags.filter((t) => !attachedTagIds.has(t.id));
  const subtasks = todo.subtasks ?? [];
  const total = subtasks.length;
  const done = subtasks.filter((s) => s.completed).length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    const title = newSubtask.trim();
    if (!title) return;
    setNewSubtask("");
    const res = await fetch(`/api/todos/${todo.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const created = await res.json();
      onSubtasksChange(todo.id, [...subtasks, created]);
    }
  }

  async function toggleSubtask(subtaskId: number, completed: boolean) {
    onSubtasksChange(
      todo.id,
      subtasks.map((s) => (s.id === subtaskId ? { ...s, completed } : s))
    );
    await fetch(`/api/subtasks/${subtaskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
  }

  async function deleteSubtask(subtaskId: number) {
    onSubtasksChange(todo.id, subtasks.filter((s) => s.id !== subtaskId));
    await fetch(`/api/subtasks/${subtaskId}`, { method: "DELETE" });
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo)}
          className="h-4 w-4"
        />
        <span className={`flex-1 text-sm ${todo.completed ? "text-slate-400 line-through" : ""}`}>
          {todo.title}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[todo.priority]}`}
        >
          {todo.priority}
        </span>
        {todo.is_recurring && todo.recurrence_pattern && (
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600 dark:bg-purple-950 dark:text-purple-300">
            🔄 {todo.recurrence_pattern}
          </span>
        )}
        {todo.reminder_minutes != null && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            🔔 {REMINDER_LABEL[todo.reminder_minutes] ?? `${todo.reminder_minutes}m`}
          </span>
        )}
        {(todo.tags ?? []).map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: tag.color }}
          >
            <button
              onClick={() => onFilterByTag(tag.id)}
              aria-label={`Filter by tag ${tag.name}`}
              className="hover:underline"
            >
              {tag.name}
            </button>
            <button
              onClick={() => onDetachTag(todo, tag.id)}
              aria-label={`Remove tag ${tag.name}`}
              className="leading-none opacity-80 hover:opacity-100"
            >
              ✕
            </button>
          </span>
        ))}
        {availableTags.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setTagPickerOpen((v) => !v)}
              className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-slate-400 dark:border-slate-600"
            >
              + tag
            </button>
            {tagPickerOpen && (
              <div className="absolute right-0 z-10 mt-1 w-36 rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      onAttachTag(todo, tag.id);
                      setTagPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {todo.due_date && (
          <span className="text-xs text-slate-400">{todo.due_date.slice(0, 10)}</span>
        )}
        {total > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500"
          >
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <span
                className={`block h-full rounded-full ${progress === 100 ? "bg-green-500" : "bg-blue-500"}`}
                style={{ width: `${progress}%` }}
              />
            </span>
            {done}/{total} subtasks
          </button>
        )}
        <button
          onClick={() => onEdit(todo)}
          className="text-xs text-slate-400 hover:text-slate-600"
          aria-label={`Edit ${todo.title}`}
        >
          Edit
        </button>
        <button
          onClick={() => onSaveAsTemplate(todo)}
          className="text-xs text-slate-400 hover:text-slate-600"
          aria-label={`Save ${todo.title} as template`}
        >
          Save as template
        </button>
        <button
          onClick={() => onDelete(todo)}
          className="text-xs text-slate-400 hover:text-red-600"
          aria-label={`Delete ${todo.title}`}
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pl-7 pt-2 dark:border-slate-800">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.completed}
                onChange={() => toggleSubtask(s.id, !s.completed)}
                className="h-3.5 w-3.5"
              />
              <span className={`flex-1 ${s.completed ? "text-slate-400 line-through" : ""}`}>
                {s.title}
              </span>
              <button
                onClick={() => deleteSubtask(s.id)}
                className="text-xs text-slate-400 hover:text-red-600"
                aria-label={`Delete subtask ${s.title}`}
              >
                ✕
              </button>
            </div>
          ))}
          <form onSubmit={addSubtask} className="flex gap-2">
            <input
              type="text"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Add subtask…"
              className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="submit"
              disabled={!newSubtask.trim()}
              className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium disabled:opacity-50 dark:bg-slate-800"
            >
              Add
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

const TAG_COLOR_PRESETS = ["#3B82F6", "#EF4444", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899"];

function TagManagerModal({
  tags,
  onClose,
  onTagsChange,
}: {
  tags: Tag[];
  onClose: () => void;
  onTagsChange: (tags: Tag[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLOR_PRESETS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/tags");
    if (res.ok) onTagsChange(await res.json());
  }

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: newColor }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not create tag.");
      return;
    }
    setNewName("");
    await refresh();
  }

  function startEdit(tag: Tag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  async function saveEdit(id: number) {
    const name = editName.trim();
    if (!name) return;
    setError(null);
    const res = await fetch(`/api/tags/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: editColor }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not update tag.");
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function removeTag(id: number) {
    await fetch(`/api/tags/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div
      role="dialog"
      aria-label="Manage Tags"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Manage Tags</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <ul className="mb-4 max-h-64 space-y-1 overflow-y-auto">
          {tags.map((tag) =>
            editingId === tag.id ? (
              <li key={tag.id} className="flex items-center gap-2">
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-7 w-7 rounded"
                />
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
                <button
                  onClick={() => saveEdit(tag.id)}
                  className="text-xs font-medium text-blue-600"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-slate-400"
                >
                  Cancel
                </button>
              </li>
            ) : (
              <li key={tag.id} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="flex-1 text-sm">{tag.name}</span>
                <button
                  onClick={() => startEdit(tag)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => removeTag(tag.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </li>
            )
          )}
          {tags.length === 0 && (
            <li className="text-sm text-slate-400">No tags yet.</li>
          )}
        </ul>

        <form onSubmit={createTag} className="flex items-center gap-2">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-8 w-8 rounded"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New tag name…"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
}

function TemplateManagerModal({
  templates,
  onClose,
  onTemplatesChange,
  onUse,
  seed,
}: {
  templates: Template[];
  onClose: () => void;
  onTemplatesChange: (templates: Template[]) => void;
  onUse: (templateId: number) => void;
  seed?: Todo | null;
}) {
  // Lazy initializers, not an effect: this modal is conditionally rendered
  // by its parent (`{templateManagerOpen && <TemplateManagerModal .../>}`),
  // so a fresh `seed` always arrives via a fresh mount, never as a prop
  // change on an already-mounted instance — nothing needs to "react" to it.
  const [name, setName] = useState(() => (seed ? `Copy of ${seed.title}` : ""));
  const [titleTemplate, setTitleTemplate] = useState(() => seed?.title ?? "");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<Priority>(() => seed?.priority ?? "medium");
  const [recurring, setRecurring] = useState(() => seed?.is_recurring ?? false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>(
    () => seed?.recurrence_pattern ?? "daily"
  );
  const [reminderMinutes, setReminderMinutes] = useState<number | "">(
    () => seed?.reminder_minutes ?? ""
  );
  const [dueDateOffset, setDueDateOffset] = useState<number | "">("");
  const [subtasksText, setSubtasksText] = useState(() =>
    (seed?.subtasks ?? []).map((s) => s.title).join("\n")
  );
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");

  const categories = Array.from(
    new Set(templates.map((t) => t.category).filter((c): c is string => !!c))
  );
  const visibleTemplates = categoryFilter
    ? templates.filter((t) => t.category === categoryFilter)
    : templates;

  async function refresh() {
    const res = await fetch("/api/templates");
    if (res.ok) onTemplatesChange(await res.json());
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !titleTemplate.trim()) return;
    setCreating(true);
    setError(null);
    const subtasks = subtasksText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        title_template: titleTemplate.trim(),
        category: category.trim() || null,
        priority,
        is_recurring: recurring,
        recurrence_pattern: recurring ? recurrencePattern : null,
        reminder_minutes: reminderMinutes === "" ? null : reminderMinutes,
        due_date_offset_minutes: dueDateOffset === "" ? null : dueDateOffset,
        subtasks,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error || "Could not create template.");
      return;
    }
    setName("");
    setTitleTemplate("");
    setCategory("");
    setRecurring(false);
    setReminderMinutes("");
    setDueDateOffset("");
    setSubtasksText("");
    await refresh();
  }

  async function removeTemplate(id: number) {
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div
      role="dialog"
      aria-label="Templates"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Templates</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="mb-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <ul className="mb-4 space-y-2">
          {visibleTemplates.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-slate-400">
                  {t.title_template}
                  {t.category ? ` · ${t.category}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUse(t.id)}
                  className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white"
                >
                  Use
                </button>
                <button
                  onClick={() => removeTemplate(t.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {visibleTemplates.length === 0 && (
            <li className="text-sm text-slate-400">No templates yet.</li>
          )}
        </ul>

        <form onSubmit={createTemplate} className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name…"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            type="text"
            value={titleTemplate}
            onChange={(e) => setTitleTemplate(e.target.value)}
            placeholder="Todo title…"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)…"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={dueDateOffset}
              onChange={(e) =>
                setDueDateOffset(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">No due date</option>
              <option value={60}>Due in 1 hour</option>
              <option value={1440}>Due in 1 day</option>
              <option value={10080}>Due in 1 week</option>
            </select>
            <select
              value={reminderMinutes}
              disabled={dueDateOffset === ""}
              onChange={(e) =>
                setReminderMinutes(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">No reminder</option>
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  🔔 {o.label} before
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-4 w-4"
            />
            Recurring
            {recurring && (
              <select
                value={recurrencePattern}
                onChange={(e) => setRecurrencePattern(e.target.value as RecurrencePattern)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                {RECURRENCE_PATTERNS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
          </label>
          <textarea
            value={subtasksText}
            onChange={(e) => setSubtasksText(e.target.value)}
            placeholder="Subtasks, one per line…"
            rows={3}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="submit"
            disabled={creating || !name.trim() || !titleTemplate.trim()}
            className="w-full rounded-md bg-blue-600 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Save template
          </button>
        </form>
      </div>
    </div>
  );
}

function EditTodoModal({
  todo,
  onClose,
  onSave,
}: {
  todo: Todo;
  onClose: () => void;
  onSave: (id: number, fields: Partial<Todo>) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(todo.title);
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [dueDate, setDueDate] = useState(todo.due_date ? todo.due_date.slice(0, 10) : "");
  const [recurring, setRecurring] = useState(todo.is_recurring);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>(
    todo.recurrence_pattern ?? "daily"
  );
  const [reminderMinutes, setReminderMinutes] = useState<number | "">(
    todo.reminder_minutes ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (recurring && !dueDate) {
      setError("Recurring todos need a due date.");
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await onSave(todo.id, {
      title: title.trim(),
      priority,
      due_date: dueDate ? `${dueDate}T00:00:00` : null,
      is_recurring: recurring,
      recurrence_pattern: recurring ? recurrencePattern : null,
      reminder_minutes: reminderMinutes === "" ? null : reminderMinutes,
    });
    setSaving(false);
    if (!ok) setError("Could not save changes.");
  }

  return (
    <div role="dialog" aria-label="Edit todo" className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit todo</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <form onSubmit={handleSave} className="space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={recurring}
              disabled={!dueDate}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-4 w-4"
            />
            Recurring
            {recurring && (
              <select
                value={recurrencePattern}
                onChange={(e) => setRecurrencePattern(e.target.value as RecurrencePattern)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                {RECURRENCE_PATTERNS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
          </label>
          <select
            value={reminderMinutes}
            disabled={!dueDate}
            onChange={(e) =>
              setReminderMinutes(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">No reminder</option>
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                🔔 {o.label} before
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="w-full rounded-md bg-blue-600 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Save changes
          </button>
        </form>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-label="Confirm delete" className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h2 className="mb-2 text-lg font-semibold">Delete todo?</h2>
        <p className="mb-4 text-sm text-slate-500">
          &ldquo;{title}&rdquo; and its subtasks will be permanently deleted.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
