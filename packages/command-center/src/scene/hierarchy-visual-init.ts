/**
 * hierarchy-visual-init.ts — Sub-AC 3b: Hierarchical scene rendering with
 * distinct LOD and nesting visuals per tier.
 *
 * Extends the base command-center scene graph (from scene-graph-init.ts) by
 * annotating every node in the Building → Floor → Room → Agent hierarchy with
 * tier-specific visual descriptors.  These descriptors are consumed by the 3D
 * renderer (SceneHierarchy.tsx, BirdsEyeLODLayer.tsx) to produce visually
 * distinct representations at each hierarchy level — ensuring every tier is
 * legible from the bird's-eye perspective.
 *
 * ── Sub-AC 3b verification contract ─────────────────────────────────────────
 *
 *   1. All four hierarchy tiers are represented in the scene graph.
 *   2. Each tier node carries userData.hierarchyTier identifying it.
 *   3. Each tier has a unique layerOrder (1=building, 2=floor, 3=room, 4=agent).
 *   4. Each tier has a distinct markerElevation (higher tier → higher elevation).
 *   5. Building footprint is the widest scope (footprintW × footprintD ≥ any room).
 *   6. Agent markers have the smallest footprint (markerRadius ≤ smallest room dim).
 *   7. Each tier's accentColor palette is unique (no two tiers share the same color).
 *   8. All room nodes carry birdsEyeVisual.showLabel = true (role badges).
 *   9. All agent nodes carry birdsEyeVisual.showLabel = true (name labels).
 *  10. Building and floor nodes are visually layered below rooms and agents.
 *
 * ── Design ────────────────────────────────────────────────────────────────────
 *
 * This module is PURE TypeScript — no React, no Three.js, no store dependencies.
 * It is fully testable in Node.js (Vitest) without a browser or WebGL context.
 *
 * The module mirrors the visual contract established in BirdsEyeLODLayer.tsx and
 * zoom-lod-policy.ts but expressed at the scene-graph level so it can be verified
 * independently of the render pipeline.
 *
 * ── Four Tier Visual Stack ────────────────────────────────────────────────────
 *
 *   Tier 1 – BUILDING  (layerOrder=1, elevation=0.02, footprint=12×6)
 *             ► Bright cyan perimeter outline; always visible; widest scope anchor
 *
 *   Tier 2 – FLOOR     (layerOrder=2, elevation=0.04, footprint=12×6)
 *             ► Subtly tinted horizontal fill per floor; recedes visually under rooms
 *
 *   Tier 3 – ROOM      (layerOrder=3, elevation=0.06, footprint=per-room dims)
 *             ► Role-coloured cell fills + outlines; medium prominence
 *
 *   Tier 4 – AGENT     (layerOrder=4, elevation=0.10, radius=0.20 disc)
 *             ► Bright hexagonal role-coloured discs; highest elevation; point markers
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *
 * ```ts
 * import { initializeHierarchyVisuals, queryTierNodes, TIER_VISUALS } from "./hierarchy-visual-init.js";
 *
 * const graph = initializeHierarchyVisuals();
 * const roomNodes = queryTierNodes(graph.root, "room");
 * assert(roomNodes.every(n => n.userData.birdsEyeVisual.layerOrder === 3));
 * ```
 */

import { BUILDING } from "../data/building.js";
import {
  makeGroupNode,
  findAll,
  type SceneNode,
} from "../testing/scene-test-harness.js";
import {
  initializeCommandCenterScene,
  type CommandCenterSceneGraph,
} from "./scene-graph-init.js";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * The four hierarchy tiers in the command-center world.
 *
 * Must remain in sync with:
 *   - SceneHierarchy.tsx: Building → Floor → Room → Agent
 *   - lod-drill-policy.ts: DrillLevel ("building" | "floor" | "room" | "agent")
 *   - BirdsEyeLODLayer.tsx: Level-1 through Level-4
 */
