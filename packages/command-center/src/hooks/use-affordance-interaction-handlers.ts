/**
 * use-affordance-interaction-handlers.ts — Manipulation handlers for
 * ui_fixture affordances (control_button, handle, menu_anchor).
 *
 * Sub-AC 7b: Interaction intent production — any user interaction (click,
 * drag, hover-select) on a control_button, handle, or menu_anchor generates
 * and records a corresponding interaction_intent entity with correct source
 * affordance reference and intent type.
 *
 * Design
 * ──────
 * Mirrors use-agent-interaction-handlers.ts but targets the fixture affordance
 * layer.  Given an affordanceId, the hook:
 *
 *   1. Resolves the ControlAffordance from useAffordanceStore.
 *   2. Derives the correct handler set based on affordance_kind:
 *        control_button → onClick, onPointerOver, onPointerOut
 *        handle         → onPointerDown, onPointerMove, onPointerUp
 *        menu_anchor    → onClick (toggles open / closed)
 *   3. Each handler:
 *        ① calls e.stopPropagation() FIRST — prevents event bubbling to
 *           parent room / building layers in the R3F scene graph
 *        ② constructs the correct typed FixtureInteractionIntent via the
 *           factory functions in fixture-interaction-intents.ts, carrying
 *           the full source affordance reference (fixtureId, fixtureKind,
 *           entityRef) and the correct intent kind / actionType
 *        ③ emits the intent via useFixtureIntentStore.emitFixtureIntent()
 *           which appends to the local ring buffer and forwards to the scene
 *           event log for full record transparency
 *
 * Source affordance reference
 * ────────────────────────────
 * Every intent produced carries:
 *   • intent.fixtureId   = affordance.affordance_id
 *   • intent.fixtureKind = mapAffordanceKindToFixtureKind(affordance.affordance_kind)
 *   • intent.entityRef   = {
 *       entityType: mapEntityType(affordance.parent_entity_type),
 *       entityId:   affordance.parent_entity_id,
 *     }
 *
 * This ensures the intent can be attributed to the exact affordance and the
 * parent entity without additional store lookups.
 *
 * stopPropagation contract
 * ────────────────────────
 * Every handler calls e.stopPropagation() BEFORE emitting — identical to the
 * agent/room/building layers — so affordance events do NOT bubble through to
 * parent room or building groups.
 *
 * Pure logic helpers (exported for tests)
 * ────────────────────────────────────────
 * mapAffordanceKindToFixtureKind()  — AffordanceKind → SpatialFixtureKind
 * mapControllableEntityType()       — ControllableEntityType → FixtureEntityType
 * buildFixtureEntityRef()           — ControlAffordance → FixtureEntityRef
 * buildControlButtonClickParams()   — build FIXTURE_BUTTON_CLICKED payload fields
 * buildControlButtonHoverParams()   — build FIXTURE_BUTTON_HOVERED payload fields
 * buildControlButtonUnhoverParams() — build FIXTURE_BUTTON_UNHOVERED payload fields
 * buildHandleDragStartParams()      — build FIXTURE_HANDLE_DRAG_START payload fields
 * buildHandleDragMoveParams()       — build FIXTURE_HANDLE_DRAG_MOVE payload fields
 * buildHandleDragEndParams()        — build FIXTURE_HANDLE_DRAG_END payload fields
 * buildMenuAnchorOpenedParams()     — build FIXTURE_MENU_ANCHOR_OPENED payload fields
 * buildMenuAnchorClosedParams()     — build FIXTURE_MENU_ANCHOR_CLOSED payload fields
 *
 * Usage
 * ─────
 *   const handlers = useAffordanceInteractionHandlers("agent-mgr-pause-ctrl-btn");
 *   if (handlers.kind === "control_button") {
 *     return (
 *       <mesh
 *         onClick={handlers.onClick}
 *         onPointerOver={handlers.onPointerOver}
 *         onPointerOut={handlers.onPointerOut}
 *       />
 *     );
 *   }
 */

