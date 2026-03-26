/**
 * @module layout
 * RFC-1.0.1 §4 extension — Layout event payloads, type guards, and utilities
 * for the 3D diegetic command-center.
 *
 * Layout events describe changes to the spatial arrangement of the 3D world:
 * rooms, desks, cameras, agent nodes, and other scene objects.
 *
 * Event hierarchy:
 *   layout.init        — spatial bootstrapping: seeds the full initial scene
 *                        (building, rooms, agents, fixtures) from config; emitted
 *                        once per run / cold-start to establish the baseline world
 *   layout.created     — a new named layout instance was created
 *   layout.updated     — one or more layout properties were changed
 *   layout.deleted     — a layout instance was permanently removed
 *   layout.node.moved  — a specific scene node was repositioned / rotated
 *   layout.reset       — the entire layout was reset to defaults
 *   layout.saved       — the current layout was persisted to storage
 *   layout.loaded      — a saved layout was restored from storage
 *   layout.changed     — legacy generic mutation (prefer layout.updated)
 */
import type { EventType } from "./event.js";

// ---------------------------------------------------------------------------
// Layout EventType subset
// ---------------------------------------------------------------------------

/** Tuple of all canonical layout event type strings. */
export const LAYOUT_EVENT_TYPES = [
  // Spatial bootstrapping — emitted once per run to seed the initial scene
  "layout.init",
  "layout.created",
  // layout.update  — update INITIATED (intent / in-progress)
  // layout.updated — update COMPLETED (past-tense, with diff)
  // The pair follows the request/completion convention used elsewhere
  // (e.g. agent.retire_requested / agent.retired, command.issued / command.completed).
  "layout.update",
  "layout.updated",
  "layout.deleted",
  "layout.node.moved",
  "layout.reset",
  "layout.saved",
  "layout.loaded",
  "layout.changed",
] as const satisfies readonly EventType[];

export type LayoutEventType = (typeof LAYOUT_EVENT_TYPES)[number];

/** O(1) membership test for layout event types. */
export const LAYOUT_EVENT_TYPE_SET: ReadonlySet<string> = new Set(LAYOUT_EVENT_TYPES);

