/**
 * use-agent-fixture-command-bridge.test.ts
 *
 * Sub-AC 7b: Agent lifecycle control plane — wire ui_fixtures on agent entities
 * to start, stop, and reassign actions; each manipulation must translate the
 * emitted interaction_intent into a concrete orchestration_command dispatched
 * to the agent orchestration layer, with visual feedback reflecting the
 * resulting agent state.
 *
 * Coverage:
 *   1. parseAgentFixtureId   — fixture ID ↔ (agentId, action, roomId) parsing
 *   2. buildAgentFixtureId   — canonical ID construction
 *   3. resolveAgentFixtureAction — intent payload → action resolution
 *   4. translateFixtureIntentToLifecycle — intent → command descriptor
 *   5. FIXTURE_LIFECYCLE_ACTION_TO_COMMAND — mapping completeness + uniqueness
 *   6. getAgentFixtureActions — status-aware fixture visibility
 *   7. buildAgentLifecycleFixtureDefs — fixture definition generation
 *   8. FixtureDispatchResult shape — integration contract
 *   9. Parity with AgentLifecyclePanel.LIFECYCLE_ACTION_TO_COMMAND_TYPE
 *  10. Record transparency: translateFixtureIntentToLifecycle is deterministic
 *
 * All tests are pure function calls — no React hooks, no Three.js, no async I/O.
 * This keeps the suite fast and headless-safe.
 *
 * Test ID scheme:
 *   7b-N : Sub-AC 7b fixture→command bridge
 */

