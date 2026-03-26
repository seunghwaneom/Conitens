/**
 * room-interaction-intents.ts — Typed interaction intent system for the
 * Room layer.
 *
 * Sub-AC 4b: Click, hover, and context-menu event handlers on the Room
 * layer emit typed `interaction_intents` with room-scoped payloads.
 * Events are explicitly stopped at the Room layer to prevent unintentional
 * bubbling to the Building layer.
 *
 * Design
 * ──────
 * Mirrors the building-interaction-intents.ts pattern established in
 * Sub-AC 4a.  Room intents carry room-scoped identifiers (`room_id`,
 * `room_type`, `floor`) rather than building-level context.
 *
 * Propagation contract
 * ────────────────────
 * Every handler produced from this module calls `e.stopPropagation()`
 * before emitting an intent.  This prevents Three.js / React Three Fiber
 * pointer events from travelling up the scene graph to the BuildingShell
 * group and triggering BUILDING_* intents inadvertently.
 *
 * Intent hierarchy
 * ────────────────
 *   ROOM_CLICKED       — left-click or tap on a room volume
 *   ROOM_HOVERED       — pointer entered a room volume
 *   ROOM_UNHOVERED     — pointer left a room volume
 *   ROOM_CONTEXT_MENU  — right-click / long-press on a room volume
 *
 * Payload conventions
 * ───────────────────
 * • `room_id`         — stable ID from RoomMetadataEntry.roomId
 * • `room_type`       — "control" | "office" | "lab" | "lobby" | "archive" | "corridor"
 * • `floor`           — 0-based floor index
 * • `drill_level`     — current drill-down level at time of interaction
 * • `world_position`  — Three.js ray-cast intersection in world space (Y-up)
 * • `screen_position` — pointer coordinates in CSS pixels (context-menu only)
 * • `ts`              — Unix ms timestamp (monotonic wall-clock)
 * • `session_id`      — optional operator session for grouping / analytics
 */

// ---------------------------------------------------------------------------
// Intent discriminators
// ---------------------------------------------------------------------------

export type RoomInteractionIntentKind =
  | "ROOM_CLICKED"
  | "ROOM_HOVERED"
  | "ROOM_UNHOVERED"
  | "ROOM_CONTEXT_MENU";

/** O(1) set for fast membership checks. */
export const ROOM_INTENT_KINDS: ReadonlySet<string> =
  new Set<RoomInteractionIntentKind>([
    "ROOM_CLICKED",
    "ROOM_HOVERED",
    "ROOM_UNHOVERED",
    "ROOM_CONTEXT_MENU",
  ]);

/** Type guard — narrows an unknown string to a RoomInteractionIntentKind. */
export function isRoomInteractionIntentKind(
  s: string,
): s is RoomInteractionIntentKind {
  return ROOM_INTENT_KINDS.has(s);
}

// ---------------------------------------------------------------------------
// Shared payload primitives
// ---------------------------------------------------------------------------

/** World-space coordinate in the Three.js Y-up right-handed system. */
export interface RoomWorldPosition {
  x: number;
  y: number;
  z: number;
}

/** Pointer position in CSS pixels relative to the canvas top-left origin. */
export interface RoomScreenPosition {
  x: number;
  y: number;
}

/**
 * Room type discriminator matching the canonical RoomType from building.ts.
 * Reproduced here so the intents module is self-contained without a circular
 * import through the Three.js / React component tree.
 */
export type RoomTypeKind =
  | "control"
  | "office"
  | "lab"
  | "lobby"
  | "archive"
  | "corridor";

// ---------------------------------------------------------------------------
// Per-intent payload interfaces
// ---------------------------------------------------------------------------

/**
 * ROOM_CLICKED
 *
 * Emitted when the operator performs a primary click (left-click or tap) on
 * a room volume at the "floor" or "room" drill level.  Carries enough context
 * for the effect handler to decide whether to drill in, select the room, or
 * open a context panel.
 *
 * `agent_count` records the number of active agents in the room at click
 * time so replay agents can verify room population state.
 */
