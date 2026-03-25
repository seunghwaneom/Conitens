/**
 * room-agent-hierarchy.test.ts
 *
 * Unit tests for the building/floor/room/agent hierarchy module.
 *
 * Tests cover:
 *   1. Static DEFAULT_BUILDING_HIERARCHY is complete and internally consistent
 *   2. buildHierarchy() produces correct floor/room/agent tree
 *   3. Query helpers (getFloorNode, getRoomNode, etc.) return correct results
 *   4. validateHierarchyConsistency() passes on valid config
 *   5. validateHierarchyConsistency() catches known error conditions
 *   6. Summary formatters produce non-empty output
 *
 * Run with: node --experimental-vm-modules node_modules/.bin/vitest
 */

import { describe, it, expect } from "vitest";

import {
  DEFAULT_BUILDING_HIERARCHY,
  buildHierarchy,
  getFloorNode,
  getRoomNode,
  getAgentsInRoomNode,
  getRoomForAgentId,
  getRoomsForAgentRole,
  flattenHierarchy,
  getAllAgentsInHierarchy,
  validateHierarchyConsistency,
  formatRoomNodeSummary,
  formatBuildingHierarchySummary,
  type AgentInRoom,
  type RoomHierarchyNode,
  type FloorHierarchyNode,
} from "../room-agent-hierarchy.js";

import { BUILDING } from "../building.js";
import { AGENTS } from "../agents.js";
import { DEFAULT_ROOM_MAPPING } from "../room-mapping-resolver.js";

// ── 1. DEFAULT_BUILDING_HIERARCHY ─────────────────────────────────────────

describe("DEFAULT_BUILDING_HIERARCHY", () => {
  it("has the correct building identity", () => {
    expect(DEFAULT_BUILDING_HIERARCHY.buildingId).toBe("command-center");
    expect(DEFAULT_BUILDING_HIERARCHY.name).toContain("Conitens");
  });

  it("has 2 floors", () => {
    expect(DEFAULT_BUILDING_HIERARCHY.floors).toHaveLength(2);
  });

  it("floors are ordered ground first (0), operations second (1)", () => {
    expect(DEFAULT_BUILDING_HIERARCHY.floors[0].floor).toBe(0);
    expect(DEFAULT_BUILDING_HIERARCHY.floors[1].floor).toBe(1);
  });

  it("totalRooms matches the sum of rooms across floors", () => {
    const sumRooms = DEFAULT_BUILDING_HIERARCHY.floors.reduce(
      (acc, f) => acc + f.rooms.length,
      0,
    );
    expect(DEFAULT_BUILDING_HIERARCHY.totalRooms).toBe(sumRooms);
  });

  it("totalAgents matches AGENTS.length", () => {
    expect(DEFAULT_BUILDING_HIERARCHY.totalAgents).toBe(AGENTS.length);
  });

  it("every agent is placed exactly once across all rooms", () => {
    const all = getAllAgentsInHierarchy();
    const ids = all.map((a) => a.agentId);
    const uniqueIds = new Set(ids);
    // Each agent should appear exactly once
    expect(uniqueIds.size).toBe(AGENTS.length);
    expect(ids.length).toBe(AGENTS.length);
  });

  it("explicitlyAssignedAgentIds matches BUILDING.agentAssignments keys", () => {
    const expected = Object.keys(BUILDING.agentAssignments).sort();
    const actual = [...DEFAULT_BUILDING_HIERARCHY.explicitlyAssignedAgentIds].sort();
    expect(actual).toEqual(expected);
  });
});

// ── 2. buildHierarchy() ───────────────────────────────────────────────────

