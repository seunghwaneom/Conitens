/**
 * FloorPlanSkeleton — Architectural floor plan wireframe overlay.
 *
 * Sub-AC 2: Single-building shell — floor plan skeleton layer.
 *
 * Renders each room's footprint as colored LineSegments on the floor surface
 * of every building level. This provides:
 *   - An always-visible spatial reference for room boundaries regardless of LOD
 *   - Blueprint-style "architectural drawing" aesthetic (dark command-center theme)
 *   - Orienteering aid at any camera distance or zoom level
 *   - Room-type color coding so navigation is intuitive even at the FAR LOD tier
 *
 * Design principles:
 *   - Geometry-only (no HTML overlays) — stays inside the 3D world (diegetic)
 *   - Low cost: one LineSegments per floor, combined BufferGeometry
 *   - Depth-offset via polygonOffset so lines sit cleanly above the floor slab
 *   - All geometry built from the live building definition (spatial store) so
 *     changes made via YAML hot-reload or topology editor are reflected instantly
 *
 * Rendering stack position:
 *   BuildingShell (exterior walls/floors)
 *     └─ FloorPlanSkeleton        ← this component (floor-level wireframes)
 *        └─ RoomGeometry / HierarchySceneGraph (full room geometry)
 *
 * Performance:
 *   One BufferGeometry per floor, rebuilt only when building definition changes.
 *   At runtime, each floor adds ~160 vertices for a 9-room layout — negligible GPU cost.
 *
 * @see BuildingShell.tsx — exterior shell this skeleton lives inside
 * @see SceneHierarchy.tsx — full LOD room rendering that overlays the skeleton
 */

import { useMemo } from "react";
import * as THREE from "three";
import { useSpatialStore } from "../store/spatial-store.js";
import type { RoomDef } from "../data/building.js";

// ── Constants ────────────────────────────────────────────────────────────────

/** Height of each floor in world units (must match building.ts / RoomGeometry.tsx) */
const FLOOR_HEIGHT = 3;

/** Vertical offset above the floor slab to avoid z-fighting */
const FLOOR_SURFACE_OFFSET = 0.018;

/** Door gap width in world units — used to draw door notches in room outlines */
const DOOR_GAP = 0.7;

/** Opacity for the room outline lines */
const LINE_OPACITY = 0.45;

/** Opacity for the room center cross-hair (dimmer than outline) */
const CROSSHAIR_OPACITY = 0.18;

/** Cross-hair arm length as a fraction of the shorter room dimension */
const CROSSHAIR_FRACTION = 0.25;

// ── Types ────────────────────────────────────────────────────────────────────

interface FloorPlanSkeletonProps {
  /**
   * Overall opacity multiplier applied to all lines.
   * Useful for fading the skeleton when the scene drills into a specific room.
   * @default 1.0
   */
  opacityScale?: number;

  /**
   * When false the component renders nothing.
   * @default true
   */
  visible?: boolean;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Build a flat array of Vector3 pairs (line segments) representing the outline
 * of one room on the floor plane.
 *
 * Door openings are represented as small gaps in the outline — the wall segment
 * is split around the opening so a notch is visible in the blueprint.
 *
 * @param room      Room definition from the spatial store
 * @param floorY    World-space Y coordinate for this floor's surface
 * @returns         Alternating start/end Vector3 pairs for BufferGeometry
 */
function buildRoomOutline(room: RoomDef, floorY: number): THREE.Vector3[] {
  const { x: rx, z: rz } = room.position;
  const { x: rw, z: rd } = room.dimensions;
  const pts: THREE.Vector3[] = [];

  // Helper: push a single line segment (2 points)
  const seg = (ax: number, az: number, bx: number, bz: number) => {
    pts.push(new THREE.Vector3(ax, floorY, az));
    pts.push(new THREE.Vector3(bx, floorY, bz));
  };

  // Build the four wall edges, inserting door gaps where defined
  const doorsByWall: Record<string, number[]> = { north: [], south: [], east: [], west: [] };
  for (const door of room.doors) {
    doorsByWall[door.wall]?.push(door.offset);
  }

  // South edge (z = rz, x from rx → rx+rw)
  {
    const offsets = doorsByWall["south"] ?? [];
    let cursor = rx;
    for (const off of offsets.slice().sort((a, b) => a - b)) {
      const gapStart = rx + off - DOOR_GAP / 2;
      const gapEnd   = rx + off + DOOR_GAP / 2;
      if (gapStart > cursor) seg(cursor, rz, gapStart, rz);
      cursor = gapEnd;
    }
    if (cursor < rx + rw) seg(cursor, rz, rx + rw, rz);
  }

  // North edge (z = rz+rd, x from rx+rw → rx)
  {
    const offsets = doorsByWall["north"] ?? [];
    let cursor = rx + rw;
    for (const off of offsets.slice().sort((a, b) => b - a)) {
      const gapStart = rx + off + DOOR_GAP / 2;
      const gapEnd   = rx + off - DOOR_GAP / 2;
      if (gapStart < cursor) seg(cursor, rz + rd, gapStart, rz + rd);
      cursor = gapEnd;
    }
    if (cursor > rx) seg(cursor, rz + rd, rx, rz + rd);
  }

  // East edge (x = rx+rw, z from rz → rz+rd)
  {
    const offsets = doorsByWall["east"] ?? [];
    let cursor = rz;
    for (const off of offsets.slice().sort((a, b) => a - b)) {
      const gapStart = rz + off - DOOR_GAP / 2;
      const gapEnd   = rz + off + DOOR_GAP / 2;
      if (gapStart > cursor) seg(rx + rw, cursor, rx + rw, gapStart);
      cursor = gapEnd;
    }
    if (cursor < rz + rd) seg(rx + rw, cursor, rx + rw, rz + rd);
  }

  // West edge (x = rx, z from rz+rd → rz)
  {
    const offsets = doorsByWall["west"] ?? [];
    let cursor = rz + rd;
    for (const off of offsets.slice().sort((a, b) => b - a)) {
      const gapStart = rz + off + DOOR_GAP / 2;
      const gapEnd   = rz + off - DOOR_GAP / 2;
      if (gapStart < cursor) seg(rx, cursor, rx, gapStart);
      cursor = gapEnd;
    }
    if (cursor > rz) seg(rx, cursor, rx, rz);
  }

  return pts;
}

/**
 * Build cross-hair center marker for a room (thin + symbol at the room's center).
 *
 * @param room      Room definition
 * @param floorY    World-space Y for the floor surface
 * @returns         4 Vector3 points (2 segments: horizontal + vertical arm)
 */
function buildRoomCrossHair(room: RoomDef, floorY: number): THREE.Vector3[] {
  const cx = room.position.x + room.dimensions.x / 2;
  const cz = room.position.z + room.dimensions.z / 2;
  const arm = Math.min(room.dimensions.x, room.dimensions.z) * CROSSHAIR_FRACTION;
  const y = floorY + 0.001; // Slightly above outline to avoid z-fight

  return [
    new THREE.Vector3(cx - arm, y, cz),
    new THREE.Vector3(cx + arm, y, cz),
    new THREE.Vector3(cx, y, cz - arm),
    new THREE.Vector3(cx, y, cz + arm),
  ];
}

// ── Per-floor geometry builder ───────────────────────────────────────────────

interface FloorSkeletonGeometry {
  /** Combined outline geometry for all rooms on this floor */
  outlines: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }>;
  /** Combined cross-hair geometry for all rooms on this floor */
  crossHairs: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }>;
}

