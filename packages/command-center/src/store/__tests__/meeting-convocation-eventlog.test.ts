/**
 * @file meeting-convocation-eventlog.test.ts
 * Sub-AC 10.3 — Meeting lifecycle event_log instrumentation verification.
 *
 * Verifies that `conductMeetingConvocation()` emits all three canonical
 * event_log entries at the correct protocol transitions when an
 * `eventEmitter` is injected:
 *
 *   1. meeting.started      — emitted on convene  (step 1)
 *   2. meeting.deliberation — emitted on deliberate (step 3)
 *   3. meeting.resolved     — emitted on resolve  (step 4)
 *
 * Test strategy:
 *   - Use an in-memory stub `ConvocationEventEmitter` that captures all
 *     calls; no I/O or external dependencies required.
 *   - Run `conductMeetingConvocation()` with the stub injected.
 *   - Assert every event type is present exactly once.
 *   - Assert all events carry correct meeting entity references
 *     (meeting_id, room_id) matching the convocation parameters.
 *   - Assert events are emitted in the correct protocol order.
 *   - Assert actor attribution (`initiated_by` / `resolved_by`) is correct.
 *   - Assert backward-compatibility: absence of `eventEmitter` does not
 *     break the function.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  conductMeetingConvocation,
  type MeetingStoreInterface,
  type AgentStoreInterface,
  type MeetingConvocationParams,
  type ConvocationEventEmitter,
  type ConvocationStartedInput,
  type ConvocationDeliberationInput,
  type ConvocationResolvedInput,
} from "../meeting-convocation-orchestrator.js";
import type { Meeting, MeetingStage } from "../meeting-store.js";
import type { SessionHandle } from "../meeting-store.js";

// ---------------------------------------------------------------------------
// In-memory store stubs (identical pattern to meeting-convocation-orchestrator.test.ts)
// ---------------------------------------------------------------------------

class MeetingStoreStub implements MeetingStoreInterface {
  private sessions: Record<string, SessionHandle>  = {};
  private entities: Record<string, Meeting>        = {};

  upsertSession(handle: SessionHandle): void {
    this.sessions[handle.session_id] = handle;
    const stage: MeetingStage = "convene";
    const entity: Meeting = {
      meeting_id:            handle.session_id,
      room_id:               handle.room_id,
      title:                 handle.title ?? "",
      agenda:                "",
      stage,
      protocol_phase:        stage,
      status:                "convening",
      participants:          handle.participants.map((p) => ({
        participant_id:   p.participant_id,
        participant_kind: p.participant_kind,
        role:             p.assigned_role ?? "contributor",
      })),
      participant_agent_ids: handle.participants.map((p) => p.participant_id),
      gather_coordinates:    null,
      scheduled_at:          null,
      started_at:            handle.started_at,
      ended_at:              handle.ended_at,
      decisions:             [],
      resolution:            null,
      spawned_tasks:         [],
      spawned_task_ids:      [],
      outcome:               null,
      event_count:           1,
    };
    this.entities[handle.session_id] = entity;
  }

  progressMeetingStage(sessionId: string, newStage: MeetingStage): boolean {
    const entity = this.entities[sessionId];
    if (!entity) return false;

    const validTransitions: Record<MeetingStage, MeetingStage[]> = {
      convene:    ["deliberate", "adjourn"],
      deliberate: ["resolve", "convene"],
      resolve:    ["adjourn"],
      adjourn:    [],
    };
    if (!validTransitions[entity.stage].includes(newStage)) return false;

    const statusMap: Record<MeetingStage, Meeting["status"]> = {
      convene:    "convening",
      deliberate: "deliberating",
      resolve:    "resolving",
      adjourn:    "adjourned",
    };
    this.entities[sessionId] = { ...entity, stage: newStage, protocol_phase: newStage, status: statusMap[newStage] };
    return true;
  }

  recordSpawnedTask(sessionId: string, task: { task_id: string; [k: string]: unknown }): void {
    const entity = this.entities[sessionId];
    if (!entity || entity.spawned_task_ids.includes(task.task_id)) return;
    this.entities[sessionId] = { ...entity, spawned_task_ids: [...entity.spawned_task_ids, task.task_id] };
  }

  getMeetingEntity(sessionId: string): Meeting | undefined {
    return this.entities[sessionId];
  }
}

class AgentStoreStub implements AgentStoreInterface {
  gatherAgentsForMeeting(_mid: string, _rid: string, _ids: string[]): void {}
  disperseAgentsFromMeeting(_mid: string): void {}
}

// ---------------------------------------------------------------------------
// In-memory ConvocationEventEmitter stub — captures all logged events
// ---------------------------------------------------------------------------

/**
 * Captured event record stored by the stub emitter.
 * Stores the event type and the raw input so tests can inspect every field.
 */
