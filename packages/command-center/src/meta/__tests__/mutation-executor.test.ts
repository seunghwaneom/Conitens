/**
 * mutation-executor.test.ts
 * Sub-AC 11b — Tests for the MutationExecutor.
 *
 * Coverage:
 *   11b-ME-1  handle() rejects invalid payload (fails type guard)
 *   11b-ME-2  handle() schema.registered → auto-apply, registry_changed=true
 *   11b-ME-3  handle() schema.registered idempotent (already registered) → apply, registry_changed=false
 *   11b-ME-4  handle() schema.updated → auto-apply, version bumped in registry
 *   11b-ME-5  handle() schema.updated for unknown schema_id → reject
 *   11b-ME-6  handle() schema.updated for removed schema → reject
 *   11b-ME-7  handle() schema.deprecated → auto-apply, status→deprecated
 *   11b-ME-8  handle() schema.deprecated idempotent → apply, registry_changed=false
 *   11b-ME-9  handle() schema.deprecated for unknown schema → reject
 *   11b-ME-10 handle() schema.removed for deprecated schema → auto-apply
 *   11b-ME-11 handle() schema.removed for active (non-deprecated) schema → defer
 *   11b-ME-12 handle() schema.removed with allow_undeprecated_removal=true → auto-apply
 *   11b-ME-13 handle() schema.removed for unknown schema_id → reject
 *   11b-ME-14 handle() schema.removed idempotent (already removed) → apply, registry_changed=false
 *   11b-ME-15 handle() schema.validation_started → auto-apply, registry_changed=false
 *   11b-ME-16 handle() schema.validated → auto-apply, registry_changed=false
 *   11b-ME-17 handle() schema.migration_started → defer (default)
 *   11b-ME-18 handle() schema.migration_started with allow_auto_migration=true → auto-apply
 *   11b-ME-19 handle() schema.migrated → auto-apply, updates migrated entries
 *   11b-ME-20 operatorApprove() applies a deferred schema.removed mutation
 *   11b-ME-21 operatorApprove() on unknown execution_id → resolved=false
 *   11b-ME-22 operatorReject() removes pending decision without modifying registry
 *   11b-ME-23 operatorReject() on unknown execution_id → resolved=false
 *   11b-ME-24 execution log is append-only (records not mutated after creation)
 *   11b-ME-25 execution log rolling eviction respects max_execution_log_size
 *   11b-ME-26 pending decisions queue limit enforced (max_pending_decisions)
 *   11b-ME-27 getRegistry() returns copy (not live reference)
 *   11b-ME-28 getEntriesByStatus() filters correctly
 *   11b-ME-29 getExecutionsByDecision() filters correctly
 *   11b-ME-30 getExecutionsForSchema() filters by schema_id
 *   11b-ME-31 proposal_id is propagated to ExecutionRecord
 *   11b-ME-32 MutationExecutor does NOT interact with /api/commands (meta-level routing)
 *   11b-ME-33 mutationExecutor singleton is stable (same instance across imports)
 *   11b-ME-34 useMutationExecutor() returns singleton instance
 *   11b-ME-35 defer → approve full cycle: registry state correctly updated
 *   11b-ME-36 handle() schema.removed with pending queue at capacity → reject
 *   11b-ME-37 getRecentExecutions() returns newest entries first
 *   11b-ME-38 full bootstrap: register + update + deprecate + remove cycle
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MutationExecutor,
  mutationExecutor,
  useMutationExecutor,
  type ExecutionDecision,
} from "../mutation-executor.js";
import type {
  SchemaRegisteredPayload,
  SchemaUpdatedPayload,
  SchemaDeprecatedPayload,
  SchemaRemovedPayload,
  SchemaValidatedPayload,
  SchemaMigratedPayload,
  SchemaValidationStartedPayload,
  SchemaMigrationStartedPayload,
} from "@conitens/protocol";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SCHEMA_ID = "event_type:task.created";

const REGISTERED_PAYLOAD: SchemaRegisteredPayload = {
  schema_id: SCHEMA_ID,
  namespace: "event_type",
  name: "task.created",
  version: "1.0.0",
  description: "Task creation event",
  registered_by: "system",
  registered_at_ms: 1_000_000,
};

const UPDATED_PAYLOAD: SchemaUpdatedPayload = {
  schema_id: SCHEMA_ID,
  namespace: "event_type",
  name: "task.created",
  prev_version: "1.0.0",
  next_version: "1.0.1",
  changes: [
    {
      change_type: "description_updated",
      field_path: "behavioral_contract",
      description: "Updated behavioral contract",
      prev_value: "old",
      next_value: "new",
    },
  ],
  updated_by: "operator",
  updated_at_ms: 2_000_000,
};

const DEPRECATED_PAYLOAD: SchemaDeprecatedPayload = {
  schema_id: SCHEMA_ID,
  namespace: "event_type",
  name: "task.created",
  version: "1.0.1",
  deprecation_reason: "Superseded by task.created_v2",
  replacement_schema_id: "event_type:task.created_v2",
  deprecated_by: "system",
  deprecated_at_ms: 3_000_000,
};

const REMOVED_PAYLOAD: SchemaRemovedPayload = {
  schema_id: SCHEMA_ID,
  namespace: "event_type",
  name: "task.created",
  version: "1.0.1",
  removal_reason: "Fully migrated to task.created_v2",
  migration_applied: true,
  removed_by: "operator",
  removed_at_ms: 4_000_000,
};

const VALIDATED_PAYLOAD: SchemaValidatedPayload = {
  validation_run_id: "vrun-001",
  scope: "full",
  schemas_checked: 42,
  schemas_valid: 42,
  schemas_invalid: 0,
  passed: true,
  validated_by: "system",
};

const VALIDATION_STARTED_PAYLOAD: SchemaValidationStartedPayload = {
  validation_run_id: "vrun-001",
  scope: "full",
  initiated_by: "system",
};

const MIGRATED_PAYLOAD: SchemaMigratedPayload = {
  migration_run_id: "mrun-001",
  from_version: "conitens.event.v1",
  to_version: "conitens.event.v2",
  migrated_event_types: [SCHEMA_ID],
  events_migrated: 100,
  dry_run: false,
  migrated_by: "system",
  migrated_at_ms: 5_000_000,
};

const MIGRATION_STARTED_PAYLOAD: SchemaMigrationStartedPayload = {
  migration_run_id: "mrun-001",
  from_version: "conitens.event.v1",
  to_version: "conitens.event.v2",
  target_event_types: [SCHEMA_ID],
  dry_run: true,
  initiated_by: "operator",
};

// ── Helper ────────────────────────────────────────────────────────────────────

/** Register SCHEMA_ID in executor and return the result. */
function registerInExecutor(executor: MutationExecutor): void {
  executor.handle("schema.registered", REGISTERED_PAYLOAD);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MutationExecutor — payload validation", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
  });

  it("11b-ME-1: handle() rejects invalid payload (fails type guard)", () => {
    // schema.registered requires schema_id, namespace, name, version, registered_by
    const badPayload = { schema_id: "event_type:x" }; // missing required fields

    const result = executor.handle("schema.registered", badPayload);

    expect(result.decision).toBe("reject");
    expect(result.record.decision).toBe("reject");
    expect(result.record.reason).toContain("Payload validation failed");
    expect(result.registry_changed).toBe(false);
    // schema_id should be extracted from the partial payload
    expect(result.record.schema_id).toBe("event_type:x");
  });
});

