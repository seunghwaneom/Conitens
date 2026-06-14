import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_STATIONS,
  getAgentStationsForRoom,
  mapStationRoleHint,
} from "../src/spatial-lens/viewport/agentStations.ts";
import {
  chooseAgentActivityCue,
  mapAgentToStation,
  mapAgentToVisualRole,
  mapAgentToVisualState,
  mapHandoffToActivityCue,
  mapTaskToActivityCue,
  shouldRenderAgentInOperatorFocusMap,
} from "../src/spatial-lens/viewport/agentVisualState.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

const architect = {
  agentId: "architect",
  status: "running",
  roomId: "ops-control",
  profile: { role: "orchestrator" },
  taskCount: 1,
  roleTaskCount: 1,
};

const sentinel = {
  agentId: "sentinel",
  status: "idle",
  roomId: "validation-office",
  profile: { role: "validator" },
  taskCount: 1,
  roleTaskCount: 1,
};

const owner = {
  agentId: "owner",
  status: "idle",
  roomId: "ops-control",
  profile: { role: "orchestrator" },
  taskCount: 1,
  roleTaskCount: 1,
};

const worker = {
  agentId: "worker-1",
  status: "idle",
  roomId: "impl-office",
  profile: { role: "implementer" },
  taskCount: 1,
  roleTaskCount: 0,
};

test("agent station model reuses authored room slots", () => {
  assert.ok(AGENT_STATIONS.length >= 10);
  assert.deepEqual(
    getAgentStationsForRoom("ops-control").map((station) => station.slotId),
    ["architect-seat", "floor-lead-seat", "handoff-seat"],
  );
  assert.equal(mapStationRoleHint("validator"), "sentinel");
  assert.equal(mapStationRoleHint("builder"), "worker");
});

test("agent visual roles map named Conitens agents to sprite roles", () => {
  assert.equal(mapAgentToVisualRole(architect), "architect");
  assert.equal(mapAgentToVisualRole(sentinel), "sentinel");
  assert.equal(mapAgentToVisualRole(owner), "owner");
  assert.equal(mapAgentToVisualRole(worker), "worker");
});

test("agent visual states prioritize blocked, review, active, and assigned work", () => {
  assert.equal(
    mapAgentToVisualState(owner, [{ taskId: "blocked", state: "blocked", assignee: "owner" }]),
    "blocked",
  );
  assert.equal(
    mapAgentToVisualState(sentinel, [{ taskId: "review", state: "review", assignee: "sentinel" }]),
    "reviewing",
  );
  assert.equal(
    mapAgentToVisualState(architect, [{ taskId: "active", state: "active", assignee: "architect" }]),
    "working",
  );
  assert.equal(
    mapAgentToVisualState(worker, [{ taskId: "assigned", state: "assigned", assignee: "worker-1" }]),
    "waiting_for_input",
  );
});

test("owner review state uses the curated generated sprite frame", () => {
  const spriteSource = readFileSync(
    path.join(TEST_DIR, "../src/spatial-lens/viewport/AgentSprite.tsx"),
    "utf8",
  );

  assert.match(spriteSource, /state === "reviewing"/);
  assert.match(spriteSource, /state === "handoff_receiving"/);
  assert.match(spriteSource, /return "character\.ownerReviewing"/);
});

test("handoff targets make sentinel read as a review receiver", () => {
  const handoff = {
    id: "handoff-1",
    fromRoomId: "ops-control",
    fromLabel: "Ops Control",
    toRoomId: "validation-office",
    toLabel: "Validation Office",
    taskId: "verify_append",
    actorId: "architect",
    targetId: "sentinel",
    timestamp: "2026-06-08T00:00:00.000Z",
  };

  assert.equal(mapAgentToVisualState(sentinel, [], [handoff]), "reviewing");
  assert.equal(mapHandoffToActivityCue(handoff, architect).kind, "handoff_send");
  assert.equal(mapHandoffToActivityCue(handoff, sentinel).kind, "handoff_receive");
});

test("agent station matching prefers role-specific slots in the resident room", () => {
  assert.equal(
    mapAgentToStation(architect, AGENT_STATIONS)?.id,
    "ops-control.architect-seat",
  );
  assert.equal(
    mapAgentToStation(owner, AGENT_STATIONS)?.id,
    "ops-control.floor-lead-seat",
  );
  assert.equal(
    mapAgentToStation(worker, AGENT_STATIONS)?.id,
    "impl-office.builder-a",
  );
  assert.equal(
    mapAgentToStation(sentinel, AGENT_STATIONS)?.id,
    "validation-office.validator-a",
  );
});

test("activity cues distinguish live agent states", () => {
  assert.equal(mapTaskToActivityCue({ taskId: "blocked", state: "blocked", assignee: "owner" })?.kind, "blocked");
  assert.equal(mapTaskToActivityCue({ taskId: "review", state: "review", assignee: "sentinel" })?.kind, "review");
  assert.equal(mapTaskToActivityCue({ taskId: "active", state: "active", assignee: "architect" })?.kind, "active");
  assert.equal(mapTaskToActivityCue({ taskId: "assigned", state: "assigned", assignee: "worker-1" })?.kind, "assigned");
  assert.equal(
    chooseAgentActivityCue(owner, [{ taskId: "blocked", state: "blocked", assignee: "owner" }]).kind,
    "blocked",
  );
});

test("operator focus map only keeps live, reviewing, and handoff agents on the floor", () => {
  const handoff = {
    id: "handoff-1",
    fromRoomId: "ops-control",
    fromLabel: "Ops Control",
    toRoomId: "validation-office",
    toLabel: "Validation Office",
    taskId: "verify_append",
    actorId: "architect",
    targetId: "sentinel",
    timestamp: "2026-06-08T00:00:00.000Z",
  };
  const workerAssignedTask = {
    taskId: "assigned",
    state: "assigned",
    assignee: "worker-1",
  };
  const ownerBlockedTask = {
    taskId: "blocked",
    state: "blocked",
    assignee: "owner",
  };

  assert.equal(
    shouldRenderAgentInOperatorFocusMap(
      architect,
      mapAgentToVisualState(architect),
      chooseAgentActivityCue(architect),
    ),
    true,
  );
  assert.equal(
    shouldRenderAgentInOperatorFocusMap(
      sentinel,
      mapAgentToVisualState(sentinel, [], [handoff]),
      chooseAgentActivityCue(sentinel, [], [handoff]),
    ),
    true,
  );
  assert.equal(
    shouldRenderAgentInOperatorFocusMap(
      worker,
      mapAgentToVisualState(worker, [workerAssignedTask]),
      chooseAgentActivityCue(worker, [workerAssignedTask]),
    ),
    false,
  );
  assert.equal(
    shouldRenderAgentInOperatorFocusMap(
      owner,
      mapAgentToVisualState(owner, [ownerBlockedTask]),
      chooseAgentActivityCue(owner, [ownerBlockedTask]),
    ),
    false,
  );
});
