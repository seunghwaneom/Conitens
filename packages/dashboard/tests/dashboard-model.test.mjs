import test from "node:test";
import assert from "node:assert/strict";
import {
  getActiveTaskCount,
  getOfficeSnapshot,
  getOverviewActions,
  getPriorityTasks,
  deriveDashboardMetrics,
  getConnectionPresentation,
  getQueuedTasks,
  getRecentEvents,
  getRuntimeLedger,
  getTabBadges,
  resolveDashboardData,
} from "../src/dashboard-model.ts";
import { demoAgents, demoEvents, demoTasks } from "../src/demo-data.ts";

test("resolveDashboardData falls back to demo data when live store is empty", () => {
  const resolved = resolveDashboardData(
    { tasks: [], agents: [], events: [] },
    { tasks: demoTasks, agents: demoAgents, events: demoEvents },
  );

  assert.equal(resolved.isDemo, true);
  assert.deepEqual(resolved.tasks, demoTasks);
  assert.deepEqual(resolved.agents, demoAgents);
  assert.deepEqual(resolved.events, demoEvents);
});

test("resolveDashboardData keeps demo tasks and agents when only events exist", () => {
  const liveEvent = {
    event_id: "evt-demo-drag",
    type: "task.status_changed",
    ts: "2026-03-21T11:00:00.000Z",
    actor: { kind: "user", id: "dashboard" },
    task_id: "wf_apply",
    payload: { to: "review" },
  };

  const resolved = resolveDashboardData(
    { tasks: [], agents: [], events: [liveEvent] },
    { tasks: demoTasks, agents: demoAgents, events: demoEvents },
  );

  assert.equal(resolved.isDemo, true);
  assert.deepEqual(resolved.tasks, demoTasks);
  assert.deepEqual(resolved.agents, demoAgents);
  assert.equal(resolved.events.length, demoEvents.length + 1);
  assert.deepEqual(resolved.events.at(-1), liveEvent);
});

test("derived dashboard helpers preserve current overview metrics and ordering", () => {
  const metrics = deriveDashboardMetrics(demoAgents, demoTasks, demoEvents);

  assert.deepEqual(metrics, {
    activeAgents: 2,
    blockedTasks: 1,
    reviewQueue: 1,
    approvalSignals: 2,
    handoffSignals: 1,
  });

  const recentEvents = getRecentEvents(demoEvents);
  const queuedTasks = getQueuedTasks(demoTasks);
  const demoConnection = getConnectionPresentation(true, "closed");
  const liveConnection = getConnectionPresentation(false, "open");

  assert.equal(recentEvents[0]?.event_id, "evt-008");
  assert.equal(recentEvents.at(-1)?.event_id, "evt-003");
  assert.equal(queuedTasks[0]?.taskId, "wf_apply");
  assert.equal(queuedTasks.at(-1)?.taskId, "audit_packet");
  assert.deepEqual(demoConnection, {
    tone: "demo",
    label: "[DEMO] preview snapshot",
  });
  assert.deepEqual(liveConnection, {
    tone: "open",
    label: "[OPEN] event bus open",
  });
});

test("tab badges preserve active task load and timeline volume", () => {
  assert.equal(getActiveTaskCount(demoTasks), 4);
  assert.deepEqual(getTabBadges(demoTasks, demoEvents), {
    overview: null,
    kanban: 4,
    timeline: 8,
    office: null,
  });
});

test("priority task helper orders blocked and review work ahead of active tasks", () => {
  assert.deepEqual(
    getPriorityTasks(demoTasks).map((task) => task.taskId),
    ["q_184_owner_gate", "verify_append", "wf_apply"],
  );
});

test("runtime ledger keeps the right rail focused on the three highest-signal items", () => {
  assert.deepEqual(
    getRuntimeLedger({
      connectionStatus: "connecting",
      latestEventType: "approval.pending",
      runningAgents: 2,
      totalAgents: 4,
    }),
    [
      { label: "socket", value: "connecting", tone: "warning" },
      { label: "running agents", value: "2/4" },
      { label: "latest family", value: "approval" },
    ],
  );
});

test("overview actions combine priority tasks with approval and handoff signals", () => {
  assert.deepEqual(getOverviewActions(demoTasks, demoEvents), [
    {
      id: "task:q_184_owner_gate",
      lane: "blocked",
      tone: "danger",
      target: "q_184_owner_gate",
      summary: "Clear the blocker to resume flow.",
      meta: "owner",
    },
    {
      id: "task:verify_append",
      lane: "review",
      tone: "info",
      target: "verify_append",
      summary: "Finish the review pass before close.",
      meta: "sentinel",
    },
    {
      id: "event:evt-006",
      lane: "approval",
      tone: "warning",
      target: "q_184_owner_gate",
      summary: "Resolve the pending approval gate.",
      meta: "owner",
    },
    {
      id: "event:evt-003",
      lane: "handoff",
      tone: "info",
      target: "verify_append",
      summary: "Confirm the next owner after handoff.",
      meta: "architect",
    },
  ]);
});

