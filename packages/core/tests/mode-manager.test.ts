import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initConitens } from "../src/init/init.js";
import { ModeManager } from "../src/mode/mode-manager.js";
import { EventLog } from "../src/event-log/event-log.js";

describe("ModeManager", () => {
  let tempDir: string;
  let conitensDir: string;
  let manager: ModeManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-mode-test-"));
    conitensDir = join(tempDir, ".conitens");
    await initConitens({ rootDir: tempDir });
    manager = new ModeManager(conitensDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads default MODE.md config", async () => {
    const config = await manager.readMode();
    expect(config.currentMode).toBe("antigravity");
    expect(config.bindings.planner).toBe("claude");
    expect(config.bindings.implementer).toBe("codex");
    expect(config.bindings.reviewer).toBe("gemini");
    expect(config.bindings.validator).toBe("claude");
    expect(config.activeChannels).toContain("cli");
  });

  it("switches mode and emits events", async () => {
    const eventsDir = join(conitensDir, "events");
    const eventLog = new EventLog(eventsDir);

    await manager.switchMode(
      "gravity",
      { planner: "gemini", implementer: "claude", reviewer: "codex", validator: "gemini" },
      eventLog,
      "run_mode_test",
    );

    // Verify MODE.md was updated
    const newConfig = await manager.readMode();
    expect(newConfig.currentMode).toBe("gravity");
    expect(newConfig.bindings.planner).toBe("gemini");
    expect(newConfig.bindings.implementer).toBe("claude");

    // Verify events were emitted
    const date = new Date().toISOString().slice(0, 10);
    const events = [];
    for await (const e of eventLog.read(date)) {
      events.push(e);
    }
    expect(events.some(e => e.type === "mode.switch_requested")).toBe(true);
    expect(events.some(e => e.type === "mode.switch_completed")).toBe(true);
  });

  it("preserves active channels on mode switch", async () => {
    const eventsDir = join(conitensDir, "events");
    const eventLog = new EventLog(eventsDir);

    const before = await manager.readMode();
    const channels = before.activeChannels;

    await manager.switchMode(
      "test-mode",
      { planner: "a", implementer: "b", reviewer: "c", validator: "d" },
      eventLog,
      "run_test",
    );

    const after = await manager.readMode();
    expect(after.activeChannels).toEqual(channels);
  });
});
