/**
 * state-reconstruction-engine.test.ts — Unit tests for Sub-AC 9b.
 *
 * Tests the pure deterministic state-reconstruction engine that replays
 * TypedReplayEvent sequences to produce scene-state snapshots at any
 * given timestamp.
 *
 * Test ID scheme:
 *   9s-N : Sub-AC 9b state-reconstruction engine tests
 *
 * Coverage:
 *   9s-1  : emptySceneState — initial state shape
 *   9s-2  : reconstructStateAt — empty events array
 *   9s-3  : reconstructStateAt — single agent.spawned event
 *   9s-4  : reconstructStateAt — timestamp boundary (events after targetTs are excluded)
 *   9s-5  : agent lifecycle sequence (spawned → error → terminated)
 *   9s-6  : agent.moved updates both agent.roomId and room.activeMembers
 *   9s-7  : agent.task.started / agent.task.completed
 *   9s-8  : command lifecycle (issued → completed / failed / rejected)
 *   9s-9  : pipeline lifecycle (started → step → completed / failed)
 *   9s-10 : task lifecycle (created → assigned → status_changed → completed)
 *   9s-11 : meeting lifecycle (started → participant.joined → participant.left → ended)
 *   9s-12 : buildCheckpoints — checkpoint interval and state accuracy
 *   9s-13 : buildCheckpoints accelerates reconstructStateAt (same result)
 *   9s-14 : determinism — same events always produce same output
 *   9s-15 : event order independence — unsorted input produces same result as sorted
 *   9s-16 : forward-compatibility — unknown event types are skipped
 *   9s-17 : traceAgentRoomHistory
 *   9s-18 : listAgentIds
 *   9s-19 : buildFullTimeline — incremental snapshot count
 *   9s-20 : multiple agents in multiple rooms
 *   9s-21 : agent.status_changed updates status correctly
 *   9s-22 : agent.lifecycle.changed updates lifecycleState
 *   9s-23 : task.cancelled sets status to "cancelled"
 *   9s-24 : reconstructStateAt with targetTs before first event returns empty state
 *   9s-25 : checkpoint is found via binary search for large event stream
 */

import { describe, it, expect } from "vitest";
import {
  reconstructStateAt,
  buildCheckpoints,
  buildFullTimeline,
  emptySceneState,
  traceAgentRoomHistory,
  listAgentIds,
  DEFAULT_CHECKPOINT_INTERVAL,
  type ReconstructedSceneState,
} from "../state-reconstruction-engine.js";
import type {
  TypedReplayEvent,
  AgentLifecycleReplayEvent,
  CommandReplayEvent,
  StateChangeReplayEvent,
} from "../event-log-schema.js";

// ── Test helpers ────────────────────────────────────────────────────────────

let _seq = 0;
let _ts = 1_000_000; // baseline Unix ms

function nextSeq() {
  return ++_seq;
}
function advanceTs(ms = 100) {
  _ts += ms;
  return _ts;
}

function resetCounters() {
  _seq = 0;
  _ts = 1_000_000;
}

/** Build a minimal valid actor object */
function actor(kind: "system" | "agent" | "user" = "system", id = "orchestrator") {
  return { kind, id } as const;
}

/** Build a minimal ConitensEvent envelope */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRaw(type: string, payload: Record<string, unknown>, tsMs: number): any {
  return {
    schema: "conitens.event.v1",
    event_id: `evt-${type}-${tsMs}`,
    type,
    ts: new Date(tsMs).toISOString(),
    run_id: "run-test",
    actor: actor(),
    payload,
  };
}

/** Build an AgentLifecycleReplayEvent */
function makeAgentEvent(
  type: string,
  agentId: string,
  payload: Record<string, unknown> = {},
  tsMs?: number,
): AgentLifecycleReplayEvent {
  const ts = tsMs ?? advanceTs();
  const fullPayload = { agent_id: agentId, ...payload };
  return {
    replayCategory: "agent_lifecycle",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: type as any,
    ts: new Date(ts).toISOString(),
    tsMs: ts,
    actor: actor("agent", agentId),
    run_id: "run-test",
    seq: nextSeq(),
    raw: makeRaw(type, fullPayload, ts),
    typedPayload: fullPayload as never,
    agentId,
  };
}

/** Build a CommandReplayEvent */
function makeCommandEvent(
  type: string,
  commandId: string | undefined,
  pipelineId: string | undefined,
  payload: Record<string, unknown> = {},
  tsMs?: number,
): CommandReplayEvent {
  const ts = tsMs ?? advanceTs();
  return {
    replayCategory: "command",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: type as any,
    ts: new Date(ts).toISOString(),
    tsMs: ts,
    actor: actor(),
    run_id: "run-test",
    seq: nextSeq(),
    raw: makeRaw(type, payload, ts),
    typedPayload: payload as never,
    commandId,
    pipelineId,
  };
}

