/**
 * DataSourceStatusIndicator (Sub-AC 6c) — diegetic live/simulated indicator.
 */
import { useMetricsStore } from "../../store/metrics-store.js";
import type { DataSourceMode } from "../../data/data-source-config.js";

/**
 * Visual style per connection mode, maintaining the dark command-center
 * aesthetic while communicating data source quality at a glance.
 */
const CONNECTION_STATUS_STYLE: Record<DataSourceMode, {
  label:   string;
  color:   string;
  dot:     string;
  blink:   boolean;
}> = {
  connected:    { label: "LIVE",        color: "#33ee88", dot: "#33ee88", blink: false },
  connecting:   { label: "LINKING…",   color: "#4a6aff", dot: "#4a6aff", blink: true  },
  degraded:     { label: "STALE",       color: "#ffaa22", dot: "#ffaa22", blink: true  },
  disconnected: { label: "SIM",         color: "#555577", dot: "#334455", blink: false },
};

/**
 * DataSourceStatusIndicator — diegetic HUD element showing whether display
 * surfaces are fed by live orchestrator events or simulated data.
 *
 * Positioned bottom-center to avoid obscuring the main data views.
 * Uses a pulsing dot for active states (connecting, degraded) to signal
 * that the system is waiting/watching without being distracting.
 */
export function DataSourceStatusIndicator() {
  const connectionStatus = useMetricsStore((s) => s.connectionStatus);
  const liveEventCount   = useMetricsStore((s) => s.liveEventCount);

  const { label, color, dot, blink } = CONNECTION_STATUS_STYLE[connectionStatus];

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "rgba(5, 8, 16, 0.80)",
        border: `1px solid ${color}44`,
        borderRadius: 3,
        padding: "3px 8px",
        backdropFilter: "blur(4px)",
        userSelect: "none",
      }}
      title={
        connectionStatus === "connected"
          ? `Live orchestrator data — ${liveEventCount} events received`
          : connectionStatus === "connecting"
          ? "Establishing connection to orchestrator WebSocket bus…"
          : connectionStatus === "degraded"
          ? "Connection open but no recent events — data may be stale"
          : "Orchestrator offline — display surfaces running on simulated metrics"
      }
    >
      {/* Pulsing status dot */}
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: dot,
          boxShadow: `0 0 6px ${dot}88`,
          animation: blink ? "hud-pulse 1.2s ease-in-out infinite" : "none",
        }}
      />

      {/* Mode label */}
      <span
        style={{
          fontSize: "8px",
          fontWeight: 700,
          color,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>

      {/* Separator */}
      <span style={{ fontSize: "8px", color: "#333355" }}>│</span>

      {/* Metric ticker indicator */}
      <span style={{ fontSize: "8px", color: "#444466", letterSpacing: "0.05em" }}>
        DATA
      </span>
      <span style={{ fontSize: "8px", color: "#334455", letterSpacing: "0.05em" }}>
        ◈
      </span>

      {/* Live event count — only shown in connected/degraded mode */}
      {(connectionStatus === "connected" || connectionStatus === "degraded") && (
        <span style={{ fontSize: "7px", color: `${color}bb`, letterSpacing: "0.06em" }}>
          {liveEventCount} evt
        </span>
      )}

      {/* Simulated label when disconnected */}
      {connectionStatus === "disconnected" && (
        <span style={{ fontSize: "7px", color: "#444466", letterSpacing: "0.06em" }}>
          SIMULATED
        </span>
      )}
    </div>
  );
}
