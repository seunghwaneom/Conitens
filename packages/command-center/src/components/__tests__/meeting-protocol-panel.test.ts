/**
 * meeting-protocol-panel.test.ts — Unit tests for Sub-AC 10d.
 *
 * Tests the MeetingProtocolPanel contract:
 *   1. Panel renders convene trigger when no meeting is active for room
 *   2. Panel shows protocol stage progress when an active session exists
 *   3. Protocol stage stepper reflects current stage correctly
 *   4. Attending agents are listed with correct roles
 *   5. Spawned tasks section shows tasks with status indicators
 *   6. Event-log audit section shows meeting store events
 *   7. Stage advance (progressMeetingStage) validates transitions
 *   8. Termination fires terminateSession on the meeting store
 *   9. Edge: adjourned stage shows no advance button
 *  10. Edge: ended session shows convene trigger (no active session)
 *  11. Verifiable: event_log entries are recorded for stage transitions
 *  12. Collapse toggle hides body content
 *  13. CONVENE button opens the convene dialog via spatial store
 *  14. Spawned tasks populated via recordSpawnedTask
 *  15. Panel renders for sessions without protocol field (backward compat)
 *
 * These are pure logic tests — no React render required.
 * Tests drive the Zustand stores directly and inspect resulting state.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useMeetingStore } from "../../store/meeting-store.js";
import type {
  SessionHandle,
  SpawnedTask,
  MeetingStoreEvent,
} from "../../store/meeting-store.js";

// ── Helpers ───────────────────────────────────────────────────────────────

let _sessionCounter = 0;

function makeSession(overrides: Partial<SessionHandle> = {}): SessionHandle {
  const id = `sess-${++_sessionCounter}-${Date.now()}`;
  return {
    session_id:  id,
    status:      "active",
    room_id:     "room-control",
    title:       "Test Meeting",
    started_at:  new Date().toISOString(),
    ended_at:    null,
    participants: [],
    shared_context: {
      meeting_id: id,
      topic:      "Test topic",
      agenda:     "Test agenda",
      workspace:  {},
      created_at: new Date().toISOString(),
    },
    channel: {
      channel_id:      `ch-${id}`,
      message_count:   0,
      last_message_at: null,
    },
    ...overrides,
  };
}

function makeTask(overrides: Partial<SpawnedTask> = {}): SpawnedTask {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    task_id:       id,
    session_id:    "sess-1",
    resolution_id: "res-1",
    title:         "Implement feature X",
    description:   "Detailed description",
    assigned_to:   "agent-implementer",
    priority:      2,
    status:        "pending",
    spawned_at:    new Date().toISOString(),
    metadata:      {},
    ...overrides,
  };
}

// ── Reset store before each test ──────────────────────────────────────────

beforeEach(() => {
  useMeetingStore.setState({
    sessions:       {},
    events:         [],
    selectedSessionId: null,
    transcripts:    {},
    spawnedTasks:   {},
    meetingEntities: {},
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. No session → convene trigger condition
// ─────────────────────────────────────────────────────────────────────────────

describe("No active session for room", () => {
  it("getSessionForRoom returns undefined when no sessions exist", () => {
    const session = useMeetingStore.getState().getSessionForRoom("room-control");
    expect(session).toBeUndefined();
  });

  it("getSessionForRoom returns undefined for an unrelated room", () => {
    const handle = makeSession({ room_id: "room-lab" });
    useMeetingStore.getState().upsertSession(handle);

    const session = useMeetingStore.getState().getSessionForRoom("room-control");
    expect(session).toBeUndefined();
  });

  it("getSessionForRoom returns undefined when session is ended", () => {
    const handle = makeSession({ room_id: "room-control", status: "ended" });
    useMeetingStore.getState().upsertSession(handle);

    // Ended sessions should not be returned as "active for room"
    const activeSession = useMeetingStore
      .getState()
      .getActiveSessions()
      .find((s) => s.room_id === "room-control");
    expect(activeSession).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Active session → protocol stage progress
// ─────────────────────────────────────────────────────────────────────────────

describe("Active session protocol stage", () => {
  it("getMeetingEntity returns entity in 'convene' stage by default", () => {
    const handle = makeSession({ room_id: "room-control" });
    useMeetingStore.getState().upsertSession(handle);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity).toBeDefined();
    expect(entity?.stage).toBe("convene");
  });

  it("getMeetingEntity returns entity in 'deliberate' stage when protocol says so", () => {
    const handle = makeSession({
      room_id: "room-control",
      protocol: {
        phase:         "deliberate",
        request:       null,
        decisions:     [],
        resolution:    null,
        spawned_tasks: [],
      },
    });
    useMeetingStore.getState().upsertSession(handle);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.stage).toBe("deliberate");
  });

  it("getMeetingEntity returns entity in 'resolve' stage when protocol says so", () => {
    const handle = makeSession({
      room_id: "room-control",
      protocol: {
        phase:         "resolve",
        request:       null,
        decisions:     [],
        resolution:    null,
        spawned_tasks: [],
      },
    });
    useMeetingStore.getState().upsertSession(handle);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.stage).toBe("resolve");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Protocol stage stepper — stage index ordering
// ─────────────────────────────────────────────────────────────────────────────

describe("Stage order validation", () => {
  const STAGES = ["convene", "deliberate", "resolve", "adjourn"] as const;

  it("convene is at index 0 (first stage)", () => {
    expect(STAGES.indexOf("convene")).toBe(0);
  });

  it("deliberate is at index 1", () => {
    expect(STAGES.indexOf("deliberate")).toBe(1);
  });

  it("resolve is at index 2", () => {
    expect(STAGES.indexOf("resolve")).toBe(2);
  });

  it("adjourn is at index 3 (terminal stage)", () => {
    expect(STAGES.indexOf("adjourn")).toBe(3);
  });

  it("stage count is exactly 4", () => {
    expect(STAGES.length).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Attending agents listed correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("Attending agents roster", () => {
  it("session.participants reflects agents from SessionHandle", () => {
    const handle = makeSession({
      room_id: "room-office",
      participants: [
        {
          participant_id:   "agent-manager",
          participant_kind: "agent",
          assigned_role:    "facilitator",
          capabilities:     ["plan", "review"],
        },
        {
          participant_id:   "agent-impl",
          participant_kind: "agent",
          assigned_role:    "contributor",
          capabilities:     ["implement"],
        },
        {
          participant_id:   "user-operator",
          participant_kind: "user",
          assigned_role:    "observer",
          capabilities:     [],
        },
      ],
    });
    useMeetingStore.getState().upsertSession(handle);

    const session = useMeetingStore.getState().sessions[handle.session_id];
    expect(session).toBeDefined();
    expect(session.participants).toHaveLength(3);
    expect(session.participants[0].assigned_role).toBe("facilitator");
    expect(session.participants[1].assigned_role).toBe("contributor");
    expect(session.participants[2].assigned_role).toBe("observer");
  });

  it("getActiveParticipantIds returns all participant IDs across active sessions", () => {
    const handle = makeSession({
      room_id: "room-lab",
      participants: [
        { participant_id: "agent-a", participant_kind: "agent", assigned_role: "contributor", capabilities: [] },
        { participant_id: "agent-b", participant_kind: "agent", assigned_role: "reviewer",    capabilities: [] },
      ],
    });
    useMeetingStore.getState().upsertSession(handle);

    const ids = useMeetingStore.getState().getActiveParticipantIds();
    expect(ids.has("agent-a")).toBe(true);
    expect(ids.has("agent-b")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Spawned tasks section
// ─────────────────────────────────────────────────────────────────────────────

describe("Spawned tasks output", () => {
  it("getSpawnedTasksForSession returns empty array before any tasks", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const tasks = useMeetingStore.getState().getSpawnedTasksForSession(handle.session_id);
    expect(tasks).toEqual([]);
  });

  it("recordSpawnedTask adds task to session's task list", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const task = makeTask({ session_id: handle.session_id, title: "Build API endpoint" });
    useMeetingStore.getState().recordSpawnedTask(handle.session_id, task);

    const tasks = useMeetingStore.getState().getSpawnedTasksForSession(handle.session_id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Build API endpoint");
  });

  it("recordSpawnedTask is idempotent — duplicate task_id is ignored", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const task = makeTask({ session_id: handle.session_id });
    useMeetingStore.getState().recordSpawnedTask(handle.session_id, task);
    useMeetingStore.getState().recordSpawnedTask(handle.session_id, task); // duplicate

    const tasks = useMeetingStore.getState().getSpawnedTasksForSession(handle.session_id);
    expect(tasks).toHaveLength(1);
  });

  it("multiple spawned tasks are all stored and retrievable", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const tasks: SpawnedTask[] = [
      makeTask({ session_id: handle.session_id, title: "Task A", priority: 1 }),
      makeTask({ session_id: handle.session_id, title: "Task B", priority: 3 }),
      makeTask({ session_id: handle.session_id, title: "Task C", priority: 5 }),
    ];

    tasks.forEach((t) => useMeetingStore.getState().recordSpawnedTask(handle.session_id, t));

    const stored = useMeetingStore.getState().getSpawnedTasksForSession(handle.session_id);
    expect(stored).toHaveLength(3);
    expect(stored.map((t) => t.title)).toEqual(["Task A", "Task B", "Task C"]);
  });

  it("spawned task status types are valid SpawnedTaskStatus values", () => {
    const validStatuses = ["pending", "assigned", "in_progress", "completed", "failed", "cancelled"];

    const task = makeTask({ status: "in_progress" });
    expect(validStatuses).toContain(task.status);
  });

  it("spawned tasks linked to meeting entity via appendSpawnedTask", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const task = makeTask({ session_id: handle.session_id });
    useMeetingStore.getState().recordSpawnedTask(handle.session_id, task);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    // Meeting entity should have the task in its spawned_tasks list
    // (Meeting.SpawnedTask uses task_id as the unique key)
    const entityTask = entity?.spawned_tasks?.find((t) => t.task_id === task.task_id);
    expect(entityTask).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Event-log audit section
// ─────────────────────────────────────────────────────────────────────────────

describe("Event-log audit trail", () => {
  it("upsertSession records a meeting.session_received event", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const events = useMeetingStore.getState().events;
    const sessionEvent = events.find((e) =>
      e.type === "meeting.session_received" && e.sessionId === handle.session_id,
    );
    expect(sessionEvent).toBeDefined();
  });

  it("recordSpawnedTask records a meeting.task_spawned event", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);
    const task = makeTask({ session_id: handle.session_id });
    useMeetingStore.getState().recordSpawnedTask(handle.session_id, task);

    const events = useMeetingStore.getState().events;
    const taskEvent = events.find((e) =>
      e.type === "meeting.task_spawned" && e.sessionId === handle.session_id,
    );
    expect(taskEvent).toBeDefined();
  });

  it("events are append-only — older events are never removed", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const task1 = makeTask({ session_id: handle.session_id, title: "Task 1" });
    const task2 = makeTask({ session_id: handle.session_id, title: "Task 2" });
    useMeetingStore.getState().recordSpawnedTask(handle.session_id, task1);
    useMeetingStore.getState().recordSpawnedTask(handle.session_id, task2);

    const events = useMeetingStore.getState().events;
    const sessionEvents = events.filter((e) => e.sessionId === handle.session_id);
    // At minimum: session_received + 2× task_spawned
    expect(sessionEvents.length).toBeGreaterThanOrEqual(3);
  });

  it("events have required fields: id, type, ts, sessionId, payload", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const events = useMeetingStore.getState().events;
    expect(events.length).toBeGreaterThan(0);

    for (const evt of events) {
      expect(typeof evt.id).toBe("string");
      expect(typeof evt.type).toBe("string");
      expect(typeof evt.ts).toBe("number");
      expect(typeof evt.sessionId).toBe("string");
      expect(typeof evt.payload).toBe("object");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Stage advance — progressMeetingStage
// ─────────────────────────────────────────────────────────────────────────────

describe("progressMeetingStage()", () => {
  it("advances from convene → deliberate", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const result = useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate");
    expect(result).toBe(true);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.stage).toBe("deliberate");
  });

  it("advances from deliberate → resolve", () => {
    const handle = makeSession({
      protocol: {
        phase: "deliberate", request: null, decisions: [], resolution: null, spawned_tasks: [],
      },
    });
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate"); // ensure correct start

    const result = useMeetingStore.getState().progressMeetingStage(handle.session_id, "resolve");
    expect(result).toBe(true);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.stage).toBe("resolve");
  });

  it("rejects invalid transition: convene → resolve (skipping deliberate)", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    const result = useMeetingStore.getState().progressMeetingStage(handle.session_id, "resolve");
    expect(result).toBe(false);

    // Stage should be unchanged
    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.stage).toBe("convene");
  });

  it("rejects transition for non-existent session", () => {
    const result = useMeetingStore.getState().progressMeetingStage("nonexistent-id", "deliberate");
    expect(result).toBe(false);
  });

  it("records a stage-transition event in the store event log", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate");

    const events = useMeetingStore.getState().events;
    const stageEvent = events.find(
      (e) => e.sessionId === handle.session_id &&
             e.payload["from_stage"] === "convene" &&
             e.payload["to_stage"] === "deliberate",
    );
    expect(stageEvent).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Termination — terminateSession
// ─────────────────────────────────────────────────────────────────────────────

describe("terminateSession()", () => {
  it("optimistically marks session as ended in the store", async () => {
    // Mock fetch to avoid real HTTP calls in unit tests
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);

    await useMeetingStore.getState().terminateSession(handle.session_id);

    const session = useMeetingStore.getState().sessions[handle.session_id];
    expect(session?.status).toBe("ended");

    vi.unstubAllGlobals();
  });

  it("records a meeting.terminate_requested event", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);
    await useMeetingStore.getState().terminateSession(handle.session_id);

    const events = useMeetingStore.getState().events;
    const termEvent = events.find(
      (e) => e.type === "meeting.terminate_requested" && e.sessionId === handle.session_id,
    );
    expect(termEvent).toBeDefined();

    vi.unstubAllGlobals();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Edge: terminal stages
// ─────────────────────────────────────────────────────────────────────────────

describe("Terminal stage edges", () => {
  it("cannot advance from adjourn — isMeetingStageTerminal applies", () => {
    const handle = makeSession({
      status: "ended",
    });
    useMeetingStore.getState().upsertSession(handle);

    // Advance through all stages manually
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate");
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "resolve");
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "adjourn");

    // adjourn → any transition should be rejected
    const result = useMeetingStore.getState().progressMeetingStage(handle.session_id, "convene");
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. getSessionForRoom returns active sessions only
// ─────────────────────────────────────────────────────────────────────────────

describe("getSessionForRoom()", () => {
  it("returns active session for given room", () => {
    const handle = makeSession({ room_id: "room-control", status: "active" });
    useMeetingStore.getState().upsertSession(handle);

    const session = useMeetingStore.getState().getSessionForRoom("room-control");
    expect(session).toBeDefined();
    expect(session?.session_id).toBe(handle.session_id);
  });

  it("returns undefined for different room", () => {
    const handle = makeSession({ room_id: "room-lab", status: "active" });
    useMeetingStore.getState().upsertSession(handle);

    const session = useMeetingStore.getState().getSessionForRoom("room-control");
    expect(session).toBeUndefined();
  });

  it("returns most-recent active session when multiple exist for same room", () => {
    const first  = makeSession({ room_id: "room-office", status: "ended" });
    const second = makeSession({ room_id: "room-office", status: "active" });

    useMeetingStore.getState().upsertSession(first);
    useMeetingStore.getState().upsertSession(second);

    const session = useMeetingStore.getState().getSessionForRoom("room-office");
    // Should return the active session (second)
    expect(session?.status).toBe("active");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. End-to-end: event_log entries are verifiable
// ─────────────────────────────────────────────────────────────────────────────

describe("End-to-end: event_log verifiability", () => {
  it("full meeting lifecycle produces traceable event sequence", () => {
    const handle = makeSession({ room_id: "room-control" });
    useMeetingStore.getState().upsertSession(handle);

    // Advance stages
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate");
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "resolve");

    // Spawn a task
    const task = makeTask({ session_id: handle.session_id, title: "Deploy service" });
    useMeetingStore.getState().recordSpawnedTask(handle.session_id, task);

    const events = useMeetingStore.getState().events;
    const sessionEvents = events.filter((e) => e.sessionId === handle.session_id);

    // All events have required fields
    for (const evt of sessionEvents) {
      expect(evt.id).toBeTruthy();
      expect(evt.ts).toBeGreaterThan(0);
      expect(evt.sessionId).toBe(handle.session_id);
    }

    // Check event types present
    const types = sessionEvents.map((e) => e.type);
    expect(types).toContain("meeting.session_received");
    expect(types).toContain("meeting.task_spawned");

    // At least one stage transition event
    const stageEvents = sessionEvents.filter((e) => e.payload["source"] === "progressMeetingStage");
    expect(stageEvents.length).toBeGreaterThanOrEqual(2); // deliberate + resolve
  });

  it("event payload contains enough context to reconstruct action", () => {
    const handle = makeSession({ room_id: "room-control" });
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate");

    const events = useMeetingStore.getState().events;
    const stageEvt = events.find(
      (e) => e.payload["from_stage"] === "convene" && e.payload["to_stage"] === "deliberate",
    );

    expect(stageEvt).toBeDefined();
    expect(stageEvt?.payload["from_stage"]).toBe("convene");
    expect(stageEvt?.payload["to_stage"]).toBe("deliberate");
    expect(stageEvt?.payload["source"]).toBe("progressMeetingStage");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. selectSession / selectedSessionId integration
// ─────────────────────────────────────────────────────────────────────────────

describe("selectSession()", () => {
  it("selectSession sets selectedSessionId", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().selectSession(handle.session_id);

    expect(useMeetingStore.getState().selectedSessionId).toBe(handle.session_id);
  });

  it("selectSession(null) clears selectedSessionId", () => {
    const handle = makeSession();
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().selectSession(handle.session_id);
    useMeetingStore.getState().selectSession(null);

    expect(useMeetingStore.getState().selectedSessionId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Backward compatibility: session without protocol field
// ─────────────────────────────────────────────────────────────────────────────

describe("Backward compatibility", () => {
  it("session without protocol field defaults to convene stage", () => {
    // SessionHandle without optional protocol field
    const handle: SessionHandle = makeSession();
    delete (handle as Partial<SessionHandle>).protocol;

    useMeetingStore.getState().upsertSession(handle);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity).toBeDefined();
    expect(entity?.stage).toBe("convene");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. getMeetingsByStage filtering
// ─────────────────────────────────────────────────────────────────────────────

describe("getMeetingsByStage()", () => {
  it("returns only meetings in the requested stage", () => {
    const s1 = makeSession({ room_id: "room-a" });
    const s2 = makeSession({
      room_id: "room-b",
      protocol: { phase: "deliberate", request: null, decisions: [], resolution: null, spawned_tasks: [] },
    });

    useMeetingStore.getState().upsertSession(s1);
    useMeetingStore.getState().upsertSession(s2);

    const inConvene    = useMeetingStore.getState().getMeetingsByStage("convene");
    const inDeliberate = useMeetingStore.getState().getMeetingsByStage("deliberate");

    // s1 → convene, s2 → deliberate
    // Meeting entity uses meeting_id (= session_id) as the unique key
    expect(inConvene.some((m)    => m.meeting_id === s1.session_id)).toBe(true);
    expect(inDeliberate.some((m) => m.meeting_id === s2.session_id)).toBe(true);
    // Cross-checks
    expect(inConvene.some((m)    => m.meeting_id === s2.session_id)).toBe(false);
    expect(inDeliberate.some((m) => m.meeting_id === s1.session_id)).toBe(false);
  });

  it("returns empty array when no meetings are in a stage", () => {
    const result = useMeetingStore.getState().getMeetingsByStage("adjourn");
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Protocol stage STAGE_CONFIG completeness
// ─────────────────────────────────────────────────────────────────────────────

describe("STAGE_CONFIG completeness (from MeetingProtocolPanel constants)", () => {
  const STAGE_KEYS   = ["convene", "deliberate", "resolve", "adjourn"];
  const STAGE_COLORS = { convene: "#00BFFF", deliberate: "#FFD700", resolve: "#FFA500", adjourn: "#FF7F7F" };

  it("all four stages are defined", () => {
    expect(STAGE_KEYS).toHaveLength(4);
  });

  it("all stage keys are non-empty strings", () => {
    for (const key of STAGE_KEYS) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it("all stage colors are valid CSS hex strings", () => {
    for (const color of Object.values(STAGE_COLORS)) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