/** Build a StateChangeReplayEvent */
function makeStateEvent(
  type: string,
  domain: string,
  payload: Record<string, unknown> = {},
  tsMs?: number,
  taskId?: string,
): StateChangeReplayEvent {
  const ts = tsMs ?? advanceTs();
  return {
    replayCategory: "state_change",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: type as any,
    ts: new Date(ts).toISOString(),
    tsMs: ts,
    actor: actor(),
    run_id: "run-test",
    seq: nextSeq(),
    raw: makeRaw(type, payload, ts),
    typedPayload: payload,
    domain,
    taskId,
  };
}

// ── 9s-1: emptySceneState ──────────────────────────────────────────────────

describe("emptySceneState (9s-1)", () => {
  it("returns an object with all required top-level fields", () => {
    const s = emptySceneState();
    expect(s).toHaveProperty("ts");
    expect(s).toHaveProperty("seq");
    expect(s).toHaveProperty("eventsApplied");
    expect(s).toHaveProperty("agents");
    expect(s).toHaveProperty("rooms");
    expect(s).toHaveProperty("tasks");
    expect(s).toHaveProperty("commands");
    expect(s).toHaveProperty("pipelines");
  });

  it("starts with empty collections", () => {
    const s = emptySceneState();
    expect(Object.keys(s.agents)).toHaveLength(0);
    expect(Object.keys(s.rooms)).toHaveLength(0);
    expect(Object.keys(s.tasks)).toHaveLength(0);
    expect(Object.keys(s.commands)).toHaveLength(0);
    expect(Object.keys(s.pipelines)).toHaveLength(0);
  });

  it("seq is 0 initially", () => {
    expect(emptySceneState().seq).toBe(0);
  });

  it("eventsApplied is 0 initially", () => {
    expect(emptySceneState().eventsApplied).toBe(0);
  });

  it("accepts a custom ts argument", () => {
    expect(emptySceneState(12345).ts).toBe(12345);
  });
});

// ── 9s-2: reconstructStateAt — empty events ────────────────────────────────

describe("reconstructStateAt with empty events (9s-2)", () => {
  it("returns empty state for empty events array", () => {
    const s = reconstructStateAt([], 999_999);
    expect(Object.keys(s.agents)).toHaveLength(0);
    expect(s.seq).toBe(0);
    expect(s.eventsApplied).toBe(0);
  });

  it("does not throw for empty events array", () => {
    expect(() => reconstructStateAt([], 0)).not.toThrow();
  });
});

// ── 9s-3: single agent.spawned event ──────────────────────────────────────

describe("single agent.spawned event (9s-3)", () => {
  it("creates an agent entry with correct initial fields", () => {
    resetCounters();
    const ev = makeAgentEvent("agent.spawned", "agent-a", { persona: "implementer" });
    const s = reconstructStateAt([ev], ev.tsMs);

    expect(s.agents["agent-a"]).toBeDefined();
    expect(s.agents["agent-a"].agentId).toBe("agent-a");
    expect(s.agents["agent-a"].status).toBe("idle");
    expect(s.agents["agent-a"].lifecycleState).toBe("ready");
    expect(s.agents["agent-a"].errorCount).toBe(0);
    expect(s.agents["agent-a"].currentTaskId).toBeNull();
  });

  it("sets seq and eventsApplied to 1 after a single event", () => {
    resetCounters();
    const ev = makeAgentEvent("agent.spawned", "agent-b");
    const s = reconstructStateAt([ev], ev.tsMs);
    expect(s.eventsApplied).toBe(1);
  });
});

// ── 9s-4: timestamp boundary ──────────────────────────────────────────────

describe("timestamp boundary (9s-4)", () => {
  it("excludes events strictly after targetTs", () => {
    resetCounters();
    const ts1 = 1_000_100;
    const ts2 = 1_000_500;
    const spawn = makeAgentEvent("agent.spawned", "agent-c", {}, ts1);
    const terminated = makeAgentEvent("agent.terminated", "agent-c", {}, ts2);

    // reconstruct at ts1 — only spawn applied
    const s = reconstructStateAt([spawn, terminated], ts1);
    expect(s.agents["agent-c"].status).toBe("idle");
  });

  it("includes events exactly at targetTs", () => {
    resetCounters();
    const ts = 1_000_200;
    const spawn = makeAgentEvent("agent.spawned", "agent-d", {}, ts);
    const s = reconstructStateAt([spawn], ts);
    expect(s.agents["agent-d"]).toBeDefined();
  });

  it("returns empty state when targetTs is before first event", () => {
    resetCounters();
    const ev = makeAgentEvent("agent.spawned", "agent-e", {}, 2_000_000);
    const s = reconstructStateAt([ev], 1_000_000);
    expect(Object.keys(s.agents)).toHaveLength(0);
  });
});

