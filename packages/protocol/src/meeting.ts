/**
 * @module meeting
 * RFC-1.0.1 §4 extension — Meeting event payloads, type guards, and utilities
 * for room-based agent collaboration sessions in the 3D command-center.
 *
 * Meeting events describe the lifecycle of collaborative sessions that occur
 * inside rooms of the diegetic 3D world — recording who participated, when,
 * and what was decided, so every interaction is fully event-sourced and
 * replayable.
 *
 * Event hierarchy:
 *   meeting.scheduled          — a meeting was planned for a future time
 *   meeting.started            — a new meeting session was initiated in a room
 *   meeting.ended              — a meeting session concluded
 *   meeting.participant.joined — an agent or user joined an active meeting
 *   meeting.participant.left   — an agent or user departed an active meeting
 */
import type { EventType } from "./event.js";

// ---------------------------------------------------------------------------
// Meeting EventType subset
// ---------------------------------------------------------------------------

/** Tuple of all canonical meeting event type strings. */
export const MEETING_EVENT_TYPES = [
  "meeting.scheduled",
  "meeting.started",
  "meeting.ended",
  "meeting.participant.joined",
  "meeting.participant.left",
  // Protocol phase events — Sub-AC 10d
  "meeting.deliberation",
  "meeting.resolved",
  // Task spawning event — Sub-AC 2 / Sub-AC 10c
  // Emitted for each task produced when a meeting.resolved transition occurs.
  // Persisted so task provenance is fully traceable from meeting → task.
  "meeting.task.spawned",
  // Lifecycle control events — Sub-AC 2
  "meeting.cancelled",    // meeting was explicitly cancelled
  "meeting.rescheduled",  // meeting's scheduled time and/or room was changed
] as const satisfies readonly EventType[];

export type MeetingEventType = (typeof MEETING_EVENT_TYPES)[number];

/** O(1) membership test for meeting event types. */
export const MEETING_EVENT_TYPE_SET: ReadonlySet<string> = new Set(MEETING_EVENT_TYPES);

