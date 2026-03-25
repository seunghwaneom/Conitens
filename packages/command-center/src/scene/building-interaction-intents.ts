/**
 * building-interaction-intents.ts — Typed interaction intent system for the
 * Building layer.
 *
 * Sub-AC 4a: Click, hover, and context-menu event handlers on the Building
 * layer emit typed `interaction_intents` with correct payload shapes.
 *
 * Design
 * ──────
 * Interaction intents are first-class typed values that represent a raw user
 * gesture on the 3D building shell before it is translated into domain state
 * changes (store mutations, command files).  Decoupling the "what the user
 * did" (intent) from "what happens as a result" (effect) enables:
 *
 *   • Record transparency — every building touch is captured as a typed,
 *     serialisable event in the scene event log.
 *   • Replay fidelity — intents can be re-played to reconstruct UI state.
 *   • Testing — handlers can be tested against intent shapes without
 *     coupling to Three.js pointer events.
 *   • Extension — new effects can be added without changing handler code.
 *
 * Intent hierarchy
 * ────────────────
 *   BUILDING_CLICKED       — left-click or tap on the building shell
 *   BUILDING_HOVERED       — pointer entered the building shell
 *   BUILDING_UNHOVERED     — pointer left the building shell
 *   BUILDING_CONTEXT_MENU  — right-click / long-press on the building shell
 *
 * Payload conventions
 * ───────────────────
 * • `building_id`      — stable ID from BuildingDef, matches event log
 * • `drill_level`      — current drill-down level at time of interaction
 * • `world_position`   — Three.js intersection point in world space (Y-up)
 * • `screen_position`  — pointer coordinates in CSS pixels (context-menu only)
 * • `ts`               — Unix ms timestamp (monotonic wall-clock)
 * • `session_id`       — optional operator session for grouping / analytics
 */

// ---------------------------------------------------------------------------
// Intent discriminators
// ---------------------------------------------------------------------------

export type BuildingInteractionIntentKind =
  | "BUILDING_CLICKED"
  | "BUILDING_HOVERED"
  | "BUILDING_UNHOVERED"
  | "BUILDING_CONTEXT_MENU";

/** O(1) set for fast membership checks. */
export const BUILDING_INTENT_KINDS: ReadonlySet<string> =
  new Set<BuildingInteractionIntentKind>([
    "BUILDING_CLICKED",
    "BUILDING_HOVERED",
    "BUILDING_UNHOVERED",
    "BUILDING_CONTEXT_MENU",
  ]);

/** Type guard — narrows an unknown string to a BuildingInteractionIntentKind. */
export function isBuildingInteractionIntentKind(
  s: string,
): s is BuildingInteractionIntentKind {
  return BUILDING_INTENT_KINDS.has(s);
}

// ---------------------------------------------------------------------------
// Shared payload primitives
// ---------------------------------------------------------------------------

/** World-space coordinate in the Three.js Y-up right-handed system. */
export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

