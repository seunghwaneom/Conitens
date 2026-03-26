/**
 * DrillSelectionRing — Sub-AC 3c
 *
 * Animated 3D selection ring that reinforces "scene focus" during drill-down
 * navigation.  Renders a pulsing ring at the position of the currently-drilled
 * entity in the hierarchy, providing immediate visual feedback that complements
 * the camera transition.
 *
 * Drill-level → ring configuration:
 *   building  (never shown — at building level nothing is "drilled in")
 *   floor     → large rectangle ring at the floor-slab level (the whole office)
 *   room      → medium ring above the room floor, sized to room footprint
 *   agent     → small ring at the agent's foot-level
 *
 * The ring uses a double-layer design:
 *   1. Outer ring (wireframe via LineSegments) — always-on-at-drill, thin line
 *   2. Inner fill plane (opacity ~8%) — subtle floor glow
 *
 * Both layers pulse via a sine-wave opacity modulation on `useFrame`.
 *
 * Architecture:
 *   DrillSelectionRing   — main export, reads drill state from spatial / agent store
 *   FloorDrillRing       — floor-level ring geometry
 *   RoomDrillRing        — room-level ring geometry
 *   AgentDrillRing       — agent-level ring geometry
 *   computeRingPulse     — pure: sine-wave pulse for a given time + phase
 *   RING_CONFIG          — exported constants for testing / configuration
 *
 * Record-transparent: DrillSelectionRing is purely visual — it does NOT emit
 * any events or mutate any store state.  All state it reads is event-sourced
 * through the spatial and agent stores.
 *
 * @module scene/DrillSelectionRing
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Ring configuration constants.
 * Exported for testing and external configuration.
 */
export const RING_CONFIG = {
  /**
   * How many world-units to extend the floor-ring beyond the floor footprint
   * on each side (padding so the ring appears OUTSIDE the floor boundary).
   */
  FLOOR_PADDING: 0.3,

  /**
   * How many world-units to extend the room-ring beyond the room footprint.
   */
  ROOM_PADDING: 0.12,

  /**
   * Radius of the agent-foot ring (circle at agent base).
   */
  AGENT_RING_RADIUS: 0.35,

  /**
   * Pulse speed — radians per second.
   * One full pulse period = 2π / PULSE_SPEED ≈ 2.5 s at default value.
   */
  PULSE_SPEED: 2.5,

  /**
   * Minimum opacity for the outer ring line during the "dark" phase of the pulse.
   */
  RING_LINE_OPACITY_MIN: 0.25,

  /**
   * Maximum opacity for the outer ring line during the "bright" phase.
   */
  RING_LINE_OPACITY_MAX: 0.75,

  /**
   * Fill plane opacity range (much lower than the ring line for subtlety).
   */
  FILL_OPACITY_MIN: 0.025,
  FILL_OPACITY_MAX: 0.07,

  /**
   * Vertical offset above the floor / room floor plane to avoid z-fighting.
   */
  FLOOR_Y_OFFSET: 0.018,

  /** World-units per floor (must match building.ts / RoomGeometry.tsx). */
  FLOOR_HEIGHT: 3,
} as const;

// ── Pure helper ──────────────────────────────────────────────────────────────

/**
 * computeRingPulse — pure function for the opacity pulse value.
 *
 * Returns a value in [0, 1] representing one phase of a sine pulse.
 * Callers multiply by (MAX − MIN) and add MIN to get the actual opacity.
 *
 * @param elapsedSeconds  total elapsed time in seconds (from useFrame state.clock)
 * @param phaseOffset     optional offset in radians (default 0)
 * @returns               a value in [0, 1]
 */
export function computeRingPulse(
  elapsedSeconds: number,
  phaseOffset = 0,
): number {
  return (Math.sin(elapsedSeconds * RING_CONFIG.PULSE_SPEED + phaseOffset) + 1) / 2;
}

// ── FloorDrillRing ───────────────────────────────────────────────────────────

interface FloorRingProps {
  floor: number;
  gridW: number;
  gridD: number;
  accentColor: string;
}

/**
 * FloorDrillRing — Animated selection outline around the entire drilled floor.
 *
 * Renders a rectangular perimeter ring + subtle fill at the floor slab level.
 * The ring's color comes from the scene accent (blue-indigo to match the overall
 * command-center palette).
 */
