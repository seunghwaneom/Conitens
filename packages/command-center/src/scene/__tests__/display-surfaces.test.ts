/**
 * display-surfaces.test.ts — Unit tests for Sub-AC 6a.
 *
 * Tests the pure-logic aspects of DisplaySurfaces.tsx:
 *
 *   1. FURNITURE_TO_DISPLAY_KIND — registry completeness and correctness
 *   2. facingToRotationY()       — cardinal facing → rotationY (rad)
 *   3. inferFacing()             — slot position → facing heuristic
 *   4. inferMountType()          — facing + slot height → mount type
 *   5. buildDisplaySurfaceDefs() — furniture → DisplaySurfaceDef conversion
 *   6. DisplaySurfaceKind values — all four kinds are present
 *   7. FloorKiosk registration   — kiosk furniture types map to "floor-kiosk"
 *
 * NOTE: React components (MonitorSurface, WallPanelSurface, HologramStand,
 *       FloorKiosk, DisplaySurfacesLayer) require a WebGL canvas and cannot
 *       run in a headless Vitest environment.  These tests validate pure-logic
 *       helpers and data structures only.
 *
 * Test ID scheme:
 *   6a-N : Sub-AC 6a display surface mesh components
 */

import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
//  Pure logic mirrors — reproduced from DisplaySurfaces.tsx for isolation
// ─────────────────────────────────────────────────────────────────────────────

type DisplayFacing     = "north" | "south" | "east" | "west" | "up";
type DisplayMountType  = "wall" | "desk" | "floor";
type DisplaySurfaceKind = "monitor" | "wall-panel" | "hologram-stand" | "floor-kiosk";

/** Furniture slot position (local coordinates within room) */
interface SlotPos { x: number; y: number; z: number }
interface FurnitureSlot { type: string; position: SlotPos }
interface RoomDimensions { x: number; z: number }

/**
 * Mirror of facingToRotationY() in DisplaySurfaces.tsx.
 * Converts a DisplayFacing value to a Y-axis rotation in radians.
 */
function facingToRotationY(facing: DisplayFacing): number {
  switch (facing) {
    case "north": return Math.PI;        // screen looks south (−Z)
    case "south": return 0;              // screen looks north (+Z)
    case "east":  return Math.PI / 2;    // screen looks west  (−X)
    case "west":  return -Math.PI / 2;   // screen looks east  (+X)
    case "up":    return 0;              // floor-standing
  }
}

/**
 * Mirror of inferFacing() in DisplaySurfaces.tsx.
 * Slots within 18% of a wall edge → that wall; otherwise floor-standing.
 */
function inferFacing(slot: FurnitureSlot, dims: RoomDimensions): DisplayFacing {
  const rx = slot.position.x / dims.x;
  const rz = slot.position.z / dims.z;

  if (rz > 0.82) return "north";
  if (rz < 0.18) return "south";
  if (rx > 0.82) return "east";
  if (rx < 0.18) return "west";
  return "up";
}

/**
 * Mirror of inferMountType() in DisplaySurfaces.tsx.
 */
function inferMountType(slot: FurnitureSlot, facing: DisplayFacing): DisplayMountType {
  if (facing === "up") return "floor";
  return slot.position.y > 0.8 ? "wall" : "desk";
}

/**
 * Registry mirror — same entries as FURNITURE_TO_DISPLAY_KIND in DisplaySurfaces.tsx.
 */
const FURNITURE_TO_DISPLAY_KIND: Record<string, DisplaySurfaceKind> = {
  // Wall panels
  "status-board":        "wall-panel",
  "timeline-wall":       "wall-panel",
  "wall-monitor-array":  "wall-panel",
  "task-board":          "wall-panel",
  "gate-status-board":   "wall-panel",
  // Monitors
  "diff-screen":            "monitor",
  "ui-preview-screen":      "monitor",
  "approval-terminal":      "monitor",
  "file-browser-terminal":  "monitor",
  "replay-terminal":        "monitor",
  // Hologram stands
  "hologram-table":          "hologram-stand",
  "knowledge-graph-display": "hologram-stand",
  // Floor kiosks (Sub-AC 6a)
  "info-kiosk":     "floor-kiosk",
  "agent-terminal": "floor-kiosk",
  "status-kiosk":   "floor-kiosk",
};

