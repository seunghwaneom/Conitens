/**
 * lod-drill-policy.ts — Drill-depth-aware LOD computation policy.
 *
 * Sub-AC 3.4: Implements the progressive reveal policy that determines
 * which geometry, status indicators, and metadata are shown as the camera
 * drills deeper into the building hierarchy.
 *
 * ── Two complementary axes control detail level ──────────────────────────────
 *
 *   1. Camera distance (NEAR / MID / FAR thresholds per hierarchy tier)
 *      ─ Thresholds mirror those in SceneHierarchy.tsx; kept in sync via
 *        the exported THRESHOLDS constant.
 *
 *   2. Drill depth  (building → floor → room → agent)
 *      ─ When a node is the ACTIVE DRILL TARGET, it is promoted to at
 *        least NEAR regardless of camera distance.
 *      ─ When a node is an ANCESTOR of the drill target, it is promoted
 *        to at least MID so the context is visible.
 *      ─ Non-target / non-ancestor nodes are governed purely by camera
 *        distance.
 *
 * ── Effective LOD rule ───────────────────────────────────────────────────────
 *
 *   effectiveLOD = max(distanceLOD, drillPromotion)
 *
 * where "max" means "more detail wins" (NEAR > MID > FAR).
 *
 * ── Progressive reveal summary ───────────────────────────────────────────────
 *
 *   Building level
 *     FAR  → bounding silhouette + location anchor
 *     MID  → edge wireframe + floor dividers + building name badge
 *     NEAR → full BuildingShell geometry
 *
 *   Floor (Office) level
 *     FAR  → flat slab + coloured type dots per room
 *     MID  → room footprints (floor + ceiling planes) + type labels
 *     NEAR → full room walls + agents + metrics billboards
 *
 *   Room level
 *     FAR  → type indicator dot (inherited from floor FAR)
 *     MID  → footprint + type label + accent ring
 *     NEAR → full geometry + metrics + member count
 *
 *   Agent level
 *     FAR  → single role-coloured sphere
 *     MID  → body cylinder silhouette + status dot
 *     NEAR → full avatar + name badge + status ring + task count + lifecycle
 *
 * All functions in this module are pure (no React, no Three.js, no store
 * dependencies) so they can be unit-tested without a browser or WebGL context.
 */

// ── LOD level type ────────────────────────────────────────────────────────────

/** Discrete LOD level (matches SceneHierarchy.tsx LODLevel). */
export type LODLevel = "near" | "mid" | "far";

/**
 * Numeric rank for LOD levels: higher rank = more detail.
 * Used to resolve the "max detail wins" rule.
 */
export const LOD_RANK: Record<LODLevel, number> = {
  far:  0,
  mid:  1,
  near: 2,
} as const;

// ── Drill level type ──────────────────────────────────────────────────────────

/**
 * The four hierarchy drill levels that correspond to the 4-tier world:
 *   building → floor → room → agent
 */
export type DrillLevel = "building" | "floor" | "room" | "agent";

/**
 * Numeric depth index for drill levels (deeper = higher number).
 * Used when checking whether a node is an ancestor or target.
 */
export const DRILL_DEPTH: Record<DrillLevel, number> = {
  building: 0,
  floor:    1,
  room:     2,
  agent:    3,
} as const;

// ── LOD thresholds ────────────────────────────────────────────────────────────

/**
 * Per-tier camera distance thresholds.
 *
 * These values MUST stay in sync with the corresponding constants in
 * SceneHierarchy.tsx.  The thresholds are re-exported here so that tests
 * and other consumers can import them from a single source of truth.
 *
 *   near: distance < near  → NEAR LOD
 *   far:  distance >= far  → FAR LOD
 *   mid:  near ≤ distance < far  → MID LOD
 */
export const THRESHOLDS = {
  /** Building shell tier */
  building: { near: 18, far: 38 },
  /** Floor / office tier */
  floor:    { near: 14, far: 30 },
  /** Agent tier */
  agent:    { near: 6,  far: 14 },
} as const;

// ── Sprite Agent LOD ─────────────────────────────────────────────────────────

/** Camera distance thresholds for the pixel-art sprite rendering path. */
export const SPRITE_LOD = { near: 8, far: 18 } as const;

/** Per-LOD visibility flags for the sprite rendering path. */
export interface SpriteLodVisibility {
  readonly showSprite: boolean;
  readonly showDot: boolean;
  readonly showBadge: boolean;
  readonly showStatusDot: boolean;
  readonly animate: boolean;
}

