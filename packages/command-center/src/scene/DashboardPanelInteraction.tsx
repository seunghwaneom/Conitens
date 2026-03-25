/**
 * DashboardPanelInteraction.tsx — Diegetic interaction behaviors for dashboard panels.
 *
 * Sub-AC 6c: Hover→expand and click→detail view on the dashboard_panel ui_fixture.
 *
 * ## Interactions
 *
 *   hover → expand
 *     The panel group's scale smoothly LERP-animates from 1.0 to
 *     PANEL_EXPAND_FACTOR (1.06) on pointer-enter, and back to 1.0 on
 *     pointer-leave.  The expansion is applied in the panel's local space so
 *     it grows outward from its own centre without shifting wall contact.
 *
 *   click → detail view
 *     A click opens a `PanelDetailOverlay` — an in-world `Html` panel rendered
 *     in scene coordinates above/in-front of the clicked panel.  The overlay
 *     shows deeper metrics beyond the summary already visible on screen:
 *       · Extended agent status breakdown
 *       · Per-room activity distribution (when available)
 *       · Historical throughput trend label
 *       · Fixture metadata (id, type, room, mount)
 *     A second click, the ESC key, or a close button dismiss the overlay.
 *
 * ## Architecture
 *
 *   InteractiveDashboardPanel        — top-level composition component
 *     ├─ MetricsDashboardPanel       — base 3D geometry + metrics overlay (Sub-AC 6b)
 *     ├─ PanelHoverExpandController  — useFrame scale LERP on parent group
 *     └─ PanelDetailOverlay          — conditional Html detail card (R3F)
 *
 * ## Pure-logic helpers (exported and testable without React)
 *
 *   computeExpandScale(hovered, expandFactor)
 *   lerpValue(current, target, alpha)
 *   computeDetailPanelOffset(facing, forwardDist, upDist)
 *   shouldRevealDetailSection(summary, threshold)
 *   computeHoverGlowMultiplier(hovered, isActive)
 *   buildDetailMetricRows(summary, fixtureId, roomId)
 *
 * ## Event sourcing
 *
 *   fixture.panel_hovered   — recorded on pointer-enter
 *   fixture.panel_unhovered — recorded on pointer-leave
 *   fixture.detail_opened   — recorded when detail view is opened
 *   fixture.detail_closed   — recorded when detail view is dismissed
 *
 * ## Coordinate conventions
 *
 *   Expand animation is in the panel's local group scale — no world-space offset.
 *   Detail overlay position = panel world position + facing-aware offset.
 *   DETAIL_PANEL_FORWARD_OFFSET pushes the card toward the viewer.
 *   DETAIL_PANEL_UP_OFFSET raises it above the panel centre.
 */

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { UiFixtureDef } from "../data/ui-fixture-registry.js";
import { computeScreenDimensions } from "../data/ui-fixture-registry.js";
import { MetricsDashboardPanel, computePanelMetricsSummary, countTerminalTasks } from "./DashboardPanelMetrics.js";
import { PANEL_WALL_Z_OFFSET } from "./DashboardPanel.js";
import { useMetricsBinding } from "../hooks/use-metrics-binding.js";
import { useTaskStore } from "../store/task-store.js";
import { useSceneEventLog } from "../store/scene-event-log.js";
import type { DisplayFacing } from "./DisplaySurfaces.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Target scale factor applied to the panel group on hover.
 * 1.06 = 6 % growth in local space — noticeable but not jarring.
 */
export const PANEL_EXPAND_FACTOR = 1.06;

/**
 * LERP alpha applied each frame for the hover expand / collapse transition.
 * ~0.12 per frame at 60fps ≈ ~150 ms to 95% of target value.
 */
export const PANEL_EXPAND_LERP_ALPHA = 0.12;

/**
 * Forward (viewer-facing) offset of the detail overlay relative to the panel.
 * Units are world-space metres — pushes the card toward the camera.
 */
export const DETAIL_PANEL_FORWARD_OFFSET = 0.45;

/**
 * Upward offset of the detail overlay relative to the panel centre.
 */
export const DETAIL_PANEL_UP_OFFSET = 0.70;

/**
 * distanceFactor for the detail Html overlay.
 * Controls the HTML element's world-space apparent size.
 */
