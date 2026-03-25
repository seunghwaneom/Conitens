/**
 * agent-lifecycle-intent-command-pipeline.ts — Sub-AC 7c: Agent lifecycle
 * command pipeline.
 *
 * Translates `InteractionIntentEntity` objects that originate from
 * `agent_instance` affordances into `AgentLifecycleCommandEntity` objects
 * covering the three canonical lifecycle operations:
 *
 *   • start    — spawn / activate the agent
 *   • stop     — terminate / deactivate the agent
 *   • reassign — move the agent to a different room
 *
 * Architecture
 * ────────────
 *   InteractionIntentEntity (target_entity_type="agent_instance")
 *     ↓ source_payload carries lifecycleOperation field
 *   translateAgentInstanceIntentToCommand()   ← pure pipeline function
 *     ↓
 *   AgentLifecycleCommandEntity               ← output command entity
 *
 * Intent → command translation contract
 * ──────────────────────────────────────
 * An `InteractionIntentEntity` with `target_entity_type="agent_instance"`
 * may carry lifecycle intent data in its `source_payload` field.  The
 * pipeline recognises this by checking for a `lifecycleOperation` key on
 * the payload:
 *
 *   source_payload.lifecycleOperation = "start"    → AgentStartPayload
 *   source_payload.lifecycleOperation = "stop"     → AgentStopPayload
 *   source_payload.lifecycleOperation = "reassign" → AgentReassignPayload
 *                                                   (requires targetRoomId)
 *
 * If `lifecycleOperation` is absent or does not match a known operation
 * string, `translateAgentInstanceIntentToCommand()` returns `null` and the
 * intent is treated as a non-lifecycle interaction (e.g., a selection click).
 *
 * Command entity structure
 * ────────────────────────
 * Each produced `AgentLifecycleCommandEntity` carries:
 *   • `command_id`        — unique identifier (timestamp + counter)
 *   • `ts` / `ts_iso`     — creation timestamp
 *   • `agent_id`          — extracted from `entity.target_id`
 *   • `operation`         — "start" | "stop" | "reassign"
 *   • `operation_payload` — operation-specific sub-object with typed fields
 *   • `source_intent_id`  — back-reference to the originating intent entity
 *   • `source_gesture`    — gesture_type from the originating intent entity
 *
 * Pure TypeScript — no React, Three.js, or browser-DOM dependencies
 * ──────────────────────────────────────────────────────────────────
 * This module is fully headless and can be tested in Node.js without a
 * browser context.  All intent-sourcing, normalisation, and dispatching
 * concerns belong to the calling layer; this module only handles the
 * intent → command entity projection step.
 *
 * Relationship to Sub-AC 7b
 * ──────────────────────────
 * Sub-AC 7b (use-agent-fixture-command-bridge.ts) translates fixture-button
 * click payloads (from the 3D spatial UI fixture layer) into orchestration
 * commands.  Sub-AC 7c handles the complementary path: `interaction_intent`
 * entities emitted by the `agent_instance` affordances (context-menu,
 * context-aware click) → command entities with structured payloads.
 *
 * The two pipelines are independent — 7b is fixture-driven and carries a
 * fixtureId, while 7c is intent-driven and carries an intent_id.  Both
 * produce commands that can be dispatched by `useCommandFileWriter`.
 *
 * Record transparency
 * ────────────────────
 * Every produced command entity:
 *   • Is immutable (Object.freeze applied by `makeAgentLifecycleCommand`)
 *   • Is JSON-serialisable
 *   • Carries `source_intent_id` linking it back to the originating
 *     `InteractionIntentEntity` in the interaction log
 *
 * Usage
 * ─────
 * ```ts
 * import {
 *   makeAgentLifecycleIntentPayload,
 *   translateAgentInstanceIntentToCommand,
 * } from "../scene/agent-lifecycle-intent-command-pipeline.js";
 * import { makeInteractionIntentEntity } from
 *   "../scene/interaction-intent-entity.js";
 *
 * // Construct an intent with embedded lifecycle operation:
 * const payload = makeAgentLifecycleIntentPayload({
 *   agentId: "researcher-1",
 *   lifecycleOperation: "start",
 * });
 *
 * const entity = makeInteractionIntentEntity({
 *   target_entity_type: "agent_instance",
 *   gesture_type:       "context_menu",
 *   target_id:          "researcher-1",
 *   ts:                 Date.now(),
 *   layer:              "meta",
 *   source_payload:     payload,
 * });
 *
 * // Pipeline: intent → command entity
 * const cmd = translateAgentInstanceIntentToCommand(entity);
 * // cmd.agent_id          === "researcher-1"
 * // cmd.operation         === "start"
 * // cmd.operation_payload === { operation: "start" }
 * ```
 */

