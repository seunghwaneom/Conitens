/**
 * Unit tests for CommandStatusStore
 *
 * Sub-AC 8b: Validates lifecycle state tracking and persistence.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, readFile } from "node:fs/promises";

import {
  CommandStatusStore,
  canCommandTransition,
  TERMINAL_COMMAND_STATES,
  VALID_COMMAND_TRANSITIONS,
  type CommandLifecycleState,
} from "../command-status-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;
let conitensDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "conitens-status-store-test-"));
  conitensDir = join(tmpDir, ".conitens");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// State machine invariants
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandStatusStore — state machine", () => {
  it("TERMINAL_COMMAND_STATES contains completed, failed, rejected", () => {
    expect(TERMINAL_COMMAND_STATES.has("completed")).toBe(true);
    expect(TERMINAL_COMMAND_STATES.has("failed")).toBe(true);
    expect(TERMINAL_COMMAND_STATES.has("rejected")).toBe(true);
  });

  it("canCommandTransition: pending → accepted = valid", () => {
    expect(canCommandTransition("pending", "accepted")).toBe(true);
  });

  it("canCommandTransition: pending → rejected = valid", () => {
    expect(canCommandTransition("pending", "rejected")).toBe(true);
  });

  it("canCommandTransition: accepted → executing = valid", () => {
    expect(canCommandTransition("accepted", "executing")).toBe(true);
  });

  it("canCommandTransition: executing → completed = valid", () => {
    expect(canCommandTransition("executing", "completed")).toBe(true);
  });

  it("canCommandTransition: executing → failed = valid", () => {
    expect(canCommandTransition("executing", "failed")).toBe(true);
  });

  it("canCommandTransition: completed → anything = invalid", () => {
    for (const state of ["pending", "accepted", "executing", "failed", "rejected"] as CommandLifecycleState[]) {
      expect(canCommandTransition("completed", state)).toBe(false);
    }
  });

  it("canCommandTransition: failed → anything = invalid", () => {
    for (const state of ["pending", "accepted", "executing", "completed", "rejected"] as CommandLifecycleState[]) {
      expect(canCommandTransition("failed", state)).toBe(false);
    }
  });

  it("canCommandTransition: rejected → anything = invalid", () => {
    for (const state of ["pending", "accepted", "executing", "completed", "failed"] as CommandLifecycleState[]) {
      expect(canCommandTransition("rejected", state)).toBe(false);
    }
  });

  it("VALID_COMMAND_TRANSITIONS has entries for every lifecycle state", () => {
    const allStates: CommandLifecycleState[] = [
      "pending", "accepted", "executing", "completed", "failed", "rejected",
    ];
    for (const state of allStates) {
      expect(VALID_COMMAND_TRANSITIONS).toHaveProperty(state);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Store lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandStatusStore — lifecycle", () => {
  it("open() creates the runtime/command-status directory", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();
    const { access } = await import("node:fs/promises");
    await expect(
      access(join(conitensDir, "runtime", "command-status")),
    ).resolves.toBeUndefined();
    store.close();
  });

  it("isOpen is false before open() and true after", async () => {
    const store = new CommandStatusStore(conitensDir);
    expect(store.isOpen).toBe(false);
    await store.open();
    expect(store.isOpen).toBe(true);
    store.close();
    expect(store.isOpen).toBe(false);
  });

  it("open() is idempotent — calling twice does not throw", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();
    await store.open(); // Should be a no-op
    expect(store.isOpen).toBe(true);
    store.close();
  });

  it("starts empty before any transitions", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();
    expect(store.listAll()).toHaveLength(0);
    expect(store.size).toBe(0);
    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordTransition — basic
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandStatusStore — recordTransition", () => {
  it("records a pending transition and returns the record", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    const rec = await store.recordTransition("cmd_001", "pending", {
      command_type: "agent.spawn",
    });

    expect(rec).not.toBeNull();
    expect(rec!.command_id).toBe("cmd_001");
    expect(rec!.status).toBe("pending");
    expect(rec!.command_type).toBe("agent.spawn");
    expect(rec!.ts).toBeDefined();

    store.close();
  });

  it("advances through full lifecycle pending → accepted → executing → completed", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    await store.recordTransition("cmd_002", "pending");
    await store.recordTransition("cmd_002", "accepted");
    await store.recordTransition("cmd_002", "executing");
    const completed = await store.recordTransition("cmd_002", "completed", {
      event_id: "evt_XYZ",
    });

    expect(completed!.status).toBe("completed");
    expect(completed!.event_id).toBe("evt_XYZ");
    expect(completed!.duration_ms).toBeGreaterThanOrEqual(0);

    store.close();
  });

  it("rejects invalid transition and returns null without crashing", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await store.recordTransition("cmd_003", "completed"); // First is always allowed (no current state)
    const bad = await store.recordTransition("cmd_003", "pending"); // completed → pending is invalid

    expect(bad).toBeNull();

    stderrSpy.mockRestore();
    store.close();
  });

  it("logs a warning to stderr for invalid transitions", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    const stderrOutput: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((msg: unknown) => {
        stderrOutput.push(String(msg));
        return true;
      });

    await store.recordTransition("cmd_004", "completed");
    await store.recordTransition("cmd_004", "failed"); // invalid

    expect(stderrOutput.some((m) => m.includes("Invalid transition"))).toBe(true);

    stderrSpy.mockRestore();
    store.close();
  });

  it("returns null and logs warning when called before open()", async () => {
    const store = new CommandStatusStore(conitensDir);
    // NOT opened

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const rec = await store.recordTransition("cmd_005", "pending");
    expect(rec).toBeNull();

    stderrSpy.mockRestore();
  });

  it("includes duration_ms on terminal (completed / failed / rejected) transitions", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    await store.recordTransition("cmd_006", "pending");
    await store.recordTransition("cmd_006", "accepted");
    await store.recordTransition("cmd_006", "executing");
    const rec = await store.recordTransition("cmd_006", "failed", {
      error: "test error",
    });

    expect(rec!.duration_ms).toBeGreaterThanOrEqual(0);
    expect(rec!.error).toBe("test error");

    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Query API
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandStatusStore — query API", () => {
  it("getLatest() returns the most recent record", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    await store.recordTransition("cmd_007", "pending");
    await store.recordTransition("cmd_007", "accepted");

    const latest = store.getLatest("cmd_007");
    expect(latest!.status).toBe("accepted");

    store.close();
  });

  it("getLatest() returns undefined for unknown command_id", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    expect(store.getLatest("unknown_cmd")).toBeUndefined();

    store.close();
  });

  it("getHistory() returns all transitions in order", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    await store.recordTransition("cmd_008", "pending");
    await store.recordTransition("cmd_008", "accepted");
    await store.recordTransition("cmd_008", "executing");
    await store.recordTransition("cmd_008", "completed");

    const history = store.getHistory("cmd_008");
    expect(history).toHaveLength(4);
    expect(history.map((r) => r.status)).toEqual([
      "pending", "accepted", "executing", "completed",
    ]);

    store.close();
  });

  it("getHistory() returns empty array for unknown command_id", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();
    expect(store.getHistory("nope")).toEqual([]);
    store.close();
  });

  it("listAll() returns one record per command_id (latest)", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    await store.recordTransition("cmd_A", "pending");
    await store.recordTransition("cmd_B", "pending");
    await store.recordTransition("cmd_A", "accepted");

    const all = store.listAll();
    expect(all).toHaveLength(2);

    const cmdA = all.find((r) => r.command_id === "cmd_A");
    expect(cmdA!.status).toBe("accepted"); // Latest for cmd_A

    store.close();
  });

  it("listByState() filters by current state", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    await store.recordTransition("cmd_X1", "pending");
    await store.recordTransition("cmd_X2", "pending");
    await store.recordTransition("cmd_X1", "accepted"); // cmd_X1 advances

    const pending = store.listByState("pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.command_id).toBe("cmd_X2");

    const accepted = store.listByState("accepted");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.command_id).toBe("cmd_X1");

    store.close();
  });

  it("size reflects number of distinct command_ids", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    expect(store.size).toBe(0);
    await store.recordTransition("cmd_S1", "pending");
    expect(store.size).toBe(1);
    await store.recordTransition("cmd_S2", "pending");
    expect(store.size).toBe(2);
    await store.recordTransition("cmd_S1", "accepted"); // Same command, different state
    expect(store.size).toBe(2); // Still 2 distinct ids

    store.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Persistence — JSONL log
// ─────────────────────────────────────────────────────────────────────────────

describe("CommandStatusStore — JSONL persistence", () => {
  it("writes valid JSON lines to the status.jsonl file", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    await store.recordTransition("cmd_P1", "pending", {
      command_type: "task.create",
    });

    const content = await readFile(store.statusFilePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed["command_id"]).toBe("cmd_P1");
    expect(parsed["status"]).toBe("pending");
    expect(parsed["command_type"]).toBe("task.create");
    expect(typeof parsed["ts"]).toBe("string");

    store.close();
  });

  it("appends one line per transition", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    await store.recordTransition("cmd_P2", "pending");
    await store.recordTransition("cmd_P2", "accepted");
    await store.recordTransition("cmd_P2", "executing");
    await store.recordTransition("cmd_P2", "completed");

    const content = await readFile(store.statusFilePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(4);

    store.close();
  });

  it("hydrates in-memory state from existing JSONL on open()", async () => {
    // First store: write some records.
    const store1 = new CommandStatusStore(conitensDir);
    await store1.open();
    await store1.recordTransition("cmd_H1", "pending");
    await store1.recordTransition("cmd_H1", "accepted");
    await store1.recordTransition("cmd_H2", "pending");
    await store1.recordTransition("cmd_H2", "rejected", { error: "bad schema" });
    store1.close();

    // Second store: hydrate from disk.
    const store2 = new CommandStatusStore(conitensDir);
    await store2.open();

    expect(store2.size).toBe(2);
    expect(store2.getLatest("cmd_H1")!.status).toBe("accepted");
    expect(store2.getLatest("cmd_H2")!.status).toBe("rejected");
    expect(store2.getHistory("cmd_H1")).toHaveLength(2);

    store2.close();
  });

  it("clearMemory() clears in-memory state but not the JSONL file", async () => {
    const store = new CommandStatusStore(conitensDir);
    await store.open();

    await store.recordTransition("cmd_CM1", "pending");
    expect(store.size).toBe(1);

    store.clearMemory();
    expect(store.size).toBe(0);
    expect(store.listAll()).toHaveLength(0);

    // File should still exist and have the line.
    const content = await readFile(store.statusFilePath, "utf-8");
    expect(content.trim()).toBeTruthy();

    store.close();
  });

  it("skips malformed lines in JSONL without crashing", async () => {
    // Write a JSONL file with one valid and one malformed line.
    const statusDir = join(conitensDir, "runtime", "command-status");
    const { mkdir: mkdirFn, writeFile } = await import("node:fs/promises");
    await mkdirFn(statusDir, { recursive: true });
    const statusFile = join(statusDir, "status.jsonl");
    await writeFile(statusFile, '{"command_id":"cmd_GOOD","status":"pending","ts":"2026-01-01T00:00:00.000Z"}\n{not valid json}\n', "utf-8");

    const store = new CommandStatusStore(conitensDir);
    await store.open();

    expect(store.size).toBe(1);
    expect(store.getLatest("cmd_GOOD")!.status).toBe("pending");

    store.close();
  });
});
