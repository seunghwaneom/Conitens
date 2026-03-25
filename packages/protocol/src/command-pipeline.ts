/**
 * @module command-pipeline
 * RFC-1.0.1 §4 Sub-AC 3 — Command and Pipeline event payloads, type guards,
 * and utilities.
 *
 * Commands are first-class entities that bridge user intent (GUI / CLI) to
 * orchestrator action via the file-based command ingestion pipeline.
 *
 * Command event hierarchy:
 *   command.issued        — a command was submitted (pre-execution)
 *   command.acknowledged  — an executor claimed the command and began processing
 *   command.completed     — a command executed successfully
 *   command.failed        — a command was rejected or errored during execution
 *   command.rejected      — a command was rejected at the ingestion boundary
 *                           (schema / auth / policy violation — pre-execution)
 *
 * Pipeline event hierarchy:
 *   pipeline.started         — a multi-step pipeline began executing
 *   pipeline.step            — a single pipeline step changed state
 *   pipeline.stage_completed — a logical stage (group of steps) completed
 *   pipeline.completed       — all pipeline steps finished successfully
 *   pipeline.failed          — the pipeline aborted due to a step or runtime error
 *   pipeline.cancelled       — the pipeline was cancelled before completion
 *
 * Stages vs Steps
 * ---------------
 * A *step* is a single atomic operation within a pipeline.
 * A *stage* is a named logical grouping of steps (e.g. "validation", "execution",
 * "cleanup").  Stages provide a higher-level progress signal and are the unit
 * displayed in the 3D command-center pipeline visualiser.  Each stage may
 * contain one or more steps; pipeline.stage_completed fires once all steps
 * within that stage have finished.
 *
 * Design rationale
 * ----------------
 * Commands record the *intent* layer; pipelines record the *execution* layer.
 * Together they form a complete, replayable audit trail of every action taken
 * by the orchestration system — satisfying the record-transparency principle
 * and enabling the self-improvement cycle (record → analyse → improve).
 */
import type { EventType } from "./event.js";
import type { GuiCommandType } from "./command-file.js";

// ---------------------------------------------------------------------------
// Command EventType subset
// ---------------------------------------------------------------------------

/** Tuple of all canonical command event type strings. */
export const COMMAND_EVENT_TYPES = [
  // Core command lifecycle
  "command.issued",
  "command.acknowledged",
  "command.completed",
  "command.failed",
  "command.rejected",
  // Control-plane dispatching events (Sub-AC 16b)
  // Model the full journey of a command through the control plane:
  //   issued → queued → dispatched → acknowledged → completed | failed
  //                                              → retried → …
  //                                              → timeout
  //                                              → cancelled
  //                                              → escalated → completed | failed
  "command.dispatched",
  "command.queued",
  "command.retried",
  "command.timeout",
  "command.cancelled",
  "command.escalated",
  // Generic state transition catch-all (Sub-AC 4)
  // Emitted for any command state change not described by the specific events above.
  // Carries prev/next state and an optional fixture_ids array so that the
  // FixtureStateSyncReducer can push fixture.state_sync events to the 3D scene.
  "command.state_changed",
] as const satisfies readonly EventType[];

export type CommandEventType = (typeof COMMAND_EVENT_TYPES)[number];

/** O(1) membership test for command event types. */
export const COMMAND_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  COMMAND_EVENT_TYPES,
);

/** Type guard — narrows a string to a CommandEventType. */
export function isCommandEventType(s: string): s is CommandEventType {
  return COMMAND_EVENT_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Pipeline EventType subset
// ---------------------------------------------------------------------------

/** Tuple of all canonical pipeline event type strings. */
export const PIPELINE_EVENT_TYPES = [
  "pipeline.started",
  "pipeline.step",
  // Stage lifecycle events (Sub-AC 16c) — full symmetric start/complete/fail for each stage
  "pipeline.stage_started",
  "pipeline.stage_completed",
  "pipeline.stage_failed",
  // Task routing events (Sub-AC 16c) — record executor selection for routed tasks
  "pipeline.task_routed",
  "pipeline.completed",
  "pipeline.failed",
  "pipeline.cancelled",
] as const satisfies readonly EventType[];

export type PipelineEventType = (typeof PIPELINE_EVENT_TYPES)[number];

/** O(1) membership test for pipeline event types. */
export const PIPELINE_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  PIPELINE_EVENT_TYPES,
);

