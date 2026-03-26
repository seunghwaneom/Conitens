/**
 * layout-init-seeder.test.ts — Unit tests for Sub-AC 9a
 *
 * Validates:
 *   1. buildLayoutInitPayload returns the correct layout_id and building_id
 *   2. rooms array is non-empty and contains entries for every BUILDING room
 *   3. Each room node has the required room_id and position Vec3
 *   4. agents array is non-empty and contains entries for every seed agent
 *   5. Each agent node has agent_id, room_id, and world-space position
 *   6. fixtures array is non-empty and contains entries for all furniture slots
 *   7. Each fixture has a unique fixture_id, fixture_type, and room_id
 *   8. source is "config" and initiated_by is "system"
 *   9. snapshot field contains schema_version and counts matching the arrays
 *  10. buildMinimalLayoutInitPayload produces a valid minimal payload
 *  11. countBuildingFixtures returns the correct total furniture count
 *  12. isLayoutInitPayload type guard accepts the built payload
 *  13. Payload is fully JSON-serialisable (no circular refs or class instances)
 *  14. PRIMARY_LAYOUT_ID is a non-empty string
 *  15. Calling buildLayoutInitPayload twice produces structurally equal (but
 *      reference-distinct) objects — determinism guarantee
 */

import { describe, it, expect } from "vitest";
import {
  buildLayoutInitPayload,
  buildMinimalLayoutInitPayload,
  countBuildingFixtures,
  PRIMARY_LAYOUT_ID,
  LAYOUT_INIT_SCHEMA_VERSION,
} from "../layout-init-seeder.js";
import { BUILDING } from "../building.js";
import { AGENT_INITIAL_PLACEMENTS } from "../agent-seed.js";
import { isLayoutInitPayload } from "@conitens/protocol";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Shallow Vec3 validity check */
function isVec3(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["x"] === "number" &&
    typeof o["y"] === "number" &&
    typeof o["z"] === "number"
  );
}

// ── 1. layout_id and building_id ──────────────────────────────────────────

describe("buildLayoutInitPayload — identity fields", () => {
  it("returns the PRIMARY_LAYOUT_ID", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.layout_id).toBe(PRIMARY_LAYOUT_ID);
  });

  it("returns the building's buildingId", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.building_id).toBe(BUILDING.buildingId);
  });

  it("PRIMARY_LAYOUT_ID is a non-empty string", () => {
    expect(typeof PRIMARY_LAYOUT_ID).toBe("string");
    expect(PRIMARY_LAYOUT_ID.length).toBeGreaterThan(0);
  });
});

// ── 2. rooms array completeness ───────────────────────────────────────────

describe("buildLayoutInitPayload — rooms", () => {
  it("returns a non-empty rooms array", () => {
    const payload = buildLayoutInitPayload();
    expect(Array.isArray(payload.rooms)).toBe(true);
    expect(payload.rooms.length).toBeGreaterThan(0);
  });

  it("contains one entry for every room in BUILDING", () => {
    const payload = buildLayoutInitPayload();
    const payloadRoomIds = new Set(payload.rooms.map((r) => r.room_id));
    for (const room of BUILDING.rooms) {
      expect(payloadRoomIds.has(room.roomId)).toBe(true);
    }
  });

  it("contains exactly as many rooms as BUILDING.rooms", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.rooms).toHaveLength(BUILDING.rooms.length);
  });

  it("each room node has room_id (string) and position (Vec3)", () => {
    const payload = buildLayoutInitPayload();
    for (const room of payload.rooms) {
      expect(typeof room.room_id).toBe("string");
      expect(room.room_id.length).toBeGreaterThan(0);
      expect(isVec3(room.position)).toBe(true);
    }
  });

  it("room positions match BUILDING room positions", () => {
    const payload = buildLayoutInitPayload();
    for (const node of payload.rooms) {
      const def = BUILDING.rooms.find((r) => r.roomId === node.room_id);
      expect(def).toBeDefined();
      expect(node.position.x).toBe(def!.position.x);
      expect(node.position.y).toBe(def!.position.y);
      expect(node.position.z).toBe(def!.position.z);
    }
  });

  it("each room node carries the floor number", () => {
    const payload = buildLayoutInitPayload();
    for (const node of payload.rooms) {
      const def = BUILDING.rooms.find((r) => r.roomId === node.room_id);
      expect(node.floor).toBe(def!.floor);
    }
  });
});

// ── 4. agents array ───────────────────────────────────────────────────────

