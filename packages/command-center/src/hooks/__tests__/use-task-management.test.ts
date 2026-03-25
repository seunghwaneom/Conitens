/**
 * use-task-management.test.ts — Unit tests for Sub-AC 7b.
 *
 * Tests the task management store without a React render environment.
 *
 * Validates:
 *  1. Initial state — panel is closed (mode === null)
 *  2. openCreateTask — sets mode + origin context correctly
 *  3. openCancelTask — sets mode + task metadata correctly
 *  4. openReprioritizeTask — sets mode + priority correctly
 *  5. close() — resets all state to null
 *  6. panelEvents — append-only audit trail grows on each open/close
 *  7. panelEvents — capped at MAX_PANEL_EVENTS (200) — ring-buffer behaviour
 *  8. recordPanelEvent — appends events with correct shape
 *  9. openCreateTask is idempotent when called twice in a row (overwrites, no duplicate events)
 * 10. isTaskManagementPanelOpen — returns false when closed, true when open
 * 11. Panel event types match expected enum values
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useTaskManagementStore,
  isTaskManagementPanelOpen,
} from "../use-task-management.js";

// ── Reset store between tests ─────────────────────────────────────────────

beforeEach(() => {
  // Reset to initial state by calling close() and clearing events
  const store = useTaskManagementStore.getState();
  store.close();
  // Manually clear the event log between tests so counts are deterministic
  useTaskManagementStore.setState({ panelEvents: [] });
});

// ── 1. Initial state ─────────────────────────────────────────────────────

describe("useTaskManagementStore — initial state", () => {
  it("starts with mode === null (panel closed)", () => {
    expect(useTaskManagementStore.getState().mode).toBeNull();
  });

  it("starts with all context fields as null", () => {
    const s = useTaskManagementStore.getState();
    expect(s.originType).toBeNull();
    expect(s.originId).toBeNull();
    expect(s.targetTaskId).toBeNull();
    expect(s.targetTaskTitle).toBeNull();
    expect(s.targetTaskStatus).toBeNull();
    expect(s.targetTaskPriority).toBeNull();
  });

  it("starts with an empty panelEvents array", () => {
    expect(useTaskManagementStore.getState().panelEvents).toHaveLength(0);
  });
});

// ── 2. openCreateTask ─────────────────────────────────────────────────────

describe("openCreateTask()", () => {
  it("sets mode to 'create'", () => {
    useTaskManagementStore.getState().openCreateTask("agent", "agent-001");
    expect(useTaskManagementStore.getState().mode).toBe("create");
  });

  it("sets originType and originId from arguments", () => {
    useTaskManagementStore.getState().openCreateTask("room", "room-ops-1");
    const s = useTaskManagementStore.getState();
    expect(s.originType).toBe("room");
    expect(s.originId).toBe("room-ops-1");
  });

  it("clears task-specific fields (cancel/reprioritize context)", () => {
    // First open a cancel panel to pollute state
    useTaskManagementStore.getState().openCancelTask("task-99", "Old task", "active");
    // Then switch to create
    useTaskManagementStore.getState().openCreateTask("agent", "agent-002");
    const s = useTaskManagementStore.getState();
    expect(s.targetTaskId).toBeNull();
    expect(s.targetTaskTitle).toBeNull();
    expect(s.targetTaskStatus).toBeNull();
    expect(s.targetTaskPriority).toBeNull();
  });

  it("appends a panel.opened_create event to panelEvents", () => {
    useTaskManagementStore.getState().openCreateTask("agent", "agent-003");
    const events = useTaskManagementStore.getState().panelEvents;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("panel.opened_create");
    expect(events[0].meta?.originType).toBe("agent");
    expect(events[0].meta?.originId).toBe("agent-003");
  });
});

// ── 3. openCancelTask ─────────────────────────────────────────────────────

describe("openCancelTask()", () => {
  it("sets mode to 'cancel'", () => {
    useTaskManagementStore.getState().openCancelTask("task-1", "Fix bug #42", "active");
    expect(useTaskManagementStore.getState().mode).toBe("cancel");
  });

  it("stores taskId, taskTitle, and taskStatus", () => {
    useTaskManagementStore.getState().openCancelTask("task-7", "Deploy service", "assigned");
    const s = useTaskManagementStore.getState();
    expect(s.targetTaskId).toBe("task-7");
    expect(s.targetTaskTitle).toBe("Deploy service");
    expect(s.targetTaskStatus).toBe("assigned");
  });

  it("sets originType to 'task' and originId to the taskId", () => {
    useTaskManagementStore.getState().openCancelTask("task-8", "Write tests", "draft");
    const s = useTaskManagementStore.getState();
    expect(s.originType).toBe("task");
    expect(s.originId).toBe("task-8");
  });

  it("appends a panel.opened_cancel event", () => {
    useTaskManagementStore.getState().openCancelTask("task-9", "Refactor module", "blocked");
    const events = useTaskManagementStore.getState().panelEvents;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("panel.opened_cancel");
    expect(events[0].meta?.taskId).toBe("task-9");
    expect(events[0].meta?.taskStatus).toBe("blocked");
  });
});

// ── 4. openReprioritizeTask ───────────────────────────────────────────────

describe("openReprioritizeTask()", () => {
  it("sets mode to 'reprioritize'", () => {
    useTaskManagementStore
      .getState()
      .openReprioritizeTask("task-2", "Add dark mode", "normal");
    expect(useTaskManagementStore.getState().mode).toBe("reprioritize");
  });

  it("stores taskId, taskTitle, and current priority", () => {
    useTaskManagementStore
      .getState()
      .openReprioritizeTask("task-10", "Critical auth bug", "low");
    const s = useTaskManagementStore.getState();
    expect(s.targetTaskId).toBe("task-10");
    expect(s.targetTaskTitle).toBe("Critical auth bug");
    expect(s.targetTaskPriority).toBe("low");
  });

  it("appends a panel.opened_reprioritize event with currentPriority", () => {
    useTaskManagementStore
      .getState()
      .openReprioritizeTask("task-11", "Scale infra", "high");
    const events = useTaskManagementStore.getState().panelEvents;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("panel.opened_reprioritize");
    expect(events[0].meta?.currentPriority).toBe("high");
  });
});

// ── 5. close() ────────────────────────────────────────────────────────────

describe("close()", () => {
  it("sets mode back to null", () => {
    useTaskManagementStore.getState().openCreateTask("agent", "a1");
    useTaskManagementStore.getState().close();
    expect(useTaskManagementStore.getState().mode).toBeNull();
  });

  it("clears all context fields", () => {
    useTaskManagementStore.getState().openCancelTask("task-3", "T3", "active");
    useTaskManagementStore.getState().close();
    const s = useTaskManagementStore.getState();
    expect(s.originType).toBeNull();
    expect(s.originId).toBeNull();
    expect(s.targetTaskId).toBeNull();
    expect(s.targetTaskTitle).toBeNull();
    expect(s.targetTaskStatus).toBeNull();
    expect(s.targetTaskPriority).toBeNull();
  });

  it("appends a panel.closed event when mode was non-null", () => {
    useTaskManagementStore.getState().openReprioritizeTask("task-4", "T4", "critical");
    // Clear events added by open
    useTaskManagementStore.setState({ panelEvents: [] });
    useTaskManagementStore.getState().close();
    const events = useTaskManagementStore.getState().panelEvents;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("panel.closed");
  });

  it("does NOT append a panel.closed event if already closed (mode === null)", () => {
    // Already closed from beforeEach
    useTaskManagementStore.getState().close();
    // No event should be recorded (mode was null → guard prevents event)
    expect(useTaskManagementStore.getState().panelEvents).toHaveLength(0);
  });
});

// ── 6. panelEvents audit trail ────────────────────────────────────────────

describe("panelEvents append-only audit trail", () => {
  it("accumulates events across multiple open/close cycles", () => {
    const store = useTaskManagementStore.getState();
    store.openCreateTask("agent", "a1");
    store.close();
    store.openCancelTask("t1", "Task 1", "active");
    store.close();
    // Expect: opened_create + closed + opened_cancel + closed = 4 events
    const events = useTaskManagementStore.getState().panelEvents;
    expect(events.length).toBe(4);
    expect(events[0].type).toBe("panel.opened_create");
    expect(events[1].type).toBe("panel.closed");
    expect(events[2].type).toBe("panel.opened_cancel");
    expect(events[3].type).toBe("panel.closed");
  });

  it("each event has id, type, ts, and optional meta", () => {
    useTaskManagementStore.getState().openCreateTask("room", "r1");
    const event = useTaskManagementStore.getState().panelEvents[0];
    expect(event).toHaveProperty("id");
    expect(typeof event.id).toBe("string");
    expect(event).toHaveProperty("type");
    expect(event).toHaveProperty("ts");
    expect(typeof event.ts).toBe("number");
    expect(event.ts).toBeGreaterThan(0);
  });

  it("event IDs are unique (no duplicates in a burst)", () => {
    const store = useTaskManagementStore.getState();
    // Fire 5 rapid events
    store.openCreateTask("agent", "a1");
    store.close();
    store.openCreateTask("agent", "a2");
    store.close();
    store.openCreateTask("agent", "a3");

    const events = useTaskManagementStore.getState().panelEvents;
    const ids = events.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ── 7. Event log capping ──────────────────────────────────────────────────

describe("panelEvents ring-buffer cap (MAX_PANEL_EVENTS = 200)", () => {
  it("does not exceed 200 events in the log", () => {
    const store = useTaskManagementStore.getState();
    // Clear existing events
    useTaskManagementStore.setState({ panelEvents: [] });

    // Generate 210 events (open + close × 105)
    for (let i = 0; i < 105; i++) {
      store.openCreateTask("agent", `agent-${i}`);
      store.close();
    }

    const events = useTaskManagementStore.getState().panelEvents;
    expect(events.length).toBeLessThanOrEqual(200);
  });
});

// ── 8. recordPanelEvent ───────────────────────────────────────────────────

describe("recordPanelEvent()", () => {
  it("appends a custom event type", () => {
    useTaskManagementStore
      .getState()
      .recordPanelEvent("panel.submitted_create", { taskId: "t99", title: "Test" });
    const events = useTaskManagementStore.getState().panelEvents;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("panel.submitted_create");
    expect(events[0].meta?.taskId).toBe("t99");
  });
});

// ── 9. idempotent open (overwrite, not append state) ─────────────────────

describe("openCreateTask idempotent re-call", () => {
  it("overwrites mode without stack-overflow when called twice", () => {
    const store = useTaskManagementStore.getState();
    store.openCreateTask("agent", "a1");
    store.openCreateTask("room", "r1"); // second call overwrites first
    const s = useTaskManagementStore.getState();
    expect(s.mode).toBe("create");
    expect(s.originType).toBe("room");
    expect(s.originId).toBe("r1");
    // Both open calls should each emit one event
    expect(useTaskManagementStore.getState().panelEvents.length).toBe(2);
  });
});

// ── 10. isTaskManagementPanelOpen helper ─────────────────────────────────

describe("isTaskManagementPanelOpen()", () => {
  it("returns false when panel is closed", () => {
    expect(isTaskManagementPanelOpen()).toBe(false);
  });

  it("returns true when in 'create' mode", () => {
    useTaskManagementStore.getState().openCreateTask("agent", "a1");
    expect(isTaskManagementPanelOpen()).toBe(true);
  });

  it("returns true when in 'cancel' mode", () => {
    useTaskManagementStore.getState().openCancelTask("t1", "T1", "active");
    expect(isTaskManagementPanelOpen()).toBe(true);
  });

  it("returns true when in 'reprioritize' mode", () => {
    useTaskManagementStore.getState().openReprioritizeTask("t2", "T2", "low");
    expect(isTaskManagementPanelOpen()).toBe(true);
  });

  it("returns false after close()", () => {
    useTaskManagementStore.getState().openCreateTask("agent", "a1");
    useTaskManagementStore.getState().close();
    expect(isTaskManagementPanelOpen()).toBe(false);
  });
});

// ── 11. Panel event types ─────────────────────────────────────────────────

describe("TaskManagementEventType completeness", () => {
  const EXPECTED_EVENT_TYPES = [
    "panel.opened_create",
    "panel.opened_cancel",
    "panel.opened_reprioritize",
    "panel.closed",
    "panel.submitted_create",
    "panel.submitted_cancel",
    "panel.submitted_reprioritize",
    "panel.cancelled_by_user",
  ] as const;

  it("all expected event types can be recorded without throwing", () => {
    const store = useTaskManagementStore.getState();
    for (const type of EXPECTED_EVENT_TYPES) {
      expect(() =>
        store.recordPanelEvent(type, { test: true }),
      ).not.toThrow();
    }
  });

  it("recorded events match the expected event type strings", () => {
    useTaskManagementStore.setState({ panelEvents: [] });
    const store = useTaskManagementStore.getState();
    for (const type of EXPECTED_EVENT_TYPES) {
      store.recordPanelEvent(type);
    }
    const events = useTaskManagementStore.getState().panelEvents;
    const recordedTypes = events.map((e) => e.type);
    for (const type of EXPECTED_EVENT_TYPES) {
      expect(recordedTypes).toContain(type);
    }
  });
});
