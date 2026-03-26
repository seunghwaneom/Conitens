/**
 * DashboardPanelMetrics.tsx — Live metrics wiring for dashboard_panel surfaces.
 *
 * Sub-AC 6b: Wire live metrics data to the dashboard panel surface.
 *
 * Queries and displays:
 *   - Agent count (total, active, idle breakdown)
 *   - Task status summary (pending / running / done)
 *   - Event rate (events per tick, formatted for display)
 *
 * The component renders an HTML overlay on top of the 3D panel screen face
 * using React Three Fiber's <Html> component, updating in real time from
 * the metrics-store and task-store.
 *
 * Architecture
 * ────────────
 *   PanelMetricsOverlay         — R3F component rendered as Html overlay
 *     └─ uses useMetricsBinding() → reactive metric data binding
 *     └─ uses useTaskStore()       → terminal task count for "done" bucket
 *
 *   MetricsDashboardPanel       — DashboardPanel extended with metrics overlay
 *     └─ DashboardPanel          — existing low-poly 3D panel geometry
 *     └─ PanelMetricsOverlay     — HTML content on the screen face
 *
 * Pure-logic helpers (exported and testable without React):
 *   formatEventRate()            — "12 ev/t", "0 ev/t", etc.
 *   computeTaskStatusCounts()   — { pending, running, done } from agent/task data
 *   computePanelMetricsSummary()— full derived metrics object
 *
 * Coordinate conventions
 * ──────────────────────
 * The overlay is positioned at z = SCREEN_Z_OFFSET * 2 (just in front of the
 * screen face) with distanceFactor matching the panel screen size so the HTML
 * scales proportionally as the camera zooms in/out.
 *
 * Event sourcing
 * ──────────────
 * This component is read-only — it never writes to any store or emits events.
 * All data flows from the stores into the display surface (write-only principle).
 *
 * Performance
 * ───────────
 * useMetricsBinding() is memoised and only triggers re-renders on TICK_MS
 * boundaries (every 2 s).  The Html component is occluded by the parent
 * panel geometry so it only renders when the panel faces the camera.
 */

import { memo, useMemo } from "react";
import { Html }           from "@react-three/drei";
import {
  type UiFixtureDef,
  DEFAULT_UI_FIXTURES,
  getFixturesForRoom,
} from "../data/ui-fixture-registry.js";
import {
  useMetricsBinding,
  type MetricsBinding,
  type AgentStatusSnapshot,
} from "../hooks/use-metrics-binding.js";
import { useTaskStore } from "../store/task-store.js";
import {
  SCREEN_Z_OFFSET,
  PANEL_WALL_Z_OFFSET,
  DashboardPanel,
  filterDashboardPanelFixtures,
  collectDashboardPanelRoomIds,
} from "./DashboardPanel.js";
import type { DataSourceMode } from "../data/data-source-config.js";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * HTML distanceFactor for the metrics overlay.
 *
 * Chosen so that the overlay text is legible at the default overview camera
 * distance (~10 world units) and scales gracefully on drill-in.
 * Lower = larger text at overview distance.
 */
export const PANEL_METRICS_DIST_FACTOR = 14;

/**
 * Maximum event rate value treated as 100% for display normalisation.
 * Events above this scale show a ">" prefix to indicate saturation.
 */
export const EVENT_RATE_DISPLAY_MAX = 99;

// ── Types ────────────────────────────────────────────────────────────────────

/** Derived task status counts for the panel summary. */
export interface PanelTaskStatusCounts {
  /** Tasks not yet executing (queue depth proxy from metrics-store). */
  pending: number;
  /** Tasks actively executing (active + busy agent count proxy). */
  running: number;
  /** Tasks in a terminal state (done + failed + cancelled from task-store). */
  done: number;
}

