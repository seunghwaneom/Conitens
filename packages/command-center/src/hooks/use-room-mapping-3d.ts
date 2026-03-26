/**
 * use-room-mapping-3d.ts — 3D scene hook for agent-to-room drag-assign.
 *
 * Sub-AC 3 (AC 12): Bridges the R3F pointer-event drag flow with the
 * room-mapping-store so that 3D drag-and-drop reassignments are:
 *   1. Immediately reflected in the 3D scene (via agent-store.moveAgent)
 *   2. Persisted in the runtime mapping config (via room-mapping-store actions)
 *   3. Optionally forwarded to the orchestrator (via ActionDispatcher)
 *
 * The hook manages three orthogonal assignment modes:
 *
 *   "individual"  — Moves only the specific agent instance (agent-store.moveAgent).
 *                   Does NOT change the role default — other agents with the same
 *                   role remain in their current rooms.
 *
 *   "role"        — Changes the default room for the dragged agent's role
 *                   (room-mapping-store.updateRoleMapping).  Future agents of the
 *                   same role will spawn in the new room.  Currently placed agents
 *                   of the same role are also moved via agent-store.moveAgent.
 *
 * Drag lifecycle (imperative API for R3F / Three.js pointer events):
 *   startDrag(agentId)            — Call on pointer-down on an agent drag handle.
 *   setHoverRoom(roomId | null)   — Call on pointer-enter / pointer-leave of rooms.
 *   endDrag(roomId, mode)         — Call on pointer-up over a room drop zone.
 *   cancelDrag()                  — Call on pointer-up with no target room.
 *
 * Record transparency:
 *   Every completed assignment appends to room-mapping-store.events (for role mode)
 *   and agent-store.events (for individual moves).  The full audit trail is
 *   accessible via the room-mapping-store snapshot and the scene event log.
 */

import { useState, useCallback, useRef } from "react";
import { useAgentStore }       from "../store/agent-store.js";
import { useRoomMappingStore } from "../store/room-mapping-store.js";
import { useSpatialStore }     from "../store/spatial-store.js";
import type { AgentRole }      from "../data/room-mapping-resolver.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** The scope of an assignment commit. */
export type AssignMode = "individual" | "role";

export interface UseRoomMapping3DReturn {
  /**
   * The agent currently being dragged, or null when no drag is in progress.
   * Scene components should read this to highlight valid drop targets and
   * dim non-target rooms.
   */
  draggingAgentId: string | null;

  /**
   * The room the pointer is currently hovering over during a drag, or null.
   * Use to show a "land here" glow ring on the candidate room.
   */
  hoverRoomId: string | null;

  /**
   * True while an async assignment commit is in flight.
   * Components can show a spinner on the agent avatar until resolved.
   */
  isPending: boolean;

  /**
   * Whether a drag is currently active (draggingAgentId !== null).
   * Convenience boolean for visibility guards.
   */
  isDragging: boolean;

  // ── Imperative drag lifecycle API ─────────────────────────────────────────

  /**
   * Begin a 3D pointer drag for an agent.
   * Call from an R3F mesh's `onPointerDown` handler.
   *
   * @param agentId   Agent whose drag handle was pressed.
   */
  startDrag: (agentId: string) => void;

  /**
   * Update the room the pointer is hovering over during a drag.
   * Call from onPointerEnter / onPointerLeave handlers on room volumes.
   *
   * @param roomId  The hovered room, or null when leaving without entering another.
   */
  setHoverRoom: (roomId: string | null) => void;

  /**
   * Commit a drag-assign to the target room.
   * Fires assignment actions and clears drag state.
   *
   * @param targetRoomId  The room the agent was dropped onto.
   * @param mode          "individual" — move only this agent;
   *                      "role"       — update the role default + move all role peers.
   */
  endDrag: (targetRoomId: string, mode?: AssignMode) => void;

  /**
   * Cancel an in-progress drag without making any assignment.
   * Call on pointer-up with no valid room target.
   */
  cancelDrag: () => void;

  // ── Form assign API (click-based alternative to drag) ─────────────────────

