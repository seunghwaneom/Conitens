/**
 * @module schema-events
 * RFC-1.0.1 §4 Sub-AC 4 — Schema-registry event types, payloads, type guards,
 * and utilities.
 *
 * Schema events record the evolution of the system's own ontology — every
 * time an EventType, command type, or protocol schema definition is registered,
 * updated, deprecated, removed, validated, or migrated, a schema.* event is
 * appended to the event log.
 *
 * This satisfies the "reflexive closure" requirement: the ontology is
 * representable within itself, enabling the self-improvement cycle
 * (record → analyse → improve → re-register).
 *
 * Schema event hierarchy:
 *   schema.registered  — a new schema definition entered the registry
 *   schema.updated     — an existing schema definition was revised (bumped version)
 *   schema.deprecated  — an existing schema was marked deprecated (still functional)
 *   schema.removed     — a schema definition was permanently removed from the registry
 *   schema.validated   — a schema was validated against the current protocol version
 *   schema.migrated    — historical events were migrated from one schema version to another
 *
 * Design rationale
 * ----------------
 * The schema registry is a first-class subsystem in Conitens.  By treating
 * schema lifecycle operations as events (rather than silent code changes), the
 * system gains:
 *
 *   • Full audit trail of schema evolution (who changed what, when, why)
 *   • Replay support — schema state can be reconstructed from the event log
 *   • GUI observability — the 3D command-center can visualise schema health
 *   • Self-improvement hooks — agents can analyse schema.* events and propose
 *     improvements via the standard command-file pipeline
 */
import type { EventType } from "./event.js";

// ---------------------------------------------------------------------------
// Schema EventType subset
// ---------------------------------------------------------------------------

/** Tuple of all canonical schema event type strings. */
export const SCHEMA_EVENT_TYPES = [
  "schema.registered",
  "schema.updated",
  "schema.deprecated",
  "schema.removed",
  // Schema validation lifecycle (Sub-AC 16c) — symmetric start/complete events
  "schema.validation_started",
  "schema.validated",
  // Schema migration lifecycle (Sub-AC 16c) — symmetric start/complete events
  "schema.migration_started",
  "schema.migrated",
] as const satisfies readonly EventType[];

export type SchemaEventType = (typeof SCHEMA_EVENT_TYPES)[number];

/** O(1) membership test for schema event types. */
export const SCHEMA_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  SCHEMA_EVENT_TYPES,
);

