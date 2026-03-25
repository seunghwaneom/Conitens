/**
 * @file meeting-convocation-orchestrator.test.ts
 * Sub-AC 10.2 — Meeting convocation logic integration tests.
 *
 * Validates that `conductMeetingConvocation()` satisfies all four
 * requirements of Sub-AC 2 in a single end-to-end flow:
 *
 *   1. Instantiates a Meeting entity (convene stage).
 *   2. Transitions protocol_phase through convene → deliberate → resolve → adjourn.
 *   3. Spatially repositions participant agents to a shared gather point.
 *   4. Appends at least one spawned_task_id to the entity on resolve.
 *
 * Tests use stub implementations of the store interfaces to avoid
 * requiring real Zustand store setup.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  conductMeetingConvocation,
  type MeetingStoreInterface,
  type AgentStoreInterface,
  type MeetingConvocationParams,
} from "../meeting-convocation-orchestrator.js";
import type { Meeting, MeetingStage } from "../meeting-store.js";
import type { SessionHandle } from "../meeting-store.js";

// ---------------------------------------------------------------------------
// Store stubs
// ---------------------------------------------------------------------------

/**
 * In-memory stub of `useMeetingStore` for use in tests.
 * Implements the `MeetingStoreInterface` without a real Zustand store.
 */
class MeetingStoreStub implements MeetingStoreInterface {
  private sessions: Record<string, SessionHandle> = {};
  private meetingEntities: Record<string, Meeting> = {};
  private spawnedTasks: Record<string, string[]> = {};

  upsertSession(handle: SessionHandle): void {
    this.sessions[handle.session_id] = handle;

    // Create a minimal Meeting entity in convene stage
    const stage: MeetingStage = handle.status === "ended" ? "adjourn" : "convene";
    const entity: Meeting = {
      meeting_id:            handle.session_id,
      room_id:               handle.room_id,
      title:                 handle.title ?? "",
      agenda:                "",
      stage,
      protocol_phase:        stage,
      status:                stage === "adjourn" ? "adjourned" : "convening",
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
    this.meetingEntities[handle.session_id] = entity;
  }

  progressMeetingStage(sessionId: string, newStage: MeetingStage): boolean {
    const entity = this.meetingEntities[sessionId];
    if (!entity) return false;

    // Simple forward-only validation (mirrors VALID_MEETING_STAGE_TRANSITIONS)
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

    this.meetingEntities[sessionId] = {
      ...entity,
      stage:          newStage,
      protocol_phase: newStage,
      status:         statusMap[newStage],
    };
    return true;
  }

  recordSpawnedTask(sessionId: string, task: { task_id: string; [key: string]: unknown }): void {
    const entity = this.meetingEntities[sessionId];
    if (!entity) return;

    // Idempotent
    if (entity.spawned_task_ids.includes(task.task_id)) return;

    this.meetingEntities[sessionId] = {
      ...entity,
      spawned_task_ids: [...entity.spawned_task_ids, task.task_id],
    };
  }

  getMeetingEntity(sessionId: string): Meeting | undefined {
    return this.meetingEntities[sessionId];
  }
}

/**
 * In-memory stub of `useAgentStore` for use in tests.
 */
class AgentStoreStub implements AgentStoreInterface {
  gatheredMeetings:  Record<string, { meetingId: string; roomId: string; participantIds: string[] }> = {};
  dispersedMeetings: string[] = [];

  gatherAgentsForMeeting(meetingId: string, meetingRoomId: string, participantIds: string[]): void {
    this.gatheredMeetings[meetingId] = { meetingId, roomId: meetingRoomId, participantIds };
  }

  disperseAgentsFromMeeting(meetingId: string): void {
    this.dispersedMeetings.push(meetingId);
    delete this.gatheredMeetings[meetingId];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(
  meetingStore: MeetingStoreInterface,
  agentStore:   AgentStoreInterface,
  overrides:    Partial<MeetingConvocationParams> = {},
): MeetingConvocationParams {
  return {
    meetingId:      "mtg-test-convocation",
    roomId:         "ops-control",
    title:          "Test Convocation Meeting",
    agenda:         "Test the convocation logic",
    participantIds: ["manager-default", "implementer-subagent"],
    resolveTask: {
      title:      "Implement the agreed plan",
      assignedTo: "implementer-subagent",
      priority:   3,
    },
    meetingStore,
    agentStore,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — requirement 1: Meeting entity instantiation", () => {
  it("creates a Meeting entity in the convene stage", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    conductMeetingConvocation(params);

    const entity = meetingStore.getMeetingEntity(params.meetingId);
    expect(entity).toBeDefined();
    expect(entity?.meeting_id).toBe(params.meetingId);
    expect(entity?.room_id).toBe(params.roomId);
  });

  it("entity title matches the convocation title", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore, { title: "Custom Title" });

    conductMeetingConvocation(params);

    const entity = meetingStore.getMeetingEntity(params.meetingId);
    expect(entity?.title).toBe("Custom Title");
  });

