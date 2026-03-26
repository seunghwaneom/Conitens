/**
 * use-task-ws-bridge.test.ts — Unit tests for Sub-AC 5a: live WS integration.
 *
 * Tests the `dispatchTaskWSEvent` routing function which bridges raw WS
 * events from the orchestrator bus to the task-store actions.
 *
 * All tests operate on the Zustand store directly (no React rendering or
 * WebSocket connections) for determinism and speed.
 *
 * Test ID scheme:
 *   5w-N  : WS event routing (dispatchTaskWSEvent)
 *   5s-N  : TASK_WS_EVENT_TYPES set membership
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "../../store/task-store.js";
import {
  dispatchTaskWSEvent,
  TASK_WS_EVENT_TYPES,
  type TaskWSEvent,
} from "../use-task-ws-bridge.js";
import { SEED_TASK_COUNT, TASK_INITIAL_DATASET } from "../../data/task-seed.js";
import type { TaskStatus } from "../../data/task-types.js";

// ── Reset helper ───────────────────────────────────────────────────────────

function resetStore() {
  useTaskStore.setState({
    tasks:          {},
    assignments:    {},
    agentTaskIndex: {},
    tagIndex:       {},
    events:         [],
  });
}

// ── Helper to build a minimal TaskWSEvent ─────────────────────────────────

function makeEvent(
  type: string,
  payload: Record<string, unknown>,
  task_id?: string,
): TaskWSEvent {
  return { type, payload, task_id };
}

// ── Tests: TASK_WS_EVENT_TYPES set ────────────────────────────────────────

describe("TASK_WS_EVENT_TYPES", () => {

  // 5s-1
  it("includes all core protocol task event types", () => {
    const required = [
      "task.created",
      "task.assigned",
      "task.status_changed",
      "task.completed",
      "task.failed",
      "task.cancelled",
      "task.spec_updated",
      "task.artifact_added",
    ];
    for (const t of required) {
      expect(TASK_WS_EVENT_TYPES.has(t)).toBe(true);
    }
  });

  // 5s-2
  it("includes bulk/snapshot event types", () => {
    expect(TASK_WS_EVENT_TYPES.has("tasks.bulk_loaded")).toBe(true);
    expect(TASK_WS_EVENT_TYPES.has("tasks.snapshot")).toBe(true);
  });

  // 5s-3
  it("does NOT include meeting or command event types", () => {
    expect(TASK_WS_EVENT_TYPES.has("meeting.started")).toBe(false);
    expect(TASK_WS_EVENT_TYPES.has("command.issued")).toBe(false);
    expect(TASK_WS_EVENT_TYPES.has("agent.spawned")).toBe(false);
  });
});

// ── Tests: dispatchTaskWSEvent ─────────────────────────────────────────────

describe("dispatchTaskWSEvent — task.created", () => {
  beforeEach(resetStore);

  // 5w-1
  it("creates a new task in the store when task.created is received", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "New WS task", status: "draft", priority: "normal", tags: [] },
      "ws-task-001",
    ));

    const task = useTaskStore.getState().tasks["ws-task-001"];
    expect(task).toBeDefined();
    expect(task.taskId).toBe("ws-task-001");
    expect(task.title).toBe("New WS task");
    expect(task.status).toBe("draft");
  });

  // 5w-2
  it("assigns the task to the agent when agent_id is in payload", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      {
        title:    "Assigned WS task",
        status:   "assigned",
        priority: "high",
        agent_id: "implementer-subagent",
        tags:     [],
      },
      "ws-task-002",
    ));

    const state = useTaskStore.getState();
    const task  = state.tasks["ws-task-002"];
    expect(task).toBeDefined();
    expect(task.assignedAgentId).toBe("implementer-subagent");
  });

  // 5w-3
  it("does not duplicate an existing task on repeated task.created events", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Once", status: "draft", priority: "normal", tags: [] },
      "ws-task-once",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Once — duplicate", status: "draft", priority: "normal", tags: [] },
      "ws-task-once",
    ));

    // Store should still have only one task with this ID
    const state = useTaskStore.getState();
    expect(state.tasks["ws-task-once"].title).toBe("Once");
    const count = Object.keys(state.tasks).length;
    expect(count).toBe(1);
  });

  // 5w-4
  it("gracefully ignores task.created with no task_id", () => {
    // Should not throw, and should not add any task
    expect(() => {
      dispatchTaskWSEvent(makeEvent(
        "task.created",
        { title: "No ID task", status: "draft", priority: "normal", tags: [] },
      ));
    }).not.toThrow();
    expect(Object.keys(useTaskStore.getState().tasks).length).toBe(0);
  });

  // 5w-5
  it("applies tags from the payload to the created task", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Tagged", status: "draft", priority: "normal", tags: ["auth", "backend"] },
      "ws-task-tags",
    ));
    const task = useTaskStore.getState().tasks["ws-task-tags"];
    expect(task.tags).toContain("auth");
    expect(task.tags).toContain("backend");
  });

  // 5w-6
  it("sets parentTaskId from parent_task_id in payload", () => {
    // First create the parent
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Parent", status: "draft", priority: "normal", tags: [] },
      "ws-parent-001",
    ));
    // Then the child
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      {
        title:          "Child",
        status:         "draft",
        priority:       "normal",
        tags:           [],
        parent_task_id: "ws-parent-001",
      },
      "ws-child-001",
    ));

    const child = useTaskStore.getState().tasks["ws-child-001"];
    expect(child.parentTaskId).toBe("ws-parent-001");
  });
});

describe("dispatchTaskWSEvent — task.assigned", () => {
  beforeEach(resetStore);

  // 5w-7
  it("assigns task to agent when task.assigned is received", () => {
    // Pre-create the task
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Assignable", status: "draft", priority: "normal", tags: [] },
      "ws-assign-001",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.assigned",
      { agent_id: "researcher-subagent" },
      "ws-assign-001",
    ));

    const state = useTaskStore.getState();
    expect(state.tasks["ws-assign-001"].assignedAgentId).toBe("researcher-subagent");
    expect(state.assignments["ws-assign-001"]).toBeDefined();
    expect(state.assignments["ws-assign-001"].agentId).toBe("researcher-subagent");
  });

  // 5w-8
  it("ignores task.assigned for unknown task IDs", () => {
    expect(() => {
      dispatchTaskWSEvent(makeEvent(
        "task.assigned",
        { agent_id: "agent-x" },
        "nonexistent-task",
      ));
    }).not.toThrow();
  });

  // 5w-9
  it("ignores task.assigned when agent_id is missing", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "No agent", status: "draft", priority: "normal", tags: [] },
      "ws-noagent",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.assigned",
      {},  // no agent_id
      "ws-noagent",
    ));
    // Task should remain unassigned
    expect(useTaskStore.getState().tasks["ws-noagent"].assignedAgentId).toBeNull();
  });
});

describe("dispatchTaskWSEvent — task.status_changed", () => {
  beforeEach(resetStore);

  // 5w-10
  it("transitions task status when task.status_changed is received", () => {
    // Create task in "draft"
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Status change", status: "draft", priority: "normal", tags: [] },
      "ws-status-001",
    ));

    // Transition to "planned"
    dispatchTaskWSEvent(makeEvent(
      "task.status_changed",
      { status: "planned" },
      "ws-status-001",
    ));

    expect(useTaskStore.getState().tasks["ws-status-001"].status).toBe("planned");
  });

  // 5w-11
  it("silently drops invalid transitions (state machine enforcement)", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Guard", status: "draft", priority: "normal", tags: [] },
      "ws-guard",
    ));
    // draft → active is not a valid transition
    dispatchTaskWSEvent(makeEvent(
      "task.status_changed",
      { status: "active" },
      "ws-guard",
    ));
    // Status should remain "draft"
    expect(useTaskStore.getState().tasks["ws-guard"].status).toBe("draft");
  });

  // 5w-12
  it("ignores task.status_changed with an invalid status value", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Bad status", status: "draft", priority: "normal", tags: [] },
      "ws-badstatus",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.status_changed",
      { status: "not-a-real-status" },
      "ws-badstatus",
    ));
    // Should remain draft
    expect(useTaskStore.getState().tasks["ws-badstatus"].status).toBe("draft");
  });
});

describe("dispatchTaskWSEvent — task.completed / task.failed / task.cancelled", () => {
  beforeEach(resetStore);

  // 5w-13
  it("transitions task to 'done' on task.completed event", () => {
    // Create in "review" (valid source for done)
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Complete me", status: "review", priority: "normal", tags: [] },
      "ws-complete",
    ));
    dispatchTaskWSEvent(makeEvent("task.completed", {}, "ws-complete"));
    expect(useTaskStore.getState().tasks["ws-complete"].status).toBe("done");
  });

  // 5w-14
  it("transitions task to 'failed' on task.failed event", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Fail me", status: "active", priority: "normal", tags: [] },
      "ws-fail",
    ));
    dispatchTaskWSEvent(makeEvent("task.failed", {}, "ws-fail"));
    expect(useTaskStore.getState().tasks["ws-fail"].status).toBe("failed");
  });

  // 5w-15
  it("transitions task to 'cancelled' on task.cancelled event", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Cancel me", status: "planned", priority: "normal", tags: [] },
      "ws-cancel",
    ));
    dispatchTaskWSEvent(makeEvent("task.cancelled", {}, "ws-cancel"));
    expect(useTaskStore.getState().tasks["ws-cancel"].status).toBe("cancelled");
  });
});

describe("dispatchTaskWSEvent — task.spec_updated", () => {
  beforeEach(resetStore);

  // 5w-16
  it("updates task title and description on task.spec_updated", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Old title", status: "draft", priority: "normal", tags: [] },
      "ws-spec",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.spec_updated",
      { title: "New title", description: "Updated description" },
      "ws-spec",
    ));
    const task = useTaskStore.getState().tasks["ws-spec"];
    expect(task.title).toBe("New title");
    expect(task.description).toBe("Updated description");
  });

  // 5w-17
  it("ignores task.spec_updated when title is missing", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Unchanged", status: "draft", priority: "normal", tags: [] },
      "ws-spec2",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.spec_updated",
      { description: "Only description, no title" },
      "ws-spec2",
    ));
    // Title should be unchanged
    expect(useTaskStore.getState().tasks["ws-spec2"].title).toBe("Unchanged");
  });
});

describe("dispatchTaskWSEvent — task.artifact_added", () => {
  beforeEach(resetStore);

  // 5w-18
  it("adds an artifact tag to the task on task.artifact_added", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Artifact task", status: "active", priority: "normal", tags: [] },
      "ws-artifact",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.artifact_added",
      { artifact_type: "diff" },
      "ws-artifact",
    ));
    const task = useTaskStore.getState().tasks["ws-artifact"];
    expect(task.tags).toContain("artifact:diff");
  });

  // 5w-19
  it("does not duplicate artifact tags on repeated artifact events", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Dedup artifact", status: "active", priority: "normal", tags: [] },
      "ws-artifact2",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.artifact_added",
      { artifact_type: "report" },
      "ws-artifact2",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.artifact_added",
      { artifact_type: "report" },
      "ws-artifact2",
    ));
    const task = useTaskStore.getState().tasks["ws-artifact2"];
    const reportTagCount = task.tags.filter((t) => t === "artifact:report").length;
    expect(reportTagCount).toBe(1);
  });
});

describe("dispatchTaskWSEvent — tasks.snapshot / tasks.bulk_loaded", () => {
  beforeEach(resetStore);

  // 5w-20
  it("bulk-loads tasks from a tasks.snapshot event", () => {
    const now = Date.now();
    const snapshotTasks = [
      {
        taskId:          "snap-001",
        title:           "Snapshot task 1",
        status:          "active",
        priority:        "high",
        assignedAgentId: "implementer-subagent",
        createdTs:       now,
        updatedTs:       now,
        startedTs:       now,
        completedTs:     null,
        parentTaskId:    null,
        tags:            ["snap"],
        eventIds:        [],
      },
      {
        taskId:          "snap-002",
        title:           "Snapshot task 2",
        status:          "draft",
        priority:        "normal",
        assignedAgentId: null,
        createdTs:       now,
        updatedTs:       now,
        startedTs:       null,
        completedTs:     null,
        parentTaskId:    null,
        tags:            [],
        eventIds:        [],
      },
    ];

    dispatchTaskWSEvent(makeEvent(
      "tasks.snapshot",
      { tasks: snapshotTasks },
    ));

    const state = useTaskStore.getState();
    expect(state.tasks["snap-001"]).toBeDefined();
    expect(state.tasks["snap-002"]).toBeDefined();
    expect(Object.keys(state.tasks).length).toBe(2);
  });

  // 5w-21
  it("ignores tasks.snapshot when tasks payload is not an array", () => {
    dispatchTaskWSEvent(makeEvent(
      "tasks.snapshot",
      { tasks: "not-an-array" },
    ));
    expect(Object.keys(useTaskStore.getState().tasks).length).toBe(0);
  });

  // 5w-22
  it("filters out malformed entries from the tasks array", () => {
    const now = Date.now();
    const mixedTasks = [
      // Valid
      {
        taskId: "valid-001", title: "Valid",
        status: "draft", priority: "normal",
        assignedAgentId: null, createdTs: now, updatedTs: now,
        startedTs: null, completedTs: null, parentTaskId: null,
        tags: [], eventIds: [],
      },
      // Invalid (no taskId)
      { title: "No ID", status: "draft" },
      // Invalid (no title)
      { taskId: "no-title-001" },
    ];

    dispatchTaskWSEvent(makeEvent(
      "tasks.bulk_loaded",
      { tasks: mixedTasks },
    ));

    const state = useTaskStore.getState();
    // Only the valid task should be loaded
    expect(state.tasks["valid-001"]).toBeDefined();
    expect(Object.keys(state.tasks).length).toBe(1);
  });

  // 5w-23
  it("tasks.bulk_loaded works the same as tasks.snapshot", () => {
    const now = Date.now();
    dispatchTaskWSEvent(makeEvent(
      "tasks.bulk_loaded",
      {
        tasks: [{
          taskId:          "bulk-ws-001",
          title:           "Bulk WS task",
          status:          "draft",
          priority:        "low",
          assignedAgentId: null,
          createdTs:       now,
          updatedTs:       now,
          startedTs:       null,
          completedTs:     null,
          parentTaskId:    null,
          tags:            [],
          eventIds:        [],
        }],
      },
    ));
    expect(useTaskStore.getState().tasks["bulk-ws-001"]).toBeDefined();
  });
});

describe("dispatchTaskWSEvent — seed data integration", () => {
  beforeEach(resetStore);

  // 5w-24
  it("loading seed tasks via tasks.snapshot populates the store correctly", () => {
    dispatchTaskWSEvent(makeEvent(
      "tasks.snapshot",
      { tasks: [...TASK_INITIAL_DATASET] },
    ));

    const state = useTaskStore.getState();
    expect(Object.keys(state.tasks).length).toBe(SEED_TASK_COUNT);
  });

  // 5w-25
  it("dispatching task.status_changed after snapshot correctly updates status", () => {
    dispatchTaskWSEvent(makeEvent(
      "tasks.snapshot",
      { tasks: [...TASK_INITIAL_DATASET] },
    ));

    // Transition the auth-impl task from "active" → "review"
    const authImplId = "seed-task-auth-impl";
    expect(useTaskStore.getState().tasks[authImplId].status).toBe("active");

    dispatchTaskWSEvent(makeEvent(
      "task.status_changed",
      { status: "review" },
      authImplId,
    ));

    expect(useTaskStore.getState().tasks[authImplId].status).toBe("review");
  });
});

describe("dispatchTaskWSEvent — unknown event types", () => {
  beforeEach(resetStore);

  // 5w-26
  it("silently ignores unknown event types without throwing", () => {
    expect(() => {
      dispatchTaskWSEvent(makeEvent(
        "task.alien_event_from_future",
        { task_id: "test", data: "ignore me" },
        "test-id",
      ));
    }).not.toThrow();
    expect(Object.keys(useTaskStore.getState().tasks).length).toBe(0);
  });
});

// ── Event log integrity ────────────────────────────────────────────────────

describe("dispatchTaskWSEvent — event log integrity", () => {
  beforeEach(resetStore);

  // 5w-27
  it("each dispatched event appends to the task store event log", () => {
    const before = useTaskStore.getState().events.length;

    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Event log task", status: "draft", priority: "normal", tags: [] },
      "ws-evlog-001",
    ));

    const after = useTaskStore.getState().events.length;
    // bulkLoadTasks emits 1 event (tasks.bulk_loaded)
    expect(after).toBeGreaterThan(before);
  });

  // 5w-28
  it("multiple events on the same task accumulate in the event log", () => {
    dispatchTaskWSEvent(makeEvent(
      "task.created",
      { title: "Multi-event task", status: "draft", priority: "normal", tags: [] },
      "ws-multi",
    ));
    dispatchTaskWSEvent(makeEvent(
      "task.status_changed",
      { status: "planned" },
      "ws-multi",
    ));

    const events = useTaskStore.getState().events;
    // Should have at least: tasks.bulk_loaded (from create) + task.status_changed
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Type narrowing via TASK_WS_EVENT_TYPES set ─────────────────────────────

describe("TASK_WS_EVENT_TYPES — filtering use case", () => {

  // 5s-4
  it("can be used to filter mixed event streams to task-only events", () => {
    const mixedEvents: TaskWSEvent[] = [
      { type: "task.created",      payload: { title: "t1" } },
      { type: "meeting.started",   payload: {} },
      { type: "task.completed",    payload: {} },
      { type: "command.issued",    payload: {} },
      { type: "agent.spawned",     payload: {} },
      { type: "tasks.snapshot",    payload: {} },
    ];

    const taskEvents = mixedEvents.filter((e) => TASK_WS_EVENT_TYPES.has(e.type));
    expect(taskEvents).toHaveLength(3); // task.created, task.completed, tasks.snapshot
    expect(taskEvents.map((e) => e.type)).toEqual([
      "task.created",
      "task.completed",
      "tasks.snapshot",
    ]);
  });
});
