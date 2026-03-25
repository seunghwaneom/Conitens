/**
 * @module mutation-executor
 * Sub-AC 11b — Meta-level mutation executor.
 *
 * The MutationExecutor is the dedicated meta-level handler that receives
 * `schema.*` events, **bypasses the infrastructure pipeline**, and orchestrates
 * the apply/reject decision flow.
 *
 * ─── Decision flow ───────────────────────────────────────────────────────────
 *
 *   schema.registered         → AUTO_APPLY    (safe: only adds new entries)
 *   schema.updated            → AUTO_APPLY    (safe: backward-compat enforced by proposer)
 *   schema.deprecated         → AUTO_APPLY    (safe: informational, non-breaking)
 *   schema.removed            → REQUIRE_APPROVAL  (breaking: requires prior deprecation or
 *                                                  explicit operator confirmation)
 *   schema.validation_started → AUTO_APPLY    (tracking event, no registry state change)
 *   schema.validated          → AUTO_APPLY    (record keeping only)
 *   schema.migration_started  → REQUIRE_APPROVAL  (high-risk: requires explicit confirmation)
 *   schema.migrated           → AUTO_APPLY    (record keeping after migration run)
 *
 * ─── Meta-level routing guarantee ────────────────────────────────────────────
 *
 * The executor operates EXCLUSIVELY at the meta level:
 *   ✗ WRONG:  executor writes CommandFile → /api/commands → Orchestrator
 *   ✓ CORRECT: executor receives schema.* events directly and projects them
 *              to an in-memory registry state WITHOUT touching the command pipeline.
 *
 * All decisions are recorded in an append-only `ExecutionLog`.
 * Registry state is a projection from applied execution records.
 * Deferred decisions remain in `pendingDecisions` until resolved via
 * `operatorApprove()` or `operatorReject()`.
 *
 * ─── Backward-compatibility constraint ───────────────────────────────────────
 *
 * `schema.removed` mutations are deferred by default unless the schema_id
 * has a prior `schema.deprecated` entry in the registry.  This enforces the
 * migration-safety invariant:
 *   "Schema mutations must be backward-compatible with existing event_log entries."
 *
 * If a `schema.removed` arrives for a schema that has never been deprecated,
 * it is placed in `pendingDecisions` until the operator explicitly approves it.
 *
 * ─── Payload validation ───────────────────────────────────────────────────────
 *
 * Every incoming event is validated against its expected payload shape using
 * `isValidSchemaPayload` from `@conitens/protocol` before any decision is made.
 * Invalid payloads are rejected with a detailed error message and are NOT
 * placed in the execution log (only a rejection record is written).
 *
 * ─── Record transparency ─────────────────────────────────────────────────────
 *
 * Every call to `handle()`, `operatorApprove()`, and `operatorReject()` appends
 * an `ExecutionRecord` to the append-only execution log.  The log is write-only
 * and entries are never mutated after creation.
 */

import {
  isValidSchemaPayload,
  type SchemaEventType,
  type SchemaEventPayloadMap,
  type SchemaRegisteredPayload,
  type SchemaUpdatedPayload,
  type SchemaDeprecatedPayload,
  type SchemaRemovedPayload,
  type SchemaMigratedPayload,
  type SchemaNamespace,
} from "@conitens/protocol";

// ---------------------------------------------------------------------------
// Decision types
// ---------------------------------------------------------------------------

/**
 * The outcome decision for a single incoming `schema.*` event.
 *
 * - `apply`   — mutation accepted and applied to registry state immediately
 * - `reject`  — mutation rejected (invalid payload, unknown schema_id, etc.)
 * - `defer`   — mutation queued for operator approval (high-risk operations)
 */
export type ExecutionDecision = "apply" | "reject" | "defer";

// ---------------------------------------------------------------------------
// Registry state types
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of an entry in the schema registry.
 *
 * Mirrors the `SchemaStatus` type from `@conitens/protocol` but is scoped
 * to the executor's in-memory projection.
 */
export type RegistryEntryStatus = "active" | "deprecated" | "removed";

/**
 * An entry in the executor's in-memory schema registry.
 *
 * This is a projected view of the current state of a single schema entity
 * as derived from the applied `ExecutionRecord` entries.
 *
 * The registry is NOT the authoritative source of truth — the event log is.
 * This projection exists for O(1) decision lookups (e.g. "has this schema
 * been deprecated before allowing removal?").
 */
