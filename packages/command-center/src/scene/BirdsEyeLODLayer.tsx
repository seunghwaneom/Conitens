/**
 * BirdsEyeLODLayer.tsx — Hierarchical level-of-detail visuals for bird's-eye altitude.
 *
 * Sub-AC 3b: Renders four distinct spatial hierarchy levels visible and
 * distinguishable when the camera is at bird's-eye altitude, with ZOOM-DRIVEN
 * progressive reveal:
 *
 *   FAR zoom  (14–25): Building footprint prominent + building name label
 *   MID zoom  ( 7–14): Floor zones + room cells + room name labels
 *   NEAR zoom ( 3– 7): Agent hexagonal markers + agent name labels
 *
 *   Level 1 — Building footprint outline  (bright perimeter ring at ground level)
 *   Level 2 — Office zone fills           (per-floor tinted horizontal planes)
 *   Level 3 — Room cell outlines + fills  (role-colored room boundaries at floor level)
 *   Level 4 — Agent markers               (role-colored hexagonal discs per agent)
 *
 * ── Zoom-driven LOD ───────────────────────────────────────────────────────────
 *
 * Each level's opacity is modulated by the bird's-eye zoom value from the
 * spatial store (birdsEyeZoom).  The zoom-lod-policy module provides the
 * pure-function opacity multipliers and label visibility flags.
 *
 * At FAR zoom the building footprint is the scope anchor.  At MID zoom rooms
 * become the primary detail.  At NEAR zoom agents become prominent with
 * name labels appearing to identify individual avatars.
 *
 * ── Label strategy ────────────────────────────────────────────────────────────
 *
 * HTML labels (via @react-three/drei <Html />) are rendered at three levels:
 *   FAR:  Building name + floor count (positioned above the building centre)
 *   MID:  Room name labels (one per room at room centre, floor level)
 *   NEAR: Agent name + role labels (one per agent at agent position)
 *
 * BirdsEyeOverlay also renders ceiling-level labels; these floor-level labels
 * are complementary and designed to be legible at wider zoom-out levels.
 *
 * ── Design rationale ──────────────────────────────────────────────────────────
 *
 * The existing BirdsEyeOverlay renders ceiling-level annotations.  These are
 * readable for close inspection but are visually faint at maximum zoom-out.
 *
 * This layer complements BirdsEyeOverlay by rendering at FLOOR level with
 * higher opacity fills and bright outline geometry, making all four hierarchy
 * tiers legible at maximum bird's-eye altitude.
 *
 * ── Vertical layering (depth order) ──────────────────────────────────────────
 *
 *   renderOrder 1 — Building footprint outline  (bottom-most, widest scope)
 *   renderOrder 2 — Office zone fills           (per-floor tinted planes)
 *   renderOrder 3 — Room cell fills + outlines  (tighter scope, smaller area)
 *   renderOrder 4 — Agent markers               (topmost, point markers)
 *
 * ── Guard ─────────────────────────────────────────────────────────────────────
 *
 * Renders nothing unless cameraMode === "birdsEye".  All hooks are called
 * unconditionally (React rules); the guard only gates the JSX output.
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *
 *   useSpatialStore → cameraMode, building.floors, building.rooms, birdsEyeZoom
 *   useAgentStore   → agents (for Level 4 agent markers)
 *   zoom-lod-policy → opacity multipliers, label visibility flags
 *
 * All data is read from event-sourced stores; no local mutable state.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore, type AgentRuntimeState } from "../store/agent-store.js";
import type { RoomDef, FloorDef } from "../data/building.js";
import { BUILDING } from "../data/building.js";
import {
  computeHierarchyZoomOpacities,
  computeZoomLabelVisibility,
  computeBuildingLabelStyle,
  shouldRenderZoomTier,
  ZOOM_HIERARCHY_OPACITIES,
} from "./zoom-lod-policy.js";

// ── Layout constants ──────────────────────────────────────────────────────────

/** Grid units per floor — must match _building.yaml + RoomGeometry.tsx + BirdsEyeOverlay.tsx */
const FLOOR_HEIGHT = 3;

/** Building width (X) in grid units — must match BLDG_W in BuildingShell / SceneHierarchy */
const BLDG_W = 12;
/** Building depth (Z) in grid units */
const BLDG_D = 6;

// ── Level-1: Building footprint constants ─────────────────────────────────────

/**
 * Color of the building perimeter outline (Level 1).
 *
 * Bright blue-accent matches the command-center color language already
 * established by BuildingLODMid, FloorSelectionHighlight, and accent strips.
 */
