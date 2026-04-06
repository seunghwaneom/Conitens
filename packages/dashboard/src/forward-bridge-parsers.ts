import type {
  ForwardApprovalDetailResponse,
  ForwardOperatorAgentRecord,
  ForwardOperatorAgentsResponse,
  ForwardOperatorInboxItem,
  ForwardOperatorInboxResponse,
  ForwardOperatorTaskDeleteResponse,
  ForwardOperatorTaskDetailResponse,
  ForwardOperatorTaskRecord,
  ForwardOperatorTasksResponse,
  ForwardOperatorWorkspaceDetailResponse,
  ForwardOperatorWorkspaceRecord,
  ForwardOperatorWorkspacesResponse,
  ForwardApprovalRecord,
  ForwardApprovalResumeResponse,
  ForwardApprovalsResponse,
  ForwardContextLatestResponse,
  ForwardLatestDigest,
  ForwardOperatorSummaryResponse,
  ForwardReplayResponse,
  ForwardReplayTimelineEntry,
  ForwardRoomTimelineResponse,
  ForwardRunCounts,
  ForwardRunDetailResponse,
  ForwardRunsResponse,
  ForwardStateDoc,
  ForwardStateDocsResponse,
  ForwardStreamEventMessage,
  ForwardStreamSnapshot,
} from "./forward-bridge-types.ts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}: expected string`);
  }
  return value;
}

function asNullableString(value: unknown, field: string): string | null {
  if (value == null) {
    return null;
  }
  return asString(value, field);
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number") {
    throw new Error(`Invalid ${field}: expected number`);
  }
  return value;
}

function asApprovalStatus(value: unknown, field: string): ForwardApprovalRecord["status"] {
  const status = asString(value, field);
  if (status !== "pending" && status !== "approved" && status !== "edited" && status !== "rejected") {
    throw new Error(`Invalid ${field}: unsupported approval status`);
  }
  return status;
}

function parseCounts(value: unknown): ForwardRunCounts {
  if (!isObject(value)) {
    throw new Error("Invalid counts");
  }
  return {
    iterations: asNumber(value.iterations, "counts.iterations"),
    validator_results: asNumber(value.validator_results, "counts.validator_results"),
    approvals: asNumber(value.approvals, "counts.approvals"),
    rooms: asNumber(value.rooms, "counts.rooms"),
    messages: asNumber(value.messages, "counts.messages"),
    tool_events: asNumber(value.tool_events, "counts.tool_events"),
    insights: asNumber(value.insights, "counts.insights"),
    handoff_packets: asNumber(value.handoff_packets, "counts.handoff_packets"),
  };
}

function parseTimelineEntry(value: unknown, field: string): ForwardReplayTimelineEntry {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    kind: asString(value.kind, `${field}.kind`),
    timestamp: asString(value.timestamp, `${field}.timestamp`),
    summary: asString(value.summary, `${field}.summary`),
    payload: isObject(value.payload) ? value.payload : {},
  };
}

function parseStateDoc(value: unknown, field: string): ForwardStateDoc {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    path: asString(value.path, `${field}.path`),
    content: asString(value.content, `${field}.content`),
  };
}

function parseLatestDigest(value: unknown, field: string): ForwardLatestDigest {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    path: asString(value.path, `${field}.path`),
    content: value.content == null ? null : asString(value.content, `${field}.content`),
  };
}

function parseApprovalRecord(value: unknown, field: string): ForwardApprovalRecord {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    request_id: asString(value.request_id, `${field}.request_id`),
    run_id: asString(value.run_id, `${field}.run_id`),
    iteration_id: asString(value.iteration_id, `${field}.iteration_id`),
    task_id: asNullableString(value.task_id, `${field}.task_id`),
    actor: asString(value.actor, `${field}.actor`),
    action_type: asString(value.action_type, `${field}.action_type`),
    action_payload: isObject(value.action_payload) ? value.action_payload : {},
    risk_level: asString(value.risk_level, `${field}.risk_level`),
    status: asApprovalStatus(value.status, `${field}.status`),
    reviewer: asNullableString(value.reviewer, `${field}.reviewer`),
    reviewer_note: asNullableString(value.reviewer_note, `${field}.reviewer_note`),
    created_at: asString(value.created_at, `${field}.created_at`),
    updated_at: asString(value.updated_at, `${field}.updated_at`),
  };
}

