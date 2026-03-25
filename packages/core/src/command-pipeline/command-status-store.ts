/**
 * @module command-status-store
 * Sub-AC 8b — Companion status store for Command lifecycle state tracking.
 *
 * Purpose
 * ───────
 * Records every lifecycle state transition for each command that passes
 * through the Orchestrator pipeline.  The store is the "view plane" mirror
 * of the event log for command-specific state — it makes current command
 * states queryable without replaying the entire event log.
 *
 * Lifecycle states (Sub-AC 8b)
 * ─────────────────────────────
 *   pending   → File written to inbox; not yet picked up by the watcher.
 *   accepted  → Passed envelope + payload validation; about to be executed.
 *   executing → Orchestrator.processCommandData() is running.
 *   completed → Event appended successfully; no further processing needed.
 *   failed    → Processing error after acceptance.
 *   rejected  → Refused at the ingestion boundary (schema / auth / dedupe).
 *
 * State transition rules:
 *   pending   → accepted | rejected
 *   accepted  → executing | failed
 *   executing → completed | failed
 *   completed → (terminal)
 *   failed    → (terminal)
 *   rejected  → (terminal)
 *
 * Storage
 * ───────
 * Status transitions are written as append-only JSON lines to
 *   <conitensDir>/runtime/command-status/status.jsonl
 *
 * This path sits in the "view" plane of the 5-plane taxonomy
 * (runtime/* = view plane).  It is generated from events and never directly
 * mutated by the GUI.
 *
 * In-memory index
 * ───────────────
 * The store also maintains an in-memory map from command_id → most recent
 * CommandStatusRecord for fast O(1) lookups.  The map is hydrated from disk
 * on `open()` and kept current via `recordTransition()`.
 */