/** Type guard — narrows a string to a MeetingEventType. */
export function isMeetingEventType(s: string): s is MeetingEventType {
  return MEETING_EVENT_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Shared domain types
// ---------------------------------------------------------------------------

/**
 * Identifies the kind of participant in a meeting.
 * Mirrors the ActorKind union but scoped to meeting-relevant actor categories.
 */
export type MeetingParticipantKind = "agent" | "user" | "system";

/** Valid meeting completion outcomes. */
export type MeetingOutcome =
  | "completed"     // meeting ran to its natural conclusion
  | "cancelled"     // meeting was cancelled before completion
  | "timed_out"     // meeting exceeded its scheduled duration
  | "error";        // meeting ended due to an unexpected error

/** Valid reasons a participant may leave a meeting. */
export type MeetingLeaveReason =
  | "completed"     // participant finished their contribution
  | "ejected"       // participant was removed by facilitator
  | "disconnected"  // participant lost connectivity / process died
  | "error";        // participant left due to an internal error

// ---------------------------------------------------------------------------
// Payload interfaces — one per canonical meeting event type
// ---------------------------------------------------------------------------

/**
 * meeting.scheduled
 *
 * Fired when a meeting is planned for a future time.  This event represents
 * intent — the meeting has not yet started.  A subsequent meeting.started event
 * MUST be emitted when the meeting actually begins; consumers SHOULD correlate
 * the two events via `meeting_id`.
 *
 * If the meeting is cancelled before it starts, no meeting.started event is
 * emitted and the intent is considered abandoned (observable via log scanning).
 *
 * `scheduled_at_iso` stores the planned start time so schedulers and 3D
 * timeline views can project future events spatially without querying external
 * state.
 */
export interface MeetingScheduledPayload {
  /** Unique identifier for this meeting session (shared with meeting.started). */
  meeting_id: string;
  /** Room in which the meeting is planned to take place. */
  room_id: string;
  /** Human-readable title or topic of the planned meeting. */
  title?: string;
  /** agent_id or user_id that created the schedule entry. */
  scheduled_by: string;
  /**
   * ISO 8601 timestamp of the planned start time (e.g. "2026-03-25T14:00:00Z").
   * MUST be in the future relative to the event's `ts` field.
   */
  scheduled_at_iso: string;
  /** Optional expected duration of the meeting in milliseconds. */
  expected_duration_ms?: number;
  /**
   * Participant IDs expected to attend.
   * Actual attendees are recorded in meeting.started and meeting.participant.joined.
   */
  invited_participant_ids?: string[];
  /** Optional agenda / description of the meeting purpose. */
  agenda?: string;
}

/**
 * meeting.started
 *
 * Fired when a new meeting session is initiated inside a room.  The
 * `initiated_by` field MUST identify the actor (agent_id or user_id) that
 * opened the session so that the event log provides a clear chain of
 * causation.
 *
 * `participant_ids` lists the agents/users present at the moment the meeting
 * started (may be empty if the room is initialised before attendees arrive).
 * Late arrivals are tracked separately via meeting.participant.joined events.
 */
export interface MeetingStartedPayload {
  /** Unique identifier for this meeting session. */
  meeting_id: string;
  /** Room in which the meeting takes place (matches a layout room node id). */
  room_id: string;
  /** Human-readable title or topic of the meeting. */
  title?: string;
  /** agent_id or user_id that initiated the session. */
  initiated_by: string;
  /**
   * Participant IDs present at session start.
   * Subsequent joiners are captured by meeting.participant.joined events.
   */
  participant_ids: string[];
  /** Optional agenda / description of the meeting purpose. */
  agenda?: string;
  /**
   * Soft deadline in milliseconds from meeting start.
   * Zero or absent means no time limit.
   */
  scheduled_duration_ms?: number;
}

/**
 * meeting.ended
 *
 * Fired when a meeting session concludes.  The `duration_ms` field (when
 * present) is computed from the corresponding meeting.started timestamp and
 * provides instant metrics without log scanning.
 *
 * `decisions` (optional) lists decision-document IDs created during the
 * meeting, forming a lightweight audit trail that links meeting output back
 * to decision events without coupling the payload to their full content.
 */
export interface MeetingEndedPayload {
  /** Unique identifier for the meeting session being ended. */
  meeting_id: string;
  /** Room in which the meeting took place. */
  room_id: string;
  /** agent_id or user_id that closed the session, if applicable. */
  ended_by?: string;
  /** Wall-clock duration of the meeting in milliseconds. */
  duration_ms?: number;
  /** Machine-readable outcome of the meeting. */
  outcome?: MeetingOutcome;
  /** Short human-readable summary of what was accomplished. */
  summary?: string;
  /**
   * IDs of decision documents produced during the meeting.
   * Provides a soft reference; consumers MAY look up the full decision events
   * via correlation_id linkage.
   */
  decisions?: string[];
}

/**
 * meeting.participant.joined
 *
 * Fired when a single participant enters an already-active meeting session.
 * This event is the canonical way to track mid-session arrivals; participants
 * present at session start are instead listed in meeting.started.participant_ids.
 */
export interface MeetingParticipantJoinedPayload {
  /** Unique identifier of the meeting session being joined. */
  meeting_id: string;
  /** Room in which the meeting is taking place. */
  room_id: string;
  /** agent_id or user_id of the joining participant. */
  participant_id: string;
  /** Semantic category of the joining participant. */
  participant_kind: MeetingParticipantKind;
  /**
   * Functional role of this participant within the meeting.
   * Examples: "facilitator", "contributor", "observer", "note-taker".
   */
  role?: string;
}

/**
 * meeting.participant.left
 *
 * Fired when a single participant leaves an active meeting session.
 * Together with meeting.participant.joined, this pair enables full attendance
 * history reconstruction for any meeting from the event log alone.
 */
export interface MeetingParticipantLeftPayload {
  /** Unique identifier of the meeting session being left. */
  meeting_id: string;
  /** Room in which the meeting was taking place. */
  room_id: string;
  /** agent_id or user_id of the departing participant. */
  participant_id: string;
  /** Semantic category of the departing participant. */
  participant_kind: MeetingParticipantKind;
  /** Machine-readable reason the participant left the meeting. */
  reason?: MeetingLeaveReason;
}

/**
 * meeting.deliberation
 *
 * Fired when a meeting session's protocol transitions from the `request`
 * phase into the `deliberate` phase.  This is the canonical event that
 * marks the start of structured deliberation inside the meeting room.
 *
 * Consumers can correlate this event with the preceding `meeting.started`
 * event via `meeting_id` to compute how long a session spent in the
 * request phase before deliberation began.
 *
 * Sub-AC 10d: persisted to EventLog at the protocol.request→deliberate
 * transition triggered by CollaborationSession.beginDeliberation().
 */
export interface MeetingDeliberationPayload {
  /** Unique identifier of the meeting session entering deliberation. */
  meeting_id: string;
  /** Room in which the meeting is taking place. */
  room_id: string;
  /** agent_id, user_id, or "system" that triggered the deliberation phase. */
  initiated_by: string;
  /** Internal request_id from the ProtocolRequest artefact (for correlation). */
  request_id?: string;
  /** Optional human-readable note describing the deliberation context. */
  note?: string;
}

/**
 * meeting.resolved
 *
 * Fired when a meeting session's protocol transitions from the `deliberate`
 * phase into the `resolve` phase.  This event is the canonical audit record
 * for a completed deliberation cycle: it carries the outcome, summary,
 * decision count, and task count so that post-meeting analysis requires
 * only a log scan without joining other records.
 *
 * Sub-AC 10d: persisted to EventLog at the protocol.deliberate→resolve
 * transition triggered by CollaborationSession.resolveProtocol().
 */
export interface MeetingResolvedPayload {
  /** Unique identifier of the meeting session that was resolved. */
  meeting_id: string;
  /** Room in which the meeting took place. */
  room_id: string;
  /** Internal resolution_id from the ProtocolResolution artefact. */
  resolution_id: string;
  /** Machine-readable outcome of the deliberation. */
  outcome: "accepted" | "rejected" | "deferred" | "modified" | "abandoned";
  /** Short human-readable summary of what was resolved. */
  summary: string;
  /** agent_id, user_id, or "system" that declared the resolution. */
  resolved_by: string;
  /** Number of decisions recorded during deliberation. */
  decision_count: number;
  /** Number of tasks spawned as a result of the resolution. */
  task_count: number;
}

/**
 * meeting.task.spawned
 *
 * Fired once for each task that the orchestrator creates in response to a
 * `meeting.resolved` transition.  This event closes the causal chain from
 * deliberation outcome → concrete work item: consumers can join on
 * `meeting_id` to reconstruct which decisions produced which tasks.
 *
 * The payload duplicates the key fields of `SpawnedTask` from meeting-state.ts
 * so that task provenance is fully traceable from the event log alone without
 * joining external stores.
 *
 * Sub-AC 2 / Sub-AC 10c: persisted to EventLog when the orchestrator spawns
 * a task as a result of a CollaborationSession.resolveProtocol() call.
 */
export interface MeetingTaskSpawnedPayload {
  /** Unique identifier of the meeting session that produced this task. */
  meeting_id: string;
  /** Room in which the meeting took place. */
  room_id: string;
  /** Unique identifier for the spawned task (correlates with task-store). */
  task_id: string;
  /** Resolution artefact that triggered this task (from meeting.resolved). */
  resolution_id: string;
  /** Short human-readable title of the task. */
  title: string;
  /** Full description of the work to be done (optional for brevity). */
  description?: string;
  /** agent_id or user_id to whom the task is initially assigned. */
  assigned_to: string;
  /** Priority level 1 (lowest) – 5 (highest). */
  priority: 1 | 2 | 3 | 4 | 5;
  /** ISO 8601 timestamp when this task was spawned. */
  spawned_at: string;
  /** Arbitrary metadata from the orchestrator. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sub-AC 2 — meeting lifecycle control payloads
// ---------------------------------------------------------------------------

/**
 * meeting.cancelled  (Sub-AC 2)
 *
 * Fired when a meeting is explicitly cancelled — either before it starts
 * (cancellation of a scheduled entry) or during an active session (early
 * termination).  This event ensures the event log reflects every lifecycle
 * decision without requiring log-scan inference from absent events.
 *
 * Consumers SHOULD use `was_started` to distinguish:
 *   - `false` → the meeting never began (intent cancelled)
 *   - `true`  → an active session was forcibly ended; correlate with meeting.ended
 *
 * Note: a cancelled active session also emits `meeting.ended` with
 * `outcome = "cancelled"`.  This event is the audit record for the explicit
 * cancellation command; `meeting.ended` is the lifecycle boundary.
 */
export interface MeetingCancelledPayload {
  /** Unique identifier of the meeting session that was cancelled. */
  meeting_id: string;
  /** Room where the meeting was or would have been held. */
  room_id: string;
  /** agent_id or user_id that issued the cancellation. */
  cancelled_by: string;
  /**
   * Whether the meeting had already started when it was cancelled.
   * `false` = cancellation of a scheduled (not yet started) meeting.
   * `true`  = cancellation of an in-progress session.
   */
  was_started: boolean;
  /** Human-readable reason for the cancellation. */
  reason?: string;
}

/**
 * meeting.rescheduled  (Sub-AC 2)
 *
 * Fired when the scheduled time or room of a meeting is changed.
 * Both the previous and new values are recorded so the event log
 * captures the full scheduling history without requiring external diff tools.
 *
 * This event MUST only be emitted for meetings that have not yet started;
 * active sessions use `meeting.ended` (timed_out/cancelled) followed by
 * a new `meeting.scheduled` + `meeting.started` pair.
 */
export interface MeetingRescheduledPayload {
  /** Unique identifier of the meeting being rescheduled. */
  meeting_id: string;
  /** Room the meeting was originally assigned to. */
  room_id: string;
  /** agent_id or user_id that made the rescheduling change. */
  rescheduled_by: string;
  /** Previous planned start time (ISO 8601). */
  prev_scheduled_at_iso: string;
  /** New planned start time (ISO 8601). */
  new_scheduled_at_iso: string;
  /**
   * New room if the room assignment also changed.
   * Absent means the room is unchanged.
   */
  new_room_id?: string;
  /** Human-readable reason for the rescheduling. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Discriminated payload map — maps event type → typed payload interface
// ---------------------------------------------------------------------------

/**
 * Maps each canonical meeting EventType to its strongly-typed payload.
 *
 * Usage:
 * ```ts
 * function handleMeeting<T extends MeetingEventType>(
 *   type: T, payload: MeetingEventPayloadMap[T]
 * ) { ... }
 * ```
 */
export interface MeetingEventPayloadMap {
  "meeting.scheduled":          MeetingScheduledPayload;
  "meeting.started":            MeetingStartedPayload;
  "meeting.ended":              MeetingEndedPayload;
  "meeting.participant.joined": MeetingParticipantJoinedPayload;
  "meeting.participant.left":   MeetingParticipantLeftPayload;
  // Protocol phase events — Sub-AC 10d
  "meeting.deliberation":       MeetingDeliberationPayload;
  "meeting.resolved":           MeetingResolvedPayload;
  // Task spawning event — Sub-AC 2 / Sub-AC 10c
  "meeting.task.spawned":       MeetingTaskSpawnedPayload;
  // Lifecycle control events — Sub-AC 2
  "meeting.cancelled":          MeetingCancelledPayload;
  "meeting.rescheduled":        MeetingRescheduledPayload;
}

// ---------------------------------------------------------------------------
// Type guards — narrow `unknown` payloads to typed interfaces
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Valid MeetingParticipantKind strings for O(1) membership checks. */
const VALID_PARTICIPANT_KINDS: ReadonlySet<string> = new Set<MeetingParticipantKind>([
  "agent", "user", "system",
]);

/** Valid MeetingOutcome strings for O(1) membership checks. */
const VALID_OUTCOMES: ReadonlySet<string> = new Set<MeetingOutcome>([
  "completed", "cancelled", "timed_out", "error",
]);

/** Valid MeetingLeaveReason strings for O(1) membership checks. */
const VALID_LEAVE_REASONS: ReadonlySet<string> = new Set<MeetingLeaveReason>([
  "completed", "ejected", "disconnected", "error",
]);

/**
 * Type guard for meeting.scheduled payloads.
 *
 * Required: meeting_id, room_id, scheduled_by, scheduled_at_iso.
 * All other fields are optional and not structurally validated beyond type checks.
 */
export function isMeetingScheduledPayload(p: unknown): p is MeetingScheduledPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["meeting_id"] === "string" &&
    typeof p["room_id"] === "string" &&
    typeof p["scheduled_by"] === "string" &&
    typeof p["scheduled_at_iso"] === "string"
  );
}

/**
 * Type guard for meeting.started payloads.
 *
 * Required: meeting_id, room_id, initiated_by, participant_ids (array of strings).
 * Optional fields are not validated beyond structural type checks.
 */
export function isMeetingStartedPayload(p: unknown): p is MeetingStartedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["meeting_id"] === "string" &&
    typeof p["room_id"] === "string" &&
    typeof p["initiated_by"] === "string" &&
    Array.isArray(p["participant_ids"]) &&
    (p["participant_ids"] as unknown[]).every(id => typeof id === "string")
  );
}

