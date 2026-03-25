/**
 * birds-eye-overlay.test.ts — Unit tests for Sub-AC 3.1: BirdsEyeOverlay.
 *
 * Tests the pure-logic exports of BirdsEyeOverlay.tsx:
 *
 *   1. Layout constants: FLOOR_HEIGHT, CEILING_OFFSET, BUILDING_W, BUILDING_D
 *   2. FLOOR_DEPARTMENTS: correct labels for each floor index
 *   3. ROOM_TYPE_DISPLAY: correct abbreviations for each room type
 *   4. computeAgentsByRoom: correctly maps agent records to room-agent counts
 *   5. computeFloorStats: correctly aggregates room/agent counts per floor
 *
 * NOTE: BirdsEyeOverlay itself uses useFrame/useThree from @react-three/fiber
 * and cannot run in a headless Vitest environment.  These tests validate the
 * exported constants and pure helper functions that drive the component's
 * data aggregation logic.
 *
 * Test ID scheme:
 *   3.1-N : Sub-AC 3.1 bird's-eye overlay
 */

import { describe, it, expect } from "vitest";
import {
  FLOOR_HEIGHT,
  CEILING_OFFSET,
  FLOOR_DEPARTMENTS,
  ROOM_TYPE_DISPLAY,
  computeAgentsByRoom,
  computeFloorStats,
  type RoomFloorStats,
} from "../BirdsEyeOverlay.js";

// ── 1. Layout constants (3.1-1) ───────────────────────────────────────────────

describe("BirdsEyeOverlay layout constants (3.1-1)", () => {
  it("FLOOR_HEIGHT is 3 grid units (matches _building.yaml + RoomGeometry.tsx)", () => {
    expect(FLOOR_HEIGHT).toBe(3);
  });

  it("CEILING_OFFSET is a small positive offset above ceiling", () => {
    expect(CEILING_OFFSET).toBeGreaterThan(0);
    expect(CEILING_OFFSET).toBeLessThan(0.5); // must not push labels too high
  });

  it("CEILING_OFFSET is defined and numeric", () => {
    expect(typeof CEILING_OFFSET).toBe("number");
    expect(Number.isFinite(CEILING_OFFSET)).toBe(true);
  });
});

// ── 2. FLOOR_DEPARTMENTS annotations (3.1-2) ─────────────────────────────────

describe("FLOOR_DEPARTMENTS labels (3.1-2)", () => {
  it("defines labels for floor 0 (Ground Floor)", () => {
    expect(FLOOR_DEPARTMENTS[0]).toBeDefined();
    expect(typeof FLOOR_DEPARTMENTS[0]).toBe("string");
    expect(FLOOR_DEPARTMENTS[0].length).toBeGreaterThan(0);
  });

  it("defines labels for floor 1 (Operations Floor)", () => {
    expect(FLOOR_DEPARTMENTS[1]).toBeDefined();
    expect(typeof FLOOR_DEPARTMENTS[1]).toBe("string");
    expect(FLOOR_DEPARTMENTS[1].length).toBeGreaterThan(0);
  });

  it("floor 0 label references entry/records semantics", () => {
    const label = FLOOR_DEPARTMENTS[0]?.toUpperCase() ?? "";
    // Should contain some indication of ground-floor entry or record-keeping
    const hasExpectedContent = label.includes("ENTRY") || label.includes("RECORD") || label.includes("LOBBY");
    expect(hasExpectedContent).toBe(true);
  });

  it("floor 1 label references operations/agent semantics", () => {
    const label = FLOOR_DEPARTMENTS[1]?.toUpperCase() ?? "";
    const hasExpectedContent = label.includes("OPER") || label.includes("AGENT") || label.includes("ACTIVE");
    expect(hasExpectedContent).toBe(true);
  });

  it("floor 0 and floor 1 labels are distinct", () => {
    expect(FLOOR_DEPARTMENTS[0]).not.toBe(FLOOR_DEPARTMENTS[1]);
  });
});

// ── 3. ROOM_TYPE_DISPLAY abbreviations (3.1-3) ───────────────────────────────

