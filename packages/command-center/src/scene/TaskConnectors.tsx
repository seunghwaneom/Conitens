/**
 * TaskConnectors.tsx — 3D visual connectors between task nodes and agent nodes.
 *
 * Sub-AC 5.2: Renders beam/arc connectors linking floating task orbs to their
 * assigned agent avatars in the scene.
 *
 * Sub-AC 5.3: Highest-priority visual treatment applied:
 *   - depthTest: false on ALL connector materials → visible through walls/floors
 *   - renderOrder 997-999 → drawn after all scene geometry
 *   - THREE.AdditiveBlending on glow sheaths → luminous bloom-like effect
 *   - PointLight at each task orb → physically illuminates surrounding geometry
 *   - Scan pulse sprite for active beams → bright dot traverses arc every ~1.8 s
 *   - Corona ring for critical/high-priority orbs → extra visual weight
 *   - Extended animation ranges → dominant motion signal in field of view
 *   - TaskMappingHUD (see TaskMappingHUD.tsx) → always-visible 2D overlay
 *
 * Sub-AC 15c: Performance optimisations at scale (3-20 agents, 100+ tasks):
 *   - MAX_POINT_LIGHTS (4): only the highest-priority tasks get a PointLight
 *   - BatchedConnectorLines: all arc lines in ONE draw call (vs. N individual Lines)
 *   - TubeGeometry gated by quality level (skipped at 'medium' / 'low')
 *   - Task orb HTML badge hidden when quality is 'low'
 *   - usePerformanceQuality() drives these quality knobs from the FPS monitor
 *
 * Architecture:
 *   TaskNodeOrb      — low-poly octahedron floating above the assigned agent
 *   TaskConnectorBeam — QuadraticBezier arc from orb → agent head
 *   TaskConnectorsLayer — top-level layer; iterates task-store assignments
 *
 * Visual language (dark-theme command-center palette):
 *   - Orb color  ← task priority  (critical=red, high=orange, normal=cyan, low=teal)
 *   - Beam color ← task status    (active=green, assigned=blue, blocked=orange, …)
 *   - Active tasks : pulsing orb scale + emissive, animated beam opacity, scan pulse
 *   - Blocked tasks: nervous flicker on both orb and beam
 *   - Assigned tasks: steady glow
 *
 * Event sourcing:
 *   All positions derive from task-store + agent-store which are event-sourced.
 *   This layer is purely presentational — it adds no new state and writes no events.
 *
 * Performance:
 *   - BufferGeometry / TubeGeometry created via useMemo, disposed on unmount
 *   - Animation runs in useFrame with no React state updates per frame
 *   - Only non-terminal assignments are rendered (done/cancelled are hidden)
 *   - TubeGeometry uses minimal radial segments (4) for low-poly fidelity
 */

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useTaskStore } from "../store/task-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useViewWindowStore } from "../store/view-window-store.js";
import type { TaskRecord, TaskStatus, TaskPriority } from "../store/task-store.js";
import type { TaskAgentMappingEntity } from "../data/task-agent-mapping.js";
import {
  usePerformanceQuality,
} from "./ScenePerformance.js";
import {
  BatchedConnectorLines,
  DEFAULT_CURVE_SEGMENTS,
  DEFAULT_ARC_LIFT,
  type ConnectorLineDescriptor,
} from "./BatchedConnectorLines.js";
import {
  BIRDS_EYE_BUILDING_CENTER_X,
  BIRDS_EYE_BUILDING_CENTER_Z,
  BIRDS_EYE_DEFAULT_ZOOM,
  BIRDS_EYE_MAX_ZOOM,
} from "./BirdsEyeCamera.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Approximate world-space Y offset to the agent's head centre.
 * Matches BODY_HEIGHT + HEAD_RADIUS + gap from AgentAvatar.tsx:
 *   0.55 (body) + 0.10*2 (head diam) + 0.05 (gap) = ~0.80
 */
export const AGENT_HEAD_Y_OFFSET = 0.80;

/** Y offset above agent's foot (worldPosition.y) where task orbs float. */
export const ORB_FLOAT_Y = 1.65;

/** Radial spread radius for multiple orbs belonging to the same agent. */
export const ORB_SPREAD_RADIUS = 0.40;

/**
 * Half-extent of the octahedron orb mesh.
 *
 * Sub-AC 5b: Tasks are rendered as low-poly nodes using octahedronGeometry
 * with detail=0 (zero subdivisions) for stylized faceted appearance.
 * This matches the "stylized low-poly" design language of the command center.
 */
export const ORB_SIZE = 0.10;

/** How far the bezier control-point is lifted above the straight-line midpoint. */
export const ARC_LIFT = 0.38;

/**
 * Sub-AC 5.3: renderOrder values ensuring connectors are drawn after all
 * scene geometry. Three.js draws higher renderOrder objects last (on top).
 *
 *   RENDER_ORDER_SCAN (999) — Scan pulse sprite: topmost element in scene
 *   RENDER_ORDER_ORB  (998) — Orb mesh + corona rings
 *   RENDER_ORDER_BEAM (997) — Connector line + tube glow sheath
 *
 * All values exceed 0 (default) so connectors always render on top of
 * rooms, floors, and building geometry.
 */
export const RENDER_ORDER_SCAN = 999;
export const RENDER_ORDER_ORB  = 998;
export const RENDER_ORDER_BEAM = 997;

/**
 * Task statuses for which connectors are rendered.
 * Terminal (done/cancelled) and pre-assignment (draft/planned) are excluded.
 *
 * Sub-AC 5b: Only tasks actively linked to an agent (assigned/active/blocked/review)
 * produce visible 3D nodes and edges in the scene.
 */
export const VISIBLE_STATUSES = new Set<TaskStatus>([
  "assigned", "active", "blocked", "review",
]);

/**
 * Sub-AC 15c: Maximum number of per-task PointLights active in the scene at once.
 *
 * Each PointLight forces all lit geometry to run an additional shading pass.
 * With 100+ tasks this would be catastrophic — so we allow at most this many
 * lights and allocate them to the highest-priority active tasks.
 * Lower-priority tasks rely on their emissive material alone for visibility.
 */
export const MAX_POINT_LIGHTS = 4;

/**
 * Sub-AC 15c: Priority ordering for PointLight budget allocation.
 * Higher rank = higher priority for receiving a PointLight.
 */
export const PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  critical: 4,
  high:     3,
  normal:   2,
  low:      1,
};

// ── Color maps ────────────────────────────────────────────────────────────────

/**
 * Priority → orb body colour (matches TASK_PRIORITY_COLOR in task-types.ts).
 *
 * Sub-AC 5b: Task nodes use this color palette to create visually distinct
 * representations based on urgency.
 */
export const PRIORITY_COLOR: Readonly<Record<TaskPriority, string>> = {
  critical: "#FF3D00",
  high:     "#FF9100",
  normal:   "#40C4FF",
  low:      "#B2DFDB",
};

/**
 * Status → beam / connector colour.
 *
 * Sub-AC 5b: Assignment edges use this color palette to encode task lifecycle
 * state into the visual link connecting task-node to agent-node.
 */
export const STATUS_BEAM_COLOR: Readonly<Record<TaskStatus, string>> = {
  draft:     "#444466",
  planned:   "#555588",
  assigned:  "#40C4FF",
  active:    "#00ff88",
  blocked:   "#FF9100",
  review:    "#aa88ff",
  done:      "#2a5a2a",
  failed:    "#ff4444",
  cancelled: "#333344",
};

/**
 * Sub-AC 5.3: Point light intensity per priority.
 * Higher priority → stronger illumination of surrounding room geometry.
 * Critical tasks visibly "glow" the walls and floor near the agent.
 */
export const PRIORITY_LIGHT_INTENSITY: Readonly<Record<TaskPriority, number>> = {
  critical: 2.0,
  high:     1.2,
  normal:   0.6,
  low:      0.3,
};

// ── Sub-AC 5b: LOD (level-of-detail) types, constants, and pure functions ─────

