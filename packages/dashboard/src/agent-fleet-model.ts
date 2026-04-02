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
}
