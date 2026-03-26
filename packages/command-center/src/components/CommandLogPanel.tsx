/**
 * CommandLogPanel.tsx — Scrollable command lifecycle log panel.
 *
 * Sub-AC 8c: Render command lifecycle state visually in the 3D scene.
 *
 * A floating HUD panel (similar in style to ActiveSessionsPanel) that shows a
 * live scrollable log of command lifecycle state transitions. Each entry displays:
 *   - Relative timestamp
 *   - Color-coded status badge (pending → processing → completed/failed/rejected)
 *   - Command type (abbreviated)
 *   - Agent context (icon + ID, if available)
 *   - Duration (for completed/failed)
 *   - Error code (for failed/rejected)
 *
 * The panel auto-scrolls to the newest entry and provides a toggle button.
 * It is mounted from App.tsx as a sibling overlay alongside ActiveSessionsPanel.
 *
 * Design:
 *   - Dark translucent card, bottom-right anchored (configurable)
 *   - Monospace JetBrains Mono font for log readability
 *   - Smooth entry animations (slide-in from right)
 *   - Live reactive to useCommandLifecycleStore
 *   - "CLEAR" button wipes the local log
 *
 * Usage:
 * ```tsx
 * // In App.tsx:
 * <CommandLogPanel />
 * ```
 */

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  useCommandLifecycleStore,
  COMMAND_STATUS_COLORS,
  COMMAND_STATUS_ICONS,
  type CommandLifecycleEntry,
  type CommandLifecycleStatus,
} from "../store/command-lifecycle-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

/** Maximum entries shown in the panel (older ones beyond this are hidden). */
const DISPLAY_LIMIT = 100;

/** Width of the panel in pixels. */
const PANEL_WIDTH = 300;

/** Height of the panel (scrollable area) in pixels. */
const PANEL_MAX_HEIGHT = 340;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a timestamp relative to "now" for compact display.
 *   < 60 s   → "12s ago"
 *   < 60 min → "3m ago"
 *   else     → "HH:MM:SS"
 */
