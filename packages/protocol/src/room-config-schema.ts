/**
 * @module room-config-schema
 * Typed room registry — parses & models .agent/rooms/ YAML definitions
 * into a static TypeScript registry usable by the 3D command-center layer.
 *
 * Schema version: 1  (mirrors .agent/rooms/_schema.yaml)
 *
 * Behavioural contract (what this module CAN DO):
 *   - getRoomById(id)          → look up a single room by its slug
 *   - getRoomsByFloor(n)       → return all rooms on a given floor
 *   - getRoomsByType(type)     → filter rooms by room_type
 *   - getAdjacentRooms(id)     → return direct neighbours from the adjacency graph
 *   - validateRoomDef(raw)     → type-guard: confirm an object matches RoomDef
 *   - buildRoomRegistry(defs)  → construct a RoomRegistry from an array of RoomDef
 *
 * Source of truth: .agent/rooms/*.yaml + .agent/rooms/_building.yaml
 */

// ---------------------------------------------------------------------------
// Primitive / enum types
// ---------------------------------------------------------------------------

/** Allowed room_type values from _schema.yaml */
export type RoomType =
  | "control"
  | "office"
  | "lab"
  | "lobby"
  | "archive"
  | "corridor"
  | "pipeline"
  | "agent";

export const ROOM_TYPES = [
  "control", "office", "lab", "lobby",
  "archive", "corridor", "pipeline", "agent",
] as const satisfies readonly RoomType[];

/** Allowed summary_mode values */
export type SummaryMode = "concise" | "verbose" | "silent";

/** Allowed access_policy values */
export type AccessPolicy = "open" | "members-only" | "approval-required";

/** Allowed camera_preset values */
export type CameraPreset = "overhead" | "isometric" | "close-up";

/** Cardinal wall direction used in door/window positions */
export type WallDirection = "north" | "south" | "east" | "west";

// ---------------------------------------------------------------------------
// 3D spatial primitives
// ---------------------------------------------------------------------------

/** 3-component position or dimension vector */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Width/height/depth bounding box */
export interface Dimensions3 {
  w: number;
  h: number;
  d: number;
}

/** Door position on a wall */
export interface DoorPosition {
  wall: WallDirection;
  /** Offset along the wall in grid units */
  offset: number;
}

/** Window position on a wall */
export interface WindowPosition {
  wall: WallDirection;
  offset: number;
  width: number;
}

/** A piece of furniture placed in the room */
export interface FurnitureSlot {
  /** Furniture archetype identifier (e.g. "command-desk", "workstation") */
  type: string;
  position: Vec3;
}

// ---------------------------------------------------------------------------
// Hierarchy / adjacency metadata
// ---------------------------------------------------------------------------

/** Optional hierarchy positioning data (from _schema.yaml §hierarchy_position) */
export interface HierarchyPosition {
  /** Sort order within the floor (0 = primary room) */
  floorIndex?: number;
  /** 0 = top-level, 1 = nested room */
  hierarchyDepth?: number;
  /** Directly reachable from the main corridor */
  isMainCorridorAccessible?: boolean;
  /** Room IDs of adjacent spaces (mirrors _building.yaml adjacency) */
  adjacentRoomIds?: string[];
}

// ---------------------------------------------------------------------------
// Core room definition
// ---------------------------------------------------------------------------

/** Spatial configuration for a room */
export interface RoomSpatial {
  /** Grid-space origin of the room in the building coordinate system */
  position: Vec3;
  /** Bounding box in grid units */
  dimensions: Dimensions3;
  /** Hex accent colour used for trim, glow, and minimap indicator */
  colorAccent?: string;
  /** Icon identifier for minimap/label (e.g. "command", "code", "shield") */
  icon?: string;
  /** Default camera angle when the room is focused */
  cameraPreset?: CameraPreset;
  doorPositions?: DoorPosition[];
  windowPositions?: WindowPosition[];
  furnitureSlots?: FurnitureSlot[];
}

/**
 * Canonical room definition — the typed representation of a single
 * .agent/rooms/<room_id>.yaml file.
 *
 * All camelCase fields mirror the YAML snake_case equivalents.
 */
