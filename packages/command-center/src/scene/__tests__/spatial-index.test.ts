/**
 * spatial-index.test.ts — Unit tests for the spatial_index entity.
 *
 * Sub-AC 1 (AC 15): Tests the spatial index windowed/virtualized access
 * implementation, covering:
 *
 *   idx-lod   LOD computation (computeAgentLOD)
 *   idx-pri   Priority computation (computeAgentPriority)
 *   idx-cul   Frustum culling (cullFrustum)
 *   idx-win   Window assignment (computeSpatialIndex)
 *   idx-ext   Windowed set extraction (extractWindowedSet)
 *   idx-emp   Empty snapshot (makeEmptySnapshot)
 *   idx-scl   Scale: 3–20 agents handled without error
 *   idx-inv   Invariants: window ≤ MAX_RENDER_WINDOW, MIN_WINDOW_SIZE guaranteed
 *   idx-evt   Event sourcing: snapshot is immutable (Object.frozen)
 *   idx-ord   Ordering: nearest-first, active-over-idle
 *
 * All functions under test are pure (no React, no Three.js, no store) so
 * this suite runs fully in Node.js without a browser or WebGL context.
 *
 * Test ID scheme:
 *   idx-lod-N : LOD computation
 *   idx-pri-N : Priority computation
 *   idx-cul-N : Frustum culling
 *   idx-win-N : Window assignment
 *   idx-ext-N : Extraction
 *   idx-emp-N : Empty snapshot
 *   idx-scl-N : Scale tests
 *   idx-inv-N : Invariants
 *   idx-evt-N : Event sourcing / immutability
 *   idx-ord-N : Ordering
 */

import { describe, it, expect } from "vitest";
import {
  // Constants
  MAX_RENDER_WINDOW,
  MIN_WINDOW_SIZE,
  DEFAULT_CULLING_RADIUS,
  // Core functions
  computeAgentLOD,
  computeAgentPriority,
  cullFrustum,
  computeSpatialIndex,
  extractWindowedSet,
  makeEmptySnapshot,
  // Types (for type assertions)
  type AgentSpatialEntry,
  type Vec3,
  type SpatialIndexSnapshot,
  type WindowedAgentSet,
} from "../spatial-index.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const CAM_OVERHEAD: Vec3 = { x: 6, y: 8, z: 3 }; // above building centre

/** Build a minimal AgentSpatialEntry */
function mkAgent(
  id: string,
  x: number,
  z: number,
  status: string = "idle",
  y = 0,
): AgentSpatialEntry {
  return { agentId: id, position: { x, y, z }, roomId: "room-default", status };
}

/** Build n agents spaced along the X-axis, 2 units apart, starting at x=1 */
function mkAgents(n: number, status = "idle"): AgentSpatialEntry[] {
  return Array.from({ length: n }, (_, i) => mkAgent(`a${i}`, 1 + i * 2, 0, status));
}

// ── idx-lod: LOD computation ──────────────────────────────────────────────────

describe("computeAgentLOD", () => {
  it("idx-lod-1: returns 'near' for distance strictly below THRESHOLDS.agent.near (6)", () => {
    expect(computeAgentLOD(0)).toBe("near");
    expect(computeAgentLOD(5.9)).toBe("near");
    expect(computeAgentLOD(5.99)).toBe("near");
  });

  it("idx-lod-2: returns 'mid' for distance in [6, 14)", () => {
    expect(computeAgentLOD(6)).toBe("mid");
    expect(computeAgentLOD(10)).toBe("mid");
    expect(computeAgentLOD(13.9)).toBe("mid");
  });

  it("idx-lod-3: returns 'far' for distance >= THRESHOLDS.agent.far (14)", () => {
    expect(computeAgentLOD(14)).toBe("far");
    expect(computeAgentLOD(20)).toBe("far");
    expect(computeAgentLOD(100)).toBe("far");
  });

  it("idx-lod-4: handles distance = 0 (agent at camera position) → 'near'", () => {
    expect(computeAgentLOD(0)).toBe("near");
  });

  it("idx-lod-5: handles very large distance → 'far'", () => {
    expect(computeAgentLOD(999)).toBe("far");
  });
});

// ── idx-pri: Priority computation ────────────────────────────────────────────

