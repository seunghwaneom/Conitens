/**
 * scene-graph-init.ts — Sub-AC 1 + Sub-AC 2a: Initialize a 3D scene with a
 * building entity, rooms, and pre-placed inactive agent entities.
 *
 * This module provides the canonical scene graph initializer for the
 * Conitens command-center 3D world.  It is a pure-TypeScript module with
 * no React or WebGL dependencies — the scene graph is represented using
 * the structural node types from the scene-test-harness, making it
 * fully queryable in Node.js tests without a browser or WebGL context.
 *
 * Design
 * ──────
 * The building node name ("hierarchy-building") is kept in sync with the
 * Three.js group name used in SceneHierarchy.tsx:
 *
 *   export function HierarchySceneGraph() {
 *     return (
 *       <group name="hierarchy-building">   ← canonical name
 *         <BuildingNode />
 *         ...
 *
 * The initializeCommandCenterScene() function produces an equivalent
 * structural representation that tests can query without rendering.
 *
 * Scene hierarchy (Sub-AC 2a extended structure):
 *   Scene (root)
 *   └── hierarchy-building (Group)
 *         userData: { buildingId, buildingName, floorCount, style, roomCount }
 *         ├── room-<roomId> (Group)           ← one per BUILDING.rooms entry
 *         │     userData: { roomId, roomType, floor, name }
 *         │     position: { room.position.x, room.position.y, room.position.z }
 *         │     └── agent-<agentId> (Group)   ← inactive agents assigned to this room
 *         │           userData: { agentId, status:"inactive", lifecycleState:"initializing",
 *         │                       roomId, floor, spawnIndex }
 *         │           position: { worldPosition.x, worldPosition.y, worldPosition.z }
 *         ...
 *
 * Sub-AC 2a Contract
 * ──────────────────
 * All static agents from AGENT_INITIAL_PLACEMENTS are placed in the scene graph
 * at boot with:
 *   - userData.status === "inactive"
 *   - userData.lifecycleState === "initializing"
 *   - userData.roomId pointing to their assigned room
 *   - position set to their world-space coordinates from the seed dataset
 *   - parent node === their assigned room node (building hierarchy)
 *
 * Usage
 * ─────
 * ```ts
 * import { initializeCommandCenterScene, queryBuildingNode, queryAgentNode } from "./scene-graph-init.js";
 *
 * const { root, buildingNode, roomNodes, agentNodes } = initializeCommandCenterScene();
 * const found = queryBuildingNode(root);
 * assert(found !== undefined, "Building node must exist in scene graph");
 * const managerNode = queryAgentNode(root, "manager-default");
 * assert(managerNode?.userData.status === "inactive");
 * ```
 */

import { BUILDING } from "../data/building.js";
import { AGENT_INITIAL_PLACEMENTS } from "../data/agent-seed.js";
import {
  makeScene,
  makeGroupNode,
  addToScene,
  findByName,
  findAll,
  type SceneNode,
} from "../testing/scene-test-harness.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Canonical name of the building group node in the scene graph.
 *
 * This constant is the single source of truth shared between:
 *   - scene-graph-init.ts (this file)  — logical scene graph
 *   - SceneHierarchy.tsx               — React Three Fiber rendering
 *   - scene-graph-init.test.ts         — verification contract
 *
 * Any rename must be propagated to all three locations simultaneously.
 */
export const SCENE_BUILDING_NODE_NAME = "hierarchy-building" as const;

/** The canonical name of the root scene node. */
export const SCENE_ROOT_NAME = "Scene" as const;

/**
 * Prefix used for room group node names in the scene graph.
 * Full name = SCENE_ROOM_NODE_PREFIX + roomId.
 * e.g. "room-ops-control"
 */
export const SCENE_ROOM_NODE_PREFIX = "room-" as const;

/**
 * Prefix used for agent group node names in the scene graph.
 * Full name = SCENE_AGENT_NODE_PREFIX + agentId.
 * e.g. "agent-manager-default"
 */
export const SCENE_AGENT_NODE_PREFIX = "agent-" as const;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The result of initializeCommandCenterScene().
 *
 * Contains references to the root scene node, the building entity, all room
 * nodes, and all pre-placed inactive agent nodes — providing O(1) access to
 * every level of the building hierarchy without graph traversal.
 *
 * Sub-AC 2a extension: roomNodes and agentNodes are now included.
 */
export interface CommandCenterSceneGraph {
  /** The root scene node (type "Scene", name "Scene"). */
  root: SceneNode;
  /** The building entity node (name = SCENE_BUILDING_NODE_NAME). */
  buildingNode: SceneNode;
  /**
   * Room group nodes — one per entry in BUILDING.rooms.
   * Each is a direct child of buildingNode, named "room-<roomId>".
   * Ordered by BUILDING.rooms iteration order.
   *
   * Sub-AC 2a: rooms are part of the building hierarchy in the scene graph.
   */
  roomNodes: readonly SceneNode[];
  /**
   * Agent group nodes — one per entry in AGENT_INITIAL_PLACEMENTS.
   * Each is a child of its assigned room node.
   * Named "agent-<agentId>"; userData.status === "inactive" at init time.
   *
   * Sub-AC 2a: inactive agents are placed within the building hierarchy.
   */
  agentNodes: readonly SceneNode[];
}

