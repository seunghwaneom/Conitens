/**
 * agent-ontology-init.ts — Agent ontology → avatar placement initializer.
 *
 * Sub-AC 3 of AC 2: Wire agent ontology to avatar placement on init.
 *
 * PURPOSE
 * ───────
 * The building manifest (`BUILDING.agentAssignments`) is the canonical
 * ontological source of truth for which agents inhabit the command center
 * and which rooms they occupy.  This module reads that ontology and:
 *
 *   1. Iterates agents from the ontology (agentAssignments → AgentDef).
 *   2. Produces an `AvatarPlacementManifest` for the init pipeline.
 *   3. Verifies that all ontology agents are present in the runtime store
 *      BEFORE the first 3D frame renders (pre-render readiness gate).
 *
 * WHY THIS IS SEPARATE FROM agent-seed.ts
 * ────────────────────────────────────────
 * `agent-seed.ts` records POSITIONS (localPosition, worldPosition, furniture
 * slot) — it is the static spatial dataset.
 *
 * `agent-ontology-init.ts` answers the question:
 *   "Which agents SHOULD exist according to the ontology, and are they
 *    actually present in the runtime state?"
 *
 * The ontology source is `building.agentAssignments` (a Record<agentId,
 * roomId> that is part of the building manifest loaded from YAML), NOT the
 * AGENTS array.  This decoupling means the ontology can evolve independently
 * of the hardcoded agent list — only the building manifest needs updating.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * - Pure functions only — no side effects, no store mutation.
 * - Deterministic iteration order (agentId alphabetical sort) for stable
 *   spawn indices in tests and deterministic fade-in order.
 * - Non-agent IDs (e.g. "USER", "SYSTEM") are filtered via
 *   ONTOLOGY_SKIP_IDS — they appear in agentAssignments but are not agents
 *   that require 3D avatars.
 * - `verifyOntologyAgentsPlaced` returns a result object (not throws) so
 *   callers can decide whether to warn, block, or log.
 *
 * AC TRACEABILITY
 * ───────────────
 * Sub-AC 3 (AC 2): "Wire agent ontology to avatar placement on init —
 *   on application boot, iterate agents from the ontology, instantiate
 *   their inactive avatars in the correct rooms, and verify all agents
 *   are present before first render."
 */

import { BUILDING, type BuildingDef, type RoomDef } from "./building.js";
import { AGENT_MAP, type AgentDef } from "./agents.js";
import { AGENT_SEED_MAP, type AgentSeedRecord } from "./agent-seed.js";
import type { AgentRuntimeState } from "../store/agent-store.js";

// ── Non-agent IDs filtered from agentAssignments ─────────────────────────

/**
 * Set of IDs in `BUILDING.agentAssignments` that are NOT agents.
 *
 * "USER" represents the human operator's presence in the building — it
 * appears in agentAssignments to assign the operator to a default room, but
 * there is no AgentDef or avatar for it.  "SYSTEM" is reserved for future
 * system-level entries.
 *
 * These IDs are excluded from `iterateOntologyAgents()` and all downstream
 * functions that operate on the agent ontology.
 */
export const ONTOLOGY_SKIP_IDS = new Set<string>(["USER", "SYSTEM"]);

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * A single agent entry resolved from the building ontology.
 *
 * Created by `iterateOntologyAgents()` by joining:
 *   - `building.agentAssignments` for agentId → roomId
 *   - `AGENT_MAP` for agentId → AgentDef
 *   - `AGENT_SEED_MAP` for agentId → AgentSeedRecord (may be absent for
 *      dynamic agents not in the static seed)
 *
 * This is the canonical record used to instantiate a 3D avatar at boot.
 */
