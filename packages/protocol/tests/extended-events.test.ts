/**
 * @conitens/protocol — Sub-AC 16b extended event type tests
 *
 * Validates that:
 *  1. All new agent.* lifecycle extension EventTypes are registered in the
 *     master EVENT_TYPES array and in AGENT_EVENT_TYPES.
 *  2. All new command.* control-plane dispatching EventTypes are registered in
 *     EVENT_TYPES and in COMMAND_EVENT_TYPES.
 *  3. Every new event type has a corresponding payload type guard that correctly
 *     accepts valid payloads and rejects invalid ones.
 *  4. No regressions — all previously-registered event types remain valid.
 *  5. No duplicates introduced into EVENT_TYPES, AGENT_EVENT_TYPES, or
 *     COMMAND_EVENT_TYPES.
 *  6. The AGENT_PAYLOAD_GUARDS and COMMAND_PAYLOAD_GUARDS discriminator maps
 *     are exhaustive — every registered type has a guard entry.
 *  7. isValidAgentPayload and isValidCommandPayload work end-to-end via the
 *     discriminator maps.
 *
 * Record transparency is the supreme design principle: every new event type
 * must be evaluable independently. This test file ensures no AC can be skipped
 * due to another's failure by testing each type in isolation.
 */
import { describe, it, expect } from "vitest";
import {
  // Master registry
  EVENT_TYPES, isValidEventType,
  // Agent lifecycle module
  AGENT_EVENT_TYPES, AGENT_EVENT_TYPE_SET, isAgentEventType,
  AGENT_PAYLOAD_GUARDS, isValidAgentPayload,
  // Sub-AC 16b — new agent lifecycle operation type guards
  isAgentSpawnRequestedPayload,
  isAgentPausedPayload,
  isAgentResumedPayload,
  isAgentSuspendedPayload,
  isAgentRetireRequestedPayload,
  isAgentRetiredPayload,
  isAgentMigrationRequestedPayload,
  // Command pipeline module
  COMMAND_EVENT_TYPES, COMMAND_EVENT_TYPE_SET, isCommandEventType,
  COMMAND_PAYLOAD_GUARDS, isValidCommandPayload,
  // Sub-AC 16b — new command dispatching type guards
  isCommandDispatchedPayload,
  isCommandQueuedPayload,
  isCommandRetriedPayload,
  isCommandTimeoutPayload,
  isCommandCancelledPayload,
  isCommandEscalatedPayload,
} from "../src/index.js";

// =============================================================================
// §1 — New agent.* EventTypes are registered in master EVENT_TYPES
// =============================================================================

describe("Sub-AC 16b: new agent.* EventTypes — master registry", () => {
  const NEW_AGENT_EVENT_TYPES = [
    "agent.spawn_requested",
    "agent.paused",
    "agent.resumed",
    "agent.suspended",
    "agent.retire_requested",
    "agent.retired",
    "agent.migration_requested",
  ] as const;

  it("all new agent.* types are in EVENT_TYPES", () => {
    for (const t of NEW_AGENT_EVENT_TYPES) {
      expect(isValidEventType(t), `missing from EVENT_TYPES: ${t}`).toBe(true);
    }
  });

  it("all new agent.* types are in AGENT_EVENT_TYPES", () => {
    for (const t of NEW_AGENT_EVENT_TYPES) {
      expect(isAgentEventType(t), `missing from AGENT_EVENT_TYPES: ${t}`).toBe(true);
    }
  });

  it("all AGENT_EVENT_TYPES entries are in master EVENT_TYPES (no dangling references)", () => {
    for (const t of AGENT_EVENT_TYPES) {
      expect(isValidEventType(t), `dangling reference: ${t}`).toBe(true);
    }
  });

  it("EVENT_TYPES has no duplicates after Sub-AC 16b extension", () => {
    const s = new Set(EVENT_TYPES);
    expect(s.size).toBe(EVENT_TYPES.length);
  });

  it("AGENT_EVENT_TYPES has no duplicates after Sub-AC 16b extension", () => {
    expect(AGENT_EVENT_TYPE_SET.size).toBe(AGENT_EVENT_TYPES.length);
  });

  it("AGENT_EVENT_TYPES matches the agent.* subset of EVENT_TYPES exactly", () => {
    const fromMaster = (EVENT_TYPES as readonly string[])
      .filter(t => t.startsWith("agent."))
      .sort();
    const fromModule = [...AGENT_EVENT_TYPES].sort();
    expect(fromMaster).toEqual(fromModule);
  });
});

