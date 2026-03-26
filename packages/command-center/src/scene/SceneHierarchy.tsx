/**
 * SceneHierarchy — 4-tier hierarchical LOD scene graph.
 *
 * Implements the canonical Conitens command-center world hierarchy:
 *
 *   Building → Floor (Office) → Room → Agent
 *
 * Each tier has three LOD (Level-of-Detail) representations:
 *
 *   NEAR  — full geometry; all walls, markers, labels, badges
 *   MID   — reduced geometry; outlines, floor/ceiling only, body silhouettes
 *   FAR   — minimal bounding volumes; colored indicators only
 *
 * LOD is computed per-tier via camera distance:
 *   - Building LOD is based on camera distance to building centre
 *   - Floor LOD is based on camera distance to floor centre
 *   - Room/Agent LOD is derived from the floor LOD for efficiency
 *     (when the floor is FAR, all room/agent detail is suppressed)
 *
 * Scene-graph group names follow:
 *   hierarchy-building
 *   └─ hierarchy-floor-{n}
 *      └─ hierarchy-room-{id}
 *         └─ hierarchy-agents-{roomId}
 *            └─ hierarchy-agent-{agentId}
 *
 * All rendering is purely additive; this module does NOT remove or replace
 * any existing scene components — CommandCenterScene.tsx decides which
 * rendering path to activate.
 */

import { useRef, useState, useMemo, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";

import { BUILDING } from "../data/building.js";
import type { RoomDef } from "../data/building.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore, type AgentRuntimeState } from "../store/agent-store.js";
import { ROLE_VISUALS, RoomTypeLegend } from "./RoomTypeVisuals.js";
import { BuildingShell } from "./BuildingShell.js";
import { FloorRooms } from "./RoomGeometry.js";
import { AgentAvatar } from "./AgentAvatar.js";
import { RoomMetricsBillboard } from "./MetricsBillboard.js";
import { useAgentSceneLoader } from "../hooks/use-agent-scene-loader.js";
import { DrillSelectionRing } from "./DrillSelectionRing.js";
import {
  computeEffectiveLOD,
  getFloorDrillRelationship,
  getAgentDrillRelationship,
  type LODLevel as PolicyLODLevel,
  type DrillLevel as PolicyDrillLevel,
} from "./lod-drill-policy.js";

// ─────────────────────────────────────────────────────────────────────────────
// LOD Thresholds (world units — 1 unit = 1 grid cell)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Building tier: distance from building centre to camera.
 * Must stay in sync with THRESHOLDS.building in lod-drill-policy.ts.
 */
const LOD_BUILDING_NEAR = 18;  // < 18 → full BuildingShell
const LOD_BUILDING_FAR  = 38;  // 18-38 → mid; > 38 → far

/**
 * Floor / office tier: distance from floor centre to camera.
 * Must stay in sync with THRESHOLDS.floor in lod-drill-policy.ts.
 */
const LOD_FLOOR_NEAR = 14;     // < 14 → full rooms + agents
const LOD_FLOOR_FAR  = 30;     // 14-30 → room footprints; > 30 → floor slab only

/**
 * Agent tier (used when floor is NEAR).
 * Must stay in sync with THRESHOLDS.agent in lod-drill-policy.ts.
 */
const LOD_AGENT_NEAR = 6;      // < 6 → full avatar
const LOD_AGENT_FAR  = 14;     // 6-14 → body silhouette; > 14 → dot

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discrete LOD level names.
 * Re-exported from lod-drill-policy.ts to keep the type unified.
 */
type LODLevel = PolicyLODLevel;

// ─────────────────────────────────────────────────────────────────────────────
// useLOD — reactive distance-based LOD hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a discrete LOD level based on camera distance from a world-space
 * centre point.  Only triggers a React re-render when the level changes,
 * keeping per-frame cost to a single distance calculation.
 */
function useLOD(
  cx: number,
  cy: number,
  cz: number,
  nearDist: number,
  farDist: number,
): LODLevel {
  const camera = useThree((s) => s.camera);
  const lodRef  = useRef<LODLevel>("mid");
  const [lod, setLod] = useState<LODLevel>("mid");
  const centre = useMemo(() => new THREE.Vector3(cx, cy, cz), [cx, cy, cz]);

  useFrame(() => {
    const dist = camera.position.distanceTo(centre);
    const next: LODLevel = dist < nearDist ? "near" : dist < farDist ? "mid" : "far";
    if (next !== lodRef.current) {
      lodRef.current = next;
      setLod(next);
    }
  });

  return lod;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDING tier LOD primitives
// ─────────────────────────────────────────────────────────────────────────────

const BLDG_W  = 12;
const BLDG_D  = 6;
const BLDG_H  = 6;   // 2 floors × 3 units
const BLDG_FL = 3;   // single floor height

/**
 * BuildingLODMid — Simplified building representation for mid-range distances.
 *
 * Renders the building as a set of edge lines + floor slab dividers with no
 * wall geometry.  Maintains spatial legibility without the full polygon budget
 * of BuildingShell.
 */
function BuildingLODMid() {
  const { wallColor, floorColor } = BUILDING.visual;

  const edgeGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const addEdge = (a: [number, number, number], b: [number, number, number]) => {
      pts.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
    };

    // Bottom perimeter
    addEdge([0, 0, 0],       [BLDG_W, 0, 0]);
    addEdge([BLDG_W, 0, 0],  [BLDG_W, 0, BLDG_D]);
    addEdge([BLDG_W, 0, BLDG_D], [0, 0, BLDG_D]);
    addEdge([0, 0, BLDG_D],  [0, 0, 0]);
    // Top perimeter
    addEdge([0, BLDG_H, 0],       [BLDG_W, BLDG_H, 0]);
    addEdge([BLDG_W, BLDG_H, 0],  [BLDG_W, BLDG_H, BLDG_D]);
    addEdge([BLDG_W, BLDG_H, BLDG_D], [0, BLDG_H, BLDG_D]);
    addEdge([0, BLDG_H, BLDG_D],  [0, BLDG_H, 0]);
    // Vertical edges
    addEdge([0, 0, 0],           [0, BLDG_H, 0]);
    addEdge([BLDG_W, 0, 0],      [BLDG_W, BLDG_H, 0]);
    addEdge([BLDG_W, 0, BLDG_D], [BLDG_W, BLDG_H, BLDG_D]);
    addEdge([0, 0, BLDG_D],      [0, BLDG_H, BLDG_D]);
    // Floor divider at y=3
    addEdge([0, BLDG_FL, 0],       [BLDG_W, BLDG_FL, 0]);
    addEdge([BLDG_W, BLDG_FL, 0],  [BLDG_W, BLDG_FL, BLDG_D]);
    addEdge([BLDG_W, BLDG_FL, BLDG_D], [0, BLDG_FL, BLDG_D]);
    addEdge([0, BLDG_FL, BLDG_D],  [0, BLDG_FL, 0]);

    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  const slabMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: floorColor,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: true,
    transparent: true,
    opacity: 0.6,
  }), [floorColor]);

  return (
    <group name="building-lod-mid">
      {/* Translucent ground slab */}
      <mesh
        position={[BLDG_W / 2, -0.05, BLDG_D / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={slabMat}
        receiveShadow
      >
        <planeGeometry args={[BLDG_W, BLDG_D]} />
      </mesh>

      {/* Edge wireframe */}
      <lineSegments geometry={edgeGeo}>
        <lineBasicMaterial color={wallColor} transparent opacity={0.65} />
      </lineSegments>

      {/* Accent glow at base */}
      <mesh position={[BLDG_W / 2, 0.02, -0.05]}>
        <boxGeometry args={[BLDG_W, 0.04, 0.06]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={0.4} />
      </mesh>

      {/* Floor count badge */}
      <Html
        position={[-1.0, BLDG_H / 2, BLDG_D / 2]}
        center
        distanceFactor={16}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            color: "#6666aa",
            fontSize: "8px",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
          }}
        >
          {BUILDING.name.toUpperCase()} · {BLDG_H / BLDG_FL}F
        </div>
      </Html>
    </group>
  );
}

