/**
 * ConveneMeetingDialog — Modal form for convening a meeting in a room.
 *
 * Sub-AC 10a: Meeting convocation UI trigger.
 *
 * Triggered by:
 *   1. Right-clicking a room node in the 3D scene (RoomGeometry.tsx)
 *   2. Clicking the "⚑ CONVENE" button in the RoomDetailPanel (HUD.tsx)
 *
 * Emits a structured `meeting.convene_requested` event to:
 *   - The spatial store event log (record transparency / event sourcing)
 *   - The control-plane event bus via HTTP POST (fire-and-forget)
 *
 * Form fields:
 *   - Topic (required) — short human-readable meeting title
 *   - Agenda (optional) — detailed agenda / purpose description
 *   - Participants — checkboxes for agents currently in the room
 *   - Duration — optional soft deadline in minutes
 *
 * Design: dark command-center aesthetic matching the HUD style.
 * All actions are event-sourced; no meeting is created without an audit event.
 */
import { useState, useCallback } from "react";
import { useSpatialStore, type MeetingConveneRequest } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert minutes to milliseconds (0 or undefined means "no limit"). */
function minutesToMs(minutes: number): number | undefined {
  return minutes > 0 ? minutes * 60_000 : undefined;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * ConveneMeetingDialog — overlay modal bound to the currently open
 * convene-dialog room ID in the spatial store.
 *
 * Renders nothing when `conveneDialogRoomId` is null.
 * Renders a full-screen semi-opaque backdrop + centred dialog when set.
 */
export function ConveneMeetingDialog() {
  const conveneDialogRoomId = useSpatialStore((s) => s.conveneDialogRoomId);
  const closeConveneDialog  = useSpatialStore((s) => s.closeConveneDialog);
  const convokeMeeting      = useSpatialStore((s) => s.convokeMeeting);
  const getRoomById         = useSpatialStore((s) => s.getRoomById);
  const allAgents           = useAgentStore((s) => s.agents);

  // ── Local form state ──────────────────────────────────────────────
  const [topic, setTopic]               = useState("");
  const [agenda, setAgenda]             = useState("");
  const [durationMins, setDurationMins] = useState(0);
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted]       = useState(false);

  // Render nothing if no room is targeted
  if (!conveneDialogRoomId) return null;

  const room = getRoomById(conveneDialogRoomId);
  if (!room) return null;

  // Agents in the room — pre-populate participant checkboxes
  const roomAgents = Object.values(allAgents).filter(
    (a) => a.roomId === conveneDialogRoomId,
  );

  // ── Handlers ─────────────────────────────────────────────────────

  const toggleParticipant = (agentId: string) => {
    setSelectedParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedParticipants(new Set(roomAgents.map((a) => a.def.agentId)));
  };

  const clearAll = () => {
    setSelectedParticipants(new Set());
  };

  const handleSubmit = useCallback(() => {
    if (!topic.trim()) return; // topic is required

    const request: MeetingConveneRequest = {
      roomId:              conveneDialogRoomId,
      topic:               topic.trim(),
      agenda:              agenda.trim(),
      participantIds:      Array.from(selectedParticipants),
      scheduledDurationMs: minutesToMs(durationMins),
      requestedBy:         "user",
    };

    convokeMeeting(request);
    setSubmitted(true);

    // Reset form after a brief "success" display
    setTimeout(() => {
      setTopic("");
      setAgenda("");
      setDurationMins(0);
      setSelectedParticipants(new Set());
      setSubmitted(false);
    }, 1200);
  }, [
    conveneDialogRoomId,
    topic, agenda, durationMins, selectedParticipants,
    convokeMeeting,
  ]);

  const handleCancel = useCallback(() => {
    setTopic("");
    setAgenda("");
    setDurationMins(0);
    setSelectedParticipants(new Set());
    setSubmitted(false);
    closeConveneDialog();
  }, [closeConveneDialog]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleCancel();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    /* Full-screen backdrop */
    <div
      style={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Convene Meeting"
    >
      {/* Dialog box */}
      <div style={styles.dialog}>

        {/* ── Header ── */}
        <div style={styles.header}>
          <span style={{ color: room.colorAccent, marginRight: 6, fontSize: "14px" }}>⚑</span>
          <span style={styles.headerTitle}>CONVENE MEETING</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: "#555577", fontSize: "9px", marginRight: 8 }}>
            {room.name} · Floor {room.floor}
          </span>
          <button onClick={handleCancel} style={styles.closeBtn} title="Cancel (ESC)">
            ✕
          </button>
        </div>

        {/* ── Success state ── */}
        {submitted ? (
          <div style={styles.successBanner}>
            <span style={{ fontSize: "16px", marginRight: 8 }}>✓</span>
            Meeting convocation sent to event bus!
          </div>
        ) : (
          <>
            {/* ── Topic ── */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>
                TOPIC <span style={{ color: "#ff4444" }}>*</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Sprint planning · Architecture review · Status sync"
                style={styles.input}
                maxLength={120}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </div>

            {/* ── Agenda ── */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>AGENDA (optional)</label>
              <textarea
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="Describe the meeting purpose, goals, and expected outcomes…"
                style={{ ...styles.input, ...styles.textarea }}
                maxLength={600}
                rows={3}
              />
            </div>

            {/* ── Duration ── */}
            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>DURATION (minutes · 0 = no limit)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  value={durationMins === 0 ? "" : durationMins}
                  onChange={(e) => setDurationMins(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0"
                  min={0}
                  max={480}
                  style={{ ...styles.input, width: 80 }}
                />
                {durationMins > 0 && (
                  <span style={{ fontSize: "8px", color: "#555577" }}>
                    = {durationMins} min
                  </span>
                )}
              </div>
            </div>

            {/* ── Participants ── */}
            <div style={styles.fieldGroup}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <label style={{ ...styles.fieldLabel, marginBottom: 0 }}>
                  PARTICIPANTS ({selectedParticipants.size}/{roomAgents.length})
                </label>
                <button onClick={selectAll} style={styles.tinyBtn}>ALL</button>
                <button onClick={clearAll} style={styles.tinyBtn}>NONE</button>
              </div>

              {roomAgents.length === 0 ? (
                <div style={{ fontSize: "8px", color: "#444466", fontStyle: "italic" }}>
                  — no agents currently in this room —
                </div>
              ) : (
                <div style={styles.participantList}>
                  {roomAgents.map((agent) => {
                    const isChecked = selectedParticipants.has(agent.def.agentId);
                    return (
                      <button
                        key={agent.def.agentId}
                        onClick={() => toggleParticipant(agent.def.agentId)}
                        style={{
                          ...styles.participantRow,
                          ...(isChecked ? styles.participantRowChecked(agent.def.visual.color) : {}),
                        }}
                        title={`${agent.def.name} — ${agent.status}`}
                      >
                        {/* Checkbox indicator */}
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 12,
                            height: 12,
                            border: `1px solid ${isChecked ? agent.def.visual.color : "#444466"}`,
                            borderRadius: 2,
                            fontSize: "8px",
                            color: agent.def.visual.color,
                            flexShrink: 0,
                            background: isChecked ? `${agent.def.visual.color}22` : "transparent",
                          }}
                        >
                          {isChecked ? "✓" : ""}
                        </span>
                        {/* Agent icon */}
                        <span style={{ color: agent.def.visual.color, fontSize: "11px", flexShrink: 0 }}>
                          {agent.def.visual.icon}
                        </span>
                        {/* Agent name */}
                        <span style={{ color: isChecked ? "#aaaacc" : "#666688", fontSize: "9px" }}>
                          {agent.def.visual.label}
                        </span>
                        {/* Role */}
                        <span style={{ color: "#444466", fontSize: "7px", marginLeft: "auto" }}>
                          {agent.def.role}
                        </span>
                        {/* Status dot */}
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            backgroundColor:
                              agent.status === "active" ? "#00ff88"
                              : agent.status === "busy"  ? "#ffaa00"
                              : agent.status === "error" ? "#ff4444"
                              : "#555566",
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Action buttons ── */}
            <div style={styles.actionRow}>
              <div style={{ fontSize: "7px", color: "#333355" }}>
                Ctrl+Enter to submit · ESC to cancel
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleCancel} style={styles.cancelBtn}>
                  CANCEL
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!topic.trim()}
                  style={{
                    ...styles.submitBtn,
                    ...(topic.trim() ? {} : styles.submitBtnDisabled),
                  }}
                  title={!topic.trim() ? "Topic is required" : "Convene meeting (Ctrl+Enter)"}
                >
                  ⚑ CONVENE
                </button>
              </div>
            </div>

            {/* ── Event audit hint ── */}
            <div style={styles.auditHint}>
              ● Submission records a <code style={{ color: "#4a6aff88" }}>meeting.convene_requested</code> event
              to the spatial event log and forwards it to the control-plane event bus.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0, 0, 8, 0.72)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    pointerEvents: "auto" as const,
  },
  dialog: {
    background: "rgba(5, 8, 22, 0.97)",
    border: "1px solid #2a2a5a",
    borderRadius: 6,
    padding: "16px 20px",
    minWidth: 400,
    maxWidth: 520,
    width: "90vw",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.7), 0 0 0 1px #1a1a3a",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    color: "#8888aa",
    fontSize: "11px",
    userSelect: "none" as const,
  },
  header: {
    display: "flex" as const,
    alignItems: "center",
    marginBottom: 14,
    borderBottom: "1px solid #1e1e3a",
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: "#aaaacc",
  },
  closeBtn: {
    background: "rgba(20, 20, 40, 0.7)",
    border: "1px solid #333355",
    borderRadius: 3,
    color: "#7777aa",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "10px",
    padding: "2px 7px",
    transition: "all 0.12s ease",
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    display: "block" as const,
    fontSize: "9px",
    fontWeight: 700,
    color: "#555577",
    letterSpacing: "0.1em",
    marginBottom: 4,
  },
  input: {
    width: "100%",
    background: "rgba(8, 8, 28, 0.95)",
    border: "1px solid #333366",
    borderRadius: 3,
    color: "#aaccff",
    fontSize: "10px",
    fontFamily: "inherit",
    padding: "5px 8px",
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.12s ease",
  },
  textarea: {
    resize: "vertical" as const,
    lineHeight: 1.5,
    minHeight: 60,
  },
  participantList: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: 3,
    maxHeight: 160,
    overflowY: "auto" as const,
  },
  participantRow: {
    display: "flex" as const,
    alignItems: "center",
    gap: 6,
    padding: "4px 7px",
    background: "rgba(15, 15, 35, 0.8)",
    border: "1px solid #2a2a4a",
    borderRadius: 3,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "9px",
    transition: "all 0.12s ease",
    textAlign: "left" as const,
    width: "100%",
  },
  participantRowChecked: (color: string) => ({
    background: `${color}12`,
    borderColor: `${color}44`,
  }),
  tinyBtn: {
    background: "rgba(20, 20, 40, 0.7)",
    border: "1px solid #333355",
    borderRadius: 2,
    color: "#555577",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "7px",
    padding: "1px 5px",
    letterSpacing: "0.08em",
  },
  actionRow: {
    display: "flex" as const,
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 10,
    borderTop: "1px solid #1e1e3a",
  },
  cancelBtn: {
    background: "rgba(20, 20, 40, 0.7)",
    border: "1px solid #333355",
    borderRadius: 3,
    color: "#7777aa",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "9px",
    padding: "4px 12px",
    letterSpacing: "0.06em",
    transition: "all 0.12s ease",
  },
  submitBtn: {
    background: "rgba(74, 106, 255, 0.15)",
    border: "1px solid #4a6aff88",
    borderRadius: 3,
    color: "#aaccff",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "9px",
    fontWeight: 700,
    padding: "4px 14px",
    letterSpacing: "0.08em",
    transition: "all 0.12s ease",
  },
  submitBtnDisabled: {
    opacity: 0.35,
    cursor: "not-allowed" as const,
  },
  auditHint: {
    marginTop: 8,
    fontSize: "8px",
    color: "#333355",
    lineHeight: 1.5,
  },
  successBanner: {
    display: "flex" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 0",
    fontSize: "12px",
    color: "#44ff88",
    letterSpacing: "0.08em",
  },
};
