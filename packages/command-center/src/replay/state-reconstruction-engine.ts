/**
 * state-reconstruction-engine.ts — Pure deterministic state-reconstruction engine.
 *
 * Sub-AC 9b: Replays TypedReplayEvent sequences to produce a deterministic
 * scene-state snapshot at any given timestamp. This is a pure, framework-agnostic
 * module with no React or Zustand dependencies — it can be used in Node.js
 * pipelines, browser workers, and test environments without any side effects.
 *
 * Architecture
 * ────────────
 *   reconstructStateAt(events, targetTs, checkpoints?)
 *     1. Binary-search checkpoints for the nearest checkpoint ≤ targetTs
 *     2. Start from that checkpoint's mutable working state (deep clone)
 *        or from emptySceneState() if none exists
 *     3. Iterate events[checkpoint.seqIndex..] in sequence order,
 *        skipping events with tsMs > targetTs
 *     4. Apply each event to the working state via a reducer switch
 *     5. Return an immutable snapshot of the final working state
 *
 * buildCheckpoints(events, intervalSeq?)
 *     Pre-computes periodic state snapshots at every `intervalSeq` events.
 *     Pass the returned array to reconstructStateAt for O(intervalSeq)
 *     average reconstruction cost instead of O(n).
 *
 * Design principles (from project constraints)
 * ────────────────────────────────────────────
 *  - Record transparency: every event reducer documents exactly which
 *    payload fields it reads.
 *  - Determinism: for a given (events, targetTs) pair the output is always
 *    identical regardless of wall-clock, JS engine, or call order.
 *  - Immutability: the input events array is never mutated; reconstructed
 *    states are deep-cloned before being returned.
 *  - Forward-compatibility: unknown event types are silently skipped rather
 *    than causing errors; the state advances as far as known events allow.
 *  - Snapshot completeness: the output `ReconstructedSceneState` captures
 *    agents, rooms, tasks, commands, and pipelines — all concerns needed
 *    for a full 3D scene replay.
 *
 * Usage
 * ─────
 *   import {
 *     reconstructStateAt,
 *     buildCheckpoints,
 *     emptySceneState,
 *   } from "./state-reconstruction-engine.js";
 *
 *   const { events } = await parser.parseJsonlText(fileText);
 *   const checkpoints = buildCheckpoints(events, 50);
 *   const snapshot = reconstructStateAt(events, targetTs, checkpoints);
 */

import type {
  TypedReplayEvent,
  AgentLifecycleReplayEvent,
  CommandReplayEvent,
  StateChangeReplayEvent,
} from "./event-log-schema.js";

// ── Output types ────────────────────────────────────────────────────────────

/**
 * Reconstructed state of a single agent at a point in time.
 *
 * Fields are derived solely from the event stream — not from any live
 * store — to ensure determinism.
 */
export interface ReconstructedAgentState {
  /** Canonical agent identifier (from agent_id payload field). */
  agentId: string;
  /**
   * Operational status string.
   * Standard values: "spawned" | "idle" | "active" | "error" | "terminated"
   * Additional values are accepted for forward-compatibility.
   */
  status: string;
  /**
   * Room the agent currently occupies.
   * null before first placement event.
   */
  roomId: string | null;
  /**
   * Task the agent is actively working on.
   * null when the agent is idle or not yet assigned.
   */
  currentTaskId: string | null;
  /**
   * High-level lifecycle state string.
   * Standard values: "pending" | "ready" | "active" | "paused" | "terminated"
   */
  lifecycleState: string;
  /**
   * Number of agent.error events observed since the last agent.spawned event.
   * Resets on each spawn.
   */
  errorCount: number;
  /** Unix timestamp (ms) of the most recent event touching this agent. */
  lastEventTs: number;
  /** Sequence number of the most recent event touching this agent. */
  lastEventSeq: number;
}

/**
 * Reconstructed state of a room at a point in time.
 */
export interface ReconstructedRoomState {
  /** Room identifier. */
  roomId: string;
  /**
   * Agent IDs that are currently active in this room.
   * Maintained by room.member_joined/left events AND agent spatial events.
   */
  activeMembers: string[];
  /**
   * Coarse activity level.
   * Standard values: "idle" | "active" | "meeting" | "offline"
   */
  activity: string;
  /**
   * Active meeting ID if a meeting is in progress.
   * null if no active meeting.
   */
  meetingId: string | null;
  /** Unix timestamp of the most recent event touching this room. */
  lastEventTs: number;
}

/**
 * Reconstructed state of a task at a point in time.
 */
