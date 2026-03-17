import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskReducer } from "../src/reducers/task-reducer.js";
import { StatusReducer } from "../src/reducers/status-reducer.js";
import { SCHEMA_VERSION } from "@conitens/protocol";
import type { ConitensEvent } from "@conitens/protocol";

let counter = 0;
function makeEvent(overrides: Partial<ConitensEvent> & { type: ConitensEvent["type"] }): ConitensEvent {
  return {
    schema: SCHEMA_VERSION,
    event_id: `evt_test_${++counter}`,
    ts: new Date().toISOString(),
    run_id: "run_test",
    actor: { kind: "system", id: "test" },
    payload: {},
    ...overrides,
  };
}

describe("TaskReducer", () => {
  let tempDir: string;
  let reducer: TaskReducer;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-reducer-test-"));
    reducer = new TaskReducer();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates task entity file on task.created", async () => {
    await reducer.reduce(
      makeEvent({ type: "task.created", task_id: "task-0001", payload: { title: "Test" } }),
      tempDir,
    );

    const content = await readFile(join(tempDir, "tasks", "task-0001.md"), "utf-8");
    expect(content).toContain("task-0001");
    expect(content).toContain("draft");
  });

  it("updates state on task.status_changed with valid transition", async () => {
    await reducer.reduce(
      makeEvent({ type: "task.created", task_id: "task-0002" }),
      tempDir,
    );
    await reducer.reduce(
      makeEvent({ type: "task.status_changed", task_id: "task-0002", payload: { to: "planned" } }),
      tempDir,
    );

    const content = await readFile(join(tempDir, "tasks", "task-0002.md"), "utf-8");
    expect(content).toContain("planned");
  });

  it("writes TASKS.md view", async () => {
    await reducer.reduce(
      makeEvent({ type: "task.created", task_id: "task-0003" }),
      tempDir,
    );

    const view = await readFile(join(tempDir, "views", "TASKS.md"), "utf-8");
    expect(view).toContain("task-0003");
    expect(view).toContain("draft");
  });

  it("assigns agent on task.assigned", async () => {
    await reducer.reduce(
      makeEvent({ type: "task.created", task_id: "task-0004" }),
      tempDir,
    );
    await reducer.reduce(
      makeEvent({ type: "task.assigned", task_id: "task-0004", payload: { assignee: "claude" } }),
      tempDir,
    );

    const content = await readFile(join(tempDir, "tasks", "task-0004.md"), "utf-8");
    expect(content).toContain("claude");
    expect(content).toContain("assigned");
  });

  it("marks task as done on task.completed", async () => {
    await reducer.reduce(makeEvent({ type: "task.created", task_id: "task-0005" }), tempDir);
    await reducer.reduce(makeEvent({ type: "task.status_changed", task_id: "task-0005", payload: { to: "planned" } }), tempDir);
    await reducer.reduce(makeEvent({ type: "task.status_changed", task_id: "task-0005", payload: { to: "assigned" } }), tempDir);
    await reducer.reduce(makeEvent({ type: "task.status_changed", task_id: "task-0005", payload: { to: "active" } }), tempDir);
    await reducer.reduce(makeEvent({ type: "task.status_changed", task_id: "task-0005", payload: { to: "review" } }), tempDir);
    await reducer.reduce(makeEvent({ type: "task.completed", task_id: "task-0005" }), tempDir);

    const content = await readFile(join(tempDir, "tasks", "task-0005.md"), "utf-8");
    expect(content).toContain("done");
  });
});

describe("StatusReducer", () => {
  let tempDir: string;
  let reducer: StatusReducer;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-status-test-"));
    reducer = new StatusReducer();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("tracks agent spawn in STATUS.md", async () => {
    await reducer.reduce(
      makeEvent({ type: "agent.spawned", actor: { kind: "agent", id: "claude" } }),
      tempDir,
    );

    const status = await readFile(join(tempDir, "views", "STATUS.md"), "utf-8");
    expect(status).toContain("claude");
    expect(status).toContain("running");
  });

  it("tracks agent termination", async () => {
    await reducer.reduce(
      makeEvent({ type: "agent.spawned", actor: { kind: "agent", id: "codex" } }),
      tempDir,
    );
    await reducer.reduce(
      makeEvent({ type: "agent.terminated", actor: { kind: "agent", id: "codex" } }),
      tempDir,
    );

    const status = await readFile(join(tempDir, "views", "STATUS.md"), "utf-8");
    expect(status).toContain("terminated");
  });

  it("tracks agent error", async () => {
    await reducer.reduce(
      makeEvent({ type: "agent.spawned", actor: { kind: "agent", id: "gemini" } }),
      tempDir,
    );
    await reducer.reduce(
      makeEvent({
        type: "agent.error",
        actor: { kind: "agent", id: "gemini" },
        payload: { message: "out of memory" },
      }),
      tempDir,
    );

    const status = await readFile(join(tempDir, "views", "STATUS.md"), "utf-8");
    expect(status).toContain("error");
  });
});
