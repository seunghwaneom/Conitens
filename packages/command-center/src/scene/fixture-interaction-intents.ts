/**
 * fixture-interaction-intents.ts — Typed interaction intent system for
 * spatial UI fixture components (button, handle, menu_anchor).
 *
 * Sub-AC 7a: Spatial UI fixture attachment system — ui_fixture components
 * that attach to 3D entity positions in world-space for agents, tasks, and
 * rooms.  Fixtures track their parent entity's transform and emit raw
 * interaction_intents (with entity reference and action type) on pointer/click
 * manipulation.
 *
 * Design
 * ──────
 * Mirrors the building/room/agent interaction-intents.ts pattern (Sub-ACs
 * 4a–4c). Fixture intents carry:
 *
 *   • `fixtureId`    — stable fixture component ID
 *   • `fixtureKind`  — "button" | "handle" | "menu_anchor"
 *   • `entityRef`    — { entityType, entityId } — the parent entity this
 *                       fixture is attached to (agent / task / room)
 *   • `actionType`   — semantic action discriminator
 *   • `worldPosition`— 3-D world-space position where the event occurred
 *   • `ts`           — Unix ms wall-clock timestamp
 *   • `session_id`   — optional operator session for grouping
 *
 * Intent hierarchy
 * ────────────────
 *   FIXTURE_BUTTON_CLICKED       — primary-click on a FixtureButton
 *   FIXTURE_BUTTON_HOVERED       — pointer entered a FixtureButton
 *   FIXTURE_BUTTON_UNHOVERED     — pointer left a FixtureButton
 *   FIXTURE_HANDLE_DRAG_START    — pointer-down started a handle drag
 *   FIXTURE_HANDLE_DRAG_MOVE     — pointer-move during a handle drag
 *   FIXTURE_HANDLE_DRAG_END      — pointer-up finished a handle drag
 *   FIXTURE_MENU_ANCHOR_OPENED   — FixtureMenuAnchor toggled open
 *   FIXTURE_MENU_ANCHOR_CLOSED   — FixtureMenuAnchor toggled closed
 *
 * Propagation contract
 * ────────────────────
 * Every handler calls e.stopPropagation() before emitting — identical to the
 * agent/room/building layers — so fixture events do NOT bubble through to the
 * parent room or building groups.
 *
 * Reflexive closure
 * ─────────────────
 * The fixture intent for the ontology-schema fixture itself can be represented
 * here: entityRef = { entityType: "room", entityId: "meta-room" }.
 */

// ---------------------------------------------------------------------------
// Primitive supporting types
// ---------------------------------------------------------------------------

/** The three spatial fixture component kinds. */
export type SpatialFixtureKind = "button" | "handle" | "menu_anchor";

/** All registered spatial fixture kinds. */
export const SPATIAL_FIXTURE_KINDS: readonly SpatialFixtureKind[] = [
  "button",
  "handle",
  "menu_anchor",
] as const;

/** O(1) membership set. */
export const SPATIAL_FIXTURE_KIND_SET: ReadonlySet<string> =
  new Set(SPATIAL_FIXTURE_KINDS);

/** Type guard: narrows an unknown string to SpatialFixtureKind. */
export function isSpatialFixtureKind(s: string): s is SpatialFixtureKind {
  return SPATIAL_FIXTURE_KIND_SET.has(s);
}

// ---------------------------------------------------------------------------
// Entity reference
// ---------------------------------------------------------------------------

/** Entity types that a spatial fixture can be attached to. */
export type FixtureEntityType = "agent" | "task" | "room";

/**
 * Reference to the parent entity that owns this fixture.
 * Carried in every fixture interaction intent so that consumers
 * can act on the correct entity without an additional store lookup.
 */
export interface FixtureEntityRef {
  /** The domain type of the parent entity. */
  entityType: FixtureEntityType;
  /** The stable ID of the parent entity (agentId, taskId, or roomId). */
  entityId: string;
}

// ---------------------------------------------------------------------------
// Shared spatial primitives
// ---------------------------------------------------------------------------

/** World-space coordinate in the Three.js Y-up right-handed system. */
export interface FixtureWorldPosition {
  x: number;
  y: number;
  z: number;
}