export interface RegistryEntry {
  /** Stable schema identifier (e.g. "event_type:task.created"). */
  schema_id: string;
  /** Namespace of this schema entry. */
  namespace: SchemaNamespace;
  /** Human-readable name of the schema entry. */
  name: string;
  /** Most recent semver version string of this entry. */
  version: string;
  /** Current lifecycle status. */
  status: RegistryEntryStatus;
  /**
   * Wall-clock time (ms) when this entry was first registered.
   * Populated from the `registered_at_ms` field of the `schema.registered` payload,
   * or from the executor's local clock if absent.
   */
  registered_at_ms: number;
  /**
   * Wall-clock time (ms) when this entry was last modified (update / deprecate / remove).
   */
  last_updated_at_ms: number;
  /** Set when status transitions to "deprecated". */
  deprecated_at_ms?: number;
  /** Set when status transitions to "removed". */
  removed_at_ms?: number;
  /** Deprecated_reason captured from schema.deprecated payload. */
  deprecation_reason?: string;
  /** Optional replacement schema_id (captured from schema.deprecated payload). */
  replacement_schema_id?: string;
}

// ---------------------------------------------------------------------------
// Execution record types
// ---------------------------------------------------------------------------

/**
 * A single immutable record in the executor's append-only execution log.
 *
 * Every call to `handle()`, `operatorApprove()`, and `operatorReject()` appends
 * at least one `ExecutionRecord`.  Records are never mutated after creation.
 */
export interface ExecutionRecord {
  /** Unique execution record ID (format: `exec-<timestamp>-<counter>`). */
  execution_id: string;
  /** Wall-clock time (ms) when this record was created. */
  executed_at_ms: number;
  /** ISO 8601 timestamp string. */
  executed_at_iso: string;
  /** The `schema.*` event type that triggered this record. */
  event_type: SchemaEventType;
  /**
   * The schema_id extracted from the event payload.
   * May be an empty string if the payload was invalid.
   */
  schema_id: string;
  /** The decision made for this mutation. */
  decision: ExecutionDecision;
  /**
   * Human-readable reason for the decision.
   * Required for `reject` and `defer` outcomes; optional for `apply`.
   */
  reason?: string;
  /**
   * Proposal ID linking this record to the `SchemaMutationProposal` that
   * generated the incoming event.  Enables causal chain reconstruction.
   */
  proposal_id?: string;
  /**
   * For `defer` decisions: the execution_id that was later used to resolve
   * this deferred decision (set when operatorApprove/Reject is called).
   */
  resolved_by?: string;
}

// ---------------------------------------------------------------------------
// Pending decision (deferred mutation awaiting operator approval)
// ---------------------------------------------------------------------------

/**
 * A deferred mutation awaiting operator approval.
 *
 * Created when `handle()` returns `decision: "defer"`.
 * Resolved by `operatorApprove()` or `operatorReject()`.
 */
export interface PendingDecision {
  /** Unique ID of the deferred execution record (matches ExecutionRecord.execution_id). */
  execution_id: string;
  /** The schema event type of the deferred mutation. */
  event_type: SchemaEventType;
  /** The schema_id extracted from the deferred event payload. */
  schema_id: string;
  /**
   * The full, validated event payload preserved for eventual application
   * when the operator approves.
   */
  payload: SchemaEventPayloadMap[SchemaEventType];
  /** Wall-clock time (ms) when the deferred decision was queued. */
  queued_at_ms: number;
  /**
   * Human-readable reason explaining why approval is required.
   * Surfaced in the GUI "Pending Approvals" panel.
   */
  defer_reason: string;
  /** Optional proposal_id for causal chain reconstruction. */
  proposal_id?: string;
}

// ---------------------------------------------------------------------------
// Handle result
// ---------------------------------------------------------------------------

/**
 * Result returned by `MutationExecutor.handle()`.
 *
 * Carries the decision outcome plus whether the registry state changed.
 */
export interface MutationHandleResult {
  /** The execution record created for this handle() call. */
  record: ExecutionRecord;
  /** The decision made. */
  decision: ExecutionDecision;
  /**
   * Whether the in-memory registry state was modified as a direct result of
   * this `handle()` call.  Always false for `reject` and `defer` decisions.
   */
  registry_changed: boolean;
  /**
   * If `decision === "defer"`: the PendingDecision object that was queued.
   */
  pending?: PendingDecision;
}

// ---------------------------------------------------------------------------
// Operator resolution result
// ---------------------------------------------------------------------------

/**
 * Result returned by `operatorApprove()` or `operatorReject()`.
 */
export interface OperatorResolutionResult {
  /** The new execution record appended for this resolution. */
  record: ExecutionRecord;
  /** Whether the registry state was modified (true only for approve). */
  registry_changed: boolean;
  /** Whether the pending decision was found and removed from the queue. */
  resolved: boolean;
}

