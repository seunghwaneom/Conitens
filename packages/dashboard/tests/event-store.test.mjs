import test from "node:test";
import assert from "node:assert/strict";
import { useEventStore } from "../src/store/event-store.ts";

function resetStore() {
  useEventStore.setState({
    events: [],
    tasks: [],
    agents: [],
  });
}

test("event store reduces task lifecycle events into task state", () => {
  resetStore();
  const store = useEventStore.getState();

  store.addEvent({
    event_id: "evt-task-created",
    type: "task.created",
    ts: "2026-03-21T09:00:00.000Z",
    actor: { kind: "agent", id: "architect" },
    task_id: "task-1",
    payload: {},
  });

  store.addEvent({
    event_id: "evt-task-assigned",
    type: "task.assigned",
    ts: "2026-03-21T09:01:00.000Z",
    actor: { kind: "agent", id: "architect" },
    task_id: "task-1",
    payload: { assignee: "worker-1" },
  });

  store.addEvent({
    event_id: "evt-task-status",
    type: "task.status_changed",
    ts: "2026-03-21T09:02:00.000Z",
    actor: { kind: "agent", id: "worker-1" },
    task_id: "task-1",
    payload: { to: "review" },
  });

  store.addEvent({
    event_id: "evt-task-complete",
    type: "task.completed",
    ts: "2026-03-21T09:03:00.000Z",
    actor: { kind: "agent", id: "worker-1" },
    task_id: "task-1",
    payload: {},
  });

  const task = useEventStore.getState().tasks[0];

  assert.deepEqual(task, {
    taskId: "task-1",
    state: "done",
    assignee: "worker-1",
  });
  assert.equal(useEventStore.getState().events.length, 4);
});

test("event store reduces agent lifecycle events into agent state", () => {
  resetStore();
  const store = useEventStore.getState();

  store.addEvent({
    event_id: "evt-agent-spawned",
    type: "agent.spawned",
    ts: "2026-03-21T10:00:00.000Z",
    actor: { kind: "agent", id: "worker-2" },
    payload: {},
  });

  store.addEvent({
    event_id: "evt-agent-error",
    type: "agent.error",
    ts: "2026-03-21T10:01:00.000Z",
    actor: { kind: "agent", id: "worker-2" },
    payload: {},
  });

  store.addEvent({
    event_id: "evt-agent-terminated",
    type: "agent.terminated",
    ts: "2026-03-21T10:02:00.000Z",
    actor: { kind: "agent", id: "worker-2" },
    payload: {},
  });

  const agent = useEventStore.getState().agents[0];

  assert.deepEqual(agent, {
    agentId: "worker-2",
    status: "terminated",
  });
  assert.equal(useEventStore.getState().events.length, 3);
});
