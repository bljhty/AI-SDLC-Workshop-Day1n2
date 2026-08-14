// Runs before every unit test file. Points lib/db.ts at an in-memory SQLite
// database instead of the real project's todos.db (which the dev server /
// Playwright E2E suite may have open concurrently) — see the TEST_DB_PATH
// override in lib/db.ts.
process.env.TEST_DB_PATH = ":memory:";
