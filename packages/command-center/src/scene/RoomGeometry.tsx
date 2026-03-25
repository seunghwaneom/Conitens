/**
 * RoomGeometry — Renders individual rooms inside the building.
 *
 * Each room is rendered with:
 * - Floor slab with strong accent color tint (role-based)
 * - Interior walls with role-tinted material
 * - Ceiling panel with role type color (visible from overhead/bird's-eye)
 * - Role-type wall stripe on back wall (strong in-world type indicator)
 * - Door cutouts (represented as darker segments)
 * - Window cutouts (represented as translucent panels)
 * - Room label (always visible, shows type + name)
 * - Accent edge glow on the floor perimeter
 * - Member count badge
 * - Activity indicator (pulse glow)
 *
 * Rooms are dynamically loaded from .agent/rooms/ YAML configs
 * via the spatial store. Falls back to static data.
 */
import { useMemo, useCallback, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { RoomDef, DoorPosition, WindowPosition } from "../data/building.js";
import { BUILDING } from "../data/building.js";
import { useSpatialStore, type RoomRuntimeState } from "../store/spatial-store.js";
import { useMeetingStore } from "../store/meeting-store.js";
import { RoomTypeMarker, ROLE_VISUALS } from "./RoomTypeVisuals.js";
import { RoomDisplaySurfaces } from "./DisplaySurfaces.js";

const WALL_THICKNESS = 0.08;
const WALL_HEIGHT_RATIO = 0.85; // Walls are 85% of room height for visibility
const DOOR_WIDTH = 0.8;
const DOOR_HEIGHT = 2.0;
const FLOOR_HEIGHT = 3; // grid units per floor — matches _building.yaml

/** Room type → accent intensity mapping */
const ROOM_TYPE_GLOW: Record<string, number> = {
  control: 0.8,
  office: 0.5,
  lab: 0.6,
  lobby: 0.7,
  archive: 0.3,
  corridor: 0.2,
};

/**
 * Room type → wall blend strength.
 * Higher values = more accent color in walls = clearer type identity.
 */
const ROOM_TYPE_WALL_BLEND: Record<string, number> = {
  control: 0.22,
  office: 0.16,
  lab: 0.20,
  lobby: 0.18,
  archive: 0.12,
  corridor: 0.10,
};

/**
 * Room type → floor blend strength.
 * Higher values = stronger floor color = easier overhead identification.
 */
const ROOM_TYPE_FLOOR_BLEND: Record<string, number> = {
  control: 0.30,
  office: 0.22,
  lab: 0.28,
  lobby: 0.25,
  archive: 0.15,
  corridor: 0.12,
};

/** Creates a wall material with the room's accent color blended in */
function useRoomWallMaterial(accentColor: string, roomType: string) {
  const blendStrength = ROOM_TYPE_WALL_BLEND[roomType] ?? 0.15;
  return useMemo(() => {
    const base = new THREE.Color(BUILDING.visual.wallColor);
    const accent = new THREE.Color(accentColor);
    const blended = base.clone().lerp(accent, blendStrength);
    return new THREE.MeshStandardMaterial({
      color: blended,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accentColor, blendStrength]);
}

/** Floor with role-type accent tint — stronger blend for clear overhead identification */
function RoomFloor({ room }: { room: RoomDef }) {
  const { x: w, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const blendStrength = ROOM_TYPE_FLOOR_BLEND[room.roomType] ?? 0.18;

  const mat = useMemo(() => {
    const base = new THREE.Color(BUILDING.visual.floorColor);
    const accent = new THREE.Color(room.colorAccent);
    const blended = base.clone().lerp(accent, blendStrength);
    return new THREE.MeshStandardMaterial({
      color: blended,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.colorAccent, blendStrength]);

  return (
    <mesh
      position={[px + w / 2, py + 0.02, pz + d / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={mat}
      receiveShadow
    >
      <planeGeometry args={[w - 0.02, d - 0.02]} />
    </mesh>
  );
}

/**
 * Ceiling panel — rendered at room top, tinted with room type color.
 * Critical for bird's-eye and overhead camera views where ceiling is visible.
 * Uses stronger type-specific blend so room type is identifiable from above.
 */
function RoomCeiling({ room }: { room: RoomDef }) {
  const { x: w, y: h, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const config = ROLE_VISUALS[room.roomType];
  const glowIntensity = ROOM_TYPE_GLOW[room.roomType] ?? 0.4;

  const mat = useMemo(() => {
    const base = new THREE.Color(BUILDING.visual.ceilingColor);
    const accent = new THREE.Color(room.colorAccent);
    // Ceiling uses stronger blend (~35%) so type is obvious from above
    const blended = base.clone().lerp(accent, 0.35);
    return new THREE.MeshStandardMaterial({
      color: blended,
      emissive: config ? config.emissive : room.colorAccent,
      emissiveIntensity: glowIntensity * 0.12,
      roughness: 0.8,
      metalness: 0.15,
      flatShading: true,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.colorAccent, config, glowIntensity]);

  return (
    <mesh
      position={[px + w / 2, py + h - 0.02, pz + d / 2]}
      rotation={[Math.PI / 2, 0, 0]}
      material={mat}
      receiveShadow
    >
      <planeGeometry args={[w - 0.04, d - 0.04]} />
    </mesh>
  );
}

/**
 * Type stripe on the back (north) wall — a strong horizontal color band
 * at eye level that immediately communicates the room's role/type.
 * Acts as a diegetic "paint stripe" in the 3D world.
 */
function RoomTypeWallStripe({ room }: { room: RoomDef }) {
  const { x: w, y: h, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const config = ROLE_VISUALS[room.roomType];
  const glowIntensity = ROOM_TYPE_GLOW[room.roomType] ?? 0.4;

  if (!config) return null;

  const stripeH = 0.12;
  const stripeY = py + h * WALL_HEIGHT_RATIO * 0.72; // ~72% up the wall
  const stripeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: config.color,
        emissive: config.emissive,
        emissiveIntensity: glowIntensity * 0.55,
        roughness: 0.3,
        metalness: 0.4,
        flatShading: true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.color, config.emissive, glowIntensity],
  );

  return (
    <group>
      {/* North wall stripe — most visible from south-facing cameras */}
      <mesh
        position={[px + w / 2, stripeY, pz + d - WALL_THICKNESS / 2]}
        material={stripeMat}
        castShadow={false}
      >
        <boxGeometry args={[w - 0.1, stripeH, WALL_THICKNESS * 1.5]} />
      </mesh>
      {/* West wall stripe — visible from east-facing cameras */}
      <mesh
        position={[px + WALL_THICKNESS / 2, stripeY, pz + d / 2]}
        material={stripeMat}
        castShadow={false}
      >
        <boxGeometry args={[WALL_THICKNESS * 1.5, stripeH, d - 0.1]} />
      </mesh>
    </group>
  );
}

/** Accent glow strip around room perimeter (floor level) */
function RoomAccentStrip({ room }: { room: RoomDef }) {
  const { x: w, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const glowIntensity = ROOM_TYPE_GLOW[room.roomType] ?? 0.4;

  const stripMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: room.colorAccent,
        transparent: true,
        opacity: glowIntensity * 0.4,
      }),
    [room.colorAccent, glowIntensity],
  );

  const stripH = 0.03;
  const stripThick = 0.04;

  return (
    <group>
      {/* Front (south) strip */}
      <mesh position={[px + w / 2, py + stripH / 2, pz]} material={stripMat}>
        <boxGeometry args={[w, stripH, stripThick]} />
      </mesh>
      {/* Back (north) strip */}
      <mesh position={[px + w / 2, py + stripH / 2, pz + d]} material={stripMat}>
        <boxGeometry args={[w, stripH, stripThick]} />
      </mesh>
      {/* Left (west) strip */}
      <mesh position={[px, py + stripH / 2, pz + d / 2]} material={stripMat}>
        <boxGeometry args={[stripThick, stripH, d]} />
      </mesh>
      {/* Right (east) strip */}
      <mesh position={[px + w, py + stripH / 2, pz + d / 2]} material={stripMat}>
        <boxGeometry args={[stripThick, stripH, d]} />
      </mesh>
    </group>
  );
}

/** Determines if a wall segment should have a door gap */
function hasDoorAt(doors: DoorPosition[], wall: DoorPosition["wall"]): DoorPosition | undefined {
  return doors.find((d) => d.wall === wall);
}

/** Determines if a wall segment should have a window */
function hasWindowAt(windows: WindowPosition[], wall: WindowPosition["wall"]): WindowPosition | undefined {
  return windows.find((w) => w.wall === wall);
}

/**
 * Renders a single interior wall, potentially with a door or window cutout.
 * For simplicity, doors are represented as gaps and windows as translucent panels.
 */
function InteriorWall({
  room,
  wall,
  wallMat,
}: {
  room: RoomDef;
  wall: "north" | "south" | "east" | "west";
  wallMat: THREE.MeshStandardMaterial;
}) {
  const { x: w, y: h, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const wallH = h * WALL_HEIGHT_RATIO;
  const door = hasDoorAt(room.doors, wall);
  const win = hasWindowAt(room.windows, wall);

  // Calculate wall position and dimensions based on orientation
  let pos: [number, number, number];
  let size: [number, number, number];
  let isXAligned: boolean; // wall runs along X axis

  switch (wall) {
    case "south": // z = pz (front)
      pos = [px + w / 2, py + wallH / 2, pz];
      size = [w, wallH, WALL_THICKNESS];
      isXAligned = true;
      break;
    case "north": // z = pz + d (back)
      pos = [px + w / 2, py + wallH / 2, pz + d];
      size = [w, wallH, WALL_THICKNESS];
      isXAligned = true;
      break;
    case "west": // x = px (left)
      pos = [px, py + wallH / 2, pz + d / 2];
      size = [WALL_THICKNESS, wallH, d];
      isXAligned = false;
      break;
    case "east": // x = px + w (right)
      pos = [px + w, py + wallH / 2, pz + d / 2];
      size = [WALL_THICKNESS, wallH, d];
      isXAligned = false;
      break;
  }

  // If there's a door, render two wall segments around it
  if (door) {
    const doorW = DOOR_WIDTH;
    const doorH = Math.min(DOOR_HEIGHT, wallH);
    const wallLen = isXAligned ? w : d;
    const doorCenter = door.offset;

    // Left segment
    const leftLen = Math.max(0, doorCenter - doorW / 2);
    // Right segment
    const rightLen = Math.max(0, wallLen - doorCenter - doorW / 2);

    return (
      <group>
        {leftLen > 0.01 && (
          <mesh
            position={
              isXAligned
                ? [px + leftLen / 2, py + wallH / 2, pos[2]]
                : [pos[0], py + wallH / 2, pz + leftLen / 2]
            }
            material={wallMat}
            castShadow
          >
            <boxGeometry
              args={
                isXAligned
                  ? [leftLen, wallH, WALL_THICKNESS]
                  : [WALL_THICKNESS, wallH, leftLen]
              }
            />
          </mesh>
        )}
        {rightLen > 0.01 && (
          <mesh
            position={
              isXAligned
                ? [px + w - rightLen / 2, py + wallH / 2, pos[2]]
                : [pos[0], py + wallH / 2, pz + d - rightLen / 2]
            }
            material={wallMat}
            castShadow
          >
            <boxGeometry
              args={
                isXAligned
                  ? [rightLen, wallH, WALL_THICKNESS]
                  : [WALL_THICKNESS, wallH, rightLen]
              }
            />
          </mesh>
        )}
        {/* Transom above door */}
        {wallH > doorH && (
          <mesh
            position={
              isXAligned
                ? [px + doorCenter, py + doorH + (wallH - doorH) / 2, pos[2]]
                : [pos[0], py + doorH + (wallH - doorH) / 2, pz + doorCenter]
            }
            material={wallMat}
            castShadow
          >
            <boxGeometry
              args={
                isXAligned
                  ? [doorW, wallH - doorH, WALL_THICKNESS]
                  : [WALL_THICKNESS, wallH - doorH, doorW]
              }
            />
          </mesh>
        )}
      </group>
    );
  }

  // If there's a window, render a translucent panel section
  if (win) {
    const winW = win.width;
    const winH = 1.2;
    const winBottom = 1.0;
    const wallLen = isXAligned ? w : d;
    const winCenter = win.offset + winW / 2;

    return (
      <group>
        {/* Full wall */}
        <mesh position={pos} material={wallMat} castShadow>
          <boxGeometry args={size} />
        </mesh>
        {/* Window highlight overlay */}
        <mesh
          position={
            isXAligned
              ? [px + winCenter, py + winBottom + winH / 2, pos[2] + (wall === "south" ? -0.01 : 0.01)]
              : [pos[0] + (wall === "west" ? -0.01 : 0.01), py + winBottom + winH / 2, pz + winCenter]
          }
        >
          <boxGeometry
            args={
              isXAligned
                ? [winW, winH, 0.02]
                : [0.02, winH, winW]
            }
          />
          <meshBasicMaterial color={room.colorAccent} transparent opacity={0.15} />
        </mesh>
      </group>
    );
  }

  // Plain wall
  return (
    <mesh position={pos} material={wallMat} castShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

/**
 * Floating room name label — always visible, enhanced with room-type info.
 *
 * Renders a two-line label:
 *  - Top line: role type badge (icon + abbreviation) in accent color
 *  - Bottom line: room name in dimmer text (brightens on hover)
 *
 * The type badge is always visible so room type is identifiable without
 * hovering. The name brightens on hover for interaction feedback.
 */
function RoomLabel({ room, hovered }: { room: RoomDef; hovered: boolean }) {
  const { x: w, y: h, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const config = ROLE_VISUALS[room.roomType];
  const icon = config?.icon ?? "?";
  const typeLabel = config?.label ?? room.roomType.toUpperCase();

  return (
    <Html
      position={[px + w / 2, py + h + 0.35, pz + d / 2]}
      center
      distanceFactor={12}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2px",
          transition: "all 0.2s ease",
        }}
      >
        {/* Type badge — always visible, high contrast */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "3px",
            background: hovered
              ? `${room.colorAccent}22`
              : "rgba(8, 8, 18, 0.70)",
            border: `1px solid ${room.colorAccent}${hovered ? "99" : "44"}`,
            borderRadius: "3px",
            padding: "1px 5px",
            backdropFilter: "blur(3px)",
            transition: "all 0.2s ease",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              color: room.colorAccent,
              lineHeight: 1,
              opacity: hovered ? 1 : 0.85,
            }}
          >
            {icon}
          </span>
          <span
            style={{
              fontSize: "7px",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              color: room.colorAccent,
              letterSpacing: "0.1em",
              fontWeight: 700,
              opacity: hovered ? 1 : 0.75,
            }}
          >
            {typeLabel}
          </span>
        </div>

        {/* Room name — always present, brightens on hover */}
        <div
          style={{
            color: hovered ? room.colorAccent : "#8888aa",
            fontSize: "10px",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontWeight: hovered ? 700 : 400,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            whiteSpace: "nowrap",
            textShadow: hovered ? `0 0 10px ${room.colorAccent}66` : "none",
            transition: "all 0.2s ease",
            opacity: hovered ? 1 : 0.6,
          }}
        >
          {room.name}
          {room.members.length > 0 && (
            <span
              style={{
                color: hovered ? "#aaaacc" : "#555566",
                fontSize: "8px",
                marginLeft: "5px",
              }}
            >
              [{room.members.length}]
            </span>
          )}
        </div>

        {/* Convene hint — appears on hover to hint the right-click affordance */}
        {hovered && (
          <div
            style={{
              marginTop: "2px",
              fontSize: "6px",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              color: "#aa88ff88",
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
              opacity: 0.75,
            }}
          >
            ⚑ right-click to convene
          </div>
        )}
      </div>
    </Html>
  );
}

/**
 * MeetingRoomOverlay — Sub-AC 10c.
 *
 * Renders an animated gold/cyan overlay on the room floor and a pulsing
 * "SESSION ACTIVE" label above the room when an active collaboration session
 * is taking place in this room.  The overlay is a low-poly ring + glow plane
 * that visually distinguishes meeting rooms from regular-activity rooms.
 */
function MeetingRoomOverlay({ room, session }: {
  room: RoomDef;
  session: { title?: string; participants: { participant_id: string }[] };
}) {
  const { x: w, y: h, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const meshRef = useRef<THREE.Mesh>(null);
  const planeRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      // Rotate outer ring slowly
      meshRef.current.rotation.z = t * 0.6;
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + Math.sin(t * 2.2) * 0.15;
    }
    if (planeRef.current) {
      const mat = planeRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + Math.sin(t * 1.8 + 1) * 0.05;
    }
  });

  const outerRingMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#FFD700",
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const floorGlowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#FFD700",
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const cx = px + w / 2;
  const cz = pz + d / 2;
  const rMin = Math.min(w, d) / 2 - 0.15;
  const rMax = Math.min(w, d) / 2 - 0.05;

  return (
    <group>
      {/* Animated outer ring on floor */}
      <mesh
        ref={meshRef}
        position={[cx, py + 0.08, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={outerRingMat}
      >
        <ringGeometry args={[rMin, rMax, 8]} />
      </mesh>

      {/* Subtle floor glow plane */}
      <mesh
        ref={planeRef}
        position={[cx, py + 0.04, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={floorGlowMat}
      >
        <planeGeometry args={[w - 0.3, d - 0.3]} />
      </mesh>

      {/* "SESSION ACTIVE" diegetic label */}
      <Html
        position={[cx, py + h + 0.65, cz]}
        center
        distanceFactor={12}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            2,
            animation:      "none",
          }}
        >
          {/* Main session badge */}
          <div
            style={{
              background:    "rgba(255, 215, 0, 0.12)",
              border:        "1px solid rgba(255, 215, 0, 0.55)",
              borderRadius:  4,
              padding:       "2px 8px",
              display:       "flex",
              alignItems:    "center",
              gap:           5,
              backdropFilter: "blur(4px)",
            }}
          >
            <span style={{ fontSize: "8px", color: "#FFD700", lineHeight: 1 }}>⚑</span>
            <span
              style={{
                fontSize:      "7px",
                fontFamily:    "'JetBrains Mono', 'Fira Code', monospace",
                fontWeight:    700,
                letterSpacing: "0.1em",
                color:         "#FFD700",
                textTransform: "uppercase" as const,
                whiteSpace:    "nowrap",
              }}
            >
              SESSION ACTIVE
            </span>
            <span
              style={{
                fontSize:      "6px",
                fontFamily:    "'JetBrains Mono', monospace",
                color:         "#FFD70099",
                marginLeft:    2,
              }}
            >
              {session.participants.length}✦
            </span>
          </div>
          {/* Meeting title (truncated) */}
          {session.title && (
            <div
              style={{
                fontSize:      "6px",
                fontFamily:    "'JetBrains Mono', monospace",
                color:         "#FFD70077",
                letterSpacing: "0.06em",
                maxWidth:      120,
                overflow:      "hidden",
                textOverflow:  "ellipsis",
                whiteSpace:    "nowrap",
                textAlign:     "center",
              }}
            >
              {session.title}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/** Point light inside room with accent color */
function RoomLight({ room }: { room: RoomDef }) {
  const { x: w, y: h, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const intensity = ROOM_TYPE_GLOW[room.roomType] ?? 0.4;

  return (
    <pointLight
      position={[px + w / 2, py + h * 0.7, pz + d / 2]}
      color={room.colorAccent}
      intensity={intensity * 0.8}
      distance={Math.max(w, d) * 1.5}
      decay={2}
    />
  );
}

/**
 * Activity pulse indicator — a glow ring that animates based on room activity.
 */
function ActivityPulse({ room, activity }: { room: RoomDef; activity: RoomRuntimeState["activity"] }) {
  const { x: w, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;
  const meshRef = useMemo(() => ({ current: null as THREE.Mesh | null }), []);

  const color = useMemo(() => {
    switch (activity) {
      case "active": return "#00ff88";
      case "busy": return "#ffaa00";
      case "error": return "#ff4444";
      default: return room.colorAccent;
    }
  }, [activity, room.colorAccent]);

  const shouldPulse = activity === "active" || activity === "busy";

  useFrame(({ clock }) => {
    if (!meshRef.current || !shouldPulse) return;
    const t = clock.getElapsedTime();
    const pulse = 0.3 + Math.sin(t * 2) * 0.15;
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
  });

  if (activity === "idle") return null;

  return (
    <mesh
      ref={(ref) => { meshRef.current = ref; }}
      position={[px + w / 2, py + 0.05, pz + d / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[Math.min(w, d) / 2 - 0.3, Math.min(w, d) / 2 - 0.1, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * Selection outline — highlighted border when room is selected.
 */
function SelectionOutline({ room }: { room: RoomDef }) {
  const { x: w, y: h, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;

  const points = useMemo(() => {
    return [
      // Bottom rectangle
      new THREE.Vector3(px, py + 0.03, pz),
      new THREE.Vector3(px + w, py + 0.03, pz),
      new THREE.Vector3(px + w, py + 0.03, pz + d),
      new THREE.Vector3(px, py + 0.03, pz + d),
      new THREE.Vector3(px, py + 0.03, pz),
      // Top rectangle
      new THREE.Vector3(px, py + h, pz),
      new THREE.Vector3(px + w, py + h, pz),
      new THREE.Vector3(px + w, py + h, pz + d),
      new THREE.Vector3(px, py + h, pz + d),
      new THREE.Vector3(px, py + h, pz),
    ];
  }, [px, py, pz, w, h, d]);

  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial color={room.colorAccent} linewidth={2} transparent opacity={0.8} />
    </lineLoop>
  );
}

/**
 * FloorGridCells — Renders a 1×1 unit grid overlay on a floor plane.
 *
 * Each cell in the grid corresponds to one spatial unit in the building
 * coordinate system, making the "distinct spatial cell" allocation
 * visually explicit. Rooms occupy contiguous blocks of cells.
 *
 * The grid is rendered just above the floor slab (y + 0.015) to avoid
 * z-fighting.  It respects the floor's visibility toggle.
 */
function FloorGridCells({ floor }: { floor: number }) {
  const building = useSpatialStore((s) => s.building);
  const isVisible = useSpatialStore((s) => s.floorVisibility[floor] ?? true);
  // Use dynamic building visual settings so YAML overrides propagate here
  const gridColor = building.visual.gridColor;

  const floorDef = useMemo(
    () => building.floors.find((f) => f.floor === floor),
    [building.floors, floor],
  );

  const geometry = useMemo(() => {
    if (!floorDef) return null;
    const { gridW: w, gridD: d } = floorDef;
    const y = floor * FLOOR_HEIGHT + 0.015;
    const pts: THREE.Vector3[] = [];

    // Vertical grid lines (run along Z axis, evenly spaced on X)
    for (let x = 0; x <= w; x++) {
      pts.push(new THREE.Vector3(x, y, 0));
      pts.push(new THREE.Vector3(x, y, d));
    }
    // Horizontal grid lines (run along X axis, evenly spaced on Z)
    for (let z = 0; z <= d; z++) {
      pts.push(new THREE.Vector3(0, y, z));
      pts.push(new THREE.Vector3(w, y, z));
    }

    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [floorDef, floor]);

  if (!isVisible || !geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={gridColor} transparent opacity={0.25} />
    </lineSegments>
  );
}

/** Single room component — connected to the spatial store */
export function Room({ room }: { room: RoomDef }) {
  const roomState = useSpatialStore((s) => s.getRoomState(room.roomId));
  const highlightRoom = useSpatialStore((s) => s.highlightRoom);
  const unhighlightRoom = useSpatialStore((s) => s.unhighlightRoom);
  const drillIntoRoom = useSpatialStore((s) => s.drillIntoRoom);
  const openConveneDialog = useSpatialStore((s) => s.openConveneDialog);
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillRoom = useSpatialStore((s) => s.drillRoom);
  const selectedRoomId = useSpatialStore((s) => s.selectedRoomId);

  // Sub-AC 10c: check if this room has an active meeting session
  const activeMeetingSession = useMeetingStore((s) => s.getSessionForRoom(room.roomId));

  const wallMat = useRoomWallMaterial(room.colorAccent, room.roomType);
  const isSelected = selectedRoomId === room.roomId;
  const isDrilled = drillRoom === room.roomId && drillLevel === "room";

  const handlePointerOver = useCallback(() => {
    highlightRoom(room.roomId);
    document.body.style.cursor = "pointer";
  }, [highlightRoom, room.roomId]);

  const handlePointerOut = useCallback(() => {
    unhighlightRoom(room.roomId);
    document.body.style.cursor = "auto";
  }, [unhighlightRoom, room.roomId]);

  /**
   * Single click — drill into this room.
   * This transitions the camera into the room-level view (Sub-AC 3c).
   * If already drilled into this room, clicking again is a no-op (use ESC to ascend).
   */
  const handleClick = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!isDrilled) {
      drillIntoRoom(room.roomId);
    }
  }, [drillIntoRoom, isDrilled, room.roomId]);

  /**
   * Double-click — same as single-click drill (for discoverability).
   * Kept so existing muscle memory still works.
   */
  const handleDoubleClick = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    drillIntoRoom(room.roomId);
  }, [drillIntoRoom, room.roomId]);

  /**
   * Right-click / context menu — open the "Convene Meeting" dialog.
   *
   * Sub-AC 10a: 3D interactive meeting convocation trigger.
   * Right-clicking a room node in the 3D scene opens the structured
   * meeting-request form for this room. The action is event-sourced:
   * submission records a meeting.convene_requested event to the spatial
   * event log and forwards it to the control-plane event bus.
   */
  const handleContextMenu = useCallback((e: { stopPropagation: () => void; nativeEvent?: Event }) => {
    e.stopPropagation();
    // Suppress the browser's native context menu inside the 3D canvas
    if (e.nativeEvent) e.nativeEvent.preventDefault();
    openConveneDialog(room.roomId);
  }, [openConveneDialog, room.roomId]);

  return (
    <group
      name={`room-${room.roomId}`}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Floor — role-tinted, visible from all angles */}
      <RoomFloor room={room} />

      {/* Ceiling — role-tinted with stronger blend, visible from bird's-eye */}
      <RoomCeiling room={room} />

      {/* Perimeter accent glow strip */}
      <RoomAccentStrip room={room} />

      {/* Role type wall stripe — horizontal band on back+left walls */}
      <RoomTypeWallStripe room={room} />

      {/* Interior walls — all four sides, role-tinted material */}
      <InteriorWall room={room} wall="south" wallMat={wallMat} />
      <InteriorWall room={room} wall="north" wallMat={wallMat} />
      <InteriorWall room={room} wall="west" wallMat={wallMat} />
      <InteriorWall room={room} wall="east" wallMat={wallMat} />

      {/* Room interior light — accent colored per role */}
      <RoomLight room={room} />

      {/* Role-based 3D type marker — distinct geometry per room role */}
      <RoomTypeMarker room={room} />

      {/* Label — always visible type badge + room name */}
      <RoomLabel room={room} hovered={roomState.highlighted} />

      {/* Activity pulse indicator */}
      <ActivityPulse room={room} activity={roomState.activity} />

      {/* Sub-AC 10c: Meeting session overlay — shown when a session is active here */}
      {activeMeetingSession && (
        <MeetingRoomOverlay room={room} session={activeMeetingSession} />
      )}

      {/* Selection outline */}
      {isSelected && <SelectionOutline room={room} />}

      {/* In-world display surfaces — monitors, wall panels, hologram stands */}
      <RoomDisplaySurfaces room={room} />
    </group>
  );
}

/**
 * Renders all rooms for a given floor — reads from spatial store.
 *
 * Sub-AC 3: Subscribes to `building.rooms` directly (not the stable
 * `getRoomsForFloor` function reference) so the room list updates
 * reactively when YAML-loaded data replaces the static fallback.
 *
 * The stairwell (roomId === "stairwell") spans floors 0–1 and is
 * included on both floors to reflect its multi-floor geometry.
 */
export function FloorRooms({ floor }: { floor: number }) {
  // Subscribe to building.rooms so useMemo re-runs when YAML replaces static data.
  // getRoomsForFloor is a stable function reference in Zustand that would never
  // trigger useMemo invalidation — using building.rooms as the dep is correct.
  const buildingRooms = useSpatialStore((s) => s.building.rooms);
  const isVisible = useSpatialStore((s) => s.floorVisibility[floor] ?? true);

  const rooms = useMemo(() => {
    return buildingRooms.filter((r) => {
      // Stairwell spans floors — render on both ground (0) and ops (1)
      if (r.roomId === "stairwell") return floor === 0 || floor === 1;
      return r.floor === floor;
    });
  }, [buildingRooms, floor]);

  if (!isVisible) return null;

  return (
    <group name={`floor-${floor}-rooms`}>
      {/* 1×1 spatial cell grid — shows distinct cell allocation per floor */}
      <FloorGridCells floor={floor} />

      {/* Procedurally-generated room meshes — derived from .agent/rooms/ YAML */}
      {rooms.map((room) => (
        <Room key={room.roomId} room={room} />
      ))}
    </group>
  );
}

/**
 * DynamicFloors — Renders all floors from the building definition in the store.
 * Automatically adapts when rooms are loaded from YAML.
 */
export function DynamicFloors() {
  const floors = useSpatialStore((s) => s.building.floors);

  return (
    <>
      {floors.map((f) => (
        <FloorRooms key={f.floor} floor={f.floor} />
      ))}
    </>
  );
}
