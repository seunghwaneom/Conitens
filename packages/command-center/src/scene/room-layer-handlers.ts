/**
 * room-layer-handlers.ts — Pure, dependency-injectable handler functions
 * for the room layer 3D objects.
 *
 * Sub-AC 4c: Implements click, hover, and context-menu event handlers on the
 * room layer 3D objects that emit canonical `interaction_intent` entities
 * with `target_entity_type = 'room'`.
 *
 * Design
 * ──────
 * These handlers are **pure functions** — they accept:
 *   1. A minimal pointer-event object (R3F/Three.js compatible subset)
 *   2. A `RoomHandlerContext` (current scene state for the room)
 *   3. An `InteractionIntentDispatcher` instance (dependency-injected)
 *
 * They produce two outputs per invocation:
 *   • A layer-specific `RoomInteractionIntent` (rich, full payload)
 *   • A canonical `InteractionIntentEntity` with `target_entity_type='room'`
 *     (the ontology-level record, dispatched through the dispatcher)
 *
 * Independence from React / Three.js
 * ────────────────────────────────────
 * This module has zero React, Three.js, or browser-DOM dependencies.  It can
 * be instantiated and tested in any Node.js environment, which satisfies the
 * Sub-AC 4c requirement for **isolated tests**.
 *
 * Propagation contract
 * ────────────────────
 * Every handler calls `event.stopPropagation()` before emitting an intent.
 * This prevents Three.js / React Three Fiber pointer events from travelling
 * up the scene graph to the BuildingShell group and triggering BUILDING_*
 * intents inadvertently.
 *
 * How it fits the two-step intent model
 * ──────────────────────────────────────
 * Step 1 — Layer-specific intent production:
 *   Each handler creates a `RoomInteractionIntent` (via the factory
 *   functions from `room-interaction-intents.ts`) from the minimal
 *   pointer-event and context parameters.
 *
 * Step 2 — Canonical normalization & dispatch:
 *   The layer-specific intent is passed to `normalizeRoomIntent` which
 *   extracts the three canonical discriminant fields:
 *     • `target_entity_type` = "room"
 *     • `gesture_type`       = "click" | "hover" | "unhover" | "context_menu"
 *     • `target_id`          = `context.room_id`
 *   The resulting `InteractionIntentEntity` is dispatched via the injected
 *   `InteractionIntentDispatcher`, which appends it to the ring buffer and
 *   notifies all subscribers.
 *
 * Three handlers for Sub-AC 4c
 * ──────────────────────────────
 *   • `handleRoomClick`       — left-click / tap on room geometry
 *   • `handleRoomHover`       — pointer-enter on room geometry
 *   • `handleRoomContextMenu` — right-click on room geometry
 *
 * The `handleRoomUnhover` handler is also included for completeness
 * (pointer-leave balances pointer-enter), but the three above are the primary
 * gesture types required by Sub-AC 4c.
 *
 * Usage
 * ─────
 * ```ts
 * import {
 *   handleRoomClick, handleRoomHover, handleRoomContextMenu,
 * } from "../scene/room-layer-handlers.js";
 * import { createInteractionIntentDispatcher } from
 *   "../scene/interaction-intent-dispatcher.js";
 *
 * const dispatcher = createInteractionIntentDispatcher();
 * const context = {
 *   room_id: "control-room-01",
 *   room_type: "control" as const,
 *   floor: 0,
 *   drill_level: "floor" as const,
 *   agent_count: 3,
 * };
 *
 * // On click:
 * const { entity } = handleRoomClick(event, context, dispatcher);
 * // entity.target_entity_type === "room"
 * // entity.gesture_type       === "click"
 * // entity.target_id          === "control-room-01"
 * ```
 *
 * Record transparency
 * ────────────────────
 * Every dispatched entity is:
 *   • Immutable (frozen by `makeInteractionIntentEntity`)
 *   • JSON-serialisable
 *   • Assigned a unique `intent_id` for cross-referencing in logs
 *   • Carries the full source `RoomInteractionIntent` as `source_payload`
 */

import {
  makeRoomClickedIntent,
  makeRoomHoveredIntent,
  makeRoomUnhoveredIntent,
  makeRoomContextMenuIntent,
  type RoomInteractionIntent,
  type RoomTypeKind,
} from "./room-interaction-intents.js";

import {
  normalizeRoomIntent,
  type InteractionIntentDispatcher,
} from "./interaction-intent-dispatcher.js";

import type { InteractionIntentEntity } from "./interaction-intent-entity.js";

// ---------------------------------------------------------------------------
// Shared input types
// ---------------------------------------------------------------------------

