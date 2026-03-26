/**
 * @module scene-test-harness
 * Sub-AC 14.1 — Baseline scene test harness for the 3D command-center.
 *
 * Provides a set of factory functions, assertion helpers, and lightweight
 * mock objects that cover the primary concerns of 3D scene testing:
 *
 *   1. Pure-math helpers — Vector3, Matrix4, Box3 operations without Three.js
 *   2. Scene-graph stubs — minimal Object3D / Mesh / Group equivalents
 *   3. Scene-state snapshots — capture and compare observable scene state
 *   4. Event simulation — pointer events mapped to the intent matrix
 *   5. Assertion helpers — geometry bounds, position, rotation, color, LOD
 *
 * Architecture
 * ────────────
 * All exports are pure-Node compatible (no DOM, no WebGL, no React required).
 * The harness is intentionally decoupled from Three.js type imports to remain
 * runnable in the default Vitest Node environment.
 *
 * Where Three.js types are referenced they are declared as structural
 * interfaces so that real Three.js objects AND mock objects satisfy them.
 *
 * Design decisions
 * ────────────────
 * • Record transparency — `SceneSnapshot` captures a frozen, serialisable
 *   view of the scene graph.  Tests compare snapshots to assert deterministic
 *   rendering.
 * • No renderer coupling — the harness does not import WebGLRendererMock.
 *   Tests that need GPU-level assertions should compose this module with
 *   `three-renderer-mock.ts` directly.
 * • Stable identifiers — every mock object is assigned a stable numeric ID
 *   via an internal counter, giving deterministic output in snapshot diffs.
 */

// ─── Vector / Matrix helpers ─────────────────────────────────────────────

/** Minimal 3D vector for tests that need positions without Three.js. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Minimal 4-component quaternion for rotation tests. */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Create a Vec3. */
export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

/** Add two Vec3 values (immutable). */
export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Subtract b from a (immutable). */
export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Euclidean distance between two Vec3 values. */
export function distVec3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Scale a Vec3 by a scalar. */
export function scaleVec3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/** Linear interpolation between two Vec3 values. */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/** Returns true if all components are equal within tolerance. */
export function approxEqVec3(a: Vec3, b: Vec3, eps = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.z - b.z) <= eps
  );
}

/** Axis-aligned bounding box for 3D objects. */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

/** Create an AABB from center and half-extents. */
export function aabbFromCenter(center: Vec3, halfExtents: Vec3): AABB {
  return {
    min: subVec3(center, halfExtents),
    max: addVec3(center, halfExtents),
  };
}

/** Compute the center of an AABB. */
export function aabbCenter(box: AABB): Vec3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}

/** Compute the size of an AABB. */
export function aabbSize(box: AABB): Vec3 {
  return subVec3(box.max, box.min);
}

/** Returns true if point p is inside (or on the boundary of) the AABB. */
export function aabbContains(box: AABB, p: Vec3): boolean {
  return (
    p.x >= box.min.x && p.x <= box.max.x &&
    p.y >= box.min.y && p.y <= box.max.y &&
    p.z >= box.min.z && p.z <= box.max.z
  );
}

// ─── Identity quaternion ────────────────────────────────────────────────────

export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

// ─── Scene-graph stubs ────────────────────────────────────────────────────

let _nodeIdCounter = 0;

/** Reset the internal node ID counter (call in `beforeEach`). */
export function resetNodeIdCounter(): void {
  _nodeIdCounter = 0;
}

/** Structural interface matching the minimal Three.js Object3D surface. */
export interface SceneNode {
  /** Stable numeric ID for snapshot diffs. */
  readonly nodeId: number;
  /** User-assigned name. */
  name: string;
  /** Node type tag (mesh, group, light, camera, etc.). */
  type: string;
  /** World-space position. */
  position: Vec3;
  /** Local rotation as a quaternion. */
  quaternion: Quat;
  /** Local scale. */
  scale: Vec3;
  /** Whether the node (and its subtree) is visible. */
  visible: boolean;
  /** User-supplied key-value metadata (replaces Three.js userData). */
  userData: Record<string, unknown>;
  /** Children in the scene graph. */
  children: SceneNode[];
  /** Parent node (null for root). */
  parent: SceneNode | null;
}

