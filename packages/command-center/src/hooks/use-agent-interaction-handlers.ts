/**
 * use-agent-interaction-handlers.ts — Typed interaction handlers for the Agent layer.
 *
 * Sub-AC 4c: Provides click, hover, and context-menu event handlers for a
 * given agent avatar that:
 *   1. Call event.stopPropagation() FIRST — preventing unintentional bubbling
 *      to parent room/floor/building layers in the R3F scene graph.
 *   2. Emit a typed AgentInteractionIntentPayload to the interaction-intent-store
 *      (recorded to the scene event log for full record transparency).
 *   3. Execute the appropriate side-effect (drill navigation, hover cursor,
 *      context-menu open).
 *
 * Event contract
 * ──────────────
 * All three handler categories call stopPropagation():
 *   - Hover (pointerover / pointerout) — stops the event at the avatar group
 *     so parent RoomVolume/BuildingShell pointerover handlers do not fire
 *   - Click — already stopped in previous implementation; preserved here
 *   - Context menu — stopped so the browser default context menu AND parent
 *     scene handlers do not fire; we open our own portal menu instead
 *
 * Propagation note
 * ────────────────
 * In React Three Fiber, pointer events bubble up the scene graph from
 * the intersected mesh outward. Calling event.stopPropagation() on the
 * ThreeEvent prevents the event from reaching any ancestor <group> or
 * <Canvas> onPointerOver/onClick handlers.  This is critical because the
 * Room and Building layers also have pointer handlers for drill navigation.
 *
 * Usage
 * ─────
 *   const { onPointerOver, onPointerOut, onClick, onContextMenu } =
 *     useAgentInteractionHandlers(agentId);
 *
 *   return (
 *     <group
 *       onPointerOver={onPointerOver}
 *       onPointerOut={onPointerOut}
 *       onClick={onClick}
 *       onContextMenu={onContextMenu}
 *     >
 *       ...
 *     </group>
 *   );
 */
import { useCallback } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";
import {
  useInteractionIntentStore,
  buildAgentInteractionIntent,
} from "../store/interaction-intent-store.js";
import {
  useContextMenuStore,
  buildAgentMenuEntries,
} from "../components/ContextMenuDispatcher.js";

// ── Constants for context menu room sub-list ───────────────────────────────

/** Maximum number of rooms surfaced in the right-click "Reassign to room" sub-list. */
const MAX_ROOM_OPTIONS_IN_CONTEXT_MENU = 6;

// ── Return type ────────────────────────────────────────────────────────────

/**
 * Return type of useAgentInteractionHandlers.
 * Each handler is typed to the specific ThreeEvent it handles.
 */
export interface AgentInteractionHandlers {
  /**
   * Fires when the pointer enters the agent avatar group.
   * Stops propagation, emits hover_enter intent, updates hover state, changes cursor.
   */
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;

  /**
   * Fires when the pointer leaves the agent avatar group.
   * Stops propagation, emits hover_exit intent, clears hover state, restores cursor.
   */
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;

  /**
   * Fires on primary button click (left-click / tap) on the agent avatar.
   * Stops propagation, emits click intent, drives drill navigation.
   */
  onClick: (e: ThreeEvent<MouseEvent>) => void;

