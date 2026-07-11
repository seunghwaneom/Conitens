import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  comparePixelY,
  getPixelLayerIndex,
  PROP_ANCHOR_RULE,
  ROOM_TILE_COLUMNS,
  SHADOW_PX,
  snapPercentToRoomTile,
  SPRITE_SCALE,
} from "../src/spatial-lens/viewport/pixelSpriteGrammar.ts";
import {
  createFloorViewportCameraFrame,
  FLOOR_VIEWPORT_CAMERA_ZOOMS,
} from "../src/spatial-lens/viewport/viewportCamera.ts";
import { demoAgents, demoEvents, demoTasks } from "../src/demo-data.ts";
import { createOfficePresenceModel } from "../src/office-presence-model.ts";
import {
  createFocusedHandoffWorkbenchModel,
  getAgentWorkState,
} from "../src/spatial-lens/model/focusedHandoffModel.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_SRC = path.resolve(TEST_DIR, "../src");
const SPATIAL_LENS_ROOT = path.resolve(TEST_DIR, "../src/spatial-lens");

test("spatial lens pixel grammar uses integer scale and hard shadow anchors", () => {
  assert.equal(Number.isInteger(SPRITE_SCALE), true);
  assert.equal(SPRITE_SCALE, 2);
  assert.equal(SHADOW_PX, 1);
  assert.equal(PROP_ANCHOR_RULE, "bottom-center");
});

test("spatial lens pixel grammar snaps props to the room tile field", () => {
  assert.equal(ROOM_TILE_COLUMNS, 24);
  assert.equal(snapPercentToRoomTile(50), 50);
  assert.equal(snapPercentToRoomTile(51), 50);
  assert.equal(snapPercentToRoomTile(53), 54.167);
  assert.equal(snapPercentToRoomTile(-3), 0);
  assert.equal(snapPercentToRoomTile(103), 100);
});

test("spatial lens pixel grammar y-sorts props deterministically", () => {
  const props = [
    { id: "b", y: 40, layer: "floor" },
    { id: "a", y: 40, layer: "floor" },
    { id: "wall", y: 80, layer: "wall" },
    { id: "op", y: 10, layer: "operational" },
  ];

  assert.deepEqual([...props].sort(comparePixelY).map((prop) => prop.id), [
    "op",
    "a",
    "b",
    "wall",
  ]);
  assert.ok(
    getPixelLayerIndex({ y: 80, layer: "wall" }) >
      getPixelLayerIndex({ y: 10, layer: "operational" }),
  );
});

test("spatial lens focused camera defaults to ops control and enlarges the floor", () => {
  const camera = createFloorViewportCameraFrame({
    focusedRoomId: null,
    rooms: [
      { id: "ops-control", rect: { x: 3, y: 3, w: 30, h: 18 } },
      { id: "validation-office", rect: { x: 61, y: 23, w: 30, h: 18 } },
    ],
  });
  const viewportSource = readSpatialLensSource("components/FloorViewport.tsx");

  assert.equal(camera.focusRoomId, "ops-control");
  assert.equal(camera.targetRoomId, null);
  assert.equal(Number.isInteger(camera.scale), true);
  assert.equal(camera.scale, FLOOR_VIEWPORT_CAMERA_ZOOMS.focused);
  assert.equal(camera.width, 100);
  assert.equal(camera.height, 100);
  assert.equal(camera.left, -4);
  assert.equal(camera.top, 6.5);
  assert.deepEqual(camera.sceneBounds, { x: 1.333, y: 0, w: 33.333, h: 31.167 });
  assert.match(viewportSource, /data-camera-stage="floor"/);
});

