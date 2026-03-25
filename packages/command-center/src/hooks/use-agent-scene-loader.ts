/**
 * use-agent-scene-loader.ts — Scene-load avatar initialization hook.
 *
 * Sub-AC 2c: On scene load, instantiate avatar objects from the agent
 * dataset at their designated 3D coordinates and apply the inactive
 * state material/shader so all agents appear dormant before any
 * runtime activity.
 *
 * Responsibilities:
 *   1. Read AGENT_INITIAL_PLACEMENTS (canonical seed dataset) to build
 *      the expected manifest of agents, their rooms, and floor-level
 *      3D coordinates.
 *   2. Trigger initializeAgents() exactly once when the scene loads —
 *      the store's `initialized` guard prevents double-initialization.
 *   3. Record an "agents.initialized" entry in the unified SceneEventLog
 *      for full event-sourced traceability (per the "record_transparency"
 *      design principle).
 *   4. Return an AgentSceneLoadStatus object so 3D scene components can
 *      inspect loading progress, show a loading indicator while avatars
 *      are being placed, or gate rendering on completion.
 *
 * Inactive state contract:
 *   - All placed agents start with status = "inactive" (set by initializeAgents).
 *   - AgentAvatar.tsx reads status and applies STATUS_CONFIG.inactive:
 *       opacity       = 0.45   (clearly dimmed)
 *       emissiveMul   = 0.15   (near-dark glow)
 *       desatFactor   = 0.72   (72% colour bleached toward grey)
 *       animate       = false  (no movement animation)
 *   - The combination makes inactive agents visually "dormant" — present
 *     in the scene but unambiguously not running.
 *
 * Staggered fade-in:
 *   - Each agent receives spawnTs = now + spawnIndex × SPAWN_STAGGER_MS (180 ms).
 *   - AgentAvatar.tsx uses spawnTs to sequence the scale/opacity pop-in
 *     so avatars appear one by one from spawnIndex 0 (manager) onward.
 *   - This hook exposes the seedManifest sorted by spawnIndex so callers
 *     can synchronise non-avatar scene elements to the same stagger timing.
 *
 * Design notes:
 *   - Safe to call both inside and outside the Canvas context; uses only
 *     standard React hooks (useEffect, useMemo), not useFrame.
 *   - If initializeAgents() was already called by App.tsx before the scene
 *     mounts (the typical flow), this hook detects `initialized === true`
 *     and skips re-initialization, going straight to reporting status.
 *   - The SceneEventLog recording guard (recording === true required) is
 *     respected by recordEntry(); if recording hasn't started yet the
 *     event is silently dropped — which is fine since the agent store
 *     already records its own "agents.initialized" event independently.
 *
 * Usage (inside or outside Canvas):
 *   const { loaded, agentCount, allInactive, seedManifest } = useAgentSceneLoader();
 *
 *   // Example: defer heavy scene content until avatars are placed
 *   if (!loaded) return <SceneLoader />;
 *
 *   // Example: read seed stagger order for coordinated animations
 *   seedManifest.forEach((seed, i) => {
 *     const spawnDelayMs = i * STAGGER_MS;
 *     ...
 *   });
 *
 * AC traceability:
 *   Sub-AC 2c — scene-load avatar instantiation with inactive state
 */

import { useEffect, useMemo } from "react";
import { useAgentStore } from "../store/agent-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";
import {
  AGENT_INITIAL_PLACEMENTS,
  type AgentSeedRecord,
} from "../data/agent-seed.js";
import { STATUS_CONFIG } from "../scene/AgentAvatar.js";
import {
  buildAvatarPlacementManifest,
  verifyOntologyAgentsPlaced,
  type AvatarPlacementManifest,
  type OntologyVerificationResult,
} from "../data/agent-ontology-init.js";

// ── Exported Types ────────────────────────────────────────────────────────

/**
 * Status returned by useAgentSceneLoader.
 *
 * Consumed by 3D scene components to:
 *   - Gate rendering on avatar placement completion (loaded)
 *   - Display agent count in loading indicators (agentCount)
 *   - Assert the inactive-state design contract (allInactive)
 *   - Synchronise staggered animations (seedManifest)
 */
export interface AgentSceneLoadStatus {
  /**
   * Whether all seed agents have been instantiated in the agent store.
   * Becomes true immediately after initializeAgents() completes.
   */
  loaded: boolean;

  /**
   * Number of agent runtime states currently in the agent store.
   * Expected value after load: AGENT_INITIAL_PLACEMENTS.length (= 5).
   */
  agentCount: number;

  /**
   * Whether every instantiated agent has status = "inactive".
   * Should be true on scene load, before any lifecycle commands.
   * Becomes false once an agent is started, given a task, etc.
   */
  allInactive: boolean;