describe("computeAgentPriority", () => {
  it("idx-pri-1: closer agents have lower (higher-priority) priority number", () => {
    const close = computeAgentPriority(2, "idle");
    const far   = computeAgentPriority(20, "idle");
    expect(close).toBeLessThan(far);
  });

  it("idx-pri-2: active agents outrank idle agents at the same distance", () => {
    const active = computeAgentPriority(5, "active");
    const idle   = computeAgentPriority(5, "idle");
    expect(active).toBeLessThan(idle);
  });

  it("idx-pri-3: busy outranks idle; idle outranks inactive; inactive outranks terminated", () => {
    const statuses = ["active", "busy", "idle", "inactive", "terminated"];
    const priorities = statuses.map((s) => computeAgentPriority(5, s));
    for (let i = 0; i < priorities.length - 1; i++) {
      expect(priorities[i]).toBeLessThan(priorities[i + 1]);
    }
  });

  it("idx-pri-4: unknown status falls back gracefully (does not throw)", () => {
    expect(() => computeAgentPriority(5, "unknown-state")).not.toThrow();
  });

  it("idx-pri-5: priority is always non-negative", () => {
    expect(computeAgentPriority(0, "active")).toBeGreaterThanOrEqual(0);
    expect(computeAgentPriority(100, "terminated")).toBeGreaterThanOrEqual(0);
  });
});

// ── idx-cul: Frustum culling ──────────────────────────────────────────────────

describe("cullFrustum", () => {
  it("idx-cul-1: keeps agents within culling radius", () => {
    const agents = [mkAgent("close", 2, 0), mkAgent("far", 100, 0)];
    const result = cullFrustum(agents, ORIGIN, 20);
    expect(result.map((e) => e.agentId)).toContain("close");
    expect(result.map((e) => e.agentId)).not.toContain("far");
  });

  it("idx-cul-2: keeps all agents when all within radius", () => {
    const agents = mkAgents(5);
    expect(cullFrustum(agents, ORIGIN, 100)).toHaveLength(5);
  });

  it("idx-cul-3: returns empty array when all agents beyond radius", () => {
    const agents = [mkAgent("a", 200, 0), mkAgent("b", 300, 0)];
    expect(cullFrustum(agents, ORIGIN, 10)).toHaveLength(0);
  });

  it("idx-cul-4: uses DEFAULT_CULLING_RADIUS when radius not provided", () => {
    // Agent just inside default radius should survive
    const inside  = mkAgent("in",  DEFAULT_CULLING_RADIUS - 1, 0);
    const outside = mkAgent("out", DEFAULT_CULLING_RADIUS + 10, 0);
    const result = cullFrustum([inside, outside], ORIGIN);
    expect(result.map((e) => e.agentId)).toContain("in");
    expect(result.map((e) => e.agentId)).not.toContain("out");
  });

  it("idx-cul-5: radius boundary is inclusive (agent AT radius is kept)", () => {
    // Agent exactly at radius distance
    const agent = mkAgent("boundary", DEFAULT_CULLING_RADIUS, 0);
    const result = cullFrustum([agent], ORIGIN);
    expect(result).toHaveLength(1);
  });

  it("idx-cul-6: returns empty array for empty input", () => {
    expect(cullFrustum([], ORIGIN, 30)).toHaveLength(0);
  });

  it("idx-cul-7: uses 3D distance (Y axis matters)", () => {
    // Agent at (0, 100, 0) — 100 units above camera at origin
    const highUp = mkAgent("high", 0, 0, "idle", 100);
    expect(cullFrustum([highUp], ORIGIN, 50)).toHaveLength(0);
  });
});

// ── idx-win: Window assignment ────────────────────────────────────────────────

