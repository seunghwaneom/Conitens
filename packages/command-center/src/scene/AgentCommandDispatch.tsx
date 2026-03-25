/**
 * AgentCommandDispatch — Diegetic 3D in-world command terminal.
 *
 * Sub-AC 7b: 3D command dispatch UI
 *
 * Renders as a world-anchored HTML panel (via @react-three/drei Html) above the
 * AgentLifecyclePanel for a selected/drilled agent. Provides a terminal-style
 * command input that sends prompts and commands directly to agents from the
 * 3D space.
 *
 * Features:
 *   INPUT      — text area with keyboard navigation (Enter to send, Escape to clear)
 *   HISTORY    — up/down arrow keys navigate previous commands
 *   PRESETS    — quick-dispatch buttons for common command templates
 *   LOG        — last 5 dispatched commands shown with timestamps
 *   DISPATCH   — calls sendAgentCommand() and optionally POSTs to orchestrator
 *
 * Design principles:
 *  - Diegetic: lives in 3D world space, not a screen overlay
 *  - Dark monospace terminal aesthetic matching the command-center theme
 *  - All dispatched commands are event-sourced through the agent store
 *    (agent.command_sent event with full command text in payload)
 *  - Control-plane fidelity: commands are forwarded to the orchestrator HTTP
 *    endpoint (VITE_ORCHESTRATOR_URL / port 8080) when available
 *  - Write-only recording: sends events; does not read agent history from server
 *
 * Positioning:
 *  - Rendered at Y = DISPATCH_Y (world space above the lifecycle panel at Y=1.55)
 *  - Uses distanceFactor matching the lifecycle panel for consistent sizing
 *
 * The panel is only visible when the agent is the active drill target
 * (spatial-store drillAgent === agentId && drillLevel === "agent").
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  KeyboardEvent,
} from "react";
import { Html } from "@react-three/drei";
import type { AgentRuntimeState } from "../store/agent-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useCommandFileWriter } from "../hooks/use-command-file-writer.js";

// ── Constants ──────────────────────────────────────────────────────────────────

/** World-space Y offset above the agent's feet (above lifecycle panel at 1.55) */
const DISPATCH_Y = 3.9;

/** Shared monospace font stack */
const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

/** Max command history entries retained in local state */
const MAX_HISTORY = 50;

/** Max log lines shown in the dispatch log area */
const MAX_LOG_DISPLAY = 5;

// ORCHESTRATOR_URL is no longer used directly here; commands are dispatched
// via useCommandFileWriter which uses VITE_COMMANDS_API_URL.

// ── Quick-command preset templates ────────────────────────────────────────────

interface CommandPreset {
  label: string;
  icon: string;
  template: string;
  color: string;
}

const COMMAND_PRESETS: CommandPreset[] = [
  {
    label: "STATUS",
    icon: "◈",
    template: "Report current status and active tasks.",
    color: "#66aaff",
  },
  {
    label: "ANALYZE",
    icon: "⬡",
    template: "Analyze the current system state and identify anomalies.",
    color: "#00ddaa",
  },
  {
    label: "REPORT",
    icon: "▣",
    template: "Generate a full progress report for all ongoing tasks.",
    color: "#ffcc44",
  },
  {
    label: "DEBUG",
    icon: "◎",
    template: "Enter debug mode and output detailed trace logs.",
    color: "#ff9944",
  },
];

// ── Dispatch log entry ─────────────────────────────────────────────────────────

interface DispatchLogEntry {
  id: string;
  ts: number;
  command: string;
  status: "pending" | "sent" | "error";
}

// forwardToOrchestrator replaced by useCommandFileWriter.sendAgentCommand()
// which posts a properly-formatted command file to /api/commands (Sub-AC 8b).

// ── Timestamp formatter ────────────────────────────────────────────────────────

