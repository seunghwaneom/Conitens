/**
 * ActiveSessionsPanel — Overlay panel showing live collaboration sessions.
 *
 * Sub-AC 10b: Agent collaboration session spawning — session handle display.
 *
 * Renders a collapsible panel in the bottom-right corner of the HUD showing:
 *   - Active meeting sessions with their room, title, and participant count
 *   - Per-session detail view: participant list with assigned roles,
 *     shared context workspace, and channel message count
 *   - Visual role badges: facilitator / contributor / reviewer / validator etc.
 *
 * Integration:
 *   - Reads from `useMeetingStore` (Zustand) — reactive, auto-updates
 *   - Mounts once in App.tsx as a z-index overlay alongside the HUD
 *   - No 3D / React-Three-Fiber code; pure 2D DOM overlay
 *
 * Design: dark command-center monospace aesthetic matching HUD / ConveneMeetingDialog.
 * All data is read-only from the event-sourced meeting store.
 */

import { useState, useCallback } from "react";
import {
  useMeetingStore,
  type SessionHandle,
  type SessionParticipant,
  type MeetingRole,
} from "../store/meeting-store.js";

// Sub-AC 10c: session action button styles (shared between cards)
const SESSION_BTN_BASE: React.CSSProperties = {
  background:    "rgba(20, 20, 40, 0.7)",
  border:        "1px solid #333355",
  borderRadius:  3,
  cursor:        "pointer",
  fontFamily:    "'JetBrains Mono', 'Fira Code', monospace",
  fontSize:      "7px",
  fontWeight:    700,
  letterSpacing: "0.07em",
  padding:       "2px 6px",
  flexShrink:    0,
  transition:    "all 0.12s ease",
};

// ── Role colour palette ───────────────────────────────────────────────────

const ROLE_COLORS: Readonly<Record<MeetingRole, { border: string; bg: string; text: string; icon: string }>> = {
  "facilitator":       { border: "#FF7043aa", bg: "#FF704318", text: "#FF9066", icon: "♛" },
  "contributor":       { border: "#66BB6Aaa", bg: "#66BB6A18", text: "#88DD8B", icon: "⚙" },
  "context-provider":  { border: "#AB47BCaa", bg: "#AB47BC18", text: "#CC77DD", icon: "🔬" },
  "reviewer":          { border: "#42A5F5aa", bg: "#42A5F518", text: "#77C4FF", icon: "👁" },
  "validator":         { border: "#EF5350aa", bg: "#EF535018", text: "#FF8888", icon: "🛡" },
  "stakeholder":       { border: "#FFD54Faa", bg: "#FFD54F18", text: "#FFE082", icon: "◈" },
  "observer":          { border: "#90A4AEaa", bg: "#90A4AE12", text: "#B0BEC5", icon: "○" },
};

// ── Status colours ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { color: string; dot: string }> = {
  active:       { color: "#44FF88", dot: "#00DD66" },
  initializing: { color: "#FFD54F", dot: "#FFC107" },
  ended:        { color: "#555577", dot: "#444466" },
  error:        { color: "#FF4444", dot: "#CC2222" },
};

// ── Sub-components ────────────────────────────────────────────────────────

function ParticipantRow({ participant }: { participant: SessionParticipant }) {
  const roleStyle = ROLE_COLORS[participant.assigned_role] ?? ROLE_COLORS["observer"];

  return (
    <div style={styles.participantRow}>
      {/* Role badge */}
      <span
        style={{
          ...styles.roleBadge,
          border:     `1px solid ${roleStyle.border}`,
          background: roleStyle.bg,
          color:      roleStyle.text,
        }}
        title={`Role: ${participant.assigned_role}`}
      >
        {roleStyle.icon} {participant.assigned_role.toUpperCase().slice(0, 6)}
      </span>
      {/* ID */}
      <span style={styles.participantId} title={participant.participant_id}>
        {participant.participant_id.length > 22
          ? `${participant.participant_id.slice(0, 20)}…`
          : participant.participant_id}
      </span>
      {/* Kind badge */}
      <span style={styles.kindBadge}>
        {participant.participant_kind}
      </span>
    </div>
  );
}

