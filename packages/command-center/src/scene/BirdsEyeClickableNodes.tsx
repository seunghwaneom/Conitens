/**
 * BirdsEyeClickableNodes — Clickable floor/room nodes in the bird's-eye view.
 *
 * Sub-AC 3b: Implements clickable floor and room nodes in the bird's-eye
 * orthographic camera view that trigger animated camera transitions to drill
 * down into selected hierarchy levels.
 *
 * Two interactive node types:
 *   ClickableFloorZone  — covers each floor's footprint; click → drill into floor
 *   ClickableRoomNode   — covers each room's cell;        click → drill into room
 *
 * Camera transition sequence on click:
 *   1. Animate bird's-eye camera to zoom in on + center the selected element
 *      (setBirdsEyeZoom + setBirdsEyePan → BirdsEyeCamera LERP plays out)
 *   2. After DRILL_TRANSITION_DELAY_MS: call spatial-store drill action
 *   3. Switch cameraMode → "perspective": unmounts BirdsEyeCamera, mounts CameraRig
 *   4. CameraRig reads drillLevel/drillFloor/drillRoom from store and starts
 *      its own lerp-based transition to the computed room/floor focus position
 *
 * All state mutations flow through the spatial-store which appends
 * navigation.drilled_floor / navigation.drilled_room events for full audit.
 *
 * Layering (Y-space above BirdsEyeLODLayer):
 *   Floor zone planes:  Y = floor * FLOOR_HEIGHT + 0.06   (LOD zone fills at 0.015)
 *   Room cell planes:   Y = room.position.y   + 0.08      (LOD room cells at 0.025-0.030)
 *   renderOrder: 20-23 (above BirdsEyeLODLayer max renderOrder of 4)
 *
 * Room planes are placed higher in Y-space than floor planes so the orthographic
 * camera (Y=30 looking down) hits room meshes BEFORE floor meshes.  Room click
 * handlers call e.stopPropagation() to prevent the parent floor zone from also
 * firing — room clicks are specific, floor clicks cover inter-room spaces.
 *
 * Guard: renders nothing unless cameraMode === "birdsEye".  All hooks called
 * unconditionally per React rules.
 */
import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useSpatialStore } from "../store/spatial-store.js";
import {
  BIRDS_EYE_BUILDING_CENTER_X,
  BIRDS_EYE_BUILDING_CENTER_Z,
  BIRDS_EYE_MIN_ZOOM,
} from "./BirdsEyeCamera.js";
import type { RoomDef, FloorDef } from "../data/building.js";

// ── Exported constants (pure, testable) ───────────────────────────────────────

/**
 * Delay in milliseconds between starting the bird's-eye zoom animation
 * and triggering the drill + perspective mode switch.
 *
 * Chosen to give the user a perceptible "zooming into" motion before the
 * camera cut to perspective, while remaining snappy.  BIRDS_EYE_LERP_SPEED=5
 * means the animation reaches ~83% of its target in 350ms.
 */
export const DRILL_TRANSITION_DELAY_MS = 350;

/**
 * Bird's-eye orthographic frustum half-size when drilling into a floor.
 *
 * Zooms in from BIRDS_EYE_DEFAULT_ZOOM (10) to highlight the floor boundary
 * before switching to the perspective floor-focus camera.
 *
 * Must be ≥ BIRDS_EYE_MIN_ZOOM (3) and < BIRDS_EYE_DEFAULT_ZOOM (10).
 */
export const DRILL_FLOOR_ZOOM = 5.5;

/**
 * Bird's-eye orthographic frustum half-size when drilling into a room.
 *
 * Zooms in more than DRILL_FLOOR_ZOOM (5.5) to tightly frame the specific
 * room before the camera cut to perspective room-focus view.
 *
 * Must be ≥ BIRDS_EYE_MIN_ZOOM (3) and < DRILL_FLOOR_ZOOM (5.5).
 */