export interface ReconstructedTaskState {
  /** Task identifier. */
  taskId: string;
  /** Task title (may be empty string if not yet set). */
  title: string;
  /**
   * Task status string.
   * Standard values: "pending" | "in_progress" | "completed" | "failed" | "cancelled"
   */
  status: string;
  /**
   * Agent currently assigned to this task.
   * null if unassigned.
   */
  assignedAgentId: string | null;
  /** Unix timestamp of the most recent event touching this task. */
  lastEventTs: number;
  /** Sequence number of the most recent event touching this task. */
  lastEventSeq: number;
}

/**
 * Reconstructed state of a command at a point in time.
 */
export interface ReconstructedCommandState {
  /** Command identifier. */
  commandId: string;
  /** Command type string (e.g. "agent.spawn", "agent.stop"). */
  commandType: string;
  /** Current command status. */
  status: "pending" | "completed" | "failed" | "rejected";
  /** Source of the command (e.g. "gui", "cli", "api"). */
  source: string;
  /** Unix timestamp when the command was issued. */
  issuedTs: number;
  /** Sequence number when the command was issued. */
  issuedSeq: number;
  /** Unix timestamp when the command was resolved (completed/failed/rejected). */
  resolvedTs: number | null;
  /** Sequence number when the command was resolved. */
  resolvedSeq: number | null;
}

/**
 * Reconstructed state of a pipeline at a point in time.
 */
export interface ReconstructedPipelineState {
  /** Pipeline identifier. */
  pipelineId: string;
  /** Human-readable pipeline name. */
  pipelineName: string;
  /** Current pipeline status. */
  status: "running" | "completed" | "failed";
  /** Ordered list of step names. */
  steps: string[];
  /** Name of the currently executing step. */
  currentStep: string | null;
  /** Unix timestamp when the pipeline was started. */
  startTs: number;
  /** Unix timestamp when the pipeline was resolved. null if still running. */
  endTs: number | null;
}

/**
 * Complete deterministic scene-state snapshot at a single point in time.
 *
 * Produced by `reconstructStateAt()`. All maps are keyed by their respective
 * identifier fields (agentId, roomId, taskId, commandId, pipelineId).
 *
 * This type is JSON-serialisable — suitable for persisting replay checkpoints
 * to disk or passing to analysis / self-improvement pipelines.
 */
export interface ReconstructedSceneState {
  /** Target timestamp this snapshot represents (Unix ms). */
  ts: number;
  /**
   * Sequence number of the last event applied to produce this snapshot.
   * 0 if no events were applied (initial empty state).
   */
  seq: number;
  /**
   * Total number of events applied to produce this snapshot
   * (counting from the nearest checkpoint).
   */
  eventsApplied: number;

  /** Per-agent reconstructed state keyed by agentId. */
  agents: Record<string, ReconstructedAgentState>;
  /** Per-room reconstructed state keyed by roomId. */
  rooms: Record<string, ReconstructedRoomState>;
  /** Per-task reconstructed state keyed by taskId. */
  tasks: Record<string, ReconstructedTaskState>;
  /** Per-command state keyed by commandId. */
  commands: Record<string, ReconstructedCommandState>;
  /** Per-pipeline state keyed by pipelineId. */
  pipelines: Record<string, ReconstructedPipelineState>;
}

// ── Checkpoint type ─────────────────────────────────────────────────────────

/**
 * A pre-computed state snapshot used to accelerate replay seeking.
 *
 * Checkpoints allow `reconstructStateAt` to start from the nearest checkpoint
 * rather than replaying from the beginning of the event stream. At interval N,
 * reconstruction cost is O(N) rather than O(total_events).
 *
 * Checkpoints are produced by `buildCheckpoints()`.
 */
export interface ReconstructionCheckpoint {
  /** Timestamp of the last event applied at this checkpoint (Unix ms). */
  ts: number;
  /** Sequence number of the last event applied at this checkpoint. */
  seq: number;
  /**
   * Zero-based index into the events array of the last event applied.
   * Allows O(1) slice into the events array.
   */
  eventsArrayIndex: number;
  /** Deep-cloned scene state at this checkpoint. */
  state: ReconstructedSceneState;
}

// ── Default reconstruction interval ────────────────────────────────────────

/**
 * Default interval (in events) between automatically generated checkpoints.
 *
 * Lower values → faster seek, more memory.
 * Higher values → slower seek, less memory.
 */
export const DEFAULT_CHECKPOINT_INTERVAL = 50;

// ── Empty state factory ─────────────────────────────────────────────────────

/**
 * Create an empty, well-defined initial scene state.
 *
 * This is the baseline state before any events have been applied.
 * The reconstruction engine always starts from a clone of this value
 * when no checkpoint is available.
 */
