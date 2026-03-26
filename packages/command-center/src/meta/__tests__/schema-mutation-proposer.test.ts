/**
 * schema-mutation-proposer.test.ts
 * Sub-AC 11a — Tests for the schema mutation proposer.
 *
 * Coverage:
 *   11a-MP-1  proposeMutations() bootstrap mode produces schema.registered for every entry
 *   11a-MP-2  proposeMutations() bootstrap mode sets proposal_id and proposed_by
 *   11a-MP-3  proposeMutations() delta mode: no mutations when snapshots are identical
 *   11a-MP-4  proposeMutations() delta mode: detects new entries → schema.registered
 *   11a-MP-5  proposeMutations() delta mode: detects changed behavioral_contract → schema.updated
 *   11a-MP-6  proposeMutations() delta mode: orphan removal skipped without allow_orphan_remove
 *   11a-MP-7  proposeMutations() delta mode: orphan removal included when allow_orphan_remove=true
 *   11a-MP-8  proposeMutations() counts match actual mutations
 *   11a-MP-9  proposeMutations() proposal is frozen (immutable)
 *   11a-MP-10 emitProposal() dry_run: no HTTP calls, transport_status=local_only
 *   11a-MP-11 emitProposal() returns ProposalEmitResult with correct counts
 *   11a-MP-12 validateProposalStability() returns stable=true for identical snapshots
 *   11a-MP-13 validateProposalStability() detects missing schema_ids
 *   11a-MP-14 validateProposalStability() detects level regressions
 *   11a-MP-15 runSchemaSelfRegistration() bootstrap mode runs full cycle
 *   11a-MP-16 emitted events carry proposal_id for traceability
 *   11a-MP-17 schema.registered payloads have all required fields
 *   11a-MP-18 schema.updated payloads carry changes array
 *   11a-MP-19 bootstrap mode covers all ontology levels (domain, infrastructure, meta)
 *   11a-MP-20 currentSchemaVersion() matches SCHEMA_VERSION from protocol
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SCHEMA_VERSION } from "@conitens/protocol";
import {
  readOntologySchema,
  type OntologySnapshot,
  type EventTypeEntry,
} from "../ontology-schema-reader.js";
import {
  proposeMutations,
  emitProposal,
  validateProposalStability,
  runSchemaSelfRegistration,
  currentSchemaVersion,
  type SchemaMutationProposal,
} from "../schema-mutation-proposer.js";
import { MetaEventBus } from "../meta-event-bus.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBus(localOnly = true): MetaEventBus {
  // Create a bus that always uses local_only to avoid HTTP calls in tests
  const bus = new MetaEventBus();
  if (localOnly) {
    // Patch emit to always force local_only
    const originalEmit = bus.emit.bind(bus);
    vi.spyOn(bus, "emit").mockImplementation((type, payload, opts = {}) =>
      originalEmit(type, payload, { ...opts, local_only: true }),
    );
  }
  return bus;
}

/** Create a minimal snapshot with only the given event type entries. */
function minimalSnapshot(
  eventTypes: Array<Pick<EventTypeEntry, "event_type" | "behavioral_contract" | "level">>,
  snapshotIdSuffix = "test",
): OntologySnapshot {
  const entries: EventTypeEntry[] = eventTypes.map((et) => ({
    schema_id: `event_type:${et.event_type}`,
    event_type: et.event_type as import("@conitens/protocol").EventType,
    level: et.level,
    family: "task" as const,
    namespace: "event_type" as const,
    behavioral_contract: et.behavioral_contract,
    owned_by_reducers: ["TimelineReducer"],
  }));

  return Object.freeze({
    snapshot_id: `ontology-snap-${Date.now()}-${snapshotIdSuffix}`,
    captured_at_ms: Date.now(),
    schema_version: SCHEMA_VERSION,
    total_entries: entries.length,
    event_types: Object.freeze(entries),
    command_types: Object.freeze([]),
    reducers: Object.freeze([]),
    schema_registry: Object.freeze([]),
    domain_entity_schemas: Object.freeze([]),
    room_count: 0,
    warnings: Object.freeze([]),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("proposeMutations()", () => {
  let realSnapshot: OntologySnapshot;

  beforeEach(() => {
    realSnapshot = readOntologySchema();
  });

  it("11a-MP-1: bootstrap mode produces schema.registered for every entry in snapshot", () => {
    const proposal = proposeMutations(realSnapshot, null);
    expect(proposal.mutations.length).toBe(realSnapshot.total_entries);
    for (const m of proposal.mutations) {
      expect(m.kind).toBe("register");
      expect(m.event_type).toBe("schema.registered");
    }
  });

  it("11a-MP-2: bootstrap mode sets proposal_id and proposed_by", () => {
    const proposal = proposeMutations(realSnapshot, null, { proposed_by: "operator" });
    expect(proposal.proposal_id).toMatch(/^schema-prop-/);
    expect(proposal.proposed_by).toBe("operator");
    expect(proposal.current_snapshot_id).toBe(realSnapshot.snapshot_id);
    expect(proposal.previous_snapshot_id).toBeNull();
    expect(proposal.proposed_at_ms).toBeGreaterThan(0);
  });

  it("11a-MP-3: delta mode produces no mutations when snapshots are identical", () => {
    // The same snapshot object compared to itself — zero diff
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract A", level: "domain" },
    ]);
    const proposal = proposeMutations(snap1, snap1);
    expect(proposal.mutations.length).toBe(0);
    expect(proposal.counts.total).toBe(0);
  });

  it("11a-MP-4: delta mode detects new entries → emits schema.registered", () => {
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract A", level: "domain" },
    ]);
    const snap2 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract A", level: "domain" },
      { event_type: "task.completed", behavioral_contract: "contract B", level: "domain" },
    ]);

    const proposal = proposeMutations(snap2, snap1);
    expect(proposal.counts.register).toBe(1);
    expect(proposal.counts.update).toBe(0);

    const registerMutation = proposal.mutations.find(
      (m) => m.schema_id === "event_type:task.completed",
    );
    expect(registerMutation).toBeDefined();
    expect(registerMutation?.event_type).toBe("schema.registered");
  });

  it("11a-MP-5: delta mode detects changed behavioral_contract → emits schema.updated", () => {
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "old contract", level: "domain" },
    ]);
    const snap2 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "new improved contract", level: "domain" },
    ]);

    const proposal = proposeMutations(snap2, snap1);
    expect(proposal.counts.update).toBe(1);
    expect(proposal.counts.register).toBe(0);

    const updateMutation = proposal.mutations.find(
      (m) => m.schema_id === "event_type:task.created",
    );
    expect(updateMutation).toBeDefined();
    expect(updateMutation?.event_type).toBe("schema.updated");

    const updatedPayload = updateMutation?.payload as import("@conitens/protocol").SchemaUpdatedPayload;
    expect(updatedPayload.changes.length).toBeGreaterThan(0);
    expect(updatedPayload.changes[0]?.change_type).toBe("description_updated");
    expect(updatedPayload.changes[0]?.prev_value).toBe("old contract");
    expect(updatedPayload.changes[0]?.next_value).toBe("new improved contract");
  });

  it("11a-MP-6: orphan removal is skipped without allow_orphan_remove=true", () => {
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract", level: "domain" },
      { event_type: "task.completed", behavioral_contract: "contract", level: "domain" },
    ]);
    const snap2 = minimalSnapshot([
      // task.completed removed
      { event_type: "task.created", behavioral_contract: "contract", level: "domain" },
    ]);

    const proposal = proposeMutations(snap2, snap1); // default: allow_orphan_remove=false
    expect(proposal.counts.remove).toBe(0);
    expect(proposal.warnings.length).toBeGreaterThan(0);
    expect(proposal.warnings[0]).toContain("allow_orphan_remove");
  });

  it("11a-MP-7: orphan removal IS included when allow_orphan_remove=true", () => {
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract", level: "domain" },
      { event_type: "task.completed", behavioral_contract: "contract", level: "domain" },
    ]);
    const snap2 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract", level: "domain" },
    ]);

    const proposal = proposeMutations(snap2, snap1, { allow_orphan_remove: true });
    expect(proposal.counts.remove).toBe(1);

    const removeMutation = proposal.mutations.find(
      (m) => m.schema_id === "event_type:task.completed",
    );
    expect(removeMutation).toBeDefined();
    expect(removeMutation?.event_type).toBe("schema.removed");
    expect(removeMutation?.warnings).toContain("Orphan removal: no replacement schema_id provided");
  });

  it("11a-MP-8: proposal counts match actual mutations", () => {
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "v1", level: "domain" },
    ]);
    const snap2 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "v2", level: "domain" }, // updated
      { event_type: "task.assigned", behavioral_contract: "new", level: "domain" }, // new
    ]);

    const proposal = proposeMutations(snap2, snap1);
    expect(proposal.counts.register).toBe(
      proposal.mutations.filter((m) => m.kind === "register").length,
    );
    expect(proposal.counts.update).toBe(
      proposal.mutations.filter((m) => m.kind === "update").length,
    );
    expect(proposal.counts.total).toBe(proposal.mutations.length);
  });

  it("11a-MP-9: returned proposal is frozen (immutable)", () => {
    const proposal = proposeMutations(realSnapshot, null);
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(Object.isFrozen(proposal.mutations)).toBe(true);
    expect(Object.isFrozen(proposal.warnings)).toBe(true);
  });
});

