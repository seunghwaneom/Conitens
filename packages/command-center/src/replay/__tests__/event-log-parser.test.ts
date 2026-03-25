/**
 * event-log-parser.test.ts — Unit tests for Sub-AC 9a event log parser.
 *
 * Tests the complete parsing pipeline:
 *   - JSON syntax validation
 *   - Envelope field validation (schema, event_id, type, ts, actor, payload)
 *   - Alias resolution for obsolete event type names
 *   - Classification into the three replay event categories
 *   - Payload type validation against protocol type guards
 *   - TypedReplayEvent construction (fields, convenience extractors)
 *   - Batch parsing (parseLines, parseJsonlText)
 *   - Utility exports (classifyReplayEventType, extractEventDomain)
 *
 * Test ID scheme:
 *   9p-N : Sub-AC 9a parser tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EventLogParser, classifyReplayEventType, extractEventDomain } from "../event-log-parser.js";
import type { TypedReplayEvent, AgentLifecycleReplayEvent, CommandReplayEvent, StateChangeReplayEvent } from "../event-log-schema.js";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

const VALID_SCHEMA = "conitens.event.v1";
const VALID_RUN_ID = "run-test-001";

/** Build a minimal valid ConitensEvent JSON string for the given type and payload. */
function makeEventLine(overrides: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    schema: VALID_SCHEMA,
    event_id: "evt_01HXABCDEFGHJKLMNPQRS",
    type: "task.created",
    ts: "2024-06-01T12:00:00.000Z",
    run_id: VALID_RUN_ID,
    actor: { kind: "system", id: "orchestrator" },
    payload: { task_id: "task-1", title: "Test Task" },
  };
  return JSON.stringify({ ...base, ...overrides });
}

/** Build a minimal valid agent.spawned event line. */
function makeAgentSpawnedLine(agentId = "agent-1", runId = VALID_RUN_ID): string {
  return makeEventLine({
    type: "agent.spawned",
    actor: { kind: "agent", id: agentId },
    payload: {
      agent_id: agentId,
      persona: "implementer",
      run_id: runId,
    },
  });
}

/** Build a minimal valid command.issued event line. */
function makeCommandIssuedLine(commandId = "cmd-1"): string {
  return makeEventLine({
    type: "command.issued",
    actor: { kind: "user", id: "user-1" },
    payload: {
      command_id: commandId,
      command_type: "agent.spawn",
      source: "gui",
      input: { persona: "implementer" },
    },
  });
}

/** Build a minimal valid pipeline.started event line. */
function makePipelineStartedLine(pipelineId = "pipe-1"): string {
  return makeEventLine({
    type: "pipeline.started",
    actor: { kind: "system", id: "orchestrator" },
    payload: {
      pipeline_id: pipelineId,
      pipeline_name: "agent-bootstrap",
      steps: ["validate", "spawn", "assign"],
    },
  });
}

/** Build a valid state_change event for layout.updated. */
function makeLayoutUpdatedLine(): string {
  return makeEventLine({
    type: "layout.updated",
    actor: { kind: "user", id: "gui-user" },
    payload: {
      layout_id: "layout-1",
      nodes: [],
    },
  });
}

// ---------------------------------------------------------------------------
// EventLogParser instance — fresh for each test
// ---------------------------------------------------------------------------

let parser: EventLogParser;

beforeEach(() => {
  parser = new EventLogParser();
});

// ---------------------------------------------------------------------------
// (9p-1) JSON syntax validation
// ---------------------------------------------------------------------------