/** Type guard — narrows a string to a PipelineEventType. */
export function isPipelineEventType(s: string): s is PipelineEventType {
  return PIPELINE_EVENT_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Shared primitive types
// ---------------------------------------------------------------------------

/**
 * Source channel that originated a command.
 *
 * - `gui`      — issued by the 3D command-center GUI via command-file drop
 * - `cli`      — issued by a shell / CLI invocation
 * - `agent`    — issued programmatically by an orchestrated agent
 * - `system`   — issued by internal system logic (e.g. watchdog, scheduler)
 * - `webhook`  — issued via an external HTTP/webhook integration
 */
export type CommandSource = "gui" | "cli" | "agent" | "system" | "webhook";

/**
 * Execution status of a single pipeline step.
 *
 * Transitions (simplified):
 *   pending → started → completed
 *                     → failed
 *                     → skipped
 */
export type PipelineStepStatus =
  | "pending"
  | "started"
  | "completed"
  | "failed"
  | "skipped";

// ---------------------------------------------------------------------------
// Command payload interfaces
// ---------------------------------------------------------------------------

/**
 * command.issued
 *
 * Emitted the moment a command passes schema/auth validation and is accepted
 * by the orchestrator for execution.  This is the "point of commitment" event;
 * it MUST precede any state-mutating action the command triggers.
 *
 * `command_id` is a stable idempotency key that correlates this event with the
 * subsequent command.completed / command.failed event.
 */
export interface CommandIssuedPayload {
  /** Unique identifier for this command invocation (UUIDv4 recommended). */
  command_id: string;
  /** The GUI command type that was issued. */
  command_type: GuiCommandType;
  /**
   * Origin channel of the command.
   * Useful for audit trails and rate-limit attribution.
   */
  source: CommandSource;
  /**
   * Opaque command parameters exactly as received from the originating source,
   * before any server-side transformation.  Secrets MUST be redacted before
   * this event is appended to the log.
   */
  input: Record<string, unknown>;
  /**
   * .conitens/-relative path of the command file, if the command was ingested
   * from the file-based pipeline (commands/*.json).
   */
  command_file?: string;
  /** Monotonic wall-clock time (ms) when the command was accepted. */
  accepted_at_ms?: number;
}

/**
 * command.acknowledged  (RFC-1.0.1 §4 Sub-AC 2)
 *
 * Emitted when an executor (orchestrator worker, agent, or pipeline runner)
 * claims a command that was previously accepted via `command.issued` and
 * begins processing it.  This event closes the "dispatch gap" between
 * acceptance and execution, enabling the 3D command-center to display an
 * accurate in-flight status for long-running commands.
 *
 * Lifecycle position:
 *   command.issued → command.acknowledged → command.completed
 *                                         → command.failed
 *
 * A `command.acknowledged` event SHOULD be emitted before any
 * state-mutating side-effects are triggered by the executor.  If a command
 * completes so quickly that an intermediate acknowledged event is not useful,
 * emitting it is still RECOMMENDED for audit-trail completeness; the
 * `command.completed` event's `duration_ms` will then include the dispatch
 * gap naturally.
 *
 * `executor_id` identifies *which* worker picked up the command, supporting
 * diagnostics in multi-worker deployments.
 */
export interface CommandAcknowledgedPayload {
  /** Correlates with command.issued.command_id. */
  command_id: string;
  /** Echoed for indexing without a join. */
  command_type: GuiCommandType;
  /**
   * ID of the executor that claimed this command (e.g. agent ID, worker ID,
   * or "orchestrator" for the primary orchestrator process).
   */
  executor_id: string;
  /**
   * Monotonic wall-clock time (ms) when the executor claimed the command.
   * The gap between `command.issued.accepted_at_ms` and this field is the
   * dispatch latency — a key metric for control-plane performance analysis.
   */
  acknowledged_at_ms?: number;
  /**
   * Optional human-readable note explaining how the executor intends to
   * fulfil the command, e.g. "spawning pipeline agent-bootstrap".
   */
  note?: string;
}

/**
 * command.completed
 *
 * Emitted after a command has finished executing successfully.
 *
 * `result` is a free-form summary of the outcomes produced, e.g. a list of
 * event IDs emitted, entity IDs created, or a human-readable summary.
 */
export interface CommandCompletedPayload {
  /** Correlates with command.issued.command_id. */
  command_id: string;
  /** Echoed for indexing without a join. */
  command_type: GuiCommandType;
  /**
   * Free-form execution result.  Should include identifiers of any entities
   * created or mutated by the command.
   */
  result?: Record<string, unknown>;
  /** Wall-clock execution duration in milliseconds. */
  duration_ms?: number;
  /**
   * IDs of events that were emitted as a direct consequence of this command.
   * Enables causal chain reconstruction during replay.
   */
  emitted_event_ids?: string[];
}

/**
 * command.failed
 *
 * Emitted when a command that was accepted for execution subsequently errors
 * or is explicitly rejected during execution (e.g. a policy check within the
 * orchestrator fails after the command was initially accepted).
 *
 * Use command.rejected for failures that occur *before* the command is
 * accepted (schema errors, authentication failures, etc.).
 */
export interface CommandFailedPayload {
  /** Correlates with command.issued.command_id. */
  command_id: string;
  /** Echoed for indexing without a join. */
  command_type: GuiCommandType;
  /** Machine-readable error code, e.g. "AGENT_NOT_FOUND", "POLICY_DENIED". */
  error_code: string;
  /** Human-readable explanation of the failure. */
  error_message: string;
  /** Whether retrying the same command (unchanged) may succeed. */
  retryable?: boolean;
  /** Wall-clock execution duration in milliseconds (up to point of failure). */
  duration_ms?: number;
}

/**
 * command.rejected
 *
 * Emitted when a command is refused at the ingestion boundary, before any
 * orchestrator-side execution begins.  Typical causes:
 *
 *   - Schema validation failure (malformed command file)
 *   - Unknown command type
 *   - Authentication / authorisation denial
 *   - Rate-limit exceeded
 *   - Duplicate idempotency key (replay guard)
 *
 * Because the command may never have been assigned a command_id by the
 * orchestrator, `command_id` is optional here.
 */
export interface CommandRejectedPayload {
  /**
   * Client-supplied command_id, if one was present in the ingested file.
   * May be absent for completely malformed input.
   */
  command_id?: string;
  /**
   * Attempted command type, if parseable from the input.
   * May be absent for completely malformed input.
   */
  command_type?: string;
  /** Machine-readable rejection reason code. */
  rejection_code: string;
  /** Human-readable description of why the command was rejected. */
  rejection_reason: string;
  /**
   * Raw (redacted) content of the rejected command file or payload for
   * debugging purposes.  Secrets MUST be stripped before logging.
   */
  raw_input?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sub-AC 16b — control-plane dispatching payload interfaces
// ---------------------------------------------------------------------------

/**
 * command.dispatched  (Sub-AC 16b)
 *
 * Emitted when the orchestrator routes a command to a specific executor
 * after it has been accepted via `command.issued`.  This event closes the
 * "routing gap" — the window between acceptance and executor claim — enabling
 * the 3D command-center to display per-executor in-flight status.
 *
 * Lifecycle position:
 *   command.issued → [command.queued] → command.dispatched → command.acknowledged
 *
 * `executor_kind` identifies the type of entity that received the dispatch,
 * supporting heterogeneous executor topologies (agents, pipelines, system
 * handlers) in the same orchestration run.
 */
export interface CommandDispatchedPayload {
  /** Correlates with command.issued.command_id. */
  command_id: string;
  /** Echoed for indexing without a join. */
  command_type: GuiCommandType;
  /** ID of the specific executor this command was routed to. */
  executor_id: string;
  /**
   * Category of executor that received the dispatch.
   *   agent        — an orchestrated agent process
   *   orchestrator — the primary orchestrator (self-dispatch)
   *   pipeline     — a named pipeline runner
   *   system       — an internal system handler (watchdog, scheduler, etc.)
   */
  executor_kind: "agent" | "orchestrator" | "pipeline" | "system";
  /** Monotonic wall-clock time (ms) when the dispatch was sent. */
  dispatched_at_ms?: number;
  /**
   * Executor queue depth at dispatch time.
   * Values > 0 indicate the executor has pending work ahead of this command.
   * Useful for diagnosing dispatch latency spikes.
   */
  queue_depth?: number;
}

/**
 * command.queued  (Sub-AC 16b)
 *
 * Emitted when a command enters an executor's work queue, waiting to be
 * picked up.  This event is optional — it is only emitted by executors that
 * maintain an explicit work queue (e.g. pipeline runners, agent inboxes).
 *
 * Lifecycle position:
 *   command.issued → command.queued → command.dispatched → command.acknowledged
 *
 * `queue_position` enables the 3D command-center to display queue depth
 * visualisations on executor nodes.
 */
export interface CommandQueuedPayload {
  /** Correlates with command.issued.command_id. */
  command_id: string;
  /** Echoed for indexing without a join. */
  command_type: GuiCommandType;
  /** Identifier of the queue this command entered (e.g. "agent-inbox:researcher-1"). */
  queue_id: string;
  /** 1-based position in the queue at the time of enqueueing. */
  queue_position?: number;
  /** Monotonic wall-clock time (ms) when the command entered the queue. */
  queued_at_ms?: number;
  /**
   * Estimated wait time in milliseconds before this command will be processed.
   * Computed by the executor from its current queue depth and average throughput.
   */
  estimated_wait_ms?: number;
}

/**
 * command.retried  (Sub-AC 16b)
 *
 * Emitted when a command that previously failed is automatically retried by
 * the orchestrator or executor.  Each retry attempt produces one event.
 *
 * Lifecycle position:
 *   command.failed → command.retried → command.dispatched → command.completed | command.failed
 *
 * `attempt_number` is 1-based (first retry = 1, second retry = 2, …).
 * When `attempt_number >= max_attempts`, the next failure should produce a
 * final `command.failed` event with `retryable = false`.
 */
export interface CommandRetriedPayload {
  /** Correlates with command.issued.command_id. */
  command_id: string;
  /** Echoed for indexing without a join. */
  command_type: GuiCommandType;
  /** 1-based retry attempt number (first retry = 1). */
  attempt_number: number;
  /** Maximum number of retry attempts configured for this command type. */
  max_attempts?: number;
  /**
   * Machine-readable reason why the retry was triggered.
   *   executor_error     — executor returned a retryable error
   *   timeout            — previous attempt exceeded time limit
   *   executor_lost      — executor became unavailable
   *   policy_retry       — an explicit retry policy triggered the retry
   */
  retry_reason: string;
  /** Monotonic wall-clock time (ms) when the retry was initiated. */
  retried_at_ms?: number;
  /** Error code from the previous failed attempt, for audit continuity. */
  previous_error_code?: string;
}

/**
 * command.timeout  (Sub-AC 16b)
 *
 * Emitted when a command exceeds its configured execution time limit.
 * This event represents a terminal failure condition — the command will
 * not be retried unless the caller explicitly issues a new command.
 *
 * Lifecycle position:
 *   command.issued → … → command.timeout  (terminal — no further execution)
 *
 * `timeout_ms` is the configured limit; `elapsed_ms` is the actual time
 * that passed.  `elapsed_ms > timeout_ms` is expected due to scheduling jitter.
 */
export interface CommandTimeoutPayload {
  /** Correlates with command.issued.command_id. */
  command_id: string;
  /** Echoed for indexing without a join. */
  command_type: GuiCommandType;
  /** Configured execution time limit in milliseconds. */
  timeout_ms: number;
  /** Actual time elapsed from command.issued to timeout detection, in ms. */
  elapsed_ms: number;
  /** ID of the executor that held the command when it timed out. */
  executor_id?: string;
  /**
   * Last known state of the command before the timeout was detected.
   * Helps operators understand how far execution progressed before timing out.
   */
  last_known_state?: string;
}

/**
 * command.cancelled  (Sub-AC 16b)
 *
 * Emitted when a command is explicitly cancelled before it completes.
 * Cancellation may be triggered by an operator, a watchdog policy, or the
 * orchestrator in response to a dependent resource becoming unavailable.
 *
 * A `command.cancelled` event is a deliberate early termination — it MUST
 * be distinguished from `command.failed` (unrecoverable execution error)
 * and `command.timeout` (time limit exceeded).
 *
 * `partial_effects` documents any state changes that occurred before
 * cancellation — important for audit trails and rollback planning.
 */
export interface CommandCancelledPayload {
  /** Correlates with command.issued.command_id. */
  command_id: string;
  /** Echoed for indexing without a join. */
  command_type: GuiCommandType;
  /**
   * Identity of the actor that triggered the cancellation.
   * May be a user ID, agent ID, or "system" for policy-triggered cancellations.
   */
  cancelled_by: string;
  /**
   * Machine-readable reason for the cancellation.
   * Standard codes:
   *   USER_REQUESTED       — explicit operator cancellation
   *   WATCHDOG_TIMEOUT     — command exceeded maximum allowed time
   *   DEPENDENCY_LOST      — a required dependency became unavailable
   *   POLICY_OVERRIDE      — cancelled by an orchestrator policy
   *   SUPERSEDED           — a newer command supersedes this one
   */
  cancellation_reason?: string;
  /** Monotonic wall-clock time (ms) when the cancellation was applied. */
  cancelled_at_ms?: number;
  /**
   * List of event IDs (or human-readable descriptions) of side-effects that
   * occurred before cancellation.  Enables partial-progress accounting and
   * rollback planning.  An empty array indicates no side-effects occurred.
   */
  partial_effects?: string[];
}

/**
 * command.escalated  (Sub-AC 16b)
 *
 * Emitted when a command is escalated to a higher-authority actor for
 * approval or elevated execution.  Escalation occurs when:
 *   - A policy check requires human approval for a high-risk command.
 *   - An executor lacks the permissions/capabilities to fulfil the command.
 *   - The command requires a decision from a meeting/deliberation session.
 *
 * Lifecycle position:
 *   command.issued → command.escalated → [approval flow] → command.dispatched → …
 *                                                         → command.rejected (if denied)
 *
 * `approval_required` distinguishes informational escalation (routing to a
 * more capable executor) from gated escalation (waiting for explicit approval).
 */
export interface CommandEscalatedPayload {
  /** Correlates with command.issued.command_id. */
  command_id: string;
  /** Echoed for indexing without a join. */
  command_type: GuiCommandType;
  /**
   * Identity of the actor or system that the command was escalated to.
   * May be a user ID, agent ID, meeting room ID, or "approval-queue".
   */
  escalated_to: string;
  /**
   * Machine-readable reason for escalation.
   * Standard codes:
   *   HIGH_RISK_COMMAND    — command is in the high-risk shell pattern list (§9)
   *   INSUFFICIENT_PERMS   — executor lacks capability to fulfil the command
   *   POLICY_GATE          — an explicit policy requires escalation
   *   APPROVAL_REQUIRED    — explicit human approval is required
   */
  escalation_reason: string;
  /**
   * Whether explicit approval is required before the command can proceed.
   * `true`  → command is gated; execution blocked until approval.granted
   * `false` → informational escalation; routed to a more capable executor
   */
  approval_required?: boolean;
  /** Monotonic wall-clock time (ms) when the escalation was recorded. */
  escalated_at_ms?: number;
  /**
   * The executor that originally held the command before escalation.
   * Useful for tracing the routing history of a command.
   */
  original_executor?: string;
}

// ---------------------------------------------------------------------------
// Pipeline payload interfaces
// ---------------------------------------------------------------------------

/**
 * pipeline.started
 *
 * Emitted when a pipeline begins executing.  A pipeline is a named, ordered
 * sequence of steps that are executed to fulfil a higher-level goal (e.g.
 * "spawn-and-assign-agent", "create-task-and-notify").
 *
 * Pipelines may be initiated directly by commands, by the scheduler, or by
 * agent-internal logic.
 */
export interface PipelineStartedPayload {
  /** Unique identifier for this pipeline run (UUIDv4 recommended). */
  pipeline_id: string;
  /** Human-readable name of the pipeline definition, e.g. "agent-bootstrap". */
  pipeline_name: string;
  /** Ordered list of step names that will be executed. */
  steps: string[];
  /**
   * command_id that triggered this pipeline run, if applicable.
   * Enables command → pipeline causal chain reconstruction.
   */
  initiated_by_command?: string;
  /**
   * task_id that triggered this pipeline run, if applicable.
   */
  initiated_by_task?: string;
  /** Monotonic wall-clock time (ms) when execution began. */
  started_at_ms?: number;
}

/**
 * pipeline.step
 *
 * Emitted whenever a pipeline step changes state.  A single step emits this
 * event at least twice: once when it starts (status = "started") and once
 * when it finishes (status = "completed" | "failed" | "skipped").
 *
 * Consumers should accumulate these events keyed by (pipeline_id, step_index)
 * to reconstruct the full execution timeline for replay.
 */
export interface PipelineStepPayload {
  /** Correlates with pipeline.started.pipeline_id. */
  pipeline_id: string;
  /** Zero-based position of this step in the pipeline definition. */
  step_index: number;
  /** Human-readable name of this step. */
  step_name: string;
  /** Current lifecycle state of the step. */
  step_status: PipelineStepStatus;
  /**
   * Free-form output produced by this step (e.g. IDs of created entities,
   * intermediate results, or diagnostic information).
   */
  output?: Record<string, unknown>;
  /** Human-readable error message, populated only when step_status = "failed". */
  error_message?: string;
  /** Machine-readable error code, populated only when step_status = "failed". */
  error_code?: string;
  /** Wall-clock duration for this step in milliseconds. */
  duration_ms?: number;
}

/**
 * pipeline.completed
 *
 * Emitted after all pipeline steps have finished successfully.
 *
 * `artifacts` is a free-form map of outputs produced across all steps — useful
 * for downstream consumers that need aggregated results without replaying
 * individual pipeline.step events.
 */
export interface PipelineCompletedPayload {
  /** Correlates with pipeline.started.pipeline_id. */
  pipeline_id: string;
  /** Echoed for indexing without a join. */
  pipeline_name: string;
  /** Total number of steps that were executed (including skipped). */
  steps_total: number;
  /** Number of steps that completed with status = "completed". */
  steps_completed: number;
  /** Number of steps that were skipped. */
  steps_skipped?: number;
  /** Total wall-clock execution time in milliseconds. */
  duration_ms?: number;
  /**
   * Aggregated artifacts / outputs from all steps.
   * Keys are step names; values are per-step output objects.
   */
  artifacts?: Record<string, unknown>;
}

/**
 * pipeline.failed
 *
 * Emitted when a pipeline is aborted because one of its steps fails and the
 * pipeline is not configured to continue on error.
 */
export interface PipelineFailedPayload {
  /** Correlates with pipeline.started.pipeline_id. */
  pipeline_id: string;
  /** Echoed for indexing without a join. */
  pipeline_name: string;
  /** Zero-based index of the step that caused the failure. */
  failed_step_index: number;
  /** Name of the step that caused the failure. */
  failed_step_name: string;
  /** Machine-readable error code from the failed step. */
  error_code: string;
  /** Human-readable description of the failure. */
  error_message: string;
  /** Number of steps that completed successfully before the failure. */
  steps_completed: number;
  /** Total wall-clock execution time in milliseconds (up to point of failure). */
  duration_ms?: number;
}

/**
 * pipeline.stage_completed
 *
 * Emitted when a named stage (a logical grouping of one or more steps) within
 * a pipeline finishes all of its steps successfully.  Stages provide a
 * higher-level progress signal than individual pipeline.step events.
 *
 * Example stages for a "agent-bootstrap" pipeline:
 *   1. "validation"  — schema check, auth check
 *   2. "provisioning" — room assignment, resource allocation
 *   3. "activation"  — agent spawn, heartbeat confirmation
 *
 * A pipeline.stage_completed event MUST be preceded by pipeline.step events
 * for every step within the stage.  The 3D command-center uses stage events
 * to render per-stage progress bars on the pipeline visualiser panel.
 */
export interface PipelineStageCompletedPayload {
  /** Correlates with pipeline.started.pipeline_id. */
  pipeline_id: string;
  /** Echoed for indexing without a join. */
  pipeline_name: string;
  /** Zero-based ordinal position of this stage within the pipeline definition. */
  stage_index: number;
  /** Human-readable name of this stage, e.g. "validation". */
  stage_name: string;
  /**
   * Names of all steps that belonged to this stage.
   * Ordered by execution sequence.
   */
  step_names: string[];
  /** Total number of steps in this stage. */
  steps_total: number;
  /** Number of steps that completed with status = "completed". */
  steps_completed: number;
  /** Number of steps that were skipped within this stage. */
  steps_skipped?: number;
  /** Wall-clock duration for the entire stage in milliseconds. */
  duration_ms?: number;
  /**
   * Aggregated outputs from all steps within this stage.
   * Keys are step names; values are per-step output objects.
   */
  stage_artifacts?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sub-AC 16c — pipeline stage transition and task routing payload interfaces
// ---------------------------------------------------------------------------

/**
 * pipeline.stage_started  (Sub-AC 16c)
 *
 * Emitted when a named stage within a pipeline begins executing.  This event
 * is the symmetric counterpart to `pipeline.stage_completed` and provides a
 * precise start boundary for each stage — enabling the 3D command-center to
 * display per-stage in-flight status and elapsed time.
 *
 * Lifecycle position (per stage):
 *   pipeline.stage_started → pipeline.step(×N) → pipeline.stage_completed
 *                                                → pipeline.stage_failed
 *
 * `step_names` is the ordered list of step names that belong to this stage,
 * declared at stage-start so consumers know the expected scope up front.
 */
export interface PipelineStageStartedPayload {
  /** Correlates with pipeline.started.pipeline_id. */
  pipeline_id: string;
  /** Echoed for indexing without a join. */
  pipeline_name: string;
  /** Zero-based ordinal position of this stage within the pipeline definition. */
  stage_index: number;
  /** Human-readable name of this stage, e.g. "validation". */
  stage_name: string;
  /**
   * Ordered list of step names that belong to this stage.
   * Declares the scope of this stage at start time so observers can track
   * completion progress without waiting for pipeline.stage_completed.
   */
  step_names: string[];
  /** Total number of steps in this stage. */
  steps_total: number;
  /** Monotonic wall-clock time (ms) when this stage began executing. */
  started_at_ms?: number;
  /**
   * Input data passed into this stage from the previous stage's artifacts
   * or from the pipeline's initial input.  May be redacted before logging.
   */
  stage_input?: Record<string, unknown>;
}

/**
 * pipeline.stage_failed  (Sub-AC 16c)
 *
 * Emitted when a named stage within a pipeline fails — that is, when one of
 * the stage's steps fails and the stage is not configured to continue on error.
 *
 * This event is distinct from `pipeline.failed`, which fires when the entire
 * pipeline is aborted.  A `pipeline.stage_failed` event may or may not lead to
 * `pipeline.failed` depending on the pipeline's error-handling configuration.
 *
 * Lifecycle position (per stage):
 *   pipeline.stage_started → pipeline.step(×N) → pipeline.stage_failed
 *     ↓ (if pipeline abort-on-stage-error)
 *   pipeline.failed
 *
 * `steps_completed` counts the steps that succeeded within this stage before
 * the failure, enabling partial-progress accounting.
 */
export interface PipelineStageFailedPayload {
  /** Correlates with pipeline.started.pipeline_id. */
  pipeline_id: string;
  /** Echoed for indexing without a join. */
  pipeline_name: string;
  /** Zero-based ordinal position of this stage within the pipeline definition. */
  stage_index: number;
  /** Human-readable name of the failed stage, e.g. "provisioning". */
  stage_name: string;
  /**
   * All step names that belonged to this stage, for full context without
   * joining individual pipeline.step events.
   */
  step_names: string[];
  /** Zero-based index of the step that caused the stage failure. */
  failed_step_index: number;
  /** Name of the step that caused the failure. */
  failed_step_name: string;
  /** Machine-readable error code from the failed step. */
  error_code: string;
  /** Human-readable description of the failure. */
  error_message: string;
  /**
   * Number of steps within this stage that completed successfully before
   * the failure.  Enables partial-progress accounting.
   */
  steps_completed: number;
  /** Wall-clock duration for this stage in milliseconds (up to point of failure). */
  duration_ms?: number;
  /**
   * Whether this stage failure will cause the entire pipeline to abort.
   * `true`  → pipeline.failed will follow
   * `false` → pipeline continues with a fallback or skip strategy
   */
  pipeline_aborted?: boolean;
}

/**
 * pipeline.task_routed  (Sub-AC 16c)
 *
 * Emitted when the pipeline's routing layer selects a specific executor
 * (agent, system handler, or sub-pipeline) to handle a task.  Task routing
 * is distinct from command dispatching — it concerns the assignment of work
 * *within* a pipeline run, rather than the top-level delivery of a command
 * to an executor.
 *
 * Design rationale
 * ----------------
 * In a multi-agent pipeline, tasks may be dynamically routed to different
 * agents based on capability matching, load balancing, or specialisation
 * policies.  Recording the routing decision as a first-class event ensures:
 *
 *   • Full audit trail of who handled what task and why
 *   • Replay support — routing decisions can be reconstructed or overridden
 *   • 3D command-center visualisation of task flow through agent nodes
 *   • Self-improvement analysis of routing efficiency / latency
 *
 * Lifecycle position:
 *   pipeline.started → … → pipeline.task_routed → [executor processes task]
 *                                                → pipeline.step (outcome)
 */
export interface PipelineTaskRoutedPayload {
  /** Correlates with pipeline.started.pipeline_id. */
  pipeline_id: string;
  /** Echoed for indexing without a join. */
  pipeline_name: string;
  /** Identifier of the task being routed (correlates with task.created). */
  task_id: string;
  /**
   * High-level type / category of the task being routed.
   * Used by routing policies to select capable executors.
   * Examples: "code_review", "research", "document_generation".
   */
  task_type?: string;
  /** ID of the executor selected to handle this task. */
  executor_id: string;
  /**
   * Category of executor selected:
   *   agent        — an orchestrated agent process
   *   orchestrator — the primary orchestrator (self-routing)
   *   pipeline     — a named sub-pipeline runner
   *   system       — an internal system handler
   */
  executor_kind: "agent" | "orchestrator" | "pipeline" | "system";
  /**
   * Human-readable name of the routing strategy that produced this decision.
   * Standard values: "capability_match", "round_robin", "least_loaded",
   * "affinity", "explicit" (operator-specified), "fallback".
   */
  routing_strategy?: string;
  /**
   * Numeric fitness / confidence score (0.0–1.0) for this routing decision,
   * as computed by the routing engine.  Higher is better.
   * Useful for diagnosing sub-optimal routing during the analysis phase of
   * the self-improvement cycle.
   */
  routing_score?: number;
  /**
   * IDs of other executors that were considered but not selected.
   * Enables post-hoc analysis of routing alternatives.
   */
  alternative_executors?: string[];
  /**
   * Human-readable rationale for selecting this executor over alternatives,
   * e.g. "highest capability_score for task_type=research".
   */
  routing_rationale?: string;
  /** Monotonic wall-clock time (ms) when the routing decision was made. */
  routed_at_ms?: number;
}

/**
 * pipeline.cancelled
 *
 * Emitted when a pipeline is explicitly cancelled before it completes.
 * Cancellation may be triggered by:
 *   - A user issuing a pipeline.cancel command via the GUI or CLI
 *   - The orchestrator's watchdog (e.g. pipeline exceeded max runtime)
 *   - A dependent resource becoming unavailable (e.g. target agent terminated)
 *   - A parent pipeline being cancelled (cascading cancellation)
 *
 * A pipeline.cancelled event does NOT indicate an error — it indicates a
 * deliberate early termination.  Use pipeline.failed for unrecoverable errors.
 */
export interface PipelineCancelledPayload {
  /** Correlates with pipeline.started.pipeline_id. */
  pipeline_id: string;
  /** Echoed for indexing without a join. */
  pipeline_name: string;
  /**
   * Machine-readable reason code for the cancellation.
   * Standard codes:
   *   USER_REQUESTED       — explicitly cancelled by a human operator
   *   WATCHDOG_TIMEOUT     — pipeline exceeded maximum allowed runtime
   *   DEPENDENCY_LOST      — a required dependency (agent/resource) became unavailable
   *   PARENT_CANCELLED     — cancelled because a parent pipeline was cancelled
   *   POLICY_OVERRIDE      — cancelled by an orchestrator policy (e.g. priority preemption)
   */
  cancellation_code: string;
  /** Human-readable description of why the pipeline was cancelled. */
  cancellation_reason: string;
  /**
   * Number of steps that had already completed successfully at the time of
   * cancellation.  Enables partial-progress accounting.
   */
  steps_completed: number;
  /**
   * Number of steps that were in-progress at the time of cancellation.
   * In-progress steps are abandoned, not failed.
   */
  steps_in_progress?: number;
  /**
   * command_id that triggered the cancellation, if the cancellation was
   * initiated via a pipeline.cancel command.
   */
  cancelled_by_command?: string;
  /**
   * agent_id or system component that initiated the cancellation,
   * if not triggered by a command (e.g. watchdog, policy engine).
   */
  cancelled_by_actor?: string;
  /** Wall-clock time elapsed from pipeline.started to cancellation, in ms. */
  duration_ms?: number;
}

// ---------------------------------------------------------------------------
// Sub-AC 4 — command.state_changed generic state transition payload
// ---------------------------------------------------------------------------

/**
 * command.state_changed  (Sub-AC 4)
 *
 * Generic catch-all event for any command state transition not adequately
 * described by the specific lifecycle events above (issued, acknowledged,
 * completed, failed, rejected, dispatched, queued, retried, timeout,
 * cancelled, escalated).
 *
 * Primary use-case: **fixture indicator synchronization**.  When a command's
 * lifecycle state changes in a way that should update the visual indicators
 * (status lights, display panels) of associated 3D fixtures in the scene,
 * the orchestrator emits `command.state_changed` with the `fixture_ids` array
 * populated.  The `FixtureStateSyncReducer` then subscribes to this event and
 * emits `fixture.state_sync` for each affected fixture — forming the
 * command.state_changed → fixture.state_sync causal chain.
 *
 * Backward-compatibility note
 * ---------------------------
 * This event MUST NOT replace the specific lifecycle events above.  It is
 * an *addendum* for transitions that don't map to a named lifecycle step, or
 * when the caller needs to explicitly propagate state to the 3D scene layer.
 *
 * Both `prev_state` and `next_state` MUST be included so that the event is
 * self-contained and reversible for replay purposes.
 */
export interface CommandStateChangedPayload {
  /** Stable identifier for the command whose state changed. */
  command_id: string;
  /**
   * The GUI command type, echoed for indexing without a join.
   * Optional because some state transitions originate from internal system
   * logic that may not have a direct GUI command type mapping.
   */
  command_type?: string;
  /**
   * Command state before this transition.
   * Free-form string; consumers should be tolerant of unknown values.
   * Standard values: "pending" | "processing" | "completed" | "failed" |
   * "rejected" | "cancelled" | "escalated" | "retrying" | "queued"
   */
  prev_state: string;
  /**
   * Command state after this transition.
   * Free-form string; consumers should be tolerant of unknown values.
   */
  next_state: string;
  /**
   * Ordered list of fixture IDs whose visual indicators should be updated to
   * reflect the new command state.  The `FixtureStateSyncReducer` consumes
   * this field to emit `fixture.state_sync` events for each fixture.
   *
   * When empty or absent, no fixture indicators are updated.  This allows
   * `command.state_changed` to be used for state transitions that don't have
   * a direct 3D scene representation.
   */
  fixture_ids?: string[];
  /**
   * Human-readable description of what caused this state change.
   * Examples: "executor_timeout", "operator_cancel", "policy_gate",
   * "heartbeat_lost".
   */
  change_reason?: string;
  /**
   * ID of the actor that triggered this state change.
   * May be an agent_id, user session ID, or "system" for automated triggers.
   */
  changed_by?: string;
  /** Monotonic wall-clock time (ms) at the moment of the state change. */
  ts_ms?: number;
}

// ---------------------------------------------------------------------------
// Discriminated payload maps — map EventType → typed payload interface
// ---------------------------------------------------------------------------

/**
 * Maps each canonical command EventType to its strongly-typed payload.
 *
 * @example
 * ```ts
 * function handleCommand<T extends CommandEventType>(
 *   type: T, payload: CommandEventPayloadMap[T]
 * ) { ... }
 * ```
 */
export interface CommandEventPayloadMap {
  // Core command lifecycle
  "command.issued":        CommandIssuedPayload;
  "command.acknowledged":  CommandAcknowledgedPayload;
  "command.completed":     CommandCompletedPayload;
  "command.failed":        CommandFailedPayload;
  "command.rejected":      CommandRejectedPayload;
  // Control-plane dispatching events (Sub-AC 16b)
  "command.dispatched":    CommandDispatchedPayload;
  "command.queued":        CommandQueuedPayload;
  "command.retried":       CommandRetriedPayload;
  "command.timeout":       CommandTimeoutPayload;
  "command.cancelled":     CommandCancelledPayload;
  "command.escalated":     CommandEscalatedPayload;
  // Generic state transition catch-all (Sub-AC 4)
  "command.state_changed": CommandStateChangedPayload;
}

/**
 * Maps each canonical pipeline EventType to its strongly-typed payload.
 *
 * @example
 * ```ts
 * function handlePipeline<T extends PipelineEventType>(
 *   type: T, payload: PipelineEventPayloadMap[T]
 * ) { ... }
 * ```
 */
export interface PipelineEventPayloadMap {
  "pipeline.started":         PipelineStartedPayload;
  "pipeline.step":            PipelineStepPayload;
  // Stage lifecycle events (Sub-AC 16c)
  "pipeline.stage_started":   PipelineStageStartedPayload;
  "pipeline.stage_completed": PipelineStageCompletedPayload;
  "pipeline.stage_failed":    PipelineStageFailedPayload;
  // Task routing events (Sub-AC 16c)
  "pipeline.task_routed":     PipelineTaskRoutedPayload;
  "pipeline.completed":       PipelineCompletedPayload;
  "pipeline.failed":          PipelineFailedPayload;
  "pipeline.cancelled":       PipelineCancelledPayload;
}

// ---------------------------------------------------------------------------
// Type guards — narrow `unknown` payloads to typed interfaces
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// — Command type guards —

/**
 * Type guard for command.issued payloads.
 *
 * Requires: command_id, command_type, source, input.
 */
export function isCommandIssuedPayload(p: unknown): p is CommandIssuedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string" &&
    typeof p["source"] === "string" &&
    isObject(p["input"])
  );
}

/**
 * Type guard for command.acknowledged payloads.
 *
 * Requires: command_id, command_type, executor_id.
 */
export function isCommandAcknowledgedPayload(
  p: unknown,
): p is CommandAcknowledgedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string" &&
    typeof p["executor_id"] === "string"
  );
}

