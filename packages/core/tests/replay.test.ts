import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventLog } from "../src/event-log/event-log.js";
import { TaskReducer } from "../src/reducers/task-reducer.js";
import { StatusReducer } from "../src/reducers/status-reducer.js";
import { replayAll } from "../src/replay/replay.js";
import { SCHEMA_VERSION } from "@conitens/protocol";
import type { ConitensEvent } from "@conitens/protocol";

let counter = 0;
function makeEvent(overrides: Partial<ConitensEvent> & { type: ConitensEvent["type"] }): ConitensEvent {
  return {
    schema: SCHEMA_VERSION,
    event_id: `evt_replay_${++counter}`,
    ts: new Date().toISOString(),
    run_id: "run_test",
    actor: { kind: "system", id: "test" },
    payload: {},
    ...overrides,
  };
}

describe("Kill/Replay Recovery", () => {
  let tempDir: string;
  let eventsDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-replay-test-"));
    eventsDir = join(tempDir, "events");
    await mkdir(eventsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("rebuilds tasks from events after simulated crash", async () => {
    const log = new EventLog(eventsDir);
    const taskReducer = new TaskReducer();

    // Normal operation: append events and run reducer
    const events = [
      makeEvent({ type: "task.created", task_id: "task-0001", payload: { title: "Login API" } }),
      makeEvent({ type: "task.assigned", task_id: "task-0001", payload: { assignee: "claude" } }),
      makeEvent({ type: "task.created", task_id: "task-0002", payload: { title: "Dashboard" } }),
    ];

    for (const event of events) {
      const appended = await log.append(event);
      await taskReducer.reduce(appended, tempDir);
    }

    // Verify files exist before crash
    const tasksBefore = await readFile(join(tempDir, "tasks", "task-0001.md"), "utf-8");
    expect(tasksBefore).toContain("assigned");
    expect(tasksBefore).toContain("claude");

    // Simulate crash — delete ALL entity and view files
    await rm(join(tempDir, "tasks"), { recursive: true, force: true });
    await rm(join(tempDir, "views"), { recursive: true, force: true });

    // Replay from events — rebuild everything
    const { eventCount } = await replayAll(eventsDir, tempDir, [taskReducer]);
    expect(eventCount).toBe(3);

    // Verify rebuilt state matches original
    const tasksAfter = await readFile(join(tempDir, "tasks", "task-0001.md"), "utf-8");
    expect(tasksAfter).toContain("assigned");
    expect(tasksAfter).toContain("claude");

    const viewAfter = await readFile(join(tempDir, "views", "TASKS.md"), "utf-8");
    expect(viewAfter).toContain("task-0001");
    expect(viewAfter).toContain("task-0002");
  });

  it("rebuilds agent status from events after crash", async () => {
    const log = new EventLog(eventsDir);
    const statusReducer = new StatusReducer();

    const events = [
      makeEvent({ type: "agent.spawned", actor: { kind: "agent", id: "claude" } }),
      makeEvent({ type: "agent.spawned", actor: { kind: "agent", id: "codex" } }),
      makeEvent({ type: "agent.terminated", actor: { kind: "agent", id: "codex" } }),
    ];

    for (const event of events) {
      const appended = await log.append(event);
      await statusReducer.reduce(appended, tempDir);
    }

    await rm(join(tempDir, "views"), { recursive: true, force: true });

    const { eventCount } = await replayAll(eventsDir, tempDir, [statusReducer]);
    expect(eventCount).toBe(3);

    const statusAfter = await readFile(join(tempDir, "views", "STATUS.md"), "utf-8");
    expect(statusAfter).toContain("claude");
    expect(statusAfter).toContain("running");
    expect(statusAfter).toContain("terminated");
  });

  it("replay with multiple reducers rebuilds all state", async () => {
    const log = new EventLog(eventsDir);

    const events = [
      makeEvent({ type: "task.created", task_id: "task-0010" }),
      makeEvent({ type: "agent.spawned", actor: { kind: "agent", id: "gemini" } }),
      makeEvent({ type: "task.assigned", task_id: "task-0010", payload: { assignee: "gemini" } }),
    ];

    for (const event of events) {
      await log.append(event);
    }

    const { eventCount } = await replayAll(eventsDir, tempDir, [
      new TaskReducer(),
      new StatusReducer(),
    ]);
    expect(eventCount).toBe(3);

    const tasks = await readFile(join(tempDir, "views", "TASKS.md"), "utf-8");
    expect(tasks).toContain("task-0010");

    const status = await readFile(join(tempDir, "views", "STATUS.md"), "utf-8");
    expect(status).toContain("gemini");
  });
});
