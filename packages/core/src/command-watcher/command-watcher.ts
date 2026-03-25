/**
 * @module command-watcher
 * Sub-AC 8c — Orchestrator-side file-watcher and ingestion handler.
 *
 * Architecture
 * ────────────
 * CommandWatcher monitors the `.conitens/commands/` inbox for new *.json
 * files, validates them against the CommandFile schema, routes them to the
 * appropriate pipeline stage, and archives every processed file (success or
 * failure) to `.conitens/commands/archive/`.
 *
 * Integration with the existing Orchestrator
 * ───────────────────────────────────────────
 * The existing `Orchestrator.processCommand(path)` handles the core pipeline
 * (read → parse → validate → dedupe → redact → append → reduce → delete).
 * CommandWatcher wraps that method with:
 *   1. File-system watching via Node.js `fs.watch` with debounce
 *   2. Pre-ingestion validation using `validateCommandFile()`
 *   3. Routing classification (`routeCommandFile()`)
 *   4. Archiving of processed files (`archiveCommandFile()`)
 *   5. Crash-recovery: processes any pre-existing *.json files on `start()`
 *
 * Design constraints
 * ──────────────────
 * - No external dependencies (uses Node.js built-in `fs.watch`)
 * - Platform-portable (Windows / Linux / macOS)
 * - Write-only event recording (record transparency)
 * - Never throws from public methods — all errors are emitted as events or
 *   logged to stderr; the watcher must keep running despite individual failures
 */