// =============================================================================
// §2 — New command.* EventTypes are registered in master EVENT_TYPES
// =============================================================================

describe("Sub-AC 16b: new command.* EventTypes — master registry", () => {
  const NEW_COMMAND_EVENT_TYPES = [
    "command.dispatched",
    "command.queued",
    "command.retried",
    "command.timeout",
    "command.cancelled",
    "command.escalated",
  ] as const;

  it("all new command.* types are in EVENT_TYPES", () => {
    for (const t of NEW_COMMAND_EVENT_TYPES) {
      expect(isValidEventType(t), `missing from EVENT_TYPES: ${t}`).toBe(true);
    }
  });

  it("all new command.* types are in COMMAND_EVENT_TYPES", () => {
    for (const t of NEW_COMMAND_EVENT_TYPES) {
      expect(isCommandEventType(t), `missing from COMMAND_EVENT_TYPES: ${t}`).toBe(true);
    }
  });

  it("all COMMAND_EVENT_TYPES entries are in master EVENT_TYPES (no dangling references)", () => {
    for (const t of COMMAND_EVENT_TYPES) {
      expect(isValidEventType(t), `dangling reference: ${t}`).toBe(true);
    }
  });

  it("COMMAND_EVENT_TYPES has no duplicates after Sub-AC 16b extension", () => {
    expect(COMMAND_EVENT_TYPE_SET.size).toBe(COMMAND_EVENT_TYPES.length);
  });
});

// =============================================================================
// §3 — Regression: previously-registered event types still valid
// =============================================================================

describe("Sub-AC 16b: regression — previously-registered event types still valid", () => {
  const PREVIOUSLY_REGISTERED_AGENT_TYPES = [
    "agent.spawned",
    "agent.heartbeat",
    "agent.error",
    "agent.terminated",
    "agent.migrated",
    "agent.lifecycle.changed",
    "agent.health_changed",
    "agent.moved",
    "agent.assigned",
    "agent.status_changed",
    "agent.task.started",
    "agent.task.completed",
  ] as const;

  it("all pre-existing agent.* types remain valid in EVENT_TYPES", () => {
    for (const t of PREVIOUSLY_REGISTERED_AGENT_TYPES) {
      expect(isValidEventType(t), `regressed: ${t}`).toBe(true);
    }
  });

  const PREVIOUSLY_REGISTERED_COMMAND_TYPES = [
    "command.issued",
    "command.acknowledged",
    "command.completed",
    "command.failed",
    "command.rejected",
  ] as const;

  it("all pre-existing command.* types remain valid in EVENT_TYPES", () => {
    for (const t of PREVIOUSLY_REGISTERED_COMMAND_TYPES) {
      expect(isValidEventType(t), `regressed: ${t}`).toBe(true);
    }
  });

  it("other RFC-1.0.1 required types are unaffected", () => {
    const required = [
      "task.created", "task.spec_updated",
      "handoff.completed",
      "memory.update_proposed", "memory.update_approved", "memory.update_rejected",
      "approval.requested", "approval.granted", "approval.denied",
    ];
    for (const t of required) {
      expect(isValidEventType(t), `regressed: ${t}`).toBe(true);
    }
  });
});

// =============================================================================
// §4 — Type guards: agent.spawn_requested
// =============================================================================

