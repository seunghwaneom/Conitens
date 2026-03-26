/**
 * birds-eye-camera.test.ts — Unit tests for Sub-AC 3a: BirdsEyeCamera.
 *
 * Tests the exported pure constants and helper functions from BirdsEyeCamera.tsx.
 * The React component itself cannot run in a headless Vitest environment (it
 * requires useFrame / useThree from @react-three/fiber), so we test the
 * constraint logic and helpers that govern zoom/pan behavior separately.
 *
 * Sub-AC 3a acceptance criteria verified:
 *   ✓ Orthographic camera mode constants are correct and consistent
 *   ✓ clampBirdsEyeZoom clamps to [MIN, MAX] and applies delta correctly
 *   ✓ clampBirdsEyePan clamps each axis to [-MAX_PAN, +MAX_PAN]
 *   ✓ defaultBirdsEyeView returns centered, default-zoom state
 *   ✓ pixelDeltaToWorld converts screen pixels to world units
 *   ✓ Reset returns to BIRDS_EYE_DEFAULT_ZOOM / [0, 0] pan
 *   ✓ Zoom semantics: lower frustum half-size = more zoomed in
 *   ✓ Smooth entry transition: starts at ENTER_ZOOM and lerps to target
 *   ✓ lerpToward converges without overshooting
 *
 * Test ID scheme:
 *   3a-N : Sub-AC 3a bird's-eye camera controls
 */

import { describe, it, expect } from "vitest";
import {
  BIRDS_EYE_MIN_ZOOM,
  BIRDS_EYE_MAX_ZOOM,
  BIRDS_EYE_ZOOM_STEP,
  BIRDS_EYE_KEY_ZOOM_STEP,
  BIRDS_EYE_DEFAULT_ZOOM,
  BIRDS_EYE_MAX_PAN,
  BIRDS_EYE_KEY_PAN_STEP,
  BIRDS_EYE_LERP_SPEED,
  BIRDS_EYE_CAMERA_HEIGHT,
  BIRDS_EYE_BUILDING_W,
  BIRDS_EYE_BUILDING_D,
  BIRDS_EYE_BUILDING_CENTER_X,
  BIRDS_EYE_BUILDING_CENTER_Z,
  BIRDS_EYE_ENTER_ZOOM,
  clampBirdsEyeZoom,
  clampBirdsEyePan,
  defaultBirdsEyeView,
  pixelDeltaToWorld,
  computeBirdsEyeEntryZoom,
  lerpToward,
} from "../BirdsEyeCamera.js";

// ── 1. Constant correctness (3a-1) ───────────────────────────────────────────

