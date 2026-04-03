import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOfficeFocusStripView,
  buildOfficeSidebarRailView,
  OFFICE_MAX_VISIBLE_RAIL_AGENTS,
  OFFICE_MAX_VISIBLE_RAIL_HANDOFFS,
  OFFICE_MAX_VISIBLE_RAIL_TASKS,
} from "../src/office-sidebar-view-model.ts";

test("office rail view caps visible rows and reports hidden counts", () => {
  const rail = buildOfficeSidebarRailView({
    residents: Array.from({ length: 6 }, (_, index) => ({
      agentId: `agent-${index}`,
      status: "running",
      taskCount: index,
      roleTaskCount: index,
      profile: {
        role: "orchestrator",
        archetype: "control",
        homeRoomId: "ops-control",
        signatureProp: "console",
      },
      roomId: "ops-control",
      roomLabel: "Ops Control",
      teamId: "plan_team",
      teamLabel: "Plan Team",
      roomKind: "control",
    })),
    queuedTasks: Array.from({ length: 7 }, (_, index) => ({
      taskId: `task-${index}`,
      title: `Task ${index}`,
      assignee: "agent-0",
      state: "active",
      updatedAt: "2026-04-02T00:00:00Z",
    })),
    handoffs: Array.from({ length: 5 }, (_, index) => ({
      id: `handoff-${index}`,
      actorId: "agent-0",
      fromLabel: "Ops",
      toLabel: "Review",
      taskId: `task-${index}`,
      timestamp: "2026-04-02T00:00:00Z",
      targetId: `agent-${index}`,
    })),
  });

  assert.equal(rail.visibleResidents.length, OFFICE_MAX_VISIBLE_RAIL_AGENTS);
  assert.equal(rail.visibleTasks.length, OFFICE_MAX_VISIBLE_RAIL_TASKS);
  assert.equal(rail.visibleHandoffs.length, OFFICE_MAX_VISIBLE_RAIL_HANDOFFS);
  assert.equal(rail.hiddenResidentCount, 2);
  assert.equal(rail.hiddenTaskCount, 3);
  assert.equal(rail.hiddenHandoffCount, 2);
});

test("office rail view reports zero hidden counts when data fits the rail", () => {
  const rail = buildOfficeSidebarRailView({
    residents: [],
    queuedTasks: [],
    handoffs: [],
  });

  assert.equal(rail.hiddenResidentCount, 0);
  assert.equal(rail.hiddenTaskCount, 0);
  assert.equal(rail.hiddenHandoffCount, 0);
});

test("office focus strip favors resident detail when a resident is selected", () => {
  const focus = buildOfficeFocusStripView({
    selectedResident: {
      agentId: "agent-1",
      status: "running",
      taskCount: 3,
      roleTaskCount: 2,
      profile: {
        role: "orchestrator",
        archetype: "control",
        homeRoomId: "ops-control",
        signatureProp: "console",
      },
      roomId: "ops-control",
      roomLabel: "Ops Control",
      teamId: "plan_team",
      teamLabel: "Plan Team",
      roomKind: "control",
    },
    selectedRoom: null,
    roleLabels: {
      orchestrator: "orchestrator",
    },
  });

  assert.equal(focus.eyebrow, "Ops Control");
  assert.equal(focus.headline, "agent-1");
  assert.match(focus.summary, /orchestrator/);
  assert.match(focus.summary, /running/);
  assert.match(focus.summary, /3 active/);
  assert.match(focus.detail, /Ops Control/);
});

test("office focus strip falls back to room summary when no resident is selected", () => {
  const focus = buildOfficeFocusStripView({
    selectedResident: null,
    selectedRoom: {
      roomId: "project-main",
      label: "Central Commons",
      kind: "lobby",
      teamId: "advising_team",
      teamLabel: "Advising Team",
      schema: {
        roomId: "project-main",
        label: "Central Commons",
        kind: "lobby",
        teamId: "advising_team",
        teamLabel: "Advising Team",
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        priority: "hero",
        fixtureClusters: [],
        stationAnchors: [],
        taskAnchors: [],
        handoffAnchor: { left: 0, top: 0 },
        doors: [],
        windows: [],
        slots: [],
        overflowSlot: { left: 0, top: 0 },
      },
      snapshot: {
        roomId: "project-main",
        label: "Central Commons",
        kind: "lobby",
        teamId: "advising_team",
        teamLabel: "Advising Team",
        agentCount: 2,
        runningCount: 1,
        taskCount: 4,
        signalCount: 1,
        latestFamily: "approval",
        residents: [],
        tone: "info",
      },
      residents: [],
      visibleResidents: [],
      taskNodes: [],
      overflowCount: 0,
    },
    roleLabels: {},
  });

  assert.equal(focus.eyebrow, "Advising Team");
  assert.equal(focus.headline, "Central Commons");
  assert.match(focus.summary, /2 residents/);
  assert.match(focus.summary, /4 tasks/);
  assert.match(focus.detail, /live operator lanes|Quiet room/);
});
