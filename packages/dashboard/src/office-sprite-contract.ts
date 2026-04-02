import { AGENTS, type AgentRole } from "../../command-center/src/data/agents.ts";

export interface CanonicalOfficeRoleContract {
  role: AgentRole;
  icon: string;
  shortLabel: string;
  defaultRoom: string;
  commandCenterSheetPath: string;
}

export const OFFICE_CANONICAL_ROLE_CONTRACT = AGENTS.reduce<Record<AgentRole, CanonicalOfficeRoleContract>>(
  (acc, agent) => {
    acc[agent.role] = {
      role: agent.role,
      icon: agent.visual.icon,
      shortLabel: agent.visual.label,
      defaultRoom: agent.defaultRoom,
      commandCenterSheetPath: `/sprites/agent-${agent.role}.png`,
    };
    return acc;
  },
  {} as Record<AgentRole, CanonicalOfficeRoleContract>,
);
