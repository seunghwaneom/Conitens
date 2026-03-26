/**
 * HierarchyDepthLODLayer — Sub-AC 3c
 *
 * Renders level-of-detail (LOD) visuals for each hierarchy tier, toggling
 * visibility based on the current active drill depth:
 *
 *   Tier 0 — Building footprint outline    (active at "building" depth)
 *   Tier 1 — Office zone fills + outlines  (active at "floor" depth)
 *   Tier 2 — Room cell outlines            (active at "room" depth)
 *   Tier 3 — Agent node indicators         (active at "agent" depth)
 *
 * ── Design rationale ─────────────────────────────────────────────────────────
 *
 * The existing LOD system in SceneHierarchy.tsx switches between NEAR / MID / FAR
 * geometry representations based on camera distance.  This layer is orthogonal:
 * it renders an AMBIENT CONTEXT overlay whose content is determined entirely by
 * drill depth (drillLevel from spatial-store), not camera distance.
 *
 * As the user drills deeper:
 *   building → floor    : building outline recedes, floor zone activates
 *   floor → room        : floor zone recedes, room outline activates
 *   room → agent        : room outline recedes, agent node activates
 *
 * This creates the "drill-down = zoom-into" progressive-reveal narrative that
 * makes the diegetic world feel like a live command-center map.
 *
 * ── Visibility rules (DEPTH_LOD_OPACITIES) ───────────────────────────────────
 *
 *   Each tier's opacity at each drill level is specified in DEPTH_LOD_OPACITIES.
 *   Opacity 0.0 → tier is not rendered (zero overhead).
 *   Active tier always has the highest opacity at its corresponding drill level.
 *   Parent tiers provide receded context; child tiers appear as hints.
 *
 * ── Guard ─────────────────────────────────────────────────────────────────────
 *
 * The component guards on cameraMode !== "birdsEye".
 * In bird's-eye mode, BirdsEyeLODLayer already renders all four tiers
 * simultaneously from altitude; this layer provides the same tiers
 * progressively in perspective mode.
 *
 * ── Record transparency ──────────────────────────────────────────────────────
 *
 * HierarchyDepthLODLayer is purely visual — it does NOT emit any events or
 * mutate any store state.  All state it reads is event-sourced through the
 * spatial and agent stores.
 *
 * ── Pure exports (for unit testing) ─────────────────────────────────────────
 *
 *   DEPTH_LOD_OPACITIES     — per-tier opacity at each drill level
 *   computeDepthTierOpacity — opacity getter (tier × drillLevel → opacity)
 *   isDepthTierActive       — true when tier is the primary active tier
 *   shouldRenderDepthTier   — true when opacity > 0 (render gate)
 *   computeActiveFloorFill  — active floor fill opacity vs. sibling opacity
 *   computeActiveRoomFill   — active room fill opacity vs. sibling opacity
 *
 * @module scene/HierarchyDepthLODLayer
 */

import { useMemo } from "react";
import * as THREE from "three";

import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";
import type { RoomDef, FloorDef } from "../data/building.js";
import type { AgentRuntimeState } from "../store/agent-store.js";

// ── Layout constants ──────────────────────────────────────────────────────────

/** World-units per floor — must match SceneHierarchy.tsx and RoomGeometry.tsx */
export const DEPTH_LOD_FLOOR_HEIGHT = 3;

/** Building width (X grid units) — must match BLDG_W in SceneHierarchy.tsx */
export const DEPTH_LOD_BLDG_W = 12;

/** Building depth (Z grid units) — must match BLDG_D in SceneHierarchy.tsx */
export const DEPTH_LOD_BLDG_D = 6;

/**
 * Vertical clearance above floor plane to avoid z-fighting with floor slabs.
 * Applied to all geometry in this layer.
 */
export const DEPTH_LOD_Y_CLEARANCE = 0.028;

// ── Drill depth type ──────────────────────────────────────────────────────────

/** Hierarchy tier identifier — matches the 4-level world: building, floor, room, agent. */
export type DepthTier = "building" | "floor" | "room" | "agent";

// ── Opacity table ─────────────────────────────────────────────────────────────

