import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { todoDB, tagDB } from "@/lib/db";

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

  if (!todoDB.getById(todoId, session.userId)) {
    return NextResponse.json({ error: "Todo not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const tagId = Number(body?.tag_id);
  if (!tagId || !tagDB.getById(tagId, session.userId)) {
    return NextResponse.json({ error: "Tag not found." }, { status: 404 });
  }

  tagDB.attach(todoId, tagId); // idempotent — no-op if already attached
  return NextResponse.json(tagDB.listByTodo(todoId));
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
  const todoId = Number(id);

  if (!todoDB.getById(todoId, session.userId)) {
    return NextResponse.json({ error: "Todo not found." }, { status: 404 });
  }

  const tagId = Number(request.nextUrl.searchParams.get("tag_id"));
  if (!tagId) {
    return NextResponse.json({ error: "tag_id is required." }, { status: 400 });
  }

  tagDB.detach(todoId, tagId); // idempotent — no-op if not attached
  return NextResponse.json(tagDB.listByTodo(todoId));
}
