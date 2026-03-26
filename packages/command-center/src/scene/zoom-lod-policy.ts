/**
 * zoom-lod-policy.ts — Zoom-level-aware LOD computation for bird's-eye mode.
 *
 * Sub-AC 3b: Hierarchical scene LOD rendering driven by bird's-eye zoom level.
 *
 * Maps orthographic zoom values to three LOD tiers, per-tier visibility
 * opacities, and label visibility flags.  Together with BirdsEyeLODLayer.tsx
 * this module implements the "zoom-driven progressive reveal" contract:
 *
 *   FAR zoom  (zoom 14–25): building footprint prominent; rooms + agents hidden
 *   MID zoom  (zoom  7–14): floor zones + room cells visible; agents hinted
 *   NEAR zoom (zoom  3– 7): agents prominent; rooms still visible; building recedes
 *
 * ── Orthographic zoom direction ────────────────────────────────────────────────
 *
 * In Three.js OrthographicCamera, a LARGER `zoom` value means a SMALLER frustum
 * half-height (more zoomed in / more detail visible).  This module uses the raw
 * frustum half-size value (as stored in spatial-store.birdsEyeZoom) rather than
 * any re-mapped "zoom level" so callers have a direct mapping from store value to
 * LOD decision.
 *
 * BirdsEyeCamera constants:
 *   BIRDS_EYE_MIN_ZOOM = 3   (closest  — frustum half-height = 3 world units)
 *   BIRDS_EYE_MAX_ZOOM = 25  (farthest — frustum half-height = 25 world units)
 *   BIRDS_EYE_DEFAULT_ZOOM = 10
 *
 * ── Design ─────────────────────────────────────────────────────────────────────
 *
 * All functions in this module are PURE (no React, no Three.js, no store
 * dependencies) so they can be unit-tested without a browser or WebGL context.
 *
 * The zoom-based policy is ORTHOGONAL to the drill-based LOD (lod-drill-policy.ts):
 *   • Drill LOD governs PERSPECTIVE mode detail reveal as the user navigates
 *   • Zoom LOD governs BIRD'S-EYE mode detail reveal as the user scrolls in/out
 *
 * @module scene/zoom-lod-policy
 */

// ── Zoom range constants ───────────────────────────────────────────────────────

/**
 * Orthographic frustum half-size representing the closest (most-zoomed-in) view.
 * Below this value the camera is at maximum zoom; agents are fully visible.
 * Mirrors BIRDS_EYE_MIN_ZOOM in BirdsEyeCamera.tsx.
 */
export const ZOOM_MIN = 3;

/**
 * Orthographic frustum half-size representing the farthest (most-zoomed-out) view.
 * Above this value the camera sees the entire building at bird's-eye altitude.
 * Mirrors BIRDS_EYE_MAX_ZOOM in BirdsEyeCamera.tsx.
 */
export const ZOOM_MAX = 25;

// ── LOD Tier thresholds ────────────────────────────────────────────────────────

/**
 * Zoom thresholds that divide the three LOD tiers.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │  zoom ≤ NEAR_THRESHOLD   →  "near"  (agents prominent + labels)   │
 * │  zoom ≤ MID_THRESHOLD    →  "mid"   (rooms prominent + labels)    │
 * │  zoom >  MID_THRESHOLD   →  "far"   (building overview + label)   │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * Thresholds were tuned so transitions feel natural with DEFAULT_ZOOM = 10:
 *   - Entering bird's-eye at default zoom places the user in MID tier.
 *   - Scrolling out past 14 reveals building overview.
 *   - Scrolling in below 7 reveals agents.
 */
export const ZOOM_NEAR_THRESHOLD = 7;   // ≤7 → NEAR (close-up, agents)
export const ZOOM_MID_THRESHOLD  = 14;  // ≤14 → MID (rooms), >14 → FAR (building)

/**
 * ZOOM_LOD_THRESHOLDS — packed constant for import convenience.
 *
 * Tests and consumers should import these rather than inline magic numbers.
 */
export const ZOOM_LOD_THRESHOLDS = {
  near: ZOOM_NEAR_THRESHOLD,
  mid:  ZOOM_MID_THRESHOLD,
} as const;