describe("BirdsEyeCamera constants (3a-1)", () => {
  it("MIN_ZOOM is positive and less than DEFAULT_ZOOM", () => {
    expect(BIRDS_EYE_MIN_ZOOM).toBeGreaterThan(0);
    expect(BIRDS_EYE_MIN_ZOOM).toBeLessThan(BIRDS_EYE_DEFAULT_ZOOM);
  });

  it("MAX_ZOOM is greater than DEFAULT_ZOOM", () => {
    expect(BIRDS_EYE_MAX_ZOOM).toBeGreaterThan(BIRDS_EYE_DEFAULT_ZOOM);
  });

  it("DEFAULT_ZOOM is strictly between MIN and MAX", () => {
    expect(BIRDS_EYE_DEFAULT_ZOOM).toBeGreaterThan(BIRDS_EYE_MIN_ZOOM);
    expect(BIRDS_EYE_DEFAULT_ZOOM).toBeLessThan(BIRDS_EYE_MAX_ZOOM);
  });

  it("ZOOM_STEP is a small positive value (scroll precision)", () => {
    expect(BIRDS_EYE_ZOOM_STEP).toBeGreaterThan(0);
    expect(BIRDS_EYE_ZOOM_STEP).toBeLessThan(5); // must not jump more than 5 units per scroll
  });

  it("KEY_ZOOM_STEP is larger than ZOOM_STEP (keyboard more coarse than scroll)", () => {
    expect(BIRDS_EYE_KEY_ZOOM_STEP).toBeGreaterThanOrEqual(BIRDS_EYE_ZOOM_STEP);
  });

  it("MAX_PAN is positive and large enough to view the whole building", () => {
    expect(BIRDS_EYE_MAX_PAN).toBeGreaterThan(0);
    // Building is 12 wide × 6 deep; pan should allow at least 1× building size
    expect(BIRDS_EYE_MAX_PAN).toBeGreaterThanOrEqual(6);
  });

  it("KEY_PAN_STEP is a positive world-unit step", () => {
    expect(BIRDS_EYE_KEY_PAN_STEP).toBeGreaterThan(0);
  });

  it("LERP_SPEED is a positive interpolation coefficient", () => {
    expect(BIRDS_EYE_LERP_SPEED).toBeGreaterThan(0);
  });

  it("CAMERA_HEIGHT is well above the building (which is at most 6 units tall)", () => {
    expect(BIRDS_EYE_CAMERA_HEIGHT).toBeGreaterThan(10);
  });

  it("building dimensions match the canonical constants from building.ts", () => {
    expect(BIRDS_EYE_BUILDING_W).toBe(12);
    expect(BIRDS_EYE_BUILDING_D).toBe(6);
  });

  it("building center X = BUILDING_W / 2", () => {
    expect(BIRDS_EYE_BUILDING_CENTER_X).toBeCloseTo(BIRDS_EYE_BUILDING_W / 2, 6);
  });

  it("building center Z = BUILDING_D / 2", () => {
    expect(BIRDS_EYE_BUILDING_CENTER_Z).toBeCloseTo(BIRDS_EYE_BUILDING_D / 2, 6);
  });
});

// ── 2. clampBirdsEyeZoom (3a-2) ──────────────────────────────────────────────

describe("clampBirdsEyeZoom (3a-2)", () => {
  it("applies a positive delta (zoom out)", () => {
    const result = clampBirdsEyeZoom(10, 2);
    expect(result).toBe(12);
  });

  it("applies a negative delta (zoom in)", () => {
    const result = clampBirdsEyeZoom(10, -2);
    expect(result).toBe(8);
  });

  it("clamps to MIN_ZOOM when delta would go below minimum", () => {
    const result = clampBirdsEyeZoom(BIRDS_EYE_MIN_ZOOM, -10);
    expect(result).toBe(BIRDS_EYE_MIN_ZOOM);
  });

  it("clamps to MAX_ZOOM when delta would exceed maximum", () => {
    const result = clampBirdsEyeZoom(BIRDS_EYE_MAX_ZOOM, 10);
    expect(result).toBe(BIRDS_EYE_MAX_ZOOM);
  });

  it("zero delta returns the current value unchanged", () => {
    const current = 12;
    expect(clampBirdsEyeZoom(current, 0)).toBe(current);
  });

  it("result is always within [MIN_ZOOM, MAX_ZOOM]", () => {
    const cases = [-999, -100, -1, 0, 1, 100, 999];
    for (const delta of cases) {
      const result = clampBirdsEyeZoom(10, delta);
      expect(result).toBeGreaterThanOrEqual(BIRDS_EYE_MIN_ZOOM);
      expect(result).toBeLessThanOrEqual(BIRDS_EYE_MAX_ZOOM);
    }
  });

  it("starting at MIN_ZOOM, zooming in further stays at MIN_ZOOM", () => {
    expect(clampBirdsEyeZoom(BIRDS_EYE_MIN_ZOOM, -1)).toBe(BIRDS_EYE_MIN_ZOOM);
  });

  it("starting at MAX_ZOOM, zooming out further stays at MAX_ZOOM", () => {
    expect(clampBirdsEyeZoom(BIRDS_EYE_MAX_ZOOM, 1)).toBe(BIRDS_EYE_MAX_ZOOM);
  });

  it("exact boundary: result equals MIN when sum equals MIN", () => {
    expect(clampBirdsEyeZoom(BIRDS_EYE_MIN_ZOOM + 1, -1)).toBe(BIRDS_EYE_MIN_ZOOM);
  });
});