/** Complete derived metrics summary for a single dashboard panel. */
export interface PanelMetricsSummary {
  /** Total registered agents. */
  agentCount: number;
  /** Currently active + busy agents. */
  activeAgents: number;
  /** Idle agents. */
  idleAgents: number;
  /** Inactive (not yet started) agents. */
  inactiveAgents: number;
  /** Task status breakdown. */
  taskStatus: PanelTaskStatusCounts;
  /** Raw event throughput (events per tick from metrics snapshot). */
  eventRate: number;
  /** Formatted event rate label, e.g. "12 ev/t". */
  eventRateLabel: string;
  /** Whether data comes from a live orchestrator connection. */
  isLive: boolean;
  /** Connection mode string for display. */
  connectionStatus: DataSourceMode;
}

// ── Pure-logic helpers ────────────────────────────────────────────────────────

/**
 * Format an event-rate (events per tick) into a compact label.
 *
 * Examples:
 *   formatEventRate(12)  → "12 ev/t"
 *   formatEventRate(0)   → "0 ev/t"
 *   formatEventRate(105) → ">99 ev/t"  (capped at display max)
 *
 * @param eventsPerTick - raw throughput value from metrics snapshot
 */
export function formatEventRate(eventsPerTick: number): string {
  const v = Math.max(0, Math.round(eventsPerTick));
  if (v > EVENT_RATE_DISPLAY_MAX) return `>${EVENT_RATE_DISPLAY_MAX} ev/t`;
  return `${v} ev/t`;
}

/**
 * Derive task status counts from agent status and terminal task tally.
 *
 * Mapping:
 *   pending  = metrics-store task queue depth (unstarted tasks waiting)
 *   running  = active + busy agent count (each busy agent has a running task)
 *   done     = count of terminal-state tasks from task-store
 *
 * @param agentStatus  - agent status snapshot from metrics binding
 * @param taskQueue    - current queue depth from metrics snapshot
 * @param doneCount    - terminal task count from task-store
 */
export function computeTaskStatusCounts(
  agentStatus: Pick<AgentStatusSnapshot, "active" | "busy">,
  taskQueue: number,
  doneCount: number,
): PanelTaskStatusCounts {
  return {
    pending: Math.max(0, Math.round(taskQueue)),
    running: agentStatus.active + agentStatus.busy,
    done:    Math.max(0, doneCount),
  };
}

/**
 * Assemble a complete `PanelMetricsSummary` from the metrics binding and
 * a terminal task count.
 *
 * This is the single pure derivation function — all display logic reads
 * from here, so tests only need to cover this function and the formatters.
 *
 * @param binding        - reactive metrics binding from useMetricsBinding()
 * @param terminalTasks  - count of tasks in a terminal state (done/failed/cancelled)
 */
export function computePanelMetricsSummary(
  binding: Pick<
    MetricsBinding,
    | "agentStatus"
    | "taskQueueDepth"
    | "throughputRaw"
    | "isLive"
    | "connectionStatus"
  >,
  terminalTasks: number,
): PanelMetricsSummary {
  const { agentStatus, taskQueueDepth, throughputRaw, isLive, connectionStatus } = binding;

  const taskStatus = computeTaskStatusCounts(agentStatus, taskQueueDepth, terminalTasks);

  return {
    agentCount:    agentStatus.total,
    activeAgents:  agentStatus.active + agentStatus.busy,
    idleAgents:    agentStatus.idle,
    inactiveAgents: agentStatus.inactive,
    taskStatus,
    eventRate:      Math.max(0, Math.round(throughputRaw)),
    eventRateLabel: formatEventRate(throughputRaw),
    isLive,
    connectionStatus,
  };
}

/**
 * Count terminal-state tasks from the task-store record map.
 *
 * "Terminal" includes: done, failed, cancelled.
 * This is read from the task-store at render time — not from metrics-store.
 */
export function countTerminalTasks(
  tasks: Record<string, { status: string }>,
): number {
  let count = 0;
  for (const t of Object.values(tasks)) {
    if (t.status === "done" || t.status === "failed" || t.status === "cancelled") {
      count++;
    }
  }
  return count;
}