/**
 * DEPTH_LOD_OPACITIES — per-tier opacity at each drill level.
 *
 * Layout: DEPTH_LOD_OPACITIES[visualTier][drillLevel] = opacity in [0, 1].
 *
 * Opacity 0.0 → tier is hidden at this drill level (no geometry allocated).
 * Active tier (visualTier === drillLevel) always has the highest opacity.
 *
 * Rules encoded:
 *   - Active tier : highest opacity (prominent)
 *   - Parent tier : reduced but non-zero (context / breadcrumb)
 *   - Child tier  : low or zero (hint or hidden)
 *
 * Example: drillLevel === "room"
 *   building: 0.10  (minimal background context)
 *   floor:    0.22  (parent context — shows which floor we're on)
 *   room:     0.78  (ACTIVE — room outline is primary focus)
 *   agent:    0.18  (child hint — agents are present inside)
 */
export const DEPTH_LOD_OPACITIES: Record<DepthTier, Record<DepthTier, number>> = {
  /** Building footprint outline (tier 0) */
  building: {
    building: 0.82, // ▶ ACTIVE — full building boundary
    floor:    0.28, //   context — de-emphasised, floor is primary
    room:     0.10, //   minimal context
    agent:    0.0,  //   hidden — too far from agent focus
  },
  /** Office zone fills + outlines (tier 1) */
  floor: {
    building: 0.0,  //   hidden — floor not yet drilled into
    floor:    0.72, // ▶ ACTIVE — active floor zone fill
    room:     0.22, //   context — shows which office zone contains drilled room
    agent:    0.10, //   minimal context
  },
  /** Room cell outlines (tier 2) */
  room: {
    building: 0.0,  //   hidden — rooms not relevant at building overview
    floor:    0.12, //   hint — preview of room grid within active floor
    room:     0.78, // ▶ ACTIVE — active room boundary
    agent:    0.26, //   context — shows which room contains drilled agent
  },
  /** Agent node indicators (tier 3) */
  agent: {
    building: 0.0,  //   hidden
    floor:    0.0,  //   hidden
    room:     0.18, //   hint — preview of agents inside active room
    agent:    0.82, // ▶ ACTIVE — drilled agent node prominent
  },
} as const;

// ── Pure helper functions ─────────────────────────────────────────────────────

/**
 * computeDepthTierOpacity — Returns the opacity for a visual tier at a given
 * drill level.
 *
 * Pure function; no React or Three.js dependencies.
 * Primary source of truth for all render-gate and opacity decisions.
 *
 * @param tier       The visual tier whose opacity is requested
 * @param drillLevel The current drill level from the spatial store
 * @returns          Opacity value in [0, 1]
 *
 * @example
 *   computeDepthTierOpacity("room", "room")   // → 0.78  (active)
 *   computeDepthTierOpacity("room", "agent")  // → 0.26  (context)
 *   computeDepthTierOpacity("room", "building") // → 0.0 (hidden)
 */
export function computeDepthTierOpacity(
  tier: DepthTier,
  drillLevel: DepthTier,
): number {
  return DEPTH_LOD_OPACITIES[tier][drillLevel];
}

/**
 * isDepthTierActive — Returns true when the given tier is the primary
 * active tier at the current drill level.
 *
 * A tier is "active" when the drill level matches the tier — i.e. the user
 * has explicitly navigated to that level of the hierarchy.
 *
 * Pure function; no dependencies.
 *
 * @param tier       The tier to test
 * @param drillLevel The current drill level
 * @returns          true when tier === drillLevel
 */
export function isDepthTierActive(
  tier: DepthTier,
  drillLevel: DepthTier,
): boolean {
  return tier === drillLevel;
}

/**
 * shouldRenderDepthTier — Returns true when this tier should be rendered
 * at the given drill level (i.e. its opacity is > 0).
 *
 * Used as a render gate to avoid allocating Three.js geometry for tiers
 * that are fully hidden at the current drill level.
 *
 * Pure function; no dependencies.
 *
 * @param tier       The tier to test
 * @param drillLevel The current drill level
 * @returns          true when computeDepthTierOpacity(tier, drillLevel) > 0
 */
export function shouldRenderDepthTier(
  tier: DepthTier,
  drillLevel: DepthTier,
): boolean {
  return computeDepthTierOpacity(tier, drillLevel) > 0;
}

/**
 * computeActiveFloorFill — Returns the fill opacity for an individual floor
 * zone given the drill state.
 *
 * Active floor (drillFloor === floor) → full tier opacity.
 * Sibling floors → 30% of the tier opacity (background context only).
 *
 * Pure function; no dependencies.
 *
 * @param floorIndex   The floor index of the zone being rendered
 * @param drillLevel   Current drill level
 * @param drillFloor   Currently drilled floor (null if not yet drilled)
 * @returns            Fill opacity in [0, 1]
 */
