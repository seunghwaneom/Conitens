export { BuildingShell } from "./BuildingShell.js";
export { FloorRooms, DynamicFloors, Room } from "./RoomGeometry.js";
export { Lighting } from "./Lighting.js";
export { CameraRig, CAMERA_PRESETS, type CameraPreset } from "./CameraRig.js";
export {
  BirdsEyeCamera,
  // Sub-AC 3a: pure constants for zoom/pan constraints (test + HUD reuse)
  BIRDS_EYE_MIN_ZOOM,
  BIRDS_EYE_MAX_ZOOM,
  BIRDS_EYE_ZOOM_STEP,
  BIRDS_EYE_KEY_ZOOM_STEP,
  BIRDS_EYE_DEFAULT_ZOOM,
  BIRDS_EYE_MAX_PAN,
  BIRDS_EYE_KEY_PAN_STEP,
  BIRDS_EYE_LERP_SPEED,
  BIRDS_EYE_CAMERA_HEIGHT,
  BIRDS_EYE_BUILDING_W,
  BIRDS_EYE_BUILDING_D,
  BIRDS_EYE_BUILDING_CENTER_X,
  BIRDS_EYE_BUILDING_CENTER_Z,
  // Sub-AC 3a: pure helper functions for testability
  clampBirdsEyeZoom,
  clampBirdsEyePan,
  defaultBirdsEyeView,
  pixelDeltaToWorld,
} from "./BirdsEyeCamera.js";
export {
  BirdsEyeOverlay,
  FLOOR_HEIGHT as BIRDS_EYE_FLOOR_HEIGHT,
  CEILING_OFFSET,
  FLOOR_DEPARTMENTS,
  ROOM_TYPE_DISPLAY,
  computeAgentsByRoom,
  computeFloorStats,
  type RoomFloorStats,
} from "./BirdsEyeOverlay.js";
export { CommandCenterScene } from "./CommandCenterScene.js";
export { AgentAvatar, RoomAgents, AgentAvatarsLayer } from "./AgentAvatar.js";
export {
  HierarchySceneGraph,
  BuildingNode,
  FloorNode,
  LODDebugOverlay,
} from "./SceneHierarchy.js";
export {
  // Sub-AC 6a: physical container components for in-world metrics
  DisplaySurfaceObject,
  DisplaySurfacesLayer,
  RoomDisplaySurfaces,
  buildDisplaySurfaceDefs,
  FURNITURE_TO_DISPLAY_KIND,
  type DisplaySurfaceKind,
  type DisplayFacing,
  type DisplayMountType,
  type DisplaySurfaceAnchor,
  type DisplaySurfaceDef,
} from "./DisplaySurfaces.js";
export {
  DiegeticDetailPanel,
  type DiegeticDetailPanelProps,
} from "./DiegeticDetailPanel.js";
export {
  RoomTypeMarker,
  RoomTypeLegend,
  getRoleVisualConfig,
  ROLE_VISUALS,
} from "./RoomTypeVisuals.js";
export {
  TaskConnectorsLayer,
  // Sub-AC 5b: exported constants for visual contract testing and external consumers
  VISIBLE_STATUSES,
  PRIORITY_COLOR,
  STATUS_BEAM_COLOR,
  PRIORITY_RANK,
  PRIORITY_LIGHT_INTENSITY,
  ORB_SIZE,
  ARC_LIFT,
  ORB_FLOAT_Y,
  ORB_SPREAD_RADIUS,
  AGENT_HEAD_Y_OFFSET,
  MAX_POINT_LIGHTS,
  RENDER_ORDER_ORB,
  RENDER_ORDER_BEAM,
  RENDER_ORDER_SCAN,
  // Sub-AC 5b: exported pure geometry helpers for unit testing
  computeOrbPositions,
  computeLightBudget,
  type OrbConnectionInput,
  type AgentTaskConnectionNodeProps,
  // Sub-AC 5c: LOD visibility — distance/zoom thresholds, scale clamps, pure functions
  CONNECTOR_LOD_CLOSE_DIST,
  CONNECTOR_LOD_MID_DIST,
  CONNECTOR_LOD_REFERENCE_DIST,
  CONNECTOR_LOD_REFERENCE_ZOOM,
  CONNECTOR_LOD_ORB_MIN_SCALE,
  CONNECTOR_LOD_ORB_MAX_SCALE,
  CONNECTOR_LOD_SEGMENTS_CLOSE,
  CONNECTOR_LOD_SEGMENTS_MID,
  CONNECTOR_LOD_SEGMENTS_FAR,
  computeConnectorLOD,
  getConnectorLODTier,
  type ConnectorLODParams,
  type ConnectorLODConfig,
} from "./TaskConnectors.js";
export { TaskMappingHUD } from "./TaskMappingHUD.js";
export {
  TopologyEditorLayer,
  TopologyEditModeIndicator,
  AgentTopologyBadge,
  useTopologyKeyboardShortcuts,
} from "./TopologyEditor.js";
export {
  AgentLifecyclePanel,
  getAvailableActions,
  REQUIRES_CONFIRM,
  type AgentLifecyclePanelProps,
} from "./AgentLifecyclePanel.js";
export {
  AgentCommandDispatch,
  type AgentCommandDispatchProps,
} from "./AgentCommandDispatch.js";
export {
  AgentMetricsBillboard,
  RoomMetricsBillboard,
  AGENT_BILLBOARD_Y,
  ROOM_BILLBOARD_Y,
} from "./MetricsBillboard.js";
export { GlobalDashboardPanel } from "./GlobalDashboardPanel.js";
export {
  ScenePerformanceMonitor,
  usePerformanceQuality,
  useDistanceCull,
  useFrameThrottle,
  type QualityLevel,
} from "./ScenePerformance.js";
export {
  // Core computation
  computeDistanceLOD,
  computeEffectiveLOD,
  // Drill relationship helpers
  getFloorDrillRelationship,
  getRoomDrillRelationship,
  getAgentDrillRelationship,
  // Aggregator
  computeFullDrillLODs,
  // Convenience accessors
  getAgentStatusDetail,
  getRoomMetadataDetail,
  getFloorMetadataDetail,
  getBuildingMetadataDetail,
  // Detail-layer constants
  AGENT_STATUS_DETAIL,
  ROOM_METADATA_DETAIL,
  FLOOR_METADATA_DETAIL,
  BUILDING_METADATA_DETAIL,
  // Config constants
  THRESHOLDS,
  LOD_RANK,
  DRILL_DEPTH,
  DRILL_PROMOTION,
  // Types
  type LODLevel as LodPolicyLevel,
  type DrillLevel as LodPolicyDrillLevel,
  type DrillRelationship,
  type AgentStatusDetail,
  type RoomMetadataDetail,
  type FloorMetadataDetail,
  type BuildingMetadataDetail,
  type DeepDrillLODs,
} from "./lod-drill-policy.js";
export {
  BatchedConnectorLines,
  type ConnectorLineDescriptor,
  // Sub-AC 5c: opacity floor constant for visibility guarantee verification
  DEFAULT_CURVE_SEGMENTS as BATCHED_DEFAULT_CURVE_SEGMENTS,
  DEFAULT_ARC_LIFT as BATCHED_DEFAULT_ARC_LIFT,
  DEFAULT_LINE_OPACITY_FLOOR,
} from "./BatchedConnectorLines.js";
export {
  DrillContextPanel,
  DrillContextPanelLayer,
  computeDrillPanelPosition,
} from "./DrillContextPanel.js";
export {
  FloatingMetricOrb,
  StatusPillar,
  MetricRingIndicator,
  SystemHealthBeacon,
  HolographicPanel,
  DiegeticMetricLayer,
  type FloatingMetricOrbProps,
  type StatusPillarProps,
  type MetricRingIndicatorProps,
  type SystemHealthBeaconProps,
  type HolographicPanelProps,
  type MetricRow,
  type MetricHealthLabel,
} from "./DiegeticMetricDisplay.js";
export {
  PipelineDiegeticPanel,
  PipelineDiegeticLayer,
  type PipelineDiegeticPanelProps,
} from "./PipelineDiegeticPanel.js";
export {
  RoomVolume,
  RoomsFromRegistry,
  VOLUME_STYLES,
} from "./RoomVolume.js";
export {
  // Sub-AC 3b: Clickable floor/room nodes in bird's-eye view (interaction layer)
  BirdsEyeClickableNodes,
  // Transition constants (exported for HUD consumers and tests)
  DRILL_TRANSITION_DELAY_MS,
  DRILL_FLOOR_ZOOM,
  DRILL_ROOM_ZOOM,
  // Hover opacity constants
  FLOOR_HOVER_FILL_OPACITY,
  FLOOR_HOVER_OUTLINE_OPACITY,
  ROOM_HOVER_FILL_OPACITY,
  ROOM_HOVER_OUTLINE_OPACITY,
  // Pure helper functions (testable, no React/Three.js)
  computeFloorPanTarget,
  computeRoomPanTarget,
} from "./BirdsEyeClickableNodes.js";
// ── Sub-AC 6a/6.2: dashboard_panel ui_fixture 3D renderer ────────────────────
export {
  DashboardPanelMesh,
  DashboardPanel,
  DashboardPanelLayer,
  BuildingDashboardPanels,
  // Constants (mesh geometry)
  SCREEN_Z_OFFSET,
  PANEL_WALL_Z_OFFSET,
  PANEL_PULSE_HZ,
  PANEL_ACTIVE_EMISSIVE_SCALE,
  PANEL_IDLE_EMISSIVE_SCALE,
  DASHBOARD_PANEL_RENDER_ORDER,
  // Sub-AC 6.2: scan-line constants (exported for headless testing)
  SCAN_LINE_STRIP_HEIGHT,
  SCAN_LINE_STRIP_GAP,
  // Sub-AC 6.2: pure renderer helpers (coordinate math, headless-testable)
  computeScanLineStripCount,
  computePanelPlacedPosition,
  computeScreenFacePosition,
  filterDashboardPanelFixtures,
  collectDashboardPanelRoomIds,
  // Types
  type DashboardPanelMeshProps,
  type DashboardPanelProps,
  type DashboardPanelLayerProps,
  type BuildingDashboardPanelsProps,
} from "./DashboardPanel.js";