// ── 9s-5: agent lifecycle sequence ────────────────────────────────────────

describe("agent lifecycle sequence (9s-5)", () => {
  it("spawned → error → terminated tracks errorCount and final status", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "ag1"),
      makeAgentEvent("agent.error", "ag1"),
      makeAgentEvent("agent.error", "ag1"),
      makeAgentEvent("agent.terminated", "ag1"),
    ];
    const s = reconstructStateAt(events, events[events.length - 1].tsMs);
    expect(s.agents["ag1"].status).toBe("terminated");
    expect(s.agents["ag1"].errorCount).toBe(2);
    expect(s.agents["ag1"].lifecycleState).toBe("terminated");
  });

  it("re-spawn resets errorCount to 0", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "ag2"),
      makeAgentEvent("agent.error", "ag2"),
      makeAgentEvent("agent.spawned", "ag2"), // re-spawn
    ];
    const s = reconstructStateAt(events, events[events.length - 1].tsMs);
    expect(s.agents["ag2"].errorCount).toBe(0);
    expect(s.agents["ag2"].status).toBe("idle");
  });
});

// ── 9s-6: agent.moved and room membership ─────────────────────────────────

describe("agent.moved updates rooms (9s-6)", () => {
  it("sets agent.roomId to to_room", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "mover"),
      makeAgentEvent("agent.moved", "mover", { to_room: "room-a", from_room: null }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.agents["mover"].roomId).toBe("room-a");
  });

  it("adds agent to new room's activeMembers", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "mover2"),
      makeAgentEvent("agent.moved", "mover2", { to_room: "room-b" }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.rooms["room-b"].activeMembers).toContain("mover2");
  });

  it("removes agent from previous room's activeMembers on second move", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "traveler"),
      makeAgentEvent("agent.moved", "traveler", { to_room: "room-x" }),
      makeAgentEvent("agent.moved", "traveler", { to_room: "room-y", from_room: "room-x" }),
    ];
    const s = reconstructStateAt(events, events[events.length - 1].tsMs);
    expect(s.agents["traveler"].roomId).toBe("room-y");
    expect(s.rooms["room-x"]?.activeMembers ?? []).not.toContain("traveler");
    expect(s.rooms["room-y"].activeMembers).toContain("traveler");
  });

  it("room activity is 'active' after agent moves in", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "worker"),
      makeAgentEvent("agent.moved", "worker", { to_room: "room-active" }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.rooms["room-active"].activity).toBe("active");
  });
});

// ── 9s-7: task start / complete ───────────────────────────────────────────

describe("agent.task.started and agent.task.completed (9s-7)", () => {
  it("task.started sets agent status to active and currentTaskId", () => {
    resetCounters();
    const taskId = "task-001";
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "worker"),
      makeStateEvent("task.created", "task", { task_id: taskId, title: "My Task" }),
      makeAgentEvent("agent.task.started", "worker", { task_id: taskId }),
    ];
    const s = reconstructStateAt(events, events[events.length - 1].tsMs);
    expect(s.agents["worker"].status).toBe("active");
    expect(s.agents["worker"].currentTaskId).toBe(taskId);
  });

  it("task.completed sets agent status to idle and clears currentTaskId", () => {
    resetCounters();
    const taskId = "task-002";
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "worker2"),
      makeStateEvent("task.created", "task", { task_id: taskId, title: "Task 2" }),
      makeAgentEvent("agent.task.started", "worker2", { task_id: taskId }),
      makeAgentEvent("agent.task.completed", "worker2", {
        task_id: taskId,
        outcome: "success",
      }),
    ];
    const s = reconstructStateAt(events, events[events.length - 1].tsMs);
    expect(s.agents["worker2"].status).toBe("idle");
    expect(s.agents["worker2"].currentTaskId).toBeNull();
  });

  it("task outcome failure sets task status to failed", () => {
    resetCounters();
    const taskId = "task-fail";
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "worker3"),
      makeStateEvent("task.created", "task", { task_id: taskId, title: "Failing Task" }),
      makeAgentEvent("agent.task.started", "worker3", { task_id: taskId }),
      makeAgentEvent("agent.task.completed", "worker3", {
        task_id: taskId,
        outcome: "failure",
      }),
    ];
    const s = reconstructStateAt(events, events[events.length - 1].tsMs);
    expect(s.tasks[taskId].status).toBe("failed");
  });
});

// ── 9s-8: command lifecycle ────────────────────────────────────────────────