import { useCallback, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useAffordanceStore } from "../store/affordance-store.js";
import { useFixtureIntentStore } from "../store/fixture-intent-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";
import {
  makeFixtureButtonClickedIntent,
  makeFixtureButtonHoveredIntent,
  makeFixtureButtonUnhoveredIntent,
  makeFixtureHandleDragStartIntent,
  makeFixtureHandleDragMoveIntent,
  makeFixtureHandleDragEndIntent,
  makeFixtureMenuAnchorOpenedIntent,
  makeFixtureMenuAnchorClosedIntent,
  type FixtureEntityRef,
  type FixtureWorldPosition,
  type FixtureScreenPosition,
} from "../scene/fixture-interaction-intents.js";
import type {
  AffordanceKind,
  ControllableEntityType,
  ControlAffordance,
} from "../data/entity-affordance-defs.js";

// ── Type mappings (exported as pure helpers) ────────────────────────────────

/**
 * Map an AffordanceKind to the SpatialFixtureKind carried in intents.
 *
 * SpatialFixtureKind uses shorter names without the "control_" prefix:
 *   control_button → button
 *   handle         → handle
 *   menu_anchor    → menu_anchor
 */
export function mapAffordanceKindToFixtureKind(
  kind: AffordanceKind,
): "button" | "handle" | "menu_anchor" {
  switch (kind) {
    case "control_button": return "button";
    case "handle":         return "handle";
    case "menu_anchor":    return "menu_anchor";
  }
}

/**
 * Map a ControllableEntityType to the FixtureEntityType carried in entityRef.
 *
 * The fixture intent layer uses "agent" (not "agent_instance") for avatar
 * entities.  All other types are passed through unchanged.
 *
 *   agent_instance → agent
 *   task           → task
 *   room           → room
 */
export function mapControllableEntityType(
  entityType: ControllableEntityType,
): "agent" | "task" | "room" {
  if (entityType === "agent_instance") return "agent";
  return entityType as "task" | "room";
}

/**
 * Build the FixtureEntityRef for a ControlAffordance.
 *
 * Extracts parent_entity_type (mapped) + parent_entity_id from the affordance
 * so that the resulting intent can be attributed to the exact parent entity.
 *
 * @param affordance — Source ControlAffordance entity.
 * @returns          — FixtureEntityRef { entityType, entityId }
 */
export function buildFixtureEntityRef(
  affordance: Pick<ControlAffordance, "parent_entity_type" | "parent_entity_id">,
): FixtureEntityRef {
  return {
    entityType: mapControllableEntityType(affordance.parent_entity_type),
    entityId:   affordance.parent_entity_id,
  };
}

// ── Intent parameter builders (exported for unit tests) ─────────────────────

/** Base context shared by all intent builders. */
export interface AffordanceIntentContext {
  affordance:    ControlAffordance;
  worldPosition: FixtureWorldPosition | null;
  screenPos:     FixtureScreenPosition | undefined;
  sessionId:     string | undefined;
  ts:            number;
}

/** Build params for FIXTURE_BUTTON_CLICKED. */
export function buildControlButtonClickParams(
  ctx: AffordanceIntentContext,
) {
  return makeFixtureButtonClickedIntent({
    fixtureId:     ctx.affordance.affordance_id,
    fixtureKind:   "button",
    entityRef:     buildFixtureEntityRef(ctx.affordance),
    actionType:    "click",
    worldPosition: ctx.worldPosition,
    screenPosition: ctx.screenPos,
    ts:            ctx.ts,
    session_id:    ctx.sessionId,
  });
}

/** Build params for FIXTURE_BUTTON_HOVERED. */
export function buildControlButtonHoverParams(
  ctx: AffordanceIntentContext,
) {
  return makeFixtureButtonHoveredIntent({
    fixtureId:     ctx.affordance.affordance_id,
    fixtureKind:   "button",
    entityRef:     buildFixtureEntityRef(ctx.affordance),
    actionType:    "hover_enter",
    worldPosition: ctx.worldPosition,
    screenPosition: ctx.screenPos,
    ts:            ctx.ts,
    session_id:    ctx.sessionId,
  });
}

/** Build params for FIXTURE_BUTTON_UNHOVERED. */
export function buildControlButtonUnhoverParams(
  ctx: AffordanceIntentContext,
) {
  return makeFixtureButtonUnhoveredIntent({
    fixtureId:     ctx.affordance.affordance_id,
    fixtureKind:   "button",
    entityRef:     buildFixtureEntityRef(ctx.affordance),
    actionType:    "hover_exit",
    worldPosition: ctx.worldPosition,
    screenPosition: ctx.screenPos,
    ts:            ctx.ts,
    session_id:    ctx.sessionId,
  });
}

