/**
 * @module meta-event-bus
 * Sub-AC 11a — Meta-level event emission channel.
 *
 * The MetaEventBus is the ONLY authorised mechanism for emitting `schema.*`
 * mutation proposal events from the 3D command-center GUI.
 *
 * Meta-level routing guarantee
 * ----------------------------
 * Schema mutation proposals MUST NOT be routed through the infrastructure
 * pipeline (i.e. NOT through the command-file ingestion path):
 *
 *   ✗ WRONG:  GUI writes CommandFile → /api/commands → Orchestrator → EventLog
 *   ✓ CORRECT: GUI calls MetaEventBus.emit() → /api/meta/events → EventLog
 *
 * This separation enforces the ontology stratification constraint:
 *   "Cross-level references are permitted only through defined projection
 *    patterns (meta_mutation: meta↔infrastructure)"
 *
 * The meta endpoint validates that only `schema.*` (and other meta-level)
 * event types can be posted via this channel.  Attempting to post a domain
 * or infrastructure event type to `/api/meta/events` will be rejected with
 * HTTP 422.
 *
 * Event log integration
 * ---------------------
 * The meta endpoint writes the ConitensEvent directly to the event log
 * without command-file parsing, command-to-event mapping, or inbox polling.
 * The SchemaReducer then processes the appended events to update
 * `views/SCHEMA.md` and `runtime/schema/*.json`.
 *
 * Local log
 * ---------
 * Every emitted event is also appended to an in-memory `localLog` (append-only,
 * rolling window) for GUI display and 3D replay without requiring a server
 * round-trip.  This log is separate from the orchestrator EventLog.
 *
 * Record transparency
 * -------------------
 * Every meta event carries:
 *   - `meta_level: true`    — explicit routing tag (rejected by /api/commands)
 *   - `proposal_id`         — links to the SchemaMutationProposal that caused it
 *   - `causation_id`        — optional causal chain link to a triggering event
 *
 * Design: this module is framework-agnostic (no React hooks) so it can be
 * used from workers, scripts, and tests alike.  React consumers should wrap
 * it in `useMetaEventBus` (exported below).
 */

import { SCHEMA_VERSION } from "@conitens/protocol";
import type {
  SchemaEventType,
  SchemaRegisteredPayload,
  SchemaUpdatedPayload,
  SchemaDeprecatedPayload,
  SchemaRemovedPayload,
  SchemaValidatedPayload,
  SchemaMigratedPayload,
  SchemaValidationStartedPayload,
  SchemaMigrationStartedPayload,
  SchemaEventPayloadMap,
} from "@conitens/protocol";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Meta events HTTP endpoint.
 *
 * This is a SEPARATE endpoint from the command-file ingestion endpoint
 * (`/api/commands`).  The meta endpoint:
 *   1. Accepts `ConitensEvent` envelopes directly (not CommandFiles).
 *   2. Only accepts events with `meta_level: true`.
 *   3. Only accepts `schema.*` (and other meta-level) event types.
 *   4. Writes directly to the event log, bypassing the command inbox pipeline.
 *
 * Falls back to the default orchestrator port if the env var is not set.
 */
const META_API_BASE: string =
  (typeof import.meta !== "undefined" &&
    (import.meta.env as Record<string, unknown>)?.VITE_META_API_URL) as string ||
  "http://localhost:8080";

export const META_EVENTS_ENDPOINT = `${META_API_BASE}/api/meta/events`;

/** Maximum number of events retained in the local log (rolling window). */
export const META_LOG_MAX_ENTRIES = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A meta event entry in the local log.
 *
 * Carries the full emitted payload plus transport-level metadata.
 * Entries are NEVER mutated after append.
 */
