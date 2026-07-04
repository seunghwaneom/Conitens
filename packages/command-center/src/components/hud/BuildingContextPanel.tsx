/**
 * BuildingContextPanel — Full control-plane context panel for the building node.
 */
import { useState } from "react";
import { useSpatialStore } from "../../store/spatial-store.js";
import { useAgentStore } from "../../store/agent-store.js";

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
export function BuildingContextPanel() {
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
