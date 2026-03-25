/**
 * birds-eye-clickable-nodes.test.ts — Unit tests for Sub-AC 3b:
 * BirdsEyeClickableNodes — clickable floor/room nodes in bird's-eye view.
 *
 * Tests the exported pure-logic constants and helper functions from
 * BirdsEyeClickableNodes.tsx.  The React components (ClickableFloorZone,
 * ClickableRoomNode, BirdsEyeClickableNodes) require a WebGL context + React
 * hooks and cannot run headlessly; only the exported pure-logic symbols are
 * tested here — consistent with the testing pattern used for BirdsEyeCamera
 * (birds-eye-camera.test.ts) and BirdsEyeLODLayer (birds-eye-lod-layer.test.ts).
 *
 * Symbols under test:
 *   Constants:
 *     DRILL_TRANSITION_DELAY_MS, DRILL_FLOOR_ZOOM, DRILL_ROOM_ZOOM,
 *     FLOOR_HOVER_FILL_OPACITY, FLOOR_HOVER_OUTLINE_OPACITY,
 *     ROOM_HOVER_FILL_OPACITY, ROOM_HOVER_OUTLINE_OPACITY
 *
 *   Pure functions:
 *     computeFloorPanTarget(floorDef, buildingCenterX, buildingCenterZ)
 *     computeRoomPanTarget(room, buildingCenterX, buildingCenterZ)
 *
 * Test ID scheme:
 *   3b-click-N : Sub-AC 3b clickable nodes
 */

import { describe, it, expect } from "vitest";
import {
  // Transition constants
  DRILL_TRANSITION_DELAY_MS,
  DRILL_FLOOR_ZOOM,
  DRILL_ROOM_ZOOM,
  // Hover opacity constants
  FLOOR_HOVER_FILL_OPACITY,
  FLOOR_HOVER_OUTLINE_OPACITY,
  ROOM_HOVER_FILL_OPACITY,
  ROOM_HOVER_OUTLINE_OPACITY,
  // Pure helper functions
  computeFloorPanTarget,
  computeRoomPanTarget,
} from "../BirdsEyeClickableNodes.js";
import {
  BIRDS_EYE_BUILDING_CENTER_X,
  BIRDS_EYE_BUILDING_CENTER_Z,
  BIRDS_EYE_MIN_ZOOM,
  BIRDS_EYE_MAX_ZOOM,
  BIRDS_EYE_DEFAULT_ZOOM,
} from "../BirdsEyeCamera.js";
import type { FloorDef, RoomDef } from "../../data/building.js";

// ── Shared test fixtures ──────────────────────────────────────────────────────

/** Standard ground floor matching the canonical building dimensions */
const FLOOR_0: FloorDef = {
  floor: 0,
  name: "Ground Floor",
  gridW: 12,
  gridD: 6,
  roomIds: ["project-main", "archive-vault", "stairwell"],
};

/** Standard operations floor matching the canonical building dimensions */
const FLOOR_1: FloorDef = {
  floor: 1,
  name: "Operations",
  gridW: 12,
  gridD: 6,
  roomIds: ["ops-control", "impl-office"],
};

/** Sub-floor with non-standard dimensions (tests non-trivial pan offset) */
const FLOOR_NARROW: FloorDef = {
  floor: 0,
  name: "Narrow Sub-Floor",
  gridW: 6,
  gridD: 4,
  roomIds: [],
};

/** Room at the north-west corner of floor 0 */
const ROOM_NW: Partial<RoomDef> = {
  roomId: "room-nw",
  name: "NW Room",
  roomType: "office",
  floor: 0,
  position:   { x: 0, y: 0, z: 0 },
  dimensions: { x: 2, y: 3, z: 2 },
  colorAccent: "#44aa88",
  members: [],
  icon: "🗃️",
};

/** Room at the south-east corner of floor 0 */
const ROOM_SE: Partial<RoomDef> = {
  roomId: "room-se",
  name: "SE Room",
  roomType: "control",
  floor: 0,
  position:   { x: 10, y: 0, z: 4 },
  dimensions: { x:  2, y: 3, z: 2 },
  colorAccent: "#ff8822",
  members: [],
  icon: "🎛️",
};

