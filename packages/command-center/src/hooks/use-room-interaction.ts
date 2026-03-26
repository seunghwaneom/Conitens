/**
 * use-room-interaction.ts — Room-layer interaction hook.
 *
 * Sub-AC 4b: Provides React/Three.js pointer event handlers for the Room
 * layer that emit typed `RoomInteractionIntent` values and wire them to:
 *
 *   1. SceneEventLog (record transparency — append-only, event-sourced)
 *   2. SpatialStore  (highlightRoom, drillIntoRoom, selectRoom actions)
 *
 * Propagation contract
 * ────────────────────
 * Every handler calls `e.stopPropagation()` BEFORE emitting an intent.
 * This prevents Three.js / React Three Fiber pointer events from
 * travelling up the scene graph to the BuildingShell group and triggering
 * BUILDING_* intents inadvertently.
 *
 * Two-layer action model
 * ──────────────────────
 * Every interaction follows the same two-step pattern established by
 * `useBuildingInteraction`:
 *
 *   Step 1 — Intent production:
 *     Raw Three.js pointer events are translated into typed
 *     `RoomInteractionIntent` objects with validated payload shapes.
 *
 *   Step 2 — Intent dispatch:
 *     Each intent is:
 *       a) Appended to the SceneEventLog as a `"room.*"` entry
 *          (write-only; never mutated; satisfies record-transparency constraint)
 *       b) Used to update Zustand state (highlightRoom, drillIntoRoom, etc.)
 *
 * Context menu
 * ────────────
 * The hook manages context-menu open/close state so the receiving component
 * can render a menu at the correct screen position without coupling Three.js
 * pointer coordinates to React DOM events.
 *
 * Usage
 * ─────
 * ```tsx
 * function RoomVolume({ entry }: { entry: RoomMetadataEntry }) {
 *   const {
 *     handlers,
 *     contextMenu,
 *     closeContextMenu,
 *   } = useRoomInteraction({
 *     roomId:    entry.roomId,
 *     roomType:  entry.roomType,
 *     floor:     entry.floor,
 *     agentCount: entry.residentAgents.length,
 *   });
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

import { useState, useCallback, useMemo } from "react";
import { useSpatialStore } from "../store/spatial-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";
import {
  makeRoomClickedIntent,
  makeRoomHoveredIntent,
  makeRoomUnhoveredIntent,
  makeRoomContextMenuIntent,
  type RoomInteractionIntent,
  type RoomScreenPosition,
  type RoomTypeKind,
} from "../scene/room-interaction-intents.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Three.js-compatible pointer event shape (subset used by the handlers).
 *
 * We accept a minimal interface rather than the full ThreeEvent so the hook
 * can be tested without importing Three.js or React Three Fiber.
 */
export interface RoomPointerEvent {
  /** Stop propagation to parent scene objects — called first, always. */
  stopPropagation: () => void;
  /** Ray-cast intersection point in world coordinates. */
  point?: { x: number; y: number; z: number };
  /** Native DOM event carrying clientX/clientY for screen position. */
  nativeEvent?: { clientX: number; clientY: number };
}

/**
 * State describing an open context menu on a room.
 * Null when no menu is visible.
 */
export interface RoomContextMenuState {
  /** CSS-pixel anchor position for the popup. */
  screen: RoomScreenPosition;
  /** World-space intersection position (for spatial context). */
  world: { x: number; y: number; z: number } | null;
  /** Room ID the menu was opened on. */
  room_id: string;
  /** Room type at the time the menu was opened. */
  room_type: RoomTypeKind;
  /** Floor index the room belongs to. */
  floor: number;
  /** Drill level at the time the menu was opened. */
  drill_level: "building" | "floor" | "room" | "agent";
}

/**
 * All Three.js pointer event handlers returned by the hook.
 * Attach these directly to the `<group>` element in RoomVolume.
 */
export interface RoomInteractionHandlers {
  onPointerOver: (e: RoomPointerEvent) => void;
  onPointerOut:  (e: RoomPointerEvent) => void;
  onClick:       (e: RoomPointerEvent) => void;
  onContextMenu: (e: RoomPointerEvent) => void;
}

/**
 * Return shape of `useRoomInteraction`.
 */
export interface RoomInteractionResult {
  /** Event handlers to spread onto the Three.js `<group>`. */
  handlers: RoomInteractionHandlers;
  /**
   * Current context-menu state, or null if no menu is visible.
   * Mount a `<RoomContextMenu>` at `contextMenu.screen` when non-null.
   */
  contextMenu: RoomContextMenuState | null;
  /** Close the context menu (call from menu close / dismiss handlers). */
  closeContextMenu: () => void;
  /**
   * Latest intent emitted (useful for testing / debugging).
   * Updated on every interaction event.
   */
  lastIntent: RoomInteractionIntent | null;
}

