/**
 * @module agent-lifecycle
 * RFC-1.0.1 §4 extension — Extended agent.* event payloads, type guards, and
 * utilities for full agent lifecycle management in the 3D command-center.
 *
 * This module expands the agent.* namespace beyond the spatial/assignment events
 * already defined in event.ts, adding rich lifecycle tracking so that every
 * phase of an agent's existence is event-sourced, replayable, and observable
 * in the 3D command-center GUI.
 *
 * Event hierarchy (complete agent.* namespace):
 *
 *   Core lifecycle (this module — new or extended):
 *     agent.spawned          — agent process was started / persona loaded
 *     agent.heartbeat        — periodic liveness signal with status metrics
 *     agent.error            — agent encountered a recoverable or fatal error
 *     agent.terminated       — agent process ended (graceful or otherwise)
 *     agent.migrated         — agent state was transferred to another run/host
 *     agent.lifecycle.changed — explicit lifecycle-state-machine transition
 *     agent.health_changed   — agent health score / dimension changed (RFC-1.0.1 §4 Sub-AC 2)
 *
 *   Spatial & assignment (payloads defined in event.ts, re-exported here):
 *     agent.moved            — agent relocated to a different room/position
 *     agent.assigned         — agent assigned to a room or team
 *     agent.status_changed   — agent operational status transition
 *     agent.task.started     — agent began working on a task
 *     agent.task.completed   — agent finished a task
 *
 * Record transparency is the supreme design principle: every state change MUST
 * produce a corresponding event so the 3D replay engine can reconstruct the
 * full history of the agent population.
 */
import type { EventType } from "./event.js";
import type {
  AgentMovedPayload,
  AgentAssignedPayload,
  AgentStatusChangedPayload,
  AgentTaskStartedPayload,
  AgentTaskCompletedPayload,
} from "./event.js";

// ---------------------------------------------------------------------------
// Agent EventType subset — all canonical agent.* event strings
// ---------------------------------------------------------------------------

/**
 * Tuple of every canonical `agent.*` event type string.
 *
 * Includes both the core-lifecycle events defined in this module and the
 * spatial/assignment events whose payload interfaces live in event.ts.
 * Using `as const satisfies` ensures TypeScript validates membership against
 * the master EVENT_TYPES array at compile time.
 */
export const AGENT_EVENT_TYPES = [
  // Core lifecycle
  "agent.spawned",
  "agent.heartbeat",
  "agent.error",
  "agent.terminated",
  // Extended lifecycle (Sub-AC 2)
  "agent.migrated",
  "agent.lifecycle.changed",
  // Idle state (Sub-AC 2) — agent is ready but has no active task
  "agent.idle",
  // Health monitoring (Sub-AC 2)
  "agent.health_changed",
  // Spatial & assignment (payloads in event.ts)
  "agent.moved",
  "agent.assigned",
  "agent.status_changed",
  "agent.task.started",
  "agent.task.completed",
  // Explicit lifecycle operation events (Sub-AC 16b)
  // First-class events for each named lifecycle operation — more queryable than
  // the generic agent.lifecycle.changed for spawn-request, pause, resume, etc.
  "agent.spawn_requested",
  "agent.paused",
  "agent.resumed",
  "agent.suspended",
  "agent.retire_requested",
  "agent.retired",
  "agent.migration_requested",
  // Extended state/lifecycle events (Sub-AC 2 additions)
  // Dynamic reconfiguration events that do not require a spawn/terminate cycle.
  "agent.capability_changed", // capability tags were dynamically updated
  "agent.persona_updated",    // persona config was hot-reloaded
] as const satisfies readonly EventType[];

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

/** O(1) membership test for agent event types. */
export const AGENT_EVENT_TYPE_SET: ReadonlySet<string> = new Set(AGENT_EVENT_TYPES);