// ---------------------------------------------------------------------------
// Executor options
// ---------------------------------------------------------------------------

/**
 * Configuration options for the `MutationExecutor`.
 */
export interface MutationExecutorOptions {
  /**
   * If true, `schema.removed` mutations are always auto-applied regardless
   * of whether the schema was previously deprecated.
   *
   * Default: false (removal requires prior deprecation or explicit operator approval)
   */
  allow_undeprecated_removal?: boolean;

  /**
   * If true, `schema.migration_started` mutations are auto-applied without
   * requiring operator approval.
   *
   * Default: false (migration start always requires operator confirmation)
   */
  allow_auto_migration?: boolean;

  /**
   * Maximum number of execution records retained in the rolling log window.
   * Older records are evicted (FIFO) when this limit is exceeded.
   *
   * Default: 2000
   */
  max_execution_log_size?: number;

  /**
   * Maximum number of pending decisions that may be queued at once.
   * If the limit is reached, new deferred mutations are rejected with an
   * error until the queue drains.
   *
   * Default: 100
   */
  max_pending_decisions?: number;
}

// ---------------------------------------------------------------------------
// Internal ID generation
// ---------------------------------------------------------------------------

let _execCounter = 0;

function nextExecutionId(): string {
  return `exec-${Date.now()}-${++_execCounter}`;
}

// ---------------------------------------------------------------------------
// MutationExecutor
// ---------------------------------------------------------------------------

/** Default rolling log size. */
const DEFAULT_MAX_EXEC_LOG = 2000;
/** Default pending decision queue limit. */
const DEFAULT_MAX_PENDING = 100;

/**
 * MutationExecutor — the meta-level schema mutation handler.
 *
 * Receives `schema.*` events, bypasses the infrastructure pipeline, and
 * orchestrates the apply/reject/defer decision flow.
 *
 * Usage:
 * ```ts
 * const executor = new MutationExecutor();
 *
 * // Auto-apply a registration:
 * const result = executor.handle("schema.registered", payload);
 * console.log(result.decision); // "apply"
 *
 * // Deferred removal (no prior deprecation):
 * const result2 = executor.handle("schema.removed", removalPayload);
 * console.log(result2.decision); // "defer"
 *
 * // Operator approves:
 * executor.operatorApprove(result2.pending!.execution_id);
 * ```
 *
 * The executor is intentionally framework-agnostic — it has no dependency on
 * React, Zustand, or any GUI infrastructure.
 */
export class MutationExecutor {
  // ── In-memory registry state ────────────────────────────────────────────
  private readonly _registry = new Map<string, RegistryEntry>();

  // ── Append-only execution log (rolling window) ──────────────────────────
  private readonly _execLog: ExecutionRecord[] = [];

  // ── Pending decisions (awaiting operator approval) ───────────────────────
  private readonly _pending = new Map<string, PendingDecision>();

  // ── Options ─────────────────────────────────────────────────────────────
  private readonly _opts: Required<MutationExecutorOptions>;

  constructor(opts: MutationExecutorOptions = {}) {
    this._opts = {
      allow_undeprecated_removal: opts.allow_undeprecated_removal ?? false,
      allow_auto_migration: opts.allow_auto_migration ?? false,
      max_execution_log_size: opts.max_execution_log_size ?? DEFAULT_MAX_EXEC_LOG,
      max_pending_decisions: opts.max_pending_decisions ?? DEFAULT_MAX_PENDING,
    };
  }

  // ── Public: handle ───────────────────────────────────────────────────────

