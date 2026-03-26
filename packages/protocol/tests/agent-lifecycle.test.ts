/**
 * @conitens/protocol — agent-lifecycle tests
 *
 * RFC-1.0.1 Sub-AC 3: Extended agent.* EventTypes
 *
 * Tests lock the contract for:
 *  - New event types (agent.migrated, agent.lifecycle.changed) in EVENT_TYPES
 *  - AGENT_EVENT_TYPES subset completeness
 *  - Lifecycle state machine transitions
 *  - Payload type guards (positive + negative cases for every agent.* type)
 *  - Generic isValidAgentPayload<T> dispatcher
 *  - AllAgentEventPayloadMap exhaustiveness
 */
import { describe, it, expect } from "vitest";
import {
  // Master event type registry
  EVENT_TYPES, isValidEventType,
  // Agent lifecycle module
  AGENT_EVENT_TYPES, AGENT_EVENT_TYPE_SET, isAgentEventType,
  VALID_AGENT_LIFECYCLE_TRANSITIONS,
  canAgentLifecycleTransition, isTerminalLifecycleState,
  isAgentSpawnedPayload,
  isAgentHeartbeatPayload,
  isAgentErrorPayload,
  isAgentTerminatedPayload,
  isAgentMigratedPayload,
  isAgentLifecycleChangedPayload,
  // Sub-AC 2 extended lifecycle payload guards
  isAgentIdlePayload,
  isAgentHealthChangedPayload,
  isAgentMovedPayload,
  isAgentAssignedPayload,
  isAgentStatusChangedPayload,
  isAgentTaskStartedPayload,
  isAgentTaskCompletedPayload,
  AGENT_PAYLOAD_GUARDS, isValidAgentPayload,
} from "../src/index.js";

// ===========================================================================
// 1. New event types must be registered in the master EVENT_TYPES array
// ===========================================================================

describe("Extended agent.* EventTypes — master registry", () => {
  it("agent.migrated is in EVENT_TYPES", () => {
    expect(isValidEventType("agent.migrated")).toBe(true);
  });

  it("agent.lifecycle.changed is in EVENT_TYPES", () => {
    expect(isValidEventType("agent.lifecycle.changed")).toBe(true);
  });

  it("all AGENT_EVENT_TYPES entries are valid EventTypes", () => {
    for (const t of AGENT_EVENT_TYPES) {
      expect(isValidEventType(t), `not in EVENT_TYPES: ${t}`).toBe(true);
    }
  });

  it("EVENT_TYPES has no duplicates after extension", () => {
    const set = new Set(EVENT_TYPES);
    expect(set.size).toBe(EVENT_TYPES.length);
  });

  it("AGENT_EVENT_TYPES covers all 20 agent.* event strings", () => {
    const agentEvents = (EVENT_TYPES as readonly string[]).filter(t =>
      t.startsWith("agent."),
    );
    expect(agentEvents.sort()).toEqual([...AGENT_EVENT_TYPES].sort());
  });
});

// ===========================================================================
// 2. AGENT_EVENT_TYPE_SET and isAgentEventType
// ===========================================================================

describe("isAgentEventType", () => {
  it("returns true for all AGENT_EVENT_TYPES entries", () => {
    for (const t of AGENT_EVENT_TYPES) {
      expect(isAgentEventType(t), `should be true: ${t}`).toBe(true);
    }
  });

  it("returns false for non-agent event types", () => {
    expect(isAgentEventType("task.created")).toBe(false);
    expect(isAgentEventType("layout.updated")).toBe(false);
    expect(isAgentEventType("")).toBe(false);
    expect(isAgentEventType("agent")).toBe(false);
    expect(isAgentEventType("agent.unknown")).toBe(false);
  });

  it("AGENT_EVENT_TYPE_SET has no duplicates", () => {
    expect(AGENT_EVENT_TYPE_SET.size).toBe(AGENT_EVENT_TYPES.length);
  });
});

// ===========================================================================
// 3. Lifecycle state machine
// ===========================================================================