export interface MetaLogEntry {
  /** Unique log entry ID generated locally (not the server event_id). */
  id: string;
  /** Wall-clock time (ms) when the event was emitted. */
  emitted_at_ms: number;
  /** ISO 8601 timestamp string. */
  emitted_at_iso: string;
  /** The schema event type. */
  event_type: SchemaEventType;
  /** The typed payload for this event. */
  payload: SchemaEventPayloadMap[SchemaEventType];
  /**
   * Proposal ID linking this event to the SchemaMutationProposal that
   * generated it.  Enables causal chain reconstruction in the GUI.
   */
  proposal_id?: string;
  /** Optional causation_id linking to the upstream event that triggered this. */
  causation_id?: string;
  /** Transport outcome after the emit() call resolves. */
  transport_status: "pending" | "delivered" | "failed" | "local_only";
  /** HTTP status code returned by the meta endpoint (if delivered). */
  http_status?: number;
  /** Error message if transport_status === "failed". */
  transport_error?: string;
}

/** Options for a single `emit()` call. */
export interface MetaEmitOptions {
  /**
   * Proposal ID to associate this event with.
   * Links the event to the `SchemaMutationProposal` that generated it.
   */
  proposal_id?: string;
  /**
   * Causation event ID for audit chain reconstruction.
   * Enables: upstream_event → mutation_proposal → schema.* event
   */
  causation_id?: string;
  /**
   * If true, the event is appended to the local log but NOT sent to the
   * server.  Useful for dry-run proposals and test environments.
   */
  local_only?: boolean;
  /**
   * Run ID to include in the emitted event envelope.
   * Defaults to "meta-session".
   */
  run_id?: string;
}

/** Result of a single `emit()` call. */
export interface MetaEmitResult {
  /** The log entry created for this emission. */
  entry: MetaLogEntry;
  /** Whether the event was successfully delivered to the meta endpoint. */
  delivered: boolean;
  /** Error message if delivery failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// ID generation (no external deps)
// ---------------------------------------------------------------------------

let _logCounter = 0;

function nextLogId(): string {
  return `meta-${Date.now()}-${++_logCounter}`;
}

// ---------------------------------------------------------------------------
// MetaEventBus class
// ---------------------------------------------------------------------------

/**
 * MetaEventBus — singleton-style class for meta-level event emission.
 *
 * Usage:
 * ```ts
 * const bus = new MetaEventBus();
 * await bus.emit("schema.registered", payload, { proposal_id: "..." });
 * const log = bus.getLog();
 * ```
 *
 * The bus maintains an in-memory log of all emitted events.  The log is
 * append-only and subject to rolling eviction after META_LOG_MAX_ENTRIES.
 *
 * React consumers: use `useMetaEventBus()` which wraps an application-scoped
 * singleton instance.
 */
export class MetaEventBus {
  private readonly _log: MetaLogEntry[] = [];

  // ── Emit ──────────────────────────────────────────────────────────────────

  /**
   * Emit a typed `schema.*` event at the meta level.
   *
   * The event is:
   *   1. Appended to the local log immediately (write-only).
   *   2. POSTed to `META_EVENTS_ENDPOINT` (unless `local_only` is set).
   *   3. The log entry is updated with the transport outcome.
   *
   * This method does NOT route through the command-file ingestion pipeline.
   *
   * @param type    The schema event type (e.g. "schema.registered").
   * @param payload The typed payload for the event type.
   * @param opts    Optional emission metadata.
   */
  async emit<T extends SchemaEventType>(
    type: T,
    payload: SchemaEventPayloadMap[T],
    opts: MetaEmitOptions = {},
  ): Promise<MetaEmitResult> {
    const now = Date.now();
    const entry: MetaLogEntry = {
      id: nextLogId(),
      emitted_at_ms: now,
      emitted_at_iso: new Date(now).toISOString(),
      event_type: type,
      payload: payload as SchemaEventPayloadMap[SchemaEventType],
      proposal_id: opts.proposal_id,
      causation_id: opts.causation_id,
      transport_status: "pending",
    };

    // Append to local log immediately (write-only, never mutated after this)
    this._appendToLog(entry);

    // ── Local-only mode (dry run / test) ──────────────────────────────────
    if (opts.local_only) {
      entry.transport_status = "local_only";
      return { entry, delivered: false };
    }

    // ── POST to meta endpoint ─────────────────────────────────────────────
    try {
      const envelope = buildMetaEventEnvelope(type, payload, opts);
      const response = await fetch(META_EVENTS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Explicit routing tag so server can validate meta-level path
          "X-Conitens-Meta": "true",
        },
        body: JSON.stringify(envelope),
      });

