/**
 * Integration tests for CommandPipelineReader
 *
 * Sub-AC 8b: Validates lifecycle state advancement and status persistence.
 *
 * Tests use real filesystem (tmpdir) and a mock Orchestrator to avoid
 * needing a real event log or reducers in CI.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { CommandPipelineReader } from "../command-pipeline-reader.js";
import type { Orchestrator } from "../../orchestrator/orchestrator.js";
import type { ConitensEvent } from "@conitens/protocol";
import { SCHEMA_VERSION } from "@conitens/protocol";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEvent(type = "agent.spawned"): ConitensEvent {
  return {
    schema: SCHEMA_VERSION,
    event_id: "evt_TEST_001",
    type: type as ConitensEvent["type"],
    ts: new Date().toISOString(),
    run_id: "test-run",
    actor: { kind: "user", id: "gui" },
    payload: {},
  };
}

function makeSpawnCommandJson(commandId = "cmd_SPAWN_001") {
  return JSON.stringify({
    schema: SCHEMA_VERSION,
    command_id: commandId,
    type: "agent.spawn",
    ts: new Date().toISOString(),
    run_id: "test-run",
    actor: { kind: "user", id: "gui" },
    payload: {
      agent_id: "researcher-2",
      persona: "researcher",
      room_id: "research-lab",
    },
  });
}

function makeTaskCommandJson(commandId = "cmd_TASK_001") {
  return JSON.stringify({
    schema: SCHEMA_VERSION,
    command_id: commandId,
    type: "task.create",
    ts: new Date().toISOString(),
    run_id: "test-run",
    actor: { kind: "user", id: "gui" },
    payload: {
      task_id: "task-001",
      title: "Test task",
    },
  });
}

function makeNavCommandJson(commandId = "cmd_NAV_001") {
  return JSON.stringify({
    schema: SCHEMA_VERSION,
    command_id: commandId,
    type: "nav.drill_down",
    ts: new Date().toISOString(),
    run_id: "test-run",
    actor: { kind: "user", id: "gui" },
    payload: { level: "room", target_id: "research-lab" },
  });
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Test setup
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;
let conitensDir: string;
let commandsDir: string;

let mockOrchestrator: {
  processCommandData: Mock;
  appendRejectionEvent: Mock;
};
let reader: CommandPipelineReader;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "conitens-pipeline-reader-test-"));
  conitensDir = join(tmpDir, ".conitens");
  commandsDir = join(conitensDir, "commands");
  await mkdir(commandsDir, { recursive: true });

  mockOrchestrator = {
    processCommandData: vi.fn().mockResolvedValue(makeEvent()),
    appendRejectionEvent: vi.fn().mockResolvedValue(makeEvent("command.rejected")),
  };

  reader = new CommandPipelineReader({
    conitensDir,
    orchestrator: mockOrchestrator as unknown as Orchestrator,
    debounceMs: 50,
    retryDelayMs: 20,
    maxReadRetries: 3,
    processExistingOnStart: false,
  });
});

afterEach(async () => {
  if (reader.running) {
    await reader.stop();
  }
  await rm(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandPipelineReader — lifecycle", () => {
  it("starts and stops without error", async () => {
    await reader.start();
    expect(reader.running).toBe(true);
    await reader.stop();
    expect(reader.running).toBe(false);
  });

  it("emits 'started' on start()", async () => {
    const spy = vi.fn();
    reader.on("started", spy);
    await reader.start();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("emits 'stopped' on stop()", async () => {
    const spy = vi.fn();
    reader.on("stopped", spy);
    await reader.start();
    await reader.stop();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("isOpen on statusStore after start()", async () => {
    await reader.start();
    expect(reader.statusStore.isOpen).toBe(true);
  });

  it("statusStore is closed after stop()", async () => {
    await reader.start();
    await reader.stop();
    expect(reader.statusStore.isOpen).toBe(false);
  });

  it("start() is idempotent", async () => {
    await reader.start();
    await reader.start(); // No-op
    expect(reader.running).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pending state detection
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandPipelineReader — pending state detection", () => {
  it("records 'pending' when a command file appears in inbox", async () => {
    await reader.start();

    const statusChangedEvents: unknown[] = [];
    reader.on("status-changed", (e) => statusChangedEvents.push(e));

    const cmdFile = join(commandsDir, "gui_cmd_pend_001.json");
    await writeFile(cmdFile, makeSpawnCommandJson("cmd_PENDING_001"), "utf-8");

    // Wait for pending watcher + debounce + processing
    await sleep(500);

    const record = reader.getCommandStatus("cmd_PENDING_001");
    // After full processing, the status should be in a terminal state.
    // But 'pending' should appear in history.
    const history = reader.getCommandHistory("cmd_PENDING_001");
    const states = history.map((r) => r.status);
    expect(states).toContain("pending");
  });

  it("records pending for pre-existing files when hydrateStatusOnStart is true", async () => {
    // Write file BEFORE starting reader
    const cmdFile = join(commandsDir, "gui_cmd_preexist.json");
    await writeFile(cmdFile, makeSpawnCommandJson("cmd_PREEXIST_001"), "utf-8");

    const preReader = new CommandPipelineReader({
      conitensDir,
      orchestrator: mockOrchestrator as unknown as Orchestrator,
      debounceMs: 50,
      retryDelayMs: 20,
      processExistingOnStart: true,
    });

    await preReader.start();
    await sleep(400);

    const history = preReader.getCommandHistory("cmd_PREEXIST_001");
    const states = history.map((r) => r.status);
    expect(states).toContain("pending");

    await preReader.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full lifecycle advancement
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandPipelineReader — lifecycle advancement", () => {
  it("advances command through pending → accepted → executing → completed", async () => {
    await reader.start();

    const cmdId = "cmd_FULL_LIFECYCLE";
    const cmdFile = join(commandsDir, "gui_cmd_full.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    // Wait for full processing (debounce + orchestrator)
    await sleep(600);

    const history = reader.getCommandHistory(cmdId);
    const states = history.map((r) => r.status);

    // The full lifecycle should have been traversed.
    expect(states).toContain("accepted");
    expect(states).toContain("executing");
    expect(states).toContain("completed");
  });

  it("final status is 'completed' after successful processing", async () => {
    await reader.start();

    const cmdId = "cmd_COMPLETED_001";
    const cmdFile = join(commandsDir, "gui_cmd_comp.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    const latest = reader.getCommandStatus(cmdId);
    expect(latest?.status).toBe("completed");
  });

  it("final status is 'failed' when orchestrator throws", async () => {
    mockOrchestrator.processCommandData.mockRejectedValueOnce(
      new Error("Orchestrator exploded"),
    );

    await reader.start();
    reader.on("failed", () => {}); // Prevent unhandled event warning

    const cmdId = "cmd_FAILED_001";
    const cmdFile = join(commandsDir, "gui_cmd_fail.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    const latest = reader.getCommandStatus(cmdId);
    // Should be 'failed' (recorded by proxy when processCommandData throws)
    expect(latest?.status).toBe("failed");
  });

  it("status transitions are stored in history in order", async () => {
    await reader.start();

    const cmdId = "cmd_ORDER_001";
    const cmdFile = join(commandsDir, "gui_cmd_order.json");
    await writeFile(cmdFile, makeTaskCommandJson(cmdId), "utf-8");

    await sleep(600);

    const history = reader.getCommandHistory(cmdId);
    const states = history.map((r) => r.status);

    // Verify forward progression (no backward transitions).
    const validOrder = ["pending", "accepted", "executing", "completed", "failed", "rejected"];
    for (let i = 0; i < states.length - 1; i++) {
      const curIdx = validOrder.indexOf(states[i]!);
      const nextIdx = validOrder.indexOf(states[i + 1]!);
      expect(nextIdx).toBeGreaterThan(curIdx);
    }
  });

  it("records command_type in status records", async () => {
    await reader.start();

    const cmdId = "cmd_TYPE_001";
    const cmdFile = join(commandsDir, "gui_cmd_type.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    const latest = reader.getCommandStatus(cmdId);
    // Command type should be recorded somewhere in history.
    const history = reader.getCommandHistory(cmdId);
    const withType = history.filter((r) => r.command_type);
    expect(withType.length).toBeGreaterThan(0);
    expect(withType.some((r) => r.command_type === "agent.spawn")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Status-changed events
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandPipelineReader — status-changed events", () => {
  it("emits 'status-changed' event for each lifecycle transition", async () => {
    await reader.start();

    const statusEvents: unknown[] = [];
    reader.on("status-changed", (e) => statusEvents.push(e));

    const cmdId = "cmd_STATUS_EVT_001";
    const cmdFile = join(commandsDir, "gui_cmd_status_evt.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    // Should have at least 3 status events: accepted, executing, completed
    expect(statusEvents.length).toBeGreaterThanOrEqual(3);
  });

  it("status-changed event has correct record.status and record.command_id", async () => {
    await reader.start();

    const completedEvents: Array<{ record: { status: string; command_id: string } }> = [];
    reader.on("status-changed", (e: { record: { status: string; command_id: string } }) => {
      if (e.record.status === "completed") {
        completedEvents.push(e);
      }
    });

    const cmdId = "cmd_STATUS_CMP_001";
    const cmdFile = join(commandsDir, "gui_cmd_status_cmp.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    expect(completedEvents.length).toBeGreaterThan(0);
    expect(completedEvents[0]!.record.command_id).toBe(cmdId);
  });

  it("status-changed event includes previousStatus", async () => {
    await reader.start();

    const transitions: Array<{ status: string; prev: unknown }> = [];
    reader.on(
      "status-changed",
      (e: { record: { status: string }; previousStatus?: string }) => {
        transitions.push({ status: e.record.status, prev: e.previousStatus });
      },
    );

    const cmdId = "cmd_PREV_STATUS_001";
    const cmdFile = join(commandsDir, "gui_cmd_prev_status.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    // Executing should have previousStatus = 'accepted'
    const execEvt = transitions.find((t) => t.status === "executing");
    if (execEvt) {
      expect(execEvt.prev).toBe("accepted");
    }

    // Completed should have previousStatus = 'executing'
    const compEvt = transitions.find((t) => t.status === "completed");
    if (compEvt) {
      expect(compEvt.prev).toBe("executing");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rejection handling
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandPipelineReader — rejection handling", () => {
  it("records 'rejected' for validation errors (invalid command file)", async () => {
    await reader.start();
    reader.on("failed", () => {}); // Suppress unhandled event

    const invalidCmd = JSON.stringify({
      schema: SCHEMA_VERSION,
      // Missing command_id
      type: "agent.spawn",
      ts: new Date().toISOString(),
      run_id: "test-run",
      actor: { kind: "user", id: "gui" },
      payload: { agent_id: "r2", persona: "researcher", room_id: "lab" },
    });

    const cmdFile = join(commandsDir, "gui_cmd_invalid.json");
    await writeFile(cmdFile, invalidCmd, "utf-8");

    await sleep(600);

    // Without a valid command_id, we can't track by id.
    // But the CommandWatcher should have emitted a failed event.
    // The appendRejectionEvent mock should have been called.
    expect(mockOrchestrator.appendRejectionEvent).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Forwarded CommandWatcher events
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandPipelineReader — forwarded events", () => {
  it("forwards 'processed' event from CommandWatcher", async () => {
    await reader.start();

    const processedSpy = vi.fn();
    reader.on("processed", processedSpy);

    const cmdFile = join(commandsDir, "gui_cmd_fwd_proc.json");
    await writeFile(cmdFile, makeSpawnCommandJson("cmd_FWD_PROC"), "utf-8");

    await sleep(600);

    expect(processedSpy).toHaveBeenCalledOnce();
  });

  it("forwards 'failed' event from CommandWatcher", async () => {
    mockOrchestrator.processCommandData.mockRejectedValueOnce(
      new Error("Forward test error"),
    );

    await reader.start();

    const failedSpy = vi.fn();
    reader.on("failed", failedSpy);

    const cmdFile = join(commandsDir, "gui_cmd_fwd_fail.json");
    await writeFile(cmdFile, makeSpawnCommandJson("cmd_FWD_FAIL"), "utf-8");

    await sleep(600);

    expect(failedSpy).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Status store persistence
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandPipelineReader — status store persistence", () => {
  it("status transitions are written to status.jsonl", async () => {
    await reader.start();

    const cmdId = "cmd_PERSIST_001";
    const cmdFile = join(commandsDir, "gui_cmd_persist.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    const content = await readFile(reader.statusStore.statusFilePath, "utf-8");
    expect(content.trim().length).toBeGreaterThan(0);

    const lines = content.trim().split("\n").filter(Boolean);
    const records = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(records.some((r) => r["command_id"] === cmdId)).toBe(true);
  });

  it("query methods work: listAllCommands, listCommandsByState, getCommandHistory", async () => {
    await reader.start();

    const cmdId = "cmd_QUERY_001";
    const cmdFile = join(commandsDir, "gui_cmd_query.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    const all = reader.listAllCommands();
    expect(all.some((r) => r.command_id === cmdId)).toBe(true);

    const history = reader.getCommandHistory(cmdId);
    expect(history.length).toBeGreaterThan(0);

    const completed = reader.listCommandsByState("completed");
    expect(completed.some((r) => r.command_id === cmdId)).toBe(true);
  });

  it("multiple commands are tracked independently", async () => {
    await reader.start();

    await writeFile(
      join(commandsDir, "gui_cmd_multi_1.json"),
      makeSpawnCommandJson("cmd_MULTI_1"),
      "utf-8",
    );
    await sleep(200); // Stagger to avoid file collision
    await writeFile(
      join(commandsDir, "gui_cmd_multi_2.json"),
      makeTaskCommandJson("cmd_MULTI_2"),
      "utf-8",
    );

    await sleep(800);

    const status1 = reader.getCommandStatus("cmd_MULTI_1");
    const status2 = reader.getCommandStatus("cmd_MULTI_2");

    expect(status1?.status).toBe("completed");
    expect(status2?.status).toBe("completed");

    // Histories should be independent.
    const hist1 = reader.getCommandHistory("cmd_MULTI_1");
    const hist2 = reader.getCommandHistory("cmd_MULTI_2");
    expect(hist1.every((r) => r.command_id === "cmd_MULTI_1")).toBe(true);
    expect(hist2.every((r) => r.command_id === "cmd_MULTI_2")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Archive file status annotation (Sub-AC 8.2)
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandPipelineReader — archive file status annotation (Sub-AC 8.2)", () => {
  it("annotates the archived command file with 'completed' status after successful processing", async () => {
    await reader.start();

    const cmdId = "cmd_ANNOTATE_COMP_001";
    const cmdFile = join(commandsDir, "gui_cmd_annotate_comp.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    // Command should be completed in the status store
    const latest = reader.getCommandStatus(cmdId);
    expect(latest?.status).toBe("completed");

    // The archive directory should contain the annotated file
    const archiveDir = join(commandsDir, "archive");
    const { readdir } = await import("node:fs/promises");
    const archiveEntries = await readdir(archiveDir).catch(() => []);
    const archiveFile = archiveEntries.find((f) =>
      f.endsWith(".json") && f.includes("gui_cmd_annotate_comp"),
    );
    expect(archiveFile).toBeDefined();

    if (archiveFile) {
      const content = await readFile(join(archiveDir, archiveFile), "utf-8");
      const data = JSON.parse(content) as Record<string, unknown>;
      // The archived command file status should be updated to 'completed'
      expect(data["status"]).toBe("completed");
      // command_id and other fields should be preserved
      expect(data["command_id"]).toBe(cmdId);
      expect(data["type"]).toBe("agent.spawn");
    }
  });

  it("annotates the archived command file with 'failed' status when orchestrator throws", async () => {
    mockOrchestrator.processCommandData.mockRejectedValueOnce(
      new Error("Intentional failure for annotation test"),
    );

    await reader.start();
    reader.on("failed", () => {}); // suppress unhandled event warning

    const cmdId = "cmd_ANNOTATE_FAIL_001";
    const cmdFile = join(commandsDir, "gui_cmd_annotate_fail.json");
    await writeFile(cmdFile, makeSpawnCommandJson(cmdId), "utf-8");

    await sleep(600);

    // Command should be failed in the status store
    const latest = reader.getCommandStatus(cmdId);
    expect(latest?.status).toBe("failed");

    // Check the archive file
    const archiveDir = join(commandsDir, "archive");
    const { readdir } = await import("node:fs/promises");
    const archiveEntries = await readdir(archiveDir).catch(() => []);
    const archiveFile = archiveEntries.find((f) =>
      f.endsWith(".json") && f.includes("gui_cmd_annotate_fail"),
    );
    expect(archiveFile).toBeDefined();

    if (archiveFile) {
      const content = await readFile(join(archiveDir, archiveFile), "utf-8");
      const data = JSON.parse(content) as Record<string, unknown>;
      // The archived command file status should be updated to 'failed'
      expect(data["status"]).toBe("failed");
      expect(data["command_id"]).toBe(cmdId);
    }
  });

  it("preserves all original command file fields after annotation", async () => {
    await reader.start();

    const cmdId = "cmd_ANNOTATE_PRESERVE_001";
    const cmdFile = join(commandsDir, "gui_cmd_annotate_preserve.json");
    await writeFile(cmdFile, makeTaskCommandJson(cmdId), "utf-8");

    await sleep(600);

    // Check the archive file for preservation of original fields
    const archiveDir = join(commandsDir, "archive");
    const { readdir } = await import("node:fs/promises");
    const archiveEntries = await readdir(archiveDir).catch(() => []);
    const archiveFile = archiveEntries.find((f) =>
      f.endsWith(".json") && f.includes("gui_cmd_annotate_preserve"),
    );

    if (archiveFile) {
      const content = await readFile(join(archiveDir, archiveFile), "utf-8");
      const data = JSON.parse(content) as Record<string, unknown>;

      // Status should be updated
      expect(data["status"]).toBe("completed");

      // Original fields should be preserved
      expect(data["command_id"]).toBe(cmdId);
      expect(data["type"]).toBe("task.create");
      expect(typeof data["ts"]).toBe("string");
      expect(data["run_id"]).toBe("test-run");

      // Payload should be intact
      const payload = data["payload"] as Record<string, unknown>;
      expect(payload["task_id"]).toBe("task-001");
      expect(payload["title"]).toBe("Test task");
    }
  });
});
