import React, { useState } from "react";
import type { ImprovementProposal } from "../evolution-model.js";
import type { AgentProfile } from "../agent-fleet-model.js";
import styles from "./ProposalQueuePanel.module.css";
import { pickText, localizeStatus } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

interface ProposalQueuePanelProps {
  proposals: ImprovementProposal[];
  agents: AgentProfile[];
}

export function ProposalQueuePanel({ proposals, agents }: ProposalQueuePanelProps) {
  const locale = useUiStore((state) => state.locale);
  const [localProposals, setLocalProposals] = useState<ImprovementProposal[]>(proposals);

  const pendingCount = localProposals.filter(p => p.status === "pending").length;

  function agentName(agentId: string): string {
    return agents.find(a => a.id === agentId)?.name ?? agentId;
  }

  function approve(id: string): void {
    setLocalProposals(prev => prev.map(p => p.id === id ? { ...p, status: "approved" } : p));
  }

  function reject(id: string): void {
    setLocalProposals(prev => prev.map(p => p.id === id ? { ...p, status: "rejected" } : p));
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <p className={styles.panelLabel}>{pickText(locale, { ko: "진화", en: "Evolution" })}</p>
          <h3 className={styles.heading}>{pickText(locale, { ko: "제안 큐", en: "Proposal Queue" })}</h3>
        </div>
        {pendingCount > 0 && (
          <span className={styles.pendingBadge}>{pickText(locale, { ko: `${pendingCount}개 대기`, en: `${pendingCount} pending` })}</span>
        )}
      </div>

      <div className={styles.list}>
        {localProposals.map(proposal => {
          const isPending = proposal.status === "pending";
          const confidencePct = Math.round(proposal.confidence * 100);
          const cardStatusClass = proposal.status === "approved"
            ? styles.cardApproved
            : proposal.status === "rejected"
            ? styles.cardRejected
            : styles.cardPending;

          return (
            <div
              key={proposal.id}
              className={[styles.card, cardStatusClass].join(" ")}
            >
              <div className={styles.cardHeader}>
                <strong className={styles.cardTitle}>{proposal.title}</strong>
                <div className={styles.cardMeta}>
                  <span className={styles.kindBadge}>
                    {proposal.kind}
                  </span>
                  <span className={styles.agentName}>{agentName(proposal.agentId)}</span>
                </div>
              </div>

              <div className={styles.confidenceWrap}>
                <div className={styles.confidenceLabel}>
                  <span>{pickText(locale, { ko: "신뢰도", en: "Confidence" })}</span>
                  <span>{confidencePct}%</span>
                </div>
                <div className={styles.confidenceTrack}>
                  <div
                    className={styles.confidenceBar}
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
              </div>

              <p className={styles.rationale}>
                {proposal.rationale.length > 120
                  ? proposal.rationale.slice(0, 120) + "…"
                  : proposal.rationale}
              </p>

              <div className={styles.cardFooter}>
                <span className={styles.evidenceCount}>
                  {pickText(locale, { ko: `${proposal.evidenceRefs.length}개 evidence ref`, en: `${proposal.evidenceRefs.length} evidence ref${proposal.evidenceRefs.length !== 1 ? "s" : ""}` })}
                </span>
                {isPending && (
                  <div className={styles.actionBar}>
                    <button
                      className={[styles.btn, styles.btnApprove].join(" ")}
                      onClick={() => approve(proposal.id)}
                    >
                      {pickText(locale, { ko: "승인", en: "Approve" })}
                    </button>
                    <button
                      className={[styles.btn, styles.btnReject].join(" ")}
                      onClick={() => reject(proposal.id)}
                    >
                      {pickText(locale, { ko: "거부", en: "Reject" })}
                    </button>
                  </div>
                )}
                {!isPending && (
                  <span className={[
                    styles.statusBadge,
                    proposal.status === "approved" ? styles.statusBadgeSuccess
                      : proposal.status === "rejected" ? styles.statusBadgeDanger
                      : styles.statusBadgeNeutral,
                  ].join(" ")}>
                    {localizeStatus(locale, proposal.status)}
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