/**
 * BuildingLODFar — Ultra-minimal building silhouette for distant views.
 *
 * Renders a single low-opacity box bounded to the building footprint.
 * This tier is only visible at zoom-out distances (>38 units from centre).
 */
function BuildingLODFar() {
  return (
    <group name="building-lod-far">
      {/* Bounding volume silhouette */}
      <mesh position={[BLDG_W / 2, BLDG_H / 2, BLDG_D / 2]}>
        <boxGeometry args={[BLDG_W, BLDG_H, BLDG_D]} />
        <meshStandardMaterial
          color="#1a1a2e"
          roughness={0.9}
          metalness={0.1}
          flatShading
          transparent
          opacity={0.35}
          wireframe={false}
        />
      </mesh>

      {/* Wireframe outline */}
      <mesh position={[BLDG_W / 2, BLDG_H / 2, BLDG_D / 2]}>
        <boxGeometry args={[BLDG_W, BLDG_H, BLDG_D]} />
        <meshBasicMaterial color="#4a4a6a" wireframe transparent opacity={0.5} />
      </mesh>

      {/* Blue accent dot at centre — location anchor */}
      <mesh position={[BLDG_W / 2, 0.05, BLDG_D / 2]}>
        <circleGeometry args={[0.6, 6]} />
        <meshBasicMaterial
          color="#4a6aff"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * BuildingClickZone — Invisible hit plane covering the building footprint.
 *
 * Used by the MID and FAR LOD representations (where BuildingShell is not
 * rendered) so the building remains clickable at all zoom levels.
 * At the "building" drill level clicking navigates into the first floor.
 */
function BuildingClickZone() {
  const drillLevel     = useSpatialStore((s) => s.drillLevel);
  const drillIntoFloor = useSpatialStore((s) => s.drillIntoFloor);
  const building       = useSpatialStore((s) => s.building);

  const [hovered, setHovered] = useState(false);

  const isActive = drillLevel === "building";

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (!isActive) return;
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = "pointer";
    },
    [isActive],
  );

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = "auto";
  }, []);

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (!isActive) return;
      const firstFloor = building.floors[0];
      if (firstFloor !== undefined) drillIntoFloor(firstFloor.floor);
    },
    [isActive, building.floors, drillIntoFloor],
  );

  return (
    <group name="building-click-zone">
      {/* Invisible hit plane at building centre */}
      <mesh
        position={[BLDG_W / 2, BLDG_H / 2, BLDG_D / 2]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        visible={false}
      >
        <boxGeometry args={[BLDG_W, BLDG_H, BLDG_D]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Hover glow — subtle floor-level ring when hovered */}
      {hovered && isActive && (
        <mesh position={[BLDG_W / 2, 0.04, BLDG_D / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[BLDG_W, BLDG_D]} />
          <meshBasicMaterial color="#4a6aff" transparent opacity={0.10} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/**
 * BuildingNode — Building-tier scene node with LOD switching.
 *
 * Selects between three representations:
 *   NEAR → BuildingShell (full detail, existing component; has its own click)
 *   MID  → BuildingLODMid (edge wireframe + translucent slabs) + BuildingClickZone
 *   FAR  → BuildingLODFar (bounding volume silhouette) + BuildingClickZone
 */
export function BuildingNode() {
  const bldgCX = BLDG_W / 2;
  const bldgCY = BLDG_H / 2;
  const bldgCZ = BLDG_D / 2;

  const lod = useLOD(bldgCX, bldgCY, bldgCZ, LOD_BUILDING_NEAR, LOD_BUILDING_FAR);

  return (
    <group name="hierarchy-building">
      {lod === "near" && <BuildingShell />}
      {lod === "mid"  && (
        <>
          <BuildingLODMid />
          {/* MID LOD lacks the interactive BuildingShell — add click zone */}
          <BuildingClickZone />
        </>
      )}
      {lod === "far"  && (
        <>
          <BuildingLODFar />
          {/* FAR LOD lacks the interactive BuildingShell — add click zone */}
          <BuildingClickZone />
        </>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLOOR (OFFICE) tier LOD primitives
// ─────────────────────────────────────────────────────────────────────────────

const FLOOR_HEIGHT = 3; // grid units per floor

/**
 * FloorLODMid — Simplified floor for mid-range distances.
 *
 * Renders per-room floor and ceiling planes (no walls) with type-tinted colours.
 * Grid overlay and room type labels are included; interior geometry is omitted.
 */
function FloorLODMid({ floor }: { floor: number }) {
  const building = useSpatialStore((s) => s.building);
  const rooms = useMemo(
    () => building.rooms.filter((r) => r.floor === floor),
    [building.rooms, floor],
  );

  return (
    <group name={`floor-${floor}-lod-mid`}>
      {rooms.map((room) => (
        <RoomFootprint key={room.roomId} room={room} />
      ))}
    </group>
  );
}

/**
 * RoomFootprint — Low-poly room representation (floor + ceiling only).
 * Used by FloorLODMid as the medium-detail room stand-in.
 *
 * Sub-AC 3.2: Includes drill-down click handling so rooms remain clickable
 * at mid-range floor LOD distances before the camera zooms in to NEAR LOD.
 */
function RoomFootprint({ room }: { room: RoomDef }) {
  const { x: w, y: h, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const config = ROLE_VISUALS[room.roomType];

  // Sub-AC 3.2 — drill-down click handling for MID LOD rooms
  const drillIntoRoom = useSpatialStore((s) => s.drillIntoRoom);
  const drillLevel    = useSpatialStore((s) => s.drillLevel);
  const drillRoom     = useSpatialStore((s) => s.drillRoom);
  const isDrilled     = drillRoom === room.roomId && drillLevel === "room";

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (!isDrilled) {
        drillIntoRoom(room.roomId);
      }
    },
    [drillIntoRoom, isDrilled, room.roomId],
  );

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
    },
    [],
  );

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = "auto";
  }, []);

  const floorMat = useMemo(() => {
    const base  = new THREE.Color(BUILDING.visual.floorColor);
    const acc   = new THREE.Color(room.colorAccent);
    return new THREE.MeshStandardMaterial({
      color: base.clone().lerp(acc, 0.28),
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.colorAccent]);

  const ceilMat = useMemo(() => {
    const base = new THREE.Color(BUILDING.visual.ceilingColor);
    const acc  = new THREE.Color(room.colorAccent);
    return new THREE.MeshStandardMaterial({
      color: base.clone().lerp(acc, 0.38),
      emissive: room.colorAccent,
      emissiveIntensity: 0.08,
      roughness: 0.8,
      metalness: 0.1,
      flatShading: true,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.colorAccent]);

  return (
    <group
      name={`room-footprint-${room.roomId}`}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Floor plane */}
      <mesh
        position={[px + w / 2, py + 0.02, pz + d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={floorMat}
        receiveShadow
      >
        <planeGeometry args={[w - 0.04, d - 0.04]} />
      </mesh>

      {/* Ceiling plane — tinted for bird's-eye identification */}
      <mesh
        position={[px + w / 2, py + h - 0.02, pz + d / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        material={ceilMat}
      >
        <planeGeometry args={[w - 0.04, d - 0.04]} />
      </mesh>

      {/* Perimeter accent strip */}
      <mesh
        position={[px + w / 2, py + 0.035, pz + d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[Math.min(w, d) / 2 - 0.15, Math.min(w, d) / 2, 6]} />
        <meshBasicMaterial
          color={room.colorAccent}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Small type icon label */}
      <Html
        position={[px + w / 2, py + h * 0.5, pz + d / 2]}
        center
        distanceFactor={14}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            color: room.colorAccent,
            fontSize: "9px",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            opacity: 0.8,
            letterSpacing: "0.06em",
            whiteSpace: "nowrap",
          }}
        >
          {config?.icon ?? "?"}{" "}
          <span style={{ fontSize: "7px", opacity: 0.65 }}>
            {room.name}
          </span>
        </div>
      </Html>
    </group>
  );
}

/**
 * RoomDotFar — Clickable room dot for FloorLODFar.
 *
 * Sub-AC 3.2: Each room type-indicator dot in the far-LOD floor representation
 * is individually clickable, drilling into the room and animating the camera
 * to room-level view even when the building is viewed from far away.
 */
function RoomDotFar({ room, floorY }: { room: RoomDef; floorY: number }) {
  const cx = room.position.x + room.dimensions.x / 2;
  const cz = room.position.z + room.dimensions.z / 2;
  const config = ROLE_VISUALS[room.roomType];

  const drillIntoRoom = useSpatialStore((s) => s.drillIntoRoom);
  const drillLevel    = useSpatialStore((s) => s.drillLevel);
  const drillRoom     = useSpatialStore((s) => s.drillRoom);
  const isDrilled     = drillRoom === room.roomId && drillLevel === "room";

  const [hovered, setHovered] = useState(false);

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (!isDrilled) {
        drillIntoRoom(room.roomId);
      }
    },
    [drillIntoRoom, isDrilled, room.roomId],
  );

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = "pointer";
    },
    [],
  );

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = "auto";
  }, []);

  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: room.colorAccent,
    emissive: config?.emissive ?? room.colorAccent,
    emissiveIntensity: hovered ? 0.75 : 0.45,
    roughness: 0.5,
    flatShading: true,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [room.colorAccent, config, hovered]);

  return (
    <mesh
      position={[cx, floorY + 0.18, cz]}
      geometry={SHARED_LOD_FAR_DOT_GEO}
      material={mat}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  );
}

/**
 * FloorLODFar — Ultra-minimal floor representation for distant views.
 *
 * Renders a single translucent slab with small colour-coded spheres at each
 * room centre to communicate type and layout without polygon overhead.
 *
 * Sub-AC 3.2: Each room dot is a clickable RoomDotFar that drills into the
 * room when clicked.
 */
function FloorLODFar({ floor }: { floor: number }) {
  const building = useSpatialStore((s) => s.building);
  const floorDef = useMemo(
    () => building.floors.find((f) => f.floor === floor),
    [building.floors, floor],
  );
  const rooms = useMemo(
    () => building.rooms.filter((r) => r.floor === floor),
    [building.rooms, floor],
  );

  if (!floorDef) return null;

  const y = floor * FLOOR_HEIGHT;
  const { gridW: gw, gridD: gd } = floorDef;

  return (
    <group name={`floor-${floor}-lod-far`}>
      {/* Flat floor slab */}
      <mesh position={[gw / 2, y + 0.05, gd / 2]} receiveShadow>
        <boxGeometry args={[gw, 0.08, gd]} />
        <meshStandardMaterial
          color={BUILDING.visual.floorColor}
          roughness={0.95}
          metalness={0.0}
          flatShading
          transparent
          opacity={0.55}
        />
      </mesh>

      {/* Room type indicator dots — each is a clickable RoomDotFar (Sub-AC 3.2) */}
      {rooms.map((room) => (
        <RoomDotFar key={room.roomId} room={room} floorY={y} />
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT tier LOD primitives
// ─────────────────────────────────────────────────────────────────────────────

const BODY_R = 0.12;
const BODY_H = 0.55;
const HEAD_R = 0.10;
const AGENT_TOTAL_H = BODY_H + HEAD_R * 2 + 0.05;

/** Status → material colour mapping for minimal representations */
const STATUS_DOT_COLOR: Record<string, string> = {
  inactive:   "#555566",
  idle:       "#888899",
  active:     "#00ff88",
  busy:       "#ffaa00",
  error:      "#ff4444",
  terminated: "#333344",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-AC 15c: Flyweight geometry pool for MID / FAR LOD agents
//
// Previously, each AgentLODMid and AgentLODFar component created its own
// CylinderGeometry, SphereGeometry, and MeshStandardMaterial via useMemo.
// With 20 agents this produced 40+ allocations.  Moving these to module-level
// singletons reduces that to exactly 2 (one per geometry type), shared across
// all instances.  Color is applied per-instance via material cloning + color
// assignment in useEffect, avoiding full material allocations.
//
// These geometries are created once when the module is imported and are never
// disposed — their lifetime matches the application.
// ─────────────────────────────────────────────────────────────────────────────

/** Shared body cylinder geometry for AgentLODMid (6-sided low-poly). */
const SHARED_LOD_MID_BODY_GEO = new THREE.CylinderGeometry(
  BODY_R * 0.85, BODY_R, BODY_H, 6,
);

/** Shared dot sphere geometry for AgentLODMid status indicator. */
const SHARED_LOD_MID_DOT_GEO = new THREE.SphereGeometry(0.028, 4, 4);

/** Shared sphere geometry for AgentLODFar (minimal dot). */
const SHARED_LOD_FAR_DOT_GEO = new THREE.SphereGeometry(0.18, 4, 3);

/**
 * AgentLODMid — Simplified agent for mid-range distance.
 *
 * Body cylinder (no head, no badge). Status dot retained for legibility.
 *
 * Sub-AC 15c: Uses module-level shared geometries (SHARED_LOD_MID_BODY_GEO,
 * SHARED_LOD_MID_DOT_GEO) to eliminate per-instance geometry allocation.
 * Materials are still per-instance (color varies per agent) but are created
 * once via useMemo(…, [color, emissive]) so they only change on status update.
 *
 * Sub-AC 3.2: Includes drill-down click handling so agents remain clickable
 * at mid-range distances before the camera zooms in to NEAR LOD.
 */
function AgentLODMid({ agent }: { agent: AgentRuntimeState }) {
  const { color, emissive } = agent.def.visual;
  const dotColor = STATUS_DOT_COLOR[agent.status] ?? color;
  const { worldPosition: wp } = agent;

  // Sub-AC 3.2 — drill-down click handling
  const drillIntoAgent = useSpatialStore((s) => s.drillIntoAgent);
  const selectAgent    = useAgentStore((s) => s.selectAgent);
  const drillAgent     = useSpatialStore((s) => s.drillAgent);
  const isDrilled      = drillAgent === agent.def.agentId;

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (!isDrilled) {
        selectAgent(agent.def.agentId);
        drillIntoAgent(agent.def.agentId, agent.worldPosition);
      }
    },
    [drillIntoAgent, selectAgent, isDrilled, agent],
  );

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
    },
    [],
  );

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = "auto";
  }, []);

  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.25,
    roughness: 0.7,
    metalness: 0.2,
    flatShading: true,
    transparent: true,
    opacity: 0.72,
  }), [color, emissive]);

  const dotMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: dotColor }),
    [dotColor],
  );

  return (
    <group
      position={[wp.x, wp.y, wp.z]}
      name={`agent-lod-mid-${agent.def.agentId}`}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Body only cylinder — shared geometry, per-agent material */}
      <mesh
        position={[0, BODY_H / 2, 0]}
        geometry={SHARED_LOD_MID_BODY_GEO}
        material={bodyMat}
        castShadow
      />
      {/* Status dot — shared geometry, per-agent material */}
      <mesh
        position={[0, BODY_H + 0.1, 0]}
        geometry={SHARED_LOD_MID_DOT_GEO}
        material={dotMat}
      />
    </group>
  );
}