describe("MutationExecutor — schema.registered", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
  });

  it("11b-ME-2: schema.registered → auto-apply, registry entry created", () => {
    const result = executor.handle("schema.registered", REGISTERED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(true);

    const entry = executor.getEntry(SCHEMA_ID);
    expect(entry).toBeDefined();
    expect(entry!.schema_id).toBe(SCHEMA_ID);
    expect(entry!.status).toBe("active");
    expect(entry!.version).toBe("1.0.0");
    expect(entry!.registered_at_ms).toBe(1_000_000);
  });

  it("11b-ME-3: schema.registered idempotent (already registered) → apply, registry_changed=false", () => {
    registerInExecutor(executor);
    const result = executor.handle("schema.registered", REGISTERED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(false);
    expect(result.record.reason).toContain("already registered");
    // Registry should still have exactly one entry for this schema_id
    expect(executor.getEntry(SCHEMA_ID)).toBeDefined();
  });
});

describe("MutationExecutor — schema.updated", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
    registerInExecutor(executor);
  });

  it("11b-ME-4: schema.updated → auto-apply, version bumped in registry", () => {
    const result = executor.handle("schema.updated", UPDATED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(true);

    const entry = executor.getEntry(SCHEMA_ID);
    expect(entry!.version).toBe("1.0.1");
    expect(entry!.last_updated_at_ms).toBe(2_000_000);
  });

  it("11b-ME-5: schema.updated for unknown schema_id → reject", () => {
    const unknown: SchemaUpdatedPayload = {
      ...UPDATED_PAYLOAD,
      schema_id: "event_type:nonexistent",
    };
    const result = executor.handle("schema.updated", unknown);

    expect(result.decision).toBe("reject");
    expect(result.record.reason).toContain("not in the registry");
    expect(result.registry_changed).toBe(false);
  });

  it("11b-ME-6: schema.updated for removed schema → reject", () => {
    // Register → deprecate → remove
    executor.handle("schema.deprecated", DEPRECATED_PAYLOAD);
    executor.handle("schema.removed", REMOVED_PAYLOAD);

    const result = executor.handle("schema.updated", UPDATED_PAYLOAD);
    expect(result.decision).toBe("reject");
    expect(result.record.reason).toContain("status 'removed'");
  });
});

