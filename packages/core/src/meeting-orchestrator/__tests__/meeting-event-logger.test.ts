/**
 * Tests for MeetingEventLogger — Sub-AC 10d
 *
 * Verifies that meeting.started, meeting.deliberation, and meeting.resolved
 * events are persisted to the EventLog at the correct protocol transitions
 * and are queryable via event log replay.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { EventLog } from "../../event-log/event-log.js";
import { MeetingEventLogger } from "../meeting-event-logger.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a temporary EventLog backed by a fresh temp directory. */
async function makeTmpLog(): Promise<{ log: EventLog; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "meeting-event-logger-test-"));
  const log = new EventLog(dir);
  return { log, dir };
}

/** Collect all events from the log via replay. */
async function drainLog(log: EventLog): Promise<Array<Record<string, unknown>>> {
  const events: Array<Record<string, unknown>> = [];
  for await (const ev of log.replay()) {
    events.push(ev as unknown as Record<string, unknown>);
  }
  return events;
}

// ── Unit tests for MeetingEventLogger ────────────────────────────────────

describe("MeetingEventLogger", () => {
  let log: EventLog;
  let dir: string;
  let logger: MeetingEventLogger;

  beforeEach(async () => {
    ({ log, dir } = await makeTmpLog());
    logger = new MeetingEventLogger(log, "test-run");
  });

  // cleanup temp dirs — best effort
  // (vitest afterEach is optional; the OS will reclaim the tmp files)

  // ── meeting.started ──────────────────────────────────────────────────────

  it("logStarted persists a meeting.started event to the event log", async () => {
    await logger.logStarted({
      meeting_id:      "mtg-001",
      room_id:         "ops-room",
      title:           "Kick-off",
      initiated_by:    "user",
      participant_ids: ["manager-default", "implementer-default"],
      agenda:          "Discuss project scope",
    });

    const events = await drainLog(log);
    expect(events).toHaveLength(1);

    const ev = events[0];
    expect(ev["type"]).toBe("meeting.started");
    expect((ev["payload"] as Record<string, unknown>)["meeting_id"]).toBe("mtg-001");
    expect((ev["payload"] as Record<string, unknown>)["room_id"]).toBe("ops-room");
    expect((ev["payload"] as Record<string, unknown>)["initiated_by"]).toBe("user");
    expect((ev["payload"] as Record<string, unknown>)["participant_ids"]).toEqual([
      "manager-default",
      "implementer-default",
    ]);
    expect((ev["payload"] as Record<string, unknown>)["title"]).toBe("Kick-off");
    expect((ev["payload"] as Record<string, unknown>)["agenda"]).toBe("Discuss project scope");
  });

  it("logStarted sets correlation_id to meeting_id when not provided", async () => {
    await logger.logStarted({
      meeting_id:      "mtg-002",
      room_id:         "research-room",
      initiated_by:    "researcher-default",
      participant_ids: [],
    });

    const events = await drainLog(log);
    expect(events[0]["correlation_id"]).toBe("mtg-002");
  });

  it("logStarted sets run_id to the constructor-provided runId", async () => {
    await logger.logStarted({
      meeting_id:      "mtg-003",
      room_id:         "any-room",
      initiated_by:    "user",
      participant_ids: [],
    });

    const events = await drainLog(log);
    expect(events[0]["run_id"]).toBe("test-run");
  });

  // ── meeting.deliberation ─────────────────────────────────────────────────

  it("logDeliberation persists a meeting.deliberation event", async () => {
    await logger.logDeliberation({
      meeting_id:   "mtg-010",
      room_id:      "board-room",
      initiated_by: "manager-default",
      request_id:   "req-abc123",
      note:         "Moving into deliberation",
    });

    const events = await drainLog(log);
    expect(events).toHaveLength(1);

    const ev = events[0];
    expect(ev["type"]).toBe("meeting.deliberation");
    expect((ev["payload"] as Record<string, unknown>)["meeting_id"]).toBe("mtg-010");
    expect((ev["payload"] as Record<string, unknown>)["room_id"]).toBe("board-room");
    expect((ev["payload"] as Record<string, unknown>)["initiated_by"]).toBe("manager-default");
    expect((ev["payload"] as Record<string, unknown>)["request_id"]).toBe("req-abc123");
    expect((ev["payload"] as Record<string, unknown>)["note"]).toBe("Moving into deliberation");
  });

  it("logDeliberation sets correlation_id to meeting_id by default", async () => {
    await logger.logDeliberation({
      meeting_id:   "mtg-011",
      room_id:      "any-room",
      initiated_by: "system",
    });

    const events = await drainLog(log);
    expect(events[0]["correlation_id"]).toBe("mtg-011");
  });

  // ── meeting.resolved ─────────────────────────────────────────────────────

  it("logResolved persists a meeting.resolved event", async () => {
    await logger.logResolved({
      meeting_id:     "mtg-020",
      room_id:        "main-hall",
      resolution_id:  "res-xyz789",
      outcome:        "accepted",
      summary:        "Agreed to proceed with implementation",
      resolved_by:    "manager-default",
      decision_count: 3,
      task_count:     2,
    });

    const events = await drainLog(log);
    expect(events).toHaveLength(1);

    const ev = events[0];
    expect(ev["type"]).toBe("meeting.resolved");
    const p = ev["payload"] as Record<string, unknown>;
    expect(p["meeting_id"]).toBe("mtg-020");
    expect(p["room_id"]).toBe("main-hall");
    expect(p["resolution_id"]).toBe("res-xyz789");
    expect(p["outcome"]).toBe("accepted");
    expect(p["summary"]).toBe("Agreed to proceed with implementation");
    expect(p["resolved_by"]).toBe("manager-default");
    expect(p["decision_count"]).toBe(3);
    expect(p["task_count"]).toBe(2);
  });

  it("logResolved supports all valid outcomes", async () => {
    const outcomes = ["accepted", "rejected", "deferred", "modified", "abandoned"] as const;

    for (const outcome of outcomes) {
      const { log: tmpLog } = await makeTmpLog();
      const l = new MeetingEventLogger(tmpLog, "test");
      await l.logResolved({
        meeting_id:     `mtg-${outcome}`,
        room_id:        "room",
        resolution_id:  "res-1",
        outcome,
        summary:        `Outcome: ${outcome}`,
        resolved_by:    "user",
        decision_count: 0,
        task_count:     0,
      });
      const evs = await drainLog(tmpLog);
      expect(evs[0]["type"]).toBe("meeting.resolved");
      expect((evs[0]["payload"] as Record<string, unknown>)["outcome"]).toBe(outcome);
    }
  });

  // ── Full lifecycle: started → deliberation → resolved ───────────────────

  it("full lifecycle emits all three events in order and all are queryable", async () => {
    const meetingId = "mtg-lifecycle-100";
    const roomId    = "strategy-room";

    // 1. Session starts
    await logger.logStarted({
      meeting_id:      meetingId,
      room_id:         roomId,
      title:           "Strategy Review",
      initiated_by:    "manager-default",
      participant_ids: ["manager-default", "researcher-default", "validator-default"],
      agenda:          "Review Q2 strategy and assign tasks",
    });

    // 2. Deliberation begins
    await logger.logDeliberation({
      meeting_id:   meetingId,
      room_id:      roomId,
      initiated_by: "manager-default",
      request_id:   "req-lifecycle-1",
      note:         "All participants ready to deliberate",
    });

    // 3. Resolution
    await logger.logResolved({
      meeting_id:     meetingId,
      room_id:        roomId,
      resolution_id:  "res-lifecycle-1",
      outcome:        "accepted",
      summary:        "Strategy accepted; 2 tasks created",
      resolved_by:    "manager-default",
      decision_count: 2,
      task_count:     2,
    });

    // Query all events
    const events = await drainLog(log);
    expect(events).toHaveLength(3);

    // Types in correct order
    expect(events[0]["type"]).toBe("meeting.started");
    expect(events[1]["type"]).toBe("meeting.deliberation");
    expect(events[2]["type"]).toBe("meeting.resolved");

    // All share the same meeting_id and correlation_id
    for (const ev of events) {
      expect((ev["payload"] as Record<string, unknown>)["meeting_id"]).toBe(meetingId);
      expect((ev["payload"] as Record<string, unknown>)["room_id"]).toBe(roomId);
      expect(ev["correlation_id"]).toBe(meetingId);
    }

    // Event IDs are unique
    const ids = events.map((e) => e["event_id"]);
    expect(new Set(ids).size).toBe(3);
  });

  // ── Filtering by event type via replay ───────────────────────────────────

  it("events can be filtered by type from a replayed log", async () => {
    const meetingId = "mtg-filter-200";

    await logger.logStarted({
      meeting_id:      meetingId,
      room_id:         "room-a",
      initiated_by:    "user",
      participant_ids: ["agent-1"],
    });
    await logger.logDeliberation({
      meeting_id:   meetingId,
      room_id:      "room-a",
      initiated_by: "agent-1",
    });
    await logger.logResolved({
      meeting_id:     meetingId,
      room_id:        "room-a",
      resolution_id:  "res-200",
      outcome:        "accepted",
      summary:        "Done",
      resolved_by:    "agent-1",
      decision_count: 1,
      task_count:     1,
    });

    const allEvents = await drainLog(log);
    const started       = allEvents.filter((e) => e["type"] === "meeting.started");
    const deliberations = allEvents.filter((e) => e["type"] === "meeting.deliberation");
    const resolved      = allEvents.filter((e) => e["type"] === "meeting.resolved");

    expect(started).toHaveLength(1);
    expect(deliberations).toHaveLength(1);
    expect(resolved).toHaveLength(1);
  });

  // ── Error resilience ─────────────────────────────────────────────────────

  it("logStarted does not throw when EventLog write fails", async () => {
    // Use a deliberately invalid path to trigger I/O failure
    const badLog = new EventLog("/nonexistent/path/that/cannot/exist");
    const badLogger = new MeetingEventLogger(badLog);

    // Should resolve without throwing
    await expect(
      badLogger.logStarted({
        meeting_id:      "mtg-fail",
        room_id:         "room",
        initiated_by:    "user",
        participant_ids: [],
      }),
    ).resolves.toBeUndefined();
  });
});
