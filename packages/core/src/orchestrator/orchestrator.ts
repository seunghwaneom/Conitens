/**
 * @module orchestrator
 * RFC-1.0.1 §10 — Command ingest → validate → redact → dedupe → append → reduce → delete.
 */

import { readFile, unlink } from "node:fs/promises";
import { basename } from "node:path";
import type { Actor, ConitensEvent, EventType } from "@conitens/protocol";
import { isValidEventType, redactPayload } from "@conitens/protocol";
import { EventLog } from "../event-log/event-log.js";
import type { BaseReducer } from "../reducers/base-reducer.js";

export interface CommandData {
  type: EventType;
  task_id?: string;
  run_id: string;
  actor: Actor;
  payload: Record<string, unknown>;
  idempotency_key?: string;
}

export class Orchestrator {
  private readonly eventLog: EventLog;
  private readonly conitensDir: string;
  private readonly reducers: BaseReducer[];
  /** Dedupe store with TTL (24h) and size cap (10,000) to prevent OOM. */
  private readonly processedKeys = new Map<string, number>();
  private static readonly DEDUPE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly DEDUPE_MAX_SIZE = 10_000;

  constructor(options: {
    eventLog: EventLog;
    conitensDir: string;
    reducers: BaseReducer[];
  }) {
    this.eventLog = options.eventLog;
    this.conitensDir = options.conitensDir;
    this.reducers = options.reducers;
  }

  /**
   * Process a single command file.
   * Flow: read → validate → dedupe → redact → append → reduce → delete
   */
  async processCommand(commandPath: string): Promise<ConitensEvent> {
    let commandData: CommandData;

    // 1. Read and parse command file
    try {
      const content = await readFile(commandPath, "utf-8");
      commandData = this.parseCommand(content);
    } catch (err) {
      // Invalid command — generate rejection event and delete
      const rejectionEvent = await this.eventLog.append({
        type: "command.rejected",
        run_id: "system",
        actor: { kind: "system", id: "orchestrator" },
        payload: {
          reason: "parse_error",
          file: basename(commandPath),
          error: err instanceof Error ? err.message : "Unknown parse error",
        },
      });
      await this.safeDelete(commandPath);
      await this.runReducers(rejectionEvent);
      return rejectionEvent;
    }

    // 2-6. Shared pipeline: validate → dedupe → redact → append → reduce
    const event = await this._executePipeline(commandData, {
      file: basename(commandPath),
    });

    // 7. Delete command file (§8) — always, in all code paths
    await this.safeDelete(commandPath);

    return event;
  }

  /**
   * Parse command file content.
   * Supports JSON format and frontmatter (---\nkey: value\n---\nbody).
   */
  private parseCommand(content: string): CommandData {
    const trimmed = content.trim();

    // Try JSON first
    if (trimmed.startsWith("{")) {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      if (!data["type"] || !data["run_id"] || !data["actor"]) {
        throw new Error("Command missing required fields: type, run_id, actor");
      }
      return {
        type: data["type"] as EventType,
        task_id: data["task_id"] as string | undefined,
        run_id: data["run_id"] as string,
        actor: data["actor"] as CommandData["actor"],
        payload: (data["payload"] as Record<string, unknown>) ?? {},
        idempotency_key: data["idempotency_key"] as string | undefined,
      };
    }

    // Try frontmatter-style (---\nkey: value\n---\nbody)
    const fmMatch = trimmed.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (fmMatch) {
      const meta: Record<string, string> = {};
      for (const line of fmMatch[1].split("\n")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
        }
      }

      if (!meta["type"] || !meta["run_id"] || !meta["actor_kind"] || !meta["actor_id"]) {
        throw new Error("Frontmatter missing required fields: type, run_id, actor_kind, actor_id");
      }

      return {
        type: meta["type"] as EventType,
        task_id: meta["task_id"],
        run_id: meta["run_id"],
        actor: {
          kind: meta["actor_kind"] as CommandData["actor"]["kind"],
          id: meta["actor_id"],
        },
        payload: { body: fmMatch[2].trim() },
        idempotency_key: meta["idempotency_key"],
      };
    }

