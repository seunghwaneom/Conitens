/**
 * agent-store-scalable.test.ts — Sub-AC 15a tests
 *
 * Validates:
 *   1. Dynamic agent registry: register / unregister at runtime
 *   2. Per-agent lifecycle tracking (AgentLifecycleState FSM)
 *   3. Grid-based position layout for 3-20 concurrent agents
 *   4. Scalable initialization from a registry (no hardcoded count)
 *   5. Event-sourced audit trail for registry operations
 */
import { describe, it, expect, beforeEach } from "vitest";
import { computeLocalPosition, deriveStatusFromLifecycle, useAgentStore } from "../agent-store.js";
import { createDynamicAgentDef } from "../../data/agents.js";
import type { AgentLifecycleState } from "../../data/agents.js";

// ── Reset store between tests ─────────────────────────────────────

function resetStore() {
  // Re-import creates a fresh module in Vitest; use setState to reset
  useAgentStore.setState({
    agents: {},
    agentRegistry: {},
    events: [],
    selectedAgentId: null,
    initialized: false,
    _savedLiveAgents: null,
  });
}

// ── Helpers ───────────────────────────────────────────────────────

function makeDef(id: string, room = "ops-control") {
  return createDynamicAgentDef(id, `Agent ${id}`, "implementer", room);
}

// ── Test suites ───────────────────────────────────────────────────

describe("computeLocalPosition — scalable grid layout", () => {
  it("returns center for single agent", () => {
    const pos = computeLocalPosition(0, 1);
    expect(pos.x).toBe(0.5);
    expect(pos.z).toBe(0.5);
    expect(pos.y).toBe(0);
  });

  it("2 agents span the x-axis", () => {
    const p0 = computeLocalPosition(0, 2);
    const p1 = computeLocalPosition(1, 2);
    expect(p0.x).toBeLessThan(p1.x);
    // Both within margin bounds
    expect(p0.x).toBeGreaterThanOrEqual(0.15);
    expect(p1.x).toBeLessThanOrEqual(0.85);
  });

  it("4 agents: 2×2 grid — no position repeats", () => {
    const positions = Array.from({ length: 4 }, (_, i) => computeLocalPosition(i, 4));
    const keys = positions.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`);
    expect(new Set(keys).size).toBe(4);
  });

  it("9 agents: 3×3 grid — no overlaps", () => {
    const positions = Array.from({ length: 9 }, (_, i) => computeLocalPosition(i, 9));
    const keys = positions.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`);
    expect(new Set(keys).size).toBe(9);
  });

  it("16 agents: 4×4 grid — no overlaps", () => {
    const positions = Array.from({ length: 16 }, (_, i) => computeLocalPosition(i, 16));
    const keys = positions.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`);
    expect(new Set(keys).size).toBe(16);
  });

  it("20 agents: 5-col grid — no overlaps", () => {
    const positions = Array.from({ length: 20 }, (_, i) => computeLocalPosition(i, 20));
    const keys = positions.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`);
    expect(new Set(keys).size).toBe(20);
  });

  it("all positions within [0.15, 0.85] margin bounds for 20 agents", () => {
    for (let i = 0; i < 20; i++) {
      const p = computeLocalPosition(i, 20);
      expect(p.x).toBeGreaterThanOrEqual(0.15 - 0.001);
      expect(p.x).toBeLessThanOrEqual(0.85 + 0.001);
      expect(p.z).toBeGreaterThanOrEqual(0.15 - 0.001);
      expect(p.z).toBeLessThanOrEqual(0.85 + 0.001);
    }
  });
});