// ── LOD level type ─────────────────────────────────────────────────────────────

/**
 * ZoomLODLevel — Discrete detail tier derived from bird's-eye zoom.
 *
 * Mirrors the LODLevel type in lod-drill-policy.ts but is a separate type so
 * callers can distinguish zoom-derived LOD from distance-derived LOD.
 */
export type ZoomLODLevel = "near" | "mid" | "far";

// ── Core computation ───────────────────────────────────────────────────────────

/**
 * computeZoomLODLevel — Maps a raw zoom (frustum half-size) to a ZoomLODLevel.
 *
 * Pure function; no React or Three.js dependencies.
 *
 * @param zoom  Orthographic frustum half-size (store value from birdsEyeZoom).
 *              Larger = more zoomed out.  Expected range: [ZOOM_MIN, ZOOM_MAX].
 * @returns     "near" | "mid" | "far"
 *
 * @example
 *   computeZoomLODLevel(5)   // → "near"  (close-up)
 *   computeZoomLODLevel(10)  // → "mid"   (default / rooms)
 *   computeZoomLODLevel(20)  // → "far"   (building overview)
 */
export function computeZoomLODLevel(zoom: number): ZoomLODLevel {
  if (zoom <= ZOOM_NEAR_THRESHOLD) return "near";
  if (zoom <= ZOOM_MID_THRESHOLD)  return "mid";
  return "far";
}

// ── Per-tier opacity tables ────────────────────────────────────────────────────

/**
 * HierarchyZoomOpacities — Per-hierarchy-tier visibility multipliers at a
 * given ZoomLODLevel.
 *
 * Each field is an opacity multiplier in [0, 1].  Callers should multiply these
 * against the base opacity constants defined in BirdsEyeLODLayer.tsx to produce
 * the final material opacity.
 *
 *   0.0 = tier is hidden at this zoom level (no geometry allocated)
 *   1.0 = tier is shown at full base opacity
 */
export interface HierarchyZoomOpacities {
  /** Building footprint outline (Level 1) */
  building: number;
  /** Office zone fill planes (Level 2) */
  floor: number;
  /** Room cell outlines + fills (Level 3) */
  room: number;
  /** Agent hexagonal markers (Level 4) */
  agent: number;
}

/**
 * ZOOM_HIERARCHY_OPACITIES — Per-ZoomLODLevel opacity multiplier table.
 *
 * Design rationale:
 *   FAR (zoomed out):
 *     Building outline is the primary scope anchor (1.0).
 *     Floor zones provide context (0.65).
 *     Rooms are hinted at very low opacity (0.25).
 *     Agents are hidden (0.0 — too small to be meaningful).
 *
 *   MID (default view):
 *     Building outline recedes but stays visible for context (0.40).
 *     Floor zones are prominent (0.80).
 *     Rooms are fully visible (1.0) — this is the primary detail level.
 *     Agents are hinted (0.45) so the user knows they exist.
 *
 *   NEAR (zoomed in):
 *     Building outline is minimal context (0.20).
 *     Floor zones recede (0.35).
 *     Rooms stay visible for spatial orientation (0.70).
 *     Agents are fully prominent (1.0) — this is the primary detail level.
 */
export const ZOOM_HIERARCHY_OPACITIES: Record<ZoomLODLevel, HierarchyZoomOpacities> = {
  far: {
    building: 1.00,
    floor:    0.65,
    room:     0.25,
    agent:    0.00,
  },
  mid: {
    building: 0.40,
    floor:    0.80,
    room:     1.00,
    agent:    0.45,
  },
  near: {
    building: 0.20,
    floor:    0.35,
    room:     0.70,
    agent:    1.00,
  },
} as const;

// ── Smooth opacity interpolation ───────────────────────────────────────────────

/**
 * ZOOM_MID_POINT — The zoom value at the centre of the MID band.
 *
 * This is the point at which the MID tier opacity table reaches its full
 * expression (e.g. rooms at maximum prominence).  The interpolation passes
 * through NEAR → MID → FAR as zoom increases, with this value as the
 * peak of the MID tier.
 *
 * Set to the midpoint of the NEAR..MID band.
 */
