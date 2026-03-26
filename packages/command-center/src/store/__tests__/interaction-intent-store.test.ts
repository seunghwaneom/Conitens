/**
 * interaction-intent-store.test.ts — Unit tests for Sub-AC 4c.
 *
 * Tests the interaction-intent-store append-only ring buffer, typed payload
 * construction, selector correctness, and scene-event-log forwarding.
 *
 * Sub-AC 4c coverage:
 *   4c-1  emitAgentInteractionIntent appends to local ring buffer
 *   4c-2  totalEmitted increments monotonically (survives ring eviction)
 *   4c-3  lastIntent reflects most recent emission
 *   4c-4  ring buffer evicts oldest entries at INTENT_BUFFER_MAX
 *   4c-5  getIntentsForAgent returns most-recent-first filtered results
 *   4c-6  getIntentsByKind returns most-recent-first filtered by kind
 *   4c-7  getLastIntentByKind returns null when no matching intent exists
 *   4c-8  getLastIntentByKind returns the most-recent match
 *   4c-9  clearIntents resets buffer and counters
 *   4c-10 buildAgentInteractionIntent fills intentId, ts, tsIso automatically
 *   4c-11 payload fields are immutable (readonly shape satisfied at runtime)
 *   4c-12 scene-event-log receives forwarded intent when recording is active
 *   4c-13 scene-event-log does NOT receive forwarded intent when recording is off
 *   4c-14 multiple agents tracked independently
 *   4c-15 all four AgentInteractionIntentKind values are accepted
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useInteractionIntentStore,
  buildAgentInteractionIntent,
  INTENT_BUFFER_MAX,
  AGENT_INTERACTION_INTENT_CATEGORY,
  type AgentInteractionIntentKind,
  type AgentInteractionIntentPayload,
} from "../interaction-intent-store.js";
import { useSceneEventLog } from "../scene-event-log.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function resetStore() {
  useInteractionIntentStore.setState({
    intents:      [],
    totalEmitted: 0,
    lastIntent:   null,
  });
}

function resetSceneLog() {
  useSceneEventLog.setState({
    entries:          [],
    snapshots:        [],
    sessionId:        "test-session",
    recording:        false,
    totalRecorded:    0,
    seq:              0,
    recordingStartTs: null,
  });
}

/**
 * Build a minimal valid AgentInteractionIntentPayload for a given kind.
 * Omits auto-computed fields (intentId, ts, tsIso) — use buildAgentInteractionIntent().
 */
function makeIntentInput(
  kind: AgentInteractionIntentKind,
  agentId = "agent-01",
  overrides: Partial<Omit<AgentInteractionIntentPayload, "intentId" | "ts" | "tsIso">> = {},
): Omit<AgentInteractionIntentPayload, "intentId" | "ts" | "tsIso"> {
  return {
    kind,
    agentId,
    agentName:     `Agent ${agentId}`,
    agentRole:     "implementer",
    agentStatus:   "idle",
    roomId:        "ops-room",
    worldPosition: { x: 1, y: 0, z: 2 },
    wasSelected:   false,
    isDrillTarget: false,
    ...overrides,
  };
}

