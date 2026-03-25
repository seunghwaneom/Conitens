/**
 * meeting-store.ts — Zustand store for active collaboration sessions.
 *
 * Sub-AC 10b: Agent collaboration session spawning.
 *
 * Tracks all meeting sessions spawned by the orchestration backend.
 * Sessions are recorded here when:
 *   1. The user convenes a meeting via ConveneMeetingDialog → spatialStore.convokeMeeting()
 *      responds with a SessionHandle that gets dispatched here.
 *   2. Live meeting.* WebSocket events arrive from the orchestrator bus and
 *      are forwarded here by use-orchestrator-ws.ts.
 *
 * Design principles:
 *   - Event-sourced: every state change is recorded as a MeetingStoreEvent
 *   - Append-only event log for record transparency / replay
 *   - All session data flows from the backend SessionHandle
 *   - No direct store-to-store imports (uses lazy .getState() pattern)
 *
 * Data flow:
 *
 *   ConveneMeetingDialog
 *     → spatial-store.convokeMeeting()
 *       → POST http://localhost:8081/api/convene
 *         → MeetingHttpServer creates CollaborationSession
 *           → returns SessionHandle JSON
 *         ← useMeetingStore.upsertSession(handle)
 *           → session visible in ActiveSessionsPanel
 *
 *   WebSocket bus (meeting.started | meeting.ended | meeting.participant.*)
 *     → use-orchestrator-ws.ts
 *       → useMeetingStore.handleLiveMeetingEvent(event)
 */

import { create } from "zustand";
import {
  type Meeting,
  type MeetingStage,
  type SpawnedTask as ProtocolSpawnedTask,
  createMeeting,
  canMeetingStageTransition,
  advanceMeetingStage,
  appendSpawnedTask,
  STAGE_TO_STATUS,
} from "@conitens/protocol";

// Re-export Meeting and MeetingStage for consumers that only import from the store
export type { Meeting, MeetingStage };

// Lazy import for agent store (avoids circular dep — accessed via .getState() only)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _agentStoreRef: (() => {
  gatherAgentsForMeeting: (meetingId: string, roomId: string, participantIds: string[]) => void;
  disperseAgentsFromMeeting: (meetingId: string) => void;
}) | null = null;

/**
 * Inject the agent store getter.
 * Called from App.tsx once both stores are initialized.
 * Enables meeting-store to trigger spatial gathering without a circular import.
 */
export function injectAgentStoreRefForMeeting(
  getState: () => {
    gatherAgentsForMeeting: (meetingId: string, roomId: string, participantIds: string[]) => void;
    disperseAgentsFromMeeting: (meetingId: string) => void;
  },
): void {
  _agentStoreRef = getState;
}

// ---------------------------------------------------------------------------
// Types — mirroring SessionHandle from packages/core (no runtime import needed)
// ---------------------------------------------------------------------------

export type MeetingRole =
  | "facilitator"
  | "contributor"
  | "context-provider"
  | "reviewer"
  | "validator"
  | "stakeholder"
  | "observer";

// ---------------------------------------------------------------------------
// Spawned task types — mirrored from packages/core (Sub-AC 10c)
// ---------------------------------------------------------------------------

/**
 * SpawnedTaskStatus — lifecycle status of a task produced at resolution.
 */
export type SpawnedTaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * SpawnedTask — a work-item produced when a CollaborationSession reaches
 * the `resolve` protocol phase.
 *
 * Mirrors packages/core/src/meeting-orchestrator/collaboration-session.ts#SpawnedTask
 */
export interface SpawnedTask {
  task_id:       string;
  session_id:    string;
  resolution_id: string;
  title:         string;
  description:   string;
  assigned_to:   string;
  priority:      1 | 2 | 3 | 4 | 5;
  status:        SpawnedTaskStatus;
  spawned_at:    string;
  metadata:      Record<string, unknown>;
}

export type ParticipantKind = "agent" | "user" | "system";
export type SessionStatus    = "initializing" | "active" | "ended" | "error";

export interface SessionParticipant {
  participant_id:   string;
  participant_kind: ParticipantKind;
  assigned_role:    MeetingRole;
  native_role?:     string;
  capabilities:     string[];
}

export interface SharedContext {
  meeting_id: string;
  topic:      string;
  agenda:     string;
  workspace:  Record<string, unknown>;
  created_at: string;
}

export interface ChannelInfo {
  channel_id:      string;
  message_count:   number;
  last_message_at: string | null;
}