export function emptySceneState(ts = 0): ReconstructedSceneState {
  return {
    ts,
    seq: 0,
    eventsApplied: 0,
    agents: {},
    rooms: {},
    tasks: {},
    commands: {},
    pipelines: {},
  };
}

// ── Deep clone ──────────────────────────────────────────────────────────────

/**
 * Deep-clone a ReconstructedSceneState.
 *
 * Uses JSON round-trip for simplicity and guaranteed correctness.
 * All values in ReconstructedSceneState are JSON-serialisable.
 */
function cloneState(state: ReconstructedSceneState): ReconstructedSceneState {
  return JSON.parse(JSON.stringify(state)) as ReconstructedSceneState;
}

// ── Event ordering ──────────────────────────────────────────────────────────

/**
 * Compare two TypedReplayEvents for deterministic ordering.
 *
 * Primary sort: tsMs (ascending)
 * Secondary sort: seq (ascending) — breaks ties within the same millisecond
 *
 * The parser assigns seq numbers within a single parseLines/parseJsonlText
 * call in input order, so this produces the same order as the original log.
 */
function compareEvents(a: TypedReplayEvent, b: TypedReplayEvent): number {
  if (a.tsMs !== b.tsMs) return a.tsMs - b.tsMs;
  return a.seq - b.seq;
}

// ── Agent event reducer ─────────────────────────────────────────────────────

/**
 * Apply a single agent_lifecycle event to the mutable working state.
 *
 * Reads:
 *   - agent.spawned    → typedPayload.agent_id, .persona (→ lifecycleState)
 *   - agent.heartbeat  → typedPayload.agent_id (liveness proof, no state change)
 *   - agent.error      → typedPayload.agent_id (increments errorCount)
 *   - agent.terminated → typedPayload.agent_id
 *   - agent.migrated   → typedPayload.agent_id, .to_run_id (→ status note)
 *   - agent.lifecycle.changed → typedPayload.agent_id, .new_state
 *   - agent.moved      → typedPayload.agent_id, .to_room
 *   - agent.assigned   → typedPayload.agent_id, .room_id
 *   - agent.status_changed → typedPayload.agent_id, .status
 *   - agent.task.started   → typedPayload.agent_id, .task_id
 *   - agent.task.completed → typedPayload.agent_id, .task_id
 */