interface CapturedEvent {
  type: "meeting.started" | "meeting.deliberation" | "meeting.resolved";
  input: ConvocationStartedInput | ConvocationDeliberationInput | ConvocationResolvedInput;
  /** Index in the overall capture sequence (0-based). */
  seq: number;
}

/**
 * Synchronous in-memory stub of `ConvocationEventEmitter`.
 *
 * Each call appends a `CapturedEvent` to `events[]`.  Tests inspect this
 * array to verify correct emission behaviour without any I/O.
 */
class StubEventEmitter implements ConvocationEventEmitter {
  readonly events: CapturedEvent[] = [];
  private _seq = 0;

  logStarted(input: ConvocationStartedInput): void {
    this.events.push({ type: "meeting.started",     input, seq: this._seq++ });
  }

  logDeliberation(input: ConvocationDeliberationInput): void {
    this.events.push({ type: "meeting.deliberation", input, seq: this._seq++ });
  }

  logResolved(input: ConvocationResolvedInput): void {
    this.events.push({ type: "meeting.resolved",     input, seq: this._seq++ });
  }

  /** Helper: return the subset of captured events matching a given type. */
  byType(type: CapturedEvent["type"]): CapturedEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /** Helper: return the single captured event of the given type (asserts exactly one). */
  single(type: CapturedEvent["type"]): CapturedEvent {
    const found = this.byType(type);
    if (found.length !== 1) {
      throw new Error(`Expected exactly 1 event of type "${type}" but got ${found.length}`);
    }
    return found[0];
  }
}

// ---------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------

function makeMeetingStore(): MeetingStoreStub { return new MeetingStoreStub(); }
function makeAgentStore():   AgentStoreStub   { return new AgentStoreStub();   }
function makeEmitter():      StubEventEmitter { return new StubEventEmitter();  }

