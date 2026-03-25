/**
 * room-mapping-model.ts — In-memory mapping model for runtime room assignments.
 *
 * Sub-AC 12a: Provides a structured, computed view of the current room mapping
 * state alongside deviation detection from compiled-in defaults.
 *
 * This module is intentionally separate from the Zustand store so its pure
 * functions can be unit-tested without React or browser dependencies.
 *
 * Key concepts:
 *
 *   RoomAssignmentEntry  – A single resolved mapping entry (role, capability,
 *                          special entity, or fallback) with its current room.
 *
 *   AssignmentKind       – Discriminates the type of assignment (role, capability,
 *                          special, fallback).
 *
 *   MappingDeviation     – A detected difference between the current config and
 *                          the compiled DEFAULT_ROOM_MAPPING.
 *
 *   RoomMappingSnapshot  – The full in-memory model: current assignments, default
 *                          assignments, deviations, and summary counts.
 *
 * Usage:
 *
 *   // Get current deviations from a live RoomMappingConfig:
 *   const snapshot = buildRoomMappingSnapshot(liveConfig);
 *   console.log(snapshot.deviations);  // MappingDeviation[]
 *   console.log(snapshot.hasDeviations); // boolean
 *
 * Integration:
 *   - room-mapping-store.ts recomputes a snapshot on every mutation and stores
 *     it as `snapshot` in the Zustand state for reactive UI consumption.
 *   - RoomMappingPanel reads `snapshot.deviations` to display deviation badges.
 *   - 3D RoomVolume reads `snapshot.currentAssignments` to colour rooms that
 *     have deviated from defaults.
 */

import {
  DEFAULT_ROOM_MAPPING,
  type RoomMappingConfig,
  type AgentRole,
} from "./room-mapping-resolver.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Discriminant tag for the kind of mapping entry. */
export type AssignmentKind =
  | "role"        // AgentRole → room
  | "capability"  // capability string → room (ordered fallback list)
  | "special"     // non-agent entity (USER, SYSTEM, …) → room
  | "fallback";   // global catch-all room

/**
 * A single resolved mapping entry in the in-memory model.
 * Represents one row of the "current assignments" flat table.
 */
export interface RoomAssignmentEntry {
  /** Unique key within the mapping model:
   *   - roles:        the role string ("orchestrator", …)
   *   - capabilities: the capability string ("code-change", …)
   *   - specials:     the entity id ("USER", "SYSTEM", …)
   *   - fallback:     the literal string "fallback"
   */
  key: string;
  kind: AssignmentKind;
  roomId: string;
  /** Human-readable reason from the config entry. */
  reason: string;
  /** Priority (roles only; 1 = primary occupant). */
  priority?: number;
  /**
   * Ordinal position in the capability fallbacks array.
   * Undefined for non-capability entries.
   */
  capabilityIndex?: number;
}

/**
 * A detected deviation between the current config and the compiled-in defaults.
 * A deviation is created whenever `currentRoomId !== defaultRoomId`.
 */
export interface MappingDeviation {
  /** Same key namespace as RoomAssignmentEntry. */
  key: string;
  kind: AssignmentKind;
  defaultRoomId: string;
  currentRoomId: string;
  /** Descriptive label for display (e.g. "Role: orchestrator"). */
  label: string;
}

/**
 * The complete in-memory model produced by `buildRoomMappingSnapshot`.
 *
 * This is the canonical runtime view of the mapping state and is stored
 * in the Zustand room-mapping store so UI components can subscribe to it.
 */
export interface RoomMappingSnapshot {
  /**
   * Flat map of all *current* assignments (roles + capabilities + specials +
   * fallback), keyed by `RoomAssignmentEntry.key`.
   */
  currentAssignments: Record<string, RoomAssignmentEntry>;

  /**
   * Flat map of all *default* assignments (compiled from DEFAULT_ROOM_MAPPING),
   * keyed the same way as `currentAssignments`.
   * This is constant for the lifetime of the process (never mutated).
   */
  defaultAssignments: Record<string, RoomAssignmentEntry>;

  /**
   * List of deviations — entries where `current.roomId !== default.roomId`.
   * Empty array when the live config exactly matches defaults.
   */
  deviations: MappingDeviation[];

  /** True when there is at least one deviation. */
  hasDeviations: boolean;

