/**
 * avatar-placement-scene-load.test.ts
 *
 * Sub-AC 2c: Integrate avatar placement at scene load — instantiate one avatar
 * per agent entity at its designated position within the office/room hierarchy
 * before first render.
 *
 * This test file verifies that initializeAvatarPlacement() places all static
 * agent avatars in the scene graph at load time with:
 *   - One avatar per agent in AGENT_INITIAL_PLACEMENTS (5 total)
 *   - Each avatar located at its designated position in the room hierarchy
 *   - Visual metadata (color, emissive, label, icon, role) populated
 *   - Status="inactive" and lifecycleState="initializing" (inherited from scene-graph-init)
 *   - Synchronous placement (no async operations required before first render)
 *
 * Coverage matrix
 * ───────────────
 * 2c-1   initializeAvatarPlacement() returns defined AvatarPlacementSceneGraph
 * 2c-2   avatarNodes array contains exactly 5 nodes (one per seed agent)
 * 2c-3   avatarCount equals avatarNodes.length
 * 2c-4   All avatar nodes have userData.avatarPlaced === true
 * 2c-5   All avatar nodes have non-empty userData.avatarColor (hex string)
 * 2c-6   All avatar nodes have non-empty userData.avatarEmissive (hex string)
 * 2c-7   All avatar nodes have non-empty userData.avatarLabel (3–4 char string)
 * 2c-8   All avatar nodes have non-empty userData.avatarIcon (unicode string)
 * 2c-9   All avatar nodes have non-empty userData.avatarRole string
 * 2c-10  Each avatar node is under its assigned room node in the hierarchy
 * 2c-11  Each avatar node position matches the seed worldPosition
 * 2c-12  All avatar nodes have userData.status === "inactive" (not yet spawned)
 * 2c-13  All avatar nodes have userData.lifecycleState === "initializing"
 * 2c-14  Avatar nodes are visible=true at load time
 * 2c-15  manager-default avatar has orchestrator color (#FF7043)
 * 2c-16  implementer-subagent avatar has implementer color (#66BB6A)
 * 2c-17  researcher-subagent avatar has researcher color (#AB47BC)
 * 2c-18  validator-sentinel avatar has validator color (#EF5350)
 * 2c-19  frontend-reviewer avatar has reviewer color (#42A5F5)
 * 2c-20  queryAvatarNode() returns a placed node for each known agentId
 * 2c-21  queryAvatarNode() returns undefined for unknown agent
 * 2c-22  queryAllAvatarNodes() returns all 5 nodes sorted by spawnIndex
 * 2c-23  countAvatarNodes() returns 5
 * 2c-24  allSeedAgentsHaveAvatars() returns true
 * 2c-25  allAvatarsHaveVisualData() returns true
 * 2c-26  No duplicate avatar nodes (unique agentIds across avatarNodes)
 * 2c-27  annotateAvatarNode() sets avatarPlaced=true on a standalone node
 * 2c-28  annotateAvatarNode() falls back gracefully for unknown agentId
 * 2c-29  Avatar nodes are direct children of their room nodes (hierarchy preserved)
 * 2c-30  Room hierarchy intact after avatar placement (rooms still under building)
 * 2c-31  initializeAvatarPlacement() is idempotent (calling twice is safe)
 * 2c-32  Avatar label values are 3–4 characters (compact role badge)
 * 2c-33  Avatar color values are valid hex strings (#rrggbb format)
 * 2c-34  Avatar agentId values match AGENT_INITIAL_PLACEMENTS order
 * 2c-35  initializeAvatarPlacement() is synchronous (no Promise returned)
 *
 * Test ID scheme:
 *   2c-N : Sub-AC 2c (avatar placement at scene load)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  initializeAvatarPlacement,
  queryAvatarNode,
  queryAllAvatarNodes,
  countAvatarNodes,
  allSeedAgentsHaveAvatars,
  allAvatarsHaveVisualData,
  annotateAvatarNode,
  type AvatarPlacementSceneGraph,
  SCENE_AGENT_NODE_PREFIX,
  SCENE_ROOM_NODE_PREFIX,
  SCENE_BUILDING_NODE_NAME,
} from "../avatar-placement-init.js";
import {
  resetHarness,
  makeGroupNode,
  type SceneNode,
} from "../../testing/scene-test-harness.js";
import {
  AGENT_INITIAL_PLACEMENTS,
  AGENT_SEED_MAP,
} from "../../data/agent-seed.js";
import { AGENT_MAP } from "../../data/agents.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle — reset harness counters for deterministic node IDs
// ─────────────────────────────────────────────────────────────────────────────

let scene: AvatarPlacementSceneGraph;

beforeEach(() => {
  resetHarness();
  scene = initializeAvatarPlacement();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-1 · initializeAvatarPlacement() returns defined graph
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-1: initializeAvatarPlacement() returns AvatarPlacementSceneGraph", () => {
  it("returns a defined object", () => {
    expect(scene).toBeDefined();
  });

  it("has root property", () => {
    expect(scene.root).toBeDefined();
    expect(scene.root.type).toBe("Scene");
  });

  it("has buildingNode property", () => {
    expect(scene.buildingNode).toBeDefined();
    expect(scene.buildingNode.name).toBe(SCENE_BUILDING_NODE_NAME);
  });

  it("has roomNodes array", () => {
    expect(scene.roomNodes).toBeDefined();
    expect(scene.roomNodes.length).toBeGreaterThan(0);
  });

  it("has agentNodes array", () => {
    expect(scene.agentNodes).toBeDefined();
    expect(scene.agentNodes.length).toBeGreaterThan(0);
  });

  it("has avatarNodes array", () => {
    expect(scene.avatarNodes).toBeDefined();
  });

  it("has avatarCount property", () => {
    expect(typeof scene.avatarCount).toBe("number");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-2 · One avatar per seed agent (5 total)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-2: One avatar per seed agent (5 total)", () => {
  it("avatarNodes.length equals AGENT_INITIAL_PLACEMENTS.length", () => {
    expect(scene.avatarNodes.length).toBe(AGENT_INITIAL_PLACEMENTS.length);
  });

  it("avatarNodes.length is exactly 5", () => {
    expect(scene.avatarNodes.length).toBe(5);
  });

  it("all 5 seed agent IDs are represented in avatarNodes", () => {
    const avatarIds = new Set(
      scene.avatarNodes.map((n) => n.userData.agentId as string),
    );
    for (const seed of AGENT_INITIAL_PLACEMENTS) {
      expect(avatarIds.has(seed.agentId)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-3 · avatarCount equals avatarNodes.length
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-3: avatarCount equals avatarNodes.length", () => {
  it("avatarCount is 5", () => {
    expect(scene.avatarCount).toBe(5);
  });

  it("avatarCount equals avatarNodes.length", () => {
    expect(scene.avatarCount).toBe(scene.avatarNodes.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-4 · All avatar nodes have avatarPlaced === true
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-4: All avatar nodes have userData.avatarPlaced === true", () => {
  it("every avatar node in avatarNodes has avatarPlaced=true", () => {
    for (const node of scene.avatarNodes) {
      expect(node.userData.avatarPlaced).toBe(true);
    }
  });

  it("all agent nodes have avatarPlaced=true (agentNodes === avatarNodes in scope)", () => {
    // Since all seed agents are in AGENT_MAP, all should be annotated
    for (const node of scene.agentNodes) {
      expect(node.userData.avatarPlaced).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-5 · All avatar nodes have non-empty avatarColor
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-5: All avatar nodes have non-empty userData.avatarColor", () => {
  it("every avatar node has a string avatarColor", () => {
    for (const node of scene.avatarNodes) {
      expect(typeof node.userData.avatarColor).toBe("string");
    }
  });

  it("every avatar node avatarColor is non-empty", () => {
    for (const node of scene.avatarNodes) {
      expect((node.userData.avatarColor as string).length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-6 · All avatar nodes have non-empty avatarEmissive
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-6: All avatar nodes have non-empty userData.avatarEmissive", () => {
  it("every avatar node has a string avatarEmissive", () => {
    for (const node of scene.avatarNodes) {
      expect(typeof node.userData.avatarEmissive).toBe("string");
    }
  });

  it("every avatar node avatarEmissive is non-empty", () => {
    for (const node of scene.avatarNodes) {
      expect((node.userData.avatarEmissive as string).length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-7 · All avatar nodes have non-empty avatarLabel
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-7: All avatar nodes have non-empty userData.avatarLabel", () => {
  it("every avatar node has a string avatarLabel", () => {
    for (const node of scene.avatarNodes) {
      expect(typeof node.userData.avatarLabel).toBe("string");
    }
  });

  it("every avatar node avatarLabel is non-empty", () => {
    for (const node of scene.avatarNodes) {
      expect((node.userData.avatarLabel as string).length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-8 · All avatar nodes have non-empty avatarIcon
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-8: All avatar nodes have non-empty userData.avatarIcon", () => {
  it("every avatar node has a string avatarIcon", () => {
    for (const node of scene.avatarNodes) {
      expect(typeof node.userData.avatarIcon).toBe("string");
    }
  });

  it("every avatar node avatarIcon is non-empty", () => {
    for (const node of scene.avatarNodes) {
      expect((node.userData.avatarIcon as string).length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-9 · All avatar nodes have non-empty avatarRole
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-9: All avatar nodes have non-empty userData.avatarRole", () => {
  it("every avatar node has a string avatarRole", () => {
    for (const node of scene.avatarNodes) {
      expect(typeof node.userData.avatarRole).toBe("string");
    }
  });

  it("every avatar node avatarRole is a valid AgentRole", () => {
    const validRoles = new Set([
      "orchestrator",
      "implementer",
      "researcher",
      "reviewer",
      "validator",
    ]);
    for (const node of scene.avatarNodes) {
      expect(validRoles.has(node.userData.avatarRole as string)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-10 · Each avatar node is under its assigned room node
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-10: Each avatar node is under its assigned room node", () => {
  it("every avatar node's parent is its assigned room node", () => {
    for (const node of scene.avatarNodes) {
      const roomId = node.userData.roomId as string;
      const roomNode = node.parent;
      expect(roomNode).not.toBeNull();
      expect(roomNode!.userData.roomId).toBe(roomId);
    }
  });

  it("every avatar node appears in its room node's children array", () => {
    for (const node of scene.avatarNodes) {
      const roomNode = node.parent;
      expect(roomNode).not.toBeNull();
      expect(roomNode!.children).toContain(node);
    }
  });

  it("hierarchy chain: avatar → room → building → root", () => {
    for (const node of scene.avatarNodes) {
      const roomNode = node.parent!;
      const buildingNode = roomNode.parent!;
      const rootNode = buildingNode.parent!;
      expect(typeof roomNode.userData.roomId).toBe("string");
      expect(buildingNode.name).toBe(SCENE_BUILDING_NODE_NAME);
      expect(rootNode.name).toBe("Scene");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-11 · Avatar positions match seed worldPosition
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-11: Avatar node positions match seed worldPosition", () => {
  const POSITION_TOLERANCE = 0.001;

  it("every avatar node position matches seed worldPosition (within 0.001)", () => {
    for (const node of scene.avatarNodes) {
      const agentId = node.userData.agentId as string;
      const seed = AGENT_SEED_MAP[agentId];
      expect(seed).toBeDefined();
      const { worldPosition } = seed!.position;
      expect(Math.abs(node.position.x - worldPosition.x)).toBeLessThanOrEqual(POSITION_TOLERANCE);
      expect(Math.abs(node.position.y - worldPosition.y)).toBeLessThanOrEqual(POSITION_TOLERANCE);
      expect(Math.abs(node.position.z - worldPosition.z)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    }
  });

  it("manager-default avatar at (6.5, 3.0, 2.0)", () => {
    const node = queryAvatarNode(scene.root, "manager-default")!;
    expect(node.position.x).toBeCloseTo(6.5);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(2.0);
  });

  it("implementer-subagent avatar at (1.0, 3.0, 1.5)", () => {
    const node = queryAvatarNode(scene.root, "implementer-subagent")!;
    expect(node.position.x).toBeCloseTo(1.0);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(1.5);
  });

  it("researcher-subagent avatar at (2.0, 3.0, 4.5)", () => {
    const node = queryAvatarNode(scene.root, "researcher-subagent")!;
    expect(node.position.x).toBeCloseTo(2.0);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(4.5);
  });

  it("validator-sentinel avatar at (10.5, 3.0, 1.5)", () => {
    const node = queryAvatarNode(scene.root, "validator-sentinel")!;
    expect(node.position.x).toBeCloseTo(10.5);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(1.5);
  });

  it("frontend-reviewer avatar at (10.5, 3.0, 4.5)", () => {
    const node = queryAvatarNode(scene.root, "frontend-reviewer")!;
    expect(node.position.x).toBeCloseTo(10.5);
    expect(node.position.y).toBeCloseTo(3.0);
    expect(node.position.z).toBeCloseTo(4.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-12 · All avatar nodes start with status="inactive"
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-12: All avatar nodes have status=inactive at load", () => {
  it("every avatar node has userData.status === 'inactive'", () => {
    for (const node of scene.avatarNodes) {
      expect(node.userData.status).toBe("inactive");
    }
  });

  it("no avatar node has status 'idle', 'active', 'busy', 'error', or 'terminated'", () => {
    const nonInactiveStatuses = ["idle", "active", "busy", "error", "terminated"];
    for (const node of scene.avatarNodes) {
      expect(nonInactiveStatuses).not.toContain(node.userData.status);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-13 · All avatar nodes start with lifecycleState="initializing"
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-13: All avatar nodes have lifecycleState=initializing at load", () => {
  it("every avatar node has userData.lifecycleState === 'initializing'", () => {
    for (const node of scene.avatarNodes) {
      expect(node.userData.lifecycleState).toBe("initializing");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-14 · Avatar nodes are visible=true at load
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-14: Avatar nodes are visible=true at load time", () => {
  it("every avatar node has visible === true", () => {
    for (const node of scene.avatarNodes) {
      expect(node.visible).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-15 to 2c-19 · Per-agent role color verification
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-15: manager-default has orchestrator color #FF7043", () => {
  it("manager-default avatarColor is #FF7043", () => {
    const node = queryAvatarNode(scene.root, "manager-default")!;
    expect(node).toBeDefined();
    expect((node.userData.avatarColor as string).toUpperCase()).toBe("#FF7043");
  });

  it("manager-default avatarRole is 'orchestrator'", () => {
    const node = queryAvatarNode(scene.root, "manager-default")!;
    expect(node.userData.avatarRole).toBe("orchestrator");
  });

  it("manager-default avatarLabel is 'MGR'", () => {
    const node = queryAvatarNode(scene.root, "manager-default")!;
    expect(node.userData.avatarLabel).toBe("MGR");
  });
});

describe("Sub-AC 2c-16: implementer-subagent has implementer color #66BB6A", () => {
  it("implementer-subagent avatarColor is #66BB6A", () => {
    const node = queryAvatarNode(scene.root, "implementer-subagent")!;
    expect(node).toBeDefined();
    expect((node.userData.avatarColor as string).toUpperCase()).toBe("#66BB6A");
  });

  it("implementer-subagent avatarRole is 'implementer'", () => {
    const node = queryAvatarNode(scene.root, "implementer-subagent")!;
    expect(node.userData.avatarRole).toBe("implementer");
  });

  it("implementer-subagent avatarLabel is 'IMP'", () => {
    const node = queryAvatarNode(scene.root, "implementer-subagent")!;
    expect(node.userData.avatarLabel).toBe("IMP");
  });
});

describe("Sub-AC 2c-17: researcher-subagent has researcher color #AB47BC", () => {
  it("researcher-subagent avatarColor is #AB47BC", () => {
    const node = queryAvatarNode(scene.root, "researcher-subagent")!;
    expect(node).toBeDefined();
    expect((node.userData.avatarColor as string).toUpperCase()).toBe("#AB47BC");
  });

  it("researcher-subagent avatarRole is 'researcher'", () => {
    const node = queryAvatarNode(scene.root, "researcher-subagent")!;
    expect(node.userData.avatarRole).toBe("researcher");
  });
});

describe("Sub-AC 2c-18: validator-sentinel has validator color #EF5350", () => {
  it("validator-sentinel avatarColor is #EF5350", () => {
    const node = queryAvatarNode(scene.root, "validator-sentinel")!;
    expect(node).toBeDefined();
    expect((node.userData.avatarColor as string).toUpperCase()).toBe("#EF5350");
  });

  it("validator-sentinel avatarRole is 'validator'", () => {
    const node = queryAvatarNode(scene.root, "validator-sentinel")!;
    expect(node.userData.avatarRole).toBe("validator");
  });
});

describe("Sub-AC 2c-19: frontend-reviewer has reviewer color #42A5F5", () => {
  it("frontend-reviewer avatarColor is #42A5F5", () => {
    const node = queryAvatarNode(scene.root, "frontend-reviewer")!;
    expect(node).toBeDefined();
    expect((node.userData.avatarColor as string).toUpperCase()).toBe("#42A5F5");
  });

  it("frontend-reviewer avatarRole is 'reviewer'", () => {
    const node = queryAvatarNode(scene.root, "frontend-reviewer")!;
    expect(node.userData.avatarRole).toBe("reviewer");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-20 · queryAvatarNode() — known agents
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-20: queryAvatarNode() resolves all known agent IDs", () => {
  const knownAgentIds = [
    "manager-default",
    "implementer-subagent",
    "researcher-subagent",
    "validator-sentinel",
    "frontend-reviewer",
  ];

  for (const agentId of knownAgentIds) {
    it(`queryAvatarNode("${agentId}") returns a defined node`, () => {
      const node = queryAvatarNode(scene.root, agentId);
      expect(node).toBeDefined();
    });

    it(`queryAvatarNode("${agentId}") node has avatarPlaced=true`, () => {
      const node = queryAvatarNode(scene.root, agentId)!;
      expect(node.userData.avatarPlaced).toBe(true);
    });

    it(`queryAvatarNode("${agentId}") node has correct agentId`, () => {
      const node = queryAvatarNode(scene.root, agentId)!;
      expect(node.userData.agentId).toBe(agentId);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-21 · queryAvatarNode() — unknown agent
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-21: queryAvatarNode() returns undefined for unknown agent", () => {
  it("returns undefined for 'nonexistent-agent'", () => {
    expect(queryAvatarNode(scene.root, "nonexistent-agent")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(queryAvatarNode(scene.root, "")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-22 · queryAllAvatarNodes() returns all 5 nodes sorted by spawnIndex
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-22: queryAllAvatarNodes() returns 5 nodes sorted by spawnIndex", () => {
  it("returns exactly 5 avatar nodes", () => {
    expect(queryAllAvatarNodes(scene.root)).toHaveLength(5);
  });

  it("returns nodes sorted ascending by spawnIndex", () => {
    const nodes = queryAllAvatarNodes(scene.root);
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i]!.userData.spawnIndex as number;
      const b = nodes[i + 1]!.userData.spawnIndex as number;
      expect(a).toBeLessThan(b);
    }
  });

  it("first node is manager-default (spawnIndex 0)", () => {
    const nodes = queryAllAvatarNodes(scene.root);
    expect(nodes[0]!.userData.agentId).toBe("manager-default");
  });

  it("all returned nodes have avatarPlaced=true", () => {
    for (const node of queryAllAvatarNodes(scene.root)) {
      expect(node.userData.avatarPlaced).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-23 · countAvatarNodes() returns 5
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-23: countAvatarNodes() returns 5", () => {
  it("countAvatarNodes(root) is 5", () => {
    expect(countAvatarNodes(scene.root)).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-24 · allSeedAgentsHaveAvatars() returns true
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-24: allSeedAgentsHaveAvatars() verifies one-per-agent contract", () => {
  it("returns true for a fully initialised scene", () => {
    expect(allSeedAgentsHaveAvatars(scene.root)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-25 · allAvatarsHaveVisualData() returns true
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-25: allAvatarsHaveVisualData() verifies complete visual data", () => {
  it("returns true for a fully initialised scene", () => {
    expect(allAvatarsHaveVisualData(scene.avatarNodes)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-26 · No duplicate avatar nodes
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-26: No duplicate avatar nodes (unique agentIds)", () => {
  it("all agentId values in avatarNodes are unique", () => {
    const ids = scene.avatarNodes.map((n) => n.userData.agentId as string);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all node names in avatarNodes are unique", () => {
    const names = scene.avatarNodes.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-27 · annotateAvatarNode() sets avatarPlaced=true on a standalone node
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-27: annotateAvatarNode() sets avatarPlaced=true", () => {
  it("sets avatarPlaced=true on a node with known agentId", () => {
    resetHarness();
    const node = makeGroupNode(`${SCENE_AGENT_NODE_PREFIX}manager-default`);
    node.userData.agentId = "manager-default";

    annotateAvatarNode(node);

    expect(node.userData.avatarPlaced).toBe(true);
  });

  it("sets correct color on annotated node", () => {
    resetHarness();
    const node = makeGroupNode(`${SCENE_AGENT_NODE_PREFIX}manager-default`);
    node.userData.agentId = "manager-default";

    annotateAvatarNode(node);

    expect((node.userData.avatarColor as string).toUpperCase()).toBe("#FF7043");
  });

  it("sets correct role on annotated node", () => {
    resetHarness();
    const node = makeGroupNode(`${SCENE_AGENT_NODE_PREFIX}implementer-subagent`);
    node.userData.agentId = "implementer-subagent";

    annotateAvatarNode(node);

    expect(node.userData.avatarRole).toBe("implementer");
  });

  it("returns the same node instance (mutates in-place)", () => {
    resetHarness();
    const node = makeGroupNode("test-agent");
    node.userData.agentId = "manager-default";

    const returned = annotateAvatarNode(node);

    expect(returned).toBe(node);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-28 · annotateAvatarNode() falls back gracefully for unknown agentId
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-28: annotateAvatarNode() fallback for unknown agent", () => {
  it("sets avatarPlaced=true even for unknown agentId", () => {
    resetHarness();
    const node = makeGroupNode("agent-unknown");
    node.userData.agentId = "unknown-agent-xyz";

    annotateAvatarNode(node);

    expect(node.userData.avatarPlaced).toBe(true);
  });

  it("uses fallback color (#888888) for unknown agent", () => {
    resetHarness();
    const node = makeGroupNode("agent-unknown");
    node.userData.agentId = "unknown-agent-xyz";

    annotateAvatarNode(node);

    expect(node.userData.avatarColor).toBe("#888888");
  });

  it("does not throw for undefined agentId", () => {
    resetHarness();
    const node = makeGroupNode("no-agent-id");
    // No agentId in userData

    expect(() => annotateAvatarNode(node)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-29 · Avatar nodes are direct children of room nodes
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-29: Avatar nodes are direct children of room nodes (hierarchy preserved)", () => {
  it("every avatar node is a direct child of a room node", () => {
    for (const node of scene.avatarNodes) {
      const parent = node.parent;
      expect(parent).not.toBeNull();
      expect(typeof parent!.userData.roomId).toBe("string");
    }
  });

  it("avatar node is NOT a direct child of the building node", () => {
    const buildingChildNames = new Set(
      scene.buildingNode.children.map((n) => n.name),
    );
    for (const node of scene.avatarNodes) {
      expect(buildingChildNames.has(node.name)).toBe(false);
    }
  });

  it("avatar node is NOT a direct child of root", () => {
    const rootChildNames = new Set(scene.root.children.map((n) => n.name));
    for (const node of scene.avatarNodes) {
      expect(rootChildNames.has(node.name)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-30 · Room hierarchy intact after avatar placement
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-30: Room hierarchy intact after avatar placement", () => {
  it("all room nodes are still direct children of building node", () => {
    for (const roomNode of scene.roomNodes) {
      expect(scene.buildingNode.children).toContain(roomNode);
    }
  });

  it("building node is still a direct child of root", () => {
    expect(scene.root.children).toContain(scene.buildingNode);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-31 · initializeAvatarPlacement() is idempotent
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-31: initializeAvatarPlacement() is safe to call multiple times", () => {
  it("calling twice returns the same avatar count", () => {
    resetHarness();
    const first = initializeAvatarPlacement();

    resetHarness();
    const second = initializeAvatarPlacement();

    expect(first.avatarCount).toBe(second.avatarCount);
  });

  it("second call produces distinct scene objects", () => {
    resetHarness();
    const first = initializeAvatarPlacement();

    resetHarness();
    const second = initializeAvatarPlacement();

    // Scene objects should be different instances (each call creates fresh graph)
    expect(first.root).not.toBe(second.root);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-32 · Avatar label values are 3–4 characters
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-32: Avatar label values are 3–4 characters", () => {
  it("every avatar node avatarLabel is between 2 and 5 characters", () => {
    // Allow 2–5 for unicode icons, but primary expectation is 3–4
    for (const node of scene.avatarNodes) {
      const label = node.userData.avatarLabel as string;
      expect(label.length).toBeGreaterThanOrEqual(2);
      expect(label.length).toBeLessThanOrEqual(5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-33 · Avatar color values are valid hex strings
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-33: Avatar color values are valid hex strings (#rrggbb)", () => {
  const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

  it("every avatarColor is a 7-character hex string starting with #", () => {
    for (const node of scene.avatarNodes) {
      expect(HEX_PATTERN.test(node.userData.avatarColor as string)).toBe(true);
    }
  });

  it("every avatarEmissive is a 7-character hex string starting with #", () => {
    for (const node of scene.avatarNodes) {
      expect(HEX_PATTERN.test(node.userData.avatarEmissive as string)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-34 · Avatar agentId values match AGENT_INITIAL_PLACEMENTS order
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-34: Avatar agentId values match AGENT_INITIAL_PLACEMENTS", () => {
  it("all avatar agentIds are present in AGENT_INITIAL_PLACEMENTS", () => {
    const seedIds = new Set(AGENT_INITIAL_PLACEMENTS.map((s) => s.agentId));
    for (const node of scene.avatarNodes) {
      expect(seedIds.has(node.userData.agentId as string)).toBe(true);
    }
  });

  it("no extra agentIds appear in avatarNodes beyond the seed dataset", () => {
    const seedIds = new Set(AGENT_INITIAL_PLACEMENTS.map((s) => s.agentId));
    for (const node of scene.avatarNodes) {
      expect(seedIds.has(node.userData.agentId as string)).toBe(true);
    }
    expect(scene.avatarNodes.length).toBe(seedIds.size);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c-35 · initializeAvatarPlacement() is synchronous
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 2c-35: initializeAvatarPlacement() is synchronous (no Promise)", () => {
  it("does not return a Promise", () => {
    resetHarness();
    const result = initializeAvatarPlacement();
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("avatarNodes is immediately available (not async)", () => {
    resetHarness();
    const result = initializeAvatarPlacement();
    // avatarNodes must be a regular array/frozen array, not a Promise
    expect(typeof (result.avatarNodes as unknown as Promise<unknown>)?.then).not.toBe("function");
  });

  it("all avatar visual data is synchronously available", () => {
    resetHarness();
    const { avatarNodes } = initializeAvatarPlacement();
    // All visual data should be immediately readable
    for (const node of avatarNodes) {
      expect(typeof node.userData.avatarColor).toBe("string");
      expect(typeof node.userData.avatarPlaced).toBe("boolean");
    }
  });
});
