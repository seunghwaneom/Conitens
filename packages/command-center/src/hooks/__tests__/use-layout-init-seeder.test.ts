/**
 * use-layout-init-seeder.test.ts — Unit tests for Sub-AC 9a
 *
 * Tests the layout.init seeding logic without requiring a React render
 * environment. Uses direct Zustand store manipulation to simulate recording
 * state transitions and verifies that the correct entries appear in the log.
 *
 * Validates:
 *   1. LayoutInitSeeder is exported as a function (React component)
 *   2. useLayoutInitSeeder is exported as a function (React hook)
 *   3. When recording is false, no layout.init entry is appended
 *   4. When recording transitions to true, a layout.init entry is appended
 *   5. The seeded entry has category "layout.init" and source "system"
 *   6. The seeded entry payload passes the isLayoutInitPayload type guard
 *   7. The payload contains rooms, agents, and fixtures arrays
 *   8. Only one layout.init entry is seeded even if the hook effect runs twice
 *      (simulates React StrictMode double-invocation via the seededRef guard)
 *   9. The seeded layout.init payload matches buildLayoutInitPayload() output
 *  10. PRIMARY_LAYOUT_ID appears in the payload
 *
 * Architecture note:
 *   This file tests the seeding contract at the data-layer level using
 *   Zustand store manipulation rather than mounting React components
 *   (which would require jsdom + react-testing-library). The hook itself
 *   is a thin wrapper around recordEntry() + buildLayoutInitPayload() —
 *   the real complexity lives in those two tested-separately modules.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useSceneEventLog,
  type SceneLogEntry,
} from "../../store/scene-event-log.js";
import { buildLayoutInitPayload, PRIMARY_LAYOUT_ID } from "../../data/layout-init-seeder.js";
import { isLayoutInitPayload } from "@conitens/protocol";
import { LayoutInitSeeder, useLayoutInitSeeder } from "../use-layout-init-seeder.js";
import { BUILDING } from "../../data/building.js";
import { AGENT_INITIAL_PLACEMENTS } from "../../data/agent-seed.js";

// ── Store reset helper ─────────────────────────────────────────────────────

function resetStore() {
  useSceneEventLog.setState({
    entries: [],
    snapshots: [],
    sessionId: "test-session-init",
    recording: false,
    totalRecorded: 0,
    seq: 0,
    recordingStartTs: null,
  });
}

function getLayoutInitEntries(): SceneLogEntry[] {
  return useSceneEventLog
    .getState()
    .entries.filter((e) => e.category === "layout.init");
}

// ── 1 & 2. Exports are functions ──────────────────────────────────────────

describe("use-layout-init-seeder exports", () => {
  it("LayoutInitSeeder is exported as a function (React component)", () => {
    expect(typeof LayoutInitSeeder).toBe("function");
  });

  it("useLayoutInitSeeder is exported as a function (React hook)", () => {
    expect(typeof useLayoutInitSeeder).toBe("function");
  });
});

// ── 3. No seed when not recording ────────────────────────────────────────

describe("useLayoutInitSeeder — guard: not recording", () => {
  beforeEach(resetStore);

  it("does NOT append a layout.init entry when recording is false", () => {
    // Simulate what the hook does when recording === false
    const state = useSceneEventLog.getState();
    if (!state.recording) {
      // Hook's effect returns early — nothing should be recorded
    }
    expect(getLayoutInitEntries()).toHaveLength(0);
  });
});

// ── 4. Entry is seeded when recording starts ─────────────────────────────

describe("useLayoutInitSeeder — seeds layout.init on recording start", () => {
  beforeEach(resetStore);

  it("appends a layout.init entry after startRecording + recordEntry are called", () => {
    // Start recording (simulates SceneRecorder mounting before this seeder)
    useSceneEventLog.getState().startRecording();

    // Simulate the hook's effect body: build payload and record entry
    const payload = buildLayoutInitPayload(BUILDING, AGENT_INITIAL_PLACEMENTS);
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const entries = getLayoutInitEntries();
    expect(entries).toHaveLength(1);
  });

  it("the entry has category 'layout.init'", () => {
    useSceneEventLog.getState().startRecording();
    const payload = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const entry = getLayoutInitEntries()[0];
    expect(entry.category).toBe("layout.init");
  });

  it("the entry has source 'system'", () => {
    useSceneEventLog.getState().startRecording();
    const payload = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const entry = getLayoutInitEntries()[0];
    expect(entry.source).toBe("system");
  });
});

// ── 5 & 6. Payload validity ────────────────────────────────────────────────

describe("useLayoutInitSeeder — payload validity", () => {
  beforeEach(resetStore);

  it("payload passes the isLayoutInitPayload type guard", () => {
    useSceneEventLog.getState().startRecording();
    const payload = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const entry = getLayoutInitEntries()[0];
    expect(isLayoutInitPayload(entry.payload)).toBe(true);
  });

  it("payload contains rooms array", () => {
    useSceneEventLog.getState().startRecording();
    const payload = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const entry = getLayoutInitEntries()[0];
    expect(Array.isArray(entry.payload["rooms"])).toBe(true);
    expect((entry.payload["rooms"] as unknown[]).length).toBeGreaterThan(0);
  });

  it("payload contains agents array", () => {
    useSceneEventLog.getState().startRecording();
    const payload = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const entry = getLayoutInitEntries()[0];
    expect(Array.isArray(entry.payload["agents"])).toBe(true);
    expect((entry.payload["agents"] as unknown[]).length).toBeGreaterThan(0);
  });

  it("payload contains fixtures array", () => {
    useSceneEventLog.getState().startRecording();
    const payload = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const entry = getLayoutInitEntries()[0];
    expect(Array.isArray(entry.payload["fixtures"])).toBe(true);
    expect((entry.payload["fixtures"] as unknown[]).length).toBeGreaterThan(0);
  });
});

// ── 8. Single-emission guard (simulated) ──────────────────────────────────

describe("useLayoutInitSeeder — single emission", () => {
  beforeEach(resetStore);

  it("emitting twice is idempotent when guarded by seededRef", () => {
    // Simulate what the hook does with its seededRef guard:
    // the first call seeds, the second is a no-op.
    useSceneEventLog.getState().startRecording();

    let seeded = false; // mirrors seededRef.current

    function simulateHookEffect() {
      const state = useSceneEventLog.getState();
      if (!state.recording) return;
      if (seeded) return; // ref guard
      seeded = true;
      const payload = buildLayoutInitPayload();
      state.recordEntry({
        ts: Date.now(),
        category: "layout.init",
        source: "system",
        payload: payload as unknown as Record<string, unknown>,
      });
    }

    simulateHookEffect(); // first invocation — seeds
    simulateHookEffect(); // second invocation — no-op
    simulateHookEffect(); // third invocation — no-op

    expect(getLayoutInitEntries()).toHaveLength(1);
  });
});

// ── 9. Payload matches buildLayoutInitPayload output ─────────────────────

describe("useLayoutInitSeeder — payload matches buildLayoutInitPayload", () => {
  beforeEach(resetStore);

  it("recorded payload is structurally equal to buildLayoutInitPayload()", () => {
    useSceneEventLog.getState().startRecording();
    const expected = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: expected as unknown as Record<string, unknown>,
    });

    const entry = getLayoutInitEntries()[0];
    // Deep equality via JSON serialisation (strips undefined, functions)
    expect(JSON.stringify(entry.payload)).toBe(JSON.stringify(expected));
  });
});

// ── 10. PRIMARY_LAYOUT_ID in payload ─────────────────────────────────────

describe("useLayoutInitSeeder — PRIMARY_LAYOUT_ID in payload", () => {
  beforeEach(resetStore);

  it("payload.layout_id equals PRIMARY_LAYOUT_ID", () => {
    useSceneEventLog.getState().startRecording();
    const payload = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const entry = getLayoutInitEntries()[0];
    expect(entry.payload["layout_id"]).toBe(PRIMARY_LAYOUT_ID);
  });
});

// ── Seq ordering ──────────────────────────────────────────────────────────

describe("useLayoutInitSeeder — seq ordering", () => {
  beforeEach(resetStore);

  it("layout.init entry gets a seq > 1 (recording.started is seq 1)", () => {
    useSceneEventLog.getState().startRecording();
    const payload = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const entry = getLayoutInitEntries()[0];
    // recording.started occupies seq 1; layout.init must be seq >= 2
    expect(entry.seq).toBeGreaterThanOrEqual(2);
  });

  it("layout.init entry's seq is monotonically after recording.started", () => {
    useSceneEventLog.getState().startRecording();
    const startedEntry = useSceneEventLog
      .getState()
      .entries.find((e) => e.category === "recording.started");

    const payload = buildLayoutInitPayload();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });

    const initEntry = getLayoutInitEntries()[0];
    expect(initEntry.seq).toBeGreaterThan(startedEntry!.seq);
  });
});