export const ZOOM_MID_POINT = (ZOOM_NEAR_THRESHOLD + ZOOM_MID_THRESHOLD) / 2;

/**
 * computeHierarchyZoomOpacities — Returns opacity multipliers for all
 * hierarchy tiers at a given raw zoom value.
 *
 * Uses piecewise linear interpolation through three LOD tier tables:
 *
 *   Zone 1: zoom ≤ ZOOM_NEAR_THRESHOLD      → NEAR values
 *   Zone 2: NEAR_THRESHOLD < zoom ≤ MID_POINT → lerp(NEAR → MID)
 *   Zone 3: MID_POINT < zoom ≤ MID_THRESHOLD  → lerp(MID → FAR)
 *   Zone 4: zoom > ZOOM_MID_THRESHOLD        → FAR values
 *
 * This ensures the MID tier table is reached at ZOOM_MID_POINT (the centre of
 * the zoom band), so rooms are prominently visible in the middle zoom range
 * and the transitions are smooth in both directions.
 *
 * Pure function; no React or Three.js dependencies.
 *
 * @param zoom  Orthographic frustum half-size (store value).
 * @returns     HierarchyZoomOpacities with smooth per-tier multipliers.
 *
 * @example
 *   // Exactly at MID threshold (zoom = 14): returns FAR values
 *   computeHierarchyZoomOpacities(14)
 *   // At ZOOM_MID_POINT (10.5): returns exact MID values (rooms prominent)
 *   computeHierarchyZoomOpacities(10.5)
 */
export function computeHierarchyZoomOpacities(zoom: number): HierarchyZoomOpacities {
  const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const near = ZOOM_HIERARCHY_OPACITIES.near;
  const mid  = ZOOM_HIERARCHY_OPACITIES.mid;
  const far  = ZOOM_HIERARCHY_OPACITIES.far;

  if (clamped <= ZOOM_NEAR_THRESHOLD) {
    // Zone 1: fully in NEAR tier
    return { ...near };
  }

  if (clamped >= ZOOM_MID_THRESHOLD) {
    // Zone 4: fully in FAR tier
    return { ...far };
  }

  if (clamped <= ZOOM_MID_POINT) {
    // Zone 2: lerp from NEAR to MID
    // t=0 at ZOOM_NEAR_THRESHOLD → NEAR; t=1 at ZOOM_MID_POINT → MID
    const t = (clamped - ZOOM_NEAR_THRESHOLD) / (ZOOM_MID_POINT - ZOOM_NEAR_THRESHOLD);
    return {
      building: lerp(near.building, mid.building, t),
      floor:    lerp(near.floor,    mid.floor,    t),
      room:     lerp(near.room,     mid.room,     t),
      agent:    lerp(near.agent,    mid.agent,    t),
    };
  }

  // Zone 3: lerp from MID to FAR
  // t=0 at ZOOM_MID_POINT → MID; t=1 at ZOOM_MID_THRESHOLD → FAR
  const t = (clamped - ZOOM_MID_POINT) / (ZOOM_MID_THRESHOLD - ZOOM_MID_POINT);
  return {
    building: lerp(mid.building, far.building, t),
    floor:    lerp(mid.floor,    far.floor,    t),
    room:     lerp(mid.room,     far.room,     t),
    agent:    lerp(mid.agent,    far.agent,    t),
  };
}

// ── Label visibility ───────────────────────────────────────────────────────────

/**
 * ZoomLabelVisibility — Which diegetic HTML labels are shown at a given
 * ZoomLODLevel.
 *
 * Labels are only shown when the geometry they annotate is prominent enough
 * to be legible.  Showing a room label when rooms are barely visible (FAR)
 * would create visual clutter without informational benefit.
 */
export interface ZoomLabelVisibility {
  /** Show the building name + floor count label */
  showBuildingLabel: boolean;
  /** Show per-floor zone / department labels */
  showFloorLabels: boolean;
  /** Show per-room type + name labels */
  showRoomLabels: boolean;
  /** Show per-agent name + role labels */
  showAgentLabels: boolean;
}