/** Create a minimal SceneNode stub. */
export function makeSceneNode(
  partial: Partial<SceneNode> & { name?: string; type?: string } = {}
): SceneNode {
  return {
    nodeId: _nodeIdCounter++,
    name: partial.name ?? "",
    type: partial.type ?? "Object3D",
    position: partial.position ?? vec3(),
    quaternion: partial.quaternion ?? { ...IDENTITY_QUAT },
    scale: partial.scale ?? vec3(1, 1, 1),
    visible: partial.visible ?? true,
    userData: partial.userData ?? {},
    children: partial.children ?? [],
    parent: partial.parent ?? null,
  };
}

/** Create a mock mesh node. */
export function makeMeshNode(
  partial: Partial<SceneNode> & { color?: number; wireframe?: boolean } = {}
): SceneNode {
  const node = makeSceneNode({ ...partial, type: "Mesh" });
  node.userData.color = partial.color ?? 0xffffff;
  node.userData.wireframe = partial.wireframe ?? false;
  return node;
}

/** Create a mock group node containing the given children. */
export function makeGroupNode(
  name: string,
  children: SceneNode[] = []
): SceneNode {
  const group = makeSceneNode({ name, type: "Group" });
  for (const child of children) {
    child.parent = group;
    group.children.push(child);
  }
  return group;
}

/** Create a minimal scene root node. */
export function makeScene(children: SceneNode[] = []): SceneNode {
  const scene = makeSceneNode({ name: "Scene", type: "Scene" });
  for (const child of children) {
    child.parent = scene;
    scene.children.push(child);
  }
  return scene;
}

/** Add a child node to a parent. */
export function addToScene(parent: SceneNode, child: SceneNode): void {
  if (child.parent !== null) {
    removeFromScene(child.parent, child);
  }
  child.parent = parent;
  parent.children.push(child);
}

/** Remove a child node from its parent. */
export function removeFromScene(parent: SceneNode, child: SceneNode): void {
  const idx = parent.children.indexOf(child);
  if (idx !== -1) {
    parent.children.splice(idx, 1);
    child.parent = null;
  }
}

/** Traverse the scene graph depth-first and call `cb` on each node. */
export function traverseScene(
  node: SceneNode,
  cb: (n: SceneNode) => void
): void {
  cb(node);
  for (const child of node.children) {
    traverseScene(child, cb);
  }
}

/** Find the first node with the given name (depth-first). */
export function findByName(
  root: SceneNode,
  name: string
): SceneNode | undefined {
  let found: SceneNode | undefined;
  traverseScene(root, (n) => {
    if (!found && n.name === name) found = n;
  });
  return found;
}

/** Find all nodes matching a predicate. */
export function findAll(
  root: SceneNode,
  predicate: (n: SceneNode) => boolean
): SceneNode[] {
  const results: SceneNode[] = [];
  traverseScene(root, (n) => {
    if (predicate(n)) results.push(n);
  });
  return results;
}

/** Count nodes in the scene graph (including root). */
export function countNodes(root: SceneNode): number {
  let count = 0;
  traverseScene(root, () => { count++; });
  return count;
}

// ─── Scene-state snapshots ────────────────────────────────────────────────

/** Snapshot of a single scene node for deterministic comparison. */
export interface NodeSnapshot {
  nodeId: number;
  name: string;
  type: string;
  position: Vec3;
  visible: boolean;
  childCount: number;
  userData: Record<string, unknown>;
}

/** Full scene snapshot: a flat ordered list of node snapshots. */
export interface SceneSnapshot {
  /** Number of nodes (including root). */
  totalNodes: number;
  /** Nodes in depth-first traversal order. */
  nodes: NodeSnapshot[];
  /** Timestamp this snapshot was taken (monotonic). */
  capturedAt: number;
}

/** Capture a frozen snapshot of the scene graph. */
export function captureSceneSnapshot(root: SceneNode): SceneSnapshot {
  const nodes: NodeSnapshot[] = [];
  traverseScene(root, (n) => {
    nodes.push(
      Object.freeze({
        nodeId: n.nodeId,
        name: n.name,
        type: n.type,
        position: Object.freeze({ ...n.position }),
        visible: n.visible,
        childCount: n.children.length,
        userData: Object.freeze({ ...n.userData }),
      })
    );
  });
  return Object.freeze({
    totalNodes: nodes.length,
    nodes: Object.freeze(nodes) as NodeSnapshot[],
    capturedAt: performance.now(),
  }) as SceneSnapshot;
}

