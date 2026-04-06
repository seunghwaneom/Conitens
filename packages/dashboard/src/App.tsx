import React, { useEffect, useEffectEvent, useMemo, useState } from "react";
import { PixelOffice } from "./components/PixelOffice.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ForwardApprovalCenterPanel } from "./components/ForwardApprovalCenterPanel.js";
import { ForwardContextPanel } from "./components/ForwardContextPanel.js";
import { ForwardGraphPanel } from "./components/ForwardGraphPanel.js";
import { ForwardInsightsPanel } from "./components/ForwardInsightsPanel.js";
import { ForwardReplayPanel } from "./components/ForwardReplayPanel.js";
import { ForwardRoomPanel } from "./components/ForwardRoomPanel.js";
import { ForwardStateDocsPanel } from "./components/ForwardStateDocsPanel.js";
import { OperatorInboxPanel } from "./components/OperatorInboxPanel.js";
import { OperatorSummaryPanel } from "./components/OperatorSummaryPanel.js";
import { OperatorTaskDetailPanel } from "./components/OperatorTaskDetailPanel.js";
import {
  OperatorTaskEditorPanel,
  type OperatorTaskDraft,
  type OperatorTaskWorkspaceOption,
} from "./components/OperatorTaskEditorPanel.js";
import { OperatorWorkspaceDetailPanel } from "./components/OperatorWorkspaceDetailPanel.js";
import { OperatorWorkspaceEditorPanel } from "./components/OperatorWorkspaceEditorPanel.js";
import { useForwardStream } from "./hooks/use-forward-stream.js";
import {
  forwardArchiveOperatorTask,
  forwardGetOperatorAgents,
  forwardCreateOperatorTask,
  forwardCreateOperatorWorkspace,
  forwardDetachOperatorTaskWorkspace,
  forwardDeleteOperatorTask,
  forwardGetOperatorInbox,
  forwardGetOperatorTask,
  forwardGetOperatorTasks,
  forwardGetOperatorWorkspace,
  forwardGetOperatorWorkspaces,
  forwardGetOperatorSummary,
  forwardRequestOperatorTaskApproval,
  forwardRestoreOperatorTask,
  forwardUpdateOperatorTask,
  forwardUpdateOperatorWorkspace,
  forwardGet,
  parseContextLatestResponse,
  parseReplayResponse,
  parseRoomTimelineResponse,
  parseRunDetailResponse,
  parseRunsResponse,
  parseStateDocsResponse,
  persistBridgeConfig,
  persistSavedTaskFilterPresets,
  persistTaskFilterState,
  readInitialBridgeConfig,
  readInitialTaskFilterState,
  readSavedTaskFilterPresets,
  type ForwardBridgeConfig,
  type ForwardOperatorAgentsResponse,
  type ForwardContextLatestResponse,
  type ForwardOperatorInboxResponse,
  type ForwardOperatorTaskDetailResponse,
  type ForwardOperatorTasksResponse,
  type ForwardOperatorWorkspaceDetailResponse,
  type ForwardOperatorWorkspacesResponse,
  type ForwardOperatorSummaryResponse,
  type ForwardReplayResponse,
  type ForwardRoomTimelineResponse,
  type ForwardRunDetailResponse,
  type ForwardRunSummary,
  type SavedTaskFilterPreset,
  type ForwardStateDocsResponse,
} from "./forward-bridge.js";
import { buildForwardRoute, parseForwardRoute } from "./forward-route.js";
import { deriveForwardGraphModel } from "./forward-graph.js";
import { toOperatorAgentProfiles } from "./operator-agents-model.js";
import { toOperatorInboxViewModel } from "./operator-inbox-model.js";
import { toOperatorSummaryViewModel } from "./operator-summary-model.js";
import { toOperatorTaskDetail, toOperatorTaskListItems } from "./operator-tasks-model.js";
import {
  buildOperatorWorkspaceMutationBody,
  getOperatorWorkspaceQuickStatusActions,
  operatorWorkspaceNeedsArchiveRationale,
  type OperatorWorkspaceDraft,
} from "./operator-workspace-actions.js";
import { toOperatorWorkspaceDetail, toOperatorWorkspaceListItems } from "./operator-workspaces-model.js";
import {
  extractRoomOptions,
  pickNextRoomId,
  summarizeFindingsDocument,
  summarizeValidatorCorrelations,
  toInsightCardViewModels,
  toRunDetailViewModel,
  toRunListItemViewModel,
} from "./forward-view-model.js";
import { OnboardingOverlay } from "./components/OnboardingOverlay.js";
import { demoAgents, demoEvents, demoTasks } from "./demo-data.js";
import { AgentFleetOverview } from "./components/AgentFleetOverview.js";
import { AgentProfilePanel } from "./components/AgentProfilePanel.js";
import { AgentRelationshipGraph } from "./components/AgentRelationshipGraph.js";
import { ProposalQueuePanel } from "./components/ProposalQueuePanel.js";
import { demoFleet } from "./agent-fleet-model.js";
import { demoProposals, demoEvolution, demoLearningMetrics } from "./evolution-model.js";

type LoadState = "idle" | "loading" | "ready" | "error";
type DetailTab = "operations" | "intelligence" | "data";
type TaskBulkAction = "archive" | "restore";

