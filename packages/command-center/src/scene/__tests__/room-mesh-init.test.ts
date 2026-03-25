/**
 * room-mesh-init.test.ts
 *
 * Sub-AC 3 — Instantiate and render at least one room mesh inside the building
 * using the loaded room definitions, with each room displaying a visible role
 * label, verifiable by room count >= 1 and label presence in the scene.
 *
 * Coverage matrix
 * ───────────────
 * 3-1  initializeRoomsInScene() returns a defined result
 * 3-2  roomNodes array is defined and non-empty
 * 3-3  Room count in scene graph is >= 1 (primary AC requirement)
 * 3-4  Room count equals BUILDING.rooms.length (all rooms are in scene)
 * 3-5  Room count is 9 (specific to the static BUILDING)
 * 3-6  All room nodes have a non-empty userData.label (primary label presence AC)
 * 3-7  allRoomNodesHaveLabels() returns true for initialized scene
 * 3-8  No room node has an empty or missing label field
 * 3-9  Room node names follow "hierarchy-room-{roomId}" convention
 * 3-10 Room nodes are direct children of the building node
 * 3-11 Room nodes are NOT direct children of the scene root (they're inside building)
 * 3-12 Room node userData.roomId is non-empty and matches the definition
 * 3-13 Room node userData.roomType is a valid room type string
 * 3-14 Room node userData.name is the room display name from BUILDING
 * 3-15 Room node userData.floor matches the BUILDING room floor
 * 3-16 Room node positions match the room definitions from BUILDING
 * 3-17 Room nodes are visible by default
 * 3-18 queryRoomNodes() returns the same nodes as roomNodes
 * 3-19 queryRoomNode() finds individual rooms by ID
 * 3-20 getRoomCount() returns BUILDING.rooms.length
 * 3-21 getRoomCount() returns >= 1
 * 3-22 Room label values are from the canonical ROOM_TYPE_LABELS set
 * 3-23 getRoomNodeName() returns the correct prefixed name
 * 3-24 Building node userData.roomCount matches actual room count
 * 3-25 Multiple initializeRoomsInScene() calls produce independent graphs
 *
 * Test ID scheme:
 *   3-N : Sub-AC 3 (room mesh instantiation + label presence in scene)
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  initializeRoomsInScene,
  queryRoomNodes,
  queryRoomNode,
  allRoomNodesHaveLabels,
  getRoomCount,
  getRoomNodeName,
  getRoomLabel,
  makeRoomNode,
  ROOM_NODE_PREFIX,
  ROOM_LABEL_FIELD,
  type RoomSceneGraph,
} from "../room-mesh-init.js";
import { resetHarness } from "../../testing/scene-test-harness.js";
import type { SceneNode } from "../../testing/scene-test-harness.js";
import { BUILDING } from "../../data/building.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle — reset harness counters for deterministic node IDs
// ─────────────────────────────────────────────────────────────────────────────

let scene: RoomSceneGraph;

beforeEach(() => {
  resetHarness();
  scene = initializeRoomsInScene();
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-1 · Scene initialization returns a defined result
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-1: Room scene initialization returns a defined result", () => {
  it("initializeRoomsInScene() returns a defined result", () => {
    expect(scene).toBeDefined();
  });

  it("result.root is defined", () => {
    expect(scene.root).toBeDefined();
  });

  it("result.buildingNode is defined", () => {
    expect(scene.buildingNode).toBeDefined();
  });

  it("result.roomNodes is defined", () => {
    expect(scene.roomNodes).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-2 · roomNodes array is non-empty
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-2: roomNodes array is non-empty", () => {
  it("roomNodes is an array", () => {
    expect(Array.isArray(scene.roomNodes)).toBe(true);
  });

  it("roomNodes is non-empty (at least one room node)", () => {
    expect(scene.roomNodes.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-3 · Room count in scene graph is >= 1 (primary AC requirement)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-3: Room count >= 1 (primary acceptance criterion)", () => {
  it("getRoomCount() returns >= 1 (at least one room in scene)", () => {
    expect(getRoomCount(scene.root)).toBeGreaterThanOrEqual(1);
  });

  it("queryRoomNodes() returns a non-empty array", () => {
    const rooms = queryRoomNodes(scene.root);
    expect(rooms.length).toBeGreaterThanOrEqual(1);
  });

  it("scene.roomNodes.length >= 1", () => {
    expect(scene.roomNodes.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-4 · Room count equals BUILDING.rooms.length
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-4: Room count equals BUILDING.rooms.length (all rooms in scene)", () => {
  it("getRoomCount() equals BUILDING.rooms.length", () => {
    expect(getRoomCount(scene.root)).toBe(BUILDING.rooms.length);
  });

  it("scene.roomNodes.length equals BUILDING.rooms.length", () => {
    expect(scene.roomNodes.length).toBe(BUILDING.rooms.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-5 · Room count is 9 (specific to static BUILDING)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-5: Room count is exactly 9 for static BUILDING", () => {
  it("getRoomCount() returns 9", () => {
    expect(getRoomCount(scene.root)).toBe(9);
  });

  it("scene.roomNodes has exactly 9 entries", () => {
    expect(scene.roomNodes).toHaveLength(9);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-6 · All room nodes have non-empty label (primary label presence AC)
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-6: All room nodes have non-empty label (label presence)", () => {
  it("every room node has a userData.label field", () => {
    for (const node of scene.roomNodes) {
      expect(
        node.userData[ROOM_LABEL_FIELD],
        `Room node "${node.name}" is missing userData.label`,
      ).toBeDefined();
    }
  });

  it("every room node label is a non-empty string", () => {
    for (const node of scene.roomNodes) {
      const label = node.userData[ROOM_LABEL_FIELD];
      expect(typeof label, `Room node "${node.name}" label is not a string`).toBe("string");
      expect(
        (label as string).length,
        `Room node "${node.name}" has empty label`,
      ).toBeGreaterThan(0);
    }
  });

  it("label is present on all 9 room nodes", () => {
    const nodesWithLabel = scene.roomNodes.filter(
      (n) => typeof n.userData[ROOM_LABEL_FIELD] === "string" &&
             (n.userData[ROOM_LABEL_FIELD] as string).length > 0,
    );
    expect(nodesWithLabel).toHaveLength(9);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-7 · allRoomNodesHaveLabels() returns true
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-7: allRoomNodesHaveLabels() returns true for initialized scene", () => {
  it("allRoomNodesHaveLabels returns true for scene.roomNodes", () => {
    expect(allRoomNodesHaveLabels(scene.roomNodes)).toBe(true);
  });

  it("allRoomNodesHaveLabels returns false for nodes without labels", () => {
    // Synthesize a node missing a label to verify the check works correctly
    const badNode: SceneNode = {
      ...scene.roomNodes[0]!,
      userData: { roomId: "x" }, // no label field
    };
    expect(allRoomNodesHaveLabels([badNode])).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-8 · No room node has empty or missing label
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-8: No room node has an empty or missing label", () => {
  it("no room node has undefined label", () => {
    for (const node of scene.roomNodes) {
      expect(node.userData[ROOM_LABEL_FIELD]).not.toBeUndefined();
    }
  });

  it("no room node has null label", () => {
    for (const node of scene.roomNodes) {
      expect(node.userData[ROOM_LABEL_FIELD]).not.toBeNull();
    }
  });

  it("no room node has empty string label", () => {
    for (const node of scene.roomNodes) {
      expect(node.userData[ROOM_LABEL_FIELD]).not.toBe("");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-9 · Room node names follow "hierarchy-room-{roomId}" convention
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-9: Room node names follow the canonical convention", () => {
  it("every room node name starts with ROOM_NODE_PREFIX", () => {
    for (const node of scene.roomNodes) {
      expect(
        node.name.startsWith(ROOM_NODE_PREFIX),
        `Room node name "${node.name}" does not start with "${ROOM_NODE_PREFIX}"`,
      ).toBe(true);
    }
  });

  it("room node name equals getRoomNodeName(roomId)", () => {
    for (const node of scene.roomNodes) {
      const roomId = node.userData.roomId as string;
      expect(node.name).toBe(getRoomNodeName(roomId));
    }
  });

  it("ops-control node is named 'hierarchy-room-ops-control'", () => {
    const node = queryRoomNode(scene.root, "ops-control");
    expect(node).toBeDefined();
    expect(node!.name).toBe("hierarchy-room-ops-control");
  });

  it("impl-office node is named 'hierarchy-room-impl-office'", () => {
    const node = queryRoomNode(scene.root, "impl-office");
    expect(node).toBeDefined();
    expect(node!.name).toBe("hierarchy-room-impl-office");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-10 · Room nodes are direct children of the building node
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-10: Room nodes are direct children of the building node", () => {
  it("every room node has building as its parent", () => {
    for (const node of scene.roomNodes) {
      expect(
        node.parent,
        `Room node "${node.name}" has no parent`,
      ).toBe(scene.buildingNode);
    }
  });

  it("building node has the hierarchy-room-* children from room-mesh-init", () => {
    // The building may also contain structural children added by scene-graph-init
    // (e.g. "room-*" logical nodes and "agent-*" nodes from Sub-AC 2a).
    // This test verifies that the hierarchy-room-* nodes from room-mesh-init
    // are all present as direct children of the building node.
    const hierarchyRoomChildren = scene.buildingNode.children.filter((n) =>
      n.name.startsWith("hierarchy-room-"),
    );
    expect(hierarchyRoomChildren).toHaveLength(scene.roomNodes.length);
  });

  it("every room node appears in buildingNode.children", () => {
    for (const node of scene.roomNodes) {
      expect(scene.buildingNode.children).toContain(node);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-11 · Room nodes are NOT direct children of the scene root
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-11: Room nodes are nested inside the building (not scene root)", () => {
  it("scene root has only one direct child (the building node)", () => {
    expect(scene.root.children).toHaveLength(1);
  });

  it("room nodes are NOT in scene root children", () => {
    for (const node of scene.roomNodes) {
      expect(scene.root.children).not.toContain(node);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-12 · Room node userData.roomId is non-empty and matches BUILDING
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-12: Room node userData.roomId is correct", () => {
  it("every room node has a non-empty userData.roomId", () => {
    for (const node of scene.roomNodes) {
      expect(typeof node.userData.roomId).toBe("string");
      expect((node.userData.roomId as string).length).toBeGreaterThan(0);
    }
  });

  it("all 9 canonical room IDs are present in the scene", () => {
    const roomIds = scene.roomNodes.map((n) => n.userData.roomId as string);
    const expectedIds = BUILDING.rooms.map((r) => r.roomId);
    for (const id of expectedIds) {
      expect(roomIds, `Room ID "${id}" missing from scene`).toContain(id);
    }
  });

  it("ops-control userData.roomId is 'ops-control'", () => {
    const node = queryRoomNode(scene.root, "ops-control")!;
    expect(node.userData.roomId).toBe("ops-control");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-13 · Room node userData.roomType is a valid room type string
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-13: Room node userData.roomType is valid", () => {
  const VALID_TYPES = new Set(["control", "office", "lab", "lobby", "archive", "corridor"]);

  it("every room node has a valid userData.roomType", () => {
    for (const node of scene.roomNodes) {
      expect(
        VALID_TYPES.has(node.userData.roomType as string),
        `Invalid roomType "${node.userData.roomType}" on node "${node.name}"`,
      ).toBe(true);
    }
  });

  it("ops-control has roomType 'control'", () => {
    const node = queryRoomNode(scene.root, "ops-control")!;
    expect(node.userData.roomType).toBe("control");
  });

  it("research-lab has roomType 'lab'", () => {
    const node = queryRoomNode(scene.root, "research-lab")!;
    expect(node.userData.roomType).toBe("lab");
  });

  it("project-main has roomType 'lobby'", () => {
    const node = queryRoomNode(scene.root, "project-main")!;
    expect(node.userData.roomType).toBe("lobby");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-14 · Room node userData.name matches BUILDING room display name
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-14: Room node userData.name matches BUILDING room name", () => {
  it("every room node has a non-empty userData.name", () => {
    for (const node of scene.roomNodes) {
      expect(typeof node.userData.name).toBe("string");
      expect((node.userData.name as string).length).toBeGreaterThan(0);
    }
  });

  it("ops-control userData.name is 'Operations Control'", () => {
    const node = queryRoomNode(scene.root, "ops-control")!;
    const buildingRoom = BUILDING.rooms.find((r) => r.roomId === "ops-control")!;
    expect(node.userData.name).toBe(buildingRoom.name);
  });

  it("every room node name matches the corresponding BUILDING room name", () => {
    for (const room of BUILDING.rooms) {
      const node = queryRoomNode(scene.root, room.roomId)!;
      expect(node.userData.name).toBe(room.name);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-15 · Room node userData.floor matches BUILDING room floor
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-15: Room node userData.floor matches BUILDING", () => {
  it("every room node has a numeric userData.floor", () => {
    for (const node of scene.roomNodes) {
      expect(typeof node.userData.floor).toBe("number");
    }
  });

  it("ops-control is on floor 1", () => {
    const node = queryRoomNode(scene.root, "ops-control")!;
    expect(node.userData.floor).toBe(1);
  });

  it("project-main is on floor 0", () => {
    const node = queryRoomNode(scene.root, "project-main")!;
    expect(node.userData.floor).toBe(0);
  });

  it("every room floor matches BUILDING definition", () => {
    for (const room of BUILDING.rooms) {
      const node = queryRoomNode(scene.root, room.roomId)!;
      expect(node.userData.floor, `Floor mismatch for "${room.roomId}"`).toBe(room.floor);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-16 · Room node positions match BUILDING room definitions
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-16: Room node positions match BUILDING definitions", () => {
  it("every room node position.x matches BUILDING room position.x", () => {
    for (const room of BUILDING.rooms) {
      const node = queryRoomNode(scene.root, room.roomId)!;
      expect(node.position.x).toBe(room.position.x);
    }
  });

  it("every room node position.y matches BUILDING room position.y", () => {
    for (const room of BUILDING.rooms) {
      const node = queryRoomNode(scene.root, room.roomId)!;
      expect(node.position.y).toBe(room.position.y);
    }
  });

  it("every room node position.z matches BUILDING room position.z", () => {
    for (const room of BUILDING.rooms) {
      const node = queryRoomNode(scene.root, room.roomId)!;
      expect(node.position.z).toBe(room.position.z);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-17 · Room nodes are visible by default
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-17: Room nodes are visible by default", () => {
  it("every room node is visible", () => {
    for (const node of scene.roomNodes) {
      expect(node.visible, `Room node "${node.name}" is not visible`).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-18 · queryRoomNodes() returns the same nodes as roomNodes
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-18: queryRoomNodes() returns the same nodes as roomNodes", () => {
  it("queryRoomNodes result length matches scene.roomNodes length", () => {
    const found = queryRoomNodes(scene.root);
    expect(found).toHaveLength(scene.roomNodes.length);
  });

  it("queryRoomNodes returns all room nodes by reference", () => {
    const found = queryRoomNodes(scene.root);
    for (const node of scene.roomNodes) {
      expect(found).toContain(node);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-19 · queryRoomNode() finds individual rooms by ID
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-19: queryRoomNode() finds individual rooms by ID", () => {
  it("queryRoomNode finds ops-control", () => {
    const node = queryRoomNode(scene.root, "ops-control");
    expect(node).toBeDefined();
  });

  it("queryRoomNode finds all 9 rooms by ID", () => {
    for (const room of BUILDING.rooms) {
      const node = queryRoomNode(scene.root, room.roomId);
      expect(node, `queryRoomNode failed for room "${room.roomId}"`).toBeDefined();
    }
  });

  it("queryRoomNode returns undefined for non-existent room ID", () => {
    const node = queryRoomNode(scene.root, "non-existent-room");
    expect(node).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-20 · getRoomCount() returns BUILDING.rooms.length
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-20: getRoomCount() returns BUILDING.rooms.length", () => {
  it("getRoomCount equals BUILDING.rooms.length", () => {
    expect(getRoomCount(scene.root)).toBe(BUILDING.rooms.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-21 · getRoomCount() returns >= 1
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-21: getRoomCount() returns >= 1", () => {
  it("getRoomCount() >= 1 (at least one room in scene)", () => {
    expect(getRoomCount(scene.root)).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-22 · Room label values come from the canonical label set
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-22: Room label values are from the canonical set", () => {
  const CANONICAL_LABELS = new Set(["CTRL", "OFFC", "LAB", "MAIN", "ARCH", "PATH"]);

  it("every room node label is in the canonical ROOM_TYPE_LABELS set", () => {
    for (const node of scene.roomNodes) {
      const label = node.userData[ROOM_LABEL_FIELD] as string;
      expect(
        CANONICAL_LABELS.has(label),
        `Unexpected label "${label}" on room node "${node.name}"`,
      ).toBe(true);
    }
  });

  it("control room label is 'CTRL'", () => {
    const node = queryRoomNode(scene.root, "ops-control")!;
    expect(node.userData[ROOM_LABEL_FIELD]).toBe("CTRL");
  });

  it("office room label is 'OFFC'", () => {
    const node = queryRoomNode(scene.root, "impl-office")!;
    expect(node.userData[ROOM_LABEL_FIELD]).toBe("OFFC");
  });

  it("lab room label is 'LAB'", () => {
    const node = queryRoomNode(scene.root, "research-lab")!;
    expect(node.userData[ROOM_LABEL_FIELD]).toBe("LAB");
  });

  it("lobby room label is 'MAIN'", () => {
    const node = queryRoomNode(scene.root, "project-main")!;
    expect(node.userData[ROOM_LABEL_FIELD]).toBe("MAIN");
  });

  it("archive room label is 'ARCH'", () => {
    const node = queryRoomNode(scene.root, "archive-vault")!;
    expect(node.userData[ROOM_LABEL_FIELD]).toBe("ARCH");
  });

  it("corridor room label is 'PATH'", () => {
    const node = queryRoomNode(scene.root, "corridor-main")!;
    expect(node.userData[ROOM_LABEL_FIELD]).toBe("PATH");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-23 · getRoomNodeName() returns the correct prefixed name
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-23: getRoomNodeName() returns correct prefixed name", () => {
  it("getRoomNodeName('ops-control') returns 'hierarchy-room-ops-control'", () => {
    expect(getRoomNodeName("ops-control")).toBe("hierarchy-room-ops-control");
  });

  it("getRoomNodeName always starts with ROOM_NODE_PREFIX", () => {
    const testIds = ["ops-control", "impl-office", "research-lab", "project-main"];
    for (const id of testIds) {
      expect(getRoomNodeName(id).startsWith(ROOM_NODE_PREFIX)).toBe(true);
    }
  });

  it("ROOM_NODE_PREFIX is 'hierarchy-room-'", () => {
    expect(ROOM_NODE_PREFIX).toBe("hierarchy-room-");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-24 · Building node userData.roomCount matches actual room count
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-24: Building node userData.roomCount matches actual rooms", () => {
  it("building userData.roomCount equals scene.roomNodes.length", () => {
    expect(scene.buildingNode.userData.roomCount).toBe(scene.roomNodes.length);
  });

  it("building userData.roomCount equals getRoomCount(root)", () => {
    expect(scene.buildingNode.userData.roomCount).toBe(getRoomCount(scene.root));
  });

  it("building userData.roomCount is 9", () => {
    expect(scene.buildingNode.userData.roomCount).toBe(9);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3-25 · Multiple initializeRoomsInScene() calls produce independent graphs
// ═════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 3-25: Multiple initialization calls produce independent scene graphs", () => {
  it("two initializeRoomsInScene() calls produce different root nodes", () => {
    const scene2 = initializeRoomsInScene();
    expect(scene2.root).not.toBe(scene.root);
  });

  it("two initializeRoomsInScene() calls produce different building nodes", () => {
    const scene2 = initializeRoomsInScene();
    expect(scene2.buildingNode).not.toBe(scene.buildingNode);
  });

  it("both scenes have the same room count", () => {
    const scene2 = initializeRoomsInScene();
    expect(getRoomCount(scene2.root)).toBe(getRoomCount(scene.root));
  });

  it("room nodes from different scenes are independent objects", () => {
    const scene2 = initializeRoomsInScene();
    for (const node1 of scene.roomNodes) {
      for (const node2 of scene2.roomNodes) {
        // Same logical room → different node objects (independent graphs)
        if (node1.userData.roomId === node2.userData.roomId) {
          expect(node1).not.toBe(node2);
        }
      }
    }
  });
});