test("spatial lens focused camera biases toward a connected handoff target", () => {
  const camera = createFloorViewportCameraFrame({
    focusedRoomId: "ops-control",
    rooms: [
      { id: "ops-control", rect: { x: 3, y: 3, w: 30, h: 18 } },
      { id: "validation-office", rect: { x: 61, y: 23, w: 30, h: 18 } },
    ],
    handoffRoutes: [
      {
        fromRoomId: "ops-control",
        toRoomId: "validation-office",
      },
    ],
  });

  assert.equal(camera.focusRoomId, "ops-control");
  assert.equal(camera.targetRoomId, "validation-office");
  assert.equal(camera.scale, FLOOR_VIEWPORT_CAMERA_ZOOMS.focused);
  assert.equal(camera.left, -47.5);
  assert.equal(camera.top, -5.5);
  assert.deepEqual(camera.sceneBounds, { x: 15.833, y: 1.833, w: 33.333, h: 33.333 });
  assert.ok(
    camera.sceneBounds.x + camera.sceneBounds.w >= 47.5,
    "focused route camera should include the central corridor edge",
  );
});

test("spatial lens floor overview camera keeps the full topology at 1x", () => {
  const camera = createFloorViewportCameraFrame({
    mode: "overview",
    focusedRoomId: "validation-office",
    rooms: [
      { id: "ops-control", rect: { x: 3, y: 3, w: 30, h: 18 } },
      { id: "validation-office", rect: { x: 61, y: 23, w: 30, h: 18 } },
    ],
  });

  assert.equal(camera.mode, "overview");
  assert.equal(camera.scale, FLOOR_VIEWPORT_CAMERA_ZOOMS.overview);
  assert.equal(camera.targetRoomId, null);
  assert.equal(camera.left, 0);
  assert.equal(camera.top, 0);
  assert.equal(camera.width, 100);
  assert.equal(camera.height, 100);
  assert.deepEqual(camera.sceneBounds, { x: 0, y: 0, w: 100, h: 100 });
});

test("focused handoff workbench model surfaces the active blocker chain", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });
  const model = createFocusedHandoffWorkbenchModel({
    rooms: office.rooms,
    tasks: demoTasks,
    handoffs: office.handoffs,
    events: demoEvents,
    selectedRoomId: "ops-control",
    selectedResidentId: "architect",
  });

  assert.equal(model.blockedTaskId, "q_184_owner_gate");
  assert.equal(model.nextActionKind, "owner-approval");
  assert.equal(model.nextActionLabel, "Owner approval required");
  assert.equal(model.nextActionCtaLabel, "Open approvals");
  assert.equal(model.nextActionHref, "#/approvals");
  assert.equal(model.handoffSummaryLabel, "verify_append handoff: architect -> sentinel");
  assert.equal(model.routeLabel, "architect->sentinel->owner");
  assert.equal(model.blockedAgeLabel, "blocked 11m");
  assert.equal(model.latestEventLabel, "08:14:52 worker-1 artifact.written");
  assert.deepEqual(
    model.steps.map((step) => [step.primary, step.label, step.state]),
    [
      ["architect", "PLAN", "RUNNING"],
      ["q_184_owner_gate", "BLOCKED", "BLOCKED"],
      ["sentinel", "VALIDATE", "REVIEW"],
      ["owner", "APPROVE", "BLOCKED"],
    ],
  );
  assert.deepEqual(
    model.edges.map((e) => [e.id, e.state]),
    [
      ["plan-blocked", "flow"],
      ["blocked-validate", "held"],
      ["validate-approve", "held"],
    ],
  );
  assert.deepEqual(model.spatialContexts.map((context) => context.id), [
    "ops-control",
    "validation-office",
  ]);
});

test("focused handoff workbench model does not invent a blocked owner gate", () => {
  const tasksWithoutBlocker = demoTasks.filter((task) => task.state !== "blocked");
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: tasksWithoutBlocker,
    events: demoEvents,
  });
  const model = createFocusedHandoffWorkbenchModel({
    rooms: office.rooms,
    tasks: tasksWithoutBlocker,
    handoffs: office.handoffs,
    events: demoEvents,
    selectedRoomId: "ops-control",
    selectedResidentId: "architect",
  });
  const gateStep = model.steps.find((step) => step.id === "blocked");

  assert.equal(model.nextActionKind, "sentinel-review");
  assert.equal(model.nextActionLabel, "Sentinel review required");
  assert.equal(model.nextActionCtaLabel, "Open review queue");
  assert.equal(model.nextActionHref, "#/tasks");
  assert.equal(model.nextActionDetail, "verify_append is ready for sentinel review");
  assert.equal(model.headline, "No blocked owner gate");
  assert.equal(model.blockedAgeLabel, "");
  assert.ok(gateStep);
  assert.equal(gateStep.label, "CLEAR");
  assert.equal(gateStep.state, "CLEAR");
  assert.equal(gateStep.tone, "idle");
  assert.notEqual(gateStep.primary, "wf_apply");
});