describe("Agent lifecycle state machine", () => {
  it("initializing → ready is valid", () => {
    expect(canAgentLifecycleTransition("initializing", "ready")).toBe(true);
  });

  it("initializing → crashed is valid (startup failure)", () => {
    expect(canAgentLifecycleTransition("initializing", "crashed")).toBe(true);
  });

  it("ready → active is valid", () => {
    expect(canAgentLifecycleTransition("ready", "active")).toBe(true);
  });

  it("active → migrating is valid", () => {
    expect(canAgentLifecycleTransition("active", "migrating")).toBe(true);
  });

  it("migrating → terminated is valid", () => {
    expect(canAgentLifecycleTransition("migrating", "terminated")).toBe(true);
  });

  it("active → terminated is invalid (must go through terminating)", () => {
    expect(canAgentLifecycleTransition("active", "terminated")).toBe(false);
  });

  it("terminated → active is invalid (terminal state)", () => {
    expect(canAgentLifecycleTransition("terminated", "active")).toBe(false);
  });

  it("crashed → ready is invalid (terminal state)", () => {
    expect(canAgentLifecycleTransition("crashed", "ready")).toBe(false);
  });

  it("terminal states have no outgoing transitions", () => {
    expect(VALID_AGENT_LIFECYCLE_TRANSITIONS.terminated).toHaveLength(0);
    expect(VALID_AGENT_LIFECYCLE_TRANSITIONS.crashed).toHaveLength(0);
  });

  it("isTerminalLifecycleState identifies terminal states", () => {
    expect(isTerminalLifecycleState("terminated")).toBe(true);
    expect(isTerminalLifecycleState("crashed")).toBe(true);
    expect(isTerminalLifecycleState("active")).toBe(false);
    expect(isTerminalLifecycleState("initializing")).toBe(false);
  });

  it("every non-terminal state can reach terminated via terminating", () => {
    const nonTerminal = Object.keys(VALID_AGENT_LIFECYCLE_TRANSITIONS).filter(
      s => !isTerminalLifecycleState(s as Parameters<typeof isTerminalLifecycleState>[0]),
    );
    for (const s of nonTerminal) {
      // At least one path to terminating or crashed must exist (direct or transitive)
      const transitions = VALID_AGENT_LIFECYCLE_TRANSITIONS[
        s as keyof typeof VALID_AGENT_LIFECYCLE_TRANSITIONS
      ];
      const canReachTerminal = transitions.some(
        t => t === "terminating" || t === "terminated" || t === "crashed",
      );
      expect(canReachTerminal, `${s} has no path to terminal state`).toBe(true);
    }
  });
});

// ===========================================================================
// 4. Payload type guards — agent.spawned
// ===========================================================================

describe("isAgentSpawnedPayload", () => {
  it("accepts a minimal valid payload", () => {
    expect(
      isAgentSpawnedPayload({
        agent_id: "agent-1",
        persona: "implementer",
        run_id: "run-abc",
      }),
    ).toBe(true);
  });

  it("accepts a full payload with optional fields", () => {
    expect(
      isAgentSpawnedPayload({
        agent_id: "agent-1",
        persona: "researcher",
        run_id: "run-abc",
        room_id: "research-lab",
        parent_agent_id: "system",
        capabilities: ["code-change", "repo-map"],
        config_snapshot: { model: "claude-3" },
      }),
    ).toBe(true);
  });

  it("rejects missing agent_id", () => {
    expect(isAgentSpawnedPayload({ persona: "implementer", run_id: "run-1" })).toBe(false);
  });

  it("rejects missing persona", () => {
    expect(isAgentSpawnedPayload({ agent_id: "a1", run_id: "run-1" })).toBe(false);
  });

  it("rejects missing run_id", () => {
    expect(isAgentSpawnedPayload({ agent_id: "a1", persona: "impl" })).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isAgentSpawnedPayload(null)).toBe(false);
    expect(isAgentSpawnedPayload("string")).toBe(false);
    expect(isAgentSpawnedPayload(42)).toBe(false);
  });
});

