import { test, expect } from "@playwright/test";
import { createTodo, register, todoItem, uniqueName } from "./helpers";

test.describe("Priority", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("priority-user"));
  });

  test("defaults to medium priority", async ({ page }) => {
    const title = uniqueName("Default prio task");
    await createTodo(page, title);
    await expect(todoItem(page, title).getByText("medium", { exact: true })).toBeVisible();
  });

  test("shows the chosen priority badge", async ({ page }) => {
    const title = uniqueName("Low prio task");
    await createTodo(page, title, { priority: "low" });
    await expect(todoItem(page, title).getByText("low", { exact: true })).toBeVisible();
  });
});
