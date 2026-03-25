/**
 * @module task-agent-mapping-entity-schema
 * Sub-AC 5 (Sub-AC 1) — Formal task_agent_mapping entity schema descriptor.
 *
 * Defines the canonical schema for the TaskAgentMapping domain entity, which
 * represents the live assignment relationship between a single source agent
 * and a single target task.
 *
 * Required fields per the ontology contract:
 *   mapping_id        — deterministic "<agentId>:<taskId>" composite key
 *   source_agent_id   — the agent performing the task (connector origin)
 *   target_task_id    — the task being performed (connector target)
 *
 * Renderer-computed fields (pre-computed, not required for creation):
 *   priority          — task priority (drives PointLight budget + orb color)
 *   status            — task lifecycle status (drives visibility + beam color)
 *   assigned_ts       — Unix timestamp (ms) when the mapping was established
 *   is_visible_in_scene — pre-computed visibility predicate
 *   priority_color    — hex color for the task orb mesh
 *   status_beam_color — hex color for the connector beam line
 *
 * The schema is registered under namespace "gui_model" with schema_id
 * "gui_model:TaskAgentMapping", making it recognizable as a valid entity type
 * by the ontology system. The ontology reader includes this descriptor in the
 * `domain_entity_schemas` list so the spec verifier can check for its presence
 * via the standard entity_present clause mechanism.
 *
 * Design constraints:
 *   • Pure value module — no side effects, no infrastructure dependency.
 *   • Backward-compatible: existing TaskAgentMappingEntity definitions are unchanged.
 *   • Queryable from the rendering pipeline: the schema_id is stable and can be
 *     used as a stable reference in spec verifier entity_present clauses.
 */

// ---------------------------------------------------------------------------
// Schema identity constants
// ---------------------------------------------------------------------------

/**
 * Stable schema_id for the TaskAgentMapping GUI model entity.
 *
 * Uses the "gui_model" namespace because this entity is a renderer-consumable
 * projection of raw store state — not a raw domain payload but a pre-computed
 * data structure purpose-built for the 3D scene graph.
 */
export const TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID =
  "gui_model:TaskAgentMapping" as const;

/** Version of this entity schema descriptor. Follows semver. */
export const TASK_AGENT_MAPPING_ENTITY_SCHEMA_VERSION = "1.0.0" as const;

// ---------------------------------------------------------------------------
// Field-level schema descriptor
// ---------------------------------------------------------------------------

/**
 * Describes a single field on the TaskAgentMapping entity.
 *
 * Used in `TaskAgentMappingEntitySchemaDef.fields` for documentation, GUI
 * meta-panel rendering, and ontology diff generation.
 */
export interface TaskAgentMappingEntityFieldDef {
  /** Field name as it appears on the TaskAgentMappingEntity object. */
  readonly name: string;
  /**
   * JSON Schema type string or compact union notation.
   * E.g. "string", "number", "boolean".
   */
  readonly type: string;
  /** Whether this field must be present on every valid TaskAgentMapping instance. */
  readonly required: boolean;
  /** Human-readable description of the field's semantics. */
  readonly description: string;
  /**
   * For enum-typed fields: the allowed string values.
   * Absent for non-enum fields.
   */
  readonly enum_values?: readonly string[];
}

// ---------------------------------------------------------------------------
// Entity schema descriptor interface
// ---------------------------------------------------------------------------

/**
 * Formal descriptor for the TaskAgentMapping GUI model entity.
 *
 * Consumed by:
 *   • `readOntologySchema()` — includes it in `domain_entity_schemas`
 *   • VerificationContractSyncer — entity_present clause on TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID
 *   • 3D meta panel — renders field definitions in the self-improvement view
 *   • SchemaMutationProposer — detects drift between descriptor and live code
 */
