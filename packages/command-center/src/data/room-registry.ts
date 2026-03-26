/**
 * room-registry.ts — Consolidated room metadata registry.
 *
 * Parses the .agent/rooms/ directory structure (via the static BUILDING
 * snapshot) and provides a single, unified lookup of every room's:
 *
 *   • Identity   — roomId, name, roomType
 *   • Role hints — which agent roles are assigned here, access policy
 *   • Position hints — 3D coords, dimensions, center, camera preset
 *   • Visual cues — colorAccent, icon
 *   • Agent hints — resident agent IDs + AgentDef references
 *
 * All data is derived from the already-parsed BUILDING constant so this
 * module has zero I/O dependencies and is safe to import anywhere.
 *
 * Schema source: .agent/rooms/_schema.yaml (v1)
 */

import {
  BUILDING,
  type RoomDef,
  type RoomType,
  type CameraPreset,
  type RoomPositionHint,
} from "./building.js";

import {
  DEFAULT_ROOM_MAPPING,
  getRolesForRoom,
  type AgentRole,
  type RoomMappingConfig,
} from "./room-mapping-resolver.js";

import {
  getAgentsForRoom,
  type AgentDef,
} from "./agents.js";

// ── RoomMetadataEntry ───────────────────────────────────────────────

/**
 * The rich, consolidated metadata for a single room.
 *
 * This is the primary data type consumed by:
 *   - 3D scene geometry (positionHint, colorAccent)
 *   - HUD overlays (name, roleHints, agentHints)
 *   - Camera rig (positionHint.cameraPreset)
 *   - Room selection UI (identity, visual)
 */
export interface RoomMetadataEntry {
  // ── Identity ────────────────────────────────────────────────────
  /** Unique room slug (e.g. "ops-control") */
  roomId: string;
  /** Human-readable display name (e.g. "Operations Control") */
  name: string;
  /** Functional room type (control | office | lab | lobby | archive | corridor) */
  roomType: RoomType;
  /** Floor index (0 = ground floor, 1 = operations floor) */
  floor: number;

  // ── Position Hints ──────────────────────────────────────────────
  /**
   * Packed 3D placement data derived from YAML `spatial:` block.
   *
   * Consumers use this to:
   *   - Position the room mesh (positionHint.position)
   *   - Size the room geometry (positionHint.dimensions)
   *   - Target camera transitions (positionHint.center)
   *   - Select default camera angle (positionHint.cameraPreset)
   */
  positionHint: RoomPositionHint;

  // ── Role Hints ──────────────────────────────────────────────────
  /**
   * Agent roles canonically assigned to this room.
   * Derived from `_room-mapping.yaml` role_defaults.
   */
  agentRoles: AgentRole[];
  /**
   * Human-readable description of the room's function.
   * Derived from the YAML `notes:` field.
   */
  roleDescription: string;
  /** Member IDs statically assigned to this room (from YAML `members:`) */
  staticMembers: string[];
  /** Maximum simultaneous occupancy (-1 = unlimited / not specified) */
  maxOccupancy: number;
  /** Access policy governing who can enter */
  accessPolicy: "open" | "members-only" | "approval-required";

  // ── Visual ──────────────────────────────────────────────────────
  /** Hex accent color for room geometry trim and UI highlights */
  colorAccent: string;
  /** Icon identifier string for minimap / HUD labels */
  icon: string;
  /** Default camera preset for this room */
  cameraPreset: CameraPreset;

  // ── Agent Hints ─────────────────────────────────────────────────
  /**
   * AgentDef references for agents whose defaultRoom is this room.
   * Empty for corridor / archive rooms with no resident agents.
   */
  residentAgents: AgentDef[];

  // ── Adjacency ───────────────────────────────────────────────────
  /** Adjacent room IDs (from _building.yaml adjacency graph) */
  adjacentRoomIds: string[];

  // ── Source ──────────────────────────────────────────────────────
  /** Reference to the full RoomDef for cases that need all fields */
  def: RoomDef;
}

// ── RoomRegistry ────────────────────────────────────────────────────

/**
 * Indexed registry mapping roomId → RoomMetadataEntry.
 *
 * Built once at module initialisation time from the BUILDING constant.
 * When the app dynamically loads YAML (via `useRoomLoader`), call
 * `buildRoomRegistry(building)` to rebuild with live data.
 */
export type RoomRegistry = Readonly<Record<string, RoomMetadataEntry>>;

