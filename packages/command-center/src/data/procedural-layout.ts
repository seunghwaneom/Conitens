/**
 * procedural-layout.ts — Spatial cell allocator for .agent/rooms/ schema.
 *
 * Takes the parsed room configs from .agent/rooms/*.yaml and assigns each
 * room a distinct, non-overlapping spatial cell on its floor grid.
 *
 * Algorithm:
 *   Pass 1 — Rooms with explicit `spatial.position` are validated and placed.
 *   Pass 2 — Rooms with sentinel position (-999) are auto-placed via first-fit
 *             row-scan on the remaining unoccupied floor cells.
 *
 * All placement decisions are logged for event sourcing / replay. This log
 * feeds into the `room.created` event stream on the spatial store.
 *
 * Design principle: Record transparency — every room's origin (yaml-explicit
 * vs auto-placed) is traceable from the placement log.
 */
import type { RoomDef, FloorDef, Vec3, RoomType } from "./building.js";

// ── Constants ──────────────────────────────────────────────────────────

/**
 * Sentinel x-position written by room-loader when a YAML room has no
 * explicit `spatial.position` block.  Detected here for auto-placement.
 */
export const NEEDS_PLACEMENT_SENTINEL = -999;

/** Default room dimensions (grid units) applied when auto-placing a room */
const DEFAULT_ROOM_DIMS: Record<RoomType, Vec3> = {
  control:  { x: 5, y: 3, z: 4 },
  office:   { x: 4, y: 3, z: 3 },
  lab:      { x: 4, y: 3, z: 3 },
  lobby:    { x: 4, y: 3, z: 4 },
  archive:  { x: 4, y: 3, z: 4 },
  corridor: { x: 5, y: 3, z: 1 },
};

// ── Types ──────────────────────────────────────────────────────────────

/** How a room's final spatial cell was determined */
export type PlacementSource = "yaml-explicit" | "auto-placed";

/**
 * Per-room placement record — written once, never mutated.
 *
 * Stored in the spatial store's `roomCreationLog` and emitted as
 * `room.created` events. Enables full replay and audit of how
 * every room was procedurally generated from the YAML schema.
 */
export interface RoomPlacementEntry {
  /** Unique room slug, matching RoomDef.roomId */
  roomId: string;
  /** Human-readable room name */
  name: string;
  /** Floor index (0 = ground, 1 = ops) */
  floor: number;
  /** How the position was determined */
  source: PlacementSource;
  /** Final world-space origin (grid units) */
  position: Vec3;
  /** Final extents in grid units */
  dimensions: Vec3;
  /**
   * IDs of rooms whose bounding boxes this room overlaps (> 1 cell overlap).
   * Touching/sharing walls is expected and not reported here.
   */
  overlapsWith: string[];
  /** Unix timestamp when the placement decision was made */
  placedAt: number;
}

/** Full result of the procedural layout pass */
export interface ProceduralLayoutResult {
  /** Rooms with final, validated/assigned positions */
  rooms: RoomDef[];
  /** Append-only log of every placement decision */
  placementLog: RoomPlacementEntry[];
  /**
   * Overlap warning strings (for console / HUD).
   * Warnings, not errors — overlapping rooms are still rendered.
   */
  overlapWarnings: string[];
  /** Room IDs that lacked explicit YAML spatial data and were auto-placed */
  autoPlacedIds: string[];
}

// ── Internal Geometry Helpers ──────────────────────────────────────────

