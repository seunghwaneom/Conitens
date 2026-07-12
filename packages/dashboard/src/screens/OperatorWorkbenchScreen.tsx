import React from "react";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { ForwardApprovalCenterPanel } from "../components/ForwardApprovalCenterPanel.js";
import { ForwardContextPanel } from "../components/ForwardContextPanel.js";
import { ForwardGraphPanel } from "../components/ForwardGraphPanel.js";
import { ForwardInsightsPanel } from "../components/ForwardInsightsPanel.js";
import { ForwardReplayPanel } from "../components/ForwardReplayPanel.js";
import { ForwardRoomPanel } from "../components/ForwardRoomPanel.js";
import { ForwardStateDocsPanel } from "../components/ForwardStateDocsPanel.js";
import { OperatorInboxPanel } from "../components/OperatorInboxPanel.js";
import { OperatorSummaryPanel } from "../components/OperatorSummaryPanel.js";
import { OperatorTaskDetailPanel } from "../components/OperatorTaskDetailPanel.js";
import { OperatorTaskReconcilePreviewPanel } from "../components/OperatorTaskReconcilePreviewPanel.js";
import { OperatorWakeReadinessPanel } from "../components/OperatorWakeReadinessPanel.js";
import {
  OperatorTaskEditorPanel,
  type OperatorTaskDraft,
  type OperatorTaskWorkspaceOption,
} from "../components/OperatorTaskEditorPanel.js";
import { OperatorWorkspaceDetailPanel } from "../components/OperatorWorkspaceDetailPanel.js";
import { OperatorWorkspaceEditorPanel } from "../components/OperatorWorkspaceEditorPanel.js";
import { OnboardingOverlay } from "../components/OnboardingOverlay.js";
import { demoAgents, demoEvents, demoTasks } from "../demo-data.js";
import { demoProposals } from "../evolution-model.js";
import { buildForwardRoute, type ForwardRoute } from "../forward-route.js";
import type { ForwardGraphModel } from "../forward-graph.js";
import type { LoadState } from "../hooks/use-operator-screen-data.js";
import type {
  ForwardBridgeConfig,
  ForwardContextLatestResponse,
  ForwardOperatorTaskRecord,
  ForwardReplayResponse,
  ForwardRoomTimelineResponse,
  ForwardStateDocsResponse,
  SavedTaskFilterPreset,
} from "../forward-bridge.js";
import type { OperatorSummaryViewModel } from "../operator-summary-model.js";
import type { OperatorWakeReadinessViewModel } from "../operator-wake-readiness-model.js";
import type { OperatorInboxItemViewModel } from "../operator-inbox-model.js";
import type { OperatorTaskReconcilePreviewViewModel } from "../operator-reconciler-model.js";
import type {
  OperatorTaskDetailViewModel,
  OperatorTaskListItemViewModel,
} from "../operator-tasks-model.js";
import type {
  OperatorWorkspaceDetailViewModel,
  OperatorWorkspaceListItemViewModel,
} from "../operator-workspaces-model.js";
import type {
  OperatorWorkspaceDraft,
  OperatorWorkspaceQuickStatusAction,
} from "../operator-workspace-actions.js";
import type {
  InsightCardViewModel,
  RoomOptionViewModel,
  RunDetailViewModel,
  RunListItemViewModel,
} from "../forward-view-model.js";

type DetailTab = "operations" | "intelligence" | "data";
type TaskBulkAction = "archive" | "restore";

interface TaskBulkReport {
  action: TaskBulkAction;
  targetScope: "selected" | "visible";
  attempted: number;
  succeeded: string[];
  failed: Array<{ taskId: string; error: string }>;
}

interface WorkspaceLinkedTaskItem {
  taskId: string;
  title: string;
  status: string;
  owner: string;
  archived: boolean;
}

export interface OperatorWorkbenchScreenProps {
  route: ForwardRoute;
  isDemo: boolean;
  config: ForwardBridgeConfig;
  showOnboarding: boolean;
  showConnectForm: boolean;
  setShowConnectForm: React.Dispatch<React.SetStateAction<boolean>>;
  draftConfig: ForwardBridgeConfig;
  setDraftConfig: React.Dispatch<React.SetStateAction<ForwardBridgeConfig>>;
  connect: (event: React.FormEvent) => void;

  // Task list / filters
  tasksState: LoadState;
  tasksError: string | null;
  taskItems: OperatorTaskListItemViewModel[];
  visibleTaskRecords: ForwardOperatorTaskRecord[];
  taskFilterStatus: string;
  setTaskFilterStatus: React.Dispatch<React.SetStateAction<string>>;
  taskFilterOwner: string;
  setTaskFilterOwner: React.Dispatch<React.SetStateAction<string>>;
  taskIncludeArchived: boolean;
  setTaskIncludeArchived: React.Dispatch<React.SetStateAction<boolean>>;
  taskFilterPresetName: string;
  setTaskFilterPresetName: React.Dispatch<React.SetStateAction<string>>;
  savedTaskFilterPresets: SavedTaskFilterPreset[];
  taskPresetState: LoadState;
  taskPresetError: string | null;
  handleSaveTaskFilterPreset: () => void;
  applySavedTaskFilterPreset: (preset: SavedTaskFilterPreset) => void;
  handleDeleteTaskFilterPreset: (presetId: string) => void;

