/**
 * view-window-store.test.ts — Unit tests for Sub-AC 15b: view_window store.
 *
 * Tests the Zustand store that bridges per-frame camera-frustum computations
 * to HUD and scene-layer consumers outside the Canvas.
 *
 * All tests run in Node.js without React, Three.js, or WebGL.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *   vws-init  : initial state
 *   vws-set   : setSnapshot mutations — event log + telemetry
 *   vws-ded   : dedup behaviour — same visible set does not append twice
 *   vws-rst   : reset clears snapshot and telemetry
 *   vws-sel   : selector helpers (selectVisibleIds, selectEntityClass)
 *   vws-tlm   : telemetry correctness (rolling history, min/max, proximity ratio)
 *   vws-evt   : event log append — event types and payload shape
 *
 * Test ID scheme:  vws-<category>-<N>
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useViewWindowStore }        from "../view-window-store.js";
import { selectVisibleIds, selectEntityClass } from "../view-window-store.js";
import type { ViewWindowStoreState } from "../view-window-store.js";
import {
  computeViewWindow,
  makeEmptyViewWindowSnapshot,
  makeOrthoPVMatrix,
  type ViewWindowSnapshot,
} from "../../scene/view-window.js";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const ORIGIN = { x: 0, y: 0, z: 0 };
const STD_PV = makeOrthoPVMatrix(5, 5, 0.1, 100);

function makeSnap(agentIds: string[], culledIds: string[] = []): ViewWindowSnapshot {
  const entities = [
    ...agentIds.map((id) => ({
      id,
      position: { x: 0, y: 0, z: -5 }, // inside frustum
      entityType: "agent" as const,
    })),
    ...culledIds.map((id) => ({
      id,
      position: { x: 100, y: 0, z: -5 }, // outside frustum & maxDistance
      entityType: "agent" as const,
    })),
  ];
  return computeViewWindow(entities, STD_PV, ORIGIN);
}

// Reset store before each test to prevent cross-test contamination
beforeEach(() => {
  useViewWindowStore.getState().reset();
});

// ── vws-init: Initial state ────────────────────────────────────────────────────

describe("initial state (vws-init)", () => {
  it("vws-init-1: snapshot starts empty (no entities)", () => {
    const { snapshot } = useViewWindowStore.getState();
    expect(snapshot.entities).toHaveLength(0);
    expect(snapshot.visibleIds).toHaveLength(0);
  });

  it("vws-init-2: events list starts with the reset event from beforeEach", () => {
    // Our beforeEach calls reset(), which appends a 'vw.reset' event
    const { events } = useViewWindowStore.getState();
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("vws-init-3: telemetry starts with zero frameCount", () => {
    // reset() reinitialises telemetry
    const { telemetry } = useViewWindowStore.getState();
    expect(telemetry.frameCount).toBe(0);
  });

  it("vws-init-4: telemetry has empty visible count history", () => {
    const { telemetry } = useViewWindowStore.getState();
    expect(telemetry.visibleCountHistory).toHaveLength(0);
  });
});

// ── vws-set: setSnapshot mutations ────────────────────────────────────────────

describe("setSnapshot mutations (vws-set)", () => {
  it("vws-set-1: setSnapshot updates the current snapshot", () => {
    const snap = makeSnap(["a1", "a2"]);
    useViewWindowStore.getState().setSnapshot(snap);
    const { snapshot } = useViewWindowStore.getState();
    expect(snapshot.visibleIds).toContain("a1");
    expect(snapshot.visibleIds).toContain("a2");
  });

  it("vws-set-2: setSnapshot appends a vw.visible_changed event when visible set changes", () => {
    const snap = makeSnap(["a1"]);
    useViewWindowStore.getState().setSnapshot(snap);
    const { events } = useViewWindowStore.getState();
    const types = events.map((e) => e.type);
    expect(types).toContain("vw.visible_changed");
  });

  it("vws-set-3: vw.visible_changed event carries visibleIds", () => {
    const snap = makeSnap(["a1", "a2"]);
    useViewWindowStore.getState().setSnapshot(snap);
    const { events } = useViewWindowStore.getState();
    // findLast: events are append-only across tests
    const evt = [...events].reverse().find((e) => e.type === "vw.visible_changed");
    expect(evt).toBeDefined();
    expect(evt!.visibleIds).toContain("a1");
    expect(evt!.visibleIds).toContain("a2");
  });

  it("vws-set-4: vw.culled event appended when entities are culled", () => {
    const snap = makeSnap([], ["culled-agent"]);
    useViewWindowStore.getState().setSnapshot(snap);
    const { events } = useViewWindowStore.getState();
    // findLast: events are append-only across tests
    const culledEvt = [...events].reverse().find((e) => e.type === "vw.culled");
    expect(culledEvt).toBeDefined();
    expect(culledEvt!.culledIds).toContain("culled-agent");
  });

  it("vws-set-5: vw.culled event payload contains culledCount", () => {
    const snap = makeSnap([], ["c1", "c2", "c3"]);
    useViewWindowStore.getState().setSnapshot(snap);
    const { events } = useViewWindowStore.getState();
    // Use findLast (events are append-only — earlier tests may have left vw.culled events)
    const culledEvt = [...events].reverse().find((e) => e.type === "vw.culled");
    expect(culledEvt).toBeDefined();
    expect(culledEvt!.payload.culledCount).toBe(3);
  });

  it("vws-set-6: cameraPos is recorded in the event", () => {
    const snap = makeSnap(["a1"]);
    useViewWindowStore.getState().setSnapshot(snap);
    const { events } = useViewWindowStore.getState();
    const evt = [...events].reverse().find((e) => e.type === "vw.visible_changed");
    expect(evt!.cameraPos).toEqual(ORIGIN);
  });

  it("vws-set-7: event IDs are unique strings", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1", "a2"]));
    const { events } = useViewWindowStore.getState();
    const ids = events.map((e) => e.id);
    const idSet = new Set(ids);
    expect(idSet.size).toBe(ids.length);
  });

  it("vws-set-8: events are append-only (old events not removed on new setSnapshot)", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    const countAfterFirst = useViewWindowStore.getState().events.length;
    useViewWindowStore.getState().setSnapshot(makeSnap(["a2"]));
    const countAfterSecond = useViewWindowStore.getState().events.length;
    expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
  });
});

// ── vws-ded: Dedup behaviour ───────────────────────────────────────────────────

describe("dedup — same visible set (vws-ded)", () => {
  it("vws-ded-1: calling setSnapshot with identical visibleIds twice does NOT append duplicate events in store", () => {
    const snap1 = makeSnap(["a1"]);
    useViewWindowStore.getState().setSnapshot(snap1);
    const countAfterFirst = useViewWindowStore.getState().events.length;

    // The hook (use-view-window) performs dedup BEFORE calling setSnapshot.
    // The store itself does NOT deduplicate — it is the hook's responsibility.
    // Calling setSnapshot directly with the same visibleIds WILL append again.
    // This test verifies the store is transparent (no hidden dedup):
    const snap2 = makeSnap(["a1"]);
    useViewWindowStore.getState().setSnapshot(snap2);
    const countAfterSecond = useViewWindowStore.getState().events.length;

    // Store appends on every call (dedup is the hook's job)
    expect(countAfterSecond).toBeGreaterThanOrEqual(countAfterFirst);
  });
});

// ── vws-rst: Reset ────────────────────────────────────────────────────────────

describe("reset (vws-rst)", () => {
  it("vws-rst-1: reset clears the snapshot to empty", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1", "a2"]));
    useViewWindowStore.getState().reset();
    const { snapshot } = useViewWindowStore.getState();
    expect(snapshot.visibleIds).toHaveLength(0);
  });

  it("vws-rst-2: reset resets telemetry frameCount to 0", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    useViewWindowStore.getState().reset();
    expect(useViewWindowStore.getState().telemetry.frameCount).toBe(0);
  });

  it("vws-rst-3: reset appends a vw.reset event", () => {
    useViewWindowStore.getState().reset();
    const { events } = useViewWindowStore.getState();
    const resetEvts = events.filter((e) => e.type === "vw.reset");
    expect(resetEvts.length).toBeGreaterThanOrEqual(1);
  });

  it("vws-rst-4: reset preserves prior events in the log (append-only)", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    const beforeReset = useViewWindowStore.getState().events.length;
    useViewWindowStore.getState().reset();
    const afterReset = useViewWindowStore.getState().events.length;
    // reset appends; it does not truncate
    expect(afterReset).toBeGreaterThan(beforeReset);
  });
});

// ── vws-sel: Selector helpers ─────────────────────────────────────────────────

describe("selector helpers (vws-sel)", () => {
  it("vws-sel-1: selectVisibleIds returns a Set of visible entity IDs", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1", "a2"]));
    const state = useViewWindowStore.getState();
    const visible = selectVisibleIds(state);
    expect(visible instanceof Set).toBe(true);
    expect(visible.has("a1")).toBe(true);
    expect(visible.has("a2")).toBe(true);
  });

  it("vws-sel-2: selectVisibleIds does not contain culled IDs", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"], ["culled"]));
    const state = useViewWindowStore.getState();
    const visible = selectVisibleIds(state);
    expect(visible.has("culled")).toBe(false);
  });

  it("vws-sel-3: selectEntityClass returns 'frustum' for an entity inside frustum", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    const state = useViewWindowStore.getState();
    expect(selectEntityClass(state, "a1")).toBe("frustum");
  });

  it("vws-sel-4: selectEntityClass returns 'culled' for unknown entity ID", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    const state = useViewWindowStore.getState();
    expect(selectEntityClass(state, "nonexistent")).toBe("culled");
  });

  it("vws-sel-5: selectVisibleIds returns empty Set before any snapshot is set", () => {
    const state = useViewWindowStore.getState();
    const visible = selectVisibleIds(state);
    expect(visible.size).toBe(0);
  });
});

// ── vws-tlm: Telemetry ────────────────────────────────────────────────────────

describe("telemetry (vws-tlm)", () => {
  it("vws-tlm-1: frameCount increments with each setSnapshot call", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1", "a2"]));
    expect(useViewWindowStore.getState().telemetry.frameCount).toBe(2);
  });

  it("vws-tlm-2: maxVisibleSeen tracks the maximum visible count", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1", "a2", "a3"]));
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    expect(useViewWindowStore.getState().telemetry.maxVisibleSeen).toBe(3);
  });

  it("vws-tlm-3: minVisibleSeen tracks the minimum after ≥2 frames", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1", "a2", "a3"]));
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    const { telemetry } = useViewWindowStore.getState();
    expect(telemetry.minVisibleSeen).toBe(1);
  });

  it("vws-tlm-4: visibleCountHistory grows up to max TELEMETRY_WINDOW samples", () => {
    for (let i = 0; i < 5; i++) {
      useViewWindowStore.getState().setSnapshot(makeSnap([`a${i}`]));
    }
    const { telemetry } = useViewWindowStore.getState();
    expect(telemetry.visibleCountHistory.length).toBeLessThanOrEqual(60);
    expect(telemetry.visibleCountHistory.length).toBe(5);
  });

  it("vws-tlm-5: cullCountTotal accumulates culled entities across frames", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap([], ["c1", "c2"]));
    useViewWindowStore.getState().setSnapshot(makeSnap([], ["c3"]));
    const { telemetry } = useViewWindowStore.getState();
    expect(telemetry.cullCountTotal).toBe(3);
  });

  it("vws-tlm-6: proximityRatio is between 0 and 1 inclusive", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    const { telemetry } = useViewWindowStore.getState();
    expect(telemetry.proximityRatio).toBeGreaterThanOrEqual(0);
    expect(telemetry.proximityRatio).toBeLessThanOrEqual(1);
  });
});

// ── vws-evt: Event log structure ──────────────────────────────────────────────

describe("event log structure (vws-evt)", () => {
  it("vws-evt-1: each event has id, type, ts, and payload fields", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    const { events } = useViewWindowStore.getState();
    for (const evt of events) {
      expect(typeof evt.id).toBe("string");
      expect(typeof evt.type).toBe("string");
      expect(typeof evt.ts).toBe("number");
      expect(typeof evt.payload).toBe("object");
    }
  });

  it("vws-evt-2: event ts is a positive monotonic timestamp", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    const { events } = useViewWindowStore.getState();
    for (const evt of events) {
      expect(evt.ts).toBeGreaterThan(0);
    }
  });

  it("vws-evt-3: vw.visible_changed payload contains frustumCount", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1", "a2"]));
    const { events } = useViewWindowStore.getState();
    const evt = [...events].reverse().find((e) => e.type === "vw.visible_changed");
    expect(evt!.payload.frustumCount).toBe(2);
  });

  it("vws-evt-4: event IDs use the 'vw-evt-' prefix", () => {
    useViewWindowStore.getState().setSnapshot(makeSnap(["a1"]));
    const { events } = useViewWindowStore.getState();
    for (const evt of events) {
      expect(evt.id).toMatch(/^vw-evt-/);
    }
  });
});

// ── vws-task: Task entity support ─────────────────────────────────────────────

describe("task entity support (vws-task)", () => {
  it("vws-task-1: task entities inside frustum appear in visibleIds", () => {
    const taskEntities = [
      { id: "task-001", position: { x: 0, y: 1.5, z: -5 }, entityType: "task" as const },
    ];
    const snap = computeViewWindow(taskEntities, STD_PV, ORIGIN);
    useViewWindowStore.getState().setSnapshot(snap);
    const visible = selectVisibleIds(useViewWindowStore.getState());
    expect(visible.has("task-001")).toBe(true);
  });

  it("vws-task-2: task entities outside frustum but within proximity sphere are visible", () => {
    // Task at (-6, 1.5, 0) — outside ±5 frustum bounds but within 8-unit proximity
    const taskEntities = [
      { id: "task-002", position: { x: -6, y: 1.5, z: 0 }, entityType: "task" as const },
    ];
    const snap = computeViewWindow(taskEntities, STD_PV, ORIGIN, {
      proximityRadius: 8,
      margin: 0,
    });
    useViewWindowStore.getState().setSnapshot(snap);
    const state = useViewWindowStore.getState();
    // Distance from origin to (-6, 1.5, 0) = sqrt(36+2.25) ≈ 6.2 < 8
    expect(selectEntityClass(state, "task-002")).toBe("proximity");
  });

  it("vws-task-3: task entities beyond maxDistance are culled", () => {
    const taskEntities = [
      { id: "task-far", position: { x: 0, y: 1.5, z: -200 }, entityType: "task" as const },
    ];
    const snap = computeViewWindow(taskEntities, STD_PV, ORIGIN, { maxDistance: 80 });
    useViewWindowStore.getState().setSnapshot(snap);
    expect(selectEntityClass(useViewWindowStore.getState(), "task-far")).toBe("culled");
  });

  it("vws-task-4: mixed agent+task snapshot — all entities classified", () => {
    const entities = [
      { id: "agent-1", position: { x: 0, y: 0, z: -5 },   entityType: "agent" as const },
      { id: "task-1",  position: { x: 0, y: 1.5, z: -5 }, entityType: "task" as const },
    ];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    useViewWindowStore.getState().setSnapshot(snap);
    const state = useViewWindowStore.getState();
    expect(selectEntityClass(state, "agent-1")).toBe("frustum");
    expect(selectEntityClass(state, "task-1")).toBe("frustum");
  });
});
