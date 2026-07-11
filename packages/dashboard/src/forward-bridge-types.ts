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

export interface ForwardOperatorEvidenceSummaryResponse {
  generated_at: string;
  provider_calls: {
    observed: number;
    with_cost: number;
    with_tokens: number;
    with_latency: number;
    estimated_cost: number | null;
    total_tokens: number | null;
    latest_provider: string | null;
    latest_model: string | null;
  };
  budget: {
    sources: number;
    harness_sources: number;
    retry_decisions: number;
    approval_pending: number;
  };
  harness: {
    observed: number;
    sources: number;
    evidence_count: number;
    latest_runtime: string | null;
    latest_run_id: string | null;
    latest_status: string | null;
    latest_summary: string | null;
    redacted_events: number;
    metadata_only: boolean;
    raw_transcript_exposed: boolean;
  };
  sensitivity: {
    pii_findings: number;
    raw_content_exposed: boolean;
    redaction: string;
  };
  evidence_refs: string[];
}

export interface ForwardOperatorDoctorEvidenceCheck {
  id: string;
  label: string;
  status: "ok" | "warning" | "danger";
  detail: string;
  evidence_ref: string;
}

export interface ForwardOperatorDoctorEvidenceResponse {
  generated_at: string;
  status: "ok" | "warning" | "danger";
  checks: ForwardOperatorDoctorEvidenceCheck[];
}

export interface ForwardOperatorRuntimeRosterItem {
  id: string;
  label: string;
  category: "agent_runtime" | "toolchain";
  availability_status: "ok" | "warning" | "danger";
  session_status: "observed" | "available_not_observed" | "not_found";
  command: string;
  available: boolean;
  version: string | null;
  detail: string;
  latest_seen_at: string | null;
  latest_run_id: string | null;
  observation_count: number;
  evidence_refs: string[];
}

export interface ForwardOperatorRuntimeRosterResponse {
  generated_at: string;
  status: "ok" | "warning" | "danger";
  runtimes: ForwardOperatorRuntimeRosterItem[];
  counts: {
    total: number;
    agent_runtimes: number;
    available: number;
    observed: number;
    missing_agent_runtimes: number;
  };
  privacy: {
    environment_dumped: boolean;
    auth_tokens_exposed: boolean;
    raw_session_content_exposed: boolean;
    detail: string;
  };
}

export type ForwardOperatorWakeReadinessValue =
  | "ready"
  | "needs_review"
  | "attention"
  | "hold"
  | "wait_for_runtime"
  | "needs_context";

export interface ForwardOperatorWakeReadinessCandidate {
  decision_id: string;
  subject_type: "task" | "run" | "room";
  subject_id: string;
  current_status: string;
  readiness: ForwardOperatorWakeReadinessValue;
  confidence_level: "high" | "partial" | "stale";
  confidence_score: number;
  attention_flags: string[];
  reason_codes: string[];
  blockers: string[];
  suggested_actions: string[];
  requires_approval: boolean;
  preferred_agent_runtime: string | null;
  linked_refs: Record<string, unknown>;
  turn_summary: {
    records: number;
    messages: number;
    tool_events: number;
    agent_messages: number;
    evidence_refs: string[];
  };
  signal_counts: Record<string, unknown>;
  evidence_refs: string[];
}

export interface ForwardOperatorWakeReadinessResponse {
  generated_at: string;
  status: "ok" | "warning" | "danger";
  scope: {
    task_id: string | null;
    run_id: string | null;
    room_id: string | null;
    limit: number;
  };
  candidates: ForwardOperatorWakeReadinessCandidate[];
  counts: {
    returned: number;
    total: number;
    ready: number;
    needs_review: number;
    attention: number;
    hold: number;
    wait_for_runtime: number;
    needs_context: number;
    truncated: boolean;
  };
  source_projections: {
    status_confidence: {
      status: "ok" | "warning" | "danger";
      returned: number;
      total: number;
    };
    turn_records: {
      status: "ok" | "warning" | "danger";
      returned: number;
      total: number;
    };
    runtime_roster: {
      status: "ok" | "warning" | "danger";
      preferred_agent_runtime: string | null;
      observed_agent_runtimes: string[];
      available_unobserved_agent_runtimes: string[];
      missing_agent_runtimes: string[];
    };
  };
  wake_contract: {
    read_only: boolean;
    scheduler_started: boolean;
    wake_messages_sent: boolean;
    task_status_mutated: boolean;
    run_status_mutated: boolean;
    room_status_mutated: boolean;
    provider_auth_commands_executed: boolean;
    external_fetch_performed: boolean;
  };
  privacy: {
    message_content_exposed: boolean;
    tool_payload_values_exposed: boolean;
    approval_payload_values_exposed: boolean;
    validator_issue_details_exposed: boolean;
    raw_transcript_exposed: boolean;
    detail: string;
  };
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
  evidence: ForwardOperatorEvidenceSummaryResponse | null;
  doctor: ForwardOperatorDoctorEvidenceResponse | null;
  runtime_roster: ForwardOperatorRuntimeRosterResponse | null;
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

export interface ForwardOperatorPrCiEvidenceItem {
  kind: "pull_request" | "ci";
  evidence_id: string;
  provider: string;
  repository: string | null;
  title: string;
  status: string;
  conclusion: string | null;
  url: string | null;
  branch: string | null;
  commit_sha: string | null;
  observed_at: string;
  summary: string | null;
  evidence_refs: string[];
}

export interface ForwardOperatorPrCiEvidenceResponse {
  generated_at: string;
  status: "ok" | "warning" | "danger";
  counts: {
    total: number;
    pull_requests: number;
    ci_runs: number;
    failing: number;
    pending: number;
    successful: number;
    merged: number;
    rejected: number;
  };
  resume_suggestions: string[];
  items: ForwardOperatorPrCiEvidenceItem[];
  privacy: {
    external_fetch_performed: boolean;
    auth_tokens_exposed: boolean;
    raw_logs_exposed: boolean;
    redaction: string;
  };
}

export interface ForwardOperatorTaskDetailResponse {
  task: ForwardOperatorTaskRecord;
  pr_ci_evidence: ForwardOperatorPrCiEvidenceResponse;
}

export interface ForwardOperatorTaskReconcilePreviewResponse {
  generated_at: string;
  decision_id: string;
  task_id: string;
  current_status: ForwardOperatorTaskRecord["status"];
  recommended_status: ForwardOperatorTaskRecord["status"];
  confidence: "low" | "medium" | "high";
  summary: string;
  requires_approval: boolean;
  blockers: string[];
  suggested_actions: string[];
  evidence_refs: string[];
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
