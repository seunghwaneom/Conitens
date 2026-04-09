import { useUiStore } from "../store/ui-store.js";
import { CoreRouteScaffold } from "../components/CoreRouteScaffold.js";
import { OperatorTaskDetailPanel } from "../components/OperatorTaskDetailPanel.js";
import {
  OperatorTaskEditorPanel,
  type OperatorTaskDraft,
} from "../components/OperatorTaskEditorPanel.js";
import { demoTasks } from "../demo-data.js";
import type { SavedTaskFilterPreset } from "../forward-bridge.js";
import { useBridgeStatus } from "../hooks/useBridgeStatus.js";
import { useOperatorTasksData } from "../hooks/useOperatorTasksData.js";
import { buildForwardRoute } from "../forward-route.js";
import { localizeStatus, pickText } from "../i18n.js";
import shellStyles from "./CoreRouteWorkspace.module.css";
import styles from "./TasksScreen.module.css";

export function TasksScreen() {
  const route = useUiStore((s) => s.route);
  const locale = useUiStore((s) => s.locale);
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
  const taskData = useOperatorTasksData(config, liveRevision);

  const detailMode = route.screen === "task-detail";
  const detailTitle = detailMode
    ? pickText(locale, { ko: "선택된 작업", en: "Selected task" })
    : pickText(locale, { ko: "운영자 작업 생성", en: "Create operator task" });
  const detailDescription = detailMode
    ? pickText(locale, { ko: "상태 전환, approval 요청, lifecycle, record/evidence를 이 pane에서 처리합니다.", en: "Handle status changes, approval requests, lifecycle, and record/evidence in this pane." })
    : pickText(locale, { ko: "새 canonical operator task를 바로 생성합니다.", en: "Create a new canonical operator task directly from this workspace." });
  const visibleItems = isDemo
    ? demoTasks.map((task) => ({
        taskId: task.taskId,
        title: task.taskId,
        status: task.state,
        subtitle: task.assignee,
        metrics: [task.assignee, task.state],
      }))
    : taskData.taskItems;
  const demoDetail = {
    taskId: demoTasks[0]?.taskId ?? "demo-task",
    title: demoTasks[0]?.taskId ?? "Demo operator task",
    status: demoTasks[0]?.state ?? "todo",
    objective: "Sample canonical operator task record for the demo shell.",
    owner: demoTasks[0]?.assignee ?? "unassigned",
    archivedAt: null,
    archivedBy: null,
    archiveNote: null,
    linkedRunId: "demo-run-001",
    linkedIterationId: "iter-1",
    linkedRoomIds: ["review-room"],
    blockedReason: null,
    acceptance: ["Connect a live bridge to replace this with canonical operator tasks."],
    stats: [
      { label: "Priority", value: "medium" },
      { label: "Archived", value: "no" },
      { label: "Run", value: "demo-run-001" },
      { label: "Iteration", value: "iter-1" },
      { label: "Rooms", value: "1" },
      { label: "Workspace", value: "none" },
    ],
  };

  return (
    <main className="forward-main">
      <CoreRouteScaffold
        eyebrow={pickText(locale, { ko: "운영자 작업", en: "Operator tasks" })}
        title={pickText(locale, { ko: "작업", en: "Tasks" })}
        description={pickText(locale, { ko: "Task route는 queue rail과 detail pane을 유지하되, filter와 bulk control은 상단 toolbar로 끌어올립니다.", en: "Keep the queue rail and detail pane, but move filtering and bulk controls into a top toolbar." })}
        bridgeLabel={bridgeLabel}
        isDemo={isDemo}
        draftConfig={draftConfig}
        showConnectForm={showConnectForm}
        onToggleConnectForm={toggleConnectForm}
        onDraftConfigChange={setDraftConfig}
        onSubmit={handleConnect}
      >
        <section className={styles.toolbar}>
          <div className={styles.filterRow}>
            <label>
              <span>{pickText(locale, { ko: "상태 필터", en: "Status filter" })}</span>
              <select
                value={taskData.taskFilterStatus}
                onChange={(event) => taskData.setTaskFilterStatus(event.target.value)}
              >
                {["all", "backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{pickText(locale, { ko: "담당자 필터", en: "Owner filter" })}</span>
              <input
                value={taskData.taskFilterOwner}
                onChange={(event) => taskData.setTaskFilterOwner(event.target.value)}
                placeholder={pickText(locale, { ko: "agent id", en: "agent id" })}
              />
            </label>
            <label>
              <span>{pickText(locale, { ko: "보관", en: "Archived" })}</span>
              <select
                value={taskData.taskIncludeArchived ? "show" : "hide"}
                onChange={(event) => taskData.setTaskIncludeArchived(event.target.value === "show")}
              >
                  <option value="hide">{pickText(locale, { ko: "보관 숨기기", en: "Hide archived" })}</option>
                  <option value="show">{pickText(locale, { ko: "보관 보기", en: "Show archived" })}</option>
                </select>
              </label>
          </div>

          <div className={styles.presetForm}>
            <label>
              <span>{pickText(locale, { ko: "프리셋 이름", en: "Preset name" })}</span>
              <input
                value={taskData.taskFilterPresetName}
                onChange={(event) => taskData.setTaskFilterPresetName(event.target.value)}
                placeholder={pickText(locale, { ko: "검토 큐", en: "Review queue" })}
              />
            </label>
            <button className={styles.chipButton} type="button" onClick={taskData.handleSaveTaskFilterPreset}>
              {pickText(locale, { ko: "프리셋 저장", en: "Save preset" })}
            </button>
            <div className={styles.chipGroup}>
              {taskData.savedTaskFilterPresets.map((preset: SavedTaskFilterPreset) => (
                <button
                  key={preset.id}
                  className={styles.chipButton}
                  type="button"
                  onClick={() => taskData.applySavedTaskFilterPreset(preset)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.actionRow}>
            <button
              className={styles.chipButton}
              type="button"
              onClick={() => taskData.handleBulkTaskLifecycle("archive")}
            >
              {pickText(locale, { ko: "선택/노출 작업 보관", en: "Archive selected/visible" })}
            </button>
            <button
              className={styles.chipButton}
              type="button"
              onClick={() => taskData.handleBulkTaskLifecycle("restore")}
            >
              {pickText(locale, { ko: "선택/노출 작업 복원", en: "Restore selected/visible" })}
            </button>
            <span className={styles.metaLabel}>
              {taskData.selectedVisibleTaskRecords.length > 0
                ? pickText(locale, { ko: `${taskData.selectedVisibleTaskRecords.length}개 선택됨`, en: `${taskData.selectedVisibleTaskRecords.length} selected` })
                : pickText(locale, { ko: `${visibleItems.length}개 노출`, en: `${visibleItems.length} visible` })}
            </span>
          </div>

          <label className={styles.rationaleLabel}>
            <span>{pickText(locale, { ko: "일괄 보관 사유", en: "Bulk archive rationale" })}</span>
            <textarea
              value={taskData.taskBulkArchiveRationale}
              onChange={(event) => taskData.setTaskBulkArchiveRationale(event.target.value)}
              placeholder={pickText(locale, { ko: "왜 이 작업들이 active queue를 떠나야 하는지 설명하세요.", en: "Explain why these tasks should leave the active queue." })}
            />
          </label>

          {taskData.taskPresetError ? <p className={`${styles.message} ${styles.danger}`}>{taskData.taskPresetError}</p> : null}
          {taskData.taskBulkError ? <p className={`${styles.message} ${styles.danger}`}>{taskData.taskBulkError}</p> : null}
          {taskData.taskBulkMessage ? <p className={styles.message}>{taskData.taskBulkMessage}</p> : null}
        </section>

        <section className={shellStyles.listShell}>
          <aside className={shellStyles.rail}>
            <div className={shellStyles.railHeader}>
              <div>
                <p className={shellStyles.label}>{pickText(locale, { ko: "작업 큐", en: "Task queue" })}</p>
                <h3 className={shellStyles.title}>{pickText(locale, { ko: "노출된 작업", en: "Visible tasks" })}</h3>
              </div>
              <span className="forward-state">{isDemo ? "demo" : taskData.tasksState}</span>
            </div>

            {taskData.tasksError ? <p className="forward-error">{taskData.tasksError}</p> : null}
            {visibleItems.length === 0 ? (
              <p className={shellStyles.empty}>
                {isDemo
                  ? pickText(locale, { ko: "canonical operator task를 보려면 라이브 브리지를 연결하세요.", en: "Connect live bridge to inspect canonical operator tasks." })
                  : pickText(locale, { ko: "현재 필터와 일치하는 operator task가 없습니다.", en: "No operator tasks match the current filters." })}
              </p>
            ) : (
              <div className={shellStyles.list}>
                {visibleItems.map((item) => {
                  const isActive = route.taskId === item.taskId;
                  return (
                    <div key={item.taskId} className={styles.railRow}>
                      {!isDemo ? (
                        <input
                          type="checkbox"
                          checked={taskData.selectedTaskIds.includes(item.taskId)}
                          onChange={() => taskData.toggleTaskSelection(item.taskId)}
                          aria-label={`Select ${item.taskId}`}
                        />
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        className={`${shellStyles.rowButton}${isActive ? ` ${shellStyles.rowButtonActive}` : ""}`}
                        onClick={() => {
                          window.location.hash = buildForwardRoute({
                            screen: "task-detail",
                            runId: null,
                            taskId: item.taskId,
                            workspaceId: null,
                            threadId: null,
                            agentId: null,
                          });
                        }}
                      >
                        <div className={shellStyles.rowTopline}>
                          <strong>{item.title}</strong>
                          <span>{localizeStatus(locale, item.status)}</span>
                        </div>
                        <p className={shellStyles.meta}>{item.subtitle}</p>
                        <div className={shellStyles.metricLine}>
                          {item.metrics.map((metric) => (
                            <span key={metric}>{metric}</span>
                          ))}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          <section className={shellStyles.detail}>
            <div className={shellStyles.panelHeader}>
              <div>
                <p className={shellStyles.label}>{detailTitle}</p>
                <h3 className={shellStyles.title}>
                  {detailMode
                    ? taskData.taskDetail?.title ?? pickText(locale, { ko: "작업 선택", en: "Choose a task" })
                    : pickText(locale, { ko: "작업 생성", en: "Create task" })}
                </h3>
                <p className={shellStyles.meta}>{detailDescription}</p>
              </div>
              <span className="forward-state">
                {isDemo
                  ? "demo"
                  : detailMode
                    ? taskData.taskDetailState
                    : taskData.taskMutationState}
              </span>
            </div>

            <OperatorTaskDetailPanel
              task={isDemo ? demoDetail : detailMode ? taskData.taskDetail : null}
              state={isDemo ? "ready" : detailMode ? taskData.taskDetailState : "idle"}
              error={taskData.taskDetailError}
              mutationState={taskData.taskMutationState}
              mutationError={taskData.taskMutationError}
              onQuickStatus={
                !isDemo && detailMode && !taskData.taskDetail?.archivedAt
                  ? taskData.handleTaskQuickStatus
                  : undefined
              }
              archiveState={taskData.taskArchiveState}
              archiveError={taskData.taskArchiveError}
              onArchive={
                !isDemo && detailMode && !taskData.taskDetail?.archivedAt
                  ? taskData.handleTaskArchive
                  : undefined
              }
              onRestore={
                !isDemo && detailMode && Boolean(taskData.taskDetail?.archivedAt)
                  ? taskData.handleTaskRestore
                  : undefined
              }
              archiveRationale={taskData.taskArchiveRationale}
              onArchiveRationaleChange={taskData.setTaskArchiveRationale}
              deleteState={taskData.taskDeleteState}
              deleteError={taskData.taskDeleteError}
              onDelete={
                !isDemo && detailMode && Boolean(taskData.taskDetail?.archivedAt)
                  ? taskData.handleTaskDelete
                  : undefined
              }
              approvalRequestState={taskData.taskApprovalRequestState}
              approvalRequestError={taskData.taskApprovalRequestError}
              onRequestApproval={
                !isDemo && detailMode && !taskData.taskDetail?.archivedAt
                  ? taskData.handleTaskRequestApproval
                  : undefined
              }
              approvalRationale={taskData.taskApprovalRationale}
              onApprovalRationaleChange={taskData.setTaskApprovalRationale}
              approvalRequestedChanges={taskData.approvalRequestedChanges}
            />

            {!isDemo ? (
              <OperatorTaskEditorPanel
                mode={detailMode ? "edit" : "create"}
                draft={taskData.taskDraft as OperatorTaskDraft}
                state={taskData.taskMutationState}
                error={taskData.taskMutationError}
                workspaceOptions={taskData.workspaceOptions}
                selectedWorkspaceOption={taskData.selectedDraftWorkspaceOption}
                changePreview={taskData.approvalRequestedChanges}
                approvalHint={
                  detailMode && taskData.approvalRequestedChanges.length > 0
                    ? "Execution-sensitive fields changed. Request approval if the linked run is under review."
                    : null
                }
                onChange={taskData.setTaskDraft}
                onSubmit={taskData.handleTaskSubmit}
              />
            ) : null}
          </section>
        </section>
      </CoreRouteScaffold>
    </main>
  );
}
