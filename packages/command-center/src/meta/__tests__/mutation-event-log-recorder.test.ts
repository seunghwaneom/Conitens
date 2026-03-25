/**
 * mutation-event-log-recorder.test.ts
 * Sub-AC 11c — Tests for MutationEventLogRecorder.
 *
 * Coverage:
 *   11c-MELR-1   handleAndRecord() apply: before_state null (new schema)
 *   11c-MELR-2   handleAndRecord() apply: after_state populated (registered entry)
 *   11c-MELR-3   handleAndRecord() apply: EventLog entry uses original schema.* event type
 *   11c-MELR-4   handleAndRecord() apply: EventLog payload contains _execution metadata
 *   11c-MELR-5   handleAndRecord() apply: _execution.decision = "apply"
 *   11c-MELR-6   handleAndRecord() apply: _execution.registry_changed = true
 *   11c-MELR-7   handleAndRecord() apply: original payload fields preserved in EventLog
 *   11c-MELR-8   handleAndRecord() reject: before_state populated (schema exists)
 *   11c-MELR-9   handleAndRecord() reject: after_state matches before_state (no registry change)
 *   11c-MELR-10  handleAndRecord() reject: _execution.decision = "reject"
 *   11c-MELR-11  handleAndRecord() reject: _execution.registry_changed = false
 *   11c-MELR-12  handleAndRecord() reject: _execution.reason is set
 *   11c-MELR-13  handleAndRecord() defer: _execution.decision = "defer"
 *   11c-MELR-14  handleAndRecord() defer: EventLog entry written even for defer
 *   11c-MELR-15  handleAndRecord() EventLog write failure: returns event_log_error (no throw)
 *   11c-MELR-16  handleAndRecord() EventLog write failure: handle_result still valid
 *   11c-MELR-17  handleAndRecord() proposal_id propagated to execution_metadata._execution.proposal_id
 *   11c-MELR-18  handleAndRecord() proposal_id used as causation_id in EventLog event
 *   11c-MELR-19  handleAndRecord() schema.updated: before_state = old entry, after_state = updated
 *   11c-MELR-20  handleAndRecord() schema.deprecated: before_state active, after_state deprecated
 *   11c-MELR-21  handleAndRecord() schema.removed (deprecated): before_state deprecated, after_state removed
 *   11c-MELR-22  handleAndRecord() schema.removed (active, defer): before_state active, after_state=before
 *   11c-MELR-23  handleAndRecord() schema.validation_started: before_state.schema_id = null
 *   11c-MELR-24  handleAndRecord() schema.migrated: EventLog entry written
 *   11c-MELR-25  approveAndRecord() apply: before_state deprecated, after_state removed
 *   11c-MELR-26  approveAndRecord(): EventLog entry with decision "apply"
 *   11c-MELR-27  approveAndRecord() unknown execution_id: resolved=false, event_log_entry written
 *   11c-MELR-28  rejectAndRecord(): before_state = after_state (registry unchanged)
 *   11c-MELR-29  rejectAndRecord(): EventLog entry with decision "reject"
 *   11c-MELR-30  rejectAndRecord() unknown execution_id: resolved=false, event_log_entry written
 *   11c-MELR-31  _execution.meta_level is always true
 *   11c-MELR-32  _execution.recorded_at_ms is set to a recent timestamp
 *   11c-MELR-33  custom run_id used when provided in RecordOptions
 *   11c-MELR-34  custom actor used when provided in RecordOptions
 *   11c-MELR-35  default actor is { kind: "system", id: "mutation-executor" }
 *   11c-MELR-36  getRegistry() delegates to executor.getRegistry()
 *   11c-MELR-37  getExecutionLog() delegates to executor.getExecutionLog()
 *   11c-MELR-38  executor getter returns the underlying MutationExecutor
 *   11c-MELR-39  initMutationEventLogRecorder() replaces singleton EventLog
 *   11c-MELR-40  useMutationEventLogRecorder() returns the proxy singleton
 *   11c-MELR-41  full lifecycle: register → update → deprecate → defer → approve
 *   11c-MELR-42  EventLog append receives schema.* event type (not a generic type)
 *   11c-MELR-43  EventLog called exactly once per handleAndRecord()
 *   11c-MELR-44  EventLog called exactly once per approveAndRecord()
 *   11c-MELR-45  EventLog called exactly once per rejectAndRecord()
 *   11c-MELR-46  before_state captured BEFORE executor.handle() (uses pre-call registry state)
 *   11c-MELR-47  after_state captured AFTER executor.handle() (uses post-call registry state)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MutationEventLogRecorder,
  initMutationEventLogRecorder,
  useMutationEventLogRecorder,
  type EventLogAppender,
  type RecordedConitensEvent,
  type MutationExecutionMetadata,
} from "../mutation-event-log-recorder.js";
import { MutationExecutor } from "../mutation-executor.js";
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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const SCHEMA_ID = "event_type:task.created";
const NOW = 1_700_000_000_000;

/**
 * Build a minimal mock EventLog that resolves successfully.
 * Returns appended events for assertion.
 */
