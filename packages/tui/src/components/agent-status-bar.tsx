import React from "react";
import { Box, Text } from "ink";

export interface AgentStatus {
  agentId: string;
  status: "running" | "idle" | "error" | "terminated";
}

interface Props {
  agents: AgentStatus[];
}

export function AgentStatusBar({ agents }: Props) {
  return (
    <Box flexDirection="row" gap={1}>
      <Text bold>Agents:</Text>
      {agents.length === 0 && <Text dimColor>No agents registered</Text>}
      {agents.map((agent) => {
        const icon = agent.status === "running" ? "■" :
                     agent.status === "error" ? "!" :
                     agent.status === "idle" ? "○" : "□";
        const color = agent.status === "running" ? "green" :
                      agent.status === "error" ? "red" :
                      agent.status === "idle" ? "yellow" : "gray";
        return (
          <Text key={agent.agentId} color={color}>
            [{agent.agentId}: {icon} {agent.status}]
          </Text>
        );
      })}
    </Box>
  );
}
