/**
 * command-file-pipeline.test.ts — Unit tests for Sub-AC 8b.
 *
 * Validates the pipeline entity state machine and watcher:
 *
 *  1. VALID_PIPELINE_TRANSITIONS — forward-only state machine coverage
 *  2. canPipelineTransition()     — rejects invalid + accepts valid transitions
 *  3. TERMINAL_PIPELINE_STATES   — completed and failed are terminal
 *  4. makePipelineEntity()        — factory creates correct initial state
 *  5. advancePipelineEntity()     — produces new entity; rejects invalid transitions
 *  6. mapEventTypeToStatus()      — maps WS event types to pipeline states
 *  7. CommandFilePipelineWatcher.registerCommand() — idempotent registration
 *  8. CommandFilePipelineWatcher.applyEvent()      — full happy-path transition chain
 *  9. CommandFilePipelineWatcher.applyEvent()      — rejects invalid transitions
 * 10. CommandFilePipelineWatcher.applyEvent()      — auto-creates entity for unknown commands
 * 11. CommandFilePipelineWatcher.getTransitionLog()— append-only log integrity
 * 12. CommandFilePipelineWatcher.setOnTransition() — callback fires on each transition
 * 13. CommandFilePipelineWatcher.getEntitiesByStatus() — filtered queries
 * 14. Failed entity carries error detail
 * 15. duration_ms computed on terminal states
 */

import { describe, it, expect, vi } from "vitest";
import {
  VALID_PIPELINE_TRANSITIONS,
  TERMINAL_PIPELINE_STATES,
  canPipelineTransition,
  mapEventTypeToStatus,
  makePipelineEntity,
  advancePipelineEntity,
  createCommandFilePipelineWatcher,
  CommandFilePipelineWatcher,
  type CommandFilePipelineStatus,
  type CommandFilePipelineEntity,
  type CommandPipelineEvent,
} from "../command-file-pipeline.js";

// ── 1. VALID_PIPELINE_TRANSITIONS ────────────────────────────────────────────

describe("VALID_PIPELINE_TRANSITIONS", () => {
  it("covers all five statuses as keys", () => {
    const statuses: CommandFilePipelineStatus[] = [
      "pending", "accepted", "executing", "completed", "failed",
    ];
    for (const s of statuses) {
      expect(VALID_PIPELINE_TRANSITIONS).toHaveProperty(s);
    }
  });

  it("pending can transition to accepted or failed only", () => {
    const allowed = VALID_PIPELINE_TRANSITIONS["pending"];
    expect(allowed.has("accepted")).toBe(true);
    expect(allowed.has("failed")).toBe(true);
    expect(allowed.has("executing")).toBe(false);
    expect(allowed.has("completed")).toBe(false);
    expect(allowed.has("pending")).toBe(false);
  });

  it("accepted can transition to executing or failed only", () => {
    const allowed = VALID_PIPELINE_TRANSITIONS["accepted"];
    expect(allowed.has("executing")).toBe(true);
    expect(allowed.has("failed")).toBe(true);
    expect(allowed.has("pending")).toBe(false);
    expect(allowed.has("completed")).toBe(false);
  });

  it("executing can transition to completed or failed only", () => {
    const allowed = VALID_PIPELINE_TRANSITIONS["executing"];
    expect(allowed.has("completed")).toBe(true);
    expect(allowed.has("failed")).toBe(true);
    expect(allowed.has("pending")).toBe(false);
    expect(allowed.has("accepted")).toBe(false);
  });

  it("completed has no valid transitions (terminal)", () => {
    expect(VALID_PIPELINE_TRANSITIONS["completed"].size).toBe(0);
  });

  it("failed has no valid transitions (terminal)", () => {
    expect(VALID_PIPELINE_TRANSITIONS["failed"].size).toBe(0);
  });
});

// ── 2. canPipelineTransition ──────────────────────────────────────────────────