/** Room whose center exactly coincides with the building center [6, y, 3] */
const ROOM_CENTER: Partial<RoomDef> = {
  roomId: "room-center",
  name: "Center Room",
  roomType: "lobby",
  floor: 0,
  position:   { x: 4, y: 0, z: 1 },  // center: [4+2, y, 1+2] = [6, y, 3]
  dimensions: { x: 4, y: 3, z: 4 },
  colorAccent: "#4466ff",
  members: [],
  icon: "🏛️",
};

/** Room at floor 1 — tests that Y position (floor height) is ignored for pan */
const ROOM_F1: Partial<RoomDef> = {
  roomId: "room-f1",
  name: "F1 Room",
  roomType: "lab",
  floor: 1,
  position:   { x: 3, y: 3, z: 2 },  // floor 1 → position.y = 3
  dimensions: { x: 2, y: 3, z: 2 },
  colorAccent: "#9944cc",
  members: [],
  icon: "🔬",
};

/** Same room footprint as ROOM_F1 but on floor 0 — for Y-invariance test */
const ROOM_F0_SAME_XZ: Partial<RoomDef> = {
  roomId: "room-f0",
  name: "F0 Room (same XZ)",
  roomType: "lab",
  floor: 0,
  position:   { x: 3, y: 0, z: 2 },  // floor 0 → position.y = 0
  dimensions: { x: 2, y: 3, z: 2 },
  colorAccent: "#9944cc",
  members: [],
  icon: "🔬",
};

// ── 1. DRILL_TRANSITION_DELAY_MS (3b-click-1) ─────────────────────────────────

describe("DRILL_TRANSITION_DELAY_MS (3b-click-1)", () => {
  it("is a positive finite number", () => {
    expect(Number.isFinite(DRILL_TRANSITION_DELAY_MS)).toBe(true);
    expect(DRILL_TRANSITION_DELAY_MS).toBeGreaterThan(0);
  });

  it("is at least 100ms — animation must be perceptible before camera switch", () => {
    // Faster than 100ms would make the zoom/pan animation imperceptible.
    expect(DRILL_TRANSITION_DELAY_MS).toBeGreaterThanOrEqual(100);
  });

  it("is at most 800ms — UI must feel responsive (< 1s from click to perspective)", () => {
    // Longer than 800ms would make the transition feel sluggish.
    expect(DRILL_TRANSITION_DELAY_MS).toBeLessThanOrEqual(800);
  });

  it("is expressed in milliseconds (integer or float, not seconds)", () => {
    // Sanity check: value > 1 confirms it is in milliseconds, not seconds.
    expect(DRILL_TRANSITION_DELAY_MS).toBeGreaterThan(1);
  });
});

// ── 2. DRILL_FLOOR_ZOOM (3b-click-2) ─────────────────────────────────────────

describe("DRILL_FLOOR_ZOOM (3b-click-2)", () => {
  it("is a finite number", () => {
    expect(Number.isFinite(DRILL_FLOOR_ZOOM)).toBe(true);
  });

  it("is within valid bird's-eye zoom range [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(DRILL_FLOOR_ZOOM).toBeGreaterThanOrEqual(BIRDS_EYE_MIN_ZOOM);
    expect(DRILL_FLOOR_ZOOM).toBeLessThanOrEqual(BIRDS_EYE_MAX_ZOOM);
  });

  it("is less than DEFAULT_ZOOM (10) — drill always zooms in from default", () => {
    expect(DRILL_FLOOR_ZOOM).toBeLessThan(BIRDS_EYE_DEFAULT_ZOOM);
  });

  it("is greater than DRILL_ROOM_ZOOM — floor drill is less zoomed-in than room drill", () => {
    // Floor drill shows more context (the full floor); room drill is tighter.
    expect(DRILL_FLOOR_ZOOM).toBeGreaterThan(DRILL_ROOM_ZOOM);
  });
});

// ── 3. DRILL_ROOM_ZOOM (3b-click-3) ──────────────────────────────────────────