export function computeActiveFloorFill(
  floorIndex: number,
  drillLevel: DepthTier,
  drillFloor: number | null,
): number {
  const baseTierOpacity = computeDepthTierOpacity("floor", drillLevel);
  if (baseTierOpacity === 0) return 0;

  // At "building" level, no floor is drilled — all floors shown equally
  if (drillLevel === "building" || drillFloor === null) {
    return baseTierOpacity;
  }

  // Active floor gets full tier opacity; siblings get 30%
  return floorIndex === drillFloor
    ? baseTierOpacity
    : baseTierOpacity * 0.30;
}

/**
 * computeActiveRoomFill — Returns the fill opacity for an individual room
 * outline given the drill state.
 *
 * Active room (drillRoom === roomId) → full tier opacity.
 * Sibling rooms on the same floor → 25% of tier opacity (hint).
 * Rooms on other floors → 0 (hidden).
 *
 * Pure function; no dependencies.
 *
 * @param roomId       The room whose opacity is being computed
 * @param roomFloor    Which floor this room is on
 * @param drillLevel   Current drill level
 * @param drillFloor   Currently drilled floor (null if not yet drilled)
 * @param drillRoom    Currently drilled room ID (null if not yet drilled)
 * @returns            Fill opacity in [0, 1]
 */
export function computeActiveRoomFill(
  roomId: string,
  roomFloor: number,
  drillLevel: DepthTier,
  drillFloor: number | null,
  drillRoom: string | null,
): number {
  const baseTierOpacity = computeDepthTierOpacity("room", drillLevel);
  if (baseTierOpacity === 0) return 0;

  // If we know which floor is drilled, only show rooms on that floor
  if (drillFloor !== null && roomFloor !== drillFloor) return 0;

  // No specific room drilled yet — show all rooms in drilled floor equally
  if (drillRoom === null) return baseTierOpacity;

  // Active room → full opacity; siblings → 25% (hint)
  return roomId === drillRoom
    ? baseTierOpacity
    : baseTierOpacity * 0.25;
}

// ── Tier 0: Building Footprint Outline ───────────────────────────────────────

/** Color for the building footprint outline — matches command-center blue accent */
export const BLDG_DEPTH_OUTLINE_COLOR = "#4a6aff";

/**
 * BuildingFootprintTier — Level-0 depth LOD visual.
 *
 * Renders a rectangular perimeter outline around the building's ground-level
 * footprint.  Visible at "building" drill level with full opacity; recedes to
 * context at "floor" and "room" depths; hidden at "agent" depth.
 *
 * Uses LineSegments (8 points = 4 edges) for a crisp low-poly perimeter.
 */