/**
 * Type guard for command.completed payloads.
 *
 * Requires: command_id, command_type.
 */
export function isCommandCompletedPayload(p: unknown): p is CommandCompletedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string"
  );
}

/**
 * Type guard for command.failed payloads.
 *
 * Requires: command_id, command_type, error_code, error_message.
 */
export function isCommandFailedPayload(p: unknown): p is CommandFailedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string" &&
    typeof p["error_code"] === "string" &&
    typeof p["error_message"] === "string"
  );
}

/**
 * Type guard for command.rejected payloads.
 *
 * Requires: rejection_code, rejection_reason (command_id and command_type are
 * optional because the input may have been completely malformed).
 */
export function isCommandRejectedPayload(p: unknown): p is CommandRejectedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["rejection_code"] === "string" &&
    typeof p["rejection_reason"] === "string"
  );
}

// — Control-plane dispatching type guards (Sub-AC 16b) —

/**
 * Type guard for command.dispatched payloads.
 *
 * Requires: command_id, command_type, executor_id, executor_kind.
 */
const VALID_EXECUTOR_KINDS: ReadonlySet<string> = new Set([
  "agent", "orchestrator", "pipeline", "system",
]);

export function isCommandDispatchedPayload(
  p: unknown,
): p is CommandDispatchedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string" &&
    typeof p["executor_id"] === "string" &&
    typeof p["executor_kind"] === "string" &&
    VALID_EXECUTOR_KINDS.has(p["executor_kind"] as string)
  );
}