      entry.http_status = response.status;

      if (!response.ok) {
        const text = await response.text().catch(() => "(no body)");
        throw new Error(
          `Meta endpoint returned HTTP ${response.status}: ${text}`,
        );
      }

      entry.transport_status = "delivered";
      return { entry, delivered: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.transport_status = "failed";
      entry.transport_error = msg;
      return { entry, delivered: false, error: msg };
    }
  }

  // ── Convenience typed emitters ────────────────────────────────────────────

  /** Emit a `schema.registered` event. */
  emitRegistered(
    payload: SchemaRegisteredPayload,
    opts?: MetaEmitOptions,
  ): Promise<MetaEmitResult> {
    return this.emit("schema.registered", payload, opts);
  }

  /** Emit a `schema.updated` event. */
  emitUpdated(
    payload: SchemaUpdatedPayload,
    opts?: MetaEmitOptions,
  ): Promise<MetaEmitResult> {
    return this.emit("schema.updated", payload, opts);
  }

  /** Emit a `schema.deprecated` event. */
  emitDeprecated(
    payload: SchemaDeprecatedPayload,
    opts?: MetaEmitOptions,
  ): Promise<MetaEmitResult> {
    return this.emit("schema.deprecated", payload, opts);
  }

  /** Emit a `schema.removed` event. */
  emitRemoved(
    payload: SchemaRemovedPayload,
    opts?: MetaEmitOptions,
  ): Promise<MetaEmitResult> {
    return this.emit("schema.removed", payload, opts);
  }

  /** Emit a `schema.validated` event. */
  emitValidated(
    payload: SchemaValidatedPayload,
    opts?: MetaEmitOptions,
  ): Promise<MetaEmitResult> {
    return this.emit("schema.validated", payload, opts);
  }

  /** Emit a `schema.migrated` event. */
  emitMigrated(
    payload: SchemaMigratedPayload,
    opts?: MetaEmitOptions,
  ): Promise<MetaEmitResult> {
    return this.emit("schema.migrated", payload, opts);
  }

  /** Emit a `schema.validation_started` event. */
  emitValidationStarted(
    payload: SchemaValidationStartedPayload,
    opts?: MetaEmitOptions,
  ): Promise<MetaEmitResult> {
    return this.emit("schema.validation_started", payload, opts);
  }

  /** Emit a `schema.migration_started` event. */
  emitMigrationStarted(
    payload: SchemaMigrationStartedPayload,
    opts?: MetaEmitOptions,
  ): Promise<MetaEmitResult> {
    return this.emit("schema.migration_started", payload, opts);
  }

  // ── Log accessors ─────────────────────────────────────────────────────────

  /**
   * Return a read-only copy of the local meta event log.
   * The returned array is a snapshot — future appends will not affect it.
   */
  getLog(): readonly MetaLogEntry[] {
    return [...this._log];
  }

  /**
   * Return log entries for a specific schema event type.
   */
  getLogByType(type: SchemaEventType): readonly MetaLogEntry[] {
    return this._log.filter((e) => e.event_type === type);
  }

  /**
   * Return log entries associated with a specific proposal_id.
   */
  getLogByProposal(proposal_id: string): readonly MetaLogEntry[] {
    return this._log.filter((e) => e.proposal_id === proposal_id);
  }

  /**
   * Return the most recent log entries (up to `n`), newest first.
   */
  getRecentLog(n = 50): readonly MetaLogEntry[] {
    return [...this._log].reverse().slice(0, n);
  }