/** Type guard — narrows a string to a SchemaEventType. */
export function isSchemaEventType(s: string): s is SchemaEventType {
  return SCHEMA_EVENT_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Shared primitive types
// ---------------------------------------------------------------------------

/**
 * Namespace that a schema definition belongs to.
 *
 * - `event_type`    — an EventType string (e.g. "task.created")
 * - `command_type`  — a GuiCommandType string (e.g. "agent.spawn")
 * - `payload`       — a payload interface definition
 * - `reducer`       — a ReducerDescriptor definition
 * - `protocol`      — a top-level protocol schema (e.g. ConitensEvent envelope)
 * - `gui_model`     — a GUI-specific data model (e.g. RoomConfig, AgentCard)
 */
export type SchemaNamespace =
  | "event_type"
  | "command_type"
  | "payload"
  | "reducer"
  | "protocol"
  | "gui_model";

/**
 * Lifecycle status of a registered schema entry.
 *
 * Transitions:
 *   active → deprecated → removed
 *   active → removed (forced removal)
 */
export type SchemaStatus = "active" | "deprecated" | "removed";

/**
 * Source that triggered a schema lifecycle event.
 *
 * - `system`   — auto-registered at boot from compiled protocol package
 * - `agent`    — proposed by an orchestrated agent via the improvement cycle
 * - `operator` — manually issued by a human operator via GUI/CLI
 */
export type SchemaChangeSource = "system" | "agent" | "operator";

// ---------------------------------------------------------------------------
// Payload interfaces
// ---------------------------------------------------------------------------

/**
 * schema.registered
 *
 * Emitted when a new schema definition is added to the registry.
 * This fires at system boot for every built-in EventType / command type
 * as well as dynamically when the self-improvement cycle introduces a new
 * schema entity.
 */
export interface SchemaRegisteredPayload {
  /** Stable identifier for this schema entry, e.g. "event_type:task.created". */
  schema_id: string;
  /** High-level namespace this entry belongs to. */
  namespace: SchemaNamespace;
  /**
   * Human-readable name of the schema entry.
   * For event_type namespace: the EventType string.
   * For payload namespace: the TypeScript interface name.
   */
  name: string;
  /** Semver-style version string, e.g. "1.0.0". */
  version: string;
  /** Optional markdown description of the schema entry. */
  description?: string;
  /**
   * JSON Schema (draft-07 compatible) representation of the payload or data
   * structure this entry defines, if applicable.
   */
  json_schema?: Record<string, unknown>;
  /** Actor that triggered this registration. */
  registered_by: SchemaChangeSource;
  /** Monotonic wall-clock time (ms) when the entry was registered. */
  registered_at_ms?: number;
  /**
   * For event_type namespace: list of reducer names that consume this event.
   * Denormalised here for quick lookup without joining ownership table.
   */
  owned_by_reducers?: string[];
  /**
   * For payload namespace: the parent event type this payload belongs to.
   */
  parent_event_type?: string;
}

/**
 * schema.updated
 *
 * Emitted when an existing schema definition is revised.
 * The previous version snapshot is preserved for audit/replay purposes.
 */
export interface SchemaUpdatedPayload {
  /** Stable identifier for the updated schema entry. */
  schema_id: string;
  /** Namespace of the updated entry. */
  namespace: SchemaNamespace;
  /** Name of the updated entry. */
  name: string;
  /** Previous version string (before this update). */
  prev_version: string;
  /** New version string (after this update). */
  next_version: string;
  /** Structured diff describing what changed, e.g. added/removed fields. */
  changes: SchemaChangeDiff[];
  /** Actor that triggered this update. */
  updated_by: SchemaChangeSource;
  /** Agent ID if updated_by = "agent". */
  agent_id?: string;
  /** Monotonic wall-clock time (ms) when the update occurred. */
  updated_at_ms?: number;
  /**
   * Full new JSON Schema snapshot after the update, if available.
   * Enables point-in-time reconstruction of the schema registry state.
   */
  new_json_schema?: Record<string, unknown>;
}

/**
 * A single field-level change within a schema update.
 */
export interface SchemaChangeDiff {
  /** Type of change performed. */
  change_type: "field_added" | "field_removed" | "field_modified" | "description_updated" | "version_bumped" | "other";
  /** Dot-notation path to the changed field, e.g. "properties.agent_id.type". */
  field_path?: string;
  /** Human-readable description of this specific change. */
  description: string;
  /** Previous value (serialised to string for storage). */
  prev_value?: string;
  /** New value (serialised to string for storage). */
  next_value?: string;
}

/**
 * schema.deprecated
 *
 * Emitted when a schema definition is marked as deprecated.
 * Deprecated schemas are still functional and will continue to be processed,
 * but new code should migrate to the replacement schema.
 */
export interface SchemaDeprecatedPayload {
  /** Stable identifier for the deprecated schema entry. */
  schema_id: string;
  /** Namespace of the deprecated entry. */
  namespace: SchemaNamespace;
  /** Name of the deprecated entry. */
  name: string;
  /** Current version at time of deprecation. */
  version: string;
  /** Human-readable reason for deprecation. */
  deprecation_reason: string;
  /**
   * schema_id of the replacement entry that users should migrate to.
   * May be absent if the feature itself is being retired with no replacement.
   */
  replacement_schema_id?: string;
  /**
   * Name of the replacement entry (denormalised for readability).
   */
  replacement_name?: string;
  /**
   * Target date (ISO 8601) after which the deprecated schema may be removed.
   * Gives consumers time to migrate.
   */
  sunset_date?: string;
  /** Actor that triggered the deprecation. */
  deprecated_by: SchemaChangeSource;
  /** Agent ID if deprecated_by = "agent". */
  agent_id?: string;
  /** Monotonic wall-clock time (ms) when deprecation occurred. */
  deprecated_at_ms?: number;
}

/**
 * schema.removed
 *
 * Emitted when a schema definition is permanently removed from the registry.
 * After this event, the schema_id is no longer valid and any events carrying
 * this type will be rejected by the orchestrator unless a migration is applied.
 */
export interface SchemaRemovedPayload {
  /** Stable identifier for the removed schema entry. */
  schema_id: string;
  /** Namespace of the removed entry. */
  namespace: SchemaNamespace;
  /** Name of the removed entry. */
  name: string;
  /** Version that was active at time of removal. */
  version: string;
  /** Human-readable reason for removal. */
  removal_reason: string;
  /**
   * Whether a migration was applied before removal.
   * If true, existing events using this schema were converted to the
   * replacement schema; if false, existing events are now schema-invalid.
   */
  migration_applied: boolean;
  /**
   * Number of historical events that referenced this schema (informational).
   */
  affected_event_count?: number;
  /** Actor that triggered the removal. */
  removed_by: SchemaChangeSource;
  /** Agent ID if removed_by = "agent". */
  agent_id?: string;
  /** Monotonic wall-clock time (ms) when removal occurred. */
  removed_at_ms?: number;
}

/**
 * schema.validated
 *
 * Emitted after a schema validation run completes.
 * Validation checks that all registered schemas are internally consistent,
 * that all EventTypes listed in EVENT_TYPES have corresponding payload
 * interfaces, and that the ownership table is complete.
 */
export interface SchemaValidatedPayload {
  /**
   * Unique ID for this validation run.
   * Enables correlation with any command that triggered the validation.
   */
  validation_run_id: string;
  /** Scope of this validation run. */
  scope: SchemaValidationScope;
  /**
   * Total number of schema entries that were checked.
   */
  schemas_checked: number;
  /**
   * Number of schema entries that passed validation.
   */
  schemas_valid: number;
  /**
   * Number of schema entries that failed validation.
   */
  schemas_invalid: number;
  /**
   * Detailed validation results per schema entry.
   * May be omitted for large runs to reduce event size.
   */
  results?: SchemaValidationResult[];
  /** Whether the overall validation run passed (schemas_invalid === 0). */
  passed: boolean;
  /** Actor that triggered this validation. */
  validated_by: SchemaChangeSource;
  /** Agent ID if validated_by = "agent". */
  agent_id?: string;
  /** Monotonic wall-clock time (ms) when validation completed. */
  validated_at_ms?: number;
  /** Duration of the validation run in milliseconds. */
  duration_ms?: number;
}

/**
 * Scope of a schema validation run.
 *
 * - `full`          — all registered schemas are checked
 * - `event_types`   — only EventType entries are checked
 * - `payloads`      — only payload interface entries are checked
 * - `reducers`      — only reducer ownership entries are checked
 * - `single`        — a specific schema_id is checked
 */
export type SchemaValidationScope =
  | "full"
  | "event_types"
  | "payloads"
  | "reducers"
  | "single";

/**
 * Validation result for a single schema entry.
 */
export interface SchemaValidationResult {
  /** The schema entry that was validated. */
  schema_id: string;
  /** Whether this entry passed validation. */
  valid: boolean;
  /** List of validation errors, populated only when valid = false. */
  errors?: SchemaValidationError[];
  /** List of validation warnings (non-fatal issues). */
  warnings?: string[];
}

/**
 * A single validation error for a schema entry.
 */
export interface SchemaValidationError {
  /** Machine-readable error code, e.g. "MISSING_PAYLOAD_INTERFACE". */
  error_code: string;
  /** Human-readable description of the error. */
  message: string;
  /** Dot-notation path within the schema that is invalid, if applicable. */
  field_path?: string;
}

/**
 * schema.migrated
 *
 * Emitted after a batch migration of historical events from one schema version
 * to another.  Migrations are necessary when a breaking change is made to an
 * EventType's payload shape or the envelope schema.
 *
 * Migrations are always recorded even if zero events were affected, to provide
 * an audit trail of schema evolution decisions.
 */
export interface SchemaMigratedPayload {
  /**
   * Unique ID for this migration run.
   */
  migration_run_id: string;
  /**
   * Source schema version (the version being migrated FROM).
   * e.g. "conitens.event.v1"
   */
  from_version: string;
  /**
   * Target schema version (the version being migrated TO).
   * e.g. "conitens.event.v2"
   */
  to_version: string;
  /**
   * List of EventType strings whose payloads were transformed during migration.
   */
  migrated_event_types: string[];
  /**
   * Total number of individual ConitensEvent records that were migrated.
   */
  events_migrated: number;
  /**
   * Number of events that could not be migrated (left as-is or marked invalid).
   */
  events_failed?: number;
  /**
   * Date range of events that were migrated (ISO 8601 dates, inclusive).
   */
  date_range?: { from: string; to: string };
  /**
   * Whether this was a dry-run (no actual writes were performed).
   * Dry-run migrations are still recorded so operators can review the plan.
   */
  dry_run: boolean;
  /** Actor that triggered this migration. */
  migrated_by: SchemaChangeSource;
  /** Agent ID if migrated_by = "agent". */
  agent_id?: string;
  /** Monotonic wall-clock time (ms) when migration completed. */
  migrated_at_ms?: number;
  /** Duration of the migration run in milliseconds. */
  duration_ms?: number;
}

// ---------------------------------------------------------------------------
// Sub-AC 16c — schema validation & migration lifecycle payload interfaces
// ---------------------------------------------------------------------------

/**
 * schema.validation_started  (Sub-AC 16c)
 *
 * Emitted when a schema validation run begins.  This event is the symmetric
 * counterpart to `schema.validated` and provides a precise start boundary for
 * validation operations — enabling the 3D command-center to display in-flight
 * validation status and progress without waiting for completion.
 *
 * Design rationale
 * ----------------
 * Long-running validation passes (e.g. full-registry sweeps across all event
 * types, payload interfaces, and reducer ownership entries) may take several
 * seconds on large deployments.  A start event enables:
 *
 *   • Real-time GUI progress display (schemas_to_check countdown)
 *   • Replay reconstruction of validation run boundaries
 *   • Correlation with any command that triggered the validation
 *   • Audit trail of validation initiations (not just completions)
 *
 * Lifecycle position:
 *   schema.validation_started → [incremental validation] → schema.validated
 */
export interface SchemaValidationStartedPayload {
  /**
   * Unique ID for this validation run.
   * Must match the validation_run_id in the corresponding schema.validated event.
   */
  validation_run_id: string;
  /** Scope of this validation run. */
  scope: SchemaValidationScope;
  /**
   * Total number of schema entries that will be checked.
   * Enables progress display: (schemas_checked / schemas_to_check) × 100%.
   * May be omitted if the count is not known upfront (e.g. dynamic registry).
   */
  schemas_to_check?: number;
  /** Actor that initiated this validation run. */
  initiated_by: SchemaChangeSource;
  /** Agent ID if initiated_by = "agent". */
  agent_id?: string;
  /**
   * command_id that triggered this validation, if initiated via a command.
   * Enables causal chain reconstruction: command → validation → result.
   */
  triggered_by_command?: string;
  /** Monotonic wall-clock time (ms) when the validation run began. */
  started_at_ms?: number;
}

/**
 * schema.migration_started  (Sub-AC 16c)
 *
 * Emitted when a schema migration run begins.  This event is the symmetric
 * counterpart to `schema.migrated` and provides a precise start boundary for
 * migration operations.
 *
 * Design rationale
 * ----------------
 * Schema migrations may touch thousands of historical events and take
 * significant time.  A start event enables:
 *
 *   • Real-time GUI progress display (events migrated vs. total)
 *   • Replay reconstruction of migration boundaries
 *   • Early detection of stuck migrations (if schema.migrated never follows)
 *   • Audit trail of migration initiations — critical for change management
 *   • Dry-run transparency: operators see intent before execution
 *
 * Lifecycle position:
 *   schema.migration_started → [batch event transformation] → schema.migrated
 *
 * `dry_run` is preserved from schema.migration_started through schema.migrated
 * so both events are independently self-describing without needing a join.
 */
export interface SchemaMigrationStartedPayload {
  /**
   * Unique ID for this migration run.
   * Must match the migration_run_id in the corresponding schema.migrated event.
   */
  migration_run_id: string;
  /**
   * Source schema version (the version being migrated FROM).
   * e.g. "conitens.event.v1"
   */
  from_version: string;
  /**
   * Target schema version (the version being migrated TO).
   * e.g. "conitens.event.v2"
   */
  to_version: string;
  /**
   * List of EventType strings whose payloads will be transformed.
   * Declared upfront so observers know the expected scope of the migration.
   */
  target_event_types: string[];
  /**
   * Estimated total number of ConitensEvent records that will be migrated.
   * May be omitted if not known upfront (e.g. streaming migration).
   * Enables real-time progress display in the 3D command-center.
   */
  estimated_events_count?: number;
  /**
   * Whether this is a dry-run (no actual writes will be performed).
   * Dry-run migrations are still recorded so operators can review the plan.
   */
  dry_run: boolean;
  /** Actor that initiated this migration run. */
  initiated_by: SchemaChangeSource;
  /** Agent ID if initiated_by = "agent". */
  agent_id?: string;
  /**
   * command_id that triggered this migration, if initiated via a command.
   * Enables causal chain reconstruction: command → migration → result.
   */
  triggered_by_command?: string;
  /** Monotonic wall-clock time (ms) when the migration run began. */
  started_at_ms?: number;
}

// ---------------------------------------------------------------------------
// Discriminated payload map — EventType → typed payload interface
// ---------------------------------------------------------------------------

/**
 * Maps each canonical schema EventType to its strongly-typed payload.
 *
 * @example
 * ```ts
 * function handleSchema<T extends SchemaEventType>(
 *   type: T, payload: SchemaEventPayloadMap[T]
 * ) { ... }
 * ```
 */
export interface SchemaEventPayloadMap {
  "schema.registered":          SchemaRegisteredPayload;
  "schema.updated":             SchemaUpdatedPayload;
  "schema.deprecated":          SchemaDeprecatedPayload;
  "schema.removed":             SchemaRemovedPayload;
  // Validation lifecycle (Sub-AC 16c)
  "schema.validation_started":  SchemaValidationStartedPayload;
  "schema.validated":           SchemaValidatedPayload;
  // Migration lifecycle (Sub-AC 16c)
  "schema.migration_started":   SchemaMigrationStartedPayload;
  "schema.migrated":            SchemaMigratedPayload;
}

// ---------------------------------------------------------------------------
// Type guards — narrow `unknown` payloads to typed interfaces
// ---------------------------------------------------------------------------

/** Internal helper: assert plain, non-null, non-array object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Type guard for schema.registered payloads.
 *
 * Requires: schema_id, namespace, name, version, registered_by.
 */
export function isSchemaRegisteredPayload(p: unknown): p is SchemaRegisteredPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["schema_id"] === "string" &&
    typeof p["namespace"] === "string" &&
    typeof p["name"] === "string" &&
    typeof p["version"] === "string" &&
    typeof p["registered_by"] === "string"
  );
}

