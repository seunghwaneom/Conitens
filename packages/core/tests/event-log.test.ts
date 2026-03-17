import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventLog } from "../src/event-log/event-log.js";
import { SCHEMA_VERSION } from "@conitens/protocol";
import type { ConitensEvent } from "@conitens/protocol";

describe("EventLog", () => {
  let tempDir: string;
  let eventsDir: string;
  let log: EventLog;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-test-"));
    eventsDir = join(tempDir, "events");
    log = new EventLog(eventsDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("append creates event with auto-generated id and ts", async () => {
    const event = await log.append({
      type: "system.started",
      run_id: "run_test",
      actor: { kind: "system", id: "orchestrator" },
      payload: { version: "0.1.0" },
    });

    expect(event.schema).toBe(SCHEMA_VERSION);
    expect(event.event_id).toMatch(/^evt_/);
    expect(event.ts).toBeTruthy();
    expect(event.type).toBe("system.started");
  });

  it("append → read roundtrip preserves event data", async () => {
    const appended = await log.append({
      type: "task.created",
      run_id: "run_001",
      task_id: "task-0001",
      actor: { kind: "user", id: "seunghwan" },
      payload: { title: "Implement login", priority: "high" },
    });

    const date = appended.ts.slice(0, 10);
    const events: ConitensEvent[] = [];
    for await (const e of log.read(date)) {
      events.push(e);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(appended);
  });

  it("multiple appends to same date file", async () => {
    const e1 = await log.append({
      type: "task.created",
      run_id: "run_001",
      actor: { kind: "user", id: "user1" },
      payload: {},
    });
    const e2 = await log.append({
      type: "task.assigned",
      run_id: "run_001",
      actor: { kind: "system", id: "orchestrator" },
      payload: { assignee: "claude" },
    });

    const date = e1.ts.slice(0, 10);
    const events: ConitensEvent[] = [];
    for await (const e of log.read(date)) {
      events.push(e);
    }

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("task.created");
    expect(events[1].type).toBe("task.assigned");
  });

  it("read returns empty for nonexistent date", async () => {
    const events: ConitensEvent[] = [];
    for await (const e of log.read("1999-01-01")) {
      events.push(e);
    }
    expect(events).toHaveLength(0);
  });

  it("replay streams all events in chronological order", async () => {
    await log.append({
      type: "system.started",
      run_id: "run_001",
      actor: { kind: "system", id: "orchestrator" },
      payload: {},
    });
    await log.append({
      type: "task.created",
      run_id: "run_001",
      actor: { kind: "user", id: "user1" },
      payload: {},
    });
    await log.append({
      type: "task.assigned",
      run_id: "run_001",
      actor: { kind: "system", id: "orchestrator" },
      payload: { assignee: "claude" },
    });

    const events: ConitensEvent[] = [];
    for await (const e of log.replay()) {
      events.push(e);
    }

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("system.started");
    expect(events[1].type).toBe("task.created");
    expect(events[2].type).toBe("task.assigned");
  });

  it("replay with fromDate filters earlier dates", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(eventsDir, { recursive: true });

    const oldEvent: ConitensEvent = {
      schema: SCHEMA_VERSION,
      event_id: "evt_old",
      type: "system.started",
      ts: "2026-01-01T00:00:00.000Z",
      run_id: "run_old",
      actor: { kind: "system", id: "orchestrator" },
      payload: {},
    };
    await writeFile(
      join(eventsDir, "2026-01-01.jsonl"),
      JSON.stringify(oldEvent) + "\n",
    );

    // Append a current event
    const current = await log.append({
      type: "task.created",
      run_id: "run_new",
      actor: { kind: "user", id: "user1" },
      payload: {},
    });

    const currentDate = current.ts.slice(0, 10);
    const events: ConitensEvent[] = [];
    for await (const e of log.replay(currentDate)) {
      events.push(e);
    }

    // Should only have the current event, not the old one
    expect(events.every((e) => e.ts.slice(0, 10) >= currentDate)).toBe(true);
  });

  it("rejects events with wrong schema version on read", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(eventsDir, { recursive: true });

    const badEvent = {
      schema: "conitens.event.v999",
      event_id: "evt_bad",
      type: "system.started",
      ts: "2026-03-17T00:00:00.000Z",
      run_id: "run_bad",
      actor: { kind: "system", id: "test" },
      payload: {},
    };
    await writeFile(
      join(eventsDir, "2026-03-17.jsonl"),
      JSON.stringify(badEvent) + "\n",
    );

    const events: ConitensEvent[] = [];
    await expect(async () => {
      for await (const e of log.read("2026-03-17")) {
        events.push(e);
      }
    }).rejects.toThrow("Schema version mismatch");
  });

  it("each event gets a unique event_id", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const e = await log.append({
        type: "agent.heartbeat",
        run_id: "run_001",
        actor: { kind: "agent", id: "claude" },
        payload: { cpu: i },
      });
      ids.add(e.event_id);
    }
    expect(ids.size).toBe(10);
  });
});