function parseOperatorInboxItem(value: unknown, field: string): ForwardOperatorInboxItem {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const kind = asString(value.kind, `${field}.kind`);
  if (!["approval", "validator_failure", "handoff_attention", "stale_run"].includes(kind)) {
    throw new Error(`Invalid ${field}.kind`);
  }
  const severity = asString(value.severity, `${field}.severity`);
  if (!["info", "warning", "danger"].includes(severity)) {
    throw new Error(`Invalid ${field}.severity`);
  }
  return {
    id: asString(value.id, `${field}.id`),
    kind: kind as ForwardOperatorInboxItem["kind"],
    severity: severity as ForwardOperatorInboxItem["severity"],
    title: asString(value.title, `${field}.title`),
    summary: asString(value.summary, `${field}.summary`),
    run_id: asNullableString(value.run_id, `${field}.run_id`),
    iteration_id: asNullableString(value.iteration_id, `${field}.iteration_id`),
    room_id: asNullableString(value.room_id, `${field}.room_id`),
    created_at: asString(value.created_at, `${field}.created_at`),
    action_label: asString(value.action_label, `${field}.action_label`),
  };
}

function parseOperatorAgentRecord(value: unknown, field: string): ForwardOperatorAgentRecord {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const role = asString(value.role, `${field}.role`);
  if (!["orchestrator", "implementer", "researcher", "reviewer", "validator"].includes(role)) {
    throw new Error(`Invalid ${field}.role`);
  }
  const status = asString(value.status, `${field}.status`);
  if (!["dormant", "idle", "assigned", "running", "paused", "retired"].includes(status)) {
    throw new Error(`Invalid ${field}.status`);
  }
  return {
    agent_id: asString(value.agent_id, `${field}.agent_id`),
    name: asString(value.name, `${field}.name`),
    role: role as ForwardOperatorAgentRecord["role"],
    archetype: asString(value.archetype, `${field}.archetype`),
    status: status as ForwardOperatorAgentRecord["status"],
    room_id: asString(value.room_id, `${field}.room_id`),
    task_count: asNumber(value.task_count, `${field}.task_count`),
    last_active: asString(value.last_active, `${field}.last_active`),
    memory_count: asNumber(value.memory_count, `${field}.memory_count`),
    error_rate: asNumber(value.error_rate, `${field}.error_rate`),
    latest_run_id: asNullableString(value.latest_run_id, `${field}.latest_run_id`),
    latest_run_status: asNullableString(value.latest_run_status, `${field}.latest_run_status`),
    latest_blocker: asNullableString(value.latest_blocker, `${field}.latest_blocker`),
    pending_approvals: asNumber(value.pending_approvals, `${field}.pending_approvals`),
    workspace_ref: asNullableString(value.workspace_ref, `${field}.workspace_ref`),
  };
}