/**
 * Type guard for meeting.ended payloads.
 *
 * Required: meeting_id, room_id.
 * Optional outcome is validated against the MeetingOutcome union when present.
 * Optional decisions is validated as a string array when present.
 */
export function isMeetingEndedPayload(p: unknown): p is MeetingEndedPayload {
  if (!isObject(p)) return false;
  if (typeof p["meeting_id"] !== "string") return false;
  if (typeof p["room_id"] !== "string") return false;

  // Validate optional outcome against known values
  if (p["outcome"] !== undefined && !VALID_OUTCOMES.has(p["outcome"] as string)) return false;

  // Validate optional decisions as string array
  if (p["decisions"] !== undefined) {
    if (!Array.isArray(p["decisions"])) return false;
    if (!(p["decisions"] as unknown[]).every(d => typeof d === "string")) return false;
  }

  return true;
}

/**
 * Type guard for meeting.participant.joined payloads.
 *
 * Required: meeting_id, room_id, participant_id, participant_kind.
 * participant_kind must be one of: "agent" | "user" | "system".
 */
export function isMeetingParticipantJoinedPayload(p: unknown): p is MeetingParticipantJoinedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["meeting_id"] === "string" &&
    typeof p["room_id"] === "string" &&
    typeof p["participant_id"] === "string" &&
    typeof p["participant_kind"] === "string" &&
    VALID_PARTICIPANT_KINDS.has(p["participant_kind"] as string)
  );
}

