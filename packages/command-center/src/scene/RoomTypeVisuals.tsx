/**
 * RoomTypeVisuals — Role-based visual differentiation for rooms.
 *
 * Each room type gets a distinct 3D marker geometry placed on the room:
 *   - control: Octahedron (command crystal) — pulsing orange
 *   - office:  Box (desk block) — steady green
 *   - lab:     Icosahedron (research sphere) — rotating purple
 *   - lobby:   Torus (welcome ring) — glowing blue
 *   - archive: Cylinder (data silo) — dim grey-blue
 *   - corridor: Cone (waypoint) — muted grey
 *
 * Also provides a diegetic "room role badge" — a small floating
 * placard with the room type icon symbol rendered in 3D space.
 *
 * Sub-AC 2 (AC 12): The ROLE_VISUALS constants are now backed by the
 * `room-type-properties-store` Zustand store so this component re-renders
 * automatically when room type visual properties are mutated at runtime.
 * `useAllRoomTypeProperties()` provides a reactive map; the static
 * ROLE_VISUALS constant is kept as a named export for backward compatibility
 * with components that need a static reference (e.g. RoomVolume.tsx VOLUME_STYLES).
 */
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { RoomDef, RoomType } from "../data/building.js";
import { useSpatialStore } from "../store/spatial-store.js";
import {
  useAllRoomTypeProperties,
  DEFAULT_ROOM_TYPE_PROPERTIES,
} from "../store/room-type-properties-store.js";

// ── Role Visual Config ──────────────────────────────────────────────

interface RoleVisualConfig {
  /** Primary color for the marker */
  color: string;
  /** Emissive glow color */
  emissive: string;
  /** Emissive intensity */
  emissiveIntensity: number;
  /** Unicode icon character for the badge */
  icon: string;
  /** Label for the badge */
  label: string;
  /** Animation type */
  animation: "pulse" | "rotate" | "bob" | "none";
  /** Scale of the marker */
  scale: number;
}

const ROLE_VISUALS: Record<RoomType, RoleVisualConfig> = {
  control: {
    color: "#FF7043",
    emissive: "#FF4500",
    emissiveIntensity: 0.6,
    icon: "⬡",
    label: "CTRL",
    animation: "pulse",
    scale: 0.28,
  },
  office: {
    color: "#66BB6A",
    emissive: "#33AA33",
    emissiveIntensity: 0.3,
    icon: "▣",
    label: "OFFC",
    animation: "bob",
    scale: 0.22,
  },
  lab: {
    color: "#AB47BC",
    emissive: "#9933CC",
    emissiveIntensity: 0.5,
    icon: "◎",
    label: "LAB",
    animation: "rotate",
    scale: 0.25,
  },
  lobby: {
    color: "#4FC3F7",
    emissive: "#0099FF",
    emissiveIntensity: 0.4,
    icon: "◯",
    label: "MAIN",
    animation: "pulse",
    scale: 0.3,
  },
  archive: {
    color: "#78909C",
    emissive: "#506878",
    emissiveIntensity: 0.2,
    icon: "▥",
    label: "ARCH",
    animation: "none",
    scale: 0.2,
  },
  corridor: {
    color: "#546E7A",
    emissive: "#3D5060",
    emissiveIntensity: 0.15,
    icon: "△",
    label: "PATH",
    animation: "none",
    scale: 0.15,
  },
};

// ── Marker Material ─────────────────────────────────────────────────

function useMarkerMaterial(config: RoleVisualConfig) {
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: config.color,
        emissive: config.emissive,
        emissiveIntensity: config.emissiveIntensity,
        roughness: 0.4,
        metalness: 0.6,
        flatShading: true,
        transparent: true,
        opacity: 0.85,
      }),
    [config.color, config.emissive, config.emissiveIntensity],
  );
}

// ── Marker Geometry per Room Type ───────────────────────────────────

function ControlMarker({ config }: { config: RoleVisualConfig }) {
  const mat = useMarkerMaterial(config);
  return (
    <mesh material={mat} castShadow>
      <octahedronGeometry args={[config.scale, 0]} />
    </mesh>
  );
}

function OfficeMarker({ config }: { config: RoleVisualConfig }) {
  const mat = useMarkerMaterial(config);
  return (
    <mesh material={mat} castShadow>
      <boxGeometry args={[config.scale * 1.4, config.scale * 0.8, config.scale * 1.4]} />
    </mesh>
  );
}

function LabMarker({ config }: { config: RoleVisualConfig }) {
  const mat = useMarkerMaterial(config);
  return (
    <mesh material={mat} castShadow>
      <icosahedronGeometry args={[config.scale, 1]} />
    </mesh>
  );
}