// ── 3. Zoom semantics — orthographic frustum (3a-3) ───────────────────────────

describe("Zoom semantics (3a-3)", () => {
  /**
   * In OrthographicCamera the frustum half-size (zoom value) controls how
   * many world units are visible.  Increasing zoom = more world shown = zoomed out.
   * Decreasing zoom = less world shown = zoomed in.
   */

  it("positive delta increases frustum (zooms out)", () => {
    const before = 10;
    const after = clampBirdsEyeZoom(before, BIRDS_EYE_ZOOM_STEP);
    expect(after).toBeGreaterThan(before);
  });

  it("negative delta decreases frustum (zooms in)", () => {
    const before = 10;
    const after = clampBirdsEyeZoom(before, -BIRDS_EYE_ZOOM_STEP);
    expect(after).toBeLessThan(before);
  });

  it("key zoom step changes zoom by KEY_ZOOM_STEP or clamps", () => {
    const before = 10;
    const afterIn  = clampBirdsEyeZoom(before, -BIRDS_EYE_KEY_ZOOM_STEP);
    const afterOut = clampBirdsEyeZoom(before, BIRDS_EYE_KEY_ZOOM_STEP);
    expect(afterIn).toBe(before - BIRDS_EYE_KEY_ZOOM_STEP);
    expect(afterOut).toBe(before + BIRDS_EYE_KEY_ZOOM_STEP);
  });
});

// ── 4. clampBirdsEyePan (3a-4) ──────────────────────────────────────────────