describe("command lifecycle (9s-8)", () => {
  it("command.issued creates a pending command entry", () => {
    resetCounters();
    const cmdId = "cmd-001";
    const events: TypedReplayEvent[] = [
      makeCommandEvent("command.issued", cmdId, undefined, {
        command_id: cmdId,
        command_type: "agent.spawn",
        source: "gui",
        input: {},
      }),
    ];
    const s = reconstructStateAt(events, events[0].tsMs);
    expect(s.commands[cmdId]).toBeDefined();
    expect(s.commands[cmdId].status).toBe("pending");
    expect(s.commands[cmdId].commandType).toBe("agent.spawn");
    expect(s.commands[cmdId].source).toBe("gui");
    expect(s.commands[cmdId].resolvedTs).toBeNull();
  });

  it("command.completed resolves the command", () => {
    resetCounters();
    const cmdId = "cmd-002";
    const events: TypedReplayEvent[] = [
      makeCommandEvent("command.issued", cmdId, undefined, {
        command_id: cmdId,
        command_type: "agent.stop",
        source: "cli",
        input: {},
      }),
      makeCommandEvent("command.completed", cmdId, undefined, { command_id: cmdId }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.commands[cmdId].status).toBe("completed");
    expect(s.commands[cmdId].resolvedTs).not.toBeNull();
  });

  it("command.failed sets status to failed", () => {
    resetCounters();
    const cmdId = "cmd-003";
    const events: TypedReplayEvent[] = [
      makeCommandEvent("command.issued", cmdId, undefined, {
        command_id: cmdId,
        command_type: "agent.spawn",
        source: "api",
        input: {},
      }),
      makeCommandEvent("command.failed", cmdId, undefined, {
        command_id: cmdId,
        reason: "quota exceeded",
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.commands[cmdId].status).toBe("failed");
  });

  it("command.rejected sets status to rejected", () => {
    resetCounters();
    const cmdId = "cmd-004";
    const events: TypedReplayEvent[] = [
      makeCommandEvent("command.issued", cmdId, undefined, {
        command_id: cmdId,
        command_type: "agent.spawn",
        source: "gui",
        input: {},
      }),
      makeCommandEvent("command.rejected", cmdId, undefined, {
        command_id: cmdId,
        reason: "unauthorized",
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.commands[cmdId].status).toBe("rejected");
  });
});

// ── 9s-9: pipeline lifecycle ───────────────────────────────────────────────

describe("pipeline lifecycle (9s-9)", () => {
  it("pipeline.started creates a running pipeline entry with steps", () => {
    resetCounters();
    const pipeId = "pipe-001";
    const events: TypedReplayEvent[] = [
      makeCommandEvent("pipeline.started", undefined, pipeId, {
        pipeline_id: pipeId,
        pipeline_name: "agent-bootstrap",
        steps: ["validate", "spawn", "assign"],
      }),
    ];
    const s = reconstructStateAt(events, events[0].tsMs);
    expect(s.pipelines[pipeId]).toBeDefined();
    expect(s.pipelines[pipeId].status).toBe("running");
    expect(s.pipelines[pipeId].pipelineName).toBe("agent-bootstrap");
    expect(s.pipelines[pipeId].steps).toEqual(["validate", "spawn", "assign"]);
    expect(s.pipelines[pipeId].currentStep).toBe("validate");
  });

  it("pipeline.step updates currentStep", () => {
    resetCounters();
    const pipeId = "pipe-002";
    const events: TypedReplayEvent[] = [
      makeCommandEvent("pipeline.started", undefined, pipeId, {
        pipeline_id: pipeId,
        pipeline_name: "deploy",
        steps: ["build", "test", "deploy"],
      }),
      makeCommandEvent("pipeline.step", undefined, pipeId, {
        pipeline_id: pipeId,
        step_name: "test",
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.pipelines[pipeId].currentStep).toBe("test");
  });

  it("pipeline.completed marks as completed and clears currentStep", () => {
    resetCounters();
    const pipeId = "pipe-003";
    const events: TypedReplayEvent[] = [
      makeCommandEvent("pipeline.started", undefined, pipeId, {
        pipeline_id: pipeId,
        pipeline_name: "run-tests",
        steps: ["setup", "run"],
      }),
      makeCommandEvent("pipeline.completed", undefined, pipeId, {
        pipeline_id: pipeId,
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.pipelines[pipeId].status).toBe("completed");
    expect(s.pipelines[pipeId].currentStep).toBeNull();
    expect(s.pipelines[pipeId].endTs).not.toBeNull();
  });

  it("pipeline.failed marks as failed", () => {
    resetCounters();
    const pipeId = "pipe-004";
    const events: TypedReplayEvent[] = [
      makeCommandEvent("pipeline.started", undefined, pipeId, {
        pipeline_id: pipeId,
        pipeline_name: "risky-op",
        steps: ["step1"],
      }),
      makeCommandEvent("pipeline.failed", undefined, pipeId, {
        pipeline_id: pipeId,
        error: "timeout",
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.pipelines[pipeId].status).toBe("failed");
  });
});

// ── 9s-10: task lifecycle ─────────────────────────────────────────────────

describe("task lifecycle (9s-10)", () => {
  it("task.created adds task with correct title and pending status", () => {
    resetCounters();
    const taskId = "t-001";
    const events: TypedReplayEvent[] = [
      makeStateEvent("task.created", "task", { task_id: taskId, title: "Build feature" }),
    ];
    const s = reconstructStateAt(events, events[0].tsMs);
    expect(s.tasks[taskId].title).toBe("Build feature");
    expect(s.tasks[taskId].status).toBe("pending");
    expect(s.tasks[taskId].assignedAgentId).toBeNull();
  });

  it("task.assigned sets assignedAgentId", () => {
    resetCounters();
    const taskId = "t-002";
    const events: TypedReplayEvent[] = [
      makeStateEvent("task.created", "task", { task_id: taskId, title: "Review PR" }),
      makeStateEvent("task.assigned", "task", { task_id: taskId, agent_id: "reviewer" }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.tasks[taskId].assignedAgentId).toBe("reviewer");
  });

  it("task.status_changed updates status", () => {
    resetCounters();
    const taskId = "t-003";
    const events: TypedReplayEvent[] = [
      makeStateEvent("task.created", "task", { task_id: taskId, title: "Deploy" }),
      makeStateEvent("task.status_changed", "task", {
        task_id: taskId,
        status: "in_progress",
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.tasks[taskId].status).toBe("in_progress");
  });

  it("task.completed sets status to completed", () => {
    resetCounters();
    const taskId = "t-004";
    const events: TypedReplayEvent[] = [
      makeStateEvent("task.created", "task", { task_id: taskId, title: "Write tests" }),
      makeStateEvent("task.completed", "task", { task_id: taskId }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.tasks[taskId].status).toBe("completed");
  });
});

// ── 9s-11: meeting lifecycle ──────────────────────────────────────────────

describe("meeting lifecycle (9s-11)", () => {
  it("meeting.started sets room activity to 'meeting' and meetingId", () => {
    resetCounters();
    const meetingId = "meet-001";
    const roomId = "room-conf";
    const events: TypedReplayEvent[] = [
      makeStateEvent("meeting.started", "meeting", { meeting_id: meetingId, room_id: roomId }),
    ];
    const s = reconstructStateAt(events, events[0].tsMs);
    expect(s.rooms[roomId].activity).toBe("meeting");
    expect(s.rooms[roomId].meetingId).toBe(meetingId);
  });

  it("meeting.participant.joined adds agent to room", () => {
    resetCounters();
    const meetingId = "meet-002";
    const roomId = "room-sync";
    const events: TypedReplayEvent[] = [
      makeStateEvent("meeting.started", "meeting", { meeting_id: meetingId, room_id: roomId }),
      makeStateEvent("meeting.participant.joined", "meeting", {
        meeting_id: meetingId,
        room_id: roomId,
        agent_id: "attendee-1",
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.rooms[roomId].activeMembers).toContain("attendee-1");
  });

  it("meeting.participant.left removes agent from room", () => {
    resetCounters();
    const meetingId = "meet-003";
    const roomId = "room-standup";
    const events: TypedReplayEvent[] = [
      makeStateEvent("meeting.started", "meeting", { meeting_id: meetingId, room_id: roomId }),
      makeStateEvent("meeting.participant.joined", "meeting", {
        meeting_id: meetingId,
        room_id: roomId,
        agent_id: "early-leaver",
      }),
      makeStateEvent("meeting.participant.left", "meeting", {
        meeting_id: meetingId,
        room_id: roomId,
        agent_id: "early-leaver",
      }),
    ];
    const s = reconstructStateAt(events, events[events.length - 1].tsMs);
    expect(s.rooms[roomId].activeMembers).not.toContain("early-leaver");
  });

  it("meeting.ended clears meetingId and resets activity", () => {
    resetCounters();
    const meetingId = "meet-004";
    const roomId = "room-retro";
    const events: TypedReplayEvent[] = [
      makeStateEvent("meeting.started", "meeting", { meeting_id: meetingId, room_id: roomId }),
      makeStateEvent("meeting.ended", "meeting", { meeting_id: meetingId, room_id: roomId }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.rooms[roomId].meetingId).toBeNull();
    expect(s.rooms[roomId].activity).toBe("idle");
  });
});

// ── 9s-12: buildCheckpoints ────────────────────────────────────────────────

describe("buildCheckpoints (9s-12)", () => {
  it("returns empty array for empty event stream", () => {
    expect(buildCheckpoints([], 10)).toHaveLength(0);
  });

  it("produces one checkpoint per intervalSeq events", () => {
    resetCounters();
    const events: TypedReplayEvent[] = Array.from({ length: 100 }, (_, i) =>
      makeAgentEvent("agent.spawned", `agent-${i}`),
    );
    const checkpoints = buildCheckpoints(events, 10);
    expect(checkpoints).toHaveLength(10);
  });

  it("checkpoint ts matches the last event applied at that point", () => {
    resetCounters();
    const events: TypedReplayEvent[] = Array.from({ length: 10 }, () =>
      makeAgentEvent("agent.heartbeat", "ping"),
    );
    const checkpoints = buildCheckpoints(events, 5);
    // First checkpoint after event[4]
    expect(checkpoints[0].ts).toBe(events[4].tsMs);
    expect(checkpoints[0].eventsArrayIndex).toBe(4);
  });

  it("checkpoint state contains agents spawned up to that point", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "alpha"),
      makeAgentEvent("agent.spawned", "beta"),
      makeAgentEvent("agent.spawned", "gamma"),
      makeAgentEvent("agent.spawned", "delta"),
      makeAgentEvent("agent.spawned", "epsilon"), // checkpoint here at index 4
    ];
    const checkpoints = buildCheckpoints(events, 5);
    expect(checkpoints).toHaveLength(1);
    expect(Object.keys(checkpoints[0].state.agents)).toHaveLength(5);
  });

  it("uses DEFAULT_CHECKPOINT_INTERVAL when interval not provided", () => {
    resetCounters();
    const events: TypedReplayEvent[] = Array.from(
      { length: DEFAULT_CHECKPOINT_INTERVAL },
      (_, i) => makeAgentEvent("agent.heartbeat", `ag${i}`),
    );
    const checkpoints = buildCheckpoints(events);
    expect(checkpoints).toHaveLength(1);
  });
});

// ── 9s-13: checkpoint acceleration — same result ──────────────────────────

describe("buildCheckpoints accelerates reconstructStateAt (9s-13)", () => {
  it("produces the same result with and without checkpoints", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "a1"),
      makeAgentEvent("agent.moved", "a1", { to_room: "room-1" }),
      makeAgentEvent("agent.spawned", "a2"),
      makeAgentEvent("agent.moved", "a2", { to_room: "room-2" }),
      makeAgentEvent("agent.status_changed", "a1", { status: "active", prev_status: "idle" }),
      makeStateEvent("task.created", "task", { task_id: "t1", title: "Task One" }),
      makeStateEvent("task.assigned", "task", { task_id: "t1", agent_id: "a1" }),
      makeAgentEvent("agent.task.started", "a1", { task_id: "t1" }),
      makeAgentEvent("agent.task.completed", "a1", { task_id: "t1", outcome: "success" }),
      makeAgentEvent("agent.spawned", "a3"),
    ];

    const targetTs = events[events.length - 1].tsMs;
    const checkpoints = buildCheckpoints(events, 3);

    const withoutCheckpoints = reconstructStateAt(events, targetTs);
    const withCheckpoints = reconstructStateAt(events, targetTs, checkpoints);

    // Structural equality (deep)
    expect(withCheckpoints.agents).toEqual(withoutCheckpoints.agents);
    expect(withCheckpoints.rooms).toEqual(withoutCheckpoints.rooms);
    expect(withCheckpoints.tasks).toEqual(withoutCheckpoints.tasks);
  });
});

// ── 9s-14: determinism ─────────────────────────────────────────────────────

describe("determinism (9s-14)", () => {
  it("calling reconstructStateAt twice with same arguments produces identical results", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "det1"),
      makeAgentEvent("agent.moved", "det1", { to_room: "room-det" }),
      makeStateEvent("task.created", "task", { task_id: "det-task", title: "Deterministic" }),
    ];
    const ts = events[events.length - 1].tsMs;

    const s1 = reconstructStateAt(events, ts);
    const s2 = reconstructStateAt(events, ts);

    expect(s1).toEqual(s2);
  });
});

// ── 9s-15: event order independence ───────────────────────────────────────

describe("event order independence (9s-15)", () => {
  it("unsorted input produces the same result as sorted input", () => {
    resetCounters();
    const ev1 = makeAgentEvent("agent.spawned", "sort-test", {}, 1_001_000);
    const ev2 = makeAgentEvent("agent.moved", "sort-test", { to_room: "r1" }, 1_002_000);
    const ev3 = makeAgentEvent("agent.status_changed", "sort-test", { status: "active" }, 1_003_000);

    const sorted = [ev1, ev2, ev3];
    const reversed = [ev3, ev2, ev1];

    const ts = 1_003_000;
    const s1 = reconstructStateAt(sorted, ts);
    const s2 = reconstructStateAt(reversed, ts);

    expect(s1.agents["sort-test"].status).toBe(s2.agents["sort-test"].status);
    expect(s1.agents["sort-test"].roomId).toBe(s2.agents["sort-test"].roomId);
  });
});

// ── 9s-16: forward-compatibility ──────────────────────────────────────────

describe("forward-compatibility with unknown event types (9s-16)", () => {
  it("unknown agent event type is skipped without throwing", () => {
    resetCounters();
    const unknownEv = makeAgentEvent("agent.future_event_type_2099", "fwd-agent");
    const spawnEv = makeAgentEvent("agent.spawned", "fwd-agent", {}, unknownEv.tsMs - 100);

    expect(() => reconstructStateAt([spawnEv, unknownEv], unknownEv.tsMs)).not.toThrow();
  });

  it("unknown state_change domain is skipped without throwing", () => {
    resetCounters();
    const futureEv = makeStateEvent(
      "quantum.entanglement_detected",
      "quantum",
      { qubits: 42 },
    );
    expect(() => reconstructStateAt([futureEv], futureEv.tsMs)).not.toThrow();
  });

  it("known events still apply correctly when interleaved with unknown events", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "known"),
      makeAgentEvent("agent.unknown_future_type", "known"),
      makeAgentEvent("agent.moved", "known", { to_room: "room-known" }),
    ];
    const s = reconstructStateAt(events, events[2].tsMs);
    expect(s.agents["known"].roomId).toBe("room-known");
  });
});

// ── 9s-17: traceAgentRoomHistory ──────────────────────────────────────────

describe("traceAgentRoomHistory (9s-17)", () => {
  it("returns empty array for agent with no movement events", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "stationary"),
    ];
    expect(traceAgentRoomHistory(events, "stationary")).toHaveLength(0);
  });

  it("returns chronological room moves", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "traveler"),
      makeAgentEvent("agent.moved", "traveler", { to_room: "room-a" }),
      makeAgentEvent("agent.moved", "traveler", { to_room: "room-b" }),
      makeAgentEvent("agent.moved", "traveler", { to_room: "room-c" }),
    ];
    const history = traceAgentRoomHistory(events, "traveler");
    expect(history).toHaveLength(3);
    expect(history.map((h) => h.roomId)).toEqual(["room-a", "room-b", "room-c"]);
  });

  it("includes assigned events in history", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "assignee"),
      makeAgentEvent("agent.assigned", "assignee", { room_id: "assigned-room" }),
    ];
    const history = traceAgentRoomHistory(events, "assignee");
    expect(history).toHaveLength(1);
    expect(history[0].roomId).toBe("assigned-room");
  });

  it("filters by agentId — other agents' moves are not included", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "alice"),
      makeAgentEvent("agent.moved", "alice", { to_room: "room-alice" }),
      makeAgentEvent("agent.spawned", "bob"),
      makeAgentEvent("agent.moved", "bob", { to_room: "room-bob" }),
    ];
    const aliceHistory = traceAgentRoomHistory(events, "alice");
    expect(aliceHistory.every((h) => h.roomId === "room-alice")).toBe(true);
  });
});

