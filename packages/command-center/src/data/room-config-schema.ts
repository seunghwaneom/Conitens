/**
 * room-config-schema.ts — Versioned default room mapping configuration schema.
 *
 * Sub-AC 12a: Defines and implements the default room mapping configuration
 * schema — including room ID, name, type, hierarchy position, and 3D placement
 * metadata — stored as a versioned constant that the system loads on
 * initialization.
 *
 * Design principles:
 *   - Single source of truth for all room spatial + hierarchical metadata.
 *   - Schema-versioned: every config object carries `schemaVersion` so
 *     loaders can detect breaking changes and migrate gracefully.
 *   - Zero I/O on import: the default config is a static constant safe to
 *     import from any module without async ceremony.
 *   - Reflexive: the schema models itself — RoomConfigType includes "pipeline"
 *     for the automation pipeline viewer and "agent" for dedicated agent workspaces,
 *     plus all legacy types carried forward from building.ts.
 *
 * Config source: .agent/rooms/ YAML files (schema v1)
 *
 * Coordinate system (inherited from building.ts):
 *   x = left-right (width)   y = up-down (floor height)   z = front-back (depth)
 * 1 grid cell = 1 Three.js world unit.
 */

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

/**
 * Current schema version for the room mapping configuration.
 *
 * Increment this when making breaking changes to RoomConfigEntry,
 * RoomHierarchyPosition, or RoomPlacementMetadata.
 *
 * The loader checks `config.schemaVersion === ROOM_CONFIG_SCHEMA_VERSION`
 * before using the config; a mismatch triggers a migration or fallback.
 */
export const ROOM_CONFIG_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Room types
// ---------------------------------------------------------------------------

/**
 * Functional room type — governs how the 3D scene renders the room,
 * which roles are expected to occupy it, and what HUD panels are shown.
 *
 * Extends the legacy RoomType from building.ts with two new types:
 *   - "pipeline"  Room dedicated to visualising / controlling automation pipelines.
 *                 Renders with data-flow connectors and step-progress indicators.
 *   - "agent"     Dedicated single-agent workspace — more focused than "office".
 *                 Used when a room hosts exactly one agent persona in isolation.
 */
export type RoomConfigType =
  | "control"    // Primary command & orchestration room  (e.g. ops-control)
  | "office"     // Focused multi-agent work area         (e.g. impl-office)
  | "lab"        // Research & experimentation space      (e.g. research-lab)
  | "lobby"      // Entry point, user-facing overview     (e.g. project-main)
  | "archive"    // Read-only, historical data / replay   (e.g. archive-vault)
  | "corridor"   // Spatial connector (no resident agents)(e.g. corridor-main)
  | "pipeline"   // Automation pipeline visualisation room (new in schema v1)
  | "agent";     // Dedicated single-agent workspace       (new in schema v1)

/** All valid room types — useful for exhaustive validation loops */
export const ROOM_CONFIG_TYPES: readonly RoomConfigType[] = [
  "control",
  "office",
  "lab",
  "lobby",
  "archive",
  "corridor",
  "pipeline",
  "agent",
] as const;

/** Camera presets — matched to _schema.yaml camera_preset enum */
export type RoomCameraPreset = "overhead" | "isometric" | "close-up";

/** All valid camera presets */
export const ROOM_CAMERA_PRESETS: readonly RoomCameraPreset[] = [
  "overhead",
  "isometric",
  "close-up",
] as const;

// ---------------------------------------------------------------------------
// Hierarchy position
// ---------------------------------------------------------------------------

/**
 * Position of a room within the building hierarchy.
 *
 * Encodes not just the floor but the room's index within that floor,
 * its depth in any nesting structure, and adjacency context.
 *
 * Used by:
 *   - Navigation breadcrumbs (floor → room path)
 *   - Camera rig transitions (floor-aware animation)
 *   - Procedural layout (fallback placement priority)
 *   - Self-improvement analysis (structural coverage metrics)
 */
export interface RoomHierarchyPosition {
  /**
   * 0-indexed floor in the building.
   *   0 = Ground Floor   (lobby, archive, stairwell)
   *   1 = Operations Floor (all agent workrooms)
   */
  floor: number;

  /**
   * Sort index within the floor (0 = first room listed in the floor plan).
   * Determines render order and tab order in floor-level HUD panels.
   */
  floorIndex: number;

  /**
   * Optional parent room ID for nested / sub-rooms.
   * `undefined` means the room is a top-level room on its floor.
   *
   * Example: a breakout alcove inside ops-control would have
   * `parentRoomId: "ops-control"`.
   */
  parentRoomId?: string;

