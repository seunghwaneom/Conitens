/**
 * agent-scene-load.test.ts — Sub-AC 2c: Scene-load avatar instantiation.
 *
 * Tests the complete pipeline:
 *   agent dataset (AGENT_INITIAL_PLACEMENTS)
 *     → initializeAgents()
 *       → AgentRuntimeState with status="inactive" at 3D world coordinates
 *         → STATUS_CONFIG.inactive material applied by AgentAvatar
 *
 * Coverage:
 *
 *  SECTION 1 — Initial placement completeness
 *    2c-1.1: All 5 seed agents are instantiated after initializeAgents()
 *    2c-1.2: Agent IDs match the seed dataset
 *    2c-1.3: store.initialized becomes true after initializeAgents()
 *    2c-1.4: idempotency — calling initializeAgents() twice is a no-op
 *    2c-1.5: An "agents.initialized" event is appended to the event log
 *    2c-1.6: Individual "agent.placed" events are recorded per agent
 *
 *  SECTION 2 — Initial "inactive" status
 *    2c-2.1: All agents start with status = "inactive"
 *    2c-2.2: All agents start with lifecycleState = "initializing"
 *    2c-2.3: No agent has a currentTaskId on load
 *    2c-2.4: No agent has a currentTaskTitle on load
 *    2c-2.5: isDynamic is false for all static seed agents
 *
 *  SECTION 3 — 3D world coordinate placement
 *    2c-3.1: worldPosition.y > 0 for all agents (placed above floor 0 / floor 1)
 *    2c-3.2: worldPosition values are finite numbers (no NaN / Infinity)
 *    2c-3.3: Each agent's worldPosition is within its room's bounding box
 *    2c-3.4: localPosition x,z values are in [0.15, 0.85] margin range
 *    2c-3.5: Agents in different rooms have distinct world positions
 *    2c-3.6: worldPosition matches computeWorldPosition(room, localPosition)
 *
 *  SECTION 4 — Staggered spawn timing
 *    2c-4.1: spawnTs ≥ now for all agents (placed in the future or present)
 *    2c-4.2: spawnTs is strictly increasing with spawnIndex
 *    2c-4.3: spawnTs delta between consecutive agents ≈ 180 ms (STAGGER_MS)
 *    2c-4.4: spawnIndex values are unique and contiguous (0-based)
 *    2c-4.5: First agent (spawnIndex 0) has spawnTs ≈ the initializeAgents ts
 *
 *  SECTION 5 — Inactive material configuration (STATUS_CONFIG contract)
 *    2c-5.1: STATUS_CONFIG.inactive.opacity = 0.45 (dimmed, not transparent)
 *    2c-5.2: STATUS_CONFIG.inactive.emissiveMul = 0.15 (near-dark glow)
 *    2c-5.3: STATUS_CONFIG.inactive.desatFactor = 0.72 (72% bleached)
 *    2c-5.4: STATUS_CONFIG.inactive.animate = false (no motion)
 *    2c-5.5: "inactive" opacity < "idle" opacity (dormant < waiting)
 *    2c-5.6: "inactive" emissiveMul < "idle" emissiveMul
 *    2c-5.7: "terminated" opacity < "inactive" opacity (most transparent)
 *
 *  SECTION 6 — Seed data alignment
 *    2c-6.1: Each agent's roomId matches its AgentDef.defaultRoom
 *    2c-6.2: Each agent's roomId matches the corresponding seed record
 *    2c-6.3: getExpectedSpawnTs utility matches actual spawnTs values
 *    2c-6.4: computeStaggeredDelay(0) = 0, (1) = 180, (4) = 720
 *    2c-6.5: isInactiveMaterialApplied("inactive") returns true
 *    2c-6.6: isInactiveMaterialApplied("active") returns false
 *    2c-6.7: isInactiveMaterialApplied("idle") returns false
 *
 *  SECTION 7 — reinitializePositions preserves inactive status
 *    2c-7.1: After reinitializePositions(), all agents retain status="inactive"
 *    2c-7.2: World positions are recomputed (not stale) after YAML load
 *    2c-7.3: An "agents.initialized" event is appended on reinitialization
 *
 *  SECTION 8 — SCENE_SPAWN_STAGGER_MS constant
 *    2c-8.1: SCENE_SPAWN_STAGGER_MS = 180
 *    2c-8.2: Matches agent-store.ts's SPAWN_STAGGER_MS value implicitly
 *
 * NOTE: Three.js / R3F hooks (useFrame, Canvas) cannot run headless.
 *       All tests target pure-logic: store actions, constants, and utilities.
 *
 * Test ID scheme:
 *   2c-N.M : Sub-AC 2c, section N, test M
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore } from "../agent-store.js";
import {
  SCENE_SPAWN_STAGGER_MS,
  getExpectedSpawnTs,
  computeStaggeredDelay,
  isInactiveMaterialApplied,
} from "../../hooks/use-agent-scene-loader.js";
import { STATUS_CONFIG } from "../../scene/AgentAvatar.js";
import { AGENT_INITIAL_PLACEMENTS, AGENT_SEED_MAP } from "../../data/agent-seed.js";
import { AGENTS } from "../../data/agents.js";
import { BUILDING } from "../../data/building.js";

// ── Store reset ───────────────────────────────────────────────────────────────

function resetStore() {
  useAgentStore.setState({
    agents: {},
    agentRegistry: Object.fromEntries(AGENTS.map((a) => [a.agentId, a])),
    events: [],
    selectedAgentId: null,
    initialized: false,
    _savedLiveAgents: null,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRoomDef(roomId: string) {
  return BUILDING.rooms.find((r) => r.roomId === roomId);
}

// ── SECTION 1: Initial placement completeness ─────────────────────────────────

describe("Sub-AC 2c: Initial placement completeness (2c-1)", () => {
  beforeEach(() => {
    resetStore();
    useAgentStore.getState().initializeAgents();
  });

  it("2c-1.1: All 5 seed agents are instantiated", () => {
    const agents = useAgentStore.getState().agents;
    expect(Object.keys(agents)).toHaveLength(5);
  });

  it("2c-1.2: Agent IDs match the seed dataset", () => {
    const agents = useAgentStore.getState().agents;
    const agentIds = new Set(Object.keys(agents));
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(agentIds.has(seed.agentId)).toBe(true);
    }
  });

  it("2c-1.3: store.initialized becomes true after initializeAgents()", () => {
    expect(useAgentStore.getState().initialized).toBe(true);
  });

  it("2c-1.4: idempotency — calling initializeAgents() twice is a no-op", () => {
    const agentsBefore = { ...useAgentStore.getState().agents };
    const eventCountBefore = useAgentStore.getState().events.length;

    useAgentStore.getState().initializeAgents();

    const agentsAfter = useAgentStore.getState().agents;
    const eventCountAfter = useAgentStore.getState().events.length;

    // Same agents — no new entries
    expect(Object.keys(agentsAfter)).toHaveLength(Object.keys(agentsBefore).length);
    // No new events recorded
    expect(eventCountAfter).toBe(eventCountBefore);
  });

  it("2c-1.5: An agents.initialized event is appended to the event log", () => {
    const events = useAgentStore.getState().events;
    const initEvent = events.find((e) => e.type === "agents.initialized");
    expect(initEvent).toBeDefined();
    expect(initEvent!.payload.placement_count).toBe(5);
  });

  it("2c-1.6: Individual agent.placed events are recorded per agent", () => {
    const events = useAgentStore.getState().events;
    const placedEvents = events.filter((e) => e.type === "agent.placed");
    expect(placedEvents).toHaveLength(5);

    // Every placed event should record inactive status
    for (const ev of placedEvents) {
      expect(ev.payload.status).toBe("inactive");
    }
  });
});

// ── SECTION 2: Initial "inactive" status ─────────────────────────────────────

describe("Sub-AC 2c: All agents start with inactive status (2c-2)", () => {
  beforeEach(() => {
    resetStore();
    useAgentStore.getState().initializeAgents();
  });

  it("2c-2.1: All agents start with status = 'inactive'", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(agent.status).toBe("inactive");
    }
  });

  it("2c-2.2: All agents start with lifecycleState = 'initializing'", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      expect(agent.lifecycleState).toBe("initializing");
    }
  });

  it("2c-2.3: No agent has a currentTaskId on load", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      expect(agent.currentTaskId).toBeNull();
    }
  });

  it("2c-2.4: No agent has a currentTaskTitle on load", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      expect(agent.currentTaskTitle).toBeNull();
    }
  });

  it("2c-2.5: isDynamic is false for all static seed agents", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      expect(agent.isDynamic).toBe(false);
    }
  });
});

// ── SECTION 3: 3D world coordinate placement ─────────────────────────────────

describe("Sub-AC 2c: Agents placed at designated 3D coordinates (2c-3)", () => {
  beforeEach(() => {
    resetStore();
    useAgentStore.getState().initializeAgents();
  });

  it("2c-3.1: worldPosition.y > 0 for all agents (above ground floor)", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      // All seed agents are on floor 1 (y ≥ 3)
      expect(agent.worldPosition.y).toBeGreaterThanOrEqual(3);
    }
  });

  it("2c-3.2: worldPosition values are finite numbers", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      expect(isFinite(agent.worldPosition.x)).toBe(true);
      expect(isFinite(agent.worldPosition.y)).toBe(true);
      expect(isFinite(agent.worldPosition.z)).toBe(true);
    }
  });

  it("2c-3.3: Each agent's worldPosition is within its room's bounding box", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      const room = getRoomDef(agent.roomId);
      expect(room).toBeDefined();
      if (!room) continue;

      const { x, y, z } = agent.worldPosition;
      // x: [room.position.x, room.position.x + room.dimensions.x]
      expect(x).toBeGreaterThanOrEqual(room.position.x - 0.001);
      expect(x).toBeLessThanOrEqual(room.position.x + room.dimensions.x + 0.001);
      // y: [room.position.y, room.position.y + room.dimensions.y]
      expect(y).toBeGreaterThanOrEqual(room.position.y - 0.001);
      expect(y).toBeLessThanOrEqual(room.position.y + room.dimensions.y + 0.001);
      // z: [room.position.z, room.position.z + room.dimensions.z]
      expect(z).toBeGreaterThanOrEqual(room.position.z - 0.001);
      expect(z).toBeLessThanOrEqual(room.position.z + room.dimensions.z + 0.001);
    }
  });

  it("2c-3.4: localPosition x,z values are in [0.15, 0.85] margin range (single-agent rooms)", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    // Single-agent rooms get center position (0.5, 0, 0.5) — within [0.15, 0.85]
    for (const agent of agents) {
      expect(agent.localPosition.x).toBeGreaterThanOrEqual(0.15);
      expect(agent.localPosition.x).toBeLessThanOrEqual(0.85);
      expect(agent.localPosition.z).toBeGreaterThanOrEqual(0.15);
      expect(agent.localPosition.z).toBeLessThanOrEqual(0.85);
    }
  });

  it("2c-3.5: Agents in different rooms have distinct world positions", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    const posKeys = agents.map(
      (a) => `${a.worldPosition.x.toFixed(2)},${a.worldPosition.y.toFixed(2)},${a.worldPosition.z.toFixed(2)}`
    );
    // All 5 agents are in separate rooms — positions must be distinct
    expect(new Set(posKeys).size).toBe(posKeys.length);
  });

  it("2c-3.6: worldPosition matches computeWorldPosition formula", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      const room = getRoomDef(agent.roomId);
      expect(room).toBeDefined();
      if (!room) continue;

      const expectedX = room.position.x + agent.localPosition.x * room.dimensions.x;
      const expectedY = room.position.y + agent.localPosition.y * room.dimensions.y;
      const expectedZ = room.position.z + agent.localPosition.z * room.dimensions.z;

      expect(agent.worldPosition.x).toBeCloseTo(expectedX, 5);
      expect(agent.worldPosition.y).toBeCloseTo(expectedY, 5);
      expect(agent.worldPosition.z).toBeCloseTo(expectedZ, 5);
    }
  });
});

// ── SECTION 4: Staggered spawn timing ────────────────────────────────────────

describe("Sub-AC 2c: Staggered spawn timing for dormant appearance (2c-4)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("2c-4.1: spawnTs ≥ time of initializeAgents() call for all agents", () => {
    const before = Date.now();
    useAgentStore.getState().initializeAgents();
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      expect(agent.spawnTs).toBeGreaterThanOrEqual(before);
    }
  });

  it("2c-4.2: spawnTs is strictly increasing with spawnIndex", () => {
    useAgentStore.getState().initializeAgents();
    const agents = Object.values(useAgentStore.getState().agents)
      .sort((a, b) => a.spawnIndex - b.spawnIndex);

    for (let i = 1; i < agents.length; i++) {
      expect(agents[i].spawnTs).toBeGreaterThan(agents[i - 1].spawnTs);
    }
  });

  it("2c-4.3: spawnTs delta between consecutive agents ≈ 180 ms", () => {
    useAgentStore.getState().initializeAgents();
    const agents = Object.values(useAgentStore.getState().agents)
      .sort((a, b) => a.spawnIndex - b.spawnIndex);

    for (let i = 1; i < agents.length; i++) {
      const delta = agents[i].spawnTs - agents[i - 1].spawnTs;
      // Allow ±5 ms tolerance for timing imprecision
      expect(delta).toBeCloseTo(SCENE_SPAWN_STAGGER_MS, -1);
    }
  });

  it("2c-4.4: spawnIndex values are unique and contiguous from 0", () => {
    useAgentStore.getState().initializeAgents();
    const agents = Object.values(useAgentStore.getState().agents);
    const indices = agents.map((a) => a.spawnIndex).sort((a, b) => a - b);

    // Unique
    expect(new Set(indices).size).toBe(indices.length);
    // Contiguous from 0
    expect(indices[0]).toBe(0);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBe(indices[i - 1] + 1);
    }
  });

  it("2c-4.5: First agent (spawnIndex 0) has spawnTs ≈ initializeAgents() timestamp", () => {
    const before = Date.now();
    useAgentStore.getState().initializeAgents();
    const after = Date.now();

    const agents = Object.values(useAgentStore.getState().agents);
    const first = agents.find((a) => a.spawnIndex === 0);
    expect(first).toBeDefined();
    // spawnIndex 0 → spawnTs = now + 0 * 180 = now
    expect(first!.spawnTs).toBeGreaterThanOrEqual(before);
    expect(first!.spawnTs).toBeLessThanOrEqual(after + 5); // +5 ms tolerance
  });
});

// ── SECTION 5: Inactive material configuration ────────────────────────────────

describe("Sub-AC 2c: Inactive material shader config for dormant appearance (2c-5)", () => {
  // STATUS_CONFIG is a pure constant — no store needed for these tests

  it("2c-5.1: STATUS_CONFIG.inactive.opacity = 0.45", () => {
    expect(STATUS_CONFIG.inactive.opacity).toBe(0.45);
  });

  it("2c-5.2: STATUS_CONFIG.inactive.emissiveMul = 0.15", () => {
    expect(STATUS_CONFIG.inactive.emissiveMul).toBe(0.15);
  });

  it("2c-5.3: STATUS_CONFIG.inactive.desatFactor = 0.72", () => {
    expect(STATUS_CONFIG.inactive.desatFactor).toBe(0.72);
  });

  it("2c-5.4: STATUS_CONFIG.inactive.animate = false (no motion on load)", () => {
    expect(STATUS_CONFIG.inactive.animate).toBe(false);
  });

  it("2c-5.5: 'inactive' opacity < 'idle' opacity (dormant is dimmer than waiting)", () => {
    expect(STATUS_CONFIG.inactive.opacity).toBeLessThan(STATUS_CONFIG.idle.opacity);
  });

  it("2c-5.6: 'inactive' emissiveMul < 'idle' emissiveMul", () => {
    expect(STATUS_CONFIG.inactive.emissiveMul).toBeLessThan(STATUS_CONFIG.idle.emissiveMul);
  });

  it("2c-5.7: 'terminated' opacity < 'inactive' opacity (terminated is most transparent)", () => {
    expect(STATUS_CONFIG.terminated.opacity).toBeLessThan(STATUS_CONFIG.inactive.opacity);
  });

  it("2c-5.8: inactive material is the lowest-emissive non-terminated state", () => {
    // inactive should have less emissive than idle, active, busy, error
    const others = ["idle", "active", "busy", "error"] as const;
    for (const s of others) {
      expect(STATUS_CONFIG.inactive.emissiveMul).toBeLessThan(STATUS_CONFIG[s].emissiveMul);
    }
  });

  it("2c-5.9: inactive opacity is < 0.6 (clearly dimmed — visually 'not running')", () => {
    expect(STATUS_CONFIG.inactive.opacity).toBeLessThan(0.6);
  });

  it("2c-5.10: inactive desatFactor ≥ 0.5 (significant colour bleaching toward grey)", () => {
    expect(STATUS_CONFIG.inactive.desatFactor).toBeGreaterThanOrEqual(0.5);
  });
});

// ── SECTION 6: Seed data alignment & hook utilities ───────────────────────────

describe("Sub-AC 2c: Seed data alignment and utility exports (2c-6)", () => {
  beforeEach(() => {
    resetStore();
    useAgentStore.getState().initializeAgents();
  });

  it("2c-6.1: Each agent's roomId matches AgentDef.defaultRoom", () => {
    const agents = useAgentStore.getState().agents;
    for (const agent of Object.values(agents)) {
      expect(agent.roomId).toBe(agent.def.defaultRoom);
    }
  });

  it("2c-6.2: Each agent's roomId matches the corresponding seed record", () => {
    const agents = useAgentStore.getState().agents;
    for (const agent of Object.values(agents)) {
      const seed = AGENT_SEED_MAP[agent.def.agentId];
      if (seed) {
        expect(agent.roomId).toBe(seed.roomId);
      }
    }
  });

  it("2c-6.3: getExpectedSpawnTs(baseTs, 0) = baseTs", () => {
    const base = 1000000;
    expect(getExpectedSpawnTs(base, 0)).toBe(base);
  });

  it("2c-6.3b: getExpectedSpawnTs(baseTs, 3) = baseTs + 3 * 180", () => {
    const base = 1000000;
    expect(getExpectedSpawnTs(base, 3)).toBe(base + 3 * SCENE_SPAWN_STAGGER_MS);
  });

  it("2c-6.4: computeStaggeredDelay(0) = 0", () => {
    expect(computeStaggeredDelay(0)).toBe(0);
  });

  it("2c-6.4b: computeStaggeredDelay(1) = 180", () => {
    expect(computeStaggeredDelay(1)).toBe(SCENE_SPAWN_STAGGER_MS);
  });

  it("2c-6.4c: computeStaggeredDelay(4) = 720", () => {
    expect(computeStaggeredDelay(4)).toBe(4 * SCENE_SPAWN_STAGGER_MS);
  });

  it("2c-6.5: isInactiveMaterialApplied('inactive') returns true", () => {
    expect(isInactiveMaterialApplied("inactive")).toBe(true);
  });

  it("2c-6.6: isInactiveMaterialApplied('active') returns false", () => {
    expect(isInactiveMaterialApplied("active")).toBe(false);
  });

  it("2c-6.7: isInactiveMaterialApplied('idle') returns false", () => {
    expect(isInactiveMaterialApplied("idle")).toBe(false);
  });

  it("2c-6.8: isInactiveMaterialApplied('terminated') returns false", () => {
    // terminated has lower opacity/emissive than inactive — different config
    expect(isInactiveMaterialApplied("terminated")).toBe(false);
  });

  it("2c-6.9: isInactiveMaterialApplied('busy') returns false", () => {
    expect(isInactiveMaterialApplied("busy")).toBe(false);
  });

  it("2c-6.10: isInactiveMaterialApplied('unknown-status') returns false (graceful)", () => {
    expect(isInactiveMaterialApplied("unknown-status")).toBe(false);
  });
});

// ── SECTION 7: reinitializePositions preserves inactive status ─────────────────

describe("Sub-AC 2c: reinitializePositions preserves dormant state (2c-7)", () => {
  beforeEach(() => {
    resetStore();
    useAgentStore.getState().initializeAgents();
  });

  it("2c-7.1: All agents retain status='inactive' after reinitializePositions()", () => {
    useAgentStore.getState().reinitializePositions(BUILDING);
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      expect(agent.status).toBe("inactive");
    }
  });

  it("2c-7.2: World positions are recomputed and valid after reinitializePositions()", () => {
    useAgentStore.getState().reinitializePositions(BUILDING);
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      expect(isFinite(agent.worldPosition.x)).toBe(true);
      expect(isFinite(agent.worldPosition.y)).toBe(true);
      expect(isFinite(agent.worldPosition.z)).toBe(true);
      expect(agent.worldPosition.y).toBeGreaterThanOrEqual(3); // floor 1
    }
  });

  it("2c-7.3: An agents.initialized event is appended on reinitializePositions()", () => {
    const eventsBefore = useAgentStore.getState().events.length;
    useAgentStore.getState().reinitializePositions(BUILDING);
    const eventsAfter = useAgentStore.getState().events;
    const reinitEvents = eventsAfter
      .slice(eventsBefore)
      .filter((e) => e.type === "agents.initialized");
    expect(reinitEvents).toHaveLength(1);
  });

  it("2c-7.4: lifecycleState is preserved after reinitializePositions()", () => {
    useAgentStore.getState().reinitializePositions(BUILDING);
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      // Status starts as "inactive" / lifecycle starts as "initializing"
      // reinitializePositions only touches positions — not lifecycle
      expect(agent.lifecycleState).toBe("initializing");
    }
  });
});

// ── SECTION 8: SCENE_SPAWN_STAGGER_MS constant ───────────────────────────────

describe("Sub-AC 2c: SCENE_SPAWN_STAGGER_MS timing constant (2c-8)", () => {
  it("2c-8.1: SCENE_SPAWN_STAGGER_MS = 180", () => {
    expect(SCENE_SPAWN_STAGGER_MS).toBe(180);
  });

  it("2c-8.2: 5 agents span 4 × 180 ms = 720 ms total stagger window", () => {
    // First agent fades at t=0, last at t=720 ms
    const totalWindow = (AGENT_INITIAL_PLACEMENTS.length - 1) * SCENE_SPAWN_STAGGER_MS;
    expect(totalWindow).toBe(720);
  });

  it("2c-8.3: stagger window is < 1 second (fast enough to feel simultaneous)", () => {
    const totalWindow = (AGENT_INITIAL_PLACEMENTS.length - 1) * SCENE_SPAWN_STAGGER_MS;
    expect(totalWindow).toBeLessThan(1000);
  });
});

// ── SECTION 9: Full agent dataset coverage ────────────────────────────────────

describe("Sub-AC 2c: Full agent dataset coverage after scene load (2c-9)", () => {
  const EXPECTED_AGENTS = [
    { agentId: "manager-default",      roomId: "ops-control",       role: "orchestrator" },
    { agentId: "implementer-subagent", roomId: "impl-office",        role: "implementer"  },
    { agentId: "researcher-subagent",  roomId: "research-lab",       role: "researcher"   },
    { agentId: "validator-sentinel",   roomId: "validation-office",  role: "validator"    },
    { agentId: "frontend-reviewer",    roomId: "review-office",      role: "reviewer"     },
  ] as const;

  beforeEach(() => {
    resetStore();
    useAgentStore.getState().initializeAgents();
  });

  for (const expected of EXPECTED_AGENTS) {
    it(`2c-9.x: ${expected.agentId} placed in ${expected.roomId} as inactive`, () => {
      const agent = useAgentStore.getState().agents[expected.agentId];
      expect(agent).toBeDefined();
      expect(agent!.status).toBe("inactive");
      expect(agent!.roomId).toBe(expected.roomId);
      expect(agent!.def.role).toBe(expected.role);
    });
  }

  it("2c-9.6: All agents are on floor 1 (operations floor, y ≥ 3)", () => {
    const agents = Object.values(useAgentStore.getState().agents);
    for (const agent of agents) {
      expect(agent.worldPosition.y).toBeGreaterThanOrEqual(3);
    }
  });

  it("2c-9.7: manager-default is at worldPosition ≈ (6.5, 3.0, 2.0)", () => {
    const agent = useAgentStore.getState().agents["manager-default"];
    expect(agent).toBeDefined();
    // Single agent in ops-control — center position (0.5, 0, 0.5) of the room
    // Room: position {x:4, y:3, z:0}, dimensions {x:5, y:3, z:4}
    // worldX = 4 + 0.5*5 = 6.5, worldY = 3 + 0*3 = 3, worldZ = 0 + 0.5*4 = 2
    expect(agent!.worldPosition.x).toBeCloseTo(6.5, 1);
    expect(agent!.worldPosition.y).toBeCloseTo(3.0, 1);
    expect(agent!.worldPosition.z).toBeCloseTo(2.0, 1);
  });
});