/** Pointer position in CSS pixels relative to the canvas top-left origin. */
export interface FixtureScreenPosition {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Intent discriminators
// ---------------------------------------------------------------------------

export type FixtureInteractionIntentKind =
  | "FIXTURE_BUTTON_CLICKED"
  | "FIXTURE_BUTTON_HOVERED"
  | "FIXTURE_BUTTON_UNHOVERED"
  | "FIXTURE_HANDLE_DRAG_START"
  | "FIXTURE_HANDLE_DRAG_MOVE"
  | "FIXTURE_HANDLE_DRAG_END"
  | "FIXTURE_MENU_ANCHOR_OPENED"
  | "FIXTURE_MENU_ANCHOR_CLOSED";

/** O(1) set for fast membership checks. */
export const FIXTURE_INTENT_KINDS: ReadonlySet<string> =
  new Set<FixtureInteractionIntentKind>([
    "FIXTURE_BUTTON_CLICKED",
    "FIXTURE_BUTTON_HOVERED",
    "FIXTURE_BUTTON_UNHOVERED",
    "FIXTURE_HANDLE_DRAG_START",
    "FIXTURE_HANDLE_DRAG_MOVE",
    "FIXTURE_HANDLE_DRAG_END",
    "FIXTURE_MENU_ANCHOR_OPENED",
    "FIXTURE_MENU_ANCHOR_CLOSED",
  ]);

/** Type guard: narrows an unknown string to FixtureInteractionIntentKind. */
export function isFixtureInteractionIntentKind(
  s: string,
): s is FixtureInteractionIntentKind {
  return FIXTURE_INTENT_KINDS.has(s);
}

// ---------------------------------------------------------------------------
// Per-intent payload interfaces
// ---------------------------------------------------------------------------

/**
 * FIXTURE_BUTTON_CLICKED
 *
 * Emitted when the operator performs a primary click (left-click or tap) on
 * a FixtureButton attached to an agent, task, or room.  The `actionType` is
 * always "click" — consumers can dispatch commands based on `entityRef`.
 */
export interface FixtureButtonClickedPayload {
  /** Stable fixture component ID (e.g. "agent-pause-btn", "task-cancel-btn"). */
  fixtureId: string;
  /** Always "button" for this intent. */
  fixtureKind: "button";
  /** Reference to the parent entity this fixture is attached to. */
  entityRef: FixtureEntityRef;
  /** Semantic action discriminator for this intent. */
  actionType: "click";
  /** World-space intersection point where the click was detected. */
  worldPosition: FixtureWorldPosition | null;
  /** CSS-pixel pointer position at click time. */
  screenPosition?: FixtureScreenPosition;
  /** Unix ms timestamp. */
  ts: number;
  /** Operator session identifier. */
  session_id?: string;
}

/**
 * FIXTURE_BUTTON_HOVERED
 *
 * Emitted when the pointer enters the button's bounding region.
 * Used to trigger glow highlight and tooltip reveal.
 */
export interface FixtureButtonHoveredPayload {
  fixtureId: string;
  fixtureKind: "button";
  entityRef: FixtureEntityRef;
  actionType: "hover_enter";
  worldPosition: FixtureWorldPosition | null;
  screenPosition?: FixtureScreenPosition;
  ts: number;
  session_id?: string;
}

/**
 * FIXTURE_BUTTON_UNHOVERED
 *
 * Emitted when the pointer exits the button's bounding region.
 * Always paired with a preceding FIXTURE_BUTTON_HOVERED; safe to emit
 * without a matching hover (idempotent).
 */
export interface FixtureButtonUnhoveredPayload {
  fixtureId: string;
  fixtureKind: "button";
  entityRef: FixtureEntityRef;
  actionType: "hover_exit";
  worldPosition: FixtureWorldPosition | null;
  screenPosition?: FixtureScreenPosition;
  ts: number;
  session_id?: string;
}

/**
 * FIXTURE_HANDLE_DRAG_START
 *
 * Emitted when a pointer-down event begins a drag on a FixtureHandle.
 * The `dragOriginWorld` records the world-space starting position for
 * replay fidelity.
 */
export interface FixtureHandleDragStartPayload {
  fixtureId: string;
  fixtureKind: "handle";
  entityRef: FixtureEntityRef;
  actionType: "drag_start";
  /** World-space position where the drag originated. */
  dragOriginWorld: FixtureWorldPosition | null;
  screenPosition?: FixtureScreenPosition;
  ts: number;
  session_id?: string;
}

/**
 * FIXTURE_HANDLE_DRAG_MOVE
 *
 * Emitted during an active drag on a FixtureHandle.  Throttled to at most
 * once per animation frame by the component; consumers should treat this
 * as a streaming positional update.
 */
export interface FixtureHandleDragMovePayload {
  fixtureId: string;
  fixtureKind: "handle";
  entityRef: FixtureEntityRef;
  actionType: "drag_move";
  /** Current world-space drag target position. */
  dragCurrentWorld: FixtureWorldPosition | null;
  /** Delta from drag origin in world space. */
  dragDeltaWorld: FixtureWorldPosition | null;
  screenPosition?: FixtureScreenPosition;
  ts: number;
  session_id?: string;
}

/**
 * FIXTURE_HANDLE_DRAG_END
 *
 * Emitted when pointer-up finalises a handle drag.  Carries both the origin
 * and terminal positions for the command pipeline to compute the resulting
 * entity relocation delta.
 */
export interface FixtureHandleDragEndPayload {
  fixtureId: string;
  fixtureKind: "handle";
  entityRef: FixtureEntityRef;
  actionType: "drag_end";
  /** World-space starting position (from drag_start). */
  dragOriginWorld: FixtureWorldPosition | null;
  /** World-space terminal position (at pointer-up). */
  dragEndWorld: FixtureWorldPosition | null;
  screenPosition?: FixtureScreenPosition;
  ts: number;
  session_id?: string;
}

/**
 * FIXTURE_MENU_ANCHOR_OPENED
 *
 * Emitted when the operator clicks or taps a FixtureMenuAnchor to open its
 * associated context menu.  Carries the `screen_position` so the menu
 * component can anchor itself at the pointer location.
 */
export interface FixtureMenuAnchorOpenedPayload {
  fixtureId: string;
  fixtureKind: "menu_anchor";
  entityRef: FixtureEntityRef;
  actionType: "menu_open";
  worldPosition: FixtureWorldPosition | null;
  /** CSS-pixel position for the menu popup anchor. */
  screen_position: FixtureScreenPosition;
  ts: number;
  session_id?: string;
}

/**
 * FIXTURE_MENU_ANCHOR_CLOSED
 *
 * Emitted when the menu associated with the anchor is dismissed (via any
 * mechanism: second click, ESC, or blur).
 */
export interface FixtureMenuAnchorClosedPayload {
  fixtureId: string;
  fixtureKind: "menu_anchor";
  entityRef: FixtureEntityRef;
  actionType: "menu_close";
  worldPosition: FixtureWorldPosition | null;
  ts: number;
  session_id?: string;
}

// ---------------------------------------------------------------------------
// Discriminated intent types
// ---------------------------------------------------------------------------

export type FixtureButtonClickedIntent = {
  intent: "FIXTURE_BUTTON_CLICKED";
} & FixtureButtonClickedPayload;

export type FixtureButtonHoveredIntent = {
  intent: "FIXTURE_BUTTON_HOVERED";
} & FixtureButtonHoveredPayload;

export type FixtureButtonUnhoveredIntent = {
  intent: "FIXTURE_BUTTON_UNHOVERED";
} & FixtureButtonUnhoveredPayload;

export type FixtureHandleDragStartIntent = {
  intent: "FIXTURE_HANDLE_DRAG_START";
} & FixtureHandleDragStartPayload;

export type FixtureHandleDragMoveIntent = {
  intent: "FIXTURE_HANDLE_DRAG_MOVE";
} & FixtureHandleDragMovePayload;

export type FixtureHandleDragEndIntent = {
  intent: "FIXTURE_HANDLE_DRAG_END";
} & FixtureHandleDragEndPayload;

export type FixtureMenuAnchorOpenedIntent = {
  intent: "FIXTURE_MENU_ANCHOR_OPENED";
} & FixtureMenuAnchorOpenedPayload;

export type FixtureMenuAnchorClosedIntent = {
  intent: "FIXTURE_MENU_ANCHOR_CLOSED";
} & FixtureMenuAnchorClosedPayload;

/**
 * Discriminated union of all spatial fixture interaction intents.
 * Narrow by `intent` field with a switch statement.
 *
 * @example
 * ```ts
 * function handleFixtureIntent(intent: FixtureInteractionIntent) {
 *   switch (intent.intent) {
 *     case "FIXTURE_BUTTON_CLICKED":    dispatch(intent.entityRef, "click");    break;
 *     case "FIXTURE_HANDLE_DRAG_END":   dispatch(intent.entityRef, "move");     break;
 *     case "FIXTURE_MENU_ANCHOR_OPENED": openMenu(intent.screen_position);      break;
 *   }
 * }
 * ```
 */
export type FixtureInteractionIntent =
  | FixtureButtonClickedIntent
  | FixtureButtonHoveredIntent
  | FixtureButtonUnhoveredIntent
  | FixtureHandleDragStartIntent
  | FixtureHandleDragMoveIntent
  | FixtureHandleDragEndIntent
  | FixtureMenuAnchorOpenedIntent
  | FixtureMenuAnchorClosedIntent;

// ---------------------------------------------------------------------------
// Payload map (intent kind → payload type)
// ---------------------------------------------------------------------------

export interface FixtureIntentPayloadMap {
  FIXTURE_BUTTON_CLICKED:    FixtureButtonClickedPayload;
  FIXTURE_BUTTON_HOVERED:    FixtureButtonHoveredPayload;
  FIXTURE_BUTTON_UNHOVERED:  FixtureButtonUnhoveredPayload;
  FIXTURE_HANDLE_DRAG_START: FixtureHandleDragStartPayload;
  FIXTURE_HANDLE_DRAG_MOVE:  FixtureHandleDragMovePayload;
  FIXTURE_HANDLE_DRAG_END:   FixtureHandleDragEndPayload;
  FIXTURE_MENU_ANCHOR_OPENED: FixtureMenuAnchorOpenedPayload;
  FIXTURE_MENU_ANCHOR_CLOSED: FixtureMenuAnchorClosedPayload;
}

// ---------------------------------------------------------------------------
// Factories — create validated intent objects from raw inputs
// ---------------------------------------------------------------------------

/** Create a FIXTURE_BUTTON_CLICKED intent. */
export function makeFixtureButtonClickedIntent(
  params: FixtureButtonClickedPayload,
): FixtureButtonClickedIntent {
  return { intent: "FIXTURE_BUTTON_CLICKED", ...params };
}

/** Create a FIXTURE_BUTTON_HOVERED intent. */
export function makeFixtureButtonHoveredIntent(
  params: FixtureButtonHoveredPayload,
): FixtureButtonHoveredIntent {
  return { intent: "FIXTURE_BUTTON_HOVERED", ...params };
}

/** Create a FIXTURE_BUTTON_UNHOVERED intent. */
export function makeFixtureButtonUnhoveredIntent(
  params: FixtureButtonUnhoveredPayload,
): FixtureButtonUnhoveredIntent {
  return { intent: "FIXTURE_BUTTON_UNHOVERED", ...params };
}

/** Create a FIXTURE_HANDLE_DRAG_START intent. */
export function makeFixtureHandleDragStartIntent(
  params: FixtureHandleDragStartPayload,
): FixtureHandleDragStartIntent {
  return { intent: "FIXTURE_HANDLE_DRAG_START", ...params };
}

/** Create a FIXTURE_HANDLE_DRAG_MOVE intent. */
export function makeFixtureHandleDragMoveIntent(
  params: FixtureHandleDragMovePayload,
): FixtureHandleDragMoveIntent {
  return { intent: "FIXTURE_HANDLE_DRAG_MOVE", ...params };
}

/** Create a FIXTURE_HANDLE_DRAG_END intent. */
export function makeFixtureHandleDragEndIntent(
  params: FixtureHandleDragEndPayload,
): FixtureHandleDragEndIntent {
  return { intent: "FIXTURE_HANDLE_DRAG_END", ...params };
}

/** Create a FIXTURE_MENU_ANCHOR_OPENED intent. */
export function makeFixtureMenuAnchorOpenedIntent(
  params: FixtureMenuAnchorOpenedPayload,
): FixtureMenuAnchorOpenedIntent {
  return { intent: "FIXTURE_MENU_ANCHOR_OPENED", ...params };
}

/** Create a FIXTURE_MENU_ANCHOR_CLOSED intent. */
export function makeFixtureMenuAnchorClosedIntent(
  params: FixtureMenuAnchorClosedPayload,
): FixtureMenuAnchorClosedIntent {
  return { intent: "FIXTURE_MENU_ANCHOR_CLOSED", ...params };
}

// ---------------------------------------------------------------------------
// Type guards — internal helpers
// ---------------------------------------------------------------------------

/** Assert a plain, non-null, non-array object. */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate that a value looks like a FixtureEntityRef. */
function isEntityRef(v: unknown): v is FixtureEntityRef {
  if (!isObj(v)) return false;
  return (
    typeof v["entityType"] === "string" &&
    typeof v["entityId"] === "string"
  );
}

// ---------------------------------------------------------------------------
// Per-intent type guards (exported for unit testing and store narrowing)
// ---------------------------------------------------------------------------

export function isFixtureButtonClickedIntent(
  v: unknown,
): v is FixtureButtonClickedIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "FIXTURE_BUTTON_CLICKED" &&
    typeof v["fixtureId"] === "string" &&
    v["fixtureKind"] === "button" &&
    isEntityRef(v["entityRef"]) &&
    v["actionType"] === "click" &&
    typeof v["ts"] === "number"
  );
}

