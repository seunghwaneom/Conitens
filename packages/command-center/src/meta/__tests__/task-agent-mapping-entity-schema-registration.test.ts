/**
 * task-agent-mapping-entity-schema-registration.test.ts
 * Sub-AC 5 (Sub-AC 1) — task_agent_mapping entity schema definition and
 * registration tests.
 *
 * Verifies that:
 *   5-TAM-1  TASK_AGENT_MAPPING_ENTITY_SCHEMA is exported from @conitens/protocol
 *   5-TAM-2  TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID equals "gui_model:TaskAgentMapping"
 *   5-TAM-3  schema has mapping_id field (required, string)
 *   5-TAM-4  schema has source_agent_id field referencing an agent (required, string)
 *   5-TAM-5  schema has target_task_id field referencing a task (required, string)
 *   5-TAM-6  schema has priority field with correct enum values
 *   5-TAM-7  schema has status field with correct enum values
 *   5-TAM-8  schema has is_visible_in_scene boolean field
 *   5-TAM-9  JSON schema requires all nine fields
 *   5-TAM-10 isTaskAgentMappingEntitySchemaDef() type guard works correctly
 *   5-TAM-11 TASK_AGENT_MAPPING_ENTITY_SCHEMA is registered in OntologySnapshot.domain_entity_schemas
 *   5-TAM-12 DomainEntityEntry has level="domain", namespace="gui_model"
 *   5-TAM-13 domain_entity_schemas still contributes to total_entries (stability check)
 *   5-TAM-14 TaskAgentMapping entity appears in getEntriesByLevel("domain")
 *   5-TAM-15 DomainEntityEntry has required_fields including mapping_id, source_agent_id, target_task_id
 *   5-TAM-16 DomainEntityEntry has non-empty behavioral_contract
 *   5-TAM-17 DomainEntityEntry version matches TASK_AGENT_MAPPING_ENTITY_SCHEMA_VERSION
 *   5-TAM-18 DomainEntityEntry has correct owned_by_reducers
 *   5-TAM-19 Meeting entity schema is still present after TaskAgentMapping registration (stability)
 *   5-TAM-20 total_entries reflects addition of TaskAgentMapping entity
 */

import { describe, it, expect } from "vitest";
import {
  TASK_AGENT_MAPPING_ENTITY_SCHEMA,
  TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
  TASK_AGENT_MAPPING_ENTITY_SCHEMA_VERSION,
  isTaskAgentMappingEntitySchemaDef,
  MEETING_ENTITY_SCHEMA_ID,
} from "@conitens/protocol";
import {
  readOntologySchema,
  getEntriesByLevel,
  type DomainEntityEntry,
} from "../ontology-schema-reader.js";

// ---------------------------------------------------------------------------
// Schema descriptor tests
// ---------------------------------------------------------------------------