export const DRILL_ROOM_ZOOM = 3.5;

/**
 * Hover fill opacity for floor zone nodes.
 *
 * Subtle enough not to occlude room cells below, but bright enough to
 * communicate "this is a clickable area" to the user.
 */
export const FLOOR_HOVER_FILL_OPACITY = 0.18;

/**
 * Hover outline opacity for floor zone nodes.
 * Must be > FLOOR_HOVER_FILL_OPACITY so edges are more prominent than fill.
 */
export const FLOOR_HOVER_OUTLINE_OPACITY = 0.72;

/**
 * Hover fill opacity for room nodes.
 *
 * Higher than FLOOR_HOVER_FILL_OPACITY because room cells are smaller and
 * need a more prominent highlight to communicate interactivity.
 */
export const ROOM_HOVER_FILL_OPACITY = 0.28;

/**
 * Hover outline opacity for room nodes.
 * Must be > ROOM_HOVER_FILL_OPACITY so room boundaries remain crisp.
 */
export const ROOM_HOVER_OUTLINE_OPACITY = 0.88;

// ── Exported pure helper functions ────────────────────────────────────────────

/**
 * Compute the bird's-eye camera pan target [panX, panZ] to center the view
 * on a floor's footprint.
 *
 * The pan offset is the vector from the building center to the floor center:
 *   panX = (gridW / 2) - buildingCenterX
 *   panZ = (gridD / 2) - buildingCenterZ
 *
 * For a standard building where all floors span the full building width and
 * depth (gridW = BUILDING_W, gridD = BUILDING_D), both pan values are 0.0
 * — the floor center coincides with the building center.
 *
 * Pure function: no React, no Three.js, no store dependencies.
 * Exported for unit testing and reuse by the HUD / zoom-to-floor actions.
 *
 * @param floorDef         Floor definition from building data
 * @param buildingCenterX  Building center X coordinate (= buildingW / 2)
 * @param buildingCenterZ  Building center Z coordinate (= buildingD / 2)
 * @returns                [panX, panZ] offset from building center
 */
export function computeFloorPanTarget(
  floorDef: FloorDef,
  buildingCenterX: number,
  buildingCenterZ: number,
): [number, number] {
  const floorCenterX = floorDef.gridW / 2;
  const floorCenterZ = floorDef.gridD / 2;
  return [
    floorCenterX - buildingCenterX,
    floorCenterZ - buildingCenterZ,
  ];
}

/**
 * Compute the bird's-eye camera pan target [panX, panZ] to center the view
 * on a room's floor cell.
 *
 * The pan offset is the vector from the building center to the room's center:
 *   panX = (room.position.x + room.dimensions.x / 2) - buildingCenterX
 *   panZ = (room.position.z + room.dimensions.z / 2) - buildingCenterZ
 *
 * Note: room.position.y (floor height) is intentionally ignored — the bird's-
 * eye camera pans in the XZ plane only, unaffected by vertical floor position.
 *
 * Pure function: no React, no Three.js, no store dependencies.
 * Exported for unit testing and reuse by the HUD / zoom-to-room actions.
 *
 * @param room             Room definition from building data
 * @param buildingCenterX  Building center X coordinate (= buildingW / 2)
 * @param buildingCenterZ  Building center Z coordinate (= buildingD / 2)
 * @returns                [panX, panZ] offset from building center
 */
export function computeRoomPanTarget(
  room: RoomDef,
  buildingCenterX: number,
  buildingCenterZ: number,
): [number, number] {
  const roomCenterX = room.position.x + room.dimensions.x / 2;
  const roomCenterZ = room.position.z + room.dimensions.z / 2;
  return [
    roomCenterX - buildingCenterX,
    roomCenterZ - buildingCenterZ,
  ];
}

// ── Internal layout constants ─────────────────────────────────────────────────

/** Grid units per floor — must match BirdsEyeOverlay.tsx, BirdsEyeLODLayer.tsx */
const FLOOR_HEIGHT = 3;

