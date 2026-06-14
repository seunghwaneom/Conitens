export {
  BuildingShellLayer,
} from "./components/BuildingShellLayer.js";
export {
  CorridorLane,
} from "./components/CorridorLane.js";
export {
  CorridorLayer,
} from "./components/CorridorLayer.js";
export {
  DoorFrameLayer,
} from "./components/DoorFrameLayer.js";
export {
  FloorGrid,
  toFixtureStyle,
  toFurnitureSpriteStyle,
} from "./components/FloorGrid.js";
export {
  FloorMiniMap,
} from "./components/FloorMiniMap.js";
export {
  FloorplateLayer,
} from "./components/FloorplateLayer.js";
export {
  FloorViewport,
} from "./components/FloorViewport.js";
export {
  FocusedHandoffView,
} from "./components/FocusedHandoffView.js";
export {
  HandoffOverlay,
} from "./components/HandoffOverlay.js";
export {
  AgentLayer,
} from "./viewport/AgentLayer.js";
export {
  AgentActivityCue,
} from "./viewport/AgentActivityCue.js";
export {
  AgentSpeechBubble,
} from "./viewport/AgentSpeechBubble.js";
export {
  AgentSprite,
  resolveAgentSpriteId,
} from "./viewport/AgentSprite.js";
export {
  AgentStation,
} from "./viewport/AgentStation.js";
export {
  AGENT_STATIONS,
  getAgentStationsForRoom,
  mapStationRoleHint,
  type AgentFacing,
  type AgentStationSpec,
  type AgentVisualRole,
} from "./viewport/agentStations.js";
export {
  chooseAgentActivityCue,
  mapAgentToStation,
  mapAgentToVisualRole,
  mapAgentToVisualState,
  mapHandoffToActivityCue,
  mapTaskToActivityCue,
  type AgentActivityCueKind,
  type AgentActivityCueTone,
  type AgentActivityCue as AgentActivityCueModel,
  type AgentStationMatchOptions,
  type AgentVisualInput,
  type AgentVisualState,
} from "./viewport/agentVisualState.js";
export {
  OperationalOverlayLayer,
} from "./viewport/OperationalOverlayLayer.js";
export {
  PixelProp,
} from "./viewport/PixelProp.js";
export {
  PixelButton,
  PixelDivider,
  PixelFrame,
  PixelPanel,
  PixelThemeProvider,
  PixelTooltip,
  StatusPill,
  type PixelButtonProps,
  type PixelDividerProps,
  type PixelFrameProps,
  type PixelPanelProps,
  type PixelThemeProviderProps,
  type PixelTooltipProps,
  type StatusPillProps,
} from "./components/PixelPrimitives.js";
export {
  RoomDressingLayer,
} from "./viewport/RoomDressingLayer.js";
export {
  WallDetailLayer,
} from "./viewport/WallDetailLayer.js";
export {
  WorkstationLayer,
} from "./viewport/WorkstationLayer.js";
export {
  getOperationalPropSpecs,
  getRoomBlockedLaneSlot,
  getRoomDressingPropCounts,
  getRoomFloorPropSpecs,
  getRoomHandoffPort,
  getRoomTemplateCounts,
  getRoomTemplatePropSpecs,
  getWallPropSpecs,
  getWorkstationPropSpecs,
  resolveRoomTemplate,
  type RoomDressingCounts,
} from "./viewport/roomDressing.js";
export {
  REQUIRED_PIXEL_PROP_KINDS,
  ROOM_TEMPLATES,
  ROOM_TEMPLATE_IDS,
  ROOM_TEMPLATE_PROP_MINIMUMS,
  getRoomTemplate,
  type AgentSlotSpec,
  type DoorSpec,
  type HandoffPortSpec,
  type PixelPropKind,
  type PixelPropLayer,
  type PixelPropSpec,
  type PixelPropTone,
  type RoomTemplate,
  type RoomTemplateId,
  type RoomTemplateTheme,
  type TaskSlotSpec,
  type WorkstationSpec,
} from "./viewport/roomTemplates.js";
export {
  ALLOWED_PIXEL_COLORS,
  CHARACTER_H,
  CHARACTER_W,
  OUTLINE_PX,
  PROP_ANCHOR_RULE,
  ROOM_TILE_COLUMNS,
  ROOM_TILE_ROWS,
  SHADOW_PX,
  SPRITE_SCALE,
  TILE_PX,
  WALL_HEIGHT_TILES,
  comparePixelY,
  getPixelLayerIndex,
  snapPercentToRoomTile,
} from "./viewport/pixelSpriteGrammar.js";
export {
  CORRIDOR_HANDOFF_HUB_POINT,
  CORRIDOR_NODES,
  CORRIDOR_SPINE_CENTER_X,
  CORRIDOR_WIDTH_PERCENT,
  FLOOR_CORRIDOR_SEGMENTS,
  createDoorAlignedHandoffRoute,
  getBlockedLaneCorridorPoint,
  isPointInsideCorridor,
  type CorridorNodeKind,
  type CorridorNodeSpec,
  type CorridorSegmentAxis,
  type CorridorSegmentKind,
  type CorridorSegmentSpec,
  type DoorAlignedRouteInput,
} from "./viewport/corridorGraph.js";
export {
  SPATIAL_LENS_BUILDING_LAYOUT,
  type BuildingWallOrientation,
  type BuildingWallRole,
  type BuildingWallSegment,
  type FloorLayoutPoint,
  type FloorLayoutRect,
  type FloorplateZone,
  type FloorplateZoneTone,
  type SpatialLensBuildingLayout,
  type StructuralColumn,
} from "./viewport/floorLayout.js";
export {
  ROOM_DOOR_PLACEMENTS,
  getPrimaryRoomDoorPlacement,
  getRoomDoorPlacements,
  resolveRoomDoorPoint,
  type RoomDoorPlacement,
  type RoomDoorRole,
  type RoomDoorSide,
} from "./viewport/roomPlacement.js";
export {
  FLOOR_VIEWPORT_CAMERA_ZOOMS,
  createFloorViewportCameraFrame,
  type FloorViewportCameraMode,
  type FloorViewportCameraFrame,
} from "./viewport/viewportCamera.js";
export {
  PIXEL_STATUS_TOKENS,
  PIXEL_STATUS_TONES,
  PIXEL_THEME_TOKEN_NAMES,
  normalizePixelStatusTone,
  type PixelStatusToken,
  type PixelStatusTone,
} from "./tokens.js";
export {
  GeneratedSprite,
  toGeneratedSpriteStyle,
  type GeneratedSpriteProps,
} from "./assets/GeneratedSprite.js";
export {
  GENERATED_SPATIAL_LENS_ASSET_ROOT,
  GENERATED_SPATIAL_LENS_SOURCE_SPRITE_SHEET_SIZE,
  GENERATED_SPATIAL_LENS_SPRITE_SHEET,
  GENERATED_SPATIAL_LENS_SPRITE_SHEET_SIZE,
  GENERATED_SPATIAL_LENS_SPRITES,
  getGeneratedSpatialLensSpriteForPixelProp,
  resolveGeneratedSpatialLensSprite,
  validateGeneratedSpatialLensSprites,
  type GeneratedSpatialLensSpriteAnchor,
  type GeneratedSpatialLensSpriteAsset,
  type GeneratedSpatialLensSpriteKind,
  type GeneratedSpatialLensSpriteScale,
  type PixelPropSpriteRequest,
} from "./assets/generatedAssetManifest.js";
export {
  SPATIAL_LENS_ASSET_KINDS,
  SPATIAL_LENS_ASSET_MANIFEST,
  SPATIAL_LENS_CHARACTER_ASSETS,
  SPATIAL_LENS_FLOOR_ASSETS,
  SPATIAL_LENS_FURNITURE_ASSETS,
  SPATIAL_LENS_MANUAL_IMPORT_ROOT,
  SPATIAL_LENS_PLACEHOLDER_ASSETS,
  SPATIAL_LENS_PUBLIC_ASSET_ROOT,
  SPATIAL_LENS_WALL_ASSETS,
  getSpatialLensAssetIdsByKind,
  getSpatialLensAssetOrPlaceholder,
  getSpatialLensAssetsByKind,
  resolveSpatialLensAsset,
  validateSpatialLensAssetManifest,
  type SpatialLensAnchor,
  type SpatialLensAnimationFrame,
  type SpatialLensAssetKind,
  type SpatialLensAssetManifest,
  type SpatialLensCharacterAsset,
  type SpatialLensCharacterFacing,
  type SpatialLensCharacterRole,
  type SpatialLensCharacterState,
  type SpatialLensCssPlaceholder,
  type SpatialLensFloorAsset,
  type SpatialLensFloorSurface,
  type SpatialLensFurnitureAsset,
  type SpatialLensSpriteRect,
  type SpatialLensTileSize,
  type SpatialLensWallAsset,
  type SpatialLensWallOrientation,
} from "./assets/assetRegistry.js";
export {
  createFloorViewportBlockedMarkers,
  createFloorViewportHandoffRoutes,
  createFloorViewportModel,
  createFloorViewportRoom,
  getFloorAssetId,
  getFloorSurfaceForRoom,
  getFurnitureAssetId,
  getRoomOccupancyLabel,
  getRoomStatusTone,
  type FloorViewportBlockedLaneMarker,
  type FloorViewportCorridorLane,
  type FloorViewportFixture,
  type FloorViewportHandoffRoute,
  type FloorViewportModel,
  type FloorViewportPoint,
  type FloorViewportRect,
  type FloorViewportRoom,
} from "./model/floorGeometry.js";
export {
  createFocusedHandoffWorkbenchModel,
  type FocusedHandoffWorkbenchModel,
  type FocusedSpatialContext,
  type FocusedWorkbenchStep,
  type FocusedWorkbenchStepId,
  type FocusedWorkbenchTone,
} from "./model/focusedHandoffModel.js";
