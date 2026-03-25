/**
 * building-layer-handlers.ts — Pure, dependency-injectable handler functions
 * for the building layer 3D object.
 *
 * Sub-AC 4b: Implements click, hover, and context-menu event handlers on the
 * building layer 3D object that emit canonical `interaction_intent` entities
 * with `target_entity_type = 'building'`.
 *
 * Design
 * ──────
 * These handlers are **pure functions** — they accept:
 *   1. A minimal pointer-event object (R3F/Three.js compatible subset)
 *   2. A `BuildingHandlerContext` (current scene state for the building)
 *   3. An `InteractionIntentDispatcher` instance (dependency-injected)
 *
 * They produce two outputs per invocation:
 *   • A layer-specific `BuildingInteractionIntent` (rich, full payload)
 *   • A canonical `InteractionIntentEntity` with `target_entity_type='building'`
 *     (the ontology-level record, dispatched through the dispatcher)
 *
 * Independence from React / Three.js
 * ────────────────────────────────────
 * This module has zero React, Three.js, or browser-DOM dependencies.  It can
 * be instantiated and tested in any Node.js environment, which satisfies the
 * Sub-AC 4b requirement for **isolated tests**.
 *
 * How it fits the two-step intent model
 * ──────────────────────────────────────
 * Step 1 — Layer-specific intent production:
 *   Each handler creates a `BuildingInteractionIntent` (via the factory
 *   functions from `building-interaction-intents.ts`) from the minimal
 *   pointer-event and context parameters.
 *
 * Step 2 — Canonical normalization & dispatch:
 *   The layer-specific intent is passed to `normalizeBuildingIntent` which
 *   extracts the three canonical discriminant fields:
 *     • `target_entity_type` = "building"
 *     • `gesture_type`       = "click" | "hover" | "unhover" | "context_menu"
 *     • `target_id`          = `context.building_id`
 *   The resulting `InteractionIntentEntity` is dispatched via the injected
 *   `InteractionIntentDispatcher`, which appends it to the ring buffer and
 *   notifies all subscribers.
 *
 * Three handlers for Sub-AC 4b
 * ──────────────────────────────
 *   • `handleBuildingClick`       — left-click / tap on building geometry
 *   • `handleBuildingHover`       — pointer-enter on building geometry
 *   • `handleBuildingContextMenu` — right-click on building geometry
 *
 * The `handleBuildingUnhover` handler is also included for completeness
 * (pointer-leave balances pointer-enter), but the three above are the primary
 * gesture types required by Sub-AC 4b.
 *
 * Usage
 * ─────
 * ```ts
 * import {
 *   handleBuildingClick, handleBuildingHover, handleBuildingContextMenu,
 * } from "../scene/building-layer-handlers.js";
 * import { createInteractionIntentDispatcher } from
 *   "../scene/interaction-intent-dispatcher.js";
 *
 * const dispatcher = createInteractionIntentDispatcher();
 * const context = {
 *   building_id: "building-hq",
 *   drill_level: "building" as const,
 *   floor_count: 2,
 * };
 *
 * // On click:
 * const { entity } = handleBuildingClick(event, context, dispatcher);
 * // entity.target_entity_type === "building"
 * // entity.gesture_type       === "click"
 * // entity.target_id          === "building-hq"
 * ```
 *
 * Record transparency
 * ────────────────────
 * Every dispatched entity is:
 *   • Immutable (frozen by `makeInteractionIntentEntity`)
 *   • JSON-serialisable
 *   • Assigned a unique `intent_id` for cross-referencing in logs
 *   • Carries the full source `BuildingInteractionIntent` as `source_payload`
 */

import {
  makeBuildingClickedIntent,
  makeBuildingHoveredIntent,
  makeBuildingUnhoveredIntent,
  makeBuildingContextMenuIntent,
  type BuildingInteractionIntent,
} from "./building-interaction-intents.js";

import {
  normalizeBuildingIntent,
  type InteractionIntentDispatcher,
} from "./interaction-intent-dispatcher.js";

import type { InteractionIntentEntity } from "./interaction-intent-entity.js";

// ---------------------------------------------------------------------------
// Shared input types
// ---------------------------------------------------------------------------

