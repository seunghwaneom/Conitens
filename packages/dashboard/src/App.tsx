import React, { useEffect, useEffectEvent, useMemo, useState } from "react";
import { PixelOffice } from "./components/PixelOffice.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ForwardApprovalCenterPanel } from "./components/ForwardApprovalCenterPanel.js";
import { ForwardContextPanel } from "./components/ForwardContextPanel.js";
import { ForwardGraphPanel } from "./components/ForwardGraphPanel.js";
import { ForwardInsightsPanel } from "./components/ForwardInsightsPanel.js";
import { ForwardReplayPanel } from "./components/ForwardReplayPanel.js";
import { ForwardRoomPanel } from "./components/ForwardRoomPanel.js";
import { ForwardStateDocsPanel } from "./components/ForwardStateDocsPanel.js";
import { useForwardStream } from "./hooks/use-forward-stream.js";
import {
  forwardGet,
  parseContextLatestResponse,
  parseReplayResponse,
  parseRoomTimelineResponse,
  parseRunDetailResponse,
  parseRunsResponse,
  parseStateDocsResponse,
  persistBridgeConfig,
  readInitialBridgeConfig,
  type ForwardBridgeConfig,
  type ForwardContextLatestResponse,
  type ForwardReplayResponse,
  type ForwardRoomTimelineResponse,
  type ForwardRunDetailResponse,
  type ForwardRunSummary,
  type ForwardStateDocsResponse,
} from "./forward-bridge.js";
import { buildForwardRoute, parseForwardRoute } from "./forward-route.js";
import { deriveForwardGraphModel } from "./forward-graph.js";
import {
  extractRoomOptions,
  pickNextRoomId,
  summarizeFindingsDocument,
  summarizeValidatorCorrelations,
  toInsightCardViewModels,
  toRunDetailViewModel,
  toRunListItemViewModel,
} from "./forward-view-model.js";
import { OnboardingOverlay } from "./components/OnboardingOverlay.js";
import { demoAgents, demoEvents, demoTasks } from "./demo-data.js";
import { AgentFleetOverview } from "./components/AgentFleetOverview.js";
import { AgentProfilePanel } from "./components/AgentProfilePanel.js";
import { AgentRelationshipGraph } from "./components/AgentRelationshipGraph.js";
import { ProposalQueuePanel } from "./components/ProposalQueuePanel.js";
import { demoFleet } from "./agent-fleet-model.js";
import { demoProposals, demoEvolution, demoLearningMetrics } from "./evolution-model.js";

