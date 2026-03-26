/**
 * @file meeting-protocol-state.test.ts
 * Sub-AC 10a — Meeting convocation data model wired into the meeting store.
 *
 * Covers:
 *   1. meetingEntities is populated on upsertSession
 *   2. getMeetingEntity returns Meeting domain entity
 *   3. getMeetingsByStage filters by stage
 *   4. progressMeetingStage applies valid transitions
 *   5. progressMeetingStage rejects invalid transitions
 *   6. Meeting entity stage updates on handleLiveMeetingEvent (deliberation, resolved)
 *   7. Meeting entity stage transitions to adjourn on meeting.ended
 *   8. spawned_tasks propagated to Meeting entity via recordSpawnedTask
 *   9. Meeting entity created for WS-sourced sessions
 *  10. Full lifecycle via meeting events
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useMeetingStore } from "../meeting-store.js";
import type { SessionHandle } from "../meeting-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandle(overrides: Partial<SessionHandle> = {}): SessionHandle {
  const id = `mtg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  return {
    session_id: id,
    status:     "active",
    room_id:    "ops-control",
    title:      "Test Protocol Meeting",
    started_at: new Date().toISOString(),
    ended_at:   null,
    participants: [
      {
        participant_id:   "manager-default",
        participant_kind: "agent",
        assigned_role:    "facilitator",
        capabilities:     [],
      },
    ],
    shared_context: {
      meeting_id: id,
      topic:      "Test Protocol Meeting",
      agenda:     "",
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

function resetStore(): void {
  useMeetingStore.setState({
    sessions:          {},
    events:            [],
    selectedSessionId: null,
    transcripts:       {},
    spawnedTasks:      {},
    meetingEntities:   {},
  });
}

// ---------------------------------------------------------------------------
// 1. meetingEntities populated on upsertSession
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: meetingEntities populated on upsertSession", () => {
  beforeEach(resetStore);

  it("creates a Meeting entity when a new session is upserted", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    const entity = useMeetingStore.getState().meetingEntities[handle.session_id];
    expect(entity).toBeDefined();
    expect(entity?.meeting_id).toBe(handle.session_id);
    expect(entity?.room_id).toBe(handle.room_id);
  });

  it("initial stage is convene for an active session", () => {
    const handle = makeHandle({ status: "active" });
    useMeetingStore.getState().upsertSession(handle);
    const entity = useMeetingStore.getState().meetingEntities[handle.session_id];
    expect(entity?.stage).toBe("convene");
  });

  it("stage is adjourn for an ended session", () => {
    const handle = makeHandle({ status: "ended", ended_at: new Date().toISOString() });
    useMeetingStore.getState().upsertSession(handle);
    const entity = useMeetingStore.getState().meetingEntities[handle.session_id];
    expect(entity?.stage).toBe("adjourn");
  });

  it("participants are projected from the SessionHandle", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    const entity = useMeetingStore.getState().meetingEntities[handle.session_id];
    expect(entity?.participants).toHaveLength(1);
    expect(entity?.participants[0].participant_id).toBe("manager-default");
  });
});

// ---------------------------------------------------------------------------
// 2. getMeetingEntity
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: getMeetingEntity", () => {
  beforeEach(resetStore);

  it("returns the Meeting entity for an existing session", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity).toBeDefined();
    expect(entity?.meeting_id).toBe(handle.session_id);
  });

  it("returns undefined for an unknown session_id", () => {
    const entity = useMeetingStore.getState().getMeetingEntity("nonexistent");
    expect(entity).toBeUndefined();
  });

  it("entity has the correct room_id", () => {
    const handle = makeHandle({ room_id: "research-lab" });
    useMeetingStore.getState().upsertSession(handle);
    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.room_id).toBe("research-lab");
  });

  it("entity has spawned_tasks as empty array initially", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.spawned_tasks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. getMeetingsByStage
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: getMeetingsByStage", () => {
  beforeEach(resetStore);

  it("returns meetings in the given stage", () => {
    const h1 = makeHandle({ session_id: "s1", status: "active" });
    const h2 = makeHandle({ session_id: "s2", status: "ended", ended_at: new Date().toISOString() });
    useMeetingStore.getState().upsertSession(h1);
    useMeetingStore.getState().upsertSession(h2);

    const convening = useMeetingStore.getState().getMeetingsByStage("convene");
    expect(convening.length).toBeGreaterThanOrEqual(1);
    expect(convening.every((m) => m.stage === "convene")).toBe(true);

    const adjourned = useMeetingStore.getState().getMeetingsByStage("adjourn");
    expect(adjourned.length).toBeGreaterThanOrEqual(1);
    expect(adjourned.every((m) => m.stage === "adjourn")).toBe(true);
  });

  it("returns empty array when no meetings are in a stage", () => {
    const deliberating = useMeetingStore.getState().getMeetingsByStage("deliberate");
    expect(deliberating).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. progressMeetingStage — valid transition
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: progressMeetingStage — valid transitions", () => {
  beforeEach(resetStore);

  it("advances from convene to deliberate", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);

    const result = useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate");
    expect(result).toBe(true);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.stage).toBe("deliberate");
    expect(entity?.status).toBe("deliberating");
  });

  it("advances from deliberate to resolve", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate");
    const result = useMeetingStore.getState().progressMeetingStage(handle.session_id, "resolve");
    expect(result).toBe(true);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.stage).toBe("resolve");
    expect(entity?.status).toBe("resolving");
  });

  it("advances from resolve to adjourn", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate");
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "resolve");
    const result = useMeetingStore.getState().progressMeetingStage(handle.session_id, "adjourn");
    expect(result).toBe(true);

    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.stage).toBe("adjourn");
  });

  it("records a MeetingStoreEvent on successful progression", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    const eventsBefore = useMeetingStore.getState().events.length;
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "deliberate");
    expect(useMeetingStore.getState().events.length).toBeGreaterThan(eventsBefore);
  });
});

// ---------------------------------------------------------------------------
// 5. progressMeetingStage — invalid transitions
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: progressMeetingStage — invalid transitions", () => {
  beforeEach(resetStore);

  it("returns false for an invalid transition (convene → resolve)", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    const result = useMeetingStore.getState().progressMeetingStage(handle.session_id, "resolve");
    expect(result).toBe(false);
  });

  it("does not change entity stage on invalid transition", () => {
    const handle = makeHandle();
    useMeetingStore.getState().upsertSession(handle);
    useMeetingStore.getState().progressMeetingStage(handle.session_id, "resolve");
    const entity = useMeetingStore.getState().getMeetingEntity(handle.session_id);
    expect(entity?.stage).toBe("convene"); // unchanged
  });

  it("returns false for unknown session_id", () => {
    const result = useMeetingStore.getState().progressMeetingStage("nonexistent", "deliberate");
    expect(result).toBe(false);
  });

  it("returns false for any transition from adjourn", () => {
    const handle = makeHandle({ status: "ended", ended_at: new Date().toISOString() });
    useMeetingStore.getState().upsertSession(handle);
    // entity starts in adjourn
    const stages = ["convene", "deliberate", "resolve", "adjourn"] as const;
    for (const stage of stages) {
      const result = useMeetingStore.getState().progressMeetingStage(handle.session_id, stage);
      expect(result).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Meeting entity stage updates on handleLiveMeetingEvent (deliberation)
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: stage advancement via handleLiveMeetingEvent", () => {
  beforeEach(resetStore);

  it("advances to deliberate stage on meeting.deliberation event", () => {
    const handle = makeHandle({ session_id: "mtg-delib-ws" });
    useMeetingStore.getState().upsertSession(handle);

    useMeetingStore.getState().handleLiveMeetingEvent({
      type:    "meeting.deliberation",
      payload: {
        meeting_id:   "mtg-delib-ws",
        room_id:      "ops-control",
        initiated_by: "manager-default",
      },
    });

    const entity = useMeetingStore.getState().getMeetingEntity("mtg-delib-ws");
    expect(entity?.stage).toBe("deliberate");
    expect(entity?.status).toBe("deliberating");
  });

  it("advances to resolve stage on meeting.resolved event", () => {
    const handle = makeHandle({ session_id: "mtg-res-ws" });
    useMeetingStore.getState().upsertSession(handle);

    // First go to deliberate
    useMeetingStore.getState().progressMeetingStage("mtg-res-ws", "deliberate");

    useMeetingStore.getState().handleLiveMeetingEvent({
      type:    "meeting.resolved",
      payload: {
        meeting_id:    "mtg-res-ws",
        room_id:       "ops-control",
        resolution_id: "res-ws-001",
        outcome:       "accepted",
        summary:       "Decision made",
        resolved_by:   "manager-default",
        decision_count: 1,
        task_count:    0,
      },
    });

    const entity = useMeetingStore.getState().getMeetingEntity("mtg-res-ws");
    expect(entity?.stage).toBe("resolve");
    expect(entity?.status).toBe("resolving");
  });
});

// ---------------------------------------------------------------------------
// 7. Meeting entity stage transitions to adjourn on meeting.ended
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: adjourn on meeting.ended WS event", () => {
  beforeEach(resetStore);

  it("meeting entity stage becomes adjourn when session ends via WS", () => {
    const handle = makeHandle({ session_id: "mtg-end-ws" });
    useMeetingStore.getState().upsertSession(handle);

    useMeetingStore.getState().handleLiveMeetingEvent({
      type:    "meeting.ended",
      payload: { meeting_id: "mtg-end-ws", outcome: "completed" },
      ts:      new Date().toISOString(),
    });

    const entity = useMeetingStore.getState().getMeetingEntity("mtg-end-ws");
    expect(entity?.stage).toBe("adjourn");
    expect(entity?.status).toBe("adjourned");
  });
});

// ---------------------------------------------------------------------------
// 8. spawned_tasks propagated to Meeting entity via recordSpawnedTask
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: spawned_tasks on Meeting entity", () => {
  beforeEach(resetStore);

  it("appends spawned task to Meeting entity on recordSpawnedTask", () => {
    const handle = makeHandle({ session_id: "mtg-tasks" });
    useMeetingStore.getState().upsertSession(handle);

    useMeetingStore.getState().recordSpawnedTask("mtg-tasks", {
      task_id:       "task-001",
      session_id:    "mtg-tasks",
      resolution_id: "res-001",
      title:         "Implement Feature Y",
      description:   "Full implementation of feature Y",
      assigned_to:   "implementer-subagent",
      priority:      3,
      status:        "pending",
      spawned_at:    new Date().toISOString(),
      metadata:      {},
    });

    const entity = useMeetingStore.getState().getMeetingEntity("mtg-tasks");
    expect(entity?.spawned_tasks).toHaveLength(1);
    expect(entity?.spawned_tasks[0].task_id).toBe("task-001");
  });

  it("is idempotent — same task_id not duplicated in Meeting entity", () => {
    const handle = makeHandle({ session_id: "mtg-tasks-idem" });
    useMeetingStore.getState().upsertSession(handle);

    const task = {
      task_id:       "task-idem",
      session_id:    "mtg-tasks-idem",
      resolution_id: "res-001",
      title:         "Task",
      description:   "",
      assigned_to:   "implementer-subagent",
      priority:      3 as const,
      status:        "pending" as const,
      spawned_at:    new Date().toISOString(),
      metadata:      {},
    };

    useMeetingStore.getState().recordSpawnedTask("mtg-tasks-idem", task);
    useMeetingStore.getState().recordSpawnedTask("mtg-tasks-idem", task);

    const entity = useMeetingStore.getState().getMeetingEntity("mtg-tasks-idem");
    expect(entity?.spawned_tasks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 9. Meeting entity created for WS-sourced sessions (meeting.started)
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: Meeting entity for WS-sourced sessions", () => {
  beforeEach(resetStore);

  it("creates Meeting entity when meeting.started WS event arrives for unknown session", () => {
    useMeetingStore.getState().handleLiveMeetingEvent({
      type:    "meeting.started",
      payload: {
        meeting_id:      "mtg-ws-new",
        room_id:         "research-lab",
        title:           "WS Research Meeting",
        initiated_by:    "user",
        participant_ids: [],
      },
    });

    const entity = useMeetingStore.getState().getMeetingEntity("mtg-ws-new");
    expect(entity).toBeDefined();
    expect(entity?.meeting_id).toBe("mtg-ws-new");
    expect(entity?.room_id).toBe("research-lab");
    expect(entity?.stage).toBe("convene");
  });
});

// ---------------------------------------------------------------------------
// 10. Full lifecycle via store actions
// ---------------------------------------------------------------------------

describe("Sub-AC 10a: full protocol lifecycle via store", () => {
  beforeEach(resetStore);

  it("traverses convene → deliberate → resolve → adjourn programmatically", () => {
    const handle = makeHandle({ session_id: "mtg-full-lifecycle" });
    useMeetingStore.getState().upsertSession(handle);

    // convene (initial)
    let entity = useMeetingStore.getState().getMeetingEntity("mtg-full-lifecycle");
    expect(entity?.stage).toBe("convene");

    // → deliberate
    useMeetingStore.getState().progressMeetingStage("mtg-full-lifecycle", "deliberate");
    entity = useMeetingStore.getState().getMeetingEntity("mtg-full-lifecycle");
    expect(entity?.stage).toBe("deliberate");

    // → resolve
    useMeetingStore.getState().progressMeetingStage("mtg-full-lifecycle", "resolve");
    entity = useMeetingStore.getState().getMeetingEntity("mtg-full-lifecycle");
    expect(entity?.stage).toBe("resolve");

    // spawned task at resolution
    useMeetingStore.getState().recordSpawnedTask("mtg-full-lifecycle", {
      task_id:       "task-lifecycle-001",
      session_id:    "mtg-full-lifecycle",
      resolution_id: "res-lifecycle",
      title:         "Follow-up implementation",
      description:   "Implement the agreed plan",
      assigned_to:   "implementer-subagent",
      priority:      2,
      status:        "pending",
      spawned_at:    new Date().toISOString(),
      metadata:      {},
    });
    entity = useMeetingStore.getState().getMeetingEntity("mtg-full-lifecycle");
    expect(entity?.spawned_tasks).toHaveLength(1);

    // → adjourn
    useMeetingStore.getState().progressMeetingStage("mtg-full-lifecycle", "adjourn");
    entity = useMeetingStore.getState().getMeetingEntity("mtg-full-lifecycle");
    expect(entity?.stage).toBe("adjourn");
    expect(entity?.status).toBe("adjourned");

    // spawned tasks survive adjourn
    expect(entity?.spawned_tasks).toHaveLength(1);
  });
});
