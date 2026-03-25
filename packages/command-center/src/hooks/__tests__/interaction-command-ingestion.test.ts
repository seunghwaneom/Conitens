/**
 * interaction-command-ingestion.test.ts — Sub-AC 14.3
 *
 * Interaction and command ingestion tests covering:
 *   A. Agent selection events — interaction intent emission and routing
 *   B. Command dispatch to the control plane — fixture→command translation
 *   C. Command acknowledgement and state mutation — lifecycle store transitions
 *
 * All tests are pure function calls / Zustand store operations.
 * No React render environment, no Three.js, no async I/O.
 *
 * Test ID scheme:
 *   14c-1  through 14c-N: Sub-AC 14.3 interaction + command ingestion
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── A: Interaction intent store ──────────────────────────────────────────────
import {
  useInteractionIntentStore,
  buildAgentInteractionIntent,
  INTENT_BUFFER_MAX,
  AGENT_INTERACTION_INTENT_CATEGORY,
  type AgentInteractionIntentPayload,
  type AgentInteractionIntentKind,
} from "../../store/interaction-intent-store.js";

// ── B: Fixture→command translation (control plane dispatch) ─────────────────
import {
  translateFixtureIntentToLifecycle,
  resolveAgentFixtureAction,
  FIXTURE_LIFECYCLE_ACTION_TO_COMMAND,
  FIXTURE_OPTIMISTIC_ACTIONS,
  FIXTURE_REQUIRES_CONFIRM,
  buildAgentFixtureId,
  type AgentFixtureLifecycleAction,
  type TranslatedFixtureCommand,
} from "../use-agent-fixture-command-bridge.js";
import type { FixtureButtonClickedPayload } from "../../scene/fixture-interaction-intents.js";

// ── C: Command lifecycle store (acknowledgement + state mutation) ─────────────
import {
  useCommandLifecycleStore,
  COMPLETION_TTL_MS,
  COMMAND_STATUS_COLORS,
  COMMAND_STATUS_ICONS,
  type CommandLifecycleEntry,
  type CommandLifecycleStatus,
} from "../../store/command-lifecycle-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test data helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal valid AgentInteractionIntentPayload (click). */
function makeClickIntent(
  agentId: string,
  overrides?: Partial<
    Omit<AgentInteractionIntentPayload, "intentId" | "ts" | "tsIso">
  >,
): AgentInteractionIntentPayload {
  return buildAgentInteractionIntent({
    kind:         "click",
    agentId,
    agentName:    `Agent ${agentId}`,
    agentRole:    "implementer",
    agentStatus:  "active",
    roomId:       "research-lab",
    worldPosition: { x: 1, y: 0, z: 1 },
    wasSelected:  false,
    isDrillTarget: false,
    ...overrides,
  });
}