describe("isAgentSpawnRequestedPayload", () => {
  const VALID: Record<string, unknown> = {
    agent_id:     "researcher-2",
    persona:      "researcher",
    run_id:       "run-abc",
    request_id:   "req_01J3XYZ",
    requested_by: "gui",
  };

  it("accepts a valid payload", () => {
    expect(isAgentSpawnRequestedPayload(VALID)).toBe(true);
  });

  it("accepts payload with optional fields", () => {
    expect(isAgentSpawnRequestedPayload({
      ...VALID,
      room_id:      "research-lab",
      capabilities: ["search", "code"],
      params:       { timeout_ms: 30_000 },
    })).toBe(true);
  });

  it("rejects when agent_id is missing", () => {
    const { agent_id: _, ...rest } = VALID;
    expect(isAgentSpawnRequestedPayload(rest)).toBe(false);
  });

  it("rejects when persona is missing", () => {
    const { persona: _, ...rest } = VALID;
    expect(isAgentSpawnRequestedPayload(rest)).toBe(false);
  });

  it("rejects when run_id is missing", () => {
    const { run_id: _, ...rest } = VALID;
    expect(isAgentSpawnRequestedPayload(rest)).toBe(false);
  });

  it("rejects when request_id is missing", () => {
    const { request_id: _, ...rest } = VALID;
    expect(isAgentSpawnRequestedPayload(rest)).toBe(false);
  });

  it("rejects when requested_by is missing", () => {
    const { requested_by: _, ...rest } = VALID;
    expect(isAgentSpawnRequestedPayload(rest)).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isAgentSpawnRequestedPayload(null)).toBe(false);
    expect(isAgentSpawnRequestedPayload("string")).toBe(false);
    expect(isAgentSpawnRequestedPayload(42)).toBe(false);
    expect(isAgentSpawnRequestedPayload([])).toBe(false);
  });
});

// =============================================================================
// §5 — Type guards: agent.paused
// =============================================================================

describe("isAgentPausedPayload", () => {
  const VALID: Record<string, unknown> = {
    agent_id:     "implementer-1",
    triggered_by: "user_command",
  };

  it("accepts a valid payload", () => {
    expect(isAgentPausedPayload(VALID)).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    expect(isAgentPausedPayload({
      ...VALID,
      reason:         "operator requested pause for inspection",
      active_task_id: "task-42",
      paused_at_ms:   1_700_000_000_000,
    })).toBe(true);
  });

  it("rejects invalid triggered_by value", () => {
    expect(isAgentPausedPayload({ ...VALID, triggered_by: "bogus_trigger" })).toBe(false);
  });

  it("rejects missing agent_id", () => {
    const { agent_id: _, ...rest } = VALID;
    expect(isAgentPausedPayload(rest)).toBe(false);
  });

  it("rejects missing triggered_by", () => {
    const { triggered_by: _, ...rest } = VALID;
    expect(isAgentPausedPayload(rest)).toBe(false);
  });

  it("accepts all valid AgentLifecycleTrigger values", () => {
    const triggers = [
      "spawn", "task_assigned", "task_completed", "user_command", "system_command",
      "error", "heartbeat_timeout", "migration_start", "migration_complete", "shutdown",
    ];
    for (const trigger of triggers) {
      expect(isAgentPausedPayload({ ...VALID, triggered_by: trigger })).toBe(true);
    }
  });
});

// =============================================================================
// §6 — Type guards: agent.resumed
// =============================================================================