function applyAgentLifecycleEvent(
  state: ReconstructedSceneState,
  event: AgentLifecycleReplayEvent,
): void {
  const p = event.typedPayload as unknown as Record<string, unknown>;
  const agentId = event.agentId;
  if (!agentId) return;

  // Ensure agent entry exists
  if (!state.agents[agentId]) {
    state.agents[agentId] = {
      agentId,
      status: "spawned",
      roomId: null,
      currentTaskId: null,
      lifecycleState: "pending",
      errorCount: 0,
      lastEventTs: event.tsMs,
      lastEventSeq: event.seq,
    };
  }

  const agent = state.agents[agentId];

  // Update timestamp/seq on every event
  agent.lastEventTs = event.tsMs;
  agent.lastEventSeq = event.seq;

  switch (event.type) {
    case "agent.spawned": {
      // Reset error count and set initial states
      agent.status = "idle";
      agent.lifecycleState = "ready";
      agent.errorCount = 0;
      agent.currentTaskId = null;
      // persona comes from typedPayload but we don't track it here
      break;
    }

    case "agent.heartbeat": {
      // Liveness signal — no state mutation beyond timestamp
      break;
    }

    case "agent.error": {
      agent.status = "error";
      agent.errorCount += 1;
      break;
    }

    case "agent.terminated": {
      agent.status = "terminated";
      agent.lifecycleState = "terminated";
      agent.currentTaskId = null;
      // Leave room membership — agent may still be displayed as inactive
      break;
    }

    case "agent.migrated": {
      // Migration to another run — treat as a soft restart
      agent.lifecycleState = "ready";
      agent.status = "idle";
      break;
    }

    case "agent.lifecycle.changed": {
      const newState = p["new_state"];
      if (typeof newState === "string" && newState.length > 0) {
        agent.lifecycleState = newState;
        // Map lifecycle states to status
        if (newState === "terminated") agent.status = "terminated";
        else if (newState === "active") agent.status = "active";
        else if (newState === "ready") agent.status = "idle";
        else if (newState === "paused") agent.status = "idle";
      }
      break;
    }

    case "agent.moved": {
      // Reads: to_room (required), from_room (optional), position (optional)
      const toRoom = p["to_room"];
      if (typeof toRoom === "string" && toRoom.length > 0) {
        const prevRoom = agent.roomId;
        agent.roomId = toRoom;

        // Update room membership
        if (prevRoom && state.rooms[prevRoom]) {
          state.rooms[prevRoom] = {
            ...state.rooms[prevRoom],
            activeMembers: state.rooms[prevRoom].activeMembers.filter(
              (id) => id !== agentId,
            ),
            lastEventTs: event.tsMs,
          };
        }
        if (!state.rooms[toRoom]) {
          state.rooms[toRoom] = {
            roomId: toRoom,
            activeMembers: [],
            activity: "idle",
            meetingId: null,
            lastEventTs: event.tsMs,
          };
        }
        if (!state.rooms[toRoom].activeMembers.includes(agentId)) {
          const newMembers = [...state.rooms[toRoom].activeMembers, agentId];
          const updatedRoom = { ...state.rooms[toRoom], activeMembers: newMembers, lastEventTs: event.tsMs };
          state.rooms[toRoom] = {
            ...updatedRoom,
            activity: deriveRoomActivity(updatedRoom),
          };
        }
      }
      break;
    }

    case "agent.assigned": {
      // Reads: room_id (required), role (optional)
      const roomId = p["room_id"];
      if (typeof roomId === "string" && roomId.length > 0) {
        agent.roomId = roomId;
        if (!state.rooms[roomId]) {
          state.rooms[roomId] = {
            roomId,
            activeMembers: [],
            activity: "idle",
            meetingId: null,
            lastEventTs: event.tsMs,
          };
        }
        if (!state.rooms[roomId].activeMembers.includes(agentId)) {
          const newMembers = [...state.rooms[roomId].activeMembers, agentId];
          const updatedRoom = { ...state.rooms[roomId], activeMembers: newMembers, lastEventTs: event.tsMs };
          state.rooms[roomId] = {
            ...updatedRoom,
            activity: deriveRoomActivity(updatedRoom),
          };
        }
      }
      break;
    }

    case "agent.status_changed": {
      // Reads: status (required), prev_status (optional)
      const status = p["status"];
      if (typeof status === "string" && status.length > 0) {
        agent.status = status;
        if (status === "active" && agent.roomId && state.rooms[agent.roomId]) {
          state.rooms[agent.roomId] = {
            ...state.rooms[agent.roomId],
            activity: "active",
            lastEventTs: event.tsMs,
          };
        }
      }
      break;
    }

    case "agent.task.started": {
      // Reads: task_id (required), task_title (optional)
      const taskId = p["task_id"];
      if (typeof taskId === "string" && taskId.length > 0) {
        agent.status = "active";
        agent.currentTaskId = taskId;
        // Update task assignment if the task is tracked
        if (state.tasks[taskId]) {
          state.tasks[taskId] = {
            ...state.tasks[taskId],
            assignedAgentId: agentId,
            status: "in_progress",
            lastEventTs: event.tsMs,
            lastEventSeq: event.seq,
          };
        }
      }
      break;
    }

    case "agent.task.completed": {
      // Reads: task_id (required), outcome (required: success | failure | cancelled)
      const taskId = p["task_id"];
      const outcome = p["outcome"];
      if (typeof taskId === "string" && taskId.length > 0) {
        agent.status = "idle";
        agent.currentTaskId = null;
        if (state.tasks[taskId]) {
          const taskStatus =
            outcome === "failure"
              ? "failed"
              : outcome === "cancelled"
                ? "cancelled"
                : "completed";
          state.tasks[taskId] = {
            ...state.tasks[taskId],
            status: taskStatus,
            lastEventTs: event.tsMs,
            lastEventSeq: event.seq,
          };
        }
      }
      break;
    }

    default:
      // Forward-compatible: unknown agent event types are silently ignored
      break;
  }
}

// ── Command event reducer ───────────────────────────────────────────────────

/**
 * Apply a single command/pipeline event to the mutable working state.
 *
 * Reads:
 *   - command.issued     → commandId, commandType, source
 *   - command.completed  → commandId
 *   - command.failed     → commandId
 *   - command.rejected   → commandId
 *   - pipeline.started   → pipelineId, pipelineName, steps
 *   - pipeline.step      → pipelineId, step_name
 *   - pipeline.completed → pipelineId
 *   - pipeline.failed    → pipelineId
 */
