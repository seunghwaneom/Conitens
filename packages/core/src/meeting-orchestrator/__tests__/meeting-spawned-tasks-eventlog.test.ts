/**
 * Tests for spawned_task EventLog persistence — Sub-AC 10c.
 *
 * Verifies that at least one meeting.task.spawned event is persisted to the
 * EventLog for every non-abandoned resolution, with full task provenance
 * (task_id, session_id, resolution_id, room_id) queryable via log replay.
 *
 * Test strategy:
 *   1. Drive the full protocol lifecycle through MeetingHttpServer HTTP endpoints.
 *   2. Replay the real (tmp-dir-backed) EventLog.
 *   3. Assert meeting.task.spawned events are present with the expected payload.
 *   4. Assert the causation_id chain: each task event's causation_id equals the
 *      resolution_id from the preceding meeting.resolved event.
 *
 * Sub-AC 10c acceptance criteria:
 *   - At least one spawned_task record is produced for non-abandoned outcomes.
 *   - Each spawned_task record is durably persisted to the EventLog.
 *   - spawned_task events have correct task_id, session_id, resolution_id.
 *   - spawned_task events are correlated to the meeting via correlation_id.
 *   - No tasks are spawned (or logged) for abandoned outcomes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { EventLog } from "../../event-log/event-log.js";
import { MeetingHttpServer } from "../meeting-http-server.js";

// ── Helpers ────────────────────────────────────────────────────────────────

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close((err) => { if (err) reject(err); else resolve(port); });
    });
    srv.on("error", reject);
  });
}

async function httpReq(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = `http://127.0.0.1:${port}${path}`;
  const resp = await fetch(url, {
    method,
    headers: body != null ? { "Content-Type": "application/json" } : {},
    body:    body != null ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => null);
  return { status: resp.status, data };
}

async function drainLog(log: EventLog): Promise<Array<Record<string, unknown>>> {
  const events: Array<Record<string, unknown>> = [];
  for await (const ev of log.replay()) {
    events.push(ev as unknown as Record<string, unknown>);
  }
  return events;
}

/**
 * Drive a full lifecycle: convene → deliberate → (add decisions) → resolve.
 * Returns the sessionId and the resolution data from the response.
 */