/** Floor-indexed room list — all rooms on a given floor */
export type FloorRoomIndex = Readonly<Record<number, RoomMetadataEntry[]>>;

/** RoomType-indexed room list — all rooms of a given type */
export type TypeRoomIndex = Readonly<Record<RoomType, RoomMetadataEntry[]>>;

// ── Builder ─────────────────────────────────────────────────────────

/**
 * Build a RoomRegistry from a BuildingDef.
 *
 * Merges:
 *   1. Room definitions (from building.rooms)
 *   2. Role mappings (from room-mapping-resolver DEFAULT_ROOM_MAPPING)
 *   3. Agent definitions (from agents.ts)
 *   4. Adjacency graph (from building.adjacency)
 *
 * @param building - BuildingDef to use (defaults to static BUILDING)
 * @param mappingConfig - Room mapping config (defaults to DEFAULT_ROOM_MAPPING)
 */
export function buildRoomRegistry(
  building = BUILDING,
  mappingConfig: RoomMappingConfig = DEFAULT_ROOM_MAPPING,
): RoomRegistry {
  const adjacency = building.adjacency ?? {};
  const registry: Record<string, RoomMetadataEntry> = {};

  for (const def of building.rooms) {
    const roles = getRolesForRoom(def.roomId, mappingConfig);
    const agents = getAgentsForRoom(def.roomId);
    const meta = def._meta;

    registry[def.roomId] = {
      // Identity
      roomId: def.roomId,
      name: def.name,
      roomType: def.roomType,
      floor: def.floor,

      // Position hints
      positionHint: def.positionHint,

      // Role hints
      agentRoles: roles,
      roleDescription: meta?.notes ?? "",
      staticMembers: [...def.members],
      maxOccupancy: meta?.maxOccupancy ?? -1,
      accessPolicy: meta?.accessPolicy ?? "open",

      // Visual
      colorAccent: def.colorAccent,
      icon: def.icon,
      cameraPreset: def.cameraPreset,

      // Agent hints
      residentAgents: agents,

      // Adjacency
      adjacentRoomIds: adjacency[def.roomId] ?? [],

      // Source reference
      def,
    };
  }

  return registry as RoomRegistry;
}

// ── Static Registry (from bundled BUILDING data) ─────────────────────

/**
 * Pre-built static registry.
 *
 * Available immediately at import time — no async I/O required.
 * This is the primary source used by the 3D scene, HUD, and camera rig
 * until the YAML loader replaces it with dynamically-loaded data.
 */
export const ROOM_REGISTRY: RoomRegistry = buildRoomRegistry();

// ── Index Helpers ────────────────────────────────────────────────────

/**
 * Get a RoomMetadataEntry by ID.
 *
 * @returns the entry, or undefined if the room doesn't exist.
 */
export function getRoomMetadata(
  roomId: string,
  registry: RoomRegistry = ROOM_REGISTRY,
): RoomMetadataEntry | undefined {
  return registry[roomId];
}

/**
 * Get all rooms on a specific floor.
 *
 * The stairwell (spans floors 0–1) is included on both floors.
 */
export function getRoomsByFloor(
  floor: number,
  registry: RoomRegistry = ROOM_REGISTRY,
): RoomMetadataEntry[] {
  return Object.values(registry).filter((entry) => {
    if (entry.roomId === "stairwell") return floor === 0 || floor === 1;
    return entry.floor === floor;
  });
}

/**
 * Get all rooms of a specific type.
 */
export function getRoomsByType(
  roomType: RoomType,
  registry: RoomRegistry = ROOM_REGISTRY,
): RoomMetadataEntry[] {
  return Object.values(registry).filter((e) => e.roomType === roomType);
}

/**
 * Get the rooms that a given agent role maps to (usually one).
 */
export function getRoomsForRole(
  role: AgentRole,
  registry: RoomRegistry = ROOM_REGISTRY,
): RoomMetadataEntry[] {
  return Object.values(registry).filter((e) => e.agentRoles.includes(role));
}

/**
 * Get room metadata for an agent by looking up their defaultRoom.
 */
export function getRoomForAgent(
  agentDef: AgentDef,
  registry: RoomRegistry = ROOM_REGISTRY,
): RoomMetadataEntry | undefined {
  return registry[agentDef.defaultRoom];
}

/**
 * Build a floor-indexed lookup: floor → RoomMetadataEntry[].
 */
