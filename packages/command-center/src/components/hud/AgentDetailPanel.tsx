/**
 * AgentDetailPanel — Sub-AC 4c: Fully interactive agent detail panel.
 */
import { useState } from "react";
import { useAgentStore } from "../../store/agent-store.js";
import { styles } from "./hud-styles.js";
import { agentStatusColor } from "./status-colors.js";

/**
 * AgentDetailPanel — Sub-AC 4c: Fully interactive agent detail panel.
 *
 * Surfaces per-agent:
 *   - Identity: name, role, ID, risk classification
 *   - Live status badge + current task title
 *   - Room assignment
 *   - Control actions: START, STOP, RESTART, SEND CMD (with text input)
 *   - Capabilities tag list
 *   - Agent summary description
 *   - Agent event log (last 8 events, newest-first)
 *
 * All control actions are event-sourced through the agent store.
 * Panel appears on the left side when an agent is selected/drilled-into.
 */
export function AgentDetailPanel() {
  const selectedAgentId    = useAgentStore((s) => s.selectedAgentId);
  const agent              = useAgentStore((s) => selectedAgentId ? s.agents[selectedAgentId] : undefined);
  const allEvents          = useAgentStore((s) => s.events);
  const selectAgent        = useAgentStore((s) => s.selectAgent);
  const changeAgentStatus  = useAgentStore((s) => s.changeAgentStatus);
  const sendAgentCommand   = useAgentStore((s) => s.sendAgentCommand);
  const restartAgent       = useAgentStore((s) => s.restartAgent);

  // Local UI state for the send-command input form
  const [cmdOpen, setCmdOpen]   = useState(false);
  const [cmdInput, setCmdInput] = useState("");

  if (!agent) return null;

  const { def, status, roomId } = agent;
  const statusColor = agentStatusColor(status);

  // Risk badge colors
  const riskColor =
    def.riskClass === "high"   ? "#ff8888"
    : def.riskClass === "medium" ? "#ffcc66"
    :                              "#88ffaa";
  const riskBg =
    def.riskClass === "high"   ? "rgba(255,50,50,0.12)"
    : def.riskClass === "medium" ? "rgba(255,170,0,0.12)"
    :                              "rgba(80,255,150,0.10)";
  const riskBorder =
    def.riskClass === "high"   ? "#ff444444"
    : def.riskClass === "medium" ? "#ffaa0044"
    :                              "#44ff8844";

  // ── Control action handlers ──────────────────────────────────────
  const handleStart = () => {
    if (status === "inactive" || status === "idle" || status === "terminated") {
      changeAgentStatus(def.agentId, "active", "manual-start");
    }
  };

  const handleStop = () => {
    if (status !== "terminated") {
      changeAgentStatus(def.agentId, "terminated", "manual-stop");
    }
  };

  const handleRestart = () => {
    restartAgent(def.agentId);
    setCmdOpen(false);
    setCmdInput("");
  };

  const handleSendCommand = () => {
    const cmd = cmdInput.trim();
    if (!cmd) return;
    sendAgentCommand(def.agentId, cmd);
    setCmdInput("");
    setCmdOpen(false);
  };

  // Filter + slice agent events for the log (last 8, newest first)
  const agentEvents = allEvents
    .filter((e) => e.agentId === selectedAgentId)
    .slice(-8)
    .reverse();

  // Disabled states for buttons
  const startDisabled  = status === "active" || status === "busy";
  const stopDisabled   = status === "terminated";

  return (
    <div style={{ ...styles.agentDetailPanel, maxWidth: 300 }}>

      {/* ── Header row ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={styles.sectionLabel}>
          <span style={{ color: def.visual.color, marginRight: 4 }}>{def.visual.icon}</span>
          AGENT DETAIL
        </div>
        <button
          onClick={() => { selectAgent(null); setCmdOpen(false); setCmdInput(""); }}
          style={{ ...styles.presetBtn, padding: "2px 6px", fontSize: "8px", pointerEvents: "auto" }}
          title="Close agent detail panel"
        >
          ✕
        </button>
      </div>

      {/* ── Identity ── */}
      <div style={{ marginTop: 8 }}>
        <div style={{ color: def.visual.color, fontSize: "12px", fontWeight: 700 }}>
          <span style={{ marginRight: 4 }}>{def.visual.icon}</span>
          {def.name}
        </div>
        <div style={{ ...styles.infoTextDim, marginTop: 1 }}>
          {def.role} · {def.agentId}
        </div>
      </div>

      {/* ── Status / risk / room badges ── */}
      <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {/* Status */}
        <span style={{
          fontSize: "7px", padding: "1px 5px",
          background: `${statusColor}18`, border: `1px solid ${statusColor}44`,
          borderRadius: 3, color: statusColor,
          letterSpacing: "0.07em", fontWeight: 700,
        }}>
          {status.toUpperCase()}
        </span>
        {/* Risk */}
        <span style={{
          fontSize: "7px", padding: "1px 5px",
          background: riskBg, border: `1px solid ${riskBorder}`,
          borderRadius: 3, color: riskColor, letterSpacing: "0.06em",
        }}>
          {def.riskClass.toUpperCase()} RISK
        </span>
        {/* Room */}
        <span style={{
          fontSize: "7px", padding: "1px 5px",
          background: "rgba(30,30,60,0.7)", border: "1px solid #333355",
          borderRadius: 3, color: "#7777aa", letterSpacing: "0.05em",
        }}>
          📍 {roomId}
        </span>
      </div>

      {/* Current task pill */}
      {agent.currentTaskTitle && (
        <div style={{
          marginTop: 5, fontSize: "8px", color: "#ffaa44",
          fontStyle: "italic", lineHeight: 1.4,
          borderLeft: "2px solid #ffaa4455", paddingLeft: 5,
        }}>
          ⚡ {agent.currentTaskTitle}
        </div>
      )}

      {/* ── Lifecycle controls ── */}
      <div style={{ marginTop: 8, borderTop: "1px solid #1e1e3a", paddingTop: 6 }}>
        <div style={styles.sectionLabel}>CONTROLS</div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {/* START */}
          <button
            onClick={handleStart}
            disabled={startDisabled}
            title={startDisabled ? `Already ${status}` : "Activate this agent"}
            style={{
              ...styles.presetBtn, padding: "2px 8px", fontSize: "8px",
              pointerEvents: "auto", opacity: startDisabled ? 0.38 : 1,
              color: "#44ff88", borderColor: "#44ff8844",
              background: "rgba(68,255,136,0.07)",
            }}
          >
            ▶ START
          </button>
          {/* STOP */}
          <button
            onClick={handleStop}
            disabled={stopDisabled}
            title={stopDisabled ? "Already terminated" : "Terminate this agent"}
            style={{
              ...styles.presetBtn, padding: "2px 8px", fontSize: "8px",
              pointerEvents: "auto", opacity: stopDisabled ? 0.38 : 1,
              color: "#ff5555", borderColor: "#ff555544",
              background: "rgba(255,85,85,0.07)",
            }}
          >
            ■ STOP
          </button>
          {/* RESTART */}
          <button
            onClick={handleRestart}
            title="Restart agent — clear task and reset to idle"
            style={{
              ...styles.presetBtn, padding: "2px 8px", fontSize: "8px",
              pointerEvents: "auto", color: "#ffaa44", borderColor: "#ffaa4444",
              background: "rgba(255,170,68,0.07)",
            }}
          >
            ↺ RESTART
          </button>
          {/* SEND CMD toggle */}
          <button
            onClick={() => setCmdOpen(!cmdOpen)}
            title="Send a manual command to this agent"
            style={{
              ...styles.presetBtn, padding: "2px 8px", fontSize: "8px",
              pointerEvents: "auto",
              ...(cmdOpen ? {
                background: "rgba(74,106,255,0.2)",
                borderColor: "#4a6aff",
                color: "#aaccff",
              } : {}),
            }}
          >
            ⌨ CMD
          </button>
        </div>

        {/* Command input form — visible when CMD is toggled */}
        {cmdOpen && (
          <div style={{ marginTop: 5, display: "flex", gap: 3 }}>
            <input
              type="text"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendCommand();
                if (e.key === "Escape") { setCmdOpen(false); setCmdInput(""); }
              }}
              placeholder="e.g. analyze src/…"
              style={{
                flex: 1,
                background: "rgba(8, 8, 28, 0.95)",
                border: "1px solid #4a6aff66",
                borderRadius: 3,
                color: "#aaccff",
                fontSize: "8px",
                fontFamily: "inherit",
                padding: "3px 6px",
                outline: "none",
                minWidth: 0,
              }}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <button
              onClick={handleSendCommand}
              title="Send command (Enter)"
              style={{
                ...styles.presetBtn, padding: "2px 8px", fontSize: "8px",
                pointerEvents: "auto", color: "#4a6aff", borderColor: "#4a6aff66",
                flexShrink: 0,
              }}
            >
              ↵
            </button>
          </div>
        )}
      </div>

      {/* ── Capabilities ── */}
      <div style={{ marginTop: 8, borderTop: "1px solid #1e1e3a", paddingTop: 6 }}>
        <div style={styles.sectionLabel}>CAPABILITIES</div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {def.capabilities.map((cap) => (
            <span
              key={cap}
              style={{
                fontSize: "7px", padding: "1px 5px",
                background: `${def.visual.color}10`,
                border: `1px solid ${def.visual.color}33`,
                borderRadius: 3, color: `${def.visual.color}cc`,
                letterSpacing: "0.05em",
              }}
            >
              {cap}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 5, fontSize: "8px", color: "#555577", fontStyle: "italic", lineHeight: 1.4 }}>
          {def.summary}
        </div>
      </div>

      {/* ── Agent Event Log ── */}
      <div style={{ marginTop: 8, borderTop: "1px solid #1e1e3a", paddingTop: 6 }}>
        <div style={styles.sectionLabel}>
          AGENT LOG
          {agentEvents.length > 0 && (
            <span style={{ color: "#333355", fontWeight: 400, marginLeft: 4 }}>
              ({agentEvents.length} recent)
            </span>
          )}
        </div>
        {agentEvents.length === 0 ? (
          <div style={{ ...styles.infoTextDim, fontSize: "8px" }}>— no events yet —</div>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", gap: 2,
            maxHeight: 112, overflowY: "auto",
          }}>
            {agentEvents.map((evt) => {
              const evtColor =
                evt.type === "agent.command_sent"  ? "#4a6aff"
                : evt.type === "agent.restarted"   ? "#ffaa44"
                : evt.type.includes("task")        ? "#ffcc44"
                : evt.type.includes("status")      ? statusColor
                : evt.type === "agent.selected"    ? "#4a6aff88"
                : "#555577";
              const shortType = evt.type.replace("agent.", "");
              const ts = new Date(evt.ts).toLocaleTimeString("en", {
                hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
              });
              return (
                <div
                  key={evt.id}
                  style={{
                    fontSize: "7px", color: evtColor,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: "0.04em",
                    borderLeft: `2px solid ${evtColor}55`,
                    paddingLeft: 4, lineHeight: 1.5,
                  }}
                >
                  <span style={{ color: "#444466" }}>{ts}</span>
                  {" "}
                  <span style={{ fontWeight: 700 }}>{shortType}</span>
                  {Boolean(evt.payload.command) && (
                    <span style={{ color: "#8888cc" }}>
                      {" · "}{String(evt.payload.command).slice(0, 28)}
                      {String(evt.payload.command).length > 28 ? "…" : ""}
                    </span>
                  )}
                  {Boolean(evt.payload.status) && (
                    <span style={{ color: "#8888cc" }}> → {String(evt.payload.status)}</span>
                  )}
                  {Boolean(evt.payload.prev_status) && !evt.payload.status && (
                    <span style={{ color: "#666688" }}> ({String(evt.payload.prev_status)}→idle)</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer tip ── */}
      <div style={{ marginTop: 6, borderTop: "1px solid #1a1a30", paddingTop: 5 }}>
        <div style={{ fontSize: "8px", color: "#444466" }}>
          All actions event-sourced · ESC or ✕ to close
        </div>
      </div>
    </div>
  );
}
