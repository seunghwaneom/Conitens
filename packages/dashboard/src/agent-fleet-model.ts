export type AgentLifecycleStatus = "dormant" | "idle" | "assigned" | "running" | "paused" | "retired";

export interface AgentProfile {
  id: string;
  name: string;
  role: "orchestrator" | "implementer" | "researcher" | "reviewer" | "validator";
  archetype: string;
  status: AgentLifecycleStatus;
  roomId: string;
  taskCount: number;
  lastActive: string;
  memoryCount: number;
  errorRate: number;
  latestRunId?: string | null;
  latestRunStatus?: string | null;
  latestBlocker?: string | null;
  pendingApprovals?: number;
  workspaceRef?: string | null;
}

export type AgentAttentionLevel = "review" | "running" | "blocked" | "dormant" | "stable";

export function getAgentAttentionLevel(agent: AgentProfile): AgentAttentionLevel {
  if ((agent.pendingApprovals ?? 0) > 0 || agent.errorRate >= 0.05) {
    return "review";
  }
  if (agent.latestBlocker || agent.status === "paused") {
    return "blocked";
  }
  if (agent.status === "running" || agent.status === "assigned") {
    return "running";
  }
  if (agent.status === "dormant" || agent.status === "retired") {
    return "dormant";
  }
  return "stable";
}

const ATTENTION_ORDER: Record<AgentAttentionLevel, number> = {
  review: 0,
  running: 1,
  blocked: 2,
  stable: 3,
  dormant: 4,
};

export function compareAgentAttention(left: AgentProfile, right: AgentProfile): number {
  const leftLevel = getAgentAttentionLevel(left);
  const rightLevel = getAgentAttentionLevel(right);
  if (leftLevel !== rightLevel) {
    return ATTENTION_ORDER[leftLevel] - ATTENTION_ORDER[rightLevel];
  }
  if ((left.pendingApprovals ?? 0) !== (right.pendingApprovals ?? 0)) {
    return (right.pendingApprovals ?? 0) - (left.pendingApprovals ?? 0);
  }
  if (left.taskCount !== right.taskCount) {
    return right.taskCount - left.taskCount;
  }
  return new Date(right.lastActive).getTime() - new Date(left.lastActive).getTime();
}

export const demoFleet: AgentProfile[] = [
  { id: "architect", name: "Architect", role: "orchestrator", archetype: "Floor lead", status: "running", roomId: "ops-control", taskCount: 3, lastActive: "2026-04-02T04:30:00Z", memoryCount: 12, errorRate: 0.02 },
  { id: "sentinel", name: "Sentinel", role: "validator", archetype: "Gatekeeper", status: "running", roomId: "validation-office", taskCount: 2, lastActive: "2026-04-02T04:28:00Z", memoryCount: 8, errorRate: 0.05 },
  { id: "owner", name: "Owner", role: "orchestrator", archetype: "Floor lead", status: "idle", roomId: "ops-control", taskCount: 1, lastActive: "2026-04-02T03:45:00Z", memoryCount: 6, errorRate: 0.0 },
  { id: "worker-1", name: "Worker-1", role: "implementer", archetype: "Builder", status: "idle", roomId: "impl-office", taskCount: 4, lastActive: "2026-04-02T04:15:00Z", memoryCount: 15, errorRate: 0.08 },
  { id: "scout", name: "Scout", role: "researcher", archetype: "Explorer", status: "paused", roomId: "research-lab", taskCount: 0, lastActive: "2026-04-01T22:00:00Z", memoryCount: 20, errorRate: 0.01 },
  { id: "auditor", name: "Auditor", role: "reviewer", archetype: "Inspector", status: "retired", roomId: "review-bay", taskCount: 7, lastActive: "2026-03-30T18:00:00Z", memoryCount: 34, errorRate: 0.03 },
];
