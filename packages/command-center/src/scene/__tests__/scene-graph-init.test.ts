/**
 * scene-graph-init.test.ts
 *
 * Sub-AC 1: Initialize a 3D scene and place a single building entity in the
 * scene graph, verifiable by querying the scene graph for a building node.
 *
 * Coverage matrix
 * ───────────────
 * 1-1  initializeCommandCenterScene() returns a defined result
 * 1-2  Scene root exists, is named "Scene", and has type "Scene"
 * 1-3  Building node is present (queryBuildingNode returns a node)
 * 1-4  Building node has name "hierarchy-building"
 * 1-5  Building node has type "Group"
 * 1-6  Scene contains exactly one building node (hasSingleBuildingNode)
 * 1-7  Building node userData carries the canonical buildingId "command-center"
 * 1-8  Building node userData carries buildingName, floorCount, style, roomCount
 * 1-9  Building node is a direct child of the root scene node
 * 1-10 Building node position is at the world origin (0, 0, 0)
 * 1-11 Building node is visible by default
 * 1-12 queryBuildingNode returns undefined for an empty scene
 * 1-13 SCENE_BUILDING_NODE_NAME constant matches the group name in SceneHierarchy.tsx
 *
 * Test ID scheme:
 *   1-N : Sub-AC 1 (scene graph init + building entity placement)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  initializeCommandCenterScene,
  queryBuildingNode,
  hasSingleBuildingNode,
  SCENE_BUILDING_NODE_NAME,
  SCENE_ROOT_NAME,
  type CommandCenterSceneGraph,
} from "../scene-graph-init.js";
import { makeScene, resetHarness } from "../../testing/scene-test-harness.js";
import { BUILDING } from "../../data/building.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle — reset harness counters for deterministic node IDs
// ─────────────────────────────────────────────────────────────────────────────

let scene: CommandCenterSceneGraph;

beforeEach(() => {
  resetHarness();
  scene = initializeCommandCenterScene();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-1 · Scene initialization returns a defined result
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-1: Scene initialization", () => {
  it("initializeCommandCenterScene() returns a defined result", () => {
    expect(scene).toBeDefined();
  });

  it("result.root is defined", () => {
    expect(scene.root).toBeDefined();
  });

  it("result.buildingNode is defined", () => {
    expect(scene.buildingNode).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-2 · Scene root node
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-2: Scene root node", () => {
  it("root node is named 'Scene'", () => {
    expect(scene.root.name).toBe(SCENE_ROOT_NAME);
  });

  it("root node has type 'Scene'", () => {
    expect(scene.root.type).toBe("Scene");
  });

  it("root node has exactly one top-level child (the building node)", () => {
    expect(scene.root.children).toHaveLength(1);
  });

  it("root node has no parent (it is the scene root)", () => {
    expect(scene.root.parent).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-3 · Building node is present in the scene graph
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-3: Building node present in scene graph", () => {
  it("queryBuildingNode returns a node (not undefined)", () => {
    const node = queryBuildingNode(scene.root);
    expect(node).toBeDefined();
  });

  it("queryBuildingNode result is the same reference as buildingNode", () => {
    const node = queryBuildingNode(scene.root);
    expect(node).toBe(scene.buildingNode);
  });

  it("building node can be found after scene initialization", () => {
    // Re-initialize and verify the building node is always findable
    const { root } = initializeCommandCenterScene();
    const found = queryBuildingNode(root);
    expect(found).toBeDefined();
    expect(found!.name).toBe(SCENE_BUILDING_NODE_NAME);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-4 · Building node name
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-4: Building node name", () => {
  it("building node name equals SCENE_BUILDING_NODE_NAME constant", () => {
    expect(scene.buildingNode.name).toBe(SCENE_BUILDING_NODE_NAME);
  });

  it("building node name is literally 'hierarchy-building'", () => {
    expect(scene.buildingNode.name).toBe("hierarchy-building");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-5 · Building node type
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-5: Building node type", () => {
  it("building node type is 'Group'", () => {
    expect(scene.buildingNode.type).toBe("Group");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-6 · Exactly one building node in scene
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-6: Exactly one building node in scene", () => {
  it("hasSingleBuildingNode returns true for initialized scene", () => {
    expect(hasSingleBuildingNode(scene.root)).toBe(true);
  });

  it("hasSingleBuildingNode returns false for empty scene", () => {
    const emptyScene = makeScene();
    expect(hasSingleBuildingNode(emptyScene)).toBe(false);
  });

  it("building node count is 1 (not 0 or multiple)", () => {
    // Confirm there is precisely one building node
    let count = 0;
    function traverse(node: typeof scene.root): void {
      if (node.name === SCENE_BUILDING_NODE_NAME) count++;
      for (const child of node.children) traverse(child);
    }
    traverse(scene.root);
    expect(count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-7 · Building node userData — canonical buildingId
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-7: Building node userData.buildingId", () => {
  it("buildingId matches BUILDING.buildingId", () => {
    expect(scene.buildingNode.userData.buildingId).toBe(BUILDING.buildingId);
  });

  it("buildingId is 'command-center'", () => {
    expect(scene.buildingNode.userData.buildingId).toBe("command-center");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-8 · Building node userData — complete metadata
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-8: Building node userData completeness", () => {
  it("buildingName is present and matches BUILDING.name", () => {
    expect(scene.buildingNode.userData.buildingName).toBe(BUILDING.name);
  });

  it("floorCount is present and matches BUILDING.floors.length", () => {
    expect(scene.buildingNode.userData.floorCount).toBe(BUILDING.floors.length);
  });

  it("floorCount is 2", () => {
    expect(scene.buildingNode.userData.floorCount).toBe(2);
  });

  it("style is present and matches BUILDING.style", () => {
    expect(scene.buildingNode.userData.style).toBe(BUILDING.style);
  });

  it("style is 'low-poly-dark'", () => {
    expect(scene.buildingNode.userData.style).toBe("low-poly-dark");
  });

  it("roomCount is present and matches BUILDING.rooms.length", () => {
    expect(scene.buildingNode.userData.roomCount).toBe(BUILDING.rooms.length);
  });

  it("roomCount is greater than 0", () => {
    expect(scene.buildingNode.userData.roomCount).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-9 · Building node is a direct child of root
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-9: Building node parent relationship", () => {
  it("building node parent is the root scene node", () => {
    expect(scene.buildingNode.parent).toBe(scene.root);
  });

  it("building node appears in root.children array", () => {
    expect(scene.root.children).toContain(scene.buildingNode);
  });

  it("building node parent is not null (it has been added to the scene)", () => {
    expect(scene.buildingNode.parent).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-10 · Building node position
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-10: Building node position at world origin", () => {
  it("building node position.x is 0", () => {
    expect(scene.buildingNode.position.x).toBe(0);
  });

  it("building node position.y is 0", () => {
    expect(scene.buildingNode.position.y).toBe(0);
  });

  it("building node position.z is 0", () => {
    expect(scene.buildingNode.position.z).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-11 · Building node visibility
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-11: Building node visibility", () => {
  it("building node is visible by default", () => {
    expect(scene.buildingNode.visible).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-12 · queryBuildingNode on scene without building
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-12: queryBuildingNode returns undefined for empty scene", () => {
  it("returns undefined for an empty scene", () => {
    const emptyScene = makeScene();
    const result = queryBuildingNode(emptyScene);
    expect(result).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1-13 · SCENE_BUILDING_NODE_NAME matches SceneHierarchy.tsx runtime name
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 1-13: Node name alignment with SceneHierarchy.tsx", () => {
  it("SCENE_BUILDING_NODE_NAME is 'hierarchy-building'", () => {
    // This constant must stay synchronized with the `name` prop on the
    // Three.js Group in SceneHierarchy.tsx:
    //
    //   export function HierarchySceneGraph() {
    //     return (
    //       <group name="hierarchy-building">  ← must match
    //
    // and with BuildingNode:
    //
    //   export function BuildingNode() {
    //     return (
    //       <group name="hierarchy-building">  ← must match
    //
    expect(SCENE_BUILDING_NODE_NAME).toBe("hierarchy-building");
  });
});