/** Compare two snapshots for structural equality (ignores capturedAt). */
export function snapshotsEqual(a: SceneSnapshot, b: SceneSnapshot): boolean {
  if (a.totalNodes !== b.totalNodes) return false;
  for (let i = 0; i < a.nodes.length; i++) {
    const na = a.nodes[i];
    const nb = b.nodes[i];
    if (!na || !nb) return false;
    if (na.nodeId !== nb.nodeId) return false;
    if (na.name !== nb.name) return false;
    if (na.type !== nb.type) return false;
    if (!approxEqVec3(na.position, nb.position)) return false;
    if (na.visible !== nb.visible) return false;
    if (na.childCount !== nb.childCount) return false;
  }
  return true;
}

// ─── Event simulation ─────────────────────────────────────────────────────

/** Represents a simulated pointer interaction in 3D space. */
export interface MockPointerEvent {
  /** Event type. */
  type: "click" | "hover_enter" | "hover_leave" | "context_menu";
  /** World-space position where the event was triggered. */
  worldPosition: Vec3;
  /** Screen-space coordinates [0..1]. */
  screenPosition: { u: number; v: number };
  /** Simulated session identifier. */
  sessionId: string;
  /** Monotonic timestamp. */
  timestamp: number;
}

/** Counter for generating unique session IDs in tests. */
let _sessionCounter = 0;

/** Reset the session counter (call in `beforeEach`). */
export function resetSessionCounter(): void {
  _sessionCounter = 0;
}

/** Create a simulated click event. */
export function makeClickEvent(
  worldPosition: Vec3,
  sessionId?: string
): MockPointerEvent {
  return {
    type: "click",
    worldPosition,
    screenPosition: { u: 0.5, v: 0.5 },
    sessionId: sessionId ?? `test-session-${_sessionCounter++}`,
    timestamp: performance.now(),
  };
}

/** Create a simulated hover-enter event. */
export function makeHoverEnterEvent(
  worldPosition: Vec3,
  sessionId?: string
): MockPointerEvent {
  return {
    type: "hover_enter",
    worldPosition,
    screenPosition: { u: 0.5, v: 0.5 },
    sessionId: sessionId ?? `test-session-${_sessionCounter++}`,
    timestamp: performance.now(),
  };
}

/** Create a simulated context-menu event. */
export function makeContextMenuEvent(
  worldPosition: Vec3,
  sessionId?: string
): MockPointerEvent {
  return {
    type: "context_menu",
    worldPosition,
    screenPosition: { u: 0.5, v: 0.5 },
    sessionId: sessionId ?? `test-session-${_sessionCounter++}`,
    timestamp: performance.now(),
  };
}

// ─── Assertion helpers ────────────────────────────────────────────────────

/** Assertion error thrown by harness assertion helpers. */
export class SceneAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SceneAssertionError";
  }
}

/**
 * Assert that a node's position is approximately equal to the expected value.
 * Throws `SceneAssertionError` with a descriptive message on failure.
 */
export function assertNodePosition(
  node: SceneNode,
  expected: Vec3,
  eps = 1e-4
): void {
  if (!approxEqVec3(node.position, expected, eps)) {
    throw new SceneAssertionError(
      `Node "${node.name}" position mismatch:\n` +
        `  expected: (${expected.x}, ${expected.y}, ${expected.z})\n` +
        `  actual:   (${node.position.x}, ${node.position.y}, ${node.position.z})\n` +
        `  epsilon:  ${eps}`
    );
  }
}

/**
 * Assert that a node is visible (visible === true).
 */
export function assertNodeVisible(node: SceneNode): void {
  if (!node.visible) {
    throw new SceneAssertionError(
      `Node "${node.name}" (id=${node.nodeId}) expected to be visible but was hidden`
    );
  }
}

/**
 * Assert that a node is hidden (visible === false).
 */
export function assertNodeHidden(node: SceneNode): void {
  if (node.visible) {
    throw new SceneAssertionError(
      `Node "${node.name}" (id=${node.nodeId}) expected to be hidden but was visible`
    );
  }
}

/**
 * Assert that a scene contains exactly `count` nodes of the given type.
 */
export function assertNodeCount(
  root: SceneNode,
  type: string,
  count: number
): void {
  const matching = findAll(root, (n) => n.type === type);
  if (matching.length !== count) {
    throw new SceneAssertionError(
      `Expected ${count} node(s) of type "${type}" but found ${matching.length}`
    );
  }
}

/**
 * Assert that a node's userData has the given key-value pair.
 */
export function assertUserData(
  node: SceneNode,
  key: string,
  value: unknown
): void {
  const actual = node.userData[key];
  if (actual !== value) {
    throw new SceneAssertionError(
      `Node "${node.name}" userData["${key}"] mismatch:\n` +
        `  expected: ${JSON.stringify(value)}\n` +
        `  actual:   ${JSON.stringify(actual)}`
    );
  }
}

