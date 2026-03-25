/**
 * BuildingShell — The outer shell of the command center building.
 *
 * Renders the exterior walls, roof outline, and ground plane with a
 * low-poly dark command-center aesthetic. The building is rendered as
 * a cutaway (no front wall) so the interior rooms are visible.
 *
 * Interactive: clicking the building shell at the "building" drill level
 * navigates into the building (drills to the first floor).  Hover state
 * shows a brightened glow so the user knows the shell is clickable.
 *
 * Sub-AC 4a: Click, hover, and context-menu event handlers emit typed
 * `BuildingInteractionIntent` values via the `useBuildingInteraction` hook.
 * Every pointer interaction is recorded in the scene event log for full
 * record transparency (write-only, append-only).
 */
import { useMemo, useState } from "react";
import * as THREE from "three";
import { useSpatialStore } from "../store/spatial-store.js";
import { BUILDING } from "../data/building.js";
import { FloorPlanSkeleton } from "./FloorPlanSkeleton.js";
import { useBuildingInteraction } from "../hooks/use-building-interaction.js";

const WALL_THICKNESS = 0.12;
const FLOOR_HEIGHT = 3;   // matches room h=3
const NUM_FLOORS = 2;
const BUILDING_W = 12;    // grid width
const BUILDING_D = 6;     // grid depth
const TOTAL_H = FLOOR_HEIGHT * NUM_FLOORS; // 6

const { wallColor, floorColor, ceilingColor } = BUILDING.visual;

/** Low-poly wall material — dark matte with subtle edge glow */
function useWallMaterial(color: string = wallColor) {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        metalness: 0.1,
        flatShading: true,
      }),
    [color],
  );
}

/** Ground plane beneath the building */
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[BUILDING_W / 2, -0.01, BUILDING_D / 2]} receiveShadow>
      <planeGeometry args={[BUILDING_W + 8, BUILDING_D + 8]} />
      <meshStandardMaterial color="#12121C" roughness={0.95} metalness={0.0} flatShading />
    </mesh>
  );
}

/** Grid overlay on the ground */
function GridOverlay() {
  if (!BUILDING.visual.gridVisible) return null;
  return (
    <gridHelper
      args={[Math.max(BUILDING_W, BUILDING_D) + 8, Math.max(BUILDING_W, BUILDING_D) + 8, BUILDING.visual.gridColor, BUILDING.visual.gridColor]}
      position={[BUILDING_W / 2, 0.005, BUILDING_D / 2]}
    />
  );
}

/** Individual wall segment */
function WallSegment({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
}) {
  const mat = useWallMaterial(color);
  return (
    <mesh position={position} material={mat} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

/** Floor slab for each level */
function FloorSlab({ y, color }: { y: number; color: string }) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0.05,
        flatShading: true,
      }),
    [color],
  );

  return (
    <mesh position={[BUILDING_W / 2, y, BUILDING_D / 2]} material={mat} receiveShadow>
      <boxGeometry args={[BUILDING_W, 0.1, BUILDING_D]} />
    </mesh>
  );
}

/** Roof with slight overhang — flat low-poly style */
function Roof() {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ceilingColor,
        roughness: 0.9,
        metalness: 0.15,
        flatShading: true,
      }),
    [],
  );

  return (
    <mesh position={[BUILDING_W / 2, TOTAL_H + 0.05, BUILDING_D / 2]} material={mat} castShadow>
      <boxGeometry args={[BUILDING_W + 0.3, 0.15, BUILDING_D + 0.3]} />
    </mesh>
  );
}