function makeParams(
  meetingStore: MeetingStoreInterface,
  agentStore:   AgentStoreInterface,
  emitter:      ConvocationEventEmitter | undefined,
  overrides:    Partial<MeetingConvocationParams> = {},
): MeetingConvocationParams {
  return {
    meetingId:      "mtg-eventlog-test-001",
    roomId:         "ops-control",
    title:          "Eventlog Instrumentation Test",
    agenda:         "Verify event log emission",
    participantIds: ["manager-default", "implementer-subagent"],
    resolveTask:    { title: "Follow-up action", assignedTo: "implementer-subagent" },
    initiatedBy:    "manager-default",
    eventEmitter:   emitter,
    meetingStore,
    agentStore,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Core: all three event types are emitted
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — Sub-AC 10.3: event_log emission", () => {
  let emitter:      StubEventEmitter;
  let meetingStore: MeetingStoreStub;
  let agentStore:   AgentStoreStub;

  beforeEach(() => {
    emitter      = makeEmitter();
    meetingStore = makeMeetingStore();
    agentStore   = makeAgentStore();
  });

  // ── All three event types are emitted ──────────────────────────────────

  it("emits exactly one meeting.started event after a convocation run", () => {
    conductMeetingConvocation(makeParams(meetingStore, agentStore, emitter));

    const started = emitter.byType("meeting.started");
    expect(started).toHaveLength(1);
  });

  it("emits exactly one meeting.deliberation event after a convocation run", () => {
    conductMeetingConvocation(makeParams(meetingStore, agentStore, emitter));

    const deliberations = emitter.byType("meeting.deliberation");
    expect(deliberations).toHaveLength(1);
  });

  it("emits exactly one meeting.resolved event after a convocation run", () => {
    conductMeetingConvocation(makeParams(meetingStore, agentStore, emitter));

    const resolved = emitter.byType("meeting.resolved");
    expect(resolved).toHaveLength(1);
  });

  it("emits all three event types in a single convocation run", () => {
    conductMeetingConvocation(makeParams(meetingStore, agentStore, emitter));

    const types = emitter.events.map((e) => e.type);
    expect(types).toContain("meeting.started");
    expect(types).toContain("meeting.deliberation");
    expect(types).toContain("meeting.resolved");
    expect(emitter.events).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// meeting.started — correct meeting entity references
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — meeting.started event correctness", () => {
  it("meeting.started carries correct meeting_id (matches Meeting entity)", () => {
    const emitter      = makeEmitter();
    const meetingStore = makeMeetingStore();
    const params       = makeParams(meetingStore, makeAgentStore(), emitter, {
      meetingId: "mtg-ref-check-started",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.started");
    const input = ev.input as ConvocationStartedInput;
    expect(input.meeting_id).toBe("mtg-ref-check-started");

    // The captured meeting_id must equal the Meeting entity's meeting_id
    const entity = meetingStore.getMeetingEntity("mtg-ref-check-started");
    expect(entity).toBeDefined();
    expect(input.meeting_id).toBe(entity!.meeting_id);
  });

  it("meeting.started carries correct room_id (matches Meeting entity)", () => {
    const emitter      = makeEmitter();
    const meetingStore = makeMeetingStore();
    const params       = makeParams(meetingStore, makeAgentStore(), emitter, {
      meetingId: "mtg-room-check",
      roomId:    "strategy-room",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.started");
    const input = ev.input as ConvocationStartedInput;
    expect(input.room_id).toBe("strategy-room");

    const entity = meetingStore.getMeetingEntity("mtg-room-check");
    expect(input.room_id).toBe(entity!.room_id);
  });

  it("meeting.started carries correct participant_ids", () => {
    const emitter      = makeEmitter();
    const participants = ["agent-alpha", "agent-beta", "agent-gamma"];
    const params       = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      meetingId:      "mtg-participants",
      participantIds: participants,
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.started");
    const input = ev.input as ConvocationStartedInput;
    expect(input.participant_ids).toEqual(expect.arrayContaining(participants));
    expect(input.participant_ids).toHaveLength(3);
  });

  it("meeting.started carries correct initiated_by from initiatedBy param", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      initiatedBy: "researcher-default",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.started");
    const input = ev.input as ConvocationStartedInput;
    expect(input.initiated_by).toBe("researcher-default");
  });

  it("meeting.started falls back to first participant when initiatedBy is not set", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      initiatedBy:    undefined,
      participantIds: ["first-participant", "second-participant"],
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.started");
    const input = ev.input as ConvocationStartedInput;
    expect(input.initiated_by).toBe("first-participant");
  });

  it("meeting.started falls back to system sentinel when both initiatedBy and participants are absent", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      initiatedBy:    undefined,
      participantIds: [],
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.started");
    const input = ev.input as ConvocationStartedInput;
    expect(input.initiated_by).toBe("system");
  });

  it("meeting.started carries the meeting title", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      title: "Sprint Retrospective",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.started");
    const input = ev.input as ConvocationStartedInput;
    expect(input.title).toBe("Sprint Retrospective");
  });
});

// ---------------------------------------------------------------------------
// meeting.deliberation — correct meeting entity references
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — meeting.deliberation event correctness", () => {
  it("meeting.deliberation carries correct meeting_id", () => {
    const emitter      = makeEmitter();
    const meetingStore = makeMeetingStore();
    const params       = makeParams(meetingStore, makeAgentStore(), emitter, {
      meetingId: "mtg-delib-check",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.deliberation");
    const input = ev.input as ConvocationDeliberationInput;
    expect(input.meeting_id).toBe("mtg-delib-check");

    // Cross-reference: matches the Meeting entity
    const entity = meetingStore.getMeetingEntity("mtg-delib-check");
    expect(input.meeting_id).toBe(entity!.meeting_id);
  });

  it("meeting.deliberation carries correct room_id", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      roomId: "board-room",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.deliberation");
    const input = ev.input as ConvocationDeliberationInput;
    expect(input.room_id).toBe("board-room");
  });

  it("meeting.deliberation carries correct initiated_by actor", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      initiatedBy: "validator-default",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.deliberation");
    const input = ev.input as ConvocationDeliberationInput;
    expect(input.initiated_by).toBe("validator-default");
  });

  it("meeting.deliberation meeting_id and room_id match the started event", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      meetingId: "mtg-consistency-check",
      roomId:    "research-lab",
    });

    conductMeetingConvocation(params);

    const started      = emitter.single("meeting.started").input      as ConvocationStartedInput;
    const deliberation = emitter.single("meeting.deliberation").input  as ConvocationDeliberationInput;

    expect(deliberation.meeting_id).toBe(started.meeting_id);
    expect(deliberation.room_id).toBe(started.room_id);
  });
});