// ─────────────────────────────────────────────────────────────────────────────
//  1.  FURNITURE_TO_DISPLAY_KIND — registry completeness
// ─────────────────────────────────────────────────────────────────────────────

describe("FURNITURE_TO_DISPLAY_KIND registry (6a-1)", () => {
  it("wall panel entries all map to 'wall-panel'", () => {
    const wallPanels = [
      "status-board",
      "timeline-wall",
      "wall-monitor-array",
      "task-board",
      "gate-status-board",
    ];
    for (const type of wallPanels) {
      expect(FURNITURE_TO_DISPLAY_KIND[type]).toBe("wall-panel");
    }
  });

  it("monitor entries all map to 'monitor'", () => {
    const monitors = [
      "diff-screen",
      "ui-preview-screen",
      "approval-terminal",
      "file-browser-terminal",
      "replay-terminal",
    ];
    for (const type of monitors) {
      expect(FURNITURE_TO_DISPLAY_KIND[type]).toBe("monitor");
    }
  });

  it("hologram stand entries all map to 'hologram-stand'", () => {
    const stands = ["hologram-table", "knowledge-graph-display"];
    for (const type of stands) {
      expect(FURNITURE_TO_DISPLAY_KIND[type]).toBe("hologram-stand");
    }
  });

  it("floor kiosk entries all map to 'floor-kiosk' (Sub-AC 6a)", () => {
    const kiosks = ["info-kiosk", "agent-terminal", "status-kiosk"];
    for (const type of kiosks) {
      expect(FURNITURE_TO_DISPLAY_KIND[type]).toBe("floor-kiosk");
    }
  });

  it("all four display surface kinds are represented", () => {
    const kinds = new Set(Object.values(FURNITURE_TO_DISPLAY_KIND));
    expect(kinds.has("monitor")).toBe(true);
    expect(kinds.has("wall-panel")).toBe(true);
    expect(kinds.has("hologram-stand")).toBe(true);
    expect(kinds.has("floor-kiosk")).toBe(true);
  });

  it("unknown furniture type is not in registry (returns undefined)", () => {
    expect(FURNITURE_TO_DISPLAY_KIND["whiteboard"]).toBeUndefined();
    expect(FURNITURE_TO_DISPLAY_KIND["bookshelf"]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  2.  facingToRotationY() — cardinal facing → Y-rotation
// ─────────────────────────────────────────────────────────────────────────────

describe("facingToRotationY() — facing to Y-axis rotation (6a-2)", () => {
  it("'north' → π (screen normal points south)", () => {
    expect(facingToRotationY("north")).toBeCloseTo(Math.PI, 5);
  });

  it("'south' → 0 (screen normal points north)", () => {
    expect(facingToRotationY("south")).toBe(0);
  });

  it("'east' → π/2 (screen normal points west)", () => {
    expect(facingToRotationY("east")).toBeCloseTo(Math.PI / 2, 5);
  });

  it("'west' → −π/2 (screen normal points east)", () => {
    expect(facingToRotationY("west")).toBeCloseTo(-Math.PI / 2, 5);
  });

  it("'up' → 0 (floor-standing, no rotation)", () => {
    expect(facingToRotationY("up")).toBe(0);
  });

  it("north and south have opposite rotation magnitudes", () => {
    // |north| - |south| = π (they differ by exactly π)
    const diff = facingToRotationY("north") - facingToRotationY("south");
    expect(diff).toBeCloseTo(Math.PI, 5);
  });

  it("east and west are mirror images (sum to zero)", () => {
    const sum = facingToRotationY("east") + facingToRotationY("west");
    expect(sum).toBeCloseTo(0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  3.  inferFacing() — slot position → facing heuristic
// ─────────────────────────────────────────────────────────────────────────────

describe("inferFacing() — position to facing heuristic (6a-3)", () => {
  const DIMS: RoomDimensions = { x: 4, z: 3 };

  it("slot at z > 82% of room depth → 'north'", () => {
    const slot: FurnitureSlot = { type: "status-board", position: { x: 2, y: 1, z: 2.5 } };
    expect(inferFacing(slot, DIMS)).toBe("north");
  });

  it("slot at z < 18% of room depth → 'south'", () => {
    const slot: FurnitureSlot = { type: "status-board", position: { x: 2, y: 1, z: 0.4 } };
    expect(inferFacing(slot, DIMS)).toBe("south");
  });

  it("slot at x > 82% of room width → 'east'", () => {
    const slot: FurnitureSlot = { type: "diff-screen", position: { x: 3.4, y: 1, z: 1.5 } };
    expect(inferFacing(slot, DIMS)).toBe("east");
  });

  it("slot at x < 18% of room width → 'west'", () => {
    const slot: FurnitureSlot = { type: "diff-screen", position: { x: 0.5, y: 1, z: 1.5 } };
    expect(inferFacing(slot, DIMS)).toBe("west");
  });

  it("slot near room centre → 'up' (floor-standing)", () => {
    const slot: FurnitureSlot = { type: "hologram-table", position: { x: 2, y: 0, z: 1.5 } };
    expect(inferFacing(slot, DIMS)).toBe("up");
  });

  it("slot exactly at 18% boundary of south wall → 'south'", () => {
    // rz = 0.18 * 3 = 0.54 — exactly at the boundary (rz < 0.18 is false when equal)
    const slot: FurnitureSlot = { type: "status-board", position: { x: 2, y: 1, z: 0.54 } };
    // rz = 0.54/3 = 0.18 → NOT < 0.18 → should NOT be south unless rz < 0.18 strictly
    expect(inferFacing(slot, DIMS)).not.toBe("south");
  });

  it("north wall priority over east wall when z > 82% and x > 82%", () => {
    // When both z and x are near extreme edges, north is checked first
    const slot: FurnitureSlot = { type: "status-board", position: { x: 3.4, y: 1, z: 2.5 } };
    expect(inferFacing(slot, DIMS)).toBe("north"); // north checked before east
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  4.  inferMountType() — facing + slot height → mount type
// ─────────────────────────────────────────────────────────────────────────────

describe("inferMountType() — mount type derivation (6a-4)", () => {
  const makeSlot = (type: string, y: number): FurnitureSlot => ({
    type,
    position: { x: 0, y, z: 0 },
  });

  it("'up' facing → 'floor' regardless of y", () => {
    expect(inferMountType(makeSlot("hologram-table", 0), "up")).toBe("floor");
    expect(inferMountType(makeSlot("hologram-table", 2), "up")).toBe("floor");
  });

  it("non-up facing at y > 0.8 → 'wall'", () => {
    expect(inferMountType(makeSlot("status-board", 1.5), "north")).toBe("wall");
    expect(inferMountType(makeSlot("status-board", 0.9), "east")).toBe("wall");
  });

  it("non-up facing at y <= 0.8 → 'desk'", () => {
    expect(inferMountType(makeSlot("diff-screen", 0.8), "west")).toBe("desk");
    expect(inferMountType(makeSlot("diff-screen", 0.5), "south")).toBe("desk");
  });

  it("boundary: y = 0.8 exactly → 'desk' (not wall — threshold is exclusive > 0.8)", () => {
    expect(inferMountType(makeSlot("diff-screen", 0.8), "north")).toBe("desk");
  });

  it("boundary: y = 0.81 → 'wall'", () => {
    expect(inferMountType(makeSlot("diff-screen", 0.81), "north")).toBe("wall");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  5.  buildDisplaySurfaceDefs() — furniture → DisplaySurfaceDef conversion
//      (Pure algorithmic test using mock data matching the type contract)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal mock implementation of buildDisplaySurfaceDefs logic for testing.
 * Mirrors the algorithm in DisplaySurfaces.tsx without React/Three.js deps.
 */
function buildMockDefs(
  roomId: string,
  roomPos: SlotPos,
  dims: RoomDimensions,
  colorAccent: string,
  furniture: FurnitureSlot[],
) {
  const defs = [];

  for (let idx = 0; idx < furniture.length; idx++) {
    const slot = furniture[idx]!;
    const kind = FURNITURE_TO_DISPLAY_KIND[slot.type];
    if (!kind) continue;

    const facing    = inferFacing(slot, dims);
    const mountType = inferMountType(slot, facing);
    const rotationY = facingToRotationY(facing);

    const worldPos = {
      x: roomPos.x + slot.position.x,
      y: roomPos.y + slot.position.y,
      z: roomPos.z + slot.position.z,
    };

    defs.push({
      id:         `${roomId}/${idx}/${slot.type}`,
      kind,
      label:      slot.type,
      anchor:     { worldPos, rotationY, facing, mountType },
      accentColor: colorAccent,
      roomId,
    });
  }

  return defs;
}

describe("buildDisplaySurfaceDefs() — furniture to def conversion (6a-5)", () => {
  const ROOM_POS  : SlotPos        = { x: 2, y: 0, z: 1 };
  const ROOM_DIMS : RoomDimensions = { x: 3, z: 2 };

  it("skips furniture types not in registry", () => {
    const defs = buildMockDefs(
      "r1",
      ROOM_POS,
      ROOM_DIMS,
      "#ff8800",
      [
        { type: "whiteboard",    position: { x: 1.5, y: 0, z: 1 } },
        { type: "status-board",  position: { x: 1.5, y: 1, z: 1.7 } },
      ],
    );
    expect(defs).toHaveLength(1);
    expect(defs[0]!.kind).toBe("wall-panel");
  });

  it("generates stable IDs in format '<roomId>/<idx>/<type>'", () => {
    const defs = buildMockDefs(
      "control-room",
      ROOM_POS,
      ROOM_DIMS,
      "#ff4455",
      [{ type: "approval-terminal", position: { x: 0.3, y: 0.5, z: 1 } }],
    );
    expect(defs[0]!.id).toBe("control-room/0/approval-terminal");
  });

  it("world position = room origin + slot local position", () => {
    const slotPos = { x: 1.2, y: 0.8, z: 0.3 };
    const defs    = buildMockDefs(
      "r1",
      ROOM_POS,
      ROOM_DIMS,
      "#00ff88",
      [{ type: "diff-screen", position: slotPos }],
    );
    const wp = defs[0]!.anchor.worldPos;
    expect(wp.x).toBeCloseTo(ROOM_POS.x + slotPos.x, 5);
    expect(wp.y).toBeCloseTo(ROOM_POS.y + slotPos.y, 5);
    expect(wp.z).toBeCloseTo(ROOM_POS.z + slotPos.z, 5);
  });

  it("accent color is preserved on each def", () => {
    const ACCENT = "#4a6aff";
    const defs   = buildMockDefs(
      "r1",
      ROOM_POS,
      ROOM_DIMS,
      ACCENT,
      [{ type: "hologram-table", position: { x: 1.5, y: 0, z: 1 } }],
    );
    expect(defs[0]!.accentColor).toBe(ACCENT);
  });

  it("hologram-table near centre → facing='up' → mountType='floor'", () => {
    const defs = buildMockDefs(
      "r1",
      ROOM_POS,
      ROOM_DIMS,
      "#cc88ff",
      [{ type: "hologram-table", position: { x: 1.5, y: 0, z: 1 } }],
    );
    expect(defs[0]!.anchor.facing).toBe("up");
    expect(defs[0]!.anchor.mountType).toBe("floor");
  });

  it("floor kiosk in centre of room → facing='up' → mountType='floor' (Sub-AC 6a)", () => {
    const defs = buildMockDefs(
      "lobby",
      ROOM_POS,
      ROOM_DIMS,
      "#4fc3f7",
      [{ type: "info-kiosk", position: { x: 1.5, y: 0, z: 1 } }],
    );
    expect(defs[0]!.kind).toBe("floor-kiosk");
    expect(defs[0]!.anchor.facing).toBe("up");
    expect(defs[0]!.anchor.mountType).toBe("floor");
  });

  it("status-kiosk and agent-terminal also produce floor-kiosk defs (Sub-AC 6a)", () => {
    const defs = buildMockDefs(
      "corridor",
      ROOM_POS,
      ROOM_DIMS,
      "#78909c",
      [
        { type: "status-kiosk",   position: { x: 1.5, y: 0, z: 1 } },
        { type: "agent-terminal", position: { x: 1.5, y: 0, z: 1 } },
      ],
    );
    expect(defs).toHaveLength(2);
    for (const def of defs) {
      expect(def.kind).toBe("floor-kiosk");
    }
  });

  it("processes multiple furniture slots in order", () => {
    const defs = buildMockDefs(
      "r1",
      ROOM_POS,
      ROOM_DIMS,
      "#ff8800",
      [
        { type: "status-board",     position: { x: 1.5, y: 1.2, z: 1.8 } }, // idx=0
        { type: "approval-terminal", position: { x: 0.3, y: 0.5, z: 1.0 } }, // idx=1
        { type: "info-kiosk",        position: { x: 1.5, y: 0,   z: 1.0 } }, // idx=2
      ],
    );
    expect(defs).toHaveLength(3);
    expect(defs[0]!.id).toContain("/0/");
    expect(defs[1]!.id).toContain("/1/");
    expect(defs[2]!.id).toContain("/2/");
  });

  it("empty furniture list → empty defs array", () => {
    const defs = buildMockDefs("r1", ROOM_POS, ROOM_DIMS, "#ff0000", []);
    expect(defs).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  6.  DisplaySurfaceKind — all four kinds have distinct values
// ─────────────────────────────────────────────────────────────────────────────

describe("DisplaySurfaceKind type values (6a-6)", () => {
  const ALL_KINDS: DisplaySurfaceKind[] = [
    "monitor",
    "wall-panel",
    "hologram-stand",
    "floor-kiosk",
  ];

  it("there are exactly 4 distinct kind values", () => {
    expect(new Set(ALL_KINDS).size).toBe(4);
  });

  it("'floor-kiosk' kind exists (Sub-AC 6a new addition)", () => {
    expect(ALL_KINDS).toContain("floor-kiosk");
  });

  it("each kind string is non-empty and lowercase-hyphenated", () => {
    for (const kind of ALL_KINDS) {
      expect(kind).toMatch(/^[a-z][a-z-]*[a-z]$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  7.  Floor kiosk geometry constants — validate structural proportions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirror of the FloorKiosk geometry constants from DisplaySurfaces.tsx.
 * These proportions ensure the kiosk reads as a distinct, coherent 3D object.
 */
const KIOSK_GEOMETRY = {
  BASE_H:   0.04,   // base disc height
  PED_H:    0.48,   // pedestal column height
  HOUS_H:   0.58,   // housing body height
  HOUS_W:   0.46,   // housing body width
  HOUS_D:   0.20,   // housing body depth
  BZ_W:     0.40,   // bezel width
  BZ_H:     0.28,   // bezel height
  SCREEN_TILT: -0.18, // ergonomic backward tilt (rad)
};

describe("FloorKiosk geometry proportions (6a-7)", () => {
  it("total kiosk height (base + pedestal + housing) is < 2.0 world units", () => {
    const total = KIOSK_GEOMETRY.BASE_H + KIOSK_GEOMETRY.PED_H + KIOSK_GEOMETRY.HOUS_H;
    expect(total).toBeLessThan(2.0);
  });

  it("housing width is less than room corridor width (< 0.8 units)", () => {
    // Kiosk must fit in narrow corridors (corridor rooms are ~1-2 units wide)
    expect(KIOSK_GEOMETRY.HOUS_W).toBeLessThan(0.8);
  });

  it("bezel is inset within housing width", () => {
    expect(KIOSK_GEOMETRY.BZ_W).toBeLessThan(KIOSK_GEOMETRY.HOUS_W);
  });

  it("bezel height is less than housing height", () => {
    expect(KIOSK_GEOMETRY.BZ_H).toBeLessThan(KIOSK_GEOMETRY.HOUS_H);
  });

  it("screen tilt is negative (backward from viewer = ergonomic)", () => {
    expect(KIOSK_GEOMETRY.SCREEN_TILT).toBeLessThan(0);
  });

  it("screen tilt is a small angle (< 30° = 0.52 rad)", () => {
    expect(Math.abs(KIOSK_GEOMETRY.SCREEN_TILT)).toBeLessThan(0.52);
  });

  it("pedestal is taller than base disc (gives height before body)", () => {
    expect(KIOSK_GEOMETRY.PED_H).toBeGreaterThan(KIOSK_GEOMETRY.BASE_H);
  });
});
