import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { templateDB, todoDB, subtaskDB } from "@/lib/db";
import { addMinutesFromSingaporeNow } from "@/lib/timezone";

interface TemplateSubtask {
  title: string;
  position: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const template = templateDB.getById(Number(id), session.userId);
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  // due_date and tags are deliberately excluded from templates; subtasks ARE captured.
  const due_date =
    template.due_date_offset_minutes == null
      ? null
      : addMinutesFromSingaporeNow(template.due_date_offset_minutes);

  const todo = todoDB.create({
    user_id: session.userId,
    title: template.title_template,
    due_date,
    priority: template.priority,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
  });

  if (template.subtasks_json) {
    let subtasks: TemplateSubtask[] = [];
    try {
      subtasks = JSON.parse(template.subtasks_json);
    } catch {
      subtasks = [];
    }
    for (const s of subtasks.sort((a, b) => a.position - b.position)) {
      subtaskDB.create(todo.id, s.title);
    }
  }

  const created = todoDB.getById(todo.id, session.userId);
  return NextResponse.json(created, { status: 201 });
}
