/**
 * use-action-dispatcher.ts — GUI-side action dispatcher.
 *
 * Sub-AC 8b: Serialize user interactions into correctly-formatted command files
 * and write them to the designated watch directory.
 *
 * This hook bridges raw user gestures (button clicks, drag events, context-menu
 * selections) into typed command files via `useCommandFileWriter`.  Every action
 * that reaches the Orchestrator is fully event-sourced and appears in the event
 * log for replay fidelity.
 *
 * Architecture
 * ────────────
 * UI interaction  →  handleXAction()  →  optimistic store update
 *                                    →  writeCommand() → POST /api/commands
 *                                    →  error → revert + setError
 *
 * Optimistic updates
 * ──────────────────
 * Agent and room state changes are applied immediately to the local Zustand
 * stores so the 3D scene responds without waiting for the Orchestrator round-
 * trip.  If the HTTP request fails, the update is rolled back to the previous
 * state and an error flag is set on the action entry.
 *
 * Pending state
 * ─────────────
 * `pendingActions` is a Map<entityKey, Set<actionType>> where `entityKey` is
 * "<kind>:<id>" (e.g. "agent:researcher-1").  Components can read this map to
 * show loading spinners or disabled states on individual entity buttons.
 *
 * Record transparency
 * ────────────────────
 * Every action that changes server-side state produces a command file via
 * `useCommandFileWriter`.  Navigation-only actions (drill, camera) are also
 * written for replay fidelity even though they have no Orchestrator side-effect.
 */

import {
  useState,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import {
  useCommandFileWriter,
  type WriteCommandOptions,
} from "./use-command-file-writer.js";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useTaskStore } from "../store/task-store.js";
import type { TaskPriority } from "../data/task-types.js";
import type {
  AgentSpawnCommandPayload,
  AgentTerminateCommandPayload,
  AgentRestartCommandPayload,
  AgentPauseCommandPayload,
  AgentResumeCommandPayload,
  AgentAssignCommandPayload,
  AgentSendCommandPayload,
  TaskCreateCommandPayload,
  TaskAssignCommandPayload,
  TaskCancelCommandPayload,
  TaskUpdateSpecCommandPayload,
  MeetingConveneCommandPayload,
  NavDrillDownCommandPayload,
  NavCameraPresetCommandPayload,
  ConfigRoomMappingCommandPayload,
} from "@conitens/protocol";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert protocol numeric priority (1–5) to local TaskPriority string.
 *   1 → "low", 2 → "normal", 3 → "high", 4 | 5 → "critical"
 * Defaults to "normal" for unknown values.
 * Used for Sub-AC 7b optimistic store mutations when handling task.update_spec.
 */
