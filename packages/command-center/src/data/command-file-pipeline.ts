/**
 * command-file-pipeline.ts — Sub-AC 8b: Command-file pipeline entity.
 *
 * Purpose
 * ───────
 * This module models the **GUI-side pipeline entity** that tracks every
 * command file the GUI has dispatched through its complete lifecycle:
 *
 *   pending → accepted → executing → completed | failed
 *
 * The lifecycle mirrors the orchestrator-side `CommandStatusStore` (packages/core)
 * but is driven by incoming WebSocket events rather than direct file access.
 *
 * Sub-AC relationships
 * ────────────────────
 *   Sub-AC 8a  (use-command-file-writer.ts) — writes command files with `pending` status.
 *   Sub-AC 8b  (this file)                 — pipeline entity + watcher that transitions
 *                                            pending → accepted → executing → completed|failed.
 *   Sub-AC 8c  (command-lifecycle-store.ts)— visual lifecycle store used for 3D badges.
 *
 * Architecture
 * ────────────
 * The GUI never reads command files back (write-only inbox). Instead it tracks
 * lifecycle state by ingesting WebSocket events from the Orchestrator:
 *
 *   command.issued / command.queued   → accepted
 *   command.acknowledged / dispatched → executing
 *   command.completed                 → completed
 *   command.failed / rejected         → failed
 *
 * `CommandFilePipelineWatcher` maintains an in-memory Map<command_id, entity>
 * and provides `applyEvent()` to drive state transitions.  The companion hook
 * `use-command-file-pipeline.ts` wires the watcher to the WebSocket bus and
 * persists transitions back to `command-lifecycle-store` (Sub-AC 8c).
 *
 * State machine
 * ─────────────
 *   pending   → accepted | failed          (orchestrator picks up or rejects at ingestion)
 *   accepted  → executing | failed         (execution begins or pre-execution error)
 *   executing → completed | failed         (run completes or throws)
 *   completed → (terminal)
 *   failed    → (terminal)
 *
 * Record transparency
 * ────────────────────
 * Every `CommandFilePipelineEntity` is immutable after construction.
 * Transitions produce new entity objects (no in-place mutation).
 * `CommandFilePipelineWatcher` appends to an internal transition log so
 * that every state change is traceable.
 *
 * Pure TypeScript — no React, Three.js, or browser-DOM dependencies.
 * Testable in Node.js without a browser context.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline lifecycle status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The canonical pipeline lifecycle states for a GUI-dispatched command.
 *
 * These mirror the orchestrator-side `CommandLifecycleState` in
 * `packages/core/src/command-pipeline/command-status-store.ts`.
 *
 * Transition graph:
 *   pending → accepted | failed
 *   accepted → executing | failed
 *   executing → completed | failed
 *   completed → (terminal)
 *   failed    → (terminal)
 */
export type CommandFilePipelineStatus =
  | "pending"    // written to inbox; not yet acknowledged
  | "accepted"   // orchestrator received + validated
  | "executing"  // orchestrator is actively processing
  | "completed"  // finished successfully
  | "failed";    // error or rejection at any stage

/** Terminal states — no further transitions are valid. */
export const TERMINAL_PIPELINE_STATES: ReadonlySet<CommandFilePipelineStatus> =
  new Set(["completed", "failed"]);

/** Valid forward transitions from each state. */
export const VALID_PIPELINE_TRANSITIONS: Readonly<
  Record<CommandFilePipelineStatus, ReadonlySet<CommandFilePipelineStatus>>
> = {
  pending:   new Set<CommandFilePipelineStatus>(["accepted", "failed"]),
  accepted:  new Set<CommandFilePipelineStatus>(["executing", "failed"]),
  executing: new Set<CommandFilePipelineStatus>(["completed", "failed"]),
  completed: new Set<CommandFilePipelineStatus>(),
  failed:    new Set<CommandFilePipelineStatus>(),
};

/**
 * Return `true` if a transition from `from` to `to` is valid according
 * to the pipeline state machine.
 */
