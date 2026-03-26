/**
 * @module meeting-convocation-orchestrator
 * Sub-AC 10.2 — Meeting convocation logic.
 * Sub-AC 10.3 — Meeting lifecycle event_log instrumentation.
 *
 * Provides an end-to-end orchestration layer that ties together the four
 * canonical requirements of meeting convocation:
 *
 *   1. Instantiate a Meeting entity (convene stage).
 *   2. Transition protocol_phase through convene → deliberate → resolve → adjourn.
 *   3. Spatially reposition participant agents to a shared gather point.
 *   4. Append at least one spawned_task_id to the entity at the resolve stage.
 *
 * Sub-AC 10.3 extends this orchestrator with optional event_log instrumentation:
 *   - Emits meeting.started  on convene  (step 1)
 *   - Emits meeting.deliberation on deliberate (step 3)
 *   - Emits meeting.resolved     on resolve   (step 4)
 *
 * Event logging is opt-in via the `eventEmitter` parameter so existing
 * callers and tests that don't need persistence remain unaffected.
 *
 * This module is a thin coordination layer over the Zustand stores; it does
 * NOT duplicate state — it orchestrates existing store actions in the correct
 * order and exposes a single `conductMeetingConvocation()` function that
 * callers can use in integration tests and the UI alike.
 *
 * Design principles:
 *   - Event-sourced: every step emits store events for audit transparency.
 *   - Dependency-injected: stores are passed in (not imported at module level)
 *     so the orchestrator can be unit-tested with minimal mocks.
 *   - Pure coordination: no domain logic lives here — only sequencing.
 *
 * Usage:
 * ```ts
 * const result = await conductMeetingConvocation({
 *   meetingId:      "mtg-sprint-planning",
 *   roomId:         "ops-control",
 *   title:          "Sprint Planning",
 *   agenda:         "Plan the next sprint",
 *   participantIds: ["manager-default", "implementer-subagent"],
 *   gatherPoint:    { x: 0.5, y: 0, z: 0.5 },
 *   resolveTask:    { title: "Implement Feature X", assignedTo: "implementer-subagent" },
 *   initiatedBy:    "manager-default",
 *   eventEmitter:   meetingEventLogger,
 *   meetingStore,
 *   agentStore,
 * });
 * // result.meetingId         — the meeting's stable ID
 * // result.stages            — ordered array of stages traversed
 * // result.spawnedTaskId     — task ID appended at resolve stage
 * // result.gatheringRecorded — true if spatial gathering was triggered
 * ```
 */

import type { Vec3 } from "@conitens/protocol";
import type { Meeting, MeetingStage } from "./meeting-store.js";
import type { SessionHandle } from "./meeting-store.js";

// ---------------------------------------------------------------------------
// Event emitter interfaces — Sub-AC 10.3
//
// These types model the three canonical meeting lifecycle events that must
// be persisted to the append-only event_log at each protocol transition.
//
// The interface is intentionally minimal and structurally compatible with
// MeetingEventLogger from @conitens/core so that callers can inject the
// real logger in production without a direct cross-package import here.
// ---------------------------------------------------------------------------

/**
 * Input shape for the meeting.started event emitted at the convene stage.
 * Structurally compatible with MeetingEventLogger.LogStartedInput.
 */
export interface ConvocationStartedInput {
  /** Stable meeting identifier (matches the Meeting entity's meeting_id). */
  meeting_id:      string;
  /** Room where the meeting takes place. */
  room_id:         string;
  /** Human-readable topic/title. */
  title?:          string;
  /** Agent ID or user who initiated the convocation. */
  initiated_by:    string;
  /** Ordered participant IDs present at session start. */
  participant_ids: string[];
  /** Optional agenda text. */
  agenda?:         string;
}

/**
 * Input shape for the meeting.deliberation event emitted at the deliberate stage.
 * Structurally compatible with MeetingEventLogger.LogDeliberationInput.
 */
export interface ConvocationDeliberationInput {
  /** Stable meeting identifier. */
  meeting_id:   string;
  /** Room where the meeting takes place. */
  room_id:      string;
  /** Who triggered the deliberation phase. */
  initiated_by: string;
  /** Optional human-readable note. */
  note?:        string;
}