    throw new Error("Unrecognized command format (expected JSON or frontmatter)");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-AC 8c: CommandWatcher integration API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process a pre-validated, pre-parsed `CommandData` object through the
   * core pipeline: dedupe → redact → append event → run reducers.
   *
   * Unlike `processCommand()`, this method does NOT perform file I/O — the
   * caller (CommandWatcher) is responsible for reading the command file and
   * archiving / deleting it afterwards.  This separation allows the watcher
   * to own the file lifecycle while delegating state mutation to the
   * Orchestrator.
   *
   * @param commandData  Pre-validated command data (from CommandRouter).
   * @returns            The appended ConitensEvent.
   */
  async processCommandData(commandData: CommandData): Promise<ConitensEvent> {
    return this._executePipeline(commandData);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shared pipeline: validate → dedupe → redact → append → reduce
  // Used by both processCommand() and processCommandData() to avoid DRY violation.
  // ─────────────────────────────────────────────────────────────────────────

  private async _executePipeline(
    commandData: CommandData,
    extraPayload?: Record<string, unknown>,
  ): Promise<ConitensEvent> {
    // 1. Validate event type
    if (!isValidEventType(commandData.type)) {
      const rejectionEvent = await this.eventLog.append({
        type: "command.rejected",
        run_id: commandData.run_id,
        actor: commandData.actor,
        payload: {
          reason: "invalid_event_type",
          attempted_type: commandData.type,
          ...extraPayload,
        },
      });
      await this.runReducers(rejectionEvent);
      return rejectionEvent;
    }

    // 2. Dedupe check (§14)
    if (commandData.idempotency_key) {
      if (this.isDuplicate(commandData.idempotency_key)) {
        const rejectionEvent = await this.eventLog.append({
          type: "command.rejected",
          run_id: commandData.run_id,
          actor: commandData.actor,
          payload: {
            reason: "duplicate",
            idempotency_key: commandData.idempotency_key,
            ...extraPayload,
          },
        });
        await this.runReducers(rejectionEvent);
        return rejectionEvent;
      }
      this.dedupeRecord(commandData.idempotency_key);
    }

    // 3. Redaction (§13, I-6) — MUST happen before event append
    const { payload: redactedPayload, redacted, redacted_fields } =
      redactPayload(commandData.payload);

    // 4. Append event (I-1: commit point)
    const event = await this.eventLog.append({
      type: commandData.type,
      run_id: commandData.run_id,
      task_id: commandData.task_id,
      actor: commandData.actor,
      payload: redactedPayload,
      idempotency_key: commandData.idempotency_key,
      ...(redacted ? { redacted, redacted_fields } : {}),
    });

    // 5. Run matching reducers
    await this.runReducers(event);

    return event;
  }

  /**
   * Append a `command.rejected` event to the event log.
   * Used by CommandWatcher to record parse / validation failures without
   * going through the full pipeline.
   *
   * @param info  Rejection details (file, reason, error message, etc.).
   * @returns     The appended ConitensEvent.
   */
  async appendRejectionEvent(info: {
    file: string;
    reason: string;
    error: string;
    raw_command_id?: string;
  }): Promise<ConitensEvent> {
    // I-6: redaction MUST happen before event append — error messages may
    // contain API keys, Bearer tokens, or connection strings from failed parses.
    const rawPayload = {
      reason: info.reason,
      file: info.file,
      error: info.error,
      ...(info.raw_command_id ? { command_id: info.raw_command_id } : {}),
    };
    const { payload: redactedPayload, redacted, redacted_fields } =
      redactPayload(rawPayload);

    const event = await this.eventLog.append({
      type: "command.rejected",
      run_id: "system",
      actor: { kind: "system", id: "orchestrator" },
      payload: redactedPayload,
      ...(redacted ? { redacted, redacted_fields } : {}),
    });
    await this.runReducers(event);
    return event;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Run all matching reducers for an event.
   */
  private async runReducers(event: ConitensEvent): Promise<void> {
    for (const reducer of this.reducers) {
      if (reducer.inputEvents === "*" || reducer.inputEvents.includes(event.type)) {
        await reducer.reduce(event, this.conitensDir);
      }
    }
  }

  /**
   * Safely delete a command file (best-effort, never throws).
   */
  private async safeDelete(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch {
      // File may already be deleted — ignore
    }
  }

  /** Check if an idempotency key is a duplicate (with TTL expiry). */
  private isDuplicate(key: string): boolean {
    const ts = this.processedKeys.get(key);
    if (ts === undefined) return false;
    if (Date.now() - ts > Orchestrator.DEDUPE_TTL_MS) {
      this.processedKeys.delete(key);
      return false;
    }
    return true;
  }

  /** Record an idempotency key with timestamp; evict oldest if over cap. */
  private dedupeRecord(key: string): void {
    this.processedKeys.set(key, Date.now());
    if (this.processedKeys.size > Orchestrator.DEDUPE_MAX_SIZE) {
      // Evict oldest entry (Map iteration order is insertion order)
      const oldest = this.processedKeys.keys().next().value;
      if (oldest !== undefined) this.processedKeys.delete(oldest);
    }
  }

  /** Clear dedupe cache (for testing). */
  clearDedupeCache(): void {
    this.processedKeys.clear();
  }
}