  /**
   * Depth in the hierarchy tree.
   *   0 = top-level room on a floor
   *   1 = room nested inside another room
   *   2 = room nested two levels deep (rare; reserved for future use)
   */
  hierarchyDepth: number;

  /**
   * Whether this room is directly accessible from the main corridor
   * (corridor-main on floor 1, project-main lobby on floor 0).
   * Used for wayfinding and door-placement heuristics.
   */
  isMainCorridorAccessible: boolean;

  /**
   * Adjacent room IDs (copied from _building.yaml adjacency graph).
   * Stored here for quick lookup without importing the full building config.
   */
  adjacentRoomIds: string[];
}

// ---------------------------------------------------------------------------
// 3D placement metadata
// ---------------------------------------------------------------------------

/**
 * All spatial data needed to place and orient a room in the 3D scene.
 *
 * Mirrors the `spatial:` block in individual room YAML files and the
 * `positionHint` field on RoomDef in building.ts — but expressed as a
 * first-class config structure so it can be version-controlled and
 * validated independently.
 */
export interface RoomPlacementMetadata {
  /**
   * Grid-space origin of the room.
   *   x = column on the floor grid
   *   y = floor * floorHeight (3 units per floor)
   *   z = row on the floor grid
   */
  position: { x: number; y: number; z: number };

  /**
   * Room extents in grid units.
   *   x = width (columns)   y = height (floor-to-ceiling)   z = depth (rows)
   */
  dimensions: { x: number; y: number; z: number };

  /**
   * Computed world-space centre of the room.
   * Pre-computed as `position + dimensions/2` so consumers don't need
   * to recompute it on every render frame.
   */
  center: { x: number; y: number; z: number };

  /** Default camera preset when the player navigates into this room */
  cameraPreset: RoomCameraPreset;

  /**
   * Hex colour for room geometry accent trim, HUD highlights, and
   * glow emissive on the room mesh edges.
   */
  colorAccent: string;

  /**
   * Icon identifier string for minimap labels, breadcrumb chips,
   * and diegetic room-nameplate meshes.
   */
  icon: string;
}

// ---------------------------------------------------------------------------
// Room config entry
// ---------------------------------------------------------------------------

/**
 * Complete definition of a single room in the versioned config.
 *
 * Combines all fields required by Sub-AC 12a:
 *   - Identity      (roomId, name, roomType)
 *   - Hierarchy     (hierarchyPosition)
 *   - Placement     (placement — 3D metadata)
 *   - Membership    (members, tags)
 */
export interface RoomConfigEntry {
  // ── Identity ──────────────────────────────────────────────────────────
  /** Unique room identifier — kebab-case slug (e.g. "ops-control") */
  roomId: string;
  /** Human-readable display name (e.g. "Operations Control") */
  name: string;
  /** Functional room type */
  roomType: RoomConfigType;

  // ── Hierarchy ─────────────────────────────────────────────────────────
  /**
   * Position of this room within the building hierarchy.
   * Encodes floor, index-within-floor, nesting depth, and adjacency.
   */
  hierarchyPosition: RoomHierarchyPosition;

  // ── 3D Placement ──────────────────────────────────────────────────────
  /**
   * All spatial data required to render and navigate to this room.
   * Passed verbatim to the Three.js scene graph.
   */
  placement: RoomPlacementMetadata;

  // ── Membership ────────────────────────────────────────────────────────
  /**
   * Static member IDs for this room.
   * May contain agent IDs (e.g. "implementer-subagent") or special
   * entities (e.g. "USER", "SYSTEM").
   */
  members: string[];

  /**
   * Freeform tags for filtering and categorisation.
   * Examples: ["primary", "agent-workspace", "read-only"]
   */
  tags: string[];

  // ── Optional metadata ─────────────────────────────────────────────────
  /** Maximum simultaneous occupants (-1 = unlimited) */
  maxOccupancy?: number;

  /** Access policy for room entry */
  accessPolicy?: "open" | "members-only" | "approval-required";

  /** Summarisation mode for diegetic panels */
  summaryMode?: "concise" | "verbose" | "silent";
}

// ---------------------------------------------------------------------------
// Versioned config container
// ---------------------------------------------------------------------------

/**
 * Top-level versioned room mapping configuration.
 *
 * This is the structure stored to disk (or loaded from YAML) and consumed
 * by the 3D scene, HUD, camera rig, and navigation breadcrumbs.
 *
 * Version-stamped so the loader can detect schema drift:
 *   `if (config.schemaVersion !== ROOM_CONFIG_SCHEMA_VERSION) { migrate(); }`
 */
export interface VersionedRoomMappingConfig {
  /**
   * Schema version.
   * Increment when a breaking change is made to RoomConfigEntry or
   * any of its sub-types.
   */
  schemaVersion: number;

