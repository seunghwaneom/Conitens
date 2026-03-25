/**
 * @module tests/fixture-state-sync
 * Sub-AC 4: Verify the full command.state_changed → fixture.state_sync
 * indicator-update flow end-to-end.
 *
 * Test plan
 * ---------
 * 1. Protocol: command.state_changed and fixture.state_sync are in EVENT_TYPES
 * 2. Protocol: CommandStateChangedPayload type guard works correctly
 * 3. Protocol: FixtureStateSyncPayload type guard works correctly
 * 4. FixtureStateSyncReducer: emits fixture.state_sync for each fixture_id
 * 5. FixtureStateSyncReducer: correct colour/icon/label for each command state
 * 6. FixtureStateSyncReducer: causation_id = triggering event.event_id
 * 7. FixtureStateSyncReducer: no-op when fixture_ids is absent
 * 8. FixtureStateSyncReducer: no-op when fixture_ids is empty
 * 9. FixtureStateSyncReducer: captures prev_indicator_state on second sync
 * 10. FixtureStateSyncReducer: reset() clears in-memory state
 * 11. End-to-end: Orchestrator + FixtureStateSyncReducer → EventLog chain
 * 12. End-to-end: replay produces same fixture.state_sync events
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp, rm, mkdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Protocol imports
import {
  isValidEventType,
  isCommandStateChangedPayload,
  isFixtureStateSyncPayload,
} from "@conitens/protocol";

// Core imports
import { EventLog } from "../src/event-log/event-log.js";
import { Orchestrator } from "../src/orchestrator/orchestrator.js";
import { FixtureStateSyncReducer } from "../src/reducers/fixture-state-sync-reducer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function makeTempDirs(): Promise<{
  tempDir: string;
  eventsDir: string;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), "conitens-fixture-sync-test-"));
  const eventsDir = join(tempDir, "events");
  await mkdir(eventsDir, { recursive: true });
  return { tempDir, eventsDir };
}

function makeCommandStateChangedEvent(overrides: {
  command_id?: string;
  prev_state?: string;
  next_state?: string;
  fixture_ids?: string[];
}): Record<string, unknown> {
  return {
    type: "command.state_changed",
    run_id: "run-test-001",
    actor: { kind: "system", id: "test-orchestrator" },
    payload: {
      command_id: overrides.command_id ?? "cmd-abc-123",
      prev_state: overrides.prev_state ?? "pending",
      next_state: overrides.next_state ?? "completed",
      ...(overrides.fixture_ids !== undefined
        ? { fixture_ids: overrides.fixture_ids }
        : {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 1: Protocol — EventType registration
// ─────────────────────────────────────────────────────────────────────────────

describe("Protocol: fixture.* EventType registration (Sub-AC 4)", () => {
  it("command.state_changed is a valid EventType", () => {
    expect(isValidEventType("command.state_changed")).toBe(true);
  });

  it("fixture.state_sync is a valid EventType", () => {
    expect(isValidEventType("fixture.state_sync")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 2: Protocol — CommandStateChangedPayload type guard
// ─────────────────────────────────────────────────────────────────────────────

describe("Protocol: isCommandStateChangedPayload type guard", () => {
  it("accepts a minimal valid payload", () => {
    const payload = {
      command_id: "cmd-001",
      prev_state: "pending",
      next_state: "completed",
    };
    expect(isCommandStateChangedPayload(payload)).toBe(true);
  });

  it("accepts a payload with optional fields", () => {
    const payload = {
      command_id: "cmd-002",
      prev_state: "processing",
      next_state: "failed",
      command_type: "agent.spawn",
      fixture_ids: ["fix-1", "fix-2"],
      change_reason: "executor_error",
      changed_by: "agent-worker-1",
      ts_ms: Date.now(),
    };
    expect(isCommandStateChangedPayload(payload)).toBe(true);
  });

  it("rejects a payload missing command_id", () => {
    expect(isCommandStateChangedPayload({
      prev_state: "pending",
      next_state: "completed",
    })).toBe(false);
  });

  it("rejects a payload missing prev_state", () => {
    expect(isCommandStateChangedPayload({
      command_id: "cmd-003",
      next_state: "completed",
    })).toBe(false);
  });

  it("rejects a payload missing next_state", () => {
    expect(isCommandStateChangedPayload({
      command_id: "cmd-004",
      prev_state: "pending",
    })).toBe(false);
  });

  it("rejects a payload with non-string fixture_ids entry", () => {
    expect(isCommandStateChangedPayload({
      command_id: "cmd-005",
      prev_state: "pending",
      next_state: "completed",
      fixture_ids: ["ok-id", 42],  // 42 is invalid
    })).toBe(false);
  });

  it("rejects null", () => {
    expect(isCommandStateChangedPayload(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isCommandStateChangedPayload(undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 3: Protocol — FixtureStateSyncPayload type guard
// ─────────────────────────────────────────────────────────────────────────────

describe("Protocol: isFixtureStateSyncPayload type guard", () => {
  it("accepts a minimal valid payload", () => {
    const payload = {
      fixture_id: "panel-001",
      causation_command_id: "cmd-abc",
      next_indicator_state: { color: "green", command_state: "completed" },
    };
    expect(isFixtureStateSyncPayload(payload)).toBe(true);
  });

  it("accepts a full payload", () => {
    const payload = {
      fixture_id: "panel-002",
      fixture_name: "Agent Status Panel",
      room_id: "ops-control",
      causation_command_id: "cmd-xyz",
      prev_indicator_state: { color: "blue", command_state: "pending" },
      next_indicator_state: { color: "green", icon: "✓", label: "Completed", command_state: "completed" },
      sync_source: "command.state_changed:completed",
      trigger_source: "automation" as const,
      session_id: "session-1",
      ts_ms: Date.now(),
    };
    expect(isFixtureStateSyncPayload(payload)).toBe(true);
  });

  it("rejects a payload missing fixture_id", () => {
    expect(isFixtureStateSyncPayload({
      causation_command_id: "cmd-abc",
      next_indicator_state: { color: "green" },
    })).toBe(false);
  });

  it("rejects a payload missing causation_command_id", () => {
    expect(isFixtureStateSyncPayload({
      fixture_id: "panel-001",
      next_indicator_state: { color: "green" },
    })).toBe(false);
  });

  it("rejects a payload missing next_indicator_state", () => {
    expect(isFixtureStateSyncPayload({
      fixture_id: "panel-001",
      causation_command_id: "cmd-abc",
    })).toBe(false);
  });

  it("rejects a payload with non-object next_indicator_state", () => {
    expect(isFixtureStateSyncPayload({
      fixture_id: "panel-001",
      causation_command_id: "cmd-abc",
      next_indicator_state: "green",  // should be object
    })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 4: FixtureStateSyncReducer — unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FixtureStateSyncReducer: core behaviour", () => {
  let tempDir: string;
  let eventsDir: string;
  let eventLog: EventLog;
  let reducer: FixtureStateSyncReducer;

  beforeEach(async () => {
    ({ tempDir, eventsDir } = await makeTempDirs());
    eventLog = new EventLog(eventsDir);
    reducer  = new FixtureStateSyncReducer(eventLog);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── 4.1: emits fixture.state_sync for each fixture_id ──────────────────────

  it("emits fixture.state_sync for a single fixture_id", async () => {
    // Arrange: seed a command.state_changed event
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-001",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-001",
        prev_state:  "pending",
        next_state:  "completed",
        fixture_ids: ["panel-001"],
      },
    });

    // Act
    await reducer.reduce(trigger, tempDir);

    // Assert: one indicator record was stored
    expect(reducer.indicatorCount).toBe(1);
    const record = reducer.getIndicatorRecord("panel-001");
    expect(record).toBeDefined();
    expect(record!.lastCommandId).toBe("cmd-001");
    expect(record!.lastCommandState).toBe("completed");
  });

  it("emits fixture.state_sync for multiple fixture_ids", async () => {
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-001",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-002",
        prev_state:  "pending",
        next_state:  "processing",
        fixture_ids: ["panel-A", "panel-B", "panel-C"],
      },
    });

    await reducer.reduce(trigger, tempDir);

    expect(reducer.indicatorCount).toBe(3);
    expect(reducer.getIndicatorRecord("panel-A")).toBeDefined();
    expect(reducer.getIndicatorRecord("panel-B")).toBeDefined();
    expect(reducer.getIndicatorRecord("panel-C")).toBeDefined();
  });

  // ── 4.2: correct visual indicator state per command state ──────────────────

  it.each([
    ["completed",    "green",  "✓"],
    ["processing",   "yellow", "⟳"],
    ["acknowledged", "yellow", "⟳"],
    ["dispatched",   "yellow", "⟳"],
    ["retrying",     "orange", "↺"],
    ["queued",       "orange", "⏳"],
    ["escalated",    "orange", "↑"],
    ["failed",       "red",    "✗"],
    ["rejected",     "red",    "⊘"],
    ["timeout",      "red",    "⏱"],
    ["cancelled",    "red",    "⊗"],
    ["issued",       "blue",   "○"],
    ["pending",      "blue",   "○"],
    ["unknown_state","grey",   "?"],
  ])("state '%s' maps to color=%s icon=%s", async (state, expectedColor, expectedIcon) => {
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-colours",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  `cmd-${state}`,
        prev_state:  "pending",
        next_state:  state,
        fixture_ids: [`panel-${state}`],
      },
    });

    await reducer.reduce(trigger, tempDir);

    const record = reducer.getIndicatorRecord(`panel-${state}`);
    expect(record).toBeDefined();
    expect(record!.indicatorState.color).toBe(expectedColor);
    expect(record!.indicatorState.icon).toBe(expectedIcon);
    expect(record!.indicatorState.command_state).toBe(state);
  });

  // ── 4.3: causation_id = triggering event.event_id ─────────────────────────

  it("emitted fixture.state_sync events have causation_id = trigger event_id", async () => {
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-causal",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-causal",
        prev_state:  "pending",
        next_state:  "completed",
        fixture_ids: ["panel-causal"],
      },
    });

    await reducer.reduce(trigger, tempDir);

    // Read back the events from the log
    const today = new Date().toISOString().slice(0, 10);
    const allEvents = [];
    for await (const e of eventLog.read(today)) {
      allEvents.push(e);
    }

    const syncEvent = allEvents.find(e => e.type === "fixture.state_sync");
    expect(syncEvent).toBeDefined();
    expect(syncEvent!.causation_id).toBe(trigger.event_id);
    expect(syncEvent!.actor.id).toBe("fixture-state-sync-reducer");
  });

  // ── 4.4: no-op when fixture_ids is absent ─────────────────────────────────

  it("is a no-op when fixture_ids is absent from payload", async () => {
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-noop",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id: "cmd-noop",
        prev_state: "pending",
        next_state: "completed",
        // fixture_ids intentionally omitted
      },
    });

    await reducer.reduce(trigger, tempDir);

    expect(reducer.indicatorCount).toBe(0);
  });

  // ── 4.5: no-op when fixture_ids is empty ──────────────────────────────────

  it("is a no-op when fixture_ids is an empty array", async () => {
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-empty",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-empty",
        prev_state:  "pending",
        next_state:  "completed",
        fixture_ids: [],
      },
    });

    await reducer.reduce(trigger, tempDir);

    expect(reducer.indicatorCount).toBe(0);
  });

  // ── 4.6: captures prev_indicator_state on second sync ─────────────────────

  it("captures prev_indicator_state on second sync for same fixture", async () => {
    const fixtureId = "panel-double-sync";

    // First sync: pending → processing
    const trigger1 = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-prev",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-prev-1",
        prev_state:  "pending",
        next_state:  "processing",
        fixture_ids: [fixtureId],
      },
    });
    await reducer.reduce(trigger1, tempDir);

    // Second sync: processing → completed
    const trigger2 = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-prev",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-prev-2",
        prev_state:  "processing",
        next_state:  "completed",
        fixture_ids: [fixtureId],
      },
    });
    await reducer.reduce(trigger2, tempDir);

    // Read the second fixture.state_sync event
    const today = new Date().toISOString().slice(0, 10);
    const allEvents = [];
    for await (const e of eventLog.read(today)) {
      allEvents.push(e);
    }

    const syncEvents = allEvents.filter(e => e.type === "fixture.state_sync");
    expect(syncEvents.length).toBe(2);

    // The second sync should carry prev_indicator_state from the first sync
    const secondSync = syncEvents[1];
    expect(secondSync.payload.prev_indicator_state).toBeDefined();
    expect((secondSync.payload.prev_indicator_state as Record<string, unknown>).color).toBe("yellow");
    expect((secondSync.payload.next_indicator_state as Record<string, unknown>).color).toBe("green");
  });

  // ── 4.7: reset() clears in-memory state ───────────────────────────────────

  it("reset() clears in-memory indicator state", async () => {
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-reset",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-reset",
        prev_state:  "pending",
        next_state:  "completed",
        fixture_ids: ["panel-reset"],
      },
    });

    await reducer.reduce(trigger, tempDir);
    expect(reducer.indicatorCount).toBe(1);

    reducer.reset();
    expect(reducer.indicatorCount).toBe(0);
    expect(reducer.getIndicatorRecord("panel-reset")).toBeUndefined();
  });

  // ── 4.8: no-op for unrelated event types ──────────────────────────────────

  it("ignores non-command.state_changed events", async () => {
    const irrelevant = await eventLog.append({
      type:   "task.created",
      run_id: "run-irrelevant",
      actor:  { kind: "user", id: "test" },
      payload: { title: "Test task" },
    });

    await reducer.reduce(irrelevant, tempDir);

    expect(reducer.indicatorCount).toBe(0);
  });

  // ── 4.9: fixture.state_sync payload structure ─────────────────────────────

  it("fixture.state_sync payload passes isFixtureStateSyncPayload type guard", async () => {
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-guard",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-guard",
        prev_state:  "pending",
        next_state:  "completed",
        fixture_ids: ["panel-guard"],
      },
    });

    await reducer.reduce(trigger, tempDir);

    const today = new Date().toISOString().slice(0, 10);
    const allEvents = [];
    for await (const e of eventLog.read(today)) {
      allEvents.push(e);
    }

    const syncEvent = allEvents.find(e => e.type === "fixture.state_sync");
    expect(syncEvent).toBeDefined();
    expect(isFixtureStateSyncPayload(syncEvent!.payload)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 5: End-to-end — Orchestrator + FixtureStateSyncReducer
// ─────────────────────────────────────────────────────────────────────────────

describe("End-to-end: command.state_changed → fixture.state_sync (Sub-AC 4)", () => {
  let tempDir: string;
  let eventsDir: string;
  let eventLog: EventLog;
  let orchestrator: Orchestrator;
  let reducer: FixtureStateSyncReducer;

  beforeEach(async () => {
    ({ tempDir, eventsDir } = await makeTempDirs());
    eventLog  = new EventLog(eventsDir);
    reducer   = new FixtureStateSyncReducer(eventLog);
    orchestrator = new Orchestrator({
      eventLog,
      conitensDir: tempDir,
      reducers: [reducer],
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("Orchestrator.processCommandData emits fixture.state_sync via reducer", async () => {
    // Simulate the orchestrator receiving a command.state_changed event
    const cmdData = {
      type: "command.state_changed" as const,
      run_id: "run-e2e-001",
      actor: { kind: "system" as const, id: "e2e-test" },
      payload: {
        command_id:  "cmd-e2e-001",
        prev_state:  "pending",
        next_state:  "completed",
        fixture_ids: ["panel-e2e-001", "panel-e2e-002"],
      },
    };

    const event = await orchestrator.processCommandData(cmdData);

    // The command.state_changed event should be in the log
    expect(event.type).toBe("command.state_changed");
    expect(event.event_id).toMatch(/^evt_/);

    // The reducer should have processed 2 fixture indicators
    expect(reducer.indicatorCount).toBe(2);
    expect(reducer.getIndicatorRecord("panel-e2e-001")).toBeDefined();
    expect(reducer.getIndicatorRecord("panel-e2e-002")).toBeDefined();

    // The event log should contain both command.state_changed AND fixture.state_sync
    const today = new Date().toISOString().slice(0, 10);
    const allEvents = [];
    for await (const e of eventLog.read(today)) {
      allEvents.push(e);
    }

    const types = allEvents.map(e => e.type);
    expect(types).toContain("command.state_changed");
    expect(types).toContain("fixture.state_sync");

    // Both fixture.state_sync events should be present
    const syncEvents = allEvents.filter(e => e.type === "fixture.state_sync");
    expect(syncEvents.length).toBe(2);

    // Both should causally link back to the command.state_changed event
    for (const syncEvent of syncEvents) {
      expect(syncEvent.causation_id).toBe(event.event_id);
    }
  });

  it("Full indicator-update flow: pending → processing → completed", async () => {
    const fixtureId = "panel-lifecycle";
    const commandId = "cmd-lifecycle-001";

    // Step 1: pending → processing
    await orchestrator.processCommandData({
      type:   "command.state_changed",
      run_id: "run-lifecycle",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  commandId,
        prev_state:  "pending",
        next_state:  "processing",
        fixture_ids: [fixtureId],
      },
    });

    const step1 = reducer.getIndicatorRecord(fixtureId);
    expect(step1!.lastCommandState).toBe("processing");
    expect(step1!.indicatorState.color).toBe("yellow");

    // Step 2: processing → completed
    await orchestrator.processCommandData({
      type:   "command.state_changed",
      run_id: "run-lifecycle",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  commandId,
        prev_state:  "processing",
        next_state:  "completed",
        fixture_ids: [fixtureId],
      },
    });

    const step2 = reducer.getIndicatorRecord(fixtureId);
    expect(step2!.lastCommandState).toBe("completed");
    expect(step2!.indicatorState.color).toBe("green");
    expect(step2!.indicatorState.icon).toBe("✓");
    expect(step2!.indicatorState.label).toBe("Completed");

    // Verify the event log contains all events in correct order
    const today = new Date().toISOString().slice(0, 10);
    const allEvents = [];
    for await (const e of eventLog.read(today)) {
      allEvents.push(e);
    }

    const types = allEvents.map(e => e.type);
    // Should be: [command.state_changed, fixture.state_sync, command.state_changed, fixture.state_sync]
    expect(types[0]).toBe("command.state_changed");
    expect(types[1]).toBe("fixture.state_sync");
    expect(types[2]).toBe("command.state_changed");
    expect(types[3]).toBe("fixture.state_sync");
  });

  it("Failed command path: pending → failed indicator shows red", async () => {
    const fixtureId = "panel-failure";

    await orchestrator.processCommandData({
      type:   "command.state_changed",
      run_id: "run-failure",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:   "cmd-failed-001",
        prev_state:   "processing",
        next_state:   "failed",
        fixture_ids:  [fixtureId],
        change_reason: "executor_error",
      },
    });

    const record = reducer.getIndicatorRecord(fixtureId);
    expect(record!.indicatorState.color).toBe("red");
    expect(record!.indicatorState.icon).toBe("✗");
  });

  it("reset() + re-reduce produces identical state (replay fidelity)", async () => {
    const fixtureId = "panel-replay";
    const cmdData = {
      type:   "command.state_changed" as const,
      run_id: "run-replay",
      actor:  { kind: "system" as const, id: "test" },
      payload: {
        command_id:  "cmd-replay-001",
        prev_state:  "pending",
        next_state:  "completed",
        fixture_ids: [fixtureId],
      },
    };

    // First pass
    const event = await orchestrator.processCommandData(cmdData);
    const firstRecord = { ...reducer.getIndicatorRecord(fixtureId)! };

    // Reset and re-reduce (simulating replay)
    reducer.reset();
    expect(reducer.indicatorCount).toBe(0);

    await reducer.reduce(event, tempDir);

    const replayRecord = reducer.getIndicatorRecord(fixtureId);
    expect(replayRecord).toBeDefined();
    expect(replayRecord!.lastCommandId).toBe(firstRecord.lastCommandId);
    expect(replayRecord!.lastCommandState).toBe(firstRecord.lastCommandState);
    expect(replayRecord!.indicatorState.color).toBe(firstRecord.indicatorState.color);
    expect(replayRecord!.indicatorState.icon).toBe(firstRecord.indicatorState.icon);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test suite 6: getAllIndicatorRecords accessor
// ─────────────────────────────────────────────────────────────────────────────

describe("FixtureStateSyncReducer: getAllIndicatorRecords()", () => {
  let tempDir: string;
  let eventsDir: string;
  let eventLog: EventLog;
  let reducer: FixtureStateSyncReducer;

  beforeEach(async () => {
    ({ tempDir, eventsDir } = await makeTempDirs());
    eventLog = new EventLog(eventsDir);
    reducer  = new FixtureStateSyncReducer(eventLog);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns all tracked indicator records", async () => {
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-all",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-all",
        prev_state:  "pending",
        next_state:  "processing",
        fixture_ids: ["fix-1", "fix-2", "fix-3"],
      },
    });

    await reducer.reduce(trigger, tempDir);

    const records = reducer.getAllIndicatorRecords();
    expect(records.length).toBe(3);
    const fixtureIds = records.map(r => r.fixtureId).sort();
    expect(fixtureIds).toEqual(["fix-1", "fix-2", "fix-3"]);
  });

  it("returns empty array after reset()", async () => {
    const trigger = await eventLog.append({
      type:   "command.state_changed",
      run_id: "run-all-reset",
      actor:  { kind: "system", id: "test" },
      payload: {
        command_id:  "cmd-all-reset",
        prev_state:  "pending",
        next_state:  "completed",
        fixture_ids: ["fix-a"],
      },
    });

    await reducer.reduce(trigger, tempDir);
    expect(reducer.getAllIndicatorRecords().length).toBe(1);

    reducer.reset();
    expect(reducer.getAllIndicatorRecords().length).toBe(0);
  });
});