// ── Sub-AC 6 / AC-6-Sub-3: Live data wiring for dashboard_panel surface ──────
export {
  // Components — wired to live orchestration state
  PanelMetricsOverlay,
  MetricsDashboardPanel,
  MetricsDashboardPanelLayer,
  BuildingMetricsDashboardPanels,
  // Pure-logic helpers — testable without React/Three.js
  formatEventRate,
  computeTaskStatusCounts,
  computePanelMetricsSummary,
  countTerminalTasks,
  shouldShowMetricsOverlay,
  partitionMetricsFixtures,
  countMetricsOverlayFixtures,
  // Constants
  PANEL_METRICS_DIST_FACTOR,
  EVENT_RATE_DISPLAY_MAX,
  // Types
  type PanelTaskStatusCounts,
  type PanelMetricsSummary,
  type MetricsDashboardPanelProps,
  type MetricsDashboardPanelLayerProps,
  type BuildingMetricsDashboardPanelsProps,
} from "./DashboardPanelMetrics.js";

export {
  // Sub-AC 3b: Hierarchical LOD layer for bird's-eye altitude
  BirdsEyeLODLayer,
  // Level-1 building footprint constants
  BLDG_FOOTPRINT_COLOR,
  BLDG_FOOTPRINT_OPACITY,
  // Level-2 office zone constants
  ZONE_FILL_OPACITY,
  ZONE_FILL_COLORS,
  // Level-3 room cell constants
  ROOM_CELL_FILL_OPACITY,
  ROOM_CELL_OUTLINE_OPACITY,
  // Level-4 agent marker constants
  AGENT_MARKER_BASE_RADIUS,
  AGENT_MARKER_ACTIVE_SCALE,
  AGENT_MARKER_OPACITY,
  // Pure helper functions (testable, no React/Three.js)
  computeZoneFillColor,
  computeAgentMarkerRadius,
} from "./BirdsEyeLODLayer.js";