/**
 * Type guard for command.queued payloads.
 *
 * Requires: command_id, command_type, queue_id.
 */
export function isCommandQueuedPayload(p: unknown): p is CommandQueuedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string" &&
    typeof p["queue_id"] === "string"
  );
}

/**
 * Type guard for command.retried payloads.
 *
 * Requires: command_id, command_type, attempt_number, retry_reason.
 */
export function isCommandRetriedPayload(p: unknown): p is CommandRetriedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string" &&
    typeof p["attempt_number"] === "number" &&
    typeof p["retry_reason"] === "string"
  );
}

/**
 * Type guard for command.timeout payloads.
 *
 * Requires: command_id, command_type, timeout_ms, elapsed_ms.
 */
export function isCommandTimeoutPayload(p: unknown): p is CommandTimeoutPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string" &&
    typeof p["timeout_ms"] === "number" &&
    typeof p["elapsed_ms"] === "number"
  );
}

/**
 * Type guard for command.cancelled payloads.
 *
 * Requires: command_id, command_type, cancelled_by.
 */
export function isCommandCancelledPayload(
  p: unknown,
): p is CommandCancelledPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string" &&
    typeof p["cancelled_by"] === "string"
  );
}

/**
 * Type guard for command.escalated payloads.
 *
 * Requires: command_id, command_type, escalated_to, escalation_reason.
 */
