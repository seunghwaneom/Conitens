/**
 * AgentRoster — shows all agents with their status.
 */
import { useAgentStore } from "../../store/agent-store.js";
import { styles } from "./hud-styles.js";
import { agentStatusColor } from "./status-colors.js";

/** Agent roster — shows all agents with their status */
export function AgentRoster() {
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
