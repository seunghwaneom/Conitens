/**
 * MeetingProtocolPanel — Meeting convocation UI control.
 *
 * Sub-AC 10d: Implement the meeting convocation UI control — a panel or
 * context action that triggers meeting creation, displays current protocol
 * stage progress, lists attending agents, and shows spawned tasks output;
 * verifiable end-to-end by inspecting event_log entries through the existing
 * control-plane visualization.
 *
 * Renders as a fixed overlay panel on the right side of the screen.
 *
 * Sections:
 *   1. Protocol stage progress stepper
 *      (convene → deliberate → resolve → adjourn)
 *   2. Attending agents roster with role badges
 *   3. Spawned tasks output with status indicators
 *   4. Event-log audit trail (recent MeetingStoreEvents for this session)
 *   5. Stage-advance controls (deliberate / resolve)
 *   6. CONVENE button when no meeting is active in the selected room
 *
 * Integration:
 *   - Reads from `useMeetingStore` — reactive to WebSocket events
 *   - Reads from `useSpatialStore` — current room selection & convene dialog
 *   - Stage-advance actions fire HTTP to the orchestrator HTTP server
 *   - All actions emit MeetingStoreEvents for record transparency
 *
 * Design: dark command-center monospace aesthetic matching HUD / ConveneMeetingDialog.
 */

import { useState, useCallback } from "react";
import {
  useMeetingStore,
  type SessionHandle,
  type SpawnedTask,
  type MeetingRole,
  type MeetingStoreEvent,
} from "../store/meeting-store.js";
import { useSpatialStore } from "../store/spatial-store.js";

// ── Protocol stage configuration ─────────────────────────────────────────

const STAGE_CONFIG = [
  {
    key:    "convene"    as const,
    label:  "CONVENE",
    icon:   "⚑",
    color:  "#00BFFF",   // cyan
    desc:   "Participants gathered, context established",
  },
  {
    key:    "deliberate" as const,
    label:  "DELIBERATE",
    icon:   "⚙",
    color:  "#FFD700",   // gold
    desc:   "Active deliberation, decisions being formed",
  },
  {
    key:    "resolve"    as const,
    label:  "RESOLVE",
    icon:   "◈",
    color:  "#FFA500",   // amber
    desc:   "Protocol resolution, tasks being spawned",
  },
  {
    key:    "adjourn"    as const,
    label:  "ADJOURN",
    icon:   "✓",
    color:  "#FF7F7F",   // coral
    desc:   "Meeting concluded, decisions recorded",
  },
] as const;

type ProtocolStageKey = (typeof STAGE_CONFIG)[number]["key"];

const STAGE_ORDER: ProtocolStageKey[] = ["convene", "deliberate", "resolve", "adjourn"];

function stageIndex(stage: string): number {
  return STAGE_ORDER.indexOf(stage as ProtocolStageKey);
}

// ── Role colors (mirrors other meeting components) ────────────────────────

const ROLE_COLORS: Readonly<Record<MeetingRole, { border: string; bg: string; text: string; icon: string }>> = {
  "facilitator":      { border: "#FF7043aa", bg: "#FF704318", text: "#FF9066", icon: "♛" },
  "contributor":      { border: "#66BB6Aaa", bg: "#66BB6A18", text: "#88DD8B", icon: "⚙" },
  "context-provider": { border: "#AB47BCaa", bg: "#AB47BC18", text: "#CC77DD", icon: "🔬" },
  "reviewer":         { border: "#42A5F5aa", bg: "#42A5F518", text: "#77C4FF", icon: "👁" },
  "validator":        { border: "#EF5350aa", bg: "#EF535018", text: "#FF8888", icon: "🛡" },
  "stakeholder":      { border: "#FFD54Faa", bg: "#FFD54F18", text: "#FFE082", icon: "◈" },
  "observer":         { border: "#90A4AEaa", bg: "#90A4AE12", text: "#B0BEC5", icon: "○" },
};

// ── Task status colors ────────────────────────────────────────────────────

