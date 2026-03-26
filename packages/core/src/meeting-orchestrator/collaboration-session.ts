/**
 * collaboration-session.ts — In-memory multi-agent collaboration session.
 *
 * Sub-AC 10b: Agent collaboration session spawning + protocol state machine.
 *
 * A CollaborationSession is instantiated when a meeting.started (or
 * meeting.convene_requested) event is received by the MeetingHttpServer.
 *
 * It provides:
 *   - Role assignment for each participant (based on agent ID heuristics)
 *   - A shared context object (mutable key-value workspace)
 *   - An append-only message channel for inter-agent communication
 *   - A live SessionHandle that callers can poll or receive via WebSocket
 *   - A request→deliberate→resolve protocol state machine with enforced
 *     valid transitions, typed phase payloads, and full audit persistence
 *
 * Protocol State Machine:
 *
 *   request ──beginDeliberation()──► deliberate ──resolveProtocol()──► resolve
 *     │                                  │
 *     └──────────── end() ───────────────┴──► abandoned (SessionStatus=ended)
 *
 * Security / compliance:
 *   - Localhost-only service (enforced at the HTTP server layer)
 *   - All mutations produce an immutable event entry for audit / replay
 *   - No secrets stored in session state
 *   - Sessions are in-memory only; no disk writes
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Semantic participant category — mirrors MeetingParticipantKind from @conitens/protocol */
export type ParticipantKind = "agent" | "user" | "system";

/**
 * Functional role assigned to a participant within a collaboration session.
 *
 * Derived from the participant's native agent role (orchestrator → facilitator,
 * implementer → contributor, etc.) so that meeting interactions are coherent.
 */
export type MeetingRole =
  | "facilitator"       // orchestrator / manager — steers the session
  | "contributor"       // implementer — active task participant
  | "context-provider"  // researcher — supplies background knowledge
  | "reviewer"          // reviewer / frontend-reviewer — evaluates output
  | "validator"         // validator — gate-checks decisions
  | "stakeholder"       // external user
  | "observer";         // passive watcher

/** A single participant in a collaboration session. */
export interface SessionParticipant {
  /** agent_id, user_id, or system identifier */
  participant_id: string;
  /** Semantic category of this participant */
  participant_kind: ParticipantKind;
  /** Role assigned within this session */
  assigned_role: MeetingRole;
  /**
   * The participant's native agent role (orchestrator, implementer, etc.).
   * Present only for agent-kind participants; undefined for users / system.
   */
  native_role?: string;
  /** Known capabilities for this participant (empty for non-agents). */
  capabilities: string[];
}

/** A single message in a session's communication channel. */
export interface ChannelMessage {
  /** Unique message identifier */
  message_id: string;
  /** Sender identifier (participant_id or "system") */
  sender_id: string;
  /** Message text or structured content (JSON-serialisable) */
  content: string;
  /** ISO 8601 timestamp */
  ts: string;
  /** Optional message type tag */
  message_type: "text" | "context_update" | "decision" | "status" | "system";
}

/** Shared context workspace — a mutable key-value store for the session. */
export interface SharedContext {
  /** Links back to the session */
  meeting_id: string;
  /** Human-readable topic / title */
  topic: string;
  /** Detailed agenda / purpose */
  agenda: string;
  /** Freeform workspace — participants can read/write JSON-serialisable values */
  workspace: Record<string, unknown>;
  /** ISO timestamp of context creation */
  created_at: string;
}

/**
 * SessionStatus — lifecycle of a collaboration session.
 *
 *   initializing → active → ended
 *   Any state can transition → error
 */
export type SessionStatus = "initializing" | "active" | "ended" | "error";

// ---------------------------------------------------------------------------
// Protocol state machine types
// ---------------------------------------------------------------------------

/**
 * ProtocolPhase — the deliberation protocol within an active session.
 *
 * State machine:
 *   request ──beginDeliberation()──► deliberate ──resolveProtocol()──► resolve
 *     │                                   │
 *     └─────── end() without resolve ─────┴──────────────────────────► abandoned
 *
 * Terminal states: resolve, abandoned
 * Transitions are strictly enforced; invalid transitions throw.
 */
export type ProtocolPhase = "request" | "deliberate" | "resolve" | "abandoned";

/**
 * Valid protocol phase transitions.
 * Terminal states (resolve, abandoned) have no outgoing transitions.
 */
export const PROTOCOL_TRANSITIONS: Readonly<Record<ProtocolPhase, readonly ProtocolPhase[]>> = {
  request:    ["deliberate", "abandoned"],
  deliberate: ["resolve",    "abandoned"],
  resolve:    [],
  abandoned:  [],
} as const;

/**
 * Check whether a protocol phase transition is valid.
 *
 * @param from - Current phase
 * @param to   - Target phase
 * @returns true if the transition is permitted by the state machine
 */