export function isCommandEscalatedPayload(
  p: unknown,
): p is CommandEscalatedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["command_id"] === "string" &&
    typeof p["command_type"] === "string" &&
    typeof p["escalated_to"] === "string" &&
    typeof p["escalation_reason"] === "string"
  );
}

/**
 * Type guard for command.state_changed payloads.
 *
 * Requires: command_id (string), prev_state (string), next_state (string).
 * Optional fields (command_type, fixture_ids, change_reason, changed_by,
 * ts_ms) are validated only when present.
 */
export function isCommandStateChangedPayload(
  p: unknown,
): p is CommandStateChangedPayload {
  if (!isObject(p)) return false;
  if (typeof p["command_id"] !== "string") return false;
  if (typeof p["prev_state"] !== "string") return false;
  if (typeof p["next_state"] !== "string") return false;
  // Optional field validation: fixture_ids must be string[] when present
  if (
    p["fixture_ids"] !== undefined &&
    (!Array.isArray(p["fixture_ids"]) ||
      !(p["fixture_ids"] as unknown[]).every(id => typeof id === "string"))
  ) {
    return false;
  }
  return true;
}

// — Pipeline type guards —

/**
 * Type guard for pipeline.started payloads.
 *
 * Requires: pipeline_id, pipeline_name, steps (non-empty string array).
 */

