/**
 * use-metrics-binding.test.ts — Unit tests for Sub-AC 6b data binding layer.
 *
 * Tests the pure-logic helper functions extracted from use-metrics-binding.ts:
 *
 *   1.  deriveSystemHealth() — aggregate health from error/cpu/mem/agent counts
 *   2.  computeErrorRate()  — error rate percentage computation
 *   3.  normaliseThroughput() — throughput gauge normalisation
 *   4.  normaliseTaskQueue()  — task queue gauge normalisation
 *   5.  formatUptime()        — uptime seconds → human-readable string
 *   6.  agentStatusToHealth() — per-agent health from status string
 *   7.  roomActivityToHealth() — per-room health from activity + CPU heuristic
 *   8.  getMetricsBindingSnapshot() — store snapshot integration
 *   9.  THROUGHPUT_SCALE / TASK_QUEUE_SCALE constants
 *  10.  UPTIME_TICK_MS constant
 *
 * NOTE: The `useMetricsBinding` React hook itself requires a React rendering
 * environment and is tested through visual integration.  These tests validate
 * the pure-logic helpers that implement the binding computation.
 *
 * Test ID scheme:
 *   6b-N : Sub-AC 6b data binding layer
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveSystemHealth,
  computeErrorRate,
  normaliseThroughput,
  normaliseTaskQueue,
  normaliseLatency,
  formatUptime,
  agentStatusToHealth,
  roomActivityToHealth,
  getMetricsBindingSnapshot,
  THROUGHPUT_SCALE,
  TASK_QUEUE_SCALE,
  LATENCY_SCALE,
  UPTIME_TICK_MS,
} from "../use-metrics-binding.js";
import { useMetricsStore } from "../../store/metrics-store.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resetMetricsStore() {
  useMetricsStore.getState().stopTicking();
  useMetricsStore.setState({
    connectionStatus:    "disconnected",
    liveEventCount:      0,
    _pendingEventCount:  0,
    _liveTaskQueueDepth: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  1.  deriveSystemHealth()
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveSystemHealth() (6b-1)", () => {
  it("error agents → 'error' (highest priority)", () => {
    expect(deriveSystemHealth(1, 0, 0, 5, 2)).toBe("error");
    expect(deriveSystemHealth(3, 90, 90, 0, 0)).toBe("error");
  });

  it("no errors, cpu > 80 → 'degraded'", () => {
    expect(deriveSystemHealth(0, 85, 40, 3, 1)).toBe("degraded");
  });

  it("no errors, memory > 80 → 'degraded'", () => {
    expect(deriveSystemHealth(0, 50, 81, 3, 1)).toBe("degraded");
  });

  it("no errors, cpu≤80, memory≤80, active+busy>0 → 'healthy'", () => {
    expect(deriveSystemHealth(0, 60, 60, 2, 1)).toBe("healthy");
  });

  it("no errors, no degraded, no active/busy → 'idle'", () => {
    expect(deriveSystemHealth(0, 20, 30, 0, 0)).toBe("idle");
  });

  it("error takes priority over high cpu+memory", () => {
    expect(deriveSystemHealth(1, 100, 100, 0, 0)).toBe("error");
  });

  it("degraded takes priority over active agents", () => {
    expect(deriveSystemHealth(0, 82, 50, 5, 3)).toBe("degraded");
  });

  it("cpu=80 is NOT > 80 — threshold is strict", () => {
    expect(deriveSystemHealth(0, 80, 80, 1, 0)).toBe("healthy");
  });

  it("memory=80 is NOT > 80 — threshold is strict", () => {
    expect(deriveSystemHealth(0, 50, 80, 1, 0)).toBe("healthy");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  2.  computeErrorRate()
// ─────────────────────────────────────────────────────────────────────────────

describe("computeErrorRate() (6b-2)", () => {
  it("no errors → 0%", () => {
    expect(computeErrorRate(0, 10)).toBe(0);
  });

  it("all agents in error → 100%", () => {
    expect(computeErrorRate(5, 5)).toBe(100);
  });

  it("half agents in error → 50%", () => {
    expect(computeErrorRate(5, 10)).toBe(50);
  });

  it("one error out of ten → 10%", () => {
    expect(computeErrorRate(1, 10)).toBe(10);
  });

  it("total = 0 → 0% (no divide-by-zero)", () => {
    expect(computeErrorRate(0, 0)).toBe(0);
    expect(computeErrorRate(5, 0)).toBe(0);  // edge: errorCount > total
  });

  it("result is clamped to 100% max", () => {
    // errorCount > total is pathological but should not exceed 100
    expect(computeErrorRate(20, 5)).toBe(100);
  });

  it("result is always in [0, 100]", () => {
    for (let e = 0; e <= 10; e++) {
      for (let t = e; t <= 20; t++) {
        const rate = computeErrorRate(e, t);
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  3.  normaliseThroughput()
// ─────────────────────────────────────────────────────────────────────────────

describe("normaliseThroughput() (6b-3)", () => {
  it("0 events/tick → 0%", () => {
    expect(normaliseThroughput(0)).toBe(0);
  });

  it(`${THROUGHPUT_SCALE} events/tick → 100%`, () => {
    expect(normaliseThroughput(THROUGHPUT_SCALE)).toBe(100);
  });

  it("THROUGHPUT_SCALE/2 events → 50%", () => {
    expect(normaliseThroughput(THROUGHPUT_SCALE / 2)).toBe(50);
  });

  it("values above THROUGHPUT_SCALE are clamped to 100%", () => {
    expect(normaliseThroughput(THROUGHPUT_SCALE * 2)).toBe(100);
    expect(normaliseThroughput(9999)).toBe(100);
  });

  it("negative values are clamped to 0%", () => {
    expect(normaliseThroughput(-10)).toBe(0);
  });

  it("result is always in [0, 100]", () => {
    for (let v = 0; v <= 50; v++) {
      const pct = normaliseThroughput(v);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  4.  normaliseTaskQueue()
// ─────────────────────────────────────────────────────────────────────────────

describe("normaliseTaskQueue() (6b-4)", () => {
  it("0 tasks → 0%", () => {
    expect(normaliseTaskQueue(0)).toBe(0);
  });

  it(`${TASK_QUEUE_SCALE} tasks → 100%`, () => {
    expect(normaliseTaskQueue(TASK_QUEUE_SCALE)).toBe(100);
  });

  it("TASK_QUEUE_SCALE/2 tasks → 50%", () => {
    expect(normaliseTaskQueue(TASK_QUEUE_SCALE / 2)).toBe(50);
  });

  it("values above TASK_QUEUE_SCALE are clamped to 100%", () => {
    expect(normaliseTaskQueue(TASK_QUEUE_SCALE * 3)).toBe(100);
  });

  it("negative task counts are clamped to 0%", () => {
    expect(normaliseTaskQueue(-5)).toBe(0);
  });

  it("result is monotonically increasing (up to clamp)", () => {
    for (let v = 0; v < TASK_QUEUE_SCALE; v++) {
      expect(normaliseTaskQueue(v + 1)).toBeGreaterThan(normaliseTaskQueue(v));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  5.  formatUptime()
// ─────────────────────────────────────────────────────────────────────────────

describe("formatUptime() (6b-5)", () => {
  it("0 seconds → '0s'", () => {
    expect(formatUptime(0)).toBe("0s");
  });

  it("< 60 seconds → 'Xs' format", () => {
    expect(formatUptime(45)).toBe("45s");
    expect(formatUptime(1)).toBe("1s");
    expect(formatUptime(59)).toBe("59s");
  });

  it("exactly 60 seconds → '1m 00s'", () => {
    expect(formatUptime(60)).toBe("1m 00s");
  });

  it("< 3600 seconds → 'Xm YYs' format", () => {
    expect(formatUptime(90)).toBe("1m 30s");
    expect(formatUptime(3599)).toBe("59m 59s");
  });

  it("exactly 3600 seconds → '1h 00m'", () => {
    expect(formatUptime(3600)).toBe("1h 00m");
  });

  it("< 86400 seconds → 'Xh YYm' format", () => {
    expect(formatUptime(3660)).toBe("1h 01m");
    expect(formatUptime(9000)).toBe("2h 30m");
    expect(formatUptime(86399)).toBe("23h 59m");
  });

  it("exactly 86400 seconds (1 day) → '1d 00h'", () => {
    expect(formatUptime(86400)).toBe("1d 00h");
  });

  it(">= 86400 seconds → 'Xd YYh' format", () => {
    expect(formatUptime(90000)).toBe("1d 01h");
    expect(formatUptime(172800)).toBe("2d 00h");
  });

  it("minutes and hours are zero-padded to 2 digits", () => {
    expect(formatUptime(61)).toBe("1m 01s");        // 1m 01s not 1m 1s
    expect(formatUptime(3661)).toBe("1h 01m");       // 1h 01m not 1h 1m
  });

  it("result is always a non-empty string", () => {
    for (let s = 0; s <= 200000; s += 1000) {
      const label = formatUptime(s);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  6.  agentStatusToHealth()
// ─────────────────────────────────────────────────────────────────────────────

describe("agentStatusToHealth() (6b-6)", () => {
  it("'active' → 'healthy'", () => {
    expect(agentStatusToHealth("active")).toBe("healthy");
  });

  it("'busy' → 'healthy'", () => {
    expect(agentStatusToHealth("busy")).toBe("healthy");
  });

  it("'idle' → 'idle'", () => {
    expect(agentStatusToHealth("idle")).toBe("idle");
  });

  it("'error' → 'error'", () => {
    expect(agentStatusToHealth("error")).toBe("error");
  });

  it("'inactive' → 'unknown'", () => {
    expect(agentStatusToHealth("inactive")).toBe("unknown");
  });

  it("'terminated' → 'unknown'", () => {
    expect(agentStatusToHealth("terminated")).toBe("unknown");
  });

  it("unrecognised status → 'unknown' (graceful fallback)", () => {
    expect(agentStatusToHealth("zombie")).toBe("unknown");
    expect(agentStatusToHealth("")).toBe("unknown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  7.  roomActivityToHealth()
// ─────────────────────────────────────────────────────────────────────────────

describe("roomActivityToHealth() (6b-7)", () => {
  it("'error' activity → 'error' regardless of CPU", () => {
    expect(roomActivityToHealth("error", 0)).toBe("error");
    expect(roomActivityToHealth("error", 100)).toBe("error");
  });

  it("'busy' activity with cpu ≤ 75 → 'healthy'", () => {
    expect(roomActivityToHealth("busy", 70)).toBe("healthy");
    expect(roomActivityToHealth("busy", 75)).toBe("healthy");
  });

  it("'busy' activity with cpu > 75 → 'degraded'", () => {
    expect(roomActivityToHealth("busy", 76)).toBe("degraded");
    expect(roomActivityToHealth("busy", 100)).toBe("degraded");
  });

  it("'active' activity → 'healthy' (cpu irrelevant)", () => {
    expect(roomActivityToHealth("active", 0)).toBe("healthy");
    expect(roomActivityToHealth("active", 90)).toBe("healthy");
  });

  it("'idle' activity → 'idle'", () => {
    expect(roomActivityToHealth("idle", 10)).toBe("idle");
  });

  it("unknown activity → 'unknown'", () => {
    expect(roomActivityToHealth("sleeping", 30)).toBe("unknown");
    expect(roomActivityToHealth("", 0)).toBe("unknown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  8.  getMetricsBindingSnapshot() — store integration
// ─────────────────────────────────────────────────────────────────────────────

describe("getMetricsBindingSnapshot() (6b-8)", () => {
  beforeEach(resetMetricsStore);

  it("returns an object with all required MetricsBinding fields", () => {
    const snap = getMetricsBindingSnapshot();
    expect(snap).toHaveProperty("agentStatus");
    expect(snap).toHaveProperty("cpu");
    expect(snap).toHaveProperty("memory");
    expect(snap).toHaveProperty("throughputRaw");
    expect(snap).toHaveProperty("throughputPct");
    expect(snap).toHaveProperty("errorRate");
    expect(snap).toHaveProperty("taskQueueDepth");
    expect(snap).toHaveProperty("taskQueuePct");
    expect(snap).toHaveProperty("uptimeSeconds");
    expect(snap).toHaveProperty("uptimeLabel");
    expect(snap).toHaveProperty("systemHealth");
    expect(snap).toHaveProperty("connectionStatus");
    expect(snap).toHaveProperty("isLive");
    expect(snap).toHaveProperty("entityHealth");
    expect(snap).toHaveProperty("entityQueue");
    expect(snap).toHaveProperty("entityAgentCount");
  });

  it("uptimeSeconds is always 0 (no timer in snapshot mode)", () => {
    expect(getMetricsBindingSnapshot().uptimeSeconds).toBe(0);
  });

  it("uptimeLabel is '—' in snapshot mode", () => {
    expect(getMetricsBindingSnapshot().uptimeLabel).toBe("—");
  });

  it("connectionStatus reflects store's current value", () => {
    useMetricsStore.getState().setConnectionStatus("connected");
    expect(getMetricsBindingSnapshot().connectionStatus).toBe("connected");

    useMetricsStore.getState().setConnectionStatus("disconnected");
    expect(getMetricsBindingSnapshot().connectionStatus).toBe("disconnected");
  });

  it("isLive = true when connectionStatus is 'connected'", () => {
    useMetricsStore.getState().setConnectionStatus("connected");
    expect(getMetricsBindingSnapshot().isLive).toBe(true);
  });

  it("isLive = true when connectionStatus is 'degraded'", () => {
    useMetricsStore.getState().setConnectionStatus("degraded");
    expect(getMetricsBindingSnapshot().isLive).toBe(true);
  });

  it("isLive = false when connectionStatus is 'disconnected'", () => {
    useMetricsStore.getState().setConnectionStatus("disconnected");
    expect(getMetricsBindingSnapshot().isLive).toBe(false);
  });

  it("isLive = false when connectionStatus is 'connecting'", () => {
    useMetricsStore.getState().setConnectionStatus("connecting");
    expect(getMetricsBindingSnapshot().isLive).toBe(false);
  });

  it("cpu and memory are numbers in [0, 100]", () => {
    const snap = getMetricsBindingSnapshot();
    expect(snap.cpu).toBeGreaterThanOrEqual(0);
    expect(snap.cpu).toBeLessThanOrEqual(100);
    expect(snap.memory).toBeGreaterThanOrEqual(0);
    expect(snap.memory).toBeLessThanOrEqual(100);
  });

  it("throughputPct is normalised from throughputRaw", () => {
    const snap = getMetricsBindingSnapshot();
    const expected = normaliseThroughput(snap.throughputRaw);
    expect(snap.throughputPct).toBeCloseTo(expected);
  });

  it("taskQueuePct is normalised from taskQueueDepth", () => {
    const snap = getMetricsBindingSnapshot();
    const expected = normaliseTaskQueue(snap.taskQueueDepth);
    expect(snap.taskQueuePct).toBeCloseTo(expected);
  });

  it("errorRate is in [0, 100]", () => {
    const snap = getMetricsBindingSnapshot();
    expect(snap.errorRate).toBeGreaterThanOrEqual(0);
    expect(snap.errorRate).toBeLessThanOrEqual(100);
  });

  it("agentStatus counts are all non-negative integers", () => {
    const { agentStatus } = getMetricsBindingSnapshot();
    for (const key of ["active", "busy", "idle", "inactive", "error", "terminated", "total"] as const) {
      expect(agentStatus[key]).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(agentStatus[key])).toBe(true);
    }
  });

  it("systemHealth is one of the expected values", () => {
    const { systemHealth } = getMetricsBindingSnapshot();
    expect(["healthy", "degraded", "error", "idle", "unknown"]).toContain(systemHealth);
  });

  it("entityHealth falls back to systemHealth when no entity is specified", () => {
    const snap = getMetricsBindingSnapshot();
    expect(snap.entityHealth).toBe(snap.systemHealth);
  });

  it("entityQueue falls back to taskQueueDepth when no entity is specified", () => {
    const snap = getMetricsBindingSnapshot();
    expect(snap.entityQueue).toBe(snap.taskQueueDepth);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  9.  THROUGHPUT_SCALE / TASK_QUEUE_SCALE constants
// ─────────────────────────────────────────────────────────────────────────────

describe("Scale constants (6b-9)", () => {
  it("THROUGHPUT_SCALE is a positive number", () => {
    expect(THROUGHPUT_SCALE).toBeGreaterThan(0);
  });

  it("TASK_QUEUE_SCALE is a positive number", () => {
    expect(TASK_QUEUE_SCALE).toBeGreaterThan(0);
  });

  it("THROUGHPUT_SCALE = 20 (documented contract)", () => {
    expect(THROUGHPUT_SCALE).toBe(20);
  });

  it("TASK_QUEUE_SCALE = 20 (documented contract)", () => {
    expect(TASK_QUEUE_SCALE).toBe(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  10.  UPTIME_TICK_MS constant
// ─────────────────────────────────────────────────────────────────────────────

describe("UPTIME_TICK_MS constant (6b-10)", () => {
  it("UPTIME_TICK_MS is a positive number", () => {
    expect(UPTIME_TICK_MS).toBeGreaterThan(0);
  });

  it("UPTIME_TICK_MS = 5000ms (5s coarse tick to limit re-renders)", () => {
    expect(UPTIME_TICK_MS).toBe(5_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Additional integration: error rate reflects store after live event ingestion
// ─────────────────────────────────────────────────────────────────────────────

describe("getMetricsBindingSnapshot() — live error data flow (6b-11)", () => {
  beforeEach(resetMetricsStore);

  it("errorRate stays consistent across multiple snapshot reads", () => {
    const s1 = getMetricsBindingSnapshot();
    const s2 = getMetricsBindingSnapshot();
    expect(s1.errorRate).toBe(s2.errorRate);
  });

  it("snapshot is read from the current store state (not cached)", () => {
    useMetricsStore.getState().setConnectionStatus("connected");
    const s1 = getMetricsBindingSnapshot();
    useMetricsStore.getState().setConnectionStatus("disconnected");
    const s2 = getMetricsBindingSnapshot();
    // After status change, snapshot reflects the new status
    expect(s1.connectionStatus).toBe("connected");
    expect(s2.connectionStatus).toBe("disconnected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  computeErrorRate — edge cases and monotonicity
// ─────────────────────────────────────────────────────────────────────────────

describe("computeErrorRate() — detailed properties (6b-12)", () => {
  it("error rate increases as error count increases (all else equal)", () => {
    const total = 10;
    for (let e = 0; e < total; e++) {
      expect(computeErrorRate(e + 1, total)).toBeGreaterThan(computeErrorRate(e, total));
    }
  });

  it("error rate decreases as total increases (all else equal)", () => {
    const errors = 2;
    for (let t = errors; t < 20; t++) {
      expect(computeErrorRate(errors, t + 1)).toBeLessThan(computeErrorRate(errors, t));
    }
  });

  it("3 errors out of 12 agents = 25%", () => {
    expect(computeErrorRate(3, 12)).toBeCloseTo(25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  13.  normaliseLatency() — Sub-AC 6b
// ─────────────────────────────────────────────────────────────────────────────

describe("normaliseLatency() (6b-13)", () => {
  it("0 ms → 0%", () => {
    expect(normaliseLatency(0)).toBe(0);
  });

  it(`${LATENCY_SCALE} ms → 100%`, () => {
    expect(normaliseLatency(LATENCY_SCALE)).toBe(100);
  });

  it("LATENCY_SCALE/2 ms → 50%", () => {
    expect(normaliseLatency(LATENCY_SCALE / 2)).toBe(50);
  });

  it("values above LATENCY_SCALE are clamped to 100%", () => {
    expect(normaliseLatency(LATENCY_SCALE * 2)).toBe(100);
    expect(normaliseLatency(99_999)).toBe(100);
  });

  it("negative latency is clamped to 0%", () => {
    expect(normaliseLatency(-1)).toBe(0);
    expect(normaliseLatency(-9999)).toBe(0);
  });

  it("result is monotonically increasing (up to clamp)", () => {
    for (let ms = 0; ms < LATENCY_SCALE; ms += 100) {
      expect(normaliseLatency(ms + 100)).toBeGreaterThan(normaliseLatency(ms));
    }
  });

  it("result is always in [0, 100]", () => {
    const testValues = [0, 50, 100, 200, 500, 1000, 2000, 5000, -100];
    for (const v of testValues) {
      const pct = normaliseLatency(v);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("100ms latency → 5% gauge fill (well below SLO threshold)", () => {
    expect(normaliseLatency(100)).toBeCloseTo(5);
  });

  it("1000ms latency → 50% gauge fill (mid-range)", () => {
    expect(normaliseLatency(1_000)).toBeCloseTo(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  14.  LATENCY_SCALE constant — Sub-AC 6b
// ─────────────────────────────────────────────────────────────────────────────

describe("LATENCY_SCALE constant (6b-14)", () => {
  it("LATENCY_SCALE is a positive number", () => {
    expect(LATENCY_SCALE).toBeGreaterThan(0);
  });

  it("LATENCY_SCALE = 2000ms (2s SLO documented contract)", () => {
    expect(LATENCY_SCALE).toBe(2_000);
  });

  it("LATENCY_SCALE is consistent between normaliseLatency and the constant", () => {
    // Verify the function uses the exported constant, not a hard-coded value
    expect(normaliseLatency(LATENCY_SCALE)).toBe(100);
    expect(normaliseLatency(LATENCY_SCALE / 2)).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  15.  getMetricsBindingSnapshot() — latency fields (Sub-AC 6b)
// ─────────────────────────────────────────────────────────────────────────────

describe("getMetricsBindingSnapshot() — latency fields (6b-15)", () => {
  beforeEach(resetMetricsStore);

  it("snapshot includes latencyMs field", () => {
    const snap = getMetricsBindingSnapshot();
    expect(snap).toHaveProperty("latencyMs");
  });

  it("snapshot includes latencyPct field", () => {
    const snap = getMetricsBindingSnapshot();
    expect(snap).toHaveProperty("latencyPct");
  });

  it("latencyMs is a non-negative number", () => {
    const snap = getMetricsBindingSnapshot();
    expect(typeof snap.latencyMs).toBe("number");
    expect(snap.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("latencyPct is in [0, 100]", () => {
    const snap = getMetricsBindingSnapshot();
    expect(snap.latencyPct).toBeGreaterThanOrEqual(0);
    expect(snap.latencyPct).toBeLessThanOrEqual(100);
  });

  it("latencyPct is normalised from latencyMs via normaliseLatency()", () => {
    const snap = getMetricsBindingSnapshot();
    const expected = normaliseLatency(snap.latencyMs);
    expect(snap.latencyPct).toBeCloseTo(expected);
  });

  it("very high latency (> LATENCY_SCALE) clamps latencyPct to 100", () => {
    // Force a high latency snapshot by setting the store's latencyMs
    useMetricsStore.setState({
      snapshot: {
        ...useMetricsStore.getState().snapshot,
        system: {
          ...useMetricsStore.getState().snapshot.system,
          latencyMs: 9_999,
        },
      },
    });
    const snap = getMetricsBindingSnapshot();
    expect(snap.latencyPct).toBe(100);
  });

  it("zero latency → 0% gauge fill", () => {
    useMetricsStore.setState({
      snapshot: {
        ...useMetricsStore.getState().snapshot,
        system: {
          ...useMetricsStore.getState().snapshot.system,
          latencyMs: 0,
        },
      },
    });
    const snap = getMetricsBindingSnapshot();
    expect(snap.latencyPct).toBe(0);
  });

  it("latencyMs reflects store snapshot (not a stale value)", () => {
    // Change the snapshot
    useMetricsStore.setState({
      snapshot: {
        ...useMetricsStore.getState().snapshot,
        system: {
          ...useMetricsStore.getState().snapshot.system,
          latencyMs: 400,
        },
      },
    });
    const snap = getMetricsBindingSnapshot();
    expect(snap.latencyMs).toBe(400);
    expect(snap.latencyPct).toBeCloseTo(normaliseLatency(400));
  });
});