/**
 * ProtocolDecision — mirrors packages/core ProtocolDecision (Sub-AC 10c).
 */
export interface ProtocolDecision {
  decision_id:   string;
  content:       string;
  decided_by:    string;
  decided_at:    string;
  decision_type: "accept" | "reject" | "defer" | "modify";
  rationale?:    string;
  metadata?:     Record<string, unknown>;
}

/**
 * ProtocolResolution — mirrors packages/core ProtocolResolution (Sub-AC 10c).
 */
export interface ProtocolResolution {
  resolution_id: string;
  outcome:       "accepted" | "rejected" | "deferred" | "modified" | "abandoned";
  summary:       string;
  resolved_by:   string;
  resolved_at:   string;
  decisions:     ProtocolDecision[];
  metadata?:     Record<string, unknown>;
}

/**
 * ProtocolState — mirrors packages/core ProtocolState (Sub-AC 10c).
 */
export interface ProtocolState {
  phase:         "request" | "deliberate" | "resolve" | "abandoned";
  request:       Record<string, unknown> | null;
  decisions:     ProtocolDecision[];
  resolution:    ProtocolResolution | null;
  /** Tasks spawned when the session reached the `resolve` phase. */
  spawned_tasks: SpawnedTask[];
}

/**
 * SessionHandle — the live session descriptor received from the backend.
 * Matches the `SessionHandle` interface in packages/core/src/meeting-orchestrator.
 */
export interface SessionHandle {
  session_id:     string;
  status:         SessionStatus;
  room_id:        string;
  title?:         string;
  started_at:     string;
  ended_at:       string | null;
  participants:   SessionParticipant[];
  shared_context: SharedContext;
  channel:        ChannelInfo;
  /** Protocol state including spawned tasks (Sub-AC 10c). Optional for backward compat. */
  protocol?:      ProtocolState;
}

// ---------------------------------------------------------------------------
// Store events (append-only for record transparency)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Transcript — append-only per-session message feed (Sub-AC 10c)
// ---------------------------------------------------------------------------

/**
 * A single transcript entry in a meeting session.
 * Populated by meeting.message WebSocket events from the orchestrator.
 */
export interface TranscriptEntry {
  id:          string;
  ts:          number;
  speaker:     string;
  speakerKind: ParticipantKind;
  text:        string;
}

/** Maximum transcript entries kept per session (LRU tail-drop). */
const MAX_TRANSCRIPT_ENTRIES = 200;

export type MeetingStoreEventType =
  | "meeting.session_received"     // new session handle received from backend
  | "meeting.session_updated"      // session state updated from WS event
  | "meeting.session_ended"        // session transitioned to ended
  | "meeting.participant_joined"   // late participant arrival
  | "meeting.participant_left"     // participant departure
  | "meeting.convene_failed"       // backend returned error for convene request
  | "meeting.live_event_ingested"  // raw WS meeting event processed
  | "meeting.transcript_appended"  // transcript entry added to a session
  | "meeting.terminate_requested"  // user requested session termination
  | "meeting.terminate_failed"     // termination request failed
  // ── Sub-AC 10a: Spatial gathering events ──────────────────────────
  | "meeting.agents_gathering"     // agents repositioned to meeting room
  | "meeting.agents_dispersed"     // agents returned to home rooms
  // ── Sub-AC 10c: Task spawning events ──────────────────────────────
  | "meeting.task_spawned"         // task produced at resolution
  | "meeting.resolution_received"; // protocol resolved event processed

export interface MeetingStoreEvent {
  id:        string;
  type:      MeetingStoreEventType;
  ts:        number;
  sessionId: string;
  payload:   Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Store state + actions
// ---------------------------------------------------------------------------

export interface MeetingStoreState {
  /** Active and recently-ended sessions keyed by session_id */
  sessions: Record<string, SessionHandle>;

  /** Append-only event log for record transparency */
  events: MeetingStoreEvent[];

  /**
   * ID of the session currently selected for detail view.
   * Null when no session is selected.
   */
  selectedSessionId: string | null;

  /**
   * Per-session transcript feeds (Sub-AC 10c).
   * Keyed by session_id, value is ordered array of transcript entries.
   * Populated by meeting.message WebSocket events.
   */
  transcripts: Record<string, TranscriptEntry[]>;

  /**
   * Per-session spawned task lists (Sub-AC 10c).
   * Keyed by session_id, value is ordered array of SpawnedTask objects.
   * Populated by meeting.task.spawned WebSocket events and upsertSession calls.
   */
  spawnedTasks: Record<string, SpawnedTask[]>;