// ===========================================================================
// 5. Payload type guards — agent.heartbeat
// ===========================================================================

describe("isAgentHeartbeatPayload", () => {
  it("accepts valid status values", () => {
    for (const status of ["idle", "active", "blocked", "paused", "error", "terminating", "terminated"]) {
      expect(
        isAgentHeartbeatPayload({ agent_id: "a1", status }),
        `status: ${status}`,
      ).toBe(true);
    }
  });

  it("rejects unknown status value", () => {
    expect(isAgentHeartbeatPayload({ agent_id: "a1", status: "unknown" })).toBe(false);
  });

  it("rejects missing status", () => {
    expect(isAgentHeartbeatPayload({ agent_id: "a1" })).toBe(false);
  });

  it("accepts optional metrics", () => {
    expect(
      isAgentHeartbeatPayload({
        agent_id: "a1",
        status: "active",
        active_task_id: "task-99",
        metrics: { uptime_ms: 5000, tasks_completed: 3 },
      }),
    ).toBe(true);
  });
});

// ===========================================================================
// 6. Payload type guards — agent.error
// ===========================================================================

describe("isAgentErrorPayload", () => {
  it("accepts valid payload with all severity levels", () => {
    for (const severity of ["warning", "error", "fatal"]) {
      expect(
        isAgentErrorPayload({
          agent_id: "a1",
          message: "Something went wrong",
          severity,
          recoverable: true,
        }),
        `severity: ${severity}`,
      ).toBe(true);
    }
  });

  it("rejects invalid severity", () => {
    expect(
      isAgentErrorPayload({
        agent_id: "a1",
        message: "msg",
        severity: "critical",
        recoverable: false,
      }),
    ).toBe(false);
  });

  it("rejects non-boolean recoverable", () => {
    expect(
      isAgentErrorPayload({
        agent_id: "a1",
        message: "msg",
        severity: "error",
        recoverable: "yes",
      }),
    ).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(isAgentErrorPayload({ agent_id: "a1", severity: "error" })).toBe(false);
    expect(isAgentErrorPayload({ message: "msg", severity: "error", recoverable: true })).toBe(false);
  });
});

// ===========================================================================
// 7. Payload type guards — agent.terminated
// ===========================================================================

describe("isAgentTerminatedPayload", () => {
  it("accepts all valid termination reasons", () => {
    const reasons = [
      "task_completed", "user_requested", "system_shutdown",
      "error", "timeout", "evicted", "migration", "crash",
    ];
    for (const reason of reasons) {
      expect(
        isAgentTerminatedPayload({ agent_id: "a1", reason }),
        `reason: ${reason}`,
      ).toBe(true);
    }
  });

  it("rejects invalid termination reason", () => {
    expect(
      isAgentTerminatedPayload({ agent_id: "a1", reason: "unknown_reason" }),
    ).toBe(false);
  });

  it("rejects missing reason", () => {
    expect(isAgentTerminatedPayload({ agent_id: "a1" })).toBe(false);
  });

  it("accepts optional uptime_ms and exit_code", () => {
    expect(
      isAgentTerminatedPayload({
        agent_id: "a1",
        reason: "task_completed",
        exit_code: 0,
        uptime_ms: 30000,
        summary: "Completed 5 tasks",
      }),
    ).toBe(true);
  });
});

// ===========================================================================
// 8. Payload type guards — agent.migrated (NEW Sub-AC 3)
// ===========================================================================