  /**
   * ISO 8601 timestamp of the last time this config was generated /
   * committed.  Used by the self-improvement pipeline to detect stale
   * configs.
   */
  configuredAt: string;

  /** Building ID this config applies to (matches _building.yaml building_id) */
  buildingId: string;

  /** Human-readable building name */
  buildingName: string;

  /** Complete ordered list of room definitions */
  rooms: RoomConfigEntry[];
}

// ---------------------------------------------------------------------------
// Room type visual/behavioral defaults mapping
// ---------------------------------------------------------------------------

/**
 * Visual and behavioral properties derived from a room's functional type.
 *
 * These defaults are used during initial scene construction when a room is
 * created without explicit visual overrides — e.g. when procedurally building
 * a floor plan from a manifest that only specifies `roomType`.
 *
 * All fields are overridable at the room level via `RoomConfigEntry.placement`.
 */
export interface RoomTypeVisualProps {
  /**
   * Default hex accent colour for geometry trim, glow emissive, and HUD
   * highlights.  Chosen to give each room type a visually distinct identity
   * in the low-poly dark command-center theme.
   */
  colorAccent: string;

  /**
   * Default icon identifier for minimap labels, breadcrumb chips, and
   * diegetic room-nameplate meshes.
   */
  icon: string;

  /**
   * Default camera preset when the player navigates into any room of this type.
   * Individual rooms can override via `placement.cameraPreset`.
   */
  defaultCameraPreset: RoomCameraPreset;

  /**
   * Default maximum simultaneous occupancy.
   *  -1  = unlimited / not capped
   *   0  = spatial-only (no agents — e.g. corridor)
   *   N  = explicit agent capacity
   */
  defaultCapacity: number;

  /**
   * Default access policy for rooms of this type.
   */
  defaultAccessPolicy: "open" | "members-only" | "approval-required";

  /**
   * Default summary mode for diegetic panels inside rooms of this type.
   */
  defaultSummaryMode: "concise" | "verbose" | "silent";

  /**
   * Human-readable description of the room type's purpose and behavioral role
   * in the 3D command-center world.  Used by HUD tooltips and the ontology
   * schema reader's behavioral contracts.
   */
  behaviorDescription: string;

  /**
   * Whether this room type is expected to have resident agents.
   * Corridors and multi-floor connectors are spatial-only (false).
   * All agent workspaces, labs, and command rooms are agent-hosting (true).
   */
  isAgentHosting: boolean;
}

/**
 * Static default configuration mapping every `RoomConfigType` to its canonical
 * visual and behavioral properties.
 *
 * This is the authoritative source used during initial scene construction —
 * when a room mesh is created from a minimal manifest entry that specifies only
 * the `roomType`, the renderer looks up these defaults to fill in:
 *   - Accent colour (emissive glow + HUD highlight)
 *   - Icon (minimap + nameplate)
 *   - Camera preset
 *   - Capacity hint
 *   - Access policy
 *   - Summary verbosity
 *
 * Design constraints:
 *   - Covers ALL 8 `RoomConfigType` values exhaustively (no unknown type may
 *     be introduced without a corresponding entry here).
 *   - Colors are chosen for visual distinctiveness on the dark command-center
 *     theme (#1E1E2E background) while following the low-poly stylization guide.
 *   - Behavioral descriptions are ontology-contract-level descriptions, NOT
 *     user-facing help text (use HUD tooltip strings for that).
 *   - The object is frozen to prevent accidental mutation at runtime.
 *
 * @example
 * ```ts
 * const defaults = DEFAULT_ROOM_TYPE_MAPPINGS["office"];
 * console.log(defaults.colorAccent);     // "#66BB6A"
 * console.log(defaults.isAgentHosting);  // true
 * ```
 */
export const DEFAULT_ROOM_TYPE_MAPPINGS: Readonly<
  Record<RoomConfigType, RoomTypeVisualProps>
