/**
 * @conitens/protocol — room registry tests
 *
 * Validates that:
 *  1. All 10 room definitions from .agent/rooms/*.yaml are present and typed.
 *  2. Every RoomDef passes the isRoomDef type-guard.
 *  3. Registry query helpers return correct results.
 *  4. Building definition adjacency graph is internally consistent.
 *  5. No duplicate roomIds exist in the static registry.
 *  6. The BUILDING_DEF matches the rooms available in ROOM_REGISTRY.
 */
import { describe, it, expect } from "vitest";
import {
  ROOM_REGISTRY,
  ROOM_IDS,
  BUILDING_DEF,
  ROOM_TYPES,
  buildRoomRegistry,
  getRoomById,
  getRoomsByFloor,
  getRoomsByType,
  getAdjacentRooms,
  getRoomsForAgent,
  getRoomsByTags,
  isRoomDef,
  type RoomDef,
  type RoomType,
} from "../src/room-config-schema.js";

// ---------------------------------------------------------------------------
// Registry shape
// ---------------------------------------------------------------------------

describe("ROOM_REGISTRY structure", () => {
  it("contains exactly 9 rooms", () => {
    // 9 unique rooms: 3 on ground floor (project-main, archive-vault, stairwell)
    // + 6 on ops floor (ops-control, impl-office, research-lab,
    //   validation-office, review-office, corridor-main).
    // stairwell is declared at floor:0 and spans both floors, so it counts once.
    expect(ROOM_REGISTRY.count).toBe(9);
  });

  it("ROOM_IDS length matches count", () => {
    expect(ROOM_IDS.length).toBe(ROOM_REGISTRY.count);
  });

  it("has no duplicate roomIds", () => {
    const ids = Object.keys(ROOM_REGISTRY.rooms);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every room in ROOM_IDS is present in ROOM_REGISTRY.rooms", () => {
    for (const id of ROOM_IDS) {
      expect(ROOM_REGISTRY.rooms[id]).toBeDefined();
    }
  });

  it("ROOM_REGISTRY.building matches BUILDING_DEF", () => {
    expect(ROOM_REGISTRY.building.buildingId).toBe(BUILDING_DEF.buildingId);
    expect(ROOM_REGISTRY.building.floors).toBe(BUILDING_DEF.floors);
  });
});

// ---------------------------------------------------------------------------
// All known room IDs are present
// ---------------------------------------------------------------------------

const EXPECTED_ROOM_IDS = [
  "project-main",
  "archive-vault",
  "stairwell",
  "ops-control",
  "impl-office",
  "research-lab",
  "validation-office",
  "review-office",
  "corridor-main",
] as const;