  /**
   * Fires on secondary button (right-click) or long-press on the agent avatar.
   * Stops propagation, emits context_menu intent, opens the agent context menu
   * portal at the pointer screen coordinates.
   */
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * useAgentInteractionHandlers — returns the four typed interaction handlers
 * for an agent avatar identified by agentId.
 *
 * @param agentId — Stable identifier of the agent this avatar represents.
 * @returns       — Object with onPointerOver, onPointerOut, onClick, onContextMenu.
 */
export function useAgentInteractionHandlers(agentId: string): AgentInteractionHandlers {
  // ── Store selectors ──────────────────────────────────────────────────────
  const agent         = useAgentStore((s) => s.agents[agentId]);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const selectAgent   = useAgentStore((s) => s.selectAgent);
  const setAgentHovered = useAgentStore((s) => s.setAgentHovered);

  const drillIntoAgent = useSpatialStore((s) => s.drillIntoAgent);
  const drillAgent     = useSpatialStore((s) => s.drillAgent);
  // Building rooms for the "Reassign to room" context menu sub-list (Sub-AC 7a)
  const buildingRooms  = useSpatialStore((s) => s.building.rooms);

  const sessionId         = useSceneEventLog((s) => s.sessionId);
  const emitIntent        = useInteractionIntentStore((s) => s.emitAgentInteractionIntent);
  const openContextMenu   = useContextMenuStore((s) => s.openMenu);

  const isSelected = selectedAgentId === agentId;
  const isDrilled  = drillAgent === agentId;

  // ── Shared payload builder ───────────────────────────────────────────────

  /**
   * Build the agent-scoped portion of an intent payload from the current
   * agent runtime state.  Returns null if the agent is not found in the store
   * (defensive: avatar should not receive events for unknown agents, but
   * guard here avoids crashes during hot-reload and async teardown).
   */
  function buildAgentScopePayload(
    kind: "click" | "hover_enter" | "hover_exit" | "context_menu",
    screenX?: number,
    screenY?: number,
    nativeEvent?: MouseEvent | PointerEvent,
  ) {
    if (!agent) return null;

    const modifiers = nativeEvent
      ? {
          ctrl:  nativeEvent.ctrlKey,
          shift: nativeEvent.shiftKey,
          alt:   nativeEvent.altKey,
        }
      : undefined;

    const screenPosition =
      screenX !== undefined && screenY !== undefined
        ? { x: screenX, y: screenY }
        : undefined;

    return buildAgentInteractionIntent({
      kind,
      agentId,
      agentName:     agent.def.name,
      agentRole:     agent.def.role,
      agentStatus:   agent.status,
      roomId:        agent.roomId,
      worldPosition: {
        x: agent.worldPosition.x,
        y: agent.worldPosition.y,
        z: agent.worldPosition.z,
      },
      screenPosition,
      modifiers,
      wasSelected:   isSelected,
      isDrillTarget: isDrilled,
      sessionId,
    });
  }

  // ── onPointerOver ────────────────────────────────────────────────────────

  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      // ① Stop propagation FIRST — prevents RoomVolume / BuildingShell hover
      //    handlers from also firing for this same pointer-over event.
      e.stopPropagation();

      if (!agent) return;

      // ② Emit typed intent
      const payload = buildAgentScopePayload(
        "hover_enter",
        e.nativeEvent.clientX,
        e.nativeEvent.clientY,
        e.nativeEvent,
      );
      if (payload) emitIntent(payload);

      // ③ Side-effects: update hover state in store + change cursor
      setAgentHovered(agentId, true);
      document.body.style.cursor = "pointer";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentId, agent, isSelected, isDrilled, sessionId, emitIntent, setAgentHovered],
  );

  // ── onPointerOut ─────────────────────────────────────────────────────────

  const onPointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      // ① Stop propagation FIRST — prevents ancestor pointerout handlers
      e.stopPropagation();

      if (!agent) return;

      // ② Emit typed intent
      const payload = buildAgentScopePayload(
        "hover_exit",
        e.nativeEvent.clientX,
        e.nativeEvent.clientY,
        e.nativeEvent,
      );
      if (payload) emitIntent(payload);

      // ③ Side-effects: clear hover state + restore cursor
      setAgentHovered(agentId, false);
      document.body.style.cursor = "auto";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentId, agent, isSelected, isDrilled, sessionId, emitIntent, setAgentHovered],
  );

  // ── onClick ──────────────────────────────────────────────────────────────

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      // ① Stop propagation FIRST — prevents RoomVolume / BuildingShell click
      //    drill handlers from also receiving this event.
      e.stopPropagation();

      if (!agent) return;

      // ② Emit typed intent
      const payload = buildAgentScopePayload(
        "click",
        e.nativeEvent.clientX,
        e.nativeEvent.clientY,
        e.nativeEvent,
      );
      if (payload) emitIntent(payload);

      // ③ Side-effects: selection + drill navigation
      if (isDrilled) {
        // Already drilled into this agent — toggle selection only
        selectAgent(isSelected ? null : agentId);
      } else {
        // Drill into agent: select + animate camera to close-up (Sub-AC 3c)
        selectAgent(agentId);
        drillIntoAgent(agentId, agent.worldPosition);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentId, agent, isSelected, isDrilled, sessionId, emitIntent, selectAgent, drillIntoAgent],
  );

  // ── onContextMenu ────────────────────────────────────────────────────────

  const onContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      // ① Stop propagation FIRST — prevents the browser default context menu
      //    AND parent scene handlers from receiving this event.
      e.stopPropagation();
      // Prevent the browser's native context menu from appearing over the canvas
      e.nativeEvent.preventDefault();

      if (!agent) return;

      // ② Emit typed intent
      const payload = buildAgentScopePayload(
        "context_menu",
        e.nativeEvent.clientX,
        e.nativeEvent.clientY,
        e.nativeEvent,
      );
      if (payload) emitIntent(payload);

      // ③ Side-effects: open the agent context menu portal at pointer position.
      //    Build menu entries from the agent's current state (room, status).
      //    Sub-AC 7a: pass agentStatus for status-aware lifecycle entries and
      //    availableRooms for the "Reassign to room" sub-list.
      const availableRooms = buildingRooms
        .filter((r) => r.roomId !== agent.roomId)
        .slice(0, MAX_ROOM_OPTIONS_IN_CONTEXT_MENU)
        .map((r) => ({ roomId: r.roomId, name: r.name }));

      const entries = buildAgentMenuEntries(agentId, {
        currentRoom:    agent.roomId,
        agentStatus:    agent.status,
        availableRooms,
      });

      openContextMenu(entries, e.nativeEvent.clientX, e.nativeEvent.clientY);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentId, agent, isSelected, isDrilled, sessionId, emitIntent, openContextMenu],
  );

  return { onPointerOver, onPointerOut, onClick, onContextMenu };
}