export const DETAIL_PANEL_DIST_FACTOR = 7;

/**
 * Minimum activeAgents count for the detail card to highlight the
 * "currently active" section in an accent colour.
 */
export const DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD = 1;

/**
 * Multiplier applied to the base emissive intensity when a panel is hovered
 * but not yet clicked/active.
 */
export const HOVER_GLOW_MULTIPLIER = 1.35;

// ── Pure-logic helpers ────────────────────────────────────────────────────────

/**
 * Compute the target local-space scale for a panel.
 *
 * Returns `expandFactor` when hovered, `1.0` otherwise.
 *
 * @param hovered     — whether the pointer is over the panel
 * @param expandFactor — scale at full hover (default: PANEL_EXPAND_FACTOR)
 */
export function computeExpandScale(
  hovered: boolean,
  expandFactor: number = PANEL_EXPAND_FACTOR,
): number {
  return hovered ? expandFactor : 1.0;
}

/**
 * Smooth linear interpolation between `current` and `target`.
 *
 * Clamped to [0, 1] alpha range.  Pure — no side effects.
 *
 * @param current — starting value
 * @param target  — destination value
 * @param alpha   — interpolation weight (0 = stays at current, 1 = jumps to target)
 */
export function lerpValue(current: number, target: number, alpha: number): number {
  const a = Math.max(0, Math.min(1, alpha));
  return current + (target - current) * a;
}

/**
 * Compute world-space [x, y, z] offset for the detail panel given a panel facing
 * direction.
 *
 * The panel face direction determines which axis to push along so the overlay
 * appears naturally "above and in front of" the physical surface.
 *
 * @param facing      — panel face direction (DisplayFacing)
 * @param forwardDist — metres toward the viewer (default: DETAIL_PANEL_FORWARD_OFFSET)
 * @param upDist      — metres above the panel centre (default: DETAIL_PANEL_UP_OFFSET)
 */
export function computeDetailPanelOffset(
  facing: DisplayFacing,
  forwardDist: number = DETAIL_PANEL_FORWARD_OFFSET,
  upDist: number = DETAIL_PANEL_UP_OFFSET,
): [number, number, number] {
  // "forward" = away from wall, toward the viewer standing in the room
  switch (facing) {
    case "north": return [0,    upDist,  -forwardDist];  // panel faces south (-Z)
    case "south": return [0,    upDist,   forwardDist];  // panel faces north (+Z)
    case "east":  return [-forwardDist, upDist, 0];       // panel faces west (-X)
    case "west":  return [ forwardDist, upDist, 0];       // panel faces east (+X)
    case "up":    return [0,    upDist * 1.2, forwardDist * 0.5]; // floor-standing
    default:      return [0,    upDist,   forwardDist];
  }
}

/**
 * Decide whether the "active agents" section of the detail card should be
 * rendered with an accent highlight (indicating activity is significant).
 *
 * @param activeAgents      — currently active+busy agent count
 * @param threshold         — minimum to trigger highlight (default: DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD)
 */
export function shouldRevealDetailSection(
  activeAgents: number,
  threshold: number = DETAIL_ACTIVE_HIGHLIGHT_THRESHOLD,
): boolean {
  return activeAgents >= threshold;
}

/**
 * Compute the emissive intensity multiplier to apply when a panel is hovered.
 *
 * Hovered-but-not-active panels glow slightly more than idle panels.
 * Active panels already have their own emissive scale; this applies on top.
 *
 * @param hovered   — whether the pointer is over the panel
 * @param isActive  — whether the panel is currently selected/active
 */
export function computeHoverGlowMultiplier(
  hovered: boolean,
  isActive: boolean,
): number {
  if (isActive) return 1.0;   // active panels handle their own glow in DashboardPanel
  return hovered ? HOVER_GLOW_MULTIPLIER : 1.0;
}

// ── DetailMetricRow — pure data type ─────────────────────────────────────────

/** A single labelled row in the detail card. */
export interface DetailMetricRow {
  label: string;
  value: string | number;
  /** CSS hex color for the value cell */
  color: string;
  /** Optional sub-label (secondary info) */
  subLabel?: string;
}

