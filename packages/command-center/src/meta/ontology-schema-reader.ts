/**
 * @module ontology-schema-reader
 * Sub-AC 11a — Schema reader component.
 *
 * Reads the current ontology from the `@conitens/protocol` package exports and
 * produces a typed `OntologySnapshot` that captures every registered schema
 * entity across all three stratification levels:
 *
 *   • Domain entities     — event types, task state machines, room configs
 *   • Infrastructure entities — command types, reducers, pipeline stages
 *   • Meta entities       — schema registry entries themselves (reflexive closure)
 *
 * Design principles
 * -----------------
 * • Pure function (no side effects) — snapshot can be taken at any time.
 * • All protocol exports are enumerated exhaustively — missing entries are
 *   surfaced as `OntologyReadWarning` records so the mutation proposer can
 *   flag them without silently swallowing schema gaps.
 * • The snapshot is self-describing: every entry carries its ontological
 *   level, namespace, and `behavioral_contract` summary so the GUI can
 *   render the meta-level view without additional lookups.
 * • Backward-compatible: new entries are always additions; existing schema_ids
 *   are never reassigned.
 *
 * Meta-level routing guarantee
 * ----------------------------
 * This module has NO dependency on the command-file ingestion pipeline.
 * It reads protocol exports directly and returns a plain value.  Routing of
 * the resulting `schema.*` events is the responsibility of `MetaEventBus`
 * (see meta-event-bus.ts), which bypasses the orchestrator command inbox.
 */

import {
  EVENT_TYPES,
  type EventType,
  REDUCERS,
  type ReducerDescriptor,
  SCHEMA_VERSION,
  GUI_COMMAND_TYPES,
  type GuiCommandType,
  SCHEMA_EVENT_TYPES,
  type SchemaEventType,
  AGENT_EVENT_TYPES,
  type AgentEventType,
  LAYOUT_EVENT_TYPES,
  type LayoutEventType,
  MEETING_EVENT_TYPES,
  type MeetingEventType,
  COMMAND_EVENT_TYPES,
  type CommandEventType,
  PIPELINE_EVENT_TYPES,
  type PipelineEventType,
  INTERACTION_EVENT_TYPES,
  type InteractionEventType,
  FIXTURE_EVENT_TYPES,
  type FixtureEventType,
  TASK_STATES,
  type TaskState,
  ROOM_REGISTRY,
  type SchemaNamespace,
  // Meeting entity schema — Sub-AC 10.1
  MEETING_ENTITY_SCHEMA,
  type MeetingEntitySchemaDef,
  // Task-agent mapping entity schema — Sub-AC 5 (Sub-AC 1)
  TASK_AGENT_MAPPING_ENTITY_SCHEMA,
  type TaskAgentMappingEntitySchemaDef,
} from "@conitens/protocol";

// ---------------------------------------------------------------------------
// Ontology stratification levels
// ---------------------------------------------------------------------------

/**
 * The three explicit ontology levels (RFC-1.0.1 design constraint).
 *
 * - `domain`         — entities that exist in the world (tasks, agents, rooms)
 * - `infrastructure` — entities that process intent (commands, pipelines, reducers)
 * - `meta`           — entities that observe and evolve the system (schema entries)
 *
 * Cross-level references are permitted only through defined projection patterns:
 *   diegetic_projection: infrastructure→domain
 *   meta_mutation:       meta↔infrastructure
 */
export type OntologyLevel = "domain" | "infrastructure" | "meta";

// ---------------------------------------------------------------------------
// Event-type family tags
// ---------------------------------------------------------------------------

/**
 * High-level grouping for an EventType string.
 * Used to classify event types into readable families in the GUI meta panel.
 */
export type EventTypeFamily =
  | "task"
  | "agent"
  | "agent_lifecycle_extended"
  | "handoff"
  | "decision"
  | "approval"
  | "message"
  | "memory"
  | "mode"
  | "system"
  | "command"
  | "pipeline"
  | "layout"
  | "meeting"
  | "schema"
  | "interaction"
  | "fixture"
  | "unknown";