function LobbyMarker({ config }: { config: RoleVisualConfig }) {
  const mat = useMarkerMaterial(config);
  return (
    <mesh material={mat} castShadow>
      <torusGeometry args={[config.scale, config.scale * 0.25, 6, 8]} />
    </mesh>
  );
}

function ArchiveMarker({ config }: { config: RoleVisualConfig }) {
  const mat = useMarkerMaterial(config);
  return (
    <mesh material={mat} castShadow>
      <cylinderGeometry args={[config.scale * 0.6, config.scale * 0.8, config.scale * 1.2, 6]} />
    </mesh>
  );
}

function CorridorMarker({ config }: { config: RoleVisualConfig }) {
  const mat = useMarkerMaterial(config);
  return (
    <mesh material={mat} castShadow>
      <coneGeometry args={[config.scale * 0.6, config.scale * 1.2, 4]} />
    </mesh>
  );
}

const MARKER_COMPONENTS: Record<RoomType, React.FC<{ config: RoleVisualConfig }>> = {
  control: ControlMarker,
  office: OfficeMarker,
  lab: LabMarker,
  lobby: LobbyMarker,
  archive: ArchiveMarker,
  corridor: CorridorMarker,
};

// ── Animated Marker Wrapper ─────────────────────────────────────────

function AnimatedMarker({
  config,
  roomType,
}: {
  config: RoleVisualConfig;
  roomType: RoomType;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const MarkerComponent = MARKER_COMPONENTS[roomType];

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    switch (config.animation) {
      case "pulse": {
        const s = 1 + Math.sin(t * 1.5) * 0.12;
        groupRef.current.scale.set(s, s, s);
        break;
      }
      case "rotate": {
        groupRef.current.rotation.y = t * 0.8;
        groupRef.current.rotation.x = Math.sin(t * 0.4) * 0.2;
        break;
      }
      case "bob": {
        groupRef.current.position.y = Math.sin(t * 1.2) * 0.06;
        break;
      }
      case "none":
      default:
        break;
    }
  });

  return (
    <group ref={groupRef}>
      <MarkerComponent config={config} />
    </group>
  );
}

// ── Role Badge — diegetic floating label ────────────────────────────

/**
 * Role badge floating above the marker position.
 * Shows icon + label abbreviation + full type name for unambiguous identification.
 * Always visible (no hover required) with strong contrast.
 */
function RoleBadge({ config, accentColor }: { config: RoleVisualConfig; accentColor: string }) {
  return (
    <Html
      center
      distanceFactor={14}
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1px",
        }}
      >
        {/* Primary badge: icon + label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background: `rgba(8, 8, 18, 0.82)`,
            border: `1px solid ${accentColor}77`,
            borderRadius: "4px",
            padding: "3px 7px",
            backdropFilter: "blur(6px)",
            boxShadow: `0 0 8px ${accentColor}22`,
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: accentColor,
              lineHeight: 1,
              filter: `drop-shadow(0 0 3px ${accentColor}88)`,
            }}
          >
            {config.icon}
          </span>
          <span
            style={{
              fontSize: "8px",
              fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
              color: accentColor,
              letterSpacing: "0.12em",
              fontWeight: 700,
            }}
          >
            {config.label}
          </span>
        </div>
      </div>
    </Html>
  );
}

// ── Wireframe Base Ring ─────────────────────────────────────────────

function MarkerBaseRing({ config }: { config: RoleVisualConfig }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[config.scale * 0.8, config.scale * 1.1, 8]} />
      <meshBasicMaterial
        color={config.color}
        transparent
        opacity={0.25}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Floor Decal — role type symbol on the floor surface ──────────────

/**
 * Floor-level type decal — a role-specific shape on the floor that
 * identifies the room type even when looking straight down.
 * Uses a flat mesh slightly above floor level (y + 0.04).
 */
function FloorDecal({
  config,
  roomType,
  roomW,
  roomD,
}: {
  config: RoleVisualConfig;
  roomType: RoomDef["roomType"];
  roomW: number;
  roomD: number;
}) {
  const size = Math.min(roomW, roomD) * 0.38;
  const opacity = 0.18;

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
      }),
    [config.color],
  );

  // Choose flat geometry per room type to match the marker above
  switch (roomType) {
    case "control":
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
          <circleGeometry args={[size * 0.5, 6]} />
        </mesh>
      );
    case "office":
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
          <planeGeometry args={[size * 0.8, size * 0.8]} />
        </mesh>
      );
    case "lab":
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
          <circleGeometry args={[size * 0.5, 5]} />
        </mesh>
      );
    case "lobby":
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
          <ringGeometry args={[size * 0.25, size * 0.5, 8]} />
        </mesh>
      );
    case "archive":
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
          <circleGeometry args={[size * 0.4, 6]} />
        </mesh>
      );
    case "corridor":
    default:
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
          <circleGeometry args={[size * 0.3, 4]} />
        </mesh>
      );
  }
}

