/**
 * event-log-schema.ts — Typed replay event schema definitions.
 *
 * Sub-AC 9a: Defines the three canonical replay event categories and the
 * TypedReplayEvent discriminated union that the event-log-parser produces
 * from raw JSONL entries stored in .conitens/events/*.jsonl.
 *
 * Three categories are defined:
 *   1. agent_lifecycle  — Agent spawn, heartbeat, error, termination,
 *                         migration, lifecycle transitions, and spatial events.
 *   2. command          — Command issued/completed/failed/rejected and
 *                         multi-step pipeline events.
 *   3. state_change     — All other state-mutating events (task, layout,
 *                         meeting, mode, system, memory, handoff, etc.)
 *
 * Design principles (from project constraints):
 *  - Record transparency: every replay event carries the full original
 *    envelope so nothing is lost.
 *  - Typed payloads: every event carries its validated, strongly-typed
 *    payload alongside the raw payload for forward-compatibility.
 *  - Self-describing: each TypedReplayEvent encodes its category, event
 *    type, and timestamp so replay consumers need no external schema.
 *  - Append-only semantics: this schema never mutates source events.
 */
import type { ConitensEvent, EventType, Actor } from "@conitens/protocol";
import type {
  AgentEventType,
  AllAgentEventPayloadMap,
} from "@conitens/protocol";
import type {
  CommandEventType,
  PipelineEventType,
  CommandEventPayloadMap,
  PipelineEventPayloadMap,
} from "@conitens/protocol";

// ---------------------------------------------------------------------------
// Replay schema version
// ---------------------------------------------------------------------------

/** Canonical schema version for the replay event schema output. */
export const REPLAY_SCHEMA_VERSION = "replay@1.0.0" as const;
export type ReplaySchemaVersion = typeof REPLAY_SCHEMA_VERSION;

// ---------------------------------------------------------------------------
// Replay event categories
// ---------------------------------------------------------------------------

/**
 * The three canonical replay event categories.
 *
 * Used as a discriminant field on TypedReplayEvent to enable exhaustive
 * pattern matching in the replay engine without runtime instanceof checks.
 *
 *   "agent_lifecycle" — Agent process and spatial events
 *   "command"         — Command + pipeline ingestion and execution events
 *   "state_change"    — Everything else (task, layout, meeting, mode, …)
 */
export type ReplayEventCategory =
  | "agent_lifecycle"
  | "command"
  | "state_change";

// ---------------------------------------------------------------------------
// Base replay event — fields common to all categories
// ---------------------------------------------------------------------------

/**
 * Fields common to every typed replay event.
 *
 * All fields are guaranteed present after parsing — no optional fields here.
 * Optional fields from the raw ConitensEvent envelope are available via
 * the `raw` property.
 */
export interface BaseReplayEvent {
  /** Discriminant category for this replay event. */
  replayCategory: ReplayEventCategory;
  /**
   * The complete original ConitensEvent envelope.
   * Preserved for full auditability — all fields, including redacted ones,
   * are carried through unchanged.
   */
  raw: ConitensEvent;
  /**
   * Canonical event type after alias resolution.
   * Obsolete alias types (e.g. "task.updated") are resolved to their
   * canonical counterparts (e.g. "task.status_changed") before classification.
   */
  type: EventType;
  /** ISO 8601 timestamp string (copied from raw.ts). */
  ts: string;
  /** Unix timestamp in milliseconds (derived from raw.ts). */
  tsMs: number;
  /** Actor that emitted this event. */
  actor: Actor;
  /** Orchestration run context (copied from raw.run_id). */
  run_id: string;
  /**
   * Monotonically increasing sequence number assigned by the parser within
   * a single `parseLines` / `parseJsonlText` call (1-based).
   *
   * Enables ordering without relying on wall-clock timestamps, and provides
   * a stable replay cursor when multiple events share the same millisecond.
   */
  seq: number;
}

// ---------------------------------------------------------------------------
// Agent lifecycle replay events
// ---------------------------------------------------------------------------

/**
 * A replay event in the "agent_lifecycle" category.
 *
 * Covers every event type in the AGENT_EVENT_TYPES tuple:
 *   agent.spawned, agent.heartbeat, agent.error, agent.terminated,
 *   agent.migrated, agent.lifecycle.changed, agent.moved, agent.assigned,
 *   agent.status_changed, agent.task.started, agent.task.completed
 *
 * `typedPayload` is validated to match the expected interface for the
 * specific event type (via the AGENT_PAYLOAD_GUARDS discriminator map).
 *
 * Narrowing example:
 * ```ts
 * if (ev.replayCategory === "agent_lifecycle" && ev.type === "agent.spawned") {
 *   // ev.typedPayload is AgentSpawnedPayload
 *   console.log(ev.typedPayload.persona);
 * }
 * ```
 */
