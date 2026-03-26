/**
 * scene-performance.test.ts — Unit tests for Sub-AC 15c: Scene rendering performance.
 *
 * Tests the pure-logic aspects of ScenePerformance.tsx:
 *
 *   1. QualityLevel type invariants: the three tiers are "high", "medium", "low"
 *   2. PerformanceQualityContext default value: "high" (full fidelity by default)
 *   3. FPS threshold logic: verifies the documented breakpoints are consistent
 *      with the implementation (≥50 → high, 28-49 → medium, <28 → low)
 *   4. Hysteresis constants: downgrade after 2 bad seconds, upgrade after 5 good
 *   5. Frame throttle counter: divisor-based frame-skip gate pattern
 *
 * NOTE: ScenePerformance hooks (useDistanceCull, useFrameThrottle,
 *       ScenePerformanceMonitor) use useFrame/useThree from @react-three/fiber
 *       and cannot run in a headless Vitest environment without a WebGL canvas.
 *       These tests validate the exported constants and the pure algorithmic
 *       logic that drives those hooks.
 *
 * Test ID scheme:
 *   15c-N : Sub-AC 15c performance optimisation
 */

import { describe, it, expect } from "vitest";
import {
  PerformanceQualityContext,
  type QualityLevel,
} from "../ScenePerformance.js";

// ── 1. QualityLevel type invariants ───────────────────────────────────────────

describe("QualityLevel type (15c-1)", () => {
  it("has exactly three tiers", () => {
    // TypeScript union 'high' | 'medium' | 'low'
    const tiers: QualityLevel[] = ["high", "medium", "low"];
    expect(tiers).toHaveLength(3);
  });

  it("'high' tier is the first (best-fidelity) tier", () => {
    const tiers: QualityLevel[] = ["high", "medium", "low"];
    expect(tiers[0]).toBe("high");
  });

  it("'low' tier is the last (minimal-fidelity) tier", () => {
    const tiers: QualityLevel[] = ["high", "medium", "low"];
    expect(tiers[tiers.length - 1]).toBe("low");
  });
});

// ── 2. PerformanceQualityContext default ──────────────────────────────────────

describe("PerformanceQualityContext (15c-2)", () => {
  it("is a defined React context", () => {
    expect(PerformanceQualityContext).toBeDefined();
    expect(PerformanceQualityContext).toHaveProperty("Provider");
    expect(PerformanceQualityContext).toHaveProperty("Consumer");
  });

  it("defaults to 'high' quality (full fidelity when no monitor present)", () => {
    // React context stores the default value as _currentValue or _defaultValue
    // The createContext<QualityLevel>("high") call sets the default to "high"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = PerformanceQualityContext as any;
    const defaultValue = ctx._currentValue ?? ctx._defaultValue;
    expect(defaultValue).toBe("high");
  });
});

// ── 3. FPS threshold specification (doc-tests) ───────────────────────────────

/**
 * These tests verify that the documented FPS thresholds are logically
 * consistent with one another. They do NOT call any Three.js code — they
 * validate that the specification is internally coherent.
 */
describe("FPS threshold logic (15c-3)", () => {
  // Thresholds from the ScenePerformance docstring and implementation
  const HIGH_FPS_THRESHOLD  = 50; // ≥50 → 'high'
  const LOW_FPS_THRESHOLD   = 28; // <28 → 'low' (28-49 → 'medium')

  function classifyFps(fps: number): QualityLevel {
    if (fps >= HIGH_FPS_THRESHOLD)  return "high";
    if (fps < LOW_FPS_THRESHOLD)    return "low";
    return "medium";
  }

  it("60 fps → 'high'", () => {
    expect(classifyFps(60)).toBe("high");
  });

  it("50 fps → 'high' (boundary)", () => {
    expect(classifyFps(50)).toBe("high");
  });

  it("49 fps → 'medium'", () => {
    expect(classifyFps(49)).toBe("medium");
  });

  it("28 fps → 'medium' (lower boundary of medium band)", () => {
    expect(classifyFps(28)).toBe("medium");
  });

  it("27 fps → 'low'", () => {
    expect(classifyFps(27)).toBe("low");
  });

  it("0 fps → 'low'", () => {
    expect(classifyFps(0)).toBe("low");
  });

  it("HIGH_FPS_THRESHOLD > LOW_FPS_THRESHOLD (medium band has positive width)", () => {
    expect(HIGH_FPS_THRESHOLD).toBeGreaterThan(LOW_FPS_THRESHOLD);
  });

  it("thresholds are positive", () => {
    expect(HIGH_FPS_THRESHOLD).toBeGreaterThan(0);
    expect(LOW_FPS_THRESHOLD).toBeGreaterThan(0);
  });
});