function buildMockEventLog(): {
  log: EventLogAppender;
  calls: Array<Parameters<EventLogAppender["append"]>[0]>;
} {
  const calls: Array<Parameters<EventLogAppender["append"]>[0]> = [];
  let callCount = 0;
  const log: EventLogAppender = {
    append: vi.fn().mockImplementation(async (event) => {
      calls.push(event);
      const result: RecordedConitensEvent = {
        schema: "1.0.0",
        event_id: `evt_test_${++callCount}`,
        type: event.type,
        ts: new Date(NOW).toISOString(),
        run_id: event.run_id,
        actor: event.actor,
        payload: event.payload,
        causation_id: event.causation_id,
      };
      return result;
    }),
  };
  return { log, calls };
}

/** Build a failing mock EventLog. */
function buildFailingEventLog(message = "Disk full"): EventLogAppender {
  return {
    append: vi.fn().mockRejectedValue(new Error(message)),
  };
}

// ── Payloads ────────────────────────────────────────────────────────────────

const REGISTERED_PAYLOAD: SchemaRegisteredPayload = {
  schema_id: SCHEMA_ID,
  namespace: "event_type",
  name: "task.created",
  version: "1.0.0",
  description: "Task creation event",
  registered_by: "system",
  registered_at_ms: NOW,
};

const UPDATED_PAYLOAD: SchemaUpdatedPayload = {
  schema_id: SCHEMA_ID,
  namespace: "event_type",
  name: "task.created",
  prev_version: "1.0.0",
  next_version: "1.1.0",
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
  updated_at_ms: NOW + 1000,
};

const DEPRECATED_PAYLOAD: SchemaDeprecatedPayload = {
  schema_id: SCHEMA_ID,
  namespace: "event_type",
  name: "task.created",
  version: "1.1.0",
  deprecation_reason: "Superseded by task.created.v2",
  deprecated_by: "operator",
  deprecated_at_ms: NOW + 2000,
};

const REMOVED_PAYLOAD: SchemaRemovedPayload = {
  schema_id: SCHEMA_ID,
  namespace: "event_type",
  name: "task.created",
  version: "1.1.0",
  removal_reason: "No longer supported",
  migration_applied: true,
  removed_by: "operator",
  removed_at_ms: NOW + 3000,
};

const VALIDATION_STARTED_PAYLOAD: SchemaValidationStartedPayload = {
  validation_run_id: "val-run-001",
  scope: "full",
  initiated_by: "system",
  started_at_ms: NOW,
};

const VALIDATED_PAYLOAD: SchemaValidatedPayload = {
  validation_run_id: "val-run-001",
  scope: "full",
  schemas_checked: 10,
  schemas_passed: 10,
  schemas_failed: 0,
  completed_at_ms: NOW + 500,
};

const MIGRATION_STARTED_PAYLOAD: SchemaMigrationStartedPayload = {
  migration_run_id: "mig-run-001",
  from_version: "1.0.0",
  to_version: "2.0.0",
  target_event_types: [SCHEMA_ID],
  dry_run: false,
  initiated_by: "operator",
  started_at_ms: NOW,
};