export function isPipelineStartedPayload(p: unknown): p is PipelineStartedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["pipeline_id"] === "string" &&
    typeof p["pipeline_name"] === "string" &&
    Array.isArray(p["steps"]) &&
    (p["steps"] as unknown[]).every(s => typeof s === "string")
  );
}

/**
 * Type guard for pipeline.step payloads.
 *
 * Requires: pipeline_id, step_index (number), step_name, step_status.
 */
export function isPipelineStepPayload(p: unknown): p is PipelineStepPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["pipeline_id"] === "string" &&
    typeof p["step_index"] === "number" &&
    typeof p["step_name"] === "string" &&
    typeof p["step_status"] === "string"
  );
}

/**
 * Type guard for pipeline.completed payloads.
 *
 * Requires: pipeline_id, pipeline_name, steps_total, steps_completed.
 */
export function isPipelineCompletedPayload(p: unknown): p is PipelineCompletedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["pipeline_id"] === "string" &&
    typeof p["pipeline_name"] === "string" &&
    typeof p["steps_total"] === "number" &&
    typeof p["steps_completed"] === "number"
  );
}

/**
 * Type guard for pipeline.failed payloads.
 *
 * Requires: pipeline_id, pipeline_name, failed_step_index, failed_step_name,
 *           error_code, error_message, steps_completed.
 */
