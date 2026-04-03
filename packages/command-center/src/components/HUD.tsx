/**
 * HUD — Head-Up Display overlay for the 3D command center.
 *
 * Provides a diegetic-style overlay with:
 * - Building title & status
 * - Floor selector with visibility toggle
 * - Camera preset controls
 * - Legend for room types
 * - Selected room detail panel
 * - Room mapping panel (open via MAPPING button)
 * - Data source indicator
 *
 * Connected to the spatial store for dynamic data.
 */
import { useState } from "react";
import { type CameraPreset } from "../scene/CameraRig.js";
import {
  BIRDS_EYE_MIN_ZOOM,
  BIRDS_EYE_MAX_ZOOM,
  BIRDS_EYE_DEFAULT_ZOOM,
  BIRDS_EYE_KEY_PAN_STEP,
  clampBirdsEyeZoom,
  clampBirdsEyePan,
  defaultBirdsEyeView,
} from "../scene/BirdsEyeCamera.js";
import { useSpatialStore, type CameraMode, type DrillLevel } from "../store/spatial-store.js";
import { useAgentStore, type AgentRuntimeState } from "../store/agent-store.js";
import { useMetricsStore } from "../store/metrics-store.js";
import { useRoomMappingStore } from "../store/room-mapping-store.js";
import { RoomMappingPanel } from "./RoomMappingPanel.js";
import { ReplayControlPanel } from "./ReplayControlPanel.js";
import { ReplayModeOverlay } from "./ReplayModeOverlay.js";
import { ConveneMeetingDialog } from "./ConveneMeetingDialog.js";
import { ActiveSessionsPanel } from "./ActiveSessionsPanel.js";
import { MeetingSessionPanel } from "./MeetingSessionPanel.js";
import { MeetingProtocolPanel } from "./MeetingProtocolPanel.js";
import { TaskManagementPanel } from "./TaskManagementPanel.js";
import { NavigationBreadcrumb } from "./NavigationBreadcrumb.js";
import { ROLE_VISUALS } from "../scene/RoomTypeVisuals.js";
import { AGENTS } from "../data/agents.js";
import type { DataSourceMode } from "../data/data-source-config.js";

/**
 * Derive colors and icons directly from ROLE_VISUALS to keep
 * HUD legend always in sync with the 3D scene visuals.
 */
const ROOM_TYPE_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_VISUALS).map(([type, v]) => [type, v.color]),
);

/** Icon glyphs per room type — sourced from ROLE_VISUALS */
const ROOM_TYPE_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_VISUALS).map(([type, v]) => [type, v.icon]),
);

/** Geometry names per room type for legend */
const ROOM_TYPE_SHAPES: Record<string, string> = {
  control: "Octahedron",
  office: "Cube",
  lab: "Icosahedron",
  lobby: "Torus",
  archive: "Cylinder",
  corridor: "Cone",
};

/** Animation description per room type for legend */
const ROOM_TYPE_ANIM: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_VISUALS).map(([type, v]) => [type, v.animation]),
);

/**
 * RoomDetailPanel — Sub-AC 4b: full room-detail view with:
 *   - Room metadata (type, floor, dimensions, access policy, occupancy, tags)
 *   - Contained agent roster with per-agent status dots
 *   - Room-level lifecycle commands: PAUSE, RESUME, INSPECT
 *   - Event-sourced — all lifecycle commands produce audit events
 */