describe("isAgentMigratedPayload", () => {
  it("accepts minimal valid payload", () => {
    expect(
      isAgentMigratedPayload({
        agent_id: "a1",
        from_run_id: "run-old",
        to_run_id: "run-new",
      }),
    ).toBe(true);
  });

  it("accepts full payload with optional fields", () => {
    expect(
      isAgentMigratedPayload({
        agent_id: "a1",
        from_run_id: "run-old",
        to_run_id: "run-new",
        from_room: "impl-office",
        to_room: "impl-office",
        migration_reason: "failover",
        migrated_task_ids: ["task-1", "task-2"],
        state_snapshot: { currentStep: 3 },
      }),
    ).toBe(true);
  });

  it("rejects missing from_run_id", () => {
    expect(isAgentMigratedPayload({ agent_id: "a1", to_run_id: "run-new" })).toBe(false);
  });

  it("rejects missing to_run_id", () => {
    expect(isAgentMigratedPayload({ agent_id: "a1", from_run_id: "run-old" })).toBe(false);
  });

  it("rejects missing agent_id", () => {
    expect(
      isAgentMigratedPayload({ from_run_id: "run-old", to_run_id: "run-new" }),
    ).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isAgentMigratedPayload(null)).toBe(false);
    expect(isAgentMigratedPayload([])).toBe(false);
  });
});

// ===========================================================================
// 9. Payload type guards — agent.lifecycle.changed (NEW Sub-AC 3)
// ===========================================================================

describe("isAgentLifecycleChangedPayload", () => {
  it("accepts a valid transition", () => {
    expect(
      isAgentLifecycleChangedPayload({
        agent_id: "a1",
        prev_state: "initializing",
        next_state: "ready",
        trigger: "spawn",
      }),
    ).toBe(true);
  });

  it("accepts all valid lifecycle states", () => {
    const states = [
      "initializing", "ready", "active", "paused", "suspended",
      "migrating", "terminating", "terminated", "crashed",
    ];
    for (const state of states) {
      expect(
        isAgentLifecycleChangedPayload({
          agent_id: "a1",
          prev_state: state,
          next_state: "terminated",
          trigger: "shutdown",
        }),
        `prev_state: ${state}`,
      ).toBe(true);
    }
  });

  it("accepts all valid trigger values", () => {
    const triggers = [
      "spawn", "task_assigned", "task_completed", "user_command",
      "system_command", "error", "heartbeat_timeout",
      "migration_start", "migration_complete", "shutdown",
    ];
    for (const trigger of triggers) {
      expect(
        isAgentLifecycleChangedPayload({
          agent_id: "a1",
          prev_state: "ready",
          next_state: "active",
          trigger,
        }),
        `trigger: ${trigger}`,
      ).toBe(true);
    }
  });

  it("rejects invalid lifecycle state", () => {
    expect(
      isAgentLifecycleChangedPayload({
        agent_id: "a1",
        prev_state: "unknown_state",
        next_state: "ready",
        trigger: "spawn",
      }),
    ).toBe(false);
  });

  it("rejects invalid trigger", () => {
    expect(
      isAgentLifecycleChangedPayload({
        agent_id: "a1",
        prev_state: "ready",
        next_state: "active",
        trigger: "unknown_trigger",
      }),
    ).toBe(false);
  });

  it("rejects missing trigger", () => {
    expect(
      isAgentLifecycleChangedPayload({
        agent_id: "a1",
        prev_state: "ready",
        next_state: "active",
      }),
    ).toBe(false);
  });

  it("accepts optional reason and metadata fields", () => {
    expect(
      isAgentLifecycleChangedPayload({
        agent_id: "a1",
        prev_state: "active",
        next_state: "terminating",
        trigger: "user_command",
        reason: "User stopped the agent",
        metadata: { command_id: "cmd-42" },
      }),
    ).toBe(true);
  });
});

// ===========================================================================
// 10. Sub-AC 2 extended lifecycle type guards — agent.idle and agent.health_changed
// ===========================================================================

