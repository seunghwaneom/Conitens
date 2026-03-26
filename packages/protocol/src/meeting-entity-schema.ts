/**
 * @module meeting-entity-schema
 * Sub-AC 10.1 — Formal meeting entity schema descriptor.
 *
 * Defines the canonical schema for the Meeting domain entity, including the
 * four required fields specified in the ontology contract:
 *
 *   protocol_phase       — enum (convene | deliberate | resolve | adjourn)
 *   participant_agent_ids — string[] of participating agent identifiers
 *   gather_coordinates   — Vec3 | null; 3D spatial gather point inside room mesh
 *   spawned_task_ids     — string[] of task IDs produced at the resolve stage
 *
 * The schema is registered under namespace "payload" with schema_id
 * "payload:Meeting", making it recognizable as a valid entity type by the
 * ontology system.  The ontology reader includes this descriptor in the
 * `domain_entity_schemas` list so the spec verifier can check for its
 * presence via the standard entity_present clause mechanism.
 *
 * Design constraints:
 *   • Pure value module — no side effects, no infrastructure dependency.
 *   • Backward-compatible: existing Meeting events are not altered.
 *   • The `protocol_phase` field mirrors `MeetingStage` exactly — no new
 *     runtime enum is introduced; the schema descriptor simply names it
 *     canonically for the ontology record.
 */

import type { MeetingStage } from "./meeting-state.js";

// ---------------------------------------------------------------------------
// Schema identity constants
// ---------------------------------------------------------------------------

/** Stable schema_id for the Meeting domain entity: "payload:Meeting". */
export const MEETING_ENTITY_SCHEMA_ID = "payload:Meeting" as const;

/** Version of this entity schema descriptor. Follows semver. */
export const MEETING_ENTITY_SCHEMA_VERSION = "1.0.0" as const;

// ---------------------------------------------------------------------------
// Protocol phase — the four canonical stages
// ---------------------------------------------------------------------------

/**
 * The four canonical protocol phases of a meeting.
 *
 * Mirrors `MeetingStage` from meeting-state.ts but named "protocol_phase"
 * in the entity schema context to make the domain language explicit in
 * the ontology record.
 *
 * The lifecycle flows left-to-right:
 *   convene → deliberate → resolve → adjourn
 */
export const MEETING_PROTOCOL_PHASES = [
  "convene",
  "deliberate",
  "resolve",
  "adjourn",
] as const satisfies readonly MeetingStage[];

export type MeetingProtocolPhase = (typeof MEETING_PROTOCOL_PHASES)[number];

/** O(1) membership test for meeting protocol phases. */
export const MEETING_PROTOCOL_PHASE_SET: ReadonlySet<string> =
  new Set(MEETING_PROTOCOL_PHASES);