  /**
   * Handle a single incoming `schema.*` event.
   *
   * This is the primary entry point for the mutation executor.  It:
   *   1. Validates the payload against the expected shape.
   *   2. Runs the decision policy (apply / reject / defer).
   *   3. Updates the in-memory registry if the decision is `apply`.
   *   4. Appends an `ExecutionRecord` to the log.
   *   5. Returns the decision result.
   *
   * Meta-level routing guarantee:
   * This method DOES NOT write command files, POST to /api/commands, or
   * interact with the infrastructure pipeline in any way.
   *
   * @param eventType  The incoming `schema.*` event type.
   * @param payload    The raw (untyped) event payload to validate and process.
   * @param opts       Optional metadata (proposal_id, etc.).
   */
  handle<T extends SchemaEventType>(
    eventType: T,
    payload: unknown,
    opts: { proposal_id?: string } = {},
  ): MutationHandleResult {
    // ── 1. Payload validation ─────────────────────────────────────────────
    if (!isValidSchemaPayload(eventType, payload)) {
      return this._recordAndReturn({
        eventType,
        schema_id: extractSchemaId(payload),
        decision: "reject",
        reason: `Payload validation failed for event type '${eventType}': required fields missing or wrong type`,
        registry_changed: false,
        proposal_id: opts.proposal_id,
      });
    }

    const typedPayload = payload as SchemaEventPayloadMap[T];

    // ── 2. Decision routing ───────────────────────────────────────────────
    switch (eventType) {
      case "schema.registered":
        return this._handleRegistered(
          typedPayload as SchemaRegisteredPayload,
          opts.proposal_id,
        );

      case "schema.updated":
        return this._handleUpdated(
          typedPayload as SchemaUpdatedPayload,
          opts.proposal_id,
        );

      case "schema.deprecated":
        return this._handleDeprecated(
          typedPayload as SchemaDeprecatedPayload,
          opts.proposal_id,
        );

      case "schema.removed":
        return this._handleRemoved(
          typedPayload as SchemaRemovedPayload,
          opts.proposal_id,
        );

      case "schema.validation_started":
        // Tracking event — no registry state change
        return this._recordAndReturn({
          eventType,
          schema_id: "",
          decision: "apply",
          reason: "Validation run boundary event — no registry state change required",
          registry_changed: false,
          proposal_id: opts.proposal_id,
        });

      case "schema.validated":
        // Record keeping — no registry state change
        return this._recordAndReturn({
          eventType,
          schema_id: "",
          decision: "apply",
          reason: "Validation result record — no registry state change required",
          registry_changed: false,
          proposal_id: opts.proposal_id,
        });

      case "schema.migration_started":
        return this._handleMigrationStarted(
          typedPayload as SchemaEventPayloadMap["schema.migration_started"],
          opts.proposal_id,
        );

      case "schema.migrated":
        return this._handleMigrated(
          typedPayload as SchemaMigratedPayload,
          opts.proposal_id,
        );

      default: {
        // Exhaustiveness guard — TypeScript should prevent reaching here
        const _exhaustive: never = eventType as never;
        void _exhaustive;
        return this._recordAndReturn({
          eventType: eventType as SchemaEventType,
          schema_id: "",
          decision: "reject",
          reason: `Unrecognised schema event type: '${eventType as string}'`,
          registry_changed: false,
          proposal_id: opts.proposal_id,
        });
      }
    }
  }

  // ── Public: operator decisions ───────────────────────────────────────────

  /**
   * Operator approves a deferred mutation.
   *
   * Looks up the `PendingDecision` by `execution_id`, applies the stored
   * payload to the registry state, removes the pending decision from the queue,
   * and appends an `ExecutionRecord` documenting the approval.
   *
   * If the execution_id is not found in the pending queue, returns
   * `resolved: false` with no state change.
   *
   * @param execution_id  The execution_id of the deferred decision to approve.
   * @param reason        Optional operator-provided reason for approval.
   */
  operatorApprove(
    execution_id: string,
    reason?: string,
  ): OperatorResolutionResult {
    const pending = this._pending.get(execution_id);
    if (!pending) {
      const record = this._appendRecord({
        event_type: "schema.removed" as SchemaEventType, // placeholder
        schema_id: execution_id,
        decision: "reject",
        reason: `operatorApprove: no pending decision found for execution_id '${execution_id}'`,
        proposal_id: undefined,
      });
      return { record, registry_changed: false, resolved: false };
    }

    // Apply the deferred mutation
    const applyResult = this._applyToRegistry(
      pending.event_type,
      pending.payload,
      Date.now(),
    );

    // Mark the original deferred record as resolved
    const deferredRecord = this._execLog.find(
      (r) => r.execution_id === execution_id,
    );
    if (deferredRecord) {
      // Note: we cannot mutate the record, so we create a resolution record
      // that references the original via resolved_by / reason
    }

    // Append approval record
    const approvalRecord = this._appendRecord({
      event_type: pending.event_type,
      schema_id: pending.schema_id,
      decision: "apply",
      reason:
        reason ??
        `Operator approved deferred '${pending.event_type}' for '${pending.schema_id}'`,
      proposal_id: pending.proposal_id,
      resolved_by: execution_id,
    });

    // Remove from pending queue
    this._pending.delete(execution_id);

    return {
      record: approvalRecord,
      registry_changed: applyResult.changed,
      resolved: true,
    };
  }