describe("isAgentResumedPayload", () => {
  const VALID: Record<string, unknown> = {
    agent_id:     "implementer-1",
    triggered_by: "user_command",
    resumed_from: "paused",
    resumed_to:   "active",
  };

  it("accepts a valid paused→active payload", () => {
    expect(isAgentResumedPayload(VALID)).toBe(true);
  });

  it("accepts suspended→ready payload", () => {
    expect(isAgentResumedPayload({
      ...VALID,
      resumed_from: "suspended",
      resumed_to:   "ready",
    })).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    expect(isAgentResumedPayload({
      ...VALID,
      reason:        "operator cleared hold",
      resumed_at_ms: 1_700_000_000_000,
    })).toBe(true);
  });

  it("rejects invalid resumed_from", () => {
    expect(isAgentResumedPayload({ ...VALID, resumed_from: "crashed" })).toBe(false);
    expect(isAgentResumedPayload({ ...VALID, resumed_from: "active" })).toBe(false);
  });

  it("rejects invalid resumed_to", () => {
    expect(isAgentResumedPayload({ ...VALID, resumed_to: "paused" })).toBe(false);
    expect(isAgentResumedPayload({ ...VALID, resumed_to: "terminated" })).toBe(false);
  });

  it("rejects when any required field is missing", () => {
    expect(isAgentResumedPayload({ agent_id: "x", triggered_by: "user_command", resumed_from: "paused" })).toBe(false);
    expect(isAgentResumedPayload({ agent_id: "x", triggered_by: "user_command", resumed_to: "active" })).toBe(false);
    expect(isAgentResumedPayload({ agent_id: "x", resumed_from: "paused", resumed_to: "active" })).toBe(false);
    expect(isAgentResumedPayload({ triggered_by: "user_command", resumed_from: "paused", resumed_to: "active" })).toBe(false);
  });
});

// =============================================================================
// §7 — Type guards: agent.suspended
// =============================================================================

describe("isAgentSuspendedPayload", () => {
  it("accepts resource_pressure suspension", () => {
    expect(isAgentSuspendedPayload({
      agent_id: "implementer-1",
      suspension_reason: "resource_pressure",
    })).toBe(true);
  });

  it("accepts policy suspension with all optional fields", () => {
    expect(isAgentSuspendedPayload({
      agent_id:          "researcher-3",
      suspension_reason: "policy",
      reason:            "admission control throttle",
      active_task_id:    "task-17",
      suspended_at_ms:   1_700_000_000_000,
    })).toBe(true);
  });

  it("accepts arbitrary suspension_reason strings (extensible)", () => {
    expect(isAgentSuspendedPayload({
      agent_id:          "manager-1",
      suspension_reason: "custom_policy_v2",
    })).toBe(true);
  });

  it("rejects missing agent_id", () => {
    expect(isAgentSuspendedPayload({ suspension_reason: "policy" })).toBe(false);
  });

  it("rejects missing suspension_reason", () => {
    expect(isAgentSuspendedPayload({ agent_id: "agent-1" })).toBe(false);
  });
});

// =============================================================================
// §8 — Type guards: agent.retire_requested
// =============================================================================

describe("isAgentRetireRequestedPayload", () => {
  it("accepts minimal valid payload", () => {
    expect(isAgentRetireRequestedPayload({
      agent_id:     "researcher-1",
      requested_by: "user:alice",
    })).toBe(true);
  });

  it("accepts full payload with all optional fields", () => {
    expect(isAgentRetireRequestedPayload({
      agent_id:          "manager-1",
      requested_by:      "system",
      retirement_reason: "project completed",
      drain_timeout_ms:  60_000,
    })).toBe(true);
  });

  it("rejects missing agent_id", () => {
    expect(isAgentRetireRequestedPayload({ requested_by: "user:bob" })).toBe(false);
  });

  it("rejects missing requested_by", () => {
    expect(isAgentRetireRequestedPayload({ agent_id: "researcher-1" })).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isAgentRetireRequestedPayload(null)).toBe(false);
    expect(isAgentRetireRequestedPayload(undefined)).toBe(false);
  });
});

// =============================================================================
// §9 — Type guards: agent.retired
// =============================================================================

describe("isAgentRetiredPayload", () => {
  it("accepts minimal valid payload (only agent_id required)", () => {
    expect(isAgentRetiredPayload({ agent_id: "researcher-1" })).toBe(true);
  });

  it("accepts fully-populated retirement record", () => {
    expect(isAgentRetiredPayload({
      agent_id:               "researcher-1",
      retirement_reason:      "project phase complete",
      final_task_id:          "task-99",
      tasks_completed_count:  47,
      uptime_ms:              3_600_000,
      summary:                "Completed literature review for project Alpha.",
    })).toBe(true);
  });

  it("rejects missing agent_id", () => {
    expect(isAgentRetiredPayload({ retirement_reason: "done" })).toBe(false);
  });

  it("rejects non-string agent_id", () => {
    expect(isAgentRetiredPayload({ agent_id: 42 })).toBe(false);
  });
});

