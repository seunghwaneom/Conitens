/**
 * @module self-improvement-loop
 * Sub-AC 11d — Error handling and cycle orchestration.
 *
 * Wires the reader → validator → executor into a graceful self-improvement
 * loop that catches ALL errors at every stage and NEVER exits with code 1.
 *
 * ─── Pipeline ────────────────────────────────────────────────────────────────
 *
 *   readOntologySchema()         [reader]
 *     ↓
 *   proposeMutations()           [proposer]
 *     ↓  (per mutation)
 *   migrationCheckValidator.check()  [validator]
 *     ↓  (accepted mutations only)
 *   recorder.handleAndRecord()   [executor + event log recorder]
 *     ↓
 *   update previousSnapshot      [checkpoint]
 *     ↓
 *   sleep(interval_ms)
 *     ↓
 *   repeat
 *
 * ─── Error isolation ─────────────────────────────────────────────────────────
 *
 * Every pipeline stage is wrapped in a try/catch boundary:
 *
 *   Reader failure  → cycle skipped; previousSnapshot unchanged
 *   Proposer failure → cycle skipped; previousSnapshot unchanged
 *   Validator failure (per-mutation) → mutation skipped; cycle continues
 *   Executor failure (per-mutation)  → error recorded; cycle continues
 *   EventLog write failure           → surfaced via HandleAndRecordResult; cycle continues
 *   Timer/loop-level failure         → caught; loop restarts after backoff
 *
 * The loop itself never propagates exceptions to the caller.  All errors are
 * captured in the `CycleRecord.errors` array and surfaced via `getStatus()`.
 *
 * ─── Graceful shutdown ────────────────────────────────────────────────────────
 *
 * `stop()` signals the loop to exit after the current cycle completes.
 * It returns a Promise that resolves when the loop is fully stopped.
 * Pending timer handles are cleared immediately on `stop()`.
 *
 * ─── Record transparency ─────────────────────────────────────────────────────
 *
 * Every cycle produces a `CycleRecord` describing:
 *   - snapshot captured (snapshot_id)
 *   - mutations proposed, validated, applied, rejected, deferred, skipped
 *   - per-mutation outcomes (MutationOutcome[])
 *   - all errors encountered during the cycle (CycleError[])
 *   - cycle timing (started_at_ms, completed_at_ms, duration_ms)
 *
 * CycleRecords are kept in an append-only rolling log (max 100 entries).
 * They are also written to the EventLog via the recorder when possible.
 *
 * ─── Meta-level routing guarantee ────────────────────────────────────────────
 *
 * All events emitted by this loop travel through the meta pipeline ONLY:
 *   MutationEventLogRecorder → EventLog.append()
 * The command-file ingestion pipeline is NOT involved.
 */

import type { SchemaEventType } from "@conitens/protocol";
import { readOntologySchema } from "./ontology-schema-reader.js";
import type { OntologySnapshot } from "./ontology-schema-reader.js";
import {
  proposeMutations,
  validateProposalStability,
  type SchemaMutationProposal,
  type SchemaMutation,
  type ProposeMutationsOptions,
  type StabilityCheckResult,
} from "./schema-mutation-proposer.js";
import {
  MigrationCheckValidator,
  migrationCheckValidator as defaultValidator,
  type MigrationCheckResult,
  type MigrationCheckDecision,
  type RegistryEntryView,
} from "./migration-check-validator.js";
import {
  MutationEventLogRecorder,
  mutationEventLogRecorder as defaultRecorder,
  type HandleAndRecordResult,
  type RecordOptions,
} from "./mutation-event-log-recorder.js";
import {
  VerificationContractSyncer,
  verificationContractSyncer as defaultSyncer,
  type VerificationContract,
} from "./verification-contract-sync.js";

// ---------------------------------------------------------------------------
// Cycle record types
// ---------------------------------------------------------------------------

/**
 * Outcome of processing a single mutation during a cycle.
 */
export interface MutationOutcome {
  /** The schema_id affected by this mutation. */
  schema_id: string;
  /** The schema event type proposed. */
  event_type: SchemaEventType;
  /** Validator decision: "accept" | "warn" | "reject". */
  validator_decision: MigrationCheckDecision;
  /**
   * Executor decision: "apply" | "reject" | "defer".
   * Null when the mutation was skipped (validator rejected or error thrown).
   */
  executor_decision: "apply" | "reject" | "defer" | null;
  /** Whether the mutation changed registry state. */
  registry_changed: boolean;
  /**
   * True when the mutation was skipped entirely (validator rejected or
   * a thrown error prevented executor invocation).
   */
  skipped: boolean;
  /** Error that occurred during this mutation's processing, if any. */
  error?: string;
  /** Execution ID from the MutationEventLogRecorder (if executed). */
  execution_id?: string;
  /** EventLog event ID (if the EventLog write succeeded). */
  event_log_id?: string;
  /** EventLog write error (if the write failed but execution succeeded). */
  event_log_error?: string;
  /**
   * Whether the verification contract was updated as a result of this mutation.
   * True only for applied structural mutations (schema.registered/updated/deprecated/removed).
   * False for rejected, deferred, or dry-run mutations.
   */
  verification_contract_synced?: boolean;
}