describe("canPipelineTransition()", () => {
  it("accepts valid forward transitions", () => {
    expect(canPipelineTransition("pending", "accepted")).toBe(true);
    expect(canPipelineTransition("pending", "failed")).toBe(true);
    expect(canPipelineTransition("accepted", "executing")).toBe(true);
    expect(canPipelineTransition("accepted", "failed")).toBe(true);
    expect(canPipelineTransition("executing", "completed")).toBe(true);
    expect(canPipelineTransition("executing", "failed")).toBe(true);
  });

  it("rejects backward or lateral transitions", () => {
    expect(canPipelineTransition("accepted", "pending")).toBe(false);
    expect(canPipelineTransition("executing", "accepted")).toBe(false);
    expect(canPipelineTransition("completed", "failed")).toBe(false);
    expect(canPipelineTransition("failed", "completed")).toBe(false);
    expect(canPipelineTransition("completed", "pending")).toBe(false);
  });

  it("rejects self-transitions", () => {
    const statuses: CommandFilePipelineStatus[] = [
      "pending", "accepted", "executing", "completed", "failed",
    ];
    for (const s of statuses) {
      expect(canPipelineTransition(s, s)).toBe(false);
    }
  });
});

// ── 3. TERMINAL_PIPELINE_STATES ───────────────────────────────────────────────

describe("TERMINAL_PIPELINE_STATES", () => {
  it("contains completed and failed", () => {
    expect(TERMINAL_PIPELINE_STATES.has("completed")).toBe(true);
    expect(TERMINAL_PIPELINE_STATES.has("failed")).toBe(true);
  });

  it("does NOT contain pending, accepted, or executing", () => {
    expect(TERMINAL_PIPELINE_STATES.has("pending")).toBe(false);
    expect(TERMINAL_PIPELINE_STATES.has("accepted")).toBe(false);
    expect(TERMINAL_PIPELINE_STATES.has("executing")).toBe(false);
  });
});

// ── 4. makePipelineEntity ─────────────────────────────────────────────────────

describe("makePipelineEntity()", () => {
  it("creates an entity with status=pending", () => {
    const entity = makePipelineEntity("cmd_001", "agent.spawn");
    expect(entity.command_id).toBe("cmd_001");
    expect(entity.command_type).toBe("agent.spawn");
    expect(entity.status).toBe("pending");
  });

  it("ts_created and ts_updated are equal and ISO-formatted", () => {
    const entity = makePipelineEntity("cmd_002", "task.create");
    expect(entity.ts_created).toBe(entity.ts_updated);
    expect(() => new Date(entity.ts_created)).not.toThrow();
    expect(new Date(entity.ts_created).toISOString()).toBe(entity.ts_created);
  });

  it("accepts an explicit timestamp", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const entity = makePipelineEntity("cmd_003", "meeting.convene", ts);
    expect(entity.ts_created).toBe(ts);
  });

  it("produces a frozen (immutable) entity", () => {
    const entity = makePipelineEntity("cmd_004", "agent.spawn");
    expect(Object.isFrozen(entity)).toBe(true);
  });

  it("does not include error or duration_ms", () => {
    const entity = makePipelineEntity("cmd_005", "task.cancel");
    expect(entity.error).toBeUndefined();
    expect(entity.duration_ms).toBeUndefined();
  });
});

// ── 5. advancePipelineEntity ──────────────────────────────────────────────────