export {
  // Sub-AC 5b/5c: Floor-plane task-connection indicators for bird's-eye mode
  BirdsEyeConnectorLayer,
  // Layout constants
  BIRDS_EYE_CONNECTOR_FLOOR_Y,
  BIRDS_EYE_CONNECTOR_SCALE_REF,
  BIRDS_EYE_AGENT_RING_INNER,
  BIRDS_EYE_AGENT_RING_OUTER,
  BIRDS_EYE_TASK_DISC_RADIUS,
  BIRDS_EYE_CONNECTOR_LINE_WIDTH,
  BIRDS_EYE_CONNECTOR_RENDER_ORDER,
  // Pure helpers (testable, no React/Three.js — screen-space scale + geometry)
  computeBirdsEyeZoomScale,
  computeConnectionAngle,
  computeConnectionLength,
} from "./BirdsEyeConnectorLayer.js";

export {
  // Sub-AC 3b: Zoom-level-driven LOD policy for bird's-eye mode
  // Zoom range constants
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_NEAR_THRESHOLD,
  ZOOM_MID_THRESHOLD,
  ZOOM_MID_POINT,
  ZOOM_LOD_THRESHOLDS,
  // Per-tier opacity tables
  ZOOM_HIERARCHY_OPACITIES,
  ZOOM_LABEL_VISIBILITY,
  // Core functions
  computeZoomLODLevel,
  computeHierarchyZoomOpacities,
  computeZoomLabelVisibility,
  computeBuildingLabelStyle,
  computeTierZoomOpacity,
  shouldRenderZoomTier,
  // Types
  type ZoomLODLevel,
  type HierarchyZoomOpacities,
  type ZoomLabelVisibility,
  type ZoomBuildingLabelStyle,
} from "./zoom-lod-policy.js";

// ── Sub-AC 6c: Diegetic interaction behaviors (hover→expand, click→detail) ────
export {
  // Components
  InteractiveDashboardPanel,
  InteractiveDashboardPanelLayer,
  // Pure-logic helpers (testable, no React/Three.js)
  computeExpandScale,
  lerpValue,
  computeDetailPanelOffset,
  shouldRevealDetailSection,
  computeHoverGlowMultiplier,
  buildDetailMetricRows,
  // Constants
  PANEL_EXPAND_FACTOR,
  PANEL_EXPAND_LERP_ALPHA,
  DETAIL_PANEL_FORWARD_OFFSET,
  DETAIL_PANEL_UP_OFFSET,
  DETAIL_PANEL_DIST_FACTOR,
  DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD,
  HOVER_GLOW_MULTIPLIER,
  // Types
  type InteractiveDashboardPanelProps,
  type InteractiveDashboardPanelLayerProps,
  type DetailMetricRow,
} from "./DashboardPanelInteraction.js";

// ── Sub-AC 10a/10b: Meeting gathering visual layer + stage config ─────────────
export {
  MeetingGatheringLayer,
  // Sub-AC 10b: exported pure helpers for stage indicator testing
  getMeetingStageConfig,
  buildStageProgressDots,
  // Constants
  STAGE_CONFIG,
  MEETING_STAGE_COUNT,
  // Types
  type MeetingStageConfig,
} from "./MeetingGatheringLayer.js";