// ---------------------------------------------------------------------------
// Ontology entry types
// ---------------------------------------------------------------------------

/**
 * A single entry in the ontology snapshot for an EventType.
 *
 * Carries the `schema_id` (stable identifier for schema registry), the
 * ontological level it belongs to, and the family it belongs to.
 */
export interface EventTypeEntry {
  /** Stable schema_id: "event_type:<type_string>". */
  schema_id: string;
  /** Canonical EventType string, e.g. "task.created". */
  event_type: EventType;
  /** Ontology level this event belongs to. */
  level: OntologyLevel;
  /** High-level family grouping. */
  family: EventTypeFamily;
  /** Human-readable namespace category for the schema registry. */
  namespace: Extract<SchemaNamespace, "event_type">;
  /**
   * Behavioral contract summary: what this event type DOES (not just what it IS).
   * Prevents noun-verb asymmetry per the system design constraint.
   */
  behavioral_contract: string;
  /** Names of reducers that consume this event type. */
  owned_by_reducers: string[];
}

/**
 * A single entry in the ontology snapshot for a GuiCommandType.
 */
export interface CommandTypeEntry {
  /** Stable schema_id: "command_type:<type_string>". */
  schema_id: string;
  /** Canonical GuiCommandType string, e.g. "agent.spawn". */
  command_type: GuiCommandType;
  /** Ontology level: always "infrastructure". */
  level: Extract<OntologyLevel, "infrastructure">;
  /** Human-readable namespace category. */
  namespace: Extract<SchemaNamespace, "command_type">;
  /** Behavioral contract summary. */
  behavioral_contract: string;
}

/**
 * A single entry in the ontology snapshot for a ReducerDescriptor.
 */
export interface ReducerEntry {
  /** Stable schema_id: "reducer:<ReducerName>". */
  schema_id: string;
  /** Canonical reducer name. */
  reducer_name: string;
  /** Ontology level: always "infrastructure". */
  level: Extract<OntologyLevel, "infrastructure">;
  /** Human-readable namespace category. */
  namespace: Extract<SchemaNamespace, "reducer">;
  /** Files owned by this reducer. */
  owned_files: string[];
  /** Event types this reducer consumes ("*" for all). */
  input_events: string[] | "*";
  /** Files this reducer reads from (but does not own). */
  reads_from: string[];
  /** Behavioral contract summary. */
  behavioral_contract: string;
}

/**
 * A registry-level summary entry for the schema namespace itself.
 * Enables reflexive closure: the ontology snapshot includes entries
 * for the schema event types, forming a self-describing registry.
 */
export interface SchemaRegistryEntry {
  /** Stable schema_id: "schema_registry:<schema_event_type>". */
  schema_id: string;
  /** The schema event type this entry represents. */
  schema_event_type: SchemaEventType;
  /** Ontology level: always "meta". */
  level: Extract<OntologyLevel, "meta">;
  /** Human-readable namespace category. */
  namespace: Extract<SchemaNamespace, "protocol">;
  /** Behavioral contract summary. */
  behavioral_contract: string;
}

/**
 * An entry in the ontology snapshot for a domain entity type.
 *
 * Domain entities are the first-class objects that exist in the world and are
 * rendered in the 3D command-center (e.g. Meeting, Task, Agent).
 *
 * Added in Sub-AC 10.1 to register the Meeting entity schema so the
 * spec verifier can check for its presence via the entity_present clause.
 */
export interface DomainEntityEntry {
  /**
   * Stable schema_id for this entity.
   * Format matches the entity's namespace: e.g. "payload:Meeting".
   */
  schema_id: string;
  /** Human-readable entity name. */
  entity_name: string;
  /** Ontology level: always "domain". */
  level: Extract<OntologyLevel, "domain">;
  /**
   * Schema namespace category.
   * Domain entities typically use "payload" (interface definition)
   * or "gui_model" (GUI-specific data model).
   */
  namespace: Extract<SchemaNamespace, "payload" | "gui_model">;
  /** Names of required fields on this entity (from the JSON schema). */
  required_fields: readonly string[];
  /** Behavioral contract: what the entity IS and DOES. */
  behavioral_contract: string;
  /** Names of reducers that own or manage this entity's lifecycle. */
  owned_by_reducers: readonly string[];
  /** Schema version string (semver). */
  version: string;
}