  /**
   * Whether the inactive material configuration is applied to all agents.
   * Mirrors STATUS_CONFIG.inactive values:
   *   opacity     = 0.45  (low transparency → "dormant" look)
   *   emissiveMul = 0.15  (near-dark emissive)
   *   desatFactor = 0.72  (cold, bleached colour)
   */
  inactiveMaterialConfig: {
    opacity: number;
    emissiveMul: number;
    desatFactor: number;
    animate: boolean;
  };

  /**
   * Ordered seed manifest (by spawnIndex, ascending).
   *
   * Each record includes the agent's:
   *   - agentId, roomId, floor
   *   - position.worldPosition  (3D coordinates where avatar is placed)
   *   - position.localPosition  (room-relative coords, [0..1] range)
   *   - spawnIndex              (stagger order in the fade-in animation)
   *   - inactiveFlags           (activation requirements)
   *
   * Stable across renders — created once via useMemo.
   */
  seedManifest: readonly AgentSeedRecord[];

  /**
   * Stagger delay between consecutive avatar fade-ins (ms).
   * Exposed so external components can synchronise to the same timing.
   * Value: 180 ms (matches SPAWN_STAGGER_MS in agent-store.ts).
   */
  staggerMs: number;

  /**
   * Sub-AC 3 (AC 2): Ontology-based pre-render readiness verification.
   *
   * Compares the current runtime store against the building-ontology manifest
   * (BUILDING.agentAssignments) to verify all expected agents are present.
   *
   * - `ontologyVerification.allPresent` is the authoritative pre-render gate:
   *     true  → all ontology agents are in the store; safe to render
   *     false → some agents are missing; scene should show loading state
   *
   * - `ontologyVerification.missing` lists agent IDs that have not yet been
   *     placed, enabling targeted loading indicators or error messages.
   *
   * - This check uses BUILDING.agentAssignments (the building manifest) as the
   *     source of truth — NOT the AGENTS array — so the ontology and the scene
   *     remain co-consistent as the building manifest evolves.
   */
  ontologyVerification: OntologyVerificationResult;

  /**
   * The avatar placement manifest derived from the building ontology.
   * Read-only artifact produced at hook mount from BUILDING.agentAssignments.
   * Stable across re-renders (built once via useMemo).
   */
  ontologyManifest: AvatarPlacementManifest;
}

/** Stagger delay between consecutive avatar fade-ins (ms). Must match agent-store.ts. */
export const SCENE_SPAWN_STAGGER_MS = 180;

// ── Hook ─────────────────────────────────────────────────────────────────

/**
 * useAgentSceneLoader — Initializes agent avatars from the seed dataset on
 * scene load and returns a status object describing the placement state.
 *
 * This is the Sub-AC 2c entry point: it connects the scene's lifecycle
 * (component mount) to avatar instantiation (initializeAgents) and the
 * event log (recordEntry), completing the transparent-recording contract.
 *
 * Returned status object is stable across renders once loaded = true.
 */
