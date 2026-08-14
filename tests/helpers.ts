import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Unique per call so parallel test runs never collide on username/tag/etc.
 * Kept short (usernames are capped at 32 chars server-side) via base36 encoding.
 */
export function uniqueName(prefix: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `${prefix.slice(0, 10)}-${stamp}-${rand}`;
}

/**
 * Attaches a Chrome virtual WebAuthn authenticator to this page via CDP.
 * Must be called before any WebAuthn call happens on the page (i.e. before
 * `register()`). The credential it creates lives only on this CDP session,
 * so `login()` after a logout must reuse the same `page` instance.
 */
export async function addVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { client, authenticatorId };
}

/** Registers a new passkey user and lands on `/`. Sets up the virtual authenticator. */
export async function register(page: Page, username: string) {
  await addVirtualAuthenticator(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Register new passkey" }).click();
  await expect(page).toHaveURL("/");
}

/**
 * Signs in an existing user. Assumes `register()` already ran earlier in
 * this same `page` (the virtual authenticator holding the credential lives
 * on the page's CDP session) — e.g. after `logout()`.
 */
export async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(page).toHaveURL("/");
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
}

interface CreateTodoOptions {
  priority?: "high" | "medium" | "low";
  dueDate?: string; // yyyy-mm-dd
  recurring?: boolean;
  recurrencePattern?: "daily" | "weekly" | "monthly" | "yearly";
  reminderMinutes?: number;
}

/** Fills and submits the create-todo form on `/`. */
export async function createTodo(page: Page, title: string, opts: CreateTodoOptions = {}) {
  const form = page.locator("form").first();
  await form.getByPlaceholder("Add a todo…").fill(title);
  if (opts.priority) {
    await form.locator("select").first().selectOption(opts.priority);
  }
  if (opts.dueDate) {
    await form.locator('input[type="date"]').fill(opts.dueDate);
  }
  if (opts.recurring) {
    await form.getByLabel("Recurring").check();
    if (opts.recurrencePattern) {
      await form.locator("select").nth(1).selectOption(opts.recurrencePattern);
    }
  }
  if (opts.reminderMinutes) {
    await form.locator("select").last().selectOption(String(opts.reminderMinutes));
  }
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("li").filter({ hasText: title })).toBeVisible();
}

/** Finds a todo's `<li>` by its (visible) title text. */
export function todoItem(page: Page, title: string) {
  return page.locator("li").filter({ hasText: title });
}

/** Adds a subtask to an existing todo, expanding it first if needed. */
export async function addSubtask(page: Page, todoTitle: string, subtaskTitle: string) {
  const item = todoItem(page, todoTitle);
  const input = item.getByPlaceholder("Add subtask…");
  if (!(await input.isVisible())) {
    await item.getByText(/\/\d+ subtasks/).click();
  }
  await input.fill(subtaskTitle);
  await item.getByRole("button", { name: "Add", exact: true }).click();
  await expect(item.getByText(subtaskTitle)).toBeVisible();
}

/** Creates a tag via the "Manage Tags" modal, then closes it. */
export async function createTag(page: Page, name: string, color?: string) {
  await page.getByRole("button", { name: "Manage Tags" }).click();
  const dialog = page.getByRole("dialog", { name: "Manage Tags" });
  if (color) {
    await dialog
      .locator('input[type="color"]')
      .last()
      .evaluate((el: HTMLInputElement, value: string) => {
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, color);
  }
  await dialog.getByPlaceholder("New tag name…").fill(name);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
}

interface CreateTemplateOptions {
  priority?: "high" | "medium" | "low";
  dueDateOffsetMinutes?: 60 | 1440 | 10080;
  reminderMinutes?: number;
  recurring?: boolean;
  recurrencePattern?: "daily" | "weekly" | "monthly" | "yearly";
  subtasks?: string[];
}

/** Creates a template via the "Templates" modal, then closes it. */
export async function createTemplate(
  page: Page,
  name: string,
  titleTemplate: string,
  opts: CreateTemplateOptions = {}
) {
  await page.getByRole("button", { name: "Templates" }).click();
  const dialog = page.getByRole("dialog", { name: "Templates" });
  await dialog.getByPlaceholder("Template name…").fill(name);
  await dialog.getByPlaceholder("Todo title…").fill(titleTemplate);
  if (opts.priority) {
    await dialog.locator("select").first().selectOption(opts.priority);
  }
  if (opts.dueDateOffsetMinutes) {
    await dialog.locator("select").nth(1).selectOption(String(opts.dueDateOffsetMinutes));
  }
  if (opts.reminderMinutes) {
    await dialog.locator("select").nth(2).selectOption(String(opts.reminderMinutes));
  }
  if (opts.recurring) {
    await dialog.getByLabel("Recurring").check();
    if (opts.recurrencePattern) {
      await dialog.locator("select").last().selectOption(opts.recurrencePattern);
    }
  }
  if (opts.subtasks?.length) {
    await dialog.getByPlaceholder("Subtasks, one per line…").fill(opts.subtasks.join("\n"));
  }
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
}
