export {
  BUILDING,
  getRoomsForFloor,
  getRoomById,
  getAgentRoom,
  type BuildingDef,
  type FloorDef,
  type RoomDef,
  type RoomMeta,
  type RoomType,
  type CameraPreset,
  type RoomPositionHint,
  type Vec3,
  type DoorPosition,
  type WindowPosition,
  type FurnitureSlot,
} from "./building.js";

export {
  applyProceduralLayout,
  validateDistinctCells,
  formatPlacementEntry,
  NEEDS_PLACEMENT_SENTINEL,
  type ProceduralLayoutResult,
  type RoomPlacementEntry,
  type PlacementSource,
} from "./procedural-layout.js";

export {
  parseRoomYaml,
  parseBuildingYaml,
  buildFromYaml,
  fetchRoomConfigs,
  parseRoomMappingYaml,
} from "./room-loader.js";

export {
  DEFAULT_ROOM_MAPPING,
  resolveAgentRoom,
  resolveAllBuildingAssignments,
  getResolvedAgentRoom,
  getRolesForRoom,
  getMappedRoomIds,
  type AgentRole,
  type AgentDescriptor,
  type RoomResolution,
  type RoomMappingConfig,
} from "./room-mapping-resolver.js";

export {
  AGENTS,
  AGENT_MAP,
  getAgentDef,
  getAgentsForRoom,
  createDynamicAgentDef,
  AGENT_LIFECYCLE_TRANSITIONS,
  TERMINAL_LIFECYCLE_STATES,
  isValidLifecycleTransition,
  type AgentDef,
  type AgentRole as AgentPersonaRole,
  type AgentStatus,
  type AgentLifecycleState,
  type RiskClass,
} from "./agents.js";

export {
  ROOM_REGISTRY,
  buildRoomRegistry,
  getRoomMetadata,
  getRoomsByFloor,
  getRoomsByType,
  getRoomsForRole,
  getRoomForAgent,
  buildFloorIndex,
  buildTypeIndex,
  formatRoomSummary,
  getAllPositionHints,
  validateRoomRegistry,
  type RoomMetadataEntry,
  type RoomRegistry,
  type FloorRoomIndex,
  type TypeRoomIndex,
} from "./room-registry.js";

export {
  DEFAULT_BUILDING_HIERARCHY,
  buildHierarchy,
  getFloorNode,
  getRoomNode,
  getAgentsInRoomNode,
  getRoomForAgentId,
  getRoomsForAgentRole,
  flattenHierarchy,
  getAllAgentsInHierarchy,
  validateHierarchyConsistency,
  formatRoomNodeSummary,
  formatBuildingHierarchySummary,
  type AgentInRoom,
  type RoomHierarchyNode,
  type FloorHierarchyNode,
  type BuildingHierarchyNode,
  type HierarchyValidationResult,
} from "./room-agent-hierarchy.js";

// ── Sub-AC 6c: Data source configuration ──────────────────────────────────
export {
  SURFACE_REFRESH_INTERVALS,
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_WS_PORT,
  DEFAULT_WS_URL,
  DEFAULT_DATA_SOURCE_CONFIG,
  type DataSourceMode,
  type DataSourceConfig,
} from "./data-source-config.js";

// ── Sub-AC 2a: Agent seed dataset — initial positions + inactive state flags ──
export {
  AGENT_INITIAL_PLACEMENTS,
  AGENT_SEED_MAP,
  ROOM_SEED_MAP,
  getAgentSeed,
  getSeedForRoom,
  getSeedForFloor,
  getConfirmationRequiredSeeds,
  getAutoActivateSeeds,
  computeWorldFromLocal,
  validateSeedWorldPosition,
  formatSeedSummary,
  formatSeedDatasetSummary as formatAgentSeedDatasetSummary,
  type AgentInitialPosition,
  type AgentInactiveStateFlags,
  type AgentSeedRecord,
} from "./agent-seed.js";