describe("clampBirdsEyePan (3a-4)", () => {
  it("applies positive X delta (pan east)", () => {
    const result = clampBirdsEyePan([0, 0], [3, 0]);
    expect(result[0]).toBe(3);
    expect(result[1]).toBe(0);
  });

  it("applies negative X delta (pan west)", () => {
    const result = clampBirdsEyePan([0, 0], [-3, 0]);
    expect(result[0]).toBe(-3);
    expect(result[1]).toBe(0);
  });

  it("applies positive Z delta (pan south)", () => {
    const result = clampBirdsEyePan([0, 0], [0, 3]);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(3);
  });

  it("applies negative Z delta (pan north)", () => {
    const result = clampBirdsEyePan([0, 0], [0, -3]);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(-3);
  });

  it("clamps X to +MAX_PAN when delta would exceed positive boundary", () => {
    const result = clampBirdsEyePan([0, 0], [BIRDS_EYE_MAX_PAN + 10, 0]);
    expect(result[0]).toBe(BIRDS_EYE_MAX_PAN);
  });

  it("clamps X to -MAX_PAN when delta would exceed negative boundary", () => {
    const result = clampBirdsEyePan([0, 0], [-(BIRDS_EYE_MAX_PAN + 10), 0]);
    expect(result[0]).toBe(-BIRDS_EYE_MAX_PAN);
  });

  it("clamps Z to +MAX_PAN when delta would exceed positive boundary", () => {
    const result = clampBirdsEyePan([0, 0], [0, BIRDS_EYE_MAX_PAN + 10]);
    expect(result[1]).toBe(BIRDS_EYE_MAX_PAN);
  });

  it("clamps Z to -MAX_PAN when delta would exceed negative boundary", () => {
    const result = clampBirdsEyePan([0, 0], [0, -(BIRDS_EYE_MAX_PAN + 10)]);
    expect(result[1]).toBe(-BIRDS_EYE_MAX_PAN);
  });

  it("zero delta returns current values unchanged", () => {
    const current: [number, number] = [3.5, -2.1];
    const result = clampBirdsEyePan(current, [0, 0]);
    expect(result[0]).toBeCloseTo(current[0], 6);
    expect(result[1]).toBeCloseTo(current[1], 6);
  });

  it("both axes are independently clamped", () => {
    const result = clampBirdsEyePan([0, 0], [999, -999]);
    expect(result[0]).toBe(BIRDS_EYE_MAX_PAN);
    expect(result[1]).toBe(-BIRDS_EYE_MAX_PAN);
  });

  it("result axes are always within [-MAX_PAN, +MAX_PAN]", () => {
    const cases: [number, number][] = [
      [-999, -999],
      [999, 999],
      [1, -1],
      [0, 0],
    ];
    for (const delta of cases) {
      const result = clampBirdsEyePan([0, 0], delta);
      expect(result[0]).toBeGreaterThanOrEqual(-BIRDS_EYE_MAX_PAN);
      expect(result[0]).toBeLessThanOrEqual(BIRDS_EYE_MAX_PAN);
      expect(result[1]).toBeGreaterThanOrEqual(-BIRDS_EYE_MAX_PAN);
      expect(result[1]).toBeLessThanOrEqual(BIRDS_EYE_MAX_PAN);
    }
  });

  it("clampBirdsEyePan preserves current value when at boundary", () => {
    // At +MAX_PAN, further positive delta stays at boundary
    expect(clampBirdsEyePan([BIRDS_EYE_MAX_PAN, 0], [1, 0])[0]).toBe(BIRDS_EYE_MAX_PAN);
    // At -MAX_PAN, further negative delta stays at boundary
    expect(clampBirdsEyePan([-BIRDS_EYE_MAX_PAN, 0], [-1, 0])[0]).toBe(-BIRDS_EYE_MAX_PAN);
  });

  it("does not mutate the input tuple", () => {
    const input: [number, number] = [5, -5];
    clampBirdsEyePan(input, [2, -2]);
    // Original should be unchanged — clampBirdsEyePan returns a new tuple
    expect(input[0]).toBe(5);
    expect(input[1]).toBe(-5);
  });
});

// ── 5. defaultBirdsEyeView (3a-5) ────────────────────────────────────────────

describe("defaultBirdsEyeView (3a-5)", () => {
  it("returns zoom equal to BIRDS_EYE_DEFAULT_ZOOM", () => {
    const view = defaultBirdsEyeView();
    expect(view.zoom).toBe(BIRDS_EYE_DEFAULT_ZOOM);
  });

  it("returns pan [0, 0] (building center)", () => {
    const view = defaultBirdsEyeView();
    expect(view.pan[0]).toBe(0);
    expect(view.pan[1]).toBe(0);
  });

  it("returned zoom is within valid range [MIN_ZOOM, MAX_ZOOM]", () => {
    const view = defaultBirdsEyeView();
    expect(view.zoom).toBeGreaterThanOrEqual(BIRDS_EYE_MIN_ZOOM);
    expect(view.zoom).toBeLessThanOrEqual(BIRDS_EYE_MAX_ZOOM);
  });

  it("returned pan values satisfy the pan constraint", () => {
    const view = defaultBirdsEyeView();
    expect(Math.abs(view.pan[0])).toBeLessThanOrEqual(BIRDS_EYE_MAX_PAN);
    expect(Math.abs(view.pan[1])).toBeLessThanOrEqual(BIRDS_EYE_MAX_PAN);
  });

  it("calling twice returns independent tuples (immutability)", () => {
    const a = defaultBirdsEyeView();
    const b = defaultBirdsEyeView();
    // Mutating `a` should not affect `b`
    a.pan[0] = 99;
    expect(b.pan[0]).toBe(0);
  });
});

// ── 6. pixelDeltaToWorld (3a-6) ──────────────────────────────────────────────