export function isFixtureButtonHoveredIntent(
  v: unknown,
): v is FixtureButtonHoveredIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "FIXTURE_BUTTON_HOVERED" &&
    typeof v["fixtureId"] === "string" &&
    v["fixtureKind"] === "button" &&
    isEntityRef(v["entityRef"]) &&
    v["actionType"] === "hover_enter" &&
    typeof v["ts"] === "number"
  );
}

export function isFixtureButtonUnhoveredIntent(
  v: unknown,
): v is FixtureButtonUnhoveredIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "FIXTURE_BUTTON_UNHOVERED" &&
    typeof v["fixtureId"] === "string" &&
    v["fixtureKind"] === "button" &&
    isEntityRef(v["entityRef"]) &&
    v["actionType"] === "hover_exit" &&
    typeof v["ts"] === "number"
  );
}

export function isFixtureHandleDragStartIntent(
  v: unknown,
): v is FixtureHandleDragStartIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "FIXTURE_HANDLE_DRAG_START" &&
    typeof v["fixtureId"] === "string" &&
    v["fixtureKind"] === "handle" &&
    isEntityRef(v["entityRef"]) &&
    v["actionType"] === "drag_start" &&
    typeof v["ts"] === "number"
  );
}

export function isFixtureHandleDragMoveIntent(
  v: unknown,
): v is FixtureHandleDragMoveIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "FIXTURE_HANDLE_DRAG_MOVE" &&
    typeof v["fixtureId"] === "string" &&
    v["fixtureKind"] === "handle" &&
    isEntityRef(v["entityRef"]) &&
    v["actionType"] === "drag_move" &&
    typeof v["ts"] === "number"
  );
}

