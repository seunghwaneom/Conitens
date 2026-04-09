import { create } from "zustand";
import {
  readInitialTaskFilterState,
  readSavedTaskFilterPresets,
  persistTaskFilterState,
  persistSavedTaskFilterPresets,
  type ForwardOperatorTasksResponse,
  type ForwardOperatorTaskDetailResponse,
  type ForwardOperatorWorkspacesResponse,
  type ForwardOperatorWorkspaceDetailResponse,
  type SavedTaskFilterPreset,
} from "../forward-bridge.js";
import type { OperatorTaskDraft } from "../components/OperatorTaskEditorPanel.js";
import type { OperatorWorkspaceDraft } from "../operator-workspace-actions.js";

type LoadState = "idle" | "loading" | "ready" | "error";
type TaskBulkAction = "archive" | "restore";

interface TaskBulkReport {
  action: TaskBulkAction;
  targetScope: "selected" | "visible";
  attempted: number;
  succeeded: string[];
  failed: Array<{ taskId: string; error: string }>;
}

interface TasksStoreState {
  // ── Task list ───────────────────────────────────────────────────────
  operatorTasks: ForwardOperatorTasksResponse | null;
  tasksState: LoadState;
  tasksError: string | null;

  // ── Task detail ─────────────────────────────────────────────────────
  selectedTask: ForwardOperatorTaskDetailResponse | null;
  taskDetailState: LoadState;
  taskDetailError: string | null;

  // ── Task mutation states ────────────────────────────────────────────
  taskMutationState: LoadState;
  taskMutationError: string | null;
  taskArchiveState: LoadState;
  taskArchiveError: string | null;
  taskDeleteState: LoadState;
  taskDeleteError: string | null;
  taskApprovalRequestState: LoadState;
  taskApprovalRequestError: string | null;
  taskPresetState: LoadState;
  taskPresetError: string | null;
  taskBulkState: LoadState;
  taskBulkError: string | null;
  taskBulkMessage: string | null;
  taskBulkReport: TaskBulkReport | null;

  // ── Task selection & filters ────────────────────────────────────────
  selectedTaskIds: string[];
  taskFilterStatus: string;
  taskFilterOwner: string;
  taskIncludeArchived: boolean;
  savedTaskFilterPresets: SavedTaskFilterPreset[];
  taskFilterPresetName: string;

  // ── Task rationales ─────────────────────────────────────────────────
  taskArchiveRationale: string;
  taskBulkArchiveRationale: string;
  taskApprovalRationale: string;

  // ── Task draft ──────────────────────────────────────────────────────
  taskDraft: OperatorTaskDraft;

  // ── Workspace list ──────────────────────────────────────────────────
  operatorWorkspaces: ForwardOperatorWorkspacesResponse | null;
  workspacesState: LoadState;
  workspacesError: string | null;

  // ── Workspace detail ────────────────────────────────────────────────
  selectedWorkspace: ForwardOperatorWorkspaceDetailResponse | null;
  workspaceDetailState: LoadState;
  workspaceDetailError: string | null;

  // ── Workspace mutation ──────────────────────────────────────────────
  workspaceMutationState: LoadState;
  workspaceMutationError: string | null;
  workspaceLinkedTasks: ForwardOperatorTasksResponse | null;
  workspaceLinkedTasksState: LoadState;
  workspaceLinkedTasksError: string | null;
  workspaceTaskActionState: LoadState;
  workspaceTaskActionError: string | null;
  workspaceTaskActionMessage: string | null;

  // ── Workspace draft ─────────────────────────────────────────────────
  workspaceDraft: OperatorWorkspaceDraft;

  // ── Actions ─────────────────────────────────────────────────────────
  setOperatorTasks: (tasks: ForwardOperatorTasksResponse | null) => void;
  setTasksState: (state: LoadState) => void;
  setTasksError: (error: string | null) => void;

  setSelectedTask: (task: ForwardOperatorTaskDetailResponse | null) => void;
  setTaskDetailState: (state: LoadState) => void;
  setTaskDetailError: (error: string | null) => void;

  setTaskMutationState: (state: LoadState) => void;
  setTaskMutationError: (error: string | null) => void;
  setTaskArchiveState: (state: LoadState) => void;
  setTaskArchiveError: (error: string | null) => void;
  setTaskDeleteState: (state: LoadState) => void;
  setTaskDeleteError: (error: string | null) => void;
  setTaskApprovalRequestState: (state: LoadState) => void;
  setTaskApprovalRequestError: (error: string | null) => void;
  setTaskPresetState: (state: LoadState) => void;
  setTaskPresetError: (error: string | null) => void;
  setTaskBulkState: (state: LoadState) => void;
  setTaskBulkError: (error: string | null) => void;
  setTaskBulkMessage: (message: string | null) => void;
  setTaskBulkReport: (report: TaskBulkReport | null) => void;