function applyCommandEvent(
  state: ReconstructedSceneState,
  event: CommandReplayEvent,
): void {
  const p = event.typedPayload as unknown as Record<string, unknown>;

  switch (event.type) {
    case "command.issued": {
      const commandId = event.commandId;
      if (!commandId) break;
      const commandType = p["command_type"];
      const source = p["source"];
      state.commands[commandId] = {
        commandId,
        commandType: typeof commandType === "string" ? commandType : "unknown",
        status: "pending",
        source: typeof source === "string" ? source : "unknown",
        issuedTs: event.tsMs,
        issuedSeq: event.seq,
        resolvedTs: null,
        resolvedSeq: null,
      };
      break;
    }

    case "command.completed": {
      const commandId = event.commandId;
      if (!commandId) break;
      if (state.commands[commandId]) {
        state.commands[commandId] = {
          ...state.commands[commandId],
          status: "completed",
          resolvedTs: event.tsMs,
          resolvedSeq: event.seq,
        };
      }
      break;
    }

    case "command.failed": {
      const commandId = event.commandId;
      if (!commandId) break;
      if (state.commands[commandId]) {
        state.commands[commandId] = {
          ...state.commands[commandId],
          status: "failed",
          resolvedTs: event.tsMs,
          resolvedSeq: event.seq,
        };
      }
      break;
    }

    case "command.rejected": {
      const commandId = event.commandId;
      if (!commandId) break;
      if (state.commands[commandId]) {
        state.commands[commandId] = {
          ...state.commands[commandId],
          status: "rejected",
          resolvedTs: event.tsMs,
          resolvedSeq: event.seq,
        };
      }
      break;
    }

    case "pipeline.started": {
      const pipelineId = event.pipelineId;
      if (!pipelineId) break;
      const pipelineName = p["pipeline_name"];
      const rawSteps = p["steps"];
      const steps = Array.isArray(rawSteps)
        ? (rawSteps as unknown[]).filter((s): s is string => typeof s === "string")
        : [];
      state.pipelines[pipelineId] = {
        pipelineId,
        pipelineName: typeof pipelineName === "string" ? pipelineName : pipelineId,
        status: "running",
        steps,
        currentStep: steps[0] ?? null,
        startTs: event.tsMs,
        endTs: null,
      };
      break;
    }

    case "pipeline.step": {
      const pipelineId = event.pipelineId;
      if (!pipelineId) break;
      if (state.pipelines[pipelineId]) {
        const stepName = p["step_name"];
        state.pipelines[pipelineId] = {
          ...state.pipelines[pipelineId],
          currentStep:
            typeof stepName === "string" && stepName.length > 0
              ? stepName
              : state.pipelines[pipelineId].currentStep,
        };
      }
      break;
    }

    case "pipeline.completed": {
      const pipelineId = event.pipelineId;
      if (!pipelineId) break;
      if (state.pipelines[pipelineId]) {
        state.pipelines[pipelineId] = {
          ...state.pipelines[pipelineId],
          status: "completed",
          currentStep: null,
          endTs: event.tsMs,
        };
      }
      break;
    }

    case "pipeline.failed": {
      const pipelineId = event.pipelineId;
      if (!pipelineId) break;
      if (state.pipelines[pipelineId]) {
        state.pipelines[pipelineId] = {
          ...state.pipelines[pipelineId],
          status: "failed",
          currentStep: null,
          endTs: event.tsMs,
        };
      }
      break;
    }

    default:
      // Forward-compatible: unknown command/pipeline event types are skipped
      break;
  }
}

// ── State-change event reducer ──────────────────────────────────────────────

/**
 * Apply a single state_change event to the mutable working state.
 *
 * Handles:
 *   - task.*       → task lifecycle (created, assigned, status_changed, completed, failed, cancelled)
 *   - meeting.*    → room meeting state (started, ended, participant.joined, participant.left)
 *   - layout.*     → no state captured (layout events affect geometry, not agent/room state)
 *   - system.*     → no state captured
 *   - Others       → silently skipped for forward-compatibility
 */
function applyStateChangeEvent(
  state: ReconstructedSceneState,
  event: StateChangeReplayEvent,
): void {
  const p = event.typedPayload;

  // Route by domain prefix extracted from the event type
  switch (event.domain) {
    case "task":
      applyTaskEvent(state, event, p);
      break;

    case "meeting":
      applyMeetingEvent(state, event, p);
      break;

    // layout.*, system.*, memory.*, mode.*, handoff.*, decision.*, approval.*,
    // schema.*, message.* → no scene-state impact in current schema
    default:
      break;
  }
}

/**
 * Apply a task.* event.
 *
 * Reads:
 *   - task.created        → task_id, title
 *   - task.assigned       → task_id, agent_id
 *   - task.status_changed → task_id, status
 *   - task.completed      → task_id
 *   - task.failed         → task_id
 *   - task.cancelled      → task_id
 */
