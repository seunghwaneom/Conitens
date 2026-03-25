/**
 * DiegeticDetailPanel — In-world detail view panel anchored to a display surface.
 *
 * Renders a rich detail card in 3D world space (via @react-three/drei Html),
 * anchored to the world position of the display surface that was clicked.
 *
 * Design principles:
 *  - No HUD overlay — content lives in the 3D scene coordinate system
 *  - World-anchored: panel moves and scales with the camera (fully diegetic)
 *  - Context-aware: shows room detail by default; agent detail when drilled to
 *    agent level
 *  - Dismissible via close button or ESC key
 *  - All interactions are event-sourced through the spatial store
 *
 * Panel hierarchy:
 *  1. Surface label header (surface type + label)
 *  2. Room detail OR Agent detail depending on drill level
 *     Room: name, type, activity, agent list, members, drill-in CTA
 *     Agent: name, role, status, current task, capabilities, focus CTA
 *
 * Positioning:
 *  Each display surface facing direction maps to a world-space offset so
 *  the panel appears naturally in front of / above the screen face —
 *  within arm's reach of the diegetic surface in 3D space.
 */

import { useCallback, useEffect } from "react";
import { Html } from "@react-three/drei";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";
import type { DisplaySurfaceDef, DisplayFacing } from "./DisplaySurfaces.js";

// ── Panel positioning ─────────────────────────────────────────────────────────

/**
 * Compute world-space offset for the detail panel relative to the surface.
 * Places the panel above and slightly "outward" (toward the expected viewer).
 *
 * The FORWARD constant is how far in the facing direction the panel floats,
 * UP is the vertical rise above the screen centre.
 */
function getPanelOffset(facing: DisplayFacing): [number, number, number] {
  const FORWARD = 0.55; // units toward viewer (away from wall)
  const UP      = 0.80; // units above screen centre

  switch (facing) {
    case "north": return [0,    UP,  -FORWARD]; // screen faces south (-Z) → panel south
    case "south": return [0,    UP,   FORWARD]; // screen faces north (+Z) → panel north
    case "east":  return [-FORWARD, UP, 0];      // screen faces west (-X) → panel west
    case "west":  return [ FORWARD, UP, 0];      // screen faces east (+X) → panel east
    case "up":    return [0.55, UP * 1.5, 0];    // floor-standing → panel to the side
  }
}

// ── Shared style constants ────────────────────────────────────────────────────

const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

const STATUS_COLORS: Record<string, string> = {
  inactive:   "#555566",
  idle:       "#8888aa",
  active:     "#00ff88",
  busy:       "#ffaa00",
  error:      "#ff4444",
  terminated: "#333344",
};

const ACTIVITY_COLORS: Record<string, string> = {
  idle:   "#444455",
  active: "#00cc66",
  busy:   "#cc8800",
  error:  "#cc3333",
};

const RISK_COLORS: Record<string, string> = {
  low:    "#33aa66",
  medium: "#cc8800",
  high:   "#cc3333",
};

// ── Shared UI fragments ────────────────────────────────────────────────────────

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{
        background: "transparent",
        border: "1px solid #333355",
        borderRadius: "3px",
        color: "#555566",
        fontSize: "10px",
        cursor: "pointer",
        padding: "2px 6px",
        fontFamily: FONT,
        lineHeight: 1,
        flexShrink: 0,
      }}
      title="Close panel (ESC)"
    >
      ✕
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "7px",
        color: "#444466",
        fontFamily: FONT,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        marginBottom: "4px",
      }}
    >
      {children}
    </div>
  );
}

// ── Room Detail Content ────────────────────────────────────────────────────────

/**
 * RoomDetailContent — displays room metadata, agent roster, and activity.
 */