const TASK_STATUS_COLORS: Record<string, { color: string; icon: string }> = {
  pending:     { color: "#777799", icon: "○" },
  assigned:    { color: "#FFD54F", icon: "→" },
  in_progress: { color: "#00BFFF", icon: "⚙" },
  completed:   { color: "#44FF88", icon: "✓" },
  failed:      { color: "#FF4444", icon: "✕" },
  cancelled:   { color: "#555577", icon: "⊘" },
};

// ── Priority indicator ────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<number, string> = {
  1: "#FF4444",
  2: "#FF8844",
  3: "#FFD700",
  4: "#88CC44",
  5: "#44BB88",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function formatTs(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Derive human-readable stage label from a Meeting entity's stage field. */
function stageLabel(stage: string | undefined): string {
  return STAGE_CONFIG.find((s) => s.key === stage)?.label ?? (stage?.toUpperCase() ?? "UNKNOWN");
}

// ── Sub-components ────────────────────────────────────────────────────────

/** Four-stage protocol progress stepper. */
function ProtocolStepper({
  currentStage,
  sessionId,
  onAdvance,
}: {
  currentStage: string;
  sessionId:    string;
  onAdvance:    (stage: ProtocolStageKey) => void;
}) {
  const idx = stageIndex(currentStage);

  return (
    <div style={styles.stepper}>
      {STAGE_CONFIG.map((stage, i) => {
        const isDone    = i < idx;
        const isCurrent = i === idx;
        const isPending = i > idx;
        const isNext    = i === idx + 1;

        return (
          <div key={stage.key} style={styles.stepperItem}>
            {/* Connector line (left of each step except first) */}
            {i > 0 && (
              <div
                style={{
                  ...styles.stepConnector,
                  background: isDone || isCurrent ? stage.color : "#1e1e3a",
                }}
              />
            )}

            {/* Step circle */}
            <div
              style={{
                ...styles.stepCircle,
                border:     `2px solid ${isCurrent || isDone ? stage.color : "#2a2a5a"}`,
                background: isCurrent ? `${stage.color}22` : isDone ? `${stage.color}18` : "transparent",
                color:      isCurrent || isDone ? stage.color : "#333355",
                fontWeight: isCurrent ? 700 : 400,
                boxShadow:  isCurrent ? `0 0 8px ${stage.color}66` : "none",
              }}
              title={stage.desc}
            >
              {isDone ? "✓" : stage.icon}
            </div>

            {/* Stage label */}
            <div
              style={{
                ...styles.stepLabel,
                color: isCurrent ? stage.color : isDone ? `${stage.color}88` : "#2a2a4a",
              }}
            >
              {stage.label}
            </div>

            {/* Advance button (shown for the next logical stage) */}
            {isNext && !isPending && currentStage !== "adjourn" && (
              <button
                style={{
                  ...styles.advanceBtn,
                  borderColor: `${stage.color}66`,
                  color:       stage.color,
                }}
                onClick={() => onAdvance(stage.key)}
                title={`Advance to ${stage.label} stage`}
              >
                ▶
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Single attending agent row with role badge. */
function AgentRow({
  participantId,
  role,
  kind,
}: {
  participantId: string;
  role:          MeetingRole;
  kind:          string;
}) {
  const roleStyle = ROLE_COLORS[role] ?? ROLE_COLORS["observer"];
  return (
    <div style={styles.agentRow}>
      <span
        style={{
          ...styles.roleBadge,
          border:     `1px solid ${roleStyle.border}`,
          background: roleStyle.bg,
          color:      roleStyle.text,
        }}
        title={`Role: ${role}`}
      >
        {roleStyle.icon}
      </span>
      <span style={styles.agentId} title={participantId}>
        {participantId.length > 20 ? `${participantId.slice(0, 18)}…` : participantId}
      </span>
      <span style={{ ...styles.kindPill, color: kind === "agent" ? "#77C4FF" : kind === "user" ? "#88DD8B" : "#FFD54F" }}>
        {kind.toUpperCase()}
      </span>
    </div>
  );
}

/** Single spawned task row with priority + status. */
function TaskRow({ task }: { task: SpawnedTask }) {
  const statusCfg = TASK_STATUS_COLORS[task.status] ?? { color: "#555577", icon: "?" };
  const priColor  = PRIORITY_COLORS[task.priority] ?? "#555577";

  return (
    <div style={styles.taskRow}>
      {/* Priority pill */}
      <span
        style={{
          ...styles.priorityPill,
          background: `${priColor}22`,
          borderColor: `${priColor}66`,
          color: priColor,
        }}
        title={`Priority ${task.priority}`}
      >
        P{task.priority}
      </span>
      {/* Status icon */}
      <span style={{ color: statusCfg.color, fontSize: "10px", flexShrink: 0 }} title={task.status}>
        {statusCfg.icon}
      </span>
      {/* Title */}
      <span style={styles.taskTitle} title={task.description || task.title}>
        {task.title.length > 28 ? `${task.title.slice(0, 26)}…` : task.title}
      </span>
      {/* Assigned to */}
      {task.assigned_to && (
        <span style={styles.assignedTo} title={`Assigned to ${task.assigned_to}`}>
          @{task.assigned_to.length > 12 ? `${task.assigned_to.slice(0, 10)}…` : task.assigned_to}
        </span>
      )}
      {/* Status badge */}
      <span style={{ ...styles.statusPill, color: statusCfg.color, borderColor: `${statusCfg.color}55` }}>
        {task.status.replace("_", " ").toUpperCase()}
      </span>
    </div>
  );
}

/** Single event-log audit entry. */
function EventLogRow({ event }: { event: MeetingStoreEvent }) {
  return (
    <div style={styles.eventRow}>
      <span style={styles.eventTime}>{formatTs(event.ts)}</span>
      <span style={styles.eventType} title={JSON.stringify(event.payload, null, 2)}>
        {event.type}
      </span>
    </div>
  );
}

// ── Main panel component ──────────────────────────────────────────────────

const ORCHESTRATOR_BASE = "http://localhost:8081";
const MAX_EVENTS_SHOWN  = 8;

/**
 * MeetingProtocolPanel — Sub-AC 10d.
 *
 * Renders when a room is selected and either:
 *   a. There is an active session for that room → shows full protocol control
 *   b. There is no active session → shows CONVENE trigger button
 */
export function MeetingProtocolPanel() {
  const selectedRoomId   = useSpatialStore((s) => s.selectedRoomId);
  const openConveneDialog = useSpatialStore((s) => s.openConveneDialog);

  const getSessionForRoom = useMeetingStore((s) => s.getSessionForRoom);
  const getMeetingEntity  = useMeetingStore((s) => s.getMeetingEntity);
  const getSpawnedTasks   = useMeetingStore((s) => s.getSpawnedTasksForSession);
  const events            = useMeetingStore((s) => s.events);
  const progressStage     = useMeetingStore((s) => s.progressMeetingStage);
  const selectSession     = useMeetingStore((s) => s.selectSession);
  const terminateSession  = useMeetingStore((s) => s.terminateSession);

  const [collapsed, setCollapsed] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  // Render nothing when no room is selected
  if (!selectedRoomId) return null;

  const session = getSessionForRoom(selectedRoomId);

  // ── No active session → show convene trigger ─────────────────────────────

  if (!session || session.status === "ended") {
    return (
      <div style={{ ...styles.panel, ...styles.panelNarrow }} role="complementary" aria-label="Meeting convocation control">
        <div style={styles.header}>
          <span style={{ color: "#00BFFF", marginRight: 5 }}>⚑</span>
          <span style={styles.headerTitle}>MEETING CONTROL</span>
        </div>
        <div style={styles.noSessionContent}>
          <div style={styles.noSessionHint}>
            No active meeting in this room.
          </div>
          <button
            style={styles.conveneBtn}
            onClick={() => openConveneDialog(selectedRoomId)}
            title="Open meeting convocation dialog for this room"
            aria-label="Convene a meeting in this room"
          >
            ⚑ CONVENE MEETING
          </button>
          <div style={styles.auditHint}>
            ● Convening records a <code style={{ color: "#4a6aff88" }}>meeting.convene_requested</code> event
          </div>
        </div>
      </div>
    );
  }

  // ── Active session → show full protocol control panel ───────────────────

  const meeting     = getMeetingEntity(session.session_id);
  const spawnedTasks = getSpawnedTasks(session.session_id);
  const currentStage = meeting?.stage ?? "convene";
  const currentIdx   = stageIndex(currentStage);

  // Filter events to this session, most-recent-first, capped at MAX_EVENTS_SHOWN
  const sessionEvents = events
    .filter((e) => e.sessionId === session.session_id)
    .slice(-MAX_EVENTS_SHOWN)
    .reverse();

  // ── Stage advance handler ──────────────────────────────────────────────

  const handleAdvance = useCallback(
    async (targetStage: ProtocolStageKey) => {
      setAdvanceError(null);

      // Optimistically advance the local store stage
      const ok = progressStage(session.session_id, targetStage);
      if (!ok) {
        setAdvanceError(`Cannot advance to ${targetStage}: invalid transition`);
        return;
      }

      // Fire HTTP request to orchestrator control-plane
      const endpoint =
        targetStage === "deliberate" ? "deliberate"
        : targetStage === "resolve"  ? "resolve"
        : null;

      if (endpoint) {
        try {
          await fetch(`${ORCHESTRATOR_BASE}/api/sessions/${session.session_id}/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ session_id: session.session_id }),
          });
        } catch {
          // Network error — store is already updated optimistically
          setAdvanceError(`HTTP call to /${endpoint} failed — store updated locally`);
        }
      }
    },
    [session.session_id, progressStage],
  );

  return (
    <div
      style={styles.panel}
      role="complementary"
      aria-label="Meeting protocol control"
      data-testid="meeting-protocol-panel"
    >
      {/* ── Panel header ── */}
      <div style={styles.header}>
        <span style={{ color: "#FFD700", marginRight: 5 }}>⚑</span>
        <span style={styles.headerTitle}>MEETING PROTOCOL</span>
        <span style={{ flex: 1 }} />
        {/* Stage badge */}
        <span
          style={{
            ...styles.stageBadge,
            color:      STAGE_CONFIG[currentIdx]?.color ?? "#555577",
            borderColor: `${STAGE_CONFIG[currentIdx]?.color ?? "#555577"}55`,
            background:  `${STAGE_CONFIG[currentIdx]?.color ?? "#555577"}11`,
          }}
          aria-label={`Current stage: ${stageLabel(currentStage)}`}
        >
          {STAGE_CONFIG[currentIdx]?.icon ?? "?"} {stageLabel(currentStage)}
        </span>
        {/* Collapse toggle */}
        <button
          style={styles.collapseBtn}
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand panel" : "Collapse panel"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "▶" : "▼"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* ── Session meta strip ── */}
          <div style={styles.metaStrip}>
            <span style={styles.metaItem} title={session.session_id}>
              <span style={styles.metaKey}>ID</span>
              <span style={styles.metaVal}>{session.session_id.slice(0, 16)}…</span>
            </span>
            <span style={styles.metaItem}>
              <span style={styles.metaKey}>ROOM</span>
              <span style={styles.metaVal}>{session.room_id}</span>
            </span>
            <span style={styles.metaItem}>
              <span style={styles.metaKey}>MSG</span>
              <span style={styles.metaVal}>{session.channel.message_count}</span>
            </span>
          </div>

          {/* ── Protocol stage stepper (Sub-AC 10d: stage progress) ── */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              PROTOCOL STAGE PROGRESS
            </div>
            <ProtocolStepper
              currentStage={currentStage}
              sessionId={session.session_id}
              onAdvance={(stage) => void handleAdvance(stage)}
            />
            {advanceError && (
              <div style={styles.errorHint} role="alert">
                ⚠ {advanceError}
              </div>
            )}
            <div style={styles.auditHint}>
              ● Stage transitions recorded as <code style={{ color: "#4a6aff66" }}>meeting.deliberation</code> /
              <code style={{ color: "#4a6aff66" }}> meeting.resolved</code> events
            </div>
          </div>

          {/* ── Attending agents (Sub-AC 10d: list attending agents) ── */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              ATTENDING AGENTS ({session.participants.length})
            </div>
            {session.participants.length === 0 ? (
              <div style={styles.emptyHint}>— no participants registered —</div>
            ) : (
              <div style={styles.agentList} role="list" aria-label="Attending agents">
                {session.participants.map((p) => (
                  <AgentRow
                    key={p.participant_id}
                    participantId={p.participant_id}
                    role={p.assigned_role}
                    kind={p.participant_kind}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Spawned tasks output (Sub-AC 10d: show spawned tasks) ── */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              SPAWNED TASKS ({spawnedTasks.length})
            </div>
            {spawnedTasks.length === 0 ? (
              <div style={styles.emptyHint}>
                {currentStage === "resolve" || currentStage === "adjourn"
                  ? "— tasks being resolved —"
                  : "— tasks spawned at resolution stage —"}
              </div>
            ) : (
              <div style={styles.taskList} role="list" aria-label="Spawned tasks">
                {spawnedTasks.map((task) => (
                  <TaskRow key={task.task_id} task={task} />
                ))}
              </div>
            )}
          </div>

          {/* ── Event-log audit trail (Sub-AC 10d: verifiable via event_log) ── */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              EVENT LOG AUDIT ({sessionEvents.length})
            </div>
            {sessionEvents.length === 0 ? (
              <div style={styles.emptyHint}>— no events recorded yet —</div>
            ) : (
              <div
                style={styles.eventList}
                role="log"
                aria-label="Event log audit trail"
                aria-live="polite"
              >
                {sessionEvents.map((e) => (
                  <EventLogRow key={e.id} event={e} />
                ))}
              </div>
            )}
          </div>

          {/* ── Controls ── */}
          <div style={styles.controlsRow}>
            <button
              style={styles.inspectBtn}
              onClick={() => selectSession(session.session_id)}
              title="Open full session detail panel"
            >
              🔍 INSPECT
            </button>
            {session.status === "active" && (
              <button
                style={styles.terminateBtn}
                onClick={() => void terminateSession(session.session_id)}
                title="Terminate this collaboration session"
              >
                ⏹ END
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position:      "fixed",
    top:           60,
    right:         12,
    width:         280,
    maxWidth:      "34vw",
    maxHeight:     "calc(100vh - 80px)",
    background:    "rgba(4, 6, 18, 0.96)",
    border:        "1px solid #2a2a4a",
    borderRadius:  6,
    boxShadow:     "0 4px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,215,0,0.06)",
    display:       "flex",
    flexDirection: "column",
    fontFamily:    "'JetBrains Mono', 'Fira Code', monospace",
    fontSize:      "10px",
    color:         "#8888aa",
    zIndex:        155,
    pointerEvents: "auto",
    userSelect:    "none",
    overflow:      "hidden",
  },
  panelNarrow: {
    maxHeight: "auto",
  },

  // Header
  header: {
    display:      "flex",
    alignItems:   "center",
    padding:      "8px 10px 6px",
    borderBottom: "1px solid #1e1e3a",
    flexShrink:   0,
    background:   "rgba(255,215,0,0.03)",
  },
  headerTitle: {
    fontSize:      "9px",
    fontWeight:    700,
    letterSpacing: "0.12em",
    color:         "#FFD700bb",
  },
  stageBadge: {
    fontSize:      "7px",
    fontWeight:    700,
    letterSpacing: "0.08em",
    padding:       "1px 5px",
    borderRadius:  3,
    border:        "1px solid",
    marginRight:   5,
    flexShrink:    0,
  },
  collapseBtn: {
    background:   "rgba(20, 20, 40, 0.7)",
    border:       "1px solid #333355",
    borderRadius: 3,
    color:        "#555577",
    cursor:       "pointer",
    fontFamily:   "inherit",
    fontSize:     "8px",
    padding:      "1px 5px",
    flexShrink:   0,
  },

  // Meta strip
  metaStrip: {
    display:      "flex",
    gap:          8,
    padding:      "4px 10px",
    borderBottom: "1px solid #161628",
    flexShrink:   0,
    flexWrap:     "wrap",
  },
  metaItem: {
    display:    "flex",
    alignItems: "center",
    gap:        3,
  },
  metaKey: {
    color:         "#333355",
    fontSize:      "6px",
    fontWeight:    700,
    letterSpacing: "0.1em",
  },
  metaVal: {
    color:    "#555577",
    fontSize: "7px",
  },

  // Section
  section: {
    borderBottom: "1px solid #161628",
    padding:      "5px 8px 6px",
    flexShrink:   0,
  },
  sectionTitle: {
    color:         "#444466",
    fontSize:      "7px",
    fontWeight:    700,
    letterSpacing: "0.1em",
    marginBottom:  4,
  },

  // Protocol stepper
  stepper: {
    display:    "flex",
    alignItems: "flex-start",
    gap:        2,
    padding:    "4px 0",
    overflowX:  "auto",
  },
  stepperItem: {
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    gap:            2,
    position:       "relative",
    flex:           1,
    minWidth:       52,
  },
  stepConnector: {
    position:  "absolute",
    top:       10,
    left:      "-50%",
    width:     "100%",
    height:    2,
    zIndex:    0,
  },
  stepCircle: {
    width:        20,
    height:       20,
    borderRadius: "50%",
    display:      "flex",
    alignItems:   "center",
    justifyContent: "center",
    fontSize:     "9px",
    zIndex:       1,
    transition:   "all 0.2s ease",
    flexShrink:   0,
  },
  stepLabel: {
    fontSize:      "6px",
    fontWeight:    700,
    letterSpacing: "0.06em",
    textAlign:     "center",
    lineHeight:    1.2,
  },
  advanceBtn: {
    background:   "transparent",
    border:       "1px solid",
    borderRadius: 3,
    cursor:       "pointer",
    fontFamily:   "inherit",
    fontSize:     "6px",
    padding:      "1px 4px",
    marginTop:    1,
    transition:   "all 0.12s ease",
  },

  // Agents
  agentList: {
    display:       "flex",
    flexDirection: "column",
    gap:           2,
    maxHeight:     90,
    overflowY:     "auto",
  },
  agentRow: {
    display:      "flex",
    alignItems:   "center",
    gap:          5,
    padding:      "2px 4px",
    background:   "rgba(12, 12, 30, 0.6)",
    borderRadius: 3,
  },
  roleBadge: {
    display:       "inline-flex",
    alignItems:    "center",
    justifyContent: "center",
    width:         16,
    height:        16,
    borderRadius:  3,
    fontSize:      "9px",
    flexShrink:    0,
    border:        "1px solid",
  },
  agentId: {
    color:    "#667799",
    fontSize: "8px",
    flex:     1,
    overflow: "hidden",
  },
  kindPill: {
    fontSize:      "6px",
    letterSpacing: "0.06em",
    flexShrink:    0,
  },

  // Tasks
  taskList: {
    display:       "flex",
    flexDirection: "column",
    gap:           2,
    maxHeight:     100,
    overflowY:     "auto",
  },
  taskRow: {
    display:      "flex",
    alignItems:   "center",
    gap:          4,
    padding:      "2px 4px",
    background:   "rgba(8, 8, 24, 0.7)",
    borderRadius: 3,
  },
  priorityPill: {
    fontSize:      "6px",
    fontWeight:    700,
    letterSpacing: "0.06em",
    padding:       "1px 3px",
    borderRadius:  2,
    border:        "1px solid",
    flexShrink:    0,
  },
  taskTitle: {
    color:        "#667799",
    fontSize:     "8px",
    flex:         1,
    overflow:     "hidden",
    textOverflow: "ellipsis",
    whiteSpace:   "nowrap",
  },
  assignedTo: {
    color:         "#444466",
    fontSize:      "7px",
    flexShrink:    0,
    overflow:      "hidden",
    textOverflow:  "ellipsis",
    whiteSpace:    "nowrap",
    maxWidth:      60,
  },
  statusPill: {
    fontSize:      "6px",
    fontWeight:    700,
    letterSpacing: "0.05em",
    padding:       "1px 3px",
    borderRadius:  2,
    border:        "1px solid",
    flexShrink:    0,
  },

  // Event log
  eventList: {
    display:       "flex",
    flexDirection: "column",
    gap:           1,
    maxHeight:     80,
    overflowY:     "auto",
  },
  eventRow: {
    display:    "flex",
    alignItems: "center",
    gap:        6,
    padding:    "1px 2px",
  },
  eventTime: {
    color:              "#333355",
    fontSize:           "6px",
    fontVariantNumeric: "tabular-nums",
    flexShrink:         0,
    minWidth:           38,
  },
  eventType: {
    color:        "#445566",
    fontSize:     "7px",
    overflow:     "hidden",
    textOverflow: "ellipsis",
    whiteSpace:   "nowrap",
    flex:         1,
    cursor:       "help",
  },

  // Controls
  controlsRow: {
    display:       "flex",
    gap:           6,
    padding:       "6px 8px",
    borderTop:     "1px solid #1a1a30",
    flexShrink:    0,
  },
  inspectBtn: {
    flex:          1,
    background:    "rgba(74, 106, 255, 0.08)",
    border:        "1px solid #4a6aff44",
    borderRadius:  4,
    color:         "#7799cc",
    cursor:        "pointer",
    fontFamily:    "inherit",
    fontSize:      "8px",
    fontWeight:    700,
    letterSpacing: "0.06em",
    padding:       "4px 0",
    transition:    "all 0.15s ease",
  },
  terminateBtn: {
    background:    "rgba(255, 68, 68, 0.08)",
    border:        "1px solid rgba(255, 68, 68, 0.35)",
    borderRadius:  4,
    color:         "#CC5555",
    cursor:        "pointer",
    fontFamily:    "inherit",
    fontSize:      "8px",
    fontWeight:    700,
    letterSpacing: "0.06em",
    padding:       "4px 10px",
    transition:    "all 0.15s ease",
  },

  // Misc
  conveneBtn: {
    width:         "100%",
    background:    "rgba(0, 191, 255, 0.08)",
    border:        "1px solid rgba(0, 191, 255, 0.35)",
    borderRadius:  4,
    color:         "#44AADD",
    cursor:        "pointer",
    fontFamily:    "inherit",
    fontSize:      "9px",
    fontWeight:    700,
    letterSpacing: "0.08em",
    padding:       "7px 0",
    marginBottom:  8,
    transition:    "all 0.15s ease",
  },
  noSessionContent: {
    padding: "10px",
  },
  noSessionHint: {
    color:        "#333355",
    fontSize:     "8px",
    fontStyle:    "italic",
    marginBottom: 10,
    textAlign:    "center",
  },
  emptyHint: {
    color:     "#333355",
    fontSize:  "7px",
    fontStyle: "italic",
    textAlign: "center",
    padding:   "6px 0",
  },
  errorHint: {
    color:        "#FF6644",
    fontSize:     "7px",
    marginTop:    4,
    padding:      "2px 6px",
    background:   "rgba(255, 100, 68, 0.08)",
    borderRadius: 3,
    border:       "1px solid rgba(255, 100, 68, 0.25)",
  },
  auditHint: {
    marginTop: 4,
    fontSize:  "7px",
    color:     "#2a2a44",
    lineHeight: 1.5,
  },
};