export interface AgentLifecycleReplayEvent extends BaseReplayEvent {
  replayCategory: "agent_lifecycle";
  /** Narrowed to the agent event type subset. */
  type: AgentEventType;
  /**
   * Validated, strongly-typed payload.
   *
   * The runtime type is `AllAgentEventPayloadMap[ev.type]` — narrow `ev.type`
   * first to get precise type inference for the payload fields.
   */
  typedPayload: AllAgentEventPayloadMap[AgentEventType];
  /**
   * The agent_id extracted from the validated payload (convenience field).
   * Always present for agent_lifecycle events — the type guards ensure this.
   */
  agentId: string;
}

// ---------------------------------------------------------------------------
// Command replay events
// ---------------------------------------------------------------------------

/** Union of command and pipeline EventType strings. */
export type CommandOrPipelineEventType = CommandEventType | PipelineEventType;

/**
 * A replay event in the "command" category.
 *
 * Covers:
 *   command.issued, command.completed, command.failed, command.rejected
 *   pipeline.started, pipeline.step, pipeline.completed, pipeline.failed
 *
 * `typedPayload` is validated against the correct interface for the
 * event type (via COMMAND_PAYLOAD_GUARDS or PIPELINE_PAYLOAD_GUARDS).
 *
 * `commandId` and `pipelineId` are convenience fields extracted from
 * the validated payload for replay cursor tracking.
 *
 * Narrowing example:
 * ```ts
 * if (ev.replayCategory === "command" && ev.type === "command.issued") {
 *   // ev.typedPayload is CommandIssuedPayload
 *   console.log(ev.typedPayload.command_id, ev.typedPayload.source);
 * }
 * ```
 */
export interface CommandReplayEvent extends BaseReplayEvent {
  replayCategory: "command";
  type: CommandOrPipelineEventType;
  /**
   * Validated, strongly-typed payload (command or pipeline).
   *
   * Narrow `ev.type` to `CommandEventType` or `PipelineEventType` to get
   * precise type inference.
   */
  typedPayload:
    | CommandEventPayloadMap[CommandEventType]
    | PipelineEventPayloadMap[PipelineEventType];
  /**
   * command_id extracted from the payload, if present.
   * Set for command.* events; undefined for pipeline.* events.
   */
  commandId?: string;
  /**
   * pipeline_id extracted from the payload, if present.
   * Set for pipeline.* events; undefined for command.* events.
   */
  pipelineId?: string;
}

// ---------------------------------------------------------------------------
// State-change replay events
// ---------------------------------------------------------------------------

/**
 * EventTypes that belong to the "state_change" category.
 *
 * This is everything that is not an agent lifecycle event and not a
 * command/pipeline event. Includes: task.*, layout.*, meeting.*, mode.*,
 * system.*, memory.*, handoff.*, decision.*, approval.*, schema.*,
 * message.*.
 */
export type StateChangeEventType = Exclude<
  EventType,
  AgentEventType | CommandOrPipelineEventType
>;

/**
 * A replay event in the "state_change" category.
 *
 * Represents any state-mutating event that isn't agent lifecycle or
 * command/pipeline. Payload is carried as a typed `Record<string, unknown>`
 * without deep structural validation, providing forward-compatibility with
 * new event types added in future schema versions.
 *
 * The `domain` field provides a coarse grouping for filtering and display
 * in the 3D command-center (e.g. "task", "layout", "meeting").
 */
export interface StateChangeReplayEvent extends BaseReplayEvent {
  replayCategory: "state_change";
  type: StateChangeEventType;
  /**
   * Payload validated to be a plain object (no structural validation beyond
   * that, to preserve forward-compatibility with unknown event types).
   */
  typedPayload: Record<string, unknown>;
  /**
   * Coarse domain extracted from the event type prefix
   * (e.g. "task" for task.created, "layout" for layout.updated).
   * Enables fast filtering in the replay engine without string splitting.
   */
  domain: string;
  /**
   * The task_id from the ConitensEvent envelope, if present.
   * Enables efficient task-scoped replay queries without payload inspection.
   */
  taskId?: string;
}

