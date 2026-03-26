/**
 * avatar-placement-init.ts — Sub-AC 2c: Integrate avatar placement at scene load.
 *
 * Instantiates one avatar per agent entity at its designated position within
 * the office/room hierarchy, synchronously, before the first render frame.
 *
 * Design
 * ──────
 * This module bridges the structural scene graph (scene-graph-init.ts) with
 * the visual data layer (agents.ts).  The scene graph already places agent
 * group nodes at the correct world-space positions within their assigned rooms;
 * this module annotates those nodes with the per-agent visual configuration
 * the 3D renderer needs to draw the avatar mesh.
 *
 * Avatar placement contract (Sub-AC 2c):
 *   - One avatar node per entry in AGENT_INITIAL_PLACEMENTS (5 total)
 *   - Each avatar node is a Group node in the scene hierarchy named
 *     "agent-<agentId>" (unchanged from scene-graph-init.ts)
 *   - Each avatar node carries visual configuration in userData:
 *       avatarPlaced      — true  (discriminant: confirms placement ran)
 *       avatarColor       — hex string  (role-color from AgentDef.visual.color)
 *       avatarEmissive    — hex string  (emissive glow from AgentDef.visual.emissive)
 *       avatarLabel       — 3–4 char string (role label from AgentDef.visual.label)
 *       avatarIcon        — unicode icon (from AgentDef.visual.icon)
 *       avatarRole        — AgentRole string
 *   - All avatars start with status="inactive" and lifecycleState="initializing"
 *     (inherited from scene-graph-init.ts; unchanged by this module)
 *   - Avatar nodes are positioned within the office/room hierarchy before the
 *     React-Three-Fiber reconciler runs its first render pass (synchronous init)
 *   - Avatar position is set from the seed worldPosition (same as agent node position)
 *
 * Hierarchy guarantee (unchanged from scene-graph-init.ts):
 *   Scene
 *   └── hierarchy-building
 *         └── room-<roomId>
 *               └── agent-<agentId>   ← avatarPlaced=true node
 *
 * Usage
 * ─────
 * ```ts
 * import { initializeAvatarPlacement, queryAvatarNode, countAvatarNodes } from "./avatar-placement-init.js";
 *
 * const { root, avatarNodes } = initializeAvatarPlacement();
 * assert(avatarNodes.length === 5, "Five avatars must be placed at scene load");
 *
 * const managerAvatar = queryAvatarNode(root, "manager-default");
 * assert(managerAvatar?.userData.avatarPlaced === true);
 * assert(managerAvatar?.userData.avatarColor === "#FF7043");
 * ```
 *
 * AC traceability:
 *   Sub-AC 2c — Avatar placement at scene load, one per agent, before first render.
 */

import {
  initializeCommandCenterScene,
  queryAgentNode,
  queryAllAgentNodes,
  type CommandCenterSceneGraph,
  SCENE_AGENT_NODE_PREFIX,
} from "./scene-graph-init.js";
import { AGENT_MAP } from "../data/agents.js";
import { AGENT_INITIAL_PLACEMENTS } from "../data/agent-seed.js";
import {
  findAll,
  type SceneNode,
} from "../testing/scene-test-harness.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Fallback visual configuration for agents not found in AGENT_MAP.
 * Should never occur in a correctly initialised session — logged as a
 * warning during scene load.
 */
