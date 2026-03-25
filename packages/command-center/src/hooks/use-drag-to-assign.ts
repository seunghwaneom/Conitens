/**
 * use-drag-to-assign.ts — Drag-and-drop serializer for agent-to-room assignment.
 *
 * Sub-AC 8b: Serialize drag events into `agent.assign` command files.
 *
 * This hook provides two complementary sets of event handlers:
 *
 *  1. `getDragHandlers(agentId)` — for the draggable agent element (or avatar).
 *     Call on the agent's container element / badge.
 *
 *  2. `getDropHandlers(roomId)` — for each room drop-zone.
 *     Call on the room card, floor plan cell, or any droppable surface.
 *
 * How it works
 * ────────────
 * HTML5 drag-and-drop API:
 *   dragstart  → store agentId in dataTransfer + set dragState
 *   dragover   → allow drop (preventDefault) + highlight target room
 *   drop       → call handleDragAssign(agentId, targetRoomId) on the dispatcher
 *   dragend    → clear drag state + unhighlight all rooms
 *
 * The dragged agentId travels in `dataTransfer.getData("text/x-agent-id")` so
 * it survives across nested DOM elements without closure capture issues.
 *
 * R3F / Three.js note
 * ───────────────────
 * For 3D drag (pointer events on meshes), the scene component should call
 * `startDrag(agentId)` on pointer-down and `endDrag(targetRoomId)` on
 * pointer-up over a room mesh.  The hook exposes these imperative APIs for
 * use in R3F components where dataTransfer is unavailable.
 *
 * Record transparency
 * ────────────────────
 * Every completed drag-and-drop fires `handleDragAssign` on the
 * `ActionDispatcher`, which serializes an `agent.assign` command file and
 * POSTs it to the Orchestrator endpoint.
 */

import {
  useState,
  useCallback,
  useRef,
  type DragEvent,
} from "react";
import { useActionDispatcher } from "./use-action-dispatcher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** dataTransfer MIME type used to carry the agentId across drag events. */
const AGENT_ID_MIME = "text/x-agent-id";

/** CSS class added to a room during dragover to indicate it's a valid drop target. */
export const DRAG_OVER_CLASS = "drag-over-target";

// ─────────────────────────────────────────────────────────────────────────────
// Return type
// ─────────────────────────────────────────────────────────────────────────────

export interface DragHandlers {
  draggable:    true;
  onDragStart:  (e: DragEvent<HTMLElement>) => void;
  onDragEnd:    (e: DragEvent<HTMLElement>) => void;
}

export interface DropHandlers {
  onDragOver:  (e: DragEvent<HTMLElement>) => void;
  onDragEnter: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: (e: DragEvent<HTMLElement>) => void;
  onDrop:      (e: DragEvent<HTMLElement>) => void;
}

export interface DragToAssignReturn {
  /**
   * Currently dragged agent id, or null when no drag is active.
   * Components can read this to dim non-target rooms.
   */
  draggingAgentId: string | null;

  /**
   * Currently hovered drop-zone room id, or null.
   * Components can use this to show a highlight ring on the target room.
   */
  hoverRoomId: string | null;

  /**
   * Whether a drag-assign is pending (optimistic update in flight).
   * Useful for showing a spinner on the agent avatar until the server ACKs.
   */
  isPending: boolean;

  /**
   * Return drag event handlers for a draggable agent element.
   *
   * @param agentId  The agent this element represents.
   * @example
   * ```tsx
   * <div {...getDragHandlers("researcher-1")}>Researcher-1</div>
   * ```
   */
  getDragHandlers: (agentId: string) => DragHandlers;

  /**
   * Return drop event handlers for a droppable room element.
   *
   * @param roomId  The room this element represents.
   * @example
   * ```tsx
   * <div {...getDropHandlers("lab")}>Lab Room</div>
   * ```
   */
  getDropHandlers: (roomId: string) => DropHandlers;

  // ── Imperative API for R3F / Three.js pointer events ───────────────────────

  /**
   * Imperatively start a drag from a 3D pointer-down event.
   * Call from an R3F mesh's `onPointerDown` handler.
   */
  startDrag: (agentId: string) => void;

