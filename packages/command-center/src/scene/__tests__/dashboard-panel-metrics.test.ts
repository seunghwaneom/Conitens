/**
 * dashboard-panel-metrics.test.ts — Unit tests for Sub-AC 6b:
 * Wire live metrics data to the dashboard panel surface.
 *
 * Tests the pure-logic functions extracted from DashboardPanelMetrics.tsx:
 *
 *   1.  formatEventRate()             — formats events/tick into a display label
 *   2.  computeTaskStatusCounts()     — derives pending/running/done from stores
 *   3.  computePanelMetricsSummary()  — assembles complete panel summary
 *   4.  countTerminalTasks()          — counts terminal-state tasks from map
 *   5.  Constants                     — PANEL_METRICS_DIST_FACTOR, EVENT_RATE_DISPLAY_MAX
 *   6.  Integration: summary from metrics binding
 *   7.  Agent count display properties
 *   8.  Event rate edge cases
 *   9.  Task status derived mapping
 *  10.  Connection status mapping
 *
 * NOTE: React components (PanelMetricsOverlay, MetricsDashboardPanel) require
 * a WebGL canvas and React rendering environment — they are tested through
 * visual integration.  Only pure-logic helpers are tested here.
 *
 * Test ID scheme:
 *   6b-pm-N : Sub-AC 6b panel metrics
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  // Pure-logic functions
  formatEventRate,
  computeTaskStatusCounts,
  computePanelMetricsSummary,
  countTerminalTasks,
  // Constants
  PANEL_METRICS_DIST_FACTOR,
  EVENT_RATE_DISPLAY_MAX,
  // Types
  type PanelTaskStatusCounts,
  type PanelMetricsSummary,
} from "../DashboardPanelMetrics.js";
import { useMetricsStore } from "../../store/metrics-store.js";
import { getMetricsBindingSnapshot } from "../../hooks/use-metrics-binding.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAgentStatus(overrides: Partial<{
  active: number;
  busy: number;
  idle: number;
  inactive: number;
  error: number;
  terminated: number;
  total: number;
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

function resetMetricsStore() {
  useMetricsStore.getState().stopTicking();
  useMetricsStore.setState({
    connectionStatus:    "disconnected",
    liveEventCount:      0,
    _pendingEventCount:  0,
    _liveTaskQueueDepth: 0,
  });
}

// ── 1. formatEventRate() ───────────────────────────────────────────────────────

describe("6b-pm-1: formatEventRate()", () => {
  it("6b-pm-1a: 0 events → '0 ev/t'", () => {
    expect(formatEventRate(0)).toBe("0 ev/t");
  });

  it("6b-pm-1b: 12 events → '12 ev/t'", () => {
    expect(formatEventRate(12)).toBe("12 ev/t");
  });

  it("6b-pm-1c: 1 event → '1 ev/t'", () => {
    expect(formatEventRate(1)).toBe("1 ev/t");
  });

  it("6b-pm-1d: 99 events (at display max) → '99 ev/t'", () => {
    expect(formatEventRate(EVENT_RATE_DISPLAY_MAX)).toBe(`${EVENT_RATE_DISPLAY_MAX} ev/t`);
  });

  it("6b-pm-1e: 100 events (above display max) → '>99 ev/t'", () => {
    expect(formatEventRate(100)).toBe(`>${EVENT_RATE_DISPLAY_MAX} ev/t`);
  });

  it("6b-pm-1f: very large value → '>99 ev/t'", () => {
    expect(formatEventRate(9999)).toBe(`>${EVENT_RATE_DISPLAY_MAX} ev/t`);
  });

  it("6b-pm-1g: negative values are clamped to 0", () => {
    expect(formatEventRate(-5)).toBe("0 ev/t");
  });

  it("6b-pm-1h: fractional values are rounded", () => {
    expect(formatEventRate(12.6)).toBe("13 ev/t");
    expect(formatEventRate(12.4)).toBe("12 ev/t");
  });

  it("6b-pm-1i: result is always a non-empty string", () => {
    for (const v of [0, 1, 10, 50, 99, 100, 999, -1]) {
      const label = formatEventRate(v);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("6b-pm-1j: output always contains 'ev/t' suffix", () => {
    for (const v of [0, 5, 99, 100]) {
      expect(formatEventRate(v)).toContain("ev/t");
    }
  });
});

// ── 2. computeTaskStatusCounts() ──────────────────────────────────────────────

describe("6b-pm-2: computeTaskStatusCounts()", () => {
  it("6b-pm-2a: all zeros → pending=0, running=0, done=0", () => {
    const result = computeTaskStatusCounts(makeAgentStatus(), 0, 0);
    expect(result).toEqual<PanelTaskStatusCounts>({ pending: 0, running: 0, done: 0 });
  });

  it("6b-pm-2b: taskQueue > 0 → pending = taskQueue", () => {
    const result = computeTaskStatusCounts(makeAgentStatus(), 7, 0);
    expect(result.pending).toBe(7);
  });

  it("6b-pm-2c: active + busy agents → running count", () => {
    const result = computeTaskStatusCounts(
      makeAgentStatus({ active: 3, busy: 2 }),
      0, 0,
    );
    expect(result.running).toBe(5);
  });

  it("6b-pm-2d: only active agents contributes to running", () => {
    const result = computeTaskStatusCounts(makeAgentStatus({ active: 4 }), 0, 0);
    expect(result.running).toBe(4);
  });

  it("6b-pm-2e: only busy agents contributes to running", () => {
    const result = computeTaskStatusCounts(makeAgentStatus({ busy: 2 }), 0, 0);
    expect(result.running).toBe(2);
  });

  it("6b-pm-2f: idle agents do NOT count as running", () => {
    const result = computeTaskStatusCounts(makeAgentStatus({ idle: 5 }), 0, 0);
    expect(result.running).toBe(0);
  });

  it("6b-pm-2g: doneCount is reflected in done bucket", () => {
    const result = computeTaskStatusCounts(makeAgentStatus(), 0, 12);
    expect(result.done).toBe(12);
  });

  it("6b-pm-2h: negative taskQueue is clamped to 0", () => {
    const result = computeTaskStatusCounts(makeAgentStatus(), -5, 0);
    expect(result.pending).toBe(0);
  });

  it("6b-pm-2i: negative doneCount is clamped to 0", () => {
    const result = computeTaskStatusCounts(makeAgentStatus(), 0, -3);
    expect(result.done).toBe(0);
  });

  it("6b-pm-2j: fractional taskQueue is rounded to integer", () => {
    const result = computeTaskStatusCounts(makeAgentStatus(), 3.7, 0);
    expect(Number.isInteger(result.pending)).toBe(true);
    expect(result.pending).toBe(4);
  });

  it("6b-pm-2k: all counts combined", () => {
    const result = computeTaskStatusCounts(
      makeAgentStatus({ active: 2, busy: 1, idle: 3 }),
      5, 8,
    );
    expect(result).toEqual<PanelTaskStatusCounts>({ pending: 5, running: 3, done: 8 });
  });
});

// ── 3. computePanelMetricsSummary() ──────────────────────────────────────────

describe("6b-pm-3: computePanelMetricsSummary()", () => {
  it("6b-pm-3a: returns object with all required fields", () => {
    const summary = computePanelMetricsSummary(makeBinding(), 0);
    expect(summary).toHaveProperty("agentCount");
    expect(summary).toHaveProperty("activeAgents");
    expect(summary).toHaveProperty("idleAgents");
    expect(summary).toHaveProperty("inactiveAgents");
    expect(summary).toHaveProperty("taskStatus");
    expect(summary).toHaveProperty("eventRate");
    expect(summary).toHaveProperty("eventRateLabel");
    expect(summary).toHaveProperty("isLive");
    expect(summary).toHaveProperty("connectionStatus");
  });

  it("6b-pm-3b: taskStatus has pending, running, done", () => {
    const summary = computePanelMetricsSummary(makeBinding(), 0);
    expect(summary.taskStatus).toHaveProperty("pending");
    expect(summary.taskStatus).toHaveProperty("running");
    expect(summary.taskStatus).toHaveProperty("done");
  });

  it("6b-pm-3c: agentCount = binding.agentStatus.total", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ total: 8 }) }),
      0,
    );
    expect(summary.agentCount).toBe(8);
  });

  it("6b-pm-3d: activeAgents = active + busy", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ active: 3, busy: 2, total: 7 }) }),
      0,
    );
    expect(summary.activeAgents).toBe(5);
  });

  it("6b-pm-3e: idleAgents = binding.agentStatus.idle", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ idle: 4, total: 6 }) }),
      0,
    );
    expect(summary.idleAgents).toBe(4);
  });

  it("6b-pm-3f: inactiveAgents = binding.agentStatus.inactive", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ inactive: 2, total: 6 }) }),
      0,
    );
    expect(summary.inactiveAgents).toBe(2);
  });

  it("6b-pm-3g: eventRate is rounded throughputRaw", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ throughputRaw: 14.7 }),
      0,
    );
    expect(summary.eventRate).toBe(15);
  });

  it("6b-pm-3h: eventRateLabel matches formatEventRate(throughputRaw)", () => {
    const throughputRaw = 18;
    const summary = computePanelMetricsSummary(makeBinding({ throughputRaw }), 0);
    expect(summary.eventRateLabel).toBe(formatEventRate(throughputRaw));
  });

  it("6b-pm-3i: isLive passes through from binding", () => {
    const summaryLive = computePanelMetricsSummary(makeBinding({ isLive: true }), 0);
    const summaryEst  = computePanelMetricsSummary(makeBinding({ isLive: false }), 0);
    expect(summaryLive.isLive).toBe(true);
    expect(summaryEst.isLive).toBe(false);
  });

  it("6b-pm-3j: connectionStatus passes through from binding", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "connected" }),
      0,
    );
    expect(summary.connectionStatus).toBe("connected");
  });

  it("6b-pm-3k: done count comes from terminalTasks parameter", () => {
    const summary = computePanelMetricsSummary(makeBinding(), 17);
    expect(summary.taskStatus.done).toBe(17);
  });

  it("6b-pm-3l: pending maps to taskQueueDepth", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ taskQueueDepth: 9 }),
      0,
    );
    expect(summary.taskStatus.pending).toBe(9);
  });

  it("6b-pm-3m: running maps to active + busy agents", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ active: 2, busy: 3, total: 8 }) }),
      0,
    );
    expect(summary.taskStatus.running).toBe(5);
  });

  it("6b-pm-3n: all-zero baseline produces valid summary", () => {
    const summary = computePanelMetricsSummary(makeBinding(), 0);
    expect(summary.agentCount).toBe(0);
    expect(summary.activeAgents).toBe(0);
    expect(summary.idleAgents).toBe(0);
    expect(summary.taskStatus).toEqual({ pending: 0, running: 0, done: 0 });
    expect(summary.eventRate).toBe(0);
    expect(summary.eventRateLabel).toBe("0 ev/t");
  });
});

// ── 4. countTerminalTasks() ────────────────────────────────────────────────────

describe("6b-pm-4: countTerminalTasks()", () => {
  it("6b-pm-4a: empty tasks → 0", () => {
    expect(countTerminalTasks({})).toBe(0);
  });

  it("6b-pm-4b: 'done' tasks are counted", () => {
    const tasks = { t1: { status: "done" }, t2: { status: "done" } };
    expect(countTerminalTasks(tasks)).toBe(2);
  });

  it("6b-pm-4c: 'failed' tasks are counted", () => {
    const tasks = { t1: { status: "failed" } };
    expect(countTerminalTasks(tasks)).toBe(1);
  });

  it("6b-pm-4d: 'cancelled' tasks are counted", () => {
    const tasks = { t1: { status: "cancelled" } };
    expect(countTerminalTasks(tasks)).toBe(1);
  });

  it("6b-pm-4e: mix of done/failed/cancelled all counted", () => {
    const tasks = {
      t1: { status: "done" },
      t2: { status: "failed" },
      t3: { status: "cancelled" },
      t4: { status: "active" },
      t5: { status: "assigned" },
    };
    expect(countTerminalTasks(tasks)).toBe(3);
  });

  it("6b-pm-4f: non-terminal statuses (active, assigned, draft, planned, blocked, review) are NOT counted", () => {
    const tasks = {
      t1: { status: "active" },
      t2: { status: "assigned" },
      t3: { status: "draft" },
      t4: { status: "planned" },
      t5: { status: "blocked" },
      t6: { status: "review" },
    };
    expect(countTerminalTasks(tasks)).toBe(0);
  });

  it("6b-pm-4g: returns a non-negative integer", () => {
    const counts = [
      countTerminalTasks({}),
      countTerminalTasks({ a: { status: "done" } }),
      countTerminalTasks({ a: { status: "active" }, b: { status: "cancelled" } }),
    ];
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(c)).toBe(true);
    }
  });

  it("6b-pm-4h: large task map — counts only terminal entries", () => {
    const tasks: Record<string, { status: string }> = {};
    for (let i = 0; i < 50; i++) {
      tasks[`task-${i}`] = { status: i < 20 ? "done" : "active" };
    }
    expect(countTerminalTasks(tasks)).toBe(20);
  });
});

// ── 5. Constants ───────────────────────────────────────────────────────────────

describe("6b-pm-5: constants", () => {
  it("6b-pm-5a: PANEL_METRICS_DIST_FACTOR is a positive number", () => {
    expect(PANEL_METRICS_DIST_FACTOR).toBeGreaterThan(0);
  });

  it("6b-pm-5b: EVENT_RATE_DISPLAY_MAX is a positive integer", () => {
    expect(EVENT_RATE_DISPLAY_MAX).toBeGreaterThan(0);
    expect(Number.isInteger(EVENT_RATE_DISPLAY_MAX)).toBe(true);
  });

  it("6b-pm-5c: EVENT_RATE_DISPLAY_MAX = 99 (documented contract)", () => {
    expect(EVENT_RATE_DISPLAY_MAX).toBe(99);
  });

  it("6b-pm-5d: PANEL_METRICS_DIST_FACTOR = 14 (documented contract)", () => {
    expect(PANEL_METRICS_DIST_FACTOR).toBe(14);
  });
});

// ── 6. Integration: summary from metrics binding snapshot ─────────────────────

describe("6b-pm-6: integration with getMetricsBindingSnapshot()", () => {
  beforeEach(resetMetricsStore);

  it("6b-pm-6a: computePanelMetricsSummary accepts getMetricsBindingSnapshot() directly", () => {
    const binding = getMetricsBindingSnapshot();
    // Should not throw
    expect(() => computePanelMetricsSummary(binding, 0)).not.toThrow();
  });

  it("6b-pm-6b: summary from live snapshot has all required fields", () => {
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 5);
    expect(summary.agentCount).toBeGreaterThanOrEqual(0);
    expect(summary.eventRate).toBeGreaterThanOrEqual(0);
    expect(typeof summary.eventRateLabel).toBe("string");
    expect(typeof summary.isLive).toBe("boolean");
  });

  it("6b-pm-6c: connectionStatus matches store when disconnected", () => {
    useMetricsStore.getState().setConnectionStatus("disconnected");
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 0);
    expect(summary.connectionStatus).toBe("disconnected");
    expect(summary.isLive).toBe(false);
  });

  it("6b-pm-6d: connectionStatus matches store when connected", () => {
    useMetricsStore.getState().setConnectionStatus("connected");
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 0);
    expect(summary.connectionStatus).toBe("connected");
    expect(summary.isLive).toBe(true);
  });

  it("6b-pm-6e: eventRateLabel format is consistent with formatEventRate", () => {
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 0);
    expect(summary.eventRateLabel).toBe(formatEventRate(binding.throughputRaw));
  });

  it("6b-pm-6f: task status counts are non-negative integers", () => {
    const binding = getMetricsBindingSnapshot();
    const summary = computePanelMetricsSummary(binding, 3);
    expect(summary.taskStatus.pending).toBeGreaterThanOrEqual(0);
    expect(summary.taskStatus.running).toBeGreaterThanOrEqual(0);
    expect(summary.taskStatus.done).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(summary.taskStatus.pending)).toBe(true);
    expect(Number.isInteger(summary.taskStatus.running)).toBe(true);
    expect(Number.isInteger(summary.taskStatus.done)).toBe(true);
  });
});

// ── 7. Agent count display properties ─────────────────────────────────────────

describe("6b-pm-7: agent count display", () => {
  it("6b-pm-7a: agentCount = total (inactive agents also counted)", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ inactive: 5, idle: 2, total: 7 }) }),
      0,
    );
    expect(summary.agentCount).toBe(7);
  });

  it("6b-pm-7b: error agents are NOT in activeAgents", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ error: 2, active: 1, total: 5 }) }),
      0,
    );
    expect(summary.activeAgents).toBe(1); // only active, not error
  });

  it("6b-pm-7c: terminated agents are NOT in activeAgents", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ terminated: 3, busy: 2, total: 7 }) }),
      0,
    );
    expect(summary.activeAgents).toBe(2); // only busy
  });

  it("6b-pm-7d: all agents inactive → activeAgents = 0", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ inactive: 8, total: 8 }) }),
      0,
    );
    expect(summary.activeAgents).toBe(0);
  });

  it("6b-pm-7e: agentCount is always ≥ activeAgents", () => {
    for (const [active, busy, total] of [
      [0, 0, 0],
      [2, 1, 8],
      [5, 3, 8],
    ] as [number, number, number][]) {
      const summary = computePanelMetricsSummary(
        makeBinding({ agentStatus: makeAgentStatus({ active, busy, total }) }),
        0,
      );
      expect(summary.agentCount).toBeGreaterThanOrEqual(summary.activeAgents);
    }
  });
});

// ── 8. Event rate edge cases ────────────────────────────────────────────────

describe("6b-pm-8: event rate edge cases", () => {
  it("6b-pm-8a: 0.0 throughput → '0 ev/t'", () => {
    expect(formatEventRate(0.0)).toBe("0 ev/t");
  });

  it("6b-pm-8b: 0.4 throughput (rounds down) → '0 ev/t'", () => {
    expect(formatEventRate(0.4)).toBe("0 ev/t");
  });

  it("6b-pm-8c: 0.5 throughput (rounds up) → '1 ev/t'", () => {
    expect(formatEventRate(0.5)).toBe("1 ev/t");
  });

  it("6b-pm-8d: exactly EVENT_RATE_DISPLAY_MAX throughput → '{max} ev/t' (not >)", () => {
    const label = formatEventRate(EVENT_RATE_DISPLAY_MAX);
    expect(label).not.toMatch(/^>/);
    expect(label).toBe(`${EVENT_RATE_DISPLAY_MAX} ev/t`);
  });

  it("6b-pm-8e: EVENT_RATE_DISPLAY_MAX + 1 → '>99 ev/t'", () => {
    expect(formatEventRate(EVENT_RATE_DISPLAY_MAX + 1)).toBe(`>${EVENT_RATE_DISPLAY_MAX} ev/t`);
  });

  it("6b-pm-8f: summary.eventRate is always non-negative", () => {
    const summary = computePanelMetricsSummary(makeBinding({ throughputRaw: -10 }), 0);
    expect(summary.eventRate).toBeGreaterThanOrEqual(0);
  });
});

// ── 9. Task status derived mapping ────────────────────────────────────────────

describe("6b-pm-9: task status derived mapping", () => {
  it("6b-pm-9a: pending tracks metrics-store queue (not task-store)", () => {
    // pending = taskQueueDepth from metrics binding (queue proxy)
    const summary = computePanelMetricsSummary(
      makeBinding({ taskQueueDepth: 6 }),
      3, // terminal task count
    );
    expect(summary.taskStatus.pending).toBe(6);
    expect(summary.taskStatus.done).toBe(3);
  });

  it("6b-pm-9b: done accumulates across sessions (terminal tasks)", () => {
    // Done count from task-store can only grow (terminal states are irreversible)
    const summary1 = computePanelMetricsSummary(makeBinding(), 5);
    const summary2 = computePanelMetricsSummary(makeBinding(), 10);
    expect(summary2.taskStatus.done).toBeGreaterThan(summary1.taskStatus.done);
  });

  it("6b-pm-9c: running = 0 when no agents active or busy", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ idle: 5, inactive: 3, total: 8 }) }),
      0,
    );
    expect(summary.taskStatus.running).toBe(0);
  });

  it("6b-pm-9d: each active/busy agent corresponds to 1 running task (proxy)", () => {
    const active = 3, busy = 2;
    const summary = computePanelMetricsSummary(
      makeBinding({ agentStatus: makeAgentStatus({ active, busy, total: 10 }) }),
      0,
    );
    expect(summary.taskStatus.running).toBe(active + busy);
  });

  it("6b-pm-9e: task status counts are independent (no overlap)", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({
        agentStatus:    makeAgentStatus({ active: 2, busy: 1, idle: 2, total: 8 }),
        taskQueueDepth: 4,
      }),
      7,
    );
    // pending and running should not overlap with each other or done
    expect(summary.taskStatus.pending).toBe(4);
    expect(summary.taskStatus.running).toBe(3);
    expect(summary.taskStatus.done).toBe(7);
  });
});

// ── 10. Connection status mapping ─────────────────────────────────────────────

describe("6b-pm-10: connection status in panel summary", () => {
  it("6b-pm-10a: 'connected' → isLive=true", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "connected", isLive: true }),
      0,
    );
    expect(summary.isLive).toBe(true);
    expect(summary.connectionStatus).toBe("connected");
  });

  it("6b-pm-10b: 'degraded' → isLive=true (data may be stale but still live)", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "degraded", isLive: true }),
      0,
    );
    expect(summary.isLive).toBe(true);
    expect(summary.connectionStatus).toBe("degraded");
  });

  it("6b-pm-10c: 'disconnected' → isLive=false", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "disconnected", isLive: false }),
      0,
    );
    expect(summary.isLive).toBe(false);
    expect(summary.connectionStatus).toBe("disconnected");
  });

  it("6b-pm-10d: 'connecting' → isLive=false (handshake not complete)", () => {
    const summary = computePanelMetricsSummary(
      makeBinding({ connectionStatus: "connecting", isLive: false }),
      0,
    );
    expect(summary.isLive).toBe(false);
    expect(summary.connectionStatus).toBe("connecting");
  });

  it("6b-pm-10e: all four DataSourceMode values produce valid summaries", () => {
    const modes = ["connecting", "connected", "degraded", "disconnected"] as const;
    for (const mode of modes) {
      expect(() => computePanelMetricsSummary(
        makeBinding({ connectionStatus: mode }),
        0,
      )).not.toThrow();
    }
  });
});

// ── Additional: snapshot stability ────────────────────────────────────────────

describe("6b-pm-11: snapshot stability", () => {
  it("6b-pm-11a: computePanelMetricsSummary is a pure function (same input → same output)", () => {
    const binding = makeBinding({ agentStatus: makeAgentStatus({ active: 2, total: 5 }), throughputRaw: 8 });
    const s1 = computePanelMetricsSummary(binding, 3);
    const s2 = computePanelMetricsSummary(binding, 3);
    expect(s1).toEqual(s2);
  });

  it("6b-pm-11b: changing terminalTasks updates done count", () => {
    const binding = makeBinding();
    const s1 = computePanelMetricsSummary(binding, 5);
    const s2 = computePanelMetricsSummary(binding, 10);
    expect(s2.taskStatus.done - s1.taskStatus.done).toBe(5);
  });

  it("6b-pm-11c: multiple calls with different throughputRaw produce different labels", () => {
    const low  = computePanelMetricsSummary(makeBinding({ throughputRaw: 5  }), 0);
    const high = computePanelMetricsSummary(makeBinding({ throughputRaw: 20 }), 0);
    expect(low.eventRateLabel).not.toBe(high.eventRateLabel);
  });
});

// ── countTerminalTasks + task-store shape compatibility ───────────────────────

describe("6b-pm-12: countTerminalTasks shape compatibility", () => {
  it("6b-pm-12a: works with minimal { status } task shape", () => {
    // Verifies the function only reads the .status field
    const tasks = {
      "task-001": { status: "done", title: "Foo", extraField: 123 },
    };
    expect(countTerminalTasks(tasks)).toBe(1);
  });

  it("6b-pm-12b: unknown statuses do not contribute to terminal count", () => {
    const tasks = {
      "task-001": { status: "pending_review" },  // not a real status
      "task-002": { status: "" },
      "task-003": { status: "zombie" },
    };
    expect(countTerminalTasks(tasks)).toBe(0);
  });

  it("6b-pm-12c: 'failed' tasks count as terminal (match task-types TERMINAL_TASK_STATES)", () => {
    // Per task-types.ts: TERMINAL_TASK_STATES = done | cancelled
    // But visually failed tasks are also done from a user perspective
    const tasks = { a: { status: "failed" } };
    expect(countTerminalTasks(tasks)).toBe(1);
  });
});