export interface OntologyAgentEntry {
  /** Agent unique identifier (matches AgentDef.agentId) */
  agentId: string;
  /**
   * Assigned room from the building manifest.
   * This is the SOURCE OF TRUTH for the agent's home room.
   * May differ from `agentDef.defaultRoom` if the manifest was updated.
   */
  roomId: string;
  /** Resolved agent definition (role, visual config, capabilities) */
  agentDef: AgentDef;
  /**
   * Seed record with precise placement coordinates.
   * Undefined for dynamically-registered agents that have no seed entry.
   * When absent, the avatar placement falls back to grid-computed positions.
   */
  seedRecord: AgentSeedRecord | undefined;
  /**
   * Room definition from the building (resolved from roomId).
   * Undefined if the room ID from the ontology is not in the building rooms.
   * Callers should warn when this is undefined (broken ontology reference).
   */
  roomDef: RoomDef | undefined;
  /**
   * Spawn stagger index — 0-based, ascending by agentId alphabetical order.
   * Controls the fade-in animation sequence in AgentAvatar.tsx.
   * Deterministic across runs (alphabetical sort ensures stable ordering).
   */
  spawnIndex: number;
}

/**
 * Full avatar placement manifest derived from the building ontology.
 *
 * Produced by `buildAvatarPlacementManifest()`.  Consumed by the agent store's
 * `initializeAgents()` to place all avatars in their correct rooms at boot.
 *
 * Design contract:
 *   - `entries` are sorted by spawnIndex (0-based, ascending).
 *   - All entries have a defined agentDef (missing defs are filtered out with
 *     a warning rather than silently included as broken avatars).
 *   - The `expectedAgentIds` set is the authoritative "what should be present"
 *     list for the pre-render readiness gate.
 */
export interface AvatarPlacementManifest {
  /**
   * Ordered list of agent entries to instantiate.
   * Sorted by spawnIndex (alphabetical by agentId).
   */
  entries: readonly OntologyAgentEntry[];
  /**
   * Set of expected agent IDs — used by `verifyOntologyAgentsPlaced()`.
   * Derived from `entries` for O(1) membership checks.
   */
  expectedAgentIds: ReadonlySet<string>;
  /**
   * Total number of agents expected from the ontology.
   * Convenience alias for `entries.length`.
   */
  expectedCount: number;
  /**
   * Building used to build this manifest.
   * Captured for traceability — allows callers to verify the manifest
   * was built from the expected building version.
   */
  buildingId: string;
  /**
   * IDs that were skipped from agentAssignments (non-agent entries).
   * Included for observability; normally just ["USER"].
   */
  skippedIds: readonly string[];
  /**
   * IDs in agentAssignments that could not be resolved to an AgentDef.
   * Should be empty in a correct ontology. Listed here for debugging.
   */
  unresolvedIds: readonly string[];
}

/**
 * Result of the pre-render ontology verification check.
 *
 * Returned by `verifyOntologyAgentsPlaced()`. Callers use this to:
 *   - Gate scene rendering on `allPresent === true`
 *   - Log missing agents before first render
 *   - Show a loading indicator with `presentCount / expectedCount` progress
 */
export interface OntologyVerificationResult {
  /**
   * True when every agent in the ontology manifest is present in the store.
   * This is the signal that it is safe to render the agent layer.
   */
  allPresent: boolean;
  /**
   * IDs of ontology agents that are missing from the runtime store.
   * Empty when `allPresent === true`.
   */
  missing: readonly string[];
  /**
   * Number of ontology agents successfully placed in the store.
   */
  presentCount: number;
  /**
   * Total number of agents expected (from the ontology).
   */
  expectedCount: number;
  /**
   * IDs present in the store that are NOT in the ontology.
   * These are dynamically-registered agents — not an error condition.
   */
  extra: readonly string[];
}

// ── Core Functions ────────────────────────────────────────────────────────

/**
 * iterateOntologyAgents — Produce an ordered list of agent entries from the
 * building ontology.
 *
 * Algorithm:
 *   1. Read `building.agentAssignments` for the canonical agentId → roomId mapping.
 *   2. Filter out ONTOLOGY_SKIP_IDS (USER, SYSTEM).
 *   3. Sort remaining IDs alphabetically for deterministic spawn ordering.
 *   4. For each agentId:
 *      a. Resolve AgentDef from AGENT_MAP (may be undefined for unknown agents).
 *      b. Resolve AgentSeedRecord from AGENT_SEED_MAP (optional enrichment).
 *      c. Resolve RoomDef from building.rooms (for world-space bounds).
 *   5. Filter out entries with no AgentDef (warn + record as unresolved).
 *   6. Return ordered entries with assigned spawnIndex values.
 *
 * @param building - Building manifest to read agentAssignments from.
 *   Defaults to the static BUILDING constant. Pass a YAML-loaded building
 *   to get ontology-consistent placement from the dynamic manifest.
 *
 * @returns Array of resolved agent entries, sorted by agentId (alphabetical),
 *   spawnIndex 0-based ascending. Entries with missing AgentDef are excluded.
 */
