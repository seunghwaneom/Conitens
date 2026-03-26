/**
 * Building & Room data derived from .agent/rooms/ YAML configuration.
 *
 * This is the canonical spatial layout for the 3D command center.
 * In production, this would be loaded dynamically from YAML; for the
 * initial shell we embed the data directly for fast iteration.
 *
 * Coordinate system:
 *   x = left-right (width)
 *   y = up-down (height / floors)
 *   z = front-back (depth)
 *
 * All units are in grid cells. 1 grid cell = 1 Three.js unit.
 */

// ── Types ──────────────────────────────────────────────────────────

export type RoomType = "control" | "office" | "lab" | "lobby" | "archive" | "corridor";

/** Camera preset names — matched to _schema.yaml camera_preset enum */
export type CameraPreset = "overhead" | "isometric" | "close-up";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface DoorPosition {
  wall: "north" | "south" | "east" | "west";
  offset: number;
}

export interface WindowPosition {
  wall: "north" | "south" | "east" | "west";
  offset: number;
  width: number;
}

export interface FurnitureSlot {
  type: string;
  position: Vec3;
}

export interface RoomMeta {
  tags: string[];
  notes: string;
  accessPolicy: "open" | "members-only" | "approval-required";
  maxOccupancy: number;
  summaryMode: "concise" | "verbose" | "silent";
  sharedFiles: string[];
}

/**
 * 3D position hint — all spatial data needed to place and orient a room.
 *
 * Extracted from the YAML `spatial:` block and surfaced as a first-class
 * field on RoomDef so that the 3D scene can locate and orient each room
 * without reading raw YAML at runtime.
 */
export interface RoomPositionHint {
  /** Grid origin of the room (x, y=floor*floorHeight, z) */
  position: Vec3;
  /** Width (x), height (y), depth (z) in grid units */
  dimensions: Vec3;
  /** Computed center in world space */
  center: Vec3;
  /** Default camera angle for this room */
  cameraPreset: CameraPreset;
}

export interface RoomDef {
  roomId: string;
  name: string;
  roomType: RoomType;
  floor: number;
  members: string[];
  colorAccent: string;
  icon: string;
  /** Grid origin on floor plan (from YAML spatial.position) */
  position: Vec3;
  /** Extents in grid units (from YAML spatial.dimensions w/h/d) */
  dimensions: Vec3;
  /** Packed position hint for 3D scene placement */
  positionHint: RoomPositionHint;
  /** Default camera preset for this room */
  cameraPreset: CameraPreset;
  doors: DoorPosition[];
  windows: WindowPosition[];
  furniture: FurnitureSlot[];
  /** Extended metadata from YAML — available when loaded dynamically */
  _meta?: RoomMeta;
}

export interface FloorDef {
  floor: number;
  name: string;
  gridW: number;
  gridD: number;
  roomIds: string[];
}

export interface BuildingDef {
  buildingId: string;
  name: string;
  style: string;
  floors: FloorDef[];
  rooms: RoomDef[];
  visual: {
    wallColor: string;
    floorColor: string;
    ceilingColor: string;
    ambientLight: string;
    accentGlowIntensity: number;
    gridVisible: boolean;
    gridColor: string;
  };
  agentAssignments: Record<string, string>;
  /** Room adjacency graph — loaded from _building.yaml */
  adjacency?: Record<string, string[]>;
}

// ── Helpers ──────────────────────────────────────────────────────

/** Compute a RoomPositionHint from position, dimensions, and cameraPreset */
function makePositionHint(
  position: Vec3,
  dimensions: Vec3,
  cameraPreset: CameraPreset,
): RoomPositionHint {
  return {
    position,
    dimensions,
    center: {
      x: position.x + dimensions.x / 2,
      y: position.y + dimensions.y / 2,
      z: position.z + dimensions.z / 2,
    },
    cameraPreset,
  };
}

// ── Building Data (from _building.yaml + room YAMLs) ──────────────