  setSelectedTaskIds: (ids: string[]) => void;
  setTaskFilterStatus: (status: string) => void;
  setTaskFilterOwner: (owner: string) => void;
  setTaskIncludeArchived: (include: boolean) => void;
  setSavedTaskFilterPresets: (presets: SavedTaskFilterPreset[]) => void;
  setTaskFilterPresetName: (name: string) => void;

  setTaskArchiveRationale: (value: string) => void;
  setTaskBulkArchiveRationale: (value: string) => void;
  setTaskApprovalRationale: (value: string) => void;

  setTaskDraft: (draft: OperatorTaskDraft) => void;

  setOperatorWorkspaces: (workspaces: ForwardOperatorWorkspacesResponse | null) => void;
  setWorkspacesState: (state: LoadState) => void;
  setWorkspacesError: (error: string | null) => void;

  setSelectedWorkspace: (workspace: ForwardOperatorWorkspaceDetailResponse | null) => void;
  setWorkspaceDetailState: (state: LoadState) => void;
  setWorkspaceDetailError: (error: string | null) => void;

  setWorkspaceMutationState: (state: LoadState) => void;
  setWorkspaceMutationError: (error: string | null) => void;
  setWorkspaceLinkedTasks: (tasks: ForwardOperatorTasksResponse | null) => void;
  setWorkspaceLinkedTasksState: (state: LoadState) => void;
  setWorkspaceLinkedTasksError: (error: string | null) => void;
  setWorkspaceTaskActionState: (state: LoadState) => void;
  setWorkspaceTaskActionError: (error: string | null) => void;
  setWorkspaceTaskActionMessage: (message: string | null) => void;

  setWorkspaceDraft: (draft: OperatorWorkspaceDraft) => void;

  /** Persist current filter state to localStorage */
  persistFilters: () => void;
  /** Save current filter as a named preset */
  saveFilterPreset: (name: string) => void;
  /** Delete a saved filter preset by name */
  deleteFilterPreset: (name: string) => void;
}