describe("advancePipelineEntity()", () => {
  const base = makePipelineEntity("cmd_010", "agent.spawn", "2026-01-01T00:00:00.000Z");

  it("returns a new entity with the new status on valid transition", () => {
    const next = advancePipelineEntity(base, "accepted", "command.issued");
    expect(next).not.toBeNull();
    expect(next!.status).toBe("accepted");
    expect(next!.command_id).toBe("cmd_010");
    expect(next!.trigger_event).toBe("command.issued");
  });

  it("does not mutate the original entity", () => {
    advancePipelineEntity(base, "accepted", "command.issued");
    expect(base.status).toBe("pending");
  });

  it("returns null for an invalid transition", () => {
    const result = advancePipelineEntity(base, "executing", "command.acknowledged");
    expect(result).toBeNull();
  });

  it("carries error detail for failed transitions", () => {
    const failed = advancePipelineEntity(
      base,
      "failed",
      "command.rejected",
      undefined,
      { code: "SCHEMA_INVALID", message: "Missing required field" },
    );
    expect(failed?.error?.code).toBe("SCHEMA_INVALID");
    expect(failed?.error?.message).toBe("Missing required field");
  });

  it("computes duration_ms on terminal states", () => {
    const ts_later = "2026-01-01T00:00:02.000Z"; // 2 seconds later
    const accepted = advancePipelineEntity(base, "accepted", "command.issued");
    const executing = advancePipelineEntity(accepted!, "executing", "command.acknowledged");
    const completed = advancePipelineEntity(
      executing!, "completed", "command.completed", ts_later,
    );
    expect(completed?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("produced entity is frozen (immutable)", () => {
    const next = advancePipelineEntity(base, "accepted", "command.issued");
    expect(Object.isFrozen(next)).toBe(true);
  });
});

// ── 6. mapEventTypeToStatus ───────────────────────────────────────────────────

describe("mapEventTypeToStatus()", () => {
  it("maps command.issued to accepted", () => {
    expect(mapEventTypeToStatus("command.issued")).toBe("accepted");
  });

  it("maps command.queued to accepted", () => {
    expect(mapEventTypeToStatus("command.queued")).toBe("accepted");
  });

  it("maps command.acknowledged to executing", () => {
    expect(mapEventTypeToStatus("command.acknowledged")).toBe("executing");
  });

  it("maps command.dispatched to executing", () => {
    expect(mapEventTypeToStatus("command.dispatched")).toBe("executing");
  });

  it("maps command.completed to completed", () => {
    expect(mapEventTypeToStatus("command.completed")).toBe("completed");
  });

  it("maps command.failed to failed", () => {
    expect(mapEventTypeToStatus("command.failed")).toBe("failed");
  });

  it("maps command.rejected to failed", () => {
    expect(mapEventTypeToStatus("command.rejected")).toBe("failed");
  });

  it("maps command.timeout to failed", () => {
    expect(mapEventTypeToStatus("command.timeout")).toBe("failed");
  });

  it("maps command.cancelled to failed", () => {
    expect(mapEventTypeToStatus("command.cancelled")).toBe("failed");
  });

  it("returns null for non-command events", () => {
    expect(mapEventTypeToStatus("pipeline.started")).toBeNull();
    expect(mapEventTypeToStatus("task.created")).toBeNull();
    expect(mapEventTypeToStatus("agent.spawned")).toBeNull();
    expect(mapEventTypeToStatus("layout.changed")).toBeNull();
    expect(mapEventTypeToStatus("unknown.event")).toBeNull();
  });
});

// ── 7. registerCommand — idempotent ───────────────────────────────────────────

describe("CommandFilePipelineWatcher.registerCommand()", () => {
  it("creates an entity in pending state", () => {
    const watcher = new CommandFilePipelineWatcher();
    const entity = watcher.registerCommand("cmd_100", "agent.spawn");
    expect(entity.status).toBe("pending");
    expect(entity.command_id).toBe("cmd_100");
    expect(watcher.size).toBe(1);
  });

  it("is idempotent — second call returns the same entity", () => {
    const watcher = new CommandFilePipelineWatcher();
    const e1 = watcher.registerCommand("cmd_101", "task.create");
    const e2 = watcher.registerCommand("cmd_101", "task.create");
    expect(e1).toBe(e2);
    expect(watcher.size).toBe(1);
  });

  it("appends a registration record to the transition log", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_102", "meeting.convene");
    const log = watcher.getTransitionLog();
    expect(log.length).toBe(1);
    expect(log[0]!.to_status).toBe("pending");
    expect(log[0]!.trigger_event).toBe("local.registered");
    expect(log[0]!.from_status).toBeNull();
  });
});

// ── 8. applyEvent — full happy path ───────────────────────────────────────────

describe("CommandFilePipelineWatcher.applyEvent() — happy path", () => {
  function makeEvent(
    type: string,
    command_id: string,
    extra?: Record<string, unknown>,
  ): CommandPipelineEvent {
    return { type, payload: { command_id, ...extra } };
  }

  it("pending → accepted → executing → completed", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_200", "agent.spawn");

    watcher.applyEvent(makeEvent("command.issued", "cmd_200"));
    expect(watcher.getEntity("cmd_200")?.status).toBe("accepted");

    watcher.applyEvent(makeEvent("command.acknowledged", "cmd_200"));
    expect(watcher.getEntity("cmd_200")?.status).toBe("executing");

    watcher.applyEvent(makeEvent("command.completed", "cmd_200"));
    expect(watcher.getEntity("cmd_200")?.status).toBe("completed");
  });

  it("pending → failed (via command.rejected)", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_201", "task.create");

    watcher.applyEvent(
      makeEvent("command.rejected", "cmd_201", {
        rejection_code: "SCHEMA_INVALID",
        rejection_reason: "Missing task title",
      }),
    );
    const entity = watcher.getEntity("cmd_201");
    expect(entity?.status).toBe("failed");
    expect(entity?.error?.code).toBe("SCHEMA_INVALID");
  });

  it("accepted → failed skips executing", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_202", "task.cancel");
    watcher.applyEvent(makeEvent("command.issued", "cmd_202"));
    watcher.applyEvent(makeEvent("command.failed", "cmd_202", {
      error_code: "TIMEOUT",
      error_message: "Processing timed out",
    }));
    const entity = watcher.getEntity("cmd_202");
    expect(entity?.status).toBe("failed");
    expect(entity?.error?.code).toBe("TIMEOUT");
  });

  it("trigger_event is recorded on each transition", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_203", "agent.terminate");
    watcher.applyEvent(makeEvent("command.queued", "cmd_203"));
    const entity = watcher.getEntity("cmd_203");
    expect(entity?.trigger_event).toBe("command.queued");
  });
});