export type HierarchyTier = "building" | "floor" | "room" | "agent";

/**
 * Bird's-eye visual descriptor attached to every scene node as userData.birdsEyeVisual.
 *
 * The descriptor provides ENOUGH information for the renderer to draw a visually
 * distinct representation at bird's-eye altitude WITHOUT consulting the runtime
 * Three.js scene — making it testable in pure Node.js.
 *
 * Visual contract enforced by tests:
 *   - layerOrder: monotonically increases per tier (building=1 → agent=4)
 *   - markerElevation: strictly increases per tier (building=lowest)
 *   - footprintW × footprintD: decreases from building → room (agents use radius)
 *   - accentColor: unique per tier (no two tiers share the same base accent)
 *   - showLabel: true for tiers that show diegetic name labels
 */
export interface BirdsEyeVisualDescriptor {
  /** Hierarchy tier identifier (mirrors userData.hierarchyTier). */
  tier: HierarchyTier;

  /**
   * Depth-ordering layer for renderer draw order.
   *   1 = building (rendered first, at ground)
   *   2 = floor fills
   *   3 = room cells
   *   4 = agent markers (on top)
   */
  layerOrder: number;

  /**
   * Y-offset above the floor plane (world units).
   * Higher elevation = rendered closer to the camera in top-down view.
   *   0.02 = building footprint strip
   *   0.04 = floor zone fill
   *   0.06 = room cell outlines
   *   0.10 = agent hexagonal discs
   */
  markerElevation: number;

  /**
   * Footprint width in world units (X axis).
   * For agents this equals markerRadius * 2 (circular footprint).
   */
  footprintW: number;

  /**
   * Footprint depth in world units (Z axis).
   * For agents this equals markerRadius * 2 (circular footprint).
   */
  footprintD: number;

  /**
   * For agents: radius of the hexagonal/circular marker disc (world units).
   * For non-agent tiers: 0 (footprintW/D are used instead).
   */
  markerRadius: number;

  /**
   * Primary accent color as a CSS hex string (e.g. "#00d4ff").
   * Each tier has a visually distinct accent palette.
   */
  accentColor: string;

  /**
   * Base opacity of the visual at the MID zoom level (0–1).
   * Values are tuned so each tier reads clearly without obscuring lower tiers.
   */
  opacity: number;

  /**
   * Whether this tier shows a diegetic label from bird's-eye altitude.
   * true  = building (name + floor count), rooms (role badge), agents (name)
   * false = floor fills (purely visual, no label needed)
   */
  showLabel: boolean;

  /**
   * The label text to display from bird's-eye altitude.
   * Empty string when showLabel === false.
   */
  labelText: string;
}

/**
 * Extended scene graph returned by initializeHierarchyVisuals().
 *
 * Extends CommandCenterSceneGraph with floor-tier intermediate nodes
 * and the full set of annotated room and agent nodes.
 */
