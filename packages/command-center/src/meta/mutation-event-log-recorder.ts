/**
 * @module mutation-event-log-recorder
 * Sub-AC 11c — Apply/reject executor with event_log recorder.
 *
 * The MutationEventLogRecorder wraps a MutationExecutor and writes
 * before/after registry-state snapshots to the event log for every
 * mutation execution — both successful (apply) and failed (reject/defer).
 *
 * ─── Responsibility boundary ───────────────────────────────────────────────
 *
 * This module bridges the in-memory MutationExecutor (Sub-AC 11b) with the
 * persistent EventLog:
 *
 *   MutationExecutor.handle()      → decision (apply / reject / defer)
 *   MutationEventLogRecorder       → capture before/after + write to EventLog
 *   EventLog.append()              → durable write-only record
 *
 * ─── Before/after state snapshots ─────────────────────────────────────────
 *
 * For every mutation execution the recorder captures:
 *   1. before_state — registry entry for the affected schema_id BEFORE
 *      the executor processes the event (null if schema not yet in registry)
 *   2. after_state  — registry entry for the affected schema_id AFTER
 *      the executor processes the event (null for rejected/defer outcomes)
 *
 * Both snapshots are embedded in the event payload under a reserved
 * `_execution` key, keeping the original mutation payload fields intact
 * for replay compatibility.
 *
 * ─── Record transparency ───────────────────────────────────────────────────
 *
 * Every call to `handleAndRecord()`, `approveAndRecord()`, and
 * `rejectAndRecord()` produces:
 *   1. An in-memory ExecutionRecord (from MutationExecutor — Sub-AC 11b)
 *   2. A durable ConitensEvent in the EventLog (this module — Sub-AC 11c)
 *
 * The ConitensEvent type matches the incoming schema.* event type so that
 * the EventLog remains a faithful, replayable audit trail of schema mutations.
 *
 * ─── Error handling ────────────────────────────────────────────────────────
 *
 * If the EventLog write fails (network partition, disk full, etc.) the
 * executor decision is still returned so the caller can handle it, and the
 * error is exposed via the `event_log_error` field of the result.
 *
 * Record transparency guarantees are BEST-EFFORT when the EventLog is
 * unavailable.  The in-memory execution log always receives the record.
 *
 * ─── EventLog appender interface ───────────────────────────────────────────
 *
 * The recorder accepts any object that implements `EventLogAppender`, which
 * matches the `EventLog.append()` signature from `@conitens/core`.  This
 * keeps the command-center package free of Node.js fs dependencies and
 * allows test-doubles to be injected trivially.
 *
 * ─── Meta-level routing guarantee ─────────────────────────────────────────
 *
 * All EventLog writes use `schema.*` event types with `meta_level: true` in
 * the payload metadata.  This signals to any downstream consumers that these
 * events belong to the meta stratum (not domain or infrastructure) and should
 * be routed/processed accordingly.
 */

import type {
  SchemaEventType,
  SchemaEventPayloadMap,
  EventType,
  Actor,
} from "@conitens/protocol";
import {
  MutationExecutor,
  mutationExecutor,
  type ExecutionDecision,
  type RegistryEntry,
  type MutationHandleResult,
  type OperatorResolutionResult,
} from "./mutation-executor.js";

// ---------------------------------------------------------------------------
// EventLog appender interface
// ---------------------------------------------------------------------------

/**
 * Minimal interface for appending events to a persistent event log.
 *
 * This matches the `EventLog.append()` method from `@conitens/core` but is
 * defined locally to avoid importing Node.js fs dependencies into the
 * command-center frontend package.
 *
 * Any object with a compatible `.append()` method can be injected, including
 * `new EventLog(eventsDir)` from `@conitens/core` or a test double.
 */
export interface EventLogAppender {
  append(event: EventLogAppendInput): Promise<RecordedConitensEvent>;
}

/**
 * Minimal ConitensEvent shape expected from EventLog.append().
 * Returned after the event is durably written.
 */