function parseOperatorTaskRecord(value: unknown, field: string): ForwardOperatorTaskRecord {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const status = asString(value.status, `${field}.status`);
  if (!["backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"].includes(status)) {
    throw new Error(`Invalid ${field}.status`);
  }
  const priority = asString(value.priority, `${field}.priority`);
  if (!["low", "medium", "high", "critical"].includes(priority)) {
    throw new Error(`Invalid ${field}.priority`);
  }
  return {
    task_id: asString(value.task_id, `${field}.task_id`),
    title: asString(value.title, `${field}.title`),
    objective: asString(value.objective, `${field}.objective`),
    status: status as ForwardOperatorTaskRecord["status"],
    priority: priority as ForwardOperatorTaskRecord["priority"],
    owner_agent_id: asNullableString(value.owner_agent_id, `${field}.owner_agent_id`),
    linked_run_id: asNullableString(value.linked_run_id, `${field}.linked_run_id`),
    linked_iteration_id: asNullableString(value.linked_iteration_id, `${field}.linked_iteration_id`),
    linked_room_ids_json: Array.isArray(value.linked_room_ids_json)
      ? value.linked_room_ids_json.filter((item): item is string => typeof item === "string")
      : [],
    blocked_reason: asNullableString(value.blocked_reason, `${field}.blocked_reason`),
    acceptance_json: Array.isArray(value.acceptance_json)
      ? value.acceptance_json.filter((item): item is string => typeof item === "string")
      : [],
    workspace_ref: asNullableString(value.workspace_ref, `${field}.workspace_ref`),
    archived_at: asNullableString(value.archived_at, `${field}.archived_at`),
    archived_by: asNullableString(value.archived_by, `${field}.archived_by`),
    archive_note: asNullableString(value.archive_note, `${field}.archive_note`),
    created_at: asString(value.created_at, `${field}.created_at`),
    updated_at: asString(value.updated_at, `${field}.updated_at`),
  };
}

function parseOperatorWorkspaceRecord(value: unknown, field: string): ForwardOperatorWorkspaceRecord {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const kind = asString(value.kind, `${field}.kind`);
  if (!["repo", "branch", "scratch", "review"].includes(kind)) {
    throw new Error(`Invalid ${field}.kind`);
  }
  const status = asString(value.status, `${field}.status`);
  if (!["active", "idle", "blocked", "archived"].includes(status)) {
    throw new Error(`Invalid ${field}.status`);
  }
  return {
    workspace_id: asString(value.workspace_id, `${field}.workspace_id`),
    label: asString(value.label, `${field}.label`),
    path: asString(value.path, `${field}.path`),
    kind: kind as ForwardOperatorWorkspaceRecord["kind"],
    status: status as ForwardOperatorWorkspaceRecord["status"],
    owner_agent_id: asNullableString(value.owner_agent_id, `${field}.owner_agent_id`),
    linked_run_id: asNullableString(value.linked_run_id, `${field}.linked_run_id`),
    linked_iteration_id: asNullableString(value.linked_iteration_id, `${field}.linked_iteration_id`),
    task_ids_json: Array.isArray(value.task_ids_json)
      ? value.task_ids_json.filter((item): item is string => typeof item === "string")
      : [],
    notes: asNullableString(value.notes, `${field}.notes`),
    archived_at: asNullableString(value.archived_at, `${field}.archived_at`),
    archived_by: asNullableString(value.archived_by, `${field}.archived_by`),
    archive_note: asNullableString(value.archive_note, `${field}.archive_note`),
    created_at: asString(value.created_at, `${field}.created_at`),
    updated_at: asString(value.updated_at, `${field}.updated_at`),
  };
}

export function parseRunsResponse(value: unknown): ForwardRunsResponse {
  if (!isObject(value) || !Array.isArray(value.runs) || typeof value.count !== "number") {
    throw new Error("Invalid runs response");
  }
  return {
    count: value.count,
    runs: value.runs.map((item, index) => {
      if (!isObject(item)) {
        throw new Error(`Invalid runs[${index}]`);
      }
      return {
        run_id: asString(item.run_id, "run_id"),
        status: asString(item.status, "status"),
        user_request: asString(item.user_request, "user_request"),
        created_at: asString(item.created_at, "created_at"),
        updated_at: asString(item.updated_at, "updated_at"),
        latest_iteration_id: asNullableString(item.latest_iteration_id, "latest_iteration_id"),
        latest_iteration_status: asNullableString(item.latest_iteration_status, "latest_iteration_status"),
        counts: parseCounts(item.counts),
      };
    }),
  };
}