  /**
   * Imperatively end a drag on a target room from a 3D pointer-up event.
   * Call from an R3F mesh's `onPointerUp` handler.
   *
   * @param targetRoomId  The room that was under the pointer on release.
   *                      Pass null to cancel the drag without assigning.
   */
  endDrag: (targetRoomId: string | null) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `useDragToAssign` — drag-and-drop serializer for agent-to-room assignment.
 *
 * Mount this in a component that renders both agent badges and room drop-zones.
 * Use `getDragHandlers` on agent elements and `getDropHandlers` on room elements.
 *
 * @example
 * ```tsx
 * const { getDragHandlers, getDropHandlers, draggingAgentId } = useDragToAssign();
 *
 * <div {...getDragHandlers("manager-1")} className="agent-badge">Manager-1</div>
 * <div {...getDropHandlers("lab")} className={draggingAgentId ? "drop-zone active" : "drop-zone"}>
 *   Lab
 * </div>
 * ```
 */
export function useDragToAssign(): DragToAssignReturn {
  const dispatcher = useActionDispatcher();

  const [draggingAgentId, setDraggingAgentId] = useState<string | null>(null);
  const [hoverRoomId,     setHoverRoomId]     = useState<string | null>(null);
  const [isPending,       setIsPending]       = useState(false);

  // Ref to track dragging agent in dragover/drop handlers without stale closure
  const draggingRef = useRef<string | null>(null);

  // ── HTML5 drag handlers for agent elements ─────────────────────────────────

  const getDragHandlers = useCallback(
    (agentId: string): DragHandlers => ({
      draggable: true,

      onDragStart: (e: DragEvent<HTMLElement>) => {
        e.dataTransfer.setData(AGENT_ID_MIME, agentId);
        e.dataTransfer.effectAllowed = "move";

        // Optional: ghost image (browser default is fine)
        draggingRef.current = agentId;
        setDraggingAgentId(agentId);
      },

      onDragEnd: (_e: DragEvent<HTMLElement>) => {
        draggingRef.current = null;
        setDraggingAgentId(null);
        setHoverRoomId(null);
      },
    }),
    [],
  );

  // ── HTML5 drop handlers for room elements ──────────────────────────────────

  const getDropHandlers = useCallback(
    (roomId: string): DropHandlers => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        // Check that we're carrying an agent id
        if (!e.dataTransfer.types.includes(AGENT_ID_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },

      onDragEnter: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(AGENT_ID_MIME)) return;
        e.preventDefault();
        setHoverRoomId(roomId);
        (e.currentTarget as HTMLElement).classList.add(DRAG_OVER_CLASS);
      },

      onDragLeave: (e: DragEvent<HTMLElement>) => {
        // Only clear if leaving the actual target (not a child)
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setHoverRoomId((prev) => (prev === roomId ? null : prev));
        (e.currentTarget as HTMLElement).classList.remove(DRAG_OVER_CLASS);
      },

      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove(DRAG_OVER_CLASS);

        const agentId =
          e.dataTransfer.getData(AGENT_ID_MIME) || draggingRef.current;

        if (!agentId) return;

        draggingRef.current = null;
        setDraggingAgentId(null);
        setHoverRoomId(null);
        setIsPending(true);

        dispatcher
          .handleDragAssign(agentId, roomId)
          .finally(() => setIsPending(false));
      },
    }),
    [dispatcher],
  );

  // ── Imperative API for R3F ─────────────────────────────────────────────────

  const startDrag = useCallback((agentId: string) => {
    draggingRef.current = agentId;
    setDraggingAgentId(agentId);
  }, []);

  const endDrag = useCallback(
    (targetRoomId: string | null) => {
      const agentId = draggingRef.current;
      draggingRef.current = null;
      setDraggingAgentId(null);
      setHoverRoomId(null);

      if (!agentId || !targetRoomId) return;

      setIsPending(true);
      dispatcher
        .handleDragAssign(agentId, targetRoomId)
        .finally(() => setIsPending(false));
    },
    [dispatcher],
  );

  return {
    draggingAgentId,
    hoverRoomId,
    isPending,
    getDragHandlers,
    getDropHandlers,
    startDrag,
    endDrag,
  };
}
