/**
 * room-config-command-pipeline.ts — Sub-AC 7d: Room configuration command
 * pipeline.
 *
 * Translates `InteractionIntentEntity` objects that originate from room
 * affordances (room-layer or fixture-layer intents whose `source_payload`
 * carries a `roomConfigOperation` key) into `RoomConfigCommandEntity` objects
 * covering four canonical room-configuration operations:
 *
 *   • rename           — rename a room (update its display name)
 *   • retype           — change a room's functional type/designation
 *   • set_capacity     — set the maximum agent capacity for a room
 *   • set_occupancy_mode — set the occupancy / access mode for a room
 *
 * Architecture
 * ────────────
 *   InteractionIntentEntity (target_entity_type="room" or "fixture")
 *     ↓ source_payload carries roomConfigOperation field
 *   translateRoomConfigIntentToCommand()   ← pure pipeline function
 *     ↓
 *   RoomConfigCommandEntity                ← output command entity
 *
 * Intent → command translation contract
 * ──────────────────────────────────────
 * An `InteractionIntentEntity` whose `source_payload` carries:
 *
 *   source_payload.roomConfigOperation = "rename"             → RoomRenamePayload
 *   source_payload.roomConfigOperation = "retype"             → RoomRetypePayload
 *   source_payload.roomConfigOperation = "set_capacity"       → RoomSetCapacityPayload
 *   source_payload.roomConfigOperation = "set_occupancy_mode" → RoomSetOccupancyModePayload
 *
 * If `roomConfigOperation` is absent or does not match a known operation
 * string, `translateRoomConfigIntentToCommand()` returns `null`.
 *
 * Command entity structure
 * ────────────────────────
 * Each produced `RoomConfigCommandEntity` carries:
 *   • `command_id`        — unique identifier (timestamp + counter)
 *   • `ts` / `ts_iso`     — creation timestamp
 *   • `room_id`           — extracted from entity.target_id or source_payload.roomId
 *   • `operation`         — "rename" | "retype" | "set_capacity" | "set_occupancy_mode"
 *   • `operation_payload` — operation-specific sub-object with typed fields
 *   • `source_intent_id`  — back-reference to the originating intent entity
 *   • `source_gesture`    — gesture_type from the originating intent entity
 *
 * Pure TypeScript — no React, Three.js, or browser-DOM dependencies
 * ──────────────────────────────────────────────────────────────────
 * This module is fully headless and can be tested in Node.js without a
 * browser context.
 *
 * Relationship to Sub-AC 4b
 * ──────────────────────────
 * Sub-AC 4b (room-interaction-intents.ts) defines the raw room layer events
 * (ROOM_CLICKED, ROOM_CONTEXT_MENU, etc.).  Sub-AC 7d (this module) builds on
 * top of those events: when a room context-menu or fixture-button click carries
 * a `roomConfigOperation` field, this pipeline translates it into a typed
 * room-configuration command entity.
 *
 * Record transparency
 * ────────────────────
 * Every produced command entity:
 *   • Is immutable (Object.freeze applied by `makeRoomConfigCommand`)
 *   • Is JSON-serialisable
 *   • Carries `source_intent_id` linking it back to the originating intent
 *
 * Usage
 * ─────
 * ```ts
 * import {
 *   makeRoomConfigIntentPayload,
 *   translateRoomConfigIntentToCommand,
 * } from "../scene/room-config-command-pipeline.js";
 *
 * const payload = makeRoomConfigIntentPayload({
 *   roomConfigOperation: "rename",
 *   roomId: "room-ops-01",
 *   newName: "Operations Hub",
 * });
 *
 * const entity = makeInteractionIntentEntity({
 *   target_entity_type: "room",
 *   gesture_type: "context_menu",
 *   target_id: "room-ops-01",
 *   ts: Date.now(),
 *   layer: "infrastructure",
 *   source_payload: payload,
 * });
 *
 * const cmd = translateRoomConfigIntentToCommand(entity);
 * // cmd.room_id           === "room-ops-01"
 * // cmd.operation         === "rename"
 * // cmd.operation_payload === { operation: "rename", new_name: "Operations Hub" }
 * ```
 */

import type { InteractionIntentEntity } from "./interaction-intent-entity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Room configuration operation types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The four canonical room-configuration operations that a room affordance can
 * initiate via an interaction_intent.
 */