  /**
   * Operator rejects a deferred mutation.
   *
   * Removes the `PendingDecision` from the queue without modifying the
   * registry state, and appends a rejection `ExecutionRecord`.
   *
   * If the execution_id is not found in the pending queue, returns
   * `resolved: false` with no state change.
   *
   * @param execution_id  The execution_id of the deferred decision to reject.
   * @param reason        Required reason for rejection (audit transparency).
   */
  operatorReject(
    execution_id: string,
    reason: string,
  ): OperatorResolutionResult {
    const pending = this._pending.get(execution_id);
    if (!pending) {
      const record = this._appendRecord({
        event_type: "schema.removed" as SchemaEventType, // placeholder
        schema_id: execution_id,
        decision: "reject",
        reason: `operatorReject: no pending decision found for execution_id '${execution_id}'`,
        proposal_id: undefined,
      });
      return { record, registry_changed: false, resolved: false };
    }

    // Append rejection record
    const rejectionRecord = this._appendRecord({
      event_type: pending.event_type,
      schema_id: pending.schema_id,
      decision: "reject",
      reason,
      proposal_id: pending.proposal_id,
      resolved_by: execution_id,
    });

    // Remove from pending queue
    this._pending.delete(execution_id);

    return {
      record: rejectionRecord,
      registry_changed: false,
      resolved: true,
    };
  }

  // ── Public: registry accessors ───────────────────────────────────────────

  /**
   * Return a read-only snapshot of the current registry state.
   * The returned array is a copy — future mutations do not affect it.
   */
  getRegistry(): readonly RegistryEntry[] {
    return [...this._registry.values()];
  }

  /**
   * Look up a single registry entry by schema_id.
   * Returns `undefined` if the schema_id is not in the registry.
   */
  getEntry(schema_id: string): RegistryEntry | undefined {
    return this._registry.get(schema_id);
  }

  /**
   * Return all registry entries with a given status.
   */
  getEntriesByStatus(status: RegistryEntryStatus): readonly RegistryEntry[] {
    return [...this._registry.values()].filter((e) => e.status === status);
  }

  /**
   * Total number of entries in the registry (all statuses).
   */
  get registrySize(): number {
    return this._registry.size;
  }

  // ── Public: execution log accessors ─────────────────────────────────────

  /**
   * Return a read-only snapshot of the execution log.
   * The returned array is a copy (append-only semantics preserved).
   */
  getExecutionLog(): readonly ExecutionRecord[] {
    return [...this._execLog];
  }

  /**
   * Return the most recent execution records (up to `n`), newest first.
   */
  getRecentExecutions(n = 50): readonly ExecutionRecord[] {
    return [...this._execLog].reverse().slice(0, n);
  }

  /**
   * Return execution records filtered by decision outcome.
   */
  getExecutionsByDecision(decision: ExecutionDecision): readonly ExecutionRecord[] {
    return this._execLog.filter((r) => r.decision === decision);
  }

  /**
   * Return execution records for a specific schema_id.
   */
  getExecutionsForSchema(schema_id: string): readonly ExecutionRecord[] {
    return this._execLog.filter((r) => r.schema_id === schema_id);
  }

  /**
   * Total number of execution records (monotonic; survives rolling eviction).
   */
  get totalExecuted(): number {
    return _execCounter;
  }

  /**
   * Current execution log size.
   */
  get executionLogSize(): number {
    return this._execLog.length;
  }

  // ── Public: pending decisions accessors ──────────────────────────────────

  /**
   * Return all currently pending decisions awaiting operator approval.
   */
  getPendingDecisions(): readonly PendingDecision[] {
    return [...this._pending.values()];
  }

  /**
   * Return a specific pending decision by execution_id.
   * Returns `undefined` if not found.
   */
  getPendingDecision(execution_id: string): PendingDecision | undefined {
    return this._pending.get(execution_id);
  }

  /**
   * Number of currently pending decisions.
   */
  get pendingCount(): number {
    return this._pending.size;
  }

  // ── Private: decision handlers ───────────────────────────────────────────

  /** Handle schema.registered — always auto-apply. */
  private _handleRegistered(
    payload: SchemaRegisteredPayload,
    proposal_id?: string,
  ): MutationHandleResult {
    const now = Date.now();

    // If already registered, this is a no-op (idempotent registration)
    const existing = this._registry.get(payload.schema_id);
    if (existing && existing.status === "active") {
      return this._recordAndReturn({
        eventType: "schema.registered",
        schema_id: payload.schema_id,
        decision: "apply",
        reason: `schema_id '${payload.schema_id}' already registered (idempotent)`,
        registry_changed: false,
        proposal_id,
      });
    }

    // Apply to registry
    this._registry.set(payload.schema_id, {
      schema_id: payload.schema_id,
      namespace: payload.namespace,
      name: payload.name,
      version: payload.version,
      status: "active",
      registered_at_ms: payload.registered_at_ms ?? now,
      last_updated_at_ms: payload.registered_at_ms ?? now,
    });

    return this._recordAndReturn({
      eventType: "schema.registered",
      schema_id: payload.schema_id,
      decision: "apply",
      registry_changed: true,
      proposal_id,
    });
  }

