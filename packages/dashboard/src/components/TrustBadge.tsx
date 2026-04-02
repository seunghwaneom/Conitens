import React from "react";

interface TrustBadgeProps {
  mode: "live" | "stale" | "simulated";
  lastEventTs?: string;
}

function formatMinutesAgo(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  return `${diffMin}m ago`;
}

export function TrustBadge({ mode, lastEventTs }: TrustBadgeProps) {
  if (mode === "live") {
    return <span className="trust-badge trust-badge--live">LIVE</span>;
  }
  if (mode === "stale") {
    const ago = lastEventTs ? ` (${formatMinutesAgo(lastEventTs)})` : "";
    return <span className="trust-badge trust-badge--stale">{`STALE${ago}`}</span>;
  }
  return <span className="trust-badge trust-badge--simulated">SIMULATED</span>;
}
