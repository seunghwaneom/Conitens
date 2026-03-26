/**
 * DrillContextPanel — World-space contextual metric panel for hierarchical
 * drill-down interaction.
 *
 * Sub-AC 6c: Clicking building → room → agent progressively reveals
 * contextual metric panels scoped to that entity in world-space.
 *
 * A single panel component renders in the Three.js scene (via @react-three/drei
 * Html), re-anchoring to the currently-drilled entity as the user navigates:
 *
 *   building  → BuildingOverviewPanel  (building entrance, aggregate stats)
 *   floor     → FloorContextPanel      (floor label area, rooms + activity)
 *   room      → RoomContextPanel       (above/beside room, enriched metrics)
 *   agent     → AgentContextPanel      (beside agent, enriched metrics)
 *
 * Design principles:
 *   - Purely additive — supplements existing ambient billboards, does not replace them
 *   - World-anchored — panel moves with the entity in 3D space (distanceFactor scaling)
 *   - Scoped metrics — content changes to show the drilled entity's data only
 *   - Breadcrumb path — every panel shows the drill hierarchy (HQ > Floor > Room > Agent)
 *   - Record-transparent — reads from event-sourced stores; no additional events emitted
 *     (navigation events are already produced by spatial-store drill actions)
 *
 * Positioning:
 *   - building : fixed at building entrance left-pillar (world -2.8, 2.5, 3)
 *   - floor    : at the floor indicator column (-2.5, floorY + 2.0, 3)
 *   - room     : above the room ceiling centre + left offset
 *   - agent    : beside the agent avatar (x + 0.6, agentY + 1.4, z)
 *
 * The panel animates its opacity in/out via CSS transition when the drill
 * level changes, avoiding jarring pop-in.
 */

import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { useMetricsStore } from "../store/metrics-store.js";
import type { DrillLevel } from "../store/spatial-store.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const FLOOR_HEIGHT = 3; // world units per floor — must match building.ts / RoomGeometry.tsx
const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

// Opacity tokens
const OP_PANEL_BG  = "rgba(6, 6, 16, 0.93)";
const OP_BORDER    = "rgba(60, 70, 130, 0.45)";

// ── Shared style helpers ───────────────────────────────────────────────────────

const PANEL_STYLE: React.CSSProperties = {
  pointerEvents: "auto",
  background: OP_PANEL_BG,
  border: `1px solid ${OP_BORDER}`,
  borderRadius: "7px",
  padding: "11px 13px",
  backdropFilter: "blur(10px)",
  boxShadow: "0 0 28px rgba(40,60,180,0.18), 0 8px 24px rgba(0,0,0,0.7)",
  color: "#aaaacc",
  fontFamily: FONT,
  userSelect: "none",
  minWidth: "200px",
  transition: "opacity 0.25s ease",
};

function PanelHeader({
  icon,
  title,
  subtitle,
  accentColor,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  accentColor: string;
}) {
  return (
    <div
      style={{
        borderBottom: `1px solid ${accentColor}33`,
        paddingBottom: "8px",
        marginBottom: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "14px", lineHeight: 1 }}>{icon}</span>
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: accentColor,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: "7px",
                color: "#5577aa",
                letterSpacing: "0.06em",
                marginTop: "1px",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Breadcrumb({ path }: { path: string[] }) {
  return (
    <div
      style={{
        fontSize: "6px",
        color: "#444466",
        letterSpacing: "0.08em",
        marginBottom: "8px",
        display: "flex",
        alignItems: "center",
        gap: "3px",
        flexWrap: "wrap",
      }}
    >
      {path.map((segment, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          {i > 0 && <span style={{ color: "#333355", opacity: 0.7 }}>›</span>}
          <span style={{ color: i === path.length - 1 ? "#6677bb" : "#333355" }}>
            {segment.toUpperCase()}
          </span>
        </span>
      ))}
    </div>
  );
}

function MetricRow({
  label,
  value,
  color = "#6677bb",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "2px 0",
        fontSize: "8px",
      }}
    >
      <span style={{ color: "#555577", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ color, fontWeight: 700, letterSpacing: "0.04em" }}>{value}</span>
    </div>
  );
}