// ── Sub-AC 12a: Versioned room mapping configuration schema ───────────────
export {
  ROOM_CONFIG_SCHEMA_VERSION,
  ROOM_CONFIG_TYPES,
  ROOM_CAMERA_PRESETS,
  DEFAULT_ROOM_CONFIG,
  initRoomConfig,
  getRoomConfig,
  resetRoomConfig,
  getRoomConfigEntry,
  getRoomConfigsForFloor,
  getRoomConfigsByType,
  getAdjacentRoomConfigs,
  buildRoomConfigIndex,
  getCorridorAccessibleRooms,
  validateRoomConfig,
  type RoomConfigType,
  type RoomCameraPreset,
  type RoomHierarchyPosition,
  type RoomPlacementMetadata,
  type RoomConfigEntry,
  type VersionedRoomMappingConfig,
  type RoomConfigValidationResult,
} from "./room-config-schema.js";

// ── Sub-AC 5a: Task seed dataset — initial mock tasks for offline/demo mode ──
export {
  TASK_INITIAL_DATASET,
  TASK_SEED_MAP,
  SEED_AGENT_IDS,
  SEED_TASK_IDS,
  SEED_TASK_COUNT,
  getSeedTask,
  getSeedTasksForAgent,
  getSeedTasksByStatus,
  getSeedSubTasks,
  getSeedStatusSummary,
  getSeedPrioritySummary,
  formatSeedDatasetSummary,
} from "./task-seed.js";

// ── Sub-AC 5a: task_agent_mapping ontology entity — renderer-consumable mapping records ──
export {
  // Visibility predicate (canonical source of truth)
  SCENE_VISIBLE_STATUSES,

  // Visual constants
  TASK_STATUS_BEAM_COLOR,
  TASK_PRIORITY_LIGHT_INTENSITY,
  MAX_CONNECTOR_POINT_LIGHTS,
  MAPPING_PRIORITY_RANK,

  // Builder / query functions
  buildMappingEntity,
  buildAllMappingEntities,
  getVisibleMappingEntities,
  getMappingEntitiesForAgent,
  getMappingEntityForTask,
  partitionMappingEntities,
  allocatePointLightBudget,
  compareMappingEntitiesByUrgency,

  // Debug helpers
  formatMappingEntitySummary,
  formatMappingEntitiesSummary,

  // Types
  type TaskAgentMappingEntity,
} from "./task-agent-mapping.js";

// ── Sub-AC 5.1: Task-agent mapping data model ──────────────────────────────
// ── Sub-AC 15b: Scalable task storage types ────────────────────────────────
export {
  TASK_STATES,
  TERMINAL_TASK_STATES,
  ACTIVE_TASK_STATES,
  VALID_TASK_TRANSITIONS,
  TASK_PRIORITY_WEIGHT,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_COLOR,
  canTaskTransition,
  isTaskTerminal,
  isTaskActive,
  type TaskPriority,
  type TaskStatus,
  type TaskRecord,
  type TaskAgentAssignment,
  type TaskStoreEvent,
  type TaskStoreEventType,
  type CreateTaskInput,
  type TaskFilter,
  type TaskPage,
} from "./task-types.js";

// ── Sub-AC 12a (Sub-AC 2): Runtime room mapping model — deviation detection ──
export {
  computeAssignments,
  getDefaultAssignments,
  detectDeviations,
  buildRoomMappingSnapshot,
  getAssignmentsForRoom,
  getDeviationsForRoom,
  getAssignmentForRole,
  getAssignmentForCapability,
  getRoleAssignments,
  getCapabilityAssignments,
  type AssignmentKind,
  type RoomAssignmentEntry,
  type MappingDeviation,
  type RoomMappingSnapshot,
} from "./room-mapping-model.js";

// ── Sub-AC 6a: ui_fixture entity type registry — dashboard_panel and friends ──
export {
  UI_FIXTURE_TYPES,
  UI_FIXTURE_TYPE_SET,
  DEFAULT_UI_FIXTURES,
  UI_FIXTURE_MAP,
  isUiFixtureType,
  facingToRotY,
  defaultDashboardPanelVisual,
  getUiFixture,
  getFixturesForRoom,
  getFixturesByType,
  getDashboardPanels,
  validateUiFixtureRegistry,
  computeFixtureWorldPosition,
  computeFixtureWorldRotation,
  computeBezelThickness,
  computeScreenDimensions,
  type UiFixtureType,
  type UiFixtureTransform,
  type UiFixtureDef,
  type DashboardPanelVisualConfig,
} from "./ui-fixture-registry.js";

