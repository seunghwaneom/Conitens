/**
 * ontology-schema-reader.test.ts
 * Sub-AC 11a — Tests for the ontology schema reader.
 *
 * Coverage:
 *   11a-SR-1  readOntologySchema() returns a non-empty OntologySnapshot
 *   11a-SR-2  snapshot contains all EVENT_TYPES from protocol package
 *   11a-SR-3  snapshot contains all GUI_COMMAND_TYPES from protocol package
 *   11a-SR-4  snapshot contains all REDUCERS from protocol package
 *   11a-SR-5  schema_registry satisfies reflexive closure (all SCHEMA_EVENT_TYPES present)
 *   11a-SR-6  total_entries matches sum of sub-lists
 *   11a-SR-7  every EventTypeEntry has a non-empty behavioral_contract
 *   11a-SR-8  every EventTypeEntry has a non-empty owned_by_reducers list
 *   11a-SR-9  schema.* events are classified as "meta" level
 *   11a-SR-10 command.* and pipeline.* events are classified as "infrastructure" level
 *   11a-SR-11 task.* and agent.* events are classified as "domain" level
 *   11a-SR-12 interaction.* events are classified as "meta" level
 *   11a-SR-13 fixture.* events are classified as "infrastructure" level
 *   11a-SR-14 layout.* events are classified as "infrastructure" level
 *   11a-SR-15 snapshot is immutable (frozen)
 *   11a-SR-16 snapshot_id is unique across multiple calls
 *   11a-SR-17 schema_version matches SCHEMA_VERSION from protocol
 *   11a-SR-18 findEventTypeEntry() returns correct entry
 *   11a-SR-19 getEntriesByLevel() partitions correctly
 *   11a-SR-20 summarizeSnapshot() returns non-empty string
 *   11a-SR-21 ReducerEntry.input_events matches REDUCERS descriptor
 *   11a-SR-22 no duplicate schema_ids across all namespaces
 *   11a-SR-23 schema_registry entries carry behavioral contracts
 */