/**
 * ZOOM_LABEL_VISIBILITY — Label visibility per ZoomLODLevel.
 *
 * FAR:  Building label only — identifies the single building-level entity.
 * MID:  Building (context) + floor + room labels — room grid is primary.
 * NEAR: Room (context) + agent labels — agents are primary.
 */
export const ZOOM_LABEL_VISIBILITY: Record<ZoomLODLevel, ZoomLabelVisibility> = {
  far: {
    showBuildingLabel: true,
    showFloorLabels:   false,
    showRoomLabels:    false,
    showAgentLabels:   false,
  },
  mid: {
    showBuildingLabel: true,
    showFloorLabels:   true,
    showRoomLabels:    true,
    showAgentLabels:   false,
  },
  near: {
    showBuildingLabel: false,
    showFloorLabels:   false,
    showRoomLabels:    true,
    showAgentLabels:   true,
  },
} as const;

/**
 * computeZoomLabelVisibility — Returns label visibility flags for a given
 * raw zoom value.
 *
 * Pure function.  Applies a hysteresis band of ±0.5 zoom units around each
 * threshold to prevent flickering when the camera is right at a boundary.
 *
 * @param zoom  Orthographic frustum half-size.
 * @returns     ZoomLabelVisibility flags.
 */
export function computeZoomLabelVisibility(zoom: number): ZoomLabelVisibility {
  const lod = computeZoomLODLevel(zoom);
  return { ...ZOOM_LABEL_VISIBILITY[lod] };
}

// ── Building-level label content helper ───────────────────────────────────────

/**
 * ZoomBuildingLabelStyle — Visual style class for the building name label,
 * derived from zoom LOD level.
 *
 * FAR  → large, high-contrast (prominent scope anchor at wide view)
 * MID  → medium, subdued (context while rooms are primary)
 * NEAR → not shown (label visibility = false at NEAR)
 */
export type ZoomBuildingLabelStyle = "prominent" | "subdued" | "hidden";

/**
 * computeBuildingLabelStyle — Returns the visual style for the building
 * name label at a given zoom level.
 *
 * Pure function.
 *
 * @param zoom  Orthographic frustum half-size.
 * @returns     "prominent" | "subdued" | "hidden"
 */
export function computeBuildingLabelStyle(zoom: number): ZoomBuildingLabelStyle {
  const lod = computeZoomLODLevel(zoom);
  if (lod === "far")  return "prominent";
  if (lod === "mid")  return "subdued";
  return "hidden";
}

// ── Smooth opacity for a single tier ──────────────────────────────────────────

/**
 * computeTierZoomOpacity — Returns the smoothly-interpolated opacity
 * multiplier for a specific hierarchy tier at a given zoom value.
 *
 * Convenience wrapper around computeHierarchyZoomOpacities that extracts
 * a single tier's value.
 *
 * Pure function.
 *
 * @param tier  Which hierarchy tier: "building" | "floor" | "room" | "agent"
 * @param zoom  Orthographic frustum half-size.
 * @returns     Opacity multiplier in [0, 1].
 */
export function computeTierZoomOpacity(
  tier: keyof HierarchyZoomOpacities,
  zoom: number,
): number {
  return computeHierarchyZoomOpacities(zoom)[tier];
}

// ── Render gate ────────────────────────────────────────────────────────────────

/**
 * shouldRenderZoomTier — Returns true when a hierarchy tier should be
 * rendered at the given zoom level.
 *
 * A tier is rendered when its smoothly-interpolated opacity multiplier
 * exceeds the given threshold (default 0.01 to exclude fully hidden tiers).
 *
 * Pure function.
 *
 * @param tier       Hierarchy tier name
 * @param zoom       Orthographic frustum half-size
 * @param threshold  Minimum opacity multiplier to consider "visible" (default 0.01)
 * @returns          true when opacity > threshold
 */
export function shouldRenderZoomTier(
  tier: keyof HierarchyZoomOpacities,
  zoom: number,
  threshold = 0.01,
): boolean {
  return computeTierZoomOpacity(tier, zoom) > threshold;
}