function FloorDrillRing({ floor, gridW, gridD, accentColor }: FloorRingProps) {
  const lineRef   = useRef<THREE.LineSegments>(null);
  const fillRef   = useRef<THREE.Mesh>(null);

  const y = floor * RING_CONFIG.FLOOR_HEIGHT + RING_CONFIG.FLOOR_Y_OFFSET;
  const pad = RING_CONFIG.FLOOR_PADDING;
  const w = gridW + pad * 2;
  const d = gridD + pad * 2;

  // Perimeter line geometry (8 edges of the rectangle)
  const lineGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const addEdge = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
    ) => {
      pts.push(new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz));
    };
    const x0 = -pad;
    const x1 = gridW + pad;
    const z0 = -pad;
    const z1 = gridD + pad;
    addEdge(x0, y, z0,  x1, y, z0);
    addEdge(x1, y, z0,  x1, y, z1);
    addEdge(x1, y, z1,  x0, y, z1);
    addEdge(x0, y, z1,  x0, y, z0);
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [gridW, gridD, y, pad]);

  const lineMat = useMemo(
    () => new THREE.LineBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: RING_CONFIG.RING_LINE_OPACITY_MAX,
      depthWrite: false,
    }),
    [accentColor],
  );

  const fillGeo = useMemo(
    () => new THREE.PlaneGeometry(w, d),
    [w, d],
  );
  const fillMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: RING_CONFIG.FILL_OPACITY_MAX,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    [accentColor],
  );

  // Pulse both layers each frame
  useFrame(({ clock }) => {
    const pulse = computeRingPulse(clock.getElapsedTime());

    if (lineRef.current) {
      (lineRef.current.material as THREE.LineBasicMaterial).opacity =
        RING_CONFIG.RING_LINE_OPACITY_MIN +
        pulse * (RING_CONFIG.RING_LINE_OPACITY_MAX - RING_CONFIG.RING_LINE_OPACITY_MIN);
    }
    if (fillRef.current) {
      (fillRef.current.material as THREE.MeshBasicMaterial).opacity =
        RING_CONFIG.FILL_OPACITY_MIN +
        pulse * (RING_CONFIG.FILL_OPACITY_MAX - RING_CONFIG.FILL_OPACITY_MIN);
    }
  });

  return (
    <group name={`drill-ring-floor-${floor}`}>
      {/* Perimeter lines */}
      <lineSegments
        ref={lineRef}
        geometry={lineGeo}
        material={lineMat}
        renderOrder={10}
      />
      {/* Subtle fill */}
      <mesh
        ref={fillRef}
        geometry={fillGeo}
        material={fillMat}
        position={[gridW / 2, y + 0.001, gridD / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={10}
      />
    </group>
  );
}

// ── RoomDrillRing ────────────────────────────────────────────────────────────

interface RoomRingProps {
  roomId: string;
}

/**
 * RoomDrillRing — Animated selection outline around the drilled room.
 *
 * Renders a rectangular ring + fill at the room's floor level.
 * Sized to the room footprint + ROOM_PADDING overhang.
 */
function RoomDrillRing({ roomId }: RoomRingProps) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const fillRef = useRef<THREE.Mesh>(null);

  const room = useSpatialStore((s) => s.getRoomById(roomId));

  const lineGeo = useMemo(() => {
    if (!room) return new THREE.BufferGeometry();
    const { x: px, y: py, z: pz } = room.position;
    const { x: w, z: d } = room.dimensions;
    const pad = RING_CONFIG.ROOM_PADDING;
    const yp = py + RING_CONFIG.FLOOR_Y_OFFSET;

    const pts: THREE.Vector3[] = [];
    const addEdge = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
    ) => {
      pts.push(new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz));
    };
    const x0 = px - pad;
    const x1 = px + w + pad;
    const z0 = pz - pad;
    const z1 = pz + d + pad;
    addEdge(x0, yp, z0,  x1, yp, z0);
    addEdge(x1, yp, z0,  x1, yp, z1);
    addEdge(x1, yp, z1,  x0, yp, z1);
    addEdge(x0, yp, z1,  x0, yp, z0);
    return new THREE.BufferGeometry().setFromPoints(pts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.position.x, room?.position.y, room?.position.z, room?.dimensions.x, room?.dimensions.z]);

  const accentColor = room?.colorAccent ?? "#4a6aff";

  const lineMat = useMemo(
    () => new THREE.LineBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: RING_CONFIG.RING_LINE_OPACITY_MAX,
      depthWrite: false,
    }),
    [accentColor],
  );

  const fillGeo = useMemo(() => {
    if (!room) return new THREE.PlaneGeometry(1, 1);
    const pad = RING_CONFIG.ROOM_PADDING;
    return new THREE.PlaneGeometry(
      room.dimensions.x + pad * 2,
      room.dimensions.z + pad * 2,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.dimensions.x, room?.dimensions.z]);

  const fillMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: RING_CONFIG.FILL_OPACITY_MAX,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    [accentColor],
  );

  // Pulse with a small phase offset relative to floor ring
  useFrame(({ clock }) => {
    const pulse = computeRingPulse(clock.getElapsedTime(), Math.PI * 0.3);
    if (lineRef.current) {
      (lineRef.current.material as THREE.LineBasicMaterial).opacity =
        RING_CONFIG.RING_LINE_OPACITY_MIN +
        pulse * (RING_CONFIG.RING_LINE_OPACITY_MAX - RING_CONFIG.RING_LINE_OPACITY_MIN);
    }
    if (fillRef.current) {
      (fillRef.current.material as THREE.MeshBasicMaterial).opacity =
        RING_CONFIG.FILL_OPACITY_MIN +
        pulse * (RING_CONFIG.FILL_OPACITY_MAX - RING_CONFIG.FILL_OPACITY_MIN);
    }
  });

  if (!room) return null;

  const cx = room.position.x + room.dimensions.x / 2;
  const cz = room.position.z + room.dimensions.z / 2;
  const fy = room.position.y + RING_CONFIG.FLOOR_Y_OFFSET + 0.002;

  return (
    <group name={`drill-ring-room-${roomId}`}>
      <lineSegments
        ref={lineRef}
        geometry={lineGeo}
        material={lineMat}
        renderOrder={11}
      />
      <mesh
        ref={fillRef}
        geometry={fillGeo}
        material={fillMat}
        position={[cx, fy, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={11}
      />
    </group>
  );
}

// ── AgentDrillRing ───────────────────────────────────────────────────────────

interface AgentRingProps {
  agentId: string;
}

/**
 * AgentDrillRing — Animated foot-ring below the drilled agent.
 *
 * Renders a small circle ring at the agent's base, coloured using the agent's
 * visual.color.  A double-ring design (outer line, inner fill) matches the
 * floor and room rings for visual consistency.
 */
function AgentDrillRing({ agentId }: AgentRingProps) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const fillRef = useRef<THREE.Mesh>(null);

  const agent = useAgentStore((s) => s.agents[agentId]);

  const r = RING_CONFIG.AGENT_RING_RADIUS;
  const SEGMENTS = 16;

  const lineGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a0 = (i / SEGMENTS) * Math.PI * 2;
      const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(Math.cos(a0) * r, 0, Math.sin(a0) * r),
        new THREE.Vector3(Math.cos(a1) * r, 0, Math.sin(a1) * r),
      );
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [r]);

  const accentColor = agent?.def.visual.color ?? "#00ffaa";

  const lineMat = useMemo(
    () => new THREE.LineBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: RING_CONFIG.RING_LINE_OPACITY_MAX,
      depthWrite: false,
    }),
    [accentColor],
  );

  const fillGeo = useMemo(() => new THREE.CircleGeometry(r * 0.72, SEGMENTS), [r]);
  const fillMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: RING_CONFIG.FILL_OPACITY_MAX,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    [accentColor],
  );

  // Pulse with larger phase offset for variety
  useFrame(({ clock }) => {
    const pulse = computeRingPulse(clock.getElapsedTime(), Math.PI * 0.6);
    if (lineRef.current) {
      (lineRef.current.material as THREE.LineBasicMaterial).opacity =
        RING_CONFIG.RING_LINE_OPACITY_MIN +
        pulse * (RING_CONFIG.RING_LINE_OPACITY_MAX - RING_CONFIG.RING_LINE_OPACITY_MIN);
    }
    if (fillRef.current) {
      (fillRef.current.material as THREE.MeshBasicMaterial).opacity =
        RING_CONFIG.FILL_OPACITY_MIN +
        pulse * (RING_CONFIG.FILL_OPACITY_MAX - RING_CONFIG.FILL_OPACITY_MIN);
    }
  });

  if (!agent) return null;

  const { x, y, z } = agent.worldPosition;

  return (
    <group
      name={`drill-ring-agent-${agentId}`}
      position={[x, y + RING_CONFIG.FLOOR_Y_OFFSET, z]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <lineSegments
        ref={lineRef}
        geometry={lineGeo}
        material={lineMat}
        renderOrder={12}
      />
      <mesh
        ref={fillRef}
        geometry={fillGeo}
        material={fillMat}
        renderOrder={12}
      />
    </group>
  );
}