// ── Sub-AC 4a: Building-layer interaction intent types, factories, and guards ─
export {
  // Discriminators
  BUILDING_INTENT_KINDS,
  BUILDING_INTENT_GUARDS,
  isBuildingInteractionIntentKind,
  // Factory functions (plain testable objects — no command pipeline dependency)
  makeBuildingClickedIntent,
  makeBuildingHoveredIntent,
  makeBuildingUnhoveredIntent,
  makeBuildingContextMenuIntent,
  // Type guards
  isBuildingClickedIntent,
  isBuildingHoveredIntent,
  isBuildingUnhoveredIntent,
  isBuildingContextMenuIntent,
  isBuildingInteractionIntent,
  // Types
  type BuildingInteractionIntentKind,
  type WorldPosition,
  type ScreenPosition,
  type BuildingClickedPayload,
  type BuildingHoveredPayload,
  type BuildingUnhoveredPayload,
  type BuildingContextMenuPayload,
  type BuildingClickedIntent,
  type BuildingHoveredIntent,
  type BuildingUnhoveredIntent,
  type BuildingContextMenuIntent,
  type BuildingInteractionIntent,
  type BuildingIntentPayloadMap,
} from "./building-interaction-intents.js";

// ── Sub-AC 4b: Room-layer interaction intent types, factories, and guards ─────
export {
  // Discriminators
  ROOM_INTENT_KINDS,
  ROOM_INTENT_GUARDS,
  isRoomInteractionIntentKind,
  // Factory functions (plain testable objects — no command pipeline dependency)
  makeRoomClickedIntent,
  makeRoomHoveredIntent,
  makeRoomUnhoveredIntent,
  makeRoomContextMenuIntent,
  // Type guards
  isRoomClickedIntent,
  isRoomHoveredIntent,
  isRoomUnhoveredIntent,
  isRoomContextMenuIntent,
  isRoomInteractionIntent,
  // Types
  type RoomInteractionIntentKind,
  type RoomTypeKind,
  type RoomWorldPosition,
  type RoomScreenPosition,
  type RoomClickedPayload,
  type RoomHoveredPayload,
  type RoomUnhoveredPayload,
  type RoomContextMenuPayload,
  type RoomClickedIntent,
  type RoomHoveredIntent,
  type RoomUnhoveredIntent,
  type RoomContextMenuIntent,
  type RoomInteractionIntent,
  type RoomIntentPayloadMap,
} from "./room-interaction-intents.js";

// ── Sub-AC 7a: Spatial UI fixture attachment system ───────────────────────────
export {
  // Interaction intent discriminators
  FIXTURE_INTENT_KINDS,
  FIXTURE_INTENT_GUARDS,
  isFixtureInteractionIntentKind,
  // SpatialFixtureKind helpers
  SPATIAL_FIXTURE_KINDS,
  SPATIAL_FIXTURE_KIND_SET,
  isSpatialFixtureKind,
  // Factory functions (plain testable objects — no command pipeline dependency)
  makeFixtureButtonClickedIntent,
  makeFixtureButtonHoveredIntent,
  makeFixtureButtonUnhoveredIntent,
  makeFixtureHandleDragStartIntent,
  makeFixtureHandleDragMoveIntent,
  makeFixtureHandleDragEndIntent,
  makeFixtureMenuAnchorOpenedIntent,
  makeFixtureMenuAnchorClosedIntent,
  // Type guards
  isFixtureButtonClickedIntent,
  isFixtureButtonHoveredIntent,
  isFixtureButtonUnhoveredIntent,
  isFixtureHandleDragStartIntent,
  isFixtureHandleDragMoveIntent,
  isFixtureHandleDragEndIntent,
  isFixtureMenuAnchorOpenedIntent,
  isFixtureMenuAnchorClosedIntent,
  isFixtureInteractionIntent,
  // Geometry helpers (no React/Three.js — unit testable)
  computeFixtureWorldPos,
  computeFixtureButtonOffset,
  extractScreenPosition,
  // Types
  type SpatialFixtureKind,
  type FixtureEntityType,
  type FixtureEntityRef,
  type FixtureWorldPosition,
  type FixtureScreenPosition,
  type FixtureButtonClickedPayload,
  type FixtureButtonHoveredPayload,
  type FixtureButtonUnhoveredPayload,
  type FixtureHandleDragStartPayload,
  type FixtureHandleDragMovePayload,
  type FixtureHandleDragEndPayload,
  type FixtureMenuAnchorOpenedPayload,
  type FixtureMenuAnchorClosedPayload,
  type FixtureButtonClickedIntent,
  type FixtureButtonHoveredIntent,
  type FixtureButtonUnhoveredIntent,
  type FixtureHandleDragStartIntent,
  type FixtureHandleDragMoveIntent,
  type FixtureHandleDragEndIntent,
  type FixtureMenuAnchorOpenedIntent,
  type FixtureMenuAnchorClosedIntent,
  type FixtureInteractionIntent,
  type FixtureInteractionIntentKind,
  type FixtureIntentPayloadMap,
} from "./fixture-interaction-intents.js";

