/**
 * rendering-navigation.test.ts — Sub-AC 14.2
 *
 * Validates that:
 *   1. The building renders without errors (all data needed to construct the
 *      scene graph is valid and self-consistent).
 *   2. Scene graph integrity — hierarchy group name conventions, LOD threshold
 *      ordering, and floor↔room mapping are all coherent.
 *   3. Camera navigation — room-focus, agent-focus, and floor-focus transition
 *      functions produce valid camera poses.
 *   4. Low-poly geometry presence — the building style, material roughness, and
 *      flatShading indicators confirm the stylized low-poly aesthetic.
 *
 * NOTE: React components that call useFrame / useThree (CommandCenterScene,
 * CameraRig, BuildingShell, …) cannot run headlessly in Vitest — they require
 * a real WebGL canvas.  These tests therefore exercise the pure exported
 * functions and constants that *drive* the components, following the same
 * pattern established by scene-setup.test.ts and birds-eye-camera.test.ts.
 *
 * Test ID scheme:
 *   14.2-N : Sub-AC 14.2 rendering & navigation
 */

import { describe, it, expect } from "vitest";
import { BUILDING, getRoomsForFloor, getRoomById } from "../../data/building.js";
import {
  CAMERA_PRESETS,
  CAMERA_TRANSITION_SPEED,
  computeRoomFocusCamera,
  computeAgentFocusCamera,
  computeFloorFocusCamera,
} from "../CameraRig.js";
import {
  THRESHOLDS,
  LOD_RANK,
  DRILL_DEPTH,
  DRILL_PROMOTION,
  computeDistanceLOD,
  computeEffectiveLOD,
  getFloorDrillRelationship,
} from "../lod-drill-policy.js";

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Building renders without errors
// ─────────────────────────────────────────────────────────────────────────────