/** Type guard — narrows a string to an AgentEventType. */
export function isAgentEventType(s: string): s is AgentEventType {
  return AGENT_EVENT_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Shared domain types
// ---------------------------------------------------------------------------

/**
 * Fine-grained operational status of a running agent.
 * Carried in heartbeat and status_changed payloads.
 */
export type AgentStatus =
  | "idle"          // agent is ready but has no active task
  | "active"        // agent is executing a task
  | "blocked"       // agent is waiting on a dependency or approval
  | "paused"        // agent execution is suspended (user or system hold)
  | "error"         // agent encountered an error (may recover)
  | "terminating"   // agent is in the process of shutting down
  | "terminated";   // agent process has ended

/**
 * Coarse-grained lifecycle state tracked by the agent state machine.
 * Drives the `agent.lifecycle.changed` event and the 3D command-center
 * visualisation of each agent node.
 *
 * Lifecycle state is distinct from operational status:
 *  - Lifecycle state describes *process* phase (initialising → ready → …)
 *  - Status describes *work* phase (idle → active → blocked → …)
 */
export type AgentLifecycleState =
  | "initializing"   // agent process starting; persona/config loading
  | "ready"          // agent is fully loaded and awaiting its first task
  | "active"         // agent is executing one or more tasks
  | "paused"         // agent is explicitly paused (user/system command)
  | "suspended"      // agent is resource-constrained and waiting to resume
  | "migrating"      // agent state is being serialised for migration
  | "terminating"    // agent is draining work and preparing to shut down
  | "terminated"     // agent process ended cleanly
  | "crashed";       // agent process exited unexpectedly

/**
 * Identifies what caused an `agent.lifecycle.changed` transition.
 * Enables root-cause analysis in the event log and replay engine.
 */
export type AgentLifecycleTrigger =
  | "spawn"               // initial lifecycle entry (agent.spawned)
  | "task_assigned"       // task assignment caused the transition
  | "task_completed"      // task completion caused the transition
  | "user_command"        // human operator issued a command
  | "system_command"      // orchestrator / scheduler triggered the change
  | "error"               // an error triggered the state change
  | "heartbeat_timeout"   // missed heartbeat deadline
  | "migration_start"     // migration serialisation began
  | "migration_complete"  // migration target confirmed receipt
  | "shutdown";           // graceful shutdown signal received

/**
 * Identifies why an `agent.terminated` event was emitted.
 * Terminal reasons are permanent; recovery requires a new agent.spawned.
 */
export type AgentTerminationReason =
  | "task_completed"    // agent finished all assigned work and exited cleanly
  | "user_requested"    // user explicitly terminated the agent
  | "system_shutdown"   // coordinated system-wide shutdown
  | "error"             // agent self-terminated after an unrecoverable error
  | "timeout"           // agent exceeded its maximum allowed run time
  | "evicted"           // resource pressure forced eviction
  | "migration"         // agent was migrated; this instance is no longer active
  | "crash";            // process exited with a non-zero exit code unexpectedly

/**
 * Coarse-grained health classification emitted in `agent.health_changed` events.
 *
 * The 3D command-center maps these to colour overlays on agent nodes:
 *   healthy   → green  (nominal operation)
 *   degraded  → amber  (performance issues, elevated error rate)
 *   unhealthy → red    (critical failure, intervention likely needed)
 *   unknown   → grey   (no recent signal — possible heartbeat gap)
 */
export type AgentHealthStatus =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "unknown";

// ---------------------------------------------------------------------------
// Payload interfaces — one per canonical agent.* event type
// ---------------------------------------------------------------------------

/**
 * agent.spawned
 *
 * Fired once when an agent process is started and its persona is loaded.
 * This is the entry point for every agent's lifecycle in the event log.
 *
 * `run_id` links this spawn to an orchestration run context.
 * `parent_agent_id`, if present, records which agent (or "system") created
 * this one, enabling causal ancestry tracking in the 3D replay engine.
 * `config_snapshot` captures the full resolved persona config at spawn time
 * so the replay engine can reconstruct agent state without side-loading files.
 */
export interface AgentSpawnedPayload {
  /** Unique identifier of the newly-spawned agent. */
  agent_id: string;
  /** Name of the persona loaded from .agent/agents/ (e.g. "implementer"). */
  persona: string;
  /** Initial room assignment in the 3D command-center, if known at spawn. */
  room_id?: string;
  /** Orchestration run context that owns this agent. */
  run_id: string;
  /** ID of the agent or "system" that triggered this spawn. */
  parent_agent_id?: string;
  /** Initial capability tags for this agent instance. */
  capabilities?: string[];
  /** Full resolved persona configuration at spawn time (for replay). */
  config_snapshot?: Record<string, unknown>;
}

/**
 * agent.heartbeat
 *
 * Periodic liveness signal emitted by a running agent.  Consumers use these
 * events to detect hung agents (heartbeat_timeout lifecycle trigger) and to
 * populate real-time metric overlays in the 3D command-center.
 *
 * The interval between heartbeats is defined by the orchestrator config;
 * a missed heartbeat for two consecutive intervals SHOULD trigger a
 * `agent.lifecycle.changed` event with trigger = "heartbeat_timeout".
 */
export interface AgentHeartbeatPayload {
  /** Agent emitting the heartbeat. */
  agent_id: string;
  /** Current operational status at time of heartbeat. */
  status: AgentStatus;
  /** Task the agent is currently working on, if any. */
  active_task_id?: string;
  /** Optional lightweight metrics snapshot. */
  metrics?: {
    /** Milliseconds since agent was spawned. */
    uptime_ms?: number;
    /** Total tasks completed by this agent instance. */
    tasks_completed?: number;
    /** Approximate resident memory in bytes. */
    memory_used_bytes?: number;
    /** Number of pending messages in the agent's inbox. */
    inbox_depth?: number;
  };
}

/**
 * agent.error
 *
 * Fired when an agent encounters an error condition.  `recoverable` signals
 * whether the agent can continue executing after the error is logged.
 *
 * Fatal (non-recoverable) errors MUST be followed by an `agent.terminated`
 * event.  Recoverable errors MAY be followed by a `agent.lifecycle.changed`
 * event if the error caused a lifecycle state transition.
 *
 * Stack traces MUST be redacted via redactString() before inclusion to
 * prevent secret leakage through the event log (RFC-1.0.1 §13).
 */
export interface AgentErrorPayload {
  /** Agent that encountered the error. */
  agent_id: string;
  /** Human-readable error description (must be pre-redacted). */
  message: string;
  /** Structured error code for programmatic handling, e.g. "TOOL_TIMEOUT". */
  error_code?: string;
  /** Severity classification. */
  severity: "warning" | "error" | "fatal";
  /** Task context in which the error occurred, if applicable. */
  task_id?: string;
  /**
   * Redacted stack trace.  MUST be processed through redactPayload() before
   * being stored in the event log.
   */
  stack_trace?: string;
  /** Whether the agent can continue after this error (false = fatal). */
  recoverable: boolean;
}

/**
 * agent.terminated
 *
 * Fired exactly once when an agent process ends, regardless of the cause.
 * This is the terminal event for every agent lifecycle in the event log.
 *
 * After this event, no further events from this agent_id are valid
 * (excluding system-emitted diagnostic events for forensic purposes).
 */
export interface AgentTerminatedPayload {
  /** Agent that terminated. */
  agent_id: string;
  /** Why the agent's process ended. */
  reason: AgentTerminationReason;
  /** OS-level exit code, if available (0 = clean, non-zero = error). */
  exit_code?: number;
  /** Last task the agent was working on at termination, if any. */
  final_task_id?: string;
  /** Human-readable summary of what the agent accomplished. */
  summary?: string;
  /** Milliseconds the agent was alive (from agent.spawned.ts to now). */
  uptime_ms?: number;
}

/**
 * agent.migrated
 *
 * Fired when an agent's in-flight state is serialised and transferred to a
 * new run context, host, or process.  This supports failover, load-balancing,
 * and hot-reload scenarios without losing task continuity.
 *
 * Migration is a two-event sequence:
 *   1. Source emits `agent.migrated` (this event).
 *   2. Target emits `agent.spawned` with `parent_agent_id` = migrated agent_id.
 *
 * The `state_snapshot` MUST include enough data for the target agent to
 * resume execution without re-reading files (replay-safe principle).
 * Secrets within the snapshot MUST be redacted before storage (§13).
 */
export interface AgentMigratedPayload {
  /** Agent being migrated. */
  agent_id: string;
  /** Run context the agent is migrating away from. */
  from_run_id: string;
  /** Run context the agent is migrating into. */
  to_run_id: string;
  /** Room the agent occupied before migration. */
  from_room?: string;
  /** Room the agent is being placed into after migration. */
  to_room?: string;
  /**
   * Machine-readable reason for the migration.
   *   "failover"        — source node became unhealthy
   *   "load_balance"    — scheduler rebalancing
   *   "user_requested"  — operator initiated migration
   *   "version_upgrade" — rolling upgrade of agent runtime
   */
  migration_reason?:
    | "failover"
    | "load_balance"
    | "user_requested"
    | "version_upgrade"
    | string;
  /** Task(s) being transferred as part of the migration. */
  migrated_task_ids?: string[];
  /**
   * Serialised agent working state at migration time.
   * Must be pre-redacted; used by the target agent to resume execution
   * and by the replay engine to reconstruct mid-run agent state.
   */
  state_snapshot?: Record<string, unknown>;
}

/**
 * agent.lifecycle.changed
 *
 * Fired on every explicit lifecycle state-machine transition.  This event is
 * the canonical source of truth for an agent's lifecycle phase in the
 * event-sourced model — the 3D command-center renders agent node colours and
 * animations by projecting this event stream.
 *
 * The (`prev_state` → `next_state`) pair MUST always represent a valid
 * transition in the agent lifecycle state machine (see VALID_AGENT_LIFECYCLE_TRANSITIONS).
 *
 * A `trigger` is required so that operators can trace why each transition
 * occurred without relying on external context.
 */
export interface AgentLifecycleChangedPayload {
  /** Agent whose lifecycle state changed. */
  agent_id: string;
  /** Lifecycle state before the transition. */
  prev_state: AgentLifecycleState;
  /** Lifecycle state after the transition. */
  next_state: AgentLifecycleState;
  /** What caused this lifecycle transition. */
  trigger: AgentLifecycleTrigger;
  /** Human-readable explanation for the transition. */
  reason?: string;
  /** Arbitrary additional context (e.g. error details, config diffs). */
  metadata?: Record<string, unknown>;
}

/**
 * agent.health_changed  (RFC-1.0.1 §4 Sub-AC 2)
 *
 * Emitted whenever the orchestrator determines that an agent's aggregate
 * health classification has changed — e.g. because its error rate crossed a
 * threshold, a heartbeat was missed, or resource utilisation normalised.
 *
 * This event is deliberately separate from `agent.heartbeat` (which is a
 * periodic liveness tick) and `agent.error` (which records a specific
 * fault).  `agent.health_changed` represents a *sustained state change* in
 * the agent's overall health profile so that the 3D command-center can
 * render a stable colour overlay without re-computing health on every tick.
 *
 * Health dimensions (`dimensions`) let consumers understand *why* the
 * overall health changed without having to correlate across other event
 * streams.  Dimension keys are free-form strings (e.g. "error_rate",
 * "heartbeat", "memory", "task_latency"); values are 0–1 scores where
 * 1.0 = fully healthy.
 *
 * Record transparency contract: this event MUST be emitted by the
 * orchestrator (or a dedicated health-watchdog system entity) whenever
 * `prev_health` !== `health`.  Suppression is not permitted.
 */
export interface AgentHealthChangedPayload {
  /** Agent whose health classification changed. */
  agent_id: string;
  /** Previous aggregate health classification. */
  prev_health: AgentHealthStatus;
  /** New aggregate health classification. */
  health: AgentHealthStatus;
  /**
   * Per-dimension health scores (0–1, higher = healthier).
   * Keys are free-form dimension names; values are 0–1 floats.
   * At least one dimension SHOULD be present to explain the transition.
   *
   * @example { "error_rate": 0.12, "heartbeat": 1.0, "memory": 0.85 }
   */
  dimensions?: Record<string, number>;
  /**
   * Human-readable explanation of why the health changed, e.g.
   * "Error rate rose above 10% threshold for last 60 s".
   */
  reason?: string;
  /**
   * Whether operator intervention is recommended given this health change.
   * Set to `true` when the new `health` is "unhealthy".
   */
  intervention_recommended?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-AC 2 — agent.idle payload
// ---------------------------------------------------------------------------

/**
 * agent.idle  (RFC-1.0.1 §4 Sub-AC 2)
 *
 * Emitted when an agent transitions into the `idle` operational status —
 * meaning the agent process is running and ready to accept work, but
 * currently has no active task assignment.
 *
 * This event is distinct from `agent.lifecycle.changed` (which tracks
 * coarse-grained lifecycle phase) and `agent.heartbeat` (which is a
 * periodic liveness tick regardless of status).  `agent.idle` is a
 * first-class signal so the 3D command-center can render agent nodes with
 * an explicit "waiting" visual state without parsing heartbeat payloads.
 *
 * Common transition paths that lead to idle:
 *   agent.task.completed  → agent becomes idle (no new task immediately available)
 *   agent.resumed         → agent enters idle (was paused/suspended, now ready)
 *   agent.spawned         → (after initialisation) agent enters idle for first time
 *
 * Record transparency contract: this event MUST be emitted by the
 * orchestrator whenever an agent's operational status transitions to "idle".
 * Suppression is not permitted — idle periods must be visible in the replay
 * engine to accurately reconstruct agent utilisation history.
 */
export interface AgentIdlePayload {
  /** Agent that became idle. */
  agent_id: string;
  /**
   * Operational status the agent was in before becoming idle.
   * Helps the 3D command-center animate the transition (e.g. active → idle).
   */
  prev_status?: AgentStatus;
  /**
   * Monotonic wall-clock time (ms) when the agent entered the idle state.
   * Used by the replay engine and utilisation analyser to calculate idle
   * durations accurately.
   */
  idle_since_ms?: number;
  /**
   * Machine-readable reason explaining why the agent became idle.
   * Standard codes:
   *   task_completed    — agent finished its previous task and has no next task
   *   awaiting_assignment — agent is ready but not yet assigned to a task
   *   queue_empty       — the agent's task queue was drained
   *   resumed_no_task   — agent resumed from paused/suspended but has no work
   */
  idle_reason?:
    | "task_completed"
    | "awaiting_assignment"
    | "queue_empty"
    | "resumed_no_task"
    | string;
  /**
   * Number of tasks this agent has completed in its current lifecycle.
   * Enables the 3D command-center to display a "tasks completed" badge
   * on idle agent nodes.
   */
  tasks_completed_count?: number;
}

// ---------------------------------------------------------------------------
// Sub-AC 16b — explicit lifecycle operation payloads
// ---------------------------------------------------------------------------

/**
 * agent.spawn_requested  (Sub-AC 16b)
 *
 * Emitted when an operator or system component requests that a new agent be
 * spawned — before the spawn is actually executed.  This bridges the command
 * layer (agent.spawn command file) to the event layer, giving the 3D
 * command-center a "pending spawn" signal so it can render an avatar in a
 * "loading" state while the process starts up.
 *
 * Lifecycle position:
 *   agent.spawn_requested → agent.spawned (or agent.error if spawn fails)
 *
 * `request_id` correlates this event with the resulting `agent.spawned` event
 * via the `causation_id` field of the `ConitensEvent` envelope.
 */
export interface AgentSpawnRequestedPayload {
  /** Desired identifier for the agent to be spawned. */
  agent_id: string;
  /** Persona to load from `.agent/agents/<persona>.yaml`. */
  persona: string;
  /** Target room assignment in the 3D command-center, if known. */
  room_id?: string;
  /** Run context the new agent will belong to. */
  run_id: string;
  /**
   * Stable correlation key linking this event to the resulting agent.spawned
   * event.  Consumers can use `event.causation_id === request_id` to
   * reconstruct the spawn chain.
   */
  request_id: string;
  /** ID of the actor (agent, user, or "system") that requested the spawn. */
  requested_by: string;
  /** Optional initial capability tags for the agent. */
  capabilities?: string[];
  /** Additional configuration parameters forwarded to the spawn handler. */
  params?: Record<string, unknown>;
}

/**
 * agent.paused  (Sub-AC 16b)
 *
 * Emitted the moment an agent transitions into the `paused` lifecycle state.
 * While `agent.lifecycle.changed` (trigger="user_command") also models this
 * transition, `agent.paused` is a dedicated, first-class event that the 3D
 * command-center and reducers can filter on directly without inspecting the
 * `next_state` field of a generic lifecycle-changed event.
 *
 * Behavioral contract: an `agent.paused` event MUST be immediately preceded or
 * accompanied by an `agent.lifecycle.changed` event with `next_state="paused"`.
 * The two events form a complementary pair — one for state-machine integrity,
 * one for direct observability.
 */
export interface AgentPausedPayload {
  /** Agent that was paused. */
  agent_id: string;
  /** What triggered the pause. */
  triggered_by: AgentLifecycleTrigger;
  /** Human-readable reason for the pause. */
  reason?: string;
  /** Task the agent was working on at the time of pausing, if any. */
  active_task_id?: string;
  /** Monotonic wall-clock time (ms) when the agent was paused. */
  paused_at_ms?: number;
}

/**
 * agent.resumed  (Sub-AC 16b)
 *
 * Emitted when a paused or suspended agent is brought back to an active or
 * ready state.  Complements `agent.lifecycle.changed` for direct observability.
 *
 * `resumed_to` clarifies what state the agent enters after resuming:
 *   - "active"  — the agent immediately picks up a task
 *   - "ready"   — the agent is ready but has no immediate task assignment
 */
export interface AgentResumedPayload {
  /** Agent that was resumed. */
  agent_id: string;
  /** What triggered the resume. */
  triggered_by: AgentLifecycleTrigger;
  /** Lifecycle state the agent was in before resuming (paused or suspended). */
  resumed_from: "paused" | "suspended";
  /** Lifecycle state the agent enters after resuming. */
  resumed_to: "active" | "ready";
  /** Human-readable reason for the resume. */
  reason?: string;
  /** Monotonic wall-clock time (ms) when the agent was resumed. */
  resumed_at_ms?: number;
}

/**
 * agent.suspended  (Sub-AC 16b)
 *
 * Emitted when an agent transitions into the `suspended` state — distinct from
 * `paused` in that suspension is typically system-triggered (resource pressure,
 * scheduler policy) rather than user-initiated.
 *
 * A suspended agent retains its context and can be resumed, but it will not
 * process new tasks until it transitions back to `ready` or `active`.
 */
export interface AgentSuspendedPayload {
  /** Agent that was suspended. */
  agent_id: string;
  /**
   * Machine-readable reason for the suspension.
   * Standard codes:
   *   resource_pressure — system memory/CPU limit triggered suspension
   *   policy            — scheduler or admission-control policy
   *   system_command    — an internal orchestrator command caused suspension
   */
  suspension_reason: "resource_pressure" | "policy" | "system_command" | string;
  /** Human-readable description of why the agent was suspended. */
  reason?: string;
  /** Task the agent was working on at suspension time, if any. */
  active_task_id?: string;
  /** Monotonic wall-clock time (ms) when the agent was suspended. */
  suspended_at_ms?: number;
}

/**
 * agent.retire_requested  (Sub-AC 16b)
 *
 * Emitted when an operator or system component requests that an agent be
 * gracefully retired — i.e., allowed to finish its current work and then
 * terminate in a planned, orderly fashion.
 *
 * Retirement differs from termination:
 *   - `agent.terminated` (reason="user_requested") models immediate forceful stop.
 *   - `agent.retire_requested` → `agent.retired` models a draining + planned exit.
 *
 * Lifecycle position:
 *   agent.retire_requested → [agent drains tasks] → agent.retired
 *                                                  → (then agent.terminated reason="user_requested")
 *
 * `drain_timeout_ms` gives the maximum time the system will wait for in-flight
 * tasks to complete before forcing termination.
 */
export interface AgentRetireRequestedPayload {
  /** Agent to be retired. */
  agent_id: string;
  /** Actor (user, agent, system) who requested retirement. */
  requested_by: string;
  /** Human-readable reason for the retirement. */
  retirement_reason?: string;
  /**
   * Maximum time (ms) to wait for in-flight tasks to complete.
   * After this window, the orchestrator will force-terminate the agent.
   * Defaults to orchestrator configuration if absent.
   */
  drain_timeout_ms?: number;
}

/**
 * agent.retired  (Sub-AC 16b)
 *
 * Emitted when an agent completes a graceful retirement sequence.  This event
 * signals a planned, orderly end-of-service — as opposed to `agent.terminated`
 * which covers both clean exits and crashes.
 *
 * An `agent.retired` event MUST be followed by an `agent.terminated` event
 * (reason="user_requested") as the final log entry for that agent instance.
 * The `agent.retired` event provides richer metadata about the retirement
 * context while `agent.terminated` maintains the invariant that every agent
 * lifecycle ends with a single terminal event.
 *
 * Lifetime accounting: `tasks_completed_count` and `uptime_ms` provide
 * at-a-glance statistics for the 3D command-center's historical view.
 */
export interface AgentRetiredPayload {
  /** Agent that retired. */
  agent_id: string;
  /** Human-readable reason for retirement. */
  retirement_reason?: string;
  /** Last task the agent was working on before retirement, if any. */
  final_task_id?: string;
  /** Total number of tasks this agent completed over its lifetime. */
  tasks_completed_count?: number;
  /** Milliseconds the agent was alive (from agent.spawned to now). */
  uptime_ms?: number;
  /** Human-readable summary of what the agent accomplished. */
  summary?: string;
}

/**
 * agent.migration_requested  (Sub-AC 16b)
 *
 * Emitted when an agent migration is initiated — before the source agent
 * begins serialising its state.  This is the request phase of the two-event
 * migration sequence:
 *
 *   1. agent.migration_requested  (this event — intent recorded)
 *   2. agent.migrated             (state transferred successfully)
 *   3. agent.spawned (target run) (new instance ready)
 *
 * By recording the request as a separate event, the 3D command-center can
 * display a "migration pending" state on the source agent node and an
 * "incoming" state on the target room before the migration completes.
 *
 * `migration_id` correlates the request with the resulting `agent.migrated`
 * and target `agent.spawned` events.
 */
export interface AgentMigrationRequestedPayload {
  /** Agent to be migrated. */
  agent_id: string;
  /** Stable identifier correlating this event with agent.migrated and the target agent.spawned. */
  migration_id: string;
  /** Run context the agent is migrating into. */
  target_run_id: string;
  /** Room the agent will be placed into after migration (if known at request time). */
  target_room?: string;
  /**
   * Machine-readable reason for the migration.
   *   "failover"        — source node became unhealthy
   *   "load_balance"    — scheduler rebalancing
   *   "user_requested"  — operator initiated migration
   *   "version_upgrade" — rolling upgrade of agent runtime
   */
  migration_reason?:
    | "failover"
    | "load_balance"
    | "user_requested"
    | "version_upgrade"
    | string;
  /** Actor (user, agent, system) who requested the migration. */
  requested_by: string;
  /** Task IDs that will be transferred as part of the migration. */
  migrated_task_ids?: string[];
}

// ---------------------------------------------------------------------------
// Sub-AC 2 — extended agent state/lifecycle payloads
// ---------------------------------------------------------------------------

/**
 * agent.capability_changed  (Sub-AC 2)
 *
 * Emitted when an agent's capability tags are dynamically updated while the
 * agent is running — e.g. when the orchestrator grants new skills, revokes
 * permissions, or hot-patches capability config without requiring a full
 * spawn/terminate cycle.
 *
 * `prev_capabilities` and `capabilities` MUST both be present so the 3D
 * command-center and replay engine can diff the before/after capability sets
 * without joining external state stores.
 *
 * Record transparency contract: this event MUST be emitted for every
 * capability mutation; suppression or batching is not permitted.
 */
export interface AgentCapabilityChangedPayload {
  /** Agent whose capabilities were updated. */
  agent_id: string;
  /** Capability tag set before the update. */
  prev_capabilities: string[];
  /** Capability tag set after the update (current state). */
  capabilities: string[];
  /**
   * Actor that initiated the capability change.
   * Use "system" for orchestrator-driven changes, or an agent_id / user_id.
   */
  changed_by: string;
  /** Human-readable reason for the capability change. */
  reason?: string;
}

/**
 * agent.persona_updated  (Sub-AC 2)
 *
 * Emitted when an agent's persona configuration is hot-reloaded while the
 * agent is running.  This covers scenarios such as:
 *   - YAML persona file edited and watched for changes
 *   - Orchestrator pushing a config update without restart
 *   - A/B testing of persona variants during a live session
 *
 * `config_snapshot` SHOULD carry the full resolved persona config at update
 * time (same as the field in `agent.spawned`) so the replay engine can
 * reconstruct the exact persona state at any point in the event log.
 */
export interface AgentPersonaUpdatedPayload {
  /** Agent whose persona was updated. */
  agent_id: string;
  /** Name of the persona that was loaded (e.g. "implementer", "researcher"). */
  persona: string;
  /** Full resolved persona configuration after the update (for replay). */
  config_snapshot?: Record<string, unknown>;
  /**
   * Actor that triggered the persona hot-reload.
   * Use "system" for file-watcher or orchestrator-driven reloads.
   */
  updated_by: string;
  /** Human-readable reason for the persona update. */
  update_reason?: string;
}

// ---------------------------------------------------------------------------
// Lifecycle state machine — valid transitions
// ---------------------------------------------------------------------------

/**
 * Valid lifecycle state transitions for agent processes.
 * Enforced at runtime by `canAgentLifecycleTransition()`.
 *
 * Terminal states (`terminated`, `crashed`) have no outgoing transitions.
 */
export const VALID_AGENT_LIFECYCLE_TRANSITIONS: Readonly<
  Record<AgentLifecycleState, readonly AgentLifecycleState[]>
> = {
  initializing: ["ready", "crashed"],
  ready:        ["active", "paused", "terminating", "crashed"],
  active:       ["paused", "suspended", "migrating", "terminating", "crashed"],
  paused:       ["active", "terminating", "crashed"],
  suspended:    ["active", "paused", "terminating", "crashed"],
  migrating:    ["terminated", "crashed"],
  terminating:  ["terminated", "crashed"],
  terminated:   [],   // terminal
  crashed:      [],   // terminal
};

/**
 * Returns `true` if transitioning from `from` to `to` is a valid lifecycle
 * state machine step.
 */
export function canAgentLifecycleTransition(
  from: AgentLifecycleState,
  to: AgentLifecycleState,
): boolean {
  return (VALID_AGENT_LIFECYCLE_TRANSITIONS[from] as readonly AgentLifecycleState[]).includes(to);
}

/** Returns `true` if `state` is a terminal lifecycle state (no outgoing transitions). */
export function isTerminalLifecycleState(state: AgentLifecycleState): boolean {
  return VALID_AGENT_LIFECYCLE_TRANSITIONS[state].length === 0;
}

// ---------------------------------------------------------------------------
// Comprehensive discriminated payload map — all agent.* event types
// ---------------------------------------------------------------------------

/**
 * Maps every canonical `agent.*` EventType to its strongly-typed payload
 * interface.  Covers both the core-lifecycle types defined here and the
 * spatial/assignment types whose interfaces live in event.ts.
 *
 * Usage:
 * ```ts
 * function handleAgent<T extends AgentEventType>(
 *   type: T, payload: AllAgentEventPayloadMap[T]
 * ) { ... }
 * ```
 */
export interface AllAgentEventPayloadMap {
  // Core lifecycle (this module)
  "agent.spawned":           AgentSpawnedPayload;
  "agent.heartbeat":         AgentHeartbeatPayload;
  "agent.error":             AgentErrorPayload;
  "agent.terminated":        AgentTerminatedPayload;
  // Extended lifecycle (Sub-AC 2)
  "agent.migrated":          AgentMigratedPayload;
  "agent.lifecycle.changed": AgentLifecycleChangedPayload;
  // Idle state (Sub-AC 2)
  "agent.idle":              AgentIdlePayload;
  // Health monitoring (Sub-AC 2)
  "agent.health_changed":    AgentHealthChangedPayload;
  // Spatial & assignment (payload interfaces imported from event.ts)
  "agent.moved":             AgentMovedPayload;
  "agent.assigned":          AgentAssignedPayload;
  "agent.status_changed":    AgentStatusChangedPayload;
  "agent.task.started":      AgentTaskStartedPayload;
  "agent.task.completed":    AgentTaskCompletedPayload;
  // Extended state/lifecycle events (Sub-AC 2 additions)
  "agent.capability_changed":   AgentCapabilityChangedPayload;
  "agent.persona_updated":      AgentPersonaUpdatedPayload;
  // Explicit lifecycle operation events (Sub-AC 16b)
  "agent.spawn_requested":      AgentSpawnRequestedPayload;
  "agent.paused":               AgentPausedPayload;
  "agent.resumed":              AgentResumedPayload;
  "agent.suspended":            AgentSuspendedPayload;
  "agent.retire_requested":     AgentRetireRequestedPayload;
  "agent.retired":              AgentRetiredPayload;
  "agent.migration_requested":  AgentMigrationRequestedPayload;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Assert a plain, non-null, non-array object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Assert a value is a string. */
function isStr(v: unknown): v is string {
  return typeof v === "string";
}

/** Assert a value is a boolean. */
function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

// ---------------------------------------------------------------------------
// Type guards — narrow `unknown` payloads to typed interfaces
// ---------------------------------------------------------------------------

/**
 * Type guard for agent.spawned payloads.
 *
 * Required: `agent_id` (string), `persona` (string), `run_id` (string).
 */
export function isAgentSpawnedPayload(p: unknown): p is AgentSpawnedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["persona"]) &&
    isStr(p["run_id"])
  );
}