describe("MutationExecutor — schema.deprecated", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
    registerInExecutor(executor);
  });

  it("11b-ME-7: schema.deprecated → auto-apply, status→deprecated", () => {
    const result = executor.handle("schema.deprecated", DEPRECATED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(true);

    const entry = executor.getEntry(SCHEMA_ID);
    expect(entry!.status).toBe("deprecated");
    expect(entry!.deprecated_at_ms).toBe(3_000_000);
    expect(entry!.deprecation_reason).toBe("Superseded by task.created_v2");
    expect(entry!.replacement_schema_id).toBe("event_type:task.created_v2");
  });

  it("11b-ME-8: schema.deprecated idempotent (already deprecated) → apply, registry_changed=false", () => {
    executor.handle("schema.deprecated", DEPRECATED_PAYLOAD);
    const result = executor.handle("schema.deprecated", DEPRECATED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(false);
    expect(result.record.reason).toContain("already deprecated");
  });

  it("11b-ME-9: schema.deprecated for unknown schema → reject", () => {
    const unknown: SchemaDeprecatedPayload = {
      ...DEPRECATED_PAYLOAD,
      schema_id: "event_type:ghost",
    };
    const result = executor.handle("schema.deprecated", unknown);

    expect(result.decision).toBe("reject");
    expect(result.record.reason).toContain("not in the registry");
  });
});