export function iterateOntologyAgents(
  building: BuildingDef = BUILDING,
): OntologyAgentEntry[] {
  const agentIds = Object.keys(building.agentAssignments)
    .filter((id) => !ONTOLOGY_SKIP_IDS.has(id))
    .sort(); // Alphabetical for deterministic order

  const entries: OntologyAgentEntry[] = [];
  let spawnIndex = 0;

  for (const agentId of agentIds) {
    const roomId = building.agentAssignments[agentId];
    const agentDef = AGENT_MAP[agentId];
    const seedRecord = AGENT_SEED_MAP[agentId];
    const roomDef = building.rooms.find((r) => r.roomId === roomId);

    // Skip if no AgentDef — warn so the caller can investigate
    if (!agentDef) {
      console.warn(
        `[agent-ontology-init] agentId '${agentId}' in building.agentAssignments has no corresponding AgentDef — skipped.`,
      );
      continue;
    }

    entries.push({
      agentId,
      roomId,
      agentDef,
      seedRecord,
      roomDef,
      spawnIndex: spawnIndex++,
    });
  }

  return entries;
}

/**
 * getExpectedAgentIds — Return the set of agent IDs that the ontology expects
 * to be present in the runtime store after initialization.
 *
 * This is the O(1)-lookup version of iterating agentAssignments and filtering.
 * Used by `verifyOntologyAgentsPlaced` for efficient membership checks.
 *
 * @param building - Building manifest to read. Defaults to BUILDING.
 * @returns Set<string> of expected agent IDs (excludes ONTOLOGY_SKIP_IDS).
 */
export function getExpectedAgentIds(
  building: BuildingDef = BUILDING,
): Set<string> {
  return new Set(
    Object.keys(building.agentAssignments).filter(
      (id) => !ONTOLOGY_SKIP_IDS.has(id),
    ),
  );
}

/**
 * buildAvatarPlacementManifest — Construct the full avatar placement manifest
 * from the building ontology.
 *
 * This is the authoritative pre-render artifact:
 *   - Produced at app boot before `initializeAgents()` is called.
 *   - Consumed by the scene initialization to know which avatars to place.
 *   - Used by `verifyOntologyAgentsPlaced()` as the reference for the
 *     readiness gate.
 *
 * @param building - Building manifest. Defaults to BUILDING.
 * @returns AvatarPlacementManifest with entries, expectedAgentIds, counts.
 */
export function buildAvatarPlacementManifest(
  building: BuildingDef = BUILDING,
): AvatarPlacementManifest {
  const allIds = Object.keys(building.agentAssignments);
  const skippedIds: string[] = [];
  const unresolvedIds: string[] = [];

  for (const id of allIds) {
    if (ONTOLOGY_SKIP_IDS.has(id)) {
      skippedIds.push(id);
    } else if (!AGENT_MAP[id]) {
      unresolvedIds.push(id);
    }
  }

  const entries = iterateOntologyAgents(building);
  const expectedAgentIds = new Set(entries.map((e) => e.agentId));

  return {
    entries: Object.freeze(entries),
    expectedAgentIds,
    expectedCount: entries.length,
    buildingId: building.buildingId,
    skippedIds: Object.freeze(skippedIds),
    unresolvedIds: Object.freeze(unresolvedIds),
  };
}