  /**
   * Per-session Meeting domain entities (Sub-AC 10a).
   * Keyed by session_id (= meeting_id).
   * Projected from SessionHandle and updated on stage transitions.
   * The Meeting entity carries: stage, status, participants, spawned_tasks,
   * decisions, resolution — the full protocol-state-machine view.
   */
  meetingEntities: Record<string, Meeting>;

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Upsert (create or update) a session from a SessionHandle.
   * Called after a successful POST /api/convene response.
   */
  upsertSession: (handle: SessionHandle) => void;

  /**
   * Handle a raw meeting WebSocket event from the orchestrator bus.
   * Dispatched by use-orchestrator-ws.ts when a meeting.* event arrives.
   */
  handleLiveMeetingEvent: (event: {
    type: string;
    payload: Record<string, unknown>;
    ts?: string;
  }) => void;

  /**
   * Select a session for detail display.
   */
  selectSession: (sessionId: string | null) => void;

  /**
   * Append a transcript entry to a session's feed.
   * Called by handleLiveMeetingEvent when a meeting.message event arrives.
   */
  appendTranscript: (sessionId: string, entry: Omit<TranscriptEntry, "id">) => void;

  /**
   * Request termination of an active session.
   * Fires a DELETE /api/sessions/:id HTTP request (fire-and-forget with error recording).
   * Optimistically marks the session as "ended" and records a terminate event.
   * (Sub-AC 10c — termination controls)
   */
  terminateSession: (sessionId: string) => Promise<void>;

  /**
   * Get a session handle by ID (computed getter).
   */
  getSession: (sessionId: string) => SessionHandle | undefined;

  /**
   * Get all active sessions.
   */
  getActiveSessions: () => SessionHandle[];

  /**
   * Get the session for a given room (if any is active there).
   */
  getSessionForRoom: (roomId: string) => SessionHandle | undefined;

  /**
   * Get all participant IDs across all currently active sessions.
   * Used by AgentAvatar to check meeting membership efficiently.
   */
  getActiveParticipantIds: () => Set<string>;

  /**
   * Get the active session for a given participant ID, if any.
   * Returns the first active session in which the agent is listed.
   */
  getSessionForParticipant: (participantId: string) => SessionHandle | undefined;

  /**
   * Get all spawned tasks for a given session (Sub-AC 10c).
   * Returns an empty array if no tasks have been spawned yet.
   */
  getSpawnedTasksForSession: (sessionId: string) => SpawnedTask[];

  /**
   * Record a spawned task from a WebSocket event or HTTP response (Sub-AC 10c).
   * Idempotent: if the task_id already exists in the session's list, it is skipped.
   */
  recordSpawnedTask: (sessionId: string, task: SpawnedTask) => void;

  // ── Sub-AC 10a: Meeting entity & protocol stage machine ──────────────────

  /**
   * Get the Meeting domain entity for a session (Sub-AC 10a).
   * Returns the protocol-state-machine view: stage, status, participants,
   * spawned_tasks, decisions, resolution.
   * Returns undefined if no session exists with that ID.
   */
  getMeetingEntity: (sessionId: string) => Meeting | undefined;

  /**
   * Get all Meeting entities currently in a given stage (Sub-AC 10a).
   */
  getMeetingsByStage: (stage: MeetingStage) => Meeting[];