/**
 * A structured error captured during a cycle.
 */
export interface CycleError {
  /** Which pipeline stage produced the error. */
  stage: "reader" | "proposer" | "stability" | "validator" | "executor" | "loop";
  /** Human-readable error message. */
  message: string;
  /** Stack trace, if available. */
  stack?: string;
  /** ISO timestamp when the error was captured. */
  captured_at_iso: string;
  /**
   * The schema_id associated with the error (for per-mutation errors).
   * Null for cycle-level errors.
   */
  schema_id?: string;
}

/**
 * A complete record of one self-improvement loop cycle.
 */
export interface CycleRecord {
  /** Unique ID for this cycle (format: `cycle-<run>-<seq>`). */
  cycle_id: string;
  /** Sequential cycle number (starts at 1). */
  cycle_number: number;
  /** Wall-clock ms when the cycle started. */
  started_at_ms: number;
  /** Wall-clock ms when the cycle completed (null if in-progress). */
  completed_at_ms: number | null;
  /** Duration in ms (null if in-progress). */
  duration_ms: number | null;
  /**
   * Snapshot ID captured at the start of this cycle.
   * Null if the reader failed.
   */
  snapshot_id: string | null;
  /**
   * Stability check result for this cycle.
   * Null if this was a bootstrap cycle (no previous snapshot).
   */
  stability: StabilityCheckResult | null;
  /** Proposal ID for this cycle's mutations. */
  proposal_id: string | null;
  /** Total mutations proposed. */
  mutations_proposed: number;
  /** Mutations that passed validation. */
  mutations_accepted: number;
  /** Mutations rejected by the validator. */
  mutations_validator_rejected: number;
  /** Mutations applied to registry. */
  mutations_applied: number;
  /** Mutations rejected by the executor. */
  mutations_executor_rejected: number;
  /** Mutations deferred for operator approval. */
  mutations_deferred: number;
  /** Mutations skipped due to errors or validator rejection. */
  mutations_skipped: number;
  /** Per-mutation outcomes. */
  readonly outcomes: readonly MutationOutcome[];
  /** All errors captured during this cycle. */
  readonly errors: readonly CycleError[];
  /**
   * Whether the cycle completed without any errors.
   * A cycle is "clean" if errors.length === 0 and no mutations were skipped.
   */
  clean: boolean;
  /**
   * The generation of the verification contract after this cycle.
   * Null if the contract has not yet been bootstrapped (reader failed).
   * Increments by 1 for each applied structural mutation in this cycle.
   */
  contract_generation_after: number | null;
}

// ---------------------------------------------------------------------------
// Loop status types
// ---------------------------------------------------------------------------

/** The lifecycle state of the self-improvement loop. */
export type LoopState =
  | "idle"     // Not started yet
  | "running"  // Currently executing cycles
  | "stopping" // Stop requested; finishing current cycle
  | "stopped"  // Fully stopped
  | "error";   // Fatal error (loop cannot continue; use restart())

/**
 * A point-in-time status snapshot of the SelfImprovementLoop.
 */
export interface LoopStatus {
  /** Current lifecycle state. */
  state: LoopState;
  /** Total cycles completed since start(). */
  cycles_completed: number;
  /** Total cycles that had at least one error. */
  cycles_with_errors: number;
  /** Total mutations applied (cumulatively across all cycles). */
  total_applied: number;
  /** Total mutations rejected (cumulatively across all cycles). */
  total_rejected: number;
  /** Total mutations deferred (cumulatively across all cycles). */
  total_deferred: number;
  /** Timestamp when the loop was started (null if not yet started). */
  started_at_iso: string | null;
  /** Timestamp when the loop was stopped (null if still running). */
  stopped_at_iso: string | null;
  /** The most recent cycle record, or null if no cycles have run. */
  last_cycle: CycleRecord | null;
  /** The snapshot from the most recently completed cycle. */
  last_snapshot: OntologySnapshot | null;
  /** Configured interval_ms for the loop. */
  interval_ms: number;
  /**
   * The current living verification contract.
   * Null until the first successful reader cycle (bootstrapped from snapshot).
   * Updated in lockstep with every applied structural mutation.
   */
  current_contract: VerificationContract | null;
}

// ---------------------------------------------------------------------------
// Loop options
// ---------------------------------------------------------------------------

/**
 * Options for `SelfImprovementLoop.start()` and `SelfImprovementLoop.runOnce()`.
 */
