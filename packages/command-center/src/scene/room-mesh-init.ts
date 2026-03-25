/**
 * room-mesh-init.ts — Sub-AC 3: Instantiate room meshes inside the building.
 *
 * Creates room group nodes for each room in the building, placed inside the
 * building node with role labels attached as userData for scene graph querying.
 *
 * Sub-AC 3 verification contract:
 *   - roomCount >= 1 (at least one room node in scene)
 *   - All room nodes have non-empty userData.label (visible role label)
 *   - Room nodes are direct children of the building node
 *   - Room node names follow "hierarchy-room-{roomId}" convention
 *     (mirrors the Three.js group name in SceneHierarchy.tsx)
 *
 * Design
 * ──────
 * This module provides the canonical scene graph initializer for Sub-AC 3.
 * It is a pure-TypeScript module with no React or WebGL dependencies —
 * the scene graph is represented using the structural node types from the
 * scene-test-harness, making it fully queryable in Node.js tests without
 * a browser or WebGL context.
 *
 * Room node convention:
 *   - Name:  "hierarchy-room-{roomId}"  (canonical, synced with SceneHierarchy.tsx)
 *   - Type:  "Group"
 *   - userData.roomId      — room identifier
 *   - userData.roomType    — room type (control | office | lab | lobby | archive | corridor)
 *   - userData.label       — visible role label text (e.g. "CTRL", "OFFC", "LAB")
 *   - userData.name        — room display name (e.g. "Operations Control")
 *   - userData.floor       — floor index (0 = ground, 1 = operations)
 *   - userData.colorAccent — hex accent color for the room volume
 *   - userData.dimensions  — Vec3 room extents in grid units
 *   - userData.center      — Vec3 world-space center
 *
 * The "label" field is the short role identifier shown on the diegetic
 * role badge (e.g. "CTRL" for control room), consistent with
 * ROLE_VISUALS.label in RoomTypeVisuals.tsx.
 *
 * Usage
 * ─────
 * ```ts
 * import { initializeRoomsInScene, queryRoomNodes, getRoomCount } from "./room-mesh-init.js";
 *
 * const { root, buildingNode, roomNodes } = initializeRoomsInScene();
 * assert(getRoomCount(root) >= 1, "At least one room must be present in the scene");
 * assert(allRoomNodesHaveLabels(roomNodes), "All rooms must have visible role labels");
 * ```
 */

import { BUILDING, type RoomDef, type RoomType } from "../data/building.js";
import {
  makeGroupNode,
  addToScene,
  findAll,
  type SceneNode,
} from "../testing/scene-test-harness.js";
import {
  initializeCommandCenterScene,
  type CommandCenterSceneGraph,
} from "./scene-graph-init.js";

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Prefix for room group node names in the scene graph.
 * Must stay in sync with SceneHierarchy.tsx:
 *
 *   <group name={`hierarchy-room-${room.roomId}`}>
 *
 * Any rename must be propagated to:
 *   - room-mesh-init.ts (this file)
 *   - SceneHierarchy.tsx
 *   - room-mesh-init.test.ts
 */
export const ROOM_NODE_PREFIX = "hierarchy-room-" as const;

/** Canonical userData field name for the visible role label. */
export const ROOM_LABEL_FIELD = "label" as const;

// ── Role label map ─────────────────────────────────────────────────────────

/**
 * Short role label for each room type.
 *
 * These values mirror ROLE_VISUALS.label in RoomTypeVisuals.tsx
 * (defined separately here to avoid importing from a React/Three.js module).
 *
 * The label is the text shown on the diegetic role badge floating above each room:
 *   control  → "CTRL"   (Command Center)
 *   office   → "OFFC"   (Office)
 *   lab      → "LAB"    (Research Lab)
 *   lobby    → "MAIN"   (Lobby / Entry)
 *   archive  → "ARCH"   (Archive)
 *   corridor → "PATH"   (Corridor / Passage)
 */
const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  control: "CTRL",
  office: "OFFC",
  lab: "LAB",
  lobby: "MAIN",
  archive: "ARCH",
  corridor: "PATH",
};

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of initializeRoomsInScene().
 *
 * Extends CommandCenterSceneGraph with the array of room nodes
 * added to the building, allowing callers to query either the
 * full scene hierarchy or the room list directly.
 */
