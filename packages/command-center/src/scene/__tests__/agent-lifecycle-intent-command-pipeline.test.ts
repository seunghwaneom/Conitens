/**
 * agent-lifecycle-intent-command-pipeline.test.ts — Sub-AC 7c
 *
 * Verifies that interaction_intents originating from agent_instance affordances
 * produce command entities covering start, stop, and reassign operations with
 * correct agent_id and operation payload fields.
 *
 * Test surface:
 *   A. Operation type coverage — start / stop / reassign each produce a command
 *   B. agent_id correctness — extracted from intent.target_id
 *   C. operation payload correctness — typed sub-objects with correct fields
 *   D. source_intent_id linkage — command traces back to originating intent
 *   E. Command entity structure invariants
 *   F. Edge cases — wrong entity type, missing operation, missing targetRoomId
 *   G. Batch pipeline helper
 *   H. LIFECYCLE_OPERATION_TO_COMMAND_TYPE mapping
 *   I. makeAgentLifecycleIntentPayload factory validation
 *   J. Type guards
 *
 * All tests are pure — no React, Three.js, WebSocket, or async I/O.
 * Tests can run in Node.js via `vitest run`.
 *
 * Test ID scheme:  7c-1  through 7c-N
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  // Core pipeline
  translateAgentInstanceIntentToCommand,
  translateAgentInstanceIntentBatch,
  // Factories
  makeAgentLifecycleIntentPayload,
  makeAgentLifecycleCommand,
  // Command type mapping
  LIFECYCLE_OPERATION_TO_COMMAND_TYPE,
  resolveCommandType,
  // Type guards
  isAgentLifecycleOperation,
  isAgentLifecycleCommandEntity,
  isAgentStartPayload,
  isAgentStopPayload,
  isAgentReassignPayload,
  // Constants
  AGENT_LIFECYCLE_OPERATIONS,
  // Counter reset for deterministic IDs in tests
  _resetLifecycleCommandCounter,
  // Types
  type AgentLifecycleOperation,
  type AgentLifecycleCommandEntity,
  type AgentStartPayload,
  type AgentStopPayload,
  type AgentReassignPayload,
} from "../agent-lifecycle-intent-command-pipeline.js";

import {
  makeInteractionIntentEntity,
} from "../interaction-intent-entity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal agent_instance InteractionIntentEntity with an embedded lifecycle operation. */
function makeAgentInstanceIntent(
  agentId: string,
  lifecycleOperation: AgentLifecycleOperation,
  extra?: Record<string, unknown>,
) {
  const payload = makeAgentLifecycleIntentPayload({
    lifecycleOperation,
    agentId,
    ...(lifecycleOperation === "reassign" && !extra?.targetRoomId
      ? { targetRoomId: "fallback-room" }
      : {}),
    ...extra,
  });

  return makeInteractionIntentEntity({
    target_entity_type: "agent_instance",
    gesture_type:       "context_menu",
    target_id:          agentId,
    ts:                 Date.now(),
    layer:              "meta",
    source_payload:     payload,
  });
}

/** Build a NON-agent_instance intent (building layer). */
function makeBuildingIntent() {
  return makeInteractionIntentEntity({
    target_entity_type: "building",
    gesture_type:       "click",
    target_id:          "building-hq",
    ts:                 Date.now(),
    layer:              "domain",
    source_payload:     { intent: "BUILDING_CLICKED" },
  });
}

/** Build an agent_instance intent with NO lifecycleOperation in the payload. */
function makeAgentInstanceIntentNoOp(agentId: string) {
  return makeInteractionIntentEntity({
    target_entity_type: "agent_instance",
    gesture_type:       "click",
    target_id:          agentId,
    ts:                 Date.now(),
    layer:              "meta",
    source_payload: {
      agentId,
      agentRole: "researcher",
      agentStatus: "active",
      // no lifecycleOperation field
    },
  });
}

beforeEach(() => {
  _resetLifecycleCommandCounter();
});

