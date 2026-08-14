import { test, expect } from "@playwright/test";
import { createTodo, register, uniqueName } from "./helpers";

test.describe("Calendar view", () => {
  test.beforeEach(async ({ page }) => {
    await register(page, uniqueName("cal-user"));
  });

  test("redirects unauthenticated visitors from /calendar to /login", async ({ page }) => {
    await page.request.post("/api/auth/logout");
    await page.goto("/calendar");
    await expect(page).toHaveURL("/login");
  });

  test("shows a 7-column grid with weekday headers", async ({ page }) => {
    await page.goto("/calendar");
    for (const label of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("navigating months updates the ?month= URL param", async ({ page }) => {
    await page.goto("/calendar?month=2026-03");
    await expect(page.getByRole("heading", { name: "March 2026" })).toBeVisible();

    await page.getByRole("button", { name: "Next ›" }).click();
    await expect(page).toHaveURL(/month=2026-04/);
    await expect(page.getByRole("heading", { name: "April 2026" })).toBeVisible();

    await page.getByRole("button", { name: "‹ Prev" }).click();
    await expect(page).toHaveURL(/month=2026-03/);
  });

  test("an invalid ?month= falls back to the current month", async ({ page }) => {
    await page.goto("/calendar?month=not-a-month");
    const now = new Date();
    const label = now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  });

  test("a todo with a due date this month renders on its day, click opens the day modal", async ({
    page,
  }) => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dueDate = `${year}-${month}-15`;
    const title = uniqueName("Calendar todo");
    await createTodo(page, title, { dueDate });

    await page.goto("/calendar");
    await page.getByText("15", { exact: true }).click();
    await expect(page.getByRole("dialog").getByText(title)).toBeVisible();
  });
});