/** Sprite agent LOD detail policy — what to show at each distance tier. */
export const SPRITE_LOD_DETAIL: Record<LODLevel, SpriteLodVisibility> = {
  far:  { showSprite: false, showDot: true,  showBadge: false, showStatusDot: false, animate: false },
  mid:  { showSprite: true,  showDot: false, showBadge: true,  showStatusDot: false, animate: false },
  near: { showSprite: true,  showDot: false, showBadge: true,  showStatusDot: true,  animate: true  },
} as const;

/**
 * Resolve sprite LOD level from camera distance using SPRITE_LOD thresholds.
 */
export function getSpriteLodLevel(distance: number): LODLevel {
  if (distance < SPRITE_LOD.near) return "near";
  if (distance >= SPRITE_LOD.far) return "far";
  return "mid";
}

// ── Drill relationship ────────────────────────────────────────────────────────

/**
 * Describes how a scene node relates to the current drill target.
 *
 *   "target"   — This IS the currently-drilled node → promoted to NEAR
 *   "ancestor" — This is a parent of the drilled node → promoted to MID
 *   "sibling"  — Peer node at the same tier as the target → no promotion
 *   "none"     — Completely unrelated to the current drill → no promotion
 */
export type DrillRelationship = "target" | "ancestor" | "sibling" | "none";

/**
 * Minimum LOD level granted by each drill relationship.
 *
 * "target" always gets NEAR so the user sees maximum detail for the entity
 * they have explicitly focused on.
 *
 * "ancestor" gets MID so the surrounding context is legible even from far
 * away (e.g., the floor label remains visible when drilling into a room).
 *
 * "sibling" and "none" get FAR — only camera distance governs their detail.
 */
export const DRILL_PROMOTION: Record<DrillRelationship, LODLevel> = {
  target:   "near",
  ancestor: "mid",
  sibling:  "far",
  none:     "far",
} as const;

// ── Core computation functions ────────────────────────────────────────────────

/**
 * computeDistanceLOD — Maps camera distance to a discrete LOD level.
 *
 * Pure function; no dependencies on React or Three.js.
 *
 * @param dist     Camera-to-node-centre distance in world units
 * @param nearDist Distance threshold below which NEAR LOD applies
 * @param farDist  Distance threshold above which FAR LOD applies
 * @returns        "near" | "mid" | "far"
 */
export function computeDistanceLOD(
  dist: number,
  nearDist: number,
  farDist: number,
): LODLevel {
  if (dist < nearDist) return "near";
  if (dist < farDist)  return "mid";
  return "far";
}

/**
 * computeEffectiveLOD — Hybrid distance + drill-depth LOD computation.
 *
 * Combines a distance-derived LOD with a drill-relationship-derived
 * minimum LOD.  The "more detail wins" rule ensures that drill targets
 * always show at least the level appropriate for their role in the
 * current navigation path, even when the camera is farther than the
 * normal NEAR/MID thresholds.
 *
 * @param distanceLOD   LOD derived from camera-to-node distance
 * @param drillRelation Relationship of this node to the current drill target
 * @returns             The higher-detail LOD of the two inputs
 *
 * @example
 *   // Floor is the current drill target; camera is 20 units away (MID range).
 *   // Drill promotion forces NEAR.
 *   computeEffectiveLOD("mid", "target")  // → "near"
 *
 *   // Ancestor floor is 25 units away (MID range by distance).
 *   // Drill promotion is "mid" — no change.
 *   computeEffectiveLOD("mid", "ancestor")  // → "mid"
 *
 *   // Sibling floor is 5 units away (NEAR by distance alone).
 *   // Drill promotion is "far" — distance wins.
 *   computeEffectiveLOD("near", "sibling")  // → "near"
 */
export function computeEffectiveLOD(
  distanceLOD: LODLevel,
  drillRelation: DrillRelationship,
): LODLevel {
  const distRank    = LOD_RANK[distanceLOD];
  const drillMinLod = DRILL_PROMOTION[drillRelation];
  const drillRank   = LOD_RANK[drillMinLod];
  return distRank >= drillRank ? distanceLOD : drillMinLod;
}

// ── Drill relationship helpers ────────────────────────────────────────────────

/**
 * getFloorDrillRelationship — Drill relationship for a given floor node.
 *
 * @param floor       Floor index (0-based)
 * @param drillLevel  Current global drill level
 * @param drillFloor  Currently-drilled floor index (null = not drilled into floor)
 * @returns           DrillRelationship for this floor
 */
export function getFloorDrillRelationship(
  floor: number,
  drillLevel: DrillLevel,
  drillFloor: number | null,
): DrillRelationship {
  // At building level no floor is a target or ancestor
  if (drillLevel === "building") return "none";
  if (drillFloor === null) return "none";

  // This floor is not the drilled floor — it is a sibling
  if (drillFloor !== floor) return "sibling";

  // This floor IS the drilled floor
  if (drillLevel === "floor") return "target";

  // drillLevel is "room" or "agent" — this floor is an ancestor
  return "ancestor";
}

