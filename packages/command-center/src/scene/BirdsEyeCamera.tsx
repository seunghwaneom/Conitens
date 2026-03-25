/**
 * BirdsEyeCamera — Orthographic top-down camera for the command center.
 *
 * Provides a bird's-eye view positioned above the building with:
 *   - Orthographic projection (no perspective distortion)
 *   - Zoom control via scroll wheel (adjusts frustum size)
 *   - Pan control via middle-mouse drag or shift+left-drag
 *   - Smooth animated transitions when switching to/from this mode
 *   - Room click-to-center navigation
 *   - 'B' key to return to perspective mode
 *
 * Stale-closure–safe: zoom and pan values are read via refs so that
 * high-frequency event handlers (wheel, mousemove) always see the latest
 * store state without needing to be recreated on every state change.
 *
 * All state changes are event-sourced through the spatial store.
 *
 * Sub-AC 3a: Pure-logic constants and helpers are exported so tests and
 * external consumers (HUD, tests) can import them directly without
 * depending on the React component or Three.js context.
 */
import { useRef, useEffect, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import { useSpatialStore } from "../store/spatial-store.js";

// ── Exported pure constants (Sub-AC 3a) ─────────────────────────────
// These drive both the component's runtime behavior and the HUD controls.
// Exporting them allows unit tests to verify constraint invariants
// and the HUD to show sensible step/boundary values without re-declaring.

/** Building center coordinates (derived from building.ts constants) */
export const BIRDS_EYE_BUILDING_W = 12;
export const BIRDS_EYE_BUILDING_D = 6;
export const BIRDS_EYE_BUILDING_CENTER_X = BIRDS_EYE_BUILDING_W / 2;
export const BIRDS_EYE_BUILDING_CENTER_Z = BIRDS_EYE_BUILDING_D / 2;

/** Camera height above the building */
export const BIRDS_EYE_CAMERA_HEIGHT = 30;

/** Orthographic zoom: frustum half-height in world units.
 *  Lower value = zoomed in (less world shown).
 *  Higher value = zoomed out (more world shown). */
export const BIRDS_EYE_MIN_ZOOM = 3;
export const BIRDS_EYE_MAX_ZOOM = 25;
export const BIRDS_EYE_ZOOM_STEP = 0.8;
/** Keyboard zoom step (larger than scroll step for ergonomics) */
export const BIRDS_EYE_KEY_ZOOM_STEP = 1.6;

/** Default zoom level when entering bird's-eye or resetting the view */
export const BIRDS_EYE_DEFAULT_ZOOM = 10;

/** Pan constraints — maximum offset from building center in world units */
export const BIRDS_EYE_MAX_PAN = 15;
/** Keyboard pan step in world units */
export const BIRDS_EYE_KEY_PAN_STEP = 1.5;

/** Smooth interpolation speed (LERP factor per second) */
export const BIRDS_EYE_LERP_SPEED = 5;

/**
 * Starting zoom value used for the bird's-eye entry animation.
 *
 * When switching from perspective → bird's-eye the animated zoom begins
 * here (fully zoomed-out, wide view of the whole building) and lerps toward
 * the store's target zoom level.  This gives a smooth "zoom-in from altitude"
 * entrance effect rather than an instantaneous jump.
 *
 * Equals BIRDS_EYE_MAX_ZOOM so the full range of the zoom animation is
 * traversed on entry — the user sees the building "come into focus".
 */
export const BIRDS_EYE_ENTER_ZOOM = BIRDS_EYE_MAX_ZOOM;

// ── Pure helper functions (Sub-AC 3a) ────────────────────────────────
// Exported for unit testing and reuse (e.g. HUD button handlers).

/**
 * Clamp a new zoom value within [BIRDS_EYE_MIN_ZOOM, BIRDS_EYE_MAX_ZOOM].
 *
 * @param current - Current zoom half-size (frustum half-height)
 * @param delta   - Change to apply (positive = zoom out, negative = zoom in)
 */
export function clampBirdsEyeZoom(current: number, delta: number): number {
  return Math.max(BIRDS_EYE_MIN_ZOOM, Math.min(BIRDS_EYE_MAX_ZOOM, current + delta));
}

/**
 * Clamp a new pan offset within [-BIRDS_EYE_MAX_PAN, +BIRDS_EYE_MAX_PAN] on each axis.
 *
 * @param current - Current [panX, panZ] offset from building center
 * @param delta   - Change to apply [dx, dz]
 */
export function clampBirdsEyePan(
  current: readonly [number, number],
  delta: readonly [number, number],
): [number, number] {
  return [
    Math.max(-BIRDS_EYE_MAX_PAN, Math.min(BIRDS_EYE_MAX_PAN, current[0] + delta[0])),
    Math.max(-BIRDS_EYE_MAX_PAN, Math.min(BIRDS_EYE_MAX_PAN, current[1] + delta[1])),
  ];
}

/**
 * Return the default bird's-eye view state (centered, default zoom).
 * Used by the resetCamera store action and the HUD reset button.
 */
export function defaultBirdsEyeView(): { zoom: number; pan: [number, number] } {
  return { zoom: BIRDS_EYE_DEFAULT_ZOOM, pan: [0, 0] };
}

/**
 * Return the initial animated zoom for the bird's-eye entry animation.
 *
 * The camera starts at this fully-zoomed-out value when switching from
 * perspective mode and lerps toward the target zoom, creating the smooth
 * "zoom in from altitude" transition required by Sub-AC 3a.
 *
 * Pure function — no side-effects — exported for testing.
 */
export function computeBirdsEyeEntryZoom(): number {
  return BIRDS_EYE_ENTER_ZOOM;
}

/**
 * Compute a single linear interpolation step toward a target value.
 *
 * @param current - Current animated value
 * @param target  - Target value to lerp toward
 * @param t       - Interpolation factor in [0, 1] (typically delta * LERP_SPEED)
 * @returns       - New animated value, clamped so it never overshoots past target
 *
 * Exported for unit tests that verify convergence guarantees without needing
 * a running render loop.
 */
export function lerpToward(current: number, target: number, t: number): number {
  return current + (target - current) * Math.min(1, Math.max(0, t));
}

/**
 * Convert pixel mouse delta to world-unit pan delta for the current zoom level.
 *
 * @param pixelDx     - Mouse delta in pixels (X)
 * @param pixelDy     - Mouse delta in pixels (Y)
 * @param currentZoom - Current animated zoom half-size
 * @param viewportW   - Canvas viewport width in pixels
 * @param aspect      - Canvas aspect ratio (width/height)
 */
export function pixelDeltaToWorld(
  pixelDx: number,
  pixelDy: number,
  currentZoom: number,
  viewportW: number,
  aspect: number,
): [number, number] {
  const pixelsPerUnit = viewportW / (currentZoom * 2 * aspect);
  return [-pixelDx / pixelsPerUnit, -pixelDy / pixelsPerUnit];
}

// ── Module-private aliases ──────────────────────────────────────────
// Keep internal references using the original short names for readability.
const BUILDING_CENTER_X = BIRDS_EYE_BUILDING_CENTER_X;
const BUILDING_CENTER_Z = BIRDS_EYE_BUILDING_CENTER_Z;
const CAMERA_HEIGHT = BIRDS_EYE_CAMERA_HEIGHT;
const MIN_ZOOM = BIRDS_EYE_MIN_ZOOM;
const MAX_ZOOM = BIRDS_EYE_MAX_ZOOM;
const ZOOM_STEP = BIRDS_EYE_ZOOM_STEP;
const MAX_PAN = BIRDS_EYE_MAX_PAN;
const LERP_SPEED = BIRDS_EYE_LERP_SPEED;
const ENTER_ZOOM = BIRDS_EYE_ENTER_ZOOM;

interface BirdsEyeCameraProps {
  /** Whether this camera is the active camera */
  active?: boolean;
}

export function BirdsEyeCamera({ active = true }: BirdsEyeCameraProps) {
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const { size, set } = useThree();
  const aspect = size.width / size.height;

  // Read store state
  const zoom = useSpatialStore((s) => s.birdsEyeZoom);
  const pan = useSpatialStore((s) => s.birdsEyePan);
  const setBirdsEyeZoom = useSpatialStore((s) => s.setBirdsEyeZoom);
  const setBirdsEyePan = useSpatialStore((s) => s.setBirdsEyePan);
  const setCameraMode = useSpatialStore((s) => s.setCameraMode);

  // ── Stale-closure–safe refs ───────────────────────────────────────
  // Event handlers (wheel, mousemove, keydown) are attached once and
  // must NOT be recreated on every render — use refs instead of
  // capturing reactive state directly in closures.
  const zoomRef = useRef(zoom);
  const panRef = useRef<[number, number]>(pan);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // Animated state — smoothly interpolate to target values.
  //
  // Sub-AC 3a smooth-transition: currentZoom intentionally starts at
  // ENTER_ZOOM (= MAX_ZOOM, fully zoomed out) rather than the store's
  // target zoom.  On the first frames the lerp will pull currentZoom
  // from the wide-angle entry position toward the target, producing
  // the "zoom in from altitude" transition that satisfies the smooth-
  // transition requirement when switching from perspective → bird's-eye.
  const animState = useRef({
    currentZoom: ENTER_ZOOM,
    targetZoom: zoom,
    currentPanX: 0,
    currentPanZ: 0,
    targetPanX: pan[0],
    targetPanZ: pan[1],
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
  });

  // Sync store changes → animation targets
  useEffect(() => {
    animState.current.targetZoom = zoom;
  }, [zoom]);

  useEffect(() => {
    animState.current.targetPanX = pan[0];
    animState.current.targetPanZ = pan[1];
  }, [pan]);

  // Make this the active camera when active
  useEffect(() => {
    if (active && cameraRef.current) {
      set({ camera: cameraRef.current });
    }
  }, [active, set]);

  // ── Scroll wheel → zoom ────────────────────────────────────────
  // Uses zoomRef (not reactive zoom) to avoid stale closure on fast scroll.

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!active) return;
      e.preventDefault();
      const direction = e.deltaY > 0 ? 1 : -1;
      // Read from ref for latest value without recreating the handler.
      // Uses exported clampBirdsEyeZoom for consistency with tests.
      setBirdsEyeZoom(clampBirdsEyeZoom(zoomRef.current, direction * ZOOM_STEP));
    },
    [active, setBirdsEyeZoom], // zoomRef is intentionally not a dep
  );

  // ── Mouse drag → pan ──────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!active) return;
      // Middle mouse button or shift+left
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        animState.current.isDragging = true;
        animState.current.lastMouseX = e.clientX;
        animState.current.lastMouseY = e.clientY;
      }
    },
    [active],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!active || !animState.current.isDragging) return;
      const dx = e.clientX - animState.current.lastMouseX;
      const dy = e.clientY - animState.current.lastMouseY;
      animState.current.lastMouseX = e.clientX;
      animState.current.lastMouseY = e.clientY;

      // Convert pixel movement to world units based on current zoom level.
      // Use exported pixelDeltaToWorld for consistency with tests.
      const [worldDx, worldDz] = pixelDeltaToWorld(
        dx,
        dy,
        animState.current.currentZoom,
        size.width,
        aspect,
      );

      // Read from panRef for latest pan without recreating this handler.
      // Uses exported clampBirdsEyePan for consistency with tests.
      setBirdsEyePan(clampBirdsEyePan(panRef.current, [worldDx, worldDz]));
    },
    [active, size.width, aspect, setBirdsEyePan], // panRef is intentionally not a dep
  );

  const handleMouseUp = useCallback(() => {
    animState.current.isDragging = false;
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  // Uses zoomRef/panRef for latest values (stale-closure–safe).

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "+":
        case "=":
          // Zoom in: decrease frustum half-size (uses exported step constant)
          setBirdsEyeZoom(clampBirdsEyeZoom(zoomRef.current, -BIRDS_EYE_KEY_ZOOM_STEP));
          break;
        case "-":
        case "_":
          // Zoom out: increase frustum half-size
          setBirdsEyeZoom(clampBirdsEyeZoom(zoomRef.current, BIRDS_EYE_KEY_ZOOM_STEP));
          break;
        case "ArrowLeft":
          setBirdsEyePan(clampBirdsEyePan(panRef.current, [-BIRDS_EYE_KEY_PAN_STEP, 0]));
          e.preventDefault();
          break;
        case "ArrowRight":
          setBirdsEyePan(clampBirdsEyePan(panRef.current, [BIRDS_EYE_KEY_PAN_STEP, 0]));
          e.preventDefault();
          break;
        case "ArrowUp":
          setBirdsEyePan(clampBirdsEyePan(panRef.current, [0, -BIRDS_EYE_KEY_PAN_STEP]));
          e.preventDefault();
          break;
        case "ArrowDown":
          setBirdsEyePan(clampBirdsEyePan(panRef.current, [0, BIRDS_EYE_KEY_PAN_STEP]));
          e.preventDefault();
          break;
        case "Home":
          // Reset to center + default zoom
          setBirdsEyePan([0, 0]);
          setBirdsEyeZoom(BIRDS_EYE_DEFAULT_ZOOM);
          break;
        case "b":
        case "B":
          // Toggle back to perspective orbit camera
          setCameraMode("perspective");
          break;
      }
    },
    [active, setBirdsEyeZoom, setBirdsEyePan, setCameraMode],
    // zoomRef/panRef are intentionally not deps — read via ref at call time
  );

  // ── Attach event listeners ────────────────────────────────────

  useEffect(() => {
    if (!active) return;
    const canvas = document.querySelector("canvas");
    if (!canvas) return;

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown]);

  // ── Per-frame animation ───────────────────────────────────────

  useFrame((_, delta) => {
    if (!active || !cameraRef.current) return;
    const cam = cameraRef.current;
    const a = animState.current;
    const t = Math.min(1, delta * LERP_SPEED);

    // Smoothly interpolate zoom
    a.currentZoom += (a.targetZoom - a.currentZoom) * t;

    // Smoothly interpolate pan
    a.currentPanX += (a.targetPanX - a.currentPanX) * t;
    a.currentPanZ += (a.targetPanZ - a.currentPanZ) * t;

    // Update orthographic frustum
    const halfW = a.currentZoom * aspect;
    const halfH = a.currentZoom;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.updateProjectionMatrix();

    // Position camera above building center + pan offset
    cam.position.set(
      BUILDING_CENTER_X + a.currentPanX,
      CAMERA_HEIGHT,
      BUILDING_CENTER_Z + a.currentPanZ,
    );

    // Look straight down
    cam.lookAt(
      BUILDING_CENTER_X + a.currentPanX,
      0,
      BUILDING_CENTER_Z + a.currentPanZ,
    );
  });

  // Initial frustum setup
  const halfW = zoom * aspect;
  const halfH = zoom;

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault={active}
      position={[BUILDING_CENTER_X + pan[0], CAMERA_HEIGHT, BUILDING_CENTER_Z + pan[1]]}
      left={-halfW}
      right={halfW}
      top={halfH}
      bottom={-halfH}
      near={0.1}
      far={100}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}
