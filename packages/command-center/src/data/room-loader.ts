/**
 * room-loader.ts — Dynamic YAML room config parser.
 *
 * Reads .agent/rooms/ YAML configs and converts them into the typed
 * RoomDef / BuildingDef structures consumed by the 3D scene.
 *
 * Supports two modes:
 *   1. Build-time: Vite virtual module injects raw YAML strings
 *   2. Runtime:    Fetch from dev server or API endpoint
 *
 * Falls back to the static BUILDING data if loading fails.
 */
import { parse as parseYaml } from "yaml";
import type {
  RoomDef,
  RoomType,
  CameraPreset,
  DoorPosition,
  WindowPosition,
  FurnitureSlot,
  Vec3,
  FloorDef,
  BuildingDef,
} from "./building.js";
import { NEEDS_PLACEMENT_SENTINEL } from "./procedural-layout.js";
import type {
  RoomMappingConfig,
  AgentRole,
  CapabilityFallback,
  SpecialAssignment,
  RoleRoomMapping,
} from "./room-mapping-resolver.js";

// ── Raw YAML shape types ─────────────────────────────────────────────

interface RawRoomSpatial {
  position?: { x: number; y: number; z: number };
  dimensions?: { w: number; h: number; d: number };
  color_accent?: string;
  icon?: string;
  camera_preset?: string;
  door_positions?: Array<{ wall: string; offset: number }>;
  window_positions?: Array<{ wall: string; offset: number; width: number }>;
  furniture_slots?: Array<{ type: string; position: { x: number; y: number; z: number } }>;
}

interface RawRoomConfig {
  schema_v: number;
  room_id: string;
  name: string;
  room_type: string;
  floor: number;
  members: string[];
  shared_files?: string[];
  summary_mode?: string;
  max_occupancy?: number;
  access_policy?: string;
  tags?: string[];
  notes?: string;
  /** Optional — rooms without a spatial block are auto-placed by procedural-layout */
  spatial?: RawRoomSpatial;
}

interface RawBuildingFloor {
  floor: number;
  name: string;
  grid: { w: number; d: number };
  rooms: string[];
}

interface RawBuildingConfig {
  schema_v: number;
  building_id: string;
  name: string;
  style: string;
  floors: number;
  floor_plan: RawBuildingFloor[];
  agent_assignments: Record<string, string>;
  adjacency: Record<string, string[]>;
  visual_defaults: {
    wall_color: string;
    floor_color: string;
    ceiling_color: string;
    ambient_light: string;
    accent_glow_intensity: number;
    grid_visible: boolean;
    grid_color: string;
  };
}

// ── Parser Functions ─────────────────────────────────────────────────

/** Parse a single room YAML string into a RoomDef */
export function parseRoomYaml(yamlStr: string): RoomDef {
  const raw = parseYaml(yamlStr) as RawRoomConfig;
  return rawRoomToRoomDef(raw);
}