export interface LoopRunOptions extends ProposeMutationsOptions {
  /**
   * If true, mutations are proposed and validated but NOT executed.
   * The recorder is never called.  Useful for auditing what would change.
   */
  dry_run?: boolean;
  /**
   * If true, treat validator "warn" decisions as "reject".
   * Default: false (warns are accepted).
   */
  strict_validation?: boolean;
  /**
   * Optional run_id prefix for EventLog writes.
   * Default: "self-improvement-loop"
   */
  run_id_prefix?: string;
}

/**
 * Constructor options for `SelfImprovementLoop`.
 */
export interface SelfImprovementLoopOptions {
  /**
   * How long to wait between cycles (ms).
   * Default: 30_000 (30 seconds).
   */
  interval_ms?: number;
  /**
   * Maximum consecutive cycle failures before the loop enters "error" state.
   * Default: 5.
   */
  max_consecutive_failures?: number;
  /**
   * Backoff multiplier applied when consecutive failures occur.
   * On failure N, the next sleep is: interval_ms * (backoff_factor ^ N).
   * Default: 2.0.
   */
  backoff_factor?: number;
  /**
   * Maximum backoff ceiling (ms).
   * Default: 300_000 (5 minutes).
   */
  max_backoff_ms?: number;
  /**
   * Maximum number of CycleRecords kept in the rolling log.
   * Default: 100.
   */
  max_cycle_records?: number;
  /**
   * Custom MigrationCheckValidator instance.
   * Default: the module-scoped singleton.
   */
  validator?: MigrationCheckValidator;
  /**
   * Custom MutationEventLogRecorder instance.
   * Default: the module-scoped singleton (must be initialised first).
   */
  recorder?: MutationEventLogRecorder;
  /**
   * Custom snapshot reader function.
   * Default: `readOntologySchema` from `./ontology-schema-reader.js`.
   */
  snapshotReader?: () => OntologySnapshot;
  /**
   * Optional logger function for structured loop events.
   * Default: console.warn for errors, no-op for info.
   */
  logger?: LoopLogger;
  /**
   * Custom VerificationContractSyncer instance.
   * Default: the module-scoped singleton.
   *
   * The syncer is called after every applied structural mutation to update
   * the living verification contract in lockstep with schema evolution.
   */
  syncer?: VerificationContractSyncer;
}

/**
 * Minimal logger interface.  Allows test doubles or structured loggers.
 */