export function canPipelineTransition(
  from: CommandFilePipelineStatus,
  to: CommandFilePipelineStatus,
): boolean {
  return VALID_PIPELINE_TRANSITIONS[from].has(to);
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandFilePipelineEntity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Immutable state record for a single command file tracked by the pipeline.
 *
 * Each field is set at creation time or on a state transition.
 * Transitions always produce a new entity object; the original is not mutated.
 */
export interface CommandFilePipelineEntity {
  /** Stable unique identifier matching the CommandFile.command_id. */
  readonly command_id: string;
  /** GUI command type string (e.g. "agent.spawn", "task.create"). */
  readonly command_type: string;
  /** Current pipeline lifecycle status. */
  readonly status: CommandFilePipelineStatus;
  /** ISO 8601 timestamp when the entity was first registered (pending). */
  readonly ts_created: string;
  /** ISO 8601 timestamp of the most recent status transition. */
  readonly ts_updated: string;
  /** Error detail for `failed` status. */
  readonly error?: Readonly<{ code: string; message: string }>;
  /**
   * Wall-clock execution duration in milliseconds.
   * Populated when the entity reaches a terminal state.
   */
  readonly duration_ms?: number;
  /**
   * The WebSocket event type that drove the most recent transition.
   * Useful for debugging and replay.
   */
  readonly trigger_event?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transition log entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single record of a state transition, appended to the watcher's
 * internal transition log.  Satisfies the record-transparency principle.
 */
export interface PipelineTransitionRecord {
  readonly command_id:    string;
  readonly from_status:   CommandFilePipelineStatus | null;
  readonly to_status:     CommandFilePipelineStatus;
  readonly trigger_event: string;
  readonly ts:            string;
  readonly error_code?:   string;
  readonly error_msg?:    string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new `CommandFilePipelineEntity` in `pending` state.
 * Called by the GUI immediately after writing a command file.
 */
export function makePipelineEntity(
  command_id:   string,
  command_type: string,
  ts?: string,
): CommandFilePipelineEntity {
  const now = ts ?? new Date().toISOString();
  return Object.freeze({
    command_id,
    command_type,
    status:     "pending",
    ts_created: now,
    ts_updated: now,
  });
}

/**
 * Produce a new `CommandFilePipelineEntity` with `status` advanced to
 * `next_status`.
 *
 * Returns `null` if the transition is invalid (no mutation occurs).
 *
 * @param entity       Current entity.
 * @param next_status  Target status.
 * @param trigger_event  WS event type that triggered the transition.
 * @param ts             ISO timestamp of the transition.
 * @param error          Error detail (required for `failed` status).
 * @param duration_ms    Elapsed ms (auto-computed if omitted for terminal states).
 */
export function advancePipelineEntity(
  entity:        CommandFilePipelineEntity,
  next_status:   CommandFilePipelineStatus,
  trigger_event: string,
  ts?: string,
  error?: { code: string; message: string },
  duration_ms?: number,
): CommandFilePipelineEntity | null {
  if (!canPipelineTransition(entity.status, next_status)) return null;

  const now = ts ?? new Date().toISOString();

  // Auto-compute duration if reaching a terminal state
  let computed_duration = duration_ms;
  if (
    computed_duration === undefined &&
    TERMINAL_PIPELINE_STATES.has(next_status)
  ) {
    const start = new Date(entity.ts_created).getTime();
    const end   = new Date(now).getTime();
    computed_duration = isNaN(start) || isNaN(end) ? undefined : end - start;
  }

  const next: CommandFilePipelineEntity = {
    command_id:    entity.command_id,
    command_type:  entity.command_type,
    status:        next_status,
    ts_created:    entity.ts_created,
    ts_updated:    now,
    trigger_event,
    ...(error          !== undefined ? { error }        : {}),
    ...(computed_duration !== undefined ? { duration_ms: computed_duration } : {}),
  };

  return Object.freeze(next);
}

// ─────────────────────────────────────────────────────────────────────────────
// Event → status mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps incoming WebSocket event types to the target pipeline status.
 *
 * Events that have no mapping (e.g. pipeline.*, task.*, agent.*) return `null`
 * so the watcher can ignore them without polling every event.
 */
export function mapEventTypeToStatus(
  eventType: string,
): CommandFilePipelineStatus | null {
  switch (eventType) {
    // Orchestrator received + validated the command
    case "command.issued":
    case "command.queued":
      return "accepted";

    // Orchestrator is actively executing
    case "command.acknowledged":
    case "command.dispatched":
      return "executing";

    // Successful completion
    case "command.completed":
      return "completed";

    // Any failure or pre-execution rejection
    case "command.failed":
    case "command.rejected":
    case "command.timeout":
    case "command.cancelled":
      return "failed";

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandFilePipelineWatcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Incoming event envelope from the WebSocket bus.
 *
 * Mirrors the envelope emitted by OrchestratorWSBridge /
 * `window.__conitensEventBus__`.
 */
export interface CommandPipelineEvent {
  type: string;
  payload: Record<string, unknown>;
  ts?: string;
}

/**
 * Callback fired after each state transition.
 *
 * @param entity   The new (post-transition) pipeline entity.
 * @param record   The full transition record written to the internal log.
 */
export type PipelineTransitionCallback = (
  entity: CommandFilePipelineEntity,
  record: PipelineTransitionRecord,
) => void;

/** Maximum transition log entries kept in memory. */
const MAX_TRANSITION_LOG = 500;

/**
 * GUI-side pipeline watcher.
 *
 * Maintains an in-memory index of all known command entities and advances
 * their state as WebSocket events arrive.  The transition log captures every
 * state change for record transparency and replay support.
 *
 * Usage:
 * ```ts
 * const watcher = new CommandFilePipelineWatcher();
 *
 * // Register command immediately after writing the file
 * watcher.registerCommand("cmd_001", "agent.spawn");
 *
 * // Feed incoming WS events
 * watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_001" } });
 * watcher.applyEvent({ type: "command.completed", payload: { command_id: "cmd_001" } });
 *
 * // Query entity state
 * const entity = watcher.getEntity("cmd_001");
 * // entity.status === "completed"
 * ```
 */
export class CommandFilePipelineWatcher {
  /**
   * In-memory index: command_id → current entity.
   * Updated immutably on every `applyEvent()` call.
   */
  private readonly _entities = new Map<string, CommandFilePipelineEntity>();

  /**
   * Append-only transition log (newest last).
   * Evicts oldest entries when `MAX_TRANSITION_LOG` is reached.
   */
  private readonly _log: PipelineTransitionRecord[] = [];

  /**
   * Optional callback invoked after each successful state transition.
   * Used by the React hook to propagate transitions to Zustand stores.
   */
  private _onTransition: PipelineTransitionCallback | null = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a newly-dispatched command in `pending` state.
   *
   * Idempotent: if the command_id already exists the call is silently ignored.
   *
   * @param command_id   Stable command identifier from CommandFile.command_id.
   * @param command_type GUI command type string.
   * @param ts           ISO timestamp; defaults to current time.
   */
  registerCommand(
    command_id:   string,
    command_type: string,
    ts?: string,
  ): CommandFilePipelineEntity {
    const existing = this._entities.get(command_id);
    if (existing) return existing;

    const entity = makePipelineEntity(command_id, command_type, ts);
    this._entities.set(command_id, entity);

    const record: PipelineTransitionRecord = {
      command_id,
      from_status:   null,
      to_status:     "pending",
      trigger_event: "local.registered",
      ts:            entity.ts_created,
    };
    this._appendLog(record);

    return entity;
  }

  /**
   * Apply an incoming WebSocket event to the matching command entity.
   *
   * Steps:
   *   1. Extract `command_id` from the payload.
   *   2. Map `event.type` → target pipeline status.
   *   3. If the transition is valid, produce a new entity and fire the callback.
   *   4. Append a transition record to the internal log.
   *
   * @returns The updated entity, or `null` if the event was ignored
   *          (unknown command, invalid transition, or non-command event type).
   */
  applyEvent(event: CommandPipelineEvent): CommandFilePipelineEntity | null {
    const target_status = mapEventTypeToStatus(event.type);
    if (!target_status) return null;

    const command_id = event.payload["command_id"] as string | undefined;
    if (!command_id) return null;

    const existing = this._entities.get(command_id);
    if (!existing) {
      // Orchestrator event for a command not registered locally.
      // Create a minimal entity in the current state to allow tracking.
      const command_type =
        (event.payload["command_type"] as string | undefined) ?? "unknown";
      const autoEntity = this.registerCommand(command_id, command_type, event.ts);
      // Now apply the actual transition if it's valid from pending
      return this._applyTransition(autoEntity, target_status, event);
    }

    return this._applyTransition(existing, target_status, event);
  }

  /**
   * Get the current entity for a command, or `undefined` if not known.
   */
  getEntity(command_id: string): CommandFilePipelineEntity | undefined {
    return this._entities.get(command_id);
  }

  /**
   * Return all tracked entities as an array (unordered).
   */
  getAllEntities(): CommandFilePipelineEntity[] {
    return Array.from(this._entities.values());
  }

  /**
   * Return entities filtered by status.
   */
  getEntitiesByStatus(
    status: CommandFilePipelineStatus,
  ): CommandFilePipelineEntity[] {
    return this.getAllEntities().filter((e) => e.status === status);
  }

  /**
   * Return the full transition log (oldest first), up to `limit` entries.
   */
  getTransitionLog(limit?: number): PipelineTransitionRecord[] {
    const log = [...this._log];
    return limit !== undefined ? log.slice(-limit) : log;
  }

  /**
   * Subscribe to post-transition events.
   *
   * Only one subscriber is supported (last registration wins).
   * Pass `null` to unsubscribe.
   */
  setOnTransition(callback: PipelineTransitionCallback | null): void {
    this._onTransition = callback;
  }

  /**
   * Reset all entity state and the transition log.
   * For testing / replay reset purposes only.
   */
  reset(): void {
    this._entities.clear();
    this._log.length = 0;
    this._onTransition = null;
  }

  /**
   * Return the number of tracked commands (active + terminal).
   */
  get size(): number {
    return this._entities.size;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _applyTransition(
    entity:        CommandFilePipelineEntity,
    target_status: CommandFilePipelineStatus,
    event:         CommandPipelineEvent,
  ): CommandFilePipelineEntity | null {
    // Extract error details for failure events
    let error: { code: string; message: string } | undefined;
    if (target_status === "failed") {
      const errCode = (
        (event.payload["error_code"] as string | undefined) ??
        (event.payload["rejection_code"] as string | undefined)
      );
      const errMsg = (
        (event.payload["error_message"] as string | undefined) ??
        (event.payload["rejection_reason"] as string | undefined) ??
        errCode
      );
      if (errCode) {
        error = { code: errCode, message: errMsg ?? errCode };
      }
    }

    const duration_ms = event.payload["duration_ms"] as number | undefined;

    const updated = advancePipelineEntity(
      entity,
      target_status,
      event.type,
      event.ts,
      error,
      duration_ms,
    );

    if (!updated) {
      // Invalid transition — skip silently (keeps watcher running)
      return null;
    }

    this._entities.set(entity.command_id, updated);

    const record: PipelineTransitionRecord = {
      command_id:    entity.command_id,
      from_status:   entity.status,
      to_status:     target_status,
      trigger_event: event.type,
      ts:            updated.ts_updated,
      ...(error ? { error_code: error.code, error_msg: error.message } : {}),
    };
    this._appendLog(record);

    if (this._onTransition) {
      this._onTransition(updated, record);
    }

    return updated;
  }

  private _appendLog(record: PipelineTransitionRecord): void {
    this._log.push(record);
    // Evict oldest if over capacity
    if (this._log.length > MAX_TRANSITION_LOG) {
      this._log.shift();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton factory (for hook usage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fresh `CommandFilePipelineWatcher` instance.
 *
 * The React hook (`use-command-file-pipeline.ts`) holds the watcher in a
 * `useRef` so it is created once per component tree.  Calling this function
 * is not mandatory — callers may construct `CommandFilePipelineWatcher`
 * directly.
 */
export function createCommandFilePipelineWatcher(): CommandFilePipelineWatcher {
  return new CommandFilePipelineWatcher();
}