function SessionCard({
  session,
  expanded,
  onToggle,
  onInspect,
  onTerminate,
}: {
  session: SessionHandle;
  expanded: boolean;
  onToggle: () => void;
  /** Sub-AC 10c: open the full MeetingSessionPanel for this session */
  onInspect?: () => void;
  /** Sub-AC 10c: terminate this session */
  onTerminate?: () => void;
}) {
  const statusColor = STATUS_COLORS[session.status] ?? STATUS_COLORS.ended;
  const elapsed     = session.started_at
    ? Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1_000)
    : 0;
  const elapsedStr  =
    elapsed < 60   ? `${elapsed}s`
    : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;

  return (
    <div style={{ ...styles.sessionCard, ...(session.status === "ended" ? styles.sessionCardEnded : {}) }}>
      {/* ── Header row ── */}
      <button style={styles.sessionHeader} onClick={onToggle} title="Toggle session detail">
        {/* Status dot */}
        <span
          style={{
            display:         "inline-block",
            width:           6,
            height:          6,
            borderRadius:    "50%",
            backgroundColor: statusColor.dot,
            flexShrink:      0,
            marginRight:     5,
          }}
        />
        {/* Title */}
        <span style={{ ...styles.sessionTitle, color: statusColor.color }}>
          {session.title ?? session.session_id.slice(0, 16)}
        </span>
        <span style={{ flex: 1 }} />
        {/* Room */}
        <span style={styles.sessionMeta}>{session.room_id}</span>
        {/* Participant count */}
        <span style={styles.participantCount}>
          {session.participants.length}✦
        </span>
        {/* Elapsed */}
        <span style={styles.elapsed}>{elapsedStr}</span>
        {/* Expand chevron */}
        <span style={{ color: "#444466", fontSize: "8px", marginLeft: 4 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={styles.sessionDetail}>
          {/* Session ID */}
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>SESSION</span>
            <span style={styles.detailValue} title={session.session_id}>
              {session.session_id}
            </span>
          </div>

          {/* Status */}
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>STATUS</span>
            <span style={{ ...styles.detailValue, color: statusColor.color }}>
              {session.status.toUpperCase()}
            </span>
          </div>

          {/* Channel */}
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>CHANNEL</span>
            <span style={styles.detailValue}>
              {session.channel.channel_id} · {session.channel.message_count} msg
            </span>
          </div>

          {/* Agenda (if set) */}
          {session.shared_context.agenda && (
            <div style={{ ...styles.detailRow, alignItems: "flex-start" }}>
              <span style={styles.detailLabel}>AGENDA</span>
              <span style={{ ...styles.detailValue, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {session.shared_context.agenda.slice(0, 140)}
                {session.shared_context.agenda.length > 140 ? "…" : ""}
              </span>
            </div>
          )}

          {/* Participants */}
          {session.participants.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              <div style={styles.detailLabel}>PARTICIPANTS ({session.participants.length})</div>
              <div style={styles.participantList}>
                {session.participants.map((p) => (
                  <ParticipantRow key={p.participant_id} participant={p} />
                ))}
              </div>
            </div>
          ) : (
            <div style={{ ...styles.detailLabel, fontStyle: "italic", marginTop: 4 }}>
              — no participants yet —
            </div>
          )}

          {/* Shared context workspace keys */}
          {Object.keys(session.shared_context.workspace).length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={styles.detailLabel}>
                SHARED CONTEXT ({Object.keys(session.shared_context.workspace).length} keys)
              </div>
              <div style={styles.workspaceGrid}>
                {Object.entries(session.shared_context.workspace)
                  .slice(0, 6)
                  .map(([k, v]) => (
                    <div key={k} style={styles.workspaceEntry}>
                      <span style={{ color: "#4a6aff88" }}>{k}:</span>{" "}
                      <span style={{ color: "#667799" }}>
                        {typeof v === "string"
                          ? (v.length > 20 ? `${v.slice(0, 18)}…` : v)
                          : JSON.stringify(v).slice(0, 20)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Sub-AC 10c: session action controls */}
          <div style={{ marginTop: 8, display: "flex", gap: 5 }}>
            {/* INSPECT — opens full MeetingSessionPanel */}
            {onInspect && (
              <button
                style={{
                  ...SESSION_BTN_BASE,
                  color:      "#77C4FF",
                  border:     "1px solid #42A5F544",
                  background: "rgba(66, 165, 245, 0.08)",
                  flex:       1,
                }}
                onClick={(e) => { e.stopPropagation(); onInspect(); }}
                title="Open session detail panel with transcript and controls"
              >
                ⊞ INSPECT
              </button>
            )}
            {/* TERMINATE — only for active sessions */}
            {onTerminate && session.status === "active" && (
              <button
                style={{
                  ...SESSION_BTN_BASE,
                  color:      "#FF6666",
                  border:     "1px solid rgba(255,68,68,0.3)",
                  background: "rgba(255, 68, 68, 0.06)",
                  flex:       1,
                }}
                onClick={(e) => { e.stopPropagation(); onTerminate(); }}
                title="Terminate this collaboration session"
              >
                ⏹ TERMINATE
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

/**
 * ActiveSessionsPanel — renders as a fixed overlay in the bottom-right corner.
 *
 * Collapses to a compact badge when there are no active sessions.
 * Expands to show session cards when meetings are in progress.
 */
export function ActiveSessionsPanel() {
  const sessions          = useMeetingStore((s) => s.sessions);
  const selectSession     = useMeetingStore((s) => s.selectSession);
  const terminateSession  = useMeetingStore((s) => s.terminateSession);
  const [panelOpen,    setPanelOpen]    = useState(true);
  const [expandedIds,  setExpandedIds]  = useState<Set<string>>(new Set());

  const allSessions    = Object.values(sessions);
  const activeSessions = allSessions.filter((s) => s.status === "active");
  const endedSessions  = allSessions.filter((s) => s.status === "ended");

  const toggleSession = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Sub-AC 10c: auto-expand new active sessions
  const handleInspect = useCallback((id: string) => {
    selectSession(id);
  }, [selectSession]);

  const handleTerminate = useCallback((id: string) => {
    void terminateSession(id);
  }, [terminateSession]);

  // Compact badge when panel is collapsed or no sessions
  if (!panelOpen || allSessions.length === 0) {
    return (
      <button
        style={styles.collapsedBadge}
        onClick={() => setPanelOpen(true)}
        title={
          activeSessions.length > 0
            ? `${activeSessions.length} active session(s) — click to expand`
            : "No active sessions"
        }
      >
        <span
          style={{
            display:         "inline-block",
            width:           5,
            height:          5,
            borderRadius:    "50%",
            backgroundColor: activeSessions.length > 0 ? "#00DD66" : "#444466",
            marginRight:     4,
          }}
        />
        <span style={{ color: activeSessions.length > 0 ? "#44FF88" : "#555577" }}>
          ⚑ SESSIONS
        </span>
        {activeSessions.length > 0 && (
          <span style={styles.badgeCount}>{activeSessions.length}</span>
        )}
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      {/* ── Panel header ── */}
      <div style={styles.panelHeader}>
        <span
          style={{
            display:         "inline-block",
            width:           6,
            height:          6,
            borderRadius:    "50%",
            backgroundColor: activeSessions.length > 0 ? "#00DD66" : "#444466",
            marginRight:     5,
          }}
        />
        <span style={styles.panelTitle}>COLLABORATION SESSIONS</span>
        <span style={{ flex: 1 }} />
        <span style={styles.sessionCounters}>
          {activeSessions.length > 0 && (
            <span style={{ color: "#44FF88" }}>{activeSessions.length} active</span>
          )}
          {endedSessions.length > 0 && (
            <span style={{ color: "#555577", marginLeft: 6 }}>{endedSessions.length} ended</span>
          )}
        </span>
        <button
          style={styles.collapseBtn}
          onClick={() => setPanelOpen(false)}
          title="Collapse panel"
        >
          ▼
        </button>
      </div>

      {/* ── Session list ── */}
      <div style={styles.sessionList}>
        {allSessions.length === 0 ? (
          <div style={styles.emptyState}>
            — no sessions — convene a meeting to start one —
          </div>
        ) : (
          <>
            {/* Active sessions first */}
            {activeSessions.map((s) => (
              <SessionCard
                key={s.session_id}
                session={s}
                expanded={expandedIds.has(s.session_id)}
                onToggle={() => toggleSession(s.session_id)}
                onInspect={() => handleInspect(s.session_id)}
                onTerminate={() => handleTerminate(s.session_id)}
              />
            ))}
            {/* Ended sessions (dimmed) */}
            {endedSessions.slice(-2).map((s) => (
              <SessionCard
                key={s.session_id}
                session={s}
                expanded={expandedIds.has(s.session_id)}
                onToggle={() => toggleSession(s.session_id)}
                onInspect={() => handleInspect(s.session_id)}
              />
            ))}
          </>
        )}
      </div>

      {/* ── Footer hint ── */}
      <div style={styles.footerHint}>
        ● Session handles sourced from MeetingHttpServer (port 8081)
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  collapsedBadge: {
    position:    "fixed" as const,
    bottom:      12,
    right:       12,
    background:  "rgba(5, 8, 22, 0.88)",
    border:      "1px solid #1e2040",
    borderRadius: 4,
    color:       "#555577",
    cursor:      "pointer",
    display:     "flex" as const,
    alignItems:  "center",
    fontFamily:  "'JetBrains Mono', 'Fira Code', monospace",
    fontSize:    "8px",
    letterSpacing: "0.08em",
    padding:     "4px 8px",
    zIndex:      150,
    pointerEvents: "auto" as const,
    userSelect:  "none" as const,
  },
  badgeCount: {
    marginLeft:  4,
    background:  "rgba(0, 221, 102, 0.2)",
    border:      "1px solid #00DD6688",
    borderRadius: 10,
    color:       "#00DD66",
    fontSize:    "7px",
    padding:     "0 4px",
  },
  panel: {
    position:    "fixed" as const,
    bottom:      12,
    right:       12,
    width:       320,
    maxWidth:    "90vw",
    maxHeight:   480,
    background:  "rgba(5, 8, 22, 0.94)",
    border:      "1px solid #1e2040",
    borderRadius: 6,
    boxShadow:   "0 4px 24px rgba(0, 0, 0, 0.6)",
    display:     "flex" as const,
    flexDirection: "column" as const,
    fontFamily:  "'JetBrains Mono', 'Fira Code', monospace",
    fontSize:    "10px",
    color:       "#8888aa",
    zIndex:      150,
    pointerEvents: "auto" as const,
    userSelect:  "none" as const,
    overflow:    "hidden" as const,
  },
  panelHeader: {
    display:        "flex" as const,
    alignItems:     "center",
    padding:        "8px 10px 6px",
    borderBottom:   "1px solid #1e1e3a",
    flexShrink:     0,
  },
  panelTitle: {
    fontSize:      "10px",
    fontWeight:    700 as const,
    letterSpacing: "0.1em",
    color:         "#aaaacc",
  },
  sessionCounters: {
    fontSize:  "8px",
    display:   "flex" as const,
    alignItems: "center",
    marginRight: 8,
  },
  collapseBtn: {
    background:  "rgba(20, 20, 40, 0.7)",
    border:      "1px solid #333355",
    borderRadius: 3,
    color:       "#555577",
    cursor:      "pointer",
    fontFamily:  "inherit",
    fontSize:    "8px",
    padding:     "1px 5px",
  },
  sessionList: {
    overflowY:  "auto" as const,
    flex:       1,
    padding:    "4px 0",
  },
  emptyState: {
    padding:    "12px 10px",
    fontSize:   "8px",
    color:      "#333355",
    fontStyle:  "italic" as const,
    textAlign:  "center" as const,
  },
  footerHint: {
    borderTop: "1px solid #1e1e3a",
    padding:   "4px 10px",
    fontSize:  "7px",
    color:     "#333355",
    flexShrink: 0,
  },

  // Session card
  sessionCard: {
    margin:       "3px 6px",
    borderRadius: 4,
    overflow:     "hidden" as const,
    border:       "1px solid #2a2a4a",
  },
  sessionCardEnded: {
    opacity: 0.55,
    border:  "1px solid #1e1e36",
  },
  sessionHeader: {
    display:     "flex" as const,
    alignItems:  "center",
    width:       "100%",
    background:  "rgba(15, 15, 35, 0.8)",
    border:      "none",
    cursor:      "pointer",
    fontFamily:  "inherit",
    fontSize:    "9px",
    padding:     "5px 8px",
    textAlign:   "left" as const,
  },
  sessionTitle: {
    fontWeight:    700 as const,
    letterSpacing: "0.05em",
    flex:          1,
    overflow:      "hidden" as const,
    textOverflow:  "ellipsis" as const,
    whiteSpace:    "nowrap" as const,
  },
  sessionMeta: {
    color:       "#444466",
    fontSize:    "7px",
    marginRight: 6,
  },
  participantCount: {
    color:       "#4a6aff88",
    fontSize:    "8px",
    marginRight: 4,
  },
  elapsed: {
    color:    "#444455",
    fontSize: "7px",
  },
  sessionDetail: {
    background: "rgba(8, 8, 24, 0.95)",
    padding:    "8px 10px",
    borderTop:  "1px solid #1e1e3a",
    fontSize:   "8px",
  },
  detailRow: {
    display:       "flex" as const,
    alignItems:    "center",
    gap:           8,
    marginBottom:  3,
  },
  detailLabel: {
    color:         "#444466",
    fontSize:      "7px",
    letterSpacing: "0.1em",
    fontWeight:    700 as const,
    width:         60,
    flexShrink:    0,
  },
  detailValue: {
    color:        "#667799",
    fontSize:     "8px",
    overflow:     "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace:   "nowrap" as const,
    flex:         1,
  },

  // Participants
  participantList: {
    display:       "flex" as const,
    flexDirection: "column" as const,
    gap:           2,
    marginTop:     4,
  },
  participantRow: {
    display:    "flex" as const,
    alignItems: "center",
    gap:        6,
    padding:    "2px 4px",
    background: "rgba(12, 12, 30, 0.7)",
    borderRadius: 3,
  },
  roleBadge: {
    display:       "inline-flex" as const,
    alignItems:    "center",
    gap:           3,
    borderRadius:  3,
    fontSize:      "6px",
    fontWeight:    700 as const,
    letterSpacing: "0.08em",
    padding:       "1px 4px",
    flexShrink:    0,
  },
  participantId: {
    color:    "#667799",
    fontSize: "8px",
    flex:     1,
  },
  kindBadge: {
    color:         "#333355",
    fontSize:      "6px",
    letterSpacing: "0.08em",
  },

  // Workspace
  workspaceGrid: {
    display:       "flex" as const,
    flexDirection: "column" as const,
    gap:           1,
    marginTop:     3,
    background:    "rgba(8, 8, 24, 0.6)",
    borderRadius:  3,
    padding:       "4px 6px",
  },
  workspaceEntry: {
    fontSize: "7px",
    color:    "#444466",
    fontFamily: "inherit",
  },
};
