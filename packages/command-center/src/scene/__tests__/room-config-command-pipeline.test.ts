/**
 * room-config-command-pipeline.test.ts — Sub-AC 7d
 *
 * Verifies that interaction_intents originating from room affordances produce
 * room-configuration command entities covering rename, retype, set_capacity,
 * and set_occupancy_mode operations with correct payload schemas.
 *
 * Test surface:
 *   A. Operation type coverage — all four operations produce a command
 *   B. room_id resolution — from room-layer target_id and fixture-layer roomId
 *   C. operation_payload correctness — typed sub-objects with correct fields
 *   D. source_intent_id linkage — command traces back to originating intent
 *   E. Command entity structure invariants (frozen, JSON-serialisable, ts fields)
 *   F. Edge cases — missing required fields return null
 *   G. Batch pipeline helper
 *   H. ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE mapping
 *   I. makeRoomConfigIntentPayload factory validation
 *   J. Type guards
 *   K. Audit trail fields (previous_* captured when provided)
 *
 * All tests are pure — no React, Three.js, WebSocket, or async I/O.
 * Tests can run in Node.js via `vitest run`.
 *
 * Test ID scheme:  7d-room-1  through 7d-room-N
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  // Core pipeline
  translateRoomConfigIntentToCommand,
  translateRoomConfigIntentBatch,
  // Factories
  makeRoomConfigIntentPayload,
  makeRoomConfigCommand,
  // Command type mapping
  ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE,
  resolveRoomConfigCommandType,
  // Type guards
  isRoomConfigOperation,
  isRoomConfigCommandEntity,
  isRoomRenamePayload,
  isRoomRetypePayload,
  isRoomSetCapacityPayload,
  isRoomSetOccupancyModePayload,
  isRoomType,
  isRoomOccupancyMode,
  // Constants
  ROOM_CONFIG_OPERATIONS,
  ROOM_TYPES,
  ROOM_OCCUPANCY_MODES,
  // Counter reset for deterministic IDs in tests
  _resetRoomConfigCommandCounter,
  // Types
  type RoomConfigOperation,
  type RoomConfigCommandEntity,
  type RoomRenamePayload,
  type RoomRetypePayload,
  type RoomSetCapacityPayload,
  type RoomSetOccupancyModePayload,
} from "../room-config-command-pipeline.js";

import {
  makeInteractionIntentEntity,
} from "../interaction-intent-entity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a room-layer intent entity with the given room config payload. */
function makeRoomLayerIntent(
  roomId: string,
  payloadOpts: Parameters<typeof makeRoomConfigIntentPayload>[0],
) {
  const payload = makeRoomConfigIntentPayload(payloadOpts);
  return makeInteractionIntentEntity({
    target_entity_type: "room",
    gesture_type:       "context_menu",
    target_id:          roomId,
    ts:                 1_700_000_000_000,
    layer:              "infrastructure",
    source_payload:     payload,
  });
}