export function parseRunDetailResponse(value: unknown): ForwardRunDetailResponse {
  if (!isObject(value) || !isObject(value.run) || !Array.isArray(value.iterations)) {
    throw new Error("Invalid run detail response");
  }
  return {
    run: {
      run_id: asString(value.run.run_id, "run.run_id"),
      status: asString(value.run.status, "run.status"),
      user_request: asString(value.run.user_request, "run.user_request"),
      created_at: asString(value.run.created_at, "run.created_at"),
      updated_at: asString(value.run.updated_at, "run.updated_at"),
      current_iteration: asNumber(value.run.current_iteration, "run.current_iteration"),
      stop_reason: asNullableString(value.run.stop_reason, "run.stop_reason"),
    },
    iterations: value.iterations.map((item, index) => {
      if (!isObject(item)) {
        throw new Error(`Invalid iterations[${index}]`);
      }
      return {
        iteration_id: asString(item.iteration_id, "iteration_id"),
        status: asString(item.status, "status"),
        objective: asString(item.objective, "objective"),
        seq_no: asNumber(item.seq_no, "seq_no"),
      };
    }),
    latest_iteration: value.latest_iteration == null
      ? null
      : {
          iteration_id: asString((value.latest_iteration as Record<string, unknown>).iteration_id, "latest_iteration.iteration_id"),
          status: asString((value.latest_iteration as Record<string, unknown>).status, "latest_iteration.status"),
          objective: asString((value.latest_iteration as Record<string, unknown>).objective, "latest_iteration.objective"),
          seq_no: asNumber((value.latest_iteration as Record<string, unknown>).seq_no, "latest_iteration.seq_no"),
        },
    task_plan: value.task_plan == null
      ? null
      : {
          current_plan: asString((value.task_plan as Record<string, unknown>).current_plan, "task_plan.current_plan"),
          objective: asString((value.task_plan as Record<string, unknown>).objective, "task_plan.objective"),
          owner: asNullableString((value.task_plan as Record<string, unknown>).owner, "task_plan.owner"),
          steps_json: Array.isArray((value.task_plan as Record<string, unknown>).steps_json)
            ? (((value.task_plan as Record<string, unknown>).steps_json as Array<unknown>).filter(isObject) as Array<Record<string, unknown>>)
            : [],
          acceptance_json: Array.isArray((value.task_plan as Record<string, unknown>).acceptance_json)
            ? (((value.task_plan as Record<string, unknown>).acceptance_json as Array<unknown>).filter((entry): entry is string => typeof entry === "string"))
            : [],
        },
    counts: parseCounts(value.counts),
  };
}

export function parseReplayResponse(value: unknown): ForwardReplayResponse {
  if (!isObject(value) || !isObject(value.run) || !Array.isArray(value.timeline)) {
    throw new Error("Invalid replay response");
  }
  return {
    run: {
      run_id: asString(value.run.run_id, "run.run_id"),
      status: asString(value.run.status, "run.status"),
      user_request: asString(value.run.user_request, "run.user_request"),
    },
    timeline: value.timeline.map((item, index) => parseTimelineEntry(item, `timeline[${index}]`)),
    approvals: Array.isArray(value.approvals) ? value.approvals.filter(isObject) : [],
    insights: Array.isArray(value.insights) ? value.insights.filter(isObject) : [],
    validator_history: Array.isArray(value.validator_history) ? value.validator_history.filter(isObject) : [],
    handoff_packets: Array.isArray(value.handoff_packets) ? value.handoff_packets.filter(isObject) : [],
  };
}

export function parseStateDocsResponse(value: unknown): ForwardStateDocsResponse {
  if (!isObject(value) || !isObject(value.documents)) {
    throw new Error("Invalid state docs response");
  }
  return {
    run_id: asString(value.run_id, "run_id"),
    documents: {
      task_plan: parseStateDoc(value.documents.task_plan, "documents.task_plan"),
      findings: parseStateDoc(value.documents.findings, "documents.findings"),
      progress: parseStateDoc(value.documents.progress, "documents.progress"),
      latest_context: parseStateDoc(value.documents.latest_context, "documents.latest_context"),
    },
  };
}

