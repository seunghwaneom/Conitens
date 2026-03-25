/**
 * use-hierarchy-spatial-integration.ts — Bridges spatial_index LOD data
 * into the room/agent hierarchy.
 *
 * Sub-AC 3 (AC 15): Integration layer that makes the spatial_index entity's
 * window and LOD data accessible to hierarchy components.  This hook closes
 * the loop between:
 *
 *   Infrastructure layer: spatial_index (computes LOD + window per frame)
 *   Domain layer:         room/agent hierarchy (needs to know what to render)
 *
 * Consumers call this hook to decide:
 *   - Which agents to render at full fidelity (in the render window)
 *   - Which agents to render at reduced fidelity (deferred, LOD "far")
 *   - Which agents to skip entirely (culled beyond culling radius)
 *
 * ── Ontology level ──────────────────────────────────────────────────────────
 *   INFRASTRUCTURE — bridges two infrastructure entities (spatial_index and
 *   room-agent-hierarchy) without touching domain data or meta-layer concerns.
 *
 * ── Behavioral contract ─────────────────────────────────────────────────────
 *   "hierarchy.queryAgentLOD"    — get the LOD level for a single agent ID
 *   "hierarchy.queryWindow"      — get the full windowed agent set
 *   "hierarchy.isAgentCulled"    — check if agent is outside the cull radius
 *   "hierarchy.isAgentInWindow"  — check if agent is in the full-render window
 *   "hierarchy.isAgentVisible"   — check if agent is visible (window + deferred)
 *
 * ── Record Transparency ──────────────────────────────────────────────────────
 *   This hook is READ-ONLY: it reads from the spatial-index-store event log
 *   and exposes it without mutation.  All writes happen in useSpatialIndex()
 *   (the producer side, called by SpatialIndexProvider inside the Canvas).
 *
 * ── Performance ──────────────────────────────────────────────────────────────
 *   Only the snapshot and windowedSet fields are subscribed — Set constructors
 *   run synchronously but only when the Zustand store signals a change.
 *   For 20 agents the Set construction cost is negligible (< 0.01ms).
 */

import { useMemo } from "react";
import { useSpatialIndexStore } from "../store/spatial-index-store.js";
import type { WindowedAgentSet, SpatialIndexSnapshot } from "../scene/spatial-index.js";
import type { LODLevel } from "../scene/lod-drill-policy.js";

// ── Behavioral Contract Interface ─────────────────────────────────────────────

/**
 * HierarchySpatialIntegrationContract — Declares what this integration entity
 * CAN DO (verb-first specification per ontology requirements).
 *
 * Satisfies the ontology constraint that every entity type must declare its
 * behavioral_contract (what it can DO, not just what it IS) to prevent
 * noun-verb asymmetry.
 */
export interface HierarchySpatialIntegrationContract {
  /**
   * "hierarchy.queryAgentLOD" — Return the LOD level for a given agentId.
   * Returns "far" when the agent is unknown (not yet indexed or culled).
   */
  "hierarchy.queryAgentLOD": (agentId: string) => LODLevel;

  /**
   * "hierarchy.queryWindow" — Return the complete windowed agent set.
   * Includes fullRenderIds, deferredIds, culledIds, and the per-agent
   * lodMap.  Reads from the spatial-index-store — no computation.
   */
  "hierarchy.queryWindow": () => WindowedAgentSet;

  /**
   * "hierarchy.isAgentCulled" — Return true if the agent is beyond the
   * culling radius and should have NO 3D representation this frame.
   */
  "hierarchy.isAgentCulled": (agentId: string) => boolean;

  /**
   * "hierarchy.isAgentInWindow" — Return true if the agent is in the
   * full-render window (highest render priority this frame).
   */
  "hierarchy.isAgentInWindow": (agentId: string) => boolean;

  /**
   * "hierarchy.isAgentVisible" — Return true if the agent is visible
   * (either in the window or in the deferred set).
   * Deferred agents should render at LOD "far" (dot-only).
   */
  "hierarchy.isAgentVisible": (agentId: string) => boolean;
}

// ── Return type ───────────────────────────────────────────────────────────────

/**
 * HierarchySpatialIntegration — The data and query API returned by
 * useHierarchySpatialIntegration().
 *
 * Combines the raw snapshot counts with the behavioral contract query
 * methods so consumers have a single import for all spatial hierarchy needs.
 */
export interface HierarchySpatialIntegration {
  // ── Snapshot summary (read-only, from spatial-index-store) ──────────────

  /** The complete windowed agent set (IDs + LOD map). */
  windowedSet: WindowedAgentSet;

  /** The raw spatial index snapshot (includes all AgentCullResults). */
  snapshot: SpatialIndexSnapshot;

  /** Total agents indexed (before any culling). */
  totalCount: number;

  /** Agents in the full-render window (highest priority). */
  windowCount: number;

  /** Agents visible but outside the window (render at LOD "far"). */
  deferredCount: number;