// ── Sub-AC 12 (Sub-AC 1): Default room-to-office mapping — all three ontology levels ──
export {
  ROOM_OFFICE_MAPPING_SCHEMA_VERSION,
  ONTOLOGY_LEVELS,
  KNOWN_ROOM_IDS,
  DEFAULT_ROOM_OFFICE_MAPPING,
  initRoomOfficeMapping,
  getRoomOfficeMapping,
  resetRoomOfficeMapping,
  validateRoomOfficeMapping,
  getMappingsForRoom,
  getMappingsByLevel,
  getMappingsByCategory,
  getEntityMapping,
  getDefaultRoomForEntity,
  buildEntityIndex,
  buildRoomIndex,
  getBehavioralContract,
  getCrossRoomEntities,
  formatRoomOccupancySummary,
  type OntologyLevel,
  type DomainEntityCategory,
  type InfrastructureEntityCategory,
  type MetaEntityCategory,
  type EntityCategory,
  type AssignmentSource,
  type BehavioralContract,
  type EntityRoomMapping,
  type RoomOfficeMappingConfig,
  type RoomOfficeMappingValidationResult,
} from "./defaults/room-office-mapping.js";

// ── Sub-AC 15a: Data-model scale support ──────────────────────────────────
export {
  // Scale bound constants
  AGENT_REGISTRY_MIN,
  AGENT_REGISTRY_MAX,
  TASK_REGISTRY_MAX,
  MAX_TASKS_PER_AGENT,

  // Validation functions
  validateAgentRegistryScale,
  validateTaskRegistryScale,
  checkSceneGraphIntegrity,

  // Stress-test generators (used by scale tests + offline seed)
  generateScaleAgentIds,
  generateScaleAgentDefs,
  generateScaleTasks,
  generateScaleAssignments,
  generateScaleAgentTaskIndex,

  // Summary helpers
  formatScaleValidationSummary,

  // Types
  type AgentScaleValidationResult,
  type TaskScaleValidationResult,
  type SceneGraphIntegrityResult,
} from "./agent-task-scale.js";

// ── Sub-AC 7a: Entity affordance definitions ───────────────────────────────
export {
  // AffordanceKind discriminator
  AFFORDANCE_KINDS,
  AFFORDANCE_KIND_SET,
  isAffordanceKind,
  // ControllableEntityType discriminator
  CONTROLLABLE_ENTITY_TYPES,
  CONTROLLABLE_ENTITY_TYPE_SET,
  isControllableEntityType,
  // Spatial constants
  AFFORDANCE_Y_BASE_BY_ENTITY_TYPE,
  AFFORDANCE_BUTTON_SPACING,
  // ID builder functions
  agentAffordanceId,
  agentMenuAnchorId,
  agentHandleId,
  taskAffordanceId,
  taskMenuAnchorId,
  roomAffordanceId,
  roomMenuAnchorId,
  // Per-entity-type builder functions (core Sub-AC 7a)
  buildAgentAffordances,
  buildTaskAffordances,
  buildRoomAffordances,
  resolveAgentPrimaryAction,
  // World-position geometry
  computeAffordanceWorldPos,
  // Validation helpers
  validateControlAffordance,
  validateAffordanceList,
  // Prototype tables
  AGENT_AFFORDANCE_PROTOTYPES,
  TASK_AFFORDANCE_PROTOTYPES,
  ROOM_AFFORDANCE_PROTOTYPES,
  ALL_PROTOTYPE_AFFORDANCES,
  getPrototypeAffordancesFor,
  getAffordancesForEntity,
  // Types
  type AffordanceKind,
  type ControllableEntityType,
  type AffordanceLocalOffset,
  type ControlAffordance,
  type AffordanceWorldPosition,
} from "./entity-affordance-defs.js";

// ── Sub-AC 8b: Command-file pipeline entity ──────────────────────────────────
export {
  // State machine constants
  VALID_PIPELINE_TRANSITIONS,
  TERMINAL_PIPELINE_STATES,
  // State machine helpers
  canPipelineTransition,
  mapEventTypeToStatus,
  // Entity factories
  makePipelineEntity,
  advancePipelineEntity,
  // Watcher class + factory
  CommandFilePipelineWatcher,
  createCommandFilePipelineWatcher,
  // Types
  type CommandFilePipelineStatus,
  type CommandFilePipelineEntity,
  type PipelineTransitionRecord,
  type CommandPipelineEvent,
  type PipelineTransitionCallback,
} from "./command-file-pipeline.js";
