import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { todoDB, tagDB, type Priority } from "@/lib/db";
import { calculateNextDueDate } from "@/lib/recurrence";

const VALID_PRIORITIES: Priority[] = ["high", "medium", "low"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const todo = todoDB.getById(Number(id), session.userId);
  if (!todo) {
    return NextResponse.json({ error: "Todo not found." }, { status: 404 });
  }
  return NextResponse.json(todo);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const todoId = Number(id);

  const existing = todoDB.getById(todoId, session.userId);
  if (!existing) {
    return NextResponse.json({ error: "Todo not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fields: Parameters<typeof todoDB.update>[2] = {};

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }
    fields.title = title;
  }
  if (body.completed !== undefined) fields.completed = !!body.completed;
  if (body.due_date !== undefined) fields.due_date = body.due_date;
  if (body.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
    }
    fields.priority = body.priority;
  }
  if (body.is_recurring !== undefined) fields.is_recurring = !!body.is_recurring;
  if (body.recurrence_pattern !== undefined) fields.recurrence_pattern = body.recurrence_pattern;
  if (body.reminder_minutes !== undefined) fields.reminder_minutes = body.reminder_minutes;

  const updated = todoDB.update(todoId, session.userId, fields);

  // Completing a recurring todo spawns its next instance, inheriting
  // priority/tags/reminder/pattern and advancing due_date by the pattern.
  if (
    fields.completed === true &&
    !existing.completed &&
    existing.is_recurring &&
    existing.recurrence_pattern &&
    existing.due_date
  ) {
    const nextDueDate = calculateNextDueDate(existing.due_date, existing.recurrence_pattern);
    const nextTodo = todoDB.create({
      user_id: session.userId,
      title: existing.title,
      due_date: nextDueDate,
      priority: existing.priority,
      is_recurring: true,
      recurrence_pattern: existing.recurrence_pattern,
      reminder_minutes: existing.reminder_minutes,
    });
    for (const tag of existing.tags ?? []) {
      tagDB.attach(nextTodo.id, tag.id);
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const deleted = todoDB.delete(Number(id), session.userId);
  if (!deleted) {
    return NextResponse.json({ error: "Todo not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
