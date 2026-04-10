import { useEffect } from "react";
import { CoreRouteScaffold } from "../components/CoreRouteScaffold.js";
import { demoTasks } from "../demo-data.js";
import { useBridgeStatus } from "../hooks/useBridgeStatus.js";
import { useRunsData } from "../hooks/useRunsData.js";
import { buildForwardRoute } from "../forward-route.js";
import { localizeLabel, localizeStatus, pickText } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";
import styles from "./CoreRouteWorkspace.module.css";

export function RunsScreen() {
  const route = useUiStore((state) => state.route);
  const locale = useUiStore((state) => state.locale);
  const navigate = useUiStore((state) => state.navigate);
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
  const {
    runItems,
    listState,
    listError,
    detail,
    detailState,
    selectedRunId,
    setSelectedRunId,
    detailError,
  } = useRunsData(config, liveRevision, route.screen === "runs" ? route.runId : null);
  const visibleRuns = isDemo
    ? [
        {
          runId: "demo-run-001",
          title: demoTasks[0]?.taskId ?? "wf_apply",
          status: "active",
          subtitle: "iter-1 | active",
          metrics: ["1 iterations", "2 approvals", "0 failures"],
        },
      ]
    : runItems;
  const activeRunId = isDemo ? visibleRuns[0]?.runId ?? null : selectedRunId;
  const desiredRunId = isDemo ? visibleRuns[0]?.runId ?? null : selectedRunId;
  const detailView = isDemo
    ? {
        runId: "demo-run-001",
        title: demoTasks[0]?.taskId ?? "wf_apply",
        status: "active",
        latestIteration: "iter-1 | active",
        objective: "Demo run summary placeholder for the core operator route.",
        acceptance: ["Connect a live bridge to load full execution evidence."],
        stats: [
          { label: "Iterations", value: "1" },
          { label: "Validator", value: "0" },
          { label: "Approvals", value: "2" },
          { label: "Rooms", value: "6" },
          { label: "Insights", value: "3" },
        ],
      }
    : detail;

  useEffect(() => {
    if (desiredRunId && route.screen === "runs" && route.runId !== desiredRunId) {
      navigate({
        screen: "runs",
        runId: desiredRunId,
        taskId: null,
        workspaceId: null,
        threadId: null,
        agentId: null,
      });
    }
  }, [desiredRunId, navigate, route.agentId, route.runId, route.screen, route.taskId, route.threadId, route.workspaceId]);

  return (
    <main className="forward-main">
      <CoreRouteScaffold
        eyebrow={pickText(locale, { ko: "실행 트레이스", en: "Execution traces" })}
        title={pickText(locale, { ko: "런", en: "Runs" })}
        description={pickText(locale, {
          ko: "Runs는 evidence browser로 유지하고, task queue와는 다른 전용 split layout을 사용합니다.",
          en: "Runs stay as an evidence browser with a dedicated split layout distinct from the task queue.",
        })}
        bridgeLabel={bridgeLabel}
        isDemo={isDemo}
        draftConfig={draftConfig}
        showConnectForm={showConnectForm}
        onToggleConnectForm={toggleConnectForm}
        onDraftConfigChange={setDraftConfig}
        onSubmit={handleConnect}
      >
        <section className={styles.listShell}>
          <aside className={styles.rail}>
            <div className={styles.railHeader}>
              <div>
                <p className={styles.label}>{pickText(locale, { ko: "런 큐", en: "Run queue" })}</p>
                <h3 className={styles.title}>{pickText(locale, { ko: "최근 런", en: "Recent runs" })}</h3>
              </div>
              <span className="forward-state">{isDemo ? "demo" : listState}</span>
            </div>
            {listError ? <p className="forward-error">{listError}</p> : null}
            {visibleRuns.length === 0 ? (
              <p className={styles.empty}>
                {isDemo
                  ? pickText(locale, { ko: "실행 evidence를 보려면 라이브 브리지를 연결하세요.", en: "Connect a live bridge to inspect execution evidence." })
                  : pickText(locale, { ko: "기록된 런이 없습니다.", en: "No runs recorded yet." })}
              </p>
            ) : (
              <div className={styles.list}>
                {visibleRuns.map((run) => {
                  const isActive = run.runId === activeRunId;
                  return (
                    <button
                      key={run.runId}
                      type="button"
                      className={`${styles.rowButton}${isActive ? ` ${styles.rowButtonActive}` : ""}`}
                      onClick={() => setSelectedRunId(run.runId)}
                    >
                      <div className={styles.rowTopline}>
                        <strong>{run.title}</strong>
                        <span>{localizeStatus(locale, run.status)}</span>
                      </div>
                    <p className={styles.meta}>{run.subtitle}</p>
                      <div className={styles.metricLine}>
                        {run.metrics.map((metric) => (
                          <span key={metric}>{metric}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section className={styles.detail}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.label}>{pickText(locale, { ko: "선택된 런", en: "Selected run" })}</p>
                <h3 className={styles.title}>{detailView?.title ?? pickText(locale, { ko: "런 선택", en: "Choose a run" })}</h3>
                <p className={styles.meta}>
                  {detailView
                    ? `${detailView.runId} | ${detailView.latestIteration}`
                    : pickText(locale, { ko: "런을 선택하면 summary와 evidence entry를 확인할 수 있습니다.", en: "Choose a run to inspect its summary and evidence entry." })}
                </p>
              </div>
              <span className="forward-state">{isDemo ? "demo" : detailState}</span>
            </div>
            {!isDemo && detailError ? <p className="forward-error">{detailError}</p> : null}

            {detailView ? (
              <>
                <div className={styles.detailStats}>
                  {detailView.stats.map((item) => (
                    <div key={item.label}>
                    <span>{localizeLabel(locale, item.label)}</span>
                    <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <section className={styles.section}>
                  <div>
                    <p className={styles.label}>{pickText(locale, { ko: "목표", en: "Objective" })}</p>
                    <p className={styles.meta}>{detailView.objective}</p>
                  </div>
                  <ul className={styles.timeline}>
                    {detailView.acceptance.map((item, index) => (
                      <li key={`${item}-${index}`}>
                        <div className={styles.timelineTopline}>
                          <strong>{pickText(locale, { ko: "완료 기준", en: "Acceptance" })}</strong>
                        </div>
                        <p>{item}</p>
                      </li>
                    ))}
                  </ul>
                </section>

                <div className={styles.actionsRow}>
                  <a
                    className={styles.actionButton}
                    href={buildForwardRoute({
                      screen: "run-detail",
                      runId: detailView.runId,
                      taskId: null,
                      workspaceId: null,
                      threadId: null,
                      agentId: null,
                    })}
                  >
                    {pickText(locale, { ko: "런 상세 열기", en: "Open run detail" })}
                  </a>
                </div>
              </>
            ) : (
              <p className={styles.empty}>
                {isDemo
                  ? pickText(locale, { ko: "런 상세를 로드하려면 라이브 브리지를 연결하세요.", en: "Connect a live bridge to load run detail." })
                  : pickText(locale, { ko: "선택된 런 상세가 없습니다.", en: "No run detail is selected." })}
              </p>
            )}
          </section>
        </section>
      </CoreRouteScaffold>
    </main>
  );
}