// =============================================================================
// §10 — Type guards: agent.migration_requested
// =============================================================================

describe("isAgentMigrationRequestedPayload", () => {
  const VALID: Record<string, unknown> = {
    agent_id:       "implementer-2",
    migration_id:   "mig_01J3XYZ",
    target_run_id:  "run-failover-001",
    requested_by:   "system",
  };

  it("accepts a valid minimal payload", () => {
    expect(isAgentMigrationRequestedPayload(VALID)).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    expect(isAgentMigrationRequestedPayload({
      ...VALID,
      target_room:        "operations-floor",
      migration_reason:   "failover",
      migrated_task_ids:  ["task-10", "task-11"],
    })).toBe(true);
  });

  it("accepts all standard migration_reason values", () => {
    for (const reason of ["failover", "load_balance", "user_requested", "version_upgrade"]) {
      expect(isAgentMigrationRequestedPayload({ ...VALID, migration_reason: reason })).toBe(true);
    }
  });

  it("rejects missing migration_id", () => {
    const { migration_id: _, ...rest } = VALID;
    expect(isAgentMigrationRequestedPayload(rest)).toBe(false);
  });

  it("rejects missing target_run_id", () => {
    const { target_run_id: _, ...rest } = VALID;
    expect(isAgentMigrationRequestedPayload(rest)).toBe(false);
  });

  it("rejects missing requested_by", () => {
    const { requested_by: _, ...rest } = VALID;
    expect(isAgentMigrationRequestedPayload(rest)).toBe(false);
  });
});

// =============================================================================
// §11 — Type guards: command.dispatched
// =============================================================================

describe("isCommandDispatchedPayload", () => {
  const VALID: Record<string, unknown> = {
    command_id:    "cmd_01J3ABC",
    command_type:  "agent.spawn",
    executor_id:   "orchestrator",
    executor_kind: "orchestrator",
  };

  it("accepts a valid payload", () => {
    expect(isCommandDispatchedPayload(VALID)).toBe(true);
  });

  it("accepts all valid executor_kind values", () => {
    for (const kind of ["agent", "orchestrator", "pipeline", "system"]) {
      expect(isCommandDispatchedPayload({ ...VALID, executor_kind: kind })).toBe(true);
    }
  });

  it("accepts payload with optional fields", () => {
    expect(isCommandDispatchedPayload({
      ...VALID,
      dispatched_at_ms: 1_700_000_000_000,
      queue_depth:      3,
    })).toBe(true);
  });

  it("rejects invalid executor_kind", () => {
    expect(isCommandDispatchedPayload({ ...VALID, executor_kind: "human" })).toBe(false);
    expect(isCommandDispatchedPayload({ ...VALID, executor_kind: "" })).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(isCommandDispatchedPayload({ command_type: "agent.spawn", executor_id: "x", executor_kind: "agent" })).toBe(false);
    expect(isCommandDispatchedPayload({ command_id: "x", executor_id: "x", executor_kind: "agent" })).toBe(false);
    expect(isCommandDispatchedPayload({ command_id: "x", command_type: "agent.spawn", executor_kind: "agent" })).toBe(false);
    expect(isCommandDispatchedPayload({ command_id: "x", command_type: "agent.spawn", executor_id: "x" })).toBe(false);
  });
});

// =============================================================================
// §12 — Type guards: command.queued
// =============================================================================