/**
 * Type guard for agent.heartbeat payloads.
 *
 * Required: `agent_id` (string), `status` (AgentStatus string).
 */
const VALID_AGENT_STATUSES: ReadonlySet<string> = new Set<AgentStatus>([
  "idle", "active", "blocked", "paused", "error", "terminating", "terminated",
]);

export function isAgentHeartbeatPayload(p: unknown): p is AgentHeartbeatPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["status"]) &&
    VALID_AGENT_STATUSES.has(p["status"] as string)
  );
}

/**
 * Type guard for agent.error payloads.
 *
 * Required: `agent_id` (string), `message` (string), `severity` (known literal),
 * `recoverable` (boolean).
 */
const VALID_SEVERITY_LEVELS: ReadonlySet<string> = new Set(["warning", "error", "fatal"]);

export function isAgentErrorPayload(p: unknown): p is AgentErrorPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["message"]) &&
    isStr(p["severity"]) &&
    VALID_SEVERITY_LEVELS.has(p["severity"] as string) &&
    isBool(p["recoverable"])
  );
}

/**
 * Type guard for agent.terminated payloads.
 *
 * Required: `agent_id` (string), `reason` (AgentTerminationReason string).
 */
const VALID_TERMINATION_REASONS: ReadonlySet<string> = new Set<AgentTerminationReason>([
  "task_completed", "user_requested", "system_shutdown",
  "error", "timeout", "evicted", "migration", "crash",
]);