/** Emit one intent and return it. */
function emitOne(
  kind: AgentInteractionIntentKind = "click",
  agentId = "agent-01",
): AgentInteractionIntentPayload {
  const payload = buildAgentInteractionIntent(makeIntentInput(kind, agentId));
  useInteractionIntentStore.getState().emitAgentInteractionIntent(payload);
  return payload;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("interaction-intent-store — Sub-AC 4c", () => {
  beforeEach(() => {
    resetStore();
    resetSceneLog();
  });

  // ── 4c-1: emitAgentInteractionIntent appends to ring buffer ─────────────

  it("4c-1: appends intent to local ring buffer", () => {
    expect(useInteractionIntentStore.getState().intents).toHaveLength(0);
    emitOne("click");
    expect(useInteractionIntentStore.getState().intents).toHaveLength(1);
    emitOne("hover_enter");
    expect(useInteractionIntentStore.getState().intents).toHaveLength(2);
  });

  // ── 4c-2: totalEmitted is monotonic ─────────────────────────────────────

  it("4c-2: totalEmitted increments monotonically", () => {
    emitOne("click");
    emitOne("hover_enter");
    emitOne("hover_exit");
    expect(useInteractionIntentStore.getState().totalEmitted).toBe(3);
  });

  // ── 4c-3: lastIntent reflects most-recent emission ───────────────────────

  it("4c-3: lastIntent is the most recent intent", () => {
    emitOne("click");
    const last = emitOne("context_menu");
    const state = useInteractionIntentStore.getState();
    expect(state.lastIntent).not.toBeNull();
    expect(state.lastIntent!.intentId).toBe(last.intentId);
    expect(state.lastIntent!.kind).toBe("context_menu");
  });

  // ── 4c-4: ring buffer evicts oldest entries at INTENT_BUFFER_MAX ────────

  it("4c-4: ring buffer evicts oldest entries at INTENT_BUFFER_MAX", () => {
    // Emit INTENT_BUFFER_MAX + 10 intents
    const total = INTENT_BUFFER_MAX + 10;
    for (let i = 0; i < total; i++) {
      emitOne("hover_enter", `agent-${i}`);
    }

    const state = useInteractionIntentStore.getState();
    // Buffer must not exceed max
    expect(state.intents.length).toBeLessThanOrEqual(INTENT_BUFFER_MAX);
    // Monotonic total reflects actual count, not capped count
    expect(state.totalEmitted).toBe(total);
    // Oldest entries are gone; newest remain
    const lastInBuffer = state.intents[state.intents.length - 1];
    expect(lastInBuffer!.agentId).toBe(`agent-${total - 1}`);
  });

  // ── 4c-5: getIntentsForAgent returns most-recent-first ───────────────────

  it("4c-5: getIntentsForAgent returns filtered intents most-recent-first", () => {
    emitOne("click",       "agent-A");
    emitOne("hover_enter", "agent-B");
    emitOne("context_menu","agent-A");
    emitOne("hover_exit",  "agent-A");

    const forA = useInteractionIntentStore.getState().getIntentsForAgent("agent-A");
    expect(forA).toHaveLength(3);
    // Most-recent first: hover_exit → context_menu → click
    expect(forA[0]!.kind).toBe("hover_exit");
    expect(forA[1]!.kind).toBe("context_menu");
    expect(forA[2]!.kind).toBe("click");

    const forB = useInteractionIntentStore.getState().getIntentsForAgent("agent-B");
    expect(forB).toHaveLength(1);
    expect(forB[0]!.kind).toBe("hover_enter");
  });

  // ── 4c-6: getIntentsByKind returns most-recent-first ────────────────────

  it("4c-6: getIntentsByKind returns filtered intents by kind most-recent-first", () => {
    emitOne("click",  "a1");
    emitOne("hover_enter", "a1");
    emitOne("click",  "a2");
    emitOne("hover_enter", "a2");

    const clicks = useInteractionIntentStore.getState().getIntentsByKind("click");
    expect(clicks).toHaveLength(2);
    // Most-recent click first: a2 → a1
    expect(clicks[0]!.agentId).toBe("a2");
    expect(clicks[1]!.agentId).toBe("a1");
  });

  // ── 4c-7: getLastIntentByKind returns null when no match ────────────────

  it("4c-7: getLastIntentByKind returns null when no matching intent exists", () => {
    emitOne("click", "agent-X");
    const result = useInteractionIntentStore
      .getState()
      .getLastIntentByKind("agent-X", "hover_enter");
    expect(result).toBeNull();
  });

  // ── 4c-8: getLastIntentByKind returns the most-recent match ─────────────

  it("4c-8: getLastIntentByKind returns most-recent match for agent+kind pair", () => {
    const first  = emitOne("click", "agent-Y");
    emitOne("hover_enter", "agent-Y");
    const second = emitOne("click", "agent-Y");

    const result = useInteractionIntentStore
      .getState()
      .getLastIntentByKind("agent-Y", "click");
    expect(result).not.toBeNull();
    expect(result!.intentId).toBe(second.intentId);
    expect(result!.intentId).not.toBe(first.intentId);
  });

  // ── 4c-9: clearIntents resets everything ────────────────────────────────

  it("4c-9: clearIntents resets buffer and counters to initial state", () => {
    emitOne("click");
    emitOne("hover_enter");
    useInteractionIntentStore.getState().clearIntents();

    const state = useInteractionIntentStore.getState();
    expect(state.intents).toHaveLength(0);
    expect(state.totalEmitted).toBe(0);
    expect(state.lastIntent).toBeNull();
  });

  // ── 4c-10: buildAgentInteractionIntent auto-fills computed fields ─────────

  it("4c-10: buildAgentInteractionIntent fills intentId, ts, tsIso automatically", () => {
    const before = Date.now();
    const intent = buildAgentInteractionIntent(makeIntentInput("click"));
    const after  = Date.now();

    expect(typeof intent.intentId).toBe("string");
    expect(intent.intentId.length).toBeGreaterThan(0);
    expect(intent.ts).toBeGreaterThanOrEqual(before);
    expect(intent.ts).toBeLessThanOrEqual(after);
    expect(intent.tsIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // ── 4c-11: uniqueness of auto-generated intent IDs ───────────────────────

  it("4c-11: each emitted intent receives a unique intentId", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const intent = buildAgentInteractionIntent(makeIntentInput("click", `agent-${i}`));
      ids.add(intent.intentId);
    }
    expect(ids.size).toBe(20);
  });

  // ── 4c-12: scene-event-log forwarding when recording is active ───────────

  it("4c-12: emitted intent is forwarded to scene-event-log when recording is active", () => {
    // Start recording
    useSceneEventLog.getState().startRecording();

    const intent = emitOne("click", "agent-fwd");

    const { entries } = useSceneEventLog.getState();
    // There should be a recording.started entry + our intent entry
    const intentEntries = entries.filter(
      (e) => e.category === AGENT_INTERACTION_INTENT_CATEGORY,
    );
    expect(intentEntries).toHaveLength(1);
    expect(intentEntries[0]!.payload["intentId"]).toBe(intent.intentId);
    expect(intentEntries[0]!.payload["agentId"]).toBe("agent-fwd");
    expect(intentEntries[0]!.payload["kind"]).toBe("click");
    expect(intentEntries[0]!.source).toBe("agent");
  });

  // ── 4c-13: scene-event-log NOT updated when recording is off ─────────────

  it("4c-13: emitted intent is NOT forwarded to scene-event-log when recording is off", () => {
    // Explicitly ensure recording is off (default)
    expect(useSceneEventLog.getState().recording).toBe(false);

    emitOne("hover_enter", "agent-silent");

    const { entries } = useSceneEventLog.getState();
    const intentEntries = entries.filter(
      (e) => e.category === AGENT_INTERACTION_INTENT_CATEGORY,
    );
    expect(intentEntries).toHaveLength(0);
  });

  // ── 4c-14: multiple agents tracked independently ─────────────────────────

  it("4c-14: intents from multiple agents are stored and retrieved independently", () => {
    emitOne("click",       "alpha");
    emitOne("hover_enter", "beta");
    emitOne("context_menu","alpha");
    emitOne("hover_exit",  "gamma");
    emitOne("click",       "beta");

    const { getIntentsForAgent } = useInteractionIntentStore.getState();
    expect(getIntentsForAgent("alpha")).toHaveLength(2);
    expect(getIntentsForAgent("beta")).toHaveLength(2);
    expect(getIntentsForAgent("gamma")).toHaveLength(1);
    expect(getIntentsForAgent("delta")).toHaveLength(0); // never emitted
  });

  // ── 4c-15: all four kind values are accepted ─────────────────────────────

  it("4c-15: all four AgentInteractionIntentKind values are accepted and stored", () => {
    const kinds: AgentInteractionIntentKind[] = [
      "click",
      "hover_enter",
      "hover_exit",
      "context_menu",
    ];
    for (const kind of kinds) {
      emitOne(kind, `agent-${kind}`);
    }

    const state = useInteractionIntentStore.getState();
    expect(state.intents).toHaveLength(4);
    const storedKinds = state.intents.map((i) => i.kind);
    for (const k of kinds) {
      expect(storedKinds).toContain(k);
    }
  });

  // ── 4c-16: payload carries agent scope fields ────────────────────────────

  it("4c-16: emitted payload carries full agent-scoped fields", () => {
    const input = makeIntentInput("context_menu", "researcher-7", {
      agentName:     "Researcher Bot",
      agentRole:     "researcher",
      agentStatus:   "busy",
      roomId:        "lab-room",
      worldPosition: { x: 5, y: 1, z: -3 },
      screenPosition: { x: 400, y: 200 },
      modifiers:     { ctrl: true, shift: false, alt: false },
      wasSelected:   true,
      isDrillTarget: true,
      sessionId:     "sess-xyz",
    });
    const intent = buildAgentInteractionIntent(input);
    useInteractionIntentStore.getState().emitAgentInteractionIntent(intent);

    const stored = useInteractionIntentStore.getState().intents[0]!;
    expect(stored.agentId).toBe("researcher-7");
    expect(stored.agentName).toBe("Researcher Bot");
    expect(stored.agentRole).toBe("researcher");
    expect(stored.agentStatus).toBe("busy");
    expect(stored.roomId).toBe("lab-room");
    expect(stored.worldPosition).toEqual({ x: 5, y: 1, z: -3 });
    expect(stored.screenPosition).toEqual({ x: 400, y: 200 });
    expect(stored.modifiers).toEqual({ ctrl: true, shift: false, alt: false });
    expect(stored.wasSelected).toBe(true);
    expect(stored.isDrillTarget).toBe(true);
    expect(stored.sessionId).toBe("sess-xyz");
  });

  // ── 4c-17: intent IDs in scene-event-log match the buffer ────────────────

  it("4c-17: scene-event-log intentId matches the buffer entry intentId", () => {
    useSceneEventLog.getState().startRecording();
    const intent = emitOne("click", "audit-agent");

    const logEntries = useSceneEventLog
      .getState()
      .entries.filter((e) => e.category === AGENT_INTERACTION_INTENT_CATEGORY);

    expect(logEntries).toHaveLength(1);
    expect(logEntries[0]!.payload["intentId"]).toBe(intent.intentId);

    const bufferEntry = useInteractionIntentStore.getState().intents[0];
    expect(bufferEntry!.intentId).toBe(intent.intentId);
  });
});