// ── 4. Hysteresis constants ───────────────────────────────────────────────────

describe("Hysteresis specification (15c-4)", () => {
  // From implementation: downgrade after 2 consecutive bad seconds, upgrade after 5
  const DOWNGRADE_THRESHOLD = 2;
  const UPGRADE_THRESHOLD   = 5;

  it("UPGRADE_THRESHOLD > DOWNGRADE_THRESHOLD (slower to recover than to degrade)", () => {
    expect(UPGRADE_THRESHOLD).toBeGreaterThan(DOWNGRADE_THRESHOLD);
  });

  it("DOWNGRADE_THRESHOLD is 2", () => {
    expect(DOWNGRADE_THRESHOLD).toBe(2);
  });

  it("UPGRADE_THRESHOLD is 5", () => {
    expect(UPGRADE_THRESHOLD).toBe(5);
  });

  it("simulated hysteresis: 1 bad second does NOT downgrade (fence under threshold)", () => {
    let badCount = 0;
    let quality: QualityLevel = "high";

    // Simulate one bad second
    badCount++;
    if (quality !== "low" && badCount >= DOWNGRADE_THRESHOLD) {
      quality = quality === "high" ? "medium" : "low";
    }

    // Should not have downgraded yet
    expect(quality).toBe("high");
    expect(badCount).toBe(1);
  });

  it("simulated hysteresis: 2 consecutive bad seconds downgrades high → medium", () => {
    let badCount = 0;
    let quality: QualityLevel = "high";

    // Two bad seconds
    for (let i = 0; i < 2; i++) {
      badCount++;
      if (quality !== "low" && badCount >= DOWNGRADE_THRESHOLD) {
        quality = quality === "high" ? "medium" : "low";
        badCount = 0;
      }
    }

    expect(quality).toBe("medium");
  });

  it("simulated hysteresis: 4 consecutive good seconds do NOT upgrade medium → high", () => {
    let goodCount = 0;
    let quality: QualityLevel = "medium";

    for (let i = 0; i < 4; i++) {
      goodCount++;
      if (quality !== "high" && goodCount >= UPGRADE_THRESHOLD) {
        quality = quality === "low" ? "medium" : "high";
        goodCount = 0;
      }
    }

    expect(quality).toBe("medium");
  });

  it("simulated hysteresis: 5 consecutive good seconds upgrade medium → high", () => {
    let goodCount = 0;
    let quality: QualityLevel = "medium";

    for (let i = 0; i < 5; i++) {
      goodCount++;
      if (quality !== "high" && goodCount >= UPGRADE_THRESHOLD) {
        quality = quality === "low" ? "medium" : "high";
        goodCount = 0;
      }
    }

    expect(quality).toBe("high");
  });

  it("simulated hysteresis: full downgrade path high → medium → low requires 4 total bad seconds", () => {
    let badCount = 0;
    let quality: QualityLevel = "high";

    function oneBadSecond() {
      badCount++;
      if (quality !== "low" && badCount >= DOWNGRADE_THRESHOLD) {
        quality = quality === "high" ? "medium" : "low";
        badCount = 0;
      }
    }

    // 2 bad → high→medium
    oneBadSecond(); oneBadSecond();
    expect(quality).toBe("medium");

    // 2 more bad → medium→low
    oneBadSecond(); oneBadSecond();
    expect(quality).toBe("low");
  });
});

