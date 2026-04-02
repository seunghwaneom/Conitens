import test from "node:test";
import assert from "node:assert/strict";
import { demoAgents, demoEvents, demoTasks } from "../src/demo-data.ts";
import {
  createOfficePresenceModel,
  resolveOfficeSelection,
} from "../src/office-presence-model.ts";
import {
  OFFICE_AVATAR_FACINGS,
  OFFICE_AVATAR_POSES,
  OFFICE_AVATAR_REGISTRY,
  resolveOfficeAvatarSprite,
} from "../src/office-avatar-sprites.ts";
import { OFFICE_AGENT_PROFILES } from "../src/agent-profiles.ts";
import {
  OFFICE_FIXTURE_REGISTRY,
  getOfficeFixtureStyle,
} from "../src/office-fixture-registry.ts";
import { OFFICE_CANONICAL_ROLE_CONTRACT } from "../src/office-sprite-contract.ts";
import { OFFICE_TEAM_BRIEFS } from "../src/office-team-briefs.ts";
import {
  OFFICE_STAGE_CORRIDOR_FIXTURES,
  OFFICE_STAGE_ROOMS,
} from "../src/office-stage-schema.ts";

test("hybrid room-to-team mapping matches the agreed floorplate model", () => {
  assert.deepEqual(
    OFFICE_STAGE_ROOMS.map((room) => [room.roomId, room.teamId]),
    [
      ["ops-control", "plan_team"],
      ["impl-office", "refactor_team"],
      ["project-main", "advising_team"],
      ["research-lab", "research_team"],
      ["validation-office", "review_team"],
      ["review-office", "design_team"],
    ],
  );
});

test("office presence model projects residents with team labels from the stage schema", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });

  const architect = office.residents.find((resident) => resident.agentId === "architect");
  const sentinel = office.residents.find((resident) => resident.agentId === "sentinel");

  assert.deepEqual(
    {
      roomId: architect?.roomId,
      teamLabel: architect?.teamLabel,
      role: architect?.profile.role,
    },
    {
      roomId: "ops-control",
      teamLabel: "Plan Team",
      role: "orchestrator",
    },
  );
  assert.deepEqual(
    {
      roomId: sentinel?.roomId,
      teamLabel: sentinel?.teamLabel,
      role: sentinel?.profile.role,
    },
    {
      roomId: "validation-office",
      teamLabel: "Review Team",
      role: "validator",
    },
  );
});

test("office selection falls back to the first visible resident in the chosen room", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });

  assert.deepEqual(
    resolveOfficeSelection({
      rooms: office.rooms,
      selectedRoomId: "validation-office",
      selectedResidentId: "missing-agent",
    }),
    {
      selectedRoomId: "validation-office",
      selectedResidentId: "sentinel",
    },
  );
});

test("office presence model uses overflow counts instead of rendering extra room clutter", () => {
  const office = createOfficePresenceModel({
    agents: [
      { agentId: "architect", status: "running" },
      { agentId: "manager-default", status: "idle" },
      { agentId: "owner", status: "idle" },
      { agentId: "ops-scout", status: "idle" },
    ],
    tasks: [],
    events: [],
  });

  const opsControl = office.rooms.find((room) => room.roomId === "ops-control");
  assert.equal(opsControl?.visibleResidents.length, 3);
  assert.equal(opsControl?.overflowCount, 1);
});

test("fixture registry covers every room and corridor fixture kind in the floorplate schema", () => {
  const schemaFixtureKinds = new Set([
    ...OFFICE_STAGE_ROOMS.flatMap((room) =>
      room.fixtureClusters.flatMap((cluster) => cluster.fixtures.map((fixture) => fixture.kind)),
    ),
    ...OFFICE_STAGE_CORRIDOR_FIXTURES.map((fixture) => fixture.kind),
  ]);

  for (const kind of schemaFixtureKinds) {
    assert.ok(kind in OFFICE_FIXTURE_REGISTRY, `missing fixture registry for ${kind}`);
  }
});

test("fixture registry resolves pixel-art PNG assets instead of SVG sheets", () => {
  const deskStyle = getOfficeFixtureStyle("desk");
  const coffeeStyle = getOfficeFixtureStyle("coffee");

  assert.match(String(deskStyle.backgroundImage), /\.png/);
  assert.match(String(coffeeStyle.backgroundImage), /\.png/);
});