> = Object.freeze({
  /**
   * control — Primary command & orchestration room.
   * Houses the managing agent and the operator interface.
   * Rendered with a warm-orange accent to signal authority and urgency.
   */
  control: {
    colorAccent: "#FF7043",
    icon: "command",
    defaultCameraPreset: "overhead",
    defaultCapacity: 4,
    defaultAccessPolicy: "members-only",
    defaultSummaryMode: "verbose",
    behaviorDescription:
      "Primary command and orchestration room; hosts the managing agent and live task/approval HUD panels",
    isAgentHosting: true,
  },

  /**
   * office — Focused single-agent work area.
   * Standard workspace for implementer, validator, or reviewer agents.
   * Uses a green accent (implementation) as the canonical office colour;
   * individual offices can override with their own accent.
   */
  office: {
    colorAccent: "#66BB6A",
    icon: "briefcase",
    defaultCameraPreset: "close-up",
    defaultCapacity: 4,
    defaultAccessPolicy: "open",
    defaultSummaryMode: "concise",
    behaviorDescription:
      "Focused agent workspace for implementation, validation, or review work; supports one or more specialist agents",
    isAgentHosting: true,
  },

  /**
   * lab — Research and experimentation space.
   * Used by the researcher agent for repo mapping, context gathering, and
   * impact analysis.  Purple accent signals investigative work.
   */
  lab: {
    colorAccent: "#AB47BC",
    icon: "research",
    defaultCameraPreset: "isometric",
    defaultCapacity: 4,
    defaultAccessPolicy: "open",
    defaultSummaryMode: "concise",
    behaviorDescription:
      "Research and discovery workspace; read-heavy operations — repo mapping, context gathering, impact analysis",
    isAgentHosting: true,
  },

  /**
   * lobby — Entry point / user-facing overview room.
   * The operator's primary landing space; shows project overview and status.
   * Light-blue accent signals openness and the human-in-the-loop entry point.
   */
  lobby: {
    colorAccent: "#4FC3F7",
    icon: "lobby",
    defaultCameraPreset: "isometric",
    defaultCapacity: -1,
    defaultAccessPolicy: "open",
    defaultSummaryMode: "verbose",
    behaviorDescription:
      "Entry point and operator overview room; displays project status, pending approvals, and active agent summary",
    isAgentHosting: false,
  },

  /**
   * archive — Read-only historical data and event replay room.
   * Accessible to the operator for inspecting past decisions and replaying
   * event timelines.  Muted blue-grey accent signals read-only / historical.
   */
  archive: {
    colorAccent: "#78909C",
    icon: "archive",
    defaultCameraPreset: "isometric",
    defaultCapacity: 2,
    defaultAccessPolicy: "open",
    defaultSummaryMode: "concise",
    behaviorDescription:
      "Read-only archive and replay room; provides operator access to event log, decision history, and timeline replay",
    isAgentHosting: false,
  },

  /**
   * corridor — Spatial connector (no resident agents).
   * Hallways, stairwells, and transitional passages between active rooms.
   * Dark slate accent blends with the building structure; not a workspace.
   */
  corridor: {
    colorAccent: "#546E7A",
    icon: "corridor",
    defaultCameraPreset: "overhead",
    defaultCapacity: 0,
    defaultAccessPolicy: "open",
    defaultSummaryMode: "silent",
    behaviorDescription:
      "Spatial-only connector passageway; no resident agents; serves navigation and visual building structure",
    isAgentHosting: false,
  },

  /**
   * pipeline — Automation pipeline visualisation room.
   * Dedicated to displaying and controlling multi-step automation pipelines.
   * Amber accent signals active processing and pipeline step progress.
   */
  pipeline: {
    colorAccent: "#FFA726",
    icon: "pipeline",
    defaultCameraPreset: "overhead",
    defaultCapacity: -1,
    defaultAccessPolicy: "open",
    defaultSummaryMode: "verbose",
    behaviorDescription:
      "Pipeline visualisation and control room; renders data-flow connectors, step-progress indicators, and pipeline lifecycle events",
    isAgentHosting: false,
  },

  /**
   * agent — Dedicated single-agent workspace.
   * More focused than "office"; used when a room hosts exactly one agent
   * persona in isolation (e.g. a specialist sub-agent with a unique skill set).
   * Cyan accent distinguishes it from the generic office type.
   */
  agent: {
    colorAccent: "#26C6DA",
    icon: "agent",
    defaultCameraPreset: "close-up",
    defaultCapacity: 1,
    defaultAccessPolicy: "members-only",
    defaultSummaryMode: "concise",
    behaviorDescription:
      "Dedicated single-agent isolation workspace; renders agent-specific HUD panels and skill display; capacity = 1",
    isAgentHosting: true,
  },
} satisfies Record<RoomConfigType, RoomTypeVisualProps>);

/**
 * Retrieve the visual/behavioral defaults for a given room type.
 *
 * Always returns a defined value — every `RoomConfigType` is covered.
 *
 * @param roomType - Any `RoomConfigType` value
 * @returns        - The static visual/behavioral defaults for that type
 *
 * @example
 * ```ts
 * const props = getRoomTypeDefaults("control");
 * // props.colorAccent === "#FF7043"
 * // props.icon         === "command"
 * ```
 */
export function getRoomTypeDefaults(
  roomType: RoomConfigType,
): RoomTypeVisualProps {
  return DEFAULT_ROOM_TYPE_MAPPINGS[roomType];
}