/** Type guard — narrows a string to a LayoutEventType. */
export function isLayoutEventType(s: string): s is LayoutEventType {
  return LAYOUT_EVENT_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Primitive geometry types
// ---------------------------------------------------------------------------

/** 3-component vector used for position, rotation (Euler angles), and scale. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Valid node categories recognised by the 3D scene graph. */
export type LayoutNodeType =
  | "room"
  | "desk"
  | "agent"
  | "camera"
  | "building"
  | "prop";

// ---------------------------------------------------------------------------
// layout.init — spatial bootstrapping primitives
// ---------------------------------------------------------------------------

/**
 * Initial spatial descriptor for a single room node within the scene.
 * Used in the `rooms` array of {@link LayoutInitPayload}.
 */
export interface RoomInitNode {
  /** Unique identifier matching the RoomDef.id in room-config-schema. */
  room_id: string;
  /** World-space position of the room's origin. */
  position: Vec3;
  /** Euler rotation (radians, Y-up right-handed). */
  rotation?: Vec3;
  /** Scale vector (default 1,1,1). */
  scale?: Vec3;
  /** Floor number this room occupies. */
  floor?: number;
}

/**
 * Initial spatial descriptor for a single agent node within the scene.
 * Used in the `agents` array of {@link LayoutInitPayload}.
 */
export interface AgentInitNode {
  /** Unique identifier of the agent (matches the agent persona YAML id field). */
  agent_id: string;
  /** Room the agent starts in. */
  room_id: string;
  /** World-space position within the room. */
  position: Vec3;
  /** Euler rotation (radians). */
  rotation?: Vec3;
}

/**
 * Initial spatial descriptor for a fixture placed in the scene at boot.
 * Used in the `fixtures` array of {@link LayoutInitPayload}.
 */
export interface FixtureInitNode {
  /** Stable fixture identifier. */
  fixture_id: string;
  /** Fixture archetype discriminator (e.g. "control_panel", "door_handle"). */
  fixture_type: string;
  /** Room this fixture belongs to. */
  room_id?: string;
  /** World-space position. */
  position: Vec3;
  /** Euler rotation (radians). */
  rotation?: Vec3;
  /** Fixture-type-specific initial configuration (opaque). */
  initial_config?: Record<string, unknown>;
}

/**
 * How the spatial bootstrapping was triggered.
 *
 * - `config`    — derived from static room-config-schema + agent YAML files
 * - `user`      — operator explicitly issued a layout initialisation command
 * - `migration` — produced during a schema migration / data-format upgrade
 * - `replay`    — reconstructed by the replay engine from a prior event log
 */
export type LayoutInitSource = "config" | "user" | "migration" | "replay";

// ---------------------------------------------------------------------------
// Payload interfaces — one per canonical layout event type
// ---------------------------------------------------------------------------

/**
 * layout.init  (spatial bootstrapping)
 *
 * The **single seed event** that establishes the complete initial spatial
 * state of the 3D world.  It MUST be the first `layout.*` event appended to
 * the event log for a given `layout_id` (or, in replay mode, the oldest event
 * replayed for that layout).
 *
 * Design rationale
 * ----------------
 * Cold-start replay must be possible from the event log alone.  Without an
 * explicit init event the replay engine would need to synthesise the initial
 * scene from external config files, breaking replay determinism.  By recording
 * the full initial snapshot in `layout.init`, every subsequent `layout.node.moved`
 * or `layout.updated` event is a pure delta on top of a known baseline.
 *
 * Required fields
 * ---------------
 * - `layout_id`  — identifies the layout instance being initialised
 * - `building_id` — ties the layout to a building entity for hierarchy
 * - `rooms`       — initial spatial descriptors for all room nodes
 *
 * Recommended fields
 * ------------------
 * - `agents`      — initial spatial descriptors for all known agents
 * - `fixtures`    — initial spatial descriptors for pre-placed fixtures
 * - `snapshot`    — full serialised scene graph at init time (enables cold replay)
 *
 * Cardinality
 * -----------
 * There SHOULD be exactly one `layout.init` event per `layout_id` per run.
 * If the layout is re-initialised (e.g. after a `layout.reset`), a second
 * `layout.init` MAY be emitted; consumers MUST treat the latest `layout.init`
 * as the new baseline.
 */
export interface LayoutInitPayload {
  /** Unique identifier of the layout instance being initialised. */
  layout_id: string;
  /**
   * Identifier of the building entity this layout belongs to.
   * Matches `BuildingDef.id` from room-config-schema.
   */
  building_id: string;
  /**
   * Array of initial room node descriptors.  Every room that will be visible
   * in the 3D scene MUST have an entry here so that the replay engine can
   * reconstruct the full initial scene without external config reads.
   */
  rooms: RoomInitNode[];
  /**
   * Array of initial agent node descriptors.  Agents known at boot time
   * SHOULD be included so the 3D scene renders agents in their starting
   * positions without waiting for `agent.moved` or `agent.assigned` events.
   */
  agents?: AgentInitNode[];
  /**
   * Array of pre-placed fixture descriptors.  Fixtures that exist in the
   * default scene configuration (e.g. room control panels, corridor doors)
   * SHOULD be listed here.  Runtime-placed fixtures are recorded via separate
   * `fixture.placed` events.
   */
  fixtures?: FixtureInitNode[];
  /**
   * How the spatial bootstrapping was triggered.
   * Defaults to `"config"` when omitted.
   */
  source?: LayoutInitSource;
  /** actor_id (agent or user) that triggered the initialisation. */
  initiated_by?: string;
  /**
   * Full serialised scene-graph snapshot at init time.
   * Enables cold-start replay: the replay engine can skip all prior events and
   * start from this snapshot, then apply subsequent delta events on top.
   */
  snapshot?: Record<string, unknown>;
  /**
   * Schema version of the `snapshot` field, if present.
   * Consumers MUST check this version before deserialising the snapshot.
   */
  snapshot_schema_version?: string;
}

/**
 * layout.created
 *
 * Fired when a new named layout instance is created for the first time.
 * A layout instance represents a complete spatial configuration of the 3D
 * world (rooms, desks, cameras, agent nodes).  All subsequent mutations are
 * recorded via layout.updated or layout.node.moved events.
 *
 * `initial_snapshot` SHOULD contain the full serialised layout as it was
 * initialised, enabling cold-start replay from a single event.
 */
export interface LayoutCreatedPayload {
  /** Unique identifier of the newly-created layout instance. */
  layout_id: string;
  /** Human-readable name for the layout (e.g. "main", "overview", "debug"). */
  name?: string;
  /** Optional description of the layout's purpose or scope. */
  description?: string;
  /** agent_id or user_id that created the layout. */
  created_by?: string;
  /** Full initial serialised layout; used as the seed for event-sourced replay. */
  initial_snapshot?: Record<string, unknown>;
}

/**
 * layout.deleted
 *
 * Fired when a layout instance is permanently removed.  After this event no
 * further layout.* events SHOULD reference the same layout_id unless a new
 * layout.created event re-introduces it.
 *
 * `prev_snapshot` SHOULD be populated so that the deletion is fully reversible
 * from the event log without external state (supports undo / audit).
 */
export interface LayoutDeletedPayload {
  /** Unique identifier of the layout instance being deleted. */
  layout_id: string;
  /**
   * Machine-readable reason for the deletion, e.g.
   * "user_requested" | "replaced_by_new" | "migration".
   */
  reason?: string;
  /** agent_id or user_id that initiated the deletion. */
  deleted_by?: string;
  /** Full serialised layout immediately before deletion; enables undo/audit. */
  prev_snapshot?: Record<string, unknown>;
}

/**
 * layout.update  (update INITIATED)
 *
 * Fired when a layout update operation is initiated but not yet committed.
 * This is the intent / in-progress companion to `layout.updated` (completion).
 *
 * Use-cases:
 *   - Optimistic UI updates: record intent before async write completes
 *   - Audit trail: capture who initiated what change and when
 *   - Rollback support: if the update fails, consumers can use this to undo
 *
 * Follows the request/completion convention:
 *   layout.update  →  "update started / in-progress"
 *   layout.updated →  "update committed / completed"
 *
 * Only `layout_id` is required. `fields_to_update` SHOULD be populated so
 * the completion event (`layout.updated`) can be correlated.
 */
export interface LayoutUpdatePayload {
  /** Identifies the layout instance being updated. */
  layout_id: string;
  /**
   * Dot-path keys of fields that are about to be updated, e.g.
   * ["camera.position", "rooms.lab.scale"].  Mirrors `changed_fields`
   * on the companion `layout.updated` event.
   */
  fields_to_update?: string[];
  /**
   * Machine-readable reason for the update, e.g.
   * "user_drag", "viewport_resize", "config_reload".
   */
  reason?: string;
  /** agent_id or user_id that initiated the update. */
  initiated_by?: string;
}

/**
 * layout.updated  (update COMPLETED)
 *
 * Fired when one or more layout properties are mutated without a single node
 * move being the sole cause (e.g. viewport changes, theme, camera presets,
 * bulk drag-and-drop reflows).
 *
 * `changed_fields` MUST be populated; consumers can diff prev/new snapshots
 * for replay or undo/redo support.
 */
export interface LayoutUpdatedPayload {
  /** Identifies which layout instance was mutated (e.g. "main", "overview"). */
  layout_id: string;
  /**
   * Dot-path keys of changed fields, e.g.
   * ["camera.position", "rooms.lab.scale", "viewport.fov"].
   */
  changed_fields: string[];
  /** Full layout snapshot captured immediately before the update. */
  prev_snapshot?: Record<string, unknown>;
  /** Full layout snapshot captured immediately after the update. */
  new_snapshot?: Record<string, unknown>;
}

/**
 * layout.node.moved
 *
 * Fired when a single named scene node changes position, rotation, or scale.
 * This event is the primary mechanism for tracking 3D spatial history and
 * enabling 3D replay of layout evolution.
 *
 * Both `from_*` and `to_*` fields MUST be included so that events are
 * self-contained and reversible without external state.
 */
export interface LayoutNodeMovedPayload {
  /** Identifies which layout instance owns this node. */
  layout_id: string;
  /** Unique identifier of the scene node being moved. */
  node_id: string;
  /** Semantic category of the node. */
  node_type: LayoutNodeType;
  /** World-space position before the move. */
  from_position: Vec3;
  /** World-space position after the move. */
  to_position: Vec3;
  /** Euler-angle rotation (radians) before the move. */
  from_rotation?: Vec3;
  /** Euler-angle rotation (radians) after the move. */
  to_rotation?: Vec3;
  /** Uniform scale vector before the move. */
  from_scale?: Vec3;
  /** Uniform scale vector after the move. */
  to_scale?: Vec3;
}

/**
 * layout.reset
 *
 * Fired when the layout is restored to its canonical default configuration.
 * A `prev_snapshot` SHOULD be included to allow undo and replay auditing.
 */
export interface LayoutResetPayload {
  layout_id: string;
  /**
   * Machine-readable reason for the reset, e.g.
   * "user_requested" | "version_mismatch" | "corruption_detected".
   */
  reason?: string;
  /** Snapshot of the layout immediately before the reset. */
  prev_snapshot?: Record<string, unknown>;
}

/**
 * layout.saved
 *
 * Fired after the current layout has been successfully written to persistent
 * storage.  The `snapshot` field is the canonical serialised representation
 * at the time of save; consumers can use it for cache invalidation.
 */
export interface LayoutSavedPayload {
  layout_id: string;
  /** .conitens/-relative path where the layout JSON was written. */
  save_path: string;
  /** Full serialised layout at time of save. */
  snapshot: Record<string, unknown>;
}

/**
 * layout.loaded
 *
 * Fired after a previously-saved layout has been successfully read from
 * storage and applied to the scene.
 */
export interface LayoutLoadedPayload {
  layout_id: string;
  /** .conitens/-relative path from which the layout JSON was read. */
  load_path: string;
  /** Full serialised layout as loaded from storage. */
  snapshot: Record<string, unknown>;
}

/**
 * layout.changed  (legacy)
 *
 * Generic layout mutation event retained for backward compatibility.
 * New code SHOULD emit layout.updated or layout.node.moved instead.
 */
export interface LayoutChangedPayload {
  layout_id: string;
  /**
   * Short label describing the type of change, e.g.
   * "room_added", "agent_icon_updated", "theme_changed".
   */
  change_type: string;
  /** Arbitrary additional context for the change. */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Discriminated payload map — maps event type → typed payload interface
// ---------------------------------------------------------------------------

/**
 * Maps each canonical layout EventType to its strongly-typed payload.
 *
 * Usage:
 * ```ts
 * function handleLayout<T extends LayoutEventType>(
 *   type: T, payload: LayoutEventPayloadMap[T]
 * ) { ... }
 * ```
 */
export interface LayoutEventPayloadMap {
  "layout.init":       LayoutInitPayload;
  "layout.created":    LayoutCreatedPayload;
  "layout.update":     LayoutUpdatePayload;
  "layout.updated":    LayoutUpdatedPayload;
  "layout.deleted":    LayoutDeletedPayload;
  "layout.node.moved": LayoutNodeMovedPayload;
  "layout.reset":      LayoutResetPayload;
  "layout.saved":      LayoutSavedPayload;
  "layout.loaded":     LayoutLoadedPayload;
  "layout.changed":    LayoutChangedPayload;
}

// ---------------------------------------------------------------------------
// Type guards — narrow `unknown` payloads to typed interfaces
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Internal helper: assert all three numeric components of a Vec3. */
function isVec3(v: unknown): v is Vec3 {
  if (!isObject(v)) return false;
  return (
    typeof v["x"] === "number" &&
    typeof v["y"] === "number" &&
    typeof v["z"] === "number"
  );
}

/** Set of valid LayoutNodeType strings for O(1) membership checks. */
const VALID_NODE_TYPES: ReadonlySet<string> = new Set<LayoutNodeType>([
  "room", "desk", "agent", "camera", "building", "prop",
]);

/**
 * Type guard for layout.init payloads (spatial bootstrapping).
 *
 * Validates required fields:
 *   - layout_id   (string)
 *   - building_id (string)
 *   - rooms       (non-empty array of objects, each with room_id string and position Vec3)
 *
 * Optional arrays (`agents`, `fixtures`) and the `snapshot` record are not
 * structurally validated here — consumers that need deep validation SHOULD
 * apply per-item guards.
 */
export function isLayoutInitPayload(p: unknown): p is LayoutInitPayload {
  if (!isObject(p)) return false;
  if (typeof p["layout_id"] !== "string") return false;
  if (typeof p["building_id"] !== "string") return false;
  // rooms must be a non-empty array whose items are objects with room_id+position
  if (!Array.isArray(p["rooms"]) || (p["rooms"] as unknown[]).length === 0) return false;
  for (const room of p["rooms"] as unknown[]) {
    if (!isObject(room)) return false;
    if (typeof room["room_id"] !== "string") return false;
    if (!isVec3(room["position"])) return false;
  }
  return true;
}

/**
 * Type guard for layout.created payloads.
 *
 * Only `layout_id` is required; all other fields are optional and not
 * structurally validated beyond basic type checks.
 */
export function isLayoutCreatedPayload(p: unknown): p is LayoutCreatedPayload {
  if (!isObject(p)) return false;
  return typeof p["layout_id"] === "string";
}

/**
 * Type guard for layout.deleted payloads.
 *
 * Only `layout_id` is required; reason, deleted_by, and prev_snapshot are
 * optional and not structurally validated beyond basic type checks.
 */
export function isLayoutDeletedPayload(p: unknown): p is LayoutDeletedPayload {
  if (!isObject(p)) return false;
  return typeof p["layout_id"] === "string";
}

/**
 * Type guard for layout.update payloads (update INITIATED).
 *
 * Only `layout_id` is required; all other fields are optional.
 */
export function isLayoutUpdatePayload(p: unknown): p is LayoutUpdatePayload {
  if (!isObject(p)) return false;
  return typeof p["layout_id"] === "string";
}

/**
 * Type guard for layout.updated payloads (update COMPLETED).
 *
 * Validates that `layout_id` is a string and `changed_fields` is a
 * non-empty array of strings.
 */
export function isLayoutUpdatedPayload(p: unknown): p is LayoutUpdatedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["layout_id"] === "string" &&
    Array.isArray(p["changed_fields"]) &&
    (p["changed_fields"] as unknown[]).every(f => typeof f === "string")
  );
}