/**
 * Camera-distance break-points for perspective-mode LOD tiers.
 *
 * The building center is at ≈ (6, 0, 3) in world space.  Camera distance is
 * measured from this point.  Three tiers are used:
 *
 *   Tier 0 — CLOSE:  distance < CONNECTOR_LOD_CLOSE_DIST   (zoomed-in perspective)
 *   Tier 1 — MID:    distance ∈ [CLOSE, MID)               (default perspective preset)
 *   Tier 2 — FAR:    distance ≥ CONNECTOR_LOD_MID_DIST     (overview / cutaway)
 *
 * Bird's-eye orthographic mode uses frustum half-size (birdsEyeZoom) instead of
 * camera distance, since the camera height is always fixed at BIRDS_EYE_CAMERA_HEIGHT.
 */
export const CONNECTOR_LOD_CLOSE_DIST    = 10;  // world units from building center
export const CONNECTOR_LOD_MID_DIST      = 22;  // world units from building center

/** Reference camera distance — used to normalise perspective orbScale. */
export const CONNECTOR_LOD_REFERENCE_DIST = 12; // roughly the default-preset distance

/** Reference bird's-eye zoom — at this zoom orbScale = 1.0 (normal). */
export const CONNECTOR_LOD_REFERENCE_ZOOM = BIRDS_EYE_DEFAULT_ZOOM; // 10

/** Clamp limits for orb world-space scale multiplier. */
export const CONNECTOR_LOD_ORB_MIN_SCALE = 0.50;
export const CONNECTOR_LOD_ORB_MAX_SCALE = 3.00;

/** Bézier curve-sample counts per LOD tier (fewer segments = coarser arc). */
export const CONNECTOR_LOD_SEGMENTS_CLOSE = DEFAULT_CURVE_SEGMENTS; // 12 — full quality
export const CONNECTOR_LOD_SEGMENTS_MID   = 8;                      // medium quality
export const CONNECTOR_LOD_SEGMENTS_FAR   = 5;                      // minimal (still smooth)

/**
 * Input parameters for computeConnectorLOD.
 * All fields are plain numbers/strings — no Three.js types — so this interface
 * is fully testable without a WebGL context.
 */
export interface ConnectorLODParams {
  /**
   * Camera distance from the building centre in world units.
   * Ignored when cameraMode === 'birdsEye' (frustum zoom drives scale instead).
   */
  cameraDistanceFromCenter: number;
  /** Current camera mode from the spatial store. */
  cameraMode: "perspective" | "birdsEye";
  /**
   * Current bird's-eye orthographic zoom (frustum half-height in world units).
   * Only used when cameraMode === 'birdsEye'.
   * Defaults to CONNECTOR_LOD_REFERENCE_ZOOM when absent.
   */
  birdsEyeZoom?: number;
}

/**
 * Output configuration from computeConnectorLOD.
 * All fields are plain numbers — no Three.js types.
 */
export interface ConnectorLODConfig {
  /** Number of Bézier curve sample intervals for BatchedConnectorLines. */
  curveSegments: number;
  /** Y-lift of the Bézier control point above the straight-line midpoint. */
  arcLift: number;
  /**
   * Multiplier for orb world-space radius.
   * > 1.0 enlarges orbs to compensate for zoom-out (maintains screen-space footprint).
   * Applied to the base ORB_SIZE in TaskNodeOrb.
   */
  orbScale: number;
  /**
   * Minimum opacity floor for BatchedConnectorLines (passed as lodOpacityFloor).
   * Increased at far distances so 1 px lines remain visually prominent.
   */
  lineOpacityFloor: number;
}

/**
 * Sub-AC 5b: Pure function — classifies a perspective camera distance into
 * one of three integer LOD tiers (0 = close, 1 = mid, 2 = far).
 *
 * Exported for unit testing (no Three.js dependency).
 *
 * @param distanceFromCenter - Camera distance from building centre in world units.
 * @returns 0 | 1 | 2 (close / mid / far tier index).
 */
export function getConnectorLODTier(distanceFromCenter: number): 0 | 1 | 2 {
  if (distanceFromCenter < CONNECTOR_LOD_CLOSE_DIST) return 0;
  if (distanceFromCenter < CONNECTOR_LOD_MID_DIST)   return 1;
  return 2;
}

/**
 * Sub-AC 5b: Pure function — computes the LOD configuration for connector
 * geometry based on the current camera position and mode.
 *
 * Algorithm summary:
 *
 *   Bird's-eye mode:
 *     orbScale = clamp(birdsEyeZoom / referenceZoom, ORB_MIN, ORB_MAX)
 *     At default zoom (10): orbScale = 1.0  (no change)
 *     At max zoom out (25): orbScale = 2.5  (orbs grow to compensate)
 *     At max zoom in (3):   orbScale = 0.5  (clamped; close zoom → smaller OK)
 *     arcLift unchanged (arc projects as straight line overhead anyway)
 *     curveSegments = FAR (5 — overhead view doesn't benefit from smooth arcs)
 *     lineOpacityFloor rises with zoom-out to boost line visibility
 *
 *   Perspective mode:
 *     Close (< 10 units): full quality, no scaling
 *     Mid (10–22 units):  interpolated, orbScale 1.0 → 1.6, mild arc-lift boost
 *     Far (> 22 units):   orbScale proportional to dist/12, arcLift 0.60
 *
 * @param params - Camera distance, mode, and optional bird's-eye zoom.
 * @returns ConnectorLODConfig — ready to pass to BatchedConnectorLines + TaskNodeOrb.
 */
export function computeConnectorLOD(params: ConnectorLODParams): ConnectorLODConfig {
  const {
    cameraDistanceFromCenter,
    cameraMode,
    birdsEyeZoom = CONNECTOR_LOD_REFERENCE_ZOOM,
  } = params;

  // ── Bird's-eye orthographic mode ───────────────────────────────────────────
  if (cameraMode === "birdsEye") {
    // Scale orbs to maintain constant screen-space footprint as zoom increases.
    // Screen size ∝ worldSize / frustumHalfSize, so worldSize ∝ frustumHalfSize
    // to keep screen size constant.  frustumHalfSize = birdsEyeZoom.
    const rawOrbScale = birdsEyeZoom / CONNECTOR_LOD_REFERENCE_ZOOM;
    const orbScale = Math.max(
      CONNECTOR_LOD_ORB_MIN_SCALE,
      Math.min(CONNECTOR_LOD_ORB_MAX_SCALE, rawOrbScale),
    );

    // Boost line opacity as zoom increases (lines stay 1px WebGL but look bolder
    // at higher opacity — and far zoom means the 1px lines cover a smaller fraction
    // of the scene, making them harder to see without the opacity boost).
    const zoomFraction = (birdsEyeZoom - CONNECTOR_LOD_REFERENCE_ZOOM) /
      (BIRDS_EYE_MAX_ZOOM - CONNECTOR_LOD_REFERENCE_ZOOM);
    const lineOpacityFloor = 0.35 + Math.max(0, zoomFraction) * 0.35; // 0.35 → 0.70

    return {
      curveSegments:    CONNECTOR_LOD_SEGMENTS_FAR, // overhead: 5 is sufficient
      arcLift:          DEFAULT_ARC_LIFT,            // lift does not help overhead
      orbScale,
      lineOpacityFloor: Math.min(0.70, lineOpacityFloor),
    };
  }

  // ── Perspective mode ───────────────────────────────────────────────────────
  const dist = cameraDistanceFromCenter;

  if (dist < CONNECTOR_LOD_CLOSE_DIST) {
    // Close: full quality, reference scale
    return {
      curveSegments:    CONNECTOR_LOD_SEGMENTS_CLOSE,
      arcLift:          DEFAULT_ARC_LIFT,
      orbScale:         1.0,
      lineOpacityFloor: 0.35,
    };
  }

  if (dist < CONNECTOR_LOD_MID_DIST) {
    // Mid: linearly interpolate between close and far quality settings
    const t = (dist - CONNECTOR_LOD_CLOSE_DIST) /
      (CONNECTOR_LOD_MID_DIST - CONNECTOR_LOD_CLOSE_DIST); // 0 → 1

    return {
      curveSegments:    CONNECTOR_LOD_SEGMENTS_MID,
      arcLift:          DEFAULT_ARC_LIFT + t * 0.12,  // 0.38 → 0.50
      orbScale:         1.0 + t * 0.60,               // 1.0  → 1.6
      lineOpacityFloor: 0.35 + t * 0.15,              // 0.35 → 0.50
    };
  }

  // Far: maximal compensation — scale orbs with distance, boost arc lift
  const orbScale = Math.min(
    CONNECTOR_LOD_ORB_MAX_SCALE,
    dist / CONNECTOR_LOD_REFERENCE_DIST,
  );

  return {
    curveSegments:    CONNECTOR_LOD_SEGMENTS_FAR,
    arcLift:          0.60,
    orbScale,
    lineOpacityFloor: 0.55,
  };
}