  // Bulk lifecycle
  taskBulkState: LoadState;
  bulkArchivableTasks: ForwardOperatorTaskRecord[];
  bulkRestorableTasks: ForwardOperatorTaskRecord[];
  selectedVisibleTaskRecords: ForwardOperatorTaskRecord[];
  taskBulkArchiveRationale: string;
  setTaskBulkArchiveRationale: React.Dispatch<React.SetStateAction<string>>;
  taskBulkMessage: string | null;
  taskBulkError: string | null;
  taskBulkReport: TaskBulkReport | null;
  handleBulkTaskLifecycle: (action: TaskBulkAction) => Promise<void>;
  selectedTaskIds: string[];
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  replaceTaskSelection: (taskIds: string[]) => void;
  toggleTaskSelection: (taskId: string) => void;

  // Task navigation
  openTask: (taskId: string) => void;
  openWorkspace: (workspaceId: string) => void;
  openRun: (runId: string) => void;

  // Workspace list
  workspacesState: LoadState;
  workspacesError: string | null;
  workspaceItems: OperatorWorkspaceListItemViewModel[];

  // Run list
  runsState: LoadState;
  runsError: string | null;
  runItems: RunListItemViewModel[];

  // Detail header states
  overviewState: LoadState;
  inboxState: LoadState;
  taskDetailState: LoadState;
  workspaceDetailState: LoadState;
  detailState: LoadState;
  runDetail: RunDetailViewModel | null;

  // Overview
  overview: OperatorSummaryViewModel | null;
  overviewError: string | null;
  wakeReadiness: OperatorWakeReadinessViewModel | null;
  wakeReadinessState: LoadState;
  wakeReadinessError: string | null;

  // Inbox
  inboxItems: OperatorInboxItemViewModel[];
  inboxError: string | null;

  // Task detail
  taskDetail: OperatorTaskDetailViewModel | null;
  taskDetailError: string | null;
  taskMutationState: LoadState;
  taskMutationError: string | null;
  taskArchiveState: LoadState;
  taskArchiveError: string | null;
  taskArchiveRationale: string;
  setTaskArchiveRationale: React.Dispatch<React.SetStateAction<string>>;
  taskDeleteState: LoadState;
  taskDeleteError: string | null;
  taskApprovalRequestState: LoadState;
  taskApprovalRequestError: string | null;
  taskApprovalRationale: string;
  setTaskApprovalRationale: React.Dispatch<React.SetStateAction<string>>;
  taskChangedFields: string[];
  taskSensitiveFields: string[];
  taskApprovalHint: string | null;
  handleTaskQuickStatus: (status: string) => Promise<void>;
  handleTaskArchive: () => Promise<void>;
  handleTaskRestore: () => Promise<void>;
  handleTaskDelete: () => Promise<void>;
  handleTaskRequestApproval: () => Promise<void>;
  handleTaskSubmit: () => Promise<void>;

  // Task reconcile
  reconcilePreview: OperatorTaskReconcilePreviewViewModel | null;
  taskReconcileState: LoadState;
  taskReconcileError: string | null;

  // Task editor
  taskDraft: OperatorTaskDraft;
  setTaskDraft: React.Dispatch<React.SetStateAction<OperatorTaskDraft>>;
  workspaceOptions: OperatorTaskWorkspaceOption[];
  selectedDraftWorkspaceOption: OperatorTaskWorkspaceOption | null;
  linkedWorkspaceOption: OperatorTaskWorkspaceOption | null;
  unresolvedTaskWorkspaceRef: string | null;

  // Workspace detail
  workspaceDetail: OperatorWorkspaceDetailViewModel | null;
  workspaceDetailReady: boolean;
  workspaceDetailError: string | null;
  workspaceMutationState: LoadState;
  workspaceMutationError: string | null;
  workspaceQuickStatusActions: OperatorWorkspaceQuickStatusAction[];
  workspaceLinkedTaskItems: WorkspaceLinkedTaskItem[];
  workspaceLinkedTasksState: LoadState;
  workspaceLinkedTasksError: string | null;
  workspaceTaskActionState: LoadState;
  workspaceTaskActionError: string | null;
  workspaceTaskActionMessage: string | null;
  handleWorkspaceQuickStatus: (status: string) => Promise<void>;
  handleWorkspaceDetachTask: (taskId: string) => Promise<void>;
  handleWorkspaceArchiveTask: (taskId: string) => Promise<void>;
  handleWorkspaceSubmit: () => Promise<void>;

  // Workspace editor
  workspaceDraft: OperatorWorkspaceDraft;
  setWorkspaceDraft: React.Dispatch<React.SetStateAction<OperatorWorkspaceDraft>>;

  // Run detail
  detailError: string | null;
  detailTab: DetailTab;
  setDetailTab: React.Dispatch<React.SetStateAction<DetailTab>>;
  handleRunDetailTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  replay: ForwardReplayResponse | null;
  replayState: LoadState;
  replayError: string | null;
  stateDocs: ForwardStateDocsResponse | null;
  stateDocsState: LoadState;
  stateDocsError: string | null;
  contextLatest: ForwardContextLatestResponse | null;
  contextState: LoadState;
  contextError: string | null;
  roomTimeline: ForwardRoomTimelineResponse | null;
  roomState: LoadState;
  roomError: string | null;
  selectedRoomId: string | null;
  setSelectedRoomId: React.Dispatch<React.SetStateAction<string | null>>;
  roomOptions: RoomOptionViewModel[];
  taskRoomOptions: RoomOptionViewModel[];
  graphModel: ForwardGraphModel | null;
  insightCards: InsightCardViewModel[];
  findingsSummary: string;
  validatorCorrelations: string[];
}