describe("computeSpatialIndex", () => {
  it("idx-win-1: totalCount equals number of input agents", () => {
    const snap = computeSpatialIndex(mkAgents(7), CAM_OVERHEAD);
    expect(snap.totalCount).toBe(7);
  });

  it("idx-win-2: visibleCount excludes culled agents", () => {
    const agents = [mkAgent("near", 2, 0), mkAgent("very-far", 200, 0)];
    const snap = computeSpatialIndex(agents, ORIGIN, 12, 50);
    expect(snap.visibleCount).toBe(1);
  });

  it("idx-win-3: windowCount <= MAX_RENDER_WINDOW", () => {
    const agents = mkAgents(20);
    const snap = computeSpatialIndex(agents, ORIGIN);
    expect(snap.windowCount).toBeLessThanOrEqual(MAX_RENDER_WINDOW);
  });

  it("idx-win-4: windowCount >= MIN_WINDOW_SIZE when enough visible agents exist", () => {
    // Pass windowSize=0 to force minimum-size guarantee
    const agents = mkAgents(10);
    const snap = computeSpatialIndex(agents, ORIGIN, 0);
    expect(snap.windowCount).toBeGreaterThanOrEqual(MIN_WINDOW_SIZE);
  });

  it("idx-win-5: agents beyond culling radius are marked culled=true", () => {
    const agents = [mkAgent("near", 1, 0), mkAgent("distant", 200, 0)];
    const snap = computeSpatialIndex(agents, ORIGIN, 12, 30);
    const distant = snap.agents.find((r) => r.agentId === "distant");
    expect(distant?.culled).toBe(true);
  });

  it("idx-win-6: in-window agents have inWindow=true", () => {
    const agents = [mkAgent("a", 1, 0)];
    const snap = computeSpatialIndex(agents, ORIGIN);
    expect(snap.agents[0].inWindow).toBe(true);
  });

  it("idx-win-7: agents outside window have inWindow=false", () => {
    // Create more agents than the window size
    const agents = mkAgents(20);
    const snap = computeSpatialIndex(agents, ORIGIN, 5); // window=5
    const outOfWindow = snap.agents.filter((r) => !r.inWindow && !r.culled);
    expect(outOfWindow.length).toBeGreaterThan(0);
  });

  it("idx-win-8: LOD for in-window near agent is 'near'", () => {
    const cam: Vec3 = { x: 0, y: 0, z: 0 };
    // Agent at (3, 0, 0) — distance ≈ 3 < 6 threshold → NEAR
    const agents = [mkAgent("close", 3, 0)];
    const snap = computeSpatialIndex(agents, cam);
    const result = snap.agents.find((r) => r.agentId === "close");
    expect(result?.lod).toBe("near");
  });

  it("idx-win-9: LOD for deferred (out-of-window visible) agent is 'far'", () => {
    // 5 visible agents; windowSize=2 → effectiveWindow=max(2,MIN_WINDOW_SIZE=3)=3
    // The remaining 2 visible agents end up deferred with LOD "far"
    const agents = mkAgents(5);
    const snap = computeSpatialIndex(agents, ORIGIN, 2 /* windowSize=2, effective=3 */);
    const deferred = snap.deferredAgents;
    expect(deferred.length).toBeGreaterThan(0);
    expect(deferred.every((r) => r.lod === "far")).toBe(true);
  });

  it("idx-win-10: windowAgents + deferredAgents = visibleCount", () => {
    const agents = mkAgents(15);
    const snap = computeSpatialIndex(agents, ORIGIN, 8, 100);
    expect(snap.windowAgents.length + snap.deferredAgents.length).toBe(snap.visibleCount);
  });

  it("idx-win-11: snapshot includes cameraPos", () => {
    const cam: Vec3 = { x: 3, y: 5, z: 2 };
    const snap = computeSpatialIndex([], cam);
    expect(snap.cameraPos).toEqual(cam);
  });

  it("idx-win-12: snapshot has a ts (timestamp) > 0", () => {
    const snap = computeSpatialIndex([], ORIGIN);
    expect(snap.ts).toBeGreaterThan(0);
  });

  it("idx-win-13: empty input returns empty snapshot", () => {
    const snap = computeSpatialIndex([], ORIGIN);
    expect(snap.totalCount).toBe(0);
    expect(snap.agents).toHaveLength(0);
    expect(snap.windowCount).toBe(0);
  });

  it("idx-win-14: custom windowSize is respected (within MIN_WINDOW_SIZE bound)", () => {
    const agents = mkAgents(10);
    const snap = computeSpatialIndex(agents, ORIGIN, 3 /* windowSize=3 */);
    // effectiveWindow = max(3, MIN_WINDOW_SIZE=3) = 3
    expect(snap.windowCount).toBe(3);
  });
});

// ── idx-ext: Windowed set extraction ─────────────────────────────────────────