describe("buildHierarchy()", () => {
  it("produces the same output as DEFAULT_BUILDING_HIERARCHY when called with defaults", () => {
    const built = buildHierarchy();
    expect(built.buildingId).toBe(DEFAULT_BUILDING_HIERARCHY.buildingId);
    expect(built.totalRooms).toBe(DEFAULT_BUILDING_HIERARCHY.totalRooms);
    expect(built.totalAgents).toBe(DEFAULT_BUILDING_HIERARCHY.totalAgents);
  });

  it("places manager-default in ops-control (explicit assignment)", () => {
    const hierarchy = buildHierarchy();
    const opsControl = hierarchy.floors
      .flatMap((f) => f.rooms)
      .find((r) => r.roomId === "ops-control");
    expect(opsControl).toBeDefined();
    const manager = opsControl!.agents.find((a) => a.agentId === "manager-default");
    expect(manager).toBeDefined();
    expect(manager!.assignmentSource).toBe("explicit");
  });

  it("places implementer-subagent in impl-office (explicit assignment)", () => {
    const room = getRoomNode("impl-office");
    expect(room).toBeDefined();
    const agent = room!.agents.find((a) => a.agentId === "implementer-subagent");
    expect(agent).toBeDefined();
    expect(agent!.assignmentSource).toBe("explicit");
  });

  it("places researcher-subagent in research-lab", () => {
    const room = getRoomNode("research-lab");
    expect(room).toBeDefined();
    const agent = room!.agents.find((a) => a.agentId === "researcher-subagent");
    expect(agent).toBeDefined();
  });

  it("places validator-sentinel in validation-office", () => {
    const room = getRoomNode("validation-office");
    expect(room).toBeDefined();
    const agent = room!.agents.find((a) => a.agentId === "validator-sentinel");
    expect(agent).toBeDefined();
  });

  it("places frontend-reviewer in review-office", () => {
    const room = getRoomNode("review-office");
    expect(room).toBeDefined();
    const agent = room!.agents.find((a) => a.agentId === "frontend-reviewer");
    expect(agent).toBeDefined();
  });

  it("corridor rooms have no agents", () => {
    const hierarchy = buildHierarchy();
    const corridors = hierarchy.floors
      .flatMap((f) => f.rooms)
      .filter((r) => r.roomType === "corridor");
    for (const corridor of corridors) {
      expect(corridor.agents).toHaveLength(0);
    }
  });

  it("respects a custom override to relocate an agent", () => {
    const customBuilding = {
      ...BUILDING,
      agentAssignments: {
        ...BUILDING.agentAssignments,
        "researcher-subagent": "archive-vault", // override: move researcher to archive
      },
    };
    const hierarchy = buildHierarchy(customBuilding, AGENTS, DEFAULT_ROOM_MAPPING);

    const archive = hierarchy.floors.flatMap((f) => f.rooms).find((r) => r.roomId === "archive-vault");
    expect(archive).toBeDefined();
    const researcher = archive!.agents.find((a) => a.agentId === "researcher-subagent");
    expect(researcher).toBeDefined();
    expect(researcher!.assignmentSource).toBe("explicit");
  });
});

// ── 3. Query Helpers ──────────────────────────────────────────────────────

describe("getFloorNode()", () => {
  it("returns ground floor (0)", () => {
    const floor = getFloorNode(0);
    expect(floor).toBeDefined();
    expect(floor!.floor).toBe(0);
    expect(floor!.name).toBeDefined();
  });

  it("returns operations floor (1)", () => {
    const floor = getFloorNode(1);
    expect(floor).toBeDefined();
    expect(floor!.floor).toBe(1);
  });

  it("returns undefined for non-existent floor", () => {
    expect(getFloorNode(99)).toBeUndefined();
  });

  it("ground floor has project-main room", () => {
    const floor = getFloorNode(0)!;
    const lobby = floor.rooms.find((r) => r.roomId === "project-main");
    expect(lobby).toBeDefined();
    expect(lobby!.roomType).toBe("lobby");
  });
});

