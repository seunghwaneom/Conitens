/**
 * @module meeting-state
 * Sub-AC 10a — Meeting convocation data model and protocol state machine.
 *
 * Defines the canonical Meeting entity and its embedded four-stage protocol:
 *
 *   convene  →  deliberate  →  resolve  →  adjourn
 *
 * The state machine governs every Meeting's lifecycle.  Stage transitions are
 * event-sourced: each advance is persisted as a ConitensEvent so the full
 * journey is replayable from the event log alone.
 *
 * Architecture:
 *   • `MEETING_STAGES` — ordered tuple of the four canonical stages
 *   • `VALID_MEETING_STAGE_TRANSITIONS` — allowed forward (and back) moves
 *   • `canMeetingStageTransition(from, to)` — O(1) transition guard
 *   • `Meeting` — domain entity embedding all protocol state
 *   • `createMeeting(input)` — factory that initialises a Meeting in the
 *     convene stage with empty collections
 *   • `applyMeetingEvent(meeting, event)` — pure reducer that advances Meeting
 *     state from a ConitensEvent (immutable / returns new object)
 *   • `projectMeetingFromEvents(meeting_id, events)` — builds Meeting from
 *     an ordered event sequence (full event-sourcing reconstruction)
 *
 * The `spawned_tasks` field on `Meeting` is the canonical output of the
 * `resolve` stage: any tasks the orchestrator creates in response to
 * protocol decisions are stored here so the Meeting entity is self-contained.
 *
 * Relationship to agent/room ontology:
 *   • `room_id` links the Meeting to a `RoomDef` in the room registry
 *   • `participant_ids` maps to agent IDs that are managed by the agent store
 *   • The meeting-store projects a `Meeting` entity per active session so the
 *     3D scene can render the correct stage indicator inside the room mesh
 */

import type { ConitensEvent } from "./event.js";
import type { Vec3 } from "./layout.js";
import type { MeetingOutcome } from "./meeting.js";
import {
  isMeetingStartedPayload,
  isMeetingEndedPayload,
  isMeetingParticipantJoinedPayload,
  isMeetingParticipantLeftPayload,
  isMeetingDeliberationPayload,
  isMeetingResolvedPayload,
  isMeetingTaskSpawnedPayload,
} from "./meeting.js";

// ---------------------------------------------------------------------------
// Protocol stage — the four canonical phases of a meeting
// ---------------------------------------------------------------------------

/**
 * Ordered tuple of canonical meeting protocol stages.
 *
 * The lifecycle flows left-to-right:
 *   convene → deliberate → resolve → adjourn
 *
 * Stages are immutable string literals so they can be used as discriminant
 * keys in switch statements and as Zustand partial-reset payloads.
 */
export const MEETING_STAGES = [
  "convene",
  "deliberate",
  "resolve",
  "adjourn",
] as const;

export type MeetingStage = (typeof MEETING_STAGES)[number];

/** O(1) membership check for meeting stages. */
export const MEETING_STAGE_SET: ReadonlySet<string> = new Set(MEETING_STAGES);

