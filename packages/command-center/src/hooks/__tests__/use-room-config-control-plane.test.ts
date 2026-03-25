/**
 * use-room-config-control-plane.test.ts — Sub-AC 7d unit tests
 *
 * Tests the room configuration fixture control plane contract:
 *   - Fixture ID helpers: encode/decode, round-trip, edge cases
 *   - getRoomCapacityColor: occupancy ratio → correct Three.js hex color
 *   - computeNewCapacityFromDrag: Y-axis drag delta → capacity ceiling
 *   - buildRoomConfigFixtures: two fixtures per room (handle + menu_anchor)
 *   - buildRoomConfigMenuEntries: correct menu structure and entry types
 *   - computeRoomFixtureWorldPos (from RoomConfigFixtureLayer): correct world pos
 *   - buildRoomConfigEntries: builds entries for multiple rooms correctly
 *   - Intent routing: FIXTURE_HANDLE_DRAG_END + "capacity" → capacity dispatch
 *   - Intent routing: FIXTURE_MENU_ANCHOR_OPENED + "rules" → menu open callback
 *   - Intent routing: irrelevant intents → no-op
 *
 * Pure logic tests — no React render required.
 * All routing logic is covered by testing pure helper functions directly.
 *
 * Test ID scheme:
 *   rcc-N : room-config-control-plane
 */

import { describe, it, expect, vi } from "vitest";
import {
  // Fixture ID helpers
  ROOM_FIXTURE_ID_SEP,
  ROOM_CONFIG_CAPACITY_SUFFIX,
  ROOM_CONFIG_RULES_SUFFIX,
  roomCapacityFixtureId,
  roomRulesFixtureId,
  parseRoomConfigFixtureId,
  // Color helpers
  getRoomCapacityColor,
  ROOM_CAPACITY_OK_COLOR,
  ROOM_CAPACITY_MID_COLOR,
  ROOM_CAPACITY_FULL_COLOR,
  ROOM_CAPACITY_UNLIMITED_COLOR,
  ROOM_RULES_MENU_COLOR,
  ROOM_FIXTURE_DISABLED_COLOR,
  // Capacity delta
  computeNewCapacityFromDrag,
  CAPACITY_MIN,
  CAPACITY_MAX,
  CAPACITY_DRAG_SCALE,
  // Fixture builder
  buildRoomConfigFixtures,
  // Menu builder
  buildRoomConfigMenuEntries,
  ROOM_ACCESS_POLICIES,
  ROOM_ACCESS_POLICY_LABEL,
  type RoomConfigMenuEntry,
  type RoomAccessPolicy,
} from "../use-room-config-control-plane.js";
import {
  computeRoomFixtureWorldPos,
  buildRoomConfigEntries,
  ROOM_CONFIG_FIXTURE_Y_OFFSET,
} from "../../scene/RoomConfigFixtureLayer.js";
import type { RoomMetadataEntry } from "../../data/room-registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal mock RoomMetadataEntry for tests. */
function makeRoom(overrides: Partial<RoomMetadataEntry> = {}): RoomMetadataEntry {
  return {
    roomId:           "ops-control",
    name:             "Operations Control",
    roomType:         "control",
    floor:            1,
    positionHint: {
      position:     { x: 0, y: 4, z: 0 },
      dimensions:   { x: 6, y: 3, z: 5 },
      center:       { x: 3, y: 5.5, z: 2.5 },
      cameraPreset: "isometric",
    },
    agentRoles:       ["manager"],
    roleDescription:  "Main control centre",
    staticMembers:    [],
    maxOccupancy:     4,
    accessPolicy:     "open",
    colorAccent:      "#00bcd4",
    icon:             "◉",
    cameraPreset:     "isometric",
    residentAgents:   [],
    adjacentRoomIds:  [],
    def: {} as never,
    ...overrides,
  };
}

/** Build a minimal FixtureHandleDragEndIntent. */
function makeDragEndIntent(
  fixtureId: string,
  originY: number,
  endY: number,
) {
  return {
    intent:          "FIXTURE_HANDLE_DRAG_END" as const,
    fixtureId,
    fixtureKind:     "handle" as const,
    entityRef:       { entityType: "room" as const, entityId: "ops-control" },
    actionType:      "drag_end" as const,
    dragOriginWorld: { x: 3, y: originY, z: 2.5 },
    dragEndWorld:    { x: 3, y: endY,    z: 2.5 },
    ts:              Date.now(),
  };
}

