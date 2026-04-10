import {
  forwardArchiveOperatorTask,
  forwardCreateOperatorTask,
  forwardDeleteOperatorTask,
  forwardGetOperatorTask,
  forwardGetOperatorTasks,
  forwardRequestOperatorTaskApproval,
  forwardRestoreOperatorTask,
  forwardUpdateOperatorTask,
  persistSavedTaskFilterPresets,
  type ForwardBridgeConfig,
  type SavedTaskFilterPreset,
} from "../forward-bridge.js";
import { buildForwardRoute, type ForwardRoute } from "../forward-route.js";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface TaskActionDeps {
  config: ForwardBridgeConfig;
  enabled: boolean;
  route: ForwardRoute;
  taskFilterStatus: string;
  taskFilterOwner: string;
  taskIncludeArchived: boolean;
  savedTaskFilterPresets: SavedTaskFilterPreset[];
  taskFilterPresetName: string;
  taskBulkArchiveRationale: string;
  taskApprovalRationale: string;
  taskDraft: {
    title: string;
    objective: string;
    status: string;
    priority: string;
    ownerAgentId: string;
    linkedRunId: string;
    linkedIterationId: string;
    linkedRoomIds: string;
    blockedReason: string;
    acceptance: string;
    workspaceRef: string;
  };
  selectedTaskIds: string[];
  visibleTaskRecords: Array<{
    task_id: string;
    archived_at: string | null;
  }>;
  selectedVisibleTaskRecords: Array<{
    task_id: string;
    archived_at: string | null;
  }>;
  taskArchiveRationale: string;
  approvalRequestedChanges: string[];
  setOperatorTasks: (tasks: Awaited<ReturnType<typeof forwardGetOperatorTasks>> | null) => void;
  setSelectedTask: (task: Awaited<ReturnType<typeof forwardGetOperatorTask>> | null) => void;
  setTaskPresetState: (state: "idle" | "loading" | "ready" | "error") => void;
  setTaskPresetError: (error: string | null) => void;
  setSavedTaskFilterPresets: (presets: SavedTaskFilterPreset[]) => void;
  setTaskFilterPresetName: (name: string) => void;
  setTaskFilterStatus: (status: string) => void;
  setTaskFilterOwner: (owner: string) => void;
  setTaskIncludeArchived: (include: boolean) => void;
  setSelectedTaskIds: (ids: string[]) => void;
  setTaskBulkState: (state: "idle" | "loading" | "ready" | "error") => void;
  setTaskBulkError: (error: string | null) => void;
  setTaskBulkMessage: (message: string | null) => void;
  setTaskBulkReport: (report: {
    action: "archive" | "restore";
    targetScope: "selected" | "visible";
    attempted: number;
    succeeded: string[];
    failed: Array<{ taskId: string; error: string }>;
  } | null) => void;
  setTaskMutationState: (state: "idle" | "loading" | "ready" | "error") => void;
  setTaskMutationError: (error: string | null) => void;
  setTaskArchiveState: (state: "idle" | "loading" | "ready" | "error") => void;
  setTaskArchiveError: (error: string | null) => void;
  setTaskDeleteState: (state: "idle" | "loading" | "ready" | "error") => void;
  setTaskDeleteError: (error: string | null) => void;
  setTaskApprovalRequestState: (state: "idle" | "loading" | "ready" | "error") => void;
  setTaskApprovalRequestError: (error: string | null) => void;
  setTaskDraft: (draft: TaskActionDeps["taskDraft"]) => void;
}