/**
 * getRoomDrillRelationship — Drill relationship for a given room node.
 *
 * @param roomId     Room identifier string
 * @param drillLevel Current global drill level
 * @param drillRoom  Currently-drilled room ID (null = not drilled into a room)
 * @returns          DrillRelationship for this room
 */
export function getRoomDrillRelationship(
  roomId: string,
  drillLevel: DrillLevel,
  drillRoom: string | null,
): DrillRelationship {
  // At building or floor level, rooms have no drill context
  if (drillLevel === "building" || drillLevel === "floor") return "none";
  if (drillRoom === null) return "none";

  // This room is not the drilled room — it is a sibling
  if (drillRoom !== roomId) return "sibling";

  // This room IS the drilled room
  if (drillLevel === "room") return "target";

  // drillLevel is "agent" — this room is an ancestor
  return "ancestor";
}

/**
 * getAgentDrillRelationship — Drill relationship for a given agent node.
 *
 * @param agentId    Agent identifier string
 * @param drillLevel Current global drill level
 * @param drillAgent Currently-drilled agent ID (null = not at agent level)
 * @returns          DrillRelationship for this agent
 */
export function getAgentDrillRelationship(
  agentId: string,
  drillLevel: DrillLevel,
  drillAgent: string | null,
): DrillRelationship {
  if (drillLevel !== "agent") return "none";
  if (drillAgent === null) return "none";
  if (drillAgent === agentId) return "target";
  return "sibling";
}

// ── Progressive metadata detail layers ───────────────────────────────────────
//
// These objects define precisely WHICH visual elements are revealed at each
// LOD level for each hierarchy tier.  They serve as the single source of
// truth for the progressive reveal policy.
//
// Rule: NEAR reveals everything that MID reveals, plus more.
//       MID reveals everything that FAR reveals, plus more.
//

/**
 * Agent status indicator detail — what is shown at each LOD level.
 *
 *   FAR  → colored sphere only (role color; no status info)
 *   MID  → body silhouette cylinder + status dot (color-coded activity)
 *   NEAR → full avatar + name badge + status ring + task count + lifecycle
 */
export interface AgentStatusDetail {
  /** Show the body silhouette cylinder */
  showBody: boolean;
  /** Show the status dot (color-coded current activity status) */
  showStatusDot: boolean;
  /** Show the floating name badge (HTML diegetic overlay) */
  showNameBadge: boolean;
  /** Show the role-colored glow ring at the agent's feet */
  showStatusRing: boolean;
  /** Show the active task count indicator badge */
  showTaskCount: boolean;
  /** Show the lifecycle state label (e.g. ACTIVE, PAUSED) */
  showLifecycleLabel: boolean;
}

/**
 * Per-LOD agent status indicator detail.
 *
 * As the camera drills closer, progressively more status information is
 * revealed, matching the diegetic command-center aesthetic.
 */
export const AGENT_STATUS_DETAIL: Record<LODLevel, AgentStatusDetail> = {
  far: {
    showBody:           false,
    showStatusDot:      false,
    showNameBadge:      false,
    showStatusRing:     false,
    showTaskCount:      false,
    showLifecycleLabel: false,
  },
  mid: {
    showBody:           true,
    showStatusDot:      true,
    showNameBadge:      false,
    showStatusRing:     false,
    showTaskCount:      false,
    showLifecycleLabel: false,
  },
  near: {
    showBody:           true,
    showStatusDot:      true,
    showNameBadge:      true,
    showStatusRing:     true,
    showTaskCount:      true,
    showLifecycleLabel: true,
  },
} as const;

/**
 * Room metadata detail — what geometry and info is revealed per LOD level.
 *
 *   FAR  → type indicator dot only (inherited from floor FAR slab layer)
 *   MID  → room footprint planes + type label + accent ring
 *   NEAR → full room walls + metrics billboard + member (agent) count
 */
export interface RoomMetadataDetail {
  /** Show the room footprint planes (floor + ceiling slabs) */
  showFootprint: boolean;
  /** Show the room type text label (HTML overlay) */
  showTypeLabel: boolean;
  /** Show the perimeter accent ring on the floor plane */
  showAccentRing: boolean;
  /** Show the floating metrics billboard above the room */
  showMetricsBillboard: boolean;
  /** Show the full room wall and door geometry */
  showFullGeometry: boolean;
  /** Show the member/agent count badge */
  showMemberCount: boolean;
}