  /** ISO timestamp of when this snapshot was computed. */
  computedAt: string;

  /** Schema version of the config this snapshot was built from. */
  configSchemaVersion: number;

  // ── Summary counts ────────────────────────────────────────────────
  counts: {
    totalAssignments: number;
    deviatedRoles: number;
    deviatedCapabilities: number;
    deviatedSpecials: number;
    fallbackDeviated: boolean;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function roleKey(role: AgentRole | string): string {
  return role;
}

function capabilityKey(capability: string): string {
  return `cap:${capability}`;
}

function specialKey(entityId: string): string {
  return `special:${entityId}`;
}

const FALLBACK_KEY = "fallback";

// ---------------------------------------------------------------------------
// Core computation functions
// ---------------------------------------------------------------------------

/**
 * Flatten a RoomMappingConfig into a record of RoomAssignmentEntry values.
 *
 * Produces entries for:
 *   - Each role in `roleDefaults`
 *   - Each capability in `capabilityFallbacks`
 *   - Each special entity in `special`
 *   - The global `fallbackRoom`
 */
export function computeAssignments(
  config: RoomMappingConfig,
): Record<string, RoomAssignmentEntry> {
  const result: Record<string, RoomAssignmentEntry> = {};

  // Role entries
  for (const [role, mapping] of Object.entries(config.roleDefaults)) {
    const key = roleKey(role);
    result[key] = {
      key,
      kind: "role",
      roomId: mapping.roomId,
      reason: mapping.reason,
      priority: mapping.priority,
    };
  }

  // Capability entries (ordered)
  for (let i = 0; i < config.capabilityFallbacks.length; i++) {
    const fb = config.capabilityFallbacks[i];
    const key = capabilityKey(fb.capability);
    result[key] = {
      key,
      kind: "capability",
      roomId: fb.roomId,
      reason: fb.reason,
      capabilityIndex: i,
    };
  }

  // Special entity entries
  for (const [entityId, assignment] of Object.entries(config.special)) {
    const key = specialKey(entityId);
    result[key] = {
      key,
      kind: "special",
      roomId: assignment.roomId,
      reason: assignment.reason,
    };
  }

  // Global fallback entry
  result[FALLBACK_KEY] = {
    key: FALLBACK_KEY,
    kind: "fallback",
    roomId: config.fallbackRoom,
    reason: config.fallbackReason,
  };

  return result;
}

/** Cached default assignments — computed once at module load. */
let _defaultAssignmentsCache: Record<string, RoomAssignmentEntry> | null = null;

/**
 * Return the default assignments derived from DEFAULT_ROOM_MAPPING.
 * Result is memoized since defaults never change at runtime.
 */
export function getDefaultAssignments(): Record<string, RoomAssignmentEntry> {
  if (!_defaultAssignmentsCache) {
    _defaultAssignmentsCache = computeAssignments(DEFAULT_ROOM_MAPPING);
  }
  return _defaultAssignmentsCache;
}

/**
 * Compare `current` assignments against `baseline` assignments and return
 * every entry where the room assignment differs.
 *
 * Entries present in `current` but absent in `baseline` are **not** reported
 * as deviations (they are additions). Entries present in `baseline` but absent
 * in `current` are also not reported here (they are removals). Both of these
 * structural changes are visible from the snapshot's assignments map directly.
 *
 * @param current  - Assignments derived from the live config.
 * @param baseline - Assignments to compare against (defaults when omitted).
 */
export function detectDeviations(
  current: Record<string, RoomAssignmentEntry>,
  baseline: Record<string, RoomAssignmentEntry> = getDefaultAssignments(),
): MappingDeviation[] {
  const deviations: MappingDeviation[] = [];

  for (const [key, defaultEntry] of Object.entries(baseline)) {
    const currentEntry = current[key];
    // Entry is absent in current → structural removal; not a "deviation"
    if (!currentEntry) continue;
    // Room is the same → no deviation
    if (currentEntry.roomId === defaultEntry.roomId) continue;

    deviations.push({
      key,
      kind: defaultEntry.kind,
      defaultRoomId: defaultEntry.roomId,
      currentRoomId: currentEntry.roomId,
      label: buildDeviationLabel(key, defaultEntry.kind),
    });
  }

  return deviations;
}

/** Build a human-readable label for a deviation entry. */
function buildDeviationLabel(key: string, kind: AssignmentKind): string {
  switch (kind) {
    case "role":
      return `Role: ${key}`;
    case "capability":
      // key is "cap:<capability>" — strip the prefix
      return `Capability: ${key.replace(/^cap:/, "")}`;
    case "special":
      // key is "special:<entityId>" — strip the prefix
      return `Special: ${key.replace(/^special:/, "")}`;
    case "fallback":
      return "Global fallback room";
  }
}

// ---------------------------------------------------------------------------
// Snapshot builder (primary public API)
// ---------------------------------------------------------------------------

/**
 * Build a complete `RoomMappingSnapshot` for the given live config.
 *
 * This is the primary entry point called by the Zustand store on every mutation
 * and on initial load. The result is stored as `snapshot` in the store so
 * components can subscribe to it reactively.
 *
 * @param config - The current live RoomMappingConfig from the store.
 */
export function buildRoomMappingSnapshot(
  config: RoomMappingConfig,
): RoomMappingSnapshot {
  const currentAssignments = computeAssignments(config);
  const defaultAssignments = getDefaultAssignments();
  const deviations = detectDeviations(currentAssignments, defaultAssignments);

  const deviatedRoles = deviations.filter((d) => d.kind === "role").length;
  const deviatedCapabilities = deviations.filter((d) => d.kind === "capability").length;
  const deviatedSpecials = deviations.filter((d) => d.kind === "special").length;
  const fallbackDeviated = deviations.some((d) => d.kind === "fallback");

  return {
    currentAssignments,
    defaultAssignments,
    deviations,
    hasDeviations: deviations.length > 0,
    computedAt: new Date().toISOString(),
    configSchemaVersion: config.schemaVersion,
    counts: {
      totalAssignments: Object.keys(currentAssignments).length,
      deviatedRoles,
      deviatedCapabilities,
      deviatedSpecials,
      fallbackDeviated,
    },
  };
}

// ---------------------------------------------------------------------------
// Query helpers (consumed by UI components)
// ---------------------------------------------------------------------------

/**
 * Given a roomId, return all keys from `assignments` whose roomId matches.
 * Used to highlight rooms in the 3D scene that have custom assignments.
 */
export function getAssignmentsForRoom(
  roomId: string,
  assignments: Record<string, RoomAssignmentEntry>,
): RoomAssignmentEntry[] {
  return Object.values(assignments).filter((e) => e.roomId === roomId);
}

/**
 * Given a roomId, return all deviations where either `defaultRoomId` or
 * `currentRoomId` is the given room.
 * Used to visually flag rooms involved in deviations.
 */
export function getDeviationsForRoom(
  roomId: string,
  deviations: MappingDeviation[],
): MappingDeviation[] {
  return deviations.filter(
    (d) => d.defaultRoomId === roomId || d.currentRoomId === roomId,
  );
}

/**
 * Return the single RoomAssignmentEntry for a role in the given assignments
 * map. Returns `undefined` if the role is not present.
 */
export function getAssignmentForRole(
  role: string,
  assignments: Record<string, RoomAssignmentEntry>,
): RoomAssignmentEntry | undefined {
  return assignments[roleKey(role)];
}

/**
 * Return the single RoomAssignmentEntry for a capability in the given
 * assignments map. Returns `undefined` if the capability is not present.
 */
export function getAssignmentForCapability(
  capability: string,
  assignments: Record<string, RoomAssignmentEntry>,
): RoomAssignmentEntry | undefined {
  return assignments[capabilityKey(capability)];
}

/**
 * Return all role-kind assignment entries from the given map, sorted by
 * priority (lower = more important).
 */
export function getRoleAssignments(
  assignments: Record<string, RoomAssignmentEntry>,
): RoomAssignmentEntry[] {
  return Object.values(assignments)
    .filter((e) => e.kind === "role")
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

/**
 * Return all capability-kind assignment entries, sorted by their original
 * list position (`capabilityIndex`).
 */
export function getCapabilityAssignments(
  assignments: Record<string, RoomAssignmentEntry>,
): RoomAssignmentEntry[] {
  return Object.values(assignments)
    .filter((e) => e.kind === "capability")
    .sort((a, b) => (a.capabilityIndex ?? 0) - (b.capabilityIndex ?? 0));
}
