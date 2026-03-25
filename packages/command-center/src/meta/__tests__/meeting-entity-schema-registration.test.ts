/**
 * meeting-entity-schema-registration.test.ts
 * Sub-AC 10.1 — Meeting entity schema definition and registration tests.
 *
 * Verifies that:
 *   10.1-MES-1  MEETING_ENTITY_SCHEMA is exported from @conitens/protocol
 *   10.1-MES-2  MEETING_ENTITY_SCHEMA_ID equals "payload:Meeting"
 *   10.1-MES-3  schema has protocol_phase field with correct enum values
 *   10.1-MES-4  schema has participant_agent_ids field (array<string>)
 *   10.1-MES-5  schema has gather_coordinates field (Vec3 | null)
 *   10.1-MES-6  schema has spawned_task_ids field (array<string>)
 *   10.1-MES-7  JSON schema requires meeting_id, room_id, protocol_phase,
 *               participant_agent_ids, spawned_task_ids
 *   10.1-MES-8  isMeetingEntitySchemaDef() correctly narrows the type
 *   10.1-MES-9  MEETING_ENTITY_SCHEMA is registered in OntologySnapshot.domain_entity_schemas
 *   10.1-MES-10 DomainEntityEntry for Meeting has level="domain", namespace="payload"
 *   10.1-MES-11 domain_entity_schemas contributes to total_entries count
 *   10.1-MES-12 MEETING_PROTOCOL_PHASES = [convene, deliberate, resolve, adjourn]
 *   10.1-MES-13 isMeetingProtocolPhase() type guard works correctly
 *   10.1-MES-14 Meeting entity schema is included in getEntriesByLevel("domain")
 *   10.1-MES-15 Meeting interface has gather_coordinates and spawned_task_ids fields
 *   10.1-MES-16 createMeeting() initializes gather_coordinates and spawned_task_ids
 *   10.1-MES-17 applyMeetingEvent() populates spawned_task_ids from meeting.task.spawned
 *   10.1-MES-18 applyMeetingEvent() keeps protocol_phase in sync with stage
 */

import { describe, it, expect } from "vitest";
import {
  MEETING_ENTITY_SCHEMA,
  MEETING_ENTITY_SCHEMA_ID,
  MEETING_ENTITY_SCHEMA_VERSION,
  MEETING_PROTOCOL_PHASES,
  isMeetingProtocolPhase,
  isMeetingEntitySchemaDef,
  // Meeting domain entity
  createMeeting,
  applyMeetingEvent,
  isMeeting,
  type Meeting,
} from "@conitens/protocol";
import {
  readOntologySchema,
  getEntriesByLevel,
  type DomainEntityEntry,
} from "../ontology-schema-reader.js";

// ---------------------------------------------------------------------------
// Schema descriptor tests
// ---------------------------------------------------------------------------