// ---------------------------------------------------------------------------
// meeting.resolved — correct meeting entity references
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — meeting.resolved event correctness", () => {
  it("meeting.resolved carries correct meeting_id", () => {
    const emitter      = makeEmitter();
    const meetingStore = makeMeetingStore();
    const params       = makeParams(meetingStore, makeAgentStore(), emitter, {
      meetingId: "mtg-resolved-check",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.resolved");
    const input = ev.input as ConvocationResolvedInput;
    expect(input.meeting_id).toBe("mtg-resolved-check");

    // Cross-reference: matches the Meeting entity
    const entity = meetingStore.getMeetingEntity("mtg-resolved-check");
    expect(input.meeting_id).toBe(entity!.meeting_id);
  });

  it("meeting.resolved carries correct room_id", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      roomId: "conference-hall",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.resolved");
    const input = ev.input as ConvocationResolvedInput;
    expect(input.room_id).toBe("conference-hall");
  });

  it("meeting.resolved carries a non-empty resolution_id", () => {
    const emitter = makeEmitter();
    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter));

    const ev    = emitter.single("meeting.resolved");
    const input = ev.input as ConvocationResolvedInput;
    expect(typeof input.resolution_id).toBe("string");
    expect(input.resolution_id.length).toBeGreaterThan(0);
    expect(input.resolution_id).toMatch(/^res-/);
  });

  it("meeting.resolved outcome is 'accepted' (convocation always succeeds)", () => {
    const emitter = makeEmitter();
    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter));

    const ev    = emitter.single("meeting.resolved");
    const input = ev.input as ConvocationResolvedInput;
    expect(input.outcome).toBe("accepted");
  });

  it("meeting.resolved task_count is 1 (one task always spawned)", () => {
    const emitter = makeEmitter();
    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter));

    const ev    = emitter.single("meeting.resolved");
    const input = ev.input as ConvocationResolvedInput;
    expect(input.task_count).toBe(1);
  });

  it("meeting.resolved carries the resolve task title as summary", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      resolveTask: { title: "Implement the Roadmap", assignedTo: "implementer-subagent" },
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.resolved");
    const input = ev.input as ConvocationResolvedInput;
    expect(input.summary).toBe("Implement the Roadmap");
  });

  it("meeting.resolved carries correct resolved_by actor", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      initiatedBy: "manager-default",
    });

    conductMeetingConvocation(params);

    const ev    = emitter.single("meeting.resolved");
    const input = ev.input as ConvocationResolvedInput;
    expect(input.resolved_by).toBe("manager-default");
  });

  it("meeting.resolved meeting_id and room_id match started and deliberation events", () => {
    const emitter = makeEmitter();
    const params  = makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      meetingId: "mtg-triple-ref-check",
      roomId:    "ops-room",
    });

    conductMeetingConvocation(params);

    const started      = emitter.single("meeting.started").input      as ConvocationStartedInput;
    const deliberation = emitter.single("meeting.deliberation").input  as ConvocationDeliberationInput;
    const resolved     = emitter.single("meeting.resolved").input      as ConvocationResolvedInput;

    // All three events must reference the same meeting and room
    expect(resolved.meeting_id).toBe(started.meeting_id);
    expect(resolved.meeting_id).toBe(deliberation.meeting_id);
    expect(resolved.room_id).toBe(started.room_id);
    expect(resolved.room_id).toBe(deliberation.room_id);
  });
});