/** Convert a raw YAML room config to a typed RoomDef */
export function rawRoomToRoomDef(raw: RawRoomConfig): RoomDef {
  const spatial = raw.spatial;
  const floor = raw.floor ?? 0;
  const floorY = floor * 3;

  // ── Handle rooms with NO spatial block ───────────────────────────────
  // Rooms without explicit `spatial:` are assigned a sentinel position so
  // that the procedural-layout engine can auto-place them on the floor grid.
  if (!spatial || !spatial.position || !spatial.dimensions) {
    const sentinelPos: Vec3 = { x: NEEDS_PLACEMENT_SENTINEL, y: floorY, z: NEEDS_PLACEMENT_SENTINEL };
    const defaultDims: Vec3 = { x: 2, y: 3, z: 2 };
    const cameraPreset = (spatial?.camera_preset ?? "isometric") as CameraPreset;

    return {
      roomId: raw.room_id,
      name: raw.name,
      roomType: raw.room_type as RoomType,
      floor,
      members: raw.members ?? [],
      colorAccent: spatial?.color_accent ?? "#546E7A",
      icon: spatial?.icon ?? "default",
      cameraPreset,
      position: sentinelPos,
      dimensions: defaultDims,
      positionHint: {
        position: sentinelPos,
        dimensions: defaultDims,
        center: {
          x: sentinelPos.x + defaultDims.x / 2,
          y: sentinelPos.y + defaultDims.y / 2,
          z: sentinelPos.z + defaultDims.z / 2,
        },
        cameraPreset,
      },
      doors: [],
      windows: [],
      furniture: [],
      _meta: {
        tags: raw.tags ?? [],
        notes: raw.notes ?? "",
        accessPolicy: (raw.access_policy ?? "open") as "open" | "members-only" | "approval-required",
        maxOccupancy: raw.max_occupancy ?? 0,
        summaryMode: (raw.summary_mode ?? "concise") as "concise" | "verbose" | "silent",
        sharedFiles: raw.shared_files ?? [],
      },
    };
  }

  // ── Rooms with explicit spatial block ────────────────────────────────
  const doors: DoorPosition[] = (spatial.door_positions ?? []).map((d) => ({
    wall: d.wall as DoorPosition["wall"],
    offset: d.offset,
  }));

  const windows: WindowPosition[] = (spatial.window_positions ?? []).map((w) => ({
    wall: w.wall as WindowPosition["wall"],
    offset: w.offset,
    width: w.width,
  }));

  const furniture: FurnitureSlot[] = (spatial.furniture_slots ?? []).map((f) => ({
    type: f.type,
    position: { x: f.position.x, y: f.position.y, z: f.position.z },
  }));

  const cameraPreset = (spatial.camera_preset ?? "isometric") as CameraPreset;

  const position: Vec3 = {
    x: spatial.position.x,
    y: spatial.position.y,
    z: spatial.position.z,
  };
  const dimensions: Vec3 = {
    x: spatial.dimensions.w,
    y: spatial.dimensions.h,
    z: spatial.dimensions.d,
  };

  return {
    roomId: raw.room_id,
    name: raw.name,
    roomType: raw.room_type as RoomType,
    floor,
    members: raw.members ?? [],
    colorAccent: spatial.color_accent ?? "#546E7A",
    icon: spatial.icon ?? "default",
    cameraPreset,
    position,
    dimensions,
    // Packed position hint: position + dimensions + center + cameraPreset
    positionHint: {
      position,
      dimensions,
      center: {
        x: position.x + dimensions.x / 2,
        y: position.y + dimensions.y / 2,
        z: position.z + dimensions.z / 2,
      },
      cameraPreset,
    },
    doors,
    windows,
    furniture,
    // Extended metadata (preserved for diegetic display)
    _meta: {
      tags: raw.tags ?? [],
      notes: raw.notes ?? "",
      accessPolicy: (raw.access_policy ?? "open") as "open" | "members-only" | "approval-required",
      maxOccupancy: raw.max_occupancy ?? 0,
      summaryMode: (raw.summary_mode ?? "concise") as "concise" | "verbose" | "silent",
      sharedFiles: raw.shared_files ?? [],
    },
  };
}

/** Parse the _building.yaml into a BuildingDef (without rooms — those come from individual files) */
export function parseBuildingYaml(yamlStr: string): Omit<BuildingDef, "rooms"> & { rooms: RoomDef[] } {
  const raw = parseYaml(yamlStr) as RawBuildingConfig;

  const floors: FloorDef[] = raw.floor_plan.map((fp) => ({
    floor: fp.floor,
    name: fp.name,
    gridW: fp.grid.w,
    gridD: fp.grid.d,
    roomIds: fp.rooms,
  }));

  return {
    buildingId: raw.building_id,
    name: raw.name,
    style: raw.style,
    floors,
    rooms: [], // populated by individual room files
    visual: {
      wallColor: raw.visual_defaults.wall_color,
      floorColor: raw.visual_defaults.floor_color,
      ceilingColor: raw.visual_defaults.ceiling_color,
      ambientLight: raw.visual_defaults.ambient_light,
      accentGlowIntensity: raw.visual_defaults.accent_glow_intensity,
      gridVisible: raw.visual_defaults.grid_visible,
      gridColor: raw.visual_defaults.grid_color,
    },
    agentAssignments: raw.agent_assignments,
    adjacency: raw.adjacency,
  };
}

