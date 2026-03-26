/**
 * use-building-interaction.ts — Building-layer interaction hook.
 *
 * Sub-AC 4a: Provides React/Three.js pointer event handlers for the Building
 * layer that emit typed `BuildingInteractionIntent` values and wire them to:
 *
 *   1. SceneEventLog (record transparency — append-only, event-sourced)
 *   2. SpatialStore (buildingSelected flag, selectBuilding action)
 *
 * Two-layer action model
 * ──────────────────────
 * Every interaction follows the same two-step pattern established by
 * `useRoomInteractivity`:
 *
 *   Step 1 — Intent production:
 *     Raw Three.js pointer events are translated into typed
 *     `BuildingInteractionIntent` objects with validated payload shapes.
 *
 *   Step 2 — Intent dispatch:
 *     Each intent is:
 *       a) Appended to the SceneEventLog as a `"building.*"` entry
 *          (write-only; never mutated; satisfies record-transparency constraint)
 *       b) Used to update Zustand state (selectBuilding, hover cursor, etc.)
 *
 * Context menu
 * ────────────
 * The hook also manages context-menu open/close state so the receiving
 * component can render a menu at the correct screen position without coupling
 * Three.js pointer coordinates to React DOM events.
 *
 * Usage
 * ─────
 * ```tsx
 * function BuildingShell() {
 *   const {
 *     handlers,
 *     contextMenu,
 *     closeContextMenu,
 *   } = useBuildingInteraction();
 *
 *   return (
 *     <group
 *       onPointerOver={handlers.onPointerOver}
 *       onPointerOut={handlers.onPointerOut}
 *       onClick={handlers.onClick}
 *       onContextMenu={handlers.onContextMenu}
 *     >
 *       ...
 *     </group>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useRef } from "react";
import { useSpatialStore } from "../store/spatial-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";
import {
  makeBuildingClickedIntent,
  makeBuildingHoveredIntent,
  makeBuildingUnhoveredIntent,
  makeBuildingContextMenuIntent,
  type BuildingInteractionIntent,
  type ScreenPosition,
} from "../scene/building-interaction-intents.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Three.js-compatible pointer event shape (subset used by the handlers).
 *
 * We accept a minimal interface rather than the full ThreeEvent so the hook
 * can be tested without importing Three.js or React Three Fiber.
 */
export interface BuildingPointerEvent {
  /** Stop propagation to parent scene objects. */
  stopPropagation: () => void;
  /** Ray-cast intersection point in world coordinates. */
  point?: { x: number; y: number; z: number };
  /** Native DOM event carrying clientX/clientY for screen position. */
  nativeEvent?: { clientX: number; clientY: number };
}

/**
 * State describing an open context menu.
 * Null when no menu is visible.
 */
export interface BuildingContextMenuState {
  /** CSS-pixel anchor position for the popup. */
  screen: ScreenPosition;
  /** World-space intersection position (for spatial context). */
  world: { x: number; y: number; z: number } | null;
  /** Building ID the menu was opened on. */
  building_id: string;
  /** Drill level at the time the menu was opened. */
  drill_level: "building" | "floor" | "room" | "agent";
}

/**
 * All Three.js pointer event handlers returned by the hook.
 * Attach these directly to the `<group>` element in BuildingShell.
 */
export interface BuildingInteractionHandlers {
  onPointerOver: (e: BuildingPointerEvent) => void;
  onPointerOut: (e: BuildingPointerEvent) => void;
  onClick: (e: BuildingPointerEvent) => void;
  onContextMenu: (e: BuildingPointerEvent) => void;
}

/**
 * Return shape of `useBuildingInteraction`.
 */
export interface BuildingInteractionResult {
  /** Event handlers to spread onto the Three.js `<group>`. */
  handlers: BuildingInteractionHandlers;
  /**
   * Current context-menu state, or null if no menu is visible.
   * Mount a `<BuildingContextMenu>` at `contextMenu.screen` when non-null.
   */
  contextMenu: BuildingContextMenuState | null;
  /** Close the context menu (call from menu close / dismiss handlers). */
  closeContextMenu: () => void;
  /**
   * Latest intent emitted (useful for testing / debugging).
   * Updated on every interaction event.
   */
  lastIntent: BuildingInteractionIntent | null;
}