// ---------------------------------------------------------------------------
// Event ordering — emitted at the correct protocol transitions
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — event emission order", () => {
  it("events are emitted in protocol order: started → deliberation → resolved", () => {
    const emitter = makeEmitter();
    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter));

    const orderedTypes = emitter.events.map((e) => e.type);
    expect(orderedTypes).toEqual([
      "meeting.started",
      "meeting.deliberation",
      "meeting.resolved",
    ]);
  });

  it("meeting.started is emitted before the protocol reaches deliberate", () => {
    const emitter = makeEmitter();
    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter));

    const startedSeq      = emitter.single("meeting.started").seq;
    const deliberationSeq = emitter.single("meeting.deliberation").seq;
    expect(startedSeq).toBeLessThan(deliberationSeq);
  });

  it("meeting.deliberation is emitted before meeting.resolved", () => {
    const emitter = makeEmitter();
    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter));

    const deliberationSeq = emitter.single("meeting.deliberation").seq;
    const resolvedSeq     = emitter.single("meeting.resolved").seq;
    expect(deliberationSeq).toBeLessThan(resolvedSeq);
  });
});

// ---------------------------------------------------------------------------
// Cross-event consistency — same actor attributed to all three events
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — actor attribution consistency", () => {
  it("all three events share the same actor ID", () => {
    const emitter = makeEmitter();
    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter, {
      initiatedBy: "researcher-default",
    }));

    const started      = emitter.single("meeting.started").input      as ConvocationStartedInput;
    const deliberation = emitter.single("meeting.deliberation").input  as ConvocationDeliberationInput;
    const resolved     = emitter.single("meeting.resolved").input      as ConvocationResolvedInput;

    expect(started.initiated_by).toBe("researcher-default");
    expect(deliberation.initiated_by).toBe("researcher-default");
    expect(resolved.resolved_by).toBe("researcher-default");
  });

  it("actor is consistent across multiple independent convocations", () => {
    const emitter1 = makeEmitter();
    const emitter2 = makeEmitter();

    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter1, {
      meetingId:   "mtg-actor-1",
      initiatedBy: "agent-x",
    }));
    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter2, {
      meetingId:   "mtg-actor-2",
      initiatedBy: "agent-y",
    }));

    expect((emitter1.single("meeting.started").input as ConvocationStartedInput).initiated_by).toBe("agent-x");
    expect((emitter2.single("meeting.started").input as ConvocationStartedInput).initiated_by).toBe("agent-y");
  });
});

// ---------------------------------------------------------------------------
// Integration: all three events + meeting entity cross-reference
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — full lifecycle event log verification", () => {
  it("all three events reference the same Meeting entity after a full run", () => {
    const emitter      = makeEmitter();
    const meetingStore = makeMeetingStore();
    const meetingId    = "mtg-full-eventlog-verify";
    const roomId       = "collaboration-suite";

    conductMeetingConvocation(makeParams(meetingStore, makeAgentStore(), emitter, {
      meetingId,
      roomId,
      title:          "Full Lifecycle Event Log Test",
      agenda:         "Verify all three events reference entity correctly",
      participantIds: ["manager-default", "implementer-subagent", "researcher-default"],
      initiatedBy:    "manager-default",
      resolveTask:    { title: "Deliver the feature", assignedTo: "implementer-subagent" },
    }));

    // The Meeting entity should exist and be in the final adjourned state
    const entity = meetingStore.getMeetingEntity(meetingId);
    expect(entity).toBeDefined();
    expect(entity!.stage).toBe("adjourn");

    // All three events must be present
    expect(emitter.events).toHaveLength(3);

    const started      = emitter.single("meeting.started").input      as ConvocationStartedInput;
    const deliberation = emitter.single("meeting.deliberation").input  as ConvocationDeliberationInput;
    const resolved     = emitter.single("meeting.resolved").input      as ConvocationResolvedInput;

    // Verify meeting entity references in every event
    expect(started.meeting_id).toBe(entity!.meeting_id);
    expect(started.room_id).toBe(entity!.room_id);
    expect(deliberation.meeting_id).toBe(entity!.meeting_id);
    expect(deliberation.room_id).toBe(entity!.room_id);
    expect(resolved.meeting_id).toBe(entity!.meeting_id);
    expect(resolved.room_id).toBe(entity!.room_id);
  });

  it("resolution_id in meeting.resolved is unique per convocation run", () => {
    const emitter1 = makeEmitter();
    const emitter2 = makeEmitter();

    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter1, {
      meetingId: "mtg-uid-1",
    }));
    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), emitter2, {
      meetingId: "mtg-uid-2",
    }));

    const res1 = (emitter1.single("meeting.resolved").input as ConvocationResolvedInput).resolution_id;
    const res2 = (emitter2.single("meeting.resolved").input as ConvocationResolvedInput).resolution_id;

    expect(res1).not.toBe(res2);
  });

  it("two concurrent convocations emit independent meeting_id references", () => {
    const emitter1     = makeEmitter();
    const emitter2     = makeEmitter();
    const meetingStore = makeMeetingStore(); // shared store — different meeting IDs

    conductMeetingConvocation(makeParams(meetingStore, makeAgentStore(), emitter1, {
      meetingId: "mtg-concurrent-a",
      roomId:    "room-a",
    }));
    conductMeetingConvocation(makeParams(meetingStore, makeAgentStore(), emitter2, {
      meetingId: "mtg-concurrent-b",
      roomId:    "room-b",
    }));

    const startedA = emitter1.single("meeting.started").input as ConvocationStartedInput;
    const startedB = emitter2.single("meeting.started").input as ConvocationStartedInput;

    expect(startedA.meeting_id).toBe("mtg-concurrent-a");
    expect(startedA.room_id).toBe("room-a");
    expect(startedB.meeting_id).toBe("mtg-concurrent-b");
    expect(startedB.room_id).toBe("room-b");
  });
});

