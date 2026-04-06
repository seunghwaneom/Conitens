import type { ForwardOperatorAgentsResponse } from "./forward-bridge.js";
import type { AgentProfile } from "./agent-fleet-model.js";

export function toOperatorAgentProfiles(response: ForwardOperatorAgentsResponse): AgentProfile[] {
  return response.agents.map((agent) => ({
    id: agent.agent_id,
    name: agent.name,
    role: agent.role,
    archetype: agent.archetype,
    status: agent.status,
    roomId: agent.room_id,
    taskCount: agent.task_count,
    lastActive: agent.last_active,
    memoryCount: agent.memory_count,
    errorRate: agent.error_rate,
    latestRunId: agent.latest_run_id,
    latestRunStatus: agent.latest_run_status,
    latestBlocker: agent.latest_blocker,
    pendingApprovals: agent.pending_approvals,
    workspaceRef: agent.workspace_ref,
  }));
}