export interface RecordedConitensEvent {
  schema: string;
  event_id: string;
  type: EventType;
  ts: string;
  run_id: string;
  actor: Actor;
  payload: Record<string, unknown>;
  causation_id?: string;
  correlation_id?: string;
}

/**
 * Input shape for EventLog.append().
 * Mirrors the parameter type of EventLog.append() from @conitens/core.
 */
export interface EventLogAppendInput {
  type: EventType;
  run_id: string;
  actor: Actor;
  payload: Record<string, unknown>;
  causation_id?: string;
  correlation_id?: string;
}

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

/**
 * A point-in-time snapshot of a single registry entry.
 *
 * Captured before and after every mutation execution to give a clear
 * picture of what changed (or was rejected).
 */
export interface RegistryStateSnapshot {
  /**
   * Wall-clock time (ms) when the snapshot was taken.
   * `before_state` is captured BEFORE `executor.handle()` is called.
   * `after_state`  is captured AFTER  `executor.handle()` returns.
   */
  captured_at_ms: number;
  /**
   * The schema_id of the affected entry.
   * Null for tracking events (schema.validation_started, schema.migrated, etc.)
   * that do not target a specific schema_id.
   */
  schema_id: string | null;
  /**
   * The full registry entry at the time of capture.
   * Null when:
   *   - The schema_id is not yet in the registry (before registration)
   *   - The schema_id is null (non-schema tracking event)
   *   - The mutation was rejected and the registry is unchanged
   */
  entry: RegistryEntry | null;
}

// ---------------------------------------------------------------------------
// Execution metadata (embedded in EventLog payload)
// ---------------------------------------------------------------------------

/**
 * Execution metadata appended to the EventLog event payload.
 *
 * Stored under the reserved `_execution` key in the ConitensEvent payload.
 * This keeps the original mutation payload fields intact for replay.
 *
 * Reserved key convention: `_execution` (underscore prefix = internal metadata).
 * Replay/reduction logic MUST skip `_execution` when reconstructing domain state.
 */
