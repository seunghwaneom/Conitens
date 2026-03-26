/**
 * MeetingSessionPanel — Full detail panel for an active collaboration session.
 *
 * Sub-AC 10c: Visualize active collaboration session in the 3D scene.
 *
 * Renders as a fixed overlay panel (left side of screen) showing:
 *   - Session status, title, room, and elapsed time
 *   - Participant roster with roles and kinds
 *   - Scrollable transcript feed (populated by meeting.message WS events)
 *   - Termination controls: END SESSION button (fires DELETE /api/sessions/:id)
 *
 * Triggered by:
 *   - ActiveSessionsPanel → "INSPECT" button (calls selectSession)
 *   - Closing via "×" button (calls selectSession(null))
 *
 * Design: dark command-center monospace aesthetic matching HUD /
 * ConveneMeetingDialog / ActiveSessionsPanel.
 *
 * All state changes are event-sourced through meeting-store.
 * Termination fires terminateSession() which makes an optimistic update
 * + async HTTP DELETE to the backend.
 */

import { useRef, useEffect, useCallback } from "react";
import {
  useMeetingStore,
  type SessionHandle,
  type SessionParticipant,
  type MeetingRole,
  type TranscriptEntry,
} from "../store/meeting-store.js";

// ── Role colours (mirrors ActiveSessionsPanel) ────────────────────────────

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

const STATUS_COLORS: Record<string, { color: string; dot: string; label: string }> = {
  active:       { color: "#44FF88", dot: "#00DD66", label: "ACTIVE"       },
  initializing: { color: "#FFD54F", dot: "#FFC107", label: "INITIALIZING" },
  ended:        { color: "#555577", dot: "#444466", label: "ENDED"        },
  error:        { color: "#FF4444", dot: "#CC2222", label: "ERROR"        },
};

// ── Transcript line colours ───────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  agent:  "#77C4FF",
  user:   "#88DD8B",
  system: "#FFD54F",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1_000);
  if (elapsed < 60)    return `${elapsed}s`;
  if (elapsed < 3600)  return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ── Sub-components ────────────────────────────────────────────────────────

function ParticipantRow({ participant }: { participant: SessionParticipant }) {
  const roleStyle = ROLE_COLORS[participant.assigned_role] ?? ROLE_COLORS["observer"];
  return (
    <div style={styles.participantRow}>
      <span
        style={{
          ...styles.roleBadge,
          border:     `1px solid ${roleStyle.border}`,
          background: roleStyle.bg,
          color:      roleStyle.text,
        }}
        title={`Role: ${participant.assigned_role}`}
      >
        {roleStyle.icon} {participant.assigned_role.toUpperCase().slice(0, 5)}
      </span>
      <span style={styles.participantId} title={participant.participant_id}>
        {participant.participant_id.length > 24
          ? `${participant.participant_id.slice(0, 22)}…`
          : participant.participant_id}
      </span>
      <span
        style={{
          ...styles.kindBadge,
          color: KIND_COLORS[participant.participant_kind] ?? "#555577",
        }}
      >
        {participant.participant_kind.toUpperCase()}
      </span>
    </div>
  );
}

function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  const kindColor = KIND_COLORS[entry.speakerKind] ?? "#888899";
  return (
    <div style={styles.transcriptLine}>
      <span style={styles.transcriptTime}>{formatTime(entry.ts)}</span>
      <span style={{ ...styles.transcriptSpeaker, color: kindColor }}>
        {entry.speaker.length > 18 ? `${entry.speaker.slice(0, 16)}…` : entry.speaker}
      </span>
      <span style={styles.transcriptText}>{entry.text}</span>
    </div>
  );
}

// ── Main panel component ──────────────────────────────────────────────────

/**
 * MeetingSessionPanel — renders when a session is selected via selectSession().
 *
 * Shows full session detail, transcript, and termination controls.
 * Mounts as a z-index overlay over the 3D scene, left side of screen.
 */