export function isAgentTerminatedPayload(p: unknown): p is AgentTerminatedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["reason"]) &&
    VALID_TERMINATION_REASONS.has(p["reason"] as string)
  );
}

/**
 * Type guard for agent.migrated payloads.
 *
 * Required: `agent_id` (string), `from_run_id` (string), `to_run_id` (string).
 */
export function isAgentMigratedPayload(p: unknown): p is AgentMigratedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["from_run_id"]) &&
    isStr(p["to_run_id"])
  );
}

/**
 * Type guard for agent.lifecycle.changed payloads.
 *
 * Required: `agent_id` (string), `prev_state` (AgentLifecycleState),
 * `next_state` (AgentLifecycleState), `trigger` (AgentLifecycleTrigger).
 */
const VALID_LIFECYCLE_STATES: ReadonlySet<string> = new Set<AgentLifecycleState>([
  "initializing", "ready", "active", "paused", "suspended",
  "migrating", "terminating", "terminated", "crashed",
]);

const VALID_LIFECYCLE_TRIGGERS: ReadonlySet<string> = new Set<AgentLifecycleTrigger>([
  "spawn", "task_assigned", "task_completed", "user_command", "system_command",
  "error", "heartbeat_timeout", "migration_start", "migration_complete", "shutdown",
]);

