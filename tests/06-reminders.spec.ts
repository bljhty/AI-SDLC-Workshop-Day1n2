import { test, expect } from "@playwright/test";
import { createTodo, register, todoItem, uniqueName } from "./helpers";
import { formatSingaporeDate, getSingaporeNow } from "../lib/timezone";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe("Reminders & notifications", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("remind-user"));
  });

  test("shows the reminder badge", async ({ page }) => {
    const title = uniqueName("Call dentist");
    await createTodo(page, title, { dueDate: daysFromNow(2), reminderMinutes: 60 });
    await expect(todoItem(page, title).getByText("🔔 1h")).toBeVisible();
  });

  test("reminder select is disabled without a due date", async ({ page }) => {
    const form = page.locator("form").first();
    await expect(form.locator("select").last()).toBeDisabled();
  });

  test("notifications/check returns a due reminder once, then dedupes", async ({ page }) => {
    const dueDate = formatSingaporeDate(new Date(getSingaporeNow().getTime() + 10 * 60_000));
    const createRes = await page.request.post("/api/todos", {
      data: { title: uniqueName("Due soon"), due_date: dueDate, reminder_minutes: 15 },
    });
    expect(createRes.ok()).toBe(true);

    const firstCheck = await page.request.get("/api/notifications/check");
    const firstDue = await firstCheck.json();
    expect(firstDue.length).toBeGreaterThan(0);

    const secondCheck = await page.request.get("/api/notifications/check");
    const secondDue = await secondCheck.json();
    expect(secondDue.length).toBe(0);
  });
});
