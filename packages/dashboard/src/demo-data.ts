import type { AgentState, EventRecord, TaskState } from "./store/event-store.js";
import type { AgentProfile } from "./agent-fleet-model.js";
import type { ImprovementProposal, EvolutionEntry, LearningMetric } from "./evolution-model.js";

export const demoAgents: AgentState[] = [
  { agentId: "architect", status: "running" },
  { agentId: "sentinel", status: "running" },
  { agentId: "worker-1", status: "idle" },
  { agentId: "owner", status: "idle" },
];

export const demoTasks: TaskState[] = [
  { taskId: "wf_apply", state: "active", assignee: "architect" },
  { taskId: "q_184_owner_gate", state: "blocked", assignee: "owner" },
  { taskId: "verify_append", state: "review", assignee: "sentinel" },
  { taskId: "office_snapshot", state: "planned", assignee: "worker-1" },
  { taskId: "replay_bundle", state: "assigned", assignee: "worker-1" },
  { taskId: "audit_packet", state: "done", assignee: "sentinel" },
];

export const demoEvents: EventRecord[] = [
  {
    event_id: "evt-001",
    type: "workflow.started",
    ts: "2026-03-21T08:02:11.000Z",
    actor: { kind: "agent", id: "architect" },
    task_id: "wf_apply",
    payload: { workflow: "wf_apply" },
  },
  {
    event_id: "evt-002",
    type: "question.opened",
    ts: "2026-03-21T08:03:24.000Z",
    actor: { kind: "agent", id: "architect" },
    task_id: "q_184_owner_gate",
    payload: { gate: "owner" },
  },
  {
    event_id: "evt-003",
    type: "handoff.sent",
    ts: "2026-03-21T08:05:02.000Z",
    actor: { kind: "agent", id: "architect" },
    task_id: "verify_append",
    payload: { target: "sentinel" },
  },
  {
    event_id: "evt-004",
    type: "agent.spawned",
    ts: "2026-03-21T08:06:15.000Z",
    actor: { kind: "agent", id: "worker-1" },
    payload: { provider: "codex" },
  },
  {
    event_id: "evt-005",
    type: "task.status_changed",
    ts: "2026-03-21T08:08:44.000Z",
    actor: { kind: "agent", id: "sentinel" },
    task_id: "verify_append",
    payload: { to: "review" },
  },
  {
    event_id: "evt-006",
    type: "approval.pending",
    ts: "2026-03-21T08:10:03.000Z",
    actor: { kind: "agent", id: "owner" },
    task_id: "q_184_owner_gate",
    payload: { owner: "ops.team" },
  },
  {
    event_id: "evt-007",
    type: "event.appended",
    ts: "2026-03-21T08:12:38.000Z",
    actor: { kind: "system", id: "ops-log" },
    task_id: "office_snapshot",
    payload: { stream: "ops" },
  },
  {
    event_id: "evt-008",
    type: "artifact.written",
    ts: "2026-03-21T08:14:52.000Z",
    actor: { kind: "agent", id: "worker-1" },
    task_id: "replay_bundle",
    payload: { path: ".notes/runs/wf_apply.json" },
  },
];

export const demoFleet: AgentProfile[] = [
  { id: "architect", name: "Architect", role: "orchestrator", archetype: "Floor lead", status: "running", roomId: "ops-control", taskCount: 3, lastActive: new Date(Date.now() - 30 * 60 * 1000).toISOString(), memoryCount: 12, errorRate: 0.02 },
  { id: "sentinel", name: "Sentinel", role: "validator", archetype: "Gatekeeper", status: "running", roomId: "validation-office", taskCount: 2, lastActive: new Date(Date.now() - 32 * 60 * 1000).toISOString(), memoryCount: 8, errorRate: 0.05 },
  { id: "owner", name: "Owner", role: "orchestrator", archetype: "Floor lead", status: "idle", roomId: "ops-control", taskCount: 1, lastActive: new Date(Date.now() - 75 * 60 * 1000).toISOString(), memoryCount: 6, errorRate: 0.0 },
  { id: "worker-1", name: "Worker-1", role: "implementer", archetype: "Builder", status: "idle", roomId: "impl-office", taskCount: 4, lastActive: new Date(Date.now() - 45 * 60 * 1000).toISOString(), memoryCount: 15, errorRate: 0.08 },
  { id: "scout", name: "Scout", role: "researcher", archetype: "Explorer", status: "paused", roomId: "research-lab", taskCount: 0, lastActive: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), memoryCount: 20, errorRate: 0.01 },
  { id: "auditor", name: "Auditor", role: "reviewer", archetype: "Inspector", status: "retired", roomId: "review-bay", taskCount: 7, lastActive: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), memoryCount: 34, errorRate: 0.03 },
];