describe("MEETING_ENTITY_SCHEMA (Sub-AC 10.1 — schema descriptor)", () => {
  it("10.1-MES-1: MEETING_ENTITY_SCHEMA is exported from @conitens/protocol", () => {
    expect(MEETING_ENTITY_SCHEMA).toBeDefined();
    expect(typeof MEETING_ENTITY_SCHEMA).toBe("object");
  });

  it("10.1-MES-2: MEETING_ENTITY_SCHEMA_ID equals 'payload:Meeting'", () => {
    expect(MEETING_ENTITY_SCHEMA_ID).toBe("payload:Meeting");
    expect(MEETING_ENTITY_SCHEMA.schema_id).toBe("payload:Meeting");
  });

  it("10.1-MES-3: schema has protocol_phase field with correct enum values", () => {
    const phaseField = MEETING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "protocol_phase",
    );
    expect(phaseField).toBeDefined();
    expect(phaseField!.required).toBe(true);
    expect(phaseField!.enum_values).toBeDefined();
    expect(Array.from(phaseField!.enum_values!)).toEqual([
      "convene",
      "deliberate",
      "resolve",
      "adjourn",
    ]);
  });

  it("10.1-MES-4: schema has participant_agent_ids field of type array<string>", () => {
    const field = MEETING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "participant_agent_ids",
    );
    expect(field).toBeDefined();
    expect(field!.required).toBe(true);
    expect(field!.type).toContain("array");
    expect(field!.type.toLowerCase()).toContain("string");
  });

  it("10.1-MES-5: schema has gather_coordinates field of type Vec3 | null", () => {
    const field = MEETING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "gather_coordinates",
    );
    expect(field).toBeDefined();
    expect(field!.type).toContain("Vec3");
    expect(field!.type).toContain("null");
  });

  it("10.1-MES-6: schema has spawned_task_ids field of type array<string>", () => {
    const field = MEETING_ENTITY_SCHEMA.fields.find(
      (f) => f.name === "spawned_task_ids",
    );
    expect(field).toBeDefined();
    expect(field!.required).toBe(true);
    expect(field!.type).toContain("array");
    expect(field!.type.toLowerCase()).toContain("string");
  });

  it("10.1-MES-7: JSON schema requires correct fields", () => {
    const required = MEETING_ENTITY_SCHEMA.json_schema["required"] as string[];
    expect(Array.isArray(required)).toBe(true);
    expect(required).toContain("meeting_id");
    expect(required).toContain("room_id");
    expect(required).toContain("protocol_phase");
    expect(required).toContain("participant_agent_ids");
    expect(required).toContain("spawned_task_ids");
  });

  it("10.1-MES-7b: JSON schema protocol_phase has correct enum values", () => {
    const props = MEETING_ENTITY_SCHEMA.json_schema["properties"] as Record<string, unknown>;
    expect(props).toBeDefined();
    const pprop = props["protocol_phase"] as Record<string, unknown>;
    expect(pprop).toBeDefined();
    const enumVals = pprop["enum"] as string[];
    expect(Array.isArray(enumVals)).toBe(true);
    expect(enumVals).toEqual(["convene", "deliberate", "resolve", "adjourn"]);
  });

  it("10.1-MES-8: isMeetingEntitySchemaDef() correctly narrows the type", () => {
    expect(isMeetingEntitySchemaDef(MEETING_ENTITY_SCHEMA)).toBe(true);
    expect(isMeetingEntitySchemaDef(null)).toBe(false);
    expect(isMeetingEntitySchemaDef({})).toBe(false);
    expect(isMeetingEntitySchemaDef({ schema_id: "wrong", name: "Meeting", namespace: "payload", level: "domain", fields: [], json_schema: {} })).toBe(false);
    expect(isMeetingEntitySchemaDef({ schema_id: "payload:Meeting", name: "Meeting", namespace: "payload", level: "domain", fields: [], json_schema: {} })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Protocol phase tests
// ---------------------------------------------------------------------------

describe("MEETING_PROTOCOL_PHASES (Sub-AC 10.1)", () => {
  it("10.1-MES-12: MEETING_PROTOCOL_PHASES contains all four canonical phases", () => {
    expect(Array.from(MEETING_PROTOCOL_PHASES)).toEqual([
      "convene",
      "deliberate",
      "resolve",
      "adjourn",
    ]);
  });

  it("10.1-MES-13: isMeetingProtocolPhase() type guard works correctly", () => {
    expect(isMeetingProtocolPhase("convene")).toBe(true);
    expect(isMeetingProtocolPhase("deliberate")).toBe(true);
    expect(isMeetingProtocolPhase("resolve")).toBe(true);
    expect(isMeetingProtocolPhase("adjourn")).toBe(true);
    expect(isMeetingProtocolPhase("unknown")).toBe(false);
    expect(isMeetingProtocolPhase("")).toBe(false);
    expect(isMeetingProtocolPhase(42)).toBe(false);
    expect(isMeetingProtocolPhase(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ontology registration tests
// ---------------------------------------------------------------------------

describe("Meeting entity in OntologySnapshot (Sub-AC 10.1)", () => {
  it("10.1-MES-9: MEETING_ENTITY_SCHEMA is in domain_entity_schemas", () => {
    const snap = readOntologySchema();
    expect(snap.domain_entity_schemas).toBeDefined();
    expect(Array.isArray(snap.domain_entity_schemas)).toBe(true);
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === MEETING_ENTITY_SCHEMA_ID,
    );
    expect(entry).toBeDefined();
  });

  it("10.1-MES-10: DomainEntityEntry has level='domain' and namespace='payload'", () => {
    const snap = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === MEETING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("domain");
    expect(entry!.namespace).toBe("payload");
    expect(entry!.entity_name).toBe("Meeting");
  });

  it("10.1-MES-11: domain_entity_schemas contributes to total_entries", () => {
    const snap = readOntologySchema();
    const manual =
      snap.event_types.length +
      snap.command_types.length +
      snap.reducers.length +
      snap.schema_registry.length +
      snap.domain_entity_schemas.length;
    expect(snap.total_entries).toBe(manual);
    expect(snap.domain_entity_schemas.length).toBeGreaterThanOrEqual(1);
  });

  it("10.1-MES-14: meeting entity appears in getEntriesByLevel('domain')", () => {
    const snap = readOntologySchema();
    const domainEntries = getEntriesByLevel(snap, "domain");
    const meetingEntry = domainEntries.find((e) => e.schema_id === MEETING_ENTITY_SCHEMA_ID);
    expect(meetingEntry).toBeDefined();
  });

  it("10.1-MES-10b: DomainEntityEntry has required_fields from JSON schema", () => {
    const snap = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === MEETING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(Array.isArray(entry!.required_fields)).toBe(true);
    expect(entry!.required_fields).toContain("protocol_phase");
    expect(entry!.required_fields).toContain("participant_agent_ids");
    expect(entry!.required_fields).toContain("spawned_task_ids");
  });

  it("10.1-MES-10c: DomainEntityEntry has correct owned_by_reducers", () => {
    const snap = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === MEETING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(entry!.owned_by_reducers).toContain("MeetingReducer");
    expect(entry!.owned_by_reducers).toContain("TimelineReducer");
    expect(entry!.owned_by_reducers).toContain("SQLiteReducer");
  });

  it("10.1-MES-10d: DomainEntityEntry has non-empty behavioral_contract", () => {
    const snap = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === MEETING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(typeof entry!.behavioral_contract).toBe("string");
    expect(entry!.behavioral_contract.length).toBeGreaterThan(20);
  });

  it("10.1-MES-10e: DomainEntityEntry version matches MEETING_ENTITY_SCHEMA_VERSION", () => {
    const snap = readOntologySchema();
    const entry = snap.domain_entity_schemas.find(
      (e) => e.schema_id === MEETING_ENTITY_SCHEMA_ID,
    ) as DomainEntityEntry | undefined;
    expect(entry).toBeDefined();
    expect(entry!.version).toBe(MEETING_ENTITY_SCHEMA_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Meeting domain entity (meeting-state.ts) tests
// ---------------------------------------------------------------------------

describe("Meeting interface fields (Sub-AC 10.1)", () => {
  it("10.1-MES-15: Meeting interface has gather_coordinates and spawned_task_ids", () => {
    const meeting = createMeeting({ meeting_id: "mtg-001", room_id: "room-a" });
    expect("gather_coordinates"   in meeting).toBe(true);
    expect("spawned_task_ids"     in meeting).toBe(true);
    expect("participant_agent_ids" in meeting).toBe(true);
    expect("protocol_phase"       in meeting).toBe(true);
  });

  it("10.1-MES-16: createMeeting() initializes gather_coordinates=null and spawned_task_ids=[]", () => {
    const meeting = createMeeting({ meeting_id: "mtg-001", room_id: "room-a" });
    expect(meeting.gather_coordinates).toBeNull();
    expect(meeting.spawned_task_ids).toEqual([]);
    expect(meeting.participant_agent_ids).toEqual([]);
    expect(meeting.protocol_phase).toBe("convene");
    expect(meeting.stage).toBe("convene");
  });

  it("10.1-MES-16b: createMeeting() accepts gather_coordinates in input", () => {
    const coords = { x: 1.5, y: 0, z: 2.5 };
    const meeting = createMeeting({
      meeting_id: "mtg-002",
      room_id:    "room-b",
      gather_coordinates: coords,
    });
    expect(meeting.gather_coordinates).toEqual(coords);
  });

  it("10.1-MES-17: applyMeetingEvent() populates spawned_task_ids from meeting.task.spawned", () => {
    const meeting = createMeeting({ meeting_id: "mtg-001", room_id: "room-a" });
    expect(meeting.spawned_task_ids).toHaveLength(0);

    const spawnEvent = {
      id:            "evt-001",
      type:          "meeting.task.spawned" as const,
      ts:            Date.now(),
      actor:         { id: "system", kind: "system" as const },
      correlation_id: "mtg-001",
      payload: {
        meeting_id:    "mtg-001",
        room_id:       "room-a",
        task_id:       "task-abc",
        resolution_id: "res-001",
        title:         "Implement feature X",
        assigned_to:   "agent-1",
        priority:      3 as const,
        spawned_at:    new Date().toISOString(),
      },
    };

    const updated = applyMeetingEvent(meeting, spawnEvent);
    expect(updated.spawned_task_ids).toContain("task-abc");
    expect(updated.spawned_task_ids).toHaveLength(1);
  });

  it("10.1-MES-17b: applyMeetingEvent() is idempotent for duplicate task IDs", () => {
    const meeting = createMeeting({ meeting_id: "mtg-001", room_id: "room-a" });

    const spawnEvent = {
      id:            "evt-001",
      type:          "meeting.task.spawned" as const,
      ts:            Date.now(),
      actor:         { id: "system", kind: "system" as const },
      correlation_id: "mtg-001",
      payload: {
        meeting_id:    "mtg-001",
        room_id:       "room-a",
        task_id:       "task-abc",
        resolution_id: "res-001",
        title:         "Implement feature X",
        assigned_to:   "agent-1",
        priority:      3 as const,
        spawned_at:    new Date().toISOString(),
      },
    };

    const once  = applyMeetingEvent(meeting, spawnEvent);
    const twice = applyMeetingEvent(once,    spawnEvent);
    expect(twice.spawned_task_ids).toHaveLength(1);
  });

  it("10.1-MES-18: applyMeetingEvent() keeps protocol_phase in sync with stage", () => {
    const meeting = createMeeting({ meeting_id: "mtg-001", room_id: "room-a" });
    expect(meeting.protocol_phase).toBe("convene");
    expect(meeting.stage).toBe("convene");

    // Advance to deliberate
    const delibEvent = {
      id:            "evt-002",
      type:          "meeting.deliberation" as const,
      ts:            Date.now(),
      actor:         { id: "agent-1", kind: "agent" as const },
      correlation_id: "mtg-001",
      payload: {
        meeting_id:  "mtg-001",
        room_id:     "room-a",
        initiated_by: "agent-1",
      },
    };

    const deliberating = applyMeetingEvent(meeting, delibEvent);
    expect(deliberating.stage).toBe("deliberate");
    expect(deliberating.protocol_phase).toBe("deliberate");
  });

  it("10.1-MES-18b: isMeeting() validates new required fields", () => {
    const meeting = createMeeting({ meeting_id: "mtg-003", room_id: "room-c" });
    expect(isMeeting(meeting)).toBe(true);

    // Object missing protocol_phase should fail
    const noPhase = { ...meeting };
    delete (noPhase as Partial<Meeting>).protocol_phase;
    expect(isMeeting(noPhase)).toBe(false);

    // Object missing spawned_task_ids should fail
    const noTaskIds = { ...meeting };
    delete (noTaskIds as Partial<Meeting>).spawned_task_ids;
    expect(isMeeting(noTaskIds)).toBe(false);
  });
});