export {
  // 3D React Three Fiber components
  FixtureButton,
  FixtureHandle,
  FixtureMenuAnchor,
  EntityFixtureSet,
  SpatialFixtureLayer,
  // Pure helpers (no React/Three.js — unit testable)
  computeEntityButtonBaseY,
  computeFixtureLocalOffset,
  computeFixtureEmissiveIntensity,
  // Constants
  SPATIAL_FIXTURE_RENDER_ORDER,
  FIXTURE_BUTTON_RADIUS,
  FIXTURE_BUTTON_SEGMENTS,
  FIXTURE_HANDLE_RADIUS,
  FIXTURE_MENU_ANCHOR_RADIUS,
  FIXTURE_IDLE_EMISSIVE,
  FIXTURE_HOVERED_EMISSIVE,
  FIXTURE_ACTIVE_EMISSIVE,
  FIXTURE_HOVER_LERP_ALPHA,
  FIXTURE_BUTTON_COLOR,
  FIXTURE_HANDLE_COLOR,
  FIXTURE_MENU_ANCHOR_COLOR,
  FIXTURE_BUTTON_SPACING,
  // Types
  type SpatialFixtureComponentKind,
  type SpatialFixtureDescriptor,
  type SpatialFixtureEntityEntry,
  type FixtureButtonProps,
  type FixtureHandleProps,
  type FixtureMenuAnchorProps,
  type EntityFixtureSetProps,
  type SpatialFixtureLayerProps,
} from "./SpatialUiFixture.js";

// ── Sub-AC 7b: Fixture interaction_intent production wiring ───────────────────
// Bridges FixtureInteractionIntent events (from SpatialUiFixture components)
// to canonical InteractionIntentEntity objects, capturing:
//   • affordance_id     — the fixtureId of the manipulated fixture
//   • manipulation_type — canonical gesture (click, drag, hover, unhover)
//   • target_entity_ref — the parent entity { entityType, entityId }
// This is the wiring layer between Sub-AC 7a (fixture components) and
// Sub-AC 4a (canonical dispatcher).
export {
  // Primary wiring function (call in onIntent handler or R3F scene provider)
  wireFixtureIntent,
  // Factory for reusable onIntent callback (suitable for SpatialFixtureLayer)
  createFixtureBridgeHandler,
  // Pure affordance-capture helper (no dispatcher required — testable in Node.js)
  extractAffordanceCapture,
  // Intent-kind → manipulation_type mapper (pure, exported for testing)
  fixtureIntentKindToManipulationType,
  // Membership constants
  FIXTURE_MANIPULATION_TYPES,
  FIXTURE_INTENT_KIND_TO_MANIPULATION,
  // Types
  type FixtureAffordanceCapture,
  type FixtureIntentBridgeResult,
} from "./fixture-intent-bridge.js";

// ── Sub-AC 4c: Agent-layer interaction intent types, factories, and guards ────
export {
  // Discriminators
  AGENT_INTENT_KINDS,
  AGENT_INTENT_GUARDS,
  isAgentInteractionIntentKind,
  // Factory functions (plain testable objects — no command pipeline dependency)
  makeAgentClickedIntent,
  makeAgentHoveredIntent,
  makeAgentUnhoveredIntent,
  makeAgentContextMenuIntent,
  // Type guards
  isAgentClickedIntent,
  isAgentHoveredIntent,
  isAgentUnhoveredIntent,
  isAgentContextMenuIntent,
  isAgentInteractionIntent,
  // Types
  type AgentInteractionIntentKind,
  type AgentWorldPosition,
  type AgentScreenPosition,
  type AgentInteractionModifiers,
  type AgentClickedPayload,
  type AgentHoveredPayload,
  type AgentUnhoveredPayload,
  type AgentContextMenuPayload,
  type AgentClickedIntent,
  type AgentHoveredIntent,
  type AgentUnhoveredIntent,
  type AgentContextMenuIntent,
  type AgentInteractionIntent,
  type AgentIntentPayloadMap,
} from "./agent-interaction-intents.js";

// ── Sub-AC 15b: Camera-frustum view_window subset selection ──────────────────
export {
  // Core provider component (Canvas-resident, no geometry)
  ViewWindowProvider,
  type ViewWindowProviderProps,
} from "./ViewWindowProvider.js";
export {
  // Pure computation (no React/Three.js — fully unit-testable)
  extractFrustumPlanes,
  testPointInFrustum,
  computeViewWindow,
  makeEmptyViewWindowSnapshot,
  // Constants
  VIEW_WINDOW_DEFAULT_MARGIN,
  VIEW_WINDOW_DEFAULT_PROXIMITY_RADIUS,
  VIEW_WINDOW_DEFAULT_MAX_DISTANCE,
  VIEW_WINDOW_DEFAULT_CONFIG,
  // Test helpers (exported for unit tests)
  makeOrthoPVMatrix,
  multiplyMat4,
  // Types
  type Vec3 as ViewWindowVec3,
  type FrustumPlane,
  type SixFrustumPlanes,
  type ViewWindowEntity,
  type ViewWindowClass,
  type ViewWindowConfig,
  type EntityViewResult,
  type ViewWindowSnapshot,
} from "./view-window.js";