/**
 * Type guard for schema.updated payloads.
 *
 * Requires: schema_id, namespace, name, prev_version, next_version, changes,
 *           updated_by.
 */
export function isSchemaUpdatedPayload(p: unknown): p is SchemaUpdatedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["schema_id"] === "string" &&
    typeof p["namespace"] === "string" &&
    typeof p["name"] === "string" &&
    typeof p["prev_version"] === "string" &&
    typeof p["next_version"] === "string" &&
    Array.isArray(p["changes"]) &&
    typeof p["updated_by"] === "string"
  );
}

/**
 * Type guard for schema.deprecated payloads.
 *
 * Requires: schema_id, namespace, name, version, deprecation_reason,
 *           deprecated_by.
 */
export function isSchemaDeprecatedPayload(p: unknown): p is SchemaDeprecatedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["schema_id"] === "string" &&
    typeof p["namespace"] === "string" &&
    typeof p["name"] === "string" &&
    typeof p["version"] === "string" &&
    typeof p["deprecation_reason"] === "string" &&
    typeof p["deprecated_by"] === "string"
  );
}

/**
 * Type guard for schema.removed payloads.
 *
 * Requires: schema_id, namespace, name, version, removal_reason,
 *           migration_applied, removed_by.
 */
export function isSchemaRemovedPayload(p: unknown): p is SchemaRemovedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["schema_id"] === "string" &&
    typeof p["namespace"] === "string" &&
    typeof p["name"] === "string" &&
    typeof p["version"] === "string" &&
    typeof p["removal_reason"] === "string" &&
    typeof p["migration_applied"] === "boolean" &&
    typeof p["removed_by"] === "string"
  );
}