export function parseContextLatestResponse(value: unknown): ForwardContextLatestResponse {
  if (!isObject(value)) {
    throw new Error("Invalid context latest response");
  }
  return {
    run_id: asString(value.run_id, "run_id"),
    runtime_latest: parseLatestDigest(value.runtime_latest, "runtime_latest"),
    repo_latest: value.repo_latest == null ? null : parseLatestDigest(value.repo_latest, "repo_latest"),
  };
}

export function parseRoomTimelineResponse(value: unknown): ForwardRoomTimelineResponse {
  if (!isObject(value) || !isObject(value.room) || !Array.isArray(value.timeline)) {
    throw new Error("Invalid room timeline response");
  }
  return {
    room: {
      room_id: asString(value.room.room_id, "room.room_id"),
      name: asString(value.room.name, "room.name"),
      room_type: asString(value.room.room_type, "room.room_type"),
      status: asString(value.room.status, "room.status"),
      run_id: asNullableString(value.room.run_id, "room.run_id"),
      iteration_id: asNullableString(value.room.iteration_id, "room.iteration_id"),
    },
    timeline: value.timeline.map((item, index) => parseTimelineEntry(item, `timeline[${index}]`)),
    messages: Array.isArray(value.messages) ? value.messages.filter(isObject) : [],
    tool_events: Array.isArray(value.tool_events) ? value.tool_events.filter(isObject) : [],
    insights: Array.isArray(value.insights) ? value.insights.filter(isObject) : [],
  };
}

export function parseApprovalsResponse(value: unknown): ForwardApprovalsResponse {
  if (!isObject(value) || !Array.isArray(value.approvals)) {
    throw new Error("Invalid approvals response");
  }
  return {
    approvals: value.approvals.map((item, index) => parseApprovalRecord(item, `approvals[${index}]`)),
  };
}

export function parseOperatorSummaryResponse(value: unknown): ForwardOperatorSummaryResponse {
  if (
    !isObject(value) ||
    !isObject(value.runs) ||
    !isObject(value.approvals) ||
    !isObject(value.rooms) ||
    !isObject(value.validation) ||
    !isObject(value.handoffs)
  ) {
    throw new Error("Invalid operator summary response");
  }
  return {
    generated_at: asString(value.generated_at, "generated_at"),
    runs: {
      total: asNumber(value.runs.total, "runs.total"),
      active: asNumber(value.runs.active, "runs.active"),
      awaiting_approval: asNumber(value.runs.awaiting_approval, "runs.awaiting_approval"),
      with_failures: asNumber(value.runs.with_failures, "runs.with_failures"),
      latest_run_id: asNullableString(value.runs.latest_run_id, "runs.latest_run_id"),
      latest_status: asNullableString(value.runs.latest_status, "runs.latest_status"),
    },
    approvals: {
      pending: asNumber(value.approvals.pending, "approvals.pending"),
    },
    rooms: {
      active: asNumber(value.rooms.active, "rooms.active"),
      review: asNumber(value.rooms.review, "rooms.review"),
    },
    validation: {
      failing_runs: asNumber(value.validation.failing_runs, "validation.failing_runs"),
      latest_failure_reason: asNullableString(value.validation.latest_failure_reason, "validation.latest_failure_reason"),
    },
    handoffs: {
      open: asNumber(value.handoffs.open, "handoffs.open"),
      blocked: asNumber(value.handoffs.blocked, "handoffs.blocked"),
    },
  };
}

export function parseOperatorInboxResponse(value: unknown): ForwardOperatorInboxResponse {
  if (!isObject(value) || !Array.isArray(value.items) || typeof value.count !== "number") {
    throw new Error("Invalid operator inbox response");
  }
  return {
    items: value.items.map((item, index) => parseOperatorInboxItem(item, `items[${index}]`)),
    count: value.count,
  };
}

export function parseOperatorAgentsResponse(value: unknown): ForwardOperatorAgentsResponse {
  if (!isObject(value) || !Array.isArray(value.agents) || typeof value.count !== "number") {
    throw new Error("Invalid operator agents response");
  }
  return {
    agents: value.agents.map((item, index) => parseOperatorAgentRecord(item, `agents[${index}]`)),
    count: value.count,
  };
}