function RoomDetailContent({
  roomId,
  onClose,
}: {
  roomId: string;
  onClose: () => void;
}) {
  const room          = useSpatialStore((s) => s.getRoomById(roomId));
  const roomState     = useSpatialStore((s) => s.getRoomState(roomId));
  const drillIntoRoom = useSpatialStore((s) => s.drillIntoRoom);

  const agents = useAgentStore((s) =>
    Object.values(s.agents).filter((a) => a.roomId === roomId),
  );

  if (!room) {
    return (
      <div style={{ color: "#666677", fontSize: "9px", fontFamily: FONT }}>
        Room not found: {roomId}
      </div>
    );
  }

  const activityColor  = ACTIVITY_COLORS[roomState.activity] ?? "#444455";
  const activeAgents   = agents.filter((a) => a.status === "active" || a.status === "busy");
  const errorAgents    = agents.filter((a) => a.status === "error");
  const visibleAgents  = agents.slice(0, 6);

  return (
    <div style={{ width: "220px" }}>

      {/* ── Header row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
          paddingBottom: "7px",
          borderBottom: `1px solid ${room.colorAccent}33`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={{ fontSize: "16px", lineHeight: 1 }}>{room.icon}</span>
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: room.colorAccent,
                fontFamily: FONT,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {room.name}
            </div>
            <div
              style={{
                fontSize: "8px",
                color: "#6677aa",
                fontFamily: FONT,
                letterSpacing: "0.04em",
                marginTop: "1px",
              }}
            >
              {room.roomType.toUpperCase()} · FLOOR {room.floor}
            </div>
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      {/* ── Activity status row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "8px",
          padding: "4px 6px",
          background: `${activityColor}0f`,
          borderRadius: "3px",
          border: `1px solid ${activityColor}22`,
        }}
      >
        <div
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: activityColor,
            flexShrink: 0,
            boxShadow: `0 0 4px ${activityColor}`,
          }}
        />
        <span
          style={{
            fontSize: "9px",
            color: activityColor,
            fontFamily: FONT,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {roomState.activity}
        </span>
        {activeAgents.length > 0 && (
          <span style={{ fontSize: "8px", color: "#666688", fontFamily: FONT }}>
            · {activeAgents.length} ACTIVE
          </span>
        )}
        {errorAgents.length > 0 && (
          <span style={{ fontSize: "8px", color: "#cc3333", fontFamily: FONT }}>
            · {errorAgents.length} ERROR
          </span>
        )}
      </div>

      {/* ── Agent roster ── */}
      {agents.length > 0 && (
        <div style={{ marginBottom: "8px" }}>
          <SectionLabel>AGENTS [{agents.length}]</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {visibleAgents.map((agent) => {
              const sc = STATUS_COLORS[agent.status] ?? "#555566";
              return (
                <div
                  key={agent.def.agentId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "2px 5px",
                    background: "rgba(255,255,255,0.025)",
                    borderRadius: "2px",
                    border: `1px solid ${agent.def.visual.color}1a`,
                  }}
                >
                  <span style={{ fontSize: "9px", lineHeight: 1 }}>
                    {agent.def.visual.icon}
                  </span>
                  <span
                    style={{
                      fontSize: "8px",
                      color: "#8888aa",
                      fontFamily: FONT,
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
                  <span
                    style={{
                      fontSize: "7px",
                      color: sc,
                      fontFamily: FONT,
                      minWidth: "50px",
                      textAlign: "right",
                    }}
                  >
                    {agent.status.toUpperCase()}
                  </span>
                </div>
              );
            })}
            {agents.length > 6 && (
              <div
                style={{ fontSize: "7px", color: "#444466", fontFamily: FONT, paddingLeft: "5px" }}
              >
                +{agents.length - 6} more agents
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Static member list (when no live agents) ── */}
      {agents.length === 0 && room.members.length > 0 && (
        <div style={{ marginBottom: "8px" }}>
          <SectionLabel>MEMBERS [{room.members.length}]</SectionLabel>
          <div style={{ color: "#666677", fontSize: "8px", fontFamily: FONT }}>
            {room.members.slice(0, 4).join(", ")}
            {room.members.length > 4 && ` +${room.members.length - 4}`}
          </div>
        </div>
      )}

      {/* ── Room meta ── */}
      {room._meta && (
        <div style={{ marginBottom: "8px" }}>
          <div style={{ fontSize: "7px", color: "#444466", fontFamily: FONT }}>
            ACCESS:{" "}
            <span style={{ color: "#888899" }}>
              {room._meta.accessPolicy?.replace(/-/g, " ").toUpperCase() ?? "OPEN"}
            </span>
            {room._meta.maxOccupancy != null && (
              <span style={{ marginLeft: "6px" }}>
                MAX: <span style={{ color: "#888899" }}>{room._meta.maxOccupancy}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Drill-in CTA ── */}
      <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            drillIntoRoom(roomId);
            onClose();
          }}
          style={{
            background: `${room.colorAccent}22`,
            border: `1px solid ${room.colorAccent}55`,
            borderRadius: "3px",
            color: room.colorAccent,
            fontSize: "8px",
            cursor: "pointer",
            padding: "3px 8px",
            fontFamily: FONT,
            letterSpacing: "0.06em",
            fontWeight: 700,
          }}
        >
          DRILL IN →
        </button>
      </div>
    </div>
  );
}

// ── Agent Detail Content ───────────────────────────────────────────────────────

/**
 * AgentDetailContent — shows agent metadata, status, current task, capabilities.
 */
function AgentDetailContent({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}) {
  const agent          = useAgentStore((s) => s.agents[agentId]);
  const selectAgent    = useAgentStore((s) => s.selectAgent);
  const drillIntoAgent = useSpatialStore((s) => s.drillIntoAgent);

  if (!agent) return null;

  const sc = STATUS_COLORS[agent.status] ?? "#555566";
  const rc = RISK_COLORS[agent.def.riskClass] ?? "#666677";

  return (
    <div style={{ width: "200px" }}>

      {/* ── Header row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
          paddingBottom: "7px",
          borderBottom: `1px solid ${agent.def.visual.color}33`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={{ fontSize: "16px", lineHeight: 1 }}>{agent.def.visual.icon}</span>
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: agent.def.visual.color,
                fontFamily: FONT,
                letterSpacing: "0.05em",
              }}
            >
              {agent.def.name}
            </div>
            <div
              style={{
                fontSize: "8px",
                color: "#6677aa",
                fontFamily: FONT,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginTop: "1px",
              }}
            >
              {agent.def.role}
            </div>
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      {/* ── Status badge ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "8px",
          padding: "4px 6px",
          background: `${sc}0f`,
          borderRadius: "3px",
          border: `1px solid ${sc}22`,
        }}
      >
        <div
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: sc,
            flexShrink: 0,
            boxShadow: `0 0 4px ${sc}`,
          }}
        />
        <span
          style={{
            fontSize: "9px",
            color: sc,
            fontFamily: FONT,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            flex: 1,
          }}
        >
          {agent.status}
        </span>
        <span style={{ fontSize: "7px", color: rc, fontFamily: FONT, fontWeight: 700 }}>
          RISK: {agent.def.riskClass.toUpperCase()}
        </span>
      </div>

      {/* ── Current task ── */}
      {agent.currentTaskTitle && (
        <div style={{ marginBottom: "8px" }}>
          <SectionLabel>CURRENT TASK</SectionLabel>
          <div
            style={{
              fontSize: "8px",
              color: "#8888bb",
              fontFamily: FONT,
              padding: "3px 5px",
              background: "rgba(255,255,255,0.035)",
              borderRadius: "2px",
              border: "1px solid #1e1e33",
              wordBreak: "break-word",
            }}
          >
            {agent.currentTaskTitle}
          </div>
        </div>
      )}

      {/* ── Capabilities ── */}
      {agent.def.capabilities.length > 0 && (
        <div style={{ marginBottom: "8px" }}>
          <SectionLabel>CAPABILITIES</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
            {agent.def.capabilities.slice(0, 5).map((cap) => (
              <span
                key={cap}
                style={{
                  fontSize: "7px",
                  color: `${agent.def.visual.color}cc`,
                  fontFamily: FONT,
                  background: `${agent.def.visual.color}11`,
                  border: `1px solid ${agent.def.visual.color}22`,
                  borderRadius: "2px",
                  padding: "1px 4px",
                }}
              >
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Summary ── */}
      {agent.def.summary && (
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              fontSize: "7px",
              color: "#555566",
              fontFamily: FONT,
              fontStyle: "italic",
              lineHeight: 1.5,
            }}
          >
            {agent.def.summary.length > 100
              ? agent.def.summary.slice(0, 97) + "…"
              : agent.def.summary}
          </div>
        </div>
      )}

      {/* ── Focus agent CTA ── */}
      <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            selectAgent(agentId);
            drillIntoAgent(agentId, agent.worldPosition);
            onClose();
          }}
          style={{
            background: `${agent.def.visual.color}22`,
            border: `1px solid ${agent.def.visual.color}55`,
            borderRadius: "3px",
            color: agent.def.visual.color,
            fontSize: "8px",
            cursor: "pointer",
            padding: "3px 8px",
            fontFamily: FONT,
            letterSpacing: "0.06em",
            fontWeight: 700,
          }}
        >
          FOCUS AGENT →
        </button>
      </div>
    </div>
  );
}

// ── Main Panel Component ──────────────────────────────────────────────────────

export interface DiegeticDetailPanelProps {
  def: DisplaySurfaceDef;
}

/**
 * DiegeticDetailPanel — renders the in-world detail card for a display surface.
 *
 * Decides what to show based on the current drill level:
 *   - drillLevel === "agent"  → AgentDetailContent for the drilled agent
 *   - otherwise               → RoomDetailContent for the surface's room
 *
 * The panel floats in 3D world space above/in-front of the surface, scaled
 * with the camera so it remains readable at any zoom level.
 */
export function DiegeticDetailPanel({ def }: DiegeticDetailPanelProps) {
  const setActiveSurface = useSpatialStore((s) => s.setActiveSurface);
  const drillAgent       = useSpatialStore((s) => s.drillAgent);
  const drillLevel       = useSpatialStore((s) => s.drillLevel);

  // Show agent detail when drilled to agent level; otherwise room detail
  const showAgentDetail  = drillLevel === "agent" && drillAgent != null;

  // Compute panel world position: surface position + facing-aware offset
  const [wx, wy, wz] = def.anchor.worldPos;
  const [ox, oy, oz]  = getPanelOffset(def.anchor.facing);
  const panelPos: [number, number, number] = [wx + ox, wy + oy, wz + oz];

  // Dismiss handler — stable reference for useEffect cleanup
  const dismiss = useCallback(() => setActiveSurface(null), [setActiveSurface]);

  // ESC key dismisses the panel
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [dismiss]);

  // Kind icon for the surface label header
  const kindIcon =
    def.kind === "monitor"       ? "🖥"  :
    def.kind === "wall-panel"    ? "📋"  :
    /* hologram-stand */           "💫";

  return (
    <Html
      position={panelPos}
      center
      distanceFactor={7}
      zIndexRange={[100, 0]}
      style={{ pointerEvents: "none" }}
    >
      {/*
       * Outer wrapper is pointer-events: none (set on Html above).
       * Inner div re-enables pointer events so the buttons are clickable,
       * but stopPropagation prevents clicks leaking into the 3D scene.
       */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          pointerEvents: "auto",
          background: "rgba(7, 7, 18, 0.94)",
          border: `1px solid ${def.accentColor}44`,
          borderRadius: "7px",
          padding: "11px 13px",
          backdropFilter: "blur(8px)",
          boxShadow: `
            0 0 0 1px ${def.accentColor}18,
            0 0 24px ${def.accentColor}1a,
            0 6px 20px rgba(0,0,0,0.65)
          `,
          color: "#aaaacc",
          fontFamily: FONT,
          userSelect: "none",
        }}
      >
        {/* ── Surface label header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            marginBottom: "10px",
            fontSize: "7px",
            color: `${def.accentColor}99`,
            fontFamily: FONT,
            textTransform: "uppercase",
            letterSpacing: "0.10em",
          }}
        >
          <span style={{ fontSize: "9px" }}>{kindIcon}</span>
          <span>{def.label.replace(/-/g, " ")}</span>
          <span style={{ marginLeft: "auto", color: "#333355" }}>
            {def.kind.toUpperCase()}
          </span>
        </div>

        {/* ── Content block ── */}
        {showAgentDetail
          ? <AgentDetailContent agentId={drillAgent!} onClose={dismiss} />
          : <RoomDetailContent roomId={def.roomId} onClose={dismiss} />
        }
      </div>
    </Html>
  );
}