describe("emitProposal()", () => {
  it("11a-MP-10: dry_run mode: transport_status=local_only, no HTTP calls", async () => {
    const snap = readOntologySchema();
    const proposal = proposeMutations(snap, null);
    const bus = new MetaEventBus();
    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await emitProposal(proposal, bus, { dry_run: true });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.emitted).toBe(proposal.mutations.length);
    // All should be local_only (not "delivered" in the network sense)
    expect(result.allDelivered).toBe(false);
    for (const r of result.results) {
      expect(r.entry.transport_status).toBe("local_only");
    }

    fetchSpy.mockRestore();
  });

  it("11a-MP-11: returns ProposalEmitResult with correct structure", async () => {
    const snap = readOntologySchema();
    const proposal = proposeMutations(snap, null);
    const bus = new MetaEventBus();

    const result = await emitProposal(proposal, bus, { dry_run: true });

    expect(result.proposal).toBe(proposal);
    expect(result.results.length).toBe(proposal.mutations.length);
    expect(typeof result.emitted).toBe("number");
    expect(typeof result.failed).toBe("number");
    expect(typeof result.allDelivered).toBe("boolean");
  });

  it("11a-MP-16: emitted events carry proposal_id for traceability", async () => {
    const snap = readOntologySchema();
    const proposal = proposeMutations(snap, null);
    const bus = new MetaEventBus();

    await emitProposal(proposal, bus, { dry_run: true });

    const log = bus.getLog();
    expect(log.length).toBe(proposal.mutations.length);
    for (const entry of log) {
      expect(entry.proposal_id).toBe(proposal.proposal_id);
    }
  });

  it("11a-MP-17: schema.registered payloads have all required fields", async () => {
    const snap = readOntologySchema();
    const proposal = proposeMutations(snap, null);
    const bus = new MetaEventBus();

    await emitProposal(proposal, bus, { dry_run: true });

    const log = bus.getLog();
    for (const entry of log) {
      const p = entry.payload as import("@conitens/protocol").SchemaRegisteredPayload;
      expect(p.schema_id).toBeTruthy();
      expect(p.namespace).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.version).toBeTruthy();
      expect(p.registered_by).toBe("system");
    }
  });

  it("11a-MP-18: schema.updated payloads carry non-empty changes array", async () => {
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "old", level: "domain" },
    ]);
    const snap2 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "new updated contract text", level: "domain" },
    ]);

    const proposal = proposeMutations(snap2, snap1);
    const bus = new MetaEventBus();

    await emitProposal(proposal, bus, { dry_run: true });

    const updateEntries = bus.getLogByType("schema.updated");
    expect(updateEntries.length).toBe(1);
    const p = updateEntries[0]!.payload as import("@conitens/protocol").SchemaUpdatedPayload;
    expect(p.changes.length).toBeGreaterThan(0);
  });

  it("11a-MP-19: bootstrap mode covers all three ontology levels", () => {
    const snap = readOntologySchema();
    const proposal = proposeMutations(snap, null);

    // All mutations should be schema.registered
    const schemaIds = proposal.mutations.map((m) => m.schema_id);

    // Domain: event_type:task.*
    expect(schemaIds.some((id) => id.startsWith("event_type:task."))).toBe(true);
    // Infrastructure: reducer:*
    expect(schemaIds.some((id) => id.startsWith("reducer:"))).toBe(true);
    // Meta: schema_registry:schema.*
    expect(schemaIds.some((id) => id.startsWith("schema_registry:"))).toBe(true);
  });
});

