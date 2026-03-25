/**
 * meeting-event-logger.ts — Persistent EventLog integration for meeting lifecycle events.
 *
 * Sub-AC 10d: Implement meeting lifecycle event logging — emit and persist
 * event_log entries of types meeting.started, meeting.deliberation, and
 * meeting.resolved at the correct protocol transitions.
 *
 * Design:
 *   - MeetingEventLogger wraps an EventLog instance (write-only, append-only)
 *   - Three public methods mirror the three canonical protocol transitions:
 *       logStarted()        — called at session creation (request phase entry)
 *       logDeliberation()   — called at beginDeliberation() (request→deliberate)
 *       logResolved()       — called at resolveProtocol() (deliberate→resolve)
 *   - All writes are fire-and-forget from the caller's perspective but the
 *     logger awaits each append internally so fsync durability is guaranteed.
 *   - Errors are caught and logged to stderr — they NEVER propagate to the
 *     HTTP handler, so an EventLog I/O failure never blocks a meeting action.
 *
 * Record transparency guarantee:
 *   Every state-changing meeting protocol transition (session start,
 *   deliberation begin, resolution) is recorded in the append-only event log
 *   before the HTTP response is returned, making the full meeting lifecycle
 *   traceable via a log query.
 */

import type { EventLog } from "../event-log/event-log.js";
import type {
  MeetingStartedPayload,
  MeetingDeliberationPayload,
  MeetingResolvedPayload,
} from "@conitens/protocol";

// ---------------------------------------------------------------------------
// Input types — one per logged transition
// ---------------------------------------------------------------------------

/** Data required to log a meeting.started event. */
export interface LogStartedInput {
  /** Unique meeting/session identifier. */
  meeting_id: string;
  /** Room where the meeting takes place. */
  room_id: string;
  /** Human-readable topic/title. */
  title?: string;
  /** agent_id or user_id that initiated the session. */
  initiated_by: string;
  /** Ordered list of participant IDs present at session start. */
  participant_ids: string[];
  /** Optional agenda text. */
  agenda?: string;
  /** Optional soft deadline in milliseconds. */
  scheduled_duration_ms?: number;
  /** Causation ID linking to a prior command or event (optional). */
  causation_id?: string;
  /** Correlation ID for grouping related events across the session (optional). */
  correlation_id?: string;
}

/** Data required to log a meeting.deliberation event. */
export interface LogDeliberationInput {
  /** Unique meeting/session identifier. */
  meeting_id: string;
  /** Room where the meeting takes place. */
  room_id: string;
  /** Who triggered the deliberation phase (participant_id or "system"). */
  initiated_by: string;
  /** Internal request_id from the ProtocolRequest artefact. */
  request_id?: string;
  /** Optional human-readable note. */
  note?: string;
  /** Correlation ID for grouping related events across the session (optional). */
  correlation_id?: string;
}

/** Data required to log a meeting.resolved event. */
export interface LogResolvedInput {
  /** Unique meeting/session identifier. */
  meeting_id: string;
  /** Room where the meeting took place. */
  room_id: string;
  /** Internal resolution_id from the ProtocolResolution artefact. */
  resolution_id: string;
  /** Machine-readable outcome of the deliberation. */
  outcome: MeetingResolvedPayload["outcome"];
  /** Short human-readable summary of what was resolved. */
  summary: string;
  /** Who declared the resolution. */
  resolved_by: string;
  /** Number of decisions recorded during deliberation. */
  decision_count: number;
  /** Number of tasks spawned at resolution. */
  task_count: number;
  /** Correlation ID for grouping related events across the session (optional). */
  correlation_id?: string;
}

/**
 * Data required to log a meeting.task.spawned event.
 *
 * Sub-AC 10c: Each SpawnedTask produced at meeting resolution is persisted
 * as a separate event so full task provenance (meeting → resolution → task)
 * is traceable in the event log.
 */
export interface LogTaskSpawnedInput {
  /** Unique task identifier (generated, prefixed "task-"). */
  task_id: string;
  /** Parent collaboration session identifier. */
  session_id: string;
  /** The resolution that triggered this task. */
  resolution_id: string;
  /** Room where the meeting (and thus this task) originated. */
  room_id: string;
  /** Short human-readable task title. */
  title: string;
  /** Detailed description of the work to be done. */
  description: string;
  /** Participant ID to whom the task is initially assigned (or "unassigned"). */
  assigned_to: string;
  /** Task priority 1 (critical) → 5 (low). */
  priority: 1 | 2 | 3 | 4 | 5;
  /** Current lifecycle status of the spawned task. */
  status: string;
  /** ISO 8601 timestamp when the task was spawned. */
  spawned_at: string;
  /** Optional structured metadata. */
  metadata?: Record<string, unknown>;
  /** Correlation ID (defaults to session_id so all meeting events share a correlation). */
  correlation_id?: string;
  /** Causation ID linking back to the meeting.resolved event (optional). */
  causation_id?: string;
}

// ---------------------------------------------------------------------------
// MeetingEventLogger
// ---------------------------------------------------------------------------

/**
 * MeetingEventLogger — persists the three canonical meeting lifecycle events
 * to an append-only EventLog at the correct protocol transitions.
 *
 * Usage:
 * ```ts
 * const logger = new MeetingEventLogger(eventLog);
 * await logger.logStarted({ meeting_id: "...", ... });
 * await logger.logDeliberation({ meeting_id: "...", ... });
 * await logger.logResolved({ meeting_id: "...", ... });
 * ```
 */