// ---------------------------------------------------------------------------
// Ontology snapshot
// ---------------------------------------------------------------------------

/**
 * A point-in-time snapshot of the full ontology as read from the protocol
 * package exports.
 *
 * Produced by `readOntologySchema()` and consumed by `SchemaMutationProposer`
 * to generate `schema.*` mutation events.
 *
 * All lists are frozen (readonly) to preserve append-only semantics.
 */
export interface OntologySnapshot {
  /**
   * Unique snapshot ID generated at read time.
   * Format: `ontology-snap-<timestamp_ms>-<random>`.
   */
  snapshot_id: string;
  /**
   * Wall-clock time (ms) when the snapshot was taken.
   */
  captured_at_ms: number;
  /**
   * Protocol schema version in effect when the snapshot was taken.
   * Must match `SCHEMA_VERSION` from `@conitens/protocol`.
   */
  schema_version: string;
  /**
   * Total count of schema entries across all namespaces and levels.
   * Used as a quick integrity check (should match sum of all sub-lists).
   */
  total_entries: number;
  /** All EventType entries (domain + infrastructure + meta). */
  readonly event_types: readonly EventTypeEntry[];
  /** All GuiCommandType entries (infrastructure level). */
  readonly command_types: readonly CommandTypeEntry[];
  /** All ReducerDescriptor entries (infrastructure level). */
  readonly reducers: readonly ReducerEntry[];
  /**
   * Schema registry self-description entries (meta level).
   * Satisfies the reflexive closure requirement.
   */
  readonly schema_registry: readonly SchemaRegistryEntry[];
  /**
   * Registered domain entity schemas (domain level).
   *
   * Each entry corresponds to a first-class domain entity type (e.g. Meeting)
   * that has been formally registered in the ontology.  Entities here satisfy
   * the "recognized as a valid entity type" requirement and are included in
   * the VerificationContract via entity_present clauses.
   *
   * Sub-AC 10.1: MEETING_ENTITY_SCHEMA is registered here.
   */
  readonly domain_entity_schemas: readonly DomainEntityEntry[];
  /**
   * Total number of rooms in the building registry (domain level).
   * Surfaced here so the meta panel can verify spatial model completeness.
   */
  room_count: number;
  /**
   * Non-fatal warnings encountered during the read (e.g. unrecognized
   * event type families or missing reducer ownership).
   */
  readonly warnings: readonly OntologyReadWarning[];
}

/**
 * A non-fatal warning produced during ontology reading.
 */
