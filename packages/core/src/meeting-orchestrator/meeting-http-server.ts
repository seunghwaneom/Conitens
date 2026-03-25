/**
 * meeting-http-server.ts — HTTP server for the meeting orchestration control plane.
 *
 * Sub-AC 10b: Agent collaboration session spawning.
 *
 * Runs on a dedicated port (default: 8081) separate from the WebSocket bus (8080).
 * Accepts HTTP requests from the command-center frontend and instantiates
 * CollaborationSession objects for each meeting convocation request.
 *
 * Endpoints:
 *
 *   POST /api/convene
 *     Receive a MeetingConveneRequest, spawn a CollaborationSession, return SessionHandle.
 *     This is the primary endpoint called by spatial-store.convokeMeeting().
 *
 *   POST /events
 *     Compatibility shim: receives ConitensEvents (e.g., meeting.started) forwarded
 *     from the command-center.  Delegates meeting.started events to /api/convene logic.
 *
 *   GET /api/sessions
 *     List all active session handles.
 *
 *   GET /api/sessions/:id
 *     Retrieve a specific session handle by meeting_id.
 *
 *   POST /api/sessions/:id/messages
 *     Post a message to a session's communication channel.
 *
 *   DELETE /api/sessions/:id
 *     End a session (transition to "ended").
 *
 * Security:
 *   - Binds to 127.0.0.1 only (never 0.0.0.0) — localhost-only as per project constraints.
 *   - CORS headers allow http://localhost:* only.
 *   - No secrets stored; session state is in-memory only.
 *   - Request body size capped at 64 KiB.
 *
 * Integration with WebSocketBus:
 *   Pass a WebSocketBus instance to broadcast meeting lifecycle events to
 *   all connected dashboard / command-center clients in real time.
 */

import { createServer, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  SessionHandle,
  BeginDeliberationInput,
  AddDecisionInput,
  ResolveProtocolInput,
  SpawnedTask,
  SpawnedTaskInput,
} from "./collaboration-session.js";
import {
  CollaborationSession,
  SessionRegistry,
  ProtocolTransitionError,
} from "./collaboration-session.js";
import type { EventLog } from "../event-log/event-log.js";
import { MeetingEventLogger } from "./meeting-event-logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default HTTP port for the meeting orchestration server. */
export const MEETING_HTTP_PORT = 8_081;

/** Maximum request body size (64 KiB). */
const MAX_BODY_BYTES = 64 * 1_024;

// ---------------------------------------------------------------------------
// Minimal WebSocketBus interface (avoids circular imports from ws-bus)
// ---------------------------------------------------------------------------

/** Minimal interface subset of WebSocketBus used for broadcasting. */
interface BroadcastTarget {
  broadcast(event: unknown): void;
}

// ---------------------------------------------------------------------------
// Request / response helpers
// ---------------------------------------------------------------------------

/** Read the full request body, capped at MAX_BODY_BYTES. */
async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** Write a JSON response. */
function jsonResponse(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type":                "application/json",
    "Content-Length":              Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "http://localhost:3100",   // command-center dev port
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control":               "no-store",
  });
  res.end(payload);
}

/** Write a plain error response. */
function errorResponse(
  res: ServerResponse,
  statusCode: number,
  message: string,
): void {
  jsonResponse(res, statusCode, { error: message, status: statusCode });
}

// ---------------------------------------------------------------------------
// Route handler types
// ---------------------------------------------------------------------------

interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  body?: unknown;
  /** Path segments after splitting on "/" and removing empty strings */
  segments: string[];
  registry: SessionRegistry;
  wsBus?: BroadcastTarget;
  /** Meeting lifecycle event logger — persists to append-only EventLog (Sub-AC 10d). */
  meetingLogger?: MeetingEventLogger;
}

// ---------------------------------------------------------------------------
// Route: POST /api/convene
// ---------------------------------------------------------------------------

/**
 * MeetingConveneRequest — matches the frontend shape from spatial-store.ts.
 * The frontend sends this as the HTTP body when triggering a meeting.
 */
interface MeetingConveneRequest {
  roomId: string;
  topic: string;
  agenda?: string;
  participantIds: string[];
  scheduledDurationMs?: number;
  requestedBy: string;
}

/**
 * ConveneResult — returned in the HTTP response body.
 * Includes the full SessionHandle so the frontend can display live session info.
 */
export interface ConveneResult {
  success: true;
  session: SessionHandle;
}

