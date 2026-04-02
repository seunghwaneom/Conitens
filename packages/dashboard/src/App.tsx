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
import { demoAgents, demoEvents, demoTasks } from "./demo-data.js";

type LoadState = "idle" | "loading" | "ready" | "error";

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
  const isOfficePreview = route.screen === "office-preview";

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

  return (
    <div className={`forward-shell${isOfficePreview ? " forward-shell-preview" : ""}`}>
      <header className="forward-header">
        <div>
          <p className="forward-eyebrow">{isOfficePreview ? "Conitens / office preview" : "Conitens / forward runtime"}</p>
          <h1>{isOfficePreview ? "Pixel Office Preview" : "Read-only operator shell"}</h1>
          <p className="forward-subtitle">
            {isOfficePreview
              ? "Design-only route for visual verification. Static sample data only."
              : "Forward bridge only. Runs, replay, state docs, and context digests stay separate from the legacy control plane."}
          </p>
        </div>
        <div className="forward-chip-row">
          <a className="forward-chip forward-chip-link" href="#/runs">Forward Shell</a>
          <a className="forward-chip forward-chip-link" href="#/office-preview">Pixel Office Preview</a>
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
        <main className="forward-main">
          <PixelOffice agents={demoAgents} tasks={demoTasks} events={demoEvents} />
        </main>
      ) : (
      <main className="forward-main">
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

        <section className="forward-grid">
          <aside className="forward-sidebar">
            <div className="forward-panel-header">
              <div>
                <p className="forward-panel-label">Runs</p>
                <h2>Forward run list</h2>
              </div>
              <span className={`forward-state state-${runsState}`}>{runsState}</span>
            </div>
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
                  className={`forward-run-item${route.runId === item.runId ? " active" : ""}`}
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
          </aside>

          <section className="forward-detail">
            <div className="forward-panel-header">
              <div>
                <p className="forward-panel-label">Detail</p>
                <h2>{runDetail ? runDetail.title : "Select a run"}</h2>
              </div>
              <span className={`forward-state state-${detailState}`}>{detailState}</span>
            </div>
            {route.screen !== "run-detail" ? (
              <div className="forward-placeholder">
                <h3>Run detail placeholder</h3>
                <p>Select a run to inspect replay, state docs, context digests, and room timeline.</p>
              </div>
            ) : null}
            {route.screen === "run-detail" && detailState === "loading" ? (
              <p className="forward-empty">Loading run detail...</p>
            ) : null}
            {route.screen === "run-detail" && detailState === "error" ? (
              <p className="forward-error">{detailError}</p>
            ) : null}
            {route.screen === "run-detail" && runDetail ? (
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
                  <ForwardReplayPanel replay={replay} state={replayState} error={replayError} />
                  <ForwardApprovalCenterPanel config={config} runId={runDetail.runId} />
                  <ForwardGraphPanel model={graphModel} />
                  <ForwardInsightsPanel
                    insights={insightCards}
                    findingsSummary={findingsSummary}
                    validatorCorrelations={validatorCorrelations}
                  />
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