// ── Sub-AC 7c: Task management control plane — ui_fixtures on task orbs ───────
export {
  // Top-level 3D layer component
  TaskOrbControlFixturesLayer,
  // Pure helpers (testable, no React/Three.js)
  computeTaskOrbWorldPos,
  buildTaskOrbEntries,
  // Constants
  TASK_ORB_FIXTURE_VISIBLE_STATUSES,
  TASK_ORB_FIXTURE_FLOAT_Y,
  TASK_ORB_FIXTURE_SPREAD_RADIUS,
  // Types
  type TaskOrbControlFixturesLayerProps,
} from "./TaskOrbControlFixtures.js";

// ── Sub-AC 7d: Room configuration control plane — ui_fixtures on room entities ─
export {
  // Top-level 3D layer component
  RoomConfigFixtureLayer,
  // Pure helpers (testable, no React/Three.js)
  computeRoomFixtureWorldPos,
  buildRoomConfigEntries,
  // Constants
  ROOM_CONFIG_FIXTURE_Y_OFFSET,
  FLOOR_HEIGHT_UNITS,
  // Types
  type RoomConfigFixtureLayerProps,
} from "./RoomConfigFixtureLayer.js";

// ── Sub-AC 8c: Diegetic 3D command-status indicator ───────────────────────────
export {
  // Main 3D component — mounts in scene at any entity's world position
  DiegeticCommandStatusIndicator,
  // Geometry constants
  INDICATOR_RING_RADIUS,
  INDICATOR_GEM_RADIUS,
  INDICATOR_FLOAT_Y,
  INDICATOR_CULL_DIST,
  // Types
  type DiegeticCommandStatusIndicatorProps,
  type IndicatorEntityType,
} from "./DiegeticCommandStatusIndicator.js";

// ── Sub-AC 9d: Replay-scene integration — 3D renderer wiring ─────────────────
export {
  // Diegetic 3D in-world timeline bar (renders above north wall in replay mode)
  ReplayDiegeticTimeline,
  // Pure helper: event-density histogram for timeline bars (testable, no React/Three.js)
  computeDensityBuckets,
} from "./ReplayDiegeticTimeline.js";

export {
  // 3D pipeline status panels rendered during replay (reads from controller store)
  ReplayPipelineLayer,
} from "./ReplayPipelineLayer.js";

// ── Sub-AC 4a: Canonical interaction_intent entity schema ─────────────────────
export {
  // Entity-type discriminants
  INTERACTION_TARGET_ENTITY_TYPES,
  isInteractionTargetEntityType,
  // Gesture-type discriminants
  INTERACTION_GESTURE_TYPES,
  isInteractionGestureType,
  // Layer discriminants
  INTERACTION_LAYERS,
  isInteractionLayer,
  // Factory (used by all three layers)
  makeInteractionIntentEntity,
  // Type guard
  isInteractionIntentEntity,
  // Canonical key helper
  extractCanonicalKey,
  // Types
  type InteractionTargetEntityType,
  type InteractionGestureType,
  type InteractionLayer,
  type InteractionIntentEntity,
  type InteractionIntentEntityInput,
  type CanonicalIntentKey,
} from "./interaction-intent-entity.js";

// ── Sub-AC 4a: Cross-layer emitter/dispatcher ─────────────────────────────────
export {
  // Per-layer normalizer functions (pure, no React/Three.js/DOM)
  normalizeBuildingIntent,
  normalizeRoomIntent,
  normalizeAgentIntent,
  normalizeAgentInstanceIntent,
  normalizeFixtureIntent,
  // Generic dispatch function (routes to correct normalizer by discriminator)
  dispatchIntent,
  // Dispatcher class (shared emitter, ring buffer, subscriber notifications)
  InteractionIntentDispatcher,
  createInteractionIntentDispatcher,
  // Types
  type NormalizableIntent,
  type InteractionIntentDispatcherOptions,
  type IntentSubscriber,
} from "./interaction-intent-dispatcher.js";

// ── Sub-AC 4b: Building layer 3D object event handlers ───────────────────────
// Pure, dependency-injectable handler functions that emit canonical
// interaction_intent entities with target_entity_type='building' for each
// gesture type (click, hover, unhover, context_menu).  No React/Three.js deps.
export {
  // Handler functions (pure — accept BuildingGestureEvent + context + dispatcher)
  handleBuildingClick,
  handleBuildingHover,
  handleBuildingUnhover,
  handleBuildingContextMenu,
  // Convenience keyed record
  BUILDING_LAYER_HANDLERS,
  // Types
  type BuildingGestureEvent,
  type BuildingHandlerContext,
  type BuildingHandlerResult,
  type BuildingLayerHandlerKey,
} from "./building-layer-handlers.js";

// ── Sub-AC 4c: Room layer 3D object event handlers ────────────────────────────
// Pure, dependency-injectable handler functions that emit canonical
// interaction_intent entities with target_entity_type='room' for each
// gesture type (click, hover, unhover, context_menu).  No React/Three.js deps.
// Propagation contract: every handler calls stopPropagation() to prevent
// bubbling to the BuildingShell group.
export {
  // Handler functions (pure — accept RoomGestureEvent + context + dispatcher)
  handleRoomClick,
  handleRoomHover,
  handleRoomUnhover,
  handleRoomContextMenu,
  // Convenience keyed record
  ROOM_LAYER_HANDLERS,
  // Types
  type RoomGestureEvent,
  type RoomHandlerContext,
  type RoomHandlerResult,
  type RoomLayerHandlerKey,
} from "./room-layer-handlers.js";