/** Build params for FIXTURE_HANDLE_DRAG_START. */
export function buildHandleDragStartParams(
  ctx: AffordanceIntentContext,
) {
  return makeFixtureHandleDragStartIntent({
    fixtureId:       ctx.affordance.affordance_id,
    fixtureKind:     "handle",
    entityRef:       buildFixtureEntityRef(ctx.affordance),
    actionType:      "drag_start",
    dragOriginWorld: ctx.worldPosition,
    screenPosition:  ctx.screenPos,
    ts:              ctx.ts,
    session_id:      ctx.sessionId,
  });
}

/** Build params for FIXTURE_HANDLE_DRAG_MOVE. */
export function buildHandleDragMoveParams(
  ctx: AffordanceIntentContext & {
    dragOriginWorld: FixtureWorldPosition | null;
    dragCurrentWorld: FixtureWorldPosition | null;
  },
) {
  const delta: FixtureWorldPosition | null =
    ctx.dragOriginWorld && ctx.dragCurrentWorld
      ? {
          x: ctx.dragCurrentWorld.x - ctx.dragOriginWorld.x,
          y: ctx.dragCurrentWorld.y - ctx.dragOriginWorld.y,
          z: ctx.dragCurrentWorld.z - ctx.dragOriginWorld.z,
        }
      : null;

  return makeFixtureHandleDragMoveIntent({
    fixtureId:        ctx.affordance.affordance_id,
    fixtureKind:      "handle",
    entityRef:        buildFixtureEntityRef(ctx.affordance),
    actionType:       "drag_move",
    dragCurrentWorld: ctx.dragCurrentWorld,
    dragDeltaWorld:   delta,
    screenPosition:   ctx.screenPos,
    ts:               ctx.ts,
    session_id:       ctx.sessionId,
  });
}

/** Build params for FIXTURE_HANDLE_DRAG_END. */
export function buildHandleDragEndParams(
  ctx: AffordanceIntentContext & {
    dragOriginWorld: FixtureWorldPosition | null;
    dragEndWorld:    FixtureWorldPosition | null;
  },
) {
  return makeFixtureHandleDragEndIntent({
    fixtureId:       ctx.affordance.affordance_id,
    fixtureKind:     "handle",
    entityRef:       buildFixtureEntityRef(ctx.affordance),
    actionType:      "drag_end",
    dragOriginWorld: ctx.dragOriginWorld,
    dragEndWorld:    ctx.dragEndWorld,
    screenPosition:  ctx.screenPos,
    ts:              ctx.ts,
    session_id:      ctx.sessionId,
  });
}

/** Build params for FIXTURE_MENU_ANCHOR_OPENED. */
export function buildMenuAnchorOpenedParams(
  ctx: AffordanceIntentContext & {
    screenPosition: FixtureScreenPosition;
  },
) {
  return makeFixtureMenuAnchorOpenedIntent({
    fixtureId:      ctx.affordance.affordance_id,
    fixtureKind:    "menu_anchor",
    entityRef:      buildFixtureEntityRef(ctx.affordance),
    actionType:     "menu_open",
    worldPosition:  ctx.worldPosition,
    screen_position: ctx.screenPosition,
    ts:             ctx.ts,
    session_id:     ctx.sessionId,
  });
}

/** Build params for FIXTURE_MENU_ANCHOR_CLOSED. */
export function buildMenuAnchorClosedParams(
  ctx: AffordanceIntentContext,
) {
  return makeFixtureMenuAnchorClosedIntent({
    fixtureId:     ctx.affordance.affordance_id,
    fixtureKind:   "menu_anchor",
    entityRef:     buildFixtureEntityRef(ctx.affordance),
    actionType:    "menu_close",
    worldPosition: ctx.worldPosition,
    ts:            ctx.ts,
    session_id:    ctx.sessionId,
  });
}

// ── Handler shapes (discriminated by affordance kind) ───────────────────────

/** Handlers returned for a control_button affordance. */
export interface ControlButtonHandlers {
  kind: "control_button";
  /** Primary click: emits FIXTURE_BUTTON_CLICKED intent. */
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  /** Pointer enter: emits FIXTURE_BUTTON_HOVERED intent. */
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  /** Pointer exit: emits FIXTURE_BUTTON_UNHOVERED intent. */
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
}

