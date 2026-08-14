import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { tagDB } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(tagDB.listByUser(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Tag name is required." }, { status: 400 });
  }
  if (tagDB.getByName(session.userId, name)) {
    return NextResponse.json({ error: "A tag with that name already exists." }, { status: 409 });
  }

  const color = typeof body?.color === "string" && body.color ? body.color : undefined;
  const tag = tagDB.create(session.userId, name, color);
  return NextResponse.json(tag, { status: 201 });
}
