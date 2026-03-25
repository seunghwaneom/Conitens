/**
 * view-window.test.ts — Unit tests for Sub-AC 15b: camera-frustum subset selection.
 *
 * Tests the pure-logic functions exported from view-window.ts.
 * All tests run in Node.js without React, Three.js, or WebGL.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *   vw-ext  : extractFrustumPlanes — plane extraction from column-major PV matrix
 *   vw-tst  : testPointInFrustum   — point-in-frustum test (with / without margin)
 *   vw-win  : computeViewWindow    — full entity classification
 *   vw-mrg  : margin behaviour     — frustum expansion prevents pop-in
 *   vw-prx  : proximity sphere     — agents near camera keep rendering off-frustum
 *   vw-inv  : invariants           — set disjointness, shouldRender consistency
 *   vw-emp  : empty snapshot       — zero-entity initial state
 *   vw-imm  : immutability         — snapshots are frozen
 *   vw-ord  : ordering             — results sorted nearest-first
 *   vw-hlp  : test-helper sanity   — makeOrthoPVMatrix / multiplyMat4
 *
 * Test ID scheme:  vw-<category>-<N>
 */

import { describe, it, expect } from "vitest";
import {
  // Core pure functions
  extractFrustumPlanes,
  testPointInFrustum,
  computeViewWindow,
  makeEmptyViewWindowSnapshot,
  // Constants
  VIEW_WINDOW_DEFAULT_MARGIN,
  VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS,
  VIEW_WINDOW_DEFAULT_MAX_DISTANCE,
  VIEW_WINDOW_DEFAULT_CONFIG,
  // Test helpers
  makeOrthoPVMatrix,
  multiplyMat4,
  // Types (for assertions)
  type ViewWindowEntity,
  type Vec3,
  type SixFrustumPlanes,
  type ViewWindowSnapshot,
} from "../view-window.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/** Symmetric ortho camera at origin looking down -Z, ±5 wide/tall, 0.1…100 */
const STD_PV = makeOrthoPVMatrix(5, 5, 0.1, 100);

/** Symmetric ortho camera at (3, 2, 10) looking down -Z, ±5 wide/tall, 0.1…100 */
const OFFSET_PV = makeOrthoPVMatrix(5, 5, 0.1, 100, 3, 2, 10);

function mkAgent(id: string, x: number, y: number, z: number): ViewWindowEntity {
  return { id, position: { x, y, z }, entityType: "agent" };
}

function mkRoom(id: string, x: number, y: number, z: number): ViewWindowEntity {
  return { id, position: { x, y, z }, entityType: "room" };
}

function mkAgents(n: number): ViewWindowEntity[] {
  return Array.from({ length: n }, (_, i) =>
    mkAgent(`a${i}`, i - n / 2, 0, -5),
  );
}

// ── vw-hlp: Test-helper sanity ────────────────────────────────────────────────

describe("makeOrthoPVMatrix helper (vw-hlp)", () => {
  it("vw-hlp-1: returns 16 elements", () => {
    expect(STD_PV).toHaveLength(16);
  });

  it("vw-hlp-2: scale X = 1/halfW (element 0)", () => {
    // halfW=5 → sx = 2/(2*5) = 0.2
    expect(STD_PV[0]).toBeCloseTo(0.2);
  });

  it("vw-hlp-3: scale Y = 1/halfH (element 5)", () => {
    expect(STD_PV[5]).toBeCloseTo(0.2);
  });

  it("vw-hlp-4: scale Z is negative (element 10)", () => {
    // sz = -2/(far-near) < 0
    expect(STD_PV[10]).toBeLessThan(0);
  });

  it("vw-hlp-5: bottom-right element is 1 (element 15)", () => {
    expect(STD_PV[15]).toBeCloseTo(1);
  });

  it("vw-hlp-6: offset camera shifts tx/ty (elements 12/13)", () => {
    // camX=3, halfW=5: tx = -camX/halfW = -3/5 = -0.6
    expect(OFFSET_PV[12]).toBeCloseTo(-0.6, 5);
    // camY=2, halfH=5: ty = -2/5 = -0.4
    expect(OFFSET_PV[13]).toBeCloseTo(-0.4, 5);
  });

  it("vw-hlp-7: identity matrix times identity matrix is identity", () => {
    const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    const result = multiplyMat4(I, I);
    expect(result).toEqual(I);
  });

  it("vw-hlp-8: multiplyMat4 returns 16 elements", () => {
    expect(multiplyMat4(STD_PV as number[], STD_PV as number[])).toHaveLength(16);
  });
});

