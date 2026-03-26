/**
 * use-room-interactivity.ts — Room layer interactivity hook.
 *
 * Sub-AC 4b: Room layer interactivity.
 *
 * Provides a unified API for all room-level interactions in the 3D command center:
 *
 *   selectRoom(id | null)      — select a room (gates RoomDetailPanel visibility)
 *   pauseRoomPipeline()        — pause room + write pipeline.cancel command
 *   resumeRoomPipeline()       — resume room + write pipeline.trigger command
 *   roomAgentsWithTasks        — agents in room enriched with active task summaries
 *   activeTasks                — only agents with active tasks
 *
 * Two-layer action model (record transparency principle)
 * ──────────────────────────────────────────────────────
 * Each lifecycle command (pause / resume) is a TWO-STEP operation:
 *
 *   Step 1 — Spatial store mutation (local, immediate, event-sourced):
 *     Calls pauseRoom / resumeRoom → appends room.paused / room.resumed event to
 *     the append-only spatial event log.  UI updates immediately.
 *
 *   Step 2 — Command file dispatch (async, fire-and-forget):
 *     Calls writeCommand("pipeline.cancel" | "pipeline.trigger") → POSTs a typed
 *     command file to the local Orchestrator API.  The Orchestrator picks it up,
 *     validates it, appends a ConitensEvent, and executes it.
 *
 * Command-file write failure is non-fatal: the spatial state is already updated
 * and the spatial event log preserves the audit trail regardless.
 *
 * Usage
 * ─────
 * ```tsx
 * function RoomDetailPanel() {
 *   const selectedRoomId = useSpatialStore(s => s.selectedRoomId);
 *   const {
 *     roomState, roomAgentsWithTasks, activeTasks,
 *     pauseRoomPipeline, resumeRoomPipeline,
 *   } = useRoomInteractivity(selectedRoomId);
 *   // ...
 * }
 * ```
 */

import { useCallback, useMemo } from "react";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";
import type { AgentRuntimeState } from "../store/agent-store.js";
import { useTaskStore } from "../store/task-store.js";
import type { TaskRecord } from "../store/task-store.js";
import { useCommandFileWriter } from "./use-command-file-writer.js";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * An agent assigned to a room, enriched with their active task summary.
 *
 * `task` is populated by querying the task store; it is null when the agent
 * has no assigned task or when the task store has not yet been seeded.
 */
export interface RoomAgentWithTask {
  /** Full agent runtime state from the agent store. */
  agent: AgentRuntimeState;
  /** Primary active task ID (null if no task assigned). */
  taskId: string | null;
  /** Human-readable task title (falls back to taskId if no title set). */
  taskTitle: string | null;
  /** Full task record from task store (null if unavailable). */
  task: TaskRecord | null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * `useRoomInteractivity` — unified room-layer interaction hook.
 *
 * Designed to be called from `RoomDetailPanel` and any other component that
 * needs to interact with a specific room.  Handles null roomId gracefully:
 * all derived arrays are empty and all action callbacks are no-ops.
 *
 * @param roomId  The room to interact with, or null.
 */
export function useRoomInteractivity(roomId: string | null) {
  // ── Store subscriptions ─────────────────────────────────────────────────

  const selectRoom   = useSpatialStore((s) => s.selectRoom);
  const pauseRoom    = useSpatialStore((s) => s.pauseRoom);
  const resumeRoom   = useSpatialStore((s) => s.resumeRoom);
  const focusRoom    = useSpatialStore((s) => s.focusRoom);
  const getRoomState = useSpatialStore((s) => s.getRoomState);

  const agents         = useAgentStore((s) => s.agents);
  const tasks          = useTaskStore((s) => s.tasks);
  const agentTaskIndex = useTaskStore((s) => s.agentTaskIndex);

  // Command file writer — provides typed writeCommand helper
  const { writeCommand } = useCommandFileWriter();

  // ── Derived data ────────────────────────────────────────────────────────

  /** Current runtime state for the room (null if no roomId). */
  const roomState = roomId ? getRoomState(roomId) : null;

  /**
   * Agents currently assigned to this room, sorted by spawnIndex so the
   * order is stable and matches the 3D scene render order.
   */
  const roomAgents: AgentRuntimeState[] = useMemo(
    () =>
      roomId
        ? Object.values(agents)
            .filter((a) => a.roomId === roomId)
            .sort((a, b) => a.spawnIndex - b.spawnIndex)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomId, agents],
  );

