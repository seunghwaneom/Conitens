import React from "react";

interface DeferredRouteScreenProps {
  screen: "threads" | "thread-detail" | "agent-detail";
}

export function DeferredRouteScreen({ screen }: DeferredRouteScreenProps) {
  return (
    <main className="forward-main">
      <div className="forward-placeholder">
        <h3>{screen === "agent-detail" ? "Agent detail route is deferred" : "Thread route is deferred"}</h3>
        <p>
          {screen === "agent-detail"
            ? "Use the live Agents route for the current roster. Dedicated agent detail records will be wired in a later projection slice."
            : "Thread browser and thread detail routes are reserved for a later replay conversation surface."}
        </p>
        <div className="forward-approval-actions">
          <a className="forward-chip-button active" href={screen === "agent-detail" ? "#/agents" : "#/runs"}>
            {screen === "agent-detail" ? "Back to agents" : "Back to runs"}
          </a>
        </div>
      </div>
    </main>
  );
}
