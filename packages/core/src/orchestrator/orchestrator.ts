/**
 * @module orchestrator
 * RFC-1.0.1 §10 — Command ingest → validate → redact → dedupe → append → reduce → delete.
 */

import { readFile, unlink } from "node:fs/promises";
import { basename } from "node:path";
import type { ConitensEvent, EventType } from "@conitens/protocol";
import { isValidEventType, redactPayload } from "@conitens/protocol";
import { EventLog } from "../event-log/event-log.js";
import type { BaseReducer } from "../reducers/base-reducer.js";

export interface CommandData {
  type: EventType;
  task_id?: string;
  run_id: string;
  actor: { kind: "user" | "agent" | "system" | "channel"; id: string };
  payload: Record<string, unknown>;
  idempotency_key?: string;
}

export class Orchestrator {
  private readonly eventLog: EventLog;
  private readonly conitensDir: string;
  private readonly reducers: BaseReducer[];
  private readonly processedKeys = new Set<string>();

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
          error: String(err),
        },
      });
      await this.safeDelete(commandPath);
      await this.runReducers(rejectionEvent);
      return rejectionEvent;
    }

    // 2. Validate event type
    if (!isValidEventType(commandData.type)) {
      const rejectionEvent = await this.eventLog.append({
        type: "command.rejected",
        run_id: commandData.run_id,
        actor: commandData.actor,
        payload: {
          reason: "invalid_event_type",
          attempted_type: commandData.type,
          file: basename(commandPath),
        },
      });
      await this.safeDelete(commandPath);
      await this.runReducers(rejectionEvent);
      return rejectionEvent;
    }

    // 3. Dedupe check (§14)
    if (commandData.idempotency_key) {
      if (this.processedKeys.has(commandData.idempotency_key)) {
        const rejectionEvent = await this.eventLog.append({
          type: "command.rejected",
          run_id: commandData.run_id,
          actor: commandData.actor,
          payload: {
            reason: "duplicate",
            idempotency_key: commandData.idempotency_key,
            file: basename(commandPath),
          },
        });
        await this.safeDelete(commandPath);
        await this.runReducers(rejectionEvent);
        return rejectionEvent;
      }
      this.processedKeys.add(commandData.idempotency_key);
    }

    // 4. Redaction (§13, I-6) — MUST happen before event append
    const { payload: redactedPayload, redacted, redacted_fields } =
      redactPayload(commandData.payload);

    // 5. Append event (I-1: commit point)
    const event = await this.eventLog.append({
      type: commandData.type,
      run_id: commandData.run_id,
      task_id: commandData.task_id,
      actor: commandData.actor,
      payload: redactedPayload,
      idempotency_key: commandData.idempotency_key,
      ...(redacted ? { redacted, redacted_fields } : {}),
    });

    // 6. Run matching reducers
    await this.runReducers(event);

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

  /** Clear dedupe cache (for testing). */
  clearDedupeCache(): void {
    this.processedKeys.clear();
  }
}