export function useAgentSceneLoader(): AgentSceneLoadStatus {
  // ── Store accessors ────────────────────────────────────────────────
  const initializeAgents = useAgentStore((s) => s.initializeAgents);
  const initialized      = useAgentStore((s) => s.initialized);
  const agents           = useAgentStore((s) => s.agents);
  const recordEntry      = useSceneEventLog((s) => s.recordEntry);

  // ── Seed manifest (stable across renders) ─────────────────────────
  const seedManifest = useMemo(
    (): readonly AgentSeedRecord[] =>
      [...AGENT_INITIAL_PLACEMENTS].sort((a, b) => a.spawnIndex - b.spawnIndex),
    [],
  );

  // ── Sub-AC 3: Ontology placement manifest (stable across renders) ──
  //
  // Built once from BUILDING.agentAssignments — the building manifest is the
  // canonical ontological source for which agents should inhabit the 3D world.
  // This manifest is independent of the runtime store; it is the "expected" set.
  const ontologyManifest = useMemo(
    (): AvatarPlacementManifest => buildAvatarPlacementManifest(),
    [],
  );

  // ── Step 1: Trigger avatar instantiation on scene load ────────────
  //
  // If initializeAgents() has already been called by App.tsx (the normal
  // lifecycle), the store's `initialized` guard prevents re-running.
  // This effect is the safety net: if the scene is ever mounted without
  // App.tsx having fired first (test environments, lazy rendering), the
  // avatars are still placed correctly.
  useEffect(() => {
    if (!initialized) {
      initializeAgents();
    }
  }, [initialized, initializeAgents]);

  // ── Step 2: Record scene.agents_loaded event ──────────────────────
  //
  // Fires once, immediately after initialization completes.
  // Contributes to the append-only event audit trail required by the
  // "record_transparency" design principle.
  //
  // Uses "agents.initialized" category (defined in SceneEventCategory)
  // with source="system" to distinguish it from agent-store's own
  // "agents.initialized" operational event.
  useEffect(() => {
    if (!initialized) return;

    const agentValues = Object.values(agents);
    if (agentValues.length === 0) return;

    recordEntry({
      ts: Date.now(),
      category: "agents.initialized",
      source: "system",
      payload: {
        trigger: "scene_load",
        agent_count: agentValues.length,
        agent_ids: agentValues.map((a) => a.def.agentId),
        seed_count: AGENT_INITIAL_PLACEMENTS.length,
        all_inactive: agentValues.every((a) => a.status === "inactive"),
        spawn_order: agentValues
          .slice()
          .sort((a, b) => a.spawnIndex - b.spawnIndex)
          .map((a) => ({
            agent_id: a.def.agentId,
            room_id: a.roomId,
            spawn_index: a.spawnIndex,
            spawn_ts: a.spawnTs,
            world_position: a.worldPosition,
            status: a.status,
          })),
        inactive_material: {
          opacity: STATUS_CONFIG.inactive.opacity,
          emissive_mul: STATUS_CONFIG.inactive.emissiveMul,
          desat_factor: STATUS_CONFIG.inactive.desatFactor,
          animate: STATUS_CONFIG.inactive.animate,
        },
        stagger_ms: SCENE_SPAWN_STAGGER_MS,
      },
    });
    // Intentionally omit `agents` from deps — we only want this to fire
    // once, right after the initialization transition (initialized: false → true).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, recordEntry]);

  // ── Derived status ─────────────────────────────────────────────────
  const agentValues = Object.values(agents);
  const allInactive = agentValues.length > 0 &&
                      agentValues.every((a) => a.status === "inactive");

  // ── Sub-AC 3: Ontology pre-render verification ─────────────────────
  //
  // Cross-reference the runtime store against the building-ontology manifest.
  // This is the authoritative "are all expected agents present?" check.
  // Recomputed on every render when `agents` changes so the readiness gate
  // is always up-to-date — the function is pure and inexpensive (O(n) scan).
  const ontologyVerification = verifyOntologyAgentsPlaced(agents, ontologyManifest);

  // Sub-AC 3: `loaded` is now defined as "all ontology agents are present in
  // the store" — not just "store is initialized and has some agents".
  // This ensures `loaded === true` implies the scene has a complete set of
  // ontology-consistent avatars ready to render, not just a partial load.
  const loaded = initialized && ontologyVerification.allPresent;

  return {
    loaded,
    agentCount: agentValues.length,
    allInactive,
    inactiveMaterialConfig: {
      opacity:     STATUS_CONFIG.inactive.opacity,
      emissiveMul: STATUS_CONFIG.inactive.emissiveMul,
      desatFactor: STATUS_CONFIG.inactive.desatFactor,
      animate:     STATUS_CONFIG.inactive.animate,
    },
    seedManifest,
    staggerMs: SCENE_SPAWN_STAGGER_MS,
    ontologyVerification,
    ontologyManifest,
  };
}

// ── Utility Exports ───────────────────────────────────────────────────────

/**
 * getExpectedSpawnTs — Compute the expected spawnTs for an agent given a
 * base timestamp and its spawn index.
 *
 * Mirrors the computation in agent-store.ts buildInitialAgentStates():
 *   spawnTs = now + spawnIndex * SPAWN_STAGGER_MS
 *
 * Exported for tests and external consumers that need to predict when
 * a specific avatar's fade-in will begin.
 *
 * @param baseTs     - The timestamp when initializeAgents() was called (ms)
 * @param spawnIndex - The agent's 0-based placement order
 * @returns          - Expected spawnTs value (ms)
 */
export function getExpectedSpawnTs(baseTs: number, spawnIndex: number): number {
  return baseTs + spawnIndex * SCENE_SPAWN_STAGGER_MS;
}

/**
 * computeStaggeredDelay — Return the fade-in delay for the Nth avatar (0-based).
 *
 * @param index - 0-based stagger position (spawnIndex)
 * @returns     - Delay in ms before this avatar begins fading in
 */
export function computeStaggeredDelay(index: number): number {
  return index * SCENE_SPAWN_STAGGER_MS;
}

/**
 * isInactiveMaterialApplied — Verify that a given status value maps to the
 * inactive material configuration (opacity 0.45, emissive 0.15, desat 0.72).
 *
 * Pure predicate — no store access. Used in tests to confirm the inactive
 * shader is applied without mounting React components.
 *
 * @param status - AgentStatus string to check
 * @returns      - true if the status maps to STATUS_CONFIG.inactive
 */
export function isInactiveMaterialApplied(status: string): boolean {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return false;
  return (
    cfg.opacity     === STATUS_CONFIG.inactive.opacity     &&
    cfg.emissiveMul === STATUS_CONFIG.inactive.emissiveMul &&
    cfg.desatFactor === STATUS_CONFIG.inactive.desatFactor &&
    cfg.animate     === STATUS_CONFIG.inactive.animate
  );
}