/**
 * AgentLODFar — Minimal agent representation: a single role-coloured sphere.
 *
 * Sub-AC 15c: Uses module-level shared SHARED_LOD_FAR_DOT_GEO to eliminate
 * per-instance geometry allocation.  At scale (20 agents) this saves 20
 * SphereGeometry allocations.  Material is per-agent (color varies).
 *
 * Sub-AC 3.2: Includes drill-down click handling so agents remain clickable
 * at far distances before the camera zooms in to NEAR LOD.
 */
function AgentLODFar({ agent }: { agent: AgentRuntimeState }) {
  const { color, emissive } = agent.def.visual;
  const { worldPosition: wp } = agent;

  // Sub-AC 3.2 — drill-down click handling
  const drillIntoAgent = useSpatialStore((s) => s.drillIntoAgent);
  const selectAgent    = useAgentStore((s) => s.selectAgent);
  const drillAgent     = useSpatialStore((s) => s.drillAgent);
  const isDrilled      = drillAgent === agent.def.agentId;

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (!isDrilled) {
        selectAgent(agent.def.agentId);
        drillIntoAgent(agent.def.agentId, agent.worldPosition);
      }
    },
    [drillIntoAgent, selectAgent, isDrilled, agent],
  );

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
    },
    [],
  );

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = "auto";
  }, []);

  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.5,
    roughness: 0.5,
    flatShading: true,
  }), [color, emissive]);

  return (
    <group
      position={[wp.x, wp.y + BODY_H / 2, wp.z]}
      name={`agent-lod-far-${agent.def.agentId}`}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Shared geometry, per-agent material */}
      <mesh geometry={SHARED_LOD_FAR_DOT_GEO} material={mat} />
    </group>
  );
}