// ── Visual constants ─────────────────────────────────────────────────────────

const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

const METRIC_COLORS = {
  bg:        "rgba(2, 2, 16, 0.93)",
  border:    "#1a1a3a",
  accent:    "#4a6aff",
  green:     "#00ff88",
  yellow:    "#ffcc00",
  orange:    "#ff8800",
  red:       "#ff4455",
  text:      "#b8b8dd",
  textDim:   "#555577",
  textBright:"#eeeeff",
} as const;

// ── Sub-components ────────────────────────────────────────────────────────────

/** A single KPI metric tile (label + value). */
function MetricTile({
  label,
  value,
  color,
  subLabel,
}: {
  label: string;
  value: string | number;
  color: string;
  subLabel?: string;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 1,
      padding: "3px 5px",
      background: "rgba(10,10,28,0.85)",
      border:     `1px solid ${color}28`,
      borderRadius: 2,
      minWidth: 38,
    }}>
      <span style={{
        fontSize:    11,
        fontWeight:  700,
        color,
        fontFamily:  FONT,
        lineHeight:  1,
        letterSpacing: "0.03em",
      }}>
        {value}
      </span>
      <span style={{
        fontSize:    5,
        color:       METRIC_COLORS.textDim,
        fontFamily:  FONT,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      {subLabel && (
        <span style={{
          fontSize:    4,
          color:       `${color}88`,
          fontFamily:  FONT,
          letterSpacing: "0.08em",
        }}>
          {subLabel}
        </span>
      )}
    </div>
  );
}

/** Compact horizontal task status bar (pending / running / done). */
function TaskStatusBar({
  pending,
  running,
  done,
}: PanelTaskStatusCounts) {
  const total = pending + running + done;

  return (
    <div style={{
      display: "flex",
      alignItems: "stretch",
      gap: 1,
      width: "100%",
      marginTop: 2,
    }}>
      {/* Pending */}
      <div style={{
        flex:       1,
        display:    "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        padding:    "2px 0",
        background: `${METRIC_COLORS.yellow}14`,
        borderRadius: "2px 0 0 2px",
        border:     `1px solid ${METRIC_COLORS.yellow}33`,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: METRIC_COLORS.yellow, fontFamily: FONT }}>
          {pending}
        </span>
        <span style={{ fontSize: 4, color: METRIC_COLORS.textDim, fontFamily: FONT, letterSpacing: "0.1em" }}>
          PEND
        </span>
      </div>
      {/* Running */}
      <div style={{
        flex:       1,
        display:    "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        padding:    "2px 0",
        background: `${METRIC_COLORS.green}14`,
        border:     `1px solid ${METRIC_COLORS.green}33`,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: METRIC_COLORS.green, fontFamily: FONT }}>
          {running}
        </span>
        <span style={{ fontSize: 4, color: METRIC_COLORS.textDim, fontFamily: FONT, letterSpacing: "0.1em" }}>
          RUN
        </span>
      </div>
      {/* Done */}
      <div style={{
        flex:       1,
        display:    "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        padding:    "2px 0",
        background: `${METRIC_COLORS.accent}14`,
        borderRadius: "0 2px 2px 0",
        border:     `1px solid ${METRIC_COLORS.accent}33`,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: METRIC_COLORS.accent, fontFamily: FONT }}>
          {done}
        </span>
        <span style={{ fontSize: 4, color: METRIC_COLORS.textDim, fontFamily: FONT, letterSpacing: "0.1em" }}>
          DONE
        </span>
      </div>

      {/* Total pill */}
      {total > 0 && (
        <div style={{
          padding:    "2px 4px",
          background: "rgba(10,10,28,0.8)",
          borderRadius: 2,
          border:     `1px solid ${METRIC_COLORS.border}`,
          display:    "flex",
          alignItems: "center",
          marginLeft: 2,
        }}>
          <span style={{ fontSize: 5, color: METRIC_COLORS.textDim, fontFamily: FONT }}>
            {total} ttl
          </span>
        </div>
      )}
    </div>
  );
}

