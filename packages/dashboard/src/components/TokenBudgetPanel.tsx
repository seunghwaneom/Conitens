import { useState, useEffect } from "react";
import { Button, EmptyState, LoadingState, ErrorDisplay } from "../ds/index.js";
import styles from "./TokenBudgetPanel.module.css";

interface CompressionTier {
  tier: "L0" | "L1" | "L2";
  label: string;
  inputTokens: number;
  outputTokens: number;
  ratio: number;
}

interface AgentTokenRow {
  agentId: string;
  tokensUsed: number;
  compressionTier: "L0" | "L1" | "L2";
  lastRefresh: string;
}

interface TokenBudgetData {
  totalBudget: number;
  usedTokens: number;
  remainingTokens: number;
  utilizationPct: number;
  compressionTiers: CompressionTier[];
  agents: AgentTokenRow[];
}

export interface TokenBudgetPanelProps {
  apiBase: string;
  token: string;
}

function utilizationLevel(pct: number): "low" | "mid" | "high" {
  if (pct < 50) return "low";
  if (pct <= 80) return "mid";
  return "high";
}

function utilizationValueClass(pct: number): string {
  if (pct < 50) return styles.cardValueSuccess;
  if (pct <= 80) return styles.cardValueWarning;
  return styles.cardValueDanger;
}

function utilizationPctClass(pct: number): string {
  if (pct < 50) return styles.utilPctLow;
  if (pct <= 80) return styles.utilPctMid;
  return styles.utilPctHigh;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

const tierDesc: Record<"L0" | "L1" | "L2", string> = {
  L0: "Raw — no compression",
  L1: "Structural — outline only",
  L2: "Semantic — distilled summary",
};

export function TokenBudgetPanel({ apiBase, token }: TokenBudgetPanelProps) {
  const [data, setData] = useState<TokenBudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/tokens/budget`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<TokenBudgetData>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, token]);

  function handleRefresh() {
    setRefreshing(true);
    fetch(`${apiBase}/tokens/refresh`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return fetch(`${apiBase}/tokens/budget`, { headers: { Authorization: `Bearer ${token}` } });
      })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<TokenBudgetData>;
      })
      .then((json) => {
        setData(json);
        setRefreshing(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Refresh failed");
        setRefreshing(false);
      });
  }

  if (loading) {
    return (
      <div className={styles.panel}>
        <LoadingState message="Loading token budget..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.panel}>
        <ErrorDisplay message={`Error: ${error}`} />
      </div>
    );
  }

  if (!data) return <EmptyState message="No budget data available." />;

  const level = utilizationLevel(data.utilizationPct);
  const utilValClass = utilizationValueClass(data.utilizationPct);

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <p className={styles.sectionLabel}>
            Batch 4 — Token Optimization
          </p>
          <h3 className={styles.sectionTitle}>Token Budget</h3>
        </div>
        <Button
          variant="secondary"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh Summary"}
        </Button>
      </div>

      {/* Budget summary cards */}
      <div className={styles.summaryGrid}>
        {[
          { label: "Total Budget", value: fmt(data.totalBudget), valueClass: styles.cardValue },
          { label: "Used", value: fmt(data.usedTokens), valueClass: `${styles.cardValue} ${utilValClass}` },
          { label: "Remaining", value: fmt(data.remainingTokens), valueClass: styles.cardValue },
          { label: "Utilization", value: `${data.utilizationPct.toFixed(1)}%`, valueClass: `${styles.cardValue} ${utilValClass}` },
        ].map(({ label, value, valueClass }) => (
          <div key={label} className={styles.card}>
            <p className={styles.cardLabel}>{label}</p>
            <strong className={valueClass}>{value}</strong>
          </div>
        ))}
      </div>

      {/* Utilization bar */}
      <div className={styles.card}>
        <p className={styles.utilLabel}>Budget utilization</p>
        <div className={styles.utilBar}>
          <div
            className={styles.utilFill}
            data-level={level}
            ref={(el) => { if (el) el.style.setProperty('--util-pct', `${Math.min(data.utilizationPct, 100)}%`); }}
          />
        </div>
        <p className={`${styles.utilPct} ${utilizationPctClass(data.utilizationPct)}`}>
          {data.utilizationPct.toFixed(1)}% used
        </p>
      </div>

      {/* Compression tiers */}
      <div className={styles.card}>
        <p className={styles.tierSectionLabel}>
          Compression Tiers
        </p>
        <div className={styles.tierList}>
          {data.compressionTiers.map((tier) => (
            <div key={tier.tier} className={styles.tierGrid}>
              <span
                className={`${styles.tierBadge} ${tier.tier === "L2" ? styles.tierBadgeSuccess : styles.tierBadgeDefault}`}
              >
                {tier.tier}
              </span>
              <span className={styles.tierDesc}>{tierDesc[tier.tier]}</span>
              <span className={styles.tierValue}>in: {fmt(tier.inputTokens)}</span>
              <span className={styles.tierValue}>out: {fmt(tier.outputTokens)}</span>
              <span className={`${styles.tierRatio} ${tier.ratio >= 2 ? styles.tierRatioHigh : styles.tierRatioLow}`}>
                {tier.ratio.toFixed(1)}x
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-agent breakdown */}
      <div className={styles.card}>
        <p className={styles.tierSectionLabel}>
          Per-Agent Breakdown
        </p>
        <table className={styles.agentTable}>
          <thead>
            <tr>
              {["Agent", "Tokens Used", "Tier", "Last Refresh"].map((h) => (
                <th
                  key={h}
                  className={`${styles.th} ${h === "Agent" ? styles.thLeft : styles.thRight}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.agents.map((row) => (
              <tr key={row.agentId} className={styles.tr}>
                <td className={`${styles.td} ${styles.agentId}`}>{row.agentId}</td>
                <td className={`${styles.td} ${styles.tdRight}`}>{fmt(row.tokensUsed)}</td>
                <td className={`${styles.td} ${styles.tdRight}`}>
                  <span
                    className={`${styles.inlineBadge} ${row.compressionTier === "L2" ? styles.inlineBadgeSuccess : styles.inlineBadgeDefault}`}
                  >
                    {row.compressionTier}
                  </span>
                </td>
                <td className={`${styles.td} ${styles.tdRight} ${styles.tdMuted}`}>{timeAgo(row.lastRefresh)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