function RoomDetailPanel() {
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

/** Room navigation list — quick-access buttons to focus on any room */
function RoomNavigator() {
  const rooms         = useSpatialStore((s) => s.building.rooms);
  const roomStates    = useSpatialStore((s) => s.roomStates);
  const selectRoom    = useSpatialStore((s) => s.selectRoom);
  const focusRoom     = useSpatialStore((s) => s.focusRoom);
  const focusedRoomId = useSpatialStore((s) => s.focusedRoomId);
  const selectedRoomId = useSpatialStore((s) => s.selectedRoomId);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={styles.sectionLabel}>NAVIGATE TO ROOM</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 180, overflowY: "auto" }}>
        {rooms.map((room) => {
          const icon         = ROOM_TYPE_ICONS[room.roomType] ?? "?";
          const isFocused    = focusedRoomId === room.roomId;
          const isSelected   = selectedRoomId === room.roomId;
          const isHighlighted = roomStates[room.roomId]?.highlighted ?? false;
          const isActive     = isFocused || isSelected;

          return (
            <button
              key={room.roomId}
              onClick={() => {
                selectRoom(room.roomId);
                focusRoom(room.roomId);
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
                transition: "all 0.15s ease",
                ...(isActive ? {
                  background: "rgba(74, 106, 255, 0.2)",
                  borderColor: room.colorAccent,
                  color: room.colorAccent,
                } : isHighlighted ? {
                  // 3D-hover feedback: subtle left accent + glow
                  background: `${room.colorAccent}14`,
                  borderColor: `${room.colorAccent}66`,
                  borderLeftColor: room.colorAccent,
                  borderLeftWidth: 2,
                  color: `${room.colorAccent}cc`,
                } : {}),
              }}
              title={`Navigate to ${room.name}${isHighlighted ? " (hovered in 3D)" : ""}`}
            >
              <span style={{ color: room.colorAccent, fontSize: "10px" }}>{icon}</span>
              <span>{room.name}</span>
              {/* Highlight dot — appears when the room is hovered in the 3D scene */}
              {isHighlighted && !isActive && (
                <span
                  style={{
                    display:         "inline-block",
                    width:           4,
                    height:          4,
                    borderRadius:    "50%",
                    backgroundColor: room.colorAccent,
                    boxShadow:       `0 0 4px ${room.colorAccent}`,
                    animation:       "hud-pulse 1.2s ease-in-out infinite",
                    flexShrink:      0,
                  }}
                />
              )}
              <span style={{ color: "#444466", marginLeft: "auto" }}>F{room.floor}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Floor visibility toggle buttons */
function FloorToggles() {
  const floors = useSpatialStore((s) => s.building.floors);
  const floorVisibility = useSpatialStore((s) => s.floorVisibility);
  const toggleFloorVisibility = useSpatialStore((s) => s.toggleFloorVisibility);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={styles.sectionLabel}>FLOORS</div>
      <div style={{ display: "flex", gap: 4 }}>
        {floors.map((f) => (
          <button
            key={f.floor}
            onClick={() => toggleFloorVisibility(f.floor)}
            style={{
              ...styles.presetBtn,
              ...(floorVisibility[f.floor] ? styles.presetBtnActive : {}),
              pointerEvents: "auto",
            }}
          >
            F{f.floor} {f.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Camera mode toggle + Bird's-eye zoom/pan controls */
function CameraModeControls({ cameraPreset, onPresetChange }: {
  cameraPreset: CameraPreset;
  onPresetChange: (preset: CameraPreset) => void;
}) {
  const cameraMode = useSpatialStore((s) => s.cameraMode);
  const setCameraMode = useSpatialStore((s) => s.setCameraMode);
  const birdsEyeZoom = useSpatialStore((s) => s.birdsEyeZoom);
  const birdsEyePan = useSpatialStore((s) => s.birdsEyePan);
  const setBirdsEyeZoom = useSpatialStore((s) => s.setBirdsEyeZoom);
  const setBirdsEyePan = useSpatialStore((s) => s.setBirdsEyePan);

  return (
    <>
      {/* Camera mode toggle */}
      <div style={styles.sectionLabel}>CAMERA MODE <span style={{ color: "#333355", fontWeight: 400 }}>— press B to toggle</span></div>
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginBottom: 8 }}>
        <button
          onClick={() => setCameraMode("perspective")}
          style={{
            ...styles.presetBtn,
            ...(cameraMode === "perspective" ? styles.presetBtnActive : {}),
            pointerEvents: "auto",
          }}
          title="Perspective orbit camera (B key to toggle)"
        >
          ◇ PERSPECTIVE
        </button>
        <button
          onClick={() => setCameraMode("birdsEye")}
          style={{
            ...styles.presetBtn,
            ...(cameraMode === "birdsEye" ? styles.presetBtnActive : {}),
            pointerEvents: "auto",
          }}
          title="Bird's-eye orthographic top-down (B key to toggle)"
        >
          ◎ BIRD&apos;S EYE
        </button>
      </div>

      {/* Perspective camera presets (only when in perspective mode) */}
      {cameraMode === "perspective" && (
        <>
          <div style={styles.sectionLabel}>CAMERA PRESET</div>
          <div style={styles.presetRow}>
            {(
              ["overview", "overhead", "cutaway", "groundFloor", "opsFloor"] as CameraPreset[]
            ).map((preset) => (
              <button
                key={preset}
                onClick={() => onPresetChange(preset)}
                style={{
                  ...styles.presetBtn,
                  ...(cameraPreset === preset ? styles.presetBtnActive : {}),
                }}
              >
                {preset.replace(/([A-Z])/g, " $1").toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Bird's-eye zoom & pan controls (only when in birds-eye mode) */}
      {cameraMode === "birdsEye" && (
        <>
          {/* ── Zoom row ── */}
          <div style={styles.sectionLabel}>ZOOM</div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
            <button
              onClick={() => setBirdsEyeZoom(clampBirdsEyeZoom(birdsEyeZoom, 2))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: "4px 10px" }}
              title="Zoom out (- key)"
            >
              −
            </button>
            {/* Zoom bar: filled fraction = (MAX - current) / (MAX - MIN) so full = zoomed in */}
            <div style={{ ...styles.zoomBar, width: 80 }}>
              <div style={{
                ...styles.zoomBarFill,
                width: `${((BIRDS_EYE_MAX_ZOOM - birdsEyeZoom) / (BIRDS_EYE_MAX_ZOOM - BIRDS_EYE_MIN_ZOOM)) * 100}%`,
              }} />
              <span style={styles.zoomLabel}>
                {Math.round(((BIRDS_EYE_MAX_ZOOM - birdsEyeZoom) / (BIRDS_EYE_MAX_ZOOM - BIRDS_EYE_MIN_ZOOM)) * 100)}%
              </span>
            </div>
            <button
              onClick={() => setBirdsEyeZoom(clampBirdsEyeZoom(birdsEyeZoom, -2))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: "4px 10px" }}
              title="Zoom in (+ key)"
            >
              +
            </button>
          </div>

          {/* ── Pan directional pad (Sub-AC 3a) ── */}
          <div style={styles.sectionLabel}>PAN</div>
          {/*
           * 4-direction arrow pad for explicit click-to-pan navigation.
           * Each button calls clampBirdsEyePan to apply the same clamping
           * logic as the keyboard/mouse handlers in BirdsEyeCamera.tsx.
           *
           * Layout (3×3 grid):
           *   [  ]  [↑]  [  ]
           *   [←]  [·]  [→]
           *   [  ]  [↓]  [  ]
           */}
          <div
            role="group"
            aria-label="Pan controls"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 26px)",
              gridTemplateRows: "repeat(3, 22px)",
              gap: 2,
              justifyContent: "flex-end",
              marginTop: 2,
              marginBottom: 2,
            }}
          >
            {/* Row 1: [empty] [↑] [empty] */}
            <span />
            <button
              onClick={() => setBirdsEyePan(clampBirdsEyePan(birdsEyePan, [0, -BIRDS_EYE_KEY_PAN_STEP]))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: 0, fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Pan north (↑ key)"
              aria-label="Pan up"
            >
              ↑
            </button>
            <span />

            {/* Row 2: [←] [·] [→] */}
            <button
              onClick={() => setBirdsEyePan(clampBirdsEyePan(birdsEyePan, [-BIRDS_EYE_KEY_PAN_STEP, 0]))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: 0, fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Pan west (← key)"
              aria-label="Pan left"
            >
              ←
            </button>
            {/* Center dot — clicking resets to center-pan (but not zoom) */}
            <button
              onClick={() => setBirdsEyePan([0, 0])}
              style={{
                ...styles.presetBtn,
                pointerEvents: "auto",
                padding: 0,
                fontSize: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(74, 106, 255, 0.1)",
                borderColor: "#4a6aff44",
              }}
              title="Re-center pan (click to return to building center)"
              aria-label="Center pan"
            >
              ·
            </button>
            <button
              onClick={() => setBirdsEyePan(clampBirdsEyePan(birdsEyePan, [BIRDS_EYE_KEY_PAN_STEP, 0]))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: 0, fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Pan east (→ key)"
              aria-label="Pan right"
            >
              →
            </button>

            {/* Row 3: [empty] [↓] [empty] */}
            <span />
            <button
              onClick={() => setBirdsEyePan(clampBirdsEyePan(birdsEyePan, [0, BIRDS_EYE_KEY_PAN_STEP]))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: 0, fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Pan south (↓ key)"
              aria-label="Pan down"
            >
              ↓
            </button>
            <span />
          </div>

          {/* ── Reset view ── */}
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              onClick={() => {
                const { zoom, pan } = defaultBirdsEyeView();
                setBirdsEyePan(pan);
                setBirdsEyeZoom(zoom);
              }}
              style={{ ...styles.presetBtn, pointerEvents: "auto", fontSize: "8px" }}
              title={`Reset view to center, zoom ${BIRDS_EYE_DEFAULT_ZOOM} (Home key)`}
            >
              ⌂ RESET VIEW
            </button>
          </div>
          <div style={{ marginTop: 4, fontSize: "8px", color: "#444466", textAlign: "right" }}>
            Scroll to zoom · Shift+drag to pan · Arrow keys · Home to reset · B to exit
          </div>
        </>
      )}
    </>
  );
}

/** Agent status color helper */
function agentStatusColor(status: string): string {
  switch (status) {
    case "inactive":   return "#555566";
    case "idle":       return "#888899";
    case "active":     return "#00ff88";
    case "busy":       return "#ffaa00";
    case "error":      return "#ff4444";
    case "terminated": return "#333344";
    default:           return "#555577";
  }
}

/** Agent roster — shows all agents with their status */
function AgentRoster() {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const initialized = useAgentStore((s) => s.initialized);

  if (!initialized) return null;

  const agentList = Object.values(agents);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={styles.sectionLabel}>AGENTS ({agentList.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {agentList.map((agent) => {
          const isSelected = selectedAgentId === agent.def.agentId;
          return (
            <button
              key={agent.def.agentId}
              onClick={() => selectAgent(isSelected ? null : agent.def.agentId)}
              style={{
                ...styles.presetBtn,
                display: "flex",
                alignItems: "center",
                gap: 4,
                textAlign: "left",
                pointerEvents: "auto",
                fontSize: "8px",
                padding: "3px 6px",
                ...(isSelected ? {
                  background: "rgba(74, 106, 255, 0.2)",
                  borderColor: agent.def.visual.color,
                  color: agent.def.visual.color,
                } : {}),
              }}
              title={`${agent.def.name} — ${agent.status} — ${agent.def.summary}`}
            >
              <span style={{ color: agent.def.visual.color, fontSize: "10px" }}>
                {agent.def.visual.icon}
              </span>
              <span style={{ color: isSelected ? agent.def.visual.color : "#7777aa" }}>
                {agent.def.visual.label}
              </span>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: agentStatusColor(agent.status),
                  display: "inline-block",
                  marginLeft: "auto",
                  flexShrink: 0,
                }}
              />
              <span style={{
                fontSize: "7px",
                color: agentStatusColor(agent.status),
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                {agent.status}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
function AgentDetailPanel() {
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

// ── Building Entry Hint + Floor Context Panel (Sub-AC 4a) ────────────────────

/**
 * BuildingContextPanel — Full control-plane context panel for the building node.
 *
 * Visible at "building" drill level. Provides:
 *  - Building name with inline rename affordance
 *  - Aggregate stats: floor count, room count, agent status breakdown
 *  - Office-level bulk lifecycle controls: START ALL / STOP ALL agents
 *  - Floor list with click-to-enter buttons
 *  - "Click building or floor to enter" affordance text
 *
 * All lifecycle actions and rename operations are event-sourced via the
 * spatial and agent stores, maintaining full record transparency.
 *
 * Sub-AC 4a: Clicking/selecting the building triggers this context panel.
 */
function BuildingContextPanel() {
  const drillLevel                 = useSpatialStore((s) => s.drillLevel);
  const building                   = useSpatialStore((s) => s.building);
  const drillIntoFloor             = useSpatialStore((s) => s.drillIntoFloor);
  const updateBuildingName         = useSpatialStore((s) => s.updateBuildingName);
  const recordOfficeBulkLifecycle  = useSpatialStore((s) => s.recordOfficeBulkLifecycle);

  const agents                     = useAgentStore((s) => s.agents);
  const startAllAgentsInScope      = useAgentStore((s) => s.startAllAgentsInScope);
  const stopAllAgentsInScope       = useAgentStore((s) => s.stopAllAgentsInScope);

  const [renaming, setRenaming]     = useState(false);
  const [nameInput, setNameInput]   = useState("");

  // Only show at the building overview level
  if (drillLevel !== "building") return null;

  // ── Aggregate stats ────────────────────────────────────────────────
  const agentList = Object.values(agents);
  const byStatus = agentList.reduce(
    (acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );
  const activeCount     = (byStatus["active"] ?? 0) + (byStatus["busy"] ?? 0);
  const idleCount       = byStatus["idle"] ?? 0;
  const inactiveCount   = byStatus["inactive"] ?? 0;
  const terminatedCount = byStatus["terminated"] ?? 0;
  const errorCount      = byStatus["error"] ?? 0;

  // ── Rename handlers ────────────────────────────────────────────────
  const handleBeginRename = () => {
    setNameInput(building.name ?? "");
    setRenaming(true);
  };

  const handleCommitRename = () => {
    const trimmed = nameInput.trim();
    if (trimmed) updateBuildingName(trimmed);
    setRenaming(false);
  };

  const handleRenameKeyDown = (e: { key: string }) => {
    if (e.key === "Enter")  handleCommitRename();
    if (e.key === "Escape") setRenaming(false);
  };

  // ── Bulk lifecycle handlers ────────────────────────────────────────
  const handleStartAll = () => {
    recordOfficeBulkLifecycle("office.start_all", "building");
    startAllAgentsInScope("building");
  };

  const handleStopAll = () => {
    recordOfficeBulkLifecycle("office.stop_all", "building");
    stopAllAgentsInScope("building");
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        background: "rgba(5, 8, 20, 0.88)",
        border: "1px solid #2a2a4a",
        borderRadius: 5,
        padding: "10px 16px",
        backdropFilter: "blur(10px)",
        pointerEvents: "auto",
        userSelect: "none",
        zIndex: 20,
        boxShadow: "0 2px 16px rgba(0,0,0,0.55)",
        minWidth: 280,
        maxWidth: 380,
      }}
    >
      {/* ── Building header with rename ──────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        <span style={{ color: "#4a6aff", fontSize: "15px", flexShrink: 0 }}>⬡</span>
        {renaming ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleCommitRename}
            onKeyDown={handleRenameKeyDown}
            style={{
              background: "rgba(74, 106, 255, 0.12)",
              border: "1px solid #4a6aff",
              borderRadius: 3,
              color: "#ccccff",
              fontFamily: "inherit",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "2px 6px",
              outline: "none",
              width: "100%",
            }}
          />
        ) : (
          <span
            onClick={handleBeginRename}
            title="Click to rename building"
            style={{
              color: "#aaaacc",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "text",
              flex: 1,
            }}
          >
            {building.name ?? "HQ"}
          </span>
        )}
        <span
          onClick={handleBeginRename}
          title="Rename building"
          style={{
            color: "#333355",
            fontSize: "9px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          ✎
        </span>
      </div>

      {/* ── Aggregate stats ──────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
          fontSize: "8px",
          letterSpacing: "0.06em",
        }}
      >
        <span style={{ color: "#555577" }}>
          {building.floors.length}F · {building.rooms.length}R
        </span>
        {activeCount > 0 && (
          <span style={{ color: "#00ff88" }}>▲ {activeCount} active</span>
        )}
        {idleCount > 0 && (
          <span style={{ color: "#8888aa" }}>○ {idleCount} idle</span>
        )}
        {inactiveCount > 0 && (
          <span style={{ color: "#555566" }}>· {inactiveCount} inactive</span>
        )}
        {terminatedCount > 0 && (
          <span style={{ color: "#333344" }}>✕ {terminatedCount} terminated</span>
        )}
        {errorCount > 0 && (
          <span style={{ color: "#ff4444" }}>⚠ {errorCount} error</span>
        )}
      </div>

      {/* ── Bulk lifecycle controls ─────────────────────────────────── */}
      <div style={{ display: "flex", gap: 5 }}>
        <button
          onClick={handleStartAll}
          title="Start all inactive/terminated agents in the building"
          style={{
            padding: "3px 10px",
            fontSize: "8px",
            fontFamily: "inherit",
            background: "rgba(0, 255, 136, 0.10)",
            border: "1px solid #00ff8844",
            borderRadius: 3,
            color: "#00cc88",
            cursor: "pointer",
            letterSpacing: "0.07em",
            transition: "all 0.12s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,136,0.20)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#00ff88";
            (e.currentTarget as HTMLButtonElement).style.color = "#00ff88";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,136,0.10)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#00ff8844";
            (e.currentTarget as HTMLButtonElement).style.color = "#00cc88";
          }}
        >
          ▶ START ALL
        </button>
        <button
          onClick={handleStopAll}
          title="Stop all active/idle agents in the building"
          style={{
            padding: "3px 10px",
            fontSize: "8px",
            fontFamily: "inherit",
            background: "rgba(255, 68, 68, 0.10)",
            border: "1px solid #ff444444",
            borderRadius: 3,
            color: "#cc4444",
            cursor: "pointer",
            letterSpacing: "0.07em",
            transition: "all 0.12s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,68,68,0.20)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff4444";
            (e.currentTarget as HTMLButtonElement).style.color = "#ff4444";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,68,68,0.10)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff444444";
            (e.currentTarget as HTMLButtonElement).style.color = "#cc4444";
          }}
        >
          ■ STOP ALL
        </button>
      </div>

      {/* ── Floor list — click to enter ───────────────────────────── */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
        {building.floors.map((f) => {
          const roomsOnFloor = building.rooms.filter((r) => r.floor === f.floor).length;
          const agentsOnFloor = agentList.filter((a) => {
            const room = building.rooms.find((r) => r.roomId === a.roomId);
            return room?.floor === f.floor;
          });
          const floorActive = agentsOnFloor.filter(
            (a) => a.status === "active" || a.status === "busy",
          ).length;
          return (
            <button
              key={f.floor}
              onClick={() => drillIntoFloor(f.floor)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "5px 10px",
                background: "rgba(74, 106, 255, 0.10)",
                border: "1px solid #3a3a6a",
                borderRadius: 4,
                color: "#8888cc",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "9px",
                letterSpacing: "0.06em",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(74,106,255,0.22)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#4a6aff";
                (e.currentTarget as HTMLButtonElement).style.color = "#aaccff";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(74,106,255,0.10)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#3a3a6a";
                (e.currentTarget as HTMLButtonElement).style.color = "#8888cc";
              }}
              title={`Enter floor ${f.floor}: ${f.name} (${roomsOnFloor} rooms, ${agentsOnFloor.length} agents)`}
            >
              <span style={{ fontSize: "10px" }}>▤</span>
              <span style={{ fontWeight: 700 }}>F{f.floor}</span>
              <span style={{
                color: "#555577",
                fontSize: "7px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}>
                {f.name}
              </span>
              <span style={{ color: "#444466", fontSize: "7px" }}>
                {roomsOnFloor}R
                {floorActive > 0 && (
                  <span style={{ color: "#00ff88", marginLeft: 3 }}>▲{floorActive}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Affordance hint */}
      <div
        style={{
          fontSize: "7px",
          color: "#333355",
          letterSpacing: "0.07em",
          textTransform: "uppercase",
        }}
      >
        ↵ click floor to enter · ✎ click name to rename · ESC to reset
      </div>
    </div>
  );
}

/** @deprecated Superseded by BuildingContextPanel (Sub-AC 4a). */
// BuildingEntryHint removed — see BuildingContextPanel above.

/**
 * FloorContextPanel — Full control-plane context panel for a floor (office) node.
 *
 * Visible when drillLevel === "floor". Provides:
 *  - Floor name with inline rename affordance
 *  - Aggregate stats: agent status breakdown for agents on this floor
 *  - Floor-level bulk lifecycle controls: START ALL / STOP ALL agents on floor
 *  - Room quick-select row
 *  - Navigation hint
 *
 * All lifecycle actions and rename operations are event-sourced (record transparency).
 *
 * Sub-AC 4a: Selecting an office/floor node triggers this context panel.
 */
function FloorContextPanel() {
  const drillLevel                 = useSpatialStore((s) => s.drillLevel);
  const drillFloor                 = useSpatialStore((s) => s.drillFloor);
  const building                   = useSpatialStore((s) => s.building);
  const drillIntoRoom              = useSpatialStore((s) => s.drillIntoRoom);
  const updateFloorName            = useSpatialStore((s) => s.updateFloorName);
  const recordOfficeBulkLifecycle  = useSpatialStore((s) => s.recordOfficeBulkLifecycle);

  const agents                     = useAgentStore((s) => s.agents);
  const startAllAgentsInScope      = useAgentStore((s) => s.startAllAgentsInScope);
  const stopAllAgentsInScope       = useAgentStore((s) => s.stopAllAgentsInScope);

  const [renaming, setRenaming]     = useState(false);
  const [nameInput, setNameInput]   = useState("");

  // Only show at floor level
  if (drillLevel !== "floor" || drillFloor === null) return null;

  const floorDef  = building.floors.find((f) => f.floor === drillFloor);
  const roomsList = building.rooms.filter((r) => r.floor === drillFloor);

  if (!floorDef) return null;

  // ── Aggregate stats for this floor ────────────────────────────────
  const floorRoomIds = new Set(roomsList.map((r) => r.roomId));
  const floorAgents  = Object.values(agents).filter((a) => floorRoomIds.has(a.roomId));
  const byStatus = floorAgents.reduce(
    (acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );
  const activeCount     = (byStatus["active"] ?? 0) + (byStatus["busy"] ?? 0);
  const idleCount       = byStatus["idle"] ?? 0;
  const inactiveCount   = byStatus["inactive"] ?? 0;
  const terminatedCount = byStatus["terminated"] ?? 0;

  // ── Rename handlers ────────────────────────────────────────────────
  const handleBeginRename = () => {
    setNameInput(floorDef.name ?? "");
    setRenaming(true);
  };

  const handleCommitRename = () => {
    const trimmed = nameInput.trim();
    if (trimmed) updateFloorName(drillFloor, trimmed);
    setRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter")  handleCommitRename();
    if (e.key === "Escape") setRenaming(false);
  };

  // ── Bulk lifecycle handlers ────────────────────────────────────────
  const handleStartAll = () => {
    recordOfficeBulkLifecycle("office.start_all", "floor", drillFloor);
    startAllAgentsInScope("floor", drillFloor);
  };

  const handleStopAll = () => {
    recordOfficeBulkLifecycle("office.stop_all", "floor", drillFloor);
    stopAllAgentsInScope("floor", drillFloor);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 60,   // below the DrillBreadcrumb
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        background: "rgba(5, 8, 20, 0.86)",
        border: "1px solid #2a2a4a",
        borderRadius: 4,
        padding: "8px 14px",
        backdropFilter: "blur(8px)",
        pointerEvents: "auto",
        userSelect: "none",
        zIndex: 19,
        boxShadow: "0 2px 12px rgba(0,0,0,0.45)",
        maxWidth: 400,
        minWidth: 260,
      }}
    >
      {/* ── Floor header with rename ─────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
        <span style={{ color: "#6a8aff", fontSize: "11px", flexShrink: 0 }}>▤</span>
        <span style={{ color: "#555577", fontSize: "8px", letterSpacing: "0.08em", flexShrink: 0 }}>
          F{drillFloor}
        </span>
        {renaming ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleCommitRename}
            onKeyDown={handleRenameKeyDown}
            style={{
              background: "rgba(106, 138, 255, 0.12)",
              border: "1px solid #6a8aff",
              borderRadius: 3,
              color: "#aaccff",
              fontFamily: "inherit",
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "2px 5px",
              outline: "none",
              flex: 1,
            }}
          />
        ) : (
          <span
            onClick={handleBeginRename}
            title="Click to rename this floor/office"
            style={{
              color: "#7788aa",
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "text",
              flex: 1,
            }}
          >
            {floorDef.name.toUpperCase()}
          </span>
        )}
        <span
          onClick={handleBeginRename}
          title="Rename floor"
          style={{ color: "#333355", fontSize: "9px", cursor: "pointer", flexShrink: 0 }}
        >
          ✎
        </span>
        <span style={{ color: "#444466", fontSize: "8px", flexShrink: 0 }}>
          {roomsList.length}R
        </span>
      </div>

      {/* ── Aggregate stats ──────────────────────────────────────────── */}
      {floorAgents.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 7,
            flexWrap: "wrap",
            justifyContent: "center",
            fontSize: "7px",
            letterSpacing: "0.06em",
          }}
        >
          {activeCount > 0 && (
            <span style={{ color: "#00ff88" }}>▲ {activeCount} active</span>
          )}
          {idleCount > 0 && (
            <span style={{ color: "#8888aa" }}>○ {idleCount} idle</span>
          )}
          {inactiveCount > 0 && (
            <span style={{ color: "#555566" }}>· {inactiveCount} inactive</span>
          )}
          {terminatedCount > 0 && (
            <span style={{ color: "#333344" }}>✕ {terminatedCount} terminated</span>
          )}
          {floorAgents.length === 0 && (
            <span style={{ color: "#333344" }}>— no agents —</span>
          )}
        </div>
      )}

      {/* ── Bulk lifecycle controls ─────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={handleStartAll}
          title={`Start all inactive/terminated agents on floor ${drillFloor}`}
          style={{
            padding: "2px 8px",
            fontSize: "7px",
            fontFamily: "inherit",
            background: "rgba(0, 255, 136, 0.08)",
            border: "1px solid #00ff8833",
            borderRadius: 3,
            color: "#00aa66",
            cursor: "pointer",
            letterSpacing: "0.07em",
            transition: "all 0.12s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,136,0.18)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#00ff88";
            (e.currentTarget as HTMLButtonElement).style.color = "#00ff88";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,136,0.08)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#00ff8833";
            (e.currentTarget as HTMLButtonElement).style.color = "#00aa66";
          }}
        >
          ▶ START ALL
        </button>
        <button
          onClick={handleStopAll}
          title={`Stop all active/idle agents on floor ${drillFloor}`}
          style={{
            padding: "2px 8px",
            fontSize: "7px",
            fontFamily: "inherit",
            background: "rgba(255, 68, 68, 0.08)",
            border: "1px solid #ff444433",
            borderRadius: 3,
            color: "#aa3333",
            cursor: "pointer",
            letterSpacing: "0.07em",
            transition: "all 0.12s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,68,68,0.18)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff4444";
            (e.currentTarget as HTMLButtonElement).style.color = "#ff4444";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,68,68,0.08)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#ff444433";
            (e.currentTarget as HTMLButtonElement).style.color = "#aa3333";
          }}
        >
          ■ STOP ALL
        </button>
      </div>

      {/* Room quick-select row */}
      {roomsList.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          {roomsList.map((room) => {
            const icon = ROOM_TYPE_ICONS[room.roomType] ?? "?";
            return (
              <button
                key={room.roomId}
                onClick={() => drillIntoRoom(room.roomId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "2px 7px",
                  background: `${room.colorAccent}12`,
                  border: `1px solid ${room.colorAccent}44`,
                  borderRadius: 3,
                  color: `${room.colorAccent}cc`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "8px",
                  letterSpacing: "0.05em",
                  transition: "all 0.12s ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = `${room.colorAccent}28`;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = room.colorAccent;
                  (e.currentTarget as HTMLButtonElement).style.color = room.colorAccent;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = `${room.colorAccent}12`;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${room.colorAccent}44`;
                  (e.currentTarget as HTMLButtonElement).style.color = `${room.colorAccent}cc`;
                }}
                title={`Drill into ${room.name}`}
              >
                <span style={{ fontSize: "9px" }}>{icon}</span>
                <span>{room.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Click hint */}
      <div style={{ fontSize: "7px", color: "#333355", letterSpacing: "0.06em" }}>
        click room to drill in · ESC or ◁ to ascend
      </div>
    </div>
  );
}

// ── Drill-Down Breadcrumb (Sub-AC 3.3) ───────────────────────────────────────
// NOTE: Superseded by the dedicated NavigationBreadcrumb component imported
// from ./NavigationBreadcrumb.tsx.  The inline DrillBreadcrumb below is kept
// for reference but is no longer rendered in the HUD.
//
// The HUD now uses: <NavigationBreadcrumb /> — see Sub-AC 3.3 implementation.

/**
 * @deprecated Use <NavigationBreadcrumb /> instead (Sub-AC 3.3).
 *
 * DrillBreadcrumb — inline predecessor of NavigationBreadcrumb.
 * Kept for reference; no longer rendered in the HUD.
 *
 * Design principles:
 * - Each segment is clickable to ascend back to that level.
 * - The back (◁) button ascends one level.
 * - ESC key hint reminds users of the keyboard shortcut.
 * - Only renders when drilled below the building level.
 * - Record-transparent: every ascent is event-sourced via drillAscend().
 */
function DrillBreadcrumb() {
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillFloor = useSpatialStore((s) => s.drillFloor);
  const drillRoom  = useSpatialStore((s) => s.drillRoom);
  const drillAgent = useSpatialStore((s) => s.drillAgent);
  const drillAscend  = useSpatialStore((s) => s.drillAscend);
  const drillIntoFloor = useSpatialStore((s) => s.drillIntoFloor);
  const drillIntoRoom  = useSpatialStore((s) => s.drillIntoRoom);
  const building = useSpatialStore((s) => s.building);

  const agents = useAgentStore((s) => s.agents);

  // Only show when drilled below building
  if (drillLevel === "building") return null;

  // Build breadcrumb segments
  const segments: Array<{
    label: string;
    color: string;
    icon: string;
    onClick: () => void;
  }> = [];

  // Building (root) — always present, always clickable to go home
  segments.push({
    label: building.name ?? "HQ",
    color: "#4a6aff",
    icon: "⬡",
    onClick: () => {
      // Go all the way back to building
      const state = useSpatialStore.getState();
      state.drillReset();
    },
  });

  // Floor segment (shown when drillFloor is known)
  if (drillFloor !== null) {
    const floorDef = building.floors.find((f) => f.floor === drillFloor);
    const floorLabel = floorDef ? `F${floorDef.floor} ${floorDef.name}` : `FLOOR ${drillFloor}`;
    segments.push({
      label: floorLabel,
      color: "#6a8aff",
      icon: "▤",
      onClick: () => {
        // Ascend to floor level
        if (drillLevel === "room") drillAscend();
        else if (drillLevel === "agent") {
          drillAscend(); // agent → room
          // room→floor will be triggered via another ascend — but we can jump:
          // Use drillIntoFloor directly for a single click jump
          drillIntoFloor(drillFloor!);
        }
      },
    });
  }

  // Room segment (shown when drillRoom is known)
  if (drillRoom !== null && (drillLevel === "room" || drillLevel === "agent")) {
    const roomDef = building.rooms.find((r) => r.roomId === drillRoom);
    const roomIcon = roomDef ? (ROOM_TYPE_ICONS[roomDef.roomType] ?? "□") : "□";
    const roomColor = roomDef?.colorAccent ?? "#8888aa";
    segments.push({
      label: roomDef?.name ?? drillRoom,
      color: roomColor,
      icon: roomIcon,
      onClick: () => {
        // Ascend to room level (from agent) or no-op if already at room
        if (drillLevel === "agent") drillAscend();
        else if (drillLevel === "room") drillIntoRoom(drillRoom!);
      },
    });
  }

  // Agent segment (shown when drilled into an agent)
  if (drillAgent !== null && drillLevel === "agent") {
    const agent = agents[drillAgent];
    const agentColor = agent?.def.visual.color ?? "#8888aa";
    const agentIcon  = agent?.def.visual.icon  ?? "◈";
    segments.push({
      label: agent?.def.visual.label ?? drillAgent,
      color: agentColor,
      icon: agentIcon,
      onClick: () => { /* already at leaf — no-op */ },
    });
  }

  const isLeaf = (idx: number) => idx === segments.length - 1;

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 0,
        background: "rgba(5, 8, 20, 0.88)",
        border: "1px solid #2a2a4a",
        borderRadius: 4,
        padding: "5px 10px",
        backdropFilter: "blur(8px)",
        pointerEvents: "auto",
        userSelect: "none",
        zIndex: 20,
        boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
      }}
    >
      {/* Back button */}
      <button
        onClick={drillAscend}
        title="Go back one level (ESC)"
        style={{
          background: "rgba(74, 106, 255, 0.12)",
          border: "1px solid #2a3a7a",
          borderRadius: 3,
          color: "#4a6aff",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "11px",
          padding: "2px 7px",
          marginRight: 8,
          lineHeight: 1,
          transition: "all 0.12s ease",
        }}
      >
        ◁ BACK
      </button>

      {/* Breadcrumb segments */}
      {segments.map((seg, idx) => (
        <span key={idx} style={{ display: "flex", alignItems: "center" }}>
          {/* Separator — not shown before first segment */}
          {idx > 0 && (
            <span style={{ color: "#333355", margin: "0 5px", fontSize: "9px" }}>
              ›
            </span>
          )}
          {/* Segment button */}
          <button
            onClick={seg.onClick}
            disabled={isLeaf(idx)}
            title={isLeaf(idx) ? "Current location" : `Navigate to ${seg.label}`}
            style={{
              background: "none",
              border: "none",
              borderRadius: 2,
              color: isLeaf(idx) ? seg.color : `${seg.color}99`,
              cursor: isLeaf(idx) ? "default" : "pointer",
              fontFamily: "inherit",
              fontSize: isLeaf(idx) ? "10px" : "9px",
              fontWeight: isLeaf(idx) ? 700 : 400,
              letterSpacing: "0.06em",
              padding: "1px 3px",
              display: "flex",
              alignItems: "center",
              gap: 3,
              textTransform: "uppercase",
              transition: "color 0.12s ease",
              ...(isLeaf(idx) ? {
                textShadow: `0 0 8px ${seg.color}66`,
              } : {}),
            }}
          >
            <span style={{ fontSize: "10px" }}>{seg.icon}</span>
            {seg.label}
          </button>
        </span>
      ))}

      {/* ESC hint */}
      <span
        style={{
          marginLeft: 10,
          fontSize: "7px",
          color: "#333355",
          letterSpacing: "0.05em",
          fontStyle: "normal",
        }}
      >
        ESC
      </span>
    </div>
  );
}

// ── Navigation State Overlay (Sub-AC 3d) ──────────────────────────────────────

/**
 * Per-level configuration for the DrillLevelIndicator step-ladder.
 * Each level has a canonical icon, accent color, and short label.
 */
const DRILL_LEVEL_META: Record<DrillLevel, { icon: string; color: string; label: string }> = {
  building: { icon: "⬡", color: "#4a6aff", label: "BUILDING" },
  floor:    { icon: "▤", color: "#6a9aff", label: "FLOOR"    },
  room:     { icon: "□", color: "#8ab8ff", label: "ROOM"     },
  agent:    { icon: "◆", color: "#00ffaa", label: "AGENT"    },
};

/** Ordered drill levels */
const DRILL_LEVELS: DrillLevel[] = ["building", "floor", "room", "agent"];

/**
 * DrillLevelIndicator — persistent step-ladder showing where the user
 * currently is in the building → floor → room → agent hierarchy.
 *
 * Always visible. Active level is highlighted with its accent color
 * and a glow shadow. Past levels are dim-blue; future levels are near-black.
 *
 * Positioned in the top-left panel, directly below the data-source subtitle.
 */
function DrillLevelIndicator() {
  const drillLevel = useSpatialStore((s) => s.drillLevel);

  const currentIdx = DRILL_LEVELS.indexOf(drillLevel);

  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        alignItems: "center",
        gap: 3,
      }}
      title="Current navigation level in the spatial hierarchy"
    >
      {DRILL_LEVELS.map((lvl, idx) => {
        const meta      = DRILL_LEVEL_META[lvl];
        const isActive  = idx === currentIdx;
        const isPast    = idx < currentIdx;

        return (
          <span key={lvl} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {idx > 0 && (
              <span
                style={{
                  fontSize: "8px",
                  color: isPast || isActive ? "#2a3a6a" : "#1a1a2a",
                }}
              >
                ›
              </span>
            )}
            <span
              style={{
                fontSize: isActive ? "9px" : "8px",
                letterSpacing: "0.08em",
                fontWeight: isActive ? 700 : 400,
                color: isActive ? meta.color
                     : isPast   ? "#2a3a6a"
                                : "#1c1c2e",
                textShadow: isActive ? `0 0 8px ${meta.color}aa` : "none",
                animation:  isActive ? "hud-level-shimmer 3s ease-in-out infinite" : "none",
                transition: "all 0.25s ease",
              }}
              title={meta.label}
            >
              {meta.icon} {meta.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * FocusedNodeHighlight — diegetic badge shown in the top-left panel when
 * a node is actively focused in the 3D scene (hovered, selected, or camera-locked).
 *
 * Priority order: agent selection > room selection > room camera-focus > any 3D hover.
 *
 * Shows the node name, icon, and a pulsing dot in the node's accent color.
 * Disappears automatically when nothing is focused.
 */
function FocusedNodeHighlight() {
  const focusedRoomId  = useSpatialStore((s) => s.focusedRoomId);
  const selectedRoomId = useSpatialStore((s) => s.selectedRoomId);
  const roomStates     = useSpatialStore((s) => s.roomStates);
  const building       = useSpatialStore((s) => s.building);
  const drillLevel     = useSpatialStore((s) => s.drillLevel);
  const drillFloor     = useSpatialStore((s) => s.drillFloor);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const agents          = useAgentStore((s) => s.agents);

  let label    = "";
  let color    = "#4a6aff";
  let icon     = "○";
  let subtitle = "";

  if (selectedAgentId && agents[selectedAgentId]) {
    const agent = agents[selectedAgentId];
    label    = agent.def.visual.label;
    color    = agent.def.visual.color;
    icon     = agent.def.visual.icon;
    subtitle = agent.status.toUpperCase();
  } else if (selectedRoomId) {
    const room = building.rooms.find((r) => r.roomId === selectedRoomId);
    if (room) {
      label    = room.name;
      color    = room.colorAccent;
      icon     = ROOM_TYPE_ICONS[room.roomType] ?? "□";
      subtitle = `${room.roomType.toUpperCase()} · F${room.floor}`;
    }
  } else if (focusedRoomId) {
    const room = building.rooms.find((r) => r.roomId === focusedRoomId);
    if (room) {
      label    = room.name;
      color    = room.colorAccent;
      icon     = ROOM_TYPE_ICONS[room.roomType] ?? "□";
      subtitle = "CAM LOCKED";
    }
  } else if (drillLevel === "floor" && drillFloor !== null) {
    // Show current floor as the focused node when at floor level
    const floorDef = building.floors.find((f) => f.floor === drillFloor);
    if (floorDef) {
      label    = `F${floorDef.floor} ${floorDef.name}`;
      color    = "#6a8aff";
      icon     = "▤";
      subtitle = "FLOOR ACTIVE";
    }
  } else {
    // Any room currently hovered in the 3D scene
    const hovered = building.rooms.find((r) => roomStates[r.roomId]?.highlighted);
    if (hovered) {
      label    = hovered.name;
      color    = hovered.colorAccent;
      icon     = ROOM_TYPE_ICONS[hovered.roomType] ?? "□";
      subtitle = "HOVER";
    }
  }

  if (!label) return null;

  return (
    <div
      style={{
        marginTop: 6,
        display:    "inline-flex",
        alignItems: "center",
        gap: 5,
        padding:    "3px 7px",
        background: `${color}14`,
        border:     `1px solid ${color}44`,
        borderRadius: 3,
        maxWidth:   220,
        animation:  "hud-focus-glow 2.4s ease-in-out infinite",
        backdropFilter: "blur(4px)",
      }}
      title="Currently focused node in the 3D scene"
    >
      {/* Pulsing dot */}
      <span
        style={{
          display:         "inline-block",
          width:           5,
          height:          5,
          borderRadius:    "50%",
          backgroundColor: color,
          boxShadow:       `0 0 6px ${color}`,
          flexShrink:      0,
          animation:       "hud-pulse 1.6s ease-in-out infinite",
        }}
      />
      {/* Node label */}
      <span
        style={{
          fontSize:      "9px",
          color:         `${color}dd`,
          fontWeight:    700,
          letterSpacing: "0.06em",
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}
      >
        {icon} {label}
      </span>
      {/* Context subtitle */}
      {subtitle && (
        <span
          style={{
            fontSize:      "7px",
            color:         "#444466",
            letterSpacing: "0.05em",
            flexShrink:    0,
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

interface HUDProps {
  cameraPreset: CameraPreset;
  onPresetChange: (preset: CameraPreset) => void;
}

/** Room mapping config toggle button — opens/closes the mapping panel */
function RoomMappingToggle() {
  const isPanelOpen = useRoomMappingStore((s) => s.isPanelOpen);
  const togglePanel = useRoomMappingStore((s) => s.togglePanel);
  const changeCount = useRoomMappingStore((s) => s.events.length);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={styles.sectionLabel}>CONFIGURATION</div>
      <button
        onClick={togglePanel}
        style={{
          ...styles.presetBtn,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pointerEvents: "auto",
          ...(isPanelOpen
            ? {
                background: "rgba(74, 106, 255, 0.2)",
                borderColor: "#4a6aff",
                color: "#aaccff",
              }
            : {}),
        }}
        title="Open/close room mapping configuration panel"
      >
        <span>◎ ROOM MAPPING</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {changeCount > 0 && (
            <span
              style={{
                fontSize: "7px",
                background: "rgba(74, 106, 255, 0.3)",
                borderRadius: 8,
                padding: "1px 4px",
                color: "#aaccff",
              }}
            >
              {changeCount}
            </span>
          )}
          <span style={{ fontSize: "8px", opacity: 0.7 }}>
            {isPanelOpen ? "▼" : "▶"}
          </span>
        </span>
      </button>
    </div>
  );
}

// ── DataSourceStatusIndicator (Sub-AC 6c) ─────────────────────────────────

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
function DataSourceStatusIndicator() {
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

export function HUD({ cameraPreset, onPresetChange }: HUDProps) {
  const building = useSpatialStore((s) => s.building);
  const dataSource = useSpatialStore((s) => s.dataSource);
  const loading = useSpatialStore((s) => s.loading);
  const spatialEventCount = useSpatialStore((s) => s.events.length);
  const agentEventCount = useAgentStore((s) => s.events.length);
  const agentCount = useAgentStore((s) => Object.keys(s.agents).length);
  const mappingEventCount = useRoomMappingStore((s) => s.events.length);
  const isMappingPanelOpen = useRoomMappingStore((s) => s.isPanelOpen);

  return (
    <div style={styles.container}>
      {/* Top-left: Title + nav level indicator + focused-node highlight */}
      <div style={styles.topLeft}>
        <div style={styles.title}>
          <span style={styles.titleMark}>&gt;</span> CONITENS // COMMAND_CENTER
        </div>
        <div style={styles.subtitle}>
          3D Spatial Visualization
          {loading && <span style={{ color: "#4a6aff", marginLeft: 8 }}>LOADING...</span>}
          {!loading && (
            <span style={{ color: dataSource === "yaml" ? "#00cc66" : "#555577", marginLeft: 8 }}>
              [{dataSource.toUpperCase()}]
            </span>
          )}
        </div>

        {/*
         * Sub-AC 3d: Current-level indicator — step-ladder showing position in
         * the building → floor → room → agent hierarchy. Always visible.
         */}
        <DrillLevelIndicator />

        {/*
         * Sub-AC 3d: Focused-node highlight — shows which room/agent is currently
         * hovered, selected, or camera-locked, with a pulsing accent-color badge.
         */}
        <FocusedNodeHighlight />
      </div>

      {/*
       * Top-center navigation controls (Sub-AC 3.3 + 4a):
       *
       * At building level: BuildingContextPanel (Sub-AC 4a — aggregate stats,
       *                    inline rename, START ALL / STOP ALL, floor list)
       * Below building:    NavigationBreadcrumb (Sub-AC 3.3 — dedicated breadcrumb
       *                    HUD overlay; path navigation + click-to-navigate-up +
       *                    back button + home button + ESC key support)
       *                  + FloorContextPanel (Sub-AC 4a — floor stats, rename,
       *                    START ALL / STOP ALL on floor, room quick-select)
       */}
      <BuildingContextPanel />
      <NavigationBreadcrumb />
      <FloorContextPanel />

      {/* Top-right: Camera mode + presets/controls + floor toggles */}
      <div style={styles.topRight}>
        <CameraModeControls cameraPreset={cameraPreset} onPresetChange={onPresetChange} />
        <FloorToggles />
        <RoomNavigator />
        <AgentRoster />
        <RoomMappingToggle />
      </div>

      {/* Bottom-left: Legend with role icons, geometry names, and animation type */}
      <div style={styles.bottomLeft}>
        <div style={styles.sectionLabel}>ROOM TYPES</div>
        <div style={styles.legendGrid}>
          {Object.entries(ROOM_TYPE_COLORS).map(([type, color]) => (
            <div key={type} style={styles.legendItem}>
              {/* Color swatch */}
              <span
                style={{
                  ...styles.legendDot,
                  backgroundColor: color,
                  boxShadow: `0 0 4px ${color}66`,
                }}
              />
              {/* Role icon */}
              <span style={{ color, fontSize: "11px", lineHeight: 1 }}>
                {ROOM_TYPE_ICONS[type] ?? "?"}
              </span>
              {/* Type name */}
              <span style={{ ...styles.legendText, color }}>{type}</span>
              {/* Geometry shape */}
              <span style={{ fontSize: "7px", color: "#444466", marginLeft: 1 }}>
                {ROOM_TYPE_SHAPES[type] ?? "?"}
              </span>
              {/* Animation indicator */}
              {ROOM_TYPE_ANIM[type] && ROOM_TYPE_ANIM[type] !== "none" && (
                <span style={{ fontSize: "6px", color: `${color}88`, marginLeft: 1 }}>
                  ↻{ROOM_TYPE_ANIM[type].slice(0, 3)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom-right: Building info + agent count */}
      <div style={styles.bottomRight}>
        <div style={styles.sectionLabel}>BUILDING</div>
        <div style={styles.infoText}>
          {building.floors.length} floors · {building.rooms.length} rooms ·{" "}
          {agentCount} agents
        </div>
        <div style={styles.infoTextDim}>
          {building.floors[0]?.gridW ?? 12}x{building.floors[0]?.gridD ?? 6} grid · {building.style}
        </div>
        <div style={styles.infoTextDim}>
          Events: {spatialEventCount + agentEventCount + mappingEventCount}{" "}
          (spatial: {spatialEventCount}, agent: {agentEventCount}, mapping: {mappingEventCount})
        </div>
      </div>

      {/* Selected room detail panel (middle-right) */}
      <RoomDetailPanel />

      {/* Selected agent detail panel (middle-left) */}
      <AgentDetailPanel />

      {/* Room mapping configuration panel (center modal, when open) */}
      {isMappingPanelOpen && <RoomMappingPanel />}

      {/*
        Sub-AC 10a: Meeting convocation dialog — centred modal, appears when
        conveneDialogRoomId is set (via right-click 3D room node OR the
        ⚑ CONVENE button in RoomDetailPanel).
        Emits meeting.convene_requested to the spatial event log + control-plane bus.
        ConveneMeetingDialog self-manages open/close via the spatial store.
      */}
      <ConveneMeetingDialog />

      {/*
        Sub-AC 10d: Meeting protocol control panel — right-side overlay.
        Shows protocol stage progress, attending agents, spawned tasks, and
        event-log audit trail for the active meeting in the selected room.
        Also renders a CONVENE button when no meeting is active.
        Verifiable end-to-end via event_log inspection in the panel itself.
      */}
      <MeetingProtocolPanel />

      {/* ActiveSessionsPanel removed from HUD layer, now globally rendered in App.tsx */}
      
      {/*
        Sub-AC 10c: Meeting session detail panel — left-side overlay.
        Full session detail: status, participants, transcript feed, termination.
        Appears when a session is selected via ActiveSessionsPanel → INSPECT.
      */}
      <MeetingSessionPanel />

      {/*
        Sub-AC 7b: Task management panel — centred modal for create / cancel /
        reprioritize task operations triggered from 3D room or agent context menus.
        Panel opens via useTaskManagementStore; emits orchestration_commands with
        task payloads via useActionDispatcher → useCommandFileWriter.
        Renders null when closed (zero overhead in live mode).
      */}
      <TaskManagementPanel />

      {/*
        AC 9.3: Replay mode overlay — global viewport visual indicators that
        unmistakably distinguish replay from live observation.
        Renders null in live mode (zero overhead).
        In replay mode: vignette border, corner brackets, top progress bar,
        floating mode badge, playhead timestamp, and keyboard shortcut hints.
        Also registers Space/←/→/Esc keyboard controls for replay.
      */}
      <ReplayModeOverlay />

      {/*
        AC 9.2: Replay control panel — bottom-center, above data source indicator.
        Provides play/pause/seek/speed controls for 3D scene event log replay.
        Always visible: shows REC indicator in live mode, transport controls
        in replay mode.
      */}
      <ReplayControlPanel />

      {/*
        Sub-AC 6c: Data source status indicator — bottom-center.
        Shows whether display surfaces are live (orchestrator WS connected)
        or running on simulated Brownian-noise metrics.
      */}
      <DataSourceStatusIndicator />
    </div>
  );
}

// ── Inline Styles (dark command-center aesthetic) ────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    color: "#8888aa",
    fontSize: "11px",
    zIndex: 10,
  },
  topLeft: {
    position: "absolute",
    top: 16,
    left: 16,
  },
  title: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#aaaacc",
    letterSpacing: "0.1em",
    marginBottom: 4,
  },
  titleMark: {
    color: "#4a6aff",
    marginRight: 4,
  },
  subtitle: {
    fontSize: "10px",
    color: "#555577",
    letterSpacing: "0.05em",
  },
  topRight: {
    position: "absolute",
    top: 16,
    right: 16,
    textAlign: "right",
    pointerEvents: "auto",
  },
  sectionLabel: {
    fontSize: "9px",
    fontWeight: 700,
    color: "#555577",
    letterSpacing: "0.12em",
    marginBottom: 6,
  },
  presetRow: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  presetBtn: {
    padding: "4px 8px",
    fontSize: "9px",
    fontFamily: "inherit",
    background: "rgba(20, 20, 40, 0.7)",
    border: "1px solid #333355",
    borderRadius: 3,
    color: "#7777aa",
    cursor: "pointer",
    letterSpacing: "0.05em",
    transition: "all 0.15s ease",
    backdropFilter: "blur(4px)",
  },
  presetBtnActive: {
    background: "rgba(74, 106, 255, 0.2)",
    borderColor: "#4a6aff",
    color: "#aaccff",
  },
  bottomLeft: {
    position: "absolute",
    bottom: 16,
    left: 16,
  },
  legendGrid: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    maxWidth: 320,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendText: {
    fontSize: "9px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  bottomRight: {
    position: "absolute",
    bottom: 16,
    right: 16,
    textAlign: "right",
  },
  infoText: {
    fontSize: "10px",
    color: "#7777aa",
    marginBottom: 2,
  },
  infoTextDim: {
    fontSize: "9px",
    color: "#444466",
  },
  zoomBar: {
    position: "relative" as const,
    height: 6,
    background: "rgba(30, 30, 60, 0.8)",
    border: "1px solid #333355",
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  zoomBarFill: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    height: "100%",
    background: "linear-gradient(90deg, #4a6aff, #6a8aff)",
    borderRadius: 3,
    transition: "width 0.15s ease",
  },
  zoomLabel: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "7px",
    color: "#aaccff",
    fontWeight: 700,
    letterSpacing: "0.06em",
    lineHeight: 1,
  },
  detailPanel: {
    position: "absolute",
    right: 0,
    top: "50%",
    transform: "translateY(-50%)",
    background: "rgba(10, 10, 14, 0.95)",
    border: "none",
    borderLeft: "1px solid #222233",
    borderBottom: "1px solid #222233",
    borderTop: "1px solid #222233",
    borderRadius: 0,
    padding: "12px 16px",
    maxWidth: 280,
    pointerEvents: "auto",
  },
  agentDetailPanel: {
    position: "absolute",
    left: 0,
    top: "50%",
    transform: "translateY(-50%)",
    background: "rgba(10, 10, 14, 0.95)",
    border: "none",
    borderRight: "1px solid #222233",
    borderBottom: "1px solid #222233",
    borderTop: "1px solid #222233",
    borderRadius: 0,
    padding: "12px 16px",
    maxWidth: 280,
    pointerEvents: "auto",
  },
};