  /**
   * Assign an agent to a room via the form UI (no drag required).
   * Shares the same assignment logic as endDrag.
   *
   * @param agentId       The agent to reassign.
   * @param targetRoomId  The destination room.
   * @param mode          "individual" | "role".
   */
  formAssign: (agentId: string, targetRoomId: string, mode?: AssignMode) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * `useRoomMapping3D` — R3F drag-assign hook for the room mapping editor layer.
 *
 * Mount in `RoomMappingEditor3DLayer` (the top-level scene component) and
 * pass the returned handles down to `AgentDragHandle` and `RoomDropZone`
 * children via React context or props.
 *
 * @example
 * ```tsx
 * const rm3d = useRoomMapping3D();
 *
 * // In AgentDragHandle:
 * onPointerDown={() => rm3d.startDrag(agentId)}
 * onPointerUp={() => rm3d.cancelDrag()}   // fallback if no room hovered
 *
 * // In RoomDropZone:
 * onPointerEnter={() => rm3d.setHoverRoom(roomId)}
 * onPointerLeave={() => rm3d.setHoverRoom(null)}
 * onPointerUp={() => rm3d.endDrag(roomId, "individual")}
 * ```
 */
export function useRoomMapping3D(): UseRoomMapping3DReturn {
  const [draggingAgentId, setDraggingAgentId] = useState<string | null>(null);
  const [hoverRoomId,     setHoverRoomIdState] = useState<string | null>(null);
  const [isPending,       setIsPending]        = useState(false);

  // Ref so drag handlers never close over stale agentId
  const draggingRef = useRef<string | null>(null);

  // Store actions
  const moveAgent       = useAgentStore((s) => s.moveAgent);
  const agents          = useAgentStore((s) => s.agents);
  const updateRoleMap   = useRoomMappingStore((s) => s.updateRoleMapping);
  const highlightRoom   = useSpatialStore((s) => s.highlightRoom);
  const unhighlightRoom = useSpatialStore((s) => s.unhighlightRoom);

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Resolve the AgentRole for a given agentId.
   * Returns undefined for agents without a known role.
   */
  const resolveRole = useCallback(
    (agentId: string): AgentRole | undefined => {
      const agent = agents[agentId];
      const role = agent?.def?.role as AgentRole | undefined;
      return role;
    },
    [agents],
  );

  /**
   * Core assignment logic shared by endDrag and formAssign.
   * Performs the move(s) and returns a promise that resolves when done.
   */
  const commit = useCallback(
    (agentId: string, targetRoomId: string, mode: AssignMode): Promise<void> => {
      return new Promise<void>((resolve) => {
        try {
          if (mode === "individual") {
            // Move only this agent instance
            moveAgent(agentId, targetRoomId);
          } else {
            // "role" mode: update the role default AND move all role peers
            const role = resolveRole(agentId);
            if (role) {
              updateRoleMap(
                role,
                targetRoomId,
                `Drag-assigned role '${role}' → '${targetRoomId}'`,
              );
              // Move all agents with the same role
              Object.values(agents).forEach((a) => {
                if ((a.def?.role as AgentRole | undefined) === role) {
                  moveAgent(a.def.agentId, targetRoomId);
                }
              });
            } else {
              // Fallback: individual move if role unknown
              moveAgent(agentId, targetRoomId);
            }
          }
        } finally {
          resolve();
        }
      });
    },
    [moveAgent, agents, updateRoleMap, resolveRole],
  );

  // ── Drag lifecycle ────────────────────────────────────────────────────────

  const startDrag = useCallback((agentId: string) => {
    draggingRef.current = agentId;
    setDraggingAgentId(agentId);
    setHoverRoomIdState(null);
  }, []);

  const setHoverRoom = useCallback(
    (roomId: string | null) => {
      // Highlight / unhighlight in spatial store for 3D feedback
      if (roomId) {
        highlightRoom(roomId);
      } else if (hoverRoomId) {
        unhighlightRoom(hoverRoomId);
      }
      setHoverRoomIdState(roomId);
    },
    [hoverRoomId, highlightRoom, unhighlightRoom],
  );

  const endDrag = useCallback(
    (targetRoomId: string, mode: AssignMode = "individual") => {
      const agentId = draggingRef.current;

      // Clear drag state first (before async work, to avoid stale reads)
      draggingRef.current = null;
      setDraggingAgentId(null);

      // Unhighlight previously hovered room
      setHoverRoomIdState((prev) => {
        if (prev) unhighlightRoom(prev);
        return null;
      });

      if (!agentId || !targetRoomId) return;

      setIsPending(true);
      commit(agentId, targetRoomId, mode).finally(() => setIsPending(false));
    },
    [commit, unhighlightRoom],
  );

  const cancelDrag = useCallback(() => {
    draggingRef.current = null;
    setDraggingAgentId(null);
    setHoverRoomIdState((prev) => {
      if (prev) unhighlightRoom(prev);
      return null;
    });
  }, [unhighlightRoom]);

  const formAssign = useCallback(
    (agentId: string, targetRoomId: string, mode: AssignMode = "individual") => {
      setIsPending(true);
      commit(agentId, targetRoomId, mode).finally(() => setIsPending(false));
    },
    [commit],
  );

  return {
    draggingAgentId,
    hoverRoomId,
    isPending,
    isDragging: draggingAgentId !== null,
    startDrag,
    setHoverRoom,
    endDrag,
    cancelDrag,
    formAssign,
  };
}
