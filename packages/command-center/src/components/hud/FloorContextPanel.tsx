/**
 * FloorContextPanel — Full control-plane context panel for a floor (office) node.
 */
import type React from "react";
import { useState } from "react";
import { useSpatialStore } from "../../store/spatial-store.js";
import { useAgentStore } from "../../store/agent-store.js";
import { ROOM_TYPE_ICONS } from "./room-type-meta.js";

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
export function FloorContextPanel() {
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