export const BLDG_FOOTPRINT_COLOR = "#6a8aff";

/** Opacity of the building perimeter outline line — prominent but not blinding */
export const BLDG_FOOTPRINT_OPACITY = 0.82;

// ── Level-2: Office zone constants ───────────────────────────────────────────

/** Opacity of the per-floor zone fill planes (Level 2) */
export const ZONE_FILL_OPACITY = 0.12;

/**
 * Per-floor zone fill colors.
 *
 * Alternating cool-to-warm blue tints allow the two floors to be
 * distinguished instantly at bird's-eye altitude.  Extended palette
 * supports up to 4 floors; wraps with modulo for buildings with more.
 */
export const ZONE_FILL_COLORS: ReadonlyArray<string> = [
  "#1a2060",  // floor 0 — deep cobalt blue   (Ground / Entry)
  "#201840",  // floor 1 — deep purple-indigo  (Operations)
  "#162840",  // floor 2 — teal-slate          (hypothetical 3rd floor)
  "#201a50",  // floor 3 — violet-indigo       (hypothetical 4th floor)
] as const;

// ── Level-3: Room cell constants ──────────────────────────────────────────────

/**
 * Opacity of the room cell fill plane (Level 3).
 *
 * Intentionally higher than BirdsEyeOverlay's ceiling tile opacity (0.07)
 * to ensure rooms are clearly distinguishable at maximum zoom-out altitude.
 */
export const ROOM_CELL_FILL_OPACITY = 0.18;

/** Opacity of the room cell perimeter outline (Level 3) */
export const ROOM_CELL_OUTLINE_OPACITY = 0.62;

// ── Level-4: Agent marker constants ──────────────────────────────────────────

/** Base radius of the agent marker disc (Level 4) in world units */
export const AGENT_MARKER_BASE_RADIUS = 0.22;

/**
 * Multiplier applied to the base radius for active / busy agents.
 *
 * Enlarging active-agent markers makes them visually prominent at
 * maximum zoom-out, encoding "this agent is doing work" without
 * requiring the user to zoom in for the full avatar representation.
 */
export const AGENT_MARKER_ACTIVE_SCALE = 1.28;

/** Opacity for agent marker discs */
export const AGENT_MARKER_OPACITY = 0.75;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * computeZoneFillColor — Returns the office-zone fill color for a floor index.
 *
 * Pure function (no React, no Three.js, no store dependencies).
 * Exported for unit testing and external consumers.
 *
 * Wraps with modulo for buildings with more than ZONE_FILL_COLORS.length floors.
 *
 * @param floorIndex  0-based floor index
 * @returns           Hex color string from ZONE_FILL_COLORS
 */
export function computeZoneFillColor(floorIndex: number): string {
  const idx = ((floorIndex % ZONE_FILL_COLORS.length) + ZONE_FILL_COLORS.length)
    % ZONE_FILL_COLORS.length;
  return ZONE_FILL_COLORS[idx] ?? (ZONE_FILL_COLORS[0] as string);
}

/**
 * computeAgentMarkerRadius — Returns the disc radius for an agent marker.
 *
 * Active / busy agents get a larger marker (AGENT_MARKER_BASE_RADIUS ×
 * AGENT_MARKER_ACTIVE_SCALE) so they stand out from idle / inactive
 * agents at maximum zoom-out altitude.
 *
 * Pure function; exported for unit testing.
 *
 * @param status  Agent operational status string
 * @returns       World-unit radius for the marker disc
 */
export function computeAgentMarkerRadius(status: string): number {
  if (status === "active" || status === "busy") {
    return AGENT_MARKER_BASE_RADIUS * AGENT_MARKER_ACTIVE_SCALE;
  }
  return AGENT_MARKER_BASE_RADIUS;
}

// ── Shared geometry pool ──────────────────────────────────────────────────────
//
// Module-level singletons: created once on import, shared across all instances.
// CircleGeometry with 6 segments = hexagonal low-poly disc.

/** Shared geometry for idle / inactive agent markers (base radius). */
const SHARED_AGENT_MARKER_GEO_BASE = new THREE.CircleGeometry(
  AGENT_MARKER_BASE_RADIUS,
  6,
);

/** Shared geometry for active / busy agent markers (enlarged). */
const SHARED_AGENT_MARKER_GEO_ACTIVE = new THREE.CircleGeometry(
  AGENT_MARKER_BASE_RADIUS * AGENT_MARKER_ACTIVE_SCALE,
  6,
);