function formatTs(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ── Status colour helper (matching lifecycle panel) ────────────────────────────

function getStatusColor(status: string): string {
  switch (status) {
    case "inactive":   return "#555566";
    case "idle":       return "#8888aa";
    case "active":     return "#00ff88";
    case "busy":       return "#ffaa00";
    case "error":      return "#ff4444";
    case "terminated": return "#444455";
    default:           return "#8888aa";
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export interface AgentCommandDispatchProps {
  agent: AgentRuntimeState;
}

/**
 * AgentCommandDispatch — in-world terminal for dispatching commands to agents.
 *
 * Positioned in 3D world space above the AgentLifecyclePanel.
 * Shown when the agent is the active drill target (drillLevel === "agent").
 */
export function AgentCommandDispatch({ agent }: AgentCommandDispatchProps) {
  // ── Store selectors ──────────────────────────────────────────────────────────
  const sendAgentCommand = useAgentStore((s) => s.sendAgentCommand);
  const drillLevel       = useSpatialStore((s) => s.drillLevel);
  const drillAgent       = useSpatialStore((s) => s.drillAgent);

  // ── Command file writer (Sub-AC 8b) ──────────────────────────────────────────
  // Serializes dispatched commands to properly-formatted command files
  // posted to the Orchestrator /api/commands endpoint.
  const cmdWriter = useCommandFileWriter();

  // Panel is only visible when this agent is the active drill target
  const isVisible = drillLevel === "agent" && drillAgent === agent.def.agentId;

  // ── Local terminal state ─────────────────────────────────────────────────────
  const [input, setInput]           = useState("");
  const [history, setHistory]       = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [log, setLog]               = useState<DispatchLogEntry[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);

  // Textarea ref for focus management
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset input and history cursor when panel hides
  useEffect(() => {
    if (!isVisible) {
      setHistoryIdx(-1);
    }
  }, [isVisible]);

  // Auto-focus input when panel becomes visible
  useEffect(() => {
    if (isVisible) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isVisible]);

  // ── Dispatch action ──────────────────────────────────────────────────────────

  const dispatch = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || isDispatching) return;

      const agentId = agent.def.agentId;
      const entryId = `dcmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Add to log immediately as "pending"
      const entry: DispatchLogEntry = {
        id: entryId,
        ts: Date.now(),
        command: trimmed,
        status: "pending",
      };
      setLog((prev) => [entry, ...prev].slice(0, MAX_LOG_DISPLAY));

      // Update command history
      setHistory((prev) => {
        const deduped = prev.filter((c) => c !== trimmed);
        return [trimmed, ...deduped].slice(0, MAX_HISTORY);
      });
      setHistoryIdx(-1);
      setInput("");
      setIsDispatching(true);

      // Event-source through agent store (local command_sent event)
      sendAgentCommand(agentId, trimmed);

      // Serialize to a properly-formatted command file and POST to /api/commands
      // (Sub-AC 8b — replaces the old ad-hoc forwardToOrchestrator call)
      try {
        await cmdWriter.sendAgentCommand({
          agent_id: agentId,
          instruction: trimmed,
        });
        setLog((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, status: "sent" as const } : e)),
        );
      } catch {
        // Orchestrator may not be running — command is still locally event-sourced
        setLog((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, status: "error" as const } : e)),
        );
      } finally {
        setIsDispatching(false);
      }
    },
    [agent.def.agentId, sendAgentCommand, cmdWriter, isDispatching],
  );

  // ── Keyboard handling ────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter (without shift) → dispatch
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        dispatch(input);
        return;
      }

      // Escape → clear input
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        setHistoryIdx(-1);
        return;
      }

      // Arrow Up → navigate history backwards
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const nextIdx = Math.min(historyIdx + 1, history.length - 1);
        setHistoryIdx(nextIdx);
        setInput(history[nextIdx] ?? "");
        return;
      }

      // Arrow Down → navigate history forwards
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = Math.max(historyIdx - 1, -1);
        setHistoryIdx(nextIdx);
        setInput(nextIdx === -1 ? "" : (history[nextIdx] ?? ""));
        return;
      }
    },
    [dispatch, input, history, historyIdx],
  );

  // ── Preset click handler ─────────────────────────────────────────────────────

  const handlePreset = useCallback(
    (template: string) => {
      setInput(template);
      setTimeout(() => textareaRef.current?.focus(), 10);
    },
    [],
  );

  if (!isVisible) return null;

  const accentColor  = agent.def.visual.color;
  const statusColor  = getStatusColor(agent.status);

  return (
    <Html
      position={[0, DISPATCH_Y, 0]}
      center
      distanceFactor={9}
      zIndexRange={[199, 0]}
      style={{ pointerEvents: "none" }}
    >
      {/*
       * Outer wrapper: pointer-events none (set on Html above).
       * Inner container re-enables pointer events for keyboard/button input.
       * stopPropagation prevents events from leaking into the 3D canvas.
       */}
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          pointerEvents: "auto",
          minWidth: "260px",
          maxWidth: "300px",
          background: "rgba(4, 4, 12, 0.97)",
          border: `1px solid ${accentColor}44`,
          borderRadius: "6px",
          padding: "10px 12px",
          backdropFilter: "blur(12px)",
          boxShadow: `
            0 0 0 1px ${accentColor}18,
            0 0 32px ${accentColor}18,
            0 12px 32px rgba(0,0,0,0.80)
          `,
          fontFamily: FONT,
          userSelect: "none",
        }}
      >
        {/* ── Panel header ── */}
        <div
          style={{
            fontSize: "7px",
            color: "#333355",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span style={{ color: accentColor + "99" }}>⌨</span>
          <span>COMMAND DISPATCH</span>
          {/* Agent name abbreviation */}
          <span
            style={{
              marginLeft: "auto",
              fontSize: "6.5px",
              color: accentColor + "88",
              fontWeight: 600,
              letterSpacing: "0.06em",
            }}
          >
            {agent.def.name.slice(0, 10).toUpperCase()}
          </span>
          {/* Status dot */}
          <span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              backgroundColor: statusColor,
              display: "inline-block",
              boxShadow: `0 0 4px ${statusColor}88`,
              flexShrink: 0,
            }}
          />
        </div>

        {/* ── Separator ── */}
        <div
          style={{
            height: "1px",
            background: `linear-gradient(90deg, ${accentColor}33 0%, transparent 100%)`,
            marginBottom: "8px",
          }}
        />

        {/* ── Quick-preset buttons ── */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            flexWrap: "wrap",
            marginBottom: "8px",
          }}
        >
          {COMMAND_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={(e) => {
                e.stopPropagation();
                handlePreset(preset.template);
              }}
              title={preset.template}
              style={{
                fontFamily: FONT,
                fontSize: "7px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: "3px",
                border: `1px solid ${preset.color}33`,
                background: `${preset.color}0e`,
                color: preset.color + "cc",
                display: "flex",
                alignItems: "center",
                gap: "3px",
                lineHeight: 1.4,
                transition: "background 0.12s ease",
              }}
            >
              <span>{preset.icon}</span>
              <span>{preset.label}</span>
            </button>
          ))}
        </div>

        {/* ── Command input area ── */}
        <div
          style={{
            position: "relative",
            marginBottom: "6px",
          }}
        >
          {/* Prompt glyph */}
          <div
            style={{
              position: "absolute",
              left: "7px",
              top: "7px",
              fontSize: "9px",
              color: accentColor + "88",
              lineHeight: 1,
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            ❯
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setHistoryIdx(-1);
            }}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Enter command or prompt…"
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: FONT,
              fontSize: "9px",
              color: "#aaaacc",
              background: "rgba(8, 8, 20, 0.90)",
              border: `1px solid ${accentColor}28`,
              borderRadius: "4px",
              padding: "6px 8px 6px 20px",
              outline: "none",
              resize: "none",
              lineHeight: 1.6,
              letterSpacing: "0.03em",
              caretColor: accentColor,
              verticalAlign: "top",
            }}
          />
        </div>

        {/* ── Action row: history hint + dispatch button ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "8px",
          }}
        >
          {/* History navigation hint */}
          <span
            style={{
              fontSize: "6.5px",
              color: "#333355",
              letterSpacing: "0.06em",
              flex: 1,
            }}
          >
            ↑↓ history &nbsp;·&nbsp; ⏎ send &nbsp;·&nbsp; ⎋ clear
          </span>

          {/* History index indicator */}
          {historyIdx >= 0 && (
            <span
              style={{
                fontSize: "6.5px",
                color: "#555577",
                letterSpacing: "0.06em",
              }}
            >
              [{historyIdx + 1}/{history.length}]
            </span>
          )}

          {/* Dispatch button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch(input);
            }}
            disabled={!input.trim() || isDispatching}
            style={{
              fontFamily: FONT,
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: !input.trim() || isDispatching ? "default" : "pointer",
              padding: "4px 10px",
              borderRadius: "3px",
              border: `1px solid ${!input.trim() || isDispatching ? "#222233" : accentColor + "66"}`,
              background: !input.trim() || isDispatching
                ? "rgba(20,20,32,0.5)"
                : `${accentColor}18`,
              color: !input.trim() || isDispatching ? "#333355" : accentColor,
              display: "flex",
              alignItems: "center",
              gap: "3px",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
          >
            {isDispatching ? (
              <>
                <span style={{ fontSize: "7px" }}>◌</span>
                <span>SENDING</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: "7px" }}>▶</span>
                <span>DISPATCH</span>
              </>
            )}
          </button>
        </div>

        {/* ── Dispatch log ── */}
        {log.length > 0 && (
          <div
            style={{
              borderTop: "1px solid #1a1a2a",
              paddingTop: "6px",
            }}
          >
            {/* Log header */}
            <div
              style={{
                fontSize: "6.5px",
                color: "#333355",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              ◈ DISPATCH LOG
            </div>

            {/* Log entries */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                maxHeight: "80px",
                overflowY: "auto",
              }}
            >
              {log.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "5px",
                    padding: "2px 4px",
                    borderRadius: "2px",
                    background:
                      entry.status === "error"
                        ? "rgba(255,60,60,0.06)"
                        : entry.status === "sent"
                        ? "rgba(0,200,100,0.05)"
                        : "rgba(255,255,255,0.02)",
                  }}
                >
                  {/* Status icon */}
                  <span
                    style={{
                      fontSize: "8px",
                      lineHeight: "11px",
                      color:
                        entry.status === "error"
                          ? "#ff5555"
                          : entry.status === "sent"
                          ? "#00cc77"
                          : "#888899",
                      flexShrink: 0,
                    }}
                  >
                    {entry.status === "error"
                      ? "✗"
                      : entry.status === "sent"
                      ? "✓"
                      : "○"}
                  </span>

                  {/* Timestamp */}
                  <span
                    style={{
                      fontSize: "6.5px",
                      color: "#333355",
                      letterSpacing: "0.04em",
                      lineHeight: "11px",
                      flexShrink: 0,
                    }}
                  >
                    {formatTs(entry.ts)}
                  </span>

                  {/* Command text */}
                  <span
                    style={{
                      fontSize: "7px",
                      color:
                        entry.status === "error"
                          ? "#aa6666"
                          : entry.status === "sent"
                          ? "#778899"
                          : "#666688",
                      letterSpacing: "0.03em",
                      lineHeight: "11px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                    title={entry.command}
                  >
                    {entry.command.length > 35
                      ? `${entry.command.slice(0, 35)}…`
                      : entry.command}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div
          style={{
            marginTop: "6px",
            paddingTop: "5px",
            borderTop: "1px solid #111122",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "6px",
              color: "#1e1e2e",
              letterSpacing: "0.06em",
            }}
          >
            {agent.def.role.toUpperCase()}
          </span>
          <span
            style={{
              fontSize: "6px",
              color: "#1e1e2e",
              letterSpacing: "0.06em",
            }}
          >
            DISPATCH ⬡ EVENT-SOURCED
          </span>
        </div>
      </div>
    </Html>
  );
}