describe("DRILL_ROOM_ZOOM (3b-click-3)", () => {
  it("is a finite number", () => {
    expect(Number.isFinite(DRILL_ROOM_ZOOM)).toBe(true);
  });

  it("is within valid bird's-eye zoom range [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(DRILL_ROOM_ZOOM).toBeGreaterThanOrEqual(BIRDS_EYE_MIN_ZOOM);
    expect(DRILL_ROOM_ZOOM).toBeLessThanOrEqual(BIRDS_EYE_MAX_ZOOM);
  });

  it("is less than DEFAULT_ZOOM (10) — drill always zooms in from default", () => {
    expect(DRILL_ROOM_ZOOM).toBeLessThan(BIRDS_EYE_DEFAULT_ZOOM);
  });

  it("is less than DRILL_FLOOR_ZOOM — room drill zooms in more than floor drill", () => {
    // Smaller frustum half-size = more zoomed in; room is tighter scope than floor.
    expect(DRILL_ROOM_ZOOM).toBeLessThan(DRILL_FLOOR_ZOOM);
  });
});

// ── 4. Hover opacity constants (3b-click-4) ───────────────────────────────────

describe("Hover opacity constants (3b-click-4)", () => {
  describe("FLOOR_HOVER_FILL_OPACITY", () => {
    it("is in range (0, 1) — transparent but visible", () => {
      expect(FLOOR_HOVER_FILL_OPACITY).toBeGreaterThan(0);
      expect(FLOOR_HOVER_FILL_OPACITY).toBeLessThan(1);
    });

    it("is subtle (≤ 0.4) — must not obscure room cells below", () => {
      expect(FLOOR_HOVER_FILL_OPACITY).toBeLessThanOrEqual(0.4);
    });
  });

  describe("FLOOR_HOVER_OUTLINE_OPACITY", () => {
    it("is in range (0, 1]", () => {
      expect(FLOOR_HOVER_OUTLINE_OPACITY).toBeGreaterThan(0);
      expect(FLOOR_HOVER_OUTLINE_OPACITY).toBeLessThanOrEqual(1);
    });

    it("exceeds FLOOR_HOVER_FILL_OPACITY — outline must be more prominent than fill", () => {
      expect(FLOOR_HOVER_OUTLINE_OPACITY).toBeGreaterThan(FLOOR_HOVER_FILL_OPACITY);
    });

    it("is clearly visible (> 0.5) — outline is the primary hover affordance", () => {
      expect(FLOOR_HOVER_OUTLINE_OPACITY).toBeGreaterThan(0.5);
    });
  });

  describe("ROOM_HOVER_FILL_OPACITY", () => {
    it("is in range (0, 1) — transparent but visible", () => {
      expect(ROOM_HOVER_FILL_OPACITY).toBeGreaterThan(0);
      expect(ROOM_HOVER_FILL_OPACITY).toBeLessThan(1);
    });

    it("is higher than FLOOR_HOVER_FILL_OPACITY — smaller target needs stronger signal", () => {
      expect(ROOM_HOVER_FILL_OPACITY).toBeGreaterThan(FLOOR_HOVER_FILL_OPACITY);
    });
  });

  describe("ROOM_HOVER_OUTLINE_OPACITY", () => {
    it("is in range (0, 1]", () => {
      expect(ROOM_HOVER_OUTLINE_OPACITY).toBeGreaterThan(0);
      expect(ROOM_HOVER_OUTLINE_OPACITY).toBeLessThanOrEqual(1);
    });

    it("exceeds ROOM_HOVER_FILL_OPACITY — outline must be more prominent than fill", () => {
      expect(ROOM_HOVER_OUTLINE_OPACITY).toBeGreaterThan(ROOM_HOVER_FILL_OPACITY);
    });

    it("is clearly visible (> 0.5)", () => {
      expect(ROOM_HOVER_OUTLINE_OPACITY).toBeGreaterThan(0.5);
    });
  });

  it("room fill opacity is higher than floor fill opacity", () => {
    expect(ROOM_HOVER_FILL_OPACITY).toBeGreaterThan(FLOOR_HOVER_FILL_OPACITY);
  });

  it("room outline opacity is higher than floor outline opacity", () => {
    expect(ROOM_HOVER_OUTLINE_OPACITY).toBeGreaterThan(FLOOR_HOVER_OUTLINE_OPACITY);
  });
});

// ── 5. computeFloorPanTarget (3b-click-5) ─────────────────────────────────────

