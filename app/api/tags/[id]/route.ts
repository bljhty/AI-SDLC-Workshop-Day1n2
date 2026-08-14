import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { tagDB } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const tagId = Number(id);

  if (!tagDB.getById(tagId, session.userId)) {
    return NextResponse.json({ error: "Tag not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const fields: Parameters<typeof tagDB.update>[2] = {};
  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Tag name cannot be empty." }, { status: 400 });
    }
    const existing = tagDB.getByName(session.userId, name);
    if (existing && existing.id !== tagId) {
      return NextResponse.json({ error: "A tag with that name already exists." }, { status: 409 });
    }
    fields.name = name;
  }
  if (body?.color !== undefined) fields.color = body.color;

  const updated = tagDB.update(tagId, session.userId, fields);
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
  const deleted = tagDB.delete(Number(id), session.userId);
  if (!deleted) {
    return NextResponse.json({ error: "Tag not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