export interface MutationExecutionMetadata {
  /** Execution ID from the MutationExecutor.  Links to the in-memory record. */
  execution_id: string;
  /** The decision made by the executor. */
  decision: ExecutionDecision;
  /** Human-readable reason for the decision (required for reject/defer). */
  reason?: string;
  /** Whether the registry state changed as a direct result of this execution. */
  registry_changed: boolean;
  /** Proposal ID that generated the mutation (for causal chain reconstruction). */
  proposal_id?: string;
  /** Registry state immediately before execution. */
  before_state: RegistryStateSnapshot;
  /** Registry state immediately after execution. */
  after_state: RegistryStateSnapshot;
  /**
   * Wall-clock time (ms) when this metadata record was created.
   * May differ slightly from `after_state.captured_at_ms` due to EventLog I/O.
   */
  recorded_at_ms: number;
  /**
   * Meta-level flag.  Signals to downstream consumers that this event belongs
   * to the meta stratum and should not be processed as a domain/infra event.
   */
  meta_level: true;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * Result of `MutationEventLogRecorder.handleAndRecord()`.
 */
export interface HandleAndRecordResult {
  /** The execution result from the underlying MutationExecutor. */
  handle_result: MutationHandleResult;
  /**
   * The durable ConitensEvent written to EventLog.
   * Present when the write succeeded; absent when `event_log_error` is set.
   */
  event_log_entry?: RecordedConitensEvent;
  /**
   * Set when the EventLog write failed.
   * The `handle_result` is still valid and the in-memory execution log
   * has the record.  Callers should handle this gracefully.
   */
  event_log_error?: Error;
}

/**
 * Result of `MutationEventLogRecorder.approveAndRecord()` or
 * `MutationEventLogRecorder.rejectAndRecord()`.
 */
export interface ResolutionAndRecordResult {
  /** The resolution result from the underlying MutationExecutor. */
  resolution: OperatorResolutionResult;
  /**
   * The durable ConitensEvent written to EventLog.
   * Present when the write succeeded.
   */
  event_log_entry?: RecordedConitensEvent;
  /**
   * Set when the EventLog write failed.
   */
  event_log_error?: Error;
}

// ---------------------------------------------------------------------------
// Recorder options
// ---------------------------------------------------------------------------

/**
 * Options for `handleAndRecord()`, `approveAndRecord()`, and `rejectAndRecord()`.
 */
export interface RecordOptions {
  /**
   * Proposal ID to link this execution to the `SchemaMutationProposal` that
   * triggered it.  Propagated to both ExecutionRecord and EventLog entry.
   */
  proposal_id?: string;
  /**
   * `run_id` for the ConitensEvent envelope.
   * If omitted, the recorder generates one in the format `meta-mutation-<ts>`.
   */
  run_id?: string;
  /**
   * Actor for the ConitensEvent envelope.
   * Defaults to `{ kind: "system", id: "mutation-executor" }`.
   */
  actor?: Actor;
  /**
   * `correlation_id` for the ConitensEvent envelope.
   * Optional causal chain correlation.
   */
  correlation_id?: string;
}

/**
 * Constructor options for `MutationEventLogRecorder`.
 */
export interface MutationEventLogRecorderOptions {
  /**
   * Default `run_id` prefix used when no `run_id` is passed in RecordOptions.
   * Default: "meta-mutation"
   */
  run_id_prefix?: string;
  /**
   * Default actor used when no `actor` is passed in RecordOptions.
   * Default: `{ kind: "system", id: "mutation-executor" }`
   */
  default_actor?: Actor;
}

// ---------------------------------------------------------------------------
// MutationEventLogRecorder
// ---------------------------------------------------------------------------

/**
 * MutationEventLogRecorder — Sub-AC 11c
 *
 * Wraps a `MutationExecutor` and writes before/after registry-state snapshots
 * to the event log for every mutation execution.
 *
 * Usage (server-side with @conitens/core EventLog):
 * ```ts
 * import { EventLog } from "@conitens/core";
 * import { MutationEventLogRecorder, mutationExecutor } from "@conitens/command-center/meta";
 *
 * const eventLog = new EventLog("/path/to/events");
 * const recorder = new MutationEventLogRecorder(mutationExecutor, eventLog);
 *
 * const result = await recorder.handleAndRecord("schema.registered", payload);
 * console.log(result.handle_result.decision); // "apply"
 * console.log(result.event_log_entry?.event_id); // "evt_01..."
 * ```
 *
 * Usage (test with mock EventLog):
 * ```ts
 * const mockLog: EventLogAppender = {
 *   append: vi.fn().mockResolvedValue({ event_id: "test-id", ... })
 * };
 * const recorder = new MutationEventLogRecorder(new MutationExecutor(), mockLog);
 * ```
 */
export class MutationEventLogRecorder {
  private readonly _executor: MutationExecutor;
  private readonly _eventLog: EventLogAppender;
  private readonly _opts: Required<MutationEventLogRecorderOptions>;

  constructor(
    executor: MutationExecutor,
    eventLog: EventLogAppender,
    opts: MutationEventLogRecorderOptions = {},
  ) {
    this._executor = executor;
    this._eventLog = eventLog;
    this._opts = {
      run_id_prefix: opts.run_id_prefix ?? "meta-mutation",
      default_actor: opts.default_actor ?? {
        kind: "system",
        id: "mutation-executor",
      },
    };
  }

  // ── Public: handle and record ────────────────────────────────────────────