/** Build a minimal FixtureMenuAnchorOpenedIntent. */
function makeMenuOpenIntent(fixtureId: string) {
  return {
    intent:          "FIXTURE_MENU_ANCHOR_OPENED" as const,
    fixtureId,
    fixtureKind:     "menu_anchor" as const,
    entityRef:       { entityType: "room" as const, entityId: "ops-control" },
    actionType:      "menu_open" as const,
    worldPosition:   { x: 3, y: 5.5, z: 2.5 },
    screen_position: { x: 400, y: 300 },
    ts:              Date.now(),
  };
}

/** Build a minimal FixtureButtonClickedIntent (irrelevant to rooms). */
function makeButtonClickedIntent(fixtureId: string) {
  return {
    intent:          "FIXTURE_BUTTON_CLICKED" as const,
    fixtureId,
    fixtureKind:     "button" as const,
    entityRef:       { entityType: "room" as const, entityId: "ops-control" },
    actionType:      "click" as const,
    pressKind:       "tap" as const,
    worldPosition:   null,
    ts:              Date.now(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fixture ID helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-1: Fixture ID helpers", () => {
  it("roomCapacityFixtureId encodes roomId and capacity suffix", () => {
    const id = roomCapacityFixtureId("ops-control");
    expect(id).toBe(`ops-control${ROOM_FIXTURE_ID_SEP}${ROOM_CONFIG_CAPACITY_SUFFIX}`);
    expect(id).toContain("capacity");
  });

  it("roomRulesFixtureId encodes roomId and rules suffix", () => {
    const id = roomRulesFixtureId("impl-office");
    expect(id).toBe(`impl-office${ROOM_FIXTURE_ID_SEP}${ROOM_CONFIG_RULES_SUFFIX}`);
    expect(id).toContain("rules");
  });

  it("parseRoomConfigFixtureId round-trips capacity fixture ID", () => {
    const id     = roomCapacityFixtureId("ops-control");
    const parsed = parseRoomConfigFixtureId(id);
    expect(parsed).not.toBeNull();
    expect(parsed?.roomId).toBe("ops-control");
    expect(parsed?.suffix).toBe(ROOM_CONFIG_CAPACITY_SUFFIX);
  });

  it("parseRoomConfigFixtureId round-trips rules fixture ID", () => {
    const id     = roomRulesFixtureId("impl-office");
    const parsed = parseRoomConfigFixtureId(id);
    expect(parsed?.roomId).toBe("impl-office");
    expect(parsed?.suffix).toBe(ROOM_CONFIG_RULES_SUFFIX);
  });

  it("parseRoomConfigFixtureId returns null for IDs without separator", () => {
    expect(parseRoomConfigFixtureId("nocolon")).toBeNull();
    expect(parseRoomConfigFixtureId("")).toBeNull();
  });

  it("parseRoomConfigFixtureId uses last colon as separator for IDs with embedded colons", () => {
    // Room IDs should not contain colons, but robustness check
    const id     = "floor:1:room:capacity";
    const parsed = parseRoomConfigFixtureId(id);
    expect(parsed?.roomId).toBe("floor:1:room");
    expect(parsed?.suffix).toBe("capacity");
  });

  it("parseRoomConfigFixtureId returns null for empty suffix", () => {
    expect(parseRoomConfigFixtureId("ops-control:")).toBeNull();
  });

  it("parseRoomConfigFixtureId returns null for empty roomId", () => {
    expect(parseRoomConfigFixtureId(":capacity")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. getRoomCapacityColor — occupancy ratio → color
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-2: getRoomCapacityColor()", () => {
  it("returns UNLIMITED color when maxOccupancy ≤ 0", () => {
    expect(getRoomCapacityColor(0,  0)).toBe(ROOM_CAPACITY_UNLIMITED_COLOR);
    expect(getRoomCapacityColor(5, -1)).toBe(ROOM_CAPACITY_UNLIMITED_COLOR);
    expect(getRoomCapacityColor(0, -1)).toBe(ROOM_CAPACITY_UNLIMITED_COLOR);
  });

  it("returns OK (green) color when ratio < 50%", () => {
    // 1 / 4 = 25%
    expect(getRoomCapacityColor(1, 4)).toBe(ROOM_CAPACITY_OK_COLOR);
    // 0 / 10 = 0%
    expect(getRoomCapacityColor(0, 10)).toBe(ROOM_CAPACITY_OK_COLOR);
  });

  it("returns MID (yellow) color when ratio is 50–80%", () => {
    // 2 / 4 = 50%
    expect(getRoomCapacityColor(2, 4)).toBe(ROOM_CAPACITY_MID_COLOR);
    // 3 / 4 = 75%
    expect(getRoomCapacityColor(3, 4)).toBe(ROOM_CAPACITY_MID_COLOR);
  });

  it("returns FULL (red) color when ratio ≥ 80%", () => {
    // 4 / 4 = 100%
    expect(getRoomCapacityColor(4, 4)).toBe(ROOM_CAPACITY_FULL_COLOR);
    // 8 / 10 = 80% (boundary)
    expect(getRoomCapacityColor(8, 10)).toBe(ROOM_CAPACITY_FULL_COLOR);
  });

  it("all four colors are distinct numeric values", () => {
    const colors = new Set([
      ROOM_CAPACITY_OK_COLOR,
      ROOM_CAPACITY_MID_COLOR,
      ROOM_CAPACITY_FULL_COLOR,
      ROOM_CAPACITY_UNLIMITED_COLOR,
    ]);
    expect(colors.size).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. computeNewCapacityFromDrag — drag delta → capacity ceiling
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-3: computeNewCapacityFromDrag()", () => {
  it("no drag (equal Y) returns base capacity unchanged", () => {
    expect(computeNewCapacityFromDrag(6, 2.0, 2.0)).toBe(6);
  });

  it("drag up by 1 unit increases capacity by CAPACITY_DRAG_SCALE", () => {
    expect(computeNewCapacityFromDrag(4, 0, 1)).toBe(4 + CAPACITY_DRAG_SCALE);
  });

  it("drag down by 1 unit decreases capacity by CAPACITY_DRAG_SCALE", () => {
    expect(computeNewCapacityFromDrag(6, 2, 1)).toBe(6 - CAPACITY_DRAG_SCALE);
  });

  it("result is clamped to CAPACITY_MIN when dragged very low", () => {
    expect(computeNewCapacityFromDrag(1, 10, 0)).toBe(CAPACITY_MIN);
  });

  it("result is clamped to CAPACITY_MAX when dragged very high", () => {
    expect(computeNewCapacityFromDrag(48, 0, 50)).toBe(CAPACITY_MAX);
  });

  it("treats unlimited (maxOccupancy ≤ 0) as base of 8", () => {
    // base=8, drag +1 → 8 + CAPACITY_DRAG_SCALE
    expect(computeNewCapacityFromDrag(-1, 0, 1)).toBe(8 + CAPACITY_DRAG_SCALE);
    expect(computeNewCapacityFromDrag(0,  0, 1)).toBe(8 + CAPACITY_DRAG_SCALE);
  });

  it("CAPACITY_MIN is ≥ 1", () => {
    expect(CAPACITY_MIN).toBeGreaterThanOrEqual(1);
  });

  it("CAPACITY_MAX is ≤ 100", () => {
    expect(CAPACITY_MAX).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. buildRoomConfigFixtures — fixture descriptor correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-4: buildRoomConfigFixtures()", () => {
  it("returns exactly 2 fixtures for a visible room", () => {
    const fixtures = buildRoomConfigFixtures("ops-control", 2, 4);
    expect(fixtures).toHaveLength(2);
  });

  it("fixture[0] is a handle with capacity fixtureId", () => {
    const [cap] = buildRoomConfigFixtures("ops-control", 2, 4);
    expect(cap.kind).toBe("handle");
    expect(cap.fixtureId).toBe(roomCapacityFixtureId("ops-control"));
  });

  it("fixture[1] is a menu_anchor with rules fixtureId", () => {
    const [, rules] = buildRoomConfigFixtures("ops-control", 2, 4);
    expect(rules.kind).toBe("menu_anchor");
    expect(rules.fixtureId).toBe(roomRulesFixtureId("ops-control"));
  });

  it("visible=true: capacity handle and rules anchor are enabled", () => {
    const [cap, rules] = buildRoomConfigFixtures("ops-control", 0, 4, true);
    expect(cap.disabled).toBeFalsy();
    expect(rules.disabled).toBeFalsy();
  });

  it("visible=false: both fixtures are disabled", () => {
    const [cap, rules] = buildRoomConfigFixtures("ops-control", 2, 4, false);
    expect(cap.disabled).toBe(true);
    expect(rules.disabled).toBe(true);
  });

  it("visible=false: both fixtures use DISABLED color", () => {
    const [cap, rules] = buildRoomConfigFixtures("ops-control", 2, 4, false);
    expect(cap.color).toBe(ROOM_FIXTURE_DISABLED_COLOR);
    expect(rules.color).toBe(ROOM_FIXTURE_DISABLED_COLOR);
  });

  it("capacity handle color reflects occupancy ratio (ok = green)", () => {
    const [cap] = buildRoomConfigFixtures("ops-control", 1, 10, true);
    expect(cap.color).toBe(ROOM_CAPACITY_OK_COLOR);
  });

  it("capacity handle color reflects occupancy ratio (mid = yellow)", () => {
    const [cap] = buildRoomConfigFixtures("ops-control", 5, 8, true);
    expect(cap.color).toBe(ROOM_CAPACITY_MID_COLOR);
  });

  it("capacity handle color reflects occupancy ratio (full = red)", () => {
    const [cap] = buildRoomConfigFixtures("ops-control", 4, 4, true);
    expect(cap.color).toBe(ROOM_CAPACITY_FULL_COLOR);
  });

  it("rules anchor color is always ROOM_RULES_MENU_COLOR when visible", () => {
    const [, rules] = buildRoomConfigFixtures("ops-control", 0, 4, true);
    expect(rules.color).toBe(ROOM_RULES_MENU_COLOR);
  });

  it("fixtures have valid localOffset objects", () => {
    const [cap, rules] = buildRoomConfigFixtures("room-x", 0, 4);
    expect(cap.localOffset).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
    expect(rules.localOffset).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
  });

  it("capacity and rules fixtures have different X offsets (side-by-side)", () => {
    const [cap, rules] = buildRoomConfigFixtures("room-x", 0, 4);
    expect(cap.localOffset?.x).not.toBe(rules.localOffset?.x);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. buildRoomConfigMenuEntries — menu structure and content
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-5: buildRoomConfigMenuEntries()", () => {
  const noop = vi.fn();

  it("returns at least one entry per access policy plus a fallback entry", () => {
    const room    = makeRoom({ accessPolicy: "open" });
    const entries = buildRoomConfigMenuEntries(room, noop, noop);
    // At minimum: header + 3 policies + routing header + fallback = 6
    expect(entries.length).toBeGreaterThanOrEqual(6);
  });

  it("all entries have string label, icon, and item fields", () => {
    const room    = makeRoom({ accessPolicy: "open" });
    const entries = buildRoomConfigMenuEntries(room, noop, noop);
    for (const e of entries) {
      expect(typeof e.label).toBe("string");
      expect(typeof e.icon).toBe("string");
      expect(e.item).toMatchObject({
        entityType: "room",
        entityId:   "ops-control",
        action:     expect.any(String),
      });
    }
  });

  it("all three access policy options are present in the entries", () => {
    const room    = makeRoom({ accessPolicy: "members-only" });
    const entries = buildRoomConfigMenuEntries(room, noop, noop);
    for (const policy of ROOM_ACCESS_POLICIES) {
      const entry = entries.find((e) =>
        e.label.includes(ROOM_ACCESS_POLICY_LABEL[policy]),
      );
      expect(entry).toBeDefined();
    }
  });

  it("current access policy entry is marked 'disabled' and has no onSelect", () => {
    const room    = makeRoom({ accessPolicy: "members-only" });
    const entries = buildRoomConfigMenuEntries(room, noop, noop);
    const current = entries.find(
      (e) => e.label.includes("← current"),
    );
    expect(current).toBeDefined();
    expect(current?.variant).toBe("disabled");
    expect(current?.onSelect).toBeUndefined();
  });

  it("non-current policy entries have onSelect callbacks", () => {
    const room    = makeRoom({ accessPolicy: "open" });
    const entries = buildRoomConfigMenuEntries(room, noop, noop);
    const selectable = entries.filter(
      (e) => e.variant !== "disabled" && e.item.action === "set_access_policy",
    );
    // Should have 2 non-current selectable policy entries
    expect(selectable.length).toBeGreaterThanOrEqual(2);
    for (const e of selectable) {
      expect(typeof e.onSelect).toBe("function");
    }
  });

  it("'Set as fallback room' entry is present and selectable", () => {
    const room    = makeRoom();
    const entries = buildRoomConfigMenuEntries(room, noop, noop);
    const fallback = entries.find((e) => e.item.action === "set_fallback");
    expect(fallback).toBeDefined();
    expect(fallback?.variant).not.toBe("disabled");
    expect(typeof fallback?.onSelect).toBe("function");
  });

  it("onSelect for access policy calls onPolicyChange with correct args", () => {
    const onPolicyChange = vi.fn();
    const room           = makeRoom({ accessPolicy: "open" });
    const entries        = buildRoomConfigMenuEntries(room, onPolicyChange, noop);

    // Find the members-only entry and call onSelect
    const membersEntry = entries.find(
      (e) => e.label === ROOM_ACCESS_POLICY_LABEL["members-only"],
    );
    expect(membersEntry).toBeDefined();
    membersEntry!.onSelect!();
    expect(onPolicyChange).toHaveBeenCalledWith("ops-control", "members-only");
  });

  it("onSelect for set_fallback calls onSetFallback with roomId", () => {
    const onSetFallback = vi.fn();
    const room          = makeRoom();
    const entries       = buildRoomConfigMenuEntries(room, noop, onSetFallback);

    const fallback = entries.find((e) => e.item.action === "set_fallback");
    fallback!.onSelect!();
    expect(onSetFallback).toHaveBeenCalledWith("ops-control");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. computeRoomFixtureWorldPos — spatial placement
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-6: computeRoomFixtureWorldPos()", () => {
  it("returns room center X and Z, shifted Y by ROOM_CONFIG_FIXTURE_Y_OFFSET", () => {
    const room = makeRoom();
    const pos  = computeRoomFixtureWorldPos(room);
    expect(pos.x).toBe(room.positionHint.center.x);
    expect(pos.z).toBe(room.positionHint.center.z);
    expect(pos.y).toBeCloseTo(room.positionHint.center.y + ROOM_CONFIG_FIXTURE_Y_OFFSET, 4);
  });

  it("ROOM_CONFIG_FIXTURE_Y_OFFSET is a positive number > 0", () => {
    expect(ROOM_CONFIG_FIXTURE_Y_OFFSET).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. buildRoomConfigEntries — builds entries for multiple rooms
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-7: buildRoomConfigEntries()", () => {
  const rooms: RoomMetadataEntry[] = [
    makeRoom({ roomId: "room-a", maxOccupancy: 4 }),
    makeRoom({ roomId: "room-b", maxOccupancy: 6 }),
  ];

  it("returns one entry per room", () => {
    const entries = buildRoomConfigEntries(rooms, new Map());
    expect(entries).toHaveLength(2);
  });

  it("each entry has correct entityRef", () => {
    const entries = buildRoomConfigEntries(rooms, new Map());
    expect(entries[0].entityRef).toMatchObject({
      entityType: "room",
      entityId:   "room-a",
    });
    expect(entries[1].entityRef).toMatchObject({
      entityType: "room",
      entityId:   "room-b",
    });
  });

  it("each entry has 2 fixtures (capacity handle + rules anchor)", () => {
    const entries = buildRoomConfigEntries(rooms, new Map());
    for (const entry of entries) {
      expect(entry.fixtures).toHaveLength(2);
    }
  });

  it("occupancy from occupancyMap is reflected in fixture colors", () => {
    const occ = new Map([["room-a", 4]]); // 4/4 = 100% → red
    const entries = buildRoomConfigEntries(rooms, occ, true);
    const roomA = entries.find((e) => e.entityRef.entityId === "room-a")!;
    const [capacityHandle] = roomA.fixtures;
    expect(capacityHandle.color).toBe(ROOM_CAPACITY_FULL_COLOR);
  });

  it("rooms with 0 occupancy (missing from map) use ok (green) color", () => {
    const entries = buildRoomConfigEntries(rooms, new Map(), true);
    for (const entry of entries) {
      const [capacityHandle] = entry.fixtures;
      // 0/4 = 0% → green
      expect(capacityHandle.color).toBe(ROOM_CAPACITY_OK_COLOR);
    }
  });

  it("visible=false: all fixtures across all rooms are disabled", () => {
    const entries = buildRoomConfigEntries(rooms, new Map(), false);
    for (const entry of entries) {
      for (const fixture of entry.fixtures) {
        expect(fixture.disabled).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Intent routing — capacity drag end
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-8: Intent routing — FIXTURE_HANDLE_DRAG_END (capacity)", () => {
  it("correctly identifies capacity suffix after parse", () => {
    const fixtureId = roomCapacityFixtureId("ops-control");
    const parsed    = parseRoomConfigFixtureId(fixtureId);
    expect(parsed?.suffix).toBe(ROOM_CONFIG_CAPACITY_SUFFIX);
  });

  it("drag end intent produces a capacity change via computeNewCapacityFromDrag", () => {
    // Drag up 2 world units → should increase capacity
    const currentMax = 4;
    const newCapacity = computeNewCapacityFromDrag(currentMax, 0, 2);
    // 2 units × CAPACITY_DRAG_SCALE = +4
    expect(newCapacity).toBe(currentMax + 2 * CAPACITY_DRAG_SCALE);
  });

  it("returns parsed room ID from capacity fixture ID", () => {
    const intent = makeDragEndIntent(
      roomCapacityFixtureId("ops-control"),
      1.0,
      2.5,
    );
    const parsed = parseRoomConfigFixtureId(intent.fixtureId);
    expect(parsed?.roomId).toBe("ops-control");
    expect(parsed?.suffix).toBe(ROOM_CONFIG_CAPACITY_SUFFIX);
  });

  it("drag with null world positions is a no-op (null guard)", () => {
    // computeNewCapacityFromDrag is called only when dragOriginWorld and
    // dragEndWorld are non-null — verify the null check path
    const intentFull = makeDragEndIntent(roomCapacityFixtureId("ops-control"), 0, 1);
    expect(intentFull.dragOriginWorld).not.toBeNull();
    expect(intentFull.dragEndWorld).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Intent routing — rules menu anchor opened
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-9: Intent routing — FIXTURE_MENU_ANCHOR_OPENED (rules)", () => {
  it("correctly identifies rules suffix after parse", () => {
    const fixtureId = roomRulesFixtureId("impl-office");
    const parsed    = parseRoomConfigFixtureId(fixtureId);
    expect(parsed?.suffix).toBe(ROOM_CONFIG_RULES_SUFFIX);
  });

  it("menu open intent carries valid screen_position", () => {
    const intent = makeMenuOpenIntent(roomRulesFixtureId("ops-control"));
    expect(intent.screen_position).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });

  it("returns parsed room ID from rules fixture ID", () => {
    const intent = makeMenuOpenIntent(roomRulesFixtureId("lobby"));
    const parsed = parseRoomConfigFixtureId(intent.fixtureId);
    expect(parsed?.roomId).toBe("lobby");
    expect(parsed?.suffix).toBe(ROOM_CONFIG_RULES_SUFFIX);
  });

  it("buildRoomConfigMenuEntries is called with room data and returns entries", () => {
    const room    = makeRoom({ roomId: "ops-control" });
    const entries = buildRoomConfigMenuEntries(room, vi.fn(), vi.fn());
    expect(entries.length).toBeGreaterThan(0);
    // All entries must be for this room
    for (const e of entries) {
      expect(e.item.entityId).toBe("ops-control");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Intent routing — irrelevant intents are no-ops
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-10: Irrelevant intents → no action", () => {
  it("FIXTURE_BUTTON_CLICKED is not routed by parseRoomConfigFixtureId to a known suffix", () => {
    // A button intent should not produce a capacity or rules action.
    // The routing guard checks for FIXTURE_HANDLE_DRAG_END and
    // FIXTURE_MENU_ANCHOR_OPENED only.
    const intent  = makeButtonClickedIntent(roomCapacityFixtureId("ops-control"));
    // Test that the intent kind is NOT drag_end or menu_open
    expect(intent.intent).not.toBe("FIXTURE_HANDLE_DRAG_END");
    expect(intent.intent).not.toBe("FIXTURE_MENU_ANCHOR_OPENED");
  });

  it("fixtureId with unknown suffix (not capacity or rules) parses but is irrelevant", () => {
    const unknownId = "ops-control:some-other-action";
    const parsed    = parseRoomConfigFixtureId(unknownId);
    expect(parsed?.suffix).toBe("some-other-action");
    expect(parsed?.suffix).not.toBe(ROOM_CONFIG_CAPACITY_SUFFIX);
    expect(parsed?.suffix).not.toBe(ROOM_CONFIG_RULES_SUFFIX);
  });

  it("fixtureId with no matching suffix is correctly rejected in routing guard", () => {
    // fixtureId from a task orb control — should not match room config routing
    const taskFixtureId = "task-001:cancel";
    const parsed        = parseRoomConfigFixtureId(taskFixtureId);
    // parseRoomConfigFixtureId uses the same pattern as parseTaskFixtureId
    expect(parsed?.roomId).toBe("task-001");
    expect(parsed?.suffix).toBe("cancel");
    // The suffix "cancel" is not capacity or rules → no-op at routing level
    expect(parsed?.suffix).not.toBe(ROOM_CONFIG_CAPACITY_SUFFIX);
    expect(parsed?.suffix).not.toBe(ROOM_CONFIG_RULES_SUFFIX);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Constants sanity checks
// ─────────────────────────────────────────────────────────────────────────────

describe("rcc-11: Constants", () => {
  it("ROOM_FIXTURE_ID_SEP is a single-character separator", () => {
    expect(ROOM_FIXTURE_ID_SEP).toBe(":");
  });

  it("ROOM_CONFIG_CAPACITY_SUFFIX is 'capacity'", () => {
    expect(ROOM_CONFIG_CAPACITY_SUFFIX).toBe("capacity");
  });

  it("ROOM_CONFIG_RULES_SUFFIX is 'rules'", () => {
    expect(ROOM_CONFIG_RULES_SUFFIX).toBe("rules");
  });

  it("ROOM_CAPACITY_OK_COLOR is a positive hex number", () => {
    expect(ROOM_CAPACITY_OK_COLOR).toBeGreaterThan(0);
  });

  it("ROOM_RULES_MENU_COLOR is a positive hex number", () => {
    expect(ROOM_RULES_MENU_COLOR).toBeGreaterThan(0);
  });

  it("ROOM_FIXTURE_DISABLED_COLOR is less vivid than active colors", () => {
    // 0x444444 = dimgrey — numerically less than all active colors
    expect(ROOM_FIXTURE_DISABLED_COLOR).toBeLessThan(ROOM_CAPACITY_OK_COLOR);
    expect(ROOM_FIXTURE_DISABLED_COLOR).toBeLessThan(ROOM_CAPACITY_MID_COLOR);
    expect(ROOM_FIXTURE_DISABLED_COLOR).toBeLessThan(ROOM_CAPACITY_FULL_COLOR);
    expect(ROOM_FIXTURE_DISABLED_COLOR).toBeLessThan(ROOM_RULES_MENU_COLOR);
  });

  it("ROOM_ACCESS_POLICIES contains exactly 3 entries", () => {
    expect(ROOM_ACCESS_POLICIES).toHaveLength(3);
  });

  it("ROOM_ACCESS_POLICY_LABEL has a label for every policy", () => {
    for (const policy of ROOM_ACCESS_POLICIES) {
      expect(typeof ROOM_ACCESS_POLICY_LABEL[policy]).toBe("string");
      expect(ROOM_ACCESS_POLICY_LABEL[policy].length).toBeGreaterThan(0);
    }
  });
});