/**
 * Type guard for schema.validated payloads.
 *
 * Requires: validation_run_id, scope, schemas_checked, schemas_valid,
 *           schemas_invalid, passed, validated_by.
 */
export function isSchemaValidatedPayload(p: unknown): p is SchemaValidatedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["validation_run_id"] === "string" &&
    typeof p["scope"] === "string" &&
    typeof p["schemas_checked"] === "number" &&
    typeof p["schemas_valid"] === "number" &&
    typeof p["schemas_invalid"] === "number" &&
    typeof p["passed"] === "boolean" &&
    typeof p["validated_by"] === "string"
  );
}

/**
 * Type guard for schema.migrated payloads.
 *
 * Requires: migration_run_id, from_version, to_version, migrated_event_types,
 *           events_migrated, dry_run, migrated_by.
 */
export function isSchemaMigratedPayload(p: unknown): p is SchemaMigratedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["migration_run_id"] === "string" &&
    typeof p["from_version"] === "string" &&
    typeof p["to_version"] === "string" &&
    Array.isArray(p["migrated_event_types"]) &&
    typeof p["events_migrated"] === "number" &&
    typeof p["dry_run"] === "boolean" &&
    typeof p["migrated_by"] === "string"
  );
}

// ---------------------------------------------------------------------------
// Sub-AC 16c type guards
// ---------------------------------------------------------------------------