  /**
   * Handle a `schema.*` event via the executor and durably record the
   * execution outcome (including before/after registry state) to the EventLog.
   *
   * Steps:
   *   1. Capture `before_state` from the executor registry.
   *   2. Call `executor.handle(eventType, payload, { proposal_id })`.
   *   3. Capture `after_state` from the executor registry.
   *   4. Append an enriched ConitensEvent to EventLog.
   *   5. Return both handle_result and event_log_entry.
   *
   * @param eventType  The incoming `schema.*` event type.
   * @param payload    The raw event payload to validate and execute.
   * @param opts       Optional record options (proposal_id, run_id, actor).
   */
  async handleAndRecord<T extends SchemaEventType>(
    eventType: T,
    payload: unknown,
    opts: RecordOptions = {},
  ): Promise<HandleAndRecordResult> {
    // 1. Determine schema_id from payload (best-effort — may be "" for invalid)
    const schema_id = extractSchemaIdFromPayload(payload);

    // 2. Capture before-state
    const before_state = this._captureSnapshot(schema_id || null);

    // 3. Execute mutation
    const handle_result = this._executor.handle(eventType, payload, {
      proposal_id: opts.proposal_id,
    });

    // 4. Capture after-state
    const after_state = this._captureSnapshot(schema_id || null);

    // 5. Build execution metadata
    const execution_metadata = this._buildExecutionMetadata(
      handle_result.record.execution_id,
      handle_result.decision,
      handle_result.record.reason,
      handle_result.registry_changed,
      opts.proposal_id,
      before_state,
      after_state,
    );

    // 6. Write to EventLog (best-effort — executor decision is authoritative)
    const logResult = await this._writeToEventLog(
      eventType,
      payload,
      execution_metadata,
      opts,
    );

    return {
      handle_result,
      event_log_entry: logResult.entry,
      event_log_error: logResult.error,
    };
  }

  // ── Public: operator resolution with recording ───────────────────────────

  /**
   * Approve a deferred mutation via the executor and record the resolution
   * with before/after state to the EventLog.
   *
   * @param execution_id  The execution_id of the deferred decision to approve.
   * @param reason        Optional operator-provided reason.
   * @param opts          Optional record options.
   */
  async approveAndRecord(
    execution_id: string,
    reason?: string,
    opts: RecordOptions = {},
  ): Promise<ResolutionAndRecordResult> {
    // Look up pending decision BEFORE resolving (to get event_type + schema_id)
    const pending = this._executor.getPendingDecision(execution_id);
    const schema_id = pending?.schema_id ?? null;
    const event_type: SchemaEventType = pending?.event_type ?? "schema.removed";

    // 1. Capture before-state
    const before_state = this._captureSnapshot(schema_id);

    // 2. Resolve via executor
    const resolution = this._executor.operatorApprove(execution_id, reason);

    // 3. Capture after-state
    const after_state = this._captureSnapshot(schema_id);

    // 4. Build execution metadata
    const execution_metadata = this._buildExecutionMetadata(
      resolution.record.execution_id,
      resolution.record.decision,
      resolution.record.reason,
      resolution.registry_changed,
      pending?.proposal_id,
      before_state,
      after_state,
    );

    // 5. Write to EventLog
    const logResult = await this._writeToEventLog(
      event_type,
      pending?.payload ?? {},
      execution_metadata,
      {
        ...opts,
        proposal_id: opts.proposal_id ?? pending?.proposal_id,
      },
    );

    return {
      resolution,
      event_log_entry: logResult.entry,
      event_log_error: logResult.error,
    };
  }

  /**
   * Reject a deferred mutation via the executor and record the rejection
   * with before/after state to the EventLog.
   *
   * @param execution_id  The execution_id of the deferred decision to reject.
   * @param reason        Required reason for rejection (audit transparency).
   * @param opts          Optional record options.
   */
  async rejectAndRecord(
    execution_id: string,
    reason: string,
    opts: RecordOptions = {},
  ): Promise<ResolutionAndRecordResult> {
    // Look up pending decision BEFORE resolving
    const pending = this._executor.getPendingDecision(execution_id);
    const schema_id = pending?.schema_id ?? null;
    const event_type: SchemaEventType = pending?.event_type ?? "schema.removed";

    // 1. Capture before-state (registry is unchanged for reject, but we still capture)
    const before_state = this._captureSnapshot(schema_id);

    // 2. Resolve via executor
    const resolution = this._executor.operatorReject(execution_id, reason);

    // 3. Capture after-state (should be identical to before for reject)
    const after_state = this._captureSnapshot(schema_id);

    // 4. Build execution metadata
    const execution_metadata = this._buildExecutionMetadata(
      resolution.record.execution_id,
      resolution.record.decision,
      resolution.record.reason,
      resolution.registry_changed,
      pending?.proposal_id,
      before_state,
      after_state,
    );

    // 5. Write to EventLog
    const logResult = await this._writeToEventLog(
      event_type,
      pending?.payload ?? {},
      execution_metadata,
      {
        ...opts,
        proposal_id: opts.proposal_id ?? pending?.proposal_id,
      },
    );

    return {
      resolution,
      event_log_entry: logResult.entry,
      event_log_error: logResult.error,
    };
  }