export interface RoomClickedPayload {
  /** Stable room identifier from RoomMetadataEntry.roomId. */
  room_id: string;
  /** Room type at the time of the click (for visual / action branching). */
  room_type: RoomTypeKind;
  /** 0-based floor index the room belongs to. */
  floor: number;
  /**
   * Drill level at the time of the click.
   * "building" = overview; "floor" = viewing this floor; "room" = inside room.
   */
  drill_level: "building" | "floor" | "room" | "agent";
  /**
   * Three.js ray-cast intersection point on the room geometry in world-space
   * coordinates.  Null when the click was synthesised.
   */
  world_position: RoomWorldPosition | null;
  /**
   * Number of active agents in the room at the time of the click.
   * Useful for replay verification and conditional drill-in behaviour.
   */
  agent_count: number;
  /** Unix ms timestamp at which the click occurred. */
  ts: number;
  /** Operator session identifier for grouping interaction events. */
  session_id?: string;
}

/**
 * ROOM_HOVERED
 *
 * Emitted when the pointer enters a room volume geometry (Three.js
 * onPointerOver).  Used to trigger highlighting and cursor changes.
 */
export interface RoomHoveredPayload {
  /** Stable room identifier. */
  room_id: string;
  /** Room type (for conditional hover effects per room type). */
  room_type: RoomTypeKind;
  /** 0-based floor index. */
  floor: number;
  /** Ray-cast intersection point in world space. */
  world_position: RoomWorldPosition | null;
  /** Unix ms timestamp. */
  ts: number;
  /** Operator session identifier. */
  session_id?: string;
}

/**
 * ROOM_UNHOVERED
 *
 * Emitted when the pointer leaves a room volume geometry (Three.js
 * onPointerOut).  Always paired with a preceding ROOM_HOVERED; safe to
 * emit even if the room was not in a hovered state (idempotent).
 */
export interface RoomUnhoveredPayload {
  /** Stable room identifier. */
  room_id: string;
  /** Room type. */
  room_type: RoomTypeKind;
  /** 0-based floor index. */
  floor: number;
  /** Unix ms timestamp. */
  ts: number;
  /** Operator session identifier. */
  session_id?: string;
}

/**
 * ROOM_CONTEXT_MENU
 *
 * Emitted on a right-click or equivalent long-press on a room volume.
 * Carries both world-space and screen-space positions so the context menu
 * component can position itself at the pointer location.
 *
 * The context menu itself is not part of this intent — it is the
 * responsibility of the receiving component to render the menu based on
 * the current drill level and room state.
 */