/** Axis-aligned bounding rectangle on a single floor */
interface FloorRect {
  roomId: string;
  floor: number;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

/** Convert a RoomDef to its floor-plane bounding rect */
function toFloorRect(room: RoomDef): FloorRect {
  return {
    roomId: room.roomId,
    floor: room.floor,
    xMin: room.position.x,
    xMax: room.position.x + room.dimensions.x,
    zMin: room.position.z,
    zMax: room.position.z + room.dimensions.z,
  };
}

/**
 * Returns true when two floor rects share more than a wall-width of overlap.
 *
 * A shared-wall tolerance of 0.1 units is used so that adjacent rooms
 * (which intentionally touch) are not flagged as overlapping.
 */
function rectsOverlap(a: FloorRect, b: FloorRect, tolerance = 0.1): boolean {
  if (a.floor !== b.floor) return false;
  const xOverlap = a.xMin < b.xMax - tolerance && a.xMax > b.xMin + tolerance;
  const zOverlap = a.zMin < b.zMax - tolerance && a.zMax > b.zMin + tolerance;
  return xOverlap && zOverlap;
}

/**
 * First-fit row-scan: find the first unoccupied position on a floor
 * that fits the requested dimensions within the grid bounds.
 *
 * Scans row by row (z increments), then column by column (x increments),
 * stepping by 1 grid unit.
 *
 * @returns origin Vec3 if a slot was found; null if the floor is full.
 */
function firstFitPosition(
  dims: Vec3,
  floor: number,
  occupied: FloorRect[],
  gridW: number,
  gridD: number,
): Vec3 | null {
  const floorY = floor * 3;

  for (let z = 0; z + dims.z <= gridD; z++) {
    for (let x = 0; x + dims.x <= gridW; x++) {
      const candidate: FloorRect = {
        roomId: "__candidate__",
        floor,
        xMin: x,
        xMax: x + dims.x,
        zMin: z,
        zMax: z + dims.z,
      };

      const conflict = occupied.some(
        (r) => r.floor === floor && rectsOverlap(candidate, r, 0.01),
      );

      if (!conflict) {
        return { x, y: floorY, z };
      }
    }
  }

  return null; // No free slot — floor is at capacity
}

// ── Main Entry Point ───────────────────────────────────────────────────

/**
 * Apply the procedural layout pass to the parsed room list.
 *
 * Rooms are processed in two passes:
 *   1. Explicit — rooms with valid YAML `spatial.position` are validated
 *      and added to the occupancy map.
 *   2. Auto-placed — rooms with sentinel x-position are assigned the next
 *      available slot on their floor via first-fit row-scan.
 *
 * The returned `rooms` array preserves order; modified copies are returned
 * for auto-placed rooms (originals are not mutated).
 *
 * @param rooms  - Parsed RoomDef list from YAML (may contain sentinel positions)
 * @param floors - Floor definitions from _building.yaml (provides grid sizes)
 */
export function applyProceduralLayout(
  rooms: RoomDef[],
  floors: FloorDef[],
): ProceduralLayoutResult {
  // Build floor grid lookup (fallback: 12×6 — matches _building.yaml defaults)
  const floorGrid = new Map<number, { w: number; d: number }>();
  for (const f of floors) {
    floorGrid.set(f.floor, { w: f.gridW, d: f.gridD });
  }

  const ts = Date.now();
  const placementLog: RoomPlacementEntry[] = [];
  const overlapWarnings: string[] = [];
  const autoPlacedIds: string[] = [];
  const occupied: FloorRect[] = [];
  const result: RoomDef[] = [];

  // ── Pass 1: Explicit positions ───────────────────────────────────
  for (const room of rooms) {
    if (room.position.x === NEEDS_PLACEMENT_SENTINEL) continue;

    const rect = toFloorRect(room);
    const overlapsWith: string[] = [];

    for (const existing of occupied) {
      if (rectsOverlap(rect, existing)) {
        overlapsWith.push(existing.roomId);
        overlapWarnings.push(
          `[procedural-layout] "${room.roomId}" overlaps with "${existing.roomId}" ` +
            `on floor ${room.floor} — rooms may visually intersect`,
        );
      }
    }

    occupied.push(rect);
    result.push(room);

    placementLog.push({
      roomId: room.roomId,
      name: room.name,
      floor: room.floor,
      source: "yaml-explicit",
      position: { ...room.position },
      dimensions: { ...room.dimensions },
      overlapsWith,
      placedAt: ts,
    });
  }

  // ── Pass 2: Auto-placement ───────────────────────────────────────
  for (const room of rooms) {
    if (room.position.x !== NEEDS_PLACEMENT_SENTINEL) continue;

    const grid = floorGrid.get(room.floor) ?? { w: 12, d: 6 };
    const floorOccupied = occupied.filter((r) => r.floor === room.floor);

    // Use room's declared dimensions if valid, else apply type defaults
    const isValidDims = room.dimensions.x > 0 && room.dimensions.z > 0;
    const dims: Vec3 = isValidDims
      ? room.dimensions
      : (DEFAULT_ROOM_DIMS[room.roomType] ?? { x: 2, y: 3, z: 2 });

    const pos = firstFitPosition(dims, room.floor, floorOccupied, grid.w, grid.d);
    const finalPos: Vec3 = pos ?? { x: 0, y: room.floor * 3, z: 0 };

    if (!pos) {
      overlapWarnings.push(
        `[procedural-layout] "${room.roomId}" could not find free space on floor ` +
          `${room.floor} (grid ${grid.w}×${grid.d}) — placed at origin`,
      );
    }

    const finalDims: Vec3 = { x: dims.x, y: dims.y, z: dims.z };

    const placedRoom: RoomDef = {
      ...room,
      position: finalPos,
      dimensions: finalDims,
      positionHint: {
        position: finalPos,
        dimensions: finalDims,
        center: {
          x: finalPos.x + finalDims.x / 2,
          y: finalPos.y + finalDims.y / 2,
          z: finalPos.z + finalDims.z / 2,
        },
        cameraPreset: room.cameraPreset,
      },
    };

    occupied.push(toFloorRect(placedRoom));
    result.push(placedRoom);
    autoPlacedIds.push(room.roomId);

    placementLog.push({
      roomId: room.roomId,
      name: room.name,
      floor: room.floor,
      source: "auto-placed",
      position: finalPos,
      dimensions: finalDims,
      overlapsWith: [],
      placedAt: ts,
    });
  }

  return { rooms: result, placementLog, overlapWarnings, autoPlacedIds };
}

// ── Utility Exports ────────────────────────────────────────────────────

/**
 * Build a compact cell-occupancy summary string for debug / HUD display.
 *
 * Example:
 *   "ops-control [F1] x=[4,9] z=[0,4] (yaml-explicit)"
 */
export function formatPlacementEntry(entry: RoomPlacementEntry): string {
  const { position: p, dimensions: d } = entry;
  return (
    `${entry.roomId} [F${entry.floor}] ` +
    `x=[${p.x},${p.x + d.x}] z=[${p.z},${p.z + d.z}] ` +
    `(${entry.source})`
  );
}

/**
 * Validate that every room in the layout occupies a distinct,
 * non-overlapping spatial cell.  Returns a list of violation strings.
 *
 * Intended for CI / self-improvement analysis:
 *   const violations = validateDistinctCells(layout.placementLog);
 *   if (violations.length) console.warn(violations);
 */
export function validateDistinctCells(log: RoomPlacementEntry[]): string[] {
  const violations: string[] = [];

  for (let i = 0; i < log.length; i++) {
    for (let j = i + 1; j < log.length; j++) {
      const a = log[i];
      const b = log[j];
      if (a.floor !== b.floor) continue;

      const aRect: FloorRect = {
        roomId: a.roomId,
        floor: a.floor,
        xMin: a.position.x,
        xMax: a.position.x + a.dimensions.x,
        zMin: a.position.z,
        zMax: a.position.z + a.dimensions.z,
      };
      const bRect: FloorRect = {
        roomId: b.roomId,
        floor: b.floor,
        xMin: b.position.x,
        xMax: b.position.x + b.dimensions.x,
        zMin: b.position.z,
        zMax: b.position.z + b.dimensions.z,
      };

      if (rectsOverlap(aRect, bRect)) {
        violations.push(
          `[validateDistinctCells] "${a.roomId}" and "${b.roomId}" share space on floor ${a.floor}`,
        );
      }
    }
  }

  return violations;
}