// ── Sub-AC 4d: Agent-instance layer 3D object event handlers ─────────────────
// Pure, dependency-injectable handler functions that emit canonical
// interaction_intent entities with target_entity_type='agent_instance' for each
// gesture type (click, hover, unhover, context_menu).  No React/Three.js deps.
// Propagation contract: click/hover/context_menu call stopPropagation() to
// prevent bubbling to parent RoomVolume / BuildingShell groups.
export {
  // Handler functions (pure — accept AgentInstanceGestureEvent + context + dispatcher)
  handleAgentInstanceClick,
  handleAgentInstanceHover,
  handleAgentInstanceUnhover,
  handleAgentInstanceContextMenu,
  // Convenience keyed record
  AGENT_INSTANCE_LAYER_HANDLERS,
  // Types
  type AgentInstanceGestureEvent,
  type AgentInstanceHandlerContext,
  type AgentInstanceHandlerResult,
  type AgentInstanceLayerHandlerKey,
} from "./agent-instance-layer-handlers.js";

// ── Sub-AC 5d: Scene pipeline order specification and ordering utilities ───────
// Defines the authoritative SCENE_PIPELINE_ORDER — the ordered list of all
// render pipeline slots in CommandCenterScene.tsx.  Used by the scene-graph
// ordering check (scene-graph-order-check.test.ts) to verify that mapping
// connectors are inserted IMMEDIATELY AFTER the agent-rendering block.
export {
  // Pipeline slot specification
  SCENE_PIPELINE_ORDER,
  OUTER_PIPELINE_SLOTS,
  // Derived indices
  AGENTS_SLOT_INDEX,
  CONNECTORS_SLOT_INDEX,
  // Invariant markers used by tests
  OUTER_AGENT_BLOCK_CLOSE_MARKER,
  FIRST_CONNECTOR_AFTER_AGENTS,
  // Spec validation
  validatePipelineOrderSpec,
  // Source analysis utilities
  extractJsxComponentsInRange,
  findFirstLine as scenePipelineFindFirstLine,
  findLastLine as scenePipelineFindLastLine,
  indexJsxComponents,
  // Types
  type PipelineSlotKind,
  type PipelineSlot,
} from "./scene-pipeline-order.js";

// ── Sub-AC 15c: 30fps performance benchmark harness ───────────────────────────
// Pure benchmark harness for validating the view_window culling pipeline under
// target load (20 agents, 200 tasks, 1800 frames).  All exports are pure
// (no React, no Three.js) and testable in Node.js without a WebGL context.
//
// Key exports:
//   runBenchmark()  — execute full benchmark for a given camera trajectory
//   simulateFrame() — single-frame pipeline measurement (timing + visibility)
//   formatBenchmarkReport() — human-readable summary for CI diagnostics
//
// Pass criteria:
//   mean pipeline  < 0.5 ms  (< 1.5% of 33.3 ms frame budget)
//   P99 pipeline   < 2.0 ms  (handles init spikes without dropped frames)
//   max pipeline   < 5.0 ms  (absolute spike cap at 15% of frame budget)
//   avg agents     ≤ 12      (window culling, not all 20 rendered)
//   materialised tasks ≤ 25  (task virtualisation active for 200 tasks)
export {
  // Benchmark runner
  runBenchmark,
  simulateFrame,
  // Data generators
  generateBenchmarkAgents,
  generateViewWindowEntities,
  generateCameraPositions,
  generateTaskVirtualizationInputs,
  makePVMatrix,
  // Statistics
  percentile,
  formatBenchmarkReport,
  // Configuration constants
  BENCHMARK_AGENT_COUNT,
  BENCHMARK_TASK_COUNT,
  BENCHMARK_FRAME_COUNT,
  FRAME_BUDGET_MS,
  CULLING_MEAN_BUDGET_MS,
  CULLING_P99_BUDGET_MS,
  CULLING_MAX_BUDGET_MS,
  TASK_WINDOW_SIZE,
  TOTAL_BENCHMARK_BUDGET_MS,
  // Types
  type CameraTrajectoryKind,
  type FrameMetrics,
  type BenchmarkResult,
} from "./render-performance-benchmark.js";