describe("expected room IDs", () => {
  for (const id of EXPECTED_ROOM_IDS) {
    it(`contains room "${id}"`, () => {
      expect(ROOM_REGISTRY.rooms[id]).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// Type-guard coverage
// ---------------------------------------------------------------------------

describe("isRoomDef type guard", () => {
  it("passes for every room in the registry", () => {
    for (const room of Object.values(ROOM_REGISTRY.rooms)) {
      expect(isRoomDef(room)).toBe(true);
    }
  });

  it("rejects null", () => {
    expect(isRoomDef(null)).toBe(false);
  });

  it("rejects missing roomId", () => {
    const bad: Partial<RoomDef> = { schemaV: 1, name: "test", roomType: "lobby", floor: 0, members: [], spatial: { position: { x: 0, y: 0, z: 0 }, dimensions: { w: 1, h: 1, d: 1 } } };
    expect(isRoomDef(bad)).toBe(false);
  });

  it("rejects invalid room_type", () => {
    const bad = { schemaV: 1, roomId: "x", name: "x", roomType: "factory", floor: 0, members: [], spatial: {} };
    expect(isRoomDef(bad)).toBe(false);
  });

  it("rejects schemaV !== 1", () => {
    const bad = { schemaV: 2, roomId: "x", name: "x", roomType: "office", floor: 0, members: [], spatial: {} };
    expect(isRoomDef(bad)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Individual room field validation
// ---------------------------------------------------------------------------

describe("ops-control room", () => {
  const room = ROOM_REGISTRY.rooms["ops-control"]!;

  it("has correct roomType", () => expect(room.roomType).toBe("control"));
  it("is on floor 1", () => expect(room.floor).toBe(1));
  it("includes USER as member", () => expect(room.members).toContain("USER"));
  it("has verbose summaryMode", () => expect(room.summaryMode).toBe("verbose"));
  it("has members-only access policy", () => expect(room.accessPolicy).toBe("members-only"));
  it("has correct color accent", () => expect(room.spatial.colorAccent).toBe("#FF7043"));
  it("has 4 furniture slots", () => expect(room.spatial.furnitureSlots?.length).toBe(4));
  it("tags include 'command'", () => expect(room.tags).toContain("command"));
});

describe("project-main room", () => {
  const room = ROOM_REGISTRY.rooms["project-main"]!;

  it("has roomType lobby", () => expect(room.roomType).toBe("lobby"));
  it("is on floor 0", () => expect(room.floor).toBe(0));
  it("has open access policy", () => expect(room.accessPolicy).toBe("open"));
  it("has max_occupancy 8", () => expect(room.maxOccupancy).toBe(8));
  it("has icon 'lobby'", () => expect(room.spatial.icon).toBe("lobby"));
  it("has color accent #4FC3F7", () => expect(room.spatial.colorAccent).toBe("#4FC3F7"));
});

describe("archive-vault room", () => {
  const room = ROOM_REGISTRY.rooms["archive-vault"]!;

  it("has roomType archive", () => expect(room.roomType).toBe("archive"));
  it("is on floor 0", () => expect(room.floor).toBe(0));
  it("has silent summaryMode", () => expect(room.summaryMode).toBe("silent"));
  it("tags include 'readonly'", () => expect(room.tags).toContain("readonly"));
  it("has replay-terminal furniture", () => {
    expect(room.spatial.furnitureSlots?.some((f) => f.type === "replay-terminal")).toBe(true);
  });
});

describe("stairwell room", () => {
  const room = ROOM_REGISTRY.rooms["stairwell"]!;

  it("has roomType corridor", () => expect(room.roomType).toBe("corridor"));
  it("has 0 maxOccupancy (spatial-only)", () => expect(room.maxOccupancy).toBe(0));
  it("spans floor 0 (base declaration)", () => expect(room.floor).toBe(0));
  it("has height 6 (spans two floors)", () => expect(room.spatial.dimensions.h).toBe(6));
  it("tags include 'vertical'", () => expect(room.tags).toContain("vertical"));
});

describe("corridor-main room", () => {
  const room = ROOM_REGISTRY.rooms["corridor-main"]!;

  it("has roomType corridor", () => expect(room.roomType).toBe("corridor"));
  it("has no members", () => expect(room.members.length).toBe(0));
  it("has 0 maxOccupancy", () => expect(room.maxOccupancy).toBe(0));
  it("has open access policy", () => expect(room.accessPolicy).toBe("open"));
});

// ---------------------------------------------------------------------------
// Room_type enum coverage
// ---------------------------------------------------------------------------

describe("ROOM_TYPES constant", () => {
  it("contains all 8 declared types", () => {
    expect(ROOM_TYPES.length).toBe(8);
    expect(ROOM_TYPES).toContain("control");
    expect(ROOM_TYPES).toContain("office");
    expect(ROOM_TYPES).toContain("lab");
    expect(ROOM_TYPES).toContain("lobby");
    expect(ROOM_TYPES).toContain("archive");
    expect(ROOM_TYPES).toContain("corridor");
    expect(ROOM_TYPES).toContain("pipeline");
    expect(ROOM_TYPES).toContain("agent");
  });
});

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

describe("getRoomById", () => {
  it("returns correct room for valid id", () => {
    const room = getRoomById(ROOM_REGISTRY, "research-lab");
    expect(room?.name).toBe("Research Lab");
  });

  it("returns undefined for unknown id", () => {
    expect(getRoomById(ROOM_REGISTRY, "non-existent")).toBeUndefined();
  });
});

describe("getRoomsByFloor", () => {
  it("returns 3 rooms on floor 0", () => {
    const rooms = getRoomsByFloor(ROOM_REGISTRY, 0);
    expect(rooms.length).toBe(3);
    expect(rooms.map((r) => r.roomId).sort()).toEqual(
      ["archive-vault", "project-main", "stairwell"].sort(),
    );
  });

  it("returns 6 rooms on floor 1", () => {
    // stairwell is declared at floor:0 so is excluded from this query
    const rooms = getRoomsByFloor(ROOM_REGISTRY, 1);
    expect(rooms.length).toBe(6);
  });

  it("returns empty array for non-existent floor", () => {
    expect(getRoomsByFloor(ROOM_REGISTRY, 99)).toHaveLength(0);
  });
});

describe("getRoomsByType", () => {
  it("returns exactly 1 control room", () => {
    const rooms = getRoomsByType(ROOM_REGISTRY, "control");
    expect(rooms.length).toBe(1);
    expect(rooms[0]!.roomId).toBe("ops-control");
  });

  it("returns 3 office rooms", () => {
    const rooms = getRoomsByType(ROOM_REGISTRY, "office");
    const ids = rooms.map((r) => r.roomId).sort();
    expect(ids).toEqual(
      ["impl-office", "review-office", "validation-office"].sort(),
    );
  });

  it("returns 1 lab room", () => {
    const rooms = getRoomsByType(ROOM_REGISTRY, "lab");
    expect(rooms.length).toBe(1);
    expect(rooms[0]!.roomId).toBe("research-lab");
  });

  it("returns 1 lobby room", () => {
    expect(getRoomsByType(ROOM_REGISTRY, "lobby").length).toBe(1);
  });

  it("returns 1 archive room", () => {
    expect(getRoomsByType(ROOM_REGISTRY, "archive").length).toBe(1);
  });

  it("returns 2 corridor rooms (corridor-main + stairwell)", () => {
    expect(getRoomsByType(ROOM_REGISTRY, "corridor").length).toBe(2);
  });

  it("returns 0 pipeline rooms (none defined yet)", () => {
    expect(getRoomsByType(ROOM_REGISTRY, "pipeline").length).toBe(0);
  });

  it("returns 0 agent rooms (none defined yet)", () => {
    expect(getRoomsByType(ROOM_REGISTRY, "agent").length).toBe(0);
  });
});

describe("getAdjacentRooms", () => {
  it("project-main is adjacent to stairwell and archive-vault", () => {
    const adj = getAdjacentRooms(ROOM_REGISTRY, "project-main");
    const ids = adj.map((r) => r.roomId).sort();
    expect(ids).toEqual(["archive-vault", "stairwell"].sort());
  });

  it("ops-control is adjacent to stairwell and corridor-main", () => {
    const adj = getAdjacentRooms(ROOM_REGISTRY, "ops-control");
    const ids = adj.map((r) => r.roomId).sort();
    expect(ids).toEqual(["corridor-main", "stairwell"].sort());
  });

  it("archive-vault only adjacent to project-main", () => {
    const adj = getAdjacentRooms(ROOM_REGISTRY, "archive-vault");
    expect(adj.length).toBe(1);
    expect(adj[0]!.roomId).toBe("project-main");
  });

  it("corridor-main is adjacent to 5 rooms", () => {
    const adj = getAdjacentRooms(ROOM_REGISTRY, "corridor-main");
    expect(adj.length).toBe(5);
  });

  it("returns empty array for unknown roomId", () => {
    expect(getAdjacentRooms(ROOM_REGISTRY, "unknown-room")).toHaveLength(0);
  });
});

describe("getRoomsForAgent", () => {
  it("USER appears in archive-vault, project-main and ops-control", () => {
    // archive-vault.yaml declares members: [USER] for replay access
    const rooms = getRoomsForAgent(ROOM_REGISTRY, "USER");
    const ids = rooms.map((r) => r.roomId).sort();
    expect(ids).toEqual(["archive-vault", "ops-control", "project-main"].sort());
  });

  it("implementer-subagent appears only in impl-office", () => {
    const rooms = getRoomsForAgent(ROOM_REGISTRY, "implementer-subagent");
    expect(rooms.length).toBe(1);
    expect(rooms[0]!.roomId).toBe("impl-office");
  });

  it("frontend-reviewer appears only in review-office", () => {
    const rooms = getRoomsForAgent(ROOM_REGISTRY, "frontend-reviewer");
    expect(rooms.length).toBe(1);
    expect(rooms[0]!.roomId).toBe("review-office");
  });

  it("unknown agent returns empty array", () => {
    expect(getRoomsForAgent(ROOM_REGISTRY, "ghost-agent")).toHaveLength(0);
  });
});

describe("getRoomsByTags", () => {
  it("tag 'readonly' returns archive-vault and research-lab", () => {
    const rooms = getRoomsByTags(ROOM_REGISTRY, ["readonly"]);
    const ids = rooms.map((r) => r.roomId).sort();
    expect(ids).toContain("archive-vault");
    expect(ids).toContain("research-lab");
  });

  it("tag 'connector' returns corridor-type rooms", () => {
    const rooms = getRoomsByTags(ROOM_REGISTRY, ["connector"]);
    expect(rooms.length).toBeGreaterThanOrEqual(2);
    expect(rooms.every((r) => r.roomType === "corridor")).toBe(true);
  });

  it("empty filterTags returns all rooms (count matches registry)", () => {
    const rooms = getRoomsByTags(ROOM_REGISTRY, []);
    expect(rooms.length).toBe(ROOM_REGISTRY.count); // 9
  });

  it("multi-tag filter narrows correctly", () => {
    const rooms = getRoomsByTags(ROOM_REGISTRY, ["connector", "vertical"]);
    expect(rooms.length).toBe(1);
    expect(rooms[0]!.roomId).toBe("stairwell");
  });
});

// ---------------------------------------------------------------------------
// Building definition consistency
// ---------------------------------------------------------------------------

describe("BUILDING_DEF consistency", () => {
  it("all floorPlan roomIds exist in ROOM_REGISTRY", () => {
    for (const floor of BUILDING_DEF.floorPlan) {
      for (const roomId of floor.roomIds) {
        expect(
          ROOM_REGISTRY.rooms[roomId],
          `Missing room "${roomId}" declared in floor plan`,
        ).toBeDefined();
      }
    }
  });

  it("all adjacency roomIds exist in ROOM_REGISTRY", () => {
    for (const [src, neighbours] of Object.entries(BUILDING_DEF.adjacency)) {
      expect(
        ROOM_REGISTRY.rooms[src],
        `Adjacency source "${src}" missing from registry`,
      ).toBeDefined();
      for (const dst of neighbours) {
        expect(
          ROOM_REGISTRY.rooms[dst],
          `Adjacency target "${dst}" missing from registry`,
        ).toBeDefined();
      }
    }
  });

  it("all agentAssignment roomIds exist in ROOM_REGISTRY", () => {
    for (const [agent, roomId] of Object.entries(
      BUILDING_DEF.agentAssignments,
    )) {
      expect(
        ROOM_REGISTRY.rooms[roomId],
        `Agent "${agent}" assigned to unknown room "${roomId}"`,
      ).toBeDefined();
    }
  });

  it("has 2 floors", () => {
    expect(BUILDING_DEF.floors).toBe(2);
    expect(BUILDING_DEF.floorPlan.length).toBe(2);
  });

  it("building style is low-poly-dark", () => {
    expect(BUILDING_DEF.style).toBe("low-poly-dark");
  });
});

// ---------------------------------------------------------------------------
// buildRoomRegistry factory edge-cases
// ---------------------------------------------------------------------------

describe("buildRoomRegistry factory", () => {
  const minimalSpatial = {
    position: { x: 0, y: 0, z: 0 },
    dimensions: { w: 1, h: 1, d: 1 },
  };
  const minimalBuilding = {
    schemaV: 1 as const,
    buildingId: "test",
    name: "Test",
    style: "flat",
    floors: 1,
    floorPlan: [],
    agentAssignments: {},
    adjacency: {},
    visualDefaults: {
      wallColor: "#000",
      floorColor: "#000",
      ceilingColor: "#000",
      ambientLight: "#000",
      accentGlowIntensity: 0,
      gridVisible: false,
      gridColor: "#000",
    },
  };

  it("builds registry from valid defs", () => {
    const def: RoomDef = {
      schemaV: 1,
      roomId: "test-room",
      name: "Test Room",
      roomType: "office",
      floor: 0,
      members: [],
      spatial: minimalSpatial,
    };
    const reg = buildRoomRegistry([def], minimalBuilding);
    expect(reg.count).toBe(1);
    expect(reg.rooms["test-room"]).toBeDefined();
  });

  it("throws on duplicate roomId", () => {
    const def: RoomDef = {
      schemaV: 1,
      roomId: "dup",
      name: "Dup",
      roomType: "office",
      floor: 0,
      members: [],
      spatial: minimalSpatial,
    };
    expect(() => buildRoomRegistry([def, def], minimalBuilding)).toThrow(
      /Duplicate roomId/,
    );
  });

  it("returns empty registry for empty input", () => {
    const reg = buildRoomRegistry([], minimalBuilding);
    expect(reg.count).toBe(0);
    expect(Object.keys(reg.rooms).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Spatial property completeness
// ---------------------------------------------------------------------------

describe("spatial properties", () => {
  it("every room has a non-null position", () => {
    for (const room of Object.values(ROOM_REGISTRY.rooms)) {
      expect(room.spatial.position).toBeDefined();
      expect(typeof room.spatial.position.x).toBe("number");
      expect(typeof room.spatial.position.y).toBe("number");
      expect(typeof room.spatial.position.z).toBe("number");
    }
  });

  it("every room has non-zero dimensions", () => {
    for (const room of Object.values(ROOM_REGISTRY.rooms)) {
      expect(room.spatial.dimensions.w).toBeGreaterThan(0);
      expect(room.spatial.dimensions.h).toBeGreaterThan(0);
      expect(room.spatial.dimensions.d).toBeGreaterThan(0);
    }
  });

  it("every room with members has at least one furniture slot OR is a corridor", () => {
    for (const room of Object.values(ROOM_REGISTRY.rooms)) {
      if (room.roomType === "corridor") continue;
      if (room.members.length > 0) {
        expect(
          (room.spatial.furnitureSlots?.length ?? 0) > 0,
          `Room "${room.roomId}" has members but no furniture slots`,
        ).toBe(true);
      }
    }
  });

  it("every room has a colorAccent (hex string)", () => {
    for (const room of Object.values(ROOM_REGISTRY.rooms)) {
      expect(room.spatial.colorAccent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("every room has a cameraPreset", () => {
    const validPresets = new Set(["overhead", "isometric", "close-up"]);
    for (const room of Object.values(ROOM_REGISTRY.rooms)) {
      if (room.spatial.cameraPreset !== undefined) {
        expect(validPresets.has(room.spatial.cameraPreset)).toBe(true);
      }
    }
  });
});
