/**
 * agent-instance-layer-handlers.ts — Pure, dependency-injectable handler
 * functions for the agent_instance layer 3D objects.
 *
 * Sub-AC 4d: Implements click, hover, and context-menu event handlers on the
 * agent_instance layer 3D objects that emit canonical `interaction_intent`
 * entities with `target_entity_type = 'agent_instance'`.
 *
 * Design
 * ──────
 * These handlers are **pure functions** — they accept:
 *   1. A minimal pointer-event object (R3F/Three.js compatible subset)
 *   2. An `AgentInstanceHandlerContext` (current scene state for this agent_instance)
 *   3. An `InteractionIntentDispatcher` instance (dependency-injected)
 *
 * They produce two outputs per invocation:
 *   • A layer-specific `AgentInteractionIntent` (rich, full payload reused from
 *     the agent-interaction-intents.ts system)
 *   • A canonical `InteractionIntentEntity` with `target_entity_type='agent_instance'`
 *     (the ontology-level record, dispatched through the dispatcher)
 *
 * Independence from React / Three.js
 * ────────────────────────────────────
 * This module has zero React, Three.js, or browser-DOM dependencies.  It can
 * be instantiated and tested in any Node.js environment, which satisfies the
 * Sub-AC 4d requirement for **isolated tests**.
 *
 * Propagation contract
 * ────────────────────
 * Every handler (except unhover) calls `event.stopPropagation()` before
 * emitting an intent.  This prevents Three.js / React Three Fiber pointer
 * events from travelling up the scene graph to the RoomVolume or BuildingShell
 * groups and triggering ROOM_* or BUILDING_* intents inadvertently.
 *
 * How it fits the two-step intent model
 * ──────────────────────────────────────
 * Step 1 — Layer-specific intent production:
 *   Each handler creates an `AgentInteractionIntent` (via the factory functions
 *   from `agent-interaction-intents.ts`) from the minimal pointer-event and
 *   context parameters.  This reuses the rich, validated agent-layer intent
 *   shapes that already carry agentRole, agentStatus, roomId, etc.
 *
 * Step 2 — Canonical normalization & dispatch:
 *   The layer-specific intent is passed to `normalizeAgentInstanceIntent` which
 *   extracts the three canonical discriminant fields:
 *     • `target_entity_type` = "agent_instance"   ← Sub-AC 4d discriminant
 *     • `gesture_type`       = "click" | "hover" | "unhover" | "context_menu"
 *     • `target_id`          = `context.agent_instance_id`
 *   The resulting `InteractionIntentEntity` is dispatched via the injected
 *   `InteractionIntentDispatcher`, which appends it to the ring buffer and
 *   notifies all subscribers.
 *
 * Three handlers required by Sub-AC 4d
 * ──────────────────────────────────────
 *   • `handleAgentInstanceClick`       — left-click / tap on agent avatar mesh
 *   • `handleAgentInstanceHover`       — pointer-enter on agent avatar bounding region
 *   • `handleAgentInstanceContextMenu` — right-click / long-press on agent avatar
 *
 * The `handleAgentInstanceUnhover` handler is also included for completeness
 * (pointer-leave balances pointer-enter).
 *
 * Usage
 * ─────
 * ```ts
 * import {
 *   handleAgentInstanceClick,
 *   handleAgentInstanceHover,
 *   handleAgentInstanceContextMenu,
 * } from "../scene/agent-instance-layer-handlers.js";
 * import { createInteractionIntentDispatcher } from
 *   "../scene/interaction-intent-dispatcher.js";
 *
 * const dispatcher = createInteractionIntentDispatcher();
 * const context = {
 *   agent_instance_id: "implementer-42",
 *   agent_name:        "Implementer 42",
 *   agent_role:        "implementer",
 *   agent_status:      "active",
 *   room_id:           "lab-room-01",
 *   was_selected:      false,
 *   is_drill_target:   false,
 * };
 *
 * // On click:
 * const { entity } = handleAgentInstanceClick(event, context, dispatcher);
 * // entity.target_entity_type === "agent_instance"
 * // entity.gesture_type       === "click"
 * // entity.target_id          === "implementer-42"
 * ```
 *
 * Record transparency
 * ────────────────────
 * Every dispatched entity is:
 *   • Immutable (frozen by `makeInteractionIntentEntity`)
 *   • JSON-serialisable
 *   • Assigned a unique `intent_id` for cross-referencing in logs
 *   • Carries the full source `AgentInteractionIntent` as `source_payload`
 */