function BuildingFootprintTier({ opacity }: { opacity: number }) {
  const geo = useMemo(() => {
    const y = DEPTH_LOD_Y_CLEARANCE;
    const pts: THREE.Vector3[] = [
      // North edge (Z = 0)
      new THREE.Vector3(0,                    y, 0),
      new THREE.Vector3(DEPTH_LOD_BLDG_W,    y, 0),
      // East edge (X = BLDG_W)
      new THREE.Vector3(DEPTH_LOD_BLDG_W,    y, 0),
      new THREE.Vector3(DEPTH_LOD_BLDG_W,    y, DEPTH_LOD_BLDG_D),
      // South edge (Z = BLDG_D)
      new THREE.Vector3(DEPTH_LOD_BLDG_W,    y, DEPTH_LOD_BLDG_D),
      new THREE.Vector3(0,                    y, DEPTH_LOD_BLDG_D),
      // West edge (X = 0)
      new THREE.Vector3(0,                    y, DEPTH_LOD_BLDG_D),
      new THREE.Vector3(0,                    y, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: BLDG_DEPTH_OUTLINE_COLOR,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    [opacity],
  );

  // Subtle fill plane so the footprint has interior presence
  const fillGeo = useMemo(
    () => new THREE.PlaneGeometry(DEPTH_LOD_BLDG_W, DEPTH_LOD_BLDG_D),
    [],
  );
  const fillMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: BLDG_DEPTH_OUTLINE_COLOR,
        transparent: true,
        opacity: opacity * 0.06, // fill is always subtler than outline
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [opacity],
  );

  return (
    <group name="depth-lod-building-footprint">
      {/* Perimeter outline */}
      <lineSegments
        geometry={geo}
        material={mat}
        renderOrder={20}
      />
      {/* Interior fill — very subtle at all opacities */}
      <mesh
        geometry={fillGeo}
        material={fillMat}
        position={[DEPTH_LOD_BLDG_W / 2, DEPTH_LOD_Y_CLEARANCE - 0.002, DEPTH_LOD_BLDG_D / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={19}
      />
    </group>
  );
}

// ── Tier 1: Office Zone Layer ─────────────────────────────────────────────────

/** Colors for the two-floor office zone fills — cool tints for depth */
export const OFFICE_ZONE_COLORS: ReadonlyArray<string> = [
  "#1e2a6a", // floor 0 — deep cobalt
  "#2a1a5a", // floor 1 — deep purple-indigo
  "#1a2a5e", // floor 2 — teal-slate (hypothetical)
  "#2a1e60", // floor 3 — violet-indigo (hypothetical)
] as const;

/**
 * computeOfficeZoneColor — Returns the zone fill color for a floor index.
 * Pure function; wraps with modulo for buildings with > 4 floors.
 */
export function computeOfficeZoneColor(floorIndex: number): string {
  const idx = ((floorIndex % OFFICE_ZONE_COLORS.length) + OFFICE_ZONE_COLORS.length)
    % OFFICE_ZONE_COLORS.length;
  return OFFICE_ZONE_COLORS[idx] ?? (OFFICE_ZONE_COLORS[0] as string);
}

interface OfficeZoneTileProps {
  floorDef: FloorDef;
  opacity: number;
  isActive: boolean;
}

/**
 * OfficeZoneTile — One office zone for a single floor.
 *
 * Renders a translucent fill plane + perimeter outline at the floor's Y level.
 * Active floor uses a brighter accent outline; sibling floors get a dimmer tint.
 */
function OfficeZoneTile({ floorDef, opacity, isActive }: OfficeZoneTileProps) {
  const y = floorDef.floor * DEPTH_LOD_FLOOR_HEIGHT + DEPTH_LOD_Y_CLEARANCE;
  const gw = floorDef.gridW ?? DEPTH_LOD_BLDG_W;
  const gd = floorDef.gridD ?? DEPTH_LOD_BLDG_D;
  const fillColor = computeOfficeZoneColor(floorDef.floor);

  const fillMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: fillColor,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fillColor, opacity],
  );

  const outlineGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [
      new THREE.Vector3(0,  y, 0),  new THREE.Vector3(gw, y, 0),
      new THREE.Vector3(gw, y, 0),  new THREE.Vector3(gw, y, gd),
      new THREE.Vector3(gw, y, gd), new THREE.Vector3(0,  y, gd),
      new THREE.Vector3(0,  y, gd), new THREE.Vector3(0,  y, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, gw, gd]);

  const outlineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: isActive ? "#6a8aff" : "#3a3a6a",
        transparent: true,
        opacity: isActive ? Math.min(opacity * 1.25, 1) : opacity * 0.55,
        depthWrite: false,
      }),
    [isActive, opacity],
  );

  return (
    <group name={`depth-lod-office-zone-${floorDef.floor}`}>
      {/* Zone fill */}
      <mesh
        position={[gw / 2, y + 0.001, gd / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={fillMat}
        renderOrder={21}
      >
        <planeGeometry args={[gw, gd]} />
      </mesh>
      {/* Zone perimeter outline */}
      <lineSegments
        geometry={outlineGeo}
        material={outlineMat}
        renderOrder={22}
      />
    </group>
  );
}

interface OfficeZoneTierProps {
  floors: FloorDef[];
  drillLevel: DepthTier;
  drillFloor: number | null;
}

/**
 * OfficeZoneTier — Level-1 depth LOD visual.
 *
 * Renders one OfficeZoneTile per building floor.  At "floor" drill level, the
 * active floor is prominent while sibling floors are subdued.  At "room" and
 * "agent" levels, all floor zones show at reduced opacity for context.
 */
function OfficeZoneTier({ floors, drillLevel, drillFloor }: OfficeZoneTierProps) {
  return (
    <group name="depth-lod-office-zones">
      {floors.map((f) => {
        const opacity = computeActiveFloorFill(f.floor, drillLevel, drillFloor);
        if (opacity <= 0) return null;
        return (
          <OfficeZoneTile
            key={f.floor}
            floorDef={f}
            opacity={opacity}
            isActive={drillFloor === f.floor}
          />
        );
      })}
    </group>
  );
}

// ── Tier 2: Room Outline Layer ────────────────────────────────────────────────

interface RoomOutlineTileProps {
  room: RoomDef;
  opacity: number;
  isActive: boolean;
}

/**
 * RoomOutlineTile — Perimeter outline for a single room cell.
 *
 * Active room: bright role-accent outline + subtle fill.
 * Context rooms: dim outline only.
 */
function RoomOutlineTile({ room, opacity, isActive }: RoomOutlineTileProps) {
  const { x: px, y: py, z: pz } = room.position;
  const { x: rw, z: rd } = room.dimensions;
  const y = py + DEPTH_LOD_Y_CLEARANCE;

  const outlineGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [
      new THREE.Vector3(px,      y, pz),      new THREE.Vector3(px + rw, y, pz),
      new THREE.Vector3(px + rw, y, pz),      new THREE.Vector3(px + rw, y, pz + rd),
      new THREE.Vector3(px + rw, y, pz + rd), new THREE.Vector3(px,      y, pz + rd),
      new THREE.Vector3(px,      y, pz + rd), new THREE.Vector3(px,      y, pz),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px, y, pz, rw, rd]);

  const outlineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: room.colorAccent,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.colorAccent, opacity],
  );

  const fillMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: room.colorAccent,
        transparent: true,
        opacity: opacity * 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.colorAccent, opacity],
  );

  return (
    <group name={`depth-lod-room-outline-${room.roomId}`}>
      {/* Room outline */}
      <lineSegments
        geometry={outlineGeo}
        material={outlineMat}
        renderOrder={23}
      />
      {/* Subtle fill for active room */}
      {isActive && (
        <mesh
          position={[px + rw / 2, y + 0.001, pz + rd / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={fillMat}
          renderOrder={22}
        >
          <planeGeometry args={[rw - 0.04, rd - 0.04]} />
        </mesh>
      )}
    </group>
  );
}

interface RoomOutlineTierProps {
  rooms: RoomDef[];
  drillLevel: DepthTier;
  drillFloor: number | null;
  drillRoom: string | null;
}

/**
 * RoomOutlineTier — Level-2 depth LOD visual.
 *
 * Renders room outlines for rooms on the currently-drilled floor.
 * The active drilled room gets a bright accent outline; sibling rooms
 * appear as dim hints.
 */
function RoomOutlineTier({ rooms, drillLevel, drillFloor, drillRoom }: RoomOutlineTierProps) {
  return (
    <group name="depth-lod-room-outlines">
      {rooms.map((room) => {
        const opacity = computeActiveRoomFill(
          room.roomId,
          room.floor,
          drillLevel,
          drillFloor,
          drillRoom,
        );
        if (opacity <= 0) return null;
        return (
          <RoomOutlineTile
            key={room.roomId}
            room={room}
            opacity={opacity}
            isActive={drillRoom === room.roomId}
          />
        );
      })}
    </group>
  );
}

// ── Tier 3: Agent Node Indicators ────────────────────────────────────────────

/** Radius of the agent node indicator disc (active agent) */
export const AGENT_NODE_ACTIVE_RADIUS = 0.30;

/** Radius of the agent node indicator disc (context / hint agents) */
export const AGENT_NODE_CONTEXT_RADIUS = 0.18;

/** Number of segments for the hexagonal agent node disc (low-poly, 6 sides) */
const AGENT_NODE_SEGMENTS = 6;

// Module-level shared geometry singletons (avoid per-agent allocations)
const SHARED_AGENT_NODE_ACTIVE_GEO = new THREE.CircleGeometry(
  AGENT_NODE_ACTIVE_RADIUS,
  AGENT_NODE_SEGMENTS,
);
const SHARED_AGENT_NODE_CONTEXT_GEO = new THREE.CircleGeometry(
  AGENT_NODE_CONTEXT_RADIUS,
  AGENT_NODE_SEGMENTS,
);

interface AgentNodeTileProps {
  agent: AgentRuntimeState;
  opacity: number;
  isActive: boolean;
}

/**
 * AgentNodeTile — Hexagonal floor-level indicator for a single agent.
 *
 * Active agent (drilled): large hex disc + bright color.
 * Context agents (same room): small hex disc at reduced opacity.
 *
 * Rendered at the agent's world-position Y + clearance.
 */
function AgentNodeTile({ agent, opacity, isActive }: AgentNodeTileProps) {
  const { worldPosition: wp } = agent;
  const color = agent.def.visual.color;

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color, opacity],
  );

  return (
    <mesh
      geometry={isActive ? SHARED_AGENT_NODE_ACTIVE_GEO : SHARED_AGENT_NODE_CONTEXT_GEO}
      material={mat}
      position={[wp.x, wp.y + DEPTH_LOD_Y_CLEARANCE, wp.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      name={`depth-lod-agent-node-${agent.def.agentId}`}
      renderOrder={24}
    />
  );
}

interface AgentNodeTierProps {
  agents: AgentRuntimeState[];
  drillLevel: DepthTier;
  drillRoom: string | null;
  drillAgent: string | null;
}

/**
 * AgentNodeTier — Level-3 depth LOD visual.
 *
 * Renders hexagonal floor-level discs for agents in the drilled room.
 * The active drilled agent is large + bright; room-siblings are small + dim.
 * Agents in other rooms are not rendered.
 */
function AgentNodeTier({ agents, drillLevel, drillRoom, drillAgent }: AgentNodeTierProps) {
  const baseTierOpacity = computeDepthTierOpacity("agent", drillLevel);

  return (
    <group name="depth-lod-agent-nodes">
      {agents.map((agent) => {
        // Only show agents in the drilled room (if we know it)
        if (drillRoom !== null && agent.roomId !== drillRoom) return null;

        // Determine per-agent opacity
        const isDrilled = drillAgent !== null && agent.def.agentId === drillAgent;
        const opacity = isDrilled
          ? baseTierOpacity
          : baseTierOpacity * 0.28;

        if (opacity <= 0) return null;

        return (
          <AgentNodeTile
            key={agent.def.agentId}
            agent={agent}
            opacity={opacity}
            isActive={isDrilled}
          />
        );
      })}
    </group>
  );
}

// ── HierarchyDepthLODLayer — Root exported component ─────────────────────────

/**
 * HierarchyDepthLODLayer — Root component for the depth-gated LOD overlay.
 *
 * Sub-AC 3c: renders four hierarchy tier visuals (building footprint, office
 * zones, room outlines, agent nodes) and toggles each tier's visibility based
 * on the current active drill depth.
 *
 * Placed in CommandCenterScene as a perspective-mode companion to
 * BirdsEyeLODLayer (which handles the equivalent visuals from bird's-eye
 * altitude).  When cameraMode === "birdsEye", this layer is hidden to prevent
 * double-rendering.
 *
 * Record-transparent: reads from stores, emits no events.
 *
 * @example
 *   // In CommandCenterScene.tsx inside the <Canvas> Suspense boundary:
 *   <HierarchyDepthLODLayer />
 */
export function HierarchyDepthLODLayer() {
  // ── Store reads ────────────────────────────────────────────────────────────
  const cameraMode = useSpatialStore((s) => s.cameraMode);
  const drillLevel = useSpatialStore((s) => s.drillLevel) as DepthTier;
  const drillFloor = useSpatialStore((s) => s.drillFloor);
  const drillRoom  = useSpatialStore((s) => s.drillRoom);
  const drillAgent = useSpatialStore((s) => s.drillAgent);
  const building   = useSpatialStore((s) => s.building);
  const agents     = useAgentStore((s) => s.agents);

  // ── Guard: bird's-eye mode uses BirdsEyeLODLayer for this responsibility ──
  if (cameraMode === "birdsEye") return null;

  // Flatten agents object to array for iteration
  const agentList = Object.values(agents);

  return (
    <group name="hierarchy-depth-lod-layer">
      {/* ── Tier 0: Building footprint ───────────────────────────────────── */}
      {shouldRenderDepthTier("building", drillLevel) && (
        <BuildingFootprintTier
          opacity={computeDepthTierOpacity("building", drillLevel)}
        />
      )}

      {/* ── Tier 1: Office zone fills + outlines ─────────────────────────── */}
      {shouldRenderDepthTier("floor", drillLevel) && (
        <OfficeZoneTier
          floors={building.floors}
          drillLevel={drillLevel}
          drillFloor={drillFloor}
        />
      )}

      {/* ── Tier 2: Room cell outlines ───────────────────────────────────── */}
      {shouldRenderDepthTier("room", drillLevel) && (
        <RoomOutlineTier
          rooms={building.rooms}
          drillLevel={drillLevel}
          drillFloor={drillFloor}
          drillRoom={drillRoom}
        />
      )}

      {/* ── Tier 3: Agent node indicators ───────────────────────────────── */}
      {shouldRenderDepthTier("agent", drillLevel) && (
        <AgentNodeTier
          agents={agentList}
          drillLevel={drillLevel}
          drillRoom={drillRoom}
          drillAgent={drillAgent}
        />
      )}
    </group>
  );
}

export default HierarchyDepthLODLayer;