describe("validateProposalStability()", () => {
  it("11a-MP-12: returns stable=true when snapshots are identical", () => {
    const snap = readOntologySchema();
    const result = validateProposalStability(snap, snap);
    expect(result.stable).toBe(true);
    expect(result.missing_schema_ids).toHaveLength(0);
    expect(result.level_regressions).toHaveLength(0);
  });

  it("11a-MP-13: detects missing schema_ids (previously existing entries that disappeared)", () => {
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract", level: "domain" },
      { event_type: "task.completed", behavioral_contract: "contract", level: "domain" },
    ]);
    const snap2 = minimalSnapshot([
      // task.completed was removed
      { event_type: "task.created", behavioral_contract: "contract", level: "domain" },
    ]);

    const result = validateProposalStability(snap2, snap1);
    expect(result.stable).toBe(false);
    expect(result.missing_schema_ids).toContain("event_type:task.completed");
  });

  it("11a-MP-14: detects level regressions (ontological level change)", () => {
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract", level: "domain" },
    ]);

    // Simulate a level change (domain → infrastructure) — a regression
    const snap2: OntologySnapshot = Object.freeze({
      ...snap1,
      snapshot_id: `ontology-snap-${Date.now()}-regress`,
      event_types: Object.freeze([
        {
          ...snap1.event_types[0]!,
          level: "infrastructure" as const, // Changed level
        },
      ]),
    });

    const result = validateProposalStability(snap2, snap1);
    expect(result.stable).toBe(false);
    expect(result.level_regressions.length).toBe(1);
    expect(result.level_regressions[0]?.schema_id).toBe("event_type:task.created");
    expect(result.level_regressions[0]?.prev_level).toBe("domain");
    expect(result.level_regressions[0]?.curr_level).toBe("infrastructure");
  });

  it("11a-MP-14b: stable=true when only adding new entries (no regressions)", () => {
    const snap1 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract", level: "domain" },
    ]);
    const snap2 = minimalSnapshot([
      { event_type: "task.created", behavioral_contract: "contract", level: "domain" },
      { event_type: "task.assigned", behavioral_contract: "new", level: "domain" }, // addition is OK
    ]);

    const result = validateProposalStability(snap2, snap1);
    expect(result.stable).toBe(true);
  });
});