describe("TASK_AGENT_MAPPING_ENTITY_SCHEMA (Sub-AC 5 Sub-AC 1 — schema descriptor)", () => {
  it("5-TAM-1: TASK_AGENT_MAPPING_ENTITY_SCHEMA is exported from @conitens/protocol", () => {
    expect(TASK_AGENT_MAPPING_ENTITY_SCHEMA).toBeDefined();
    expect(typeof TASK_AGENT_MAPPING_ENTITY_SCHEMA).toBe("object");
  });

  it("5-TAM-2: TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID equals 'gui_model:TaskAgentMapping'", () => {
    expect(TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID).toBe("gui_model:TaskAgentMapping");
    expect(TASK_AGENT_MAPPING_ENTITY_SCHEMA.schema_id).toBe(
      "gui_model:TaskAgentMapping",
    );
  });

  it("5-TAM-3: schema has mapping_id field (required, string)", () => {
    const field = TASK_AGENT_MAPPING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "mapping_id",
    );
    expect(field).toBeDefined();
    expect(field!.required).toBe(true);
    expect(field!.type).toBe("string");
  });

  it("5-TAM-4: schema has source_agent_id field that references an agent (required, string)", () => {
    const field = TASK_AGENT_MAPPING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "source_agent_id",
    );
    expect(field).toBeDefined();
    expect(field!.required).toBe(true);
    expect(field!.type).toBe("string");
    // Description must mention agent
    expect(field!.description.toLowerCase()).toContain("agent");
  });

  it("5-TAM-5: schema has target_task_id field that references a task (required, string)", () => {
    const field = TASK_AGENT_MAPPING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "target_task_id",
    );
    expect(field).toBeDefined();
    expect(field!.required).toBe(true);
    expect(field!.type).toBe("string");
    // Description must mention task
    expect(field!.description.toLowerCase()).toContain("task");
  });

  it("5-TAM-6: schema has priority field with correct enum values", () => {
    const field = TASK_AGENT_MAPPING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "priority",
    );
    expect(field).toBeDefined();
    expect(field!.required).toBe(true);
    expect(field!.enum_values).toBeDefined();
    expect(Array.from(field!.enum_values!)).toEqual([
      "critical",
      "high",
      "normal",
      "low",
    ]);
  });

  it("5-TAM-7: schema has status field with correct enum values", () => {
    const field = TASK_AGENT_MAPPING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "status",
    );
    expect(field).toBeDefined();
    expect(field!.required).toBe(true);
    expect(field!.enum_values).toBeDefined();
    const statusValues = Array.from(field!.enum_values!);
    expect(statusValues).toContain("active");
    expect(statusValues).toContain("assigned");
    expect(statusValues).toContain("blocked");
    expect(statusValues).toContain("review");
    expect(statusValues).toContain("done");
    expect(statusValues).toContain("cancelled");
    expect(statusValues).toContain("failed");
    expect(statusValues).toContain("draft");
    expect(statusValues).toContain("planned");
  });

  it("5-TAM-8: schema has is_visible_in_scene boolean field", () => {
    const field = TASK_AGENT_MAPPING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "is_visible_in_scene",
    );
    expect(field).toBeDefined();
    expect(field!.required).toBe(true);
    expect(field!.type).toBe("boolean");
  });

  it("5-TAM-9: JSON schema requires all nine core fields", () => {
    const required = TASK_AGENT_MAPPING_ENTITY_SCHEMA.json_schema[
      "required"
    ] as string[];
    expect(Array.isArray(required)).toBe(true);
    expect(required).toContain("mapping_id");
    expect(required).toContain("source_agent_id");
    expect(required).toContain("target_task_id");
    expect(required).toContain("priority");
    expect(required).toContain("status");
    expect(required).toContain("assigned_ts");
    expect(required).toContain("is_visible_in_scene");
    expect(required).toContain("priority_color");
    expect(required).toContain("status_beam_color");
  });

  it("5-TAM-9b: JSON schema priority property has correct enum values", () => {
    const props = TASK_AGENT_MAPPING_ENTITY_SCHEMA.json_schema[
      "properties"
    ] as Record<string, unknown>;
    expect(props).toBeDefined();
    const priorityProp = props["priority"] as Record<string, unknown>;
    expect(priorityProp).toBeDefined();
    const enumVals = priorityProp["enum"] as string[];
    expect(Array.isArray(enumVals)).toBe(true);
    expect(enumVals).toEqual(["critical", "high", "normal", "low"]);
  });

  it("5-TAM-10: isTaskAgentMappingEntitySchemaDef() type guard works correctly", () => {
    expect(isTaskAgentMappingEntitySchemaDef(TASK_AGENT_MAPPING_ENTITY_SCHEMA)).toBe(true);
    expect(isTaskAgentMappingEntitySchemaDef(null)).toBe(false);
    expect(isTaskAgentMappingEntitySchemaDef({})).toBe(false);
    expect(
      isTaskAgentMappingEntitySchemaDef({
        schema_id: "wrong",
        name: "TaskAgentMapping",
        namespace: "gui_model",
        level: "domain",
        fields: [],
        json_schema: {},
      }),
    ).toBe(false);
    expect(
      isTaskAgentMappingEntitySchemaDef({
        schema_id: "gui_model:TaskAgentMapping",
        name: "TaskAgentMapping",
        namespace: "gui_model",
        level: "domain",
        fields: [],
        json_schema: {},
      }),
    ).toBe(true);
    // Wrong namespace should fail
    expect(
      isTaskAgentMappingEntitySchemaDef({
        schema_id: "gui_model:TaskAgentMapping",
        name: "TaskAgentMapping",
        namespace: "payload",   // wrong namespace
        level: "domain",
        fields: [],
        json_schema: {},
      }),
    ).toBe(false);
    // Wrong name should fail
    expect(
      isTaskAgentMappingEntitySchemaDef({
        schema_id: "gui_model:TaskAgentMapping",
        name: "WrongName",
        namespace: "gui_model",
        level: "domain",
        fields: [],
        json_schema: {},
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ontology registration tests
// ---------------------------------------------------------------------------

describe("TaskAgentMapping entity in OntologySnapshot (Sub-AC 5 Sub-AC 1)", () => {
  it("5-TAM-11: TASK_AGENT_MAPPING_ENTITY_SCHEMA is in domain_entity_schemas", () => {
    const snap = readOntologySchema();
    expect(snap.domain_entity_schemas).toBeDefined();
    expect(Array.isArray(snap.domain_entity_schemas)).toBe(true);
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    );
    expect(entry).toBeDefined();
  });

  it("5-TAM-12: DomainEntityEntry has level='domain' and namespace='gui_model'", () => {
    const snap  = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("domain");
    expect(entry!.namespace).toBe("gui_model");
    expect(entry!.entity_name).toBe("TaskAgentMapping");
  });

  it("5-TAM-13: domain_entity_schemas still contributes to total_entries", () => {
    const snap = readOntologySchema();
    const manual =
      snap.event_types.length +
      snap.command_types.length +
      snap.reducers.length +
      snap.schema_registry.length +
      snap.domain_entity_schemas.length;
    expect(snap.total_entries).toBe(manual);
    // Should have at least Meeting + TaskAgentMapping = 2 domain entities
    expect(snap.domain_entity_schemas.length).toBeGreaterThanOrEqual(2);
  });

  it("5-TAM-14: TaskAgentMapping entity appears in getEntriesByLevel('domain')", () => {
    const snap         = readOntologySchema();
    const domainEntries = getEntriesByLevel(snap, "domain");
    const tamEntry = domainEntries.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    );
    expect(tamEntry).toBeDefined();
  });

  it("5-TAM-15: DomainEntityEntry has required_fields including mapping_id, source_agent_id, target_task_id", () => {
    const snap  = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(Array.isArray(entry!.required_fields)).toBe(true);
    expect(entry!.required_fields).toContain("mapping_id");
    expect(entry!.required_fields).toContain("source_agent_id");
    expect(entry!.required_fields).toContain("target_task_id");
  });

  it("5-TAM-16: DomainEntityEntry has non-empty behavioral_contract", () => {
    const snap  = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(typeof entry!.behavioral_contract).toBe("string");
    expect(entry!.behavioral_contract.length).toBeGreaterThan(20);
    // Should mention agent and task relationships
    expect(entry!.behavioral_contract.toLowerCase()).toContain("agent");
    expect(entry!.behavioral_contract.toLowerCase()).toContain("task");
  });

  it("5-TAM-17: DomainEntityEntry version matches TASK_AGENT_MAPPING_ENTITY_SCHEMA_VERSION", () => {
    const snap  = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(entry!.version).toBe(TASK_AGENT_MAPPING_ENTITY_SCHEMA_VERSION);
  });

  it("5-TAM-18: DomainEntityEntry has correct owned_by_reducers", () => {
    const snap  = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(entry!.owned_by_reducers).toContain("TaskReducer");
    expect(entry!.owned_by_reducers).toContain("TimelineReducer");
  });

  it("5-TAM-19: Meeting entity schema is still present (stability check)", () => {
    const snap = readOntologySchema();
    // Adding TaskAgentMapping must not remove or break Meeting registration
    const meetingEntry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === MEETING_ENTITY_SCHEMA_ID,
    );
    expect(meetingEntry).toBeDefined();
    expect(meetingEntry!.entity_name).toBe("Meeting");
    expect(meetingEntry!.level).toBe("domain");
  });

  it("5-TAM-20: total_entries reflects TaskAgentMapping entity (at least Meeting + TAM = 2)", () => {
    const snap = readOntologySchema();
    // We know there are at least 2 domain entity schemas registered now
    const tamEntry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    );
    const meetingEntry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === MEETING_ENTITY_SCHEMA_ID,
    );
    expect(tamEntry).toBeDefined();
    expect(meetingEntry).toBeDefined();
    // total_entries includes both
    expect(snap.total_entries).toBeGreaterThanOrEqual(
      snap.event_types.length +
      snap.command_types.length +
      snap.reducers.length +
      snap.schema_registry.length +
      2, // at least Meeting + TaskAgentMapping
    );
  });
});

// ---------------------------------------------------------------------------
// Rendering pipeline queryability test
// ---------------------------------------------------------------------------

describe("TaskAgentMapping queryable from rendering pipeline (Sub-AC 5 Sub-AC 1)", () => {
  it("5-TAM-R1: schema_id is a stable reference queryable from OntologySnapshot", () => {
    // This verifies the rendering pipeline can look up the schema by ID
    const snap = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === "gui_model:TaskAgentMapping",
    );
    expect(entry).toBeDefined();
    expect(entry!.schema_id).toBe("gui_model:TaskAgentMapping");
  });

  it("5-TAM-R2: entity required_fields contains the agent ID and task ID references", () => {
    const snap  = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    // These are the two key references that enable rendering pipeline queries
    expect(entry!.required_fields).toContain("source_agent_id");
    expect(entry!.required_fields).toContain("target_task_id");
  });

  it("5-TAM-R3: entity behavioral_contract mentions rendering pipeline queryability", () => {
    const snap  = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === TASK_AGENT_MAPPING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    // Should reference rendering pipeline query functions
    const contract = entry!.behavioral_contract.toLowerCase();
    expect(contract).toContain("rendering") || expect(contract).toContain("pipeline");
  });
});