describe("dynamic agent registry — registerAgent", () => {
  beforeEach(resetStore);

  it("adds agent to registry and agents map", () => {
    const def = makeDef("test-agent-1");
    useAgentStore.getState().registerAgent(def);

    const state = useAgentStore.getState();
    expect(state.agentRegistry["test-agent-1"]).toBeDefined();
    expect(state.agents["test-agent-1"]).toBeDefined();
    expect(state.agents["test-agent-1"].isDynamic).toBe(true);
  });

  it("sets lifecycle state to 'initializing' on register", () => {
    const def = makeDef("agent-lc");
    useAgentStore.getState().registerAgent(def);
    expect(useAgentStore.getState().agents["agent-lc"].lifecycleState).toBe("initializing");
  });

  it("emits agent.spawned and registry.updated events", () => {
    const def = makeDef("agent-ev");
    useAgentStore.getState().registerAgent(def);
    const events = useAgentStore.getState().events;
    expect(events.some((e) => e.type === "agent.spawned")).toBe(true);
    expect(events.some((e) => e.type === "registry.updated")).toBe(true);
  });

  it("supports registering 20 agents without errors", () => {
    for (let i = 0; i < 20; i++) {
      const def = makeDef(`batch-agent-${i}`);
      useAgentStore.getState().registerAgent(def);
    }
    expect(useAgentStore.getState().getRegistrySize()).toBe(20);
    expect(Object.keys(useAgentStore.getState().agents).length).toBe(20);
  });

  it("positions 10 agents in same room without overlap", () => {
    for (let i = 0; i < 10; i++) {
      const def = makeDef(`room-agent-${i}`, "impl-office");
      useAgentStore.getState().registerAgent(def, { roomId: "impl-office" });
    }
    const agents = useAgentStore.getState().getAgentsInRoom("impl-office");
    expect(agents.length).toBe(10);

    // No two agents should share the exact same worldPosition
    const posKeys = agents.map((a) =>
      `${a.worldPosition.x.toFixed(3)},${a.worldPosition.z.toFixed(3)}`,
    );
    expect(new Set(posKeys).size).toBe(10);
  });
});

describe("dynamic agent registry — unregisterAgent", () => {
  beforeEach(resetStore);

  it("removes agent from both agents and agentRegistry", () => {
    const def = makeDef("removable");
    useAgentStore.getState().registerAgent(def);
    useAgentStore.getState().unregisterAgent("removable", "test-teardown");

    const state = useAgentStore.getState();
    expect(state.agentRegistry["removable"]).toBeUndefined();
    expect(state.agents["removable"]).toBeUndefined();
  });

  it("emits agent.despawned and registry.updated events", () => {
    useAgentStore.getState().registerAgent(makeDef("agent-dep"));
    useAgentStore.getState().unregisterAgent("agent-dep");

    const events = useAgentStore.getState().events;
    expect(events.some((e) => e.type === "agent.despawned")).toBe(true);
    expect(events.some((e) => e.type === "registry.updated" && e.payload.operation === "unregister")).toBe(true);
  });

  it("deselects agent when unregistered while selected", () => {
    useAgentStore.getState().registerAgent(makeDef("sel-agent"));
    useAgentStore.setState({ selectedAgentId: "sel-agent" });
    useAgentStore.getState().unregisterAgent("sel-agent");
    expect(useAgentStore.getState().selectedAgentId).toBeNull();
  });

  it("is a no-op for unknown agentId", () => {
    const prevEventCount = useAgentStore.getState().events.length;
    useAgentStore.getState().unregisterAgent("nonexistent-agent");
    expect(useAgentStore.getState().events.length).toBe(prevEventCount);
  });

  it("recomputes grid positions for remaining room agents after removal", () => {
    // Add 3 agents to same room
    for (let i = 0; i < 3; i++) {
      useAgentStore.getState().registerAgent(makeDef(`grid-agent-${i}`, "ops-control"), { roomId: "ops-control" });
    }
    // Remove middle agent
    useAgentStore.getState().unregisterAgent("grid-agent-1");

    const remaining = useAgentStore.getState().getAgentsInRoom("ops-control");
    expect(remaining.length).toBe(2);

    // 2 remaining agents should have unique positions
    const posKeys = remaining.map((a) =>
      `${a.localPosition.x.toFixed(3)},${a.localPosition.z.toFixed(3)}`,
    );
    expect(new Set(posKeys).size).toBe(2);
  });
});

