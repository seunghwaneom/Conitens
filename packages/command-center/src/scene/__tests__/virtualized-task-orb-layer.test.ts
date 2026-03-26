/**
 * virtualized-task-orb-layer.test.ts — Unit tests for Sub-AC 2 (AC 15).
 *
 * Tests the pure geometry functions of VirtualizedTaskOrbLayer:
 *   computeVirtualizedOrbPositions — layout algorithm for orb grid
 *
 * These are pure-function tests with no React/WebGL dependency.
 *
 *  1. Empty task list → empty positions map
 *  2. Single task → positioned at anchor center
 *  3. Row layout (≤ 5 tasks): all tasks on a single row, centered
 *  4. Row layout: spacing between adjacent orbs is ORB_ROW_SPACING
 *  5. Grid layout (> 5 tasks): tasks fill rows left-to-right
 *  6. Grid layout: Y positions differ between rows
 *  7. Grid layout: first row has GRID_COLS items (5)
 *  8. Positions map keys match the input task IDs
 *  9. Z coordinate is always the anchor Z
 * 10. Maximum window (25 tasks) produces correct grid dimensions
 */

import { describe, it, expect } from "vitest";
import {
  computeVirtualizedOrbPositions,
  ORB_ROW_SPACING,
} from "../VirtualizedTaskOrbLayer.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTasks(n: number): { taskId: string }[] {
  return Array.from({ length: n }, (_, i) => ({ taskId: `task-${i}` }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("computeVirtualizedOrbPositions — Sub-AC 2", () => {
  const AX = 5.0; // anchor X
  const AY = 2.0; // anchor Y
  const AZ = 3.0; // anchor Z

  // ── 1. Empty task list ────────────────────────────────────────────────────

  it("returns empty positions map for zero tasks", () => {
    const result = computeVirtualizedOrbPositions([], AX, AY, AZ);
    expect(Object.keys(result)).toHaveLength(0);
  });

  // ── 2. Single task — centered on anchor ──────────────────────────────────

  it("places a single task centered on the anchor X", () => {
    const [task] = makeTasks(1);
    const result = computeVirtualizedOrbPositions([task], AX, AY, AZ);
    const pos    = result[task.taskId];

    expect(pos).toBeDefined();
    expect(pos[0]).toBeCloseTo(AX); // centered
    expect(pos[2]).toBeCloseTo(AZ); // anchor Z
  });

  // ── 3. Row layout: all ≤ 5 tasks on a single row ─────────────────────────

  it("places 5 tasks on a single row (same Y)", () => {
    const tasks  = makeTasks(5);
    const result = computeVirtualizedOrbPositions(tasks, AX, AY, AZ);
    const yVals  = tasks.map((t) => result[t.taskId][1]);

    // All Y values should be identical for a single-row layout
    const firstY = yVals[0];
    for (const y of yVals) {
      expect(y).toBeCloseTo(firstY);
    }
  });

  // ── 4. Row layout: ORB_ROW_SPACING between adjacent orbs ─────────────────

  it("spaces adjacent row orbs by ORB_ROW_SPACING", () => {
    const tasks  = makeTasks(3);
    const result = computeVirtualizedOrbPositions(tasks, AX, AY, AZ);
    const x0     = result[tasks[0].taskId][0];
    const x1     = result[tasks[1].taskId][0];
    const x2     = result[tasks[2].taskId][0];

    expect(x1 - x0).toBeCloseTo(ORB_ROW_SPACING);
    expect(x2 - x1).toBeCloseTo(ORB_ROW_SPACING);
  });

  // ── 5. Grid layout: > 5 tasks fills multiple rows ────────────────────────

  it("places 10 tasks in a 5-col grid (2 rows)", () => {
    const tasks  = makeTasks(10);
    const result = computeVirtualizedOrbPositions(tasks, AX, AY, AZ);

    // Collect unique Y values
    const ySet = new Set(tasks.map((t) => Math.round(result[t.taskId][1] * 1000)));
    expect(ySet.size).toBe(2); // 2 distinct Y levels
  });

  // ── 6. Grid layout: row Y increases upward ────────────────────────────────

  it("row 0 (first 5) is above row 1 (next 5)", () => {
    const tasks  = makeTasks(10);
    const result = computeVirtualizedOrbPositions(tasks, AX, AY, AZ);

    const y0 = result[tasks[0].taskId][1]; // first task (row 0)
    const y5 = result[tasks[5].taskId][1]; // sixth task (row 1)

    // Row 0 tasks are placed above row 1 (grid fills bottom-to-top)
    expect(y0).toBeGreaterThan(y5);
  });

  // ── 7. Grid layout: first row has exactly GRID_COLS items ────────────────

  it("the first 5 tasks of an 8-task layout share the same top-row Y", () => {
    const tasks  = makeTasks(8);
    const result = computeVirtualizedOrbPositions(tasks, AX, AY, AZ);

    const topY = result[tasks[0].taskId][1];
    // Tasks 0–4 should all share the topY (top row)
    for (let i = 0; i < 5; i++) {
      expect(result[tasks[i].taskId][1]).toBeCloseTo(topY);
    }
    // Tasks 5–7 should be on a lower row
    expect(result[tasks[5].taskId][1]).toBeLessThan(topY);
  });

  // ── 8. Positions map keys match input task IDs ────────────────────────────

  it("positions map contains exactly the provided task IDs", () => {
    const tasks  = makeTasks(7);
    const result = computeVirtualizedOrbPositions(tasks, AX, AY, AZ);
    const keys   = Object.keys(result);

    expect(keys).toHaveLength(7);
    for (const task of tasks) {
      expect(keys).toContain(task.taskId);
    }
  });

  // ── 9. Z coordinate is always anchor Z ───────────────────────────────────

  it("all tasks use anchor Z for their Z coordinate", () => {
    const tasks  = makeTasks(15);
    const result = computeVirtualizedOrbPositions(tasks, AX, AY, AZ);

    for (const task of tasks) {
      expect(result[task.taskId][2]).toBeCloseTo(AZ);
    }
  });

  // ── 10. 25-task window (maximum default) ─────────────────────────────────

  it("handles 25 tasks (max default window) without error", () => {
    const tasks  = makeTasks(25);
    const result = computeVirtualizedOrbPositions(tasks, AX, AY, AZ);

    expect(Object.keys(result)).toHaveLength(25);

    // Verify at least 5 distinct Y levels (25 / 5 cols = 5 rows)
    const ySet = new Set(tasks.map((t) => Math.round(result[t.taskId][1] * 1000)));
    expect(ySet.size).toBe(5);
  });
});
