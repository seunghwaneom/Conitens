/**
 * PixelOfficeFloor — Pixel-art room floor tiles for bird's-eye pixel-office preset.
 *
 * Renders room floors as PlaneGeometry meshes with tileset texture + NearestFilter.
 * Both floors are shown side-by-side: Floor 0 left, Floor 1 offset +14 grid units.
 * Non-focused floor fades to 0.3 opacity when zoomed in (zoom < 10).
 *
 * Floor labels use drei Text component (monospace, in-scene, scales with zoom).
 *
 * Only renders when birdsEyePreset === "pixel-office".
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture, Text } from "@react-three/drei";
import { useSpatialStore } from "../store/spatial-store.js";
import type { RoomDef } from "../data/building.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Gap between floor 0 and floor 1 in grid units */
const FLOOR_GAP = 2;
/** Floor 0 width in grid units */
const FLOOR_0_WIDTH = 12;
/** X offset for floor 1 rooms */
const FLOOR_1_OFFSET_X = FLOOR_0_WIDTH + FLOOR_GAP; // 14

/** Tileset atlas layout: 4 cols x 2 rows of 16x16 tiles */
const TILE_COLS = 4;
const TILE_ROWS = 2;

/** Map roomType to tile UV position in the atlas (col, row) */
const ROOM_TYPE_TILE: Record<string, [number, number]> = {
  control:  [0, 0],
  office:   [1, 0],
  lab:      [2, 0],
  lobby:    [3, 0],
  archive:  [0, 1],
  corridor: [1, 1],
};

/** Zoom threshold — below this, non-centered floor fades */
const FLOOR_FADE_ZOOM = 10;
/** Faded floor opacity */
const FADED_OPACITY = 0.3;

// ── Room Floor Tile ───────────────────────────────────────────────────────────

interface RoomFloorProps {
  room: RoomDef;
  floorOffsetX: number;
  texture: THREE.Texture;
  opacityRef: React.MutableRefObject<number>;
}

function RoomFloor({ room, floorOffsetX, texture, opacityRef }: RoomFloorProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Compute position: room center in world space
  const pos = room.position;
  const dim = room.dimensions;
  const cx = pos.x + dim.x / 2 + floorOffsetX;
  const cz = pos.z + dim.z / 2;

  // Compute UV for this room type's tile in the atlas
  const tileUV = ROOM_TYPE_TILE[room.roomType] ?? ROOM_TYPE_TILE.corridor;
  const uvOffsetX = tileUV[0] / TILE_COLS;
  const uvOffsetY = 1 - (tileUV[1] + 1) / TILE_ROWS; // flip Y for Three.js
  const uvRepeatX = 1 / TILE_COLS;
  const uvRepeatY = 1 / TILE_ROWS;

  // Clone texture per room to set unique UV offset/repeat
  const roomTexture = useMemo(() => {
    const t = texture.clone();
    t.offset.set(uvOffsetX, uvOffsetY);
    t.repeat.set(uvRepeatX * dim.x, uvRepeatY * dim.z);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }, [texture, uvOffsetX, uvOffsetY, uvRepeatX, uvRepeatY, dim.x, dim.z]);

  // Update opacity per frame
  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = opacityRef.current;
  });

  return (
    <mesh
      ref={meshRef}
      position={[cx, 0.01, cz]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[dim.x, dim.z]} />
      <meshBasicMaterial
        map={roomTexture}
        transparent
        opacity={1}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Floor Separator ───────────────────────────────────────────────────────────

function FloorSeparator() {
  const cx = FLOOR_0_WIDTH + FLOOR_GAP / 2;
  return (
    <mesh position={[cx, 0.005, 3]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[FLOOR_GAP, 6]} />
      <meshBasicMaterial color="#080810" transparent opacity={0.8} depthWrite={false} />
    </mesh>
  );
}

// ── Floor Label ───────────────────────────────────────────────────────────────

interface FloorLabelProps {
  text: string;
  x: number;
}

function FloorLabel({ text, x }: FloorLabelProps) {
  return (
    <Text
      position={[x, 0.02, -0.8]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.5}
      color="white"
      fillOpacity={0.7}
      anchorX="center"
      anchorY="middle"
      font={undefined}
    >
      {text}
    </Text>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PixelOfficeFloor() {
  const birdsEyePreset = useSpatialStore((s) => s.birdsEyePreset);
  const cameraMode = useSpatialStore((s) => s.cameraMode);
  const building = useSpatialStore((s) => s.building);

  // Only render in pixel-office bird's-eye mode
  if (cameraMode !== "birdsEye" || birdsEyePreset !== "pixel-office") return null;

  const rooms = building.rooms;
  const floor0Rooms = rooms.filter((r) => r.floor === 0);
  const floor1Rooms = rooms.filter((r) => r.floor === 1);

  return (
    <PixelOfficeFloorInner
      floor0Rooms={floor0Rooms}
      floor1Rooms={floor1Rooms}
    />
  );
}

interface InnerProps {
  floor0Rooms: RoomDef[];
  floor1Rooms: RoomDef[];
}

function PixelOfficeFloorInner({ floor0Rooms, floor1Rooms }: InnerProps) {
  const texture = useTexture("/tiles/room-tileset.png") as THREE.Texture;

  // Apply NearestFilter for pixel crispness
  useMemo(() => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
  }, [texture]);

  const camera = useThree((s) => s.camera);
  const floor0Opacity = useRef(1);
  const floor1Opacity = useRef(1);

  // Per-frame floor fade based on camera position and zoom
  useFrame(() => {
    const ortho = camera as THREE.OrthographicCamera;
    const zoom = (ortho.top - ortho.bottom) / 2; // frustum half-height = zoom level
    const camX = camera.position.x;

    if (zoom < FLOOR_FADE_ZOOM) {
      // Determine which floor the camera is centered over
      const midpoint = FLOOR_0_WIDTH + FLOOR_GAP / 2; // 13
      const targetF0 = camX < midpoint ? 1 : FADED_OPACITY;
      const targetF1 = camX >= midpoint ? 1 : FADED_OPACITY;
      // Smooth lerp
      floor0Opacity.current += (targetF0 - floor0Opacity.current) * 0.1;
      floor1Opacity.current += (targetF1 - floor1Opacity.current) * 0.1;
    } else {
      // Zoomed out: both floors full opacity
      floor0Opacity.current += (1 - floor0Opacity.current) * 0.1;
      floor1Opacity.current += (1 - floor1Opacity.current) * 0.1;
    }
  });

  return (
    <group name="pixel-office-floor">
      {/* Floor 0 rooms (left side) */}
      {floor0Rooms.map((room) => (
        <RoomFloor
          key={room.roomId}
          room={room}
          floorOffsetX={0}
          texture={texture}
          opacityRef={floor0Opacity}
        />
      ))}

      {/* Floor 1 rooms (right side, offset) */}
      {floor1Rooms.map((room) => (
        <RoomFloor
          key={room.roomId}
          room={room}
          floorOffsetX={FLOOR_1_OFFSET_X}
          texture={texture}
          opacityRef={floor1Opacity}
        />
      ))}

      {/* Dark separator strip */}
      <FloorSeparator />

      {/* Floor labels */}
      <FloorLabel text="F0  GROUND FLOOR" x={FLOOR_0_WIDTH / 2} />
      <FloorLabel text="F1  OPERATIONS FLOOR" x={FLOOR_1_OFFSET_X + FLOOR_0_WIDTH / 2} />
    </group>
  );
}