export class MeetingEventLogger {
  private readonly _log: EventLog;
  /**
   * System run_id injected at construction time.
   * All events emitted by this logger use this run_id so meeting events can
   * be correlated with the orchestrator run that created them.
   */
  private readonly _run_id: string;

  constructor(log: EventLog, runId: string = "meeting-orchestrator") {
    this._log    = log;
    this._run_id = runId;
  }

  // ── Public logging methods ──────────────────────────────────────────────

  /**
   * Persist a `meeting.started` event when a new collaboration session is
   * initiated.
   *
   * This MUST be called immediately after CollaborationSession construction
   * (or inside MeetingHttpServer.handleConvene) so that the event log
   * faithfully records the session's existence from its first moment.
   *
   * @returns The persisted ConitensEvent, or null if the write failed.
   */
  async logStarted(input: LogStartedInput): Promise<void> {
    const payload: MeetingStartedPayload = {
      meeting_id:            input.meeting_id,
      room_id:               input.room_id,
      title:                 input.title,
      initiated_by:          input.initiated_by,
      participant_ids:       input.participant_ids,
      agenda:                input.agenda,
      scheduled_duration_ms: input.scheduled_duration_ms,
    };

    await this._appendSafe("meeting.started", input.initiated_by, payload, {
      causation_id:   input.causation_id,
      correlation_id: input.correlation_id ?? input.meeting_id,
    });
  }

  /**
   * Persist a `meeting.deliberation` event when the session protocol
   * transitions from `request` → `deliberate`.
   *
   * This MUST be called inside MeetingHttpServer.handleBeginDeliberation
   * after session.beginDeliberation() succeeds.
   *
   * @returns The persisted ConitensEvent, or null if the write failed.
   */
  async logDeliberation(input: LogDeliberationInput): Promise<void> {
    const payload: MeetingDeliberationPayload = {
      meeting_id:   input.meeting_id,
      room_id:      input.room_id,
      initiated_by: input.initiated_by,
      request_id:   input.request_id,
      note:         input.note,
    };

    await this._appendSafe("meeting.deliberation", input.initiated_by, payload, {
      correlation_id: input.correlation_id ?? input.meeting_id,
    });
  }

  /**
   * Persist a `meeting.resolved` event when the session protocol
   * transitions from `deliberate` → `resolve`.
   *
   * This MUST be called inside MeetingHttpServer.handleResolveProtocol
   * after session.resolveProtocol() succeeds.
   *
   * @returns The persisted ConitensEvent, or null if the write failed.
   */
  async logResolved(input: LogResolvedInput): Promise<void> {
    const payload: MeetingResolvedPayload = {
      meeting_id:     input.meeting_id,
      room_id:        input.room_id,
      resolution_id:  input.resolution_id,
      outcome:        input.outcome,
      summary:        input.summary,
      resolved_by:    input.resolved_by,
      decision_count: input.decision_count,
      task_count:     input.task_count,
    };

    await this._appendSafe("meeting.resolved", input.resolved_by, payload, {
      correlation_id: input.correlation_id ?? input.meeting_id,
    });
  }

  /**
   * Persist a `meeting.task.spawned` event for each SpawnedTask produced
   * when a meeting resolution is declared.
   *
   * Sub-AC 10c: This MUST be called for every SpawnedTask returned by
   * session.resolveProtocol() so that task provenance (meeting → resolution
   * → task) is fully recorded in the append-only EventLog.
   *
   * Callers SHOULD call logResolved() before calling logTaskSpawned() so the
   * causal chain in the log is meeting.resolved → meeting.task.spawned.
   *
   * @returns Resolves when the event has been fsynced (or silently on failure).
   */
  async logTaskSpawned(input: LogTaskSpawnedInput): Promise<void> {
    const payload: Record<string, unknown> = {
      task_id:       input.task_id,
      session_id:    input.session_id,
      resolution_id: input.resolution_id,
      room_id:       input.room_id,
      title:         input.title,
      description:   input.description,
      assigned_to:   input.assigned_to,
      priority:      input.priority,
      status:        input.status,
      spawned_at:    input.spawned_at,
      metadata:      input.metadata ?? {},
    };

    await this._appendSafe("meeting.task.spawned", input.session_id, payload, {
      causation_id:   input.causation_id,
      correlation_id: input.correlation_id ?? input.session_id,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Fire-and-forget EventLog.append() wrapper.
   *
   * Errors are caught and written to stderr so that EventLog I/O failures
   * never propagate to the HTTP layer and never block a meeting protocol action.
   */
  private async _appendSafe(
    type: "meeting.started" | "meeting.deliberation" | "meeting.resolved" | "meeting.task.spawned",
    actorId: string,
    payload: Record<string, unknown> | object,
    meta: {
      causation_id?:   string;
      correlation_id?: string;
    } = {},
  ): Promise<void> {
    try {
      await this._log.append({
        type,
        run_id:         this._run_id,
        actor:          { kind: "system", id: actorId },
        payload:        { ...payload } as Record<string, unknown>,
        causation_id:   meta.causation_id,
        correlation_id: meta.correlation_id,
      });
    } catch (err) {
      // Log to stderr but never throw — record transparency is best-effort
      // when the underlying storage fails; the in-memory session remains valid.
      console.error(
        `[MeetingEventLogger] Failed to persist ${type} for meeting ` +
        `${(payload as { meeting_id?: string })["meeting_id"] ?? "?"}:`,
        err,
      );
    }
  }
}