describe("isAgentIdlePayload", () => {
  it("accepts a minimal valid payload (only agent_id required)", () => {
    expect(isAgentIdlePayload({ agent_id: "a1" })).toBe(true);
  });

  it("accepts a full payload with all optional fields", () => {
    expect(
      isAgentIdlePayload({
        agent_id: "a1",
        prev_status: "active",
        idle_since_ms: 1710000000000,
        idle_reason: "task_completed",
        tasks_completed_count: 5,
      }),
    ).toBe(true);
  });

  it("accepts all valid idle_reason codes", () => {
    for (const reason of ["task_completed", "awaiting_assignment", "queue_empty", "resumed_no_task", "custom_reason"]) {
      expect(
        isAgentIdlePayload({ agent_id: "a1", idle_reason: reason }),
        `idle_reason: ${reason}`,
      ).toBe(true);
    }
  });

  it("rejects missing agent_id", () => {
    expect(isAgentIdlePayload({ idle_reason: "task_completed" })).toBe(false);
  });

  it("rejects non-string agent_id", () => {
    expect(isAgentIdlePayload({ agent_id: 123 })).toBe(false);
  });

  it("rejects null", () => {
    expect(isAgentIdlePayload(null)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isAgentIdlePayload("agent-1")).toBe(false);
    expect(isAgentIdlePayload([])).toBe(false);
  });

  it("isValidAgentPayload dispatches correctly for agent.idle", () => {
    expect(
      isValidAgentPayload("agent.idle", { agent_id: "a1" }),
    ).toBe(true);
    expect(
      isValidAgentPayload("agent.idle", {}),
    ).toBe(false);
  });
});

describe("isAgentHealthChangedPayload", () => {
  const validHealthStatuses = ["healthy", "degraded", "unhealthy", "unknown"] as const;

  it("accepts all valid prev_health × health combinations", () => {
    for (const prev of validHealthStatuses) {
      for (const next of validHealthStatuses) {
        expect(
          isAgentHealthChangedPayload({ agent_id: "a1", prev_health: prev, health: next }),
          `${prev} → ${next}`,
        ).toBe(true);
      }
    }
  });

  it("accepts a full payload with optional fields", () => {
    expect(
      isAgentHealthChangedPayload({
        agent_id: "a1",
        prev_health: "healthy",
        health: "degraded",
        dimensions: { error_rate: 0.15, heartbeat: 1.0, memory: 0.8 },
        reason: "Error rate rose above 10% threshold",
        intervention_recommended: false,
      }),
    ).toBe(true);
  });

  it("rejects missing agent_id", () => {
    expect(
      isAgentHealthChangedPayload({ prev_health: "healthy", health: "degraded" }),
    ).toBe(false);
  });

  it("rejects missing prev_health", () => {
    expect(
      isAgentHealthChangedPayload({ agent_id: "a1", health: "degraded" }),
    ).toBe(false);
  });

  it("rejects missing health", () => {
    expect(
      isAgentHealthChangedPayload({ agent_id: "a1", prev_health: "healthy" }),
    ).toBe(false);
  });

  it("rejects invalid health status value", () => {
    expect(
      isAgentHealthChangedPayload({ agent_id: "a1", prev_health: "good", health: "degraded" }),
    ).toBe(false);
    expect(
      isAgentHealthChangedPayload({ agent_id: "a1", prev_health: "healthy", health: "critical" }),
    ).toBe(false);
  });

  it("rejects null", () => {
    expect(isAgentHealthChangedPayload(null)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isAgentHealthChangedPayload("healthy")).toBe(false);
    expect(isAgentHealthChangedPayload([])).toBe(false);
  });

  it("isValidAgentPayload dispatches correctly for agent.health_changed", () => {
    expect(
      isValidAgentPayload("agent.health_changed", {
        agent_id: "a1",
        prev_health: "healthy",
        health: "unhealthy",
      }),
    ).toBe(true);
    expect(
      isValidAgentPayload("agent.health_changed", {
        agent_id: "a1",
        prev_health: "invalid",
        health: "unhealthy",
      }),
    ).toBe(false);
  });
});

// ===========================================================================
// 11. Spatial/assignment type guards (re-exported in unified API)
// ===========================================================================

describe("isAgentMovedPayload", () => {
  it("accepts valid payload", () => {
    expect(isAgentMovedPayload({ agent_id: "a1", to_room: "ops-control" })).toBe(true);
  });

  it("accepts with position", () => {
    expect(
      isAgentMovedPayload({
        agent_id: "a1",
        from_room: "lobby",
        to_room: "impl-office",
        position: { x: 1, y: 0, z: 2 },
      }),
    ).toBe(true);
  });

  it("rejects missing to_room", () => {
    expect(isAgentMovedPayload({ agent_id: "a1" })).toBe(false);
  });
});