describe("buildLayoutInitPayload — agents", () => {
  it("returns a non-empty agents array", () => {
    const payload = buildLayoutInitPayload();
    expect(Array.isArray(payload.agents)).toBe(true);
    expect((payload.agents ?? []).length).toBeGreaterThan(0);
  });

  it("contains one entry for every AGENT_INITIAL_PLACEMENTS entry", () => {
    const payload = buildLayoutInitPayload();
    const payloadAgentIds = new Set((payload.agents ?? []).map((a) => a.agent_id));
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(payloadAgentIds.has(seed.agentId)).toBe(true);
    }
  });

  it("each agent node has agent_id, room_id, and Vec3 position", () => {
    const payload = buildLayoutInitPayload();
    for (const agent of payload.agents ?? []) {
      expect(typeof agent.agent_id).toBe("string");
      expect(typeof agent.room_id).toBe("string");
      expect(isVec3(agent.position)).toBe(true);
    }
  });

  it("agent positions match world-space positions from seed records", () => {
    const payload = buildLayoutInitPayload();
    for (const node of payload.agents ?? []) {
      const seed = AGENT_INITIAL_PLACEMENTS.find((s) => s.agentId === node.agent_id);
      expect(seed).toBeDefined();
      expect(node.position.x).toBe(seed!.position.worldPosition.x);
      expect(node.position.y).toBe(seed!.position.worldPosition.y);
      expect(node.position.z).toBe(seed!.position.worldPosition.z);
    }
  });

  it("agent room_id matches seed roomId", () => {
    const payload = buildLayoutInitPayload();
    for (const node of payload.agents ?? []) {
      const seed = AGENT_INITIAL_PLACEMENTS.find((s) => s.agentId === node.agent_id);
      expect(node.room_id).toBe(seed!.roomId);
    }
  });
});

// ── 6. fixtures array ─────────────────────────────────────────────────────

describe("buildLayoutInitPayload — fixtures", () => {
  it("returns a non-empty fixtures array", () => {
    const payload = buildLayoutInitPayload();
    expect(Array.isArray(payload.fixtures)).toBe(true);
    expect((payload.fixtures ?? []).length).toBeGreaterThan(0);
  });

  it("total fixture count matches countBuildingFixtures", () => {
    const payload = buildLayoutInitPayload();
    expect((payload.fixtures ?? []).length).toBe(countBuildingFixtures(BUILDING));
  });

  it("each fixture has a unique fixture_id", () => {
    const payload = buildLayoutInitPayload();
    const ids = (payload.fixtures ?? []).map((f) => f.fixture_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each fixture has fixture_id, fixture_type, room_id, and Vec3 position", () => {
    const payload = buildLayoutInitPayload();
    for (const fix of payload.fixtures ?? []) {
      expect(typeof fix.fixture_id).toBe("string");
      expect(typeof fix.fixture_type).toBe("string");
      expect(typeof fix.room_id).toBe("string");
      expect(isVec3(fix.position)).toBe(true);
    }
  });

  it("fixture room_ids are all valid BUILDING room IDs", () => {
    const payload = buildLayoutInitPayload();
    const validRoomIds = new Set(BUILDING.rooms.map((r) => r.roomId));
    for (const fix of payload.fixtures ?? []) {
      expect(validRoomIds.has(fix.room_id!)).toBe(true);
    }
  });
});

// ── 8. source and initiated_by ────────────────────────────────────────────

describe("buildLayoutInitPayload — metadata fields", () => {
  it("source is 'config'", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.source).toBe("config");
  });

  it("initiated_by is 'system'", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.initiated_by).toBe("system");
  });

  it("snapshot_schema_version is LAYOUT_INIT_SCHEMA_VERSION", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.snapshot_schema_version).toBe(LAYOUT_INIT_SCHEMA_VERSION);
  });
});

// ── 9. snapshot field ─────────────────────────────────────────────────────

describe("buildLayoutInitPayload — snapshot", () => {
  it("snapshot is a non-null object", () => {
    const payload = buildLayoutInitPayload();
    expect(typeof payload.snapshot).toBe("object");
    expect(payload.snapshot).not.toBeNull();
  });

  it("snapshot.room_count matches rooms array length", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.snapshot!["room_count"]).toBe(payload.rooms.length);
  });

  it("snapshot.agent_count matches agents array length", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.snapshot!["agent_count"]).toBe((payload.agents ?? []).length);
  });

  it("snapshot.fixture_count matches fixtures array length", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.snapshot!["fixture_count"]).toBe((payload.fixtures ?? []).length);
  });

  it("snapshot.floor_count matches BUILDING.floors length", () => {
    const payload = buildLayoutInitPayload();
    expect(payload.snapshot!["floor_count"]).toBe(BUILDING.floors.length);
  });
});

// ── 10. buildMinimalLayoutInitPayload ─────────────────────────────────────