describe("computeFloorPanTarget (3b-click-5)", () => {
  it("returns a two-element tuple of numbers", () => {
    const result = computeFloorPanTarget(FLOOR_0, 6, 3);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(typeof result[0]).toBe("number");
    expect(typeof result[1]).toBe("number");
  });

  it("standard floor (12×6) with building center (6, 3) returns [0, 0]", () => {
    // Floor center X = 12/2 = 6 = building center X → panX = 0
    // Floor center Z =  6/2 = 3 = building center Z → panZ = 0
    const [panX, panZ] = computeFloorPanTarget(FLOOR_0, 6, 3);
    expect(panX).toBeCloseTo(0, 6);
    expect(panZ).toBeCloseTo(0, 6);
  });

  it("floor 0 and floor 1 with identical dimensions return identical pan targets", () => {
    const r0 = computeFloorPanTarget(FLOOR_0, BIRDS_EYE_BUILDING_CENTER_X, BIRDS_EYE_BUILDING_CENTER_Z);
    const r1 = computeFloorPanTarget(FLOOR_1, BIRDS_EYE_BUILDING_CENTER_X, BIRDS_EYE_BUILDING_CENTER_Z);
    expect(r0[0]).toBeCloseTo(r1[0], 6);
    expect(r0[1]).toBeCloseTo(r1[1], 6);
  });

  it("narrow floor (6×4) with building center (6, 3) returns non-zero pan offset", () => {
    // Floor center X = 6/2 = 3; panX = 3 - 6 = -3
    // Floor center Z = 4/2 = 2; panZ = 2 - 3 = -1
    const [panX, panZ] = computeFloorPanTarget(FLOOR_NARROW, 6, 3);
    expect(panX).toBeCloseTo(-3, 6);
    expect(panZ).toBeCloseTo(-1, 6);
  });

  it("using BIRDS_EYE_BUILDING_CENTER_X/Z constants: standard floor gives [0, 0]", () => {
    const [panX, panZ] = computeFloorPanTarget(
      FLOOR_0,
      BIRDS_EYE_BUILDING_CENTER_X,
      BIRDS_EYE_BUILDING_CENTER_Z,
    );
    expect(panX).toBeCloseTo(0, 6);
    expect(panZ).toBeCloseTo(0, 6);
  });

  it("is a pure function — same inputs always return equal outputs", () => {
    const a = computeFloorPanTarget(FLOOR_NARROW, 6, 3);
    const b = computeFloorPanTarget(FLOOR_NARROW, 6, 3);
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
  });

  it("does not mutate the input floorDef", () => {
    const floor: FloorDef = { floor: 0, name: "Test", gridW: 12, gridD: 6, roomIds: [] };
    const originalGridW = floor.gridW;
    computeFloorPanTarget(floor, 6, 3);
    expect(floor.gridW).toBe(originalGridW);
  });

  it("pan offset scales linearly with building center offset", () => {
    // Moving building center by 2 units changes pan by -2 (inverse offset)
    const [p1x, p1z] = computeFloorPanTarget(FLOOR_0, 6, 3);
    const [p2x, p2z] = computeFloorPanTarget(FLOOR_0, 8, 5);
    expect(p2x - p1x).toBeCloseTo(-2, 6);
    expect(p2z - p1z).toBeCloseTo(-2, 6);
  });
});

// ── 6. computeRoomPanTarget (3b-click-6) ──────────────────────────────────────

