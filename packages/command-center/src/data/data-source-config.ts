/**
 * data-source-config.ts — Per-surface refresh interval configuration
 * and live data-source connection settings.
 *
 * Sub-AC 6c: Bind diegetic display surfaces to live agent-orchestration
 * data sources with configurable refresh intervals.
 *
 * Design principles:
 *   - Each furniture/display type has a semantically appropriate refresh rate:
 *       Fast (<1s)  : hologram stands — real-time spatial awareness
 *       Medium (1-2s): wall panels, agent status boards — operational tempo
 *       Slow (3-5s)  : diff screens, replay terminals — deliberate review
 *   - Refresh intervals are independent of the global metrics tick rate.
 *     Surfaces poll the store at their own cadence, so they can update
 *     faster or slower than the global 2 s tick.
 *   - WebSocket connection to @conitens/core ws-bus is attempted on startup;
 *     the system falls back to simulated data if the server is unavailable.
 *
 * Interval tuning rationale:
 *   "status-board"      — agents change status frequently; 1 s keeps it live
 *   "wall-monitor-array"— system overview; 2 s matches global tick cadence
 *   "task-board"        — task queue changes at event granularity; 1.5 s
 *   "hologram-table"    — spatial knowledge graph; 500 ms for fluidity
 *   "approval-terminal" — approval queue is high-priority; 1 s
 *   "replay-terminal"   — replay is static during playback; 5 s conserves GPU
 */

// ── Per-surface refresh intervals ──────────────────────────────────────────

/**
 * Refresh interval (milliseconds) for each furniture slot type.
 *
 * Controls how often useMetricsTexture redraws the canvas texture for that
 * display surface.  Lower values = higher GPU canvas update frequency.
 * The store tick rate (TICK_MS = 2000ms) determines how often *new data*
 * arrives; these intervals determine how often each surface *reads* it.
 */
export const SURFACE_REFRESH_INTERVALS: Readonly<Record<string, number>> = {
  // ── Wall panels ────────────────────────────────────────────────────────
  /** Live agent status breakdown; fast refresh keeps counts current. */
  "status-board":        1_000,
  /** Timeline of recent events; moderate refresh is sufficient. */
  "timeline-wall":       2_000,
  /** Multi-metric system overview; matches global tick cadence. */
  "wall-monitor-array":  2_000,
  /** Task queue depth; changes with every task event. */
  "task-board":          1_500,
  /** Deployment gate status; near-real-time for CI/CD awareness. */
  "gate-status-board":   1_000,

  // ── Monitors ───────────────────────────────────────────────────────────
  /** Diff viewer; content is static between refreshes, slow is fine. */
  "diff-screen":            3_000,
  /** UI preview; rarely updates during active tasks. */
  "ui-preview-screen":      4_000,
  /** Approval queue; high-priority, fast refresh for operator attention. */
  "approval-terminal":      1_000,
  /** File browser; static directory listings, slow is acceptable. */
  "file-browser-terminal":  3_000,
  /** Replay terminal; scrub position driven by user, not metrics. */
  "replay-terminal":        5_000,

  // ── Hologram stands ────────────────────────────────────────────────────
  /** Agent cluster hologram; fastest refresh for living spatial feel. */
  "hologram-table":          500,
  /** Knowledge graph; fastest refresh to show relationship changes. */
  "knowledge-graph-display": 500,

  // ── Latency monitors (Sub-AC 6b) ──────────────────────────────────────
  /** P95 latency panel; moderate refresh — latency changes gradually. */
  "latency-monitor":     1_500,

  // ── Floor kiosks (Sub-AC 6a) ───────────────────────────────────────────
  /** Lobby information terminal; moderate refresh for wayfinding context. */
  "info-kiosk":     1_500,
  /** Agent control terminal; fast refresh for operator awareness. */
  "agent-terminal": 1_000,
  /** Corridor status kiosk; fast refresh for real-time situational display. */
  "status-kiosk":     800,
} as const;

/**
 * Default refresh interval for furniture types not listed above.
 * Matches the global metrics tick cadence.
 */
export const DEFAULT_REFRESH_INTERVAL_MS = 2_000;

// ── WebSocket / data-source settings ──────────────────────────────────────

/** Default WebSocket port matching @conitens/core WebSocketBus default. */
export const DEFAULT_WS_PORT = 8_080;

/**
 * Default WebSocket URL for the orchestrator event bus.
 *
 * Resolved at bundle time from the VITE_WS_URL environment variable when
 * set (see .env / .env.production).  Falls back to ws://localhost:<port>
 * when VITE_WS_URL is not provided (tests, offline mode, default dev setup).
 *
 * Vite replaces import.meta.env.VITE_WS_URL with its literal value at build
 * time, so the production bundle contains no environment variable lookup at
 * runtime.  Vitest also provides import.meta.env, making this safe in tests.
 */
export const DEFAULT_WS_URL: string =
  import.meta.env.VITE_WS_URL ?? `ws://localhost:${DEFAULT_WS_PORT}`;

/**
 * Operational mode of the live data source.
 *
 *   "connecting"   — WebSocket handshake in progress
 *   "connected"    — live events flowing from orchestrator
 *   "degraded"     — connected but receiving no events (stale)
 *   "disconnected" — no connection; running on simulated data
 */
export type DataSourceMode =
  | "connecting"
  | "connected"
  | "degraded"
  | "disconnected";

/** Configuration for the orchestrator WebSocket bridge. */
export interface DataSourceConfig {
  /** WebSocket endpoint URL. */
  wsUrl: string;
  /**
   * Optional auth token.  If provided, appended as `?token=<authToken>`
   * matching @conitens/core WebSocketBus auth validation.
   */
  authToken?: string;
  /**
   * How long to wait (ms) before attempting a reconnection after disconnect.
   * Doubles on each failure up to maxReconnectAttempts.
   */
  reconnectBaseIntervalMs: number;
  /** Maximum number of reconnect attempts before giving up permanently. */
  maxReconnectAttempts: number;
  /**
   * If no event is received within this window, the connection is marked
   * "degraded" even if the WebSocket is technically open.
   */
  stalenessThresholdMs: number;
}

export const DEFAULT_DATA_SOURCE_CONFIG: DataSourceConfig = {
  wsUrl:                   DEFAULT_WS_URL,
  authToken:               undefined,
  reconnectBaseIntervalMs: 2_000,
  maxReconnectAttempts:    8,
  stalenessThresholdMs:    10_000,
};
