/**
 * @file meeting-state.test.ts
 * Sub-AC 10a — Meeting convocation data model and protocol state machine tests.
 *
 * Covers:
 *   1. Stage ordering and membership
 *   2. State machine transitions (valid + invalid)
 *   3. Terminal stage detection
 *   4. Meeting entity factory (createMeeting)
 *   5. applyMeetingEvent reducer (all 7 event types)
 *   6. projectMeetingFromEvents reconstruction
 *   7. advanceMeetingStage helper
 *   8. appendSpawnedTask / updateSpawnedTaskStatus helpers
 *   9. Type guards (isMeeting, isSpawnedTask)
 *  10. Full protocol lifecycle: convene → deliberate → resolve → adjourn
 */

import { describe, it, expect } from "vitest";
import {
  MEETING_STAGES,
  MEETING_STAGE_SET,
  VALID_MEETING_STAGE_TRANSITIONS,
  canMeetingStageTransition,
  isMeetingStageTerminal,
  isMeetingStage,
  STAGE_TO_STATUS,
  createMeeting,
  applyMeetingEvent,
  projectMeetingFromEvents,
  advanceMeetingStage,
  appendSpawnedTask,
  updateSpawnedTaskStatus,
  isMeeting,
  isSpawnedTask,
  type MeetingStage,
  type Meeting,
  type SpawnedTask,
} from "../src/meeting-state.js";
import type { ConitensEvent } from "../src/event.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _eventCounter = 0;
function makeEvent(
  type: string,
  payload: Record<string, unknown>,
  ts = Date.now(),
): ConitensEvent {
  return {
    event_id:   `evt-${++_eventCounter}`,
    type:       type as ConitensEvent["type"],
    ts,
    run_id:     "run-test",
    actor:      { kind: "agent", id: "manager-default" },
    payload,
  } as unknown as ConitensEvent;
}

