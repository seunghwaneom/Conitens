import React, { useEffect, useMemo } from "react";
import { useUiStore } from "../store/ui-store.js";
import { useRunsStore } from "../store/runs-store.js";
import { useDashboardStore } from "../store/dashboard-store.js";
import { Panel, Badge, TabBar, EmptyState, ErrorDisplay, LoadingState } from "../ds/index.js";
import { ForwardApprovalCenterPanel } from "../components/ForwardApprovalCenterPanel.js";
import { ForwardReplayPanel } from "../components/ForwardReplayPanel.js";
import { ForwardGraphPanel } from "../components/ForwardGraphPanel.js";
import { ForwardInsightsPanel } from "../components/ForwardInsightsPanel.js";
import { ForwardStateDocsPanel } from "../components/ForwardStateDocsPanel.js";
import { ForwardContextPanel } from "../components/ForwardContextPanel.js";
import { ForwardRoomPanel } from "../components/ForwardRoomPanel.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { toRunDetailViewModel } from "../forward-view-model.js";
import { useRunSubPanels } from "../hooks/useRunSubPanels.js";
import styles from "./RunDetailScreen.module.css";

const TAB_ITEMS = [
  { key: "operations", label: "Operations" },
  { key: "intelligence", label: "Intelligence" },
  { key: "data", label: "Data" },
];

export function RunDetailScreen() {
  const route = useUiStore((s) => s.route);
  const config = useDashboardStore((s) => s.config);
  const liveRevision = useDashboardStore((s) => s.liveRevision);

  const runDetail = useRunsStore((s) => s.runDetail);
  const detailState = useRunsStore((s) => s.detailState);
  const detailError = useRunsStore((s) => s.error);
  const fetchRunDetail = useRunsStore((s) => s.fetchRunDetail);
  const activeTab = useRunsStore((s) => s.activeTab);
  const setActiveTab = useRunsStore((s) => s.setActiveTab);

  const runId = route.runId;

  // ── Fetch run detail ────────────────────────────────────────────────
  useEffect(() => {
    if (!config.token.trim() || !runId) return;
    fetchRunDetail(config, runId);
  }, [config, runId, liveRevision, fetchRunDetail]);

  // ── Sub-panel state (extracted to hook) ────────────────────────────
  const {
    replay,
    stateDocs,
    contextLatest,
    roomTimeline,
    selectedRoomId,
    setSelectedRoomId,
    replayState,
    stateDocsState,
    contextState,
    roomState,
    replayError,
    stateDocsError,
    contextError,
    roomError,
    roomOptions,
    graphModel,
    insightCards,
    findingsSummary,
    validatorCorrelations,
  } = useRunSubPanels(config, runId ?? null, runDetail, liveRevision);

  // ── Derived view model ──────────────────────────────────────────────
  const runViewModel = useMemo(
    () => (runDetail ? toRunDetailViewModel(runDetail) : null),
    [runDetail],
  );

  // ── Render ──────────────────────────────────────────────────────────
  if (!runId) {
    return <EmptyState message="No run selected. Navigate to a run to inspect its detail." />;
  }

  if (detailState === "loading") {
    return <LoadingState message="Loading run detail…" />;
  }

  if (detailState === "error") {
    return <ErrorDisplay message={detailError ?? "Failed to load run detail"} />;
  }

  if (!runViewModel) {
    return <EmptyState message="No run detail available." />;
  }

  return (
    <ErrorBoundary>
      <div className={styles.root}>
        <Panel className={styles.hero}>
          <div className={styles.heroHeader}>
            <div>
              <p className={styles.runIdLabel}>{runViewModel.runId}</p>
              <h3 className={styles.objective}>{runViewModel.objective}</h3>
              <p className={styles.iteration}>{runViewModel.latestIteration}</p>
            </div>
            <Badge variant={runViewModel.status === "running" ? "info" : "neutral"}>
              {runViewModel.status}
            </Badge>
          </div>
          <div className={styles.stats}>
            {runViewModel.stats.map((item) => (
              <div key={item.label} className={styles.statItem}>
                <span className={styles.statLabel}>{item.label}</span>
                <strong className={styles.statValue}>{item.value}</strong>
              </div>
            ))}
          </div>
          {runViewModel.acceptance.length > 0 && (
            <div className={styles.acceptance}>
              <p className={styles.sectionLabel}>Acceptance</p>
              <ul className={styles.acceptanceList}>
                {runViewModel.acceptance.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <TabBar
          items={TAB_ITEMS}
          activeKey={activeTab}
          onSelect={(key) => setActiveTab(key as "operations" | "intelligence" | "data")}
        />

        <div className={styles.tabContent}>
          {activeTab === "operations" && (
            <>
              <ForwardApprovalCenterPanel config={config} runId={runViewModel.runId} />
              <ForwardReplayPanel replay={replay} state={replayState} error={replayError} />
            </>
          )}
          {activeTab === "intelligence" && (
            <>
              <ForwardGraphPanel model={graphModel} />
              <ForwardInsightsPanel
                insights={insightCards}
                findingsSummary={findingsSummary}
                validatorCorrelations={validatorCorrelations}
              />
            </>
          )}
          {activeTab === "data" && (
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
      </div>
    </ErrorBoundary>
  );
}
