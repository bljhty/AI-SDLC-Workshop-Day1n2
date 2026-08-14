import { test, expect } from "@playwright/test";
import { createTodo, register, todoItem, uniqueName } from "./helpers";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function section(page: import("@playwright/test").Page, title: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^${title}`) }) });
}

test.describe("Todo CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("todo-user"));
  });

  test("creates a todo and shows it in Pending", async ({ page }) => {
    const title = uniqueName("Buy milk");
    await createTodo(page, title, { priority: "high", dueDate: daysFromNow(2) });
    await expect(section(page, "Pending").locator("li").filter({ hasText: title })).toBeVisible();
    await expect(todoItem(page, title).getByText("high", { exact: true })).toBeVisible();
  });

  test("toggling complete moves the todo to Completed", async ({ page }) => {
    const title = uniqueName("Finish report");
    await createTodo(page, title);
    await todoItem(page, title).locator('input[type="checkbox"]').first().check();
    await expect(section(page, "Completed").locator("li").filter({ hasText: title })).toBeVisible();
  });

  test("deleting a todo requires confirmation", async ({ page }) => {
    const title = uniqueName("Throwaway task");
    await createTodo(page, title);
    await todoItem(page, title).getByRole("button", { name: `Delete ${title}` }).click();

    const dialog = page.getByRole("dialog", { name: "Confirm delete" });
    await expect(dialog).toBeVisible();
    await expect(todoItem(page, title)).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(todoItem(page, title)).toBeVisible();

    await todoItem(page, title).getByRole("button", { name: `Delete ${title}` }).click();
    await page.getByRole("dialog", { name: "Confirm delete" }).getByRole("button", { name: "Delete" }).click();
    await expect(todoItem(page, title)).toHaveCount(0);
  });

  test("sorts Pending by priority then due date", async ({ page }) => {
    const low = uniqueName("Low prio");
    const high = uniqueName("High prio");
    await createTodo(page, low, { priority: "low", dueDate: daysFromNow(2) });
    await createTodo(page, high, { priority: "high", dueDate: daysFromNow(3) });

    const items = section(page, "Pending").locator("li");
    const texts = await items.allTextContents();
    const highIndex = texts.findIndex((t) => t.includes(high));
    const lowIndex = texts.findIndex((t) => t.includes(low));
    expect(highIndex).toBeLessThan(lowIndex);
  });

  test("a todo with a past due date shows under Overdue", async ({ page }) => {
    const title = uniqueName("Overdue task");
    await createTodo(page, title, { dueDate: daysFromNow(2) });

    const res = await page.request.get("/api/todos");
    const todos = await res.json();
    const created = todos.find((t: { title: string }) => t.title === title);
    await page.request.put(`/api/todos/${created.id}`, {
      data: { due_date: "2000-01-01T00:00:00" },
    });

    await page.reload();
    await expect(section(page, "Overdue").locator("li").filter({ hasText: title })).toBeVisible();
  });
});
