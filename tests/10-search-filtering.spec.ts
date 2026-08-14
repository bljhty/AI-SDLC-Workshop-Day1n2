import { test, expect } from "@playwright/test";
import { addSubtask, createTodo, register, todoItem, uniqueName } from "./helpers";

test.describe("Search & filtering", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("filter-user"));
  });

  test("search matches todo title, debounced", async ({ page }) => {
    const apple = uniqueName("Buy apples");
    const banana = uniqueName("Buy bananas");
    await createTodo(page, apple);
    await createTodo(page, banana);

    await page.getByPlaceholder("Search title, subtasks, or tags…").fill("apples");
    await page.waitForTimeout(400);

    await expect(todoItem(page, apple)).toBeVisible();
    await expect(todoItem(page, banana)).toHaveCount(0);
  });

  test("search matches subtask titles too", async ({ page }) => {
    const title = uniqueName("Grocery run");
    await createTodo(page, title);
    await addSubtask(page, title, "Buy oat milk");

    await page.getByPlaceholder("Search title, subtasks, or tags…").fill("oat milk");
    await page.waitForTimeout(400);
    await expect(todoItem(page, title)).toBeVisible();
  });

  test("priority filter narrows the list", async ({ page }) => {
    const highTitle = uniqueName("Urgent fix");
    const lowTitle = uniqueName("Someday maybe");
    await createTodo(page, highTitle, { priority: "high" });
    await createTodo(page, lowTitle, { priority: "low" });

    await page.locator("select").filter({ hasText: "Any priority" }).selectOption("high");
    await expect(todoItem(page, highTitle)).toBeVisible();
    await expect(todoItem(page, lowTitle)).toHaveCount(0);
  });

  test("completion filter shows only completed todos", async ({ page }) => {
    const doneTitle = uniqueName("Finished task");
    const pendingTitle = uniqueName("Unfinished task");
    await createTodo(page, doneTitle);
    await createTodo(page, pendingTitle);
    await todoItem(page, doneTitle).locator('input[type="checkbox"]').first().check();

    await page.locator("select").filter({ hasText: "All" }).selectOption("completed");
    await expect(todoItem(page, doneTitle)).toBeVisible();
    await expect(todoItem(page, pendingTitle)).toHaveCount(0);
  });

  test("Clear resets all filters", async ({ page }) => {
    const title = uniqueName("Findable task");
    await createTodo(page, title, { priority: "low" });

    await page.locator("select").filter({ hasText: "Any priority" }).selectOption("high");
    await expect(todoItem(page, title)).toHaveCount(0);

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(todoItem(page, title)).toBeVisible();
  });

  test("saves and re-applies a filter preset", async ({ page }) => {
    const title = uniqueName("Preset task");
    await createTodo(page, title, { priority: "high" });

    await page.locator("select").filter({ hasText: "Any priority" }).selectOption("high");
    page.once("dialog", (dialog) => dialog.accept("High priority only"));
    await page.getByRole("button", { name: "Save preset", exact: true }).click();

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.locator("select").filter({ hasText: "Any priority" })).toHaveValue("");

    await page.getByRole("button", { name: "High priority only", exact: true }).click();
    await expect(page.locator("select").filter({ hasText: "Any priority" })).toHaveValue("high");
  });
});
