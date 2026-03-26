/**
 * @module command-pipeline-reader
 * Sub-AC 8b — Orchestrator pipeline reader with lifecycle state tracking.
 *
 * Purpose
 * ───────
 * CommandPipelineReader wraps the existing CommandWatcher (Sub-AC 8c) and
 * adds explicit lifecycle state tracking for every command that passes
 * through the ingestion pipeline.
 *
 * Lifecycle progression
 * ─────────────────────
 *   pending   → File detected in inbox; extracted command_id, not yet executed.
 *   accepted  → Validation passed; Orchestrator.processCommandData() about to run.
 *   executing → processCommandData() is actively running (event append in flight).
 *   completed → Event appended and reducers run; command successfully processed.
 *   failed    → Processing threw, or Orchestrator emitted a command.failed event.
 *   rejected  → Rejected at the ingestion boundary (parse error / validation
 *               failure / dedupe guard); Orchestrator emitted command.rejected.
 *
 * How state transitions are triggered
 * ─────────────────────────────────────
 * 1. pending   — CommandPipelineReader installs a fast (0 ms debounce) fs.watch
 *                on the commands inbox.  When a new *.json file appears, it
 *                immediately reads the file and extracts the command_id, then
 *                records "pending".  This fires *before* CommandWatcher's 120 ms
 *                debounce timer.
 *
 * 2. accepted  — The CommandWatcher's Orchestrator reference is replaced by an
 *                OrchestratorProxy.  The proxy intercepts processCommandData()
 *                and records "accepted" at the start of each call.
 *
 * 3. executing — Recorded immediately after "accepted" (same tick), before the
 *                await on the real processCommandData().  In the single-threaded
 *                JS event loop these two transitions happen < 1 ms apart, but
 *                both are persisted and represent semantically distinct states
 *                (accepted = validated; executing = in-flight I/O).
 *
 * 4. completed — Recorded by the proxy on successful return from
 *                processCommandData().
 *
 * 5. failed    — Recorded by the proxy when processCommandData() throws, OR
 *                by the CommandWatcher "failed" event handler for
 *                processing_error stage failures.
 *
 * 6. rejected  — Recorded by the proxy when appendRejectionEvent() is called,
 *                AND by the CommandWatcher "failed" event handler for
 *                parse_error / validation_error stage failures.
 *
 * Companion status store
 * ──────────────────────
 * All transitions are persisted to
 *   <conitensDir>/runtime/command-status/status.jsonl
 * which sits in the "view" plane.  The GUI can tail this file or query
 * CommandPipelineReader.statusStore to render live command status.
 *
 * Design constraints
 * ──────────────────
 * - Does NOT duplicate ingestion logic — delegates entirely to CommandWatcher.
 * - Never throws from public methods.
 * - Emits "status-changed" events for real-time GUI consumers.
 * - Write-only event recording (record transparency).
 */

import { watch as fsWatch } from "node:fs";
import { readFile, access } from "node:fs/promises";
import { join, basename } from "node:path";
import { EventEmitter } from "node:events";
import type { ConitensEvent } from "@conitens/protocol";
import { COMMAND_INBOX_DIR } from "@conitens/protocol";
import type { Orchestrator, CommandData } from "../orchestrator/orchestrator.js";
import {
  CommandWatcher,
  type CommandWatcherOptions,
  type CommandProcessedEvent,
  type CommandFailedEvent,
} from "../command-watcher/command-watcher.js";
import {
  CommandStatusStore,
  type CommandLifecycleState,
  type CommandStatusRecord,
} from "./command-status-store.js";
import { annotateCommandFileFromLifecycle } from "./command-file-status-annotator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public event types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emitted by CommandPipelineReader whenever a command advances to a new
 * lifecycle state.  Consumers (e.g. the WebSocket bus, the GUI store) can
 * subscribe to get real-time status updates.
 */