// ---------------------------------------------------------------------------
// Session ID helper
// ---------------------------------------------------------------------------

/** Generate a lightweight session ID for grouping interaction events. */
function getSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bld-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Module-level session ID shared across all BuildingShell instances.
// A single building exists in the scene so this is effectively per-page.
let _sessionId: string | null = null;
function buildingSessionId(): string {
  if (!_sessionId) _sessionId = getSessionId();
  return _sessionId;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * `useBuildingInteraction` — Building-layer pointer event handler hook.
 *
 * Emits typed `BuildingInteractionIntent` values and records them to the
 * scene event log on every building pointer interaction.
 *
 * The hook integrates with the spatial store (for drill-level and building
 * metadata) and the scene event log (for record transparency).
 */
export function useBuildingInteraction(): BuildingInteractionResult {
  // ── Store subscriptions ────────────────────────────────────────────────

  const drillLevel    = useSpatialStore((s) => s.drillLevel);
  const drillIntoFloor = useSpatialStore((s) => s.drillIntoFloor);
  const building      = useSpatialStore((s) => s.building);
  const selectBuilding = useSpatialStore((s) => s.selectBuilding);

  const recordEntry   = useSceneEventLog((s) => s.recordEntry);

  // ── Local state ────────────────────────────────────────────────────────

  const [contextMenu, setContextMenu] =
    useState<BuildingContextMenuState | null>(null);

  // Track latest intent for debugging / testing without re-rendering every frame.
  const lastIntentRef = useRef<BuildingInteractionIntent | null>(null);
  const [lastIntent, setLastIntent] =
    useState<BuildingInteractionIntent | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Emit a typed intent: record to scene log + store in ref. */
  const emitIntent = useCallback(
    (intent: BuildingInteractionIntent) => {
      lastIntentRef.current = intent;
      setLastIntent(intent);

      // Record to append-only scene event log (record transparency).
      // Map intent kind to the matching SceneEventCategory.
      type SceneCategory =
        | "building.loaded"
        | "building.load_failed"
        | "navigation.drilled_floor"
        | "navigation.drilled_room"
        | "navigation.drilled_agent"
        | "navigation.ascended"
        | "navigation.reset"
        | "surface.clicked"
        | "surface.dismissed"
        | "recording.started"
        | "recording.cleared"
        | "agent.placed"
        | "agent.moved"
        | "agent.status_changed"
        | "agent.task_started"
        | "agent.task_completed"
        | "agent.selected"
        | "agent.deselected"
        | "agents.initialized"
        | "room.member_joined"
        | "room.member_left"
        | "room.activity_changed"
        | "room.selected"
        | "room.deselected"
        | "room.focused"
        | "room.unfocused"
        | "room.highlighted"
        | "room.unhighlighted"
        | "camera.preset_changed"
        | "camera.mode_changed"
        | "camera.zoom_changed"
        | "camera.pan_changed"
        | "camera.reset"
        | "unknown";

      const categoryMap: Record<string, SceneCategory> = {
        BUILDING_CLICKED:      "surface.clicked",
        BUILDING_HOVERED:      "room.highlighted",   // reuse closest existing category
        BUILDING_UNHOVERED:    "room.unhighlighted",
        BUILDING_CONTEXT_MENU: "surface.clicked",
      };

      recordEntry({
        ts: intent.ts,
        category: categoryMap[intent.intent] ?? "unknown",
        source: "spatial",
        payload: {
          intent: intent.intent,
          building_id: intent.building_id,
          // Spread intent-specific fields while avoiding duplication
          ...(intent.intent === "BUILDING_CLICKED" && {
            drill_level: intent.drill_level,
            floor_count: intent.floor_count,
            world_position: intent.world_position,
          }),
          ...(intent.intent === "BUILDING_HOVERED" && {
            world_position: intent.world_position,
          }),
          ...(intent.intent === "BUILDING_CONTEXT_MENU" && {
            drill_level: intent.drill_level,
            world_position: intent.world_position,
            screen_position: intent.screen_position,
          }),
          session_id: intent.session_id,
        },
      });
    },
    [recordEntry],
  );

  // ── Handlers ───────────────────────────────────────────────────────────

  /**
   * onPointerOver — fires when the pointer enters the building shell.
   *
   * • Only active at the "building" drill level (outer shell clickable)
   * • Changes cursor to "pointer" to indicate interactability
   * • Emits BUILDING_HOVERED intent
   */
  const onPointerOver = useCallback(
    (e: BuildingPointerEvent) => {
      if (drillLevel !== "building") return;
      e.stopPropagation();

      // Change cursor to indicate the building is clickable
      document.body.style.cursor = "pointer";

      const intent = makeBuildingHoveredIntent({
        building_id: building.buildingId,
        world_position: e.point ?? null,
        ts: Date.now(),
        session_id: buildingSessionId(),
      });
      emitIntent(intent);
    },
    [drillLevel, building.buildingId, emitIntent],
  );

  /**
   * onPointerOut — fires when the pointer leaves the building shell.
   *
   * • Restores default cursor
   * • Emits BUILDING_UNHOVERED intent (regardless of drill level — pointer
   *   may have left while transitioning levels)
   */
  const onPointerOut = useCallback(
    (_e: BuildingPointerEvent) => {
      document.body.style.cursor = "auto";

      const intent = makeBuildingUnhoveredIntent({
        building_id: building.buildingId,
        ts: Date.now(),
        session_id: buildingSessionId(),
      });
      emitIntent(intent);
    },
    [building.buildingId, emitIntent],
  );

  /**
   * onClick — primary click on the building shell.
   *
   * At the "building" drill level:
   *   • Emits BUILDING_CLICKED intent
   *   • Calls selectBuilding(true) to open the BuildingContextPanel
   *   • Drills into the first floor
   *
   * When already inside the building (floor/room/agent level):
   *   • Click on the shell is a no-op (interior room/agent handles it)
   */
  const onClick = useCallback(
    (e: BuildingPointerEvent) => {
      e.stopPropagation();

      const isEnterable = drillLevel === "building";

      const intent = makeBuildingClickedIntent({
        building_id: building.buildingId,
        drill_level: drillLevel,
        world_position: e.point ?? null,
        floor_count: building.floors.length,
        ts: Date.now(),
        session_id: buildingSessionId(),
      });
      emitIntent(intent);

      if (!isEnterable) return;

      // Select the building (opens BuildingContextPanel)
      selectBuilding(true);

      // Drill into the first floor (ground floor)
      const firstFloor = building.floors[0];
      if (firstFloor !== undefined) {
        drillIntoFloor(firstFloor.floor);
      }
    },
    [
      drillLevel,
      building.buildingId,
      building.floors,
      selectBuilding,
      drillIntoFloor,
      emitIntent,
    ],
  );

  /**
   * onContextMenu — right-click or long-press on the building shell.
   *
   * • Prevents the browser's native context menu
   * • Emits BUILDING_CONTEXT_MENU intent
   * • Updates local context-menu state so the calling component can
   *   render a positioned popup menu
   */
  const onContextMenu = useCallback(
    (e: BuildingPointerEvent) => {
      e.stopPropagation();

      // Prevent the browser's default context menu from appearing over
      // the canvas (the Three.js canvas is inside a DOM element, so native
      // contextmenu events bubble up unless explicitly prevented).
      if (e.nativeEvent) {
        // @ts-expect-error — nativeEvent may carry preventDefault from DOM
        (e.nativeEvent as Event).preventDefault?.();
      }

      const screenPos: ScreenPosition = e.nativeEvent
        ? { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
        : { x: 0, y: 0 };

      const menuState: BuildingContextMenuState = {
        screen: screenPos,
        world: e.point ?? null,
        building_id: building.buildingId,
        drill_level: drillLevel,
      };

      setContextMenu(menuState);

      const intent = makeBuildingContextMenuIntent({
        building_id: building.buildingId,
        world_position: e.point ?? null,
        screen_position: screenPos,
        drill_level: drillLevel,
        ts: Date.now(),
        session_id: buildingSessionId(),
      });
      emitIntent(intent);
    },
    [building.buildingId, drillLevel, emitIntent],
  );

  // ── Context menu close ─────────────────────────────────────────────────

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ── Return ──────────────────────────────────────────────────────────────

  return {
    handlers: {
      onPointerOver,
      onPointerOut,
      onClick,
      onContextMenu,
    },
    contextMenu,
    closeContextMenu,
    lastIntent,
  };
}