describe("MutationExecutor — schema.removed", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
    registerInExecutor(executor);
  });

  it("11b-ME-10: schema.removed for deprecated schema → auto-apply", () => {
    executor.handle("schema.deprecated", DEPRECATED_PAYLOAD);
    const result = executor.handle("schema.removed", REMOVED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(true);

    const entry = executor.getEntry(SCHEMA_ID);
    expect(entry!.status).toBe("removed");
    expect(entry!.removed_at_ms).toBe(4_000_000);
  });

  it("11b-ME-11: schema.removed for active (non-deprecated) schema → defer", () => {
    // Schema is active (not deprecated) — should be deferred
    const result = executor.handle("schema.removed", REMOVED_PAYLOAD);

    expect(result.decision).toBe("defer");
    expect(result.registry_changed).toBe(false);
    expect(result.pending).toBeDefined();
    expect(result.pending!.schema_id).toBe(SCHEMA_ID);
    expect(result.pending!.event_type).toBe("schema.removed");
    expect(result.pending!.defer_reason).toContain("has not been deprecated");

    // Should be in pending queue
    expect(executor.pendingCount).toBe(1);
    const entry = executor.getEntry(SCHEMA_ID);
    expect(entry!.status).toBe("active"); // NOT yet removed
  });

  it("11b-ME-12: schema.removed with allow_undeprecated_removal=true → auto-apply", () => {
    const permissiveExecutor = new MutationExecutor({ allow_undeprecated_removal: true });
    permissiveExecutor.handle("schema.registered", REGISTERED_PAYLOAD);

    const result = permissiveExecutor.handle("schema.removed", REMOVED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(true);
    expect(permissiveExecutor.getEntry(SCHEMA_ID)!.status).toBe("removed");
  });

  it("11b-ME-13: schema.removed for unknown schema_id → reject", () => {
    const unknown: SchemaRemovedPayload = {
      ...REMOVED_PAYLOAD,
      schema_id: "event_type:nobody",
    };
    const result = executor.handle("schema.removed", unknown);

    expect(result.decision).toBe("reject");
    expect(result.record.reason).toContain("not in the registry");
  });

  it("11b-ME-14: schema.removed idempotent (already removed) → apply, registry_changed=false", () => {
    executor.handle("schema.deprecated", DEPRECATED_PAYLOAD);
    executor.handle("schema.removed", REMOVED_PAYLOAD);
    const result = executor.handle("schema.removed", REMOVED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(false);
  });
});

describe("MutationExecutor — schema.validation_started / schema.validated", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
  });

  it("11b-ME-15: schema.validation_started → auto-apply, registry_changed=false", () => {
    const result = executor.handle(
      "schema.validation_started",
      VALIDATION_STARTED_PAYLOAD,
    );

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(false);
    expect(result.record.event_type).toBe("schema.validation_started");
  });

  it("11b-ME-16: schema.validated → auto-apply, registry_changed=false", () => {
    const result = executor.handle("schema.validated", VALIDATED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(false);
    expect(result.record.event_type).toBe("schema.validated");
  });
});

describe("MutationExecutor — schema.migration_started / schema.migrated", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
  });

  it("11b-ME-17: schema.migration_started → defer (default behaviour)", () => {
    const result = executor.handle(
      "schema.migration_started",
      MIGRATION_STARTED_PAYLOAD,
    );

    expect(result.decision).toBe("defer");
    expect(result.pending).toBeDefined();
    expect(result.pending!.defer_reason).toContain("requires operator approval");
    expect(executor.pendingCount).toBe(1);
  });

  it("11b-ME-18: schema.migration_started with allow_auto_migration=true → auto-apply", () => {
    const autoExecutor = new MutationExecutor({ allow_auto_migration: true });

    const result = autoExecutor.handle(
      "schema.migration_started",
      MIGRATION_STARTED_PAYLOAD,
    );

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(false);
    expect(autoExecutor.pendingCount).toBe(0);
  });

  it("11b-ME-19: schema.migrated → auto-apply, updates migrated entries' last_updated_at_ms", () => {
    // Register the entry first so it can be updated
    executor.handle("schema.registered", REGISTERED_PAYLOAD);

    const result = executor.handle("schema.migrated", MIGRATED_PAYLOAD);

    expect(result.decision).toBe("apply");
    expect(result.registry_changed).toBe(true);

    const entry = executor.getEntry(SCHEMA_ID);
    expect(entry!.last_updated_at_ms).toBe(5_000_000);
  });
});