function handleConvene(ctx: RouteContext): void {
  const { res, body, registry, wsBus, meetingLogger } = ctx;
  const req = body as Partial<MeetingConveneRequest>;

  // Validate required fields
  if (!req.roomId || typeof req.roomId !== "string") {
    return errorResponse(res, 400, "Missing required field: roomId");
  }
  if (!req.topic || typeof req.topic !== "string") {
    return errorResponse(res, 400, "Missing required field: topic");
  }
  if (!Array.isArray(req.participantIds)) {
    return errorResponse(res, 400, "Missing required field: participantIds (array)");
  }
  if (!req.requestedBy || typeof req.requestedBy !== "string") {
    return errorResponse(res, 400, "Missing required field: requestedBy");
  }

  // Create the collaboration session
  const session = registry.create({
    room_id:             req.roomId,
    title:               req.topic,
    agenda:              req.agenda ?? "",
    participant_ids:     req.participantIds,
    initiated_by:        req.requestedBy,
    scheduled_duration_ms: req.scheduledDurationMs,
  });

  const handle = session.toHandle();

  // Broadcast meeting.started event via WebSocket bus (if connected)
  if (wsBus) {
    wsBus.broadcast({
      schema:   "1.0",
      event_id: `mtg-evt-${Date.now()}`,
      type:     "meeting.started",
      ts:       new Date().toISOString(),
      actor:    { kind: "user", id: req.requestedBy },
      payload: {
        meeting_id:           handle.session_id,
        room_id:              handle.room_id,
        title:                handle.title,
        initiated_by:         req.requestedBy,
        participant_ids:      req.participantIds,
        agenda:               req.agenda,
        scheduled_duration_ms: req.scheduledDurationMs,
      },
    });

    // Broadcast participant.joined events for each participant
    for (const p of handle.participants) {
      wsBus.broadcast({
        schema:   "1.0",
        event_id: `mtg-pj-${Date.now()}-${p.participant_id}`,
        type:     "meeting.participant.joined",
        ts:       new Date().toISOString(),
        actor:    { kind: "system", id: "meeting-orchestrator" },
        payload: {
          meeting_id:       handle.session_id,
          room_id:          handle.room_id,
          participant_id:   p.participant_id,
          participant_kind: p.participant_kind,
          role:             p.assigned_role,
        },
      });
    }
  }

  // Persist meeting.started to the EventLog (Sub-AC 10d)
  if (meetingLogger) {
    void meetingLogger.logStarted({
      meeting_id:            handle.session_id,
      room_id:               handle.room_id,
      title:                 handle.title,
      initiated_by:          req.requestedBy!,
      participant_ids:       req.participantIds!,
      agenda:                req.agenda,
      scheduled_duration_ms: req.scheduledDurationMs,
    });
  }

  console.info(
    `[MeetingHttpServer] Session ${handle.session_id} created — ` +
    `room=${handle.room_id}, participants=${handle.participants.length}`,
  );

  const result: ConveneResult = { success: true, session: handle };
  jsonResponse(res, 201, result);
}

// ---------------------------------------------------------------------------
// Route: POST /events (compatibility shim)
// ---------------------------------------------------------------------------

/**
 * Handle generic ConitensEvents forwarded from the frontend.
 * Only meeting.started events trigger session creation; others are logged
 * and forwarded via the WS bus.
 */