/** Per-LOD room metadata detail. */
export const ROOM_METADATA_DETAIL: Record<LODLevel, RoomMetadataDetail> = {
  far: {
    showFootprint:        false,
    showTypeLabel:        false,
    showAccentRing:       false,
    showMetricsBillboard: false,
    showFullGeometry:     false,
    showMemberCount:      false,
  },
  mid: {
    showFootprint:        true,
    showTypeLabel:        true,
    showAccentRing:       true,
    showMetricsBillboard: false,
    showFullGeometry:     false,
    showMemberCount:      false,
  },
  near: {
    showFootprint:        true,
    showTypeLabel:        true,
    showAccentRing:       true,
    showMetricsBillboard: true,
    showFullGeometry:     true,
    showMemberCount:      true,
  },
} as const;

/**
 * Floor (office) metadata detail — what is shown at each floor LOD level.
 *
 *   FAR  → flat slab silhouette + coloured type dots
 *   MID  → per-room floor/ceiling footprints + type labels
 *   NEAR → full room wall geometry + agent representations + metrics
 */
export interface FloorMetadataDetail {
  /** Show the flat floor slab */
  showSlab: boolean;
  /** Show per-room type indicator coloured dots */
  showTypeDots: boolean;
  /** Show per-room footprint planes (floor + ceiling) */
  showRoomFootprints: boolean;
  /** Show room type text labels */
  showRoomLabels: boolean;
  /** Show full room wall geometry */
  showRoomWalls: boolean;
  /** Show agent avatar representations */
  showAgents: boolean;
  /** Show room metrics billboards */
  showMetrics: boolean;
}

/** Per-LOD floor metadata detail. */
export const FLOOR_METADATA_DETAIL: Record<LODLevel, FloorMetadataDetail> = {
  far: {
    showSlab:           true,
    showTypeDots:       true,
    showRoomFootprints: false,
    showRoomLabels:     false,
    showRoomWalls:      false,
    showAgents:         false,
    showMetrics:        false,
  },
  mid: {
    showSlab:           true,
    showTypeDots:       false,
    showRoomFootprints: true,
    showRoomLabels:     true,
    showRoomWalls:      false,
    showAgents:         false,
    showMetrics:        false,
  },
  near: {
    showSlab:           true,
    showTypeDots:       false,
    showRoomFootprints: false,
    showRoomLabels:     true,
    showRoomWalls:      true,
    showAgents:         true,
    showMetrics:        true,
  },
} as const;

/**
 * Building metadata detail — what is shown at each building LOD level.
 *
 *   FAR  → bounding silhouette box + location anchor dot
 *   MID  → edge wireframe + floor dividers + building name badge
 *   NEAR → full BuildingShell geometry
 */
export interface BuildingMetadataDetail {
  /** Show the full building shell geometry (walls, roof, etc.) */
  showFullShell: boolean;
  /** Show the edge wireframe outline */
  showEdgeWireframe: boolean;
  /** Show the building name / floor-count badge (HTML overlay) */
  showNameBadge: boolean;
  /** Show the bounding silhouette box */
  showSilhouette: boolean;
  /** Show the floor-divider lines */
  showFloorDividers: boolean;
  /** Show the base accent glow strip */
  showBaseAccent: boolean;
}

/** Per-LOD building metadata detail. */
export const BUILDING_METADATA_DETAIL: Record<LODLevel, BuildingMetadataDetail> = {
  far: {
    showFullShell:     false,
    showEdgeWireframe: false,
    showNameBadge:     false,
    showSilhouette:    true,
    showFloorDividers: false,
    showBaseAccent:    false,
  },
  mid: {
    showFullShell:     false,
    showEdgeWireframe: true,
    showNameBadge:     true,
    showSilhouette:    false,
    showFloorDividers: true,
    showBaseAccent:    true,
  },
  near: {
    showFullShell:     true,
    showEdgeWireframe: false,
    showNameBadge:     false,
    showSilhouette:    false,
    showFloorDividers: true,
    showBaseAccent:    false,
  },
} as const;

// ── Convenience accessors ─────────────────────────────────────────────────────

/**
 * getAgentStatusDetail — Returns the agent status indicator detail object
 * for the given effective LOD level.
 *
 * Wraps the AGENT_STATUS_DETAIL constant for use in scene components.
 */
export function getAgentStatusDetail(lod: LODLevel): AgentStatusDetail {
  return AGENT_STATUS_DETAIL[lod];
}

/**
 * getRoomMetadataDetail — Returns the room metadata detail object for the
 * given effective LOD level.
 */
