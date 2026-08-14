import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getSingaporeNow } from "./timezone";

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

// Overridable for unit tests (see tests/unit/setup.ts) so `vitest run` never
// opens/locks the real dev/E2E database file. Unset in every other context.
// On Railway, RAILWAY_VOLUME_MOUNT_PATH points at the attached persistent
// volume — without it, the db would live on the container's ephemeral
// filesystem and reset on every deploy/restart.
const dbDir = process.env.TEST_DB_PATH
  ? null
  : (process.env.RAILWAY_VOLUME_MOUNT_PATH ?? process.cwd());
// The volume is only mounted at deploy/runtime, not during the build step —
// but `next build` still imports this module (to collect API route page
// data), so the directory may not exist yet. Create it defensively rather
// than crashing the build; at runtime this is a harmless no-op since the
// mounted volume directory already exists.
if (dbDir) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = process.env.TEST_DB_PATH ?? path.join(dbDir!, "todos.db");
export const db: Database.Database = new Database(dbPath);
db.pragma("journal_mode = WAL");
// Next's build-time page-data collection loads this module from many
// worker processes at once; without a busy timeout, concurrent workers
// racing to run the CREATE TABLE migration below throw SQLITE_BUSY instead
// of just waiting their turn for the lock.
db.pragma("busy_timeout = 5000");
// Required for ON DELETE CASCADE to actually fire in better-sqlite3.
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS authenticators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    credential_public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurrence_pattern TEXT,
    reminder_minutes INTEGER,
    last_notification_sent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

  CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    title_template TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurrence_pattern TEXT,
    reminder_minutes INTEGER,
    due_date_offset_minutes INTEGER,
    subtasks_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Priority = "high" | "medium" | "low";
export type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly";
export type ReminderMinutes = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080;

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer;
  counter: number;
  created_at: string;
}

export interface Session {
  userId: number;
  username: string;
}

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string | null;
  subtasks?: Subtask[];
  tags?: Tag[];
}

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_minutes: number | null;
  subtasks_json: string | null;
  created_at: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Row mappers (SQLite has no boolean type — 0/1 INTEGER in, boolean out)
// ---------------------------------------------------------------------------

type TodoRow = Omit<Todo, "completed" | "is_recurring" | "subtasks" | "tags"> & {
  completed: number;
  is_recurring: number;
};
type SubtaskRow = Omit<Subtask, "completed"> & { completed: number };

function mapTodo(row: TodoRow): Todo {
  return {
    ...row,
    completed: !!row.completed,
    is_recurring: !!row.is_recurring,
  };
}

