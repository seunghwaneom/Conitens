/**
 * room-manifest-loader.ts — Normalised in-memory room manifest loader.
 *
 * Sub-AC 2: Reads and parses .agent/rooms/ directory entries into a
 * normalised in-memory room manifest containing, for each room:
 *   - name       — human-readable display label
 *   - primaryRoles — agent roles canonically mapped to the room
 *   - metadata   — spatial, membership, and policy data
 *
 * Two entry-points are provided:
 *
 *   loadRoomManifestFromDir(roomsDir)
 *     Node.js / Electron main-process path — reads YAML files from the
 *     .agent/rooms/ directory on disk using synchronous fs APIs.
 *     Safe to call from CLI tools, tests, and Electron preload scripts.
 *
 *   buildRoomManifest(buildingYaml, roomYamls, mappingYaml)
 *     Pure function — accepts raw YAML strings already loaded by the
 *     caller.  Used by the browser (where fs is unavailable) and in
 *     unit tests that want full control of the input.
 *
 * The manifest is intentionally flat — every entry is self-contained and
 * requires no cross-file lookups.  All derivable data (centres, role lists)
 * is pre-computed so consumers can render and query without extra work.
 *
 * Config sources (relative to the monorepo root):
 *   .agent/rooms/_building.yaml      — building id, name, style
 *   .agent/rooms/_room-mapping.yaml  — role → room assignments
 *   .agent/rooms/*.yaml              — individual room definitions
 *
 * Schema version: this file tracks MANIFEST_SCHEMA_VERSION.  Increment
 * when a breaking change is made to RoomManifestEntry or RoomManifest.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  parseBuildingYaml,
  parseRoomYaml,
  parseRoomMappingYaml,
} from "./room-loader.js";

import {
  getRolesForRoom,
  DEFAULT_ROOM_MAPPING,
} from "./room-mapping-resolver.js";

import {
  DEFAULT_ROOM_CONFIG,
  type RoomConfigEntry,
} from "./room-config-schema.js";

import type { RoomType, CameraPreset, Vec3 } from "./building.js";
import type { AgentRole } from "./room-mapping-resolver.js";

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

/**
 * Current schema version for the room manifest.
 *
 * Consumers should compare `manifest.schemaVersion` against this constant
 * before using the manifest.  A mismatch signals that the loader or the
 * YAML sources have drifted from each other.
 */
export const MANIFEST_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Spatial placement information extracted from a room's `spatial:` block.
 *
 * All values are in grid units (1 grid unit = 1 Three.js world unit).
 */
export interface RoomManifestSpatial {
  /** Grid-space origin of the room (x = column, y = floor × 3, z = row) */
  position: Vec3;
  /** Room extents (x = width, y = height, z = depth) */
  dimensions: Vec3;
  /**
   * Pre-computed geometric centre of the room.
   * Equals `position + dimensions / 2` for each axis.
   */
  center: Vec3;
  /** Default camera angle when the operator navigates into this room */
  cameraPreset: CameraPreset;
  /** Hex accent colour for geometry trim and UI highlights */
  colorAccent: string;
  /** Icon identifier for minimap labels and diegetic nameplates */
  icon: string;
}

/**
 * Extended metadata fields parsed from the room YAML `_meta` block.
 *
 * All fields have safe defaults so callers never need to null-check.
 */
export interface RoomManifestMeta {
  /** Freeform description of the room's function (from `notes:`) */
  notes: string;
  /** Classification tags for filtering and categorisation (from `tags:`) */
  tags: string[];
  /** Files visible to room members (from `shared_files:`) */
  sharedFiles: string[];
  /** Maximum simultaneous occupants (-1 = unlimited / not specified) */
  maxOccupancy: number;
  /** Access policy governing entry */
  accessPolicy: "open" | "members-only" | "approval-required";
  /** Summarisation density for diegetic HUD panels */
  summaryMode: "concise" | "verbose" | "silent";
}

/**
 * Single normalised room entry in the manifest.
 *
 * Every field is flattened — no nested BuildingDef / RoomDef references —
 * so the entry is fully self-describing and safe to serialize as JSON.
 *
 * Three groups of fields map directly to the AC requirement:
 *
 *   name         → RoomManifestEntry.name
 *   role(s)      → RoomManifestEntry.primaryRoles
 *   metadata     → RoomManifestEntry.meta  (+ spatial + members)
 */
export interface RoomManifestEntry {
  // ── Identity ────────────────────────────────────────────────────────────
  /** Unique room slug (e.g. "ops-control") */
  roomId: string;
  /** Human-readable display name (e.g. "Operations Control") */
  name: string;
  /** Functional room type */
  roomType: RoomType;
  /** Zero-indexed floor within the building */
  floor: number;