/**
 * Build a minimal `RoomPlacementMetadata` from type defaults + a given position
 * and dimensions.  Useful when procedurally constructing rooms from a bare
 * manifest that only specifies `roomType` and spatial coordinates.
 *
 * @param roomType   - Type to look up defaults for
 * @param position   - Grid-space origin of the room
 * @param dimensions - Room extents in grid units (x=width, y=height, z=depth)
 * @returns          - Populated `RoomPlacementMetadata` ready for the scene graph
 */
export function buildPlacementFromTypeDefaults(
  roomType: RoomConfigType,
  position: { x: number; y: number; z: number },
  dimensions: { x: number; y: number; z: number },
): RoomPlacementMetadata {
  const defaults = getRoomTypeDefaults(roomType);
  return {
    position,
    dimensions,
    center: {
      x: position.x + dimensions.x / 2,
      y: position.y + dimensions.y / 2,
      z: position.z + dimensions.z / 2,
    },
    cameraPreset: defaults.defaultCameraPreset,
    colorAccent: defaults.colorAccent,
    icon: defaults.icon,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Result of validating a VersionedRoomMappingConfig.
 */
export interface RoomConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a VersionedRoomMappingConfig for structural integrity.
 *
 * Checks:
 *   1. schemaVersion matches ROOM_CONFIG_SCHEMA_VERSION
 *   2. Every room has a non-empty roomId and name
 *   3. Every roomType is a known RoomConfigType
 *   4. Every cameraPreset is a known RoomCameraPreset
 *   5. Room dimensions are all positive
 *   6. No duplicate roomIds
 *   7. All parentRoomId references point to existing rooms
 *   8. adjacentRoomIds reference existing rooms
 *   9. floorIndex values are unique within each floor
 */
export function validateRoomConfig(
  config: VersionedRoomMappingConfig,
): RoomConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Schema version
  if (config.schemaVersion !== ROOM_CONFIG_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion mismatch: expected ${ROOM_CONFIG_SCHEMA_VERSION}, got ${config.schemaVersion}`,
    );
  }

  const roomIds = new Set(config.rooms.map((r) => r.roomId));
  const validTypes = new Set<string>(ROOM_CONFIG_TYPES);
  const validPresets = new Set<string>(ROOM_CAMERA_PRESETS);

  // Per-room checks
  const seenIds = new Set<string>();
  for (const room of config.rooms) {
    const prefix = `[${room.roomId || "<missing-id>"}]`;

    // 2. Required string fields
    if (!room.roomId) errors.push(`${prefix} missing roomId`);
    if (!room.name) errors.push(`${prefix} missing name`);

    // 3. Room type
    if (!validTypes.has(room.roomType)) {
      errors.push(`${prefix} invalid roomType: "${room.roomType}"`);
    }

    // 4. Camera preset
    if (!validPresets.has(room.placement?.cameraPreset)) {
      errors.push(`${prefix} invalid cameraPreset: "${room.placement?.cameraPreset}"`);
    }

    // 5. Positive dimensions
    const d = room.placement?.dimensions;
    if (!d) {
      errors.push(`${prefix} missing placement.dimensions`);
    } else {
      if (d.x <= 0) errors.push(`${prefix} placement.dimensions.x must be > 0`);
      if (d.y <= 0) errors.push(`${prefix} placement.dimensions.y must be > 0`);
      if (d.z <= 0) errors.push(`${prefix} placement.dimensions.z must be > 0`);
    }

    // 6. Duplicate roomIds
    if (seenIds.has(room.roomId)) {
      errors.push(`Duplicate roomId: "${room.roomId}"`);
    } else {
      seenIds.add(room.roomId);
    }

    // 7. parentRoomId cross-reference
    const parentId = room.hierarchyPosition?.parentRoomId;
    if (parentId && !roomIds.has(parentId)) {
      errors.push(
        `${prefix} hierarchyPosition.parentRoomId "${parentId}" does not reference a known room`,
      );
    }

    // 8. adjacentRoomIds cross-reference (warn, not error — adjacency may be incomplete during init)
    for (const adjId of room.hierarchyPosition?.adjacentRoomIds ?? []) {
      if (!roomIds.has(adjId)) {
        warnings.push(
          `${prefix} adjacentRoomIds includes "${adjId}" which is not in the config`,
        );
      }
    }
  }

  // 9. Unique floorIndex per floor
  const floorIndexMap: Record<number, Set<number>> = {};
  for (const room of config.rooms) {
    const { floor, floorIndex } = room.hierarchyPosition;
    if (!floorIndexMap[floor]) floorIndexMap[floor] = new Set();
    if (floorIndexMap[floor].has(floorIndex)) {
      warnings.push(
        `[${room.roomId}] floorIndex ${floorIndex} on floor ${floor} is shared with another room`,
      );
    } else {
      floorIndexMap[floor].add(floorIndex);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

/**
 * Default room mapping configuration.
 *
 * Encodes the full spatial + hierarchical definition of all 9 rooms in the
 * Conitens Command Center.  Derived from:
 *   .agent/rooms/_building.yaml    — floor plan and adjacency
 *   .agent/rooms/*.yaml            — per-room spatial and membership data
 *
 * Schema version: 1
 * Building ID:    command-center
 *
 * This constant is the authoritative source loaded on system initialization.
 * To override it at runtime, pass a VersionedRoomMappingConfig to initRoomConfig().
 */
export const DEFAULT_ROOM_CONFIG: VersionedRoomMappingConfig = {
  schemaVersion: ROOM_CONFIG_SCHEMA_VERSION,
  configuredAt: "2026-03-24T00:00:00.000Z",
  buildingId: "command-center",
  buildingName: "Conitens Command Center",
  rooms: [
    // ── Ground Floor (0) ────────────────────────────────────────────────

    {
      roomId: "project-main",
      name: "Project Main",
      roomType: "lobby",
      hierarchyPosition: {
        floor: 0,
        floorIndex: 0,
        hierarchyDepth: 0,
        isMainCorridorAccessible: true,
        adjacentRoomIds: ["stairwell", "archive-vault"],
      },
      placement: {
        position: { x: 4, y: 0, z: 0 },
        dimensions: { x: 4, y: 3, z: 4 },
        center: { x: 6, y: 1.5, z: 2 },
        cameraPreset: "isometric",
        colorAccent: "#4FC3F7",
        icon: "lobby",
      },
      members: ["USER", "manager-default"],
      tags: ["entry-point", "user-facing", "overview"],
      maxOccupancy: -1,
      accessPolicy: "open",
      summaryMode: "verbose",
    },

    {
      roomId: "archive-vault",
      name: "Archive Vault",
      roomType: "archive",
      hierarchyPosition: {
        floor: 0,
        floorIndex: 1,
        hierarchyDepth: 0,
        isMainCorridorAccessible: true,
        adjacentRoomIds: ["project-main"],
      },
      placement: {
        position: { x: 8, y: 0, z: 0 },
        dimensions: { x: 4, y: 3, z: 4 },
        center: { x: 10, y: 1.5, z: 2 },
        cameraPreset: "isometric",
        colorAccent: "#78909C",
        icon: "archive",
      },
      members: ["USER"],
      tags: ["read-only", "replay", "event-log", "history"],
      maxOccupancy: 1,
      accessPolicy: "open",
      summaryMode: "concise",
    },

    {
      roomId: "stairwell",
      name: "Central Stairwell",
      roomType: "corridor",
      hierarchyPosition: {
        floor: 0,         // spans floors 0–1; listed under ground floor
        floorIndex: 2,
        hierarchyDepth: 0,
        isMainCorridorAccessible: true,
        adjacentRoomIds: ["project-main", "corridor-main", "ops-control"],
      },
      placement: {
        position: { x: 4, y: 0, z: 4 },
        dimensions: { x: 2, y: 6, z: 2 },  // y=6 spans both floors
        center: { x: 5, y: 3, z: 5 },
        cameraPreset: "isometric",
        colorAccent: "#546E7A",
        icon: "stairs",
      },
      members: [],
      tags: ["vertical-connector", "multi-floor", "spatial-only"],
      maxOccupancy: -1,
      accessPolicy: "open",
      summaryMode: "silent",
    },

    // ── Operations Floor (1) ────────────────────────────────────────────

    {
      roomId: "ops-control",
      name: "Operations Control",
      roomType: "control",
      hierarchyPosition: {
        floor: 1,
        floorIndex: 0,
        hierarchyDepth: 0,
        isMainCorridorAccessible: true,
        adjacentRoomIds: ["stairwell", "corridor-main"],
      },
      placement: {
        position: { x: 4, y: 3, z: 0 },
        dimensions: { x: 5, y: 3, z: 4 },
        center: { x: 6.5, y: 4.5, z: 2 },
        cameraPreset: "overhead",
        colorAccent: "#FF7043",
        icon: "command",
      },
      members: ["USER", "manager-default"],
      tags: ["primary", "orchestration", "command", "approval"],
      maxOccupancy: -1,
      accessPolicy: "members-only",
      summaryMode: "verbose",
    },

    {
      roomId: "impl-office",
      name: "Implementation Office",
      roomType: "office",
      hierarchyPosition: {
        floor: 1,
        floorIndex: 1,
        hierarchyDepth: 0,
        isMainCorridorAccessible: true,
        adjacentRoomIds: ["corridor-main"],
      },
      placement: {
        position: { x: 0, y: 3, z: 0 },
        dimensions: { x: 4, y: 3, z: 3 },
        center: { x: 2, y: 4.5, z: 1.5 },
        cameraPreset: "close-up",
        colorAccent: "#66BB6A",
        icon: "code",
      },
      members: ["implementer-subagent"],
      tags: ["agent-workspace", "implementation", "code-change"],
      maxOccupancy: 4,
      accessPolicy: "open",
      summaryMode: "concise",
    },

    {
      roomId: "research-lab",
      name: "Research Lab",
      roomType: "lab",
      hierarchyPosition: {
        floor: 1,
        floorIndex: 2,
        hierarchyDepth: 0,
        isMainCorridorAccessible: true,
        adjacentRoomIds: ["corridor-main"],
      },
      placement: {
        position: { x: 0, y: 3, z: 3 },
        dimensions: { x: 4, y: 3, z: 3 },
        center: { x: 2, y: 4.5, z: 4.5 },
        cameraPreset: "isometric",
        colorAccent: "#AB47BC",
        icon: "research",
      },
      members: ["researcher-subagent"],
      tags: ["agent-workspace", "research", "analysis", "context-gathering"],
      maxOccupancy: 4,
      accessPolicy: "open",
      summaryMode: "concise",
    },

    {
      roomId: "corridor-main",
      name: "Main Corridor",
      roomType: "corridor",
      hierarchyPosition: {
        floor: 1,
        floorIndex: 3,
        hierarchyDepth: 0,
        isMainCorridorAccessible: true,  // IS the main corridor
        adjacentRoomIds: [
          "stairwell",
          "impl-office",
          "research-lab",
          "validation-office",
          "review-office",
        ],
      },
      placement: {
        position: { x: 4, y: 3, z: 3 },
        dimensions: { x: 5, y: 3, z: 1 },
        center: { x: 6.5, y: 4.5, z: 3.5 },
        cameraPreset: "overhead",
        colorAccent: "#546E7A",
        icon: "corridor",
      },
      members: [],
      tags: ["connector", "spatial-only", "floor-1"],
      maxOccupancy: -1,
      accessPolicy: "open",
      summaryMode: "silent",
    },

    {
      roomId: "validation-office",
      name: "Validation Office",
      roomType: "office",
      hierarchyPosition: {
        floor: 1,
        floorIndex: 4,
        hierarchyDepth: 0,
        isMainCorridorAccessible: true,
        adjacentRoomIds: ["corridor-main"],
      },
      placement: {
        position: { x: 9, y: 3, z: 0 },
        dimensions: { x: 3, y: 3, z: 3 },
        center: { x: 10.5, y: 4.5, z: 1.5 },
        cameraPreset: "close-up",
        colorAccent: "#EF5350",
        icon: "shield",
      },
      members: ["validator-sentinel"],
      tags: ["agent-workspace", "validation", "testing", "release-gate"],
      maxOccupancy: 4,
      accessPolicy: "open",
      summaryMode: "concise",
    },

    {
      roomId: "review-office",
      name: "Frontend Review Office",
      roomType: "office",
      hierarchyPosition: {
        floor: 1,
        floorIndex: 5,
        hierarchyDepth: 0,
        isMainCorridorAccessible: true,
        adjacentRoomIds: ["corridor-main"],
      },
      placement: {
        position: { x: 9, y: 3, z: 3 },
        dimensions: { x: 3, y: 3, z: 3 },
        center: { x: 10.5, y: 4.5, z: 4.5 },
        cameraPreset: "close-up",
        colorAccent: "#42A5F5",
        icon: "eye",
      },
      members: ["frontend-reviewer"],
      tags: ["agent-workspace", "ui-review", "frontend", "accessibility"],
      maxOccupancy: 2,
      accessPolicy: "open",
      summaryMode: "concise",
    },
  ],
} as const satisfies VersionedRoomMappingConfig;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Loaded room configuration — initially the static DEFAULT_ROOM_CONFIG,
 * but may be replaced at runtime by initRoomConfig().
 *
 * All consumers should call getRoomConfig() rather than reading
 * DEFAULT_ROOM_CONFIG directly so they receive any runtime overrides.
 */
let _activeRoomConfig: VersionedRoomMappingConfig = DEFAULT_ROOM_CONFIG;

/**
 * Initialise the room mapping configuration.
 *
 * Called once at application startup (before the 3D scene renders).
 * Accepts an optional override config — if omitted, falls back to
 * DEFAULT_ROOM_CONFIG.
 *
 * Validates the config before activating it; logs warnings on schema
 * issues but still activates a valid config.
 *
 * @param config   - Override config (e.g. parsed from YAML at runtime).
 *                   Must pass validateRoomConfig() to be activated.
 * @returns        - Validation result — callers can surface errors to the HUD.
 */
export function initRoomConfig(
  config: VersionedRoomMappingConfig = DEFAULT_ROOM_CONFIG,
): RoomConfigValidationResult {
  const result = validateRoomConfig(config);

  if (!result.valid) {
    console.error(
      `[room-config-schema] initRoomConfig: config failed validation (${result.errors.length} errors). ` +
      "Falling back to DEFAULT_ROOM_CONFIG.",
      result.errors,
    );
    _activeRoomConfig = DEFAULT_ROOM_CONFIG;
    return result;
  }

  if (result.warnings.length > 0) {
    console.warn(
      `[room-config-schema] initRoomConfig: config has ${result.warnings.length} warnings.`,
      result.warnings,
    );
  }

  _activeRoomConfig = config;
  return result;
}

/**
 * Get the currently active room mapping configuration.
 *
 * Returns the config activated by the last successful initRoomConfig() call,
 * or DEFAULT_ROOM_CONFIG if initRoomConfig() has not been called yet.
 */
export function getRoomConfig(): Readonly<VersionedRoomMappingConfig> {
  return _activeRoomConfig;
}

/**
 * Reset the active config back to DEFAULT_ROOM_CONFIG.
 *
 * Primarily useful in tests and for the self-improvement pipeline when
 * rolling back an experimental config.
 */
export function resetRoomConfig(): void {
  _activeRoomConfig = DEFAULT_ROOM_CONFIG;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Get a single RoomConfigEntry by roomId.
 *
 * @param roomId  - Kebab-case room identifier
 * @param config  - Config to search (defaults to active config)
 * @returns       - The entry, or undefined if not found
 */
export function getRoomConfigEntry(
  roomId: string,
  config: VersionedRoomMappingConfig = _activeRoomConfig,
): RoomConfigEntry | undefined {
  return config.rooms.find((r) => r.roomId === roomId);
}

/**
 * Get all rooms on a specific floor.
 *
 * The stairwell spans floors 0–1; it is returned for both floor 0 and floor 1.
 *
 * @param floor   - 0-indexed floor number
 * @param config  - Config to search (defaults to active config)
 */
export function getRoomConfigsForFloor(
  floor: number,
  config: VersionedRoomMappingConfig = _activeRoomConfig,
): RoomConfigEntry[] {
  return config.rooms.filter((r) => {
    // Stairwell spans both floors
    if (r.roomId === "stairwell") return floor === 0 || floor === 1;
    return r.hierarchyPosition.floor === floor;
  });
}

/**
 * Get all rooms of a specific type.
 *
 * @param roomType - RoomConfigType to filter by
 * @param config   - Config to search (defaults to active config)
 */
export function getRoomConfigsByType(
  roomType: RoomConfigType,
  config: VersionedRoomMappingConfig = _activeRoomConfig,
): RoomConfigEntry[] {
  return config.rooms.filter((r) => r.roomType === roomType);
}

/**
 * Get rooms directly adjacent to the given room.
 *
 * Uses the adjacentRoomIds in the room's hierarchyPosition.
 *
 * @param roomId  - Source room
 * @param config  - Config to search (defaults to active config)
 */
export function getAdjacentRoomConfigs(
  roomId: string,
  config: VersionedRoomMappingConfig = _activeRoomConfig,
): RoomConfigEntry[] {
  const room = getRoomConfigEntry(roomId, config);
  if (!room) return [];
  return room.hierarchyPosition.adjacentRoomIds
    .map((id) => getRoomConfigEntry(id, config))
    .filter((r): r is RoomConfigEntry => r !== undefined);
}

/**
 * Build a flat roomId → RoomConfigEntry lookup map for O(1) access.
 *
 * @param config  - Config to index (defaults to active config)
 */
export function buildRoomConfigIndex(
  config: VersionedRoomMappingConfig = _activeRoomConfig,
): Readonly<Record<string, RoomConfigEntry>> {
  const index: Record<string, RoomConfigEntry> = {};
  for (const room of config.rooms) {
    index[room.roomId] = room;
  }
  return index;
}

/**
 * Get all rooms accessible from the main corridor on the given floor.
 *
 * @param floor   - 0-indexed floor number
 * @param config  - Config to search (defaults to active config)
 */
export function getCorridorAccessibleRooms(
  floor: number,
  config: VersionedRoomMappingConfig = _activeRoomConfig,
): RoomConfigEntry[] {
  return getRoomConfigsForFloor(floor, config).filter(
    (r) => r.hierarchyPosition.isMainCorridorAccessible,
  );
}
