import React, { useEffect, useState } from "react";
import styles from "./ApprovalCenter.module.css";
import { LoadingState, ErrorDisplay, EmptyState } from "../ds/index.js";

interface Approval {
  request_id: string;
  kind: string;
  run_id: string;
  status: string;
  prompt: string;
  created_at: string;
}

interface ApprovalCenterProps {
  apiBase: string;
  token: string;
}

export function ApprovalCenter({ apiBase, token }: ApprovalCenterProps) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/approvals`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        const items = Array.isArray(data) ? data : (data.approvals ?? []);
        setApprovals(items);
        setLoading(false);
      })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Failed to load approvals"); setLoading(false); });
  }, [apiBase]);

  if (loading) return <LoadingState message="Loading approvals..." />;
  if (error) return <ErrorDisplay message={`Error: ${error}`} />;

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Approvals</h2>

      <h3 className={`${styles.sectionHeading} ${styles.sectionPending}`}>Pending ({pending.length})</h3>
      {pending.length === 0 ? (
        <EmptyState message="No pending approvals" />
      ) : (
        pending.map((a) => (
          <div key={a.request_id} className={`${styles.approvalCard} ${styles.approvalCardPending}`}>
            <div className={styles.approvalTitle}>{a.request_id}</div>
            <div className={styles.approvalMeta}>
              {a.kind} &middot; {a.prompt?.slice(0, 100)}
            </div>
            <div className={styles.approvalTimestamp}>{a.created_at}</div>
          </div>
        ))
      )}

      {resolved.length > 0 && (
        <>
          <h3 className={`${styles.sectionHeading} ${styles.sectionResolved}`}>Resolved ({resolved.length})</h3>
          {resolved.map((a) => (
            <div key={a.request_id} className={`${styles.approvalCard} ${styles.approvalCardResolved}`}>
              <div className={styles.resolvedText}>
                {a.request_id} &middot; {a.status} &middot; {a.kind}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
