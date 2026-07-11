import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoAgents, demoEvents, demoTasks } from "../src/demo-data.ts";
import { createAgentCharacterStageModel, AGENT_ROLE_MOTION_PROFILES } from "../src/agent-character-stage-model.ts";
import { AGENT_CHARACTER_PORTRAITS } from "../src/agent-character-portraits.ts";
import { createOfficePresenceModel } from "../src/office-presence-model.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_ROOT = path.resolve(TEST_DIR, "..");
const DASHBOARD_SRC = path.join(DASHBOARD_ROOT, "src");
const AGENT_SPRITE_MANIFEST = path.join(
  DASHBOARD_ROOT,
  "public/agent-sprites/generated/manifest.json",
);
const AGENT_PORTRAIT_DIR = path.join(DASHBOARD_ROOT, "public/agent-portraits/generated");

test("agent character stage model exposes sprite-gen backed role motion", () => {
  const office = createOfficePresenceModel({
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
  });

  const model = createAgentCharacterStageModel({
    residents: office.residents,
    tasks: demoTasks,
    handoffs: office.handoffs,
    selectedResidentId: "architect",
  });

  assert.equal(model.cards.length, 4);
  assert.deepEqual(model.cards.map((card) => card.agentId), [
    "architect",
    "sentinel",
    "owner",
    "worker-1",
  ]);
  assert.equal(model.cards.every((card) => card.spriteSource === "sprite-gen"), true);
  assert.ok(new Set(model.cards.map((card) => card.motionProfile)).size >= 4);
  assert.equal(model.cards.every((card) => !card.motionLabel.includes("-")), true);
  assert.equal(model.cards.find((card) => card.agentId === "architect")?.motionLabel, "Command pulse");
  assert.equal(model.cards.find((card) => card.agentId === "owner")?.habitLabel, "gate review");
  assert.equal(model.cards.find((card) => card.agentId === "architect")?.selected, true);
  assert.equal(model.cards.find((card) => card.agentId === "owner")?.role, "reviewer");
  assert.equal(model.nextActionKind, "owner-approval");
  assert.equal(model.nextActionLabel, "Owner approval required");
  assert.equal(model.nextActionCtaLabel, "Open approvals");
  assert.equal(model.nextActionHref, "#/approvals");
  assert.match(model.nextActionDetail, /q_184_owner_gate is waiting on owner/);
});

test("agent role motion profiles stay unique across canonical roles", () => {
  assert.deepEqual(AGENT_ROLE_MOTION_PROFILES, {
    orchestrator: "command-pulse",
    implementer: "build-shift",
    researcher: "research-orbit",
    reviewer: "review-scan",
    validator: "verify-brace",
  });
  assert.equal(new Set(Object.values(AGENT_ROLE_MOTION_PROFILES)).size, 5);
});

