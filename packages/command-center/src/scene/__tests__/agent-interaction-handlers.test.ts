/**
 * agent-interaction-handlers.test.ts — Tests for Sub-AC 4c: typed interaction
 * event handlers on the Agent layer.
 *
 * Tests the useAgentInteractionHandlers hook indirectly through the exported
 * store primitives and builder utilities (Three.js / R3F hooks cannot run
 * headless, so we test the store integration path only).
 *
 * Sub-AC 4c coverage:
 *   4c-H1  buildAgentInteractionIntent produces valid payload for click
 *   4c-H2  buildAgentInteractionIntent produces valid payload for hover_enter
 *   4c-H3  buildAgentInteractionIntent produces valid payload for hover_exit
 *   4c-H4  buildAgentInteractionIntent produces valid payload for context_menu
 *   4c-H5  hover_enter intent carries agent-scoped fields
 *   4c-H6  click intent carries wasSelected and isDrillTarget context
 *   4c-H7  context_menu intent carries screenPosition
 *   4c-H8  modifiers are captured correctly
 *   4c-H9  scene-event-log category tag is correct string constant
 *   4c-H10 stopPropagation contract: store emit is pure (no DOM dependency)
 *
 * NOTE: The hook itself (useAgentInteractionHandlers) depends on React and R3F
 *       ThreeEvent types that cannot be run headless.  These tests cover the
 *       underlying store/builder layer that the hook uses, ensuring correctness
 *       of the sub-layer even without a full Three.js render context.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildAgentInteractionIntent,
  useInteractionIntentStore,
  AGENT_INTERACTION_INTENT_CATEGORY,
  INTENT_BUFFER_MAX,
  type AgentInteractionIntentKind,
} from "../../store/interaction-intent-store.js";
import { useSceneEventLog } from "../../store/scene-event-log.js";

// ── Reset helpers ──────────────────────────────────────────────────────────

function resetStores() {
  useInteractionIntentStore.setState({
    intents:      [],
    totalEmitted: 0,
    lastIntent:   null,
  });
  useSceneEventLog.setState({
    entries:          [],
    snapshots:        [],
    sessionId:        "test-session-h",
    recording:        false,
    totalRecorded:    0,
    seq:              0,
    recordingStartTs: null,
  });
}

/** Build a minimal intent for the given kind / agentId. */
function makeIntent(
  kind: AgentInteractionIntentKind,
  agentId = "agent-test",
  extra: Record<string, unknown> = {},
) {
  return buildAgentInteractionIntent({
    kind,
    agentId,
    agentName:     `Test ${agentId}`,
    agentRole:     "implementer",
    agentStatus:   "idle",
    roomId:        "test-room",
    worldPosition: { x: 0, y: 0, z: 0 },
    wasSelected:   false,
    isDrillTarget: false,
    ...extra,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Agent interaction handlers — Sub-AC 4c builder layer", () => {
  beforeEach(resetStores);

  // ── 4c-H1: click payload ──────────────────────────────────────────────────

  it("4c-H1: buildAgentInteractionIntent produces valid click payload", () => {
    const p = makeIntent("click");
    expect(p.kind).toBe("click");
    expect(p.agentId).toBe("agent-test");
    expect(typeof p.intentId).toBe("string");
    expect(p.intentId.length).toBeGreaterThan(0);
    expect(p.ts).toBeGreaterThan(0);
    expect(typeof p.tsIso).toBe("string");
  });

  // ── 4c-H2: hover_enter payload ────────────────────────────────────────────

  it("4c-H2: buildAgentInteractionIntent produces valid hover_enter payload", () => {
    const p = makeIntent("hover_enter");
    expect(p.kind).toBe("hover_enter");
    expect(p.agentStatus).toBe("idle");
  });

  // ── 4c-H3: hover_exit payload ─────────────────────────────────────────────

  it("4c-H3: buildAgentInteractionIntent produces valid hover_exit payload", () => {
    const p = makeIntent("hover_exit");
    expect(p.kind).toBe("hover_exit");
  });

  // ── 4c-H4: context_menu payload ───────────────────────────────────────────

  it("4c-H4: buildAgentInteractionIntent produces valid context_menu payload", () => {
    const p = makeIntent("context_menu");
    expect(p.kind).toBe("context_menu");
  });

  // ── 4c-H5: hover_enter carries agent-scoped fields ────────────────────────

  it("4c-H5: hover_enter intent carries complete agent-scoped fields", () => {
    const p = buildAgentInteractionIntent({
      kind:          "hover_enter",
      agentId:       "researcher-3",
      agentName:     "Dr. Research",
      agentRole:     "researcher",
      agentStatus:   "active",
      roomId:        "lab-42",
      worldPosition: { x: 3.5, y: 0.5, z: -1.2 },
      wasSelected:   false,
      isDrillTarget: false,
    });

    expect(p.agentId).toBe("researcher-3");
    expect(p.agentName).toBe("Dr. Research");
    expect(p.agentRole).toBe("researcher");
    expect(p.agentStatus).toBe("active");
    expect(p.roomId).toBe("lab-42");
    expect(p.worldPosition).toEqual({ x: 3.5, y: 0.5, z: -1.2 });
    expect(p.wasSelected).toBe(false);
    expect(p.isDrillTarget).toBe(false);
  });

  // ── 4c-H6: click intent carries wasSelected and isDrillTarget ────────────

  it("4c-H6: click intent captures selection and drill-target context flags", () => {
    const alreadySelected = buildAgentInteractionIntent({
      kind:          "click",
      agentId:       "mgr-1",
      agentName:     "Manager",
      agentRole:     "manager",
      agentStatus:   "idle",
      roomId:        "management",
      worldPosition: { x: 0, y: 0, z: 0 },
      wasSelected:   true,   // was already selected before this click
      isDrillTarget: true,   // was the active drill target
    });

    expect(alreadySelected.wasSelected).toBe(true);
    expect(alreadySelected.isDrillTarget).toBe(true);

    const fresh = buildAgentInteractionIntent({
      kind:          "click",
      agentId:       "mgr-2",
      agentName:     "Manager 2",
      agentRole:     "manager",
      agentStatus:   "inactive",
      roomId:        "management",
      worldPosition: { x: 1, y: 0, z: 0 },
      wasSelected:   false,
      isDrillTarget: false,
    });

    expect(fresh.wasSelected).toBe(false);
    expect(fresh.isDrillTarget).toBe(false);
  });

  // ── 4c-H7: context_menu intent carries screenPosition ────────────────────

  it("4c-H7: context_menu intent carries screenPosition from pointer event", () => {
    const p = makeIntent("context_menu", "agent-ctx", {
      screenPosition: { x: 740, y: 320 },
    });

    expect(p.screenPosition).toBeDefined();
    expect(p.screenPosition!.x).toBe(740);
    expect(p.screenPosition!.y).toBe(320);
  });

  // ── 4c-H8: modifiers captured correctly ──────────────────────────────────

  it("4c-H8: keyboard modifiers are captured in the intent payload", () => {
    const ctrlClick = makeIntent("click", "agent-mod", {
      modifiers: { ctrl: true, shift: false, alt: false },
    });
    expect(ctrlClick.modifiers).toEqual({ ctrl: true, shift: false, alt: false });

    const shiftClick = makeIntent("click", "agent-shift", {
      modifiers: { ctrl: false, shift: true, alt: true },
    });
    expect(shiftClick.modifiers).toEqual({ ctrl: false, shift: true, alt: true });

    const noMods = makeIntent("hover_enter");
    expect(noMods.modifiers).toBeUndefined();
  });

  // ── 4c-H9: AGENT_INTERACTION_INTENT_CATEGORY constant ────────────────────

  it("4c-H9: AGENT_INTERACTION_INTENT_CATEGORY has the expected string value", () => {
    expect(AGENT_INTERACTION_INTENT_CATEGORY).toBe("agent.interaction_intent");
  });

  // ── 4c-H10: store emit is pure — no DOM dependency ────────────────────────

  it("4c-H10: emitAgentInteractionIntent executes without DOM or R3F context", () => {
    // This test runs in a Node.js environment (no DOM, no canvas).
    // The emit action must succeed purely with store + builder logic.
    const p = makeIntent("click", "pure-agent");
    expect(() => {
      useInteractionIntentStore.getState().emitAgentInteractionIntent(p);
    }).not.toThrow();

    const state = useInteractionIntentStore.getState();
    expect(state.intents).toHaveLength(1);
    expect(state.intents[0]!.agentId).toBe("pure-agent");
  });

  // ── 4c-H11: scene-event-log receives correct category and source ──────────

  it("4c-H11: forwarded scene-log entry has source=agent and correct category", () => {
    useSceneEventLog.getState().startRecording();
    const p = makeIntent("context_menu", "log-agent");
    useInteractionIntentStore.getState().emitAgentInteractionIntent(p);

    const entries = useSceneEventLog
      .getState()
      .entries.filter((e) => e.category === AGENT_INTERACTION_INTENT_CATEGORY);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.source).toBe("agent");
    expect(entries[0]!.ts).toBe(p.ts);
  });

  // ── 4c-H12: sequential intents maintain chronological order ──────────────

  it("4c-H12: intents are stored in chronological order (oldest first)", () => {
    makeIntent("hover_enter");
    // small delay to ensure different timestamps
    const p1 = makeIntent("hover_enter", "chronos-a");
    const p2 = makeIntent("click",       "chronos-b");
    const p3 = makeIntent("hover_exit",  "chronos-c");

    useInteractionIntentStore.getState().emitAgentInteractionIntent(p1);
    useInteractionIntentStore.getState().emitAgentInteractionIntent(p2);
    useInteractionIntentStore.getState().emitAgentInteractionIntent(p3);

    const { intents } = useInteractionIntentStore.getState();
    expect(intents).toHaveLength(3);
    // Stored in insertion order (oldest at index 0, newest at end)
    expect(intents[0]!.intentId).toBe(p1.intentId);
    expect(intents[1]!.intentId).toBe(p2.intentId);
    expect(intents[2]!.intentId).toBe(p3.intentId);
  });

  // ── 4c-H13: intent buffer does not exceed INTENT_BUFFER_MAX ──────────────

  it("4c-H13: intent buffer stays within INTENT_BUFFER_MAX bounds always", () => {
    for (let i = 0; i < INTENT_BUFFER_MAX; i++) {
      const p = makeIntent("hover_enter", `agent-${i}`);
      useInteractionIntentStore.getState().emitAgentInteractionIntent(p);
    }
    expect(useInteractionIntentStore.getState().intents.length).toBe(INTENT_BUFFER_MAX);

    // One more pushes it over — oldest should be evicted
    const overflow = makeIntent("click", "overflow-agent");
    useInteractionIntentStore.getState().emitAgentInteractionIntent(overflow);

    const state = useInteractionIntentStore.getState();
    expect(state.intents.length).toBe(INTENT_BUFFER_MAX);
    // The overflow entry is the newest (last)
    expect(state.intents[state.intents.length - 1]!.agentId).toBe("overflow-agent");
    // The first entry (agent-0) should have been evicted
    expect(state.intents[0]!.agentId).not.toBe("agent-0");
  });
});