export interface RoomContextMenuPayload {
  /** Stable room identifier. */
  room_id: string;
  /** Room type (determines available context menu actions). */
  room_type: RoomTypeKind;
  /** 0-based floor index. */
  floor: number;
  /** Ray-cast intersection point in world space (for spatial context). */
  world_position: RoomWorldPosition | null;
  /** CSS-pixel position for anchoring the context menu popup. */
  screen_position: RoomScreenPosition;
  /**
   * Drill level at the time of the right-click.
   * Determines which menu items are available.
   */
  drill_level: "building" | "floor" | "room" | "agent";
  /** Unix ms timestamp. */
  ts: number;
  /** Operator session identifier. */
  session_id?: string;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type RoomClickedIntent = {
  intent: "ROOM_CLICKED";
} & RoomClickedPayload;

export type RoomHoveredIntent = {
  intent: "ROOM_HOVERED";
} & RoomHoveredPayload;

export type RoomUnhoveredIntent = {
  intent: "ROOM_UNHOVERED";
} & RoomUnhoveredPayload;

export type RoomContextMenuIntent = {
  intent: "ROOM_CONTEXT_MENU";
} & RoomContextMenuPayload;

/**
 * Discriminated union of all room-layer interaction intents.
 * Narrow by `intent` field with a switch statement.
 *
 * @example
 * ```ts
 * function handleRoomIntent(intent: RoomInteractionIntent) {
 *   switch (intent.intent) {
 *     case "ROOM_CLICKED":      handleClick(intent);       break;
 *     case "ROOM_HOVERED":      handleHover(intent);       break;
 *     case "ROOM_UNHOVERED":    handleUnhover(intent);     break;
 *     case "ROOM_CONTEXT_MENU": handleContextMenu(intent); break;
 *   }
 * }
 * ```
 */
export type RoomInteractionIntent =
  | RoomClickedIntent
  | RoomHoveredIntent
  | RoomUnhoveredIntent
  | RoomContextMenuIntent;

// ---------------------------------------------------------------------------
// Discriminated payload map (intent kind → payload type)
// ---------------------------------------------------------------------------

export interface RoomIntentPayloadMap {
  ROOM_CLICKED:      RoomClickedPayload;
  ROOM_HOVERED:      RoomHoveredPayload;
  ROOM_UNHOVERED:    RoomUnhoveredPayload;
  ROOM_CONTEXT_MENU: RoomContextMenuPayload;
}

// ---------------------------------------------------------------------------
// Factories — create validated intent objects from raw inputs
// ---------------------------------------------------------------------------

/** Create a ROOM_CLICKED intent. */
export function makeRoomClickedIntent(
  params: RoomClickedPayload,
): RoomClickedIntent {
  return { intent: "ROOM_CLICKED", ...params };
}

/** Create a ROOM_HOVERED intent. */
export function makeRoomHoveredIntent(
  params: RoomHoveredPayload,
): RoomHoveredIntent {
  return { intent: "ROOM_HOVERED", ...params };
}

/** Create a ROOM_UNHOVERED intent. */
export function makeRoomUnhoveredIntent(
  params: RoomUnhoveredPayload,
): RoomUnhoveredIntent {
  return { intent: "ROOM_UNHOVERED", ...params };
}

/** Create a ROOM_CONTEXT_MENU intent. */
export function makeRoomContextMenuIntent(
  params: RoomContextMenuPayload,
): RoomContextMenuIntent {
  return { intent: "ROOM_CONTEXT_MENU", ...params };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Guard for ROOM_CLICKED intents. */
export function isRoomClickedIntent(v: unknown): v is RoomClickedIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "ROOM_CLICKED" &&
    typeof v["room_id"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for ROOM_HOVERED intents. */
export function isRoomHoveredIntent(v: unknown): v is RoomHoveredIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "ROOM_HOVERED" &&
    typeof v["room_id"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for ROOM_UNHOVERED intents. */
export function isRoomUnhoveredIntent(v: unknown): v is RoomUnhoveredIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "ROOM_UNHOVERED" &&
    typeof v["room_id"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for ROOM_CONTEXT_MENU intents. */
export function isRoomContextMenuIntent(
  v: unknown,
): v is RoomContextMenuIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "ROOM_CONTEXT_MENU" &&
    typeof v["room_id"] === "string" &&
    typeof v["ts"] === "number" &&
    isObj(v["screen_position"])
  );
}

/** Guard for any RoomInteractionIntent variant. */
export function isRoomInteractionIntent(
  v: unknown,
): v is RoomInteractionIntent {
  return (
    isRoomClickedIntent(v) ||
    isRoomHoveredIntent(v) ||
    isRoomUnhoveredIntent(v) ||
    isRoomContextMenuIntent(v)
  );
}

// ---------------------------------------------------------------------------
// Payload guards map (intent kind → guard function)
// ---------------------------------------------------------------------------

export const ROOM_INTENT_GUARDS: {
  [K in RoomInteractionIntentKind]: (
    v: unknown,
  ) => v is { intent: K } & RoomIntentPayloadMap[K];
} = {
  ROOM_CLICKED:      isRoomClickedIntent,
  ROOM_HOVERED:      isRoomHoveredIntent,
  ROOM_UNHOVERED:    isRoomUnhoveredIntent,
  ROOM_CONTEXT_MENU: isRoomContextMenuIntent,
};