// ── PanelMetricsOverlay ───────────────────────────────────────────────────────

interface PanelMetricsOverlayProps {
  /** Screen width in world units — used to compute distanceFactor scaling. */
  screenW: number;
  /** Accent color from the parent fixture's visual config. */
  accentColor: string;
  /** Z position in parent group space (should be just in front of screen face). */
  zOffset?: number;
}

/**
 * PanelMetricsOverlay — HTML content layer for a dashboard panel surface.
 *
 * Renders agent count, task status summary (pending/running/done), and
 * event rate as HTML text on the panel screen face using R3F Html.
 *
 * Must be rendered as a child of the panel's parent group so it inherits
 * the panel's rotation and position transforms.
 */
export const PanelMetricsOverlay = memo(function PanelMetricsOverlay({
  screenW,
  accentColor,
  zOffset = SCREEN_Z_OFFSET * 2,
}: PanelMetricsOverlayProps) {
  // ── Store subscriptions ────────────────────────────────────────────────
  const binding = useMetricsBinding();

  // Terminal task count from task-store
  const tasks = useTaskStore((s) => s.tasks);
  const terminalTaskCount = useMemo(() => countTerminalTasks(tasks), [tasks]);

  // ── Derived metrics ────────────────────────────────────────────────────
  const summary = useMemo(
    () => computePanelMetricsSummary(binding, terminalTaskCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      binding.agentStatus.total,
      binding.agentStatus.active,
      binding.agentStatus.busy,
      binding.agentStatus.idle,
      binding.agentStatus.inactive,
      binding.taskQueueDepth,
      binding.throughputRaw,
      binding.isLive,
      binding.connectionStatus,
      terminalTaskCount,
    ],
  );

  // ── Connection status styling ──────────────────────────────────────────
  const connColor =
    summary.connectionStatus === "connected"  ? METRIC_COLORS.green  :
    summary.connectionStatus === "degraded"   ? METRIC_COLORS.yellow :
    summary.connectionStatus === "connecting" ? METRIC_COLORS.orange :
    METRIC_COLORS.textDim;

  const connLabel =
    summary.connectionStatus === "connected"  ? "LIVE" :
    summary.connectionStatus === "degraded"   ? "DEG"  :
    summary.connectionStatus === "connecting" ? "CONN" :
    "EST";

  // Agent color: red if many inactive, green if active
  const agentColor =
    summary.activeAgents > 0 ? METRIC_COLORS.green :
    summary.agentCount === 0 ? METRIC_COLORS.textDim :
    METRIC_COLORS.yellow;

  // ── distanceFactor: scale HTML so it fits the panel screen area ────────
  // A larger screenW → smaller distanceFactor (HTML takes more screen real estate)
  const distFactor = Math.max(8, Math.round(PANEL_METRICS_DIST_FACTOR / Math.max(0.4, screenW)));

  // Panel width in px — HTML is sized to match a 1:1 screen aspect
  const htmlPxW = Math.round(screenW * 100);

  return (
    <Html
      center
      distanceFactor={distFactor}
      position={[0, 0, zOffset]}
      style={{ pointerEvents: "none", userSelect: "none" }}
      zIndexRange={[11, 21]}
    >
      <div style={{
        width:      htmlPxW,
        minWidth:   80,
        maxWidth:   220,
        fontFamily: FONT,
        background: METRIC_COLORS.bg,
        border:     `1px solid ${accentColor}44`,
        borderRadius: 3,
        overflow:   "hidden",
        boxShadow:  `0 0 8px ${accentColor}22`,
        padding:    "4px 5px 5px",
        display:    "flex",
        flexDirection: "column",
        gap: 3,
      }}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{
          display:    "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 2,
          borderBottom: `1px solid ${METRIC_COLORS.border}`,
        }}>
          <span style={{
            fontSize:    6,
            fontWeight:  700,
            color:       METRIC_COLORS.textBright,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}>
            SYSTEM
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: connColor,
              boxShadow: `0 0 4px ${connColor}`,
            }} />
            <span style={{
              fontSize: 5,
              color:    connColor,
              fontFamily: FONT,
              letterSpacing: "0.08em",
            }}>
              {connLabel}
            </span>
          </div>
        </div>

        {/* ── Agent count row ─────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 3, alignItems: "stretch" }}>
          <MetricTile
            label="AGENTS"
            value={summary.agentCount}
            color={agentColor}
            subLabel={summary.activeAgents > 0 ? `${summary.activeAgents} act` : undefined}
          />
          <MetricTile
            label="IDLE"
            value={summary.idleAgents}
            color={METRIC_COLORS.text}
          />
          <MetricTile
            label="EV/T"
            value={summary.eventRateLabel}
            color={METRIC_COLORS.accent}
          />
        </div>

        {/* ── Task status bar ──────────────────────────────────────── */}
        <div>
          <span style={{
            fontSize:    4,
            color:       METRIC_COLORS.textDim,
            fontFamily:  FONT,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}>
            TASKS
          </span>
          <TaskStatusBar
            pending={summary.taskStatus.pending}
            running={summary.taskStatus.running}
            done={summary.taskStatus.done}
          />
        </div>
      </div>
    </Html>
  );
});