test("office preview focused stage is character-first and sprite-gen sourced", () => {
  const officeStageSource = readDashboardSource("components/OfficeStage.tsx");
  const officeAvatarSource = readDashboardSource("components/OfficeAvatar.tsx");
  const characterStageSource = readDashboardSource("components/AgentCharacterStage.tsx");
  const officeStageCss = readDashboardSource("office-stage.module.css");

  assert.match(officeStageSource, /<AgentCharacterStage/);
  assert.match(characterStageSource, /data-agent-character-stage="true"/);
  assert.match(characterStageSource, /data-agent-character-card/);
  assert.match(characterStageSource, /data-agent-character-portrait/);
  assert.match(characterStageSource, /data-motion-profile/);
  assert.match(characterStageSource, /data-next-action-kind/);
  assert.match(characterStageSource, /href=\{model\.nextActionHref\}/);
  assert.match(characterStageSource, /resolveAgentCharacterPortrait/);
  assert.match(officeStageCss, /--agent-character-figure-size:\s*clamp\(300px,\s*30vw,\s*380px\)/);
  assert.match(officeStageCss, /\.agent-character-figure\s*\{[\s\S]*height:\s*var\(--agent-character-figure-size\)/);
  assert.match(officeStageCss, /\.agent-character-portrait\s*\{[\s\S]*height:\s*calc\(100% - 14px\)/);
  assert.match(officeAvatarSource, /data-agent-avatar-source="sprite-gen"/);
  assert.doesNotMatch(officeAvatarSource, /<canvas/);
  assert.doesNotMatch(officeAvatarSource, /drawPixelAvatar/);
});

test("agent character portraits use the large generated role designs", () => {
  assert.deepEqual(Object.keys(AGENT_CHARACTER_PORTRAITS).sort(), [
    "implementer",
    "orchestrator",
    "researcher",
    "reviewer",
    "validator",
  ]);
  for (const portrait of Object.values(AGENT_CHARACTER_PORTRAITS)) {
    assert.equal(portrait.source, "imagegen-large-pixel-avatar");
    assert.equal(portrait.width >= 256, true);
    assert.equal(portrait.height >= 512, true);
    assert.match(portrait.src, /^\/agent-portraits\/generated\/[a-z-]+\.png$/);
    assert.equal(existsSync(path.join(DASHBOARD_ROOT, "public", portrait.src.slice(1))), true);
  }
  assert.equal(existsSync(path.join(AGENT_PORTRAIT_DIR, "orchestrator.png")), true);
});

test("sprite-gen character atlas manifest is auditable", () => {
  assert.equal(existsSync(AGENT_SPRITE_MANIFEST), true);
  const manifest = JSON.parse(readFileSync(AGENT_SPRITE_MANIFEST, "utf8"));

  assert.equal(manifest.generator, "sprite-gen");
  assert.equal(
    manifest.pipeline,
    "prepare_sprite_run+direct_component_rows+extract_sprite_row_frames+preview_animation+compose_sprite_atlas",
  );
  assert.equal(manifest.cellSize, 64);
  assert.deepEqual(manifest.referenceSources, [
    "user-reference:codex-clipboard-11b0d6b3-front-facing-full-body-pixel-boy.png",
    "user-reference:codex-clipboard-c73a6cca-front-facing-pixel-character-lineup.png",
    "user-reference:codex-clipboard-3a0ec65f-front-facing-rpg-character-lineup.png",
  ]);
  assert.deepEqual(Object.keys(manifest.roles).sort(), [
    "implementer",
    "orchestrator",
    "researcher",
    "reviewer",
    "validator",
  ]);
  for (const role of Object.values(manifest.roles)) {
    assert.equal(existsSync(path.join(DASHBOARD_ROOT, "public", role.atlasPath)), true);
    assert.equal(existsSync(path.join(DASHBOARD_ROOT, "public", role.qaNotesPath)), true);
    assert.match(
      readFileSync(path.join(DASHBOARD_ROOT, "public", role.qaNotesPath), "utf8"),
      /no command-center, Claude, or imported character sheet/,
    );
    assert.match(
      readFileSync(path.join(DASHBOARD_ROOT, "public", role.qaNotesPath), "utf8"),
      /front-facing full-body pixel human character sprite; portrait lineup proportions; not a top-down token/,
    );
    const requestText = readFileSync(
      path.join(DASHBOARD_ROOT, "public/agent-sprites/generated", role.role, "sprite-request.json"),
      "utf8",
    );
    assert.match(requestText, /front-facing full-body pixel human character sprite/);
    assert.match(requestText, /large readable head, expressive eyes, highlighted hair/);
    assert.match(requestText, /character lineup portrait proportions/);
    assert.match(requestText, /user-supplied front-facing pixel character references/);
    assert.doesNotMatch(requestText, /top-down|paper-doll|office-RPG|chibi|mascot-friendly|pixel token|simple avatar/i);
    assert.equal(role.frameCount >= 8, true);
  }
});

function readDashboardSource(relativePath) {
  return readFileSync(path.join(DASHBOARD_SRC, relativePath), "utf8");
}