export function isAgentLifecycleChangedPayload(
  p: unknown,
): p is AgentLifecycleChangedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["prev_state"]) &&
    VALID_LIFECYCLE_STATES.has(p["prev_state"] as string) &&
    isStr(p["next_state"]) &&
    VALID_LIFECYCLE_STATES.has(p["next_state"] as string) &&
    isStr(p["trigger"]) &&
    VALID_LIFECYCLE_TRIGGERS.has(p["trigger"] as string)
  );
}

/**
 * Type guard for agent.health_changed payloads.
 *
 * Required: `agent_id` (string), `prev_health` (AgentHealthStatus),
 * `health` (AgentHealthStatus).
 */
const VALID_HEALTH_STATUSES: ReadonlySet<string> = new Set<AgentHealthStatus>([
  "healthy", "degraded", "unhealthy", "unknown",
]);

export function isAgentHealthChangedPayload(
  p: unknown,
): p is AgentHealthChangedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["prev_health"]) &&
    VALID_HEALTH_STATUSES.has(p["prev_health"] as string) &&
    isStr(p["health"]) &&
    VALID_HEALTH_STATUSES.has(p["health"] as string)
  );
}

/**
 * Type guard for agent.idle payloads.
 *
 * Required: `agent_id` (string).
 * All other fields are optional enrichment for the 3D command-center.
 */