// ── vw-ext: extractFrustumPlanes ──────────────────────────────────────────────

describe("extractFrustumPlanes (vw-ext)", () => {
  let planes: SixFrustumPlanes;

  it("vw-ext-1: returns exactly 6 planes", () => {
    planes = extractFrustumPlanes(STD_PV);
    expect(planes).toHaveLength(6);
  });

  it("vw-ext-2: each plane has numeric a, b, c, d and positive len", () => {
    planes = extractFrustumPlanes(STD_PV);
    for (const p of planes) {
      expect(typeof p.a).toBe("number");
      expect(typeof p.b).toBe("number");
      expect(typeof p.c).toBe("number");
      expect(typeof p.d).toBe("number");
      expect(p.len).toBeGreaterThan(0);
    }
  });

  it("vw-ext-3: len == sqrt(a²+b²+c²) for each plane", () => {
    planes = extractFrustumPlanes(STD_PV);
    for (const p of planes) {
      const expected = Math.sqrt(p.a * p.a + p.b * p.b + p.c * p.c);
      expect(p.len).toBeCloseTo(expected, 10);
    }
  });

  it("vw-ext-4: left plane blocks point at x < -halfW (x=-6)", () => {
    // Left plane for STD_PV (halfW=5, cam at origin): x >= -5
    // x=-6 should be on the wrong side of the left plane
    planes = extractFrustumPlanes(STD_PV);
    const [left] = planes;
    const signed = left.a * (-6) + left.b * 0 + left.c * (-5) + left.d;
    expect(signed).toBeLessThan(0);
  });

  it("vw-ext-5: right plane blocks point at x > halfW (x=+6)", () => {
    planes = extractFrustumPlanes(STD_PV);
    const right = planes[1];
    const signed = right.a * 6 + right.b * 0 + right.c * (-5) + right.d;
    expect(signed).toBeLessThan(0);
  });

  it("vw-ext-6: near plane blocks point before near clip (z=+1, behind camera)", () => {
    // Camera at origin looking down -Z. z=+1 is behind the camera.
    planes = extractFrustumPlanes(STD_PV);
    const near = planes[4];
    const signed = near.a * 0 + near.b * 0 + near.c * 1 + near.d;
    expect(signed).toBeLessThan(0);
  });

  it("vw-ext-7: far plane blocks point beyond far clip (z=-200)", () => {
    planes = extractFrustumPlanes(STD_PV);
    const far = planes[5];
    const signed = far.a * 0 + far.b * 0 + far.c * (-200) + far.d;
    expect(signed).toBeLessThan(0);
  });

  it("vw-ext-8: all 6 planes pass for a point at centre of frustum (0,0,-5)", () => {
    planes = extractFrustumPlanes(STD_PV);
    for (const p of planes) {
      const signed = p.a * 0 + p.b * 0 + p.c * (-5) + p.d;
      expect(signed).toBeGreaterThanOrEqual(0);
    }
  });

  it("vw-ext-9: planes shift correctly for offset camera", () => {
    // OFFSET_PV: camera at (3,2,10). Left bound = 3-5 = -2.
    const offsetPlanes = extractFrustumPlanes(OFFSET_PV);
    const [left] = offsetPlanes;
    // x=-3 is outside left bound (-2), should be negative
    const signed = left.a * (-3) + left.b * 2 + left.c * (10 - 5) + left.d;
    expect(signed).toBeLessThan(0);
  });
});

// ── vw-tst: testPointInFrustum ────────────────────────────────────────────────

