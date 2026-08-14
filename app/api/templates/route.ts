import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { templateDB, type Priority, type RecurrencePattern } from "@/lib/db";

const VALID_PRIORITIES: Priority[] = ["high", "medium", "low"];
const VALID_RECURRENCE_PATTERNS: RecurrencePattern[] = ["daily", "weekly", "monthly", "yearly"];
const VALID_REMINDER_MINUTES = [15, 30, 60, 120, 1440, 2880, 10080];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(templateDB.listByUser(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const title_template = typeof body?.title_template === "string" ? body.title_template.trim() : "";
  if (!name || !title_template) {
    return NextResponse.json(
      { error: "Template name and title are required." },
      { status: 400 }
    );
  }

  const priority: Priority = VALID_PRIORITIES.includes(body?.priority) ? body.priority : "medium";

  const is_recurring = !!body?.is_recurring;
  let recurrence_pattern: RecurrencePattern | null = null;
  if (is_recurring) {
    if (!VALID_RECURRENCE_PATTERNS.includes(body?.recurrence_pattern)) {
      return NextResponse.json({ error: "Invalid recurrence pattern." }, { status: 400 });
    }
    recurrence_pattern = body.recurrence_pattern;
  }

  let reminder_minutes: number | null = null;
  if (body?.reminder_minutes != null) {
    if (!VALID_REMINDER_MINUTES.includes(body.reminder_minutes)) {
      return NextResponse.json({ error: "Invalid reminder interval." }, { status: 400 });
    }
    reminder_minutes = body.reminder_minutes;
  }

  let due_date_offset_minutes: number | null = null;
  if (body?.due_date_offset_minutes != null) {
    const n = Number(body.due_date_offset_minutes);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: "Invalid due date offset." }, { status: 400 });
    }
    due_date_offset_minutes = n;
  }

  let subtasks_json: string | null = null;
  if (Array.isArray(body?.subtasks) && body.subtasks.length > 0) {
    const titles = body.subtasks
      .filter((t: unknown) => typeof t === "string" && t.trim())
      .map((t: string) => t.trim());
    if (titles.length > 0) {
      subtasks_json = JSON.stringify(
        titles.map((title: string, position: number) => ({ title, position }))
      );
    }
  }

  const template = templateDB.create({
    user_id: session.userId,
    name,
    description: typeof body?.description === "string" ? body.description.trim() || null : null,
    category: typeof body?.category === "string" ? body.category.trim() || null : null,
    title_template,
    priority,
    is_recurring,
    recurrence_pattern,
    reminder_minutes,
    due_date_offset_minutes,
    subtasks_json,
  });

  return NextResponse.json(template, { status: 201 });
}