/** Edge trim lines for the low-poly look */
function BuildingEdges() {
  const points = useMemo(() => {
    const w = BUILDING_W;
    const d = BUILDING_D;
    const h = TOTAL_H;
    // Outline of the building — bottom edges, top edges, verticals
    return [
      // Bottom
      [0, 0, 0], [w, 0, 0],
      [w, 0, 0], [w, 0, d],
      [w, 0, d], [0, 0, d],
      [0, 0, d], [0, 0, 0],
      // Top
      [0, h, 0], [w, h, 0],
      [w, h, 0], [w, h, d],
      [w, h, d], [0, h, d],
      [0, h, d], [0, h, 0],
      // Verticals
      [0, 0, 0], [0, h, 0],
      [w, 0, 0], [w, h, 0],
      [w, 0, d], [w, h, d],
      [0, 0, d], [0, h, d],
      // Floor divider at y=3
      [0, FLOOR_HEIGHT, 0], [w, FLOOR_HEIGHT, 0],
      [w, FLOOR_HEIGHT, 0], [w, FLOOR_HEIGHT, d],
      [w, FLOOR_HEIGHT, d], [0, FLOOR_HEIGHT, d],
      [0, FLOOR_HEIGHT, d], [0, FLOOR_HEIGHT, 0],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [points]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#4a4a6a" linewidth={1} />
    </lineSegments>
  );
}

/** Accent light strip along the building base */
function BaseGlowStrip({ intensityScale = 1.0 }: { intensityScale?: number }) {
  const intensity = BUILDING.visual.accentGlowIntensity * intensityScale;
  return (
    <group>
      {/* Front edge glow */}
      <mesh position={[BUILDING_W / 2, 0.02, -0.05]}>
        <boxGeometry args={[BUILDING_W, 0.04, 0.06]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={intensity * 0.5} />
      </mesh>
      {/* Side edge glows */}
      <mesh position={[-0.05, 0.02, BUILDING_D / 2]}>
        <boxGeometry args={[0.06, 0.04, BUILDING_D]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={intensity * 0.3} />
      </mesh>
      <mesh position={[BUILDING_W + 0.05, 0.02, BUILDING_D / 2]}>
        <boxGeometry args={[0.06, 0.04, BUILDING_D]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={intensity * 0.3} />
      </mesh>
    </group>
  );
}

/**
 * BuildingHoverHighlight — Visual affordance ring shown when the building
 * exterior is hovered (at building drill-level). Indicates the building is
 * clickable / enterable.
 */
function BuildingHoverHighlight() {
  return (
    <group>
      {/* Bright perimeter ring at base */}
      <mesh position={[BUILDING_W / 2, 0.04, -0.05]}>
        <boxGeometry args={[BUILDING_W, 0.06, 0.08]} />
        <meshBasicMaterial color="#6a8aff" transparent opacity={0.85} />
      </mesh>
      <mesh position={[-0.05, 0.04, BUILDING_D / 2]}>
        <boxGeometry args={[0.08, 0.06, BUILDING_D]} />
        <meshBasicMaterial color="#6a8aff" transparent opacity={0.6} />
      </mesh>
      <mesh position={[BUILDING_W + 0.05, 0.04, BUILDING_D / 2]}>
        <boxGeometry args={[0.08, 0.06, BUILDING_D]} />
        <meshBasicMaterial color="#6a8aff" transparent opacity={0.6} />
      </mesh>
      <mesh position={[BUILDING_W / 2, 0.04, BUILDING_D + 0.05]}>
        <boxGeometry args={[BUILDING_W, 0.06, 0.08]} />
        <meshBasicMaterial color="#6a8aff" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

/**
 * BuildingSelectionOutline — Wireframe outline shown when the user has
 * drilled into the building (drill level is floor / room / agent).
 * Gives a persistent "you are inside this building" indicator.
 */
function BuildingSelectionOutline() {
  const points = useMemo(() => [
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(BUILDING_W, 0, 0),
    new THREE.Vector3(BUILDING_W, 0, 0), new THREE.Vector3(BUILDING_W, 0, BUILDING_D),
    new THREE.Vector3(BUILDING_W, 0, BUILDING_D), new THREE.Vector3(0, 0, BUILDING_D),
    new THREE.Vector3(0, 0, BUILDING_D), new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, TOTAL_H, 0), new THREE.Vector3(BUILDING_W, TOTAL_H, 0),
    new THREE.Vector3(BUILDING_W, TOTAL_H, 0), new THREE.Vector3(BUILDING_W, TOTAL_H, BUILDING_D),
    new THREE.Vector3(BUILDING_W, TOTAL_H, BUILDING_D), new THREE.Vector3(0, TOTAL_H, BUILDING_D),
    new THREE.Vector3(0, TOTAL_H, BUILDING_D), new THREE.Vector3(0, TOTAL_H, 0),
  ], []);

  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#4a6aff" transparent opacity={0.9} />
    </lineSegments>
  );
}

/**
 * BuildingShell — interactive outer shell.
 *
 * At the "building" drill-level the shell is clickable: hovering shows a
 * brightened perimeter glow and clicking calls drillIntoFloor() for the
 * first floor (ground floor).  Once inside the building the outline changes
 * to a persistent "selected" wireframe so users know they are inside.
 *
 * Sub-AC 4a: All pointer interactions (click, hover, context-menu) emit
 * typed `BuildingInteractionIntent` values via `useBuildingInteraction`.
 * Intents are recorded in the scene event log and drive store actions.
 */
export function BuildingShell() {
  const drillLevel = useSpatialStore((s) => s.drillLevel);

  // Sub-AC 4a: typed interaction intent handlers.
  // The handlers emit typed BuildingInteractionIntent values to the scene
  // event log on every pointer event (click, hover, context-menu).
  //
  // `contextMenu` carries the screen/world position when the operator
  // right-clicks the building.  DOM-level context menu rendering is handled
  // by a sibling component outside the <Canvas> (see BuildingContextMenuPortal
  // in src/components/).  The spatial store's `conveneDialogRoomId` pattern
  // can be extended for building-level context menus in a future Sub-AC.
  const { handlers } = useBuildingInteraction();

  // Local hover state for visual affordance (hovered highlight ring).
  // Derived from the interaction: onPointerOver sets true, onPointerOut false.
  const [hovered, setHovered] = useState(false);

  /** True when clicking the building shell should navigate into it */
  const isEnterable = drillLevel === "building";
  /** True when the user is currently inside the building (drilled in) */
  const isEntered   = drillLevel !== "building";

  /**
   * Wrapped handlers: augment the typed intent handlers with the local
   * hover state needed for the visual affordance ring.
   */
  function handlePointerOver(e: Parameters<typeof handlers.onPointerOver>[0]) {
    if (!isEnterable) return;
    setHovered(true);
    handlers.onPointerOver(e);
  }

  function handlePointerOut(e: Parameters<typeof handlers.onPointerOut>[0]) {
    setHovered(false);
    handlers.onPointerOut(e);
  }

  function handleClick(e: Parameters<typeof handlers.onClick>[0]) {
    handlers.onClick(e);
  }

  function handleContextMenu(e: Parameters<typeof handlers.onContextMenu>[0]) {
    handlers.onContextMenu(e);
  }

  return (
    <>
    <group
      name="building-shell"
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <GroundPlane />
      <GridOverlay />

      {/* Back wall (north — z = BUILDING_D) */}
      <WallSegment
        position={[BUILDING_W / 2, TOTAL_H / 2, BUILDING_D]}
        size={[BUILDING_W, TOTAL_H, WALL_THICKNESS]}
      />

      {/* Left wall (west — x = 0) */}
      <WallSegment
        position={[0, TOTAL_H / 2, BUILDING_D / 2]}
        size={[WALL_THICKNESS, TOTAL_H, BUILDING_D]}
      />

      {/* Right wall (east — x = BUILDING_W) */}
      <WallSegment
        position={[BUILDING_W, TOTAL_H / 2, BUILDING_D / 2]}
        size={[WALL_THICKNESS, TOTAL_H, BUILDING_D]}
      />

      {/* No front wall — cutaway view for interior visibility */}

      {/* Floor slabs */}
      <FloorSlab y={0} color={floorColor} />
      <FloorSlab y={FLOOR_HEIGHT} color={floorColor} />

      {/*
       * Sub-AC 2: Floor plan skeleton — architectural wireframe overlay.
       *
       * Renders each room's footprint as thin accent-colored line segments on
       * the floor surface of every level.  The skeleton is always visible (unlike
       * full room geometry which is LOD-gated) and provides spatial orientation
       * at any camera distance.  Opacity is dimmed when the user has drilled
       * inside the building so it doesn't compete with full room geometry.
       */}
      <FloorPlanSkeleton opacityScale={isEntered ? 0.55 : 0.85} />

      {/* Roof */}
      <Roof />

      {/* Edge wireframe overlay */}
      <BuildingEdges />

      {/* Glow accents — brighter when hovered */}
      <BaseGlowStrip intensityScale={hovered ? 2.5 : 1.0} />

      {/* Hover highlight ring — visible when building is hovered at overview level */}
      {hovered && isEnterable && <BuildingHoverHighlight />}

      {/* Selection outline — persistent while the user is inside the building */}
      {isEntered && <BuildingSelectionOutline />}
    </group>
    </>
  );
}