// ── 9s-18: listAgentIds ───────────────────────────────────────────────────

describe("listAgentIds (9s-18)", () => {
  it("returns empty array for empty events", () => {
    expect(listAgentIds([])).toHaveLength(0);
  });

  it("returns unique agent IDs in appearance order", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "a"),
      makeAgentEvent("agent.spawned", "b"),
      makeAgentEvent("agent.heartbeat", "a"), // duplicate — should not appear twice
      makeAgentEvent("agent.spawned", "c"),
    ];
    const ids = listAgentIds(events);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("only includes agents from agent_lifecycle events", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeStateEvent("task.created", "task", { task_id: "t1", title: "T" }),
      makeAgentEvent("agent.spawned", "only-agent"),
    ];
    const ids = listAgentIds(events);
    expect(ids).toEqual(["only-agent"]);
  });
});

// ── 9s-19: buildFullTimeline ──────────────────────────────────────────────

describe("buildFullTimeline (9s-19)", () => {
  it("returns empty array for empty events", () => {
    expect(buildFullTimeline([])).toHaveLength(0);
  });

  it("returns one snapshot per event", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "tl1"),
      makeAgentEvent("agent.spawned", "tl2"),
      makeAgentEvent("agent.spawned", "tl3"),
    ];
    const timeline = buildFullTimeline(events);
    expect(timeline).toHaveLength(3);
  });

  it("each snapshot is deterministically derived from events up to that point", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "s1"),
      makeAgentEvent("agent.spawned", "s2"),
    ];
    const timeline = buildFullTimeline(events);

    // After first event: s1 exists
    expect(timeline[0].snapshot.agents["s1"]).toBeDefined();
    expect(timeline[0].snapshot.agents["s2"]).toBeUndefined();

    // After second event: both exist
    expect(timeline[1].snapshot.agents["s1"]).toBeDefined();
    expect(timeline[1].snapshot.agents["s2"]).toBeDefined();
  });
});

