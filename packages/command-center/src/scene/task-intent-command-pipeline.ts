/**
 * task-intent-command-pipeline.ts — Sub-AC 7d: Task command pipeline.
 *
 * Translates `InteractionIntentEntity` objects that originate from task
 * affordances (fixture-layer intents whose `source_payload` carries a
 * `taskOperation` key) into `TaskCommandEntity` objects covering the three
 * canonical task operations:
 *
 *   • create        — create a new task (possibly assigning it to an agent)
 *   • cancel        — cancel an existing active task
 *   • reprioritize  — change the priority level of an existing task
 *
 * Architecture
 * ────────────
 *   InteractionIntentEntity (target_entity_type="fixture", entityType="task")
 *     ↓ source_payload carries taskOperation field
 *   translateTaskIntentToCommand()   ← pure pipeline function
 *     ↓
 *   TaskCommandEntity                ← output command entity
 *
 * Intent → command translation contract
 * ──────────────────────────────────────
 * An `InteractionIntentEntity` whose `source_payload` carries:
 *
 *   source_payload.taskOperation = "create"       → TaskCreatePayload
 *   source_payload.taskOperation = "cancel"       → TaskCancelPayload
 *   source_payload.taskOperation = "reprioritize" → TaskReprioritizePayload
 *
 * If `taskOperation` is absent or does not match a known operation string,
 * `translateTaskIntentToCommand()` returns `null`.
 *
 * Command entity structure
 * ────────────────────────
 * Each produced `TaskCommandEntity` carries:
 *   • `command_id`        — unique identifier (timestamp + counter)
 *   • `ts` / `ts_iso`     — creation timestamp
 *   • `operation`         — "create" | "cancel" | "reprioritize"
 *   • `operation_payload` — operation-specific sub-object with typed fields
 *   • `source_intent_id`  — back-reference to the originating intent entity
 *   • `source_gesture`    — gesture_type from the originating intent entity
 *
 * Pure TypeScript — no React, Three.js, or browser-DOM dependencies
 * ──────────────────────────────────────────────────────────────────
 * This module is fully headless and can be tested in Node.js without a
 * browser context.
 *
 * Relationship to Sub-AC 7c
 * ──────────────────────────
 * Sub-AC 7c (agent-lifecycle-intent-command-pipeline.ts) handles
 * `agent_instance` intents → lifecycle commands.  Sub-AC 7d handles
 * `fixture` intents with entityType="task" → task operation commands.
 * Both pipelines are independent and produce different command entity shapes.
 *
 * Record transparency
 * ────────────────────
 * Every produced command entity:
 *   • Is immutable (Object.freeze applied by `makeTaskCommand`)
 *   • Is JSON-serialisable
 *   • Carries `source_intent_id` linking it back to the originating intent
 *
 * Usage
 * ─────
 * ```ts
 * import {
 *   makeTaskIntentPayload,
 *   translateTaskIntentToCommand,
 * } from "../scene/task-intent-command-pipeline.js";
 *
 * const payload = makeTaskIntentPayload({
 *   taskOperation: "create",
 *   title: "Implement feature X",
 *   priority: "high",
 *   assignedAgentId: "researcher-1",
 * });
 *
 * const entity = makeInteractionIntentEntity({
 *   target_entity_type: "fixture",
 *   gesture_type: "click",
 *   target_id: "task-create-btn",
 *   ts: Date.now(),
 *   layer: "domain",
 *   source_payload: payload,
 * });
 *
 * const cmd = translateTaskIntentToCommand(entity);
 * // cmd.operation         === "create"
 * // cmd.operation_payload === { operation: "create", title: "Implement feature X", ... }
 * ```
 */

import type { InteractionIntentEntity } from "./interaction-intent-entity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Task operation types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three canonical task operations that a task affordance can initiate
 * via an interaction_intent.
 */
export type TaskOperation = "create" | "cancel" | "reprioritize";

/** O(1) membership set for guard checks. */
export const TASK_OPERATIONS: ReadonlySet<string> =
  new Set<TaskOperation>(["create", "cancel", "reprioritize"]);