// ── Sub-AC 5b: Private hook — LOD config derived from live camera state ────────

/**
 * Reads the current camera position via useThree + useFrame and returns the
 * appropriate ConnectorLODConfig.  Only triggers React re-renders when the
 * LOD TIER changes (coarse 3-tier discretization), not every frame.
 *
 * Bird's-eye zoom changes are handled through the spatial store subscription,
 * which also triggers re-renders when the mode switches.
 *
 * Building centre fixed at (BIRDS_EYE_BUILDING_CENTER_X, 0, BIRDS_EYE_BUILDING_CENTER_Z)
 * — matches BirdsEyeCamera.tsx and CommandCenterScene.tsx constants.
 *
 * @internal — not exported; consumed only by TaskConnectorsLayer.
 */
function useConnectorLODConfig(): ConnectorLODConfig {
  const { camera } = useThree();
  const cameraMode    = useSpatialStore((s) => s.cameraMode);
  const birdsEyeZoom  = useSpatialStore((s) => s.birdsEyeZoom);

  // React state for the LOD tier (integer 0/1/2).  Only updated on tier boundary
  // crossings so useFrame does not trigger a React re-render every frame.
  const [perspectiveTier, setPerspectiveTier] = useState<0 | 1 | 2>(0);
  const prevTierRef = useRef<0 | 1 | 2>(0);

  // Stable building-centre vector — never reallocated.
  const buildingCenter = useRef(
    new THREE.Vector3(BIRDS_EYE_BUILDING_CENTER_X, 0, BIRDS_EYE_BUILDING_CENTER_Z),
  );

  // Track camera distance and update tier state when it crosses a boundary.
  // In bird's-eye mode we skip this computation (zoom drives scale instead).
  useFrame(() => {
    if (cameraMode === "birdsEye") return;
    const dist    = camera.position.distanceTo(buildingCenter.current);
    const newTier = getConnectorLODTier(dist);
    if (newTier !== prevTierRef.current) {
      prevTierRef.current = newTier;
      setPerspectiveTier(newTier);
    }
  });

  // Representative distance for each tier (used to drive computeConnectorLOD)
  const TIER_DIST: Record<0 | 1 | 2, number> = {
    0: CONNECTOR_LOD_CLOSE_DIST  - 2,  // 8  — solidly in the close tier
    1: (CONNECTOR_LOD_CLOSE_DIST + CONNECTOR_LOD_MID_DIST) / 2, // 16 — mid
    2: CONNECTOR_LOD_MID_DIST    + 8,  // 30 — solidly in the far tier
  };

  return useMemo((): ConnectorLODConfig => {
    if (cameraMode === "birdsEye") {
      return computeConnectorLOD({
        cameraDistanceFromCenter: 0, // unused in birdsEye mode
        cameraMode: "birdsEye",
        birdsEyeZoom,
      });
    }
    return computeConnectorLOD({
      cameraDistanceFromCenter: TIER_DIST[perspectiveTier],
      cameraMode: "perspective",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode, birdsEyeZoom, perspectiveTier]);
}

// ── Pure geometry helpers (Sub-AC 5b) ─────────────────────────────────────────

/**
 * Input record for computeOrbPositions.
 * Abstracts the task-store + agent-store data into a plain object for
 * pure-function testing without React or Zustand.
 */
export interface OrbConnectionInput {
  /** Unique task identifier. */
  taskId: string;
  /** Agent identifier this task is assigned to. */
  agentId: string;
  /** Agent's world-space foot position. */
  agentWorldPosition: { x: number; y: number; z: number };
}

/**
 * Sub-AC 5b: Pure function that computes the world-space position of each
 * task orb node.
 *
 * Ring-spread algorithm:
 *   - 1 task on an agent → orb centred directly above the agent's head
 *   - N>1 tasks on an agent → orbs evenly spread in a horizontal ring of
 *     radius ORB_SPREAD_RADIUS above the agent's head (one orb per 2π/N radians)
 *
 * Extracted from TaskConnectorsLayer to enable pure unit testing without
 * the React/Three.js render environment.
 *
 * @param connections - List of task-agent pairs to compute positions for.
 * @returns Map of taskId → [worldX, worldY, worldZ] for each orb.
 */
export function computeOrbPositions(
  connections: OrbConnectionInput[],
): Record<string, readonly [number, number, number]> {
  // Pass 1: group taskIds by agent for ring-count determination
  const agentTaskLists: Record<string, string[]> = {};
  for (const conn of connections) {
    if (!agentTaskLists[conn.agentId]) agentTaskLists[conn.agentId] = [];
    agentTaskLists[conn.agentId].push(conn.taskId);
  }

  // Pass 2: assign ring position to each task
  const positionMap: Record<string, readonly [number, number, number]> = {};
  const indexTracker: Record<string, number> = {};

  for (const conn of connections) {
    const { agentId, taskId, agentWorldPosition: wp } = conn;
    const taskList = agentTaskLists[agentId];
    const total    = taskList.length;

    if (indexTracker[agentId] === undefined) indexTracker[agentId] = 0;
    const i = indexTracker[agentId]++;

    // Single task → centred above agent; multiple → ring spread
    const angle = total > 1 ? (i / total) * Math.PI * 2 : 0;
    const r     = total > 1 ? ORB_SPREAD_RADIUS : 0;

    positionMap[taskId] = [
      wp.x + Math.cos(angle) * r,
      wp.y + ORB_FLOAT_Y,
      wp.z + Math.sin(angle) * r,
    ];
  }

  return positionMap;
}

/**
 * Sub-AC 5b / Sub-AC 15c: Pure function that allocates the PointLight budget.
 *
 * Returns the set of taskIds that should receive a physical PointLight.
 * Selects the `maxLights` highest-priority connections, with active tasks
 * preferred over blocked > review > assigned at the same priority level.
 *
 * @param connections - Task connections to rank for lighting budget.
 * @param maxLights   - Maximum PointLights to allocate (default MAX_POINT_LIGHTS).
 * @returns Set of taskIds that get a physical PointLight.
 */
export function computeLightBudget(
  connections: Array<{ taskId: string; priority: TaskPriority; status: TaskStatus }>,
  maxLights = MAX_POINT_LIGHTS,
): Set<string> {
  if (connections.length === 0) return new Set();

  const statusScore = (s: TaskStatus): number => {
    switch (s) {
      case "active":   return 3;
      case "blocked":  return 2;
      case "review":   return 1;
      default:         return 0;
    }
  };

  const sorted = [...connections].sort((a, b) => {
    const rankDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (rankDiff !== 0) return rankDiff;
    return statusScore(b.status) - statusScore(a.status);
  });

  const ids = new Set<string>();
  for (let i = 0; i < Math.min(sorted.length, maxLights); i++) {
    ids.add(sorted[i].taskId);
  }
  return ids;
}

// ── Sub-AC 5.2: Entity-bridge types ───────────────────────────────────────────

/**
 * Sub-AC 5.2: Badge descriptor derived from a single TaskAgentMappingEntity.
 *
 * Contains only the information needed to render the orb's diegetic 2D badge
 * and TaskMappingHUD cards.  All visual fields are pre-computed from entity
 * fields — no secondary store lookups required.
 */
export interface ConnectorBadgeDescriptor {
  /** Task identifier — used as stable React key. */
  taskId: string;
  /** Agent identifier — shown in "→ agentId" badge label. */
  agentId: string;
  /** Hex color for the priority indicator square on the badge. */
  priorityColor: string;
  /** Single-char priority label: C (critical) / H (high) / N (normal) / L (low). */
  priorityLabel: string;
  /** Hex color for the status dot and border-left accent. */
  statusBeamColor: string;
  /** 4-char abbreviated status label shown on the badge card. */
  statusLabel: string;
  /** Unix ms timestamp — for elapsed-time calculation in HUD. */
  assignedTs: number;
}

/** Sub-AC 5.2: Priority → single-char badge label. */
export const CONNECTOR_BADGE_PRIORITY_LABEL: Readonly<Record<TaskPriority, string>> = {
  critical: "C",
  high:     "H",
  normal:   "N",
  low:      "L",
};

/** Sub-AC 5.2: Status → 4-char abbreviated badge label. */
export const CONNECTOR_BADGE_STATUS_LABEL: Readonly<Record<TaskStatus, string>> = {
  draft:     "DRFT",
  planned:   "PLAN",
  assigned:  "ASGN",
  active:    "ACTV",
  blocked:   "BLKD",
  review:    "REVW",
  done:      "DONE",
  failed:    "FAIL",
  cancelled: "CNCL",
};

// ── Sub-AC 5.2: Entity-to-renderer bridge functions ────────────────────────────

/**
 * Sub-AC 5.2: Build orb world-space positions from TaskAgentMappingEntity array.
 *
 * Entity-based counterpart to the inline orb-position computation in
 * TaskConnectorsLayer.  Accepts TaskAgentMappingEntity[] directly from the
 * ontology data layer so that rendering logic is decoupled from the raw
 * task-store and agent-store shapes.
 *
 * Ring-spread algorithm (matches computeOrbPositions):
 *   - 1 visible task on an agent → orb centred directly above agent
 *   - N>1 visible tasks on an agent → orbs evenly spread in a horizontal ring
 *     of radius ORB_SPREAD_RADIUS above the agent's head (one orb per 2π/N rad)
 *
 * Non-visible entities (isVisibleInScene === false) are excluded.
 * Entities whose agent has no position entry are excluded.
 *
 * @param entities        - TaskAgentMappingEntity[] (typically from getVisibleMappingEntities).
 * @param agentPositions  - Map of agentId → world-space {x, y, z} position.
 * @returns Map of targetTaskId → [worldX, worldY, worldZ] for each visible orb.
 */
export function buildOrbPositionsFromEntities(
  entities: ReadonlyArray<TaskAgentMappingEntity>,
  agentPositions: Readonly<Record<string, { x: number; y: number; z: number }>>,
): Record<string, readonly [number, number, number]> {
  // Pass 1: count visible tasks per agent (for ring-spread determination)
  const agentTaskCount: Record<string, number> = {};
  for (const entity of entities) {
    if (!entity.isVisibleInScene) continue;
    const agentPos = agentPositions[entity.sourceAgentId];
    if (!agentPos) continue;
    agentTaskCount[entity.sourceAgentId] = (agentTaskCount[entity.sourceAgentId] ?? 0) + 1;
  }

  // Pass 2: assign ring-spread position to each visible task
  const positionMap: Record<string, readonly [number, number, number]> = {};
  const indexTracker: Record<string, number> = {};

  for (const entity of entities) {
    if (!entity.isVisibleInScene) continue;
    const agentPos = agentPositions[entity.sourceAgentId];
    if (!agentPos) continue;

    const total = agentTaskCount[entity.sourceAgentId] ?? 1;
    if (indexTracker[entity.sourceAgentId] === undefined) {
      indexTracker[entity.sourceAgentId] = 0;
    }
    const i = indexTracker[entity.sourceAgentId]++;

    // Single task → centred above agent (r=0); multiple → ring spread
    const angle = total > 1 ? (i / total) * Math.PI * 2 : 0;
    const r     = total > 1 ? ORB_SPREAD_RADIUS : 0;

    positionMap[entity.targetTaskId] = [
      agentPos.x + Math.cos(angle) * r,
      agentPos.y + ORB_FLOAT_Y,
      agentPos.z + Math.sin(angle) * r,
    ];
  }

  return positionMap;
}

/**
 * Sub-AC 5.2: Build connector line descriptors from TaskAgentMappingEntity objects.
 *
 * Canonical bridge between the task_agent_mapping ontology entity layer
 * (task-agent-mapping.ts) and the 3D connector renderer (BatchedConnectorLines).
 *
 * Reads entity.statusBeamColor directly — no secondary color-table join required.
 * Reads entity.isVisibleInScene — non-visible entities are excluded.
 * The connector arc runs from the task orb position (from) to the agent head (to).
 *
 * @param entities        - TaskAgentMappingEntity[] (visible subset recommended).
 * @param agentPositions  - Map of agentId → world-space {x, y, z} position.
 * @param orbPositions    - Pre-computed map of taskId → [x, y, z] orb positions
 *                          (from buildOrbPositionsFromEntities or TaskConnectorsLayer).
 * @returns ConnectorLineDescriptor[] ready for BatchedConnectorLines.
 */
export function buildConnectorDescriptorsFromEntities(
  entities: ReadonlyArray<TaskAgentMappingEntity>,
  agentPositions: Readonly<Record<string, { x: number; y: number; z: number }>>,
  orbPositions: Readonly<Record<string, readonly [number, number, number]>>,
): ConnectorLineDescriptor[] {
  const descriptors: ConnectorLineDescriptor[] = [];
  for (const entity of entities) {
    if (!entity.isVisibleInScene) continue;
    const agentPos = agentPositions[entity.sourceAgentId];
    if (!agentPos) continue;
    const orbPos = orbPositions[entity.targetTaskId];
    if (!orbPos) continue;

    // Connector arc runs from the task orb down to the agent's head centre.
    const headY = agentPos.y + AGENT_HEAD_Y_OFFSET;
    descriptors.push({
      key:   entity.targetTaskId,
      fromX: orbPos[0], fromY: orbPos[1], fromZ: orbPos[2],
      toX:   agentPos.x,
      toY:   headY,
      toZ:   agentPos.z,
      // statusBeamColor pre-computed by the entity layer — no join required
      status: entity.status,
    });
  }
  return descriptors;
}

/**
 * Sub-AC 5.2: Build badge descriptors from TaskAgentMappingEntity objects.
 *
 * Badge descriptors are consumed by the orb's diegetic HTML label and by
 * TaskMappingHUD cards to render task identity in the 2D overlay.
 *
 * All visual fields are derived from entity pre-computed fields:
 *   entity.priorityColor   → badge priority square color
 *   entity.statusBeamColor → badge status dot and border-left color
 *   entity.priority        → badge single-char priority label
 *   entity.status          → badge 4-char status abbreviation
 *   entity.assignedTs      → elapsed-time display
 *
 * Only entities with isVisibleInScene === true produce badge descriptors.
 * Non-visible entities are excluded (no orb → no badge).
 *
 * @param entities - TaskAgentMappingEntity[] from the data layer.
 * @returns ConnectorBadgeDescriptor[] in the same order as input entities.
 */
export function buildBadgeDescriptorsFromEntities(
  entities: ReadonlyArray<TaskAgentMappingEntity>,
): ConnectorBadgeDescriptor[] {
  const badges: ConnectorBadgeDescriptor[] = [];
  for (const entity of entities) {
    if (!entity.isVisibleInScene) continue;
    badges.push({
      taskId:          entity.targetTaskId,
      agentId:         entity.sourceAgentId,
      priorityColor:   entity.priorityColor,
      priorityLabel:   CONNECTOR_BADGE_PRIORITY_LABEL[entity.priority] ?? "?",
      statusBeamColor: entity.statusBeamColor,
      statusLabel:     CONNECTOR_BADGE_STATUS_LABEL[entity.status] ??
                         entity.status.slice(0, 4).toUpperCase(),
      assignedTs:      entity.assignedTs,
    });
  }
  return badges;
}

// ── TaskNodeOrb ───────────────────────────────────────────────────────────────

interface TaskNodeOrbProps {
  task: TaskRecord;
  position: readonly [number, number, number];
  /**
   * Sub-AC 15c: when false the PointLight is omitted for this orb.
   * TaskConnectorsLayer allocates lights only to the top MAX_POINT_LIGHTS tasks.
   */
  hasLight?: boolean;
  /**
   * Sub-AC 15c: when false the HTML title badge is hidden.
   * Typically set to false at 'low' quality to remove DOM overhead.
   */
  showBadge?: boolean;
  /**
   * Sub-AC 5b: World-space scale multiplier applied to the orb mesh and its
   * decorations (glow ring, corona).  Values > 1.0 enlarge the orb so it
   * maintains a roughly constant screen-space footprint when the camera is
   * far away or the orthographic zoom is high.
   *
   * Computed by useConnectorLODConfig() → ConnectorLODConfig.orbScale.
   * Defaults to 1.0 (no scaling) when absent.
   */
  lodScale?: number;
}

/**
 * Floating low-poly diamond representing a task in 3D world-space.
 *
 * Sub-AC 5.3 enhancements:
 *   - depthTest: false on all materials → visible through walls/floors
 *   - renderOrder={RENDER_ORDER_ORB} → drawn above all scene geometry
 *   - pointLight at orb origin → physically illuminates nearby room geometry
 *   - Corona ring for critical + high priority → extra outer ring amplifies
 *     visual weight and catches the eye across the scene
 *   - Extended animation ranges → more dramatic pulsing for active/critical
 *
 * Geometry: octahedron (0 subdivisions) for stylized low-poly fidelity.
 * Glow ring: horizontal hexagonal ring at orb equator.
 * Corona: outer ring for critical/high-priority tasks.
 * Badge: HTML label showing truncated task title + status dot.
 *
 * Animations (all in useFrame — zero React state updates per frame):
 *   - Slow dual-axis rotation (all statuses)
 *   - Pulsing scale + emissive for "active" (0.82–1.18 range; was 0.90–1.10)
 *   - Extra bright emissive ceiling for "critical" priority
 *   - Nervous flicker for "blocked" (0.68–1.24 range; was 0.85–1.00)
 *   - Point light intensity pulses in sync with orb scale
 */
function TaskNodeOrb({
  task,
  position,
  hasLight = true,
  showBadge = true,
  lodScale = 1.0,
}: TaskNodeOrbProps) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const matRef   = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const priorityColor  = PRIORITY_COLOR[task.priority];
  const beamColor      = STATUS_BEAM_COLOR[task.status];
  const isActive       = task.status === "active";
  const isBlocked      = task.status === "blocked";
  const isCritical     = task.priority === "critical";
  const isHighPriority = task.priority === "critical" || task.priority === "high";

  /** Base light intensity derived from task priority */
  const baseLightIntensity = PRIORITY_LIGHT_INTENSITY[task.priority];

  useFrame(({ clock }) => {
    if (!meshRef.current || !matRef.current) return;
    const t = clock.getElapsedTime();

    // Slow dual-axis spin — visible from any camera angle
    meshRef.current.rotation.y = t * 0.72;
    meshRef.current.rotation.x = t * 0.28;

    if (isActive) {
      // Sub-AC 5.3: Extended scale range (0.82–1.18) for dominant motion signal
      const pulse = 0.82 + Math.sin(t * 3.2) * 0.18;
      meshRef.current.scale.setScalar(pulse);
      // Sub-AC 5.3: Stronger emissive ceiling (critical: 0.75–1.10; normal: 0.55–0.85)
      matRef.current.emissiveIntensity = isCritical
        ? 0.75 + Math.sin(t * 3.2) * 0.35
        : 0.55 + Math.sin(t * 3.2) * 0.30;
      // Point light pulses in sync with orb
      if (lightRef.current) {
        lightRef.current.intensity =
          baseLightIntensity * (0.65 + Math.sin(t * 3.2) * 0.35);
      }
    } else if (isBlocked) {
      // Sub-AC 5.3: More aggressive flicker (0.68–1.24) — visible distress signal
      const flicker = 0.68 + Math.abs(Math.sin(t * 5.5)) * 0.28;
      meshRef.current.scale.setScalar(flicker);
      matRef.current.emissiveIntensity =
        0.25 + Math.abs(Math.sin(t * 5.5)) * 0.45;
      if (lightRef.current) {
        lightRef.current.intensity =
          baseLightIntensity * (0.25 + Math.abs(Math.sin(t * 5.5)) * 0.75);
      }
    } else {
      // Assigned/review: steady state, no scale animation
      meshRef.current.scale.setScalar(1.0);
      if (lightRef.current) {
        lightRef.current.intensity = baseLightIntensity * 0.45;
      }
    }
  });

  return (
    <group
      position={[position[0], position[1], position[2]]}
      name={`task-orb-${task.taskId}`}
      // Sub-AC 5b: Apply LOD world-space scale to maintain screen-space footprint.
      // The scale is applied on the group so all child geometry (orb, rings, corona)
      // scales uniformly.  PointLight distance is NOT scaled — it always illuminates
      // the surrounding geometry at its world-space distance, which is fine because
      // the illumination radius of a distant task should reach MORE geometry, not less.
      scale={lodScale !== 1.0 ? [lodScale, lodScale, lodScale] : undefined}
    >
      {/*
       * Sub-AC 5.3 / Sub-AC 15c: Physical point light — illuminates surrounding
       * room geometry so the task location is visible from a distance.
       * Intensity and distance are priority-scaled; critical tasks cast a strong
       * red glow over nearby walls and floors.
       *
       * Sub-AC 15c: Only rendered when hasLight=true (allocated by the PointLight
       * budget in TaskConnectorsLayer; max MAX_POINT_LIGHTS active at once).
       */}
      {hasLight && (
        <pointLight
          ref={lightRef}
          color={priorityColor}
          intensity={isActive ? baseLightIntensity : baseLightIntensity * 0.45}
          distance={3.5}
          decay={2}
        />
      )}

      {/* Low-poly octahedron body */}
      <mesh ref={meshRef} renderOrder={RENDER_ORDER_ORB}>
        <octahedronGeometry args={[ORB_SIZE, 0]} />
        <meshStandardMaterial
          ref={matRef}
          color={priorityColor}
          emissive={priorityColor}
          emissiveIntensity={isActive ? 0.65 : isCritical ? 0.55 : 0.40}
          roughness={0.30}
          metalness={0.60}
          flatShading
          transparent
          opacity={0.92}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Hexagonal glow ring at the orb equator */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={RENDER_ORDER_ORB}>
        <ringGeometry args={[ORB_SIZE * 1.1, ORB_SIZE * 1.9, 6]} />
        <meshBasicMaterial
          color={priorityColor}
          transparent
          opacity={isActive ? 0.35 : 0.18}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/*
       * Sub-AC 5.3: Corona ring — critical + high priority tasks only.
       * Outer ring amplifies the visual weight of high-stakes tasks so they
       * stand out from lower-priority assignments at a glance.
       * Uses AdditiveBlending for luminous glow in the dark scene.
       */}
      {isHighPriority && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={RENDER_ORDER_ORB - 1}
        >
          <ringGeometry args={[ORB_SIZE * 2.8, ORB_SIZE * 4.4, 6]} />
          <meshBasicMaterial
            color={priorityColor}
            transparent
            opacity={isCritical ? 0.28 : 0.15}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {/* Diegetic task title badge — small HTML label (hidden at 'low' quality) */}
      {showBadge && <Html
        center
        distanceFactor={14}
        position={[0, ORB_SIZE + 0.13, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            background: "rgba(8, 8, 18, 0.90)",
            border: `1px solid ${priorityColor}${isCritical ? "99" : "50"}`,
            borderRadius: 2,
            padding: "1px 4px",
            display: "flex",
            alignItems: "center",
            gap: 3,
            backdropFilter: "blur(3px)",
            boxShadow: isCritical ? `0 0 6px ${priorityColor}60` : undefined,
          }}
        >
          {/* Status colour dot */}
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              backgroundColor: beamColor,
              flexShrink: 0,
              display: "inline-block",
            }}
          />
          {/* Truncated task title */}
          <span
            style={{
              fontSize: "6px",
              color: priorityColor,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
              maxWidth: "60px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {task.title.length > 14
              ? `${task.title.slice(0, 14)}\u2026`
              : task.title}
          </span>
        </div>
      </Html>}
    </group>
  );
}