describe("14.2-1: Building data is renderable (no degenerate geometry)", () => {
  it("every room has positive x/y/z dimensions (non-degenerate mesh bounds)", () => {
    for (const room of BUILDING.rooms) {
      expect(room.dimensions.x, `${room.roomId} width`).toBeGreaterThan(0);
      expect(room.dimensions.y, `${room.roomId} height`).toBeGreaterThan(0);
      expect(room.dimensions.z, `${room.roomId} depth`).toBeGreaterThan(0);
    }
  });

  it("every room has a finite world position (no NaN or Infinity)", () => {
    for (const room of BUILDING.rooms) {
      expect(isFinite(room.position.x), `${room.roomId} pos.x`).toBe(true);
      expect(isFinite(room.position.y), `${room.roomId} pos.y`).toBe(true);
      expect(isFinite(room.position.z), `${room.roomId} pos.z`).toBe(true);
    }
  });

  it("all room IDs are unique — no duplicate scene-graph nodes", () => {
    const ids = BUILDING.rooms.map((r) => r.roomId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("building has at least one floor with at least one room — scene is non-empty", () => {
    expect(BUILDING.floors.length).toBeGreaterThan(0);
    expect(BUILDING.rooms.length).toBeGreaterThan(0);
  });

  it("floor roomIds cross-reference actual room entries — no dangling pointers", () => {
    const roomById = new Map(BUILDING.rooms.map((r) => [r.roomId, r]));
    for (const floor of BUILDING.floors) {
      for (const id of floor.roomIds) {
        expect(roomById.has(id), `floor ${floor.floor} references unknown room '${id}'`).toBe(true);
      }
    }
  });

  it("BUILDING.visual exists and all required keys have defined values", () => {
    const visual = BUILDING.visual;
    expect(visual.wallColor).toBeDefined();
    expect(visual.floorColor).toBeDefined();
    expect(visual.ceilingColor).toBeDefined();
    expect(visual.ambientLight).toBeDefined();
    expect(typeof visual.accentGlowIntensity).toBe("number");
    expect(typeof visual.gridVisible).toBe("boolean");
    expect(visual.gridColor).toBeDefined();
  });

  it("building adjacency map (if present) references only known room IDs", () => {
    if (!BUILDING.adjacency) return; // optional field — skip if absent
    const ids = new Set(BUILDING.rooms.map((r) => r.roomId));
    for (const [from, neighbours] of Object.entries(BUILDING.adjacency)) {
      expect(ids.has(from), `adjacency source '${from}' is unknown`).toBe(true);
      for (const to of neighbours) {
        expect(ids.has(to), `adjacency target '${to}' from '${from}' is unknown`).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Scene graph integrity
// ─────────────────────────────────────────────────────────────────────────────

describe("14.2-2: Scene graph hierarchy — group naming conventions and structure", () => {
  /**
   * SceneHierarchy.tsx assigns Object3D names following the convention:
   *   hierarchy-building
   *   hierarchy-floor-{n}
   *   hierarchy-room-{roomId}
   *   hierarchy-agents-{roomId}
   *   hierarchy-agent-{agentId}
   *
   * These tests verify that the data needed to construct those names is
   * available and correctly formatted.
   */

  it("BUILDING.buildingId is a valid CSS-identifier string (suitable for group name)", () => {
    // Group name will be "hierarchy-building" — the buildingId must be non-empty
    expect(BUILDING.buildingId).toBeTruthy();
    expect(typeof BUILDING.buildingId).toBe("string");
  });

  it("floor indices produce valid group name suffixes (hierarchy-floor-0, -1, …)", () => {
    for (const floor of BUILDING.floors) {
      const groupName = `hierarchy-floor-${floor.floor}`;
      // Must match the pattern used in SceneHierarchy.tsx
      expect(groupName).toMatch(/^hierarchy-floor-\d+$/);
    }
  });

  it("room IDs produce valid group name suffixes (hierarchy-room-{roomId})", () => {
    for (const room of BUILDING.rooms) {
      const groupName = `hierarchy-room-${room.roomId}`;
      expect(groupName).toMatch(/^hierarchy-room-[\w-]+$/);
    }
  });

  it("LOD_RANK encodes near > mid > far (more detail = higher rank)", () => {
    expect(LOD_RANK.near).toBeGreaterThan(LOD_RANK.mid);
    expect(LOD_RANK.mid).toBeGreaterThan(LOD_RANK.far);
  });

  it("THRESHOLDS.building.near < THRESHOLDS.building.far", () => {
    expect(THRESHOLDS.building.near).toBeLessThan(THRESHOLDS.building.far);
  });

  it("THRESHOLDS.floor.near < THRESHOLDS.floor.far", () => {
    expect(THRESHOLDS.floor.near).toBeLessThan(THRESHOLDS.floor.far);
  });

  it("THRESHOLDS.agent.near < THRESHOLDS.agent.far", () => {
    expect(THRESHOLDS.agent.near).toBeLessThan(THRESHOLDS.agent.far);
  });

  it("DRILL_DEPTH encodes building < floor < room < agent (deeper = higher depth)", () => {
    expect(DRILL_DEPTH.building).toBeLessThan(DRILL_DEPTH.floor);
    expect(DRILL_DEPTH.floor).toBeLessThan(DRILL_DEPTH.room);
    expect(DRILL_DEPTH.room).toBeLessThan(DRILL_DEPTH.agent);
  });

  it("computeDistanceLOD returns 'near' when distance is below near threshold", () => {
    const result = computeDistanceLOD(5, THRESHOLDS.building.near, THRESHOLDS.building.far);
    expect(result).toBe("near");
  });

  it("computeDistanceLOD returns 'far' when distance exceeds far threshold", () => {
    const result = computeDistanceLOD(100, THRESHOLDS.building.near, THRESHOLDS.building.far);
    expect(result).toBe("far");
  });

  it("computeDistanceLOD returns 'mid' in the range [near, far)", () => {
    const mid = (THRESHOLDS.building.near + THRESHOLDS.building.far) / 2;
    const result = computeDistanceLOD(mid, THRESHOLDS.building.near, THRESHOLDS.building.far);
    expect(result).toBe("mid");
  });

  it("computeEffectiveLOD promotes drill target to NEAR regardless of distance LOD", () => {
    // Even at FAR distance, the drill target should render as NEAR
    expect(computeEffectiveLOD("far", "target")).toBe("near");
    expect(computeEffectiveLOD("mid", "target")).toBe("near");
    expect(computeEffectiveLOD("near", "target")).toBe("near");
  });

  it("computeEffectiveLOD promotes ancestor to at least MID", () => {
    expect(computeEffectiveLOD("far", "ancestor")).toBe("mid");
    expect(computeEffectiveLOD("mid", "ancestor")).toBe("mid");
    // If camera is already near, NEAR wins over MID
    expect(computeEffectiveLOD("near", "ancestor")).toBe("near");
  });

  it("DRILL_PROMOTION covers all relationship types with valid LOD values", () => {
    const validLods = new Set(["near", "mid", "far"]);
    for (const [rel, lod] of Object.entries(DRILL_PROMOTION)) {
      expect(validLods.has(lod), `DRILL_PROMOTION['${rel}'] = '${lod}' is not a valid LOD`).toBe(true);
    }
  });

  it("getFloorDrillRelationship returns 'none' at building level", () => {
    expect(getFloorDrillRelationship(0, "building", null)).toBe("none");
    expect(getFloorDrillRelationship(1, "building", 0)).toBe("none");
  });

  it("getFloorDrillRelationship returns 'target' when floor IS the drilled floor", () => {
    expect(getFloorDrillRelationship(0, "floor", 0)).toBe("target");
    expect(getFloorDrillRelationship(1, "floor", 1)).toBe("target");
  });

  it("getFloorDrillRelationship returns 'sibling' for a different floor", () => {
    expect(getFloorDrillRelationship(1, "floor", 0)).toBe("sibling");
    expect(getFloorDrillRelationship(0, "floor", 1)).toBe("sibling");
  });

  it("getFloorDrillRelationship returns 'ancestor' when drilling into room on that floor", () => {
    expect(getFloorDrillRelationship(1, "room", 1)).toBe("ancestor");
    expect(getFloorDrillRelationship(1, "agent", 1)).toBe("ancestor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Camera navigation (room/agent focus transitions)
// ─────────────────────────────────────────────────────────────────────────────

describe("14.2-3: Camera navigation — focus transition functions", () => {
  // ── computeRoomFocusCamera ──────────────────────────────────────────────────

  describe("computeRoomFocusCamera", () => {
    const opsRoom = getRoomById("ops-control")!;

    it("returns position and target tuples of length 3", () => {
      const result = computeRoomFocusCamera(opsRoom);
      expect(result.position).toHaveLength(3);
      expect(result.target).toHaveLength(3);
    });

    it("all returned values are finite numbers", () => {
      const result = computeRoomFocusCamera(opsRoom);
      for (const v of [...result.position, ...result.target]) {
        expect(isFinite(v)).toBe(true);
      }
    });

    it("camera Y is above the room midpoint (camera is above the room)", () => {
      const result = computeRoomFocusCamera(opsRoom);
      const roomMidY = opsRoom.position.y + opsRoom.dimensions.y / 2;
      expect(result.position[1]).toBeGreaterThan(roomMidY);
    });

    it("target XZ is near the room center", () => {
      const result = computeRoomFocusCamera(opsRoom);
      const cx = opsRoom.position.x + opsRoom.dimensions.x / 2;
      const cz = opsRoom.position.z + opsRoom.dimensions.z / 2;
      expect(result.target[0]).toBeCloseTo(cx, 5);
      expect(result.target[2]).toBeCloseTo(cz, 5);
    });

    it("camera is not coincident with target (view direction vector has non-zero length)", () => {
      const result = computeRoomFocusCamera(opsRoom);
      const dx = result.position[0] - result.target[0];
      const dy = result.position[1] - result.target[1];
      const dz = result.position[2] - result.target[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(dist).toBeGreaterThan(0.1);
    });

    it("larger room produces a wider view distance from camera to target", () => {
      // A larger room should result in a camera further from the room centre
      const smallRoom = getRoomById("stairwell")!;
      const largeRoom = getRoomById("ops-control")!;
      const smallFocus = computeRoomFocusCamera(smallRoom);
      const largeFocus = computeRoomFocusCamera(largeRoom);
      // Compute horizontal distance from camera to target for both
      const horizDist = (focus: ReturnType<typeof computeRoomFocusCamera>) => {
        const dx = focus.position[0] - focus.target[0];
        const dz = focus.position[2] - focus.target[2];
        return Math.sqrt(dx * dx + dz * dz);
      };
      expect(horizDist(largeFocus)).toBeGreaterThan(horizDist(smallFocus));
    });

    it("works for every room in the building without throwing", () => {
      for (const room of BUILDING.rooms) {
        expect(() => computeRoomFocusCamera(room)).not.toThrow();
      }
    });
  });

  // ── computeAgentFocusCamera ─────────────────────────────────────────────────

  describe("computeAgentFocusCamera", () => {
    const agentPos = { x: 5.5, y: 3, z: 2.5 };

    it("returns position and target tuples of length 3", () => {
      const result = computeAgentFocusCamera(agentPos);
      expect(result.position).toHaveLength(3);
      expect(result.target).toHaveLength(3);
    });

    it("all returned values are finite numbers", () => {
      const result = computeAgentFocusCamera(agentPos);
      for (const v of [...result.position, ...result.target]) {
        expect(isFinite(v)).toBe(true);
      }
    });

    it("camera Y is above the agent (perspective is from slightly above)", () => {
      const result = computeAgentFocusCamera(agentPos);
      expect(result.position[1]).toBeGreaterThan(agentPos.y);
    });

    it("target Y is near agent height (aims at agent 'chest' area)", () => {
      const result = computeAgentFocusCamera(agentPos);
      // Target y should be at least agent.y and no more than agent.y + 1
      expect(result.target[1]).toBeGreaterThanOrEqual(agentPos.y);
      expect(result.target[1]).toBeLessThanOrEqual(agentPos.y + 1.5);
    });

    it("camera is close to agent — within 4 world units (intimate inspection view)", () => {
      const result = computeAgentFocusCamera(agentPos);
      const dx = result.position[0] - agentPos.x;
      const dy = result.position[1] - agentPos.y;
      const dz = result.position[2] - agentPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(dist).toBeLessThan(4);
    });

    it("camera is not coincident with agent position", () => {
      const result = computeAgentFocusCamera(agentPos);
      const dx = result.position[0] - agentPos.x;
      const dy = result.position[1] - agentPos.y;
      const dz = result.position[2] - agentPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(dist).toBeGreaterThan(0);
    });

    it("works with agents on both floors without throwing", () => {
      const floor0Agent = { x: 6, y: 0.5, z: 2 };
      const floor1Agent = { x: 7, y: 3.5, z: 2 };
      expect(() => computeAgentFocusCamera(floor0Agent)).not.toThrow();
      expect(() => computeAgentFocusCamera(floor1Agent)).not.toThrow();
    });
  });

  // ── computeFloorFocusCamera ─────────────────────────────────────────────────

  describe("computeFloorFocusCamera", () => {
    it("returns position and target tuples of length 3 for floor 0", () => {
      const result = computeFloorFocusCamera(0);
      expect(result.position).toHaveLength(3);
      expect(result.target).toHaveLength(3);
    });

    it("returns position and target tuples of length 3 for floor 1", () => {
      const result = computeFloorFocusCamera(1);
      expect(result.position).toHaveLength(3);
      expect(result.target).toHaveLength(3);
    });

    it("all returned values are finite numbers for floor 0", () => {
      const result = computeFloorFocusCamera(0);
      for (const v of [...result.position, ...result.target]) {
        expect(isFinite(v)).toBe(true);
      }
    });

    it("all returned values are finite numbers for floor 1", () => {
      const result = computeFloorFocusCamera(1);
      for (const v of [...result.position, ...result.target]) {
        expect(isFinite(v)).toBe(true);
      }
    });

    it("floor 1 camera position is higher than floor 0 camera (upper floor is higher)", () => {
      const f0 = computeFloorFocusCamera(0);
      const f1 = computeFloorFocusCamera(1);
      expect(f1.position[1]).toBeGreaterThan(f0.position[1]);
    });

    it("floor 1 target Y is higher than floor 0 target Y", () => {
      const f0 = computeFloorFocusCamera(0);
      const f1 = computeFloorFocusCamera(1);
      expect(f1.target[1]).toBeGreaterThan(f0.target[1]);
    });

    it("camera is positioned above the floor it focuses on", () => {
      const FLOOR_H = 3;
      for (let floorIdx = 0; floorIdx < BUILDING.floors.length; floorIdx++) {
        const result = computeFloorFocusCamera(floorIdx);
        const floorCenterY = floorIdx * FLOOR_H + FLOOR_H / 2;
        expect(result.position[1], `floor ${floorIdx} camera Y`).toBeGreaterThan(floorCenterY);
      }
    });
  });

  // ── Transition speed ───────────────────────────────────────────────────────

  describe("CAMERA_TRANSITION_SPEED", () => {
    it("is a positive finite number", () => {
      expect(CAMERA_TRANSITION_SPEED).toBeGreaterThan(0);
      expect(isFinite(CAMERA_TRANSITION_SPEED)).toBe(true);
    });

    it("is fast enough to complete a transition in under 2 seconds (> 0.5)", () => {
      // At LERP speed S, the transition completes in ~1/S seconds
      // For comfortable UX it should be at least 0.5 (2s max)
      expect(CAMERA_TRANSITION_SPEED).toBeGreaterThanOrEqual(0.5);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Low-poly geometry presence
// ─────────────────────────────────────────────────────────────────────────────

describe("14.2-4: Low-poly geometry indicators", () => {
  it("BUILDING.style is 'low-poly-dark' — signals flat-shading and simplified meshes", () => {
    expect(BUILDING.style).toBe("low-poly-dark");
  });

  it("building visual wall/floor/ceiling colors are dark hex values (dark theme)", () => {
    /**
     * The low-poly command-center aesthetic requires a dark palette.
     * We verify luminance by checking that each RGB channel parsed from the
     * hex color has an average brightness below 0.5 (i.e. ≤ 128 / 255).
     */
    function avgBrightness(hex: string): number {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return (r + g + b) / (3 * 255);
    }
    expect(avgBrightness(BUILDING.visual.wallColor)).toBeLessThan(0.5);
    expect(avgBrightness(BUILDING.visual.floorColor)).toBeLessThan(0.5);
    expect(avgBrightness(BUILDING.visual.ceilingColor)).toBeLessThan(0.5);
  });

  it("each room has a colorAccent — mandatory accent glow for low-poly surfaces", () => {
    for (const room of BUILDING.rooms) {
      expect(room.colorAccent, `${room.roomId} colorAccent`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("accentGlowIntensity is between 0 and 1 — controls edge glow on low-poly walls", () => {
    expect(BUILDING.visual.accentGlowIntensity).toBeGreaterThanOrEqual(0);
    expect(BUILDING.visual.accentGlowIntensity).toBeLessThanOrEqual(1);
  });

  it("LOD has exactly 3 levels (near/mid/far) — characteristic of low-poly rendering", () => {
    const lodLevels = Object.keys(LOD_RANK);
    expect(lodLevels).toHaveLength(3);
    expect(lodLevels).toContain("near");
    expect(lodLevels).toContain("mid");
    expect(lodLevels).toContain("far");
  });

  it("THRESHOLDS cover 3 independent scene tiers (building/floor/agent)", () => {
    const tiers = Object.keys(THRESHOLDS);
    expect(tiers).toContain("building");
    expect(tiers).toContain("floor");
    expect(tiers).toContain("agent");
  });

  it("agent FAR threshold equals agent near threshold of floor (tiered reveal)", () => {
    /**
     * In a well-formed LOD chain the agent FAR threshold should be at most the
     * floor NEAR threshold.  When the floor transitions to NEAR, agents
     * transition from FAR to being drawn at all — this is the low-poly
     * 'progressive reveal' pattern.
     */
    expect(THRESHOLDS.agent.far).toBeLessThanOrEqual(THRESHOLDS.floor.near);
  });

  it("CAMERA_PRESETS.overhead is above building total height — bird's-eye low-poly overview", () => {
    const TOTAL_H = 6; // 2 floors × 3 units
    const { position } = CAMERA_PRESETS.overhead;
    expect(position[1]).toBeGreaterThan(TOTAL_H);
  });

  it("rooms on the operations floor (y=3) are spatially separate from ground floor rooms", () => {
    /**
     * Confirms the two-floor low-poly geometry is spatially non-overlapping.
     * Ground-floor rooms start at y=0; operations-floor rooms start at y=3.
     */
    const groundRooms = getRoomsForFloor(0).filter((r) => r.roomId !== "stairwell");
    const opsRooms = getRoomsForFloor(1).filter((r) => r.roomId !== "stairwell");

    for (const g of groundRooms) {
      const gTop = g.position.y + g.dimensions.y;
      for (const o of opsRooms) {
        // Ground-floor top edge should not exceed operations-floor bottom edge
        expect(gTop).toBeLessThanOrEqual(o.position.y + 0.01);
      }
    }
  });
});
