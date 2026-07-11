import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import type { ForwardBridgeConfig } from "../../forward-bridge.js";
import type { ForwardRoute } from "../../forward-route.js";
import {
  getOperatorWorkspaceQuickStatusActions,
  type OperatorWorkspaceDraft,
} from "../../operator-workspace-actions.js";
import { operatorWorkspaceCommandService } from "./operator-workspace-command-service.js";
import { useOperatorWorkspaceResources } from "./use-operator-workspace-resources.js";

type LoadState = "idle" | "loading" | "ready" | "error";

interface UseOperatorWorkspaceControllerOptions {
  readonly config: ForwardBridgeConfig;
  readonly route: ForwardRoute;
  readonly isOfficePreview: boolean;
  readonly liveRevision: number;
  readonly setLiveRevision: Dispatch<SetStateAction<number>>;
}

function emptyWorkspaceDraft(): OperatorWorkspaceDraft {
  return {
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
}

export function useOperatorWorkspaceController({
  config,
  route,
  isOfficePreview,
  liveRevision,
  setLiveRevision,
}: UseOperatorWorkspaceControllerOptions) {
  const resources = useOperatorWorkspaceResources({
    config,
    route,
    isOfficePreview,
    liveRevision,
    setLiveRevision,
  });
  const [workspaceMutationState, setWorkspaceMutationState] = useState<LoadState>("idle");
  const [workspaceTaskActionState, setWorkspaceTaskActionState] = useState<LoadState>("idle");
  const [workspaceMutationError, setWorkspaceMutationError] = useState<string | null>(null);
  const [workspaceTaskActionError, setWorkspaceTaskActionError] = useState<string | null>(null);
  const [workspaceTaskActionMessage, setWorkspaceTaskActionMessage] = useState<string | null>(null);
  const [workspaceDraft, setWorkspaceDraft] = useState<OperatorWorkspaceDraft>(() => emptyWorkspaceDraft());

  const workspaceQuickStatusActions = useMemo(
    () => (
      resources.workspaceDetail
        ? getOperatorWorkspaceQuickStatusActions(resources.workspaceDetail.status, workspaceDraft)
        : []
    ),
    [resources.workspaceDetail, workspaceDraft],
  );

  useEffect(() => {
    if (route.screen === "workspace-detail" && resources.workspaceDetail) {
      setWorkspaceDraft({
        label: resources.workspaceDetail.label,
        path: resources.workspaceDetail.path,
        kind: resources.workspaceDetail.kind,
        status: resources.workspaceDetail.status,
        archiveNote: resources.workspaceDetail.archiveNote ?? "",
        ownerAgentId: resources.workspaceDetail.owner === "unassigned" ? "" : resources.workspaceDetail.owner,
        linkedRunId: resources.workspaceDetail.linkedRunId ?? "",
        linkedIterationId: resources.workspaceDetail.linkedIterationId ?? "",
        taskIds: resources.workspaceDetail.taskIds.join(", "),
        notes: resources.workspaceDetail.notes ?? "",
      });
      setWorkspaceMutationState("idle");
      setWorkspaceMutationError(null);
      return;
    }
    if (route.screen === "workspaces") {
      setWorkspaceDraft(emptyWorkspaceDraft());
      setWorkspaceMutationState("idle");
      setWorkspaceMutationError(null);
    }
  }, [route.screen, resources.workspaceDetail]);

  const feedback = {
    setMutationState: setWorkspaceMutationState,
    setMutationError: setWorkspaceMutationError,
    setTaskActionState: setWorkspaceTaskActionState,
    setTaskActionError: setWorkspaceTaskActionError,
    setTaskActionMessage: setWorkspaceTaskActionMessage,
  };

  async function handleWorkspaceSubmit() {
    await operatorWorkspaceCommandService.submit({
      config,
      route,
      draft: workspaceDraft,
      refresh: resources.refreshWorkspacesAndSelection,
      feedback,
    });
  }

  async function handleWorkspaceQuickStatus(status: string) {
    await operatorWorkspaceCommandService.quickStatus({
      config,
      route,
      draft: workspaceDraft,
      status,
      refresh: resources.refreshWorkspacesAndSelection,
      feedback,
    });
  }

  async function handleWorkspaceDetachTask(taskId: string) {
    await operatorWorkspaceCommandService.detachTask({
      config,
      route,
      draft: workspaceDraft,
      taskId,
      refresh: resources.refreshWorkspacesAndSelection,
      feedback,
    });
  }

  async function handleWorkspaceArchiveTask(taskId: string) {
    await operatorWorkspaceCommandService.archiveTask({
      config,
      route,
      draft: workspaceDraft,
      taskId,
      refresh: resources.refreshWorkspacesAndSelection,
      feedback,
    });
  }

  return {
    operatorWorkspaces: resources.operatorWorkspaces,
    workspaceDetail: resources.workspaceDetail,
    workspaceLinkedTasks: resources.workspaceLinkedTasks,
    workspacesState: resources.workspacesState,
    workspaceDetailState: resources.workspaceDetailState,
    workspaceMutationState,
    workspaceLinkedTasksState: resources.workspaceLinkedTasksState,
    workspaceTaskActionState,
    workspacesError: resources.workspacesError,
    workspaceDetailError: resources.workspaceDetailError,
    workspaceMutationError,
    workspaceLinkedTasksError: resources.workspaceLinkedTasksError,
    workspaceTaskActionError,
    workspaceTaskActionMessage,
    workspaceDraft,
    setWorkspaceDraft,
    workspaceQuickStatusActions,
    openWorkspace: resources.openWorkspace,
    handleWorkspaceSubmit,
    handleWorkspaceQuickStatus,
    handleWorkspaceDetachTask,
    handleWorkspaceArchiveTask,
  };
}
