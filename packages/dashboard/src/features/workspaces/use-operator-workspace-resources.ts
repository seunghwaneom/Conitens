import { useMemo, useState, useEffect, type Dispatch, type SetStateAction } from "react";

import {
  forwardGetOperatorTasks,
  forwardGetOperatorWorkspace,
  forwardGetOperatorWorkspaces,
  type ForwardBridgeConfig,
  type ForwardOperatorTasksResponse,
  type ForwardOperatorWorkspaceDetailResponse,
  type ForwardOperatorWorkspacesResponse,
} from "../../forward-bridge.js";
import { buildForwardRoute, type ForwardRoute } from "../../forward-route.js";
import { toOperatorWorkspaceDetail } from "../../operator-workspaces-model.js";

type LoadState = "idle" | "loading" | "ready" | "error";

interface UseOperatorWorkspaceResourcesOptions {
  readonly config: ForwardBridgeConfig;
  readonly route: ForwardRoute;
  readonly isOfficePreview: boolean;
  readonly liveRevision: number;
  readonly setLiveRevision: Dispatch<SetStateAction<number>>;
}

export function useOperatorWorkspaceResources({
  config,
  route,
  isOfficePreview,
  liveRevision,
  setLiveRevision,
}: UseOperatorWorkspaceResourcesOptions) {
  const [operatorWorkspaces, setOperatorWorkspaces] = useState<ForwardOperatorWorkspacesResponse | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<ForwardOperatorWorkspaceDetailResponse | null>(null);
  const [workspaceLinkedTasks, setWorkspaceLinkedTasks] = useState<ForwardOperatorTasksResponse | null>(null);
  const [workspacesState, setWorkspacesState] = useState<LoadState>("idle");
  const [workspaceDetailState, setWorkspaceDetailState] = useState<LoadState>("idle");
  const [workspaceLinkedTasksState, setWorkspaceLinkedTasksState] = useState<LoadState>("idle");
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [workspaceDetailError, setWorkspaceDetailError] = useState<string | null>(null);
  const [workspaceLinkedTasksError, setWorkspaceLinkedTasksError] = useState<string | null>(null);

  const workspaceDetail = useMemo(
    () => (selectedWorkspace ? toOperatorWorkspaceDetail(selectedWorkspace) : null),
    [selectedWorkspace],
  );

  useEffect(() => {
    if (
      isOfficePreview ||
      !config.token.trim() ||
      (
        route.screen !== "workspaces" &&
        route.screen !== "workspace-detail" &&
        route.screen !== "tasks" &&
        route.screen !== "task-detail"
      )
    ) {
      setOperatorWorkspaces(null);
      setWorkspacesState("idle");
      setWorkspacesError(null);
      return;
    }
    let cancelled = false;
    setWorkspacesState("loading");
    setWorkspacesError(null);
    forwardGetOperatorWorkspaces(config)
      .then((payload) => {
        if (cancelled) return;
        setOperatorWorkspaces(payload);
        setWorkspacesState("ready");
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setOperatorWorkspaces(null);
        setWorkspacesState("error");
        setWorkspacesError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, liveRevision]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || route.screen !== "workspace-detail" || !route.workspaceId) {
      setSelectedWorkspace(null);
      setWorkspaceDetailState("idle");
      setWorkspaceDetailError(null);
      return;
    }
    let cancelled = false;
    setWorkspaceDetailState("loading");
    setWorkspaceDetailError(null);
    forwardGetOperatorWorkspace(config, route.workspaceId)
      .then((payload) => {
        if (cancelled) return;
        setSelectedWorkspace(payload);
        setWorkspaceDetailState("ready");
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setSelectedWorkspace(null);
        setWorkspaceDetailState("error");
        setWorkspaceDetailError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, route.workspaceId]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || route.screen !== "workspace-detail" || !route.workspaceId) {
      setWorkspaceLinkedTasks(null);
      setWorkspaceLinkedTasksState("idle");
      setWorkspaceLinkedTasksError(null);
      return;
    }
    let cancelled = false;
    setWorkspaceLinkedTasksState("loading");
    setWorkspaceLinkedTasksError(null);
    forwardGetOperatorTasks(config, { workspaceRef: route.workspaceId, includeArchived: true })
      .then((payload) => {
        if (cancelled) return;
        setWorkspaceLinkedTasks(payload);
        setWorkspaceLinkedTasksState("ready");
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setWorkspaceLinkedTasks(null);
        setWorkspaceLinkedTasksState("error");
        setWorkspaceLinkedTasksError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, route.workspaceId, liveRevision]);

  const openWorkspace = (workspaceId: string) => {
    window.location.hash = buildForwardRoute({
      screen: "workspace-detail",
      runId: null,
      taskId: null,
      workspaceId,
      threadId: null,
      agentId: null,
    });
  };

  async function refreshWorkspacesAndSelection(nextWorkspaceId: string | null = null) {
    const workspacesPayload = await forwardGetOperatorWorkspaces(config);
    setOperatorWorkspaces(workspacesPayload);
    if (nextWorkspaceId) {
      const workspacePayload = await forwardGetOperatorWorkspace(config, nextWorkspaceId);
      setSelectedWorkspace(workspacePayload);
      window.location.hash = buildForwardRoute({
        screen: "workspace-detail",
        runId: null,
        taskId: null,
        workspaceId: nextWorkspaceId,
        threadId: null,
        agentId: null,
      });
    } else {
      setSelectedWorkspace(null);
      window.location.hash = buildForwardRoute({
        screen: "workspaces",
        runId: null,
        taskId: null,
        workspaceId: null,
        threadId: null,
        agentId: null,
      });
    }
    setLiveRevision((current) => current + 1);
  }

  return {
    operatorWorkspaces,
    workspaceDetail,
    workspaceLinkedTasks,
    workspacesState,
    workspaceDetailState,
    workspaceLinkedTasksState,
    workspacesError,
    workspaceDetailError,
    workspaceLinkedTasksError,
    openWorkspace,
    refreshWorkspacesAndSelection,
  };
}