  /** Handle schema.updated — auto-apply with registry update. */
  private _handleUpdated(
    payload: SchemaUpdatedPayload,
    proposal_id?: string,
  ): MutationHandleResult {
    const now = Date.now();
    const existing = this._registry.get(payload.schema_id);

    if (!existing) {
      // Cannot update an unknown schema — reject
      return this._recordAndReturn({
        eventType: "schema.updated",
        schema_id: payload.schema_id,
        decision: "reject",
        reason: `Cannot apply schema.updated: schema_id '${payload.schema_id}' is not in the registry`,
        registry_changed: false,
        proposal_id,
      });
    }

    if (existing.status === "removed") {
      return this._recordAndReturn({
        eventType: "schema.updated",
        schema_id: payload.schema_id,
        decision: "reject",
        reason: `Cannot apply schema.updated: schema_id '${payload.schema_id}' has status 'removed'`,
        registry_changed: false,
        proposal_id,
      });
    }

    // Apply version bump and description update
    this._registry.set(payload.schema_id, {
      ...existing,
      version: payload.next_version,
      last_updated_at_ms: payload.updated_at_ms ?? now,
    });

    return this._recordAndReturn({
      eventType: "schema.updated",
      schema_id: payload.schema_id,
      decision: "apply",
      registry_changed: true,
      proposal_id,
    });
  }

  /** Handle schema.deprecated — auto-apply (informational, non-breaking). */
  private _handleDeprecated(
    payload: SchemaDeprecatedPayload,
    proposal_id?: string,
  ): MutationHandleResult {
    const now = Date.now();
    const existing = this._registry.get(payload.schema_id);

    if (!existing) {
      return this._recordAndReturn({
        eventType: "schema.deprecated",
        schema_id: payload.schema_id,
        decision: "reject",
        reason: `Cannot apply schema.deprecated: schema_id '${payload.schema_id}' is not in the registry`,
        registry_changed: false,
        proposal_id,
      });
    }

    if (existing.status === "removed") {
      return this._recordAndReturn({
        eventType: "schema.deprecated",
        schema_id: payload.schema_id,
        decision: "reject",
        reason: `Cannot apply schema.deprecated: schema_id '${payload.schema_id}' has already been removed`,
        registry_changed: false,
        proposal_id,
      });
    }

    if (existing.status === "deprecated") {
      // Idempotent — already deprecated
      return this._recordAndReturn({
        eventType: "schema.deprecated",
        schema_id: payload.schema_id,
        decision: "apply",
        reason: `schema_id '${payload.schema_id}' is already deprecated (idempotent)`,
        registry_changed: false,
        proposal_id,
      });
    }

    // Apply deprecation
    this._registry.set(payload.schema_id, {
      ...existing,
      status: "deprecated",
      last_updated_at_ms: payload.deprecated_at_ms ?? now,
      deprecated_at_ms: payload.deprecated_at_ms ?? now,
      deprecation_reason: payload.deprecation_reason,
      replacement_schema_id: payload.replacement_schema_id,
    });

    return this._recordAndReturn({
      eventType: "schema.deprecated",
      schema_id: payload.schema_id,
      decision: "apply",
      registry_changed: true,
      proposal_id,
    });
  }

