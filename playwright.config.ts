import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // tests/unit/*.test.ts is the separate Vitest suite (vitest.config.ts) —
  // exclude it here so Playwright's default *.test.ts matcher doesn't also
  // try to run those files as E2E specs (they import from "vitest", not
  // "@playwright/test", and fail immediately if picked up).
  testIgnore: ["**/unit/**"],
  // Safe to parallelize: every test registers its own uniquely-named user,
  // so test data never overlaps across workers even though they share one
  // SQLite file (WAL mode + busy_timeout in lib/db.ts serializes writes).
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    timezoneId: "Asia/Singapore",
  },
  webServer: {
    // A production build, not `next dev`: Turbopack's dev server lazily
    // compiles each route on its first hit (~400ms), and that recompilation
    // triggers an HMR push to the browser that resets in-flight component
    // state — indistinguishable from a real bug when it lands mid-test.
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