// ── MetricsDashboardPanel ─────────────────────────────────────────────────────

export interface MetricsDashboardPanelProps {
  /** Full fixture definition from the registry */
  fixture: UiFixtureDef;
  /** Whether this panel is currently selected */
  isActive?: boolean;
  /** Click callback — receives fixture_id */
  onSelect?: (fixtureId: string) => void;
}

/**
 * MetricsDashboardPanel — DashboardPanel extended with live metrics overlay.
 *
 * Renders the standard low-poly 3D panel geometry (bezel + screen face + scan
 * lines) and adds a `PanelMetricsOverlay` HTML layer showing agent count,
 * task status summary, and event rate.
 *
 * Data flows:
 *   metrics-store → useMetricsBinding() → PanelMetricsOverlay
 *   task-store    → countTerminalTasks() → PanelMetricsOverlay
 *
 * All interaction events (clicks) are forwarded through the base DashboardPanel
 * so the event sourcing contract is unchanged.
 */
export const MetricsDashboardPanel = memo(function MetricsDashboardPanel({
  fixture,
  isActive = false,
  onSelect,
}: MetricsDashboardPanelProps) {
  const { t, r } = {
    t: fixture.transform.position,
    r: fixture.transform.rotation,
  };

  const { screenW } = {
    screenW: fixture.visual.width * 0.84, // mirrors computeScreenDimensions bezel ratio
  };

  return (
    <group
      name={`metrics-dashboard-panel-${fixture.fixture_id}`}
      position={[t.x, t.y, t.z + PANEL_WALL_Z_OFFSET]}
      rotation={[r.x, r.y, r.z]}
      scale={[
        fixture.transform.scale.x,
        fixture.transform.scale.y,
        fixture.transform.scale.z,
      ]}
    >
      {/* Base panel geometry (bezel + screen + scan lines + event recording) */}
      <DashboardPanel
        fixture={{ ...fixture, transform: { ...fixture.transform, position: { x: 0, y: 0, z: 0 } } }}
        isActive={isActive}
        onSelect={onSelect}
      />

      {/* Live metrics HTML overlay */}
      <PanelMetricsOverlay
        screenW={screenW}
        accentColor={fixture.visual.accentColor}
        zOffset={SCREEN_Z_OFFSET * 3}
      />
    </group>
  );
});

// ── MetricsDashboardPanelLayer ────────────────────────────────────────────────