  /**
   * Handle schema.removed — apply if already deprecated; defer otherwise.
   *
   * This enforces the migration-safety invariant:
   *   "A schema may only be removed after it has been deprecated, unless the
   *    operator explicitly approves the removal."
   */
  private _handleRemoved(
    payload: SchemaRemovedPayload,
    proposal_id?: string,
  ): MutationHandleResult {
    const now = Date.now();
    const existing = this._registry.get(payload.schema_id);

    // If not in registry: reject (cannot remove unknown schema)
    if (!existing) {
      return this._recordAndReturn({
        eventType: "schema.removed",
        schema_id: payload.schema_id,
        decision: "reject",
        reason: `Cannot apply schema.removed: schema_id '${payload.schema_id}' is not in the registry`,
        registry_changed: false,
        proposal_id,
      });
    }

    if (existing.status === "removed") {
      // Already removed — idempotent
      return this._recordAndReturn({
        eventType: "schema.removed",
        schema_id: payload.schema_id,
        decision: "apply",
        reason: `schema_id '${payload.schema_id}' is already removed (idempotent)`,
        registry_changed: false,
        proposal_id,
      });
    }

    // Check pending queue capacity
    if (this._pending.size >= this._opts.max_pending_decisions) {
      return this._recordAndReturn({
        eventType: "schema.removed",
        schema_id: payload.schema_id,
        decision: "reject",
        reason: `Pending decision queue at capacity (${this._opts.max_pending_decisions}). Drain the queue before submitting new removals.`,
        registry_changed: false,
        proposal_id,
      });
    }

    // If already deprecated OR allow_undeprecated_removal is enabled → auto-apply
    if (existing.status === "deprecated" || this._opts.allow_undeprecated_removal) {
      this._registry.set(payload.schema_id, {
        ...existing,
        status: "removed",
        last_updated_at_ms: payload.removed_at_ms ?? now,
        removed_at_ms: payload.removed_at_ms ?? now,
      });

      return this._recordAndReturn({
        eventType: "schema.removed",
        schema_id: payload.schema_id,
        decision: "apply",
        reason:
          existing.status === "deprecated"
            ? `Removal of deprecated schema '${payload.schema_id}' applied automatically`
            : `Removal of active schema '${payload.schema_id}' applied (allow_undeprecated_removal=true)`,
        registry_changed: true,
        proposal_id,
      });
    }

    // Otherwise: defer — requires operator approval
    return this._deferDecision({
      eventType: "schema.removed",
      schema_id: payload.schema_id,
      payload,
      defer_reason:
        `schema.removed for '${payload.schema_id}' requires operator approval: ` +
        `schema has not been deprecated. Pass allow_undeprecated_removal=true ` +
        `or call operatorApprove() to confirm this removal.`,
      proposal_id,
    });
  }

  /** Handle schema.migration_started — defer unless auto-migration is enabled. */
  private _handleMigrationStarted(
    payload: SchemaEventPayloadMap["schema.migration_started"],
    proposal_id?: string,
  ): MutationHandleResult {
    if (this._opts.allow_auto_migration) {
      // Auto-apply tracking event
      return this._recordAndReturn({
        eventType: "schema.migration_started",
        schema_id: "",
        decision: "apply",
        reason: "Migration run boundary event — auto-migration enabled",
        registry_changed: false,
        proposal_id,
      });
    }

    // Check pending queue capacity
    if (this._pending.size >= this._opts.max_pending_decisions) {
      return this._recordAndReturn({
        eventType: "schema.migration_started",
        schema_id: "",
        decision: "reject",
        reason: `Pending decision queue at capacity (${this._opts.max_pending_decisions}). Drain the queue before submitting new migrations.`,
        registry_changed: false,
        proposal_id,
      });
    }

    return this._deferDecision({
      eventType: "schema.migration_started",
      schema_id: `migration:${payload.migration_run_id}`,
      payload,
      defer_reason:
        `schema.migration_started requires operator approval before migration begins ` +
        `(from_version: '${payload.from_version}', to_version: '${payload.to_version}', ` +
        `dry_run: ${String(payload.dry_run)}). Call operatorApprove() to confirm.`,
      proposal_id,
    });
  }

  /** Handle schema.migrated — auto-apply (record-keeping after migration). */
  private _handleMigrated(
    payload: SchemaMigratedPayload,
    proposal_id?: string,
  ): MutationHandleResult {
    // Update registry entries whose versions were migrated
    const now = Date.now();
    let changed = false;

    for (const migratedType of payload.migrated_event_types) {
      const schema_id = migratedType.includes(":")
        ? migratedType
        : `event_type:${migratedType}`;
      const existing = this._registry.get(schema_id);
      if (existing) {
        this._registry.set(schema_id, {
          ...existing,
          last_updated_at_ms: payload.migrated_at_ms ?? now,
        });
        changed = true;
      }
    }

    return this._recordAndReturn({
      eventType: "schema.migrated",
      schema_id: `migration:${payload.migration_run_id}`,
      decision: "apply",
      reason: `Migration run '${payload.migration_run_id}' completed: ${payload.events_migrated} events migrated`,
      registry_changed: changed,
      proposal_id,
    });
  }

  // ── Private: helpers ─────────────────────────────────────────────────────