describe("isCommandQueuedPayload", () => {
  it("accepts valid payload", () => {
    expect(isCommandQueuedPayload({
      command_id:   "cmd_01J3ABC",
      command_type: "task.create",
      queue_id:     "agent-inbox:researcher-1",
    })).toBe(true);
  });

  it("accepts payload with optional fields", () => {
    expect(isCommandQueuedPayload({
      command_id:        "cmd_01J3ABC",
      command_type:      "task.create",
      queue_id:          "agent-inbox:researcher-1",
      queue_position:    2,
      queued_at_ms:      1_700_000_000_000,
      estimated_wait_ms: 5_000,
    })).toBe(true);
  });

  it("rejects missing queue_id", () => {
    expect(isCommandQueuedPayload({
      command_id:   "cmd_01J3ABC",
      command_type: "task.create",
    })).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isCommandQueuedPayload(null)).toBe(false);
    expect(isCommandQueuedPayload("string")).toBe(false);
  });
});

// =============================================================================
// §13 — Type guards: command.retried
// =============================================================================

describe("isCommandRetriedPayload", () => {
  const VALID: Record<string, unknown> = {
    command_id:     "cmd_01J3ABC",
    command_type:   "agent.spawn",
    attempt_number: 1,
    retry_reason:   "executor_error",
  };

  it("accepts valid payload", () => {
    expect(isCommandRetriedPayload(VALID)).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    expect(isCommandRetriedPayload({
      ...VALID,
      max_attempts:        3,
      retried_at_ms:       1_700_000_000_000,
      previous_error_code: "AGENT_NOT_FOUND",
    })).toBe(true);
  });

  it("rejects non-number attempt_number", () => {
    expect(isCommandRetriedPayload({ ...VALID, attempt_number: "1" })).toBe(false);
  });

  it("rejects missing retry_reason", () => {
    const { retry_reason: _, ...rest } = VALID;
    expect(isCommandRetriedPayload(rest)).toBe(false);
  });

  it("rejects missing attempt_number", () => {
    const { attempt_number: _, ...rest } = VALID;
    expect(isCommandRetriedPayload(rest)).toBe(false);
  });
});

// =============================================================================
// §14 — Type guards: command.timeout
// =============================================================================

describe("isCommandTimeoutPayload", () => {
  const VALID: Record<string, unknown> = {
    command_id:   "cmd_01J3ABC",
    command_type: "pipeline.trigger",
    timeout_ms:   30_000,
    elapsed_ms:   30_150,
  };

  it("accepts valid payload", () => {
    expect(isCommandTimeoutPayload(VALID)).toBe(true);
  });

  it("accepts payload with optional fields", () => {
    expect(isCommandTimeoutPayload({
      ...VALID,
      executor_id:       "pipeline-runner-2",
      last_known_state:  "step:3-validation",
    })).toBe(true);
  });

  it("rejects non-number timeout_ms", () => {
    expect(isCommandTimeoutPayload({ ...VALID, timeout_ms: "30000" })).toBe(false);
  });

  it("rejects non-number elapsed_ms", () => {
    expect(isCommandTimeoutPayload({ ...VALID, elapsed_ms: null })).toBe(false);
  });

  it("rejects missing required numeric fields", () => {
    expect(isCommandTimeoutPayload({ command_id: "x", command_type: "agent.spawn", elapsed_ms: 100 })).toBe(false);
    expect(isCommandTimeoutPayload({ command_id: "x", command_type: "agent.spawn", timeout_ms: 5000 })).toBe(false);
  });
});

// =============================================================================
// §15 — Type guards: command.cancelled
// =============================================================================

describe("isCommandCancelledPayload", () => {
  const VALID: Record<string, unknown> = {
    command_id:   "cmd_01J3ABC",
    command_type: "pipeline.trigger",
    cancelled_by: "user:alice",
  };

  it("accepts valid payload", () => {
    expect(isCommandCancelledPayload(VALID)).toBe(true);
  });

  it("accepts full payload with all optional fields", () => {
    expect(isCommandCancelledPayload({
      ...VALID,
      cancellation_reason: "USER_REQUESTED",
      cancelled_at_ms:     1_700_000_000_000,
      partial_effects:     ["evt_01J3DEF"],
    })).toBe(true);
  });

  it("rejects missing cancelled_by", () => {
    const { cancelled_by: _, ...rest } = VALID;
    expect(isCommandCancelledPayload(rest)).toBe(false);
  });

  it("rejects missing command_id", () => {
    const { command_id: _, ...rest } = VALID;
    expect(isCommandCancelledPayload(rest)).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isCommandCancelledPayload(null)).toBe(false);
    expect(isCommandCancelledPayload(undefined)).toBe(false);
    expect(isCommandCancelledPayload(42)).toBe(false);
  });
});

