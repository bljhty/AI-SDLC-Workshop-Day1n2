import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { todoDB, type Priority, type RecurrencePattern } from "@/lib/db";
import { getSingaporeNow, parseSingaporeDate } from "@/lib/timezone";

const VALID_PRIORITIES: Priority[] = ["high", "medium", "low"];
const VALID_RECURRENCE_PATTERNS: RecurrencePattern[] = ["daily", "weekly", "monthly", "yearly"];
export const VALID_REMINDER_MINUTES = [15, 30, 60, 120, 1440, 2880, 10080];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const todos = todoDB.listByUser(session.userId);
  return NextResponse.json(todos);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const priority: Priority = VALID_PRIORITIES.includes(body?.priority) ? body.priority : "medium";

  let due_date: string | null = null;
  if (body?.due_date != null) {
    if (typeof body.due_date !== "string") {
      return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
    }
    const minAllowed = new Date(getSingaporeNow().getTime() + 60_000);
    if (parseSingaporeDate(body.due_date).getTime() < minAllowed.getTime()) {
      return NextResponse.json(
        { error: "Due date must be at least 1 minute in the future." },
        { status: 400 }
      );
    }
    due_date = body.due_date;
  }

  const is_recurring = !!body?.is_recurring;
  let recurrence_pattern: RecurrencePattern | null = null;
  if (is_recurring) {
    if (!due_date) {
      return NextResponse.json(
        { error: "Recurring todos require a due date." },
        { status: 400 }
      );
    }
    if (!VALID_RECURRENCE_PATTERNS.includes(body?.recurrence_pattern)) {
      return NextResponse.json(
        { error: "Invalid recurrence pattern." },
        { status: 400 }
      );
    }
    recurrence_pattern = body.recurrence_pattern;
  }

  let reminder_minutes: number | null = null;
  if (body?.reminder_minutes != null) {
    if (!VALID_REMINDER_MINUTES.includes(body.reminder_minutes)) {
      return NextResponse.json({ error: "Invalid reminder interval." }, { status: 400 });
    }
    if (!due_date) {
      return NextResponse.json(
        { error: "Reminders require a due date." },
        { status: 400 }
      );
    }
    reminder_minutes = body.reminder_minutes;
  }

  const todo = todoDB.create({
    user_id: session.userId,
    title,
    due_date,
    priority,
    is_recurring,
    recurrence_pattern,
    reminder_minutes,
  });

  return NextResponse.json(todo, { status: 201 });
}