  /**
   * Agents enriched with their primary active task summary.
   *
   * Task lookup uses two complementary sources:
   *   1. `agent.currentTaskId`         — the live field set by startAgentTask
   *   2. `agentTaskIndex[agentId][0]`  — first task in the agent's task index
   *
   * Source (1) is authoritative; source (2) provides fallback coverage when
   * the agent store and task store are slightly out of sync.
   */
  const roomAgentsWithTasks: RoomAgentWithTask[] = useMemo(
    () =>
      roomAgents.map((agent) => {
        const agentId = agent.def.agentId;

        // Primary: agent store's current task
        const currentTaskId = agent.currentTaskId;
        // Fallback: first task from task store index
        const indexTaskIds = agentTaskIndex[agentId] ?? [];
        const primaryTaskId = currentTaskId ?? indexTaskIds[0] ?? null;

        const task = primaryTaskId ? (tasks[primaryTaskId] ?? null) : null;
        const taskTitle =
          agent.currentTaskTitle ?? task?.title ?? primaryTaskId;

        return {
          agent,
          taskId: primaryTaskId,
          taskTitle,
          task,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomAgents, tasks, agentTaskIndex],
  );

  /**
   * Subset of roomAgentsWithTasks that have an active task assigned.
   * Used by the side panel "ACTIVE TASKS" section.
   */
  const activeTasks = useMemo(
    () => roomAgentsWithTasks.filter((a) => a.taskId !== null),
    [roomAgentsWithTasks],
  );

  // ── Actions ────────────────────────────────────────────────────────────

  /**
   * Select a room — updates selectedRoomId in spatial store (shows detail panel).
   * Pass null to deselect.
   */
  const handleSelectRoom = useCallback(
    (id: string | null) => {
      selectRoom(id);
    },
    [selectRoom],
  );

  /**
   * Focus camera on a room.
   * Pass null to remove focus.
   */
  const handleFocusRoom = useCallback(
    (id: string | null) => {
      focusRoom(id);
    },
    [focusRoom],
  );

  /**
   * Pause a room's pipeline (Sub-AC 4b).
   *
   * Two-layer action:
   *   1. Updates spatial-store immediately (room.paused=true, room.paused event)
   *   2. Dispatches `pipeline.cancel` command file to cancel all active pipelines
   *
   * Idempotent: if room is already paused, the spatial-store action is a no-op
   * (spatial-store.pauseRoom is idempotent) and the command is still sent to
   * ensure the Orchestrator is in sync.
   */
  const pauseRoomPipeline = useCallback(
    async () => {
      if (!roomId) return;

      // Step 1: local state (event-sourced)
      pauseRoom(roomId);

      // Step 2: command file (async, fire-and-forget)
      try {
        await writeCommand("pipeline.cancel", {
          pipeline_id: "*",
          reason: `room-pause:${roomId}`,
        });
      } catch {
        // Non-fatal: spatial state already updated; command write failure is logged
        // by useCommandFileWriter's internal error state
      }
    },
    [roomId, pauseRoom, writeCommand],
  );

  /**
   * Resume a paused room's pipeline (Sub-AC 4b).
   *
   * Two-layer action:
   *   1. Updates spatial-store immediately (room.paused=false, room.resumed event)
   *   2. Dispatches `pipeline.trigger` command to restart room operations
   *
   * Idempotent: spatial-store.resumeRoom is already a no-op if not paused.
   */
  const resumeRoomPipeline = useCallback(
    async () => {
      if (!roomId) return;

      // Step 1: local state (event-sourced)
      resumeRoom(roomId);

      // Step 2: command file (async, fire-and-forget)
      try {
        await writeCommand("pipeline.trigger", {
          pipeline_name: "room-resume",
          room_id: roomId,
          label: `Resume room ${roomId}`,
        });
      } catch {
        // Non-fatal: spatial state already updated
      }
    },
    [roomId, resumeRoom, writeCommand],
  );

  // ── Return ──────────────────────────────────────────────────────────────

  return {
    /** Current room ID being interacted with (null = nothing selected). */
    roomId,

    /** Runtime state for this room (paused, activity, members, etc.). */
    roomState,

    /** Agents in this room, sorted by spawnIndex. */
    roomAgents,

    /** Agents enriched with active task summaries from the task store. */
    roomAgentsWithTasks,

    /** Only agents that have an active task assigned. */
    activeTasks,

    /** Select / deselect a room (gates RoomDetailPanel). */
    selectRoom: handleSelectRoom,

    /** Focus camera on a room. */
    focusRoom: handleFocusRoom,

    /** Pause this room's pipeline (local state + command file). */
    pauseRoomPipeline,

    /** Resume this room's pipeline (local state + command file). */
    resumeRoomPipeline,
  };
}
