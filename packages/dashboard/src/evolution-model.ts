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
