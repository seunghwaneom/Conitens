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

export const demoFleet: AgentProfile[] = [
  { id: "architect", name: "Architect", role: "orchestrator", archetype: "Floor lead", status: "running", roomId: "ops-control", taskCount: 3, lastActive: "2026-04-02T04:30:00Z", memoryCount: 12, errorRate: 0.02 },
  { id: "sentinel", name: "Sentinel", role: "validator", archetype: "Gatekeeper", status: "running", roomId: "validation-office", taskCount: 2, lastActive: "2026-04-02T04:28:00Z", memoryCount: 8, errorRate: 0.05 },
  { id: "owner", name: "Owner", role: "orchestrator", archetype: "Floor lead", status: "idle", roomId: "ops-control", taskCount: 1, lastActive: "2026-04-02T03:45:00Z", memoryCount: 6, errorRate: 0.0 },
  { id: "worker-1", name: "Worker-1", role: "implementer", archetype: "Builder", status: "idle", roomId: "impl-office", taskCount: 4, lastActive: "2026-04-02T04:15:00Z", memoryCount: 15, errorRate: 0.08 },
  { id: "scout", name: "Scout", role: "researcher", archetype: "Explorer", status: "paused", roomId: "research-lab", taskCount: 0, lastActive: "2026-04-01T22:00:00Z", memoryCount: 20, errorRate: 0.01 },
  { id: "auditor", name: "Auditor", role: "reviewer", archetype: "Inspector", status: "retired", roomId: "review-bay", taskCount: 7, lastActive: "2026-03-30T18:00:00Z", memoryCount: 34, errorRate: 0.03 },
];