/**
 * Type guard for meeting.participant.left payloads.
 *
 * Required: meeting_id, room_id, participant_id, participant_kind.
 * participant_kind must be one of: "agent" | "user" | "system".
 * Optional reason is validated against the MeetingLeaveReason union when present.
 */
export function isMeetingParticipantLeftPayload(p: unknown): p is MeetingParticipantLeftPayload {
  if (!isObject(p)) return false;
  if (typeof p["meeting_id"] !== "string") return false;
  if (typeof p["room_id"] !== "string") return false;
  if (typeof p["participant_id"] !== "string") return false;
  if (typeof p["participant_kind"] !== "string") return false;
  if (!VALID_PARTICIPANT_KINDS.has(p["participant_kind"] as string)) return false;

  // Validate optional reason against known values
  if (p["reason"] !== undefined && !VALID_LEAVE_REASONS.has(p["reason"] as string)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Payload discriminator — map a MeetingEventType to its type guard
// ---------------------------------------------------------------------------

/**
 * Type guard for meeting.deliberation payloads.
 *
 * Required: meeting_id, room_id, initiated_by.
 * Optional fields are not validated beyond type checks.
 */
export function isMeetingDeliberationPayload(p: unknown): p is MeetingDeliberationPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["meeting_id"]   === "string" &&
    typeof p["room_id"]      === "string" &&
    typeof p["initiated_by"] === "string"
  );
}