test("dashboard office profiles inherit canonical default rooms and sprite sheet paths from command-center", () => {
  for (const [role, profile] of Object.entries(OFFICE_AGENT_PROFILES)) {
    assert.equal(profile.homeRoomId, OFFICE_CANONICAL_ROLE_CONTRACT[role].defaultRoom);
    assert.equal(typeof OFFICE_CANONICAL_ROLE_CONTRACT[role].commandCenterSheetPath, "string");
    assert.ok(OFFICE_CANONICAL_ROLE_CONTRACT[role].commandCenterSheetPath.includes(`/sprites/agent-${role}.png`));
  }
});

test("every floorplate room has a team brief and the commons carries an ambient focal cluster", () => {
  for (const room of OFFICE_STAGE_ROOMS) {
    assert.ok(OFFICE_TEAM_BRIEFS[room.teamId]);
    assert.ok(room.handoffAnchor);
    assert.ok(room.taskAnchors.length >= 2);
    assert.ok(["hero", "support", "quiet"].includes(room.priority));
  }

  const commons = OFFICE_STAGE_ROOMS.find((room) => room.roomId === "project-main");
  assert.ok(commons?.fixtureClusters.some((cluster) => cluster.id === "commons-table"));
  assert.ok(commons?.fixtureClusters.some((cluster) => cluster.fixtures.some((fixture) => fixture.kind === "lamp")));
  assert.ok(commons?.fixtureClusters.some((cluster) => cluster.fixtures.some((fixture) => fixture.kind === "coffee")));
});

test("impl office is densified with workbench support and ambient fixtures", () => {
  const implOffice = OFFICE_STAGE_ROOMS.find((room) => room.roomId === "impl-office");
  assert.ok(implOffice);

  const fixtureKinds = implOffice.fixtureClusters.flatMap((cluster) => cluster.fixtures.map((fixture) => fixture.kind));
  assert.ok(fixtureKinds.includes("monitor"));
  assert.ok(fixtureKinds.includes("lamp"));
  assert.ok(fixtureKinds.includes("note"));
  assert.ok(fixtureKinds.includes("cabinet"));
  assert.ok(fixtureKinds.includes("coffee"));
  assert.ok(fixtureKinds.length >= 10);
});

test("specialist wing rooms keep lean identities with restrained polish", () => {
  const ops = OFFICE_STAGE_ROOMS.find((room) => room.roomId === "ops-control");
  const research = OFFICE_STAGE_ROOMS.find((room) => room.roomId === "research-lab");
  const validation = OFFICE_STAGE_ROOMS.find((room) => room.roomId === "validation-office");
  const review = OFFICE_STAGE_ROOMS.find((room) => room.roomId === "review-office");

  const opsKinds = ops.fixtureClusters.flatMap((cluster) => cluster.fixtures.map((fixture) => fixture.kind));
  const researchKinds = research.fixtureClusters.flatMap((cluster) => cluster.fixtures.map((fixture) => fixture.kind));
  const validationKinds = validation.fixtureClusters.flatMap((cluster) => cluster.fixtures.map((fixture) => fixture.kind));
  const reviewKinds = review.fixtureClusters.flatMap((cluster) => cluster.fixtures.map((fixture) => fixture.kind));

  assert.equal(opsKinds.filter((kind) => kind === "chair").length, 1);
  assert.ok(researchKinds.includes("lamp"));
  assert.ok(validationKinds.includes("clock"));
  assert.equal(reviewKinds.includes("bench"), false);
});

test("office presence model emits at most two visible task nodes per room with priority ordering", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: [
      { taskId: "blocked-1", state: "blocked", assignee: "owner" },
      { taskId: "review-1", state: "review", assignee: "owner" },
      { taskId: "active-1", state: "active", assignee: "owner" },
    ],
    events: demoEvents,
  });

  const ops = office.rooms.find((room) => room.roomId === "ops-control");
  assert.deepEqual(
    ops?.taskNodes.map((task) => [task.taskId, task.tone]),
    [
      ["blocked-1", "danger"],
      ["review-1", "warning"],
    ],
  );
});

test("avatar registry resolves every pose/facing variant used by the stage without dead inline sprite helpers", async () => {
  for (const role of Object.keys(OFFICE_AGENT_PROFILES)) {
    for (const pose of OFFICE_AVATAR_POSES) {
      for (const facing of OFFICE_AVATAR_FACINGS) {
        const style = resolveOfficeAvatarSprite({ role, pose, facing });
        assert.equal(typeof style.backgroundImage, "string");
        assert.match(String(style.backgroundImage), /\.png/);
      }
    }
  }

  const avatarModule = await import("../src/office-avatar-sprites.ts");
  assert.equal("getOfficeAvatarSprite" in avatarModule, false);
  assert.equal("getOfficeAvatarTransform" in avatarModule, false);
  assert.ok(Object.keys(OFFICE_AVATAR_REGISTRY).length > 0);
});