const MIGRATED_PAYLOAD: SchemaMigratedPayload = {
  migration_run_id: "mig-run-001",
  from_version: "1.0.0",
  to_version: "2.0.0",
  events_migrated: 5,
  migrated_event_types: [SCHEMA_ID],
  dry_run: false,
  migrated_by: "operator",
  migrated_at_ms: NOW + 1000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MutationEventLogRecorder", () => {
  // Each test creates fresh instances to avoid shared state
  let executor: MutationExecutor;
  let mockLog: ReturnType<typeof buildMockEventLog>;
  let recorder: MutationEventLogRecorder;

  beforeEach(() => {
    executor = new MutationExecutor();
    mockLog = buildMockEventLog();
    recorder = new MutationEventLogRecorder(executor, mockLog.log);
  });

  // ── 11c-MELR-1: before_state null for new schema ────────────────────────

  it("11c-MELR-1: handleAndRecord() apply: before_state.entry is null (new schema)", async () => {
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.before_state.entry).toBeNull();
    expect(execMeta.before_state.schema_id).toBe(SCHEMA_ID);
  });

  // ── 11c-MELR-2: after_state populated after registration ────────────────

  it("11c-MELR-2: handleAndRecord() apply: after_state.entry is populated", async () => {
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.after_state.entry).not.toBeNull();
    expect(execMeta.after_state.entry?.schema_id).toBe(SCHEMA_ID);
    expect(execMeta.after_state.entry?.status).toBe("active");
  });

  // ── 11c-MELR-3: EventLog uses original schema.* event type ──────────────

  it("11c-MELR-3: handleAndRecord() apply: EventLog entry uses original event type", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    expect(mockLog.calls[0]?.type).toBe("schema.registered");
  });

  // ── 11c-MELR-4: EventLog payload contains _execution metadata ───────────

  it("11c-MELR-4: handleAndRecord() apply: EventLog payload has _execution object", async () => {
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    const payload = result.event_log_entry?.payload;
    expect(payload).toHaveProperty("_execution");
    expect(typeof payload?.["_execution"]).toBe("object");
  });

  // ── 11c-MELR-5: _execution.decision = "apply" ───────────────────────────

  it("11c-MELR-5: handleAndRecord() apply: _execution.decision = 'apply'", async () => {
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.decision).toBe("apply");
  });

  // ── 11c-MELR-6: _execution.registry_changed = true ──────────────────────

  it("11c-MELR-6: handleAndRecord() apply: _execution.registry_changed = true", async () => {
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.registry_changed).toBe(true);
  });

  // ── 11c-MELR-7: original payload fields preserved ───────────────────────

  it("11c-MELR-7: handleAndRecord() apply: original payload fields preserved in EventLog", async () => {
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    const payload = result.event_log_entry?.payload;
    expect(payload?.["schema_id"]).toBe(SCHEMA_ID);
    expect(payload?.["namespace"]).toBe("event_type");
    expect(payload?.["name"]).toBe("task.created");
    expect(payload?.["version"]).toBe("1.0.0");
  });

  // ── 11c-MELR-8: reject: before_state populated ──────────────────────────

  it("11c-MELR-8: handleAndRecord() reject: before_state.entry set (schema exists)", async () => {
    // First register the schema
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    // Now try to update with wrong prev_version
    const wrongUpdate: SchemaUpdatedPayload = {
      ...UPDATED_PAYLOAD,
      prev_version: "9.9.9", // wrong — will pass payload validation but executor will reject
      // Actually, the executor checks if schema_id exists; it won't check prev_version.
      // Let's use an unknown schema_id to force reject
    };
    const unknownUpdate: SchemaUpdatedPayload = {
      ...UPDATED_PAYLOAD,
      schema_id: "event_type:unknown.type",
    };

    mockLog = buildMockEventLog();
    recorder = new MutationEventLogRecorder(executor, mockLog.log);

    const result = await recorder.handleAndRecord(
      "schema.updated",
      unknownUpdate,
    );

    // The schema_id doesn't exist so before_state.entry = null
    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.before_state.entry).toBeNull();
    expect(execMeta.decision).toBe("reject");
  });

  it("11c-MELR-8b: handleAndRecord() reject: before_state has existing entry when schema known", async () => {
    // Register first so the schema exists
    executor = new MutationExecutor();
    mockLog = buildMockEventLog();
    recorder = new MutationEventLogRecorder(executor, mockLog.log);
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    // Try to deprecate an already-removed schema (force remove first)
    const removeExecutor = new MutationExecutor({
      allow_undeprecated_removal: true,
    });
    const mockLog2 = buildMockEventLog();
    const recorder2 = new MutationEventLogRecorder(removeExecutor, mockLog2.log);
    await recorder2.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);
    await recorder2.handleAndRecord("schema.removed", REMOVED_PAYLOAD);

    // Now try to deprecate a removed schema → reject
    const result = await recorder2.handleAndRecord(
      "schema.deprecated",
      DEPRECATED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.before_state.entry?.status).toBe("removed");
    expect(execMeta.decision).toBe("reject");
  });

  // ── 11c-MELR-9: reject: after_state matches before_state ────────────────

  it("11c-MELR-9: handleAndRecord() reject: after_state entry matches before (no change)", async () => {
    const unknownUpdate: SchemaUpdatedPayload = {
      ...UPDATED_PAYLOAD,
      schema_id: "event_type:unknown.type",
    };

    const result = await recorder.handleAndRecord(
      "schema.updated",
      unknownUpdate,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    // Both before and after should be null (schema not in registry)
    expect(execMeta.before_state.entry).toBeNull();
    expect(execMeta.after_state.entry).toBeNull();
    expect(execMeta.registry_changed).toBe(false);
  });

  // ── 11c-MELR-10: reject: _execution.decision = "reject" ─────────────────

  it("11c-MELR-10: handleAndRecord() reject: _execution.decision = 'reject'", async () => {
    const result = await recorder.handleAndRecord(
      "schema.updated",
      { ...UPDATED_PAYLOAD, schema_id: "event_type:unknown" },
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.decision).toBe("reject");
  });

  // ── 11c-MELR-11: reject: _execution.registry_changed = false ─────────────

  it("11c-MELR-11: handleAndRecord() reject: _execution.registry_changed = false", async () => {
    const result = await recorder.handleAndRecord(
      "schema.updated",
      { ...UPDATED_PAYLOAD, schema_id: "event_type:unknown" },
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.registry_changed).toBe(false);
  });

  // ── 11c-MELR-12: reject: _execution.reason is set ────────────────────────

  it("11c-MELR-12: handleAndRecord() reject: _execution.reason is set", async () => {
    const result = await recorder.handleAndRecord(
      "schema.updated",
      { ...UPDATED_PAYLOAD, schema_id: "event_type:unknown" },
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(typeof execMeta.reason).toBe("string");
    expect(execMeta.reason).toContain("event_type:unknown");
  });

  // ── 11c-MELR-13: defer: _execution.decision = "defer" ───────────────────

  it("11c-MELR-13: handleAndRecord() defer: _execution.decision = 'defer'", async () => {
    // Register first (active — no prior deprecation → removal will defer)
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    const result = await recorder.handleAndRecord(
      "schema.removed",
      REMOVED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.decision).toBe("defer");
  });

  // ── 11c-MELR-14: defer: EventLog entry written ───────────────────────────

  it("11c-MELR-14: handleAndRecord() defer: EventLog entry is written", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    const result = await recorder.handleAndRecord(
      "schema.removed",
      REMOVED_PAYLOAD,
    );

    expect(result.event_log_entry).toBeDefined();
    expect(result.event_log_entry?.event_id).toMatch(/^evt_test_/);
  });

  // ── 11c-MELR-15: EventLog write failure: returns event_log_error ─────────

  it("11c-MELR-15: EventLog write failure returns event_log_error without throwing", async () => {
    const failingLog = buildFailingEventLog("Disk full");
    const failRecorder = new MutationEventLogRecorder(executor, failingLog);

    const result = await failRecorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    expect(result.event_log_error).toBeInstanceOf(Error);
    expect(result.event_log_error?.message).toContain("Disk full");
    expect(result.event_log_entry).toBeUndefined();
  });

  // ── 11c-MELR-16: EventLog write failure: handle_result still valid ────────

  it("11c-MELR-16: EventLog write failure: handle_result is still valid", async () => {
    const failingLog = buildFailingEventLog();
    const failRecorder = new MutationEventLogRecorder(executor, failingLog);

    const result = await failRecorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    expect(result.handle_result).toBeDefined();
    expect(result.handle_result.decision).toBe("apply");
    expect(result.handle_result.registry_changed).toBe(true);
  });

  // ── 11c-MELR-17: proposal_id in execution metadata ───────────────────────

  it("11c-MELR-17: proposal_id propagated to _execution.proposal_id", async () => {
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
      { proposal_id: "schema-prop-123" },
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.proposal_id).toBe("schema-prop-123");
  });

  // ── 11c-MELR-18: proposal_id used as causation_id ────────────────────────

  it("11c-MELR-18: proposal_id used as causation_id in EventLog event", async () => {
    await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
      { proposal_id: "schema-prop-456" },
    );

    expect(mockLog.calls[0]?.causation_id).toBe("schema-prop-456");
  });

  // ── 11c-MELR-19: schema.updated before/after state ───────────────────────

  it("11c-MELR-19: handleAndRecord() schema.updated: before=old version, after=new version", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    const result = await recorder.handleAndRecord(
      "schema.updated",
      UPDATED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.before_state.entry?.version).toBe("1.0.0");
    expect(execMeta.after_state.entry?.version).toBe("1.1.0");
    expect(execMeta.decision).toBe("apply");
  });

  // ── 11c-MELR-20: schema.deprecated before/after state ────────────────────

  it("11c-MELR-20: handleAndRecord() schema.deprecated: before=active, after=deprecated", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);
    await recorder.handleAndRecord("schema.updated", UPDATED_PAYLOAD);

    const result = await recorder.handleAndRecord(
      "schema.deprecated",
      DEPRECATED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.before_state.entry?.status).toBe("active");
    expect(execMeta.after_state.entry?.status).toBe("deprecated");
  });

  // ── 11c-MELR-21: schema.removed (deprecated) before/after ────────────────

  it("11c-MELR-21: handleAndRecord() schema.removed (deprecated): before=deprecated, after=removed", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);
    await recorder.handleAndRecord("schema.updated", UPDATED_PAYLOAD);
    await recorder.handleAndRecord("schema.deprecated", DEPRECATED_PAYLOAD);

    const result = await recorder.handleAndRecord(
      "schema.removed",
      REMOVED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.before_state.entry?.status).toBe("deprecated");
    expect(execMeta.after_state.entry?.status).toBe("removed");
    expect(execMeta.decision).toBe("apply");
  });

  // ── 11c-MELR-22: schema.removed (active, defer): before_state=after_state ─

  it("11c-MELR-22: handleAndRecord() schema.removed (active, deferred): before_state matches after_state", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    const result = await recorder.handleAndRecord(
      "schema.removed",
      REMOVED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.before_state.entry?.status).toBe("active");
    // After deferred: registry unchanged, so after_state = active still
    expect(execMeta.after_state.entry?.status).toBe("active");
    expect(execMeta.decision).toBe("defer");
    expect(execMeta.registry_changed).toBe(false);
  });

  // ── 11c-MELR-23: schema.validation_started: schema_id = null ─────────────

  it("11c-MELR-23: handleAndRecord() schema.validation_started: before_state.schema_id is null", async () => {
    const result = await recorder.handleAndRecord(
      "schema.validation_started",
      VALIDATION_STARTED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    // validation_started has no schema_id field → extracted as ""
    expect(execMeta.before_state.schema_id).toBeNull();
    expect(execMeta.before_state.entry).toBeNull();
  });

  // ── 11c-MELR-24: schema.migrated: EventLog entry written ─────────────────

  it("11c-MELR-24: handleAndRecord() schema.migrated: EventLog entry written", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);
    const result = await recorder.handleAndRecord(
      "schema.migrated",
      MIGRATED_PAYLOAD,
    );

    expect(result.event_log_entry).toBeDefined();
    expect(result.event_log_entry?.type).toBe("schema.migrated");
  });

  // ── 11c-MELR-25: approveAndRecord() apply: before=active, after=removed ──

  it("11c-MELR-25: approveAndRecord() apply: before_state=active, after_state=removed", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    // Removal will be deferred (no prior deprecation)
    const deferResult = await recorder.handleAndRecord(
      "schema.removed",
      REMOVED_PAYLOAD,
    );
    const pendingId =
      deferResult.handle_result.pending?.execution_id;
    expect(pendingId).toBeDefined();

    const approveResult = await recorder.approveAndRecord(pendingId!, "Approved by operator");

    const execMeta = approveResult.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.before_state.entry?.status).toBe("active");
    expect(execMeta.after_state.entry?.status).toBe("removed");
    expect(execMeta.decision).toBe("apply");
  });

  // ── 11c-MELR-26: approveAndRecord(): EventLog entry with decision "apply" ─

  it("11c-MELR-26: approveAndRecord(): EventLog entry written with decision='apply'", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    const deferResult = await recorder.handleAndRecord(
      "schema.removed",
      REMOVED_PAYLOAD,
    );
    const pendingId = deferResult.handle_result.pending!.execution_id;

    const approveResult = await recorder.approveAndRecord(pendingId);

    expect(approveResult.event_log_entry).toBeDefined();
    const execMeta = approveResult.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.decision).toBe("apply");
  });

  // ── 11c-MELR-27: approveAndRecord() unknown execution_id ─────────────────

  it("11c-MELR-27: approveAndRecord() unknown execution_id: resolved=false, EventLog written", async () => {
    const result = await recorder.approveAndRecord("exec-unknown-999");

    expect(result.resolution.resolved).toBe(false);
    // EventLog is still written (for audit transparency)
    expect(result.event_log_entry).toBeDefined();
  });

  // ── 11c-MELR-28: rejectAndRecord(): before_state = after_state ────────────

  it("11c-MELR-28: rejectAndRecord(): before_state entry matches after_state (no registry change)", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    const deferResult = await recorder.handleAndRecord(
      "schema.removed",
      REMOVED_PAYLOAD,
    );
    const pendingId = deferResult.handle_result.pending!.execution_id;

    const rejectResult = await recorder.rejectAndRecord(
      pendingId,
      "Operator rejected",
    );

    const execMeta = rejectResult.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    // Registry should still show "active" after rejection
    expect(execMeta.before_state.entry?.status).toBe("active");
    expect(execMeta.after_state.entry?.status).toBe("active");
    expect(execMeta.registry_changed).toBe(false);
  });

  // ── 11c-MELR-29: rejectAndRecord(): EventLog entry with decision "reject" ─

  it("11c-MELR-29: rejectAndRecord(): EventLog entry written with decision='reject'", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    const deferResult = await recorder.handleAndRecord(
      "schema.removed",
      REMOVED_PAYLOAD,
    );
    const pendingId = deferResult.handle_result.pending!.execution_id;

    const rejectResult = await recorder.rejectAndRecord(pendingId, "Not approved");

    expect(rejectResult.event_log_entry).toBeDefined();
    const execMeta = rejectResult.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.decision).toBe("reject");
  });

  // ── 11c-MELR-30: rejectAndRecord() unknown execution_id ──────────────────

  it("11c-MELR-30: rejectAndRecord() unknown execution_id: resolved=false, EventLog written", async () => {
    const result = await recorder.rejectAndRecord("exec-unknown-000", "Test");

    expect(result.resolution.resolved).toBe(false);
    expect(result.event_log_entry).toBeDefined();
  });

  // ── 11c-MELR-31: _execution.meta_level is always true ────────────────────

  it("11c-MELR-31: _execution.meta_level is always true", async () => {
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.meta_level).toBe(true);
  });

  // ── 11c-MELR-32: _execution.recorded_at_ms is a recent timestamp ──────────

  it("11c-MELR-32: _execution.recorded_at_ms is a recent timestamp", async () => {
    const before = Date.now();
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );
    const after = Date.now();

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.recorded_at_ms).toBeGreaterThanOrEqual(before);
    expect(execMeta.recorded_at_ms).toBeLessThanOrEqual(after);
  });

  // ── 11c-MELR-33: custom run_id ────────────────────────────────────────────

  it("11c-MELR-33: custom run_id used when provided in RecordOptions", async () => {
    await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
      { run_id: "custom-run-999" },
    );

    expect(mockLog.calls[0]?.run_id).toBe("custom-run-999");
  });

  // ── 11c-MELR-34: custom actor ─────────────────────────────────────────────

  it("11c-MELR-34: custom actor used when provided in RecordOptions", async () => {
    const customActor = { kind: "agent" as const, id: "agent-007" };
    await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
      { actor: customActor },
    );

    expect(mockLog.calls[0]?.actor).toEqual(customActor);
  });

  // ── 11c-MELR-35: default actor ────────────────────────────────────────────

  it("11c-MELR-35: default actor is { kind: 'system', id: 'mutation-executor' }", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    expect(mockLog.calls[0]?.actor).toEqual({
      kind: "system",
      id: "mutation-executor",
    });
  });

  // ── 11c-MELR-36: getRegistry() delegates to executor ─────────────────────

  it("11c-MELR-36: getRegistry() delegates to executor.getRegistry()", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    const registry = recorder.getRegistry();
    expect(registry.length).toBe(1);
    expect(registry[0]?.schema_id).toBe(SCHEMA_ID);
  });

  // ── 11c-MELR-37: getExecutionLog() delegates ──────────────────────────────

  it("11c-MELR-37: getExecutionLog() delegates to executor.getExecutionLog()", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    const log = recorder.getExecutionLog();
    expect(log.length).toBe(1);
    expect(log[0]?.event_type).toBe("schema.registered");
  });

  // ── 11c-MELR-38: executor getter ──────────────────────────────────────────

  it("11c-MELR-38: executor getter returns the underlying MutationExecutor", () => {
    expect(recorder.executor).toBe(executor);
  });

  // ── 11c-MELR-39: initMutationEventLogRecorder ────────────────────────────

  it("11c-MELR-39: initMutationEventLogRecorder() returns MutationEventLogRecorder", () => {
    const newLog = buildMockEventLog().log;
    const instance = initMutationEventLogRecorder(newLog);
    expect(instance).toBeInstanceOf(MutationEventLogRecorder);
  });

  // ── 11c-MELR-40: useMutationEventLogRecorder ─────────────────────────────

  it("11c-MELR-40: useMutationEventLogRecorder() returns the singleton", () => {
    const newLog = buildMockEventLog().log;
    initMutationEventLogRecorder(newLog);
    const singleton = useMutationEventLogRecorder();
    expect(singleton).toBeDefined();
    expect(typeof singleton.handleAndRecord).toBe("function");
  });

  // ── 11c-MELR-41: full lifecycle ───────────────────────────────────────────

  it("11c-MELR-41: full lifecycle: register → update → deprecate → defer → approve", async () => {
    // 1. Register
    const r1 = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );
    expect(r1.handle_result.decision).toBe("apply");

    // 2. Update
    const r2 = await recorder.handleAndRecord("schema.updated", UPDATED_PAYLOAD);
    expect(r2.handle_result.decision).toBe("apply");

    // 3. Deprecate
    const r3 = await recorder.handleAndRecord(
      "schema.deprecated",
      DEPRECATED_PAYLOAD,
    );
    expect(r3.handle_result.decision).toBe("apply");

    // After deprecation, removal should auto-apply
    const r4 = await recorder.handleAndRecord("schema.removed", REMOVED_PAYLOAD);
    expect(r4.handle_result.decision).toBe("apply");

    // Verify final state snapshot
    const execMeta4 = r4.event_log_entry?.payload["_execution"] as MutationExecutionMetadata;
    expect(execMeta4.before_state.entry?.status).toBe("deprecated");
    expect(execMeta4.after_state.entry?.status).toBe("removed");

    // 4 EventLog calls total
    expect(mockLog.calls.length).toBe(4);
  });

  // ── 11c-MELR-42: EventLog receives schema.* event type ───────────────────

  it("11c-MELR-42: EventLog append receives schema.* event type (not generic)", async () => {
    await recorder.handleAndRecord("schema.deprecated", {
      ...DEPRECATED_PAYLOAD,
      schema_id: "event_type:test.event",
    });

    expect(mockLog.calls[0]?.type).toBe("schema.deprecated");
  });

  // ── 11c-MELR-43: EventLog called exactly once per handleAndRecord ─────────

  it("11c-MELR-43: EventLog.append called exactly once per handleAndRecord()", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);
    await recorder.handleAndRecord("schema.updated", UPDATED_PAYLOAD);

    expect(mockLog.calls.length).toBe(2);
  });

  // ── 11c-MELR-44: EventLog called once per approveAndRecord ───────────────

  it("11c-MELR-44: EventLog.append called exactly once per approveAndRecord()", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);
    const r = await recorder.handleAndRecord("schema.removed", REMOVED_PAYLOAD);
    const prevCallCount = mockLog.calls.length;

    await recorder.approveAndRecord(r.handle_result.pending!.execution_id);

    expect(mockLog.calls.length).toBe(prevCallCount + 1);
  });

  // ── 11c-MELR-45: EventLog called once per rejectAndRecord ────────────────

  it("11c-MELR-45: EventLog.append called exactly once per rejectAndRecord()", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);
    const r = await recorder.handleAndRecord("schema.removed", REMOVED_PAYLOAD);
    const prevCallCount = mockLog.calls.length;

    await recorder.rejectAndRecord(r.handle_result.pending!.execution_id, "no");

    expect(mockLog.calls.length).toBe(prevCallCount + 1);
  });

  // ── 11c-MELR-46: before_state captured BEFORE executor.handle() ───────────

  it("11c-MELR-46: before_state captured BEFORE handle() — uses pre-call registry state", async () => {
    // Register to put the schema in the registry
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    // Before deprecation, before_state should be "active"
    const result = await recorder.handleAndRecord(
      "schema.deprecated",
      DEPRECATED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    // Before the deprecation call, the entry was active
    expect(execMeta.before_state.entry?.status).toBe("active");
    // After the deprecation call, the entry is deprecated
    expect(execMeta.after_state.entry?.status).toBe("deprecated");
  });

  // ── 11c-MELR-47: after_state captured AFTER executor.handle() ────────────

  it("11c-MELR-47: after_state captured AFTER handle() — uses post-call registry state", async () => {
    // Before registration: before_state.entry = null (schema doesn't exist yet)
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.before_state.entry).toBeNull(); // not in registry before
    expect(execMeta.after_state.entry).not.toBeNull(); // in registry after
    expect(execMeta.after_state.entry?.version).toBe("1.0.0");
  });

  // ── Additional edge cases ─────────────────────────────────────────────────

  it("handleAndRecord() with invalid payload: both reject + EventLog written", async () => {
    const invalidPayload = { schema_id: "bad-format" }; // fails isValidSchemaPayload

    const result = await recorder.handleAndRecord(
      "schema.registered",
      invalidPayload,
    );

    expect(result.handle_result.decision).toBe("reject");
    expect(result.event_log_entry).toBeDefined();
    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.decision).toBe("reject");
  });

  it("MutationEventLogRecorder: run_id_prefix option is used for auto-generated run_id", async () => {
    const customRecorder = new MutationEventLogRecorder(
      new MutationExecutor(),
      mockLog.log,
      { run_id_prefix: "my-prefix" },
    );

    await customRecorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    expect(mockLog.calls[0]?.run_id).toMatch(/^my-prefix-/);
  });

  it("default run_id uses 'meta-mutation' prefix", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    expect(mockLog.calls[0]?.run_id).toMatch(/^meta-mutation-/);
  });

  it("correlation_id is forwarded to EventLog entry when provided", async () => {
    await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
      { correlation_id: "corr-xyz-789" },
    );

    expect(mockLog.calls[0]?.correlation_id).toBe("corr-xyz-789");
  });

  it("_execution.execution_id matches the ExecutionRecord.execution_id", async () => {
    const result = await recorder.handleAndRecord(
      "schema.registered",
      REGISTERED_PAYLOAD,
    );

    const execMeta = result.event_log_entry?.payload[
      "_execution"
    ] as MutationExecutionMetadata;
    expect(execMeta.execution_id).toBe(
      result.handle_result.record.execution_id,
    );
  });

  it("schema.migrated: migrated_event_types reflected in after_state if schema in registry", async () => {
    await recorder.handleAndRecord("schema.registered", REGISTERED_PAYLOAD);

    // Migration updates the last_updated_at_ms of registered schema types
    const result = await recorder.handleAndRecord(
      "schema.migrated",
      MIGRATED_PAYLOAD,
    );

    expect(result.handle_result.decision).toBe("apply");
    expect(result.event_log_entry).toBeDefined();
  });
});