export interface MetricsDashboardPanelLayerProps {
  /** World-space origin of the containing room */
  roomOrigin: { x: number; y: number; z: number };
  /** Room identifier — only fixtures in this room are rendered */
  roomId: string;
  /** Currently selected fixture_id (for highlight) */
  selectedFixtureId?: string | null;
  /** Selection callback */
  onSelect?: (fixtureId: string) => void;
  /** Which fixture IDs should show the live metrics overlay (default: all) */
  metricsFixtureIds?: ReadonlySet<string>;
}

// ── Pure-logic helpers for overlay selection ──────────────────────────────────

/**
 * Determine whether a given fixture should show the live metrics overlay.
 *
 * Rules:
 *   - If `metricsFixtureIds` is undefined → ALL fixtures show metrics (default on).
 *   - If `metricsFixtureIds` is a Set → only fixtures whose ID is in the set show metrics.
 *
 * Extracted as a pure function so the selection logic is testable without
 * mounting any React or Three.js component.
 *
 * @param fixtureId        - The fixture's unique identifier
 * @param metricsFixtureIds - Optional allowlist Set; undefined means "all"
 */
export function shouldShowMetricsOverlay(
  fixtureId: string,
  metricsFixtureIds?: ReadonlySet<string>,
): boolean {
  if (!metricsFixtureIds) return true;
  return metricsFixtureIds.has(fixtureId);
}

/**
 * Split a fixture list into two arrays: those that show metrics overlay and
 * those that show the plain static panel.
 *
 * Extracted as a pure helper so the partition logic is testable.
 *
 * @param fixtures          - Full fixture list (dashboard_panel type expected)
 * @param metricsFixtureIds - Optional allowlist; undefined means all show metrics
 * @returns `{ metrics, plain }` — two disjoint arrays that together exhaust `fixtures`
 */
export function partitionMetricsFixtures(
  fixtures: readonly UiFixtureDef[],
  metricsFixtureIds?: ReadonlySet<string>,
): { metrics: readonly UiFixtureDef[]; plain: readonly UiFixtureDef[] } {
  if (!metricsFixtureIds) {
    return { metrics: fixtures, plain: [] };
  }
  const metrics: UiFixtureDef[] = [];
  const plain:   UiFixtureDef[] = [];
  for (const f of fixtures) {
    if (metricsFixtureIds.has(f.fixture_id)) {
      metrics.push(f);
    } else {
      plain.push(f);
    }
  }
  return { metrics, plain };
}

/**
 * Count how many fixtures in the given list would show the live metrics overlay
 * given the current `metricsFixtureIds` allowlist.
 *
 * @param fixtures          - Full fixture list
 * @param metricsFixtureIds - Optional allowlist
 */
export function countMetricsOverlayFixtures(
  fixtures: readonly UiFixtureDef[],
  metricsFixtureIds?: ReadonlySet<string>,
): number {
  if (!metricsFixtureIds) return fixtures.length;
  return fixtures.filter((f) => metricsFixtureIds.has(f.fixture_id)).length;
}

// ── MetricsDashboardPanelLayer ────────────────────────────────────────────────

/**
 * Renders all `dashboard_panel` fixtures for a room, wiring live metrics to
 * each panel surface.
 *
 * For fixtures in `metricsFixtureIds` (or all fixtures when undefined), a
 * `MetricsDashboardPanel` is rendered — showing agent count, task status, and
 * event rate as an HTML overlay on the screen face.
 *
 * For fixtures NOT in `metricsFixtureIds`, a plain `DashboardPanel` is rendered
 * (static appearance, no live data).
 *
 * The parent `<group>` is translated to the room's world-space origin; each
 * panel's room-local transform is applied inside.
 *
 * Data flows (per panel with metrics):
 *   metrics-store → useMetricsBinding() → PanelMetricsOverlay
 *   task-store    → countTerminalTasks() → PanelMetricsOverlay
 *
 * Event sourcing:
 *   All interaction events (fixture.placed, fixture.panel_toggled) are
 *   forwarded through the base DashboardPanel — event sourcing contract
 *   is unchanged from the non-metrics variant.
 */
