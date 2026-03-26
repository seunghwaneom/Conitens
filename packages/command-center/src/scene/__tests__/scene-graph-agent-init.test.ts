/**
 * scene-graph-agent-init.test.ts
 *
 * Sub-AC 2a: Define agent entities in scene initialization data with
 * inactive status and assigned room/position coordinates within the
 * building hierarchy.
 *
 * This test file verifies that initializeCommandCenterScene() places all
 * static agent entities as Group nodes within the building hierarchy:
 *   - agents are children of their assigned room nodes
 *   - room nodes are children of the building node
 *   - all agents have status="inactive" and lifecycleState="initializing"
 *   - agent positions match the world-space coordinates from AGENT_INITIAL_PLACEMENTS
 *   - agent count matches the static seed dataset (5 agents)
 *
 * Coverage matrix
 * ───────────────
 * 2a-1   initializeCommandCenterScene() returns roomNodes array
 * 2a-2   initializeCommandCenterScene() returns agentNodes array
 * 2a-3   roomNodes count matches BUILDING.rooms.length
 * 2a-4   agentNodes count matches AGENT_INITIAL_PLACEMENTS.length (5 agents)
 * 2a-5   All agent nodes have userData.status === "inactive"
 * 2a-6   All agent nodes have userData.lifecycleState === "initializing"
 * 2a-7   All agent nodes have a defined userData.agentId
 * 2a-8   All agent nodes have a defined userData.roomId
 * 2a-9   Each agent node is a descendant of the building node
 * 2a-10  Each agent node is a direct child of its assigned room node
 * 2a-11  Agent world-space positions match AGENT_INITIAL_PLACEMENTS seed data
 * 2a-12  Agent spawnIndex values are assigned and contiguous from 0
 * 2a-13  queryAgentNode() returns the correct node for each known agentId
 * 2a-14  queryAgentNode() returns undefined for an unknown agentId
 * 2a-15  queryRoomNode() returns the correct node for each known roomId
 * 2a-16  queryAllAgentNodes() returns all 5 agents sorted by spawnIndex
 * 2a-17  queryAgentNodesForRoom() returns agents only for the given room
 * 2a-18  Room nodes are direct children of the building node
 * 2a-19  Room nodes have correct metadata (roomId, roomType, floor)
 * 2a-20  Manager agent is in ops-control room node hierarchy
 * 2a-21  Implementer agent is in impl-office room node hierarchy
 * 2a-22  Researcher agent is in research-lab room node hierarchy
 * 2a-23  Validator agent is in validation-office room node hierarchy
 * 2a-24  Frontend-reviewer agent is in review-office room node hierarchy
 * 2a-25  SCENE_AGENT_NODE_PREFIX and SCENE_ROOM_NODE_PREFIX constants exported
 * 2a-26  Agent nodes are visible by default (visible = true)
 * 2a-27  Agent nodes have furnitureSlot metadata from seed data
 * 2a-28  All agent positions have y >= 0 (floor level or above)
 * 2a-29  Building hierarchy depth: agent is ≥3 levels deep (root→building→room→agent)
 *
 * Test ID scheme:
 *   2a-N : Sub-AC 2a (agent entities in scene init, building hierarchy)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  initializeCommandCenterScene,
  queryBuildingNode,
  queryAgentNode,
  queryRoomNode,
  queryAllAgentNodes,
  queryAgentNodesForRoom,
  SCENE_BUILDING_NODE_NAME,
  SCENE_AGENT_NODE_PREFIX,
  SCENE_ROOM_NODE_PREFIX,
  type CommandCenterSceneGraph,
} from "../scene-graph-init.js";
import { resetHarness, findAll } from "../../testing/scene-test-harness.js";
import { BUILDING } from "../../data/building.js";
import {
  AGENT_INITIAL_PLACEMENTS,
  AGENT_SEED_MAP,
} from "../../data/agent-seed.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle — reset harness counters for deterministic node IDs
// ─────────────────────────────────────────────────────────────────────────────

let scene: CommandCenterSceneGraph;

beforeEach(() => {
  resetHarness();
  scene = initializeCommandCenterScene();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-1 · roomNodes array is returned
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-1: roomNodes returned from initializeCommandCenterScene", () => {
  it("result.roomNodes is defined", () => {
    expect(scene.roomNodes).toBeDefined();
  });

  it("result.roomNodes is an array-like (iterable)", () => {
    expect(Array.isArray(scene.roomNodes) || Symbol.iterator in scene.roomNodes).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-2 · agentNodes array is returned
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-2: agentNodes returned from initializeCommandCenterScene", () => {
  it("result.agentNodes is defined", () => {
    expect(scene.agentNodes).toBeDefined();
  });

  it("result.agentNodes is an array-like (iterable)", () => {
    expect(Array.isArray(scene.agentNodes) || Symbol.iterator in scene.agentNodes).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-3 · roomNodes count
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-3: roomNodes count matches BUILDING.rooms", () => {
  it("roomNodes length equals BUILDING.rooms.length", () => {
    expect(scene.roomNodes.length).toBe(BUILDING.rooms.length);
  });

  it("roomNodes length is greater than 0", () => {
    expect(scene.roomNodes.length).toBeGreaterThan(0);
  });

  it("roomNodes length is at least 5 (one per agent room)", () => {
    expect(scene.roomNodes.length).toBeGreaterThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-4 · agentNodes count
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-4: agentNodes count matches AGENT_INITIAL_PLACEMENTS", () => {
  it("agentNodes length equals AGENT_INITIAL_PLACEMENTS.length", () => {
    expect(scene.agentNodes.length).toBe(AGENT_INITIAL_PLACEMENTS.length);
  });

  it("agentNodes length is exactly 5 (all static agents)", () => {
    expect(scene.agentNodes.length).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-5 · All agents have status="inactive"
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-5: All agent nodes have inactive status", () => {
  it("every agent node userData.status is 'inactive'", () => {
    for (const agentNode of scene.agentNodes) {
      expect(agentNode.userData.status).toBe("inactive");
    }
  });

  it("no agent node has status 'idle', 'active', 'busy', or 'error'", () => {
    const nonInactiveStatuses = ["idle", "active", "busy", "error", "terminated"];
    for (const agentNode of scene.agentNodes) {
      expect(nonInactiveStatuses).not.toContain(agentNode.userData.status);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-6 · All agents have lifecycleState="initializing"
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-6: All agent nodes have initializing lifecycleState", () => {
  it("every agent node userData.lifecycleState is 'initializing'", () => {
    for (const agentNode of scene.agentNodes) {
      expect(agentNode.userData.lifecycleState).toBe("initializing");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-7 · All agents have agentId
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-7: All agent nodes have agentId metadata", () => {
  it("every agent node has a defined string userData.agentId", () => {
    for (const agentNode of scene.agentNodes) {
      expect(typeof agentNode.userData.agentId).toBe("string");
      expect((agentNode.userData.agentId as string).length).toBeGreaterThan(0);
    }
  });

  it("agentId values are unique across all agent nodes", () => {
    const ids = scene.agentNodes.map((n) => n.userData.agentId as string);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all agentId values match entries in AGENT_INITIAL_PLACEMENTS", () => {
    const seedIds = new Set(AGENT_INITIAL_PLACEMENTS.map((s) => s.agentId));
    for (const agentNode of scene.agentNodes) {
      expect(seedIds.has(agentNode.userData.agentId as string)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-8 · All agents have roomId
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-8: All agent nodes have roomId metadata", () => {
  it("every agent node has a defined string userData.roomId", () => {
    for (const agentNode of scene.agentNodes) {
      expect(typeof agentNode.userData.roomId).toBe("string");
      expect((agentNode.userData.roomId as string).length).toBeGreaterThan(0);
    }
  });

  it("all roomId values refer to rooms that exist in BUILDING.rooms", () => {
    const buildingRoomIds = new Set(BUILDING.rooms.map((r) => r.roomId));
    for (const agentNode of scene.agentNodes) {
      expect(buildingRoomIds.has(agentNode.userData.roomId as string)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-9 · Each agent is a descendant of the building node
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-9: Agent nodes are descendants of the building node", () => {
  it("every agent node is reachable from the building node", () => {
    const buildingNode = queryBuildingNode(scene.root)!;
    const allDescendants = new Set(findAll(buildingNode, () => true).map((n) => n.name));
    for (const agentNode of scene.agentNodes) {
      expect(allDescendants.has(agentNode.name)).toBe(true);
    }
  });

  it("every agent node is NOT a direct child of root (must be nested deeper)", () => {
    const rootChildNames = new Set(scene.root.children.map((n) => n.name));
    for (const agentNode of scene.agentNodes) {
      expect(rootChildNames.has(agentNode.name)).toBe(false);
    }
  });

  it("every agent node is NOT a direct child of the building node (must be in a room)", () => {
    const buildingChildNames = new Set(scene.buildingNode.children.map((n) => n.name));
    for (const agentNode of scene.agentNodes) {
      // Agents should be under room nodes, not directly under building
      expect(buildingChildNames.has(agentNode.name)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-10 · Each agent is a direct child of its assigned room node
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-10: Agent nodes are direct children of their room nodes", () => {
  it("every agent node's parent is its assigned room node", () => {
    for (const agentNode of scene.agentNodes) {
      const roomId = agentNode.userData.roomId as string;
      const roomNode = queryRoomNode(scene.root, roomId);
      expect(roomNode).toBeDefined();
      // Agent's parent should be the room node
      expect(agentNode.parent).toBe(roomNode);
    }
  });

  it("every agent node appears in its room node's children array", () => {
    for (const agentNode of scene.agentNodes) {
      const roomId = agentNode.userData.roomId as string;
      const roomNode = queryRoomNode(scene.root, roomId);
      expect(roomNode).toBeDefined();
      expect(roomNode!.children).toContain(agentNode);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-11 · Agent world-space positions match seed data
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-11: Agent positions match AGENT_INITIAL_PLACEMENTS world coordinates", () => {
  const POSITION_TOLERANCE = 0.001;

  it("every agent node position matches its seed worldPosition (within 0.001 tolerance)", () => {
    for (const agentNode of scene.agentNodes) {
      const agentId = agentNode.userData.agentId as string;
      const seed = AGENT_SEED_MAP[agentId];
      expect(seed).toBeDefined();
      const { worldPosition } = seed!.position;
      expect(Math.abs(agentNode.position.x - worldPosition.x)).toBeLessThanOrEqual(POSITION_TOLERANCE);
      expect(Math.abs(agentNode.position.y - worldPosition.y)).toBeLessThanOrEqual(POSITION_TOLERANCE);
      expect(Math.abs(agentNode.position.z - worldPosition.z)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    }
  });

  it("manager-default position is (6.5, 3.0, 2.0)", () => {
    const node = queryAgentNode(scene.root, "manager-default")!;
    expect(node.position.x).toBeCloseTo(6.5);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(2.0);
  });

  it("implementer-subagent position is (1.0, 3.0, 1.5)", () => {
    const node = queryAgentNode(scene.root, "implementer-subagent")!;
    expect(node.position.x).toBeCloseTo(1.0);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(1.5);
  });

  it("researcher-subagent position is (2.0, 3.0, 4.5)", () => {
    const node = queryAgentNode(scene.root, "researcher-subagent")!;
    expect(node.position.x).toBeCloseTo(2.0);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(4.5);
  });

  it("validator-sentinel position is (10.5, 3.0, 1.5)", () => {
    const node = queryAgentNode(scene.root, "validator-sentinel")!;
    expect(node.position.x).toBeCloseTo(10.5);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(1.5);
  });

  it("frontend-reviewer position is (10.5, 3.0, 4.5)", () => {
    const node = queryAgentNode(scene.root, "frontend-reviewer")!;
    expect(node.position.x).toBeCloseTo(10.5);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(4.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-12 · Agent spawnIndex values
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-12: Agent spawnIndex values are assigned and contiguous", () => {
  it("every agent node has a numeric userData.spawnIndex", () => {
    for (const agentNode of scene.agentNodes) {
      expect(typeof agentNode.userData.spawnIndex).toBe("number");
    }
  });

  it("spawnIndex values are unique across all agent nodes", () => {
    const indices = scene.agentNodes.map((n) => n.userData.spawnIndex as number);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("spawnIndex values form a contiguous 0-based sequence", () => {
    const indices = scene.agentNodes
      .map((n) => n.userData.spawnIndex as number)
      .sort((a, b) => a - b);
    expect(indices[0]).toBe(0);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBe(indices[i - 1]! + 1);
    }
  });

  it("manager-default has spawnIndex 0", () => {
    const node = queryAgentNode(scene.root, "manager-default")!;
    expect(node.userData.spawnIndex).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-13 · queryAgentNode() — known agents
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-13: queryAgentNode() resolves all known agent IDs", () => {
  const knownAgentIds = [
    "manager-default",
    "implementer-subagent",
    "researcher-subagent",
    "validator-sentinel",
    "frontend-reviewer",
  ];

  for (const agentId of knownAgentIds) {
    it(`queryAgentNode("${agentId}") returns a defined node`, () => {
      const node = queryAgentNode(scene.root, agentId);
      expect(node).toBeDefined();
    });

    it(`queryAgentNode("${agentId}") node name is "agent-${agentId}"`, () => {
      const node = queryAgentNode(scene.root, agentId)!;
      expect(node.name).toBe(`${SCENE_AGENT_NODE_PREFIX}${agentId}`);
    });

    it(`queryAgentNode("${agentId}") node has correct agentId in userData`, () => {
      const node = queryAgentNode(scene.root, agentId)!;
      expect(node.userData.agentId).toBe(agentId);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-14 · queryAgentNode() — unknown agent
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-14: queryAgentNode() returns undefined for unknown agents", () => {
  it("returns undefined for 'nonexistent-agent'", () => {
    expect(queryAgentNode(scene.root, "nonexistent-agent")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(queryAgentNode(scene.root, "")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-15 · queryRoomNode() — known rooms
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-15: queryRoomNode() resolves room IDs from BUILDING.rooms", () => {
  it("returns a defined node for each room in BUILDING.rooms", () => {
    for (const room of BUILDING.rooms) {
      const node = queryRoomNode(scene.root, room.roomId);
      expect(node).toBeDefined();
    }
  });

  it("each room node has correct roomId in userData", () => {
    for (const room of BUILDING.rooms) {
      const node = queryRoomNode(scene.root, room.roomId)!;
      expect(node.userData.roomId).toBe(room.roomId);
    }
  });

  it("ops-control room node is findable", () => {
    const node = queryRoomNode(scene.root, "ops-control");
    expect(node).toBeDefined();
    expect(node!.userData.roomId).toBe("ops-control");
  });

  it("returns undefined for 'nonexistent-room'", () => {
    expect(queryRoomNode(scene.root, "nonexistent-room")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-16 · queryAllAgentNodes()
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-16: queryAllAgentNodes() returns all agents sorted by spawnIndex", () => {
  it("returns exactly 5 agent nodes", () => {
    const agents = queryAllAgentNodes(scene.root);
    expect(agents).toHaveLength(5);
  });

  it("returns nodes sorted by spawnIndex (ascending)", () => {
    const agents = queryAllAgentNodes(scene.root);
    for (let i = 0; i < agents.length - 1; i++) {
      const a = agents[i]!.userData.spawnIndex as number;
      const b = agents[i + 1]!.userData.spawnIndex as number;
      expect(a).toBeLessThan(b);
    }
  });

  it("first agent in sorted list is manager-default (spawnIndex 0)", () => {
    const agents = queryAllAgentNodes(scene.root);
    expect(agents[0]!.userData.agentId).toBe("manager-default");
  });

  it("all returned agents have status 'inactive'", () => {
    for (const node of queryAllAgentNodes(scene.root)) {
      expect(node.userData.status).toBe("inactive");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-17 · queryAgentNodesForRoom()
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-17: queryAgentNodesForRoom() filters by room", () => {
  it("ops-control has exactly 1 agent (manager-default)", () => {
    const agents = queryAgentNodesForRoom(scene.root, "ops-control");
    expect(agents).toHaveLength(1);
    expect(agents[0]!.userData.agentId).toBe("manager-default");
  });

  it("impl-office has exactly 1 agent (implementer-subagent)", () => {
    const agents = queryAgentNodesForRoom(scene.root, "impl-office");
    expect(agents).toHaveLength(1);
    expect(agents[0]!.userData.agentId).toBe("implementer-subagent");
  });

  it("research-lab has exactly 1 agent (researcher-subagent)", () => {
    const agents = queryAgentNodesForRoom(scene.root, "research-lab");
    expect(agents).toHaveLength(1);
    expect(agents[0]!.userData.agentId).toBe("researcher-subagent");
  });

  it("validation-office has exactly 1 agent (validator-sentinel)", () => {
    const agents = queryAgentNodesForRoom(scene.root, "validation-office");
    expect(agents).toHaveLength(1);
    expect(agents[0]!.userData.agentId).toBe("validator-sentinel");
  });

  it("review-office has exactly 1 agent (frontend-reviewer)", () => {
    const agents = queryAgentNodesForRoom(scene.root, "review-office");
    expect(agents).toHaveLength(1);
    expect(agents[0]!.userData.agentId).toBe("frontend-reviewer");
  });

  it("returns empty array for rooms with no agents", () => {
    const agents = queryAgentNodesForRoom(scene.root, "corridor-main");
    expect(agents).toHaveLength(0);
  });

  it("returns empty array for unknown room", () => {
    const agents = queryAgentNodesForRoom(scene.root, "does-not-exist");
    expect(agents).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-18 · Room nodes are direct children of building node
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-18: Room nodes are direct children of building node", () => {
  it("every room node is a direct child of the building node", () => {
    for (const roomNode of scene.roomNodes) {
      expect(scene.buildingNode.children).toContain(roomNode);
      expect(roomNode.parent).toBe(scene.buildingNode);
    }
  });

  it("building node has at least as many children as BUILDING.rooms (rooms + any extra)", () => {
    expect(scene.buildingNode.children.length).toBeGreaterThanOrEqual(BUILDING.rooms.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-19 · Room nodes have correct metadata
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-19: Room nodes carry roomId, roomType, floor metadata", () => {
  it("every room node has a defined string userData.roomId", () => {
    for (const roomNode of scene.roomNodes) {
      expect(typeof roomNode.userData.roomId).toBe("string");
      expect((roomNode.userData.roomId as string).length).toBeGreaterThan(0);
    }
  });

  it("every room node has userData.roomType matching BUILDING", () => {
    for (const roomNode of scene.roomNodes) {
      const roomId = roomNode.userData.roomId as string;
      const buildingRoom = BUILDING.rooms.find((r) => r.roomId === roomId);
      expect(buildingRoom).toBeDefined();
      expect(roomNode.userData.roomType).toBe(buildingRoom!.roomType);
    }
  });

  it("every room node has a numeric userData.floor", () => {
    for (const roomNode of scene.roomNodes) {
      expect(typeof roomNode.userData.floor).toBe("number");
    }
  });

  it("room node names follow the 'room-<roomId>' pattern", () => {
    for (const roomNode of scene.roomNodes) {
      const roomId = roomNode.userData.roomId as string;
      expect(roomNode.name).toBe(`${SCENE_ROOM_NODE_PREFIX}${roomId}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-20 to 2a-24 · Per-agent room hierarchy verification
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-20: manager-default is in ops-control hierarchy", () => {
  it("manager-default agent is found under the ops-control room node", () => {
    const opsControlNode = queryRoomNode(scene.root, "ops-control")!;
    const managerNode = queryAgentNode(scene.root, "manager-default")!;
    expect(opsControlNode.children).toContain(managerNode);
    expect(managerNode.parent).toBe(opsControlNode);
  });

  it("manager-default is in ops-control room (roomId metadata)", () => {
    const managerNode = queryAgentNode(scene.root, "manager-default")!;
    expect(managerNode.userData.roomId).toBe("ops-control");
  });
});

describe("Sub-AC 2a-21: implementer-subagent is in impl-office hierarchy", () => {
  it("implementer-subagent agent is found under the impl-office room node", () => {
    const implOfficeNode = queryRoomNode(scene.root, "impl-office")!;
    const implementerNode = queryAgentNode(scene.root, "implementer-subagent")!;
    expect(implOfficeNode.children).toContain(implementerNode);
    expect(implementerNode.parent).toBe(implOfficeNode);
  });
});

describe("Sub-AC 2a-22: researcher-subagent is in research-lab hierarchy", () => {
  it("researcher-subagent agent is found under the research-lab room node", () => {
    const researchLabNode = queryRoomNode(scene.root, "research-lab")!;
    const researcherNode = queryAgentNode(scene.root, "researcher-subagent")!;
    expect(researchLabNode.children).toContain(researcherNode);
    expect(researcherNode.parent).toBe(researchLabNode);
  });
});

describe("Sub-AC 2a-23: validator-sentinel is in validation-office hierarchy", () => {
  it("validator-sentinel agent is found under the validation-office room node", () => {
    const validationNode = queryRoomNode(scene.root, "validation-office")!;
    const validatorNode = queryAgentNode(scene.root, "validator-sentinel")!;
    expect(validationNode.children).toContain(validatorNode);
    expect(validatorNode.parent).toBe(validationNode);
  });
});

describe("Sub-AC 2a-24: frontend-reviewer is in review-office hierarchy", () => {
  it("frontend-reviewer agent is found under the review-office room node", () => {
    const reviewOfficeNode = queryRoomNode(scene.root, "review-office")!;
    const reviewerNode = queryAgentNode(scene.root, "frontend-reviewer")!;
    expect(reviewOfficeNode.children).toContain(reviewerNode);
    expect(reviewerNode.parent).toBe(reviewOfficeNode);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-25 · Prefix constants exported
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-25: SCENE_AGENT_NODE_PREFIX and SCENE_ROOM_NODE_PREFIX constants", () => {
  it("SCENE_AGENT_NODE_PREFIX is 'agent-'", () => {
    expect(SCENE_AGENT_NODE_PREFIX).toBe("agent-");
  });

  it("SCENE_ROOM_NODE_PREFIX is 'room-'", () => {
    expect(SCENE_ROOM_NODE_PREFIX).toBe("room-");
  });

  it("SCENE_BUILDING_NODE_NAME is still 'hierarchy-building'", () => {
    expect(SCENE_BUILDING_NODE_NAME).toBe("hierarchy-building");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-26 · Agent nodes are visible
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-26: Agent nodes are visible by default", () => {
  it("every agent node has visible === true at initialization", () => {
    for (const agentNode of scene.agentNodes) {
      expect(agentNode.visible).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-27 · Agent nodes have furnitureSlot metadata
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-27: Agent nodes carry furnitureSlot from seed data", () => {
  it("every agent node has a non-null furnitureSlot in userData", () => {
    for (const agentNode of scene.agentNodes) {
      expect(agentNode.userData.furnitureSlot).not.toBeNull();
      expect(agentNode.userData.furnitureSlot).not.toBeUndefined();
    }
  });

  it("manager-default furnitureSlot is 'command-desk'", () => {
    const node = queryAgentNode(scene.root, "manager-default")!;
    expect(node.userData.furnitureSlot).toBe("command-desk");
  });

  it("implementer-subagent furnitureSlot is 'workstation'", () => {
    const node = queryAgentNode(scene.root, "implementer-subagent")!;
    expect(node.userData.furnitureSlot).toBe("workstation");
  });

  it("researcher-subagent furnitureSlot is 'analysis-desk'", () => {
    const node = queryAgentNode(scene.root, "researcher-subagent")!;
    expect(node.userData.furnitureSlot).toBe("analysis-desk");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-28 · Agent positions are at floor level or above
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-28: Agent positions are at floor level or above", () => {
  it("every agent node position.y is >= 0 (not underground)", () => {
    for (const agentNode of scene.agentNodes) {
      expect(agentNode.position.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("all agents on floor 1 have y = 3.0 (floor 1 y-base from building)", () => {
    // All seed agents are on floor 1 (y-base = 3.0, localPosition.y = 0)
    for (const agentNode of scene.agentNodes) {
      if (agentNode.userData.floor === 1) {
        expect(agentNode.position.y).toBeCloseTo(3.0);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2a-29 · Building hierarchy depth
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2a-29: Building hierarchy depth — agents are ≥3 levels deep", () => {
  it("agent parent is a room; room parent is building; building parent is root", () => {
    for (const agentNode of scene.agentNodes) {
      // Level 1: agent.parent is a room node
      const roomNode = agentNode.parent;
      expect(roomNode).not.toBeNull();
      expect(typeof roomNode!.userData.roomId).toBe("string");

      // Level 2: room.parent is the building node
      const buildingNode = roomNode!.parent;
      expect(buildingNode).not.toBeNull();
      expect(buildingNode!.name).toBe(SCENE_BUILDING_NODE_NAME);

      // Level 3: building.parent is the root
      const rootNode = buildingNode!.parent;
      expect(rootNode).not.toBeNull();
      expect(rootNode!.name).toBe("Scene");
    }
  });

  it("path from root to agent has exactly 4 nodes (root, building, room, agent)", () => {
    for (const agentNode of scene.agentNodes) {
      // root → building → room → agent = depth 3 (0-indexed) = 4 nodes
      const roomNode = agentNode.parent!;
      const buildingNode = roomNode.parent!;
      const rootNode = buildingNode.parent!;

      // Verify the chain
      expect(rootNode.parent).toBeNull(); // root has no parent
      expect(rootNode.name).toBe("Scene");
      expect(buildingNode.name).toBe(SCENE_BUILDING_NODE_NAME);
      expect(typeof roomNode.userData.roomId).toBe("string");
      expect(typeof agentNode.userData.agentId).toBe("string");
    }
  });
});