/**
 * Type guard for layout.node.moved payloads.
 *
 * Validates required fields: layout_id, node_id, node_type, from_position,
 * to_position — all optional rotation/scale fields are not validated here
 * (they are structurally validated only when present).
 */
export function isLayoutNodeMovedPayload(p: unknown): p is LayoutNodeMovedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["layout_id"] === "string" &&
    typeof p["node_id"] === "string" &&
    typeof p["node_type"] === "string" &&
    VALID_NODE_TYPES.has(p["node_type"] as string) &&
    isVec3(p["from_position"]) &&
    isVec3(p["to_position"])
  );
}

/**
 * Type guard for layout.reset payloads.
 *
 * Only layout_id is required; reason and prev_snapshot are optional.
 */
export function isLayoutResetPayload(p: unknown): p is LayoutResetPayload {
  if (!isObject(p)) return false;
  return typeof p["layout_id"] === "string";
}

/**
 * Type guard for layout.saved payloads.
 *
 * Validates layout_id, save_path, and that snapshot is an object.
 */
export function isLayoutSavedPayload(p: unknown): p is LayoutSavedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["layout_id"] === "string" &&
    typeof p["save_path"] === "string" &&
    isObject(p["snapshot"])
  );
}

/**
 * Type guard for layout.loaded payloads.
 *
 * Validates layout_id, load_path, and that snapshot is an object.
 */