describe("pixelDeltaToWorld (3a-6)", () => {
  const VIEWPORT_W = 1280;
  const ASPECT = 16 / 9;
  const CURRENT_ZOOM = 10;

  it("returns a tuple of two numbers", () => {
    const result = pixelDeltaToWorld(10, 10, CURRENT_ZOOM, VIEWPORT_W, ASPECT);
    expect(typeof result[0]).toBe("number");
    expect(typeof result[1]).toBe("number");
  });

  it("zero pixel delta returns zero world delta", () => {
    const result = pixelDeltaToWorld(0, 0, CURRENT_ZOOM, VIEWPORT_W, ASPECT);
    expect(result[0]).toBeCloseTo(0, 6);
    expect(result[1]).toBeCloseTo(0, 6);
  });

  it("positive pixelDx produces negative world X (pan direction: right drag = left pan)", () => {
    const [worldX] = pixelDeltaToWorld(100, 0, CURRENT_ZOOM, VIEWPORT_W, ASPECT);
    expect(worldX).toBeLessThan(0);
  });

  it("positive pixelDy produces negative world Z (drag down = pan toward camera)", () => {
    const [, worldZ] = pixelDeltaToWorld(0, 100, CURRENT_ZOOM, VIEWPORT_W, ASPECT);
    expect(worldZ).toBeLessThan(0);
  });

  it("world delta scales linearly with pixel delta", () => {
    const [wx1] = pixelDeltaToWorld(50, 0, CURRENT_ZOOM, VIEWPORT_W, ASPECT);
    const [wx2] = pixelDeltaToWorld(100, 0, CURRENT_ZOOM, VIEWPORT_W, ASPECT);
    expect(wx2).toBeCloseTo(wx1 * 2, 5);
  });

  it("larger zoom (zoomed out) produces smaller world delta for same pixel move", () => {
    const [wxZoomIn]  = pixelDeltaToWorld(50, 0, 5,  VIEWPORT_W, ASPECT);
    const [wxZoomOut] = pixelDeltaToWorld(50, 0, 15, VIEWPORT_W, ASPECT);
    // At higher zoom (more zoomed out), each pixel represents more world space
    expect(Math.abs(wxZoomOut)).toBeGreaterThan(Math.abs(wxZoomIn));
  });

  it("result magnitude is non-zero for non-zero input", () => {
    const [wx, wz] = pixelDeltaToWorld(1, 1, CURRENT_ZOOM, VIEWPORT_W, ASPECT);
    const magnitude = Math.sqrt(wx * wx + wz * wz);
    expect(magnitude).toBeGreaterThan(0);
  });
});

// ── 7. Reset invariant (3a-7) ────────────────────────────────────────────────

describe("Reset invariant (3a-7)", () => {
  /**
   * After a reset, both zoom and pan must satisfy their constraints.
   * This mirrors the spatial-store resetCamera() action which calls
   * defaultBirdsEyeView() and applies the result.
   */
  it("reset zoom passes through clampBirdsEyeZoom without change", () => {
    const { zoom } = defaultBirdsEyeView();
    const clamped = clampBirdsEyeZoom(zoom, 0);
    expect(clamped).toBe(zoom);
  });

  it("reset pan passes through clampBirdsEyePan without change", () => {
    const { pan } = defaultBirdsEyeView();
    const clamped = clampBirdsEyePan(pan, [0, 0]);
    expect(clamped[0]).toBe(pan[0]);
    expect(clamped[1]).toBe(pan[1]);
  });
});

// ── 8. Pan direction step consistency (3a-8) ─────────────────────────────────

