/**
 * agent-ontology-init.test.ts — Sub-AC 3 of AC 2
 *
 * Wire agent ontology to avatar placement on init.
 *
 * Tests the complete ontology-to-placement pipeline:
 *
 *   BUILDING.agentAssignments (building manifest / ontology)
 *     → iterateOntologyAgents()
 *       → OntologyAgentEntry[] (resolved agents with room + def + seed)
 *         → buildAvatarPlacementManifest()
 *           → AvatarPlacementManifest (pre-render readiness source)
 *             → verifyOntologyAgentsPlaced(storeAgents)
 *               → OntologyVerificationResult (allPresent gate)
 *
 * Coverage matrix
 * ───────────────
 *
 * SECTION 1 — iterateOntologyAgents: reading agents from the building ontology
 *   3-1.1: Returns exactly 5 entries (one per agent in agentAssignments, exc. USER)
 *   3-1.2: USER is excluded from the iteration
 *   3-1.3: Each entry has a non-empty agentId
 *   3-1.4: Each entry has a roomId that exists in BUILDING.rooms
 *   3-1.5: Each entry has a resolved agentDef (not undefined)
 *   3-1.6: agentDef.agentId matches the entry.agentId
 *   3-1.7: Entries are sorted alphabetically by agentId
 *   3-1.8: spawnIndex values are 0-based contiguous integers
 *   3-1.9: Each entry's roomId matches the agentAssignment for that agentId
 *   3-1.10: roomDef is resolved for all entries
 *
 * SECTION 2 — getExpectedAgentIds: ontology source of truth
 *   3-2.1: Returns exactly 5 IDs (USER excluded)
 *   3-2.2: USER is not in the returned set
 *   3-2.3: All 5 known agent IDs are present
 *   3-2.4: Returns a Set (for O(1) membership tests)
 *   3-2.5: Contains manager-default
 *   3-2.6: Contains implementer-subagent
 *   3-2.7: Contains researcher-subagent
 *   3-2.8: Contains validator-sentinel
 *   3-2.9: Contains frontend-reviewer
 *
 * SECTION 3 — buildAvatarPlacementManifest: manifest construction
 *   3-3.1: manifest.expectedCount = 5
 *   3-3.2: manifest.entries.length = 5
 *   3-3.3: manifest.expectedAgentIds.size = 5
 *   3-3.4: manifest.buildingId = "command-center"
 *   3-3.5: manifest.skippedIds includes "USER"
 *   3-3.6: manifest.unresolvedIds is empty (all known agents resolve)
 *   3-3.7: entries are frozen (read-only)
 *   3-3.8: seedRecord is defined for all 5 static agents
 *
 * SECTION 4 — verifyOntologyAgentsPlaced: pre-render readiness gate
 *   3-4.1: allPresent = true when all 5 ontology agents are in the store
 *   3-4.2: missing = [] when all are present
 *   3-4.3: presentCount = 5 when all are present
 *   3-4.4: allPresent = false when one agent is missing
 *   3-4.5: missing contains the absent agentId
 *   3-4.6: presentCount = N-1 when one of N agents is absent
 *   3-4.7: allPresent = false when the store is empty
 *   3-4.8: missing.length = 5 when store is empty
 *   3-4.9: extra contains dynamic agent IDs (not in ontology)
 *   3-4.10: extra is empty when no extra agents exist
 *
 * SECTION 5 — assertOntologyAgentsPresent: dev-mode hard assertion
 *   3-5.1: Does not throw when all agents are present
 *   3-5.2: Throws when an agent is missing
 *   3-5.3: Error message includes missing agent ID
 *
 * SECTION 6 — getOntologyRoomForAgent: room lookup
 *   3-6.1: Returns roomDef for manager-default (ops-control)
 *   3-6.2: Returns undefined for an unknown agentId
 *   3-6.3: Returns undefined for USER (filtered)
 *   3-6.4: Room IDs from the manifest match agentAssignments
 *
 * SECTION 7 — Boot sequence integration (ontology → store → verification)
 *   3-7.1: After initializeAgents(), verifyOntologyAgentsPlaced returns allPresent=true
 *   3-7.2: After initializeAgents(), all 5 ontology agents are in the store
 *   3-7.3: Each agent's roomId in the store matches the ontology manifest roomId
 *   3-7.4: All ontology agents have status="inactive" on boot
 *   3-7.5: All ontology agents have lifecycleState="initializing" on boot
 *
 * SECTION 8 — formatManifestSummary: human-readable summary
 *   3-8.1: Summary includes the building ID
 *   3-8.2: Summary includes the agent count
 *   3-8.3: Summary mentions skipped entries
 *
 * Test ID scheme:
 *   3-N.M : Sub-AC 3, section N, test M
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  iterateOntologyAgents,
  getExpectedAgentIds,
  buildAvatarPlacementManifest,
  verifyOntologyAgentsPlaced,
  assertOntologyAgentsPresent,
  getOntologyRoomForAgent,
  formatManifestSummary,
  ONTOLOGY_SKIP_IDS,
  type OntologyAgentEntry,
  type AvatarPlacementManifest,
} from "../agent-ontology-init.js";
import { BUILDING } from "../building.js";
import { AGENTS } from "../agents.js";
import { useAgentStore } from "../../store/agent-store.js";

// ── Expected canonical agent set ───────────────────────────────────────────────

const EXPECTED_AGENT_IDS = [
  "frontend-reviewer",
  "implementer-subagent",
  "manager-default",
  "researcher-subagent",
  "validator-sentinel",
] as const;

const EXPECTED_ROOM_MAP: Record<string, string> = {
  "manager-default":      "ops-control",
  "implementer-subagent": "impl-office",
  "researcher-subagent":  "research-lab",
  "validator-sentinel":   "validation-office",
  "frontend-reviewer":    "review-office",
};

// ── Store reset helper ────────────────────────────────────────────────────────

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

// ── SECTION 1: iterateOntologyAgents ─────────────────────────────────────────

describe("Sub-AC 3-1: iterateOntologyAgents reads agents from the building ontology", () => {
  let entries: OntologyAgentEntry[];

  beforeEach(() => {
    entries = iterateOntologyAgents();
  });

  it("3-1.1: Returns exactly 5 entries (one per agent, USER excluded)", () => {
    expect(entries).toHaveLength(5);
  });

  it("3-1.2: USER is NOT in the returned entries", () => {
    const ids = entries.map((e) => e.agentId);
    expect(ids).not.toContain("USER");
  });

  it("3-1.3: Each entry has a non-empty agentId", () => {
    for (const entry of entries) {
      expect(typeof entry.agentId).toBe("string");
      expect(entry.agentId.length).toBeGreaterThan(0);
    }
  });

  it("3-1.4: Each entry.roomId exists in BUILDING.rooms", () => {
    const roomIds = new Set(BUILDING.rooms.map((r) => r.roomId));
    for (const entry of entries) {
      expect(roomIds.has(entry.roomId)).toBe(true);
    }
  });

  it("3-1.5: Each entry has a resolved agentDef (not undefined)", () => {
    for (const entry of entries) {
      expect(entry.agentDef).toBeDefined();
      expect(typeof entry.agentDef).toBe("object");
    }
  });

  it("3-1.6: agentDef.agentId matches entry.agentId", () => {
    for (const entry of entries) {
      expect(entry.agentDef.agentId).toBe(entry.agentId);
    }
  });

  it("3-1.7: Entries are sorted alphabetically by agentId", () => {
    const ids = entries.map((e) => e.agentId);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("3-1.8: spawnIndex values are 0-based contiguous integers (0, 1, 2, 3, 4)", () => {
    const indices = entries.map((e) => e.spawnIndex).sort((a, b) => a - b);
    expect(indices[0]).toBe(0);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBe(indices[i - 1] + 1);
    }
  });

  it("3-1.9: Each entry.roomId matches BUILDING.agentAssignments for that agentId", () => {
    for (const entry of entries) {
      expect(entry.roomId).toBe(BUILDING.agentAssignments[entry.agentId]);
    }
  });

  it("3-1.10: roomDef is resolved for all entries (not undefined)", () => {
    for (const entry of entries) {
      expect(entry.roomDef).toBeDefined();
      expect(entry.roomDef!.roomId).toBe(entry.roomId);
    }
  });

  it("3-1.11: manager-default is assigned to ops-control", () => {
    const manager = entries.find((e) => e.agentId === "manager-default");
    expect(manager).toBeDefined();
    expect(manager!.roomId).toBe("ops-control");
  });

  it("3-1.12: implementer-subagent is assigned to impl-office", () => {
    const impl = entries.find((e) => e.agentId === "implementer-subagent");
    expect(impl).toBeDefined();
    expect(impl!.roomId).toBe("impl-office");
  });

  it("3-1.13: researcher-subagent is assigned to research-lab", () => {
    const res = entries.find((e) => e.agentId === "researcher-subagent");
    expect(res).toBeDefined();
    expect(res!.roomId).toBe("research-lab");
  });

  it("3-1.14: validator-sentinel is assigned to validation-office", () => {
    const val = entries.find((e) => e.agentId === "validator-sentinel");
    expect(val).toBeDefined();
    expect(val!.roomId).toBe("validation-office");
  });

  it("3-1.15: frontend-reviewer is assigned to review-office", () => {
    const rev = entries.find((e) => e.agentId === "frontend-reviewer");
    expect(rev).toBeDefined();
    expect(rev!.roomId).toBe("review-office");
  });
});

// ── SECTION 2: getExpectedAgentIds ───────────────────────────────────────────

describe("Sub-AC 3-2: getExpectedAgentIds produces the ontology source of truth", () => {
  let expectedIds: Set<string>;

  beforeEach(() => {
    expectedIds = getExpectedAgentIds();
  });

  it("3-2.1: Returns exactly 5 IDs (USER excluded)", () => {
    expect(expectedIds.size).toBe(5);
  });

  it("3-2.2: USER is NOT in the returned set", () => {
    expect(expectedIds.has("USER")).toBe(false);
  });

  it("3-2.3: Returns a Set instance", () => {
    expect(expectedIds instanceof Set).toBe(true);
  });

  it("3-2.4: Contains manager-default", () => {
    expect(expectedIds.has("manager-default")).toBe(true);
  });

  it("3-2.5: Contains implementer-subagent", () => {
    expect(expectedIds.has("implementer-subagent")).toBe(true);
  });

  it("3-2.6: Contains researcher-subagent", () => {
    expect(expectedIds.has("researcher-subagent")).toBe(true);
  });

  it("3-2.7: Contains validator-sentinel", () => {
    expect(expectedIds.has("validator-sentinel")).toBe(true);
  });

  it("3-2.8: Contains frontend-reviewer", () => {
    expect(expectedIds.has("frontend-reviewer")).toBe(true);
  });

  it("3-2.9: All returned IDs are in BUILDING.agentAssignments", () => {
    for (const id of expectedIds) {
      expect(BUILDING.agentAssignments).toHaveProperty(id);
    }
  });

  it("3-2.10: All IDs in agentAssignments (minus ONTOLOGY_SKIP_IDS) are present", () => {
    const fromBuilding = Object.keys(BUILDING.agentAssignments).filter(
      (id) => !ONTOLOGY_SKIP_IDS.has(id),
    );
    for (const id of fromBuilding) {
      expect(expectedIds.has(id)).toBe(true);
    }
  });
});

// ── SECTION 3: buildAvatarPlacementManifest ───────────────────────────────────

describe("Sub-AC 3-3: buildAvatarPlacementManifest constructs the pre-render artifact", () => {
  let manifest: AvatarPlacementManifest;

  beforeEach(() => {
    manifest = buildAvatarPlacementManifest();
  });

  it("3-3.1: manifest.expectedCount = 5", () => {
    expect(manifest.expectedCount).toBe(5);
  });

  it("3-3.2: manifest.entries.length = 5", () => {
    expect(manifest.entries.length).toBe(5);
  });

  it("3-3.3: manifest.expectedAgentIds.size = 5", () => {
    expect(manifest.expectedAgentIds.size).toBe(5);
  });

  it("3-3.4: manifest.buildingId = 'command-center'", () => {
    expect(manifest.buildingId).toBe("command-center");
  });

  it("3-3.5: manifest.skippedIds includes 'USER'", () => {
    expect(manifest.skippedIds).toContain("USER");
  });

  it("3-3.6: manifest.unresolvedIds is empty (all known agents resolve)", () => {
    expect(manifest.unresolvedIds).toHaveLength(0);
  });

  it("3-3.7: manifest.entries is frozen (immutable array)", () => {
    expect(Object.isFrozen(manifest.entries)).toBe(true);
  });

  it("3-3.8: seedRecord is defined for all 5 static agents", () => {
    for (const entry of manifest.entries) {
      // All 5 static agents have seed records; dynamic agents would have undefined
      expect(entry.seedRecord).toBeDefined();
    }
  });

  it("3-3.9: expectedAgentIds contains all 5 expected agent IDs", () => {
    for (const id of EXPECTED_AGENT_IDS) {
      expect(manifest.expectedAgentIds.has(id)).toBe(true);
    }
  });

  it("3-3.10: entries are in alphabetical order by agentId", () => {
    const ids = manifest.entries.map((e) => e.agentId);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it("3-3.11: each entry.roomId matches the canonical expected room", () => {
    for (const entry of manifest.entries) {
      expect(entry.roomId).toBe(EXPECTED_ROOM_MAP[entry.agentId]);
    }
  });
});

// ── SECTION 4: verifyOntologyAgentsPlaced ────────────────────────────────────

describe("Sub-AC 3-4: verifyOntologyAgentsPlaced is the pre-render readiness gate", () => {
  const manifest = buildAvatarPlacementManifest();

  it("3-4.1: allPresent = true when all 5 ontology agents are in the store", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const { agents } = useAgentStore.getState();
    const result = verifyOntologyAgentsPlaced(agents, manifest);
    expect(result.allPresent).toBe(true);
  });

  it("3-4.2: missing = [] when all agents are present", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const { agents } = useAgentStore.getState();
    const result = verifyOntologyAgentsPlaced(agents, manifest);
    expect(result.missing).toHaveLength(0);
  });

  it("3-4.3: presentCount = 5 when all agents are present", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const { agents } = useAgentStore.getState();
    const result = verifyOntologyAgentsPlaced(agents, manifest);
    expect(result.presentCount).toBe(5);
  });

  it("3-4.4: allPresent = false when the store is empty", () => {
    const result = verifyOntologyAgentsPlaced({}, manifest);
    expect(result.allPresent).toBe(false);
  });

  it("3-4.5: missing.length = 5 when store is empty", () => {
    const result = verifyOntologyAgentsPlaced({}, manifest);
    expect(result.missing).toHaveLength(5);
  });

  it("3-4.6: expectedCount = 5", () => {
    const result = verifyOntologyAgentsPlaced({}, manifest);
    expect(result.expectedCount).toBe(5);
  });

  it("3-4.7: allPresent = false when one agent is missing from the store", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const { agents } = useAgentStore.getState();

    // Remove one agent from the agents map (don't change the store — pure function call)
    const agentsWithoutManager = { ...agents };
    delete agentsWithoutManager["manager-default"];

    const result = verifyOntologyAgentsPlaced(agentsWithoutManager, manifest);
    expect(result.allPresent).toBe(false);
  });

  it("3-4.8: missing contains the removed agent ID", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const { agents } = useAgentStore.getState();

    const agentsWithoutManager = { ...agents };
    delete agentsWithoutManager["manager-default"];

    const result = verifyOntologyAgentsPlaced(agentsWithoutManager, manifest);
    expect(result.missing).toContain("manager-default");
  });

  it("3-4.9: presentCount = 4 when one of 5 agents is absent", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const { agents } = useAgentStore.getState();

    const partial = { ...agents };
    delete partial["researcher-subagent"];

    const result = verifyOntologyAgentsPlaced(partial, manifest);
    expect(result.presentCount).toBe(4);
  });

  it("3-4.10: extra is empty when no extra agents exist", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const { agents } = useAgentStore.getState();
    const result = verifyOntologyAgentsPlaced(agents, manifest);
    // Static agents only — no extras
    expect(result.extra).toHaveLength(0);
  });

  it("3-4.11: extra contains agent IDs not in the ontology", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const agents = useAgentStore.getState().agents;

    // Simulate a dynamically-spawned extra agent
    const agentsWithExtra = {
      ...agents,
      "dynamic-agent-99": agents["manager-default"],
    };

    const result = verifyOntologyAgentsPlaced(agentsWithExtra, manifest);
    expect(result.extra).toContain("dynamic-agent-99");
  });

  it("3-4.12: allPresent is false when two agents are missing", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const agents = useAgentStore.getState().agents;

    const partial = { ...agents };
    delete partial["manager-default"];
    delete partial["validator-sentinel"];

    const result = verifyOntologyAgentsPlaced(partial, manifest);
    expect(result.allPresent).toBe(false);
    expect(result.missing).toHaveLength(2);
    expect(result.missing).toContain("manager-default");
    expect(result.missing).toContain("validator-sentinel");
  });
});

// ── SECTION 5: assertOntologyAgentsPresent ────────────────────────────────────

describe("Sub-AC 3-5: assertOntologyAgentsPresent is the dev-mode hard assertion", () => {
  const manifest = buildAvatarPlacementManifest();

  it("3-5.1: Does not throw when all agents are present", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const { agents } = useAgentStore.getState();
    expect(() => assertOntologyAgentsPresent(agents, manifest)).not.toThrow();
  });

  it("3-5.2: Throws when an agent is missing from the store", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const agents = useAgentStore.getState().agents;

    const partial = { ...agents };
    delete partial["manager-default"];

    expect(() => assertOntologyAgentsPresent(partial, manifest)).toThrow();
  });

  it("3-5.3: Error message includes the missing agent ID", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const agents = useAgentStore.getState().agents;

    const partial = { ...agents };
    delete partial["validator-sentinel"];

    let errorMsg = "";
    try {
      assertOntologyAgentsPresent(partial, manifest);
    } catch (e) {
      errorMsg = (e as Error).message;
    }
    expect(errorMsg).toContain("validator-sentinel");
  });

  it("3-5.4: Error message includes presentCount / expectedCount info", () => {
    resetStore();
    useAgentStore.getState().initializeAgents();
    const agents = useAgentStore.getState().agents;

    const partial = { ...agents };
    delete partial["frontend-reviewer"];

    let errorMsg = "";
    try {
      assertOntologyAgentsPresent(partial, manifest);
    } catch (e) {
      errorMsg = (e as Error).message;
    }
    // Should contain "4/5" or "Present: 4/5"
    expect(errorMsg).toContain("4/5");
  });

  it("3-5.5: Throws with empty store (0/5)", () => {
    expect(() => assertOntologyAgentsPresent({}, manifest)).toThrow();
  });
});

// ── SECTION 6: getOntologyRoomForAgent ───────────────────────────────────────

describe("Sub-AC 3-6: getOntologyRoomForAgent provides room lookup from ontology", () => {
  it("3-6.1: Returns roomDef for manager-default → ops-control", () => {
    const room = getOntologyRoomForAgent("manager-default");
    expect(room).toBeDefined();
    expect(room!.roomId).toBe("ops-control");
    expect(room!.name).toBe("Operations Control");
  });

  it("3-6.2: Returns roomDef for implementer-subagent → impl-office", () => {
    const room = getOntologyRoomForAgent("implementer-subagent");
    expect(room).toBeDefined();
    expect(room!.roomId).toBe("impl-office");
  });

  it("3-6.3: Returns roomDef for researcher-subagent → research-lab", () => {
    const room = getOntologyRoomForAgent("researcher-subagent");
    expect(room).toBeDefined();
    expect(room!.roomId).toBe("research-lab");
  });

  it("3-6.4: Returns roomDef for validator-sentinel → validation-office", () => {
    const room = getOntologyRoomForAgent("validator-sentinel");
    expect(room).toBeDefined();
    expect(room!.roomId).toBe("validation-office");
  });

  it("3-6.5: Returns roomDef for frontend-reviewer → review-office", () => {
    const room = getOntologyRoomForAgent("frontend-reviewer");
    expect(room).toBeDefined();
    expect(room!.roomId).toBe("review-office");
  });

  it("3-6.6: Returns undefined for an unknown agentId", () => {
    const room = getOntologyRoomForAgent("nonexistent-agent-xyz");
    expect(room).toBeUndefined();
  });

  it("3-6.7: USER maps to project-main in the ontology", () => {
    // USER is in agentAssignments but is not an agent — getOntologyRoomForAgent
    // still returns its room since we don't filter in this function.
    const room = getOntologyRoomForAgent("USER");
    expect(room).toBeDefined();
    expect(room!.roomId).toBe("project-main");
  });
});

// ── SECTION 7: Boot sequence integration ─────────────────────────────────────

describe("Sub-AC 3-7: Boot sequence — ontology → initializeAgents() → verification", () => {
  beforeEach(() => {
    resetStore();
    useAgentStore.getState().initializeAgents();
  });

  const manifest = buildAvatarPlacementManifest();

  it("3-7.1: After initializeAgents(), verifyOntologyAgentsPlaced returns allPresent=true", () => {
    const { agents } = useAgentStore.getState();
    const result = verifyOntologyAgentsPlaced(agents, manifest);
    expect(result.allPresent).toBe(true);
  });

  it("3-7.2: After initializeAgents(), all 5 ontology agents are in the store", () => {
    const { agents } = useAgentStore.getState();
    for (const id of EXPECTED_AGENT_IDS) {
      expect(agents[id]).toBeDefined();
    }
  });

  it("3-7.3: Each agent's roomId matches the ontology manifest", () => {
    const { agents } = useAgentStore.getState();
    for (const entry of manifest.entries) {
      const agent = agents[entry.agentId];
      expect(agent).toBeDefined();
      expect(agent!.roomId).toBe(entry.roomId);
    }
  });

  it("3-7.4: All ontology agents have status='inactive' on boot", () => {
    const { agents } = useAgentStore.getState();
    for (const id of EXPECTED_AGENT_IDS) {
      expect(agents[id]?.status).toBe("inactive");
    }
  });

  it("3-7.5: All ontology agents have lifecycleState='initializing' on boot", () => {
    const { agents } = useAgentStore.getState();
    for (const id of EXPECTED_AGENT_IDS) {
      expect(agents[id]?.lifecycleState).toBe("initializing");
    }
  });

  it("3-7.6: Each agent's worldPosition is in its ontology-assigned room", () => {
    const { agents } = useAgentStore.getState();
    for (const entry of manifest.entries) {
      const agent = agents[entry.agentId];
      expect(agent).toBeDefined();
      const room = entry.roomDef;
      if (!room) continue;

      const { x, y, z } = agent!.worldPosition;
      // Soft bounding box check (with tiny tolerance for float precision)
      expect(x).toBeGreaterThanOrEqual(room.position.x - 0.01);
      expect(x).toBeLessThanOrEqual(room.position.x + room.dimensions.x + 0.01);
      expect(z).toBeGreaterThanOrEqual(room.position.z - 0.01);
      expect(z).toBeLessThanOrEqual(room.position.z + room.dimensions.z + 0.01);
    }
  });

  it("3-7.7: presentCount in verification matches total ontology count", () => {
    const { agents } = useAgentStore.getState();
    const result = verifyOntologyAgentsPlaced(agents, manifest);
    expect(result.presentCount).toBe(manifest.expectedCount);
  });

  it("3-7.8: missing is empty after a successful boot", () => {
    const { agents } = useAgentStore.getState();
    const result = verifyOntologyAgentsPlaced(agents, manifest);
    expect(result.missing).toHaveLength(0);
  });
});

// ── SECTION 8: formatManifestSummary ─────────────────────────────────────────

describe("Sub-AC 3-8: formatManifestSummary produces a readable debug string", () => {
  const manifest = buildAvatarPlacementManifest();

  it("3-8.1: Summary includes the building ID", () => {
    const summary = formatManifestSummary(manifest);
    expect(summary).toContain("command-center");
  });

  it("3-8.2: Summary includes the expected agent count", () => {
    const summary = formatManifestSummary(manifest);
    expect(summary).toContain("5");
  });

  it("3-8.3: Summary mentions skipped entries (USER)", () => {
    const summary = formatManifestSummary(manifest);
    expect(summary).toContain("USER");
  });

  it("3-8.4: Summary is a non-empty string", () => {
    const summary = formatManifestSummary(manifest);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("3-8.5: Summary contains 'AvatarPlacementManifest' prefix", () => {
    const summary = formatManifestSummary(manifest);
    expect(summary).toContain("AvatarPlacementManifest");
  });
});

// ── SECTION 9: ONTOLOGY_SKIP_IDS constant ────────────────────────────────────

describe("Sub-AC 3-9: ONTOLOGY_SKIP_IDS constant defines non-agent entries", () => {
  it("3-9.1: ONTOLOGY_SKIP_IDS contains 'USER'", () => {
    expect(ONTOLOGY_SKIP_IDS.has("USER")).toBe(true);
  });

  it("3-9.2: ONTOLOGY_SKIP_IDS is a Set", () => {
    expect(ONTOLOGY_SKIP_IDS instanceof Set).toBe(true);
  });

  it("3-9.3: ONTOLOGY_SKIP_IDS does not contain any known agent IDs", () => {
    for (const id of EXPECTED_AGENT_IDS) {
      expect(ONTOLOGY_SKIP_IDS.has(id)).toBe(false);
    }
  });
});

// ── SECTION 10: Stability check — iterating with a custom building ────────────

describe("Sub-AC 3-10: Custom building manifest stability check", () => {
  it("3-10.1: Custom building with one extra assignment produces correct count", () => {
    const customBuilding = {
      ...BUILDING,
      agentAssignments: {
        ...BUILDING.agentAssignments,
        // Add a non-existent agent — should land in unresolvedIds
        "phantom-agent-x": "ops-control",
      },
    };

    const manifest = buildAvatarPlacementManifest(customBuilding);
    // 5 real agents + 1 unresolved (phantom) = still 5 entries
    expect(manifest.expectedCount).toBe(5);
    expect(manifest.unresolvedIds).toContain("phantom-agent-x");
  });

  it("3-10.2: Custom building with USER removed still skips it via ONTOLOGY_SKIP_IDS", () => {
    // When USER is not in agentAssignments, skip-list still works correctly
    const customBuilding = {
      ...BUILDING,
      agentAssignments: Object.fromEntries(
        Object.entries(BUILDING.agentAssignments).filter(([k]) => k !== "USER"),
      ),
    };

    const manifest = buildAvatarPlacementManifest(customBuilding);
    // USER removed from manifest — skipped count should be 0
    expect(manifest.skippedIds).not.toContain("USER");
    expect(manifest.expectedCount).toBe(5); // same 5 agents
  });

  it("3-10.3: iterateOntologyAgents on custom building returns consistent entries", () => {
    const entries = iterateOntologyAgents(BUILDING);
    // Verify the entries are deterministic across calls
    const entries2 = iterateOntologyAgents(BUILDING);
    expect(entries.map((e) => e.agentId)).toEqual(entries2.map((e) => e.agentId));
  });
});