  /** Agents culled (beyond culling radius) — no 3D representation. */
  culledCount: number;

  // ── Behavioral contract methods ──────────────────────────────────────────

  /**
   * Get the LOD level for a single agent.
   * Returns "far" when the agentId is unknown (not yet indexed).
   * Safe to call every render — no side effects.
   */
  getAgentLOD(agentId: string): LODLevel;

  /**
   * Check whether an agent is in the full-render window this frame.
   * In-window agents receive full geometry (all meshes, HTML badges, lights).
   */
  isAgentInWindow(agentId: string): boolean;

  /**
   * Check whether an agent is culled (beyond the culling sphere).
   * Culled agents have NO 3D representation — skip all rendering.
   */
  isAgentCulled(agentId: string): boolean;

  /**
   * Check whether an agent is visible at any fidelity level.
   * Visible = in window OR deferred (not culled).
   * Deferred agents render at LOD "far" (dot-only silhouette).
   */
  isAgentVisible(agentId: string): boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useHierarchySpatialIntegration — Read spatial_index data for hierarchy use.
 *
 * Returns the current spatial index state (snapshot + windowedSet) plus
 * convenience methods for querying per-agent LOD and window membership.
 *
 * The hook subscribes to the spatial-index-store — it re-renders only when
 * the windowed set or snapshot changes (i.e., when window membership changes
 * or a new snapshot is computed).
 *
 * Can be called outside the Three.js Canvas (HUD panels, room cards, etc.)
 * as well as inside it.
 *
 * @example
 *   function AgentAvatarWithLOD({ agentId, position }) {
 *     const { getAgentLOD, isAgentCulled } = useHierarchySpatialIntegration();
 *     if (isAgentCulled(agentId)) return null;
 *     const lod = getAgentLOD(agentId);
 *     return <AgentMesh lod={lod} position={position} />;
 *   }
 */
export function useHierarchySpatialIntegration(): HierarchySpatialIntegration {
  const snapshot    = useSpatialIndexStore((s) => s.snapshot);
  const windowedSet = useSpatialIndexStore((s) => s.windowedSet);

  // Build fast-lookup sets — only reconstructed when windowedSet reference changes.
  // For n ≤ 20 agents this is negligible overhead.
  const windowSet = useMemo(
    () => new Set<string>(windowedSet.fullRenderIds),
    [windowedSet.fullRenderIds],
  );

  const culledSet = useMemo(
    () => new Set<string>(windowedSet.culledIds),
    [windowedSet.culledIds],
  );

  return {
    // ── Snapshot counts ────────────────────────────────────────────────────
    windowedSet,
    snapshot,
    totalCount:    snapshot.totalCount,
    windowCount:   snapshot.windowCount,
    deferredCount: snapshot.deferredAgents.length,
    culledCount:   windowedSet.culledIds.length,

    // ── Behavioral contract implementations ───────────────────────────────

    getAgentLOD(agentId: string): LODLevel {
      return windowedSet.lodMap[agentId] ?? "far";
    },

    isAgentInWindow(agentId: string): boolean {
      return windowSet.has(agentId);
    },

    isAgentCulled(agentId: string): boolean {
      return culledSet.has(agentId);
    },

    isAgentVisible(agentId: string): boolean {
      // Visible = NOT culled (includes both windowed and deferred)
      return !culledSet.has(agentId);
    },
  };
}

// ── Utility: Build LOD-partitioned render lists ───────────────────────────────

/**
 * partitionAgentsByLOD — Partition a list of agent IDs into render tiers.
 *
 * Takes a list of agent IDs and the current windowed set, then returns
 * three arrays:
 *   nearIds    — in window, LOD "near" (full avatar)
 *   midIds     — in window, LOD "mid" (body silhouette)
 *   farIds     — deferred (dot only) or in window at LOD "far"
 *   culledIds  — culled (skip entirely)
 *
 * Pure function — no side effects, fully testable without stores.
 * Used by HierarchySpatialTaskLayer and SceneHierarchy to build render queues.
 *
 * @param agentIds     All agent IDs to classify
 * @param windowedSet  Current windowed set from useSpatialIndexStore
 * @returns            Four arrays partitioned by render tier
 */
export function partitionAgentsByLOD(
  agentIds: string[],
  windowedSet: WindowedAgentSet,
): {
  nearIds:   string[];
  midIds:    string[];
  farIds:    string[];
  culledIds: string[];
} {
  const culledSet = new Set(windowedSet.culledIds);

  const nearIds:   string[] = [];
  const midIds:    string[] = [];
  const farIds:    string[] = [];
  const culledIds: string[] = [];

  for (const id of agentIds) {
    if (culledSet.has(id)) {
      culledIds.push(id);
      continue;
    }
    const lod = windowedSet.lodMap[id] ?? "far";
    if (lod === "near")     nearIds.push(id);
    else if (lod === "mid") midIds.push(id);
    else                    farIds.push(id);
  }

  return { nearIds, midIds, farIds, culledIds };
}
