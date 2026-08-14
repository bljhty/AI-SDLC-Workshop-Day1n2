import { test, expect } from "@playwright/test";
import { createTag, createTodo, register, todoItem, uniqueName } from "./helpers";

test.describe("Tag system", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("tag-user"));
  });

  test("creates a tag and attaches/detaches it on a todo", async ({ page }) => {
    const tagName = uniqueName("Work");
    await createTag(page, tagName);

    const title = uniqueName("Tagged task");
    await createTodo(page, title);

    const item = todoItem(page, title);
    await item.getByRole("button", { name: "+ tag" }).click();
    await item.getByRole("button", { name: tagName }).click();
    await expect(item.getByText(tagName, { exact: true })).toBeVisible();

    await item.getByRole("button", { name: `Remove tag ${tagName}` }).click();
    await expect(item.getByText(tagName, { exact: true })).toHaveCount(0);
  });

  test("attach is idempotent — attaching twice keeps one chip", async ({ page }) => {
    const tagName = uniqueName("Urgent");
    await createTag(page, tagName);
    const title = uniqueName("Double attach");
    await createTodo(page, title);

    const res = await page.request.get("/api/todos");
    const todos = await res.json();
    const todo = todos.find((t: { title: string }) => t.title === title);
    const tagsRes = await page.request.get("/api/tags");
    const tags = await tagsRes.json();
    const tag = tags.find((t: { name: string }) => t.name === tagName);

    await page.request.post(`/api/todos/${todo.id}/tags`, { data: { tag_id: tag.id } });
    await page.request.post(`/api/todos/${todo.id}/tags`, { data: { tag_id: tag.id } });

    const finalRes = await page.request.get(`/api/todos/${todo.id}`);
    const finalTodo = await finalRes.json();
    expect(finalTodo.tags.filter((t: { id: number }) => t.id === tag.id)).toHaveLength(1);
  });

  test("editing a tag's name updates it everywhere without a page reload", async ({ page }) => {
    const oldName = uniqueName("Draft");
    await createTag(page, oldName);

    await page.getByRole("button", { name: "Manage Tags" }).click();
    const dialog = page.getByRole("dialog", { name: "Manage Tags" });
    // Find the row while it still shows its name as text, then click Edit.
    // Once in edit mode the name becomes an input's *value* (not text
    // content), so a `hasText`-filtered locator re-evaluated after that
    // point would silently match nothing — only look up the edit-mode
    // input afterward, scoped to the dialog's <li>s (there's only ever one
    // row in edit mode at a time, so it's unambiguous without `hasText`).
    await dialog.locator("li").filter({ hasText: oldName }).getByRole("button", { name: "Edit" }).click();
    const newName = uniqueName("Final");
    await dialog.locator('li input[type="text"]').fill(newName);
    await dialog.locator("li").getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByText(newName, { exact: true })).toBeVisible();
  });

  test("deleting a tag removes it from the manager list", async ({ page }) => {
    const tagName = uniqueName("Temp");
    await createTag(page, tagName);
    await page.getByRole("button", { name: "Manage Tags" }).click();
    const dialog = page.getByRole("dialog", { name: "Manage Tags" });
    await dialog.getByText(tagName, { exact: true }).locator("..").getByRole("button", { name: "Delete" }).click();
    await expect(dialog.getByText(tagName, { exact: true })).toHaveCount(0);
  });
});
