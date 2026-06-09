import test from "node:test";
import assert from "node:assert/strict";
import { AGENTS as COMMAND_CENTER_AGENTS } from "../../command-center/src/data/agents.ts";
import {
  OFFICE_CANONICAL_ROLES,
  getAgentOfficeProfile,
} from "../src/agent-profiles.ts";
import { compareAgentAttention, getAgentAttentionLevel } from "../src/agent-fleet-model.ts";
import { OFFICE_STAGE_ROOMS } from "../src/office-stage-schema.ts";

test("agent office profiles map orchestrator-like ids to the ops control persona", () => {
  assert.equal(getAgentOfficeProfile("architect").role, "orchestrator");
  assert.equal(getAgentOfficeProfile("owner").homeRoomId, "ops-control");
});

test("agent office profiles map implementer-like ids to the implementation persona", () => {
  const profile = getAgentOfficeProfile("worker-1");
  assert.equal(profile.role, "implementer");
  assert.equal(profile.signatureProp, "tool roll");
  assert.equal(profile.mark, "⚙");
});

test("agent office profiles map validator-like ids to the validation persona", () => {
  const profile = getAgentOfficeProfile("sentinel");
  assert.equal(profile.role, "validator");
  assert.ok(profile.longTermFocus.includes("verify failures"));
  assert.equal(profile.accessory, "shield");
});

test("dashboard office canonical roles align with command-center roles", () => {
  const dashboardRoles = [...OFFICE_CANONICAL_ROLES].sort();
  const commandCenterRoles = [...new Set(COMMAND_CENTER_AGENTS.map((agent) => agent.role))].sort();

  assert.deepEqual(dashboardRoles, commandCenterRoles);
});

test("dashboard office home rooms align with floorplate room ids", () => {
  const roomIds = new Set(OFFICE_STAGE_ROOMS.map((room) => room.roomId));
  for (const role of OFFICE_CANONICAL_ROLES) {
    assert.equal(roomIds.has(getAgentOfficeProfile(role).homeRoomId), true);
  }
});

test("agent attention ordering prioritizes review and blocked work", () => {
  const agents = [
    { id: "stable", name: "Stable", role: "reviewer", archetype: "Inspector", status: "idle", roomId: "review-office", taskCount: 1, lastActive: "2026-04-02T03:00:00Z", memoryCount: 2, errorRate: 0 },
    { id: "blocked", name: "Blocked", role: "researcher", archetype: "Explorer", status: "paused", roomId: "research-lab", taskCount: 1, lastActive: "2026-04-02T03:00:00Z", memoryCount: 2, errorRate: 0 },
    { id: "review", name: "Review", role: "validator", archetype: "Gatekeeper", status: "running", roomId: "validation-office", taskCount: 1, lastActive: "2026-04-02T03:00:00Z", memoryCount: 2, errorRate: 0.08 },
  ];

  assert.equal(getAgentAttentionLevel(agents[2]), "review");
  assert.equal(getAgentAttentionLevel(agents[1]), "blocked");
  assert.deepEqual(agents.slice().sort(compareAgentAttention).map((agent) => agent.id), [
    "review",
    "blocked",
    "stable",
  ]);
});