describe("ROOM_TYPE_DISPLAY abbreviations (3.1-3)", () => {
  const EXPECTED_TYPES = ["control", "office", "lab", "lobby", "archive", "corridor"] as const;

  it("defines an abbreviation for every room type", () => {
    for (const roomType of EXPECTED_TYPES) {
      expect(ROOM_TYPE_DISPLAY[roomType]).toBeDefined();
      expect(typeof ROOM_TYPE_DISPLAY[roomType]).toBe("string");
    }
  });

  it("all abbreviations are non-empty strings", () => {
    for (const roomType of EXPECTED_TYPES) {
      expect(ROOM_TYPE_DISPLAY[roomType]!.length).toBeGreaterThan(0);
    }
  });

  it("all abbreviations are ≤ 4 characters (fits narrow rooms in bird's-eye)", () => {
    for (const roomType of EXPECTED_TYPES) {
      expect(ROOM_TYPE_DISPLAY[roomType]!.length).toBeLessThanOrEqual(4);
    }
  });

  it("all abbreviations are uppercase", () => {
    for (const roomType of EXPECTED_TYPES) {
      const abbrev = ROOM_TYPE_DISPLAY[roomType]!;
      expect(abbrev).toBe(abbrev.toUpperCase());
    }
  });

  it("control → CMD", () => {
    expect(ROOM_TYPE_DISPLAY["control"]).toBe("CMD");
  });

  it("office → OFC", () => {
    expect(ROOM_TYPE_DISPLAY["office"]).toBe("OFC");
  });

  it("lab → LAB", () => {
    expect(ROOM_TYPE_DISPLAY["lab"]).toBe("LAB");
  });

  it("corridor → PATH", () => {
    expect(ROOM_TYPE_DISPLAY["corridor"]).toBe("PATH");
  });
});

// ── 4. computeAgentsByRoom (3.1-4) ────────────────────────────────────────────

describe("computeAgentsByRoom (3.1-4)", () => {
  it("returns empty map for empty agents record", () => {
    const result = computeAgentsByRoom({});
    expect(result).toEqual({});
  });

  it("counts a single agent in its room", () => {
    const agents = {
      agent1: { roomId: "ops-control" },
    };
    const result = computeAgentsByRoom(agents);
    expect(result["ops-control"]).toBe(1);
  });

  it("counts multiple agents in the same room", () => {
    const agents = {
      agent1: { roomId: "ops-control" },
      agent2: { roomId: "ops-control" },
      agent3: { roomId: "ops-control" },
    };
    const result = computeAgentsByRoom(agents);
    expect(result["ops-control"]).toBe(3);
  });

  it("correctly distributes agents across different rooms", () => {
    const agents = {
      agent1: { roomId: "ops-control" },
      agent2: { roomId: "research-lab" },
      agent3: { roomId: "ops-control" },
    };
    const result = computeAgentsByRoom(agents);
    expect(result["ops-control"]).toBe(2);
    expect(result["research-lab"]).toBe(1);
  });

  it("does not include rooms with zero agents", () => {
    const agents = {
      agent1: { roomId: "room-a" },
    };
    const result = computeAgentsByRoom(agents);
    expect(result["room-b"]).toBeUndefined();
  });

  it("handles agents with empty string roomId gracefully", () => {
    const agents = {
      agent1: { roomId: "" },
    };
    // Empty string is falsy — should not be counted
    const result = computeAgentsByRoom(agents);
    // Either not in map or zero
    expect(result[""] ?? 0).toBe(0);
  });

  it("total count across all rooms equals total agent count", () => {
    const agents = {
      a: { roomId: "r1" },
      b: { roomId: "r2" },
      c: { roomId: "r1" },
      d: { roomId: "r3" },
    };
    const result = computeAgentsByRoom(agents);
    const total = Object.values(result).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(4);
  });
});

// ── 5. computeFloorStats (3.1-5) ──────────────────────────────────────────────