/** Handlers returned for a handle affordance. */
export interface HandleHandlers {
  kind: "handle";
  /** Pointer down: emits FIXTURE_HANDLE_DRAG_START intent. */
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  /** Pointer move (during drag): emits FIXTURE_HANDLE_DRAG_MOVE intent. */
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  /** Pointer up: emits FIXTURE_HANDLE_DRAG_END intent. */
  onPointerUp: (e: ThreeEvent<PointerEvent>) => void;
}

/** Handlers returned for a menu_anchor affordance. */
export interface MenuAnchorHandlers {
  kind: "menu_anchor";
  /** Click: emits FIXTURE_MENU_ANCHOR_OPENED or FIXTURE_MENU_ANCHOR_CLOSED. */
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

/** Fallback when the affordance is not found in the store. */
export interface NullAffordanceHandlers {
  kind: "null";
}

/** Discriminated union of all possible handler shapes. */
export type AffordanceInteractionHandlers =
  | ControlButtonHandlers
  | HandleHandlers
  | MenuAnchorHandlers
  | NullAffordanceHandlers;

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useAffordanceInteractionHandlers — returns typed event handlers for a
 * ui_fixture affordance identified by affordanceId.
 *
 * The returned handler object is discriminated by the affordance kind:
 *   - { kind: "control_button", onClick, onPointerOver, onPointerOut }
 *   - { kind: "handle",         onPointerDown, onPointerMove, onPointerUp }
 *   - { kind: "menu_anchor",    onClick }
 *   - { kind: "null" }   — if the affordanceId is not registered
 *
 * @param affordanceId   — stable affordance_id identifying the ControlAffordance
 * @param parentWorldPos — current world-space position of the parent entity,
 *                         or null if not yet known (e.g., during initial render)
 */
export function useAffordanceInteractionHandlers(
  affordanceId: string,
  parentWorldPos: FixtureWorldPosition | null = null,
): AffordanceInteractionHandlers {
  // ── Store selectors ──────────────────────────────────────────────────────
  const affordance     = useAffordanceStore((s) => s.affordances[affordanceId]);
  const emitFixture    = useFixtureIntentStore((s) => s.emitFixtureIntent);
  const sessionId      = useSceneEventLog((s) => s.sessionId);

  // ── Drag state refs (only used by handle kind) ───────────────────────────
  // useRef is used so drag state doesn't trigger React re-renders.
  const dragOriginRef  = useRef<FixtureWorldPosition | null>(null);
  const isDraggingRef  = useRef(false);
  // Track whether the menu_anchor is currently open
  const menuOpenRef    = useRef(false);

  // ── Null guard ────────────────────────────────────────────────────────────
  if (!affordance) {
    return { kind: "null" };
  }

  // ── Shared helper: extract world-space position from a ThreeEvent ─────────
  function worldPosFromEvent(
    e: ThreeEvent<MouseEvent | PointerEvent>,
  ): FixtureWorldPosition | null {
    // Use the parent world pos if provided; Three.js intersection point
    // as fallback (via e.point).
    if (parentWorldPos) return parentWorldPos;
    if (e.point) {
      return { x: e.point.x, y: e.point.y, z: e.point.z };
    }
    return null;
  }

  function screenPosFromEvent(
    e: ThreeEvent<MouseEvent | PointerEvent>,
  ): FixtureScreenPosition | undefined {
    const native = e.nativeEvent;
    if (native && "clientX" in native) {
      return { x: native.clientX, y: native.clientY };
    }
    return undefined;
  }

  // ── Per-kind handler creation ─────────────────────────────────────────────

  if (affordance.affordance_kind === "control_button") {
    const onClick = useCallback(
      (e: ThreeEvent<MouseEvent>) => {
        // ① Stop propagation FIRST
        e.stopPropagation();

        // ② Build and emit typed intent
        const intent = buildControlButtonClickParams({
          affordance,
          worldPosition: worldPosFromEvent(e),
          screenPos:     screenPosFromEvent(e),
          sessionId:     sessionId ?? undefined,
          ts:            Date.now(),
        });
        emitFixture(intent);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [affordanceId, affordance, parentWorldPos, sessionId, emitFixture],
    );

    const onPointerOver = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        // ① Stop propagation FIRST
        e.stopPropagation();

        // ② Build and emit typed intent
        const intent = buildControlButtonHoverParams({
          affordance,
          worldPosition: worldPosFromEvent(e),
          screenPos:     screenPosFromEvent(e),
          sessionId:     sessionId ?? undefined,
          ts:            Date.now(),
        });
        emitFixture(intent);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [affordanceId, affordance, parentWorldPos, sessionId, emitFixture],
    );

    const onPointerOut = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        // ① Stop propagation FIRST
        e.stopPropagation();

        // ② Build and emit typed intent
        const intent = buildControlButtonUnhoverParams({
          affordance,
          worldPosition: worldPosFromEvent(e),
          screenPos:     screenPosFromEvent(e),
          sessionId:     sessionId ?? undefined,
          ts:            Date.now(),
        });
        emitFixture(intent);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [affordanceId, affordance, parentWorldPos, sessionId, emitFixture],
    );

    return { kind: "control_button", onClick, onPointerOver, onPointerOut };
  }

