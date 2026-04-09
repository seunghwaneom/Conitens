import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, ErrorDisplay, LoadingState } from "../ds/index";
import styles from "./WeeklyReportPanel.module.css";

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
  token: string;
}

const SEVERITY_VARIANT: Record<string, "danger" | "warning" | "info"> = {
  critical: "danger",
  warning: "warning",
  info: "info",
};

export function WeeklyReportPanel({ apiBase, token }: WeeklyReportPanelProps) {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = weekOffset === 0
      ? `${apiBase}/reports/weekly`
      : `${apiBase}/reports/weekly?offset=${weekOffset}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setReport(data.report ?? data ?? null); setLoading(false); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Failed to load report"); setLoading(false); });
  }, [apiBase, token, weekOffset]);

  if (loading) return <LoadingState message="Loading weekly report..." />;
  if (error) return <ErrorDisplay message={`Error: ${error}`} />;
  if (!report) return <EmptyState message="No report available." />;

  const successPct = typeof report.success_rate === "number"
    ? (report.success_rate * 100).toFixed(1)
    : "—";
  const avgDurSec = typeof report.avg_duration_ms === "number"
    ? (report.avg_duration_ms / 1000).toFixed(2)
    : "—";

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <div className={styles.headerLabel}>Weekly Report</div>
          <h2 className={styles.headerTitle}>
            {report.week_start} ~ {report.week_end}
          </h2>
          <div className={styles.headerDate}>
            Generated: {report.generated_at}
          </div>
        </div>
        <div className={styles.navGroup}>
          <Button variant="secondary" onClick={() => setWeekOffset((o) => o + 1)}>
            &larr; Prev
          </Button>
          <Button
            variant="secondary"
            onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
            disabled={weekOffset === 0}
          >
            Next &rarr;
          </Button>
        </div>
      </div>

      {/* Key metrics */}
      <div className={styles.metricsGrid}>
        <StatCard label="Total Runs" value={String(report.total_runs)} />
        <StatCard label="Success Rate" value={`${successPct}%`} />
        <StatCard label="Failures" value={String(report.failure_count)} danger />
        <StatCard label="Avg Duration" value={`${avgDurSec}s`} />
      </div>

      {/* Failure patterns */}
      <Section title="Top Failure Patterns">
        {report.failure_patterns.length === 0 ? (
          <div className={styles.emptyText}>No failure patterns recorded.</div>
        ) : (
          report.failure_patterns.map((p) => (
            <div key={p.category} className={styles.patternCard}>
              <div className={styles.patternRow}>
                <span className={styles.patternName}>{p.category}</span>
                <Badge variant={SEVERITY_VARIANT[p.severity] ?? "neutral"}>
                  {p.severity}
                </Badge>
                <span className={styles.patternCount}>{p.count}x</span>
              </div>
              <div className={styles.patternExample}>
                {p.example}
              </div>
            </div>
          ))
        )}
      </Section>

      {/* Applied proposals */}
      <Section title="Improvement Proposals Applied">
        {report.applied_proposals.length === 0 ? (
          <div className={styles.emptyText}>No proposals applied this week.</div>
        ) : (
          report.applied_proposals.map((p) => (
            <div key={p.id} className={styles.proposalCard}>
              <div className={styles.proposalHeader}>
                <div className={styles.proposalBody}>
                  <span className={styles.proposalId}>{p.id}</span>
                  <div className={styles.proposalDesc}>{p.description}</div>
                </div>
                <div className={styles.proposalDate}>{p.applied_date}</div>
              </div>
              <div className={styles.proposalImpact}>Impact: {p.impact}</div>
            </div>
          ))
        )}
      </Section>

      {/* Agent performance ranking */}
      <Section title="Agent Performance Ranking">
        {report.agent_rankings.length === 0 ? (
          <div className={styles.emptyText}>No agent data available.</div>
        ) : (
          <table className={styles.rankTable}>
            <thead>
              <tr>
                {["#", "Agent", "Runs", "Success %", "Avg Tokens"].map((h) => (
                  <th key={h} className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.agent_rankings.map((a, i) => (
                <tr key={a.agent_id}>
                  <td className={styles.td}>{i + 1}</td>
                  <td className={`${styles.td} ${styles.agentId}`}>{a.agent_id}</td>
                  <td className={styles.td}>{a.runs_completed}</td>
                  <td className={`${styles.td} ${rateClass(a.success_rate)}`}>
                    {(a.success_rate * 100).toFixed(1)}%
                  </td>
                  <td className={styles.td}>{a.avg_tokens_per_run.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function rateClass(rate: number): string {
  if (rate >= 0.9) return styles.rateHigh;
  if (rate >= 0.7) return styles.rateMid;
  return styles.rateLow;
}

function StatCard({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={styles.statCard}>
      <div className={danger ? `${styles.statValue} ${styles.statValueDanger}` : styles.statValue}>
        {value}
      </div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </div>
  );
}