// ── 9. applyEvent — invalid transitions ignored ───────────────────────────────

describe("CommandFilePipelineWatcher.applyEvent() — invalid transitions", () => {
  it("returns null for an invalid forward skip (pending → executing)", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_300", "agent.spawn");
    const result = watcher.applyEvent({
      type: "command.acknowledged",
      payload: { command_id: "cmd_300" },
    });
    // pending → executing is invalid (must go through accepted first)
    expect(result).toBeNull();
    expect(watcher.getEntity("cmd_300")?.status).toBe("pending");
  });

  it("does not transition a completed entity", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_301", "task.assign");
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_301" } });
    watcher.applyEvent({ type: "command.acknowledged", payload: { command_id: "cmd_301" } });
    watcher.applyEvent({ type: "command.completed", payload: { command_id: "cmd_301" } });

    // Try to apply another event after terminal state
    const result = watcher.applyEvent({
      type: "command.failed",
      payload: { command_id: "cmd_301" },
    });
    expect(result).toBeNull();
    expect(watcher.getEntity("cmd_301")?.status).toBe("completed");
  });

  it("returns null for non-command events", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_302", "agent.spawn");
    const result = watcher.applyEvent({
      type: "pipeline.started",
      payload: { command_id: "cmd_302" },
    });
    expect(result).toBeNull();
    expect(watcher.getEntity("cmd_302")?.status).toBe("pending");
  });

  it("returns null if payload lacks command_id", () => {
    const watcher = new CommandFilePipelineWatcher();
    const result = watcher.applyEvent({
      type: "command.completed",
      payload: {},
    });
    expect(result).toBeNull();
  });
});

// ── 10. Auto-creates entity for unknown commands ──────────────────────────────