/**
 * Build the array of metric rows shown in the detail view.
 *
 * This is a pure function — it can be tested without React or R3F.
 *
 * @param summary    — derived summary from computePanelMetricsSummary()
 * @param fixtureId  — fixture identifier (shown as metadata)
 * @param roomId     — room identifier (shown as metadata)
 */
export function buildDetailMetricRows(
  summary: ReturnType<typeof computePanelMetricsSummary>,
  fixtureId: string,
  roomId: string,
): DetailMetricRow[] {
  const rows: DetailMetricRow[] = [
    {
      label: "AGENTS",
      value: summary.agentCount,
      color: summary.activeAgents > 0 ? "#00ff88" : "#8888aa",
      subLabel: `${summary.activeAgents} active · ${summary.idleAgents} idle · ${summary.inactiveAgents} inactive`,
    },
    {
      label: "TASKS PENDING",
      value: summary.taskStatus.pending,
      color: summary.taskStatus.pending > 0 ? "#ffcc00" : "#555577",
    },
    {
      label: "TASKS RUNNING",
      value: summary.taskStatus.running,
      color: summary.taskStatus.running > 0 ? "#00ff88" : "#555577",
    },
    {
      label: "TASKS DONE",
      value: summary.taskStatus.done,
      color: "#4a6aff",
    },
    {
      label: "THROUGHPUT",
      value: summary.eventRateLabel,
      color: "#4a6aff",
    },
    {
      label: "CONNECTION",
      value: summary.connectionStatus.toUpperCase(),
      color:
        summary.connectionStatus === "connected"  ? "#00ff88" :
        summary.connectionStatus === "degraded"   ? "#ffcc00" :
        summary.connectionStatus === "connecting" ? "#ff8800" :
        "#666677",
    },
    {
      label: "FIXTURE",
      value: fixtureId,
      color: "#555577",
    },
    {
      label: "ROOM",
      value: roomId,
      color: "#555577",
    },
  ];

  return rows;
}

// ── Visual constants ──────────────────────────────────────────────────────────

const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

const DETAIL_COLORS = {
  bg:        "rgba(4, 4, 14, 0.96)",
  border:    "#1a1a3a",
  text:      "#b8b8dd",
  textDim:   "#444466",
  textBright:"#eeeeff",
  accent:    "#4a6aff",
  green:     "#00ff88",
  yellow:    "#ffcc00",
  orange:    "#ff8800",
  red:       "#ff4455",
} as const;

// ── PanelDetailOverlay ────────────────────────────────────────────────────────

interface PanelDetailOverlayProps {
  /** Whether the overlay is currently visible */
  isOpen: boolean;
  /** Fixture definition — determines position, style, and content */
  fixture: UiFixtureDef;
  /** Dismiss callback */
  onClose: () => void;
}

/**
 * PanelDetailOverlay — in-world detail card for a dashboard panel.
 *
 * Renders as an R3F `Html` element anchored in 3D world space above and
 * in front of the panel face.  Shows extended metrics beyond the summary
 * overlay already displayed on the panel screen.
 *
 * Dismissed by:
 *   - Clicking the close button
 *   - Pressing ESC (global keyboard listener)
 *   - Clicking outside (stopPropagation guards prevent accidental closure)
 */