  it("entity participants list matches participantIds", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore, {
      participantIds: ["agent-a", "agent-b", "agent-c"],
    });

    conductMeetingConvocation(params);

    const entity = meetingStore.getMeetingEntity(params.meetingId);
    expect(entity?.participant_agent_ids).toEqual(
      expect.arrayContaining(["agent-a", "agent-b", "agent-c"]),
    );
    expect(entity?.participant_agent_ids).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — requirement 2: stage transitions", () => {
  it("traverses all four stages: convene → deliberate → resolve → adjourn", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    const result = conductMeetingConvocation(params);

    expect(result.stages).toHaveLength(4);
    expect(result.stages[0]).toBe("convene");
    expect(result.stages[1]).toBe("deliberate");
    expect(result.stages[2]).toBe("resolve");
    expect(result.stages[3]).toBe("adjourn");
  });

  it("final entity is in the adjourn stage", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    conductMeetingConvocation(params);

    const entity = meetingStore.getMeetingEntity(params.meetingId);
    expect(entity?.stage).toBe("adjourn");
    expect(entity?.protocol_phase).toBe("adjourn");
  });

  it("stage and protocol_phase are always in sync", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    conductMeetingConvocation(params);

    const entity = meetingStore.getMeetingEntity(params.meetingId);
    expect(entity?.stage).toBe(entity?.protocol_phase);
  });

  it("result.stages array preserves the convene stage even when it was the initial state", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    const result = conductMeetingConvocation(params);

    // Convene was the initial stage — it must still appear in the stages list
    expect(result.stages).toContain("convene");
  });

  it("status after adjourn is adjourned", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    conductMeetingConvocation(params);

    const entity = meetingStore.getMeetingEntity(params.meetingId);
    expect(entity?.status).toBe("adjourned");
  });
});

// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — requirement 3: spatial repositioning", () => {
  it("gathers agents for the meeting", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    const result = conductMeetingConvocation(params);

    expect(result.gatheringRecorded).toBe(true);
  });

  it("calls gatherAgentsForMeeting with the correct meeting ID and room", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub() as AgentStoreStub & AgentStoreInterface;
    const params       = makeParams(meetingStore, agentStore);

    // Capture gathering calls
    const gatherCalls: Array<{ meetingId: string; roomId: string; participants: string[] }> = [];
    const spy: AgentStoreInterface = {
      gatherAgentsForMeeting(meetingId, roomId, participants) {
        gatherCalls.push({ meetingId, roomId, participants });
        agentStore.gatherAgentsForMeeting(meetingId, roomId, participants);
      },
      disperseAgentsFromMeeting: agentStore.disperseAgentsFromMeeting.bind(agentStore),
    };

    conductMeetingConvocation({ ...params, agentStore: spy });

    expect(gatherCalls).toHaveLength(1);
    expect(gatherCalls[0].meetingId).toBe(params.meetingId);
    expect(gatherCalls[0].roomId).toBe(params.roomId);
  });

  it("passes all participant IDs to gatherAgentsForMeeting", () => {
    const meetingStore = new MeetingStoreStub();
    const participants = ["agent-a", "agent-b", "agent-c"];
    const gatherCalls: string[][] = [];
    const agentStore: AgentStoreInterface = {
      gatherAgentsForMeeting(_mid, _rid, ids) { gatherCalls.push(ids); },
      disperseAgentsFromMeeting() {},
    };
    const params = makeParams(meetingStore, agentStore, { participantIds: participants });

    conductMeetingConvocation(params);

    expect(gatherCalls[0]).toEqual(expect.arrayContaining(participants));
  });

  it("disperses agents at the end of the convocation (adjourn)", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    conductMeetingConvocation(params);

    expect(agentStore.dispersedMeetings).toContain(params.meetingId);
  });

  it("does not gather if participantIds is empty", () => {
    const meetingStore = new MeetingStoreStub();
    const gatherCalls: number[] = [];
    const agentStore: AgentStoreInterface = {
      gatherAgentsForMeeting() { gatherCalls.push(1); },
      disperseAgentsFromMeeting() {},
    };
    const params = makeParams(meetingStore, agentStore, { participantIds: [] });

    const result = conductMeetingConvocation(params);

    expect(result.gatheringRecorded).toBe(false);
    expect(gatherCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — requirement 4: spawned_task_id on resolve", () => {
  it("appends at least one spawned_task_id to the entity", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    conductMeetingConvocation(params);

    const entity = meetingStore.getMeetingEntity(params.meetingId);
    expect(entity?.spawned_task_ids).toBeDefined();
    expect(entity?.spawned_task_ids.length).toBeGreaterThanOrEqual(1);
  });

  it("result.spawnedTaskId is a non-empty string", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    const result = conductMeetingConvocation(params);

    expect(typeof result.spawnedTaskId).toBe("string");
    expect(result.spawnedTaskId.length).toBeGreaterThan(0);
  });

  it("the spawned task ID appears in entity.spawned_task_ids", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    const result = conductMeetingConvocation(params);

    const entity = meetingStore.getMeetingEntity(params.meetingId);
    expect(entity?.spawned_task_ids).toContain(result.spawnedTaskId);
  });

  it("spawned task title matches the resolveTask.title parameter", () => {
    const meetingStore = new MeetingStoreStub();
    const recordedTasks: Array<{ session_id: string; task_id: string; title: string }> = [];

    const capturingStore: MeetingStoreInterface = {
      upsertSession:        meetingStore.upsertSession.bind(meetingStore),
      progressMeetingStage: meetingStore.progressMeetingStage.bind(meetingStore),
      getMeetingEntity:     meetingStore.getMeetingEntity.bind(meetingStore),
      recordSpawnedTask(sessionId, task) {
        recordedTasks.push({
          session_id: sessionId,
          task_id:    task.task_id,
          title:      task.title,
        });
        meetingStore.recordSpawnedTask(sessionId, task);
      },
    };

    const agentStore = new AgentStoreStub();
    const params     = makeParams(capturingStore, agentStore, {
      resolveTask: { title: "Write unit tests", assignedTo: "validator-subagent" },
    });

    conductMeetingConvocation(params);

    expect(recordedTasks).toHaveLength(1);
    expect(recordedTasks[0].title).toBe("Write unit tests");
    expect(recordedTasks[0].session_id).toBe(params.meetingId);
  });

  it("spawned task survives through the adjourn stage", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    conductMeetingConvocation(params);

    // Entity should be in adjourn AND still have the task
    const entity = meetingStore.getMeetingEntity(params.meetingId);
    expect(entity?.stage).toBe("adjourn");
    expect(entity?.spawned_task_ids.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — integration: all four requirements together", () => {
  it("full lifecycle: entity created + all stages traversed + agents gathered + task spawned", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore, {
      meetingId:      "mtg-full-integration",
      roomId:         "research-lab",
      participantIds: ["researcher-1", "researcher-2"],
      resolveTask: {
        title:      "Implement research findings",
        assignedTo: "researcher-1",
        priority:   2,
      },
    });

    const result = conductMeetingConvocation(params);

    // Req 1: Meeting entity was created
    expect(result.finalEntity).toBeDefined();
    expect(result.finalEntity?.meeting_id).toBe("mtg-full-integration");
    expect(result.finalEntity?.room_id).toBe("research-lab");

    // Req 2: All four stages traversed
    expect(result.stages).toEqual(["convene", "deliberate", "resolve", "adjourn"]);
    expect(result.finalEntity?.stage).toBe("adjourn");
    expect(result.finalEntity?.protocol_phase).toBe("adjourn");

    // Req 3: Agents were gathered (and then dispersed)
    expect(result.gatheringRecorded).toBe(true);
    expect(agentStore.dispersedMeetings).toContain("mtg-full-integration");

    // Req 4: spawned_task_id appended on resolve
    expect(result.spawnedTaskId).toBeTruthy();
    expect(result.finalEntity?.spawned_task_ids).toContain(result.spawnedTaskId);
    expect(result.finalEntity?.spawned_task_ids.length).toBeGreaterThanOrEqual(1);
  });

  it("two consecutive convocations produce independent meeting entities", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();

    const result1 = conductMeetingConvocation(makeParams(meetingStore, agentStore, {
      meetingId:   "mtg-conv-1",
      resolveTask: { title: "Task A", assignedTo: "agent-a" },
    }));

    const result2 = conductMeetingConvocation(makeParams(meetingStore, agentStore, {
      meetingId:   "mtg-conv-2",
      resolveTask: { title: "Task B", assignedTo: "agent-b" },
    }));

    // Each meeting has its own entity
    expect(result1.meetingId).toBe("mtg-conv-1");
    expect(result2.meetingId).toBe("mtg-conv-2");
    expect(result1.spawnedTaskId).not.toBe(result2.spawnedTaskId);
    expect(result1.finalEntity?.spawned_task_ids[0]).not.toBe(result2.finalEntity?.spawned_task_ids[0]);
  });

  it("returns a result object with all required fields defined", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);

    const result = conductMeetingConvocation(params);

    expect(result.meetingId).toBeDefined();
    expect(result.stages).toBeDefined();
    expect(result.spawnedTaskId).toBeDefined();
    expect(typeof result.gatheringRecorded).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------

describe("conductMeetingConvocation — gather point", () => {
  it("accepts a gatherPoint without error", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore, {
      gatherPoint: { x: 0.25, y: 0, z: 0.75 },
    });

    // Should not throw
    expect(() => conductMeetingConvocation(params)).not.toThrow();
  });

  it("proceeds normally when gatherPoint is undefined (uses default centroid)", () => {
    const meetingStore = new MeetingStoreStub();
    const agentStore   = new AgentStoreStub();
    const params       = makeParams(meetingStore, agentStore);
    // gatherPoint is not provided (undefined)

    const result = conductMeetingConvocation(params);

    expect(result.stages).toHaveLength(4);
    expect(result.gatheringRecorded).toBe(true);
  });
});