function mapSubtask(row: SubtaskRow): Subtask {
  return { ...row, completed: !!row.completed };
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const userDB = {
  create(username: string): User {
    const stmt = db.prepare("INSERT INTO users (username) VALUES (?)");
    const info = stmt.run(username);
    return this.getById(info.lastInsertRowid as number)!;
  },
  getByUsername(username: string): User | undefined {
    return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
      | User
      | undefined;
  },
  getById(id: number): User | undefined {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
  },
};

// ---------------------------------------------------------------------------
// authenticators
// ---------------------------------------------------------------------------

export const authenticatorDB = {
  create(params: {
    user_id: number;
    credential_id: string;
    credential_public_key: Buffer;
    counter: number;
  }): Authenticator {
    const stmt = db.prepare(
      `INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter)
       VALUES (@user_id, @credential_id, @credential_public_key, @counter)`
    );
    const info = stmt.run(params);
    return db
      .prepare("SELECT * FROM authenticators WHERE id = ?")
      .get(info.lastInsertRowid as number) as Authenticator;
  },
  getByCredentialId(credential_id: string): Authenticator | undefined {
    return db
      .prepare("SELECT * FROM authenticators WHERE credential_id = ?")
      .get(credential_id) as Authenticator | undefined;
  },
  listByUserId(user_id: number): Authenticator[] {
    return db
      .prepare("SELECT * FROM authenticators WHERE user_id = ?")
      .all(user_id) as Authenticator[];
  },
  updateCounter(id: number, counter: number): void {
    db.prepare("UPDATE authenticators SET counter = ? WHERE id = ?").run(counter, id);
  },
};

// ---------------------------------------------------------------------------
// todos
// ---------------------------------------------------------------------------

export const todoDB = {
  create(params: {
    user_id: number;
    title: string;
    due_date?: string | null;
    priority?: Priority;
    is_recurring?: boolean;
    recurrence_pattern?: RecurrencePattern | null;
    reminder_minutes?: number | null;
  }): Todo {
    const stmt = db.prepare(
      `INSERT INTO todos (user_id, title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes)
       VALUES (@user_id, @title, @due_date, @priority, @is_recurring, @recurrence_pattern, @reminder_minutes)`
    );
    const info = stmt.run({
      user_id: params.user_id,
      title: params.title,
      due_date: params.due_date ?? null,
      priority: params.priority ?? "medium",
      is_recurring: params.is_recurring ? 1 : 0,
      recurrence_pattern: params.recurrence_pattern ?? null,
      reminder_minutes: params.reminder_minutes ?? null,
    });
    return this.getById(info.lastInsertRowid as number, params.user_id)!;
  },
  getById(id: number, user_id: number): Todo | undefined {
    const row = db
      .prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?")
      .get(id, user_id) as TodoRow | undefined;
    if (!row) return undefined;
    const todo = mapTodo(row);
    todo.subtasks = subtaskDB.listByTodo(id);
    todo.tags = tagDB.listByTodo(id);
    return todo;
  },
  listByUser(user_id: number): Todo[] {
    const rows = db
      .prepare("SELECT * FROM todos WHERE user_id = ?")
      .all(user_id) as TodoRow[];
    return rows.map((row) => {
      const todo = mapTodo(row);
      todo.subtasks = subtaskDB.listByTodo(row.id);
      todo.tags = tagDB.listByTodo(row.id);
      return todo;
    });
  },
  update(
    id: number,
    user_id: number,
    fields: Partial<
      Pick<
        Todo,
        | "title"
        | "completed"
        | "due_date"
        | "priority"
        | "is_recurring"
        | "recurrence_pattern"
        | "reminder_minutes"
        | "last_notification_sent"
      >
    >
  ): Todo | undefined {
    const columns: string[] = [];
    const values: Record<string, unknown> = { id, user_id };
    for (const [key, value] of Object.entries(fields)) {
      columns.push(`${key} = @${key}`);
      values[key] =
        typeof value === "boolean" ? (value ? 1 : 0) : (value as unknown);
    }
    if (columns.length === 0) return this.getById(id, user_id);
    columns.push("updated_at = @updated_at");
    values.updated_at = getSingaporeNow().toISOString();
    db.prepare(
      `UPDATE todos SET ${columns.join(", ")} WHERE id = @id AND user_id = @user_id`
    ).run(values);
    return this.getById(id, user_id);
  },
  delete(id: number, user_id: number): boolean {
    const info = db
      .prepare("DELETE FROM todos WHERE id = ? AND user_id = ?")
      .run(id, user_id);
    return info.changes > 0;
  },
};

// ---------------------------------------------------------------------------
// subtasks
// ---------------------------------------------------------------------------

export const subtaskDB = {
  create(todo_id: number, title: string): Subtask {
    const maxPos = db
      .prepare("SELECT COALESCE(MAX(position), -1) AS maxPos FROM subtasks WHERE todo_id = ?")
      .get(todo_id) as { maxPos: number };
    const info = db
      .prepare("INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?)")
      .run(todo_id, title, maxPos.maxPos + 1);
    return mapSubtask(
      db.prepare("SELECT * FROM subtasks WHERE id = ?").get(info.lastInsertRowid as number) as SubtaskRow
    );
  },
  listByTodo(todo_id: number): Subtask[] {
    return (
      db
        .prepare("SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC")
        .all(todo_id) as SubtaskRow[]
    ).map(mapSubtask);
  },
  getById(id: number): Subtask | undefined {
    const row = db.prepare("SELECT * FROM subtasks WHERE id = ?").get(id) as
      | SubtaskRow
      | undefined;
    return row ? mapSubtask(row) : undefined;
  },
  update(id: number, fields: Partial<Pick<Subtask, "title" | "completed">>): Subtask | undefined {
    const columns: string[] = [];
    const values: Record<string, unknown> = { id };
    for (const [key, value] of Object.entries(fields)) {
      columns.push(`${key} = @${key}`);
      values[key] = typeof value === "boolean" ? (value ? 1 : 0) : value;
    }
    if (columns.length === 0) return this.getById(id);
    db.prepare(`UPDATE subtasks SET ${columns.join(", ")} WHERE id = @id`).run(values);
    return this.getById(id);
  },
  delete(id: number): boolean {
    const info = db.prepare("DELETE FROM subtasks WHERE id = ?").run(id);
    return info.changes > 0;
  },
  belongsToUser(subtaskId: number, user_id: number): boolean {
    const row = db
      .prepare(
        `SELECT t.user_id AS user_id FROM subtasks s
         JOIN todos t ON t.id = s.todo_id
         WHERE s.id = ?`
      )
      .get(subtaskId) as { user_id: number } | undefined;
    return !!row && row.user_id === user_id;
  },
};

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

export const tagDB = {
  create(user_id: number, name: string, color?: string): Tag {
    const info = db
      .prepare("INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)")
      .run(user_id, name, color ?? "#3B82F6");
    return this.getById(info.lastInsertRowid as number, user_id)!;
  },
  getById(id: number, user_id: number): Tag | undefined {
    return db
      .prepare("SELECT * FROM tags WHERE id = ? AND user_id = ?")
      .get(id, user_id) as Tag | undefined;
  },
  getByName(user_id: number, name: string): Tag | undefined {
    return db
      .prepare("SELECT * FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE")
      .get(user_id, name) as Tag | undefined;
  },
  listByUser(user_id: number): Tag[] {
    return db.prepare("SELECT * FROM tags WHERE user_id = ?").all(user_id) as Tag[];
  },
  listByTodo(todo_id: number): Tag[] {
    return db
      .prepare(
        `SELECT tags.* FROM tags
         JOIN todo_tags ON todo_tags.tag_id = tags.id
         WHERE todo_tags.todo_id = ?`
      )
      .all(todo_id) as Tag[];
  },
  update(id: number, user_id: number, fields: Partial<Pick<Tag, "name" | "color">>): Tag | undefined {
    const columns = Object.keys(fields).map((k) => `${k} = @${k}`);
    if (columns.length === 0) return this.getById(id, user_id);
    db.prepare(
      `UPDATE tags SET ${columns.join(", ")} WHERE id = @id AND user_id = @user_id`
    ).run({ ...fields, id, user_id });
    return this.getById(id, user_id);
  },
  delete(id: number, user_id: number): boolean {
    const info = db
      .prepare("DELETE FROM tags WHERE id = ? AND user_id = ?")
      .run(id, user_id);
    return info.changes > 0;
  },
  attach(todo_id: number, tag_id: number): void {
    db.prepare(
      "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)"
    ).run(todo_id, tag_id);
  },
  detach(todo_id: number, tag_id: number): void {
    db.prepare("DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?").run(
      todo_id,
      tag_id
    );
  },
};

// ---------------------------------------------------------------------------
// templates
// ---------------------------------------------------------------------------

export const templateDB = {
  create(params: {
    user_id: number;
    name: string;
    description?: string | null;
    category?: string | null;
    title_template: string;
    priority?: Priority;
    is_recurring?: boolean;
    recurrence_pattern?: RecurrencePattern | null;
    reminder_minutes?: number | null;
    due_date_offset_minutes?: number | null;
    subtasks_json?: string | null;
  }): Template {
    const info = db
      .prepare(
        `INSERT INTO templates
          (user_id, name, description, category, title_template, priority,
           is_recurring, recurrence_pattern, reminder_minutes, due_date_offset_minutes, subtasks_json)
         VALUES
          (@user_id, @name, @description, @category, @title_template, @priority,
           @is_recurring, @recurrence_pattern, @reminder_minutes, @due_date_offset_minutes, @subtasks_json)`
      )
      .run({
        user_id: params.user_id,
        name: params.name,
        description: params.description ?? null,
        category: params.category ?? null,
        title_template: params.title_template,
        priority: params.priority ?? "medium",
        is_recurring: params.is_recurring ? 1 : 0,
        recurrence_pattern: params.recurrence_pattern ?? null,
        reminder_minutes: params.reminder_minutes ?? null,
        due_date_offset_minutes: params.due_date_offset_minutes ?? null,
        subtasks_json: params.subtasks_json ?? null,
      });
    return this.getById(info.lastInsertRowid as number, params.user_id)!;
  },
  getById(id: number, user_id: number): Template | undefined {
    const row = db
      .prepare("SELECT * FROM templates WHERE id = ? AND user_id = ?")
      .get(id, user_id) as (Omit<Template, "is_recurring"> & { is_recurring: number }) | undefined;
    return row ? { ...row, is_recurring: !!row.is_recurring } : undefined;
  },
  listByUser(user_id: number): Template[] {
    const rows = db
      .prepare("SELECT * FROM templates WHERE user_id = ?")
      .all(user_id) as (Omit<Template, "is_recurring"> & { is_recurring: number })[];
    return rows.map((row) => ({ ...row, is_recurring: !!row.is_recurring }));
  },
  update(
    id: number,
    user_id: number,
    fields: Partial<Omit<Template, "id" | "user_id" | "created_at">>
  ): Template | undefined {
    const columns: string[] = [];
    const values: Record<string, unknown> = { id, user_id };
    for (const [key, value] of Object.entries(fields)) {
      columns.push(`${key} = @${key}`);
      values[key] = typeof value === "boolean" ? (value ? 1 : 0) : value;
    }
    if (columns.length === 0) return this.getById(id, user_id);
    db.prepare(
      `UPDATE templates SET ${columns.join(", ")} WHERE id = @id AND user_id = @user_id`
    ).run(values);
    return this.getById(id, user_id);
  },
  delete(id: number, user_id: number): boolean {
    const info = db
      .prepare("DELETE FROM templates WHERE id = ? AND user_id = ?")
      .run(id, user_id);
    return info.changes > 0;
  },
};

// ---------------------------------------------------------------------------
// holidays
// ---------------------------------------------------------------------------

export const holidayDB = {
  bulkInsert(holidays: { date: string; name: string }[]): void {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO holidays (date, name) VALUES (@date, @name)"
    );
    const insertMany = db.transaction((rows: { date: string; name: string }[]) => {
      for (const row of rows) stmt.run(row);
    });
    insertMany(holidays);
  },
  listAll(): Holiday[] {
    return db.prepare("SELECT id, date, name FROM holidays ORDER BY date ASC").all() as Holiday[];
  },
  listByMonth(year: number, month: number): Holiday[] {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    return db
      .prepare("SELECT id, date, name FROM holidays WHERE date LIKE ? ORDER BY date ASC")
      .all(`${prefix}%`) as Holiday[];
  },
};
