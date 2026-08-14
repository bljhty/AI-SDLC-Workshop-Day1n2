import { test, expect } from "@playwright/test";
import { addSubtask, createTag, createTodo, register, todoItem, uniqueName } from "./helpers";

test.describe("Export & Import", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("export-user"));
  });

  test("JSON export includes subtasks and tags, and no numeric IDs", async ({ page }) => {
    const tagName = uniqueName("Home");
    await createTag(page, tagName);
    const title = uniqueName("Fix the sink");
    await createTodo(page, title);
    await addSubtask(page, title, "Buy washer");

    const item = todoItem(page, title);
    await item.getByRole("button", { name: "+ tag" }).click();
    await item.getByRole("button", { name: tagName }).click();
    await expect(item.getByText(tagName, { exact: true })).toBeVisible();

    const res = await page.request.get("/api/todos/export?format=json");
    expect(res.ok()).toBe(true);
    const envelope = await res.json();
    expect(envelope.version).toBe(1);

    const exported = envelope.todos.find((t: { title: string }) => t.title === title);
    expect(exported).toBeTruthy();
    expect(exported.id).toBeUndefined();
    expect(exported.subtasks).toEqual([{ title: "Buy washer", completed: false }]);
    expect(exported.tags).toEqual([{ name: tagName, color: expect.any(String) }]);
  });

  test("CSV export has the documented columns and quotes commas", async ({ page }) => {
    const title = uniqueName("Task, with a comma");
    await createTodo(page, title);

    const res = await page.request.get("/api/todos/export?format=csv");
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder");
    expect(csv).toContain(`"${title}"`);
  });

  test("importing the exported JSON creates new todos with remapped tags", async ({ page }) => {
    const tagName = uniqueName("Imported tag");
    await createTag(page, tagName);
    const title = uniqueName("Original todo");
    await createTodo(page, title);
    const item = todoItem(page, title);
    await item.getByRole("button", { name: "+ tag" }).click();
    await item.getByRole("button", { name: tagName }).click();

    const exportRes = await page.request.get("/api/todos/export?format=json");
    const envelope = await exportRes.json();

    const importRes = await page.request.post("/api/todos/import", { data: envelope });
    expect(importRes.ok()).toBe(true);
    const { imported } = await importRes.json();
    expect(imported).toBe(envelope.todos.length);

    // Re-importing the same file duplicates todos by design.
    const todosRes = await page.request.get("/api/todos");
    const todos = await todosRes.json();
    expect(todos.filter((t: { title: string }) => t.title === title)).toHaveLength(2);

    // Tag conflict resolution reuses the existing tag rather than duplicating it.
    const tagsRes = await page.request.get("/api/tags");
    const tags = await tagsRes.json();
    expect(tags.filter((t: { name: string }) => t.name === tagName)).toHaveLength(1);
  });

  test("rejects a structurally invalid import file", async ({ page }) => {
    const res = await page.request.post("/api/todos/import", {
      data: { not: "a valid envelope" },
    });
    expect(res.status()).toBe(400);
  });
});
