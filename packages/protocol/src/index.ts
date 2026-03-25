export { SCHEMA_VERSION, type SchemaVersion } from "./schema-version.js";
export {
  EVENT_TYPES, type EventType, EVENT_TYPE_SET,
  isValidEventType, type ActorKind, type Actor,
  type ConitensEvent, OBSOLETE_ALIASES, resolveAlias,
  type AgentMovedPayload, type AgentAssignedPayload,
  type AgentStatusChangedPayload, type AgentTaskStartedPayload,
  type AgentTaskCompletedPayload, type AgentEventPayloadMap,
} from "./event.js";
export {
  TASK_STATES, type TaskState, TERMINAL_STATES, VALID_TRANSITIONS,
  canTransition, isTerminal,
  HANDOFF_STATES, type HandoffState, VALID_HANDOFF_TRANSITIONS,
  canHandoffTransition,
} from "./task-state.js";
export {
  PLANES, type Plane, type PathClass,
  classifyPath, PATHS, isReplayRelevant,
} from "./paths.js";
export {
  type ReducerName, type ReducerDescriptor,
  REDUCERS, findOwner,
} from "./ownership.js";
export {
  type RiskLevel, type ApprovalAction, type ApprovalResult,
  computeSubjectHash, verifySubjectHash,
  HIGH_RISK_SHELL_PATTERNS, isHighRiskCommand,
} from "./approval.js";
export {
  type ChannelType, DEFAULT_DEDUPE_TTL_MS,
  makeIdempotencyKey, type DedupeStore,
} from "./dedupe.js";
export {
  type RedactionPattern, type RedactionResult,
  DEFAULT_PATTERNS, redactString, redactPayload,
} from "./redaction.js";
export {
  type AgentRole, type RoleRoomMapping, type CapabilityFallback,
  type SpecialAssignment, type RoomMappingConfig,
  type AgentDescriptor, type RoomResolution,
  DEFAULT_ROOM_MAPPING, KNOWN_ROLES, isKnownRole,
  resolveAgentRoom, resolveAllAgentRooms,
  getMappedRoomIds, getRolesForRoom,
} from "./room-mapping.js";
export {
  LAYOUT_EVENT_TYPES, type LayoutEventType, LAYOUT_EVENT_TYPE_SET,
  isLayoutEventType,
  type Vec3, type LayoutNodeType,
  // layout.init — spatial bootstrapping (Sub-AC 1)
  type LayoutInitSource,
  type RoomInitNode, type AgentInitNode, type FixtureInitNode,
  type LayoutInitPayload,
  isLayoutInitPayload,
  // layout.update (INITIATED) / layout.updated (COMPLETED) / layout.deleted
  type LayoutUpdatePayload,
  type LayoutCreatedPayload, type LayoutUpdatedPayload, type LayoutDeletedPayload,
  type LayoutNodeMovedPayload,
  type LayoutResetPayload, type LayoutSavedPayload,
  type LayoutLoadedPayload, type LayoutChangedPayload,
  type LayoutEventPayloadMap,
  isLayoutUpdatePayload,
  isLayoutCreatedPayload, isLayoutUpdatedPayload, isLayoutDeletedPayload,
  isLayoutNodeMovedPayload,
  isLayoutResetPayload, isLayoutSavedPayload,
  isLayoutLoadedPayload, isLayoutChangedPayload,
  LAYOUT_PAYLOAD_GUARDS, isValidLayoutPayload,
} from "./layout.js";
export {
  MEETING_EVENT_TYPES, type MeetingEventType, MEETING_EVENT_TYPE_SET,
  isMeetingEventType,
  type MeetingParticipantKind, type MeetingOutcome, type MeetingLeaveReason,
  // meeting.scheduled (Sub-AC 1)
  type MeetingScheduledPayload,
  type MeetingStartedPayload, type MeetingEndedPayload,
  type MeetingParticipantJoinedPayload, type MeetingParticipantLeftPayload,
  // meeting.deliberation / meeting.resolved — protocol phase events (Sub-AC 10d)
  type MeetingDeliberationPayload, type MeetingResolvedPayload,
  // meeting.task.spawned — task provenance event (Sub-AC 2 / Sub-AC 10c)
  type MeetingTaskSpawnedPayload,
  // meeting.cancelled / meeting.rescheduled — lifecycle control events (Sub-AC 2)
  type MeetingCancelledPayload, type MeetingRescheduledPayload,
  type MeetingEventPayloadMap,
  isMeetingScheduledPayload,
  isMeetingStartedPayload, isMeetingEndedPayload,
  isMeetingParticipantJoinedPayload, isMeetingParticipantLeftPayload,
  isMeetingDeliberationPayload, isMeetingResolvedPayload,
  isMeetingTaskSpawnedPayload,
  // Type guards — lifecycle control events (Sub-AC 2)
  isMeetingCancelledPayload, isMeetingRescheduledPayload,
  MEETING_PAYLOAD_GUARDS, isValidMeetingPayload,
} from "./meeting.js";
export {
  // Protocol stage state machine — Sub-AC 10a
  MEETING_STAGES, type MeetingStage, MEETING_STAGE_SET,
  isMeetingStage,
  VALID_MEETING_STAGE_TRANSITIONS,
  canMeetingStageTransition, isMeetingStageTerminal,
  // Meeting high-level status
  type MeetingStatus,
  STAGE_TO_STATUS,
  // Spawned task (output of the resolve stage)
  type SpawnedTaskStatus,
  type SpawnedTask,
  // Protocol artefacts
  type ProtocolDecision,
  type ProtocolResolution,
  // Participant
  type MeetingParticipant,
  // Meeting domain entity — Sub-AC 10.1: includes protocol_phase, participant_agent_ids,
  // gather_coordinates (Vec3|null), and spawned_task_ids per the entity schema contract
  type Meeting,
  type CreateMeetingInput,
  // Factory & reducer
  createMeeting,
  applyMeetingEvent,
  projectMeetingFromEvents,
  // Stage advancement helpers
  advanceMeetingStage,
  // Spawned-task helpers
  appendSpawnedTask,
  updateSpawnedTaskStatus,
  // Type guards
  isMeeting, isSpawnedTask,
} from "./meeting-state.js";
export {
  // Meeting entity schema — Sub-AC 10.1: formal descriptor registered in the ontology
  MEETING_ENTITY_SCHEMA_ID,
  MEETING_ENTITY_SCHEMA_VERSION,
  MEETING_PROTOCOL_PHASES,
  type MeetingProtocolPhase,
  MEETING_PROTOCOL_PHASE_SET,
  isMeetingProtocolPhase,
  type MeetingEntityFieldDef,
  type MeetingEntitySchemaDef,
  MEETING_ENTITY_SCHEMA,
  isMeetingEntitySchemaDef,
} from "./meeting-entity-schema.js";
export {
  // Command-file schema — GUI → Orchestrator command pipeline (Sub-AC 8a)
  GUI_COMMAND_TYPES, type GuiCommandType, GUI_COMMAND_TYPE_SET,
  isGuiCommandType,
  type CommandFileStatus, COMMAND_FILE_INITIAL_STATUS,
  type CommandFile, type CommandActor,
  type TypedCommandFile,
  // Agent lifecycle command payloads
  type AgentSpawnCommandPayload, type AgentTerminateCommandPayload,
  type AgentRestartCommandPayload, type AgentPauseCommandPayload,
  type AgentResumeCommandPayload, type AgentAssignCommandPayload,
  type AgentSendCommandPayload, type AgentTerminationReasonCode,
  // Task operation command payloads
  type TaskCreateCommandPayload, type TaskAssignCommandPayload,
  type TaskCancelCommandPayload, type TaskUpdateSpecCommandPayload,
  // Meeting command payload
  type MeetingConveneCommandPayload,
  // Navigation command payloads
  type DrillTargetLevel,
  type NavDrillDownCommandPayload, type NavDrillUpCommandPayload,
  type NavCameraPresetCommandPayload, type NavFocusEntityCommandPayload,
  // Config command payloads
  type ConfigRoomMappingCommandPayload, type ConfigAgentPersonaCommandPayload,
  type ConfigBuildingLayoutCommandPayload,
  // Pipeline operation command payloads (Sub-AC 7.2)
  type PipelineTriggerCommandPayload, type PipelineChainCommandPayload,
  type PipelineCancelCommandPayload,
  // Discriminated payload map
  type GuiCommandPayloadMap,
  // Constants & helpers
  DEFAULT_GUI_ACTOR, COMMAND_INBOX_DIR, COMMAND_FILE_PREFIX,
  COMMAND_TO_EVENT_TYPE,
  ORCHESTRATOR_COMMAND_TYPES, NAVIGATION_COMMAND_TYPES,
  isCommandFile,
} from "./command-file.js";
export {
  // Command EventType subset & guards (RFC-1.0.1 §4 Sub-AC 2)
  COMMAND_EVENT_TYPES, type CommandEventType, COMMAND_EVENT_TYPE_SET,
  isCommandEventType,
  // Pipeline EventType subset & guards (RFC-1.0.1 §4 Sub-AC 2)
  PIPELINE_EVENT_TYPES, type PipelineEventType, PIPELINE_EVENT_TYPE_SET,
  isPipelineEventType,
  // Shared primitive types
  type CommandSource, type PipelineStepStatus,
  // Command payload interfaces — core lifecycle
  type CommandIssuedPayload, type CommandAcknowledgedPayload,
  type CommandCompletedPayload,
  type CommandFailedPayload, type CommandRejectedPayload,
  // Command payload interfaces — control-plane dispatching (Sub-AC 16b)
  type CommandDispatchedPayload, type CommandQueuedPayload,
  type CommandRetriedPayload, type CommandTimeoutPayload,
  type CommandCancelledPayload, type CommandEscalatedPayload,
  // Command payload interfaces — generic state transition catch-all (Sub-AC 4)
  type CommandStateChangedPayload,
  // Pipeline payload interfaces — core
  type PipelineStartedPayload, type PipelineStepPayload,
  type PipelineStageCompletedPayload, type PipelineCompletedPayload,
  type PipelineFailedPayload, type PipelineCancelledPayload,
  // Pipeline payload interfaces — stage transitions & task routing (Sub-AC 16c)
  type PipelineStageStartedPayload, type PipelineStageFailedPayload,
  type PipelineTaskRoutedPayload,
  // Discriminated payload maps
  type CommandEventPayloadMap, type PipelineEventPayloadMap,
  // Command type guards — core lifecycle
  isCommandIssuedPayload, isCommandAcknowledgedPayload,
  isCommandCompletedPayload,
  isCommandFailedPayload, isCommandRejectedPayload,
  // Command type guards — control-plane dispatching (Sub-AC 16b)
  isCommandDispatchedPayload, isCommandQueuedPayload,
  isCommandRetriedPayload, isCommandTimeoutPayload,
  isCommandCancelledPayload, isCommandEscalatedPayload,
  // Command type guards — generic state transition catch-all (Sub-AC 4)
  isCommandStateChangedPayload,
  // Pipeline type guards — core
  isPipelineStartedPayload, isPipelineStepPayload,
  isPipelineStageCompletedPayload,
  isPipelineCompletedPayload, isPipelineFailedPayload,
  isPipelineCancelledPayload,
  // Pipeline type guards — stage transitions & task routing (Sub-AC 16c)
  isPipelineStageStartedPayload, isPipelineStageFailedPayload,
  isPipelineTaskRoutedPayload,
  // Payload discriminator maps & generic validators
  COMMAND_PAYLOAD_GUARDS, isValidCommandPayload,
  PIPELINE_PAYLOAD_GUARDS, isValidPipelinePayload,
} from "./command-pipeline.js";
export {
  // EventType subset & guards
  AGENT_EVENT_TYPES, type AgentEventType, AGENT_EVENT_TYPE_SET,
  isAgentEventType,
  // Domain types
  type AgentStatus, type AgentLifecycleState, type AgentLifecycleTrigger,
  type AgentTerminationReason,
  // Health monitoring types (Sub-AC 2)
  type AgentHealthStatus,
  // Lifecycle state machine
  VALID_AGENT_LIFECYCLE_TRANSITIONS,
  canAgentLifecycleTransition, isTerminalLifecycleState,
  // Core lifecycle payload interfaces
  type AgentSpawnedPayload, type AgentHeartbeatPayload,
  type AgentErrorPayload, type AgentTerminatedPayload,
  // Extended lifecycle payload interfaces (Sub-AC 2)
  type AgentMigratedPayload, type AgentLifecycleChangedPayload,
  // Idle state payload interface (Sub-AC 2)
  type AgentIdlePayload,
  // Health monitoring payload interface (Sub-AC 2)
  type AgentHealthChangedPayload,
  // Explicit lifecycle operation payload interfaces (Sub-AC 16b)
  type AgentSpawnRequestedPayload,
  type AgentPausedPayload, type AgentResumedPayload,
  type AgentSuspendedPayload,
  type AgentRetireRequestedPayload, type AgentRetiredPayload,
  type AgentMigrationRequestedPayload,
  // Comprehensive payload map
  type AllAgentEventPayloadMap,
  // Type guards — core lifecycle
  isAgentSpawnedPayload, isAgentHeartbeatPayload,
  isAgentErrorPayload, isAgentTerminatedPayload,
  // Type guards — extended lifecycle (Sub-AC 2)
  isAgentMigratedPayload, isAgentLifecycleChangedPayload,
  // Type guards — idle state (Sub-AC 2)
  isAgentIdlePayload,
  // Type guards — health monitoring (Sub-AC 2)
  isAgentHealthChangedPayload,
  // Type guards — spatial & assignment (re-exported for unified API)
  isAgentMovedPayload, isAgentAssignedPayload,
  isAgentStatusChangedPayload, isAgentTaskStartedPayload,
  isAgentTaskCompletedPayload,
  // Type guards — explicit lifecycle operation events (Sub-AC 16b)
  isAgentSpawnRequestedPayload,
  isAgentPausedPayload, isAgentResumedPayload,
  isAgentSuspendedPayload,
  isAgentRetireRequestedPayload, isAgentRetiredPayload,
  isAgentMigrationRequestedPayload,
  // Extended state/lifecycle payload interfaces (Sub-AC 2 additions)
  type AgentCapabilityChangedPayload,
  type AgentPersonaUpdatedPayload,
  // Type guards — extended state/lifecycle events (Sub-AC 2 additions)
  isAgentCapabilityChangedPayload,
  isAgentPersonaUpdatedPayload,
  // Discriminator map & generic validator
  AGENT_PAYLOAD_GUARDS, isValidAgentPayload,
} from "./agent-lifecycle.js";
export {
  // Room registry — typed models for .agent/rooms/*.yaml (Sub-AC 1)
  ROOM_TYPES, type RoomType,
  type SummaryMode, type AccessPolicy, type CameraPreset, type WallDirection,
  type Vec3 as RoomVec3, type Dimensions3,
  type DoorPosition, type WindowPosition, type FurnitureSlot,
  type HierarchyPosition,
  type RoomSpatial, type RoomDef,
  type FloorDef, type BuildingVisualDefaults, type BuildingDef,
  type RoomRegistry,
  isRoomDef,
  buildRoomRegistry,
  getRoomById, getRoomsByFloor, getRoomsByType,
  getAdjacentRooms, getRoomsForAgent, getRoomsByTags,
  BUILDING_DEF,
  ROOM_REGISTRY,
  ROOM_IDS,
} from "./room-config-schema.js";
export {
  // Schema EventType subset & guards (RFC-1.0.1 Sub-AC 4)
  SCHEMA_EVENT_TYPES, type SchemaEventType, SCHEMA_EVENT_TYPE_SET,
  isSchemaEventType,
  // Shared primitive types
  type SchemaNamespace, type SchemaStatus, type SchemaChangeSource,
  type SchemaValidationScope,
  // Schema lifecycle payload interfaces — core
  type SchemaRegisteredPayload, type SchemaUpdatedPayload,
  type SchemaDeprecatedPayload, type SchemaRemovedPayload,
  type SchemaValidatedPayload, type SchemaMigratedPayload,
  // Schema lifecycle payload interfaces — validation & migration lifecycle (Sub-AC 16c)
  type SchemaValidationStartedPayload, type SchemaMigrationStartedPayload,
  // Schema update diff types
  type SchemaChangeDiff, type SchemaValidationResult, type SchemaValidationError,
  // Discriminated payload map
  type SchemaEventPayloadMap,
  // Type guards — core
  isSchemaRegisteredPayload, isSchemaUpdatedPayload,
  isSchemaDeprecatedPayload, isSchemaRemovedPayload,
  isSchemaValidatedPayload, isSchemaMigratedPayload,
  // Type guards — validation & migration lifecycle (Sub-AC 16c)
  isSchemaValidationStartedPayload, isSchemaMigrationStartedPayload,
  // Discriminator map & generic validator
  SCHEMA_PAYLOAD_GUARDS, isValidSchemaPayload,
} from "./schema-events.js";
export {
  // Interaction EventType subset & guards (RFC-1.0.1 §4 Sub-AC 4 extension)
  INTERACTION_EVENT_TYPES, type InteractionEventType, INTERACTION_EVENT_TYPE_SET,
  isInteractionEventType,
  // Shared primitive types
  type InteractionSurface, type SelectableEntityKind,
  type ReplayPhase, type ViewportChangeKind,
  // Sub-AC 16d — new primitive types for 3D in-world interaction events
  type PointerButton, type ModifierKeys,
  type DragPhase, type HoverPhase,
  // Interaction payload interfaces — high-level GUI input (Sub-AC 4)
  type InteractionUserInputPayload,
  type InteractionSelectionChangedPayload,
  type InteractionReplayTriggeredPayload,
  type InteractionViewportChangedPayload,
  // Interaction payload interfaces — Sub-AC 4 discrete semantic events
  type InteractionSelectedPayload,
  type InteractionHoveredPayload,
  type InteractionDismissedPayload,
  // Interaction payload interfaces — 3D in-world pointer/gesture (Sub-AC 16d)
  type InteractionClickPayload,
  type InteractionDragPayload,
  type InteractionHoverPayload,
  // Discriminated payload map
  type InteractionEventPayloadMap,
  // Type guards — high-level GUI input (Sub-AC 4)
  isInteractionUserInputPayload,
  isInteractionSelectionChangedPayload,
  isInteractionReplayTriggeredPayload,
  isInteractionViewportChangedPayload,
  // Type guards — Sub-AC 4 discrete semantic events
  isInteractionSelectedPayload,
  isInteractionHoveredPayload,
  isInteractionDismissedPayload,
  // Type guards — 3D in-world pointer/gesture (Sub-AC 16d)
  isInteractionClickPayload,
  isInteractionDragPayload,
  isInteractionHoverPayload,
  // Interaction payload interfaces — UI feedback events (Sub-AC 2)
  type InteractionCommandExecutedPayload,
  type InteractionNotificationReceivedPayload,
  // Type guards — UI feedback events (Sub-AC 2)
  isInteractionCommandExecutedPayload,
  isInteractionNotificationReceivedPayload,
  // Discriminator map & generic validator
  INTERACTION_PAYLOAD_GUARDS, isValidInteractionPayload,
} from "./interaction-events.js";
export {
  // Fixture EventType subset & guards (Sub-AC 16d)
  FIXTURE_EVENT_TYPES, type FixtureEventType, FIXTURE_EVENT_TYPE_SET,
  isFixtureEventType,
  // Shared primitive types
  type FixtureTriggerSource, type HandleKind, type HandleDirection,
  type ButtonPressKind,
  // Fixture payload interfaces — operational state changes
  type FixturePanelToggledPayload,
  type FixtureHandlePulledPayload,
  type FixtureButtonPressedPayload,
  type FixtureStateChangedPayload,
  // Fixture payload interfaces — Sub-AC 4 scene-level lifecycle
  type FixturePlacedPayload,
  type FixtureRemovedPayload,
  type FixtureUpdatedPayload,
  // Fixture payload interfaces — Sub-AC 4 command → fixture state-sync chain
  type FixtureStateSyncPayload,
  // Discriminated payload map
  type FixtureEventPayloadMap,
  // Type guards — operational state changes
  isFixturePanelToggledPayload,
  isFixtureHandlePulledPayload,
  isFixtureButtonPressedPayload,
  isFixtureStateChangedPayload,
  // Type guards — Sub-AC 4 scene-level lifecycle
  isFixturePlacedPayload,
  isFixtureRemovedPayload,
  isFixtureUpdatedPayload,
  // Type guards — Sub-AC 4 command → fixture state-sync chain
  isFixtureStateSyncPayload,
  // Discriminator map & generic validator
  FIXTURE_PAYLOAD_GUARDS, isValidFixturePayload,
} from "./fixture-events.js";
export {
  // Task-agent mapping entity schema — Sub-AC 5 (Sub-AC 1): formal descriptor
  // registered in the ontology so the rendering pipeline can query it
  TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
  TASK_AGENT_MAPPING_ENTITY_SCHEMA_VERSION,
  type TaskAgentMappingEntityFieldDef,
  type TaskAgentMappingEntitySchemaDef,
  TASK_AGENT_MAPPING_ENTITY_SCHEMA,
  isTaskAgentMappingEntitySchemaDef,
} from "./task-agent-mapping-entity-schema.js";
