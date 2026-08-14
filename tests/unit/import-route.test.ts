import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The route only needs a userId out of the session; bypass real cookie/JWT
// handling (which requires a live Next.js request context) so we can drive
// the route's real zod validation + db.transaction import logic directly
// against an isolated in-memory database (see tests/unit/setup.ts).
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/auth";
import { userDB, tagDB, todoDB } from "@/lib/db";
import { POST } from "@/app/api/todos/import/route";

function postImport(body: unknown) {
  const request = new NextRequest("http://localhost/api/todos/import", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return POST(request);
}

describe("POST /api/todos/import", () => {
  let userId: number;

  beforeEach(() => {
    const user = userDB.create(`import-test-${Math.random().toString(36).slice(2)}`);
    userId = user.id;
    vi.mocked(getSession).mockResolvedValue({ userId, username: user.username });
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await postImport({ version: 1, todos: [] });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed payload (todo missing required title) with 400", async () => {
    const res = await postImport({
      version: 1,
      todos: [{ priority: "high" }], // no title
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("rejects a payload with an invalid priority enum value with 400", async () => {
    const res = await postImport({
      version: 1,
      todos: [{ title: "x", priority: "urgent" }],
    });
    expect(res.status).toBe(400);
  });

  it("accepts a well-formed minimal payload and imports the todo", async () => {
    const res = await postImport({
      version: 1,
      todos: [{ title: "Buy milk" }],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    const todos = todoDB.listByUser(userId);
    expect(todos).toHaveLength(1);
    expect(todos[0].title).toBe("Buy milk");
  });

  it("accepts a well-formed full payload with subtasks and tags", async () => {
    const res = await postImport({
      version: 1,
      todos: [
        {
          title: "Plan trip",
          completed: true,
          priority: "high",
          subtasks: [
            { title: "Book flight", completed: true },
            { title: "Book hotel", completed: false },
          ],
          tags: [{ name: "Travel", color: "#ff0000" }],
        },
      ],
    });
    expect(res.status).toBe(200);
    const [todo] = todoDB.listByUser(userId);
    expect(todo.completed).toBe(true);
    expect(todo.subtasks).toHaveLength(2);
    expect(todo.subtasks!.find((s) => s.title === "Book flight")!.completed).toBe(true);
    expect(todo.tags).toHaveLength(1);
    expect(todo.tags![0].name).toBe("Travel");
  });

  it("resolves tag names case-insensitively to a single shared tag, not a duplicate", async () => {
    await postImport({
      version: 1,
      todos: [
        { title: "Todo A", tags: [{ name: "Work" }] },
        { title: "Todo B", tags: [{ name: "work" }] },
      ],
    });
    const tags = tagDB.listByUser(userId);
    expect(tags).toHaveLength(1);

    const [todoA, todoB] = todoDB
      .listByUser(userId)
      .sort((a, b) => a.title.localeCompare(b.title));
    expect(todoA.tags![0].id).toBe(todoB.tags![0].id);
  });

  it("reuses a tag that already exists for the user instead of creating a duplicate", async () => {
    const existing = tagDB.create(userId, "Existing", "#00ff00");
    await postImport({
      version: 1,
      todos: [{ title: "Uses existing tag", tags: [{ name: "existing" }] }],
    });
    const tags = tagDB.listByUser(userId);
    expect(tags).toHaveLength(1);
    expect(tags[0].id).toBe(existing.id);
    // Color of the pre-existing tag is preserved, not overwritten by the import.
    expect(tags[0].color).toBe("#00ff00");
  });

  it("imports multiple todos in one call, each getting its own new id", async () => {
    const res = await postImport({
      version: 1,
      todos: [{ title: "One" }, { title: "Two" }, { title: "Three" }],
    });
    const body = await res.json();
    expect(body.imported).toBe(3);
    const todos = todoDB.listByUser(userId);
    const ids = new Set(todos.map((t) => t.id));
    expect(ids.size).toBe(3);
  });
});