export function isAgentIdlePayload(p: unknown): p is AgentIdlePayload {
  if (!isObject(p)) return false;
  return isStr(p["agent_id"]);
}

/**
 * Type guard for agent.moved payloads (spatial extension — imported shape).
 * Validates the minimum contract: agent_id and to_room.
 */
export function isAgentMovedPayload(p: unknown): p is AgentMovedPayload {
  if (!isObject(p)) return false;
  return isStr(p["agent_id"]) && isStr(p["to_room"]);
}

/**
 * Type guard for agent.assigned payloads.
 * Validates: agent_id and room_id.
 */
export function isAgentAssignedPayload(p: unknown): p is AgentAssignedPayload {
  if (!isObject(p)) return false;
  return isStr(p["agent_id"]) && isStr(p["room_id"]);
}

/**
 * Type guard for agent.status_changed payloads.
 * Validates: agent_id, prev_status, status.
 */
export function isAgentStatusChangedPayload(
  p: unknown,
): p is AgentStatusChangedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["prev_status"]) &&
    isStr(p["status"])
  );
}

/**
 * Type guard for agent.task.started payloads.
 * Validates: agent_id, task_id.
 */
export function isAgentTaskStartedPayload(p: unknown): p is AgentTaskStartedPayload {
  if (!isObject(p)) return false;
  return isStr(p["agent_id"]) && isStr(p["task_id"]);
}