/** Type guard — narrows an unknown string to `MeetingStage`. */
export function isMeetingStage(s: unknown): s is MeetingStage {
  return typeof s === "string" && MEETING_STAGE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Stage transition table
// ---------------------------------------------------------------------------

/**
 * Allowed transitions between meeting stages.
 *
 * Design rationale:
 *   • Forward-only for `convene → deliberate → resolve → adjourn`
 *   • `deliberate` may return to `convene` if the deliberation is rejected
 *     and the meeting must re-open the floor for new proposals.
 *   • `adjourn` is terminal — no outgoing transitions.
 *
 * ```
 *  convene ──► deliberate ──► resolve ──► adjourn
 *     ◄────────────────┘
 * ```
 */
export const VALID_MEETING_STAGE_TRANSITIONS: Readonly<
  Record<MeetingStage, readonly MeetingStage[]>
> = {
  convene:    ["deliberate", "adjourn"],   // adjourn covers early cancellation
  deliberate: ["resolve", "convene"],      // convene = rejection / re-floor
  resolve:    ["adjourn"],                 // once resolved, meeting ends
  adjourn:    [],                          // terminal
};

/**
 * Returns `true` iff transitioning `from` → `to` is permitted by the
 * meeting protocol state machine.
 *
 * @example
 * canMeetingStageTransition("convene", "deliberate") // true
 * canMeetingStageTransition("resolve", "convene")    // false
 */
export function canMeetingStageTransition(
  from: MeetingStage,
  to:   MeetingStage,
): boolean {
  return VALID_MEETING_STAGE_TRANSITIONS[from].includes(to);
}

/** Returns `true` if the stage is terminal (no outgoing transitions). */
export function isMeetingStageTerminal(stage: MeetingStage): boolean {
  return VALID_MEETING_STAGE_TRANSITIONS[stage].length === 0;
}

// ---------------------------------------------------------------------------
// Meeting status — broader lifecycle including pre-start and error states
// ---------------------------------------------------------------------------

/**
 * High-level status of a Meeting instance.
 *
 * `MeetingStatus` captures states that exist outside the four protocol stages:
 *   • `scheduled`    — intent created; meeting has not yet begun
 *   • `convening`    — stage = "convene"; session is open
 *   • `deliberating` — stage = "deliberate"; structured deliberation underway
 *   • `resolving`    — stage = "resolve"; outcome being finalised
 *   • `adjourned`    — stage = "adjourn"; meeting concluded normally
 *   • `cancelled`    — meeting was cancelled before or during the session
 *   • `error`        — meeting ended due to an unexpected error
 */
export type MeetingStatus =
  | "scheduled"
  | "convening"
  | "deliberating"
  | "resolving"
  | "adjourned"
  | "cancelled"
  | "error";

/** Maps the active protocol stage to its corresponding `MeetingStatus`. */
export const STAGE_TO_STATUS: Readonly<Record<MeetingStage, MeetingStatus>> = {
  convene:    "convening",
  deliberate: "deliberating",
  resolve:    "resolving",
  adjourn:    "adjourned",
};

// ---------------------------------------------------------------------------
// Spawned task — output produced at the resolve stage
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of a task produced when a Meeting reaches the `resolve`
 * stage.
 *
 * This is a lightweight local copy; the authoritative state is held in the
 * task-store and on the orchestrator.  The Meeting entity keeps its own
 * spawned-task list so the domain object is self-contained and queryable
 * without joining external stores.
 */
export type SpawnedTaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * A work-item produced when a Meeting's CollaborationSession reaches the
 * `resolve` protocol stage and a ProtocolResolution is accepted.
 *
 * `SpawnedTask` is the canonical **output** of the meeting convocation cycle.
 * Its presence on the `Meeting` entity closes the loop between deliberation
 * and concrete action.
 */
export interface SpawnedTask {
  /** Unique task identifier (correlates with task-store entries). */
  task_id:       string;
  /** Session (meeting) that produced this task. */
  session_id:    string;
  /** Resolution artefact that triggered this task. */
  resolution_id: string;
  /** Short human-readable title of the task. */
  title:         string;
  /** Full description of the work to be done. */
  description:   string;
  /** agent_id or user_id to whom the task is assigned. */
  assigned_to:   string;
  /** Priority level 1 (lowest) – 5 (highest). */
  priority:      1 | 2 | 3 | 4 | 5;
  /** Current lifecycle status of this spawned task. */
  status:        SpawnedTaskStatus;
  /** ISO 8601 timestamp when this task was spawned. */
  spawned_at:    string;
  /** Arbitrary metadata from the orchestrator. */
  metadata:      Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Protocol decision & resolution — artefacts produced during deliberation
// ---------------------------------------------------------------------------

/**
 * A single decision recorded by an agent during the `deliberate` stage.
 */
export interface ProtocolDecision {
  decision_id:   string;
  content:       string;
  decided_by:    string;   // agent_id or user_id
  decided_at:    string;   // ISO 8601
  decision_type: "accept" | "reject" | "defer" | "modify";
  rationale?:    string;
  metadata?:     Record<string, unknown>;
}

/**
 * The final resolution artefact produced when a meeting advances from
 * `deliberate` to `resolve`.
 */
export interface ProtocolResolution {
  resolution_id: string;
  outcome:       "accepted" | "rejected" | "deferred" | "modified" | "abandoned";
  summary:       string;
  resolved_by:   string;   // agent_id, user_id, or "system"
  resolved_at:   string;   // ISO 8601
  decisions:     ProtocolDecision[];
  metadata?:     Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Meeting entity — the canonical domain object
// ---------------------------------------------------------------------------

/**
 * Participant entry within a Meeting.
 * Carries the agent/user identity, their semantic kind, and their meeting role.
 */
export interface MeetingParticipant {
  participant_id:   string;
  participant_kind: "agent" | "user" | "system";
  role:             string;   // e.g. "facilitator" | "contributor" | "observer"
}

/**
 * The canonical Meeting entity.
 *
 * A `Meeting` is a first-class domain object representing a collaboration
 * session inside a room of the 3D command-center.  It embeds its full
 * protocol history (decisions, resolution) and its output (`spawned_tasks`).
 *
 * **Fields at a glance:**
 *
 * Identity:
 *   - `meeting_id`    — globally unique identifier
 *   - `room_id`       — the room where the meeting takes place (links to RoomDef)
 *   - `title`         — human-readable meeting title
 *   - `agenda`        — optional agenda description
 *
 * Protocol state machine:
 *   - `stage`         — current stage: convene | deliberate | resolve | adjourn
 *   - `status`        — derived high-level status (includes scheduled/error/cancelled)
 *
 * Participants (wired into the agent ontology):
 *   - `participants`  — agents / users currently in the meeting
 *
 * Temporal:
 *   - `scheduled_at`  — ISO 8601 timestamp when the meeting was scheduled
 *   - `started_at`    — ISO 8601 timestamp when the meeting began (convene stage)
 *   - `ended_at`      — ISO 8601 timestamp when the meeting adjourned
 *
 * Deliberation artefacts:
 *   - `decisions`     — protocol decisions recorded during deliberation
 *   - `resolution`    — final resolution artefact (present after resolve stage)
 *
 * Output field:
 *   - `spawned_tasks` — tasks produced at the resolve stage (canonical output)
 *
 * Audit:
 *   - `outcome`       — final outcome (completed|cancelled|timed_out|error)
 *   - `event_count`   — how many events have been applied to this entity
 */
export interface Meeting {
  // ── Identity ────────────────────────────────────────────────────────────
  meeting_id:   string;
  room_id:      string;
  title:        string;
  agenda:       string;

  // ── Protocol state machine ───────────────────────────────────────────────
  /**
   * Current stage of the four-phase protocol state machine.
   * Also exposed as `protocol_phase` in the entity schema (they are the
   * same value — `stage` is the runtime field, `protocol_phase` is the
   * canonical ontology name).
   */
  stage:          MeetingStage;
  /** Convenience alias — mirrors `stage` for ontology schema consumers. */
  protocol_phase: MeetingStage;
  status:         MeetingStatus;

  // ── Participants (wired into agent/room ontology) ────────────────────────
  participants: MeetingParticipant[];
  /**
   * Flat list of participating agent (and user) IDs.
   * Derived from `participants`; kept in sync by `applyMeetingEvent()`.
   * Satisfies the `participant_agent_ids` field in the entity schema.
   */
  participant_agent_ids: string[];

  // ── Spatial gather point (Sub-AC 10.1) ──────────────────────────────────
  /**
   * 3D spatial coordinates (x/y/z) where agent avatars visually converge
   * inside the room mesh during the meeting.  null when no explicit gather
   * point has been set (the scene may use a room-centroid default instead).
   *
   * This field satisfies the `gather_coordinates` requirement in the
   * meeting entity schema (Sub-AC 10.1).
   */
  gather_coordinates: Vec3 | null;

  // ── Temporal ────────────────────────────────────────────────────────────
  scheduled_at: string | null;
  started_at:   string | null;
  ended_at:     string | null;

  // ── Deliberation artefacts ───────────────────────────────────────────────
  decisions:    ProtocolDecision[];
  resolution:   ProtocolResolution | null;

  // ── Output fields (spawned at the resolve stage) ─────────────────────────
  spawned_tasks: SpawnedTask[];
  /**
   * Flat list of spawned task IDs.
   * Derived from `spawned_tasks`; kept in sync by `applyMeetingEvent()`.
   * Satisfies the `spawned_task_ids` field in the entity schema (Sub-AC 10.1).
   */
  spawned_task_ids: string[];

  // ── Audit ────────────────────────────────────────────────────────────────
  outcome:      MeetingOutcome | null;
  event_count:  number;
}

// ---------------------------------------------------------------------------
// Factory — createMeeting
// ---------------------------------------------------------------------------

/**
 * Input accepted by `createMeeting()`.
 */
export interface CreateMeetingInput {
  meeting_id:          string;
  room_id:             string;
  title?:              string;
  agenda?:             string;
  scheduled_at?:       string;
  started_at?:         string;
  /** Optional initial 3D gather coordinates for the meeting location in the room. */
  gather_coordinates?: Vec3 | null;
}

/**
 * Creates a new Meeting entity in the `convene` stage with empty collections.
 *
 * @example
 * ```ts
 * const meeting = createMeeting({
 *   meeting_id: "mtg-001",
 *   room_id:    "ops-control",
 *   title:      "Sprint Planning",
 * });
 * // meeting.stage === "convene"
 * // meeting.spawned_tasks === []
 * ```
 */
export function createMeeting(input: CreateMeetingInput): Meeting {
  const initialStage: MeetingStage = "convene";
  return {
    meeting_id:            input.meeting_id,
    room_id:               input.room_id,
    title:                 input.title ?? "",
    agenda:                input.agenda ?? "",
    stage:                 initialStage,
    protocol_phase:        initialStage,
    status:                input.scheduled_at && !input.started_at ? "scheduled" : "convening",
    participants:          [],
    participant_agent_ids: [],
    gather_coordinates:    input.gather_coordinates ?? null,
    scheduled_at:          input.scheduled_at ?? null,
    started_at:            input.started_at ?? null,
    ended_at:              null,
    decisions:             [],
    resolution:            null,
    spawned_tasks:         [],
    spawned_task_ids:      [],
    outcome:               null,
    event_count:           0,
  };
}

// ---------------------------------------------------------------------------
// Reducer — applyMeetingEvent
// ---------------------------------------------------------------------------

/**
 * Pure reducer that advances a Meeting entity by applying a single
 * ConitensEvent.  Returns a new Meeting object (immutable update).
 *
 * Handles all seven canonical meeting event types:
 *   - meeting.scheduled          → sets scheduled_at, status → "scheduled"
 *   - meeting.started            → sets started_at, stage → "convene", status → "convening"
 *   - meeting.participant.joined → adds to participants
 *   - meeting.participant.left   → removes from participants
 *   - meeting.deliberation       → stage → "deliberate", status → "deliberating"
 *   - meeting.resolved           → stage → "resolve", status → "resolving", records resolution
 *   - meeting.ended              → stage → "adjourn", status → outcome-derived, sets ended_at
 *
 * Events whose `type` does not match a meeting event type are silently
 * ignored so callers can safely fold a mixed event stream.
 *
 * @param meeting - Current meeting state (not mutated)
 * @param event   - ConitensEvent to apply
 * @returns       New Meeting with the event applied
 */
export function applyMeetingEvent(meeting: Meeting, event: ConitensEvent): Meeting {
  const next: Meeting = { ...meeting, event_count: meeting.event_count + 1 };

  switch (event.type) {
    // ── meeting.scheduled ─────────────────────────────────────────────────
    case "meeting.scheduled": {
      if (!("meeting_id" in event.payload)) break;
      const p = event.payload as { scheduled_at_iso?: string; title?: string; agenda?: string };
      return {
        ...next,
        title:        p.title ?? next.title,
        agenda:       p.agenda ?? next.agenda,
        scheduled_at: p.scheduled_at_iso ?? next.scheduled_at,
        status:       "scheduled",
      };
    }

    // ── meeting.started ───────────────────────────────────────────────────
    case "meeting.started": {
      if (!isMeetingStartedPayload(event.payload)) break;
      const p = event.payload;
      const newParticipants: MeetingParticipant[] = p.participant_ids.map(
        (id: string) => ({ participant_id: id, participant_kind: "agent", role: "contributor" }),
      );
      const newParticipantAgentIds: string[] = newParticipants.map((pt) => pt.participant_id);
      return {
        ...next,
        room_id:               p.room_id,
        title:                 p.title ?? next.title,
        agenda:                p.agenda ?? next.agenda,
        stage:                 "convene",
        protocol_phase:        "convene",
        status:                "convening",
        started_at:            new Date(event.ts).toISOString(),
        participants:          newParticipants,
        participant_agent_ids: newParticipantAgentIds,
      };
    }

    // ── meeting.participant.joined ────────────────────────────────────────
    case "meeting.participant.joined": {
      if (!isMeetingParticipantJoinedPayload(event.payload)) break;
      const p = event.payload;
      const alreadyIn = next.participants.some(
        (pt) => pt.participant_id === p.participant_id,
      );
      if (alreadyIn) return next;
      const newParticipants: MeetingParticipant[] = [
        ...next.participants,
        {
          participant_id:   p.participant_id,
          participant_kind: p.participant_kind,
          role:             p.role ?? "contributor",
        },
      ];
      return {
        ...next,
        participants:          newParticipants,
        participant_agent_ids: newParticipants.map((pt) => pt.participant_id),
      };
    }

    // ── meeting.participant.left ──────────────────────────────────────────
    case "meeting.participant.left": {
      if (!isMeetingParticipantLeftPayload(event.payload)) break;
      const p = event.payload;
      const newParticipants = next.participants.filter(
        (pt) => pt.participant_id !== p.participant_id,
      );
      return {
        ...next,
        participants:          newParticipants,
        participant_agent_ids: newParticipants.map((pt) => pt.participant_id),
      };
    }

    // ── meeting.deliberation ──────────────────────────────────────────────
    case "meeting.deliberation": {
      if (!isMeetingDeliberationPayload(event.payload)) break;
      // Validate stage transition
      if (!canMeetingStageTransition(next.stage, "deliberate")) break;
      return {
        ...next,
        stage:          "deliberate",
        protocol_phase: "deliberate",
        status:         "deliberating",
      };
    }

    // ── meeting.resolved ──────────────────────────────────────────────────
    case "meeting.resolved": {
      if (!isMeetingResolvedPayload(event.payload)) break;
      // Validate stage transition
      if (!canMeetingStageTransition(next.stage, "resolve")) break;
      const p = event.payload;
      const resolution: ProtocolResolution = {
        resolution_id: p.resolution_id,
        outcome:       p.outcome,
        summary:       p.summary,
        resolved_by:   p.resolved_by,
        resolved_at:   new Date(event.ts).toISOString(),
        decisions:     [],
      };
      return {
        ...next,
        stage:          "resolve",
        protocol_phase: "resolve",
        status:         "resolving",
        resolution,
      };
    }

    // ── meeting.task.spawned ──────────────────────────────────────────────
    case "meeting.task.spawned": {
      if (!isMeetingTaskSpawnedPayload(event.payload)) break;
      const p = event.payload;
      // Idempotent: skip if task_id already in list
      if (next.spawned_task_ids.includes(p.task_id)) return next;
      return {
        ...next,
        spawned_task_ids: [...next.spawned_task_ids, p.task_id],
      };
    }

    // ── meeting.ended ─────────────────────────────────────────────────────
    case "meeting.ended": {
      if (!isMeetingEndedPayload(event.payload)) break;
      const p = event.payload;
      const terminalStatus: MeetingStatus =
        p.outcome === "cancelled"  ? "cancelled"  :
        p.outcome === "error"      ? "error"       :
        "adjourned";
      return {
        ...next,
        stage:          "adjourn",
        protocol_phase: "adjourn",
        status:         terminalStatus,
        ended_at:       new Date(event.ts).toISOString(),
        outcome:        p.outcome ?? "completed",
      };
    }

    default:
      break;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Event-sourcing reconstruction — projectMeetingFromEvents
// ---------------------------------------------------------------------------

/**
 * Reconstructs a `Meeting` entity by folding an ordered sequence of
 * ConitensEvents from the event log.
 *
 * Only events matching `meeting_id` in their payload are applied; all others
 * are skipped.  The initial entity is created at the `convene` stage.
 *
 * @example
 * ```ts
 * const events = await eventLog.getByCorrelationId(meetingId);
 * const meeting = projectMeetingFromEvents(meetingId, "ops-control", events);
 * // meeting reflects the latest state
 * ```
 */
export function projectMeetingFromEvents(
  meeting_id: string,
  room_id:    string,
  events:     ConitensEvent[],
): Meeting {
  const initial = createMeeting({ meeting_id, room_id });

  return events
    .filter((e) => {
      const p = e.payload as Record<string, unknown>;
      return typeof p === "object" && p !== null && p["meeting_id"] === meeting_id;
    })
    .reduce<Meeting>((acc, event) => applyMeetingEvent(acc, event), initial);
}

// ---------------------------------------------------------------------------
// Stage advancement helper
// ---------------------------------------------------------------------------

/**
 * Advances a meeting to the next stage in the canonical sequence if the
 * transition is valid.  Returns a new Meeting (immutable) on success, or
 * `null` if the transition is invalid.
 *
 * This is a convenience wrapper around `canMeetingStageTransition` + spread.
 * It does NOT create a ConitensEvent — that is the caller's responsibility.
 *
 * @example
 * ```ts
 * const updated = advanceMeetingStage(meeting, "deliberate");
 * if (updated) {
 *   emitMeetingDeliberationEvent(updated);
 * }
 * ```
 */
export function advanceMeetingStage(
  meeting:  Meeting,
  newStage: MeetingStage,
): Meeting | null {
  if (!canMeetingStageTransition(meeting.stage, newStage)) return null;
  return {
    ...meeting,
    stage:          newStage,
    protocol_phase: newStage,
    status:         STAGE_TO_STATUS[newStage],
  };
}

// ---------------------------------------------------------------------------
// Spawned task helpers
// ---------------------------------------------------------------------------

/**
 * Appends a `SpawnedTask` to a meeting's `spawned_tasks` list.
 * Idempotent: if `task_id` is already present, the meeting is returned unchanged.
 *
 * @returns New Meeting with the task appended, or the original meeting if
 *          the task_id was already present.
 */
export function appendSpawnedTask(meeting: Meeting, task: SpawnedTask): Meeting {
  if (meeting.spawned_tasks.some((t) => t.task_id === task.task_id)) {
    return meeting;
  }
  return {
    ...meeting,
    spawned_tasks:    [...meeting.spawned_tasks, task],
    spawned_task_ids: [...meeting.spawned_task_ids, task.task_id],
  };
}

/**
 * Updates the status of an existing `SpawnedTask` within a meeting.
 * If the task is not found, returns the meeting unchanged.
 */
export function updateSpawnedTaskStatus(
  meeting:  Meeting,
  task_id:  string,
  status:   SpawnedTaskStatus,
): Meeting {
  const idx = meeting.spawned_tasks.findIndex((t) => t.task_id === task_id);
  if (idx === -1) return meeting;

  const updated = meeting.spawned_tasks.slice();
  updated[idx] = { ...updated[idx], status };
  return { ...meeting, spawned_tasks: updated };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Type guard for the `Meeting` domain entity. */
export function isMeeting(v: unknown): v is Meeting {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m["meeting_id"]     === "string" &&
    typeof m["room_id"]        === "string" &&
    typeof m["stage"]          === "string" && isMeetingStage(m["stage"]) &&
    typeof m["protocol_phase"] === "string" && isMeetingStage(m["protocol_phase"]) &&
    typeof m["status"]         === "string" &&
    Array.isArray(m["participants"]) &&
    Array.isArray(m["participant_agent_ids"]) &&
    Array.isArray(m["decisions"]) &&
    Array.isArray(m["spawned_tasks"]) &&
    Array.isArray(m["spawned_task_ids"])
  );
}

/** Type guard for the `SpawnedTask` output entity. */
export function isSpawnedTask(v: unknown): v is SpawnedTask {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t["task_id"]       === "string" &&
    typeof t["session_id"]    === "string" &&
    typeof t["resolution_id"] === "string" &&
    typeof t["title"]         === "string" &&
    typeof t["assigned_to"]   === "string" &&
    typeof t["priority"]      === "number" &&
    typeof t["status"]        === "string" &&
    typeof t["spawned_at"]    === "string"
  );
}