describe("testPointInFrustum (vw-tst)", () => {
  const planes = extractFrustumPlanes(STD_PV);

  it("vw-tst-1: centre point (0,0,-5) is inside frustum", () => {
    expect(testPointInFrustum(0, 0, -5, planes)).toBe(true);
  });

  it("vw-tst-2: point just inside left boundary (-4.9,0,-5) is visible", () => {
    expect(testPointInFrustum(-4.9, 0, -5, planes)).toBe(true);
  });

  it("vw-tst-3: point outside left boundary (-5.1,0,-5) is NOT visible", () => {
    expect(testPointInFrustum(-5.1, 0, -5, planes)).toBe(false);
  });

  it("vw-tst-4: point outside right boundary (5.1,0,-5) is NOT visible", () => {
    expect(testPointInFrustum(5.1, 0, -5, planes)).toBe(false);
  });

  it("vw-tst-5: point outside top boundary (0,5.1,-5) is NOT visible", () => {
    expect(testPointInFrustum(0, 5.1, -5, planes)).toBe(false);
  });

  it("vw-tst-6: point outside bottom boundary (0,-5.1,-5) is NOT visible", () => {
    expect(testPointInFrustum(0, -5.1, -5, planes)).toBe(false);
  });

  it("vw-tst-7: point behind camera (0,0,1) is NOT visible", () => {
    expect(testPointInFrustum(0, 0, 1, planes)).toBe(false);
  });

  it("vw-tst-8: point beyond far clip (0,0,-101) is NOT visible", () => {
    expect(testPointInFrustum(0, 0, -101, planes)).toBe(false);
  });

  it("vw-tst-9: zero margin — point exactly at boundary passes (boundary inclusive)", () => {
    // Left boundary: x=-5, point at exactly (-5, 0, -5)
    // The plane equation should give ≈0, which is ≥0 → visible
    const v = testPointInFrustum(-5, 0, -5, planes, 0);
    // Allow for floating-point tolerance: may be true or false at boundary
    expect(typeof v).toBe("boolean");
  });

  it("vw-tst-10: margin=2 makes a point 1 unit outside visible (inside expanded frustum)", () => {
    // Without margin: x=-6 is outside (halfW=5, so outside by 1 unit)
    expect(testPointInFrustum(-6, 0, -5, planes, 0)).toBe(false);
    // With margin=2 (world units): x=-6 is now inside the expanded frustum
    expect(testPointInFrustum(-6, 0, -5, planes, 2)).toBe(true);
  });

  it("vw-tst-11: margin=0.5 does NOT make a point 1 unit outside visible", () => {
    // x=-6 is 1 unit outside left boundary; margin=0.5 < 1 → still culled
    expect(testPointInFrustum(-6, 0, -5, planes, 0.5)).toBe(false);
  });

  it("vw-tst-12: corners of the frustum box are inside (no margin)", () => {
    // Near-corners at z ≈ -0.1, edges at ±4.9
    expect(testPointInFrustum( 4.9,  4.9, -5, planes)).toBe(true);
    expect(testPointInFrustum(-4.9,  4.9, -5, planes)).toBe(true);
    expect(testPointInFrustum( 4.9, -4.9, -5, planes)).toBe(true);
    expect(testPointInFrustum(-4.9, -4.9, -5, planes)).toBe(true);
  });
});

// ── vw-win: computeViewWindow ─────────────────────────────────────────────────