/**
 * Minimal pointer-event shape that the building handlers require.
 *
 * This is a strict subset of the Three.js / React Three Fiber `ThreeEvent`
 * type.  Using a minimal interface (rather than the full ThreeEvent) means:
 *   • The handlers can be tested in Node.js without importing Three.js.
 *   • The handlers are decoupled from the R3F event system.
 *
 * In the actual scene component (`BuildingShell.tsx`), the R3F pointer events
 * satisfy this interface automatically — no adapter layer is needed.
 */
export interface BuildingGestureEvent {
  /** Stop upward propagation to parent scene objects. */
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
 * Scene-state context injected into each handler.
 *
 * The handlers do not query any store directly — all necessary state is
 * provided by the caller.  This decoupling enables headless testing.
 */
export interface BuildingHandlerContext {
  /**
   * Stable building identifier from BuildingDef.buildingId.
   * Becomes `target_id` in the canonical entity.
   */
  readonly building_id: string;
  /**
   * Current drill level at the time the gesture was made.
   * Carried in the layer-specific intent for replay fidelity.
   */
  readonly drill_level: "building" | "floor" | "room" | "agent";
  /**
   * Number of floors in the building (for replay verification).
   * Only required by the click intent; ignored by hover/context-menu intents.
   * @default 0
   */
  readonly floor_count?: number;
  /** Optional operator session ID for grouping interaction events. */
  readonly session_id?: string;
}

/**
 * Result returned by every building layer handler.
 *
 * Provides both the rich layer-specific intent (for downstream effects that
 * need floor_count, drill_level, etc.) and the canonical entity (for the
 * dispatcher buffer, event log, and replay system).
 */
export interface BuildingHandlerResult {
  /**
   * The layer-specific `BuildingInteractionIntent` created from the gesture.
   * Carries the full payload, including field types not present in the
   * canonical entity (e.g., `floor_count`, `drill_level`).
   */
  readonly intent: BuildingInteractionIntent;
  /**
   * The canonical `InteractionIntentEntity` dispatched through the dispatcher.
   *
   * Guaranteed invariants:
   *   • `entity.target_entity_type === "building"`
   *   • `entity.gesture_type` is one of "click" | "hover" | "unhover" | "context_menu"
   *   • `entity.target_id === context.building_id`
   *   • `entity.layer === "domain"`
   *   • `entity.source_payload` contains the full layer-specific intent data
   */
  readonly entity: InteractionIntentEntity;
}

// ---------------------------------------------------------------------------
// Handler: Click (left-click / tap)
// ---------------------------------------------------------------------------

/**
 * Handle a **click** gesture on the building layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "building"`
 *   • `gesture_type = "click"`
 *   • `target_id = context.building_id`
 *
 * @param event      — Minimal pointer event from R3F (or synthesised in tests)
 * @param context    — Current building scene state
 * @param dispatcher — Shared intent dispatcher (receives the canonical entity)
 * @returns          — Both the layer-specific intent and the canonical entity
 *
 * @example
 * ```ts
 * // In a Three.js / R3F scene component:
 * <group onClick={(e) => handleBuildingClick(e, context, dispatcher)} />
 *
 * // In a test:
 * const { entity } = handleBuildingClick(mockEvent, context, dispatcher);
 * expect(entity.target_entity_type).toBe("building");
 * expect(entity.gesture_type).toBe("click");
 * ```
 */
export function handleBuildingClick(
  event: BuildingGestureEvent,
  context: BuildingHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): BuildingHandlerResult {
  event.stopPropagation?.();

  const intent = makeBuildingClickedIntent({
    building_id:    context.building_id,
    drill_level:    context.drill_level,
    world_position: event.point ?? null,
    floor_count:    context.floor_count ?? 0,
    ts:             Date.now(),
    session_id:     context.session_id,
  });

  const entity = normalizeBuildingIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Handler: Hover (pointer-enter)
// ---------------------------------------------------------------------------

/**
 * Handle a **hover** (pointer-enter) gesture on the building layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "building"`
 *   • `gesture_type = "hover"`
 *   • `target_id = context.building_id`
 *
 * @param event      — Minimal pointer event from R3F
 * @param context    — Current building scene state
 * @param dispatcher — Shared intent dispatcher
 * @returns          — Both the layer-specific intent and the canonical entity
 *
 * @example
 * ```ts
 * <group onPointerOver={(e) => handleBuildingHover(e, context, dispatcher)} />
 * ```
 */
export function handleBuildingHover(
  event: BuildingGestureEvent,
  context: BuildingHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): BuildingHandlerResult {
  event.stopPropagation?.();

  const intent = makeBuildingHoveredIntent({
    building_id:    context.building_id,
    world_position: event.point ?? null,
    ts:             Date.now(),
    session_id:     context.session_id,
  });

  const entity = normalizeBuildingIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Handler: Unhover (pointer-leave)
// ---------------------------------------------------------------------------

/**
 * Handle an **unhover** (pointer-leave) gesture on the building layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "building"`
 *   • `gesture_type = "unhover"`
 *   • `target_id = context.building_id`
 *
 * Unhover is always emitted regardless of drill level (the pointer may have
 * left while transitioning between levels).
 *
 * @param event      — Minimal pointer event from R3F
 * @param context    — Current building scene state
 * @param dispatcher — Shared intent dispatcher
 * @returns          — Both the layer-specific intent and the canonical entity
 */
export function handleBuildingUnhover(
  event: BuildingGestureEvent,
  context: BuildingHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): BuildingHandlerResult {
  // Note: unhover does NOT call stopPropagation — the pointer has already left
  // so propagation control is not meaningful.
  void event; // parameter kept for API symmetry

  const intent = makeBuildingUnhoveredIntent({
    building_id: context.building_id,
    ts:          Date.now(),
    session_id:  context.session_id,
  });

  const entity = normalizeBuildingIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Handler: Context menu (right-click / long-press)
// ---------------------------------------------------------------------------

/**
 * Handle a **context-menu** (right-click / long-press) gesture on the building
 * layer 3D object.
 *
 * Emits a canonical `interaction_intent` entity with:
 *   • `target_entity_type = "building"`
 *   • `gesture_type = "context_menu"`
 *   • `target_id = context.building_id`
 *
 * Also suppresses the browser's native context menu by calling
 * `nativeEvent.preventDefault()` when the native event is present.
 *
 * @param event      — Minimal pointer event from R3F (nativeEvent used for screen coords)
 * @param context    — Current building scene state
 * @param dispatcher — Shared intent dispatcher
 * @returns          — Both the layer-specific intent and the canonical entity
 *
 * @example
 * ```ts
 * <group onContextMenu={(e) => handleBuildingContextMenu(e, context, dispatcher)} />
 * ```
 */
export function handleBuildingContextMenu(
  event: BuildingGestureEvent,
  context: BuildingHandlerContext,
  dispatcher: InteractionIntentDispatcher,
): BuildingHandlerResult {
  event.stopPropagation?.();

  // Suppress the browser's native right-click context menu.
  event.nativeEvent?.preventDefault?.();

  const screenPos = event.nativeEvent
    ? { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY }
    : { x: 0, y: 0 };

  const intent = makeBuildingContextMenuIntent({
    building_id:     context.building_id,
    world_position:  event.point ?? null,
    screen_position: screenPos,
    drill_level:     context.drill_level,
    ts:              Date.now(),
    session_id:      context.session_id,
  });

  const entity = normalizeBuildingIntent(intent, context.session_id);
  dispatcher.dispatchEntity(entity);
  return { intent, entity };
}

// ---------------------------------------------------------------------------
// Convenience: all four handlers as a keyed record
// ---------------------------------------------------------------------------

/**
 * The four building layer handler functions as a keyed record.
 *
 * Useful when a component needs to pass all handlers as a bundle:
 * ```ts
 * const { click, hover, unhover, context_menu } = BUILDING_LAYER_HANDLERS;
 * ```
 */
export const BUILDING_LAYER_HANDLERS = {
  click:        handleBuildingClick,
  hover:        handleBuildingHover,
  unhover:      handleBuildingUnhover,
  context_menu: handleBuildingContextMenu,
} as const;

export type BuildingLayerHandlerKey = keyof typeof BUILDING_LAYER_HANDLERS;