/**
 * Type guard for agent.task.completed payloads.
 * Validates: agent_id, task_id, outcome.
 */
const VALID_TASK_OUTCOMES: ReadonlySet<string> = new Set(["success", "failure", "cancelled"]);

export function isAgentTaskCompletedPayload(
  p: unknown,
): p is AgentTaskCompletedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["task_id"]) &&
    isStr(p["outcome"]) &&
    VALID_TASK_OUTCOMES.has(p["outcome"] as string)
  );
}

// ---------------------------------------------------------------------------
// Sub-AC 16b — type guards for new explicit lifecycle operation payloads
// ---------------------------------------------------------------------------

/**
 * Type guard for agent.spawn_requested payloads.
 *
 * Required: `agent_id` (string), `persona` (string), `run_id` (string),
 * `request_id` (string), `requested_by` (string).
 */
export function isAgentSpawnRequestedPayload(
  p: unknown,
): p is AgentSpawnRequestedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["persona"]) &&
    isStr(p["run_id"]) &&
    isStr(p["request_id"]) &&
    isStr(p["requested_by"])
  );
}

/**
 * Type guard for agent.paused payloads.
 *
 * Required: `agent_id` (string), `triggered_by` (AgentLifecycleTrigger).
 */
export function isAgentPausedPayload(p: unknown): p is AgentPausedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["triggered_by"]) &&
    VALID_LIFECYCLE_TRIGGERS.has(p["triggered_by"] as string)
  );
}

/**
 * Type guard for agent.resumed payloads.
 *
 * Required: `agent_id` (string), `triggered_by` (AgentLifecycleTrigger),
 * `resumed_from` ("paused" | "suspended"), `resumed_to` ("active" | "ready").
 */
const VALID_RESUMED_FROM: ReadonlySet<string> = new Set(["paused", "suspended"]);
const VALID_RESUMED_TO:   ReadonlySet<string> = new Set(["active", "ready"]);

