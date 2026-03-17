import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventLog } from "../src/event-log/event-log.js";
import { Orchestrator } from "../src/orchestrator/orchestrator.js";
import { TaskReducer } from "../src/reducers/task-reducer.js";

describe("Orchestrator", () => {
  let tempDir: string;
  let eventsDir: string;
  let commandsDir: string;
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-orch-test-"));
    eventsDir = join(tempDir, "events");
    commandsDir = join(tempDir, "commands");
    await mkdir(eventsDir, { recursive: true });
    await mkdir(commandsDir, { recursive: true });

    const eventLog = new EventLog(eventsDir);
    orchestrator = new Orchestrator({
      eventLog,
      conitensDir: tempDir,
      reducers: [new TaskReducer()],
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("processes valid JSON command and creates event", async () => {
    const cmdPath = join(commandsDir, "cmd-001.md");
    await writeFile(cmdPath, JSON.stringify({
      type: "task.created",
      run_id: "run_001",
      task_id: "task-0001",
      actor: { kind: "user", id: "seunghwan" },
      payload: { title: "Test" },
    }));

    const event = await orchestrator.processCommand(cmdPath);
    expect(event.type).toBe("task.created");
    expect(event.event_id).toMatch(/^evt_/);
  });

  it("deletes command file after processing", async () => {
    const cmdPath = join(commandsDir, "cmd-002.md");
    await writeFile(cmdPath, JSON.stringify({
      type: "task.created",
      run_id: "run_002",
      task_id: "task-0002",
      actor: { kind: "user", id: "test" },
      payload: {},
    }));

    await orchestrator.processCommand(cmdPath);

    const exists = await access(cmdPath).then(() => true, () => false);
    expect(exists).toBe(false);
  });

  it("rejects invalid event type with command.rejected", async () => {
    const cmdPath = join(commandsDir, "cmd-003.md");
    await writeFile(cmdPath, JSON.stringify({
      type: "invalid.type",
      run_id: "run_003",
      actor: { kind: "user", id: "test" },
      payload: {},
    }));

    const event = await orchestrator.processCommand(cmdPath);
    expect(event.type).toBe("command.rejected");
    expect(event.payload.reason).toBe("invalid_event_type");
  });

  it("rejects duplicate commands via idempotency_key", async () => {
    const cmd = {
      type: "task.created",
      run_id: "run_004",
      task_id: "task-0004",
      actor: { kind: "user", id: "test" },
      payload: {},
      idempotency_key: "dedup-test-001",
    };

    const cmdPath1 = join(commandsDir, "cmd-004a.md");
    await writeFile(cmdPath1, JSON.stringify(cmd));
    const event1 = await orchestrator.processCommand(cmdPath1);
    expect(event1.type).toBe("task.created");

    const cmdPath2 = join(commandsDir, "cmd-004b.md");
    await writeFile(cmdPath2, JSON.stringify(cmd));
    const event2 = await orchestrator.processCommand(cmdPath2);
    expect(event2.type).toBe("command.rejected");
    expect(event2.payload.reason).toBe("duplicate");
  });

  it("applies redaction to secrets in payload (I-6)", async () => {
    const cmdPath = join(commandsDir, "cmd-005.md");
    await writeFile(cmdPath, JSON.stringify({
      type: "task.created",
      run_id: "run_005",
      task_id: "task-0005",
      actor: { kind: "user", id: "test" },
      payload: { config: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef" },
    }));

    const event = await orchestrator.processCommand(cmdPath);
    expect(event.payload.config).toContain("<REDACTED>");
    expect(event.redacted).toBe(true);
  });

  it("runs reducers after event append", async () => {
    const cmdPath = join(commandsDir, "cmd-006.md");
    await writeFile(cmdPath, JSON.stringify({
      type: "task.created",
      run_id: "run_006",
      task_id: "task-0006",
      actor: { kind: "user", id: "test" },
      payload: {},
    }));

    await orchestrator.processCommand(cmdPath);

    const taskFile = await readFile(join(tempDir, "tasks", "task-0006.md"), "utf-8");
    expect(taskFile).toContain("task-0006");
    expect(taskFile).toContain("draft");
  });

  it("handles malformed command file gracefully", async () => {
    const cmdPath = join(commandsDir, "cmd-007.md");
    await writeFile(cmdPath, "this is not valid json or frontmatter");

    const event = await orchestrator.processCommand(cmdPath);
    expect(event.type).toBe("command.rejected");
    expect(event.payload.reason).toBe("parse_error");

    const exists = await access(cmdPath).then(() => true, () => false);
    expect(exists).toBe(false);
  });
});