/** Valid MeetingResolvedPayload outcome values. */
const VALID_RESOLVED_OUTCOMES: ReadonlySet<string> = new Set([
  "accepted", "rejected", "deferred", "modified", "abandoned",
]);

/**
 * Type guard for meeting.resolved payloads.
 *
 * Required: meeting_id, room_id, resolution_id, outcome, summary,
 *           resolved_by, decision_count, task_count.
 * outcome must be one of the valid MeetingResolvedPayload outcome values.
 */
export function isMeetingResolvedPayload(p: unknown): p is MeetingResolvedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["meeting_id"]     === "string" &&
    typeof p["room_id"]        === "string" &&
    typeof p["resolution_id"]  === "string" &&
    typeof p["outcome"]        === "string" &&
    VALID_RESOLVED_OUTCOMES.has(p["outcome"] as string) &&
    typeof p["summary"]        === "string" &&
    typeof p["resolved_by"]    === "string" &&
    typeof p["decision_count"] === "number" &&
    typeof p["task_count"]     === "number"
  );
}

/**
 * Type guard for meeting.task.spawned payloads.
 *
 * Required: meeting_id, room_id, task_id, resolution_id, title,
 *           assigned_to, priority (1–5), spawned_at.
 * Optional fields are not validated beyond type checks.
 */