/**
 * Assert that a scene node's AABB bounds contain a point.
 */
export function assertBoundsContain(box: AABB, point: Vec3): void {
  if (!aabbContains(box, point)) {
    throw new SceneAssertionError(
      `Bounding box does not contain point (${point.x}, ${point.y}, ${point.z})\n` +
        `  box.min: (${box.min.x}, ${box.min.y}, ${box.min.z})\n` +
        `  box.max: (${box.max.x}, ${box.max.y}, ${box.max.z})`
    );
  }
}

// ─── LOD policy stubs ─────────────────────────────────────────────────────

/** The four LOD levels used by the scene. */
export type MockLodLevel = "full" | "medium" | "low" | "hidden";

/** Mock LOD entry for a scene object. */
export interface MockLodEntry {
  nodeId: number;
  name: string;
  level: MockLodLevel;
  distanceToCamera: number;
}

/**
 * Compute a mock LOD level from distance using the project's documented
 * distance thresholds (compatible with the real LOD policy).
 */
export function computeMockLod(distanceToCamera: number): MockLodLevel {
  if (distanceToCamera <= 8) return "full";
  if (distanceToCamera <= 16) return "medium";
  if (distanceToCamera <= 30) return "low";
  return "hidden";
}

/**
 * Build a LOD table for a set of scene nodes given a camera position.
 */
export function buildLodTable(
  nodes: SceneNode[],
  cameraPosition: Vec3
): MockLodEntry[] {
  return nodes.map((n) => ({
    nodeId: n.nodeId,
    name: n.name,
    level: computeMockLod(distVec3(n.position, cameraPosition)),
    distanceToCamera: distVec3(n.position, cameraPosition),
  }));
}

// ─── Agent avatar stubs ────────────────────────────────────────────────────

/** Minimal agent descriptor for scene harness tests. */
export interface MockAgent {
  agentId: string;
  name: string;
  role: string;
  status: "inactive" | "idle" | "active" | "busy" | "terminated";
  roomId: string;
  position: Vec3;
}

/** Create a mock inactive agent (matches AC 2 initial state). */
export function makeMockAgent(
  partial: Partial<MockAgent> & { agentId: string }
): MockAgent {
  return {
    agentId: partial.agentId,
    name: partial.name ?? `agent-${partial.agentId}`,
    role: partial.role ?? "implementer",
    status: partial.status ?? "inactive",
    roomId: partial.roomId ?? "project-main",
    position: partial.position ?? vec3(),
  };
}

/** Create N mock agents with staggered positions (compatible with AC 2 layout). */
export function makeMockAgents(
  count: number,
  roomId = "project-main",
  basePosition: Vec3 = vec3()
): MockAgent[] {
  return Array.from({ length: count }, (_, i) => ({
    agentId: `mock-agent-${i}`,
    name: `Mock Agent ${i}`,
    role: "implementer",
    status: "inactive" as const,
    roomId,
    position: vec3(
      basePosition.x + (i % 3) * 0.8,
      basePosition.y,
      basePosition.z + Math.floor(i / 3) * 0.8
    ),
  }));
}

// ─── Task connector stubs ─────────────────────────────────────────────────

/** Minimal task connector for scene harness tests. */
export interface MockTaskConnector {
  taskId: string;
  fromAgentId: string;
  toAgentId: string | null;
  status: "pending" | "active" | "completed" | "failed";
  fromPosition: Vec3;
  toPosition: Vec3;
}

/** Create a mock task connector. */
export function makeMockTaskConnector(
  taskId: string,
  fromAgentId: string,
  toAgentId: string | null,
  from: Vec3,
  to: Vec3,
  status: MockTaskConnector["status"] = "active"
): MockTaskConnector {
  return { taskId, fromAgentId, toAgentId, status,
    fromPosition: from, toPosition: to };
}

// ─── Room stubs ────────────────────────────────────────────────────────────

/** Minimal room descriptor for scene harness tests. */
export interface MockRoom {
  roomId: string;
  name: string;
  roomType: "control" | "office" | "lab" | "lobby" | "archive" | "corridor";
  floor: number;
  position: Vec3;
  dimensions: Vec3;
  colorAccent: string;
}

