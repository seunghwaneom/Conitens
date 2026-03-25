/**
 * RoomVolume — Role-labeled 3D room volumes from the room registry.
 *
 * Sub-AC 3: Instantiates 3D room volumes inside the building using
 * ROOM_REGISTRY as the canonical data source.
 *
 * Sub-AC 4b: Click, hover, and context-menu events are handled via the
 * `useRoomInteraction` hook, which emits typed `RoomInteractionIntent`
 * values, stops propagation to the Building layer, and records each
 * interaction to the append-only SceneEventLog.
 *
 * Each room type receives a distinct low-poly styled volume:
 *
 *   control  — orange semi-transparent box  (command-center motif)
 *   office   — green  semi-transparent box  (workspace motif)
 *   lab      — purple semi-transparent box  (research motif)
 *   lobby    — blue   semi-transparent box  (entrance motif)
 *   archive  — grey   semi-transparent box  (storage motif)
 *   corridor — slate  outline-only  box     (passage motif)
 *
 * Each volume is composed of four visual layers (bottom → top):
 *   1. Floor stripe   — flat coloured role indicator at floor level
 *   2. Volume box     — semi-transparent flatShaded MeshStandardMaterial
 *   3. Edges overlay  — low-poly wireframe via Drei <Edges>
 *   4. Role badge     — floating HTML nameplate (type · name · agents)
 *
 * Interactivity (Sub-AC 4b):
 *   - Hover        → highlight via useRoomInteraction + ROOM_HOVERED intent
 *   - Unhover      → unhighlight via useRoomInteraction + ROOM_UNHOVERED intent
 *   - Click        → drill-down via useRoomInteraction + ROOM_CLICKED intent
 *   - Right-click  → context menu via useRoomInteraction + ROOM_CONTEXT_MENU intent
 *   All handlers call stopPropagation() before any other work.
 *
 * Data source: ROOM_REGISTRY (room-registry.ts) re-built from the
 * current spatial-store building so it reacts to YAML hot-reloads.
 */

