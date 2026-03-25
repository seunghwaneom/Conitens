/**
 * meta-event-bus.test.ts
 * Sub-AC 11a — Tests for the MetaEventBus.
 *
 * Coverage:
 *   11a-EB-1  emit() appends to local log immediately
 *   11a-EB-2  emit() local_only=true: no HTTP call, transport_status=local_only
 *   11a-EB-3  emit() on HTTP error: transport_status=failed, error captured
 *   11a-EB-4  emit() HTTP 200: transport_status=delivered
 *   11a-EB-5  emit() correct schema.* event type routing (all 8 types)
 *   11a-EB-6  emitRegistered() convenience wrapper emits schema.registered
 *   11a-EB-7  emitUpdated() convenience wrapper emits schema.updated
 *   11a-EB-8  emitDeprecated() convenience wrapper emits schema.deprecated
 *   11a-EB-9  emitRemoved() convenience wrapper emits schema.removed
 *   11a-EB-10 emitValidated() convenience wrapper emits schema.validated
 *   11a-EB-11 emitMigrated() convenience wrapper emits schema.migrated
 *   11a-EB-12 emitValidationStarted() convenience wrapper emits schema.validation_started
 *   11a-EB-13 emitMigrationStarted() convenience wrapper emits schema.migration_started
 *   11a-EB-14 local log is append-only (entries never mutated after append)
 *   11a-EB-15 rolling window eviction: log size does not exceed META_LOG_MAX_ENTRIES
 *   11a-EB-16 getLog() returns a snapshot (not a live reference)
 *   11a-EB-17 getLogByType() filters correctly
 *   11a-EB-18 getLogByProposal() filters by proposal_id
 *   11a-EB-19 getRecentLog() returns newest entries first
 *   11a-EB-20 proposal_id and causation_id are stored in log entries
 *   11a-EB-21 metaEventBus singleton is stable (same instance across imports)
 *   11a-EB-22 META_EVENTS_ENDPOINT does NOT equal the command-file endpoint /api/commands
 *   11a-EB-23 useMetaEventBus() returns the singleton instance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MetaEventBus,
  META_LOG_MAX_ENTRIES,
  META_EVENTS_ENDPOINT,
  metaEventBus,
  useMetaEventBus,
} from "../meta-event-bus.js";
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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const REGISTERED_PAYLOAD: SchemaRegisteredPayload = {
  schema_id: "event_type:task.created",
  namespace: "event_type",
  name: "task.created",
  version: "1.0.0",
  description: "Test event type",
  registered_by: "system",
};

const UPDATED_PAYLOAD: SchemaUpdatedPayload = {
  schema_id: "event_type:task.created",
  namespace: "event_type",
  name: "task.created",
  prev_version: "1.0.0",
  next_version: "1.0.1",
  changes: [
    {
      change_type: "description_updated",
      field_path: "behavioral_contract",
      description: "Updated description",
      prev_value: "old",
      next_value: "new",
    },
  ],
  updated_by: "operator",
};

const DEPRECATED_PAYLOAD: SchemaDeprecatedPayload = {
  schema_id: "event_type:legacy.type",
  namespace: "event_type",
  name: "legacy.type",
  version: "1.0.0",
  deprecation_reason: "Replaced by task.created",
  replacement_schema_id: "event_type:task.created",
  deprecated_by: "system",
};

const REMOVED_PAYLOAD: SchemaRemovedPayload = {
  schema_id: "event_type:old.type",
  namespace: "event_type",
  name: "old.type",
  version: "1.0.0",
  removal_reason: "No longer supported",
  migration_applied: true,
  removed_by: "operator",
};

const VALIDATED_PAYLOAD: SchemaValidatedPayload = {
  validation_run_id: "vrun-001",
  scope: "full",
  schemas_checked: 50,
  schemas_valid: 50,
  schemas_invalid: 0,
  passed: true,
  validated_by: "system",
};

const MIGRATED_PAYLOAD: SchemaMigratedPayload = {
  migration_run_id: "mrun-001",
  from_version: "conitens.event.v1",
  to_version: "conitens.event.v2",
  migrated_event_types: ["task.created"],
  events_migrated: 100,
  dry_run: false,
  migrated_by: "system",
};

const VALIDATION_STARTED_PAYLOAD: SchemaValidationStartedPayload = {
  validation_run_id: "vrun-001",
  scope: "full",
  initiated_by: "system",
};

const MIGRATION_STARTED_PAYLOAD: SchemaMigrationStartedPayload = {
  migration_run_id: "mrun-001",
  from_version: "conitens.event.v1",
  to_version: "conitens.event.v2",
  target_event_types: ["task.created"],
  dry_run: true,
  initiated_by: "operator",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MetaEventBus", () => {
  let bus: MetaEventBus;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    bus = new MetaEventBus();
    // Default: mock fetch to avoid actual HTTP calls
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── Local log ──────────────────────────────────────────────────────────────

  it("11a-EB-1: emit() appends to local log immediately (before HTTP response)", async () => {
    // Simulate a slow HTTP response
    let resolve!: () => void;
    fetchSpy.mockReturnValue(
      new Promise<Response>((res) => {
        resolve = () => res(new Response("{}", { status: 200 }));
      }),
    );

    const emitPromise = bus.emit("schema.registered", REGISTERED_PAYLOAD, {
      local_only: false,
    });

    // Log should already have 1 entry before the HTTP call resolves
    expect(bus.logSize).toBe(1);
    resolve(); // resolve the HTTP call
    await emitPromise;
    expect(bus.logSize).toBe(1); // still 1 after
  });

  it("11a-EB-2: local_only=true: no fetch call, transport_status=local_only", async () => {
    const result = await bus.emit("schema.registered", REGISTERED_PAYLOAD, {
      local_only: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.entry.transport_status).toBe("local_only");
    expect(result.delivered).toBe(false);
  });

  it("11a-EB-3: HTTP error: transport_status=failed, error message captured", async () => {
    fetchSpy.mockRejectedValue(new Error("Network timeout"));

    const result = await bus.emit("schema.registered", REGISTERED_PAYLOAD);

    expect(result.entry.transport_status).toBe("failed");
    expect(result.entry.transport_error).toContain("Network timeout");
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("Network timeout");
  });

  it("11a-EB-4: HTTP 200 response: transport_status=delivered", async () => {
    const result = await bus.emit("schema.registered", REGISTERED_PAYLOAD);

    expect(result.entry.transport_status).toBe("delivered");
    expect(result.entry.http_status).toBe(200);
    expect(result.delivered).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("11a-EB-5a: emit() sends correct event_type for all 8 schema.* types", async () => {
    const calls: Array<{ type: string }> = [];
    fetchSpy.mockImplementation((_url, opts) => {
      const body = JSON.parse((opts as RequestInit).body as string);
      calls.push({ type: body.type });
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    await bus.emit("schema.registered", REGISTERED_PAYLOAD);
    await bus.emit("schema.updated", UPDATED_PAYLOAD);
    await bus.emit("schema.deprecated", DEPRECATED_PAYLOAD);
    await bus.emit("schema.removed", REMOVED_PAYLOAD);
    await bus.emit("schema.validated", VALIDATED_PAYLOAD);
    await bus.emit("schema.migrated", MIGRATED_PAYLOAD);
    await bus.emit("schema.validation_started", VALIDATION_STARTED_PAYLOAD);
    await bus.emit("schema.migration_started", MIGRATION_STARTED_PAYLOAD);

    expect(calls.map((c) => c.type)).toEqual([
      "schema.registered",
      "schema.updated",
      "schema.deprecated",
      "schema.removed",
      "schema.validated",
      "schema.migrated",
      "schema.validation_started",
      "schema.migration_started",
    ]);
  });

  // ── Convenience wrappers ───────────────────────────────────────────────────

  it("11a-EB-6: emitRegistered() emits schema.registered", async () => {
    const result = await bus.emitRegistered(REGISTERED_PAYLOAD, { local_only: true });
    expect(result.entry.event_type).toBe("schema.registered");
  });

  it("11a-EB-7: emitUpdated() emits schema.updated", async () => {
    const result = await bus.emitUpdated(UPDATED_PAYLOAD, { local_only: true });
    expect(result.entry.event_type).toBe("schema.updated");
  });

  it("11a-EB-8: emitDeprecated() emits schema.deprecated", async () => {
    const result = await bus.emitDeprecated(DEPRECATED_PAYLOAD, { local_only: true });
    expect(result.entry.event_type).toBe("schema.deprecated");
  });

  it("11a-EB-9: emitRemoved() emits schema.removed", async () => {
    const result = await bus.emitRemoved(REMOVED_PAYLOAD, { local_only: true });
    expect(result.entry.event_type).toBe("schema.removed");
  });

  it("11a-EB-10: emitValidated() emits schema.validated", async () => {
    const result = await bus.emitValidated(VALIDATED_PAYLOAD, { local_only: true });
    expect(result.entry.event_type).toBe("schema.validated");
  });

  it("11a-EB-11: emitMigrated() emits schema.migrated", async () => {
    const result = await bus.emitMigrated(MIGRATED_PAYLOAD, { local_only: true });
    expect(result.entry.event_type).toBe("schema.migrated");
  });

  it("11a-EB-12: emitValidationStarted() emits schema.validation_started", async () => {
    const result = await bus.emitValidationStarted(VALIDATION_STARTED_PAYLOAD, { local_only: true });
    expect(result.entry.event_type).toBe("schema.validation_started");
  });

  it("11a-EB-13: emitMigrationStarted() emits schema.migration_started", async () => {
    const result = await bus.emitMigrationStarted(MIGRATION_STARTED_PAYLOAD, { local_only: true });
    expect(result.entry.event_type).toBe("schema.migration_started");
  });

  // ── Append-only semantics ──────────────────────────────────────────────────

  it("11a-EB-14: log entries are not mutated after append", async () => {
    await bus.emitRegistered(REGISTERED_PAYLOAD, { local_only: true });
    const log1 = bus.getLog();
    expect(log1.length).toBe(1);

    // Append more events
    await bus.emitUpdated(UPDATED_PAYLOAD, { local_only: true });
    const log2 = bus.getLog();

    // First log snapshot should not be affected
    expect(log1.length).toBe(1);
    expect(log2.length).toBe(2);
  });

  it("11a-EB-15: rolling window eviction — log size does not exceed META_LOG_MAX_ENTRIES", async () => {
    // Emit META_LOG_MAX_ENTRIES + 5 events (local_only for speed)
    const total = META_LOG_MAX_ENTRIES + 5;
    for (let i = 0; i < total; i++) {
      await bus.emitRegistered(
        { ...REGISTERED_PAYLOAD, schema_id: `event_type:test.event_${i}` },
        { local_only: true },
      );
    }

    expect(bus.logSize).toBe(META_LOG_MAX_ENTRIES);
  });

  it("11a-EB-16: getLog() returns a snapshot array (not a live reference)", async () => {
    await bus.emitRegistered(REGISTERED_PAYLOAD, { local_only: true });
    const snapshot1 = bus.getLog();

    await bus.emitUpdated(UPDATED_PAYLOAD, { local_only: true });
    const snapshot2 = bus.getLog();

    expect(snapshot1.length).toBe(1);
    expect(snapshot2.length).toBe(2);
    // snapshot1 should still show 1 entry (not affected by subsequent appends)
  });

  // ── Filters ────────────────────────────────────────────────────────────────

  it("11a-EB-17: getLogByType() filters by event type", async () => {
    await bus.emitRegistered(REGISTERED_PAYLOAD, { local_only: true });
    await bus.emitRegistered(REGISTERED_PAYLOAD, { local_only: true });
    await bus.emitUpdated(UPDATED_PAYLOAD, { local_only: true });

    const registered = bus.getLogByType("schema.registered");
    const updated = bus.getLogByType("schema.updated");

    expect(registered.length).toBe(2);
    expect(updated.length).toBe(1);
  });

  it("11a-EB-18: getLogByProposal() filters by proposal_id", async () => {
    await bus.emitRegistered(REGISTERED_PAYLOAD, {
      local_only: true,
      proposal_id: "prop-A",
    });
    await bus.emitUpdated(UPDATED_PAYLOAD, {
      local_only: true,
      proposal_id: "prop-A",
    });
    await bus.emitRemoved(REMOVED_PAYLOAD, {
      local_only: true,
      proposal_id: "prop-B",
    });

    const propA = bus.getLogByProposal("prop-A");
    const propB = bus.getLogByProposal("prop-B");

    expect(propA.length).toBe(2);
    expect(propB.length).toBe(1);
  });

  it("11a-EB-19: getRecentLog() returns most recent entries, newest first", async () => {
    for (let i = 1; i <= 5; i++) {
      await bus.emitRegistered(
        { ...REGISTERED_PAYLOAD, schema_id: `event_type:test.event_${i}` },
        { local_only: true },
      );
    }

    const recent = bus.getRecentLog(3);
    expect(recent.length).toBe(3);
    // Newest first: event_5, event_4, event_3
    expect((recent[0]!.payload as SchemaRegisteredPayload).schema_id).toBe(
      "event_type:test.event_5",
    );
    expect((recent[2]!.payload as SchemaRegisteredPayload).schema_id).toBe(
      "event_type:test.event_3",
    );
  });

  it("11a-EB-20: proposal_id and causation_id are stored in log entries", async () => {
    const result = await bus.emitRegistered(REGISTERED_PAYLOAD, {
      local_only: true,
      proposal_id: "my-proposal-123",
      causation_id: "evt-upstream-456",
    });

    expect(result.entry.proposal_id).toBe("my-proposal-123");
    expect(result.entry.causation_id).toBe("evt-upstream-456");
  });

  // ── Routing constraint ─────────────────────────────────────────────────────

  it("11a-EB-22: META_EVENTS_ENDPOINT is /api/meta/events, NOT /api/commands", () => {
    expect(META_EVENTS_ENDPOINT).toContain("/api/meta/events");
    expect(META_EVENTS_ENDPOINT).not.toContain("/api/commands");
  });

  it("11a-EB-5b: emitted envelope includes meta_level=true routing tag", async () => {
    let envelope: Record<string, unknown> | null = null;
    fetchSpy.mockImplementation((_url, opts) => {
      envelope = JSON.parse((opts as RequestInit).body as string);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    await bus.emitRegistered(REGISTERED_PAYLOAD);

    expect(envelope).not.toBeNull();
    expect((envelope as Record<string, unknown>)["meta_level"]).toBe(true);
  });

  it("11a-EB-5c: emitted envelope does NOT include command_id (not a command file)", async () => {
    let envelope: Record<string, unknown> | null = null;
    fetchSpy.mockImplementation((_url, opts) => {
      envelope = JSON.parse((opts as RequestInit).body as string);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    await bus.emitRegistered(REGISTERED_PAYLOAD);

    expect(envelope).not.toBeNull();
    expect((envelope as Record<string, unknown>)["command_id"]).toBeUndefined();
  });

  it("11a-EB-5d: X-Conitens-Meta header is set on HTTP POST", async () => {
    let capturedHeaders: Record<string, string> | null = null;
    fetchSpy.mockImplementation((_url, opts) => {
      capturedHeaders = (opts as RequestInit).headers as Record<string, string>;
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    await bus.emitRegistered(REGISTERED_PAYLOAD);

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!["X-Conitens-Meta"]).toBe("true");
  });
});

describe("metaEventBus singleton", () => {
  it("11a-EB-21: metaEventBus is a stable singleton instance", async () => {
    const { metaEventBus: bus1 } = await import("../meta-event-bus.js");
    const { metaEventBus: bus2 } = await import("../meta-event-bus.js");
    expect(bus1).toBe(bus2);
  });

  it("11a-EB-23: useMetaEventBus() returns the singleton instance", () => {
    const hookResult = useMetaEventBus();
    expect(hookResult).toBe(metaEventBus);
  });
});