  if (affordance.affordance_kind === "handle") {
    const onPointerDown = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        // ① Stop propagation FIRST
        e.stopPropagation();

        const worldPos = worldPosFromEvent(e);
        dragOriginRef.current = worldPos;
        isDraggingRef.current = true;

        // ② Build and emit typed intent
        const intent = buildHandleDragStartParams({
          affordance,
          worldPosition: worldPos,
          screenPos:     screenPosFromEvent(e),
          sessionId:     sessionId ?? undefined,
          ts:            Date.now(),
        });
        emitFixture(intent);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [affordanceId, affordance, parentWorldPos, sessionId, emitFixture],
    );

    const onPointerMove = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        if (!isDraggingRef.current) return;

        // ① Stop propagation FIRST
        e.stopPropagation();

        const currentWorld = worldPosFromEvent(e);

        // ② Build and emit typed intent
        const intent = buildHandleDragMoveParams({
          affordance,
          worldPosition:    currentWorld,
          dragOriginWorld:  dragOriginRef.current,
          dragCurrentWorld: currentWorld,
          screenPos:        screenPosFromEvent(e),
          sessionId:        sessionId ?? undefined,
          ts:               Date.now(),
        });
        emitFixture(intent);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [affordanceId, affordance, parentWorldPos, sessionId, emitFixture],
    );

    const onPointerUp = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        if (!isDraggingRef.current) return;

        // ① Stop propagation FIRST
        e.stopPropagation();

        const endWorld = worldPosFromEvent(e);
        isDraggingRef.current = false;

        // ② Build and emit typed intent
        const intent = buildHandleDragEndParams({
          affordance,
          worldPosition:   endWorld,
          dragOriginWorld: dragOriginRef.current,
          dragEndWorld:    endWorld,
          screenPos:       screenPosFromEvent(e),
          sessionId:       sessionId ?? undefined,
          ts:              Date.now(),
        });
        dragOriginRef.current = null;
        emitFixture(intent);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [affordanceId, affordance, parentWorldPos, sessionId, emitFixture],
    );

    return { kind: "handle", onPointerDown, onPointerMove, onPointerUp };
  }

  if (affordance.affordance_kind === "menu_anchor") {
    const onClick = useCallback(
      (e: ThreeEvent<MouseEvent>) => {
        // ① Stop propagation FIRST
        e.stopPropagation();

        const worldPos  = worldPosFromEvent(e);
        const screenPos = screenPosFromEvent(e);
        const wasOpen   = menuOpenRef.current;
        menuOpenRef.current = !wasOpen;

        // ② Build and emit typed intent (open or close)
        if (!wasOpen) {
          // Opening the menu
          const intent = buildMenuAnchorOpenedParams({
            affordance,
            worldPosition:  worldPos,
            screenPos:      screenPos,
            // screen_position is required for OPENED — default to (0,0) if unavailable
            screenPosition: screenPos ?? { x: 0, y: 0 },
            sessionId:      sessionId ?? undefined,
            ts:             Date.now(),
          });
          emitFixture(intent);
        } else {
          // Closing the menu
          const intent = buildMenuAnchorClosedParams({
            affordance,
            worldPosition: worldPos,
            screenPos:     screenPos,
            sessionId:     sessionId ?? undefined,
            ts:            Date.now(),
          });
          emitFixture(intent);
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [affordanceId, affordance, parentWorldPos, sessionId, emitFixture],
    );

    return { kind: "menu_anchor", onClick };
  }

  // Exhaustive fallback — TypeScript should prevent this at compile time
  // but we guard at runtime for defensive correctness.
  return { kind: "null" };
}
