/**
 * Integration tests for MeetingHttpServer.
 *
 * Sub-AC 10b: Agent collaboration session spawning.
 *
 * These tests start the HTTP server on a random port, make real HTTP requests,
 * and verify the session creation and retrieval endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MeetingHttpServer } from "../meeting-http-server.js";

// ── Test helpers ──────────────────────────────────────────────────────────

/** Find a free TCP port by binding to :0 and releasing immediately. */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

/** Simple fetch wrapper for our test server. */
async function req(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = `http://127.0.0.1:${port}${path}`;
  const options: RequestInit = {
    method,
    headers: body != null ? { "Content-Type": "application/json" } : {},
    body: body != null ? JSON.stringify(body) : undefined,
  };
  const resp = await fetch(url, options);
  const data = await resp.json().catch(() => null);
  return { status: resp.status, data };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("MeetingHttpServer", () => {
  let server: MeetingHttpServer;
  let port: number;

  beforeAll(async () => {
    port   = await getFreePort();
    server = new MeetingHttpServer({ port });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  // ── Health check ────────────────────────────────────────────────────────

  it("GET / returns health status", async () => {
    const { status, data } = await req(port, "GET", "/");
    expect(status).toBe(200);
    expect((data as Record<string, unknown>)["status"]).toBe("ok");
    expect((data as Record<string, unknown>)["service"]).toBe("meeting-orchestrator");
  });

  // ── POST /api/convene ───────────────────────────────────────────────────

  it("POST /api/convene creates a session with roles", async () => {
    const { status, data } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Test Meeting",
      agenda:         "Test agenda",
      participantIds: ["manager-default", "implementer-subagent"],
      requestedBy:    "user",
    });

    expect(status).toBe(201);
    const result = data as Record<string, unknown>;
    expect(result["success"]).toBe(true);

    const session = result["session"] as Record<string, unknown>;
    expect(session).toBeDefined();
    expect(session["session_id"]).toBeTruthy();
    expect(session["status"]).toBe("active");
    expect(session["room_id"]).toBe("ops-control");
    expect(session["title"]).toBe("Test Meeting");

    // Participants must have assigned roles
    const participants = session["participants"] as Array<Record<string, unknown>>;
    expect(participants).toHaveLength(2);
    const roles = participants.map((p) => p["assigned_role"]);
    expect(roles).toContain("facilitator");
    expect(roles).toContain("contributor");

    // Channel must be present
    const channel = session["channel"] as Record<string, unknown>;
    expect(channel["channel_id"]).toBeTruthy();
    expect(typeof channel["message_count"]).toBe("number");

    // Shared context
    const ctx = session["shared_context"] as Record<string, unknown>;
    expect(ctx["topic"]).toBe("Test Meeting");
    expect(ctx["agenda"]).toBe("Test agenda");
  });

  it("POST /api/convene returns 400 when roomId missing", async () => {
    const { status } = await req(port, "POST", "/api/convene", {
      topic:          "No room",
      participantIds: [],
      requestedBy:    "user",
    });
    expect(status).toBe(400);
  });

  it("POST /api/convene returns 400 when topic missing", async () => {
    const { status } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      participantIds: [],
      requestedBy:    "user",
    });
    expect(status).toBe(400);
  });

  it("POST /api/convene returns 400 when participantIds is not array", async () => {
    const { status } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Bad request",
      participantIds: "not-an-array",
      requestedBy:    "user",
    });
    expect(status).toBe(400);
  });

  // ── GET /api/sessions ───────────────────────────────────────────────────

  it("GET /api/sessions lists active sessions", async () => {
    // Create a session first
    await req(port, "POST", "/api/convene", {
      roomId:         "research-lab",
      topic:          "Research Sync",
      participantIds: ["researcher-subagent"],
      requestedBy:    "user",
    });

    const { status, data } = await req(port, "GET", "/api/sessions");
    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    expect(Array.isArray(result["sessions"])).toBe(true);
    expect((result["sessions"] as unknown[]).length).toBeGreaterThanOrEqual(1);
    expect(typeof result["count"]).toBe("number");
  });

  // ── GET /api/sessions/:id ───────────────────────────────────────────────

  it("GET /api/sessions/:id returns a specific session", async () => {
    // Create a session
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "impl-office",
      topic:          "Impl Review",
      participantIds: ["implementer-subagent"],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    const { status, data } = await req(port, "GET", `/api/sessions/${sessionId}`);
    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    const session = result["session"] as Record<string, unknown>;
    expect(session["session_id"]).toBe(sessionId);
    expect(session["room_id"]).toBe("impl-office");
  });

  it("GET /api/sessions/:id returns 404 for unknown ID", async () => {
    const { status } = await req(port, "GET", "/api/sessions/nonexistent-session");
    expect(status).toBe(404);
  });

  // ── POST /api/sessions/:id/messages ────────────────────────────────────

  it("POST /api/sessions/:id/messages posts a message", async () => {
    // Create a session
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Message Test",
      participantIds: ["manager-default", "implementer-subagent"],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    const { status, data } = await req(port, "POST", `/api/sessions/${sessionId}/messages`, {
      sender_id:    "manager-default",
      content:      "Starting the meeting",
      message_type: "text",
    });
    expect(status).toBe(201);
    const result = data as Record<string, unknown>;
    const msg = result["message"] as Record<string, unknown>;
    expect(msg["content"]).toBe("Starting the meeting");
    expect(msg["sender_id"]).toBe("manager-default");
    expect(msg["message_type"]).toBe("text");
  });

  it("POST /api/sessions/:id/messages returns 404 for unknown session", async () => {
    const { status } = await req(port, "POST", "/api/sessions/no-such-session/messages", {
      sender_id: "user",
      content:   "hello",
    });
    expect(status).toBe(404);
  });

  // ── DELETE /api/sessions/:id ────────────────────────────────────────────

  it("DELETE /api/sessions/:id ends a session", async () => {
    // Create a session
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "validation-office",
      topic:          "End Test",
      participantIds: ["validator-sentinel"],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    const { status, data } = await req(port, "DELETE", `/api/sessions/${sessionId}`, {
      ended_by: "user",
      outcome:  "completed",
    });
    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    const session = result["session"] as Record<string, unknown>;
    expect(session["status"]).toBe("ended");
    expect(session["ended_at"]).not.toBeNull();
  });

  // ── POST /events compatibility shim ────────────────────────────────────

  it("POST /events handles meeting.started event", async () => {
    const meetingId = `test-mtg-${Date.now()}`;
    const { status, data } = await req(port, "POST", "/events", {
      schema:   "1.0",
      event_id: "test-001",
      type:     "meeting.started",
      ts:       new Date().toISOString(),
      actor:    { kind: "user", id: "user" },
      payload: {
        meeting_id:      meetingId,
        room_id:         "research-lab",
        title:           "Event Shim Test",
        initiated_by:    "user",
        participant_ids: ["researcher-subagent"],
      },
    });
    expect(status).toBe(201);
    const result = data as Record<string, unknown>;
    expect(result["success"]).toBe(true);
    const session = result["session"] as Record<string, unknown>;
    expect(session["session_id"]).toBe(meetingId);
  });

  it("POST /events is idempotent for same meeting_id", async () => {
    const meetingId = `idem-mtg-${Date.now()}`;
    const body = {
      type:    "meeting.started",
      payload: {
        meeting_id:      meetingId,
        room_id:         "ops-control",
        title:           "Idempotency Test",
        initiated_by:    "user",
        participant_ids: [],
      },
    };

    const { status: s1 } = await req(port, "POST", "/events", body);
    const { status: s2 } = await req(port, "POST", "/events", body);

    expect(s1).toBe(201);
    expect(s2).toBe(200); // second call returns existing session
  });

  it("POST /events ignores non-meeting events (returns 200)", async () => {
    const { status } = await req(port, "POST", "/events", {
      type:    "task.created",
      payload: { task_id: "t-1" },
    });
    expect(status).toBe(200);
  });

  // ── POST /api/sessions/:id/deliberate ─────────────────────────────────────

  it("POST /api/sessions/:id/deliberate transitions to deliberate phase", async () => {
    // Create a session in request phase
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Deliberation Test",
      participantIds: ["manager-default"],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    // Transition to deliberate
    const { status, data } = await req(port, "POST", `/api/sessions/${sessionId}/deliberate`, {
      initiated_by: "manager-default",
      note:         "Let's begin deliberation.",
    });
    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    expect(result["success"]).toBe(true);
    const session = result["session"] as Record<string, unknown>;
    const protocol = session["protocol"] as Record<string, unknown>;
    expect(protocol["phase"]).toBe("deliberate");
  });

  it("POST /api/sessions/:id/deliberate returns 409 if already deliberating", async () => {
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Double Deliberate",
      participantIds: [],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    await req(port, "POST", `/api/sessions/${sessionId}/deliberate`, { initiated_by: "user" });
    const { status } = await req(port, "POST", `/api/sessions/${sessionId}/deliberate`, { initiated_by: "user" });
    expect(status).toBe(409);
  });

  it("POST /api/sessions/:id/deliberate returns 404 for unknown session", async () => {
    const { status } = await req(port, "POST", "/api/sessions/nonexistent/deliberate", {
      initiated_by: "user",
    });
    expect(status).toBe(404);
  });

  // ── POST /api/sessions/:id/decisions ──────────────────────────────────────

  it("POST /api/sessions/:id/decisions adds a decision", async () => {
    // Create and deliberate
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Decision Test",
      participantIds: ["manager-default"],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;
    await req(port, "POST", `/api/sessions/${sessionId}/deliberate`, { initiated_by: "manager-default" });

    const { status, data } = await req(port, "POST", `/api/sessions/${sessionId}/decisions`, {
      content:       "Use Redis for caching",
      decided_by:    "manager-default",
      decision_type: "accept",
      rationale:     "Existing infrastructure",
    });
    expect(status).toBe(201);
    const result = data as Record<string, unknown>;
    const decision = result["decision"] as Record<string, unknown>;
    expect(decision["decision_id"]).toMatch(/^dec-/);
    expect(decision["content"]).toBe("Use Redis for caching");
    expect(decision["decision_type"]).toBe("accept");

    const session = result["session"] as Record<string, unknown>;
    const protocol = session["protocol"] as Record<string, unknown>;
    const decisions = protocol["decisions"] as unknown[];
    expect(decisions).toHaveLength(1);
  });

  it("POST /api/sessions/:id/decisions returns 409 if not in deliberate phase", async () => {
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Wrong Phase Decision",
      participantIds: [],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;
    // Still in request phase — no beginDeliberation call

    const { status } = await req(port, "POST", `/api/sessions/${sessionId}/decisions`, {
      content:       "premature decision",
      decided_by:    "user",
      decision_type: "accept",
    });
    expect(status).toBe(409);
  });

  it("POST /api/sessions/:id/decisions returns 400 for missing content", async () => {
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Validation Test",
      participantIds: [],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;
    await req(port, "POST", `/api/sessions/${sessionId}/deliberate`, { initiated_by: "user" });

    const { status } = await req(port, "POST", `/api/sessions/${sessionId}/decisions`, {
      decided_by:    "user",
      decision_type: "accept",
      // content is missing
    });
    expect(status).toBe(400);
  });

  // ── POST /api/sessions/:id/resolve ────────────────────────────────────────

  it("POST /api/sessions/:id/resolve transitions to resolve phase", async () => {
    // Create, deliberate, add a decision, then resolve
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Resolve Test",
      participantIds: ["manager-default"],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;
    await req(port, "POST", `/api/sessions/${sessionId}/deliberate`, { initiated_by: "manager-default" });
    await req(port, "POST", `/api/sessions/${sessionId}/decisions`, {
      content:       "Approved",
      decided_by:    "manager-default",
      decision_type: "accept",
    });

    const { status, data } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "accepted",
      summary:     "Approved by team",
      resolved_by: "manager-default",
    });
    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    const resolution = result["resolution"] as Record<string, unknown>;
    expect(resolution["resolution_id"]).toMatch(/^res-/);
    expect(resolution["outcome"]).toBe("accepted");
    expect(resolution["resolved_by"]).toBe("manager-default");

    const resolutionDecisions = resolution["decisions"] as unknown[];
    expect(resolutionDecisions).toHaveLength(1);

    const session = result["session"] as Record<string, unknown>;
    const protocol = session["protocol"] as Record<string, unknown>;
    expect(protocol["phase"]).toBe("resolve");
    expect(protocol["resolution"]).not.toBeNull();
  });

  it("POST /api/sessions/:id/resolve returns 409 if in request phase (skip deliberate)", async () => {
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Skip Deliberate",
      participantIds: [],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    // Try to resolve without deliberating
    const { status } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "accepted",
      summary:     "Skipped deliberation",
      resolved_by: "user",
    });
    expect(status).toBe(409);
  });

  it("POST /api/sessions/:id/resolve returns 400 for invalid outcome", async () => {
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Bad Outcome",
      participantIds: [],
      requestedBy:    "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;
    await req(port, "POST", `/api/sessions/${sessionId}/deliberate`, { initiated_by: "user" });

    const { status } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "invalid-outcome",
      summary:     "Bad outcome",
      resolved_by: "user",
    });
    expect(status).toBe(400);
  });

  // ── Full protocol flow via HTTP ────────────────────────────────────────────

  it("full protocol flow: convene → deliberate → add decisions → resolve → end", async () => {
    // 1. Convene
    const { data: conveneData } = await req(port, "POST", "/api/convene", {
      roomId:         "ops-control",
      topic:          "Full Protocol Flow Test",
      agenda:         "Complete the full request→deliberate→resolve cycle",
      participantIds: ["manager-default", "implementer-subagent"],
      requestedBy:    "user",
    });
    const session0 = (conveneData as Record<string, unknown>)["session"] as Record<string, unknown>;
    const sessionId = session0["session_id"] as string;
    expect((session0["protocol"] as Record<string, unknown>)["phase"]).toBe("request");

    // 2. Begin deliberation
    const { data: deliberateData } = await req(port, "POST", `/api/sessions/${sessionId}/deliberate`, {
      initiated_by: "manager-default",
    });
    expect(((deliberateData as Record<string, unknown>)["session"] as Record<string, unknown>)["protocol"] as Record<string, unknown>)
      !== undefined;

    // 3. Add two decisions
    await req(port, "POST", `/api/sessions/${sessionId}/decisions`, {
      content:       "Adopt design pattern A",
      decided_by:    "manager-default",
      decision_type: "accept",
    });
    await req(port, "POST", `/api/sessions/${sessionId}/decisions`, {
      content:       "Defer refactor to Q3",
      decided_by:    "implementer-subagent",
      decision_type: "defer",
    });

    // 4. Verify decisions accumulated
    const { data: sessionData } = await req(port, "GET", `/api/sessions/${sessionId}`);
    const mid = (sessionData as Record<string, unknown>)["session"] as Record<string, unknown>;
    const midProto = mid["protocol"] as Record<string, unknown>;
    expect((midProto["decisions"] as unknown[]).length).toBe(2);

    // 5. Resolve
    const { data: resolveData } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "accepted",
      summary:     "Pattern A adopted; refactor deferred",
      resolved_by: "manager-default",
    });
    const resolveRes = (resolveData as Record<string, unknown>)["resolution"] as Record<string, unknown>;
    expect(resolveRes["outcome"]).toBe("accepted");
    expect((resolveRes["decisions"] as unknown[]).length).toBe(2);

    // 6. End
    const { data: endData } = await req(port, "DELETE", `/api/sessions/${sessionId}`, {
      ended_by: "user",
      outcome:  "completed",
    });
    const ended = (endData as Record<string, unknown>)["session"] as Record<string, unknown>;
    expect(ended["status"]).toBe("ended");
    // Protocol phase should still be "resolve" (not abandoned — was resolved before end)
    expect((ended["protocol"] as Record<string, unknown>)["phase"]).toBe("resolve");
  });

  // ── CORS pre-flight ─────────────────────────────────────────────────────

  it("OPTIONS /api/convene returns 204 with CORS headers", async () => {
    const url  = `http://127.0.0.1:${port}/api/convene`;
    const resp = await fetch(url, { method: "OPTIONS" });
    expect(resp.status).toBe(204);
    expect(resp.headers.get("access-control-allow-methods")).toBeTruthy();
  });

  // ── Sub-AC 10c: Spawned tasks at resolution ─────────────────────────────

  /**
   * Helper: create a session, advance to deliberate, add a decision, and return sessionId.
   */
  async function setupDeliberatingSession(topic: string, participantIds: string[]): Promise<string> {
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:      "conf-room-a",
      topic,
      participantIds,
      requestedBy: "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;
    await req(port, "POST", `/api/sessions/${sessionId}/deliberate`, { initiated_by: participantIds[0] ?? "user" });
    await req(port, "POST", `/api/sessions/${sessionId}/decisions`, {
      content:       "Proceed with plan",
      decided_by:    participantIds[0] ?? "user",
      decision_type: "accept",
    });
    return sessionId;
  }

  it("POST /api/sessions/:id/resolve returns spawned_tasks in response", async () => {
    const sessionId = await setupDeliberatingSession("Task Spawn HTTP Test", ["manager-default"]);

    const { status, data } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "accepted",
      summary:     "Plan approved",
      resolved_by: "manager-default",
    });

    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    const spawnedTasks = result["spawned_tasks"] as unknown[];
    expect(Array.isArray(spawnedTasks)).toBe(true);
    expect(spawnedTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("auto-spawned task has correct structure (task_id, session_id, resolution_id, title, etc.)", async () => {
    const sessionId = await setupDeliberatingSession("Structure Test", ["manager-default"]);

    const { data } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "accepted",
      summary:     "Structure verified",
      resolved_by: "manager-default",
    });

    const result = data as Record<string, unknown>;
    const spawnedTasks = result["spawned_tasks"] as Array<Record<string, unknown>>;
    const task = spawnedTasks[0];

    expect(task).toBeDefined();
    expect(typeof task["task_id"]).toBe("string");
    expect((task["task_id"] as string)).toMatch(/^task-/);
    expect(task["session_id"]).toBe(sessionId);
    expect(typeof task["resolution_id"]).toBe("string");
    expect(typeof task["title"]).toBe("string");
    expect(typeof task["description"]).toBe("string");
    expect(typeof task["assigned_to"]).toBe("string");
    expect(typeof task["priority"]).toBe("number");
    expect(task["status"]).toBe("pending");
    expect(typeof task["spawned_at"]).toBe("string");
    expect(task["metadata"]).toBeDefined();
  });

  it("auto-spawned task metadata includes room_id and outcome", async () => {
    const sessionId = await setupDeliberatingSession("Metadata Test", ["manager-default"]);

    const { data } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "modified",
      summary:     "Plan modified",
      resolved_by: "manager-default",
    });

    const result = data as Record<string, unknown>;
    const task = (result["spawned_tasks"] as Array<Record<string, unknown>>)[0];
    const metadata = task["metadata"] as Record<string, unknown>;

    expect(metadata["room_id"]).toBe("conf-room-a");
    expect(metadata["outcome"]).toBe("modified");
  });

  it("session handle in resolve response includes protocol.spawned_tasks", async () => {
    const sessionId = await setupDeliberatingSession("Handle Task Test", ["manager-default"]);

    const { data } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "accepted",
      summary:     "Approved",
      resolved_by: "manager-default",
    });

    const result = data as Record<string, unknown>;
    const session = result["session"] as Record<string, unknown>;
    const protocol = session["protocol"] as Record<string, unknown>;
    const protocolTasks = protocol["spawned_tasks"] as unknown[];

    expect(Array.isArray(protocolTasks)).toBe(true);
    expect(protocolTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("resolve with explicit spawn_tasks creates exact tasks specified", async () => {
    const sessionId = await setupDeliberatingSession("Custom Tasks Test", ["manager-default", "implementer-subagent"]);

    const { status, data } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "accepted",
      summary:     "Two tasks planned",
      resolved_by: "manager-default",
      spawn_tasks: [
        { title: "Task Alpha", description: "Do Alpha", assigned_to: "implementer-subagent", priority: 1 },
        { title: "Task Beta",  description: "Do Beta",  priority: 5 },
      ],
    });

    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    const spawnedTasks = result["spawned_tasks"] as Array<Record<string, unknown>>;
    expect(spawnedTasks.length).toBe(2);

    const alpha = spawnedTasks.find((t) => t["title"] === "Task Alpha");
    expect(alpha).toBeDefined();
    expect(alpha!["assigned_to"]).toBe("implementer-subagent");
    expect(alpha!["priority"]).toBe(1);

    const beta = spawnedTasks.find((t) => t["title"] === "Task Beta");
    expect(beta).toBeDefined();
    expect(beta!["priority"]).toBe(5);
  });

  it("resolve with 'abandoned' outcome produces NO spawned tasks", async () => {
    const sessionId = await setupDeliberatingSession("Abandoned Test", ["manager-default"]);

    const { status, data } = await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "abandoned",
      summary:     "Meeting abandoned",
      resolved_by: "manager-default",
    });

    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    const spawnedTasks = result["spawned_tasks"] as unknown[];
    expect(spawnedTasks.length).toBe(0);
  });

  it("GET /api/sessions/:id/tasks returns spawned tasks", async () => {
    const sessionId = await setupDeliberatingSession("Tasks Endpoint Test", ["manager-default"]);

    // Resolve first to spawn tasks
    await req(port, "POST", `/api/sessions/${sessionId}/resolve`, {
      outcome:     "accepted",
      summary:     "Resolved",
      resolved_by: "manager-default",
    });

    const { status, data } = await req(port, "GET", `/api/sessions/${sessionId}/tasks`);
    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    expect(Array.isArray(result["tasks"])).toBe(true);
    expect((result["tasks"] as unknown[]).length).toBeGreaterThanOrEqual(1);
    expect(typeof result["count"]).toBe("number");
  });

  it("GET /api/sessions/:id/tasks returns empty list before resolution", async () => {
    // Create a session but don't resolve it
    const { data: createData } = await req(port, "POST", "/api/convene", {
      roomId:      "conf-room-a",
      topic:       "Pre-Resolve Tasks",
      participantIds: [],
      requestedBy: "user",
    });
    const sessionId = ((createData as Record<string, unknown>)["session"] as Record<string, unknown>)["session_id"] as string;

    const { status, data } = await req(port, "GET", `/api/sessions/${sessionId}/tasks`);
    expect(status).toBe(200);
    const result = data as Record<string, unknown>;
    expect((result["tasks"] as unknown[]).length).toBe(0);
  });

  it("GET /api/sessions/:id/tasks returns 404 for unknown session", async () => {
    const { status } = await req(port, "GET", "/api/sessions/no-such-session/tasks");
    expect(status).toBe(404);
  });
});