describe("computeRoomPanTarget (3b-click-6)", () => {
  it("returns a two-element tuple of numbers", () => {
    const result = computeRoomPanTarget(ROOM_NW as RoomDef, 6, 3);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(typeof result[0]).toBe("number");
    expect(typeof result[1]).toBe("number");
  });

  it("NW corner room [0,y,0] with 2×2 dims: center=[1,y,1]; pan from [6,3] = [-5, -2]", () => {
    const [panX, panZ] = computeRoomPanTarget(ROOM_NW as RoomDef, 6, 3);
    // roomCenterX = 0 + 2/2 = 1;  panX = 1 - 6 = -5
    // roomCenterZ = 0 + 2/2 = 1;  panZ = 1 - 3 = -2
    expect(panX).toBeCloseTo(-5, 6);
    expect(panZ).toBeCloseTo(-2, 6);
  });

  it("SE corner room [10,y,4] with 2×2 dims: center=[11,y,5]; pan from [6,3] = [5, 2]", () => {
    const [panX, panZ] = computeRoomPanTarget(ROOM_SE as RoomDef, 6, 3);
    // roomCenterX = 10 + 2/2 = 11; panX = 11 - 6 = 5
    // roomCenterZ =  4 + 2/2 =  5; panZ =  5 - 3 = 2
    expect(panX).toBeCloseTo(5, 6);
    expect(panZ).toBeCloseTo(2, 6);
  });

  it("center room [4,y,1] with 4×4 dims: center=[6,y,3]; pan from [6,3] = [0, 0]", () => {
    const [panX, panZ] = computeRoomPanTarget(ROOM_CENTER as RoomDef, 6, 3);
    expect(panX).toBeCloseTo(0, 6);
    expect(panZ).toBeCloseTo(0, 6);
  });

  it("ignores room.position.y — vertical floor position does not affect XZ pan", () => {
    // ROOM_F1 and ROOM_F0_SAME_XZ have the same x/z position and dimensions
    // but different y (floor 0 vs floor 1).  The pan target must be identical.
    const r0 = computeRoomPanTarget(ROOM_F0_SAME_XZ as RoomDef, 6, 3);
    const r1 = computeRoomPanTarget(ROOM_F1 as RoomDef, 6, 3);
    expect(r0[0]).toBeCloseTo(r1[0], 6);
    expect(r0[1]).toBeCloseTo(r1[1], 6);
  });

  it("uses BIRDS_EYE_BUILDING_CENTER_X/Z constants correctly for NW room", () => {
    const [panX, panZ] = computeRoomPanTarget(
      ROOM_NW as RoomDef,
      BIRDS_EYE_BUILDING_CENTER_X,
      BIRDS_EYE_BUILDING_CENTER_Z,
    );
    expect(panX).toBeCloseTo(-5, 6);
    expect(panZ).toBeCloseTo(-2, 6);
  });

  it("is a pure function — same inputs always return equal outputs", () => {
    const a = computeRoomPanTarget(ROOM_SE as RoomDef, 6, 3);
    const b = computeRoomPanTarget(ROOM_SE as RoomDef, 6, 3);
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
  });

  it("does not mutate the input room object", () => {
    const room = { ...ROOM_NW, position: { x: 0, y: 0, z: 0 } };
    computeRoomPanTarget(room as RoomDef, 6, 3);
    expect(room.position.x).toBe(0);
  });

  it("pan offset scales linearly with room position shift", () => {
    const baseRoom: Partial<RoomDef> = {
      position: { x: 2, y: 0, z: 1 },
      dimensions: { x: 2, y: 3, z: 2 },
    };
    const shiftedRoom: Partial<RoomDef> = {
      position: { x: 4, y: 0, z: 3 },  // shifted by [2, 0, 2]
      dimensions: { x: 2, y: 3, z: 2 },
    };
    const [bx, bz] = computeRoomPanTarget(baseRoom as RoomDef, 6, 3);
    const [sx, sz] = computeRoomPanTarget(shiftedRoom as RoomDef, 6, 3);
    // Shifted room center is 2 units further in X and Z → pan changes by 2
    expect(sx - bx).toBeCloseTo(2, 6);
    expect(sz - bz).toBeCloseTo(2, 6);
  });

  it("pan target for room at building center is [0, 0]", () => {
    // Any room whose center coincides with building center should return [0, 0]
    const rooms: Partial<RoomDef>[] = [
      { position: { x: 5, y: 0, z: 2 }, dimensions: { x: 2, y: 3, z: 2 } },  // center [6, y, 3]
      { position: { x: 4, y: 0, z: 1 }, dimensions: { x: 4, y: 3, z: 4 } },  // center [6, y, 3]
      { position: { x: 3, y: 0, z: 0 }, dimensions: { x: 6, y: 3, z: 6 } },  // center [6, y, 3]
    ];
    for (const room of rooms) {
      const [px, pz] = computeRoomPanTarget(room as RoomDef, 6, 3);
      expect(px).toBeCloseTo(0, 6);
      expect(pz).toBeCloseTo(0, 6);
    }
  });
});

// ── 7. Cross-constant hierarchy contract (3b-click-7) ─────────────────────────