  /**
   * Programmatically advance a meeting to a new protocol stage (Sub-AC 10a).
   *
   * Validates the transition using `canMeetingStageTransition`.
   * Records a MeetingStoreEvent for audit transparency.
   * Returns `true` if the transition was applied; `false` if invalid.
   *
   * Does NOT emit a ConitensEvent to the event log — the caller is
   * responsible for persisting the corresponding meeting.* event via
   * the command-file pipeline.
   */
  progressMeetingStage: (sessionId: string, newStage: MeetingStage) => boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _eventCounter = 0;
function nextEventId(): string {
  return `mse-${Date.now()}-${++_eventCounter}`;
}

/**
 * Sub-AC 10a: Trigger spatial agent gathering for a newly-active session.
 *
 * Invokes agentStore.gatherAgentsForMeeting() via the lazy reference injected
 * from App.tsx.  Only fires when:
 *   - Session status === "active"
 *   - Session has at least one participant
 *   - agent store reference is available
 *
 * Records a meeting.agents_gathering event for audit transparency.
 */
function triggerSpatialGathering(
  handle: SessionHandle,
  recordEvent: (evtType: MeetingStoreEventType, sessionId: string, payload: Record<string, unknown>) => void,
): void {
  if (handle.status !== "active") return;

  const agentParticipantIds = handle.participants
    .filter((p) => p.participant_kind === "agent")
    .map((p) => p.participant_id);

  if (agentParticipantIds.length === 0) return;

  if (_agentStoreRef) {
    _agentStoreRef().gatherAgentsForMeeting(
      handle.session_id,
      handle.room_id,
      agentParticipantIds,
    );
    recordEvent("meeting.agents_gathering", handle.session_id, {
      meeting_id: handle.session_id,
      room_id: handle.room_id,
      agent_participant_ids: agentParticipantIds,
      participant_count: agentParticipantIds.length,
    });
  }
}

/**
 * Sub-AC 10a: Trigger spatial dispersal when a session ends.
 */
function triggerSpatialDispersal(
  sessionId: string,
  recordEvent: (evtType: MeetingStoreEventType, sessionId: string, payload: Record<string, unknown>) => void,
): void {
  if (_agentStoreRef) {
    _agentStoreRef().disperseAgentsFromMeeting(sessionId);
    recordEvent("meeting.agents_dispersed", sessionId, {
      meeting_id: sessionId,
    });
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Internal helper — build a Meeting entity from a SessionHandle
// ---------------------------------------------------------------------------

function sessionHandleToMeeting(handle: SessionHandle): Meeting {
  const meeting = createMeeting({
    meeting_id:  handle.session_id,
    room_id:     handle.room_id,
    title:       handle.title,
    started_at:  handle.started_at,
  });

  // Determine stage from protocol state if present
  let stage: MeetingStage = "convene";
  if (handle.protocol) {
    const phaseMap: Record<string, MeetingStage> = {
      request:     "convene",
      deliberate:  "deliberate",
      resolve:     "resolve",
      abandoned:   "adjourn",
    };
    stage = phaseMap[handle.protocol.phase] ?? "convene";
  }
  if (handle.status === "ended") {
    stage = "adjourn";
  }

  const participants = handle.participants.map((p) => ({
    participant_id:   p.participant_id,
    participant_kind: p.participant_kind,
    role:             p.assigned_role ?? "contributor",
  }));

  // Map existing spawned tasks from the store format to the protocol format
  const spawnedTasks: ProtocolSpawnedTask[] = (handle.protocol?.spawned_tasks ?? []).map((t) => ({
    task_id:       t.task_id,
    session_id:    t.session_id,
    resolution_id: t.resolution_id,
    title:         t.title,
    description:   t.description,
    assigned_to:   t.assigned_to,
    priority:      t.priority,
    status:        t.status,
    spawned_at:    t.spawned_at,
    metadata:      t.metadata,
  }));

  const statusMap: Record<MeetingStage, import("@conitens/protocol").MeetingStatus> = {
    convene:    handle.status === "ended" ? "adjourned" : "convening",
    deliberate: "deliberating",
    resolve:    "resolving",
    adjourn:    handle.status === "error" ? "error" : "adjourned",
  };

  return {
    ...meeting,
    stage,
    status:       statusMap[stage],
    participants,
    spawned_tasks: spawnedTasks,
    ended_at:     handle.ended_at,
  };
}

export const useMeetingStore = create<MeetingStoreState>((set, get) => ({
  sessions:          {},
  events:            [],
  selectedSessionId: null,
  transcripts:       {},
  spawnedTasks:      {},
  meetingEntities:   {},

  // ── upsertSession ──────────────────────────────────────────────────────
  upsertSession: (handle) => {
    const isNew = !get().sessions[handle.session_id];
    const evt: MeetingStoreEvent = {
      id:        nextEventId(),
      type:      isNew ? "meeting.session_received" : "meeting.session_updated",
      ts:        Date.now(),
      sessionId: handle.session_id,
      payload: {
        session_id:   handle.session_id,
        room_id:      handle.room_id,
        status:       handle.status,
        participant_count: handle.participants.length,
      },
    };

    const meetingEntity = sessionHandleToMeeting(handle);

    set((state) => ({
      sessions:        { ...state.sessions, [handle.session_id]: handle },
      meetingEntities: { ...state.meetingEntities, [handle.session_id]: meetingEntity },
      events:          [...state.events, evt],
    }));

    // Sub-AC 10a: trigger spatial gathering when session becomes active with participants.
    // The recordEvent helper appends to the store's own event log for audit transparency.
    const recordGatheringEvent = (
      evtType: MeetingStoreEventType,
      sessionId: string,
      payload: Record<string, unknown>,
    ) => {
      set((state) => ({
        events: [
          ...state.events,
          { id: nextEventId(), type: evtType, ts: Date.now(), sessionId, payload },
        ],
      }));
    };

    if (handle.status === "active" && handle.participants.length > 0) {
      triggerSpatialGathering(handle, recordGatheringEvent);
    }
    if (handle.status === "ended") {
      triggerSpatialDispersal(handle.session_id, recordGatheringEvent);
    }

    // Sub-AC 10c: If the handle carries protocol.spawned_tasks, ingest them.
    if (handle.protocol?.spawned_tasks && handle.protocol.spawned_tasks.length > 0) {
      for (const task of handle.protocol.spawned_tasks) {
        get().recordSpawnedTask(handle.session_id, task);
      }
    }
  },

  // ── handleLiveMeetingEvent ─────────────────────────────────────────────
  handleLiveMeetingEvent: (event) => {
    const { type, payload } = event;
    const sessions          = get().sessions;

    const ingestEvt = (sessionId: string, evtType: MeetingStoreEventType): void => {
      set((state) => ({
        events: [
          ...state.events,
          {
            id:        nextEventId(),
            type:      evtType,
            ts:        Date.now(),
            sessionId,
            payload:   { ...payload, source_event_type: type },
          },
        ],
      }));
    };

    switch (type) {
      case "meeting.started": {
        const meetingId = String(payload["meeting_id"] ?? "");
        if (!meetingId) return;

        // Build a session handle from the event payload
        const handle: SessionHandle = {
          session_id: meetingId,
          status:     "active",
          room_id:    String(payload["room_id"] ?? ""),
          title:      payload["title"] != null ? String(payload["title"]) : undefined,
          started_at: event.ts ?? new Date().toISOString(),
          ended_at:   null,
          participants: [],   // participants arrive via participant.joined events
          shared_context: {
            meeting_id: meetingId,
            topic:      String(payload["title"] ?? payload["topic"] ?? "Meeting"),
            agenda:     String(payload["agenda"] ?? ""),
            workspace:  {},
            created_at: event.ts ?? new Date().toISOString(),
          },
          channel: {
            channel_id:      `ch-${meetingId}`,
            message_count:   0,
            last_message_at: null,
          },
        };

        // Only upsert if we don't already have a richer version from the HTTP response
        if (!sessions[meetingId]) {
          const meetingEntity = sessionHandleToMeeting(handle);
          set((state) => ({
            sessions:        { ...state.sessions, [meetingId]: handle },
            meetingEntities: { ...state.meetingEntities, [meetingId]: meetingEntity },
            events: [
              ...state.events,
              {
                id:        nextEventId(),
                type:      "meeting.session_received",
                ts:        Date.now(),
                sessionId: meetingId,
                payload:   { source: "ws_event", ...payload },
              },
            ],
          }));
        } else {
          ingestEvt(meetingId, "meeting.live_event_ingested");
        }

        // Sub-AC 10a: WS-sourced meeting.started may carry participant list.
        // Trigger spatial gathering if participants are known at this point.
        // (If participants arrive later via participant.joined events, they will
        //  be gathered individually when the session already has a room_id.)
        if (handle.participants.length > 0 && _agentStoreRef) {
          const agentIds = handle.participants
            .filter((p) => p.participant_kind === "agent")
            .map((p) => p.participant_id);
          if (agentIds.length > 0) {
            _agentStoreRef().gatherAgentsForMeeting(meetingId, handle.room_id, agentIds);
            ingestEvt(meetingId, "meeting.agents_gathering");
          }
        }
        break;
      }

      case "meeting.ended": {
        const meetingId = String(payload["meeting_id"] ?? "");
        if (!meetingId) return;

        const existing = sessions[meetingId];
        if (existing) {
          const updated: SessionHandle = {
            ...existing,
            status:   "ended",
            ended_at: event.ts ?? new Date().toISOString(),
          };
          const updatedEntity = sessionHandleToMeeting(updated);
          set((state) => ({
            sessions:        { ...state.sessions, [meetingId]: updated },
            meetingEntities: { ...state.meetingEntities, [meetingId]: updatedEntity },
            events: [
              ...state.events,
              {
                id:        nextEventId(),
                type:      "meeting.session_ended",
                ts:        Date.now(),
                sessionId: meetingId,
                payload:   { outcome: payload["outcome"] ?? "completed" },
              },
            ],
          }));
        } else {
          // Session not yet known — record a minimal ended handle
          set((state) => ({
            events: [
              ...state.events,
              {
                id:        nextEventId(),
                type:      "meeting.live_event_ingested",
                ts:        Date.now(),
                sessionId: meetingId,
                payload:   { source: "meeting.ended_unknown_session", ...payload },
              },
            ],
          }));
        }

        // Sub-AC 10a: Disperse agents back to their home rooms when meeting ends
        if (_agentStoreRef) {
          _agentStoreRef().disperseAgentsFromMeeting(meetingId);
          ingestEvt(meetingId, "meeting.agents_dispersed");
        }
        break;
      }

      case "meeting.participant.joined": {
        const meetingId     = String(payload["meeting_id"] ?? "");
        const participantId = String(payload["participant_id"] ?? "");
        if (!meetingId || !participantId) return;

        const existing = sessions[meetingId];
        if (!existing) {
          // Record the event for later reconciliation
          ingestEvt(meetingId, "meeting.participant_joined");
          return;
        }

        // Build participant from event payload
        const newParticipant: SessionParticipant = {
          participant_id:   participantId,
          participant_kind: (payload["participant_kind"] as ParticipantKind) ?? "agent",
          assigned_role:    (payload["role"] as MeetingRole) ?? "contributor",
          capabilities:     [],
        };

        // Idempotent: skip if already present
        const alreadyIn = existing.participants.some(
          (p) => p.participant_id === participantId,
        );
        if (!alreadyIn) {
          const updated: SessionHandle = {
            ...existing,
            participants: [...existing.participants, newParticipant],
          };
          set((state) => ({
            sessions: { ...state.sessions, [meetingId]: updated },
            events: [
              ...state.events,
              {
                id:        nextEventId(),
                type:      "meeting.participant_joined",
                ts:        Date.now(),
                sessionId: meetingId,
                payload:   { participant_id: participantId },
              },
            ],
          }));

          // Sub-AC 10a: If meeting is already active, gather the late-joining agent
          if (
            newParticipant.participant_kind === "agent" &&
            existing.status === "active" &&
            _agentStoreRef
          ) {
            // Re-gather with the full updated participant list (includes new arrival)
            const allAgentIds = [...updated.participants]
              .filter((p) => p.participant_kind === "agent")
              .map((p) => p.participant_id);
            if (allAgentIds.length > 0) {
              _agentStoreRef().gatherAgentsForMeeting(meetingId, existing.room_id, allAgentIds);
            }
          }
        }
        break;
      }

      case "meeting.participant.left": {
        const meetingId     = String(payload["meeting_id"] ?? "");
        const participantId = String(payload["participant_id"] ?? "");
        if (!meetingId || !participantId) return;

        const existing = sessions[meetingId];
        if (existing) {
          const updated: SessionHandle = {
            ...existing,
            participants: existing.participants.filter(
              (p) => p.participant_id !== participantId,
            ),
          };
          set((state) => ({
            sessions: { ...state.sessions, [meetingId]: updated },
            events: [
              ...state.events,
              {
                id:        nextEventId(),
                type:      "meeting.participant_left",
                ts:        Date.now(),
                sessionId: meetingId,
                payload:   { participant_id: participantId },
              },
            ],
          }));
        }
        break;
      }

      case "meeting.message": {
        // Transcript message from orchestrator (Sub-AC 10c)
        const meetingId     = String(payload["meeting_id"] ?? "");
        const speakerRaw    = payload["speaker"] ?? payload["participant_id"] ?? "system";
        const speaker       = String(speakerRaw);
        const speakerKind   = (payload["speaker_kind"] as ParticipantKind) ?? "agent";
        const text          = String(payload["text"] ?? payload["content"] ?? "");
        if (!meetingId || !text) break;

        get().appendTranscript(meetingId, {
          ts:          Date.now(),
          speaker,
          speakerKind,
          text,
        });
        break;
      }

      // ── Sub-AC 10c: Task spawned at resolution ────────────────────────
      case "meeting.task.spawned": {
        const sessionId = String(payload["session_id"] ?? "");
        if (!sessionId) break;

        // Build SpawnedTask from event payload
        const task: SpawnedTask = {
          task_id:       String(payload["task_id"] ?? `task-${Date.now()}`),
          session_id:    sessionId,
          resolution_id: String(payload["resolution_id"] ?? ""),
          title:         String(payload["title"] ?? ""),
          description:   String(payload["description"] ?? ""),
          assigned_to:   String(payload["assigned_to"] ?? "unassigned"),
          priority:      (typeof payload["priority"] === "number"
            ? payload["priority"]
            : 3) as 1 | 2 | 3 | 4 | 5,
          status:        (payload["status"] as SpawnedTaskStatus) ?? "pending",
          spawned_at:    String(payload["spawned_at"] ?? new Date().toISOString()),
          metadata:      (typeof payload["metadata"] === "object" && payload["metadata"] !== null && !Array.isArray(payload["metadata"]))
            ? payload["metadata"] as Record<string, unknown>
            : {},
        };

        get().recordSpawnedTask(sessionId, task);
        break;
      }

      // ── Sub-AC 10c: Protocol resolved event ───────────────────────────
      case "meeting.protocol.resolved": {
        const sessionId = String(payload["meeting_id"] ?? "");
        if (!sessionId) break;

        ingestEvt(sessionId, "meeting.resolution_received");
        break;
      }

      // ── Sub-AC 10a: Protocol stage transitions ─────────────────────────
      case "meeting.deliberation": {
        const meetingId = String(payload["meeting_id"] ?? "");
        if (!meetingId) break;

        const currentEntity = get().meetingEntities[meetingId];
        if (currentEntity && canMeetingStageTransition(currentEntity.stage, "deliberate")) {
          const advanced = advanceMeetingStage(currentEntity, "deliberate");
          if (advanced) {
            set((state) => ({
              meetingEntities: { ...state.meetingEntities, [meetingId]: advanced },
            }));
          }
        }
        ingestEvt(meetingId, "meeting.live_event_ingested");
        break;
      }

      case "meeting.resolved": {
        const meetingId = String(payload["meeting_id"] ?? "");
        if (!meetingId) break;

        const currentEntity = get().meetingEntities[meetingId];
        if (currentEntity && canMeetingStageTransition(currentEntity.stage, "resolve")) {
          const advanced = advanceMeetingStage(currentEntity, "resolve");
          if (advanced) {
            set((state) => ({
              meetingEntities: { ...state.meetingEntities, [meetingId]: advanced },
            }));
          }
        }
        ingestEvt(meetingId, "meeting.live_event_ingested");
        break;
      }

      default:
        // Unknown meeting event type — record for audit
        break;
    }
  },

  // ── selectSession ──────────────────────────────────────────────────────
  selectSession: (sessionId) => {
    set({ selectedSessionId: sessionId });
  },

  // ── appendTranscript (Sub-AC 10c) ──────────────────────────────────────
  appendTranscript: (sessionId, entry) => {
    const id = nextEventId();
    const fullEntry: TranscriptEntry = { ...entry, id };

    set((state) => {
      const prev = state.transcripts[sessionId] ?? [];
      // Tail-drop: keep only the most recent MAX_TRANSCRIPT_ENTRIES entries
      const next = prev.length >= MAX_TRANSCRIPT_ENTRIES
        ? [...prev.slice(-(MAX_TRANSCRIPT_ENTRIES - 1)), fullEntry]
        : [...prev, fullEntry];

      return {
        transcripts: { ...state.transcripts, [sessionId]: next },
        events: [
          ...state.events,
          {
            id,
            type:      "meeting.transcript_appended",
            ts:        Date.now(),
            sessionId,
            payload:   { speaker: entry.speaker, text_length: entry.text.length },
          },
        ],
      };
    });
  },

  // ── terminateSession (Sub-AC 10c) ──────────────────────────────────────
  terminateSession: async (sessionId) => {
    const existing = get().sessions[sessionId];
    if (!existing || existing.status !== "active") return;

    // Record termination request event
    set((state) => ({
      events: [
        ...state.events,
        {
          id:        nextEventId(),
          type:      "meeting.terminate_requested",
          ts:        Date.now(),
          sessionId,
          payload:   { requested_by: "user" },
        },
      ],
    }));

    // Optimistic update — mark session as ended immediately
    const optimisticHandle: SessionHandle = {
      ...existing,
      status:   "ended",
      ended_at: new Date().toISOString(),
    };
    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: optimisticHandle },
      events: [
        ...state.events,
        {
          id:        nextEventId(),
          type:      "meeting.session_ended",
          ts:        Date.now(),
          sessionId,
          payload:   { outcome: "cancelled", source: "user_termination" },
        },
      ],
    }));

    // Fire HTTP DELETE request (fire-and-forget; backend is optional/local-only)
    try {
      const resp = await fetch(
        `http://localhost:8081/api/sessions/${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
      );
      if (!resp.ok) {
        console.warn(
          `[meeting-store] terminateSession: backend returned ${resp.status} for session ${sessionId}`,
        );
      }
    } catch (err) {
      // Network error — the optimistic update already reflected the termination.
      // Record the failure so it's auditable but don't revert state.
      console.warn("[meeting-store] terminateSession: HTTP request failed:", err);
      set((state) => ({
        events: [
          ...state.events,
          {
            id:        nextEventId(),
            type:      "meeting.terminate_failed",
            ts:        Date.now(),
            sessionId,
            payload:   { error: String(err) },
          },
        ],
      }));
    }
  },

  // ── Computed getters ───────────────────────────────────────────────────
  getSession: (sessionId) => {
    return get().sessions[sessionId];
  },

  getActiveSessions: () => {
    return Object.values(get().sessions).filter((s) => s.status === "active");
  },

  getSessionForRoom: (roomId) => {
    return Object.values(get().sessions).find(
      (s) => s.room_id === roomId && s.status === "active",
    );
  },

  getActiveParticipantIds: () => {
    const ids = new Set<string>();
    for (const session of Object.values(get().sessions)) {
      if (session.status === "active") {
        for (const p of session.participants) {
          ids.add(p.participant_id);
        }
      }
    }
    return ids;
  },

  getSessionForParticipant: (participantId) => {
    return Object.values(get().sessions).find(
      (s) =>
        s.status === "active" &&
        s.participants.some((p) => p.participant_id === participantId),
    );
  },

  // ── getSpawnedTasksForSession (Sub-AC 10c) ──────────────────────────────
  getSpawnedTasksForSession: (sessionId) => {
    return get().spawnedTasks[sessionId] ?? [];
  },

  // ── recordSpawnedTask (Sub-AC 10c) ─────────────────────────────────────
  recordSpawnedTask: (sessionId, task) => {
    set((state) => {
      const existing = state.spawnedTasks[sessionId] ?? [];

      // Idempotent: skip if task_id already present
      if (existing.some((t) => t.task_id === task.task_id)) {
        return state;
      }

      const updated = [...existing, task];
      const taskEvt: MeetingStoreEvent = {
        id:        nextEventId(),
        type:      "meeting.task_spawned",
        ts:        Date.now(),
        sessionId,
        payload: {
          task_id:       task.task_id,
          resolution_id: task.resolution_id,
          title:         task.title,
          assigned_to:   task.assigned_to,
          priority:      task.priority,
        },
      };

      // Sub-AC 10a: Also append spawned task to the Meeting entity
      const protocolTask: ProtocolSpawnedTask = {
        task_id:       task.task_id,
        session_id:    task.session_id,
        resolution_id: task.resolution_id,
        title:         task.title,
        description:   task.description,
        assigned_to:   task.assigned_to,
        priority:      task.priority,
        status:        task.status,
        spawned_at:    task.spawned_at,
        metadata:      task.metadata,
      };

      const existingEntity = state.meetingEntities[sessionId];
      const updatedMeetingEntities = existingEntity
        ? { ...state.meetingEntities, [sessionId]: appendSpawnedTask(existingEntity, protocolTask) }
        : state.meetingEntities;

      return {
        spawnedTasks:    { ...state.spawnedTasks, [sessionId]: updated },
        meetingEntities: updatedMeetingEntities,
        events:          [...state.events, taskEvt],
      };
    });
  },

  // ── Sub-AC 10a: Meeting entity getters ─────────────────────────────────

  getMeetingEntity: (sessionId) => {
    return get().meetingEntities[sessionId];
  },

  getMeetingsByStage: (stage) => {
    return Object.values(get().meetingEntities).filter((m) => m.stage === stage);
  },

  progressMeetingStage: (sessionId, newStage) => {
    const currentEntity = get().meetingEntities[sessionId];
    if (!currentEntity) return false;

    if (!canMeetingStageTransition(currentEntity.stage, newStage)) return false;

    const advanced = advanceMeetingStage(currentEntity, newStage);
    if (!advanced) return false;

    const stageEvt: MeetingStoreEvent = {
      id:        nextEventId(),
      type:      "meeting.live_event_ingested",
      ts:        Date.now(),
      sessionId,
      payload: {
        source:    "progressMeetingStage",
        from_stage: currentEntity.stage,
        to_stage:   newStage,
        status:     STAGE_TO_STATUS[newStage],
      },
    };

    set((state) => ({
      meetingEntities: { ...state.meetingEntities, [sessionId]: advanced },
      events:          [...state.events, stageEvt],
    }));

    return true;
  },
}));