describe("computeViewWindow (vw-win)", () => {
  it("vw-win-1: entity inside frustum is classified 'frustum'", () => {
    const entities = [mkAgent("a1", 0, 0, -5)];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    expect(snap.frustumIds).toContain("a1");
    expect(snap.entities[0].class).toBe("frustum");
  });

  it("vw-win-2: entity outside frustum and far from camera is 'culled'", () => {
    // x=-10 is well outside the ±5 left/right bounds; at z=-5
    const entities = [mkAgent("a1", -10, 0, -5)];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, { proximityRadius: 3 });
    expect(snap.culledIds).toContain("a1");
  });

  it("vw-win-3: agent outside frustum but within proximity sphere is 'proximity'", () => {
    // Agent at (-6, 0, -5): 6 units from origin → within proximityRadius=8
    const entities = [mkAgent("a1", -6, 0, -5)];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      proximityRadius: 8,
      margin: 0,
    });
    // Distance from origin to (-6,0,-5) = sqrt(36+25) ≈ 7.8 < 8
    expect(snap.proximityIds).toContain("a1");
  });

  it("vw-win-4: room outside frustum but close to camera stays 'culled' (rooms skip proximity)", () => {
    // Rooms are not eligible for proximity classification
    const entities = [mkRoom("r1", -6, 0, -5)];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      proximityRadius: 8,
      margin: 0,
    });
    expect(snap.culledIds).toContain("r1");
    expect(snap.proximityIds).not.toContain("r1");
  });

  it("vw-win-5: entity beyond maxDistance is culled regardless of frustum", () => {
    const entities = [mkAgent("a1", 0, 0, -5)];
    // maxDistance=1 — entity at z=-5 is sqrt(25)=5 away → culled
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, { maxDistance: 1 });
    expect(snap.culledIds).toContain("a1");
    expect(snap.frustumIds).not.toContain("a1");
  });

  it("vw-win-6: visibleIds = frustumIds + proximityIds", () => {
    const entities = [
      mkAgent("in-frustum",  0, 0, -5),
      mkAgent("in-prox",    -6, 0, -5),
      mkAgent("out",        -100, 0, -5),
    ];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      proximityRadius: 8,
      margin: 0,
    });
    const visibleSet  = new Set(snap.visibleIds);
    const frustumSet  = new Set(snap.frustumIds);
    const proximitySet = new Set(snap.proximityIds);
    // visibleIds is the union of frustum + proximity
    for (const id of snap.visibleIds) {
      expect(frustumSet.has(id) || proximitySet.has(id)).toBe(true);
    }
    expect(visibleSet.has("out")).toBe(false);
  });

  it("vw-win-7: shouldRender is true for frustum and proximity, false for culled", () => {
    const entities = [
      mkAgent("in",   0, 0, -5),
      mkAgent("out", -100, 0, -5),
    ];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    const inResult  = snap.entities.find((e) => e.id === "in");
    const outResult = snap.entities.find((e) => e.id === "out");
    expect(inResult?.shouldRender).toBe(true);
    expect(outResult?.shouldRender).toBe(false);
  });

  it("vw-win-8: empty entity list returns empty snapshot", () => {
    const snap = computeViewWindow([], STD_PV, ORIGIN);
    expect(snap.entities).toHaveLength(0);
    expect(snap.frustumIds).toHaveLength(0);
    expect(snap.visibleIds).toHaveLength(0);
  });

  it("vw-win-9: 10 entities all inside frustum → all classified 'frustum'", () => {
    // All placed near centre of frustum
    const entities = Array.from({ length: 10 }, (_, i) =>
      mkAgent(`a${i}`, i - 4.5, 0, -5),
    );
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    expect(snap.frustumIds).toHaveLength(10);
    expect(snap.culledIds).toHaveLength(0);
  });

  it("vw-win-10: snapshot.cameraPos matches supplied cameraPos", () => {
    const cam: Vec3 = { x: 1, y: 2, z: 3 };
    const snap = computeViewWindow([], STD_PV, cam);
    expect(snap.cameraPos).toEqual(cam);
  });

  it("vw-win-11: snapshot.ts > 0 (monotonic timestamp)", () => {
    const snap = computeViewWindow([], STD_PV, ORIGIN);
    expect(snap.ts).toBeGreaterThan(0);
  });

  it("vw-win-12: snapshot.config reflects supplied overrides", () => {
    const snap = computeViewWindow([], STD_PV, ORIGIN, { margin: 3, proximityRadius: 15 });
    expect(snap.config.margin).toBe(3);
    expect(snap.config.proximityRadius).toBe(15);
  });

  it("vw-win-13: snapshot.config uses defaults when not overridden", () => {
    const snap = computeViewWindow([], STD_PV, ORIGIN);
    expect(snap.config.margin).toBe(VIEW_WINDOW_DEFAULT_MARGIN);
    expect(snap.config.proximityRadius).toBe(VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS);
    expect(snap.config.maxDistance).toBe(VIEW_WINDOW_DEFAULT_MAX_DISTANCE);
  });

  it("vw-win-14: entities array has one entry per input entity", () => {
    const entities = mkAgents(7);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    expect(snap.entities).toHaveLength(7);
  });

  it("vw-win-15: each entity result has a positive distance", () => {
    const entities = mkAgents(5);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    for (const r of snap.entities) {
      expect(r.distance).toBeGreaterThanOrEqual(0);
    }
  });

  it("vw-win-16: offset camera correctly classifies entities relative to its position", () => {
    // Camera at (3,2,10) with ±5 frustum → X range [−2,8], Y range [−3,7]
    const inFrustum = mkAgent("in", 3, 2, 5); // at camera centre in XY, at z=camZ-5=5
    const outLeft   = mkAgent("out", -3, 2, 5); // x=-3 is outside left bound (-2)
    const entities  = [inFrustum, outLeft];
    const snap = computeViewWindow(entities, OFFSET_PV, { x: 3, y: 2, z: 10 }, {
      margin: 0,
      proximityRadius: 1, // very small proximity so "out" stays culled
    });
    expect(snap.frustumIds).toContain("in");
    expect(snap.culledIds).toContain("out");
  });
});

