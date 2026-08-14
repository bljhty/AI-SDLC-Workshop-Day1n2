import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { subtaskDB } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const subtaskId = Number(id);

  if (!subtaskDB.belongsToUser(subtaskId, session.userId)) {
    return NextResponse.json({ error: "Subtask not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fields: Parameters<typeof subtaskDB.update>[1] = {};
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Subtask title cannot be empty." }, { status: 400 });
    }
    fields.title = title;
  }
  if (body.completed !== undefined) fields.completed = !!body.completed;

  const updated = subtaskDB.update(subtaskId, fields);
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
  const subtaskId = Number(id);

  if (!subtaskDB.belongsToUser(subtaskId, session.userId)) {
    return NextResponse.json({ error: "Subtask not found." }, { status: 404 });
  }

  subtaskDB.delete(subtaskId);
  return NextResponse.json({ success: true });
}
