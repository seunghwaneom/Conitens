import type {
  ForwardApprovalDetailResponse,
  ForwardOperatorAgentRecord,
  ForwardOperatorAgentsResponse,
  ForwardOperatorDoctorEvidenceCheck,
  ForwardOperatorDoctorEvidenceResponse,
  ForwardOperatorEvidenceSummaryResponse,
  ForwardOperatorInboxItem,
  ForwardOperatorInboxResponse,
  ForwardOperatorPrCiEvidenceItem,
  ForwardOperatorPrCiEvidenceResponse,
  ForwardOperatorRuntimeRosterItem,
  ForwardOperatorRuntimeRosterResponse,
  ForwardOperatorTaskDeleteResponse,
  ForwardOperatorTaskDetailResponse,
  ForwardOperatorTaskRecord,
  ForwardOperatorTaskReconcilePreviewResponse,
  ForwardOperatorTasksResponse,
  ForwardOperatorWakeReadinessCandidate,
  ForwardOperatorWakeReadinessResponse,
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

function asNullableNumber(value: unknown, field: string): number | null {
  if (value == null) {
    return null;
  }
  return asNumber(value, field);
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${field}: expected boolean`);
  }
  return value;
}

function asStatus(value: unknown, field: string, values: string[]): string {
  const status = asString(value, field);
  if (!values.includes(status)) {
    throw new Error(`Invalid ${field}: unsupported status`);
  }
  return status;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

function parseDoctorStatus(value: unknown, field: string): ForwardOperatorDoctorEvidenceCheck["status"] {
  return asStatus(value, field, ["ok", "warning", "danger"]) as ForwardOperatorDoctorEvidenceCheck["status"];
}

function parseOperatorEvidenceSummary(value: unknown, field: string): ForwardOperatorEvidenceSummaryResponse {
  if (
    !isObject(value) ||
    !isObject(value.provider_calls) ||
    !isObject(value.budget) ||
    !isObject(value.sensitivity)
  ) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    generated_at: asString(value.generated_at, `${field}.generated_at`),
    provider_calls: {
      observed: asNumber(value.provider_calls.observed, `${field}.provider_calls.observed`),
      with_cost: asNumber(value.provider_calls.with_cost, `${field}.provider_calls.with_cost`),
      with_tokens: asNumber(value.provider_calls.with_tokens, `${field}.provider_calls.with_tokens`),
      with_latency: asNumber(value.provider_calls.with_latency, `${field}.provider_calls.with_latency`),
      estimated_cost: asNullableNumber(value.provider_calls.estimated_cost, `${field}.provider_calls.estimated_cost`),
      total_tokens: asNullableNumber(value.provider_calls.total_tokens, `${field}.provider_calls.total_tokens`),
      latest_provider: asNullableString(value.provider_calls.latest_provider, `${field}.provider_calls.latest_provider`),
      latest_model: asNullableString(value.provider_calls.latest_model, `${field}.provider_calls.latest_model`),
    },
    budget: {
      sources: asNumber(value.budget.sources, `${field}.budget.sources`),
      retry_decisions: asNumber(value.budget.retry_decisions, `${field}.budget.retry_decisions`),
      approval_pending: asNumber(value.budget.approval_pending, `${field}.budget.approval_pending`),
    },
    sensitivity: {
      pii_findings: asNumber(value.sensitivity.pii_findings, `${field}.sensitivity.pii_findings`),
      raw_content_exposed: asBoolean(value.sensitivity.raw_content_exposed, `${field}.sensitivity.raw_content_exposed`),
      redaction: asString(value.sensitivity.redaction, `${field}.sensitivity.redaction`),
    },
    evidence_refs: asStringArray(value.evidence_refs),
  };
}

function parseDoctorEvidenceCheck(value: unknown, field: string): ForwardOperatorDoctorEvidenceCheck {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    id: asString(value.id, `${field}.id`),
    label: asString(value.label, `${field}.label`),
    status: parseDoctorStatus(value.status, `${field}.status`),
    detail: asString(value.detail, `${field}.detail`),
    evidence_ref: asString(value.evidence_ref, `${field}.evidence_ref`),
  };
}

function parseDoctorEvidence(value: unknown, field: string): ForwardOperatorDoctorEvidenceResponse {
  if (!isObject(value) || !Array.isArray(value.checks)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    generated_at: asString(value.generated_at, `${field}.generated_at`),
    status: parseDoctorStatus(value.status, `${field}.status`),
    checks: value.checks.map((item, index) => parseDoctorEvidenceCheck(item, `${field}.checks[${index}]`)),
  };
}

function parseRuntimeRosterItem(value: unknown, field: string): ForwardOperatorRuntimeRosterItem {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    id: asString(value.id, `${field}.id`),
    label: asString(value.label, `${field}.label`),
    category: asStatus(value.category, `${field}.category`, ["agent_runtime", "toolchain"]) as ForwardOperatorRuntimeRosterItem["category"],
    availability_status: parseDoctorStatus(value.availability_status, `${field}.availability_status`),
    session_status: asStatus(
      value.session_status,
      `${field}.session_status`,
      ["observed", "available_not_observed", "not_found"],
    ) as ForwardOperatorRuntimeRosterItem["session_status"],
    command: asString(value.command, `${field}.command`),
    available: asBoolean(value.available, `${field}.available`),
    version: asNullableString(value.version, `${field}.version`),
    detail: asString(value.detail, `${field}.detail`),
    latest_seen_at: asNullableString(value.latest_seen_at, `${field}.latest_seen_at`),
    latest_run_id: asNullableString(value.latest_run_id, `${field}.latest_run_id`),
    observation_count: asNumber(value.observation_count, `${field}.observation_count`),
    evidence_refs: asStringArray(value.evidence_refs),
  };
}

function parseRuntimeRoster(value: unknown, field: string): ForwardOperatorRuntimeRosterResponse {
  if (!isObject(value) || !Array.isArray(value.runtimes) || !isObject(value.counts) || !isObject(value.privacy)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    generated_at: asString(value.generated_at, `${field}.generated_at`),
    status: parseDoctorStatus(value.status, `${field}.status`),
    runtimes: value.runtimes.map((item, index) => parseRuntimeRosterItem(item, `${field}.runtimes[${index}]`)),
    counts: {
      total: asNumber(value.counts.total, `${field}.counts.total`),
      agent_runtimes: asNumber(value.counts.agent_runtimes, `${field}.counts.agent_runtimes`),
      available: asNumber(value.counts.available, `${field}.counts.available`),
      observed: asNumber(value.counts.observed, `${field}.counts.observed`),
      missing_agent_runtimes: asNumber(value.counts.missing_agent_runtimes, `${field}.counts.missing_agent_runtimes`),
    },
    privacy: {
      environment_dumped: asBoolean(value.privacy.environment_dumped, `${field}.privacy.environment_dumped`),
      auth_tokens_exposed: asBoolean(value.privacy.auth_tokens_exposed, `${field}.privacy.auth_tokens_exposed`),
      raw_session_content_exposed: asBoolean(value.privacy.raw_session_content_exposed, `${field}.privacy.raw_session_content_exposed`),
      detail: asString(value.privacy.detail, `${field}.privacy.detail`),
    },
  };
}

function parseWakeReadinessCandidate(value: unknown, field: string): ForwardOperatorWakeReadinessCandidate {
  if (!isObject(value) || !isObject(value.turn_summary)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    decision_id: asString(value.decision_id, `${field}.decision_id`),
    subject_type: asStatus(value.subject_type, `${field}.subject_type`, ["task", "run", "room"]) as ForwardOperatorWakeReadinessCandidate["subject_type"],
    subject_id: asString(value.subject_id, `${field}.subject_id`),
    current_status: asString(value.current_status, `${field}.current_status`),
    readiness: asStatus(
      value.readiness,
      `${field}.readiness`,
      ["ready", "needs_review", "attention", "hold", "wait_for_runtime", "needs_context"],
    ) as ForwardOperatorWakeReadinessCandidate["readiness"],
    confidence_level: asStatus(value.confidence_level, `${field}.confidence_level`, ["high", "partial", "stale"]) as ForwardOperatorWakeReadinessCandidate["confidence_level"],
    confidence_score: asNumber(value.confidence_score, `${field}.confidence_score`),
    attention_flags: asStringArray(value.attention_flags),
    reason_codes: asStringArray(value.reason_codes),
    blockers: asStringArray(value.blockers),
    suggested_actions: asStringArray(value.suggested_actions),
    requires_approval: asBoolean(value.requires_approval, `${field}.requires_approval`),
    preferred_agent_runtime: asNullableString(value.preferred_agent_runtime, `${field}.preferred_agent_runtime`),
    linked_refs: isObject(value.linked_refs) ? value.linked_refs : {},
    turn_summary: {
      records: asNumber(value.turn_summary.records, `${field}.turn_summary.records`),
      messages: asNumber(value.turn_summary.messages, `${field}.turn_summary.messages`),
      tool_events: asNumber(value.turn_summary.tool_events, `${field}.turn_summary.tool_events`),
      agent_messages: asNumber(value.turn_summary.agent_messages, `${field}.turn_summary.agent_messages`),
      evidence_refs: asStringArray(value.turn_summary.evidence_refs),
    },
    signal_counts: isObject(value.signal_counts) ? value.signal_counts : {},
    evidence_refs: asStringArray(value.evidence_refs),
  };
}

export function parseOperatorWakeReadinessResponse(value: unknown): ForwardOperatorWakeReadinessResponse {
  if (
    !isObject(value) ||
    !isObject(value.scope) ||
    !Array.isArray(value.candidates) ||
    !isObject(value.counts) ||
    !isObject(value.source_projections) ||
    !isObject(value.wake_contract) ||
    !isObject(value.privacy)
  ) {
    throw new Error("Invalid operator wake readiness response");
  }
  const sourceProjections = value.source_projections;
  if (
    !isObject(sourceProjections.status_confidence) ||
    !isObject(sourceProjections.turn_records) ||
    !isObject(sourceProjections.runtime_roster)
  ) {
    throw new Error("Invalid operator wake readiness source projections");
  }
  return {
    generated_at: asString(value.generated_at, "generated_at"),
    status: parseDoctorStatus(value.status, "status"),
    scope: {
      task_id: asNullableString(value.scope.task_id, "scope.task_id"),
      run_id: asNullableString(value.scope.run_id, "scope.run_id"),
      room_id: asNullableString(value.scope.room_id, "scope.room_id"),
      limit: asNumber(value.scope.limit, "scope.limit"),
    },
    candidates: value.candidates.map((item, index) => parseWakeReadinessCandidate(item, `candidates[${index}]`)),
    counts: {
      returned: asNumber(value.counts.returned, "counts.returned"),
      total: asNumber(value.counts.total, "counts.total"),
      ready: asNumber(value.counts.ready, "counts.ready"),
      needs_review: asNumber(value.counts.needs_review, "counts.needs_review"),
      attention: asNumber(value.counts.attention, "counts.attention"),
      hold: asNumber(value.counts.hold, "counts.hold"),
      wait_for_runtime: asNumber(value.counts.wait_for_runtime, "counts.wait_for_runtime"),
      needs_context: asNumber(value.counts.needs_context, "counts.needs_context"),
      truncated: asBoolean(value.counts.truncated, "counts.truncated"),
    },
    source_projections: {
      status_confidence: {
        status: parseDoctorStatus(sourceProjections.status_confidence.status, "source_projections.status_confidence.status"),
        returned: asNumber(sourceProjections.status_confidence.returned, "source_projections.status_confidence.returned"),
        total: asNumber(sourceProjections.status_confidence.total, "source_projections.status_confidence.total"),
      },
      turn_records: {
        status: parseDoctorStatus(sourceProjections.turn_records.status, "source_projections.turn_records.status"),
        returned: asNumber(sourceProjections.turn_records.returned, "source_projections.turn_records.returned"),
        total: asNumber(sourceProjections.turn_records.total, "source_projections.turn_records.total"),
      },
      runtime_roster: {
        status: parseDoctorStatus(sourceProjections.runtime_roster.status, "source_projections.runtime_roster.status"),
        preferred_agent_runtime: asNullableString(sourceProjections.runtime_roster.preferred_agent_runtime, "source_projections.runtime_roster.preferred_agent_runtime"),
        observed_agent_runtimes: asStringArray(sourceProjections.runtime_roster.observed_agent_runtimes),
        available_unobserved_agent_runtimes: asStringArray(sourceProjections.runtime_roster.available_unobserved_agent_runtimes),
        missing_agent_runtimes: asStringArray(sourceProjections.runtime_roster.missing_agent_runtimes),
      },
    },
    wake_contract: {
      read_only: asBoolean(value.wake_contract.read_only, "wake_contract.read_only"),
      scheduler_started: asBoolean(value.wake_contract.scheduler_started, "wake_contract.scheduler_started"),
      wake_messages_sent: asBoolean(value.wake_contract.wake_messages_sent, "wake_contract.wake_messages_sent"),
      task_status_mutated: asBoolean(value.wake_contract.task_status_mutated, "wake_contract.task_status_mutated"),
      run_status_mutated: asBoolean(value.wake_contract.run_status_mutated, "wake_contract.run_status_mutated"),
      room_status_mutated: asBoolean(value.wake_contract.room_status_mutated, "wake_contract.room_status_mutated"),
      provider_auth_commands_executed: asBoolean(value.wake_contract.provider_auth_commands_executed, "wake_contract.provider_auth_commands_executed"),
      external_fetch_performed: asBoolean(value.wake_contract.external_fetch_performed, "wake_contract.external_fetch_performed"),
    },
    privacy: {
      message_content_exposed: asBoolean(value.privacy.message_content_exposed, "privacy.message_content_exposed"),
      tool_payload_values_exposed: asBoolean(value.privacy.tool_payload_values_exposed, "privacy.tool_payload_values_exposed"),
      approval_payload_values_exposed: asBoolean(value.privacy.approval_payload_values_exposed, "privacy.approval_payload_values_exposed"),
      validator_issue_details_exposed: asBoolean(value.privacy.validator_issue_details_exposed, "privacy.validator_issue_details_exposed"),
      raw_transcript_exposed: asBoolean(value.privacy.raw_transcript_exposed, "privacy.raw_transcript_exposed"),
      detail: asString(value.privacy.detail, "privacy.detail"),
    },
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
    evidence: value.evidence == null ? null : parseOperatorEvidenceSummary(value.evidence, "evidence"),
    doctor: value.doctor == null ? null : parseDoctorEvidence(value.doctor, "doctor"),
    runtime_roster: value.runtime_roster == null ? null : parseRuntimeRoster(value.runtime_roster, "runtime_roster"),
  };
}

export function parseOperatorEvidenceSummaryResponse(value: unknown): ForwardOperatorEvidenceSummaryResponse {
  return parseOperatorEvidenceSummary(value, "operator evidence summary");
}

export function parseOperatorDoctorEvidenceResponse(value: unknown): ForwardOperatorDoctorEvidenceResponse {
  return parseDoctorEvidence(value, "operator doctor evidence");
}

export function parseOperatorRuntimeRosterResponse(value: unknown): ForwardOperatorRuntimeRosterResponse {
  return parseRuntimeRoster(value, "operator runtime roster");
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

function parsePrCiEvidenceStatus(value: unknown, field: string): ForwardOperatorPrCiEvidenceResponse["status"] {
  return asStatus(value, field, ["ok", "warning", "danger"]) as ForwardOperatorPrCiEvidenceResponse["status"];
}

function parsePrCiEvidenceItem(value: unknown, field: string): ForwardOperatorPrCiEvidenceItem {
  if (!isObject(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const kind = asStatus(value.kind, `${field}.kind`, ["pull_request", "ci"]) as ForwardOperatorPrCiEvidenceItem["kind"];
  return {
    kind,
    evidence_id: asString(value.evidence_id, `${field}.evidence_id`),
    provider: asString(value.provider, `${field}.provider`),
    repository: asNullableString(value.repository, `${field}.repository`),
    title: asString(value.title, `${field}.title`),
    status: asString(value.status, `${field}.status`),
    conclusion: asNullableString(value.conclusion, `${field}.conclusion`),
    url: asNullableString(value.url, `${field}.url`),
    branch: asNullableString(value.branch, `${field}.branch`),
    commit_sha: asNullableString(value.commit_sha, `${field}.commit_sha`),
    observed_at: asString(value.observed_at, `${field}.observed_at`),
    summary: asNullableString(value.summary, `${field}.summary`),
    evidence_refs: asStringArray(value.evidence_refs),
  };
}

function emptyPrCiEvidence(): ForwardOperatorPrCiEvidenceResponse {
  return {
    generated_at: "",
    status: "ok",
    counts: {
      total: 0,
      pull_requests: 0,
      ci_runs: 0,
      failing: 0,
      pending: 0,
      successful: 0,
      merged: 0,
      rejected: 0,
    },
    resume_suggestions: [],
    items: [],
    privacy: {
      external_fetch_performed: false,
      auth_tokens_exposed: false,
      raw_logs_exposed: false,
      redaction: "no PR/CI evidence block returned",
    },
  };
}

function parsePrCiEvidence(value: unknown, field: string): ForwardOperatorPrCiEvidenceResponse {
  if (value == null) {
    return emptyPrCiEvidence();
  }
  if (!isObject(value) || !isObject(value.counts) || !Array.isArray(value.resume_suggestions) || !Array.isArray(value.items) || !isObject(value.privacy)) {
    throw new Error(`Invalid ${field}`);
  }
  return {
    generated_at: asString(value.generated_at, `${field}.generated_at`),
    status: parsePrCiEvidenceStatus(value.status, `${field}.status`),
    counts: {
      total: asNumber(value.counts.total, `${field}.counts.total`),
      pull_requests: asNumber(value.counts.pull_requests, `${field}.counts.pull_requests`),
      ci_runs: asNumber(value.counts.ci_runs, `${field}.counts.ci_runs`),
      failing: asNumber(value.counts.failing, `${field}.counts.failing`),
      pending: asNumber(value.counts.pending, `${field}.counts.pending`),
      successful: asNumber(value.counts.successful, `${field}.counts.successful`),
      merged: asNumber(value.counts.merged, `${field}.counts.merged`),
      rejected: asNumber(value.counts.rejected, `${field}.counts.rejected`),
    },
    resume_suggestions: asStringArray(value.resume_suggestions),
    items: value.items.map((item, index) => parsePrCiEvidenceItem(item, `${field}.items[${index}]`)),
    privacy: {
      external_fetch_performed: asBoolean(value.privacy.external_fetch_performed, `${field}.privacy.external_fetch_performed`),
      auth_tokens_exposed: asBoolean(value.privacy.auth_tokens_exposed, `${field}.privacy.auth_tokens_exposed`),
      raw_logs_exposed: asBoolean(value.privacy.raw_logs_exposed, `${field}.privacy.raw_logs_exposed`),
      redaction: asString(value.privacy.redaction, `${field}.privacy.redaction`),
    },
  };
}

export function parseOperatorTaskDetailResponse(value: unknown): ForwardOperatorTaskDetailResponse {
  if (!isObject(value)) {
    throw new Error("Invalid operator task detail response");
  }
  return {
    task: parseOperatorTaskRecord(value.task, "task"),
    pr_ci_evidence: parsePrCiEvidence(value.pr_ci_evidence, "pr_ci_evidence"),
  };
}

export function parseOperatorTaskReconcilePreviewResponse(value: unknown): ForwardOperatorTaskReconcilePreviewResponse {
  if (!isObject(value)) {
    throw new Error("Invalid operator task reconcile preview response");
  }
  const currentStatus = asStatus(
    value.current_status,
    "current_status",
    ["backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"],
  ) as ForwardOperatorTaskRecord["status"];
  const recommendedStatus = asStatus(
    value.recommended_status,
    "recommended_status",
    ["backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"],
  ) as ForwardOperatorTaskRecord["status"];
  return {
    generated_at: asString(value.generated_at, "generated_at"),
    decision_id: asString(value.decision_id, "decision_id"),
    task_id: asString(value.task_id, "task_id"),
    current_status: currentStatus,
    recommended_status: recommendedStatus,
    confidence: asStatus(value.confidence, "confidence", ["low", "medium", "high"]) as ForwardOperatorTaskReconcilePreviewResponse["confidence"],
    summary: asString(value.summary, "summary"),
    requires_approval: asBoolean(value.requires_approval, "requires_approval"),
    blockers: asStringArray(value.blockers),
    suggested_actions: asStringArray(value.suggested_actions),
    evidence_refs: asStringArray(value.evidence_refs),
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