// ---------------------------------------------------------------------------
// Discriminated union — TypedReplayEvent
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all replay event types.
 *
 * Switch on `replayCategory` for exhaustive type-safe pattern matching:
 *
 * ```ts
 * function handleReplayEvent(ev: TypedReplayEvent) {
 *   switch (ev.replayCategory) {
 *     case "agent_lifecycle":
 *       // ev is AgentLifecycleReplayEvent
 *       console.log(ev.agentId);
 *       break;
 *     case "command":
 *       // ev is CommandReplayEvent
 *       console.log(ev.commandId ?? ev.pipelineId);
 *       break;
 *     case "state_change":
 *       // ev is StateChangeReplayEvent
 *       console.log(ev.domain, ev.taskId);
 *       break;
 *   }
 * }
 * ```
 */
export type TypedReplayEvent =
  | AgentLifecycleReplayEvent
  | CommandReplayEvent
  | StateChangeReplayEvent;

// ---------------------------------------------------------------------------
// Parse error types
// ---------------------------------------------------------------------------

/**
 * Machine-readable error codes produced by the event log parser.
 *
 * These are stable identifiers suitable for programmatic handling in
 * error dashboards, alerts, and self-improvement analysis tools.
 * New codes MUST be added rather than changing existing ones to maintain
 * backwards compatibility with error log consumers.
 */
export type ParseErrorCode =
  | "JSON_PARSE_FAILED"        // Line is not valid JSON
  | "NOT_AN_OBJECT"            // Parsed JSON is not a plain object
  | "MISSING_SCHEMA"           // schema field absent or not a string
  | "SCHEMA_VERSION_MISMATCH"  // schema field doesn't match SCHEMA_VERSION
  | "MISSING_EVENT_ID"         // event_id field absent or not a string
  | "INVALID_EVENT_ID"         // event_id is an empty string
  | "MISSING_TYPE"             // type field absent or not a string
  | "UNKNOWN_EVENT_TYPE"       // type is not in EVENT_TYPES and no alias exists
  | "MISSING_TIMESTAMP"        // ts field absent or not a string
  | "INVALID_TIMESTAMP"        // ts is not a parseable ISO 8601 string
  | "MISSING_ACTOR"            // actor field absent or malformed
  | "MISSING_PAYLOAD"          // payload field absent or not a plain object
  | "INVALID_PAYLOAD"          // payload doesn't match the expected typed shape
  | "UNKNOWN_ERROR";           // Unexpected error during parsing

/** Structured parse error for a single log line. */
export interface ParseError {
  /** Canonical error code for programmatic handling. */
  code: ParseErrorCode;
  /** Human-readable description of the problem. */
  message: string;
  /**
   * Zero-based line index in the source JSONL input where the error occurred.
   * `-1` if the position is unknown.
   */
  lineOffset: number;
  /** The raw string content of the line, for debugging. */
  rawLine: string;
}

// ---------------------------------------------------------------------------
// Parse result types
// ---------------------------------------------------------------------------

/**
 * The result of parsing a single JSONL line.
 *
 * On success: `{ ok: true, event: TypedReplayEvent }`
 * On failure: `{ ok: false, error: ParseError }`
 *
 * Parse errors are non-fatal — each line is parsed independently so a single
 * malformed entry does not abort the parsing of subsequent lines.
 */
export type ParseResult =
  | { ok: true; event: TypedReplayEvent }
  | { ok: false; error: ParseError };

// ---------------------------------------------------------------------------
// Batch parse result
// ---------------------------------------------------------------------------

/** Aggregate result of parsing a batch of JSONL lines. */
export interface ParseBatchResult {
  /**
   * All successfully parsed events in the order they appeared in the input.
   * Chronological order is preserved because JSONL files are written in
   * append order by the EventLog.
   */
  events: TypedReplayEvent[];
  /** All parse errors encountered (one per malformed line). */
  errors: ParseError[];
  /** Total number of non-empty lines processed. */
  totalLines: number;
  /** Number of lines successfully parsed. */
  parsedCount: number;
  /** Number of lines that produced parse errors. */
  errorCount: number;
  /**
   * Minimum timestamp (ms) among successfully parsed events.
   * `Infinity` when no events were parsed.
   */
  firstEventTsMs: number;
  /**
   * Maximum timestamp (ms) among successfully parsed events.
   * `-Infinity` when no events were parsed.
   */
  lastEventTsMs: number;
  /** Event counts broken down by replay category. */
  categoryCounts: Record<ReplayEventCategory, number>;
}