describe("Cross-constant hierarchy contract (3b-click-7)", () => {
  it("floor drill zoom > room drill zoom (floor context > room context)", () => {
    expect(DRILL_FLOOR_ZOOM).toBeGreaterThan(DRILL_ROOM_ZOOM);
  });

  it("both drill zooms are strictly below default zoom (always zoom in on drill)", () => {
    expect(DRILL_FLOOR_ZOOM).toBeLessThan(BIRDS_EYE_DEFAULT_ZOOM);
    expect(DRILL_ROOM_ZOOM).toBeLessThan(BIRDS_EYE_DEFAULT_ZOOM);
  });

  it("both drill zooms are within valid zoom range", () => {
    expect(DRILL_FLOOR_ZOOM).toBeGreaterThanOrEqual(BIRDS_EYE_MIN_ZOOM);
    expect(DRILL_ROOM_ZOOM).toBeGreaterThanOrEqual(BIRDS_EYE_MIN_ZOOM);
    expect(DRILL_FLOOR_ZOOM).toBeLessThanOrEqual(BIRDS_EYE_MAX_ZOOM);
    expect(DRILL_ROOM_ZOOM).toBeLessThanOrEqual(BIRDS_EYE_MAX_ZOOM);
  });

  it("outline opacities exceed fill opacities for both node types", () => {
    expect(FLOOR_HOVER_OUTLINE_OPACITY).toBeGreaterThan(FLOOR_HOVER_FILL_OPACITY);
    expect(ROOM_HOVER_OUTLINE_OPACITY).toBeGreaterThan(ROOM_HOVER_FILL_OPACITY);
  });

  it("room hover values exceed floor hover values (tighter target = stronger signal)", () => {
    expect(ROOM_HOVER_FILL_OPACITY).toBeGreaterThan(FLOOR_HOVER_FILL_OPACITY);
    expect(ROOM_HOVER_OUTLINE_OPACITY).toBeGreaterThan(FLOOR_HOVER_OUTLINE_OPACITY);
  });

  it("DRILL_TRANSITION_DELAY_MS is a reasonable animation window (100–800ms)", () => {
    expect(DRILL_TRANSITION_DELAY_MS).toBeGreaterThanOrEqual(100);
    expect(DRILL_TRANSITION_DELAY_MS).toBeLessThanOrEqual(800);
  });
});

// ── 8. Pan target direction semantics (3b-click-8) ───────────────────────────

describe("Pan target direction semantics (3b-click-8)", () => {
  const CX = BIRDS_EYE_BUILDING_CENTER_X;  // 6
  const CZ = BIRDS_EYE_BUILDING_CENTER_Z;  // 3

  it("room west of building center (X < CX) produces negative panX", () => {
    const westRoom: Partial<RoomDef> = {
      position: { x: 0, y: 0, z: CZ - 1 },
      dimensions: { x: 2, y: 3, z: 2 },
    };
    const [px] = computeRoomPanTarget(westRoom as RoomDef, CX, CZ);
    expect(px).toBeLessThan(0);
  });

  it("room east of building center (X > CX) produces positive panX", () => {
    const eastRoom: Partial<RoomDef> = {
      position: { x: CX, y: 0, z: CZ - 1 },
      dimensions: { x: 2, y: 3, z: 2 },
    };
    const [px] = computeRoomPanTarget(eastRoom as RoomDef, CX, CZ);
    expect(px).toBeGreaterThan(0);
  });

  it("room north of building center (Z < CZ) produces negative panZ", () => {
    const northRoom: Partial<RoomDef> = {
      position: { x: CX - 1, y: 0, z: 0 },
      dimensions: { x: 2, y: 3, z: 1 },
    };
    const [, pz] = computeRoomPanTarget(northRoom as RoomDef, CX, CZ);
    expect(pz).toBeLessThan(0);
  });

  it("room south of building center (Z > CZ) produces positive panZ", () => {
    const southRoom: Partial<RoomDef> = {
      position: { x: CX - 1, y: 0, z: CZ + 1 },
      dimensions: { x: 2, y: 3, z: 2 },
    };
    const [, pz] = computeRoomPanTarget(southRoom as RoomDef, CX, CZ);
    expect(pz).toBeGreaterThan(0);
  });

  it("NW room produces both negative panX and negative panZ", () => {
    const [px, pz] = computeRoomPanTarget(ROOM_NW as RoomDef, CX, CZ);
    expect(px).toBeLessThan(0);
    expect(pz).toBeLessThan(0);
  });

  it("SE room produces both positive panX and positive panZ", () => {
    const [px, pz] = computeRoomPanTarget(ROOM_SE as RoomDef, CX, CZ);
    expect(px).toBeGreaterThan(0);
    expect(pz).toBeGreaterThan(0);
  });
});