describe("CommandFilePipelineWatcher.applyEvent() — unknown command_id", () => {
  it("auto-creates entity in pending then immediately advances to accepted", () => {
    const watcher = new CommandFilePipelineWatcher();
    const result = watcher.applyEvent({
      type: "command.issued",
      payload: { command_id: "cmd_auto_001", command_type: "agent.spawn" },
    });
    expect(result).not.toBeNull();
    expect(result?.command_id).toBe("cmd_auto_001");
    expect(result?.status).toBe("accepted");
    expect(watcher.size).toBe(1);
  });

  it("defaults command_type to 'unknown' if not in payload", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.applyEvent({
      type: "command.completed",
      payload: { command_id: "cmd_auto_002" },
    });
    // Should auto-register and then advance through pending → accepted is invalid
    // (command.completed maps to "completed", but pending → completed is invalid)
    // The entity should be created in pending but the transition should fail
    const entity = watcher.getEntity("cmd_auto_002");
    // Entity was auto-registered at pending
    expect(entity).toBeDefined();
    // Since pending→completed is invalid, it stays at pending
    expect(entity?.status).toBe("pending");
    expect(entity?.command_type).toBe("unknown");
  });
});

// ── 11. Transition log integrity ──────────────────────────────────────────────

describe("CommandFilePipelineWatcher transition log", () => {
  it("records every transition in order", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_400", "task.create");
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_400" } });
    watcher.applyEvent({ type: "command.acknowledged", payload: { command_id: "cmd_400" } });
    watcher.applyEvent({ type: "command.completed", payload: { command_id: "cmd_400" } });

    const log = watcher.getTransitionLog();
    expect(log.length).toBe(4); // register + issued + acknowledged + completed
    expect(log[0]!.to_status).toBe("pending");
    expect(log[1]!.to_status).toBe("accepted");
    expect(log[2]!.to_status).toBe("executing");
    expect(log[3]!.to_status).toBe("completed");
  });

  it("from_status is null only for the initial registration", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_401", "agent.spawn");
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_401" } });

    const log = watcher.getTransitionLog();
    expect(log[0]!.from_status).toBeNull();
    expect(log[1]!.from_status).toBe("pending");
  });

  it("getTransitionLog(n) returns at most n entries", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_402", "task.cancel");
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_402" } });
    watcher.applyEvent({ type: "command.completed", payload: { command_id: "cmd_402" } });

    // with limit=2, returns the last 2
    const limited = watcher.getTransitionLog(2);
    expect(limited.length).toBeLessThanOrEqual(2);
  });
});

// ── 12. setOnTransition callback ─────────────────────────────────────────────

describe("CommandFilePipelineWatcher.setOnTransition()", () => {
  it("fires the callback on each transition", () => {
    const watcher = new CommandFilePipelineWatcher();
    const transitions: Array<{ to: string; trigger: string }> = [];

    watcher.setOnTransition((entity, record) => {
      transitions.push({ to: entity.status, trigger: record.trigger_event });
    });

    watcher.registerCommand("cmd_500", "agent.spawn");
    // Note: registerCommand does NOT fire the transition callback (it's internal)
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_500" } });
    watcher.applyEvent({ type: "command.acknowledged", payload: { command_id: "cmd_500" } });
    watcher.applyEvent({ type: "command.completed", payload: { command_id: "cmd_500" } });

    expect(transitions).toHaveLength(3);
    expect(transitions[0]).toEqual({ to: "accepted", trigger: "command.issued" });
    expect(transitions[1]).toEqual({ to: "executing", trigger: "command.acknowledged" });
    expect(transitions[2]).toEqual({ to: "completed", trigger: "command.completed" });
  });

  it("does NOT fire callback for invalid transitions", () => {
    const watcher = new CommandFilePipelineWatcher();
    const fired = vi.fn();
    watcher.setOnTransition(fired);
    watcher.registerCommand("cmd_501", "task.create");

    // invalid: pending → executing
    watcher.applyEvent({ type: "command.acknowledged", payload: { command_id: "cmd_501" } });
    expect(fired).not.toHaveBeenCalled();
  });

  it("unsubscribes when null is passed", () => {
    const watcher = new CommandFilePipelineWatcher();
    const fired = vi.fn();
    watcher.setOnTransition(fired);
    watcher.setOnTransition(null);

    watcher.registerCommand("cmd_502", "agent.spawn");
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_502" } });
    expect(fired).not.toHaveBeenCalled();
  });
});

// ── 13. getEntitiesByStatus ───────────────────────────────────────────────────