// ── TaskConnectorBeam ─────────────────────────────────────────────────────────

interface TaskConnectorBeamProps {
  /** Task-orb world position (x, y, z) */
  fromX: number;
  fromY: number;
  fromZ: number;
  /** Agent head world position (x, y, z) */
  toX: number;
  toY: number;
  toZ: number;
  /** Task status — drives beam colour and animation style */
  status: TaskStatus;
  /**
   * Sub-AC 15c: when false, the TubeGeometry glow sheath is skipped.
   * The line arc is rendered by BatchedConnectorLines in TaskConnectorsLayer.
   * This component only renders the tube + scan pulse when showTube=true.
   */
  showTube?: boolean;
}

/**
 * Curved arc beam connecting a task-orb position to an agent's head.
 *
 * Sub-AC 5.3 enhancements:
 *   - depthTest: false + depthWrite: false on all materials → visible through geometry
 *   - AdditiveBlending on tube sheath → luminous glow in dark command-center scene
 *   - renderOrder 997 → drawn after all scene geometry
 *   - Scan pulse sprite on active beams:
 *     a bright white sphere travels from orb to agent head in ~1.8 s cycles
 *     with sinusoidal fade at both ends; renderOrder 999 (topmost)
 *   - Stronger animation ranges: active beam opacity 0.35–0.95 (was 0.50–0.82)
 *   - Blocked beam: more aggressive flicker for distress signal
 *
 * Geometry:
 *   THREE.Line  — BufferGeometry sampled from a QuadraticBezierCurve3 (primary)
 *   THREE.Mesh  — TubeGeometry (4 radial segments) for volumetric glow sheath
 *   THREE.Mesh  — Scan pulse sphere (active status only; positioned in useFrame)
 *
 * Implementation note:
 *   We use <primitive object={...}> rather than the <line> JSX element to avoid
 *   a TypeScript namespace collision between SVG's <line> element and the R3F
 *   Three.js "line" intrinsic element.
 *
 * Disposal: BufferGeometry and TubeGeometry are explicitly disposed when
 * the component unmounts or when the curve changes (via useEffect cleanup).
 * Materials are stable for the component lifetime and disposed on unmount.
 */