export type RoomConfigOperation =
  | "rename"
  | "retype"
  | "set_capacity"
  | "set_occupancy_mode";

/** O(1) membership set for guard checks. */
export const ROOM_CONFIG_OPERATIONS: ReadonlySet<string> =
  new Set<RoomConfigOperation>([
    "rename",
    "retype",
    "set_capacity",
    "set_occupancy_mode",
  ]);

/** Type guard: narrows an unknown string to `RoomConfigOperation`. */
export function isRoomConfigOperation(s: unknown): s is RoomConfigOperation {
  return typeof s === "string" && ROOM_CONFIG_OPERATIONS.has(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Room type enum (mirrors data/room-config-schema.ts but kept local)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valid room type designations — mirrors the room ontology.
 * Redefined here to keep the pipeline module self-contained.
 */
export type RoomType =
  | "control"
  | "office"
  | "lab"
  | "lobby"
  | "archive"
  | "corridor"
  | "conference"
  | "utility";

/** O(1) membership set for guard checks. */
export const ROOM_TYPES: ReadonlySet<string> = new Set<RoomType>([
  "control",
  "office",
  "lab",
  "lobby",
  "archive",
  "corridor",
  "conference",
  "utility",
]);

/** Type guard: narrows an unknown string to `RoomType`. */
export function isRoomType(s: unknown): s is RoomType {
  return typeof s === "string" && ROOM_TYPES.has(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Room occupancy mode enum
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Room occupancy / access modes.
 *
 * Controls who or what can enter a room:
 *   • `open`       — any agent can enter freely
 *   • `restricted` — only agents with the correct role may enter
 *   • `locked`     — no agent may enter (maintenance, quarantine, etc.)
 *   • `overflow`   — room temporarily accepts agents beyond normal capacity
 */
export type RoomOccupancyMode = "open" | "restricted" | "locked" | "overflow";

/** O(1) membership set for guard checks. */
export const ROOM_OCCUPANCY_MODES: ReadonlySet<string> =
  new Set<RoomOccupancyMode>(["open", "restricted", "locked", "overflow"]);

/** Type guard: narrows an unknown string to `RoomOccupancyMode`. */
export function isRoomOccupancyMode(s: unknown): s is RoomOccupancyMode {
  return typeof s === "string" && ROOM_OCCUPANCY_MODES.has(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation payload types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payload for the `rename` room-configuration operation.
 *
 * Updates the human-readable display name of a room.
 */
export interface RoomRenamePayload {
  /** Discriminant. */
  readonly operation: "rename";
  /**
   * The new display name for the room.
   * Must be a non-empty string.
   */
  readonly new_name: string;
  /**
   * Previous name — captured for audit transparency and undo support.
   */
  readonly previous_name?: string;
}

/**
 * Payload for the `retype` room-configuration operation.
 *
 * Changes the functional type / designation of a room.  This can affect
 * which agent roles are allowed to occupy the room and how the room is
 * rendered in the 3D scene.
 */
export interface RoomRetypePayload {
  /** Discriminant. */
  readonly operation: "retype";
  /**
   * The new room type designation.
   */
  readonly new_room_type: RoomType;
  /**
   * Previous room type — captured for audit transparency and undo support.
   */
  readonly previous_room_type?: RoomType;
}

/**
 * Payload for the `set_capacity` room-configuration operation.
 *
 * Sets the maximum number of agents that can simultaneously occupy a room.
 * The capacity must be a positive integer.
 */
export interface RoomSetCapacityPayload {
  /** Discriminant. */
  readonly operation: "set_capacity";
  /**
   * The new maximum agent capacity for the room.
   * Must be a positive integer (>= 1).
   */
  readonly capacity: number;
  /**
   * Previous capacity — captured for audit transparency and undo support.
   */
  readonly previous_capacity?: number;
}

/**
 * Payload for the `set_occupancy_mode` room-configuration operation.
 *
 * Sets the occupancy / access mode for a room.
 */
export interface RoomSetOccupancyModePayload {
  /** Discriminant. */
  readonly operation: "set_occupancy_mode";
  /**
   * The new occupancy mode for the room.
   */
  readonly new_mode: RoomOccupancyMode;
  /**
   * Previous mode — captured for audit transparency and undo support.
   */
  readonly previous_mode?: RoomOccupancyMode;
}

/**
 * Discriminated union of all valid room-configuration operation payloads.
 */
export type RoomConfigOperationPayload =
  | RoomRenamePayload
  | RoomRetypePayload
  | RoomSetCapacityPayload
  | RoomSetOccupancyModePayload;

// ─────────────────────────────────────────────────────────────────────────────
// Command entity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A command entity produced by the room-configuration intent pipeline
 * (Sub-AC 7d).
 *
 * This is NOT an orchestration-level `CommandFile` — it is an intermediate
 * command entity that lives within the GUI domain layer.  It can be forwarded
 * to `useCommandFileWriter` to produce the protocol-level command file that
 * reaches the Orchestrator.
 *
 * Key fields:
 *   • `room_id`           — the room that the configuration operation targets
 *   • `operation`         — the configuration operation kind
 *   • `operation_payload` — operation-specific typed payload
 *   • `source_intent_id`  — back-reference to the originating intent entity
 */
export interface RoomConfigCommandEntity {
  /** Unique command identifier (ISO timestamp + counter). */
  readonly command_id: string;
  /** Unix ms timestamp when this command entity was created. */
  readonly ts: number;
  /** ISO 8601 timestamp for log display. */
  readonly ts_iso: string;
  /**
   * The room that is the target of this configuration operation.
   * Extracted from the originating entity's `target_id` (for room-layer
   * intents) or from `source_payload.roomId` (for fixture-layer intents).
   */
  readonly room_id: string;
  /** The room-configuration operation to perform. */
  readonly operation: RoomConfigOperation;
  /**
   * Operation-specific payload carrying the structured arguments.
   * Discriminated on `operation_payload.operation`.
   */
  readonly operation_payload: RoomConfigOperationPayload;
  /** The `intent_id` of the originating `InteractionIntentEntity`. */
  readonly source_intent_id: string;
  /**
   * The `gesture_type` of the originating `InteractionIntentEntity`.
   * Typically "context_menu" or "click".
   */
  readonly source_gesture: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command ID generation
// ─────────────────────────────────────────────────────────────────────────────

/** Monotonic counter used to guarantee uniqueness within the same millisecond. */
let _roomCmdCounter = 0;

/**
 * Generate a unique room configuration command ID using the current timestamp
 * and a monotonic counter.  Format: `rcmd_{ts}_{counter}` where `ts` is Unix ms.
 *
 * The `r` prefix distinguishes room command IDs from lifecycle (`lcmd_…`) and
 * task (`tcmd_…`) command IDs.
 */
export function generateRoomConfigCommandId(): string {
  return `rcmd_${Date.now()}_${++_roomCmdCounter}`;
}

/**
 * Reset the room config command ID counter.  Intended for use in tests only.
 *
 * @internal
 */
export function _resetRoomConfigCommandCounter(): void {
  _roomCmdCounter = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source payload input type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured data that can be embedded in the `source_payload` of an
 * `InteractionIntentEntity` to signal that the intent should trigger a
 * room-configuration operation.
 *
 * This is the "carrier" record recognised by
 * `translateRoomConfigIntentToCommand`.
 */
export interface RoomConfigIntentPayload {
  /** The room-configuration operation to perform. */
  readonly roomConfigOperation: RoomConfigOperation;
  /**
   * Room ID — used as fallback when the intent's `target_id` is not a room ID
   * (e.g., fixture-layer intents where `target_id` is the fixture ID).
   */
  readonly roomId?: string;
  /**
   * New display name — required for `rename` operations.
   */
  readonly newName?: string;
  /**
   * Previous display name — optional for `rename` audit trail.
   */
  readonly previousName?: string;
  /**
   * New room type — required for `retype` operations.
   */
  readonly newRoomType?: RoomType;
  /**
   * Previous room type — optional for `retype` audit trail.
   */
  readonly previousRoomType?: RoomType;
  /**
   * Room capacity — required for `set_capacity` operations.
   * Must be a positive integer.
   */
  readonly capacity?: number;
  /**
   * Previous capacity — optional for `set_capacity` audit trail.
   */
  readonly previousCapacity?: number;
  /**
   * New occupancy mode — required for `set_occupancy_mode` operations.
   */
  readonly newOccupancyMode?: RoomOccupancyMode;
  /**
   * Previous occupancy mode — optional for `set_occupancy_mode` audit trail.
   */
  readonly previousOccupancyMode?: RoomOccupancyMode;
  /** Any additional context fields forwarded verbatim. */
  readonly [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: RoomConfigIntentPayload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a validated `RoomConfigIntentPayload` to embed in the `source_payload`
 * of an `InteractionIntentEntity`.
 *
 * Validates required fields for each operation:
 *   - `rename`             requires `newName`
 *   - `retype`             requires `newRoomType`
 *   - `set_capacity`       requires `capacity` (positive integer)
 *   - `set_occupancy_mode` requires `newOccupancyMode`
 *
 * @throws {TypeError} on validation failure (missing or invalid required fields)
 *
 * @example
 * ```ts
 * const payload = makeRoomConfigIntentPayload({
 *   roomConfigOperation: "set_capacity",
 *   roomId: "room-ops-01",
 *   capacity: 4,
 *   previousCapacity: 2,
 * });
 * ```
 */
export function makeRoomConfigIntentPayload(
  opts: {
    roomConfigOperation: RoomConfigOperation;
    roomId?: string;
    newName?: string;
    previousName?: string;
    newRoomType?: RoomType;
    previousRoomType?: RoomType;
    capacity?: number;
    previousCapacity?: number;
    newOccupancyMode?: RoomOccupancyMode;
    previousOccupancyMode?: RoomOccupancyMode;
  } & Record<string, unknown>,
): RoomConfigIntentPayload {
  const {
    roomConfigOperation,
    roomId,
    newName,
    previousName,
    newRoomType,
    previousRoomType,
    capacity,
    previousCapacity,
    newOccupancyMode,
    previousOccupancyMode,
    ...rest
  } = opts;

  if (roomConfigOperation === "rename" && (!newName || newName.trim().length === 0)) {
    throw new TypeError(
      "makeRoomConfigIntentPayload: 'newName' is required for 'rename' operation",
    );
  }

  if (roomConfigOperation === "retype" && !isRoomType(newRoomType)) {
    throw new TypeError(
      "makeRoomConfigIntentPayload: 'newRoomType' must be a valid RoomType for 'retype' operation",
    );
  }

  if (roomConfigOperation === "set_capacity") {
    if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1) {
      throw new TypeError(
        "makeRoomConfigIntentPayload: 'capacity' must be a positive integer for 'set_capacity' operation",
      );
    }
  }

  if (
    roomConfigOperation === "set_occupancy_mode" &&
    !isRoomOccupancyMode(newOccupancyMode)
  ) {
    throw new TypeError(
      "makeRoomConfigIntentPayload: 'newOccupancyMode' must be a valid RoomOccupancyMode for 'set_occupancy_mode' operation",
    );
  }

  return Object.freeze({
    roomConfigOperation,
    ...(roomId              !== undefined ? { roomId }              : {}),
    ...(newName             !== undefined ? { newName }             : {}),
    ...(previousName        !== undefined ? { previousName }        : {}),
    ...(newRoomType         !== undefined ? { newRoomType }         : {}),
    ...(previousRoomType    !== undefined ? { previousRoomType }    : {}),
    ...(capacity            !== undefined ? { capacity }            : {}),
    ...(previousCapacity    !== undefined ? { previousCapacity }    : {}),
    ...(newOccupancyMode    !== undefined ? { newOccupancyMode }    : {}),
    ...(previousOccupancyMode !== undefined ? { previousOccupancyMode } : {}),
    ...rest,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: RoomConfigCommandEntity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an immutable `RoomConfigCommandEntity` from the resolved components.
 *
 * @param roomId          — target room identifier
 * @param operation       — room-configuration operation kind
 * @param payload         — operation-specific typed payload
 * @param sourceIntentId  — intent_id of the originating intent entity
 * @param sourceGesture   — gesture_type of the originating intent entity
 * @param tsOverride      — override the creation timestamp (used in tests)
 */
export function makeRoomConfigCommand(opts: {
  roomId:         string;
  operation:      RoomConfigOperation;
  payload:        RoomConfigOperationPayload;
  sourceIntentId: string;
  sourceGesture:  string;
  tsOverride?:    number;
}): RoomConfigCommandEntity {
  const ts     = opts.tsOverride ?? Date.now();
  const ts_iso = new Date(ts).toISOString();

  return Object.freeze({
    command_id:        generateRoomConfigCommandId(),
    ts,
    ts_iso,
    room_id:           opts.roomId,
    operation:         opts.operation,
    operation_payload: Object.freeze(opts.payload),
    source_intent_id:  opts.sourceIntentId,
    source_gesture:    opts.sourceGesture,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Room ID resolution helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the `room_id` for a room-config command from an intent entity.
 *
 * For room-layer intents (target_entity_type="room"), the `target_id` IS the
 * room ID.  For fixture-layer intents (target_entity_type="fixture"), the
 * room ID must be carried in `source_payload.roomId`.
 *
 * Returns `null` if no valid room ID can be resolved.
 */
function resolveRoomId(
  entity: InteractionIntentEntity,
  payload: Record<string, unknown>,
): string | null {
  // Room-layer intent: target_id is the room ID
  if (entity.target_entity_type === "room") {
    const id = entity.target_id;
    return id && id.trim().length > 0 ? id : null;
  }

  // Fixture or other layer: room ID in payload
  const roomId = payload["roomId"];
  if (typeof roomId === "string" && roomId.trim().length > 0) {
    return roomId;
  }

  // Fall back to target_id if it looks like a room ID (non-empty string)
  const targetId = entity.target_id;
  return targetId && targetId.trim().length > 0 ? targetId : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core pipeline: intent → command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate an `InteractionIntentEntity` into a `RoomConfigCommandEntity`.
 *
 * Returns `null` if:
 *   • `entity.source_payload.roomConfigOperation` is absent or invalid
 *   • A valid room ID cannot be resolved
 *   • Operation-specific required fields are missing/invalid
 *
 * The function is **pure** — it produces the same output for the same input
 * and has no side effects.  Command dispatch is the caller's responsibility.
 *
 * Accepted `target_entity_type` values:
 *   • "room"    — direct room-layer intent (target_id is the room ID)
 *   • "fixture" — fixture-layer intent (room ID from source_payload.roomId)
 *
 * @param entity — A canonical `InteractionIntentEntity` from the dispatcher
 * @returns      — A frozen `RoomConfigCommandEntity`, or null
 */
export function translateRoomConfigIntentToCommand(
  entity: InteractionIntentEntity,
): RoomConfigCommandEntity | null {
  const payload = entity.source_payload as Record<string, unknown>;
  const opRaw   = payload["roomConfigOperation"];

  if (!isRoomConfigOperation(opRaw)) return null;

  const operation = opRaw;
  const roomId    = resolveRoomId(entity, payload);
  if (!roomId) return null;

  switch (operation) {
    case "rename": {
      const newName = payload["newName"];
      if (typeof newName !== "string" || newName.trim().length === 0) return null;

      const previousName = typeof payload["previousName"] === "string"
        ? payload["previousName"]
        : undefined;

      const operationPayload: RoomRenamePayload = Object.freeze({
        operation:    "rename",
        new_name:     newName.trim(),
        ...(previousName !== undefined ? { previous_name: previousName } : {}),
      });

      return makeRoomConfigCommand({
        roomId,
        operation,
        payload:        operationPayload,
        sourceIntentId: entity.intent_id,
        sourceGesture:  entity.gesture_type,
      });
    }

    case "retype": {
      const newRoomTypeRaw = payload["newRoomType"];
      if (!isRoomType(newRoomTypeRaw)) return null;

      const previousRoomType = isRoomType(payload["previousRoomType"])
        ? payload["previousRoomType"]
        : undefined;

      const operationPayload: RoomRetypePayload = Object.freeze({
        operation:      "retype",
        new_room_type:  newRoomTypeRaw,
        ...(previousRoomType !== undefined ? { previous_room_type: previousRoomType } : {}),
      });

      return makeRoomConfigCommand({
        roomId,
        operation,
        payload:        operationPayload,
        sourceIntentId: entity.intent_id,
        sourceGesture:  entity.gesture_type,
      });
    }

    case "set_capacity": {
      const capacityRaw = payload["capacity"];
      if (
        typeof capacityRaw !== "number" ||
        !Number.isInteger(capacityRaw) ||
        capacityRaw < 1
      ) {
        return null;
      }

      const previousCapacity =
        typeof payload["previousCapacity"] === "number" &&
        Number.isInteger(payload["previousCapacity"]) &&
        (payload["previousCapacity"] as number) >= 1
          ? (payload["previousCapacity"] as number)
          : undefined;

      const operationPayload: RoomSetCapacityPayload = Object.freeze({
        operation:  "set_capacity",
        capacity:   capacityRaw,
        ...(previousCapacity !== undefined ? { previous_capacity: previousCapacity } : {}),
      });

      return makeRoomConfigCommand({
        roomId,
        operation,
        payload:        operationPayload,
        sourceIntentId: entity.intent_id,
        sourceGesture:  entity.gesture_type,
      });
    }

    case "set_occupancy_mode": {
      const newModeRaw = payload["newOccupancyMode"];
      if (!isRoomOccupancyMode(newModeRaw)) return null;

      const previousMode = isRoomOccupancyMode(payload["previousOccupancyMode"])
        ? payload["previousOccupancyMode"]
        : undefined;

      const operationPayload: RoomSetOccupancyModePayload = Object.freeze({
        operation: "set_occupancy_mode",
        new_mode:  newModeRaw,
        ...(previousMode !== undefined ? { previous_mode: previousMode } : {}),
      });

      return makeRoomConfigCommand({
        roomId,
        operation,
        payload:        operationPayload,
        sourceIntentId: entity.intent_id,
        sourceGesture:  entity.gesture_type,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch pipeline helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate an array of `InteractionIntentEntity` objects, returning only
 * those that produce a valid `RoomConfigCommandEntity`.
 *
 * Convenience wrapper around `translateRoomConfigIntentToCommand` for
 * processing a batch (e.g., flushing the dispatcher ring-buffer).
 *
 * @param entities — Array of canonical intent entities from the dispatcher
 * @returns        — Array of room-config command entities (no nulls)
 */
export function translateRoomConfigIntentBatch(
  entities: readonly InteractionIntentEntity[],
): RoomConfigCommandEntity[] {
  const results: RoomConfigCommandEntity[] = [];
  for (const entity of entities) {
    const cmd = translateRoomConfigIntentToCommand(entity);
    if (cmd !== null) {
      results.push(cmd);
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command type mapping helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a `RoomConfigOperation` to the corresponding protocol-level
 * `GuiCommandType` string that `useCommandFileWriter` accepts.
 *
 * This mapping is the single source of truth for 7d room → protocol command
 * type translation.
 */
export const ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE: Readonly<
  Record<RoomConfigOperation, string>
> = Object.freeze({
  rename:             "room.rename",
  retype:             "room.retype",
  set_capacity:       "room.set_capacity",
  set_occupancy_mode: "room.set_occupancy_mode",
} as const);

/**
 * Resolve the protocol command type string for a given room-configuration
 * operation.
 *
 * @param operation — Room config operation from a `RoomConfigCommandEntity`
 * @returns         — Protocol command type string (e.g. "room.rename")
 */
export function resolveRoomConfigCommandType(
  operation: RoomConfigOperation,
): string {
  return ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE[operation];
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

/** Type guard: narrows unknown to `RoomConfigCommandEntity`. */
export function isRoomConfigCommandEntity(
  v: unknown,
): v is RoomConfigCommandEntity {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["command_id"]        === "string" &&
    typeof r["room_id"]           === "string" &&
    typeof r["operation"]         === "string" &&
    isRoomConfigOperation(r["operation"]) &&
    typeof r["operation_payload"] === "object" && r["operation_payload"] !== null &&
    typeof r["source_intent_id"]  === "string" &&
    typeof r["ts"]                === "number"
  );
}

/** Type guard: narrows `RoomConfigOperationPayload` to `RoomRenamePayload`. */
export function isRoomRenamePayload(
  p: RoomConfigOperationPayload,
): p is RoomRenamePayload {
  return p.operation === "rename";
}

/** Type guard: narrows `RoomConfigOperationPayload` to `RoomRetypePayload`. */
export function isRoomRetypePayload(
  p: RoomConfigOperationPayload,
): p is RoomRetypePayload {
  return p.operation === "retype";
}

/** Type guard: narrows `RoomConfigOperationPayload` to `RoomSetCapacityPayload`. */
export function isRoomSetCapacityPayload(
  p: RoomConfigOperationPayload,
): p is RoomSetCapacityPayload {
  return p.operation === "set_capacity";
}

/** Type guard: narrows `RoomConfigOperationPayload` to `RoomSetOccupancyModePayload`. */
export function isRoomSetOccupancyModePayload(
  p: RoomConfigOperationPayload,
): p is RoomSetOccupancyModePayload {
  return p.operation === "set_occupancy_mode";
}