export const MetricsDashboardPanelLayer = memo(function MetricsDashboardPanelLayer({
  roomOrigin,
  roomId,
  selectedFixtureId,
  onSelect,
  metricsFixtureIds,
}: MetricsDashboardPanelLayerProps) {
  const fixtures = filterDashboardPanelFixtures(getFixturesForRoom(roomId));

  if (fixtures.length === 0) return null;

  return (
    <group
      name={`metrics-dashboard-panel-layer-${roomId}`}
      position={[roomOrigin.x, roomOrigin.y, roomOrigin.z]}
    >
      {fixtures.map((fixture) => {
        const showMetrics = shouldShowMetricsOverlay(fixture.fixture_id, metricsFixtureIds);

        if (showMetrics) {
          return (
            <MetricsDashboardPanel
              key={fixture.fixture_id}
              fixture={fixture}
              isActive={selectedFixtureId === fixture.fixture_id}
              onSelect={onSelect}
            />
          );
        }

        return (
          <DashboardPanel
            key={fixture.fixture_id}
            fixture={fixture}
            isActive={selectedFixtureId === fixture.fixture_id}
            onSelect={onSelect}
          />
        );
      })}
    </group>
  );
});

// ── BuildingMetricsDashboardPanels ────────────────────────────────────────────

/**
 * Props for the building-wide metrics dashboard panels renderer.
 */
export interface BuildingMetricsDashboardPanelsProps {
  /** Map from roomId → world-space origin for room-local → world transform */
  roomOrigins: ReadonlyMap<string, { x: number; y: number; z: number }>;
  /** Currently selected fixture_id */
  selectedFixtureId?: string | null;
  /** Selection callback */
  onSelect?: (fixtureId: string) => void;
  /**
   * Which fixture IDs should show the live metrics overlay.
   * Defaults to all dashboard_panel fixtures when undefined.
   */
  metricsFixtureIds?: ReadonlySet<string>;
}

/**
 * BuildingMetricsDashboardPanels — renders ALL dashboard panels across the
 * entire building with live metrics overlays wired to the agent orchestration
 * state.
 *
 * This is the primary integration point for Sub-AC 3: wiring live data
 * (agent count, task status summary, event rate) to the dashboard_panel
 * surface.  Mount this once in the top-level CommandCenterScene to get
 * real-time metrics on every dashboard panel in the building.
 *
 * Data sources wired per panel:
 *   agent-store    → agent count (total, active, idle, inactive, error)
 *   metrics-store  → event rate (events/tick), task queue depth, connection
 *   task-store     → terminal task count (done + failed + cancelled)
 *
 * All panels update automatically when their underlying stores tick
 * (TICK_MS cadence = 2 s for metrics, immediate for task completions).
 *
 * For rooms not present in `roomOrigins`, the corresponding layer is skipped
 * gracefully (returns null), so partial building layouts are safe.
 */
export const BuildingMetricsDashboardPanels = memo(function BuildingMetricsDashboardPanels({
  roomOrigins,
  selectedFixtureId,
  onSelect,
  metricsFixtureIds,
}: BuildingMetricsDashboardPanelsProps) {
  const roomIds = collectDashboardPanelRoomIds(DEFAULT_UI_FIXTURES);

  return (
    <group name="building-metrics-dashboard-panels">
      {roomIds.map((roomId) => {
        const origin = roomOrigins.get(roomId);
        if (!origin) return null;
        return (
          <MetricsDashboardPanelLayer
            key={roomId}
            roomId={roomId}
            roomOrigin={origin}
            selectedFixtureId={selectedFixtureId}
            onSelect={onSelect}
            metricsFixtureIds={metricsFixtureIds}
          />
        );
      })}
    </group>
  );
});
