/**
 * agent-interaction-intents.ts — Typed interaction intent system for the
 * Agent layer.
 *
 * Sub-AC 4c: Click, hover, and context-menu event handlers on the Agent
 * layer emit typed `interaction_intents` with agent-scoped payloads.
 * Events are explicitly stopped at the Agent layer to prevent unintentional
 * bubbling to the Room and Building layers.
 *
 * Design
 * ──────
 * Mirrors the building-interaction-intents.ts (Sub-AC 4a) and
 * room-interaction-intents.ts (Sub-AC 4b) patterns. Agent intents carry
 * agent-scoped identifiers (agentId, agentRole, agentStatus) and the agent's
 * world-space position for replay fidelity.
 *
 * Relationship to interaction-intent-store.ts
 * ────────────────────────────────────────────
 * This module defines the PURE TYPE shapes and factory/guard functions for
 * agent interaction intents. The Zustand store in interaction-intent-store.ts
 * uses these types and provides the ring-buffer, session tracking, and
 * scene-event-log forwarding. This module has zero store dependencies and
 * can be used in any test or utility context.
 *
 * Propagation contract
 * ────────────────────
 * Every handler produced from this module calls `e.stopPropagation()`
 * before emitting an intent. This prevents Three.js / React Three Fiber
 * pointer events from travelling up the scene graph to the RoomVolume
 * or BuildingShell groups and triggering ROOM_* or BUILDING_* intents
 * inadvertently.
 *
 * Intent hierarchy
 * ────────────────
 *   AGENT_CLICKED       — left-click or tap on an agent avatar mesh
 *   AGENT_HOVERED       — pointer entered an agent avatar bounding region
 *   AGENT_UNHOVERED     — pointer left an agent avatar bounding region
 *   AGENT_CONTEXT_MENU  — right-click / long-press on an agent avatar
 *
 * Payload conventions
 * ───────────────────
 * • `agentId`          — stable ID from AgentDef / AgentRecord
 * • `agentName`        — display name at the time of interaction
 * • `agentRole`        — role string (manager/implementer/researcher/etc.)
 * • `agentStatus`      — operational status at the time of interaction
 * • `roomId`           — room the agent was occupying at interaction time
 * • `worldPosition`    — Three.js agent position in world space (Y-up)
 * • `screen_position`  — pointer coordinates in CSS pixels (context-menu only)
 * • `wasSelected`      — whether the agent was the selected entity before click
 * • `isDrillTarget`    — whether the agent was the active drill target
 * • `ts`               — Unix ms timestamp (monotonic wall-clock)
 * • `session_id`       — optional operator session for grouping / analytics
 */

// ---------------------------------------------------------------------------
// Intent discriminators
// ---------------------------------------------------------------------------

export type AgentInteractionIntentKind =
  | "AGENT_CLICKED"
  | "AGENT_HOVERED"
  | "AGENT_UNHOVERED"
  | "AGENT_CONTEXT_MENU";

/** O(1) set for fast membership checks. */
export const AGENT_INTENT_KINDS: ReadonlySet<string> =
  new Set<AgentInteractionIntentKind>([
    "AGENT_CLICKED",
    "AGENT_HOVERED",
    "AGENT_UNHOVERED",
    "AGENT_CONTEXT_MENU",
  ]);

/** Type guard — narrows an unknown string to an AgentInteractionIntentKind. */
export function isAgentInteractionIntentKind(
  s: string,
): s is AgentInteractionIntentKind {
  return AGENT_INTENT_KINDS.has(s);
}

// ---------------------------------------------------------------------------
// Shared payload primitives
// ---------------------------------------------------------------------------

/** World-space coordinate in the Three.js Y-up right-handed system. */
export interface AgentWorldPosition {
  x: number;
  y: number;
  z: number;
}

/** Pointer position in CSS pixels relative to the canvas top-left origin. */
export interface AgentScreenPosition {
  x: number;
  y: number;
}