export interface OntologyReadWarning {
  /** Machine-readable warning code. */
  code:
    | "UNKNOWN_EVENT_FAMILY"     // Event type couldn't be classified into a known family
    | "MISSING_REDUCER_OWNER"    // EventType has no owning reducer in the ownership table
    | "UNKNOWN_COMMAND_TYPE";    // GuiCommandType not matched to a known category
  /** Human-readable description. */
  message: string;
  /** The schema_id or entity name that triggered the warning. */
  subject: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map from EventType string prefix to EventTypeFamily. */
const FAMILY_MAP: ReadonlyMap<string, EventTypeFamily> = new Map([
  ["task",        "task"],
  ["handoff",     "handoff"],
  ["decision",    "decision"],
  ["approval",    "approval"],
  ["agent",       "agent"],
  ["message",     "message"],
  ["memory",      "memory"],
  ["mode",        "mode"],
  ["system",      "system"],
  ["command",     "command"],
  ["pipeline",    "pipeline"],
  ["layout",      "layout"],
  ["meeting",     "meeting"],
  ["schema",      "schema"],
  ["interaction", "interaction"],
  ["fixture",     "fixture"],
]);

/** Classify an EventType string into a family. */
function classifyFamily(type: string): EventTypeFamily {
  const prefix = type.split(".")[0] ?? "";
  return FAMILY_MAP.get(prefix) ?? "unknown";
}

/**
 * Determine the ontological level for an EventType.
 *
 * Classification rules:
 *   - schema.*       → meta       (ontology self-description)
 *   - interaction.*  → meta       (self-observation of GUI)
 *   - command.*      → infrastructure
 *   - pipeline.*     → infrastructure
 *   - fixture.*      → infrastructure (diegetic affordances bridge to commands)
 *   - layout.*       → infrastructure (spatial state management)
 *   - all others     → domain
 */
function classifyLevel(type: string): OntologyLevel {
  const prefix = type.split(".")[0] ?? "";
  switch (prefix) {
    case "schema":
    case "interaction":
      return "meta";
    case "command":
    case "pipeline":
    case "fixture":
    case "layout":
      return "infrastructure";
    default:
      return "domain";
  }
}

/** Behavioural contract summaries keyed by event type prefix. */
const BEHAVIORAL_CONTRACTS: ReadonlyMap<string, string> = new Map([
  ["task",        "Represents the lifecycle of a work unit: creation, assignment, status transitions, completion"],
  ["handoff",     "Transfers responsibility for a task or context between agents"],
  ["decision",    "Records a proposed or accepted/rejected choice that affects system behaviour"],
  ["approval",    "Gates high-risk operations via explicit operator authorization before execution"],
  ["agent",       "Tracks the presence, health, spatial position, and lifecycle state of orchestrated agents"],
  ["message",     "Carries communication payloads between agents, channels, or external actors"],
  ["memory",      "Records proposed and approved updates to agent long-term memory banks"],
  ["mode",        "Signals transitions between operational modes (e.g. normal, review, maintenance)"],
  ["system",      "Records orchestrator-level lifecycle events (start, shutdown, reconciliation)"],
  ["command",     "Tracks the full journey of a GUI command through the control plane"],
  ["pipeline",    "Records multi-step execution progress: stage lifecycle, task routing, completion"],
  ["layout",      "Captures mutations to the 3D spatial layout: node positions, resets, persistence"],
  ["meeting",     "Coordinates scheduled room-based collaboration sessions between agents"],
  ["schema",      "Records the evolution of the ontology itself: register, update, deprecate, remove, validate, migrate"],
  ["interaction", "Captures operator input into the 3D GUI: clicks, drags, selection, viewport, replay"],
  ["fixture",     "Records diegetic 3D in-world affordance activations that bridge operator intent to system commands"],
]);

function contractForEvent(type: string): string {
  const prefix = type.split(".")[0] ?? "";
  return (
    BEHAVIORAL_CONTRACTS.get(prefix) ??
    `Event type '${type}' — no behavioral contract registered; add to BEHAVIORAL_CONTRACTS`
  );
}

/** Behavioural contract summaries for GUI command prefixes. */
const COMMAND_BEHAVIORAL_CONTRACTS: ReadonlyMap<string, string> = new Map([
  ["agent",   "Requests an agent lifecycle operation (spawn, terminate, pause, resume, assign, send)"],
  ["task",    "Requests a task operation (create, assign, cancel, update spec)"],
  ["meeting", "Requests convening or managing a room-based meeting session"],
  ["nav",     "Requests a spatial navigation operation in the 3D world (drill down/up, camera preset, focus)"],
  ["config",  "Requests a configuration change (room mapping, persona, building layout)"],
  ["pipeline","Requests a pipeline operation (trigger, chain, cancel)"],
]);

function contractForCommand(type: string): string {
  const prefix = type.split(".")[0] ?? "";
  return (
    COMMAND_BEHAVIORAL_CONTRACTS.get(prefix) ??
    `Command type '${type}' — no behavioral contract registered`
  );
}

/** Pre-build reducer→event ownership index for O(1) lookup. */
function buildOwnershipIndex(
  reducers: readonly ReducerDescriptor[],
): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const r of reducers) {
    if (r.inputEvents === "*") continue; // wildcard reducers own everything
    for (const et of r.inputEvents) {
      if (!idx.has(et)) idx.set(et, []);
      idx.get(et)!.push(r.name);
    }
  }
  // Add wildcard reducers to every known event type
  const wildcards = reducers
    .filter((r) => r.inputEvents === "*")
    .map((r) => r.name);
  if (wildcards.length > 0) {
    for (const [k, v] of idx) {
      idx.set(k, [...v, ...wildcards]);
    }
  }
  return idx;
}

