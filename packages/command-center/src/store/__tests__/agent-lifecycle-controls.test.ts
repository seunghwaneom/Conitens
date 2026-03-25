/**
 * agent-lifecycle-controls.test.ts — Tests for AC 7a: 3D Agent lifecycle controls.
 *
 * Tests the Zustand agent-store actions that power the AgentLifecyclePanel and
 * AgentDetailPanel HUD components.
 *
 * AC 7a coverage:
 *   - startAgent    — activates inactive/terminated agents (→ idle)
 *   - stopAgent     — terminates any non-terminated agent (→ terminated)
 *   - pauseAgent    — suspends active/busy agents (→ idle + paused lifecycle)
 *   - changeAgentStatus — manual status override with event sourcing
 *   - sendAgentCommand  — dispatches a free-text command, sets agent active
 *   - restartAgent      — clears task + resets to idle/ready
 *
 * Additional coverage (from AgentDetailPanel / HUD button guards):
 *   - START disabled when agent is already active/busy
 *   - STOP disabled when agent is already terminated
 *   - All actions are guard-checked (no-op on invalid target state)
 *   - All actions emit the correct event type
 *   - All actions include agent_id in payload for record transparency
 *
 * Test ID scheme:
 *   7a-N : AC 7a lifecycle actions
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore, deriveStatusFromLifecycle } from "../agent-store.js";
import { createDynamicAgentDef } from "../../data/agents.js";
import type { AgentLifecycleState } from "../../data/agents.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetStore() {
  useAgentStore.setState({
    agents:         {},
    agentRegistry:  {},
    events:         [],
    selectedAgentId: null,
    initialized:    false,
    _savedLiveAgents: null,
  });
}

function makeDef(id: string, room = "ops-control") {
  return createDynamicAgentDef(id, `Agent ${id}`, "implementer", room);
}

/** Register an agent and return its ID. */
function registerAgent(id: string, room?: string): string {
  useAgentStore.getState().registerAgent(makeDef(id, room));
  return id;
}

/** Get the last emitted event from the agent store. */
function lastEvent() {
  const { events } = useAgentStore.getState();
  return events[events.length - 1];
}

/** Get all event types from the agent store. */
function eventTypes() {
  return useAgentStore.getState().events.map((e) => e.type);
}

