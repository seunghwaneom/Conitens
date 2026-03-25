/**
 * CommandCenterScene — Root Three.js scene composition.
 *
 * Assembles the complete 3D command center:
 * - Hierarchical scene graph (Building → Floor → Room → Agent) with LOD
 * - Lighting rig
 * - Camera controller (perspective orbit or bird's-eye orthographic)
 * - Diegetic floor indicators (always-visible world-space badges)
 *
 * The scene adapts to the building definition in the spatial store.
 * Rooms are generated from YAML configs at build/runtime and positioned
 * based on their spatial properties.
 *
 * Rendering mode:
 *   useHierarchy=true  (default) → HierarchySceneGraph (LOD 4-tier scene graph)
 *   useHierarchy=false           → Legacy flat rendering (DynamicFloors + AgentAvatarsLayer)
 *
 * See SceneHierarchy.tsx for the hierarchical rendering implementation.
 */
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { BuildingShell } from "./BuildingShell.js";
import { DynamicFloors } from "./RoomGeometry.js";
import { AgentAvatarsLayer } from "./AgentAvatar.js";
import { Lighting } from "./Lighting.js";
import { CameraRig, type CameraPreset } from "./CameraRig.js";
import { BirdsEyeCamera } from "./BirdsEyeCamera.js";
import { BirdsEyeOverlay } from "./BirdsEyeOverlay.js";
import { HierarchySceneGraph, LODDebugOverlay } from "./SceneHierarchy.js";
import { TaskConnectorsLayer } from "./TaskConnectors.js";
import { TaskMappingHUD } from "./TaskMappingHUD.js";
import { TopologyEditorLayer, TopologyEditModeIndicator } from "./TopologyEditor.js";
import { GlobalDashboardPanel } from "./GlobalDashboardPanel.js";
import { DiegeticMetricLayer } from "./DiegeticMetricDisplay.js";
import { ScenePerformanceMonitor } from "./ScenePerformance.js";
import { DrillContextPanelLayer } from "./DrillContextPanel.js";
import { ReplayPipelineLayer } from "./ReplayPipelineLayer.js";
import { ReplayDiegeticTimeline } from "./ReplayDiegeticTimeline.js";
import { PipelineDiegeticLayer } from "./PipelineDiegeticPanel.js";
import { RoomsFromRegistry } from "./RoomVolume.js";
import { DisplaySurfacesLayer } from "./DisplaySurfaces.js";
import { BirdsEyeLODLayer } from "./BirdsEyeLODLayer.js";
import { BirdsEyeClickableNodes } from "./BirdsEyeClickableNodes.js";
import { BirdsEyeConnectorLayer } from "./BirdsEyeConnectorLayer.js";
import { RoomMappingEditor3DLayer } from "./RoomMappingEditor3D.js";
import { MeetingGatheringLayer } from "./MeetingGatheringLayer.js";
import { SpatialIndexProvider } from "./SpatialIndexProvider.js";
import { HierarchySpatialTaskLayer } from "./HierarchySpatialTaskLayer.js";
import { ViewWindowProvider } from "./ViewWindowProvider.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";

// ── Building dimension constants (must match BirdsEyeCamera.tsx) ────
const BUILDING_W = 12;
const BUILDING_D = 6;
const BUILDING_CENTER_X = BUILDING_W / 2;
const BUILDING_CENTER_Z = BUILDING_D / 2;

/** CameraRig connected to the spatial store for room-focus navigation */
function CameraRigConnected({ preset }: { preset: CameraPreset }) {
  const focusedRoomId = useSpatialStore((s) => s.focusedRoomId);
  const cameraMode = useSpatialStore((s) => s.cameraMode);

  return (
    <>
      {/* Perspective orbit camera (default mode) */}
      {cameraMode === "perspective" && (
        <CameraRig preset={preset} focusRoomId={focusedRoomId} />
      )}
      {/* Bird's-eye orthographic camera */}
      {cameraMode === "birdsEye" && (
        <BirdsEyeCamera active />
      )}
    </>
  );
}