/** Type guard: narrows an unknown string to `TaskOperation`. */
export function isTaskOperation(s: unknown): s is TaskOperation {
  return typeof s === "string" && TASK_OPERATIONS.has(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Task priority type (mirrors task-types.ts but kept local to avoid coupling)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Task priority levels — mirrors `TaskPriority` from task-types.ts.
 * Redefined here to keep the pipeline module self-contained (no cross-module
 * runtime dependency).
 */
export type TaskPriorityLevel = "critical" | "high" | "normal" | "low";

/** O(1) membership set for guard checks. */
export const TASK_PRIORITY_LEVELS: ReadonlySet<string> =
  new Set<TaskPriorityLevel>(["critical", "high", "normal", "low"]);

/** Type guard: narrows an unknown string to `TaskPriorityLevel`. */
export function isTaskPriorityLevel(s: unknown): s is TaskPriorityLevel {
  return typeof s === "string" && TASK_PRIORITY_LEVELS.has(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation payload types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payload for the `create` task operation.
 *
 * Creates a new task in the orchestration pipeline.  The `title` is required;
 * all other fields are optional and use sensible defaults.
 */
export interface TaskCreatePayload {
  /** Discriminant. */
  readonly operation: "create";
  /**
   * Short human-readable title for the new task.
   * Required — tasks must have a title.
   */
  readonly title: string;
  /**
   * Optional longer description / goal statement.
   */
  readonly description?: string;
  /**
   * Task priority level.
   * @default "normal"
   */
  readonly priority: TaskPriorityLevel;
  /**
   * Optional agent ID to immediately assign the task to on creation.
   * If omitted the task is created in `draft` status with no assignee.
   */
  readonly assignedAgentId?: string;
  /**
   * Optional parent task ID for sub-task relationships.
   */
  readonly parentTaskId?: string;
  /**
   * Optional tags for filtering / grouping.
   */
  readonly tags?: readonly string[];
}

/**
 * Payload for the `cancel` task operation.
 *
 * Cancels an existing task.  The `task_id` is required and must refer to a
 * task in a non-terminal state.  The `reason` field is forwarded to the
 * orchestrator for audit trail purposes.
 */
export interface TaskCancelPayload {
  /** Discriminant. */
  readonly operation: "cancel";
  /**
   * The ID of the task to cancel.
   * Must refer to a task in a non-terminal state (not "done" or "cancelled").
   */
  readonly task_id: string;
  /**
   * Human-readable reason for the cancellation.
   * Recorded in the event log for audit transparency.
   * @default "user_requested"
   */
  readonly reason?: string;
}

/**
 * Payload for the `reprioritize` task operation.
 *
 * Changes the priority level of an existing task.  Both `task_id` and
 * `new_priority` are required.
 */
export interface TaskReprioritizePayload {
  /** Discriminant. */
  readonly operation: "reprioritize";
  /**
   * The ID of the task whose priority should be changed.
   */
  readonly task_id: string;
  /**
   * The new priority level to assign to the task.
   */
  readonly new_priority: TaskPriorityLevel;
  /**
   * Optional previous priority level — captured from the intent payload for
   * audit transparency and undo support.
   */
  readonly previous_priority?: TaskPriorityLevel;
}

/**
 * Discriminated union of all valid task operation payloads.
 */
export type TaskOperationPayload =
  | TaskCreatePayload
  | TaskCancelPayload
  | TaskReprioritizePayload;

// ─────────────────────────────────────────────────────────────────────────────
// Command entity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A command entity produced by the task intent pipeline (Sub-AC 7d).
 *
 * This is NOT an orchestration-level `CommandFile` — it is an intermediate
 * command entity that lives within the GUI domain layer.  It can be forwarded
 * to `useCommandFileWriter` to produce the protocol-level command file that
 * reaches the Orchestrator.
 *
 * Key fields:
 *   • `operation`         — the task operation kind
 *   • `operation_payload` — operation-specific typed payload
 *   • `source_intent_id`  — back-reference to the originating intent entity
 */
export interface TaskCommandEntity {
  /** Unique command identifier (ISO timestamp + counter). */
  readonly command_id: string;
  /** Unix ms timestamp when this command entity was created. */
  readonly ts: number;
  /** ISO 8601 timestamp for log display. */
  readonly ts_iso: string;
  /** The task operation to perform. */
  readonly operation: TaskOperation;
  /**
   * Operation-specific payload carrying the structured arguments.
   * Discriminated on `operation_payload.operation`.
   */
  readonly operation_payload: TaskOperationPayload;
  /** The `intent_id` of the originating `InteractionIntentEntity`. */
  readonly source_intent_id: string;
  /**
   * The `gesture_type` of the originating `InteractionIntentEntity`.
   * Typically "click" or "context_menu".
   */
  readonly source_gesture: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command ID generation
// ─────────────────────────────────────────────────────────────────────────────

/** Monotonic counter used to guarantee uniqueness within the same millisecond. */
let _taskCmdCounter = 0;

/**
 * Generate a unique task command ID using the current timestamp and a monotonic
 * counter.  Format: `tcmd_{ts}_{counter}` where `ts` is Unix ms.
 *
 * The `t` prefix distinguishes task command IDs from lifecycle command IDs
 * (`lcmd_…`) and orchestrator-assigned command IDs (which use ULIDs).
 */
export function generateTaskCommandId(): string {
  return `tcmd_${Date.now()}_${++_taskCmdCounter}`;
}

/**
 * Reset the task command ID counter.  Intended for use in tests only to
 * ensure deterministic counter values across test runs.
 *
 * @internal
 */
export function _resetTaskCommandCounter(): void {
  _taskCmdCounter = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source payload input type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured data that can be embedded in the `source_payload` of an
 * `InteractionIntentEntity` to signal that the intent should trigger a task
 * operation.
 *
 * This is the "carrier" record recognised by `translateTaskIntentToCommand`.
 */
export interface TaskIntentPayload {
  /** The task operation to perform. */
  readonly taskOperation: TaskOperation;
  /**
   * Task title — required for `create` operations; ignored otherwise.
   */
  readonly title?: string;
  /**
   * Task description — meaningful for `create` operations only.
   */
  readonly description?: string;
  /**
   * Task priority — used for both `create` (initial priority) and
   * `reprioritize` (new priority).
   * @default "normal"
   */
  readonly priority?: TaskPriorityLevel;
  /**
   * Previous priority — captured for `reprioritize` operations for audit
   * transparency.
   */
  readonly previousPriority?: TaskPriorityLevel;
  /**
   * Target task ID — required for `cancel` and `reprioritize` operations.
   */
  readonly taskId?: string;
  /**
   * Agent ID for task assignment — used with `create` operations to
   * immediately assign the new task.
   */
  readonly assignedAgentId?: string;
  /**
   * Parent task ID for sub-task relationships — used with `create`.
   */
  readonly parentTaskId?: string;
  /**
   * Tags for the new task — used with `create`.
   */
  readonly tags?: readonly string[];
  /**
   * Human-readable cancel reason — used with `cancel`.
   * @default "user_requested"
   */
  readonly reason?: string;
  /** Any additional context fields forwarded verbatim. */
  readonly [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: TaskIntentPayload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a validated `TaskIntentPayload` to embed in the `source_payload` of
 * an `InteractionIntentEntity`.
 *
 * This is the recommended way to add task intent data to a fixture interaction
 * intent — it ensures the `taskOperation` field is present and that required
 * fields are validated for each operation:
 *   - `create`       requires `title`
 *   - `cancel`       requires `taskId`
 *   - `reprioritize` requires `taskId` and `priority`
 *
 * @throws {TypeError} on validation failure (missing required fields)
 *
 * @example
 * ```ts
 * const payload = makeTaskIntentPayload({
 *   taskOperation: "reprioritize",
 *   taskId: "task-abc123",
 *   priority: "critical",
 *   previousPriority: "normal",
 * });
 * ```
 */
export function makeTaskIntentPayload(
  opts: {
    taskOperation: TaskOperation;
    title?: string;
    description?: string;
    priority?: TaskPriorityLevel;
    previousPriority?: TaskPriorityLevel;
    taskId?: string;
    assignedAgentId?: string;
    parentTaskId?: string;
    tags?: readonly string[];
    reason?: string;
  } & Record<string, unknown>,
): TaskIntentPayload {
  const {
    taskOperation,
    title,
    description,
    priority,
    previousPriority,
    taskId,
    assignedAgentId,
    parentTaskId,
    tags,
    reason,
    ...rest
  } = opts;

  if (taskOperation === "create" && (!title || title.trim().length === 0)) {
    throw new TypeError(
      "makeTaskIntentPayload: 'title' is required for 'create' operation",
    );
  }

  if (taskOperation === "cancel" && (!taskId || taskId.trim().length === 0)) {
    throw new TypeError(
      "makeTaskIntentPayload: 'taskId' is required for 'cancel' operation",
    );
  }

  if (taskOperation === "reprioritize") {
    if (!taskId || taskId.trim().length === 0) {
      throw new TypeError(
        "makeTaskIntentPayload: 'taskId' is required for 'reprioritize' operation",
      );
    }
    if (!priority || !isTaskPriorityLevel(priority)) {
      throw new TypeError(
        "makeTaskIntentPayload: 'priority' must be a valid TaskPriorityLevel for 'reprioritize' operation",
      );
    }
  }

  return Object.freeze({
    taskOperation,
    ...(title           !== undefined ? { title }           : {}),
    ...(description     !== undefined ? { description }     : {}),
    ...(priority        !== undefined ? { priority }        : {}),
    ...(previousPriority !== undefined ? { previousPriority } : {}),
    ...(taskId          !== undefined ? { taskId }          : {}),
    ...(assignedAgentId !== undefined ? { assignedAgentId } : {}),
    ...(parentTaskId    !== undefined ? { parentTaskId }    : {}),
    ...(tags            !== undefined ? { tags }            : {}),
    ...(reason          !== undefined ? { reason }          : {}),
    ...rest,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: TaskCommandEntity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an immutable `TaskCommandEntity` from the resolved components.
 *
 * @param operation       — task operation kind
 * @param payload         — operation-specific typed payload
 * @param sourceIntentId  — intent_id of the originating intent entity
 * @param sourceGesture   — gesture_type of the originating intent entity
 * @param tsOverride      — override the creation timestamp (used in tests)
 */
export function makeTaskCommand(opts: {
  operation:      TaskOperation;
  payload:        TaskOperationPayload;
  sourceIntentId: string;
  sourceGesture:  string;
  tsOverride?:    number;
}): TaskCommandEntity {
  const ts     = opts.tsOverride ?? Date.now();
  const ts_iso = new Date(ts).toISOString();

  return Object.freeze({
    command_id:        generateTaskCommandId(),
    ts,
    ts_iso,
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
 * Translate an `InteractionIntentEntity` into a `TaskCommandEntity`.
 *
 * Returns `null` if:
 *   • `entity.source_payload.taskOperation` is absent
 *   • The `taskOperation` value is not a valid `TaskOperation`
 *   • `operation === "create"` but `source_payload.title` is missing/empty
 *   • `operation === "cancel"` but `source_payload.taskId` is missing/empty
 *   • `operation === "reprioritize"` but `taskId` or `priority` is missing
 *
 * The function is **pure** — it produces the same output for the same input
 * and has no side effects.  Command dispatch is the caller's responsibility.
 *
 * Note: Unlike the agent lifecycle pipeline (Sub-AC 7c), this pipeline accepts
 * intents from any `target_entity_type` — task affordances can appear as
 * fixture buttons on any entity (agent, room, or standalone task panel).
 * The discriminating signal is the `taskOperation` key in `source_payload`.
 *
 * @param entity — A canonical `InteractionIntentEntity` from the dispatcher
 * @returns      — A frozen `TaskCommandEntity`, or null
 */
export function translateTaskIntentToCommand(
  entity: InteractionIntentEntity,
): TaskCommandEntity | null {
  const payload = entity.source_payload as Record<string, unknown>;
  const opRaw   = payload["taskOperation"];

  if (!isTaskOperation(opRaw)) return null;

  const operation = opRaw;

  switch (operation) {
    case "create": {
      const title = payload["title"];
      if (typeof title !== "string" || title.trim().length === 0) return null;

      const description = typeof payload["description"] === "string"
        ? payload["description"]
        : undefined;

      const priorityRaw = payload["priority"];
      const priority: TaskPriorityLevel = isTaskPriorityLevel(priorityRaw)
        ? priorityRaw
        : "normal";

      const assignedAgentId = typeof payload["assignedAgentId"] === "string"
        ? payload["assignedAgentId"]
        : undefined;

      const parentTaskId = typeof payload["parentTaskId"] === "string"
        ? payload["parentTaskId"]
        : undefined;

      const rawTags = payload["tags"];
      const tags: readonly string[] | undefined =
        Array.isArray(rawTags) &&
        rawTags.every((t): t is string => typeof t === "string")
          ? (rawTags as string[])
          : undefined;

      const operationPayload: TaskCreatePayload = Object.freeze({
        operation:   "create",
        title:       title.trim(),
        priority,
        ...(description     !== undefined ? { description }     : {}),
        ...(assignedAgentId !== undefined ? { assignedAgentId } : {}),
        ...(parentTaskId    !== undefined ? { parentTaskId }    : {}),
        ...(tags            !== undefined ? { tags }            : {}),
      });

      return makeTaskCommand({
        operation,
        payload:        operationPayload,
        sourceIntentId: entity.intent_id,
        sourceGesture:  entity.gesture_type,
      });
    }

    case "cancel": {
      const taskId = payload["taskId"];
      if (typeof taskId !== "string" || taskId.trim().length === 0) return null;

      const reason = typeof payload["reason"] === "string"
        ? payload["reason"]
        : "user_requested";

      const operationPayload: TaskCancelPayload = Object.freeze({
        operation: "cancel",
        task_id:   taskId,
        reason,
      });

      return makeTaskCommand({
        operation,
        payload:        operationPayload,
        sourceIntentId: entity.intent_id,
        sourceGesture:  entity.gesture_type,
      });
    }

    case "reprioritize": {
      const taskId = payload["taskId"];
      if (typeof taskId !== "string" || taskId.trim().length === 0) return null;

      const newPriorityRaw = payload["priority"];
      if (!isTaskPriorityLevel(newPriorityRaw)) return null;

      const previousPriority = isTaskPriorityLevel(payload["previousPriority"])
        ? payload["previousPriority"]
        : undefined;

      const operationPayload: TaskReprioritizePayload = Object.freeze({
        operation:    "reprioritize",
        task_id:      taskId,
        new_priority: newPriorityRaw,
        ...(previousPriority !== undefined ? { previous_priority: previousPriority } : {}),
      });

      return makeTaskCommand({
        operation,
        payload:        operationPayload,
        sourceIntentId: entity.intent_id,
        sourceGesture:  entity.gesture_type,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch pipeline helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate an array of `InteractionIntentEntity` objects, returning only
 * those that produce a valid `TaskCommandEntity`.
 *
 * Convenience wrapper around `translateTaskIntentToCommand` for processing
 * a batch (e.g., flushing the dispatcher ring-buffer).
 *
 * @param entities — Array of canonical intent entities from the dispatcher
 * @returns        — Array of task command entities (no nulls)
 */
export function translateTaskIntentBatch(
  entities: readonly InteractionIntentEntity[],
): TaskCommandEntity[] {
  const results: TaskCommandEntity[] = [];
  for (const entity of entities) {
    const cmd = translateTaskIntentToCommand(entity);
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
 * Maps a `TaskOperation` to the corresponding protocol-level `GuiCommandType`
 * string that `useCommandFileWriter` accepts.
 *
 * This mapping is the single source of truth for 7d task → protocol command
 * type translation.
 */
export const TASK_OPERATION_TO_COMMAND_TYPE: Readonly<
  Record<TaskOperation, string>
> = Object.freeze({
  create:       "task.create",
  cancel:       "task.cancel",
  reprioritize: "task.reprioritize",
} as const);

/**
 * Resolve the protocol command type string for a given task operation.
 *
 * @param operation — Task operation from a `TaskCommandEntity`
 * @returns         — Protocol command type string (e.g. "task.create")
 */
export function resolveTaskCommandType(operation: TaskOperation): string {
  return TASK_OPERATION_TO_COMMAND_TYPE[operation];
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

/** Type guard: narrows unknown to `TaskCommandEntity`. */
export function isTaskCommandEntity(v: unknown): v is TaskCommandEntity {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["command_id"]        === "string" &&
    typeof r["operation"]         === "string" &&
    isTaskOperation(r["operation"]) &&
    typeof r["operation_payload"] === "object" && r["operation_payload"] !== null &&
    typeof r["source_intent_id"]  === "string" &&
    typeof r["ts"]                === "number"
  );
}

/** Type guard: narrows `TaskOperationPayload` to `TaskCreatePayload`. */
export function isTaskCreatePayload(
  p: TaskOperationPayload,
): p is TaskCreatePayload {
  return p.operation === "create";
}

/** Type guard: narrows `TaskOperationPayload` to `TaskCancelPayload`. */
export function isTaskCancelPayload(
  p: TaskOperationPayload,
): p is TaskCancelPayload {
  return p.operation === "cancel";
}

/** Type guard: narrows `TaskOperationPayload` to `TaskReprioritizePayload`. */
export function isTaskReprioritizePayload(
  p: TaskOperationPayload,
): p is TaskReprioritizePayload {
  return p.operation === "reprioritize";
}