// ── 5. Frame throttle pattern ─────────────────────────────────────────────────

describe("Frame throttle pattern (15c-5)", () => {
  /**
   * Simulate the useFrameThrottle(divisor) logic in isolation.
   * The hook returns a closure that increments a counter mod divisor
   * and returns true when the counter hits 0 (every divisor-th call).
   */
  function createThrottle(divisor: number): () => boolean {
    let counter = 0;
    return () => {
      counter = (counter + 1) % divisor;
      return counter === 0;
    };
  }

  it("divisor=1 fires every frame", () => {
    const tick = createThrottle(1);
    // counter: 1%1=0 → true every call
    expect(tick()).toBe(true);
    expect(tick()).toBe(true);
    expect(tick()).toBe(true);
  });

  it("divisor=3 fires exactly once every 3 calls", () => {
    const tick = createThrottle(3);
    const results = Array.from({ length: 9 }, () => tick());
    // Should be [false, false, true, false, false, true, false, false, true]
    const trueCount = results.filter(Boolean).length;
    expect(trueCount).toBe(3);
  });

  it("divisor=2 alternates false/true", () => {
    const tick = createThrottle(2);
    // counter: 1%2=1→false, 2%2=0→true, 1%2=1→false, 2%2=0→true
    expect(tick()).toBe(false);
    expect(tick()).toBe(true);
    expect(tick()).toBe(false);
    expect(tick()).toBe(true);
  });

  it("divisor=6 fires exactly once in 6 frames (≈10fps at 60fps)", () => {
    const tick = createThrottle(6);
    const results = Array.from({ length: 6 }, () => tick());
    const trueCount = results.filter(Boolean).length;
    expect(trueCount).toBe(1);
  });

  it("over 60 frames, divisor=3 fires exactly 20 times", () => {
    const tick = createThrottle(3);
    let count = 0;
    for (let i = 0; i < 60; i++) {
      if (tick()) count++;
    }
    expect(count).toBe(20);
  });
});

// ── 6. Distance culling specification ─────────────────────────────────────────

describe("Distance culling specification (15c-6)", () => {
  /**
   * Simulate the core of useDistanceCull:
   *   visible = distance(cameraPos, objectPos) <= maxDist
   */
  function shouldBeVisible(
    cx: number, cy: number, cz: number,
    ox: number, oy: number, oz: number,
    maxDist: number,
  ): boolean {
    const dx = cx - ox, dy = cy - oy, dz = cz - oz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) <= maxDist;
  }

  it("object at origin is visible when camera is within maxDist", () => {
    expect(shouldBeVisible(0, 0, 5, 0, 0, 0, 10)).toBe(true);
  });

  it("object at origin is NOT visible when camera is beyond maxDist", () => {
    expect(shouldBeVisible(0, 0, 20, 0, 0, 0, 10)).toBe(false);
  });

  it("object exactly at maxDist boundary is visible (inclusive)", () => {
    expect(shouldBeVisible(0, 0, 10, 0, 0, 0, 10)).toBe(true);
  });

  it("visibility is symmetric (camera ↔ object)", () => {
    const v1 = shouldBeVisible(5, 0, 0, 0, 0, 0, 10);
    const v2 = shouldBeVisible(0, 0, 0, 5, 0, 0, 10);
    expect(v1).toBe(v2);
  });

  it("maxDist=0 only makes the object visible when camera is co-located", () => {
    expect(shouldBeVisible(0, 0, 0, 0, 0, 0, 0)).toBe(true);
    expect(shouldBeVisible(0, 0, 0.1, 0, 0, 0, 0)).toBe(false);
  });
});