function handleEventsPost(ctx: RouteContext): void {
  const { res, body, registry, wsBus } = ctx;

  if (!body || typeof body !== "object") {
    return errorResponse(res, 400, "Invalid event body");
  }

  const event = body as Record<string, unknown>;
  const eventType = event["type"];

  if (eventType === "meeting.started") {
    // Extract the meeting payload and delegate to convene logic
    const payload = (event["payload"] ?? {}) as Record<string, unknown>;
    const actor = (event["actor"] ?? {}) as Record<string, unknown>;

    const conveneReq: MeetingConveneRequest = {
      roomId:         String(payload["room_id"] ?? ""),
      topic:          String(payload["title"] ?? payload["topic"] ?? "Meeting"),
      agenda:         payload["agenda"] != null ? String(payload["agenda"]) : undefined,
      participantIds: Array.isArray(payload["participant_ids"])
        ? (payload["participant_ids"] as unknown[]).map(String)
        : [],
      scheduledDurationMs: payload["scheduled_duration_ms"] != null
        ? Number(payload["scheduled_duration_ms"])
        : undefined,
      requestedBy:    String(payload["initiated_by"] ?? actor["id"] ?? "user"),
    };

    // Merge meeting_id from payload if present (idempotency)
    const existingId = payload["meeting_id"] as string | undefined;

    if (existingId && registry.get(existingId)) {
      // Session already exists — return existing handle (idempotent)
      const existing = registry.get(existingId)!;
      jsonResponse(res, 200, { success: true, session: existing.toHandle() });
      return;
    }

    const session = registry.create({
      meeting_id:          existingId,
      room_id:             conveneReq.roomId,
      title:               conveneReq.topic,
      agenda:              conveneReq.agenda ?? "",
      participant_ids:     conveneReq.participantIds,
      initiated_by:        conveneReq.requestedBy,
      scheduled_duration_ms: conveneReq.scheduledDurationMs,
    });

    const handle = session.toHandle();

    // Broadcast via WS bus
    if (wsBus) {
      wsBus.broadcast({
        schema:   "1.0",
        event_id: String(event["event_id"] ?? `mtg-evt-${Date.now()}`),
        type:     "meeting.started",
        ts:       String(event["ts"] ?? new Date().toISOString()),
        actor:    event["actor"] ?? { kind: "user", id: conveneReq.requestedBy },
        payload:  payload,
      });
    }

    jsonResponse(res, 201, { success: true, session: handle });
  } else {
    // Forward non-meeting events through the WS bus and acknowledge
    if (wsBus && eventType) {
      wsBus.broadcast(event);
    }
    jsonResponse(res, 200, { received: true, type: eventType });
  }
}

// ---------------------------------------------------------------------------
// Route: GET /api/sessions
// ---------------------------------------------------------------------------

function handleListSessions(ctx: RouteContext): void {
  const { res, registry } = ctx;
  const handles = registry.listActive().map((s) => s.toHandle());
  jsonResponse(res, 200, { sessions: handles, count: handles.length });
}

// ---------------------------------------------------------------------------
// Route: GET /api/sessions/:id
// ---------------------------------------------------------------------------

function handleGetSession(ctx: RouteContext): void {
  const { res, segments, registry } = ctx;
  const sessionId = segments[2]; // /api/sessions/<id>

  if (!sessionId) {
    return errorResponse(res, 400, "Missing session ID in path");
  }

  const session = registry.get(sessionId);
  if (!session) {
    return errorResponse(res, 404, `Session not found: ${sessionId}`);
  }

  jsonResponse(res, 200, { session: session.toHandle() });
}

// ---------------------------------------------------------------------------
// Route: POST /api/sessions/:id/messages
// ---------------------------------------------------------------------------

interface PostMessageBody {
  sender_id: string;
  content: string;
  message_type?: "text" | "context_update" | "decision" | "status" | "system";
}

function handlePostMessage(ctx: RouteContext): void {
  const { res, segments, body, registry, wsBus } = ctx;
  const sessionId = segments[2]; // /api/sessions/<id>/messages

  if (!sessionId) {
    return errorResponse(res, 400, "Missing session ID in path");
  }

  const session = registry.get(sessionId);
  if (!session) {
    return errorResponse(res, 404, `Session not found: ${sessionId}`);
  }

  if (session.status !== "active") {
    return errorResponse(res, 409, `Session ${sessionId} is not active (status: ${session.status})`);
  }

  const msgBody = body as Partial<PostMessageBody>;
  if (!msgBody.sender_id || typeof msgBody.sender_id !== "string") {
    return errorResponse(res, 400, "Missing required field: sender_id");
  }
  if (!msgBody.content || typeof msgBody.content !== "string") {
    return errorResponse(res, 400, "Missing required field: content");
  }

  const msg = session.postMessage(
    msgBody.sender_id,
    msgBody.content,
    msgBody.message_type ?? "text",
  );

  // Broadcast channel message event via WS bus
  if (wsBus) {
    wsBus.broadcast({
      schema:   "1.0",
      event_id: `ch-msg-${Date.now()}`,
      type:     "meeting.channel.message",
      ts:       msg.ts,
      actor:    { kind: "agent", id: msg.sender_id },
      payload: {
        meeting_id:  sessionId,
        channel_id:  session.channel_id,
        message_id:  msg.message_id,
        sender_id:   msg.sender_id,
        content:     msg.content,
        message_type: msg.message_type,
      },
    });
  }

  jsonResponse(res, 201, { message: msg, session_id: sessionId });
}

// ---------------------------------------------------------------------------
// Route: POST /api/sessions/:id/deliberate
// ---------------------------------------------------------------------------