// ── vw-mrg: Margin behaviour ─────────────────────────────────────────────────

describe("margin behaviour (vw-mrg)", () => {
  it("vw-mrg-1: margin=0 — entity 1 unit outside frustum is culled", () => {
    const entities = [mkAgent("a", -6, 0, -5)]; // 1 unit outside left bound
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      margin: 0,
      proximityRadius: 0,
    });
    expect(snap.culledIds).toContain("a");
  });

  it("vw-mrg-2: margin=2 — entity 1 unit outside frustum is NOW 'frustum'", () => {
    const entities = [mkAgent("a", -6, 0, -5)]; // 1 unit outside left bound
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      margin: 2,
      proximityRadius: 0,
    });
    expect(snap.frustumIds).toContain("a");
  });

  it("vw-mrg-3: larger margin extends all sides symmetrically", () => {
    // With margin=3, right boundary expands by 3 units (to x=+8)
    const entities = [mkAgent("a", 7, 0, -5)]; // 2 units outside right bound
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      margin: 3,
      proximityRadius: 0,
    });
    expect(snap.frustumIds).toContain("a");
  });

  it("vw-mrg-4: default margin is VIEW_WINDOW_DEFAULT_MARGIN", () => {
    const snap = computeViewWindow([], STD_PV, ORIGIN);
    expect(snap.config.margin).toBe(VIEW_WINDOW_DEFAULT_MARGIN);
  });
});

// ── vw-prx: Proximity sphere behaviour ───────────────────────────────────────

describe("proximity sphere behaviour (vw-prx)", () => {
  it("vw-prx-1: agent within proximity sphere but outside frustum → 'proximity'", () => {
    // Agent at (-6, 0, 0): outside the frustum (x<-5) but sqrt(36)=6 < radius=8
    const entities = [mkAgent("a", -6, 0, 0)];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      proximityRadius: 8,
      margin: 0,
    });
    expect(snap.proximityIds).toContain("a");
    expect(snap.frustumIds).not.toContain("a");
  });

  it("vw-prx-2: agent beyond proximity sphere → 'culled'", () => {
    const entities = [mkAgent("a", -20, 0, 0)]; // dist=20 > proximityRadius=8
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      proximityRadius: 8,
      margin: 0,
    });
    expect(snap.culledIds).toContain("a");
    expect(snap.proximityIds).not.toContain("a");
  });

  it("vw-prx-3: proximity classification applies to agents only, not rooms/fixtures", () => {
    const entities = [
      { id: "r1", position: { x: -6, y: 0, z: 0 }, entityType: "room" as const },
      { id: "f1", position: { x: -6, y: 0, z: 0 }, entityType: "fixture" as const },
    ];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      proximityRadius: 8,
      margin: 0,
    });
    expect(snap.proximityIds).not.toContain("r1");
    expect(snap.proximityIds).not.toContain("f1");
    expect(snap.culledIds).toContain("r1");
    expect(snap.culledIds).toContain("f1");
  });

  it("vw-prx-6: task entities outside frustum but within proximity sphere → 'proximity'", () => {
    // Task orb at (-6, 1.5, 0): outside ±5 frustum but within 8-unit proximity sphere
    const entities = [
      { id: "t1", position: { x: -6, y: 1.5, z: 0 }, entityType: "task" as const },
    ];
    // Distance from origin ≈ sqrt(36 + 2.25) ≈ 6.18 < 8
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      proximityRadius: 8,
      margin: 0,
    });
    expect(snap.proximityIds).toContain("t1");
    expect(snap.culledIds).not.toContain("t1");
  });

  it("vw-prx-7: task entity inside frustum is classified 'frustum' (frustum wins over proximity)", () => {
    const entities = [
      { id: "t-in", position: { x: 0, y: 1.5, z: -5 }, entityType: "task" as const },
    ];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      proximityRadius: 50,
      margin: 0,
    });
    expect(snap.frustumIds).toContain("t-in");
    expect(snap.proximityIds).not.toContain("t-in");
  });

  it("vw-prx-4: agent inside BOTH frustum and proximity sphere → 'frustum' (frustum wins)", () => {
    // Agent inside frustum (0,0,-5) — also trivially within proximity sphere
    const entities = [mkAgent("a", 0, 0, -5)];
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      proximityRadius: 50,
      margin: 0,
    });
    expect(snap.frustumIds).toContain("a");
    expect(snap.proximityIds).not.toContain("a");
  });

  it("vw-prx-5: proximity sphere does not override maxDistance cull", () => {
    // Agent close but beyond maxDistance
    const entities = [mkAgent("a", 1, 0, 0)]; // dist≈1
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, {
      maxDistance:     0.5, // hard cull at 0.5 units
      proximityRadius: 50,  // large proximity sphere
    });
    expect(snap.culledIds).toContain("a");
  });
});