/** Type guard — narrows an unknown value to a MeetingProtocolPhase. */
export function isMeetingProtocolPhase(s: unknown): s is MeetingProtocolPhase {
  return typeof s === "string" && MEETING_PROTOCOL_PHASE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Field-level schema descriptor
// ---------------------------------------------------------------------------

/**
 * Describes a single field on the Meeting domain entity.
 *
 * Used in `MeetingEntitySchemaDef.fields` for documentation, GUI meta-panel
 * rendering, and ontology diff generation.
 */
export interface MeetingEntityFieldDef {
  /** Field name as it appears on the Meeting domain entity object. */
  readonly name: string;
  /**
   * JSON Schema type string or compact union notation.
   * E.g. "string", "array<string>", "Vec3 | null", "boolean".
   */
  readonly type: string;
  /** Whether this field must be present on every valid Meeting instance. */
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
// Entity schema descriptor
// ---------------------------------------------------------------------------

/**
 * Formal descriptor for the Meeting domain entity.
 *
 * Consumed by:
 *   • `readOntologySchema()` — includes it in `domain_entity_schemas`
 *   • VerificationContractSyncer — entity_present clause on MEETING_ENTITY_SCHEMA_ID
 *   • 3D meta panel — renders field definitions in the self-improvement view
 *   • SchemaMutationProposer — detects drift between descriptor and live code
 */
export interface MeetingEntitySchemaDef {
  /** Stable schema_id for this entity: "payload:Meeting". */
  readonly schema_id: typeof MEETING_ENTITY_SCHEMA_ID;
  /** Human-readable entity name. */
  readonly name: "Meeting";
  /** Schema namespace: "payload" (domain entity data structure). */
  readonly namespace: "payload";
  /** Schema version string (semver). */
  readonly version: string;
  /**
   * Ontology level: domain — this entity exists in the world and is
   * rendered as a visible object in the 3D command-center.
   */
  readonly level: "domain";
  /** Ordered field definitions for the entity. */
  readonly fields: readonly MeetingEntityFieldDef[];
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
 * The canonical Meeting entity schema descriptor.
 *
 * This is the authoritative definition of the Meeting entity's shape in the
 * ontology.  The ontology reader (`readOntologySchema()`) includes this
 * entry in its `domain_entity_schemas` list, making the Meeting entity
 * a recognized first-class entity type in the system.
 *
 * Required fields (per Sub-AC 10.1 specification):
 *
 *   protocol_phase       — enum(convene | deliberate | resolve | adjourn)
 *                          The current stage of the four-phase meeting protocol.
 *                          Drives the diegetic stage indicator in the 3D room mesh.
 *
 *   participant_agent_ids — string[]
 *                           IDs of agents (and users) currently in the meeting.
 *                           Wired into the agent ontology for avatar positioning.
 *
 *   gather_coordinates   — { x, y, z } | null
 *                           3D spatial coordinates inside the room mesh where
 *                           agent avatars visually converge during the meeting.
 *                           null when no explicit gather point has been set.
 *
 *   spawned_task_ids     — string[]
 *                           IDs of tasks produced when the meeting reaches the
 *                           resolve stage.  Closes the causal chain from
 *                           deliberation → concrete work items.
 */
export const MEETING_ENTITY_SCHEMA: MeetingEntitySchemaDef = Object.freeze({
  schema_id: MEETING_ENTITY_SCHEMA_ID,
  name:      "Meeting",
  namespace: "payload",
  version:   MEETING_ENTITY_SCHEMA_VERSION,
  level:     "domain",

  behavioral_contract:
    "Represents a room-based collaboration session between agents: " +
    "lifecycle governed by four-phase protocol_phase state machine " +
    "(convene → deliberate → resolve → adjourn); " +
    "participants tracked by agent ID and visually gathered at gather_coordinates " +
    "in the 3D room mesh; " +
    "concrete output captured as spawned_task_ids at the resolve stage.",

  owned_by_reducers: Object.freeze([
    "MeetingReducer",
    "TimelineReducer",
    "SQLiteReducer",
  ]),

  fields: Object.freeze([
    {
      name:        "meeting_id",
      type:        "string",
      required:    true,
      description: "Globally unique identifier for this meeting session",
    },
    {
      name:        "room_id",
      type:        "string",
      required:    true,
      description: "The room in which the meeting takes place (links to RoomDef in room registry)",
    },
    {
      name:        "protocol_phase",
      type:        "string",
      required:    true,
      description:
        "Current protocol phase of the meeting — the canonical four-stage lifecycle " +
        "that drives stage indicators in the 3D room mesh",
      enum_values: MEETING_PROTOCOL_PHASES,
    },
    {
      name:        "participant_agent_ids",
      type:        "array<string>",
      required:    true,
      description:
        "IDs of agents and users currently participating; " +
        "used to position agent avatars at gather_coordinates during the session",
    },
    {
      name:        "gather_coordinates",
      type:        "Vec3 | null",
      required:    false,
      description:
        "3D spatial coordinates (x/y/z) where agent avatars visually converge " +
        "in the room mesh during the meeting; null if no explicit gather point is set",
    },
    {
      name:        "spawned_task_ids",
      type:        "array<string>",
      required:    true,
      description:
        "IDs of tasks spawned when the meeting reaches the resolve stage; " +
        "closes the causal chain from deliberation outcome → concrete work items",
    },
  ] as const),

  json_schema: Object.freeze({
    $schema:     "http://json-schema.org/draft-07/schema#",
    $id:         MEETING_ENTITY_SCHEMA_ID,
    title:       "Meeting",
    description:
      "A room-based collaboration session between agents in the 3D command-center. " +
      "Lifecycle managed via a four-stage protocol (convene→deliberate→resolve→adjourn). " +
      "Rendered as a visual gathering in a room mesh.",
    type:     "object",
    required: [
      "meeting_id",
      "room_id",
      "protocol_phase",
      "participant_agent_ids",
      "spawned_task_ids",
    ],
    properties: Object.freeze({
      meeting_id: {
        type:        "string",
        description: "Globally unique meeting identifier",
      },
      room_id: {
        type:        "string",
        description: "Room where the meeting takes place (matches a RoomDef id)",
      },
      protocol_phase: {
        type:        "string",
        enum:        ["convene", "deliberate", "resolve", "adjourn"],
        description:
          "Current protocol phase — drives the diegetic stage indicator in the 3D room mesh",
      },
      participant_agent_ids: {
        type:        "array",
        items:       { type: "string" },
        description: "Agent (and user) IDs currently participating in the meeting",
      },
      gather_coordinates: {
        description:
          "3D spatial position where agents visually congregate; null if not yet placed",
        oneOf: [
          { type: "null" },
          {
            type:       "object",
            required:   ["x", "y", "z"],
            properties: {
              x: { type: "number", description: "X axis coordinate" },
              y: { type: "number", description: "Y axis coordinate (vertical)" },
              z: { type: "number", description: "Z axis coordinate" },
            },
            additionalProperties: false,
          },
        ],
      },
      spawned_task_ids: {
        type:        "array",
        items:       { type: "string" },
        description: "Task IDs produced when the meeting reaches the resolve phase",
      },
    }),
    additionalProperties: true,
  }),
}) satisfies MeetingEntitySchemaDef;

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Type guard — narrows an unknown value to MeetingEntitySchemaDef.
 *
 * Checks the structural minimum: correct schema_id, name, namespace, and level.
 */
export function isMeetingEntitySchemaDef(v: unknown): v is MeetingEntitySchemaDef {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    m["schema_id"] === MEETING_ENTITY_SCHEMA_ID &&
    m["name"]      === "Meeting"                &&
    m["namespace"] === "payload"                &&
    m["level"]     === "domain"                 &&
    Array.isArray(m["fields"])                  &&
    typeof m["json_schema"] === "object"
  );
}
