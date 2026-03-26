/**
 * CommandDispatchStatusBar.tsx — Live command dispatch status indicator.
 *
 * Sub-AC 8b: Visual feedback for command file serialization.
 *
 * Renders a thin status bar in the HUD that shows:
 *  - The write status of the command file writer (idle / writing / error)
 *  - The last N commands dispatched (type + timestamp)
 *  - An error banner when a command dispatch fails
 *
 * This makes the "transparent recording" design principle visible to the user:
 * every button click, drag, and context-menu selection shows up as a command
 * entry here, confirming that it was serialized to a command file.
 *
 * Design: small horizontal status strip along the bottom of the HUD.
 *
 * Usage:
 * ```tsx
 * // In HUD.tsx:
 * <CommandDispatchStatusBar maxEntries={5} />
 * ```
 */

import { useCommandFileWriter } from "../hooks/use-command-file-writer.js";
import type { CommandHistoryEntry } from "../hooks/use-command-file-writer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

/** Colors per command status */
const STATUS_COLOR: Record<CommandHistoryEntry["status"], string> = {
  pending:  "#ffcc44",
  accepted: "#00ff88",
  error:    "#ff5555",
};

/** Icon per command status */
const STATUS_ICON: Record<CommandHistoryEntry["status"], string> = {
  pending:  "⋯",
  accepted: "✓",
  error:    "✗",
};

/** Abbreviate long command type labels for display */
function abbrevType(type: string): string {
  // "agent.send_command" → "agent.send_cmd"
  // "config.room_mapping" → "cfg.room_map"
  return type
    .replace("config.", "cfg.")
    .replace("_command", "_cmd")
    .replace("_mapping", "_map")
    .replace("_layout", "_layout")
    .replace("meeting.convene", "meet.convene");
}

/** Format timestamp as HH:MM:SS */
function fmtTs(ts: string): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface CommandDispatchStatusBarProps {
  /** Maximum command history entries to show. Default 5. */
  maxEntries?: number;
  /** Inline style overrides. */
  style?: React.CSSProperties;
}

/**
 * Thin read-only status strip showing recent command dispatch activity.
 *
 * Mount inside HUD (or at the bottom of the overlay layer).
 * Reads from `useCommandFileWriter` which is already mounted via
 * `ActionDispatcherProvider` → `useActionDispatcherImpl` → `useCommandFileWriter`.
 *
 * Note: this component calls `useCommandFileWriter()` independently, which
 * creates a fresh instance. For shared state the callers should use
 * `useActionDispatcher().commandHistory` via context once that surface is wired.
 * In practice each call to `useCommandFileWriter` shares the same underlying
 * `historyRef` singleton since the ref is module-level — intentional design.
 */
export function CommandDispatchStatusBar({
  maxEntries = 5,
  style,
}: CommandDispatchStatusBarProps) {
  const { status, commandHistory, lastError, clearError } =
    useCommandFileWriter();

  const recent = commandHistory.slice(0, maxEntries);

  const statusColor =
    status === "idle"
      ? "#334455"
      : status === "writing"
        ? "#ffcc44"
        : "#ff5555";

  const statusLabel =
    status === "idle"
      ? "READY"
      : status === "writing"
        ? "WRITING"
        : "ERROR";

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           4,
        fontFamily:    FONT,
        fontSize:      10,
        color:         "#8090a8",
        ...style,
      }}
    >
      {/* ── Writer status pill ── */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            6,
          padding:        "2px 8px",
          background:     "rgba(0,0,0,0.5)",
          border:         `1px solid ${statusColor}44`,
          borderRadius:   3,
          letterSpacing:  "0.08em",
        }}
      >
        <span
          style={{
            width:           6,
            height:          6,
            borderRadius:    "50%",
            background:      statusColor,
            boxShadow:       `0 0 4px ${statusColor}`,
            flexShrink:      0,
            animation:       status === "writing" ? "cmdPulse 0.8s ease infinite" : "none",
          }}
        />
        <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
        <span style={{ color: "#445566" }}>CMD-DISPATCH</span>
        {recent.length > 0 && (
          <span style={{ marginLeft: "auto", color: "#334455", fontSize: 9 }}>
            {recent.length} cmd{recent.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Error banner ── */}
      {lastError && (
        <div
          style={{
            display:       "flex",
            alignItems:    "center",
            gap:           6,
            padding:       "3px 8px",
            background:    "rgba(255,50,50,0.08)",
            border:        "1px solid #ff444444",
            borderRadius:  3,
            color:         "#ff7777",
            fontSize:      10,
          }}
        >
          <span>✗</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lastError}
          </span>
          <button
            onClick={clearError}
            style={{
              background:   "none",
              border:       "none",
              cursor:       "pointer",
              color:        "#ff7777",
              padding:      "0 2px",
              fontSize:     10,
              fontFamily:   FONT,
              opacity:      0.7,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Recent command log ── */}
      {recent.length > 0 && (
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            gap:           1,
          }}
        >
          {recent.map((entry) => (
            <div
              key={entry.command_id}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          5,
                padding:      "1px 8px",
                background:   "rgba(0,0,0,0.3)",
                borderLeft:   `2px solid ${STATUS_COLOR[entry.status]}44`,
                borderRadius: "0 2px 2px 0",
              }}
            >
              <span style={{ color: STATUS_COLOR[entry.status], fontSize: 10 }}>
                {STATUS_ICON[entry.status]}
              </span>
              <span
                style={{
                  color:         "#6688aa",
                  fontSize:       9,
                  letterSpacing: "0.05em",
                  flex:          1,
                  overflow:      "hidden",
                  textOverflow:  "ellipsis",
                  whiteSpace:    "nowrap",
                }}
              >
                {abbrevType(entry.type)}
              </span>
              <span style={{ color: "#334455", fontSize: 9 }}>
                {fmtTs(entry.ts)}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes cmdPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
