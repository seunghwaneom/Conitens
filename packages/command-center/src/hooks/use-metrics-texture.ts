/**
 * use-metrics-texture.ts — React hook: live metrics → THREE.CanvasTexture.
 *
 * Creates an off-screen HTMLCanvasElement, draws the appropriate chart
 * onto it using canvas-charts.ts utilities, wraps it in a
 * THREE.CanvasTexture, and keeps it updated at the surface's configured
 * refresh interval.
 *
 * Sub-AC 6c enhancement:
 *   Each display surface type has its own refresh interval (from
 *   SURFACE_REFRESH_INTERVALS in data-source-config.ts).  A per-surface
 *   setInterval polls the metrics store at that cadence, drawing a fresh
 *   frame and marking texture.needsUpdate = true.
 *
 *   This decouples the draw cadence from the global metrics tick rate
 *   (TICK_MS = 2000ms), letting hologram stands update at 500ms while
 *   replay terminals update only every 5000ms — without any surface
 *   interfering with another.
 *
 * Usage inside a React Three Fiber component:
 *
 *   const texture = useMetricsTexture(
 *     "status-board",   // furniture type
 *     "#4a6aff",        // accent color
 *     1024, 568,        // canvas dimensions
 *     1_000,            // optional: override refresh interval (ms)
 *   );
 *   <meshStandardMaterial map={texture} emissiveMap={texture} emissive="white" emissiveIntensity={0.4} />
 *
 * Lifecycle:
 *   1. useMemo creates the canvas + CanvasTexture once (stable across re-renders).
 *   2. Per-surface setInterval draws at the configured refresh rate.
 *   3. Each draw pulls fresh data from the store via useMetricsStore.getState()
 *      so it always reflects the latest tick without reactive subscriptions.
 *   4. Returns the stable THREE.CanvasTexture reference.
 *
 * Notes:
 *   - The ticker (metrics store) must be started somewhere in the React tree.
 *     See MetricsTicker component below.
 *   - Canvas dimensions should match the screen geometry's aspect ratio:
 *       Monitor screen    : 512 × 320  (≈ 1.63:1)
 *       Wall panel screen : 1024 × 568 (≈ 1.73:1)
 *       Hologram panel    : 256 × 320  (≈ 0.81:1)
 */

import { useMemo, useEffect, useRef } from "react";
import * as THREE from "three";
import { useMetricsStore } from "../store/metrics-store.js";
import {
  FURNITURE_CHART_MAP,
  drawChartForType,
  type ScreenChartType,
  type ChartDataBundle,
} from "../utils/canvas-charts.js";
import {
  SURFACE_REFRESH_INTERVALS,
  DEFAULT_REFRESH_INTERVAL_MS,
} from "../data/data-source-config.js";

// ── Canvas size constants ──────────────────────────────────────────────────

/** Monitor screen canvas (matches 0.88 × 0.54 aspect = 1.63:1) */
export const MONITOR_TEX_W  = 512;
export const MONITOR_TEX_H  = 320;

/** Wall panel screen canvas (matches 1.64 × 0.95 aspect = 1.73:1) */
export const WALLPANEL_TEX_W  = 1024;
export const WALLPANEL_TEX_H  =  568;

/** Hologram panel canvas (matches 0.42 × 0.52 aspect = 0.81:1) */
export const HOLOGRAM_TEX_W = 256;
export const HOLOGRAM_TEX_H = 320;