import { watch as fsWatch } from "node:fs";
import { readdir, access, mkdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { EventEmitter } from "node:events";
import type { ConitensEvent } from "@conitens/protocol";
import { COMMAND_INBOX_DIR } from "@conitens/protocol";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import { archiveCommandFile, safeArchiveCommandFile } from "./command-archive.js";
import { validateCommandFile } from "./command-validator.js";
import { routeCommandFile } from "./command-router.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public API types
// ─────────────────────────────────────────────────────────────────────────────

export interface CommandWatcherOptions {
  /**
   * Absolute path to the `.conitens/` directory.
   * The watcher monitors `<conitensDir>/commands/` for *.json files.
   */
  conitensDir: string;

  /** The Orchestrator instance that processes ingested commands. */
  orchestrator: Orchestrator;

  /**
   * Debounce delay (ms) between a filesystem `change` event and processing
   * the file.  Gives the writer time to flush the file before we read it.
   * Default: 120 ms.
   */
  debounceMs?: number;

  /**
   * Maximum number of retries for a file that is still being written
   * (read returns empty content). Default: 5.
   */
  maxReadRetries?: number;

  /**
   * Retry delay between read attempts when the file is still empty.
   * Default: 100 ms.
   */
  retryDelayMs?: number;

  /**
   * If true, process any *.json files already present in the inbox when
   * `start()` is called (crash-recovery). Default: true.
   */
  processExistingOnStart?: boolean;
}

/** Emitted after a command file is successfully ingested. */
export interface CommandProcessedEvent {
  commandPath: string;
  archivePath: string | null;
  event: ConitensEvent;
  guiCommandType?: string;
  stage: "orchestrator" | "navigation";
  durationMs: number;
}

/** Emitted when a command file fails ingestion. */
export interface CommandFailedEvent {
  commandPath: string;
  archivePath: string | null;
  error: Error;
  stage: "parse_error" | "validation_error" | "processing_error";
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandWatcher class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Watches the `.conitens/commands/` inbox and drives the full command
 * ingestion pipeline (validate → route → process → archive).
 *
 * Emits:
 *   "processed"  CommandProcessedEvent — command successfully ingested
 *   "failed"     CommandFailedEvent    — command failed (archived with error info)
 *   "started"    void                  — watcher loop is active
 *   "stopped"    void                  — watcher has shut down cleanly
 */
export class CommandWatcher extends EventEmitter {
  readonly commandsDir: string;
  readonly archiveDir: string;

  private readonly orchestrator: Orchestrator;
  private readonly debounceMs: number;
  private readonly maxReadRetries: number;
  private readonly retryDelayMs: number;
  private readonly processExistingOnStart: boolean;

  /** Files currently scheduled for processing (debounce timers). */
  private readonly pendingFiles = new Map<string, ReturnType<typeof setTimeout>>();

  /** Files currently being processed (to avoid duplicate concurrent runs). */
  private readonly inFlightFiles = new Set<string>();

  /** Native fs.Watcher handle. */
  private fsWatcher: ReturnType<typeof fsWatch> | null = null;

  private _running = false;

  constructor(options: CommandWatcherOptions) {
    super();
    this.commandsDir = join(options.conitensDir, COMMAND_INBOX_DIR);
    this.archiveDir = join(this.commandsDir, "archive");
    this.orchestrator = options.orchestrator;
    this.debounceMs = options.debounceMs ?? 120;
    this.maxReadRetries = options.maxReadRetries ?? 5;
    this.retryDelayMs = options.retryDelayMs ?? 100;
    this.processExistingOnStart = options.processExistingOnStart ?? true;
  }

  /** Whether the watcher is currently active. */
  get running(): boolean {
    return this._running;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Start watching the commands inbox.
   *
   * - Creates the inbox and archive directories if they do not exist.
   * - Optionally processes pre-existing *.json files (crash recovery).
   * - Installs a native `fs.watch` listener for new files.
   */
  async start(): Promise<void> {
    if (this._running) return;
    this._running = true;

    // Ensure directories exist.
    await mkdir(this.commandsDir, { recursive: true });
    await mkdir(this.archiveDir, { recursive: true });

    // Crash recovery: process files that arrived while the server was offline.
    if (this.processExistingOnStart) {
      await this.processExistingFiles();
    }

    // Install native watcher.
    this.installFsWatcher();

    this.emit("started");
  }

  /**
   * Stop watching and cancel all pending timers.
   * In-flight processing is NOT cancelled — those will complete normally.
   */
  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;

    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }

    // Cancel all debounce timers.
    for (const timer of this.pendingFiles.values()) {
      clearTimeout(timer);
    }
    this.pendingFiles.clear();

    this.emit("stopped");
  }

  // ─── Internal: fs.watch integration ────────────────────────────────────────

  private installFsWatcher(): void {
    try {
      this.fsWatcher = fsWatch(
        this.commandsDir,
        { persistent: false },
        (eventType: string, filename: string | null) => {
          if (!filename) return;
          // Only process *.json files, skip archive subdir entries.
          if (!filename.endsWith(".json")) return;
          if (filename.startsWith("archive")) return;

          const filePath = join(this.commandsDir, filename);
          this.scheduleProcess(filePath);
        },
      );

      this.fsWatcher.on("error", (err: Error) => {
        // Log but do not crash — watcher errors are usually transient.
        process.stderr.write(`[CommandWatcher] fs.watch error: ${err.message}\n`);
      });
    } catch (err) {
      // If the directory doesn't exist or can't be watched, log and continue.
      process.stderr.write(
        `[CommandWatcher] Failed to install watcher on ${this.commandsDir}: ${String(err)}\n`,
      );
    }
  }

  // ─── Internal: debounce + dispatch ─────────────────────────────────────────

  /**
   * Schedule processing of a file after the debounce delay.
   * Re-schedules if a timer is already pending (writer still flushing).
   */
  private scheduleProcess(filePath: string): void {
    // Cancel any existing timer.
    const existing = this.pendingFiles.get(filePath);
    if (existing !== undefined) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.pendingFiles.delete(filePath);
      // Don't start a second concurrent processing of the same file.
      if (this.inFlightFiles.has(filePath)) return;
      void this.processFile(filePath);
    }, this.debounceMs);

    this.pendingFiles.set(filePath, timer);
  }

  // ─── Internal: crash recovery ───────────────────────────────────────────────

  /**
   * Process any *.json files already in the inbox at startup.
   * Files inside the `archive/` subdir are skipped.
   */
  private async processExistingFiles(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.commandsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      // Skip archive dir itself (shouldn't be a .json file, but be safe).
      const filePath = join(this.commandsDir, entry);
      await this.processFile(filePath);
    }
  }

  // ─── Internal: full ingestion pipeline ─────────────────────────────────────

  /**
   * Full ingestion pipeline for a single command file:
   *   1. Check file still exists (may have been processed already)
   *   2. Read with retry (wait for writer to finish flushing)
   *   3. Parse JSON
   *   4. Validate against CommandFile schema
   *   5. Route to pipeline stage
   *   6. Delegate to Orchestrator.processCommandData()
   *   7. Archive processed file
   *   8. Emit "processed" or "failed"
   */
  private async processFile(filePath: string): Promise<void> {
    if (this.inFlightFiles.has(filePath)) return;
    this.inFlightFiles.add(filePath);

    const t0 = Date.now();
    let archivePath: string | null = null;

    try {
      // 1. Check file still exists.
      try {
        await access(filePath);
      } catch {
        // Already processed or deleted by another handler — skip silently.
        return;
      }

      // 2. Read with retry (wait for incomplete writes).
      const content = await this.readWithRetry(filePath);
      if (content === null) {
        // File vanished before we could read it — skip.
        return;
      }

      // 3. Parse JSON.
      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch (parseErr) {
        const err = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
        // Archive the unparseable file and emit failure.
        archivePath = await safeArchiveCommandFile(filePath, this.commandsDir);
        // Record a rejection event.
        await this.appendRejection(filePath, "parse_error", err.message);
        this.emit("failed", {
          commandPath: filePath,
          archivePath,
          error: err,
          stage: "parse_error",
        } satisfies CommandFailedEvent);
        return;
      }

      // 4. Validate CommandFile schema.
      const validation = validateCommandFile(raw, basename(filePath));
      if (!validation.valid) {
        const errMsg = validation.errors.map((e) => e.message).join("; ");
        const err = new Error(`Validation failed: ${errMsg}`);
        archivePath = await safeArchiveCommandFile(filePath, this.commandsDir);
        await this.appendRejection(filePath, "validation_error", errMsg, raw);
        this.emit("failed", {
          commandPath: filePath,
          archivePath,
          error: err,
          stage: "validation_error",
        } satisfies CommandFailedEvent);
        return;
      }

      // 5. Route to pipeline stage.
      const routed = routeCommandFile(validation.command);

      // 6. Delegate to Orchestrator.
      //    We call processCommandData() which runs the core pipeline
      //    (dedupe → redact → append → reduce) WITHOUT deleting the file
      //    (deletion/archiving is our responsibility here).
      const event = await this.orchestrator.processCommandData(routed.commandData);

      // 7. Archive the processed file.
      archivePath = await safeArchiveCommandFile(filePath, this.commandsDir);

      // 8. Emit success event.
      this.emit("processed", {
        commandPath: filePath,
        archivePath,
        event,
        guiCommandType: routed.guiCommandType,
        stage: routed.stage,
        durationMs: Date.now() - t0,
      } satisfies CommandProcessedEvent);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Archive on error so the inbox doesn't stall.
      if (!archivePath) {
        archivePath = await safeArchiveCommandFile(filePath, this.commandsDir);
      }
      this.emit("failed", {
        commandPath: filePath,
        archivePath,
        error,
        stage: "processing_error",
      } satisfies CommandFailedEvent);
    } finally {
      this.inFlightFiles.delete(filePath);
    }
  }

  // ─── Internal: read with retry ──────────────────────────────────────────────

  /**
   * Read a file's content, retrying if it is empty (still being written).
   * Returns `null` if the file disappears before we can read it.
   */
  private async readWithRetry(filePath: string): Promise<string | null> {
    for (let attempt = 0; attempt <= this.maxReadRetries; attempt++) {
      try {
        const content = await readFile(filePath, "utf-8");
        if (content.trim().length > 0) return content;
        // File is empty — wait and retry.
        if (attempt < this.maxReadRetries) {
          await sleep(this.retryDelayMs);
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    }

    // Still empty after all retries — treat as gone.
    return null;
  }

  // ─── Internal: rejection event helper ──────────────────────────────────────

  private async appendRejection(
    filePath: string,
    reason: string,
    errorMsg: string,
    raw?: unknown,
  ): Promise<void> {
    try {
      await this.orchestrator.appendRejectionEvent({
        file: basename(filePath),
        reason,
        error: errorMsg,
        raw_command_id:
          raw &&
          typeof raw === "object" &&
          typeof (raw as Record<string, unknown>)["command_id"] === "string"
            ? (raw as Record<string, unknown>)["command_id"] as string
            : undefined,
      });
    } catch {
      // If this fails, the original error is more important — swallow this.
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
