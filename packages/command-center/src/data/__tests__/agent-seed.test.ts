/**
 * agent-seed.test.ts — Unit tests for Sub-AC 2a
 *
 * Validates:
 *   1. Seed dataset completeness — all 5 static agents are represented
 *   2. Room assignment correctness — each agent maps to the expected room/floor
 *   3. Position validity — localPosition within [0,1] bounds, worldPosition consistent
 *   4. Inactive state flags — all seeds start inactive; flags are correctly typed
 *   5. Spawn index ordering — spawnIndex is unique and 0-based
 *   6. Lookup helpers — getAgentSeed, getSeedForRoom, getSeedForFloor, etc.
 *   7. World position computation — computeWorldFromLocal matches stored worldPosition
 *   8. Summary formatters — produce non-empty strings without throwing
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_INITIAL_PLACEMENTS,
  AGENT_SEED_MAP,
  ROOM_SEED_MAP,
  getAgentSeed,
  getSeedForRoom,
  getSeedForFloor,
  getConfirmationRequiredSeeds,
  getAutoActivateSeeds,
  computeWorldFromLocal,
  validateSeedWorldPosition,
  formatSeedSummary,
  formatSeedDatasetSummary,
  type AgentSeedRecord,
} from "../agent-seed.js";

import { BUILDING } from "../building.js";
import { AGENTS } from "../agents.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function getRoomDef(roomId: string) {
  return BUILDING.rooms.find((r) => r.roomId === roomId);
}

// ── 1. Dataset completeness ───────────────────────────────────────────────

describe("AGENT_INITIAL_PLACEMENTS — completeness", () => {
  it("contains an entry for every static agent in AGENTS", () => {
    const seedIds = new Set(AGENT_INITIAL_PLACEMENTS.map((s) => s.agentId));
    for (const agent of AGENTS) {
      expect(seedIds.has(agent.agentId)).toBe(true);
    }
  });

  it("has exactly 5 seed records (one per static agent)", () => {
    expect(AGENT_INITIAL_PLACEMENTS).toHaveLength(5);
  });

  it("contains no duplicate agentId entries", () => {
    const ids = AGENT_INITIAL_PLACEMENTS.map((s) => s.agentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(AGENT_INITIAL_PLACEMENTS)).toBe(true);
  });
});

// ── 2. Room assignment correctness ────────────────────────────────────────

describe("AGENT_INITIAL_PLACEMENTS — room/floor mapping", () => {
  const expectedAssignments: Record<string, { roomId: string; floor: number }> = {
    "manager-default":      { roomId: "ops-control",        floor: 1 },
    "implementer-subagent": { roomId: "impl-office",         floor: 1 },
    "researcher-subagent":  { roomId: "research-lab",        floor: 1 },
    "validator-sentinel":   { roomId: "validation-office",   floor: 1 },
    "frontend-reviewer":    { roomId: "review-office",       floor: 1 },
  };

  for (const [agentId, expected] of Object.entries(expectedAssignments)) {
    it(`${agentId} is assigned to ${expected.roomId} on floor ${expected.floor}`, () => {
      const seed = AGENT_SEED_MAP[agentId];
      expect(seed).toBeDefined();
      expect(seed!.roomId).toBe(expected.roomId);
      expect(seed!.floor).toBe(expected.floor);
    });
  }

  it("all seeded rooms exist in BUILDING.rooms", () => {
    const buildingRoomIds = new Set(BUILDING.rooms.map((r) => r.roomId));
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(buildingRoomIds.has(seed.roomId)).toBe(true);
    }
  });

  it("each seed's officeType matches the room's roomType in BUILDING", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      const room = getRoomDef(seed.roomId);
      expect(room).toBeDefined();
      expect(seed.officeType).toBe(room!.roomType);
    }
  });
});

// ── 3. Position validity ──────────────────────────────────────────────────

describe("AgentInitialPosition — local position bounds", () => {
  it("all localPosition values are within [0, 1]", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      const { x, y, z } = seed.position.localPosition;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(1);
    }
  });

  it("all agents are at floor level (localPosition.y === 0)", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(seed.position.localPosition.y).toBe(0);
    }
  });
});

describe("AgentInitialPosition — world position consistency", () => {
  it("stored worldPosition matches computed position within tolerance=0.001", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      const room = getRoomDef(seed.roomId);
      expect(room).toBeDefined();
      const isValid = validateSeedWorldPosition(seed, room!.position, room!.dimensions);
      expect(isValid).toBe(true);
    }
  });

  it("computeWorldFromLocal matches expected formula", () => {
    const local = { x: 0.5, y: 0, z: 0.5 };
    const roomPos = { x: 4, y: 3, z: 0 };
    const roomDims = { x: 5, y: 3, z: 4 };
    const result = computeWorldFromLocal(local, roomPos, roomDims);
    expect(result.x).toBeCloseTo(6.5);
    expect(result.y).toBeCloseTo(3.0);
    expect(result.z).toBeCloseTo(2.0);
  });

  it("manager worldPosition is (6.5, 3.0, 2.0)", () => {
    const seed = AGENT_SEED_MAP["manager-default"]!;
    expect(seed.position.worldPosition.x).toBeCloseTo(6.5);
    expect(seed.position.worldPosition.y).toBeCloseTo(3.0);
    expect(seed.position.worldPosition.z).toBeCloseTo(2.0);
  });

  it("implementer worldPosition is (1.0, 3.0, 1.5)", () => {
    const seed = AGENT_SEED_MAP["implementer-subagent"]!;
    expect(seed.position.worldPosition.x).toBeCloseTo(1.0);
    expect(seed.position.worldPosition.y).toBeCloseTo(3.0);
    expect(seed.position.worldPosition.z).toBeCloseTo(1.5);
  });

  it("researcher worldPosition is (2.0, 3.0, 4.5)", () => {
    const seed = AGENT_SEED_MAP["researcher-subagent"]!;
    expect(seed.position.worldPosition.x).toBeCloseTo(2.0);
    expect(seed.position.worldPosition.y).toBeCloseTo(3.0);
    expect(seed.position.worldPosition.z).toBeCloseTo(4.5);
  });

  it("validator worldPosition is (10.5, 3.0, 1.5)", () => {
    const seed = AGENT_SEED_MAP["validator-sentinel"]!;
    expect(seed.position.worldPosition.x).toBeCloseTo(10.5);
    expect(seed.position.worldPosition.y).toBeCloseTo(3.0);
    expect(seed.position.worldPosition.z).toBeCloseTo(1.5);
  });

  it("frontend-reviewer worldPosition is (10.5, 3.0, 4.5)", () => {
    const seed = AGENT_SEED_MAP["frontend-reviewer"]!;
    expect(seed.position.worldPosition.x).toBeCloseTo(10.5);
    expect(seed.position.worldPosition.y).toBeCloseTo(3.0);
    expect(seed.position.worldPosition.z).toBeCloseTo(4.5);
  });
});

// ── 4. Inactive state flags ───────────────────────────────────────────────

describe("AgentInactiveStateFlags — initial state", () => {
  it("all seeds have initialStatus === 'inactive'", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(seed.initialStatus).toBe("inactive");
    }
  });

  it("all seeds have initialLifecycleState === 'initializing'", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(seed.initialLifecycleState).toBe("initializing");
    }
  });

  it("all inactiveFlags.isInactive === true", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(seed.inactiveFlags.isInactive).toBe(true);
    }
  });

  it("all inactiveFlags.canBeActivated === true (all static agents support activation)", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(seed.inactiveFlags.canBeActivated).toBe(true);
    }
  });

  it("manager-default requires confirmation (high-impact orchestrator)", () => {
    expect(AGENT_SEED_MAP["manager-default"]!.inactiveFlags.requiresConfirmation).toBe(true);
  });

  it("validator-sentinel requires confirmation (controls release gates)", () => {
    expect(AGENT_SEED_MAP["validator-sentinel"]!.inactiveFlags.requiresConfirmation).toBe(true);
  });

  it("implementer-subagent does NOT require confirmation", () => {
    expect(AGENT_SEED_MAP["implementer-subagent"]!.inactiveFlags.requiresConfirmation).toBe(false);
  });

  it("researcher-subagent does NOT require confirmation", () => {
    expect(AGENT_SEED_MAP["researcher-subagent"]!.inactiveFlags.requiresConfirmation).toBe(false);
  });

  it("frontend-reviewer does NOT require confirmation", () => {
    expect(AGENT_SEED_MAP["frontend-reviewer"]!.inactiveFlags.requiresConfirmation).toBe(false);
  });

  it("implementer, researcher, frontend-reviewer auto-activate on task", () => {
    const autoActivate = ["implementer-subagent", "researcher-subagent", "frontend-reviewer"];
    for (const id of autoActivate) {
      expect(AGENT_SEED_MAP[id]!.inactiveFlags.autoActivateOnTask).toBe(true);
    }
  });

  it("manager and validator do NOT auto-activate on task", () => {
    const manualOnly = ["manager-default", "validator-sentinel"];
    for (const id of manualOnly) {
      expect(AGENT_SEED_MAP[id]!.inactiveFlags.autoActivateOnTask).toBe(false);
    }
  });

  it("all inactiveReason strings are non-empty", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(seed.inactiveFlags.inactiveReason.length).toBeGreaterThan(0);
    }
  });
});

// ── 5. Spawn index ordering ───────────────────────────────────────────────

describe("AgentSeedRecord — spawnIndex ordering", () => {
  it("spawnIndex values are unique", () => {
    const indices = AGENT_INITIAL_PLACEMENTS.map((s) => s.spawnIndex);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("spawnIndex values are 0-based and contiguous", () => {
    const indices = AGENT_INITIAL_PLACEMENTS.map((s) => s.spawnIndex).sort((a, b) => a - b);
    expect(indices[0]).toBe(0);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBe(indices[i - 1] + 1);
    }
  });

  it("manager has spawnIndex 0 (first to appear)", () => {
    expect(AGENT_SEED_MAP["manager-default"]!.spawnIndex).toBe(0);
  });
});

// ── 6. Lookup helpers ─────────────────────────────────────────────────────

describe("getAgentSeed()", () => {
  it("returns seed record for known agent", () => {
    const seed = getAgentSeed("manager-default");
    expect(seed).toBeDefined();
    expect(seed!.agentId).toBe("manager-default");
  });

  it("returns undefined for unknown agent", () => {
    expect(getAgentSeed("nonexistent-agent")).toBeUndefined();
  });
});

describe("getSeedForRoom()", () => {
  it("returns all agents in ops-control (manager)", () => {
    const seeds = getSeedForRoom("ops-control");
    expect(seeds).toHaveLength(1);
    expect(seeds[0].agentId).toBe("manager-default");
  });

  it("returns all agents in impl-office (implementer)", () => {
    const seeds = getSeedForRoom("impl-office");
    expect(seeds).toHaveLength(1);
    expect(seeds[0].agentId).toBe("implementer-subagent");
  });

  it("returns empty array for corridor rooms (no agents)", () => {
    const seeds = getSeedForRoom("corridor-main");
    expect(seeds).toHaveLength(0);
  });

  it("returns empty array for unknown room", () => {
    const seeds = getSeedForRoom("does-not-exist");
    expect(seeds).toHaveLength(0);
  });
});

describe("getSeedForFloor()", () => {
  it("all seeded agents are on floor 1 (operations floor)", () => {
    const floor1 = getSeedForFloor(1);
    expect(floor1).toHaveLength(5);
  });

  it("floor 0 (ground floor) has no seeded agents", () => {
    const floor0 = getSeedForFloor(0);
    expect(floor0).toHaveLength(0);
  });
});

describe("getConfirmationRequiredSeeds()", () => {
  it("returns exactly 2 agents (manager + validator)", () => {
    const seeds = getConfirmationRequiredSeeds();
    expect(seeds).toHaveLength(2);
  });

  it("contains manager-default and validator-sentinel", () => {
    const ids = getConfirmationRequiredSeeds().map((s) => s.agentId);
    expect(ids).toContain("manager-default");
    expect(ids).toContain("validator-sentinel");
  });
});

describe("getAutoActivateSeeds()", () => {
  it("returns exactly 3 agents (implementer + researcher + frontend-reviewer)", () => {
    const seeds = getAutoActivateSeeds();
    expect(seeds).toHaveLength(3);
  });

  it("contains implementer, researcher, and frontend-reviewer", () => {
    const ids = getAutoActivateSeeds().map((s) => s.agentId);
    expect(ids).toContain("implementer-subagent");
    expect(ids).toContain("researcher-subagent");
    expect(ids).toContain("frontend-reviewer");
  });
});

// ── 7. AGENT_SEED_MAP and ROOM_SEED_MAP ───────────────────────────────────

describe("AGENT_SEED_MAP", () => {
  it("maps every agentId to its seed record", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(AGENT_SEED_MAP[seed.agentId]).toBe(seed);
    }
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(AGENT_SEED_MAP)).toBe(true);
  });
});

describe("ROOM_SEED_MAP", () => {
  it("groups agents by roomId correctly", () => {
    const opsAgents = ROOM_SEED_MAP["ops-control"];
    expect(opsAgents).toBeDefined();
    expect(opsAgents!.length).toBeGreaterThan(0);
    expect(opsAgents![0].roomId).toBe("ops-control");
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(ROOM_SEED_MAP)).toBe(true);
  });
});

// ── 8. Summary formatters ─────────────────────────────────────────────────

describe("formatSeedSummary()", () => {
  it("returns a non-empty string for each seed", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      const summary = formatSeedSummary(seed);
      expect(typeof summary).toBe("string");
      expect(summary.length).toBeGreaterThan(0);
    }
  });

  it("includes the agentId in the summary", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(formatSeedSummary(seed)).toContain(seed.agentId);
    }
  });

  it("includes 'inactive' status in the summary", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(formatSeedSummary(seed)).toContain("inactive");
    }
  });

  it("includes 'confirmRequired' for manager-default", () => {
    const seed = AGENT_SEED_MAP["manager-default"]!;
    expect(formatSeedSummary(seed)).toContain("confirmRequired");
  });

  it("includes 'autoActivate' for implementer-subagent", () => {
    const seed = AGENT_SEED_MAP["implementer-subagent"]!;
    expect(formatSeedSummary(seed)).toContain("autoActivate");
  });
});

describe("formatSeedDatasetSummary()", () => {
  it("returns a non-empty multi-line string", () => {
    const summary = formatSeedDatasetSummary();
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.split("\n").length).toBeGreaterThan(5);
  });

  it("includes the total agent count", () => {
    expect(formatSeedDatasetSummary()).toContain("5 agents");
  });

  it("does not throw", () => {
    expect(() => formatSeedDatasetSummary()).not.toThrow();
  });
});

// ── 9. Furniture slot mapping ─────────────────────────────────────────────

describe("AgentInitialPosition — furnitureSlot", () => {
  it("all seeded agents have a non-null furnitureSlot", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(seed.position.furnitureSlot).not.toBeNull();
      expect(typeof seed.position.furnitureSlot).toBe("string");
    }
  });

  it("manager is at 'command-desk'", () => {
    expect(AGENT_SEED_MAP["manager-default"]!.position.furnitureSlot).toBe("command-desk");
  });

  it("implementer is at 'workstation'", () => {
    expect(AGENT_SEED_MAP["implementer-subagent"]!.position.furnitureSlot).toBe("workstation");
  });

  it("researcher is at 'analysis-desk'", () => {
    expect(AGENT_SEED_MAP["researcher-subagent"]!.position.furnitureSlot).toBe("analysis-desk");
  });

  it("validator is at 'review-desk'", () => {
    expect(AGENT_SEED_MAP["validator-sentinel"]!.position.furnitureSlot).toBe("review-desk");
  });

  it("frontend-reviewer is at 'review-desk'", () => {
    expect(AGENT_SEED_MAP["frontend-reviewer"]!.position.furnitureSlot).toBe("review-desk");
  });
});

// ── 10. Cross-validation with AGENTS ─────────────────────────────────────

describe("Cross-validation: seed ↔ AGENTS ↔ BUILDING", () => {
  it("each seed agentId matches an entry in AGENTS", () => {
    const agentIds = new Set(AGENTS.map((a) => a.agentId));
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(agentIds.has(seed.agentId)).toBe(true);
    }
  });

  it("each seed roomId matches the agent's defaultRoom in AGENTS", () => {
    const agentDefaultRooms = Object.fromEntries(AGENTS.map((a) => [a.agentId, a.defaultRoom]));
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(seed.roomId).toBe(agentDefaultRooms[seed.agentId]);
    }
  });

  it("each seed roomId matches BUILDING.agentAssignments", () => {
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      const buildingAssignment = BUILDING.agentAssignments[seed.agentId];
      if (buildingAssignment !== undefined) {
        expect(seed.roomId).toBe(buildingAssignment);
      }
    }
  });
});