export const BUILDING: BuildingDef = {
  buildingId: "command-center",
  name: "Conitens Command Center",
  style: "low-poly-dark",
  floors: [
    {
      floor: 0,
      name: "Ground Floor",
      gridW: 12,
      gridD: 6,
      roomIds: ["project-main", "archive-vault", "stairwell"],
    },
    {
      floor: 1,
      name: "Operations Floor",
      gridW: 12,
      gridD: 6,
      roomIds: [
        "ops-control",
        "impl-office",
        "research-lab",
        "validation-office",
        "review-office",
        "corridor-main",
      ],
    },
  ],
  rooms: [
    // ── Ground Floor (0) ──
    {
      roomId: "project-main",
      name: "Project Main",
      roomType: "lobby",
      floor: 0,
      members: ["USER", "manager-default"],
      colorAccent: "#4FC3F7",
      icon: "lobby",
      cameraPreset: "isometric",
      position: { x: 4, y: 0, z: 0 },
      dimensions: { x: 4, y: 3, z: 4 },
      positionHint: makePositionHint(
        { x: 4, y: 0, z: 0 },
        { x: 4, y: 3, z: 4 },
        "isometric",
      ),
      doors: [
        { wall: "north", offset: 2 },
        { wall: "east", offset: 2 },
        { wall: "west", offset: 2 },
      ],
      windows: [],
      furniture: [
        { type: "reception-desk", position: { x: 2, y: 0, z: 1 } },
        { type: "status-board", position: { x: 2, y: 1.5, z: 3.8 } },
        { type: "hologram-table", position: { x: 2, y: 0.5, z: 2 } },
      ],
    },
    {
      roomId: "archive-vault",
      name: "Archive Vault",
      roomType: "archive",
      floor: 0,
      members: ["USER"],
      colorAccent: "#78909C",
      icon: "archive",
      cameraPreset: "isometric",
      position: { x: 8, y: 0, z: 0 },
      dimensions: { x: 4, y: 3, z: 4 },
      positionHint: makePositionHint(
        { x: 8, y: 0, z: 0 },
        { x: 4, y: 3, z: 4 },
        "isometric",
      ),
      doors: [{ wall: "west", offset: 2 }],
      windows: [],
      furniture: [
        { type: "replay-terminal", position: { x: 2, y: 0, z: 2 } },
        { type: "timeline-wall", position: { x: 2, y: 1.5, z: 3.8 } },
        { type: "event-log-shelf", position: { x: 3.5, y: 0, z: 1 } },
      ],
    },
    {
      roomId: "stairwell",
      name: "Central Stairwell",
      roomType: "corridor",
      floor: 0, // spans 0–1
      members: [],
      colorAccent: "#546E7A",
      icon: "stairs",
      cameraPreset: "isometric",
      position: { x: 4, y: 0, z: 4 },
      dimensions: { x: 2, y: 6, z: 2 },
      positionHint: makePositionHint(
        { x: 4, y: 0, z: 4 },
        { x: 2, y: 6, z: 2 },
        "isometric",
      ),
      doors: [
        { wall: "north", offset: 1 },
        { wall: "south", offset: 1 },
      ],
      windows: [],
      furniture: [],
    },

    // ── Operations Floor (1) ──
    {
      roomId: "ops-control",
      name: "Operations Control",
      roomType: "control",
      floor: 1,
      members: ["USER", "manager-default"],
      colorAccent: "#FF7043",
      icon: "command",
      cameraPreset: "overhead",
      position: { x: 4, y: 3, z: 0 },
      dimensions: { x: 5, y: 3, z: 4 },
      positionHint: makePositionHint(
        { x: 4, y: 3, z: 0 },
        { x: 5, y: 3, z: 4 },
        "overhead",
      ),
      doors: [
        { wall: "south", offset: 2.5 },
        { wall: "east", offset: 2 },
      ],
      windows: [{ wall: "south", offset: 1, width: 3 }],
      furniture: [
        { type: "command-desk", position: { x: 2.5, y: 0, z: 2 } },
        { type: "wall-monitor-array", position: { x: 2.5, y: 1.5, z: 3.8 } },
        { type: "approval-terminal", position: { x: 4, y: 0, z: 1 } },
        { type: "task-board", position: { x: 0.5, y: 1, z: 3.8 } },
      ],
    },
    {
      roomId: "impl-office",
      name: "Implementation Office",
      roomType: "office",
      floor: 1,
      members: ["implementer-subagent"],
      colorAccent: "#66BB6A",
      icon: "code",
      cameraPreset: "close-up",
      position: { x: 0, y: 3, z: 0 },
      dimensions: { x: 4, y: 3, z: 3 },
      positionHint: makePositionHint(
        { x: 0, y: 3, z: 0 },
        { x: 4, y: 3, z: 3 },
        "close-up",
      ),
      doors: [{ wall: "east", offset: 1.5 }],
      windows: [{ wall: "west", offset: 1, width: 2 }],
      furniture: [
        { type: "workstation", position: { x: 1, y: 0, z: 1.5 } },
        { type: "workstation", position: { x: 3, y: 0, z: 1.5 } },
        { type: "diff-screen", position: { x: 2, y: 1.5, z: 2.8 } },
      ],
    },
    {
      roomId: "research-lab",
      name: "Research Lab",
      roomType: "lab",
      floor: 1,
      members: ["researcher-subagent"],
      colorAccent: "#AB47BC",
      icon: "research",
      cameraPreset: "isometric",
      position: { x: 0, y: 3, z: 3 },
      dimensions: { x: 4, y: 3, z: 3 },
      positionHint: makePositionHint(
        { x: 0, y: 3, z: 3 },
        { x: 4, y: 3, z: 3 },
        "isometric",
      ),
      doors: [{ wall: "east", offset: 1.5 }],
      windows: [{ wall: "north", offset: 1, width: 2 }],
      furniture: [
        { type: "analysis-desk", position: { x: 2, y: 0, z: 1.5 } },
        { type: "knowledge-graph-display", position: { x: 2, y: 1.5, z: 2.8 } },
        { type: "file-browser-terminal", position: { x: 0.5, y: 0, z: 0.5 } },
      ],
    },
    {
      roomId: "corridor-main",
      name: "Main Corridor",
      roomType: "corridor",
      floor: 1,
      members: [],
      colorAccent: "#546E7A",
      icon: "corridor",
      cameraPreset: "overhead",
      position: { x: 4, y: 3, z: 3 },
      dimensions: { x: 5, y: 3, z: 1 },
      positionHint: makePositionHint(
        { x: 4, y: 3, z: 3 },
        { x: 5, y: 3, z: 1 },
        "overhead",
      ),
      doors: [
        { wall: "west", offset: 0.5 },
        { wall: "east", offset: 0.5 },
      ],
      windows: [],
      furniture: [],
    },
    {
      roomId: "validation-office",
      name: "Validation Office",
      roomType: "office",
      floor: 1,
      members: ["validator-sentinel"],
      colorAccent: "#EF5350",
      icon: "shield",
      cameraPreset: "close-up",
      position: { x: 9, y: 3, z: 0 },
      dimensions: { x: 3, y: 3, z: 3 },
      positionHint: makePositionHint(
        { x: 9, y: 3, z: 0 },
        { x: 3, y: 3, z: 3 },
        "close-up",
      ),
      doors: [{ wall: "west", offset: 1.5 }],
      windows: [{ wall: "east", offset: 0.5, width: 2 }],
      furniture: [
        { type: "review-desk", position: { x: 1.5, y: 0, z: 1.5 } },
        { type: "gate-status-board", position: { x: 1.5, y: 1.5, z: 2.8 } },
      ],
    },
    {
      roomId: "review-office",
      name: "Frontend Review Office",
      roomType: "office",
      floor: 1,
      members: ["frontend-reviewer"],
      colorAccent: "#42A5F5",
      icon: "eye",
      cameraPreset: "close-up",
      position: { x: 9, y: 3, z: 3 },
      dimensions: { x: 3, y: 3, z: 3 },
      positionHint: makePositionHint(
        { x: 9, y: 3, z: 3 },
        { x: 3, y: 3, z: 3 },
        "close-up",
      ),
      doors: [{ wall: "west", offset: 1.5 }],
      windows: [],
      furniture: [
        { type: "review-desk", position: { x: 1.5, y: 0, z: 1.5 } },
        { type: "ui-preview-screen", position: { x: 1.5, y: 1.5, z: 2.8 } },
      ],
    },
  ],
  visual: {
    wallColor: "#1E1E2E",
    floorColor: "#2D2D3D",
    ceilingColor: "#15151F",
    ambientLight: "#303050",
    accentGlowIntensity: 0.6,
    gridVisible: true,
    gridColor: "#3D3D5C",
  },
  agentAssignments: {
    USER: "project-main",
    "manager-default": "ops-control",
    "implementer-subagent": "impl-office",
    "researcher-subagent": "research-lab",
    "validator-sentinel": "validation-office",
    "frontend-reviewer": "review-office",
  },
};

/** Convenience: get rooms for a specific floor */
export function getRoomsForFloor(floor: number): RoomDef[] {
  return BUILDING.rooms.filter((r) => {
    // Stairwell spans floors — show on both
    if (r.roomId === "stairwell") return floor === 0 || floor === 1;
    return r.floor === floor;
  });
}

/** Get a room by ID */
export function getRoomById(roomId: string): RoomDef | undefined {
  return BUILDING.rooms.find((r) => r.roomId === roomId);
}

/** Get agent's assigned room */
export function getAgentRoom(agentId: string): RoomDef | undefined {
  const roomId = BUILDING.agentAssignments[agentId];
  return roomId ? getRoomById(roomId) : undefined;
}