/** Hover accent color for floor zones (bright blue — matches command-center palette) */
const FLOOR_HOVER_COLOR = "#6a9aff";

// ── ClickableFloorZone ────────────────────────────────────────────────────────

interface ClickableFloorZoneProps {
  floorDef: FloorDef;
}

/**
 * ClickableFloorZone — Interactive transparent plane over a floor's footprint.
 *
 * Positioned at Y = floor * FLOOR_HEIGHT + 0.06, which is above the
 * BirdsEyeLODLayer zone fills (Y ≈ floor * FLOOR_HEIGHT + 0.015) so that
 * the orthographic camera (looking straight down from Y=30) hits this mesh
 * before the visual zone fills.
 *
 * Room cell planes are positioned at room.position.y + 0.08, which is higher
 * still — room clicks will be captured by ClickableRoomNode first, and
 * e.stopPropagation() prevents this floor zone from also firing.
 *
 * Hover feedback:
 *   - Translucent fill: FLOOR_HOVER_FILL_OPACITY (0.18) in FLOOR_HOVER_COLOR
 *   - Bright outline: rendered as a lineSegments rectangle
 *   - Tooltip badge: shows "↓ FLOOR N · name" via Html overlay
 *   - Cursor change: document.body.style.cursor = "pointer" on enter
 *
 * Click sequence:
 *   1. setBirdsEyeZoom(DRILL_FLOOR_ZOOM)   — zoom in to highlight floor
 *   2. setBirdsEyePan(floorPanTarget)       — center on floor
 *   3. After DRILL_TRANSITION_DELAY_MS:
 *        drillIntoFloor(floor)              — records navigation.drilled_floor
 *        setCameraMode("perspective")       — unmounts BirdsEyeCamera → mounts CameraRig
 *   4. CameraRig reads drillLevel="floor" → animates to computeFloorFocusCamera()
 */
