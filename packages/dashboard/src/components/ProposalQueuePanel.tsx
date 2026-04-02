import React, { useState } from "react";
import type { ImprovementProposal } from "../evolution-model.js";
import type { AgentProfile } from "../agent-fleet-model.js";

interface ProposalQueuePanelProps {
  proposals: ImprovementProposal[];
  agents: AgentProfile[];
}

export function ProposalQueuePanel({ proposals, agents }: ProposalQueuePanelProps) {
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected" | undefined>>({});

  const pendingCount = proposals.filter(p => {
    const s = decisions[p.id] ?? p.status;
    return s === "pending";
  }).length;

  function agentName(agentId: string): string {
    return agents.find(a => a.id === agentId)?.name ?? agentId;
  }

  function approve(id: string): void {
    setDecisions(prev => ({ ...prev, [id]: "approved" }));
  }

  function reject(id: string): void {
    setDecisions(prev => ({ ...prev, [id]: "rejected" }));
  }

  return (
    <div className="proposal-queue">
      <div className="proposal-queue-header">
        <div className="proposal-queue-title">
          <p className="forward-panel-label">Evolution</p>
          <h3>Proposal Queue</h3>
        </div>
        {pendingCount > 0 && (
          <span className="proposal-pending-badge">{pendingCount} pending</span>
        )}
      </div>

      <div className="proposal-queue-list">
        {proposals.map(proposal => {
          const status = decisions[proposal.id] ?? proposal.status;
          const isPending = status === "pending";
          const confidencePct = Math.round(proposal.confidence * 100);

          return (
            <div
              key={proposal.id}
              className={`proposal-card proposal-card-${status}`}
            >
              <div className="proposal-card-header">
                <strong className="proposal-card-title">{proposal.title}</strong>
                <div className="proposal-card-meta">
                  <span className={`badge proposal-kind-badge proposal-kind-${proposal.kind}`}>
                    {proposal.kind}
                  </span>
                  <span className="proposal-agent-name">{agentName(proposal.agentId)}</span>
                </div>
              </div>

              <div className="proposal-confidence-wrap">
                <div className="proposal-confidence-label">
                  <span>Confidence</span>
                  <span>{confidencePct}%</span>
                </div>
                <div className="proposal-confidence-track">
                  <div
                    className="proposal-confidence-bar"
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
              </div>

              <p className="proposal-rationale">
                {proposal.rationale.length > 120
                  ? proposal.rationale.slice(0, 120) + "…"
                  : proposal.rationale}
              </p>

              <div className="proposal-card-footer">
                <span className="proposal-evidence-count">
                  {proposal.evidenceRefs.length} evidence ref{proposal.evidenceRefs.length !== 1 ? "s" : ""}
                </span>
                {isPending && (
                  <div className="proposal-action-bar">
                    <button
                      className="forward-chip proposal-btn proposal-btn-approve"
                      onClick={() => approve(proposal.id)}
                    >
                      Approve
                    </button>
                    <button
                      className="forward-chip proposal-btn proposal-btn-reject"
                      onClick={() => reject(proposal.id)}
                    >
                      Reject
                    </button>
                  </div>
                )}
                {!isPending && (
                  <span className={`badge badge-${status === "approved" ? "success" : status === "rejected" ? "danger" : "neutral"}`}>
                    {status}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