describe("MutationExecutor — operator decisions", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
    registerInExecutor(executor);
  });

  it("11b-ME-20: operatorApprove() applies a deferred schema.removed mutation", () => {
    // Schema is active (not deprecated) → deferred
    const handleResult = executor.handle("schema.removed", REMOVED_PAYLOAD);
    expect(handleResult.decision).toBe("defer");

    const execution_id = handleResult.pending!.execution_id;
    const approveResult = executor.operatorApprove(execution_id, "Manually approved");

    expect(approveResult.resolved).toBe(true);
    expect(approveResult.registry_changed).toBe(true);
    expect(approveResult.record.decision).toBe("apply");
    expect(approveResult.record.reason).toContain("Manually approved");

    // Pending queue should be empty
    expect(executor.pendingCount).toBe(0);

    // Registry should show removed
    const entry = executor.getEntry(SCHEMA_ID);
    expect(entry!.status).toBe("removed");
  });

  it("11b-ME-21: operatorApprove() on unknown execution_id → resolved=false", () => {
    const result = executor.operatorApprove("exec-nonexistent");

    expect(result.resolved).toBe(false);
    expect(result.registry_changed).toBe(false);
  });

  it("11b-ME-22: operatorReject() removes pending decision, registry unchanged", () => {
    const handleResult = executor.handle("schema.removed", REMOVED_PAYLOAD);
    const execution_id = handleResult.pending!.execution_id;

    const rejectResult = executor.operatorReject(execution_id, "Not approved — migration not ready");

    expect(rejectResult.resolved).toBe(true);
    expect(rejectResult.registry_changed).toBe(false);
    expect(rejectResult.record.decision).toBe("reject");
    expect(rejectResult.record.reason).toContain("migration not ready");

    // Schema should still be active (not removed)
    expect(executor.getEntry(SCHEMA_ID)!.status).toBe("active");
    expect(executor.pendingCount).toBe(0);
  });

  it("11b-ME-23: operatorReject() on unknown execution_id → resolved=false", () => {
    const result = executor.operatorReject("exec-ghost", "Reason doesn't matter");

    expect(result.resolved).toBe(false);
    expect(result.registry_changed).toBe(false);
  });
});

describe("MutationExecutor — execution log", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
  });

  it("11b-ME-24: execution log is append-only (entries frozen after creation)", () => {
    registerInExecutor(executor);
    const log1 = executor.getExecutionLog();
    expect(log1.length).toBe(1);

    executor.handle("schema.updated", UPDATED_PAYLOAD); // will reject (not registered)
    const log2 = executor.getExecutionLog();

    // First snapshot should still show 1 entry
    expect(log1.length).toBe(1);
    expect(log2.length).toBe(2);
  });

  it("11b-ME-25: execution log rolling eviction respects max_execution_log_size", () => {
    const smallExecutor = new MutationExecutor({ max_execution_log_size: 5 });

    // Register 7 distinct schema IDs
    for (let i = 0; i < 7; i++) {
      smallExecutor.handle("schema.registered", {
        ...REGISTERED_PAYLOAD,
        schema_id: `event_type:test.item_${i}`,
        name: `test.item_${i}`,
      });
    }

    expect(smallExecutor.executionLogSize).toBe(5);
  });

  it("11b-ME-26: pending decisions queue limit enforced", () => {
    const tinyExecutor = new MutationExecutor({ max_pending_decisions: 2 });

    for (let i = 0; i < 2; i++) {
      tinyExecutor.handle("schema.registered", {
        ...REGISTERED_PAYLOAD,
        schema_id: `event_type:test.removal_${i}`,
        name: `test.removal_${i}`,
      });
      tinyExecutor.handle("schema.removed", {
        ...REMOVED_PAYLOAD,
        schema_id: `event_type:test.removal_${i}`,
        name: `test.removal_${i}`,
      });
    }
    expect(tinyExecutor.pendingCount).toBe(2);

    // 3rd removal should be rejected (queue at capacity)
    tinyExecutor.handle("schema.registered", {
      ...REGISTERED_PAYLOAD,
      schema_id: "event_type:test.removal_2",
      name: "test.removal_2",
    });
    const overflow = tinyExecutor.handle("schema.removed", {
      ...REMOVED_PAYLOAD,
      schema_id: "event_type:test.removal_2",
      name: "test.removal_2",
    });

    expect(overflow.decision).toBe("reject");
    expect(overflow.record.reason).toContain("capacity");
  });
});