// ── Level-1: BuildingFootprintOutline ─────────────────────────────────────────

/**
 * BuildingFootprintOutline — Level-1 hierarchy visual.
 *
 * Renders the building's ground-level footprint as a bright perimeter line
 * rectangle with an optional building-name label.
 *
 * At FAR zoom this is the outermost scope boundary with a prominent label.
 * At MID zoom the label is shown in a subdued style; at NEAR it is hidden.
 *
 * Geometry: 8 points (4 edges × 2 endpoints) using LineSegments so the
 * buffer layout matches the R3F intrinsic element (avoids SVG <line> conflict).
 *
 * Y = 0.03 (just above ground plane, avoids z-fighting with FloorLODFar slab).
 */
function BuildingFootprintOutline({
  opacityMult,
  showLabel,
  labelStyle,
}: {
  opacityMult: number;
  showLabel: boolean;
  labelStyle: "prominent" | "subdued" | "hidden";
}) {
  const geo = useMemo(() => {
    const y = 0.03;
    const pts: THREE.Vector3[] = [
      // North edge (Z = 0 face)
      new THREE.Vector3(0,      y, 0),
      new THREE.Vector3(BLDG_W, y, 0),
      // East edge (X = BLDG_W face)
      new THREE.Vector3(BLDG_W, y, 0),
      new THREE.Vector3(BLDG_W, y, BLDG_D),
      // South edge (Z = BLDG_D face)
      new THREE.Vector3(BLDG_W, y, BLDG_D),
      new THREE.Vector3(0,      y, BLDG_D),
      // West edge (X = 0 face)
      new THREE.Vector3(0,      y, BLDG_D),
      new THREE.Vector3(0,      y, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  const effectiveOpacity = BLDG_FOOTPRINT_OPACITY * opacityMult;

  // Label style configuration
  const labelFontSize  = labelStyle === "prominent" ? "10px" : "8px";
  const labelColor     = labelStyle === "prominent" ? "#8aadff" : "#6666aa";
  const labelOpacity   = labelStyle === "prominent" ? 0.92 : 0.60;

  return (
    <group name="birds-eye-lod-building-footprint-group">
      <lineSegments
        geometry={geo}
        name="birds-eye-lod-building-footprint"
        renderOrder={1}
      >
        <lineBasicMaterial
          color={BLDG_FOOTPRINT_COLOR}
          transparent
          opacity={effectiveOpacity}
          depthWrite={false}
        />
      </lineSegments>

      {/* Building name label — shown at FAR and MID zoom, positioned above centre */}
      {showLabel && labelStyle !== "hidden" && (
        <Html
          position={[BLDG_W / 2, 0.3, -0.8]}
          center
          distanceFactor={18}
          style={{ pointerEvents: "none", opacity: labelOpacity }}
        >
          <div
            style={{
              color: labelColor,
              fontSize: labelFontSize,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.12em",
              whiteSpace: "nowrap",
              textTransform: "uppercase",
            }}
          >
            {BUILDING.name} · {BUILDING.floors.length}F
          </div>
        </Html>
      )}
    </group>
  );
}

// ── Level-2: OfficeZoneLayer ──────────────────────────────────────────────────

interface OfficeZoneFillProps {
  floorDef: FloorDef;
  /** Zoom-derived opacity multiplier in [0, 1] */
  opacityMult: number;
  /** Whether to show the floor department label */
  showLabel: boolean;
}

/** Floor department abbreviations for the zone label (MID zoom level) */
const FLOOR_DEPT_LABELS: Record<number, string> = {
  0: "ENTRY · RECORDS",
  1: "OPERATIONS",
};

/**
 * OfficeZoneFill — Translucent colored plane at the floor's world Y level.
 *
 * Each floor gets a distinct background tint so office zones are immediately
 * legible from bird's-eye altitude.  Color is pure-function-computed from the
 * floor index so it is deterministic and testable.
 *
 * At MID zoom the floor department label is shown at the zone edge.
 */
function OfficeZoneFill({ floorDef, opacityMult, showLabel }: OfficeZoneFillProps) {
  const y = floorDef.floor * FLOOR_HEIGHT + 0.015;
  const color = computeZoneFillColor(floorDef.floor);
  const effectiveOpacity = ZONE_FILL_OPACITY * opacityMult;

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: effectiveOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color, effectiveOpacity],
  );

  const floorName = floorDef.name ?? `Floor ${floorDef.floor}`;
  const deptLabel = FLOOR_DEPT_LABELS[floorDef.floor] ?? floorName.toUpperCase();

  return (
    <group name={`birds-eye-lod-zone-floor-${floorDef.floor}`}>
      <mesh
        position={[floorDef.gridW / 2, y, floorDef.gridD / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={mat}
        renderOrder={2}
      >
        <planeGeometry args={[floorDef.gridW, floorDef.gridD]} />
      </mesh>

      {/* Floor label at the zone edge — MID zoom */}
      {showLabel && (
        <Html
          position={[-0.6, y + 0.1, floorDef.gridD / 2]}
          center
          distanceFactor={16}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              color: "#7080c0",
              fontSize: "7px",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.1em",
              whiteSpace: "nowrap",
              opacity: 0.82,
            }}
          >
            {deptLabel}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * OfficeZoneLayer — Level-2 hierarchy visual.
 *
 * Renders one translucent zone fill per building floor.
 * The distinct tints make it clear which floor zone is which at maximum
 * bird's-eye altitude, before any room-level detail is visible.
 */
function OfficeZoneLayer({
  floors,
  opacityMult,
  showFloorLabels,
}: {
  floors: FloorDef[];
  opacityMult: number;
  showFloorLabels: boolean;
}) {
  return (
    <group name="birds-eye-lod-office-zones">
      {floors.map((floorDef) => (
        <OfficeZoneFill
          key={floorDef.floor}
          floorDef={floorDef}
          opacityMult={opacityMult}
          showLabel={showFloorLabels}
        />
      ))}
    </group>
  );
}

// ── Level-3: RoomCellLayer ────────────────────────────────────────────────────

interface RoomCellOutlineProps {
  room: RoomDef;
  /** Zoom-derived opacity multiplier in [0, 1] */
  opacityMult: number;
  /** Whether to show the room name label (MID and NEAR zoom) */
  showLabel: boolean;
}

/**
 * RoomCellOutline — Level-3 visual for a single room.
 *
 * Renders a floor-level colored fill rectangle + perimeter outline.
 * Uses room.colorAccent so each room type has its canonical accent color.
 *
 * Rendered at floor level (Y ≈ room.position.y + 0.03) rather than ceiling
 * level so it does not conflict with BirdsEyeOverlay's ceiling-level tiles.
 *
 * Fill plane is inset by 0.08 world units on each axis to leave a thin gap
 * between adjacent rooms, making room boundaries unambiguous.
 *
 * At MID and NEAR zoom a room name label is shown at the room centre.
 */
function RoomCellOutline({ room, opacityMult, showLabel }: RoomCellOutlineProps) {
  const { x: w, z: d } = room.dimensions;
  const { x: px, y: py, z: pz } = room.position;

  // Floor-level Y: slightly above the room floor to avoid z-fighting
  const fillY  = py + 0.025;
  const lineY  = py + 0.030; // tiny raise above fill

  const effectiveFillOpacity    = ROOM_CELL_FILL_OPACITY * opacityMult;
  const effectiveOutlineOpacity = ROOM_CELL_OUTLINE_OPACITY * opacityMult;

  const fillMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: room.colorAccent,
        transparent: true,
        opacity: effectiveFillOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.colorAccent, effectiveFillOpacity],
  );

  const outlineGeo = useMemo(() => {
    const y = lineY;
    const pts: THREE.Vector3[] = [
      // North edge
      new THREE.Vector3(px,     y, pz),
      new THREE.Vector3(px + w, y, pz),
      // East edge
      new THREE.Vector3(px + w, y, pz),
      new THREE.Vector3(px + w, y, pz + d),
      // South edge
      new THREE.Vector3(px + w, y, pz + d),
      new THREE.Vector3(px,     y, pz + d),
      // West edge
      new THREE.Vector3(px,     y, pz + d),
      new THREE.Vector3(px,     y, pz),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px, py, pz, w, d]);

  const outlineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: room.colorAccent,
        transparent: true,
        opacity: effectiveOutlineOpacity,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.colorAccent, effectiveOutlineOpacity],
  );

  // Room label position: centre of room at floor level
  const labelX = px + w / 2;
  const labelY = py + 0.08;
  const labelZ = pz + d / 2;

  return (
    <group name={`birds-eye-lod-room-cell-${room.roomId}`} renderOrder={3}>
      {/* Role-colored floor fill */}
      <mesh
        position={[px + w / 2, fillY, pz + d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={fillMat}
      >
        <planeGeometry args={[w - 0.08, d - 0.08]} />
      </mesh>

      {/* Perimeter outline — uses lineSegments (R3F intrinsic) */}
      <lineSegments geometry={outlineGeo} material={outlineMat} />

      {/* Room name label — MID and NEAR zoom */}
      {showLabel && (
        <Html
          position={[labelX, labelY, labelZ]}
          center
          distanceFactor={14}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              color: room.colorAccent,
              fontSize: "7px",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
              opacity: 0.88,
              textTransform: "uppercase",
            }}
          >
            {room.name}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * RoomCellLayer — Level-3 hierarchy visual.
 *
 * Renders floor-level room cell outlines with colored fills for all rooms.
 * Each cell is clearly bounded and role-colored, making the building's
 * internal layout legible without zooming in.
 */
function RoomCellLayer({
  rooms,
  opacityMult,
  showRoomLabels,
}: {
  rooms: RoomDef[];
  opacityMult: number;
  showRoomLabels: boolean;
}) {
  return (
    <group name="birds-eye-lod-room-cells">
      {rooms.map((room) => (
        <RoomCellOutline
          key={room.roomId}
          room={room}
          opacityMult={opacityMult}
          showLabel={showRoomLabels}
        />
      ))}
    </group>
  );
}

// ── Level-4: AgentMarkerLayer ─────────────────────────────────────────────────

interface AgentMarkerProps {
  agent: AgentRuntimeState;
  /** Zoom-derived opacity multiplier in [0, 1] */
  opacityMult: number;
  /** Whether to show the agent name + role label (NEAR zoom) */
  showLabel: boolean;
}

/**
 * AgentMarker — Level-4 visual for one agent.
 *
 * Renders a flat hexagonal disc (CircleGeometry with 6 segments) at the
 * agent's world position.  Disc color matches agent.def.visual.color;
 * radius increases for active/busy agents via SHARED_AGENT_MARKER_GEO_ACTIVE.
 *
 * Geometry is shared across all agents of the same activity class
 * (active vs. inactive) to avoid per-instance geometry allocation.
 *
 * Rotated [-Math.PI/2, 0, 0] so the disc lies flat in the XZ plane
 * (perpendicular to the orthographic bird's-eye camera axis).
 *
 * At NEAR zoom a name + role label is shown above the disc.
 */
function AgentMarker({ agent, opacityMult, showLabel }: AgentMarkerProps) {
  const { x, y, z } = agent.worldPosition;
  const { color } = agent.def.visual;
  const isActive = agent.status === "active" || agent.status === "busy";
  const effectiveOpacity = AGENT_MARKER_OPACITY * opacityMult;

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: effectiveOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color, effectiveOpacity],
  );

  return (
    <group name={`birds-eye-lod-agent-marker-${agent.def.agentId}`}>
      <mesh
        position={[x, y + 0.04, z]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={isActive ? SHARED_AGENT_MARKER_GEO_ACTIVE : SHARED_AGENT_MARKER_GEO_BASE}
        material={mat}
        renderOrder={4}
      />

      {/* Agent name label — NEAR zoom only */}
      {showLabel && (
        <Html
          position={[x, y + 0.15, z]}
          center
          distanceFactor={10}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              color,
              fontSize: "7px",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
              opacity: 0.90,
              textTransform: "uppercase",
            }}
          >
            {agent.def.visual.label}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * AgentMarkerLayer — Level-4 hierarchy visual.
 *
 * Renders a flat hexagonal disc for each agent in the building.
 * Markers are:
 *   - Color-coded by role (agent.def.visual.color)
 *   - Sized by activity status (active/busy → larger disc)
 *   - Rendered at floor level (agent.worldPosition.y + 0.04)
 *   - Labeled with agent name + role at NEAR zoom
 *
 * These markers complement the existing AgentLODFar spheres (which are
 * only visible in perspective mode at FAR LOD distance).  In bird's-eye
 * mode the perspective LOD system is inactive, so AgentMarkerLayer is the
 * canonical source of agent visibility from above.
 *
 * Renders nothing when there are no agents.
 */
function AgentMarkerLayer({
  agents,
  opacityMult,
  showAgentLabels,
}: {
  agents: AgentRuntimeState[];
  opacityMult: number;
  showAgentLabels: boolean;
}) {
  if (agents.length === 0) return null;

  return (
    <group name="birds-eye-lod-agent-markers">
      {agents.map((agent) => (
        <AgentMarker
          key={agent.def.agentId}
          agent={agent}
          opacityMult={opacityMult}
          showLabel={showAgentLabels}
        />
      ))}
    </group>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * BirdsEyeLODLayer — Hierarchical level-of-detail visuals for bird's-eye altitude.
 *
 * Sub-AC 3b acceptance criteria:
 *   ✓ Building footprint visible and clearly bounded from bird's-eye altitude
 *   ✓ Office zones (floors) distinguishable by distinct tint colors
 *   ✓ Room cells individually outlined with role-colored fills
 *   ✓ Agent markers rendered as visible hexagonal discs per agent
 *   ✓ ZOOM-DRIVEN LOD: FAR zoom = building overview, MID = rooms, NEAR = agents
 *   ✓ LABELS: building name at FAR, room names at MID, agent labels at NEAR
 *   ✓ Per-tier opacities smoothly interpolated across zoom thresholds
 *   ✓ Does not duplicate BirdsEyeOverlay geometry (different Y level)
 *   ✓ Guard: renders nothing when cameraMode !== "birdsEye"
 *   ✓ Event-sourced: reads building + agent state from event-sourced stores
 *   ✓ All hooks called unconditionally (React rules)
 *
 * Integration note:
 *   Mount this component inside the R3F <Canvas>, alongside <BirdsEyeOverlay />.
 *   Both components guard against non-birdsEye mode, so they are safe
 *   to co-exist in all camera modes.
 */
export function BirdsEyeLODLayer() {
  // ── All hooks called unconditionally ──────────────────────────────────────
  const cameraMode   = useSpatialStore((s) => s.cameraMode);
  const building     = useSpatialStore((s) => s.building);
  const birdsEyeZoom = useSpatialStore((s) => s.birdsEyeZoom);
  const agentsMap    = useAgentStore((s) => s.agents);

  const agents = useMemo(() => Object.values(agentsMap), [agentsMap]);

  // ── Zoom-based LOD computation (all pure, no side-effects) ────────────────
  const zoomOpacities   = useMemo(() => computeHierarchyZoomOpacities(birdsEyeZoom), [birdsEyeZoom]);
  const labelVisibility = useMemo(() => computeZoomLabelVisibility(birdsEyeZoom),    [birdsEyeZoom]);
  const buildingLabelStyle = useMemo(() => computeBuildingLabelStyle(birdsEyeZoom),  [birdsEyeZoom]);

  // Render gate multipliers: skip layers that are fully transparent
  const renderBuilding = shouldRenderZoomTier("building", birdsEyeZoom);
  const renderFloor    = shouldRenderZoomTier("floor",    birdsEyeZoom);
  const renderRoom     = shouldRenderZoomTier("room",     birdsEyeZoom);
  const renderAgent    = shouldRenderZoomTier("agent",    birdsEyeZoom);

  // ── Guard: only render in bird's-eye mode ─────────────────────────────────
  if (cameraMode !== "birdsEye") return null;

  return (
    <group name="birds-eye-lod-layer">
      {/* Level 1 — Building footprint outline (outermost scope boundary)
          FAR zoom: prominent + building label
          MID zoom: subdued + building label (context)
          NEAR zoom: minimal (recedes as agents become primary) */}
      {renderBuilding && (
        <BuildingFootprintOutline
          opacityMult={zoomOpacities.building}
          showLabel={labelVisibility.showBuildingLabel}
          labelStyle={buildingLabelStyle}
        />
      )}

      {/* Level 2 — Office zone fills (per-floor tinted planes)
          MID zoom: prominent with floor labels
          FAR zoom: background context
          NEAR zoom: recedes */}
      {renderFloor && (
        <OfficeZoneLayer
          floors={building.floors}
          opacityMult={zoomOpacities.floor}
          showFloorLabels={labelVisibility.showFloorLabels}
        />
      )}

      {/* Level 3 — Room cell outlines + fills (individual room boundaries)
          MID zoom: primary detail + room name labels
          NEAR zoom: spatial context for agents (still visible)
          FAR zoom: hinted at low opacity */}
      {renderRoom && (
        <RoomCellLayer
          rooms={building.rooms}
          opacityMult={zoomOpacities.room}
          showRoomLabels={labelVisibility.showRoomLabels}
        />
      )}

      {/* Level 4 — Agent markers (per-agent hexagonal discs)
          NEAR zoom: primary detail + agent name labels
          MID zoom: hinted
          FAR zoom: hidden */}
      {renderAgent && (
        <AgentMarkerLayer
          agents={agents}
          opacityMult={zoomOpacities.agent}
          showAgentLabels={labelVisibility.showAgentLabels}
        />
      )}
    </group>
  );
}