export function isAgentResumedPayload(p: unknown): p is AgentResumedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["triggered_by"]) &&
    VALID_LIFECYCLE_TRIGGERS.has(p["triggered_by"] as string) &&
    isStr(p["resumed_from"]) &&
    VALID_RESUMED_FROM.has(p["resumed_from"] as string) &&
    isStr(p["resumed_to"]) &&
    VALID_RESUMED_TO.has(p["resumed_to"] as string)
  );
}

/**
 * Type guard for agent.suspended payloads.
 *
 * Required: `agent_id` (string), `suspension_reason` (string).
 */
export function isAgentSuspendedPayload(p: unknown): p is AgentSuspendedPayload {
  if (!isObject(p)) return false;
  return isStr(p["agent_id"]) && isStr(p["suspension_reason"]);
}

/**
 * Type guard for agent.retire_requested payloads.
 *
 * Required: `agent_id` (string), `requested_by` (string).
 */
export function isAgentRetireRequestedPayload(
  p: unknown,
): p is AgentRetireRequestedPayload {
  if (!isObject(p)) return false;
  return isStr(p["agent_id"]) && isStr(p["requested_by"]);
}

/**
 * Type guard for agent.retired payloads.
 *
 * Required: `agent_id` (string).
 * All other fields are optional enrichment for the 3D command-center.
 */
export function isAgentRetiredPayload(p: unknown): p is AgentRetiredPayload {
  if (!isObject(p)) return false;
  return isStr(p["agent_id"]);
}

/**
 * Type guard for agent.migration_requested payloads.
 *
 * Required: `agent_id` (string), `migration_id` (string),
 * `target_run_id` (string), `requested_by` (string).
 */
export function isAgentMigrationRequestedPayload(
  p: unknown,
): p is AgentMigrationRequestedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["migration_id"]) &&
    isStr(p["target_run_id"]) &&
    isStr(p["requested_by"])
  );
}

/**
 * Type guard for agent.capability_changed payloads.
 *
 * Required: `agent_id` (string), `prev_capabilities` (string[]),
 *           `capabilities` (string[]), `changed_by` (string).
 */
export function isAgentCapabilityChangedPayload(
  p: unknown,
): p is AgentCapabilityChangedPayload {
  if (!isObject(p)) return false;
  const prevCaps = p["prev_capabilities"];
  const caps = p["capabilities"];
  return (
    isStr(p["agent_id"]) &&
    isStr(p["changed_by"]) &&
    Array.isArray(prevCaps) &&
    (prevCaps as unknown[]).every(c => typeof c === "string") &&
    Array.isArray(caps) &&
    (caps as unknown[]).every(c => typeof c === "string")
  );
}

/**
 * Type guard for agent.persona_updated payloads.
 *
 * Required: `agent_id` (string), `persona` (string), `updated_by` (string).
 * Optional fields are not validated beyond type checks.
 */
export function isAgentPersonaUpdatedPayload(
  p: unknown,
): p is AgentPersonaUpdatedPayload {
  if (!isObject(p)) return false;
  return (
    isStr(p["agent_id"]) &&
    isStr(p["persona"]) &&
    isStr(p["updated_by"])
  );
}

// ---------------------------------------------------------------------------
// Payload discriminator — map an AgentEventType to its type guard
// ---------------------------------------------------------------------------

/** All agent payload type-guard functions keyed by event type. */
export const AGENT_PAYLOAD_GUARDS: {
  [K in AgentEventType]: (p: unknown) => p is AllAgentEventPayloadMap[K];
} = {
  // Core lifecycle
  "agent.spawned":           isAgentSpawnedPayload,
  "agent.heartbeat":         isAgentHeartbeatPayload,
  "agent.error":             isAgentErrorPayload,
  "agent.terminated":        isAgentTerminatedPayload,
  // Extended lifecycle (Sub-AC 2)
  "agent.migrated":          isAgentMigratedPayload,
  "agent.lifecycle.changed": isAgentLifecycleChangedPayload,
  // Idle state (Sub-AC 2)
  "agent.idle":              isAgentIdlePayload,
  // Health monitoring (Sub-AC 2)
  "agent.health_changed":    isAgentHealthChangedPayload,
  // Spatial & assignment
  "agent.moved":             isAgentMovedPayload,
  "agent.assigned":          isAgentAssignedPayload,
  "agent.status_changed":    isAgentStatusChangedPayload,
  "agent.task.started":      isAgentTaskStartedPayload,
  "agent.task.completed":    isAgentTaskCompletedPayload,
  // Extended state/lifecycle events (Sub-AC 2 additions)
  "agent.capability_changed":  isAgentCapabilityChangedPayload,
  "agent.persona_updated":     isAgentPersonaUpdatedPayload,
  // Explicit lifecycle operation events (Sub-AC 16b)
  "agent.spawn_requested":     isAgentSpawnRequestedPayload,
  "agent.paused":              isAgentPausedPayload,
  "agent.resumed":             isAgentResumedPayload,
  "agent.suspended":           isAgentSuspendedPayload,
  "agent.retire_requested":    isAgentRetireRequestedPayload,
  "agent.retired":             isAgentRetiredPayload,
  "agent.migration_requested": isAgentMigrationRequestedPayload,
};

/**
 * Validates a payload against the expected shape for a given agent event type.
 *
 * Returns `true` and narrows `payload` to the correct typed interface if
 * validation passes.
 *
 * @example
 * ```ts
 * if (isValidAgentPayload("agent.lifecycle.changed", event.payload)) {
 *   // payload is AgentLifecycleChangedPayload
 *   console.log(event.payload.prev_state, "→", event.payload.next_state);
 * }
 * ```
 */
export function isValidAgentPayload<T extends AgentEventType>(
  type: T,
  payload: unknown,
): payload is AllAgentEventPayloadMap[T] {
  return AGENT_PAYLOAD_GUARDS[type](payload);
}