/**
 * Configuration for a single room's interaction hook.
 */
export interface RoomInteractionConfig {
  /** Stable room identifier from RoomMetadataEntry.roomId. */
  roomId: string;
  /** Room type for payload classification and conditional effects. */
  roomType: RoomTypeKind;
  /** 0-based floor index the room belongs to. */
  floor: number;
  /**
   * Current number of active agents in the room.
   * Captured at render time; included in ROOM_CLICKED payloads.
   */
  agentCount: number;
}

// ---------------------------------------------------------------------------
// Session ID helper
// ---------------------------------------------------------------------------

/** Generate a lightweight session ID for grouping interaction events. */
function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `room-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Module-level session ID shared across all room instances within a page load.
// One session spans the operator's full working session; rooms share it for
// cross-room correlation in the scene event log.
let _roomSessionId: string | null = null;
function roomSessionId(): string {
  if (!_roomSessionId) _roomSessionId = newSessionId();
  return _roomSessionId;
}

// ---------------------------------------------------------------------------
// Scene event log category type (subset relevant to rooms)
// ---------------------------------------------------------------------------

type RoomSceneCategory =
  | "room.selected"
  | "room.deselected"
  | "room.focused"
  | "room.unfocused"
  | "room.highlighted"
  | "room.unhighlighted"
  | "room.member_joined"
  | "room.member_left"
  | "room.activity_changed"
  | "surface.clicked"
  | "unknown";

// ---------------------------------------------------------------------------
// Pure handler factory (testable without React)
// ---------------------------------------------------------------------------

/**
 * Dependencies injected into `createRoomInteractionHandlers`.
 *
 * Accepts explicit functions rather than React hooks so the factory can be
 * called in plain Node.js/Vitest environments without a React renderer.
 * The `useRoomInteraction` hook simply passes its hook-derived values here.
 */
export interface RoomHandlerDeps {
  // ── Room identity ────────────────────────────────────────────────────
  /** Stable room identifier. */
  roomId: string;
  /** Room type for payload and conditional effects. */
  roomType: RoomTypeKind;
  /** 0-based floor index. */
  floor: number;
  /** Active agent count at render time. */
  agentCount: number;
  /** Current drill level — determines whether hover/drill actions fire. */
  drillLevel: "building" | "floor" | "room" | "agent";

  // ── Store callbacks ──────────────────────────────────────────────────
  /** Drill into this room in the spatial store. */
  drillIntoRoom: (roomId: string) => void;
  /** Highlight this room in the spatial store. */
  highlightRoom: (roomId: string) => void;
  /** Remove highlight from this room. */
  unhighlightRoom: (roomId: string) => void;
  /**
   * Emit a typed room interaction intent (record transparency sink).
   * In production this records to the scene event log; in tests pass vi.fn().
   */
  emitIntent: (intent: RoomInteractionIntent) => void;
  /**
   * Set the context-menu state for the owning component.
   * In production this is useState setter; in tests pass vi.fn().
   */
  setContextMenu: (state: RoomContextMenuState | null) => void;

  // ── Optional overrides ───────────────────────────────────────────────
  /**
   * Override cursor changes.  Defaults to `document.body.style.cursor`
   * in DOM environments.  Tests pass a vi.fn() to avoid DOM access.
   */
  setCursor?: (cursor: string) => void;
  /**
   * Override the session ID used for grouping events.
   * Defaults to the module-level `roomSessionId()`.
   */
  sessionId?: string;
}

/** Return value of `createRoomInteractionHandlers`. */
export interface RoomHandlersResult {
  /** Attach these handlers to the Three.js `<group>` element. */
  handlers: RoomInteractionHandlers;
  /** Close the context menu (pass to the menu's dismiss action). */
  closeContextMenu: () => void;
}

/**
 * `createRoomInteractionHandlers` — Pure factory for room-layer handlers.
 *
 * Creates click, hover, unhover, and context-menu handlers that:
 *   1. Call `stopPropagation()` first (propagation contract)
 *   2. Produce typed `RoomInteractionIntent` objects (plain JSON-serialisable)
 *   3. Call the injected store actions (drillIntoRoom, highlightRoom, etc.)
 *   4. Forward intents to the injected `emitIntent` sink
 *
 * Because all dependencies are injected (no React hooks), this function
 * can be called and tested in any environment — Node, jsdom, or production.
 * It satisfies the "plain testable objects" requirement of Sub-AC 4b.
 *
 * @example
 * ```ts
 * // In tests:
 * const emitIntent = vi.fn();
 * const { handlers } = createRoomInteractionHandlers({
 *   roomId: "ctrl-1", roomType: "control", floor: 0, agentCount: 2,
 *   drillLevel: "floor",
 *   drillIntoRoom: vi.fn(), highlightRoom: vi.fn(), unhighlightRoom: vi.fn(),
 *   emitIntent, setContextMenu: vi.fn(),
 * });
 * handlers.onClick(mockEvent);
 * expect(emitIntent.mock.calls[0][0].intent).toBe("ROOM_CLICKED");
 * ```
 */
export function createRoomInteractionHandlers(
  deps: RoomHandlerDeps,
): RoomHandlersResult {
  const {
    roomId,
    roomType,
    floor,
    agentCount,
    drillLevel,
    drillIntoRoom,
    highlightRoom,
    unhighlightRoom,
    emitIntent,
    setContextMenu,
    setCursor,
    sessionId: overrideSessionId,
  } = deps;

  // ── Cursor helper ──────────────────────────────────────────────────────

  function applySetCursor(cursor: string): void {
    if (setCursor) {
      setCursor(cursor);
    } else if (typeof document !== "undefined") {
      document.body.style.cursor = cursor;
    }
  }

  // ── Session ID ─────────────────────────────────────────────────────────

  const sid = overrideSessionId ?? roomSessionId();

  // ── Handlers ───────────────────────────────────────────────────────────

  /**
   * onPointerOver — pointer enters the room volume.
   *
   * Propagation: `stopPropagation()` called first (prevents BUILDING_HOVERED).
   * Guard: no-op at "building" drill level (room layer not yet active).
   * Effects: cursor → pointer, highlightRoom, ROOM_HOVERED intent.
   */
  function onPointerOver(e: RoomPointerEvent): void {
    e.stopPropagation();
    if (drillLevel === "building") return;

    applySetCursor("pointer");
    highlightRoom(roomId);

    const intent = makeRoomHoveredIntent({
      room_id:        roomId,
      room_type:      roomType,
      floor,
      world_position: e.point ?? null,
      ts:             Date.now(),
      session_id:     sid,
    });
    emitIntent(intent);
  }

  /**
   * onPointerOut — pointer leaves the room volume.
   *
   * Propagation: `stopPropagation()` called first.
   * Effects: cursor → auto, unhighlightRoom, ROOM_UNHOVERED intent.
   * No drill-level guard — unhover must always fire to clean up state.
   */
  function onPointerOut(e: RoomPointerEvent): void {
    e.stopPropagation();
    applySetCursor("auto");
    unhighlightRoom(roomId);

    const intent = makeRoomUnhoveredIntent({
      room_id:    roomId,
      room_type:  roomType,
      floor,
      ts:         Date.now(),
      session_id: sid,
    });
    emitIntent(intent);
  }

  /**
   * onClick — primary click on the room volume.
   *
   * Propagation: `stopPropagation()` called first (prevents BUILDING_CLICKED).
   * Effects: ROOM_CLICKED intent, drillIntoRoom when at "floor" drill level.
   * Idempotent at "room" level — click is recorded but does not re-drill.
   */
  function onClick(e: RoomPointerEvent): void {
    e.stopPropagation();

    const intent = makeRoomClickedIntent({
      room_id:        roomId,
      room_type:      roomType,
      floor,
      drill_level:    drillLevel,
      world_position: e.point ?? null,
      agent_count:    agentCount,
      ts:             Date.now(),
      session_id:     sid,
    });
    emitIntent(intent);

    if (drillLevel === "floor") {
      drillIntoRoom(roomId);
    }
  }

  /**
   * onContextMenu — right-click / long-press on the room volume.
   *
   * Propagation: `stopPropagation()` called first (prevents BUILDING_CONTEXT_MENU).
   * Effects: native context menu suppressed, context-menu state set,
   *          ROOM_CONTEXT_MENU intent.
   */
  function onContextMenu(e: RoomPointerEvent): void {
    e.stopPropagation();

    if (e.nativeEvent) {
      // @ts-expect-error — nativeEvent may carry preventDefault from DOM
      (e.nativeEvent as Event).preventDefault?.();
    }

    const screenPos: RoomScreenPosition = e.nativeEvent
      ? { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
      : { x: 0, y: 0 };

    const menuState: RoomContextMenuState = {
      screen:      screenPos,
      world:       e.point ?? null,
      room_id:     roomId,
      room_type:   roomType,
      floor,
      drill_level: drillLevel,
    };
    setContextMenu(menuState);

    const intent = makeRoomContextMenuIntent({
      room_id:         roomId,
      room_type:       roomType,
      floor,
      world_position:  e.point ?? null,
      screen_position: screenPos,
      drill_level:     drillLevel,
      ts:              Date.now(),
      session_id:      sid,
    });
    emitIntent(intent);
  }

  // ── Close handler ──────────────────────────────────────────────────────

  function closeContextMenu(): void {
    setContextMenu(null);
  }

  return {
    handlers: { onPointerOver, onPointerOut, onClick, onContextMenu },
    closeContextMenu,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * `useRoomInteraction` — Room-layer pointer event handler hook.
 *
 * Emits typed `RoomInteractionIntent` values and records them to the scene
 * event log on every room pointer interaction.
 *
 * The hook integrates with:
 *   - `useSpatialStore` for drill-level, highlight, and drill-in actions
 *   - `useSceneEventLog` for append-only record transparency
 *
 * The handler logic is delegated to `createRoomInteractionHandlers`
 * (a pure factory) so it can be unit-tested independently of React.
 *
 * Propagation guarantee: every handler calls `stopPropagation()` before
 * any other work so parent BuildingShell handlers are never fired.
 */
export function useRoomInteraction(
  config: RoomInteractionConfig,
): RoomInteractionResult {
  const { roomId, roomType, floor, agentCount } = config;

  // ── Store subscriptions ────────────────────────────────────────────────

  const drillLevel      = useSpatialStore((s) => s.drillLevel);
  const drillIntoRoom   = useSpatialStore((s) => s.drillIntoRoom);
  const highlightRoom   = useSpatialStore((s) => s.highlightRoom);
  const unhighlightRoom = useSpatialStore((s) => s.unhighlightRoom);

  const recordEntry = useSceneEventLog((s) => s.recordEntry);

  // ── Local state ────────────────────────────────────────────────────────

  const [contextMenu, setContextMenu] =
    useState<RoomContextMenuState | null>(null);

  const [lastIntent, setLastIntent] =
    useState<RoomInteractionIntent | null>(null);

  // ── Intent emit (records to scene log + updates state) ────────────────

  /**
   * Category mapping for the scene event log.
   *
   *   ROOM_CLICKED      → "room.selected"
   *   ROOM_HOVERED      → "room.highlighted"
   *   ROOM_UNHOVERED    → "room.unhighlighted"
   *   ROOM_CONTEXT_MENU → "surface.clicked"
   */
  const emitIntent = useCallback(
    (intent: RoomInteractionIntent) => {
      setLastIntent(intent);

      const categoryMap: Record<string, RoomSceneCategory> = {
        ROOM_CLICKED:      "room.selected",
        ROOM_HOVERED:      "room.highlighted",
        ROOM_UNHOVERED:    "room.unhighlighted",
        ROOM_CONTEXT_MENU: "surface.clicked",
      };

      const category: RoomSceneCategory =
        categoryMap[intent.intent] ?? "unknown";

      let extra: Record<string, unknown> = {};
      switch (intent.intent) {
        case "ROOM_CLICKED":
          extra = {
            drill_level:    intent.drill_level,
            world_position: intent.world_position,
            agent_count:    intent.agent_count,
          };
          break;
        case "ROOM_HOVERED":
          extra = { world_position: intent.world_position };
          break;
        case "ROOM_CONTEXT_MENU":
          extra = {
            drill_level:     intent.drill_level,
            world_position:  intent.world_position,
            screen_position: intent.screen_position,
          };
          break;
        // ROOM_UNHOVERED carries no extra spatial data
      }

      recordEntry({
        ts:       intent.ts,
        category,
        source:   "spatial",
        payload: {
          intent:     intent.intent,
          room_id:    intent.room_id,
          room_type:  intent.room_type,
          floor:      intent.floor,
          session_id: intent.session_id,
          ...extra,
        },
      });
    },
    [recordEntry],
  );

  // ── Delegate handler creation to the pure factory ─────────────────────
  //
  // useMemo recreates handlers only when a dependency changes.
  // setContextMenu is stable (React useState setter) and emitIntent is
  // stable when recordEntry is stable — so handler recreation is rare.

  const { handlers, closeContextMenu } = useMemo(
    () =>
      createRoomInteractionHandlers({
        roomId,
        roomType,
        floor,
        agentCount,
        drillLevel,
        drillIntoRoom,
        highlightRoom,
        unhighlightRoom,
        emitIntent,
        setContextMenu,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      roomId,
      roomType,
      floor,
      agentCount,
      drillLevel,
      drillIntoRoom,
      highlightRoom,
      unhighlightRoom,
      emitIntent,
      // setContextMenu is intentionally omitted — stable React setter
    ],
  );

  // ── Return ──────────────────────────────────────────────────────────────

  return {
    handlers,
    contextMenu,
    closeContextMenu,
    lastIntent,
  };
}
