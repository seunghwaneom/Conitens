export interface ForwardRunCounts {
  iterations: number;
  validator_results: number;
  approvals: number;
  rooms: number;
  messages: number;
  tool_events: number;
  insights: number;
  handoff_packets: number;
}

export interface ForwardRunSummary {
  run_id: string;
  status: string;
  user_request: string;
  created_at: string;
  updated_at: string;
  latest_iteration_id: string | null;
  latest_iteration_status: string | null;
  counts: ForwardRunCounts;
}

export interface ForwardRunsResponse {
  runs: ForwardRunSummary[];
  count: number;
}

export interface ForwardRunDetailResponse {
  run: {
    run_id: string;
    status: string;
    user_request: string;
    created_at: string;
    updated_at: string;
    current_iteration: number;
    stop_reason: string | null;
  };
  iterations: Array<{
    iteration_id: string;
    status: string;
    objective: string;
    seq_no: number;
  }>;
  latest_iteration: {
    iteration_id: string;
    status: string;
    objective: string;
    seq_no: number;
  } | null;
  task_plan: {
    current_plan: string;
    objective: string;
    owner: string | null;
    steps_json: Array<Record<string, unknown>>;
    acceptance_json: string[];
  } | null;
  counts: ForwardRunCounts;
}

export interface ForwardBridgeConfig {
  apiRoot: string;
  token: string;
}

export interface ForwardApprovalRecord {
  request_id: string;
  run_id: string;
  iteration_id: string;
  task_id: string | null;
  actor: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  risk_level: string;
  status: "pending" | "approved" | "edited" | "rejected";
  reviewer: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForwardReplayTimelineEntry {
  kind: string;
  timestamp: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface ForwardReplayResponse {
  run: {
    run_id: string;
    status: string;
    user_request: string;
  };
  timeline: ForwardReplayTimelineEntry[];
  approvals: Array<Record<string, unknown>>;
  insights: Array<Record<string, unknown>>;
  validator_history: Array<Record<string, unknown>>;
  handoff_packets: Array<Record<string, unknown>>;
}

export interface ForwardStateDoc {
  path: string;
  content: string;
}

export interface ForwardStateDocsResponse {
  run_id: string;
  documents: {
    task_plan: ForwardStateDoc;
    findings: ForwardStateDoc;
    progress: ForwardStateDoc;
    latest_context: ForwardStateDoc;
  };
}

export interface ForwardLatestDigest {
  path: string;
  content: string | null;
}

export interface ForwardContextLatestResponse {
  run_id: string;
  runtime_latest: ForwardLatestDigest;
  repo_latest: ForwardLatestDigest | null;
}

export interface ForwardRoomTimelineResponse {
  room: {
    room_id: string;
    name: string;
    room_type: string;
    status: string;
    run_id: string | null;
    iteration_id: string | null;
  };
  timeline: ForwardReplayTimelineEntry[];
  messages: Array<Record<string, unknown>>;
  tool_events: Array<Record<string, unknown>>;
  insights: Array<Record<string, unknown>>;
}

export interface ForwardApprovalsResponse {
  approvals: ForwardApprovalRecord[];
}

export interface ForwardOperatorInboxItem {
  id: string;
  kind: "approval" | "validator_failure" | "handoff_attention" | "stale_run";
  severity: "info" | "warning" | "danger";
  title: string;
  summary: string;
  run_id: string | null;
  iteration_id: string | null;
  room_id: string | null;
  created_at: string;
  action_label: string;
}

export interface ForwardOperatorSummaryResponse {
  generated_at: string;
  runs: {
    total: number;
    active: number;
    awaiting_approval: number;
    with_failures: number;
    latest_run_id: string | null;
    latest_status: string | null;
  };
  approvals: {
    pending: number;
  };
  rooms: {
    active: number;
    review: number;
  };
  validation: {
    failing_runs: number;
    latest_failure_reason: string | null;
  };
  handoffs: {
    open: number;
    blocked: number;
  };
}

export interface ForwardOperatorInboxResponse {
  items: ForwardOperatorInboxItem[];
  count: number;
}

export interface ForwardOperatorAgentRecord {
  agent_id: string;
  name: string;
  role: "orchestrator" | "implementer" | "researcher" | "reviewer" | "validator";
  archetype: string;
  status: "dormant" | "idle" | "assigned" | "running" | "paused" | "retired";
  room_id: string;
  task_count: number;
  last_active: string;
  memory_count: number;
  error_rate: number;
  latest_run_id: string | null;
  latest_run_status: string | null;
  latest_blocker: string | null;
  pending_approvals: number;
  workspace_ref: string | null;
}

export interface ForwardOperatorAgentsResponse {
  agents: ForwardOperatorAgentRecord[];
  count: number;
}

export interface ForwardOperatorTaskRecord {
  task_id: string;
  title: string;
  objective: string;
  status: "backlog" | "todo" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  owner_agent_id: string | null;
  linked_run_id: string | null;
  linked_iteration_id: string | null;
  linked_room_ids_json: string[];
  blocked_reason: string | null;
  acceptance_json: string[];
  workspace_ref: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForwardOperatorTasksResponse {
  tasks: ForwardOperatorTaskRecord[];
  count: number;
}

export interface ForwardOperatorTaskDetailResponse {
  task: ForwardOperatorTaskRecord;
}

export interface ForwardOperatorTaskDeleteResponse {
  deleted_task_id: string;
}

export interface ForwardOperatorWorkspaceRecord {
  workspace_id: string;
  label: string;
  path: string;
  kind: "repo" | "branch" | "scratch" | "review";
  status: "active" | "idle" | "blocked" | "archived";
  owner_agent_id: string | null;
  linked_run_id: string | null;
  linked_iteration_id: string | null;
  task_ids_json: string[];
  notes: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ForwardOperatorWorkspacesResponse {
  workspaces: ForwardOperatorWorkspaceRecord[];
  count: number;
}

export interface ForwardOperatorWorkspaceDetailResponse {
  workspace: ForwardOperatorWorkspaceRecord;
}

export interface ForwardApprovalDetailResponse {
  approval: ForwardApprovalRecord;
}

export interface ForwardApprovalResumeResponse {
  approval: ForwardApprovalRecord;
  state: {
    run_id: string;
    current_step: string | null;
    stop_reason: string | null;
    approval_pending: boolean;
  };
}

export interface ForwardStreamSnapshot {
  generated_at: number;
  run_id: string | null;
  room_id: string | null;
  pending_approvals: ForwardApprovalRecord[];
  latest_run_event: Record<string, unknown> | null;
  latest_room_event: Record<string, unknown> | null;
}

export interface ForwardStreamEventMessage {
  event: string;
  data: string;
  id: string | null;
}

export interface ForwardEventStreamHandle {
  close(): void;
  closed: Promise<void>;
}