export interface RoomDef {
  /** Schema version — must be 1 for this type */
  schemaV: 1;
  /** Unique slug (kebab-case), e.g. "ops-control" */
  roomId: string;
  /** Human-readable display name */
  name: string;
  /** Functional category of the room */
  roomType: RoomType;
  /** 0-indexed floor number */
  floor: number;
  /** Agent IDs (or "USER") that occupy this room */
  members: string[];
  /** Room slug of the enclosing room, if nested */
  parentRoom?: string;
  /** Project-relative file paths visible to room members */
  sharedFiles?: string[];
  /** Summary verbosity for this room's agent output */
  summaryMode?: SummaryMode;
  /** Human-readable description of the room's purpose */
  notes?: string;
  /** Maximum simultaneous occupants (0 = spatial-only, no agents) */
  maxOccupancy?: number;
  /** Access control policy */
  accessPolicy?: AccessPolicy;
  /** Free-form tags for filtering and querying */
  tags?: string[];
  /** Hierarchy and adjacency metadata */
  hierarchyPosition?: HierarchyPosition;
  /** 3D spatial configuration */
  spatial: RoomSpatial;
}

// ---------------------------------------------------------------------------
// Building definition
// ---------------------------------------------------------------------------

/** A single floor in the building */
export interface FloorDef {
  floor: number;
  name: string;
  /** Grid dimensions of this floor's layout */
  grid: { w: number; d: number };
  /** Room IDs present on this floor */
  roomIds: string[];
}

/** Visual defaults applied to all rooms unless overridden */
export interface BuildingVisualDefaults {
  wallColor: string;
  floorColor: string;
  ceilingColor: string;
  ambientLight: string;
  accentGlowIntensity: number;
  gridVisible: boolean;
  gridColor: string;
}

/** Root building manifest (mirrors .agent/rooms/_building.yaml) */
export interface BuildingDef {
  schemaV: 1;
  buildingId: string;
  name: string;
  style: string;
  floors: number;
  floorPlan: FloorDef[];
  /** Canonical agent → room assignments (overrides role defaults) */
  agentAssignments: Record<string, string>;
  /** Undirected adjacency graph: roomId → adjacent roomId[] */
  adjacency: Record<string, string[]>;
  visualDefaults: BuildingVisualDefaults;
}

// ---------------------------------------------------------------------------
// Room registry (the queryable collection)
// ---------------------------------------------------------------------------

/**
 * A validated, indexed collection of RoomDef entries keyed by roomId.
 * This is the primary data structure consumed by the 3D layer.
 */
export interface RoomRegistry {
  /** Total number of rooms in this registry */
  readonly count: number;
  /** Immutable map of roomId → RoomDef */
  readonly rooms: Readonly<Record<string, RoomDef>>;
  /** Ordered list of all room IDs */
  readonly roomIds: readonly string[];
  /** Associated building definition */
  readonly building: BuildingDef;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/** Narrow an unknown value to a RoomDef. */
export function isRoomDef(raw: unknown): raw is RoomDef {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    r["schemaV"] === 1 &&
    typeof r["roomId"] === "string" &&
    typeof r["name"] === "string" &&
    (ROOM_TYPES as readonly string[]).includes(r["roomType"] as string) &&
    typeof r["floor"] === "number" &&
    Array.isArray(r["members"]) &&
    typeof r["spatial"] === "object" && r["spatial"] !== null
  );
}

// ---------------------------------------------------------------------------
// Registry factory
// ---------------------------------------------------------------------------

/**
 * Build a RoomRegistry from an array of validated RoomDef entries.
 * Throws if duplicate roomIds are detected.
 */
