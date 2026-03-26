/**
 * command-entity.ts — Sub-AC 8.1: Command entity creation.
 *
 * Purpose
 * ───────
 * Defines the **CommandEntity** — the canonical record produced when a user
 * action occurs in the 3D command-center.  A CommandEntity captures:
 *
 *   • command_id       — globally unique identifier (ULID-based, `cmd_<26>`).
 *   • source_entity_id — the 3D world entity (agent, room, building, task)
 *                        whose affordance the user interacted with.
 *   • action_type      — the GUI command type (e.g. "agent.spawn", "task.cancel").
 *   • payload          — command-specific structured data.
 *   • lifecycle_state  — always `"pending"` at creation; transitions are driven
 *                        by Orchestrator WebSocket events.
 *
 * Architecture
 * ────────────
 *  1. `createCommandEntity(opts)` — factory that produces an immutable entity
 *     with `lifecycle_state: "pending"` and a generated `command_id`.
 *  2. `serializeCommandEntity(entity)` — maps the entity to a `CommandFile`
 *     envelope (the on-disk / over-wire format).
 *  3. `writeCommandEntityToInbox(entity)` — POSTs the serialised command file
 *     to the Orchestrator HTTP endpoint (`POST /api/commands`), which writes
 *     it atomically to the pipeline entity's input directory (`.conitens/commands/`).
 *
 * Record transparency
 * ───────────────────
 * • Every entity is frozen (`Object.freeze`) — immutable after creation.
 * • `source_entity_id` is forwarded to the `CommandFile.causation_id` field so
 *   the Orchestrator audit trail preserves which 3D entity triggered the command.
 * • The initial `lifecycle_state: "pending"` matches `CommandFile.status: "pending"`,
 *   satisfying the write-only inbox contract: the GUI always writes `pending`; the
 *   Orchestrator drives subsequent transitions via event-log events.
 *
 * Pure TypeScript — no React, Three.js, or browser-DOM dependencies.
 * Testable in Node.js without a browser context.
 */

import {
  COMMAND_FILE_PREFIX,
  DEFAULT_GUI_ACTOR,
  COMMAND_FILE_INITIAL_STATUS,
  SCHEMA_VERSION,
  isGuiCommandType,
  type CommandFile,
  type GuiCommandType,
} from "@conitens/protocol";

// ─────────────────────────────────────────────────────────────────────────────
// ULID-compatible command ID generator (no external dep)
// ─────────────────────────────────────────────────────────────────────────────

/** Crockford Base32 alphabet used for ULID encoding. */
const ULID_ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Generate a ULID-compatible `cmd_<26-char>` identifier.
 * Format: 10-char time prefix (ms epoch) + 16-char random suffix.
 * Monotonically increasing within the same millisecond (probabilistically).
 */
