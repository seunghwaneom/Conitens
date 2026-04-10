import { useMemo } from "react";
import { toOperatorTaskDetail, toOperatorTaskListItems } from "../operator-tasks-model.js";
import type { OperatorTaskWorkspaceOption, OperatorTaskDraft } from "../components/OperatorTaskEditorPanel.js";
import type {
  ForwardOperatorTaskDetailResponse,
  ForwardOperatorTasksResponse,
  ForwardOperatorWorkspacesResponse,
} from "../forward-bridge.js";

interface UseOperatorTaskDerivedArgs {
  operatorTasks: ForwardOperatorTasksResponse | null;
  selectedTask: ForwardOperatorTaskDetailResponse | null;
  operatorWorkspaces: ForwardOperatorWorkspacesResponse | null;
  taskDraft: OperatorTaskDraft;
  selectedTaskIds: string[];
}

export function useOperatorTaskDerived({
  operatorTasks,
  selectedTask,
  operatorWorkspaces,
  taskDraft,
  selectedTaskIds,
}: UseOperatorTaskDerivedArgs) {
  const visibleTaskRecords = useMemo(() => operatorTasks?.tasks ?? [], [operatorTasks]);
  const taskItems = useMemo(
    () => (operatorTasks ? toOperatorTaskListItems(operatorTasks) : []),
    [operatorTasks],
  );
  const taskDetail = useMemo(
    () => (selectedTask ? toOperatorTaskDetail(selectedTask) : null),
    [selectedTask],
  );

  const workspaceOptions = useMemo(() => {
    const options: OperatorTaskWorkspaceOption[] = (operatorWorkspaces?.workspaces ?? []).map((workspace) => ({
      id: workspace.workspace_id,
      label: workspace.label,
      path: workspace.path,
      status: workspace.status,
      owner: workspace.owner_agent_id ?? "unassigned",
      linkedRunId: workspace.linked_run_id,
      taskCount: workspace.task_ids_json.length,
      disabled: workspace.status === "archived" && workspace.workspace_id !== taskDraft.workspaceRef,
    }));
    if (taskDraft.workspaceRef && !options.some((option) => option.id === taskDraft.workspaceRef)) {
      options.unshift({
        id: taskDraft.workspaceRef,
        label: `${taskDraft.workspaceRef} | unresolved canonical workspace`,
        path: taskDraft.workspaceRef,
        status: "unresolved",
        owner: "unknown",
        linkedRunId: null,
        taskCount: 0,
        unresolved: true,
      });
    }
    return options;
  }, [operatorWorkspaces, taskDraft.workspaceRef]);

  const selectedDraftWorkspaceOption = useMemo(
    () => workspaceOptions.find((option) => option.id === taskDraft.workspaceRef) ?? null,
    [workspaceOptions, taskDraft.workspaceRef],
  );

  const bulkArchivableTasks = useMemo(
    () => visibleTaskRecords.filter((task) => !task.archived_at),
    [visibleTaskRecords],
  );
  const bulkRestorableTasks = useMemo(
    () => visibleTaskRecords.filter((task) => Boolean(task.archived_at)),
    [visibleTaskRecords],
  );
  const selectedVisibleTaskRecords = useMemo(
    () => visibleTaskRecords.filter((task) => selectedTaskIds.includes(task.task_id)),
    [selectedTaskIds, visibleTaskRecords],
  );

  const taskChangedFields = useMemo(() => {
    if (!taskDetail) return [] as string[];
    const fields: string[] = [];
    const draftAcceptance = taskDraft.acceptance
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .join("|");
    const currentAcceptance = taskDetail.acceptance.join("|");
    const currentPriority =
      taskDetail.stats.find((item) => item.label === "Priority")?.value ?? "medium";
    const currentWorkspace =
      taskDetail.stats.find((item) => item.label === "Workspace")?.value === "none"
        ? ""
        : (taskDetail.stats.find((item) => item.label === "Workspace")?.value ?? "");

    if (taskDraft.title !== taskDetail.title) fields.push("title");
    if (taskDraft.objective !== taskDetail.objective) fields.push("objective");
    if (taskDraft.status !== taskDetail.status) fields.push("status");
    if (taskDraft.priority !== currentPriority) fields.push("priority");
    if (taskDraft.ownerAgentId !== (taskDetail.owner === "unassigned" ? "" : taskDetail.owner)) {
      fields.push("owner_agent_id");
    }
    if (taskDraft.linkedRunId !== (taskDetail.linkedRunId ?? "")) fields.push("linked_run_id");
    if (taskDraft.linkedIterationId !== (taskDetail.linkedIterationId ?? "")) {
      fields.push("linked_iteration_id");
    }
    if (
      taskDraft.linkedRoomIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .join("|") !== taskDetail.linkedRoomIds.join("|")
    ) {
      fields.push("linked_room_ids");
    }
    if (taskDraft.blockedReason !== (taskDetail.blockedReason ?? "")) {
      fields.push("blocked_reason");
    }
    if (draftAcceptance !== currentAcceptance) fields.push("acceptance_json");
    if (taskDraft.workspaceRef !== currentWorkspace) fields.push("workspace_ref");
    return fields;
  }, [taskDetail, taskDraft]);

  const approvalRequestedChanges = useMemo(
    () =>
      taskChangedFields.filter((field) =>
        [
          "status",
          "owner_agent_id",
          "linked_run_id",
          "linked_iteration_id",
          "linked_room_ids",
          "workspace_ref",
        ].includes(field),
      ),
    [taskChangedFields],
  );

  const taskSensitiveFields = approvalRequestedChanges;
  const taskApprovalHint = useMemo(() => {
    if (!taskDetail?.linkedRunId || approvalRequestedChanges.length === 0) {
      return null;
    }
    return "These changes touch execution-sensitive fields. Request approval if the linked run is under review.";
  }, [approvalRequestedChanges, taskDetail]);

  return {
    visibleTaskRecords,
    taskItems,
    taskDetail,
    workspaceOptions,
    selectedDraftWorkspaceOption,
    bulkArchivableTasks,
    bulkRestorableTasks,
    selectedVisibleTaskRecords,
    taskChangedFields,
    approvalRequestedChanges,
    taskSensitiveFields,
    taskApprovalHint,
  };
}