describe("Pan direction step consistency (3a-8)", () => {
  /**
   * The 4-direction arrow pad in HUD.tsx uses BIRDS_EYE_KEY_PAN_STEP for each button.
   * Each press should move the view by exactly that step (or clamp at boundary).
   */

  it("single north press moves pan Z by -KEY_PAN_STEP from center", () => {
    const result = clampBirdsEyePan([0, 0], [0, -BIRDS_EYE_KEY_PAN_STEP]);
    expect(result[1]).toBeCloseTo(-BIRDS_EYE_KEY_PAN_STEP, 6);
  });

  it("single south press moves pan Z by +KEY_PAN_STEP from center", () => {
    const result = clampBirdsEyePan([0, 0], [0, BIRDS_EYE_KEY_PAN_STEP]);
    expect(result[1]).toBeCloseTo(BIRDS_EYE_KEY_PAN_STEP, 6);
  });

  it("single east press moves pan X by +KEY_PAN_STEP from center", () => {
    const result = clampBirdsEyePan([0, 0], [BIRDS_EYE_KEY_PAN_STEP, 0]);
    expect(result[0]).toBeCloseTo(BIRDS_EYE_KEY_PAN_STEP, 6);
  });

  it("single west press moves pan X by -KEY_PAN_STEP from center", () => {
    const result = clampBirdsEyePan([0, 0], [-BIRDS_EYE_KEY_PAN_STEP, 0]);
    expect(result[0]).toBeCloseTo(-BIRDS_EYE_KEY_PAN_STEP, 6);
  });

  it("repeated presses accumulate correctly until boundary", () => {
    // Starting from 0, repeatedly press east — should reach MAX_PAN and stop
    let pan: [number, number] = [0, 0];
    const steps = Math.ceil(BIRDS_EYE_MAX_PAN / BIRDS_EYE_KEY_PAN_STEP) + 5; // overshoot
    for (let i = 0; i < steps; i++) {
      pan = clampBirdsEyePan(pan, [BIRDS_EYE_KEY_PAN_STEP, 0]);
    }
    expect(pan[0]).toBe(BIRDS_EYE_MAX_PAN);
  });
});

// ── 9. Entry transition constants (3a-9) ─────────────────────────────────────

describe("Entry transition — smooth switch from perspective (3a-9)", () => {
  /**
   * Sub-AC 3a requires a smooth transition from the default perspective view
   * to bird's-eye mode.  The implementation achieves this by starting the
   * animated zoom at BIRDS_EYE_ENTER_ZOOM (= MAX_ZOOM) when BirdsEyeCamera
   * first mounts, so the camera "zooms in from altitude" over the first few
   * frames rather than snapping immediately to the target zoom.
   */

  it("BIRDS_EYE_ENTER_ZOOM equals MAX_ZOOM (fully zoomed out at entry)", () => {
    expect(BIRDS_EYE_ENTER_ZOOM).toBe(BIRDS_EYE_MAX_ZOOM);
  });

  it("computeBirdsEyeEntryZoom() returns BIRDS_EYE_ENTER_ZOOM", () => {
    expect(computeBirdsEyeEntryZoom()).toBe(BIRDS_EYE_ENTER_ZOOM);
  });

  it("entry zoom is within valid [MIN, MAX] bounds", () => {
    const entry = computeBirdsEyeEntryZoom();
    expect(entry).toBeGreaterThanOrEqual(BIRDS_EYE_MIN_ZOOM);
    expect(entry).toBeLessThanOrEqual(BIRDS_EYE_MAX_ZOOM);
  });

  it("entry zoom is greater than DEFAULT_ZOOM (starts more zoomed out than default)", () => {
    // The transition should start from a wider-than-default view so the
    // lerp animation is visible as a zoom-in effect.
    expect(computeBirdsEyeEntryZoom()).toBeGreaterThan(BIRDS_EYE_DEFAULT_ZOOM);
  });

  it("entry zoom is greater than MIN_ZOOM (ensures lerp has room to zoom in)", () => {
    expect(computeBirdsEyeEntryZoom()).toBeGreaterThan(BIRDS_EYE_MIN_ZOOM);
  });

  it("calling computeBirdsEyeEntryZoom twice returns the same value (pure function)", () => {
    expect(computeBirdsEyeEntryZoom()).toBe(computeBirdsEyeEntryZoom());
  });
});

