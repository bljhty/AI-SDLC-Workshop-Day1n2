import { describe, it, expect } from "vitest";

/**
 * Mirrors the inline subtask-progress formula in app/page.tsx's TodoItem
 * component:
 *
 *   const progress = total === 0 ? 0 : Math.round((done / total) * 100);
 *
 * That component isn't imported here (app/page.tsx is off-limits for this
 * change — it's being edited concurrently elsewhere), so this test
 * reimplements the exact same formula in isolation to lock in its behavior.
 */
function subtaskProgress(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

describe("subtask progress formula (mirrors app/page.tsx TodoItem)", () => {
  it("returns 0 when there are no subtasks", () => {
    expect(subtaskProgress(0, 0)).toBe(0);
  });

  it("returns 0 when no subtasks are complete", () => {
    expect(subtaskProgress(0, 4)).toBe(0);
  });

  it("returns 100 when all subtasks are complete", () => {
    expect(subtaskProgress(3, 3)).toBe(100);
  });

  it("returns the rounded percentage for a partial completion", () => {
    expect(subtaskProgress(1, 3)).toBe(33); // 33.33... rounds down
  });

  it("rounds a percentage up when the fraction is >= .5", () => {
    expect(subtaskProgress(2, 3)).toBe(67); // 66.66... rounds up
  });

  it("handles a single subtask, complete", () => {
    expect(subtaskProgress(1, 1)).toBe(100);
  });

  it("handles a single subtask, incomplete", () => {
    expect(subtaskProgress(0, 1)).toBe(0);
  });
});
