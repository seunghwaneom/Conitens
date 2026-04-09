import { useEffect, useMemo, useState } from "react";
import { useDashboardStore } from "../store/dashboard-store.js";
import { AgentFleetOverview } from "../components/AgentFleetOverview.js";
import { AgentProfilePanel } from "../components/AgentProfilePanel.js";
import { AgentRelationshipGraph } from "../components/AgentRelationshipGraph.js";
import { ProposalQueuePanel } from "../components/ProposalQueuePanel.js";
import {
  forwardGetOperatorAgents,
  type ForwardOperatorAgentsResponse,
} from "../forward-bridge.js";
import { toOperatorAgentProfiles } from "../operator-agents-model.js";
import { demoFleet } from "../agent-fleet-model.js";
import {
  demoProposals,
  demoEvolution,
  demoLearningMetrics,
} from "../evolution-model.js";
import { pickText } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

type LoadState = "idle" | "loading" | "ready" | "error";

export function AgentsScreen() {
  const locale = useUiStore((state) => state.locale);
  const config = useDashboardStore((s) => s.config);
  const liveRevision = useDashboardStore((s) => s.liveRevision);
  const isDemo = !config.token.trim();

  const [operatorAgents, setOperatorAgents] =
    useState<ForwardOperatorAgentsResponse | null>(null);
  const [agentsState, setAgentsState] = useState<LoadState>("idle");
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentView, setAgentView] = useState<"fleet" | "graph">("fleet");

  useEffect(() => {
    if (!config.token.trim()) {
      setOperatorAgents(null);
      setAgentsState("idle");
      setAgentsError(null);
      return;
    }
    let cancelled = false;
    setAgentsState("loading");
    setAgentsError(null);
    forwardGetOperatorAgents(config)
      .then((payload) => {
        if (cancelled) return;
        setOperatorAgents(payload);
        setAgentsState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setOperatorAgents(null);
        setAgentsState("error");
        setAgentsError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, liveRevision]);

  const liveAgentProfiles = useMemo(
    () => (operatorAgents ? toOperatorAgentProfiles(operatorAgents) : []),
    [operatorAgents],
  );
  const agentProfiles = isDemo ? demoFleet : liveAgentProfiles;
  const activeAgent =
    agentProfiles.find((agent) => agent.id === selectedAgentId) ?? null;

  useEffect(() => {
    if (agentProfiles.length === 0) {
      if (selectedAgentId !== null) setSelectedAgentId(null);
      return;
    }
    if (
      !selectedAgentId ||
      !agentProfiles.some((agent) => agent.id === selectedAgentId)
    ) {
      setSelectedAgentId(agentProfiles[0]?.id ?? null);
    }
  }, [agentProfiles, selectedAgentId]);

  return (
    <main className="forward-main">
      <div className="forward-tab-bar">
        <button
          className={`forward-tab${agentView === "fleet" ? " active" : ""}`}
          onClick={() => setAgentView("fleet")}
        >
          {pickText(locale, { ko: "플릿", en: "Fleet" })}
        </button>
        <button
          className={`forward-tab${agentView === "graph" ? " active" : ""}`}
          onClick={() => setAgentView("graph")}
          disabled={!isDemo}
        >
          {pickText(locale, { ko: "관계", en: "Relationships" })}
        </button>
      </div>
      {!isDemo && agentsState === "loading" ? (
        <p className="forward-empty">{pickText(locale, { ko: "에이전트 roster 로딩 중…", en: "Loading agent roster…" })}</p>
      ) : null}
      {!isDemo && agentsState === "error" ? (
        <p className="forward-error">{agentsError}</p>
      ) : null}
      {!isDemo && agentsState === "ready" && agentProfiles.length === 0 ? (
        <div className="forward-placeholder">
          <h3>{pickText(locale, { ko: "프로젝션된 운영자 에이전트가 없습니다", en: "No operator agents projected" })}</h3>
          <p>
            {pickText(locale, {
              ko: "현재 forward state에서 아직 에이전트 식별자가 도출되지 않았습니다.",
              en: "No agent identifiers have been derived from the current forward state yet.",
            })}
          </p>
        </div>
      ) : null}
      {(isDemo || (agentsState === "ready" && agentProfiles.length > 0)) &&
      (agentView === "fleet" || !isDemo) ? (
        <div className="agent-fleet-layout">
          <AgentFleetOverview
            agents={agentProfiles}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
          />
          <AgentProfilePanel
            agent={activeAgent}
            evolution={
              isDemo
                ? demoEvolution.filter((e) => e.agentId === selectedAgentId)
                : []
            }
            metrics={
              isDemo
                ? (demoLearningMetrics.find(
                    (m) => m.agentId === selectedAgentId,
                  ) ?? null)
                : null
            }
          />
        </div>
      ) : null}
      {isDemo && agentView === "graph" ? (
        <AgentRelationshipGraph agents={demoFleet} />
      ) : null}
      {isDemo ? (
        <ProposalQueuePanel proposals={demoProposals} agents={demoFleet} />
      ) : agentsState === "ready" && agentProfiles.length > 0 ? (
        <div className="forward-placeholder">
          <h3>
            {pickText(locale, { ko: "라이브 관계 그래프와 proposal queue는 아직 보류 상태입니다", en: "Live relationship graph and proposal queue are still deferred" })}
          </h3>
          <p>
            {pickText(locale, {
              ko: "현재 roster는 live 상태입니다. 그래프와 proposal/evolution projection은 후속 slice에서 추가됩니다.",
              en: "The roster is now live. Graph and proposal/evolution projections will follow in a later slice.",
            })}
          </p>
        </div>
      ) : null}
    </main>
  );
}
