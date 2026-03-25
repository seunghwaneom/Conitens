/**
 * spatial-index.ts — Spatial index entity for scene-graph agent culling and LOD.
 *
 * Sub-AC 1 (AC 15): Implements windowed/virtualized access to the agent
 * population so only agents visible to the camera are fully rendered at any
 * given time.  Supports the 3–20 agent scale of the Conitens command center.
 *
 * ── Ontology level ──────────────────────────────────────────────────────────
 *   This entity sits at the INFRASTRUCTURE layer: it does not represent a
 *   real-world concept (domain) nor observe the system's evolution (meta).
 *   It governs HOW agent geometry is allocated to the GPU each frame.
 *
 * ── Behavioral contract ─────────────────────────────────────────────────────
 *   See SpatialIndexBehavioralContract below.
 *   Rule: every entity type must declare what it can DO, not just what it IS.
 *
 * ── Design ──────────────────────────────────────────────────────────────────
 *   Frustum culling:
 *     Simplified sphere test — camera position as sphere centre, cullingRadius
 *     as radius.  Sufficient for the building scale (< 30 world units wide) and
 *     avoids the overhead of true frustum-plane computation for n ≤ 20 agents.
 *
 *   LOD assignment:
 *     Delegates to THRESHOLDS.agent from lod-drill-policy.ts so all LOD
 *     thresholds remain at a single source of truth.
 *
 *   Window / virtualization:
 *     Agents are sorted by render priority (distance + status weight) and the
 *     top-N (windowSize, default MAX_RENDER_WINDOW) receive full rendering.
 *     The remainder fall back to LOD "far" (dot-only silhouette) or are culled.
 *     MIN_WINDOW_SIZE guarantees the scene is never empty regardless of camera
 *     distance.
 *
 *   Event sourcing:
 *     Each computeSpatialIndex call produces an immutable SpatialIndexSnapshot
 *     stamped with a `ts` value.  The spatial-index-store records these
 *     snapshots in an append-only log for replay analysis.
 *
 * ── Complexity ──────────────────────────────────────────────────────────────
 *   O(n log n) per call for n ≤ 20 — negligible per-frame cost.
 *
 * ── Purity ──────────────────────────────────────────────────────────────────
 *   All functions are pure (no React, no Three.js, no store dependencies).
 *   They can be unit-tested without a browser or WebGL context.
 */

import {
  computeDistanceLOD,
  THRESHOLDS,
  type LODLevel,
} from "./lod-drill-policy.js";

// ── Behavioral Contract ───────────────────────────────────────────────────────

/**
 * SpatialIndexBehavioralContract — Declares what this entity CAN DO.
 *
 * Satisfies the ontology constraint that every entity type must declare its
 * behavioral_contract (what it can DO, not just what it IS) to prevent
 * noun-verb asymmetry.
 *
 * The verbs here correspond directly to the exported pure functions below.
 */
export interface SpatialIndexBehavioralContract {
  /**
   * "index.update" — Accept new agent positions and compute a fresh spatial
   * index snapshot.  Called each render frame (or when agent positions change).
   * O(n log n) for n ≤ 20; returns immutable SpatialIndexSnapshot.
   */
  "index.update": (
    entries: AgentSpatialEntry[],
    cameraPos: Vec3,
    windowSize?: number,
    cullingRadius?: number,
  ) => SpatialIndexSnapshot;

  /**
   * "index.query_window" — Extract the windowed agent set from an existing
   * snapshot.  Returns full-render IDs, deferred IDs, culled IDs, and the
   * per-agent LOD map.  Safe to call outside the Three.js render loop.
   */
  "index.query_window": (snapshot: SpatialIndexSnapshot) => WindowedAgentSet;

  /**
   * "index.compute_lod" — Compute the LOD level for a single agent by
   * camera distance.  Delegates to THRESHOLDS.agent so all LOD thresholds
   * remain at a single source of truth (lod-drill-policy.ts).
   */
  "index.compute_lod": (distance: number) => LODLevel;

  /**
   * "index.cull_frustum" — Remove agents outside the culling sphere.
   * Uses a simplified sphere test centred on cameraPos with the given radius.
   * Returns only the agents that pass the frustum test.
   */
  "index.cull_frustum": (
    entries: AgentSpatialEntry[],
    cameraPos: Vec3,
    cullingRadius: number,
  ) => AgentSpatialEntry[];