describe("buildMinimalLayoutInitPayload", () => {
  it("returns a valid LayoutInitPayload accepted by isLayoutInitPayload", () => {
    const payload = buildMinimalLayoutInitPayload("test-building", "test-layout", [
      { roomId: "room-a", position: { x: 0, y: 0, z: 0 }, floor: 0 },
      { roomId: "room-b", position: { x: 5, y: 0, z: 0 }, floor: 1 },
    ]);
    expect(isLayoutInitPayload(payload)).toBe(true);
  });

  it("layout_id and building_id match the provided arguments", () => {
    const payload = buildMinimalLayoutInitPayload("bld-1", "layout-x", [
      { roomId: "r1", position: { x: 1, y: 2, z: 3 } },
    ]);
    expect(payload.layout_id).toBe("layout-x");
    expect(payload.building_id).toBe("bld-1");
  });

  it("rooms array matches provided room descriptors", () => {
    const payload = buildMinimalLayoutInitPayload("b", "l", [
      { roomId: "ra", position: { x: 0, y: 0, z: 0 } },
      { roomId: "rb", position: { x: 3, y: 0, z: 3 } },
    ]);
    expect(payload.rooms).toHaveLength(2);
    expect(payload.rooms[0].room_id).toBe("ra");
    expect(payload.rooms[1].room_id).toBe("rb");
  });

  it("agents and fixtures are undefined (omitted) in minimal payload", () => {
    const payload = buildMinimalLayoutInitPayload("b", "l", [
      { roomId: "r", position: { x: 0, y: 0, z: 0 } },
    ]);
    // Optional arrays should be absent from a minimal payload
    expect(payload.agents).toBeUndefined();
    expect(payload.fixtures).toBeUndefined();
  });
});

// ── 11. countBuildingFixtures ─────────────────────────────────────────────

describe("countBuildingFixtures", () => {
  it("returns a positive integer for BUILDING", () => {
    const count = countBuildingFixtures(BUILDING);
    expect(count).toBeGreaterThan(0);
    expect(Number.isInteger(count)).toBe(true);
  });

  it("matches the sum of furniture slots across all rooms", () => {
    const expected = BUILDING.rooms.reduce((s, r) => s + r.furniture.length, 0);
    expect(countBuildingFixtures(BUILDING)).toBe(expected);
  });

  it("returns 0 for a building with no furniture", () => {
    const emptyBuilding = {
      ...BUILDING,
      rooms: BUILDING.rooms.map((r) => ({ ...r, furniture: [] })),
    };
    expect(countBuildingFixtures(emptyBuilding)).toBe(0);
  });
});

// ── 12. type guard ────────────────────────────────────────────────────────

describe("isLayoutInitPayload (type guard) — full payload", () => {
  it("accepts the payload produced by buildLayoutInitPayload", () => {
    const payload = buildLayoutInitPayload();
    expect(isLayoutInitPayload(payload)).toBe(true);
  });

  it("rejects an empty object", () => {
    expect(isLayoutInitPayload({})).toBe(false);
  });

  it("rejects null", () => {
    expect(isLayoutInitPayload(null)).toBe(false);
  });

  it("rejects a payload with missing rooms", () => {
    expect(isLayoutInitPayload({ layout_id: "x", building_id: "y", rooms: [] })).toBe(false);
  });
});

// ── 13. JSON serialisability ──────────────────────────────────────────────

describe("buildLayoutInitPayload — JSON serialisability", () => {
  it("round-trips through JSON.stringify / JSON.parse without loss", () => {
    const payload = buildLayoutInitPayload();
    const serialised = JSON.stringify(payload);
    expect(() => JSON.parse(serialised)).not.toThrow();
    const parsed = JSON.parse(serialised);
    expect(parsed.layout_id).toBe(payload.layout_id);
    expect(parsed.rooms).toHaveLength(payload.rooms.length);
    expect(parsed.agents).toHaveLength((payload.agents ?? []).length);
    expect(parsed.fixtures).toHaveLength((payload.fixtures ?? []).length);
  });
});

// ── 15. Determinism ───────────────────────────────────────────────────────

describe("buildLayoutInitPayload — determinism", () => {
  it("produces structurally equal payloads on repeated calls", () => {
    const a = buildLayoutInitPayload();
    const b = buildLayoutInitPayload();
    // Compare via JSON (deep equality, excluding reference identity)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces reference-distinct objects (not the same instance)", () => {
    const a = buildLayoutInitPayload();
    const b = buildLayoutInitPayload();
    expect(a).not.toBe(b);
    expect(a.rooms).not.toBe(b.rooms);
  });
});
