/**
 * metrics-store-live.test.ts — Tests for Sub-AC 6c live data ingestion.
 *
 * Validates that:
 *  1. setConnectionStatus correctly updates connectionStatus
 *  2. ingestLiveEvent increments liveEventCount and _pendingEventCount
 *  3. task.created increments _liveTaskQueueDepth
 *  4. task.completed/failed/cancelled decrements _liveTaskQueueDepth
 *  5. _liveTaskQueueDepth never goes below 0 (floor clamp)
 *  6. tick() integrates live pending count into throughputHistory
 *  7. tick() integrates live task depth into taskQueueHistory
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useMetricsStore } from "../metrics-store.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeEvent(type: string, payload: Record<string, unknown> = {}) {
  return { type, payload };
}

function resetStore() {
  // Reset to initial state by calling stop and re-initializing defaults
  useMetricsStore.getState().stopTicking();
  useMetricsStore.setState({
    connectionStatus:    "disconnected",
    liveEventCount:      0,
    _pendingEventCount:  0,
    _liveTaskQueueDepth: 0,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("useMetricsStore — connection status (Sub-AC 6c)", () => {
  beforeEach(resetStore);

  it("starts as 'disconnected'", () => {
    expect(useMetricsStore.getState().connectionStatus).toBe("disconnected");
  });

  it("setConnectionStatus updates status", () => {
    useMetricsStore.getState().setConnectionStatus("connected");
    expect(useMetricsStore.getState().connectionStatus).toBe("connected");
  });

  it("accepts all valid DataSourceMode values", () => {
    const modes = ["connecting", "connected", "degraded", "disconnected"] as const;
    for (const mode of modes) {
      useMetricsStore.getState().setConnectionStatus(mode);
      expect(useMetricsStore.getState().connectionStatus).toBe(mode);
    }
  });
});

describe("useMetricsStore — ingestLiveEvent (Sub-AC 6c)", () => {
  beforeEach(resetStore);

  it("increments liveEventCount on every event", () => {
    const { ingestLiveEvent } = useMetricsStore.getState();
    ingestLiveEvent(makeEvent("task.created"));
    expect(useMetricsStore.getState().liveEventCount).toBe(1);
    ingestLiveEvent(makeEvent("task.completed"));
    expect(useMetricsStore.getState().liveEventCount).toBe(2);
  });

  it("increments _pendingEventCount on every event", () => {
    const { ingestLiveEvent } = useMetricsStore.getState();
    ingestLiveEvent(makeEvent("agent.heartbeat"));
    ingestLiveEvent(makeEvent("agent.heartbeat"));
    ingestLiveEvent(makeEvent("agent.heartbeat"));
    expect(useMetricsStore.getState()._pendingEventCount).toBe(3);
  });

  it("increments _liveTaskQueueDepth on task.created", () => {
    const { ingestLiveEvent } = useMetricsStore.getState();
    ingestLiveEvent(makeEvent("task.created"));
    ingestLiveEvent(makeEvent("task.created"));
    expect(useMetricsStore.getState()._liveTaskQueueDepth).toBe(2);
  });

  it("decrements _liveTaskQueueDepth on task.completed", () => {
    useMetricsStore.setState({ _liveTaskQueueDepth: 3 });
    useMetricsStore.getState().ingestLiveEvent(makeEvent("task.completed"));
    expect(useMetricsStore.getState()._liveTaskQueueDepth).toBe(2);
  });

  it("decrements _liveTaskQueueDepth on task.failed", () => {
    useMetricsStore.setState({ _liveTaskQueueDepth: 2 });
    useMetricsStore.getState().ingestLiveEvent(makeEvent("task.failed"));
    expect(useMetricsStore.getState()._liveTaskQueueDepth).toBe(1);
  });

  it("decrements _liveTaskQueueDepth on task.cancelled", () => {
    useMetricsStore.setState({ _liveTaskQueueDepth: 1 });
    useMetricsStore.getState().ingestLiveEvent(makeEvent("task.cancelled"));
    expect(useMetricsStore.getState()._liveTaskQueueDepth).toBe(0);
  });

  it("clamps _liveTaskQueueDepth at 0 (no negative queue)", () => {
    useMetricsStore.setState({ _liveTaskQueueDepth: 0 });
    useMetricsStore.getState().ingestLiveEvent(makeEvent("task.completed"));
    expect(useMetricsStore.getState()._liveTaskQueueDepth).toBe(0);
  });

  it("handles unknown event types gracefully (no throw, counter still increments)", () => {
    const { ingestLiveEvent } = useMetricsStore.getState();
    expect(() => ingestLiveEvent(makeEvent("unknown.event.type"))).not.toThrow();
    expect(useMetricsStore.getState().liveEventCount).toBe(1);
  });
});

describe("useMetricsStore — tick integrates live data (Sub-AC 6c)", () => {
  beforeEach(() => {
    resetStore();
    // Switch to connected mode so live data is preferred over simulation
    useMetricsStore.getState().setConnectionStatus("connected");
  });

  afterEach(() => {
    useMetricsStore.getState().stopTicking();
  });

  it("resets _pendingEventCount to 0 after each tick", () => {
    const { ingestLiveEvent, tick } = useMetricsStore.getState();
    ingestLiveEvent(makeEvent("agent.heartbeat"));
    ingestLiveEvent(makeEvent("agent.heartbeat"));
    expect(useMetricsStore.getState()._pendingEventCount).toBe(2);

    tick();
    expect(useMetricsStore.getState()._pendingEventCount).toBe(0);
  });

  it("appends a sample to throughputHistory each tick", () => {
    const beforeLen = useMetricsStore.getState().throughputHistory.length;
    useMetricsStore.getState().tick();
    expect(useMetricsStore.getState().throughputHistory.length).toBe(beforeLen + 1);
  });

  it("appends a sample to taskQueueHistory each tick", () => {
    const beforeLen = useMetricsStore.getState().taskQueueHistory.length;
    useMetricsStore.getState().tick();
    expect(useMetricsStore.getState().taskQueueHistory.length).toBe(beforeLen + 1);
  });

  it("uses live task queue depth in taskQueueHistory when connected", () => {
    useMetricsStore.setState({ _liveTaskQueueDepth: 7 });
    useMetricsStore.getState().tick();
    const history = useMetricsStore.getState().taskQueueHistory;
    const last = history[history.length - 1]!;
    // Value should be the live depth (7), clamped to max 20
    expect(last.value).toBe(7);
  });

  it("uses live event count to drive throughput metric when connected", () => {
    // Inject 10 pending events before tick
    for (let i = 0; i < 10; i++) {
      useMetricsStore.getState().ingestLiveEvent(makeEvent("task.created"));
    }
    useMetricsStore.getState().tick();
    const history = useMetricsStore.getState().throughputHistory;
    const last = history[history.length - 1]!;
    // Live throughput = pendingCount * (1000/TICK_MS) * 10, must be > 0
    expect(last.value).toBeGreaterThan(0);
  });
});

// ── Sub-AC 6b: Latency tracking ────────────────────────────────────────────

describe("useMetricsStore — latency tracking (Sub-AC 6b)", () => {
  beforeEach(() => {
    resetStore();
    useMetricsStore.setState({
      _taskStartTimes:   new Map(),
      _liveLatencyAccum: 0,
      _liveLatencyCount: 0,
    });
  });

  afterEach(() => {
    useMetricsStore.getState().stopTicking();
  });

  it("latencyHistory is pre-filled on store creation (not empty)", () => {
    const { latencyHistory } = useMetricsStore.getState();
    expect(latencyHistory.length).toBeGreaterThan(0);
  });

  it("tick() appends a sample to latencyHistory", () => {
    const beforeLen = useMetricsStore.getState().latencyHistory.length;
    useMetricsStore.getState().tick();
    expect(useMetricsStore.getState().latencyHistory.length).toBe(beforeLen + 1);
  });

  it("snapshot.system.latencyMs is a positive number after init", () => {
    const { snapshot } = useMetricsStore.getState();
    expect(snapshot.system.latencyMs).toBeGreaterThan(0);
  });

  it("snapshot.system.latencyMs stays in [10, 5000] range after tick", () => {
    useMetricsStore.getState().tick();
    const { latencyMs } = useMetricsStore.getState().snapshot.system;
    expect(latencyMs).toBeGreaterThanOrEqual(10);
    expect(latencyMs).toBeLessThanOrEqual(5_000);
  });

  it("task.created stores start timestamp in _taskStartTimes", () => {
    const taskId = "task-abc-123";
    useMetricsStore.getState().ingestLiveEvent({
      type: "task.created",
      payload: {},
      task_id: taskId,
    });
    const startTimes = useMetricsStore.getState()._taskStartTimes;
    expect(startTimes.has(taskId)).toBe(true);
    expect(startTimes.get(taskId)).toBeGreaterThan(0);
  });

  it("task.completed measures latency and accumulates _liveLatencyAccum", () => {
    const taskId = "task-xyz-456";
    const syntheticStart = Date.now() - 300; // 300ms ago

    // Manually seed the start time for a deterministic latency
    useMetricsStore.getState()._taskStartTimes.set(taskId, syntheticStart);

    useMetricsStore.getState().ingestLiveEvent({
      type: "task.completed",
      payload: {},
      task_id: taskId,
    });

    const { _liveLatencyAccum, _liveLatencyCount } = useMetricsStore.getState();
    expect(_liveLatencyCount).toBe(1);
    // Latency should be approximately 300ms (±50ms tolerance for test execution time)
    expect(_liveLatencyAccum).toBeGreaterThanOrEqual(250);
    expect(_liveLatencyAccum).toBeLessThanOrEqual(500);
  });

  it("task.failed also measures latency and cleans up start time", () => {
    const taskId = "task-failed-789";
    const syntheticStart = Date.now() - 200;

    useMetricsStore.getState()._taskStartTimes.set(taskId, syntheticStart);

    useMetricsStore.getState().ingestLiveEvent({
      type: "task.failed",
      payload: {},
      task_id: taskId,
    });

    const { _liveLatencyCount } = useMetricsStore.getState();
    expect(_liveLatencyCount).toBe(1);
    // Entry should be deleted after measurement
    expect(useMetricsStore.getState()._taskStartTimes.has(taskId)).toBe(false);
  });

  it("task.completed without a matching task.created produces no latency measurement", () => {
    useMetricsStore.getState().ingestLiveEvent({
      type: "task.completed",
      payload: {},
      task_id: "unknown-task",
    });
    expect(useMetricsStore.getState()._liveLatencyCount).toBe(0);
    expect(useMetricsStore.getState()._liveLatencyAccum).toBe(0);
  });

  it("tick() uses live latency average when _liveLatencyCount > 0 and connected", () => {
    useMetricsStore.getState().setConnectionStatus("connected");

    // Manually set a deterministic latency state
    useMetricsStore.setState({
      _liveLatencyAccum: 600, // total 600ms
      _liveLatencyCount: 2,   // 2 completions → avg 300ms
    });

    useMetricsStore.getState().tick();
    const { latencyHistory } = useMetricsStore.getState();
    const last = latencyHistory[latencyHistory.length - 1]!;
    // Expected: avg = 600/2 = 300ms
    expect(last.value).toBe(300);
  });

  it("tick() resets _liveLatencyAccum and _liveLatencyCount to 0", () => {
    useMetricsStore.setState({
      _liveLatencyAccum: 1200,
      _liveLatencyCount: 3,
    });
    useMetricsStore.getState().tick();
    expect(useMetricsStore.getState()._liveLatencyAccum).toBe(0);
    expect(useMetricsStore.getState()._liveLatencyCount).toBe(0);
  });

  it("tick() falls back to Brownian simulation when disconnected (no live latency)", () => {
    useMetricsStore.getState().setConnectionStatus("disconnected");
    // Ensure no live latency data
    useMetricsStore.setState({ _liveLatencyAccum: 0, _liveLatencyCount: 0 });

    useMetricsStore.getState().tick();
    const { latencyHistory } = useMetricsStore.getState();
    const last = latencyHistory[latencyHistory.length - 1]!;
    // Brownian simulation stays in [50, 500] range
    expect(last.value).toBeGreaterThanOrEqual(10); // clamped min
    expect(last.value).toBeLessThanOrEqual(600);   // generous upper bound
  });

  it("multiple task completions within one tick contribute to running average", () => {
    useMetricsStore.getState().setConnectionStatus("connected");

    const ids = ["t1", "t2", "t3"];
    const latenciesMs = [100, 200, 300]; // avg = 200ms
    const now = Date.now();

    for (let i = 0; i < ids.length; i++) {
      useMetricsStore.getState()._taskStartTimes.set(ids[i]!, now - latenciesMs[i]!);
    }

    for (const id of ids) {
      useMetricsStore.getState().ingestLiveEvent({
        type: "task.completed",
        payload: {},
        task_id: id,
      });
    }

    expect(useMetricsStore.getState()._liveLatencyCount).toBe(3);
    // Total accum should be approx 600ms (100+200+300), with slight wall-clock drift
    expect(useMetricsStore.getState()._liveLatencyAccum).toBeGreaterThanOrEqual(500);
    expect(useMetricsStore.getState()._liveLatencyAccum).toBeLessThanOrEqual(750);
  });
});
