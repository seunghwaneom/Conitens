/**
 * Integration tests — meeting lifecycle event logging via MeetingHttpServer.
 *
 * Sub-AC 10d: Verify that meeting.started, meeting.deliberation, and
 * meeting.resolved events are persisted to the EventLog when triggered
 * through the HTTP control-plane endpoints.
 *
 * Test strategy:
 *   1. Start MeetingHttpServer with a real (tmp-dir-backed) EventLog.
 *   2. Drive the full protocol lifecycle via HTTP requests.
 *   3. Replay the EventLog and assert the correct events were written.
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

// ── Tests ──────────────────────────────────────────────────────────────────

describe("MeetingHttpServer — lifecycle event logging (Sub-AC 10d)", () => {
  let server: MeetingHttpServer;
  let port: number;
  let eventLog: EventLog;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), "mtg-lifecycle-log-test-"));
    eventLog  = new EventLog(dir);
    port      = await getFreePort();
    server    = new MeetingHttpServer({ port, eventLog, eventLogRunId: "test-orchestrator" });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("POST /api/convene persists meeting.started to the EventLog", async () => {
    const { status, data } = await httpReq(port, "POST", "/api/convene", {
      roomId:         "strategy-room",
      topic:          "Q2 Planning",
      agenda:         "Plan Q2 deliverables",
      participantIds: ["manager-default", "implementer-subagent"],
      requestedBy:    "user",
    });

    expect(status).toBe(201);
    const session = (data as Record<string, unknown>)["session"] as Record<string, unknown>;
    const sessionId = session["session_id"] as string;

    // Give the async logger a moment to flush (it uses void but is awaited internally)
    await new Promise((r) => setTimeout(r, 50));

    const events = await drainLog(eventLog);
    const startedEvents = events.filter((e) => e["type"] === "meeting.started");

    expect(startedEvents.length).toBeGreaterThanOrEqual(1);
    const startedEv = startedEvents.find(
      (e) => (e["payload"] as Record<string, unknown>)["meeting_id"] === sessionId,
    );
    expect(startedEv).toBeDefined();
    expect((startedEv!["payload"] as Record<string, unknown>)["room_id"]).toBe("strategy-room");
    expect((startedEv!["payload"] as Record<string, unknown>)["initiated_by"]).toBe("user");
    expect(startedEv!["run_id"]).toBe("test-orchestrator");
  });

  it("POST /api/sessions/:id/deliberate persists meeting.deliberation to the EventLog", async () => {
    // Create a fresh session
    const { data: conveneData } = await httpReq(port, "POST", "/api/convene", {
      roomId:         "ops-room",
      topic:          "Deliberation Test",
      participantIds: ["manager-default"],
      requestedBy:    "manager-default",
    });
    const sid = ((conveneData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    // Trigger deliberation
    const { status } = await httpReq(port, "POST", `/api/sessions/${sid}/deliberate`, {
      initiated_by: "manager-default",
      note:         "Ready to deliberate",
    });
    expect(status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const events = await drainLog(eventLog);
    const deliberationEvents = events.filter((e) => e["type"] === "meeting.deliberation");

    expect(deliberationEvents.length).toBeGreaterThanOrEqual(1);
    const delib = deliberationEvents.find(
      (e) => (e["payload"] as Record<string, unknown>)["meeting_id"] === sid,
    );
    expect(delib).toBeDefined();
    expect((delib!["payload"] as Record<string, unknown>)["room_id"]).toBe("ops-room");
    expect((delib!["payload"] as Record<string, unknown>)["initiated_by"]).toBe("manager-default");
    expect((delib!["payload"] as Record<string, unknown>)["note"]).toBe("Ready to deliberate");
  });

  it("POST /api/sessions/:id/resolve persists meeting.resolved to the EventLog", async () => {
    // Create a session and advance to deliberate
    const { data: conveneData } = await httpReq(port, "POST", "/api/convene", {
      roomId:         "board-room",
      topic:          "Resolution Test",
      participantIds: ["manager-default", "validator-default"],
      requestedBy:    "manager-default",
    });
    const sid = ((conveneData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    await httpReq(port, "POST", `/api/sessions/${sid}/deliberate`, {
      initiated_by: "manager-default",
    });

    // Add a decision
    await httpReq(port, "POST", `/api/sessions/${sid}/decisions`, {
      content:       "Approved the proposal",
      decided_by:    "manager-default",
      decision_type: "accept",
    });

    // Resolve
    const { status } = await httpReq(port, "POST", `/api/sessions/${sid}/resolve`, {
      outcome:     "accepted",
      summary:     "Proposal approved unanimously",
      resolved_by: "manager-default",
    });
    expect(status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const events = await drainLog(eventLog);
    const resolvedEvents = events.filter((e) => e["type"] === "meeting.resolved");

    expect(resolvedEvents.length).toBeGreaterThanOrEqual(1);
    const resolved = resolvedEvents.find(
      (e) => (e["payload"] as Record<string, unknown>)["meeting_id"] === sid,
    );
    expect(resolved).toBeDefined();
    const p = resolved!["payload"] as Record<string, unknown>;
    expect(p["room_id"]).toBe("board-room");
    expect(p["outcome"]).toBe("accepted");
    expect(p["summary"]).toBe("Proposal approved unanimously");
    expect(p["resolved_by"]).toBe("manager-default");
    expect(p["decision_count"]).toBe(1);
    expect(typeof p["task_count"]).toBe("number");
    expect(p["resolution_id"]).toBeTruthy();
  });

  it("full lifecycle: all three event types are queryable for the same meeting_id", async () => {
    const { data: conveneData } = await httpReq(port, "POST", "/api/convene", {
      roomId:         "full-lifecycle-room",
      topic:          "Full Lifecycle",
      agenda:         "Test all three phases",
      participantIds: ["manager-default", "researcher-default"],
      requestedBy:    "user",
    });
    const sid = ((conveneData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    await httpReq(port, "POST", `/api/sessions/${sid}/deliberate`, {
      initiated_by: "manager-default",
    });

    await httpReq(port, "POST", `/api/sessions/${sid}/decisions`, {
      content:       "Proceed with the plan",
      decided_by:    "manager-default",
      decision_type: "accept",
    });

    await httpReq(port, "POST", `/api/sessions/${sid}/resolve`, {
      outcome:     "accepted",
      summary:     "Full lifecycle complete",
      resolved_by: "manager-default",
    });

    await new Promise((r) => setTimeout(r, 80));

    const events = await drainLog(eventLog);
    const forMeeting = events.filter(
      (e) => (e["payload"] as Record<string, unknown>)["meeting_id"] === sid,
    );

    const types = forMeeting.map((e) => e["type"]);
    expect(types).toContain("meeting.started");
    expect(types).toContain("meeting.deliberation");
    expect(types).toContain("meeting.resolved");

    // All events correlate to the same meeting
    for (const ev of forMeeting) {
      expect(ev["correlation_id"]).toBe(sid);
    }
  });
});