/** Floor kiosk screen canvas (matches 0.34 × 0.22 aspect ≈ 1.55:1) */
export const KIOSK_TEX_W = 384;
export const KIOSK_TEX_H = 256;

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * useMetricsTexture — returns a live THREE.CanvasTexture for a given
 * furniture slot type and accent colour.
 *
 * The texture redraws at the per-surface interval defined in
 * SURFACE_REFRESH_INTERVALS[furnitureType], or DEFAULT_REFRESH_INTERVAL_MS
 * if the type is not listed.
 *
 * @param furnitureType      Furniture slot type string (e.g. "status-board").
 * @param accentColor        Room accent colour (#rrggbb).
 * @param texW               Canvas width in pixels.
 * @param texH               Canvas height in pixels.
 * @param refreshIntervalMs  Optional override for the refresh cadence (ms).
 *                           When omitted, uses SURFACE_REFRESH_INTERVALS lookup.
 * @returns A stable THREE.CanvasTexture that is redrawn on the configured cadence.
 */
export function useMetricsTexture(
  furnitureType: string,
  accentColor:   string,
  texW: number,
  texH: number,
  refreshIntervalMs?: number,
): THREE.CanvasTexture {
  // --- Create canvas + texture once -----------------------------------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const texture = useMemo<THREE.CanvasTexture>(() => {
    const canvas = document.createElement("canvas");
    canvas.width  = texW;
    canvas.height = texH;
    canvasRef.current = canvas;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
    // Only recreate if the canvas dimensions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texW, texH]);

  // --- Resolve chart type from furniture type ------------------------
  const chartType: ScreenChartType =
    FURNITURE_CHART_MAP[furnitureType] ?? "event-log";

  // --- Resolve effective refresh interval ---------------------------
  // Priority: explicit prop → per-furniture config → global default
  const effectiveRefreshMs = refreshIntervalMs
    ?? SURFACE_REFRESH_INTERVALS[furnitureType]
    ?? DEFAULT_REFRESH_INTERVAL_MS;

  // --- Per-surface interval redraw ----------------------------------
  // We use a setInterval instead of store subscriptions so each surface
  // independently controls its own draw cadence.  The draw function reads
  // the *current* store state at draw time, not a stale captured snapshot.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Pull the latest metrics snapshot from the store at draw time.
      // Using getState() avoids triggering React re-renders and is safe
      // from concurrent rendering since we write only to a canvas element.
      const store = useMetricsStore.getState();

      const data: ChartDataBundle = {
        snap:               store.snapshot,
        cpuHistory:         store.cpuHistory,
        memHistory:         store.memHistory,
        taskQueueHistory:   store.taskQueueHistory,
        throughputHistory:  store.throughputHistory,
        activeAgentHistory: store.activeAgentHistory,
        // Sub-AC 6b: pass rolling latency history for latency-type displays
        latencyHistory:     store.latencyHistory,
      };

      try {
        drawChartForType(ctx, chartType, texW, texH, data, accentColor);
      } catch (err) {
        // Never crash the R3F render loop — just log and leave last frame
        console.warn("[useMetricsTexture] chart draw error:", err);
      }

      texture.needsUpdate = true;
    };

    // Immediate first draw so the surface isn't blank on mount
    draw();

    // Subsequent draws at the per-surface interval
    const timerId = setInterval(draw, effectiveRefreshMs);
    return () => clearInterval(timerId);
  }, [chartType, accentColor, texture, texW, texH, effectiveRefreshMs]);

  return texture;
}

// ── Canvas-size selector helper ────────────────────────────────────────────

/** Display surface kinds from DisplaySurfaces.tsx (duplicated to avoid circular dep) */
type SurfaceKind = "monitor" | "wall-panel" | "hologram-stand" | "floor-kiosk";

/**
 * Choose canvas dimensions for a given display surface kind.
 * Returns [width, height] in pixels.
 */
export function textureSizeForKind(kind: SurfaceKind): [number, number] {
  switch (kind) {
    case "monitor":        return [MONITOR_TEX_W,   MONITOR_TEX_H];
    case "wall-panel":     return [WALLPANEL_TEX_W,  WALLPANEL_TEX_H];
    case "hologram-stand": return [HOLOGRAM_TEX_W,  HOLOGRAM_TEX_H];
    case "floor-kiosk":    return [KIOSK_TEX_W,     KIOSK_TEX_H];
  }
}

// ── MetricsTicker — starts the background metrics ticker ──────────────────

/**
 * MetricsTicker — a zero-render component that starts/stops the metrics
 * sampling ticker.
 *
 * Mount once anywhere in the React tree (e.g., in App.tsx):
 *
 *   import { MetricsTicker } from "./hooks/use-metrics-texture.js";
 *   // inside JSX:
 *   <MetricsTicker />
 *
 * The ticker drives useMetricsStore.tick() at TICK_MS cadence (2 s).
 * Display surfaces draw from the store at their own configurable intervals
 * (via useMetricsTexture's per-surface setInterval).
 */
export function MetricsTicker(): null {
  const startTicking = useMetricsStore(s => s.startTicking);
  const stopTicking  = useMetricsStore(s => s.stopTicking);

  // reuse the useEffect already imported at the top of this file
  useEffect(() => {
    startTicking();
    return () => stopTicking();
  }, [startTicking, stopTicking]);

  return null;
}
