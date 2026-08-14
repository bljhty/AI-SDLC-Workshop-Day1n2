import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { todoDB } from "@/lib/db";
import { addMinutesToSingaporeDate, formatSingaporeDate, getSingaporeNow } from "@/lib/timezone";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const now = formatSingaporeDate(getSingaporeNow());
  const todos = todoDB.listByUser(session.userId);

  const due = todos.filter((todo) => {
    if (todo.completed || !todo.due_date || todo.reminder_minutes == null) return false;
    const reminderTime = addMinutesToSingaporeDate(todo.due_date, -todo.reminder_minutes);
    if (now < reminderTime || now > todo.due_date) return false;
    // Already notified for this window — don't resend on every poll.
    if (todo.last_notification_sent && todo.last_notification_sent >= reminderTime) return false;
    return true;
  });

  for (const todo of due) {
    todoDB.update(todo.id, session.userId, { last_notification_sent: now });
  }

  return NextResponse.json(due);
}
