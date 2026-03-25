/**
 * task-intent-command-pipeline.test.ts — Sub-AC 7d
 *
 * Verifies that interaction_intents originating from task affordances produce
 * command entities covering create, cancel, and reprioritize operations with
 * correct payload schemas.
 *
 * Test surface:
 *   A. Operation type coverage — create / cancel / reprioritize each produce a command
 *   B. operation_payload correctness — typed sub-objects with correct fields
 *   C. source_intent_id linkage — command traces back to originating intent
 *   D. Command entity structure invariants (frozen, JSON-serialisable, ts fields)
 *   E. Edge cases — missing required fields return null
 *   F. Batch pipeline helper
 *   G. TASK_OPERATION_TO_COMMAND_TYPE mapping
 *   H. makeTaskIntentPayload factory validation
 *   I. Type guards
 *   J. Priority default ("normal") applied when absent on create
 *   K. Cancel reason default ("user_requested") applied when absent
 *
 * All tests are pure — no React, Three.js, WebSocket, or async I/O.
 * Tests can run in Node.js via `vitest run`.
 *
 * Test ID scheme:  7d-task-1  through 7d-task-N
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  // Core pipeline
  translateTaskIntentToCommand,
  translateTaskIntentBatch,
  // Factories
  makeTaskIntentPayload,
  makeTaskCommand,
  // Command type mapping
  TASK_OPERATION_TO_COMMAND_TYPE,
  resolveTaskCommandType,
  // Type guards
  isTaskOperation,
  isTaskCommandEntity,
  isTaskCreatePayload,
  isTaskCancelPayload,
  isTaskReprioritizePayload,
  isTaskPriorityLevel,
  // Constants
  TASK_OPERATIONS,
  TASK_PRIORITY_LEVELS,
  // Counter reset for deterministic IDs in tests
  _resetTaskCommandCounter,
  // Types
  type TaskOperation,
  type TaskCommandEntity,
  type TaskCreatePayload,
  type TaskCancelPayload,
  type TaskReprioritizePayload,
} from "../task-intent-command-pipeline.js";

import {
  makeInteractionIntentEntity,
} from "../interaction-intent-entity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build an intent entity with the given task intent payload embedded. */
function makeTaskAffordanceIntent(
  payloadOpts: Parameters<typeof makeTaskIntentPayload>[0],
  targetId = "task-fixture-btn",
) {
  const payload = makeTaskIntentPayload(payloadOpts);
  return makeInteractionIntentEntity({
    target_entity_type: "fixture",
    gesture_type:       "click",
    target_id:          targetId,
    ts:                 1_700_000_000_000,
    layer:              "domain",
    source_payload:     payload,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Operation type coverage
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: A. Operation type coverage", () => {
  beforeEach(() => {
    _resetTaskCommandCounter();
  });

  it("7d-task-1: create operation produces a TaskCommandEntity", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "create",
      title:         "Implement feature X",
      priority:      "high",
    });
    const cmd = translateTaskIntentToCommand(entity);
    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("create");
  });

  it("7d-task-2: cancel operation produces a TaskCommandEntity", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "cancel",
      taskId:        "task-abc123",
    });
    const cmd = translateTaskIntentToCommand(entity);
    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("cancel");
  });

  it("7d-task-3: reprioritize operation produces a TaskCommandEntity", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "reprioritize",
      taskId:        "task-abc123",
      priority:      "critical",
    });
    const cmd = translateTaskIntentToCommand(entity);
    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("reprioritize");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. operation_payload correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: B. operation_payload correctness", () => {
  beforeEach(() => {
    _resetTaskCommandCounter();
  });

  it("7d-task-4: create payload has correct title, priority, operation", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation:   "create",
      title:           "Research task",
      priority:        "normal",
      assignedAgentId: "researcher-1",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    expect(isTaskCreatePayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as TaskCreatePayload;
    expect(p.operation).toBe("create");
    expect(p.title).toBe("Research task");
    expect(p.priority).toBe("normal");
    expect(p.assignedAgentId).toBe("researcher-1");
  });

  it("7d-task-5: cancel payload has correct task_id and reason", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "cancel",
      taskId:        "task-xyz",
      reason:        "blocked_indefinitely",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    expect(isTaskCancelPayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as TaskCancelPayload;
    expect(p.operation).toBe("cancel");
    expect(p.task_id).toBe("task-xyz");
    expect(p.reason).toBe("blocked_indefinitely");
  });

  it("7d-task-6: reprioritize payload has correct task_id, new_priority", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation:    "reprioritize",
      taskId:           "task-001",
      priority:         "critical",
      previousPriority: "low",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    expect(isTaskReprioritizePayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as TaskReprioritizePayload;
    expect(p.operation).toBe("reprioritize");
    expect(p.task_id).toBe("task-001");
    expect(p.new_priority).toBe("critical");
    expect(p.previous_priority).toBe("low");
  });

  it("7d-task-7: create payload includes optional tags when provided", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "create",
      title:         "Tagged task",
      tags:          ["frontend", "ac-7"],
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    const p = cmd.operation_payload as TaskCreatePayload;
    expect(p.tags).toEqual(["frontend", "ac-7"]);
  });

  it("7d-task-8: create payload includes optional parentTaskId when provided", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "create",
      title:         "Sub-task",
      parentTaskId:  "task-parent-001",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    const p = cmd.operation_payload as TaskCreatePayload;
    expect(p.parentTaskId).toBe("task-parent-001");
  });

  it("7d-task-9: create payload includes optional description when provided", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "create",
      title:         "Described task",
      description:   "A longer description of the task goal",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    const p = cmd.operation_payload as TaskCreatePayload;
    expect(p.description).toBe("A longer description of the task goal");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. source_intent_id linkage
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: C. source_intent_id linkage", () => {
  it("7d-task-10: command.source_intent_id matches originating intent.intent_id", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "cancel",
      taskId:        "task-cancel-link",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    expect(cmd.source_intent_id).toBe(entity.intent_id);
  });

  it("7d-task-11: command.source_gesture matches originating intent.gesture_type", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "create",
      title:         "gesture link",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    expect(cmd.source_gesture).toBe("click");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Command entity structure invariants
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: D. Command entity structure invariants", () => {
  beforeEach(() => {
    _resetTaskCommandCounter();
  });

  it("7d-task-12: command entity has all required fields", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "create",
      title:         "Struct test",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    expect(typeof cmd.command_id).toBe("string");
    expect(cmd.command_id.startsWith("tcmd_")).toBe(true);
    expect(typeof cmd.ts).toBe("number");
    expect(typeof cmd.ts_iso).toBe("string");
    expect(cmd.ts_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof cmd.operation).toBe("string");
    expect(typeof cmd.operation_payload).toBe("object");
    expect(typeof cmd.source_intent_id).toBe("string");
    expect(typeof cmd.source_gesture).toBe("string");
  });

  it("7d-task-13: command entity is frozen (immutable)", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "create",
      title:         "Frozen test",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    expect(Object.isFrozen(cmd)).toBe(true);
  });

  it("7d-task-14: command entity is JSON-serialisable (record transparency)", () => {
    const entity = makeTaskAffordanceIntent({
      taskOperation: "cancel",
      taskId:        "task-json-test",
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    expect(() => JSON.stringify(cmd)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(cmd));
    expect(parsed.command_id).toBe(cmd.command_id);
    expect(parsed.operation).toBe(cmd.operation);
  });

  it("7d-task-15: command IDs are monotonically unique (counter increments)", () => {
    _resetTaskCommandCounter();
    const e1 = makeTaskAffordanceIntent({ taskOperation: "cancel", taskId: "t1" });
    const e2 = makeTaskAffordanceIntent({ taskOperation: "cancel", taskId: "t2" });
    const cmd1 = translateTaskIntentToCommand(e1)!;
    const cmd2 = translateTaskIntentToCommand(e2)!;
    expect(cmd1.command_id).not.toBe(cmd2.command_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Edge cases — null returns
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: E. Edge cases — null returns", () => {
  it("7d-task-16: returns null when taskOperation is absent", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { unrelated: true },
    });
    expect(translateTaskIntentToCommand(entity)).toBeNull();
  });

  it("7d-task-17: returns null when taskOperation is not a valid string", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { taskOperation: "unknown_op" },
    });
    expect(translateTaskIntentToCommand(entity)).toBeNull();
  });

  it("7d-task-18: create returns null when title is missing", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { taskOperation: "create" },
    });
    expect(translateTaskIntentToCommand(entity)).toBeNull();
  });

  it("7d-task-19: create returns null when title is empty string", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { taskOperation: "create", title: "   " },
    });
    expect(translateTaskIntentToCommand(entity)).toBeNull();
  });

  it("7d-task-20: cancel returns null when taskId is missing", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { taskOperation: "cancel" },
    });
    expect(translateTaskIntentToCommand(entity)).toBeNull();
  });

  it("7d-task-21: reprioritize returns null when taskId is missing", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { taskOperation: "reprioritize", priority: "high" },
    });
    expect(translateTaskIntentToCommand(entity)).toBeNull();
  });

  it("7d-task-22: reprioritize returns null when priority is invalid", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { taskOperation: "reprioritize", taskId: "t1", priority: "ultra" },
    });
    expect(translateTaskIntentToCommand(entity)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Batch pipeline helper
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: F. Batch pipeline helper", () => {
  it("7d-task-23: translateTaskIntentBatch filters nulls and returns only valid commands", () => {
    const valid1 = makeTaskAffordanceIntent({ taskOperation: "cancel", taskId: "t1" });
    const valid2 = makeTaskAffordanceIntent({ taskOperation: "create", title: "T2" });
    const invalid = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { noOp: true },
    });

    const results = translateTaskIntentBatch([valid1, invalid, valid2]);
    expect(results).toHaveLength(2);
    expect(results[0]!.operation).toBe("cancel");
    expect(results[1]!.operation).toBe("create");
  });

  it("7d-task-24: translateTaskIntentBatch returns empty array for empty input", () => {
    expect(translateTaskIntentBatch([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. TASK_OPERATION_TO_COMMAND_TYPE mapping
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: G. TASK_OPERATION_TO_COMMAND_TYPE mapping", () => {
  it("7d-task-25: create maps to 'task.create'", () => {
    expect(TASK_OPERATION_TO_COMMAND_TYPE["create"]).toBe("task.create");
    expect(resolveTaskCommandType("create")).toBe("task.create");
  });

  it("7d-task-26: cancel maps to 'task.cancel'", () => {
    expect(TASK_OPERATION_TO_COMMAND_TYPE["cancel"]).toBe("task.cancel");
    expect(resolveTaskCommandType("cancel")).toBe("task.cancel");
  });

  it("7d-task-27: reprioritize maps to 'task.reprioritize'", () => {
    expect(TASK_OPERATION_TO_COMMAND_TYPE["reprioritize"]).toBe("task.reprioritize");
    expect(resolveTaskCommandType("reprioritize")).toBe("task.reprioritize");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. makeTaskIntentPayload factory validation
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: H. makeTaskIntentPayload factory validation", () => {
  it("7d-task-28: throws when create is missing title", () => {
    expect(() =>
      makeTaskIntentPayload({ taskOperation: "create" })
    ).toThrow(TypeError);
  });

  it("7d-task-29: throws when cancel is missing taskId", () => {
    expect(() =>
      makeTaskIntentPayload({ taskOperation: "cancel" })
    ).toThrow(TypeError);
  });

  it("7d-task-30: throws when reprioritize is missing taskId", () => {
    expect(() =>
      makeTaskIntentPayload({ taskOperation: "reprioritize", priority: "high" })
    ).toThrow(TypeError);
  });

  it("7d-task-31: throws when reprioritize has invalid priority", () => {
    expect(() =>
      makeTaskIntentPayload({
        taskOperation: "reprioritize",
        taskId:        "t1",
        priority:      "ultra" as never,
      })
    ).toThrow(TypeError);
  });

  it("7d-task-32: returns frozen payload for valid create", () => {
    const p = makeTaskIntentPayload({
      taskOperation: "create",
      title:         "Valid",
    });
    expect(Object.isFrozen(p)).toBe(true);
    expect(p.taskOperation).toBe("create");
    expect(p.title).toBe("Valid");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. Type guards
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: I. Type guards", () => {
  it("7d-task-33: isTaskOperation narrows valid operations", () => {
    expect(isTaskOperation("create")).toBe(true);
    expect(isTaskOperation("cancel")).toBe(true);
    expect(isTaskOperation("reprioritize")).toBe(true);
    expect(isTaskOperation("delete")).toBe(false);
    expect(isTaskOperation(null)).toBe(false);
    expect(isTaskOperation(42)).toBe(false);
  });

  it("7d-task-34: isTaskCommandEntity validates complete entity", () => {
    const entity = makeTaskAffordanceIntent({ taskOperation: "cancel", taskId: "t1" });
    const cmd = translateTaskIntentToCommand(entity)!;
    expect(isTaskCommandEntity(cmd)).toBe(true);
    expect(isTaskCommandEntity(null)).toBe(false);
    expect(isTaskCommandEntity({ command_id: "x" })).toBe(false);
  });

  it("7d-task-35: isTaskCreatePayload / isTaskCancelPayload / isTaskReprioritizePayload discriminate correctly", () => {
    const createEntity = makeTaskAffordanceIntent({ taskOperation: "create", title: "T" });
    const cancelEntity = makeTaskAffordanceIntent({ taskOperation: "cancel", taskId: "t" });
    const reprioEntity = makeTaskAffordanceIntent({
      taskOperation: "reprioritize", taskId: "t", priority: "high",
    });

    const createCmd = translateTaskIntentToCommand(createEntity)!;
    const cancelCmd = translateTaskIntentToCommand(cancelEntity)!;
    const reprioCmd = translateTaskIntentToCommand(reprioEntity)!;

    expect(isTaskCreatePayload(createCmd.operation_payload)).toBe(true);
    expect(isTaskCancelPayload(createCmd.operation_payload)).toBe(false);
    expect(isTaskReprioritizePayload(createCmd.operation_payload)).toBe(false);

    expect(isTaskCancelPayload(cancelCmd.operation_payload)).toBe(true);
    expect(isTaskCreatePayload(cancelCmd.operation_payload)).toBe(false);

    expect(isTaskReprioritizePayload(reprioCmd.operation_payload)).toBe(true);
    expect(isTaskCreatePayload(reprioCmd.operation_payload)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J. Priority defaults
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: J. Priority defaults", () => {
  it("7d-task-36: create defaults priority to 'normal' when absent from payload", () => {
    // Directly inject payload without priority field
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { taskOperation: "create", title: "No priority" },
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    const p = cmd.operation_payload as TaskCreatePayload;
    expect(p.priority).toBe("normal");
  });

  it("7d-task-37: isTaskPriorityLevel correctly validates all levels", () => {
    expect(isTaskPriorityLevel("critical")).toBe(true);
    expect(isTaskPriorityLevel("high")).toBe(true);
    expect(isTaskPriorityLevel("normal")).toBe(true);
    expect(isTaskPriorityLevel("low")).toBe(true);
    expect(isTaskPriorityLevel("urgent")).toBe(false);
    expect(isTaskPriorityLevel(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// K. Cancel reason default
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: K. Cancel reason default", () => {
  it("7d-task-38: cancel defaults reason to 'user_requested' when absent", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "fixture",
      gesture_type:       "click",
      target_id:          "btn",
      ts:                 Date.now(),
      layer:              "domain",
      source_payload:     { taskOperation: "cancel", taskId: "task-999" },
    });
    const cmd = translateTaskIntentToCommand(entity)!;
    const p = cmd.operation_payload as TaskCancelPayload;
    expect(p.reason).toBe("user_requested");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK_OPERATIONS set completeness
// ─────────────────────────────────────────────────────────────────────────────

describe("7d-task: TASK_OPERATIONS set completeness", () => {
  it("7d-task-39: TASK_OPERATIONS contains all three operations", () => {
    const ops: TaskOperation[] = ["create", "cancel", "reprioritize"];
    for (const op of ops) {
      expect(TASK_OPERATIONS.has(op)).toBe(true);
    }
    expect(TASK_OPERATIONS.size).toBe(3);
  });

  it("7d-task-40: TASK_PRIORITY_LEVELS contains all four levels", () => {
    for (const level of ["critical", "high", "normal", "low"]) {
      expect(TASK_PRIORITY_LEVELS.has(level)).toBe(true);
    }
    expect(TASK_PRIORITY_LEVELS.size).toBe(4);
  });
});