// ── Public Component: RoomTypeMarker ────────────────────────────────

/**
 * Renders a role-based 3D marker above a room.
 * Distinct geometry + color + animation per room type.
 * Includes a diegetic role badge, base ring, and floor decal.
 *
 * Visual layers (bottom to top):
 *  1. Floor decal — flat shape on floor for bird's-eye ID
 *  2. Base ring — wireframe ring at ceiling level
 *  3. Animated 3D marker — distinctive geometry floating above room
 *  4. Role badge — HTML label with icon + type abbreviation
 *
 * Sub-AC 2 (AC 12): Reads room type visual properties from the reactive
 * `room-type-properties-store` so this marker re-renders automatically
 * when properties change at runtime (e.g. via a command-file action).
 */
export function RoomTypeMarker({ room }: { room: RoomDef }) {
  const { x: w, y: h, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;

  // Sub-AC 2: Consume the reactive store — re-renders when room type
  // properties change. Falls back to DEFAULT_ROOM_TYPE_PROPERTIES shape.
  const allProps = useAllRoomTypeProperties();
  const storeProps = allProps[room.roomType as RoomType];

  // Map store properties to the local RoleVisualConfig shape
  // (store uses markerScale; legacy code used scale)
  const config: RoleVisualConfig = storeProps
    ? {
        color:              storeProps.color,
        emissive:           storeProps.emissive,
        emissiveIntensity:  storeProps.emissiveIntensity,
        icon:               storeProps.icon,
        label:              storeProps.label,
        animation:          storeProps.animation,
        scale:              storeProps.markerScale,
      }
    : ROLE_VISUALS[room.roomType];

  if (!config) return null;

  // Position marker at top-center of the room
  const markerY = py + h + 0.15;
  const centerX = px + w / 2;
  const centerZ = pz + d / 2;

  return (
    <>
      {/* Floor decal — flat type shape visible from above */}
      <group position={[centerX, py + 0.04, centerZ]}>
        <FloorDecal
          config={config}
          roomType={room.roomType}
          roomW={w}
          roomD={d}
        />
      </group>

      {/* Ceiling-level group: ring + floating marker + badge */}
      <group position={[centerX, markerY, centerZ]}>
        {/* Animated 3D marker — distinct geometry per role */}
        <group position={[0, 0.25, 0]}>
          <AnimatedMarker config={config} roomType={room.roomType} />
        </group>

        {/* Base ring on the ceiling */}
        <MarkerBaseRing config={config} />

        {/* Diegetic role badge */}
        <group position={[0, 0.65, 0]}>
          <RoleBadge config={config} accentColor={room.colorAccent} />
        </group>
      </group>
    </>
  );
}

/** Convenience: Get role visual config from the static fallback (backward compat) */
export function getRoleVisualConfig(roomType: RoomType): RoleVisualConfig | undefined {
  return ROLE_VISUALS[roomType];
}

/**
 * Derive a RoleVisualConfig from the store's RoomTypeVisualProperties.
 * Use this inside React components to get a reactive config that updates
 * when the store changes.
 *
 * @param storeProps - Properties from useAllRoomTypeProperties()[roomType]
 */
export function mapStorePropsToRoleVisualConfig(
  storeProps: import("../store/room-type-properties-store.js").RoomTypeVisualProperties,
): RoleVisualConfig {
  return {
    color:             storeProps.color,
    emissive:          storeProps.emissive,
    emissiveIntensity: storeProps.emissiveIntensity,
    icon:              storeProps.icon,
    label:             storeProps.label,
    animation:         storeProps.animation,
    scale:             storeProps.markerScale,
  };
}

/** All role visual configs — static constant kept for backward compatibility */
export { ROLE_VISUALS };

/**
 * Derive the DEFAULT_ROOM_TYPE_PROPERTIES constant from the store module.
 * Re-exported here so consumers can import from the scene layer without
 * needing a direct dependency on the store module.
 */
export { DEFAULT_ROOM_TYPE_PROPERTIES } from "../store/room-type-properties-store.js";

// ── RoomTypeLegend — diegetic 3D role-color legend ───────────────────────────

/**
 * RoomTypeLegend — Diegetic 3D panel listing all room types with their
 * accent colors, icons, and role abbreviations.
 *
 * Positioned floating on the west exterior wall of the building so it is
 * always visible as the user orbits the scene.  Reading it requires no
 * hover or interaction — all six room types are visible at a glance.
 *
 * Sub-AC 3: Provides proof that rooms are color-coded by role and that
 * the color mapping is derived from the dynamic building data (YAML-loaded
 * or static fallback).  The header shows the current data source and room
 * count so users can verify dynamic loading has occurred.
 *
 * Visual layers (front to back):
 *   1. Outer box — dark panel background
 *   2. Accent left-edge strip — electric blue (#4a6aff)
 *   3. Html overlay — type rows (icon + swatch + name)
 *   4. Bottom provenance line — YAML/STATIC + room count
 *
 * @param position - World-space position.  Default: west of building at mid-height.
 */
export function RoomTypeLegend({
  position = [-2.8, 1.2, 3] as [number, number, number],
}: {
  position?: [number, number, number];
}) {
  const dataSource = useSpatialStore((s) => s.dataSource);
  const roomCount  = useSpatialStore((s) => s.building.rooms.length);

  // Sub-AC 2: Consume the reactive store so the legend re-renders when
  // room type properties change (e.g. color override via command-file).
  const allProps = useAllRoomTypeProperties();

  // Build ordered list of all room types from the reactive store.
  // Mapped to RoleVisualConfig shape for use with existing rendering code.
  const entries = useMemo(
    (): [RoomType, RoleVisualConfig][] =>
      (Object.entries(allProps) as [RoomType, typeof allProps[RoomType]][]).map(
        ([type, p]) => [
          type,
          {
            color:             p.color,
            emissive:          p.emissive,
            emissiveIntensity: p.emissiveIntensity,
            icon:              p.icon,
            label:             p.label,
            animation:         p.animation,
            scale:             p.markerScale,
          },
        ],
      ),
    [allProps],
  );

  const panelH = entries.length * 0.28 + 0.55; // dynamic height based on row count

  return (
    <group position={position} name="room-type-legend">
      {/* Panel background — low-opacity dark box */}
      <mesh>
        <boxGeometry args={[1.55, panelH, 0.04]} />
        <meshBasicMaterial color="#080812" transparent opacity={0.88} />
      </mesh>

      {/* Left accent strip — electric blue brand color */}
      <mesh position={[-0.755, 0, 0.025]}>
        <boxGeometry args={[0.04, panelH - 0.05, 0.01]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={0.65} />
      </mesh>

      {/* Top accent line */}
      <mesh position={[0, panelH / 2 - 0.02, 0.025]}>
        <boxGeometry args={[1.55, 0.02, 0.01]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={0.35} />
      </mesh>

      {/* HTML legend rows — rendered in 3D world space via Drei Html */}
      <Html
        center
        distanceFactor={11}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            padding: "6px 9px",
            gap: "3px",
            minWidth: "110px",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              fontSize: "6px",
              fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
              color: "#5566bb",
              letterSpacing: "0.14em",
              textTransform: "uppercase" as const,
              paddingBottom: "3px",
              marginBottom: "1px",
              borderBottom: "1px solid #2a2a44",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>ROOM TYPES</span>
            <span
              style={{
                color: dataSource === "yaml" ? "#00cc66" : "#5566aa",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              {dataSource === "yaml" ? "YAML" : "STATIC"} {roomCount}R
            </span>
          </div>

          {/* ── One row per room type ── */}
          {entries.map(([type, config]) => (
            <div
              key={type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "1px 0",
              }}
            >
              {/* Role icon */}
              <span
                style={{
                  fontSize: "10px",
                  color: config.color,
                  lineHeight: 1,
                  width: "12px",
                  textAlign: "center",
                  filter: `drop-shadow(0 0 2px ${config.emissive}66)`,
                }}
              >
                {config.icon}
              </span>

              {/* Color swatch */}
              <div
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "1px",
                  backgroundColor: config.color,
                  border: `1px solid ${config.emissive}88`,
                  flexShrink: 0,
                  boxShadow: `0 0 4px ${config.emissive}55`,
                }}
              />

              {/* Type name + label abbreviation */}
              <span
                style={{
                  fontSize: "7px",
                  fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                  color: config.color,
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  textTransform: "uppercase" as const,
                  opacity: 0.9,
                }}
              >
                {type}
              </span>

              {/* Label abbreviation dimmed */}
              <span
                style={{
                  fontSize: "6px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: config.color,
                  opacity: 0.45,
                  marginLeft: "auto",
                }}
              >
                {config.label}
              </span>
            </div>
          ))}

          {/* ── Provenance footer ── */}
          <div
            style={{
              fontSize: "5px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "#333355",
              marginTop: "2px",
              paddingTop: "2px",
              borderTop: "1px solid #1e1e30",
              letterSpacing: "0.07em",
              textAlign: "center",
            }}
          >
            .agent/rooms/ · sub-ac 3
          </div>
        </div>
      </Html>
    </group>
  );
}