/**
 * AgentNode — Agent-tier scene node with drill-biased LOD switching.
 *
 * NEAR → full AgentAvatar (staggered fade-in, badge, foot ring)
 * MID  → AgentLODMid (body silhouette + status dot)
 * FAR  → AgentLODFar (single coloured sphere)
 *
 * Sub-AC 3.4: LOD is drill-biased.  When this agent is the active drill
 * target (drillAgent === agentId), it is promoted to NEAR regardless of
 * camera distance, ensuring the full avatar + metadata is always visible
 * when the user has explicitly focused on this agent.
 *
 * Positioned at the agent's current worldPosition from the agent store.
 */
function AgentNode({ agentId }: { agentId: string }) {
  const agent = useAgentStore((s) => s.agents[agentId]);

  // Sub-AC 3.4 — read drill context for agent LOD bias
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillAgent = useSpatialStore((s) => s.drillAgent);

  // Distance-based LOD computation
  const camera = useThree((s) => s.camera);
  const distLodRef = useRef<LODLevel>("mid");
  const [distanceLod, setDistanceLod] = useState<LODLevel>("mid");

  const centre = useMemo(
    () => (agent
      ? new THREE.Vector3(
          agent.worldPosition.x,
          agent.worldPosition.y + AGENT_TOTAL_H / 2,
          agent.worldPosition.z,
        )
      : new THREE.Vector3()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent?.worldPosition.x, agent?.worldPosition.y, agent?.worldPosition.z],
  );

  useFrame(() => {
    if (!agent) return;
    const dist = camera.position.distanceTo(centre);
    const next: LODLevel = dist < LOD_AGENT_NEAR ? "near" : dist < LOD_AGENT_FAR ? "mid" : "far";
    if (next !== distLodRef.current) {
      distLodRef.current = next;
      setDistanceLod(next);
    }
  });

  // Sub-AC 3.4: Apply drill promotion on top of distance-based LOD.
  // getAgentDrillRelationship returns "target" when this agent is drilled →
  // computeEffectiveLOD upgrades the LOD to "near".
  const drillRelation = getAgentDrillRelationship(
    agentId,
    drillLevel as PolicyDrillLevel,
    drillAgent,
  );
  const lod: LODLevel = computeEffectiveLOD(distanceLod, drillRelation);

  if (!agent) return null;

  return (
    <group name={`hierarchy-agent-${agentId}`}>
      {lod === "near" && <AgentAvatar agentId={agentId} />}
      {lod === "mid"  && <AgentLODMid agent={agent} />}
      {lod === "far"  && <AgentLODFar agent={agent} />}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOM tier scene node
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RoomAgentsGroup — All agents assigned to a single room with per-agent LOD.
 *
 * Renders each agent through the AgentNode LOD switcher.
 * Only mounted when the parent floor LOD is "near".
 */
function RoomAgentsGroup({ roomId }: { roomId: string }) {
  const agentIds = useAgentStore((s) =>
    Object.values(s.agents)
      .filter((a) => a.roomId === roomId)
      .map((a) => a.def.agentId),
  );

  if (agentIds.length === 0) return null;

  return (
    <group name={`hierarchy-agents-${roomId}`}>
      {agentIds.map((id) => (
        <AgentNode key={id} agentId={id} />
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-AC 7c: Room metrics billboards layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RoomMetricsBillboardsLayer — renders a RoomMetricsBillboard above each
 * room on the given floor.
 *
 * Mounted inside FloorNode at NEAR LOD only — at MID/FAR the room nodes are
 * too small for metric panels to be legible.
 *
 * Each billboard is positioned at the room's horizontal centre and floats
 * ROOM_BILLBOARD_Y units above the room's floor Y (see MetricsBillboard.tsx).
 */
function RoomMetricsBillboardsLayer({ floor }: { floor: number }) {
  const building = useSpatialStore((s) => s.building);
  const rooms = useMemo(
    () => building.rooms.filter((r) => r.floor === floor),
    [building.rooms, floor],
  );

  return (
    <group name={`room-metrics-billboards-floor-${floor}`}>
      {rooms.map((room) => {
        const cx = room.position.x + room.dimensions.x / 2;
        const cz = room.position.z + room.dimensions.z / 2;
        const py = room.position.y; // absolute floor Y of this room

        return (
          <group
            key={room.roomId}
            position={[cx, 0, cz]}
            name={`room-metrics-anchor-${room.roomId}`}
          >
            <RoomMetricsBillboard
              roomId={room.roomId}
              floorY={py}
              accentColor={room.colorAccent}
            />
          </group>
        );
      })}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLOOR click zone + selection highlight (Sub-AC 4a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FloorSelectionHighlight — Perimeter wireframe drawn around the entire floor
 * footprint when this floor is the current drill target
 * (drillLevel === "floor" && drillFloor === floor).
 *
 * Shows users which "office zone" they are currently inside.
 */
function FloorSelectionHighlight({ floor, gridW, gridD }: { floor: number; gridW: number; gridD: number }) {
  const y = floor * FLOOR_HEIGHT;

  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const addEdge = (a: [number, number, number], b: [number, number, number]) => {
      pts.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
    };
    // Bottom perimeter
    addEdge([0, y + 0.02, 0],       [gridW, y + 0.02, 0]);
    addEdge([gridW, y + 0.02, 0],   [gridW, y + 0.02, gridD]);
    addEdge([gridW, y + 0.02, gridD],[0, y + 0.02, gridD]);
    addEdge([0, y + 0.02, gridD],   [0, y + 0.02, 0]);
    // Top perimeter
    addEdge([0, y + FLOOR_HEIGHT - 0.02, 0],       [gridW, y + FLOOR_HEIGHT - 0.02, 0]);
    addEdge([gridW, y + FLOOR_HEIGHT - 0.02, 0],   [gridW, y + FLOOR_HEIGHT - 0.02, gridD]);
    addEdge([gridW, y + FLOOR_HEIGHT - 0.02, gridD],[0, y + FLOOR_HEIGHT - 0.02, gridD]);
    addEdge([0, y + FLOOR_HEIGHT - 0.02, gridD],   [0, y + FLOOR_HEIGHT - 0.02, 0]);
    // Vertical corners
    addEdge([0, y, 0],       [0, y + FLOOR_HEIGHT, 0]);
    addEdge([gridW, y, 0],   [gridW, y + FLOOR_HEIGHT, 0]);
    addEdge([gridW, y, gridD],[gridW, y + FLOOR_HEIGHT, gridD]);
    addEdge([0, y, gridD],   [0, y + FLOOR_HEIGHT, gridD]);
    return pts;
  }, [y, gridW, gridD]);

  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#6a8aff" transparent opacity={0.75} />
    </lineSegments>
  );
}

/**
 * FloorClickZone — Invisible hit-plane for each floor.
 *
 * When the user is at "building" drill level, hovering this plane shows
 * a cursor-pointer affordance and clicking it drills into that floor.
 * When already inside a floor, the click zone is inactive (rooms handle
 * deeper navigation via their own click handlers).
 */
function FloorClickZone({ floor, gridW, gridD }: { floor: number; gridW: number; gridD: number }) {
  const drillLevel     = useSpatialStore((s) => s.drillLevel);
  const drillFloor     = useSpatialStore((s) => s.drillFloor);
  const drillIntoFloor = useSpatialStore((s) => s.drillIntoFloor);

  const [hovered, setHovered] = useState(false);

  const isActive = drillLevel === "building" || (drillLevel === "floor" && drillFloor !== floor);
  const isSelected = drillLevel !== "building" && drillFloor === floor;

  const y = floor * FLOOR_HEIGHT;

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (!isActive) return;
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = "pointer";
    },
    [isActive],
  );

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = "auto";
  }, []);

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (!isActive) return;
      drillIntoFloor(floor);
    },
    [isActive, drillIntoFloor, floor],
  );

  return (
    <group name={`floor-${floor}-click-zone`}>
      {/* Invisible click plane covering the floor footprint */}
      <mesh
        position={[gridW / 2, y + 0.06, gridD / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        visible={false}
      >
        <planeGeometry args={[gridW, gridD]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Hover highlight — translucent floor overlay when hovered at building level */}
      {hovered && isActive && (
        <mesh
          position={[gridW / 2, y + 0.04, gridD / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[gridW - 0.1, gridD - 0.1]} />
          <meshBasicMaterial color="#4a6aff" transparent opacity={0.12} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Selection highlight — perimeter lines when this floor is drilled */}
      {isSelected && (
        <FloorSelectionHighlight floor={floor} gridW={gridW} gridD={gridD} />
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLOOR (OFFICE) tier scene node
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FloorNode — Floor-tier scene node with drill-biased LOD switching.
 *
 * Acts as the "Office" tier in the 4-level hierarchy.  One FloorNode exists
 * per building floor and controls the detail level of all rooms and agents
 * on that floor.
 *
 *   NEAR → FloorRooms (full rooms: walls, lights, markers, displays)
 *          + per-room RoomAgentsGroup (per-agent LOD)
 *   MID  → FloorLODMid (room footprints: floor + ceiling only)
 *          No agents rendered (too small to be legible).
 *   FAR  → FloorLODFar (single slab + coloured type dots)
 *          No rooms or agents rendered.
 *
 * Sub-AC 3.4: LOD is now drill-biased.  When this floor is the active drill
 * target, it is promoted to NEAR regardless of camera distance.  When it is
 * an ancestor of the current drill target (room or agent), it is promoted to
 * at least MID so the surrounding context remains legible.
 *
 * Respects the floor-visibility toggle from the spatial store.
 */
export function FloorNode({ floor, agentsReady = true }: { floor: number; agentsReady?: boolean }) {
  const isVisible  = useSpatialStore((s) => s.floorVisibility[floor] ?? true);
  const building   = useSpatialStore((s) => s.building);

  // Sub-AC 3.4 — read drill context for LOD bias
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillFloor = useSpatialStore((s) => s.drillFloor);

  const floorDef  = useMemo(
    () => building.floors.find((f) => f.floor === floor),
    [building.floors, floor],
  );

  // Floor centre for camera-distance LOD calculation
  const cx = (floorDef?.gridW ?? BLDG_W) / 2;
  const cy = floor * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
  const cz = (floorDef?.gridD ?? BLDG_D) / 2;

  // Sub-AC 3.4: Hybrid LOD = max(distance-based, drill-promotion).
  // useLOD computes the distance-based level; computeEffectiveLOD promotes
  // it if this floor is a drill target or ancestor.
  const distanceLod = useLOD(cx, cy, cz, LOD_FLOOR_NEAR, LOD_FLOOR_FAR);
  // drillLevel from spatial-store is structurally identical to PolicyDrillLevel
  const drillRelation = getFloorDrillRelationship(
    floor,
    drillLevel as PolicyDrillLevel,
    drillFloor,
  );
  const lod: LODLevel = computeEffectiveLOD(distanceLod, drillRelation);

  // Rooms for this floor (needed when placing agent groups in NEAR LOD)
  const roomIds = useMemo(
    () => building.rooms.filter((r) => r.floor === floor).map((r) => r.roomId),
    [building.rooms, floor],
  );

  if (!isVisible) return null;

  return (
    <group name={`hierarchy-floor-${floor}`}>
      {/* ── NEAR: Full room geometry + agents ─────────────────── */}
      {lod === "near" && (
        <>
          {/* Existing full-detail room geometry */}
          <FloorRooms floor={floor} />

          {/*
           * Sub-AC 3 (AC 2): Pre-render ontology readiness gate.
           *
           * RoomAgentsGroup is only mounted when `agentsReady` is true —
           * meaning all agents declared in BUILDING.agentAssignments are
           * present in the runtime store (verified by verifyOntologyAgentsPlaced).
           *
           * When agentsReady=false (store is being initialized), the agent
           * layer renders nothing.  The room geometry (FloorRooms) is still
           * rendered so the building structure is immediately visible.
           *
           * This prevents stale renders where agents would appear at (0,0,0)
           * before their worldPosition is computed by initializeAgents().
           */}
          {agentsReady && roomIds.map((roomId) => (
            <RoomAgentsGroup key={roomId} roomId={roomId} />
          ))}

          {/*
           * Sub-AC 7c: Room metrics billboards.
           * One RoomMetricsBillboard per room floats above the room geometry
           * showing CPU, MEM, QUEUE and health indicators.
           * Only rendered at NEAR LOD where the billboard text is legible.
           */}
          <RoomMetricsBillboardsLayer floor={floor} />
        </>
      )}

      {/* ── MID: Simplified room footprints, no agents ────────── */}
      {lod === "mid" && <FloorLODMid floor={floor} />}

      {/* ── FAR: Minimal slab + type dots ─────────────────────── */}
      {lod === "far" && <FloorLODFar floor={floor} />}

      {/* ── Click zone + selection highlight (Sub-AC 4a) ──────── */}
      <FloorClickZone
        floor={floor}
        gridW={floorDef?.gridW ?? BLDG_W}
        gridD={floorDef?.gridD ?? BLDG_D}
      />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FloorIndicatorDiegetic — in-world floor label (always visible)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FloorIndicatorDiegetic — Level-indicator badge embedded in 3D space.
 *
 * Always rendered regardless of LOD so users can always identify floors.
 * Positioned on the west face of the building at each floor level.
 */
function FloorIndicatorDiegetic({ floor, name }: { floor: number; name: string }) {
  const isVisible = useSpatialStore((s) => s.floorVisibility[floor] ?? true);
  const y = floor * FLOOR_HEIGHT;

  return (
    <group position={[-1.5, y + 1.5, BLDG_D / 2]}>
      {/* Panel background */}
      <mesh>
        <boxGeometry args={[1.2, 0.4, 0.02]} />
        <meshBasicMaterial
          color={isVisible ? "#1a1a2e" : "#0a0a14"}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Accent left strip */}
      <mesh position={[-0.58, 0, 0.015]}>
        <boxGeometry args={[0.04, 0.35, 0.01]} />
        <meshBasicMaterial
          color={isVisible ? "#4a6aff" : "#333355"}
          transparent
          opacity={0.75}
        />
      </mesh>
      {/* Text label */}
      <Html
        center
        distanceFactor={10}
        position={[0.05, 0, 0.03]}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            color: isVisible ? "#8888cc" : "#444466",
            fontSize: "9px",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
            textTransform: "uppercase",
          }}
        >
          F{floor} {name}
        </div>
      </Html>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DataSourceBadge — always-visible data provenance indicator
// ─────────────────────────────────────────────────────────────────────────────

function DataSourceBadge() {
  const dataSource = useSpatialStore((s) => s.dataSource);
  const roomCount  = useSpatialStore((s) => s.building.rooms.length);

  return (
    <group position={[-1.5, -0.3, BLDG_D / 2]}>
      <Html center distanceFactor={14} style={{ pointerEvents: "none" }}>
        <div
          style={{
            color: dataSource === "yaml" ? "#00cc66" : "#666688",
            fontSize: "8px",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {dataSource === "yaml" ? "YAML" : "STATIC"} · {roomCount}R
        </div>
      </Html>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HierarchySceneGraph — ROOT exported component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HierarchySceneGraph — Root hierarchical scene graph for the command center.
 *
 * Composes the full 4-tier scene graph:
 *
 *   hierarchy-building
 *   ├─ BuildingNode (LOD: BuildingShell | mid edges | far silhouette)
 *   ├─ hierarchy-floor-0  (FloorNode / Office tier)
 *   │  └─ FloorRooms / FloorLODMid / FloorLODFar
 *   │     └─ hierarchy-agents-{roomId}
 *   │        └─ hierarchy-agent-{agentId}
 *   ├─ hierarchy-floor-1  (FloorNode / Office tier)
 *   │  └─ …same pattern…
 *   ├─ FloorIndicatorDiegetic × n
 *   └─ DataSourceBadge
 *
 * This component is a drop-in replacement for the flat:
 *   <BuildingShell /> + <DynamicFloors /> + <AgentAvatarsLayer />
 * pattern previously used in CommandCenterScene.tsx.
 *
 * Note: Camera rig, lighting, fog, and click handlers are NOT included
 * here — they remain in CommandCenterScene.tsx so they can be reused
 * across rendering modes.
 */
export function HierarchySceneGraph() {
  const floors = useSpatialStore((s) => s.building.floors);

  /**
   * Sub-AC 2c + Sub-AC 3 (AC 2): Activate the scene-load avatar initialization hook.
   *
   * useAgentSceneLoader() runs inside the Canvas context (this component
   * is mounted as a child of <Canvas>), which means it fires at the correct
   * point in the 3D scene lifecycle — after the WebGL context is ready but
   * before the first rendered frame draws agent avatars.
   *
   * Responsibilities delegated to this hook:
   *   1. Call initializeAgents() if not already done (idempotent).
   *   2. Record an "agents.initialized" entry in the SceneEventLog.
   *   3. Expose load status for conditional rendering (loaded, allInactive).
   *   4. Sub-AC 3: Verify all ontology agents are present before render
   *      via ontologyVerification.allPresent (pre-render readiness gate).
   *
   * The `ontologyVerification.allPresent` flag is the authoritative gate:
   *   - false → agents layer renders nothing (early return below)
   *   - true  → all expected agents from BUILDING.agentAssignments are
   *             in the store and the agent layer is safe to render
   *
   * AgentAvatar.tsx still handles its own spawnTs-based scale=0 hiding for
   * the staggered fade-in — this gate is about DATA completeness, not
   * animation timing.
   */
  const { ontologyVerification } = useAgentSceneLoader();

  return (
    <group name="hierarchy-building">
      {/* Building shell with LOD */}
      <BuildingNode />

      {/*
       * Sub-AC 3 (AC 2): Floor nodes receive the ontology readiness flag.
       *
       * `ontologyVerification.allPresent` is the pre-render gate:
       *   - false: only room geometry renders (no agents) — prevents stale
       *            renders before initializeAgents() completes
       *   - true:  full agent layer renders — all 5 ontology agents confirmed
       *            present in the runtime store before first agent frame
       */}
      {floors.map((f) => (
        <FloorNode key={f.floor} floor={f.floor} agentsReady={ontologyVerification.allPresent} />
      ))}

      {/* Always-visible floor indicators — diegetic 3D badges */}
      {floors.map((f) => (
        <FloorIndicatorDiegetic key={f.floor} floor={f.floor} name={f.name} />
      ))}

      {/* Data provenance indicator */}
      <DataSourceBadge />

      {/*
       * Sub-AC 3: Room type color legend — diegetic panel on the west
       * exterior wall showing all 6 role types with their accent colors.
       *
       * Positioned at x=-2.8 (outside west building wall at x=0),
       * y=1.2 (mid-height between the two floors), z=3 (building depth centre).
       *
       * Displays current data source (YAML/STATIC) and room count so the
       * user can verify that YAML-loaded data is reflected in the 3D scene.
       */}
      <RoomTypeLegend position={[-2.8, 1.2, 3]} />

      {/*
       * Sub-AC 3c: DrillSelectionRing — 3D "scene focus" overlay.
       *
       * Renders an animated pulsing ring at the position of the currently-drilled
       * entity (floor slab → room footprint → agent foot-ring) to reinforce the
       * visual focus during camera transitions.  Mounted inside the hierarchy
       * group so it participates in the same coordinate space as the building.
       * Record-transparent: reads only, emits no events.
       */}
      <DrillSelectionRing />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOD Debug Overlay — shows current LOD tier labels in dev mode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LODDebugOverlay — Development aid that renders LOD tier labels
 * at each tier's visual position.
 *
 * Activated by setting the `debug` prop to true.
 * Displays coloured tier badges: NEAR / MID / FAR for building + each floor.
 */
export function LODDebugOverlay({ active = false }: { active?: boolean }) {
  const floors = useSpatialStore((s) => s.building.floors);

  // Per-component LOD state for debug display
  const camera = useThree((s) => s.camera);
  const [bldgLod, setBldgLod] = useState<LODLevel>("mid");
  const [floorLods, setFloorLods] = useState<LODLevel[]>(
    () => floors.map(() => "mid" as LODLevel),
  );

  const bldgCentre = useMemo(
    () => new THREE.Vector3(BLDG_W / 2, BLDG_H / 2, BLDG_D / 2),
    [],
  );
  const floorCentres = useMemo(
    () => floors.map((f) => new THREE.Vector3(
      (f.gridW ?? BLDG_W) / 2,
      f.floor * FLOOR_HEIGHT + FLOOR_HEIGHT / 2,
      (f.gridD ?? BLDG_D) / 2,
    )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [floors.length],
  );

  const bldgLodRef  = useRef<LODLevel>("mid");
  const floorLodRef = useRef<LODLevel[]>(floors.map(() => "mid" as LODLevel));

  useFrame(() => {
    if (!active) return;

    // Building LOD
    const bd = camera.position.distanceTo(bldgCentre);
    const bNext: LODLevel = bd < LOD_BUILDING_NEAR ? "near" : bd < LOD_BUILDING_FAR ? "mid" : "far";
    if (bNext !== bldgLodRef.current) {
      bldgLodRef.current = bNext;
      setBldgLod(bNext);
    }

    // Floor LODs
    let changed = false;
    const updated = floorLodRef.current.map((prev, i) => {
      const fd = camera.position.distanceTo(floorCentres[i]);
      const fNext: LODLevel = fd < LOD_FLOOR_NEAR ? "near" : fd < LOD_FLOOR_FAR ? "mid" : "far";
      if (fNext !== prev) {
        changed = true;
        return fNext;
      }
      return prev;
    });
    if (changed) {
      floorLodRef.current = updated;
      setFloorLods([...updated]);
    }
  });

  if (!active) return null;

  const lodColor = (l: LODLevel) =>
    l === "near" ? "#00ff88" : l === "mid" ? "#ffaa00" : "#ff6644";

  return (
    <group name="lod-debug-overlay">
      {/* Building LOD badge */}
      <Html
        position={[BLDG_W / 2, BLDG_H + 0.8, BLDG_D / 2]}
        center
        distanceFactor={10}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.75)",
            border: `1px solid ${lodColor(bldgLod)}`,
            borderRadius: 3,
            padding: "2px 6px",
            color: lodColor(bldgLod),
            fontSize: "8px",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.1em",
          }}
        >
          BUILDING · {bldgLod.toUpperCase()}
        </div>
      </Html>

      {/* Floor LOD badges */}
      {floors.map((f, i) => (
        <Html
          key={f.floor}
          position={[BLDG_W + 0.8, f.floor * FLOOR_HEIGHT + 1.5, BLDG_D / 2]}
          center
          distanceFactor={10}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.75)",
              border: `1px solid ${lodColor(floorLods[i] ?? "mid")}`,
              borderRadius: 3,
              padding: "2px 6px",
              color: lodColor(floorLods[i] ?? "mid"),
              fontSize: "7px",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.08em",
            }}
          >
            F{f.floor} · {(floorLods[i] ?? "mid").toUpperCase()}
          </div>
        </Html>
      ))}
    </group>
  );
}