export function MeetingSessionPanel() {
  const selectedSessionId = useMeetingStore((s) => s.selectedSessionId);
  const sessions          = useMeetingStore((s) => s.sessions);
  const transcripts       = useMeetingStore((s) => s.transcripts);
  const selectSession     = useMeetingStore((s) => s.selectSession);
  const terminateSession  = useMeetingStore((s) => s.terminateSession);

  const session: SessionHandle | undefined = selectedSessionId
    ? sessions[selectedSessionId]
    : undefined;

  const transcript: TranscriptEntry[] = selectedSessionId
    ? (transcripts[selectedSessionId] ?? [])
    : [];

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript to bottom when new entries arrive
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript.length]);

  const handleClose = useCallback(() => {
    selectSession(null);
  }, [selectSession]);

  const handleTerminate = useCallback(async () => {
    if (!selectedSessionId) return;
    if (
      !window.confirm(
        `Terminate session "${session?.title ?? selectedSessionId}"?\n\n` +
        "This will end the collaboration session and notify all participants.",
      )
    ) {
      return;
    }
    await terminateSession(selectedSessionId);
    // Keep the panel open so the user can see the "ENDED" status
  }, [selectedSessionId, session, terminateSession]);

  // Panel not shown when no session is selected
  if (!session) return null;

  const statusStyle = STATUS_COLORS[session.status] ?? STATUS_COLORS.ended;
  const isActive    = session.status === "active";

  return (
    <div style={styles.panel} role="complementary" aria-label="Meeting session detail">
      {/* ── Panel header ── */}
      <div style={styles.header}>
        {/* Status dot */}
        <span
          style={{
            display:         "inline-block",
            width:           7,
            height:          7,
            borderRadius:    "50%",
            backgroundColor: statusStyle.dot,
            flexShrink:      0,
            marginRight:     6,
          }}
        />
        <span style={styles.headerTitle}>SESSION DETAIL</span>
        <span style={{ flex: 1 }} />
        {/* Status badge */}
        <span
          style={{
            ...styles.statusBadge,
            color:       statusStyle.color,
            border:      `1px solid ${statusStyle.color}55`,
            background:  `${statusStyle.color}11`,
          }}
        >
          {statusStyle.label}
        </span>
        {/* Close button */}
        <button style={styles.closeBtn} onClick={handleClose} title="Close detail panel">
          ×
        </button>
      </div>

      {/* ── Meta section ── */}
      <div style={styles.metaSection}>
        {/* Title */}
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>TITLE</span>
          <span style={styles.metaValue} title={session.title ?? session.session_id}>
            {session.title ?? session.session_id.slice(0, 28)}
          </span>
        </div>
        {/* Room */}
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>ROOM</span>
          <span style={styles.metaValue}>{session.room_id}</span>
        </div>
        {/* Session ID */}
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>ID</span>
          <span style={{ ...styles.metaValue, color: "#555577", fontSize: "7px" }} title={session.session_id}>
            {session.session_id}
          </span>
        </div>
        {/* Elapsed */}
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>ELAPSED</span>
          <span style={styles.metaValue}>
            {session.started_at ? formatElapsed(session.started_at) : "—"}
          </span>
        </div>
        {/* Channel */}
        <div style={styles.metaRow}>
          <span style={styles.metaLabel}>CHANNEL</span>
          <span style={styles.metaValue}>
            {session.channel.channel_id} · {session.channel.message_count} msg
          </span>
        </div>
        {/* Agenda */}
        {session.shared_context.agenda && (
          <div style={{ ...styles.metaRow, alignItems: "flex-start" }}>
            <span style={styles.metaLabel}>AGENDA</span>
            <span
              style={{
                ...styles.metaValue,
                whiteSpace:  "pre-wrap",
                lineHeight:  1.5,
                color:       "#8888aa",
              }}
            >
              {session.shared_context.agenda.slice(0, 180)}
              {session.shared_context.agenda.length > 180 ? "…" : ""}
            </span>
          </div>
        )}
      </div>

      {/* ── Participants section ── */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>
          PARTICIPANTS ({session.participants.length})
        </span>
      </div>
      <div style={styles.participantList}>
        {session.participants.length === 0 ? (
          <div style={styles.emptyHint}>— no participants —</div>
        ) : (
          session.participants.map((p) => (
            <ParticipantRow key={p.participant_id} participant={p} />
          ))
        )}
      </div>

      {/* ── Transcript feed (Sub-AC 10c) ── */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>
          TRANSCRIPT FEED
          {transcript.length > 0 && (
            <span style={{ color: "#444466", marginLeft: 6 }}>
              ({transcript.length})
            </span>
          )}
        </span>
        {transcript.length === 0 && isActive && (
          <span style={styles.liveIndicator}>● LIVE</span>
        )}
      </div>
      <div style={styles.transcriptFeed}>
        {transcript.length === 0 ? (
          <div style={styles.emptyHint}>
            {isActive
              ? "— awaiting messages — transcript updates live via WebSocket —"
              : "— no transcript recorded for this session —"}
          </div>
        ) : (
          <>
            {transcript.map((entry) => (
              <TranscriptLine key={entry.id} entry={entry} />
            ))}
            <div ref={transcriptEndRef} />
          </>
        )}
      </div>

      {/* ── Termination controls (Sub-AC 10c) ── */}
      <div style={styles.controlsSection}>
        <div style={styles.controlsHint}>
          ● All actions are event-sourced and traceable
        </div>
        {isActive ? (
          <button
            style={styles.terminateBtn}
            onClick={() => void handleTerminate()}
            title="Terminate this collaboration session"
          >
            ⏹ END SESSION
          </button>
        ) : (
          <div style={styles.endedNote}>
            Session ended
            {session.ended_at
              ? ` at ${new Date(session.ended_at).toLocaleTimeString()}`
              : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  panel: {
    position:      "fixed" as const,
    top:           60,
    left:          12,
    width:         320,
    maxWidth:      "38vw",
    maxHeight:     "calc(100vh - 80px)",
    background:    "rgba(4, 6, 18, 0.96)",
    border:        "1px solid #2a2a4a",
    borderRadius:  6,
    boxShadow:     "0 4px 32px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,215,0,0.08)",
    display:       "flex" as const,
    flexDirection: "column" as const,
    fontFamily:    "'JetBrains Mono', 'Fira Code', monospace",
    fontSize:      "10px",
    color:         "#8888aa",
    zIndex:        160,
    pointerEvents: "auto" as const,
    userSelect:    "none" as const,
    overflow:      "hidden" as const,
  },

  // Header
  header: {
    display:      "flex" as const,
    alignItems:   "center",
    padding:      "8px 10px 6px",
    borderBottom: "1px solid #1e1e3a",
    flexShrink:   0,
    background:   "rgba(255,215,0,0.04)",
  },
  headerTitle: {
    fontSize:      "10px",
    fontWeight:    700 as const,
    letterSpacing: "0.1em",
    color:         "#FFD700cc",
  },
  statusBadge: {
    fontSize:      "7px",
    fontWeight:    700 as const,
    letterSpacing: "0.1em",
    padding:       "1px 5px",
    borderRadius:  3,
    marginRight:   6,
    flexShrink:    0,
  },
  closeBtn: {
    background:  "rgba(20, 20, 40, 0.7)",
    border:      "1px solid #333355",
    borderRadius: 3,
    color:       "#555577",
    cursor:      "pointer",
    fontFamily:  "inherit",
    fontSize:    "12px",
    padding:     "0 6px",
    lineHeight:  "18px",
    flexShrink:  0,
  },

  // Meta section
  metaSection: {
    padding:      "8px 10px 4px",
    borderBottom: "1px solid #1a1a30",
    flexShrink:   0,
  },
  metaRow: {
    display:      "flex" as const,
    alignItems:   "center",
    gap:          8,
    marginBottom: 3,
  },
  metaLabel: {
    color:         "#444466",
    fontSize:      "7px",
    letterSpacing: "0.1em",
    fontWeight:    700 as const,
    width:         52,
    flexShrink:    0,
  },
  metaValue: {
    color:        "#667799",
    fontSize:     "8px",
    overflow:     "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace:   "nowrap" as const,
    flex:         1,
  },

  // Section headers
  sectionHeader: {
    display:       "flex" as const,
    alignItems:    "center",
    padding:       "5px 10px 3px",
    borderBottom:  "1px solid #161628",
    flexShrink:    0,
    background:    "rgba(10, 10, 24, 0.6)",
  },
  sectionTitle: {
    color:         "#444466",
    fontSize:      "7px",
    fontWeight:    700 as const,
    letterSpacing: "0.12em",
    flex:          1,
  },
  liveIndicator: {
    color:         "#44FF88",
    fontSize:      "6px",
    letterSpacing: "0.1em",
    animation:     "none",
  },

  // Participants
  participantList: {
    padding:    "4px 6px",
    overflowY:  "auto" as const,
    maxHeight:  120,
    flexShrink: 0,
  },
  participantRow: {
    display:      "flex" as const,
    alignItems:   "center",
    gap:          5,
    padding:      "2px 4px",
    background:   "rgba(12, 12, 30, 0.6)",
    borderRadius: 3,
    marginBottom: 2,
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
    fontSize:      "6px",
    letterSpacing: "0.08em",
    flexShrink:    0,
  },

  // Transcript feed
  transcriptFeed: {
    flex:       1,
    overflowY:  "auto" as const,
    padding:    "4px 6px",
    minHeight:  80,
    background: "rgba(4, 4, 14, 0.8)",
  },
  transcriptLine: {
    display:      "flex" as const,
    alignItems:   "flex-start",
    gap:          5,
    marginBottom: 4,
    lineHeight:   1.4,
  },
  transcriptTime: {
    color:     "#333355",
    fontSize:  "6px",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums" as const,
    paddingTop: 1,
    minWidth:   42,
  },
  transcriptSpeaker: {
    fontSize:   "7px",
    fontWeight: 700 as const,
    flexShrink: 0,
    minWidth:   80,
    maxWidth:   80,
    overflow:   "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  transcriptText: {
    color:         "#8888aa",
    fontSize:      "8px",
    flex:          1,
    wordBreak:     "break-word" as const,
    whiteSpace:    "pre-wrap" as const,
    lineHeight:    1.4,
  },
  emptyHint: {
    color:      "#333355",
    fontSize:   "7px",
    fontStyle:  "italic" as const,
    textAlign:  "center" as const,
    padding:    "10px 6px",
    lineHeight: 1.6,
  },

  // Controls
  controlsSection: {
    borderTop:     "1px solid #1e1e3a",
    padding:       "6px 10px",
    flexShrink:    0,
    display:       "flex" as const,
    flexDirection: "column" as const,
    gap:           5,
  },
  controlsHint: {
    color:     "#333355",
    fontSize:  "6px",
    letterSpacing: "0.06em",
  },
  terminateBtn: {
    background:    "rgba(255, 68, 68, 0.1)",
    border:        "1px solid rgba(255, 68, 68, 0.4)",
    borderRadius:  4,
    color:         "#FF6666",
    cursor:        "pointer",
    fontFamily:    "inherit",
    fontSize:      "8px",
    fontWeight:    700 as const,
    letterSpacing: "0.08em",
    padding:       "5px 10px",
    textAlign:     "center" as const,
    transition:    "all 0.15s ease",
    width:         "100%",
  },
  endedNote: {
    color:     "#444466",
    fontSize:  "7px",
    textAlign: "center" as const,
    fontStyle: "italic" as const,
  },
};