export function isMeetingTaskSpawnedPayload(p: unknown): p is MeetingTaskSpawnedPayload {
  if (!isObject(p)) return false;
  if (typeof p["meeting_id"]    !== "string") return false;
  if (typeof p["room_id"]       !== "string") return false;
  if (typeof p["task_id"]       !== "string") return false;
  if (typeof p["resolution_id"] !== "string") return false;
  if (typeof p["title"]         !== "string") return false;
  if (typeof p["assigned_to"]   !== "string") return false;
  if (typeof p["priority"]      !== "number") return false;
  if (p["priority"] < 1 || p["priority"] > 5) return false;
  if (typeof p["spawned_at"]    !== "string") return false;
  return true;
}

/**
 * Type guard for meeting.cancelled payloads.
 *
 * Required: meeting_id, room_id, cancelled_by, was_started (boolean).
 * Optional fields are not validated beyond type checks.
 */
export function isMeetingCancelledPayload(p: unknown): p is MeetingCancelledPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["meeting_id"]   === "string" &&
    typeof p["room_id"]      === "string" &&
    typeof p["cancelled_by"] === "string" &&
    typeof p["was_started"]  === "boolean"
  );
}

/**
 * Type guard for meeting.rescheduled payloads.
 *
 * Required: meeting_id, room_id, rescheduled_by,
 *           prev_scheduled_at_iso, new_scheduled_at_iso.
 * Optional fields are not validated beyond type checks.
 */
export function isMeetingRescheduledPayload(p: unknown): p is MeetingRescheduledPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["meeting_id"]             === "string" &&
    typeof p["room_id"]                === "string" &&
    typeof p["rescheduled_by"]         === "string" &&
    typeof p["prev_scheduled_at_iso"]  === "string" &&
    typeof p["new_scheduled_at_iso"]   === "string"
  );
}

/** All meeting payload type-guard functions keyed by event type. */
export const MEETING_PAYLOAD_GUARDS: {
  [K in MeetingEventType]: (p: unknown) => p is MeetingEventPayloadMap[K];
} = {
  "meeting.scheduled":          isMeetingScheduledPayload,
  "meeting.started":            isMeetingStartedPayload,
  "meeting.ended":              isMeetingEndedPayload,
  "meeting.participant.joined": isMeetingParticipantJoinedPayload,
  "meeting.participant.left":   isMeetingParticipantLeftPayload,
  // Protocol phase events — Sub-AC 10d
  "meeting.deliberation":       isMeetingDeliberationPayload,
  "meeting.resolved":           isMeetingResolvedPayload,
  // Task spawning event — Sub-AC 2 / Sub-AC 10c
  "meeting.task.spawned":       isMeetingTaskSpawnedPayload,
  // Lifecycle control events — Sub-AC 2
  "meeting.cancelled":          isMeetingCancelledPayload,
  "meeting.rescheduled":        isMeetingRescheduledPayload,
};

/**
 * Validates a payload against the expected shape for a given meeting event type.
 *
 * Returns `true` and narrows `payload` if the validation passes.
 *
 * @example
 * ```ts
 * if (isValidMeetingPayload("meeting.participant.joined", event.payload)) {
 *   // payload is MeetingParticipantJoinedPayload
 *   console.log(event.payload.participant_id);
 * }
 * ```
 */
export function isValidMeetingPayload<T extends MeetingEventType>(
  type: T,
  payload: unknown,
): payload is MeetingEventPayloadMap[T] {
  return MEETING_PAYLOAD_GUARDS[type](payload);
}