export function OperatorWorkbenchScreen({
  route,
  isDemo,
  config,
  showOnboarding,
  showConnectForm,
  setShowConnectForm,
  draftConfig,
  setDraftConfig,
  connect,
  tasksState,
  tasksError,
  taskItems,
  visibleTaskRecords,
  taskFilterStatus,
  setTaskFilterStatus,
  taskFilterOwner,
  setTaskFilterOwner,
  taskIncludeArchived,
  setTaskIncludeArchived,
  taskFilterPresetName,
  setTaskFilterPresetName,
  savedTaskFilterPresets,
  taskPresetState,
  taskPresetError,
  handleSaveTaskFilterPreset,
  applySavedTaskFilterPreset,
  handleDeleteTaskFilterPreset,
  taskBulkState,
  bulkArchivableTasks,
  bulkRestorableTasks,
  selectedVisibleTaskRecords,
  taskBulkArchiveRationale,
  setTaskBulkArchiveRationale,
  taskBulkMessage,
  taskBulkError,
  taskBulkReport,
  handleBulkTaskLifecycle,
  selectedTaskIds,
  setSelectedTaskIds,
  replaceTaskSelection,
  toggleTaskSelection,
  openTask,
  openWorkspace,
  openRun,
  workspacesState,
  workspacesError,
  workspaceItems,
  runsState,
  runsError,
  runItems,
  overviewState,
  inboxState,
  taskDetailState,
  workspaceDetailState,
  detailState,
  runDetail,
  overview,
  overviewError,
  wakeReadiness,
  wakeReadinessState,
  wakeReadinessError,
  inboxItems,
  inboxError,
  taskDetail,
  taskDetailError,
  taskMutationState,
  taskMutationError,
  taskArchiveState,
  taskArchiveError,
  taskArchiveRationale,
  setTaskArchiveRationale,
  taskDeleteState,
  taskDeleteError,
  taskApprovalRequestState,
  taskApprovalRequestError,
  taskApprovalRationale,
  setTaskApprovalRationale,
  taskChangedFields,
  taskSensitiveFields,
  taskApprovalHint,
  handleTaskQuickStatus,
  handleTaskArchive,
  handleTaskRestore,
  handleTaskDelete,
  handleTaskRequestApproval,
  handleTaskSubmit,
  reconcilePreview,
  taskReconcileState,
  taskReconcileError,
  taskDraft,
  setTaskDraft,
  workspaceOptions,
  selectedDraftWorkspaceOption,
  linkedWorkspaceOption,
  unresolvedTaskWorkspaceRef,
  workspaceDetail,
  workspaceDetailReady,
  workspaceDetailError,
  workspaceMutationState,
  workspaceMutationError,
  workspaceQuickStatusActions,
  workspaceLinkedTaskItems,
  workspaceLinkedTasksState,
  workspaceLinkedTasksError,
  workspaceTaskActionState,
  workspaceTaskActionError,
  workspaceTaskActionMessage,
  handleWorkspaceQuickStatus,
  handleWorkspaceDetachTask,
  handleWorkspaceArchiveTask,
  handleWorkspaceSubmit,
  workspaceDraft,
  setWorkspaceDraft,
  detailError,
  detailTab,
  setDetailTab,
  handleRunDetailTabKeyDown,
  replay,
  replayState,
  replayError,
  stateDocs,
  stateDocsState,
  stateDocsError,
  contextLatest,
  contextState,
  contextError,
  roomTimeline,
  roomState,
  roomError,
  selectedRoomId,
  setSelectedRoomId,
  roomOptions,
  taskRoomOptions,
  graphModel,
  insightCards,
  findingsSummary,
  validatorCorrelations,
}: OperatorWorkbenchScreenProps) {
  return (
      <main className="forward-main">
        {showOnboarding ? <OnboardingOverlay /> : null}
        {isDemo ? (
          <div className="forward-demo-banner">
            <span>Demo mode — showing sample data. Connect to a live bridge to see real runs.</span>
            <button type="button" onClick={() => setShowConnectForm((v) => !v)}>
              {showConnectForm ? "Hide form" : "Connect to live bridge"}
            </button>
          </div>
        ) : null}
        {showConnectForm ? (
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
                <p className="forward-panel-label">
                  {route.screen === "tasks" || route.screen === "task-detail"
                    ? "Tasks"
                    : route.screen === "workspaces" || route.screen === "workspace-detail"
                      ? "Workspaces"
                      : "Execution"}
                </p>
                <h2>
                  {route.screen === "tasks" || route.screen === "task-detail"
                    ? "Operator task list"
                    : route.screen === "workspaces" || route.screen === "workspace-detail"
                      ? "Operator workspace list"
                      : "Forward run list"}
                </h2>
              </div>
              <span className={`forward-state state-${isDemo ? "ready" : route.screen === "tasks" || route.screen === "task-detail" ? tasksState : route.screen === "workspaces" || route.screen === "workspace-detail" ? workspacesState : runsState}`}>
                {isDemo ? "demo" : route.screen === "tasks" || route.screen === "task-detail" ? tasksState : route.screen === "workspaces" || route.screen === "workspace-detail" ? workspacesState : runsState}
              </span>
            </div>
            {route.screen === "tasks" || route.screen === "task-detail" ? (
              <>
                {!isDemo && tasksState === "idle" ? <p className="forward-empty">Connect to a live bridge to load operator tasks.</p> : null}
                {!isDemo && tasksState === "loading" ? <p className="forward-empty">Loading operator tasks...</p> : null}
                {!isDemo && tasksState === "error" ? <p className="forward-error">{tasksError}</p> : null}
                {!isDemo ? (
                  <>
                    <div className="forward-form">
                      <label>
                        <span>Status filter</span>
                        <select value={taskFilterStatus} onChange={(event) => setTaskFilterStatus(event.target.value)}>
                          {["all", "backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"].map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Owner filter</span>
                        <input
                          value={taskFilterOwner}
                          onChange={(event) => setTaskFilterOwner(event.target.value)}
                          placeholder="agent id"
                        />
                      </label>
                      <label>
                        <span>Archived</span>
                        <select
                          value={taskIncludeArchived ? "show" : "hide"}
                          onChange={(event) => setTaskIncludeArchived(event.target.value === "show")}
                        >
                          <option value="hide">Hide archived</option>
                          <option value="show">Show archived</option>
                        </select>
                      </label>
                    </div>
                    <section className="forward-section">
                      <div className="forward-section-header">
                        <div>
                          <p className="forward-panel-label">Saved filters</p>
                          <h3>Reuse task queue views</h3>
                        </div>
                        <span className={`forward-state state-${taskPresetState}`}>{taskPresetState}</span>
                      </div>
                      <div className="forward-form">
                        <label>
                          <span>Preset name</span>
                          <input
                            value={taskFilterPresetName}
                            onChange={(event) => setTaskFilterPresetName(event.target.value)}
                            placeholder="e.g. Review queue"
                          />
                        </label>
                      </div>
                      <div className="forward-approval-actions">
                        <button className="forward-chip-button" type="button" onClick={handleSaveTaskFilterPreset}>
                          Save current filter
                        </button>
                      </div>
                      {taskPresetError ? <p className="forward-error">{taskPresetError}</p> : null}
                      {savedTaskFilterPresets.length > 0 ? (
                        <ul className="forward-timeline">
                          {savedTaskFilterPresets.map((preset) => (
                            <li key={preset.id}>
                              <div className="forward-timeline-topline">
                                <strong>{preset.name}</strong>
                                <span>{preset.includeArchived ? "show archived" : "active only"}</span>
                              </div>
                              <p>{[preset.status, preset.ownerAgentId || "any owner"].join(" | ")}</p>
                              <div className="forward-approval-actions">
                                <button className="forward-chip-button" type="button" onClick={() => applySavedTaskFilterPreset(preset)}>
                                  Apply
                                </button>
                                <button className="forward-chip-button" type="button" onClick={() => handleDeleteTaskFilterPreset(preset.id)}>
                                  Delete
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="forward-help">No saved task filters yet.</p>
                      )}
                    </section>
                    <section className="forward-section">
                      <div className="forward-section-header">
                        <div>
                          <p className="forward-panel-label">Bulk lifecycle</p>
                          <h3>Act on the current filtered queue</h3>
                        </div>
                        <span className={`forward-state state-${taskBulkState}`}>{taskBulkState}</span>
                      </div>
                      <ul className="forward-timeline">
                        <li>
                          <div className="forward-timeline-topline">
                            <strong>Visible active tasks</strong>
                          </div>
                          <p>{bulkArchivableTasks.length}</p>
                        </li>
                        <li>
                          <div className="forward-timeline-topline">
                            <strong>Visible archived tasks</strong>
                          </div>
                          <p>{bulkRestorableTasks.length}</p>
                        </li>
                        <li>
                          <div className="forward-timeline-topline">
                            <strong>Selected tasks</strong>
                          </div>
                          <p>{selectedVisibleTaskRecords.length}</p>
                        </li>
                      </ul>
                      <div className="forward-approval-actions">
                        <button
                          className="forward-chip-button"
                          type="button"
                          onClick={() => replaceTaskSelection(visibleTaskRecords.map((task) => task.task_id))}
                        >
                          Select visible
                        </button>
                        <button
                          className="forward-chip-button"
                          type="button"
                          onClick={() => replaceTaskSelection(bulkArchivableTasks.map((task) => task.task_id))}
                        >
                          Select active
                        </button>
                        <button
                          className="forward-chip-button"
                          type="button"
                          onClick={() => replaceTaskSelection(bulkRestorableTasks.map((task) => task.task_id))}
                        >
                          Select archived
                        </button>
                        <button className="forward-chip-button" type="button" onClick={() => setSelectedTaskIds([])}>
                          Clear selection
                        </button>
                      </div>
                      <p className="forward-help">
                        Bulk actions target selected tasks first. If nothing is selected, they fall back to the current filtered queue.
                      </p>
                      {bulkArchivableTasks.length > 0 ? (
                        <label className="forward-approval-note">
                          <span>Bulk archive rationale</span>
                          <textarea
                            value={taskBulkArchiveRationale}
                            onChange={(event) => setTaskBulkArchiveRationale(event.target.value)}
                            rows={2}
                            placeholder="Explain why these filtered tasks should leave the active queue."
                          />
                        </label>
                      ) : null}
                      <div className="forward-approval-actions">
                        {bulkArchivableTasks.length > 0 ? (
                          <button className="forward-chip-button" type="button" onClick={() => handleBulkTaskLifecycle("archive")}>
                            Archive visible
                          </button>
                        ) : null}
                        {bulkRestorableTasks.length > 0 ? (
                          <button className="forward-chip-button" type="button" onClick={() => handleBulkTaskLifecycle("restore")}>
                            Restore visible
                          </button>
                        ) : null}
                      </div>
                      {taskBulkMessage ? <p className="forward-help">{taskBulkMessage}</p> : null}
                      {taskBulkError ? <p className="forward-error">{taskBulkError}</p> : null}
                      {taskBulkReport ? (
                        <ul className="forward-timeline">
                          <li>
                            <div className="forward-timeline-topline">
                              <strong>Latest bulk report</strong>
                              <span>{taskBulkReport.targetScope}</span>
                            </div>
                            <p>
                              {taskBulkReport.action} attempted {taskBulkReport.attempted} | success {taskBulkReport.succeeded.length} | failed {taskBulkReport.failed.length}
                            </p>
                          </li>
                          {taskBulkReport.succeeded.length > 0 ? (
                            <li>
                              <div className="forward-timeline-topline">
                                <strong>Succeeded</strong>
                              </div>
                              <p>{taskBulkReport.succeeded.join(" | ")}</p>
                            </li>
                          ) : null}
                          {taskBulkReport.failed.length > 0 ? (
                            <li>
                              <div className="forward-timeline-topline">
                                <strong>Failed</strong>
                              </div>
                              <p>{taskBulkReport.failed.map((failure) => `${failure.taskId}: ${failure.error}`).join(" | ")}</p>
                            </li>
                          ) : null}
                        </ul>
                      ) : null}
                    </section>
                  </>
                ) : null}
                {((isDemo && demoTasks.length === 0) || (!isDemo && tasksState === "ready" && taskItems.length === 0)) ? (
                  <p className="forward-empty">No operator tasks yet.</p>
                ) : null}
                <div className="forward-run-list">
                  {(isDemo
                    ? demoTasks.map((task) => ({
                        taskId: task.taskId,
                        title: task.taskId,
                        status: task.state,
                        subtitle: task.assignee,
                        metrics: [task.assignee, task.state],
                      }))
                    : taskItems
                  ).map((item) => (
                    <div key={item.taskId} className="forward-run-row" role="group" aria-label={`Task ${item.title}`}>
                      {!isDemo ? (
                        <label className="forward-task-select">
                          <input
                            type="checkbox"
                            aria-label={`Select task ${item.title}`}
                            checked={selectedTaskIds.includes(item.taskId)}
                            onChange={() => toggleTaskSelection(item.taskId)}
                          />
                          <span>Select</span>
                        </label>
                      ) : null}
                      <button
                        className={`forward-run-item${route.taskId === item.taskId ? " active" : ""}${item.status === "in_progress" ? " running" : ""}`}
                        type="button"
                        onClick={() => openTask(item.taskId)}
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
                    </div>
                  ))}
                </div>
              </>
            ) : route.screen === "workspaces" || route.screen === "workspace-detail" ? (
              <>
                {!isDemo && workspacesState === "idle" ? <p className="forward-empty">Connect to a live bridge to load operator workspaces.</p> : null}
                {!isDemo && workspacesState === "loading" ? <p className="forward-empty">Loading operator workspaces...</p> : null}
                {!isDemo && workspacesState === "error" ? <p className="forward-error">{workspacesError}</p> : null}
                {!isDemo && workspacesState === "ready" && workspaceItems.length === 0 ? (
                  <p className="forward-empty">No operator workspaces yet.</p>
                ) : null}
                <div className="forward-run-list">
                  {(isDemo
                    ? [
                        {
                          workspaceId: "demo-workspace",
                          label: "Demo workspace",
                          status: "active",
                          subtitle: "sample-agent | repo | active",
                          metrics: ["packages/dashboard", "run demo-run-001", "1 task refs"],
                        },
                      ]
                    : workspaceItems
                  ).map((item) => {
                    const isWorkspaceSelected =
                      route.workspaceId === item.workspaceId || (isDemo && item.workspaceId === "demo-workspace");
                    return (
                      <button
                        key={item.workspaceId}
                        type="button"
                        className={`forward-run-item${isWorkspaceSelected ? " active" : ""}`}
                        aria-pressed={isWorkspaceSelected}
                        onClick={() => openWorkspace(item.workspaceId)}
                      >
                        <div className="forward-run-topline">
                          <strong>{item.label}</strong>
                          <span>{item.status}</span>
                        </div>
                        <p>{item.subtitle}</p>
                        <div className="forward-metric-row">
                          {item.metrics.map((metric) => (
                            <span key={metric}>{metric}</span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : isDemo ? (
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
                <h2>
                  {route.screen === "overview"
                    ? "Operator overview"
                    : route.screen === "inbox"
                      ? "Operator inbox"
                    : route.screen === "tasks" || route.screen === "task-detail"
                      ? "Operator task detail"
                      : route.screen === "workspaces" || route.screen === "workspace-detail"
                        ? "Operator workspace detail"
                      : isDemo
                        ? demoTasks[0]?.taskId ?? "Demo run"
                        : runDetail
                          ? runDetail.title
                          : "Select a run"}
                </h2>
              </div>
              <span className={`forward-state state-${isDemo ? "ready" : route.screen === "overview" ? overviewState : route.screen === "inbox" ? inboxState : route.screen === "tasks" ? tasksState : route.screen === "task-detail" ? taskDetailState : route.screen === "workspaces" ? workspacesState : route.screen === "workspace-detail" ? workspaceDetailState : detailState}`}>
                {isDemo ? "demo" : route.screen === "overview" ? overviewState : route.screen === "inbox" ? inboxState : route.screen === "tasks" ? tasksState : route.screen === "task-detail" ? taskDetailState : route.screen === "workspaces" ? workspacesState : route.screen === "workspace-detail" ? workspaceDetailState : detailState}
              </span>
            </div>
            {route.screen === "overview" ? (
              <>
                <OperatorSummaryPanel
                  summary={
                    isDemo
                      ? {
                          postureLabel: "demo",
                          latestRunLabel: "demo-run-001 | active",
                          metrics: [
                            { id: "demo-runs", label: "Active runs", value: "1", detail: `${demoTasks.length} demo tasks visible` },
                            { id: "demo-approvals", label: "Pending approvals", value: String(demoProposals.length), detail: "Demo proposal queue is standing in for operator attention." },
                            { id: "demo-rooms", label: "Active rooms", value: "6", detail: `${demoAgents.length} agents distributed across the office lens` },
                            { id: "demo-events", label: "Failing runs", value: "0", detail: `${demoEvents.length} demo events in the current feed` },
                            { id: "demo-handoffs", label: "Open handoffs", value: "2", detail: "Sample coordination load from the office demo." },
                          ],
                          attention: [
                            {
                              id: "demo-attention",
                              tone: "info",
                              title: "Demo mode is showing sample operator posture",
                              detail: "Connect to a live forward bridge to replace these sample signals with real runtime projections.",
                            },
                          ],
                          evidence: null,
                          doctor: null,
                          runtimeRoster: null,
                        }
                      : overview
                  }
                  state={isDemo ? "ready" : overviewState}
                  error={overviewError}
                />
                <OperatorWakeReadinessPanel
                  readiness={isDemo ? null : wakeReadiness}
                  state={isDemo ? "idle" : wakeReadinessState}
                  error={wakeReadinessError}
                />
              </>
            ) : route.screen === "inbox" ? (
              <OperatorInboxPanel
                items={
                  isDemo
                    ? [
                        {
                          id: "demo-approval",
                          tone: "warning",
                          title: "Review proposal queue before resuming the run",
                          detail: "The demo proposal queue is standing in for pending operator approvals.",
                          meta: "demo-run-001 | review-room",
                          actionLabel: "Inspect run",
                          targetHash: "#/runs/demo-run-001",
                        },
                        {
                          id: "demo-validation",
                          tone: "danger",
                          title: "Replay evidence needs a validator pass",
                          detail: "Sample failure lane for the demo shell. Connect a live bridge to replace this with real validator output.",
                          meta: "demo-run-001 | iter-1",
                          actionLabel: "Inspect run",
                          targetHash: "#/runs/demo-run-001",
                        },
                      ]
                    : inboxItems
                }
                state={isDemo ? "ready" : inboxState}
                error={inboxError}
              />
            ) : route.screen === "tasks" || route.screen === "task-detail" ? (
              <>
                <OperatorTaskDetailPanel
                  task={
                    isDemo
                      ? {
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
                            { label: "Run", value: "demo-run-001" },
                            { label: "Iteration", value: "iter-1" },
                            { label: "Rooms", value: "1" },
                            { label: "Workspace", value: "none" },
                          ],
                          prCiEvidence: {
                            posture: "ok",
                            metrics: [
                              { label: "PRs", value: "0" },
                              { label: "CI", value: "0" },
                              { label: "Failing", value: "0" },
                              { label: "Pending", value: "0" },
                            ],
                            suggestions: ["Connect a live bridge to show task-linked PR and CI evidence."],
                            privacyNote: "Demo mode does not fetch external PR or CI data.",
                            items: [],
                          },
                        }
                      : taskDetail
                  }
                  state={isDemo ? "ready" : route.screen === "tasks" ? tasksState : taskDetailState}
                  error={taskDetailError}
                  mutationState={isDemo ? "ready" : taskMutationState}
                  mutationError={taskMutationError}
                  onQuickStatus={!isDemo && route.screen === "task-detail" && !taskDetail?.archivedAt ? handleTaskQuickStatus : undefined}
                  archiveState={isDemo ? "ready" : taskArchiveState}
                  archiveError={taskArchiveError}
                  onArchive={!isDemo && route.screen === "task-detail" && !taskDetail?.archivedAt ? handleTaskArchive : undefined}
                  onRestore={!isDemo && route.screen === "task-detail" && Boolean(taskDetail?.archivedAt) ? handleTaskRestore : undefined}
                  archiveRationale={taskArchiveRationale}
                  onArchiveRationaleChange={setTaskArchiveRationale}
                  deleteState={isDemo ? "ready" : taskDeleteState}
                  deleteError={taskDeleteError}
                  onDelete={!isDemo && route.screen === "task-detail" && Boolean(taskDetail?.archivedAt) ? handleTaskDelete : undefined}
                  approvalRequestState={isDemo ? "ready" : taskApprovalRequestState}
                  approvalRequestError={taskApprovalRequestError}
                  onRequestApproval={!isDemo && route.screen === "task-detail" && !taskDetail?.archivedAt ? handleTaskRequestApproval : undefined}
                  approvalRationale={taskApprovalRationale}
                  onApprovalRationaleChange={setTaskApprovalRationale}
                  approvalRequestedChanges={taskChangedFields}
                />
                {route.screen === "task-detail" ? (
                  <OperatorTaskReconcilePreviewPanel
                    preview={
                      isDemo
                          ? {
                            taskId: "demo-task",
                            decisionId: "demo-reconcile-preview",
                            generatedAt: "demo",
                            currentStatus: "todo",
                            recommendedStatus: "in review",
                            confidence: "medium",
                            tone: "info",
                            summary: "Demo preview: live reconcile decisions appear here when connected to a forward bridge.",
                            requiresApproval: false,
                            blockers: [],
                            suggestedActions: ["Connect a live bridge to replace this sample with projected task evidence."],
                            evidenceRefs: ["demo:operator-task"],
                          }
                        : reconcilePreview
                    }
                    state={isDemo ? "ready" : taskReconcileState}
                    error={taskReconcileError}
                  />
                ) : null}
                {!isDemo && (route.screen !== "task-detail" || !taskDetail?.archivedAt) ? (
                  <OperatorTaskEditorPanel
                    mode={route.screen === "task-detail" ? "edit" : "create"}
                    draft={taskDraft}
                    state={taskMutationState}
                    error={taskMutationError}
                    workspaceOptions={workspaceOptions}
                    selectedWorkspaceOption={selectedDraftWorkspaceOption}
                    changePreview={route.screen === "task-detail" ? taskChangedFields : []}
                    sensitiveChangePreview={route.screen === "task-detail" ? taskSensitiveFields : []}
                    approvalHint={route.screen === "task-detail" ? taskApprovalHint : null}
                    onChange={setTaskDraft}
                    onSubmit={handleTaskSubmit}
                  />
                ) : !isDemo && route.screen === "task-detail" ? (
                  <section className="forward-section">
                    <div className="forward-section-header">
                      <div>
                        <p className="forward-panel-label">Task editor</p>
                        <h3>Archived task is read-only</h3>
                      </div>
                    </div>
                    <p className="forward-help">
                      Restore this task before editing fields or requesting a new approval from the task shell.
                    </p>
                  </section>
                ) : null}
                {!isDemo && route.screen === "task-detail" && linkedWorkspaceOption ? (
                  <section className="forward-section">
                    <div className="forward-section-header">
                      <div>
                        <p className="forward-panel-label">Canonical workspace</p>
                        <h3>Workspace linkage</h3>
                      </div>
                    </div>
                    <div className="forward-approval-actions">
                      <a
                        className="forward-chip-button active"
                        href={buildForwardRoute({
                          screen: "workspace-detail",
                          runId: null,
                          taskId: null,
                          workspaceId: linkedWorkspaceOption.id,
                          threadId: null,
                          agentId: null,
                        })}
                      >
                        Open workspace
                      </a>
                    </div>
                  </section>
                ) : !isDemo && route.screen === "task-detail" && unresolvedTaskWorkspaceRef ? (
                  <section className="forward-section">
                    <div className="forward-section-header">
                      <div>
                        <p className="forward-panel-label">Canonical workspace</p>
                        <h3>Workspace linkage unresolved</h3>
                      </div>
                    </div>
                    <p className="forward-help">
                      This task still references a workspace id that is not present in the canonical workspace registry.
                    </p>
                    {workspaceOptions.filter((option) => !option.unresolved).length > 0 ? (
                      <>
                        <div className="forward-approval-actions">
                          {workspaceOptions
                            .filter((option) => !option.unresolved)
                            .slice(0, 4)
                            .map((option) => (
                              <button
                                key={option.id}
                                className={`forward-chip-button${taskDraft.workspaceRef === option.id ? " active" : ""}`}
                                type="button"
                                onClick={() => setTaskDraft((current) => ({ ...current, workspaceRef: option.id }))}
                              >
                                Use {option.label}
                              </button>
                            ))}
                        </div>
                        {selectedDraftWorkspaceOption && !selectedDraftWorkspaceOption.unresolved && taskDraft.workspaceRef !== unresolvedTaskWorkspaceRef ? (
                          <div className="forward-approval-actions">
                            <button className="approve-button" type="button" onClick={handleTaskSubmit}>
                              Save workspace migration
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="forward-help">Create a canonical workspace first, then come back to resolve this ref.</p>
                    )}
                  </section>
                ) : null}
                {route.screen === "task-detail" ? (
                  isDemo ? (
                    <>
                      <section className="forward-section">
                        <div className="forward-section-header">
                          <div>
                            <p className="forward-panel-label">Linked execution</p>
                            <h3>Execution trace linkage</h3>
                          </div>
                        </div>
                        <ul className="forward-timeline">
                          <li>
                            <div className="forward-timeline-topline">
                              <strong>Linked run</strong>
                              <span>demo</span>
                            </div>
                            <p>demo-run-001 | replay and approvals would render here when connected to a live bridge.</p>
                          </li>
                        </ul>
                      </section>
                    </>
                  ) : taskDetail?.linkedRunId ? (
                    <>
                      <section className="forward-section">
                        <div className="forward-section-header">
                          <div>
                            <p className="forward-panel-label">Linked execution</p>
                            <h3>Execution trace linkage</h3>
                          </div>
                        </div>
                        <ul className="forward-timeline">
                          <li>
                            <div className="forward-timeline-topline">
                              <strong>Linked run</strong>
                              <span>{taskDetail.linkedRunId}</span>
                            </div>
                            <p>
                              {taskDetail.linkedIterationId
                                ? `Linked iteration ${taskDetail.linkedIterationId}`
                                : "No linked iteration recorded."}
                            </p>
                          </li>
                        </ul>
                      </section>
                      <ForwardApprovalCenterPanel
                        config={config}
                        runId={taskDetail.linkedRunId}
                        taskId={taskDetail.taskId}
                        heading="Task approvals"
                      />
                      <ForwardReplayPanel replay={replay} state={replayState} error={replayError} />
                      <ForwardStateDocsPanel stateDocs={stateDocs} state={stateDocsState} error={stateDocsError} />
                      <ForwardContextPanel contextLatest={contextLatest} state={contextState} error={contextError} />
                      <ForwardRoomPanel
                        roomOptions={taskRoomOptions}
                        selectedRoomId={selectedRoomId}
                        onSelectRoom={setSelectedRoomId}
                        roomTimeline={roomTimeline}
                        state={roomState}
                        error={roomError}
                      />
                    </>
                  ) : (
                    <section className="forward-section">
                      <div className="forward-section-header">
                        <div>
                          <p className="forward-panel-label">Linked execution</p>
                          <h3>No execution trace linked</h3>
                        </div>
                      </div>
                      <p className="forward-empty">This operator task has no linked run yet.</p>
                    </section>
                  )
                ) : null}
              </>
            ) : route.screen === "workspaces" || route.screen === "workspace-detail" ? (
              <>
                <OperatorWorkspaceDetailPanel
                  workspace={
                    isDemo
                      ? {
                          workspaceId: "demo-workspace",
                          label: "Demo workspace",
                          path: "packages/dashboard",
                          kind: "repo",
                          status: "active",
                          owner: "sample-agent",
                          archivedAt: null,
                          archivedBy: null,
                          archiveNote: null,
                          linkedRunId: "demo-run-001",
                          linkedIterationId: "iter-1",
                          taskIds: ["demo-task"],
                          notes: "Sample canonical workspace record for the demo shell.",
                          stats: [
                            { label: "Kind", value: "repo" },
                            { label: "Status", value: "active" },
                            { label: "Run", value: "demo-run-001" },
                            { label: "Iteration", value: "iter-1" },
                            { label: "Tasks", value: "1" },
                          ],
                        }
                      : workspaceDetailReady
                        ? workspaceDetail
                        : null
                  }
                  state={isDemo ? "ready" : route.screen === "workspaces" ? workspacesState : workspaceDetailState}
                  error={route.screen === "workspaces" ? workspacesError : workspaceDetailError}
                  mutationState={isDemo ? "ready" : workspaceMutationState}
                  mutationError={workspaceMutationError}
                  onQuickStatus={!isDemo && workspaceDetailReady ? handleWorkspaceQuickStatus : undefined}
                  quickStatusActions={!isDemo && workspaceDetailReady ? workspaceQuickStatusActions : undefined}
                  linkedTasks={isDemo ? [] : workspaceLinkedTaskItems}
                  linkedTasksState={isDemo ? "ready" : workspaceLinkedTasksState}
                  linkedTasksError={workspaceLinkedTasksError}
                  taskActionState={isDemo ? "ready" : workspaceTaskActionState}
                  taskActionError={workspaceTaskActionError}
                  taskActionMessage={workspaceTaskActionMessage}
                  onOpenTask={!isDemo ? openTask : undefined}
                  onDetachTask={!isDemo && workspaceDetailReady ? handleWorkspaceDetachTask : undefined}
                  onArchiveTask={!isDemo && workspaceDetailReady ? handleWorkspaceArchiveTask : undefined}
                />
                {!isDemo && (route.screen === "workspaces" || (workspaceDetailReady && workspaceDetail?.status !== "archived")) ? (
                  <OperatorWorkspaceEditorPanel
                    mode={route.screen === "workspace-detail" ? "edit" : "create"}
                    draft={workspaceDraft}
                    state={workspaceMutationState}
                    error={workspaceMutationError}
                    onChange={setWorkspaceDraft}
                    onSubmit={handleWorkspaceSubmit}
                  />
                ) : !isDemo && workspaceDetailReady && route.screen === "workspace-detail" ? (
                  <section className="forward-section">
                    <div className="forward-section-header">
                      <div>
                        <p className="forward-panel-label">Workspace editor</p>
                        <h3>Archived workspace is read-only</h3>
                      </div>
                    </div>
                    <p className="forward-help">
                      Reactivate this workspace before editing its fields or reassigning ownership.
                    </p>
                  </section>
                ) : null}
              </>
            ) : isDemo ? (
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
            {!isDemo && route.screen !== "run-detail" && route.screen !== "overview" && route.screen !== "inbox" && route.screen !== "tasks" && route.screen !== "task-detail" && route.screen !== "workspaces" && route.screen !== "workspace-detail" ? (
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
                  <div className="forward-tab-bar" role="tablist" aria-label="Run detail sections">
                    {(["operations", "intelligence", "data"] as const).map((tab) => (
                      <button
                        key={tab}
                        className={`forward-tab${detailTab === tab ? " active" : ""}`}
                        type="button"
                        role="tab"
                        id={`run-detail-tab-${tab}`}
                        aria-selected={detailTab === tab}
                        aria-controls={`run-detail-panel-${tab}`}
                        tabIndex={detailTab === tab ? 0 : -1}
                        onClick={() => setDetailTab(tab)}
                        onKeyDown={handleRunDetailTabKeyDown}
                      >
                        {tab === "operations" ? "Operations" : tab === "intelligence" ? "Intelligence" : "Data"}
                      </button>
                    ))}
                  </div>
                  {detailTab === "operations" && (
                    <div role="tabpanel" id="run-detail-panel-operations" aria-labelledby="run-detail-tab-operations">
                      <ForwardApprovalCenterPanel config={config} runId={runDetail.runId} />
                      <ForwardReplayPanel replay={replay} state={replayState} error={replayError} />
                    </div>
                  )}
                  {detailTab === "intelligence" && (
                    <div role="tabpanel" id="run-detail-panel-intelligence" aria-labelledby="run-detail-tab-intelligence">
                      <ForwardGraphPanel model={graphModel} />
                      <ForwardInsightsPanel
                        insights={insightCards}
                        findingsSummary={findingsSummary}
                        validatorCorrelations={validatorCorrelations}
                      />
                    </div>
                  )}
                  {detailTab === "data" && (
                    <div role="tabpanel" id="run-detail-panel-data" aria-labelledby="run-detail-tab-data">
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
                  )}
                </div>
              </ErrorBoundary>
            ) : null}
          </section>
        </section>
      </main>
  );
}
