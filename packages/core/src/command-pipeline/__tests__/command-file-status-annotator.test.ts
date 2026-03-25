/**
 * command-file-status-annotator.test.ts
 * Sub-AC 8.2 — Unit tests for the command file status annotator.
 *
 * Tests:
 *  1.  mapLifecycleStateToFileStatus — terminal states map correctly
 *  2.  mapLifecycleStateToFileStatus — non-terminal states return null
 *  3.  annotateCommandFileStatus — writes status field to JSON file
 *  4.  annotateCommandFileStatus — is idempotent for same status
 *  5.  annotateCommandFileStatus — updates status for all terminal values
 *  6.  annotateCommandFileStatus — returns false for non-existent file
 *  7.  annotateCommandFileStatus — returns false for empty file
 *  8.  annotateCommandFileStatus — returns false for malformed JSON
 *  9.  annotateCommandFileStatus — preserves other fields unchanged
 * 10.  annotateCommandFileFromLifecycle — skips non-terminal states
 * 11.  annotateCommandFileFromLifecycle — applies terminal states
 * 12.  annotateCommandFileFromLifecycle — end-to-end with full command envelope
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import {
  mapLifecycleStateToFileStatus,
  annotateCommandFileStatus,
  annotateCommandFileFromLifecycle,
  type AnnotatableCommandFileStatus,
} from "../command-file-status-annotator.js";
import type { CommandLifecycleState } from "../command-status-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "conitens-annotator-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeCommandJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: "1.0.1",
    command_id: "cmd_TEST_001",
    type: "agent.spawn",
    ts: "2026-03-25T12:00:00.000Z",
    run_id: "test-run",
    actor: { kind: "user", id: "gui" },
    status: "pending",
    payload: {
      agent_id: "researcher-1",
      persona: "researcher",
      room_id: "research-lab",
    },
    ...overrides,
  });
}

async function writeCommandFile(
  filename: string,
  content: string,
): Promise<string> {
  const filePath = join(tmpDir, filename);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

async function readCommandJson(filePath: string): Promise<Record<string, unknown>> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. mapLifecycleStateToFileStatus — terminal states
// ─────────────────────────────────────────────────────────────────────────────

describe("mapLifecycleStateToFileStatus() — terminal states", () => {
  it("maps 'completed' lifecycle state to 'completed' file status", () => {
    expect(mapLifecycleStateToFileStatus("completed")).toBe("completed");
  });

  it("maps 'failed' lifecycle state to 'failed' file status", () => {
    expect(mapLifecycleStateToFileStatus("failed")).toBe("failed");
  });

  it("maps 'rejected' lifecycle state to 'rejected' file status", () => {
    expect(mapLifecycleStateToFileStatus("rejected")).toBe("rejected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. mapLifecycleStateToFileStatus — non-terminal states return null
// ─────────────────────────────────────────────────────────────────────────────

describe("mapLifecycleStateToFileStatus() — non-terminal states return null", () => {
  const nonTerminal: CommandLifecycleState[] = ["pending", "accepted", "executing"];

  for (const state of nonTerminal) {
    it(`returns null for '${state}' (non-terminal state)`, () => {
      expect(mapLifecycleStateToFileStatus(state)).toBeNull();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. annotateCommandFileStatus — writes status field
// ─────────────────────────────────────────────────────────────────────────────

describe("annotateCommandFileStatus() — writes status field", () => {
  it("updates status from 'pending' to 'completed'", async () => {
    const filePath = await writeCommandFile("cmd_001.json", makeCommandJson());

    const result = await annotateCommandFileStatus(filePath, "completed");

    expect(result).toBe(true);
    const data = await readCommandJson(filePath);
    expect(data["status"]).toBe("completed");
  });

  it("updates status from 'pending' to 'failed'", async () => {
    const filePath = await writeCommandFile("cmd_002.json", makeCommandJson());

    const result = await annotateCommandFileStatus(filePath, "failed");

    expect(result).toBe(true);
    const data = await readCommandJson(filePath);
    expect(data["status"]).toBe("failed");
  });

  it("updates status from 'pending' to 'rejected'", async () => {
    const filePath = await writeCommandFile("cmd_003.json", makeCommandJson());

    const result = await annotateCommandFileStatus(filePath, "rejected");

    expect(result).toBe(true);
    const data = await readCommandJson(filePath);
    expect(data["status"]).toBe("rejected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. annotateCommandFileStatus — idempotent
// ─────────────────────────────────────────────────────────────────────────────

describe("annotateCommandFileStatus() — idempotent", () => {
  it("returns true if status is already set to the target value", async () => {
    const filePath = await writeCommandFile(
      "cmd_idem.json",
      makeCommandJson({ status: "completed" }),
    );

    const result = await annotateCommandFileStatus(filePath, "completed");

    expect(result).toBe(true);
    const data = await readCommandJson(filePath);
    expect(data["status"]).toBe("completed"); // unchanged
  });

  it("calling annotate twice with same status produces same result", async () => {
    const filePath = await writeCommandFile("cmd_idem2.json", makeCommandJson());

    await annotateCommandFileStatus(filePath, "completed");
    const result = await annotateCommandFileStatus(filePath, "completed");

    expect(result).toBe(true);
    const data = await readCommandJson(filePath);
    expect(data["status"]).toBe("completed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. annotateCommandFileStatus — all terminal values
// ─────────────────────────────────────────────────────────────────────────────

describe("annotateCommandFileStatus() — all terminal status values", () => {
  const terminalStatuses: AnnotatableCommandFileStatus[] = [
    "completed",
    "failed",
    "rejected",
  ];

  for (const status of terminalStatuses) {
    it(`successfully annotates with status '${status}'`, async () => {
      const filePath = await writeCommandFile(
        `cmd_term_${status}.json`,
        makeCommandJson(),
      );

      const result = await annotateCommandFileStatus(filePath, status);

      expect(result).toBe(true);
      const data = await readCommandJson(filePath);
      expect(data["status"]).toBe(status);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. annotateCommandFileStatus — non-existent file
// ─────────────────────────────────────────────────────────────────────────────

describe("annotateCommandFileStatus() — error handling", () => {
  it("returns false for a non-existent file", async () => {
    const nonExistent = join(tmpDir, "does_not_exist.json");

    const result = await annotateCommandFileStatus(nonExistent, "completed");

    expect(result).toBe(false);
  });

  it("returns false for an empty file", async () => {
    const filePath = await writeCommandFile("cmd_empty.json", "");

    const result = await annotateCommandFileStatus(filePath, "completed");

    expect(result).toBe(false);
  });

  it("returns false for malformed JSON", async () => {
    const filePath = await writeCommandFile(
      "cmd_malformed.json",
      '{ "command_id": "bad", "type": INVALID }',
    );

    const result = await annotateCommandFileStatus(filePath, "completed");

    expect(result).toBe(false);
  });

  it("does not throw for any error condition", async () => {
    // Should never throw — always returns boolean
    const nonExistent = join(tmpDir, "no-such-file.json");
    await expect(
      annotateCommandFileStatus(nonExistent, "failed"),
    ).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. annotateCommandFileStatus — preserves other fields
// ─────────────────────────────────────────────────────────────────────────────

describe("annotateCommandFileStatus() — preserves all other fields", () => {
  it("preserves command_id, type, payload, actor, ts, run_id", async () => {
    const originalData = {
      schema: "1.0.1",
      command_id: "cmd_PRESERVE_001",
      type: "task.create",
      ts: "2026-03-25T10:00:00.000Z",
      run_id: "gui-session-xyz",
      actor: { kind: "user", id: "alice" },
      status: "pending",
      payload: { task_id: "task-123", title: "Important task" },
      idempotency_key: "cmd_PRESERVE_001",
      causation_id: "evt_CAUSE_001",
    };

    const filePath = await writeCommandFile(
      "cmd_preserve.json",
      JSON.stringify(originalData),
    );

    await annotateCommandFileStatus(filePath, "completed");

    const data = await readCommandJson(filePath);

    // Status should be updated
    expect(data["status"]).toBe("completed");

    // All other fields should be preserved
    expect(data["command_id"]).toBe("cmd_PRESERVE_001");
    expect(data["type"]).toBe("task.create");
    expect(data["ts"]).toBe("2026-03-25T10:00:00.000Z");
    expect(data["run_id"]).toBe("gui-session-xyz");
    expect(data["idempotency_key"]).toBe("cmd_PRESERVE_001");
    expect(data["causation_id"]).toBe("evt_CAUSE_001");

    const actor = data["actor"] as Record<string, unknown>;
    expect(actor["kind"]).toBe("user");
    expect(actor["id"]).toBe("alice");

    const payload = data["payload"] as Record<string, unknown>;
    expect(payload["task_id"]).toBe("task-123");
    expect(payload["title"]).toBe("Important task");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. annotateCommandFileFromLifecycle — skips non-terminal states
// ─────────────────────────────────────────────────────────────────────────────

describe("annotateCommandFileFromLifecycle() — skips non-terminal states", () => {
  const nonTerminal: CommandLifecycleState[] = ["pending", "accepted", "executing"];

  for (const state of nonTerminal) {
    it(`returns false and does NOT modify file for '${state}'`, async () => {
      const filePath = await writeCommandFile(
        `cmd_nonterminal_${state}.json`,
        makeCommandJson(),
      );

      const result = await annotateCommandFileFromLifecycle(filePath, state);

      expect(result).toBe(false);

      // File status should remain "pending" (unchanged)
      const data = await readCommandJson(filePath);
      expect(data["status"]).toBe("pending");
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. annotateCommandFileFromLifecycle — applies terminal states
// ─────────────────────────────────────────────────────────────────────────────

describe("annotateCommandFileFromLifecycle() — applies terminal states", () => {
  it("applies 'completed' lifecycle state", async () => {
    const filePath = await writeCommandFile("cmd_lc_comp.json", makeCommandJson());

    const result = await annotateCommandFileFromLifecycle(filePath, "completed");

    expect(result).toBe(true);
    const data = await readCommandJson(filePath);
    expect(data["status"]).toBe("completed");
  });

  it("applies 'failed' lifecycle state", async () => {
    const filePath = await writeCommandFile("cmd_lc_fail.json", makeCommandJson());

    const result = await annotateCommandFileFromLifecycle(filePath, "failed");

    expect(result).toBe(true);
    const data = await readCommandJson(filePath);
    expect(data["status"]).toBe("failed");
  });

  it("applies 'rejected' lifecycle state", async () => {
    const filePath = await writeCommandFile("cmd_lc_rej.json", makeCommandJson());

    const result = await annotateCommandFileFromLifecycle(filePath, "rejected");

    expect(result).toBe(true);
    const data = await readCommandJson(filePath);
    expect(data["status"]).toBe("rejected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. annotateCommandFileFromLifecycle — end-to-end with full command envelope
// ─────────────────────────────────────────────────────────────────────────────

describe("annotateCommandFileFromLifecycle() — full command envelope roundtrip", () => {
  it("annotates a realistic agent.spawn command file with completed status", async () => {
    const commandEnvelope = {
      schema: "1.0.1",
      command_id: "cmd_E2E_SPAWN_001",
      type: "agent.spawn",
      ts: "2026-03-25T14:00:00.000Z",
      run_id: "gui-session-abc",
      actor: { kind: "user", id: "gui" },
      status: "pending",
      created_at_ms: 1742900400000,
      idempotency_key: "cmd_E2E_SPAWN_001",
      payload: {
        agent_id: "researcher-2",
        persona: "researcher",
        room_id: "research-lab",
        display_name: "Researcher-2",
      },
    };

    const archivePath = join(tmpDir, "2026-03-25T14-00-00-000_gui_cmd_E2E.json");
    await writeFile(archivePath, JSON.stringify(commandEnvelope, null, 2), "utf-8");

    const result = await annotateCommandFileFromLifecycle(archivePath, "completed");

    expect(result).toBe(true);

    const annotated = await readCommandJson(archivePath);
    expect(annotated["status"]).toBe("completed");

    // All original fields preserved
    expect(annotated["command_id"]).toBe("cmd_E2E_SPAWN_001");
    expect(annotated["type"]).toBe("agent.spawn");
    expect(annotated["run_id"]).toBe("gui-session-abc");
    expect(annotated["created_at_ms"]).toBe(1742900400000);

    const payload = annotated["payload"] as Record<string, unknown>;
    expect(payload["agent_id"]).toBe("researcher-2");
    expect(payload["persona"]).toBe("researcher");
  });

  it("annotates a task.create command file with failed status", async () => {
    const commandEnvelope = {
      schema: "1.0.1",
      command_id: "cmd_E2E_TASK_001",
      type: "task.create",
      ts: "2026-03-25T14:05:00.000Z",
      run_id: "gui-session-def",
      actor: { kind: "user", id: "gui" },
      status: "pending",
      payload: {
        task_id: "task-e2e-001",
        title: "Design new feature",
        priority: 2,
      },
    };

    const archivePath = join(tmpDir, "2026-03-25T14-05-00-000_gui_cmd_TASK.json");
    await writeFile(archivePath, JSON.stringify(commandEnvelope), "utf-8");

    await annotateCommandFileFromLifecycle(archivePath, "failed");

    const annotated = await readCommandJson(archivePath);
    expect(annotated["status"]).toBe("failed");
    expect(annotated["command_id"]).toBe("cmd_E2E_TASK_001");
  });

  it("annotates a command file with rejected status for schema violations", async () => {
    const commandEnvelope = {
      schema: "1.0.1",
      command_id: "cmd_E2E_REJ_001",
      type: "agent.spawn",
      ts: "2026-03-25T14:10:00.000Z",
      run_id: "gui-session-ghi",
      actor: { kind: "user", id: "gui" },
      status: "pending",
      payload: { agent_id: "r1" }, // intentionally minimal
    };

    const archivePath = join(tmpDir, "2026-03-25T14-10-00-000_gui_cmd_REJ.json");
    await writeFile(archivePath, JSON.stringify(commandEnvelope), "utf-8");

    await annotateCommandFileFromLifecycle(archivePath, "rejected");

    const annotated = await readCommandJson(archivePath);
    expect(annotated["status"]).toBe("rejected");
    expect(annotated["command_id"]).toBe("cmd_E2E_REJ_001");
  });
});
