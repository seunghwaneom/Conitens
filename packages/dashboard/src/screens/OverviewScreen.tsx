import { useMemo } from "react";
import { CoreRouteScaffold } from "../components/CoreRouteScaffold.js";
import { OperatorSummaryPanel } from "../components/OperatorSummaryPanel.js";
import { demoTasks } from "../demo-data.js";
import { useBridgeStatus } from "../hooks/useBridgeStatus.js";
import { useOperatorSummaryData } from "../hooks/useOperatorSummaryData.js";
import { useRunsData } from "../hooks/useRunsData.js";
import { buildForwardRoute } from "../forward-route.js";
import { localizeStatus, pickText } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";
import styles from "./CoreRouteWorkspace.module.css";

export function OverviewScreen() {
  const locale = useUiStore((state) => state.locale);
  const {
    config,
    draftConfig,
    setDraftConfig,
    showConnectForm,
    toggleConnectForm,
    handleConnect,
    isDemo,
    bridgeLabel,
    liveRevision,
  } = useBridgeStatus();
  const { viewModel, state, error } = useOperatorSummaryData(config, liveRevision);
  const { runItems, listState, listError } = useRunsData(config, liveRevision);
  const featuredRuns = useMemo(
    () => (
      isDemo
        ? [
            {
              runId: "demo-run-001",
              title: demoTasks[0]?.taskId ?? "wf_apply",
              status: "active",
              subtitle: "iter-1 | active",
              metrics: ["1 iterations", "2 approvals", "0 failures"],
            },
          ]
        : runItems.slice(0, 4)
    ),
    [isDemo, runItems],
  );
  const overview = useMemo(
    () => (
      isDemo
        ? {
            postureLabel: "demo",
            latestRunLabel: "demo-run-001 | active",
            metrics: [
              { id: "demo-runs", label: pickText(locale, { ko: "활성 런", en: "Active runs" }), value: "1", detail: pickText(locale, { ko: "데모 작업 6개가 보입니다", en: "6 demo tasks visible" }) },
              { id: "demo-approvals", label: pickText(locale, { ko: "대기 승인", en: "Pending approvals" }), value: "2", detail: pickText(locale, { ko: "샘플 큐가 운영자 attention을 대신합니다", en: "Sample queue standing in for operator attention" }) },
              { id: "demo-rooms", label: pickText(locale, { ko: "활성 룸", en: "Active rooms" }), value: "6", detail: pickText(locale, { ko: "Spatial lens는 drill-down으로 계속 제공됩니다", en: "Spatial lens remains available as a drill-down" }) },
              { id: "demo-failures", label: pickText(locale, { ko: "실패 런", en: "Failing runs" }), value: "0", detail: pickText(locale, { ko: "데모 validator blocker가 없습니다", en: "No demo validator blockers are active" }) },
              { id: "demo-handoffs", label: pickText(locale, { ko: "열린 handoff", en: "Open handoffs" }), value: "2", detail: pickText(locale, { ko: "샘플 coordination load가 적용되어 있습니다", en: "Sample coordination load from the office demo" }) },
            ],
            attention: [
              {
                id: "demo-attention",
                tone: "info" as const,
                title: pickText(locale, { ko: "데모 posture가 활성 상태입니다", en: "Demo posture is active" }),
                detail: pickText(locale, { ko: "라이브 브리지를 연결하면 샘플 operator signal이 실제 상태로 교체됩니다.", en: "Connect a live bridge to replace these sample operator signals with live state." }),
              },
            ],
          }
        : viewModel
    ),
    [isDemo, locale, viewModel],
  );

  return (
    <main className="forward-main">
      <CoreRouteScaffold
        eyebrow={pickText(locale, { ko: "운영 개요", en: "Operator overview" })}
        title={pickText(locale, { ko: "개요", en: "Overview" })}
        description={pickText(locale, { ko: "현재 운영 posture와 즉시 처리할 attention lane을 가장 먼저 보여주는 route입니다.", en: "Start with operator posture and the immediate attention lanes that need action." })}
        bridgeLabel={bridgeLabel}
        isDemo={isDemo}
        draftConfig={draftConfig}
        showConnectForm={showConnectForm}
        onToggleConnectForm={toggleConnectForm}
        onDraftConfigChange={setDraftConfig}
        onSubmit={handleConnect}
      >
        <section className={styles.heroGrid}>
          <div className={styles.panel}>
            <OperatorSummaryPanel summary={overview} state={isDemo ? "ready" : state} error={error} />
          </div>
          <aside className={styles.rail}>
            <div className={styles.railHeader}>
              <div>
                <p className={styles.label}>{pickText(locale, { ko: "긴급 런", en: "Urgent runs" })}</p>
                <h3 className={styles.title}>{pickText(locale, { ko: "최근 실행 큐", en: "Recent execution queue" })}</h3>
              </div>
              <span className="forward-state">{isDemo ? "demo" : listState}</span>
            </div>
            {featuredRuns.length === 0 ? (
              listState === "loading" && !isDemo ? (
                <p className={styles.empty}>Loading recent runs…</p>
              ) : (
                <p className={styles.empty}>
                  {isDemo
                    ? pickText(locale, { ko: "최근 런을 보려면 라이브 브리지를 연결하세요.", en: "Connect live bridge to inspect recent runs." })
                    : pickText(locale, { ko: "현재 노출된 최근 런이 없습니다.", en: "No recent runs are currently surfaced." })}
                </p>
              )
            ) : (
              <div className={styles.list}>
                {featuredRuns.map((run) => (
                  <a key={run.runId} href={buildForwardRoute({ screen: "run-detail", runId: run.runId, taskId: null, workspaceId: null, threadId: null, agentId: null })} className={styles.rowButton}>
                    <div className={styles.rowTopline}>
                      <strong>{run.title}</strong>
                      <span>{localizeStatus(locale, run.status)}</span>
                    </div>
                    <div className={styles.rowMeta}>{run.metrics.map((metric) => <span key={metric}>{metric}</span>)}</div>
                  </a>
                ))}
              </div>
            )}
            {!isDemo && listError ? <p className="forward-error">{listError}</p> : null}
          </aside>
        </section>
      </CoreRouteScaffold>
    </main>
  );
}