export function buildFloorIndex(
  registry: RoomRegistry = ROOM_REGISTRY,
): FloorRoomIndex {
  const index: Record<number, RoomMetadataEntry[]> = {};
  for (const entry of Object.values(registry)) {
    const floors =
      entry.roomId === "stairwell" ? [0, 1] : [entry.floor];
    for (const f of floors) {
      if (!index[f]) index[f] = [];
      if (!index[f].includes(entry)) index[f].push(entry);
    }
  }
  return index as FloorRoomIndex;
}

/**
 * Build a type-indexed lookup: roomType → RoomMetadataEntry[].
 */
export function buildTypeIndex(
  registry: RoomRegistry = ROOM_REGISTRY,
): TypeRoomIndex {
  const index: Partial<Record<RoomType, RoomMetadataEntry[]>> = {};
  for (const entry of Object.values(registry)) {
    if (!index[entry.roomType]) index[entry.roomType] = [];
    index[entry.roomType]!.push(entry);
  }
  return index as TypeRoomIndex;
}

/**
 * Derive a human-readable summary of a room's metadata for HUD display.
 */
export function formatRoomSummary(entry: RoomMetadataEntry): string {
  const parts: string[] = [];
  parts.push(`[${entry.roomType.toUpperCase()}] ${entry.name}`);
  if (entry.agentRoles.length > 0) {
    parts.push(`Roles: ${entry.agentRoles.join(", ")}`);
  }
  if (entry.residentAgents.length > 0) {
    parts.push(`Agents: ${entry.residentAgents.map((a) => a.name).join(", ")}`);
  }
  parts.push(
    `Floor ${entry.floor} @ (${entry.positionHint.center.x.toFixed(1)}, ${entry.positionHint.center.z.toFixed(1)})`,
  );
  return parts.join(" | ");
}

/**
 * Get position hints only — used by layout engines and camera rig.
 *
 * Returns a map of roomId → positionHint for all rooms.
 */
export function getAllPositionHints(
  registry: RoomRegistry = ROOM_REGISTRY,
): Readonly<Record<string, RoomPositionHint>> {
  const hints: Record<string, RoomPositionHint> = {};
  for (const [id, entry] of Object.entries(registry)) {
    hints[id] = entry.positionHint;
  }
  return hints;
}

/**
 * Validate that all rooms in the registry have valid position hints.
 * Returns a list of validation errors (empty if all valid).
 */
export function validateRoomRegistry(registry: RoomRegistry = ROOM_REGISTRY): string[] {
  const errors: string[] = [];
  const VALID_ROOM_TYPES: RoomType[] = ["control", "office", "lab", "lobby", "archive", "corridor"];
  const VALID_CAMERA_PRESETS: CameraPreset[] = ["overhead", "isometric", "close-up"];

  for (const entry of Object.values(registry)) {
    const prefix = `[${entry.roomId}]`;

    // Required identity fields
    if (!entry.roomId) errors.push(`${prefix} missing roomId`);
    if (!entry.name) errors.push(`${prefix} missing name`);
    if (!VALID_ROOM_TYPES.includes(entry.roomType)) {
      errors.push(`${prefix} invalid roomType: "${entry.roomType}"`);
    }

    // Position hint validation
    const ph = entry.positionHint;
    if (!ph) {
      errors.push(`${prefix} missing positionHint`);
    } else {
      if (typeof ph.position.x !== "number") errors.push(`${prefix} positionHint.position.x is not a number`);
      if (typeof ph.position.y !== "number") errors.push(`${prefix} positionHint.position.y is not a number`);
      if (typeof ph.position.z !== "number") errors.push(`${prefix} positionHint.position.z is not a number`);
      if (typeof ph.dimensions.x !== "number" || ph.dimensions.x <= 0) {
        errors.push(`${prefix} positionHint.dimensions.x must be > 0`);
      }
      if (typeof ph.dimensions.y !== "number" || ph.dimensions.y <= 0) {
        errors.push(`${prefix} positionHint.dimensions.y must be > 0`);
      }
      if (typeof ph.dimensions.z !== "number" || ph.dimensions.z <= 0) {
        errors.push(`${prefix} positionHint.dimensions.z must be > 0`);
      }
      if (!VALID_CAMERA_PRESETS.includes(ph.cameraPreset)) {
        errors.push(`${prefix} invalid cameraPreset: "${ph.cameraPreset}"`);
      }
    }
  }

  return errors;
}