// ── 10. lerpToward helper (3a-10) ─────────────────────────────────────────────

describe("lerpToward — linear interpolation for camera animation (3a-10)", () => {
  /**
   * lerpToward drives the per-frame camera animation.  It must:
   *   - Move monotonically toward the target
   *   - Not overshoot (t clamped to [0, 1])
   *   - Return exactly target when t >= 1
   *   - Return exactly current when t = 0
   */

  it("t=0 returns current unchanged", () => {
    expect(lerpToward(20, 10, 0)).toBe(20);
  });

  it("t=1 returns target exactly", () => {
    expect(lerpToward(20, 10, 1)).toBe(10);
  });

  it("t=0.5 returns midpoint between current and target", () => {
    expect(lerpToward(20, 10, 0.5)).toBeCloseTo(15, 10);
  });

  it("moves toward target (current > target with positive t)", () => {
    const result = lerpToward(20, 10, 0.3);
    expect(result).toBeLessThan(20);
    expect(result).toBeGreaterThanOrEqual(10);
  });

  it("moves toward target (current < target with positive t)", () => {
    const result = lerpToward(5, 15, 0.3);
    expect(result).toBeGreaterThan(5);
    expect(result).toBeLessThanOrEqual(15);
  });

  it("t > 1 clamps to target (no overshoot)", () => {
    // Overshooting t should not push past target
    const result = lerpToward(20, 10, 2);
    expect(result).toBe(10);
  });

  it("t < 0 clamps to current (no backward movement)", () => {
    const result = lerpToward(20, 10, -0.5);
    expect(result).toBe(20);
  });

  it("entry-zoom to default-zoom lerp makes progress after one typical frame", () => {
    // Simulate one 60fps frame: delta ≈ 1/60, lerp factor = delta * LERP_SPEED
    const deltaSeconds = 1 / 60;
    const t = deltaSeconds * BIRDS_EYE_LERP_SPEED;
    const afterFrame = lerpToward(BIRDS_EYE_ENTER_ZOOM, BIRDS_EYE_DEFAULT_ZOOM, t);
    // Should be closer to default after one frame
    expect(Math.abs(afterFrame - BIRDS_EYE_DEFAULT_ZOOM))
      .toBeLessThan(Math.abs(BIRDS_EYE_ENTER_ZOOM - BIRDS_EYE_DEFAULT_ZOOM));
  });

  it("entry-zoom to default-zoom converges within 2 seconds at LERP_SPEED", () => {
    // Simulate 120 frames (2 seconds at 60fps).
    // After 2 seconds with LERP_SPEED=5, the exponential approach should be
    // within 0.5 units of target (1 - (1 - 1/60 * 5)^120 ≈ 99.98% converged).
    let zoom = BIRDS_EYE_ENTER_ZOOM;
    const target = BIRDS_EYE_DEFAULT_ZOOM;
    const deltaSeconds = 1 / 60;
    for (let frame = 0; frame < 120; frame++) {
      const t = Math.min(1, deltaSeconds * BIRDS_EYE_LERP_SPEED);
      zoom = lerpToward(zoom, target, t);
    }
    expect(Math.abs(zoom - target)).toBeLessThan(0.5);
  });

  it("multiple lerp steps never overshoot target (zoom-in direction)", () => {
    // Starting above target (zoomed out → zoom in)
    let zoom = BIRDS_EYE_ENTER_ZOOM;
    const target = BIRDS_EYE_DEFAULT_ZOOM;
    const deltaSeconds = 1 / 30; // Stress with coarser frames
    for (let frame = 0; frame < 60; frame++) {
      const t = Math.min(1, deltaSeconds * BIRDS_EYE_LERP_SPEED);
      zoom = lerpToward(zoom, target, t);
      // Never overshoot (zoom should stay >= target when approaching from above)
      expect(zoom).toBeGreaterThanOrEqual(target - 1e-10);
    }
  });
});
