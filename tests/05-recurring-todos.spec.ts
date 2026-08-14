import { test, expect } from "@playwright/test";
import { createTodo, register, todoItem, uniqueName } from "./helpers";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe("Recurring todos", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("recur-user"));
  });

  test("shows the recurrence badge", async ({ page }) => {
    const title = uniqueName("Water plants");
    await createTodo(page, title, {
      dueDate: daysFromNow(2),
      recurring: true,
      recurrencePattern: "daily",
    });
    await expect(todoItem(page, title).getByText("🔄 daily")).toBeVisible();
  });

  test("completing spawns the next instance with an advanced due date", async ({ page }) => {
    const title = uniqueName("Take out trash");
    await createTodo(page, title, {
      dueDate: daysFromNow(2),
      recurring: true,
      recurrencePattern: "daily",
    });

    await todoItem(page, title).first().locator('input[type="checkbox"]').first().check();

    // Original (now completed) + freshly spawned next instance.
    await expect(todoItem(page, title)).toHaveCount(2);

    const res = await page.request.get("/api/todos");
    const todos: { title: string; completed: boolean; due_date: string }[] = await res.json();
    const matching = todos.filter((t) => t.title === title);
    expect(matching).toHaveLength(2);
    const completedOne = matching.find((t) => t.completed);
    const nextOne = matching.find((t) => !t.completed);
    expect(completedOne).toBeTruthy();
    expect(nextOne).toBeTruthy();
    expect(nextOne!.due_date > completedOne!.due_date).toBe(true);
  });

  test("rejects a recurring todo without a due date", async ({ page }) => {
    const res = await page.request.post("/api/todos", {
      data: { title: "No due date recurring", is_recurring: true, recurrence_pattern: "daily" },
    });
    expect(res.status()).toBe(400);
  });
});