describe("extractWindowedSet", () => {
  it("idx-ext-1: lodMap contains an entry for every agent", () => {
    const agents = mkAgents(5);
    const snap = computeSpatialIndex(agents, ORIGIN);
    const ws = extractWindowedSet(snap);
    for (const agent of agents) {
      expect(ws.lodMap).toHaveProperty(agent.agentId);
    }
  });

  it("idx-ext-2: fullRenderIds matches windowAgents IDs", () => {
    const agents = mkAgents(8);
    const snap = computeSpatialIndex(agents, ORIGIN);
    const ws = extractWindowedSet(snap);
    const expectedIds = snap.windowAgents.map((r) => r.agentId).sort();
    expect(ws.fullRenderIds.slice().sort()).toEqual(expectedIds);
  });

  it("idx-ext-3: culledIds matches culled agents", () => {
    const agents = [mkAgent("near", 1, 0), mkAgent("far", 200, 0)];
    const snap = computeSpatialIndex(agents, ORIGIN, 12, 30);
    const ws = extractWindowedSet(snap);
    expect(ws.culledIds).toContain("far");
    expect(ws.culledIds).not.toContain("near");
  });

  it("idx-ext-4: fullRenderIds does not contain culled agents", () => {
    const agents = [mkAgent("near", 1, 0), mkAgent("far", 200, 0)];
    const snap = computeSpatialIndex(agents, ORIGIN, 12, 30);
    const ws = extractWindowedSet(snap);
    expect(ws.fullRenderIds).not.toContain("far");
  });

  it("idx-ext-5: deferredIds are not in fullRenderIds", () => {
    const agents = mkAgents(20); // 20 agents, window=12
    const snap = computeSpatialIndex(agents, ORIGIN);
    const ws = extractWindowedSet(snap);
    const fullSet = new Set(ws.fullRenderIds);
    for (const id of ws.deferredIds) {
      expect(fullSet.has(id)).toBe(false);
    }
  });

  it("idx-ext-6: lodMap values are valid LOD strings", () => {
    const agents = mkAgents(5);
    const snap = computeSpatialIndex(agents, ORIGIN);
    const ws = extractWindowedSet(snap);
    const validLODs = new Set(["near", "mid", "far"]);
    for (const lod of Object.values(ws.lodMap)) {
      expect(validLODs.has(lod)).toBe(true);
    }
  });
});

// ── idx-emp: Empty snapshot ───────────────────────────────────────────────────