const EMPTY_TASK_DRAFT: OperatorTaskDraft = {
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

const EMPTY_WORKSPACE_DRAFT: OperatorWorkspaceDraft = {
  label: "",
  path: "",
  kind: "repo",
  status: "active",
  archiveNote: "",
  ownerAgentId: "",
  linkedRunId: "",
  linkedIterationId: "",
  taskIds: "",
  notes: "",
};

export const useTasksStore = create<TasksStoreState>((set, get) => {
  const initialFilter = readInitialTaskFilterState();
  const initialPresets = readSavedTaskFilterPresets();

  return {
    // ── Task list ─────────────────────────────────────────────────────
    operatorTasks: null,
    tasksState: "idle",
    tasksError: null,

    // ── Task detail ───────────────────────────────────────────────────
    selectedTask: null,
    taskDetailState: "idle",
    taskDetailError: null,

    // ── Task mutation states ──────────────────────────────────────────
    taskMutationState: "idle",
    taskMutationError: null,
    taskArchiveState: "idle",
    taskArchiveError: null,
    taskDeleteState: "idle",
    taskDeleteError: null,
    taskApprovalRequestState: "idle",
    taskApprovalRequestError: null,
    taskPresetState: "idle",
    taskPresetError: null,
    taskBulkState: "idle",
    taskBulkError: null,
    taskBulkMessage: null,
    taskBulkReport: null,

    // ── Task selection & filters ──────────────────────────────────────
    selectedTaskIds: [],
    taskFilterStatus: initialFilter.status,
    taskFilterOwner: initialFilter.ownerAgentId,
    taskIncludeArchived: initialFilter.includeArchived,
    savedTaskFilterPresets: initialPresets,
    taskFilterPresetName: "",

    // ── Task rationales ───────────────────────────────────────────────
    taskArchiveRationale: "",
    taskBulkArchiveRationale: "",
    taskApprovalRationale: "",

    // ── Task draft ────────────────────────────────────────────────────
    taskDraft: { ...EMPTY_TASK_DRAFT },

    // ── Workspace list ────────────────────────────────────────────────
    operatorWorkspaces: null,
    workspacesState: "idle",
    workspacesError: null,

    // ── Workspace detail ──────────────────────────────────────────────
    selectedWorkspace: null,
    workspaceDetailState: "idle",
    workspaceDetailError: null,

    // ── Workspace mutation ────────────────────────────────────────────
    workspaceMutationState: "idle",
    workspaceMutationError: null,
    workspaceLinkedTasks: null,
    workspaceLinkedTasksState: "idle",
    workspaceLinkedTasksError: null,
    workspaceTaskActionState: "idle",
    workspaceTaskActionError: null,
    workspaceTaskActionMessage: null,

    // ── Workspace draft ───────────────────────────────────────────────
    workspaceDraft: { ...EMPTY_WORKSPACE_DRAFT },

    // ── Actions ───────────────────────────────────────────────────────
    setOperatorTasks: (tasks) => set({ operatorTasks: tasks }),
    setTasksState: (state) => set({ tasksState: state }),
    setTasksError: (error) => set({ tasksError: error }),

    setSelectedTask: (task) => set({ selectedTask: task }),
    setTaskDetailState: (state) => set({ taskDetailState: state }),
    setTaskDetailError: (error) => set({ taskDetailError: error }),

    setTaskMutationState: (state) => set({ taskMutationState: state }),
    setTaskMutationError: (error) => set({ taskMutationError: error }),
    setTaskArchiveState: (state) => set({ taskArchiveState: state }),
    setTaskArchiveError: (error) => set({ taskArchiveError: error }),
    setTaskDeleteState: (state) => set({ taskDeleteState: state }),
    setTaskDeleteError: (error) => set({ taskDeleteError: error }),
    setTaskApprovalRequestState: (state) => set({ taskApprovalRequestState: state }),
    setTaskApprovalRequestError: (error) => set({ taskApprovalRequestError: error }),
    setTaskPresetState: (state) => set({ taskPresetState: state }),
    setTaskPresetError: (error) => set({ taskPresetError: error }),
    setTaskBulkState: (state) => set({ taskBulkState: state }),
    setTaskBulkError: (error) => set({ taskBulkError: error }),
    setTaskBulkMessage: (message) => set({ taskBulkMessage: message }),
    setTaskBulkReport: (report) => set({ taskBulkReport: report }),

    setSelectedTaskIds: (ids) => set({ selectedTaskIds: ids }),
    setTaskFilterStatus: (status) => set({ taskFilterStatus: status }),
    setTaskFilterOwner: (owner) => set({ taskFilterOwner: owner }),
    setTaskIncludeArchived: (include) => set({ taskIncludeArchived: include }),
    setSavedTaskFilterPresets: (presets) => set({ savedTaskFilterPresets: presets }),
    setTaskFilterPresetName: (name) => set({ taskFilterPresetName: name }),

    setTaskArchiveRationale: (value) => set({ taskArchiveRationale: value }),
    setTaskBulkArchiveRationale: (value) => set({ taskBulkArchiveRationale: value }),
    setTaskApprovalRationale: (value) => set({ taskApprovalRationale: value }),

    setTaskDraft: (draft) => set({ taskDraft: draft }),

    setOperatorWorkspaces: (workspaces) => set({ operatorWorkspaces: workspaces }),
    setWorkspacesState: (state) => set({ workspacesState: state }),
    setWorkspacesError: (error) => set({ workspacesError: error }),

    setSelectedWorkspace: (workspace) => set({ selectedWorkspace: workspace }),
    setWorkspaceDetailState: (state) => set({ workspaceDetailState: state }),
    setWorkspaceDetailError: (error) => set({ workspaceDetailError: error }),

    setWorkspaceMutationState: (state) => set({ workspaceMutationState: state }),
    setWorkspaceMutationError: (error) => set({ workspaceMutationError: error }),
    setWorkspaceLinkedTasks: (tasks) => set({ workspaceLinkedTasks: tasks }),
    setWorkspaceLinkedTasksState: (state) => set({ workspaceLinkedTasksState: state }),
    setWorkspaceLinkedTasksError: (error) => set({ workspaceLinkedTasksError: error }),
    setWorkspaceTaskActionState: (state) => set({ workspaceTaskActionState: state }),
    setWorkspaceTaskActionError: (error) => set({ workspaceTaskActionError: error }),
    setWorkspaceTaskActionMessage: (message) => set({ workspaceTaskActionMessage: message }),

    setWorkspaceDraft: (draft) => set({ workspaceDraft: draft }),

    persistFilters: () => {
      const s = get();
      persistTaskFilterState({
        status: s.taskFilterStatus,
        ownerAgentId: s.taskFilterOwner,
        includeArchived: s.taskIncludeArchived,
      });
    },

    saveFilterPreset: (name) => {
      const s = get();
      const preset: SavedTaskFilterPreset = {
        id: `preset_${Date.now()}`,
        name,
        status: s.taskFilterStatus,
        ownerAgentId: s.taskFilterOwner,
        includeArchived: s.taskIncludeArchived,
      };
      const updated = [...s.savedTaskFilterPresets.filter((p) => p.name !== name), preset];
      persistSavedTaskFilterPresets(updated);
      set({ savedTaskFilterPresets: updated, taskFilterPresetName: "" });
    },

    deleteFilterPreset: (name) => {
      const s = get();
      const updated = s.savedTaskFilterPresets.filter((p) => p.name !== name);
      persistSavedTaskFilterPresets(updated);
      set({ savedTaskFilterPresets: updated });
    },
  };
});