describe("CommandFilePipelineWatcher.getEntitiesByStatus()", () => {
  it("returns only entities with the matching status", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_600", "agent.spawn");
    watcher.registerCommand("cmd_601", "task.create");
    watcher.registerCommand("cmd_602", "meeting.convene");

    // Advance cmd_600 to accepted
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_600" } });

    const pending = watcher.getEntitiesByStatus("pending");
    const accepted = watcher.getEntitiesByStatus("accepted");

    expect(pending.map((e) => e.command_id).sort()).toEqual(["cmd_601", "cmd_602"]);
    expect(accepted.map((e) => e.command_id)).toEqual(["cmd_600"]);
  });

  it("returns empty array if no entities match the status", () => {
    const watcher = new CommandFilePipelineWatcher();
    expect(watcher.getEntitiesByStatus("completed")).toHaveLength(0);
  });
});

// ── 14. Error detail on failure ───────────────────────────────────────────────

describe("Failed entity carries error detail", () => {
  it("error_code from command.failed payload", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_700", "agent.spawn");
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_700" } });
    watcher.applyEvent({ type: "command.acknowledged", payload: { command_id: "cmd_700" } });
    watcher.applyEvent({
      type: "command.failed",
      payload: {
        command_id: "cmd_700",
        error_code: "PROCESS_CRASH",
        error_message: "Agent process exited with code 1",
      },
    });

    const entity = watcher.getEntity("cmd_700");
    expect(entity?.status).toBe("failed");
    expect(entity?.error?.code).toBe("PROCESS_CRASH");
    expect(entity?.error?.message).toBe("Agent process exited with code 1");
  });

  it("rejection_code from command.rejected payload", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_701", "task.create");
    watcher.applyEvent({
      type: "command.rejected",
      payload: {
        command_id: "cmd_701",
        rejection_code: "DEDUPE_CONFLICT",
        rejection_reason: "Command with same idempotency key already processed",
      },
    });

    const entity = watcher.getEntity("cmd_701");
    expect(entity?.status).toBe("failed");
    expect(entity?.error?.code).toBe("DEDUPE_CONFLICT");
  });
});

// ── 15. duration_ms on terminal states ───────────────────────────────────────

describe("duration_ms computed on terminal states", () => {
  it("duration_ms is set when entity reaches completed", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_800", "task.assign");
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_800" } });
    watcher.applyEvent({ type: "command.acknowledged", payload: { command_id: "cmd_800" } });
    watcher.applyEvent({ type: "command.completed", payload: { command_id: "cmd_800" } });
    expect(watcher.getEntity("cmd_800")?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("explicit duration_ms in payload overrides computed value", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_801", "agent.spawn");
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_801" } });
    watcher.applyEvent({ type: "command.acknowledged", payload: { command_id: "cmd_801" } });
    watcher.applyEvent({
      type: "command.completed",
      payload: { command_id: "cmd_801", duration_ms: 1234 },
    });
    expect(watcher.getEntity("cmd_801")?.duration_ms).toBe(1234);
  });
});

// ── 16. createCommandFilePipelineWatcher factory ─────────────────────────────

describe("createCommandFilePipelineWatcher()", () => {
  it("returns a fresh CommandFilePipelineWatcher with size 0", () => {
    const watcher = createCommandFilePipelineWatcher();
    expect(watcher).toBeInstanceOf(CommandFilePipelineWatcher);
    expect(watcher.size).toBe(0);
  });
});

// ── 17. reset() clears all state ──────────────────────────────────────────────

describe("CommandFilePipelineWatcher.reset()", () => {
  it("clears all entities and the transition log", () => {
    const watcher = new CommandFilePipelineWatcher();
    watcher.registerCommand("cmd_900", "agent.spawn");
    watcher.applyEvent({ type: "command.issued", payload: { command_id: "cmd_900" } });

    watcher.reset();
    expect(watcher.size).toBe(0);
    expect(watcher.getTransitionLog()).toHaveLength(0);
    expect(watcher.getEntity("cmd_900")).toBeUndefined();
  });
});
