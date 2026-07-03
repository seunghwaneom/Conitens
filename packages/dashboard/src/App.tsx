import React, { useEffect, useEffectEvent, useMemo, useState } from "react";
import { PixelOffice } from "./components/PixelOffice.js";
import {
  type OperatorTaskDraft,
  type OperatorTaskWorkspaceOption,
} from "./components/OperatorTaskEditorPanel.js";
import { useForwardStream } from "./hooks/use-forward-stream.js";
import {
  useOperatorAgentsData,
  useOperatorInboxData,
  useOperatorSummaryData,
  useOperatorWakeReadinessData,
  useOperatorTaskReconcileData,
  useOperatorWorkspaceLinkedTasksData,
  useRunsData,
  type LoadState,
} from "./hooks/use-operator-screen-data.js";
import { useRunDetailData } from "./hooks/use-run-detail-data.js";
import {
  useOperatorTasksData,
  useOperatorTaskDetailData,
  useOperatorWorkspacesData,
  useOperatorWorkspaceDetailData,
} from "./hooks/use-operator-mutable-data.js";
import { toErrorMessage } from "./utils.js";
import {
  forwardArchiveOperatorTask,
  forwardCreateOperatorTask,
  forwardCreateOperatorWorkspace,
  forwardDetachOperatorTaskWorkspace,
  forwardDeleteOperatorTask,
  forwardGetOperatorTask,
  forwardGetOperatorTasks,
  forwardGetOperatorWorkspace,
  forwardGetOperatorWorkspaces,
  forwardRequestOperatorTaskApproval,
  forwardRestoreOperatorTask,
  forwardUpdateOperatorTask,
  forwardUpdateOperatorWorkspace,
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
  type ForwardOperatorTaskReconcilePreviewResponse,
  type ForwardOperatorTasksResponse,
  type ForwardOperatorWakeReadinessResponse,
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
import { toOperatorTaskReconcilePreview } from "./operator-reconciler-model.js";
import { toOperatorSummaryViewModel } from "./operator-summary-model.js";
import { toOperatorTaskDetail, toOperatorTaskListItems } from "./operator-tasks-model.js";
import { toOperatorWakeReadinessViewModel } from "./operator-wake-readiness-model.js";
import {
  buildOperatorWorkspaceMutationBody,
  getOperatorWorkspaceQuickStatusActions,
  operatorWorkspaceNeedsArchiveRationale,
  type OperatorWorkspaceDraft,
} from "./operator-workspace-actions.js";
import { toOperatorWorkspaceDetail, toOperatorWorkspaceListItems } from "./operator-workspaces-model.js";
import {
  extractRoomOptions,
  summarizeFindingsDocument,
  summarizeValidatorCorrelations,
  toInsightCardViewModels,
  toRunDetailViewModel,
  toRunListItemViewModel,
} from "./forward-view-model.js";
import { demoAgents, demoEvents, demoTasks } from "./demo-data.js";
import { compareAgentAttention, demoFleet } from "./agent-fleet-model.js";
import {
  buildOperatorTaskDraftMutationBody,
  buildOperatorTaskStatusMutationBody,
} from "./operator-task-actions.js";
import { AgentsScreen } from "./screens/AgentsScreen.js";
import { ApprovalsScreen } from "./screens/ApprovalsScreen.js";
import { DeferredRouteScreen } from "./screens/DeferredRouteScreen.js";
import { OperatorWorkbenchScreen } from "./screens/OperatorWorkbenchScreen.js";

type DetailTab = "operations" | "intelligence" | "data";
type TaskBulkAction = "archive" | "restore";

interface TaskBulkReport {
  action: TaskBulkAction;
  targetScope: "selected" | "visible";
  attempted: number;
  succeeded: string[];
  failed: Array<{ taskId: string; error: string }>;
}

export function App() {
  const initialTaskFilterState = readInitialTaskFilterState();
  const [config, setConfig] = useState<ForwardBridgeConfig>(() => readInitialBridgeConfig());
  const [draftConfig, setDraftConfig] = useState<ForwardBridgeConfig>(() => readInitialBridgeConfig());
  const [workspaceMutationState, setWorkspaceMutationState] = useState<LoadState>("idle");
  const [workspaceTaskActionState, setWorkspaceTaskActionState] = useState<LoadState>("idle");
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
  const [workspaceMutationError, setWorkspaceMutationError] = useState<string | null>(null);
  const [workspaceTaskActionError, setWorkspaceTaskActionError] = useState<string | null>(null);
  const [workspaceTaskActionMessage, setWorkspaceTaskActionMessage] = useState<string | null>(null);
  const [taskMutationError, setTaskMutationError] = useState<string | null>(null);
  const [taskArchiveError, setTaskArchiveError] = useState<string | null>(null);
  const [taskDeleteError, setTaskDeleteError] = useState<string | null>(null);
  const [taskApprovalRequestError, setTaskApprovalRequestError] = useState<string | null>(null);
  const [taskPresetError, setTaskPresetError] = useState<string | null>(null);
  const [taskBulkError, setTaskBulkError] = useState<string | null>(null);
  const [taskBulkMessage, setTaskBulkMessage] = useState<string | null>(null);
  const [taskBulkReport, setTaskBulkReport] = useState<TaskBulkReport | null>(null);
  const [route, setRoute] = useState(() => parseForwardRoute(window.location.hash));
  const [liveRevision, setLiveRevision] = useState(0);
  const [streamRevision, setStreamRevision] = useState(0);
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
  const { data: operatorTasks, state: tasksState, error: tasksError, setData: setOperatorTasks } =
    useOperatorTasksData({ config, isOfficePreview, screen: route.screen, liveRevision, taskFilterStatus, taskFilterOwner, taskIncludeArchived });
  const { data: selectedTask, state: taskDetailState, error: taskDetailError, setData: setSelectedTask } =
    useOperatorTaskDetailData({ config, isOfficePreview, screen: route.screen, taskId: route.taskId });
  const activeLinkedRunId =
    route.screen === "run-detail"
      ? route.runId
      : route.screen === "task-detail"
        ? (selectedTask?.task.linked_run_id ?? null)
        : null;
  const isDemo = !config.token.trim() && !isOfficePreview;
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentView, setAgentView] = useState<"fleet" | "graph">("fleet");
  const showOnboarding = (route.screen === "overview" || route.screen === "runs") && isDemo;

  const { data: operatorSummary, state: overviewState, error: overviewError } =
    useOperatorSummaryData({ config, isOfficePreview, screen: route.screen, liveRevision });
  const { data: operatorWakeReadiness, state: wakeReadinessState, error: wakeReadinessError } =
    useOperatorWakeReadinessData({ config, isOfficePreview, screen: route.screen, liveRevision });
  const { data: operatorAgents, state: agentsState, error: agentsError } =
    useOperatorAgentsData({ config, isOfficePreview, screen: route.screen, liveRevision });
  const { data: operatorInbox, state: inboxState, error: inboxError } =
    useOperatorInboxData({ config, isOfficePreview, screen: route.screen, liveRevision });
  const { data: taskReconcilePreview, state: taskReconcileState, error: taskReconcileError } =
    useOperatorTaskReconcileData({ config, isOfficePreview, screen: route.screen, taskId: route.taskId, liveRevision });
  const { data: workspaceLinkedTasks, state: workspaceLinkedTasksState, error: workspaceLinkedTasksError } =
    useOperatorWorkspaceLinkedTasksData({ config, isOfficePreview, screen: route.screen, workspaceId: route.workspaceId ?? null, liveRevision });
  const { data: runs, state: runsState, error: runsError } =
    useRunsData({ config, isOfficePreview, liveRevision });
  const { data: operatorWorkspaces, state: workspacesState, error: workspacesError, setData: setOperatorWorkspaces } =
    useOperatorWorkspacesData({ config, isOfficePreview, screen: route.screen, liveRevision });
  const { data: selectedWorkspace, state: workspaceDetailState, error: workspaceDetailError, setData: setSelectedWorkspace } =
    useOperatorWorkspaceDetailData({ config, isOfficePreview, screen: route.screen, workspaceId: route.workspaceId ?? null });
  const {
    selectedRun,
    replay,
    stateDocs,
    contextLatest,
    roomTimeline,
    selectedRoomId,
    setSelectedRoomId,
    detailState,
    replayState,
    stateDocsState,
    contextState,
    roomState,
    detailError,
    replayError,
    stateDocsError,
    contextError,
    roomError,
  } = useRunDetailData({ config, isOfficePreview, activeLinkedRunId, liveRevision, streamRevision });

  const shellCopy = useMemo(() => {
    if (isOfficePreview) {
      return {
        eyebrow: "Spatial lens",
        title: "Conitens Control Plane",
        subtitle: "Room topology, crew focus, and handoff rhythm in one shared operator shell.",
      };
    }
    if (route.screen === "agents" || route.screen === "agent-detail") {
      return {
        eyebrow: "Agent fleet",
        title: "Conitens Control Plane",
        subtitle: "Lifecycle, memory growth, proposal flow, and relationship topology for the active fleet.",
      };
    }
    if (route.screen === "approvals") {
      return {
        eyebrow: "Approval queue",
        title: "Conitens Control Plane",
        subtitle: "Review pending operator approvals without starting from a specific run or task.",
      };
    }
    if (route.screen === "threads" || route.screen === "thread-detail") {
      return {
        eyebrow: "Thread archive",
        title: "Conitens Control Plane",
        subtitle: "Thread routes are reserved for the replay conversation surface and remain deferred in this shell.",
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
      window.location.hash = buildForwardRoute({ screen: "overview", runId: null, taskId: null, workspaceId: null, threadId: null, agentId: null });
    }
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const liveAgentProfiles = useMemo(
    () => (operatorAgents ? toOperatorAgentProfiles(operatorAgents) : []),
    [operatorAgents],
  );
  const visibleTaskRecords = useMemo(() => operatorTasks?.tasks ?? [], [operatorTasks]);
  const taskItems = useMemo(() => (operatorTasks ? toOperatorTaskListItems(operatorTasks) : []), [operatorTasks]);
  const taskDetail = useMemo(() => (selectedTask ? toOperatorTaskDetail(selectedTask) : null), [selectedTask]);
  const reconcilePreview = useMemo(
    () => (taskReconcilePreview ? toOperatorTaskReconcilePreview(taskReconcilePreview) : null),
    [taskReconcilePreview],
  );
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
  const wakeReadiness = useMemo(
    () => (operatorWakeReadiness ? toOperatorWakeReadinessViewModel(operatorWakeReadiness) : null),
    [operatorWakeReadiness],
  );
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
  const orderedAgentProfiles = useMemo(() => agentProfiles.slice().sort(compareAgentAttention), [agentProfiles]);
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
    if (orderedAgentProfiles.length === 0) {
      if (selectedAgentId !== null) {
        setSelectedAgentId(null);
      }
      return;
    }
    if (route.screen === "agents" && route.agentId && orderedAgentProfiles.some((agent) => agent.id === route.agentId)) {
      if (selectedAgentId !== route.agentId) {
        setSelectedAgentId(route.agentId);
      }
      return;
    }
    if (!selectedAgentId || !orderedAgentProfiles.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(orderedAgentProfiles[0]?.id ?? null);
    }
  }, [orderedAgentProfiles, route.agentId, route.screen, selectedAgentId]);

  const connect = (event: React.FormEvent) => {
    event.preventDefault();
    persistBridgeConfig(draftConfig);
    setConfig(draftConfig);
    if (draftConfig.token.trim()) {
      setShowConnectForm(false);
    }
  };

  const openRun = (runId: string) => {
    window.location.hash = buildForwardRoute({ screen: "run-detail", runId, taskId: null, workspaceId: null, threadId: null, agentId: null });
  };

  const openTask = (taskId: string) => {
    window.location.hash = buildForwardRoute({ screen: "task-detail", runId: null, taskId, workspaceId: null, threadId: null, agentId: null });
  };

  const openWorkspace = (workspaceId: string) => {
    window.location.hash = buildForwardRoute({ screen: "workspace-detail", runId: null, taskId: null, workspaceId, threadId: null, agentId: null });
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
      window.location.hash = buildForwardRoute({ screen: "task-detail", runId: null, taskId: nextTaskId, workspaceId: null, threadId: null, agentId: null });
    } else {
      setSelectedTask(null);
      window.location.hash = buildForwardRoute({ screen: "tasks", runId: null, taskId: null, workspaceId: null, threadId: null, agentId: null });
    }
    setLiveRevision((current) => current + 1);
  }

  async function refreshWorkspacesAndSelection(nextWorkspaceId: string | null = null) {
    const workspacesPayload = await forwardGetOperatorWorkspaces(config);
    setOperatorWorkspaces(workspacesPayload);
    if (nextWorkspaceId) {
      const workspacePayload = await forwardGetOperatorWorkspace(config, nextWorkspaceId);
      setSelectedWorkspace(workspacePayload);
      window.location.hash = buildForwardRoute({ screen: "workspace-detail", runId: null, taskId: null, workspaceId: nextWorkspaceId, threadId: null, agentId: null });
    } else {
      setSelectedWorkspace(null);
      window.location.hash = buildForwardRoute({ screen: "workspaces", runId: null, taskId: null, workspaceId: null, threadId: null, agentId: null });
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
    const body = buildOperatorTaskDraftMutationBody(taskDraft);
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
    if (!config.token.trim() || route.screen !== "task-detail" || !route.taskId || !selectedTask) {
      return;
    }
    const body = buildOperatorTaskStatusMutationBody(selectedTask.task, status);
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
    setStreamRevision((current) => current + 1);
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
          window.location.hash = buildForwardRoute({ screen: "overview", runId: null, taskId: null, workspaceId: null, threadId: null, agentId: null });
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runItems, route, isOfficePreview]);

  function focusTab(tabId: string) {
    document.getElementById(tabId)?.focus();
  }

  function handleAgentTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!isDemo) {
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const nextView = agentView === "fleet" ? "graph" : "fleet";
      setAgentView(nextView);
      focusTab(`agent-tab-${nextView}`);
    } else if (event.key === "Home") {
      event.preventDefault();
      setAgentView("fleet");
      focusTab("agent-tab-fleet");
    } else if (event.key === "End") {
      event.preventDefault();
      setAgentView("graph");
      focusTab("agent-tab-graph");
    }
  }

  function handleRunDetailTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const tabs: DetailTab[] = ["operations", "intelligence", "data"];
    const currentIndex = tabs.indexOf(detailTab);
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    if (nextIndex === -1) {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setDetailTab(nextTab);
    focusTab(`run-detail-tab-${nextTab}`);
  }

  function openAgent(agentId: string) {
    window.location.hash = buildForwardRoute({
      screen: "agents",
      runId: null,
      taskId: null,
      workspaceId: null,
      threadId: null,
      agentId,
    });
  }

  function openSpatialRoom(roomId: string) {
    window.sessionStorage.setItem("conitens.officeFocusRoom", roomId);
    window.location.hash = buildForwardRoute({
      screen: "office-preview",
      runId: null,
      taskId: null,
      workspaceId: null,
      threadId: null,
      agentId: null,
    });
  }

  return (
    <div className={`forward-shell${isOfficePreview ? " forward-shell-preview" : ""}`}>
      <header className="forward-header">
        <div>
          <p className="forward-eyebrow">{shellCopy.eyebrow}</p>
          <h1>{shellCopy.title}</h1>
          <p className="forward-subtitle">{shellCopy.subtitle}</p>
        </div>
        <div className="forward-header-controls">
          <nav className="forward-chip-row forward-chip-row-nav" aria-label="Forward shell routes">
            <a className={`forward-chip forward-chip-link${route.screen === "overview" ? " active" : ""}`} aria-current={route.screen === "overview" ? "page" : undefined} href="#/overview">Overview</a>
            <a className={`forward-chip forward-chip-link${route.screen === "inbox" ? " active" : ""}`} aria-current={route.screen === "inbox" ? "page" : undefined} href="#/inbox">Inbox</a>
            <a className={`forward-chip forward-chip-link${route.screen === "approvals" ? " active" : ""}`} aria-current={route.screen === "approvals" ? "page" : undefined} href="#/approvals">Approve</a>
            <a className={`forward-chip forward-chip-link${route.screen === "tasks" || route.screen === "task-detail" ? " active" : ""}`} aria-current={route.screen === "tasks" || route.screen === "task-detail" ? "page" : undefined} href="#/tasks">Tasks</a>
            <a className={`forward-chip forward-chip-link${route.screen === "workspaces" || route.screen === "workspace-detail" ? " active" : ""}`} aria-current={route.screen === "workspaces" || route.screen === "workspace-detail" ? "page" : undefined} href="#/workspaces">Workspace</a>
            <a className={`forward-chip forward-chip-link${route.screen === "runs" || route.screen === "run-detail" ? " active" : ""}`} aria-current={route.screen === "runs" || route.screen === "run-detail" ? "page" : undefined} href="#/runs">Runs</a>
            <a className={`forward-chip forward-chip-link${isOfficePreview ? " active" : ""}`} aria-current={isOfficePreview ? "page" : undefined} href="#/office-preview">Spatial</a>
            <a className={`forward-chip forward-chip-link${route.screen === "agents" || route.screen === "agent-detail" ? " active" : ""}`} aria-current={route.screen === "agents" || route.screen === "agent-detail" ? "page" : undefined} href="#/agents">Agents</a>
          </nav>
          <div className="forward-status-row forward-chip-row-status" aria-label="Bridge connection status">
            {isOfficePreview ? (
              <span className="forward-chip forward-status-chip">Preview data</span>
            ) : (
              <>
                <span className="forward-chip forward-status-chip">API {config.apiRoot}</span>
                <span className="forward-chip forward-status-chip">{config.token ? "Token loaded" : "Token required"}</span>
                <span className="forward-chip forward-live-chip" role="status" aria-live="polite">Live: {liveStream.status}</span>
                <button
                  className="forward-chip forward-chip-link"
                  type="button"
                  onClick={() => setShowConnectForm((value) => !value)}
                  aria-expanded={showConnectForm}
                >
                  {showConnectForm ? "Hide settings" : "Bridge settings"}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {isOfficePreview ? (
        <main className="forward-main forward-main-preview">
          <PixelOffice agents={demoAgents} tasks={demoTasks} events={demoEvents} onOpenAgent={openAgent} />
        </main>
      ) : route.screen === "agents" ? (
        <AgentsScreen
          agentView={agentView}
          setAgentView={setAgentView}
          handleAgentTabKeyDown={handleAgentTabKeyDown}
          isDemo={isDemo}
          agentsState={agentsState}
          agentsError={agentsError}
          agentProfiles={agentProfiles}
          orderedAgentProfiles={orderedAgentProfiles}
          selectedAgentId={selectedAgentId}
          setSelectedAgentId={setSelectedAgentId}
          activeAgent={activeAgent}
          openSpatialRoom={openSpatialRoom}
        />
      ) : route.screen === "approvals" ? (
        <ApprovalsScreen
          isDemo={isDemo}
          showConnectForm={showConnectForm}
          setShowConnectForm={setShowConnectForm}
          draftConfig={draftConfig}
          setDraftConfig={setDraftConfig}
          connect={connect}
          config={config}
        />
      ) : route.screen === "threads" || route.screen === "thread-detail" || route.screen === "agent-detail" ? (
        <DeferredRouteScreen screen={route.screen} />
      ) : (
        <OperatorWorkbenchScreen
          route={route}
          isDemo={isDemo}
          config={config}
          showOnboarding={showOnboarding}
          showConnectForm={showConnectForm}
          setShowConnectForm={setShowConnectForm}
          draftConfig={draftConfig}
          setDraftConfig={setDraftConfig}
          connect={connect}
          tasksState={tasksState}
          tasksError={tasksError}
          taskItems={taskItems}
          visibleTaskRecords={visibleTaskRecords}
          taskFilterStatus={taskFilterStatus}
          setTaskFilterStatus={setTaskFilterStatus}
          taskFilterOwner={taskFilterOwner}
          setTaskFilterOwner={setTaskFilterOwner}
          taskIncludeArchived={taskIncludeArchived}
          setTaskIncludeArchived={setTaskIncludeArchived}
          taskFilterPresetName={taskFilterPresetName}
          setTaskFilterPresetName={setTaskFilterPresetName}
          savedTaskFilterPresets={savedTaskFilterPresets}
          taskPresetState={taskPresetState}
          taskPresetError={taskPresetError}
          handleSaveTaskFilterPreset={handleSaveTaskFilterPreset}
          applySavedTaskFilterPreset={applySavedTaskFilterPreset}
          handleDeleteTaskFilterPreset={handleDeleteTaskFilterPreset}
          taskBulkState={taskBulkState}
          bulkArchivableTasks={bulkArchivableTasks}
          bulkRestorableTasks={bulkRestorableTasks}
          selectedVisibleTaskRecords={selectedVisibleTaskRecords}
          taskBulkArchiveRationale={taskBulkArchiveRationale}
          setTaskBulkArchiveRationale={setTaskBulkArchiveRationale}
          taskBulkMessage={taskBulkMessage}
          taskBulkError={taskBulkError}
          taskBulkReport={taskBulkReport}
          handleBulkTaskLifecycle={handleBulkTaskLifecycle}
          selectedTaskIds={selectedTaskIds}
          setSelectedTaskIds={setSelectedTaskIds}
          replaceTaskSelection={replaceTaskSelection}
          toggleTaskSelection={toggleTaskSelection}
          openTask={openTask}
          openWorkspace={openWorkspace}
          openRun={openRun}
          workspacesState={workspacesState}
          workspacesError={workspacesError}
          workspaceItems={workspaceItems}
          runsState={runsState}
          runsError={runsError}
          runItems={runItems}
          overviewState={overviewState}
          inboxState={inboxState}
          taskDetailState={taskDetailState}
          workspaceDetailState={workspaceDetailState}
          detailState={detailState}
          runDetail={runDetail}
          overview={overview}
          overviewError={overviewError}
          wakeReadiness={wakeReadiness}
          wakeReadinessState={wakeReadinessState}
          wakeReadinessError={wakeReadinessError}
          inboxItems={inboxItems}
          inboxError={inboxError}
          taskDetail={taskDetail}
          taskDetailError={taskDetailError}
          taskMutationState={taskMutationState}
          taskMutationError={taskMutationError}
          taskArchiveState={taskArchiveState}
          taskArchiveError={taskArchiveError}
          taskArchiveRationale={taskArchiveRationale}
          setTaskArchiveRationale={setTaskArchiveRationale}
          taskDeleteState={taskDeleteState}
          taskDeleteError={taskDeleteError}
          taskApprovalRequestState={taskApprovalRequestState}
          taskApprovalRequestError={taskApprovalRequestError}
          taskApprovalRationale={taskApprovalRationale}
          setTaskApprovalRationale={setTaskApprovalRationale}
          taskChangedFields={taskChangedFields}
          taskSensitiveFields={taskSensitiveFields}
          taskApprovalHint={taskApprovalHint}
          handleTaskQuickStatus={handleTaskQuickStatus}
          handleTaskArchive={handleTaskArchive}
          handleTaskRestore={handleTaskRestore}
          handleTaskDelete={handleTaskDelete}
          handleTaskRequestApproval={handleTaskRequestApproval}
          handleTaskSubmit={handleTaskSubmit}
          reconcilePreview={reconcilePreview}
          taskReconcileState={taskReconcileState}
          taskReconcileError={taskReconcileError}
          taskDraft={taskDraft}
          setTaskDraft={setTaskDraft}
          workspaceOptions={workspaceOptions}
          selectedDraftWorkspaceOption={selectedDraftWorkspaceOption}
          linkedWorkspaceOption={linkedWorkspaceOption}
          unresolvedTaskWorkspaceRef={unresolvedTaskWorkspaceRef}
          workspaceDetail={workspaceDetail}
          workspaceDetailError={workspaceDetailError}
          workspaceMutationState={workspaceMutationState}
          workspaceMutationError={workspaceMutationError}
          workspaceQuickStatusActions={workspaceQuickStatusActions}
          workspaceLinkedTaskItems={workspaceLinkedTaskItems}
          workspaceLinkedTasksState={workspaceLinkedTasksState}
          workspaceLinkedTasksError={workspaceLinkedTasksError}
          workspaceTaskActionState={workspaceTaskActionState}
          workspaceTaskActionError={workspaceTaskActionError}
          workspaceTaskActionMessage={workspaceTaskActionMessage}
          handleWorkspaceQuickStatus={handleWorkspaceQuickStatus}
          handleWorkspaceDetachTask={handleWorkspaceDetachTask}
          handleWorkspaceArchiveTask={handleWorkspaceArchiveTask}
          handleWorkspaceSubmit={handleWorkspaceSubmit}
          workspaceDraft={workspaceDraft}
          setWorkspaceDraft={setWorkspaceDraft}
          detailError={detailError}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          handleRunDetailTabKeyDown={handleRunDetailTabKeyDown}
          replay={replay}
          replayState={replayState}
          replayError={replayError}
          stateDocs={stateDocs}
          stateDocsState={stateDocsState}
          stateDocsError={stateDocsError}
          contextLatest={contextLatest}
          contextState={contextState}
          contextError={contextError}
          roomTimeline={roomTimeline}
          roomState={roomState}
          roomError={roomError}
          selectedRoomId={selectedRoomId}
          setSelectedRoomId={setSelectedRoomId}
          roomOptions={roomOptions}
          taskRoomOptions={taskRoomOptions}
          graphModel={graphModel}
          insightCards={insightCards}
          findingsSummary={findingsSummary}
          validatorCorrelations={validatorCorrelations}
        />
      )}
    </div>
  );
}