type LoadState = "idle" | "loading" | "ready" | "error";
type DetailTab = "operations" | "intelligence" | "data";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const [config, setConfig] = useState<ForwardBridgeConfig>(() => readInitialBridgeConfig());
  const [draftConfig, setDraftConfig] = useState<ForwardBridgeConfig>(() => readInitialBridgeConfig());
  const [runs, setRuns] = useState<ForwardRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<ForwardRunDetailResponse | null>(null);
  const [replay, setReplay] = useState<ForwardReplayResponse | null>(null);
  const [stateDocs, setStateDocs] = useState<ForwardStateDocsResponse | null>(null);
  const [contextLatest, setContextLatest] = useState<ForwardContextLatestResponse | null>(null);
  const [roomTimeline, setRoomTimeline] = useState<ForwardRoomTimelineResponse | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [runsState, setRunsState] = useState<LoadState>("idle");
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [replayState, setReplayState] = useState<LoadState>("idle");
  const [stateDocsState, setStateDocsState] = useState<LoadState>("idle");
  const [contextState, setContextState] = useState<LoadState>("idle");
  const [roomState, setRoomState] = useState<LoadState>("idle");
  const [runsError, setRunsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [stateDocsError, setStateDocsError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [route, setRoute] = useState(() => parseForwardRoute(window.location.hash));
  const [liveRevision, setLiveRevision] = useState(0);
  const [detailTab, setDetailTab] = useState<DetailTab>("operations");
  const isOfficePreview = route.screen === "office-preview";
  const isDemo = !config.token.trim() && !isOfficePreview;
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const selectedAgent = demoFleet.find(a => a.id === selectedAgentId) ?? null;
  const [agentView, setAgentView] = useState<"fleet" | "graph">("fleet");

  useEffect(() => {
    const handleHashChange = () => setRoute(parseForwardRoute(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    if (!window.location.hash) {
      window.location.hash = buildForwardRoute({ screen: "runs", runId: null });
    }
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim()) {
      setRuns([]);
      setRunsState("idle");
      setRunsError(null);
      return;
    }
    let cancelled = false;
    setRunsState("loading");
    setRunsError(null);
    forwardGet(config, "/runs", parseRunsResponse)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setRuns(payload.runs);
        setRunsState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setRunsState("error");
        setRunsError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || route.screen !== "run-detail" || !route.runId) {
      setSelectedRun(null);
      setReplay(null);
      setStateDocs(null);
      setContextLatest(null);
      setRoomTimeline(null);
      setSelectedRoomId(null);
      setDetailState("idle");
      setReplayState("idle");
      setStateDocsState("idle");
      setContextState("idle");
      setRoomState("idle");
      setDetailError(null);
      setReplayError(null);
      setStateDocsError(null);
      setContextError(null);
      setRoomError(null);
      return;
    }
    let cancelled = false;
    setDetailState("loading");
    setReplayState("loading");
    setStateDocsState("loading");
    setContextState("loading");
    setRoomState("idle");
    setDetailError(null);
    setReplayError(null);
    setStateDocsError(null);
    setContextError(null);
    setRoomError(null);
    Promise.allSettled([
      forwardGet(config, `/runs/${encodeURIComponent(route.runId)}`, parseRunDetailResponse),
      forwardGet(config, `/runs/${encodeURIComponent(route.runId)}/replay`, parseReplayResponse),
      forwardGet(config, `/runs/${encodeURIComponent(route.runId)}/state-docs`, parseStateDocsResponse),
      forwardGet(config, `/runs/${encodeURIComponent(route.runId)}/context-latest`, parseContextLatestResponse),
    ])
      .then(([detailResult, replayResult, stateDocsResult, contextResult]) => {
        if (cancelled) {
          return;
        }
        if (detailResult.status === "fulfilled") {
          setSelectedRun(detailResult.value);
          setDetailState("ready");
          setDetailError(null);
        } else {
          setSelectedRun(null);
          setDetailState("error");
          setDetailError(toErrorMessage(detailResult.reason));
        }

        if (replayResult.status === "fulfilled") {
          setReplay(replayResult.value);
          setReplayState("ready");
          setReplayError(null);
          const roomOptions = extractRoomOptions(replayResult.value);
          setSelectedRoomId((current) => pickNextRoomId(current, roomOptions));
        } else {
          setReplay(null);
          setReplayState("error");
          setReplayError(toErrorMessage(replayResult.reason));
          setRoomTimeline(null);
          setSelectedRoomId(null);
          setRoomState("idle");
          setRoomError(null);
        }

        if (stateDocsResult.status === "fulfilled") {
          setStateDocs(stateDocsResult.value);
          setStateDocsState("ready");
          setStateDocsError(null);
        } else {
          setStateDocs(null);
          setStateDocsState("error");
          setStateDocsError(toErrorMessage(stateDocsResult.reason));
        }

        if (contextResult.status === "fulfilled") {
          setContextLatest(contextResult.value);
          setContextState("ready");
          setContextError(null);
        } else {
          setContextLatest(null);
          setContextState("error");
          setContextError(toErrorMessage(contextResult.reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [config, route, liveRevision, isOfficePreview]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || !selectedRoomId) {
      setRoomTimeline(null);
      setRoomState("idle");
      setRoomError(null);
      return;
    }
    let cancelled = false;
    setRoomState("loading");
    setRoomError(null);
    forwardGet(config, `/rooms/${encodeURIComponent(selectedRoomId)}/timeline`, parseRoomTimelineResponse)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setRoomTimeline(payload);
        setRoomState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setRoomTimeline(null);
        setRoomState("error");
        setRoomError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, selectedRoomId, isOfficePreview]);

  const runItems = useMemo(() => runs.map(toRunListItemViewModel), [runs]);
  const runDetail = useMemo(() => (selectedRun ? toRunDetailViewModel(selectedRun) : null), [selectedRun]);
  const roomOptions = useMemo(() => (replay ? extractRoomOptions(replay) : []), [replay]);
  const graphModel = useMemo(
    () => (selectedRun && replay ? deriveForwardGraphModel(selectedRun, replay, roomTimeline) : null),
    [selectedRun, replay, roomTimeline],
  );
  const insightCards = useMemo(() => toInsightCardViewModels(replay, roomTimeline), [replay, roomTimeline]);
  const findingsSummary = useMemo(() => summarizeFindingsDocument(stateDocs), [stateDocs]);
  const validatorCorrelations = useMemo(() => summarizeValidatorCorrelations(replay), [replay]);

  const connect = (event: React.FormEvent) => {
    event.preventDefault();
    persistBridgeConfig(draftConfig);
    setConfig(draftConfig);
  };

  const openRun = (runId: string) => {
    window.location.hash = buildForwardRoute({ screen: "run-detail", runId });
  };

  const handleStreamSnapshot = useEffectEvent(() => {
    setLiveRevision((current) => current + 1);
  });

  const liveStream = useForwardStream({
    config,
    runId: route.screen === "run-detail" ? route.runId : null,
    roomId: selectedRoomId,
    enabled: route.screen === "run-detail" && !isOfficePreview,
    onSnapshot: handleStreamSnapshot,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (isOfficePreview) return;

      switch (e.key) {
        case "j": {
          const idx = runItems.findIndex((item) => item.runId === route.runId);
          const next = runItems[idx + 1];
          if (next) openRun(next.runId);
          break;
        }
        case "k": {
          const idx = runItems.findIndex((item) => item.runId === route.runId);
          const prev = runItems[idx - 1];
          if (prev) openRun(prev.runId);
          break;
        }
        case "r": {
          e.preventDefault();
          setLiveRevision((current) => current + 1);
          break;
        }
        case "Escape": {
          window.location.hash = buildForwardRoute({ screen: "runs", runId: null });
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runItems, route, isOfficePreview]);

  return (
    <div className={`forward-shell${isOfficePreview ? " forward-shell-preview" : ""}`}>
      {!isOfficePreview ? <OnboardingOverlay /> : null}
      <header className="forward-header">
        <div>
          <p className="forward-eyebrow">{isOfficePreview ? "Conitens / office preview" : "Conitens / forward runtime"}</p>
          <h1>{isOfficePreview ? "Pixel Office Preview" : "Read-only operator shell"}</h1>
          <p className="forward-subtitle">
            {isOfficePreview
              ? "Spatial verification lane for room density, rail hierarchy, and crew focus. Static sample data only."
              : "Forward bridge only. Runs, replay, state docs, and context digests stay separate from the legacy control plane."}
          </p>
        </div>
        <div className="forward-chip-row">
          <a className={`forward-chip forward-chip-link${route.screen === "runs" || route.screen === "run-detail" ? " active" : ""}`} href="#/runs">Forward Shell</a>
          <a className={`forward-chip forward-chip-link${isOfficePreview ? " active" : ""}`} href="#/office-preview">Pixel Office Preview</a>
          <a className={`forward-chip forward-chip-link${route.screen === "agents" ? " active" : ""}`} href="#/agents">Agents</a>
          {isOfficePreview ? (
            <span className="forward-chip">Design-only</span>
          ) : (
            <>
              <span className="forward-chip">Bridge: {config.apiRoot}</span>
              <span className="forward-chip">{config.token ? "Token loaded" : "Token required"}</span>
              <span className="forward-chip">Live: {liveStream.status}</span>
            </>
          )}
        </div>
      </header>

      {isOfficePreview ? (
        <main className="forward-main forward-main-preview">
          <PixelOffice agents={demoAgents} tasks={demoTasks} events={demoEvents} />
        </main>
      ) : route.screen === "agents" ? (
        <main className="forward-main">
          <div className="forward-tab-bar">
            <button
              className={`forward-tab${agentView === "fleet" ? " active" : ""}`}
              onClick={() => setAgentView("fleet")}
            >
              Fleet
            </button>
            <button
              className={`forward-tab${agentView === "graph" ? " active" : ""}`}
              onClick={() => setAgentView("graph")}
            >
              Relationships
            </button>
          </div>
          {agentView === "fleet" ? (
            <div className="agent-fleet-layout">
              <AgentFleetOverview agents={demoFleet} selectedAgentId={selectedAgentId} onSelectAgent={setSelectedAgentId} />
              <AgentProfilePanel
                agent={selectedAgent}
                evolution={demoEvolution.filter(e => e.agentId === selectedAgentId)}
                metrics={demoLearningMetrics.find(m => m.agentId === selectedAgentId) ?? null}
              />
            </div>
          ) : (
            <AgentRelationshipGraph agents={demoFleet} />
          )}
          <ProposalQueuePanel proposals={demoProposals} agents={demoFleet} />
        </main>
      ) : (
      <main className="forward-main">
        {isDemo ? (
          <div className="forward-demo-banner">
            <span>Demo mode — showing sample data. Connect to a live bridge to see real runs.</span>
            <button type="button" onClick={() => setShowConnectForm((v) => !v)}>
              {showConnectForm ? "Hide form" : "Connect to live bridge"}
            </button>
          </div>
        ) : null}
        {!isDemo || showConnectForm ? (
          <section className="forward-setup">
            <form className="forward-form" onSubmit={connect}>
              <label>
                <span>API root</span>
                <input
                  value={draftConfig.apiRoot}
                  onChange={(event) => setDraftConfig((current) => ({ ...current, apiRoot: event.target.value }))}
                  placeholder="http://127.0.0.1:8785/api"
                />
              </label>
              <label>
                <span>Bearer token</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={draftConfig.token}
                  onChange={(event) => setDraftConfig((current) => ({ ...current, token: event.target.value }))}
                  placeholder="Paste token from `ensemble forward serve`"
                />
              </label>
              <button type="submit">Connect</button>
            </form>
            <p className="forward-help">
              Launch the bridge with <code>python scripts/ensemble.py --workspace . forward serve --host 127.0.0.1 --port 8785</code>
            </p>
            <p className="forward-help">The bearer token is kept in-memory only and is not persisted across reloads.</p>
          </section>
        ) : null}

        <section className="forward-grid">
          <aside className="forward-sidebar">
            <div className="forward-panel-header">
              <div>
                <p className="forward-panel-label">Runs</p>
                <h2>Forward run list</h2>
              </div>
              <span className={`forward-state state-${isDemo ? "ready" : runsState}`}>{isDemo ? "demo" : runsState}</span>
            </div>
            {isDemo ? (
              <div className="forward-run-list">
                {demoTasks.map((task) => (
                  <button key={task.taskId} className={`forward-run-item${task.state === "active" ? " running" : ""}`}>
                    <div className="forward-run-topline">
                      <strong>{task.taskId}</strong>
                      <span>{task.state}</span>
                    </div>
                    <p>{task.assignee}</p>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {runsState === "idle" ? (
                  <p className="forward-empty">Enter bridge connection details to load forward runs.</p>
                ) : null}
                {runsState === "loading" ? <p className="forward-empty">Loading runs...</p> : null}
                {runsState === "error" ? <p className="forward-error">{runsError}</p> : null}
                {runsState === "ready" && runItems.length === 0 ? (
                  <p className="forward-empty">No forward runs yet.</p>
                ) : null}
                <div className="forward-run-list">
                  {runItems.map((item) => (
                    <button
                      key={item.runId}
                      className={`forward-run-item${route.runId === item.runId ? " active" : ""}${item.status === "running" ? " running" : ""}`}
                      onClick={() => openRun(item.runId)}
                    >
                      <div className="forward-run-topline">
                        <strong>{item.title}</strong>
                        <span>{item.status}</span>
                      </div>
                      <p>{item.subtitle}</p>
                      <div className="forward-metric-row">
                        {item.metrics.map((metric) => (
                          <span key={metric}>{metric}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>

          <section className="forward-detail">
            <div className="forward-panel-header">
              <div>
                <p className="forward-panel-label">Detail</p>
                <h2>{isDemo ? demoTasks[0]?.taskId ?? "Demo run" : runDetail ? runDetail.title : "Select a run"}</h2>
              </div>
              <span className={`forward-state state-${isDemo ? "ready" : detailState}`}>{isDemo ? "demo" : detailState}</span>
            </div>
            {isDemo ? (
              <div className="forward-detail-body">
                <div className="forward-detail-hero">
                  <div>
                    <p className="forward-detail-label">demo-run-001</p>
                    <h3>{demoTasks[0]?.taskId ?? "Sample objective"}</h3>
                    <p>Sample data — connect to a live bridge to see real run details.</p>
                  </div>
                  <span className="forward-status-pill">{demoTasks[0]?.state ?? "idle"}</span>
                </div>
                <div className="forward-stats">
                  <div><span>Agents</span><strong>{demoAgents.length}</strong></div>
                  <div><span>Tasks</span><strong>{demoTasks.length}</strong></div>
                  <div><span>Events</span><strong>{demoEvents.length}</strong></div>
                </div>
              </div>
            ) : null}
            {!isDemo && route.screen !== "run-detail" ? (
              <div className="forward-placeholder">
                <h3>Run detail placeholder</h3>
                <p>Select a run to inspect replay, state docs, context digests, and room timeline.</p>
              </div>
            ) : null}
            {!isDemo && route.screen === "run-detail" && detailState === "loading" ? (
              <p className="forward-empty">Loading run detail...</p>
            ) : null}
            {!isDemo && route.screen === "run-detail" && detailState === "error" ? (
              <p className="forward-error">{detailError}</p>
            ) : null}
            {!isDemo && route.screen === "run-detail" && runDetail ? (
              <ErrorBoundary>
                <div className="forward-detail-body">
                  <div className="forward-detail-hero">
                    <div>
                      <p className="forward-detail-label">{runDetail.runId}</p>
                      <h3>{runDetail.objective}</h3>
                      <p>{runDetail.latestIteration}</p>
                    </div>
                    <span className="forward-status-pill">{runDetail.status}</span>
                  </div>
                  <div className="forward-stats">
                    {runDetail.stats.map((item) => (
                      <div key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="forward-acceptance">
                    <p className="forward-panel-label">Acceptance</p>
                    {runDetail.acceptance.length === 0 ? (
                      <p className="forward-empty">No acceptance criteria recorded.</p>
                    ) : (
                      <ul>
                        {runDetail.acceptance.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="forward-tab-bar">
                    {(["operations", "intelligence", "data"] as const).map((tab) => (
                      <button
                        key={tab}
                        className={`forward-tab${detailTab === tab ? " active" : ""}`}
                        onClick={() => setDetailTab(tab)}
                      >
                        {tab === "operations" ? "Operations" : tab === "intelligence" ? "Intelligence" : "Data"}
                      </button>
                    ))}
                  </div>
                  {detailTab === "operations" && (
                    <>
                      <ForwardApprovalCenterPanel config={config} runId={runDetail.runId} />
                      <ForwardReplayPanel replay={replay} state={replayState} error={replayError} />
                    </>
                  )}
                  {detailTab === "intelligence" && (
                    <>
                      <ForwardGraphPanel model={graphModel} />
                      <ForwardInsightsPanel
                        insights={insightCards}
                        findingsSummary={findingsSummary}
                        validatorCorrelations={validatorCorrelations}
                      />
                    </>
                  )}
                  {detailTab === "data" && (
                    <>
                      <ForwardStateDocsPanel stateDocs={stateDocs} state={stateDocsState} error={stateDocsError} />
                      <ForwardContextPanel contextLatest={contextLatest} state={contextState} error={contextError} />
                      <ForwardRoomPanel
                        roomOptions={roomOptions}
                        selectedRoomId={selectedRoomId}
                        onSelectRoom={setSelectedRoomId}
                        roomTimeline={roomTimeline}
                        state={roomState}
                        error={roomError}
                      />
                    </>
                  )}
                </div>
              </ErrorBoundary>
            ) : null}
          </section>
        </section>
      </main>
      )}
    </div>
  );
}
