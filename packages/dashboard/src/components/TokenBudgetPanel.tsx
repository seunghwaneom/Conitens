import { useState, useEffect } from "react";

const C = {
  bg: "#0d1117",
  card: "#161b22",
  border: "#30363d",
  text: "#e6edf3",
  muted: "#8b949e",
  green: "#3fb950",
  yellow: "#d29922",
  red: "#f85149",
  accent: "#58a6ff",
} as const;

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

function utilizationColor(pct: number): string {
  if (pct < 50) return C.green;
  if (pct <= 80) return C.yellow;
  return C.red;
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

  const panelStyle: React.CSSProperties = {
    background: C.bg,
    color: C.text,
    fontFamily: "inherit",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  };

  const cardStyle: React.CSSProperties = {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: "8px",
    padding: "16px",
  };

  if (loading) {
    return (
      <div style={panelStyle}>
        <p style={{ color: C.muted }}>Loading token budget...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={panelStyle}>
        <p style={{ color: C.red }}>Error: {error}</p>
      </div>
    );
  }

  if (!data) return null;

  const utilColor = utilizationColor(data.utilizationPct);

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ color: C.muted, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
            Batch 4 — Token Optimization
          </p>
          <h3 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: 600 }}>Token Budget</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            background: refreshing ? C.border : C.card,
            border: `1px solid ${C.border}`,
            borderRadius: "6px",
            color: refreshing ? C.muted : C.accent,
            cursor: refreshing ? "not-allowed" : "pointer",
            fontSize: "12px",
            padding: "6px 12px",
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh Summary"}
        </button>
      </div>

      {/* Budget summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        {[
          { label: "Total Budget", value: fmt(data.totalBudget) },
          { label: "Used", value: fmt(data.usedTokens), color: utilColor },
          { label: "Remaining", value: fmt(data.remainingTokens) },
          { label: "Utilization", value: `${data.utilizationPct.toFixed(1)}%`, color: utilColor },
        ].map(({ label, value, color }) => (
          <div key={label} style={cardStyle}>
            <p style={{ color: C.muted, fontSize: "11px", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {label}
            </p>
            <strong style={{ fontSize: "20px", color: color ?? C.text }}>{value}</strong>
          </div>
        ))}
      </div>

      {/* Utilization bar */}
      <div style={cardStyle}>
        <p style={{ color: C.muted, fontSize: "12px", margin: "0 0 8px" }}>Budget utilization</p>
        <div style={{ background: C.border, borderRadius: "4px", height: "8px", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.min(data.utilizationPct, 100)}%`,
              height: "100%",
              background: utilColor,
              borderRadius: "4px",
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <p style={{ color: utilColor, fontSize: "11px", margin: "6px 0 0", textAlign: "right" }}>
          {data.utilizationPct.toFixed(1)}% used
        </p>
      </div>

      {/* Compression tiers */}
      <div style={cardStyle}>
        <p style={{ color: C.muted, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>
          Compression Tiers
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {data.compressionTiers.map((tier) => (
            <div key={tier.tier} style={{ display: "grid", gridTemplateColumns: "60px 1fr 80px 80px 60px", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  background: tier.tier === "L0" ? "#2d333b" : tier.tier === "L1" ? "#1f2d3d" : "#1a2d1a",
                  border: `1px solid ${C.border}`,
                  borderRadius: "4px",
                  color: tier.tier === "L2" ? C.green : C.accent,
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "2px 6px",
                  textAlign: "center",
                }}
              >
                {tier.tier}
              </span>
              <span style={{ color: C.muted, fontSize: "12px" }}>{tierDesc[tier.tier]}</span>
              <span style={{ color: C.text, fontSize: "12px", textAlign: "right" }}>in: {fmt(tier.inputTokens)}</span>
              <span style={{ color: C.text, fontSize: "12px", textAlign: "right" }}>out: {fmt(tier.outputTokens)}</span>
              <span style={{ color: tier.ratio >= 2 ? C.green : C.muted, fontSize: "12px", textAlign: "right", fontWeight: 600 }}>
                {tier.ratio.toFixed(1)}x
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-agent breakdown */}
      <div style={cardStyle}>
        <p style={{ color: C.muted, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>
          Per-Agent Breakdown
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Agent", "Tokens Used", "Tier", "Last Refresh"].map((h) => (
                <th
                  key={h}
                  style={{ color: C.muted, fontWeight: 500, padding: "4px 8px", textAlign: h === "Agent" ? "left" : "right" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.agents.map((row) => (
              <tr key={row.agentId} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ color: C.text, padding: "8px 8px", fontFamily: "monospace" }}>{row.agentId}</td>
                <td style={{ color: C.text, padding: "8px 8px", textAlign: "right" }}>{fmt(row.tokensUsed)}</td>
                <td style={{ padding: "8px 8px", textAlign: "right" }}>
                  <span
                    style={{
                      background: row.compressionTier === "L2" ? "#1a2d1a" : "#1f2d3d",
                      border: `1px solid ${C.border}`,
                      borderRadius: "4px",
                      color: row.compressionTier === "L2" ? C.green : C.accent,
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "1px 5px",
                    }}
                  >
                    {row.compressionTier}
                  </span>
                </td>
                <td style={{ color: C.muted, padding: "8px 8px", textAlign: "right" }}>{timeAgo(row.lastRefresh)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