const PanelDetailOverlay = memo(function PanelDetailOverlay({
  isOpen,
  fixture,
  onClose,
}: PanelDetailOverlayProps) {
  const binding = useMetricsBinding();
  const tasks   = useTaskStore((s) => s.tasks);

  const summary = computePanelMetricsSummary(
    binding,
    countTerminalTasks(tasks),
  );

  const rows = buildDetailMetricRows(summary, fixture.fixture_id, fixture.room_id);

  // ESC key dismisses
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Panel world position comes from fixture transform (room-local) + PANEL_WALL_Z_OFFSET
  const { x, y, z }     = fixture.transform.position;
  const facing           = fixture.transform.facing;
  const [ox, oy, oz]     = computeDetailPanelOffset(facing);
  const panelPos: [number, number, number] = [x + ox, y + oy, z + oz + PANEL_WALL_Z_OFFSET];

  const accent = fixture.visual.accentColor;
  const highlightActive = shouldRevealDetailSection(summary.activeAgents);

  return (
    <Html
      position={panelPos}
      center
      distanceFactor={DETAIL_PANEL_DIST_FACTOR}
      zIndexRange={[200, 100]}
      style={{ pointerEvents: "none" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          pointerEvents: "auto",
          background: DETAIL_COLORS.bg,
          border: `1px solid ${accent}55`,
          borderRadius: "8px",
          padding: "12px 14px",
          backdropFilter: "blur(10px)",
          boxShadow: `
            0 0 0 1px ${accent}1a,
            0 0 28px ${accent}22,
            0 8px 24px rgba(0,0,0,0.75)
          `,
          width: "240px",
          fontFamily: FONT,
          userSelect: "none",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display:       "flex",
            alignItems:    "center",
            justifyContent:"space-between",
            marginBottom:  "10px",
            paddingBottom: "8px",
            borderBottom:  `1px solid ${accent}33`,
          }}
        >
          <div>
            <div
              style={{
                fontSize:      "10px",
                fontWeight:    700,
                color:         accent,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {fixture.fixture_name}
            </div>
            <div
              style={{
                fontSize:  "7px",
                color:     DETAIL_COLORS.textDim,
                marginTop: "2px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              DETAIL VIEW · {fixture.fixture_type.replace(/_/g, " ")}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{
              background:   "transparent",
              border:       `1px solid ${DETAIL_COLORS.border}`,
              borderRadius: "3px",
              color:        DETAIL_COLORS.textDim,
              fontSize:     "10px",
              cursor:       "pointer",
              padding:      "2px 7px",
              fontFamily:   FONT,
              flexShrink:   0,
            }}
            title="Close detail panel (ESC)"
          >
            ✕
          </button>
        </div>

        {/* ── Active agents highlight ── */}
        {highlightActive && (
          <div
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          "6px",
              marginBottom: "10px",
              padding:      "5px 8px",
              background:   `${DETAIL_COLORS.green}0d`,
              border:       `1px solid ${DETAIL_COLORS.green}33`,
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                width:           "8px",
                height:          "8px",
                borderRadius:    "50%",
                backgroundColor: DETAIL_COLORS.green,
                boxShadow:       `0 0 6px ${DETAIL_COLORS.green}`,
                flexShrink:      0,
              }}
            />
            <span
              style={{
                fontSize:      "9px",
                color:         DETAIL_COLORS.green,
                fontWeight:    700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {summary.activeAgents} AGENT{summary.activeAgents !== 1 ? "S" : ""} ACTIVE
            </span>
          </div>
        )}

        {/* ── Metric rows ── */}
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            gap:           "3px",
            marginBottom:  "10px",
          }}
        >
          {rows.map((row) => (
            <div
              key={row.label}
              style={{
                display:        "flex",
                alignItems:     "flex-start",
                justifyContent: "space-between",
                gap:            "8px",
                padding:        "3px 5px",
                background:     "rgba(10,10,28,0.6)",
                borderRadius:   "2px",
                border:         `1px solid ${DETAIL_COLORS.border}`,
              }}
            >
              <div style={{ flex: "0 0 auto" }}>
                <div
                  style={{
                    fontSize:      "6px",
                    color:         DETAIL_COLORS.textDim,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                  }}
                >
                  {row.label}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize:      "9px",
                    fontWeight:    700,
                    color:         row.color,
                    letterSpacing: "0.04em",
                    wordBreak:     "break-all",
                  }}
                >
                  {row.value}
                </div>
                {row.subLabel && (
                  <div
                    style={{
                      fontSize:      "5.5px",
                      color:         `${row.color}88`,
                      marginTop:     "1px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {row.subLabel}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            fontSize:      "6px",
            color:         DETAIL_COLORS.textDim,
            textAlign:     "center",
            letterSpacing: "0.08em",
          }}
        >
          PRESS ESC OR CLICK ✕ TO DISMISS
        </div>
      </div>
    </Html>
  );
});

// ── PanelHoverExpandController ────────────────────────────────────────────────

interface PanelHoverExpandControllerProps {
  /** Ref to the group whose scale will be animated */
  groupRef: React.RefObject<THREE.Group | null>;
  /** Whether the pointer is currently over the panel */
  hovered: boolean;
  /** Base scale from the fixture transform */
  baseScale: { x: number; y: number; z: number };
  /** Expand factor (default: PANEL_EXPAND_FACTOR) */
  expandFactor?: number;
  /** LERP alpha per frame (default: PANEL_EXPAND_LERP_ALPHA) */
  lerpAlpha?: number;
}

/**
 * PanelHoverExpandController — animates the panel group's scale on hover.
 *
 * Renders nothing visually — purely drives a `useFrame` animation loop
 * that LERP-interpolates the group's local scale between `1.0` and
 * `expandFactor`.
 *
 * Separated from the visual panel component so the animation logic can
 * be swapped or extended without touching DashboardPanel geometry.
 */
function PanelHoverExpandController({
  groupRef,
  hovered,
  baseScale,
  expandFactor = PANEL_EXPAND_FACTOR,
  lerpAlpha    = PANEL_EXPAND_LERP_ALPHA,
}: PanelHoverExpandControllerProps) {
  const currentScaleRef = useRef(1.0);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const target  = computeExpandScale(hovered, expandFactor);
    const updated = lerpValue(currentScaleRef.current, target, lerpAlpha);
    currentScaleRef.current = updated;

    group.scale.set(
      baseScale.x * updated,
      baseScale.y * updated,
      baseScale.z * updated,
    );
  });

  return null; // pure animation controller — no visual output
}

// ── InteractiveDashboardPanel ─────────────────────────────────────────────────

export interface InteractiveDashboardPanelProps {
  /** Full fixture definition from the registry */
  fixture: UiFixtureDef;
  /** Whether this panel is currently selected (active highlight) */
  isActive?: boolean;
  /** Selection callback — receives fixture_id */
  onSelect?: (fixtureId: string) => void;
}

/**
 * InteractiveDashboardPanel — dashboard panel with hover-expand and click-detail.
 *
 * Composition:
 *   - MetricsDashboardPanel: base 3D geometry + live metrics overlay (Sub-AC 6b)
 *   - PanelHoverExpandController: scale LERP animation on hover
 *   - PanelDetailOverlay: in-world Html detail card on click
 *
 * Interaction flow:
 *   1. Pointer enters panel → `hovered` = true → expand animation starts
 *   2. Pointer leaves  panel → `hovered` = false → collapse animation starts
 *   3. Pointer clicks  panel → `detailOpen` toggles
 *   4. ESC or close button  → `detailOpen` = false
 *
 * All interactions are event-sourced through the scene event log.
 */
export const InteractiveDashboardPanel = memo(function InteractiveDashboardPanel({
  fixture,
  isActive = false,
  onSelect,
}: InteractiveDashboardPanelProps) {
  const [hovered,    setHovered]    = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const groupRef = useRef<THREE.Group>(null);
  const recordEntry = useSceneEventLog((s) => s.recordEntry);

  const { t, r } = {
    t: fixture.transform.position,
    r: fixture.transform.rotation,
  };

  // Record fixture.panel_hovered
  const handlePointerEnter = useCallback(() => {
    setHovered(true);
    recordEntry({
      ts:       Date.now(),
      category: "surface.clicked",
      source:   "system",
      payload:  {
        event_type:    "fixture.panel_hovered",
        fixture_id:    fixture.fixture_id,
        room_id:       fixture.room_id,
        trigger_source:"direct",
        ts_ms:         Date.now(),
      },
    });
  }, [fixture.fixture_id, fixture.room_id, recordEntry]);

  // Record fixture.panel_unhovered
  const handlePointerLeave = useCallback(() => {
    setHovered(false);
    recordEntry({
      ts:       Date.now(),
      category: "surface.dismissed",
      source:   "system",
      payload:  {
        event_type:    "fixture.panel_unhovered",
        fixture_id:    fixture.fixture_id,
        room_id:       fixture.room_id,
        trigger_source:"direct",
        ts_ms:         Date.now(),
      },
    });
  }, [fixture.fixture_id, fixture.room_id, recordEntry]);

  // Toggle detail view on click
  const handleClick = useCallback(() => {
    const nextOpen = !detailOpen;
    setDetailOpen(nextOpen);

    recordEntry({
      ts:       Date.now(),
      category: "surface.clicked",
      source:   "system",
      payload:  {
        event_type:    nextOpen ? "fixture.detail_opened" : "fixture.detail_closed",
        fixture_id:    fixture.fixture_id,
        room_id:       fixture.room_id,
        trigger_source:"direct",
        ts_ms:         Date.now(),
      },
    });

    // Forward to parent selection handler as well
    onSelect?.(fixture.fixture_id);
  }, [detailOpen, fixture.fixture_id, fixture.room_id, onSelect, recordEntry]);

  // Dismiss callback for detail overlay
  const handleDetailClose = useCallback(() => {
    setDetailOpen(false);
    recordEntry({
      ts:       Date.now(),
      category: "surface.dismissed",
      source:   "system",
      payload:  {
        event_type:    "fixture.detail_closed",
        fixture_id:    fixture.fixture_id,
        room_id:       fixture.room_id,
        trigger_source:"direct",
        ts_ms:         Date.now(),
      },
    });
  }, [fixture.fixture_id, fixture.room_id, recordEntry]);

  const { screenW } = computeScreenDimensions(fixture.visual.width, fixture.visual.height);
  const baseScale   = fixture.transform.scale;

  return (
    <group
      ref={groupRef}
      name={`interactive-panel-${fixture.fixture_id}`}
      position={[t.x, t.y, t.z + PANEL_WALL_Z_OFFSET]}
      rotation={[r.x, r.y, r.z]}
      scale={[baseScale.x, baseScale.y, baseScale.z]}
    >
      {/* Hover expand LERP controller (headless, drives groupRef scale) */}
      <PanelHoverExpandController
        groupRef={groupRef}
        hovered={hovered || detailOpen}
        baseScale={baseScale}
      />

      {/* Base panel: low-poly geometry + metrics overlay (Sub-AC 6a + 6b)
          Position reset to [0,0,0] because the parent group already applies t */}
      <MetricsDashboardPanel
        fixture={{
          ...fixture,
          transform: {
            ...fixture.transform,
            position: { x: 0, y: 0, z: 0 },
          },
        }}
        isActive={isActive || detailOpen}
        onSelect={handleClick}
      />

      {/* Invisible click/hover capture mesh covering the full panel face */}
      <mesh
        position={[0, 0, 0.001]}
        onPointerEnter={(e) => { e.stopPropagation(); handlePointerEnter(); }}
        onPointerLeave={(e) => { e.stopPropagation(); handlePointerLeave(); }}
        onClick={(e) => { e.stopPropagation(); handleClick(); }}
      >
        <planeGeometry args={[fixture.visual.width, fixture.visual.height]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* In-world detail overlay (shown on click) */}
      <PanelDetailOverlay
        isOpen={detailOpen}
        fixture={{
          ...fixture,
          transform: {
            ...fixture.transform,
            position: { x: 0, y: 0, z: 0 },
          },
        }}
        onClose={handleDetailClose}
      />
    </group>
  );
});

// ── InteractiveDashboardPanelLayer ────────────────────────────────────────────

import { getFixturesForRoom } from "../data/ui-fixture-registry.js";

export interface InteractiveDashboardPanelLayerProps {
  /** World-space origin of the containing room */
  roomOrigin: { x: number; y: number; z: number };
  /** Room identifier — only fixtures in this room are rendered */
  roomId: string;
  /** Currently selected fixture_id (for highlight) */
  selectedFixtureId?: string | null;
  /** Selection callback */
  onSelect?: (fixtureId: string) => void;
}

/**
 * InteractiveDashboardPanelLayer — renders all interactive panels for a room.
 *
 * Drop-in replacement for `DashboardPanelLayer` — same API, adds hover+click
 * interaction behaviors.
 */
export const InteractiveDashboardPanelLayer = memo(function InteractiveDashboardPanelLayer({
  roomOrigin,
  roomId,
  selectedFixtureId,
  onSelect,
}: InteractiveDashboardPanelLayerProps) {
  const fixtures = getFixturesForRoom(roomId).filter(
    (f) => f.fixture_type === "dashboard_panel",
  );

  if (fixtures.length === 0) return null;

  return (
    <group
      name={`interactive-panel-layer-${roomId}`}
      position={[roomOrigin.x, roomOrigin.y, roomOrigin.z]}
    >
      {fixtures.map((fixture) => (
        <InteractiveDashboardPanel
          key={fixture.fixture_id}
          fixture={fixture}
          isActive={selectedFixtureId === fixture.fixture_id}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
});