import {
  makeAgentClickedIntent,
  makeAgentHoveredIntent,
  makeAgentUnhoveredIntent,
  makeAgentContextMenuIntent,
  type AgentInteractionIntent,
} from "./agent-interaction-intents.js";

import {
  normalizeAgentInstanceIntent,
  type InteractionIntentDispatcher,
} from "./interaction-intent-dispatcher.js";

import type { InteractionIntentEntity } from "./interaction-intent-entity.js";

// ---------------------------------------------------------------------------
// Shared input types
// ---------------------------------------------------------------------------

/**
 * Minimal pointer-event shape that the agent_instance handlers require.
 *
 * This is a strict subset of the Three.js / React Three Fiber `ThreeEvent`
 * type.  Using a minimal interface (rather than the full ThreeEvent) means:
 *   • The handlers can be tested in Node.js without importing Three.js.
 *   • The handlers are decoupled from the R3F event system.
 *
 * In the actual scene component (`AgentAvatar.tsx`), the R3F pointer events
 * satisfy this interface automatically — no adapter layer is needed.
 */
export interface AgentInstanceGestureEvent {
  /** Stop upward propagation to parent scene objects (RoomVolume / BuildingShell). */
  stopPropagation?: () => void;
  /** Ray-cast intersection point in world-space (Three.js Y-up). */
  point?: { readonly x: number; readonly y: number; readonly z: number };
  /**
   * Native browser DOM event for extracting screen-space coordinates.
   * Present in R3F pointer events; absent in synthesised / keyboard events.
   */
  nativeEvent?: {
    readonly clientX: number;
    readonly clientY: number;
    readonly ctrlKey?: boolean;
    readonly shiftKey?: boolean;
    readonly altKey?: boolean;
    /** Used to suppress the browser's native context menu. */
    preventDefault?: () => void;
  };
}

/**
 * Scene-state context injected into each agent_instance handler.
 *
 * The handlers do not query any store directly — all necessary state is
 * provided by the caller.  This decoupling enables headless testing.
 */
export interface AgentInstanceHandlerContext {
  /**
   * Stable agent_instance identifier.
   * Becomes `target_id` in the canonical entity.
   */
  readonly agent_instance_id: string;
  /** Agent's display name at the time of the interaction. */
  readonly agent_name: string;
  /**
   * Agent's role string (manager / implementer / researcher / etc.).
   * Used for context menu action sets and visual differentiation.
   */
  readonly agent_role: string;
  /**
   * Agent's operational status at the time of the interaction.
   * Used for status-aware lifecycle entries in context menus.
   */
  readonly agent_status: string;
  /**
   * Room the agent_instance is occupying at interaction time.
   * Carried in the layer-specific intent for room-reassignment context menu.
   */
  readonly room_id: string;
  /**
   * Whether this agent_instance was already the selected entity before this
   * gesture.  Allows replay to distinguish "select" vs "deselect" semantics.
   * @default false
   */
  readonly was_selected?: boolean;
  /**
   * Whether this agent_instance was the active drill target before this gesture.
   * @default false
   */
  readonly is_drill_target?: boolean;
  /** Optional operator session ID for grouping interaction events. */
  readonly session_id?: string;
}

/**
 * Result returned by every agent_instance layer handler.
 *
 * Provides both the rich layer-specific intent (for downstream effects that
 * need agentRole, agentStatus, roomId, etc.) and the canonical entity (for
 * the dispatcher buffer, event log, and replay system).
 */
export interface AgentInstanceHandlerResult {
  /**
   * The layer-specific `AgentInteractionIntent` created from the gesture.
   * Carries the full payload including fields not present in the canonical
   * entity (e.g., `agentRole`, `agentStatus`, `roomId`, `wasSelected`).
   */
  readonly intent: AgentInteractionIntent;
  /**
   * The canonical `InteractionIntentEntity` dispatched through the dispatcher.
   *
   * Guaranteed invariants (Sub-AC 4d):
   *   • `entity.target_entity_type === "agent_instance"`
   *   • `entity.gesture_type` is one of "click" | "hover" | "unhover" | "context_menu"
   *   • `entity.target_id === context.agent_instance_id`
   *   • `entity.layer === "meta"`
   *   • `entity.source_payload` contains the full layer-specific intent data
   */
  readonly entity: InteractionIntentEntity;
}