// ── 9s-20: multiple agents in multiple rooms ──────────────────────────────

describe("multiple agents in multiple rooms (9s-20)", () => {
  it("tracks each agent independently in their respective rooms", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "dev1"),
      makeAgentEvent("agent.spawned", "dev2"),
      makeAgentEvent("agent.spawned", "manager"),
      makeAgentEvent("agent.moved", "dev1", { to_room: "dev-room" }),
      makeAgentEvent("agent.moved", "dev2", { to_room: "dev-room" }),
      makeAgentEvent("agent.moved", "manager", { to_room: "exec-room" }),
    ];
    const s = reconstructStateAt(events, events[events.length - 1].tsMs);

    expect(s.rooms["dev-room"].activeMembers).toHaveLength(2);
    expect(s.rooms["dev-room"].activeMembers).toContain("dev1");
    expect(s.rooms["dev-room"].activeMembers).toContain("dev2");
    expect(s.rooms["exec-room"].activeMembers).toHaveLength(1);
    expect(s.rooms["exec-room"].activeMembers).toContain("manager");
  });
});

// ── 9s-21: agent.status_changed ──────────────────────────────────────────

describe("agent.status_changed (9s-21)", () => {
  it("updates agent status correctly", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "status-test"),
      makeAgentEvent("agent.status_changed", "status-test", {
        status: "busy",
        prev_status: "idle",
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.agents["status-test"].status).toBe("busy");
  });
});