test("focused handoff workbench blocked age starts from the block-opening event", () => {
  const eventsWithEarlierTaskEvent = [
    {
      event_id: "evt-prior-task-created",
      type: "task.created",
      ts: "2026-03-21T07:00:00.000Z",
      actor: { kind: "agent", id: "architect" },
      task_id: "q_184_owner_gate",
      payload: {},
    },
    ...demoEvents,
  ];
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: eventsWithEarlierTaskEvent,
  });
  const model = createFocusedHandoffWorkbenchModel({
    rooms: office.rooms,
    tasks: demoTasks,
    handoffs: office.handoffs,
    events: eventsWithEarlierTaskEvent,
    selectedRoomId: "ops-control",
    selectedResidentId: "architect",
  });

  assert.equal(model.blockedAgeLabel, "blocked 11m");
});

test("focused handoff workbench model emits empty labels and correct edges without events", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });
  const model = createFocusedHandoffWorkbenchModel({
    rooms: office.rooms,
    tasks: demoTasks,
    handoffs: office.handoffs,
    selectedRoomId: "ops-control",
    selectedResidentId: "architect",
  });

  assert.equal(model.blockedAgeLabel, "");
  assert.equal(model.latestEventLabel, "");
  assert.deepEqual(
    model.edges.map((e) => [e.id, e.state]),
    [
      ["plan-blocked", "flow"],
      ["blocked-validate", "held"],
      ["validate-approve", "held"],
    ],
  );
});

test("getAgentWorkState returns REVIEW for a handoff target and BLOCKED for a blocked-task assignee", () => {
  const residents = [
    { agentId: "sentinel", status: "running" },
    { agentId: "owner", status: "idle" },
  ];
  const tasks = [
    { taskId: "q_184_owner_gate", state: "blocked", assignee: "owner" },
    { taskId: "verify_append", state: "review", assignee: "sentinel" },
  ];
  const handoffs = [
    { id: "h1", actorId: "architect", targetId: "sentinel", taskId: "verify_append",
      fromRoomId: "ops-control", toRoomId: "validation-office", timestamp: "2026-03-21T08:05:02.000Z" },
  ];

  assert.equal(getAgentWorkState("sentinel", residents, tasks, handoffs), "REVIEW");
  assert.equal(getAgentWorkState("owner", residents, tasks, handoffs), "BLOCKED");
});

test("agent work state vocabulary is shared between workbench and sidebar rail", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });
  const residents = office.rooms.flatMap((room) => room.residents);
  const sidebarSource = readDashboardSource("components/OfficeSidebar.tsx");

  assert.equal(getAgentWorkState("architect", residents, demoTasks, office.handoffs), "RUNNING");
  assert.equal(getAgentWorkState("sentinel", residents, demoTasks, office.handoffs), "REVIEW");
  assert.equal(getAgentWorkState("owner", residents, demoTasks, office.handoffs), "BLOCKED");
  assert.match(sidebarSource, /getAgentWorkState\(/);
  assert.doesNotMatch(
    sidebarSource,
    /\{resident\.status\}/,
    "sidebar rail badge must print the shared work state, not raw runtime status",
  );
});

test("spatial lens handoff packet is an in-world object with a floor slot", () => {
  const overlaySource = readSpatialLensSource("components/HandoffOverlay.tsx");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(overlaySource, /data-handoff-packet-slot=/);
  assert.match(cssSource, /\.handoff-packet-slot/);
  assert.match(cssSource, /\.handoff-packet-slot::before/);
  assert.match(cssSource, /\.handoff-packet-slot > \.handoff-packet/);
  assert.equal(
    (overlaySource.match(/data-handoff-packet=/g) ?? []).length,
    1,
    "route overlay should render one packet sprite, inside the physical slot",
  );
});