export function isPipelineFailedPayload(p: unknown): p is PipelineFailedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["pipeline_id"] === "string" &&
    typeof p["pipeline_name"] === "string" &&
    typeof p["failed_step_index"] === "number" &&
    typeof p["failed_step_name"] === "string" &&
    typeof p["error_code"] === "string" &&
    typeof p["error_message"] === "string" &&
    typeof p["steps_completed"] === "number"
  );
}

/**
 * Type guard for pipeline.stage_completed payloads.
 *
 * Requires: pipeline_id, pipeline_name, stage_index, stage_name, step_names,
 *           steps_total, steps_completed.
 */
export function isPipelineStageCompletedPayload(
  p: unknown,
): p is PipelineStageCompletedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["pipeline_id"] === "string" &&
    typeof p["pipeline_name"] === "string" &&
    typeof p["stage_index"] === "number" &&
    typeof p["stage_name"] === "string" &&
    Array.isArray(p["step_names"]) &&
    (p["step_names"] as unknown[]).every(s => typeof s === "string") &&
    typeof p["steps_total"] === "number" &&
    typeof p["steps_completed"] === "number"
  );
}

/**
 * Type guard for pipeline.cancelled payloads.
 *
 * Requires: pipeline_id, pipeline_name, cancellation_code, cancellation_reason,
 *           steps_completed.
 */