import { open, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All valid lifecycle states for a command passing through the pipeline.
 * Order reflects the canonical forward-progress direction.
 */
export type CommandLifecycleState =
  | "pending"    // in inbox; not yet picked up
  | "accepted"   // passed validation; about to execute
  | "executing"  // processCommandData() is running
  | "completed"  // event appended; success
  | "failed"     // error during / after acceptance
  | "rejected";  // refused at ingestion boundary

/** Terminal states — no further transitions are valid. */
export const TERMINAL_COMMAND_STATES: ReadonlySet<CommandLifecycleState> =
  new Set(["completed", "failed", "rejected"]);

/** Valid forward transitions from each state. */
export const VALID_COMMAND_TRANSITIONS: Readonly<
  Record<CommandLifecycleState, ReadonlySet<CommandLifecycleState>>
> = {
  pending:   new Set(["accepted", "rejected"]),
  accepted:  new Set(["executing", "failed", "rejected"]),
  executing: new Set(["completed", "failed"]),
  completed: new Set(),
  failed:    new Set(),
  rejected:  new Set(),
};

/**
 * Type guard: can `from` transition to `to`?
 */
export function canCommandTransition(
  from: CommandLifecycleState,
  to: CommandLifecycleState,
): boolean {
  return VALID_COMMAND_TRANSITIONS[from].has(to);
}

/**
 * A single state-transition record persisted to the JSONL log and held
 * in-memory.  Every field is immutable after creation.
 */
export interface CommandStatusRecord {
  /** Command identifier (from CommandFile.command_id). */
  command_id: string;
  /**
   * GUI command type (e.g. "agent.spawn"), populated after validation.
   * May be absent for completely malformed input that never reached routing.
   */
  command_type?: string;
  /** New lifecycle state. */
  status: CommandLifecycleState;
  /** ISO 8601 wall-clock timestamp of this transition. */
  ts: string;
  /**
   * ID of the ConitensEvent appended by the Orchestrator, if applicable.
   * Present on `completed`, `failed`, and `rejected` transitions.
   */
  event_id?: string;
  /** Human-readable error or rejection message (failed / rejected only). */
  error?: string;
  /** Machine-readable error code (failed / rejected only). */
  error_code?: string;
  /** Wall-clock duration from `pending` → this state, in milliseconds. */
  duration_ms?: number;
  /** Additional free-form context. */
  meta?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandStatusStore
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append-only companion status store for command lifecycle transitions.
 *
 * Usage:
 * ```ts
 * const store = new CommandStatusStore(conitensDir);
 * await store.open();                       // hydrate from disk
 * await store.recordTransition('cmd_001', 'pending', { command_type: 'agent.spawn' });
 * const rec = store.getLatest('cmd_001');   // { status: 'pending', ... }
 * await store.close();
 * ```
 */
export class CommandStatusStore {
  /** Absolute path to the status JSONL file. */
  readonly statusFilePath: string;

  /**
   * In-memory index: command_id → most recent StatusRecord.
   * Updated on every `recordTransition()` call.
   */
  private readonly index = new Map<string, CommandStatusRecord>();

  /**
   * In-memory history: command_id → all StatusRecords in order.
   * Useful for replay-style inspection of transition sequences.
   */
  private readonly history = new Map<string, CommandStatusRecord[]>();

  /**
   * Wall-clock start time per command_id, recorded on the first transition
   * for that command (used to compute duration_ms on terminal transitions).
   */
  private readonly startTimes = new Map<string, number>();

  private _opened = false;

  constructor(conitensDir: string) {
    this.statusFilePath = join(
      conitensDir,
      "runtime",
      "command-status",
      "status.jsonl",
    );
  }

  /** Whether the store has been opened (hydration complete). */
  get isOpen(): boolean {
    return this._opened;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Open the store: create the directory if needed, then hydrate from disk.
   * Must be called before `recordTransition()` or query methods.
   */
  async open(): Promise<void> {
    if (this._opened) return;

    const dir = join(this.statusFilePath, "..");
    await mkdir(dir, { recursive: true });

    await this.hydrateFromDisk();
    this._opened = true;
  }

  /**
   * Close the store.  In-memory state is NOT flushed; the JSONL log is already
   * written on every `recordTransition()` call via fsync, so no flush is needed.
   */
  close(): void {
    this._opened = false;
  }

  // ─── State transitions ───────────────────────────────────────────────────────

  /**
   * Record a lifecycle state transition for a command.
   *
   * - Enforces forward-only transitions (skips invalid transitions with a
   *   stderr warning rather than throwing, so the pipeline keeps running).
   * - Appends the record to the JSONL log with fsync.
   * - Updates the in-memory index and history.
   *
   * @param commandId   The `command_id` from the CommandFile envelope.
   * @param newState    The target lifecycle state.
   * @param extra       Optional additional fields to persist with the record.
   * @returns           The new record, or `null` if the transition was rejected.
   */
  async recordTransition(
    commandId: string,
    newState: CommandLifecycleState,
    extra?: Partial<Omit<CommandStatusRecord, "command_id" | "status" | "ts">>,
  ): Promise<CommandStatusRecord | null> {
    if (!this._opened) {
      process.stderr.write(
        `[CommandStatusStore] recordTransition called before open() for ${commandId}\n`,
      );
      return null;
    }

    // Enforce valid transitions.
    const current = this.index.get(commandId);
    if (current) {
      if (!canCommandTransition(current.status, newState)) {
        process.stderr.write(
          `[CommandStatusStore] Invalid transition ${current.status} → ${newState} for ${commandId} (skipped)\n`,
        );
        return null;
      }
    }

    // Compute duration from start time.
    let duration_ms: number | undefined;
    if (!this.startTimes.has(commandId)) {
      this.startTimes.set(commandId, Date.now());
    }
    if (TERMINAL_COMMAND_STATES.has(newState)) {
      const startTime = this.startTimes.get(commandId);
      if (startTime !== undefined) {
        duration_ms = Date.now() - startTime;
      }
    }

    const record: CommandStatusRecord = {
      command_id: commandId,
      status: newState,
      ts: new Date().toISOString(),
      ...(duration_ms !== undefined ? { duration_ms } : {}),
      ...extra,
    };

    // Update in-memory index BEFORE the disk write.
    // This prevents a race condition where two concurrent callers both read
    // `undefined` from the index, both pass the transition check, and both
    // attempt to record the same state.  Optimistic in-memory state is safe
    // here because the status store is a "view" plane artefact — the event
    // log remains the authoritative source of truth.
    this.index.set(commandId, record);

    // Update history (append synchronously before disk write).
    const existingHistory = this.history.get(commandId) ?? [];
    existingHistory.push(record);
    this.history.set(commandId, existingHistory);

    // Append to disk (fsync for durability).
    await this.appendLine(record);

    return record;
  }

  // ─── Query API ───────────────────────────────────────────────────────────────

  /**
   * Get the most recent status record for a command.
   * Returns `undefined` if the command_id is unknown.
   */
  getLatest(commandId: string): CommandStatusRecord | undefined {
    return this.index.get(commandId);
  }

  /**
   * Get all status records for a command in chronological order.
   * Returns an empty array if the command_id is unknown.
   */
  getHistory(commandId: string): CommandStatusRecord[] {
    return this.history.get(commandId) ?? [];
  }

  /**
   * List the most recent status record for every known command.
   * Returns records in insertion order (roughly chronological).
   */
  listAll(): CommandStatusRecord[] {
    return Array.from(this.index.values());
  }

  /**
   * List all commands currently in a given lifecycle state.
   */
  listByState(state: CommandLifecycleState): CommandStatusRecord[] {
    return Array.from(this.index.values()).filter((r) => r.status === state);
  }

  /**
   * Number of distinct command_ids tracked by this store.
   */
  get size(): number {
    return this.index.size;
  }

  /**
   * Clear the in-memory index and history (does NOT affect the JSONL log).
   * Useful for testing.
   */
  clearMemory(): void {
    this.index.clear();
    this.history.clear();
    this.startTimes.clear();
  }

  // ─── Disk I/O ────────────────────────────────────────────────────────────────

  /**
   * Append a single record to the JSONL status file with fsync.
   */
  private async appendLine(record: CommandStatusRecord): Promise<void> {
    const line = JSON.stringify(record) + "\n";
    const fh = await open(this.statusFilePath, "a");
    try {
      await fh.write(line);
      await fh.sync();
    } finally {
      await fh.close();
    }
  }

  /**
   * Hydrate the in-memory index from the JSONL status file.
   * If the file does not exist, the store starts empty (not an error).
   * Invalid JSON lines are silently skipped (log is written by this process,
   * so malformed lines indicate external tampering — skip, don't crash).
   */
  private async hydrateFromDisk(): Promise<void> {
    let fh;
    try {
      fh = await open(this.statusFilePath, "r");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    const rl = createInterface({
      input: fh.createReadStream({ encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    try {
      for await (const line of rl) {
        if (!line.trim()) continue;
        let record: CommandStatusRecord;
        try {
          record = JSON.parse(line) as CommandStatusRecord;
        } catch {
          // Skip malformed lines.
          continue;
        }
        if (!record.command_id || !record.status) continue;

        // Update index with last-write-wins semantics.
        this.index.set(record.command_id, record);

        // Append to history.
        const hist = this.history.get(record.command_id) ?? [];
        hist.push(record);
        this.history.set(record.command_id, hist);

        // Restore start time from first record seen.
        if (!this.startTimes.has(record.command_id)) {
          this.startTimes.set(record.command_id, new Date(record.ts).getTime());
        }
      }
    } finally {
      await fh.close();
    }
  }
}