export function getRoomMetadataDetail(lod: LODLevel): RoomMetadataDetail {
  return ROOM_METADATA_DETAIL[lod];
}

/**
 * getFloorMetadataDetail — Returns the floor metadata detail object for the
 * given effective LOD level.
 */
export function getFloorMetadataDetail(lod: LODLevel): FloorMetadataDetail {
  return FLOOR_METADATA_DETAIL[lod];
}

/**
 * getBuildingMetadataDetail — Returns the building metadata detail object
 * for the given effective LOD level.
 */
export function getBuildingMetadataDetail(lod: LODLevel): BuildingMetadataDetail {
  return BUILDING_METADATA_DETAIL[lod];
}

// ── Drill-path full LOD derivation ────────────────────────────────────────────

/**
 * DeepDrillLODs — The effective LOD for every node in the hierarchy given
 * the current drill context.
 *
 * This is the complete output of `computeFullDrillLODs` — one LOD per tier
 * for the currently-focused node path.
 */
export interface DeepDrillLODs {
  /** Effective LOD for the building node */
  building: LODLevel;
  /** Effective LOD for the drilled floor (null if not at floor+ level) */
  floor: LODLevel | null;
  /** Effective LOD for the drilled room (null if not at room+ level) */
  room: LODLevel | null;
  /** Effective LOD for the drilled agent (null if not at agent level) */
  agent: LODLevel | null;
}

/**
 * computeFullDrillLODs — Derives effective LOD for the entire drill path.
 *
 * Given the current drill state (level, floor, room, agent) and per-tier
 * camera distances, returns the effective LOD for each node in the active
 * path.  Nodes not in the path return null.
 *
 * This is the top-level aggregator function that scene components can call
 * to get the full picture in one place.
 *
 * @param drillLevel         Current drill level
 * @param drillFloor         Currently drilled floor index (or null)
 * @param drillRoom          Currently drilled room ID (or null)
 * @param drillAgentId       Currently drilled agent ID (or null)
 * @param buildingCamDist    Camera distance to building centre
 * @param floorCamDist       Camera distance to drilled floor centre (or null)
 * @param agentCamDist       Camera distance to drilled agent (or null)
 */
export function computeFullDrillLODs(
  drillLevel: DrillLevel,
  drillFloor: number | null,
  drillRoom: string | null,
  drillAgentId: string | null,
  buildingCamDist: number,
  floorCamDist: number | null,
  agentCamDist: number | null,
): DeepDrillLODs {
  // Building LOD
  const buildingDistLOD = computeDistanceLOD(
    buildingCamDist,
    THRESHOLDS.building.near,
    THRESHOLDS.building.far,
  );
  // Building is always NEAR when drilled into (it's always the ancestor)
  const buildingRelation: DrillRelationship =
    drillLevel === "building" ? "none" : "ancestor";
  const buildingLOD = computeEffectiveLOD(buildingDistLOD, buildingRelation);

  // Floor LOD
  let floorLOD: LODLevel | null = null;
  if (drillLevel !== "building" && drillFloor !== null) {
    const floorDistLOD = computeDistanceLOD(
      floorCamDist ?? buildingCamDist,
      THRESHOLDS.floor.near,
      THRESHOLDS.floor.far,
    );
    const floorRelation = getFloorDrillRelationship(drillFloor, drillLevel, drillFloor);
    floorLOD = computeEffectiveLOD(floorDistLOD, floorRelation);
  }

  // Room LOD: always NEAR when it is the drill target or ancestor
  let roomLOD: LODLevel | null = null;
  if (drillRoom !== null) {
    const roomRelation = getRoomDrillRelationship(drillRoom, drillLevel, drillRoom);
    // Room distance not tracked separately — inherit from floor cam dist
    const roomBaseDist = floorCamDist ?? buildingCamDist;
    const roomDistLOD = computeDistanceLOD(
      roomBaseDist,
      THRESHOLDS.floor.near,
      THRESHOLDS.floor.far,
    );
    roomLOD = computeEffectiveLOD(roomDistLOD, roomRelation);
  }

  // Agent LOD: always NEAR when drilled into
  let agentLOD: LODLevel | null = null;
  if (drillAgentId !== null) {
    const agentRelation = getAgentDrillRelationship(drillAgentId, drillLevel, drillAgentId);
    const agentDistLOD = computeDistanceLOD(
      agentCamDist ?? 0,
      THRESHOLDS.agent.near,
      THRESHOLDS.agent.far,
    );
    agentLOD = computeEffectiveLOD(agentDistLOD, agentRelation);
  }

  return { building: buildingLOD, floor: floorLOD, room: roomLOD, agent: agentLOD };
}