// ── Sub-AC 7c: Agent lifecycle command pipeline ───────────────────────────────
// Pure pipeline translating InteractionIntentEntity objects (target_entity_type
// = "agent_instance") into AgentLifecycleCommandEntity objects covering the
// three canonical lifecycle operations: start, stop, reassign.
//
// Key exports:
//   translateAgentInstanceIntentToCommand()  — single-intent pipeline function
//   translateAgentInstanceIntentBatch()      — batch pipeline helper
//   makeAgentLifecycleIntentPayload()        — factory for embedding lifecycle
//                                              operation data in source_payload
//   LIFECYCLE_OPERATION_TO_COMMAND_TYPE      — operation → protocol command type
//   resolveCommandType()                     — convenience resolver
//
// Command entity shape:
//   agent_id          — from entity.target_id
//   operation         — "start" | "stop" | "reassign"
//   operation_payload — typed sub-object (AgentStartPayload /
//                       AgentStopPayload / AgentReassignPayload)
//   source_intent_id  — back-reference to originating intent entity
export {
  // Core pipeline
  translateAgentInstanceIntentToCommand,
  translateAgentInstanceIntentBatch,
  // Factories
  makeAgentLifecycleIntentPayload,
  makeAgentLifecycleCommand,
  generateLifecycleCommandId,
  // Mapping
  LIFECYCLE_OPERATION_TO_COMMAND_TYPE,
  resolveCommandType,
  // Constants
  AGENT_LIFECYCLE_OPERATIONS,
  // Type guards
  isAgentLifecycleOperation,
  isAgentLifecycleCommandEntity,
  isAgentStartPayload,
  isAgentStopPayload,
  isAgentReassignPayload,
  // Types
  type AgentLifecycleOperation,
  type AgentStartPayload,
  type AgentStopPayload,
  type AgentReassignPayload,
  type AgentLifecycleOperationPayload,
  type AgentLifecycleCommandEntity,
  type AgentLifecycleIntentPayload,
} from "./agent-lifecycle-intent-command-pipeline.js";

// ── Sub-AC 7d: Task intent command pipeline ───────────────────────────────────
// Pure pipeline translating InteractionIntentEntity objects whose source_payload
// carries a `taskOperation` key into TaskCommandEntity objects covering the
// three canonical task operations: create, cancel, reprioritize.
//
// Key exports:
//   translateTaskIntentToCommand()   — single-intent pipeline function
//   translateTaskIntentBatch()       — batch pipeline helper
//   makeTaskIntentPayload()          — factory for embedding task operation data
//   TASK_OPERATION_TO_COMMAND_TYPE   — operation → protocol command type
//   resolveTaskCommandType()         — convenience resolver
//
// Command entity shape:
//   operation         — "create" | "cancel" | "reprioritize"
//   operation_payload — typed sub-object (TaskCreatePayload /
//                       TaskCancelPayload / TaskReprioritizePayload)
//   source_intent_id  — back-reference to originating intent entity
export {
  // Core pipeline
  translateTaskIntentToCommand,
  translateTaskIntentBatch,
  // Factories
  makeTaskIntentPayload,
  makeTaskCommand,
  generateTaskCommandId,
  // Mapping
  TASK_OPERATION_TO_COMMAND_TYPE,
  resolveTaskCommandType,
  // Constants
  TASK_OPERATIONS,
  TASK_PRIORITY_LEVELS,
  // Type guards
  isTaskOperation,
  isTaskCommandEntity,
  isTaskCreatePayload,
  isTaskCancelPayload,
  isTaskReprioritizePayload,
  isTaskPriorityLevel,
  // Types
  type TaskOperation,
  type TaskPriorityLevel,
  type TaskCreatePayload,
  type TaskCancelPayload,
  type TaskReprioritizePayload,
  type TaskOperationPayload,
  type TaskCommandEntity,
  type TaskIntentPayload,
} from "./task-intent-command-pipeline.js";

// ── Sub-AC 7d: Room configuration command pipeline ────────────────────────────
// Pure pipeline translating InteractionIntentEntity objects whose source_payload
// carries a `roomConfigOperation` key into RoomConfigCommandEntity objects
// covering four canonical room-configuration operations: rename, retype,
// set_capacity, set_occupancy_mode.
//
// Key exports:
//   translateRoomConfigIntentToCommand()  — single-intent pipeline function
//   translateRoomConfigIntentBatch()      — batch pipeline helper
//   makeRoomConfigIntentPayload()         — factory for embedding room config data
//   ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE — operation → protocol command type
//   resolveRoomConfigCommandType()        — convenience resolver
//
// Command entity shape:
//   room_id           — target room (from entity.target_id or payload.roomId)
//   operation         — "rename" | "retype" | "set_capacity" | "set_occupancy_mode"
//   operation_payload — typed sub-object (RoomRenamePayload / RoomRetypePayload /
//                       RoomSetCapacityPayload / RoomSetOccupancyModePayload)
//   source_intent_id  — back-reference to originating intent entity
export {
  // Core pipeline
  translateRoomConfigIntentToCommand,
  translateRoomConfigIntentBatch,
  // Factories
  makeRoomConfigIntentPayload,
  makeRoomConfigCommand,
  generateRoomConfigCommandId,
  // Mapping
  ROOM_CONFIG_OPERATION_TO_COMMAND_TYPE,
  resolveRoomConfigCommandType,
  // Constants
  ROOM_CONFIG_OPERATIONS,
  ROOM_TYPES,
  ROOM_OCCUPANCY_MODES,
  // Type guards
  isRoomConfigOperation,
  isRoomConfigCommandEntity,
  isRoomRenamePayload,
  isRoomRetypePayload,
  isRoomSetCapacityPayload,
  isRoomSetOccupancyModePayload,
  isRoomType,
  isRoomOccupancyMode,
  // Types
  type RoomConfigOperation,
  type RoomType,
  type RoomOccupancyMode,
  type RoomRenamePayload,
  type RoomRetypePayload,
  type RoomSetCapacityPayload,
  type RoomSetOccupancyModePayload,
  type RoomConfigOperationPayload,
  type RoomConfigCommandEntity,
  type RoomConfigIntentPayload,
} from "./room-config-command-pipeline.js";
