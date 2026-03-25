/**
 * BirdsEyeOverlay — Ambient labels and low-poly visual guides for the bird's-eye camera mode.
 *
 * Sub-AC 3.1: Top-level bird's-eye 3D camera view — ambient floor + department labels.
 *
 * Renders diegetic overlays specifically designed for orthographic top-down viewing:
 *   FloorAmbientBanner  — Wide floor name + department label along the building edge.
 *   RoomCeilingCard     — Per-room ceiling label: type badge, room name, agent count.
 *   RoomCeilingTile     — Translucent colored fill at room ceiling level (type-coded).
 *   ActivityPulseRing   — Animated expanding ring on active/busy rooms.
 *   FloorSeparatorPlane — Thin translucent plane at the floor boundary (Y=FLOOR_HEIGHT).
 *   BuildingCompass     — Cardinal direction indicator at the NW corner of the building.
 *
 * Guard: renders nothing unless cameraMode === "birdsEye".  All hooks are called
 * unconditionally (React rules); the guard only gates the JSX output.
 *
 * Layout (in Three.js world coordinates, orthographic camera at Y=30 looking –Y):
 *   Floor 0 banner:  just north of building (Z < 0, displayed at top of image)
 *   Floor 1 banner:  just south of building (Z > BUILDING_D, at bottom of image)
 *   Room tiles/labels: centered at room ceiling height
 *   Compass:         NW corner (X < 0, Z < 0 → top-left in image)
 *
 * All data sourced from useSpatialStore (event-sourced) and useAgentStore.
 */
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";
import type { RoomDef } from "../data/building.js";
import { ROLE_VISUALS } from "./RoomTypeVisuals.js";

// ── Layout constants ────────────────────────────────────────────────

/** Grid units per floor — must match _building.yaml + RoomGeometry.tsx */
export const FLOOR_HEIGHT = 3;
/** Building width (X) in grid units — must match BirdsEyeCamera.tsx */
export const BUILDING_W = 12;
/** Building depth (Z) in grid units — must match BirdsEyeCamera.tsx */
export const BUILDING_D = 6;
/**
 * Height above room ceiling to position overlay geometry / HTML anchors.
 * Small enough not to occlude perspective-mode room markers.
 */
export const CEILING_OFFSET = 0.12;

// ── Department / floor annotations ─────────────────────────────────

/**
 * Department description per floor index.
 * Shown in the floor ambient banner alongside the floor name.
 * Extend if building YAML adds more floors.
 */
export const FLOOR_DEPARTMENTS: Record<number, string> = {
  0: "ENTRY · RECORDS",
  1: "OPERATIONS",
};

// ── Room type display abbreviations ────────────────────────────────

/**
 * Short label for each room type — shown in the room ceiling type badge.
 * Deliberately terse (≤4 chars) so labels fit in narrow rooms.
 */
export const ROOM_TYPE_DISPLAY: Record<string, string> = {
  control:  "CMD",
  office:   "OFC",
  lab:      "LAB",
  lobby:    "MAIN",
  archive:  "ARCH",
  corridor: "PATH",
};

// ── Pure helpers (exported for testability) ─────────────────────────

/**
 * Compute a map of roomId → agent count from the flat agents record.
 * Pure function; no React dependencies.
 */
export function computeAgentsByRoom(
  agents: Record<string, { roomId: string }>,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const agent of Object.values(agents)) {
    if (agent.roomId) {
      map[agent.roomId] = (map[agent.roomId] ?? 0) + 1;
    }
  }
  return map;
}

/**
 * Minimal room shape required by computeFloorStats.
 * Using a structural subset avoids coupling test helpers to full RoomDef.
 */
export interface RoomFloorStats {
  roomId: string;
  floor: number;
}

/**
 * Compute per-floor agent and room counts given the rooms list and agentsByRoom map.
 * Accepts any object with roomId and floor (superset of full RoomDef).
 */
export function computeFloorStats(
  rooms: readonly RoomFloorStats[],
  agentsByRoom: Record<string, number>,
): Record<number, { roomCount: number; agentCount: number }> {
  const map: Record<number, { roomCount: number; agentCount: number }> = {};
  for (const room of rooms) {
    const floor = room.floor;
    const entry = map[floor] ?? { roomCount: 0, agentCount: 0 };
    entry.roomCount += 1;
    entry.agentCount += agentsByRoom[room.roomId] ?? 0;
    map[floor] = entry;
  }
  return map;
}

