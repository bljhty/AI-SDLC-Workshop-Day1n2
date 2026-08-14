import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db, todoDB, subtaskDB, tagDB } from "@/lib/db";

const importTagSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

const importSubtaskSchema = z.object({
  title: z.string().min(1),
  completed: z.boolean().optional(),
});

const importTodoSchema = z.object({
  title: z.string().min(1),
  completed: z.boolean().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(["daily", "weekly", "monthly", "yearly"]).nullable().optional(),
  reminder_minutes: z.number().nullable().optional(),
  subtasks: z.array(importSubtaskSchema).optional(),
  tags: z.array(importTagSchema).optional(),
});

const importEnvelopeSchema = z.object({
  version: z.number(),
  exported_at: z.string().optional(),
  todos: z.array(importTodoSchema),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = importEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid import file.", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const userId = session.userId;
  // Case-insensitive tag name -> id, reused across the whole import so two
  // todos that both reference "Work" resolve to the same tag.
  const tagCache = new Map<string, number>();

  function resolveTag(name: string, color?: string): number {
    const key = name.toLowerCase();
    const cached = tagCache.get(key);
    if (cached !== undefined) return cached;
    const existing = tagDB.getByName(userId, name);
    const tag = existing ?? tagDB.create(userId, name, color);
    tagCache.set(key, tag.id);
    return tag.id;
  }

  // Import is all-or-nothing: any failure (a bad row, a DB error) rolls the
  // whole batch back rather than leaving a partially-imported set of todos.
  const runImport = db.transaction((todos: z.infer<typeof importEnvelopeSchema>["todos"]) => {
    let imported = 0;
    for (const item of todos) {
      const todo = todoDB.create({
        user_id: userId,
        title: item.title,
        due_date: item.due_date ?? null,
        priority: item.priority ?? "medium",
        is_recurring: item.is_recurring ?? false,
        recurrence_pattern: item.recurrence_pattern ?? null,
        reminder_minutes: item.reminder_minutes ?? null,
      });
      if (item.completed) {
        todoDB.update(todo.id, userId, { completed: true });
      }
      for (const s of item.subtasks ?? []) {
        const created = subtaskDB.create(todo.id, s.title);
        if (s.completed) subtaskDB.update(created.id, { completed: true });
      }
      for (const t of item.tags ?? []) {
        const tagId = resolveTag(t.name, t.color);
        tagDB.attach(todo.id, tagId);
      }
      imported++;
    }
    return imported;
  });

  const imported = runImport(parsed.data.todos);

  return NextResponse.json({ imported });
}