test("spatial lens handoff route uses corridor guide tiles for storytelling", () => {
  const overlaySource = readSpatialLensSource("components/HandoffOverlay.tsx");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(overlaySource, /data-handoff-route-guide=/);
  assert.match(overlaySource, /routeToGuideTiles/);
  assert.match(overlaySource, /kind: "source"/);
  assert.doesNotMatch(overlaySource, /kind: "spine"/);
  assert.doesNotMatch(overlaySource, /kind: "target"/);
  assert.match(cssSource, /\.handoff-route-guide-tile/);
  assert.doesNotMatch(cssSource, /data-route-guide-kind="target"/);
});

test("spatial lens floor viewport no longer mounts focused corridor continuity", () => {
  const viewportSource = readSpatialLensSource("components/FloorViewport.tsx");

  assert.doesNotMatch(viewportSource, /FocusedCorridorContinuityLayer/);
  assert.equal(
    existsSync(path.join(SPATIAL_LENS_ROOT, "components/FocusedCorridorContinuityLayer.tsx")),
    false,
  );
});

test("spatial lens focused mode renders the handoff workbench before the character stage", () => {
  const officeStageSource = readDashboardSource("components/OfficeStage.tsx");
  const characterStageSource = readDashboardSource("components/AgentCharacterStage.tsx");
  const viewportSource = readSpatialLensSource("components/FloorViewport.tsx");

  assert.equal(existsSync(path.join(SPATIAL_LENS_ROOT, "components/MinimapDock.tsx")), false);
  assert.doesNotMatch(viewportSource, /import \{ MinimapDock \}/);
  assert.doesNotMatch(viewportSource, /<MinimapDock/);
  assert.match(officeStageSource, /stageMode === "focused"/);
  assert.match(officeStageSource, /<FocusedHandoffView/);
  assert.match(officeStageSource, /<AgentCharacterStage/);
  assert.ok(
    officeStageSource.indexOf("<FocusedHandoffView") <
      officeStageSource.indexOf("<AgentCharacterStage"),
    "the active handoff workbench must remain the primary focused surface",
  );
  assert.match(characterStageSource, /data-agent-character-stage="true"/);
  assert.match(characterStageSource, /data-agent-character-card/);
  assert.match(officeStageSource, /viewMode="overview"/);
  assert.doesNotMatch(officeStageSource, /viewMode=\{stageMode\}/);
  assert.doesNotMatch(officeStageSource, /viewMode="focused"/);
});

