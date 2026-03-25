/**
 * verification-contract-sync.test.ts
 * Sub-AC 11.4 — Tests for VerificationContractSyncer.
 *
 * Coverage:
 *   11.4-VCS-1   deriveFromSnapshot() produces generation-0 contract
 *   11.4-VCS-2   deriveFromSnapshot() includes schema_version_match clause
 *   11.4-VCS-3   deriveFromSnapshot() includes entity_present for every event_type
 *   11.4-VCS-4   deriveFromSnapshot() includes entity_present for every command_type
 *   11.4-VCS-5   deriveFromSnapshot() includes entity_present for every reducer
 *   11.4-VCS-6   deriveFromSnapshot() includes entity_present for every schema_registry entry
 *   11.4-VCS-7   deriveFromSnapshot() includes count_gte per namespace
 *   11.4-VCS-8   deriveFromSnapshot() clauses are sorted (schema_version_match first, then count, entity)
 *   11.4-VCS-9   deriveFromSnapshot() contract is frozen (immutable)
 *   11.4-VCS-10  sync() schema.registered adds entity_present clause and increments count_gte
 *   11.4-VCS-11  sync() schema.registered is idempotent (no-op for already-present schema_id)
 *   11.4-VCS-12  sync() schema.registered invalid payload → no-op (changed=false)
 *   11.4-VCS-13  sync() schema.registered increments generation by 1
 *   11.4-VCS-14  sync() schema.updated updates entity_present clause label and expected_version
 *   11.4-VCS-15  sync() schema.updated for unknown schema_id → no-op
 *   11.4-VCS-16  sync() schema.updated invalid payload → no-op
 *   11.4-VCS-17  sync() schema.updated increments generation by 1
 *   11.4-VCS-18  sync() schema.deprecated transitions entity_present → entity_deprecated
 *   11.4-VCS-19  sync() schema.deprecated decrements count_gte for namespace
 *   11.4-VCS-20  sync() schema.deprecated for unknown schema_id → no-op
 *   11.4-VCS-21  sync() schema.deprecated invalid payload → no-op
 *   11.4-VCS-22  sync() schema.removed transitions entity_present → entity_absent
 *   11.4-VCS-23  sync() schema.removed transitions entity_deprecated → entity_absent
 *   11.4-VCS-24  sync() schema.removed removes active entity and decrements count_gte
 *   11.4-VCS-25  sync() schema.removed for already-absent schema_id → no-op
 *   11.4-VCS-26  sync() schema.removed invalid payload → no-op
 *   11.4-VCS-27  sync() schema.validation_started → no-op (changed=false)
 *   11.4-VCS-28  sync() schema.validated → no-op (changed=false)
 *   11.4-VCS-29  sync() schema.migration_started → no-op (changed=false)
 *   11.4-VCS-30  sync() schema.migrated → no-op (changed=false)
 *   11.4-VCS-31  sync() result contract is frozen (immutable)
 *   11.4-VCS-32  consecutive syncs correctly increment generation
 *   11.4-VCS-33  full lifecycle: register → update → deprecate → remove cycle
 *   11.4-VCS-34  verificationContractSyncer singleton is a VerificationContractSyncer
 *   11.4-VCS-35  useVerificationContractSyncer() returns singleton
 *   11.4-VCS-36  checkClause() entity_present: passes for active, fails for absent/deprecated
 *   11.4-VCS-37  checkClause() entity_deprecated: passes for deprecated, fails for others
 *   11.4-VCS-38  checkClause() entity_absent: passes for removed/undefined, fails for active
 *   11.4-VCS-39  checkClause() count_gte: passes when actual >= min, fails otherwise
 *   11.4-VCS-40  checkClause() schema_version_match: passes for exact match, fails otherwise
 *   11.4-VCS-41  checkContract() returns ordered results matching clauses array
 *   11.4-VCS-42  summarizeContractCheck() returns correct pass/fail summary
 *   11.4-VCS-43  deriveFromSnapshot() empty snapshot produces minimal contract
 *   11.4-VCS-44  sync() schema.registered with new namespace creates count_gte clause
 *   11.4-VCS-45  sync() count_gte floor is 0 (never negative)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  VerificationContractSyncer,
  verificationContractSyncer,
  useVerificationContractSyncer,
  checkClause,
  checkContract,
  summarizeContractCheck,
  type VerificationContract,
  type VerificationClause,
  type ClauseRegistryView,
} from "../verification-contract-sync.js";
import type { OntologySnapshot } from "../ontology-schema-reader.js";
import type {
  SchemaRegisteredPayload,
  SchemaUpdatedPayload,
  SchemaDeprecatedPayload,
  SchemaRemovedPayload,
  SchemaValidatedPayload,
  SchemaValidationStartedPayload,
  SchemaMigrationStartedPayload,
  SchemaMigratedPayload,
} from "@conitens/protocol";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMinimalSnapshot(
  overrides: Partial<OntologySnapshot> = {},
): OntologySnapshot {
  return {
    snapshot_id: "ontology-snap-test-0001",
    captured_at_ms: 1_000_000,
    schema_version: "1.0.0",
    total_entries: 0,
    event_types: [],
    command_types: [],
    reducers: [],
    schema_registry: [],
    room_count: 0,
    warnings: [],
    ...overrides,
  } as OntologySnapshot;
}

function makeSnapshotWithEntries(): OntologySnapshot {
  return {
    snapshot_id: "ontology-snap-test-full",
    captured_at_ms: 2_000_000,
    schema_version: "1.2.0",
    total_entries: 4,
    event_types: [
      {
        schema_id: "event_type:task.created",
        event_type: "task.created" as any,
        level: "domain",
        family: "task",
        namespace: "event_type",
        behavioral_contract: "Creates a task",
        owned_by_reducers: ["TaskReducer"],
      },
      {
        schema_id: "event_type:agent.spawned",
        event_type: "agent.spawned" as any,
        level: "domain",
        family: "agent",
        namespace: "event_type",
        behavioral_contract: "Spawns an agent",
        owned_by_reducers: ["AgentReducer"],
      },
    ],
    command_types: [
      {
        schema_id: "command_type:agent.spawn",
        command_type: "agent.spawn" as any,
        level: "infrastructure",
        namespace: "command_type",
        behavioral_contract: "Requests agent spawn",
      },
    ],
    reducers: [
      {
        schema_id: "reducer:TaskReducer",
        reducer_name: "TaskReducer",
        level: "infrastructure",
        namespace: "reducer",
        owned_files: ["tasks.md"],
        input_events: ["task.created"],
        reads_from: [],
        behavioral_contract: "Processes task events",
      },
    ],
    schema_registry: [
      {
        schema_id: "schema_registry:schema.registered",
        schema_event_type: "schema.registered" as any,
        level: "meta",
        namespace: "protocol",
        behavioral_contract: "Records schema registration",
      },
    ],
    room_count: 5,
    warnings: [],
  } as unknown as OntologySnapshot;
}

const REGISTERED_PAYLOAD: SchemaRegisteredPayload = {
  schema_id: "event_type:new.event",
  namespace: "event_type",
  name: "new.event",
  version: "1.0.0",
  registered_by: "system",
  registered_at_ms: 3_000_000,
};

const UPDATED_PAYLOAD: SchemaUpdatedPayload = {
  schema_id: "event_type:task.created",
  namespace: "event_type",
  name: "task.created",
  prev_version: "1.0.0",
  next_version: "1.1.0",
  changes: [{ change_type: "field_added", description: "Added agent_id field" }],
  updated_by: "agent",
  updated_at_ms: 3_000_001,
};

const DEPRECATED_PAYLOAD: SchemaDeprecatedPayload = {
  schema_id: "event_type:task.created",
  namespace: "event_type",
  name: "task.created",
  version: "1.1.0",
  deprecation_reason: "Superseded by task.initiated",
  replacement_schema_id: "event_type:task.initiated",
  deprecated_by: "operator",
  deprecated_at_ms: 3_000_002,
};

const REMOVED_PAYLOAD: SchemaRemovedPayload = {
  schema_id: "event_type:task.created",
  namespace: "event_type",
  name: "task.created",
  version: "1.1.0",
  removal_reason: "Migration complete",
  migration_applied: true,
  removed_by: "operator",
  removed_at_ms: 3_000_003,
};

const VALIDATION_STARTED_PAYLOAD: SchemaValidationStartedPayload = {
  validation_run_id: "vr-001",
  scope: "full",
  initiated_by: "system",
};

const VALIDATED_PAYLOAD: SchemaValidatedPayload = {
  validation_run_id: "vr-001",
  scope: "full",
  schemas_checked: 10,
  schemas_valid: 10,
  schemas_invalid: 0,
  passed: true,
  validated_by: "system",
  validated_at_ms: 3_000_100,
};

const MIGRATION_STARTED_PAYLOAD: SchemaMigrationStartedPayload = {
  migration_run_id: "mr-001",
  from_version: "1.0.0",
  to_version: "1.1.0",
  target_event_types: ["event_type:task.created"],
  dry_run: false,
  initiated_by: "operator",
};

const MIGRATED_PAYLOAD: SchemaMigratedPayload = {
  migration_run_id: "mr-001",
  from_version: "1.0.0",
  to_version: "1.1.0",
  events_migrated: 50,
  dry_run: false,
  migrated_event_types: ["event_type:task.created"],
  migrated_by: "operator",
  migrated_at_ms: 3_000_200,
};

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeRegistryView(overrides: {
  statuses?: Record<string, "active" | "deprecated" | "removed">;
  counts?: Record<string, number>;
  schemaVersion?: string;
}): ClauseRegistryView {
  const { statuses = {}, counts = {}, schemaVersion = "1.0.0" } = overrides;
  return {
    getStatus: (id) => statuses[id],
    countActive: (ns) => counts[ns] ?? 0,
    getCurrentSchemaVersion: () => schemaVersion,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("VerificationContractSyncer", () => {
  let syncer: VerificationContractSyncer;

  beforeEach(() => {
    syncer = new VerificationContractSyncer();
  });

  // ── deriveFromSnapshot ─────────────────────────────────────────────────────

  describe("deriveFromSnapshot()", () => {
    it("11.4-VCS-1 produces a generation-0 contract", () => {
      const snap = makeMinimalSnapshot();
      const contract = syncer.deriveFromSnapshot(snap);
      expect(contract.generation).toBe(0);
    });

    it("11.4-VCS-2 includes schema_version_match clause", () => {
      const snap = makeMinimalSnapshot({ schema_version: "2.0.0" });
      const contract = syncer.deriveFromSnapshot(snap);
      const clause = contract.clauses.find((c) => c.kind === "schema_version_match");
      expect(clause).toBeDefined();
      expect(clause!.expected_version).toBe("2.0.0");
    });

    it("11.4-VCS-3 includes entity_present for every event_type", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);
      for (const et of snap.event_types) {
        const clause = contract.clauses.find(
          (c) => c.schema_id === et.schema_id && c.kind === "entity_present",
        );
        expect(clause).toBeDefined();
      }
    });

    it("11.4-VCS-4 includes entity_present for every command_type", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);
      for (const ct of snap.command_types) {
        const clause = contract.clauses.find(
          (c) => c.schema_id === ct.schema_id && c.kind === "entity_present",
        );
        expect(clause).toBeDefined();
      }
    });

    it("11.4-VCS-5 includes entity_present for every reducer", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);
      for (const r of snap.reducers) {
        const clause = contract.clauses.find(
          (c) => c.schema_id === r.schema_id && c.kind === "entity_present",
        );
        expect(clause).toBeDefined();
      }
    });

    it("11.4-VCS-6 includes entity_present for every schema_registry entry", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);
      for (const sr of snap.schema_registry) {
        const clause = contract.clauses.find(
          (c) => c.schema_id === sr.schema_id && c.kind === "entity_present",
        );
        expect(clause).toBeDefined();
      }
    });

    it("11.4-VCS-7 includes count_gte per namespace", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);
      const countClauses = contract.clauses.filter((c) => c.kind === "count_gte");
      // snapshot has event_type (2), command_type (1), reducer (1), protocol (1) → 4 namespaces
      expect(countClauses.length).toBeGreaterThanOrEqual(4);
      const nsSet = new Set(countClauses.map((c) => c.namespace));
      expect(nsSet.has("event_type")).toBe(true);
      expect(nsSet.has("command_type")).toBe(true);
      expect(nsSet.has("reducer")).toBe(true);
      expect(nsSet.has("protocol")).toBe(true);
    });

    it("11.4-VCS-8 schema_version_match clause comes first", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);
      expect(contract.clauses[0]?.kind).toBe("schema_version_match");
    });

    it("11.4-VCS-9 contract is frozen (immutable)", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);
      expect(Object.isFrozen(contract)).toBe(true);
      expect(Object.isFrozen(contract.clauses)).toBe(true);
    });

    it("11.4-VCS-43 empty snapshot produces minimal contract", () => {
      const snap = makeMinimalSnapshot();
      const contract = syncer.deriveFromSnapshot(snap);
      // Only schema_version_match — no count_gte (no namespaces), no entity clauses
      expect(contract.clauses.length).toBe(1);
      expect(contract.clauses[0]!.kind).toBe("schema_version_match");
    });
  });

  // ── sync — schema.registered ───────────────────────────────────────────────

  describe("sync() — schema.registered", () => {
    it("11.4-VCS-10 adds entity_present clause and increments count_gte", () => {
      const snap = makeSnapshotWithEntries();
      let contract = syncer.deriveFromSnapshot(snap);

      const result = syncer.sync(contract, "schema.registered", REGISTERED_PAYLOAD);
      contract = result.contract;

      expect(result.changed).toBe(true);
      expect(result.clauses_added).toBe(1);
      expect(result.schema_id).toBe("event_type:new.event");

      const clause = contract.clauses.find(
        (c) => c.schema_id === "event_type:new.event" && c.kind === "entity_present",
      );
      expect(clause).toBeDefined();
      expect(clause!.expected_version).toBe("1.0.0");
    });

    it("11.4-VCS-11 is idempotent for already-present schema_id", () => {
      const snap = makeSnapshotWithEntries();
      let contract = syncer.deriveFromSnapshot(snap);

      // First registration
      const r1 = syncer.sync(contract, "schema.registered", REGISTERED_PAYLOAD);
      const r2 = syncer.sync(r1.contract, "schema.registered", REGISTERED_PAYLOAD);

      expect(r2.changed).toBe(false);
      expect(r2.contract).toBe(r1.contract); // same reference
    });

    it("11.4-VCS-12 invalid payload → no-op (changed=false)", () => {
      const contract = syncer.deriveFromSnapshot(makeMinimalSnapshot());
      const result = syncer.sync(contract, "schema.registered", { invalid: true });
      expect(result.changed).toBe(false);
      expect(result.contract).toBe(contract);
    });

    it("11.4-VCS-13 increments generation by 1", () => {
      const contract = syncer.deriveFromSnapshot(makeMinimalSnapshot());
      expect(contract.generation).toBe(0);
      const result = syncer.sync(contract, "schema.registered", REGISTERED_PAYLOAD);
      expect(result.contract.generation).toBe(1);
    });

    it("11.4-VCS-44 creates count_gte clause for new namespace", () => {
      const snap = makeMinimalSnapshot(); // empty snapshot — no namespaces
      const contract = syncer.deriveFromSnapshot(snap);

      const result = syncer.sync(contract, "schema.registered", REGISTERED_PAYLOAD);
      const countClause = result.contract.clauses.find(
        (c) => c.kind === "count_gte" && c.namespace === "event_type",
      );
      expect(countClause).toBeDefined();
      expect(countClause!.expected_min_count).toBe(1);
    });
  });

  // ── sync — schema.updated ──────────────────────────────────────────────────

  describe("sync() — schema.updated", () => {
    it("11.4-VCS-14 updates entity_present clause label and expected_version", () => {
      const snap = makeSnapshotWithEntries();
      let contract = syncer.deriveFromSnapshot(snap);

      const result = syncer.sync(contract, "schema.updated", UPDATED_PAYLOAD);
      expect(result.changed).toBe(true);
      expect(result.clauses_updated).toBe(1);

      const clause = result.contract.clauses.find(
        (c) => c.schema_id === "event_type:task.created",
      );
      expect(clause!.expected_version).toBe("1.1.0");
      expect(clause!.label).toContain("1.1.0");
      expect(clause!.label).toContain("1.0.0");
    });

    it("11.4-VCS-15 for unknown schema_id → no-op", () => {
      const contract = syncer.deriveFromSnapshot(makeMinimalSnapshot());
      const result = syncer.sync(contract, "schema.updated", {
        ...UPDATED_PAYLOAD,
        schema_id: "event_type:nonexistent",
      });
      expect(result.changed).toBe(false);
    });

    it("11.4-VCS-16 invalid payload → no-op", () => {
      const contract = syncer.deriveFromSnapshot(makeSnapshotWithEntries());
      const result = syncer.sync(contract, "schema.updated", { invalid: true });
      expect(result.changed).toBe(false);
    });

    it("11.4-VCS-17 increments generation by 1", () => {
      const contract = syncer.deriveFromSnapshot(makeSnapshotWithEntries());
      const result = syncer.sync(contract, "schema.updated", UPDATED_PAYLOAD);
      expect(result.contract.generation).toBe(contract.generation + 1);
    });
  });

  // ── sync — schema.deprecated ───────────────────────────────────────────────

  describe("sync() — schema.deprecated", () => {
    it("11.4-VCS-18 transitions entity_present → entity_deprecated", () => {
      const snap = makeSnapshotWithEntries();
      let contract = syncer.deriveFromSnapshot(snap);

      const result = syncer.sync(contract, "schema.deprecated", DEPRECATED_PAYLOAD);
      expect(result.changed).toBe(true);

      const clause = result.contract.clauses.find(
        (c) => c.schema_id === "event_type:task.created",
      );
      expect(clause!.kind).toBe("entity_deprecated");
      expect(clause!.label).toContain("deprecated");
    });

    it("11.4-VCS-19 decrements count_gte for namespace", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);

      const countBefore = contract.clauses.find(
        (c) => c.kind === "count_gte" && c.namespace === "event_type",
      )!.expected_min_count!;

      const result = syncer.sync(contract, "schema.deprecated", DEPRECATED_PAYLOAD);
      const countAfter = result.contract.clauses.find(
        (c) => c.kind === "count_gte" && c.namespace === "event_type",
      )!.expected_min_count!;

      expect(countAfter).toBe(countBefore - 1);
    });

    it("11.4-VCS-20 for unknown schema_id → no-op", () => {
      const contract = syncer.deriveFromSnapshot(makeMinimalSnapshot());
      const result = syncer.sync(contract, "schema.deprecated", {
        ...DEPRECATED_PAYLOAD,
        schema_id: "event_type:nonexistent",
      });
      expect(result.changed).toBe(false);
    });

    it("11.4-VCS-21 invalid payload → no-op", () => {
      const contract = syncer.deriveFromSnapshot(makeSnapshotWithEntries());
      const result = syncer.sync(contract, "schema.deprecated", { invalid: true });
      expect(result.changed).toBe(false);
    });
  });

  // ── sync — schema.removed ──────────────────────────────────────────────────

  describe("sync() — schema.removed", () => {
    it("11.4-VCS-22 transitions entity_present → entity_absent", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);

      const result = syncer.sync(contract, "schema.removed", REMOVED_PAYLOAD);
      expect(result.changed).toBe(true);

      const clause = result.contract.clauses.find(
        (c) => c.schema_id === "event_type:task.created",
      );
      expect(clause!.kind).toBe("entity_absent");
    });

    it("11.4-VCS-23 transitions entity_deprecated → entity_absent", () => {
      const snap = makeSnapshotWithEntries();
      let contract = syncer.deriveFromSnapshot(snap);

      // First deprecate
      const r1 = syncer.sync(contract, "schema.deprecated", DEPRECATED_PAYLOAD);
      // Then remove
      const r2 = syncer.sync(r1.contract, "schema.removed", REMOVED_PAYLOAD);

      const clause = r2.contract.clauses.find(
        (c) => c.schema_id === "event_type:task.created",
      );
      expect(clause!.kind).toBe("entity_absent");
    });

    it("11.4-VCS-24 decrements count_gte for active entity removal", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);

      const countBefore = contract.clauses.find(
        (c) => c.kind === "count_gte" && c.namespace === "event_type",
      )!.expected_min_count!;

      const result = syncer.sync(contract, "schema.removed", REMOVED_PAYLOAD);
      const countAfter = result.contract.clauses.find(
        (c) => c.kind === "count_gte" && c.namespace === "event_type",
      )!.expected_min_count!;

      expect(countAfter).toBe(countBefore - 1);
    });

    it("11.4-VCS-25 already-absent schema_id → no-op", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);

      const r1 = syncer.sync(contract, "schema.removed", REMOVED_PAYLOAD);
      const r2 = syncer.sync(r1.contract, "schema.removed", REMOVED_PAYLOAD);
      expect(r2.changed).toBe(false);
      expect(r2.contract).toBe(r1.contract);
    });

    it("11.4-VCS-26 invalid payload → no-op", () => {
      const contract = syncer.deriveFromSnapshot(makeSnapshotWithEntries());
      const result = syncer.sync(contract, "schema.removed", { invalid: true });
      expect(result.changed).toBe(false);
    });

    it("11.4-VCS-45 count_gte floor is 0 (never negative)", () => {
      // Start with a snapshot with 1 event_type entry
      const snap: OntologySnapshot = makeSnapshotWithEntries();
      // Remove all event_type entries so count_gte starts at 2, and we remove 2
      const contract = syncer.deriveFromSnapshot(snap);

      const r1 = syncer.sync(contract, "schema.removed", REMOVED_PAYLOAD);
      const r2 = syncer.sync(r1.contract, "schema.removed", {
        ...REMOVED_PAYLOAD,
        schema_id: "event_type:agent.spawned",
        name: "agent.spawned",
      });

      // Count should be 0, not negative
      const countClause = r2.contract.clauses.find(
        (c) => c.kind === "count_gte" && c.namespace === "event_type",
      );
      expect(countClause!.expected_min_count).toBeGreaterThanOrEqual(0);
    });
  });

  // ── sync — non-structural events ───────────────────────────────────────────

  describe("sync() — non-structural events", () => {
    it("11.4-VCS-27 schema.validation_started → no-op", () => {
      const contract = syncer.deriveFromSnapshot(makeSnapshotWithEntries());
      const result = syncer.sync(contract, "schema.validation_started", VALIDATION_STARTED_PAYLOAD);
      expect(result.changed).toBe(false);
      expect(result.contract).toBe(contract);
    });

    it("11.4-VCS-28 schema.validated → no-op", () => {
      const contract = syncer.deriveFromSnapshot(makeSnapshotWithEntries());
      const result = syncer.sync(contract, "schema.validated", VALIDATED_PAYLOAD);
      expect(result.changed).toBe(false);
      expect(result.contract).toBe(contract);
    });

    it("11.4-VCS-29 schema.migration_started → no-op", () => {
      const contract = syncer.deriveFromSnapshot(makeSnapshotWithEntries());
      const result = syncer.sync(contract, "schema.migration_started", MIGRATION_STARTED_PAYLOAD);
      expect(result.changed).toBe(false);
      expect(result.contract).toBe(contract);
    });

    it("11.4-VCS-30 schema.migrated → no-op", () => {
      const contract = syncer.deriveFromSnapshot(makeSnapshotWithEntries());
      const result = syncer.sync(contract, "schema.migrated", MIGRATED_PAYLOAD);
      expect(result.changed).toBe(false);
      expect(result.contract).toBe(contract);
    });
  });

  // ── immutability ──────────────────────────────────────────────────────────

  describe("immutability", () => {
    it("11.4-VCS-31 result contract is frozen (immutable)", () => {
      const contract = syncer.deriveFromSnapshot(makeMinimalSnapshot());
      const result = syncer.sync(contract, "schema.registered", REGISTERED_PAYLOAD);
      expect(Object.isFrozen(result.contract)).toBe(true);
      expect(Object.isFrozen(result.contract.clauses)).toBe(true);
    });
  });

  // ── generation tracking ────────────────────────────────────────────────────

  describe("generation tracking", () => {
    it("11.4-VCS-32 consecutive syncs correctly increment generation", () => {
      const snap = makeSnapshotWithEntries();
      let contract = syncer.deriveFromSnapshot(snap);
      expect(contract.generation).toBe(0);

      const r1 = syncer.sync(contract, "schema.registered", REGISTERED_PAYLOAD);
      expect(r1.contract.generation).toBe(1);

      const r2 = syncer.sync(r1.contract, "schema.updated", UPDATED_PAYLOAD);
      expect(r2.contract.generation).toBe(2);

      const r3 = syncer.sync(r2.contract, "schema.deprecated", DEPRECATED_PAYLOAD);
      expect(r3.contract.generation).toBe(3);

      const r4 = syncer.sync(r3.contract, "schema.removed", REMOVED_PAYLOAD);
      expect(r4.contract.generation).toBe(4);
    });
  });

  // ── full lifecycle cycle ───────────────────────────────────────────────────

  describe("full lifecycle", () => {
    it("11.4-VCS-33 register → update → deprecate → remove cycle", () => {
      const snap = makeMinimalSnapshot();
      let contract = syncer.deriveFromSnapshot(snap);

      // Register
      const r1 = syncer.sync(contract, "schema.registered", REGISTERED_PAYLOAD);
      expect(r1.changed).toBe(true);
      expect(
        r1.contract.clauses.find(
          (c) => c.schema_id === "event_type:new.event" && c.kind === "entity_present",
        ),
      ).toBeDefined();

      // Update
      const updatePayload: SchemaUpdatedPayload = {
        schema_id: "event_type:new.event",
        namespace: "event_type",
        name: "new.event",
        prev_version: "1.0.0",
        next_version: "1.1.0",
        changes: [],
        updated_by: "agent",
      };
      const r2 = syncer.sync(r1.contract, "schema.updated", updatePayload);
      expect(r2.changed).toBe(true);
      expect(
        r2.contract.clauses.find(
          (c) => c.schema_id === "event_type:new.event",
        )!.expected_version,
      ).toBe("1.1.0");

      // Deprecate
      const deprecatePayload: SchemaDeprecatedPayload = {
        schema_id: "event_type:new.event",
        namespace: "event_type",
        name: "new.event",
        version: "1.1.0",
        deprecation_reason: "Replaced",
        deprecated_by: "operator",
      };
      const r3 = syncer.sync(r2.contract, "schema.deprecated", deprecatePayload);
      expect(r3.changed).toBe(true);
      expect(
        r3.contract.clauses.find(
          (c) => c.schema_id === "event_type:new.event",
        )!.kind,
      ).toBe("entity_deprecated");

      // Remove
      const removePayload: SchemaRemovedPayload = {
        schema_id: "event_type:new.event",
        namespace: "event_type",
        name: "new.event",
        version: "1.1.0",
        removal_reason: "Done",
        migration_applied: true,
        removed_by: "operator",
      };
      const r4 = syncer.sync(r3.contract, "schema.removed", removePayload);
      expect(r4.changed).toBe(true);
      expect(
        r4.contract.clauses.find(
          (c) => c.schema_id === "event_type:new.event",
        )!.kind,
      ).toBe("entity_absent");

      // Generation should be 4
      expect(r4.contract.generation).toBe(4);
    });
  });

  // ── singleton ─────────────────────────────────────────────────────────────

  describe("singleton", () => {
    it("11.4-VCS-34 verificationContractSyncer is a VerificationContractSyncer", () => {
      expect(verificationContractSyncer).toBeInstanceOf(VerificationContractSyncer);
    });

    it("11.4-VCS-35 useVerificationContractSyncer() returns singleton", () => {
      expect(useVerificationContractSyncer()).toBe(verificationContractSyncer);
    });
  });

  // ── checkClause ────────────────────────────────────────────────────────────

  describe("checkClause()", () => {
    const activeRegistry = makeRegistryView({
      statuses: { "event_type:task.created": "active" },
      counts: { event_type: 2 },
      schemaVersion: "1.0.0",
    });

    it("11.4-VCS-36 entity_present: passes for active, fails for absent", () => {
      const clause: VerificationClause = {
        clause_id: "entity:event_type:task.created",
        kind: "entity_present",
        schema_id: "event_type:task.created",
        label: "test",
        introduced_at_generation: 0,
        last_updated_at_generation: 0,
      };
      const passResult = checkClause(clause, activeRegistry);
      expect(passResult.passed).toBe(true);

      const missingRegistry = makeRegistryView({});
      const failResult = checkClause(clause, missingRegistry);
      expect(failResult.passed).toBe(false);
    });

    it("11.4-VCS-37 entity_deprecated: passes for deprecated, fails for others", () => {
      const clause: VerificationClause = {
        clause_id: "entity:event_type:old.event",
        kind: "entity_deprecated",
        schema_id: "event_type:old.event",
        label: "test",
        introduced_at_generation: 0,
        last_updated_at_generation: 0,
      };
      const depRegistry = makeRegistryView({
        statuses: { "event_type:old.event": "deprecated" },
        counts: {},
        schemaVersion: "1.0.0",
      });
      expect(checkClause(clause, depRegistry).passed).toBe(true);

      const activeReg = makeRegistryView({
        statuses: { "event_type:old.event": "active" },
        counts: {},
        schemaVersion: "1.0.0",
      });
      expect(checkClause(clause, activeReg).passed).toBe(false);
    });

    it("11.4-VCS-38 entity_absent: passes for removed/undefined, fails for active", () => {
      const clause: VerificationClause = {
        clause_id: "entity:event_type:gone.event",
        kind: "entity_absent",
        schema_id: "event_type:gone.event",
        label: "test",
        introduced_at_generation: 0,
        last_updated_at_generation: 0,
      };
      const removedReg = makeRegistryView({
        statuses: { "event_type:gone.event": "removed" },
        counts: {},
        schemaVersion: "1.0.0",
      });
      expect(checkClause(clause, removedReg).passed).toBe(true);

      const absentReg = makeRegistryView({});
      expect(checkClause(clause, absentReg).passed).toBe(true);

      const activeReg = makeRegistryView({
        statuses: { "event_type:gone.event": "active" },
        counts: {},
        schemaVersion: "1.0.0",
      });
      expect(checkClause(clause, activeReg).passed).toBe(false);
    });

    it("11.4-VCS-39 count_gte: passes when actual >= min, fails otherwise", () => {
      const clause: VerificationClause = {
        clause_id: "count:event_type",
        kind: "count_gte",
        namespace: "event_type",
        expected_min_count: 2,
        label: "test",
        introduced_at_generation: 0,
        last_updated_at_generation: 0,
      };
      const enoughReg = makeRegistryView({ counts: { event_type: 3 } });
      expect(checkClause(clause, enoughReg).passed).toBe(true);

      const exactReg = makeRegistryView({ counts: { event_type: 2 } });
      expect(checkClause(clause, exactReg).passed).toBe(true);

      const tooFewReg = makeRegistryView({ counts: { event_type: 1 } });
      expect(checkClause(clause, tooFewReg).passed).toBe(false);
    });

    it("11.4-VCS-40 schema_version_match: passes for exact match, fails otherwise", () => {
      const clause: VerificationClause = {
        clause_id: "schema_version",
        kind: "schema_version_match",
        expected_version: "1.0.0",
        label: "test",
        introduced_at_generation: 0,
        last_updated_at_generation: 0,
      };
      const matchReg = makeRegistryView({ schemaVersion: "1.0.0" });
      expect(checkClause(clause, matchReg).passed).toBe(true);

      const mismatchReg = makeRegistryView({ schemaVersion: "2.0.0" });
      expect(checkClause(clause, mismatchReg).passed).toBe(false);
    });
  });

  // ── checkContract ──────────────────────────────────────────────────────────

  describe("checkContract()", () => {
    it("11.4-VCS-41 returns ordered results matching clauses array", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);
      const registry = makeRegistryView({});

      const results = checkContract(contract, registry);
      expect(results.length).toBe(contract.clauses.length);
      results.forEach((result, i) => {
        expect(result.clause).toBe(contract.clauses[i]);
      });
    });
  });

  // ── summarizeContractCheck ─────────────────────────────────────────────────

  describe("summarizeContractCheck()", () => {
    it("11.4-VCS-42 returns correct pass/fail summary", () => {
      const snap = makeSnapshotWithEntries();
      const contract = syncer.deriveFromSnapshot(snap);
      const allFailRegistry = makeRegistryView({});
      const results = checkContract(contract, allFailRegistry);

      const summary = summarizeContractCheck(results);
      expect(summary).toMatch(/VerificationContract check:/);
      expect(summary).toMatch(/\d+\/\d+ passed/);
    });
  });
});