/** Pointer position in CSS pixels relative to the canvas top-left origin. */
export interface ScreenPosition {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Per-intent payload interfaces
// ---------------------------------------------------------------------------

/**
 * BUILDING_CLICKED
 *
 * Emitted when the operator performs a primary click (left-click or tap) on
 * the building shell while at the "building" drill level.  Carries enough
 * context for the effect handler to decide whether to drill down, open a
 * context panel, or both.
 *
 * `floor_count` is included so replay agents can verify that the building
 * layout at the time of the click matches the replay state.
 */
export interface BuildingClickedPayload {
  /** Stable building identifier from BuildingDef.buildingId. */
  building_id: string;
  /**
   * Drill level at the time of the click.
   * "building" = overview; "floor"/"room"/"agent" = already inside.
   */
  drill_level: "building" | "floor" | "room" | "agent";
  /**
   * Three.js ray-cast intersection point on the building geometry,
   * in world-space coordinates.  Null when the click was synthesised
   * (e.g., keyboard shortcut or programmatic trigger).
   */
  world_position: WorldPosition | null;
  /** Number of floors in the building (for replay verification). */
  floor_count: number;
  /** Unix ms timestamp at which the click occurred. */
  ts: number;
  /** Operator session identifier for grouping interaction events. */
  session_id?: string;
}

/**
 * BUILDING_HOVERED
 *
 * Emitted when the pointer enters the building shell geometry (Three.js
 * onPointerOver).  Only fired at the "building" drill level — once inside
 * the building the hover affordance switches to individual rooms/agents.
 */
export interface BuildingHoveredPayload {
  /** Stable building identifier. */
  building_id: string;
  /** Ray-cast intersection point in world space. */
  world_position: WorldPosition | null;
  /** Unix ms timestamp. */
  ts: number;
  /** Operator session identifier. */
  session_id?: string;
}

/**
 * BUILDING_UNHOVERED
 *
 * Emitted when the pointer leaves the building shell geometry (Three.js
 * onPointerOut).  Always paired with a preceding BUILDING_HOVERED; safe to
 * emit even if the shell was not in a hovered state (idempotent).
 */
export interface BuildingUnhoveredPayload {
  /** Stable building identifier. */
  building_id: string;
  /** Unix ms timestamp. */
  ts: number;
  /** Operator session identifier. */
  session_id?: string;
}

/**
 * BUILDING_CONTEXT_MENU
 *
 * Emitted on a right-click or equivalent long-press on the building shell.
 * Carries both world-space and screen-space positions so the context menu
 * component can position itself at the pointer location.
 *
 * The context menu itself is not part of this intent — it is the
 * responsibility of the receiving component to render the menu based on
 * the current drill level and building state.
 */
export interface BuildingContextMenuPayload {
  /** Stable building identifier. */
  building_id: string;
  /** Ray-cast intersection point in world space (for spatial context). */
  world_position: WorldPosition | null;
  /** CSS-pixel position for anchoring the context menu popup. */
  screen_position: ScreenPosition;
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

export type BuildingClickedIntent = {
  intent: "BUILDING_CLICKED";
} & BuildingClickedPayload;

export type BuildingHoveredIntent = {
  intent: "BUILDING_HOVERED";
} & BuildingHoveredPayload;

export type BuildingUnhoveredIntent = {
  intent: "BUILDING_UNHOVERED";
} & BuildingUnhoveredPayload;

export type BuildingContextMenuIntent = {
  intent: "BUILDING_CONTEXT_MENU";
} & BuildingContextMenuPayload;

/**
 * Discriminated union of all building-layer interaction intents.
 * Narrow by `intent` field with a switch statement.
 *
 * @example
 * ```ts
 * function handleBuildingIntent(intent: BuildingInteractionIntent) {
 *   switch (intent.intent) {
 *     case "BUILDING_CLICKED":      handleClick(intent);       break;
 *     case "BUILDING_HOVERED":      handleHover(intent);       break;
 *     case "BUILDING_UNHOVERED":    handleUnhover(intent);     break;
 *     case "BUILDING_CONTEXT_MENU": handleContextMenu(intent); break;
 *   }
 * }
 * ```
 */
export type BuildingInteractionIntent =
  | BuildingClickedIntent
  | BuildingHoveredIntent
  | BuildingUnhoveredIntent
  | BuildingContextMenuIntent;

// ---------------------------------------------------------------------------
// Discriminated payload map (intent kind → payload type)
// ---------------------------------------------------------------------------

export interface BuildingIntentPayloadMap {
  BUILDING_CLICKED: BuildingClickedPayload;
  BUILDING_HOVERED: BuildingHoveredPayload;
  BUILDING_UNHOVERED: BuildingUnhoveredPayload;
  BUILDING_CONTEXT_MENU: BuildingContextMenuPayload;
}

// ---------------------------------------------------------------------------
// Factories — create validated intent objects from raw inputs
// ---------------------------------------------------------------------------

/** Create a BUILDING_CLICKED intent. */
export function makeBuildingClickedIntent(
  params: BuildingClickedPayload,
): BuildingClickedIntent {
  return { intent: "BUILDING_CLICKED", ...params };
}

/** Create a BUILDING_HOVERED intent. */
export function makeBuildingHoveredIntent(
  params: BuildingHoveredPayload,
): BuildingHoveredIntent {
  return { intent: "BUILDING_HOVERED", ...params };
}

/** Create a BUILDING_UNHOVERED intent. */
export function makeBuildingUnhoveredIntent(
  params: BuildingUnhoveredPayload,
): BuildingUnhoveredIntent {
  return { intent: "BUILDING_UNHOVERED", ...params };
}

/** Create a BUILDING_CONTEXT_MENU intent. */
export function makeBuildingContextMenuIntent(
  params: BuildingContextMenuPayload,
): BuildingContextMenuIntent {
  return { intent: "BUILDING_CONTEXT_MENU", ...params };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Guard for BUILDING_CLICKED intents. */
export function isBuildingClickedIntent(
  v: unknown,
): v is BuildingClickedIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "BUILDING_CLICKED" &&
    typeof v["building_id"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for BUILDING_HOVERED intents. */
export function isBuildingHoveredIntent(
  v: unknown,
): v is BuildingHoveredIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "BUILDING_HOVERED" &&
    typeof v["building_id"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for BUILDING_UNHOVERED intents. */
export function isBuildingUnhoveredIntent(
  v: unknown,
): v is BuildingUnhoveredIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "BUILDING_UNHOVERED" &&
    typeof v["building_id"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for BUILDING_CONTEXT_MENU intents. */
export function isBuildingContextMenuIntent(
  v: unknown,
): v is BuildingContextMenuIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "BUILDING_CONTEXT_MENU" &&
    typeof v["building_id"] === "string" &&
    typeof v["ts"] === "number" &&
    isObj(v["screen_position"])
  );
}

/** Guard for any BuildingInteractionIntent variant. */
export function isBuildingInteractionIntent(
  v: unknown,
): v is BuildingInteractionIntent {
  return (
    isBuildingClickedIntent(v) ||
    isBuildingHoveredIntent(v) ||
    isBuildingUnhoveredIntent(v) ||
    isBuildingContextMenuIntent(v)
  );
}

// ---------------------------------------------------------------------------
// Payload guards map (intent kind → guard function)
// ---------------------------------------------------------------------------

export const BUILDING_INTENT_GUARDS: {
  [K in BuildingInteractionIntentKind]: (
    v: unknown,
  ) => v is { intent: K } & BuildingIntentPayloadMap[K];
} = {
  BUILDING_CLICKED:      isBuildingClickedIntent,
  BUILDING_HOVERED:      isBuildingHoveredIntent,
  BUILDING_UNHOVERED:    isBuildingUnhoveredIntent,
  BUILDING_CONTEXT_MENU: isBuildingContextMenuIntent,
};
