import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { templateDB } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const templateId = Number(id);

  if (!templateDB.getById(templateId, session.userId)) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fields: Parameters<typeof templateDB.update>[2] = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    fields.name = name;
  }
  if (body.title_template !== undefined) {
    const t = typeof body.title_template === "string" ? body.title_template.trim() : "";
    if (!t) return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    fields.title_template = t;
  }
  if (body.description !== undefined) fields.description = body.description;
  if (body.category !== undefined) fields.category = body.category;
  if (body.priority !== undefined) fields.priority = body.priority;
  if (body.is_recurring !== undefined) fields.is_recurring = !!body.is_recurring;
  if (body.recurrence_pattern !== undefined) fields.recurrence_pattern = body.recurrence_pattern;
  if (body.reminder_minutes !== undefined) fields.reminder_minutes = body.reminder_minutes;
  if (body.due_date_offset_minutes !== undefined)
    fields.due_date_offset_minutes = body.due_date_offset_minutes;
  if (Array.isArray(body.subtasks)) {
    const titles = body.subtasks.filter((t: unknown) => typeof t === "string" && t.trim());
    fields.subtasks_json =
      titles.length > 0
        ? JSON.stringify(titles.map((title: string, position: number) => ({ title, position })))
        : null;
  }

  const updated = templateDB.update(templateId, session.userId, fields);
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
  // Deleting a template never touches todos already created from it — no FK exists.
  const deleted = templateDB.delete(Number(id), session.userId);
  if (!deleted) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