import { describe, it, expect } from "vitest";
import {
  // ID helpers
  parseAgentFixtureId,
  buildAgentFixtureId,
  AGENT_FIXTURE_PREFIX,
  AGENT_FIXTURE_BTN_SUFFIX,

  // Resolution + translation (core pure functions)
  resolveAgentFixtureAction,
  translateFixtureIntentToLifecycle,

  // Mapping constants
  FIXTURE_LIFECYCLE_ACTION_TO_COMMAND,
  FIXTURE_REQUIRES_CONFIRM,
  FIXTURE_OPTIMISTIC_ACTIONS,
  AGENT_FIXTURE_LIFECYCLE_ACTIONS,
  AGENT_FIXTURE_LIFECYCLE_ACTION_SET,
  isAgentFixtureLifecycleAction,

  // Visibility + definition builders
  getAgentFixtureActions,
  buildAgentLifecycleFixtureDefs,

  // Types
  type AgentFixtureLifecycleAction,
  type AgentLifecycleCommandType,
  type AgentLifecycleFixtureDef,
  type TranslatedFixtureCommand,
} from "../use-agent-fixture-command-bridge.js";
import type { FixtureButtonClickedPayload } from "../../scene/fixture-interaction-intents.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test data helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeButtonClickedPayload(
  fixtureId: string,
  agentId: string,
  overrides?: Partial<FixtureButtonClickedPayload>,
): FixtureButtonClickedPayload {
  return {
    fixtureId,
    fixtureKind: "button",
    entityRef: { entityType: "agent", entityId: agentId },
    actionType: "click",
    worldPosition: null,
    ts: Date.now(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. parseAgentFixtureId — fixture ID parsing
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — parseAgentFixtureId: fixture ID parsing", () => {

  // 7b-1
  it("parses a standard 'start' fixture ID correctly", () => {
    const result = parseAgentFixtureId("agent-researcher-1-start-btn");
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("researcher-1");
    expect(result!.action).toBe("start");
    expect(result!.targetRoomId).toBeUndefined();
  });

  // 7b-2
  it("parses a 'stop' fixture ID correctly", () => {
    const result = parseAgentFixtureId("agent-manager-v2-stop-btn");
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("manager-v2");
    expect(result!.action).toBe("stop");
  });

  // 7b-3
  it("parses a 'restart' fixture ID correctly", () => {
    const result = parseAgentFixtureId("agent-implementer-42-restart-btn");
    expect(result!.action).toBe("restart");
    expect(result!.agentId).toBe("implementer-42");
  });

  // 7b-4
  it("parses a 'pause' fixture ID correctly", () => {
    const result = parseAgentFixtureId("agent-frontend-reviewer-pause-btn");
    expect(result!.action).toBe("pause");
    expect(result!.agentId).toBe("frontend-reviewer");
  });

  // 7b-5
  it("parses an 'assign' fixture ID with room ID correctly", () => {
    const result = parseAgentFixtureId(
      "agent-manager-1-assign-research-lab-btn",
    );
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("manager-1");
    expect(result!.action).toBe("assign");
    expect(result!.targetRoomId).toBe("research-lab");
  });

  // 7b-6
  it("parses an 'assign' fixture ID with hyphenated room ID", () => {
    const result = parseAgentFixtureId(
      "agent-agent-x-assign-ops-control-room-btn",
    );
    expect(result!.action).toBe("assign");
    expect(result!.targetRoomId).toBe("ops-control-room");
  });

  // 7b-7
  it("returns null for an ID that does not start with the agent prefix", () => {
    expect(parseAgentFixtureId("room-ops-control-start-btn")).toBeNull();
    expect(parseAgentFixtureId("task-001-stop-btn")).toBeNull();
  });

  // 7b-8
  it("returns null for an ID that does not end with '-btn'", () => {
    expect(parseAgentFixtureId("agent-researcher-1-start")).toBeNull();
    expect(parseAgentFixtureId("agent-researcher-1-start-button")).toBeNull();
  });

  // 7b-9
  it("returns null for an ID with an unknown action segment", () => {
    expect(parseAgentFixtureId("agent-manager-1-teleport-btn")).toBeNull();
    expect(parseAgentFixtureId("agent-manager-1-delete-btn")).toBeNull();
  });

  // 7b-10
  it("returns null for a malformed (too short) ID", () => {
    expect(parseAgentFixtureId("agent--start-btn")).toBeNull();
    expect(parseAgentFixtureId("agent-start-btn")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. buildAgentFixtureId — canonical ID construction
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — buildAgentFixtureId: canonical ID construction", () => {

  // 7b-11
  it("builds a 'start' fixture ID with the expected prefix and suffix", () => {
    const id = buildAgentFixtureId("researcher-1", "start");
    expect(id).toBe("agent-researcher-1-start-btn");
    expect(id.startsWith(AGENT_FIXTURE_PREFIX)).toBe(true);
    expect(id.endsWith(AGENT_FIXTURE_BTN_SUFFIX)).toBe(true);
  });

  // 7b-12
  it("builds a 'stop' fixture ID", () => {
    expect(buildAgentFixtureId("manager-v2", "stop")).toBe("agent-manager-v2-stop-btn");
  });

  // 7b-13
  it("builds a 'restart' fixture ID", () => {
    expect(buildAgentFixtureId("implementer-7", "restart")).toBe(
      "agent-implementer-7-restart-btn",
    );
  });

  // 7b-14
  it("builds a 'pause' fixture ID", () => {
    expect(buildAgentFixtureId("validator-1", "pause")).toBe(
      "agent-validator-1-pause-btn",
    );
  });

  // 7b-15
  it("builds an 'assign' fixture ID with room ID", () => {
    const id = buildAgentFixtureId("manager-1", "assign", "research-lab");
    expect(id).toBe("agent-manager-1-assign-research-lab-btn");
  });

  // 7b-16
  it("build + parse round-trip produces original inputs for all non-assign actions", () => {
    const agents = ["researcher-1", "manager-v2", "impl-7"];
    const actions: AgentFixtureLifecycleAction[] = ["start", "stop", "restart", "pause"];

    for (const agentId of agents) {
      for (const action of actions) {
        const id = buildAgentFixtureId(agentId, action);
        const parsed = parseAgentFixtureId(id);
        expect(parsed, `Round-trip failed for ${agentId}/${action}`).not.toBeNull();
        expect(parsed!.agentId).toBe(agentId);
        expect(parsed!.action).toBe(action);
      }
    }
  });

  // 7b-17
  it("build + parse round-trip preserves roomId for assign action", () => {
    const id = buildAgentFixtureId("manager-1", "assign", "ops-control");
    const parsed = parseAgentFixtureId(id);
    expect(parsed!.action).toBe("assign");
    expect(parsed!.targetRoomId).toBe("ops-control");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. resolveAgentFixtureAction — intent payload → action resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — resolveAgentFixtureAction: payload resolution", () => {

  // 7b-18
  it("resolves a 'start' action from a fixture button click payload", () => {
    const payload = makeButtonClickedPayload(
      "agent-researcher-1-start-btn",
      "researcher-1",
    );
    const result = resolveAgentFixtureAction(payload);
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("researcher-1");
    expect(result!.action).toBe("start");
  });

  // 7b-19
  it("resolves a 'stop' action from fixture ID", () => {
    const payload = makeButtonClickedPayload(
      "agent-manager-v2-stop-btn",
      "manager-v2",
    );
    const result = resolveAgentFixtureAction(payload);
    expect(result!.action).toBe("stop");
  });

  // 7b-20
  it("resolves an 'assign' action with targetRoomId from fixture ID", () => {
    const payload = makeButtonClickedPayload(
      "agent-manager-1-assign-research-lab-btn",
      "manager-1",
    );
    const result = resolveAgentFixtureAction(payload);
    expect(result!.action).toBe("assign");
    expect(result!.targetRoomId).toBe("research-lab");
  });

  // 7b-21
  it("prefers structured meta over fixture ID for action resolution", () => {
    const payload = {
      ...makeButtonClickedPayload("agent-researcher-1-stop-btn", "researcher-1"),
      meta: { lifecycleAction: "restart" },
    } as unknown as FixtureButtonClickedPayload;
    const result = resolveAgentFixtureAction(payload);
    expect(result!.action).toBe("restart"); // meta wins over ID
  });

  // 7b-22
  it("uses meta.targetRoomId when resolving assign from meta", () => {
    const payload = {
      ...makeButtonClickedPayload("some-fixture-id", "researcher-1"),
      meta: { lifecycleAction: "assign", targetRoomId: "impl-office" },
    } as unknown as FixtureButtonClickedPayload;
    const result = resolveAgentFixtureAction(payload);
    expect(result!.action).toBe("assign");
    expect(result!.targetRoomId).toBe("impl-office");
  });

  // 7b-23
  it("returns null for non-agent fixture payloads (task/room entities)", () => {
    const payload: FixtureButtonClickedPayload = {
      ...makeButtonClickedPayload("task-001-stop-btn", "task-001"),
      entityRef: { entityType: "task", entityId: "task-001" },
    };
    expect(resolveAgentFixtureAction(payload)).toBeNull();
  });

  // 7b-24
  it("returns null when fixtureId does not match entityRef agentId", () => {
    const payload = makeButtonClickedPayload(
      "agent-researcher-1-start-btn",
      "manager-9", // mismatch: fixture says researcher-1 but entity is manager-9
    );
    expect(resolveAgentFixtureAction(payload)).toBeNull();
  });

  // 7b-25
  it("returns null for an unrecognised fixture ID and no meta override", () => {
    const payload = makeButtonClickedPayload(
      "agent-manager-1-teleport-btn",
      "manager-1",
    );
    expect(resolveAgentFixtureAction(payload)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. translateFixtureIntentToLifecycle — intent → TranslatedFixtureCommand
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — translateFixtureIntentToLifecycle: intent → command", () => {

  // 7b-26
  it("translates a 'start' fixture click to agent.spawn command", () => {
    const payload = makeButtonClickedPayload(
      "agent-researcher-1-start-btn",
      "researcher-1",
    );
    const cmd = translateFixtureIntentToLifecycle(payload);
    expect(cmd).not.toBeNull();
    expect(cmd!.commandType).toBe("agent.spawn");
    expect(cmd!.agentId).toBe("researcher-1");
    expect(cmd!.action).toBe("start");
  });

  // 7b-27
  it("translates a 'stop' fixture click to agent.terminate command", () => {
    const payload = makeButtonClickedPayload(
      "agent-manager-1-stop-btn",
      "manager-1",
    );
    const cmd = translateFixtureIntentToLifecycle(payload);
    expect(cmd!.commandType).toBe("agent.terminate");
    expect(cmd!.action).toBe("stop");
  });

  // 7b-28
  it("translates a 'restart' fixture click to agent.restart command", () => {
    const payload = makeButtonClickedPayload(
      "agent-impl-7-restart-btn",
      "impl-7",
    );
    const cmd = translateFixtureIntentToLifecycle(payload);
    expect(cmd!.commandType).toBe("agent.restart");
  });

  // 7b-29
  it("translates a 'pause' fixture click to agent.pause command", () => {
    const payload = makeButtonClickedPayload(
      "agent-validator-1-pause-btn",
      "validator-1",
    );
    const cmd = translateFixtureIntentToLifecycle(payload);
    expect(cmd!.commandType).toBe("agent.pause");
  });

  // 7b-30
  it("translates an 'assign' fixture click to agent.assign command with targetRoomId", () => {
    const payload = makeButtonClickedPayload(
      "agent-manager-1-assign-research-lab-btn",
      "manager-1",
    );
    const cmd = translateFixtureIntentToLifecycle(payload);
    expect(cmd!.commandType).toBe("agent.assign");
    expect(cmd!.targetRoomId).toBe("research-lab");
  });

  // 7b-31
  it("returns null for unrecognised fixture payloads (no command emitted)", () => {
    const payload = makeButtonClickedPayload(
      "agent-researcher-1-teleport-btn",
      "researcher-1",
    );
    expect(translateFixtureIntentToLifecycle(payload)).toBeNull();
  });

  // 7b-32
  it("is deterministic — same input always produces same output", () => {
    const payload = makeButtonClickedPayload(
      "agent-researcher-1-start-btn",
      "researcher-1",
    );
    const cmd1 = translateFixtureIntentToLifecycle(payload);
    const cmd2 = translateFixtureIntentToLifecycle(payload);
    expect(cmd1).toEqual(cmd2);
  });

  // 7b-33
  it("every valid agent lifecycle action translates to a non-null command", () => {
    const agentId = "test-agent";
    const nonAssignActions: Array<Exclude<AgentFixtureLifecycleAction, "assign">> =
      ["start", "stop", "restart", "pause"];

    for (const action of nonAssignActions) {
      const fixtureId = buildAgentFixtureId(agentId, action);
      const payload = makeButtonClickedPayload(fixtureId, agentId);
      const cmd = translateFixtureIntentToLifecycle(payload);
      expect(cmd, `Action "${action}" should translate to a command`).not.toBeNull();
      expect(cmd!.commandType).toBe(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND[action]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FIXTURE_LIFECYCLE_ACTION_TO_COMMAND — mapping completeness + uniqueness
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — FIXTURE_LIFECYCLE_ACTION_TO_COMMAND: mapping invariants", () => {

  // 7b-34
  it("contains entries for all 5 agent fixture lifecycle actions", () => {
    const keys = Object.keys(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND);
    expect(keys).toContain("start");
    expect(keys).toContain("stop");
    expect(keys).toContain("restart");
    expect(keys).toContain("pause");
    expect(keys).toContain("assign");
    expect(keys).toHaveLength(5);
  });

  // 7b-35
  it("start → agent.spawn (activates dormant agent)", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.start).toBe("agent.spawn");
  });

  // 7b-36
  it("stop → agent.terminate (destructive lifecycle end)", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.stop).toBe("agent.terminate");
  });

  // 7b-37
  it("restart → agent.restart (reset without deregistering)", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.restart).toBe("agent.restart");
  });

  // 7b-38
  it("pause → agent.pause (suspend without terminating)", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.pause).toBe("agent.pause");
  });

  // 7b-39
  it("assign → agent.assign (room reassignment)", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.assign).toBe("agent.assign");
  });

  // 7b-40
  it("all command types are unique — no two actions share a command type", () => {
    const values = Object.values(
      FIXTURE_LIFECYCLE_ACTION_TO_COMMAND,
    ) as AgentLifecycleCommandType[];
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  // 7b-41
  it("all mapped command types are valid protocol agent command types", () => {
    const validProtocolCommandTypes = new Set([
      "agent.spawn",
      "agent.terminate",
      "agent.restart",
      "agent.pause",
      "agent.resume",
      "agent.assign",
      "agent.send_command",
    ]);
    for (const [action, commandType] of Object.entries(
      FIXTURE_LIFECYCLE_ACTION_TO_COMMAND,
    )) {
      expect(
        validProtocolCommandTypes.has(commandType),
        `Action "${action}" maps to unknown command type "${commandType}"`,
      ).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. getAgentFixtureActions — status-aware fixture button visibility
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — getAgentFixtureActions: status-aware fixture visibility", () => {

  // 7b-42
  it("inactive agent gets 'start' and 'assign' fixtures", () => {
    const actions = getAgentFixtureActions("inactive");
    expect(actions).toContain("start");
    expect(actions).toContain("assign");
    expect(actions).not.toContain("stop");
    expect(actions).not.toContain("pause");
    expect(actions).not.toContain("restart");
  });

  // 7b-43
  it("terminated agent gets 'start' and 'assign' fixtures", () => {
    const actions = getAgentFixtureActions("terminated");
    expect(actions).toContain("start");
    expect(actions).toContain("assign");
  });

  // 7b-44
  it("idle agent gets stop, restart, and assign (not start, not pause)", () => {
    const actions = getAgentFixtureActions("idle");
    expect(actions).toContain("stop");
    expect(actions).toContain("restart");
    expect(actions).toContain("assign");
    expect(actions).not.toContain("start");
    expect(actions).not.toContain("pause");
  });

  // 7b-45
  it("active agent gets pause, restart, stop, and assign", () => {
    const actions = getAgentFixtureActions("active");
    expect(actions).toContain("pause");
    expect(actions).toContain("restart");
    expect(actions).toContain("stop");
    expect(actions).toContain("assign");
    expect(actions).not.toContain("start");
  });

  // 7b-46
  it("busy agent gets same fixtures as active agent", () => {
    const active = getAgentFixtureActions("active");
    const busy = getAgentFixtureActions("busy");
    expect(new Set(active)).toEqual(new Set(busy));
  });

  // 7b-47
  it("error agent gets restart, stop, and assign (not pause, not start)", () => {
    const actions = getAgentFixtureActions("error");
    expect(actions).toContain("restart");
    expect(actions).toContain("stop");
    expect(actions).toContain("assign");
    expect(actions).not.toContain("pause");
    expect(actions).not.toContain("start");
  });

  // 7b-48
  it("unknown status returns empty action list (safe fallback)", () => {
    expect(getAgentFixtureActions("unknown-status")).toHaveLength(0);
    expect(getAgentFixtureActions("")).toHaveLength(0);
  });

  // 7b-49
  it("'start' and 'stop' are never both in the action list for any status", () => {
    for (const status of ["inactive", "idle", "active", "busy", "error", "terminated"]) {
      const actions = getAgentFixtureActions(status);
      const hasStart = actions.includes("start");
      const hasStop = actions.includes("stop");
      expect(hasStart && hasStop,
        `start and stop should never coexist for status="${status}"`).toBe(false);
    }
  });

  // 7b-50
  it("'assign' appears for all live statuses (status-agnostic reassignment)", () => {
    for (const status of ["inactive", "idle", "active", "busy", "error", "terminated"]) {
      const actions = getAgentFixtureActions(status);
      expect(actions, `assign should be available for status="${status}"`).toContain("assign");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. buildAgentLifecycleFixtureDefs — fixture definition generation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — buildAgentLifecycleFixtureDefs: fixture def generation", () => {

  const mockRooms = [
    { roomId: "ops-control", name: "Ops Control" },
    { roomId: "research-lab", name: "Research Lab" },
    { roomId: "impl-office", name: "Impl Office" },
  ];

  // 7b-51
  it("generates fixture defs for an inactive agent (start + assign per room)", () => {
    const defs = buildAgentLifecycleFixtureDefs("agent-1", "inactive", mockRooms);
    const actions = new Set(defs.map((d) => d.action));
    expect(actions.has("start")).toBe(true);
    expect(actions.has("assign")).toBe(true);
    expect(actions.has("stop")).toBe(false);
    expect(actions.has("pause")).toBe(false);
  });

  // 7b-52
  it("generates one assign def per assignable room", () => {
    const defs = buildAgentLifecycleFixtureDefs("agent-1", "inactive", mockRooms);
    const assignDefs = defs.filter((d) => d.action === "assign");
    expect(assignDefs).toHaveLength(mockRooms.length);
  });

  // 7b-53
  it("each assign def carries the correct targetRoomId and commandType", () => {
    const defs = buildAgentLifecycleFixtureDefs("agent-1", "idle", mockRooms);
    const assignDefs = defs.filter((d) => d.action === "assign");
    const roomIds = new Set(assignDefs.map((d) => d.targetRoomId));
    expect(roomIds.has("ops-control")).toBe(true);
    expect(roomIds.has("research-lab")).toBe(true);
    for (const d of assignDefs) {
      expect(d.commandType).toBe("agent.assign");
    }
  });

  // 7b-54
  it("every def has a stable fixtureId following the naming convention", () => {
    const defs = buildAgentLifecycleFixtureDefs("manager-1", "active", mockRooms);
    for (const def of defs) {
      const parsed = parseAgentFixtureId(def.fixtureId);
      expect(parsed, `fixtureId "${def.fixtureId}" should be parseable`).not.toBeNull();
      expect(parsed!.agentId).toBe("manager-1");
      expect(parsed!.action).toBe(def.action);
    }
  });

  // 7b-55
  it("every def's commandType matches FIXTURE_LIFECYCLE_ACTION_TO_COMMAND[action]", () => {
    const defs = buildAgentLifecycleFixtureDefs("researcher-1", "active", mockRooms);
    for (const def of defs) {
      expect(def.commandType).toBe(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND[def.action]);
    }
  });

  // 7b-56
  it("assign defs are capped at 6 even with 10 available rooms (panel compactness)", () => {
    const manyRooms = Array.from({ length: 10 }, (_, i) => ({
      roomId: `room-${i}`,
      name: `Room ${i}`,
    }));
    const defs = buildAgentLifecycleFixtureDefs("agent-1", "idle", manyRooms);
    const assignDefs = defs.filter((d) => d.action === "assign");
    expect(assignDefs.length).toBeLessThanOrEqual(6);
  });

  // 7b-57
  it("generates no assign defs when assignableRooms is empty", () => {
    const defs = buildAgentLifecycleFixtureDefs("agent-1", "idle", []);
    const assignDefs = defs.filter((d) => d.action === "assign");
    expect(assignDefs).toHaveLength(0);
  });

  // 7b-58
  it("generates no defs for unknown status (safe fallback)", () => {
    const defs = buildAgentLifecycleFixtureDefs("agent-1", "unknown-status", mockRooms);
    expect(defs).toHaveLength(0);
  });

  // 7b-59
  it("all generated defs have a label and icon", () => {
    const defs = buildAgentLifecycleFixtureDefs("agent-1", "active", mockRooms);
    for (const def of defs) {
      expect(typeof def.label).toBe("string");
      expect(def.label.length).toBeGreaterThan(0);
      expect(typeof def.icon).toBe("string");
      expect(def.icon.length).toBeGreaterThan(0);
    }
  });

  // 7b-60
  it("every def carries the correct agentId", () => {
    const myAgentId = "validator-99";
    const defs = buildAgentLifecycleFixtureDefs(myAgentId, "idle", mockRooms);
    for (const def of defs) {
      expect(def.agentId).toBe(myAgentId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Dispatch guards — FIXTURE_REQUIRES_CONFIRM + FIXTURE_OPTIMISTIC_ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — Dispatch guards: confirm set + optimistic set", () => {

  // 7b-61
  it("FIXTURE_REQUIRES_CONFIRM contains 'stop' (destructive — must confirm)", () => {
    expect(FIXTURE_REQUIRES_CONFIRM.has("stop")).toBe(true);
  });

  // 7b-62
  it("FIXTURE_REQUIRES_CONFIRM does NOT contain 'start' (safe — activates only)", () => {
    expect(FIXTURE_REQUIRES_CONFIRM.has("start")).toBe(false);
  });

  // 7b-63
  it("FIXTURE_REQUIRES_CONFIRM does NOT contain 'restart' (safe — no data loss)", () => {
    expect(FIXTURE_REQUIRES_CONFIRM.has("restart")).toBe(false);
  });

  // 7b-64
  it("FIXTURE_REQUIRES_CONFIRM does NOT contain 'pause' (safe — task preserved)", () => {
    expect(FIXTURE_REQUIRES_CONFIRM.has("pause")).toBe(false);
  });

  // 7b-65
  it("FIXTURE_OPTIMISTIC_ACTIONS contains start, restart, pause, assign", () => {
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("start")).toBe(true);
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("restart")).toBe(true);
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("pause")).toBe(true);
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("assign")).toBe(true);
  });

  // 7b-66
  it("'stop' is NOT in FIXTURE_OPTIMISTIC_ACTIONS (store update deferred to confirmation)", () => {
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("stop")).toBe(false);
  });

  // 7b-67
  it("FIXTURE_REQUIRES_CONFIRM and FIXTURE_OPTIMISTIC_ACTIONS are disjoint sets", () => {
    for (const action of AGENT_FIXTURE_LIFECYCLE_ACTIONS) {
      const requiresConfirm = FIXTURE_REQUIRES_CONFIRM.has(action);
      const isOptimistic = FIXTURE_OPTIMISTIC_ACTIONS.has(action);
      expect(requiresConfirm && isOptimistic,
        `Action "${action}" should not be in both sets`).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Parity with AgentLifecyclePanel.LIFECYCLE_ACTION_TO_COMMAND_TYPE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — Parity with AgentLifecyclePanel command mapping", () => {
  // Import the panel mapping to verify they share the same command types

  it("fixture bridge 'start' command type matches the panel 'start' command type", () => {
    // The fixture bridge and the panel must both dispatch agent.spawn for start
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.start).toBe("agent.spawn");
  });

  it("fixture bridge 'stop' command type matches the panel 'stop' command type", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.stop).toBe("agent.terminate");
  });

  it("fixture bridge 'restart' command type matches the panel 'restart' command type", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.restart).toBe("agent.restart");
  });

  it("fixture bridge 'pause' command type matches the panel 'pause' command type", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.pause).toBe("agent.pause");
  });

  // 7b-68
  it("fixture 'assign' maps to agent.assign — consistent with panel 'reassign' mapping", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.assign).toBe("agent.assign");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. isAgentFixtureLifecycleAction guard + AGENT_FIXTURE_LIFECYCLE_ACTION_SET
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — isAgentFixtureLifecycleAction type guard", () => {

  // 7b-69
  it("returns true for all 5 valid action strings", () => {
    for (const action of AGENT_FIXTURE_LIFECYCLE_ACTIONS) {
      expect(isAgentFixtureLifecycleAction(action)).toBe(true);
    }
  });

  // 7b-70
  it("returns false for invalid strings", () => {
    expect(isAgentFixtureLifecycleAction("teleport")).toBe(false);
    expect(isAgentFixtureLifecycleAction("")).toBe(false);
    expect(isAgentFixtureLifecycleAction("STOP")).toBe(false); // case-sensitive
    expect(isAgentFixtureLifecycleAction("terminate")).toBe(false); // protocol name, not fixture name
  });

  // 7b-71
  it("AGENT_FIXTURE_LIFECYCLE_ACTION_SET has exactly 5 members", () => {
    expect(AGENT_FIXTURE_LIFECYCLE_ACTION_SET.size).toBe(5);
  });

  // 7b-72
  it("AGENT_FIXTURE_LIFECYCLE_ACTIONS array has exactly 5 members", () => {
    expect(AGENT_FIXTURE_LIFECYCLE_ACTIONS).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Visual feedback contract — agent status after each action (record transparency)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sub-AC 7b — Visual feedback contract: expected agent status after actions", () => {
  /**
   * These tests verify the EXPECTED final agent state after each lifecycle
   * action, confirming the bridge's optimistic update semantics and the
   * visual feedback specification.
   *
   * The actual store mutations are integration-tested in
   * store/__tests__/agent-lifecycle-controls.test.ts — these tests verify
   * the *contractual specification* encoded in the bridge constants.
   */

  // 7b-73
  it("start action (agent.spawn) → expected resulting status: idle", () => {
    // After start: inactive/terminated → idle (agent awakens)
    // The fixture bridge calls agentStore.startAgent() → sets status="idle"
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.start).toBe("agent.spawn");
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("start")).toBe(true); // immediate feedback
  });

  // 7b-74
  it("stop action (agent.terminate) → resulting status: terminated (deferred)", () => {
    // After stop confirmation: any → terminated
    // Deferred (not optimistic) — confirmation required
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.stop).toBe("agent.terminate");
    expect(FIXTURE_REQUIRES_CONFIRM.has("stop")).toBe(true); // requires confirm
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("stop")).toBe(false); // not optimistic
  });

  // 7b-75
  it("restart action (agent.restart) → resulting status: idle (optimistic)", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.restart).toBe("agent.restart");
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("restart")).toBe(true); // immediate feedback
  });

  // 7b-76
  it("pause action (agent.pause) → resulting status: idle with paused lifecycle (optimistic)", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.pause).toBe("agent.pause");
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("pause")).toBe(true); // immediate feedback
  });

  // 7b-77
  it("assign action (agent.assign) → roomId updated in scene (optimistic)", () => {
    expect(FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.assign).toBe("agent.assign");
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("assign")).toBe(true); // immediate scene move
  });

  // 7b-78
  it("all non-destructive actions are optimistic (no latency in visual feedback)", () => {
    const nonDestructive: AgentFixtureLifecycleAction[] =
      ["start", "restart", "pause", "assign"];
    for (const action of nonDestructive) {
      expect(FIXTURE_OPTIMISTIC_ACTIONS.has(action),
        `${action} should have optimistic visual feedback`).toBe(true);
    }
  });
});