export function isFixtureHandleDragEndIntent(
  v: unknown,
): v is FixtureHandleDragEndIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "FIXTURE_HANDLE_DRAG_END" &&
    typeof v["fixtureId"] === "string" &&
    v["fixtureKind"] === "handle" &&
    isEntityRef(v["entityRef"]) &&
    v["actionType"] === "drag_end" &&
    typeof v["ts"] === "number"
  );
}

export function isFixtureMenuAnchorOpenedIntent(
  v: unknown,
): v is FixtureMenuAnchorOpenedIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "FIXTURE_MENU_ANCHOR_OPENED" &&
    typeof v["fixtureId"] === "string" &&
    v["fixtureKind"] === "menu_anchor" &&
    isEntityRef(v["entityRef"]) &&
    v["actionType"] === "menu_open" &&
    typeof v["ts"] === "number" &&
    isObj(v["screen_position"])
  );
}

export function isFixtureMenuAnchorClosedIntent(
  v: unknown,
): v is FixtureMenuAnchorClosedIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "FIXTURE_MENU_ANCHOR_CLOSED" &&
    typeof v["fixtureId"] === "string" &&
    v["fixtureKind"] === "menu_anchor" &&
    isEntityRef(v["entityRef"]) &&
    v["actionType"] === "menu_close" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for any FixtureInteractionIntent variant. */