export interface TaskAgentMappingEntitySchemaDef {
  /** Stable schema_id for this entity: "gui_model:TaskAgentMapping". */
  readonly schema_id: typeof TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID;
  /** Human-readable entity name. */
  readonly name: "TaskAgentMapping";
  /** Schema namespace: "gui_model" (renderer-consumable projection). */
  readonly namespace: "gui_model";
  /** Schema version string (semver). */
  readonly version: string;
  /**
   * Ontology level: domain — this entity drives visible 3D objects in the
   * command-center scene (connector arcs, task orbs, HUD cards).
   */
  readonly level: "domain";
  /** Ordered field definitions for the entity. */
  readonly fields: readonly TaskAgentMappingEntityFieldDef[];
  /** JSON Schema (draft-07) representation of the entity. */
  readonly json_schema: Record<string, unknown>;
  /**
   * Behavioral contract: what this entity IS and DOES.
   * Describes the entity's lifecycle and relationships, not just its shape.
   */
  readonly behavioral_contract: string;
  /** Names of reducers that own or manage this entity's lifecycle. */
  readonly owned_by_reducers: readonly string[];
}

// ---------------------------------------------------------------------------
// Canonical schema descriptor — the single source of truth
// ---------------------------------------------------------------------------

/**
 * The canonical TaskAgentMapping entity schema descriptor.
 *
 * This is the authoritative definition of the TaskAgentMapping entity's shape
 * in the ontology. The ontology reader (`readOntologySchema()`) includes this
 * entry in its `domain_entity_schemas` list, making TaskAgentMapping a
 * recognized first-class entity type in the system.
 *
 * Required fields (per Sub-AC 5 Sub-AC 1 specification):
 *
 *   mapping_id        — deterministic composite key "<agentId>:<taskId>".
 *                       Stable across re-renders; usable as React key or
 *                       Three.js object name.  Enables O(1) lookup from the
 *                       rendering pipeline.
 *
 *   source_agent_id   — the agent performing the task (connector arc origin).
 *                       Corresponds to AgentDef.agentId in the agent store.
 *
 *   target_task_id    — the task being performed (connector arc target).
 *                       Corresponds to TaskRecord.taskId in the task store.
 *
 * Renderer-computed fields (present on every fully-built entity):
 *
 *   priority          — task priority enum (critical|high|normal|low).
 *                       Drives PointLight budget allocation and orb mesh color.
 *
 *   status            — task lifecycle status.
 *                       Drives the is_visible_in_scene predicate and beam color.
 *
 *   assigned_ts       — Unix ms timestamp when the mapping was established.
 *                       Used for elapsed-time display in TaskMappingHUD.
 *
 *   is_visible_in_scene — boolean; true if status ∈ SCENE_VISIBLE_STATUSES.
 *                         Renderers MUST check this before creating Three.js objects.
 *
 *   priority_color    — hex color string for the task orb mesh.
 *
 *   status_beam_color — hex color string for the connector beam line.
 */