// ── 9s-22: agent.lifecycle.changed ────────────────────────────────────────

describe("agent.lifecycle.changed (9s-22)", () => {
  it("updates lifecycleState and maps to correct status", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "lifecycle-test"),
      makeAgentEvent("agent.lifecycle.changed", "lifecycle-test", {
        new_state: "active",
        prev_state: "ready",
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.agents["lifecycle-test"].lifecycleState).toBe("active");
    expect(s.agents["lifecycle-test"].status).toBe("active");
  });

  it("maps 'terminated' lifecycle state to 'terminated' status", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "dying"),
      makeAgentEvent("agent.lifecycle.changed", "dying", {
        new_state: "terminated",
        prev_state: "active",
      }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.agents["dying"].status).toBe("terminated");
  });
});

// ── 9s-23: task.cancelled ─────────────────────────────────────────────────

describe("task.cancelled (9s-23)", () => {
  it("sets task status to 'cancelled'", () => {
    resetCounters();
    const taskId = "cancelled-task";
    const events: TypedReplayEvent[] = [
      makeStateEvent("task.created", "task", { task_id: taskId, title: "Will be cancelled" }),
      makeStateEvent("task.cancelled", "task", { task_id: taskId }),
    ];
    const s = reconstructStateAt(events, events[1].tsMs);
    expect(s.tasks[taskId].status).toBe("cancelled");
  });
});