export function isFixtureInteractionIntent(
  v: unknown,
): v is FixtureInteractionIntent {
  return (
    isFixtureButtonClickedIntent(v) ||
    isFixtureButtonHoveredIntent(v) ||
    isFixtureButtonUnhoveredIntent(v) ||
    isFixtureHandleDragStartIntent(v) ||
    isFixtureHandleDragMoveIntent(v) ||
    isFixtureHandleDragEndIntent(v) ||
    isFixtureMenuAnchorOpenedIntent(v) ||
    isFixtureMenuAnchorClosedIntent(v)
  );
}

// ---------------------------------------------------------------------------
// Guards map (intent kind → guard function)
// ---------------------------------------------------------------------------

export const FIXTURE_INTENT_GUARDS: {
  [K in FixtureInteractionIntentKind]: (
    v: unknown,
  ) => v is { intent: K } & FixtureIntentPayloadMap[K];
} = {
  FIXTURE_BUTTON_CLICKED:     isFixtureButtonClickedIntent,
  FIXTURE_BUTTON_HOVERED:     isFixtureButtonHoveredIntent,
  FIXTURE_BUTTON_UNHOVERED:   isFixtureButtonUnhoveredIntent,
  FIXTURE_HANDLE_DRAG_START:  isFixtureHandleDragStartIntent,
  FIXTURE_HANDLE_DRAG_MOVE:   isFixtureHandleDragMoveIntent,
  FIXTURE_HANDLE_DRAG_END:    isFixtureHandleDragEndIntent,
  FIXTURE_MENU_ANCHOR_OPENED: isFixtureMenuAnchorOpenedIntent,
  FIXTURE_MENU_ANCHOR_CLOSED: isFixtureMenuAnchorClosedIntent,
};