export interface RoomSceneGraph extends CommandCenterSceneGraph {
  /** All room nodes placed inside the building (one per BUILDING.rooms entry). */
  roomNodes: SceneNode[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get the canonical scene graph node name for a room.
 *
 * @param roomId - The room identifier (e.g. "ops-control", "impl-office").
 * @returns The canonical node name (e.g. "hierarchy-room-ops-control").
 */
export function getRoomNodeName(roomId: string): string {
  return `${ROOM_NODE_PREFIX}${roomId}`;
}

/**
 * Get the visible role label text for a room.
 *
 * Returns the short role label from ROOM_TYPE_LABELS (e.g. "CTRL" for control).
 * Falls back to the roomType string if the type is unknown.
 *
 * @param room - The room definition from BUILDING.
 * @returns The role label text displayed on the diegetic badge.
 */
export function getRoomLabel(room: RoomDef): string {
  return ROOM_TYPE_LABELS[room.roomType] ?? room.roomType;
}

/**
 * Create a scene node for a single room definition.
 *
 * The node is positioned at the room's world-space origin and carries
 * all metadata needed for scene rendering and label display in userData.
 *
 * @param room - The room definition from BUILDING.rooms.
 * @returns A SceneNode (Group) for this room.
 */
export function makeRoomNode(room: RoomDef): SceneNode {
  const node = makeGroupNode(getRoomNodeName(room.roomId));

  // World-space position at the room's grid origin
  node.position = {
    x: room.position.x,
    y: room.position.y,
    z: room.position.z,
  };

  // Core identifiers
  node.userData.roomId = room.roomId;
  node.userData.roomType = room.roomType;

  // Visible role label (the diegetic badge text shown above the room)
  node.userData[ROOM_LABEL_FIELD] = getRoomLabel(room);

  // Room display name (secondary badge line, e.g. "Operations Control")
  node.userData.name = room.name;

  // Spatial metadata
  node.userData.floor = room.floor;
  node.userData.dimensions = { ...room.dimensions };
  node.userData.center = { ...room.positionHint.center };

  // Visual accent color (used for floor stripe and edge glow)
  node.userData.colorAccent = room.colorAccent;

  return node;
}

// ── Scene initialization ───────────────────────────────────────────────────

/**
 * Initialize the command-center scene graph and place room nodes
 * inside the building using the loaded room definitions.
 *
 * Extends `initializeCommandCenterScene()` from scene-graph-init.ts
 * to add room nodes as direct children of the building node.
 *
 * This function implements Sub-AC 3:
 *   "Instantiate and render at least one room mesh inside the building
 *   using the loaded room definitions, with each room displaying a
 *   visible role label."
 *
 * Room placement:
 *   - One room node per BUILDING.rooms entry
 *   - Each room is a direct child of buildingNode
 *   - Each room carries userData.label (role badge text) and userData.name
 *   - Room positions match the spatial definitions in BUILDING.rooms
 *
 * @returns RoomSceneGraph containing root, buildingNode, and roomNodes.
 */
export function initializeRoomsInScene(): RoomSceneGraph {
  // Step 1: bootstrap from the building scene graph (Sub-AC 1)
  const { root, buildingNode } = initializeCommandCenterScene();

  // Step 2: create one room node per room definition from the canonical BUILDING
  const roomNodes: SceneNode[] = BUILDING.rooms.map(makeRoomNode);

  // Step 3: add all room nodes as direct children of the building node
  for (const roomNode of roomNodes) {
    addToScene(buildingNode, roomNode);
  }

  // Step 4: update building metadata to reflect actual room count
  buildingNode.userData.roomCount = roomNodes.length;

  return { root, buildingNode, roomNodes, agentNodes: [] };
}

// ── Query helpers ──────────────────────────────────────────────────────────

/**
 * Find all room nodes in the scene graph by name prefix.
 *
 * Returns all nodes whose name starts with ROOM_NODE_PREFIX
 * ("hierarchy-room-"), in depth-first traversal order.
 *
 * @param root - The root scene node to search from.
 * @returns Array of room nodes (may be empty if no rooms are initialized).
 */
export function queryRoomNodes(root: SceneNode): SceneNode[] {
  return findAll(root, (n) => n.name.startsWith(ROOM_NODE_PREFIX));
}

/**
 * Find a specific room node by room ID.
 *
 * @param root   - The root scene node to search from.
 * @param roomId - The room identifier (e.g. "ops-control").
 * @returns The room node, or undefined if not found.
 */
export function queryRoomNode(
  root: SceneNode,
  roomId: string,
): SceneNode | undefined {
  const name = getRoomNodeName(roomId);
  return findAll(root, (n) => n.name === name)[0];
}

/**
 * Returns true if every room node has a non-empty label field.
 *
 * This is the primary verification function for Sub-AC 3 "label presence".
 * A label is present when userData[ROOM_LABEL_FIELD] is a non-empty string.
 *
 * @param roomNodes - Array of room SceneNode objects to check.
 * @returns true iff every node has a non-empty label.
 */
export function allRoomNodesHaveLabels(roomNodes: SceneNode[]): boolean {
  return roomNodes.every((n) => {
    const label = n.userData[ROOM_LABEL_FIELD];
    return typeof label === "string" && label.length > 0;
  });
}

/**
 * Count the number of room nodes in the scene graph.
 *
 * This is the primary verification function for Sub-AC 3 "room count >= 1".
 *
 * @param root - The root scene node to search from.
 * @returns The number of room nodes present in the scene.
 */
export function getRoomCount(root: SceneNode): number {
  return queryRoomNodes(root).length;
}