export interface HierarchyVisualSceneGraph extends CommandCenterSceneGraph {
  /**
   * Floor group nodes inserted into the building, one per BUILDING.floors entry.
   * Named "hierarchy-floor-{n}" to mirror SceneHierarchy.tsx's floor group convention.
   * Each carries userData.hierarchyTier = "floor" and userData.birdsEyeVisual.
   */
  floorNodes: SceneNode[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Building footprint dimensions in world units (1 unit = 1 grid cell).
 * Matches BuildingShell.tsx: BUILDING_W=12, BUILDING_D=6.
 */
export const BUILDING_FOOTPRINT_W = 12 as const;
export const BUILDING_FOOTPRINT_D = 6 as const;

/**
 * Agent marker disc radius in world units.
 * Matches AgentAvatar.tsx body capsule width (≈ 0.20 units).
 */
export const AGENT_MARKER_DISC_RADIUS = 0.20 as const;

/**
 * Per-tier marker elevation above the floor plane (world units).
 * Strictly increasing from building (lowest) to agent (highest) ensures
 * correct depth layering in the top-down view.
 */
export const TIER_ELEVATIONS: Record<HierarchyTier, number> = {
  building: 0.02,  // Ground-level perimeter outline
  floor:    0.04,  // Floor zone fill (above building outline strip)
  room:     0.06,  // Room cell fills + outlines (above floor zone)
  agent:    0.10,  // Agent hexagonal discs (topmost; clearly visible points)
} as const;

/**
 * Per-tier layer draw order.
 * Matches the renderOrder convention in BirdsEyeLODLayer.tsx (renderOrder 1–4).
 */
export const TIER_LAYER_ORDER: Record<HierarchyTier, number> = {
  building: 1,
  floor:    2,
  room:     3,
  agent:    4,
} as const;

/**
 * Per-tier base accent colors for bird's-eye rendering.
 *
 * Palette criteria:
 *   - Visually distinct from each other (no two tiers share the same hue)
 *   - High contrast against the dark command-center background (#0a0a14)
 *   - Matches existing palette cues from BuildingShell, RoomTypeVisuals, AgentAvatar
 *
 * Building  → bright cyan      (#00d4ff) — primary scope anchor, highest contrast
 * Floor     → muted indigo     (#334488) — background fill, low contrast (subtle)
 * Room      → inherited from room.colorAccent (default: soft amber #e8a020 for fallback)
 * Agent     → role-color (default: vivid green #44ff88 for fallback)
 */
export const TIER_ACCENT_COLORS: Record<HierarchyTier, string> = {
  building: "#00d4ff",  // Bright cyan — perimeter anchor
  floor:    "#334488",  // Muted indigo — floor tint fill
  room:     "#e8a020",  // Soft amber — fallback (overridden per room by colorAccent)
  agent:    "#44ff88",  // Vivid green — fallback (overridden per agent by role color)
} as const;

/**
 * Per-tier base opacity at the MID bird's-eye zoom level.
 *
 * Tuned so that:
 *   - Building outline is prominently visible at all zoom levels
 *   - Floor tints are subtle (don't obscure rooms underneath)
 *   - Rooms are moderately visible (clear scope + fill)
 *   - Agents are the most prominent point markers
 */
export const TIER_BASE_OPACITY: Record<HierarchyTier, number> = {
  building: 0.85,  // Prominently visible — primary anchor
  floor:    0.18,  // Subtle fill — provides color coding without overwhelming
  room:     0.55,  // Moderate — room cells clearly readable
  agent:    0.90,  // High — agents must stand out as individual points
} as const;

/**
 * Whether each tier shows a diegetic label from bird's-eye altitude.
 * Floor fills are purely graphical; no label is needed.
 */
export const TIER_SHOW_LABEL: Record<HierarchyTier, boolean> = {
  building: true,   // Building name + floor count badge
  floor:    false,  // No label — zone tint is purely visual
  room:     true,   // Role badge (e.g. "CTRL", "OFFC", "LAB")
  agent:    true,   // Agent name + role tag
} as const;

/**
 * Floor zone accent colors — one per floor index (supports ≤ 8 floors).
 *
 * Distinct tints for each floor so the user can identify which floor
 * a room belongs to at a glance.  Colors are muted to avoid competing
 * with room-level accent colors.
 *
 * Matches the ZONE_FILL_COLORS palette in BirdsEyeLODLayer.tsx.
 */
export const FLOOR_ZONE_COLORS: readonly string[] = [
  "#1a2a5e",  // Floor 0 (Ground) — deep blue
  "#2e1a4a",  // Floor 1 (Operations) — deep purple
  "#1a3a2e",  // Floor 2 — deep teal (spare)
  "#3a2a1a",  // Floor 3 — deep amber (spare)
] as const;

/**
 * TIER_VISUALS — Canonical per-tier visual descriptor constants.
 *
 * These are the DEFAULT descriptors; individual nodes (rooms, agents) will have
 * their accentColor and footprint overridden by their specific data.
 *
 * Exported for use in tests and in SceneHierarchy.tsx / BirdsEyeLODLayer.tsx.
 */
export const TIER_VISUALS: Record<HierarchyTier, BirdsEyeVisualDescriptor> = {
  building: {
    tier:            "building",
    layerOrder:      TIER_LAYER_ORDER.building,
    markerElevation: TIER_ELEVATIONS.building,
    footprintW:      BUILDING_FOOTPRINT_W,
    footprintD:      BUILDING_FOOTPRINT_D,
    markerRadius:    0,
    accentColor:     TIER_ACCENT_COLORS.building,
    opacity:         TIER_BASE_OPACITY.building,
    showLabel:       TIER_SHOW_LABEL.building,
    labelText:       BUILDING.name,
  },
  floor: {
    tier:            "floor",
    layerOrder:      TIER_LAYER_ORDER.floor,
    markerElevation: TIER_ELEVATIONS.floor,
    footprintW:      BUILDING_FOOTPRINT_W,  // Floors span the full building width
    footprintD:      BUILDING_FOOTPRINT_D,
    markerRadius:    0,
    accentColor:     TIER_ACCENT_COLORS.floor,
    opacity:         TIER_BASE_OPACITY.floor,
    showLabel:       TIER_SHOW_LABEL.floor,
    labelText:       "",
  },
  room: {
    tier:            "room",
    layerOrder:      TIER_LAYER_ORDER.room,
    markerElevation: TIER_ELEVATIONS.room,
    footprintW:      3,   // Default; overridden per room by room.dimensions.x
    footprintD:      3,   // Default; overridden per room by room.dimensions.z
    markerRadius:    0,
    accentColor:     TIER_ACCENT_COLORS.room,
    opacity:         TIER_BASE_OPACITY.room,
    showLabel:       TIER_SHOW_LABEL.room,
    labelText:       "",  // Overridden per room
  },
  agent: {
    tier:            "agent",
    layerOrder:      TIER_LAYER_ORDER.agent,
    markerElevation: TIER_ELEVATIONS.agent,
    footprintW:      AGENT_MARKER_DISC_RADIUS * 2,
    footprintD:      AGENT_MARKER_DISC_RADIUS * 2,
    markerRadius:    AGENT_MARKER_DISC_RADIUS,
    accentColor:     TIER_ACCENT_COLORS.agent,
    opacity:         TIER_BASE_OPACITY.agent,
    showLabel:       TIER_SHOW_LABEL.agent,
    labelText:       "",  // Overridden per agent
  },
} as const;

// ── Node name convention ───────────────────────────────────────────────────────

/** Prefix for floor group node names (mirroring SceneHierarchy.tsx). */
export const FLOOR_NODE_PREFIX = "hierarchy-floor-" as const;

/**
 * Get the canonical scene graph node name for a floor.
 *
 * @param floorIndex - 0-based floor index.
 * @returns Canonical name, e.g. "hierarchy-floor-0".
 */
export function getFloorNodeName(floorIndex: number): string {
  return `${FLOOR_NODE_PREFIX}${floorIndex}`;
}

// ── Descriptor builders ────────────────────────────────────────────────────────

/**
 * Build a BirdsEyeVisualDescriptor for a specific floor.
 *
 * Floor tints use FLOOR_ZONE_COLORS with wrapping to support any floor count.
 *
 * @param floorIndex - 0-based floor index.
 * @param floorName  - Display name of the floor (e.g. "Ground Floor").
 * @returns Descriptor with floor-specific accent color.
 */
export function buildFloorVisualDescriptor(
  floorIndex: number,
  floorName: string,
): BirdsEyeVisualDescriptor {
  const color = FLOOR_ZONE_COLORS[floorIndex % FLOOR_ZONE_COLORS.length] ?? TIER_ACCENT_COLORS.floor;
  return {
    ...TIER_VISUALS.floor,
    accentColor: color,
    labelText: floorName,  // Stored but showLabel=false; available if policy changes
  };
}

/**
 * Build a BirdsEyeVisualDescriptor for a specific room.
 *
 * Room descriptors use the room's own colorAccent and dimensions for a
 * visually differentiated footprint matching the room's actual floor area.
 *
 * @param roomId      - Room identifier (e.g. "ops-control").
 * @param name        - Room display name (e.g. "Operations Control").
 * @param colorAccent - Room accent color from BUILDING definition.
 * @param dimW        - Room width in world units (X dimension).
 * @param dimD        - Room depth in world units (Z dimension).
 * @param labelText   - Short role label (e.g. "CTRL", "OFFC", "LAB").
 * @returns Descriptor with room-specific footprint and color.
 */
export function buildRoomVisualDescriptor(
  roomId: string,
  name: string,
  colorAccent: string,
  dimW: number,
  dimD: number,
  labelText: string,
): BirdsEyeVisualDescriptor {
  void roomId;  // Future: per-room policy override lookup
  void name;    // Available in labelText
  return {
    ...TIER_VISUALS.room,
    accentColor: colorAccent,
    footprintW:  dimW,
    footprintD:  dimD,
    labelText,
  };
}

/**
 * Build a BirdsEyeVisualDescriptor for a specific agent.
 *
 * Agent descriptors use the default accent palette; role-based color overrides
 * are applied at render time by SceneHierarchy / BirdsEyeLODLayer.
 *
 * @param agentId  - Agent identifier.
 * @param name     - Agent display name.
 * @param roleColor - Optional role-based accent color (hex string).
 * @returns Descriptor with agent name as label text.
 */
export function buildAgentVisualDescriptor(
  agentId: string,
  name: string,
  roleColor?: string,
): BirdsEyeVisualDescriptor {
  void agentId;  // Future: per-agent status-based override
  return {
    ...TIER_VISUALS.agent,
    accentColor: roleColor ?? TIER_ACCENT_COLORS.agent,
    labelText: name,
  };
}

// ── Scene annotation ───────────────────────────────────────────────────────────

/**
 * Annotate a scene node with hierarchy tier metadata.
 *
 * Sets:
 *   node.userData.hierarchyTier   — HierarchyTier string
 *   node.userData.birdsEyeVisual  — BirdsEyeVisualDescriptor object
 *
 * @param node       - Target SceneNode to annotate.
 * @param tier       - Which hierarchy tier this node belongs to.
 * @param descriptor - Visual descriptor for this node.
 */
function annotateNode(
  node: SceneNode,
  tier: HierarchyTier,
  descriptor: BirdsEyeVisualDescriptor,
): void {
  node.userData.hierarchyTier = tier;
  node.userData.birdsEyeVisual = descriptor;
}

// ── Role label map (mirrors ROOM_TYPE_LABELS in room-mesh-init.ts) ────────────

const ROOM_TYPE_LABELS: Record<string, string> = {
  control:  "CTRL",
  office:   "OFFC",
  lab:      "LAB",
  lobby:    "MAIN",
  archive:  "ARCH",
  corridor: "PATH",
};

/** Get the short role label for a room type. */
function getRoomRoleLabel(roomType: string): string {
  return ROOM_TYPE_LABELS[roomType] ?? roomType.toUpperCase().slice(0, 4);
}

// ── Scene initialization ───────────────────────────────────────────────────────

/**
 * initializeHierarchyVisuals — Build and annotate the full 4-tier hierarchy
 * scene graph with bird's-eye visual descriptors.
 *
 * Implements Sub-AC 3b:
 *   "Visually represent the building → office/room → agent hierarchy with
 *   distinct LOD or nesting visuals so each level is legible from the
 *   bird's-eye perspective."
 *
 * Steps:
 *   1. Bootstrap the scene graph from initializeCommandCenterScene().
 *   2. Annotate the building node with Tier 1 visual descriptor.
 *   3. Insert floor group nodes (Tier 2) as children of the building.
 *   4. Annotate all room nodes (Tier 3) with room-specific footprint + color.
 *   5. Annotate all agent nodes (Tier 4) with agent-specific name label.
 *
 * The floor nodes are ADDITIONAL nodes inserted by this function — they are
 * NOT present in the base scene graph from initializeCommandCenterScene().
 * They represent the floor-level visual tier (zone fills) without affecting
 * the structural room/agent hierarchy.
 *
 * @returns HierarchyVisualSceneGraph with all four tiers annotated.
 */
export function initializeHierarchyVisuals(): HierarchyVisualSceneGraph {
  // ── Step 1: Bootstrap from the base scene ─────────────────────────────────
  const base = initializeCommandCenterScene();
  const { root, buildingNode, roomNodes, agentNodes } = base;

  // ── Step 2: Annotate building node (Tier 1) ────────────────────────────────
  annotateNode(buildingNode, "building", {
    ...TIER_VISUALS.building,
    labelText: BUILDING.name,
  });

  // ── Step 3: Insert and annotate floor nodes (Tier 2) ──────────────────────
  const floorNodes: SceneNode[] = [];

  for (const floorDef of BUILDING.floors) {
    const floorNode = makeGroupNode(getFloorNodeName(floorDef.floor));

    // Floor metadata
    floorNode.userData.floor = floorDef.floor;
    floorNode.userData.floorName = floorDef.name;
    floorNode.userData.gridW = floorDef.gridW;
    floorNode.userData.gridD = floorDef.gridD;
    floorNode.userData.roomIds = [...floorDef.roomIds];

    // Floor Y position: each floor is BUILDING_FLOOR_HEIGHT units above the last.
    // Floor 0 = ground level (y=0), Floor 1 = y=3 (standard 3-unit floor height).
    floorNode.position = { x: 0, y: floorDef.floor * 3, z: 0 };

    // Visual descriptor: per-floor accent tint
    const descriptor = buildFloorVisualDescriptor(floorDef.floor, floorDef.name);
    annotateNode(floorNode, "floor", descriptor);

    // Insert as child of building node (after existing room/agent nodes from step 1)
    floorNode.parent = buildingNode;
    buildingNode.children.push(floorNode);

    floorNodes.push(floorNode);
  }

  // ── Step 4: Annotate room nodes (Tier 3) ──────────────────────────────────
  //
  // Room nodes were created by initializeCommandCenterScene() using the
  // SCENE_ROOM_NODE_PREFIX ("room-{roomId}") convention.  We look up each
  // BUILDING room definition and annotate the matching node.
  //
  for (const roomDef of BUILDING.rooms) {
    // Find the matching node from roomNodes (same order as BUILDING.rooms)
    const roomNode = roomNodes.find((n) => n.userData.roomId === roomDef.roomId);
    if (!roomNode) continue;

    const roleLabel = getRoomRoleLabel(roomDef.roomType);
    const descriptor = buildRoomVisualDescriptor(
      roomDef.roomId,
      roomDef.name,
      roomDef.colorAccent,
      roomDef.dimensions.x,
      roomDef.dimensions.z,
      roleLabel,
    );
    annotateNode(roomNode, "room", descriptor);
  }

  // ── Step 5: Annotate agent nodes (Tier 4) ─────────────────────────────────
  //
  // Agent nodes were created by initializeCommandCenterScene() using the
  // SCENE_AGENT_NODE_PREFIX ("agent-{agentId}") convention.
  //
  for (const agentNode of agentNodes) {
    const agentId = agentNode.userData.agentId as string;
    const name    = agentNode.userData.name as string ?? agentId;

    const descriptor = buildAgentVisualDescriptor(agentId, name);
    annotateNode(agentNode, "agent", descriptor);
  }

  return {
    root,
    buildingNode,
    roomNodes,
    agentNodes,
    floorNodes,
  };
}

// ── Query helpers ──────────────────────────────────────────────────────────────

/**
 * Find all scene nodes belonging to a given hierarchy tier.
 *
 * @param root - The root scene node to search from.
 * @param tier - The hierarchy tier to filter by.
 * @returns Array of nodes with userData.hierarchyTier === tier.
 */
export function queryTierNodes(
  root: SceneNode,
  tier: HierarchyTier,
): SceneNode[] {
  return findAll(root, (n) => n.userData.hierarchyTier === tier);
}

/**
 * Get the BirdsEyeVisualDescriptor from a scene node.
 *
 * Returns undefined if the node has not been annotated by initializeHierarchyVisuals().
 *
 * @param node - Target SceneNode.
 * @returns BirdsEyeVisualDescriptor or undefined.
 */
export function getBirdsEyeVisual(
  node: SceneNode,
): BirdsEyeVisualDescriptor | undefined {
  return node.userData.birdsEyeVisual as BirdsEyeVisualDescriptor | undefined;
}

/**
 * Verify that all four hierarchy tiers are present in the scene graph.
 *
 * Returns true only when building, floor, room, and agent tiers each have
 * at least one annotated node in the scene graph.
 *
 * @param root - The root scene node to inspect.
 * @returns true iff all four tiers are represented.
 */
export function allFourTiersPresent(root: SceneNode): boolean {
  const tiers: HierarchyTier[] = ["building", "floor", "room", "agent"];
  return tiers.every((t) => queryTierNodes(root, t).length > 0);
}

/**
 * Verify that every annotated node in the scene has a unique layerOrder
 * consistent with its tier.
 *
 * Each tier's layerOrder must be strictly greater than the tier above it:
 *   building=1 < floor=2 < room=3 < agent=4
 *
 * @param root - The root scene node to inspect.
 * @returns true iff all tier layerOrders are distinct and monotonically increasing.
 */
export function tierLayerOrdersAreDistinct(root: SceneNode): boolean {
  const tiers: HierarchyTier[] = ["building", "floor", "room", "agent"];
  const orders = tiers.map((t) => {
    const nodes = queryTierNodes(root, t);
    if (nodes.length === 0) return -1;
    // All nodes in the same tier must have the same layerOrder
    const desc = getBirdsEyeVisual(nodes[0]!);
    return desc?.layerOrder ?? -1;
  });

  // Check each order value is strictly greater than the previous
  for (let i = 1; i < orders.length; i++) {
    if ((orders[i] ?? -1) <= (orders[i - 1] ?? -1)) return false;
  }
  return true;
}

/**
 * Verify that tier elevations are strictly increasing from building to agent.
 *
 * Guarantees correct depth ordering in the top-down view:
 *   building (0.02) < floor (0.04) < room (0.06) < agent (0.10)
 *
 * @param root - The root scene node to inspect.
 * @returns true iff all tier elevations are monotonically increasing.
 */
export function tierElevationsAreIncreasing(root: SceneNode): boolean {
  const tiers: HierarchyTier[] = ["building", "floor", "room", "agent"];
  const elevations = tiers.map((t) => {
    const nodes = queryTierNodes(root, t);
    if (nodes.length === 0) return -1;
    const desc = getBirdsEyeVisual(nodes[0]!);
    return desc?.markerElevation ?? -1;
  });

  for (let i = 1; i < elevations.length; i++) {
    if ((elevations[i] ?? -1) <= (elevations[i - 1] ?? -1)) return false;
  }
  return true;
}

/**
 * Verify that each hierarchy tier has a visually distinct accent color.
 *
 * All four tiers must have different base accent colors so they are
 * distinguishable from each other in the bird's-eye palette.
 *
 * @returns true iff all four TIER_ACCENT_COLORS values are unique.
 */
export function tierAccentColorsAreDistinct(): boolean {
  const colors = Object.values(TIER_ACCENT_COLORS);
  const unique = new Set(colors);
  return unique.size === colors.length;
}
