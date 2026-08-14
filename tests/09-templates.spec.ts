import { test, expect } from "@playwright/test";
import { createTemplate, register, uniqueName } from "./helpers";

test.describe("Template system", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("tmpl-user"));
  });

  test("creates a template and using it creates a todo with its subtasks", async ({ page }) => {
    const name = uniqueName("Weekly review");
    const todoTitle = uniqueName("Review the week");
    await createTemplate(page, name, todoTitle, {
      priority: "high",
      dueDateOffsetMinutes: 1440,
      subtasks: ["Check calendar", "Write notes"],
    });

    await page.getByRole("button", { name: "Templates" }).click();
    const dialog = page.getByRole("dialog", { name: "Templates" });
    await dialog.getByRole("button", { name: "Use" }).click();
    await dialog.getByRole("button", { name: "Close" }).click();

    const res = await page.request.get("/api/todos");
    const todos = await res.json();
    const created = todos.find((t: { title: string }) => t.title === todoTitle);
    expect(created).toBeTruthy();
    expect(created.due_date).toBeTruthy();
    expect(created.subtasks.map((s: { title: string }) => s.title).sort()).toEqual(
      ["Check calendar", "Write notes"].sort()
    );
  });

  test("using a template with no due-date offset creates a todo with no due date", async ({ page }) => {
    const name = uniqueName("Quick note");
    const todoTitle = uniqueName("Jot something down");
    await createTemplate(page, name, todoTitle);

    await page.getByRole("button", { name: "Templates" }).click();
    const dialog = page.getByRole("dialog", { name: "Templates" });
    await dialog.getByRole("button", { name: "Use" }).click();
    await dialog.getByRole("button", { name: "Close" }).click();

    const res = await page.request.get("/api/todos");
    const todos = await res.json();
    const created = todos.find((t: { title: string }) => t.title === todoTitle);
    expect(created.due_date).toBeNull();
  });

  test("deleting a template does not affect todos already created from it", async ({ page }) => {
    const name = uniqueName("One-off");
    const todoTitle = uniqueName("Already made");
    await createTemplate(page, name, todoTitle);

    await page.getByRole("button", { name: "Templates" }).click();
    const dialog = page.getByRole("dialog", { name: "Templates" });
    await dialog.getByRole("button", { name: "Use" }).click();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await dialog.getByRole("button", { name: "Close" }).click();

    const res = await page.request.get("/api/todos");
    const todos = await res.json();
    expect(todos.some((t: { title: string }) => t.title === todoTitle)).toBe(true);
  });
});