function protoNumToPriority(num: number | undefined): TaskPriority {
  switch (num) {
    case 1:  return "low";
    case 2:  return "normal";
    case 3:  return "high";
    case 4:
    case 5:  return "critical";
    default: return "normal";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action type enumerations
// ─────────────────────────────────────────────────────────────────────────────

/** All actions that can be triggered on an agent entity. */
export type AgentActionType =
  | "spawn"
  | "terminate"
  | "restart"
  | "pause"
  | "resume"
  | "assign"
  | "send_command"
  | "select"
  | "drill_into";

/** All actions that can be triggered on a room entity. */
export type RoomActionType =
  | "select"
  | "focus"
  | "pause"
  | "resume"
  | "drill_into"
  | "convene_meeting";

/** All actions that can be triggered on a task entity. */
export type TaskActionType =
  | "create"
  | "assign"
  | "cancel"
  | "update_spec"
  | "select";

// ─────────────────────────────────────────────────────────────────────────────
// Context menu item shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentContextMenuItem {
  entityType: "agent";
  entityId: string;
  action: AgentActionType;
  /** Extra payload passed through to the command (e.g. target room for assign). */
  meta?: Record<string, unknown>;
}

export interface RoomContextMenuItem {
  entityType: "room";
  entityId: string;
  action: RoomActionType;
  meta?: Record<string, unknown>;
}

export interface TaskContextMenuItem {
  entityType: "task";
  entityId: string;
  action: TaskActionType;
  meta?: Record<string, unknown>;
}

export type ContextMenuItem =
  | AgentContextMenuItem
  | RoomContextMenuItem
  | TaskContextMenuItem;

// ─────────────────────────────────────────────────────────────────────────────
// Error feedback
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionError {
  entityKey: string;
  action: string;
  message: string;
  ts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher return type
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionDispatcher {
  // ── Pending state ──────────────────────────────────────────────────────────
  /**
   * Map of "<kind>:<id>" → Set of pending action types.
   * Components read this to show per-entity loading states.
   */
  pendingActions: ReadonlyMap<string, ReadonlySet<string>>;

  /** Most recent action errors (newest first, max 20). */
  actionErrors: readonly ActionError[];

  /** Clear all errors. */
  clearErrors: () => void;

  // ── Agent actions ──────────────────────────────────────────────────────────

  /**
   * Dispatch an agent lifecycle action triggered by a button click.
   * Applies an optimistic store update immediately; posts the command
   * file to the Orchestrator asynchronously.
   */
  handleAgentAction: (
    agentId: string,
    action: AgentActionType,
    payload?: Partial<
      AgentSpawnCommandPayload &
        AgentTerminateCommandPayload &
        AgentRestartCommandPayload &
        AgentPauseCommandPayload &
        AgentResumeCommandPayload &
        AgentAssignCommandPayload &
        AgentSendCommandPayload
    >,
    opts?: WriteCommandOptions,
  ) => Promise<void>;

  // ── Room actions ───────────────────────────────────────────────────────────

  /** Dispatch a room-level action. */
  handleRoomAction: (
    roomId: string,
    action: RoomActionType,
    payload?: Partial<MeetingConveneCommandPayload>,
    opts?: WriteCommandOptions,
  ) => Promise<void>;

  // ── Task actions ───────────────────────────────────────────────────────────

  /** Dispatch a task management action. */
  handleTaskAction: (
    taskId: string,
    action: TaskActionType,
    payload?: Partial<
      TaskCreateCommandPayload &
        TaskAssignCommandPayload &
        TaskCancelCommandPayload &
        TaskUpdateSpecCommandPayload
    >,
    opts?: WriteCommandOptions,
  ) => Promise<void>;

  // ── Drag-to-assign ─────────────────────────────────────────────────────────

  /**
   * Called when an agent avatar is dragged and dropped onto a room target.
   * Serializes the interaction to an `agent.assign` command file.
   *
   * @param agentId      The agent being dragged.
   * @param targetRoomId The room the agent was dropped into.
   */
  handleDragAssign: (agentId: string, targetRoomId: string) => Promise<void>;

  // ── Context menu ───────────────────────────────────────────────────────────

  /** Execute the action represented by a context menu item. */
  handleContextMenuAction: (item: ContextMenuItem) => Promise<void>;

  // ── Navigation shorthands ──────────────────────────────────────────────────

  handleDrillDown: (payload: NavDrillDownCommandPayload) => Promise<void>;
  handleDrillUp:   (steps?: number) => Promise<void>;
  handleCameraPreset: (preset: NavCameraPresetCommandPayload["preset"]) => Promise<void>;

  // ── Config shorthands ─────────────────────────────────────────────────────

  handleUpdateRoomMapping: (payload: ConfigRoomMappingCommandPayload) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// React context
// ─────────────────────────────────────────────────────────────────────────────

/** Context that shares the dispatcher throughout the component tree. */
export const ActionDispatcherContext = createContext<ActionDispatcher | null>(
  null,
);

/**
 * Consume the `ActionDispatcher` context.
 * Must be used inside `<ActionDispatcherProvider>`.
 */
export function useActionDispatcher(): ActionDispatcher {
  const ctx = useContext(ActionDispatcherContext);
  if (!ctx) {
    throw new Error(
      "useActionDispatcher() must be called inside <ActionDispatcherProvider>.",
    );
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Max action errors retained in local state. */
const MAX_ERRORS = 20;

/** Build an entity key used as Map key. */
function entityKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `useActionDispatcherImpl` — internal implementation.
 *
 * Mount once in `ActionDispatcherProvider` and distribute via
 * `ActionDispatcherContext`.  Never call this hook directly in leaf components
 * — use `useActionDispatcher()` instead.
 */
export function useActionDispatcherImpl(): ActionDispatcher {
  const cmdWriter = useCommandFileWriter();

  // Destructure store selectors
  const agentStore   = useAgentStore;
  const spatialStore = useSpatialStore;

  // Pending actions — mutable ref to avoid re-renders on every tick
  const pendingRef = useRef<Map<string, Set<string>>>(new Map());
  // Trigger a re-render when pending state changes
  const [, forceRender] = useState(0);

  const [actionErrors, setActionErrors] = useState<ActionError[]>([]);

  // ── Pending helpers ──────────────────────────────────────────────────────

  const addPending = useCallback((kind: string, id: string, action: string) => {
    const key = entityKey(kind, id);
    const existing = pendingRef.current.get(key) ?? new Set<string>();
    existing.add(action);
    pendingRef.current.set(key, existing);
    forceRender((n) => n + 1);
  }, []);

  const removePending = useCallback(
    (kind: string, id: string, action: string) => {
      const key = entityKey(kind, id);
      const existing = pendingRef.current.get(key);
      if (existing) {
        existing.delete(action);
        if (existing.size === 0) pendingRef.current.delete(key);
      }
      forceRender((n) => n + 1);
    },
    [],
  );

  const recordError = useCallback(
    (kind: string, id: string, action: string, message: string) => {
      setActionErrors((prev) =>
        [
          { entityKey: entityKey(kind, id), action, message, ts: Date.now() },
          ...prev,
        ].slice(0, MAX_ERRORS),
      );
    },
    [],
  );

  const clearErrors = useCallback(() => setActionErrors([]), []);

  // ── Agent action handler ─────────────────────────────────────────────────

  const handleAgentAction = useCallback(
    async (
      agentId: string,
      action: AgentActionType,
      payload?: Record<string, unknown>,
      opts?: WriteCommandOptions,
    ): Promise<void> => {
      const store = agentStore.getState();

      // Local-only actions — do not produce command files
      if (action === "select") {
        store.selectAgent(agentId);
        return;
      }

      if (action === "drill_into") {
        const agent = store.getAgent(agentId);
        const pos = agent?.worldPosition ?? { x: 0, y: 0, z: 0 };
        spatialStore.getState().drillIntoAgent(agentId, pos);
        // Also write a nav command for replay fidelity
        await cmdWriter.drillDown({ level: "agent", target_id: agentId }, opts).catch(
          () => undefined,
        );
        return;
      }

      addPending("agent", agentId, action);

      try {
        switch (action) {
          case "spawn": {
            const p = payload as Partial<AgentSpawnCommandPayload>;
            // Optimistic: mark the agent as idle if it exists
            if (store.getAgent(agentId)) {
              store.changeAgentStatus(agentId, "idle");
            }
            await cmdWriter.spawnAgent(
              {
                agent_id: agentId,
                persona: p?.persona ?? "implementer",
                room_id: p?.room_id ?? "default",
                display_name: p?.display_name,
                session_name: p?.session_name,
                env: p?.env,
              },
              opts,
            );
            break;
          }

          case "terminate": {
            const p = payload as Partial<AgentTerminateCommandPayload>;
            // Optimistic: mark as terminated locally
            const prev = store.getAgent(agentId)?.status;
            store.changeAgentStatus(agentId, "terminated");
            try {
              await cmdWriter.terminateAgent(
                {
                  agent_id: agentId,
                  reason: p?.reason ?? "user_requested",
                  force: p?.force,
                },
                opts,
              );
            } catch (err) {
              // Rollback
              if (prev) store.changeAgentStatus(agentId, prev);
              throw err;
            }
            break;
          }

          case "restart": {
            const p = payload as Partial<AgentRestartCommandPayload>;
            const prev = store.getAgent(agentId)?.status;
            store.changeAgentStatus(agentId, "idle");
            try {
              await cmdWriter.restartAgent(
                { agent_id: agentId, clear_context: p?.clear_context },
                opts,
              );
            } catch (err) {
              if (prev) store.changeAgentStatus(agentId, prev);
              throw err;
            }
            break;
          }

          case "pause": {
            const p = payload as Partial<AgentPauseCommandPayload>;
            const prev = store.getAgent(agentId)?.status;
            store.changeAgentStatus(agentId, "idle");
            try {
              await cmdWriter.pauseAgent(
                { agent_id: agentId, reason: p?.reason },
                opts,
              );
            } catch (err) {
              if (prev) store.changeAgentStatus(agentId, prev);
              throw err;
            }
            break;
          }

          case "resume": {
            const prev = store.getAgent(agentId)?.status;
            store.changeAgentStatus(agentId, "active");
            try {
              await cmdWriter.resumeAgent({ agent_id: agentId }, opts);
            } catch (err) {
              if (prev) store.changeAgentStatus(agentId, prev);
              throw err;
            }
            break;
          }

          case "assign": {
            const p = payload as Partial<AgentAssignCommandPayload>;
            if (!p?.room_id) {
              console.warn("[ActionDispatcher] assign action requires room_id");
              return;
            }
            const prevRoom = store.getAgent(agentId)?.roomId;
            store.moveAgent(agentId, p.room_id);
            try {
              await cmdWriter.assignAgent(
                { agent_id: agentId, room_id: p.room_id, role: p.role },
                opts,
              );
            } catch (err) {
              // Rollback to previous room
              if (prevRoom) store.moveAgent(agentId, prevRoom);
              throw err;
            }
            break;
          }

          case "send_command": {
            const p = payload as Partial<AgentSendCommandPayload>;
            if (!p?.instruction) {
              console.warn(
                "[ActionDispatcher] send_command action requires instruction",
              );
              return;
            }
            // Optimistic: agent store already has sendAgentCommand
            store.sendAgentCommand(agentId, p.instruction);
            await cmdWriter.sendAgentCommand(
              {
                agent_id: agentId,
                instruction: p.instruction,
                task_id: p.task_id,
              },
              opts,
            );
            break;
          }

          default:
            console.warn("[ActionDispatcher] Unknown agent action:", action);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        recordError("agent", agentId, action, msg);
        console.warn(`[ActionDispatcher] agent ${action} failed:`, msg);
      } finally {
        removePending("agent", agentId, action);
      }
    },
    [cmdWriter, agentStore, spatialStore, addPending, removePending, recordError],
  );

  // ── Room action handler ──────────────────────────────────────────────────

  const handleRoomAction = useCallback(
    async (
      roomId: string,
      action: RoomActionType,
      payload?: Partial<MeetingConveneCommandPayload>,
      opts?: WriteCommandOptions,
    ): Promise<void> => {
      const spatial = spatialStore.getState();

      // Local-only actions
      if (action === "select") {
        spatial.selectRoom(roomId);
        return;
      }
      if (action === "focus") {
        spatial.focusRoom(roomId);
        return;
      }
      if (action === "drill_into") {
        spatial.drillIntoRoom(roomId);
        await cmdWriter
          .drillDown({ level: "room", target_id: roomId }, opts)
          .catch(() => undefined);
        return;
      }

      addPending("room", roomId, action);

      try {
        switch (action) {
          case "pause": {
            spatial.pauseRoom(roomId);
            // Room pause is currently local-only (no Orchestrator command for room pause)
            // Writing a config.building_layout command to record the state change
            await cmdWriter.writeCommand(
              "config.building_layout",
              {
                layout: { roomStates: { [roomId]: { paused: true } } },
                label: `pause-room-${roomId}`,
              },
              opts,
            );
            break;
          }

          case "resume": {
            spatial.resumeRoom(roomId);
            await cmdWriter.writeCommand(
              "config.building_layout",
              {
                layout: { roomStates: { [roomId]: { paused: false } } },
                label: `resume-room-${roomId}`,
              },
              opts,
            );
            break;
          }

          case "convene_meeting": {
            if (!payload?.topic || !payload?.participant_ids?.length) {
              console.warn(
                "[ActionDispatcher] convene_meeting requires topic and participant_ids",
              );
              return;
            }
            await cmdWriter.conveneMeeting(
              {
                room_id: roomId,
                topic: payload.topic,
                agenda: payload.agenda,
                participant_ids: payload.participant_ids,
                scheduled_duration_ms: payload.scheduled_duration_ms,
                requested_by: payload.requested_by ?? "gui",
              },
              opts,
            );
            break;
          }

          default:
            console.warn("[ActionDispatcher] Unknown room action:", action);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        recordError("room", roomId, action, msg);
        console.warn(`[ActionDispatcher] room ${action} failed:`, msg);
      } finally {
        removePending("room", roomId, action);
      }
    },
    [cmdWriter, spatialStore, addPending, removePending, recordError],
  );

  // ── Task action handler ──────────────────────────────────────────────────

  const handleTaskAction = useCallback(
    async (
      taskId: string,
      action: TaskActionType,
      payload?: Record<string, unknown>,
      opts?: WriteCommandOptions,
    ): Promise<void> => {
      // Local-only actions — no command file needed
      if (action === "select") {
        // Task selection is UI-only; no store action defined yet — no-op
        return;
      }

      addPending("task", taskId, action);

      try {
        switch (action) {
          case "create": {
            const p = payload as Partial<TaskCreateCommandPayload>;

            // Sub-AC 7b: optimistic store mutation — task appears in UI immediately.
            // Note: TaskManagementPanel.tsx also calls createTask() as its own
            // optimistic update; the second call is a no-op if taskId matches
            // (same taskId → same record, idempotent title/priority overwrite).
            // If called directly (not via panel), insert now.
            const existingTask = useTaskStore.getState().getTask(taskId);
            if (!existingTask) {
              useTaskStore.getState().createTask({
                title:           p?.title ?? taskId,
                description:     p?.description ?? undefined,
                priority:        protoNumToPriority(p?.priority),
                assignedAgentId: p?.assigned_to ?? undefined,
                tags:            Array.isArray(p?.metadata?.["tags"])
                  ? (p.metadata["tags"] as string[])
                  : [],
              });
            }

            await cmdWriter.createTask(
              {
                task_id:     taskId,
                title:       p?.title ?? taskId,
                description: p?.description,
                assigned_to: p?.assigned_to,
                priority:    p?.priority,
                due_by:      p?.due_by,
                metadata:    p?.metadata,
              },
              opts,
            );
            break;
          }

          case "assign": {
            const p = payload as Partial<TaskAssignCommandPayload>;
            if (!p?.agent_id) {
              console.warn(
                "[ActionDispatcher] task assign requires agent_id",
              );
              return;
            }

            // Sub-AC 7b: optimistic assignment
            useTaskStore.getState().assignTask(taskId, p.agent_id);

            try {
              await cmdWriter.assignTask(
                {
                  task_id:  taskId,
                  agent_id: p.agent_id,
                  reassign: p.reassign ?? true,
                },
                opts,
              );
            } catch (err) {
              // Rollback: unassign
              useTaskStore.getState().unassignTask(taskId);
              throw err;
            }
            break;
          }

          case "cancel": {
            const p = payload as Partial<TaskCancelCommandPayload>;

            // Sub-AC 7b: optimistic cancellation.
            // The TaskManagementPanel.tsx may have already applied this, which
            // is fine — transitionTask() is guarded by canTaskTransition().
            const taskBeforeCancel = useTaskStore.getState().getTask(taskId);
            useTaskStore.getState().transitionTask(taskId, "cancelled");

            try {
              await cmdWriter.cancelTask(
                { task_id: taskId, reason: p?.reason },
                opts,
              );
            } catch (err) {
              // Rollback: restore previous status if cancellation fails
              if (taskBeforeCancel) {
                // Can't undo a task transition directly — log the discrepancy
                console.warn(
                  `[ActionDispatcher] Cancel command failed for ${taskId}; ` +
                  `store already marked cancelled. Orchestrator may disagree.`,
                );
              }
              throw err;
            }
            break;
          }

          case "update_spec": {
            const p = payload as Partial<TaskUpdateSpecCommandPayload>;

            // Sub-AC 7b: optimistic priority update.
            // The TaskManagementPanel.tsx may have already applied this.
            if (p?.priority !== undefined) {
              const localPriority = protoNumToPriority(p.priority);
              useTaskStore.getState().setTaskPriority(taskId, localPriority);
            }
            if (p?.title !== undefined) {
              useTaskStore.getState().updateTaskTitle(
                taskId,
                p.title,
                p?.description ?? undefined,
              );
            }

            await cmdWriter.writeCommand(
              "task.update_spec",
              {
                task_id:     taskId,
                title:       p?.title,
                description: p?.description,
                priority:    p?.priority,
                due_by:      p?.due_by,
                metadata:    p?.metadata,
              },
              opts,
            );
            break;
          }

          default:
            console.warn("[ActionDispatcher] Unknown task action:", action);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        recordError("task", taskId, action, msg);
        console.warn(`[ActionDispatcher] task ${action} failed:`, msg);
      } finally {
        removePending("task", taskId, action);
      }
    },
    [cmdWriter, addPending, removePending, recordError],
  );

  // ── Drag-to-assign ───────────────────────────────────────────────────────

  const handleDragAssign = useCallback(
    async (agentId: string, targetRoomId: string): Promise<void> => {
      const store = agentStore.getState();
      const agent = store.getAgent(agentId);
      if (!agent) return;
      if (agent.roomId === targetRoomId) return; // No-op if same room

      addPending("agent", agentId, "assign");

      const prevRoom = agent.roomId;
      // Optimistic update
      store.moveAgent(agentId, targetRoomId);

      try {
        await cmdWriter.assignAgent(
          { agent_id: agentId, room_id: targetRoomId },
          {
            causation_id: `drag-assign-${Date.now()}`,
          },
        );
      } catch (err) {
        // Rollback
        store.moveAgent(agentId, prevRoom);
        const msg = err instanceof Error ? err.message : "Drag-assign failed";
        recordError("agent", agentId, "assign", msg);
        console.warn("[ActionDispatcher] Drag-assign failed:", msg);
      } finally {
        removePending("agent", agentId, "assign");
      }
    },
    [cmdWriter, agentStore, addPending, removePending, recordError],
  );

  // ── Context menu action handler ──────────────────────────────────────────

  const handleContextMenuAction = useCallback(
    async (item: ContextMenuItem): Promise<void> => {
      if (item.entityType === "agent") {
        await handleAgentAction(
          item.entityId,
          item.action,
          item.meta as Record<string, unknown> | undefined,
        );
      } else if (item.entityType === "room") {
        await handleRoomAction(
          item.entityId,
          item.action,
          item.meta as Partial<MeetingConveneCommandPayload> | undefined,
        );
      } else if (item.entityType === "task") {
        await handleTaskAction(
          item.entityId,
          item.action,
          item.meta as Record<string, unknown> | undefined,
        );
      }
    },
    [handleAgentAction, handleRoomAction, handleTaskAction],
  );

  // ── Navigation helpers ───────────────────────────────────────────────────

  const handleDrillDown = useCallback(
    (payload: NavDrillDownCommandPayload) =>
      cmdWriter.drillDown(payload).catch(() => undefined),
    [cmdWriter],
  );

  const handleDrillUp = useCallback(
    (steps = 1) =>
      cmdWriter.drillUp({ steps }).catch(() => undefined),
    [cmdWriter],
  );

  const handleCameraPreset = useCallback(
    (preset: NavCameraPresetCommandPayload["preset"]) =>
      cmdWriter.setCameraPreset({ preset }).catch(() => undefined),
    [cmdWriter],
  );

  // ── Config helpers ───────────────────────────────────────────────────────

  const handleUpdateRoomMapping = useCallback(
    (payload: ConfigRoomMappingCommandPayload) =>
      cmdWriter.updateRoomMapping(payload).catch((err) => {
        console.warn("[ActionDispatcher] updateRoomMapping failed:", err);
      }),
    [cmdWriter],
  );

  return {
    pendingActions: pendingRef.current,
    actionErrors,
    clearErrors,
    handleAgentAction,
    handleRoomAction,
    handleTaskAction,
    handleDragAssign,
    handleContextMenuAction,
    handleDrillDown,
    handleDrillUp,
    handleCameraPreset,
    handleUpdateRoomMapping,
  };
}