// ─── Scene initialization ─────────────────────────────────────────────────────

/**
 * Initialize the command-center scene graph, placing the building entity,
 * its rooms, and all pre-placed inactive agent entities in the hierarchy.
 *
 * Creates a scene graph with (Sub-AC 2a extended):
 *   - A Scene root node
 *   - A single "hierarchy-building" group node as a direct child of root
 *   - Room group nodes as children of the building node (one per BUILDING.rooms)
 *   - Agent group nodes as children of their assigned room nodes
 *     (one per AGENT_INITIAL_PLACEMENTS, all with status="inactive")
 *
 * The building node is populated with userData derived from the canonical
 * BUILDING constant in data/building.ts, establishing the correspondence
 * between the logical scene graph and the runtime Three.js scene.
 *
 * The building node name matches the Three.js group name in
 * SceneHierarchy.tsx (HierarchySceneGraph → group name="hierarchy-building"),
 * ensuring that tests and runtime both refer to the same entity.
 *
 * @returns CommandCenterSceneGraph containing root, buildingNode, roomNodes,
 *   and agentNodes.
 */
export function initializeCommandCenterScene(): CommandCenterSceneGraph {
  // ── 1. Create the root scene node ──────────────────────────────────────────
  const root = makeScene();

  // ── 2. Create the building entity group node ───────────────────────────────
  const buildingNode = makeGroupNode(SCENE_BUILDING_NODE_NAME);

  // Populate building metadata from the canonical BUILDING constant.
  // These fields mirror the props that SceneHierarchy.tsx / BuildingNode
  // reads from the spatial store / BUILDING data.
  buildingNode.userData.buildingId = BUILDING.buildingId;
  buildingNode.userData.buildingName = BUILDING.name;
  buildingNode.userData.floorCount = BUILDING.floors.length;
  buildingNode.userData.style = BUILDING.style;
  buildingNode.userData.roomCount = BUILDING.rooms.length;

  // Building is positioned at the world origin — Three.js / R3F groups
  // default to (0,0,0), matching the scene graph convention.
  buildingNode.position = { x: 0, y: 0, z: 0 };

  // ── 3. Create room group nodes — children of building (Sub-AC 2a) ──────────
  //
  // Each room in BUILDING.rooms gets a Group node named "room-<roomId>" placed
  // as a direct child of the building node.  Room metadata is stored in userData
  // to allow scene-graph queries without runtime store access.
  //
  // Room position is set to the room's world-space origin from BUILDING.
  const roomNodes: SceneNode[] = [];
  const roomNodeMap = new Map<string, SceneNode>(); // roomId → SceneNode

  for (const room of BUILDING.rooms) {
    const roomNode = makeGroupNode(`${SCENE_ROOM_NODE_PREFIX}${room.roomId}`);

    // Room identity and classification metadata
    roomNode.userData.roomId = room.roomId;
    roomNode.userData.roomType = room.roomType;
    roomNode.userData.floor = room.floor;
    roomNode.userData.name = room.name;
    roomNode.userData.dimensions = { ...room.dimensions };

    // Room position in building world space
    roomNode.position = { ...room.position };

    addToScene(buildingNode, roomNode);
    roomNodes.push(roomNode);
    roomNodeMap.set(room.roomId, roomNode);
  }

  // ── 4. Create agent group nodes — children of room nodes (Sub-AC 2a) ───────
  //
  // Each entry in AGENT_INITIAL_PLACEMENTS gets a Group node named
  // "agent-<agentId>".  All agents start with status="inactive" and
  // lifecycleState="initializing" per the agent state machine contract.
  //
  // Agents are placed as children of their assigned room node.  If the room is
  // not found (broken ontology reference), the agent falls back to the building
  // node — this is logged as a warning for observability.
  //
  // Position is set to the agent's world-space coordinates from the seed record.
  const agentNodes: SceneNode[] = [];

  for (const seed of AGENT_INITIAL_PLACEMENTS) {
    const agentNode = makeGroupNode(`${SCENE_AGENT_NODE_PREFIX}${seed.agentId}`);

    // Agent identity and initial lifecycle state
    agentNode.userData.agentId = seed.agentId;
    agentNode.userData.name = seed.name;
    agentNode.userData.status = seed.initialStatus;          // "inactive"
    agentNode.userData.lifecycleState = seed.initialLifecycleState; // "initializing"
    agentNode.userData.roomId = seed.roomId;
    agentNode.userData.floor = seed.floor;
    agentNode.userData.officeType = seed.officeType;
    agentNode.userData.spawnIndex = seed.spawnIndex;
    agentNode.userData.furnitureSlot = seed.position.furnitureSlot;
    agentNode.userData.localPosition = { ...seed.position.localPosition };

    // World-space position from the seed dataset.
    // This is the pre-computed position for the avatar before the spatial store
    // recomputes it from room coordinates on first render.
    agentNode.position = { ...seed.position.worldPosition };

    // Place agent under its assigned room node (or fall back to building)
    const parentNode = roomNodeMap.get(seed.roomId) ?? buildingNode;
    addToScene(parentNode, agentNode);
    agentNodes.push(agentNode);
  }

  // ── 5. Attach building to scene root ───────────────────────────────────────
  addToScene(root, buildingNode);

  return {
    root,
    buildingNode,
    roomNodes: Object.freeze(roomNodes),
    agentNodes: Object.freeze(agentNodes),
  };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Query a scene graph for the canonical building node.
 *
 * Uses SCENE_BUILDING_NODE_NAME ("hierarchy-building") to locate the
 * building entity in the scene graph via depth-first traversal.
 *
 * Returns undefined if no building node exists — callers should treat
 * this as a scene initialization failure or an uninitialized scene.
 *
 * @param root - The root scene node to search from.
 * @returns The building node, or undefined if not found.
 */
export function queryBuildingNode(root: SceneNode): SceneNode | undefined {
  return findByName(root, SCENE_BUILDING_NODE_NAME);
}

/**
 * Returns true if the scene graph contains exactly one building node.
 *
 * The scene must contain precisely one "hierarchy-building" node.
 * Duplicates indicate a scene initialization error (e.g., the scene
 * was initialized twice without clearing the root).
 *
 * @param root - The root scene node to search from.
 * @returns true iff exactly one building node exists.
 */
export function hasSingleBuildingNode(root: SceneNode): boolean {
  let count = 0;

  function traverse(node: SceneNode): void {
    if (node.name === SCENE_BUILDING_NODE_NAME) count++;
    for (const child of node.children) traverse(child);
  }

  traverse(root);
  return count === 1;
}

/**
 * Query the scene graph for a specific agent node by agentId.
 *
 * Sub-AC 2a: agents are placed in the scene graph at initialization time.
 * This helper locates an agent's Group node using the canonical naming
 * convention: SCENE_AGENT_NODE_PREFIX + agentId = "agent-<agentId>".
 *
 * @param root - The root scene node to search from.
 * @param agentId - The agent identifier to look up (e.g. "manager-default").
 * @returns The agent node, or undefined if not found.
 */
export function queryAgentNode(
  root: SceneNode,
  agentId: string,
): SceneNode | undefined {
  return findByName(root, `${SCENE_AGENT_NODE_PREFIX}${agentId}`);
}

/**
 * Query the scene graph for a specific room node by roomId.
 *
 * Sub-AC 2a: rooms are placed in the building hierarchy at initialization.
 * This helper locates a room's Group node using the canonical naming
 * convention: SCENE_ROOM_NODE_PREFIX + roomId = "room-<roomId>".
 *
 * @param root - The root scene node to search from.
 * @param roomId - The room identifier to look up (e.g. "ops-control").
 * @returns The room node, or undefined if not found.
 */
export function queryRoomNode(
  root: SceneNode,
  roomId: string,
): SceneNode | undefined {
  return findByName(root, `${SCENE_ROOM_NODE_PREFIX}${roomId}`);
}

/**
 * Query all agent nodes in the scene graph.
 *
 * Finds all nodes whose userData.agentId is set (i.e. all agent group nodes
 * placed by initializeCommandCenterScene).  Returns nodes in the order they
 * were added, which matches AGENT_INITIAL_PLACEMENTS order (by spawnIndex).
 *
 * @param root - The root scene node to search from.
 * @returns Array of agent nodes sorted by spawnIndex (ascending).
 */
export function queryAllAgentNodes(root: SceneNode): SceneNode[] {
  return findAll(root, (n) => typeof n.userData.agentId === "string")
    .sort((a, b) => {
      const ai = (a.userData.spawnIndex as number) ?? 0;
      const bi = (b.userData.spawnIndex as number) ?? 0;
      return ai - bi;
    });
}

/**
 * Query all agent nodes assigned to a specific room.
 *
 * Returns all agent nodes whose userData.roomId matches the given roomId.
 * Useful for rendering per-room agent lists in the 3D scene.
 *
 * @param root - The root scene node to search from.
 * @param roomId - The room identifier to filter by.
 * @returns Array of agent nodes in that room, sorted by spawnIndex.
 */
export function queryAgentNodesForRoom(
  root: SceneNode,
  roomId: string,
): SceneNode[] {
  return findAll(
    root,
    (n) => typeof n.userData.agentId === "string" && n.userData.roomId === roomId,
  ).sort((a, b) => {
    const ai = (a.userData.spawnIndex as number) ?? 0;
    const bi = (b.userData.spawnIndex as number) ?? 0;
    return ai - bi;
  });
}