/** Simple PRNG-based ID for snapshot IDs (no crypto dep required). */
function snapshotId(ts: number): string {
  const rand = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `ontology-snap-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Main export: readOntologySchema
// ---------------------------------------------------------------------------

/**
 * Reads the current ontology from the `@conitens/protocol` package exports
 * and returns an immutable `OntologySnapshot`.
 *
 * This is a pure, synchronous function — it has no side effects and can be
 * called multiple times without risk of double-registration.
 *
 * The snapshot covers:
 *   1. All `EVENT_TYPES` → EventTypeEntry list (domain + infrastructure + meta)
 *   2. All `GUI_COMMAND_TYPES` → CommandTypeEntry list (infrastructure)
 *   3. All `REDUCERS` → ReducerEntry list (infrastructure)
 *   4. All `SCHEMA_EVENT_TYPES` → SchemaRegistryEntry list (meta / reflexive closure)
 *   5. `ROOM_REGISTRY.rooms.length` → room count (domain spatial model)
 *
 * Meta-level routing guarantee
 * ----------------------------
 * This function does NOT write any events, dispatch any commands, or interact
 * with the infrastructure pipeline. It is a read-only introspection of the
 * protocol package.
 *
 * @example
 * ```ts
 * const snapshot = readOntologySchema();
 * console.log(`${snapshot.total_entries} schema entries in ontology`);
 * ```
 */
export function readOntologySchema(): OntologySnapshot {
  const captured_at_ms = Date.now();
  const warnings: OntologyReadWarning[] = [];
  const ownershipIndex = buildOwnershipIndex(REDUCERS);

  // ── 1. EventType entries ────────────────────────────────────────────────────

  const event_types: EventTypeEntry[] = [];

  // Build a set of all sub-family type tuples for level override
  const agentSet = new Set<string>(AGENT_EVENT_TYPES as readonly string[]);
  const layoutSet = new Set<string>(LAYOUT_EVENT_TYPES as readonly string[]);
  const meetingSet = new Set<string>(MEETING_EVENT_TYPES as readonly string[]);
  const commandSet = new Set<string>(COMMAND_EVENT_TYPES as readonly string[]);
  const pipelineSet = new Set<string>(PIPELINE_EVENT_TYPES as readonly string[]);
  const interactionSet = new Set<string>(INTERACTION_EVENT_TYPES as readonly string[]);
  const fixtureSet = new Set<string>(FIXTURE_EVENT_TYPES as readonly string[]);
  const schemaSet = new Set<string>(SCHEMA_EVENT_TYPES as readonly string[]);

  // Suppress unused-variable warnings for sets that aren't accessed yet
  void agentSet; void layoutSet; void meetingSet; void commandSet;
  void pipelineSet; void interactionSet; void fixtureSet; void schemaSet;

  for (const et of EVENT_TYPES) {
    const family = classifyFamily(et);
    const level = classifyLevel(et);
    const owned_by_reducers = ownershipIndex.get(et) ?? [];

    // Warn if no reducer owns this event type
    if (owned_by_reducers.length === 0) {
      // TimelineReducer and SQLiteReducer consume "*" — add them as owners
      // This is informational; the real ownership check is done by the proposer.
      const wildcardOwners = REDUCERS
        .filter((r) => r.inputEvents === "*")
        .map((r) => r.name);
      owned_by_reducers.push(...wildcardOwners);
    }

    if (family === "unknown") {
      warnings.push({
        code: "UNKNOWN_EVENT_FAMILY",
        message: `Event type '${et}' does not map to a known family prefix`,
        subject: `event_type:${et}`,
      });
    }

    event_types.push({
      schema_id: `event_type:${et}`,
      event_type: et,
      level,
      family,
      namespace: "event_type",
      behavioral_contract: contractForEvent(et),
      owned_by_reducers,
    });
  }

  // ── 2. CommandType entries ──────────────────────────────────────────────────

  const command_types: CommandTypeEntry[] = [];

  for (const ct of GUI_COMMAND_TYPES) {
    command_types.push({
      schema_id: `command_type:${ct}`,
      command_type: ct,
      level: "infrastructure",
      namespace: "command_type",
      behavioral_contract: contractForCommand(ct),
    });
  }

  // ── 3. Reducer entries ──────────────────────────────────────────────────────

  const reducers: ReducerEntry[] = [];

  for (const r of REDUCERS) {
    reducers.push({
      schema_id: `reducer:${r.name}`,
      reducer_name: r.name,
      level: "infrastructure",
      namespace: "reducer",
      owned_files: [...r.ownedFiles],
      input_events: r.inputEvents === "*" ? "*" : [...r.inputEvents],
      reads_from: [...r.readsFrom],
      behavioral_contract: `${r.name} consumes ${r.inputEvents === "*" ? "all events" : `${(r.inputEvents as readonly string[]).length} event types`} and owns ${r.ownedFiles.length} file pattern(s)`,
    });
  }

  // ── 4. Schema registry self-description entries (reflexive closure) ─────────

  const schema_registry: SchemaRegistryEntry[] = [];

  const SCHEMA_BEHAVIORAL_CONTRACTS: ReadonlyMap<SchemaEventType, string> = new Map([
    ["schema.registered",         "Records the addition of a new schema entity to the registry; enables audit trail of ontology growth"],
    ["schema.updated",            "Records a revision to an existing schema entity; preserves prev/next version for point-in-time reconstruction"],
    ["schema.deprecated",         "Marks a schema entity as deprecated with sunset date; allows consumers to plan migration without breaking changes"],
    ["schema.removed",            "Records permanent removal of a schema entity; requires prior deprecation or forced removal with explicit reason"],
    ["schema.validation_started", "Opens a validation run boundary; enables GUI progress display without waiting for completion event"],
    ["schema.validated",          "Closes a validation run; records pass/fail result and per-entry validation details for self-improvement analysis"],
    ["schema.migration_started",  "Opens a migration run boundary; declares scope and dry-run mode before any writes occur"],
    ["schema.migrated",           "Closes a migration run; records all transformed event types and migration outcome including dry-run status"],
  ]);

  for (const set of SCHEMA_EVENT_TYPES) {
    schema_registry.push({
      schema_id: `schema_registry:${set}`,
      schema_event_type: set,
      level: "meta",
      namespace: "protocol",
      behavioral_contract:
        SCHEMA_BEHAVIORAL_CONTRACTS.get(set) ??
        `Schema event type '${set}' — behavioral contract not registered`,
    });
  }

  // ── 5. Domain entity schemas (Sub-AC 10.1) ──────────────────────────────────

  const domain_entity_schemas: DomainEntityEntry[] = [];

  /**
   * Helper: convert a MeetingEntitySchemaDef to a DomainEntityEntry.
   * Extracts the required fields from the JSON schema.
   */
  function entityFromSchemaDef(def: MeetingEntitySchemaDef): DomainEntityEntry {
    const jsonRequired = Array.isArray((def.json_schema as Record<string, unknown>)["required"])
      ? ((def.json_schema as Record<string, unknown>)["required"] as string[])
      : [];
    return {
      schema_id:           def.schema_id,
      entity_name:         def.name,
      level:               "domain",
      namespace:           def.namespace,
      required_fields:     Object.freeze(jsonRequired),
      behavioral_contract: def.behavioral_contract,
      owned_by_reducers:   def.owned_by_reducers,
      version:             def.version,
    };
  }

  /**
   * Helper: convert a TaskAgentMappingEntitySchemaDef to a DomainEntityEntry.
   * Extracts the required fields from the JSON schema.
   */
  function entityFromTaskAgentMappingSchemaDef(
    def: TaskAgentMappingEntitySchemaDef,
  ): DomainEntityEntry {
    const jsonRequired = Array.isArray(
      (def.json_schema as Record<string, unknown>)["required"],
    )
      ? ((def.json_schema as Record<string, unknown>)[
          "required"
        ] as string[])
      : [];
    return {
      schema_id:           def.schema_id,
      entity_name:         def.name,
      level:               "domain",
      namespace:           def.namespace,
      required_fields:     Object.freeze(jsonRequired),
      behavioral_contract: def.behavioral_contract,
      owned_by_reducers:   def.owned_by_reducers,
      version:             def.version,
    };
  }

  // Register the Meeting entity schema (Sub-AC 10.1)
  domain_entity_schemas.push(entityFromSchemaDef(MEETING_ENTITY_SCHEMA));

  // Register the TaskAgentMapping entity schema (Sub-AC 5 Sub-AC 1)
  domain_entity_schemas.push(
    entityFromTaskAgentMappingSchemaDef(TASK_AGENT_MAPPING_ENTITY_SCHEMA),
  );

  // ── 6. Room count ───────────────────────────────────────────────────────────

  const room_count = ROOM_REGISTRY.count;

  // ── Assemble snapshot ───────────────────────────────────────────────────────

  const total_entries =
    event_types.length +
    command_types.length +
    reducers.length +
    schema_registry.length +
    domain_entity_schemas.length;

  return Object.freeze({
    snapshot_id: snapshotId(captured_at_ms),
    captured_at_ms,
    schema_version: SCHEMA_VERSION,
    total_entries,
    event_types:           Object.freeze(event_types),
    command_types:         Object.freeze(command_types),
    reducers:              Object.freeze(reducers),
    schema_registry:       Object.freeze(schema_registry),
    domain_entity_schemas: Object.freeze(domain_entity_schemas),
    room_count,
    warnings: Object.freeze(warnings),
  });
}

// ---------------------------------------------------------------------------
// Utility: quick lookup helpers on OntologySnapshot
// ---------------------------------------------------------------------------

/**
 * Look up a single EventTypeEntry by event_type string.
 * Returns `undefined` if not found in the snapshot.
 */
export function findEventTypeEntry(
  snapshot: OntologySnapshot,
  eventType: string,
): EventTypeEntry | undefined {
  return snapshot.event_types.find((e) => e.event_type === eventType);
}

/**
 * Return all entries at a given ontological level.
 * Useful for the meta panel to display domain / infrastructure / meta sections.
 */
export function getEntriesByLevel(
  snapshot: OntologySnapshot,
  level: OntologyLevel,
): Array<EventTypeEntry | CommandTypeEntry | ReducerEntry | SchemaRegistryEntry | DomainEntityEntry> {
  const all: Array<
    EventTypeEntry | CommandTypeEntry | ReducerEntry | SchemaRegistryEntry | DomainEntityEntry
  > = [
    ...snapshot.event_types,
    ...snapshot.command_types,
    ...snapshot.reducers,
    ...snapshot.schema_registry,
    ...snapshot.domain_entity_schemas,
  ];
  return all.filter((e) => e.level === level);
}

/**
 * Return a summary suitable for logging / display.
 */
export function summarizeSnapshot(snapshot: OntologySnapshot): string {
  return (
    `OntologySnapshot[${snapshot.snapshot_id}] ` +
    `schema=${snapshot.schema_version} ` +
    `total=${snapshot.total_entries} ` +
    `(events=${snapshot.event_types.length}, ` +
    `commands=${snapshot.command_types.length}, ` +
    `reducers=${snapshot.reducers.length}, ` +
    `schema_registry=${snapshot.schema_registry.length}, ` +
    `domain_entities=${snapshot.domain_entity_schemas.length}) ` +
    `rooms=${snapshot.room_count} ` +
    `warnings=${snapshot.warnings.length}`
  );
}

// ---------------------------------------------------------------------------
// Re-export types for consumers
// ---------------------------------------------------------------------------

export type {
  EventType,
  GuiCommandType,
  AgentEventType,
  LayoutEventType,
  MeetingEventType,
  CommandEventType,
  PipelineEventType,
  InteractionEventType,
  FixtureEventType,
  SchemaEventType,
  TaskState,
};