import { useState, useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { RoomType } from "../data/building.js";
import type { RoomMetadataEntry } from "../data/room-registry.js";
import { buildRoomRegistry } from "../data/room-registry.js";
import { ROLE_VISUALS } from "./RoomTypeVisuals.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useRoomInteraction } from "../hooks/use-room-interaction.js";
import type { RoomTypeKind } from "./room-interaction-intents.js";

// ── Volume styles — distinct low-poly material config per role type ─────

interface VolumeStyle {
  /** Primary fill colour for the volume box */
  fillColor: string;
  /** Wireframe / edge colour */
  edgeColor: string;
  /** Semi-transparent fill opacity (normal state) */
  fillOpacity: number;
  /** Edge opacity (normal state) */
  edgeOpacity: number;
  /** Emissive glow colour */
  emissive: string;
  /** Emissive intensity (normal state) */
  emissiveIntensity: number;
  /** Floor-stripe colour (flat plane at room floor level) */
  stripeColor: string;
  /**
   * Edge thickness: thicker border = stronger type signal.
   * Using 1.0 as base; control/lab get 1.4 for emphasis.
   */
  edgeThresholdAngle: number;
}

/**
 * VOLUME_STYLES — canonical per-role-type styling table.
 *
 * Colors mirror ROLE_VISUALS from RoomTypeVisuals.tsx so every visual
 * representation of a room type is consistent across the scene.
 */
export const VOLUME_STYLES: Record<RoomType, VolumeStyle> = {
  control: {
    fillColor: "#FF7043",
    edgeColor: "#FF9966",
    fillOpacity: 0.13,
    edgeOpacity: 0.65,
    emissive: "#FF4500",
    emissiveIntensity: 0.07,
    stripeColor: "#FF7043",
    edgeThresholdAngle: 15,
  },
  office: {
    fillColor: "#66BB6A",
    edgeColor: "#88DD88",
    fillOpacity: 0.09,
    edgeOpacity: 0.50,
    emissive: "#33AA33",
    emissiveIntensity: 0.04,
    stripeColor: "#66BB6A",
    edgeThresholdAngle: 15,
  },
  lab: {
    fillColor: "#AB47BC",
    edgeColor: "#CC66DD",
    fillOpacity: 0.11,
    edgeOpacity: 0.58,
    emissive: "#9933CC",
    emissiveIntensity: 0.06,
    stripeColor: "#AB47BC",
    edgeThresholdAngle: 15,
  },
  lobby: {
    fillColor: "#4FC3F7",
    edgeColor: "#7DD8FF",
    fillOpacity: 0.11,
    edgeOpacity: 0.55,
    emissive: "#0099FF",
    emissiveIntensity: 0.05,
    stripeColor: "#4FC3F7",
    edgeThresholdAngle: 15,
  },
  archive: {
    fillColor: "#78909C",
    edgeColor: "#90A8B4",
    fillOpacity: 0.07,
    edgeOpacity: 0.40,
    emissive: "#506878",
    emissiveIntensity: 0.03,
    stripeColor: "#78909C",
    edgeThresholdAngle: 15,
  },
  corridor: {
    fillColor: "#546E7A",
    edgeColor: "#7090A0",
    fillOpacity: 0.04,
    edgeOpacity: 0.28,
    emissive: "#3D5060",
    emissiveIntensity: 0.02,
    stripeColor: "#546E7A",
    edgeThresholdAngle: 15,
  },
};

// ── RoomRoleBadge — diegetic floating role nameplate ────────────────────

/**
 * Floating HTML nameplate anchored above the room volume.
 *
 * Displays three information tiers:
 *   Primary row:  role icon · role type · floor index
 *   Secondary:    room display name
 *   Tertiary:     resident agent names (omitted for corridor/archive)
 *
 * Always visible (no hover required).  Brightens on hover for feedback.
 * distanceFactor=12 keeps the badge world-scale consistent with the
 * other badges in the scene (RoomTypeVisuals, AgentAvatar).
 */
function RoomRoleBadge({
  entry,
  hovered,
}: {
  entry: RoomMetadataEntry;
  hovered: boolean;
}) {
  const roleVisual = ROLE_VISUALS[entry.roomType];
  const accentColor = roleVisual?.color ?? entry.colorAccent;

  return (
    <Html
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
          transition: "opacity 0.2s ease",
          opacity: hovered ? 1 : 0.75,
        }}
      >
        {/* ── Primary row: icon · type label · floor ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background: hovered
              ? "rgba(8, 8, 18, 0.92)"
              : "rgba(8, 8, 18, 0.78)",
            border: `1px solid ${accentColor}${hovered ? "99" : "44"}`,
            borderRadius: "4px",
            padding: "2px 7px",
            backdropFilter: "blur(6px)",
            boxShadow: hovered ? `0 0 8px ${accentColor}33` : "none",
            transition: "all 0.2s ease",
          }}
        >
          {roleVisual && (
            <span
              style={{
                fontSize: "11px",
                color: accentColor,
                lineHeight: 1,
                filter: hovered
                  ? `drop-shadow(0 0 3px ${accentColor}99)`
                  : "none",
              }}
            >
              {roleVisual.icon}
            </span>
          )}
          <span
            style={{
              fontSize: "8px",
              fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
              color: accentColor,
              letterSpacing: "0.1em",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              whiteSpace: "nowrap",
            }}
          >
            {entry.roomType}
          </span>
          <span
            style={{
              fontSize: "6px",
              fontFamily: "'JetBrains Mono', monospace",
              color: "#7777aa",
              marginLeft: "2px",
              whiteSpace: "nowrap",
            }}
          >
            F{entry.floor}
          </span>
        </div>

        {/* ── Room display name ── */}
        <div
          style={{
            fontSize: hovered ? "9px" : "8px",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: hovered ? accentColor : "#888899",
            letterSpacing: "0.06em",
            whiteSpace: "nowrap",
            textShadow: hovered ? `0 0 6px ${accentColor}55` : "none",
            transition: "all 0.2s ease",
          }}
        >
          {entry.name}
        </div>

        {/* ── Resident agents (omit for utility rooms) ── */}
        {entry.residentAgents.length > 0 && (
          <div
            style={{
              fontSize: "6px",
              fontFamily: "'JetBrains Mono', monospace",
              color: hovered ? "#aaaacc" : "#555566",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            {entry.residentAgents.map((a) => a.name).join(" · ")}
          </div>
        )}
      </div>
    </Html>
  );
}

// ── RoomFloorStripe — flat role indicator at room floor level ────────────

/**
 * Thin flat plane at floor level (y + 0.03) with the room's role colour.
 * Remains visible even when walls/volumes are occluded, providing a
 * floor-level type signal for overhead/bird's-eye camera views.
 *
 * Styled as 90% of the room's footprint to respect wall edges.
 */
function RoomFloorStripe({
  entry,
  vs,
  hovered,
}: {
  entry: RoomMetadataEntry;
  vs: VolumeStyle;
  hovered: boolean;
}) {
  const { position: pos, dimensions: dim } = entry.positionHint;
  const cx = pos.x + dim.x / 2;
  const cz = pos.z + dim.z / 2;
  const y  = pos.y + 0.03;

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: vs.stripeColor,
        transparent: true,
        opacity: hovered ? 0.22 : 0.10,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // Opacity must react to hover — recreate on change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vs.stripeColor, hovered],
  );

  return (
    <mesh
      position={[cx, y, cz]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={mat}
      renderOrder={-2}
    >
      <planeGeometry args={[dim.x - 0.18, dim.z - 0.18]} />
    </mesh>
  );
}

// ── RoomVolume — single registry-driven room volume ─────────────────────

/**
 * Renders a single room from ROOM_REGISTRY as a stylized 3D volume.
 *
 * Visual composition:
 *   1. Floor stripe  — flat fill at floor level (role colour, 10% opacity)
 *   2. Volume box    — flatShaded semi-transparent box (role-specific fill)
 *   3. Edge lines    — low-poly wireframe via THREE.EdgesGeometry + LineSegments
 *   4. Role badge    — floating HTML nameplate above the room
 *
 * The box uses flatShading:true to produce the low-poly faceted look
 * consistent with the command-center dark aesthetic.
 *
 * depthWrite:false on the box prevents transparent sorting artefacts
 * when the camera orbits inside the building volume.
 *
 * Edge lines are built from THREE.EdgesGeometry (not drei <Edges>) so we
 * have full control over LineBasicMaterial opacity — reliable across WebGL
 * implementations without needing LineMaterial from three-stdlib.
 */
export function RoomVolume({ entry }: { entry: RoomMetadataEntry }) {
  const [hovered, setHovered] = useState(false);

  const selectedRoomId = useSpatialStore((s) => s.selectedRoomId);
  const isSelected     = selectedRoomId === entry.roomId;

  // ── Sub-AC 4b: typed intent handlers via useRoomInteraction ─────────────
  //
  // The hook encapsulates stopPropagation(), intent emission, SceneEventLog
  // recording, and store mutations.  Raw handlers from this hook are spread
  // directly onto the <group> element below — no inline handler code needed.
  const { handlers } = useRoomInteraction({
    roomId:     entry.roomId,
    roomType:   entry.roomType as RoomTypeKind,
    floor:      entry.floor,
    agentCount: entry.residentAgents.length,
  });

  // Sync local hover state with pointer-over/out for visual feedback.
  // We wrap the hook handlers to also update the local `hovered` state
  // used by material / badge animation — this is pure rendering state,
  // not part of the intent system.
  const wrappedHandlers = {
    onPointerOver: (e: Parameters<typeof handlers.onPointerOver>[0]) => {
      setHovered(true);
      handlers.onPointerOver(e);
    },
    onPointerOut: (e: Parameters<typeof handlers.onPointerOut>[0]) => {
      setHovered(false);
      handlers.onPointerOut(e);
    },
    onClick:       handlers.onClick,
    onContextMenu: handlers.onContextMenu,
  };

  const vs = VOLUME_STYLES[entry.roomType];

  const { position: pos, dimensions: dim } = entry.positionHint;
  const w  = dim.x;
  const h  = dim.y;
  const d  = dim.z;
  const cx = pos.x + w / 2;
  const cy = pos.y + h / 2;
  const cz = pos.z + d / 2;

  // Label positioned above the volume (ceiling + margin)
  const labelY = pos.y + h + 0.32;

  // Volume box dimensions (slightly inset from positionHint bounds)
  const bw = w - 0.06;
  const bh = h - 0.04;
  const bd = d - 0.06;

  // Box material — role-specific fill + emissive glow
  const volumeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: vs.fillColor,
        emissive: vs.emissive,
        emissiveIntensity:
          vs.emissiveIntensity + (hovered ? 0.09 : 0) + (isSelected ? 0.06 : 0),
        transparent: true,
        opacity:
          vs.fillOpacity + (hovered ? 0.07 : 0) + (isSelected ? 0.07 : 0),
        flatShading: true,
        roughness: 0.7,
        metalness: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // Recreate when style, hover, or selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vs.fillColor, vs.emissive, vs.emissiveIntensity, vs.fillOpacity, hovered, isSelected],
  );

  // Edge wireframe geometry — THREE.EdgesGeometry of the box
  const edgesGeo = useMemo(() => {
    const boxGeo = new THREE.BoxGeometry(bw, bh, bd);
    return new THREE.EdgesGeometry(boxGeo, vs.edgeThresholdAngle);
  }, [bw, bh, bd, vs.edgeThresholdAngle]);

  // Edge line material — role colour, opacity varies with hover/select
  const edgeMat = useMemo(() => {
    const rawColor = isSelected ? "#ffffff" : vs.edgeColor;
    const opacity  = isSelected
      ? 0.90
      : vs.edgeOpacity + (hovered ? 0.22 : 0);
    return new THREE.LineBasicMaterial({
      color: rawColor,
      transparent: true,
      opacity,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vs.edgeColor, vs.edgeOpacity, hovered, isSelected]);

  return (
    <group
      name={`room-volume-${entry.roomId}`}
      onPointerOver={wrappedHandlers.onPointerOver}
      onPointerOut={wrappedHandlers.onPointerOut}
      onClick={wrappedHandlers.onClick}
      onContextMenu={wrappedHandlers.onContextMenu}
    >
      {/* 1. Floor stripe — flat role indicator at floor level */}
      <RoomFloorStripe entry={entry} vs={vs} hovered={hovered} />

      {/* 2. Volume box — semi-transparent flatShaded role-coloured box */}
      <mesh
        position={[cx, cy, cz]}
        material={volumeMat}
        renderOrder={-1}
      >
        <boxGeometry args={[bw, bh, bd]} />
      </mesh>

      {/* 3. Low-poly edge overlay — THREE.EdgesGeometry + LineBasicMaterial */}
      <lineSegments
        position={[cx, cy, cz]}
        geometry={edgesGeo}
        material={edgeMat}
        renderOrder={0}
      />

      {/* 4. Role badge — floating nameplate above the volume */}
      <group position={[cx, labelY, cz]}>
        <RoomRoleBadge entry={entry} hovered={hovered} />
      </group>
    </group>
  );
}

// ── RoomsFromRegistry — instantiates all rooms from ROOM_REGISTRY ───────

/**
 * Registry-driven room volume layer.
 *
 * Reads the room registry (re-built from the current spatial-store building
 * so it reacts to YAML hot-reloads) and renders a `RoomVolume` for each entry.
 *
 * Rooms are organised into per-floor <group> nodes:
 *   - Enables per-floor visibility toggling (respects floorVisibility store)
 *   - Provides named nodes for LOD / frustum culling in the scene graph
 *
 * The stairwell is included on both floor 0 and floor 1 (it spans both).
 *
 * This component is the canonical Sub-AC 3 entry point — it is added to
 * CommandCenterScene as a dedicated "room-volumes-layer" group.
 */
export function RoomsFromRegistry() {
  const building         = useSpatialStore((s) => s.building);
  const floorVisibility  = useSpatialStore((s) => s.floorVisibility);

  // Re-build registry whenever the building data changes (YAML loads → update)
  const registry = useMemo(() => buildRoomRegistry(building), [building]);

  // Group registry entries by floor (stairwell appears on both 0 and 1)
  const roomsByFloor = useMemo<Record<number, RoomMetadataEntry[]>>(() => {
    const byFloor: Record<number, RoomMetadataEntry[]> = {};
    for (const entry of Object.values(registry)) {
      const targetFloors =
        entry.roomId === "stairwell" ? [0, 1] : [entry.floor];
      for (const f of targetFloors) {
        if (!byFloor[f]) byFloor[f] = [];
        // Dedup — stairwell can appear twice if added from both iterations
        if (!byFloor[f].some((e) => e.roomId === entry.roomId)) {
          byFloor[f].push(entry);
        }
      }
    }
    return byFloor;
  }, [registry]);

  return (
    <group name="room-volumes-registry">
      {Object.entries(roomsByFloor).map(([floorStr, entries]) => {
        const floor   = parseInt(floorStr, 10);
        const visible = floorVisibility[floor] ?? true;

        if (!visible) return null;

        return (
          <group
            key={floor}
            name={`room-volumes-floor-${floor}`}
          >
            {entries.map((entry) => (
              <RoomVolume
                key={`${entry.roomId}-f${floor}`}
                entry={entry}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}