describe("isAgentAssignedPayload", () => {
  it("accepts valid payload", () => {
    expect(
      isAgentAssignedPayload({ agent_id: "a1", room_id: "research-lab" }),
    ).toBe(true);
  });

  it("rejects missing room_id", () => {
    expect(isAgentAssignedPayload({ agent_id: "a1" })).toBe(false);
  });
});

describe("isAgentStatusChangedPayload", () => {
  it("accepts valid payload", () => {
    expect(
      isAgentStatusChangedPayload({ agent_id: "a1", prev_status: "idle", status: "active" }),
    ).toBe(true);
  });

  it("rejects missing prev_status", () => {
    expect(isAgentStatusChangedPayload({ agent_id: "a1", status: "active" })).toBe(false);
  });
});

describe("isAgentTaskStartedPayload", () => {
  it("accepts valid payload", () => {
    expect(
      isAgentTaskStartedPayload({ agent_id: "a1", task_id: "task-1" }),
    ).toBe(true);
  });

  it("rejects missing task_id", () => {
    expect(isAgentTaskStartedPayload({ agent_id: "a1" })).toBe(false);
  });
});

describe("isAgentTaskCompletedPayload", () => {
  it("accepts valid outcomes", () => {
    for (const outcome of ["success", "failure", "cancelled"]) {
      expect(
        isAgentTaskCompletedPayload({ agent_id: "a1", task_id: "t1", outcome }),
        `outcome: ${outcome}`,
      ).toBe(true);
    }
  });

  it("rejects invalid outcome", () => {
    expect(
      isAgentTaskCompletedPayload({ agent_id: "a1", task_id: "t1", outcome: "skipped" }),
    ).toBe(false);
  });
});

// ===========================================================================
// 11. AGENT_PAYLOAD_GUARDS discriminator map
// ===========================================================================

describe("AGENT_PAYLOAD_GUARDS", () => {
  it("has an entry for every AGENT_EVENT_TYPES entry", () => {
    for (const t of AGENT_EVENT_TYPES) {
      expect(
        typeof AGENT_PAYLOAD_GUARDS[t],
        `missing guard for ${t}`,
      ).toBe("function");
    }
  });

  it("keys match AGENT_EVENT_TYPES exactly (no extras, no missing)", () => {
    const guardKeys = Object.keys(AGENT_PAYLOAD_GUARDS).sort();
    const eventKeys = [...AGENT_EVENT_TYPES].sort();
    expect(guardKeys).toEqual(eventKeys);
  });
});

// ===========================================================================
// 12. isValidAgentPayload generic dispatcher
// ===========================================================================

describe("isValidAgentPayload", () => {
  it("validates agent.spawned via generic dispatcher", () => {
    expect(
      isValidAgentPayload("agent.spawned", {
        agent_id: "a1",
        persona: "validator",
        run_id: "run-42",
      }),
    ).toBe(true);
  });

  it("validates agent.migrated via generic dispatcher", () => {
    expect(
      isValidAgentPayload("agent.migrated", {
        agent_id: "a1",
        from_run_id: "run-1",
        to_run_id: "run-2",
      }),
    ).toBe(true);
  });

  it("validates agent.lifecycle.changed via generic dispatcher", () => {
    expect(
      isValidAgentPayload("agent.lifecycle.changed", {
        agent_id: "a1",
        prev_state: "ready",
        next_state: "active",
        trigger: "task_assigned",
      }),
    ).toBe(true);
  });

  it("rejects invalid payload for agent.lifecycle.changed", () => {
    expect(
      isValidAgentPayload("agent.lifecycle.changed", {
        agent_id: "a1",
        prev_state: "ready",
        // missing next_state and trigger
      }),
    ).toBe(false);
  });

  it("rejects null/undefined for any type", () => {
    for (const t of AGENT_EVENT_TYPES) {
      expect(isValidAgentPayload(t, null), `null should fail for ${t}`).toBe(false);
    }
  });
});