describe("MutationExecutor — accessors", () => {
  let executor: MutationExecutor;

  beforeEach(() => {
    executor = new MutationExecutor();
  });

  it("11b-ME-27: getRegistry() returns a copy (not a live reference)", () => {
    registerInExecutor(executor);
    const snap1 = executor.getRegistry();
    expect(snap1.length).toBe(1);

    executor.handle("schema.registered", {
      ...REGISTERED_PAYLOAD,
      schema_id: "event_type:extra",
      name: "extra",
    });

    const snap2 = executor.getRegistry();
    // snap1 should not be affected by subsequent registrations
    expect(snap1.length).toBe(1);
    expect(snap2.length).toBe(2);
  });

  it("11b-ME-28: getEntriesByStatus() filters correctly", () => {
    registerInExecutor(executor);
    executor.handle("schema.registered", {
      ...REGISTERED_PAYLOAD,
      schema_id: "event_type:task.b",
      name: "task.b",
    });
    executor.handle("schema.deprecated", {
      ...DEPRECATED_PAYLOAD,
      schema_id: "event_type:task.b",
      name: "task.b",
    });

    const active = executor.getEntriesByStatus("active");
    const deprecated = executor.getEntriesByStatus("deprecated");

    expect(active.length).toBe(1);
    expect(active[0]!.schema_id).toBe(SCHEMA_ID);
    expect(deprecated.length).toBe(1);
    expect(deprecated[0]!.schema_id).toBe("event_type:task.b");
  });

  it("11b-ME-29: getExecutionsByDecision() filters correctly", () => {
    registerInExecutor(executor);
    // Reject: try to update unknown schema
    executor.handle("schema.updated", {
      ...UPDATED_PAYLOAD,
      schema_id: "event_type:ghost",
    });

    const applied = executor.getExecutionsByDecision("apply");
    const rejected = executor.getExecutionsByDecision("reject");

    expect(applied.length).toBeGreaterThanOrEqual(1);
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    expect(applied.every((r) => r.decision === "apply")).toBe(true);
    expect(rejected.every((r) => r.decision === "reject")).toBe(true);
  });

  it("11b-ME-30: getExecutionsForSchema() filters by schema_id", () => {
    registerInExecutor(executor);
    executor.handle("schema.updated", UPDATED_PAYLOAD);
    executor.handle("schema.registered", {
      ...REGISTERED_PAYLOAD,
      schema_id: "event_type:other",
      name: "other",
    });

    const forSchema = executor.getExecutionsForSchema(SCHEMA_ID);
    // Should include the register + update records only (not the "other" register)
    expect(forSchema.length).toBe(2);
    expect(forSchema.every((r) => r.schema_id === SCHEMA_ID)).toBe(true);
  });

  it("11b-ME-37: getRecentExecutions() returns newest entries first", () => {
    for (let i = 1; i <= 5; i++) {
      executor.handle("schema.registered", {
        ...REGISTERED_PAYLOAD,
        schema_id: `event_type:ordered_${i}`,
        name: `ordered_${i}`,
      });
    }

    const recent = executor.getRecentExecutions(3);
    expect(recent.length).toBe(3);
    // Newest entry should be ordered_5
    expect(recent[0]!.schema_id).toBe("event_type:ordered_5");
    // Third newest should be ordered_3
    expect(recent[2]!.schema_id).toBe("event_type:ordered_3");
  });
});