export function createOperatorTaskActions(deps: TaskActionDeps) {
  const refreshTasksAndSelection = async (
    nextTaskId: string | null = null,
    includeArchived = deps.taskIncludeArchived,
  ) => {
    const tasksPayload = await forwardGetOperatorTasks(deps.config, {
      status: deps.taskFilterStatus !== "all" ? deps.taskFilterStatus : undefined,
      ownerAgentId: deps.taskFilterOwner.trim() || undefined,
      includeArchived,
    });
    deps.setOperatorTasks(tasksPayload);
    if (nextTaskId) {
      const taskPayload = await forwardGetOperatorTask(deps.config, nextTaskId);
      deps.setSelectedTask(taskPayload);
      window.location.hash = buildForwardRoute({
        screen: "task-detail",
        runId: null,
        taskId: nextTaskId,
        workspaceId: null,
        threadId: null,
        agentId: null,
      });
    } else {
      deps.setSelectedTask(null);
      window.location.hash = buildForwardRoute({
        screen: "tasks",
        runId: null,
        taskId: null,
        workspaceId: null,
        threadId: null,
        agentId: null,
      });
    }
  };

  return {
    applySavedTaskFilterPreset(preset: SavedTaskFilterPreset) {
      deps.setTaskFilterStatus(preset.status);
      deps.setTaskFilterOwner(preset.ownerAgentId);
      deps.setTaskIncludeArchived(preset.includeArchived);
      deps.setTaskPresetState("ready");
      deps.setTaskPresetError(null);
    },

    handleSaveTaskFilterPreset() {
      const name = deps.taskFilterPresetName.trim();
      if (!name) {
        deps.setTaskPresetState("error");
        deps.setTaskPresetError("Preset name is required.");
        return;
      }
      const existing = deps.savedTaskFilterPresets.find(
        (preset) => preset.name.toLowerCase() === name.toLowerCase(),
      );
      const nextPreset: SavedTaskFilterPreset = {
        id: existing?.id ?? `task-filter-${Date.now().toString(36)}`,
        name,
        status: deps.taskFilterStatus,
        ownerAgentId: deps.taskFilterOwner.trim(),
        includeArchived: deps.taskIncludeArchived,
      };
      const nextPresets = existing
        ? deps.savedTaskFilterPresets.map((preset) =>
            preset.id === existing.id ? nextPreset : preset,
          )
        : [nextPreset, ...deps.savedTaskFilterPresets].slice(0, 6);
      deps.setSavedTaskFilterPresets(nextPresets);
      persistSavedTaskFilterPresets(nextPresets);
      deps.setTaskFilterPresetName("");
      deps.setTaskPresetState("ready");
      deps.setTaskPresetError(null);
    },

    handleDeleteTaskFilterPreset(presetId: string) {
      const nextPresets = deps.savedTaskFilterPresets.filter(
        (preset) => preset.id !== presetId,
      );
      deps.setSavedTaskFilterPresets(nextPresets);
      persistSavedTaskFilterPresets(nextPresets);
      deps.setTaskPresetState("ready");
      deps.setTaskPresetError(null);
    },

    toggleTaskSelection(taskId: string) {
      deps.setSelectedTaskIds(
        deps.selectedTaskIds.includes(taskId)
          ? deps.selectedTaskIds.filter((item) => item !== taskId)
          : [...deps.selectedTaskIds, taskId],
      );
    },

    replaceTaskSelection(taskIds: string[]) {
      deps.setSelectedTaskIds(Array.from(new Set(taskIds)));
    },

    async handleBulkTaskLifecycle(action: "archive" | "restore") {
      if (!deps.enabled) return;
      const targetScope = deps.selectedVisibleTaskRecords.length > 0 ? "selected" : "visible";
      const baseCandidates =
        targetScope === "selected" ? deps.selectedVisibleTaskRecords : deps.visibleTaskRecords;
      const candidates = baseCandidates.filter((task) =>
        action === "archive" ? !task.archived_at : Boolean(task.archived_at),
      );
      if (candidates.length === 0) {
        deps.setTaskBulkState("error");
        deps.setTaskBulkError(`No ${targetScope} tasks can be ${action}d right now.`);
        deps.setTaskBulkMessage(null);
        deps.setTaskBulkReport(null);
        return;
      }
      if (action === "archive" && !deps.taskBulkArchiveRationale.trim()) {
        deps.setTaskBulkState("error");
        deps.setTaskBulkError("Bulk archive rationale is required.");
        deps.setTaskBulkMessage(null);
        deps.setTaskBulkReport(null);
        return;
      }

      const failures: Array<{ taskId: string; error: string }> = [];
      const successes: string[] = [];
      try {
        deps.setTaskBulkState("loading");
        deps.setTaskBulkError(null);
        deps.setTaskBulkMessage(null);
        for (const task of candidates) {
          try {
            if (action === "archive") {
              await forwardArchiveOperatorTask(deps.config, task.task_id, {
                archive_note: deps.taskBulkArchiveRationale.trim(),
              });
            } else {
              await forwardRestoreOperatorTask(deps.config, task.task_id);
            }
            successes.push(task.task_id);
          } catch (error) {
            failures.push({ taskId: task.task_id, error: toErrorMessage(error) });
          }
        }
        await refreshTasksAndSelection(deps.route.screen === "task-detail" ? deps.route.taskId : null);
        deps.setSelectedTaskIds(deps.selectedTaskIds.filter((taskId) => !successes.includes(taskId)));
        deps.setTaskBulkReport({
          action,
          targetScope,
          attempted: candidates.length,
          succeeded: successes,
          failed: failures,
        });
        if (failures.length > 0) {
          deps.setTaskBulkState("error");
          deps.setTaskBulkError(
            failures
              .slice(0, 3)
              .map((failure) => `${failure.taskId}: ${failure.error}`)
              .join(" | "),
          );
          return;
        }
        deps.setTaskBulkState("ready");
        deps.setTaskBulkMessage(
          `${action === "archive" ? "Archived" : "Restored"} ${successes.length} ${targetScope} task(s).`,
        );
      } catch (error) {
        deps.setTaskBulkState("error");
        deps.setTaskBulkError(toErrorMessage(error));
      }
    },

    async handleTaskSubmit() {
      if (!deps.enabled) return;
      const body = {
        title: deps.taskDraft.title,
        objective: deps.taskDraft.objective,
        status: deps.taskDraft.status,
        priority: deps.taskDraft.priority,
        owner_agent_id: deps.taskDraft.ownerAgentId || undefined,
        linked_run_id: deps.taskDraft.linkedRunId || undefined,
        linked_iteration_id: deps.taskDraft.linkedIterationId || undefined,
        linked_room_ids: deps.taskDraft.linkedRoomIds.split(",").map((item) => item.trim()).filter(Boolean),
        blocked_reason: deps.taskDraft.blockedReason || undefined,
        acceptance_json: deps.taskDraft.acceptance.split("\n").map((item) => item.trim()).filter(Boolean),
        workspace_ref: deps.taskDraft.workspaceRef || undefined,
      };
      try {
        deps.setTaskMutationState("loading");
        deps.setTaskMutationError(null);
        const result =
          deps.route.screen === "task-detail" && deps.route.taskId
            ? await forwardUpdateOperatorTask(deps.config, deps.route.taskId, body)
            : await forwardCreateOperatorTask(deps.config, body);
        await refreshTasksAndSelection(result.task.task_id);
        deps.setTaskMutationState("ready");
      } catch (error) {
        deps.setTaskMutationState("error");
        deps.setTaskMutationError(toErrorMessage(error));
      }
    },

    async handleTaskQuickStatus(status: string) {
      if (!deps.enabled || deps.route.screen !== "task-detail" || !deps.route.taskId) return;
      try {
        deps.setTaskMutationState("loading");
        deps.setTaskMutationError(null);
        const result = await forwardUpdateOperatorTask(deps.config, deps.route.taskId, {
          title: deps.taskDraft.title,
          objective: deps.taskDraft.objective,
          status,
          priority: deps.taskDraft.priority,
          owner_agent_id: deps.taskDraft.ownerAgentId || undefined,
          linked_run_id: deps.taskDraft.linkedRunId || undefined,
          linked_iteration_id: deps.taskDraft.linkedIterationId || undefined,
          linked_room_ids: deps.taskDraft.linkedRoomIds.split(",").map((item) => item.trim()).filter(Boolean),
          blocked_reason: deps.taskDraft.blockedReason || undefined,
          acceptance_json: deps.taskDraft.acceptance.split("\n").map((item) => item.trim()).filter(Boolean),
          workspace_ref: deps.taskDraft.workspaceRef || undefined,
        });
        deps.setTaskDraft({ ...deps.taskDraft, status });
        await refreshTasksAndSelection(result.task.task_id);
        deps.setTaskMutationState("ready");
      } catch (error) {
        deps.setTaskMutationState("error");
        deps.setTaskMutationError(toErrorMessage(error));
      }
    },

    async handleTaskArchive() {
      if (!deps.enabled || deps.route.screen !== "task-detail" || !deps.route.taskId) return;
      if (!deps.taskArchiveRationale.trim()) {
        deps.setTaskArchiveState("error");
        deps.setTaskArchiveError("Archive rationale is required.");
        return;
      }
      try {
        deps.setTaskArchiveState("loading");
        deps.setTaskArchiveError(null);
        await forwardArchiveOperatorTask(deps.config, deps.route.taskId, {
          archive_note: deps.taskArchiveRationale.trim(),
        });
        deps.setTaskIncludeArchived(true);
        await refreshTasksAndSelection(deps.route.taskId, true);
        deps.setTaskArchiveState("ready");
      } catch (error) {
        deps.setTaskArchiveState("error");
        deps.setTaskArchiveError(toErrorMessage(error));
      }
    },

    async handleTaskRestore() {
      if (!deps.enabled || deps.route.screen !== "task-detail" || !deps.route.taskId) return;
      try {
        deps.setTaskArchiveState("loading");
        deps.setTaskArchiveError(null);
        await forwardRestoreOperatorTask(deps.config, deps.route.taskId);
        await refreshTasksAndSelection(deps.route.taskId);
        deps.setTaskArchiveState("ready");
      } catch (error) {
        deps.setTaskArchiveState("error");
        deps.setTaskArchiveError(toErrorMessage(error));
      }
    },

    async handleTaskDelete() {
      if (!deps.enabled || deps.route.screen !== "task-detail" || !deps.route.taskId) return;
      try {
        deps.setTaskDeleteState("loading");
        deps.setTaskDeleteError(null);
        await forwardDeleteOperatorTask(deps.config, deps.route.taskId);
        await refreshTasksAndSelection(null);
        deps.setTaskDeleteState("ready");
      } catch (error) {
        deps.setTaskDeleteState("error");
        deps.setTaskDeleteError(toErrorMessage(error));
      }
    },

    async handleTaskRequestApproval() {
      if (!deps.enabled || deps.route.screen !== "task-detail" || !deps.route.taskId) return;
      try {
        deps.setTaskApprovalRequestState("loading");
        deps.setTaskApprovalRequestError(null);
        await forwardRequestOperatorTaskApproval(deps.config, deps.route.taskId, {
          rationale:
            deps.taskApprovalRationale.trim() ||
            "Operator requested task review from the shell.",
          requested_changes: deps.approvalRequestedChanges,
          draft_snapshot: {
            title: deps.taskDraft.title,
            objective: deps.taskDraft.objective,
            status: deps.taskDraft.status,
            priority: deps.taskDraft.priority,
            owner_agent_id: deps.taskDraft.ownerAgentId || null,
            linked_run_id: deps.taskDraft.linkedRunId || null,
            linked_iteration_id: deps.taskDraft.linkedIterationId || null,
            linked_room_ids: deps.taskDraft.linkedRoomIds.split(",").map((item) => item.trim()).filter(Boolean),
            blocked_reason: deps.taskDraft.blockedReason || null,
            acceptance_json: deps.taskDraft.acceptance.split("\n").map((item) => item.trim()).filter(Boolean),
            workspace_ref: deps.taskDraft.workspaceRef || null,
          },
        });
        deps.setTaskApprovalRequestState("ready");
      } catch (error) {
        deps.setTaskApprovalRequestState("error");
        deps.setTaskApprovalRequestError(toErrorMessage(error));
      }
    },
  };
}