describe("runSchemaSelfRegistration()", () => {
  it("11a-MP-15: bootstrap mode runs full cycle and returns all required fields", async () => {
    const bus = makeBus(true);
    let capturedSnapshot: OntologySnapshot | null = null;

    const { snapshot, stability, proposal, result } = await runSchemaSelfRegistration(
      () => {
        capturedSnapshot = readOntologySchema();
        return capturedSnapshot;
      },
      null,
      bus,
      { dry_run: true },
    );

    expect(snapshot).toBeDefined();
    expect(stability).toBeNull(); // null for bootstrap (no previous snapshot)
    expect(proposal.proposal_id).toMatch(/^schema-prop-/);
    expect(proposal.counts.register).toBe(snapshot.total_entries);
    expect(result.emitted).toBe(proposal.mutations.length);
    expect(bus.logSize).toBe(proposal.mutations.length);
  });

  it("11a-MP-15b: delta mode performs stability check", async () => {
    const snap1 = readOntologySchema();
    const bus = makeBus(true);

    const { stability } = await runSchemaSelfRegistration(
      () => snap1, // same snapshot → stable
      snap1,
      bus,
      { dry_run: true },
    );

    expect(stability).not.toBeNull();
    expect(stability?.stable).toBe(true);
  });
});

describe("currentSchemaVersion()", () => {
  it("11a-MP-20: returns SCHEMA_VERSION from protocol package", () => {
    expect(currentSchemaVersion()).toBe(SCHEMA_VERSION);
  });
});
