import { test, expect } from "@playwright/test";
import { addSubtask, createTodo, register, todoItem, uniqueName } from "./helpers";

test.describe("Subtasks & progress", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("subtask-user"));
  });

  test("progress bar is hidden with zero subtasks", async ({ page }) => {
    const title = uniqueName("No subtasks yet");
    await createTodo(page, title);
    await expect(todoItem(page, title).getByText(/\/\d+ subtasks/)).toHaveCount(0);
  });

  test("adding subtasks shows X/Y progress, blue while incomplete", async ({ page }) => {
    const title = uniqueName("Plan trip");
    await createTodo(page, title);
    await addSubtask(page, title, "Book flights");
    await addSubtask(page, title, "Book hotel");

    await expect(todoItem(page, title).getByText("0/2 subtasks")).toBeVisible();

    const item = todoItem(page, title);
    await item.getByText("Book flights").locator("..").locator('input[type="checkbox"]').check();
    await expect(item.getByText("1/2 subtasks")).toBeVisible();
    const bar = item.locator(".bg-blue-500");
    await expect(bar).toBeVisible();
  });

  test("progress bar turns green at exactly 100%", async ({ page }) => {
    const title = uniqueName("Single subtask");
    await createTodo(page, title);
    await addSubtask(page, title, "Only thing");

    const item = todoItem(page, title);
    await item.getByText("Only thing").locator("..").locator('input[type="checkbox"]').check();
    await expect(item.getByText("1/1 subtasks")).toBeVisible();
    await expect(item.locator(".bg-green-500")).toBeVisible();
  });

  test("deleting a subtask does not renumber remaining ones", async ({ page }) => {
    const title = uniqueName("Three subtasks");
    await createTodo(page, title);
    await addSubtask(page, title, "First");
    await addSubtask(page, title, "Second");
    await addSubtask(page, title, "Third");

    const item = todoItem(page, title);
    await item.getByText("First").locator("..").getByRole("button", { name: "Delete subtask First" }).click();
    await expect(item.getByText("Second")).toBeVisible();
    await expect(item.getByText("Third")).toBeVisible();
    await expect(item.getByText("0/2 subtasks")).toBeVisible();
  });
});