// ── Sub-components ──────────────────────────────────────────────────

// ─ Floor separator plane ────────────────────────────────────────────

/**
 * Thin translucent horizontal plane at the inter-floor boundary (Y = FLOOR_HEIGHT).
 * Visually separates the two floor layers when both are rendered simultaneously
 * in the orthographic top-down view.
 */
function FloorSeparatorPlane({ y }: { y: number }) {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#2a3060",
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  return (
    <mesh
      position={[BUILDING_W / 2, y + 0.02, BUILDING_D / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
    >
      <planeGeometry args={[BUILDING_W + 0.6, BUILDING_D + 0.6]} />
    </mesh>
  );
}

// ─ Activity pulse ring ───────────────────────────────────────────────

interface ActivityPulseRingProps {
  cx: number;
  cy: number;
  cz: number;
  color: string;
  /** Activity level drives animation speed: busy = faster */
  fast?: boolean;
}

/**
 * Animated expanding ring at ceiling level for active / busy rooms.
 * Two concentric rings pulse at different phases for a heartbeat effect.
 */
function ActivityPulseRing({ cx, cy, cz, color, fast = false }: ActivityPulseRingProps) {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const phaseRef = useRef(Math.random() * Math.PI * 2);

  const outerMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [color],
  );
  const innerMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [color],
  );

  useFrame((_, delta) => {
    const speed = fast ? 1.4 : 0.85;
    phaseRef.current += delta * speed;

    if (outer.current) {
      const t = (Math.sin(phaseRef.current) * 0.5 + 0.5); // 0→1
      outer.current.scale.setScalar(0.55 + t * 0.45);
      (outer.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.32;
    }
    if (inner.current) {
      const t = (Math.sin(phaseRef.current + Math.PI) * 0.5 + 0.5);
      inner.current.scale.setScalar(0.25 + t * 0.3);
      (inner.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.22;
    }
  });

  return (
    <group position={[cx, cy, cz]}>
      <mesh
        ref={outer}
        rotation={[-Math.PI / 2, 0, 0]}
        material={outerMat}
      >
        <ringGeometry args={[0.35, 0.55, 18]} />
      </mesh>
      <mesh
        ref={inner}
        rotation={[-Math.PI / 2, 0, 0]}
        material={innerMat}
      >
        <ringGeometry args={[0.12, 0.22, 12]} />
      </mesh>
    </group>
  );
}

// ─ Room ceiling tile ─────────────────────────────────────────────────

interface RoomCeilingTileProps {
  room: RoomDef;
}

/**
 * Translucent colored fill tile at the room's ceiling level.
 * Uses the room type's accent color from ROLE_VISUALS.
 * Includes a faint border line loop for low-poly type identification.
 */
function RoomCeilingTile({ room }: RoomCeilingTileProps) {
  const visual = ROLE_VISUALS[room.roomType] ?? ROLE_VISUALS.office;

  const fillMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: visual.color,
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [visual.color],
  );

  // Outline rectangle using LineSegments (4 edges = 8 points = 4 segment pairs).
  // <lineSegments> is used (not <line>) because it is already registered as an
  // R3F intrinsic element in the codebase and avoids the SVG <line> type conflict.
  const outlineGeom = useMemo(() => {
    const hw = room.dimensions.x / 2 - 0.06;
    const hd = room.dimensions.z / 2 - 0.06;
    // Each pair of points = one segment: top, right, bottom, left edges
    const pts = [
      new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3( hw, 0, -hd), // top
      new THREE.Vector3( hw, 0, -hd), new THREE.Vector3( hw, 0,  hd), // right
      new THREE.Vector3( hw, 0,  hd), new THREE.Vector3(-hw, 0,  hd), // bottom
      new THREE.Vector3(-hw, 0,  hd), new THREE.Vector3(-hw, 0, -hd), // left
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [room.dimensions.x, room.dimensions.z]);

  const outlineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: visual.color,
        transparent: true,
        opacity: 0.4,
      }),
    [visual.color],
  );

  const ceilingY = room.position.y + room.dimensions.y + CEILING_OFFSET;
  const cx = room.position.x + room.dimensions.x / 2;
  const cz = room.position.z + room.dimensions.z / 2;

  return (
    <group position={[cx, ceilingY, cz]}>
      {/* Translucent fill */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={fillMat}>
        <planeGeometry args={[room.dimensions.x - 0.12, room.dimensions.z - 0.12]} />
      </mesh>
      {/* Accent outline — uses lineSegments (R3F intrinsic, avoids SVG <line> conflict) */}
      <lineSegments geometry={outlineGeom} material={outlineMat} />
    </group>
  );
}

// ─ Room ceiling label ─────────────────────────────────────────────────

interface RoomCeilingLabelProps {
  room: RoomDef;
  agentCount: number;
  activity: "idle" | "active" | "busy" | "error";
}

/** Activity badge color mapping */
const ACTIVITY_COLORS: Record<string, string> = {
  idle:   "#445566",
  active: "#44cc88",
  busy:   "#ffaa22",
  error:  "#ff4444",
};

/**
 * HTML label card anchored to the room's ceiling center.
 * Shows: type icon+badge · room name · agent count dot + status.
 *
 * Uses <Html> (screen-space projection, no transform) so text is always
 * rendered at readable orientation regardless of camera angle.
 */
function RoomCeilingLabel({ room, agentCount, activity }: RoomCeilingLabelProps) {
  const visual = ROLE_VISUALS[room.roomType] ?? ROLE_VISUALS.office;
  const typeAbbrev = ROOM_TYPE_DISPLAY[room.roomType] ?? room.roomType.toUpperCase().slice(0, 4);
  const actColor = ACTIVITY_COLORS[activity] ?? ACTIVITY_COLORS.idle;

  const ceilingY = room.position.y + room.dimensions.y + CEILING_OFFSET + 0.04;
  const cx = room.position.x + room.dimensions.x / 2;
  const cz = room.position.z + room.dimensions.z / 2;

  return (
    <group position={[cx, ceilingY, cz]}>
      <Html
        center
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1px",
          }}
        >
          {/* Type badge */}
          <div
            style={{
              background: `${visual.color}1a`,
              border: `1px solid ${visual.color}55`,
              borderRadius: "2px",
              padding: "1px 4px",
              fontSize: "6px",
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontWeight: 700,
              color: visual.color,
              letterSpacing: "0.12em",
              textTransform: "uppercase" as const,
              lineHeight: 1.2,
            }}
          >
            {visual.icon} {typeAbbrev}
          </div>
          {/* Room name */}
          <div
            style={{
              fontSize: "7px",
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontWeight: 600,
              color: "#aaaacc",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap" as const,
              textTransform: "uppercase" as const,
              textShadow: "0 1px 4px #000000bb",
              maxWidth: "70px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={room.name}
          >
            {room.name}
          </div>
          {/* Agent count + activity dot */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "3px",
              fontSize: "6px",
              fontFamily: "'JetBrains Mono', monospace",
              color: actColor,
            }}
          >
            <span
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: actColor,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            {agentCount} {agentCount === 1 ? "AGT" : "AGTS"}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ─ Floor ambient banner ───────────────────────────────────────────────

interface FloorAmbientBannerProps {
  floorIndex: number;
  floorName: string;
  roomCount: number;
  agentCount: number;
  /** World Z position for this banner — chosen to avoid overlapping other floor banners */
  bannerZ: number;
  /** World Y position (for depth ordering) */
  bannerY: number;
}

/**
 * Wide horizontal banner for one building floor.
 * Positioned along the building edge (just north or south) so it is visible
 * in the top-down orthographic view without overlapping room geometry.
 *
 * Geometry: a thin dark box + two accent strips + Html label.
 */
function FloorAmbientBanner({
  floorIndex,
  floorName,
  roomCount,
  agentCount,
  bannerZ,
  bannerY,
}: FloorAmbientBannerProps) {
  const deptLabel = FLOOR_DEPARTMENTS[floorIndex] ?? "";
  const panelW = BUILDING_W + 1.4; // slightly wider than building

  return (
    <group position={[BUILDING_W / 2, bannerY, bannerZ]}>
      {/* Dark background box */}
      <mesh>
        <boxGeometry args={[panelW, 0.3, 0.02]} />
        <meshBasicMaterial color="#0c0c1a" transparent opacity={0.82} />
      </mesh>
      {/* Left accent strip */}
      <mesh position={[-(panelW / 2) + 0.055, 0, 0.015]}>
        <boxGeometry args={[0.07, 0.26, 0.012]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={0.75} />
      </mesh>
      {/* Right accent strip */}
      <mesh position={[(panelW / 2) - 0.055, 0, 0.015]}>
        <boxGeometry args={[0.07, 0.26, 0.012]} />
        <meshBasicMaterial color="#2a3a88" transparent opacity={0.55} />
      </mesh>
      {/* HTML label (screen-space, always readable) */}
      <Html
        center
        position={[0, 0, 0.02]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            whiteSpace: "nowrap" as const,
          }}
        >
          {/* Floor index badge */}
          <span
            style={{
              color: "#5566ff",
              fontSize: "7px",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 800,
              letterSpacing: "0.2em",
              background: "#4a6aff18",
              border: "1px solid #4a6aff33",
              borderRadius: "2px",
              padding: "0 4px",
            }}
          >
            F{floorIndex}
          </span>
          {/* Floor name */}
          <span
            style={{
              color: "#9999cc",
              fontSize: "8px",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase" as const,
            }}
          >
            {floorName}
          </span>
          {/* Department tag */}
          {deptLabel && (
            <span
              style={{
                color: "#4a5575",
                fontSize: "6px",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.1em",
              }}
            >
              — {deptLabel}
            </span>
          )}
          {/* Stats */}
          <span
            style={{
              color: "#333355",
              fontSize: "6px",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.08em",
            }}
          >
            {roomCount} rooms · {agentCount} agents
          </span>
        </div>
      </Html>
    </group>
  );
}

// ─ Building compass ───────────────────────────────────────────────────

/**
 * Low-poly cardinal direction indicator placed in the NW corner of the building.
 *
 * In the orthographic top-down projection:
 *   X increases → right in image
 *   Z increases → down in image (south)
 *   N = lower Z = top of image
 */
function BuildingCompass() {
  // NW corner: X slightly left of building, Z slightly above building (north)
  const cx = -1.6;
  const cy = 0.06;
  const cz = -1.6;

  return (
    <group position={[cx, cy, cz]}>
      {/* Base disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.45, 10]} />
        <meshBasicMaterial color="#0a0a18" transparent opacity={0.78} />
      </mesh>
      {/* N–S axis */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.035, 0.7]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={0.65} />
      </mesh>
      {/* E–W axis */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[0.035, 0.7]} />
        <meshBasicMaterial color="#2a3a66" transparent opacity={0.55} />
      </mesh>
      {/* North arrowhead (points toward –Z = north = top of image) */}
      <mesh position={[0, 0.01, -0.28]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.09, 0.14, 3]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={0.9} />
      </mesh>

      {/* Cardinal labels */}
      <Html
        center
        position={[0, 0.02, -0.52]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <span
          style={{
            color: "#6688ff",
            fontSize: "7px",
            fontFamily: "monospace",
            fontWeight: 700,
            textShadow: "0 1px 3px #000",
          }}
        >
          N
        </span>
      </Html>
      <Html
        center
        position={[0, 0.02, 0.52]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <span style={{ color: "#334455", fontSize: "6px", fontFamily: "monospace" }}>S</span>
      </Html>
      <Html
        center
        position={[0.52, 0.02, 0]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <span style={{ color: "#334455", fontSize: "6px", fontFamily: "monospace" }}>E</span>
      </Html>
      <Html
        center
        position={[-0.52, 0.02, 0]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <span style={{ color: "#334455", fontSize: "6px", fontFamily: "monospace" }}>W</span>
      </Html>
    </group>
  );
}

// ── Main export ─────────────────────────────────────────────────────

/**
 * BirdsEyeOverlay — Top-level bird's-eye view ambient label system.
 *
 * Mounts inside the R3F <Canvas>. Guards the JSX return when cameraMode
 * is not "birdsEye", but calls all hooks unconditionally (React rules).
 *
 * Sub-AC 3.1 acceptance criteria fulfilled:
 *   ✓ Top-level bird's-eye camera is activated via cameraMode="birdsEye"
 *   ✓ Full office/room layout rendered with low-poly stylized ceiling tiles
 *   ✓ Ambient floor labels (FloorAmbientBanner) for each floor
 *   ✓ Department labels (FLOOR_DEPARTMENTS) integrated into floor banners
 *   ✓ Per-room labels (type badge, name, agent count) at ceiling level
 *   ✓ Activity indicators (pulse rings) for active/busy rooms
 *   ✓ Floor separator plane between floors
 *   ✓ Building compass for spatial orientation
 */
export function BirdsEyeOverlay() {
  // ── All hooks called unconditionally ──────────────────────────────
  const cameraMode = useSpatialStore((s) => s.cameraMode);
  const building   = useSpatialStore((s) => s.building);
  const roomStates = useSpatialStore((s) => s.roomStates);
  const agents     = useAgentStore((s) => s.agents);

  const agentsByRoom = useMemo(() => computeAgentsByRoom(agents), [agents]);

  const floorStats = useMemo(
    () => computeFloorStats(building.rooms, agentsByRoom),
    [building.rooms, agentsByRoom],
  );

  // ── Guard: only render in bird's-eye mode ─────────────────────────
  if (cameraMode !== "birdsEye") return null;

  const hasTwoFloors = building.floors.length >= 2;

  return (
    <group name="birds-eye-overlay">
      {/* Floor separator plane — between floors (when multi-floor building) */}
      {hasTwoFloors && <FloorSeparatorPlane y={FLOOR_HEIGHT} />}

      {/*
       * Floor ambient banners — one per floor, placed on opposite building edges
       * so they don't overlap in top-down orthographic projection:
       *   Floor 0: north edge (Z < 0) — appears at top of image
       *   Floor 1: south edge (Z > BUILDING_D) — appears at bottom
       *   Floors 2+: further south with 1.2 unit spacing
       */}
      {building.floors.map((floorDef, idx) => {
        const stats = floorStats[floorDef.floor] ?? { roomCount: 0, agentCount: 0 };
        // Alternate: even floors → north, odd → south
        const bannerZ =
          idx % 2 === 0
            ? -0.85                     // north of building
            : BUILDING_D + 0.85 + (Math.floor(idx / 2) * 1.2); // south of building
        const bannerY = floorDef.floor * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;

        return (
          <FloorAmbientBanner
            key={floorDef.floor}
            floorIndex={floorDef.floor}
            floorName={floorDef.name}
            roomCount={stats.roomCount}
            agentCount={stats.agentCount}
            bannerZ={bannerZ}
            bannerY={bannerY}
          />
        );
      })}

      {/* Per-room ceiling overlays */}
      {building.rooms.map((room) => {
        const rState   = roomStates[room.roomId];
        const activity = rState?.activity ?? "idle";
        const agentCount = agentsByRoom[room.roomId] ?? 0;
        const visual   = ROLE_VISUALS[room.roomType] ?? ROLE_VISUALS.office;

        const ceilingY = room.position.y + room.dimensions.y + CEILING_OFFSET;
        const cx = room.position.x + room.dimensions.x / 2;
        const cz = room.position.z + room.dimensions.z / 2;

        return (
          <group key={room.roomId}>
            {/* Low-poly ceiling fill tile + outline */}
            <RoomCeilingTile room={room} />

            {/* HTML ceiling label card */}
            <RoomCeilingLabel
              room={room}
              agentCount={agentCount}
              activity={activity}
            />

            {/* Activity pulse ring for active / busy rooms */}
            {(activity === "active" || activity === "busy") && (
              <ActivityPulseRing
                cx={cx}
                cy={ceilingY}
                cz={cz}
                color={visual.color}
                fast={activity === "busy"}
              />
            )}
          </group>
        );
      })}

      {/* Building compass — NW corner of building, top-left in bird's-eye image */}
      <BuildingCompass />
    </group>
  );
}
