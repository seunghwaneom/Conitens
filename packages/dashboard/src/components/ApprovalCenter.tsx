import React, { useEffect, useState } from "react";

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

  if (loading) return <div style={{ padding: 24, color: "#8b949e" }}>Loading approvals...</div>;
  if (error) return <div style={{ padding: 24, color: "#f85149" }}>Error: {error}</div>;

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status !== "pending");

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 20, color: "#e6edf3" }}>Approvals</h2>

      <h3 style={{ fontSize: 15, color: "#f0883e", margin: "0 0 8px" }}>Pending ({pending.length})</h3>
      {pending.length === 0 ? (
        <div style={{ color: "#8b949e", padding: 8, fontSize: 13 }}>No pending approvals</div>
      ) : (
        pending.map((a) => (
          <div key={a.request_id} style={{
            padding: "12px 16px", background: "#161b22", border: "1px solid #d29922",
            borderRadius: 8, marginBottom: 8,
          }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#e6edf3" }}>{a.request_id}</div>
            <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>
              {a.kind} &middot; {a.prompt?.slice(0, 100)}
            </div>
            <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>{a.created_at}</div>
          </div>
        ))
      )}

      {resolved.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, color: "#8b949e", margin: "16px 0 8px" }}>Resolved ({resolved.length})</h3>
          {resolved.map((a) => (
            <div key={a.request_id} style={{
              padding: "12px 16px", background: "#161b22", border: "1px solid #30363d",
              borderRadius: 8, marginBottom: 6,
            }}>
              <div style={{ fontSize: 13, color: "#8b949e" }}>
                {a.request_id} &middot; {a.status} &middot; {a.kind}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