test("spatial lens focused mode keeps the workbench authoritative and the character stage informative", () => {
  const officeStageSource = readDashboardSource("components/OfficeStage.tsx");
  const characterStageSource = readDashboardSource("components/AgentCharacterStage.tsx");
  const workbenchSource = readSpatialLensSource("components/FocusedHandoffView.tsx");
  const characterModelSource = readDashboardSource("agent-character-stage-model.ts");
  const modelSource = readSpatialLensSource("model/focusedHandoffModel.ts");
  const nextActionSource = readSpatialLensSource("model/focusedNextAction.ts");
  const viewportSource = readSpatialLensSource("components/FloorViewport.tsx");
  const roomSource = readSpatialLensSource("components/RoomZone.tsx");
  const agentLayerSource = readSpatialLensSource("viewport/AgentLayer.tsx");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.match(officeStageSource, /isSelected && entry\.mode === "focused" \? \(/);
  assert.match(workbenchSource, /data-active-handoff-workbench="true"/);
  assert.match(workbenchSource, /data-workbench-primary="active-handoff"/);
  assert.match(workbenchSource, /model\.nextActionLabel/);
  assert.match(characterStageSource, /data-agent-character-stage="true"/);
  assert.match(characterStageSource, /model\.handoffLabel/);
  assert.match(characterStageSource, /model\.blockedLabel/);
  assert.match(characterStageSource, /model\.nextActionHref/);
  assert.match(characterStageSource, /model\.nextActionKind/);
  assert.match(characterStageSource, /model\.nextActionCtaLabel/);
  assert.match(characterModelSource, /getAgentWorkState/);
  assert.match(characterModelSource, /handoffLabel/);
  assert.match(characterModelSource, /blockedLabel/);
  assert.match(characterModelSource, /nextActionLabel/);
  assert.match(characterModelSource, /deriveFocusedNextAction/);
  assert.match(characterModelSource, /nextActionHref/);
  assert.match(modelSource, /"q_184_owner_gate"/);
  assert.match(nextActionSource, /"Owner approval required"/);
  assert.match(modelSource, /handoffSummaryLabel/);
  assert.match(modelSource, /verify_append/);
  assert.match(modelSource, /routeLabel: `\$\{actorId\}->\$\{targetId\}->\$\{ownerId\}`/);
  assert.doesNotMatch(viewportSource, /data-operator-focus-map=/);
  assert.match(viewportSource, /data-map-task-treatment=/);
  assert.doesNotMatch(viewportSource, /showTaskNodes=\{!isFocusedMode\}/);
  assert.doesNotMatch(viewportSource, /PhaseLaneIndicator/);
  assert.doesNotMatch(viewportSource, /data-focused-handoff-rail=/);
  assert.doesNotMatch(viewportSource, /data-handoff-chain-task=/);
  assert.doesNotMatch(viewportSource, /data-next-operator-action=/);
  assert.match(roomSource, /data-room-task-treatment=/);
  assert.match(roomSource, /data-room-focus-role=/);
  assert.match(roomSource, /showTaskNodes/);
  assert.match(agentLayerSource, /operatorFocusOnly/);
  assert.match(agentLayerSource, /data-agent-visibility/);
  assert.match(cssSource, /\.focused-workbench-root/);
  assert.match(cssSource, /\.focused-workbench-flow/);
  assert.match(cssSource, /\.focused-context-strip/);
  assert.match(cssSource, /data-room-focus-role="background"/);
});

test("spatial lens handoff relation keeps route motion in overview and task identity in the workbench", () => {
  const overlaySource = readSpatialLensSource("components/HandoffOverlay.tsx");
  const workbenchSource = readSpatialLensSource("components/FocusedHandoffView.tsx");
  const nextActionSource = readSpatialLensSource("model/focusedNextAction.ts");
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  assert.doesNotMatch(overlaySource, /data-handoff-edge-label=/);
  assert.doesNotMatch(overlaySource, /HANDOFF/);
  assert.match(overlaySource, /data-handoff-route-pulse=/);
  assert.match(overlaySource, /routeToPulsePoint/);
  assert.match(workbenchSource, /data-handoff-chain-task=\{model\.blockedTaskId\}/);
  assert.match(workbenchSource, /href=\{model\.nextActionHref\}/);
  assert.match(workbenchSource, /model\.handoffSummaryLabel/);
  assert.match(nextActionSource, /owner-approval/);
  assert.doesNotMatch(cssSource, /\.handoff-route-label/);
  assert.match(cssSource, /\.focused-workbench-step\[data-workbench-step="blocked"\]/);
  assert.match(cssSource, /\.handoff-route-pulse/);
});

test("spatial lens focused mode no longer exports offscreen agent rail", () => {
  const indexSource = readSpatialLensSource("index.ts");
  const agentLayerSource = readSpatialLensSource("viewport/AgentLayer.tsx");

  assert.doesNotMatch(indexSource, /AgentOffscreenRail/);
  assert.doesNotMatch(agentLayerSource, /export function AgentOffscreenRail/);
  assert.doesNotMatch(agentLayerSource, /data-agent-offscreen-treatment/);
});

test("spatial lens CSS uses only integer scale transforms", () => {
  const cssSource = readSpatialLensSource("styles/spatial-lens.module.css");

  for (const match of cssSource.matchAll(/scale\(([^)]+)\)/g)) {
    const value = match[1].trim();
    if (value.startsWith("var(")) continue;
    assert.ok(["1", "2", "3"].includes(value), `non-integer CSS scale: ${value}`);
  }
});

function readSpatialLensSource(relativePath) {
  return readFileSync(path.join(SPATIAL_LENS_ROOT, relativePath), "utf8");
}

function readDashboardSource(relativePath) {
  return readFileSync(path.join(DASHBOARD_SRC, relativePath), "utf8");
}