// ---------------------------------------------------------------------------
// Pure geometry helpers (no React / Three.js dependencies — unit-testable)
// ---------------------------------------------------------------------------

/**
 * Compute the billboard offset vector for a fixture button placed relative
 * to a parent entity.
 *
 * Buttons are placed at a fixed offset above-right of the entity's root
 * position.  The offset is in world space: y-up, x-right.
 *
 * @param index    — index of the fixture in the entity's fixture list (0-based)
 * @param spacing  — horizontal spacing between sibling fixtures (default 0.25)
 */
export function computeFixtureButtonOffset(
  index: number,
  spacing = 0.25,
): { x: number; y: number; z: number } {
  return {
    x: index * spacing,
    y: 0.55,   // raised above typical agent/task head height
    z: 0.0,
  };
}

/**
 * Compute the absolute world position of a fixture given its parent's world
 * position and the fixture's local offset.
 */
export function computeFixtureWorldPos(
  parentPos: FixtureWorldPosition,
  localOffset: { x: number; y: number; z: number },
): FixtureWorldPosition {
  return {
    x: parentPos.x + localOffset.x,
    y: parentPos.y + localOffset.y,
    z: parentPos.z + localOffset.z,
  };
}

/**
 * Extract a FixtureScreenPosition from a DOM PointerEvent or MouseEvent.
 * Returns null if the event doesn't provide client coordinates.
 */
export function extractScreenPosition(
  e: { clientX: number; clientY: number } | null | undefined,
): FixtureScreenPosition | undefined {
  if (!e) return undefined;
  return { x: e.clientX, y: e.clientY };
}