// ═══════════════════════════════════════════════════════════════════════════════
// startAgent — AC 7a
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC 7a — startAgent", () => {
  beforeEach(resetStore);

  // 7a-1
  it("startAgent transitions an inactive agent to idle", () => {
    const id = registerAgent("agent-start-1");
    // registerAgent sets status to "inactive" + lifecycleState "initializing"
    expect(useAgentStore.getState().agents[id].status).toBe("inactive");

    useAgentStore.getState().startAgent(id);
    expect(useAgentStore.getState().agents[id].status).toBe("idle");
  });

  // 7a-2
  it("startAgent sets lifecycleState to 'ready'", () => {
    const id = registerAgent("agent-start-2");
    useAgentStore.getState().startAgent(id);
    expect(useAgentStore.getState().agents[id].lifecycleState).toBe("ready");
  });

  // 7a-3
  it("startAgent emits agent.started event with agent_id in payload", () => {
    const id = registerAgent("agent-start-3");
    useAgentStore.getState().startAgent(id);
    const evt = lastEvent();
    expect(evt.type).toBe("agent.started");
    expect(evt.payload.agent_id).toBe(id);
    expect(evt.agentId).toBe(id);
  });

  // 7a-4
  it("startAgent includes prev_status in event payload for audit trail", () => {
    const id = registerAgent("agent-start-4");
    useAgentStore.getState().startAgent(id);
    expect(lastEvent().payload.prev_status).toBe("inactive");
    expect(lastEvent().payload.new_status).toBe("idle");
  });

  // 7a-5
  it("startAgent is a no-op if agent is already active (START button guard)", () => {
    const id = registerAgent("agent-start-5");
    useAgentStore.getState().changeAgentStatus(id, "active");
    const beforeCount = eventTypes().length;
    useAgentStore.getState().startAgent(id); // should no-op
    expect(eventTypes().length).toBe(beforeCount);
    expect(useAgentStore.getState().agents[id].status).toBe("active");
  });

  // 7a-6
  it("startAgent is a no-op if agent is already busy (START button guard)", () => {
    const id = registerAgent("agent-start-6");
    useAgentStore.getState().changeAgentStatus(id, "busy");
    const beforeCount = eventTypes().length;
    useAgentStore.getState().startAgent(id);
    expect(eventTypes().length).toBe(beforeCount);
  });

  // 7a-7
  it("startAgent reactivates a terminated agent", () => {
    const id = registerAgent("agent-start-7");
    useAgentStore.getState().stopAgent(id);
    expect(useAgentStore.getState().agents[id].status).toBe("terminated");
    useAgentStore.getState().startAgent(id);
    expect(useAgentStore.getState().agents[id].status).toBe("idle");
  });

  // 7a-8
  it("startAgent clears any lingering task assignment", () => {
    const id = registerAgent("agent-start-8");
    useAgentStore.getState().startAgentTask(id, "task-old", "Old Task");
    useAgentStore.getState().stopAgent(id);
    useAgentStore.getState().startAgent(id);
    const agent = useAgentStore.getState().agents[id];
    expect(agent.currentTaskId).toBeNull();
    expect(agent.currentTaskTitle).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// stopAgent — AC 7a
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC 7a — stopAgent", () => {
  beforeEach(resetStore);

  // 7a-9
  it("stopAgent terminates an active agent", () => {
    const id = registerAgent("agent-stop-1");
    useAgentStore.getState().changeAgentStatus(id, "active");
    useAgentStore.getState().stopAgent(id);
    expect(useAgentStore.getState().agents[id].status).toBe("terminated");
  });

  // 7a-10
  it("stopAgent sets lifecycleState to 'terminated'", () => {
    const id = registerAgent("agent-stop-2");
    useAgentStore.getState().stopAgent(id);
    expect(useAgentStore.getState().agents[id].lifecycleState).toBe("terminated");
  });

  // 7a-11
  it("stopAgent emits agent.stopped event with agent_id and confirmed=true", () => {
    const id = registerAgent("agent-stop-3");
    useAgentStore.getState().stopAgent(id);
    const evt = lastEvent();
    expect(evt.type).toBe("agent.stopped");
    expect(evt.payload.agent_id).toBe(id);
    expect(evt.payload.confirmed).toBe(true);
    expect(evt.agentId).toBe(id);
  });

  // 7a-12
  it("stopAgent records prev_task_id in payload if agent was working", () => {
    const id = registerAgent("agent-stop-4");
    useAgentStore.getState().startAgentTask(id, "task-123", "Critical Work");
    useAgentStore.getState().stopAgent(id);
    const evt = lastEvent();
    expect(evt.payload.prev_task_id).toBe("task-123");
  });

  // 7a-13
  it("stopAgent clears currentTaskId and currentTaskTitle", () => {
    const id = registerAgent("agent-stop-5");
    useAgentStore.getState().startAgentTask(id, "task-xyz", "Active Work");
    useAgentStore.getState().stopAgent(id);
    const agent = useAgentStore.getState().agents[id];
    expect(agent.currentTaskId).toBeNull();
    expect(agent.currentTaskTitle).toBeNull();
  });

  // 7a-14
  it("stopAgent is a no-op if agent is already terminated (STOP button guard)", () => {
    const id = registerAgent("agent-stop-6");
    useAgentStore.getState().stopAgent(id); // first stop
    const beforeCount = eventTypes().length;
    useAgentStore.getState().stopAgent(id); // second stop — should no-op
    expect(eventTypes().length).toBe(beforeCount);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// pauseAgent — AC 7a
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC 7a — pauseAgent", () => {
  beforeEach(resetStore);

  // 7a-15
  it("pauseAgent sets active agent to idle with 'paused' lifecycleState", () => {
    const id = registerAgent("agent-pause-1");
    useAgentStore.getState().changeAgentStatus(id, "active");
    useAgentStore.getState().pauseAgent(id);
    const agent = useAgentStore.getState().agents[id];
    expect(agent.status).toBe("idle");
    expect(agent.lifecycleState).toBe("paused");
  });

  // 7a-16
  it("pauseAgent emits agent.paused event with suspended task info", () => {
    const id = registerAgent("agent-pause-2");
    useAgentStore.getState().startAgentTask(id, "task-pause", "Paused Work");
    useAgentStore.getState().pauseAgent(id);
    const evt = lastEvent();
    expect(evt.type).toBe("agent.paused");
    expect(evt.payload.suspended_task_id).toBe("task-pause");
    expect(evt.payload.suspended_task_title).toBe("Paused Work");
  });

  // 7a-17
  it("pauseAgent preserves currentTaskId (task can be resumed later)", () => {
    const id = registerAgent("agent-pause-3");
    useAgentStore.getState().startAgentTask(id, "task-kept", "Keep This Task");
    useAgentStore.getState().pauseAgent(id);
    // Task info is preserved on pause (unlike stop which clears it)
    const agent = useAgentStore.getState().agents[id];
    expect(agent.currentTaskId).toBe("task-kept");
  });

  // 7a-18
  it("pauseAgent is a no-op if agent is idle (not active/busy)", () => {
    const id = registerAgent("agent-pause-4");
    useAgentStore.getState().changeAgentStatus(id, "idle");
    const beforeCount = eventTypes().length;
    useAgentStore.getState().pauseAgent(id);
    expect(eventTypes().length).toBe(beforeCount);
  });

  // 7a-19
  it("pauseAgent is a no-op if agent is inactive", () => {
    const id = registerAgent("agent-pause-5");
    // registerAgent sets to inactive
    const beforeCount = eventTypes().length;
    useAgentStore.getState().pauseAgent(id);
    expect(eventTypes().length).toBe(beforeCount);
  });

  // 7a-20
  it("pauseAgent works on busy agents as well as active ones", () => {
    const id = registerAgent("agent-pause-6");
    useAgentStore.getState().changeAgentStatus(id, "busy");
    useAgentStore.getState().pauseAgent(id);
    const evt = lastEvent();
    expect(evt.type).toBe("agent.paused");
    expect(useAgentStore.getState().agents[id].lifecycleState).toBe("paused");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// changeAgentStatus — AC 7a
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC 7a — changeAgentStatus", () => {
  beforeEach(resetStore);

  // 7a-21
  it("changeAgentStatus updates status and emits agent.status_changed", () => {
    const id = registerAgent("agent-cs-1");
    useAgentStore.getState().changeAgentStatus(id, "active");
    expect(useAgentStore.getState().agents[id].status).toBe("active");
    const evt = lastEvent();
    expect(evt.type).toBe("agent.status_changed");
    expect(evt.agentId).toBe(id);
  });

  // 7a-22
  it("changeAgentStatus records prev_status in the event payload", () => {
    const id = registerAgent("agent-cs-2");
    const prevStatus = useAgentStore.getState().agents[id].status;
    useAgentStore.getState().changeAgentStatus(id, "active", "manual-start");
    expect(lastEvent().payload.prev_status).toBe(prevStatus);
    expect(lastEvent().payload.status).toBe("active");
    expect(lastEvent().payload.reason).toBe("manual-start");
  });

  // 7a-23
  it("changeAgentStatus accepts all valid AgentStatus values", () => {
    const id = registerAgent("agent-cs-3");
    const statuses = ["inactive", "idle", "active", "busy", "error", "terminated"] as const;
    for (const s of statuses) {
      useAgentStore.getState().changeAgentStatus(id, s);
      expect(useAgentStore.getState().agents[id].status).toBe(s);
    }
  });

  // 7a-24
  it("changeAgentStatus updates lastStatusChangeTs timestamp", () => {
    const id = registerAgent("agent-cs-4");
    const before = useAgentStore.getState().agents[id].lastStatusChangeTs;
    useAgentStore.getState().changeAgentStatus(id, "active");
    const after = useAgentStore.getState().agents[id].lastStatusChangeTs;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  // 7a-25
  it("changeAgentStatus is a no-op for unknown agent IDs", () => {
    const before = eventTypes().length;
    useAgentStore.getState().changeAgentStatus("non-existent-agent", "active");
    expect(eventTypes().length).toBe(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// sendAgentCommand — AC 7a + Sub-AC 7b
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC 7a — sendAgentCommand (command dispatch)", () => {
  beforeEach(resetStore);

  // 7a-26
  it("sendAgentCommand sets agent status to 'active'", () => {
    const id = registerAgent("agent-cmd-1");
    useAgentStore.getState().sendAgentCommand(id, "analyze src/core");
    expect(useAgentStore.getState().agents[id].status).toBe("active");
  });

  // 7a-27
  it("sendAgentCommand emits agent.command_sent event with command in payload", () => {
    const id = registerAgent("agent-cmd-2");
    useAgentStore.getState().sendAgentCommand(id, "audit dependencies");
    const evt = lastEvent();
    expect(evt.type).toBe("agent.command_sent");
    expect(evt.payload.command).toBe("audit dependencies");
    expect(evt.agentId).toBe(id);
  });

  // 7a-28
  it("sendAgentCommand truncates long commands for the 3D badge (≤40 chars)", () => {
    const id = registerAgent("agent-cmd-3");
    const longCmd = "x".repeat(50);
    useAgentStore.getState().sendAgentCommand(id, longCmd);
    const agent = useAgentStore.getState().agents[id];
    expect(agent.currentTaskTitle!.length).toBeLessThanOrEqual(41); // 40 + "…"
    expect(agent.currentTaskTitle).toMatch(/…$/);
  });

  // 7a-29
  it("sendAgentCommand stores short commands verbatim (no truncation)", () => {
    const id = registerAgent("agent-cmd-4");
    const shortCmd = "review PR #42";
    useAgentStore.getState().sendAgentCommand(id, shortCmd);
    expect(useAgentStore.getState().agents[id].currentTaskTitle).toBe(shortCmd);
  });

  // 7a-30
  it("sendAgentCommand records prev_status for audit trail", () => {
    const id = registerAgent("agent-cmd-5");
    const prevStatus = useAgentStore.getState().agents[id].status;
    useAgentStore.getState().sendAgentCommand(id, "run tests");
    expect(lastEvent().payload.prev_status).toBe(prevStatus);
  });

  // 7a-31
  it("sendAgentCommand creates a synthetic cmd-* task ID", () => {
    const id = registerAgent("agent-cmd-6");
    useAgentStore.getState().sendAgentCommand(id, "check logs");
    const currentId = useAgentStore.getState().agents[id].currentTaskId;
    expect(currentId).toMatch(/^cmd-/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// restartAgent — AC 7a
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC 7a — restartAgent", () => {
  beforeEach(resetStore);

  // 7a-32
  it("restartAgent resets status to 'idle' regardless of previous status", () => {
    const id = registerAgent("agent-rst-1");
    for (const s of ["active", "busy", "error"] as const) {
      useAgentStore.getState().changeAgentStatus(id, s);
      useAgentStore.getState().restartAgent(id);
      expect(useAgentStore.getState().agents[id].status).toBe("idle");
    }
  });

  // 7a-33
  it("restartAgent sets lifecycleState to 'ready'", () => {
    const id = registerAgent("agent-rst-2");
    useAgentStore.getState().pauseAgent(id);
    useAgentStore.getState().restartAgent(id);
    expect(useAgentStore.getState().agents[id].lifecycleState).toBe("ready");
  });

  // 7a-34
  it("restartAgent clears currentTaskId and currentTaskTitle", () => {
    const id = registerAgent("agent-rst-3");
    useAgentStore.getState().startAgentTask(id, "task-old", "Old Work");
    useAgentStore.getState().restartAgent(id);
    const agent = useAgentStore.getState().agents[id];
    expect(agent.currentTaskId).toBeNull();
    expect(agent.currentTaskTitle).toBeNull();
  });

  // 7a-35
  it("restartAgent emits agent.restarted event with prev_status and prev_task_id", () => {
    const id = registerAgent("agent-rst-4");
    useAgentStore.getState().startAgentTask(id, "task-current", "Current Task");
    const prevStatus = useAgentStore.getState().agents[id].status;
    useAgentStore.getState().restartAgent(id);
    const evt = lastEvent();
    expect(evt.type).toBe("agent.restarted");
    expect(evt.payload.prev_status).toBe(prevStatus);
    expect(evt.payload.prev_task_id).toBe("task-current");
    expect(evt.agentId).toBe(id);
  });

  // 7a-36
  it("restartAgent can restart a terminated agent (unlike pauseAgent)", () => {
    const id = registerAgent("agent-rst-5");
    useAgentStore.getState().stopAgent(id);
    expect(useAgentStore.getState().agents[id].status).toBe("terminated");
    useAgentStore.getState().restartAgent(id);
    expect(useAgentStore.getState().agents[id].status).toBe("idle");
  });

  // 7a-37
  it("restartAgent updates lastStatusChangeTs and lastLifecycleChangeTs", () => {
    const id = registerAgent("agent-rst-6");
    const beforeStatus = useAgentStore.getState().agents[id].lastStatusChangeTs;
    const beforeLifecycle = useAgentStore.getState().agents[id].lastLifecycleChangeTs;
    useAgentStore.getState().restartAgent(id);
    const agent = useAgentStore.getState().agents[id];
    expect(agent.lastStatusChangeTs).toBeGreaterThanOrEqual(beforeStatus);
    expect(agent.lastLifecycleChangeTs).toBeGreaterThanOrEqual(beforeLifecycle);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Event sourcing integrity — AC 7a record transparency
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC 7a — Record transparency: lifecycle events are append-only", () => {
  beforeEach(resetStore);

  // 7a-38
  it("all lifecycle events have a unique ID", () => {
    const id = registerAgent("agent-evt-1");
    useAgentStore.getState().startAgent(id);
    useAgentStore.getState().pauseAgent(id);
    useAgentStore.getState().restartAgent(id);
    useAgentStore.getState().sendAgentCommand(id, "test");
    useAgentStore.getState().stopAgent(id);
    const events = useAgentStore.getState().events;
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // 7a-39
  it("lifecycle events have monotonically increasing timestamps", () => {
    const id = registerAgent("agent-evt-2");
    useAgentStore.getState().startAgent(id);
    useAgentStore.getState().sendAgentCommand(id, "analyze");
    useAgentStore.getState().restartAgent(id);
    const events = useAgentStore.getState().events;
    for (let i = 1; i < events.length; i++) {
      expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
    }
  });

  // 7a-40
  it("all emitted lifecycle event types are valid known types", () => {
    const validTypes = new Set([
      "agent.spawned", "agent.started", "agent.stopped", "agent.paused",
      "agent.restarted", "agent.status_changed", "agent.command_sent",
      "agent.moved", "agent.task_started", "agent.task_completed",
      "agent.heartbeat", "agent.error", "agent.selected", "agent.deselected",
      "agent.despawned", "registry.updated",
    ]);

    const id = registerAgent("agent-evt-3");
    useAgentStore.getState().startAgent(id);
    useAgentStore.getState().sendAgentCommand(id, "audit");
    useAgentStore.getState().restartAgent(id);
    useAgentStore.getState().stopAgent(id);

    for (const evt of useAgentStore.getState().events) {
      expect(validTypes.has(evt.type), `Unknown event type: ${evt.type}`).toBe(true);
    }
  });

  // 7a-41
  it("event log is append-only — earlier events are immutable after new mutations", () => {
    const id = registerAgent("agent-evt-4");
    useAgentStore.getState().startAgent(id);
    const snap = [...useAgentStore.getState().events];

    useAgentStore.getState().sendAgentCommand(id, "test");
    const current = useAgentStore.getState().events;

    // Earlier events must be identical
    for (let i = 0; i < snap.length; i++) {
      expect(current[i].id).toBe(snap[i].id);
      expect(current[i].type).toBe(snap[i].type);
    }
    expect(current.length).toBeGreaterThan(snap.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// deriveStatusFromLifecycle — utility function
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC 7a — deriveStatusFromLifecycle utility", () => {
  // 7a-42
  it("initializing lifecycle → inactive status", () => {
    expect(deriveStatusFromLifecycle("initializing", "idle")).toBe("inactive");
  });

  // 7a-43
  it("ready lifecycle → idle status", () => {
    expect(deriveStatusFromLifecycle("ready", "inactive")).toBe("idle");
  });

  // 7a-44
  it("paused lifecycle → idle (non-error) or error (if already error)", () => {
    expect(deriveStatusFromLifecycle("paused", "active")).toBe("idle");
    expect(deriveStatusFromLifecycle("paused", "error")).toBe("error");
  });

  // 7a-45
  it("terminated lifecycle → terminated status", () => {
    expect(deriveStatusFromLifecycle("terminated", "active")).toBe("terminated");
  });

  // 7a-46
  it("crashed lifecycle → error status", () => {
    expect(deriveStatusFromLifecycle("crashed", "idle")).toBe("error");
  });

  // 7a-47
  it("migrating/terminating lifecycle → busy status", () => {
    expect(deriveStatusFromLifecycle("migrating", "idle")).toBe("busy");
    expect(deriveStatusFromLifecycle("terminating", "idle")).toBe("busy");
  });

  // 7a-48
  it("active lifecycle → active status", () => {
    expect(deriveStatusFromLifecycle("active", "idle")).toBe("active");
  });

  // 7a-49
  it("unknown lifecycle state returns current status unchanged", () => {
    // TypeScript would catch invalid enum values, but test runtime safety
    const unknown = "unknown-state" as AgentLifecycleState;
    expect(deriveStatusFromLifecycle(unknown, "busy")).toBe("busy");
  });
});