/**
 * Minimal pointer-event shape that the room handlers require.
 *
 * This is a strict subset of the Three.js / React Three Fiber `ThreeEvent`
 * type.  Using a minimal interface (rather than the full ThreeEvent) means:
 *   • The handlers can be tested in Node.js without importing Three.js.
 *   • The handlers are decoupled from the R3F event system.
 *
 * In the actual scene component, the R3F pointer events satisfy this interface
 * automatically — no adapter layer is needed.
 */
export interface RoomGestureEvent {
  /** Stop upward propagation to parent scene objects (including BuildingShell). */
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
    /** Used to suppress the browser's native context menu. */
    preventDefault?: () => void;
  };
}

/**
 * Scene-state context injected into each room handler.
 *
 * The handlers do not query any store directly — all necessary state is
 * provided by the caller.  This decoupling enables headless testing.
 */
export interface RoomHandlerContext {
  /**
   * Stable room identifier from RoomMetadataEntry.roomId.
   * Becomes `target_id` in the canonical entity.
   */
  readonly room_id: string;
  /**
   * Room type at the time of the interaction.
   * Used for conditional visual effects and context menu action sets.
   */
  readonly room_type: RoomTypeKind;
  /**
   * 0-based floor index the room belongs to.
   */
  readonly floor: number;
  /**
   * Current drill level at the time the gesture was made.
   * Carried in the layer-specific intent for replay fidelity.
   */
  readonly drill_level: "building" | "floor" | "room" | "agent";
  /**
   * Number of active agents in the room at interaction time.
   * Only required by click intents; ignored by hover/context-menu.
   * @default 0
   */
  readonly agent_count?: number;
  /** Optional operator session ID for grouping interaction events. */
  readonly session_id?: string;
}

/**
 * Result returned by every room layer handler.
 *
 * Provides both the rich layer-specific intent (for downstream effects that
 * need room_type, floor, drill_level, agent_count, etc.) and the canonical
 * entity (for the dispatcher buffer, event log, and replay system).
 */
export interface RoomHandlerResult {
  /**
   * The layer-specific `RoomInteractionIntent` created from the gesture.
   * Carries the full payload, including fields not present in the canonical
   * entity (e.g., `room_type`, `floor`, `drill_level`, `agent_count`).
   */
  readonly intent: RoomInteractionIntent;
  /**
   * The canonical `InteractionIntentEntity` dispatched through the dispatcher.
   *
   * Guaranteed invariants:
   *   • `entity.target_entity_type === "room"`
   *   • `entity.gesture_type` is one of "click" | "hover" | "unhover" | "context_menu"
   *   • `entity.target_id === context.room_id`
   *   • `entity.layer === "infrastructure"`
   *   • `entity.source_payload` contains the full layer-specific intent data
   */
  readonly entity: InteractionIntentEntity;
}

// ---------------------------------------------------------------------------
// Handler: Click (left-click / tap)
// ---------------------------------------------------------------------------

/**
 * Handle a **click** gesture on a room layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "room"`
 *   • `gesture_type = "click"`
 *   • `target_id = context.room_id`
 *
 * Calls `event.stopPropagation()` to prevent the click from bubbling up to
 * the BuildingShell group (which would emit a redundant BUILDING_CLICKED
 * intent).
 *
 * @param event      — Minimal pointer event from R3F (or synthesised in tests)
 * @param context    — Current room scene state
 * @param dispatcher — Shared intent dispatcher (receives the canonical entity)
 * @returns          — Both the layer-specific intent and the canonical entity
 *
 * @example
 * ```ts
 * // In a Three.js / R3F scene component:
 * <mesh onClick={(e) => handleRoomClick(e, context, dispatcher)} />
 *
 * // In a test:
 * const { entity } = handleRoomClick(mockEvent, context, dispatcher);
 * expect(entity.target_entity_type).toBe("room");
 * expect(entity.gesture_type).toBe("click");
 * ```
 */
