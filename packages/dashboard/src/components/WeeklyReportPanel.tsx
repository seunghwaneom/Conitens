import React, { useEffect, useState } from "react";

interface FailurePattern {
  category: string;
  count: number;
  severity: "critical" | "warning" | "info";
  example: string;
}

interface AppliedProposal {
  id: string;
  description: string;
  applied_date: string;
  impact: string;
}

interface AgentRank {
  agent_id: string;
  runs_completed: number;
  success_rate: number;
  avg_tokens_per_run: number;
}

interface WeeklyReport {
  week_start: string;
  week_end: string;
  generated_at: string;
  total_runs: number;
  success_rate: number;
  failure_count: number;
  avg_duration_ms: number;
  failure_patterns: FailurePattern[];
  applied_proposals: AppliedProposal[];
  agent_rankings: AgentRank[];
}

interface WeeklyReportPanelProps {
  apiBase: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#f85149",
  warning: "#d29922",
  info: "#58a6ff",
};

export function WeeklyReportPanel({ apiBase }: WeeklyReportPanelProps) {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = weekOffset === 0
      ? `${apiBase}/api/reports/weekly`
      : `${apiBase}/api/reports/weekly?offset=${weekOffset}`;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setReport(data.report ?? data ?? null); setLoading(false); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Failed to load report"); setLoading(false); });
  }, [apiBase, weekOffset]);

  if (loading) return <div style={{ padding: 24, color: "#8b949e" }}>Loading weekly report...</div>;
  if (error) return <div style={{ padding: 24, color: "#f85149" }}>Error: {error}</div>;
  if (!report) return <div style={{ padding: 24, color: "#8b949e" }}>No report available.</div>;

  const successPct = typeof report.success_rate === "number"
    ? (report.success_rate * 100).toFixed(1)
    : "—";
  const avgDurSec = typeof report.avg_duration_ms === "number"
    ? (report.avg_duration_ms / 1000).toFixed(2)
    : "—";

  return (
    <div style={{ padding: 24, color: "#e6edf3" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            Weekly Report
          </div>
          <h2 style={{ margin: 0, fontSize: 20 }}>
            {report.week_start} ~ {report.week_end}
          </h2>
          <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>
            Generated: {report.generated_at}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            style={navBtnStyle}
          >
            ← Prev
          </button>
          <button
            onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
            disabled={weekOffset === 0}
            style={{ ...navBtnStyle, opacity: weekOffset === 0 ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Runs" value={String(report.total_runs)} />
        <StatCard label="Success Rate" value={`${successPct}%`} />
        <StatCard label="Failures" value={String(report.failure_count)} valueColor="#f85149" />
        <StatCard label="Avg Duration" value={`${avgDurSec}s`} />
      </div>

      {/* Failure patterns */}
      <Section title="Top Failure Patterns">
        {report.failure_patterns.length === 0 ? (
          <div style={{ color: "#8b949e", fontSize: 13 }}>No failure patterns recorded.</div>
        ) : (
          report.failure_patterns.map((p) => (
            <div key={p.category} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{p.category}</span>
                <span style={badgeStyle(SEVERITY_COLOR[p.severity] ?? "#8b949e")}>
                  {p.severity}
                </span>
                <span style={{ fontSize: 13, color: "#8b949e" }}>{p.count}x</span>
              </div>
              <div style={{ fontSize: 12, color: "#8b949e", fontFamily: "monospace", wordBreak: "break-all" }}>
                {p.example}
              </div>
            </div>
          ))
        )}
      </Section>

      {/* Applied proposals */}
      <Section title="Improvement Proposals Applied">
        {report.applied_proposals.length === 0 ? (
          <div style={{ color: "#8b949e", fontSize: 13 }}>No proposals applied this week.</div>
        ) : (
          report.applied_proposals.map((p) => (
            <div key={p.id} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: "#58a6ff", fontFamily: "monospace" }}>{p.id}</span>
                  <div style={{ fontSize: 13, color: "#e6edf3", marginTop: 4 }}>{p.description}</div>
                </div>
                <div style={{ fontSize: 12, color: "#8b949e", whiteSpace: "nowrap" }}>{p.applied_date}</div>
              </div>
              <div style={{ fontSize: 12, color: "#7ee787", marginTop: 6 }}>Impact: {p.impact}</div>
            </div>
          ))
        )}
      </Section>

      {/* Agent performance ranking */}
      <Section title="Agent Performance Ranking">
        {report.agent_rankings.length === 0 ? (
          <div style={{ color: "#8b949e", fontSize: 13 }}>No agent data available.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["#", "Agent", "Runs", "Success %", "Avg Tokens"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.agent_rankings.map((a, i) => (
                <tr key={a.agent_id} style={{ borderBottom: "1px solid #21262d" }}>
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={{ ...tdStyle, color: "#79c0ff", fontFamily: "monospace" }}>{a.agent_id}</td>
                  <td style={tdStyle}>{a.runs_completed}</td>
                  <td style={{ ...tdStyle, color: a.success_rate >= 0.9 ? "#7ee787" : a.success_rate >= 0.7 ? "#d29922" : "#f85149" }}>
                    {(a.success_rate * 100).toFixed(1)}%
                  </td>
                  <td style={tdStyle}>{a.avg_tokens_per_run.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      background: "#161b22", border: "1px solid #30363d", borderRadius: 8,
      padding: "14px 16px", textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor ?? "#e6edf3" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, color: "#e6edf3", margin: "0 0 10px", fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 8,
  padding: "12px 14px",
  marginBottom: 8,
};

const navBtnStyle: React.CSSProperties = {
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#e6edf3",
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
};

function badgeStyle(color: string): React.CSSProperties {
  return {
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    background: `${color}22`,
    color,
    border: `1px solid ${color}44`,
  };
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  color: "#8b949e",
  fontWeight: 500,
  borderBottom: "1px solid #30363d",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  color: "#e6edf3",
};