import type { InteractionIntentEntity } from "./interaction-intent-entity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle operation types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three canonical lifecycle operations that an agent_instance affordance
 * can initiate via an interaction_intent.
 */
export type AgentLifecycleOperation = "start" | "stop" | "reassign";

/** O(1) membership set for guard checks. */
export const AGENT_LIFECYCLE_OPERATIONS: ReadonlySet<string> =
  new Set<AgentLifecycleOperation>(["start", "stop", "reassign"]);

/** Type guard: narrows an unknown string to `AgentLifecycleOperation`. */
export function isAgentLifecycleOperation(
  s: unknown,
): s is AgentLifecycleOperation {
  return typeof s === "string" && AGENT_LIFECYCLE_OPERATIONS.has(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation payload types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payload for the `start` lifecycle operation.
 *
 * Spawns or activates the target agent.  An optional `persona` field allows
 * the caller to specify which agent persona file to use when spawning.
 */
export interface AgentStartPayload {
  /** Discriminant. */
  readonly operation: "start";
  /**
   * Optional persona identifier to use when spawning the agent.
   * If omitted, the orchestrator uses the agent's default persona.
   */
  readonly persona?: string;
}

/**
 * Payload for the `stop` lifecycle operation.
 *
 * Terminates or deactivates the target agent.  The `reason` field is
 * forwarded to the orchestrator for logging and audit trail purposes.
 */
export interface AgentStopPayload {
  /** Discriminant. */
  readonly operation: "stop";
  /**
   * Human-readable reason for the stop operation.
   * Recorded in the event log for audit transparency.
   * @default "user_requested"
   */
  readonly reason?: string;
}

/**
 * Payload for the `reassign` lifecycle operation.
 *
 * Moves the target agent to a different room.  The `target_room_id` field
 * is required and must be a valid room identifier from the room manifest.
 */
export interface AgentReassignPayload {
  /** Discriminant. */
  readonly operation: "reassign";
  /**
   * The room ID to move the agent to.
   * Must match a room in the current room manifest.
   */
  readonly target_room_id: string;
}

/**
 * Discriminated union of all valid agent lifecycle operation payloads.
 */
export type AgentLifecycleOperationPayload =
  | AgentStartPayload
  | AgentStopPayload
  | AgentReassignPayload;

// ─────────────────────────────────────────────────────────────────────────────
// Command entity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A command entity produced by the agent lifecycle intent pipeline (Sub-AC 7c).
 *
 * This is NOT an orchestration-level `CommandFile` — it is an intermediate
 * command entity that lives within the GUI domain layer.  It can be forwarded
 * to `useCommandFileWriter` to produce the protocol-level command file that
 * reaches the Orchestrator.
 *
 * Key fields:
 *   • `agent_id`          — the agent that the lifecycle operation targets
 *   • `operation`         — the lifecycle operation kind
 *   • `operation_payload` — operation-specific typed payload
 *   • `source_intent_id`  — back-reference to the originating intent entity
 */
export interface AgentLifecycleCommandEntity {
  /** Unique command identifier (ISO timestamp + counter). */
  readonly command_id: string;
  /** Unix ms timestamp when this command entity was created. */
  readonly ts: number;
  /** ISO 8601 timestamp for log display. */
  readonly ts_iso: string;
  /**
   * The agent that is the target of this lifecycle operation.
   * Extracted from the originating `InteractionIntentEntity.target_id`.
   */
  readonly agent_id: string;
  /** The lifecycle operation to perform. */
  readonly operation: AgentLifecycleOperation;
  /**
   * Operation-specific payload carrying the structured arguments.
   * Discriminated on `operation_payload.operation`.
   */
  readonly operation_payload: AgentLifecycleOperationPayload;
  /** The `intent_id` of the originating `InteractionIntentEntity`. */
  readonly source_intent_id: string;
  /**
   * The `gesture_type` of the originating `InteractionIntentEntity`.
   * Typically "context_menu" or "click".
   */
  readonly source_gesture: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command ID generation
// ─────────────────────────────────────────────────────────────────────────────

/** Monotonic counter used to guarantee uniqueness within the same millisecond. */
let _cmdCounter = 0;

/**
 * Generate a unique command ID using the current timestamp and a monotonic
 * counter.  Format: `lcmd_{ts}_{counter}` where `ts` is Unix ms.
 *
 * The `l` prefix distinguishes GUI-local command IDs from orchestrator-assigned
 * command IDs (which use ULIDs).
 */
export function generateLifecycleCommandId(): string {
  return `lcmd_${Date.now()}_${++_cmdCounter}`;
}

/**
 * Reset the command ID counter.  Intended for use in tests only to ensure
 * deterministic counter values across test runs.
 *
 * @internal
 */
export function _resetLifecycleCommandCounter(): void {
  _cmdCounter = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source payload input type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured data that can be embedded in the `source_payload` of an
 * `InteractionIntentEntity` to signal that the intent should trigger an agent
 * lifecycle operation.
 *
 * This is the "carrier" record recognised by `translateAgentInstanceIntentToCommand`.
 * Only the fields relevant to the lifecycle operation are required; others
 * can be omitted.
 */
export interface AgentLifecycleIntentPayload {
  /** The lifecycle operation to perform on the agent. */
  readonly lifecycleOperation: AgentLifecycleOperation;
  /**
   * Target room ID — required when `lifecycleOperation === "reassign"`;
   * ignored for other operations.
   */
  readonly targetRoomId?: string;
  /**
   * Optional persona identifier — only meaningful when
   * `lifecycleOperation === "start"`.
   */
  readonly persona?: string;
  /**
   * Human-readable stop reason — only meaningful when
   * `lifecycleOperation === "stop"`.
   * @default "user_requested"
   */
  readonly reason?: string;
  /** Originating agent ID (for cross-referencing in logs). */
  readonly agentId?: string;
  /** Any additional context fields forwarded verbatim. */
  readonly [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: AgentLifecycleIntentPayload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a validated `AgentLifecycleIntentPayload` to embed in the
 * `source_payload` of an `InteractionIntentEntity`.
 *
 * This is the recommended way to add lifecycle intent data to an agent_instance
 * interaction intent — it ensures the `lifecycleOperation` field is present
 * and that `targetRoomId` is validated for reassign operations.
 *
 * @throws {TypeError} if `operation === "reassign"` but `targetRoomId` is missing.
 *
 * @example
 * ```ts
 * const payload = makeAgentLifecycleIntentPayload({
 *   agentId: "researcher-1",
 *   lifecycleOperation: "reassign",
 *   targetRoomId: "ops-room",
 * });
 * ```
 */
export function makeAgentLifecycleIntentPayload(
  opts: {
    lifecycleOperation: AgentLifecycleOperation;
    agentId?: string;
    targetRoomId?: string;
    persona?: string;
    reason?: string;
  } & Record<string, unknown>,
): AgentLifecycleIntentPayload {
  const { lifecycleOperation, agentId, targetRoomId, persona, reason, ...rest } = opts;

  if (lifecycleOperation === "reassign" && !targetRoomId) {
    throw new TypeError(
      "makeAgentLifecycleIntentPayload: 'targetRoomId' is required for 'reassign' operation",
    );
  }

  return Object.freeze({
    lifecycleOperation,
    ...(agentId    !== undefined ? { agentId }    : {}),
    ...(targetRoomId !== undefined ? { targetRoomId } : {}),
    ...(persona    !== undefined ? { persona }    : {}),
    ...(reason     !== undefined ? { reason }     : {}),
    ...rest,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: AgentLifecycleCommandEntity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an immutable `AgentLifecycleCommandEntity` from the resolved
 * components.
 *
 * @param agentId         — target agent identifier
 * @param operation       — lifecycle operation kind
 * @param payload         — operation-specific typed payload
 * @param sourceIntentId  — intent_id of the originating intent entity
 * @param sourceGesture   — gesture_type of the originating intent entity
 * @param tsOverride      — override the creation timestamp (used in tests)
 */
export function makeAgentLifecycleCommand(opts: {
  agentId:        string;
  operation:      AgentLifecycleOperation;
  payload:        AgentLifecycleOperationPayload;
  sourceIntentId: string;
  sourceGesture:  string;
  tsOverride?:    number;
}): AgentLifecycleCommandEntity {
  const ts     = opts.tsOverride ?? Date.now();
  const ts_iso = new Date(ts).toISOString();

  return Object.freeze({
    command_id:        generateLifecycleCommandId(),
    ts,
    ts_iso,
    agent_id:          opts.agentId,
    operation:         opts.operation,
    operation_payload: Object.freeze(opts.payload),
    source_intent_id:  opts.sourceIntentId,
    source_gesture:    opts.sourceGesture,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core pipeline: intent → command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate an `InteractionIntentEntity` into an `AgentLifecycleCommandEntity`.
 *
 * Returns `null` if:
 *   • `entity.target_entity_type !== "agent_instance"`
 *   • `entity.source_payload.lifecycleOperation` is absent
 *   • The `lifecycleOperation` value is not a valid `AgentLifecycleOperation`
 *   • `operation === "reassign"` but `source_payload.targetRoomId` is missing
 *     or empty
 *
 * The function is **pure** — it produces the same output for the same input
 * and has no side effects.  Command dispatch is the caller's responsibility.
 *
 * @param entity — A canonical `InteractionIntentEntity` from the dispatcher
 * @returns      — A frozen `AgentLifecycleCommandEntity`, or null
 *
 * @example
 * ```ts
 * const cmd = translateAgentInstanceIntentToCommand(entity);
 * if (cmd) {
 *   await writeCommand(cmd.operation === "start" ? "agent.spawn"
 *                    : cmd.operation === "stop"  ? "agent.terminate"
 *                    :                            "agent.assign",
 *     buildCommandPayload(cmd));
 * }
 * ```
 */
export function translateAgentInstanceIntentToCommand(
  entity: InteractionIntentEntity,
): AgentLifecycleCommandEntity | null {
  // Gate 1: only agent_instance layer intents are processed here
  if (entity.target_entity_type !== "agent_instance") return null;

  // Gate 2: source_payload must carry a lifecycleOperation field
  const payload = entity.source_payload as Record<string, unknown>;
  const opRaw   = payload["lifecycleOperation"];

  if (!isAgentLifecycleOperation(opRaw)) return null;

  const operation = opRaw;
  const agentId   = entity.target_id;

  // Build the operation-specific payload
  let operationPayload: AgentLifecycleOperationPayload;

  switch (operation) {
    case "start": {
      const persona = typeof payload["persona"] === "string"
        ? payload["persona"]
        : undefined;
      operationPayload = Object.freeze<AgentStartPayload>({
        operation: "start",
        ...(persona !== undefined ? { persona } : {}),
      });
      break;
    }

    case "stop": {
      const reason = typeof payload["reason"] === "string"
        ? payload["reason"]
        : "user_requested";
      operationPayload = Object.freeze<AgentStopPayload>({
        operation: "stop",
        reason,
      });
      break;
    }

    case "reassign": {
      const targetRoomId = payload["targetRoomId"];
      if (typeof targetRoomId !== "string" || targetRoomId.length === 0) {
        // Cannot reassign without a target room ID
        return null;
      }
      operationPayload = Object.freeze<AgentReassignPayload>({
        operation:      "reassign",
        target_room_id: targetRoomId,
      });
      break;
    }
  }

  return makeAgentLifecycleCommand({
    agentId,
    operation,
    payload:        operationPayload,
    sourceIntentId: entity.intent_id,
    sourceGesture:  entity.gesture_type,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch pipeline helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate an array of `InteractionIntentEntity` objects, returning only
 * those that produce a valid `AgentLifecycleCommandEntity`.
 *
 * Convenience wrapper around `translateAgentInstanceIntentToCommand` for
 * processing a batch (e.g., flushing the dispatcher ring-buffer).
 *
 * @param entities — Array of canonical intent entities from the dispatcher
 * @returns        — Array of lifecycle command entities (no nulls)
 */
export function translateAgentInstanceIntentBatch(
  entities: readonly InteractionIntentEntity[],
): AgentLifecycleCommandEntity[] {
  const results: AgentLifecycleCommandEntity[] = [];
  for (const entity of entities) {
    const cmd = translateAgentInstanceIntentToCommand(entity);
    if (cmd !== null) {
      results.push(cmd);
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command type mapping helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps an `AgentLifecycleOperation` to the corresponding protocol-level
 * `GuiCommandType` string that `useCommandFileWriter` accepts.
 *
 * This mapping is the single source of truth for 7c → protocol command
 * type translation.  Sub-AC 7c command entities are deliberately NOT typed
 * as `CommandFile` directly — the command file type system belongs to the
 * `@conitens/protocol` package.  This mapping bridges the gap.
 */
export const LIFECYCLE_OPERATION_TO_COMMAND_TYPE: Readonly<
  Record<AgentLifecycleOperation, string>
> = Object.freeze({
  start:    "agent.spawn",
  stop:     "agent.terminate",
  reassign: "agent.assign",
} as const);

/**
 * Resolve the protocol command type string for a given lifecycle operation.
 *
 * @param operation — Lifecycle operation from an `AgentLifecycleCommandEntity`
 * @returns         — Protocol command type string (e.g. "agent.spawn")
 */
export function resolveCommandType(operation: AgentLifecycleOperation): string {
  return LIFECYCLE_OPERATION_TO_COMMAND_TYPE[operation];
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

/** Type guard: narrows unknown to `AgentLifecycleCommandEntity`. */
export function isAgentLifecycleCommandEntity(
  v: unknown,
): v is AgentLifecycleCommandEntity {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["command_id"] === "string" &&
    typeof r["agent_id"]   === "string" &&
    typeof r["operation"]  === "string" &&
    isAgentLifecycleOperation(r["operation"]) &&
    typeof r["operation_payload"] === "object" && r["operation_payload"] !== null &&
    typeof r["source_intent_id"]  === "string" &&
    typeof r["ts"]                === "number"
  );
}

/** Type guard: narrows `AgentLifecycleOperationPayload` to `AgentStartPayload`. */
export function isAgentStartPayload(
  p: AgentLifecycleOperationPayload,
): p is AgentStartPayload {
  return p.operation === "start";
}

/** Type guard: narrows `AgentLifecycleOperationPayload` to `AgentStopPayload`. */
export function isAgentStopPayload(
  p: AgentLifecycleOperationPayload,
): p is AgentStopPayload {
  return p.operation === "stop";
}

/** Type guard: narrows `AgentLifecycleOperationPayload` to `AgentReassignPayload`. */
export function isAgentReassignPayload(
  p: AgentLifecycleOperationPayload,
): p is AgentReassignPayload {
  return p.operation === "reassign";
}
