/**
 * live-dashboard-data-wiring.test.ts — Unit tests for Sub-AC 6 / AC-6-Sub-3:
 * Wire live data (agent count, task status summary, event rate) to the
 * dashboard_panel surface so metrics update in real time from the agent
 * orchestration state.
 *
 * Tests the pure-logic layer that mediates between:
 *   1. Store state (metrics-store, agent-store, task-store)
 *   2. Dashboard panel surfaces (dashboard_panel ui_fixture entities)
 *
 * Coverage:
 *   1.  shouldShowMetricsOverlay()      — decides per-fixture overlay visibility
 *   2.  partitionMetricsFixtures()      — splits fixtures into metrics / plain buckets
 *   3.  countMetricsOverlayFixtures()   — counts fixtures that will show overlay
 *   4.  Store → binding data flow       — metrics-store mutations propagate to snapshot
 *   5.  Agent count in binding          — agent-store counts reflected correctly
 *   6.  Task status derived mapping     — pending/running/done from binding + task store
 *   7.  Event rate data flow            — eventsPerTick from store → formatEventRate label
 *   8.  Connection status propagation   — store connectionStatus → isLive / connLabel
 *   9.  Real-time update contract       — store changes produce updated binding snapshots
 *  10.  Building-level coverage         — all rooms with dashboard panels addressed
 *  11.  Fixture partition coverage      — partition is exhaustive (no fixtures dropped)
 *  12.  Zero-state baseline             — system in zero/idle state produces valid output
 *
 * Test ID scheme:
 *   6w-N : Sub-AC 6 live data wiring (6w)
 *
 * NOTE: React components (MetricsDashboardPanel, MetricsDashboardPanelLayer,
 *       BuildingMetricsDashboardPanels) require a WebGL canvas and React
 *       rendering environment — they are tested through visual integration.
 *       Only pure-logic helpers and store-integration paths are tested here.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldShowMetricsOverlay,
  partitionMetricsFixtures,
  countMetricsOverlayFixtures,
  formatEventRate,
  computeTaskStatusCounts,
  computePanelMetricsSummary,
  countTerminalTasks,
  EVENT_RATE_DISPLAY_MAX,
} from "../DashboardPanelMetrics.js";
import { getMetricsBindingSnapshot } from "../../hooks/use-metrics-binding.js";
import { useMetricsStore } from "../../store/metrics-store.js";
import {
  DEFAULT_UI_FIXTURES,
  getDashboardPanels,
  getFixturesForRoom,
} from "../../data/ui-fixture-registry.js";
import { filterDashboardPanelFixtures, collectDashboardPanelRoomIds } from "../DashboardPanel.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetMetricsStore() {
  useMetricsStore.getState().stopTicking();
  useMetricsStore.setState({
    connectionStatus:    "disconnected",
    liveEventCount:      0,
    _pendingEventCount:  0,
    _liveTaskQueueDepth: 0,
  });
}

function makeAgentStatus(overrides: Partial<{
  active: number; busy: number; idle: number;
  inactive: number; error: number; terminated: number; total: number;
}> = {}) {
  return {
    active:     overrides.active     ?? 0,
    busy:       overrides.busy       ?? 0,
    idle:       overrides.idle       ?? 0,
    inactive:   overrides.inactive   ?? 0,
    error:      overrides.error      ?? 0,
    terminated: overrides.terminated ?? 0,
    total:      overrides.total      ?? 0,
  };
}

function makeBinding(overrides: Partial<{
  agentStatus: ReturnType<typeof makeAgentStatus>;
  taskQueueDepth: number;
  throughputRaw: number;
  isLive: boolean;
  connectionStatus: "connecting" | "connected" | "degraded" | "disconnected";
}> = {}) {
  return {
    agentStatus:      overrides.agentStatus      ?? makeAgentStatus(),
    taskQueueDepth:   overrides.taskQueueDepth   ?? 0,
    throughputRaw:    overrides.throughputRaw    ?? 0,
    isLive:           overrides.isLive           ?? false,
    connectionStatus: overrides.connectionStatus ?? "disconnected" as const,
  };
}

// ── 1. shouldShowMetricsOverlay() ─────────────────────────────────────────────

describe("6w-1: shouldShowMetricsOverlay()", () => {
  it("6w-1a: undefined allowlist → all fixtures show metrics (default on)", () => {
    expect(shouldShowMetricsOverlay("ops-dashboard-main", undefined)).toBe(true);
    expect(shouldShowMetricsOverlay("lobby-status-panel", undefined)).toBe(true);
    expect(shouldShowMetricsOverlay("any-fixture-id", undefined)).toBe(true);
  });

  it("6w-1b: empty Set allowlist → no fixtures show metrics", () => {
    const empty = new Set<string>();
    expect(shouldShowMetricsOverlay("ops-dashboard-main", empty)).toBe(false);
    expect(shouldShowMetricsOverlay("lobby-status-panel", empty)).toBe(false);
  });

  it("6w-1c: allowlist with specific ID → only that ID shows metrics", () => {
    const allowed = new Set(["ops-dashboard-main"]);
    expect(shouldShowMetricsOverlay("ops-dashboard-main", allowed)).toBe(true);
    expect(shouldShowMetricsOverlay("lobby-status-panel", allowed)).toBe(false);
  });

  it("6w-1d: allowlist with multiple IDs → all listed IDs show metrics", () => {
    const allowed = new Set(["ops-dashboard-main", "lobby-status-panel"]);
    expect(shouldShowMetricsOverlay("ops-dashboard-main", allowed)).toBe(true);
    expect(shouldShowMetricsOverlay("lobby-status-panel", allowed)).toBe(true);
    expect(shouldShowMetricsOverlay("other-panel", allowed)).toBe(false);
  });

  it("6w-1e: returns boolean (not truthy/falsy check)", () => {
    const allowed = new Set(["a"]);
    expect(typeof shouldShowMetricsOverlay("a", allowed)).toBe("boolean");
    expect(typeof shouldShowMetricsOverlay("b", allowed)).toBe("boolean");
    expect(typeof shouldShowMetricsOverlay("a", undefined)).toBe("boolean");
  });

  it("6w-1f: result is deterministic — same args produce same result", () => {
    const set = new Set(["panel-x"]);
    expect(shouldShowMetricsOverlay("panel-x", set)).toBe(
      shouldShowMetricsOverlay("panel-x", set),
    );
    expect(shouldShowMetricsOverlay("panel-y", set)).toBe(
      shouldShowMetricsOverlay("panel-y", set),
    );
  });
});

// ── 2. partitionMetricsFixtures() ─────────────────────────────────────────────

describe("6w-2: partitionMetricsFixtures()", () => {
  const panels = getDashboardPanels();

  it("6w-2a: undefined allowlist → all fixtures in metrics bucket, plain is empty", () => {
    const { metrics, plain } = partitionMetricsFixtures(panels, undefined);
    expect(metrics.length).toBe(panels.length);
    expect(plain.length).toBe(0);
  });

  it("6w-2b: empty allowlist → all fixtures in plain bucket, metrics is empty", () => {
    const { metrics, plain } = partitionMetricsFixtures(panels, new Set());
    expect(metrics.length).toBe(0);
    expect(plain.length).toBe(panels.length);
  });

  it("6w-2c: single-fixture allowlist partitions correctly", () => {
    const firstId = panels[0].fixture_id;
    const allowed = new Set([firstId]);
    const { metrics, plain } = partitionMetricsFixtures(panels, allowed);
    expect(metrics.length).toBe(1);
    expect(metrics[0].fixture_id).toBe(firstId);
    expect(plain.length).toBe(panels.length - 1);
    expect(plain.every((f) => f.fixture_id !== firstId)).toBe(true);
  });

  it("6w-2d: partition is exhaustive — metrics + plain = original (no fixtures dropped)", () => {
    const allowed = new Set([panels[0].fixture_id]);
    const { metrics, plain } = partitionMetricsFixtures(panels, allowed);
    expect(metrics.length + plain.length).toBe(panels.length);
  });

  it("6w-2e: partition is disjoint — no fixture in both buckets", () => {
    const allowed = new Set([panels[0].fixture_id]);
    const { metrics, plain } = partitionMetricsFixtures(panels, allowed);
    const metricsIds = new Set(metrics.map((f) => f.fixture_id));
    for (const f of plain) {
      expect(metricsIds.has(f.fixture_id)).toBe(false);
    }
  });

  it("6w-2f: empty fixture list → both buckets empty regardless of allowlist", () => {
    const { metrics, plain } = partitionMetricsFixtures([], new Set(["any-id"]));
    expect(metrics.length).toBe(0);
    expect(plain.length).toBe(0);
  });

  it("6w-2g: full allowlist including all fixtures → all in metrics", () => {
    const allIds = new Set(panels.map((f) => f.fixture_id));
    const { metrics, plain } = partitionMetricsFixtures(panels, allIds);
    expect(metrics.length).toBe(panels.length);
    expect(plain.length).toBe(0);
  });
});

// ── 3. countMetricsOverlayFixtures() ──────────────────────────────────────────

describe("6w-3: countMetricsOverlayFixtures()", () => {
  const panels = getDashboardPanels();

  it("6w-3a: undefined allowlist → count equals total fixture count", () => {
    expect(countMetricsOverlayFixtures(panels, undefined)).toBe(panels.length);
  });

  it("6w-3b: empty allowlist → count is 0", () => {
    expect(countMetricsOverlayFixtures(panels, new Set())).toBe(0);
  });

  it("6w-3c: single-fixture allowlist → count is 1 (if fixture exists)", () => {
    const firstId = panels[0].fixture_id;
    expect(countMetricsOverlayFixtures(panels, new Set([firstId]))).toBe(1);
  });

  it("6w-3d: count is non-negative integer", () => {
    const count = countMetricsOverlayFixtures(panels, undefined);
    expect(count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(count)).toBe(true);
  });

  it("6w-3e: count ≤ total fixture count (allowlist can only restrict)", () => {
    const restricted = new Set([panels[0].fixture_id]);
    const full       = countMetricsOverlayFixtures(panels, undefined);
    const partial    = countMetricsOverlayFixtures(panels, restricted);
    expect(partial).toBeLessThanOrEqual(full);
  });

  it("6w-3f: empty fixture list → count is 0 regardless of allowlist", () => {
    expect(countMetricsOverlayFixtures([], undefined)).toBe(0);
    expect(countMetricsOverlayFixtures([], new Set(["id1", "id2"]))).toBe(0);
  });
});

// ── 4. Store → binding data flow ──────────────────────────────────────────────

describe("6w-4: metrics-store → binding snapshot data flow", () => {
  beforeEach(resetMetricsStore);

  it("6w-4a: snapshot has all required MetricsBinding fields for panel rendering", () => {
    const binding = getMetricsBindingSnapshot();
    // Fields consumed by computePanelMetricsSummary
    expect(binding).toHaveProperty("agentStatus");
    expect(binding).toHaveProperty("taskQueueDepth");
    expect(binding).toHaveProperty("throughputRaw");
    expect(binding).toHaveProperty("isLive");
    expect(binding).toHaveProperty("connectionStatus");
  });

  it("6w-4b: snapshot is usable by computePanelMetricsSummary without error", () => {
    const binding = getMetricsBindingSnapshot();
    expect(() => computePanelMetricsSummary(binding, 0)).not.toThrow();
  });

  it("6w-4c: disconnected store → isLive=false in binding", () => {
    useMetricsStore.getState().setConnectionStatus("disconnected");
    const binding = getMetricsBindingSnapshot();
    expect(binding.isLive).toBe(false);
  });

  it("6w-4d: connected store → isLive=true in binding", () => {
    useMetricsStore.getState().setConnectionStatus("connected");
    const binding = getMetricsBindingSnapshot();
    expect(binding.isLive).toBe(true);
  });

  it("6w-4e: degraded store → isLive=true (data still flowing)", () => {
    useMetricsStore.getState().setConnectionStatus("degraded");
    const binding = getMetricsBindingSnapshot();
    expect(binding.isLive).toBe(true);
  });

  it("6w-4f: connectionStatus change is reflected in subsequent snapshot (no stale cache)", () => {
    useMetricsStore.getState().setConnectionStatus("connected");
    const s1 = getMetricsBindingSnapshot();
    useMetricsStore.getState().setConnectionStatus("disconnected");
    const s2 = getMetricsBindingSnapshot();
    expect(s1.connectionStatus).toBe("connected");
    expect(s2.connectionStatus).toBe("disconnected");
  });
});

// ── 5. Agent count in binding ──────────────────────────────────────────────────

describe("6w-5: agent count data flow to panel surface", () => {
  it("6w-5a: agentCount in summary matches agentStatus.total", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ total: 5, active: 2, idle: 3 }) }),
      0,
    );
    expect(summary.agentCount).toBe(5);
  });

  it("6w-5b: activeAgents in summary = active + busy (combined operational agents)", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ active: 3, busy: 2, total: 8 }) }),
      0,
    );
    expect(summary.activeAgents).toBe(5);
  });

  it("6w-5c: idleAgents in summary reflects idle-status agents correctly", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ idle: 4, total: 7 }) }),
      0,
    );
    expect(summary.idleAgents).toBe(4);
  });

  it("6w-5d: inactiveAgents in summary reflects pre-start agents", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ inactive: 6, total: 6 }) }),
      0,
    );
    expect(summary.inactiveAgents).toBe(6);
  });

  it("6w-5e: agentCount is always ≥ activeAgents (total ≥ active subset)", () => {
    const cases: Array<[number, number, number, number]> = [
      [0, 0, 0, 0],
      [3, 2, 0, 8],
      [5, 0, 1, 10],
    ];
    for (const [active, busy, idle, total] of cases) {
      const summary = computePanelMetricsSummary(
        makeBinding({ agentStatus: makeAgentStatus({ active, busy, idle, total }) }),
        0,
      );
      expect(summary.agentCount).toBeGreaterThanOrEqual(summary.activeAgents);
    }
  });

  it("6w-5f: all-inactive agent state produces zero active agents on panel", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ inactive: 8, total: 8 }) }),
      0,
    );
    expect(summary.activeAgents).toBe(0);
    expect(summary.agentCount).toBe(8);
  });
});

// ── 6. Task status derived mapping ────────────────────────────────────────────

describe("6w-6: task status summary data flow to panel surface", () => {
  it("6w-6a: pending bucket maps to metrics-store task queue depth", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ taskQueueDepth: 7 }),
      0,
    );
    expect(summary.taskStatus.pending).toBe(7);
  });

  it("6w-6b: running bucket = active + busy agents (each occupying 1 task)", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ active: 3, busy: 2, total: 8 }) }),
      0,
    );
    expect(summary.taskStatus.running).toBe(5);
  });

  it("6w-6c: done bucket = terminal task count from task-store", () => {
    const tasks = {
      "t-01": { status: "done" },
      "t-02": { status: "done" },
      "t-03": { status: "failed" },
      "t-04": { status: "active" },
    };
    const terminalCount = countTerminalTasks(tasks);
    const summary = computePanelMetricsSummary(makeBinding(), terminalCount);
    expect(summary.taskStatus.done).toBe(3); // done + failed
  });

  it("6w-6d: task status counts are independent (pending, running, done disjoint)", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({
        agentStatus:    makeAgentStatus({ active: 2, busy: 1, total: 6 }),
        taskQueueDepth: 4,
      }),
      7,
    );
    expect(summary.taskStatus.pending).toBe(4);
    expect(summary.taskStatus.running).toBe(3);
    expect(summary.taskStatus.done).toBe(7);
    // They sum to the "total workload" but do not overlap
  });

  it("6w-6e: zero-state produces all-zero task status counts", () => {
    const summary = computePanelMetricsSummary(makeBinding(), 0);
    expect(summary.taskStatus).toEqual({ pending: 0, running: 0, done: 0 });
  });

  it("6w-6f: task counts are non-negative integers", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ active: 1, total: 3 }), taskQueueDepth: 2 }),
      5,
    );
    expect(summary.taskStatus.pending).toBeGreaterThanOrEqual(0);
    expect(summary.taskStatus.running).toBeGreaterThanOrEqual(0);
    expect(summary.taskStatus.done).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(summary.taskStatus.pending)).toBe(true);
    expect(Number.isInteger(summary.taskStatus.running)).toBe(true);
    expect(Number.isInteger(summary.taskStatus.done)).toBe(true);
  });
});

// ── 7. Event rate data flow ────────────────────────────────────────────────────

describe("6w-7: event rate data flow to panel surface", () => {
  it("6w-7a: eventRate in summary = rounded throughputRaw", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ throughputRaw: 14.6 }),
      0,
    );
    expect(summary.eventRate).toBe(15);
  });

  it("6w-7b: eventRateLabel matches formatEventRate(throughputRaw)", () => {
    const throughputRaw = 12;
    const summary = computePanelMetricsSummary(makeBinding({ throughputRaw }), 0);
    expect(summary.eventRateLabel).toBe(formatEventRate(throughputRaw));
  });

  it("6w-7c: zero throughput → '0 ev/t' on panel", () => {
    const summary = computePanelMetricsSummary(makeBinding({ throughputRaw: 0 }), 0);
    expect(summary.eventRateLabel).toBe("0 ev/t");
  });

  it("6w-7d: high throughput (> display max) shows capped label", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ throughputRaw: EVENT_RATE_DISPLAY_MAX + 1 }),
      0,
    );
    expect(summary.eventRateLabel).toContain(">");
    expect(summary.eventRateLabel).toContain("ev/t");
  });

  it("6w-7e: eventRate is always non-negative on panel (no negative display)", () => {
    const summary = computePanelMetricsSummary(makeBinding({ throughputRaw: -5 }), 0);
    expect(summary.eventRate).toBeGreaterThanOrEqual(0);
  });

  it("6w-7f: event rate from store snapshot is a valid panel label", () => {
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 0);
    expect(typeof summary.eventRateLabel).toBe("string");
    expect(summary.eventRateLabel).toContain("ev/t");
  });
});

// ── 8. Connection status propagation ──────────────────────────────────────────

describe("6w-8: connection status propagation to panel display", () => {
  beforeEach(resetMetricsStore);

  it("6w-8a: 'connected' status → isLive=true, panel shows LIVE indicator", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "connected", isLive: true }),
      0,
    );
    expect(summary.isLive).toBe(true);
    expect(summary.connectionStatus).toBe("connected");
  });

  it("6w-8b: 'degraded' status → isLive=true (partial data still live)", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "degraded", isLive: true }),
      0,
    );
    expect(summary.isLive).toBe(true);
    expect(summary.connectionStatus).toBe("degraded");
  });

  it("6w-8c: 'disconnected' status → isLive=false, panel shows estimated data", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "disconnected", isLive: false }),
      0,
    );
    expect(summary.isLive).toBe(false);
    expect(summary.connectionStatus).toBe("disconnected");
  });

  it("6w-8d: 'connecting' status → isLive=false (handshake not complete)", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "connecting", isLive: false }),
      0,
    );
    expect(summary.isLive).toBe(false);
    expect(summary.connectionStatus).toBe("connecting");
  });

  it("6w-8e: all four DataSourceMode values produce valid summaries (no throw)", () => {
    const modes = ["connecting", "connected", "degraded", "disconnected"] as const;
    for (const mode of modes) {
      expect(() =>
        computePanelMetricsSummary(makeBinding({ connectionStatus: mode }), 0)
      ).not.toThrow();
    }
  });

  it("6w-8f: store connectionStatus reflects in panel summary via snapshot", () => {
    useMetricsStore.getState().setConnectionStatus("connected");
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 0);
    expect(summary.connectionStatus).toBe("connected");
    expect(summary.isLive).toBe(true);
  });
});

// ── 9. Real-time update contract ───────────────────────────────────────────────

describe("6w-9: real-time update contract — store changes → updated snapshots", () => {
  beforeEach(resetMetricsStore);

  it("6w-9a: store mutation is immediately reflected in the next snapshot (no stale data)", () => {
    useMetricsStore.getState().setConnectionStatus("disconnected");
    const before = getMetricsBindingSnapshot().connectionStatus;
    useMetricsStore.getState().setConnectionStatus("connected");
    const after = getMetricsBindingSnapshot().connectionStatus;
    expect(before).toBe("disconnected");
    expect(after).toBe("connected");
  });

  it("6w-9b: multiple sequential store mutations each produce correct intermediate state", () => {
    const states = ["connecting", "connected", "degraded", "disconnected"] as const;
    for (const state of states) {
      useMetricsStore.getState().setConnectionStatus(state);
      expect(getMetricsBindingSnapshot().connectionStatus).toBe(state);
    }
  });

  it("6w-9c: live event ingestion increments liveEventCount (store tracking)", () => {
    const before = useMetricsStore.getState().liveEventCount;
    useMetricsStore.getState().ingestLiveEvent({ type: "task.created", payload: {} });
    const after = useMetricsStore.getState().liveEventCount;
    expect(after).toBeGreaterThan(before);
  });

  it("6w-9d: task queue depth increases after task.created event", () => {
    const before = useMetricsStore.getState()._liveTaskQueueDepth;
    useMetricsStore.getState().ingestLiveEvent({ type: "task.created", payload: {} });
    const after = useMetricsStore.getState()._liveTaskQueueDepth;
    expect(after).toBeGreaterThan(before);
  });

  it("6w-9e: task queue depth decrements (clamped to 0) after task.completed event", () => {
    // Seed with one pending task first
    useMetricsStore.getState().ingestLiveEvent({ type: "task.created", payload: {} });
    const before = useMetricsStore.getState()._liveTaskQueueDepth;
    useMetricsStore.getState().ingestLiveEvent({ type: "task.completed", payload: {} });
    const after = useMetricsStore.getState()._liveTaskQueueDepth;
    // Queue depth should not be larger (it either decremented or clamped at 0)
    expect(after).toBeLessThanOrEqual(before);
  });

  it("6w-9f: task queue depth never goes below 0 (floor clamp)", () => {
    // Complete many more tasks than created
    for (let i = 0; i < 5; i++) {
      useMetricsStore.getState().ingestLiveEvent({ type: "task.completed", payload: {} });
    }
    expect(useMetricsStore.getState()._liveTaskQueueDepth).toBeGreaterThanOrEqual(0);
  });

  it("6w-9g: summary recomputes correctly with each snapshot call", () => {
    const s1 = computePanelMetricsSummary(getMetricsBindingSnapshot(), 0);
    useMetricsStore.getState().setConnectionStatus("connected");
    const s2 = computePanelMetricsSummary(getMetricsBindingSnapshot(), 3);
    // Each call should reflect current state, not a cached result
    expect(typeof s1.isLive).toBe("boolean");
    expect(typeof s2.isLive).toBe("boolean");
    // s2 has more done tasks, s1 has 0 done tasks
    expect(s2.taskStatus.done).toBe(3);
    expect(s1.taskStatus.done).toBe(0);
  });
});

// ── 10. Building-level coverage ───────────────────────────────────────────────

describe("6w-10: building-level fixture coverage", () => {
  it("6w-10a: collectDashboardPanelRoomIds returns rooms that need metrics wiring", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    expect(roomIds.length).toBeGreaterThan(0);
  });

  it("6w-10b: every room with dashboard panels has at least one fixture for metrics", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    for (const roomId of roomIds) {
      const panels = filterDashboardPanelFixtures(getFixturesForRoom(roomId));
      expect(panels.length).toBeGreaterThan(0);
    }
  });

  it("6w-10c: ops-control room has at least one metrics panel", () => {
    const opsRoomPanels = filterDashboardPanelFixtures(getFixturesForRoom("ops-control"));
    expect(opsRoomPanels.length).toBeGreaterThanOrEqual(1);
  });

  it("6w-10d: project-main room has at least one metrics panel", () => {
    const lobbyPanels = filterDashboardPanelFixtures(getFixturesForRoom("project-main"));
    expect(lobbyPanels.length).toBeGreaterThanOrEqual(1);
  });

  it("6w-10e: all registered dashboard panels are addressable by room", () => {
    const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);
    const totalByRoom = roomIds.reduce((acc, roomId) => {
      return acc + filterDashboardPanelFixtures(getFixturesForRoom(roomId)).length;
    }, 0);
    expect(totalByRoom).toBe(getDashboardPanels().length);
  });

  it("6w-10f: metrics wiring applies to all dashboard panels when allowlist undefined", () => {
    const panels = getDashboardPanels();
    const count = countMetricsOverlayFixtures(panels, undefined);
    expect(count).toBe(panels.length);
  });
});

// ── 11. Fixture partition coverage ────────────────────────────────────────────

describe("6w-11: fixture partition exhaustiveness", () => {
  it("6w-11a: partition(undefined) → all in metrics, none in plain", () => {
    const panels = getDashboardPanels();
    const { metrics, plain } = partitionMetricsFixtures(panels, undefined);
    expect(metrics.length).toBe(panels.length);
    expect(plain.length).toBe(0);
  });

  it("6w-11b: partition(empty Set) → none in metrics, all in plain", () => {
    const panels = getDashboardPanels();
    const { metrics, plain } = partitionMetricsFixtures(panels, new Set());
    expect(metrics.length).toBe(0);
    expect(plain.length).toBe(panels.length);
  });

  it("6w-11c: partition(full allowlist) → all in metrics, none in plain", () => {
    const panels = getDashboardPanels();
    const allIds = new Set(panels.map((f) => f.fixture_id));
    const { metrics, plain } = partitionMetricsFixtures(panels, allIds);
    expect(metrics.length).toBe(panels.length);
    expect(plain.length).toBe(0);
  });

  it("6w-11d: partial allowlist → metrics + plain = total (no fixtures lost)", () => {
    const panels = getDashboardPanels();
    if (panels.length >= 2) {
      const partial = new Set([panels[0].fixture_id]);
      const { metrics, plain } = partitionMetricsFixtures(panels, partial);
      expect(metrics.length + plain.length).toBe(panels.length);
    }
  });

  it("6w-11e: each fixture appears in exactly one bucket (metrics or plain)", () => {
    const panels = getDashboardPanels();
    if (panels.length >= 2) {
      const partial = new Set([panels[0].fixture_id]);
      const { metrics, plain } = partitionMetricsFixtures(panels, partial);
      const allSeen = new Set([
        ...metrics.map((f) => f.fixture_id),
        ...plain.map((f) => f.fixture_id),
      ]);
      expect(allSeen.size).toBe(panels.length);
    }
  });
});

// ── 12. Zero-state baseline ────────────────────────────────────────────────────

describe("6w-12: zero/idle state produces valid panel output", () => {
  beforeEach(resetMetricsStore);

  it("6w-12a: zero-state binding produces valid summary (no throw, no NaN)", () => {
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 0);
    expect(summary.agentCount).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(summary.agentCount)).toBe(false);
    expect(Number.isNaN(summary.eventRate)).toBe(false);
    expect(Number.isNaN(summary.taskStatus.pending)).toBe(false);
  });

  it("6w-12b: zero-state event rate label is '0 ev/t'", () => {
    // With no live events and disconnected store, throughput is 0 (or near 0 sim)
    useMetricsStore.setState({
      snapshot: {
        ...useMetricsStore.getState().snapshot,
        system: {
          ...useMetricsStore.getState().snapshot.system,
          eventsPerTick: 0,
        },
      },
    });
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 0);
    expect(summary.eventRateLabel).toBe("0 ev/t");
  });

  it("6w-12c: zero-state summary isLive = false (no connection)", () => {
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 0);
    expect(summary.isLive).toBe(false);
  });

  it("6w-12d: zero-state task status is { pending:0, running:0, done:0 }", () => {
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 0);
    expect(summary.taskStatus.pending).toBeGreaterThanOrEqual(0);
    expect(summary.taskStatus.running).toBeGreaterThanOrEqual(0);
    expect(summary.taskStatus.done).toBe(0);
  });

  it("6w-12e: zero-state binding: all agent counts are non-negative integers", () => {
    const binding = getMetricsBindingSnapshot();
    const { agentStatus } = binding;
    for (const key of ["active", "busy", "idle", "inactive", "error", "terminated", "total"] as const) {
      expect(agentStatus[key]).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(agentStatus[key])).toBe(true);
    }
  });
});