  /**
   * "index.reset" — Produce an empty snapshot (zero agents).  Called when
   * the building reloads or all agents despawn.  After reset, subsequent
   * queries return empty results.
   */
  "index.reset": () => SpatialIndexSnapshot;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum agents in the full-render window (window size).
 *
 * Agents ranked beyond this count fall back to LOD "far" or are culled.
 * Tuned for the 3–20 agent population of the Conitens command center.
 * Consumers may override via the windowSize parameter of computeSpatialIndex.
 */
export const MAX_RENDER_WINDOW = 12;

/**
 * Default culling radius in world units.
 *
 * Agents whose camera distance exceeds this value are culled entirely —
 * not even a dot marker is rendered.  Chosen to include the entire building
 * (< 20 world units) with a generous margin for orbiting cameras.
 */
export const DEFAULT_CULLING_RADIUS = 60;

/**
 * Minimum fully-rendered agents regardless of camera distance.
 *
 * Prevents an empty scene when all agents are far away.  The closest
 * MIN_WINDOW_SIZE agents always receive full rendering.
 */
export const MIN_WINDOW_SIZE = 3;

// ── Lightweight 3D vector ─────────────────────────────────────────────────────

/**
 * Vec3 — Lightweight 3D vector.
 *
 * Keeps this module free of Three.js imports so it can be used in tests
 * and non-WebGL contexts (e.g., command-file ingestion, replay analysis).
 *
 * NOTE: This is the spatial-index module's internal Vec3.  It is intentionally
 * separate from the layout.ts Vec3 and room-config-schema RoomVec3 to avoid
 * cross-level coupling.  Consumers using Three.js should destructure x/y/z.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ── Input type ────────────────────────────────────────────────────────────────

/**
 * AgentSpatialEntry — One agent's position and identity submitted to the
 * spatial index.
 *
 * Assembled by use-spatial-index.ts each frame from the agent store's
 * AgentRuntimeState (worldPosition, status, roomId).
 */
export interface AgentSpatialEntry {
  /** Unique agent identifier (matches AgentDef.id) */
  agentId: string;
  /** Current world-space position (from AgentRuntimeState.worldPosition) */
  position: Vec3;
  /** Room the agent currently occupies */
  roomId: string;
  /**
   * Current agent status.
   * Used as a priority hint: active > busy > idle > inactive > terminated.
   * Agents with higher-priority statuses are preferred when window slots
   * are limited.
   */
  status: string;
}

// ── Output types ──────────────────────────────────────────────────────────────

/**
 * AgentCullResult — Per-agent culling and LOD result within a snapshot.
 */
export interface AgentCullResult {
  /** Agent identifier */
  agentId: string;
  /** World position at snapshot time */
  position: Vec3;
  /** Camera-to-agent Euclidean distance (world units) */
  distance: number;
  /**
   * LOD level to apply this frame.
   *   "near"  — full avatar (all geometry, badges, status ring, task count)
   *   "mid"   — body silhouette + status dot
   *   "far"   — single role-coloured dot (or culled if inWindow=false)
   */
  lod: LODLevel;
  /**
   * Whether this agent falls within the render window.
   *   true  → allocate full geometry for this agent
   *   false → use "far" LOD dot only (or skip if culled)
   */
  inWindow: boolean;
  /**
   * Culled entirely (beyond culling radius).
   * When true, skip ALL rendering for this agent (not even a dot).
   */
  culled: boolean;
  /**
   * Render priority — lower number = render first (higher priority).
   * Derived from distance + status weight:
   *   priority = distance + statusWeight(status) * PRIORITY_STATUS_SCALE
   */
  priority: number;
}

/**
 * SpatialIndexSnapshot — Complete output of a single spatial index computation.
 *
 * Immutable value produced by computeSpatialIndex.  The scene graph and
 * the spatial-index-store both consume this shape.
 */
export interface SpatialIndexSnapshot {
  /** All agent results, sorted by priority ascending (nearest/most active first) */
  agents: AgentCullResult[];
  /** Agents within the render window (full geometry) */
  windowAgents: AgentCullResult[];
  /** Agents visible but outside the window (FAR LOD dot only) */
  deferredAgents: AgentCullResult[];
  /** Camera world position at snapshot time */
  cameraPos: Vec3;
  /** Total agents indexed (before any culling) */
  totalCount: number;
  /** Agents within culling radius (not culled) */
  visibleCount: number;
  /** Agents in full-render window */
  windowCount: number;
  /** monotonic timestamp (Date.now()) at snapshot creation */
  ts: number;
}

/**
 * WindowedAgentSet — Compact projection of a SpatialIndexSnapshot.
 *
 * Consumed by HUD components, hooks, and stores that need agent IDs
 * and LOD levels without the full snapshot payload.
 */
export interface WindowedAgentSet {
  /** Agent IDs receiving full geometry rendering this frame */
  fullRenderIds: string[];
  /** Agent IDs visible but outside the window — render as FAR LOD dot */
  deferredIds: string[];
  /** Agent IDs beyond culling radius — skip all rendering */
  culledIds: string[];
  /** Per-agent LOD assignment (covers ALL agents, not just window) */
  lodMap: Record<string, LODLevel>;
}

// ── Internal constants ────────────────────────────────────────────────────────

/**
 * Status-to-priority-weight mapping.
 * Lower weight = higher render priority when window slots are scarce.
 */
const STATUS_WEIGHT: Readonly<Record<string, number>> = {
  active:     0,
  busy:       1,
  idle:       2,
  error:      3,
  inactive:   4,
  terminated: 5,
};

/** Scale factor applied to the status weight in priority computation. */
const PRIORITY_STATUS_SCALE = 0.5;

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Euclidean distance between two Vec3 points. */
function dist3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Numeric priority weight for a status string (lower = higher priority). */
function statusWeight(status: string): number {
  return STATUS_WEIGHT[status] ?? 3;
}

// ── Core public API ───────────────────────────────────────────────────────────

/**
 * computeAgentLOD — Distance-based LOD level for a single agent.
 *
 * Delegates to THRESHOLDS.agent from lod-drill-policy.ts so all agent LOD
 * thresholds remain at a single source of truth.
 *
 *   distance < 6  → "near"  (full avatar)
 *   6 ≤ dist < 14 → "mid"   (body silhouette + status dot)
 *   distance ≥ 14 → "far"   (dot only)
 *
 * @param distance  Camera-to-agent Euclidean distance in world units
 * @returns         LOD level string
 */
export function computeAgentLOD(distance: number): LODLevel {
  return computeDistanceLOD(
    distance,
    THRESHOLDS.agent.near,
    THRESHOLDS.agent.far,
  );
}

/**
 * computeAgentPriority — Render priority for a single agent.
 *
 * Lower number = render first (higher priority).
 *
 *   priority = distance + statusWeight(status) * PRIORITY_STATUS_SCALE
 *
 * This ensures:
 *   1. Nearby agents are always preferred for window slots.
 *   2. Among equidistant agents, active/busy agents outrank idle/inactive.
 *
 * @param distance  Camera-to-agent distance
 * @param status    Agent status string (e.g. "active", "idle")
 * @returns         Priority number
 */
export function computeAgentPriority(distance: number, status: string): number {
  return distance + statusWeight(status) * PRIORITY_STATUS_SCALE;
}

/**
 * cullFrustum — Filter agents outside the culling sphere.
 *
 * Simplified sphere test: agents with camera distance > cullingRadius are
 * excluded.  Suitable for n ≤ 20 at building scale.
 *
 * @param entries       All agents to test
 * @param cameraPos     Camera world-space position
 * @param cullingRadius Sphere radius in world units
 * @returns             Agents within cullingRadius
 */
export function cullFrustum(
  entries: AgentSpatialEntry[],
  cameraPos: Vec3,
  cullingRadius: number = DEFAULT_CULLING_RADIUS,
): AgentSpatialEntry[] {
  return entries.filter((e) => dist3(e.position, cameraPos) <= cullingRadius);
}

/**
 * computeSpatialIndex — Main entry point: compute a full spatial index snapshot.
 *
 * Steps:
 *   1. Compute camera-to-agent distances for all entries.
 *   2. Separate agents into visible (≤ cullingRadius) and culled (> cullingRadius).
 *   3. Sort visible agents by render priority (ascending).
 *   4. Assign window slots: first max(windowSize, MIN_WINDOW_SIZE) by priority.
 *   5. Assign LOD to each agent:
 *        - In-window  → computeAgentLOD(distance)
 *        - Deferred   → "far"
 *        - Culled     → "far" (but inWindow=false, culled=true)
 *   6. Return immutable SpatialIndexSnapshot.
 *
 * @param entries       All agents to index (3–20 expected)
 * @param cameraPos     Camera world-space position
 * @param windowSize    Max fully-rendered agents (default MAX_RENDER_WINDOW)
 * @param cullingRadius Sphere cull radius (default DEFAULT_CULLING_RADIUS)
 * @returns             Immutable SpatialIndexSnapshot
 */
export function computeSpatialIndex(
  entries: AgentSpatialEntry[],
  cameraPos: Vec3,
  windowSize: number = MAX_RENDER_WINDOW,
  cullingRadius: number = DEFAULT_CULLING_RADIUS,
): SpatialIndexSnapshot {
  const ts = Date.now();

  // 1. Compute distances
  const withDist = entries.map((entry) => ({
    entry,
    distance: dist3(entry.position, cameraPos),
  }));

  // 2. Partition visible vs culled
  const visible = withDist.filter(({ distance }) => distance <= cullingRadius);
  const culledIds = new Set<string>(
    withDist
      .filter(({ distance }) => distance > cullingRadius)
      .map(({ entry }) => entry.agentId),
  );

  // 3. Sort visible by priority (ascending = highest priority first)
  visible.sort(
    (a, b) =>
      computeAgentPriority(a.distance, a.entry.status) -
      computeAgentPriority(b.distance, b.entry.status),
  );

  // 4. Assign window slots — ensure at least MIN_WINDOW_SIZE agents are included
  const effectiveWindow = Math.max(MIN_WINDOW_SIZE, windowSize);
  const inWindowIds = new Set<string>(
    visible.slice(0, effectiveWindow).map(({ entry }) => entry.agentId),
  );

  // 5. Build per-agent result array (covers ALL entries, including culled)
  const allResults: AgentCullResult[] = withDist.map(({ entry, distance }) => {
    const culled   = culledIds.has(entry.agentId);
    const inWindow = !culled && inWindowIds.has(entry.agentId);
    const lod: LODLevel = inWindow ? computeAgentLOD(distance) : "far";

    return {
      agentId:  entry.agentId,
      position: entry.position,
      distance,
      lod,
      inWindow,
      culled,
      priority: computeAgentPriority(distance, entry.status),
    };
  });

  // Sort final results by priority so consumers can iterate in render order
  allResults.sort((a, b) => a.priority - b.priority);

  const windowAgents   = allResults.filter((r) => r.inWindow && !r.culled);
  const deferredAgents = allResults.filter((r) => !r.inWindow && !r.culled);

  return Object.freeze({
    agents:        allResults,
    windowAgents,
    deferredAgents,
    cameraPos,
    totalCount:    entries.length,
    visibleCount:  visible.length,
    windowCount:   windowAgents.length,
    ts,
  });
}

/**
 * extractWindowedSet — Project a SpatialIndexSnapshot into a WindowedAgentSet.
 *
 * Converts the snapshot's full agent result array into the compact ID sets
 * and LOD map consumed by HUD components and stores.
 *
 * @param snapshot  A SpatialIndexSnapshot from computeSpatialIndex
 * @returns         WindowedAgentSet
 */
export function extractWindowedSet(snapshot: SpatialIndexSnapshot): WindowedAgentSet {
  const lodMap: Record<string, LODLevel> = {};
  for (const r of snapshot.agents) {
    lodMap[r.agentId] = r.lod;
  }

  return {
    fullRenderIds: snapshot.windowAgents.map((r) => r.agentId),
    deferredIds:   snapshot.deferredAgents.map((r) => r.agentId),
    culledIds:     snapshot.agents.filter((r) => r.culled).map((r) => r.agentId),
    lodMap,
  };
}

/**
 * makeEmptySnapshot — Produce an empty snapshot with zero agents.
 *
 * Used as the initial value in the spatial-index store and returned by
 * the "index.reset" behavioral contract verb.
 */
export function makeEmptySnapshot(cameraPos: Vec3 = { x: 0, y: 0, z: 0 }): SpatialIndexSnapshot {
  return Object.freeze({
    agents:        [],
    windowAgents:  [],
    deferredAgents: [],
    cameraPos,
    totalCount:    0,
    visibleCount:  0,
    windowCount:   0,
    ts:            Date.now(),
  });
}