  /**
   * Total count of emitted events (monotonic; survives rolling eviction).
   */
  get totalEmitted(): number {
    return _logCounter;
  }

  /**
   * Count of events currently in the rolling log.
   */
  get logSize(): number {
    return this._log.length;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Append an entry to the rolling log with eviction. */
  private _appendToLog(entry: MetaLogEntry): void {
    this._log.push(entry);
    if (this._log.length > META_LOG_MAX_ENTRIES) {
      this._log.shift(); // Evict oldest
    }
  }
}

// ---------------------------------------------------------------------------
// Meta event envelope builder
// ---------------------------------------------------------------------------

/**
 * Builds the raw event envelope to POST to the meta endpoint.
 *
 * The envelope is a near-ConitensEvent shape with an additional `meta_level`
 * flag.  The server generates the canonical `event_id` and `ts` fields;
 * the client provides the type, payload, and causal metadata.
 *
 * The `meta_level: true` flag is an explicit routing guard:
 *   - The `/api/meta/events` endpoint REQUIRES this flag.
 *   - The `/api/commands` endpoint REJECTS events with this flag.
 *
 * This enforces the stratification constraint at the HTTP layer.
 */
function buildMetaEventEnvelope(
  type: SchemaEventType,
  payload: SchemaEventPayloadMap[SchemaEventType],
  opts: MetaEmitOptions,
): MetaEventEnvelope {
  return {
    schema: SCHEMA_VERSION,
    type,
    payload: payload as unknown as Record<string, unknown>,
    run_id: opts.run_id ?? "meta-session",
    causation_id: opts.causation_id,
    actor: {
      kind: "system",
      id: "meta-event-bus",
    },
    /**
     * Explicit meta-level routing tag.
     * Rejected by /api/commands; required by /api/meta/events.
     * This enforces: meta events MUST NOT go through the infrastructure pipeline.
     */
    meta_level: true,
    proposal_id: opts.proposal_id,
  };
}

/**
 * The JSON shape posted to `POST /api/meta/events`.
 *
 * The server fills in `event_id` and `ts` before appending to the event log.
 * The `meta_level` flag is stripped by the server before storing (it's a
 * routing directive, not a stored field).
 */
export interface MetaEventEnvelope {
  schema: string;
  type: SchemaEventType;
  payload: Record<string, unknown>;
  run_id: string;
  causation_id?: string;
  actor: { kind: string; id: string };
  /** Explicit routing tag — required by /api/meta/events, rejected by /api/commands. */
  meta_level: true;
  proposal_id?: string;
}

// ---------------------------------------------------------------------------
// Application-scoped singleton
// ---------------------------------------------------------------------------

/**
 * Application-scoped MetaEventBus singleton.
 *
 * Import this directly for non-React usage:
 * ```ts
 * import { metaEventBus } from "./meta-event-bus.js";
 * await metaEventBus.emit("schema.registered", payload);
 * ```
 *
 * React components should use `useMetaEventBus()` which returns this instance.
 */
export const metaEventBus = new MetaEventBus();

// ---------------------------------------------------------------------------
// React hook wrapper
// ---------------------------------------------------------------------------

/**
 * Returns the application-scoped MetaEventBus instance.
 *
 * This is intentionally a thin wrapper — the bus is a singleton, so calling
 * this hook multiple times returns the same instance.  React components that
 * need to display the meta event log should use a Zustand subscription to
 * avoid polling.
 *
 * @example
 * ```tsx
 * function SchemaEvolutionPanel() {
 *   const bus = useMetaEventBus();
 *   const [log, setLog] = useState(bus.getLog());
 *
 *   const propose = useCallback(() => {
 *     bus.emitRegistered({
 *       schema_id: "event_type:task.new_type",
 *       namespace: "event_type",
 *       name: "task.new_type",
 *       version: "1.0.0",
 *       registered_by: "operator",
 *     });
 *   }, [bus]);
 * }
 * ```
 */
export function useMetaEventBus(): MetaEventBus {
  return metaEventBus;
}