function makeSpawnedTask(overrides: Partial<SpawnedTask> = {}): SpawnedTask {
  return {
    task_id:       `task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    session_id:    "mtg-001",
    resolution_id: "res-001",
    title:         "Implement feature X",
    description:   "Full description of feature X",
    assigned_to:   "implementer-subagent",
    priority:      3,
    status:        "pending",
    spawned_at:    new Date().toISOString(),
    metadata:      {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Stage ordering and membership
// ---------------------------------------------------------------------------

describe("MEETING_STAGES", () => {
  it("has exactly four stages in the canonical order", () => {
    expect(MEETING_STAGES).toEqual(["convene", "deliberate", "resolve", "adjourn"]);
  });

  it("each stage is present in MEETING_STAGE_SET", () => {
    for (const stage of MEETING_STAGES) {
      expect(MEETING_STAGE_SET.has(stage)).toBe(true);
    }
  });

  it("non-stage strings are not in the set", () => {
    expect(MEETING_STAGE_SET.has("request")).toBe(false);
    expect(MEETING_STAGE_SET.has("abandoned")).toBe(false);
    expect(MEETING_STAGE_SET.has("")).toBe(false);
  });
});

describe("isMeetingStage", () => {
  it("returns true for all canonical stages", () => {
    for (const stage of MEETING_STAGES) {
      expect(isMeetingStage(stage)).toBe(true);
    }
  });

  it("returns false for non-stage strings", () => {
    expect(isMeetingStage("request")).toBe(false);
    expect(isMeetingStage(null)).toBe(false);
    expect(isMeetingStage(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. State machine transitions
// ---------------------------------------------------------------------------

describe("canMeetingStageTransition", () => {
  it("allows convene → deliberate (primary forward path)", () => {
    expect(canMeetingStageTransition("convene", "deliberate")).toBe(true);
  });

  it("allows convene → adjourn (early cancellation)", () => {
    expect(canMeetingStageTransition("convene", "adjourn")).toBe(true);
  });

  it("allows deliberate → resolve (forward path)", () => {
    expect(canMeetingStageTransition("deliberate", "resolve")).toBe(true);
  });

  it("allows deliberate → convene (rejection / re-open)", () => {
    expect(canMeetingStageTransition("deliberate", "convene")).toBe(true);
  });

  it("allows resolve → adjourn (terminal)", () => {
    expect(canMeetingStageTransition("resolve", "adjourn")).toBe(true);
  });

  it("disallows convene → resolve (skip deliberation)", () => {
    expect(canMeetingStageTransition("convene", "resolve")).toBe(false);
  });

  it("disallows convene → convene (self-loop)", () => {
    expect(canMeetingStageTransition("convene", "convene")).toBe(false);
  });

  it("disallows resolve → deliberate (backward skip)", () => {
    expect(canMeetingStageTransition("resolve", "deliberate")).toBe(false);
  });

  it("disallows resolve → convene (full rewind)", () => {
    expect(canMeetingStageTransition("resolve", "convene")).toBe(false);
  });

  it("disallows any transition from adjourn (terminal)", () => {
    for (const stage of MEETING_STAGES) {
      expect(canMeetingStageTransition("adjourn", stage)).toBe(false);
    }
  });
});

describe("VALID_MEETING_STAGE_TRANSITIONS exhaustiveness", () => {
  it("has an entry for every canonical stage", () => {
    for (const stage of MEETING_STAGES) {
      expect(VALID_MEETING_STAGE_TRANSITIONS[stage]).toBeDefined();
      expect(Array.isArray(VALID_MEETING_STAGE_TRANSITIONS[stage])).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Terminal stage detection
// ---------------------------------------------------------------------------

describe("isMeetingStageTerminal", () => {
  it("adjourn is the only terminal stage", () => {
    expect(isMeetingStageTerminal("adjourn")).toBe(true);
  });

  it("non-terminal stages have outgoing transitions", () => {
    const nonTerminal: MeetingStage[] = ["convene", "deliberate", "resolve"];
    for (const stage of nonTerminal) {
      expect(isMeetingStageTerminal(stage)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. createMeeting factory
// ---------------------------------------------------------------------------

describe("createMeeting", () => {
  it("creates a meeting with stage = convene by default", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    expect(m.stage).toBe("convene");
  });

  it("creates a meeting with status = convening when no scheduled_at", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    expect(m.status).toBe("convening");
  });

  it("creates a meeting with status = scheduled when scheduled_at is set and no started_at", () => {
    const m = createMeeting({
      meeting_id:   "mtg-001",
      room_id:      "ops-control",
      scheduled_at: "2026-04-01T10:00:00Z",
    });
    expect(m.status).toBe("scheduled");
  });

  it("sets empty collections for participants, decisions, spawned_tasks", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    expect(m.participants).toEqual([]);
    expect(m.decisions).toEqual([]);
    expect(m.spawned_tasks).toEqual([]);
  });

  it("sets resolution = null and outcome = null initially", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    expect(m.resolution).toBeNull();
    expect(m.outcome).toBeNull();
  });

  it("propagates title and agenda from input", () => {
    const m = createMeeting({
      meeting_id: "mtg-001",
      room_id:    "ops-control",
      title:      "Sprint Review",
      agenda:     "Review completed work",
    });
    expect(m.title).toBe("Sprint Review");
    expect(m.agenda).toBe("Review completed work");
  });

  it("initializes event_count at 0", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    expect(m.event_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. applyMeetingEvent reducer
// ---------------------------------------------------------------------------

describe("applyMeetingEvent", () => {
  const baseMeeting = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });

  it("increments event_count on every applied event", () => {
    const evt = makeEvent("meeting.started", {
      meeting_id:      "mtg-001",
      room_id:         "ops-control",
      initiated_by:    "manager-default",
      participant_ids: [],
    });
    const updated = applyMeetingEvent(baseMeeting, evt);
    expect(updated.event_count).toBe(1);
  });

  describe("meeting.started", () => {
    const startEvt = makeEvent("meeting.started", {
      meeting_id:      "mtg-001",
      room_id:         "research-lab",
      title:           "Research Session",
      initiated_by:    "manager-default",
      participant_ids: ["researcher-subagent", "implementer-subagent"],
    });

    it("sets stage to convene", () => {
      const m = applyMeetingEvent(baseMeeting, startEvt);
      expect(m.stage).toBe("convene");
    });

    it("sets status to convening", () => {
      const m = applyMeetingEvent(baseMeeting, startEvt);
      expect(m.status).toBe("convening");
    });

    it("populates participants from participant_ids", () => {
      const m = applyMeetingEvent(baseMeeting, startEvt);
      expect(m.participants).toHaveLength(2);
      expect(m.participants.map((p) => p.participant_id)).toContain("researcher-subagent");
    });

    it("updates room_id from event payload", () => {
      const m = applyMeetingEvent(baseMeeting, startEvt);
      expect(m.room_id).toBe("research-lab");
    });

    it("sets title from event payload", () => {
      const m = applyMeetingEvent(baseMeeting, startEvt);
      expect(m.title).toBe("Research Session");
    });

    it("is not mutated — returns new object", () => {
      const m = applyMeetingEvent(baseMeeting, startEvt);
      expect(m).not.toBe(baseMeeting);
    });
  });

  describe("meeting.participant.joined", () => {
    it("adds participant to participants list", () => {
      const evt = makeEvent("meeting.participant.joined", {
        meeting_id:       "mtg-001",
        room_id:          "ops-control",
        participant_id:   "validator-sentinel",
        participant_kind: "agent",
        role:             "observer",
      });
      const m = applyMeetingEvent(baseMeeting, evt);
      expect(m.participants).toHaveLength(1);
      expect(m.participants[0].participant_id).toBe("validator-sentinel");
      expect(m.participants[0].role).toBe("observer");
    });

    it("is idempotent for same participant_id", () => {
      const evt = makeEvent("meeting.participant.joined", {
        meeting_id:       "mtg-001",
        room_id:          "ops-control",
        participant_id:   "validator-sentinel",
        participant_kind: "agent",
      });
      const once  = applyMeetingEvent(baseMeeting, evt);
      const twice = applyMeetingEvent(once, evt);
      expect(twice.participants).toHaveLength(1);
    });
  });

  describe("meeting.participant.left", () => {
    it("removes participant from participants list", () => {
      const joined = makeEvent("meeting.participant.joined", {
        meeting_id:       "mtg-001",
        room_id:          "ops-control",
        participant_id:   "validator-sentinel",
        participant_kind: "agent",
      });
      const left = makeEvent("meeting.participant.left", {
        meeting_id:       "mtg-001",
        room_id:          "ops-control",
        participant_id:   "validator-sentinel",
        participant_kind: "agent",
      });
      const withOne = applyMeetingEvent(baseMeeting, joined);
      const withNone = applyMeetingEvent(withOne, left);
      expect(withNone.participants).toHaveLength(0);
    });
  });

  describe("meeting.deliberation", () => {
    it("advances stage from convene to deliberate", () => {
      const evt = makeEvent("meeting.deliberation", {
        meeting_id:   "mtg-001",
        room_id:      "ops-control",
        initiated_by: "manager-default",
      });
      const m = applyMeetingEvent(baseMeeting, evt);
      expect(m.stage).toBe("deliberate");
      expect(m.status).toBe("deliberating");
    });

    it("is a no-op if stage is not convene (invalid transition)", () => {
      const inResolve: Meeting = { ...baseMeeting, stage: "resolve", status: "resolving" };
      const evt = makeEvent("meeting.deliberation", {
        meeting_id:   "mtg-001",
        room_id:      "ops-control",
        initiated_by: "manager-default",
      });
      const m = applyMeetingEvent(inResolve, evt);
      // Stage should not change (resolve → deliberate is disallowed)
      expect(m.stage).toBe("resolve");
    });
  });

  describe("meeting.resolved", () => {
    it("advances stage from deliberate to resolve", () => {
      const inDeliberate: Meeting = { ...baseMeeting, stage: "deliberate", status: "deliberating" };
      const evt = makeEvent("meeting.resolved", {
        meeting_id:    "mtg-001",
        room_id:       "ops-control",
        resolution_id: "res-001",
        outcome:       "accepted",
        summary:       "Decision accepted",
        resolved_by:   "manager-default",
        decision_count: 2,
        task_count:    1,
      });
      const m = applyMeetingEvent(inDeliberate, evt);
      expect(m.stage).toBe("resolve");
      expect(m.status).toBe("resolving");
    });

    it("records resolution artefact", () => {
      const inDeliberate: Meeting = { ...baseMeeting, stage: "deliberate", status: "deliberating" };
      const evt = makeEvent("meeting.resolved", {
        meeting_id:    "mtg-001",
        room_id:       "ops-control",
        resolution_id: "res-abc",
        outcome:       "accepted",
        summary:       "Approved the plan",
        resolved_by:   "manager-default",
        decision_count: 1,
        task_count:    0,
      });
      const m = applyMeetingEvent(inDeliberate, evt);
      expect(m.resolution).not.toBeNull();
      expect(m.resolution!.resolution_id).toBe("res-abc");
      expect(m.resolution!.outcome).toBe("accepted");
    });

    it("is a no-op if stage is not deliberate (invalid transition)", () => {
      const evt = makeEvent("meeting.resolved", {
        meeting_id:    "mtg-001",
        room_id:       "ops-control",
        resolution_id: "res-001",
        outcome:       "accepted",
        summary:       "Done",
        resolved_by:   "manager-default",
        decision_count: 0,
        task_count:    0,
      });
      const m = applyMeetingEvent(baseMeeting, evt); // baseMeeting is in convene
      expect(m.stage).toBe("convene"); // unchanged
    });
  });

  describe("meeting.ended", () => {
    it("advances stage to adjourn", () => {
      const evt = makeEvent("meeting.ended", {
        meeting_id: "mtg-001",
        room_id:    "ops-control",
        outcome:    "completed",
      });
      const m = applyMeetingEvent(baseMeeting, evt);
      expect(m.stage).toBe("adjourn");
    });

    it("sets status = adjourned for outcome=completed", () => {
      const evt = makeEvent("meeting.ended", {
        meeting_id: "mtg-001",
        room_id:    "ops-control",
        outcome:    "completed",
      });
      const m = applyMeetingEvent(baseMeeting, evt);
      expect(m.status).toBe("adjourned");
    });

    it("sets status = cancelled for outcome=cancelled", () => {
      const evt = makeEvent("meeting.ended", {
        meeting_id: "mtg-001",
        room_id:    "ops-control",
        outcome:    "cancelled",
      });
      const m = applyMeetingEvent(baseMeeting, evt);
      expect(m.status).toBe("cancelled");
    });

    it("sets status = error for outcome=error", () => {
      const evt = makeEvent("meeting.ended", {
        meeting_id: "mtg-001",
        room_id:    "ops-control",
        outcome:    "error",
      });
      const m = applyMeetingEvent(baseMeeting, evt);
      expect(m.status).toBe("error");
    });

    it("sets ended_at timestamp", () => {
      const now = Date.now();
      const evt = makeEvent("meeting.ended", {
        meeting_id: "mtg-001",
        room_id:    "ops-control",
      }, now);
      const m = applyMeetingEvent(baseMeeting, evt);
      expect(m.ended_at).not.toBeNull();
    });

    it("sets outcome field", () => {
      const evt = makeEvent("meeting.ended", {
        meeting_id: "mtg-001",
        room_id:    "ops-control",
        outcome:    "timed_out",
      });
      const m = applyMeetingEvent(baseMeeting, evt);
      expect(m.outcome).toBe("timed_out");
    });
  });

  describe("unknown event types", () => {
    it("returns meeting unchanged for unrecognized event type", () => {
      const evt = makeEvent("task.created", { task_id: "t-001" });
      const m = applyMeetingEvent(baseMeeting, evt);
      expect(m.stage).toBe(baseMeeting.stage);
      expect(m.event_count).toBe(baseMeeting.event_count + 1);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. projectMeetingFromEvents
// ---------------------------------------------------------------------------

describe("projectMeetingFromEvents", () => {
  it("reconstructs empty meeting when no events match", () => {
    const m = projectMeetingFromEvents("mtg-999", "ops-control", []);
    expect(m.meeting_id).toBe("mtg-999");
    expect(m.stage).toBe("convene");
    expect(m.participants).toHaveLength(0);
  });

  it("filters out events for other meeting_ids", () => {
    const startEvt = makeEvent("meeting.started", {
      meeting_id:      "other-mtg",
      room_id:         "ops-control",
      initiated_by:    "manager-default",
      participant_ids: ["agent-x"],
    });
    const m = projectMeetingFromEvents("mtg-001", "ops-control", [startEvt]);
    // The event is for a different meeting — should not be applied
    expect(m.participants).toHaveLength(0);
  });

  it("reconstructs full lifecycle from events", () => {
    const events: ConitensEvent[] = [
      makeEvent("meeting.started", {
        meeting_id:      "mtg-001",
        room_id:         "ops-control",
        initiated_by:    "manager-default",
        participant_ids: ["manager-default"],
      }),
      makeEvent("meeting.participant.joined", {
        meeting_id:       "mtg-001",
        room_id:          "ops-control",
        participant_id:   "implementer-subagent",
        participant_kind: "agent",
        role:             "contributor",
      }),
      makeEvent("meeting.deliberation", {
        meeting_id:   "mtg-001",
        room_id:      "ops-control",
        initiated_by: "manager-default",
      }),
      makeEvent("meeting.resolved", {
        meeting_id:    "mtg-001",
        room_id:       "ops-control",
        resolution_id: "res-001",
        outcome:       "accepted",
        summary:       "Plan approved",
        resolved_by:   "manager-default",
        decision_count: 1,
        task_count:    1,
      }),
      makeEvent("meeting.ended", {
        meeting_id: "mtg-001",
        room_id:    "ops-control",
        outcome:    "completed",
      }),
    ];

    const m = projectMeetingFromEvents("mtg-001", "ops-control", events);

    expect(m.stage).toBe("adjourn");
    expect(m.status).toBe("adjourned");
    expect(m.participants).toHaveLength(2);
    expect(m.resolution).not.toBeNull();
    expect(m.resolution!.outcome).toBe("accepted");
    expect(m.event_count).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 7. advanceMeetingStage
// ---------------------------------------------------------------------------

describe("advanceMeetingStage", () => {
  it("returns new meeting with updated stage on valid transition", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    const advanced = advanceMeetingStage(m, "deliberate");
    expect(advanced).not.toBeNull();
    expect(advanced!.stage).toBe("deliberate");
    expect(advanced!.status).toBe("deliberating");
  });

  it("returns null on invalid transition", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    const result = advanceMeetingStage(m, "resolve"); // convene → resolve is invalid
    expect(result).toBeNull();
  });

  it("does not mutate the original meeting", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    advanceMeetingStage(m, "deliberate");
    expect(m.stage).toBe("convene");
  });

  it("maps STAGE_TO_STATUS correctly", () => {
    const stages: MeetingStage[] = ["convene", "deliberate", "resolve", "adjourn"];
    const expectedStatuses = ["convening", "deliberating", "resolving", "adjourned"];
    stages.forEach((stage, i) => {
      expect(STAGE_TO_STATUS[stage]).toBe(expectedStatuses[i]);
    });
  });
});

// ---------------------------------------------------------------------------
// 8. appendSpawnedTask / updateSpawnedTaskStatus
// ---------------------------------------------------------------------------

describe("appendSpawnedTask", () => {
  it("appends a task to spawned_tasks", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    const task = makeSpawnedTask();
    const updated = appendSpawnedTask(m, task);
    expect(updated.spawned_tasks).toHaveLength(1);
    expect(updated.spawned_tasks[0].task_id).toBe(task.task_id);
  });

  it("is idempotent for same task_id", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    const task = makeSpawnedTask({ task_id: "task-fixed" });
    const once = appendSpawnedTask(m, task);
    const twice = appendSpawnedTask(once, task);
    expect(twice.spawned_tasks).toHaveLength(1);
  });

  it("does not mutate original meeting", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    appendSpawnedTask(m, makeSpawnedTask());
    expect(m.spawned_tasks).toHaveLength(0);
  });
});

describe("updateSpawnedTaskStatus", () => {
  it("updates the status of an existing task", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    const task = makeSpawnedTask({ task_id: "task-123", status: "pending" });
    const withTask = appendSpawnedTask(m, task);
    const updated = updateSpawnedTaskStatus(withTask, "task-123", "completed");
    expect(updated.spawned_tasks[0].status).toBe("completed");
  });

  it("returns unchanged meeting for unknown task_id", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    const result = updateSpawnedTaskStatus(m, "nonexistent", "completed");
    expect(result).toBe(m); // same reference — no clone
  });
});

// ---------------------------------------------------------------------------
// 9. Type guards
// ---------------------------------------------------------------------------

describe("isMeeting", () => {
  it("returns true for a valid Meeting entity", () => {
    const m = createMeeting({ meeting_id: "mtg-001", room_id: "ops-control" });
    expect(isMeeting(m)).toBe(true);
  });

  it("returns false for null, number, string", () => {
    expect(isMeeting(null)).toBe(false);
    expect(isMeeting(42)).toBe(false);
    expect(isMeeting("meeting")).toBe(false);
  });

  it("returns false for an object missing required fields", () => {
    expect(isMeeting({ meeting_id: "x" })).toBe(false);
    expect(isMeeting({ meeting_id: "x", room_id: "y" })).toBe(false);
  });
});

describe("isSpawnedTask", () => {
  it("returns true for a valid SpawnedTask", () => {
    expect(isSpawnedTask(makeSpawnedTask())).toBe(true);
  });

  it("returns false for missing required fields", () => {
    expect(isSpawnedTask({ task_id: "t-001" })).toBe(false);
    expect(isSpawnedTask(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Full protocol lifecycle integration
// ---------------------------------------------------------------------------

describe("Full protocol lifecycle: convene → deliberate → resolve → adjourn", () => {
  it("can traverse the complete happy path via applyMeetingEvent", () => {
    let m = createMeeting({ meeting_id: "mtg-lifecycle", room_id: "ops-control" });

    // convene
    m = applyMeetingEvent(m, makeEvent("meeting.started", {
      meeting_id:      "mtg-lifecycle",
      room_id:         "ops-control",
      initiated_by:    "manager-default",
      participant_ids: ["manager-default", "implementer-subagent"],
    }));
    expect(m.stage).toBe("convene");
    expect(m.participants).toHaveLength(2);

    // deliberate
    m = applyMeetingEvent(m, makeEvent("meeting.deliberation", {
      meeting_id:   "mtg-lifecycle",
      room_id:      "ops-control",
      initiated_by: "manager-default",
    }));
    expect(m.stage).toBe("deliberate");
    expect(m.status).toBe("deliberating");

    // resolve
    m = applyMeetingEvent(m, makeEvent("meeting.resolved", {
      meeting_id:    "mtg-lifecycle",
      room_id:       "ops-control",
      resolution_id: "res-lifecycle",
      outcome:       "accepted",
      summary:       "All decisions accepted",
      resolved_by:   "manager-default",
      decision_count: 3,
      task_count:    2,
    }));
    expect(m.stage).toBe("resolve");
    expect(m.resolution?.outcome).toBe("accepted");

    // spawned task recorded (via appendSpawnedTask)
    m = appendSpawnedTask(m, makeSpawnedTask({ session_id: "mtg-lifecycle" }));
    expect(m.spawned_tasks).toHaveLength(1);

    // adjourn
    m = applyMeetingEvent(m, makeEvent("meeting.ended", {
      meeting_id: "mtg-lifecycle",
      room_id:    "ops-control",
      outcome:    "completed",
    }));
    expect(m.stage).toBe("adjourn");
    expect(m.status).toBe("adjourned");
    expect(isMeetingStageTerminal(m.stage)).toBe(true);

    // spawned tasks preserved through adjourn
    expect(m.spawned_tasks).toHaveLength(1);
  });

  it("can traverse the cancellation path: convene → adjourn", () => {
    let m = createMeeting({ meeting_id: "mtg-cancel", room_id: "ops-control" });

    m = applyMeetingEvent(m, makeEvent("meeting.started", {
      meeting_id:      "mtg-cancel",
      room_id:         "ops-control",
      initiated_by:    "manager-default",
      participant_ids: [],
    }));
    m = applyMeetingEvent(m, makeEvent("meeting.ended", {
      meeting_id: "mtg-cancel",
      room_id:    "ops-control",
      outcome:    "cancelled",
    }));

    expect(m.stage).toBe("adjourn");
    expect(m.status).toBe("cancelled");
  });

  it("can traverse the rejection re-floor path: deliberate → convene → deliberate → resolve → adjourn", () => {
    let m = createMeeting({ meeting_id: "mtg-reopen", room_id: "ops-control" });

    m = applyMeetingEvent(m, makeEvent("meeting.started", {
      meeting_id:      "mtg-reopen",
      room_id:         "ops-control",
      initiated_by:    "manager-default",
      participant_ids: [],
    }));

    // First deliberation attempt
    m = applyMeetingEvent(m, makeEvent("meeting.deliberation", {
      meeting_id:   "mtg-reopen",
      room_id:      "ops-control",
      initiated_by: "manager-default",
    }));
    expect(m.stage).toBe("deliberate");

    // Rejection → back to convene
    m = advanceMeetingStage(m, "convene")!;
    expect(m.stage).toBe("convene");

    // Re-deliberate
    m = applyMeetingEvent(m, makeEvent("meeting.deliberation", {
      meeting_id:   "mtg-reopen",
      room_id:      "ops-control",
      initiated_by: "manager-default",
    }));
    expect(m.stage).toBe("deliberate");

    // Resolve
    m = applyMeetingEvent(m, makeEvent("meeting.resolved", {
      meeting_id:    "mtg-reopen",
      room_id:       "ops-control",
      resolution_id: "res-reopen",
      outcome:       "accepted",
      summary:       "Re-submitted and approved",
      resolved_by:   "manager-default",
      decision_count: 1,
      task_count:    0,
    }));
    expect(m.stage).toBe("resolve");

    // Adjourn
    m = applyMeetingEvent(m, makeEvent("meeting.ended", {
      meeting_id: "mtg-reopen",
      room_id:    "ops-control",
      outcome:    "completed",
    }));
    expect(m.stage).toBe("adjourn");
  });
});