export function buildRoomRegistry(
  defs: RoomDef[],
  building: BuildingDef,
): RoomRegistry {
  const rooms: Record<string, RoomDef> = {};
  for (const def of defs) {
    if (rooms[def.roomId] !== undefined) {
      throw new Error(`Duplicate roomId detected: "${def.roomId}"`);
    }
    rooms[def.roomId] = def;
  }
  return {
    count: defs.length,
    rooms: Object.freeze(rooms),
    roomIds: Object.freeze(Object.keys(rooms)),
    building,
  };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Return a room by ID, or undefined if not found. */
export function getRoomById(
  registry: RoomRegistry,
  roomId: string,
): RoomDef | undefined {
  return registry.rooms[roomId];
}

/** Return all rooms on the given floor (0-indexed). */
export function getRoomsByFloor(
  registry: RoomRegistry,
  floor: number,
): RoomDef[] {
  return Object.values(registry.rooms).filter((r) => r.floor === floor);
}

/** Return all rooms matching the given type. */
export function getRoomsByType(
  registry: RoomRegistry,
  type: RoomType,
): RoomDef[] {
  return Object.values(registry.rooms).filter((r) => r.roomType === type);
}

/**
 * Return the direct neighbours of a room using the building adjacency graph.
 * Returns an empty array if the room has no declared adjacency.
 */
export function getAdjacentRooms(
  registry: RoomRegistry,
  roomId: string,
): RoomDef[] {
  const neighbours = registry.building.adjacency[roomId] ?? [];
  return neighbours.flatMap((id) => {
    const room = registry.rooms[id];
    return room !== undefined ? [room] : [];
  });
}

/**
 * Return rooms that contain the given agent ID in their members list.
 */
export function getRoomsForAgent(
  registry: RoomRegistry,
  agentId: string,
): RoomDef[] {
  return Object.values(registry.rooms).filter((r) =>
    r.members.includes(agentId),
  );
}

/**
 * Return rooms whose tags include ALL of the supplied filter tags.
 */
export function getRoomsByTags(
  registry: RoomRegistry,
  filterTags: string[],
): RoomDef[] {
  if (filterTags.length === 0) return Object.values(registry.rooms);
  return Object.values(registry.rooms).filter((r) =>
    filterTags.every((tag) => r.tags?.includes(tag)),
  );
}

// ---------------------------------------------------------------------------
// Static building definition (mirrors .agent/rooms/_building.yaml)
// ---------------------------------------------------------------------------

export const BUILDING_DEF: BuildingDef = {
  schemaV: 1,
  buildingId: "command-center",
  name: "Conitens Command Center",
  style: "low-poly-dark",
  floors: 2,
  floorPlan: [
    {
      floor: 0,
      name: "Ground Floor",
      grid: { w: 12, d: 6 },
      roomIds: ["project-main", "archive-vault", "stairwell"],
    },
    {
      floor: 1,
      name: "Operations Floor",
      grid: { w: 12, d: 6 },
      roomIds: [
        "ops-control",
        "impl-office",
        "research-lab",
        "validation-office",
        "review-office",
        "corridor-main",
        "stairwell",
      ],
    },
  ],
  agentAssignments: {
    USER: "project-main",
    "manager-default": "ops-control",
    "implementer-subagent": "impl-office",
    "researcher-subagent": "research-lab",
    "validator-sentinel": "validation-office",
    "frontend-reviewer": "review-office",
  },
  adjacency: {
    "project-main": ["stairwell", "archive-vault"],
    "archive-vault": ["project-main"],
    stairwell: ["project-main", "corridor-main", "ops-control"],
    "corridor-main": [
      "stairwell",
      "impl-office",
      "research-lab",
      "validation-office",
      "review-office",
    ],
    "ops-control": ["stairwell", "corridor-main"],
    "impl-office": ["corridor-main"],
    "research-lab": ["corridor-main"],
    "validation-office": ["corridor-main"],
    "review-office": ["corridor-main"],
  },
  visualDefaults: {
    wallColor: "#1E1E2E",
    floorColor: "#2D2D3D",
    ceilingColor: "#15151F",
    ambientLight: "#303050",
    accentGlowIntensity: 0.6,
    gridVisible: true,
    gridColor: "#3D3D5C",
  },
};

// ---------------------------------------------------------------------------
// Static room definitions (mirrors .agent/rooms/*.yaml files)
// ---------------------------------------------------------------------------

const ROOM_DEFS: RoomDef[] = [
  // ── Ground Floor (floor: 0) ──────────────────────────────────────────────

  {
    schemaV: 1,
    roomId: "project-main",
    name: "Project Main",
    roomType: "lobby",
    floor: 0,
    members: ["USER", "manager-default"],
    sharedFiles: [
      "README.md",
      "CONITENS.md",
      ".agent/workflows/wf.plan-execute-validate.md",
    ],
    summaryMode: "concise",
    maxOccupancy: 8,
    accessPolicy: "open",
    tags: ["entry-point", "overview"],
    notes:
      "Default shared room for the operator and hired agents. Entry point to the command center.",
    hierarchyPosition: {
      floorIndex: 0,
      hierarchyDepth: 0,
      isMainCorridorAccessible: false,
      adjacentRoomIds: ["stairwell", "archive-vault"],
    },
    spatial: {
      position: { x: 4, y: 0, z: 0 },
      dimensions: { w: 4, h: 3, d: 4 },
      colorAccent: "#4FC3F7",
      icon: "lobby",
      cameraPreset: "isometric",
      doorPositions: [
        { wall: "north", offset: 2 },
        { wall: "east", offset: 2 },
        { wall: "west", offset: 2 },
      ],
      furnitureSlots: [
        { type: "reception-desk", position: { x: 2, y: 0, z: 1 } },
        { type: "status-board", position: { x: 2, y: 1.5, z: 3.8 } },
        { type: "hologram-table", position: { x: 2, y: 0.5, z: 2 } },
      ],
    },
  },

  {
    schemaV: 1,
    roomId: "archive-vault",
    name: "Archive Vault",
    roomType: "archive",
    floor: 0,
    members: ["USER"],
    sharedFiles: [],
    summaryMode: "silent",
    maxOccupancy: 2,
    accessPolicy: "open",
    tags: ["archive", "replay", "history", "readonly"],
    notes:
      "Read-only archive room for event replay and historical inspection. All completed task logs and decision records are accessible here.",
    hierarchyPosition: {
      floorIndex: 1,
      hierarchyDepth: 0,
      isMainCorridorAccessible: false,
      adjacentRoomIds: ["project-main"],
    },
    spatial: {
      position: { x: 8, y: 0, z: 0 },
      dimensions: { w: 4, h: 3, d: 4 },
      colorAccent: "#78909C",
      icon: "archive",
      cameraPreset: "isometric",
      doorPositions: [{ wall: "west", offset: 2 }],
      furnitureSlots: [
        { type: "replay-terminal", position: { x: 2, y: 0, z: 2 } },
        { type: "timeline-wall", position: { x: 2, y: 1.5, z: 3.8 } },
        { type: "event-log-shelf", position: { x: 3.5, y: 0, z: 1 } },
      ],
    },
  },

  {
    schemaV: 1,
    roomId: "stairwell",
    name: "Central Stairwell",
    roomType: "corridor",
    floor: 0, // spans floors 0-1
    members: [],
    sharedFiles: [],
    summaryMode: "silent",
    maxOccupancy: 0,
    accessPolicy: "open",
    tags: ["connector", "vertical", "navigation"],
    notes:
      "Vertical connector between ground floor (lobby, archive) and first floor (offices, control room). Spatial-only.",
    hierarchyPosition: {
      floorIndex: 2,
      hierarchyDepth: 0,
      isMainCorridorAccessible: true,
      adjacentRoomIds: ["project-main", "corridor-main", "ops-control"],
    },
    spatial: {
      position: { x: 4, y: 0, z: 4 },
      dimensions: { w: 2, h: 6, d: 2 },
      colorAccent: "#546E7A",
      icon: "stairs",
      cameraPreset: "isometric",
      doorPositions: [
        { wall: "north", offset: 1 },
        { wall: "south", offset: 1 },
      ],
      furnitureSlots: [],
    },
  },

  // ── Operations Floor (floor: 1) ───────────────────────────────────────────

  {
    schemaV: 1,
    roomId: "ops-control",
    name: "Operations Control",
    roomType: "control",
    floor: 1,
    members: ["USER", "manager-default"],
    sharedFiles: [
      ".agent/policies/gates.yaml",
      ".agent/policies/hooks.yaml",
      ".agent/workflows/wf.plan-execute-validate.md",
    ],
    summaryMode: "verbose",
    maxOccupancy: 4,
    accessPolicy: "members-only",
    tags: ["command", "orchestration", "primary"],
    notes:
      "Central command room. The manager agent orchestrates all workflows from here. Displays live task state, approval queues, and system health.",
    hierarchyPosition: {
      floorIndex: 0,
      hierarchyDepth: 0,
      isMainCorridorAccessible: true,
      adjacentRoomIds: ["stairwell", "corridor-main"],
    },
    spatial: {
      position: { x: 4, y: 3, z: 0 },
      dimensions: { w: 5, h: 3, d: 4 },
      colorAccent: "#FF7043",
      icon: "command",
      cameraPreset: "overhead",
      doorPositions: [
        { wall: "south", offset: 2.5 },
        { wall: "east", offset: 2 },
      ],
      windowPositions: [{ wall: "south", offset: 1, width: 3 }],
      furnitureSlots: [
        { type: "command-desk", position: { x: 2.5, y: 0, z: 2 } },
        { type: "wall-monitor-array", position: { x: 2.5, y: 1.5, z: 3.8 } },
        { type: "approval-terminal", position: { x: 4, y: 0, z: 1 } },
        { type: "task-board", position: { x: 0.5, y: 1, z: 3.8 } },
      ],
    },
  },

  {
    schemaV: 1,
    roomId: "impl-office",
    name: "Implementation Office",
    roomType: "office",
    floor: 1,
    members: ["implementer-subagent"],
    sharedFiles: [
      ".agent/skills/code-implementer.yaml",
      ".agent/skills/task-planner.yaml",
    ],
    summaryMode: "concise",
    maxOccupancy: 3,
    accessPolicy: "members-only",
    tags: ["coding", "implementation", "write"],
    notes:
      "Focused workspace for the implementer agent. Code changes, patching, and task execution happen here.",
    hierarchyPosition: {
      floorIndex: 1,
      hierarchyDepth: 0,
      isMainCorridorAccessible: true,
      adjacentRoomIds: ["corridor-main"],
    },
    spatial: {
      position: { x: 0, y: 3, z: 0 },
      dimensions: { w: 4, h: 3, d: 3 },
      colorAccent: "#66BB6A",
      icon: "code",
      cameraPreset: "close-up",
      doorPositions: [{ wall: "east", offset: 1.5 }],
      windowPositions: [{ wall: "west", offset: 1, width: 2 }],
      furnitureSlots: [
        { type: "workstation", position: { x: 1, y: 0, z: 1.5 } },
        { type: "workstation", position: { x: 3, y: 0, z: 1.5 } },
        { type: "diff-screen", position: { x: 2, y: 1.5, z: 2.8 } },
      ],
    },
  },

  {
    schemaV: 1,
    roomId: "research-lab",
    name: "Research Lab",
    roomType: "lab",
    floor: 1,
    members: ["researcher-subagent"],
    sharedFiles: [
      ".agent/skills/repo-map.yaml",
      ".agent/skills/change-impact.yaml",
      ".agent/skills/context-curator.yaml",
    ],
    summaryMode: "concise",
    maxOccupancy: 3,
    accessPolicy: "members-only",
    tags: ["research", "analysis", "readonly"],
    notes:
      "Research and discovery workspace. Repo mapping, impact analysis, and context gathering happen here. Read-only operations.",
    hierarchyPosition: {
      floorIndex: 2,
      hierarchyDepth: 0,
      isMainCorridorAccessible: true,
      adjacentRoomIds: ["corridor-main"],
    },
    spatial: {
      position: { x: 0, y: 3, z: 3 },
      dimensions: { w: 4, h: 3, d: 3 },
      colorAccent: "#AB47BC",
      icon: "research",
      cameraPreset: "isometric",
      doorPositions: [{ wall: "east", offset: 1.5 }],
      windowPositions: [{ wall: "north", offset: 1, width: 2 }],
      furnitureSlots: [
        { type: "analysis-desk", position: { x: 2, y: 0, z: 1.5 } },
        {
          type: "knowledge-graph-display",
          position: { x: 2, y: 1.5, z: 2.8 },
        },
        { type: "file-browser-terminal", position: { x: 0.5, y: 0, z: 0.5 } },
      ],
    },
  },

  {
    schemaV: 1,
    roomId: "validation-office",
    name: "Validation Office",
    roomType: "office",
    floor: 1,
    members: ["validator-sentinel"],
    sharedFiles: [
      ".agent/skills/verify-runner.yaml",
      ".agent/skills/quality-validator.yaml",
      ".agent/policies/gates.yaml",
    ],
    summaryMode: "verbose",
    maxOccupancy: 2,
    accessPolicy: "members-only",
    tags: ["validation", "review", "gate"],
    notes:
      "Quality gate and verification workspace. The validator agent reviews evidence before completion and surfaces blockers.",
    hierarchyPosition: {
      floorIndex: 3,
      hierarchyDepth: 0,
      isMainCorridorAccessible: true,
      adjacentRoomIds: ["corridor-main"],
    },
    spatial: {
      position: { x: 9, y: 3, z: 0 },
      dimensions: { w: 3, h: 3, d: 3 },
      colorAccent: "#EF5350",
      icon: "shield",
      cameraPreset: "close-up",
      doorPositions: [{ wall: "west", offset: 1.5 }],
      windowPositions: [{ wall: "east", offset: 0.5, width: 2 }],
      furnitureSlots: [
        { type: "review-desk", position: { x: 1.5, y: 0, z: 1.5 } },
        { type: "gate-status-board", position: { x: 1.5, y: 1.5, z: 2.8 } },
      ],
    },
  },

  {
    schemaV: 1,
    roomId: "review-office",
    name: "Frontend Review Office",
    roomType: "office",
    floor: 1,
    members: ["frontend-reviewer"],
    sharedFiles: [".agent/skills/frontend-skill.yaml"],
    summaryMode: "concise",
    maxOccupancy: 2,
    accessPolicy: "members-only",
    tags: ["review", "frontend", "ui"],
    notes:
      "Frontend review workspace. UI review, accessibility scanning, and refactor planning happen here.",
    hierarchyPosition: {
      floorIndex: 4,
      hierarchyDepth: 0,
      isMainCorridorAccessible: true,
      adjacentRoomIds: ["corridor-main"],
    },
    spatial: {
      position: { x: 9, y: 3, z: 3 },
      dimensions: { w: 3, h: 3, d: 3 },
      colorAccent: "#42A5F5",
      icon: "eye",
      cameraPreset: "close-up",
      doorPositions: [{ wall: "west", offset: 1.5 }],
      furnitureSlots: [
        { type: "review-desk", position: { x: 1.5, y: 0, z: 1.5 } },
        { type: "ui-preview-screen", position: { x: 1.5, y: 1.5, z: 2.8 } },
      ],
    },
  },

  {
    schemaV: 1,
    roomId: "corridor-main",
    name: "Main Corridor",
    roomType: "corridor",
    floor: 1,
    members: [],
    sharedFiles: [],
    summaryMode: "silent",
    maxOccupancy: 0,
    accessPolicy: "open",
    tags: ["connector", "navigation"],
    notes:
      "Central corridor connecting all first-floor rooms. No agents reside here; serves as spatial connector and navigation pathway.",
    hierarchyPosition: {
      floorIndex: 5,
      hierarchyDepth: 0,
      isMainCorridorAccessible: true,
      adjacentRoomIds: [
        "stairwell",
        "impl-office",
        "research-lab",
        "validation-office",
        "review-office",
      ],
    },
    spatial: {
      position: { x: 4, y: 3, z: 3 },
      dimensions: { w: 5, h: 3, d: 1 },
      colorAccent: "#546E7A",
      icon: "corridor",
      cameraPreset: "overhead",
      doorPositions: [
        { wall: "west", offset: 0.5 },
        { wall: "east", offset: 0.5 },
      ],
      furnitureSlots: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Default exported registry (ready-to-use by the 3D layer)
// ---------------------------------------------------------------------------

/**
 * The canonical room registry populated from all .agent/rooms/*.yaml files.
 * Consumers (3D renderer, control-plane, event reducers) should import this
 * singleton rather than re-parsing YAML at runtime.
 *
 * @example
 * ```ts
 * import { ROOM_REGISTRY, getRoomById } from "@conitens/protocol";
 *
 * const room = getRoomById(ROOM_REGISTRY, "ops-control");
 * console.log(room?.spatial.colorAccent); // "#FF7043"
 * ```
 */
export const ROOM_REGISTRY: RoomRegistry = buildRoomRegistry(
  ROOM_DEFS,
  BUILDING_DEF,
);

/**
 * Ordered list of all known room IDs for iteration.
 * Guaranteed stable across hot-reloads.
 */
export const ROOM_IDS = ROOM_DEFS.map((r) => r.roomId) as readonly string[];