  // ── Role ────────────────────────────────────────────────────────────────
  /**
   * Agent roles canonically mapped to this room.
   *
   * Derived from `_room-mapping.yaml` role_defaults.  For rooms that have
   * no role mapping (e.g. corridors) the list is empty.
   *
   * Example: ops-control → ["orchestrator", "planner"]
   */
  primaryRoles: AgentRole[];

  // ── Static membership ───────────────────────────────────────────────────
  /**
   * Member IDs hard-coded in the room YAML (from `members:`).
   * May include agent IDs ("implementer-subagent") and special entities
   * ("USER", "SYSTEM").
   */
  members: string[];

  // ── Spatial metadata ────────────────────────────────────────────────────
  /** 3-D placement data — position, dimensions, centre, camera, colour, icon */
  spatial: RoomManifestSpatial;

  // ── Extended metadata ───────────────────────────────────────────────────
  /** Policy and descriptive metadata from the YAML definition */
  meta: RoomManifestMeta;
}

/**
 * Normalised in-memory manifest for all rooms in .agent/rooms/.
 *
 * Produced by `loadRoomManifestFromDir` (filesystem) or `buildRoomManifest`
 * (pure / browser).  The `rooms` array is ordered by floor index, then by
 * the order the room files appear in the _building.yaml floor plan.
 */
export interface RoomManifest {
  /** Schema version — compare against MANIFEST_SCHEMA_VERSION */
  schemaVersion: number;
  /** ISO 8601 timestamp of when the manifest was assembled */
  loadedAt: string;
  /** Building identifier (from _building.yaml) */
  buildingId: string;
  /** Human-readable building name (from _building.yaml) */
  buildingName: string;
  /** Visual style tag (e.g. "low-poly-dark") */
  buildingStyle: string;
  /** All rooms, normalised and flattened */
  rooms: RoomManifestEntry[];
}

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

/**
 * Build a RoomManifest from pre-loaded YAML strings.
 *
 * This is the testable, browser-safe, pure-function core of the loader.
 * It delegates all YAML parsing to the existing `room-loader.ts` helpers
 * and the role-resolution to `room-mapping-resolver.ts`.
 *
 * @param buildingYaml  Contents of _building.yaml
 * @param roomYamls     Map of filename → YAML content (non-underscore files)
 * @param mappingYaml   Contents of _room-mapping.yaml
 * @returns             Normalised RoomManifest
 */
export function buildRoomManifest(
  buildingYaml: string,
  roomYamls: Record<string, string>,
  mappingYaml: string,
): RoomManifest {
  // Parse building metadata (floors, adjacency, visual defaults)
  const building = parseBuildingYaml(buildingYaml);

  // Parse role → room mapping
  const mapping = parseRoomMappingYaml(mappingYaml);

  // Parse each individual room file into a RoomDef, skipping unparseable files
  const roomDefs = new Map<string, ReturnType<typeof parseRoomYaml>>();
  for (const [filename, yaml] of Object.entries(roomYamls)) {
    if (filename.startsWith("_")) continue;          // meta files — skip
    if (!filename.endsWith(".yaml") && !filename.endsWith(".yml")) continue;

    try {
      const def = parseRoomYaml(yaml);
      roomDefs.set(def.roomId, def);
    } catch (err) {
      console.warn(`[room-manifest-loader] Failed to parse ${filename}:`, err);
    }
  }

  // Produce normalised manifest entries, preserving floor-plan ordering
  // where possible.  Any room found in the YAML files but not in the floor
  // plan is appended at the end.
  const orderedRoomIds: string[] = [];
  for (const floorDef of building.floors) {
    for (const roomId of floorDef.roomIds) {
      if (!orderedRoomIds.includes(roomId)) {
        orderedRoomIds.push(roomId);
      }
    }
  }
  // Append rooms present in YAML but not in the floor plan (graceful extension)
  for (const roomId of roomDefs.keys()) {
    if (!orderedRoomIds.includes(roomId)) {
      orderedRoomIds.push(roomId);
    }
  }

  const rooms: RoomManifestEntry[] = [];
  for (const roomId of orderedRoomIds) {
    const def = roomDefs.get(roomId);
    if (!def) continue;            // floor plan references a non-existent YAML — skip

    const primaryRoles = getRolesForRoom(roomId, mapping);

    const spatial: RoomManifestSpatial = {
      position: { ...def.positionHint.position },
      dimensions: { ...def.positionHint.dimensions },
      center: { ...def.positionHint.center },
      cameraPreset: def.cameraPreset,
      colorAccent: def.colorAccent,
      icon: def.icon,
    };

    const meta: RoomManifestMeta = {
      notes: def._meta?.notes ?? "",
      tags: def._meta?.tags ?? [],
      sharedFiles: def._meta?.sharedFiles ?? [],
      maxOccupancy: def._meta?.maxOccupancy ?? -1,
      accessPolicy: def._meta?.accessPolicy ?? "open",
      summaryMode: def._meta?.summaryMode ?? "concise",
    };

    rooms.push({
      roomId: def.roomId,
      name: def.name,
      roomType: def.roomType,
      floor: def.floor,
      primaryRoles,
      members: [...def.members],
      spatial,
      meta,
    });
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    loadedAt: new Date().toISOString(),
    buildingId: building.buildingId,
    buildingName: building.name,
    buildingStyle: building.style,
    rooms,
  };
}

