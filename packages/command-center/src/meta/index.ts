/**
 * @module meta
 * Sub-AC 11a/11b/11c — Meta-level ontology schema reader, mutation proposer,
 * mutation executor, event_log recorder, and migration check validator.
 *
 * This barrel exports everything needed to:
 *   1. Read the current ontology schema (readOntologySchema)
 *   2. Emit schema.* mutation events at the meta level (MetaEventBus)
 *   3. Propose, validate, and emit schema mutations (proposeMutations, emitProposal)
 *   4. Execute schema mutations with apply/reject/defer decisions (MutationExecutor)
 *   5. Validate proposed mutations against migration rules (MigrationCheckValidator)
 *   6. Record apply/reject decisions with before/after snapshots to EventLog
 *      (MutationEventLogRecorder — Sub-AC 11c)
 *
 * Meta-level routing guarantee
 * ----------------------------
 * All exports in this module interact with the meta level ONLY.
 * No export routes events through the infrastructure command-file pipeline.
 * The MetaEventBus uses POST /api/meta/events, NOT /api/commands.
 *
 * Ontology stratification
 * -----------------------
 * The exports map to the three stratification levels as follows:
 *
 *   Domain level:
 *     readOntologySchema()   → captures domain entities (events, tasks, rooms)
 *
 *   Infrastructure level:
 *     OntologySnapshot.command_types  → GuiCommandType entries
 *     OntologySnapshot.reducers       → ReducerDescriptor entries
 *
 *   Meta level (this module's primary concern):
 *     MetaEventBus                → routes schema.* events to /api/meta/events
 *     proposeMutations()          → generates schema.* proposal events
 *     emitProposal()              → emits proposals via MetaEventBus
 *     validateProposalStability() → checks backward-compatibility
 *     runSchemaSelfRegistration() → full read→propose→emit cycle
 *     MutationExecutor            → apply/reject/defer schema mutations
 *     MutationEventLogRecorder    → records mutations + before/after state to EventLog
 *     MigrationCheckValidator     → pre-flight migration rule enforcement
 */

// ── Ontology schema reader ──────────────────────────────────────────────────

export {
  readOntologySchema,
  findEventTypeEntry,
  getEntriesByLevel,
  summarizeSnapshot,
  type OntologyLevel,
  type EventTypeFamily,
  type EventTypeEntry,
  type CommandTypeEntry,
  type ReducerEntry,
  type SchemaRegistryEntry,
  type OntologySnapshot,
  type OntologyReadWarning,
} from "./ontology-schema-reader.js";

// ── Meta event bus ──────────────────────────────────────────────────────────

export {
  MetaEventBus,
  metaEventBus,
  useMetaEventBus,
  META_EVENTS_ENDPOINT,
  META_LOG_MAX_ENTRIES,
  type MetaLogEntry,
  type MetaEmitOptions,
  type MetaEmitResult,
  type MetaEventEnvelope,
} from "./meta-event-bus.js";

// ── Schema mutation proposer ────────────────────────────────────────────────

export {
  proposeMutations,
  emitProposal,
  validateProposalStability,
  runSchemaSelfRegistration,
  currentSchemaVersion,
  type MutationKind,
  type SchemaMutation,
  type SchemaMutationProposal,
  type ProposalEmitResult,
  type ProposeMutationsOptions,
  type EmitProposalOptions,
  type StabilityCheckResult,
} from "./schema-mutation-proposer.js";

// ── Mutation executor ────────────────────────────────────────────────────────

export {
  MutationExecutor,
  mutationExecutor,
  useMutationExecutor,
  type ExecutionDecision,
  type RegistryEntryStatus,
  type RegistryEntry,
  type ExecutionRecord,
  type PendingDecision,
  type MutationHandleResult,
  type OperatorResolutionResult,
  type MutationExecutorOptions,
} from "./mutation-executor.js";

// ── Mutation event log recorder ─────────────────────────────────────────────

export {
  MutationEventLogRecorder,
  mutationEventLogRecorder,
  initMutationEventLogRecorder,
  useMutationEventLogRecorder,
  type EventLogAppender,
  type RecordedConitensEvent,
  type EventLogAppendInput,
  type RegistryStateSnapshot,
  type MutationExecutionMetadata,
  type HandleAndRecordResult,
  type ResolutionAndRecordResult,
  type RecordOptions,
  type MutationEventLogRecorderOptions,
} from "./mutation-event-log-recorder.js";

// ── Migration check validator ────────────────────────────────────────────────

export {
  MigrationCheckValidator,
  migrationCheckValidator,
  useMigrationCheckValidator,
  isValidSemver,
  compareSemver,
  isSemverBump,
  isValidSchemaIdFormat,
  extractSchemaIdNamespace,
  type MigrationRuleId,
  type MigrationCheckDecision,
  type MigrationRuleViolation,
  type MigrationRuleWarning,
  type MigrationCheckResult,
  type RegistryEntryView,
  type MigrationCheckValidatorOptions,
} from "./migration-check-validator.js";

// ── Self-improvement loop ─────────────────────────────────────────────────────

export {
  SelfImprovementLoop,
  selfImprovementLoop,
  useSelfImprovementLoop,
  type LoopState,
  type LoopStatus,
  type LoopRunOptions,
  type LoopLogger,
  type SelfImprovementLoopOptions,
  type CycleRecord,
  type CycleError,
  type MutationOutcome,
} from "./self-improvement-loop.js";

// ── Verification contract sync ────────────────────────────────────────────────

export {
  VerificationContractSyncer,
  verificationContractSyncer,
  useVerificationContractSyncer,
  checkClause,
  checkContract,
  summarizeContractCheck,
  type VerificationClauseKind,
  type VerificationClause,
  type VerificationContract,
  type VerificationContractSyncResult,
  type ClauseRegistryView,
  type ClauseCheckResult,
} from "./verification-contract-sync.js";
