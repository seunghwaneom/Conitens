import React from "react";
import { AgentFleetOverview } from "../components/AgentFleetOverview.js";
import { AgentProfilePanel } from "../components/AgentProfilePanel.js";
import { AgentRelationshipGraph } from "../components/AgentRelationshipGraph.js";
import { ProposalQueuePanel } from "../components/ProposalQueuePanel.js";
import { demoFleet, type AgentProfile } from "../agent-fleet-model.js";
import { demoEvolution, demoLearningMetrics, demoProposals } from "../evolution-model.js";
import type { LoadState } from "../hooks/use-operator-screen-data.js";

interface AgentsScreenProps {
  agentView: "fleet" | "graph";
  setAgentView: React.Dispatch<React.SetStateAction<"fleet" | "graph">>;
  handleAgentTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  isDemo: boolean;
  agentsState: LoadState;
  agentsError: string | null;
  agentProfiles: AgentProfile[];
  orderedAgentProfiles: AgentProfile[];
  selectedAgentId: string | null;
  setSelectedAgentId: React.Dispatch<React.SetStateAction<string | null>>;
  activeAgent: AgentProfile | null;
  openSpatialRoom: (roomId: string) => void;
}

export function AgentsScreen({
  agentView,
  setAgentView,
  handleAgentTabKeyDown,
  isDemo,
  agentsState,
  agentsError,
  agentProfiles,
  orderedAgentProfiles,
  selectedAgentId,
  setSelectedAgentId,
  activeAgent,
  openSpatialRoom,
}: AgentsScreenProps) {
  return (
    <main className="forward-main">
      <div className="forward-tab-bar" role="tablist" aria-label="Agent view">
        <button
          className={`forward-tab${agentView === "fleet" ? " active" : ""}`}
          type="button"
          role="tab"
          id="agent-tab-fleet"
          aria-selected={agentView === "fleet"}
          aria-controls="agent-panel-fleet"
          tabIndex={agentView === "fleet" ? 0 : -1}
          onClick={() => setAgentView("fleet")}
          onKeyDown={handleAgentTabKeyDown}
        >
          Fleet
        </button>
        <button
          className={`forward-tab${agentView === "graph" ? " active" : ""}`}
          type="button"
          role="tab"
          id="agent-tab-graph"
          aria-selected={agentView === "graph"}
          aria-controls="agent-panel-graph"
          tabIndex={agentView === "graph" ? 0 : -1}
          onClick={() => setAgentView("graph")}
          onKeyDown={handleAgentTabKeyDown}
          disabled={!isDemo}
        >
          Relationships
        </button>
      </div>
      {!isDemo && agentsState === "loading" ? <p className="forward-empty">Loading agent roster...</p> : null}
      {!isDemo && agentsState === "error" ? <p className="forward-error">{agentsError}</p> : null}
      {!isDemo && agentsState === "ready" && agentProfiles.length === 0 ? (
        <div className="forward-placeholder">
          <h3>No operator agents projected</h3>
          <p>No agent identifiers have been derived from the current forward state yet.</p>
        </div>
      ) : null}
      {(isDemo || (agentsState === "ready" && agentProfiles.length > 0)) && (agentView === "fleet" || !isDemo) ? (
        <div className="agent-fleet-layout" role="tabpanel" id="agent-panel-fleet" aria-labelledby="agent-tab-fleet">
          <AgentFleetOverview agents={orderedAgentProfiles} selectedAgentId={selectedAgentId} onSelectAgent={setSelectedAgentId} />
          <AgentProfilePanel
            agent={activeAgent}
            evolution={isDemo ? demoEvolution.filter(e => e.agentId === selectedAgentId) : []}
            metrics={isDemo ? (demoLearningMetrics.find(m => m.agentId === selectedAgentId) ?? null) : null}
            onOpenRoom={openSpatialRoom}
          />
        </div>
      ) : null}
      {isDemo && agentView === "graph" ? (
        <div role="tabpanel" id="agent-panel-graph" aria-labelledby="agent-tab-graph">
          <AgentRelationshipGraph agents={demoFleet} />
        </div>
      ) : null}
      {isDemo ? (
        <ProposalQueuePanel proposals={demoProposals} agents={demoFleet} />
      ) : agentsState === "ready" && agentProfiles.length > 0 ? (
        <div className="forward-placeholder">
          <h3>Live relationship graph and proposal queue are still deferred</h3>
          <p>The roster is now live. Graph and proposal/evolution projections will follow in a later slice.</p>
        </div>
      ) : null}
    </main>
  );
}