  // ── Public: delegation accessors ─────────────────────────────────────────

  /**
   * Expose the underlying executor's registry for read-only access.
   * Delegates directly to `MutationExecutor.getRegistry()`.
   */
  getRegistry() {
    return this._executor.getRegistry();
  }

  /**
   * Expose the underlying executor's execution log for read-only access.
   */
  getExecutionLog() {
    return this._executor.getExecutionLog();
  }

  /**
   * Return the underlying MutationExecutor instance.
   * Use sparingly — prefer `handleAndRecord()` for mutation operations.
   */
  get executor(): MutationExecutor {
    return this._executor;
  }

  // ── Private: snapshot capture ────────────────────────────────────────────

  /**
   * Capture a point-in-time snapshot of a registry entry.
   *
   * @param schema_id  The schema_id to snapshot, or null for tracking events.
   */
  private _captureSnapshot(schema_id: string | null): RegistryStateSnapshot {
    return {
      captured_at_ms: Date.now(),
      schema_id,
      entry:
        schema_id != null && schema_id !== ""
          ? (this._executor.getEntry(schema_id) ?? null)
          : null,
    };
  }

  // ── Private: execution metadata builder ──────────────────────────────────

  /**
   * Build the `MutationExecutionMetadata` object embedded in the EventLog payload.
   */
  private _buildExecutionMetadata(
    execution_id: string,
    decision: ExecutionDecision,
    reason: string | undefined,
    registry_changed: boolean,
    proposal_id: string | undefined,
    before_state: RegistryStateSnapshot,
    after_state: RegistryStateSnapshot,
  ): MutationExecutionMetadata {
    return {
      execution_id,
      decision,
      reason,
      registry_changed,
      proposal_id,
      before_state,
      after_state,
      recorded_at_ms: Date.now(),
      meta_level: true,
    };
  }

  // ── Private: EventLog write ───────────────────────────────────────────────