function MiniGauge({ label, value, color }: { label: string; value: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  const fillColor = clamped > 80 ? "#ff4444" : clamped > 60 ? "#ffaa00" : color;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        margin: "2px 0",
        fontSize: "7px",
      }}
    >
      <span style={{ color: "#555577", width: "24px", textAlign: "right", flexShrink: 0 }}>
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: "4px",
          background: "rgba(30,30,60,0.8)",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            background: fillColor,
            borderRadius: "2px",
            transition: "width 0.4s ease-out",
            boxShadow: `0 0 4px ${fillColor}88`,
          }}
        />
      </div>
      <span style={{ color: fillColor, width: "24px", textAlign: "left", flexShrink: 0 }}>
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "2px 0" }}>
      <div
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: color,
          flexShrink: 0,
          boxShadow: `0 0 5px ${color}88`,
        }}
      />
      <span style={{ fontSize: "8px", color, fontWeight: 700, letterSpacing: "0.06em" }}>
        {label}
      </span>
    </div>
  );
}

function DrillCTA({
  label,
  onClick,
  accentColor,
}: {
  label: string;
  onClick?: () => void;
  accentColor: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      style={{
        background: `${accentColor}18`,
        border: `1px solid ${accentColor}44`,
        borderRadius: "3px",
        color: accentColor,
        fontSize: "7px",
        cursor: "pointer",
        padding: "3px 8px",
        fontFamily: FONT,
        letterSpacing: "0.07em",
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}

// ── Building Overview Panel ────────────────────────────────────────────────────

/**
 * BuildingOverviewPanel — shown at "building" drill level.
 *
 * Provides an entry-point overview of the building: floor count, room count,
 * total agent counts by status.  Encourages the user to click into a floor.
 */
function BuildingOverviewPanel() {
  const building   = useSpatialStore((s) => s.building);
  const roomStates = useSpatialStore((s) => s.roomStates);
  const agents     = useAgentStore((s) => s.agents);

  const agentList = Object.values(agents);
  const activeCount    = agentList.filter((a) => a.status === "active" || a.status === "busy").length;
  const idleCount      = agentList.filter((a) => a.status === "idle").length;
  const inactiveCount  = agentList.filter((a) => a.status === "inactive").length;
  const errorCount     = agentList.filter((a) => a.status === "error").length;

  const busyRooms  = Object.values(roomStates).filter((rs) => rs.activity === "busy" || rs.activity === "active").length;

  return (
    <div style={{ width: "200px" }}>
      <Breadcrumb path={[building.name || "CONITENS HQ"]} />
      <PanelHeader
        icon="🏢"
        title={building.name || "Command Center"}
        subtitle={`${building.floors.length} floor${building.floors.length !== 1 ? "s" : ""} · ${building.rooms.length} rooms`}
        accentColor="#4a6aff"
      />

      {/* Floor index */}
      <div style={{ marginBottom: "8px" }}>
        <div
          style={{
            fontSize: "7px",
            color: "#444466",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "4px",
          }}
        >
          Floors
        </div>
        {building.floors.map((floor) => {
          const floorRooms = building.rooms.filter((r) => r.floor === floor.floor);
          const floorAgents = agentList.filter((a) => {
            const room = building.rooms.find((r) => r.roomId === a.roomId);
            return room?.floor === floor.floor;
          });
          const floorActive = floorAgents.filter(
            (a) => a.status === "active" || a.status === "busy",
          ).length;
          return (
            <div
              key={floor.floor}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "3px 6px",
                marginBottom: "2px",
                background: "rgba(20,20,40,0.6)",
                borderRadius: "3px",
                border: "1px solid rgba(60,60,100,0.3)",
              }}
            >
              <span style={{ fontSize: "8px", color: "#7788cc", fontWeight: 700 }}>
                F{floor.floor}
              </span>
              <span style={{ fontSize: "7px", color: "#555577" }}>
                {floor.name}
              </span>
              <span style={{ fontSize: "7px", color: "#888899" }}>
                {floorRooms.length}R · {floorAgents.length}A
                {floorActive > 0 && (
                  <span style={{ color: "#00cc66", marginLeft: "4px" }}>
                    {floorActive} active
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Agent status summary */}
      <div style={{ marginBottom: "6px" }}>
        <div
          style={{
            fontSize: "7px",
            color: "#444466",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "4px",
          }}
        >
          Agents [{agentList.length}]
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {activeCount > 0 && (
            <span style={{ fontSize: "7px", color: "#00cc66" }}>●&nbsp;{activeCount} active</span>
          )}
          {idleCount > 0 && (
            <span style={{ fontSize: "7px", color: "#888899" }}>●&nbsp;{idleCount} idle</span>
          )}
          {inactiveCount > 0 && (
            <span style={{ fontSize: "7px", color: "#555566" }}>●&nbsp;{inactiveCount} inactive</span>
          )}
          {errorCount > 0 && (
            <span style={{ fontSize: "7px", color: "#ff4444" }}>●&nbsp;{errorCount} error</span>
          )}
          {busyRooms > 0 && (
            <span style={{ fontSize: "7px", color: "#ffaa00" }}>
              ● {busyRooms} room{busyRooms !== 1 ? "s" : ""} busy
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: "7px",
          color: "#333355",
          letterSpacing: "0.06em",
          textAlign: "center",
          marginTop: "6px",
          borderTop: "1px solid rgba(40,40,80,0.5)",
          paddingTop: "6px",
        }}
      >
        Click a room to drill in →
      </div>
    </div>
  );
}

// ── Floor Context Panel ────────────────────────────────────────────────────────

/**
 * FloorContextPanel — shown at "floor" drill level.
 *
 * Displays the rooms available on the current floor with their activity status
 * and agent counts. Helps the user decide which room to drill into.
 */
function FloorContextPanel({ floorIndex }: { floorIndex: number }) {
  const building   = useSpatialStore((s) => s.building);
  const roomStates = useSpatialStore((s) => s.roomStates);
  const agents     = useAgentStore((s) => s.agents);

  const floorDef = building.floors.find((f) => f.floor === floorIndex);
  const floorRooms = building.rooms.filter((r) => r.floor === floorIndex);

  const agentList = Object.values(agents);

  if (!floorDef) return null;

  const ACTIVITY_COLORS: Record<string, string> = {
    idle:   "#444455",
    active: "#00cc66",
    busy:   "#cc8800",
    error:  "#cc3333",
  };

  return (
    <div style={{ width: "210px" }}>
      <Breadcrumb path={[building.name || "HQ", `Floor ${floorIndex}`]} />
      <PanelHeader
        icon="🏗"
        title={floorDef.name}
        subtitle={`Floor ${floorIndex} · ${floorRooms.length} rooms`}
        accentColor="#6655ff"
      />

      {/* Room list */}
      <div>
        <div
          style={{
            fontSize: "7px",
            color: "#444466",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "4px",
          }}
        >
          Rooms
        </div>
        {floorRooms.map((room) => {
          const rs = roomStates[room.roomId];
          const activity = rs?.activity ?? "idle";
          const actColor = ACTIVITY_COLORS[activity] ?? "#444455";
          const roomAgents = agentList.filter((a) => a.roomId === room.roomId);
          const activeRoomAgents = roomAgents.filter(
            (a) => a.status === "active" || a.status === "busy",
          );

          return (
            <div
              key={room.roomId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 6px",
                marginBottom: "2px",
                background: `${room.colorAccent}08`,
                borderRadius: "3px",
                border: `1px solid ${room.colorAccent}22`,
              }}
            >
              <span style={{ fontSize: "9px", lineHeight: 1, flexShrink: 0 }}>{room.icon}</span>
              <span
                style={{
                  fontSize: "8px",
                  color: "#8888aa",
                  flex: 1,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {room.name}
              </span>
              <div
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  backgroundColor: actColor,
                  flexShrink: 0,
                  boxShadow: `0 0 3px ${actColor}88`,
                }}
              />
              {roomAgents.length > 0 && (
                <span style={{ fontSize: "7px", color: "#555577", flexShrink: 0 }}>
                  {activeRoomAgents.length}/{roomAgents.length}
                </span>
              )}
              {rs?.paused && (
                <span style={{ fontSize: "6px", color: "#ffaa00", flexShrink: 0 }}>⏸</span>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          fontSize: "7px",
          color: "#333355",
          letterSpacing: "0.06em",
          textAlign: "center",
          marginTop: "6px",
          borderTop: "1px solid rgba(40,40,80,0.5)",
          paddingTop: "6px",
        }}
      >
        Click a room to inspect →
      </div>
    </div>
  );
}

// ── Room Context Panel ─────────────────────────────────────────────────────────

/**
 * RoomContextPanel — shown at "room" drill level.
 *
 * Enriches the ambient RoomMetricsBillboard with full contextual data:
 * agent roster, task queue, capabilities, lifecycle status, and drill-in CTA.
 */
function RoomContextPanel({ roomId }: { roomId: string }) {
  const building      = useSpatialStore((s) => s.building);
  const room          = useSpatialStore((s) => s.getRoomById(roomId));
  const roomState     = useSpatialStore((s) => s.getRoomState(roomId));
  const drillFloor    = useSpatialStore((s) => s.drillFloor);
  const drillIntoAgent = useSpatialStore((s) => s.drillIntoAgent);
  const agentStates   = useAgentStore((s) => s.agents);
  const selectAgent   = useAgentStore((s) => s.selectAgent);

  const roomAgents = useMemo(
    () => Object.values(agentStates).filter((a) => a.roomId === roomId),
    [agentStates, roomId],
  );

  const cpuEst    = useMetricsStore((s) => s.snapshot.system.cpu);
  const memEst    = useMetricsStore((s) => s.snapshot.system.memory);

  if (!room) return null;

  const floorDef  = building.floors.find((f) => f.floor === room.floor);
  const activeAgents = roomAgents.filter((a) => a.status === "active" || a.status === "busy");
  const errorAgents  = roomAgents.filter((a) => a.status === "error");

  const ACTIVITY_COLORS: Record<string, string> = {
    idle:   "#555566",
    active: "#00cc66",
    busy:   "#cc8800",
    error:  "#cc3333",
  };
  const STATUS_COLORS: Record<string, string> = {
    inactive:   "#555566",
    idle:       "#7788aa",
    active:     "#00ff88",
    busy:       "#ffaa00",
    error:      "#ff4444",
    terminated: "#333344",
  };

  const actColor = ACTIVITY_COLORS[roomState.activity] ?? "#555566";

  return (
    <div style={{ width: "220px" }}>
      <Breadcrumb
        path={[
          building.name || "HQ",
          floorDef ? floorDef.name : `Floor ${drillFloor ?? room.floor}`,
          room.name,
        ]}
      />
      <PanelHeader
        icon={room.icon}
        title={room.name}
        subtitle={`${room.roomType.toUpperCase()} · FLOOR ${room.floor}`}
        accentColor={room.colorAccent}
      />

      {/* Activity + health */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "8px",
          padding: "4px 6px",
          background: `${actColor}0f`,
          borderRadius: "3px",
          border: `1px solid ${actColor}22`,
        }}
      >
        <div
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: actColor,
            boxShadow: `0 0 5px ${actColor}`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: "8px",
            color: actColor,
            fontWeight: 700,
            letterSpacing: "0.06em",
            flex: 1,
          }}
        >
          {roomState.activity.toUpperCase()}
        </span>
        {activeAgents.length > 0 && (
          <span style={{ fontSize: "7px", color: "#00cc66" }}>
            {activeAgents.length} active
          </span>
        )}
        {errorAgents.length > 0 && (
          <span style={{ fontSize: "7px", color: "#cc3333" }}>
            {errorAgents.length} error
          </span>
        )}
        {roomState.paused && (
          <span style={{ fontSize: "7px", color: "#ffaa00" }}>⏸ PAUSED</span>
        )}
      </div>

      {/* Metrics gauges */}
      <div style={{ marginBottom: "8px" }}>
        <MiniGauge label="CPU" value={cpuEst} color={room.colorAccent} />
        <MiniGauge label="MEM" value={memEst} color={room.colorAccent} />
      </div>

      {/* Agent roster */}
      {roomAgents.length > 0 && (
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              fontSize: "7px",
              color: "#444466",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "4px",
            }}
          >
            Agents [{roomAgents.length}]
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {roomAgents.slice(0, 5).map((agent) => {
              const sc = STATUS_COLORS[agent.status] ?? "#555566";
              return (
                <div
                  key={agent.def.agentId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 5px",
                    background: "rgba(255,255,255,0.022)",
                    borderRadius: "2px",
                    border: `1px solid ${agent.def.visual.color}1a`,
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectAgent(agent.def.agentId);
                    drillIntoAgent(agent.def.agentId, agent.worldPosition);
                  }}
                >
                  <span style={{ fontSize: "8px", lineHeight: 1 }}>{agent.def.visual.icon}</span>
                  <span
                    style={{
                      fontSize: "8px",
                      color: "#7788aa",
                      flex: 1,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {agent.def.name}
                  </span>
                  <div
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      backgroundColor: sc,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: "6px", color: sc, flexShrink: 0 }}>
                    {agent.status.toUpperCase().slice(0, 4)}
                  </span>
                </div>
              );
            })}
            {roomAgents.length > 5 && (
              <div style={{ fontSize: "6px", color: "#444466", paddingLeft: "5px" }}>
                +{roomAgents.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Meta info */}
      {room._meta && (
        <div style={{ marginBottom: "6px" }}>
          <MetricRow
            label="Access"
            value={(room._meta.accessPolicy ?? "OPEN").toUpperCase()}
          />
          {room._meta.maxOccupancy != null && (
            <MetricRow
              label="Capacity"
              value={`${roomAgents.length} / ${room._meta.maxOccupancy}`}
            />
          )}
        </div>
      )}

      <div
        style={{
          fontSize: "7px",
          color: "#333355",
          letterSpacing: "0.06em",
          textAlign: "center",
          marginTop: "6px",
          borderTop: "1px solid rgba(40,40,80,0.5)",
          paddingTop: "6px",
        }}
      >
        Click an agent to inspect →
      </div>
    </div>
  );
}

// ── Agent Context Panel ────────────────────────────────────────────────────────

/**
 * AgentContextPanel — shown at "agent" drill level.
 *
 * Enriches the ambient AgentMetricsBillboard with full contextual data:
 * capabilities, lifecycle state, risk class, current task, summary.
 * Supplements but does not replace the billboard.
 */
function AgentContextPanel({ agentId }: { agentId: string }) {
  const building    = useSpatialStore((s) => s.building);
  const drillFloor  = useSpatialStore((s) => s.drillFloor);
  const drillRoom   = useSpatialStore((s) => s.drillRoom);
  const agent       = useAgentStore((s) => s.agents[agentId]);
  const cpuEst      = useMetricsStore((s) => s.snapshot.system.cpu);
  const memEst      = useMetricsStore((s) => s.snapshot.system.memory);

  if (!agent) return null;

  const floorDef = building.floors.find((f) => f.floor === drillFloor);
  const roomDef  = building.rooms.find((r) => r.roomId === drillRoom);

  const STATUS_COLORS: Record<string, string> = {
    inactive:   "#555566",
    idle:       "#7788aa",
    active:     "#00ff88",
    busy:       "#ffaa00",
    error:      "#ff4444",
    terminated: "#333344",
  };
  const RISK_COLORS: Record<string, string> = {
    low:    "#33aa66",
    medium: "#cc8800",
    high:   "#cc3333",
  };
  const LIFECYCLE_COLORS: Record<string, string> = {
    initializing: "#6677bb",
    ready:        "#44aa66",
    active:       "#00ff88",
    paused:       "#ffaa00",
    suspended:    "#cc8800",
    migrating:    "#88aaff",
    terminating:  "#ff6644",
    terminated:   "#333355",
    crashed:      "#ff2222",
  };

  const statusColor    = STATUS_COLORS[agent.status] ?? agent.def.visual.color;
  const riskColor      = RISK_COLORS[agent.def.riskClass] ?? "#666677";
  const lifecycleColor = LIFECYCLE_COLORS[agent.lifecycleState] ?? "#6677bb";

  const breadcrumb = [
    building.name || "HQ",
    floorDef ? floorDef.name : `Floor ${drillFloor ?? 0}`,
    roomDef ? roomDef.name : (drillRoom ?? ""),
    agent.def.name,
  ].filter(Boolean);

  return (
    <div style={{ width: "218px" }}>
      <Breadcrumb path={breadcrumb} />
      <PanelHeader
        icon={agent.def.visual.icon}
        title={agent.def.name}
        subtitle={`${agent.def.role.toUpperCase()} · ${agent.def.agentId}`}
        accentColor={agent.def.visual.color}
      />

      {/* Status + risk row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "6px",
        }}
      >
        <StatusDot color={statusColor} label={agent.status.toUpperCase()} />
        <span style={{ fontSize: "7px", color: riskColor, marginLeft: "auto" }}>
          RISK: {agent.def.riskClass.toUpperCase()}
        </span>
      </div>

      {/* Lifecycle state */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          marginBottom: "8px",
          padding: "3px 6px",
          background: `${lifecycleColor}0f`,
          borderRadius: "3px",
          border: `1px solid ${lifecycleColor}22`,
        }}
      >
        <span
          style={{
            fontSize: "7px",
            color: "#444466",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Lifecycle:
        </span>
        <span
          style={{
            fontSize: "8px",
            color: lifecycleColor,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {agent.lifecycleState}
        </span>
      </div>

      {/* Metrics gauges */}
      <div style={{ marginBottom: "8px" }}>
        <MiniGauge label="CPU" value={cpuEst} color={agent.def.visual.color} />
        <MiniGauge label="MEM" value={memEst} color={agent.def.visual.color} />
      </div>

      {/* Current task */}
      {agent.currentTaskTitle && (
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              fontSize: "7px",
              color: "#444466",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "3px",
            }}
          >
            Current Task
          </div>
          <div
            style={{
              fontSize: "8px",
              color: "#8888bb",
              padding: "3px 5px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "2px",
              border: "1px solid #1e1e33",
              wordBreak: "break-word",
            }}
          >
            {agent.currentTaskTitle}
          </div>
        </div>
      )}

      {/* Capabilities */}
      {agent.def.capabilities.length > 0 && (
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              fontSize: "7px",
              color: "#444466",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "3px",
            }}
          >
            Capabilities
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
            {agent.def.capabilities.slice(0, 6).map((cap) => (
              <span
                key={cap}
                style={{
                  fontSize: "6px",
                  color: `${agent.def.visual.color}cc`,
                  background: `${agent.def.visual.color}11`,
                  border: `1px solid ${agent.def.visual.color}22`,
                  borderRadius: "2px",
                  padding: "1px 4px",
                }}
              >
                {cap}
              </span>
            ))}
            {agent.def.capabilities.length > 6 && (
              <span style={{ fontSize: "6px", color: "#444466" }}>
                +{agent.def.capabilities.length - 6}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {agent.def.summary && (
        <div
          style={{
            fontSize: "7px",
            color: "#444455",
            fontStyle: "italic",
            lineHeight: 1.5,
            borderTop: "1px solid rgba(40,40,80,0.5)",
            paddingTop: "6px",
            marginTop: "4px",
          }}
        >
          {agent.def.summary.length > 110
            ? agent.def.summary.slice(0, 107) + "…"
            : agent.def.summary}
        </div>
      )}
    </div>
  );
}

// ── World Position Selector ────────────────────────────────────────────────────

/**
 * computePanelWorldPos — compute the world-space position for the drill panel
 * based on drill level and the drilled entity's spatial data.
 *
 * Returns a [x, y, z] tuple for the Html anchor point.
 */
function useDrillPanelPosition(
  drillLevel: DrillLevel,
  drillFloor: number | null,
  roomId: string | null,
  agentId: string | null,
): [number, number, number] {
  const building = useSpatialStore((s) => s.building);
  const agents   = useAgentStore((s) => s.agents);

  return useMemo<[number, number, number]>(() => {
    if (drillLevel === "building") {
      // Left pillar of building entrance — always visible from default camera
      return [-2.8, 2.5, 3];
    }

    if (drillLevel === "floor") {
      const floorY = (drillFloor ?? 0) * FLOOR_HEIGHT;
      // Near the floor indicator column position
      return [-2.5, floorY + 2.0, 3];
    }

    if (drillLevel === "room" && roomId) {
      const room = building.rooms.find((r) => r.roomId === roomId);
      if (room) {
        // Above the room ceiling, slightly to the left so it doesn't obscure agents
        const cx = room.position.x + room.dimensions.x / 2;
        const cy = room.position.y + room.dimensions.y + 0.8;
        const cz = room.position.z + room.dimensions.z / 2;
        return [cx - 1.5, cy, cz];
      }
    }

    if (drillLevel === "agent" && agentId) {
      const ag = agents[agentId];
      if (ag) {
        // Beside the agent (right side), above the ambient billboard
        return [ag.worldPosition.x + 0.65, ag.worldPosition.y + 1.6, ag.worldPosition.z];
      }
    }

    // Fallback: front-left of building
    return [-2.8, 2.5, 3];
  }, [drillLevel, drillFloor, roomId, agentId, building, agents]);
}

// ── Main Component ─────────────────────────────────────────────────────────────

/**
 * DrillContextPanel — root component wired into CommandCenterScene.tsx.
 *
 * Renders the appropriate contextual metric panel for the current drill level.
 * Positioned in 3D world-space via @react-three/drei Html with distanceFactor
 * so the panel scales naturally with camera distance.
 *
 * distanceFactor = 7 matches the DiegeticDetailPanel for visual consistency.
 *
 * Exported as a named export so it can be imported in CommandCenterScene.tsx.
 */
export function DrillContextPanel() {
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillFloor = useSpatialStore((s) => s.drillFloor);
  const drillRoom  = useSpatialStore((s) => s.drillRoom);
  const drillAgent = useSpatialStore((s) => s.drillAgent);

  const position = useDrillPanelPosition(drillLevel, drillFloor, drillRoom, drillAgent);

  // Determine accent color from the drill context
  const building = useSpatialStore((s) => s.building);
  const agents = useAgentStore((s) => s.agents);
  const accentColor = useMemo(() => {
    if (drillLevel === "room" && drillRoom) {
      const room = building.rooms.find((r) => r.roomId === drillRoom);
      return room?.colorAccent ?? "#4a6aff";
    }
    if (drillLevel === "agent" && drillAgent) {
      const ag = agents[drillAgent];
      return ag?.def.visual.color ?? "#4a6aff";
    }
    if (drillLevel === "floor") return "#6655ff";
    return "#4a6aff";
  }, [drillLevel, drillRoom, drillAgent, building, agents]);

  return (
    <Html
      position={position}
      center
      distanceFactor={7}
      zIndexRange={[90, 0]}
      style={{ pointerEvents: "none" }}
    >
      {/*
       * The outer Html wrapper is pointer-events: none (set above on Html).
       * The inner div re-enables pointer events so buttons/agent-rows are clickable,
       * while stopPropagation prevents those clicks from leaking into the 3D scene.
       *
       * The outer div also applies the panel shell styling and a per-level border glow.
       */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...PANEL_STYLE,
          borderColor: `${accentColor}44`,
          boxShadow: `
            0 0 0 1px ${accentColor}18,
            0 0 28px ${accentColor}12,
            0 8px 24px rgba(0,0,0,0.7)
          `,
        }}
      >
        {/*
         * Panel breadcrumb / level indicator strip at top
         * Shows the current position in the drill hierarchy as a color bar.
         */}
        <div
          style={{
            height: "2px",
            background: `linear-gradient(90deg, ${accentColor}88, ${accentColor}22, transparent)`,
            borderRadius: "3px 3px 0 0",
            marginBottom: "8px",
          }}
        />

        {/* ── Content block — switches by drill level ── */}
        {drillLevel === "building" && <BuildingOverviewPanel />}
        {drillLevel === "floor" && drillFloor != null && (
          <FloorContextPanel floorIndex={drillFloor} />
        )}
        {drillLevel === "room" && drillRoom != null && (
          <RoomContextPanel roomId={drillRoom} />
        )}
        {drillLevel === "agent" && drillAgent != null && (
          <AgentContextPanel agentId={drillAgent} />
        )}
      </div>
    </Html>
  );
}

/**
 * DrillContextPanelLayer — scene-level wrapper for DrillContextPanel.
 *
 * Wraps the panel in a named group for easy identification in the scene graph
 * and provides a debug-friendly group name. Can be toggled by visibility flags.
 *
 * Exported for wiring into CommandCenterScene.tsx.
 */
export function DrillContextPanelLayer() {
  return (
    <group name="drill-context-panel-layer">
      <DrillContextPanel />
    </group>
  );
}

// ── Utility exports (for tests) ────────────────────────────────────────────────

/**
 * Exported for unit-test assertions — the computed panel position at each
 * drill level follows a deterministic rule that tests can verify.
 *
 * Tests can call computeDrillPanelPosition() with known store state to assert
 * the panel anchor matches the expected world position without mounting the
 * React component.
 */
export function computeDrillPanelPosition(
  drillLevel: DrillLevel,
  drillFloor: number | null,
  roomWorldCenter: { x: number; y: number; z: number } | null,
  agentWorldPos: { x: number; y: number; z: number } | null,
): [number, number, number] {
  if (drillLevel === "building") {
    return [-2.8, 2.5, 3];
  }
  if (drillLevel === "floor") {
    const floorY = (drillFloor ?? 0) * FLOOR_HEIGHT;
    return [-2.5, floorY + 2.0, 3];
  }
  if (drillLevel === "room" && roomWorldCenter) {
    return [
      roomWorldCenter.x - 1.5,
      roomWorldCenter.y + 0.8,
      roomWorldCenter.z,
    ];
  }
  if (drillLevel === "agent" && agentWorldPos) {
    return [
      agentWorldPos.x + 0.65,
      agentWorldPos.y + 1.6,
      agentWorldPos.z,
    ];
  }
  return [-2.8, 2.5, 3];
}