// ── 9s-24: targetTs before first event ────────────────────────────────────

describe("targetTs before first event returns empty state (9s-24)", () => {
  it("returns no agents when targetTs precedes all events", () => {
    resetCounters();
    const events: TypedReplayEvent[] = [
      makeAgentEvent("agent.spawned", "future-agent", {}, 9_000_000),
    ];
    const s = reconstructStateAt(events, 1_000_000);
    expect(Object.keys(s.agents)).toHaveLength(0);
  });
});

// ── 9s-25: checkpoint binary search for large stream ──────────────────────

describe("checkpoint binary search for large event stream (9s-25)", () => {
  it("finds correct checkpoint for mid-stream targetTs", () => {
    resetCounters();
    // 200 events, checkpoints every 20
    const events: TypedReplayEvent[] = Array.from({ length: 200 }, (_, i) =>
      makeAgentEvent("agent.spawned", `ag${i}`),
    );
    const checkpoints = buildCheckpoints(events, 20);
    expect(checkpoints).toHaveLength(10);

    // Reconstruct at event[99].tsMs — should use checkpoint at index 4 (events[79..99])
    const targetTs = events[99].tsMs;
    const s = reconstructStateAt(events, targetTs, checkpoints);

    // First 100 events should be visible (agents ag0..ag99)
    expect(Object.keys(s.agents)).toHaveLength(100);
    // ag100 (event[100]) should not be visible
    expect(s.agents["ag100"]).toBeUndefined();
  });

  it("reconstructStateAt result with checkpoints matches result without checkpoints for any targetTs", () => {
    resetCounters();
    const events: TypedReplayEvent[] = Array.from({ length: 150 }, (_, i) =>
      makeAgentEvent(
        i % 3 === 0 ? "agent.spawned" : i % 3 === 1 ? "agent.heartbeat" : "agent.error",
        `bot-${Math.floor(i / 3)}`,
      ),
    );
    const checkpoints = buildCheckpoints(events, 25);

    // Test at multiple target timestamps
    const testPoints = [events[24].tsMs, events[74].tsMs, events[149].tsMs];

    for (const targetTs of testPoints) {
      const withoutCP = reconstructStateAt(events, targetTs);
      const withCP = reconstructStateAt(events, targetTs, checkpoints);
      expect(withCP.agents).toEqual(withoutCP.agents);
    }
  });
});