/**
 * Input shape for the meeting.resolved event emitted at the resolve stage.
 * Structurally compatible with MeetingEventLogger.LogResolvedInput.
 */
export interface ConvocationResolvedInput {
  /** Stable meeting identifier. */
  meeting_id:     string;
  /** Room where the meeting took place. */
  room_id:        string;
  /** Stable identifier for this specific resolution artefact. */
  resolution_id:  string;
  /** Machine-readable outcome of the deliberation. */
  outcome:        string;
  /** Short human-readable summary of what was resolved. */
  summary:        string;
  /** Who declared the resolution. */
  resolved_by:    string;
  /** Number of decisions recorded during deliberation. */
  decision_count: number;
  /** Number of tasks spawned at resolution. */
  task_count:     number;
}

/**
 * Minimal event emitter interface injected into `conductMeetingConvocation()`.
 *
 * Callers inject a real `MeetingEventLogger` (from @conitens/core) in
 * production and a stub in tests.  The three methods mirror the three
 * canonical protocol transitions that must be durably recorded.
 *
 * Sub-AC 10.3 acceptance criteria:
 *   - logStarted()     is called immediately after the Meeting entity is
 *                      created in the convene stage.
 *   - logDeliberation() is called immediately after protocol_phase advances
 *                      to the deliberate stage.
 *   - logResolved()    is called immediately after protocol_phase advances
 *                      to the resolve stage (before adjourn).
 */