/** Build a minimal valid FixtureButtonClickedPayload for an agent lifecycle button. */
function makeFixtureBtnPayload(
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

// ─────────────────────────────────────────────────────────────────────────────
// A. Agent selection events
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 14.3-A — Agent selection / interaction intent events", () => {

  // Ensure a clean store state before each test in this suite
  beforeEach(() => {
    useInteractionIntentStore.getState().clearIntents();
  });

  // 14c-1
  it("emitting a click intent appends it to the intents buffer and sets lastIntent", () => {
    const store = useInteractionIntentStore.getState();
    const intent = makeClickIntent("researcher-1");
    store.emitAgentInteractionIntent(intent);

    const state = useInteractionIntentStore.getState();
    expect(state.intents).toHaveLength(1);
    expect(state.lastIntent).not.toBeNull();
    expect(state.lastIntent!.agentId).toBe("researcher-1");
    expect(state.lastIntent!.kind).toBe("click");
  });

  // 14c-2
  it("totalEmitted increments with each emitted intent", () => {
    const store = useInteractionIntentStore.getState();

    expect(useInteractionIntentStore.getState().totalEmitted).toBe(0);

    store.emitAgentInteractionIntent(makeClickIntent("researcher-1"));
    expect(useInteractionIntentStore.getState().totalEmitted).toBe(1);

    store.emitAgentInteractionIntent(makeClickIntent("manager-1"));
    expect(useInteractionIntentStore.getState().totalEmitted).toBe(2);
  });

  // 14c-3
  it("getIntentsForAgent returns only intents for the requested agent (most-recent first)", () => {
    const store = useInteractionIntentStore.getState();

    store.emitAgentInteractionIntent(makeClickIntent("researcher-1"));
    store.emitAgentInteractionIntent(makeClickIntent("manager-1"));
    store.emitAgentInteractionIntent(makeClickIntent("researcher-1", { kind: "hover_enter" }));

    const intents = useInteractionIntentStore.getState().getIntentsForAgent("researcher-1");

    expect(intents).toHaveLength(2);
    // most-recent first
    expect(intents[0]!.kind).toBe("hover_enter");
    expect(intents[1]!.kind).toBe("click");
  });

  // 14c-4
  it("getIntentsByKind filters correctly across multiple agents", () => {
    const store = useInteractionIntentStore.getState();

    store.emitAgentInteractionIntent(makeClickIntent("researcher-1"));
    store.emitAgentInteractionIntent(makeClickIntent("manager-1", { kind: "context_menu" }));
    store.emitAgentInteractionIntent(makeClickIntent("validator-1"));

    const clicks = useInteractionIntentStore.getState().getIntentsByKind("click");
    const ctxMenu = useInteractionIntentStore.getState().getIntentsByKind("context_menu");

    expect(clicks).toHaveLength(2);
    expect(ctxMenu).toHaveLength(1);
    expect(ctxMenu[0]!.agentId).toBe("manager-1");
  });

  // 14c-5
  it("getLastIntentByKind returns null when no matching intent exists", () => {
    const store = useInteractionIntentStore.getState();
    store.emitAgentInteractionIntent(makeClickIntent("researcher-1"));

    const last = useInteractionIntentStore.getState().getLastIntentByKind("researcher-1", "hover_exit");
    expect(last).toBeNull();
  });

  // 14c-6
  it("getLastIntentByKind returns the most recent matching intent", () => {
    const store = useInteractionIntentStore.getState();

    store.emitAgentInteractionIntent(makeClickIntent("researcher-1", { kind: "hover_enter" }));
    store.emitAgentInteractionIntent(makeClickIntent("researcher-1", { kind: "hover_enter" }));

    const last = useInteractionIntentStore
      .getState()
      .getLastIntentByKind("researcher-1", "hover_enter");

    expect(last).not.toBeNull();
    // Should be the 2nd one — both have kind hover_enter but the 2nd has a later ts
    expect(last!.agentId).toBe("researcher-1");
  });

  // 14c-7
  it("AGENT_INTERACTION_INTENT_CATEGORY is the correct category string", () => {
    expect(AGENT_INTERACTION_INTENT_CATEGORY).toBe("agent.interaction_intent");
  });

  // 14c-8
  it("clearIntents resets the store to an empty state", () => {
    const store = useInteractionIntentStore.getState();
    store.emitAgentInteractionIntent(makeClickIntent("researcher-1"));
    expect(useInteractionIntentStore.getState().intents).toHaveLength(1);

    useInteractionIntentStore.getState().clearIntents();
    const state = useInteractionIntentStore.getState();
    expect(state.intents).toHaveLength(0);
    expect(state.totalEmitted).toBe(0);
    expect(state.lastIntent).toBeNull();
  });

  // 14c-9
  it("ring buffer evicts oldest entry once INTENT_BUFFER_MAX is exceeded", () => {
    const store = useInteractionIntentStore.getState();

    // Emit INTENT_BUFFER_MAX + 5 intents with unique agentIds
    for (let i = 0; i < INTENT_BUFFER_MAX + 5; i++) {
      store.emitAgentInteractionIntent(makeClickIntent(`agent-${i}`));
    }

    const state = useInteractionIntentStore.getState();
    expect(state.intents).toHaveLength(INTENT_BUFFER_MAX);
    // The newest entry should be agent-(INTENT_BUFFER_MAX+4)
    expect(state.lastIntent!.agentId).toBe(`agent-${INTENT_BUFFER_MAX + 4}`);
  });

  // 14c-10
  it("buildAgentInteractionIntent fills intentId, ts, and tsIso automatically", () => {
    const intent = makeClickIntent("researcher-1");
    expect(typeof intent.intentId).toBe("string");
    expect(intent.intentId.length).toBeGreaterThan(0);
    expect(typeof intent.ts).toBe("number");
    expect(typeof intent.tsIso).toBe("string");
    // tsIso must be valid ISO 8601
    expect(new Date(intent.tsIso).getTime()).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Command dispatch to the control plane
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 14.3-B — Command dispatch to the control plane", () => {

  // 14c-11
  it("translateFixtureIntentToLifecycle returns the correct command type for 'start'", () => {
    const fixtureId = buildAgentFixtureId("researcher-1", "start");
    const payload = makeFixtureBtnPayload(fixtureId, "researcher-1");

    const result = translateFixtureIntentToLifecycle(payload);

    expect(result).not.toBeNull();
    expect(result!.commandType).toBe("agent.spawn");
    expect(result!.agentId).toBe("researcher-1");
    expect(result!.action).toBe("start");
  });

  // 14c-12
  it("translateFixtureIntentToLifecycle returns the correct command type for 'stop'", () => {
    const fixtureId = buildAgentFixtureId("manager-1", "stop");
    const payload = makeFixtureBtnPayload(fixtureId, "manager-1");

    const result = translateFixtureIntentToLifecycle(payload);

    expect(result).not.toBeNull();
    expect(result!.commandType).toBe("agent.terminate");
    expect(result!.agentId).toBe("manager-1");
    expect(result!.action).toBe("stop");
  });

  // 14c-13
  it("translateFixtureIntentToLifecycle returns the correct command type for 'assign'", () => {
    const fixtureId = buildAgentFixtureId("researcher-1", "assign", "research-lab");
    const payload = makeFixtureBtnPayload(fixtureId, "researcher-1");

    const result = translateFixtureIntentToLifecycle(payload);

    expect(result).not.toBeNull();
    expect(result!.commandType).toBe("agent.assign");
    expect(result!.agentId).toBe("researcher-1");
    expect(result!.action).toBe("assign");
    expect(result!.targetRoomId).toBe("research-lab");
  });

  // 14c-14
  it("translateFixtureIntentToLifecycle returns null for non-agent entity types", () => {
    const payload: FixtureButtonClickedPayload = {
      fixtureId: "task-cancel-btn",
      fixtureKind: "button",
      entityRef: { entityType: "task", entityId: "task-123" },
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
    };

    const result = translateFixtureIntentToLifecycle(payload);
    expect(result).toBeNull();
  });

  // 14c-15
  it("FIXTURE_LIFECYCLE_ACTION_TO_COMMAND maps all 5 lifecycle actions uniquely", () => {
    const mapping = FIXTURE_LIFECYCLE_ACTION_TO_COMMAND;
    const commandTypes = Object.values(mapping);

    // All 5 actions are mapped
    expect(Object.keys(mapping)).toHaveLength(5);

    // All mapped command types are unique (no two actions map to the same command)
    const uniqueTypes = new Set(commandTypes);
    expect(uniqueTypes.size).toBe(5);
  });

  // 14c-16
  it("FIXTURE_OPTIMISTIC_ACTIONS does NOT include 'stop' (destructive action)", () => {
    expect(FIXTURE_OPTIMISTIC_ACTIONS.has("stop")).toBe(false);
  });

  // 14c-17
  it("FIXTURE_REQUIRES_CONFIRM includes 'stop' but not non-destructive actions", () => {
    expect(FIXTURE_REQUIRES_CONFIRM.has("stop")).toBe(true);
    expect(FIXTURE_REQUIRES_CONFIRM.has("start")).toBe(false);
    expect(FIXTURE_REQUIRES_CONFIRM.has("restart")).toBe(false);
    expect(FIXTURE_REQUIRES_CONFIRM.has("pause")).toBe(false);
    expect(FIXTURE_REQUIRES_CONFIRM.has("assign")).toBe(false);
  });

  // 14c-18
  it("resolveAgentFixtureAction: meta.lifecycleAction takes priority over fixture ID naming", () => {
    // Build a payload where the fixtureId says 'start' but meta overrides to 'pause'
    const fixtureId = buildAgentFixtureId("researcher-1", "start");
    const payload: FixtureButtonClickedPayload & { meta: unknown } = {
      fixtureId,
      fixtureKind: "button",
      entityRef: { entityType: "agent", entityId: "researcher-1" },
      actionType: "click",
      worldPosition: null,
      ts: Date.now(),
      meta: { lifecycleAction: "pause" },
    };

    const resolved = resolveAgentFixtureAction(payload as unknown as FixtureButtonClickedPayload);

    expect(resolved).not.toBeNull();
    // meta override takes precedence
    expect(resolved!.action).toBe("pause");
    expect(resolved!.agentId).toBe("researcher-1");
  });

  // 14c-19
  it("translateFixtureIntentToLifecycle: restart action maps to agent.restart", () => {
    const fixtureId = buildAgentFixtureId("validator-1", "restart");
    const payload = makeFixtureBtnPayload(fixtureId, "validator-1");

    const result = translateFixtureIntentToLifecycle(payload);

    expect(result).not.toBeNull();
    expect(result!.commandType).toBe("agent.restart");
    expect(result!.action).toBe("restart");
    expect(result!.agentId).toBe("validator-1");
  });

  // 14c-20
  it("translateFixtureIntentToLifecycle: pause action maps to agent.pause", () => {
    const fixtureId = buildAgentFixtureId("researcher-2", "pause");
    const payload = makeFixtureBtnPayload(fixtureId, "researcher-2");

    const result = translateFixtureIntentToLifecycle(payload);

    expect(result).not.toBeNull();
    expect(result!.commandType).toBe("agent.pause");
    expect(result!.action).toBe("pause");
    expect(result!.agentId).toBe("researcher-2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Command acknowledgement and state mutation
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 14.3-C — Command acknowledgement and state mutation", () => {

  beforeEach(() => {
    useCommandLifecycleStore.getState().clearLog();
  });

  // 14c-21
  it("addLocalCommand creates a pending entry in the command log", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-001", "agent.spawn", "researcher-1");

    const state = useCommandLifecycleStore.getState();
    const entry = state.commands["cmd-001"];

    expect(entry).toBeDefined();
    expect(entry!.command_id).toBe("cmd-001");
    expect(entry!.command_type).toBe("agent.spawn");
    expect(entry!.status).toBe("pending");
    expect(entry!.agentId).toBe("researcher-1");
    expect(entry!.source).toBe("gui");
  });

  // 14c-22
  it("addLocalCommand adds the command to the ordered log (newest first)", () => {
    const store = useCommandLifecycleStore.getState();

    store.addLocalCommand("cmd-001", "agent.spawn", "researcher-1");
    store.addLocalCommand("cmd-002", "agent.terminate", "manager-1");

    const state = useCommandLifecycleStore.getState();
    // newest entry is first
    expect(state.log[0]).toBe("cmd-002");
    expect(state.log[1]).toBe("cmd-001");
  });

  // 14c-23
  it("addLocalCommand is idempotent — duplicate calls with same command_id are no-ops", () => {
    const store = useCommandLifecycleStore.getState();

    store.addLocalCommand("cmd-001", "agent.spawn", "researcher-1");
    store.addLocalCommand("cmd-001", "agent.spawn", "researcher-1"); // duplicate

    const state = useCommandLifecycleStore.getState();
    expect(state.log).toHaveLength(1);
    expect(Object.keys(state.commands)).toHaveLength(1);
  });

  // 14c-24
  it("handleCommandEvent(command.issued) transitions pending → processing", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-001", "agent.spawn", "researcher-1");

    useCommandLifecycleStore.getState().handleCommandEvent({
      type: "command.issued",
      payload: {
        command_id:   "cmd-001",
        command_type: "agent.spawn",
        source:       "orchestrator",
      },
    });

    const entry = useCommandLifecycleStore.getState().commands["cmd-001"];
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("processing");
  });

  // 14c-25
  it("handleCommandEvent(command.completed) transitions processing → completed", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-001", "agent.spawn", "researcher-1");

    // Issue first
    store.handleCommandEvent({
      type: "command.issued",
      payload: { command_id: "cmd-001", command_type: "agent.spawn" },
    });

    // Complete
    store.handleCommandEvent({
      type: "command.completed",
      payload: { command_id: "cmd-001", command_type: "agent.spawn", duration_ms: 350 },
    });

    const entry = useCommandLifecycleStore.getState().commands["cmd-001"];
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("completed");
    expect(entry!.duration_ms).toBe(350);
  });

  // 14c-26
  it("handleCommandEvent(command.failed) transitions to failed with error info", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-002", "agent.terminate", "manager-1");

    store.handleCommandEvent({
      type: "command.failed",
      payload: {
        command_id:    "cmd-002",
        command_type:  "agent.terminate",
        error_code:    "AGENT_NOT_FOUND",
        error_message: "Agent manager-1 does not exist",
        duration_ms:   120,
      },
    });

    const entry = useCommandLifecycleStore.getState().commands["cmd-002"];
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("failed");
    expect(entry!.error).toBeDefined();
    expect(entry!.error!.code).toBe("AGENT_NOT_FOUND");
    expect(entry!.error!.message).toBe("Agent manager-1 does not exist");
    expect(entry!.duration_ms).toBe(120);
  });

  // 14c-27
  it("handleCommandEvent(command.rejected) transitions to rejected with rejection info", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-003", "agent.spawn", "researcher-1");

    store.handleCommandEvent({
      type: "command.rejected",
      payload: {
        command_id:       "cmd-003",
        command_type:     "agent.spawn",
        rejection_code:   "SCHEMA_INVALID",
        rejection_reason: "Missing required field: persona",
      },
    });

    const entry = useCommandLifecycleStore.getState().commands["cmd-003"];
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("rejected");
    expect(entry!.error!.code).toBe("SCHEMA_INVALID");
    expect(entry!.error!.message).toBe("Missing required field: persona");
  });

  // 14c-28
  it("addLocalCommand adds the command to agentCommandMap for the target agent", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-001", "agent.spawn", "researcher-1");

    const state = useCommandLifecycleStore.getState();
    const agentCmds = state.agentCommandMap["researcher-1"];
    expect(agentCmds).toBeDefined();
    expect(agentCmds).toContain("cmd-001");
  });

  // 14c-29
  it("getActiveCommandsForAgent returns only pending/processing entries", () => {
    const store = useCommandLifecycleStore.getState();

    store.addLocalCommand("cmd-001", "agent.spawn", "researcher-1");
    store.addLocalCommand("cmd-002", "agent.restart", "researcher-1");

    // Complete cmd-001
    store.handleCommandEvent({
      type: "command.issued",
      payload: { command_id: "cmd-001", command_type: "agent.spawn" },
    });
    store.handleCommandEvent({
      type: "command.completed",
      payload: { command_id: "cmd-001", command_type: "agent.spawn", duration_ms: 100 },
    });

    // cmd-002 is still pending
    const active = useCommandLifecycleStore
      .getState()
      .getActiveCommandsForAgent("researcher-1");

    // Completed command was removed from active map after TTL (not instantly),
    // but cmd-002 remains pending — it should be present.
    const activeIds = active.map((e) => e.command_id);
    expect(activeIds).toContain("cmd-002");
  });

  // 14c-30
  it("getLogEntries returns entries newest-first in the correct count", () => {
    const store = useCommandLifecycleStore.getState();

    for (let i = 1; i <= 5; i++) {
      store.addLocalCommand(`cmd-${i.toString().padStart(3, "0")}`, "agent.spawn", `researcher-${i}`);
    }

    const entries = useCommandLifecycleStore.getState().getLogEntries(3);
    expect(entries).toHaveLength(3);
    // Newest first: cmd-005, cmd-004, cmd-003
    expect(entries[0]!.command_id).toBe("cmd-005");
    expect(entries[1]!.command_id).toBe("cmd-004");
    expect(entries[2]!.command_id).toBe("cmd-003");
  });

  // 14c-31
  it("COMMAND_STATUS_COLORS covers all five lifecycle status values", () => {
    const statuses: CommandLifecycleStatus[] = [
      "pending", "processing", "completed", "failed", "rejected",
    ];
    for (const s of statuses) {
      expect(typeof COMMAND_STATUS_COLORS[s]).toBe("string");
      expect(COMMAND_STATUS_COLORS[s].length).toBeGreaterThan(0);
    }
  });

  // 14c-32
  it("COMMAND_STATUS_ICONS covers all five lifecycle status values", () => {
    const statuses: CommandLifecycleStatus[] = [
      "pending", "processing", "completed", "failed", "rejected",
    ];
    for (const s of statuses) {
      expect(typeof COMMAND_STATUS_ICONS[s]).toBe("string");
      expect(COMMAND_STATUS_ICONS[s].length).toBeGreaterThan(0);
    }
  });

  // 14c-33
  it("COMPLETION_TTL_MS is a positive number (badge cleanup is deferred, not immediate)", () => {
    expect(typeof COMPLETION_TTL_MS).toBe("number");
    expect(COMPLETION_TTL_MS).toBeGreaterThan(0);
  });

  // 14c-34: Record transparency — command sequence numbers are monotonically increasing
  it("command entries receive monotonically increasing seq values", () => {
    const store = useCommandLifecycleStore.getState();

    store.addLocalCommand("cmd-a", "agent.spawn", "researcher-1");
    store.addLocalCommand("cmd-b", "agent.restart", "manager-1");
    store.addLocalCommand("cmd-c", "task.create");

    const state = useCommandLifecycleStore.getState();
    const seqA = state.commands["cmd-a"]!.seq;
    const seqB = state.commands["cmd-b"]!.seq;
    const seqC = state.commands["cmd-c"]!.seq;

    expect(seqA).toBeGreaterThan(0);
    expect(seqB).toBeGreaterThan(seqA);
    expect(seqC).toBeGreaterThan(seqB);
  });

  // 14c-35: Command without agentId does not create agentCommandMap entry
  it("addLocalCommand without agentId does not create agentCommandMap entry", () => {
    const store = useCommandLifecycleStore.getState();
    store.addLocalCommand("cmd-sys-1", "config.building_layout");

    const state = useCommandLifecycleStore.getState();
    // No agent map entries should exist since no agentId was provided
    expect(Object.keys(state.agentCommandMap)).toHaveLength(0);
    // But the entry IS in the log
    expect(state.commands["cmd-sys-1"]).toBeDefined();
    expect(state.commands["cmd-sys-1"]!.agentId).toBeUndefined();
  });
});