function ClickableFloorZone({ floorDef }: ClickableFloorZoneProps) {
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setBirdsEyeZoom = useSpatialStore((s) => s.setBirdsEyeZoom);
  const setBirdsEyePan  = useSpatialStore((s) => s.setBirdsEyePan);
  const drillIntoFloor  = useSpatialStore((s) => s.drillIntoFloor);
  const setCameraMode   = useSpatialStore((s) => s.setCameraMode);

  // Clean up any pending transition timer on unmount to prevent
  // calling store actions on an unmounted component tree.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleClick = useCallback(
    (e: { stopPropagation(): void }) => {
      e.stopPropagation();

      const panTarget = computeFloorPanTarget(
        floorDef,
        BIRDS_EYE_BUILDING_CENTER_X,
        BIRDS_EYE_BUILDING_CENTER_Z,
      );

      // Phase 1: animate bird's-eye camera to center on this floor and zoom in
      setBirdsEyeZoom(DRILL_FLOOR_ZOOM);
      setBirdsEyePan(panTarget);

      // Phase 2: after animation settles, drill into floor + switch to perspective
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        drillIntoFloor(floorDef.floor);
        setCameraMode("perspective");
        timerRef.current = null;
      }, DRILL_TRANSITION_DELAY_MS);
    },
    [floorDef, setBirdsEyeZoom, setBirdsEyePan, drillIntoFloor, setCameraMode],
  );

  const handlePointerEnter = useCallback(
    (e: { stopPropagation(): void }) => {
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = "pointer";
    },
    [],
  );

  const handlePointerLeave = useCallback(
    (e: { stopPropagation(): void }) => {
      e.stopPropagation();
      setHovered(false);
      document.body.style.cursor = "default";
    },
    [],
  );

  const { floor, gridW: w, gridD: d } = floorDef;
  const cx = w / 2;
  const cz = d / 2;
  const y = floor * FLOOR_HEIGHT + 0.06;

  // Hover outline: axis-aligned rectangle using lineSegments (R3F intrinsic element)
  // Slightly inset from the plane boundary for a clean appearance.
  const outlineGeo = useMemo(() => {
    const hw = w / 2 - 0.08;
    const hd = d / 2 - 0.08;
    const pts = [
      // North edge
      new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(hw,  0, -hd),
      // East edge
      new THREE.Vector3(hw,  0, -hd), new THREE.Vector3(hw,  0,  hd),
      // South edge
      new THREE.Vector3(hw,  0,  hd), new THREE.Vector3(-hw, 0,  hd),
      // West edge
      new THREE.Vector3(-hw, 0,  hd), new THREE.Vector3(-hw, 0, -hd),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [w, d]);

  const outlineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: FLOOR_HOVER_COLOR,
        transparent: true,
        opacity: FLOOR_HOVER_OUTLINE_OPACITY,
        depthWrite: false,
      }),
    [],
  );

  return (
    <group
      position={[cx, y, cz]}
      name={`birds-eye-clickable-floor-${floor}`}
    >
      {/*
       * Transparent hit area — invisible (opacity=0) in normal state,
       * highlighted (FLOOR_HOVER_FILL_OPACITY) on hover.
       *
       * opacity=0 meshes still receive pointer events in Three.js raycasting
       * (the raycast method tests geometry, not material visibility).
       * renderOrder=20 places this above BirdsEyeLODLayer (max renderOrder=4).
       */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        renderOrder={20}
      >
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial
          color={FLOOR_HOVER_COLOR}
          transparent
          opacity={hovered ? FLOOR_HOVER_FILL_OPACITY : 0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Hover accent outline — only rendered during hover to save geometry */}
      {hovered && (
        <lineSegments
          geometry={outlineGeo}
          material={outlineMat}
          renderOrder={21}
        />
      )}

      {/* Drill-down hint tooltip — anchored slightly north of center to avoid
          overlapping room label cards from BirdsEyeOverlay */}
      {hovered && (
        <Html
          center
          position={[0, 0.12, -(d / 2) * 0.55]}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              background: "#080c18",
              border: "1px solid #4a6aff55",
              borderRadius: "3px",
              padding: "3px 8px",
              fontSize: "8px",
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontWeight: 700,
              color: FLOOR_HOVER_COLOR,
              letterSpacing: "0.12em",
              whiteSpace: "nowrap" as const,
              textTransform: "uppercase" as const,
              boxShadow: "0 2px 8px #00000099",
            }}
          >
            ↓ FLOOR {floor} · {floorDef.name}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── ClickableRoomNode ─────────────────────────────────────────────────────────

interface ClickableRoomNodeProps {
  room: RoomDef;
}

/**
 * ClickableRoomNode — Interactive transparent plane over a room's floor cell.
 *
 * Positioned at Y = room.position.y + 0.08, which places it above:
 *   - BirdsEyeLODLayer room cell fills (Y = room.position.y + 0.025)
 *   - BirdsEyeLODLayer room outlines   (Y = room.position.y + 0.030)
 *   - ClickableFloorZone planes        (Y = floor * FLOOR_HEIGHT + 0.06)
 *
 * The higher Y position ensures that the orthographic camera (looking straight
 * down from Y=30) hits room meshes before floor zone meshes, so room clicks
 * are captured by this component and e.stopPropagation() prevents the parent
 * floor zone from also firing.
 *
 * Hover feedback:
 *   - Role-colored translucent fill (ROOM_HOVER_FILL_OPACITY, room.colorAccent)
 *   - Bright role-colored outline (ROOM_HOVER_OUTLINE_OPACITY)
 *   - Tooltip badge: shows "↓ room.name" via Html overlay
 *   - Cursor change: document.body.style.cursor = "pointer" on enter
 *
 * Click sequence:
 *   1. setBirdsEyeZoom(DRILL_ROOM_ZOOM)  — zoom in tighter than floor drill
 *   2. setBirdsEyePan(roomPanTarget)      — center on room
 *   3. After DRILL_TRANSITION_DELAY_MS:
 *        drillIntoRoom(roomId)            — records navigation.drilled_room
 *        setCameraMode("perspective")     — unmounts BirdsEyeCamera → mounts CameraRig
 *   4. CameraRig reads drillLevel="room" → animates to computeRoomFocusCamera()
 */
function ClickableRoomNode({ room }: ClickableRoomNodeProps) {
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setBirdsEyeZoom = useSpatialStore((s) => s.setBirdsEyeZoom);
  const setBirdsEyePan  = useSpatialStore((s) => s.setBirdsEyePan);
  const drillIntoRoom   = useSpatialStore((s) => s.drillIntoRoom);
  const setCameraMode   = useSpatialStore((s) => s.setCameraMode);

  // Clean up any pending transition timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleClick = useCallback(
    (e: { stopPropagation(): void }) => {
      // Prevent parent ClickableFloorZone from also triggering a drill action.
      e.stopPropagation();

      const panTarget = computeRoomPanTarget(
        room,
        BIRDS_EYE_BUILDING_CENTER_X,
        BIRDS_EYE_BUILDING_CENTER_Z,
      );

      // Phase 1: animate bird's-eye camera to center on this room and zoom in
      setBirdsEyeZoom(DRILL_ROOM_ZOOM);
      setBirdsEyePan(panTarget);

      // Phase 2: after animation settles, drill into room + switch to perspective
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        drillIntoRoom(room.roomId);
        setCameraMode("perspective");
        timerRef.current = null;
      }, DRILL_TRANSITION_DELAY_MS);
    },
    [room, setBirdsEyeZoom, setBirdsEyePan, drillIntoRoom, setCameraMode],
  );

  const handlePointerEnter = useCallback(
    (e: { stopPropagation(): void }) => {
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = "pointer";
    },
    [],
  );

  const handlePointerLeave = useCallback(
    (e: { stopPropagation(): void }) => {
      e.stopPropagation();
      setHovered(false);
      document.body.style.cursor = "default";
    },
    [],
  );

  const { x: px, y: py, z: pz } = room.position;
  const { x: w, z: d } = room.dimensions;
  const cx = px + w / 2;
  const cz = pz + d / 2;
  // Y: above BirdsEyeLODLayer room cells (0.025-0.030) and floor zones (0.060)
  const y = py + 0.08;

  // Hover outline: role-colored rectangle inset from the plane boundary.
  const outlineGeo = useMemo(() => {
    const hw = w / 2 - 0.05;
    const hd = d / 2 - 0.05;
    const pts = [
      // North edge
      new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(hw,  0, -hd),
      // East edge
      new THREE.Vector3(hw,  0, -hd), new THREE.Vector3(hw,  0,  hd),
      // South edge
      new THREE.Vector3(hw,  0,  hd), new THREE.Vector3(-hw, 0,  hd),
      // West edge
      new THREE.Vector3(-hw, 0,  hd), new THREE.Vector3(-hw, 0, -hd),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [w, d]);

  const outlineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: room.colorAccent,
        transparent: true,
        opacity: ROOM_HOVER_OUTLINE_OPACITY,
        depthWrite: false,
      }),
    [room.colorAccent],
  );

  return (
    <group
      position={[cx, y, cz]}
      name={`birds-eye-clickable-room-${room.roomId}`}
    >
      {/*
       * Role-colored hit area — nearly invisible (opacity≈0) in normal state,
       * highlighted on hover (ROOM_HOVER_FILL_OPACITY in room.colorAccent).
       *
       * Inset by 0.12 on each axis to leave a thin "inter-room gap" that
       * reveals the floor-zone hit plane beneath, allowing floor zone clicks
       * in the narrow spacing between rooms.
       *
       * renderOrder=22 — above floor zone planes (renderOrder=20).
       */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        renderOrder={22}
      >
        <planeGeometry args={[w - 0.12, d - 0.12]} />
        <meshBasicMaterial
          color={room.colorAccent}
          transparent
          opacity={hovered ? ROOM_HOVER_FILL_OPACITY : 0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Role-colored hover accent outline — only rendered during hover */}
      {hovered && (
        <lineSegments
          geometry={outlineGeo}
          material={outlineMat}
          renderOrder={23}
        />
      )}

      {/* Drill-down hint tooltip — centered above the room cell */}
      {hovered && (
        <Html
          center
          position={[0, 0.1, 0]}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              background: "#080c18",
              border: `1px solid ${room.colorAccent}55`,
              borderRadius: "3px",
              padding: "2px 7px",
              fontSize: "7px",
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontWeight: 700,
              color: room.colorAccent,
              letterSpacing: "0.1em",
              whiteSpace: "nowrap" as const,
              textTransform: "uppercase" as const,
              boxShadow: "0 2px 6px #00000099",
            }}
          >
            ↓ {room.name}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * BirdsEyeClickableNodes — Clickable floor/room nodes in bird's-eye view.
 *
 * Sub-AC 3b acceptance criteria:
 *   ✓ Floor zone nodes are clickable in bird's-eye orthographic view
 *   ✓ Room cell nodes are clickable in bird's-eye orthographic view
 *   ✓ Clicking a floor: animates zoom/pan to floor center, then drills + perspective
 *   ✓ Clicking a room: animates zoom/pan to room center, then drills + perspective
 *   ✓ CameraRig (in perspective mode) animates to the drilled floor/room focus
 *   ✓ Hover provides role-colored visual feedback (fill + outline + tooltip)
 *   ✓ Room clicks stop propagation to prevent parent floor zone from also firing
 *   ✓ All drill actions route through spatial-store (event-sourced audit trail)
 *   ✓ Pending timers are cleaned up on unmount (no memory leaks or stale actions)
 *   ✓ Guard: renders nothing when cameraMode !== "birdsEye"
 *   ✓ All hooks called unconditionally (React rules)
 *
 * Integration:
 *   Mount inside R3F <Canvas> alongside <BirdsEyeLODLayer /> and <BirdsEyeOverlay />.
 *   All three components guard against non-birdsEye mode and are safe to co-exist.
 *
 *   <BirdsEyeLODLayer />        — visual hierarchy (fills, outlines, markers)
 *   <BirdsEyeOverlay />         — ambient labels (banners, type cards, compass)
 *   <BirdsEyeClickableNodes />  — interaction layer (this component)
 */
export function BirdsEyeClickableNodes() {
  // ── All hooks called unconditionally (React rules) ─────────────────────────
  const cameraMode = useSpatialStore((s) => s.cameraMode);
  const building   = useSpatialStore((s) => s.building);

  // ── Guard: only render in bird's-eye mode ─────────────────────────────────
  if (cameraMode !== "birdsEye") return null;

  return (
    <group name="birds-eye-clickable-nodes">
      {/*
       * Floor zone planes (Level 2) — one per floor.
       *
       * Positioned at Y = floor * FLOOR_HEIGHT + 0.06 — below room cell planes.
       * Clicks on inter-room floor space (not covered by any room cell plane)
       * land here and trigger a floor-level drill.
       */}
      {building.floors.map((floorDef) => (
        <ClickableFloorZone key={floorDef.floor} floorDef={floorDef} />
      ))}

      {/*
       * Room cell planes (Level 3) — one per room.
       *
       * Positioned at Y = room.position.y + 0.08 — above floor zone planes.
       * Clicks on room cells trigger a room-level drill, and stopPropagation()
       * prevents the underlying floor zone from also firing.
       */}
      {building.rooms.map((room) => (
        <ClickableRoomNode key={room.roomId} room={room} />
      ))}
    </group>
  );
}

// Re-export MIN_ZOOM for consumers that import it via this module
export { BIRDS_EYE_MIN_ZOOM };