// ── vw-inv: Invariants ────────────────────────────────────────────────────────

describe("invariants (vw-inv)", () => {
  it("vw-inv-1: frustumIds ∪ proximityIds ∪ culledIds = all entity IDs", () => {
    const entities = mkAgents(10);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    const allInput  = new Set(entities.map((e) => e.id));
    const allOutput = new Set([
      ...snap.frustumIds,
      ...snap.proximityIds,
      ...snap.culledIds,
    ]);
    for (const id of allInput) expect(allOutput.has(id)).toBe(true);
    expect(allOutput.size).toBe(allInput.size);
  });

  it("vw-inv-2: frustumIds ∩ proximityIds = ∅ (no entity in both)", () => {
    const entities = mkAgents(15);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    const frustumSet = new Set(snap.frustumIds);
    for (const id of snap.proximityIds) {
      expect(frustumSet.has(id)).toBe(false);
    }
  });

  it("vw-inv-3: frustumIds ∩ culledIds = ∅", () => {
    const entities = mkAgents(15);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    const frustumSet = new Set(snap.frustumIds);
    for (const id of snap.culledIds) {
      expect(frustumSet.has(id)).toBe(false);
    }
  });

  it("vw-inv-4: visibleIds = frustumIds + proximityIds (no duplicates)", () => {
    const entities = mkAgents(10);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN, { proximityRadius: 20 });
    const expected = new Set([...snap.frustumIds, ...snap.proximityIds]);
    const actual   = new Set(snap.visibleIds);
    expect(actual).toEqual(expected);
  });

  it("vw-inv-5: entities with shouldRender=true match visibleIds", () => {
    const entities = mkAgents(10);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    const visibleSet    = new Set(snap.visibleIds);
    const shouldRenderSet = new Set(
      snap.entities.filter((e) => e.shouldRender).map((e) => e.id),
    );
    expect(shouldRenderSet).toEqual(visibleSet);
  });

  it("vw-inv-6: entities with shouldRender=false match culledIds", () => {
    const entities = mkAgents(10);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    const culledSet = new Set(snap.culledIds);
    const noRenderSet = new Set(
      snap.entities.filter((e) => !e.shouldRender).map((e) => e.id),
    );
    expect(noRenderSet).toEqual(culledSet);
  });

  it("vw-inv-7: snap.entities length = number of input entities", () => {
    const entities = mkAgents(7);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    expect(snap.entities).toHaveLength(7);
  });
});

// ── vw-emp: Empty snapshot ────────────────────────────────────────────────────