/**
 * verifyOntologyAgentsPlaced — Pre-render readiness gate.
 *
 * Compares the agents currently in the runtime store against the agents
 * declared in the building ontology manifest.  Returns a structured result
 * so callers can decide how to react:
 *
 *   allPresent = true  → render agent layer immediately
 *   allPresent = false → wait or show loading state; log `missing`
 *
 * This function is PURE (no side effects) so it can be called in:
 *   - React render functions (as a derived value)
 *   - useEffect hooks
 *   - Tests (headless, no store mocking required if agents map is provided)
 *   - Dev-mode assertions before the first Three.js frame
 *
 * @param storeAgents - The current `agents` map from the agent store.
 * @param manifest - The placement manifest to check against.
 *   Pass the result of `buildAvatarPlacementManifest()` for correctness.
 *   Defaults to a freshly-built manifest from BUILDING.
 *
 * @returns OntologyVerificationResult with allPresent, missing, counts.
 */
export function verifyOntologyAgentsPlaced(
  storeAgents: Record<string, AgentRuntimeState>,
  manifest: AvatarPlacementManifest = buildAvatarPlacementManifest(),
): OntologyVerificationResult {
  const presentIds = new Set(Object.keys(storeAgents));
  const expectedIds = manifest.expectedAgentIds;

  const missing: string[] = [];
  let presentCount = 0;

  for (const agentId of expectedIds) {
    if (presentIds.has(agentId)) {
      presentCount++;
    } else {
      missing.push(agentId);
    }
  }

  // Extra agents: in store but not in ontology (dynamic agents — not an error)
  const extra = [...presentIds].filter((id) => !expectedIds.has(id));

  return {
    allPresent: missing.length === 0,
    missing: Object.freeze(missing),
    presentCount,
    expectedCount: manifest.expectedCount,
    extra: Object.freeze(extra),
  };
}

/**
 * assertOntologyAgentsPresent — Development-mode hard assertion.
 *
 * Throws a descriptive error if not all ontology agents are present in the
 * runtime store. Intended for use in dev-mode checks before the first render
 * frame — a missing agent at this point indicates a configuration error.
 *
 * In production builds, callers should use `verifyOntologyAgentsPlaced()`
 * instead (which returns a result without throwing).
 *
 * @throws Error if any expected ontology agent is absent from `storeAgents`.
 */
export function assertOntologyAgentsPresent(
  storeAgents: Record<string, AgentRuntimeState>,
  manifest: AvatarPlacementManifest = buildAvatarPlacementManifest(),
): void {
  const result = verifyOntologyAgentsPlaced(storeAgents, manifest);
  if (!result.allPresent) {
    throw new Error(
      `[agent-ontology-init] Pre-render check failed: ${result.missing.length} agent(s) ` +
      `from the ontology are not in the runtime store. ` +
      `Missing: [${result.missing.join(", ")}]. ` +
      `Present: ${result.presentCount}/${result.expectedCount}.`,
    );
  }
}

/**
 * getOntologyRoomForAgent — Retrieve the canonical room for an agent from the
 * building ontology (agentAssignments).
 *
 * This is the authoritative lookup — it reads from the BUILDING manifest, NOT
 * from the agent's AgentDef.defaultRoom.  When the manifest and AgentDef
 * disagree, the manifest wins.
 *
 * @param agentId - Agent identifier to look up.
 * @param building - Building manifest to query.
 * @returns Room definition if found; undefined if not in the manifest.
 */
export function getOntologyRoomForAgent(
  agentId: string,
  building: BuildingDef = BUILDING,
): RoomDef | undefined {
  const roomId = building.agentAssignments[agentId];
  if (!roomId) return undefined;
  return building.rooms.find((r) => r.roomId === roomId);
}

/**
 * formatManifestSummary — Debug-friendly one-liner summary of the placement manifest.
 *
 * Example output:
 *   "AvatarPlacementManifest [command-center]: 5 agents, 1 skipped (USER)"
 */
export function formatManifestSummary(manifest: AvatarPlacementManifest): string {
  const skippedStr = manifest.skippedIds.length > 0
    ? ` (${manifest.skippedIds.join(", ")})`
    : "";
  const unresolvedStr = manifest.unresolvedIds.length > 0
    ? `, ${manifest.unresolvedIds.length} unresolved`
    : "";
  return (
    `AvatarPlacementManifest [${manifest.buildingId}]: ` +
    `${manifest.expectedCount} agents, ` +
    `${manifest.skippedIds.length} skipped${skippedStr}` +
    unresolvedStr
  );
}