/**
 * Type guard for schema.validation_started payloads.
 *
 * Requires: validation_run_id, scope, initiated_by.
 */
export function isSchemaValidationStartedPayload(
  p: unknown,
): p is SchemaValidationStartedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["validation_run_id"] === "string" &&
    typeof p["scope"] === "string" &&
    typeof p["initiated_by"] === "string"
  );
}

/**
 * Type guard for schema.migration_started payloads.
 *
 * Requires: migration_run_id, from_version, to_version, target_event_types,
 *           dry_run, initiated_by.
 */
export function isSchemaMigrationStartedPayload(
  p: unknown,
): p is SchemaMigrationStartedPayload {
  if (!isObject(p)) return false;
  return (
    typeof p["migration_run_id"] === "string" &&
    typeof p["from_version"] === "string" &&
    typeof p["to_version"] === "string" &&
    Array.isArray(p["target_event_types"]) &&
    typeof p["dry_run"] === "boolean" &&
    typeof p["initiated_by"] === "string"
  );
}

// ---------------------------------------------------------------------------
// Payload discriminator map — event type → type guard function
// ---------------------------------------------------------------------------

/** All schema payload type-guard functions keyed by event type. */
export const SCHEMA_PAYLOAD_GUARDS: {
  [K in SchemaEventType]: (p: unknown) => p is SchemaEventPayloadMap[K];
} = {
  "schema.registered":          isSchemaRegisteredPayload,
  "schema.updated":             isSchemaUpdatedPayload,
  "schema.deprecated":          isSchemaDeprecatedPayload,
  "schema.removed":             isSchemaRemovedPayload,
  // Validation lifecycle (Sub-AC 16c)
  "schema.validation_started":  isSchemaValidationStartedPayload,
  "schema.validated":           isSchemaValidatedPayload,
  // Migration lifecycle (Sub-AC 16c)
  "schema.migration_started":   isSchemaMigrationStartedPayload,
  "schema.migrated":            isSchemaMigratedPayload,
};

// ---------------------------------------------------------------------------
// Generic validator
// ---------------------------------------------------------------------------

/**
 * Validates a payload against the expected shape for a given schema event type.
 *
 * @example
 * ```ts
 * if (isValidSchemaPayload("schema.registered", event.payload)) {
 *   // payload is SchemaRegisteredPayload
 *   console.log(event.payload.schema_id, event.payload.namespace);
 * }
 * ```
 */
export function isValidSchemaPayload<T extends SchemaEventType>(
  type: T,
  payload: unknown,
): payload is SchemaEventPayloadMap[T] {
  return SCHEMA_PAYLOAD_GUARDS[type](payload);
}
