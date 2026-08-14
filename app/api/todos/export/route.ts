import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { todoDB } from "@/lib/db";
import { formatSingaporeDateOnly, getSingaporeNow } from "@/lib/timezone";

function csvEscape(value: string | number | boolean | null): string {
  const s = value === null ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const todos = todoDB.listByUser(session.userId);
  const dateStamp = formatSingaporeDateOnly(getSingaporeNow());

  if (format === "csv") {
    const header = ["ID", "Title", "Completed", "Due Date", "Priority", "Recurring", "Pattern", "Reminder"];
    const rows = todos.map((t) =>
      [
        t.id,
        t.title,
        t.completed ? "Yes" : "No",
        t.due_date ?? "",
        t.priority,
        t.is_recurring ? "Yes" : "No",
        t.recurrence_pattern ?? "",
        t.reminder_minutes ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="todos-${dateStamp}.csv"`,
      },
    });
  }

  const envelope = {
    version: 1,
    exported_at: getSingaporeNow().toISOString(),
    todos: todos.map((t) => ({
      title: t.title,
      completed: t.completed,
      due_date: t.due_date,
      priority: t.priority,
      is_recurring: t.is_recurring,
      recurrence_pattern: t.recurrence_pattern,
      reminder_minutes: t.reminder_minutes,
      subtasks: (t.subtasks ?? []).map((s) => ({ title: s.title, completed: s.completed })),
      tags: (t.tags ?? []).map((tag) => ({ name: tag.name, color: tag.color })),
    })),
  };

  return new NextResponse(JSON.stringify(envelope, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="todos-${dateStamp}.json"`,
    },
  });
}