const AVATAR_FALLBACK_VISUAL = {
  color: "#888888",
  emissive: "#444444",
  label: "???",
  icon: "?",
  role: "implementer",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Extended scene graph returned by initializeAvatarPlacement().
 *
 * Includes the full CommandCenterSceneGraph (root, buildingNode, roomNodes,
 * agentNodes) plus the avatarNodes array — a confirmed list of nodes that
 * received avatar visual data during scene load.
 *
 * avatarNodes is a subset of agentNodes: every agent node in the scene becomes
 * an avatar node (one-to-one correspondence).
 */
export interface AvatarPlacementSceneGraph extends CommandCenterSceneGraph {
  /**
   * Avatar nodes placed at scene load.
   *
   * Each entry is a Group node in the scene hierarchy with:
   *   - userData.avatarPlaced === true
   *   - userData.avatarColor, avatarEmissive, avatarLabel, avatarIcon, avatarRole
   *   - position set to the agent's world-space coordinates
   *   - parent set to the agent's assigned room node
   *
   * Length equals AGENT_INITIAL_PLACEMENTS.length (5 for the static seed set).
   * Ordered by spawnIndex (ascending, matching scene-graph-init.ts order).
   */
  readonly avatarNodes: readonly SceneNode[];
  /**
   * Number of avatars successfully placed (should equal avatarNodes.length).
   * Exposed separately for quick assertions without iterating the array.
   */
  readonly avatarCount: number;
}

// ─── Avatar visual annotation ─────────────────────────────────────────────────

/**
 * Annotate a single agent scene node with avatar visual metadata.
 *
 * Reads the agent's visual configuration from AGENT_MAP and writes the
 * following fields into node.userData:
 *   - avatarPlaced      (true)
 *   - avatarColor       (hex)
 *   - avatarEmissive    (hex)
 *   - avatarLabel       (3-4 chars)
 *   - avatarIcon        (unicode)
 *   - avatarRole        (AgentRole)
 *
 * Falls back to AVATAR_FALLBACK_VISUAL for unknown agents.
 *
 * @param node - The agent group node to annotate.
 * @returns The same node (mutated in-place, returned for chaining).
 */
export function annotateAvatarNode(node: SceneNode): SceneNode {
  const agentId = node.userData.agentId as string | undefined;

  if (!agentId) {
    // Not an agent node — skip silently
    return node;
  }

  const agentDef = agentId ? AGENT_MAP[agentId] : undefined;
  const visual = agentDef?.visual ?? AVATAR_FALLBACK_VISUAL;
  const role = agentDef?.role ?? AVATAR_FALLBACK_VISUAL.role;

  // Mark the node as having received avatar placement
  node.userData.avatarPlaced = true;

  // Visual configuration consumed by AgentAvatar.tsx at render time
  node.userData.avatarColor = visual.color;
  node.userData.avatarEmissive = visual.emissive;
  node.userData.avatarLabel = visual.label;
  node.userData.avatarIcon = visual.icon;
  node.userData.avatarRole = role;

  return node;
}

// ─── Scene initialization ─────────────────────────────────────────────────────

/**
 * Initialize avatar placement at scene load.
 *
 * Builds the full command-center scene graph via initializeCommandCenterScene()
 * and then annotates each agent node with avatar visual metadata derived from
 * AGENT_MAP (AgentDef.visual).
 *
 * This function is synchronous — it must complete before the React-Three-Fiber
 * reconciler runs its first render pass.  The returned avatarNodes are
 * immediately available for the AgentAvatarsLayer to render without any
 * asynchronous data loading.
 *
 * Placement guarantee:
 *   For each seed in AGENT_INITIAL_PLACEMENTS:
 *     1. An agent group node exists in the scene hierarchy at:
 *        root → hierarchy-building → room-<roomId> → agent-<agentId>
 *     2. The node's position matches the seed worldPosition.
 *     3. The node carries userData.avatarPlaced === true.
 *
 * @returns AvatarPlacementSceneGraph with root, buildingNode, roomNodes,
 *   agentNodes (all), and avatarNodes (confirmed placed subset).
 */
export function initializeAvatarPlacement(): AvatarPlacementSceneGraph {
  // ── 1. Build the base scene graph (building + rooms + agent nodes) ──────────
  //
  // initializeCommandCenterScene() places one agent group node per seed entry,
  // as a direct child of the correct room node, at the correct world position.
  // We extend that graph here — no re-placement, just annotation.
  const sceneGraph = initializeCommandCenterScene();

  // ── 2. Annotate each agent node with avatar visual data ─────────────────────
  //
  // sceneGraph.agentNodes is ordered by spawnIndex (ascending), matching the
  // AGENT_INITIAL_PLACEMENTS order. We preserve this order in avatarNodes.
  const avatarNodes: SceneNode[] = [];

  for (const agentNode of sceneGraph.agentNodes) {
    annotateAvatarNode(agentNode);
    // Only include nodes that were successfully marked as placed
    if (agentNode.userData.avatarPlaced === true) {
      avatarNodes.push(agentNode);
    }
  }

  // ── 3. Return extended graph ─────────────────────────────────────────────────
  return {
    ...sceneGraph,
    avatarNodes: Object.freeze(avatarNodes),
    avatarCount: avatarNodes.length,
  };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Query the scene graph for a specific avatar node by agentId.
 *
 * Delegates to the canonical "agent-<agentId>" naming convention from
 * scene-graph-init.ts.  Returns undefined if the node was not found or
 * was not annotated with avatarPlaced=true.
 *
 * @param root    - The root scene node to search from.
 * @param agentId - The agent identifier (e.g. "manager-default").
 * @returns The avatar node if found and placed, or undefined.
 */
export function queryAvatarNode(
  root: SceneNode,
  agentId: string,
): SceneNode | undefined {
  const node = queryAgentNode(root, agentId);
  if (!node) return undefined;
  // Only return nodes that received avatar annotation
  return node.userData.avatarPlaced === true ? node : undefined;
}

/**
 * Query all avatar nodes in the scene graph.
 *
 * Returns all agent group nodes that carry userData.avatarPlaced === true,
 * sorted by spawnIndex (ascending).
 *
 * @param root - The root scene node to search from.
 * @returns Array of avatar nodes sorted by spawnIndex.
 */
export function queryAllAvatarNodes(root: SceneNode): SceneNode[] {
  return findAll(
    root,
    (n) =>
      typeof n.userData.agentId === "string" &&
      n.userData.avatarPlaced === true,
  ).sort((a, b) => {
    const ai = (a.userData.spawnIndex as number) ?? 0;
    const bi = (b.userData.spawnIndex as number) ?? 0;
    return ai - bi;
  });
}

/**
 * Count the number of avatar nodes placed in the scene graph.
 *
 * Equivalent to queryAllAvatarNodes(root).length but avoids constructing
 * the full array when only the count is needed.
 *
 * @param root - The root scene node to search from.
 * @returns The number of placed avatar nodes.
 */
export function countAvatarNodes(root: SceneNode): number {
  return queryAllAvatarNodes(root).length;
}

/**
 * Returns true if the scene contains exactly one avatar per agent in
 * AGENT_INITIAL_PLACEMENTS.
 *
 * The primary verification function for the "one avatar per agent"
 * contract of Sub-AC 2c.
 *
 * @param root - The root scene node to search from.
 * @returns true iff every seed agent has a placed avatar in the scene.
 */
export function allSeedAgentsHaveAvatars(root: SceneNode): boolean {
  for (const seed of AGENT_INITIAL_PLACEMENTS) {
    const node = queryAvatarNode(root, seed.agentId);
    if (!node) return false;
  }
  return true;
}

/**
 * Verify that all avatar nodes carry non-empty visual data.
 *
 * Checks that avatarColor, avatarEmissive, avatarLabel, avatarIcon, and
 * avatarRole are all non-empty strings on every avatar node in the scene.
 *
 * @param avatarNodes - The avatar nodes to check.
 * @returns true iff every node has complete visual data.
 */
export function allAvatarsHaveVisualData(avatarNodes: readonly SceneNode[]): boolean {
  for (const node of avatarNodes) {
    const c = node.userData.avatarColor;
    const e = node.userData.avatarEmissive;
    const l = node.userData.avatarLabel;
    const i = node.userData.avatarIcon;
    const r = node.userData.avatarRole;
    if (
      typeof c !== "string" || c.length === 0 ||
      typeof e !== "string" || e.length === 0 ||
      typeof l !== "string" || l.length === 0 ||
      typeof i !== "string" || i.length === 0 ||
      typeof r !== "string" || r.length === 0
    ) {
      return false;
    }
  }
  return true;
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

// Re-export from scene-graph-init for callers that use this module as the
// primary entry point (saves an extra import).
export {
  queryAgentNode,
  queryAllAgentNodes,
  queryRoomNode,
  queryBuildingNode,
  SCENE_BUILDING_NODE_NAME,
  SCENE_AGENT_NODE_PREFIX,
  SCENE_ROOM_NODE_PREFIX,
} from "./scene-graph-init.js";
export type { CommandCenterSceneGraph } from "./scene-graph-init.js";
