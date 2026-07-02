/**
 * RoomDetailPanel — Sub-AC 4b: full room-detail view.
 */
import { useSpatialStore } from "../../store/spatial-store.js";
import { useAgentStore } from "../../store/agent-store.js";
import { styles } from "./hud-styles.js";
import { ROOM_TYPE_ICONS, ROOM_TYPE_SHAPES } from "./room-type-meta.js";
import { agentStatusColor } from "./status-colors.js";

/**
 * RoomDetailPanel — Sub-AC 4b: full room-detail view with:
 *   - Room metadata (type, floor, dimensions, access policy, occupancy, tags)
 *   - Contained agent roster with per-agent status dots
 *   - Room-level lifecycle commands: PAUSE, RESUME, INSPECT
 *   - Event-sourced — all lifecycle commands produce audit events
 */
export function RoomDetailPanel() {
  const selectedRoomId      = useSpatialStore((s) => s.selectedRoomId);
  const focusedRoomId       = useSpatialStore((s) => s.focusedRoomId);
  const getRoomById         = useSpatialStore((s) => s.getRoomById);
  const getRoomState        = useSpatialStore((s) => s.getRoomState);
  const selectRoom          = useSpatialStore((s) => s.selectRoom);
  const focusRoom           = useSpatialStore((s) => s.focusRoom);
  const pauseRoom           = useSpatialStore((s) => s.pauseRoom);
  const resumeRoom          = useSpatialStore((s) => s.resumeRoom);
  const drillIntoAgent      = useSpatialStore((s) => s.drillIntoAgent);
  const openConveneDialog   = useSpatialStore((s) => s.openConveneDialog);

  // Agent data — agents whose roomId matches the selected room
  const allAgents       = useAgentStore((s) => s.agents);
  const selectAgent     = useAgentStore((s) => s.selectAgent);
  const changeAgentStatus = useAgentStore((s) => s.changeAgentStatus);

  if (!selectedRoomId) return null;

  const room = getRoomById(selectedRoomId);
  if (!room) return null;

  const roomState   = getRoomState(selectedRoomId);
  const roleIcon    = ROOM_TYPE_ICONS[room.roomType] ?? "?";
  const roleShape   = ROOM_TYPE_SHAPES[room.roomType] ?? "Unknown";
  const isFocused   = focusedRoomId === selectedRoomId;
  const isPaused    = roomState.paused;

  // Agents currently assigned to this room
  const roomAgents = Object.values(allAgents).filter((a) => a.roomId === room.roomId);

  // ── Lifecycle command handlers ─────────────────────────────────────

  const handlePause = () => {
    pauseRoom(room.roomId);
    // Suppress activity for all agents in room
    roomAgents.forEach((agent) => {
      if (agent.status !== "inactive" && agent.status !== "terminated") {
        changeAgentStatus(agent.def.agentId, "idle", `room ${room.roomId} paused`);
      }
    });
  };

  const handleResume = () => {
    resumeRoom(room.roomId);
  };

  const handleInspect = () => {
    if (isFocused) {
      focusRoom(null);
    } else {
      focusRoom(room.roomId);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────

  const activityColor =
    isPaused         ? "#ffaa22"
    : roomState.activity === "active" ? "#00cc66"
    : roomState.activity === "busy"   ? "#ffaa00"
    : roomState.activity === "error"  ? "#ff4444"
    :                                   "#555577";

  const activityLabel = isPaused ? "PAUSED" : roomState.activity.toUpperCase();

  const occupancyLabel = room._meta
    ? `${roomAgents.length} / ${room._meta.maxOccupancy}`
    : `${roomAgents.length}`;

  const accessPolicyColor =
    room._meta?.accessPolicy === "open"               ? "#33ee88"
    : room._meta?.accessPolicy === "approval-required" ? "#ffaa22"
    :                                                    "#888899";

  return (
    <div style={styles.detailPanel}>
      {/* ── Header row: title + lifecycle buttons ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={styles.sectionLabel}>
          <span style={{ color: room.colorAccent, marginRight: 4 }}>{roleIcon}</span>
          ROOM DETAIL
          {isPaused && (
            <span
              style={{
                marginLeft: 6,
                fontSize: "7px",
                background: "rgba(255, 170, 34, 0.18)",
                border: "1px solid #ffaa2244",
                borderRadius: 3,
                padding: "1px 4px",
                color: "#ffaa22",
                letterSpacing: "0.08em",
                animation: "hud-pulse 2s ease-in-out infinite",
              }}
            >
              ⏸ PAUSED
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {/* PAUSE / RESUME toggle */}
          {!isPaused ? (
            <button
              onClick={handlePause}
              style={{
                ...styles.presetBtn,
                padding: "2px 6px",
                fontSize: "8px",
                pointerEvents: "auto",
              }}
              title="Pause all activity in this room"
            >
              ⏸ PAUSE
            </button>
          ) : (
            <button
              onClick={handleResume}
              style={{
                ...styles.presetBtn,
                padding: "2px 6px",
                fontSize: "8px",
                pointerEvents: "auto",
                background: "rgba(255, 170, 34, 0.15)",
                borderColor: "#ffaa2266",
                color: "#ffaa22",
              }}
              title="Resume room activity"
            >
              ▶ RESUME
            </button>
          )}
          {/* INSPECT — focus camera on room */}
          <button
            onClick={handleInspect}
            style={{
              ...styles.presetBtn,
              padding: "2px 6px",
              fontSize: "8px",
              pointerEvents: "auto",
              ...(isFocused ? {
                background: "rgba(74, 106, 255, 0.2)",
                borderColor: "#4a6aff",
                color: "#aaccff",
              } : {}),
            }}
            title="Focus camera on this room"
          >
            {isFocused ? "UNFOCUS" : "INSPECT"}
          </button>
          {/* CONVENE — open meeting convocation dialog */}
          <button
            onClick={() => openConveneDialog(room.roomId)}
            style={{
              ...styles.presetBtn,
              padding: "2px 6px",
              fontSize: "8px",
              pointerEvents: "auto",
              color: "#aa88ff",
              borderColor: "#aa88ff44",
              background: "rgba(170, 136, 255, 0.08)",
            }}
            title="Convene a meeting in this room — emits meeting.convene_requested event"
          >
            ⚑ CONVENE
          </button>
          {/* CLOSE */}
          <button
            onClick={() => { selectRoom(null); focusRoom(null); }}
            style={{
              ...styles.presetBtn,
              padding: "2px 6px",
              fontSize: "8px",
              pointerEvents: "auto",
            }}
            title="Close room detail panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Room name + type ── */}
      <div style={{ marginTop: 8 }}>
        <div style={{ color: room.colorAccent, fontSize: "12px", fontWeight: 700 }}>
          <span style={{ marginRight: 4 }}>{roleIcon}</span>
          {room.name}
        </div>
        <div style={styles.infoTextDim}>
          {room.roomType} ({roleShape}) · floor {room.floor} · {room.roomId}
        </div>
      </div>

      {/* ── Status badges row ── */}
      <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
        {/* Activity */}
        <span
          style={{
            fontSize: "7px",
            padding: "1px 5px",
            background: `${activityColor}18`,
            border: `1px solid ${activityColor}44`,
            borderRadius: 3,
            color: activityColor,
            letterSpacing: "0.07em",
            fontWeight: 700,
          }}
        >
          {activityLabel}
        </span>
        {/* Occupancy */}
        <span
          style={{
            fontSize: "7px",
            padding: "1px 5px",
            background: "rgba(30,30,60,0.7)",
            border: "1px solid #333355",
            borderRadius: 3,
            color: "#7777aa",
            letterSpacing: "0.06em",
          }}
          title="Current / maximum occupancy"
        >
          👤 {occupancyLabel}
        </span>
        {/* Access policy badge — only shown when _meta available */}
        {room._meta && (
          <span
            style={{
              fontSize: "7px",
              padding: "1px 5px",
              background: `${accessPolicyColor}14`,
              border: `1px solid ${accessPolicyColor}44`,
              borderRadius: 3,
              color: accessPolicyColor,
              letterSpacing: "0.06em",
            }}
            title={`Access policy: ${room._meta.accessPolicy}`}
          >
            {room._meta.accessPolicy === "open"
              ? "🔓 OPEN"
              : room._meta.accessPolicy === "members-only"
              ? "🔒 MEMBERS"
              : "🔑 APPROVAL"}
          </span>
        )}
      </div>

      {/* ── Contained agents roster ── */}
      <div style={{ marginTop: 8 }}>
        <div style={{ ...styles.sectionLabel, marginBottom: 4 }}>
          AGENTS IN ROOM ({roomAgents.length})
        </div>
        {roomAgents.length === 0 ? (
          <div style={{ ...styles.infoTextDim, fontSize: "8px" }}>— no agents assigned —</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {roomAgents.map((agent) => {
              const statusColor = agentStatusColor(agent.status);
              return (
                <button
                  key={agent.def.agentId}
                  onClick={() => {
                    selectAgent(agent.def.agentId);
                    drillIntoAgent(agent.def.agentId, agent.worldPosition);
                  }}
                  style={{
                    ...styles.presetBtn,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    textAlign: "left",
                    pointerEvents: "auto",
                    fontSize: "8px",
                    padding: "3px 6px",
                    width: "100%",
                  }}
                  title={`${agent.def.name} — ${agent.status}${agent.currentTaskTitle ? ` — ${agent.currentTaskTitle}` : ""}`}
                >
                  {/* Agent icon */}
                  <span style={{ color: agent.def.visual.color, fontSize: "10px", flexShrink: 0 }}>
                    {agent.def.visual.icon}
                  </span>
                  {/* Agent label */}
                  <span style={{ color: "#8888aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexGrow: 1 }}>
                    {agent.def.visual.label}
                  </span>
                  {/* Current task (truncated) */}
                  {agent.currentTaskTitle && (
                    <span style={{
                      fontSize: "7px",
                      color: "#555566",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 60,
                      flexShrink: 0,
                    }}>
                      {agent.currentTaskTitle}
                    </span>
                  )}
                  {/* Status dot */}
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      backgroundColor: statusColor,
                      display: "inline-block",
                      flexShrink: 0,
                      boxShadow: agent.status === "active" || agent.status === "busy"
                        ? `0 0 4px ${statusColor}`
                        : "none",
                    }}
                  />
                  {/* Status label */}
                  <span style={{
                    fontSize: "7px",
                    color: statusColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    flexShrink: 0,
                  }}>
                    {agent.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Room metadata ── */}
      <div style={{ marginTop: 8, borderTop: "1px solid #1e1e3a", paddingTop: 6 }}>
        <div style={styles.infoTextDim}>
          pos ({room.position.x}, {room.position.y}, {room.position.z}) · {room.dimensions.x}×{room.dimensions.y}×{room.dimensions.z}
        </div>
        {room._meta && (
          <>
            {room._meta.tags.length > 0 && (
              <div style={{ ...styles.infoTextDim, marginTop: 2 }}>
                tags: {room._meta.tags.join(", ")}
              </div>
            )}
            {room._meta.notes && (
              <div style={{ ...styles.infoTextDim, marginTop: 2, maxWidth: 250, lineHeight: 1.4 }}>
                {room._meta.notes}
              </div>
            )}
            <div style={{ marginTop: 3, display: "flex", gap: 8 }}>
              {room._meta.sharedFiles.length > 0 && (
                <span style={{ ...styles.infoTextDim, fontSize: "8px" }}>
                  📁 {room._meta.sharedFiles.length} file{room._meta.sharedFiles.length !== 1 ? "s" : ""}
                </span>
              )}
              <span style={{ ...styles.infoTextDim, fontSize: "8px" }}>
                mode: {room._meta.summaryMode}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Footer tip ── */}
      <div style={{ marginTop: 6, borderTop: "1px solid #1a1a30", paddingTop: 5 }}>
        <div style={{ fontSize: "8px", color: "#444466" }}>
          Click agent to drill in · ESC or ◁ BACK to ascend · Keys 1–5 presets
        </div>
      </div>
    </div>
  );
}