function buildFloorGeometry(rooms: RoomDef[], floorIndex: number): FloorSkeletonGeometry {
  // Floor surface Y — rooms on floor N start at y = N * FLOOR_HEIGHT
  const floorY = floorIndex * FLOOR_HEIGHT + FLOOR_SURFACE_OFFSET;

  const outlines: FloorSkeletonGeometry["outlines"] = [];
  const crossHairs: FloorSkeletonGeometry["crossHairs"] = [];

  for (const room of rooms) {
    const accentColor = new THREE.Color(room.colorAccent);

    // Room outline
    const outlinePts = buildRoomOutline(room, floorY);
    if (outlinePts.length >= 2) {
      outlines.push({
        geometry: new THREE.BufferGeometry().setFromPoints(outlinePts),
        color: accentColor,
      });
    }

    // Center cross-hair
    const chPts = buildRoomCrossHair(room, floorY);
    if (chPts.length === 4) {
      crossHairs.push({
        geometry: new THREE.BufferGeometry().setFromPoints(chPts),
        color: accentColor,
      });
    }
  }

  return { outlines, crossHairs };
}

// ── Main component ───────────────────────────────────────────────────────────

/**
 * FloorPlanSkeleton
 *
 * Renders a thin-line architectural blueprint for every floor in the building.
 * Each room is outlined in its accent color; a subtle cross-hair marks the center.
 *
 * The component rebuilds its geometry only when the building definition changes,
 * making it safe to leave mounted at all times.
 */
export function FloorPlanSkeleton({
  opacityScale = 1.0,
  visible = true,
}: FloorPlanSkeletonProps) {
  const building = useSpatialStore((s) => s.building);

  // Build floor geometry — memoized to the building definition
  const floorGeometries = useMemo<Array<{
    floor: number;
    data: FloorSkeletonGeometry;
  }>>(() => {
    return building.floors.map((floorDef) => {
      // Collect rooms that belong to this floor
      const rooms = building.rooms.filter((r) => {
        // Stairwell (spans multiple floors) appears on both floors
        if (r.roomId === "stairwell") {
          return floorDef.floor === 0 || floorDef.floor === 1;
        }
        return r.floor === floorDef.floor;
      });
      return {
        floor: floorDef.floor,
        data: buildFloorGeometry(rooms, floorDef.floor),
      };
    });
  }, [building]);

  if (!visible) return null;

  return (
    <group name="floor-plan-skeleton">
      {floorGeometries.map(({ floor, data }) => (
        <group key={floor} name={`floor-plan-skeleton-floor-${floor}`}>
          {/* Room outlines — accent-colored, moderate opacity */}
          {data.outlines.map((entry, i) => (
            <lineSegments key={`outline-${i}`} geometry={entry.geometry}>
              <lineBasicMaterial
                color={entry.color}
                transparent
                opacity={LINE_OPACITY * opacityScale}
                depthWrite={false}
              />
            </lineSegments>
          ))}

          {/* Center cross-hairs — softer, structural reference markers */}
          {data.crossHairs.map((entry, i) => (
            <lineSegments key={`crosshair-${i}`} geometry={entry.geometry}>
              <lineBasicMaterial
                color={entry.color}
                transparent
                opacity={CROSSHAIR_OPACITY * opacityScale}
                depthWrite={false}
              />
            </lineSegments>
          ))}
        </group>
      ))}
    </group>
  );
}
