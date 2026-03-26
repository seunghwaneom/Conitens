/**
 * scene-event-log.test.ts — Tests for AC 9.1 scene event log.
 *
 * Validates that:
 *  1. startRecording emits a recording.started meta-event
 *  2. recordEntry appends entries with correct seq numbers
 *  3. recordBatch appends multiple entries atomically
 *  4. recordEntry is silently dropped when recording === false
 *  5. MAX_LOG_ENTRIES rolling eviction works correctly
 *  6. clearLog resets to a new session with seq = 1
 *  7. takeSnapshot respects the SNAPSHOT_ENTRY_INTERVAL gate
 *  8. forceSnapshot bypasses the interval gate
 *  9. getEntriesSince filters by timestamp
 * 10. getEntriesBySeqRange filters correctly
 * 11. getEntriesByCategory returns correct subset
 * 12. getEntriesBySource returns correct subset
 * 13. getNearestSnapshot finds latest snapshot at or before ts
 * 14. getNearestSnapshotBySeq finds latest snapshot at or before seq
 * 15. exportLog produces valid JSON with expected fields
 * 16. Seq numbers are monotonically increasing across recordEntry calls
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useSceneEventLog,
  MAX_LOG_ENTRIES,
  SNAPSHOT_ENTRY_INTERVAL,
  type SceneSnapshot,
  type AgentSnapshotState,
  type RoomSnapshotState,
} from "../scene-event-log.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function resetStore() {
  useSceneEventLog.setState({
    entries: [],
    snapshots: [],
    sessionId: "test-session",
    recording: false,
    totalRecorded: 0,
    seq: 0,
    recordingStartTs: null,
  });
}

function makeAgentSnap(agentId = "agent-1"): Record<string, AgentSnapshotState> {
  return {
    [agentId]: {
      agentId,
      roomId: "ops-room",
      status: "active",
      worldPosition: { x: 1, y: 0, z: 1 },
      currentTaskId: "task-123",
    },
  };
}

function makeRoomSnap(roomId = "ops-room"): Record<string, RoomSnapshotState> {
  return {
    [roomId]: {
      roomId,
      activeMembers: ["agent-1"],
      activity: "active",
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useSceneEventLog — startRecording", () => {
  beforeEach(resetStore);

  it("transitions recording to true", () => {
    useSceneEventLog.getState().startRecording();
    expect(useSceneEventLog.getState().recording).toBe(true);
  });

  it("emits a recording.started meta-event as first entry", () => {
    useSceneEventLog.getState().startRecording();
    const { entries } = useSceneEventLog.getState();
    expect(entries.length).toBe(1);
    expect(entries[0].category).toBe("recording.started");
    expect(entries[0].source).toBe("system");
  });

  it("sets seq to 1 after start", () => {
    useSceneEventLog.getState().startRecording();
    expect(useSceneEventLog.getState().seq).toBe(1);
  });

  it("sets recordingStartTs to a non-null value", () => {
    useSceneEventLog.getState().startRecording();
    expect(useSceneEventLog.getState().recordingStartTs).not.toBeNull();
  });

  it("is a no-op if already recording", () => {
    useSceneEventLog.getState().startRecording();
    const prevEntryCount = useSceneEventLog.getState().entries.length;
    useSceneEventLog.getState().startRecording();
    expect(useSceneEventLog.getState().entries.length).toBe(prevEntryCount);
  });
});

describe("useSceneEventLog — recordEntry", () => {
  beforeEach(resetStore);

  it("silently drops entries when recording is false", () => {
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "agent.moved",
      source: "agent",
      payload: { agentId: "a1" },
    });
    expect(useSceneEventLog.getState().entries.length).toBe(0);
  });

  it("appends an entry when recording is true", () => {
    useSceneEventLog.getState().startRecording();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "agent.moved",
      source: "agent",
      payload: { agentId: "a1" },
    });
    const { entries } = useSceneEventLog.getState();
    // Entries: recording.started + agent.moved = 2
    expect(entries.length).toBe(2);
    expect(entries[1].category).toBe("agent.moved");
  });

  it("assigns monotonically increasing seq numbers", () => {
    useSceneEventLog.getState().startRecording();
    for (let i = 0; i < 5; i++) {
      useSceneEventLog.getState().recordEntry({
        ts: Date.now(),
        category: "room.member_joined",
        source: "spatial",
        payload: {},
      });
    }
    const { entries } = useSceneEventLog.getState();
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].seq).toBe(entries[i - 1].seq + 1);
    }
  });

  it("increments totalRecorded on each entry", () => {
    useSceneEventLog.getState().startRecording();
    const beforeCount = useSceneEventLog.getState().totalRecorded;
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "agent.status_changed",
      source: "agent",
      payload: {},
    });
    expect(useSceneEventLog.getState().totalRecorded).toBe(beforeCount + 1);
  });

  it("sets tsIso to a valid ISO-8601 string", () => {
    useSceneEventLog.getState().startRecording();
    const ts = Date.now();
    useSceneEventLog.getState().recordEntry({
      ts,
      category: "building.loaded",
      source: "spatial",
      payload: {},
    });
    const { entries } = useSceneEventLog.getState();
    const lastEntry = entries[entries.length - 1];
    expect(lastEntry.tsIso).toBe(new Date(ts).toISOString());
  });

  it("attaches the current sessionId to each entry", () => {
    useSceneEventLog.getState().startRecording();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(),
      category: "camera.reset",
      source: "spatial",
      payload: {},
    });
    const { entries, sessionId } = useSceneEventLog.getState();
    const lastEntry = entries[entries.length - 1];
    expect(lastEntry.sessionId).toBe(sessionId);
  });
});

describe("useSceneEventLog — recordBatch", () => {
  beforeEach(resetStore);

  it("silently drops batch when recording is false", () => {
    useSceneEventLog.getState().recordBatch([
      { ts: Date.now(), category: "agent.moved", source: "agent", payload: {} },
      { ts: Date.now(), category: "room.member_joined", source: "spatial", payload: {} },
    ]);
    expect(useSceneEventLog.getState().entries.length).toBe(0);
  });

  it("appends all batch entries atomically", () => {
    useSceneEventLog.getState().startRecording();
    useSceneEventLog.getState().recordBatch([
      { ts: Date.now(), category: "agent.moved",         source: "agent",   payload: {} },
      { ts: Date.now(), category: "room.member_joined",  source: "spatial", payload: {} },
      { ts: Date.now(), category: "agent.status_changed", source: "agent",  payload: {} },
    ]);
    const { entries } = useSceneEventLog.getState();
    // recording.started + 3 batch entries = 4
    expect(entries.length).toBe(4);
  });

  it("assigns consecutive seq numbers to batch entries", () => {
    useSceneEventLog.getState().startRecording();
    useSceneEventLog.getState().recordBatch([
      { ts: Date.now(), category: "agent.moved",         source: "agent", payload: {} },
      { ts: Date.now(), category: "agent.status_changed", source: "agent", payload: {} },
    ]);
    const { entries } = useSceneEventLog.getState();
    // entries[0] = recording.started (seq 1), entries[1] = seq 2, entries[2] = seq 3
    expect(entries[1].seq).toBe(2);
    expect(entries[2].seq).toBe(3);
  });

  it("increments totalRecorded by batch length", () => {
    useSceneEventLog.getState().startRecording();
    const before = useSceneEventLog.getState().totalRecorded;
    useSceneEventLog.getState().recordBatch([
      { ts: Date.now(), category: "agent.placed", source: "agent", payload: {} },
      { ts: Date.now(), category: "agents.initialized", source: "agent", payload: {} },
    ]);
    expect(useSceneEventLog.getState().totalRecorded).toBe(before + 2);
  });
});

describe("useSceneEventLog — rolling eviction", () => {
  beforeEach(resetStore);

  it("evicts oldest entries when MAX_LOG_ENTRIES is exceeded", () => {
    useSceneEventLog.getState().startRecording();

    // Fill to exactly MAX_LOG_ENTRIES (counting the recording.started entry)
    const inputs = Array.from({ length: MAX_LOG_ENTRIES }, (_, i) => ({
      ts: Date.now() + i,
      category: "room.member_joined" as const,
      source: "spatial" as const,
      payload: { idx: i },
    }));
    useSceneEventLog.getState().recordBatch(inputs);

    const { entries } = useSceneEventLog.getState();
    expect(entries.length).toBeLessThanOrEqual(MAX_LOG_ENTRIES);
  });

  it("keeps exactly MAX_LOG_ENTRIES entries after overflow", () => {
    useSceneEventLog.getState().startRecording();

    const inputs = Array.from({ length: MAX_LOG_ENTRIES + 100 }, (_, i) => ({
      ts: Date.now() + i,
      category: "agent.moved" as const,
      source: "agent" as const,
      payload: { idx: i },
    }));
    useSceneEventLog.getState().recordBatch(inputs);

    const { entries } = useSceneEventLog.getState();
    expect(entries.length).toBe(MAX_LOG_ENTRIES);
  });
});

describe("useSceneEventLog — clearLog", () => {
  beforeEach(resetStore);

  it("resets entries to a single recording.cleared meta-event", () => {
    useSceneEventLog.getState().startRecording();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(), category: "agent.moved", source: "agent", payload: {},
    });
    useSceneEventLog.getState().clearLog();
    const { entries } = useSceneEventLog.getState();
    expect(entries.length).toBe(1);
    expect(entries[0].category).toBe("recording.cleared");
  });

  it("generates a new sessionId", () => {
    const prevSessionId = useSceneEventLog.getState().sessionId;
    useSceneEventLog.getState().clearLog();
    expect(useSceneEventLog.getState().sessionId).not.toBe(prevSessionId);
  });

  it("resets seq to 1", () => {
    useSceneEventLog.getState().startRecording();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(), category: "agent.moved", source: "agent", payload: {},
    });
    useSceneEventLog.getState().clearLog();
    expect(useSceneEventLog.getState().seq).toBe(1);
  });

  it("clears snapshots array", () => {
    useSceneEventLog.getState().startRecording();
    // Force a snapshot by directly overriding the interval gate via forceSnapshot
    useSceneEventLog.getState().forceSnapshot(makeAgentSnap(), makeRoomSnap());
    expect(useSceneEventLog.getState().snapshots.length).toBeGreaterThan(0);
    useSceneEventLog.getState().clearLog();
    expect(useSceneEventLog.getState().snapshots.length).toBe(0);
  });

  it("sets recording to true after clear", () => {
    useSceneEventLog.getState().pauseRecording();
    useSceneEventLog.getState().clearLog();
    expect(useSceneEventLog.getState().recording).toBe(true);
  });
});

describe("useSceneEventLog — snapshots", () => {
  beforeEach(resetStore);

  it("takeSnapshot does nothing when recording is false", () => {
    useSceneEventLog.getState().takeSnapshot(makeAgentSnap(), makeRoomSnap());
    expect(useSceneEventLog.getState().snapshots.length).toBe(0);
  });

  it("takeSnapshot respects SNAPSHOT_ENTRY_INTERVAL gate after a prior snapshot", () => {
    useSceneEventLog.getState().startRecording();

    // Add enough events to take a first snapshot
    const inputs = Array.from({ length: SNAPSHOT_ENTRY_INTERVAL }, (_, i) => ({
      ts: Date.now() + i,
      category: "room.member_joined" as const,
      source: "spatial" as const,
      payload: {},
    }));
    useSceneEventLog.getState().recordBatch(inputs);
    useSceneEventLog.getState().takeSnapshot(makeAgentSnap(), makeRoomSnap());
    expect(useSceneEventLog.getState().snapshots.length).toBe(1);

    // Immediately try another snapshot — gate should block (not enough new events)
    useSceneEventLog.getState().takeSnapshot(makeAgentSnap(), makeRoomSnap());
    expect(useSceneEventLog.getState().snapshots.length).toBe(1); // Still 1
  });

  it("takeSnapshot succeeds after SNAPSHOT_ENTRY_INTERVAL entries", () => {
    useSceneEventLog.getState().startRecording();

    // Add SNAPSHOT_ENTRY_INTERVAL entries to cross the gate
    const inputs = Array.from({ length: SNAPSHOT_ENTRY_INTERVAL }, (_, i) => ({
      ts: Date.now() + i,
      category: "room.member_joined" as const,
      source: "spatial" as const,
      payload: {},
    }));
    useSceneEventLog.getState().recordBatch(inputs);

    useSceneEventLog.getState().takeSnapshot(makeAgentSnap(), makeRoomSnap());
    expect(useSceneEventLog.getState().snapshots.length).toBe(1);
  });

  it("forceSnapshot bypasses the interval gate", () => {
    useSceneEventLog.getState().startRecording();
    // Only 1 event (recording.started) — not enough for regular snapshot
    useSceneEventLog.getState().forceSnapshot(makeAgentSnap(), makeRoomSnap());
    expect(useSceneEventLog.getState().snapshots.length).toBe(1);
  });

  it("snapshot contains correct agent and room data", () => {
    useSceneEventLog.getState().startRecording();
    const agentSnap = makeAgentSnap("agent-xyz");
    const roomSnap  = makeRoomSnap("room-xyz");
    useSceneEventLog.getState().forceSnapshot(agentSnap, roomSnap);

    const snap = useSceneEventLog.getState().snapshots[0];
    expect(snap.agents["agent-xyz"]).toBeDefined();
    expect(snap.agents["agent-xyz"].status).toBe("active");
    expect(snap.rooms["room-xyz"]).toBeDefined();
    expect(snap.rooms["room-xyz"].activity).toBe("active");
  });
});

describe("useSceneEventLog — selectors", () => {
  beforeEach(resetStore);

  function populateLog() {
    useSceneEventLog.getState().startRecording();
    const t0 = 1_000_000;
    useSceneEventLog.getState().recordEntry({
      ts: t0, category: "agent.moved", source: "agent", payload: { agentId: "a1" },
    });
    useSceneEventLog.getState().recordEntry({
      ts: t0 + 100, category: "room.member_joined", source: "spatial", payload: {},
    });
    useSceneEventLog.getState().recordEntry({
      ts: t0 + 200, category: "agent.status_changed", source: "agent", payload: {},
    });
  }

  it("getEntriesSince returns entries at or after given ts", () => {
    populateLog();
    const { getEntriesSince } = useSceneEventLog.getState();
    const result = getEntriesSince(1_000_100);
    // All returned entries must satisfy the filter
    expect(result.every((e) => e.ts >= 1_000_100)).toBe(true);
    // The two fixture entries at t0+100 and t0+200 are included.
    // The "recording.started" meta-event has ts = Date.now() >> t0, so it's also included.
    // Verify at least the two fixture entries are present.
    expect(result.filter((e) => e.ts === 1_000_100 || e.ts === 1_000_200).length).toBe(2);
  });

  it("getEntriesByCategory returns only matching entries", () => {
    populateLog();
    const { getEntriesByCategory } = useSceneEventLog.getState();
    const moved = getEntriesByCategory("agent.moved");
    expect(moved.every((e) => e.category === "agent.moved")).toBe(true);
    expect(moved.length).toBe(1);
  });

  it("getEntriesBySource returns only matching entries", () => {
    populateLog();
    const { getEntriesBySource } = useSceneEventLog.getState();
    const agentEntries = getEntriesBySource("agent");
    expect(agentEntries.every((e) => e.source === "agent")).toBe(true);
    // recording.started (system), agent.moved (agent), room.member_joined (spatial), agent.status_changed (agent)
    expect(agentEntries.length).toBe(2);
  });

  it("getEntriesBySeqRange returns correct slice", () => {
    populateLog();
    const { getEntriesBySeqRange } = useSceneEventLog.getState();
    const result = getEntriesBySeqRange(2, 3);
    expect(result.every((e) => e.seq >= 2 && e.seq <= 3)).toBe(true);
    expect(result.length).toBe(2);
  });

  it("getNearestSnapshot returns null when no snapshots exist", () => {
    useSceneEventLog.getState().startRecording();
    const snap = useSceneEventLog.getState().getNearestSnapshot(Date.now());
    expect(snap).toBeNull();
  });

  it("getNearestSnapshot returns correct snapshot for a given timestamp", () => {
    useSceneEventLog.getState().startRecording();
    const t0 = 1_000_000;

    // Manually inject snapshots via setState to bypass interval gate
    const snap1: SceneSnapshot = {
      id: "s1", ts: t0, tsIso: new Date(t0).toISOString(),
      sessionId: "test-session", seqAtSnapshot: 5,
      agents: {}, rooms: {},
    };
    const snap2: SceneSnapshot = {
      id: "s2", ts: t0 + 1000, tsIso: new Date(t0 + 1000).toISOString(),
      sessionId: "test-session", seqAtSnapshot: 10,
      agents: {}, rooms: {},
    };
    useSceneEventLog.setState({ snapshots: [snap1, snap2] });

    // Seeking to t0 + 500 → should return snap1 (most recent at or before)
    const result = useSceneEventLog.getState().getNearestSnapshot(t0 + 500);
    expect(result?.id).toBe("s1");

    // Seeking to t0 + 1000 → should return snap2 (exact match)
    const result2 = useSceneEventLog.getState().getNearestSnapshot(t0 + 1000);
    expect(result2?.id).toBe("s2");

    // Seeking before both → null
    const result3 = useSceneEventLog.getState().getNearestSnapshot(t0 - 1);
    expect(result3).toBeNull();
  });

  it("getNearestSnapshotBySeq returns correct snapshot by seq", () => {
    useSceneEventLog.getState().startRecording();
    const t0 = Date.now();

    const snap1: SceneSnapshot = {
      id: "s1", ts: t0, tsIso: new Date(t0).toISOString(),
      sessionId: "test-session", seqAtSnapshot: 10,
      agents: {}, rooms: {},
    };
    const snap2: SceneSnapshot = {
      id: "s2", ts: t0 + 1000, tsIso: new Date(t0 + 1000).toISOString(),
      sessionId: "test-session", seqAtSnapshot: 20,
      agents: {}, rooms: {},
    };
    useSceneEventLog.setState({ snapshots: [snap1, snap2] });

    expect(useSceneEventLog.getState().getNearestSnapshotBySeq(15)?.id).toBe("s1");
    expect(useSceneEventLog.getState().getNearestSnapshotBySeq(20)?.id).toBe("s2");
    expect(useSceneEventLog.getState().getNearestSnapshotBySeq(5)).toBeNull();
  });
});

describe("useSceneEventLog — exportLog", () => {
  beforeEach(resetStore);

  it("returns valid JSON", () => {
    useSceneEventLog.getState().startRecording();
    const json = useSceneEventLog.getState().exportLog();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("export contains expected top-level fields", () => {
    useSceneEventLog.getState().startRecording();
    const parsed = JSON.parse(useSceneEventLog.getState().exportLog());
    expect(parsed.schema).toBe("scene-event-log@1.0.0");
    expect(parsed.sessionId).toBeDefined();
    expect(parsed.totalRecorded).toBeGreaterThan(0);
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(Array.isArray(parsed.snapshots)).toBe(true);
    expect(parsed.exportTs).toBeDefined();
    expect(parsed.exportTsIso).toBeDefined();
  });
});

describe("useSceneEventLog — pause/resume recording", () => {
  beforeEach(resetStore);

  it("pauseRecording sets recording to false", () => {
    useSceneEventLog.getState().startRecording();
    useSceneEventLog.getState().pauseRecording();
    expect(useSceneEventLog.getState().recording).toBe(false);
  });

  it("resumeRecording sets recording to true", () => {
    useSceneEventLog.getState().startRecording();
    useSceneEventLog.getState().pauseRecording();
    useSceneEventLog.getState().resumeRecording();
    expect(useSceneEventLog.getState().recording).toBe(true);
  });

  it("entries recorded after resume have correct sessionId", () => {
    useSceneEventLog.getState().startRecording();
    useSceneEventLog.getState().pauseRecording();
    useSceneEventLog.getState().resumeRecording();
    useSceneEventLog.getState().recordEntry({
      ts: Date.now(), category: "agent.moved", source: "agent", payload: {},
    });
    const { entries, sessionId } = useSceneEventLog.getState();
    const lastEntry = entries[entries.length - 1];
    expect(lastEntry.sessionId).toBe(sessionId);
  });
});