function applyTaskEvent(
  state: ReconstructedSceneState,
  event: StateChangeReplayEvent,
  p: Record<string, unknown>,
): void {
  // task_id may appear in payload or in the envelope's task_id field
  const taskId =
    (typeof p["task_id"] === "string" ? p["task_id"] : null) ??
    event.taskId ??
    null;
  if (!taskId) return;

  switch (event.type) {
    case "task.created": {
      const title = p["title"];
      state.tasks[taskId] = {
        taskId,
        title: typeof title === "string" ? title : "",
        status: "pending",
        assignedAgentId: null,
        lastEventTs: event.tsMs,
        lastEventSeq: event.seq,
      };
      break;
    }

    case "task.assigned": {
      const agentId = p["agent_id"];
      if (!state.tasks[taskId]) {
        state.tasks[taskId] = {
          taskId,
          title: "",
          status: "pending",
          assignedAgentId: null,
          lastEventTs: event.tsMs,
          lastEventSeq: event.seq,
        };
      }
      state.tasks[taskId] = {
        ...state.tasks[taskId],
        assignedAgentId: typeof agentId === "string" ? agentId : null,
        lastEventTs: event.tsMs,
        lastEventSeq: event.seq,
      };
      break;
    }

    case "task.status_changed": {
      const status = p["status"];
      if (!state.tasks[taskId]) {
        state.tasks[taskId] = {
          taskId,
          title: "",
          status: typeof status === "string" ? status : "pending",
          assignedAgentId: null,
          lastEventTs: event.tsMs,
          lastEventSeq: event.seq,
        };
      } else if (typeof status === "string" && status.length > 0) {
        state.tasks[taskId] = {
          ...state.tasks[taskId],
          status,
          lastEventTs: event.tsMs,
          lastEventSeq: event.seq,
        };
      }
      break;
    }

    case "task.completed": {
      if (!state.tasks[taskId]) {
        state.tasks[taskId] = {
          taskId,
          title: "",
          status: "completed",
          assignedAgentId: null,
          lastEventTs: event.tsMs,
          lastEventSeq: event.seq,
        };
      } else {
        state.tasks[taskId] = {
          ...state.tasks[taskId],
          status: "completed",
          lastEventTs: event.tsMs,
          lastEventSeq: event.seq,
        };
      }
      break;
    }

    case "task.failed": {
      if (state.tasks[taskId]) {
        state.tasks[taskId] = {
          ...state.tasks[taskId],
          status: "failed",
          lastEventTs: event.tsMs,
          lastEventSeq: event.seq,
        };
      }
      break;
    }

    case "task.cancelled": {
      if (state.tasks[taskId]) {
        state.tasks[taskId] = {
          ...state.tasks[taskId],
          status: "cancelled",
          lastEventTs: event.tsMs,
          lastEventSeq: event.seq,
        };
      }
      break;
    }

    case "task.spec_updated":
    case "task.artifact_added":
    default:
      // Informational — no state impact in this engine
      break;
  }
}

/**
 * Apply a meeting.* event to room state.
 *
 * Reads:
 *   - meeting.started          → meeting_id, room_id
 *   - meeting.ended            → meeting_id, room_id
 *   - meeting.participant.joined → meeting_id, room_id, agent_id
 *   - meeting.participant.left  → meeting_id, room_id, agent_id
 */
function applyMeetingEvent(
  state: ReconstructedSceneState,
  event: StateChangeReplayEvent,
  p: Record<string, unknown>,
): void {
  const roomId = p["room_id"];
  const meetingId = p["meeting_id"];
  if (typeof roomId !== "string" || !roomId) return;
  if (typeof meetingId !== "string" || !meetingId) return;

  // Ensure room entry exists
  if (!state.rooms[roomId]) {
    state.rooms[roomId] = {
      roomId,
      activeMembers: [],
      activity: "idle",
      meetingId: null,
      lastEventTs: event.tsMs,
    };
  }

  switch (event.type) {
    case "meeting.started": {
      state.rooms[roomId] = {
        ...state.rooms[roomId],
        meetingId,
        activity: "meeting",
        lastEventTs: event.tsMs,
      };
      break;
    }

    case "meeting.ended": {
      state.rooms[roomId] = {
        ...state.rooms[roomId],
        meetingId: null,
        activity:
          state.rooms[roomId].activeMembers.length > 0 ? "active" : "idle",
        lastEventTs: event.tsMs,
      };
      break;
    }

    case "meeting.participant.joined": {
      const agentId = p["agent_id"];
      if (typeof agentId === "string" && agentId.length > 0) {
        if (!state.rooms[roomId].activeMembers.includes(agentId)) {
          state.rooms[roomId] = {
            ...state.rooms[roomId],
            activeMembers: [...state.rooms[roomId].activeMembers, agentId],
            activity: state.rooms[roomId].meetingId ? "meeting" : "active",
            lastEventTs: event.tsMs,
          };
        }
        // Also update agent's room
        if (state.agents[agentId]) {
          state.agents[agentId] = {
            ...state.agents[agentId],
            roomId,
            lastEventTs: event.tsMs,
            lastEventSeq: event.seq,
          };
        }
      }
      break;
    }

    case "meeting.participant.left": {
      const agentId = p["agent_id"];
      if (typeof agentId === "string" && agentId.length > 0) {
        state.rooms[roomId] = {
          ...state.rooms[roomId],
          activeMembers: state.rooms[roomId].activeMembers.filter(
            (id) => id !== agentId,
          ),
          lastEventTs: event.tsMs,
        };
        // Recalculate activity after departure
        state.rooms[roomId] = {
          ...state.rooms[roomId],
          activity: deriveRoomActivity(state.rooms[roomId]),
        };
      }
      break;
    }

    default:
      break;
  }
}