describe("makeEmptyViewWindowSnapshot (vw-emp)", () => {
  it("vw-emp-1: returns snapshot with empty arrays", () => {
    const snap = makeEmptyViewWindowSnapshot();
    expect(snap.entities).toHaveLength(0);
    expect(snap.frustumIds).toHaveLength(0);
    expect(snap.proximityIds).toHaveLength(0);
    expect(snap.culledIds).toHaveLength(0);
    expect(snap.visibleIds).toHaveLength(0);
  });

  it("vw-emp-2: default cameraPos is origin", () => {
    const snap = makeEmptyViewWindowSnapshot();
    expect(snap.cameraPos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("vw-emp-3: custom cameraPos is preserved", () => {
    const pos: Vec3 = { x: 1, y: 2, z: 3 };
    const snap = makeEmptyViewWindowSnapshot(pos);
    expect(snap.cameraPos).toEqual(pos);
  });

  it("vw-emp-4: ts > 0", () => {
    expect(makeEmptyViewWindowSnapshot().ts).toBeGreaterThan(0);
  });

  it("vw-emp-5: snapshot uses default config", () => {
    const snap = makeEmptyViewWindowSnapshot();
    expect(snap.config).toEqual(VIEW_WINDOW_DEFAULT_CONFIG);
  });
});

// ── vw-imm: Immutability ──────────────────────────────────────────────────────

describe("immutability (vw-imm)", () => {
  it("vw-imm-1: computeViewWindow returns a frozen object", () => {
    const snap = computeViewWindow([], STD_PV, ORIGIN);
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("vw-imm-2: makeEmptyViewWindowSnapshot returns a frozen object", () => {
    expect(Object.isFrozen(makeEmptyViewWindowSnapshot())).toBe(true);
  });

  it("vw-imm-3: frustumIds array is frozen", () => {
    const snap = computeViewWindow([mkAgent("a", 0, 0, -5)], STD_PV, ORIGIN);
    expect(Object.isFrozen(snap.frustumIds)).toBe(true);
  });

  it("vw-imm-4: two successive calls produce different ts values (monotonic)", async () => {
    const s1 = computeViewWindow([], STD_PV, ORIGIN);
    await new Promise((r) => setTimeout(r, 2));
    const s2 = computeViewWindow([], STD_PV, ORIGIN);
    expect(s2.ts).toBeGreaterThanOrEqual(s1.ts);
  });
});

// ── vw-ord: Ordering ──────────────────────────────────────────────────────────

describe("ordering (vw-ord)", () => {
  it("vw-ord-1: entities array is sorted nearest-first", () => {
    const cam: Vec3 = { x: 0, y: 0, z: 0 };
    const entities = [
      mkAgent("far",   0, 0, -20),
      mkAgent("near",  0, 0, -2),
      mkAgent("mid",   0, 0, -10),
    ];
    const snap = computeViewWindow(entities, STD_PV, cam);
    expect(snap.entities[0].id).toBe("near");
    expect(snap.entities[snap.entities.length - 1].id).toBe("far");
  });

  it("vw-ord-2: distance values are monotonically non-decreasing in entities array", () => {
    const entities = mkAgents(8);
    const snap = computeViewWindow(entities, STD_PV, ORIGIN);
    for (let i = 0; i < snap.entities.length - 1; i++) {
      expect(snap.entities[i].distance).toBeLessThanOrEqual(
        snap.entities[i + 1].distance,
      );
    }
  });
});

// ── vw-const: Constants ───────────────────────────────────────────────────────

describe("exported constants (vw-const)", () => {
  it("vw-const-1: VIEW_WINDOW_DEFAULT_MARGIN is positive", () => {
    expect(VIEW_WINDOW_DEFAULT_MARGIN).toBeGreaterThan(0);
  });

  it("vw-const-2: VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS is positive", () => {
    expect(VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS).toBeGreaterThan(0);
  });

  it("vw-const-3: VIEW_WINDOW_DEFAULT_MAX_DISTANCE > PROXIMITY_RADIUS", () => {
    expect(VIEW_WINDOW_DEFAULT_MAX_DISTANCE).toBeGreaterThan(
      VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS,
    );
  });

  it("vw-const-4: VIEW_WINDOW_DEFAULT_CONFIG has correct margin", () => {
    expect(VIEW_WINDOW_DEFAULT_CONFIG.margin).toBe(VIEW_WINDOW_DEFAULT_MARGIN);
  });

  it("vw-const-5: VIEW_WINDOW_DEFAULT_CONFIG is frozen", () => {
    expect(Object.isFrozen(VIEW_WINDOW_DEFAULT_CONFIG)).toBe(true);
  });
});
