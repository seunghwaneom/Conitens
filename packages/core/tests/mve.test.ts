import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initConitens } from "../src/init/init.js";
import { EventLog } from "../src/event-log/event-log.js";
import { Orchestrator } from "../src/orchestrator/orchestrator.js";
import { TaskReducer } from "../src/reducers/task-reducer.js";
import { StatusReducer } from "../src/reducers/status-reducer.js";
import { replayAll } from "../src/replay/replay.js";

describe("MVE Integration", () => {
  let tempDir: string;
  let conitensDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-mve-test-"));
    conitensDir = join(tempDir, ".conitens");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("full task lifecycle: init -> create -> assign -> active -> review -> done -> replay", async () => {
    // Step 1: Initialize .conitens/
    await initConitens({ rootDir: tempDir });

    const modeContent = await readFile(join(conitensDir, "MODE.md"), "utf-8");
    expect(modeContent).toContain("antigravity");

    // Step 2: Set up orchestrator
    const eventsDir = join(conitensDir, "events");
    const commandsDir = join(conitensDir, "commands");
    const eventLog = new EventLog(eventsDir);
    const taskReducer = new TaskReducer();
    const statusReducer = new StatusReducer();

    const orchestrator = new Orchestrator({
      eventLog,
      conitensDir,
      reducers: [taskReducer, statusReducer],
    });

    // Step 3: Submit commands for full task lifecycle
    const commands = [
      { type: "task.created", run_id: "run_mve", task_id: "task-0001", actor: { kind: "user", id: "seunghwan" }, payload: { title: "Implement login" } },
      { type: "task.status_changed", run_id: "run_mve", task_id: "task-0001", actor: { kind: "user", id: "seunghwan" }, payload: { to: "planned" } },
      { type: "task.assigned", run_id: "run_mve", task_id: "task-0001", actor: { kind: "system", id: "orchestrator" }, payload: { assignee: "claude" } },
      { type: "agent.spawned", run_id: "run_mve", actor: { kind: "agent", id: "claude" }, payload: {} },
      { type: "task.status_changed", run_id: "run_mve", task_id: "task-0001", actor: { kind: "agent", id: "claude" }, payload: { to: "active" } },
      { type: "task.status_changed", run_id: "run_mve", task_id: "task-0001", actor: { kind: "agent", id: "claude" }, payload: { to: "review" } },
      { type: "task.completed", run_id: "run_mve", task_id: "task-0001", actor: { kind: "system", id: "validator" }, payload: {} },
    ];

    for (let i = 0; i < commands.length; i++) {
      const cmdPath = join(commandsDir, `cmd-${String(i).padStart(3, "0")}.md`);
      await writeFile(cmdPath, JSON.stringify(commands[i]));
      await orchestrator.processCommand(cmdPath);
    }

    // Step 4: Verify final state
    const taskFile = await readFile(join(conitensDir, "tasks", "task-0001.md"), "utf-8");
    expect(taskFile).toContain("done");
    expect(taskFile).toContain("claude");

    const tasksView = await readFile(join(conitensDir, "views", "TASKS.md"), "utf-8");
    expect(tasksView).toContain("task-0001");
    expect(tasksView).toContain("done");

    const statusView = await readFile(join(conitensDir, "views", "STATUS.md"), "utf-8");
    expect(statusView).toContain("claude");
    expect(statusView).toContain("running");

    // Step 5: Kill/Replay recovery
    await rm(join(conitensDir, "tasks"), { recursive: true, force: true });
    await rm(join(conitensDir, "views"), { recursive: true, force: true });

    const { eventCount } = await replayAll(eventsDir, conitensDir, [
      new TaskReducer(),
      new StatusReducer(),
    ]);
    expect(eventCount).toBe(7);

    // Verify rebuilt state
    const taskAfterReplay = await readFile(join(conitensDir, "tasks", "task-0001.md"), "utf-8");
    expect(taskAfterReplay).toContain("done");
    expect(taskAfterReplay).toContain("claude");

    const viewAfterReplay = await readFile(join(conitensDir, "views", "TASKS.md"), "utf-8");
    expect(viewAfterReplay).toContain("done");

    const statusAfterReplay = await readFile(join(conitensDir, "views", "STATUS.md"), "utf-8");
    expect(statusAfterReplay).toContain("claude");
  });
});