// ── Room activity helper ────────────────────────────────────────────────────

/**
 * Derive the room activity level from current room state.
 *
 * Priority: meeting > active (has members) > idle
 */
function deriveRoomActivity(room: ReconstructedRoomState): string {
  if (room.meetingId) return "meeting";
  if (room.activeMembers.length > 0) return "active";
  return "idle";
}

// ── Master event applier ────────────────────────────────────────────────────

/**
 * Apply a single TypedReplayEvent to the mutable working state.
 *
 * Dispatches to the appropriate category reducer. The state is mutated
 * in place — callers are responsible for deep-cloning before calling this
 * if they need immutability.
 */
function applyEvent(
  state: ReconstructedSceneState,
  event: TypedReplayEvent,
): void {
  // Update top-level ts/seq on every event (before category dispatch)
  if (event.tsMs > state.ts) state.ts = event.tsMs;
  state.seq = event.seq;
  state.eventsApplied += 1;

  switch (event.replayCategory) {
    case "agent_lifecycle":
      applyAgentLifecycleEvent(state, event);
      break;
    case "command":
      applyCommandEvent(state, event);
      break;
    case "state_change":
      applyStateChangeEvent(state, event);
      break;
  }
}

// ── Binary search for checkpoints ──────────────────────────────────────────

/**
 * Binary-search `checkpoints` for the nearest checkpoint at or before
 * `targetTs`. Returns the checkpoint or null if none qualify.
 *
 * Assumes checkpoints are sorted by `ts` ascending (as produced by
 * `buildCheckpoints`).
 */