export interface CommandStatusChangedEvent {
  /** The latest status record for this command. */
  record: CommandStatusRecord;
  /** Previous status, if any. */
  previousStatus?: CommandLifecycleState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

export interface CommandPipelineReaderOptions
  extends Omit<CommandWatcherOptions, "orchestrator"> {
  /** The Orchestrator instance to proxy for lifecycle state tracking. */
  orchestrator: Orchestrator;
  /**
   * Absolute path to the `.conitens/` directory.
   * Passed to CommandWatcher AND used to locate the status store.
   */
  conitensDir: string;
  /**
   * If true, open the CommandStatusStore and hydrate from disk on `start()`.
   * Default: true.
   */
  hydrateStatusOnStart?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// OrchestratorProxy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal interface of the Orchestrator methods that CommandWatcher calls.
 * The proxy intercepts these to inject lifecycle-state transitions.
 */
interface OrchestratorLike {
  processCommandData(data: CommandData): Promise<ConitensEvent>;
  appendRejectionEvent(info: {
    file: string;
    reason: string;
    error: string;
    raw_command_id?: string;
  }): Promise<ConitensEvent>;
}

/**
 * Creates a proxy around the real Orchestrator that intercepts
 * `processCommandData` and `appendRejectionEvent` to record lifecycle
 * state transitions in the CommandStatusStore.
 *
 * @param orchestrator  The real Orchestrator instance.
 * @param store         The status store to update.
 * @param onStatus      Callback fired on every status transition.
 */
function createOrchestratorProxy(
  orchestrator: Orchestrator,
  store: CommandStatusStore,
  onStatus: (record: CommandStatusRecord, prev?: CommandLifecycleState) => void,
): OrchestratorLike {
  return {
    // ── processCommandData ────────────────────────────────────────────────────
    async processCommandData(data: CommandData): Promise<ConitensEvent> {
      const commandId = extractCommandId(data);

      // Transitions: accepted → executing (synchronous, same-tick).
      if (commandId) {
        const prevRec = store.getLatest(commandId);
        const prev = prevRec?.status;

        const acceptedRec = await store.recordTransition(commandId, "accepted", {
          command_type: data.payload?._command_type as string | undefined,
          meta: { run_id: data.run_id },
        });
        if (acceptedRec) onStatus(acceptedRec, prev);

        const execRec = await store.recordTransition(commandId, "executing", {
          command_type: data.payload?._command_type as string | undefined,
        });
        if (execRec) onStatus(execRec, "accepted");
      }

      try {
        const event = await orchestrator.processCommandData(data);

        // Determine terminal state from the returned event type.
        const isRejection =
          event.type === "command.rejected" ||
          (typeof event.payload === "object" &&
            event.payload !== null &&
            (event.payload as Record<string, unknown>)["reason"] === "duplicate");

        const terminalState: CommandLifecycleState = isRejection
          ? "rejected"
          : "completed";

        if (commandId) {
          const prevExec = store.getLatest(commandId)?.status ?? "executing";
          const termRec = await store.recordTransition(commandId, terminalState, {
            event_id: event.event_id,
            command_type: data.payload?._command_type as string | undefined,
          });
          if (termRec) onStatus(termRec, prevExec);
        }

        return event;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        if (commandId) {
          const prevState = store.getLatest(commandId)?.status ?? "executing";
          const failedRec = await store.recordTransition(commandId, "failed", {
            command_type: data.payload?._command_type as string | undefined,
            error: error.message,
            error_code: "PROCESSING_ERROR",
          });
          if (failedRec) onStatus(failedRec, prevState);
        }

        throw err; // Re-throw so CommandWatcher can handle it.
      }
    },

    // ── appendRejectionEvent ──────────────────────────────────────────────────
    async appendRejectionEvent(info: {
      file: string;
      reason: string;
      error: string;
      raw_command_id?: string;
    }): Promise<ConitensEvent> {
      const event = await orchestrator.appendRejectionEvent(info);

      const commandId = info.raw_command_id;
      if (commandId) {
        const prevRec = store.getLatest(commandId);
        const prev = prevRec?.status;
        const rejRec = await store.recordTransition(commandId, "rejected", {
          event_id: event.event_id,
          error: info.error,
          error_code: info.reason.toUpperCase(),
          meta: { file: info.file },
        });
        if (rejRec) onStatus(rejRec, prev);
      }

      return event;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the command_id from a CommandData object.
 * The router embeds it as `payload._command_id` and also sets
 * `idempotency_key` to the same value.
 */
function extractCommandId(data: CommandData): string | undefined {
  // Prefer the explicitly set idempotency_key (set by CommandRouter).
  if (typeof data.idempotency_key === "string" && data.idempotency_key.trim()) {
    return data.idempotency_key;
  }
  // Fallback: router embeds it in payload._command_id.
  const id = data.payload?._command_id;
  if (typeof id === "string" && id.trim()) {
    return id;
  }
  return undefined;
}

/**
 * Try to extract the command_id from a raw command file content.
 * Returns undefined if the file cannot be parsed or has no command_id.
 */
function extractCommandIdFromJson(content: string): string | undefined {
  try {
    const obj = JSON.parse(content) as Record<string, unknown>;
    const id = obj["command_id"];
    if (typeof id === "string" && id.trim()) return id;
  } catch {
    // Unparseable — command_id unavailable.
  }
  return undefined;
}

/**
 * Try to extract the command_type from a raw command file content.
 */
function extractCommandTypeFromJson(content: string): string | undefined {
  try {
    const obj = JSON.parse(content) as Record<string, unknown>;
    const t = obj["type"];
    if (typeof t === "string") return t;
  } catch {
    // Ignore.
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandPipelineReader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrator pipeline reader with lifecycle state tracking.
 *
 * Wraps `CommandWatcher` (Sub-AC 8c) and adds:
 *   1. `CommandStatusStore` — persists state transitions to view-plane JSONL.
 *   2. `OrchestratorProxy` — intercepts processCommandData / appendRejectionEvent
 *      to record accepted / executing / completed / failed / rejected states.
 *   3. Pending detection — a separate fast fs.watch records the `pending` state
 *      when a new *.json file first appears in the inbox.
 *   4. `"status-changed"` event — emitted on every state transition for real-time
 *      consumers (e.g. WebSocket bus, Zustand store).
 *
 * Events emitted:
 *   "status-changed"  CommandStatusChangedEvent  — lifecycle state advanced
 *   "started"         void                       — pipeline reader is active
 *   "stopped"         void                       — pipeline reader shut down
 *   "processed"       CommandProcessedEvent      — forwarded from CommandWatcher
 *   "failed"          CommandFailedEvent         — forwarded from CommandWatcher
 */
export class CommandPipelineReader extends EventEmitter {
  /** The underlying CommandWatcher instance (Sub-AC 8c). */
  readonly watcher: CommandWatcher;

  /** The companion status store. */
  readonly statusStore: CommandStatusStore;

  /** Absolute path to the commands inbox directory. */
  readonly commandsDir: string;

  private readonly conitensDir: string;
  private readonly hydrateStatusOnStart: boolean;

  /** Native fs.Watcher for pending-state detection (faster than CommandWatcher's debounce). */
  private pendingWatcher: ReturnType<typeof fsWatch> | null = null;

  /** Set of command_ids already recorded as pending (to avoid duplicates). */
  private readonly pendingRecorded = new Set<string>();

  private _running = false;

  constructor(options: CommandPipelineReaderOptions) {
    super();

    this.conitensDir = options.conitensDir;
    this.commandsDir = join(options.conitensDir, COMMAND_INBOX_DIR);
    this.hydrateStatusOnStart = options.hydrateStatusOnStart ?? true;

    // Create the status store (not yet opened).
    this.statusStore = new CommandStatusStore(options.conitensDir);

    // Create the orchestrator proxy — wraps the real orchestrator to intercept
    // processCommandData() and appendRejectionEvent() for state tracking.
    const proxy = createOrchestratorProxy(
      options.orchestrator,
      this.statusStore,
      this.onStatusChanged.bind(this),
    );

    // Create the CommandWatcher, injecting the proxy as the orchestrator.
    this.watcher = new CommandWatcher({
      ...options,
      orchestrator: proxy as unknown as Orchestrator,
    });

    // Forward CommandWatcher events and add supplemental state recording.
    this.watcher.on("processed", this.onWatcherProcessed.bind(this));
    this.watcher.on("failed", this.onWatcherFailed.bind(this));
    this.watcher.on("started", () => {/* already handled in start() */});
    this.watcher.on("stopped", () => {/* already handled in stop() */});
  }

  /** Whether the pipeline reader is currently active. */
  get running(): boolean {
    return this._running;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Start the pipeline reader:
   *   1. Open the CommandStatusStore (hydrate from disk if enabled).
   *   2. Install the pending-state fs.watch.
   *   3. Start the underlying CommandWatcher.
   *   4. Emit "started".
   */
  async start(): Promise<void> {
    if (this._running) return;
    this._running = true;

    // Open status store (creates directory, hydrates from disk).
    if (!this.statusStore.isOpen) {
      await this.statusStore.open();
    }

    // Install pending-state watcher BEFORE CommandWatcher starts, so that
    // any files already in the inbox are detected as pending before processing.
    this.installPendingWatcher();

    // Scan existing inbox files for pending state.
    await this.scanExistingForPending();

    // Start the underlying CommandWatcher.
    await this.watcher.start();

    this.emit("started");
  }

  /**
   * Stop the pipeline reader and the underlying CommandWatcher.
   */
  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;

    // Remove pending watcher.
    if (this.pendingWatcher) {
      this.pendingWatcher.close();
      this.pendingWatcher = null;
    }

    // Stop the underlying CommandWatcher.
    await this.watcher.stop();

    this.statusStore.close();

    this.emit("stopped");
  }

  // ─── Public query API ────────────────────────────────────────────────────────

  /**
   * Get the current lifecycle state of a command.
   * Returns `undefined` if the command_id is not tracked.
   */
  getCommandStatus(commandId: string): CommandStatusRecord | undefined {
    return this.statusStore.getLatest(commandId);
  }

  /**
   * Get the full transition history for a command.
   * Returns an empty array if the command_id is not tracked.
   */
  getCommandHistory(commandId: string): CommandStatusRecord[] {
    return this.statusStore.getHistory(commandId);
  }

  /**
   * List all tracked commands with their current status.
   */
  listAllCommands(): CommandStatusRecord[] {
    return this.statusStore.listAll();
  }

  /**
   * List commands in a given lifecycle state.
   */
  listCommandsByState(state: CommandLifecycleState): CommandStatusRecord[] {
    return this.statusStore.listByState(state);
  }

  // ─── Internal: pending-state detection ─────────────────────────────────────

  /**
   * Install a fast fs.watch on the commands inbox to detect new files and
   * record their `pending` state before CommandWatcher's debounce fires.
   *
   * Uses 0 ms debounce — we only need to READ the file, not process it.
   */
  private installPendingWatcher(): void {
    try {
      this.pendingWatcher = fsWatch(
        this.commandsDir,
        { persistent: false },
        (_eventType: string, filename: string | null) => {
          if (!filename) return;
          if (!filename.endsWith(".json")) return;
          if (filename.startsWith("archive")) return;

          const filePath = join(this.commandsDir, filename);
          void this.recordPendingFromFile(filePath);
        },
      );

      this.pendingWatcher.on("error", (err: Error) => {
        process.stderr.write(
          `[CommandPipelineReader] Pending watcher error: ${err.message}\n`,
        );
      });
    } catch (err) {
      process.stderr.write(
        `[CommandPipelineReader] Failed to install pending watcher: ${String(err)}\n`,
      );
    }
  }

  /**
   * Scan the inbox for any files that arrived before start() was called,
   * and record them as `pending`.
   */
  private async scanExistingForPending(): Promise<void> {
    const { readdir } = await import("node:fs/promises");
    let entries: string[];
    try {
      entries = await readdir(this.commandsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      process.stderr.write(
        `[CommandPipelineReader] Could not scan inbox: ${String(err)}\n`,
      );
      return;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const filePath = join(this.commandsDir, entry);
      await this.recordPendingFromFile(filePath);
    }
  }

  /**
   * Read a command file and record its command_id as `pending`.
   * Best-effort: any read/parse failure is silently ignored.
   */
  private async recordPendingFromFile(filePath: string): Promise<void> {
    // Guard: add to pendingRecorded BEFORE the first await so that concurrent
    // calls triggered by multiple fs.watch events for the same file are
    // prevented from all passing the guard simultaneously (JavaScript is
    // single-threaded, so this synchronous assignment is safe here).
    const fname = basename(filePath);
    if (this.pendingRecorded.has(fname)) return;
    this.pendingRecorded.add(fname); // Set BEFORE any await to prevent re-entry.

    try {
      // Check the file exists (may have been processed already).
      await access(filePath);

      const content = await readFile(filePath, "utf-8");
      if (!content.trim()) return;

      const commandId = extractCommandIdFromJson(content);
      if (!commandId) return;

      // Only record pending if we haven't seen this command_id yet.
      const existing = this.statusStore.getLatest(commandId);
      if (existing) return; // Already tracked.

      const commandType = extractCommandTypeFromJson(content);
      const rec = await this.statusStore.recordTransition(commandId, "pending", {
        ...(commandType ? { command_type: commandType } : {}),
        meta: { file: fname },
      });
      if (rec) this.onStatusChanged(rec, undefined);
    } catch {
      // Best-effort — file may be mid-write or already archived.
    }
  }

  // ─── Internal: CommandWatcher event handlers ────────────────────────────────

  /**
   * Forward the CommandWatcher "processed" event and annotate the archive file
   * with the command's final lifecycle status (Sub-AC 8.2: persists state
   * updates back to the command-files).
   *
   * The proxy has already recorded the terminal state in the StatusStore by the
   * time this handler fires (processCommandData() completes before archiving).
   * We use the commandId extracted from the archive file to look up the final
   * status and write it back to the archive JSON.
   */
  private onWatcherProcessed(evt: CommandProcessedEvent): void {
    this.emit("processed", evt);

    // Annotate the archive file with the final lifecycle status.
    if (evt.archivePath) {
      void this.annotateArchiveWithFinalStatus(evt.archivePath);
    }
  }

  /**
   * Reads the archive file to extract the command_id, looks up the final
   * lifecycle state from the StatusStore, and writes the corresponding
   * CommandFileStatus back into the archive JSON.
   *
   * Best-effort: any failure is logged to stderr but never rethrown.
   */
  private async annotateArchiveWithFinalStatus(archivePath: string): Promise<void> {
    try {
      const content = await readFile(archivePath, "utf-8").catch(() => null);
      if (!content) return;

      const commandId = extractCommandIdFromJson(content);
      if (!commandId) return;

      const record = this.statusStore.getLatest(commandId);
      if (!record) return;

      // Only annotate with terminal states; intermediate states are tracked
      // in the StatusStore but not written into the command file.
      await annotateCommandFileFromLifecycle(archivePath, record.status);
    } catch {
      // Best-effort — annotation is supplementary, not critical-path.
    }
  }

  /**
   * Forward the CommandWatcher "failed" event and record the appropriate
   * terminal state (parse_error / validation_error → rejected; processing_error → failed).
   */
  private onWatcherFailed(evt: CommandFailedEvent): void {
    this.emit("failed", evt);

    // Extract command_id from the archive path filename (best-effort).
    // The archive path is like `.../archive/2026-01-01T12-00-00-000_gui_cmd_01ABCD.json`
    // so we need to inspect the original commandPath for the command_id.
    void this.recordTerminalFromFailedEvent(evt);
  }

  /**
   * For failed events that involve a known command_id (e.g. validation errors
   * where the command_id is still readable), record the terminal state and
   * annotate the archive file with the final status (Sub-AC 8.2).
   */
  private async recordTerminalFromFailedEvent(
    evt: CommandFailedEvent,
  ): Promise<void> {
    try {
      // Try to read the archived file to get the command_id.
      // The original file is already gone, but the archive path may be available.
      const archivePath = evt.archivePath;
      if (!archivePath) return;

      const content = await readFile(archivePath, "utf-8").catch(() => null);
      if (!content) return;

      const commandId = extractCommandIdFromJson(content);
      if (!commandId) return;

      // Check if the command is already in a terminal state (set by proxy).
      const existing = this.statusStore.getLatest(commandId);
      if (existing && ["completed", "failed", "rejected"].includes(existing.status)) {
        // Already terminal — but still annotate the archive file if not yet done.
        // Sub-AC 8.2: persists state updates back to the command-files.
        await annotateCommandFileFromLifecycle(archivePath, existing.status);
        return;
      }

      const terminalState: CommandLifecycleState =
        evt.stage === "parse_error" || evt.stage === "validation_error"
          ? "rejected"
          : "failed";

      const prev = existing?.status;
      const rec = await this.statusStore.recordTransition(commandId, terminalState, {
        error: evt.error.message,
        error_code: evt.stage.toUpperCase(),
        meta: { stage: evt.stage, archive: archivePath },
      });
      if (rec) {
        this.onStatusChanged(rec, prev);
        // Sub-AC 8.2: persist the terminal state back to the archived command file.
        await annotateCommandFileFromLifecycle(archivePath, terminalState);
      }
    } catch {
      // Best-effort.
    }
  }

  // ─── Internal: status-changed propagation ──────────────────────────────────

  /**
   * Called by the OrchestratorProxy (and internally) on every status transition.
   * Emits "status-changed" for real-time consumers.
   */
  private onStatusChanged(
    record: CommandStatusRecord,
    previousStatus?: CommandLifecycleState,
  ): void {
    this.emit("status-changed", {
      record,
      previousStatus,
    } satisfies CommandStatusChangedEvent);
  }
}