// =============================================================================
// §16 — Type guards: command.escalated
// =============================================================================

describe("isCommandEscalatedPayload", () => {
  const VALID: Record<string, unknown> = {
    command_id:        "cmd_01J3ABC",
    command_type:      "agent.terminate",
    escalated_to:      "approval-queue",
    escalation_reason: "HIGH_RISK_COMMAND",
  };

  it("accepts valid payload", () => {
    expect(isCommandEscalatedPayload(VALID)).toBe(true);
  });

  it("accepts full payload with all optional fields", () => {
    expect(isCommandEscalatedPayload({
      ...VALID,
      approval_required:   true,
      escalated_at_ms:     1_700_000_000_000,
      original_executor:   "orchestrator",
    })).toBe(true);
  });

  it("accepts all standard escalation_reason codes", () => {
    for (const reason of ["HIGH_RISK_COMMAND", "INSUFFICIENT_PERMS", "POLICY_GATE", "APPROVAL_REQUIRED"]) {
      expect(isCommandEscalatedPayload({ ...VALID, escalation_reason: reason })).toBe(true);
    }
  });

  it("rejects missing escalated_to", () => {
    const { escalated_to: _, ...rest } = VALID;
    expect(isCommandEscalatedPayload(rest)).toBe(false);
  });

  it("rejects missing escalation_reason", () => {
    const { escalation_reason: _, ...rest } = VALID;
    expect(isCommandEscalatedPayload(rest)).toBe(false);
  });
});

// =============================================================================
// §17 — AGENT_PAYLOAD_GUARDS exhaustiveness
// =============================================================================

describe("AGENT_PAYLOAD_GUARDS exhaustiveness (Sub-AC 16b)", () => {
  it("has an entry for every AGENT_EVENT_TYPES member", () => {
    for (const t of AGENT_EVENT_TYPES) {
      expect(
        AGENT_PAYLOAD_GUARDS[t],
        `AGENT_PAYLOAD_GUARDS missing entry for: ${t}`,
      ).toBeDefined();
      expect(typeof AGENT_PAYLOAD_GUARDS[t]).toBe("function");
    }
  });

  it("isValidAgentPayload dispatches correctly for new types", () => {
    // agent.spawn_requested
    expect(isValidAgentPayload("agent.spawn_requested", {
      agent_id:     "r-1",
      persona:      "researcher",
      run_id:       "run-1",
      request_id:   "req-1",
      requested_by: "gui",
    })).toBe(true);

    // agent.paused
    expect(isValidAgentPayload("agent.paused", {
      agent_id:     "r-1",
      triggered_by: "user_command",
    })).toBe(true);

    // agent.resumed
    expect(isValidAgentPayload("agent.resumed", {
      agent_id:     "r-1",
      triggered_by: "user_command",
      resumed_from: "paused",
      resumed_to:   "active",
    })).toBe(true);

    // agent.suspended
    expect(isValidAgentPayload("agent.suspended", {
      agent_id:          "r-1",
      suspension_reason: "resource_pressure",
    })).toBe(true);

    // agent.retire_requested
    expect(isValidAgentPayload("agent.retire_requested", {
      agent_id:     "r-1",
      requested_by: "system",
    })).toBe(true);

    // agent.retired
    expect(isValidAgentPayload("agent.retired", {
      agent_id: "r-1",
    })).toBe(true);

    // agent.migration_requested
    expect(isValidAgentPayload("agent.migration_requested", {
      agent_id:      "r-1",
      migration_id:  "mig-1",
      target_run_id: "run-2",
      requested_by:  "system",
    })).toBe(true);
  });
});