function findNearestCheckpoint(
  targetTs: number,
  checkpoints: ReconstructionCheckpoint[],
): ReconstructionCheckpoint | null {
  if (checkpoints.length === 0) return null;

  let lo = 0;
  let hi = checkpoints.length - 1;
  let result: ReconstructionCheckpoint | null = null;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (checkpoints[mid].ts <= targetTs) {
      result = checkpoints[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

// ── Core public API ─────────────────────────────────────────────────────────

/**
 * Reconstruct the complete scene state at `targetTs`.
 *
 * Algorithm
 * ─────────
 *   1. Sort events by (tsMs, seq) for determinism (copy — originals untouched)
 *   2. Find the nearest checkpoint at or before targetTs (O(log checkpoints))
 *   3. Clone the checkpoint state as the working state
 *      (or create an empty state if no checkpoint exists)
 *   4. Iterate from checkpoint.eventsArrayIndex + 1, applying each event
 *      whose tsMs ≤ targetTs
 *   5. Return an immutable clone of the final working state
 *
 * @param events      Typed replay events produced by EventLogParser
 * @param targetTs    Target Unix timestamp in milliseconds
 * @param checkpoints Optional pre-computed checkpoints (see buildCheckpoints)
 *
 * @returns A deterministic snapshot of scene state at targetTs
 */
export function reconstructStateAt(
  events: TypedReplayEvent[],
  targetTs: number,
  checkpoints: ReconstructionCheckpoint[] = [],
): ReconstructedSceneState {
  // Sort defensively — parser already sorts but callers may mix batches
  const sorted = [...events].sort(compareEvents);

  // Find the nearest checkpoint
  const checkpoint = findNearestCheckpoint(targetTs, checkpoints);

  // Start from checkpoint (deep clone to avoid mutation) or empty state
  const working: ReconstructedSceneState = checkpoint
    ? cloneState(checkpoint.state)
    : emptySceneState(0);

  // Determine where in the sorted array to start applying events
  const startIndex = checkpoint ? checkpoint.eventsArrayIndex + 1 : 0;

  // Apply events from startIndex up to (and including) targetTs
  for (let i = startIndex; i < sorted.length; i++) {
    const ev = sorted[i];
    if (ev.tsMs > targetTs) break;
    applyEvent(working, ev);
  }

  // Ensure ts is set correctly even if no events were applied
  if (working.ts === 0 && checkpoint) {
    working.ts = checkpoint.ts;
  }

  // Return immutable snapshot
  return cloneState(working);
}

/**
 * Pre-compute periodic checkpoints from an event sequence.
 *
 * This is an optional optimisation. Without checkpoints, reconstructStateAt
 * scans all events from the beginning (O(n)). With checkpoints at interval N,
 * the average cost is O(N).
 *
 * @param events      Sorted (or unsorted) typed replay events
 * @param intervalSeq Number of events between checkpoints (default: 50)
 *
 * @returns Array of checkpoints sorted by ts ascending
 */
export function buildCheckpoints(
  events: TypedReplayEvent[],
  intervalSeq = DEFAULT_CHECKPOINT_INTERVAL,
): ReconstructionCheckpoint[] {
  if (events.length === 0) return [];

  // Sort defensively
  const sorted = [...events].sort(compareEvents);

  const checkpoints: ReconstructionCheckpoint[] = [];
  const working: ReconstructedSceneState = emptySceneState(0);

  for (let i = 0; i < sorted.length; i++) {
    applyEvent(working, sorted[i]);

    // Take a checkpoint every intervalSeq events
    if ((i + 1) % intervalSeq === 0) {
      checkpoints.push({
        ts: working.ts,
        seq: working.seq,
        eventsArrayIndex: i,
        state: cloneState(working),
      });
    }
  }

  return checkpoints;
}

/**
 * Reconstruct scene state at every event timestamp in the stream and return
 * an ordered array of (ts, seq, state) tuples. Useful for self-improvement
 * analysis: iterate over the full timeline without repeated seeks.
 *
 * Note: This is O(n) — it applies events incrementally without seeking.
 * For random-access replay use `reconstructStateAt` with checkpoints instead.
 *
 * @param events Sorted (or unsorted) typed replay events
 * @returns Array of snapshots, one per unique (tsMs, seq) in the stream
 */
export function buildFullTimeline(events: TypedReplayEvent[]): {
  ts: number;
  seq: number;
  snapshot: ReconstructedSceneState;
}[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort(compareEvents);
  const result: { ts: number; seq: number; snapshot: ReconstructedSceneState }[] =
    [];
  const working: ReconstructedSceneState = emptySceneState(0);

  for (const ev of sorted) {
    applyEvent(working, ev);
    result.push({
      ts: working.ts,
      seq: working.seq,
      snapshot: cloneState(working),
    });
  }

  return result;
}

// ── Convenience query helpers ───────────────────────────────────────────────

/**
 * Return the sequence of rooms an agent occupied as events were applied,
 * by scanning the event stream for agent.moved and agent.assigned events.
 *
 * @param events   Typed replay events
 * @param agentId  Agent to trace
 * @returns Array of { ts, roomId } moves in chronological order
 */
export function traceAgentRoomHistory(
  events: TypedReplayEvent[],
  agentId: string,
): { ts: number; seq: number; roomId: string }[] {
  const sorted = [...events].sort(compareEvents);
  const history: { ts: number; seq: number; roomId: string }[] = [];

  for (const ev of sorted) {
    if (ev.replayCategory !== "agent_lifecycle") continue;
    if (ev.agentId !== agentId) continue;

    const p = ev.typedPayload as unknown as Record<string, unknown>;
    if (ev.type === "agent.moved") {
      const toRoom = p["to_room"];
      if (typeof toRoom === "string" && toRoom.length > 0) {
        history.push({ ts: ev.tsMs, seq: ev.seq, roomId: toRoom });
      }
    } else if (ev.type === "agent.assigned") {
      const roomId = p["room_id"];
      if (typeof roomId === "string" && roomId.length > 0) {
        history.push({ ts: ev.tsMs, seq: ev.seq, roomId });
      }
    }
  }

  return history;
}

/**
 * Return a flat array of all agent IDs that appear in the event stream.
 *
 * @param events Typed replay events
 * @returns Unique agent IDs in first-appearance order
 */
export function listAgentIds(events: TypedReplayEvent[]): string[] {
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.replayCategory === "agent_lifecycle" && ev.agentId) {
      seen.add(ev.agentId);
    }
  }
  return Array.from(seen);
}
