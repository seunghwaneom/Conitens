import React, { useEffect, useState } from "react";
import styles from "./ApprovalCenter.module.css";
import { LoadingState, ErrorDisplay, EmptyState } from "../ds/index.js";
import { createForwardAuthHeaders } from "../forward-bridge.js";
import { pickText, localizeStatus } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

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
  const locale = useUiStore((state) => state.locale);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/approvals`, { headers: createForwardAuthHeaders(token) })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        const items = Array.isArray(data) ? data : (data.approvals ?? []);
        setApprovals(items);
        setLoading(false);
      })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : pickText(locale, { ko: "승인을 불러오지 못했습니다", en: "Failed to load approvals" })); setLoading(false); });
  }, [apiBase, token]);

  if (loading) return <LoadingState message={pickText(locale, { ko: "승인 로딩 중…", en: "Loading approvals…" })} />;
  if (error) return <ErrorDisplay message={`Error: ${error}`} />;

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");

  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>{pickText(locale, { ko: "승인", en: "Approvals" })}</h2>

      <h3 className={`${styles.sectionHeading} ${styles.sectionPending}`}>{pickText(locale, { ko: `대기 중 (${pending.length})`, en: `Pending (${pending.length})` })}</h3>
      {pending.length === 0 ? (
        <EmptyState message={pickText(locale, { ko: "대기 중인 승인이 없습니다", en: "No pending approvals" })} />
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
          <h3 className={`${styles.sectionHeading} ${styles.sectionResolved}`}>{pickText(locale, { ko: `처리됨 (${resolved.length})`, en: `Resolved (${resolved.length})` })}</h3>
          {resolved.map((a) => (
            <div key={a.request_id} className={`${styles.approvalCard} ${styles.approvalCardResolved}`}>
              <div className={styles.resolvedText}>
                {a.request_id} &middot; {localizeStatus(locale, a.status)} &middot; {a.kind}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
