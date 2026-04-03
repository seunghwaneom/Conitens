export interface ImprovementProposal {
  id: string;
  agentId: string;
  kind: "self" | "program";
  status: "pending" | "approved" | "rejected" | "applied";
  title: string;
  rationale: string;
  evidenceRefs: string[];
  confidence: number;
  createdAt: string;
}

export interface EvolutionEntry {
  id: string;
  agentId: string;
  kind: "self" | "program";
  title: string;
  outcome: "improved" | "neutral" | "regressed";
  deltaMetric: string;
  appliedAt: string;
}

export interface LearningMetric {
  agentId: string;
  memoryCounts: { identity: number; procedural: number; episodic: number; reflection: number };
  confidenceDistribution: { high: number; medium: number; low: number };
  proposalStats: { pending: number; approved: number; rejected: number };
}

export const demoProposals: ImprovementProposal[] = [
  { id: "prop-001", agentId: "architect", kind: "self", status: "pending", title: "Increase handoff retry threshold from 2 to 4", rationale: "Last 3 runs showed premature handoff failures when sentinel was slow to respond. Increasing threshold reduces false negatives.", evidenceRefs: ["run:r-042:room:ops-control:msg:1284", "run:r-041:validator:handoff-check"], confidence: 0.82, createdAt: "2026-04-02T03:30:00Z" },
  { id: "prop-002", agentId: "worker-1", kind: "program", status: "pending", title: "Add retry logic to ensemble_forward_bridge HTTP handler", rationale: "Bridge timeout errors occur 12% of runs. A simple 3-retry with backoff would reduce failure rate to <1%.", evidenceRefs: ["run:r-040:insight:hotspot-bridge-timeout", "run:r-039:insight:hotspot-bridge-timeout"], confidence: 0.91, createdAt: "2026-04-02T02:15:00Z" },
  { id: "prop-003", agentId: "sentinel", kind: "self", status: "approved", title: "Expand validation ruleset with JSON schema check", rationale: "3 consecutive runs had schema-invalid events pass validation. Adding JSON schema pre-check catches these earlier.", evidenceRefs: ["run:r-042:validator:schema-miss"], confidence: 0.76, createdAt: "2026-04-01T22:00:00Z" },
  { id: "prop-004", agentId: "architect", kind: "program", status: "rejected", title: "Remove ensemble_loop_debug.py dead code", rationale: "File has 0 imports across codebase. However, it is used by external tooling.", evidenceRefs: ["grep:ensemble_loop_debug:0-refs"], confidence: 0.45, createdAt: "2026-04-01T18:00:00Z" },
];

export const demoEvolution: EvolutionEntry[] = [
  { id: "evo-001", agentId: "architect", kind: "self", title: "Reduced handoff timeout from 30s to 15s", outcome: "improved", deltaMetric: "Handoff latency -47%", appliedAt: "2026-03-30T14:00:00Z" },
  { id: "evo-002", agentId: "sentinel", kind: "self", title: "Added parallel validation for independent checks", outcome: "improved", deltaMetric: "Validation time -62%", appliedAt: "2026-03-28T10:00:00Z" },
  { id: "evo-003", agentId: "worker-1", kind: "program", title: "Patched ensemble_spawn.py race condition", outcome: "improved", deltaMetric: "Spawn failures -89%", appliedAt: "2026-03-26T08:00:00Z" },
  { id: "evo-004", agentId: "architect", kind: "self", title: "Increased context window budget for complex tasks", outcome: "neutral", deltaMetric: "No measurable change", appliedAt: "2026-03-24T16:00:00Z" },
  { id: "evo-005", agentId: "scout", kind: "self", title: "Broadened search scope for research queries", outcome: "regressed", deltaMetric: "Relevance score -15%", appliedAt: "2026-03-22T12:00:00Z" },
];

export const demoLearningMetrics: LearningMetric[] = [
  { agentId: "architect", memoryCounts: { identity: 2, procedural: 8, episodic: 14, reflection: 5 }, confidenceDistribution: { high: 12, medium: 9, low: 8 }, proposalStats: { pending: 1, approved: 3, rejected: 1 } },
  { agentId: "sentinel", memoryCounts: { identity: 2, procedural: 5, episodic: 8, reflection: 3 }, confidenceDistribution: { high: 8, medium: 6, low: 4 }, proposalStats: { pending: 0, approved: 2, rejected: 0 } },
  { agentId: "worker-1", memoryCounts: { identity: 2, procedural: 10, episodic: 20, reflection: 2 }, confidenceDistribution: { high: 15, medium: 12, low: 7 }, proposalStats: { pending: 1, approved: 1, rejected: 0 } },
  { agentId: "owner", memoryCounts: { identity: 2, procedural: 4, episodic: 6, reflection: 1 }, confidenceDistribution: { high: 5, medium: 4, low: 4 }, proposalStats: { pending: 0, approved: 0, rejected: 0 } },
  { agentId: "scout", memoryCounts: { identity: 2, procedural: 12, episodic: 18, reflection: 6 }, confidenceDistribution: { high: 18, medium: 10, low: 10 }, proposalStats: { pending: 0, approved: 1, rejected: 1 } },
  { agentId: "auditor", memoryCounts: { identity: 2, procedural: 20, episodic: 30, reflection: 8 }, confidenceDistribution: { high: 25, medium: 18, low: 17 }, proposalStats: { pending: 0, approved: 5, rejected: 2 } },
];