export function canTransitionProtocol(from: ProtocolPhase, to: ProtocolPhase): boolean {
  return (PROTOCOL_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * ProtocolRequest — the intent record created when a session enters the
 * request phase (always the initial phase on session start).
 *
 * Captures WHAT is being requested so the deliberation phase has a
 * structured artefact to reason against.
 */
export interface ProtocolRequest {
  /** Unique identifier for this request (generated) */
  request_id: string;
  /** Short topic / title of the request */
  topic: string;
  /** Detailed description of what is being requested */
  description: string;
  /** Who made the request (participant_id or "user") */
  requested_by: string;
  /** ISO timestamp when the request was filed */
  requested_at: string;
  /** Optional additional context key-value pairs */
  context: Record<string, unknown>;
}

/**
 * ProtocolDecision — a single decision recorded during the deliberate phase.
 *
 * Multiple decisions can be added; they are ordered by `decided_at`.
 */
export interface ProtocolDecision {
  /** Unique identifier for this decision (generated) */
  decision_id: string;
  /** Human-readable description of the decision */
  content: string;
  /** Participant who made the decision */
  decided_by: string;
  /** ISO timestamp when the decision was made */
  decided_at: string;
  /** Semantic classification of the decision */
  decision_type: "accept" | "reject" | "defer" | "modify";
  /** Optional rationale for the decision */
  rationale?: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
}

/**
 * ProtocolResolution — the final resolution recorded when the session
 * transitions from deliberate → resolve.
 *
 * Captures the terminal outcome plus a snapshot of all decisions made
 * during deliberation so the resolution is self-contained.
 */
export interface ProtocolResolution {
  /** Unique identifier for this resolution (generated) */
  resolution_id: string;
  /** Machine-readable outcome */
  outcome: "accepted" | "rejected" | "deferred" | "modified" | "abandoned";
  /** Human-readable summary of what was resolved */
  summary: string;
  /** Participant or "system" who declared the resolution */
  resolved_by: string;
  /** ISO timestamp when the resolution was declared */
  resolved_at: string;
  /** Snapshot of all decisions made during deliberation */
  decisions: ProtocolDecision[];
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Spawned task types (Sub-AC 10c)
// ---------------------------------------------------------------------------

/**
 * SpawnedTaskStatus — lifecycle status of a task produced at resolution.
 *
 *   pending → assigned → in_progress → completed
 *                └─────────────────────────────────► failed | cancelled
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
 * Every resolution produces at least one SpawnedTask that captures WHAT
 * needs to be done as a result of the meeting.  The task is linked back to
 * its parent session via `session_id` and `resolution_id` so it can be
 * traced through the event log.
 */
export interface SpawnedTask {
  /** Unique task identifier (generated, prefixed "task-") */
  task_id: string;
  /** Parent collaboration session identifier */
  session_id: string;
  /** The resolution that triggered this task */
  resolution_id: string;
  /** Short human-readable title */
  title: string;
  /** Detailed description of the work to be done */
  description: string;
  /** Participant ID to whom this task is initially assigned (or "unassigned") */
  assigned_to: string;
  /** Task priority: 1 (critical) → 5 (low).  Default 3 (normal). */
  priority: 1 | 2 | 3 | 4 | 5;
  /** Current lifecycle status */
  status: SpawnedTaskStatus;
  /** ISO timestamp when this task was spawned */
  spawned_at: string;
  /** Optional structured metadata for integration with external task systems */
  metadata: Record<string, unknown>;
}

/**
 * SpawnedTaskInput — caller-provided specification for a task to be spawned
 * at resolution time.
 *
 * All fields are optional; unspecified fields are derived from the resolution.
 */
export interface SpawnedTaskInput {
  /** Short title.  Defaults to the resolution summary (truncated to 80 chars). */
  title?: string;
  /** Detailed description.  Defaults to the resolution summary. */
  description?: string;
  /** Who should receive this task.  Defaults to the facilitator participant, or "unassigned". */
  assigned_to?: string;
  /** Priority 1–5.  Defaults to 3 (normal). */
  priority?: 1 | 2 | 3 | 4 | 5;
  /** Extra metadata passed through to the task record. */
  metadata?: Record<string, unknown>;
}

/**
 * ProtocolState — the full protocol payload included in a SessionHandle.
 *
 * Exposes the current phase plus phase-specific artefacts.
 */
export interface ProtocolState {
  /** Current protocol phase */
  phase: ProtocolPhase;
  /** The initial request (always present once session starts) */
  request: ProtocolRequest | null;
  /** Decisions accumulated during the deliberate phase */
  decisions: ProtocolDecision[];
  /** Final resolution (present only in resolve | abandoned phases) */
  resolution: ProtocolResolution | null;
  /**
   * Tasks spawned when the session reached the `resolve` phase.
   * Empty until resolveProtocol() is called.
   * Sub-AC 10c.
   */
  spawned_tasks: SpawnedTask[];
}

/**
 * SessionHandle — the live session descriptor returned to callers.
 *
 * This is the public-facing view of a CollaborationSession.
 * It can be safely serialised to JSON and returned in HTTP responses
 * or broadcast via WebSocket.
 */
export interface SessionHandle {
  /** = meeting_id — stable identifier for this session */
  session_id: string;
  /** Lifecycle status */
  status: SessionStatus;
  /** Room where the meeting takes place */
  room_id: string;
  /** Human-readable topic */
  title?: string;
  /** ISO start timestamp */
  started_at: string;
  /** ISO end timestamp (null while active) */
  ended_at: string | null;
  /** Ordered list of participants with assigned roles */
  participants: SessionParticipant[];
  /** Shared context workspace */
  shared_context: SharedContext;
  /** Communication channel metadata */
  channel: {
    channel_id: string;
    /** Total messages posted to this channel */
    message_count: number;
    /** ISO timestamp of the last message (null if no messages yet) */
    last_message_at: string | null;
  };
  /**
   * Protocol state — request→deliberate→resolve phase machine.
   * Always present; phase starts as "request" on session creation.
   */
  protocol: ProtocolState;
}

// ---------------------------------------------------------------------------
// Role assignment — map agent IDs / roles to meeting roles
// ---------------------------------------------------------------------------

/**
 * Known agent-role → meeting-role mapping.
 *
 * The mapping is based on the canonical Conitens agent personas defined in
 * `.agent/agents/*.yaml`.  The backend doesn't import frontend data, so we
 * replicate the mapping here from the protocol's AgentRole union.
 */
const AGENT_ROLE_TO_MEETING_ROLE: Readonly<Record<string, MeetingRole>> = {
  orchestrator: "facilitator",
  planner:      "facilitator",
  implementer:  "contributor",
  tester:       "contributor",
  researcher:   "context-provider",
  analyst:      "context-provider",
  reviewer:     "reviewer",
  validator:    "validator",
};

/**
 * Infer the meeting role for an agent based on its agent ID.
 *
 * Strategy:
 *   1. Check if the agent ID contains a known role keyword (fast path for
 *      canonical agent IDs like "manager-default", "implementer-subagent").
 *   2. Normalise the ID to an agent role and look up the mapping table.
 *   3. Fall back to "contributor" for agents whose role cannot be determined.
 *   4. Non-agents default to "stakeholder" (users) or "observer" (system).
 */
export function assignMeetingRole(
  participantId: string,
  participantKind: ParticipantKind,
): { meetingRole: MeetingRole; nativeRole?: string } {
  if (participantKind === "user") {
    return { meetingRole: "stakeholder" };
  }
  if (participantKind === "system") {
    return { meetingRole: "observer" };
  }

  // Canonical pattern: "<role>-<suffix>" e.g. "implementer-subagent"
  const id = participantId.toLowerCase();

  // Check each known agent role keyword in the ID
  for (const [agentRole, meetingRole] of Object.entries(AGENT_ROLE_TO_MEETING_ROLE)) {
    if (id.includes(agentRole)) {
      return { meetingRole, nativeRole: agentRole };
    }
  }

  // Special patterns
  if (id.includes("manager") || id.includes("orchestrat")) {
    return { meetingRole: "facilitator", nativeRole: "orchestrator" };
  }
  if (id.includes("validator") || id.includes("sentinel")) {
    return { meetingRole: "validator", nativeRole: "validator" };
  }
  if (id.includes("reviewer") || id.includes("review")) {
    return { meetingRole: "reviewer", nativeRole: "reviewer" };
  }

  // Default: treat unknown agents as contributors
  return { meetingRole: "contributor" };
}

/** Known capability → meeting-role hints (lower priority than ID pattern). */
const CAPABILITY_ROLE_HINTS: ReadonlyArray<[string, MeetingRole]> = [
  ["planning",          "facilitator"],
  ["delegation",        "facilitator"],
  ["workflow-control",  "facilitator"],
  ["approval-boundary", "facilitator"],
  ["code-change",       "contributor"],
  ["patching",          "contributor"],
  ["task-execution",    "contributor"],
  ["repo-map",          "context-provider"],
  ["impact-analysis",   "context-provider"],
  ["context-gathering", "context-provider"],
  ["verify",            "validator"],
  ["release-gate",      "validator"],
  ["ui-review",         "reviewer"],
  ["review",            "reviewer"],
];

/**
 * Build a SessionParticipant for a participant given their ID, kind, and
 * optional capability list.
 *
 * Capabilities are used as a secondary signal if the agent ID doesn't
 * clearly identify a role.
 */
export function buildSessionParticipant(
  participantId: string,
  participantKind: ParticipantKind,
  capabilities: string[] = [],
): SessionParticipant {
  const { meetingRole, nativeRole } = assignMeetingRole(participantId, participantKind);

  // If the ID match was uncertain (contributor fallback), try capabilities
  let finalRole = meetingRole;
  if (meetingRole === "contributor" && capabilities.length > 0) {
    for (const [cap, capRole] of CAPABILITY_ROLE_HINTS) {
      if (capabilities.includes(cap)) {
        finalRole = capRole;
        break;
      }
    }
  }

  return {
    participant_id:  participantId,
    participant_kind: participantKind,
    assigned_role:   finalRole,
    native_role:     nativeRole,
    capabilities:    [...capabilities],
  };
}

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------

let _sessionCounter = 0;

/** Generate a unique session / meeting ID */
function generateSessionId(): string {
  return `mtg-${Date.now()}-${(++_sessionCounter).toString(36).padStart(4, "0")}`;
}

/** Generate a unique channel ID */
function generateChannelId(meetingId: string): string {
  return `ch-${meetingId}`;
}

/** Generate a unique message ID */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Generate a unique request ID */
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Generate a unique decision ID */
function generateDecisionId(): string {
  return `dec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Generate a unique resolution ID */
function generateResolutionId(): string {
  return `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Generate a unique spawned-task ID (Sub-AC 10c) */
function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// CollaborationSession — in-memory session object
// ---------------------------------------------------------------------------

/** Input required to create a new CollaborationSession. */
export interface SessionCreateInput {
  /** meeting_id — if not provided, one is generated */
  meeting_id?: string;
  /** Room where the meeting takes place */
  room_id: string;
  /** Human-readable topic / title */
  title?: string;
  /** Detailed agenda */
  agenda?: string;
  /** Participant IDs to include (agent_id or user_id) */
  participant_ids: string[];
  /** Participant capabilities keyed by participant_id (optional lookup) */
  participant_capabilities?: Record<string, string[]>;
  /** Who initiated the session ("user", or an agent_id) */
  initiated_by: string;
  /** Soft deadline in ms from session start (0 / absent = no limit) */
  scheduled_duration_ms?: number;
  /**
   * Optional initial request description — filed as the session's protocol
   * request artefact.  If absent, a request is auto-generated from the title
   * and agenda.
   */
  initial_request_description?: string;
  /** Optional extra context for the initial protocol request */
  initial_request_context?: Record<string, unknown>;
}

/** Input for beginDeliberation() */
export interface BeginDeliberationInput {
  /** Who initiated the deliberation (participant_id or "system") */
  initiated_by: string;
  /** Optional note to post in the channel when deliberation begins */
  note?: string;
}

/** Input for addDecision() */
export interface AddDecisionInput {
  /** Human-readable description of the decision */
  content: string;
  /** Participant who made the decision */
  decided_by: string;
  /** Semantic classification */
  decision_type: ProtocolDecision["decision_type"];
  /** Optional rationale */
  rationale?: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
}

/** Input for resolveProtocol() */
export interface ResolveProtocolInput {
  /** Machine-readable outcome */
  outcome: ProtocolResolution["outcome"];
  /** Human-readable summary */
  summary: string;
  /** Who declared the resolution */
  resolved_by: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
  /**
   * Explicit task specifications to spawn at resolution.
   *
   * Sub-AC 10c: If provided, these tasks are created verbatim (with defaults
   * filled from the resolution).  If absent or empty, one task is
   * auto-generated from the resolution summary so that every non-abandoned
   * resolution produces at least one work-item.
   *
   * Tasks are NOT spawned for `abandoned` outcomes.
   */
  spawn_tasks?: SpawnedTaskInput[];
}

/**
 * ProtocolTransitionError — thrown when an invalid protocol phase transition
 * is attempted.  Callers should catch and return a 409 Conflict response.
 */
export class ProtocolTransitionError extends Error {
  constructor(
    public readonly from: ProtocolPhase,
    public readonly to:   ProtocolPhase,
    public readonly session_id: string,
  ) {
    super(
      `Invalid protocol transition: ${from} → ${to} on session ${session_id}. ` +
      `Valid transitions from '${from}': ${PROTOCOL_TRANSITIONS[from].join(", ") || "none (terminal)"}`,
    );
    this.name = "ProtocolTransitionError";
  }
}

/**
 * CollaborationSession — full in-memory representation of an active session.
 *
 * Public API is expressed via the `toHandle()` method which produces an
 * immutable `SessionHandle` snapshot safe for JSON serialisation.
 *
 * All mutations (postMessage, end, setContextValue, beginDeliberation,
 * addDecision, resolveProtocol) record an event entry in the internal
 * append-only `_events` array for future replay / audit.
 *
 * Protocol state machine:
 *   request → deliberate → resolve
 *   Any phase → abandoned (when end() is called without resolveProtocol())
 */
export class CollaborationSession {
  readonly session_id: string;
  readonly room_id: string;
  readonly title: string | undefined;
  readonly agenda: string;
  readonly initiated_by: string;
  readonly started_at: string;
  readonly channel_id: string;
  readonly scheduled_duration_ms: number | undefined;

  private _status: SessionStatus = "initializing";
  private _participants: SessionParticipant[];
  private _context: SharedContext;
  private _messages: ChannelMessage[] = [];
  private _ended_at: string | null = null;

  // ── Protocol state ──────────────────────────────────────────────────────
  private _protocol_phase: ProtocolPhase = "request";
  private _protocol_request: ProtocolRequest | null = null;
  private _protocol_decisions: ProtocolDecision[] = [];
  private _protocol_resolution: ProtocolResolution | null = null;
  /** Tasks spawned at resolution (Sub-AC 10c) */
  private _spawned_tasks: SpawnedTask[] = [];

  /** Internal append-only audit log — NOT exposed in SessionHandle */
  private readonly _events: Array<{
    event_type: string;
    ts: string;
    payload: Record<string, unknown>;
  }> = [];

  constructor(input: SessionCreateInput) {
    const now = new Date().toISOString();

    this.session_id    = input.meeting_id ?? generateSessionId();
    this.room_id       = input.room_id;
    this.title         = input.title;
    this.agenda        = input.agenda ?? "";
    this.initiated_by  = input.initiated_by;
    this.started_at    = now;
    this.channel_id    = generateChannelId(this.session_id);
    this.scheduled_duration_ms = input.scheduled_duration_ms;

    // Assign meeting roles to all participants
    const caps = input.participant_capabilities ?? {};
    this._participants = input.participant_ids.map((id) => {
      // The initiator is always the facilitator if they're a user
      if (id === input.initiated_by && input.initiated_by === "user") {
        return {
          participant_id:   id,
          participant_kind: "user" as ParticipantKind,
          assigned_role:    "stakeholder" as MeetingRole,
          capabilities:     [],
        };
      }
      // Infer participant kind: "user" if ID matches common user patterns, else "agent"
      const kind: ParticipantKind =
        id === "user" || id.startsWith("user:") ? "user" : "agent";
      return buildSessionParticipant(id, kind, caps[id] ?? []);
    });

    // Ensure at least one facilitator — if none, promote the first participant
    const hasFacilitator = this._participants.some((p) => p.assigned_role === "facilitator");
    if (!hasFacilitator && this._participants.length > 0) {
      this._participants[0] = {
        ...this._participants[0],
        assigned_role: "facilitator",
      };
    }

    // Initialise shared context
    this._context = {
      meeting_id: this.session_id,
      topic:      input.title ?? "Untitled Meeting",
      agenda:     this.agenda,
      workspace:  {
        initiated_by:    input.initiated_by,
        participant_ids: input.participant_ids,
        room_id:         input.room_id,
      },
      created_at: now,
    };

    // Record session.created event
    this._recordEvent("session.created", {
      session_id:    this.session_id,
      room_id:       this.room_id,
      title:         this.title,
      participant_count: this._participants.length,
      initiated_by:  this.initiated_by,
    });

    // Transition to active
    this._status = "active";
    this._recordEvent("session.activated", { session_id: this.session_id });

    // ── Initialise protocol request phase ──────────────────────────────────
    this._protocol_request = {
      request_id:   generateRequestId(),
      topic:        input.title ?? "Untitled Meeting",
      description:  input.initial_request_description ?? input.agenda ?? "",
      requested_by: input.initiated_by,
      requested_at: now,
      context:      {
        ...(input.initial_request_context ?? {}),
        room_id:         input.room_id,
        participant_ids: input.participant_ids,
      },
    };
    this._recordEvent("protocol.request_filed", {
      session_id:  this.session_id,
      request_id:  this._protocol_request.request_id,
      topic:       this._protocol_request.topic,
      requested_by: this._protocol_request.requested_by,
    });

    // Post a system welcome message to the channel
    this._postSystemMessage(
      `Session started — ${input.participant_ids.length} participant(s) assigned. ` +
      `Topic: "${input.title ?? "Untitled Meeting"}". Protocol phase: request.`,
    );
  }

  // ── Getters ────────────────────────────────────────────────────────

  get status(): SessionStatus { return this._status; }
  get participants(): ReadonlyArray<SessionParticipant> { return this._participants; }
  get messages(): ReadonlyArray<ChannelMessage> { return this._messages; }
  get context(): Readonly<SharedContext> { return this._context; }
  get ended_at(): string | null { return this._ended_at; }

  /** Current protocol phase */
  get protocol_phase(): ProtocolPhase { return this._protocol_phase; }

  /** The initial protocol request (always present after construction) */
  get protocol_request(): Readonly<ProtocolRequest> | null {
    return this._protocol_request;
  }

  /** Decisions made during deliberation (immutable copy) */
  get protocol_decisions(): ReadonlyArray<ProtocolDecision> {
    return this._protocol_decisions;
  }

  /** The final resolution (present only in resolve | abandoned phases) */
  get protocol_resolution(): Readonly<ProtocolResolution> | null {
    return this._protocol_resolution;
  }

  /**
   * Spawned tasks produced at resolution (Sub-AC 10c).
   * Returns an immutable copy; empty until resolveProtocol() completes.
   */
  get spawned_tasks(): ReadonlyArray<SpawnedTask> {
    return this._spawned_tasks;
  }

  // ── Protocol transition methods ────────────────────────────────────

  /**
   * Transition the session protocol from `request` → `deliberate`.
   *
   * MUST be called before adding decisions.
   *
   * @throws {ProtocolTransitionError} if the current phase is not `request`
   * @throws {Error} if the session is not active
   */
  beginDeliberation(input: BeginDeliberationInput): void {
    this._assertActive("beginDeliberation");
    this._transitionProtocol("deliberate", "protocol.deliberation_started", {
      session_id:   this.session_id,
      initiated_by: input.initiated_by,
    });

    const note = input.note ?? `Deliberation phase started by ${input.initiated_by}.`;
    this._postSystemMessage(`[protocol:deliberate] ${note}`);
  }

  /**
   * Add a decision during the `deliberate` phase.
   *
   * Can be called multiple times; decisions are ordered by `decided_at`.
   *
   * @throws {Error} if the current protocol phase is not `deliberate`
   * @throws {Error} if the session is not active
   */
  addDecision(input: AddDecisionInput): ProtocolDecision {
    this._assertActive("addDecision");
    if (this._protocol_phase !== "deliberate") {
      throw new Error(
        `addDecision() requires protocol phase 'deliberate', ` +
        `but current phase is '${this._protocol_phase}' on session ${this.session_id}`,
      );
    }

    const decision: ProtocolDecision = {
      decision_id:   generateDecisionId(),
      content:       input.content,
      decided_by:    input.decided_by,
      decided_at:    new Date().toISOString(),
      decision_type: input.decision_type,
      rationale:     input.rationale,
      metadata:      input.metadata,
    };
    this._protocol_decisions = [...this._protocol_decisions, decision];

    this._recordEvent("protocol.decision_added", {
      session_id:    this.session_id,
      decision_id:   decision.decision_id,
      decided_by:    decision.decided_by,
      decision_type: decision.decision_type,
    });

    // Post a decision message to the channel for observability
    this.postMessage(input.decided_by, input.content, "decision");

    return decision;
  }

  /**
   * Transition the session protocol from `deliberate` → `resolve`.
   *
   * Records the final ProtocolResolution with an immutable snapshot of all
   * decisions made during deliberation.
   *
   * Sub-AC 10c: Spawns at least one SpawnedTask linked to this session and
   * resolution.  Callers may supply explicit task specs in `input.spawn_tasks`;
   * if none are provided and the outcome is not `abandoned`, one task is
   * auto-generated from the resolution summary.  No tasks are spawned for
   * `abandoned` outcomes.
   *
   * @throws {ProtocolTransitionError} if the current phase is not `deliberate`
   * @throws {Error} if the session is not active
   */
  resolveProtocol(input: ResolveProtocolInput): ProtocolResolution {
    this._assertActive("resolveProtocol");
    this._transitionProtocol("resolve", "protocol.resolved", {
      session_id:  this.session_id,
      outcome:     input.outcome,
      resolved_by: input.resolved_by,
    });

    const resolution: ProtocolResolution = {
      resolution_id: generateResolutionId(),
      outcome:       input.outcome,
      summary:       input.summary,
      resolved_by:   input.resolved_by,
      resolved_at:   new Date().toISOString(),
      decisions:     [...this._protocol_decisions],
      metadata:      input.metadata,
    };
    this._protocol_resolution = resolution;

    this._postSystemMessage(
      `[protocol:resolve] Resolution declared by ${input.resolved_by}. ` +
      `Outcome: ${input.outcome}. ${input.summary}`,
    );

    // ── Sub-AC 10c: Spawn tasks ──────────────────────────────────────────
    // Tasks are only spawned for actionable outcomes (not abandoned).
    if (input.outcome !== "abandoned") {
      const taskSpecs: SpawnedTaskInput[] =
        input.spawn_tasks && input.spawn_tasks.length > 0
          ? input.spawn_tasks
          : [{}]; // auto-generate one task from resolution

      // Derive a default assignee: prefer the facilitator participant.
      const facilitator = this._participants.find((p) => p.assigned_role === "facilitator");
      const defaultAssignee = facilitator?.participant_id ?? input.resolved_by ?? "unassigned";

      for (const spec of taskSpecs) {
        this.spawnTask(spec, resolution.resolution_id, defaultAssignee);
      }

      this._postSystemMessage(
        `[protocol:resolve] ${this._spawned_tasks.length} task(s) spawned from resolution ${resolution.resolution_id}.`,
      );
    }

    return resolution;
  }

  /**
   * Manually spawn a task linked to this session and a given resolution.
   *
   * Sub-AC 10c: Low-level method called by resolveProtocol() and available
   * to callers that need to attach additional tasks after resolution.
   *
   * @param spec         - Partial task specification; missing fields are derived from resolution.
   * @param resolutionId - The resolution this task is linked to.
   * @param defaultAssignee - Fallback assignee when spec.assigned_to is absent.
   * @returns The created SpawnedTask.
   */
  spawnTask(
    spec: SpawnedTaskInput,
    resolutionId: string,
    defaultAssignee: string = "unassigned",
  ): SpawnedTask {
    const resolution = this._protocol_resolution;
    const summaryText = resolution?.summary ?? this.title ?? "Follow-up task";

    const task: SpawnedTask = {
      task_id:       generateTaskId(),
      session_id:    this.session_id,
      resolution_id: resolutionId,
      title:         spec.title ?? summaryText.slice(0, 80),
      description:   spec.description ?? summaryText,
      assigned_to:   spec.assigned_to ?? defaultAssignee,
      priority:      spec.priority ?? 3,
      status:        "pending",
      spawned_at:    new Date().toISOString(),
      metadata: {
        ...(spec.metadata ?? {}),
        room_id:       this.room_id,
        session_title: this.title ?? "",
        outcome:       resolution?.outcome ?? "unknown",
        decision_count: this._protocol_decisions.length,
      },
    };

    this._spawned_tasks = [...this._spawned_tasks, task];

    this._recordEvent("task.spawned", {
      session_id:    this.session_id,
      task_id:       task.task_id,
      resolution_id: resolutionId,
      title:         task.title,
      assigned_to:   task.assigned_to,
      priority:      task.priority,
    });

    return task;
  }

  // ── Session lifecycle methods ──────────────────────────────────────

  /**
   * Post a message to the session communication channel.
   * Records a channel.message_posted event.
   *
   * @returns The created ChannelMessage
   */
  postMessage(
    senderId: string,
    content: string,
    messageType: ChannelMessage["message_type"] = "text",
  ): ChannelMessage {
    const msg: ChannelMessage = {
      message_id:   generateMessageId(),
      sender_id:    senderId,
      content,
      ts:           new Date().toISOString(),
      message_type: messageType,
    };
    this._messages.push(msg);
    this._recordEvent("channel.message_posted", {
      session_id:  this.session_id,
      message_id:  msg.message_id,
      sender_id:   senderId,
      message_type: messageType,
    });
    return msg;
  }

  /**
   * Update a value in the shared context workspace.
   * Records a context.value_updated event.
   */
  setContextValue(key: string, value: unknown, updatedBy: string): void {
    this._context = {
      ...this._context,
      workspace: { ...this._context.workspace, [key]: value },
    };
    this._recordEvent("context.value_updated", {
      session_id: this.session_id,
      key,
      updated_by: updatedBy,
    });
  }

  /**
   * Add a participant to the session.
   * Records a session.participant_joined event.
   */
  addParticipant(
    participantId: string,
    participantKind: ParticipantKind,
    capabilities: string[] = [],
  ): SessionParticipant {
    // Idempotent: no-op if already present
    const existing = this._participants.find((p) => p.participant_id === participantId);
    if (existing) return existing;

    const participant = buildSessionParticipant(participantId, participantKind, capabilities);
    this._participants = [...this._participants, participant];
    this._recordEvent("session.participant_joined", {
      session_id:      this.session_id,
      participant_id:  participantId,
      participant_kind: participantKind,
      assigned_role:   participant.assigned_role,
    });
    return participant;
  }

  /**
   * End the session.
   *
   * If the protocol has not yet reached `resolve`, the phase is automatically
   * transitioned to `abandoned` and a ProtocolResolution with outcome
   * `abandoned` is recorded.
   *
   * Records a session.ended event.  Idempotent.
   */
  end(endedBy?: string, outcome?: string): void {
    if (this._status === "ended" || this._status === "error") return;

    // Auto-abandon the protocol if it hasn't been resolved yet
    if (this._protocol_phase !== "resolve" && this._protocol_phase !== "abandoned") {
      try {
        this._transitionProtocol("abandoned", "protocol.abandoned", {
          session_id:  this.session_id,
          abandoned_by: endedBy ?? "system",
          reason:       `Session ended before protocol reached resolve phase (was: ${this._protocol_phase})`,
        });
      } catch {
        // If _transitionProtocol throws (e.g. already terminal), ignore
      }

      if (!this._protocol_resolution) {
        this._protocol_resolution = {
          resolution_id: generateResolutionId(),
          outcome:       "abandoned",
          summary:       `Session ended before deliberation completed. Reason: ${outcome ?? "session ended"}`,
          resolved_by:   endedBy ?? "system",
          resolved_at:   new Date().toISOString(),
          decisions:     [...this._protocol_decisions],
        };
      }
    }

    this._status   = "ended";
    this._ended_at = new Date().toISOString();
    this._postSystemMessage(`Session ended. Outcome: ${outcome ?? "completed"}`);
    this._recordEvent("session.ended", {
      session_id: this.session_id,
      ended_by:   endedBy,
      outcome:    outcome ?? "completed",
      duration_ms: Date.now() - new Date(this.started_at).getTime(),
      protocol_phase_at_end: this._protocol_phase,
    });
  }

  // ── Serialisation ──────────────────────────────────────────────────

  /**
   * Produce an immutable SessionHandle snapshot for HTTP responses / WS broadcast.
   */
  toHandle(): SessionHandle {
    const lastMsg = this._messages.length > 0
      ? this._messages[this._messages.length - 1]
      : null;

    return {
      session_id:     this.session_id,
      status:         this._status,
      room_id:        this.room_id,
      title:          this.title,
      started_at:     this.started_at,
      ended_at:       this._ended_at,
      participants:   [...this._participants],
      shared_context: { ...this._context, workspace: { ...this._context.workspace } },
      channel: {
        channel_id:      this.channel_id,
        message_count:   this._messages.length,
        last_message_at: lastMsg?.ts ?? null,
      },
      protocol: {
        phase:      this._protocol_phase,
        request:    this._protocol_request
          ? { ...this._protocol_request, context: { ...this._protocol_request.context } }
          : null,
        decisions:  this._protocol_decisions.map((d) => ({ ...d, metadata: d.metadata ? { ...d.metadata } : undefined })),
        resolution: this._protocol_resolution
          ? {
              ...this._protocol_resolution,
              decisions: this._protocol_resolution.decisions.map((d) => ({ ...d })),
              metadata:  this._protocol_resolution.metadata ? { ...this._protocol_resolution.metadata } : undefined,
            }
          : null,
        // Sub-AC 10c: expose spawned tasks as part of protocol state
        spawned_tasks: this._spawned_tasks.map((t) => ({
          ...t,
          metadata: { ...t.metadata },
        })),
      },
    };
  }

  /**
   * Return a copy of the audit event log.
   * Useful for debugging and replay.
   */
  getAuditLog(): ReadonlyArray<{ event_type: string; ts: string; payload: Record<string, unknown> }> {
    return [...this._events];
  }

  // ── Private helpers ────────────────────────────────────────────────

  private _postSystemMessage(content: string): void {
    this._messages.push({
      message_id:   generateMessageId(),
      sender_id:    "system",
      content,
      ts:           new Date().toISOString(),
      message_type: "system",
    });
  }

  private _recordEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): void {
    this._events.push({
      event_type: eventType,
      ts:         new Date().toISOString(),
      payload,
    });
  }

  /**
   * Perform a protocol phase transition with guard enforcement.
   *
   * @throws {ProtocolTransitionError} if the transition is not valid
   */
  private _transitionProtocol(
    to: ProtocolPhase,
    eventType: string,
    payload: Record<string, unknown>,
  ): void {
    if (!canTransitionProtocol(this._protocol_phase, to)) {
      throw new ProtocolTransitionError(this._protocol_phase, to, this.session_id);
    }
    const from = this._protocol_phase;
    this._protocol_phase = to;
    this._recordEvent(eventType, {
      ...payload,
      protocol_from: from,
      protocol_to:   to,
    });
  }

  /** Assert the session is active; throw if not. */
  private _assertActive(method: string): void {
    if (this._status !== "active") {
      throw new Error(
        `${method}() cannot be called on a session with status '${this._status}' ` +
        `(session_id: ${this.session_id})`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// SessionRegistry — in-memory map of active sessions
// ---------------------------------------------------------------------------

/**
 * SessionRegistry — thread-safe (single-threaded Node.js) map of all
 * active and recently-ended CollaborationSessions.
 *
 * Designed as a singleton for use inside MeetingHttpServer.
 */
export class SessionRegistry {
  private readonly _sessions = new Map<string, CollaborationSession>();

  /**
   * Create and register a new session.
   *
   * @returns The new session
   */
  create(input: SessionCreateInput): CollaborationSession {
    const session = new CollaborationSession(input);
    this._sessions.set(session.session_id, session);
    return session;
  }

  /** Retrieve a session by ID. Returns undefined if not found. */
  get(sessionId: string): CollaborationSession | undefined {
    return this._sessions.get(sessionId);
  }

  /** List all sessions (active and ended). */
  list(): CollaborationSession[] {
    return [...this._sessions.values()];
  }

  /** List only active sessions. */
  listActive(): CollaborationSession[] {
    return this.list().filter((s) => s.status === "active");
  }

  /** Remove ended sessions older than `maxAgeMs`. Returns count removed. */
  pruneEnded(maxAgeMs = 30 * 60 * 1_000): number {
    // cutoff: sessions that ended AT OR BEFORE (now - maxAgeMs) are eligible for pruning.
    // Using <= so that maxAgeMs=0 prunes sessions that ended right now.
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const [id, session] of this._sessions) {
      if (session.status === "ended" && session.ended_at) {
        if (new Date(session.ended_at).getTime() <= cutoff) {
          this._sessions.delete(id);
          removed++;
        }
      }
    }
    return removed;
  }

  /** Total session count. */
  get size(): number { return this._sessions.size; }
}