/**
 * Transition the session protocol from request → deliberate.
 *
 * Body (optional):
 *   { initiated_by?: string; note?: string }
 *
 * Returns the updated SessionHandle with protocol.phase = "deliberate".
 * Returns 409 Conflict if the transition is invalid.
 */
function handleBeginDeliberation(ctx: RouteContext): void {
  const { res, segments, body, registry, wsBus, meetingLogger } = ctx;
  const sessionId = segments[2]; // /api/sessions/<id>/deliberate

  if (!sessionId) {
    return errorResponse(res, 400, "Missing session ID in path");
  }

  const session = registry.get(sessionId);
  if (!session) {
    return errorResponse(res, 404, `Session not found: ${sessionId}`);
  }

  if (session.status !== "active") {
    return errorResponse(res, 409, `Session ${sessionId} is not active (status: ${session.status})`);
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const input: BeginDeliberationInput = {
    initiated_by: typeof b["initiated_by"] === "string" ? b["initiated_by"] : "system",
    note:         typeof b["note"]         === "string" ? b["note"]         : undefined,
  };

  try {
    session.beginDeliberation(input);
  } catch (err) {
    if (err instanceof ProtocolTransitionError) {
      return errorResponse(res, 409, err.message);
    }
    throw err;
  }

  const handle = session.toHandle();

  // Persist meeting.deliberation to the EventLog (Sub-AC 10d)
  if (meetingLogger) {
    void meetingLogger.logDeliberation({
      meeting_id:    sessionId,
      room_id:       handle.room_id,
      initiated_by:  input.initiated_by,
      request_id:    session.protocol_request?.request_id,
      note:          input.note,
      correlation_id: sessionId,
    });
  }

  if (wsBus) {
    wsBus.broadcast({
      schema:   "1.0",
      event_id: `proto-delib-${Date.now()}`,
      type:     "meeting.protocol.deliberation_started",
      ts:       new Date().toISOString(),
      actor:    { kind: "user", id: input.initiated_by },
      payload: {
        meeting_id:    sessionId,
        room_id:       handle.room_id,
        initiated_by:  input.initiated_by,
        protocol_phase: "deliberate",
      },
    });
  }

  jsonResponse(res, 200, { success: true, session: handle });
}

// ---------------------------------------------------------------------------
// Route: POST /api/sessions/:id/decisions
// ---------------------------------------------------------------------------

/**
 * Add a decision to the session during the deliberate phase.
 *
 * Body:
 *   { content: string; decided_by: string; decision_type: string; rationale?: string }
 *
 * Returns the created ProtocolDecision and updated SessionHandle.
 * Returns 409 Conflict if not in deliberate phase.
 */
function handleAddDecision(ctx: RouteContext): void {
  const { res, segments, body, registry, wsBus } = ctx;
  const sessionId = segments[2]; // /api/sessions/<id>/decisions

  if (!sessionId) {
    return errorResponse(res, 400, "Missing session ID in path");
  }

  const session = registry.get(sessionId);
  if (!session) {
    return errorResponse(res, 404, `Session not found: ${sessionId}`);
  }

  if (session.status !== "active") {
    return errorResponse(res, 409, `Session ${sessionId} is not active (status: ${session.status})`);
  }

  const b = (body ?? {}) as Record<string, unknown>;

  if (!b["content"] || typeof b["content"] !== "string") {
    return errorResponse(res, 400, "Missing required field: content");
  }
  if (!b["decided_by"] || typeof b["decided_by"] !== "string") {
    return errorResponse(res, 400, "Missing required field: decided_by");
  }

  const VALID_DECISION_TYPES = new Set(["accept", "reject", "defer", "modify"]);
  const decisionType = b["decision_type"] as string | undefined;
  if (!decisionType || !VALID_DECISION_TYPES.has(decisionType)) {
    return errorResponse(res, 400, "Missing or invalid field: decision_type (accept|reject|defer|modify)");
  }

  const input: AddDecisionInput = {
    content:       b["content"] as string,
    decided_by:    b["decided_by"] as string,
    decision_type: decisionType as AddDecisionInput["decision_type"],
    rationale:     typeof b["rationale"] === "string" ? b["rationale"] : undefined,
    metadata:      b["metadata"] != null && typeof b["metadata"] === "object" && !Array.isArray(b["metadata"])
      ? b["metadata"] as Record<string, unknown>
      : undefined,
  };

  let decision;
  try {
    decision = session.addDecision(input);
  } catch (err) {
    if (err instanceof Error && err.message.includes("protocol phase")) {
      return errorResponse(res, 409, err.message);
    }
    throw err;
  }

  const handle = session.toHandle();

  if (wsBus) {
    wsBus.broadcast({
      schema:   "1.0",
      event_id: `proto-dec-${Date.now()}`,
      type:     "meeting.protocol.decision_added",
      ts:       new Date().toISOString(),
      actor:    { kind: "agent", id: input.decided_by },
      payload: {
        meeting_id:    sessionId,
        room_id:       handle.room_id,
        decision_id:   decision.decision_id,
        decided_by:    decision.decided_by,
        decision_type: decision.decision_type,
      },
    });
  }

  jsonResponse(res, 201, { decision, session: handle });
}

// ---------------------------------------------------------------------------
// Route: POST /api/sessions/:id/resolve
// ---------------------------------------------------------------------------

/**
 * Transition the session protocol from deliberate → resolve.
 *
 * Body:
 *   {
 *     outcome: string;
 *     summary: string;
 *     resolved_by: string;
 *     metadata?: object;
 *     spawn_tasks?: Array<{
 *       title?: string;
 *       description?: string;
 *       assigned_to?: string;
 *       priority?: 1|2|3|4|5;
 *       metadata?: object;
 *     }>;
 *   }
 *
 * Returns the ProtocolResolution, spawned tasks, and updated SessionHandle.
 * Returns 409 Conflict if not in deliberate phase.
 *
 * Sub-AC 10c: At least one SpawnedTask is always produced for non-abandoned
 * outcomes, linked to the session and resolution with full task metadata.
 */
function handleResolveProtocol(ctx: RouteContext): void {
  const { res, segments, body, registry, wsBus, meetingLogger } = ctx;
  const sessionId = segments[2]; // /api/sessions/<id>/resolve

  if (!sessionId) {
    return errorResponse(res, 400, "Missing session ID in path");
  }

  const session = registry.get(sessionId);
  if (!session) {
    return errorResponse(res, 404, `Session not found: ${sessionId}`);
  }

  if (session.status !== "active") {
    return errorResponse(res, 409, `Session ${sessionId} is not active (status: ${session.status})`);
  }

  const b = (body ?? {}) as Record<string, unknown>;

  const VALID_OUTCOMES = new Set(["accepted", "rejected", "deferred", "modified", "abandoned"]);
  const outcome = b["outcome"] as string | undefined;
  if (!outcome || !VALID_OUTCOMES.has(outcome)) {
    return errorResponse(res, 400, "Missing or invalid field: outcome (accepted|rejected|deferred|modified|abandoned)");
  }
  if (!b["summary"] || typeof b["summary"] !== "string") {
    return errorResponse(res, 400, "Missing required field: summary");
  }
  if (!b["resolved_by"] || typeof b["resolved_by"] !== "string") {
    return errorResponse(res, 400, "Missing required field: resolved_by");
  }

  // Parse optional spawn_tasks array (Sub-AC 10c)
  let spawnTasksInput: SpawnedTaskInput[] | undefined;
  if (Array.isArray(b["spawn_tasks"])) {
    spawnTasksInput = (b["spawn_tasks"] as unknown[]).map((t) => {
      const task = (t ?? {}) as Record<string, unknown>;
      const st: SpawnedTaskInput = {};
      if (typeof task["title"]       === "string") st.title       = task["title"];
      if (typeof task["description"] === "string") st.description = task["description"];
      if (typeof task["assigned_to"] === "string") st.assigned_to = task["assigned_to"];
      if (typeof task["priority"]    === "number" && task["priority"] >= 1 && task["priority"] <= 5) {
        st.priority = task["priority"] as 1 | 2 | 3 | 4 | 5;
      }
      if (task["metadata"] != null && typeof task["metadata"] === "object" && !Array.isArray(task["metadata"])) {
        st.metadata = task["metadata"] as Record<string, unknown>;
      }
      return st;
    });
  }

  const input: ResolveProtocolInput = {
    outcome:     outcome as ResolveProtocolInput["outcome"],
    summary:     b["summary"] as string,
    resolved_by: b["resolved_by"] as string,
    metadata:    b["metadata"] != null && typeof b["metadata"] === "object" && !Array.isArray(b["metadata"])
      ? b["metadata"] as Record<string, unknown>
      : undefined,
    spawn_tasks: spawnTasksInput,
  };

  let resolution;
  try {
    resolution = session.resolveProtocol(input);
  } catch (err) {
    if (err instanceof ProtocolTransitionError) {
      return errorResponse(res, 409, err.message);
    }
    throw err;
  }

  const handle = session.toHandle();
  // Spawned tasks are now available on the session (Sub-AC 10c)
  const spawnedTasks: ReadonlyArray<SpawnedTask> = session.spawned_tasks;

  // Persist meeting.resolved to the EventLog (Sub-AC 10d)
  if (meetingLogger) {
    void meetingLogger.logResolved({
      meeting_id:     sessionId,
      room_id:        handle.room_id,
      resolution_id:  resolution.resolution_id,
      outcome:        resolution.outcome,
      summary:        resolution.summary,
      resolved_by:    resolution.resolved_by,
      decision_count: resolution.decisions.length,
      task_count:     spawnedTasks.length,
      correlation_id: sessionId,
    });

    // Persist one meeting.task.spawned event per SpawnedTask (Sub-AC 10c).
    // This guarantees at least one task record is durably stored in the
    // event log for every non-abandoned resolution, providing full
    // meeting → resolution → task provenance in a single log scan.
    for (const task of spawnedTasks) {
      void meetingLogger.logTaskSpawned({
        task_id:       task.task_id,
        session_id:    task.session_id,
        resolution_id: task.resolution_id,
        room_id:       handle.room_id,
        title:         task.title,
        description:   task.description,
        assigned_to:   task.assigned_to,
        priority:      task.priority,
        status:        task.status,
        spawned_at:    task.spawned_at,
        metadata:      task.metadata,
        // causation_id links each task event back to the resolution
        causation_id:   resolution.resolution_id,
        // All meeting events for this session share the same correlation
        correlation_id: sessionId,
      });
    }
  }

  if (wsBus) {
    // Broadcast the resolution event
    wsBus.broadcast({
      schema:   "1.0",
      event_id: `proto-res-${Date.now()}`,
      type:     "meeting.protocol.resolved",
      ts:       new Date().toISOString(),
      actor:    { kind: "user", id: input.resolved_by },
      payload: {
        meeting_id:    sessionId,
        room_id:       handle.room_id,
        resolution_id: resolution.resolution_id,
        outcome:       resolution.outcome,
        resolved_by:   resolution.resolved_by,
        decision_count: resolution.decisions.length,
        task_count:    spawnedTasks.length,
      },
    });

    // Broadcast one meeting.task.spawned event per task (Sub-AC 10c)
    for (const task of spawnedTasks) {
      wsBus.broadcast({
        schema:   "1.0",
        event_id: `task-spawned-${task.task_id}`,
        type:     "meeting.task.spawned",
        ts:       task.spawned_at,
        actor:    { kind: "system", id: "meeting-orchestrator" },
        payload: {
          task_id:       task.task_id,
          session_id:    task.session_id,
          resolution_id: task.resolution_id,
          title:         task.title,
          description:   task.description,
          assigned_to:   task.assigned_to,
          priority:      task.priority,
          status:        task.status,
          spawned_at:    task.spawned_at,
          metadata:      task.metadata,
        },
      });
    }
  }

  console.info(
    `[MeetingHttpServer] Session ${sessionId} resolved — ` +
    `outcome=${resolution.outcome}, tasks_spawned=${spawnedTasks.length}`,
  );

  jsonResponse(res, 200, { resolution, spawned_tasks: [...spawnedTasks], session: handle });
}

// ---------------------------------------------------------------------------
// Route: GET /api/sessions/:id/tasks  (Sub-AC 10c)
// ---------------------------------------------------------------------------

/**
 * Return the spawned tasks for a session.
 *
 * Useful for frontends that need to display the task list produced at
 * resolution without re-fetching the full session handle.
 *
 * Returns 200 { tasks: SpawnedTask[], count: number } or 404 if not found.
 */
function handleGetSessionTasks(ctx: RouteContext): void {
  const { res, segments, registry } = ctx;
  const sessionId = segments[2]; // /api/sessions/<id>/tasks

  if (!sessionId) {
    return errorResponse(res, 400, "Missing session ID in path");
  }

  const session = registry.get(sessionId);
  if (!session) {
    return errorResponse(res, 404, `Session not found: ${sessionId}`);
  }

  const tasks = [...session.spawned_tasks];
  jsonResponse(res, 200, { tasks, count: tasks.length });
}

// ---------------------------------------------------------------------------
// Route: DELETE /api/sessions/:id
// ---------------------------------------------------------------------------

function handleEndSession(ctx: RouteContext): void {
  const { res, segments, body, registry, wsBus } = ctx;
  const sessionId = segments[2];

  if (!sessionId) {
    return errorResponse(res, 400, "Missing session ID in path");
  }

  const session = registry.get(sessionId);
  if (!session) {
    return errorResponse(res, 404, `Session not found: ${sessionId}`);
  }

  const endBody = (body ?? {}) as Record<string, unknown>;
  session.end(
    String(endBody["ended_by"] ?? "user"),
    String(endBody["outcome"] ?? "completed"),
  );

  const handle = session.toHandle();

  // Broadcast meeting.ended event
  if (wsBus) {
    wsBus.broadcast({
      schema:   "1.0",
      event_id: `mtg-end-${Date.now()}`,
      type:     "meeting.ended",
      ts:       new Date().toISOString(),
      actor:    { kind: "user", id: String(endBody["ended_by"] ?? "user") },
      payload: {
        meeting_id: sessionId,
        room_id:    handle.room_id,
        ended_by:   endBody["ended_by"],
        outcome:    endBody["outcome"] ?? "completed",
        duration_ms: handle.ended_at
          ? new Date(handle.ended_at).getTime() - new Date(handle.started_at).getTime()
          : undefined,
      },
    });
  }

  jsonResponse(res, 200, { success: true, session: handle });
}

// ---------------------------------------------------------------------------
// MeetingHttpServer
// ---------------------------------------------------------------------------

/** Configuration for MeetingHttpServer. */
export interface MeetingHttpServerOptions {
  /** TCP port to bind (default: 8081). */
  port?: number;
  /**
   * Optional WebSocketBus instance used to broadcast meeting lifecycle events
   * to connected command-center / dashboard clients.
   */
  wsBus?: BroadcastTarget;
  /**
   * Optional EventLog instance used to persist meeting lifecycle events.
   *
   * Sub-AC 10d: When provided, meeting.started, meeting.deliberation, and
   * meeting.resolved events are written to the append-only EventLog at the
   * corresponding protocol transitions, enabling full audit via log query.
   *
   * If absent, lifecycle events are only broadcast via the WebSocket bus
   * and are not persisted to disk.
   */
  eventLog?: EventLog;
  /**
   * Optional run_id to tag all EventLog entries emitted by this server.
   * Defaults to "meeting-orchestrator".
   */
  eventLogRunId?: string;
}

/**
 * MeetingHttpServer — lightweight HTTP control-plane for meeting orchestration.
 *
 * Usage:
 * ```ts
 * const server = new MeetingHttpServer({ wsBus: myWebSocketBus });
 * await server.start();
 * // ... later
 * await server.stop();
 * ```
 */
export class MeetingHttpServer {
  private readonly _port: number;
  private readonly _registry: SessionRegistry;
  private readonly _wsBus?: BroadcastTarget;
  private readonly _meetingLogger?: MeetingEventLogger;
  private _server: Server | null = null;
  private _pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: MeetingHttpServerOptions = {}) {
    this._port     = options.port ?? MEETING_HTTP_PORT;
    this._registry = new SessionRegistry();
    this._wsBus    = options.wsBus;
    // Sub-AC 10d: Instantiate MeetingEventLogger if an EventLog was provided
    if (options.eventLog) {
      this._meetingLogger = new MeetingEventLogger(
        options.eventLog,
        options.eventLogRunId ?? "meeting-orchestrator",
      );
    }
  }

  /** Start the HTTP server. Resolves when listening. */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._server = createServer((req, res) => {
        this._handleRequest(req, res).catch((err) => {
          console.error("[MeetingHttpServer] Unhandled error:", err);
          errorResponse(res, 500, "Internal server error");
        });
      });

      this._server.listen(this._port, "127.0.0.1", () => {
        console.info(`[MeetingHttpServer] Listening on http://127.0.0.1:${this._port}`);
        resolve();
      });

      this._server.on("error", (err) => {
        console.error("[MeetingHttpServer] Server error:", err);
        reject(err);
      });

      // Prune ended sessions every 10 minutes
      this._pruneTimer = setInterval(() => {
        const n = this._registry.pruneEnded();
        if (n > 0) {
          console.info(`[MeetingHttpServer] Pruned ${n} ended session(s)`);
        }
      }, 10 * 60 * 1_000);
    });
  }

  /** Gracefully stop the HTTP server. */
  async stop(): Promise<void> {
    if (this._pruneTimer) {
      clearInterval(this._pruneTimer);
      this._pruneTimer = null;
    }

    return new Promise((resolve, reject) => {
      if (!this._server) {
        resolve();
        return;
      }
      this._server.close((err) => {
        if (err) reject(err);
        else {
          this._server = null;
          console.info("[MeetingHttpServer] Stopped.");
          resolve();
        }
      });
    });
  }

  /** Direct access to the session registry (e.g. for tests). */
  get registry(): SessionRegistry {
    return this._registry;
  }

  /** Number of active sessions. */
  get activeSessions(): number {
    return this._registry.listActive().length;
  }

  // ── Private: request dispatcher ─────────────────────────────────────────

  private async _handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const method  = req.method?.toUpperCase() ?? "GET";
    const url     = req.url ?? "/";
    const path    = url.split("?")[0]; // strip query string
    const segments = path.split("/").filter(Boolean); // ["api","sessions","123","messages"]

    // ── CORS pre-flight ────────────────────────────────────────────────────
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin":  "http://localhost:3100",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age":       "86400",
      });
      res.end();
      return;
    }

    // ── Parse body for POST / PUT ──────────────────────────────────────────
    let body: unknown;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const rawBody = await readBody(req);
      if (rawBody.length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          return errorResponse(res, 400, "Invalid JSON body");
        }
      }
    }

    const ctx: RouteContext = {
      req,
      res,
      body,
      segments,
      registry:      this._registry,
      wsBus:         this._wsBus,
      meetingLogger: this._meetingLogger,
    };

    // ── Route dispatch ─────────────────────────────────────────────────────

    // POST /events  — compatibility shim
    if (method === "POST" && segments[0] === "events") {
      return handleEventsPost(ctx);
    }

    // POST /api/convene
    if (method === "POST" && segments[0] === "api" && segments[1] === "convene") {
      return handleConvene(ctx);
    }

    // GET /api/sessions
    if (method === "GET" && segments[0] === "api" && segments[1] === "sessions" && !segments[2]) {
      return handleListSessions(ctx);
    }

    // GET /api/sessions/:id
    if (method === "GET" && segments[0] === "api" && segments[1] === "sessions" && segments[2] && !segments[3]) {
      return handleGetSession(ctx);
    }

    // POST /api/sessions/:id/messages
    if (method === "POST" && segments[0] === "api" && segments[1] === "sessions" && segments[2] && segments[3] === "messages") {
      return handlePostMessage(ctx);
    }

    // POST /api/sessions/:id/deliberate — begin deliberation phase
    if (method === "POST" && segments[0] === "api" && segments[1] === "sessions" && segments[2] && segments[3] === "deliberate") {
      return handleBeginDeliberation(ctx);
    }

    // POST /api/sessions/:id/decisions — add a decision
    if (method === "POST" && segments[0] === "api" && segments[1] === "sessions" && segments[2] && segments[3] === "decisions") {
      return handleAddDecision(ctx);
    }

    // POST /api/sessions/:id/resolve — resolve the protocol
    if (method === "POST" && segments[0] === "api" && segments[1] === "sessions" && segments[2] && segments[3] === "resolve") {
      return handleResolveProtocol(ctx);
    }

    // GET /api/sessions/:id/tasks — list spawned tasks (Sub-AC 10c)
    if (method === "GET" && segments[0] === "api" && segments[1] === "sessions" && segments[2] && segments[3] === "tasks") {
      return handleGetSessionTasks(ctx);
    }

    // DELETE /api/sessions/:id
    if (method === "DELETE" && segments[0] === "api" && segments[1] === "sessions" && segments[2]) {
      return handleEndSession(ctx);
    }

    // ── Health check ───────────────────────────────────────────────────────
    if (method === "GET" && (path === "/" || path === "/health")) {
      return jsonResponse(res, 200, {
        status:          "ok",
        service:         "meeting-orchestrator",
        active_sessions: this._registry.listActive().length,
        total_sessions:  this._registry.size,
      });
    }

    // 404 fallback
    errorResponse(res, 404, `Route not found: ${method} ${path}`);
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create and start a MeetingHttpServer with the given options.
 *
 * @example
 * ```ts
 * const server = await startMeetingHttpServer({ wsBus: myBus });
 * // server is already listening on port 8081
 * ```
 */
export async function startMeetingHttpServer(
  options: MeetingHttpServerOptions = {},
): Promise<MeetingHttpServer> {
  const server = new MeetingHttpServer(options);
  await server.start();
  return server;
}