function TaskConnectorBeam({
  fromX, fromY, fromZ,
  toX,   toY,   toZ,
  status,
  showTube = true,
}: TaskConnectorBeamProps) {
  const beamColor = STATUS_BEAM_COLOR[status];

  // ── Stable Three.js materials (one per component instance) ─────────────
  // Sub-AC 5.3: depthTest: false + depthWrite: false ensure connectors render
  // above all scene geometry regardless of spatial depth (through walls/floors).
  // Sub-AC 15c: lineMat is kept but the primitive is only rendered when showTube
  //   is false — so we don't create the expensive TubeGeometry.
  //   When showTube=true (high quality), both line + tube are rendered.
  //   When showTube=false (medium/low quality), BatchedConnectorLines handles
  //   the line rendering; this component only adds the scan pulse.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({
    color: STATUS_BEAM_COLOR[status],
    transparent: true,
    opacity: status === "assigned" ? 0.55 : 0.45,
    depthTest: false,
    depthWrite: false,
  }), []);  // intentionally stable — synced via useEffect below

  // Sub-AC 5.3: AdditiveBlending on tube sheath adds colour to framebuffer
  // instead of alpha-blending, creating a luminous glow in the dark scene.
  // Sub-AC 15c: only created / rendered when showTube=true.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tubeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: STATUS_BEAM_COLOR[status],
    transparent: true,
    opacity: status === "active" ? 0.28 : 0.12,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);  // intentionally stable — synced via useEffect below

  // ── Stable Three.js objects — geometry is swapped imperatively ─────────
  // Sub-AC 5.3: renderOrder 997 ensures drawn after all scene geometry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lineObject = useMemo(() => {
    const obj = new THREE.Line(undefined, lineMat);
    obj.renderOrder = RENDER_ORDER_BEAM;
    return obj;
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tubeObject = useMemo(() => {
    const obj = new THREE.Mesh(undefined, tubeMat);
    obj.renderOrder = RENDER_ORDER_BEAM;
    return obj;
  }, []);

  // Dispose materials when the component unmounts
  useEffect(() => {
    return () => {
      lineMat.dispose();
      tubeMat.dispose();
    };
  }, [lineMat, tubeMat]);

  // ── Reactive curve — recomputed whenever positions change ──────────────
  const curve = useMemo(() => {
    const from = new THREE.Vector3(fromX, fromY, fromZ);
    const to   = new THREE.Vector3(toX, toY, toZ);
    const mid  = new THREE.Vector3(
      (fromX + toX) * 0.5,
      Math.max(fromY, toY) + ARC_LIFT,
      (fromZ + toZ) * 0.5,
    );
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  }, [fromX, fromY, fromZ, toX, toY, toZ]);

  /**
   * Sub-AC 5.3: curveRef exposes the current curve to useFrame without
   * creating a closure over the useMemo value.  Set synchronously during
   * render so it is always current before the next useFrame tick.
   */
  const curveRef = useRef<THREE.QuadraticBezierCurve3 | null>(null);
  curveRef.current = curve;

  // ── Sub-AC 15c: Conditional geometry creation ────────────────────────────
  // Line and tube geometries are only created when showTube=true.
  // When showTube=false, BatchedConnectorLines (in TaskConnectorsLayer) renders
  // the arc line, and this component only contributes the scan pulse.
  // Skipping TubeGeometry creation avoids ~7000 vertices per 100 tasks.

  const lineGeo = useMemo(() => {
    if (!showTube) return null;
    return new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
  }, [curve, showTube]);

  const tubeGeo = useMemo(() => {
    if (!showTube) return null;
    return new THREE.TubeGeometry(curve, 16, 0.013, 4, false);
  }, [curve, showTube]);

  // Dispose geometries when they change or the component unmounts
  useEffect(() => {
    return () => {
      lineGeo?.dispose();
      tubeGeo?.dispose();
    };
  }, [lineGeo, tubeGeo]);

  // Swap geometry on the stable Three.js objects when geometry changes
  useEffect(() => {
    if (lineGeo) lineObject.geometry = lineGeo;
  }, [lineObject, lineGeo]);

  useEffect(() => {
    if (tubeGeo) tubeObject.geometry = tubeGeo;
  }, [tubeObject, tubeGeo]);

  // Sync colour and tube opacity when status changes (rare but handled)
  useEffect(() => {
    lineMat.color.setStyle(STATUS_BEAM_COLOR[status]);
    tubeMat.color.setStyle(STATUS_BEAM_COLOR[status]);
    tubeMat.opacity = status === "active" ? 0.28 : 0.12;
  }, [lineMat, tubeMat, status]);

  // Sub-AC 5.3: scan pulse ref — positioned along curve in useFrame
  const scanRef = useRef<THREE.Mesh>(null);

  // Per-frame opacity animation + scan pulse — directly mutates Three.js objects
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Sub-AC 15c: Only animate the line material when it is actually rendered
    if (showTube) {
      switch (status) {
        case "active":
          // Sub-AC 5.3: Stronger opacity range (0.35–0.95) for dominant visual signal
          lineMat.opacity = 0.35 + Math.sin(t * 2.8) * 0.42;
          break;
        case "blocked":
          // Sub-AC 5.3: More aggressive flicker — clear distress signal
          lineMat.opacity = 0.12 + Math.abs(Math.sin(t * 4.8)) * 0.58;
          break;
        case "review":
          lineMat.opacity = 0.38 + Math.sin(t * 1.5) * 0.22;
          break;
        default:
          // assigned / other — steady; no per-frame update needed
          break;
      }
    }

    // Sub-AC 5.3: Scan pulse — bright dot traverses arc for active beams.
    // Completes one full traversal (orb → agent head) every ~1.8 s.
    // Opacity fades at both ends (sinusoidal envelope) to avoid hard pop-in.
    // Sub-AC 15c: scan pulse runs regardless of showTube (it's always visible).
    if (status === "active" && scanRef.current && curveRef.current) {
      const tNorm = (t * 0.55) % 1.0;
      const point = curveRef.current.getPoint(tNorm);
      scanRef.current.position.set(point.x, point.y, point.z);
      // Sinusoidal fade: max opacity at midpoint (tNorm=0.5), zero at ends
      const fade = Math.sin(tNorm * Math.PI);
      (scanRef.current.material as THREE.MeshBasicMaterial).opacity = 0.92 * fade;
    }
  });

  return (
    <group name="task-connector-beam">
      {/*
       * Sub-AC 15c: Primary arc line + tube only when showTube=true (high quality).
       * At medium/low quality, BatchedConnectorLines handles the line geometry.
       */}
      {showTube && <primitive object={lineObject} />}
      {showTube && <primitive object={tubeObject} />}

      {/*
       * Sub-AC 5.3: Scan pulse sprite — active beams only.
       *
       * A small bright sphere (4-sided low-poly for fidelity) that travels
       * from the task-orb to the agent head along the bezier arc.  The sphere
       * is positioned in useFrame and uses AdditiveBlending for maximum
       * visibility in the dark command-center scene.  renderOrder=999 ensures
       * it renders on top of every other scene element.
       */}
      {status === "active" && (
        <mesh ref={scanRef} renderOrder={RENDER_ORDER_SCAN}>
          <sphereGeometry args={[0.028, 4, 2]} />
          <meshBasicMaterial
            color={beamColor}
            transparent
            opacity={0.0}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}

// ── AgentTaskConnectionNode ───────────────────────────────────────────────────

interface AgentTaskConnectionNodeProps {
  /** World position of the agent avatar (foot / origin level). */
  position: readonly [number, number, number];
  /** Colour of the highest-priority task assigned to this agent. */
  primaryColor: string;
  /** Total number of active task connections for this agent. */
  taskCount: number;
}

/**
 * Sub-AC 5b: Distinct low-poly geometric indicator rendered on AGENT NODES that
 * have active task-agent mapping connections.
 *
 * This component distinguishes "agents with active task assignments" from
 * idle/inactive agents in the 3D scene, completing the requirement that BOTH
 * tasks AND agents appear as distinct nodes in the task-agent visual layer.
 *
 * Visual design:
 *   - A hexagonal (6-sided) ring at the agent's base (Y = +0.05) coloured by
 *     the highest-priority task assigned to that agent
 *   - An outer corona ring for agents with ≥3 tasks (indicating load)
 *   - Slow counter-clockwise rotation (opposite to task orbs) for contrast
 *   - depthTest: false + renderOrder=RENDER_ORDER_BEAM: always visible through walls
 *   - AdditiveBlending: luminous glow in the dark command-center scene
 *
 * Placement relative to AgentAvatar.tsx indicators (no overlap):
 *   - Foot ring:      Y = 0.00, ring r = [BODY_RADIUS*0.8, BODY_RADIUS] ≈ [0.10, 0.12]
 *   - Selection ring: Y = 0.02, ring r = [0.18, 0.24]
 *   - This ring:      Y = 0.05, ring r = [0.28, 0.36] ← non-overlapping outer band
 *   - Meeting orbit:  Y = 0.40–0.60, fully 3D orbit animation
 *
 * This component is rendered by TaskConnectorsLayer (NOT AgentAvatar.tsx) to
 * keep the task-assignment visual language encapsulated in the connector layer
 * and to avoid touching the complex useFrame loop in AgentAvatar.
 */
function AgentTaskConnectionNode({
  position,
  primaryColor,
  taskCount,
}: AgentTaskConnectionNodeProps) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    // Slow counter-clockwise rotation (opposite direction to task orbs at +0.72 rad/s)
    ringRef.current.rotation.z = -clock.getElapsedTime() * 0.38;
  });

  const hasHeavyLoad = taskCount >= 3;

  return (
    <group
      position={[position[0], position[1] + 0.05, position[2]]}
      name="agent-task-connection-node"
    >
      {/*
       * Primary task-load indicator ring — hexagonal (6 sides), low-poly style.
       * Colour = highest-priority task colour for this agent.
       * renderOrder = RENDER_ORDER_BEAM so it's drawn above scene geometry.
       */}
      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER_BEAM}
      >
        <ringGeometry args={[0.28, 0.36, 6]} />
        <meshBasicMaterial
          color={primaryColor}
          transparent
          opacity={0.42}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/*
       * Outer corona ring — only shown when agent has ≥3 active task connections.
       * Signals high task-load. Slightly larger radius, lower opacity.
       * Does not rotate (static outer halo relative to the spinning inner ring).
       */}
      {hasHeavyLoad && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={RENDER_ORDER_BEAM - 1}
        >
          <ringGeometry args={[0.42, 0.50, 6]} />
          <meshBasicMaterial
            color={primaryColor}
            transparent
            opacity={0.18}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </group>
  );
}

