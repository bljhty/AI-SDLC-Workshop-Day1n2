import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { todoDB, subtaskDB } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const todoId = Number(id);

  const todo = todoDB.getById(todoId, session.userId);
  if (!todo) {
    return NextResponse.json({ error: "Todo not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Subtask title is required." }, { status: 400 });
  }

  const subtask = subtaskDB.create(todoId, title);
  return NextResponse.json(subtask, { status: 201 });
}