/**
 * Build a complete BuildingDef from raw YAML sources.
 *
 * @param buildingYaml - Contents of _building.yaml
 * @param roomYamls    - Map of filename → YAML content for each room file
 */
export function buildFromYaml(
  buildingYaml: string,
  roomYamls: Record<string, string>,
): BuildingDef {
  const building = parseBuildingYaml(buildingYaml);

  const rooms: RoomDef[] = [];
  for (const [filename, yaml] of Object.entries(roomYamls)) {
    // Skip schema and building files
    if (filename.startsWith("_")) continue;
    try {
      rooms.push(parseRoomYaml(yaml));
    } catch (err) {
      console.warn(`[room-loader] Failed to parse ${filename}:`, err);
    }
  }

  building.rooms = rooms;
  return building as BuildingDef;
}

/**
 * Fetch room configs from the dev server at runtime.
 * Expects the Vite dev server to serve .agent/rooms/ via the public dir or a plugin.
 */
export async function fetchRoomConfigs(
  basePath = "/__rooms__",
): Promise<BuildingDef | null> {
  try {
    // Fetch the manifest (list of room files)
    const manifestRes = await fetch(`${basePath}/manifest.json`);
    if (!manifestRes.ok) return null;

    const manifest = (await manifestRes.json()) as {
      building: string;
      rooms: string[];
    };

    // Fetch building config
    const buildingRes = await fetch(`${basePath}/${manifest.building}`);
    if (!buildingRes.ok) return null;
    const buildingYaml = await buildingRes.text();

    // Fetch all room configs in parallel
    const roomEntries = await Promise.all(
      manifest.rooms.map(async (filename) => {
        const res = await fetch(`${basePath}/${filename}`);
        if (!res.ok) return null;
        return [filename, await res.text()] as [string, string];
      }),
    );

    const roomYamls: Record<string, string> = {};
    for (const entry of roomEntries) {
      if (entry) roomYamls[entry[0]] = entry[1];
    }

    return buildFromYaml(buildingYaml, roomYamls);
  } catch (err) {
    console.warn("[room-loader] Failed to fetch room configs:", err);
    return null;
  }
}

// ── Room Mapping Parser ───────────────────────────────────────────────

/** Raw YAML shape of _room-mapping.yaml */
interface RawRoomMapping {
  schema_v: number;
  config_type: string;
  role_defaults: Record<string, { room_id: string; priority: number; reason: string }>;
  capability_fallbacks: Array<{ capability: string; room_id: string; reason: string }>;
  fallback_room: string;
  fallback_reason: string;
  special: Record<string, { room_id: string; reason: string }>;
}

/**
 * Parse a `_room-mapping.yaml` string into a typed RoomMappingConfig.
 *
 * This allows the room-mapping resolver to be driven by the live YAML file
 * rather than the hardcoded DEFAULT_ROOM_MAPPING constant.
 */
export function parseRoomMappingYaml(yamlStr: string): RoomMappingConfig {
  const raw = parseYaml(yamlStr) as RawRoomMapping;

  const roleDefaults: Partial<Record<AgentRole, RoleRoomMapping>> = {};
  for (const [role, mapping] of Object.entries(raw.role_defaults ?? {})) {
    roleDefaults[role as AgentRole] = {
      roomId: mapping.room_id,
      priority: mapping.priority,
      reason: mapping.reason,
    };
  }

  const capabilityFallbacks: CapabilityFallback[] = (raw.capability_fallbacks ?? []).map(
    (fb) => ({
      capability: fb.capability,
      roomId: fb.room_id,
      reason: fb.reason,
    }),
  );

  const special: Record<string, SpecialAssignment> = {};
  for (const [id, assignment] of Object.entries(raw.special ?? {})) {
    special[id] = {
      roomId: assignment.room_id,
      reason: assignment.reason,
    };
  }

  return {
    schemaVersion: raw.schema_v ?? 1,
    roleDefaults: roleDefaults as Record<AgentRole, RoleRoomMapping>,
    capabilityFallbacks,
    fallbackRoom: raw.fallback_room ?? "project-main",
    fallbackReason: raw.fallback_reason ?? "Unmatched agents default to the project lobby",
    special,
  };
}
