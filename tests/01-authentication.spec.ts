import { test, expect } from "@playwright/test";
import { login, logout, register, uniqueName } from "./helpers";

test.describe("Authentication (WebAuthn)", () => {
  test("registers a new user with a passkey and lands on the todo list", async ({ page }) => {
    const username = uniqueName("alice");
    await register(page, username);
    await expect(page.getByText(username)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
  });

  test("signs out and back in with the same passkey", async ({ page }) => {
    const username = uniqueName("bob");
    await register(page, username);
    await logout(page);
    await login(page, username);
    await expect(page.getByText(username)).toBeVisible();
  });

  test("redirects unauthenticated visitors from / to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("redirects authenticated users away from /login back to /", async ({ page }) => {
    const username = uniqueName("carol");
    await register(page, username);
    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });

  test("rejects registering an already-taken username", async ({ page }) => {
    const username = uniqueName("dave");
    await register(page, username);
    await logout(page);

    await page.goto("/login");
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await page.getByLabel("Username").fill(username);
    await page.getByRole("button", { name: "Register new passkey" }).click();
    await expect(page.getByText(/already registered/i)).toBeVisible();
  });

  test("shows an error for signing in with an unknown username", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(uniqueName("nobody"));
    await page.getByRole("button", { name: "Sign in with passkey" }).click();
    await expect(page.getByText(/no account found/i)).toBeVisible();
  });
});