import { describe, it, expect } from "vitest";
import {
  EVENT_TYPES,
  GUI_COMMAND_TYPES,
  REDUCERS,
  SCHEMA_EVENT_TYPES,
  SCHEMA_VERSION,
} from "@conitens/protocol";
import {
  readOntologySchema,
  findEventTypeEntry,
  getEntriesByLevel,
  summarizeSnapshot,
} from "../ontology-schema-reader.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot() {
  return readOntologySchema();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("readOntologySchema()", () => {
  it("11a-SR-1: returns a non-null OntologySnapshot with all required fields", () => {
    const snap = makeSnapshot();
    expect(snap).toBeDefined();
    expect(snap.snapshot_id).toBeTruthy();
    expect(snap.captured_at_ms).toBeGreaterThan(0);
    expect(snap.schema_version).toBeTruthy();
    expect(snap.total_entries).toBeGreaterThan(0);
    expect(Array.isArray(snap.event_types)).toBe(true);
    expect(Array.isArray(snap.command_types)).toBe(true);
    expect(Array.isArray(snap.reducers)).toBe(true);
    expect(Array.isArray(snap.schema_registry)).toBe(true);
  });

  it("11a-SR-2: event_types contains every EventType from protocol package", () => {
    const snap = makeSnapshot();
    const snappedTypes = new Set(snap.event_types.map((e) => e.event_type));
    for (const et of EVENT_TYPES) {
      expect(snappedTypes.has(et), `Missing event_type: ${et}`).toBe(true);
    }
    expect(snap.event_types.length).toBe(EVENT_TYPES.length);
  });

  it("11a-SR-3: command_types contains every GuiCommandType from protocol package", () => {
    const snap = makeSnapshot();
    const snappedCmds = new Set(snap.command_types.map((c) => c.command_type));
    for (const ct of GUI_COMMAND_TYPES) {
      expect(snappedCmds.has(ct), `Missing command_type: ${ct}`).toBe(true);
    }
    expect(snap.command_types.length).toBe(GUI_COMMAND_TYPES.length);
  });

  it("11a-SR-4: reducers contains every ReducerDescriptor from protocol package", () => {
    const snap = makeSnapshot();
    const snappedReducers = new Set(snap.reducers.map((r) => r.reducer_name));
    for (const r of REDUCERS) {
      expect(snappedReducers.has(r.name), `Missing reducer: ${r.name}`).toBe(true);
    }
    expect(snap.reducers.length).toBe(REDUCERS.length);
  });

  it("11a-SR-5: schema_registry satisfies reflexive closure — all SCHEMA_EVENT_TYPES present", () => {
    const snap = makeSnapshot();
    const snappedSchemaTypes = new Set(snap.schema_registry.map((s) => s.schema_event_type));
    for (const set of SCHEMA_EVENT_TYPES) {
      expect(snappedSchemaTypes.has(set), `Missing schema_registry entry: ${set}`).toBe(true);
    }
    expect(snap.schema_registry.length).toBe(SCHEMA_EVENT_TYPES.length);
  });

  it("11a-SR-6: total_entries equals sum of all sub-list lengths", () => {
    const snap = makeSnapshot();
    const expected =
      snap.event_types.length +
      snap.command_types.length +
      snap.reducers.length +
      snap.schema_registry.length +
      // Sub-AC 10.1: domain_entity_schemas (e.g. Meeting) are now included
      snap.domain_entity_schemas.length;
    expect(snap.total_entries).toBe(expected);
  });

  it("11a-SR-7: every EventTypeEntry has a non-empty behavioral_contract", () => {
    const snap = makeSnapshot();
    for (const e of snap.event_types) {
      expect(e.behavioral_contract, `Empty contract for ${e.event_type}`).toBeTruthy();
      expect(e.behavioral_contract.length, `Short contract for ${e.event_type}`).toBeGreaterThan(10);
    }
  });

  it("11a-SR-8: every EventTypeEntry has at least one owner (wildcard reducers supply coverage)", () => {
    const snap = makeSnapshot();
    // TimelineReducer and SQLiteReducer consume all events (wildcard)
    const wildcardReducers = REDUCERS
      .filter((r) => r.inputEvents === "*")
      .map((r) => r.name);
    expect(wildcardReducers.length).toBeGreaterThan(0);

    for (const e of snap.event_types) {
      expect(
        e.owned_by_reducers.length,
        `No owners for ${e.event_type}`,
      ).toBeGreaterThan(0);
    }
  });

  it("11a-SR-9: schema.* events are classified as level='meta'", () => {
    const snap = makeSnapshot();
    const schemaEvents = snap.event_types.filter((e) =>
      e.event_type.startsWith("schema."),
    );
    expect(schemaEvents.length).toBeGreaterThan(0);
    for (const e of schemaEvents) {
      expect(e.level, `${e.event_type} should be meta`).toBe("meta");
    }
  });

  it("11a-SR-10: command.* and pipeline.* events are classified as level='infrastructure'", () => {
    const snap = makeSnapshot();
    const infraEvents = snap.event_types.filter((e) =>
      e.event_type.startsWith("command.") || e.event_type.startsWith("pipeline."),
    );
    expect(infraEvents.length).toBeGreaterThan(0);
    for (const e of infraEvents) {
      expect(e.level, `${e.event_type} should be infrastructure`).toBe("infrastructure");
    }
  });

  it("11a-SR-11: task.* and agent.* events are classified as level='domain'", () => {
    const snap = makeSnapshot();
    const domainEvents = snap.event_types.filter((e) =>
      e.event_type.startsWith("task.") || e.event_type.startsWith("agent."),
    );
    expect(domainEvents.length).toBeGreaterThan(0);
    for (const e of domainEvents) {
      expect(e.level, `${e.event_type} should be domain`).toBe("domain");
    }
  });

  it("11a-SR-12: interaction.* events are classified as level='meta'", () => {
    const snap = makeSnapshot();
    const interactionEvents = snap.event_types.filter((e) =>
      e.event_type.startsWith("interaction."),
    );
    expect(interactionEvents.length).toBeGreaterThan(0);
    for (const e of interactionEvents) {
      expect(e.level, `${e.event_type} should be meta`).toBe("meta");
    }
  });

  it("11a-SR-13: fixture.* events are classified as level='infrastructure'", () => {
    const snap = makeSnapshot();
    const fixtureEvents = snap.event_types.filter((e) =>
      e.event_type.startsWith("fixture."),
    );
    expect(fixtureEvents.length).toBeGreaterThan(0);
    for (const e of fixtureEvents) {
      expect(e.level, `${e.event_type} should be infrastructure`).toBe("infrastructure");
    }
  });

  it("11a-SR-14: layout.* events are classified as level='infrastructure'", () => {
    const snap = makeSnapshot();
    const layoutEvents = snap.event_types.filter((e) =>
      e.event_type.startsWith("layout."),
    );
    expect(layoutEvents.length).toBeGreaterThan(0);
    for (const e of layoutEvents) {
      expect(e.level, `${e.event_type} should be infrastructure`).toBe("infrastructure");
    }
  });

  it("11a-SR-15: snapshot and all sub-lists are frozen (immutable)", () => {
    const snap = makeSnapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.event_types)).toBe(true);
    expect(Object.isFrozen(snap.command_types)).toBe(true);
    expect(Object.isFrozen(snap.reducers)).toBe(true);
    expect(Object.isFrozen(snap.schema_registry)).toBe(true);
    expect(Object.isFrozen(snap.warnings)).toBe(true);
  });

  it("11a-SR-16: snapshot_id is unique across multiple calls", () => {
    const ids = new Set(Array.from({ length: 10 }, () => makeSnapshot().snapshot_id));
    // With timestamp + random component, all 10 should be unique
    expect(ids.size).toBe(10);
  });

  it("11a-SR-17: schema_version matches SCHEMA_VERSION from protocol package", () => {
    const snap = makeSnapshot();
    expect(snap.schema_version).toBe(SCHEMA_VERSION);
  });

  it("11a-SR-18: findEventTypeEntry() returns the correct entry by event type", () => {
    const snap = makeSnapshot();
    const entry = findEventTypeEntry(snap, "task.created");
    expect(entry).toBeDefined();
    expect(entry?.event_type).toBe("task.created");
    expect(entry?.level).toBe("domain");
    expect(entry?.family).toBe("task");
    expect(entry?.schema_id).toBe("event_type:task.created");
    expect(entry?.namespace).toBe("event_type");
  });

  it("11a-SR-18b: findEventTypeEntry() returns undefined for unknown type", () => {
    const snap = makeSnapshot();
    const entry = findEventTypeEntry(snap, "nonexistent.type");
    expect(entry).toBeUndefined();
  });

  it("11a-SR-19: getEntriesByLevel() correctly partitions entries by level", () => {
    const snap = makeSnapshot();

    const domainEntries = getEntriesByLevel(snap, "domain");
    const infraEntries = getEntriesByLevel(snap, "infrastructure");
    const metaEntries = getEntriesByLevel(snap, "meta");

    // Every entry should appear exactly once
    const total = domainEntries.length + infraEntries.length + metaEntries.length;
    expect(total).toBe(snap.total_entries);

    // Domain should contain task.*, agent.*, handoff.*, decision.*, etc.
    const domainSchemaIds = domainEntries.map((e) => e.schema_id);
    expect(domainSchemaIds.some((id) => id.startsWith("event_type:task."))).toBe(true);
    expect(domainSchemaIds.some((id) => id.startsWith("event_type:agent."))).toBe(true);

    // Infrastructure should contain reducers and commands
    const infraSchemaIds = infraEntries.map((e) => e.schema_id);
    expect(infraSchemaIds.some((id) => id.startsWith("reducer:"))).toBe(true);
    expect(infraSchemaIds.some((id) => id.startsWith("command_type:"))).toBe(true);

    // Meta should contain schema.* events and schema_registry entries
    const metaSchemaIds = metaEntries.map((e) => e.schema_id);
    expect(metaSchemaIds.some((id) => id.startsWith("event_type:schema."))).toBe(true);
    expect(metaSchemaIds.some((id) => id.startsWith("schema_registry:"))).toBe(true);
  });

  it("11a-SR-20: summarizeSnapshot() returns a non-empty descriptive string", () => {
    const snap = makeSnapshot();
    const summary = summarizeSnapshot(snap);
    expect(summary).toBeTruthy();
    expect(summary).toContain("OntologySnapshot");
    expect(summary).toContain("total=");
    expect(summary).toContain("events=");
    expect(summary).toContain("rooms=");
  });

  it("11a-SR-21: ReducerEntry.input_events matches protocol REDUCERS descriptor", () => {
    const snap = makeSnapshot();
    for (const rd of REDUCERS) {
      const entry = snap.reducers.find((r) => r.reducer_name === rd.name);
      expect(entry, `Missing reducer ${rd.name}`).toBeDefined();

      if (rd.inputEvents === "*") {
        expect(entry!.input_events).toBe("*");
      } else {
        expect(Array.isArray(entry!.input_events)).toBe(true);
        const arr = entry!.input_events as string[];
        expect(arr.length).toBe(rd.inputEvents.length);
        for (const et of rd.inputEvents) {
          expect(arr, `Reducer ${rd.name} missing inputEvent ${et}`).toContain(et);
        }
      }
    }
  });

  it("11a-SR-22: no duplicate schema_ids across all namespaces", () => {
    const snap = makeSnapshot();
    const all = [
      ...snap.event_types.map((e) => e.schema_id),
      ...snap.command_types.map((c) => c.schema_id),
      ...snap.reducers.map((r) => r.schema_id),
      ...snap.schema_registry.map((s) => s.schema_id),
    ];
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });

  it("11a-SR-23: schema_registry entries carry non-empty behavioral contracts", () => {
    const snap = makeSnapshot();
    for (const sr of snap.schema_registry) {
      expect(
        sr.behavioral_contract,
        `Empty contract for schema_registry ${sr.schema_event_type}`,
      ).toBeTruthy();
      expect(sr.behavioral_contract.length).toBeGreaterThan(20);
    }
  });

  it("11a-SR-24: every CommandTypeEntry has a non-empty behavioral_contract", () => {
    const snap = makeSnapshot();
    for (const c of snap.command_types) {
      expect(
        c.behavioral_contract,
        `Empty contract for command_type ${c.command_type}`,
      ).toBeTruthy();
    }
  });

  it("11a-SR-25: ReducerEntry behavioral_contract summarizes owned files and events", () => {
    const snap = makeSnapshot();
    for (const r of snap.reducers) {
      expect(
        r.behavioral_contract,
        `Empty contract for reducer ${r.reducer_name}`,
      ).toBeTruthy();
      expect(r.behavioral_contract).toContain(r.reducer_name);
    }
  });
});