export function handleRoomClick(
  event: RoomGestureEvent,
  context: RoomHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): RoomHandlerResult {
  event.stopPropagation?.();

  const intent = makeRoomClickedIntent({
    room_id:        context.room_id,
    room_type:      context.room_type,
    floor:          context.floor,
    drill_level:    context.drill_level,
    world_position: event.point ?? null,
    agent_count:    context.agent_count ?? 0,
    ts:             Date.now(),
    session_id:     context.session_id,
  });

  const entity = normalizeRoomIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Handler: Hover (pointer-enter)
// ---------------------------------------------------------------------------

/**
 * Handle a **hover** (pointer-enter) gesture on a room layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "room"`
 *   • `gesture_type = "hover"`
 *   • `target_id = context.room_id`
 *
 * Calls `event.stopPropagation()` to prevent the hover from bubbling to the
 * BuildingShell group.
 *
 * @param event      — Minimal pointer event from R3F
 * @param context    — Current room scene state
 * @param dispatcher — Shared intent dispatcher
 * @returns          — Both the layer-specific intent and the canonical entity
 *
 * @example
 * ```ts
 * <mesh onPointerOver={(e) => handleRoomHover(e, context, dispatcher)} />
 * ```
 */
export function handleRoomHover(
  event: RoomGestureEvent,
  context: RoomHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): RoomHandlerResult {
  event.stopPropagation?.();

  const intent = makeRoomHoveredIntent({
    room_id:        context.room_id,
    room_type:      context.room_type,
    floor:          context.floor,
    world_position: event.point ?? null,
    ts:             Date.now(),
    session_id:     context.session_id,
  });

  const entity = normalizeRoomIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Handler: Unhover (pointer-leave)
// ---------------------------------------------------------------------------

/**
 * Handle an **unhover** (pointer-leave) gesture on a room layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "room"`
 *   • `gesture_type = "unhover"`
 *   • `target_id = context.room_id`
 *
 * Unhover is always emitted regardless of drill level (the pointer may have
 * left while transitioning between levels).
 *
 * Note: unhover does NOT call stopPropagation — the pointer has already left
 * so propagation control is not meaningful.
 *
 * @param event      — Minimal pointer event from R3F
 * @param context    — Current room scene state
 * @param dispatcher — Shared intent dispatcher
 * @returns          — Both the layer-specific intent and the canonical entity
 */
export function handleRoomUnhover(
  event: RoomGestureEvent,
  context: RoomHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): RoomHandlerResult {
  // Note: unhover does NOT call stopPropagation — the pointer has already left
  // so propagation control is not meaningful.
  void event; // parameter kept for API symmetry

  const intent = makeRoomUnhoveredIntent({
    room_id:   context.room_id,
    room_type: context.room_type,
    floor:     context.floor,
    ts:        Date.now(),
    session_id: context.session_id,
  });

  const entity = normalizeRoomIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Handler: Context menu (right-click / long-press)
// ---------------------------------------------------------------------------

/**
 * Handle a **context-menu** (right-click / long-press) gesture on a room
 * layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "room"`
 *   • `gesture_type = "context_menu"`
 *   • `target_id = context.room_id`
 *
 * Also suppresses the browser's native context menu by calling
 * `nativeEvent.preventDefault()` when the native event is present.
 *
 * Calls `event.stopPropagation()` to prevent the event from bubbling to the
 * BuildingShell group.
 *
 * @param event      — Minimal pointer event from R3F (nativeEvent used for screen coords)
 * @param context    — Current room scene state
 * @param dispatcher — Shared intent dispatcher
 * @returns          — Both the layer-specific intent and the canonical entity
 *
 * @example
 * ```ts
 * <mesh onContextMenu={(e) => handleRoomContextMenu(e, context, dispatcher)} />
 * ```
 */
export function handleRoomContextMenu(
  event: RoomGestureEvent,
  context: RoomHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): RoomHandlerResult {
  event.stopPropagation?.();

  // Suppress the browser's native right-click context menu.
  event.nativeEvent?.preventDefault?.();

  const screenPos = event.nativeEvent
    ? { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY }
    : { x: 0, y: 0 };

  const intent = makeRoomContextMenuIntent({
    room_id:         context.room_id,
    room_type:       context.room_type,
    floor:           context.floor,
    world_position:  event.point ?? null,
    screen_position: screenPos,
    drill_level:     context.drill_level,
    ts:              Date.now(),
    session_id:      context.session_id,
  });

  const entity = normalizeRoomIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Convenience: all four handlers as a keyed record
// ---------------------------------------------------------------------------

/**
 * The four room layer handler functions as a keyed record.
 *
 * Useful when a component needs to pass all handlers as a bundle:
 * ```ts
 * const { click, hover, unhover, context_menu } = ROOM_LAYER_HANDLERS;
 * ```
 */
export const ROOM_LAYER_HANDLERS = {
  click:        handleRoomClick,
  hover:        handleRoomHover,
  unhover:      handleRoomUnhover,
  context_menu: handleRoomContextMenu,
} as const;

export type RoomLayerHandlerKey = keyof typeof ROOM_LAYER_HANDLERS;