// ── DrillSelectionRing ───────────────────────────────────────────────────────

/**
 * DrillSelectionRing — Root component for the 3D selection ring overlay.
 *
 * Sub-AC 3c: "scene focus" complement to the CameraRig's animated transition.
 * While the camera moves to the drilled entity, this component draws a visual
 * selection ring at that entity's world position, reinforcing what is being
 * focused on.
 *
 * Mounts nothing when drillLevel === "building" (no entity is drilled).
 * Otherwise, dispatches to the correct per-level ring component.
 *
 * Record-transparent: reads from stores, emits no events.
 */
export function DrillSelectionRing() {
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillFloor = useSpatialStore((s) => s.drillFloor);
  const drillRoom  = useSpatialStore((s) => s.drillRoom);
  const drillAgent = useSpatialStore((s) => s.drillAgent);
  const building   = useSpatialStore((s) => s.building);

  if (drillLevel === "building") return null;

  if (drillLevel === "floor" && drillFloor !== null) {
    const floorDef = building.floors.find((f) => f.floor === drillFloor);
    if (!floorDef) return null;
    return (
      <FloorDrillRing
        floor={drillFloor}
        gridW={floorDef.gridW ?? 12}
        gridD={floorDef.gridD ?? 6}
        accentColor="#4a6aff"
      />
    );
  }

  if (drillLevel === "room" && drillRoom !== null) {
    return <RoomDrillRing roomId={drillRoom} />;
  }

  if (drillLevel === "agent" && drillAgent !== null) {
    return <AgentDrillRing agentId={drillAgent} />;
  }

  return null;
}

export default DrillSelectionRing;