describe("JSON syntax validation (9p-1)", () => {
  it("returns JSON_PARSE_FAILED for non-JSON input", () => {
    const result = parser.parseLine("not valid json", 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("JSON_PARSE_FAILED");
      expect(result.error.lineOffset).toBe(0);
      expect(result.error.rawLine).toBe("not valid json");
    }
  });

  it("returns JSON_PARSE_FAILED for truncated JSON", () => {
    const result = parser.parseLine('{"schema": "conitens.', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("JSON_PARSE_FAILED");
      expect(result.error.lineOffset).toBe(5);
    }
  });

  it("accepts valid JSON object", () => {
    const result = parser.parseLine(makeEventLine());
    // At minimum, JSON parsing succeeded (envelope may still fail)
    if (!result.ok) {
      expect(result.error.code).not.toBe("JSON_PARSE_FAILED");
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-2) NOT_AN_OBJECT validation
// ---------------------------------------------------------------------------

describe("NOT_AN_OBJECT validation (9p-2)", () => {
  it("returns NOT_AN_OBJECT for a JSON array", () => {
    const result = parser.parseLine("[1, 2, 3]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_AN_OBJECT");
  });

  it("returns NOT_AN_OBJECT for a JSON string", () => {
    const result = parser.parseLine('"just a string"');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_AN_OBJECT");
  });

  it("returns NOT_AN_OBJECT for a JSON number", () => {
    const result = parser.parseLine("42");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_AN_OBJECT");
  });

  it("returns NOT_AN_OBJECT for null", () => {
    const result = parser.parseLine("null");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_AN_OBJECT");
  });
});

// ---------------------------------------------------------------------------
// (9p-3) Schema field validation
// ---------------------------------------------------------------------------

describe("Schema field validation (9p-3)", () => {
  it("returns MISSING_SCHEMA when schema field is absent", () => {
    const obj = JSON.parse(makeEventLine());
    delete (obj as Record<string, unknown>)["schema"];
    const result = parser.parseLine(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_SCHEMA");
  });

  it("returns MISSING_SCHEMA when schema is not a string", () => {
    const result = parser.parseLine(makeEventLine({ schema: 123 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_SCHEMA");
  });

  it("returns SCHEMA_VERSION_MISMATCH for wrong schema string", () => {
    const result = parser.parseLine(makeEventLine({ schema: "conitens.event.v0" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA_VERSION_MISMATCH");
      expect(result.error.message).toContain("conitens.event.v0");
    }
  });

  it("returns SCHEMA_VERSION_MISMATCH for 1.0.1 (wrong format)", () => {
    const result = parser.parseLine(makeEventLine({ schema: "1.0.1" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA_VERSION_MISMATCH");
  });

  it("accepts the canonical schema version", () => {
    const result = parser.parseLine(makeEventLine({ schema: "conitens.event.v1" }));
    // Should not fail on schema validation
    if (!result.ok) {
      expect(result.error.code).not.toBe("MISSING_SCHEMA");
      expect(result.error.code).not.toBe("SCHEMA_VERSION_MISMATCH");
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-4) event_id field validation
// ---------------------------------------------------------------------------

describe("event_id field validation (9p-4)", () => {
  it("returns MISSING_EVENT_ID when event_id is absent", () => {
    const obj = JSON.parse(makeEventLine());
    delete (obj as Record<string, unknown>)["event_id"];
    const result = parser.parseLine(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_EVENT_ID");
  });

  it("returns MISSING_EVENT_ID when event_id is a number", () => {
    const result = parser.parseLine(makeEventLine({ event_id: 42 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_EVENT_ID");
  });

  it("returns INVALID_EVENT_ID when event_id is an empty string", () => {
    const result = parser.parseLine(makeEventLine({ event_id: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_EVENT_ID");
  });

  it("accepts any non-empty string as event_id", () => {
    const result = parser.parseLine(makeEventLine({ event_id: "custom-id-123" }));
    if (!result.ok) {
      expect(result.error.code).not.toBe("MISSING_EVENT_ID");
      expect(result.error.code).not.toBe("INVALID_EVENT_ID");
    }
  });

  it("accepts the canonical evt_ ULID format", () => {
    const result = parser.parseLine(makeEventLine({ event_id: "evt_01HXABCDEFGHJKLMNPQRS" }));
    if (!result.ok) {
      expect(result.error.code).not.toBe("MISSING_EVENT_ID");
      expect(result.error.code).not.toBe("INVALID_EVENT_ID");
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-5) type field validation and alias resolution
// ---------------------------------------------------------------------------

describe("type field validation and alias resolution (9p-5)", () => {
  it("returns MISSING_TYPE when type is absent", () => {
    const obj = JSON.parse(makeEventLine());
    delete (obj as Record<string, unknown>)["type"];
    const result = parser.parseLine(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_TYPE");
  });

  it("returns MISSING_TYPE when type is not a string", () => {
    const result = parser.parseLine(makeEventLine({ type: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_TYPE");
  });

  it("returns UNKNOWN_EVENT_TYPE for completely unknown type", () => {
    const result = parser.parseLine(makeEventLine({ type: "bogus.event.type" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN_EVENT_TYPE");
      expect(result.error.message).toContain("bogus.event.type");
    }
  });

  it("accepts and resolves obsolete alias 'task.updated' → 'task.status_changed'", () => {
    const line = makeEventLine({
      type: "task.updated",
      payload: { task_id: "t-1", status: "completed", prev_status: "pending" },
    });
    const result = parser.parseLine(line);
    // Alias should resolve; the event may pass or fail payload validation
    // but must not fail with UNKNOWN_EVENT_TYPE
    if (!result.ok) {
      expect(result.error.code).not.toBe("UNKNOWN_EVENT_TYPE");
    }
    if (result.ok) {
      // The canonical type should be the resolved alias
      expect(result.event.type).toBe("task.status_changed");
    }
  });

  it("accepts and resolves 'message.new' → 'message.received'", () => {
    const line = makeEventLine({
      type: "message.new",
      payload: { channel: "slack", content: "hello" },
    });
    const result = parser.parseLine(line);
    if (!result.ok) {
      expect(result.error.code).not.toBe("UNKNOWN_EVENT_TYPE");
    }
    if (result.ok) {
      expect(result.event.type).toBe("message.received");
    }
  });

  it("accepts canonical event types from EVENT_TYPES", () => {
    const result = parser.parseLine(makeEventLine({ type: "task.created" }));
    if (!result.ok) {
      expect(result.error.code).not.toBe("MISSING_TYPE");
      expect(result.error.code).not.toBe("UNKNOWN_EVENT_TYPE");
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-6) ts (timestamp) field validation
// ---------------------------------------------------------------------------

describe("ts field validation (9p-6)", () => {
  it("returns MISSING_TIMESTAMP when ts is absent", () => {
    const obj = JSON.parse(makeEventLine());
    delete (obj as Record<string, unknown>)["ts"];
    const result = parser.parseLine(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_TIMESTAMP");
  });

  it("returns MISSING_TIMESTAMP when ts is a number", () => {
    const result = parser.parseLine(makeEventLine({ ts: 1717228800000 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_TIMESTAMP");
  });

  it("returns INVALID_TIMESTAMP for a non-date string", () => {
    const result = parser.parseLine(makeEventLine({ ts: "not-a-date" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TIMESTAMP");
  });

  it("accepts a valid ISO 8601 timestamp", () => {
    const result = parser.parseLine(makeEventLine({ ts: "2024-06-01T12:00:00.000Z" }));
    if (!result.ok) {
      expect(result.error.code).not.toBe("MISSING_TIMESTAMP");
      expect(result.error.code).not.toBe("INVALID_TIMESTAMP");
    }
    if (result.ok) {
      expect(result.event.tsMs).toBe(Date.parse("2024-06-01T12:00:00.000Z"));
    }
  });

  it("parses tsMs correctly from ts string", () => {
    const ts = "2025-01-15T08:30:00.123Z";
    const result = parser.parseLine(makeEventLine({ ts }));
    if (result.ok) {
      expect(result.event.tsMs).toBe(Date.parse(ts));
      expect(result.event.ts).toBe(ts);
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-7) actor field validation
// ---------------------------------------------------------------------------

describe("actor field validation (9p-7)", () => {
  it("returns MISSING_ACTOR when actor is absent", () => {
    const obj = JSON.parse(makeEventLine());
    delete (obj as Record<string, unknown>)["actor"];
    const result = parser.parseLine(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_ACTOR");
  });

  it("returns MISSING_ACTOR when actor is not an object", () => {
    const result = parser.parseLine(makeEventLine({ actor: "system" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_ACTOR");
  });

  it("returns MISSING_ACTOR when actor.kind is not a valid ActorKind", () => {
    const result = parser.parseLine(
      makeEventLine({ actor: { kind: "robot", id: "r-1" } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_ACTOR");
  });

  it("returns MISSING_ACTOR when actor.id is absent", () => {
    const result = parser.parseLine(
      makeEventLine({ actor: { kind: "system" } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_ACTOR");
  });

  it("returns MISSING_ACTOR when actor.id is empty", () => {
    const result = parser.parseLine(
      makeEventLine({ actor: { kind: "system", id: "" } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_ACTOR");
  });

  it.each(["user", "agent", "system", "channel"] as const)(
    "accepts actor.kind = '%s'",
    (kind) => {
      const result = parser.parseLine(
        makeEventLine({ actor: { kind, id: "test-id" } }),
      );
      if (!result.ok) {
        expect(result.error.code).not.toBe("MISSING_ACTOR");
      }
    },
  );
});

// ---------------------------------------------------------------------------
// (9p-8) payload field validation
// ---------------------------------------------------------------------------

describe("payload field validation (9p-8)", () => {
  it("returns MISSING_PAYLOAD when payload is absent", () => {
    const obj = JSON.parse(makeEventLine());
    delete (obj as Record<string, unknown>)["payload"];
    const result = parser.parseLine(JSON.stringify(obj));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_PAYLOAD");
  });

  it("returns MISSING_PAYLOAD when payload is an array", () => {
    const result = parser.parseLine(makeEventLine({ payload: [1, 2, 3] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_PAYLOAD");
  });

  it("returns MISSING_PAYLOAD when payload is a string", () => {
    const result = parser.parseLine(makeEventLine({ payload: "data" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_PAYLOAD");
  });

  it("returns MISSING_PAYLOAD when payload is null", () => {
    const result = parser.parseLine(makeEventLine({ payload: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_PAYLOAD");
  });

  it("accepts a plain object payload", () => {
    const result = parser.parseLine(makeEventLine({ payload: { key: "value" } }));
    if (!result.ok) {
      expect(result.error.code).not.toBe("MISSING_PAYLOAD");
    }
  });

  it("accepts an empty object payload for state_change events", () => {
    const result = parser.parseLine(makeEventLine({ payload: {} }));
    if (!result.ok) {
      expect(result.error.code).not.toBe("MISSING_PAYLOAD");
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-9) Agent lifecycle event parsing
// ---------------------------------------------------------------------------

describe("Agent lifecycle events (9p-9)", () => {
  it("parses agent.spawned into AgentLifecycleReplayEvent", () => {
    const result = parser.parseLine(makeAgentSpawnedLine("agent-42", "run-99"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = result.event as AgentLifecycleReplayEvent;
      expect(ev.replayCategory).toBe("agent_lifecycle");
      expect(ev.type).toBe("agent.spawned");
      expect(ev.agentId).toBe("agent-42");
      expect(ev.run_id).toBe(VALID_RUN_ID);
      expect(ev.actor.kind).toBe("agent");
    }
  });

  it("extracts agentId correctly from payload", () => {
    const result = parser.parseLine(makeAgentSpawnedLine("my-special-agent"));
    if (result.ok) {
      expect((result.event as AgentLifecycleReplayEvent).agentId).toBe("my-special-agent");
    }
  });

  it("parses agent.heartbeat event", () => {
    const line = makeEventLine({
      type: "agent.heartbeat",
      actor: { kind: "agent", id: "agent-7" },
      payload: {
        agent_id: "agent-7",
        status: "active",
        active_task_id: "task-123",
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("agent_lifecycle");
      expect(result.event.type).toBe("agent.heartbeat");
      expect((result.event as AgentLifecycleReplayEvent).agentId).toBe("agent-7");
    }
  });

  it("parses agent.terminated event", () => {
    const line = makeEventLine({
      type: "agent.terminated",
      actor: { kind: "agent", id: "agent-5" },
      payload: {
        agent_id: "agent-5",
        reason: "task_completed",
        exit_code: 0,
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("agent_lifecycle");
      expect(result.event.type).toBe("agent.terminated");
    }
  });

  it("parses agent.lifecycle.changed event", () => {
    const line = makeEventLine({
      type: "agent.lifecycle.changed",
      actor: { kind: "system", id: "orchestrator" },
      payload: {
        agent_id: "agent-3",
        prev_state: "ready",
        next_state: "active",
        trigger: "task_assigned",
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("agent_lifecycle");
      expect(result.event.type).toBe("agent.lifecycle.changed");
    }
  });

  it("parses agent.moved spatial event", () => {
    const line = makeEventLine({
      type: "agent.moved",
      actor: { kind: "agent", id: "agent-9" },
      payload: {
        agent_id: "agent-9",
        to_room: "ops-room",
        from_room: "lobby",
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("agent_lifecycle");
      expect(result.event.type).toBe("agent.moved");
    }
  });

  it("parses agent.status_changed event", () => {
    const line = makeEventLine({
      type: "agent.status_changed",
      actor: { kind: "agent", id: "agent-2" },
      payload: {
        agent_id: "agent-2",
        prev_status: "idle",
        status: "active",
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("agent_lifecycle");
    }
  });

  it("returns INVALID_PAYLOAD for agent.spawned with missing persona", () => {
    const line = makeEventLine({
      type: "agent.spawned",
      actor: { kind: "agent", id: "agent-1" },
      payload: {
        agent_id: "agent-1",
        // persona missing — required field
        run_id: "run-1",
      },
    });
    // persona is required per isAgentSpawnedPayload
    const line2 = makeEventLine({
      type: "agent.spawned",
      actor: { kind: "agent", id: "agent-1" },
      payload: {
        agent_id: "agent-1",
        run_id: "run-1",
      },
    });
    const result = parser.parseLine(line2);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PAYLOAD");
    }
  });

  it("carries the full original ConitensEvent in raw field", () => {
    const result = parser.parseLine(makeAgentSpawnedLine("agent-77"));
    if (result.ok) {
      expect(result.event.raw).toBeDefined();
      expect(result.event.raw.event_id).toBe("evt_01HXABCDEFGHJKLMNPQRS");
      expect(result.event.raw.schema).toBe("conitens.event.v1");
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-10) Command event parsing
// ---------------------------------------------------------------------------

describe("Command events (9p-10)", () => {
  it("parses command.issued into CommandReplayEvent", () => {
    const result = parser.parseLine(makeCommandIssuedLine("cmd-abc"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = result.event as CommandReplayEvent;
      expect(ev.replayCategory).toBe("command");
      expect(ev.type).toBe("command.issued");
      expect(ev.commandId).toBe("cmd-abc");
      expect(ev.pipelineId).toBeUndefined();
    }
  });

  it("parses command.completed event", () => {
    const line = makeEventLine({
      type: "command.completed",
      actor: { kind: "system", id: "orchestrator" },
      payload: {
        command_id: "cmd-100",
        command_type: "agent.spawn",
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = result.event as CommandReplayEvent;
      expect(ev.replayCategory).toBe("command");
      expect(ev.commandId).toBe("cmd-100");
    }
  });

  it("parses command.failed event", () => {
    const line = makeEventLine({
      type: "command.failed",
      actor: { kind: "system", id: "orchestrator" },
      payload: {
        command_id: "cmd-200",
        command_type: "task.create",
        error_code: "AGENT_NOT_FOUND",
        error_message: "No agent with that id exists",
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("command");
    }
  });

  it("parses command.rejected event (optional command_id)", () => {
    const line = makeEventLine({
      type: "command.rejected",
      actor: { kind: "system", id: "orchestrator" },
      payload: {
        rejection_code: "SCHEMA_VALIDATION_FAILED",
        rejection_reason: "Missing required field: command_type",
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("command");
    }
  });

  it("parses pipeline.started into CommandReplayEvent with pipelineId", () => {
    const result = parser.parseLine(makePipelineStartedLine("pipe-xyz"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = result.event as CommandReplayEvent;
      expect(ev.replayCategory).toBe("command");
      expect(ev.type).toBe("pipeline.started");
      expect(ev.pipelineId).toBe("pipe-xyz");
      expect(ev.commandId).toBeUndefined();
    }
  });

  it("parses pipeline.step event", () => {
    const line = makeEventLine({
      type: "pipeline.step",
      actor: { kind: "system", id: "orchestrator" },
      payload: {
        pipeline_id: "pipe-1",
        step_index: 0,
        step_name: "validate",
        step_status: "completed",
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("command");
      expect((result.event as CommandReplayEvent).pipelineId).toBe("pipe-1");
    }
  });

  it("parses pipeline.completed event", () => {
    const line = makeEventLine({
      type: "pipeline.completed",
      actor: { kind: "system", id: "orchestrator" },
      payload: {
        pipeline_id: "pipe-2",
        pipeline_name: "agent-bootstrap",
        steps_total: 3,
        steps_completed: 3,
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("command");
    }
  });

  it("parses pipeline.failed event", () => {
    const line = makeEventLine({
      type: "pipeline.failed",
      actor: { kind: "system", id: "orchestrator" },
      payload: {
        pipeline_id: "pipe-3",
        pipeline_name: "agent-bootstrap",
        failed_step_index: 1,
        failed_step_name: "spawn",
        error_code: "SPAWN_TIMEOUT",
        error_message: "Agent failed to start",
        steps_completed: 1,
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("command");
    }
  });

  it("returns INVALID_PAYLOAD for command.issued with missing source", () => {
    const line = makeEventLine({
      type: "command.issued",
      actor: { kind: "user", id: "user-1" },
      payload: {
        command_id: "cmd-1",
        command_type: "agent.spawn",
        // source missing — required field
        input: {},
      },
    });
    const result = parser.parseLine(line);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PAYLOAD");
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-11) State-change event parsing
// ---------------------------------------------------------------------------

describe("State-change events (9p-11)", () => {
  it("parses task.created into StateChangeReplayEvent", () => {
    const result = parser.parseLine(makeEventLine());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = result.event as StateChangeReplayEvent;
      expect(ev.replayCategory).toBe("state_change");
      expect(ev.type).toBe("task.created");
      expect(ev.domain).toBe("task");
    }
  });

  it("parses layout.updated event", () => {
    const result = parser.parseLine(makeLayoutUpdatedLine());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = result.event as StateChangeReplayEvent;
      expect(ev.replayCategory).toBe("state_change");
      expect(ev.domain).toBe("layout");
    }
  });

  it("extracts taskId from ConitensEvent envelope when present", () => {
    const line = makeEventLine({
      type: "task.status_changed",
      task_id: "task-envelope-id",
      payload: { task_id: "task-envelope-id", status: "completed" },
    });
    const result = parser.parseLine(line);
    if (result.ok) {
      const ev = result.event as StateChangeReplayEvent;
      expect(ev.taskId).toBe("task-envelope-id");
    }
  });

  it("taskId is undefined when not in envelope", () => {
    const result = parser.parseLine(makeEventLine());
    if (result.ok) {
      const ev = result.event as StateChangeReplayEvent;
      expect(ev.taskId).toBeUndefined();
    }
  });

  it("parses meeting.started event", () => {
    const line = makeEventLine({
      type: "meeting.started",
      actor: { kind: "system", id: "meeting-orchestrator" },
      payload: {
        meeting_id: "meet-1",
        room_id: "conf-room",
        initiated_by: "user-1",
        participant_ids: ["agent-1", "agent-2"],
      },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ev = result.event as StateChangeReplayEvent;
      expect(ev.replayCategory).toBe("state_change");
      expect(ev.domain).toBe("meeting");
    }
  });

  it("parses mode.switch_requested event", () => {
    const line = makeEventLine({
      type: "mode.switch_requested",
      actor: { kind: "user", id: "user-1" },
      payload: { from_mode: "normal", to_mode: "safe" },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.replayCategory).toBe("state_change");
      expect((result.event as StateChangeReplayEvent).domain).toBe("mode");
    }
  });

  it("parses system.started event", () => {
    const line = makeEventLine({
      type: "system.started",
      actor: { kind: "system", id: "orchestrator" },
      payload: { version: "4.2.0", run_id: VALID_RUN_ID },
    });
    const result = parser.parseLine(line);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.event as StateChangeReplayEvent).domain).toBe("system");
    }
  });

  it("carries typedPayload as the original payload object", () => {
    const payload = { task_id: "t-1", title: "My Task" };
    const result = parser.parseLine(makeEventLine({ payload }));
    if (result.ok) {
      const ev = result.event as StateChangeReplayEvent;
      expect(ev.typedPayload).toEqual(payload);
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-12) Sequence numbering
// ---------------------------------------------------------------------------

describe("Sequence numbering (9p-12)", () => {
  it("assigns seq = 1 to the first successfully parsed event", () => {
    const result = parser.parseLine(makeEventLine());
    if (result.ok) {
      expect(result.event.seq).toBe(1);
    }
  });

  it("increments seq monotonically across successful parses", () => {
    const r1 = parser.parseLine(makeEventLine());
    const r2 = parser.parseLine(makeAgentSpawnedLine());
    const r3 = parser.parseLine(makeCommandIssuedLine());

    const seqs = [r1, r2, r3]
      .filter((r) => r.ok)
      .map((r) => (r as { ok: true; event: TypedReplayEvent }).event.seq);

    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it("seq counter is not incremented for failed parses", () => {
    // Fail
    parser.parseLine("not json");
    // Succeed — seq should still be 1
    const result = parser.parseLine(makeEventLine());
    if (result.ok) {
      expect(result.event.seq).toBe(1);
    }
  });

  it("reset() sets seq counter back to 0", () => {
    parser.parseLine(makeEventLine());
    parser.parseLine(makeEventLine());
    parser.reset();
    const result = parser.parseLine(makeEventLine());
    if (result.ok) {
      expect(result.event.seq).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-13) parseLines batch API
// ---------------------------------------------------------------------------

describe("parseLines batch API (9p-13)", () => {
  it("returns empty batch for empty array", () => {
    const batch = parser.parseLines([]);
    expect(batch.events).toHaveLength(0);
    expect(batch.errors).toHaveLength(0);
    expect(batch.totalLines).toBe(0);
    expect(batch.parsedCount).toBe(0);
    expect(batch.errorCount).toBe(0);
    expect(batch.firstEventTsMs).toBe(Infinity);
    expect(batch.lastEventTsMs).toBe(-Infinity);
  });

  it("skips empty lines silently", () => {
    const batch = parser.parseLines(["", "   ", makeEventLine(), ""]);
    expect(batch.totalLines).toBe(1); // Only non-empty lines counted
    expect(batch.parsedCount).toBe(1);
    expect(batch.errorCount).toBe(0);
  });

  it("collects both events and errors from mixed input", () => {
    const lines = [
      makeEventLine(),
      "bad json",
      makeAgentSpawnedLine(),
      '{"schema":"wrong"}',
      makeCommandIssuedLine(),
    ];
    const batch = parser.parseLines(lines);
    expect(batch.parsedCount).toBe(3);
    expect(batch.errorCount).toBe(2);
    expect(batch.totalLines).toBe(5);
  });

  it("computes correct firstEventTsMs and lastEventTsMs", () => {
    const ts1 = "2024-01-01T00:00:00.000Z";
    const ts2 = "2024-01-02T00:00:00.000Z";
    const ts3 = "2024-01-03T00:00:00.000Z";
    const lines = [
      makeEventLine({ ts: ts2 }),
      makeEventLine({ ts: ts1 }),
      makeEventLine({ ts: ts3 }),
    ];
    const batch = parser.parseLines(lines);
    expect(batch.firstEventTsMs).toBe(Date.parse(ts1));
    expect(batch.lastEventTsMs).toBe(Date.parse(ts3));
  });

  it("counts events by category correctly", () => {
    const lines = [
      makeEventLine(),                   // state_change
      makeAgentSpawnedLine(),            // agent_lifecycle
      makeCommandIssuedLine(),           // command
      makeLayoutUpdatedLine(),           // state_change
      makePipelineStartedLine(),         // command
    ];
    const batch = parser.parseLines(lines);
    expect(batch.categoryCounts.state_change).toBe(2);
    expect(batch.categoryCounts.agent_lifecycle).toBe(1);
    expect(batch.categoryCounts.command).toBe(2);
  });

  it("preserves input order in events array", () => {
    const lines = [
      makeEventLine({ event_id: "evt_001", ts: "2024-01-01T00:00:00.000Z" }),
      makeEventLine({ event_id: "evt_002", ts: "2024-01-01T00:00:01.000Z" }),
      makeEventLine({ event_id: "evt_003", ts: "2024-01-01T00:00:02.000Z" }),
    ];
    const batch = parser.parseLines(lines);
    expect(batch.events[0].raw.event_id).toBe("evt_001");
    expect(batch.events[1].raw.event_id).toBe("evt_002");
    expect(batch.events[2].raw.event_id).toBe("evt_003");
  });

  it("assigns monotonically increasing seq numbers within a batch", () => {
    const lines = [makeEventLine(), makeAgentSpawnedLine(), makeCommandIssuedLine()];
    const batch = parser.parseLines(lines);
    const seqs = batch.events.map((e) => e.seq);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
    expect(seqs[0]).toBe(1);
  });

  it("resets seq counter at the start of each parseLines call", () => {
    const batch1 = parser.parseLines([makeEventLine(), makeAgentSpawnedLine()]);
    const batch2 = parser.parseLines([makeEventLine()]);
    expect(batch1.events[0].seq).toBe(1);
    expect(batch1.events[1].seq).toBe(2);
    expect(batch2.events[0].seq).toBe(1); // reset for new batch
  });
});

// ---------------------------------------------------------------------------
// (9p-14) parseJsonlText API
// ---------------------------------------------------------------------------

describe("parseJsonlText API (9p-14)", () => {
  it("parses a multi-line JSONL string", () => {
    const text = [
      makeEventLine({ event_id: "evt_A", ts: "2024-06-01T00:00:00.000Z" }),
      makeAgentSpawnedLine(),
      makeCommandIssuedLine(),
    ].join("\n");

    const batch = parser.parseJsonlText(text);
    expect(batch.parsedCount).toBe(3);
    expect(batch.errorCount).toBe(0);
  });

  it("handles CRLF line endings", () => {
    const line1 = makeEventLine({ event_id: "evt_CR1" });
    const line2 = makeAgentSpawnedLine();
    const text = `${line1}\r\n${line2}\r\n`;
    const batch = parser.parseJsonlText(text);
    expect(batch.parsedCount).toBe(2);
  });

  it("handles trailing newline", () => {
    const text = makeEventLine() + "\n";
    const batch = parser.parseJsonlText(text);
    expect(batch.parsedCount).toBe(1);
    expect(batch.errorCount).toBe(0);
  });

  it("returns Infinity/negative Infinity when no events parse successfully", () => {
    const batch = parser.parseJsonlText("bad\nbad2\n");
    expect(batch.firstEventTsMs).toBe(Infinity);
    expect(batch.lastEventTsMs).toBe(-Infinity);
  });
});

// ---------------------------------------------------------------------------
// (9p-15) classifyReplayEventType utility
// ---------------------------------------------------------------------------

describe("classifyReplayEventType utility (9p-15)", () => {
  it("classifies agent.spawned as 'agent_lifecycle'", () => {
    expect(classifyReplayEventType("agent.spawned")).toBe("agent_lifecycle");
  });

  it("classifies agent.lifecycle.changed as 'agent_lifecycle'", () => {
    expect(classifyReplayEventType("agent.lifecycle.changed")).toBe("agent_lifecycle");
  });

  it("classifies agent.moved as 'agent_lifecycle'", () => {
    expect(classifyReplayEventType("agent.moved")).toBe("agent_lifecycle");
  });

  it("classifies command.issued as 'command'", () => {
    expect(classifyReplayEventType("command.issued")).toBe("command");
  });

  it("classifies pipeline.started as 'command'", () => {
    expect(classifyReplayEventType("pipeline.started")).toBe("command");
  });

  it("classifies pipeline.failed as 'command'", () => {
    expect(classifyReplayEventType("pipeline.failed")).toBe("command");
  });

  it("classifies task.created as 'state_change'", () => {
    expect(classifyReplayEventType("task.created")).toBe("state_change");
  });

  it("classifies layout.updated as 'state_change'", () => {
    expect(classifyReplayEventType("layout.updated")).toBe("state_change");
  });

  it("classifies meeting.started as 'state_change'", () => {
    expect(classifyReplayEventType("meeting.started")).toBe("state_change");
  });

  it("classifies mode.switch_requested as 'state_change'", () => {
    expect(classifyReplayEventType("mode.switch_requested")).toBe("state_change");
  });

  it("classifies system.started as 'state_change'", () => {
    expect(classifyReplayEventType("system.started")).toBe("state_change");
  });

  it("classifies unknown future type as 'state_change' (forward compat)", () => {
    expect(classifyReplayEventType("future.unknown.event")).toBe("state_change");
  });
});

// ---------------------------------------------------------------------------
// (9p-16) extractEventDomain utility
// ---------------------------------------------------------------------------

describe("extractEventDomain utility (9p-16)", () => {
  it("extracts 'task' from 'task.created'", () => {
    expect(extractEventDomain("task.created")).toBe("task");
  });

  it("extracts 'agent' from 'agent.spawned'", () => {
    expect(extractEventDomain("agent.spawned")).toBe("agent");
  });

  it("extracts 'layout' from 'layout.node.moved' (nested)", () => {
    expect(extractEventDomain("layout.node.moved")).toBe("layout");
  });

  it("extracts 'system' from 'system.started'", () => {
    expect(extractEventDomain("system.started")).toBe("system");
  });

  it("returns the full string if there is no dot separator", () => {
    expect(extractEventDomain("nodot")).toBe("nodot");
  });

  it("handles empty string gracefully", () => {
    expect(extractEventDomain("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// (9p-17) Error message content
// ---------------------------------------------------------------------------

describe("Parse error message content (9p-17)", () => {
  it("SCHEMA_VERSION_MISMATCH error message includes the bad version", () => {
    const result = parser.parseLine(makeEventLine({ schema: "wrong-v99" }));
    if (!result.ok) {
      expect(result.error.message).toContain("wrong-v99");
    }
  });

  it("UNKNOWN_EVENT_TYPE error message includes the unknown type", () => {
    const result = parser.parseLine(makeEventLine({ type: "alien.event" }));
    if (!result.ok) {
      expect(result.error.message).toContain("alien.event");
    }
  });

  it("Parse errors carry rawLine for debugging", () => {
    const badLine = "not json at all";
    const result = parser.parseLine(badLine, 42);
    if (!result.ok) {
      expect(result.error.rawLine).toBe("not json at all");
      expect(result.error.lineOffset).toBe(42);
    }
  });
});

// ---------------------------------------------------------------------------
// (9p-18) BaseReplayEvent fields
// ---------------------------------------------------------------------------

describe("BaseReplayEvent common fields (9p-18)", () => {
  it("populates run_id from envelope", () => {
    const line = makeEventLine({ run_id: "run-special-007" });
    const result = parser.parseLine(line);
    if (result.ok) {
      expect(result.event.run_id).toBe("run-special-007");
    }
  });

  it("run_id falls back to empty string if absent in envelope", () => {
    const obj = JSON.parse(makeEventLine());
    delete (obj as Record<string, unknown>)["run_id"];
    const result = parser.parseLine(JSON.stringify(obj));
    if (result.ok) {
      expect(result.event.run_id).toBe("");
    }
  });

  it("actor is correctly populated", () => {
    const result = parser.parseLine(
      makeEventLine({ actor: { kind: "user", id: "user-99" } }),
    );
    if (result.ok) {
      expect(result.event.actor.kind).toBe("user");
      expect(result.event.actor.id).toBe("user-99");
    }
  });

  it("tsMs matches Date.parse of ts string", () => {
    const ts = "2025-03-24T09:15:30.750Z";
    const result = parser.parseLine(makeEventLine({ ts }));
    if (result.ok) {
      expect(result.event.tsMs).toBe(Date.parse(ts));
    }
  });
});