/** Create a mock room. */
export function makeMockRoom(
  partial: Partial<MockRoom> & { roomId: string }
): MockRoom {
  return {
    roomId: partial.roomId,
    name: partial.name ?? partial.roomId,
    roomType: partial.roomType ?? "office",
    floor: partial.floor ?? 0,
    position: partial.position ?? vec3(),
    dimensions: partial.dimensions ?? vec3(3, 3, 3),
    colorAccent: partial.colorAccent ?? "#4a90d9",
  };
}

// ─── Baseline scene factory ────────────────────────────────────────────────

/**
 * Options for `makeBaselineScene`.
 */
export interface BaselineSceneOptions {
  /** Number of agent avatars to place (default: 5). */
  agentCount?: number;
  /** Number of rooms to generate (default: 3). */
  roomCount?: number;
  /** Whether to include task connectors (default: false). */
  includeConnectors?: boolean;
}

/** The result of `makeBaselineScene`. */
export interface BaselineScene {
  root: SceneNode;
  buildingNode: SceneNode;
  rooms: SceneNode[];
  agents: SceneNode[];
  agents_data: MockAgent[];
  rooms_data: MockRoom[];
}

/**
 * Create a minimal, deterministic scene graph suitable for baseline tests.
 *
 * Structure:
 * ```
 * Scene (root)
 *   └── building (Group)
 *         ├── room-0 (Group)
 *         │     └── agent-mesh-0 (Mesh)
 *         │     └── agent-mesh-1 (Mesh)
 *         ├── room-1 (Group)
 *         ...
 * ```
 */
export function makeBaselineScene(
  options: BaselineSceneOptions = {}
): BaselineScene {
  const { agentCount = 5, roomCount = 3 } = options;

  const rooms_data: MockRoom[] = Array.from({ length: roomCount }, (_, i) =>
    makeMockRoom({
      roomId: `room-${i}`,
      name: `Room ${i}`,
      position: vec3(i * 4, 0, 0),
      dimensions: vec3(3, 3, 3),
    })
  );

  const agents_data: MockAgent[] = Array.from({ length: agentCount }, (_, i) =>
    makeMockAgent({
      agentId: `agent-${i}`,
      roomId: rooms_data[i % roomCount]?.roomId ?? "room-0",
    })
  );

  const buildingNode = makeGroupNode("building");

  const roomNodes: SceneNode[] = rooms_data.map((r) => {
    const rNode = makeGroupNode(r.roomId);
    rNode.position = { ...r.position };
    rNode.userData.roomId = r.roomId;
    rNode.userData.roomType = r.roomType;
    return rNode;
  });

  const agentNodes: SceneNode[] = agents_data.map((a) => {
    const aNode = makeMeshNode({
      name: a.agentId,
      position: { ...a.position },
    });
    aNode.userData.agentId = a.agentId;
    aNode.userData.status = a.status;
    aNode.userData.role = a.role;
    return aNode;
  });

  // Wire up agents to their rooms
  for (const aNode of agentNodes) {
    const agentData = agents_data.find((a) => a.agentId === aNode.userData.agentId);
    if (!agentData) continue;
    const roomNode = roomNodes.find((r) => r.userData.roomId === agentData.roomId);
    if (roomNode) addToScene(roomNode, aNode);
    else addToScene(buildingNode, aNode);
  }

  // Wire up rooms to building
  for (const rNode of roomNodes) {
    addToScene(buildingNode, rNode);
  }

  const root = makeScene([buildingNode]);

  return {
    root,
    buildingNode,
    rooms: roomNodes,
    agents: agentNodes,
    agents_data,
    rooms_data,
  };
}

// ─── Harness lifecycle helpers ────────────────────────────────────────────

/**
 * Reset all harness counters between tests.
 * Call in `beforeEach` to ensure test isolation.
 */
export function resetHarness(): void {
  resetNodeIdCounter();
  resetSessionCounter();
}

/**
 * Summarize a scene snapshot as a human-readable string (for debug output).
 */
export function formatSceneSnapshot(snap: SceneSnapshot): string {
  const lines: string[] = [
    `SceneSnapshot (${snap.totalNodes} nodes, captured at ${snap.capturedAt.toFixed(2)}ms):`,
  ];
  for (const n of snap.nodes) {
    lines.push(
      `  [${n.nodeId}] "${n.name}" (${n.type}) ` +
        `pos=(${n.position.x.toFixed(2)},${n.position.y.toFixed(2)},${n.position.z.toFixed(2)}) ` +
        `visible=${n.visible} children=${n.childCount}`
    );
  }
  return lines.join("\n");
}