// ─────────────────────────────────────────────────────────────────────────────
// A. Operation type coverage — start / stop / reassign
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-A — Operation type coverage", () => {

  // 7c-1
  it("start operation: returns a non-null AgentLifecycleCommandEntity", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity);

    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("start");
  });

  // 7c-2
  it("stop operation: returns a non-null AgentLifecycleCommandEntity", () => {
    const entity = makeAgentInstanceIntent("manager-1", "stop");
    const cmd    = translateAgentInstanceIntentToCommand(entity);

    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("stop");
  });

  // 7c-3
  it("reassign operation: returns a non-null AgentLifecycleCommandEntity", () => {
    const entity = makeAgentInstanceIntent("implementer-1", "reassign", {
      targetRoomId: "research-lab",
    });
    const cmd = translateAgentInstanceIntentToCommand(entity);

    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("reassign");
  });

  // 7c-4
  it("all three operations are covered by AGENT_LIFECYCLE_OPERATIONS set", () => {
    const ops: AgentLifecycleOperation[] = ["start", "stop", "reassign"];
    for (const op of ops) {
      expect(AGENT_LIFECYCLE_OPERATIONS.has(op)).toBe(true);
    }
    expect(AGENT_LIFECYCLE_OPERATIONS.size).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. agent_id correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-B — agent_id correctness", () => {

  // 7c-5
  it("agent_id is extracted from entity.target_id for start operation", () => {
    const entity = makeAgentInstanceIntent("researcher-7", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity);

    expect(cmd!.agent_id).toBe("researcher-7");
  });

  // 7c-6
  it("agent_id is extracted from entity.target_id for stop operation", () => {
    const entity = makeAgentInstanceIntent("manager-99", "stop");
    const cmd    = translateAgentInstanceIntentToCommand(entity);

    expect(cmd!.agent_id).toBe("manager-99");
  });

  // 7c-7
  it("agent_id is extracted from entity.target_id for reassign operation", () => {
    const entity = makeAgentInstanceIntent("implementer-42", "reassign", {
      targetRoomId: "ops-room",
    });
    const cmd = translateAgentInstanceIntentToCommand(entity);

    expect(cmd!.agent_id).toBe("implementer-42");
  });

  // 7c-8
  it("agent_id is stable across multiple translate calls for the same entity", () => {
    const entity = makeAgentInstanceIntent("validator-5", "start");
    const cmd1   = translateAgentInstanceIntentToCommand(entity);
    const cmd2   = translateAgentInstanceIntentToCommand(entity);

    expect(cmd1!.agent_id).toBe("validator-5");
    expect(cmd2!.agent_id).toBe("validator-5");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. operation payload correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-C — operation payload correctness", () => {

  // 7c-9
  it("start: operation_payload.operation === 'start'", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(cmd.operation_payload.operation).toBe("start");
  });

  // 7c-10
  it("start: operation_payload carries optional persona when provided", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start", {
      persona: "researcher",
    });
    const cmd = translateAgentInstanceIntentToCommand(entity)!;

    expect(isAgentStartPayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as AgentStartPayload;
    expect(p.persona).toBe("researcher");
  });

  // 7c-11
  it("start: operation_payload has no persona field when omitted", () => {
    const entity = makeAgentInstanceIntent("researcher-2", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    const p = cmd.operation_payload as AgentStartPayload;
    expect(p.persona).toBeUndefined();
  });

  // 7c-12
  it("stop: operation_payload.operation === 'stop'", () => {
    const entity = makeAgentInstanceIntent("manager-1", "stop");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(cmd.operation_payload.operation).toBe("stop");
  });

  // 7c-13
  it("stop: operation_payload.reason defaults to 'user_requested' when not provided", () => {
    const entity = makeAgentInstanceIntent("manager-1", "stop");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(isAgentStopPayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as AgentStopPayload;
    expect(p.reason).toBe("user_requested");
  });

  // 7c-14
  it("stop: operation_payload carries custom reason when provided", () => {
    const entity = makeAgentInstanceIntent("manager-2", "stop", {
      reason: "task_completed",
    });
    const cmd = translateAgentInstanceIntentToCommand(entity)!;

    const p = cmd.operation_payload as AgentStopPayload;
    expect(p.reason).toBe("task_completed");
  });

  // 7c-15
  it("reassign: operation_payload.operation === 'reassign'", () => {
    const entity = makeAgentInstanceIntent("implementer-1", "reassign", {
      targetRoomId: "research-lab",
    });
    const cmd = translateAgentInstanceIntentToCommand(entity)!;

    expect(cmd.operation_payload.operation).toBe("reassign");
  });

  // 7c-16
  it("reassign: operation_payload.target_room_id is populated from targetRoomId", () => {
    const entity = makeAgentInstanceIntent("implementer-3", "reassign", {
      targetRoomId: "war-room",
    });
    const cmd = translateAgentInstanceIntentToCommand(entity)!;

    expect(isAgentReassignPayload(cmd.operation_payload)).toBe(true);
    const p = cmd.operation_payload as AgentReassignPayload;
    expect(p.target_room_id).toBe("war-room");
  });

  // 7c-17
  it("operation_payload is a frozen object (immutable)", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(Object.isFrozen(cmd.operation_payload)).toBe(true);
  });

  // 7c-18
  it("start payload isAgentStartPayload type guard returns true", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(isAgentStartPayload(cmd.operation_payload)).toBe(true);
    expect(isAgentStopPayload(cmd.operation_payload)).toBe(false);
    expect(isAgentReassignPayload(cmd.operation_payload)).toBe(false);
  });

  // 7c-19
  it("stop payload isAgentStopPayload type guard returns true", () => {
    const entity = makeAgentInstanceIntent("manager-1", "stop");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(isAgentStopPayload(cmd.operation_payload)).toBe(true);
    expect(isAgentStartPayload(cmd.operation_payload)).toBe(false);
    expect(isAgentReassignPayload(cmd.operation_payload)).toBe(false);
  });

  // 7c-20
  it("reassign payload isAgentReassignPayload type guard returns true", () => {
    const entity = makeAgentInstanceIntent("implementer-1", "reassign", {
      targetRoomId: "ops-floor",
    });
    const cmd = translateAgentInstanceIntentToCommand(entity)!;

    expect(isAgentReassignPayload(cmd.operation_payload)).toBe(true);
    expect(isAgentStartPayload(cmd.operation_payload)).toBe(false);
    expect(isAgentStopPayload(cmd.operation_payload)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. source_intent_id linkage
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-D — source_intent_id linkage", () => {

  // 7c-21
  it("command.source_intent_id matches the originating entity.intent_id", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(cmd.source_intent_id).toBe(entity.intent_id);
  });

  // 7c-22
  it("command.source_gesture matches the originating entity.gesture_type", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "stop");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(cmd.source_gesture).toBe(entity.gesture_type);
    expect(cmd.source_gesture).toBe("context_menu");
  });

  // 7c-23
  it("source_intent_id is a non-empty string for all three operations", () => {
    const ops: AgentLifecycleOperation[] = ["start", "stop", "reassign"];
    for (const op of ops) {
      const extra = op === "reassign" ? { targetRoomId: "room-x" } : {};
      const entity = makeAgentInstanceIntent(`agent-${op}`, op, extra);
      const cmd    = translateAgentInstanceIntentToCommand(entity)!;
      expect(typeof cmd.source_intent_id).toBe("string");
      expect(cmd.source_intent_id.length).toBeGreaterThan(0);
    }
  });

  // 7c-24
  it("two separate intents produce commands with distinct source_intent_ids", () => {
    const e1 = makeAgentInstanceIntent("researcher-1", "start");
    const e2 = makeAgentInstanceIntent("researcher-2", "start");

    const cmd1 = translateAgentInstanceIntentToCommand(e1)!;
    const cmd2 = translateAgentInstanceIntentToCommand(e2)!;

    expect(cmd1.source_intent_id).not.toBe(cmd2.source_intent_id);
    expect(cmd1.source_intent_id).toBe(e1.intent_id);
    expect(cmd2.source_intent_id).toBe(e2.intent_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Command entity structure invariants
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-E — Command entity structure invariants", () => {

  // 7c-25
  it("command entity is a frozen object", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(Object.isFrozen(cmd)).toBe(true);
  });

  // 7c-26
  it("command entity has all required fields: command_id, ts, ts_iso, agent_id, operation, operation_payload, source_intent_id, source_gesture", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(typeof cmd.command_id).toBe("string");
    expect(typeof cmd.ts).toBe("number");
    expect(typeof cmd.ts_iso).toBe("string");
    expect(typeof cmd.agent_id).toBe("string");
    expect(typeof cmd.operation).toBe("string");
    expect(typeof cmd.operation_payload).toBe("object");
    expect(typeof cmd.source_intent_id).toBe("string");
    expect(typeof cmd.source_gesture).toBe("string");
  });

  // 7c-27
  it("command_id is a non-empty string starting with 'lcmd_'", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(cmd.command_id).toMatch(/^lcmd_\d+_\d+$/);
  });

  // 7c-28
  it("ts is a positive Unix ms number", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(cmd.ts).toBeGreaterThan(0);
  });

  // 7c-29
  it("ts_iso is a valid ISO 8601 string", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    const parsed = new Date(cmd.ts_iso).getTime();
    expect(parsed).toBeGreaterThan(0);
  });

  // 7c-30
  it("two commands produced from different intents have distinct command_ids", () => {
    const e1 = makeAgentInstanceIntent("researcher-1", "start");
    const e2 = makeAgentInstanceIntent("manager-1",    "stop");

    const cmd1 = translateAgentInstanceIntentToCommand(e1)!;
    const cmd2 = translateAgentInstanceIntentToCommand(e2)!;

    expect(cmd1.command_id).not.toBe(cmd2.command_id);
  });

  // 7c-31
  it("isAgentLifecycleCommandEntity type guard returns true for valid command", () => {
    const entity = makeAgentInstanceIntent("researcher-1", "start");
    const cmd    = translateAgentInstanceIntentToCommand(entity)!;

    expect(isAgentLifecycleCommandEntity(cmd)).toBe(true);
  });

  // 7c-32
  it("isAgentLifecycleCommandEntity type guard returns false for non-command objects", () => {
    expect(isAgentLifecycleCommandEntity(null)).toBe(false);
    expect(isAgentLifecycleCommandEntity({})).toBe(false);
    expect(isAgentLifecycleCommandEntity({ command_id: "x", agent_id: "y" })).toBe(false);
    expect(isAgentLifecycleCommandEntity("string")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Edge cases — filtering / null returns
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-F — Edge cases and null-return guard", () => {

  // 7c-33
  it("returns null when entity.target_entity_type is NOT 'agent_instance'", () => {
    const buildingIntent = makeBuildingIntent();
    const cmd = translateAgentInstanceIntentToCommand(buildingIntent);

    expect(cmd).toBeNull();
  });

  // 7c-34
  it("returns null for room-layer intent", () => {
    const roomEntity = makeInteractionIntentEntity({
      target_entity_type: "room",
      gesture_type:       "click",
      target_id:          "room-ops",
      ts:                 Date.now(),
      layer:              "infrastructure",
      source_payload:     { lifecycleOperation: "start" }, // present but wrong layer
    });
    const cmd = translateAgentInstanceIntentToCommand(roomEntity);

    expect(cmd).toBeNull();
  });

  // 7c-35
  it("returns null when source_payload has NO lifecycleOperation field", () => {
    const entity = makeAgentInstanceIntentNoOp("researcher-5");
    const cmd    = translateAgentInstanceIntentToCommand(entity);

    expect(cmd).toBeNull();
  });

  // 7c-36
  it("returns null when lifecycleOperation is an unrecognised string", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "agent_instance",
      gesture_type:       "context_menu",
      target_id:          "researcher-1",
      ts:                 Date.now(),
      layer:              "meta",
      source_payload:     { lifecycleOperation: "delete" }, // not a valid operation
    });
    const cmd = translateAgentInstanceIntentToCommand(entity);

    expect(cmd).toBeNull();
  });

  // 7c-37
  it("returns null for reassign operation when targetRoomId is missing", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "agent_instance",
      gesture_type:       "context_menu",
      target_id:          "implementer-1",
      ts:                 Date.now(),
      layer:              "meta",
      source_payload:     { lifecycleOperation: "reassign" }, // no targetRoomId
    });
    const cmd = translateAgentInstanceIntentToCommand(entity);

    expect(cmd).toBeNull();
  });

  // 7c-38
  it("returns null for reassign operation when targetRoomId is an empty string", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "agent_instance",
      gesture_type:       "context_menu",
      target_id:          "implementer-1",
      ts:                 Date.now(),
      layer:              "meta",
      source_payload:     { lifecycleOperation: "reassign", targetRoomId: "" },
    });
    const cmd = translateAgentInstanceIntentToCommand(entity);

    expect(cmd).toBeNull();
  });

  // 7c-39
  it("returns null when lifecycleOperation is a number (type safety)", () => {
    const entity = makeInteractionIntentEntity({
      target_entity_type: "agent_instance",
      gesture_type:       "context_menu",
      target_id:          "researcher-1",
      ts:                 Date.now(),
      layer:              "meta",
      source_payload:     { lifecycleOperation: 42 },
    });
    const cmd = translateAgentInstanceIntentToCommand(entity);

    expect(cmd).toBeNull();
  });

  // 7c-40
  it("click gesture produces a command when lifecycleOperation is present in source_payload", () => {
    // The pipeline is gesture-agnostic — it only cares about the lifecycleOperation field
    const entity = makeInteractionIntentEntity({
      target_entity_type: "agent_instance",
      gesture_type:       "click",
      target_id:          "researcher-1",
      ts:                 Date.now(),
      layer:              "meta",
      source_payload:     { lifecycleOperation: "start" },
    });
    const cmd = translateAgentInstanceIntentToCommand(entity);

    expect(cmd).not.toBeNull();
    expect(cmd!.operation).toBe("start");
    expect(cmd!.source_gesture).toBe("click");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Batch pipeline helper
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-G — Batch pipeline helper", () => {

  // 7c-41
  it("translateAgentInstanceIntentBatch returns empty array for empty input", () => {
    const result = translateAgentInstanceIntentBatch([]);
    expect(result).toEqual([]);
  });

  // 7c-42
  it("batch filters out non-agent_instance intents and non-lifecycle intents", () => {
    const buildingIntent = makeBuildingIntent();
    const noOpIntent     = makeAgentInstanceIntentNoOp("researcher-1");

    const result = translateAgentInstanceIntentBatch([buildingIntent, noOpIntent]);
    expect(result).toHaveLength(0);
  });

  // 7c-43
  it("batch produces commands for all valid lifecycle intents", () => {
    const e1 = makeAgentInstanceIntent("researcher-1", "start");
    const e2 = makeAgentInstanceIntent("manager-1",    "stop");
    const e3 = makeAgentInstanceIntent("implementer-1", "reassign", { targetRoomId: "lab" });

    const result = translateAgentInstanceIntentBatch([e1, e2, e3]);

    expect(result).toHaveLength(3);
    expect(result[0]!.operation).toBe("start");
    expect(result[1]!.operation).toBe("stop");
    expect(result[2]!.operation).toBe("reassign");
  });

  // 7c-44
  it("batch handles a mixed array (valid + invalid intents)", () => {
    const valid   = makeAgentInstanceIntent("researcher-1", "start");
    const invalid = makeBuildingIntent();
    const noOp    = makeAgentInstanceIntentNoOp("researcher-2");

    const result = translateAgentInstanceIntentBatch([valid, invalid, noOp]);

    expect(result).toHaveLength(1);
    expect(result[0]!.agent_id).toBe("researcher-1");
  });

  // 7c-45
  it("batch preserves order of valid commands", () => {
    const e1 = makeAgentInstanceIntent("researcher-1", "start");
    const e2 = makeAgentInstanceIntent("researcher-2", "stop");
    const e3 = makeAgentInstanceIntent("researcher-3", "reassign", { targetRoomId: "room-a" });

    const result = translateAgentInstanceIntentBatch([e1, e2, e3]);

    expect(result[0]!.agent_id).toBe("researcher-1");
    expect(result[1]!.agent_id).toBe("researcher-2");
    expect(result[2]!.agent_id).toBe("researcher-3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. LIFECYCLE_OPERATION_TO_COMMAND_TYPE mapping
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-H — LIFECYCLE_OPERATION_TO_COMMAND_TYPE mapping", () => {

  // 7c-46
  it("start maps to 'agent.spawn'", () => {
    expect(LIFECYCLE_OPERATION_TO_COMMAND_TYPE["start"]).toBe("agent.spawn");
    expect(resolveCommandType("start")).toBe("agent.spawn");
  });

  // 7c-47
  it("stop maps to 'agent.terminate'", () => {
    expect(LIFECYCLE_OPERATION_TO_COMMAND_TYPE["stop"]).toBe("agent.terminate");
    expect(resolveCommandType("stop")).toBe("agent.terminate");
  });

  // 7c-48
  it("reassign maps to 'agent.assign'", () => {
    expect(LIFECYCLE_OPERATION_TO_COMMAND_TYPE["reassign"]).toBe("agent.assign");
    expect(resolveCommandType("reassign")).toBe("agent.assign");
  });

  // 7c-49
  it("all three operations are covered in the mapping object", () => {
    const ops: AgentLifecycleOperation[] = ["start", "stop", "reassign"];
    for (const op of ops) {
      expect(typeof LIFECYCLE_OPERATION_TO_COMMAND_TYPE[op]).toBe("string");
      expect(LIFECYCLE_OPERATION_TO_COMMAND_TYPE[op].length).toBeGreaterThan(0);
    }
    expect(Object.keys(LIFECYCLE_OPERATION_TO_COMMAND_TYPE)).toHaveLength(3);
  });

  // 7c-50
  it("mapping object is frozen (immutable)", () => {
    expect(Object.isFrozen(LIFECYCLE_OPERATION_TO_COMMAND_TYPE)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. makeAgentLifecycleIntentPayload factory
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-I — makeAgentLifecycleIntentPayload factory", () => {

  // 7c-51
  it("produces a frozen payload with lifecycleOperation", () => {
    const p = makeAgentLifecycleIntentPayload({ lifecycleOperation: "start" });

    expect(Object.isFrozen(p)).toBe(true);
    expect(p.lifecycleOperation).toBe("start");
  });

  // 7c-52
  it("includes targetRoomId when provided for reassign", () => {
    const p = makeAgentLifecycleIntentPayload({
      lifecycleOperation: "reassign",
      targetRoomId:       "lab-room",
    });
    expect(p.targetRoomId).toBe("lab-room");
  });

  // 7c-53
  it("throws TypeError when reassign operation is missing targetRoomId", () => {
    expect(() =>
      makeAgentLifecycleIntentPayload({ lifecycleOperation: "reassign" }),
    ).toThrow(TypeError);
  });

  // 7c-54
  it("does NOT throw for start or stop when targetRoomId is absent", () => {
    expect(() =>
      makeAgentLifecycleIntentPayload({ lifecycleOperation: "start" }),
    ).not.toThrow();

    expect(() =>
      makeAgentLifecycleIntentPayload({ lifecycleOperation: "stop" }),
    ).not.toThrow();
  });

  // 7c-55
  it("includes agentId and persona fields when provided", () => {
    const p = makeAgentLifecycleIntentPayload({
      lifecycleOperation: "start",
      agentId: "researcher-1",
      persona: "researcher",
    });
    expect(p.agentId).toBe("researcher-1");
    expect(p.persona).toBe("researcher");
  });

  // 7c-56
  it("includes reason field when provided for stop", () => {
    const p = makeAgentLifecycleIntentPayload({
      lifecycleOperation: "stop",
      reason: "task_done",
    });
    expect(p.reason).toBe("task_done");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// J. Type guards
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 7c-J — Type guards", () => {

  // 7c-57
  it("isAgentLifecycleOperation returns true for all valid operations", () => {
    expect(isAgentLifecycleOperation("start")).toBe(true);
    expect(isAgentLifecycleOperation("stop")).toBe(true);
    expect(isAgentLifecycleOperation("reassign")).toBe(true);
  });

  // 7c-58
  it("isAgentLifecycleOperation returns false for invalid strings", () => {
    expect(isAgentLifecycleOperation("delete")).toBe(false);
    expect(isAgentLifecycleOperation("")).toBe(false);
    expect(isAgentLifecycleOperation(null)).toBe(false);
    expect(isAgentLifecycleOperation(undefined)).toBe(false);
    expect(isAgentLifecycleOperation(42)).toBe(false);
  });

  // 7c-59
  it("makeAgentLifecycleCommand factory produces a valid command entity", () => {
    const cmd = makeAgentLifecycleCommand({
      agentId:        "researcher-1",
      operation:      "start",
      payload:        Object.freeze({ operation: "start" as const }),
      sourceIntentId: "ii-123-1",
      sourceGesture:  "context_menu",
    });

    expect(isAgentLifecycleCommandEntity(cmd)).toBe(true);
    expect(cmd.agent_id).toBe("researcher-1");
    expect(cmd.operation).toBe("start");
    expect(cmd.source_intent_id).toBe("ii-123-1");
  });

  // 7c-60
  it("all three operation payloads are JSON-serialisable (no circular refs)", () => {
    const ops = [
      { op: "start" as const,    entity: makeAgentInstanceIntent("a1", "start") },
      { op: "stop"  as const,    entity: makeAgentInstanceIntent("a2", "stop") },
      { op: "reassign" as const, entity: makeAgentInstanceIntent("a3", "reassign", { targetRoomId: "r1" }) },
    ];

    for (const { entity } of ops) {
      const cmd = translateAgentInstanceIntentToCommand(entity)!;
      expect(() => JSON.stringify(cmd)).not.toThrow();
      const round = JSON.parse(JSON.stringify(cmd)) as AgentLifecycleCommandEntity;
      expect(round.agent_id).toBe(cmd.agent_id);
      expect(round.operation).toBe(cmd.operation);
      expect(round.operation_payload.operation).toBe(cmd.operation_payload.operation);
    }
  });
});