/** Build a fixture-layer intent where roomId is in the payload. */
function makeFixtureRoomIntent(
  payloadOpts: Parameters<typeof makeRoomConfigIntentPayload>[0] & { roomId: string },
) {
  const payload = makeRoomConfigIntentPayload(payloadOpts);
  return makeInteractionIntentEntity({
    target_entity_type: "fixture",
    gesture_type:       "click",
    target_id:          "room-config-btn",
    ts:                 1_700_000_000_000,
    layer:              "domain",
    source_payload:     payload,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Operation type coverage
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: A. Operation type coverage", () => {
  beforeEach(() => {
    _resetRoomConfigCommandCounter();
  });

  it("7d-room-1: rename operation produces a RoomConfigCommandEntity", () => {
    const entity = makeRoomLayerIntent("room-ops-01", {
      roomConfigOperation: "rename",
      newName:             "Operations Hub",
    });
    const cmd = translateRoomConfigIntentToCommand(entity);
    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("rename");
  });

  it("7d-room-2: retype operation produces a RoomConfigCommandEntity", () => {
    const entity = makeRoomLayerIntent("room-lab-02", {
      roomConfigOperation: "retype",
      newRoomType:         "control",
    });
    const cmd = translateRoomConfigIntentToCommand(entity);
    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("retype");
  });

  it("7d-room-3: set_capacity operation produces a RoomConfigCommandEntity", () => {
    const entity = makeRoomLayerIntent("room-office-03", {
      roomConfigOperation: "set_capacity",
      capacity:            6,
    });
    const cmd = translateRoomConfigIntentToCommand(entity);
    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("set_capacity");
  });

  it("7d-room-4: set_occupancy_mode operation produces a RoomConfigCommandEntity", () => {
    const entity = makeRoomLayerIntent("room-lobby-01", {
      roomConfigOperation: "set_occupancy_mode",
      newOccupancyMode:    "restricted",
    });
    const cmd = translateRoomConfigIntentToCommand(entity);
    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("set_occupancy_mode");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. room_id resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: B. room_id resolution", () => {
  it("7d-room-5: room-layer intent uses target_id as room_id", () => {
    const entity = makeRoomLayerIntent("room-ctrl-01", {
      roomConfigOperation: "rename",
      newName:             "Control Room Alpha",
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(cmd.room_id).toBe("room-ctrl-01");
  });

  it("7d-room-6: fixture-layer intent resolves room_id from payload.roomId", () => {
    const entity = makeFixtureRoomIntent({
      roomConfigOperation: "rename",
      roomId:              "room-ops-99",
      newName:             "Ops Room Beta",
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(cmd.room_id).toBe("room-ops-99");
  });

  it("7d-room-7: fixture-layer intent falls back to target_id when roomId absent", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "room-fallback-01",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     {
        roomConfigOperation: "rename",
        newName:             "Fallback Room",
        // no roomId in payload
      },
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(cmd.room_id).toBe("room-fallback-01");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. operation_payload correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: C. operation_payload correctness", () => {
  it("7d-room-8: rename payload has correct new_name and operation", () => {
    const entity = makeRoomLayerIntent("room-r01", {
      roomConfigOperation: "rename",
      newName:             "War Room",
      previousName:        "Old War Room",
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(isRoomRenamePayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as RoomRenamePayload;
    expect(p.operation).toBe("rename");
    expect(p.new_name).toBe("War Room");
    expect(p.previous_name).toBe("Old War Room");
  });

  it("7d-room-9: retype payload has correct new_room_type", () => {
    const entity = makeRoomLayerIntent("room-r02", {
      roomConfigOperation: "retype",
      newRoomType:         "lab",
      previousRoomType:    "office",
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(isRoomRetypePayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as RoomRetypePayload;
    expect(p.new_room_type).toBe("lab");
    expect(p.previous_room_type).toBe("office");
  });

  it("7d-room-10: set_capacity payload has correct capacity", () => {
    const entity = makeRoomLayerIntent("room-r03", {
      roomConfigOperation: "set_capacity",
      capacity:            8,
      previousCapacity:    4,
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(isRoomSetCapacityPayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as RoomSetCapacityPayload;
    expect(p.capacity).toBe(8);
    expect(p.previous_capacity).toBe(4);
  });

  it("7d-room-11: set_occupancy_mode payload has correct new_mode", () => {
    const entity = makeRoomLayerIntent("room-r04", {
      roomConfigOperation: "set_occupancy_mode",
      newOccupancyMode:    "locked",
      previousOccupancyMode: "open",
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(isRoomSetOccupancyModePayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as RoomSetOccupancyModePayload;
    expect(p.new_mode).toBe("locked");
    expect(p.previous_mode).toBe("open");
  });

  it("7d-room-12: rename trims whitespace from new_name", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-trim",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { roomConfigOperation: "rename", newName: "  Trimmed Name  " },
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    const p = cmd.operation_payload as RoomRenamePayload;
    expect(p.new_name).toBe("Trimmed Name");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. source_intent_id linkage
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: D. source_intent_id linkage", () => {
  it("7d-room-13: command.source_intent_id matches originating intent.intent_id", () => {
    const entity = makeRoomLayerIntent("room-link-01", {
      roomConfigOperation: "rename",
      newName:             "Linked Room",
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(cmd.source_intent_id).toBe(entity.intent_id);
  });

  it("7d-room-14: command.source_gesture matches originating intent.gesture_type", () => {
    const entity = makeRoomLayerIntent("room-link-02", {
      roomConfigOperation: "set_capacity",
      capacity:            3,
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(cmd.source_gesture).toBe("context_menu");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Command entity structure invariants
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: E. Command entity structure invariants", () => {
  beforeEach(() => {
    _resetRoomConfigCommandCounter();
  });

  it("7d-room-15: command entity has all required fields with correct types", () => {
    const entity = makeRoomLayerIntent("room-struct", {
      roomConfigOperation: "rename",
      newName:             "Struct Room",
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(typeof cmd.command_id).toBe("string");
    expect(cmd.command_id.startsWith("rcmd_")).toBe(true);
    expect(typeof cmd.ts).toBe("number");
    expect(typeof cmd.ts_iso).toBe("string");
    expect(cmd.ts_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof cmd.room_id).toBe("string");
    expect(typeof cmd.operation).toBe("string");
    expect(typeof cmd.operation_payload).toBe("object");
    expect(typeof cmd.source_intent_id).toBe("string");
    expect(typeof cmd.source_gesture).toBe("string");
  });

  it("7d-room-16: command entity is frozen (immutable)", () => {
    const entity = makeRoomLayerIntent("room-frozen", {
      roomConfigOperation: "rename",
      newName:             "Frozen Room",
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(Object.isFrozen(cmd)).toBe(true);
  });

  it("7d-room-17: command entity is JSON-serialisable (record transparency)", () => {
    const entity = makeRoomLayerIntent("room-json", {
      roomConfigOperation: "set_capacity",
      capacity:            5,
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(() => JSON.stringify(cmd)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(cmd));
    expect(parsed.room_id).toBe("room-json");
    expect(parsed.operation).toBe("set_capacity");
  });

  it("7d-room-18: command IDs are monotonically unique", () => {
    _resetRoomConfigCommandCounter();
    const e1 = makeRoomLayerIntent("r1", { roomConfigOperation: "rename", newName: "A" });
    const e2 = makeRoomLayerIntent("r2", { roomConfigOperation: "rename", newName: "B" });
    const cmd1 = translateRoomConfigIntentToCommand(e1)!;
    const cmd2 = translateRoomConfigIntentToCommand(e2)!;
    expect(cmd1.command_id).not.toBe(cmd2.command_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Edge cases — null returns
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: F. Edge cases — null returns", () => {
  it("7d-room-19: returns null when roomConfigOperation is absent", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-x",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { unrelated: true },
    });
    expect(translateRoomConfigIntentToCommand(entity)).toBeNull();
  });

  it("7d-room-20: returns null when roomConfigOperation is not a valid string", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-x",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { roomConfigOperation: "delete_room" },
    });
    expect(translateRoomConfigIntentToCommand(entity)).toBeNull();
  });

  it("7d-room-21: rename returns null when newName is missing", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-x",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { roomConfigOperation: "rename" },
    });
    expect(translateRoomConfigIntentToCommand(entity)).toBeNull();
  });

  it("7d-room-22: rename returns null when newName is empty string", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-x",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { roomConfigOperation: "rename", newName: "   " },
    });
    expect(translateRoomConfigIntentToCommand(entity)).toBeNull();
  });

  it("7d-room-23: retype returns null when newRoomType is invalid", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-x",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { roomConfigOperation: "retype", newRoomType: "dungeon" },
    });
    expect(translateRoomConfigIntentToCommand(entity)).toBeNull();
  });

  it("7d-room-24: set_capacity returns null when capacity is zero", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-x",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { roomConfigOperation: "set_capacity", capacity: 0 },
    });
    expect(translateRoomConfigIntentToCommand(entity)).toBeNull();
  });

  it("7d-room-25: set_capacity returns null when capacity is negative", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-x",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { roomConfigOperation: "set_capacity", capacity: -3 },
    });
    expect(translateRoomConfigIntentToCommand(entity)).toBeNull();
  });

  it("7d-room-26: set_capacity returns null when capacity is a float", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-x",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { roomConfigOperation: "set_capacity", capacity: 3.5 },
    });
    expect(translateRoomConfigIntentToCommand(entity)).toBeNull();
  });

  it("7d-room-27: set_occupancy_mode returns null when newOccupancyMode is invalid", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "room-x",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { roomConfigOperation: "set_occupancy_mode", newOccupancyMode: "evacuated" },
    });
    expect(translateRoomConfigIntentToCommand(entity)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Batch pipeline helper
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: G. Batch pipeline helper", () => {
  it("7d-room-28: translateRoomConfigIntentBatch filters nulls and returns valid commands", () => {
    const valid1 = makeRoomLayerIntent("r1", { roomConfigOperation: "rename", newName: "A" });
    const valid2 = makeRoomLayerIntent("r2", { roomConfigOperation: "set_capacity", capacity: 4 });
    const invalid = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "context_menu",
      target_id:          "r3",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { notAConfig: true },
    });

    const results = translateRoomConfigIntentBatch([valid1, invalid, valid2]);
    expect(results).toHaveLength(2);
    expect(results[0]!.operation).toBe("rename");
    expect(results[1]!.operation).toBe("set_capacity");
  });

  it("7d-room-29: translateRoomConfigIntentBatch returns empty array for empty input", () => {
    expect(translateRoomConfigIntentBatch([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE mapping
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: H. ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE mapping", () => {
  it("7d-room-30: rename maps to 'room.rename'", () => {
    expect(ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE["rename"]).toBe("room.rename");
    expect(resolveRoomConfigCommandType("rename")).toBe("room.rename");
  });

  it("7d-room-31: retype maps to 'room.retype'", () => {
    expect(ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE["retype"]).toBe("room.retype");
    expect(resolveRoomConfigCommandType("retype")).toBe("room.retype");
  });

  it("7d-room-32: set_capacity maps to 'room.set_capacity'", () => {
    expect(ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE["set_capacity"]).toBe("room.set_capacity");
    expect(resolveRoomConfigCommandType("set_capacity")).toBe("room.set_capacity");
  });

  it("7d-room-33: set_occupancy_mode maps to 'room.set_occupancy_mode'", () => {
    expect(ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE["set_occupancy_mode"]).toBe("room.set_occupancy_mode");
    expect(resolveRoomConfigCommandType("set_occupancy_mode")).toBe("room.set_occupancy_mode");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. makeRoomConfigIntentPayload factory validation
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: I. makeRoomConfigIntentPayload factory validation", () => {
  it("7d-room-34: throws when rename is missing newName", () => {
    expect(() =>
      makeRoomConfigIntentPayload({ roomConfigOperation: "rename" })
    ).toThrow(TypeError);
  });

  it("7d-room-35: throws when retype has invalid newRoomType", () => {
    expect(() =>
      makeRoomConfigIntentPayload({ roomConfigOperation: "retype", newRoomType: "dungeon" as never })
    ).toThrow(TypeError);
  });

  it("7d-room-36: throws when set_capacity has capacity = 0", () => {
    expect(() =>
      makeRoomConfigIntentPayload({ roomConfigOperation: "set_capacity", capacity: 0 })
    ).toThrow(TypeError);
  });

  it("7d-room-37: throws when set_occupancy_mode has invalid mode", () => {
    expect(() =>
      makeRoomConfigIntentPayload({
        roomConfigOperation: "set_occupancy_mode",
        newOccupancyMode: "evacuated" as never,
      })
    ).toThrow(TypeError);
  });

  it("7d-room-38: returns frozen payload for valid rename", () => {
    const p = makeRoomConfigIntentPayload({
      roomConfigOperation: "rename",
      newName:             "Valid Name",
    });
    expect(Object.isFrozen(p)).toBe(true);
    expect(p.roomConfigOperation).toBe("rename");
    expect(p.newName).toBe("Valid Name");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J. Type guards
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: J. Type guards", () => {
  it("7d-room-39: isRoomConfigOperation narrows valid operations", () => {
    expect(isRoomConfigOperation("rename")).toBe(true);
    expect(isRoomConfigOperation("retype")).toBe(true);
    expect(isRoomConfigOperation("set_capacity")).toBe(true);
    expect(isRoomConfigOperation("set_occupancy_mode")).toBe(true);
    expect(isRoomConfigOperation("delete")).toBe(false);
    expect(isRoomConfigOperation(null)).toBe(false);
  });

  it("7d-room-40: isRoomConfigCommandEntity validates complete entity", () => {
    const entity = makeRoomLayerIntent("room-guard", {
      roomConfigOperation: "rename",
      newName:             "Guard Room",
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    expect(isRoomConfigCommandEntity(cmd)).toBe(true);
    expect(isRoomConfigCommandEntity(null)).toBe(false);
    expect(isRoomConfigCommandEntity({ command_id: "x" })).toBe(false);
  });

  it("7d-room-41: payload type guards discriminate correctly", () => {
    const renameEntity  = makeRoomLayerIntent("r1", { roomConfigOperation: "rename", newName: "N" });
    const retypeEntity  = makeRoomLayerIntent("r2", { roomConfigOperation: "retype", newRoomType: "lab" });
    const capacityEntity = makeRoomLayerIntent("r3", { roomConfigOperation: "set_capacity", capacity: 2 });
    const modeEntity    = makeRoomLayerIntent("r4", { roomConfigOperation: "set_occupancy_mode", newOccupancyMode: "open" });

    const renameCmd   = translateRoomConfigIntentToCommand(renameEntity)!;
    const retypeCmd   = translateRoomConfigIntentToCommand(retypeEntity)!;
    const capacityCmd = translateRoomConfigIntentToCommand(capacityEntity)!;
    const modeCmd     = translateRoomConfigIntentToCommand(modeEntity)!;

    expect(isRoomRenamePayload(renameCmd.operation_payload)).toBe(true);
    expect(isRoomRetypePayload(renameCmd.operation_payload)).toBe(false);

    expect(isRoomRetypePayload(retypeCmd.operation_payload)).toBe(true);
    expect(isRoomRenamePayload(retypeCmd.operation_payload)).toBe(false);

    expect(isRoomSetCapacityPayload(capacityCmd.operation_payload)).toBe(true);
    expect(isRoomSetOccupancyModePayload(capacityCmd.operation_payload)).toBe(false);

    expect(isRoomSetOccupancyModePayload(modeCmd.operation_payload)).toBe(true);
    expect(isRoomSetCapacityPayload(modeCmd.operation_payload)).toBe(false);
  });

  it("7d-room-42: isRoomType validates known room types", () => {
    for (const rt of ["control", "office", "lab", "lobby", "archive", "corridor", "conference", "utility"]) {
      expect(isRoomType(rt)).toBe(true);
    }
    expect(isRoomType("dungeon")).toBe(false);
    expect(isRoomType(null)).toBe(false);
  });

  it("7d-room-43: isRoomOccupancyMode validates known modes", () => {
    for (const mode of ["open", "restricted", "locked", "overflow"]) {
      expect(isRoomOccupancyMode(mode)).toBe(true);
    }
    expect(isRoomOccupancyMode("evacuated")).toBe(false);
    expect(isRoomOccupancyMode(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// K. Audit trail fields
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: K. Audit trail fields (previous_* captured when provided)", () => {
  it("7d-room-44: rename previous_name is omitted when not provided", () => {
    const entity = makeRoomLayerIntent("room-audit", {
      roomConfigOperation: "rename",
      newName:             "New Name",
      // no previousName
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    const p = cmd.operation_payload as RoomRenamePayload;
    expect(p.previous_name).toBeUndefined();
  });

  it("7d-room-45: retype previous_room_type is omitted when not provided", () => {
    const entity = makeRoomLayerIntent("room-audit2", {
      roomConfigOperation: "retype",
      newRoomType:         "archive",
      // no previousRoomType
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    const p = cmd.operation_payload as RoomRetypePayload;
    expect(p.previous_room_type).toBeUndefined();
  });

  it("7d-room-46: set_capacity previous_capacity is omitted when not provided", () => {
    const entity = makeRoomLayerIntent("room-audit3", {
      roomConfigOperation: "set_capacity",
      capacity:            3,
      // no previousCapacity
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    const p = cmd.operation_payload as RoomSetCapacityPayload;
    expect(p.previous_capacity).toBeUndefined();
  });

  it("7d-room-47: set_occupancy_mode previous_mode is omitted when not provided", () => {
    const entity = makeRoomLayerIntent("room-audit4", {
      roomConfigOperation: "set_occupancy_mode",
      newOccupancyMode:    "overflow",
      // no previousOccupancyMode
    });
    const cmd = translateRoomConfigIntentToCommand(entity)!;
    const p = cmd.operation_payload as RoomSetOccupancyModePayload;
    expect(p.previous_mode).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROOM_CONFIG_OPERATIONS set completeness
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-room: ROOM_CONFIG_OPERATIONS set completeness", () => {
  it("7d-room-48: ROOM_CONFIG_OPERATIONS contains all four operations", () => {
    const ops: RoomConfigOperation[] = [
      "rename", "retype", "set_capacity", "set_occupancy_mode",
    ];
    for (const op of ops) {
      expect(ROOM_CONFIG_OPERATIONS.has(op)).toBe(true);
    }
    expect(ROOM_CONFIG_OPERATIONS.size).toBe(4);
  });

  it("7d-room-49: ROOM_TYPES contains all eight room types", () => {
    const types = ["control", "office", "lab", "lobby", "archive", "corridor", "conference", "utility"];
    for (const rt of types) {
      expect(ROOM_TYPES.has(rt)).toBe(true);
    }
    expect(ROOM_TYPES.size).toBe(8);
  });

  it("7d-room-50: ROOM_OCCUPANCY_MODES contains all four modes", () => {
    for (const mode of ["open", "restricted", "locked", "overflow"]) {
      expect(ROOM_OCCUPANCY_MODES.has(mode)).toBe(true);
    }
    expect(ROOM_OCCUPANCY_MODES.size).toBe(4);
  });
});