  /**
   * Write the enriched mutation event to the EventLog.
   *
   * Enriches the original mutation payload with the `_execution` metadata
   * object, then calls `eventLog.append()`.
   *
   * Returns the written entry, or an error if the write failed.
   * Never throws — EventLog write failures are captured and returned.
   */
  private async _writeToEventLog(
    eventType: SchemaEventType,
    payload: unknown,
    execution_metadata: MutationExecutionMetadata,
    opts: RecordOptions,
  ): Promise<{
    entry?: RecordedConitensEvent;
    error?: Error;
  }> {
    // Build enriched payload: original fields + _execution metadata
    const originalFields: Record<string, unknown> =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {};

    const enrichedPayload: Record<string, unknown> = {
      ...originalFields,
      _execution: execution_metadata,
    };

    const run_id =
      opts.run_id ?? `${this._opts.run_id_prefix}-${Date.now()}`;
    const actor: Actor = opts.actor ?? this._opts.default_actor;

    try {
      const entry = await this._eventLog.append({
        type: eventType as EventType,
        run_id,
        actor,
        payload: enrichedPayload,
        causation_id: opts.proposal_id ?? execution_metadata.proposal_id,
        correlation_id: opts.correlation_id,
      });
      return { entry };
    } catch (err: unknown) {
      const error =
        err instanceof Error
          ? err
          : new Error(
              `EventLog write failed: ${typeof err === "string" ? err : JSON.stringify(err)}`,
            );
      return { error };
    }
  }
}

// ---------------------------------------------------------------------------
// Application-scoped singleton
// ---------------------------------------------------------------------------

/**
 * Application-scoped `MutationEventLogRecorder` singleton.
 *
 * IMPORTANT: The singleton is initialised WITHOUT an EventLog.  The EventLog
 * must be injected at startup via `initMutationEventLogRecorder(eventLog)`.
 * Until initialised, calling `handleAndRecord()` will return an
 * `event_log_error` indicating that the EventLog is not configured.
 *
 * ```ts
 * // In server boot (e.g. electron main, Node.js server):
 * import { EventLog } from "@conitens/core";
 * import { initMutationEventLogRecorder } from "./meta/mutation-event-log-recorder.js";
 *
 * const eventLog = new EventLog("/path/to/events");
 * const recorder = initMutationEventLogRecorder(eventLog);
 * ```
 */

/** Lazy EventLog appender — replaced by initMutationEventLogRecorder(). */
const _nullLog: EventLogAppender = {
  append: () =>
    Promise.reject(
      new Error(
        "MutationEventLogRecorder: EventLog not initialised. " +
          "Call initMutationEventLogRecorder(eventLog) before using the singleton.",
      ),
    ),
};

let _recorderInstance: MutationEventLogRecorder = new MutationEventLogRecorder(
  mutationExecutor,
  _nullLog,
);

/**
 * Initialise (or re-initialise) the application-scoped singleton with a
 * real EventLog appender.
 *
 * Call this once at application start-up before any `handleAndRecord()` calls.
 *
 * @param eventLog  Any `EventLogAppender`-compatible object.
 * @param opts      Optional recorder options.
 * @returns The initialised `MutationEventLogRecorder` singleton.
 */
export function initMutationEventLogRecorder(
  eventLog: EventLogAppender,
  opts?: MutationEventLogRecorderOptions,
): MutationEventLogRecorder {
  _recorderInstance = new MutationEventLogRecorder(
    mutationExecutor,
    eventLog,
    opts,
  );
  return _recorderInstance;
}

/**
 * The application-scoped `MutationEventLogRecorder` singleton.
 * Must be initialised via `initMutationEventLogRecorder()` before use.
 */
export const mutationEventLogRecorder: MutationEventLogRecorder =
  // Use a Proxy so the singleton lazily delegates to the latest _recorderInstance
  // after `initMutationEventLogRecorder()` is called.
  new Proxy({} as MutationEventLogRecorder, {
    get(_target, prop: keyof MutationEventLogRecorder) {
      const val = (_recorderInstance as unknown as Record<string, unknown>)[
        prop as string
      ];
      if (typeof val === "function") {
        return (val as Function).bind(_recorderInstance);
      }
      return val;
    },
  });

// ---------------------------------------------------------------------------
// React hook wrapper
// ---------------------------------------------------------------------------

/**
 * Returns the application-scoped `MutationEventLogRecorder` singleton.
 *
 * The recorder MUST have been initialised via `initMutationEventLogRecorder()`
 * before this hook is called from the GUI.
 *
 * @example
 * ```tsx
 * function MetaMutationPanel() {
 *   const recorder = useMutationEventLogRecorder();
 *   const handleApply = async () => {
 *     const result = await recorder.handleAndRecord("schema.registered", payload);
 *     console.log(result.event_log_entry?.event_id);
 *   };
 * }
 * ```
 */
export function useMutationEventLogRecorder(): MutationEventLogRecorder {
  return mutationEventLogRecorder;
}

// ---------------------------------------------------------------------------
// Internal utility
// ---------------------------------------------------------------------------

/**
 * Extract `schema_id` from an unknown payload value.
 * Returns an empty string if the payload has no `schema_id` field.
 *
 * Mirrors the private `extractSchemaId` in mutation-executor.ts but is
 * module-local here to avoid coupling to executor internals.
 */
function extractSchemaIdFromPayload(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "schema_id" in payload &&
    typeof (payload as Record<string, unknown>)["schema_id"] === "string"
  ) {
    return (payload as Record<string, unknown>)["schema_id"] as string;
  }
  return "";
}
