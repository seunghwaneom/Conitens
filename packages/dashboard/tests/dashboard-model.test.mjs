import test from "node:test";
import assert from "node:assert/strict";
import {
  getActiveTaskCount,
  deriveDashboardMetrics,
  getConnectionPresentation,
  getQueuedTasks,
  getRecentEvents,
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
