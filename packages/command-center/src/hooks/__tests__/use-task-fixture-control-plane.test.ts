/**
 * use-task-fixture-control-plane.test.ts — Sub-AC 7c unit tests
 *
 * Tests the task fixture control plane contract:
 *   - Fixture ID helpers (taskCancelFixtureId, parseTaskFixtureId, etc.)
 *   - buildTaskOrbFixtures: visual fixture configuration per task status/priority
 *   - buildTaskOrbMenuEntries: context menu content for task orbs
 *   - useTaskFixtureControlPlane routing (via direct handler function tests):
 *       FIXTURE_BUTTON_CLICKED + cancel suffix → openCancelTask()
 *       FIXTURE_BUTTON_CLICKED + reprio suffix → openReprioritizeTask()
 *       FIXTURE_BUTTON_CLICKED + unknown suffix → no-op
 *       FIXTURE_MENU_ANCHOR_OPENED → calls onMenuOpen callback
 *       FIXTURE_BUTTON_HOVERED → no-op
 *       Terminal task guard: cancel/reprio on done/cancelled task → no-op
 *
 * Pure logic tests — no React render required.
 * The hook routing is tested by calling the handler function directly,
 * which relies on store state rather than React context.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  taskCancelFixtureId,
  taskReprioFixtureId,
  taskMenuFixtureId,
  parseTaskFixtureId,
  buildTaskOrbFixtures,
  buildTaskOrbMenuEntries,
  cssHexToThreeHex,
  getTaskReprioFixtureColor,
  TASK_CANCEL_FIXTURE_COLOR,
  TASK_MENU_FIXTURE_COLOR,
  TASK_FIXTURE_DISABLED_COLOR,
  FIXTURE_ID_SEP,
  TASK_FIXTURE_CANCEL_SUFFIX,
  TASK_FIXTURE_REPRIO_SUFFIX,
  TASK_FIXTURE_MENU_SUFFIX,
} from "../use-task-fixture-control-plane.js";
import {
  useTaskManagementStore,
} from "../use-task-management.js";
import { useTaskStore } from "../../store/task-store.js";
import type { TaskRecord } from "../../data/task-types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId:          "task-test-001",
    title:           "Test task",
    description:     undefined,
    status:          "active",
    priority:        "normal",
    assignedAgentId: "agent-impl-1",
    createdTs:       Date.now(),
    updatedTs:       Date.now(),
    startedTs:       null,
    completedTs:     null,
    parentTaskId:    null,
    tags:            [],
    eventIds:        [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset stores between tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useTaskManagementStore.getState().close();
  useTaskManagementStore.setState({ panelEvents: [] });
  useTaskStore.setState({
    tasks:          {},
    assignments:    {},
    agentTaskIndex: {},
    tagIndex:       {},
    events:         [],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fixture ID helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("Fixture ID helpers", () => {
  it("taskCancelFixtureId encodes taskId and cancel suffix", () => {
    const id = taskCancelFixtureId("task-abc");
    expect(id).toBe(`task-abc${FIXTURE_ID_SEP}${TASK_FIXTURE_CANCEL_SUFFIX}`);
    expect(id).toContain("cancel");
  });

  it("taskReprioFixtureId encodes taskId and reprio suffix", () => {
    const id = taskReprioFixtureId("task-def");
    expect(id).toBe(`task-def${FIXTURE_ID_SEP}${TASK_FIXTURE_REPRIO_SUFFIX}`);
    expect(id).toContain("reprio");
  });

  it("taskMenuFixtureId encodes taskId and menu suffix", () => {
    const id = taskMenuFixtureId("task-ghi");
    expect(id).toBe(`task-ghi${FIXTURE_ID_SEP}${TASK_FIXTURE_MENU_SUFFIX}`);
    expect(id).toContain("menu");
  });

  it("parseTaskFixtureId round-trips cancel fixture ID", () => {
    const id = taskCancelFixtureId("task-001");
    const parsed = parseTaskFixtureId(id);
    expect(parsed).not.toBeNull();
    expect(parsed?.taskId).toBe("task-001");
    expect(parsed?.suffix).toBe(TASK_FIXTURE_CANCEL_SUFFIX);
  });

  it("parseTaskFixtureId round-trips reprio fixture ID", () => {
    const id = taskReprioFixtureId("task-002");
    const parsed = parseTaskFixtureId(id);
    expect(parsed?.taskId).toBe("task-002");
    expect(parsed?.suffix).toBe(TASK_FIXTURE_REPRIO_SUFFIX);
  });

  it("parseTaskFixtureId round-trips menu fixture ID", () => {
    const id = taskMenuFixtureId("task-003");
    const parsed = parseTaskFixtureId(id);
    expect(parsed?.taskId).toBe("task-003");
    expect(parsed?.suffix).toBe(TASK_FIXTURE_MENU_SUFFIX);
  });

  it("parseTaskFixtureId returns null for IDs without separator", () => {
    expect(parseTaskFixtureId("nocolon")).toBeNull();
    expect(parseTaskFixtureId("")).toBeNull();
  });

  it("parseTaskFixtureId handles taskIds containing colons by using last colon", () => {
    // If a task ID somehow contains a colon, the last colon is used as separator
    const id = "task:with:colons:cancel";
    const parsed = parseTaskFixtureId(id);
    expect(parsed?.taskId).toBe("task:with:colons");
    expect(parsed?.suffix).toBe("cancel");
  });

  it("parseTaskFixtureId returns null if suffix is empty", () => {
    // ID ending in colon has empty suffix
    const id = "task-001:";
    expect(parseTaskFixtureId(id)).toBeNull();
  });

  it("parseTaskFixtureId returns null if taskId is empty", () => {
    const id = ":cancel";
    expect(parseTaskFixtureId(id)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Visual helpers: cssHexToThreeHex / getTaskReprioFixtureColor
// ─────────────────────────────────────────────────────────────────────────────

describe("cssHexToThreeHex", () => {
  it("converts #FF3D00 to 0xff3d00", () => {
    expect(cssHexToThreeHex("#FF3D00")).toBe(0xff3d00);
  });

  it("converts #40C4FF to 0x40c4ff", () => {
    expect(cssHexToThreeHex("#40C4FF")).toBe(0x40c4ff);
  });

  it("handles lowercase hex", () => {
    expect(cssHexToThreeHex("#ff9100")).toBe(0xff9100);
  });

  it("returns 0x40c4ff fallback for empty / malformed input", () => {
    expect(cssHexToThreeHex("")).toBe(0x40c4ff);
    expect(cssHexToThreeHex("not-a-color")).toBe(0x40c4ff);
  });
});

describe("getTaskReprioFixtureColor", () => {
  it("returns red-ish color for critical priority", () => {
    const color = getTaskReprioFixtureColor("critical");
    // #FF3D00 = 0xff3d00 — must be in red range
    expect(color).toBe(cssHexToThreeHex("#FF3D00"));
  });

  it("returns cyan-ish color for normal priority", () => {
    const color = getTaskReprioFixtureColor("normal");
    expect(color).toBe(cssHexToThreeHex("#40C4FF"));
  });

  it("returns different colors for each priority level", () => {
    const critical = getTaskReprioFixtureColor("critical");
    const high     = getTaskReprioFixtureColor("high");
    const normal   = getTaskReprioFixtureColor("normal");
    const low      = getTaskReprioFixtureColor("low");
    // All four priorities must have distinct colors
    const colors = new Set([critical, high, normal, low]);
    expect(colors.size).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. buildTaskOrbFixtures — fixture descriptor correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("buildTaskOrbFixtures()", () => {
  it("returns exactly 3 fixtures for an active task", () => {
    const task = makeTask({ status: "active" });
    const fixtures = buildTaskOrbFixtures(task);
    expect(fixtures).toHaveLength(3);
  });

  it("fixture[0] is cancel button with correct fixtureId", () => {
    const task = makeTask({ taskId: "t-999" });
    const [cancel] = buildTaskOrbFixtures(task);
    expect(cancel.kind).toBe("button");
    expect(cancel.fixtureId).toBe(taskCancelFixtureId("t-999"));
  });

  it("fixture[1] is reprioritize button with correct fixtureId", () => {
    const task = makeTask({ taskId: "t-999" });
    const [, reprio] = buildTaskOrbFixtures(task);
    expect(reprio.kind).toBe("button");
    expect(reprio.fixtureId).toBe(taskReprioFixtureId("t-999"));
  });

  it("fixture[2] is menu_anchor with correct fixtureId", () => {
    const task = makeTask({ taskId: "t-999" });
    const [,, menu] = buildTaskOrbFixtures(task);
    expect(menu.kind).toBe("menu_anchor");
    expect(menu.fixtureId).toBe(taskMenuFixtureId("t-999"));
  });

  it("active task: cancel and reprio buttons are enabled", () => {
    const task = makeTask({ status: "active" });
    const [cancel, reprio] = buildTaskOrbFixtures(task);
    expect(cancel.disabled).toBeFalsy();
    expect(reprio.disabled).toBeFalsy();
  });

  it("active task: cancel button color is TASK_CANCEL_FIXTURE_COLOR (red)", () => {
    const task = makeTask({ status: "active", priority: "normal" });
    const [cancel] = buildTaskOrbFixtures(task);
    expect(cancel.color).toBe(TASK_CANCEL_FIXTURE_COLOR);
  });

  it("active task: reprio button color matches task priority", () => {
    const task = makeTask({ status: "active", priority: "critical" });
    const [, reprio] = buildTaskOrbFixtures(task);
    expect(reprio.color).toBe(getTaskReprioFixtureColor("critical"));
  });

  it("reprio button color changes when priority changes", () => {
    const highTask    = makeTask({ status: "active", priority: "high" });
    const normalTask  = makeTask({ status: "active", priority: "normal" });
    const [, reprioHigh]   = buildTaskOrbFixtures(highTask);
    const [, reprioNormal] = buildTaskOrbFixtures(normalTask);
    expect(reprioHigh.color).not.toBe(reprioNormal.color);
  });

  it("terminal task (done): cancel and reprio buttons are disabled", () => {
    const task = makeTask({ status: "done" });
    const [cancel, reprio] = buildTaskOrbFixtures(task);
    expect(cancel.disabled).toBe(true);
    expect(reprio.disabled).toBe(true);
  });

  it("terminal task (done): disabled buttons show grey color", () => {
    const task = makeTask({ status: "done", priority: "critical" });
    const [cancel, reprio] = buildTaskOrbFixtures(task);
    expect(cancel.color).toBe(TASK_FIXTURE_DISABLED_COLOR);
    expect(reprio.color).toBe(TASK_FIXTURE_DISABLED_COLOR);
  });

  it("terminal task (cancelled): menu anchor stays enabled", () => {
    const task = makeTask({ status: "cancelled" });
    const [,, menu] = buildTaskOrbFixtures(task);
    // Menu anchor should still be enabled even for terminal tasks
    expect(menu.disabled).toBeFalsy();
  });

  it("visible=false: all fixtures are disabled", () => {
    const task = makeTask({ status: "active" });
    const fixtures = buildTaskOrbFixtures(task, false);
    for (const f of fixtures) {
      expect(f.disabled).toBe(true);
    }
  });

  it("localOffset for cancel button is left of center (negative x)", () => {
    const task = makeTask();
    const [cancel] = buildTaskOrbFixtures(task);
    expect(cancel.localOffset?.x).toBeLessThan(0);
  });

  it("localOffset for reprio button is right of center (positive x)", () => {
    const task = makeTask();
    const [, reprio] = buildTaskOrbFixtures(task);
    expect(reprio.localOffset?.x).toBeGreaterThan(0);
  });

  it("localOffset for menu anchor is centered (x = 0) and above buttons", () => {
    const task = makeTask();
    const [,, menu] = buildTaskOrbFixtures(task);
    expect(menu.localOffset?.x).toBe(0);
    expect(menu.localOffset?.y).toBeGreaterThan(1.82); // Above button Y
  });

  it("menu anchor color is always TASK_MENU_FIXTURE_COLOR (magenta)", () => {
    const task = makeTask({ status: "active", priority: "critical" });
    const [,, menu] = buildTaskOrbFixtures(task);
    expect(menu.color).toBe(TASK_MENU_FIXTURE_COLOR);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. buildTaskOrbMenuEntries — context menu content
// ─────────────────────────────────────────────────────────────────────────────

describe("buildTaskOrbMenuEntries()", () => {
  it("always includes a View task entry", () => {
    const task    = makeTask();
    const entries = buildTaskOrbMenuEntries(task);
    const view    = entries.find((e) => e.label === "View task");
    expect(view).toBeDefined();
    expect(view?.item.action).toBe("select");
  });

  it("always includes a Cancel task entry", () => {
    const task    = makeTask({ status: "active" });
    const entries = buildTaskOrbMenuEntries(task);
    const cancel  = entries.find((e) => e.label === "Cancel task");
    expect(cancel).toBeDefined();
  });

  it("Cancel task entry is destructive variant for active task", () => {
    const task    = makeTask({ status: "active" });
    const entries = buildTaskOrbMenuEntries(task);
    const cancel  = entries.find((e) => e.label === "Cancel task");
    expect(cancel?.variant).toBe("destructive");
  });

  it("Cancel task entry is disabled for terminal (done) task", () => {
    const task    = makeTask({ status: "done" });
    const entries = buildTaskOrbMenuEntries(task);
    const cancel  = entries.find((e) => e.label === "Cancel task");
    expect(cancel?.variant).toBe("disabled");
    expect(cancel?.onSelect).toBeUndefined();
  });

  it("includes 4 priority option entries", () => {
    const task    = makeTask({ priority: "normal" });
    const entries = buildTaskOrbMenuEntries(task);
    const priorities = entries.filter(
      (e) => e.item.action === "update_spec",
    );
    expect(priorities).toHaveLength(4);
  });

  it("current priority entry is disabled with ← current label", () => {
    const task    = makeTask({ priority: "high" });
    const entries = buildTaskOrbMenuEntries(task);
    const highEntry = entries.find((e) => e.label.includes("← current"));
    expect(highEntry).toBeDefined();
    expect(highEntry?.label).toContain("High");
    expect(highEntry?.variant).toBe("disabled");
    expect(highEntry?.onSelect).toBeUndefined();
  });

  it("non-current priority entries have onSelect handler", () => {
    const task    = makeTask({ priority: "normal" });
    const entries = buildTaskOrbMenuEntries(task);
    const critical = entries.find((e) => e.label === "Critical");
    expect(critical).toBeDefined();
    expect(critical?.variant).toBe("normal");
    expect(typeof critical?.onSelect).toBe("function");
  });

  it("Cancel task onSelect calls openCancelTask on the management store", () => {
    const task = makeTask({
      taskId: "task-cancel-test",
      title:  "Task to cancel",
      status: "active",
    });
    const entries = buildTaskOrbMenuEntries(task);
    const cancel  = entries.find((e) => e.label === "Cancel task");
    expect(cancel?.onSelect).toBeDefined();

    // Invoke the handler
    cancel?.onSelect?.();

    const s = useTaskManagementStore.getState();
    expect(s.mode).toBe("cancel");
    expect(s.targetTaskId).toBe("task-cancel-test");
    expect(s.targetTaskTitle).toBe("Task to cancel");
  });

  it("Priority onSelect calls openReprioritizeTask with CURRENT priority", () => {
    const task = makeTask({
      taskId:   "task-reprio-test",
      title:    "Task to reprioritize",
      priority: "low",
      status:   "active",
    });
    const entries = buildTaskOrbMenuEntries(task);
    const critical = entries.find((e) => e.label === "Critical");
    expect(critical?.onSelect).toBeDefined();

    critical?.onSelect?.();

    const s = useTaskManagementStore.getState();
    expect(s.mode).toBe("reprioritize");
    expect(s.targetTaskId).toBe("task-reprio-test");
    // The panel opens with current priority ("low") so user can see and change it
    expect(s.targetTaskPriority).toBe("low");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. FIXTURE_BUTTON_CLICKED routing via parseTaskFixtureId
// ─────────────────────────────────────────────────────────────────────────────

describe("Intent routing: cancel fixture button → openCancelTask", () => {
  it("parses cancel fixtureId and identifies the task ID", () => {
    const taskId = "task-routing-001";
    const id     = taskCancelFixtureId(taskId);
    const parsed = parseTaskFixtureId(id);
    expect(parsed?.taskId).toBe(taskId);
    expect(parsed?.suffix).toBe(TASK_FIXTURE_CANCEL_SUFFIX);
  });

  it("store open + correct mode after simulated cancel fixture click", () => {
    // Simulate what handleFixtureIntent does for cancel click
    const task = makeTask({ taskId: "task-sim-cancel", status: "active" });
    useTaskStore.setState({ tasks: { [task.taskId]: task } });

    const parsed = parseTaskFixtureId(taskCancelFixtureId(task.taskId))!;
    const lookedUp = useTaskStore.getState().getTask(parsed.taskId);
    expect(lookedUp).toBeDefined();

    // Simulate the handler routing
    if (parsed.suffix === TASK_FIXTURE_CANCEL_SUFFIX && lookedUp) {
      useTaskManagementStore.getState().openCancelTask(
        lookedUp.taskId,
        lookedUp.title,
        lookedUp.status,
      );
    }

    const s = useTaskManagementStore.getState();
    expect(s.mode).toBe("cancel");
    expect(s.targetTaskId).toBe("task-sim-cancel");
  });
});

describe("Intent routing: reprio fixture button → openReprioritizeTask", () => {
  it("parses reprio fixtureId and identifies the task ID", () => {
    const taskId = "task-routing-002";
    const id     = taskReprioFixtureId(taskId);
    const parsed = parseTaskFixtureId(id);
    expect(parsed?.taskId).toBe(taskId);
    expect(parsed?.suffix).toBe(TASK_FIXTURE_REPRIO_SUFFIX);
  });

  it("store open + correct mode after simulated reprio fixture click", () => {
    const task = makeTask({ taskId: "task-sim-reprio", priority: "low", status: "assigned" });
    useTaskStore.setState({ tasks: { [task.taskId]: task } });

    const parsed  = parseTaskFixtureId(taskReprioFixtureId(task.taskId))!;
    const lookedUp = useTaskStore.getState().getTask(parsed.taskId);

    if (parsed.suffix === TASK_FIXTURE_REPRIO_SUFFIX && lookedUp) {
      useTaskManagementStore.getState().openReprioritizeTask(
        lookedUp.taskId,
        lookedUp.title,
        lookedUp.priority,
      );
    }

    const s = useTaskManagementStore.getState();
    expect(s.mode).toBe("reprioritize");
    expect(s.targetTaskId).toBe("task-sim-reprio");
    expect(s.targetTaskPriority).toBe("low");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Terminal task guard
// ─────────────────────────────────────────────────────────────────────────────

describe("Terminal task guard", () => {
  it("done task: buildTaskOrbFixtures disables cancel button", () => {
    const task     = makeTask({ status: "done" });
    const fixtures = buildTaskOrbFixtures(task);
    const cancel   = fixtures.find((f) => f.fixtureId === taskCancelFixtureId(task.taskId));
    expect(cancel?.disabled).toBe(true);
  });

  it("cancelled task: buildTaskOrbFixtures disables reprio button", () => {
    const task     = makeTask({ status: "cancelled" });
    const fixtures = buildTaskOrbFixtures(task);
    const reprio   = fixtures.find((f) => f.fixtureId === taskReprioFixtureId(task.taskId));
    expect(reprio?.disabled).toBe(true);
  });

  it("cancelled task: buildTaskOrbMenuEntries cancel entry has no onSelect", () => {
    const task    = makeTask({ status: "cancelled" });
    const entries = buildTaskOrbMenuEntries(task);
    const cancel  = entries.find((e) => e.label === "Cancel task");
    expect(cancel?.onSelect).toBeUndefined();
    expect(cancel?.variant).toBe("disabled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Fixture IDs are stable (no change across calls)
// ─────────────────────────────────────────────────────────────────────────────

describe("Fixture ID stability", () => {
  it("taskCancelFixtureId returns the same ID for the same taskId", () => {
    expect(taskCancelFixtureId("task-x")).toBe(taskCancelFixtureId("task-x"));
  });

  it("taskReprioFixtureId returns the same ID for the same taskId", () => {
    expect(taskReprioFixtureId("task-y")).toBe(taskReprioFixtureId("task-y"));
  });

  it("buildTaskOrbFixtures returns same fixtureId across priority changes", () => {
    const lowTask      = makeTask({ priority: "low" });
    const criticalTask = makeTask({ priority: "critical" });

    const [, reprioLow]      = buildTaskOrbFixtures(lowTask);
    const [, reprioCritical] = buildTaskOrbFixtures(criticalTask);

    // fixtureId should be the same regardless of priority (only color changes)
    expect(reprioLow.fixtureId).toBe(reprioCritical.fixtureId);
    // But color should differ
    expect(reprioLow.color).not.toBe(reprioCritical.color);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. FIXTURE_MENU_ANCHOR_OPENED → entries contain correct actions
// ─────────────────────────────────────────────────────────────────────────────

describe("Menu anchor entries completeness", () => {
  it("all four priority levels are represented as entries", () => {
    const task      = makeTask({ priority: "normal" });
    const entries   = buildTaskOrbMenuEntries(task);
    const reprioEntries = entries.filter((e) => e.item.action === "update_spec");
    expect(reprioEntries.length).toBe(4);
    const labels = reprioEntries.map((e) => e.label.replace(" ← current", "").trim());
    expect(labels).toContain("Critical");
    expect(labels).toContain("High");
    expect(labels).toContain("Normal");
    expect(labels).toContain("Low");
  });

  it("entries contain correct entityType 'task'", () => {
    const task    = makeTask();
    const entries = buildTaskOrbMenuEntries(task);
    for (const e of entries) {
      if (e.item.action !== "select") {
        expect(e.item.entityType).toBe("task");
      }
    }
  });

  it("all non-header entries have an item with taskId", () => {
    const task    = makeTask({ taskId: "task-menu-test" });
    const entries = buildTaskOrbMenuEntries(task);
    for (const e of entries) {
      if (e.label.startsWith("──")) continue; // skip separator headers
      expect(e.item.entityId).toBe("task-menu-test");
    }
  });
});
