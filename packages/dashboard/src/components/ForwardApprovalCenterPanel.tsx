import React, { useEffect, useState } from "react";
import {
  forwardDecideApproval,
  forwardGetApproval,
  forwardListApprovals,
  forwardResumeApproval,
  type ForwardApprovalDetailResponse,
  type ForwardApprovalRecord,
  type ForwardBridgeConfig,
} from "../forward-bridge.js";
import { pickNextApprovalId } from "../forward-view-model.js";
import { Badge, EmptyState, ErrorDisplay, LoadingState } from "../ds/index.js";
import styles from "./ForwardApprovalCenterPanel.module.css";

type LoadState = "idle" | "loading" | "ready" | "error";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ForwardApprovalCenterPanel({
  config,
  runId,
  taskId,
  heading = "Approval queue",
}: {
  config: ForwardBridgeConfig;
  runId?: string | null;
  taskId?: string | null;
  heading?: string;
}) {
  const [approvals, setApprovals] = useState<ForwardApprovalRecord[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<ForwardApprovalDetailResponse | null>(null);
  const [listState, setListState] = useState<LoadState>("idle");
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [actionState, setActionState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reviewerNote, setReviewerNote] = useState("approved");

  useEffect(() => {
    setSelectedApprovalId(null);
    setSelectedApproval(null);
    setReviewerNote("approved");
    setError(null);
  }, [runId, taskId]);

  useEffect(() => {
    if (!config.token.trim() || (!runId && !taskId)) {
      setApprovals([]);
      setSelectedApprovalId(null);
      setSelectedApproval(null);
      setListState("idle");
      setDetailState("idle");
      return;
    }
    let cancelled = false;
    setListState("loading");
    setError(null);
    forwardListApprovals(config, { runId: runId ?? undefined, taskId: taskId ?? undefined })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setApprovals(payload.approvals);
        setSelectedApprovalId((current) => pickNextApprovalId(current, payload.approvals));
        setListState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setApprovals([]);
        setSelectedApprovalId(null);
        setListState("error");
        setError(toErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [config, runId, taskId]);

  useEffect(() => {
    if (!config.token.trim() || (!runId && !taskId)) {
      return;
    }
    let cancelled = false;
    const intervalId = setInterval(() => {
      forwardListApprovals(config, { runId: runId ?? undefined, taskId: taskId ?? undefined })
        .then((payload) => {
          if (cancelled) return;
          setApprovals(payload.approvals);
          setSelectedApprovalId((current) => pickNextApprovalId(current, payload.approvals));
          setListState("ready");
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setListState("error");
        });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [config, runId, taskId]);

  useEffect(() => {
    if (!selectedApprovalId) {
      setSelectedApproval(null);
      setDetailState("idle");
      return;
    }
    let cancelled = false;
    setDetailState("loading");
    setError(null);
    forwardGetApproval(config, selectedApprovalId)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setSelectedApproval(payload);
        setDetailState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setSelectedApproval(null);
        setDetailState("error");
        setError(toErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [config, selectedApprovalId]);

  async function refreshAfterAction(targetId: string | null, nextDetail: ForwardApprovalDetailResponse | null = null) {
    const payload = await forwardListApprovals(config, { runId: runId ?? undefined, taskId: taskId ?? undefined });
    setApprovals(payload.approvals);
    const nextId = pickNextApprovalId(targetId, payload.approvals);
    setSelectedApprovalId(nextId);
    if (!nextId) {
      setSelectedApproval(null);
      setDetailState("idle");
      return;
    }
    if (nextDetail && nextDetail.approval.request_id === nextId) {
      setSelectedApproval(nextDetail);
      setDetailState("ready");
    }
  }

  async function handleDecision(status: "approved" | "rejected") {
    if (!selectedApprovalId) {
      return;
    }
    try {
      setActionState("loading");
      setError(null);
      const decision = await forwardDecideApproval(config, selectedApprovalId, {
        status,
        reviewer_note: reviewerNote.trim() || status,
      });
      await refreshAfterAction(selectedApprovalId, decision);
      setActionState("ready");
    } catch (err) {
      setActionState("error");
      setError(toErrorMessage(err));
    }
  }

  async function handleResume() {
    if (!selectedApprovalId) {
      return;
    }
    try {
      setActionState("loading");
      setError(null);
      const resumed = await forwardResumeApproval(config, selectedApprovalId);
      await refreshAfterAction(selectedApprovalId, { approval: resumed.approval });
      setActionState("ready");
    } catch (err) {
      setActionState("error");
      setError(toErrorMessage(err));
    }
  }

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <p className={styles.label}>Approvals</p>
          <h3 className={styles.title}>
            {heading}
            {pendingCount > 0 ? <Badge variant="danger">{pendingCount}</Badge> : null}
          </h3>
        </div>
        <span className={styles.stateTag}>{listState}</span>
      </div>
      {listState === "loading" ? <LoadingState message="Loading approvals..." /> : null}
      {listState === "error" && error ? <ErrorDisplay message={error} /> : null}
      {listState === "ready" && approvals.length === 0 ? (
        <EmptyState message="No approval records for this run." />
      ) : null}
      {approvals.length > 0 ? (
        <div className={styles.approvalLayout}>
          <div className={styles.approvalList}>
            {approvals.map((approval) => (
              <button
                key={approval.request_id}
                className={`${styles.approvalItem}${selectedApprovalId === approval.request_id ? ` ${styles.approvalItemActive}` : ""}`}
                onClick={() => setSelectedApprovalId(approval.request_id)}
                type="button"
              >
                <div className={styles.runTopline}>
                  <strong>{approval.action_type}</strong>
                  <span>{approval.status}</span>
                </div>
                <p>{approval.risk_level} risk | {approval.actor}</p>
              </button>
            ))}
          </div>
          <div className={styles.approvalDetail}>
            {detailState === "loading" ? <LoadingState message="Loading approval detail..." /> : null}
            {detailState === "error" && error ? <ErrorDisplay message={error} /> : null}
            {selectedApproval ? (
              <>
                <div className={styles.docHeader}>
                  <strong>{selectedApproval.approval.action_type}</strong>
                  <span>{selectedApproval.approval.request_id}</span>
                </div>
                <div className={styles.approvalMeta}>
                  <span>Status: {selectedApproval.approval.status}</span>
                  <span>Reviewer: {selectedApproval.approval.reviewer || "n/a"}</span>
                  <span>Updated: {selectedApproval.approval.updated_at}</span>
                </div>
                <pre>{JSON.stringify(selectedApproval.approval.action_payload, null, 2)}</pre>
                <label className={styles.approvalNote}>
                  <span>Reviewer note</span>
                  <input value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} />
                </label>
                <p className={styles.helpText}>Reviewer identity is stamped by the local forward bridge, not by the browser.</p>
                <div className={styles.approvalActions}>
                  <button className={styles.approveButton} type="button" onClick={() => handleDecision("approved")}>
                    Approve
                  </button>
                  <button className={styles.denyButton} type="button" onClick={() => handleDecision("rejected")}>
                    Reject
                  </button>
                  {(selectedApproval.approval.status === "approved" || selectedApproval.approval.status === "edited") ? (
                    <button className={`${styles.chipButton} ${styles.chipButtonActive}`} type="button" onClick={handleResume}>
                      Resume
                    </button>
                  ) : null}
                </div>
                {actionState === "loading" ? <LoadingState message="Applying approval action..." /> : null}
                {actionState === "error" && error ? <ErrorDisplay message={error} /> : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