export function isLayoutLoadedPayload(p: unknown): p is LayoutLoadedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["layout_id"] === "string" &&
    typeof p["load_path"] === "string" &&
    isObject(p["snapshot"])
  );
}

/**
 * Type guard for layout.changed payloads (legacy).
 *
 * Validates layout_id and change_type strings.
 */
export function isLayoutChangedPayload(p: unknown): p is LayoutChangedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["layout_id"] === "string" &&
    typeof p["change_type"] === "string"
  );
}

// ---------------------------------------------------------------------------
// Payload discriminator — map a LayoutEventType to its type guard
// ---------------------------------------------------------------------------

/** All layout payload type-guard functions keyed by event type. */
export const LAYOUT_PAYLOAD_GUARDS: {
  [K in LayoutEventType]: (p: unknown) => p is LayoutEventPayloadMap[K];
} = {
  "layout.init":       isLayoutInitPayload,
  "layout.created":    isLayoutCreatedPayload,
  "layout.update":     isLayoutUpdatePayload,
  "layout.updated":    isLayoutUpdatedPayload,
  "layout.deleted":    isLayoutDeletedPayload,
  "layout.node.moved": isLayoutNodeMovedPayload,
  "layout.reset":      isLayoutResetPayload,
  "layout.saved":      isLayoutSavedPayload,
  "layout.loaded":     isLayoutLoadedPayload,
  "layout.changed":    isLayoutChangedPayload,
};

/**
 * Validates a payload against the expected shape for a given layout event type.
 *
 * Returns `true` and narrows `payload` if the validation passes.
 *
 * @example
 * ```ts
 * if (isValidLayoutPayload("layout.node.moved", event.payload)) {
 *   // payload is LayoutNodeMovedPayload
 *   console.log(event.payload.node_id);
 * }
 * ```
 */
export function isValidLayoutPayload<T extends LayoutEventType>(
  type: T,
  payload: unknown,
): payload is LayoutEventPayloadMap[T] {
  return LAYOUT_PAYLOAD_GUARDS[type](payload);
}