describe("getRoomNode()", () => {
  it("finds ops-control by ID", () => {
    const room = getRoomNode("ops-control");
    expect(room).toBeDefined();
    expect(room!.roomType).toBe("control");
  });

  it("finds project-main by ID", () => {
    const room = getRoomNode("project-main");
    expect(room).toBeDefined();
    expect(room!.roomType).toBe("lobby");
  });

  it("returns undefined for unknown roomId", () => {
    expect(getRoomNode("no-such-room")).toBeUndefined();
  });

  it("each room has a non-empty colorAccent (hex)", () => {
    const flat = Object.values(flattenHierarchy());
    for (const room of flat) {
      expect(room.colorAccent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("getAgentsInRoomNode()", () => {
  it("returns agents in ops-control", () => {
    const agents = getAgentsInRoomNode("ops-control");
    expect(agents.length).toBeGreaterThan(0);
    const agentIds = agents.map((a) => a.agentId);
    expect(agentIds).toContain("manager-default");
  });

  it("returns empty array for corridor-main (no residents)", () => {
    const agents = getAgentsInRoomNode("corridor-main");
    expect(agents).toHaveLength(0);
  });

  it("returns empty array for unknown room", () => {
    expect(getAgentsInRoomNode("ghost-room")).toHaveLength(0);
  });
});

describe("getRoomForAgentId()", () => {
  it("finds the room for manager-default → ops-control", () => {
    const room = getRoomForAgentId("manager-default");
    expect(room).toBeDefined();
    expect(room!.roomId).toBe("ops-control");
  });

  it("finds the room for implementer-subagent → impl-office", () => {
    const room = getRoomForAgentId("implementer-subagent");
    expect(room).toBeDefined();
    expect(room!.roomId).toBe("impl-office");
  });

  it("returns undefined for unknown agentId", () => {
    expect(getRoomForAgentId("ghost-agent-xyz")).toBeUndefined();
  });

  it("each known agent can be looked up by ID", () => {
    for (const agent of AGENTS) {
      const room = getRoomForAgentId(agent.agentId);
      expect(room).toBeDefined();
    }
  });
});

describe("getRoomsForAgentRole()", () => {
  it("returns ops-control for orchestrator role", () => {
    const rooms = getRoomsForAgentRole("orchestrator");
    const ids = rooms.map((r) => r.roomId);
    expect(ids).toContain("ops-control");
  });

  it("returns research-lab for researcher role", () => {
    const rooms = getRoomsForAgentRole("researcher");
    const ids = rooms.map((r) => r.roomId);
    expect(ids).toContain("research-lab");
  });

  it("returns non-empty array for every known role", () => {
    const roles: Array<import("../agents.js").AgentRole> = [
      "orchestrator", "implementer", "researcher", "validator", "reviewer",
    ];
    for (const role of roles) {
      const rooms = getRoomsForAgentRole(role);
      expect(rooms.length).toBeGreaterThan(0);
    }
  });
});

describe("flattenHierarchy()", () => {
  it("returns a map keyed by roomId", () => {
    const map = flattenHierarchy();
    expect(map["ops-control"]).toBeDefined();
    expect(map["project-main"]).toBeDefined();
  });

  it("contains all rooms from DEFAULT_BUILDING_HIERARCHY", () => {
    const flat = flattenHierarchy();
    const allRooms = DEFAULT_BUILDING_HIERARCHY.floors.flatMap((f) => f.rooms);
    for (const room of allRooms) {
      expect(flat[room.roomId]).toBeDefined();
    }
  });
});

// ── 4. validateHierarchyConsistency() — happy path ───────────────────────

describe("validateHierarchyConsistency() — valid config", () => {
  it("passes with no errors on the default config", () => {
    const result = validateHierarchyConsistency();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("may have zero warnings on the default config (all capabilities covered)", () => {
    const result = validateHierarchyConsistency();
    // Warnings are informational — not a failure condition
    // But assert the shape is correct
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

// ── 5. validateHierarchyConsistency() — error detection ──────────────────

describe("validateHierarchyConsistency() — error detection", () => {
  it("reports an error when an agent defaultRoom does not exist", () => {
    const brokenAgents = [
      ...AGENTS,
      {
        agentId: "ghost-agent",
        name: "Ghost",
        role: "researcher" as const,
        capabilities: ["repo-map"],
        riskClass: "low" as const,
        summary: "phantom",
        visual: { color: "#000", emissive: "#000", icon: "?", label: "GHT" },
        defaultRoom: "non-existent-room",
      },
    ];

    const result = validateHierarchyConsistency(BUILDING, brokenAgents, DEFAULT_ROOM_MAPPING);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-existent-room"))).toBe(true);
  });

  it("reports an error when agentAssignments references a non-existent room", () => {
    const brokenBuilding = {
      ...BUILDING,
      agentAssignments: {
        ...BUILDING.agentAssignments,
        "manager-default": "ghost-room-xyz",
      },
    };

    const result = validateHierarchyConsistency(brokenBuilding, AGENTS, DEFAULT_ROOM_MAPPING);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("ghost-room-xyz"))).toBe(true);
  });

  it("issues a warning when agentAssignments references an unknown agent ID", () => {
    const brokenBuilding = {
      ...BUILDING,
      agentAssignments: {
        ...BUILDING.agentAssignments,
        "totally-unknown-agent-id": "project-main",
      },
    };

    const result = validateHierarchyConsistency(brokenBuilding, AGENTS, DEFAULT_ROOM_MAPPING);
    // Unknown agent IDs are warnings, not errors
    expect(result.warnings.some((w) => w.includes("totally-unknown-agent-id"))).toBe(true);
  });
});

// ── 6. Summary Formatters ─────────────────────────────────────────────────

describe("formatRoomNodeSummary()", () => {
  it("returns a non-empty string for ops-control", () => {
    const room = getRoomNode("ops-control")!;
    const summary = formatRoomNodeSummary(room);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("CONTROL");
    expect(summary).toContain("Operations Control");
  });

  it("includes agent names when agents are present", () => {
    const room = getRoomNode("impl-office")!;
    const summary = formatRoomNodeSummary(room);
    expect(summary).toContain("Implementer");
  });

  it("includes floor number", () => {
    const room = getRoomNode("research-lab")!;
    const summary = formatRoomNodeSummary(room);
    expect(summary).toContain("Floor");
  });
});

describe("formatBuildingHierarchySummary()", () => {
  it("returns a non-empty multi-line string", () => {
    const summary = formatBuildingHierarchySummary();
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("Building:");
    expect(summary).toContain("Floor 0");
    expect(summary).toContain("Floor 1");
  });

  it("includes the building name", () => {
    const summary = formatBuildingHierarchySummary();
    expect(summary).toContain("Conitens");
  });

  it("includes all room IDs", () => {
    const summary = formatBuildingHierarchySummary();
    const allRoomIds = DEFAULT_BUILDING_HIERARCHY.floors
      .flatMap((f) => f.rooms)
      .map((r) => r.roomId);
    for (const id of allRoomIds) {
      expect(summary).toContain(id);
    }
  });
});

// ── 7. Room Hierarchy Node — data integrity ───────────────────────────────

describe("RoomHierarchyNode data integrity", () => {
  const allRooms: RoomHierarchyNode[] = DEFAULT_BUILDING_HIERARCHY.floors.flatMap(
    (f) => f.rooms,
  );

  it("every room has a non-empty roomId", () => {
    for (const room of allRooms) {
      expect(room.roomId.length).toBeGreaterThan(0);
    }
  });

  it("every room has a valid roomType", () => {
    const validTypes = new Set(["control", "office", "lab", "lobby", "archive", "corridor"]);
    for (const room of allRooms) {
      expect(validTypes.has(room.roomType)).toBe(true);
    }
  });

  it("every agent in a room has all required fields", () => {
    for (const room of allRooms) {
      for (const agent of room.agents) {
        expect(agent.agentId.length).toBeGreaterThan(0);
        expect(agent.name.length).toBeGreaterThan(0);
        expect(agent.role.length).toBeGreaterThan(0);
        expect(Array.isArray(agent.capabilities)).toBe(true);
        expect(["low", "medium", "high"]).toContain(agent.riskClass);
        expect(["explicit", "role", "capability", "special", "fallback"]).toContain(
          agent.assignmentSource,
        );
        expect(agent.visual.color).toMatch(/^#[0-9A-Fa-f]+$/);
      }
    }
  });

  it("agents on operations floor (1) are not placed on ground floor (0)", () => {
    const groundFloor = getFloorNode(0)!;
    const opsAgentIds = new Set(
      getFloorNode(1)!.rooms.flatMap((r) => r.agents.map((a) => a.agentId)),
    );
    for (const room of groundFloor.rooms) {
      for (const agent of room.agents) {
        // USER is special and can appear on ground floor
        if (agent.agentId !== "USER") {
          // An agent on floor 1 should NOT also appear on floor 0
          // (unless they have explicit multi-floor assignment)
          // This test verifies no duplication
          const alsoOnFloor1 = opsAgentIds.has(agent.agentId);
          // We expect a given agent to be on exactly one floor
          expect(alsoOnFloor1).toBe(false);
        }
      }
    }
  });
});

// ── 8. Capability Fallbacks — complete coverage ───────────────────────────

describe("Capability fallback coverage", () => {
  it("all agent capabilities are covered by either role defaults or capability fallbacks", () => {
    const coveredRoles = new Set(Object.keys(DEFAULT_ROOM_MAPPING.roleDefaults));
    const coveredCaps = new Set(DEFAULT_ROOM_MAPPING.capabilityFallbacks.map((fb) => fb.capability));

    const uncoveredCapabilities: Array<{ agentId: string; capability: string }> = [];

    for (const agent of AGENTS) {
      // If the role is covered, all capabilities are handled via role routing
      if (coveredRoles.has(agent.role)) continue;

      for (const cap of agent.capabilities) {
        if (!coveredCaps.has(cap)) {
          uncoveredCapabilities.push({ agentId: agent.agentId, capability: cap });
        }
      }
    }

    // With the updated capability fallbacks, this should be empty
    expect(uncoveredCapabilities).toHaveLength(0);
  });

  it("approval-boundary capability maps to ops-control", () => {
    const fb = DEFAULT_ROOM_MAPPING.capabilityFallbacks.find(
      (f) => f.capability === "approval-boundary",
    );
    expect(fb).toBeDefined();
    expect(fb!.roomId).toBe("ops-control");
  });

  it("task-execution capability maps to impl-office", () => {
    const fb = DEFAULT_ROOM_MAPPING.capabilityFallbacks.find(
      (f) => f.capability === "task-execution",
    );
    expect(fb).toBeDefined();
    expect(fb!.roomId).toBe("impl-office");
  });

  it("release-gate capability maps to validation-office", () => {
    const fb = DEFAULT_ROOM_MAPPING.capabilityFallbacks.find(
      (f) => f.capability === "release-gate",
    );
    expect(fb).toBeDefined();
    expect(fb!.roomId).toBe("validation-office");
  });

  it("frontend-refactor-planning capability maps to review-office", () => {
    const fb = DEFAULT_ROOM_MAPPING.capabilityFallbacks.find(
      (f) => f.capability === "frontend-refactor-planning",
    );
    expect(fb).toBeDefined();
    expect(fb!.roomId).toBe("review-office");
  });
});