export function isPipelineCancelledPayload(
  p: unknown,
): p is PipelineCancelledPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["pipeline_id"] === "string" &&
    typeof p["pipeline_name"] === "string" &&
    typeof p["cancellation_code"] === "string" &&
    typeof p["cancellation_reason"] === "string" &&
    typeof p["steps_completed"] === "number"
  );
}

// — Sub-AC 16c pipeline type guards —

/**
 * Type guard for pipeline.stage_started payloads.
 *
 * Requires: pipeline_id, pipeline_name, stage_index, stage_name, step_names,
 *           steps_total.
 */
export function isPipelineStageStartedPayload(
  p: unknown,
): p is PipelineStageStartedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["pipeline_id"] === "string" &&
    typeof p["pipeline_name"] === "string" &&
    typeof p["stage_index"] === "number" &&
    typeof p["stage_name"] === "string" &&
    Array.isArray(p["step_names"]) &&
    (p["step_names"] as unknown[]).every(s => typeof s === "string") &&
    typeof p["steps_total"] === "number"
  );
}

/**
 * Type guard for pipeline.stage_failed payloads.
 *
 * Requires: pipeline_id, pipeline_name, stage_index, stage_name, step_names,
 *           failed_step_index, failed_step_name, error_code, error_message,
 *           steps_completed.
 */
export function isPipelineStageFailedPayload(
  p: unknown,
): p is PipelineStageFailedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["pipeline_id"] === "string" &&
    typeof p["pipeline_name"] === "string" &&
    typeof p["stage_index"] === "number" &&
    typeof p["stage_name"] === "string" &&
    Array.isArray(p["step_names"]) &&
    (p["step_names"] as unknown[]).every(s => typeof s === "string") &&
    typeof p["failed_step_index"] === "number" &&
    typeof p["failed_step_name"] === "string" &&
    typeof p["error_code"] === "string" &&
    typeof p["error_message"] === "string" &&
    typeof p["steps_completed"] === "number"
  );
}

/**
 * Type guard for pipeline.task_routed payloads.
 *
 * Requires: pipeline_id, pipeline_name, task_id, executor_id, executor_kind.
 */
const VALID_PIPELINE_EXECUTOR_KINDS: ReadonlySet<string> = new Set([
  "agent", "orchestrator", "pipeline", "system",
]);

export function isPipelineTaskRoutedPayload(
  p: unknown,
): p is PipelineTaskRoutedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["pipeline_id"] === "string" &&
    typeof p["pipeline_name"] === "string" &&
    typeof p["task_id"] === "string" &&
    typeof p["executor_id"] === "string" &&
    typeof p["executor_kind"] === "string" &&
    VALID_PIPELINE_EXECUTOR_KINDS.has(p["executor_kind"] as string)
  );
}

// ---------------------------------------------------------------------------
// Payload discriminator maps — event type → type guard function
// ---------------------------------------------------------------------------

/** All command payload type-guard functions keyed by event type. */
export const COMMAND_PAYLOAD_GUARDS: {
  [K in CommandEventType]: (p: unknown) => p is CommandEventPayloadMap[K];
} = {
  // Core command lifecycle
  "command.issued":         isCommandIssuedPayload,
  "command.acknowledged":   isCommandAcknowledgedPayload,
  "command.completed":      isCommandCompletedPayload,
  "command.failed":         isCommandFailedPayload,
  "command.rejected":       isCommandRejectedPayload,
  // Control-plane dispatching events (Sub-AC 16b)
  "command.dispatched":     isCommandDispatchedPayload,
  "command.queued":         isCommandQueuedPayload,
  "command.retried":        isCommandRetriedPayload,
  "command.timeout":        isCommandTimeoutPayload,
  "command.cancelled":      isCommandCancelledPayload,
  "command.escalated":      isCommandEscalatedPayload,
  // Generic state transition catch-all (Sub-AC 4)
  "command.state_changed":  isCommandStateChangedPayload,
};

/** All pipeline payload type-guard functions keyed by event type. */
export const PIPELINE_PAYLOAD_GUARDS: {
  [K in PipelineEventType]: (p: unknown) => p is PipelineEventPayloadMap[K];
} = {
  "pipeline.started":         isPipelineStartedPayload,
  "pipeline.step":            isPipelineStepPayload,
  // Stage lifecycle events (Sub-AC 16c)
  "pipeline.stage_started":   isPipelineStageStartedPayload,
  "pipeline.stage_completed": isPipelineStageCompletedPayload,
  "pipeline.stage_failed":    isPipelineStageFailedPayload,
  // Task routing events (Sub-AC 16c)
  "pipeline.task_routed":     isPipelineTaskRoutedPayload,
  "pipeline.completed":       isPipelineCompletedPayload,
  "pipeline.failed":          isPipelineFailedPayload,
  "pipeline.cancelled":       isPipelineCancelledPayload,
};

// ---------------------------------------------------------------------------
// Generic validators — validate a payload against its registered event type
// ---------------------------------------------------------------------------

/**
 * Validates a payload against the expected shape for a given command event type.
 *
 * @example
 * ```ts
 * if (isValidCommandPayload("command.issued", event.payload)) {
 *   // payload is CommandIssuedPayload
 *   console.log(event.payload.command_id);
 * }
 * ```
 */
export function isValidCommandPayload<T extends CommandEventType>(
  type: T,
  payload: unknown,
): payload is CommandEventPayloadMap[T] {
  return COMMAND_PAYLOAD_GUARDS[type](payload);
}

/**
 * Validates a payload against the expected shape for a given pipeline event type.
 *
 * @example
 * ```ts
 * if (isValidPipelinePayload("pipeline.step", event.payload)) {
 *   // payload is PipelineStepPayload
 *   console.log(event.payload.step_name, event.payload.step_status);
 * }
 * ```
 */
export function isValidPipelinePayload<T extends PipelineEventType>(
  type: T,
  payload: unknown,
): payload is PipelineEventPayloadMap[T] {
  return PIPELINE_PAYLOAD_GUARDS[type](payload);
}
