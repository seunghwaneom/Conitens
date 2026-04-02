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

type LoadState = "idle" | "loading" | "ready" | "error";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ForwardApprovalCenterPanel({
  config,
  runId,
}: {
  config: ForwardBridgeConfig;
  runId: string;
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
  }, [runId]);

  useEffect(() => {
    if (!config.token.trim() || !runId) {
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
    forwardListApprovals(config, { runId })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setApprovals(payload.approvals);
        setSelectedApprovalId((current) => pickNextApprovalId(current, payload.approvals));
        setListState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setApprovals([]);
        setSelectedApprovalId(null);
        setListState("error");
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, runId]);

  useEffect(() => {
    if (!config.token.trim() || !runId) {
      return;
    }
    let cancelled = false;
    const intervalId = setInterval(() => {
      forwardListApprovals(config, { runId })
        .then((payload) => {
          if (cancelled) return;
          setApprovals(payload.approvals);
          setSelectedApprovalId((current) => pickNextApprovalId(current, payload.approvals));
          setListState("ready");
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setListState("error");
        });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [config, runId]);

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
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setSelectedApproval(null);
        setDetailState("error");
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, selectedApprovalId]);

  async function refreshAfterAction(targetId: string | null, nextDetail: ForwardApprovalDetailResponse | null = null) {
    const payload = await forwardListApprovals(config, { runId });
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
    <section className="forward-section">
      <div className="forward-section-header">
        <div>
          <p className="forward-panel-label">Approvals</p>
          <h3>
            Approval center
            {pendingCount > 0 ? <span className="badge danger">{pendingCount}</span> : null}
          </h3>
        </div>
        <span className={`forward-state state-${listState}`}>{listState}</span>
      </div>
      {listState === "loading" ? <p className="forward-empty">Loading approvals...</p> : null}
      {listState === "error" ? <p className="forward-error">{error}</p> : null}
      {listState === "ready" && approvals.length === 0 ? (
        <p className="forward-empty">No approval records for this run.</p>
      ) : null}
      {approvals.length > 0 ? (
        <div className="forward-approval-layout">
          <div className="forward-approval-list">
            {approvals.map((approval) => (
              <button
                key={approval.request_id}
                className={`forward-approval-item${selectedApprovalId === approval.request_id ? " active" : ""}`}
                onClick={() => setSelectedApprovalId(approval.request_id)}
                type="button"
              >
                <div className="forward-run-topline">
                  <strong>{approval.action_type}</strong>
                  <span>{approval.status}</span>
                </div>
                <p>{approval.risk_level} risk | {approval.actor}</p>
              </button>
            ))}
          </div>
          <div className="forward-approval-detail">
            {detailState === "loading" ? <p className="forward-empty">Loading approval detail...</p> : null}
            {detailState === "error" ? <p className="forward-error">{error}</p> : null}
            {selectedApproval ? (
              <>
                <div className="forward-doc-header">
                  <strong>{selectedApproval.approval.action_type}</strong>
                  <span>{selectedApproval.approval.request_id}</span>
                </div>
                <div className="forward-approval-meta">
                  <span>Status: {selectedApproval.approval.status}</span>
                  <span>Reviewer: {selectedApproval.approval.reviewer || "n/a"}</span>
                  <span>Updated: {selectedApproval.approval.updated_at}</span>
                </div>
                <pre>{JSON.stringify(selectedApproval.approval.action_payload, null, 2)}</pre>
                <label className="forward-approval-note">
                  <span>Reviewer note</span>
                  <input value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} />
                </label>
                <p className="forward-help">Reviewer identity is stamped by the local forward bridge, not by the browser.</p>
                <div className="forward-approval-actions">
                  <button className="approve-button" type="button" onClick={() => handleDecision("approved")}>
                    Approve
                  </button>
                  <button className="deny-button" type="button" onClick={() => handleDecision("rejected")}>
                    Reject
                  </button>
                  {(selectedApproval.approval.status === "approved" || selectedApproval.approval.status === "edited") ? (
                    <button className="forward-chip-button active" type="button" onClick={handleResume}>
                      Resume
                    </button>
                  ) : null}
                </div>
                {actionState === "loading" ? <p className="forward-empty">Applying approval action...</p> : null}
                {actionState === "error" ? <p className="forward-error">{error}</p> : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
