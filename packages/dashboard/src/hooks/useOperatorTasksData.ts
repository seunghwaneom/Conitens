import { useEffect } from "react";
import {
  forwardGetOperatorTask,
  forwardGetOperatorTasks,
  forwardGetOperatorWorkspaces,
  type ForwardBridgeConfig,
} from "../forward-bridge.js";
import { useTasksStore } from "../store/tasks-store.js";
import { useUiStore } from "../store/ui-store.js";
import { createOperatorTaskActions } from "./createOperatorTaskActions.js";
import { useOperatorTaskDerived } from "./useOperatorTaskDerived.js";

const EMPTY_DRAFT = {
  title: "",
  objective: "",
  status: "todo",
  priority: "medium",
  ownerAgentId: "",
  linkedRunId: "",
  linkedIterationId: "",
  linkedRoomIds: "",
  blockedReason: "",
  acceptance: "",
  workspaceRef: "",
};

export function useOperatorTasksData(config: ForwardBridgeConfig, revision: number) {
  const route = useUiStore((state) => state.route);
  const enabled = Boolean(config.token.trim());

  const store = useTasksStore(
    (state) => ({
      operatorTasks: state.operatorTasks,
      tasksState: state.tasksState,
      tasksError: state.tasksError,
      selectedTask: state.selectedTask,
      taskDetailState: state.taskDetailState,
      taskDetailError: state.taskDetailError,
      taskMutationState: state.taskMutationState,
      taskMutationError: state.taskMutationError,
      taskArchiveState: state.taskArchiveState,
      taskArchiveError: state.taskArchiveError,
      taskDeleteState: state.taskDeleteState,
      taskDeleteError: state.taskDeleteError,
      taskApprovalRequestState: state.taskApprovalRequestState,
      taskApprovalRequestError: state.taskApprovalRequestError,
      taskPresetState: state.taskPresetState,
      taskPresetError: state.taskPresetError,
      taskBulkState: state.taskBulkState,
      taskBulkError: state.taskBulkError,
      taskBulkMessage: state.taskBulkMessage,
      taskBulkReport: state.taskBulkReport,
      selectedTaskIds: state.selectedTaskIds,
      taskFilterStatus: state.taskFilterStatus,
      taskFilterOwner: state.taskFilterOwner,
      taskIncludeArchived: state.taskIncludeArchived,
      savedTaskFilterPresets: state.savedTaskFilterPresets,
      taskFilterPresetName: state.taskFilterPresetName,
      taskArchiveRationale: state.taskArchiveRationale,
      taskBulkArchiveRationale: state.taskBulkArchiveRationale,
      taskApprovalRationale: state.taskApprovalRationale,
      taskDraft: state.taskDraft,
      operatorWorkspaces: state.operatorWorkspaces,
      setOperatorTasks: state.setOperatorTasks,
      setTasksState: state.setTasksState,
      setTasksError: state.setTasksError,
      setSelectedTask: state.setSelectedTask,
      setTaskDetailState: state.setTaskDetailState,
      setTaskDetailError: state.setTaskDetailError,
      setTaskMutationState: state.setTaskMutationState,
      setTaskMutationError: state.setTaskMutationError,
      setTaskArchiveState: state.setTaskArchiveState,
      setTaskArchiveError: state.setTaskArchiveError,
      setTaskDeleteState: state.setTaskDeleteState,
      setTaskDeleteError: state.setTaskDeleteError,
      setTaskApprovalRequestState: state.setTaskApprovalRequestState,
      setTaskApprovalRequestError: state.setTaskApprovalRequestError,
      setTaskPresetState: state.setTaskPresetState,
      setTaskPresetError: state.setTaskPresetError,
      setTaskBulkState: state.setTaskBulkState,
      setTaskBulkError: state.setTaskBulkError,
      setTaskBulkMessage: state.setTaskBulkMessage,
      setTaskBulkReport: state.setTaskBulkReport,
      setSelectedTaskIds: state.setSelectedTaskIds,
      setTaskFilterStatus: state.setTaskFilterStatus,
      setTaskFilterOwner: state.setTaskFilterOwner,
      setTaskIncludeArchived: state.setTaskIncludeArchived,
      setSavedTaskFilterPresets: state.setSavedTaskFilterPresets,
      setTaskFilterPresetName: state.setTaskFilterPresetName,
      setTaskArchiveRationale: state.setTaskArchiveRationale,
      setTaskBulkArchiveRationale: state.setTaskBulkArchiveRationale,
      setTaskApprovalRationale: state.setTaskApprovalRationale,
      setTaskDraft: state.setTaskDraft,
      setOperatorWorkspaces: state.setOperatorWorkspaces,
      persistFilters: state.persistFilters,
    }),
  );

  const derived = useOperatorTaskDerived({
    operatorTasks: store.operatorTasks,
    selectedTask: store.selectedTask,
    operatorWorkspaces: store.operatorWorkspaces,
    taskDraft: store.taskDraft,
    selectedTaskIds: store.selectedTaskIds,
  });

  useEffect(() => {
    if (!enabled) {
      store.setOperatorTasks(null);
      store.setTasksState("idle");
      store.setTasksError(null);
      return;
    }

    let cancelled = false;
    store.setTasksState("loading");
    store.setTasksError(null);
    forwardGetOperatorTasks(config, {
      status: store.taskFilterStatus !== "all" ? store.taskFilterStatus : undefined,
      ownerAgentId: store.taskFilterOwner.trim() || undefined,
      includeArchived: store.taskIncludeArchived,
    })
      .then((payload) => {
        if (cancelled) return;
        store.setOperatorTasks(payload);
        store.setTasksState("ready");
      })
      .catch((error: Error) => {
        if (cancelled) return;
        store.setOperatorTasks(null);
        store.setTasksState("error");
        store.setTasksError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [
    config,
    enabled,
    revision,
    store.taskFilterOwner,
    store.taskFilterStatus,
    store.taskIncludeArchived,
    store.setOperatorTasks,
    store.setTasksError,
    store.setTasksState,
  ]);

  useEffect(() => {
    if (!enabled || route.screen !== "task-detail" || !route.taskId) {
      store.setSelectedTask(null);
      store.setTaskDetailState("idle");
      store.setTaskDetailError(null);
      return;
    }

    let cancelled = false;
    store.setTaskDetailState("loading");
    store.setTaskDetailError(null);
    forwardGetOperatorTask(config, route.taskId)
      .then((payload) => {
        if (cancelled) return;
        store.setSelectedTask(payload);
        store.setTaskDetailState("ready");
      })
      .catch((error: Error) => {
        if (cancelled) return;
        store.setSelectedTask(null);
        store.setTaskDetailState("error");
        store.setTaskDetailError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [
    config,
    enabled,
    revision,
    route.screen,
    route.taskId,
    store.setSelectedTask,
    store.setTaskDetailError,
    store.setTaskDetailState,
  ]);

  useEffect(() => {
    if (!enabled) {
      store.setOperatorWorkspaces(null);
      return;
    }

    let cancelled = false;
    forwardGetOperatorWorkspaces(config)
      .then((payload) => {
        if (cancelled) return;
        store.setOperatorWorkspaces(payload);
      })
      .catch(() => {
        if (cancelled) return;
        store.setOperatorWorkspaces(null);
      });

    return () => {
      cancelled = true;
    };
  }, [config, enabled, revision, store.setOperatorWorkspaces]);

  useEffect(() => {
    store.persistFilters();
  }, [store.persistFilters, store.taskFilterStatus, store.taskFilterOwner, store.taskIncludeArchived]);

  useEffect(() => {
    const visibleIds = new Set(derived.visibleTaskRecords.map((task) => task.task_id));
    const nextSelection = store.selectedTaskIds.filter((taskId) => visibleIds.has(taskId));
    const changed =
      nextSelection.length !== store.selectedTaskIds.length ||
      nextSelection.some((taskId, index) => taskId !== store.selectedTaskIds[index]);

    if (changed) {
      store.setSelectedTaskIds(nextSelection);
    }
  }, [derived.visibleTaskRecords, store.selectedTaskIds, store.setSelectedTaskIds]);

  useEffect(() => {
    if (route.screen === "task-detail" && derived.taskDetail) {
      store.setTaskDraft({
        title: derived.taskDetail.title,
        objective: derived.taskDetail.objective,
        status: derived.taskDetail.status,
        priority:
          derived.taskDetail.stats.find((item) => item.label === "Priority")?.value ?? "medium",
        ownerAgentId: derived.taskDetail.owner === "unassigned" ? "" : derived.taskDetail.owner,
        linkedRunId: derived.taskDetail.linkedRunId ?? "",
        linkedIterationId: derived.taskDetail.linkedIterationId ?? "",
        linkedRoomIds: derived.taskDetail.linkedRoomIds.join(", "),
        blockedReason: derived.taskDetail.blockedReason ?? "",
        acceptance: derived.taskDetail.acceptance.join("\n"),
        workspaceRef:
          derived.taskDetail.stats.find((item) => item.label === "Workspace")?.value === "none"
            ? ""
            : (derived.taskDetail.stats.find((item) => item.label === "Workspace")?.value ?? ""),
      });
      store.setTaskArchiveRationale(derived.taskDetail.archiveNote ?? "");
      store.setTaskMutationState("idle");
      store.setTaskMutationError(null);
      store.setTaskArchiveState("idle");
      store.setTaskArchiveError(null);
      store.setTaskDeleteState("idle");
      store.setTaskDeleteError(null);
      store.setTaskApprovalRequestState("idle");
      store.setTaskApprovalRequestError(null);
      return;
    }

    if (route.screen === "tasks") {
      store.setTaskDraft(EMPTY_DRAFT);
      store.setTaskArchiveRationale("");
      store.setTaskMutationState("idle");
      store.setTaskMutationError(null);
    }
  }, [
    derived.taskDetail,
    route.screen,
    store.setTaskApprovalRequestError,
    store.setTaskApprovalRequestState,
    store.setTaskArchiveError,
    store.setTaskArchiveRationale,
    store.setTaskArchiveState,
    store.setTaskDeleteError,
    store.setTaskDeleteState,
    store.setTaskDraft,
    store.setTaskMutationError,
    store.setTaskMutationState,
  ]);

  const actions = createOperatorTaskActions({
    config,
    enabled,
    route,
    taskFilterStatus: store.taskFilterStatus,
    taskFilterOwner: store.taskFilterOwner,
    taskIncludeArchived: store.taskIncludeArchived,
    savedTaskFilterPresets: store.savedTaskFilterPresets,
    taskFilterPresetName: store.taskFilterPresetName,
    taskBulkArchiveRationale: store.taskBulkArchiveRationale,
    taskApprovalRationale: store.taskApprovalRationale,
    taskDraft: store.taskDraft,
    selectedTaskIds: store.selectedTaskIds,
    visibleTaskRecords: derived.visibleTaskRecords,
    selectedVisibleTaskRecords: derived.selectedVisibleTaskRecords,
    taskArchiveRationale: store.taskArchiveRationale,
    approvalRequestedChanges: derived.approvalRequestedChanges,
    setOperatorTasks: store.setOperatorTasks,
    setSelectedTask: store.setSelectedTask,
    setTaskPresetState: store.setTaskPresetState,
    setTaskPresetError: store.setTaskPresetError,
    setSavedTaskFilterPresets: store.setSavedTaskFilterPresets,
    setTaskFilterPresetName: store.setTaskFilterPresetName,
    setTaskFilterStatus: store.setTaskFilterStatus,
    setTaskFilterOwner: store.setTaskFilterOwner,
    setTaskIncludeArchived: store.setTaskIncludeArchived,
    setSelectedTaskIds: store.setSelectedTaskIds,
    setTaskBulkState: store.setTaskBulkState,
    setTaskBulkError: store.setTaskBulkError,
    setTaskBulkMessage: store.setTaskBulkMessage,
    setTaskBulkReport: store.setTaskBulkReport,
    setTaskMutationState: store.setTaskMutationState,
    setTaskMutationError: store.setTaskMutationError,
    setTaskArchiveState: store.setTaskArchiveState,
    setTaskArchiveError: store.setTaskArchiveError,
    setTaskDeleteState: store.setTaskDeleteState,
    setTaskDeleteError: store.setTaskDeleteError,
    setTaskApprovalRequestState: store.setTaskApprovalRequestState,
    setTaskApprovalRequestError: store.setTaskApprovalRequestError,
    setTaskDraft: store.setTaskDraft,
  });

  return {
    taskItems: derived.taskItems,
    taskDetail: derived.taskDetail,
    tasksState: store.tasksState,
    tasksError: store.tasksError,
    taskDetailState: store.taskDetailState,
    taskDetailError: store.taskDetailError,
    taskMutationState: store.taskMutationState,
    taskMutationError: store.taskMutationError,
    taskArchiveState: store.taskArchiveState,
    taskArchiveError: store.taskArchiveError,
    taskDeleteState: store.taskDeleteState,
    taskDeleteError: store.taskDeleteError,
    taskApprovalRequestState: store.taskApprovalRequestState,
    taskApprovalRequestError: store.taskApprovalRequestError,
    taskPresetState: store.taskPresetState,
    taskPresetError: store.taskPresetError,
    taskBulkState: store.taskBulkState,
    taskBulkError: store.taskBulkError,
    taskBulkMessage: store.taskBulkMessage,
    taskBulkReport: store.taskBulkReport,
    selectedTaskIds: store.selectedTaskIds,
    taskFilterStatus: store.taskFilterStatus,
    setTaskFilterStatus: store.setTaskFilterStatus,
    taskFilterOwner: store.taskFilterOwner,
    setTaskFilterOwner: store.setTaskFilterOwner,
    taskIncludeArchived: store.taskIncludeArchived,
    setTaskIncludeArchived: store.setTaskIncludeArchived,
    savedTaskFilterPresets: store.savedTaskFilterPresets,
    taskFilterPresetName: store.taskFilterPresetName,
    setTaskFilterPresetName: store.setTaskFilterPresetName,
    taskArchiveRationale: store.taskArchiveRationale,
    setTaskArchiveRationale: store.setTaskArchiveRationale,
    taskBulkArchiveRationale: store.taskBulkArchiveRationale,
    setTaskBulkArchiveRationale: store.setTaskBulkArchiveRationale,
    taskApprovalRationale: store.taskApprovalRationale,
    setTaskApprovalRationale: store.setTaskApprovalRationale,
    taskDraft: store.taskDraft,
    setTaskDraft: store.setTaskDraft,
    workspaceOptions: derived.workspaceOptions,
    selectedDraftWorkspaceOption: derived.selectedDraftWorkspaceOption,
    bulkArchivableTasks: derived.bulkArchivableTasks,
    bulkRestorableTasks: derived.bulkRestorableTasks,
    selectedVisibleTaskRecords: derived.selectedVisibleTaskRecords,
    taskChangedFields: derived.taskChangedFields,
    taskSensitiveFields: derived.taskSensitiveFields,
    taskApprovalHint: derived.taskApprovalHint,
    approvalRequestedChanges: derived.approvalRequestedChanges,
    ...actions,
  };
}