  /**
   * Create, append, and return a MutationHandleResult for a resolved decision.
   */
  private _recordAndReturn(params: {
    eventType: SchemaEventType;
    schema_id: string;
    decision: ExecutionDecision;
    reason?: string;
    registry_changed: boolean;
    proposal_id?: string;
  }): MutationHandleResult {
    const record = this._appendRecord({
      event_type: params.eventType,
      schema_id: params.schema_id,
      decision: params.decision,
      reason: params.reason,
      proposal_id: params.proposal_id,
    });

    return {
      record,
      decision: params.decision,
      registry_changed: params.registry_changed,
    };
  }

  /**
   * Defer a decision to the pending queue and return a defer result.
   */
  private _deferDecision(params: {
    eventType: SchemaEventType;
    schema_id: string;
    payload: SchemaEventPayloadMap[SchemaEventType];
    defer_reason: string;
    proposal_id?: string;
  }): MutationHandleResult {
    const record = this._appendRecord({
      event_type: params.eventType,
      schema_id: params.schema_id,
      decision: "defer",
      reason: params.defer_reason,
      proposal_id: params.proposal_id,
    });

    const pending: PendingDecision = {
      execution_id: record.execution_id,
      event_type: params.eventType,
      schema_id: params.schema_id,
      payload: params.payload,
      queued_at_ms: record.executed_at_ms,
      defer_reason: params.defer_reason,
      proposal_id: params.proposal_id,
    };

    this._pending.set(record.execution_id, pending);

    return {
      record,
      decision: "defer",
      registry_changed: false,
      pending,
    };
  }

  /**
   * Apply a validated payload to the registry (used by operatorApprove).
   * Returns whether the registry state changed.
   */
  private _applyToRegistry(
    eventType: SchemaEventType,
    payload: SchemaEventPayloadMap[SchemaEventType],
    now: number,
  ): { changed: boolean } {
    switch (eventType) {
      case "schema.removed": {
        const p = payload as SchemaRemovedPayload;
        const existing = this._registry.get(p.schema_id);
        if (!existing || existing.status === "removed") return { changed: false };
        this._registry.set(p.schema_id, {
          ...existing,
          status: "removed",
          last_updated_at_ms: p.removed_at_ms ?? now,
          removed_at_ms: p.removed_at_ms ?? now,
        });
        return { changed: true };
      }
      case "schema.migration_started":
        // No registry state change for migration start
        return { changed: false };
      default:
        return { changed: false };
    }
  }

  /**
   * Append an `ExecutionRecord` to the rolling execution log.
   * Returns the created record.
   */
  private _appendRecord(params: {
    event_type: SchemaEventType;
    schema_id: string;
    decision: ExecutionDecision;
    reason?: string;
    proposal_id?: string;
    resolved_by?: string;
  }): ExecutionRecord {
    const now = Date.now();
    const record: ExecutionRecord = Object.freeze({
      execution_id: nextExecutionId(),
      executed_at_ms: now,
      executed_at_iso: new Date(now).toISOString(),
      event_type: params.event_type,
      schema_id: params.schema_id,
      decision: params.decision,
      reason: params.reason,
      proposal_id: params.proposal_id,
      resolved_by: params.resolved_by,
    });

    this._execLog.push(record);

    // Rolling eviction
    if (this._execLog.length > this._opts.max_execution_log_size) {
      this._execLog.shift();
    }

    return record;
  }
}

// ---------------------------------------------------------------------------
// Application-scoped singleton
// ---------------------------------------------------------------------------

/**
 * Application-scoped `MutationExecutor` singleton.
 *
 * Use this singleton for production usage.  Tests should create their own
 * instances with `new MutationExecutor()` to avoid shared state pollution.
 *
 * ```ts
 * import { mutationExecutor } from "./mutation-executor.js";
 * const result = mutationExecutor.handle("schema.registered", payload);
 * ```
 */
export const mutationExecutor = new MutationExecutor();

// ---------------------------------------------------------------------------
// React hook wrapper
// ---------------------------------------------------------------------------

/**
 * Returns the application-scoped `MutationExecutor` singleton.
 *
 * This is a thin wrapper — the executor is a singleton, so calling this hook
 * multiple times returns the same instance.
 *
 * @example
 * ```tsx
 * function MetaRegistryPanel() {
 *   const executor = useMutationExecutor();
 *   const registry = executor.getRegistry();
 *   // ...
 * }
 * ```
 */
export function useMutationExecutor(): MutationExecutor {
  return mutationExecutor;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/**
 * Attempt to extract a `schema_id` from an unknown payload value.
 * Returns an empty string if the payload has no `schema_id` field.
 *
 * Used to populate the `schema_id` in rejection records even when payload
 * validation fails.
 */
function extractSchemaId(payload: unknown): string {
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