// ---------------------------------------------------------------------------
// Handler: Click (left-click / tap)
// ---------------------------------------------------------------------------

/**
 * Handle a **click** gesture on an agent_instance layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "agent_instance"`
 *   • `gesture_type = "click"`
 *   • `target_id = context.agent_instance_id`
 *
 * Calls `event.stopPropagation()` to prevent the click from bubbling up to
 * the parent RoomVolume or BuildingShell groups (which would emit redundant
 * ROOM_CLICKED / BUILDING_CLICKED intents).
 *
 * @param event      — Minimal pointer event from R3F (or synthesised in tests)
 * @param context    — Current agent_instance scene state
 * @param dispatcher — Shared intent dispatcher (receives the canonical entity)
 * @returns          — Both the layer-specific intent and the canonical entity
 *
 * @example
 * ```ts
 * // In a Three.js / R3F scene component:
 * <group onClick={(e) => handleAgentInstanceClick(e, context, dispatcher)} />
 *
 * // In a test:
 * const { entity } = handleAgentInstanceClick(mockEvent, context, dispatcher);
 * expect(entity.target_entity_type).toBe("agent_instance");
 * expect(entity.gesture_type).toBe("click");
 * ```
 */
export function handleAgentInstanceClick(
  event: AgentInstanceGestureEvent,
  context: AgentInstanceHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): AgentInstanceHandlerResult {
  event.stopPropagation?.();

  const modifiers = event.nativeEvent
    ? {
        ctrl:  event.nativeEvent.ctrlKey  ?? false,
        shift: event.nativeEvent.shiftKey ?? false,
        alt:   event.nativeEvent.altKey   ?? false,
      }
    : undefined;

  const screenPosition = event.nativeEvent
    ? { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY }
    : undefined;

  const intent = makeAgentClickedIntent({
    agentId:       context.agent_instance_id,
    agentName:     context.agent_name,
    agentRole:     context.agent_role,
    agentStatus:   context.agent_status,
    roomId:        context.room_id,
    worldPosition: event.point ?? null,
    screenPosition,
    modifiers,
    wasSelected:   context.was_selected   ?? false,
    isDrillTarget: context.is_drill_target ?? false,
    ts:            Date.now(),
    session_id:    context.session_id,
  });

  const entity = normalizeAgentInstanceIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Handler: Hover (pointer-enter)
// ---------------------------------------------------------------------------

/**
 * Handle a **hover** (pointer-enter) gesture on an agent_instance layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "agent_instance"`
 *   • `gesture_type = "hover"`
 *   • `target_id = context.agent_instance_id`
 *
 * Calls `event.stopPropagation()` to prevent the hover from bubbling to the
 * parent RoomVolume or BuildingShell groups.
 *
 * @param event      — Minimal pointer event from R3F
 * @param context    — Current agent_instance scene state
 * @param dispatcher — Shared intent dispatcher
 * @returns          — Both the layer-specific intent and the canonical entity
 *
 * @example
 * ```ts
 * <group onPointerOver={(e) => handleAgentInstanceHover(e, context, dispatcher)} />
 * ```
 */
export function handleAgentInstanceHover(
  event: AgentInstanceGestureEvent,
  context: AgentInstanceHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): AgentInstanceHandlerResult {
  event.stopPropagation?.();

  const screenPosition = event.nativeEvent
    ? { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY }
    : undefined;

  const intent = makeAgentHoveredIntent({
    agentId:       context.agent_instance_id,
    agentName:     context.agent_name,
    agentRole:     context.agent_role,
    agentStatus:   context.agent_status,
    roomId:        context.room_id,
    worldPosition: event.point ?? null,
    screenPosition,
    ts:            Date.now(),
    session_id:    context.session_id,
  });

  const entity = normalizeAgentInstanceIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Handler: Unhover (pointer-leave)
// ---------------------------------------------------------------------------

/**
 * Handle an **unhover** (pointer-leave) gesture on an agent_instance layer
 * 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "agent_instance"`
 *   • `gesture_type = "unhover"`
 *   • `target_id = context.agent_instance_id`
 *
 * Unhover is always emitted regardless of drill level (the pointer may have
 * left while transitioning between levels).
 *
 * Note: unhover does NOT call stopPropagation — the pointer has already left
 * so propagation control is not meaningful.
 *
 * @param event      — Minimal pointer event from R3F
 * @param context    — Current agent_instance scene state
 * @param dispatcher — Shared intent dispatcher
 * @returns          — Both the layer-specific intent and the canonical entity
 */
export function handleAgentInstanceUnhover(
  event: AgentInstanceGestureEvent,
  context: AgentInstanceHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): AgentInstanceHandlerResult {
  // Note: unhover does NOT call stopPropagation — the pointer has already left
  // so propagation control is not meaningful.
  void event; // parameter kept for API symmetry

  const intent = makeAgentUnhoveredIntent({
    agentId:     context.agent_instance_id,
    agentRole:   context.agent_role,
    agentStatus: context.agent_status,
    roomId:      context.room_id,
    ts:          Date.now(),
    session_id:  context.session_id,
  });

  const entity = normalizeAgentInstanceIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Handler: Context menu (right-click / long-press)
// ---------------------------------------------------------------------------

/**
 * Handle a **context-menu** (right-click / long-press) gesture on an
 * agent_instance layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "agent_instance"`
 *   • `gesture_type = "context_menu"`
 *   • `target_id = context.agent_instance_id`
 *
 * Also suppresses the browser's native context menu by calling
 * `nativeEvent.preventDefault()` when the native event is present.
 *
 * Calls `event.stopPropagation()` to prevent the event from bubbling to the
 * parent RoomVolume or BuildingShell groups.
 *
 * @param event      — Minimal pointer event from R3F (nativeEvent used for screen coords)
 * @param context    — Current agent_instance scene state
 * @param dispatcher — Shared intent dispatcher
 * @returns          — Both the layer-specific intent and the canonical entity
 *
 * @example
 * ```ts
 * <group onContextMenu={(e) => handleAgentInstanceContextMenu(e, context, dispatcher)} />
 * ```
 */
export function handleAgentInstanceContextMenu(
  event: AgentInstanceGestureEvent,
  context: AgentInstanceHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): AgentInstanceHandlerResult {
  event.stopPropagation?.();

  // Suppress the browser's native right-click context menu.
  event.nativeEvent?.preventDefault?.();

  const screenPos = event.nativeEvent
    ? { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY }
    : { x: 0, y: 0 };

  const modifiers = event.nativeEvent
    ? {
        ctrl:  event.nativeEvent.ctrlKey  ?? false,
        shift: event.nativeEvent.shiftKey ?? false,
        alt:   event.nativeEvent.altKey   ?? false,
      }
    : undefined;

  const intent = makeAgentContextMenuIntent({
    agentId:         context.agent_instance_id,
    agentName:       context.agent_name,
    agentRole:       context.agent_role,
    agentStatus:     context.agent_status,
    roomId:          context.room_id,
    worldPosition:   event.point ?? null,
    screen_position: screenPos,
    modifiers,
    wasSelected:     context.was_selected ?? false,
    ts:              Date.now(),
    session_id:      context.session_id,
  });

  const entity = normalizeAgentInstanceIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Convenience: all four handlers as a keyed record
// ---------------------------------------------------------------------------

/**
 * The four agent_instance layer handler functions as a keyed record.
 *
 * Useful when a component needs to pass all handlers as a bundle:
 * ```ts
 * const { click, hover, unhover, context_menu } = AGENT_INSTANCE_LAYER_HANDLERS;
 * ```
 */
export const AGENT_INSTANCE_LAYER_HANDLERS = {
  click:        handleAgentInstanceClick,
  hover:        handleAgentInstanceHover,
  unhover:      handleAgentInstanceUnhover,
  context_menu: handleAgentInstanceContextMenu,
} as const;

export type AgentInstanceLayerHandlerKey = keyof typeof AGENT_INSTANCE_LAYER_HANDLERS;