async function fullLifecycle(
  port: number,
  options: {
    roomId?: string;
    participantIds?: string[];
    outcome?: string;
    spawnTasks?: Array<{ title?: string; description?: string; assigned_to?: string; priority?: number }>;
  } = {},
): Promise<{ sessionId: string; resolution: Record<string, unknown>; spawnedTasks: unknown[] }> {
  const roomId        = options.roomId        ?? "board-room";
  const participantIds = options.participantIds ?? ["manager-default", "implementer-subagent"];
  const outcome       = options.outcome       ?? "accepted";

  // 1. Convene
  const { data: conveneData } = await httpReq(port, "POST", "/api/convene", {
    roomId,
    topic:          "Test Meeting",
    participantIds,
    requestedBy:    "manager-default",
  });
  const sessionId = ((conveneData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

  // 2. Deliberate
  await httpReq(port, "POST", `/api/sessions/${sessionId}/deliberate`, {
    initiated_by: "manager-default",
  });

  // 3. Add a decision
  await httpReq(port, "POST", `/api/sessions/${sessionId}/decisions`, {
    content:       "Proceed with the plan",
    decided_by:    "manager-default",
    decision_type: "accept",
  });

  // 4. Resolve (with optional explicit task specs)
  const resolveBody: Record<string, unknown> = {
    outcome,
    summary:     `Test resolution with outcome: ${outcome}`,
    resolved_by: "manager-default",
  };
  if (options.spawnTasks) {
    resolveBody["spawn_tasks"] = options.spawnTasks;
  }

  const { status, data: resolveData } = await httpReq(port, "POST", `/api/sessions/${sessionId}/resolve`, resolveBody);
  expect(status).toBe(200);

  const rd = resolveData as Record<string, unknown>;
  return {
    sessionId,
    resolution: rd["resolution"] as Record<string, unknown>,
    spawnedTasks: rd["spawned_tasks"] as unknown[],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("spawned_task EventLog persistence (Sub-AC 10c)", () => {
  let server: MeetingHttpServer;
  let port: number;
  let eventLog: EventLog;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "mtg-tasks-eventlog-test-"));
    eventLog  = new EventLog(dir);
    port      = await getFreePort();
    server    = new MeetingHttpServer({ port, eventLog, eventLogRunId: "test-orchestrator" });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  // ── Core: at least one task is persisted to EventLog ─────────────────────

  it("meeting.task.spawned event is persisted to EventLog after resolution", async () => {
    const { sessionId, resolution } = await fullLifecycle(port);
    const resolutionId = resolution["resolution_id"] as string;

    // Allow async logger to flush
    await new Promise((r) => setTimeout(r, 80));

    const events = await drainLog(eventLog);
    const taskEvents = events.filter((e) => e["type"] === "meeting.task.spawned");

    expect(taskEvents.length).toBeGreaterThanOrEqual(1);

    const taskEv = taskEvents.find(
      (e) => (e["payload"] as Record<string, unknown>)["session_id"] === sessionId,
    );
    expect(taskEv).toBeDefined();

    const p = taskEv!["payload"] as Record<string, unknown>;
    expect(typeof p["task_id"]).toBe("string");
    expect(p["task_id"]).toMatch(/^task-/);
    expect(p["session_id"]).toBe(sessionId);
    expect(p["resolution_id"]).toBe(resolutionId);
    expect(typeof p["title"]).toBe("string");
    expect(typeof p["description"]).toBe("string");
    expect(typeof p["assigned_to"]).toBe("string");
    expect(typeof p["priority"]).toBe("number");
    expect(p["status"]).toBe("pending");
    expect(typeof p["spawned_at"]).toBe("string");
  });

  it("meeting.task.spawned event has correct room_id", async () => {
    const { sessionId } = await fullLifecycle(port, { roomId: "ops-room" });

    await new Promise((r) => setTimeout(r, 80));

    const events = await drainLog(eventLog);
    const taskEv = events.find(
      (e) =>
        e["type"] === "meeting.task.spawned" &&
        (e["payload"] as Record<string, unknown>)["session_id"] === sessionId,
    );
    expect(taskEv).toBeDefined();
    expect((taskEv!["payload"] as Record<string, unknown>)["room_id"]).toBe("ops-room");
  });

  // ── Causation chain: task.causation_id = resolution_id ───────────────────

  it("meeting.task.spawned has causation_id equal to the resolution_id", async () => {
    const { sessionId, resolution } = await fullLifecycle(port);
    const resolutionId = resolution["resolution_id"] as string;

    await new Promise((r) => setTimeout(r, 80));

    const events = await drainLog(eventLog);
    const taskEv = events.find(
      (e) =>
        e["type"] === "meeting.task.spawned" &&
        (e["payload"] as Record<string, unknown>)["session_id"] === sessionId,
    );
    expect(taskEv).toBeDefined();
    // causation_id links the task back to its resolution
    expect(taskEv!["causation_id"]).toBe(resolutionId);
  });

  // ── Correlation: task.correlation_id = session_id (meeting correlation) ──

  it("meeting.task.spawned shares correlation_id with meeting events", async () => {
    const { sessionId } = await fullLifecycle(port);

    await new Promise((r) => setTimeout(r, 80));

    const events = await drainLog(eventLog);
    const meetingEvents = events.filter(
      (e) => (e["payload"] as Record<string, unknown>)["session_id"] === sessionId ||
             (e["payload"] as Record<string, unknown>)["meeting_id"] === sessionId,
    );

    const taskEvents = events.filter(
      (e) =>
        e["type"] === "meeting.task.spawned" &&
        (e["payload"] as Record<string, unknown>)["session_id"] === sessionId,
    );
    expect(taskEvents.length).toBeGreaterThanOrEqual(1);

    // All task events share the session_id as correlation_id
    for (const taskEv of taskEvents) {
      expect(taskEv["correlation_id"]).toBe(sessionId);
    }

    // And the meeting events also share the same correlation_id
    const meetingStarted = meetingEvents.find((e) => e["type"] === "meeting.started");
    if (meetingStarted) {
      expect(meetingStarted["correlation_id"]).toBe(sessionId);
    }
  });

  // ── Multiple tasks are each individually persisted ───────────────────────

  it("all explicitly spawned tasks are individually persisted to EventLog", async () => {
    const { sessionId, spawnedTasks } = await fullLifecycle(port, {
      spawnTasks: [
        { title: "Task A", description: "First task", assigned_to: "implementer-subagent", priority: 2 },
        { title: "Task B", description: "Second task", assigned_to: "manager-default",     priority: 1 },
        { title: "Task C", description: "Third task",  assigned_to: "researcher-default",  priority: 3 },
      ],
    });

    expect(Array.isArray(spawnedTasks)).toBe(true);
    expect((spawnedTasks as unknown[]).length).toBe(3);

    await new Promise((r) => setTimeout(r, 100));

    const events = await drainLog(eventLog);
    const taskEvents = events.filter(
      (e) =>
        e["type"] === "meeting.task.spawned" &&
        (e["payload"] as Record<string, unknown>)["session_id"] === sessionId,
    );

    expect(taskEvents.length).toBe(3);

    const titles = taskEvents.map((e) => (e["payload"] as Record<string, unknown>)["title"]);
    expect(titles).toContain("Task A");
    expect(titles).toContain("Task B");
    expect(titles).toContain("Task C");
  });

  // ── Abandoned outcome: no tasks spawned or persisted ─────────────────────

  it("abandoned outcome produces no meeting.task.spawned events in EventLog", async () => {
    const { sessionId, spawnedTasks } = await fullLifecycle(port, { outcome: "abandoned" });

    // In-memory: no tasks for abandoned outcome
    expect((spawnedTasks as unknown[]).length).toBe(0);

    await new Promise((r) => setTimeout(r, 80));

    const events = await drainLog(eventLog);
    const taskEvents = events.filter(
      (e) =>
        e["type"] === "meeting.task.spawned" &&
        (e["payload"] as Record<string, unknown>)["session_id"] === sessionId,
    );

    // No task events in the log for abandoned outcome
    expect(taskEvents.length).toBe(0);
  });

  // ── All non-abandoned outcomes spawn at least one task ───────────────────

  it.each([
    "accepted",
    "rejected",
    "deferred",
    "modified",
  ] as const)("outcome=%s produces at least one meeting.task.spawned event in EventLog", async (outcome) => {
    const { sessionId, spawnedTasks } = await fullLifecycle(port, { outcome });

    // In-memory: at least one task for non-abandoned outcomes
    expect((spawnedTasks as unknown[]).length).toBeGreaterThanOrEqual(1);

    await new Promise((r) => setTimeout(r, 80));

    const events = await drainLog(eventLog);
    const taskEvents = events.filter(
      (e) =>
        e["type"] === "meeting.task.spawned" &&
        (e["payload"] as Record<string, unknown>)["session_id"] === sessionId,
    );

    expect(taskEvents.length).toBeGreaterThanOrEqual(1);
  });

  // ── Task run_id uses the orchestrator run_id ──────────────────────────────

  it("meeting.task.spawned events use the configured run_id", async () => {
    const { sessionId } = await fullLifecycle(port);

    await new Promise((r) => setTimeout(r, 80));

    const events = await drainLog(eventLog);
    const taskEv = events.find(
      (e) =>
        e["type"] === "meeting.task.spawned" &&
        (e["payload"] as Record<string, unknown>)["session_id"] === sessionId,
    );
    expect(taskEv).toBeDefined();
    expect(taskEv!["run_id"]).toBe("test-orchestrator");
  });

  // ── GET /api/sessions/:id/tasks returns task data ────────────────────────

  it("GET /api/sessions/:id/tasks returns the persisted spawned tasks", async () => {
    const { sessionId, spawnedTasks } = await fullLifecycle(port, {
      spawnTasks: [
        { title: "Follow-up Action", priority: 2 },
      ],
    });

    expect((spawnedTasks as unknown[]).length).toBe(1);

    const { status, data } = await httpReq(port, "GET", `/api/sessions/${sessionId}/tasks`);
    expect(status).toBe(200);

    const rd = data as Record<string, unknown>;
    expect(rd["count"]).toBe(1);
    const tasks = rd["tasks"] as Array<Record<string, unknown>>;
    expect(tasks[0]["title"]).toBe("Follow-up Action");
    expect(tasks[0]["priority"]).toBe(2);
    expect(tasks[0]["status"]).toBe("pending");
    expect(typeof tasks[0]["task_id"]).toBe("string");
  });

  // ── Full traceability: meeting_id → resolution_id → task_id in event log ─

  it("full provenance chain is traceable in EventLog: meeting.started → meeting.resolved → meeting.task.spawned", async () => {
    const { sessionId, resolution } = await fullLifecycle(port, { roomId: "provenance-test-room" });
    const resolutionId = resolution["resolution_id"] as string;

    await new Promise((r) => setTimeout(r, 100));

    const events = await drainLog(eventLog);

    // meeting.started
    const startedEv = events.find(
      (e) =>
        e["type"] === "meeting.started" &&
        (e["payload"] as Record<string, unknown>)["meeting_id"] === sessionId,
    );
    expect(startedEv).toBeDefined();

    // meeting.resolved
    const resolvedEv = events.find(
      (e) =>
        e["type"] === "meeting.resolved" &&
        (e["payload"] as Record<string, unknown>)["meeting_id"] === sessionId,
    );
    expect(resolvedEv).toBeDefined();
    expect((resolvedEv!["payload"] as Record<string, unknown>)["resolution_id"]).toBe(resolutionId);

    // meeting.task.spawned (at least one)
    const taskEv = events.find(
      (e) =>
        e["type"] === "meeting.task.spawned" &&
        (e["payload"] as Record<string, unknown>)["session_id"] === sessionId,
    );
    expect(taskEv).toBeDefined();

    const tp = taskEv!["payload"] as Record<string, unknown>;
    // Task links back to the resolution
    expect(tp["resolution_id"]).toBe(resolutionId);
    // Task's causation_id is the resolution_id (direct causal link)
    expect(taskEv!["causation_id"]).toBe(resolutionId);
    // All events share the session as correlation
    expect(startedEv!["correlation_id"]).toBe(sessionId);
    expect(resolvedEv!["correlation_id"]).toBe(sessionId);
    expect(taskEv!["correlation_id"]).toBe(sessionId);
  });
});

// ── Unit tests for MeetingEventLogger.logTaskSpawned ──────────────────────

describe("MeetingEventLogger.logTaskSpawned (unit)", () => {
  it("persists a meeting.task.spawned event with all required fields", async () => {
    const { EventLog: EL } = await import("../../event-log/event-log.js");
    const { MeetingEventLogger } = await import("../meeting-event-logger.js");
    const { mkdtemp: mktmp } = await import("node:fs/promises");
    const { join: pjoin } = await import("node:path");
    const { tmpdir: td } = await import("node:os");

    const dir = await mktmp(pjoin(td(), "mel-unit-task-test-"));
    const log = new EL(dir);
    const logger = new MeetingEventLogger(log, "unit-test-run");

    await logger.logTaskSpawned({
      task_id:       "task-abc123",
      session_id:    "mtg-session-1",
      resolution_id: "res-xyz789",
      room_id:       "ops-room",
      title:         "Implement feature X",
      description:   "Full implementation of feature X as agreed",
      assigned_to:   "implementer-subagent",
      priority:      2,
      status:        "pending",
      spawned_at:    "2026-03-25T10:00:00.000Z",
      metadata:      { outcome: "accepted", decision_count: 3 },
      causation_id:  "res-xyz789",
      correlation_id: "mtg-session-1",
    });

    const events: Array<Record<string, unknown>> = [];
    for await (const ev of log.replay()) {
      events.push(ev as unknown as Record<string, unknown>);
    }

    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev["type"]).toBe("meeting.task.spawned");
    expect(ev["run_id"]).toBe("unit-test-run");
    expect(ev["causation_id"]).toBe("res-xyz789");
    expect(ev["correlation_id"]).toBe("mtg-session-1");

    const p = ev["payload"] as Record<string, unknown>;
    expect(p["task_id"]).toBe("task-abc123");
    expect(p["session_id"]).toBe("mtg-session-1");
    expect(p["resolution_id"]).toBe("res-xyz789");
    expect(p["room_id"]).toBe("ops-room");
    expect(p["title"]).toBe("Implement feature X");
    expect(p["description"]).toBe("Full implementation of feature X as agreed");
    expect(p["assigned_to"]).toBe("implementer-subagent");
    expect(p["priority"]).toBe(2);
    expect(p["status"]).toBe("pending");
    expect(p["spawned_at"]).toBe("2026-03-25T10:00:00.000Z");
    expect((p["metadata"] as Record<string, unknown>)["outcome"]).toBe("accepted");
  });

  it("logTaskSpawned defaults correlation_id to session_id when not provided", async () => {
    const { EventLog: EL } = await import("../../event-log/event-log.js");
    const { MeetingEventLogger } = await import("../meeting-event-logger.js");
    const { mkdtemp: mktmp } = await import("node:fs/promises");
    const { join: pjoin } = await import("node:path");
    const { tmpdir: td } = await import("node:os");

    const dir = await mktmp(pjoin(td(), "mel-corr-test-"));
    const log = new EL(dir);
    const logger = new MeetingEventLogger(log, "run");

    await logger.logTaskSpawned({
      task_id:       "task-no-corr",
      session_id:    "mtg-session-corr",
      resolution_id: "res-corr",
      room_id:       "room",
      title:         "Test",
      description:   "Test",
      assigned_to:   "agent",
      priority:      3,
      status:        "pending",
      spawned_at:    new Date().toISOString(),
      // no correlation_id provided
    });

    const events: Array<Record<string, unknown>> = [];
    for await (const ev of log.replay()) {
      events.push(ev as unknown as Record<string, unknown>);
    }

    expect(events[0]["correlation_id"]).toBe("mtg-session-corr");
  });

  it("logTaskSpawned does not throw when EventLog write fails", async () => {
    const { EventLog: EL } = await import("../../event-log/event-log.js");
    const { MeetingEventLogger } = await import("../meeting-event-logger.js");

    const badLog = new EL("/nonexistent/path/that/cannot/exist");
    const logger = new MeetingEventLogger(badLog);

    await expect(
      logger.logTaskSpawned({
        task_id:       "task-fail",
        session_id:    "mtg-fail",
        resolution_id: "res-fail",
        room_id:       "room",
        title:         "Fail Task",
        description:   "This should not throw",
        assigned_to:   "agent",
        priority:      3,
        status:        "pending",
        spawned_at:    new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });
});