test("overview actions return an empty list when there are no urgent tasks or signals", () => {
  assert.deepEqual(
    getOverviewActions(
      [{ taskId: "office_snapshot", state: "planned", assignee: "worker-1" }],
      [],
    ),
    [],
  );
});

test("overview actions can be composed from signals only", () => {
  const events = [
    {
      event_id: "evt-approval-only",
      type: "approval.pending",
      ts: "2026-03-21T09:00:00.000Z",
      actor: { kind: "agent", id: "owner" },
      task_id: "gate-1",
      payload: {},
    },
    {
      event_id: "evt-handoff-only",
      type: "handoff.sent",
      ts: "2026-03-21T09:01:00.000Z",
      actor: { kind: "agent", id: "architect" },
      task_id: "task-2",
      payload: {},
    },
  ];

  assert.deepEqual(getOverviewActions([], events), [
    {
      id: "event:evt-approval-only",
      lane: "approval",
      tone: "warning",
      target: "gate-1",
      summary: "Resolve the pending approval gate.",
      meta: "owner",
    },
    {
      id: "event:evt-handoff-only",
      lane: "handoff",
      tone: "info",
      target: "task-2",
      summary: "Confirm the next owner after handoff.",
      meta: "architect",
    },
  ]);
});

test("overview actions honor the task budget when signals are present", () => {
  const tasks = [
    { taskId: "blocked-1", state: "blocked", assignee: "owner" },
    { taskId: "review-1", state: "review", assignee: "sentinel" },
    { taskId: "active-1", state: "active", assignee: "worker-1" },
    { taskId: "active-2", state: "active", assignee: "worker-2" },
  ];
  const events = [
    {
      event_id: "evt-approval",
      type: "approval.pending",
      ts: "2026-03-21T09:00:00.000Z",
      actor: { kind: "agent", id: "owner" },
      task_id: "blocked-1",
      payload: {},
    },
    {
      event_id: "evt-handoff",
      type: "handoff.sent",
      ts: "2026-03-21T09:01:00.000Z",
      actor: { kind: "agent", id: "architect" },
      task_id: "review-1",
      payload: {},
    },
  ];

  assert.deepEqual(
    getOverviewActions(tasks, events).map((action) => action.id),
    ["task:blocked-1", "task:review-1", "event:evt-approval", "event:evt-handoff"],
  );
});

test("office snapshot maps room occupancy and handoff routes from current dashboard data", () => {
  const office = getOfficeSnapshot({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });

  assert.equal(office.occupiedRooms, 3);
  assert.equal(office.activeRooms, 3);
  assert.equal(office.handoffCount, 1);

  const opsControl = office.rooms.find((room) => room.roomId === "ops-control");
  const implOffice = office.rooms.find((room) => room.roomId === "impl-office");
  const validationOffice = office.rooms.find((room) => room.roomId === "validation-office");

  assert.deepEqual(
    {
      agentCount: opsControl?.agentCount,
      runningCount: opsControl?.runningCount,
      taskCount: opsControl?.taskCount,
      tone: opsControl?.tone,
    },
    {
      agentCount: 2,
      runningCount: 1,
      taskCount: 2,
      tone: "danger",
    },
  );

  assert.deepEqual(
    {
      agentCount: implOffice?.agentCount,
      taskCount: implOffice?.taskCount,
      latestFamily: implOffice?.latestFamily,
    },
    {
      agentCount: 1,
      taskCount: 2,
      latestFamily: "artifact",
    },
  );

  assert.deepEqual(
    {
      agentCount: validationOffice?.agentCount,
      runningCount: validationOffice?.runningCount,
      taskCount: validationOffice?.taskCount,
    },
    {
      agentCount: 1,
      runningCount: 1,
      taskCount: 2,
    },
  );

  assert.deepEqual(office.handoffs[0], {
    id: "evt-003",
    fromRoomId: "ops-control",
    fromLabel: "Ops Control",
    toRoomId: "validation-office",
    toLabel: "Validation Office",
    taskId: "verify_append",
    actorId: "architect",
    targetId: "sentinel",
    timestamp: "2026-03-21T08:05:02.000Z",
  });
});
