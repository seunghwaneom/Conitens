/**
 * agent-lifecycle-panel.test.ts — Unit tests for Sub-AC 7.1:
 * 3D-space agent lifecycle controls with clickable UI on agent nodes.
 *
 * Tests the pure-logic aspects of AgentLifecyclePanel.tsx that drive
 * button visibility and confirmation requirements in the diegetic 3D panel.
 *
 * NOTE: Three.js and R3F hooks (Html, useFrame) cannot run headless.
 *       These tests target only the exported pure utility functions and
 *       constants — React component rendering is not tested here.
 *
 * Coverage:
 *   1. getAvailableActions() — context-aware action derivation from agent status
 *   2. REQUIRES_CONFIRM set — destructive action confirmation guard
 *   3. ACTION × STATUS matrix — ensures no invalid buttons are shown
 *
 * Test ID scheme:
 *   7a-panel-N : Sub-AC 7.1 lifecycle panel logic
 */

import { describe, it, expect } from "vitest";
import {
  getAvailableActions,
  REQUIRES_CONFIRM,
} from "../AgentLifecyclePanel.js";

// ── 1. getAvailableActions — status-to-button mapping ────────────────────────

describe("Sub-AC 7.1 — getAvailableActions: lifecycle panel button availability", () => {

  // 7a-panel-1
  it("inactive agent gets only START action (cannot stop/pause what hasn't started)", () => {
    const actions = getAvailableActions("inactive");
    expect(actions).toEqual(["start"]);
    expect(actions).not.toContain("stop");
    expect(actions).not.toContain("pause");
    expect(actions).not.toContain("restart");
  });

  // 7a-panel-2
  it("terminated agent gets only START action (re-activate)", () => {
    const actions = getAvailableActions("terminated");
    expect(actions).toEqual(["start"]);
    expect(actions).not.toContain("stop");
    expect(actions).not.toContain("pause");
  });

  // 7a-panel-3
  it("idle agent gets STOP and RESTART (not PAUSE — nothing to suspend)", () => {
    const actions = getAvailableActions("idle");
    expect(actions).toContain("stop");
    expect(actions).toContain("restart");
    expect(actions).not.toContain("start");
    expect(actions).not.toContain("pause");
  });

  // 7a-panel-4
  it("active agent gets PAUSE, RESTART, and STOP (all three controls)", () => {
    const actions = getAvailableActions("active");
    expect(actions).toContain("pause");
    expect(actions).toContain("restart");
    expect(actions).toContain("stop");
    expect(actions).not.toContain("start");
  });

  // 7a-panel-5
  it("busy agent gets same controls as active: PAUSE, RESTART, STOP", () => {
    const actions = getAvailableActions("busy");
    expect(actions).toContain("pause");
    expect(actions).toContain("restart");
    expect(actions).toContain("stop");
    expect(actions).not.toContain("start");
  });

  // 7a-panel-6
  it("error agent gets RESTART and STOP (not PAUSE — not actively running)", () => {
    const actions = getAvailableActions("error");
    expect(actions).toContain("restart");
    expect(actions).toContain("stop");
    expect(actions).not.toContain("start");
    expect(actions).not.toContain("pause");
  });

  // 7a-panel-7
  it("unknown status returns empty actions (safe fallback)", () => {
    const actions = getAvailableActions("unknown-status");
    expect(actions).toEqual([]);
  });

  // 7a-panel-8
  it("getAvailableActions always returns an array (never null/undefined)", () => {
    for (const status of ["inactive", "idle", "active", "busy", "error", "terminated", ""]) {
      const result = getAvailableActions(status);
      expect(Array.isArray(result)).toBe(true);
    }
  });
});

// ── 2. REQUIRES_CONFIRM set — destructive action guards ──────────────────────

describe("Sub-AC 7.1 — REQUIRES_CONFIRM: destructive action confirmation", () => {

  // 7a-panel-9
  it("STOP action requires confirmation (destructive — clears task state)", () => {
    expect(REQUIRES_CONFIRM.has("stop")).toBe(true);
  });

  // 7a-panel-10
  it("START action does NOT require confirmation (safe — only activates)", () => {
    expect(REQUIRES_CONFIRM.has("start")).toBe(false);
  });

  // 7a-panel-11
  it("RESTART action does NOT require confirmation (safe — reset, no data loss)", () => {
    expect(REQUIRES_CONFIRM.has("restart")).toBe(false);
  });

  // 7a-panel-12
  it("PAUSE action does NOT require confirmation (safe — task is preserved)", () => {
    expect(REQUIRES_CONFIRM.has("pause")).toBe(false);
  });
});

// ── 3. Action × Status matrix — no impossible button states ─────────────────

describe("Sub-AC 7.1 — Action × Status invariants", () => {

  // 7a-panel-13
  it("START is never available for already-active agents (start guard)", () => {
    for (const status of ["active", "busy", "idle", "error"]) {
      const actions = getAvailableActions(status);
      expect(actions, `START should not be available for status=${status}`)
        .not.toContain("start");
    }
  });

  // 7a-panel-14
  it("STOP is never available for already-terminated agents (stop guard)", () => {
    const actions = getAvailableActions("terminated");
    expect(actions).not.toContain("stop");
  });

  // 7a-panel-15
  it("PAUSE is only available for running agents (active or busy)", () => {
    const pauseableStatuses = ["active", "busy"];
    const nonPauseableStatuses = ["inactive", "idle", "error", "terminated"];

    for (const status of pauseableStatuses) {
      expect(getAvailableActions(status), `PAUSE should be available for ${status}`)
        .toContain("pause");
    }
    for (const status of nonPauseableStatuses) {
      expect(getAvailableActions(status), `PAUSE should NOT be available for ${status}`)
        .not.toContain("pause");
    }
  });

  // 7a-panel-16
  it("inactive and terminated agents get exactly one action (START)", () => {
    expect(getAvailableActions("inactive")).toHaveLength(1);
    expect(getAvailableActions("terminated")).toHaveLength(1);
  });

  // 7a-panel-17
  it("active and busy agents always have 3 lifecycle options", () => {
    expect(getAvailableActions("active")).toHaveLength(3);
    expect(getAvailableActions("busy")).toHaveLength(3);
  });

  // 7a-panel-18
  it("START and STOP are never both available at the same time", () => {
    const allStatuses = ["inactive", "idle", "active", "busy", "error", "terminated"];
    for (const status of allStatuses) {
      const actions = getAvailableActions(status);
      const hasStart = actions.includes("start");
      const hasStop = actions.includes("stop");
      expect(hasStart && hasStop,
        `START and STOP should never coexist for status=${status}`
      ).toBe(false);
    }
  });
});
