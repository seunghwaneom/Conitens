import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryReducer } from "../src/reducers/memory-reducer.js";
import { MemoryCuratorReducer } from "../src/reducers/memory-curator-reducer.js";
import { SCHEMA_VERSION } from "@conitens/protocol";
import type { ConitensEvent } from "@conitens/protocol";

let counter = 0;
function makeEvent(
  overrides: Partial<ConitensEvent> & { type: ConitensEvent["type"] }
): ConitensEvent {
  return {
    schema: SCHEMA_VERSION,
    event_id: `evt_mem_${++counter}`,
    ts: new Date().toISOString(),
    run_id: "run_test",
    actor: { kind: "agent", id: "claude" },
    payload: {},
    ...overrides,
  };
}

describe("MemoryReducer", () => {
  let tempDir: string;
  let reducer: MemoryReducer;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-memory-test-"));
    reducer = new MemoryReducer();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes memory.proposed.md on task.completed", async () => {
    await reducer.reduce(
      makeEvent({
        type: "task.completed",
        task_id: "task-0001",
        actor: { kind: "agent", id: "claude" },
      }),
      tempDir,
    );

    const content = await readFile(
      join(tempDir, "agents", "claude", "memory.proposed.md"),
      "utf-8",
    );
    expect(content).toContain("Proposed Memory: claude");
    expect(content).toContain("task.completed");
  });

  it("writes memory.proposed.md on message.received", async () => {
    await reducer.reduce(
      makeEvent({
        type: "message.received",
        actor: { kind: "agent", id: "codex" },
        payload: { body: "Here is the implementation" },
      }),
      tempDir,
    );

    const content = await readFile(
      join(tempDir, "agents", "codex", "memory.proposed.md"),
      "utf-8",
    );
    expect(content).toContain("codex");
    expect(content).toContain("message");
  });

  it("does NOT write memory.md (that is MemoryCuratorReducer)", async () => {
    await reducer.reduce(
      makeEvent({
        type: "task.completed",
        actor: { kind: "agent", id: "gemini" },
      }),
      tempDir,
    );

    const memoryExists = await access(
      join(tempDir, "agents", "gemini", "memory.md"),
    ).then(
      () => true,
      () => false,
    );
    expect(memoryExists).toBe(false);
  });

  it("accumulates multiple entries for the same agent", async () => {
    await reducer.reduce(
      makeEvent({
        type: "task.completed",
        task_id: "task-0001",
        actor: { kind: "agent", id: "claude" },
      }),
      tempDir,
    );
    await reducer.reduce(
      makeEvent({
        type: "message.sent",
        actor: { kind: "agent", id: "claude" },
        payload: { body: "Sent a follow-up" },
      }),
      tempDir,
    );

    const content = await readFile(
      join(tempDir, "agents", "claude", "memory.proposed.md"),
      "utf-8",
    );
    expect(content).toContain("task.completed");
    expect(content).toContain("message.sent");
  });

  it("reset clears in-memory state", async () => {
    await reducer.reduce(
      makeEvent({ type: "task.completed", actor: { kind: "agent", id: "claude" } }),
      tempDir,
    );
    reducer.reset();
    // After reset, a new write starts fresh — file gets overwritten with 0 entries
    await reducer.reduce(
      makeEvent({ type: "task.completed", actor: { kind: "agent", id: "claude" } }),
      tempDir,
    );
    const content = await readFile(
      join(tempDir, "agents", "claude", "memory.proposed.md"),
      "utf-8",
    );
    // Only one entry after reset
    const bulletCount = (content.match(/^- \*\*/gm) ?? []).length;
    expect(bulletCount).toBe(1);
  });
});

describe("MemoryCuratorReducer", () => {
  let tempDir: string;
  let reducer: MemoryCuratorReducer;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-curator-test-"));
    reducer = new MemoryCuratorReducer();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes memory.md ONLY on memory.update_approved", async () => {
    await reducer.reduce(
      makeEvent({
        type: "memory.update_approved",
        actor: { kind: "user", id: "seunghwan" },
        payload: {
          agent_id: "claude",
          content: "Learned: prefer TypeScript strict mode",
        },
      }),
      tempDir,
    );

    const content = await readFile(
      join(tempDir, "agents", "claude", "memory.md"),
      "utf-8",
    );
    expect(content).toContain("Memory: claude");
    expect(content).toContain("prefer TypeScript strict mode");
    expect(content).toContain("approved by seunghwan");
  });

  it("ignores non-approved events", async () => {
    await reducer.reduce(
      makeEvent({
        type: "memory.update_proposed" as ConitensEvent["type"],
        actor: { kind: "system", id: "system" },
        payload: { agent_id: "claude" },
      }),
      tempDir,
    );

    const exists = await access(
      join(tempDir, "agents", "claude", "memory.md"),
    ).then(
      () => true,
      () => false,
    );
    expect(exists).toBe(false);
  });

  it("accumulates multiple approved entries", async () => {
    await reducer.reduce(
      makeEvent({
        type: "memory.update_approved",
        actor: { kind: "user", id: "seunghwan" },
        payload: { agent_id: "claude", content: "First lesson" },
      }),
      tempDir,
    );
    await reducer.reduce(
      makeEvent({
        type: "memory.update_approved",
        actor: { kind: "user", id: "seunghwan" },
        payload: { agent_id: "claude", content: "Second lesson" },
      }),
      tempDir,
    );

    const content = await readFile(
      join(tempDir, "agents", "claude", "memory.md"),
      "utf-8",
    );
    expect(content).toContain("First lesson");
    expect(content).toContain("Second lesson");
  });

  it("skips event when agent_id is missing", async () => {
    // Should not throw, and should not create any file
    await reducer.reduce(
      makeEvent({
        type: "memory.update_approved",
        actor: { kind: "user", id: "seunghwan" },
        payload: { content: "No agent id" },
      }),
      tempDir,
    );

    const agentsDir = join(tempDir, "agents");
    const exists = await access(agentsDir).then(
      () => true,
      () => false,
    );
    expect(exists).toBe(false);
  });
});