export interface LoopLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function captureError(
  stage: CycleError["stage"],
  err: unknown,
  schema_id?: string,
): CycleError {
  const message =
    err instanceof Error ? err.message : `Non-Error thrown: ${String(err)}`;
  const stack = err instanceof Error ? err.stack : undefined;
  return {
    stage,
    message,
    stack,
    captured_at_iso: new Date().toISOString(),
    schema_id,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

let _loopIdCounter = 0;

function nextLoopId(): string {
  return `loop-${Date.now()}-${++_loopIdCounter}`;
}

let _cycleSeq = 0;

function nextCycleId(loopId: string, seq: number): string {
  return `cycle-${loopId}-${seq}`;
}

// Default no-op logger
const nullLogger: LoopLogger = {
  info: () => {},
  warn: (msg, ctx) => console.warn(`[SelfImprovementLoop] WARN: ${msg}`, ctx ?? ""),
  error: (msg, ctx) => console.error(`[SelfImprovementLoop] ERROR: ${msg}`, ctx ?? ""),
};

// ---------------------------------------------------------------------------
// SelfImprovementLoop
// ---------------------------------------------------------------------------

/**
 * SelfImprovementLoop — Sub-AC 11d
 *
 * Wires the reader → validator → executor into a graceful self-improvement
 * cycle that catches all errors and never exits with code 1.
 *
 * ## Usage
 *
 * ```ts
 * import { selfImprovementLoop } from "@conitens/command-center/meta";
 *
 * // Start the loop (runs every 30s by default)
 * selfImprovementLoop.start();
 *
 * // Check status
 * const status = selfImprovementLoop.getStatus();
 * console.log(status.cycles_completed, status.total_applied);
 *
 * // Run exactly one cycle (e.g. for CLI/testing)
 * const cycle = await selfImprovementLoop.runOnce();
 * console.log(cycle.clean, cycle.mutations_applied);
 *
 * // Graceful stop
 * await selfImprovementLoop.stop();
 * ```
 */
export class SelfImprovementLoop {
  // ── Config ─────────────────────────────────────────────────────────────

  private readonly _interval_ms: number;
  private readonly _max_consecutive_failures: number;
  private readonly _backoff_factor: number;
  private readonly _max_backoff_ms: number;
  private readonly _max_cycle_records: number;
  private readonly _validator: MigrationCheckValidator;
  private readonly _recorder: MutationEventLogRecorder;
  private readonly _snapshotReader: () => OntologySnapshot;
  private readonly _logger: LoopLogger;
  private readonly _syncer: VerificationContractSyncer;

  // ── Mutable state ──────────────────────────────────────────────────────

  private _state: LoopState = "idle";
  private _loopId: string = "";
  private _consecutiveFailures = 0;
  private _cycleNumber = 0;
  private _cyclesCompleted = 0;
  private _cyclesWithErrors = 0;
  private _totalApplied = 0;
  private _totalRejected = 0;
  private _totalDeferred = 0;
  private _startedAtIso: string | null = null;
  private _stoppedAtIso: string | null = null;
  private _previousSnapshot: OntologySnapshot | null = null;
  private _currentContract: VerificationContract | null = null;
  private _lastCycle: CycleRecord | null = null;
  private _cycleLog: CycleRecord[] = [];
  private _stopRequested = false;
  private _stopResolvers: Array<() => void> = [];
  private _timer: ReturnType<typeof setTimeout> | null = null;

  // ── Constructor ────────────────────────────────────────────────────────

  constructor(opts: SelfImprovementLoopOptions = {}) {
    this._interval_ms = opts.interval_ms ?? 30_000;
    this._max_consecutive_failures = opts.max_consecutive_failures ?? 5;
    this._backoff_factor = opts.backoff_factor ?? 2.0;
    this._max_backoff_ms = opts.max_backoff_ms ?? 300_000;
    this._max_cycle_records = opts.max_cycle_records ?? 100;
    this._validator = opts.validator ?? defaultValidator;
    this._recorder = opts.recorder ?? defaultRecorder;
    this._snapshotReader = opts.snapshotReader ?? readOntologySchema;
    this._logger = opts.logger ?? nullLogger;
    this._syncer = opts.syncer ?? defaultSyncer;
  }

  // ── Public: lifecycle control ──────────────────────────────────────────

  /**
   * Start the self-improvement loop.
   *
   * Runs the first cycle immediately, then schedules subsequent cycles at
   * `interval_ms` intervals.  Safe to call multiple times — if already
   * running, subsequent calls are no-ops.
   *
   * @param opts  Per-cycle options (dry_run, strict_validation, etc.)
   */
  start(opts: LoopRunOptions = {}): void {
    if (this._state === "running" || this._state === "stopping") {
      this._logger.warn("start() called while loop is already running", {
        state: this._state,
      });
      return;
    }

    this._loopId = nextLoopId();
    this._state = "running";
    this._stopRequested = false;
    this._startedAtIso = new Date().toISOString();
    this._stoppedAtIso = null;
    this._consecutiveFailures = 0;

    this._logger.info("Loop started", { loop_id: this._loopId, interval_ms: this._interval_ms });

    // Kick off the first cycle asynchronously (non-blocking)
    this._scheduleImmediate(opts);
  }

  /**
   * Request graceful shutdown of the loop.
   *
   * Cancels the pending timer, waits for the current cycle (if any) to
   * complete, then transitions to "stopped".
   *
   * @returns A Promise that resolves when the loop is fully stopped.
   */
  stop(): Promise<void> {
    if (this._state === "idle" || this._state === "stopped") {
      return Promise.resolve();
    }
    if (this._state === "stopping") {
      // Already stopping — return a promise that resolves with the same stop
      return new Promise((resolve) => {
        this._stopResolvers.push(resolve);
      });
    }

    this._stopRequested = true;
    this._state = "stopping";

    // Cancel any pending timer
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    return new Promise((resolve) => {
      this._stopResolvers.push(resolve);
      // If no cycle is currently running, resolve immediately
      if (this._state === "stopping") {
        this._finalizeStopped();
      }
    });
  }

  /**
   * Run exactly one self-improvement cycle and return its record.
   *
   * Does NOT affect the running loop (if any).  Safe to call while the loop
   * is running — but note that concurrent cycle execution may produce
   * interleaved results in the registry.
   *
   * This is the primary entry point for:
   *   - CLI scripts that run a single pass
   *   - Tests that need fine-grained cycle control
   *   - GUI "run now" buttons
   *
   * @param opts  Per-cycle options (dry_run, strict_validation, etc.)
   * @returns     A CycleRecord describing the full cycle outcome.
   */
  async runOnce(opts: LoopRunOptions = {}): Promise<CycleRecord> {
    return this._executeCycle(opts);
  }

  // ── Public: status / inspection ───────────────────────────────────────

  /**
   * Return a point-in-time status snapshot of the loop.
   */
  getStatus(): LoopStatus {
    return {
      state: this._state,
      cycles_completed: this._cyclesCompleted,
      cycles_with_errors: this._cyclesWithErrors,
      total_applied: this._totalApplied,
      total_rejected: this._totalRejected,
      total_deferred: this._totalDeferred,
      started_at_iso: this._startedAtIso,
      stopped_at_iso: this._stoppedAtIso,
      last_cycle: this._lastCycle,
      last_snapshot: this._previousSnapshot,
      interval_ms: this._interval_ms,
      current_contract: this._currentContract,
    };
  }

  /**
   * Return the current living verification contract.
   *
   * Null until the first successful snapshot read, after which it is
   * bootstrapped from the snapshot and updated on every applied structural
   * mutation.
   *
   * The returned contract is immutable (Object.freeze'd).
   */
  getCurrentContract(): VerificationContract | null {
    return this._currentContract;
  }

  /**
   * Return the rolling log of cycle records (newest first).
   */
  getCycleLog(): readonly CycleRecord[] {
    return [...this._cycleLog].reverse();
  }

  /**
   * Return the last N cycle records (newest first).
   */
  getRecentCycles(n = 10): CycleRecord[] {
    return [...this._cycleLog].reverse().slice(0, n);
  }

  /**
   * Clear the cycle log and reset cumulative counters.
   * The loop continues running (if active); only the history is reset.
   */
  resetStats(): void {
    this._cycleLog = [];
    this._cyclesCompleted = 0;
    this._cyclesWithErrors = 0;
    this._totalApplied = 0;
    this._totalRejected = 0;
    this._totalDeferred = 0;
    this._lastCycle = null;
  }

  // ── Private: cycle execution ──────────────────────────────────────────

  /**
   * Execute one full pipeline cycle.
   *
   * All errors are caught and recorded in CycleError entries.
   * This method NEVER throws.
   */
  private async _executeCycle(opts: LoopRunOptions): Promise<CycleRecord> {
    const seq = ++this._cycleNumber;
    const cycle_id = nextCycleId(this._loopId || "standalone", seq);
    const started_at_ms = Date.now();

    const errors: CycleError[] = [];
    const outcomes: MutationOutcome[] = [];

    let snapshotId: string | null = null;
    let proposalId: string | null = null;
    let stability: StabilityCheckResult | null = null;
    let proposal: SchemaMutationProposal | null = null;
    let currentSnapshot: OntologySnapshot | null = null;

    // ── Stage 1: Reader ────────────────────────────────────────────────

    try {
      currentSnapshot = this._snapshotReader();
      snapshotId = currentSnapshot.snapshot_id;
    } catch (err: unknown) {
      const ce = captureError("reader", err);
      errors.push(ce);
      this._logger.error("Reader stage failed — cycle aborted", {
        cycle_id,
        error: ce.message,
      });
      // Cannot proceed without a snapshot
      return this._finalizeCycle(
        {
          cycle_id,
          cycle_number: seq,
          started_at_ms,
          snapshot_id: null,
          stability: null,
          proposal_id: null,
          mutations_proposed: 0,
          mutations_accepted: 0,
          mutations_validator_rejected: 0,
          mutations_applied: 0,
          mutations_executor_rejected: 0,
          mutations_deferred: 0,
          mutations_skipped: 0,
        },
        outcomes,
        errors,
      );
    }

    // ── Stage 1b: Bootstrap verification contract (if needed) ─────────────

    if (this._currentContract === null && currentSnapshot !== null) {
      try {
        this._currentContract = this._syncer.deriveFromSnapshot(currentSnapshot);
        this._logger.info("Verification contract bootstrapped from snapshot", {
          cycle_id,
          contract_id: this._currentContract.contract_id,
          generation: this._currentContract.generation,
          clauses: this._currentContract.clauses.length,
        });
      } catch (err: unknown) {
        const ce = captureError("reader", err);
        errors.push(ce);
        this._logger.warn("Contract bootstrapping failed — continuing without contract", {
          cycle_id,
          error: ce.message,
        });
        // Non-fatal: continue cycle without contract
      }
    }

    // ── Stage 2: Stability check ───────────────────────────────────────

    if (this._previousSnapshot !== null) {
      try {
        stability = validateProposalStability(currentSnapshot, this._previousSnapshot);
        if (!stability.stable) {
          this._logger.warn("Stability check FAILED", {
            cycle_id,
            missing_schema_ids: stability.missing_schema_ids,
            level_regressions: stability.level_regressions,
          });
          // Stability failure is a warning, not a blocker — the cycle continues
          errors.push({
            stage: "stability",
            message: `Stability check failed: ${stability.missing_schema_ids.length} missing schema_ids, ${stability.level_regressions.length} level regressions`,
            captured_at_iso: new Date().toISOString(),
          });
        }
      } catch (err: unknown) {
        const ce = captureError("stability", err);
        errors.push(ce);
        this._logger.warn("Stability check threw — continuing without stability data", {
          cycle_id,
          error: ce.message,
        });
      }
    }

    // ── Stage 3: Proposer ──────────────────────────────────────────────

    try {
      proposal = proposeMutations(currentSnapshot, this._previousSnapshot, opts);
      proposalId = proposal.proposal_id;
    } catch (err: unknown) {
      const ce = captureError("proposer", err);
      errors.push(ce);
      this._logger.error("Proposer stage failed — cycle aborted", {
        cycle_id,
        error: ce.message,
      });
      // Cannot proceed without a proposal
      return this._finalizeCycle(
        {
          cycle_id,
          cycle_number: seq,
          started_at_ms,
          snapshot_id: snapshotId,
          stability,
          proposal_id: null,
          mutations_proposed: 0,
          mutations_accepted: 0,
          mutations_validator_rejected: 0,
          mutations_applied: 0,
          mutations_executor_rejected: 0,
          mutations_deferred: 0,
          mutations_skipped: 0,
        },
        outcomes,
        errors,
      );
    }

    // ── Stages 4 & 5: Validator + Executor (per mutation) ─────────────

    let mutationsAccepted = 0;
    let mutationsValidatorRejected = 0;
    let mutationsApplied = 0;
    let mutationsExecutorRejected = 0;
    let mutationsDeferred = 0;
    let mutationsSkipped = 0;

    const registry = this._recorder.getRegistry();
    const registryView = this._buildRegistryView(registry);
    const activeRunIds: ReadonlySet<string> = new Set(); // No active migration runs known at this point

    for (const mutation of proposal.mutations) {
      const outcome = await this._processMutation(
        mutation,
        registryView,
        activeRunIds,
        proposalId,
        cycle_id,
        opts,
      );
      outcomes.push(outcome);

      if (outcome.error && !outcome.skipped) {
        errors.push({
          stage: "executor",
          message: outcome.error,
          captured_at_iso: new Date().toISOString(),
          schema_id: outcome.schema_id,
        });
      }

      if (outcome.skipped) {
        mutationsSkipped++;
        if (outcome.validator_decision === "reject") {
          mutationsValidatorRejected++;
        }
      } else {
        mutationsAccepted++;
        switch (outcome.executor_decision) {
          case "apply":   mutationsApplied++;          break;
          case "reject":  mutationsExecutorRejected++; break;
          case "defer":   mutationsDeferred++;          break;
        }
      }
    }

    // ── Checkpoint: advance previousSnapshot on success ────────────────
    // We advance even if some mutations had errors — the snapshot itself is valid.

    const hadCriticalError = errors.some(
      (e) => e.stage === "reader" || e.stage === "proposer",
    );
    if (!hadCriticalError && currentSnapshot) {
      this._previousSnapshot = currentSnapshot;
    }

    return this._finalizeCycle(
      {
        cycle_id,
        cycle_number: seq,
        started_at_ms,
        snapshot_id: snapshotId,
        stability,
        proposal_id: proposalId,
        mutations_proposed: proposal.mutations.length,
        mutations_accepted: mutationsAccepted,
        mutations_validator_rejected: mutationsValidatorRejected,
        mutations_applied: mutationsApplied,
        mutations_executor_rejected: mutationsExecutorRejected,
        mutations_deferred: mutationsDeferred,
        mutations_skipped: mutationsSkipped,
      },
      outcomes,
      errors,
    );
  }

  /**
   * Process a single mutation through the validator → executor pipeline.
   *
   * NEVER throws — all errors are captured in the returned MutationOutcome.
   */
  private async _processMutation(
    mutation: SchemaMutation,
    registryView: Iterable<RegistryEntryView>,
    activeRunIds: ReadonlySet<string>,
    proposalId: string | null,
    cycle_id: string,
    opts: LoopRunOptions,
  ): Promise<MutationOutcome> {
    const { schema_id, event_type, payload } = mutation;
    const baseOutcome: MutationOutcome = {
      schema_id,
      event_type: event_type as SchemaEventType,
      validator_decision: "accept",
      executor_decision: null,
      registry_changed: false,
      skipped: false,
    };

    // ── Validator ────────────────────────────────────────────────────────

    let validationResult: MigrationCheckResult;
    try {
      validationResult = this._validator.check(
        event_type as SchemaEventType,
        payload,
        registryView,
        activeRunIds,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : `Validator threw: ${String(err)}`;
      this._logger.warn("Validator threw for mutation — skipping", {
        cycle_id,
        schema_id,
        event_type,
        error: message,
      });
      return {
        ...baseOutcome,
        validator_decision: "reject",
        skipped: true,
        error: `Validator error: ${message}`,
      };
    }

    baseOutcome.validator_decision = validationResult.decision;

    // Reject: skip mutation
    if (
      validationResult.decision === "reject" ||
      (validationResult.decision === "warn" && opts.strict_validation)
    ) {
      const reasons = validationResult.violations
        .map((v) => `[${v.rule_id}] ${v.message}`)
        .join("; ");
      this._logger.warn("Validator rejected mutation — skipping", {
        cycle_id,
        schema_id,
        event_type,
        reasons,
      });
      return {
        ...baseOutcome,
        skipped: true,
        error: `Validator rejected: ${reasons || "strict mode: warnings present"}`,
      };
    }

    // ── Dry run: skip executor ────────────────────────────────────────

    if (opts.dry_run) {
      this._logger.info("Dry run — skipping executor for mutation", {
        cycle_id,
        schema_id,
        event_type,
      });
      return {
        ...baseOutcome,
        executor_decision: null,
        skipped: true,
      };
    }

    // ── Executor ─────────────────────────────────────────────────────────

    let handleResult: HandleAndRecordResult;
    try {
      const recordOpts: RecordOptions = {
        proposal_id: proposalId ?? undefined,
        run_id: `self-improvement-${opts.run_id_prefix ?? "loop"}-${Date.now()}`,
        correlation_id: cycle_id,
      };
      handleResult = await this._recorder.handleAndRecord(
        event_type as SchemaEventType,
        payload,
        recordOpts,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : `Executor threw: ${String(err)}`;
      this._logger.error("Executor threw for mutation — recording error", {
        cycle_id,
        schema_id,
        event_type,
        error: message,
      });
      return {
        ...baseOutcome,
        executor_decision: null,
        skipped: true,
        error: `Executor error: ${message}`,
      };
    }

    const { handle_result, event_log_entry, event_log_error } = handleResult;

    // ── Verification contract sync (applied mutations only) ───────────────────
    // When the executor applied a structural mutation, update the living
    // verification contract in lockstep. Errors here are non-fatal.

    let verification_contract_synced = false;
    if (handle_result.decision === "apply" && this._currentContract !== null) {
      try {
        const syncResult = this._syncer.sync(
          this._currentContract,
          event_type as SchemaEventType,
          payload,
        );
        if (syncResult.changed) {
          this._currentContract = syncResult.contract;
          verification_contract_synced = true;
          this._logger.info("Verification contract updated", {
            schema_id,
            event_type,
            contract_id: syncResult.contract.contract_id,
            generation: syncResult.contract.generation,
            clauses_added: syncResult.clauses_added,
            clauses_updated: syncResult.clauses_updated,
            clauses_removed: syncResult.clauses_removed,
          });
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : `Contract sync error: ${String(err)}`;
        this._logger.warn("Verification contract sync threw — contract unchanged", {
          schema_id,
          event_type,
          error: message,
        });
        // Non-fatal: contract remains as-is; cycle continues
      }
    }

    return {
      ...baseOutcome,
      executor_decision: handle_result.decision,
      registry_changed: handle_result.registry_changed,
      skipped: false,
      execution_id: handle_result.record.execution_id,
      event_log_id: event_log_entry?.event_id,
      event_log_error: event_log_error?.message,
      error: event_log_error?.message,
      verification_contract_synced,
    };
  }

  /**
   * Convert the executor registry entries array to an Iterable<RegistryEntryView>
   * compatible with MigrationCheckValidator.check().
   */
  private _buildRegistryView(
    registry: readonly import("./mutation-executor.js").RegistryEntry[],
  ): Iterable<RegistryEntryView> {
    return registry.map((entry) => ({
      schema_id: entry.schema_id,
      namespace: entry.namespace,
      version: entry.version,
      status: entry.status,
    }));
  }

  // ── Private: cycle finalization ────────────────────────────────────────

  private _finalizeCycle(
    partial: Omit<CycleRecord, "completed_at_ms" | "duration_ms" | "outcomes" | "errors" | "clean" | "contract_generation_after">,
    outcomes: MutationOutcome[],
    errors: CycleError[],
  ): CycleRecord {
    const completed_at_ms = Date.now();
    const duration_ms = completed_at_ms - partial.started_at_ms;
    const clean =
      errors.length === 0 &&
      outcomes.every((o) => !o.skipped || o.validator_decision === "reject");

    const cycle: CycleRecord = {
      ...partial,
      completed_at_ms,
      duration_ms,
      outcomes: Object.freeze(outcomes),
      errors: Object.freeze(errors),
      clean,
      contract_generation_after: this._currentContract?.generation ?? null,
    };

    // Update cumulative stats
    this._cyclesCompleted++;
    if (!clean) this._cyclesWithErrors++;
    this._totalApplied += partial.mutations_applied;
    this._totalRejected += partial.mutations_executor_rejected + partial.mutations_validator_rejected;
    this._totalDeferred += partial.mutations_deferred;
    this._lastCycle = cycle;

    // Append to rolling log
    this._cycleLog.push(cycle);
    if (this._cycleLog.length > this._max_cycle_records) {
      this._cycleLog.shift();
    }

    // Update consecutive failure counter for backoff
    const hadCriticalError = errors.some(
      (e) => e.stage === "reader" || e.stage === "proposer" || e.stage === "loop",
    );
    if (hadCriticalError) {
      this._consecutiveFailures++;
      this._logger.warn("Cycle had critical error", {
        cycle_id: partial.cycle_id,
        consecutive_failures: this._consecutiveFailures,
      });
    } else {
      this._consecutiveFailures = 0;
    }

    return cycle;
  }

  // ── Private: scheduling ────────────────────────────────────────────────

  /**
   * Schedule the first cycle immediately (next microtask queue drain).
   */
  private _scheduleImmediate(opts: LoopRunOptions): void {
    // Use Promise.resolve() to yield to the event loop before running
    Promise.resolve().then(() => this._runLoop(opts)).catch(() => {
      // _runLoop itself catches all errors; this is a belt-and-suspenders guard
    });
  }

  /**
   * The main loop body.  Runs cycles indefinitely until `stop()` is called.
   *
   * NEVER throws — all errors are caught and logged.
   */
  private async _runLoop(opts: LoopRunOptions): Promise<void> {
    while (!this._stopRequested && this._state === "running") {
      // Check consecutive failure limit
      if (this._consecutiveFailures >= this._max_consecutive_failures) {
        this._logger.error(
          `Loop entering "error" state after ${this._consecutiveFailures} consecutive failures`,
          { consecutive_failures: this._consecutiveFailures },
        );
        this._state = "error";
        break;
      }

      // Execute cycle (never throws)
      try {
        await this._executeCycle(opts);
      } catch (err: unknown) {
        // Belt-and-suspenders: _executeCycle should never throw
        const ce = captureError("loop", err);
        this._logger.error("Unexpected throw from _executeCycle — this is a bug", {
          error: ce.message,
        });
        this._consecutiveFailures++;
      }

      if (this._stopRequested) break;

      // Compute sleep duration with backoff
      const backoffMultiplier = Math.pow(
        this._backoff_factor,
        this._consecutiveFailures,
      );
      const sleep_ms = clamp(
        Math.floor(this._interval_ms * backoffMultiplier),
        this._interval_ms,
        this._max_backoff_ms,
      );

      if (sleep_ms !== this._interval_ms && this._consecutiveFailures > 0) {
        this._logger.warn("Applying backoff before next cycle", {
          sleep_ms,
          consecutive_failures: this._consecutiveFailures,
        });
      }

      // Sleep with stop-check
      await this._sleep(sleep_ms);
    }

    // Loop exited
    if (this._state !== "error") {
      this._finalizeStopped();
    } else {
      // Error state — notify stop resolvers so callers don't hang
      this._finalizeStopped();
    }
  }

  /**
   * Sleep for `ms` milliseconds, but wake early if stop is requested.
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this._timer = setTimeout(() => {
        this._timer = null;
        resolve();
      }, ms);
    });
  }

  /**
   * Transition to "stopped" state and notify all stop resolvers.
   */
  private _finalizeStopped(): void {
    if (this._state !== "error") {
      this._state = "stopped";
    }
    this._stoppedAtIso = new Date().toISOString();
    this._timer = null;

    const resolvers = [...this._stopResolvers];
    this._stopResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }

    this._logger.info("Loop stopped", {
      loop_id: this._loopId,
      cycles_completed: this._cyclesCompleted,
      final_state: this._state,
    });
  }
}

// ---------------------------------------------------------------------------
// Application-scoped singleton
// ---------------------------------------------------------------------------

/**
 * Application-scoped `SelfImprovementLoop` singleton.
 *
 * Uses the default validator and recorder singletons.
 * The recorder MUST be initialised via `initMutationEventLogRecorder()`
 * before the loop is started, otherwise EventLog writes will return
 * `event_log_error` on each mutation.
 *
 * ```ts
 * import { initMutationEventLogRecorder } from "@conitens/command-center/meta";
 * import { selfImprovementLoop } from "@conitens/command-center/meta";
 * import { EventLog } from "@conitens/core";
 *
 * const eventLog = new EventLog("/path/to/events");
 * initMutationEventLogRecorder(eventLog);
 *
 * // Start the loop with 60s interval
 * selfImprovementLoop.start({ dry_run: false });
 * ```
 */
export const selfImprovementLoop = new SelfImprovementLoop();

// ---------------------------------------------------------------------------
// React hook wrapper
// ---------------------------------------------------------------------------

/**
 * Returns the application-scoped `SelfImprovementLoop` singleton.
 *
 * Useful for React components that need to inspect loop status or trigger
 * manual cycles.
 *
 * @example
 * ```tsx
 * function SelfImprovementStatusPanel() {
 *   const loop = useSelfImprovementLoop();
 *   const status = loop.getStatus();
 *   return (
 *     <div>
 *       <span>State: {status.state}</span>
 *       <span>Cycles: {status.cycles_completed}</span>
 *       <span>Applied: {status.total_applied}</span>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSelfImprovementLoop(): SelfImprovementLoop {
  return selfImprovementLoop;
}