describe("computeFloorStats (3.1-5)", () => {
  // Minimal room shape accepted by computeFloorStats (structural subset of RoomDef)
  function makeRoom(roomId: string, floor: number): RoomFloorStats {
    return { roomId, floor };
  }

  it("returns empty map for empty rooms array", () => {
    const result = computeFloorStats([], {});
    expect(result).toEqual({});
  });

  it("counts rooms on a single floor", () => {
    const rooms = [
      makeRoom("r1", 0),
      makeRoom("r2", 0),
    ];
    const result = computeFloorStats(rooms, {});
    expect(result[0]).toBeDefined();
    expect(result[0]!.roomCount).toBe(2);
  });

  it("sums agent counts for rooms on the same floor", () => {
    const rooms = [
      makeRoom("r1", 0),
      makeRoom("r2", 0),
    ];
    const agentsByRoom = { r1: 2, r2: 3 };
    const result = computeFloorStats(rooms, agentsByRoom);
    expect(result[0]!.agentCount).toBe(5);
  });

  it("separates stats for different floors", () => {
    const rooms = [
      makeRoom("r1", 0),
      makeRoom("r2", 1),
    ];
    const agentsByRoom = { r1: 2, r2: 1 };
    const result = computeFloorStats(rooms, agentsByRoom);
    expect(result[0]!.roomCount).toBe(1);
    expect(result[0]!.agentCount).toBe(2);
    expect(result[1]!.roomCount).toBe(1);
    expect(result[1]!.agentCount).toBe(1);
  });

  it("agentCount is 0 for rooms with no agents", () => {
    const rooms = [makeRoom("r1", 0)];
    const result = computeFloorStats(rooms, {});
    expect(result[0]!.agentCount).toBe(0);
  });

  it("total roomCount across all floors equals rooms array length", () => {
    const rooms = [
      makeRoom("r1", 0),
      makeRoom("r2", 0),
      makeRoom("r3", 1),
    ];
    const result = computeFloorStats(rooms, {});
    const totalRooms = Object.values(result).reduce((sum, s) => sum + s.roomCount, 0);
    expect(totalRooms).toBe(rooms.length);
  });

  it("handles a building with 3+ floors", () => {
    const rooms = [
      makeRoom("r1", 0),
      makeRoom("r2", 1),
      makeRoom("r3", 2),
    ];
    const result = computeFloorStats(rooms, { r1: 1, r2: 2, r3: 3 });
    expect(result[0]!.agentCount).toBe(1);
    expect(result[1]!.agentCount).toBe(2);
    expect(result[2]!.agentCount).toBe(3);
  });
});

// ── 6. Ceiling Y computation (specification test) (3.1-6) ────────────────────

describe("Ceiling Y position formula (3.1-6)", () => {
  /**
   * The ceiling Y for a room is: room.position.y + room.dimensions.y + CEILING_OFFSET.
   * Since floors are spaced FLOOR_HEIGHT apart:
   *   floor 0 ceiling = 0 + 3 + CEILING_OFFSET = 3 + CEILING_OFFSET
   *   floor 1 ceiling = 3 + 3 + CEILING_OFFSET = 6 + CEILING_OFFSET
   */

  function ceilingY(
    floorIndex: number,
    roomHeight: number = FLOOR_HEIGHT,
  ): number {
    const posY = floorIndex * FLOOR_HEIGHT;
    return posY + roomHeight + CEILING_OFFSET;
  }

  it("floor 0 ceiling Y = FLOOR_HEIGHT + CEILING_OFFSET", () => {
    expect(ceilingY(0)).toBeCloseTo(FLOOR_HEIGHT + CEILING_OFFSET, 6);
  });

  it("floor 1 ceiling Y = 2 * FLOOR_HEIGHT + CEILING_OFFSET", () => {
    expect(ceilingY(1)).toBeCloseTo(2 * FLOOR_HEIGHT + CEILING_OFFSET, 6);
  });

  it("ceiling Y increases monotonically with floor index", () => {
    expect(ceilingY(1)).toBeGreaterThan(ceilingY(0));
    expect(ceilingY(2)).toBeGreaterThan(ceilingY(1));
  });

  it("ceiling Y is always above room floor (posY)", () => {
    for (const floor of [0, 1, 2]) {
      const posY = floor * FLOOR_HEIGHT;
      expect(ceilingY(floor)).toBeGreaterThan(posY);
    }
  });
});