export const TASK_AGENT_MAPPING_ENTITY_SCHEMA: TaskAgentMappingEntitySchemaDef =
  Object.freeze({
    schema_id: TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    name:      "TaskAgentMapping",
    namespace: "gui_model",
    version:   TASK_AGENT_MAPPING_ENTITY_SCHEMA_VERSION,
    level:     "domain",

    behavioral_contract:
      "Represents the live assignment relationship between a source agent and a target task: " +
      "pre-computed renderer entity with stable composite key (mapping_id = agentId:taskId), " +
      "agent reference (source_agent_id) and task reference (target_task_id); " +
      "drives 3D connector arc geometry, task orb mesh, and TaskMappingHUD cards; " +
      "visibility governed by SCENE_VISIBLE_STATUSES predicate (is_visible_in_scene); " +
      "PointLight budget allocated by urgency (priority then status); " +
      "queryable from the rendering pipeline via buildAllMappingEntities, " +
      "getVisibleMappingEntities, getMappingEntitiesForAgent, getMappingEntityForTask.",

    owned_by_reducers: Object.freeze([
      "TaskReducer",
      "TimelineReducer",
      "SQLiteReducer",
    ]),

    fields: Object.freeze([
      {
        name:        "mapping_id",
        type:        "string",
        required:    true,
        description:
          "Deterministic composite key: '<agentId>:<taskId>'. " +
          "Stable across re-renders; usable as React key or Three.js object name.",
      },
      {
        name:        "source_agent_id",
        type:        "string",
        required:    true,
        description:
          "The agent performing the task — connector arc origin. " +
          "Corresponds to AgentDef.agentId in the agent store.",
      },
      {
        name:        "target_task_id",
        type:        "string",
        required:    true,
        description:
          "The task being performed — connector arc target. " +
          "Corresponds to TaskRecord.taskId in the task store.",
      },
      {
        name:        "priority",
        type:        "string",
        required:    true,
        description:
          "Task priority — drives PointLight budget allocation and orb mesh color.",
        enum_values: ["critical", "high", "normal", "low"],
      },
      {
        name:        "status",
        type:        "string",
        required:    true,
        description:
          "Task lifecycle status — drives the is_visible_in_scene predicate and beam color.",
        enum_values: [
          "draft", "planned", "assigned", "active",
          "blocked", "review", "done", "failed", "cancelled",
        ],
      },
      {
        name:        "assigned_ts",
        type:        "number",
        required:    true,
        description:
          "Unix timestamp (ms) when this mapping was established. " +
          "Used for elapsed-time display in TaskMappingHUD.",
      },
      {
        name:        "is_visible_in_scene",
        type:        "boolean",
        required:    true,
        description:
          "True if this mapping should generate a 3D connector arc. " +
          "Derived from SCENE_VISIBLE_STATUSES.has(status). " +
          "Renderers MUST check this flag before creating Three.js objects.",
      },
      {
        name:        "priority_color",
        type:        "string",
        required:    true,
        description:
          "Hex color string for the task orb mesh and emissive glow. " +
          "Derived from TASK_PRIORITY_COLOR[priority].",
      },
      {
        name:        "status_beam_color",
        type:        "string",
        required:    true,
        description:
          "Hex color string for the connector beam line. " +
          "Derived from TASK_STATUS_BEAM_COLOR[status].",
      },
    ] as const),

    json_schema: Object.freeze({
      $schema:     "http://json-schema.org/draft-07/schema#",
      $id:         TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
      title:       "TaskAgentMapping",
      description:
        "A renderer-consumable task-agent mapping entity in the 3D command-center. " +
        "Represents the live assignment between one agent and one task. " +
        "Drives connector arc geometry, task orb meshes, and HUD cards.",
      type:     "object",
      required: [
        "mapping_id",
        "source_agent_id",
        "target_task_id",
        "priority",
        "status",
        "assigned_ts",
        "is_visible_in_scene",
        "priority_color",
        "status_beam_color",
      ],
      properties: Object.freeze({
        mapping_id: {
          type:        "string",
          description: "Deterministic '<agentId>:<taskId>' composite key",
        },
        source_agent_id: {
          type:        "string",
          description: "ID of the agent performing the task (connector arc origin)",
        },
        target_task_id: {
          type:        "string",
          description: "ID of the task being performed (connector arc target)",
        },
        priority: {
          type:        "string",
          enum:        ["critical", "high", "normal", "low"],
          description: "Task priority — drives PointLight budget and orb color",
        },
        status: {
          type:        "string",
          enum:        [
            "draft", "planned", "assigned", "active",
            "blocked", "review", "done", "failed", "cancelled",
          ],
          description: "Task lifecycle status — drives visibility predicate and beam color",
        },
        assigned_ts: {
          type:        "number",
          description: "Unix ms timestamp when the mapping was established",
        },
        is_visible_in_scene: {
          type:        "boolean",
          description: "True if status is in SCENE_VISIBLE_STATUSES; renderer visibility gate",
        },
        priority_color: {
          type:        "string",
          description: "Hex color (#rrggbb) for the task orb mesh",
        },
        status_beam_color: {
          type:        "string",
          description: "Hex color (#rrggbb) for the connector beam line",
        },
      }),
      additionalProperties: false,
    }),
  }) satisfies TaskAgentMappingEntitySchemaDef;

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Type guard — narrows an unknown value to TaskAgentMappingEntitySchemaDef.
 *
 * Checks the structural minimum: correct schema_id, name, namespace, and level.
 */
export function isTaskAgentMappingEntitySchemaDef(
  v: unknown,
): v is TaskAgentMappingEntitySchemaDef {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    m["schema_id"] === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID &&
    m["name"]      === "TaskAgentMapping"                  &&
    m["namespace"] === "gui_model"                         &&
    m["level"]     === "domain"                            &&
    Array.isArray(m["fields"])                             &&
    typeof m["json_schema"] === "object"
  );
}