export function parseOperatorTasksResponse(value: unknown): ForwardOperatorTasksResponse {
  if (!isObject(value) || !Array.isArray(value.tasks) || typeof value.count !== "number") {
    throw new Error("Invalid operator tasks response");
  }
  return {
    tasks: value.tasks.map((item, index) => parseOperatorTaskRecord(item, `tasks[${index}]`)),
    count: value.count,
  };
}

export function parseOperatorTaskDetailResponse(value: unknown): ForwardOperatorTaskDetailResponse {
  if (!isObject(value)) {
    throw new Error("Invalid operator task detail response");
  }
  return {
    task: parseOperatorTaskRecord(value.task, "task"),
  };
}

export function parseOperatorTaskDeleteResponse(value: unknown): ForwardOperatorTaskDeleteResponse {
  if (!isObject(value)) {
    throw new Error("Invalid operator task delete response");
  }
  return {
    deleted_task_id: asString(value.deleted_task_id, "deleted_task_id"),
  };
}

export function parseOperatorWorkspacesResponse(value: unknown): ForwardOperatorWorkspacesResponse {
  if (!isObject(value) || !Array.isArray(value.workspaces) || typeof value.count !== "number") {
    throw new Error("Invalid operator workspaces response");
  }
  return {
    workspaces: value.workspaces.map((item, index) => parseOperatorWorkspaceRecord(item, `workspaces[${index}]`)),
    count: value.count,
  };
}

export function parseOperatorWorkspaceDetailResponse(value: unknown): ForwardOperatorWorkspaceDetailResponse {
  if (!isObject(value)) {
    throw new Error("Invalid operator workspace detail response");
  }
  return {
    workspace: parseOperatorWorkspaceRecord(value.workspace, "workspace"),
  };
}

export function parseApprovalDetailResponse(value: unknown): ForwardApprovalDetailResponse {
  if (!isObject(value)) {
    throw new Error("Invalid approval detail response");
  }
  return {
    approval: parseApprovalRecord(value.approval, "approval"),
  };
}

export function parseApprovalResumeResponse(value: unknown): ForwardApprovalResumeResponse {
  if (!isObject(value) || !isObject(value.state)) {
    throw new Error("Invalid approval resume response");
  }
  return {
    approval: parseApprovalRecord(value.approval, "approval"),
    state: {
      run_id: asString(value.state.run_id, "state.run_id"),
      current_step: asNullableString(value.state.current_step, "state.current_step"),
      stop_reason: asNullableString(value.state.stop_reason, "state.stop_reason"),
      approval_pending: Boolean(value.state.approval_pending),
    },
  };
}

export function parseStreamSnapshot(value: unknown): ForwardStreamSnapshot {
  if (!isObject(value)) {
    throw new Error("Invalid stream snapshot");
  }
  return {
    generated_at: asNumber(value.generated_at, "generated_at"),
    run_id: value.run_id == null ? null : asString(value.run_id, "run_id"),
    room_id: value.room_id == null ? null : asString(value.room_id, "room_id"),
    pending_approvals: Array.isArray(value.pending_approvals)
      ? value.pending_approvals.map((item, index) => parseApprovalRecord(item, `pending_approvals[${index}]`))
      : [],
    latest_run_event: isObject(value.latest_run_event) ? value.latest_run_event : null,
    latest_room_event: isObject(value.latest_room_event) ? value.latest_room_event : null,
  };
}

export function parseForwardEventStreamChunk(buffer: string): {
  events: ForwardStreamEventMessage[];
  remainder: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  const remainder = frames.pop() ?? "";
  const events: ForwardStreamEventMessage[] = [];

  for (const frame of frames) {
    if (!frame.trim()) {
      continue;
    }
    let event = "message";
    let id: string | null = null;
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) {
        continue;
      }
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim() || "message";
        continue;
      }
      if (line.startsWith("id:")) {
        id = line.slice("id:".length).trim() || null;
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    events.push({
      event,
      data: dataLines.join("\n"),
      id,
    });
  }

  return { events, remainder };
}