export interface ConvocationEventEmitter {
  logStarted(input: ConvocationStartedInput): Promise<void> | void;
  logDeliberation(input: ConvocationDeliberationInput): Promise<void> | void;
  logResolved(input: ConvocationResolvedInput): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Dependency interfaces — callers inject the stores so this module is
// independently testable without instantiating real Zustand stores.
// ---------------------------------------------------------------------------

/**
 * Minimal surface of `useMeetingStore` required by the orchestrator.
 */
export interface MeetingStoreInterface {
  upsertSession(handle: SessionHandle): void;
  progressMeetingStage(sessionId: string, newStage: MeetingStage): boolean;
  recordSpawnedTask(sessionId: string, task: {
    task_id:       string;
    session_id:    string;
    resolution_id: string;
    title:         string;
    description:   string;
    assigned_to:   string;
    priority:      1 | 2 | 3 | 4 | 5;
    status:        "pending" | "assigned" | "in_progress" | "completed" | "failed" | "cancelled";
    spawned_at:    string;
    metadata:      Record<string, unknown>;
  }): void;
  getMeetingEntity(sessionId: string): Meeting | undefined;
}

/**
 * Minimal surface of `useAgentStore` required by the orchestrator.
 */
export interface AgentStoreInterface {
  gatherAgentsForMeeting(meetingId: string, meetingRoomId: string, participantIds: string[]): void;
  disperseAgentsFromMeeting(meetingId: string): void;
}

// ---------------------------------------------------------------------------
// Convocation parameters
// ---------------------------------------------------------------------------

/**
 * Task to spawn at the resolve stage.
 * At minimum, a title and assignee are required.
 */
export interface ConvocationTask {
  /** Short human-readable title for the spawned work-item. */
  title:      string;
  /** Agent or user ID to assign the task to. */
  assignedTo: string;
  /** Optional detailed description. */
  description?: string;
  /** Priority 1–5 (default 3). */
  priority?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Full parameters for `conductMeetingConvocation()`.
 */
export interface MeetingConvocationParams {
  /** Stable meeting identifier (UUID or slug). */
  meetingId:      string;
  /** Room where the meeting takes place (maps to a RoomDef). */
  roomId:         string;
  /** Short human-readable title. */
  title:          string;
  /** Optional agenda description. */
  agenda?:        string;
  /** IDs of agents/users participating in the meeting. */
  participantIds: string[];
  /**
   * 3D world-space gather point where agents will be positioned.
   * If omitted the default room-centroid ({x: 0.5, y: 0, z: 0.5}) is used.
   */
  gatherPoint?:   Vec3;
  /** Task to spawn when the meeting reaches the resolve stage. */
  resolveTask:    ConvocationTask;
  /**
   * Agent ID or user ID that initiated the convocation.
   * Used as the `initiated_by` / `resolved_by` actor in event_log entries.
   * If omitted, the first participant ID is used; if that is also absent the
   * string "system" is used as a sentinel.
   *
   * Sub-AC 10.3: Required for deterministic actor attribution in event records.
   */
  initiatedBy?:   string;
  /**
   * Optional event emitter injected for event_log persistence.
   *
   * When provided, `conductMeetingConvocation()` will fire-and-forget three
   * canonical event_log entries at the corresponding protocol transitions:
   *   - meeting.started      — on convene  (step 1)
   *   - meeting.deliberation — on deliberate (step 3)
   *   - meeting.resolved     — on resolve  (step 4)
   *
   * Callers inject a real `MeetingEventLogger` from @conitens/core in
   * production and a stub implementation in tests.
   *
   * Sub-AC 10.3: This is the primary instrumentation hook for meeting lifecycle
   * record transparency in the convocation code path.
   */
  eventEmitter?:  ConvocationEventEmitter;
  /** Injected meeting store (use `useMeetingStore.getState()` in production). */
  meetingStore:   MeetingStoreInterface;
  /** Injected agent store (use `useAgentStore.getState()` in production). */
  agentStore:     AgentStoreInterface;
}

// ---------------------------------------------------------------------------
// Convocation result
// ---------------------------------------------------------------------------

/**
 * Result returned by `conductMeetingConvocation()`.
 */
export interface MeetingConvocationResult {
  /** Stable ID of the meeting (mirrors the input `meetingId`). */
  meetingId:         string;
  /** Ordered list of stages the meeting traversed (all four must appear). */
  stages:            MeetingStage[];
  /** ID of the task appended to the Meeting entity at the resolve stage. */
  spawnedTaskId:     string;
  /** Whether agent spatial gathering was successfully triggered. */
  gatheringRecorded: boolean;
  /** Final Meeting entity snapshot after adjourn. */
  finalEntity:       Meeting | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _taskCounter = 0;

function generateTaskId(meetingId: string): string {
  return `task-${meetingId}-${Date.now()}-${++_taskCounter}`;
}

function generateResolutionId(meetingId: string): string {
  return `res-${meetingId}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// conductMeetingConvocation
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full meeting convocation lifecycle end-to-end.
 *
 * Execution order:
 *   1. Build a SessionHandle and call `meetingStore.upsertSession()` →
 *      Meeting entity is created in the `convene` stage.
 *   2. Call `agentStore.gatherAgentsForMeeting()` to spatially reposition
 *      participant agents to the shared gather point inside the room.
 *   3. Advance the Meeting entity to `deliberate` via `progressMeetingStage`.
 *   4. Advance to `resolve` via `progressMeetingStage`.
 *   5. Spawn a task at the resolve stage via `recordSpawnedTask` →
 *      `spawned_task_ids` gains at least one entry.
 *   6. Advance to `adjourn` via `progressMeetingStage`.
 *   7. Call `agentStore.disperseAgentsFromMeeting()` to return agents home.
 *
 * @returns A `MeetingConvocationResult` describing the outcome of each step.
 */
export function conductMeetingConvocation(
  params: MeetingConvocationParams,
): MeetingConvocationResult {
  const {
    meetingId,
    roomId,
    title,
    agenda = "",
    participantIds,
    resolveTask,
    initiatedBy,
    eventEmitter,
    meetingStore,
    agentStore,
  } = params;

  // Derive a stable actor ID for event attribution.
  // Priority: explicit initiatedBy > first participant > sentinel "system".
  const actorId = initiatedBy ?? participantIds[0] ?? "system";

  const now = new Date().toISOString();

  // ── Step 1: Instantiate the Meeting entity (convene stage) ──────────────

  const sessionHandle: SessionHandle = {
    session_id: meetingId,
    status:     "active",
    room_id:    roomId,
    title,
    started_at: now,
    ended_at:   null,
    participants: participantIds.map((id) => ({
      participant_id:   id,
      participant_kind: "agent",
      assigned_role:    "contributor",
      capabilities:     [],
    })),
    shared_context: {
      meeting_id: meetingId,
      topic:      title,
      agenda,
      workspace:  {},
      created_at: now,
    },
    channel: {
      channel_id:      `ch-${meetingId}`,
      message_count:   0,
      last_message_at: null,
    },
  };

  meetingStore.upsertSession(sessionHandle);

  // Verify the entity was created in convene stage
  const conveneEntity = meetingStore.getMeetingEntity(meetingId);
  const stages: MeetingStage[] = [];
  if (conveneEntity?.stage === "convene") {
    stages.push("convene");
  }

  // Sub-AC 10.3: Emit meeting.started to the event_log at the convene stage.
  // Fire-and-forget — event log I/O failures must not block convocation.
  // Promise.resolve().catch() ensures async rejections are silently swallowed
  // so the caller never sees an unhandledRejection from the emitter.
  if (eventEmitter) {
    void Promise.resolve(eventEmitter.logStarted({
      meeting_id:      meetingId,
      room_id:         roomId,
      title:           title,
      initiated_by:    actorId,
      participant_ids: participantIds,
      agenda:          agenda || undefined,
    })).catch(() => { /* record transparency is best-effort */ });
  }

  // ── Step 2: Spatially reposition agents to the gather point ─────────────

  let gatheringRecorded = false;
  if (participantIds.length > 0) {
    agentStore.gatherAgentsForMeeting(meetingId, roomId, participantIds);
    gatheringRecorded = true;
  }

  // ── Step 3: Advance to deliberate ────────────────────────────────────────

  const deliberateOk = meetingStore.progressMeetingStage(meetingId, "deliberate");
  if (deliberateOk) {
    stages.push("deliberate");

    // Sub-AC 10.3: Emit meeting.deliberation to the event_log at the deliberate stage.
    // Fire-and-forget — log failure never blocks protocol progression.
    if (eventEmitter) {
      void Promise.resolve(eventEmitter.logDeliberation({
        meeting_id:   meetingId,
        room_id:      roomId,
        initiated_by: actorId,
        note:         `Convocation entered deliberation for: ${title}`,
      })).catch(() => { /* record transparency is best-effort */ });
    }
  }

  // ── Step 4: Advance to resolve ───────────────────────────────────────────

  const resolveOk = meetingStore.progressMeetingStage(meetingId, "resolve");

  // Generate the resolution ID before spawning the task so it can be
  // referenced in both the task record and the meeting.resolved event.
  const taskId        = generateTaskId(meetingId);
  const resolutionId  = generateResolutionId(meetingId);

  if (resolveOk) {
    stages.push("resolve");
  }

  // ── Step 5: Spawn a task at the resolve stage ────────────────────────────

  meetingStore.recordSpawnedTask(meetingId, {
    task_id:       taskId,
    session_id:    meetingId,
    resolution_id: resolutionId,
    title:         resolveTask.title,
    description:   resolveTask.description ?? "",
    assigned_to:   resolveTask.assignedTo,
    priority:      resolveTask.priority ?? 3,
    status:        "pending",
    spawned_at:    now,
    metadata:      { source: "meeting_convocation", meeting_id: meetingId },
  });

  // Sub-AC 10.3: Emit meeting.resolved to the event_log at the resolve stage.
  // Called after the task is recorded so task_count reflects reality.
  // Fire-and-forget — log failure never blocks protocol progression.
  if (eventEmitter && resolveOk) {
    void Promise.resolve(eventEmitter.logResolved({
      meeting_id:     meetingId,
      room_id:        roomId,
      resolution_id:  resolutionId,
      outcome:        "accepted",
      summary:        resolveTask.title,
      resolved_by:    actorId,
      decision_count: 0,  // no explicit decisions in convocation flow
      task_count:     1,  // one task always spawned at resolution
    })).catch(() => { /* record transparency is best-effort */ });
  }

  // ── Step 6: Advance to adjourn ───────────────────────────────────────────

  const adjournOk = meetingStore.progressMeetingStage(meetingId, "adjourn");
  if (adjournOk) {
    stages.push("adjourn");
  }

  // ── Step 7: Disperse agents back to their home rooms ─────────────────────

  agentStore.disperseAgentsFromMeeting(meetingId);

  // ── Collect result ───────────────────────────────────────────────────────

  const finalEntity = meetingStore.getMeetingEntity(meetingId);

  return {
    meetingId,
    stages,
    spawnedTaskId:     taskId,
    gatheringRecorded,
    finalEntity,
  };
}