/**
 * BirdsEyeViewport — Diegetic center crosshair visible only in bird's-eye mode.
 *
 * Renders a subtle cross-hair on the ground plane so the user can always
 * locate the view center when panning.  Positioned at the building center
 * (BUILDING_W/2, 0, BUILDING_D/2) offset by the current pan values.
 *
 * Pure Three.js geometry — no HTML overlay — so it is truly diegetic
 * (rendered inside the 3D world, not a 2-D CSS overlay).
 */
function BirdsEyeViewport() {
  const cameraMode = useSpatialStore((s) => s.cameraMode);
  const pan = useSpatialStore((s) => s.birdsEyePan);

  if (cameraMode !== "birdsEye") return null;

  const cx = BUILDING_CENTER_X + pan[0];
  const cz = BUILDING_CENTER_Z + pan[1];

  return (
    <group position={[cx, 0.01, cz]}>
      {/* Horizontal arm */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 0.04]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={0.5} />
      </mesh>
      {/* Vertical arm */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[1.4, 0.04]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={0.5} />
      </mesh>
      {/* Center dot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.1, 8]} />
        <meshBasicMaterial color="#6a8aff" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

/** Loading fallback — animated wireframe cube */
function SceneLoader() {
  return (
    <mesh position={[6, 3, 3]}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshBasicMaterial color="#4a6aff" wireframe />
    </mesh>
  );
}

/** Diegetic floor indicator — label embedded in the 3D world */
function FloorIndicator({ floor, name }: { floor: number; name: string }) {
  const y = floor * 3; // floor height
  const isVisible = useSpatialStore((s) => s.floorVisibility[floor] ?? true);

  return (
    <group position={[-1.5, y + 1.5, 3]}>
      {/* Background panel */}
      <mesh>
        <boxGeometry args={[1.2, 0.4, 0.02]} />
        <meshBasicMaterial
          color={isVisible ? "#1a1a2e" : "#0a0a14"}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Accent strip */}
      <mesh position={[-0.58, 0, 0.01]}>
        <boxGeometry args={[0.04, 0.35, 0.01]} />
        <meshBasicMaterial
          color={isVisible ? "#4a6aff" : "#333355"}
          transparent
          opacity={0.7}
        />
      </mesh>
      {/* Floor label (HTML overlay embedded in 3D) */}
      <Html
        center
        distanceFactor={10}
        position={[0.05, 0, 0.02]}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            color: isVisible ? "#8888cc" : "#444466",
            fontSize: "9px",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
            textTransform: "uppercase",
          }}
        >
          F{floor} {name}
        </div>
      </Html>
    </group>
  );
}

/** Data source indicator — shows where building data was loaded from */
function DataSourceIndicator() {
  const dataSource = useSpatialStore((s) => s.dataSource);
  const roomCount = useSpatialStore((s) => s.building.rooms.length);

  return (
    <group position={[-1.5, -0.3, 3]}>
      <Html center distanceFactor={14} style={{ pointerEvents: "none" }}>
        <div
          style={{
            color: dataSource === "yaml" ? "#00cc66" : "#666688",
            fontSize: "8px",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {dataSource === "yaml" ? "YAML" : "STATIC"} · {roomCount} rooms
        </div>
      </Html>
    </group>
  );
}

/**
 * Click handler — when clicking empty space, ascend one drill level.
 * If at building level, simply deselect room and agent.
 * This makes the 3D world itself navigable: clicking "empty air" feels
 * like stepping back from the current focus.
 */
function SceneClickHandler() {
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillAscend = useSpatialStore((s) => s.drillAscend);
  const selectRoom = useSpatialStore((s) => s.selectRoom);
  const selectAgent = useAgentStore((s) => s.selectAgent);

  return (
    <mesh
      position={[6, 0, 3]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={() => {
        if (drillLevel !== "building") {
          drillAscend();
        } else {
          selectRoom(null);
          selectAgent(null);
        }
      }}
      visible={false}
    >
      <planeGeometry args={[30, 30]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

interface CommandCenterSceneProps {
  cameraPreset?: CameraPreset;
  className?: string;
  /**
   * When true (default), renders via the 4-tier hierarchical LOD scene graph
   * (Building → Floor → Room → Agent) from SceneHierarchy.tsx.
   *
   * When false, falls back to the legacy flat rendering path:
   * BuildingShell + DynamicFloors + AgentAvatarsLayer + FloorIndicators.
   */
  useHierarchy?: boolean;
  /**
   * Show LOD tier debug badges in the 3D scene.
   * Only has effect when useHierarchy=true.
   */
  showLODDebug?: boolean;
}

export function CommandCenterScene({
  cameraPreset = "overview",
  className,
  useHierarchy = true,
  showLODDebug = false,
}: CommandCenterSceneProps) {
  const floors = useSpatialStore((s) => s.building.floors);

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "linear-gradient(180deg, #0a0a14 0%, #0f0f1e 50%, #0a0a14 100%)",
      }}
    >
      <Canvas
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        camera={{
          fov: 45,
          near: 0.1,
          far: 100,
          position: [9.6, 9, 12],
        }}
        /**
         * Sub-AC 15c: Adaptive DPR range.
         *   min 1 (crisp at all times)
         *   max 1.5 (reduced from 2 — saves 25% pixel fill on hi-DPI displays)
         *
         * Canvas also receives performance.min=0.5 which activates R3F's
         * built-in adaptive frame-rate regulator — the renderer will reduce
         * its update frequency under sustained load rather than dropping visible
         * frames.
         */
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
      >
        {/*
         * Sub-AC 15c: ScenePerformanceMonitor — FPS-aware quality context.
         *
         * Must be placed as a direct child of <Canvas> (requires useFrame).
         * All scene components read the quality level via usePerformanceQuality()
         * and adapt their rendering accordingly:
         *   'high'   → full fidelity (tubes, HTML badges, all PointLights)
         *   'medium' → no tubes, badges at close range only
         *   'low'    → no HTML, no per-task PointLights
         */}
        <ScenePerformanceMonitor>
        <Suspense fallback={<SceneLoader />}>
          {/* Fog for depth */}
          <fog attach="fog" args={["#0a0a14", 20, 55]} />

          {/* Lighting rig */}
          <Lighting />

          {/* Camera controls with room-focus navigation */}
          <CameraRigConnected preset={cameraPreset} />

          {/* Click empty space to deselect */}
          <SceneClickHandler />

          {/* ── Rendering mode ───────────────────────────────────── */}
          {useHierarchy ? (
            <>
              {/*
               * HierarchySceneGraph — 4-tier LOD scene graph.
               *
               * Hierarchy:  Building → Floor (Office) → Room → Agent
               *
               * Each tier switches between NEAR / MID / FAR representations
               * based on camera distance.  Floor indicators and the data-source
               * badge are included inside HierarchySceneGraph.
               */}
              <HierarchySceneGraph />

              {/* Optional LOD debug overlay — shows tier labels in 3D space */}
              {showLODDebug && <LODDebugOverlay active />}
            </>
          ) : (
            <>
              {/* ── Legacy flat rendering path (backward compat) ── */}
              <BuildingShell />
              <DynamicFloors />
              <AgentAvatarsLayer />

              {/* Floor indicators */}
              {floors.map((f) => (
                <FloorIndicator key={f.floor} floor={f.floor} name={f.name} />
              ))}

              {/* Data source indicator */}
              <DataSourceIndicator />
            </>
          )}

          {/*
           * Sub-AC 5a: Task-agent visual connectors.
           *
           * TaskConnectorsLayer is placed IMMEDIATELY after the agent mesh
           * rendering block (hierarchy or legacy) so it is added to the scene
           * graph right after agent geometry.  This guarantees connector arcs
           * and badges are drawn with full awareness of agent world-positions
           * while still respecting renderOrder (997–999) for visual overlay.
           *
           * Both hierarchy and legacy paths render agent avatars first; this
           * placement satisfies the "immediately after agent meshes" contract.
           *
           * Renders floating task orbs (octahedron nodes) and QuadraticBézier
           * arc beams from each orb to its assigned agent head.  Agent-side
           * hexagonal indicator rings are also rendered to mark agents with
           * active task assignments.
           */}
          <TaskConnectorsLayer />

          {/*
           * Sub-AC 3: Registry-driven room volume layer.
           *
           * RoomsFromRegistry reads ROOM_REGISTRY (rebuilt from the current
           * spatial-store building so it reacts to YAML hot-reloads) and
           * instantiates a RoomVolume for every room entry.
           *
           * Each RoomVolume renders:
           *   - Semi-transparent flatShaded box (role-specific fill colour)
           *   - Low-poly wireframe Edges overlay
           *   - Floor-level role stripe
           *   - Floating role badge (type · name · agents)
           *
           * Rendered in BOTH hierarchy and legacy modes — it is independent
           * of the building-shell/wall scene graph and provides the canonical
           * "room volume" layer required by Sub-AC 3.
           */}
          <RoomsFromRegistry />

          {/*
           * Sub-AC 10a: Meeting gathering visualization layer.
           *
           * MeetingGatheringLayer renders spatial feedback when agents are
           * repositioned to a meeting room following a meeting convocation:
           *
           *   - GatheringFloorRing: animated gold pulse rings at room center
           *   - GatheringRoomGlow: semi-transparent expanded room boundary box
           *   - GatheringParticipantRay: thin vertical beam per gathered agent
           *   - GatheringConfirmationBadge: "⚑ MEETING IN PROGRESS · N AGENTS"
           *     world-anchored Html badge above the room
           *
           * Guard: renders nothing when no meeting gatherings are active.
           * State: reads meetingGatherings from agentStore (no props).
           * Rendered in both hierarchy and legacy modes (independent of scene graph).
           */}
          <MeetingGatheringLayer />

          {/*
           * Sub-AC 3 (AC 12): Diegetic 3D room mapping editor layer.
           *
           * RoomMappingEditor3DLayer provides a fully in-world interface for
           * reassigning agents and entities to different rooms:
           *
           *   - RoomMappingEditToggle3D: floating badge at the NW corner —
           *     click to toggle edit mode on/off.
           *
           *   - AgentDragHandle: pulsing hexagonal ring above each agent in
           *     edit mode.  Click → form popup; drag → drop zone assignment.
           *
           *   - AgentAssignPopup3D: world-anchored Html form that appears on
           *     click.  Supports "individual" and "role" scope.
           *
           *   - RoomDropZone: animated floor ring on each room during an
           *     active drag.  Pointer-up commits the assignment.
           *
           *   - EditModeRoomHintsLayer: subtle cyan rings on rooms when edit
           *     mode is active (no drag) — persistent spatial affordance.
           *
           * All assignments persist via room-mapping-store (localStorage) and
           * are appended to the append-only event log for full record transparency.
           *
           * Rendered in both hierarchy and legacy modes (independent of the
           * building/floor/room scene graph).
           */}
          <RoomMappingEditor3DLayer />

          {/*
           * Sub-AC 7d: Agent wiring & topology editor.
           *
           * TopologyEditorLayer renders agent-to-agent communication links as
           * animated bezier tubes and provides drag-to-connect interactions.
           * TopologyEditModeIndicator shows a floating 3D badge when wiring mode is on.
           * Rendered in both hierarchy and legacy modes (independent of scene graph).
           */}
          <TopologyEditorLayer />
          <TopologyEditModeIndicator />

          {/*
           * Sub-AC 7e: Global control-plane dashboard panel.
           *
           * Diegetic 3D wall-mounted overview panel at the building's north wall.
           * Shows system-wide state (active agents, error counts, throughput, CPU/MEM)
           * and a per-room status grid with click-to-drill navigation.
           * Rendered in both hierarchy and legacy modes (independent of scene graph).
           */}
          <GlobalDashboardPanel />

          {/*
           * Sub-AC 6a: Diegetic 3D metric display objects.
           *
           * Places all physically-present metric display objects across the building:
           *   - SystemHealthBeacon at the lobby (large diamond + ring indicators)
           *   - HolographicPanel × 2 on walls (control-plane + agent-ops metrics)
           *   - StatusPillar × 3 at west wall entrance (CPU / MEM / QUEUE bars)
           *   - FloatingMetricOrb per room at 'high' quality (room activity orbs)
           *
           * All objects are Three.js geometry-first (not HTML-only overlays),
           * encoding metric values through rotation, scale, arc-fill, and colour.
           * Performance-gated: heavy geometry disabled at 'medium'/'low' quality.
           */}
          <DiegeticMetricLayer />

          {/*
           * Sub-AC 6a: Low-poly 3D diegetic panel/screen mesh components.
           *
           * DisplaySurfacesLayer renders every display-surface furniture slot
           * across all rooms as a physically-present in-world object:
           *
           *   • Wall-mounted monitors   — bezel + canvas-texture screen + stand/bracket
           *   • Large wall panels       — frame + scan-lines + accent bar + mounts
           *   • Hologram stands         — octagonal base + column + rotating rings +
           *                              floating hologram panel
           *   • Floor kiosks (Sub-AC 6a)— octagonal base + hexagonal pedestal +
           *                              angled screen + keyboard ledge + status LEDs
           *
           * Each surface is interactive: hover raises screen emissive intensity;
           * click sets activeSurfaceId in spatial-store (appending surface.clicked
           * event for record transparency); active surfaces show a pulsing border +
           * DiegeticDetailPanel with contextual metrics.
           *
           * Canvas textures are drawn at per-surface refresh intervals (500ms-5000ms)
           * sourced from SURFACE_REFRESH_INTERVALS in data-source-config.ts.
           * Surfaces are deterministically placed from room furniture slot data.
           */}
          <DisplaySurfacesLayer />

          {/*
           * Sub-AC 6c: Hierarchical drill-down contextual metric panels.
           *
           * DrillContextPanelLayer renders a world-space Html panel that
           * progressively reveals enriched contextual metrics as the user
           * drills from building → floor → room → agent.
           *
           * The panel:
           *   - At building level: building overview (floors, aggregate agents)
           *   - At floor level: floor context (rooms, activity summary)
           *   - At room level: enriched room metrics (agent roster, gauges, capacity)
           *   - At agent level: enriched agent metrics (lifecycle, capabilities, task)
           *
           * Rendered in both hierarchy and legacy modes (independent of scene graph).
           * Positioned in 3D world-space at the drilled entity's world coordinates.
           */}
          <DrillContextPanelLayer />

          {/*
           * Sub-AC 9d: Replay pipeline visualization layer.
           *
           * Renders floating low-poly pipeline status panels above the building
           * during 3D scene replay.  Each panel encodes:
           *   - Pipeline name + current step
           *   - Progress bar (filled fraction = completed steps / total steps)
           *   - Step-rail dot indicators (active step glows cyan/green/red)
           *   - Status badge (RUNNING / COMPLETED / FAILED)
           *
           * Guard: renders nothing in live mode or when sceneState.pipelines
           * is empty.  Reads directly from useReplayControllerStore — no props.
           */}
          <ReplayPipelineLayer />

          {/*
           * Sub-AC 9.3: Diegetic 3D replay timeline visualization.
           *
           * ReplayDiegeticTimeline renders a physically-present low-poly
           * horizontal timeline bar above the building's north wall.
           *
           * Visual anatomy:
           *   - TrackRail:     flat horizontal bar (timeline axis) with glow
           *   - DensityBars:   vertical low-poly slabs encoding event density
           *   - ProgressFill:  colored slab that grows left→right with progress
           *   - PlayheadCursor: animated octahedron sliding along the track
           *   - LeftEndcap / RightEndcap: accent pillars at track boundaries
           *   - StatusBadge:   world-anchored Html label (time, play/pause)
           *
           * This makes the replay scrub position visible IN the 3D world
           * (diegetic), not just in the 2D ReplayControlPanel HUD overlay.
           *
           * Guard: renders nothing in live mode — zero overhead.
           * Reads: useReplayStore (progress, playing, ts) + useSceneEventLog
           */}
          <ReplayDiegeticTimeline />

          {/*
           * Sub-AC 7.2: Diegetic pipeline command panel.
           *
           * PipelineDiegeticLayer renders a world-anchored HTML pipeline
           * control terminal above the currently-drilled room.  The panel
           * shows the pipeline library filtered by the room's role, active
           * run step-rails, chain builder strip, and cancel buttons.
           *
           * Visibility: only when drillLevel === "room" && a room is drilled.
           * All interactions dispatch command files via usePipelineCommand.
           * Rendered in both hierarchy and legacy modes (independent of scene graph).
           */}
          <PipelineDiegeticLayer />

          {/* Bird's-eye center crosshair — visible only in bird's-eye mode */}
          <BirdsEyeViewport />

          {/*
           * Sub-AC 3.1: Bird's-eye ambient overlay.
           *
           * BirdsEyeOverlay provides the full suite of top-down labels and
           * stylized low-poly visual guides for the orthographic bird's-eye
           * camera mode:
           *   - FloorAmbientBanner: wide floor name + department label per floor
           *   - RoomCeilingCard: per-room type badge, name, agent count
           *   - RoomCeilingTile: translucent colored fill + outline at ceiling level
           *   - ActivityPulseRing: animated indicator on active / busy rooms
           *   - FloorSeparatorPlane: thin plane at the inter-floor boundary
           *   - BuildingCompass: N/S/E/W indicator at the NW corner
           *
           * Guard: renders nothing when cameraMode !== "birdsEye".
           * Rendered in both hierarchy and legacy modes (independent of scene graph).
           */}
          <BirdsEyeOverlay />

          {/*
           * Sub-AC 3b: Hierarchical LOD layer — bird's-eye altitude.
           *
           * BirdsEyeLODLayer renders four distinct hierarchy levels visible
           * and distinguishable from bird's-eye altitude (camera at Y ≥ 20):
           *
           *   Level 1 — Building footprint outline  (bright perimeter boundary)
           *   Level 2 — Office zone fills           (per-floor tinted planes)
           *   Level 3 — Room cell outlines + fills  (role-colored room bounds)
           *   Level 4 — Agent markers               (hexagonal discs per agent)
           *
           * Rendered at FLOOR level (Y ≈ floor * FLOOR_HEIGHT + 0.03) to
           * avoid conflict with BirdsEyeOverlay's ceiling-level annotations.
           *
           * Guard: renders nothing when cameraMode !== "birdsEye".
           * Rendered in both hierarchy and legacy modes (independent of scene graph).
           */}
          <BirdsEyeLODLayer />

          {/*
           * Sub-AC 3b: Clickable floor/room nodes — interaction layer.
           *
           * BirdsEyeClickableNodes renders transparent interactive planes over
           * each floor zone and room cell visible in the bird's-eye view.
           *
           * Interaction model:
           *   - Hover floor zone: translucent highlight + outline + tooltip badge
           *   - Click floor zone: zoom/pan bird's-eye to floor, then drill to
           *     floor-level perspective view (drillIntoFloor + setCameraMode)
           *   - Hover room cell: role-colored highlight + outline + tooltip badge
           *   - Click room cell: zoom/pan bird's-eye to room, then drill to
           *     room-level perspective view (drillIntoRoom + setCameraMode)
           *
           * Layer ordering (Y-space above BirdsEyeLODLayer, renderOrder 20-23):
           *   Floor zone planes:  Y = floor * FLOOR_HEIGHT + 0.06
           *   Room cell planes:   Y = room.position.y + 0.08  (above floor zones)
           *
           * Guard: renders nothing when cameraMode !== "birdsEye".
           * Placed after BirdsEyeLODLayer so the interaction layer is on top.
           */}
          <BirdsEyeClickableNodes />

          {/*
           * Sub-AC 5b: Bird's-eye floor-plane connector indicators.
           *
           * BirdsEyeConnectorLayer renders zoom-compensated task-agent mapping
           * indicators at floor level (Y = 0.14) specifically for the orthographic
           * bird's-eye camera.  Three visual elements per active connection:
           *
           *   1. Agent connection ring — hex ring at agent position, coloured by
           *      highest-priority task (distinguishes from BirdsEyeLODLayer markers)
           *
           *   2. Task disc — small circle at task orb's XZ floor projection
           *
           *   3. Flat plane connector — thin rectangle connecting disc to ring
           *      (uses plane geometry for guaranteed screen-space width, unlike
           *       WebGL gl.LINES which is always 1 px)
           *
           * Screen-space stability: all geometry is scaled by
           *   zoomScale = birdsEyeZoom / BIRDS_EYE_DEFAULT_ZOOM
           * so indicators maintain constant apparent size at every zoom level.
           *
           * Guard: renders nothing when cameraMode !== "birdsEye".
           * renderOrder: 5 (above BirdsEyeLODLayer's max renderOrder of 4).
           */}
          <BirdsEyeConnectorLayer />

          {/*
           * Sub-AC 1 (AC 15): Spatial index provider.
           *
           * SpatialIndexProvider runs use-spatial-index each frame inside the
           * Three.js render loop.  It samples the camera position, computes a
           * full SpatialIndexSnapshot for all agents (O(n log n), n ≤ 20), and
           * writes the result to spatial-index-store ONLY when the window
           * membership changes (dedup step prevents unnecessary re-renders).
           *
           * Consumers (HUD, stores, scene components) read the windowedSet and
           * lodMap from useSpatialIndexStore() — no props required.
           *
           * Renders nothing (returns null); pure side-effect component.
           * Placed last in the Suspense boundary to avoid interfering with
           * geometry render order.
           */}
          <SpatialIndexProvider />

          {/*
           * Sub-AC 2 (AC 15): View window provider.
           *
           * ViewWindowProvider runs useViewWindow each frame inside the Three.js
           * render loop.  It extracts the camera projection-view matrix, tests
           * every agent and task position against the camera frustum (6-plane
           * Gribb-Hartmann test), and writes the resulting ViewWindowSnapshot to
           * view-window-store ONLY when the visible entity set changes.
           *
           * Downstream consumers (AgentAvatarsLayer, TaskConnectorsLayer) read
           * snapshot.visibleIds from view-window-store and use it as a render
           * gate — entities not in visibleIds are hidden (visible=false) rather
           * than unmounted, preserving Three.js object identity.
           *
           * Renders nothing (returns null); pure side-effect component.
           * Placed after SpatialIndexProvider so both infra providers are together.
           */}
          <ViewWindowProvider />

          {/*
           * Sub-AC 3 (AC 15): spatial_index + task_group hierarchy integration.
           *
           * HierarchySpatialTaskLayer is the integration point between the
           * spatial_index infrastructure entity and the task_group infrastructure
           * entity.  It renders VirtualizedTaskOrbLayer panels only for agents
           * currently inside the spatial render window, ensuring:
           *
           *   - Only ≤ MAX_RENDER_WINDOW (12) agents receive task orb panels.
           *   - Each panel materialises ≤ AGENT_GROUP_WINDOW_SIZE (5) orbs.
           *   - Maximum task 3D geometry = 60 orbs regardless of task count (200+).
           *   - Combined per-frame CPU work < 2ms (O(n log n) spatial + O(window) pagination).
           *
           * Task groups are created by TaskGroupsBootstrap (mounted in App.tsx)
           * and looked up via TaskGroupsContext.  This component is purely
           * presentational — all writes go through task-group-store actions.
           *
           * Guard: renders nothing at 'low' quality or when no agents are in window.
           * Renders nothing (returns null); no geometry added when empty.
           */}
          <HierarchySpatialTaskLayer />
        </Suspense>
        </ScenePerformanceMonitor>
      </Canvas>

      {/*
       * Sub-AC 5.3: Task-agent mapping HUD — 2D screen-space overlay.
       *
       * Rendered OUTSIDE the Canvas so it is always pixel-crisp regardless of
       * camera zoom, LOD tier, or scene fog.  This guarantees task-agent
       * assignments remain the dominant visual signal at all zoom levels.
       *
       * z-index: 9999 (set inside TaskMappingHUD) places this above the Canvas
       * element.  pointer-events: none lets all 3D scene interactions pass through.
       */}
      <TaskMappingHUD />
    </div>
  );
}