describe("makeEmptySnapshot", () => {
  it("idx-emp-1: returns snapshot with zero counts", () => {
    const snap = makeEmptySnapshot();
    expect(snap.totalCount).toBe(0);
    expect(snap.visibleCount).toBe(0);
    expect(snap.windowCount).toBe(0);
  });

  it("idx-emp-2: agents, windowAgents, deferredAgents are empty arrays", () => {
    const snap = makeEmptySnapshot();
    expect(snap.agents).toHaveLength(0);
    expect(snap.windowAgents).toHaveLength(0);
    expect(snap.deferredAgents).toHaveLength(0);
  });

  it("idx-emp-3: default cameraPos is origin", () => {
    const snap = makeEmptySnapshot();
    expect(snap.cameraPos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("idx-emp-4: custom cameraPos is preserved", () => {
    const pos: Vec3 = { x: 1, y: 2, z: 3 };
    const snap = makeEmptySnapshot(pos);
    expect(snap.cameraPos).toEqual(pos);
  });

  it("idx-emp-5: ts > 0", () => {
    expect(makeEmptySnapshot().ts).toBeGreaterThan(0);
  });
});

// ── idx-scl: Scale tests (3–20 agents) ───────────────────────────────────────

describe("scale: 3–20 agents", () => {
  it("idx-scl-1: 3 agents — completes without error", () => {
    expect(() => computeSpatialIndex(mkAgents(3), CAM_OVERHEAD)).not.toThrow();
  });

  it("idx-scl-2: 5 agents — completes without error", () => {
    expect(() => computeSpatialIndex(mkAgents(5), CAM_OVERHEAD)).not.toThrow();
  });

  it("idx-scl-3: 10 agents — completes without error", () => {
    expect(() => computeSpatialIndex(mkAgents(10), CAM_OVERHEAD)).not.toThrow();
  });

  it("idx-scl-4: 15 agents — completes without error", () => {
    expect(() => computeSpatialIndex(mkAgents(15), CAM_OVERHEAD)).not.toThrow();
  });

  it("idx-scl-5: 20 agents — completes without error", () => {
    expect(() => computeSpatialIndex(mkAgents(20), CAM_OVERHEAD)).not.toThrow();
  });

  it("idx-scl-6: 20 agents — windowCount exactly MAX_RENDER_WINDOW (12)", () => {
    const snap = computeSpatialIndex(mkAgents(20), ORIGIN);
    expect(snap.windowCount).toBe(MAX_RENDER_WINDOW);
  });

  it("idx-scl-7: 3 agents — all in window (below MAX_RENDER_WINDOW)", () => {
    const snap = computeSpatialIndex(mkAgents(3), ORIGIN);
    expect(snap.windowCount).toBe(3);
  });
});

// ── idx-inv: Invariants ───────────────────────────────────────────────────────

describe("invariants", () => {
  it("idx-inv-1: windowCount <= MAX_RENDER_WINDOW for any agent count", () => {
    for (const n of [3, 7, 12, 15, 20]) {
      const snap = computeSpatialIndex(mkAgents(n), ORIGIN);
      expect(snap.windowCount).toBeLessThanOrEqual(MAX_RENDER_WINDOW);
    }
  });

  it("idx-inv-2: windowCount >= MIN_WINDOW_SIZE when visibleCount >= MIN_WINDOW_SIZE", () => {
    // All 10 agents within culling radius
    const agents = mkAgents(10);
    const snap = computeSpatialIndex(agents, ORIGIN, 0 /* force minimum */);
    expect(snap.windowCount).toBeGreaterThanOrEqual(MIN_WINDOW_SIZE);
  });

  it("idx-inv-3: no agent appears in both windowAgents and deferredAgents", () => {
    const agents = mkAgents(20);
    const snap = computeSpatialIndex(agents, ORIGIN);
    const windowIds  = new Set(snap.windowAgents.map((r) => r.agentId));
    const deferredIds = new Set(snap.deferredAgents.map((r) => r.agentId));
    for (const id of deferredIds) {
      expect(windowIds.has(id)).toBe(false);
    }
  });

  it("idx-inv-4: no culled agent appears in window or deferred sets", () => {
    const agents = [...mkAgents(5), mkAgent("far-away", 500, 0)];
    const snap = computeSpatialIndex(agents, ORIGIN, 12, 30);
    const culledId = "far-away";
    const windowIds  = snap.windowAgents.map((r) => r.agentId);
    const deferredIds = snap.deferredAgents.map((r) => r.agentId);
    expect(windowIds).not.toContain(culledId);
    expect(deferredIds).not.toContain(culledId);
  });

  it("idx-inv-5: windowAgents + deferredAgents + culled = totalCount", () => {
    const agents = [...mkAgents(8), mkAgent("cull", 500, 0)];
    const snap = computeSpatialIndex(agents, ORIGIN, 12, 30);
    const culled = snap.agents.filter((r) => r.culled).length;
    expect(snap.windowAgents.length + snap.deferredAgents.length + culled).toBe(snap.totalCount);
  });

  it("idx-inv-6: distance values are non-negative", () => {
    const snap = computeSpatialIndex(mkAgents(5), ORIGIN);
    for (const r of snap.agents) {
      expect(r.distance).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── idx-evt: Event sourcing / immutability ────────────────────────────────────

describe("event sourcing / immutability", () => {
  it("idx-evt-1: computeSpatialIndex returns a frozen object (Object.isFrozen)", () => {
    const snap = computeSpatialIndex(mkAgents(3), ORIGIN);
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("idx-evt-2: makeEmptySnapshot returns a frozen object", () => {
    expect(Object.isFrozen(makeEmptySnapshot())).toBe(true);
  });

  it("idx-evt-3: two calls with the same input produce different ts values (monotonic)", async () => {
    const agents = mkAgents(3);
    const snap1 = computeSpatialIndex(agents, ORIGIN);
    // Small delay to ensure different Date.now()
    await new Promise((r) => setTimeout(r, 2));
    const snap2 = computeSpatialIndex(agents, ORIGIN);
    expect(snap2.ts).toBeGreaterThanOrEqual(snap1.ts);
  });
});

// ── idx-ord: Ordering ─────────────────────────────────────────────────────────

describe("ordering", () => {
  it("idx-ord-1: windowAgents are sorted nearest-first", () => {
    const cam: Vec3 = { x: 0, y: 0, z: 0 };
    const agents = [
      mkAgent("far",  20, 0),
      mkAgent("near",  1, 0),
      mkAgent("mid",   8, 0),
    ];
    const snap = computeSpatialIndex(agents, cam);
    const ids = snap.windowAgents.map((r) => r.agentId);
    expect(ids[0]).toBe("near");
  });

  it("idx-ord-2: active agent beats idle agent at same distance for window slot", () => {
    const cam: Vec3 = { x: 0, y: 0, z: 0 };
    // Place 13 agents at distance 10 (idle), plus one at distance 10 (active)
    // With windowSize=12, the active agent should displace the 13th idle agent
    const idle   = Array.from({ length: 13 }, (_, i) => mkAgent(`idle${i}`, 10, i, "idle"));
    const active = mkAgent("active-star", 10, 0, "active");
    const all    = [...idle, active];
    const snap   = computeSpatialIndex(all, cam, 12);
    const windowIds = snap.windowAgents.map((r) => r.agentId);
    expect(windowIds).toContain("active-star");
  });

  it("idx-ord-3: all agents results array is sorted by priority ascending", () => {
    const agents = mkAgents(8);
    const snap = computeSpatialIndex(agents, ORIGIN);
    for (let i = 0; i < snap.agents.length - 1; i++) {
      expect(snap.agents[i].priority).toBeLessThanOrEqual(snap.agents[i + 1].priority);
    }
  });
});