/** Keyboard modifier keys held at the time of the interaction. */
export interface AgentInteractionModifiers {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

// ---------------------------------------------------------------------------
// Per-intent payload interfaces
// ---------------------------------------------------------------------------

/**
 * AGENT_CLICKED
 *
 * Emitted when the operator performs a primary click (left-click or tap) on
 * an agent avatar mesh at the "room" or "agent" drill level. Carries enough
 * context for the effect handler to decide whether to select the agent,
 * drill into it, or both.
 *
 * `wasSelected` and `isDrillTarget` record pre-click state so replay agents
 * can reconstruct the exact selection toggle semantics.
 */
export interface AgentClickedPayload {
  /** Stable agent identifier from AgentDef. */
  agentId: string;
  /** Agent's display name at the time of the click. */
  agentName: string;
  /** Agent's role string (manager / implementer / researcher / etc.). */
  agentRole: string;
  /** Agent's operational status at the time of the click. */
  agentStatus: string;
  /** Room the agent was occupying at the time of the click. */
  roomId: string;
  /**
   * Agent's world-space position in the Three.js scene.
   * Null when the click was synthesised (e.g., keyboard shortcut).
   */
  worldPosition: AgentWorldPosition | null;
  /** Screen-space pointer coordinates in CSS pixels. */
  screenPosition?: AgentScreenPosition;
  /** Keyboard modifier keys held at click time. */
  modifiers?: AgentInteractionModifiers;
  /**
   * Whether this agent was already the selected entity before this click.
   * Allows replay to distinguish "select" vs "deselect" click semantics.
   */
  wasSelected: boolean;
  /**
   * Whether this agent was the active drill target before this click.
   * Relevant for distinguishing "re-click on drilled agent" from "first click".
   */
  isDrillTarget: boolean;
  /** Unix ms timestamp at which the click occurred. */
  ts: number;
  /** Operator session identifier for grouping interaction events. */
  session_id?: string;
}

/**
 * AGENT_HOVERED
 *
 * Emitted when the pointer enters the agent avatar bounding region (Three.js
 * onPointerOver). Used to trigger avatar highlight, tooltip, and cursor change.
 * Only fired once per hover entry; not repeated while the pointer stays within
 * the bounding region.
 */
export interface AgentHoveredPayload {
  /** Stable agent identifier. */
  agentId: string;
  /** Agent's display name (for tooltip). */
  agentName: string;
  /** Agent's role string. */
  agentRole: string;
  /** Agent's operational status. */
  agentStatus: string;
  /** Room the agent is occupying. */
  roomId: string;
  /** Agent's world-space position. */
  worldPosition: AgentWorldPosition | null;
  /** Pointer screen-space coordinates at hover entry. */
  screenPosition?: AgentScreenPosition;
  /** Unix ms timestamp. */
  ts: number;
  /** Operator session identifier. */
  session_id?: string;
}

/**
 * AGENT_UNHOVERED
 *
 * Emitted when the pointer leaves the agent avatar bounding region (Three.js
 * onPointerOut). Always paired with a preceding AGENT_HOVERED; safe to emit
 * even if the avatar was not in a hovered state (idempotent).
 */
export interface AgentUnhoveredPayload {
  /** Stable agent identifier. */
  agentId: string;
  /** Agent's role string. */
  agentRole: string;
  /** Agent's operational status. */
  agentStatus: string;
  /** Room the agent is occupying. */
  roomId: string;
  /** Pointer screen-space coordinates at hover exit. */
  screenPosition?: AgentScreenPosition;
  /** Unix ms timestamp. */
  ts: number;
  /** Operator session identifier. */
  session_id?: string;
}

/**
 * AGENT_CONTEXT_MENU
 *
 * Emitted on a right-click or equivalent long-press on an agent avatar mesh.
 * Carries both world-space and screen-space positions so the context menu
 * component can position itself at the pointer location.
 *
 * `agentStatus` and `roomId` are included so the menu builder can construct
 * status-aware lifecycle entries (start / pause / resume / terminate) without
 * needing an additional store lookup.
 */
export interface AgentContextMenuPayload {
  /** Stable agent identifier. */
  agentId: string;
  /** Agent's display name. */
  agentName: string;
  /** Agent's role string. */
  agentRole: string;
  /** Agent's operational status — gates lifecycle menu entries. */
  agentStatus: string;
  /** Room the agent is currently occupying. */
  roomId: string;
  /** Ray-cast intersection point in world space (for spatial context). */
  worldPosition: AgentWorldPosition | null;
  /** CSS-pixel position for anchoring the context menu popup. */
  screen_position: AgentScreenPosition;
  /** Keyboard modifier keys held at right-click time. */
  modifiers?: AgentInteractionModifiers;
  /** Whether the agent was selected before the right-click. */
  wasSelected: boolean;
  /** Unix ms timestamp. */
  ts: number;
  /** Operator session identifier. */
  session_id?: string;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type AgentClickedIntent = {
  intent: "AGENT_CLICKED";
} & AgentClickedPayload;

export type AgentHoveredIntent = {
  intent: "AGENT_HOVERED";
} & AgentHoveredPayload;

export type AgentUnhoveredIntent = {
  intent: "AGENT_UNHOVERED";
} & AgentUnhoveredPayload;

export type AgentContextMenuIntent = {
  intent: "AGENT_CONTEXT_MENU";
} & AgentContextMenuPayload;

/**
 * Discriminated union of all agent-layer interaction intents.
 * Narrow by `intent` field with a switch statement.
 *
 * @example
 * ```ts
 * function handleAgentIntent(intent: AgentInteractionIntent) {
 *   switch (intent.intent) {
 *     case "AGENT_CLICKED":      handleClick(intent);       break;
 *     case "AGENT_HOVERED":      handleHover(intent);       break;
 *     case "AGENT_UNHOVERED":    handleUnhover(intent);     break;
 *     case "AGENT_CONTEXT_MENU": handleContextMenu(intent); break;
 *   }
 * }
 * ```
 */
export type AgentInteractionIntent =
  | AgentClickedIntent
  | AgentHoveredIntent
  | AgentUnhoveredIntent
  | AgentContextMenuIntent;

// ---------------------------------------------------------------------------
// Discriminated payload map (intent kind → payload type)
// ---------------------------------------------------------------------------

export interface AgentIntentPayloadMap {
  AGENT_CLICKED:      AgentClickedPayload;
  AGENT_HOVERED:      AgentHoveredPayload;
  AGENT_UNHOVERED:    AgentUnhoveredPayload;
  AGENT_CONTEXT_MENU: AgentContextMenuPayload;
}

// ---------------------------------------------------------------------------
// Factories — create validated intent objects from raw inputs
// ---------------------------------------------------------------------------

/** Create an AGENT_CLICKED intent. */
export function makeAgentClickedIntent(
  params: AgentClickedPayload,
): AgentClickedIntent {
  return { intent: "AGENT_CLICKED", ...params };
}

/** Create an AGENT_HOVERED intent. */
export function makeAgentHoveredIntent(
  params: AgentHoveredPayload,
): AgentHoveredIntent {
  return { intent: "AGENT_HOVERED", ...params };
}

/** Create an AGENT_UNHOVERED intent. */
export function makeAgentUnhoveredIntent(
  params: AgentUnhoveredPayload,
): AgentUnhoveredIntent {
  return { intent: "AGENT_UNHOVERED", ...params };
}

/** Create an AGENT_CONTEXT_MENU intent. */
export function makeAgentContextMenuIntent(
  params: AgentContextMenuPayload,
): AgentContextMenuIntent {
  return { intent: "AGENT_CONTEXT_MENU", ...params };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Guard for AGENT_CLICKED intents. */
export function isAgentClickedIntent(v: unknown): v is AgentClickedIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "AGENT_CLICKED" &&
    typeof v["agentId"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for AGENT_HOVERED intents. */
export function isAgentHoveredIntent(v: unknown): v is AgentHoveredIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "AGENT_HOVERED" &&
    typeof v["agentId"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for AGENT_UNHOVERED intents. */
export function isAgentUnhoveredIntent(v: unknown): v is AgentUnhoveredIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "AGENT_UNHOVERED" &&
    typeof v["agentId"] === "string" &&
    typeof v["ts"] === "number"
  );
}

/** Guard for AGENT_CONTEXT_MENU intents. */
export function isAgentContextMenuIntent(
  v: unknown,
): v is AgentContextMenuIntent {
  if (!isObj(v)) return false;
  return (
    v["intent"] === "AGENT_CONTEXT_MENU" &&
    typeof v["agentId"] === "string" &&
    typeof v["ts"] === "number" &&
    isObj(v["screen_position"])
  );
}

/** Guard for any AgentInteractionIntent variant. */
export function isAgentInteractionIntent(
  v: unknown,
): v is AgentInteractionIntent {
  return (
    isAgentClickedIntent(v) ||
    isAgentHoveredIntent(v) ||
    isAgentUnhoveredIntent(v) ||
    isAgentContextMenuIntent(v)
  );
}

// ---------------------------------------------------------------------------
// Payload guards map (intent kind → guard function)
// ---------------------------------------------------------------------------

export const AGENT_INTENT_GUARDS: {
  [K in AgentInteractionIntentKind]: (
    v: unknown,
  ) => v is { intent: K } & AgentIntentPayloadMap[K];
} = {
  AGENT_CLICKED:      isAgentClickedIntent,
  AGENT_HOVERED:      isAgentHoveredIntent,
  AGENT_UNHOVERED:    isAgentUnhoveredIntent,
  AGENT_CONTEXT_MENU: isAgentContextMenuIntent,
};