// ---------------------------------------------------------------------------
// Backward-compatibility: absence of eventEmitter does not break function
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — backward-compatibility without eventEmitter", () => {
  it("does not throw when eventEmitter is not provided", () => {
    const meetingStore = makeMeetingStore();
    const agentStore   = makeAgentStore();
    const params       = makeParams(meetingStore, agentStore, undefined);

    expect(() => conductMeetingConvocation(params)).not.toThrow();
  });

  it("returns the correct result when eventEmitter is not provided", () => {
    const meetingStore = makeMeetingStore();
    const agentStore   = makeAgentStore();
    const params       = makeParams(meetingStore, agentStore, undefined, {
      meetingId:      "mtg-no-emitter",
      participantIds: ["agent-a"],
    });

    const result = conductMeetingConvocation(params);

    expect(result.meetingId).toBe("mtg-no-emitter");
    expect(result.stages).toEqual(["convene", "deliberate", "resolve", "adjourn"]);
    expect(result.spawnedTaskId).toBeTruthy();
    expect(result.gatheringRecorded).toBe(true);
  });

  it("entity still reaches adjourn stage without eventEmitter", () => {
    const meetingStore = makeMeetingStore();
    conductMeetingConvocation(makeParams(meetingStore, makeAgentStore(), undefined, {
      meetingId: "mtg-no-emitter-stage",
    }));

    const entity = meetingStore.getMeetingEntity("mtg-no-emitter-stage");
    expect(entity?.stage).toBe("adjourn");
  });
});

// ---------------------------------------------------------------------------
// Async eventEmitter: fire-and-forget calls do not block
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — async eventEmitter compatibility", () => {
  it("works correctly when emitter methods return Promises", async () => {
    const capturedEvents: string[] = [];

    const asyncEmitter: ConvocationEventEmitter = {
      async logStarted()     { capturedEvents.push("meeting.started"); },
      async logDeliberation(){ capturedEvents.push("meeting.deliberation"); },
      async logResolved()    { capturedEvents.push("meeting.resolved"); },
    };

    conductMeetingConvocation(makeParams(makeMeetingStore(), makeAgentStore(), asyncEmitter));

    // Let the microtask queue drain so async calls have completed
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(capturedEvents).toContain("meeting.started");
    expect(capturedEvents).toContain("meeting.deliberation");
    expect(capturedEvents).toContain("meeting.resolved");
  });

  it("does not throw if async emitter logStarted rejects", async () => {
    const rejectingEmitter: ConvocationEventEmitter = {
      logStarted()     { return Promise.reject(new Error("log failure")); },
      logDeliberation(){ return Promise.resolve(); },
      logResolved()    { return Promise.resolve(); },
    };

    // conductMeetingConvocation uses void — rejections must not propagate
    expect(() => conductMeetingConvocation(
      makeParams(makeMeetingStore(), makeAgentStore(), rejectingEmitter),
    )).not.toThrow();

    // Let microtasks settle (rejection is swallowed by void)
    await new Promise((r) => setTimeout(r, 5));
  });
});