export const demoProposals: ImprovementProposal[] = [
  { id: "prop-001", agentId: "architect", kind: "self", status: "pending", title: "Increase handoff retry threshold from 2 to 4", rationale: "Last 3 runs showed premature handoff failures when sentinel was slow to respond. Increasing threshold reduces false negatives.", evidenceRefs: ["run:r-042:room:ops-control:msg:1284", "run:r-041:validator:handoff-check"], confidence: 0.82, createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
  { id: "prop-002", agentId: "worker-1", kind: "program", status: "pending", title: "Add retry logic to ensemble_forward_bridge HTTP handler", rationale: "Bridge timeout errors occur 12% of runs. A simple 3-retry with backoff would reduce failure rate to <1%.", evidenceRefs: ["run:r-040:insight:hotspot-bridge-timeout", "run:r-039:insight:hotspot-bridge-timeout"], confidence: 0.91, createdAt: new Date(Date.now() - 165 * 60 * 1000).toISOString() },
  { id: "prop-003", agentId: "sentinel", kind: "self", status: "approved", title: "Expand validation ruleset with JSON schema check", rationale: "3 consecutive runs had schema-invalid events pass validation. Adding JSON schema pre-check catches these earlier.", evidenceRefs: ["run:r-042:validator:schema-miss"], confidence: 0.76, createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() },
  { id: "prop-004", agentId: "architect", kind: "program", status: "rejected", title: "Remove ensemble_loop_debug.py dead code", rationale: "File has 0 imports across codebase. However, it is used by external tooling.", evidenceRefs: ["grep:ensemble_loop_debug:0-refs"], confidence: 0.45, createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString() },
];

export const demoEvolution: EvolutionEntry[] = [
  { id: "evo-001", agentId: "architect", kind: "self", title: "Reduced handoff timeout from 30s to 15s", outcome: "improved", deltaMetric: "Handoff latency -47%", appliedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { id: "evo-002", agentId: "sentinel", kind: "self", title: "Added parallel validation for independent checks", outcome: "improved", deltaMetric: "Validation time -62%", appliedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
  { id: "evo-003", agentId: "worker-1", kind: "program", title: "Patched ensemble_spawn.py race condition", outcome: "improved", deltaMetric: "Spawn failures -89%", appliedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
  { id: "evo-004", agentId: "architect", kind: "self", title: "Increased context window budget for complex tasks", outcome: "neutral", deltaMetric: "No measurable change", appliedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString() },
  { id: "evo-005", agentId: "scout", kind: "self", title: "Broadened search scope for research queries", outcome: "regressed", deltaMetric: "Relevance score -15%", appliedAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString() },
];

export const demoLearningMetrics: LearningMetric[] = [
  { agentId: "architect", memoryCounts: { identity: 2, procedural: 8, episodic: 14, reflection: 5 }, confidenceDistribution: { high: 12, medium: 9, low: 8 }, proposalStats: { pending: 1, approved: 3, rejected: 1 } },
  { agentId: "sentinel", memoryCounts: { identity: 2, procedural: 5, episodic: 8, reflection: 3 }, confidenceDistribution: { high: 8, medium: 6, low: 4 }, proposalStats: { pending: 0, approved: 2, rejected: 0 } },
  { agentId: "worker-1", memoryCounts: { identity: 2, procedural: 10, episodic: 20, reflection: 2 }, confidenceDistribution: { high: 15, medium: 12, low: 7 }, proposalStats: { pending: 1, approved: 1, rejected: 0 } },
  { agentId: "owner", memoryCounts: { identity: 2, procedural: 4, episodic: 6, reflection: 1 }, confidenceDistribution: { high: 5, medium: 4, low: 4 }, proposalStats: { pending: 0, approved: 0, rejected: 0 } },
  { agentId: "scout", memoryCounts: { identity: 2, procedural: 12, episodic: 18, reflection: 6 }, confidenceDistribution: { high: 18, medium: 10, low: 10 }, proposalStats: { pending: 0, approved: 1, rejected: 1 } },
  { agentId: "auditor", memoryCounts: { identity: 2, procedural: 20, episodic: 30, reflection: 8 }, confidenceDistribution: { high: 25, medium: 18, low: 17 }, proposalStats: { pending: 0, approved: 5, rejected: 2 } },
];

export interface DemoData {
  agents: AgentState[];
  tasks: TaskState[];
  events: EventRecord[];
  fleet: AgentProfile[];
  proposals: ImprovementProposal[];
  evolution: EvolutionEntry[];
  learningMetrics: LearningMetric[];
}

export function getDemoData(): DemoData {
  return {
    agents: demoAgents,
    tasks: demoTasks,
    events: demoEvents,
    fleet: demoFleet,
    proposals: demoProposals,
    evolution: demoEvolution,
    learningMetrics: demoLearningMetrics,
  };
}
