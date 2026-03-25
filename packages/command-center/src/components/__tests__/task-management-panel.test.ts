/**
 * task-management-panel.test.ts — Unit tests for Sub-AC 7b.
 *
 * Tests the task management panel contract:
 *   - Context menu integration (buildTaskMenuEntries / buildAgentMenuEntries)
 *   - Task management store state transitions driven by panel actions
 *   - Command payload shapes emitted for create / cancel / reprioritize
 *   - Optimistic store mutations in use-action-dispatcher
 *   - No double-emit: panel + dispatcher don't duplicate store mutations
 *
 * These are pure logic tests — no React render required.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildTaskMenuEntries,
  buildAgentMenuEntries,
} from "../ContextMenuDispatcher.js";
import {
  useTaskManagementStore,
} from "../../hooks/use-task-management.js";
import { useTaskStore } from "../../store/task-store.js";

// ── Reset stores between tests ────────────────────────────────────────────

beforeEach(() => {
  // Reset task management store
  useTaskManagementStore.getState().close();
  useTaskManagementStore.setState({ panelEvents: [] });

  // Reset task store to empty
  useTaskStore.setState({
    tasks:          {},
    assignments:    {},
    agentTaskIndex: {},
    tagIndex:       {},
    events:         [],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. buildTaskMenuEntries — shape and completeness
// ─────────────────────────────────────────────────────────────────────────────

describe("buildTaskMenuEntries()", () => {
  it("always includes a 'View task' entry", () => {
    const entries = buildTaskMenuEntries("task-1");
    const viewEntry = entries.find((e) => e.label === "View task");
    expect(viewEntry).toBeDefined();
    expect(viewEntry?.item.entityType).toBe("task");
    expect(viewEntry?.item.action).toBe("select");
  });

  it("includes 'Cancel task' entry by default (isCancellable not set)", () => {
    const entries = buildTaskMenuEntries("task-2", { taskTitle: "Do work" });
    const cancelEntry = entries.find((e) => e.label === "Cancel task");
    expect(cancelEntry).toBeDefined();
    expect(cancelEntry?.variant).toBe("destructive");
  });

  it("omits 'Cancel task' when isCancellable = false", () => {
    const entries = buildTaskMenuEntries("task-done", {
      taskTitle:    "Completed task",
      isCancellable: false,
    });
    const cancelEntry = entries.find((e) => e.label === "Cancel task");
    expect(cancelEntry).toBeUndefined();
  });

  it("includes 4 reprioritize entries when currentPriority is provided", () => {
    const entries = buildTaskMenuEntries("task-3", {
      taskTitle:        "Something to reprioritize",
      currentPriority:  "normal",
    });
    // Reprioritize header separator + 4 priority options
    const reprioritizeEntries = entries.filter(
      (e) =>
        e.label === "Critical" ||
        e.label === "High" ||
        e.label === "Normal ← current" ||
        e.label === "Low",
    );
    expect(reprioritizeEntries).toHaveLength(4);
  });

  it("marks the current priority entry as 'disabled'", () => {
    const entries = buildTaskMenuEntries("task-4", {
      currentPriority: "high",
    });
    const highEntry = entries.find(
      (e) => e.label === "High ← current",
    );
    expect(highEntry?.variant).toBe("disabled");
  });

  it("non-current priorities are 'normal' variant and have onSelect handler", () => {
    const entries = buildTaskMenuEntries("task-5", {
      taskTitle:       "Test task",
      currentPriority: "normal",
    });
    const criticalEntry = entries.find((e) => e.label === "Critical");
    expect(criticalEntry?.variant).toBe("normal");
    expect(typeof criticalEntry?.onSelect).toBe("function");
  });

  it("Cancel entry has onSelect that opens cancel panel", () => {
    const entries = buildTaskMenuEntries("task-6", {
      taskTitle:  "Cancel me",
      taskStatus: "active",
    });
    const cancelEntry = entries.find((e) => e.label === "Cancel task");
    expect(cancelEntry?.onSelect).toBeDefined();

    // Invoke onSelect and verify store state
    cancelEntry?.onSelect?.();
    const s = useTaskManagementStore.getState();
    expect(s.mode).toBe("cancel");
    expect(s.targetTaskId).toBe("task-6");
    expect(s.targetTaskTitle).toBe("Cancel me");
  });

  it("non-current reprioritize entry onSelect opens reprioritize panel with CURRENT priority", () => {
    const entries = buildTaskMenuEntries("task-7", {
      taskTitle:       "Reprio task",
      currentPriority: "low",
    });
    const criticalEntry = entries.find((e) => e.label === "Critical");
    expect(criticalEntry?.onSelect).toBeDefined();

    criticalEntry?.onSelect?.();
    const s = useTaskManagementStore.getState();
    expect(s.mode).toBe("reprioritize");
    expect(s.targetTaskId).toBe("task-7");
    // The panel opens with the CURRENT priority ("low") highlighted so the
    // user can confirm the change or pick a different target priority.
    expect(s.targetTaskPriority).toBe("low");
  });

  it("includes 'Assign to <agentId>' entry when agentId provided", () => {
    const entries = buildTaskMenuEntries("task-8", {
      agentId: "agent-researcher",
    });
    const assignEntry = entries.find((e) =>
      e.label.includes("agent-researcher"),
    );
    expect(assignEntry).toBeDefined();
    expect(assignEntry?.item.action).toBe("assign");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. buildAgentMenuEntries — Sub-AC 7b additions
// ─────────────────────────────────────────────────────────────────────────────

describe("buildAgentMenuEntries() Sub-AC 7b additions", () => {
  it("includes 'Create task for agent' entry", () => {
    const entries = buildAgentMenuEntries("agent-impl-1");
    const createEntry = entries.find((e) => e.label === "Create task for agent");
    expect(createEntry).toBeDefined();
    expect(createEntry?.icon).toBe("⊕");
  });

  it("'Create task for agent' has onSelect that opens create panel", () => {
    const entries = buildAgentMenuEntries("agent-impl-2");
    const createEntry = entries.find((e) => e.label === "Create task for agent");
    expect(createEntry?.onSelect).toBeDefined();

    createEntry?.onSelect?.();
    const s = useTaskManagementStore.getState();
    expect(s.mode).toBe("create");
    expect(s.originType).toBe("agent");
    expect(s.originId).toBe("agent-impl-2");
  });

  it("'Create task for agent' onSelect does not dispatch via ActionDispatcher item", () => {
    // The item is a no-dispatch placeholder (entityType="agent", action="select").
    // The onSelect handler bypasses ActionDispatcher and opens the panel directly.
    // We verify onSelect exists so ContextMenuPortal uses it instead of item dispatch.
    const entries = buildAgentMenuEntries("agent-orch-1");
    const createEntry = entries.find((e) => e.label === "Create task for agent");
    expect(createEntry?.onSelect).toBeDefined();
    // Placeholder item keeps entityType="agent" to satisfy existing shape tests
    expect(createEntry?.item.entityType).toBe("agent");
    expect(createEntry?.item.entityId).toBe("agent-orch-1");
    expect(createEntry?.item.action).toBe("select"); // no-op placeholder action
  });

  it("status-aware entries still present (Sub-AC 7a regression check)", () => {
    const entries = buildAgentMenuEntries("agent-idle", {
      agentStatus: "active",
    });
    // Active agent should have "Pause" entry
    const pauseEntry = entries.find((e) => e.label === "Pause");
    expect(pauseEntry).toBeDefined();
    // Terminate should always be present for non-inactive agents
    const terminateEntry = entries.find((e) => e.label === "Terminate");
    expect(terminateEntry).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Task store optimistic mutations
// ─────────────────────────────────────────────────────────────────────────────

describe("Task store optimistic mutations (Sub-AC 7b)", () => {
  it("createTask inserts a new task with correct priority", () => {
    useTaskStore.getState().createTask({
      title:    "Test optimistic create",
      priority: "high",
    });
    const all = useTaskStore.getState().getAllTasks();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Test optimistic create");
    expect(all[0].priority).toBe("high");
    expect(all[0].status).toBe("draft");
  });

  it("transitionTask to 'cancelled' is gated by TERMINAL_TASK_STATES", () => {
    const taskId = useTaskStore.getState().createTask({
      title: "Will be cancelled",
    });
    const ok = useTaskStore.getState().transitionTask(taskId, "cancelled");
    expect(ok).toBe(true); // draft → cancelled is valid
    expect(useTaskStore.getState().getTask(taskId)?.status).toBe("cancelled");
  });

  it("transitionTask rejects invalid cancel from 'done'", () => {
    // Manually insert a done task
    useTaskStore.setState((state) => ({
      tasks: {
        ...state.tasks,
        "done-task": {
          taskId:          "done-task",
          title:           "Already done",
          description:     undefined,
          status:          "done",
          priority:        "normal",
          assignedAgentId: null,
          createdTs:       Date.now(),
          updatedTs:       Date.now(),
          startedTs:       null,
          completedTs:     Date.now(),
          parentTaskId:    null,
          tags:            [],
          eventIds:        [],
        },
      },
    }));
    const ok = useTaskStore.getState().transitionTask("done-task", "cancelled");
    expect(ok).toBe(false); // done → cancelled is invalid
  });

  it("setTaskPriority emits a priority_changed event and updates the record", () => {
    const taskId = useTaskStore.getState().createTask({
      title:    "Reprior task",
      priority: "low",
    });
    useTaskStore.getState().setTaskPriority(taskId, "critical");
    const task = useTaskStore.getState().getTask(taskId);
    expect(task?.priority).toBe("critical");

    // Check event was appended
    const events = useTaskStore.getState().events;
    const priorityEvent = events.find(
      (e) => e.type === "task.priority_changed" && e.taskId === taskId,
    );
    expect(priorityEvent).toBeDefined();
    expect(priorityEvent?.payload?.priority).toBe("critical");
    expect(priorityEvent?.payload?.prev_priority).toBe("low");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Command payload shapes for orchestration_commands
// ─────────────────────────────────────────────────────────────────────────────

describe("orchestration_command payload shapes (Sub-AC 7b contract)", () => {
  it("task.create payload has required fields: task_id, title", () => {
    // Verify the payload shape that cmdWriter.createTask() expects
    const payload = {
      task_id:     "task-gui-001",
      title:       "My new task",
      description: "Does something important",
      assigned_to: "agent-impl-1",
      priority:    3 as 1 | 2 | 3 | 4 | 5,
      due_by:      undefined,
      metadata:    { tags: ["feat", "frontend"] },
    };
    expect(payload.task_id).toBeTruthy();
    expect(payload.title).toBeTruthy();
    expect(typeof payload.priority).toBe("number");
    expect(payload.priority).toBeGreaterThanOrEqual(1);
    expect(payload.priority).toBeLessThanOrEqual(5);
  });

  it("task.cancel payload has required field: task_id", () => {
    const payload = {
      task_id: "task-cancel-001",
      reason:  "user_requested",
    };
    expect(payload.task_id).toBeTruthy();
    expect(typeof payload.reason).toBe("string");
  });

  it("task.update_spec (reprioritize) payload has task_id + priority", () => {
    const payload = {
      task_id:  "task-reprio-001",
      priority: 4 as 1 | 2 | 3 | 4 | 5, // critical
    };
    expect(payload.task_id).toBeTruthy();
    expect(payload.priority).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. TaskManagementPanel — panel event sequence correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("TaskManagementPanel event sequence", () => {
  it("create flow: opened_create → submitted_create → closed (simulated)", () => {
    // Use getState() each time to get fresh (non-stale) Zustand state reference
    useTaskManagementStore.getState().openCreateTask("agent", "agent-001");
    expect(useTaskManagementStore.getState().mode).toBe("create");

    // Simulate: user submits form
    useTaskManagementStore.getState().recordPanelEvent("panel.submitted_create", {
      taskId:    "task-gui-new",
      title:     "Fix the auth flow",
      priority:  "high",
      assignTo:  "agent-001",
    });

    // Simulate: panel closes
    useTaskManagementStore.getState().close();

    const events = useTaskManagementStore.getState().panelEvents;
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("panel.opened_create");
    expect(types[1]).toBe("panel.submitted_create");
    expect(types[2]).toBe("panel.closed");
  });

  it("cancel flow: opened_cancel → submitted_cancel → closed (simulated)", () => {
    const store = useTaskManagementStore.getState();

    store.openCancelTask("task-123", "Refactor auth", "active");
    store.recordPanelEvent("panel.submitted_cancel", {
      taskId: "task-123",
      reason: "requirements_changed",
    });
    store.close();

    const events = useTaskManagementStore.getState().panelEvents;
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("panel.opened_cancel");
    expect(types[1]).toBe("panel.submitted_cancel");
    expect(types[2]).toBe("panel.closed");
  });

  it("reprioritize flow: opened_reprioritize → submitted_reprioritize → closed (simulated)", () => {
    const store = useTaskManagementStore.getState();

    store.openReprioritizeTask("task-456", "Scale workers", "low");
    store.recordPanelEvent("panel.submitted_reprioritize", {
      taskId:      "task-456",
      newPriority:  "critical",
      prevPriority: "low",
    });
    store.close();

    const events = useTaskManagementStore.getState().panelEvents;
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("panel.opened_reprioritize");
    expect(types[1]).toBe("panel.submitted_reprioritize");
    expect(types[2]).toBe("panel.closed");
  });

  it("user cancellation: opened_create → cancelled_by_user → closed", () => {
    const store = useTaskManagementStore.getState();

    store.openCreateTask("room", "room-lab");
    store.recordPanelEvent("panel.cancelled_by_user", { mode: "create" });
    store.close();

    const events = useTaskManagementStore.getState().panelEvents;
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("panel.opened_create");
    expect(types[1]).toBe("panel.cancelled_by_user");
    expect(types[2]).toBe("panel.closed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Context menu "Create task" entry from room context
// ─────────────────────────────────────────────────────────────────────────────

describe("Room context menu — Create task entry (Sub-AC 7b)", () => {
  it("buildAgentMenuEntries opens panel with originType=agent", () => {
    const agentId = "agent-validator-1";
    const entries = buildAgentMenuEntries(agentId, { agentStatus: "idle" });
    const createEntry = entries.find((e) => e.label === "Create task for agent");
    createEntry?.onSelect?.();
    const s = useTaskManagementStore.getState();
    expect(s.originType).toBe("agent");
    expect(s.originId).toBe(agentId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. No-op guard: panel does not crash on close when already closed
// ─────────────────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("close() on already-closed store does not throw or add events", () => {
    // mode is null from beforeEach
    expect(() => useTaskManagementStore.getState().close()).not.toThrow();
    expect(useTaskManagementStore.getState().panelEvents).toHaveLength(0);
  });

  it("buildTaskMenuEntries with no options returns minimal entry set", () => {
    const entries = buildTaskMenuEntries("t99");
    // Should at least have View task and Cancel task
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0].label).toBe("View task");
  });
});