interface TaskBulkReport {
  action: TaskBulkAction;
  targetScope: "selected" | "visible";
  attempted: number;
  succeeded: string[];
  failed: Array<{ taskId: string; error: string }>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const initialTaskFilterState = readInitialTaskFilterState();
  const [config, setConfig] = useState<ForwardBridgeConfig>(() => readInitialBridgeConfig());
  const [draftConfig, setDraftConfig] = useState<ForwardBridgeConfig>(() => readInitialBridgeConfig());
  const [operatorAgents, setOperatorAgents] = useState<ForwardOperatorAgentsResponse | null>(null);
  const [operatorTasks, setOperatorTasks] = useState<ForwardOperatorTasksResponse | null>(null);
  const [selectedTask, setSelectedTask] = useState<ForwardOperatorTaskDetailResponse | null>(null);
  const [operatorWorkspaces, setOperatorWorkspaces] = useState<ForwardOperatorWorkspacesResponse | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<ForwardOperatorWorkspaceDetailResponse | null>(null);
  const [workspaceLinkedTasks, setWorkspaceLinkedTasks] = useState<ForwardOperatorTasksResponse | null>(null);
  const [runs, setRuns] = useState<ForwardRunSummary[]>([]);
  const [operatorInbox, setOperatorInbox] = useState<ForwardOperatorInboxResponse | null>(null);
  const [operatorSummary, setOperatorSummary] = useState<ForwardOperatorSummaryResponse | null>(null);
  const [selectedRun, setSelectedRun] = useState<ForwardRunDetailResponse | null>(null);
  const [replay, setReplay] = useState<ForwardReplayResponse | null>(null);
  const [stateDocs, setStateDocs] = useState<ForwardStateDocsResponse | null>(null);
  const [contextLatest, setContextLatest] = useState<ForwardContextLatestResponse | null>(null);
  const [roomTimeline, setRoomTimeline] = useState<ForwardRoomTimelineResponse | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [agentsState, setAgentsState] = useState<LoadState>("idle");
  const [inboxState, setInboxState] = useState<LoadState>("idle");
  const [tasksState, setTasksState] = useState<LoadState>("idle");
  const [taskDetailState, setTaskDetailState] = useState<LoadState>("idle");
  const [workspacesState, setWorkspacesState] = useState<LoadState>("idle");
  const [workspaceDetailState, setWorkspaceDetailState] = useState<LoadState>("idle");
  const [workspaceMutationState, setWorkspaceMutationState] = useState<LoadState>("idle");
  const [workspaceLinkedTasksState, setWorkspaceLinkedTasksState] = useState<LoadState>("idle");
  const [workspaceTaskActionState, setWorkspaceTaskActionState] = useState<LoadState>("idle");
  const [runsState, setRunsState] = useState<LoadState>("idle");
  const [overviewState, setOverviewState] = useState<LoadState>("idle");
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [replayState, setReplayState] = useState<LoadState>("idle");
  const [stateDocsState, setStateDocsState] = useState<LoadState>("idle");
  const [contextState, setContextState] = useState<LoadState>("idle");
  const [roomState, setRoomState] = useState<LoadState>("idle");
  const [taskMutationState, setTaskMutationState] = useState<LoadState>("idle");
  const [taskArchiveState, setTaskArchiveState] = useState<LoadState>("idle");
  const [taskDeleteState, setTaskDeleteState] = useState<LoadState>("idle");
  const [taskApprovalRequestState, setTaskApprovalRequestState] = useState<LoadState>("idle");
  const [taskPresetState, setTaskPresetState] = useState<LoadState>("idle");
  const [taskBulkState, setTaskBulkState] = useState<LoadState>("idle");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [taskFilterStatus, setTaskFilterStatus] = useState(initialTaskFilterState.status);
  const [taskFilterOwner, setTaskFilterOwner] = useState(initialTaskFilterState.ownerAgentId);
  const [taskIncludeArchived, setTaskIncludeArchived] = useState(initialTaskFilterState.includeArchived);
  const [savedTaskFilterPresets, setSavedTaskFilterPresets] = useState<SavedTaskFilterPreset[]>(() => readSavedTaskFilterPresets());
  const [taskFilterPresetName, setTaskFilterPresetName] = useState("");
  const [taskArchiveRationale, setTaskArchiveRationale] = useState("");
  const [taskBulkArchiveRationale, setTaskBulkArchiveRationale] = useState("");
  const [taskApprovalRationale, setTaskApprovalRationale] = useState("");
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskDetailError, setTaskDetailError] = useState<string | null>(null);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [workspaceDetailError, setWorkspaceDetailError] = useState<string | null>(null);
  const [workspaceMutationError, setWorkspaceMutationError] = useState<string | null>(null);
  const [workspaceLinkedTasksError, setWorkspaceLinkedTasksError] = useState<string | null>(null);
  const [workspaceTaskActionError, setWorkspaceTaskActionError] = useState<string | null>(null);
  const [workspaceTaskActionMessage, setWorkspaceTaskActionMessage] = useState<string | null>(null);
  const [taskMutationError, setTaskMutationError] = useState<string | null>(null);
  const [taskArchiveError, setTaskArchiveError] = useState<string | null>(null);
  const [taskDeleteError, setTaskDeleteError] = useState<string | null>(null);
  const [taskApprovalRequestError, setTaskApprovalRequestError] = useState<string | null>(null);
  const [taskPresetError, setTaskPresetError] = useState<string | null>(null);
  const [taskBulkError, setTaskBulkError] = useState<string | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [stateDocsError, setStateDocsError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [taskBulkMessage, setTaskBulkMessage] = useState<string | null>(null);
  const [taskBulkReport, setTaskBulkReport] = useState<TaskBulkReport | null>(null);
  const [route, setRoute] = useState(() => parseForwardRoute(window.location.hash));
  const [liveRevision, setLiveRevision] = useState(0);
  const [detailTab, setDetailTab] = useState<DetailTab>("operations");
  const [taskDraft, setTaskDraft] = useState<OperatorTaskDraft>({
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
  });
  const [workspaceDraft, setWorkspaceDraft] = useState<OperatorWorkspaceDraft>({
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
  });
  const isOfficePreview = route.screen === "office-preview";
  const activeLinkedRunId =
    route.screen === "run-detail"
      ? route.runId
      : route.screen === "task-detail"
        ? (selectedTask?.task.linked_run_id ?? null)
        : null;
  const isDemo = !config.token.trim() && !isOfficePreview;
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const selectedAgent = demoFleet.find(a => a.id === selectedAgentId) ?? null;
  const [agentView, setAgentView] = useState<"fleet" | "graph">("fleet");
  const showOnboarding = (route.screen === "overview" || route.screen === "runs") && isDemo;

  const shellCopy = useMemo(() => {
    if (isOfficePreview) {
      return {
        eyebrow: "Spatial lens",
        title: "Conitens Control Plane",
        subtitle: "Room topology, crew focus, and handoff rhythm in one shared operator shell.",
      };
    }
    if (route.screen === "agents") {
      return {
        eyebrow: "Agent fleet",
        title: "Conitens Control Plane",
        subtitle: "Lifecycle, memory growth, proposal flow, and relationship topology for the active fleet.",
      };
    }
    if (route.screen === "run-detail") {
      return {
        eyebrow: "Run detail",
        title: "Conitens Control Plane",
        subtitle: "Replay, approvals, room state, and runtime documents in a single operational surface.",
      };
    }
    if (route.screen === "tasks" || route.screen === "task-detail") {
      return {
        eyebrow: "Operator tasks",
        title: "Conitens Control Plane",
        subtitle: isDemo
          ? "Use the demo shell or connect a live bridge to inspect canonical operator tasks."
          : "Operator tasks are the first owned API slice. Use them to inspect durable work objects without starting from raw runs.",
      };
    }
    if (route.screen === "workspaces" || route.screen === "workspace-detail") {
      return {
        eyebrow: "Operator workspaces",
        title: "Conitens Control Plane",
        subtitle: isDemo
          ? "Use the demo shell or connect a live bridge to inspect canonical operator workspaces."
          : "Operator workspaces are the next owned object layer. Use them to turn workspace refs into durable records.",
      };
    }
    if (route.screen === "runs") {
      return {
        eyebrow: "Execution traces",
        title: "Conitens Control Plane",
        subtitle: isDemo
          ? "Use the demo shell or connect a live bridge to inspect runs, approvals, and room timelines."
          : "Execution traces remain evidence-first. Use overview for posture, then drill into run detail when needed.",
      };
    }
    if (route.screen === "inbox") {
      return {
        eyebrow: "Operator inbox",
        title: "Conitens Control Plane",
        subtitle: isDemo
          ? "Use the demo shell or connect a live bridge to inspect actionable operator attention items."
          : "Operator inbox stays projection-first. Clear approvals, validator failures, blocked handoffs, and stale runs before drilling into traces.",
      };
    }
    return {
      eyebrow: "Operator overview",
      title: "Conitens Control Plane",
      subtitle: isDemo
        ? "Use the demo shell or connect a live bridge to inspect the current operator posture and execution traces."
        : "Operator summary stays projection-first. Use overview for posture and runs for evidence-rich drill-down.",
    };
  }, [isDemo, isOfficePreview, route.screen]);

  useEffect(() => {
    const handleHashChange = () => setRoute(parseForwardRoute(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    if (!window.location.hash) {
      window.location.hash = buildForwardRoute({ screen: "overview", runId: null, taskId: null });
    }
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (isOfficePreview || route.screen !== "overview" || !config.token.trim()) {
      setOperatorSummary(null);
      setOverviewState("idle");
      setOverviewError(null);
      return;
    }
    let cancelled = false;
    setOverviewState("loading");
    setOverviewError(null);
    forwardGetOperatorSummary(config)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setOperatorSummary(payload);
        setOverviewState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setOperatorSummary(null);
        setOverviewState("error");
        setOverviewError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, liveRevision]);

  useEffect(() => {
    if (isOfficePreview || route.screen !== "agents" || !config.token.trim()) {
      setOperatorAgents(null);
      setAgentsState("idle");
      setAgentsError(null);
      return;
    }
    let cancelled = false;
    setAgentsState("loading");
    setAgentsError(null);
    forwardGetOperatorAgents(config)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setOperatorAgents(payload);
        setAgentsState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setOperatorAgents(null);
        setAgentsState("error");
        setAgentsError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, liveRevision]);

  useEffect(() => {
    if (isOfficePreview || route.screen !== "inbox" || !config.token.trim()) {
      setOperatorInbox(null);
      setInboxState("idle");
      setInboxError(null);
      return;
    }
    let cancelled = false;
    setInboxState("loading");
    setInboxError(null);
    forwardGetOperatorInbox(config)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setOperatorInbox(payload);
        setInboxState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setOperatorInbox(null);
        setInboxState("error");
        setInboxError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, liveRevision]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || (route.screen !== "tasks" && route.screen !== "task-detail")) {
      setOperatorTasks(null);
      setTasksState("idle");
      setTasksError(null);
      return;
    }
    let cancelled = false;
    setTasksState("loading");
    setTasksError(null);
    forwardGetOperatorTasks(config, {
      status: taskFilterStatus !== "all" ? taskFilterStatus : undefined,
      ownerAgentId: taskFilterOwner.trim() || undefined,
      includeArchived: taskIncludeArchived,
    })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setOperatorTasks(payload);
        setTasksState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setOperatorTasks(null);
        setTasksState("error");
        setTasksError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, liveRevision, taskFilterOwner, taskFilterStatus, taskIncludeArchived]);

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
        if (cancelled) {
          return;
        }
        setOperatorWorkspaces(payload);
        setWorkspacesState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setOperatorWorkspaces(null);
        setWorkspacesState("error");
        setWorkspacesError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, liveRevision]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || route.screen !== "task-detail" || !route.taskId) {
      setSelectedTask(null);
      setTaskDetailState("idle");
      setTaskDetailError(null);
      return;
    }
    let cancelled = false;
    setTaskDetailState("loading");
    setTaskDetailError(null);
    forwardGetOperatorTask(config, route.taskId)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setSelectedTask(payload);
        setTaskDetailState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setSelectedTask(null);
        setTaskDetailState("error");
        setTaskDetailError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, route.taskId]);

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
        if (cancelled) {
          return;
        }
        setSelectedWorkspace(payload);
        setWorkspaceDetailState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setSelectedWorkspace(null);
        setWorkspaceDetailState("error");
        setWorkspaceDetailError(err.message);
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
        if (cancelled) {
          return;
        }
        setWorkspaceLinkedTasks(payload);
        setWorkspaceLinkedTasksState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setWorkspaceLinkedTasks(null);
        setWorkspaceLinkedTasksState("error");
        setWorkspaceLinkedTasksError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview, route.screen, route.workspaceId, liveRevision]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim()) {
      setRuns([]);
      setRunsState("idle");
      setRunsError(null);
      return;
    }
    let cancelled = false;
    setRunsState("loading");
    setRunsError(null);
    forwardGet(config, "/runs", parseRunsResponse)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setRuns(payload.runs);
        setRunsState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setRunsState("error");
        setRunsError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, isOfficePreview]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || !activeLinkedRunId) {
      setSelectedRun(null);
      setReplay(null);
      setStateDocs(null);
      setContextLatest(null);
      setRoomTimeline(null);
      setSelectedRoomId(null);
      setDetailState("idle");
      setReplayState("idle");
      setStateDocsState("idle");
      setContextState("idle");
      setRoomState("idle");
      setDetailError(null);
      setReplayError(null);
      setStateDocsError(null);
      setContextError(null);
      setRoomError(null);
      return;
    }
    let cancelled = false;
    setDetailState("loading");
    setReplayState("loading");
    setStateDocsState("loading");
    setContextState("loading");
    setRoomState("idle");
    setDetailError(null);
    setReplayError(null);
    setStateDocsError(null);
    setContextError(null);
    setRoomError(null);
    Promise.allSettled([
      forwardGet(config, `/runs/${encodeURIComponent(activeLinkedRunId)}`, parseRunDetailResponse),
      forwardGet(config, `/runs/${encodeURIComponent(activeLinkedRunId)}/replay`, parseReplayResponse),
      forwardGet(config, `/runs/${encodeURIComponent(activeLinkedRunId)}/state-docs`, parseStateDocsResponse),
      forwardGet(config, `/runs/${encodeURIComponent(activeLinkedRunId)}/context-latest`, parseContextLatestResponse),
    ])
      .then(([detailResult, replayResult, stateDocsResult, contextResult]) => {
        if (cancelled) {
          return;
        }
        if (detailResult.status === "fulfilled") {
          setSelectedRun(detailResult.value);
          setDetailState("ready");
          setDetailError(null);
        } else {
          setSelectedRun(null);
          setDetailState("error");
          setDetailError(toErrorMessage(detailResult.reason));
        }

        if (replayResult.status === "fulfilled") {
          setReplay(replayResult.value);
          setReplayState("ready");
          setReplayError(null);
          const roomOptions = extractRoomOptions(replayResult.value);
          setSelectedRoomId((current) => pickNextRoomId(current, roomOptions));
        } else {
          setReplay(null);
          setReplayState("error");
          setReplayError(toErrorMessage(replayResult.reason));
          setRoomTimeline(null);
          setSelectedRoomId(null);
          setRoomState("idle");
          setRoomError(null);
        }

        if (stateDocsResult.status === "fulfilled") {
          setStateDocs(stateDocsResult.value);
          setStateDocsState("ready");
          setStateDocsError(null);
        } else {
          setStateDocs(null);
          setStateDocsState("error");
          setStateDocsError(toErrorMessage(stateDocsResult.reason));
        }

        if (contextResult.status === "fulfilled") {
          setContextLatest(contextResult.value);
          setContextState("ready");
          setContextError(null);
        } else {
          setContextLatest(null);
          setContextState("error");
          setContextError(toErrorMessage(contextResult.reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeLinkedRunId, config, liveRevision, isOfficePreview]);

  useEffect(() => {
    if (isOfficePreview || !config.token.trim() || !selectedRoomId) {
      setRoomTimeline(null);
      setRoomState("idle");
      setRoomError(null);
      return;
    }
    let cancelled = false;
    setRoomState("loading");
    setRoomError(null);
    forwardGet(config, `/rooms/${encodeURIComponent(selectedRoomId)}/timeline`, parseRoomTimelineResponse)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setRoomTimeline(payload);
        setRoomState("ready");
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setRoomTimeline(null);
        setRoomState("error");
        setRoomError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config, selectedRoomId, isOfficePreview]);

  const liveAgentProfiles = useMemo(
    () => (operatorAgents ? toOperatorAgentProfiles(operatorAgents) : []),
    [operatorAgents],
  );
  const visibleTaskRecords = useMemo(() => operatorTasks?.tasks ?? [], [operatorTasks]);
  const taskItems = useMemo(() => (operatorTasks ? toOperatorTaskListItems(operatorTasks) : []), [operatorTasks]);
  const taskDetail = useMemo(() => (selectedTask ? toOperatorTaskDetail(selectedTask) : null), [selectedTask]);
  const workspaceItems = useMemo(
    () => (operatorWorkspaces ? toOperatorWorkspaceListItems(operatorWorkspaces) : []),
    [operatorWorkspaces],
  );
  const workspaceDetail = useMemo(
    () => (selectedWorkspace ? toOperatorWorkspaceDetail(selectedWorkspace) : null),
    [selectedWorkspace],
  );
  const workspaceQuickStatusActions = useMemo(
    () => (workspaceDetail ? getOperatorWorkspaceQuickStatusActions(workspaceDetail.status, workspaceDraft) : []),
    [workspaceDetail, workspaceDraft],
  );
  const workspaceLinkedTaskItems = useMemo(
    () => (workspaceLinkedTasks?.tasks ?? []).map((task) => ({
      taskId: task.task_id,
      title: task.title,
      status: task.status,
      owner: task.owner_agent_id ?? "unassigned",
      archived: Boolean(task.archived_at),
    })),
    [workspaceLinkedTasks],
  );
  const workspaceOptions = useMemo(() => {
    const options: OperatorTaskWorkspaceOption[] = (operatorWorkspaces?.workspaces ?? []).map((workspace) => ({
      id: workspace.workspace_id,
      label: `${workspace.label} | ${workspace.status}`,
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
  const linkedWorkspaceOption = useMemo(() => {
    if (!taskDetail) {
      return null;
    }
    const workspaceId = taskDetail.stats.find((item) => item.label === "Workspace")?.value;
    if (!workspaceId || workspaceId === "none") {
      return null;
    }
    return workspaceOptions.find((option) => option.id === workspaceId) ?? null;
  }, [taskDetail, workspaceOptions]);
  const unresolvedTaskWorkspaceRef = useMemo(() => {
    if (!taskDetail) {
      return null;
    }
    const workspaceId = taskDetail.stats.find((item) => item.label === "Workspace")?.value;
    if (!workspaceId || workspaceId === "none" || linkedWorkspaceOption) {
      return null;
    }
    return workspaceId;
  }, [taskDetail, linkedWorkspaceOption]);
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
    [visibleTaskRecords, selectedTaskIds],
  );
  const inboxItems = useMemo(() => (operatorInbox ? toOperatorInboxViewModel(operatorInbox) : []), [operatorInbox]);
  const runItems = useMemo(() => runs.map(toRunListItemViewModel), [runs]);
  const overview = useMemo(() => (operatorSummary ? toOperatorSummaryViewModel(operatorSummary) : null), [operatorSummary]);
  const runDetail = useMemo(() => (selectedRun ? toRunDetailViewModel(selectedRun) : null), [selectedRun]);
  const roomOptions = useMemo(() => (replay ? extractRoomOptions(replay) : []), [replay]);
  const taskRoomOptions = useMemo(() => {
    if (!taskDetail || taskDetail.linkedRoomIds.length === 0) {
      return roomOptions;
    }
    const filtered = roomOptions.filter((room) => taskDetail.linkedRoomIds.includes(room.roomId));
    return filtered.length > 0 ? filtered : roomOptions;
  }, [roomOptions, taskDetail]);
  const graphModel = useMemo(
    () => (selectedRun && replay ? deriveForwardGraphModel(selectedRun, replay, roomTimeline) : null),
    [selectedRun, replay, roomTimeline],
  );
  const insightCards = useMemo(() => toInsightCardViewModels(replay, roomTimeline), [replay, roomTimeline]);
  const findingsSummary = useMemo(() => summarizeFindingsDocument(stateDocs), [stateDocs]);
  const validatorCorrelations = useMemo(() => summarizeValidatorCorrelations(replay), [replay]);
  const agentProfiles = isDemo ? demoFleet : liveAgentProfiles;
  const activeAgent = agentProfiles.find((agent) => agent.id === selectedAgentId) ?? null;
  const taskChangedFields = useMemo(() => {
    if (!taskDetail) {
      return [] as string[];
    }
    const fields: string[] = [];
    const draftAcceptance = taskDraft.acceptance.split("\n").map((item) => item.trim()).filter(Boolean).join("|");
    const currentAcceptance = taskDetail.acceptance.join("|");
    const currentPriority = taskDetail.stats.find((item) => item.label === "Priority")?.value ?? "medium";
    const currentWorkspace =
      taskDetail.stats.find((item) => item.label === "Workspace")?.value === "none"
        ? ""
        : (taskDetail.stats.find((item) => item.label === "Workspace")?.value ?? "");

    if (taskDraft.title !== taskDetail.title) fields.push("title");
    if (taskDraft.objective !== taskDetail.objective) fields.push("objective");
    if (taskDraft.status !== taskDetail.status) fields.push("status");
    if (taskDraft.priority !== currentPriority) fields.push("priority");
    if (taskDraft.ownerAgentId !== (taskDetail.owner === "unassigned" ? "" : taskDetail.owner)) fields.push("owner_agent_id");
    if (taskDraft.linkedRunId !== (taskDetail.linkedRunId ?? "")) fields.push("linked_run_id");
    if (taskDraft.linkedIterationId !== (taskDetail.linkedIterationId ?? "")) fields.push("linked_iteration_id");
    if (taskDraft.linkedRoomIds.split(",").map((item) => item.trim()).filter(Boolean).join("|") !== taskDetail.linkedRoomIds.join("|")) {
      fields.push("linked_room_ids");
    }
    if (taskDraft.blockedReason !== (taskDetail.blockedReason ?? "")) fields.push("blocked_reason");
    if (draftAcceptance !== currentAcceptance) fields.push("acceptance_json");
    if (taskDraft.workspaceRef !== currentWorkspace) fields.push("workspace_ref");
    return fields;
  }, [taskDetail, taskDraft]);
  const taskSensitiveFields = useMemo(
    () => taskChangedFields.filter((field) => ["status", "owner_agent_id", "linked_run_id", "linked_iteration_id", "linked_room_ids", "workspace_ref"].includes(field)),
    [taskChangedFields],
  );
  const taskApprovalHint = useMemo(() => {
    if (!taskDetail || !taskDetail.linkedRunId || taskSensitiveFields.length === 0) {
      return null;
    }
    return "These changes touch execution-sensitive fields. If the linked run has a pending approval, save may be blocked and you should request review first.";
  }, [taskDetail, taskSensitiveFields]);

  useEffect(() => {
    persistTaskFilterState({
      status: taskFilterStatus,
      ownerAgentId: taskFilterOwner,
      includeArchived: taskIncludeArchived,
    });
  }, [taskFilterStatus, taskFilterOwner, taskIncludeArchived]);

  useEffect(() => {
    const visibleIds = new Set(visibleTaskRecords.map((task) => task.task_id));
    setSelectedTaskIds((current) => {
      const next = current.filter((taskId) => visibleIds.has(taskId));
      return next.length === current.length ? current : next;
    });
  }, [visibleTaskRecords]);

  useEffect(() => {
    if (route.screen === "task-detail" && taskDetail) {
      setTaskDraft({
        title: taskDetail.title,
        objective: taskDetail.objective,
        status: taskDetail.status,
        priority: taskDetail.stats.find((item) => item.label === "Priority")?.value ?? "medium",
        ownerAgentId: taskDetail.owner === "unassigned" ? "" : taskDetail.owner,
        linkedRunId: taskDetail.linkedRunId ?? "",
        linkedIterationId: taskDetail.linkedIterationId ?? "",
        linkedRoomIds: "",
        blockedReason: taskDetail.blockedReason ?? "",
        acceptance: taskDetail.acceptance.join("\n"),
        workspaceRef: taskDetail.stats.find((item) => item.label === "Workspace")?.value === "none"
          ? ""
          : (taskDetail.stats.find((item) => item.label === "Workspace")?.value ?? ""),
      });
      setTaskMutationState("idle");
      setTaskMutationError(null);
      setTaskArchiveState("idle");
      setTaskArchiveError(null);
      setTaskDeleteState("idle");
      setTaskDeleteError(null);
      setTaskArchiveRationale(taskDetail.archiveNote ?? "");
      setTaskBulkState("idle");
      setTaskBulkError(null);
      setTaskBulkMessage(null);
      setTaskBulkReport(null);
      setTaskApprovalRequestState("idle");
      setTaskApprovalRequestError(null);
      setTaskApprovalRationale("");
      return;
    }
    if (route.screen === "tasks") {
      setTaskDraft({
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
      });
      setTaskMutationState("idle");
      setTaskMutationError(null);
      setTaskArchiveState("idle");
      setTaskArchiveError(null);
      setTaskDeleteState("idle");
      setTaskDeleteError(null);
      setTaskArchiveRationale("");
      setTaskBulkState("idle");
      setTaskBulkError(null);
      setTaskBulkMessage(null);
      setTaskBulkReport(null);
      setTaskApprovalRequestState("idle");
      setTaskApprovalRequestError(null);
      setTaskApprovalRationale("");
    }
  }, [route.screen, taskDetail]);

  useEffect(() => {
    if (route.screen === "workspace-detail" && workspaceDetail) {
      setWorkspaceDraft({
        label: workspaceDetail.label,
        path: workspaceDetail.path,
        kind: workspaceDetail.kind,
        status: workspaceDetail.status,
        archiveNote: workspaceDetail.archiveNote ?? "",
        ownerAgentId: workspaceDetail.owner === "unassigned" ? "" : workspaceDetail.owner,
        linkedRunId: workspaceDetail.linkedRunId ?? "",
        linkedIterationId: workspaceDetail.linkedIterationId ?? "",
        taskIds: workspaceDetail.taskIds.join(", "),
        notes: workspaceDetail.notes ?? "",
      });
      setWorkspaceMutationState("idle");
      setWorkspaceMutationError(null);
      return;
    }
    if (route.screen === "workspaces") {
      setWorkspaceDraft({
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
      });
      setWorkspaceMutationState("idle");
      setWorkspaceMutationError(null);
    }
  }, [route.screen, workspaceDetail]);

  useEffect(() => {
    if (route.screen !== "agents") {
      return;
    }
    if (agentProfiles.length === 0) {
      if (selectedAgentId !== null) {
        setSelectedAgentId(null);
      }
      return;
    }
    if (!selectedAgentId || !agentProfiles.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(agentProfiles[0]?.id ?? null);
    }
  }, [agentProfiles, route.screen, selectedAgentId]);

  const connect = (event: React.FormEvent) => {
    event.preventDefault();
    persistBridgeConfig(draftConfig);
    setConfig(draftConfig);
  };

  const openRun = (runId: string) => {
    window.location.hash = buildForwardRoute({ screen: "run-detail", runId, taskId: null });
  };

  const openTask = (taskId: string) => {
    window.location.hash = buildForwardRoute({ screen: "task-detail", runId: null, taskId });
  };

  const openWorkspace = (workspaceId: string) => {
    window.location.hash = buildForwardRoute({ screen: "workspace-detail", runId: null, taskId: null, workspaceId });
  };

  function applySavedTaskFilterPreset(preset: SavedTaskFilterPreset) {
    setTaskFilterStatus(preset.status);
    setTaskFilterOwner(preset.ownerAgentId);
    setTaskIncludeArchived(preset.includeArchived);
    setTaskPresetState("ready");
    setTaskPresetError(null);
  }

  function handleSaveTaskFilterPreset() {
    const name = taskFilterPresetName.trim();
    if (!name) {
      setTaskPresetState("error");
      setTaskPresetError("Preset name is required.");
      return;
    }
    const existing = savedTaskFilterPresets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
    const nextPreset: SavedTaskFilterPreset = {
      id: existing?.id ?? `task-filter-${Date.now().toString(36)}`,
      name,
      status: taskFilterStatus,
      ownerAgentId: taskFilterOwner.trim(),
      includeArchived: taskIncludeArchived,
    };
    const nextPresets = existing
      ? savedTaskFilterPresets.map((preset) => (preset.id === existing.id ? nextPreset : preset))
      : [nextPreset, ...savedTaskFilterPresets].slice(0, 6);
    setSavedTaskFilterPresets(nextPresets);
    persistSavedTaskFilterPresets(nextPresets);
    setTaskFilterPresetName("");
    setTaskPresetState("ready");
    setTaskPresetError(null);
  }

  function handleDeleteTaskFilterPreset(presetId: string) {
    const nextPresets = savedTaskFilterPresets.filter((preset) => preset.id !== presetId);
    setSavedTaskFilterPresets(nextPresets);
    persistSavedTaskFilterPresets(nextPresets);
    setTaskPresetState("ready");
    setTaskPresetError(null);
  }

  function toggleTaskSelection(taskId: string) {
    setSelectedTaskIds((current) =>
      current.includes(taskId) ? current.filter((item) => item !== taskId) : [...current, taskId],
    );
  }

  function replaceTaskSelection(taskIds: string[]) {
    setSelectedTaskIds(Array.from(new Set(taskIds)));
  }

  async function refreshTasksAndSelection(nextTaskId: string | null = null, includeArchived = taskIncludeArchived) {
    const tasksPayload = await forwardGetOperatorTasks(config, {
      status: taskFilterStatus !== "all" ? taskFilterStatus : undefined,
      ownerAgentId: taskFilterOwner.trim() || undefined,
      includeArchived,
    });
    setOperatorTasks(tasksPayload);
    if (nextTaskId) {
      const taskPayload = await forwardGetOperatorTask(config, nextTaskId);
      setSelectedTask(taskPayload);
      window.location.hash = buildForwardRoute({ screen: "task-detail", runId: null, taskId: nextTaskId });
    } else {
      setSelectedTask(null);
      window.location.hash = buildForwardRoute({ screen: "tasks", runId: null, taskId: null });
    }
    setLiveRevision((current) => current + 1);
  }

  async function refreshWorkspacesAndSelection(nextWorkspaceId: string | null = null) {
    const workspacesPayload = await forwardGetOperatorWorkspaces(config);
    setOperatorWorkspaces(workspacesPayload);
    if (nextWorkspaceId) {
      const workspacePayload = await forwardGetOperatorWorkspace(config, nextWorkspaceId);
      setSelectedWorkspace(workspacePayload);
      window.location.hash = buildForwardRoute({ screen: "workspace-detail", runId: null, taskId: null, workspaceId: nextWorkspaceId });
    } else {
      setSelectedWorkspace(null);
      window.location.hash = buildForwardRoute({ screen: "workspaces", runId: null, taskId: null, workspaceId: null });
    }
    setLiveRevision((current) => current + 1);
  }

  async function handleWorkspaceSubmit() {
    if (!config.token.trim()) {
      return;
    }
    if (operatorWorkspaceNeedsArchiveRationale(workspaceDraft.status, workspaceDraft)) {
      setWorkspaceMutationState("error");
      setWorkspaceMutationError("Workspace archive rationale is required.");
      return;
    }
    const body = buildOperatorWorkspaceMutationBody(workspaceDraft);
    try {
      setWorkspaceMutationState("loading");
      setWorkspaceMutationError(null);
      const result = route.screen === "workspace-detail" && route.workspaceId
        ? await forwardUpdateOperatorWorkspace(config, route.workspaceId, body)
        : await forwardCreateOperatorWorkspace(config, body);
      await refreshWorkspacesAndSelection(result.workspace.workspace_id);
      setWorkspaceMutationState("ready");
    } catch (error) {
      setWorkspaceMutationState("error");
      setWorkspaceMutationError(toErrorMessage(error));
    }
  }

  async function handleWorkspaceQuickStatus(status: string) {
    if (!config.token.trim() || route.screen !== "workspace-detail" || !route.workspaceId) {
      return;
    }
    if (operatorWorkspaceNeedsArchiveRationale(status, workspaceDraft)) {
      setWorkspaceMutationState("error");
      setWorkspaceMutationError("Workspace archive rationale is required.");
      return;
    }
    const body = buildOperatorWorkspaceMutationBody(workspaceDraft, status);
    try {
      setWorkspaceMutationState("loading");
      setWorkspaceMutationError(null);
      const result = await forwardUpdateOperatorWorkspace(config, route.workspaceId, body);
      await refreshWorkspacesAndSelection(result.workspace.workspace_id);
      setWorkspaceMutationState("ready");
    } catch (error) {
      setWorkspaceMutationState("error");
      setWorkspaceMutationError(toErrorMessage(error));
    }
  }

  async function handleWorkspaceDetachTask(taskId: string) {
    if (!config.token.trim() || route.screen !== "workspace-detail" || !route.workspaceId) {
      return;
    }
    try {
      setWorkspaceTaskActionState("loading");
      setWorkspaceTaskActionError(null);
      setWorkspaceTaskActionMessage(null);
      await forwardDetachOperatorTaskWorkspace(config, taskId);
      await refreshWorkspacesAndSelection(route.workspaceId);
      setWorkspaceTaskActionState("ready");
      setWorkspaceTaskActionMessage(`Detached ${taskId} from ${route.workspaceId}.`);
    } catch (error) {
      setWorkspaceTaskActionState("error");
      setWorkspaceTaskActionError(toErrorMessage(error));
    }
  }

  async function handleWorkspaceArchiveTask(taskId: string) {
    if (!config.token.trim() || route.screen !== "workspace-detail" || !route.workspaceId) {
      return;
    }
    const rationale =
      workspaceDraft.archiveNote.trim() ||
      `Workspace archive blocker resolution for ${route.workspaceId}.`;
    try {
      setWorkspaceTaskActionState("loading");
      setWorkspaceTaskActionError(null);
      setWorkspaceTaskActionMessage(null);
      await forwardArchiveOperatorTask(config, taskId, { archive_note: rationale });
      await refreshWorkspacesAndSelection(route.workspaceId);
      setWorkspaceTaskActionState("ready");
      setWorkspaceTaskActionMessage(`Archived linked task ${taskId}.`);
    } catch (error) {
      setWorkspaceTaskActionState("error");
      setWorkspaceTaskActionError(toErrorMessage(error));
    }
  }

  async function handleBulkTaskLifecycle(action: TaskBulkAction) {
    if (!config.token.trim()) {
      return;
    }
    const targetScope = selectedVisibleTaskRecords.length > 0 ? "selected" : "visible";
    const baseCandidates = targetScope === "selected" ? selectedVisibleTaskRecords : visibleTaskRecords;
    const candidates = baseCandidates.filter((task) => (action === "archive" ? !task.archived_at : Boolean(task.archived_at)));
    if (candidates.length === 0) {
      setTaskBulkState("error");
      setTaskBulkError(`No ${targetScope} tasks can be ${action}d right now.`);
      setTaskBulkMessage(null);
      setTaskBulkReport(null);
      return;
    }
    const archiveNote = taskBulkArchiveRationale.trim();
    if (action === "archive" && !archiveNote) {
      setTaskBulkState("error");
      setTaskBulkError("Bulk archive rationale is required.");
      setTaskBulkMessage(null);
      setTaskBulkReport(null);
      return;
    }
    const confirmed = window.confirm(
      action === "archive"
        ? `Archive ${candidates.length} ${targetScope} task(s)?`
        : `Restore ${candidates.length} ${targetScope} task(s)?`,
    );
    if (!confirmed) {
      return;
    }

    const failures: Array<{ taskId: string; error: string }> = [];
    const successes: string[] = [];
    try {
      setTaskBulkState("loading");
      setTaskBulkError(null);
      setTaskBulkMessage(null);
      setTaskBulkReport(null);
      for (const task of candidates) {
        try {
          if (action === "archive") {
            await forwardArchiveOperatorTask(config, task.task_id, { archive_note: archiveNote });
          } else {
            await forwardRestoreOperatorTask(config, task.task_id);
          }
          successes.push(task.task_id);
        } catch (error) {
          failures.push({ taskId: task.task_id, error: toErrorMessage(error) });
        }
      }
      const affectedCurrentTask =
        route.screen === "task-detail" &&
        route.taskId != null &&
        candidates.some((task) => task.task_id === route.taskId);
      const nextIncludeArchived =
        action === "archive" && affectedCurrentTask ? true : taskIncludeArchived;
      if (nextIncludeArchived !== taskIncludeArchived) {
        setTaskIncludeArchived(nextIncludeArchived);
      }
      await refreshTasksAndSelection(route.screen === "task-detail" ? route.taskId : null, nextIncludeArchived);
      setTaskBulkReport({
        action,
        targetScope,
        attempted: candidates.length,
        succeeded: successes,
        failed: failures,
      });
      setSelectedTaskIds((current) => current.filter((taskId) => !successes.includes(taskId)));
      if (action === "archive" && successes.length > 0) {
        setTaskBulkArchiveRationale("");
      }
      if (failures.length > 0) {
        setTaskBulkState("error");
        setTaskBulkError(failures.slice(0, 3).map((failure) => `${failure.taskId}: ${failure.error}`).join(" | "));
        setTaskBulkMessage(`${action === "archive" ? "Archived" : "Restored"} ${successes.length} of ${candidates.length} ${targetScope} task(s).`);
        return;
      }
      setTaskBulkState("ready");
      setTaskBulkError(null);
      setTaskBulkMessage(`${action === "archive" ? "Archived" : "Restored"} ${successes.length} ${targetScope} task(s).`);
    } catch (error) {
      setTaskBulkState("error");
      setTaskBulkError(toErrorMessage(error));
      setTaskBulkReport({
        action,
        targetScope,
        attempted: candidates.length,
        succeeded: successes,
        failed: failures,
      });
      setTaskBulkMessage(
        successes.length > 0 ? `${action === "archive" ? "Archived" : "Restored"} ${successes.length} ${targetScope} task(s) before the failure.` : null,
      );
    }
  }

  async function handleTaskSubmit() {
    if (!config.token.trim()) {
      return;
    }
    const body = {
      title: taskDraft.title,
      objective: taskDraft.objective,
      status: taskDraft.status,
      priority: taskDraft.priority,
      owner_agent_id: taskDraft.ownerAgentId || undefined,
      linked_run_id: taskDraft.linkedRunId || undefined,
      linked_iteration_id: taskDraft.linkedIterationId || undefined,
      linked_room_ids: taskDraft.linkedRoomIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      blocked_reason: taskDraft.blockedReason || undefined,
      acceptance_json: taskDraft.acceptance
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      workspace_ref: taskDraft.workspaceRef || undefined,
    };
    try {
      setTaskMutationState("loading");
      setTaskMutationError(null);
      const result = route.screen === "task-detail" && route.taskId
        ? await forwardUpdateOperatorTask(config, route.taskId, body)
        : await forwardCreateOperatorTask(config, body);
      await refreshTasksAndSelection(result.task.task_id);
      setTaskMutationState("ready");
    } catch (error) {
      setTaskMutationState("error");
      setTaskMutationError(toErrorMessage(error));
    }
  }

  async function handleTaskQuickStatus(status: string) {
    if (!config.token.trim() || route.screen !== "task-detail" || !route.taskId) {
      return;
    }
    const body = {
      title: taskDraft.title,
      objective: taskDraft.objective,
      status,
      priority: taskDraft.priority,
      owner_agent_id: taskDraft.ownerAgentId || undefined,
      linked_run_id: taskDraft.linkedRunId || undefined,
      linked_iteration_id: taskDraft.linkedIterationId || undefined,
      linked_room_ids: taskDraft.linkedRoomIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      blocked_reason: taskDraft.blockedReason || undefined,
      acceptance_json: taskDraft.acceptance
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      workspace_ref: taskDraft.workspaceRef || undefined,
    };
    try {
      setTaskMutationState("loading");
      setTaskMutationError(null);
      const result = await forwardUpdateOperatorTask(config, route.taskId, body);
      setTaskDraft((current) => ({ ...current, status }));
      await refreshTasksAndSelection(result.task.task_id);
      setTaskMutationState("ready");
    } catch (error) {
      setTaskMutationState("error");
      setTaskMutationError(toErrorMessage(error));
    }
  }

  async function handleTaskArchive() {
    if (!config.token.trim() || route.screen !== "task-detail" || !route.taskId) {
      return;
    }
    const archiveNote = taskArchiveRationale.trim();
    if (!archiveNote) {
      setTaskArchiveState("error");
      setTaskArchiveError("Archive rationale is required.");
      return;
    }
    const confirmed = window.confirm(
      "Archive this operator task? It will be hidden from the default task queue but linked evidence will remain.",
    );
    if (!confirmed) {
      return;
    }
    try {
      setTaskArchiveState("loading");
      setTaskArchiveError(null);
      await forwardArchiveOperatorTask(config, route.taskId, { archive_note: archiveNote });
      setTaskIncludeArchived(true);
      await refreshTasksAndSelection(route.taskId, true);
      setTaskArchiveState("ready");
    } catch (error) {
      setTaskArchiveState("error");
      setTaskArchiveError(toErrorMessage(error));
    }
  }

  async function handleTaskRestore() {
    if (!config.token.trim() || route.screen !== "task-detail" || !route.taskId) {
      return;
    }
    try {
      setTaskArchiveState("loading");
      setTaskArchiveError(null);
      await forwardRestoreOperatorTask(config, route.taskId);
      await refreshTasksAndSelection(route.taskId, taskIncludeArchived);
      setTaskArchiveState("ready");
    } catch (error) {
      setTaskArchiveState("error");
      setTaskArchiveError(toErrorMessage(error));
    }
  }

  async function handleTaskDelete() {
    if (!config.token.trim() || route.screen !== "task-detail" || !route.taskId) {
      return;
    }
    const confirmed = window.confirm(
      "Delete this canonical operator task? Linked run, replay, and approval evidence will remain in history.",
    );
    if (!confirmed) {
      return;
    }
    try {
      setTaskDeleteState("loading");
      setTaskDeleteError(null);
      await forwardDeleteOperatorTask(config, route.taskId);
      await refreshTasksAndSelection(null);
      setTaskDeleteState("ready");
    } catch (error) {
      setTaskDeleteState("error");
      setTaskDeleteError(toErrorMessage(error));
    }
  }

  async function handleTaskRequestApproval() {
    if (!config.token.trim() || route.screen !== "task-detail" || !route.taskId) {
      return;
    }
    try {
      setTaskApprovalRequestState("loading");
      setTaskApprovalRequestError(null);
      await forwardRequestOperatorTaskApproval(config, route.taskId, {
        rationale: taskApprovalRationale.trim() || "Operator requested task review from the shell.",
        requested_changes: taskChangedFields,
        draft_snapshot: {
          title: taskDraft.title,
          objective: taskDraft.objective,
          status: taskDraft.status,
          priority: taskDraft.priority,
          owner_agent_id: taskDraft.ownerAgentId || null,
          linked_run_id: taskDraft.linkedRunId || null,
          linked_iteration_id: taskDraft.linkedIterationId || null,
          linked_room_ids: taskDraft.linkedRoomIds
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          blocked_reason: taskDraft.blockedReason || null,
          acceptance_json: taskDraft.acceptance
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          workspace_ref: taskDraft.workspaceRef || null,
        },
      });
      setTaskApprovalRequestState("ready");
      setLiveRevision((current) => current + 1);
    } catch (error) {
      setTaskApprovalRequestState("error");
      setTaskApprovalRequestError(toErrorMessage(error));
    }
  }

  const handleStreamSnapshot = useEffectEvent(() => {
    setLiveRevision((current) => current + 1);
  });

  const liveStream = useForwardStream({
    config,
    runId: activeLinkedRunId,
    roomId: selectedRoomId,
    enabled: Boolean(activeLinkedRunId) && !isOfficePreview,
    onSnapshot: handleStreamSnapshot,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (isOfficePreview) return;

      switch (e.key) {
        case "j": {
          const idx = runItems.findIndex((item) => item.runId === route.runId);
          const next = runItems[idx + 1];
          if (next) openRun(next.runId);
          break;
        }
        case "k": {
          const idx = runItems.findIndex((item) => item.runId === route.runId);
          const prev = runItems[idx - 1];
          if (prev) openRun(prev.runId);
          break;
        }
        case "r": {
          e.preventDefault();
          setLiveRevision((current) => current + 1);
          break;
        }
        case "Escape": {
          window.location.hash = buildForwardRoute({ screen: "overview", runId: null, taskId: null });
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runItems, route, isOfficePreview]);

  return (
    <div className={`forward-shell${isOfficePreview ? " forward-shell-preview" : ""}`}>
      <header className="forward-header">
        <div>
          <p className="forward-eyebrow">{shellCopy.eyebrow}</p>
          <h1>{shellCopy.title}</h1>
          <p className="forward-subtitle">{shellCopy.subtitle}</p>
        </div>
        <div className="forward-chip-row">
          <a className={`forward-chip forward-chip-link${route.screen === "overview" ? " active" : ""}`} href="#/overview">Overview</a>
          <a className={`forward-chip forward-chip-link${route.screen === "inbox" ? " active" : ""}`} href="#/inbox">Inbox</a>
          <a className={`forward-chip forward-chip-link${route.screen === "tasks" || route.screen === "task-detail" ? " active" : ""}`} href="#/tasks">Tasks</a>
          <a className={`forward-chip forward-chip-link${route.screen === "workspaces" || route.screen === "workspace-detail" ? " active" : ""}`} href="#/workspaces">Workspaces</a>
          <a className={`forward-chip forward-chip-link${route.screen === "runs" || route.screen === "run-detail" ? " active" : ""}`} href="#/runs">Runs</a>
          <a className={`forward-chip forward-chip-link${isOfficePreview ? " active" : ""}`} href="#/office-preview">Spatial Lens</a>
          <a className={`forward-chip forward-chip-link${route.screen === "agents" ? " active" : ""}`} href="#/agents">Agents</a>
          {isOfficePreview ? (
            <span className="forward-chip">Preview data</span>
          ) : (
            <>
              <span className="forward-chip">API {config.apiRoot}</span>
              <span className="forward-chip">{config.token ? "Token loaded" : "Token required"}</span>
              <span className="forward-chip">Live: {liveStream.status}</span>
            </>
          )}
        </div>
      </header>

      {isOfficePreview ? (
        <main className="forward-main forward-main-preview">
          <PixelOffice agents={demoAgents} tasks={demoTasks} events={demoEvents} />
        </main>
      ) : route.screen === "agents" ? (
        <main className="forward-main">
          <div className="forward-tab-bar">
            <button
              className={`forward-tab${agentView === "fleet" ? " active" : ""}`}
              onClick={() => setAgentView("fleet")}
            >
              Fleet
            </button>
            <button
              className={`forward-tab${agentView === "graph" ? " active" : ""}`}
              onClick={() => setAgentView("graph")}
              disabled={!isDemo}
            >
              Relationships
            </button>
          </div>
          {!isDemo && agentsState === "loading" ? <p className="forward-empty">Loading agent roster...</p> : null}
          {!isDemo && agentsState === "error" ? <p className="forward-error">{agentsError}</p> : null}
          {!isDemo && agentsState === "ready" && agentProfiles.length === 0 ? (
            <div className="forward-placeholder">
              <h3>No operator agents projected</h3>
              <p>No agent identifiers have been derived from the current forward state yet.</p>
            </div>
          ) : null}
          {(isDemo || (agentsState === "ready" && agentProfiles.length > 0)) && (agentView === "fleet" || !isDemo) ? (
            <div className="agent-fleet-layout">
              <AgentFleetOverview agents={agentProfiles} selectedAgentId={selectedAgentId} onSelectAgent={setSelectedAgentId} />
              <AgentProfilePanel
                agent={activeAgent}
                evolution={isDemo ? demoEvolution.filter(e => e.agentId === selectedAgentId) : []}
                metrics={isDemo ? (demoLearningMetrics.find(m => m.agentId === selectedAgentId) ?? null) : null}
              />
            </div>
          ) : null}
          {isDemo && agentView === "graph" ? <AgentRelationshipGraph agents={demoFleet} /> : null}
          {isDemo ? (
            <ProposalQueuePanel proposals={demoProposals} agents={demoFleet} />
          ) : agentsState === "ready" && agentProfiles.length > 0 ? (
            <div className="forward-placeholder">
              <h3>Live relationship graph and proposal queue are still deferred</h3>
              <p>The roster is now live. Graph and proposal/evolution projections will follow in a later slice.</p>
            </div>
          ) : null}
        </main>
      ) : (
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
        {!isDemo || showConnectForm ? (
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
                    <div key={item.taskId} className="forward-run-row">
                      {!isDemo ? (
                        <label className="forward-task-select">
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.includes(item.taskId)}
                            onChange={() => toggleTaskSelection(item.taskId)}
                          />
                          <span>Select</span>
                        </label>
                      ) : null}
                      <button
                        className={`forward-run-item${route.taskId === item.taskId ? " active" : ""}${item.status === "in_progress" ? " running" : ""}`}
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
                  ).map((item) => (
                    <button
                      key={item.workspaceId}
                      className={`forward-run-item${route.workspaceId === item.workspaceId ? " active" : ""}`}
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
                  ))}
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
                      }
                    : overview
                }
                state={isDemo ? "ready" : overviewState}
                error={overviewError}
              />
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
                      : workspaceDetail
                  }
                  state={isDemo ? "ready" : route.screen === "workspaces" ? workspacesState : workspaceDetailState}
                  error={workspaceDetailError}
                  mutationState={isDemo ? "ready" : workspaceMutationState}
                  mutationError={workspaceMutationError}
                  onQuickStatus={!isDemo && route.screen === "workspace-detail" ? handleWorkspaceQuickStatus : undefined}
                  quickStatusActions={!isDemo && route.screen === "workspace-detail" ? workspaceQuickStatusActions : undefined}
                  linkedTasks={isDemo ? [] : workspaceLinkedTaskItems}
                  linkedTasksState={isDemo ? "ready" : workspaceLinkedTasksState}
                  linkedTasksError={workspaceLinkedTasksError}
                  taskActionState={isDemo ? "ready" : workspaceTaskActionState}
                  taskActionError={workspaceTaskActionError}
                  taskActionMessage={workspaceTaskActionMessage}
                  onOpenTask={!isDemo ? openTask : undefined}
                  onDetachTask={!isDemo ? handleWorkspaceDetachTask : undefined}
                  onArchiveTask={!isDemo ? handleWorkspaceArchiveTask : undefined}
                />
                {!isDemo && (route.screen !== "workspace-detail" || workspaceDetail?.status !== "archived") ? (
                  <OperatorWorkspaceEditorPanel
                    mode={route.screen === "workspace-detail" ? "edit" : "create"}
                    draft={workspaceDraft}
                    state={workspaceMutationState}
                    error={workspaceMutationError}
                    onChange={setWorkspaceDraft}
                    onSubmit={handleWorkspaceSubmit}
                  />
                ) : !isDemo && route.screen === "workspace-detail" ? (
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
                  <div className="forward-tab-bar">
                    {(["operations", "intelligence", "data"] as const).map((tab) => (
                      <button
                        key={tab}
                        className={`forward-tab${detailTab === tab ? " active" : ""}`}
                        onClick={() => setDetailTab(tab)}
                      >
                        {tab === "operations" ? "Operations" : tab === "intelligence" ? "Intelligence" : "Data"}
                      </button>
                    ))}
                  </div>
                  {detailTab === "operations" && (
                    <>
                      <ForwardApprovalCenterPanel config={config} runId={runDetail.runId} />
                      <ForwardReplayPanel replay={replay} state={replayState} error={replayError} />
                    </>
                  )}
                  {detailTab === "intelligence" && (
                    <>
                      <ForwardGraphPanel model={graphModel} />
                      <ForwardInsightsPanel
                        insights={insightCards}
                        findingsSummary={findingsSummary}
                        validatorCorrelations={validatorCorrelations}
                      />
                    </>
                  )}
                  {detailTab === "data" && (
                    <>
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
                    </>
                  )}
                </div>
              </ErrorBoundary>
            ) : null}
          </section>
        </section>
      </main>
      )}
    </div>
  );
}