export function generateCommandEntityId(): string {
  const now = Date.now();
  const chars: string[] = new Array(26);
  // 10-char time component
  let t = now;
  for (let i = 9; i >= 0; i--) {
    chars[i] = ULID_ENCODING[t % 32]!;
    t = Math.floor(t / 32);
  }
  // 16-char random component
  for (let i = 10; i < 26; i++) {
    chars[i] = ULID_ENCODING[Math.floor(Math.random() * 32)]!;
  }
  return `${COMMAND_FILE_PREFIX}${chars.join("")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CommandEntityLifecycleState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lifecycle state of a command entity.
 *
 * Transitions (GUI-written → Orchestrator-driven):
 *   pending   — created by the GUI; written to the command inbox
 *   accepted  — Orchestrator received and validated the command
 *   executing — Orchestrator is actively processing the command
 *   completed — Orchestrator finished processing successfully
 *   failed    — Processing error or pre-execution rejection
 *
 * The GUI ALWAYS creates entities with `"pending"`.
 * Subsequent transitions are driven by incoming WebSocket events.
 */
export type CommandEntityLifecycleState =
  | "pending"
  | "accepted"
  | "executing"
  | "completed"
  | "failed";

/** The lifecycle state assigned at creation time. */
export const COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE: CommandEntityLifecycleState =
  "pending";

// ─────────────────────────────────────────────────────────────────────────────
// CommandEntity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical record produced when a user action occurs in the 3D command-center.
 *
 * This is the entity-layer abstraction above `CommandFile`.  It uses the
 * Sub-AC 8.1 field names (`action_type`, `source_entity_id`, `lifecycle_state`)
 * which are then mapped to `CommandFile` field names during serialisation.
 *
 * All fields are readonly — entities are immutable after construction.
 */
export interface CommandEntity {
  /**
   * Globally unique command identifier.
   * Format: `cmd_<26-char ULID>` (COMMAND_FILE_PREFIX + ULID).
   */
  readonly command_id: string;

  /**
   * The identifier of the 3D world entity whose affordance triggered this
   * command.  Typical values:
   *   • Agent avatar:   `"agent:<agent_id>"` (e.g. `"agent:researcher-1"`)
   *   • Room entity:    `"room:<room_id>"`   (e.g. `"room:research-lab"`)
   *   • Building:       `"building:main"`
   *   • Task connector: `"task:<task_id>"`   (e.g. `"task:t-001"`)
   *   • UI fixture:     `"fixture:<id>"`     (e.g. `"fixture:spawn-btn-researcher-1"`)
   *
   * This field is forwarded to `CommandFile.causation_id` so the Orchestrator
   * audit trail can trace every command back to its originating 3D entity.
   */
  readonly source_entity_id: string;

  /**
   * The action type string — one of the `GuiCommandType` values.
   * Examples: "agent.spawn", "agent.terminate", "task.create", "nav.drill_down".
   *
   * Maps to `CommandFile.type` during serialisation.
   */
  readonly action_type: string;

  /**
   * Command-specific structured payload.
   * The exact shape depends on `action_type` — see `GuiCommandPayloadMap` in
   * the protocol package for the canonical per-type definitions.
   *
   * Maps to `CommandFile.payload` during serialisation.
   */
  readonly payload: Record<string, unknown>;

  /**
   * Lifecycle state — always `"pending"` when created by the GUI.
   * Subsequent states are driven by Orchestrator WebSocket events.
   *
   * Maps to `CommandFile.status` during serialisation.
   */
  readonly lifecycle_state: CommandEntityLifecycleState;

  // ── Metadata (set at creation time, immutable) ───────────────────────────

  /** ISO 8601 timestamp of entity creation. */
  readonly ts: string;

  /** Unix epoch milliseconds of entity creation (numeric complement to `ts`). */
  readonly created_at_ms: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for `createCommandEntity()`.
 */
export interface CreateCommandEntityOptions {
  /**
   * The 3D world entity that triggered this command.
   * @see CommandEntity.source_entity_id
   */
  source_entity_id: string;

  /**
   * The GUI command type.
   * Must be a registered `GuiCommandType` value.
   */
  action_type: GuiCommandType;

  /**
   * Command-specific payload.
   */
  payload: Record<string, unknown>;

  /**
   * Optional ISO timestamp override (defaults to `new Date().toISOString()`).
   * Useful for deterministic testing.
   */
  ts?: string;

  /**
   * Optional command_id override (defaults to `generateCommandEntityId()`).
   * Useful for deterministic testing; must start with COMMAND_FILE_PREFIX.
   */
  command_id?: string;
}

/**
 * Create an immutable `CommandEntity` in `pending` state.
 *
 * This is the entry point for every user action in the 3D command-center.
 * The returned entity must be serialised via `serializeCommandEntity()` and
 * written to the Orchestrator's command inbox via `writeCommandEntityToInbox()`.
 *
 * @example
 * ```ts
 * const entity = createCommandEntity({
 *   source_entity_id: "agent:researcher-1",
 *   action_type:      "agent.spawn",
 *   payload: {
 *     agent_id:     "researcher-1",
 *     persona:      "researcher",
 *     room_id:      "research-lab",
 *     display_name: "Researcher-1",
 *   },
 * });
 * // entity.lifecycle_state === "pending"
 * ```
 */
export function createCommandEntity(
  opts: CreateCommandEntityOptions,
): CommandEntity {
  const created_at_ms = Date.now();
  const command_id = opts.command_id ?? generateCommandEntityId();
  const ts = opts.ts ?? new Date(created_at_ms).toISOString();

  const entity: CommandEntity = {
    command_id,
    source_entity_id: opts.source_entity_id,
    action_type:      opts.action_type,
    payload:          opts.payload,
    lifecycle_state:  COMMAND_ENTITY_INITIAL_LIFECYCLE_STATE,
    ts,
    created_at_ms,
  };

  return Object.freeze(entity);
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializer: CommandEntity → CommandFile
// ─────────────────────────────────────────────────────────────────────────────

/** Default run_id used when no run context is provided. */
export const COMMAND_ENTITY_DEFAULT_RUN_ID = "gui-session";

/**
 * Serialise a `CommandEntity` to a `CommandFile` envelope for transmission
 * to the Orchestrator command inbox.
 *
 * Field mapping:
 *   CommandEntity.command_id        → CommandFile.command_id
 *   CommandEntity.action_type       → CommandFile.type
 *   CommandEntity.payload           → CommandFile.payload
 *   CommandEntity.lifecycle_state   → CommandFile.status  (always "pending")
 *   CommandEntity.source_entity_id  → CommandFile.causation_id
 *   CommandEntity.ts                → CommandFile.ts
 *   CommandEntity.created_at_ms     → CommandFile.created_at_ms
 *
 * @param entity  The command entity to serialise.
 * @param runId   Optional run context override (default: "gui-session").
 * @returns A valid `CommandFile` envelope ready for JSON serialisation.
 * @throws {Error} If `entity.action_type` is not a registered `GuiCommandType`.
 */
export function serializeCommandEntity(
  entity: CommandEntity,
  runId: string = COMMAND_ENTITY_DEFAULT_RUN_ID,
): CommandFile {
  // Validate action_type at serialisation time for fail-fast feedback
  if (!isGuiCommandType(entity.action_type)) {
    throw new Error(
      `[CommandEntity] Unknown action_type: "${entity.action_type}". ` +
        `Must be one of the registered GuiCommandType values.`,
    );
  }

  const commandFile: CommandFile = {
    schema:          SCHEMA_VERSION,
    command_id:      entity.command_id,
    type:            entity.action_type as GuiCommandType,
    ts:              entity.ts,
    run_id:          runId,
    actor:           DEFAULT_GUI_ACTOR,
    payload:         entity.payload,
    // Sub-AC 8.1: lifecycle_state "pending" → CommandFile.status "pending"
    status:          COMMAND_FILE_INITIAL_STATUS,
    created_at_ms:   entity.created_at_ms,
    // Forward source_entity_id to causation_id for audit trail chaining
    causation_id:    entity.source_entity_id,
    // Use command_id as idempotency key (prevents double-processing on retry)
    idempotency_key: entity.command_id,
  };

  return commandFile;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbox writer: POST to Orchestrator command API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Command API base URL.
 * VITE_COMMANDS_API_URL is injected at build time; falls back to the default
 * Orchestrator HTTP port for local development.
 */
export function getCommandsApiUrl(): string {
  const envUrl =
    typeof import.meta !== "undefined"
      ? ((import.meta.env as Record<string, unknown>)?.VITE_COMMANDS_API_URL as string | undefined)
      : undefined;
  return envUrl ?? "http://localhost:8080";
}

/** Result returned by `writeCommandEntityToInbox`. */
export interface WriteCommandEntityResult {
  /** True if the command was accepted by the API. */
  readonly success: boolean;
  /** The command_id of the entity that was written. */
  readonly command_id: string;
  /** Error message if `success` is false. */
  readonly error?: string;
}

/**
 * Serialise a `CommandEntity` and POST it to the Orchestrator's command
 * ingestion API.  The API writes the JSON atomically to the pipeline entity's
 * input directory (`.conitens/commands/`) and returns 202 Accepted.
 *
 * This is the terminal step of the Sub-AC 8.1 command creation flow:
 *
 *   createCommandEntity() → serializeCommandEntity() → writeCommandEntityToInbox()
 *
 * Errors are returned as `{ success: false, error }` rather than thrown, so
 * callers can decide whether to retry or surface the error in the UI.
 *
 * @param entity  The command entity to write.
 * @param runId   Optional run context override.
 * @returns       Result indicating success or failure.
 */
export async function writeCommandEntityToInbox(
  entity: CommandEntity,
  runId?: string,
): Promise<WriteCommandEntityResult> {
  let commandFile: CommandFile;
  try {
    commandFile = serializeCommandEntity(entity, runId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, command_id: entity.command_id, error: msg };
  }

  const endpoint = `${getCommandsApiUrl()}/api/commands`;

  try {
    const response = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(commandFile),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "(no body)");
      return {
        success:    false,
        command_id: entity.command_id,
        error:      `Command API returned ${response.status}: ${text}`,
      };
    }

    return { success: true, command_id: entity.command_id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return {
      success:    false,
      command_id: entity.command_id,
      error:      msg,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard: check that `value` is a valid `CommandEntity`.
 *
 * Does NOT validate payload contents (payload shape varies per action_type).
 */
export function isCommandEntity(value: unknown): value is CommandEntity {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["command_id"]       === "string" && v["command_id"].length > 0 &&
    typeof v["source_entity_id"] === "string" && v["source_entity_id"].length > 0 &&
    typeof v["action_type"]      === "string" && v["action_type"].length > 0 &&
    typeof v["payload"]          === "object" && v["payload"] !== null &&
    typeof v["lifecycle_state"]  === "string" &&
    typeof v["ts"]               === "string" &&
    typeof v["created_at_ms"]    === "number"
  );
}

/**
 * Convenience helper: create a command entity AND write it to the inbox in
 * a single call.
 *
 * Returns both the entity (for local state management, e.g. pipeline tracking)
 * and the write result (success/failure).
 *
 * @example
 * ```ts
 * const { entity, result } = await createAndWriteCommandEntity({
 *   source_entity_id: "agent:researcher-1",
 *   action_type:      "agent.spawn",
 *   payload: { agent_id: "researcher-1", persona: "researcher", room_id: "lab" },
 * });
 * if (result.success) {
 *   pipelineWatcher.registerCommand(entity.command_id, entity.action_type);
 * }
 * ```
 */
export async function createAndWriteCommandEntity(
  opts: CreateCommandEntityOptions,
  runId?: string,
): Promise<{ entity: CommandEntity; result: WriteCommandEntityResult }> {
  const entity = createCommandEntity(opts);
  const result = await writeCommandEntityToInbox(entity, runId);
  return { entity, result };
}