describe("MutationExecutor — causal chain / proposal_id", () => {
  it("11b-ME-31: proposal_id is propagated to ExecutionRecord", () => {
    const executor = new MutationExecutor();
    const result = executor.handle(
      "schema.registered",
      REGISTERED_PAYLOAD,
      { proposal_id: "schema-prop-12345" },
    );

    expect(result.record.proposal_id).toBe("schema-prop-12345");
  });
});

describe("MutationExecutor — meta-level routing constraint", () => {
  it("11b-ME-32: handle() DOES NOT call fetch() or write to /api/commands", async () => {
    const executor = new MutationExecutor();
    const fetchSpy = vi.spyOn(global, "fetch");

    executor.handle("schema.registered", REGISTERED_PAYLOAD);
    executor.handle("schema.updated", UPDATED_PAYLOAD);

    // The executor must not make any HTTP calls
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

describe("MutationExecutor — singleton", () => {
  it("11b-ME-33: mutationExecutor is a stable singleton", async () => {
    const { mutationExecutor: e1 } = await import("../mutation-executor.js");
    const { mutationExecutor: e2 } = await import("../mutation-executor.js");
    expect(e1).toBe(e2);
  });

  it("11b-ME-34: useMutationExecutor() returns the singleton", () => {
    const fromHook = useMutationExecutor();
    expect(fromHook).toBe(mutationExecutor);
  });
});

describe("MutationExecutor — full lifecycle cycle", () => {
  it("11b-ME-35: defer → approve cycle updates registry state correctly", () => {
    const executor = new MutationExecutor();
    registerInExecutor(executor);

    // Schema is active → removal is deferred
    const deferResult = executor.handle("schema.removed", REMOVED_PAYLOAD);
    expect(deferResult.decision).toBe("defer");
    expect(executor.getEntry(SCHEMA_ID)!.status).toBe("active");

    // Operator approves
    const approveResult = executor.operatorApprove(deferResult.pending!.execution_id);
    expect(approveResult.resolved).toBe(true);
    expect(approveResult.registry_changed).toBe(true);
    expect(executor.getEntry(SCHEMA_ID)!.status).toBe("removed");
    expect(executor.pendingCount).toBe(0);
  });

  it("11b-ME-38: full register → update → deprecate → remove lifecycle", () => {
    const executor = new MutationExecutor();

    // 1. Register
    const r1 = executor.handle("schema.registered", REGISTERED_PAYLOAD);
    expect(r1.decision).toBe("apply");
    expect(executor.getEntry(SCHEMA_ID)!.status).toBe("active");
    expect(executor.getEntry(SCHEMA_ID)!.version).toBe("1.0.0");

    // 2. Update
    const r2 = executor.handle("schema.updated", UPDATED_PAYLOAD);
    expect(r2.decision).toBe("apply");
    expect(executor.getEntry(SCHEMA_ID)!.version).toBe("1.0.1");

    // 3. Deprecate
    const r3 = executor.handle("schema.deprecated", DEPRECATED_PAYLOAD);
    expect(r3.decision).toBe("apply");
    expect(executor.getEntry(SCHEMA_ID)!.status).toBe("deprecated");

    // 4. Remove (deprecated → auto-apply)
    const r4 = executor.handle("schema.removed", REMOVED_PAYLOAD);
    expect(r4.decision).toBe("apply");
    expect(executor.getEntry(SCHEMA_ID)!.status).toBe("removed");

    // Execution log should have 4 "apply" records for this schema
    const schemaExecs = executor.getExecutionsForSchema(SCHEMA_ID);
    expect(schemaExecs.length).toBe(4);
    const decisions = schemaExecs.map((r) => r.decision) as ExecutionDecision[];
    expect(decisions).toEqual(["apply", "apply", "apply", "apply"]);
  });
});