describe("per-agent lifecycle tracking — updateAgentLifecycle", () => {
  beforeEach(resetStore);

  it("transitions agent lifecycle state from initializing → ready", () => {
    useAgentStore.getState().registerAgent(makeDef("lc-agent"));
    useAgentStore.getState().updateAgentLifecycle("lc-agent", "ready");

    expect(useAgentStore.getState().agents["lc-agent"].lifecycleState).toBe("ready");
  });

  it("emits agent.lifecycle_changed event with correct payload", () => {
    useAgentStore.getState().registerAgent(makeDef("lc-ev-agent"));
    useAgentStore.getState().updateAgentLifecycle("lc-ev-agent", "ready", {
      trigger: "system_command",
      reason: "test transition",
    });

    const events = useAgentStore.getState().events;
    const lcEvent = events.find((e) => e.type === "agent.lifecycle_changed");
    expect(lcEvent).toBeDefined();
    expect(lcEvent!.payload.prev_state).toBe("initializing");
    expect(lcEvent!.payload.next_state).toBe("ready");
    expect(lcEvent!.payload.trigger).toBe("system_command");
  });

  it("rejects invalid lifecycle transition", () => {
    useAgentStore.getState().registerAgent(makeDef("lc-invalid"));
    // initializing → active is NOT valid (must go through ready first)
    useAgentStore.getState().updateAgentLifecycle("lc-invalid", "active");

    // State should remain initializing
    expect(useAgentStore.getState().agents["lc-invalid"].lifecycleState).toBe("initializing");
  });

  it("derives correct status from lifecycle state", () => {
    expect(deriveStatusFromLifecycle("initializing", "inactive")).toBe("inactive");
    expect(deriveStatusFromLifecycle("ready", "inactive")).toBe("idle");
    expect(deriveStatusFromLifecycle("active", "idle")).toBe("active");
    expect(deriveStatusFromLifecycle("paused", "active")).toBe("idle");
    expect(deriveStatusFromLifecycle("paused", "error")).toBe("error");
    expect(deriveStatusFromLifecycle("terminated", "active")).toBe("terminated");
    expect(deriveStatusFromLifecycle("crashed", "active")).toBe("error");
    expect(deriveStatusFromLifecycle("migrating", "active")).toBe("busy");
  });

  it("clears task on terminal lifecycle transition", () => {
    useAgentStore.getState().registerAgent(makeDef("lc-terminal"));
    // Transition to ready first
    useAgentStore.getState().updateAgentLifecycle("lc-terminal", "ready");
    // Assign a task manually
    useAgentStore.setState((state) => ({
      agents: {
        ...state.agents,
        "lc-terminal": {
          ...state.agents["lc-terminal"],
          lifecycleState: "active" as AgentLifecycleState,
          currentTaskId: "task-123",
          currentTaskTitle: "some task",
        },
      },
    }));
    // Terminate
    useAgentStore.getState().updateAgentLifecycle("lc-terminal", "terminating");
    useAgentStore.getState().updateAgentLifecycle("lc-terminal", "terminated");

    const agent = useAgentStore.getState().agents["lc-terminal"];
    expect(agent.currentTaskId).toBeNull();
    expect(agent.currentTaskTitle).toBeNull();
  });

  it("full lifecycle FSM: initializing → ready → active → terminating → terminated", () => {
    useAgentStore.getState().registerAgent(makeDef("lc-full"));

    const transitions: AgentLifecycleState[] = ["ready", "active", "terminating", "terminated"];
    for (const state of transitions) {
      useAgentStore.getState().updateAgentLifecycle("lc-full", state);
      expect(useAgentStore.getState().agents["lc-full"].lifecycleState).toBe(state);
    }

    // Should reject further transitions from terminal state
    useAgentStore.getState().updateAgentLifecycle("lc-full", "active");
    expect(useAgentStore.getState().agents["lc-full"].lifecycleState).toBe("terminated");
  });
});

describe("scalable initialization — initializeAgents with registry", () => {
  beforeEach(resetStore);

  it("initializes agents from agentRegistry (not hardcoded AGENTS)", () => {
    // Pre-populate registry with custom agents only
    useAgentStore.setState({
      agentRegistry: {
        "custom-1": makeDef("custom-1"),
        "custom-2": makeDef("custom-2"),
        "custom-3": makeDef("custom-3"),
      },
    });

    useAgentStore.getState().initializeAgents();

    const state = useAgentStore.getState();
    // Should only initialize the 3 registered agents
    expect(Object.keys(state.agents).length).toBe(3);
    expect(state.agents["custom-1"]).toBeDefined();
    expect(state.agents["custom-2"]).toBeDefined();
    expect(state.agents["custom-3"]).toBeDefined();
  });

  it("sets lifecycleState to initializing and isDynamic to false for static agents", () => {
    useAgentStore.setState({
      agentRegistry: { "static-1": makeDef("static-1") },
    });
    useAgentStore.getState().initializeAgents();

    const agent = useAgentStore.getState().agents["static-1"];
    expect(agent.lifecycleState).toBe("initializing");
    expect(agent.isDynamic).toBe(false);
  });

  it("getRegistrySize() returns accurate count", () => {
    for (let i = 0; i < 15; i++) {
      useAgentStore.getState().registerAgent(makeDef(`size-agent-${i}`));
    }
    expect(useAgentStore.getState().getRegistrySize()).toBe(15);
  });

  it("getAgentsSorted() returns agents in spawnIndex order", () => {
    for (let i = 0; i < 5; i++) {
      useAgentStore.getState().registerAgent(makeDef(`sort-agent-${i}`));
    }
    const sorted = useAgentStore.getState().getAgentsSorted();
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].spawnIndex).toBeGreaterThanOrEqual(sorted[i - 1].spawnIndex);
    }
  });
});