// ---------------------------------------------------------------------------
// Filesystem loader (Node.js / Electron)
// ---------------------------------------------------------------------------

/**
 * Load the room manifest by reading all YAML files in a directory.
 *
 * Intended for:
 *   - Electron main process (reads the working project's .agent/rooms/)
 *   - CLI tools (e.g. `conitens doctor`)
 *   - Vitest integration tests (reads real files from disk)
 *
 * The function is synchronous so callers can use the manifest immediately
 * without async/await ceremony.  If reading or parsing a room file fails,
 * a warning is logged and that room is excluded from the manifest.
 *
 * @param roomsDir  Absolute path to the .agent/rooms/ directory
 * @returns         Normalised RoomManifest
 * @throws          If _building.yaml or _room-mapping.yaml cannot be read
 */
export function loadRoomManifestFromDir(roomsDir: string): RoomManifest {
  // ── Read required meta-files ──────────────────────────────────────────────
  const buildingPath = join(roomsDir, "_building.yaml");
  const mappingPath  = join(roomsDir, "_room-mapping.yaml");

  const buildingYaml = readFileSync(buildingPath, "utf-8");
  const mappingYaml  = readFileSync(mappingPath, "utf-8");

  // ── Discover and read room files ──────────────────────────────────────────
  const allFiles = readdirSync(roomsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  const roomYamls: Record<string, string> = {};
  for (const filename of allFiles) {
    if (filename.startsWith("_")) continue;           // skip meta files

    try {
      roomYamls[filename] = readFileSync(join(roomsDir, filename), "utf-8");
    } catch (err) {
      console.warn(`[room-manifest-loader] Could not read ${filename}:`, err);
    }
  }

  // ── Delegate to the pure builder ─────────────────────────────────────────
  return buildRoomManifest(buildingYaml, roomYamls, mappingYaml);
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Look up a single room entry by roomId.
 *
 * @returns The entry, or undefined if the room is not in the manifest.
 */
export function getManifestEntry(
  roomId: string,
  manifest: RoomManifest,
): RoomManifestEntry | undefined {
  return manifest.rooms.find((r) => r.roomId === roomId);
}

/**
 * Get all rooms on a specific floor.
 *
 * Note: the stairwell spans floors 0–1.  It is returned for both floor 0
 * and floor 1 to maintain consistency with the rest of the data layer.
 */
export function getManifestRoomsForFloor(
  floor: number,
  manifest: RoomManifest,
): RoomManifestEntry[] {
  return manifest.rooms.filter((r) => {
    if (r.roomId === "stairwell") return floor === 0 || floor === 1;
    return r.floor === floor;
  });
}

/**
 * Get all rooms whose primaryRoles includes the given role.
 */
export function getManifestRoomsForRole(
  role: AgentRole,
  manifest: RoomManifest,
): RoomManifestEntry[] {
  return manifest.rooms.filter((r) => r.primaryRoles.includes(role));
}

/**
 * Get all rooms of a specific type.
 */
export function getManifestRoomsByType(
  roomType: RoomType,
  manifest: RoomManifest,
): RoomManifestEntry[] {
  return manifest.rooms.filter((r) => r.roomType === roomType);
}

/**
 * Build a roomId → RoomManifestEntry index for O(1) lookups.
 */
export function buildManifestIndex(
  manifest: RoomManifest,
): Readonly<Record<string, RoomManifestEntry>> {
  const index: Record<string, RoomManifestEntry> = {};
  for (const entry of manifest.rooms) {
    index[entry.roomId] = entry;
  }
  return index;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Result of validating a RoomManifest.
 */
export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a RoomManifest for structural completeness.
 *
 * Checks:
 *   1. schemaVersion matches MANIFEST_SCHEMA_VERSION
 *   2. buildingId and buildingName are non-empty
 *   3. rooms array is non-empty
 *   4. Every room has non-empty roomId and name
 *   5. Every room's spatial dimensions are positive
 *   6. No duplicate roomIds
 *   7. Corridor rooms have no primaryRoles (warning, not error)
 */
export function validateManifest(
  manifest: RoomManifest,
): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Schema version
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion mismatch: expected ${MANIFEST_SCHEMA_VERSION}, got ${manifest.schemaVersion}`,
    );
  }

  // 2. Required top-level fields
  if (!manifest.buildingId) errors.push("manifest.buildingId is empty");
  if (!manifest.buildingName) errors.push("manifest.buildingName is empty");

  // 3. Non-empty rooms
  if (manifest.rooms.length === 0) {
    errors.push("manifest.rooms is empty — no rooms were loaded");
  }

  const seenIds = new Set<string>();

  for (const room of manifest.rooms) {
    const prefix = `[${room.roomId || "<missing-id>"}]`;

    // 4. Required string fields
    if (!room.roomId) errors.push(`${prefix} missing roomId`);
    if (!room.name)   errors.push(`${prefix} missing name`);

    // 5. Positive dimensions
    const d = room.spatial?.dimensions;
    if (!d) {
      errors.push(`${prefix} missing spatial.dimensions`);
    } else {
      if (d.x <= 0) errors.push(`${prefix} spatial.dimensions.x must be > 0`);
      if (d.y <= 0) errors.push(`${prefix} spatial.dimensions.y must be > 0`);
      if (d.z <= 0) errors.push(`${prefix} spatial.dimensions.z must be > 0`);
    }

    // 6. Duplicate roomIds
    if (seenIds.has(room.roomId)) {
      errors.push(`Duplicate roomId: "${room.roomId}"`);
    } else {
      seenIds.add(room.roomId);
    }

    // 7. Corridor rooms typically have no role mappings
    if (room.roomType === "corridor" && room.primaryRoles.length > 0) {
      warnings.push(
        `${prefix} corridor room has primaryRoles: [${room.primaryRoles.join(", ")}] — ` +
        "corridors are usually role-free",
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// RoomDescriptor — flat type with explicit roleLabel (Sub-AC 2)
// ---------------------------------------------------------------------------

/**
 * Flat, self-contained descriptor for a single room.
 *
 * Produced by `loadRoomDefinitions()` — the primary Sub-AC 2 entry-point.
 *
 * The `roleLabel` field carries a concise, human-readable description of the
 * primary role(s) assigned to the room.  For rooms with no role mapping (e.g.
 * corridors), the label falls back to the `roomType` string so every descriptor
 * always has a non-empty `roleLabel`.
 *
 * Examples:
 *   ops-control      → roleLabel: "orchestrator / planner"
 *   impl-office      → roleLabel: "implementer"
 *   research-lab     → roleLabel: "researcher / analyst"
 *   corridor-main    → roleLabel: "corridor"   (room-type fallback)
 *   archive-vault    → roleLabel: "archive"    (room-type fallback)
 */
export interface RoomDescriptor {
  // ── Identity ──────────────────────────────────────────────────────────────
  /** Unique room slug (e.g. "ops-control") */
  roomId: string;
  /** Human-readable display name (e.g. "Operations Control") */
  name: string;
  /** Functional room type */
  roomType: RoomType;
  /** Zero-indexed floor within the building */
  floor: number;

  // ── Role ──────────────────────────────────────────────────────────────────
  /**
   * Human-readable role label for this room.
   *
   * Derived from the `primaryRoles` list:
   *   - If one role:   "implementer"
   *   - If multiple:   "orchestrator / planner"
   *   - If none:       the `roomType` string (e.g. "corridor", "archive")
   *
   * Always non-empty.
   */
  roleLabel: string;

  /**
   * Agent roles canonically assigned to this room (raw list).
   * May be empty for corridor / archive rooms.
   */
  primaryRoles: AgentRole[];

  // ── Membership ────────────────────────────────────────────────────────────
  /** Static member IDs from the room YAML `members:` list */
  members: string[];

  // ── Spatial summary ───────────────────────────────────────────────────────
  /** Hex accent colour for geometry trim and UI highlights */
  colorAccent: string;
  /** Icon identifier for minimap labels and diegetic nameplates */
  icon: string;
  /** Default camera preset when the operator navigates into this room */
  cameraPreset: CameraPreset;

  // ── Source ────────────────────────────────────────────────────────────────
  /**
   * Where this descriptor was loaded from.
   *   "yaml"    — read from .agent/rooms/ on disk
   *   "default" — from the hardcoded DEFAULT_ROOM_CONFIG fallback
   */
  source: "yaml" | "default";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable role label from a list of AgentRole strings.
 *
 * @param roles     - Primary roles assigned to the room
 * @param fallback  - Value to use when roles is empty (typically roomType)
 */
export function deriveRoleLabel(roles: AgentRole[], fallback: string): string {
  if (roles.length === 0) return fallback;
  return roles.join(" / ");
}

/**
 * Convert a `RoomManifestEntry` (from disk YAML) to a `RoomDescriptor`.
 *
 * @internal  Used by `loadRoomDefinitions`.
 */
function manifestEntryToDescriptor(entry: RoomManifestEntry): RoomDescriptor {
  return {
    roomId: entry.roomId,
    name: entry.name,
    roomType: entry.roomType,
    floor: entry.floor,
    roleLabel: deriveRoleLabel(entry.primaryRoles, entry.roomType),
    primaryRoles: entry.primaryRoles,
    members: entry.members,
    colorAccent: entry.spatial.colorAccent,
    icon: entry.spatial.icon,
    cameraPreset: entry.spatial.cameraPreset,
    source: "yaml",
  };
}

/**
 * Convert a `RoomConfigEntry` (from the hardcoded DEFAULT_ROOM_CONFIG) to a
 * `RoomDescriptor`.
 *
 * Role labels are derived from DEFAULT_ROOM_MAPPING so the fallback descriptors
 * carry the same role information as the YAML-loaded ones.
 *
 * @internal  Used by `loadRoomDefinitions`.
 */
function configEntryToDescriptor(entry: RoomConfigEntry): RoomDescriptor {
  const primaryRoles = getRolesForRoom(entry.roomId, DEFAULT_ROOM_MAPPING);
  return {
    roomId: entry.roomId,
    name: entry.name,
    roomType: entry.roomType as RoomType,
    floor: entry.hierarchyPosition.floor,
    roleLabel: deriveRoleLabel(primaryRoles, entry.roomType),
    primaryRoles,
    members: [...entry.members],
    colorAccent: entry.placement.colorAccent,
    icon: entry.placement.icon,
    cameraPreset: entry.placement.cameraPreset as CameraPreset,
    source: "default",
  };
}

// ---------------------------------------------------------------------------
// loadRoomDefinitions — Sub-AC 2 primary entry-point
// ---------------------------------------------------------------------------

/**
 * Load room definitions, returning a flat list of `RoomDescriptor` objects
 * each carrying a `roleLabel`.
 *
 * Sub-AC 2 entry-point.  Loading strategy:
 *   1. If `roomsDir` is provided and the directory contains both
 *      `_building.yaml` and `_room-mapping.yaml`, read and parse all room
 *      YAML files using `loadRoomManifestFromDir`.
 *   2. Otherwise — directory absent, files unreadable, or parse error —
 *      fall back to the hardcoded `DEFAULT_ROOM_CONFIG` constant.
 *
 * The `source` field on each returned `RoomDescriptor` indicates which path
 * was taken: `"yaml"` (disk) or `"default"` (hardcoded fallback).
 *
 * @param roomsDir  Optional absolute path to the `.agent/rooms/` directory.
 *                  When omitted the function always returns the hardcoded
 *                  fallback data (useful in browser / test environments).
 * @returns         Ordered list of `RoomDescriptor` objects, one per room.
 */
export function loadRoomDefinitions(roomsDir?: string): RoomDescriptor[] {
  // ── Strategy 1: filesystem load ──────────────────────────────────────────
  if (roomsDir) {
    const buildingPath = join(roomsDir, "_building.yaml");
    const mappingPath  = join(roomsDir, "_room-mapping.yaml");

    if (existsSync(buildingPath) && existsSync(mappingPath)) {
      try {
        const manifest = loadRoomManifestFromDir(roomsDir);
        return manifest.rooms.map(manifestEntryToDescriptor);
      } catch (err) {
        console.warn(
          "[room-manifest-loader] loadRoomDefinitions: filesystem load failed, " +
          "falling back to hardcoded defaults.",
          err,
        );
      }
    } else {
      console.info(
        "[room-manifest-loader] loadRoomDefinitions: .agent/rooms/ not present " +
        `at '${roomsDir}', using hardcoded defaults.`,
      );
    }
  }

  // ── Strategy 2: hardcoded DEFAULT_ROOM_CONFIG fallback ───────────────────
  return DEFAULT_ROOM_CONFIG.rooms.map((entry) =>
    configEntryToDescriptor(entry as RoomConfigEntry),
  );
}