function fmtRelativeTs(ts: string): string {
  const d    = new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)  return `${Math.round(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Abbreviate a GuiCommandType for compact display.
 *   "agent.send_command" → "send_cmd"
 *   "task.create"        → "task.create"
 *   "nav.drill_down"     → "nav.↓"
 */
function abbrevType(type: string): string {
  return type
    .replace("agent.",  "")
    .replace("task.",   "task.")
    .replace("nav.drill_down", "nav.↓")
    .replace("nav.drill_up",   "nav.↑")
    .replace("nav.camera_preset", "cam.")
    .replace("nav.focus_entity",  "focus")
    .replace("config.", "cfg.")
    .replace("meeting.", "mtg.")
    .replace("send_command", "send_cmd")
    .replace("room_mapping", "room_map");
}

/** Duration display helper. */
function fmtDuration(ms?: number): string {
  if (ms == null) return "";
  if (ms < 1000)  return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: LogEntry
// ─────────────────────────────────────────────────────────────────────────────

interface LogEntryProps {
  entry: CommandLifecycleEntry;
  /** Whether this is the newest entry (for highlight animation). */
  isNewest: boolean;
}

function LogEntry({ entry, isNewest }: LogEntryProps) {
  const status      = entry.status as CommandLifecycleStatus;
  const statusColor = COMMAND_STATUS_COLORS[status];
  const icon        = COMMAND_STATUS_ICONS[status];
  const isTerminal  = status === "completed" || status === "failed" || status === "rejected";
  const isError     = status === "failed" || status === "rejected";

  // Age-based opacity fade: terminal entries dim after a few seconds
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    if (!isTerminal) return;
    const id = setTimeout(() => setOpacity(0.55), 6_000);
    return () => clearTimeout(id);
  }, [isTerminal]);

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:            1,
        padding:       "4px 8px",
        borderLeft:    `2px solid ${statusColor}${isNewest ? "ff" : "44"}`,
        background:    isNewest
          ? `${statusColor}0a`
          : isError
          ? "rgba(255, 60, 60, 0.04)"
          : "transparent",
        opacity,
        transition:    "opacity 0.8s ease, background 0.4s ease",
        borderRadius:  "0 3px 3px 0",
        animation:     isNewest ? "cmdLogSlide 0.25s ease" : "none",
      }}
    >
      {/* Primary row: icon + type + timestamp + duration */}
      <div
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:          4,
        }}
      >
        {/* Status icon */}
        <span
          style={{
            fontSize:   "10px",
            color:       statusColor,
            flexShrink:  0,
            minWidth:    10,
            textAlign:   "center",
          }}
        >
          {icon}
        </span>

        {/* Command type */}
        <span
          style={{
            fontSize:      "9px",
            color:          status === "completed" ? "#7799aa" : statusColor,
            fontFamily:     FONT,
            letterSpacing:  "0.04em",
            flex:            1,
            overflow:        "hidden",
            textOverflow:    "ellipsis",
            whiteSpace:      "nowrap",
          }}
        >
          {abbrevType(entry.command_type)}
        </span>

        {/* Duration (if terminal) */}
        {entry.duration_ms != null && (
          <span
            style={{
              fontSize:  "7px",
              color:     "#445566",
              flexShrink: 0,
            }}
          >
            {fmtDuration(entry.duration_ms)}
          </span>
        )}

        {/* Relative timestamp */}
        <span
          style={{
            fontSize:  "7px",
            color:     "#334455",
            flexShrink: 0,
          }}
        >
          {fmtRelativeTs(entry.updatedAt)}
        </span>
      </div>

      {/* Secondary row: agent context + error */}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:         4,
          paddingLeft: 14,
        }}
      >
        {/* Agent ID badge */}
        {entry.agentId && (
          <span
            style={{
              fontSize:      "7px",
              color:          "#445566",
              fontFamily:     FONT,
              background:     "rgba(68, 85, 102, 0.2)",
              padding:        "0 3px",
              borderRadius:    2,
              maxWidth:        90,
              overflow:        "hidden",
              textOverflow:    "ellipsis",
              whiteSpace:      "nowrap",
              flexShrink:       0,
            }}
          >
            {entry.agentId}
          </span>
        )}

        {/* Source badge */}
        {entry.source && entry.source !== "system" && (
          <span
            style={{
              fontSize:  "7px",
              color:     "#334455",
              flexShrink: 0,
            }}
          >
            [{entry.source}]
          </span>
        )}

        {/* Error message for failed/rejected */}
        {entry.error && (
          <span
            style={{
              fontSize:      "7px",
              color:          "#cc5555",
              fontFamily:     FONT,
              flex:            1,
              overflow:        "hidden",
              textOverflow:    "ellipsis",
              whiteSpace:      "nowrap",
            }}
            title={entry.error.message}
          >
            {entry.error.code}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export: CommandLogPanel
// ─────────────────────────────────────────────────────────────────────────────

export interface CommandLogPanelProps {
  /**
   * Initial expanded state. Default false (collapsed to toggle button).
   */
  defaultExpanded?: boolean;
  /**
   * Inline style overrides for the root container.
   */
  style?: React.CSSProperties;
}

/**
 * Scrollable command lifecycle log panel.
 *
 * Reads live from useCommandLifecycleStore and renders a compact list of
 * command state transitions. Auto-scrolls to newest entry. Togglable.
 *
 * Mount once from App.tsx.
 */
export function CommandLogPanel({
  defaultExpanded = false,
  style,
}: CommandLogPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reactive log data — re-renders on any log change
  const entries = useCommandLifecycleStore((s) => s.getLogEntries(DISPLAY_LIMIT));
  const clearLog = useCommandLifecycleStore((s) => s.clearLog);

  // Count of active (non-terminal) commands for badge display
  const activeCount = useMemo(
    () => entries.filter((e) => e.status === "pending" || e.status === "processing").length,
    [entries],
  );

  const errorCount = useMemo(
    () => entries.filter((e) => {
      const ageS = (Date.now() - new Date(e.updatedAt).getTime()) / 1000;
      return (e.status === "failed" || e.status === "rejected") && ageS < 30;
    }).length,
    [entries],
  );

  // Auto-scroll to top (newest) when entries change
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries.length, expanded]);

  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearLog();
  }, [clearLog]);

  // Toggle button color based on active / error state
  const indicatorColor =
    errorCount > 0  ? "#ff4444" :
    activeCount > 0 ? "#44aaff" :
                      "#334455";

  return (
    <div
      style={{
        position:   "fixed",
        bottom:      88,  // above CommandDispatchStatusBar area
        right:       16,
        zIndex:      180,
        fontFamily:  FONT,
        fontSize:    10,
        userSelect:  "none",
        pointerEvents: "auto",
        ...style,
      }}
    >
      {/* ── Toggle button ── */}
      <button
        onClick={toggleExpanded}
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:             5,
          padding:        "4px 10px",
          background:     "rgba(0, 0, 10, 0.75)",
          border:         `1px solid ${indicatorColor}44`,
          borderRadius:    3,
          cursor:          "pointer",
          color:           "#7788aa",
          fontFamily:      FONT,
          fontSize:        9,
          letterSpacing:  "0.08em",
          backdropFilter:  "blur(6px)",
          boxShadow:      "0 2px 8px rgba(0,0,0,0.4)",
          outline:         "none",
          marginBottom:    expanded ? 4 : 0,
          transition:     "border-color 0.2s",
        }}
      >
        {/* Status indicator dot */}
        <span
          style={{
            width:        6,
            height:        6,
            borderRadius:  "50%",
            background:    indicatorColor,
            boxShadow:     activeCount > 0 ? `0 0 5px ${indicatorColor}` : "none",
            flexShrink:    0,
            animation:     activeCount > 0 ? "cmdLogPulse 1.2s ease infinite" : "none",
          }}
        />
        <span style={{ color: indicatorColor, fontWeight: 600 }}>CMD LOG</span>
        {entries.length > 0 && (
          <span
            style={{
              background:    `${indicatorColor}22`,
              color:          indicatorColor,
              borderRadius:   8,
              padding:       "0 4px",
              fontSize:       8,
              fontWeight:     600,
              minWidth:       14,
              textAlign:      "center",
            }}
          >
            {entries.length}
          </span>
        )}
        {activeCount > 0 && (
          <span style={{ fontSize: 8, color: "#44aaff" }}>
            {activeCount} active
          </span>
        )}
        {errorCount > 0 && (
          <span style={{ fontSize: 8, color: "#ff4444" }}>
            {errorCount} err
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 8, color: "#334455" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div
          style={{
            width:          PANEL_WIDTH,
            background:     "rgba(4, 6, 16, 0.9)",
            border:         "1px solid #1a2233",
            borderRadius:    4,
            boxShadow:      "0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)",
            backdropFilter:  "blur(10px)",
            overflow:        "hidden",
          }}
        >
          {/* Header bar */}
          <div
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:             6,
              padding:        "5px 10px",
              borderBottom:   "1px solid #1a2233",
              background:     "rgba(0,0,0,0.3)",
            }}
          >
            <span
              style={{
                fontSize:      9,
                color:          "#6688aa",
                letterSpacing:  "0.1em",
                fontWeight:     700,
                flex:            1,
              }}
            >
              COMMAND LIFECYCLE LOG
            </span>
            {entries.length > 0 && (
              <button
                onClick={handleClear}
                style={{
                  background:   "none",
                  border:       "1px solid #223344",
                  borderRadius:  2,
                  cursor:        "pointer",
                  color:         "#446688",
                  fontFamily:    FONT,
                  fontSize:       8,
                  padding:       "1px 5px",
                  letterSpacing: "0.06em",
                  outline:        "none",
                }}
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Status summary row */}
          <CommandStatusSummary entries={entries} />

          {/* Scrollable log list */}
          <div
            ref={scrollRef}
            style={{
              maxHeight:   PANEL_MAX_HEIGHT,
              overflowY:   "auto",
              display:     "flex",
              flexDirection: "column",
              gap:           1,
              padding:      "4px 0",
              // Custom thin scrollbar
              scrollbarWidth:     "thin",
              scrollbarColor:     "#1a2233 transparent",
            }}
          >
            {entries.length === 0 ? (
              <div
                style={{
                  padding:       "12px 10px",
                  color:          "#334455",
                  fontSize:        9,
                  textAlign:      "center",
                  letterSpacing:  "0.08em",
                }}
              >
                — no commands recorded —
              </div>
            ) : (
              entries.map((entry, idx) => (
                <LogEntry
                  key={entry.command_id}
                  entry={entry}
                  isNewest={idx === 0}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Global animations */}
      <style>{`
        @keyframes cmdLogPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes cmdLogSlide {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: CommandStatusSummary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compact status tally row at the top of the panel.
 * Shows counts per status bucket across the entire log (up to DISPLAY_LIMIT).
 */
function CommandStatusSummary({ entries }: { entries: CommandLifecycleEntry[] }) {
  const counts = useMemo(() => {
    const tally: Record<CommandLifecycleStatus, number> = {
      pending: 0, processing: 0, completed: 0, failed: 0, rejected: 0,
    };
    for (const e of entries) tally[e.status as CommandLifecycleStatus]++;
    return tally;
  }, [entries]);

  const statusList: CommandLifecycleStatus[] = [
    "pending", "processing", "completed", "failed", "rejected",
  ];

  return (
    <div
      style={{
        display:        "flex",
        gap:             6,
        padding:        "4px 10px",
        borderBottom:   "1px solid #0d1220",
        background:     "rgba(0,0,0,0.15)",
        flexWrap:        "wrap",
      }}
    >
      {statusList.map((s) => (
        counts[s] > 0 ? (
          <span
            key={s}
            style={{
              fontSize:  8,
              color:     COMMAND_STATUS_COLORS[s],
              fontFamily: FONT,
              letterSpacing: "0.04em",
            }}
          >
            {COMMAND_STATUS_ICONS[s]}{counts[s]}
          </span>
        ) : null
      ))}
      {entries.length === 0 && (
        <span style={{ fontSize: 8, color: "#223344" }}>—</span>
      )}
    </div>
  );
}