// =============================================================================
// §18 — COMMAND_PAYLOAD_GUARDS exhaustiveness
// =============================================================================

describe("COMMAND_PAYLOAD_GUARDS exhaustiveness (Sub-AC 16b)", () => {
  it("has an entry for every COMMAND_EVENT_TYPES member", () => {
    for (const t of COMMAND_EVENT_TYPES) {
      expect(
        COMMAND_PAYLOAD_GUARDS[t],
        `COMMAND_PAYLOAD_GUARDS missing entry for: ${t}`,
      ).toBeDefined();
      expect(typeof COMMAND_PAYLOAD_GUARDS[t]).toBe("function");
    }
  });

  it("isValidCommandPayload dispatches correctly for new types", () => {
    // command.dispatched
    expect(isValidCommandPayload("command.dispatched", {
      command_id:    "cmd-1",
      command_type:  "agent.spawn",
      executor_id:   "orchestrator",
      executor_kind: "orchestrator",
    })).toBe(true);

    // command.queued
    expect(isValidCommandPayload("command.queued", {
      command_id:   "cmd-1",
      command_type: "task.create",
      queue_id:     "inbox:researcher-1",
    })).toBe(true);

    // command.retried
    expect(isValidCommandPayload("command.retried", {
      command_id:     "cmd-1",
      command_type:   "agent.spawn",
      attempt_number: 1,
      retry_reason:   "executor_error",
    })).toBe(true);

    // command.timeout
    expect(isValidCommandPayload("command.timeout", {
      command_id:   "cmd-1",
      command_type: "pipeline.trigger",
      timeout_ms:   30_000,
      elapsed_ms:   30_200,
    })).toBe(true);

    // command.cancelled
    expect(isValidCommandPayload("command.cancelled", {
      command_id:   "cmd-1",
      command_type: "pipeline.trigger",
      cancelled_by: "user:alice",
    })).toBe(true);

    // command.escalated
    expect(isValidCommandPayload("command.escalated", {
      command_id:        "cmd-1",
      command_type:      "agent.terminate",
      escalated_to:      "approval-queue",
      escalation_reason: "HIGH_RISK_COMMAND",
    })).toBe(true);
  });
});

// =============================================================================
// §19 — Complete EVENT_TYPES count verification
// =============================================================================

describe("Sub-AC 16b: total EVENT_TYPES count", () => {
  it("EVENT_TYPES contains at least 13 new event types from Sub-AC 16b", () => {
    const newTypes = [
      // 7 new agent.* lifecycle operation types
      "agent.spawn_requested",
      "agent.paused",
      "agent.resumed",
      "agent.suspended",
      "agent.retire_requested",
      "agent.retired",
      "agent.migration_requested",
      // 6 new command.* control-plane dispatching types
      "command.dispatched",
      "command.queued",
      "command.retried",
      "command.timeout",
      "command.cancelled",
      "command.escalated",
    ];
    for (const t of newTypes) {
      expect(isValidEventType(t), `not in EVENT_TYPES: ${t}`).toBe(true);
    }
  });

  it("all 22 agent.* EventTypes are reachable from EVENT_TYPES", () => {
    // 20 pre-Sub-AC 2 + agent.capability_changed + agent.persona_updated = 22
    const agentTypes = (EVENT_TYPES as readonly string[]).filter(t => t.startsWith("agent."));
    expect(agentTypes.length).toBe(22);
  });

  it("all 12 command.* EventTypes are reachable from EVENT_TYPES", () => {
    // 11 pre-Sub-AC 4 + command.state_changed (Sub-AC 4 fixture-sync trigger) = 12
    const commandTypes = (EVENT_TYPES as readonly string[]).filter(t => t.startsWith("command."));
    expect(commandTypes.length).toBe(12);
  });
});