// ── TaskConnectorsLayer ───────────────────────────────────────────────────────

/**
 * Top-level scene group rendering all active task-to-agent visual connections.
 *
 * Mounted inside CommandCenterScene (both hierarchy and legacy rendering paths).
 *
 * Sub-AC 5.3: The group carries renderOrder={RENDER_ORDER_BEAM} as a
 * belt-and-suspenders measure. Individual meshes/primitives also carry their
 * own renderOrder values since Three.js applies them per-object rather than
 * per-group. The combination ensures every connector element is drawn after
 * all room/floor/building geometry.
 *
 * Data flow (read-only, no events emitted):
 *   task-store.assignments   → which tasks are assigned to which agents
 *   task-store.tasks         → task priority + status for visual mapping
 *   agent-store.agents       → worldPosition for each agent avatar
 *
 * Orb spread logic:
 *   When an agent has N active tasks, the N orbs are arranged evenly in
 *   a horizontal ring above the agent (radius = ORB_SPREAD_RADIUS).
 *   A single task is centred directly above the agent.
 *
 * Filtering:
 *   Only tasks in VISIBLE_STATUSES (assigned/active/blocked/review) are shown.
 *   Tasks with unresolvable agent references or zero-position agents are skipped.
 */
export function TaskConnectorsLayer() {
  const assignments = useTaskStore((s) => s.assignments);
  const tasks       = useTaskStore((s) => s.tasks);
  const agents      = useAgentStore((s) => s.agents);

  // Sub-AC 15c: quality level drives PointLight budget + tube geometry toggle
  const quality = usePerformanceQuality();
  // TubeGeometry only at 'high' quality — saves ~500 vertices per beam
  const showTubes = quality === "high";
  // HTML badges on orbs only when not at 'low' quality
  const showOrbBadges = quality !== "low";

  // Sub-AC 5b: LOD configuration — adapts orb scale + arc geometry to camera zoom.
  // Returns a stable config object; only changes when the LOD tier changes.
  const lodConfig = useConnectorLODConfig();

  // Sub-AC 15.2: view_window culling.
  // Subscribe to the full snapshot so we can check entities.length (bootstrap
  // sentinel) AND visibleIds (render gate) from a single stable reference.
  // Snapshot reference changes only when the visible set changes — not every
  // frame — so this is safe to use as a useMemo dependency.
  //
  // vwHasSnapshot uses entities.length (not visibleIds.length) as the sentinel:
  //   - Before first frame: entities=[] → vwHasSnapshot=false → no filtering
  //   - After first frame with all agents culled: entities=[N], visibleIds=[]
  //     → vwHasSnapshot=true → all connections are filtered out (correct)
  const vwSnapshot = useViewWindowStore((s) => s.snapshot);
  const vwVisibleSet = useMemo(
    () => new Set<string>(vwSnapshot.visibleIds),
    [vwSnapshot],
  );
  const vwHasSnapshot = vwSnapshot.entities.length > 0;

  // ── Build list of renderable connections ─────────────────────────────────

  const connections = useMemo(() => {
    return Object.values(assignments).filter((a) => {
      const task  = tasks[a.taskId];
      const agent = agents[a.agentId];
      if (!task || !agent) return false;
      if (!VISIBLE_STATUSES.has(task.status)) return false;
      // Skip unplaced agents (worldPosition at origin means not yet positioned)
      const wp = agent.worldPosition;
      if (Math.abs(wp.x) + Math.abs(wp.y) + Math.abs(wp.z) <= 0.01) return false;
      // Sub-AC 15.2: skip connectors whose assigned agent is culled by the
      // view window.  When the view window has no snapshot yet (bootstrap),
      // render all connections (vwHasSnapshot guard prevents over-culling).
      if (vwHasSnapshot && !vwVisibleSet.has(a.agentId)) return false;
      return true;
    }).map((a) => ({
      assignment: a,
      task:  tasks[a.taskId],
      agent: agents[a.agentId],
    }));
  }, [assignments, tasks, agents, vwVisibleSet, vwHasSnapshot]);

  // ── Compute orb positions (ring spread per agent) ─────────────────────────

  const orbPositions = useMemo((): Record<string, readonly [number, number, number]> => {
    // Pass 1: group taskIds by agent
    const agentTaskLists: Record<string, string[]> = {};
    for (const conn of connections) {
      const id = conn.agent.def.agentId;
      if (!agentTaskLists[id]) agentTaskLists[id] = [];
      agentTaskLists[id].push(conn.task.taskId);
    }

    // Pass 2: assign ring position to each task
    const positionMap: Record<string, readonly [number, number, number]> = {};
    const indexTracker: Record<string, number> = {};

    for (const conn of connections) {
      const { agent, task } = conn;
      const agentId   = agent.def.agentId;
      const taskList  = agentTaskLists[agentId];
      const total     = taskList.length;

      if (indexTracker[agentId] === undefined) indexTracker[agentId] = 0;
      const i = indexTracker[agentId]++;

      // Single task → centred above agent; multiple → ring spread
      const angle = total > 1 ? (i / total) * Math.PI * 2 : 0;
      const r     = total > 1 ? ORB_SPREAD_RADIUS : 0;

      const ax = agent.worldPosition.x;
      const ay = agent.worldPosition.y;
      const az = agent.worldPosition.z;

      positionMap[task.taskId] = [
        ax + Math.cos(angle) * r,
        ay + ORB_FLOAT_Y,
        az + Math.sin(angle) * r,
      ];
    }

    return positionMap;
  }, [connections]);

  // ── Sub-AC 15c: PointLight budget ─────────────────────────────────────────
  //
  // Allocate PointLights to the highest-priority tasks only.
  // With 100+ tasks each having a PointLight, shading cost is O(tasks × geometry).
  // By capping at MAX_POINT_LIGHTS we keep shading at O(4 × geometry) regardless
  // of task count.
  //
  // Sort connections by priority rank (desc) and take the first MAX_POINT_LIGHTS.
  // Remaining tasks rely on emissive material for visual presence.

  const lightTaskIds = useMemo((): Set<string> => {
    if (connections.length === 0) return new Set();

    // Sort by priority rank descending, then prefer active tasks
    const sorted = [...connections].sort((a, b) => {
      const rankDiff = PRIORITY_RANK[b.task.priority] - PRIORITY_RANK[a.task.priority];
      if (rankDiff !== 0) return rankDiff;
      // Tiebreak: active > blocked > review > assigned
      const statusScore = (s: string) =>
        s === "active" ? 3 : s === "blocked" ? 2 : s === "review" ? 1 : 0;
      return statusScore(b.task.status) - statusScore(a.task.status);
    });

    const ids = new Set<string>();
    for (let i = 0; i < Math.min(sorted.length, MAX_POINT_LIGHTS); i++) {
      ids.add(sorted[i].task.taskId);
    }
    return ids;
  }, [connections]);

  // ── Sub-AC 15c: BatchedConnectorLines descriptor list ─────────────────────
  //
  // Build the minimal descriptor array for the single-draw-call line renderer.
  // This replaces all individual THREE.Line geometry objects at once.

  const batchedLineDescriptors = useMemo((): ConnectorLineDescriptor[] => {
    return connections.reduce<ConnectorLineDescriptor[]>((acc, { task, agent }) => {
      const orbPos = orbPositions[task.taskId];
      if (!orbPos) return acc;

      const headY = agent.worldPosition.y + AGENT_HEAD_Y_OFFSET;

      acc.push({
        key:   task.taskId,
        fromX: orbPos[0], fromY: orbPos[1], fromZ: orbPos[2],
        toX:   agent.worldPosition.x,
        toY:   headY,
        toZ:   agent.worldPosition.z,
        status: task.status,
      });
      return acc;
    }, []);
  }, [connections, orbPositions]);

  // ── Sub-AC 5b: Per-agent task connection node data ────────────────────────
  //
  // For each unique agent that has active task connections, compute:
  //   - The agent's world position (for placing the indicator ring)
  //   - The highest-priority task colour (drives ring colour)
  //   - The total task count (drives corona ring visibility for ≥3 tasks)
  //
  // This drives AgentTaskConnectionNode, which renders a distinct low-poly
  // geometric indicator AT THE AGENT NODE to complete the "tasks AND agents
  // as distinct nodes" requirement of Sub-AC 5b.

  const agentNodeData = useMemo((): Array<{
    agentId: string;
    position: readonly [number, number, number];
    primaryColor: string;
    taskCount: number;
  }> => {
    const agentMap = new Map<string, {
      pos: readonly [number, number, number];
      maxRank: number;
      color: string;
      count: number;
    }>();

    for (const conn of connections) {
      const { agent, task } = conn;
      const agentId = agent.def.agentId;
      const rank    = PRIORITY_RANK[task.priority];
      const existing = agentMap.get(agentId);

      if (!existing) {
        agentMap.set(agentId, {
          pos:     [agent.worldPosition.x, agent.worldPosition.y, agent.worldPosition.z],
          maxRank: rank,
          color:   PRIORITY_COLOR[task.priority],
          count:   1,
        });
      } else {
        // Upgrade colour to highest-priority task for this agent
        if (rank > existing.maxRank) {
          existing.maxRank = rank;
          existing.color   = PRIORITY_COLOR[task.priority];
        }
        existing.count++;
      }
    }

    return Array.from(agentMap.entries()).map(([agentId, data]) => ({
      agentId,
      position:     data.pos,
      primaryColor: data.color,
      taskCount:    data.count,
    }));
  }, [connections]);

  if (connections.length === 0) return null;

  return (
    <group name="task-connectors-layer" renderOrder={RENDER_ORDER_BEAM}>
      {/*
       * Sub-AC 15c: BatchedConnectorLines — replaces N individual THREE.Line
       * objects with a single THREE.LineSegments draw call.
       * At scale (100+ tasks) this collapses N line draw calls to exactly 1.
       *
       * Sub-AC 5b: LOD overrides passed to adapt geometry quality to camera zoom:
       *   lodCurveSegments — fewer at far/overhead (5–12 range)
       *   lodArcLift       — slightly taller arcs at far perspective for visibility
       *   lodOpacityFloor  — boosted at far zoom so 1 px lines remain readable
       *
       * When showTubes=true (high quality), the individual TaskConnectorBeam
       * components below also render TubeGeometry and animated per-beam lines
       * on top of the batch. At medium/low quality only the batch is visible.
       */}
      <BatchedConnectorLines
        connections={batchedLineDescriptors}
        renderOrder={RENDER_ORDER_BEAM}
        lodCurveSegments={lodConfig.curveSegments}
        lodArcLift={lodConfig.arcLift}
        lodOpacityFloor={lodConfig.lineOpacityFloor}
      />

      {/*
       * Sub-AC 5b: Agent-side task connection node indicators.
       *
       * One AgentTaskConnectionNode per unique agent that has active task
       * connections. Renders a hexagonal glow ring at the agent's base to
       * visually distinguish "agents engaged in tasks" from idle agents.
       *
       * This completes the requirement that BOTH task nodes (TaskNodeOrb above)
       * AND agent nodes appear as distinct low-poly visual entities in the
       * task-agent mapping layer.
       */}
      {agentNodeData.map(({ agentId, position, primaryColor, taskCount }) => (
        <AgentTaskConnectionNode
          key={`agent-task-node-${agentId}`}
          position={position}
          primaryColor={primaryColor}
          taskCount={taskCount}
        />
      ))}

      {connections.map(({ task, agent }) => {
        const orbPos = orbPositions[task.taskId];
        if (!orbPos) return null;

        // Connector terminates at the agent's head centre
        const headY = agent.worldPosition.y + AGENT_HEAD_Y_OFFSET;
        const hasLight = lightTaskIds.has(task.taskId);

        return (
          <group
            key={task.taskId}
            name={`task-connection-${task.taskId}`}
          >
            {/*
             * Floating task orb (Sub-AC 5b: distinct low-poly task node).
             * Sub-AC 15c: hasLight gates the PointLight (max MAX_POINT_LIGHTS total).
             * Sub-AC 15c: showBadge hides HTML at 'low' quality.
             * Sub-AC 5b: lodScale enlarges the orb mesh at far zoom so it remains
             *   visible without shrinking to sub-pixel size.
             */}
            <TaskNodeOrb
              task={task}
              position={orbPos}
              hasLight={hasLight}
              showBadge={showOrbBadges}
              lodScale={lodConfig.orbScale}
            />

            {/*
             * Arc beam — visible assignment edge/link (Sub-AC 5b).
             * Sub-AC 15c: showTube=false at medium/low quality; BatchedConnectorLines
             * above handles line rendering. This component only adds the scan pulse
             * (active beams) and the TubeGeometry glow (high quality only).
             */}
            <TaskConnectorBeam
              fromX={orbPos[0]}
              fromY={orbPos[1]}
              fromZ={orbPos[2]}
              toX={agent.worldPosition.x}
              toY={headY}
              toZ={agent.worldPosition.z}
              status={task.status}
              showTube={showTubes}
            />
          </group>
        );
      })}
    </group>
  );
}

// ── Sub-AC 5b: Public interface for AgentTaskConnectionNode ───────────────────
// Export the props type so consumers can reference the contract.
export type { AgentTaskConnectionNodeProps };
