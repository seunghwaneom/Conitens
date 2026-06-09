import test from "node:test";
import assert from "node:assert/strict";
import {
  parseApprovalDetailResponse,
  parseApprovalResumeResponse,
  parseApprovalsResponse,
  parseOperatorAgentsResponse,
  parseContextLatestResponse,
  parseOperatorDoctorEvidenceResponse,
  parseOperatorEvidenceSummaryResponse,
  parseOperatorInboxResponse,
  parseOperatorRuntimeRosterResponse,
  parseOperatorTaskDeleteResponse,
  parseOperatorTaskDetailResponse,
  parseOperatorTaskReconcilePreviewResponse,
  parseOperatorTasksResponse,
  parseOperatorWakeReadinessResponse,
  parseOperatorWorkspaceDetailResponse,
  parseOperatorWorkspacesResponse,
  parseOperatorSummaryResponse,
  parseForwardEventStreamChunk,
  parseReplayResponse,
  parseRoomTimelineResponse,
  parseRunDetailResponse,
  parseRunsResponse,
  persistSavedTaskFilterPresets,
  persistTaskFilterState,
  readInitialTaskFilterState,
  readSavedTaskFilterPresets,
  parseStateDocsResponse,
  parseStreamSnapshot,
} from "../src/forward-bridge.ts";
import { buildForwardRoute, parseForwardRoute } from "../src/forward-route.ts";
import {
  buildOperatorTaskDraftMutationBody,
  buildOperatorTaskStatusMutationBody,
} from "../src/operator-task-actions.ts";
import {
  buildOperatorWorkspaceMutationBody,
  getOperatorWorkspaceQuickStatusActions,
} from "../src/operator-workspace-actions.ts";
import { toOperatorSummaryViewModel } from "../src/operator-summary-model.ts";
import { toOperatorTaskReconcilePreview } from "../src/operator-reconciler-model.ts";
import { toOperatorTaskDetail } from "../src/operator-tasks-model.ts";
import { toOperatorWakeReadinessViewModel } from "../src/operator-wake-readiness-model.ts";
import {
  extractRoomOptions,
  pickInitialApprovalId,
  pickNextApprovalId,
  pickNextRoomId,
  summarizeFindingsDocument,
  summarizeValidatorCorrelations,
  toInsightCardViewModels,
  toRunDetailViewModel,
  toRunListItemViewModel,
} from "../src/forward-view-model.ts";

test("parseRunsResponse validates the BE-1a run list shape", () => {
  const parsed = parseRunsResponse({
    count: 1,
    runs: [
      {
        run_id: "run-1",
        status: "active",
        user_request: "Ship bridge",
        created_at: "2026-04-02T00:00:00Z",
        updated_at: "2026-04-02T00:01:00Z",
        latest_iteration_id: "iter-1",
        latest_iteration_status: "running",
        counts: {
          iterations: 1,
          validator_results: 2,
          approvals: 1,
          rooms: 1,
          messages: 4,
          tool_events: 2,
          insights: 1,
          handoff_packets: 0,
        },
      },
    ],
  });

  assert.equal(parsed.count, 1);
  assert.equal(parsed.runs[0].run_id, "run-1");
  assert.equal(parsed.runs[0].counts.messages, 4);
});

test("parseOperatorSummaryResponse validates the overview summary shape", () => {
  const parsed = parseOperatorSummaryResponse({
    generated_at: "2026-04-04T00:00:00Z",
    runs: {
      total: 2,
      active: 1,
      awaiting_approval: 1,
      with_failures: 1,
      latest_run_id: "run-2",
      latest_status: "active",
    },
    approvals: {
      pending: 1,
    },
    rooms: {
      active: 2,
      review: 1,
    },
    validation: {
      failing_runs: 1,
      latest_failure_reason: "validator failed",
    },
    handoffs: {
      open: 2,
      blocked: 1,
    },
  });

  assert.equal(parsed.runs.latest_run_id, "run-2");
  assert.equal(parsed.validation.latest_failure_reason, "validator failed");
  assert.equal(parsed.handoffs.blocked, 1);
  assert.equal(parsed.evidence, null);
  assert.equal(parsed.doctor, null);
  assert.equal(parsed.runtime_roster, null);
});

test("parseOperatorSummaryResponse accepts optional evidence and doctor blocks", () => {
  const parsed = parseOperatorSummaryResponse({
    generated_at: "2026-06-07T00:00:00Z",
    runs: {
      total: 1,
      active: 1,
      awaiting_approval: 0,
      with_failures: 0,
      latest_run_id: "run-1",
      latest_status: "active",
    },
    approvals: {
      pending: 0,
    },
    rooms: {
      active: 1,
      review: 0,
    },
    validation: {
      failing_runs: 0,
      latest_failure_reason: null,
    },
    handoffs: {
      open: 0,
      blocked: 0,
    },
    evidence: {
      generated_at: "2026-06-07T00:00:00Z",
      provider_calls: {
        observed: 1,
        with_cost: 1,
        with_tokens: 1,
        with_latency: 1,
        estimated_cost: 0.1234,
        total_tokens: 321,
        latest_provider: "codex",
        latest_model: "gpt-5.4",
      },
      budget: {
        sources: 1,
        retry_decisions: 1,
        approval_pending: 0,
      },
      sensitivity: {
        pii_findings: 0,
        raw_content_exposed: false,
        redaction: "forward projection omits raw prompt and response content",
      },
      evidence_refs: ["orchestration_checkpoint:run-1:build:1"],
    },
    doctor: {
      generated_at: "2026-06-07T00:00:00Z",
      status: "warning",
      checks: [
        {
          id: "bridge-auth",
          label: "Bridge auth boundary",
          status: "ok",
          detail: "Read and write routes require loopback plus bearer authorization.",
          evidence_ref: "scripts/ensemble_forward_bridge.py",
        },
      ],
    },
    runtime_roster: {
      generated_at: "2026-06-07T00:00:00Z",
      status: "warning",
      runtimes: [
        {
          id: "codex",
          label: "Codex CLI",
          category: "agent_runtime",
          availability_status: "ok",
          session_status: "observed",
          command: "codex",
          available: true,
          version: "codex-cli 1.0.0",
          detail: "codex is available on PATH",
          latest_seen_at: "2026-06-07T00:00:00Z",
          latest_run_id: "run-1",
          observation_count: 1,
          evidence_refs: ["orchestration_checkpoint:run-1:build:1"],
        },
        {
          id: "gemini",
          label: "Gemini CLI",
          category: "agent_runtime",
          availability_status: "warning",
          session_status: "not_found",
          command: "gemini",
          available: false,
          version: null,
          detail: "gemini was not found on PATH",
          latest_seen_at: null,
          latest_run_id: null,
          observation_count: 0,
          evidence_refs: [],
        },
      ],
      counts: {
        total: 2,
        agent_runtimes: 2,
        available: 1,
        observed: 1,
        missing_agent_runtimes: 1,
      },
      privacy: {
        environment_dumped: false,
        auth_tokens_exposed: false,
        raw_session_content_exposed: false,
        detail: "Roster uses bounded command/version probes and orchestration checkpoint metadata only.",
      },
    },
  });

  assert.equal(parsed.evidence?.provider_calls.total_tokens, 321);
  assert.equal(parsed.doctor?.checks[0].id, "bridge-auth");
  assert.equal(parsed.runtime_roster?.counts.observed, 1);
  const view = toOperatorSummaryViewModel(parsed);
  assert.equal(view.evidence?.metrics[0].value, "1");
  assert.equal(view.doctor?.checks[0].status, "ok");
  assert.equal(view.runtimeRoster?.runtimes[0].sessionLabel, "checkpoint evidence");
  assert.equal(view.postureLabel, "runtime attention");
});

test("parseOperatorEvidenceSummaryResponse and parseOperatorDoctorEvidenceResponse validate standalone shapes", () => {
  const evidence = parseOperatorEvidenceSummaryResponse({
    generated_at: "2026-06-07T00:00:00Z",
    provider_calls: {
      observed: 0,
      with_cost: 0,
      with_tokens: 0,
      with_latency: 0,
      estimated_cost: null,
      total_tokens: null,
      latest_provider: null,
      latest_model: null,
    },
    budget: {
      sources: 0,
      retry_decisions: 0,
      approval_pending: 0,
    },
    sensitivity: {
      pii_findings: 0,
      raw_content_exposed: false,
      redaction: "raw content omitted",
    },
    evidence_refs: [],
  });
  const doctor = parseOperatorDoctorEvidenceResponse({
    generated_at: "2026-06-07T00:00:00Z",
    status: "warning",
    checks: [
      {
        id: "node",
        label: "Node runtime",
        status: "warning",
        detail: "node was not found on PATH",
        evidence_ref: "PATH:node",
      },
    ],
  });

  assert.equal(evidence.provider_calls.observed, 0);
  assert.equal(doctor.status, "warning");
  assert.equal(doctor.checks[0].evidence_ref, "PATH:node");
});

test("parseOperatorRuntimeRosterResponse validates runtime availability and checkpoint evidence", () => {
  const roster = parseOperatorRuntimeRosterResponse({
    generated_at: "2026-06-07T00:00:00Z",
    status: "warning",
    runtimes: [
      {
        id: "codex",
        label: "Codex CLI",
        category: "agent_runtime",
        availability_status: "ok",
        session_status: "observed",
        command: "codex",
        available: true,
        version: "codex-cli 1.0.0",
        detail: "codex is available on PATH",
        latest_seen_at: "2026-06-07T00:00:00Z",
        latest_run_id: "run-1",
        observation_count: 2,
        evidence_refs: ["orchestration_checkpoint:run-1:build:1"],
      },
      {
        id: "opencode",
        label: "OpenCode CLI",
        category: "agent_runtime",
        availability_status: "ok",
        session_status: "available_not_observed",
        command: "opencode",
        available: true,
        version: null,
        detail: "opencode is available on PATH",
        latest_seen_at: null,
        latest_run_id: null,
        observation_count: 0,
        evidence_refs: [],
      },
      {
        id: "gemini",
        label: "Gemini CLI",
        category: "agent_runtime",
        availability_status: "warning",
        session_status: "not_found",
        command: "gemini",
        available: false,
        version: null,
        detail: "gemini was not found on PATH",
        latest_seen_at: null,
        latest_run_id: null,
        observation_count: 0,
        evidence_refs: [],
      },
    ],
    counts: {
      total: 3,
      agent_runtimes: 3,
      available: 2,
      observed: 1,
      missing_agent_runtimes: 1,
    },
    privacy: {
      environment_dumped: false,
      auth_tokens_exposed: false,
      raw_session_content_exposed: false,
      detail: "Roster uses bounded command/version probes and orchestration checkpoint metadata only.",
    },
  });

  assert.equal(roster.runtimes[0].session_status, "observed");
  assert.equal(roster.runtimes[1].session_status, "available_not_observed");
  assert.equal(roster.runtimes[2].session_status, "not_found");
  assert.equal(roster.privacy.raw_session_content_exposed, false);
});

test("parseOperatorWakeReadinessResponse validates read-only wake candidates", () => {
  const parsed = parseOperatorWakeReadinessResponse({
    generated_at: "2026-06-08T00:00:00Z",
    status: "warning",
    scope: {
      task_id: null,
      run_id: "run-1",
      room_id: null,
      limit: 12,
    },
    candidates: [
      {
        decision_id: "wake:task:otask-1:hold:partial",
        subject_type: "task",
        subject_id: "otask-1",
        current_status: "in_review",
        readiness: "hold",
        confidence_level: "partial",
        confidence_score: 0.58,
        attention_flags: ["pending_approval"],
        reason_codes: ["pending_approval"],
        blockers: ["pending_approval"],
        suggested_actions: ["Review the pending approval before waking or resuming work."],
        requires_approval: true,
        preferred_agent_runtime: "codex",
        linked_refs: {
          run_id: "run-1",
          room_ids: ["room-1"],
        },
        turn_summary: {
          records: 2,
          messages: 1,
          tool_events: 1,
          agent_messages: 1,
          evidence_refs: ["message:1"],
        },
        signal_counts: {
          pending_approvals: 1,
        },
        evidence_refs: ["operator_task:otask-1", "approval:approval-1"],
      },
      {
        decision_id: "wake:run:run-1:ready:high",
        subject_type: "run",
        subject_id: "run-1",
        current_status: "active",
        readiness: "ready",
        confidence_level: "high",
        confidence_score: 0.92,
        attention_flags: [],
        reason_codes: ["validator_passed"],
        blockers: [],
        suggested_actions: ["Ready for operator-reviewed wake planning with codex."],
        requires_approval: false,
        preferred_agent_runtime: "codex",
        linked_refs: {
          room_ids: ["room-1"],
          task_ids: ["otask-1"],
        },
        turn_summary: {
          records: 2,
          messages: 1,
          tool_events: 1,
          agent_messages: 1,
          evidence_refs: [],
        },
        signal_counts: {
          validator_results: 1,
        },
        evidence_refs: ["run:run-1"],
      },
    ],
    counts: {
      returned: 2,
      total: 2,
      ready: 1,
      needs_review: 0,
      attention: 0,
      hold: 1,
      wait_for_runtime: 0,
      needs_context: 0,
      truncated: false,
    },
    source_projections: {
      status_confidence: {
        status: "warning",
        returned: 2,
        total: 2,
      },
      turn_records: {
        status: "ok",
        returned: 2,
        total: 2,
      },
      runtime_roster: {
        status: "ok",
        preferred_agent_runtime: "codex",
        observed_agent_runtimes: ["codex"],
        available_unobserved_agent_runtimes: [],
        missing_agent_runtimes: [],
      },
    },
    wake_contract: {
      read_only: true,
      scheduler_started: false,
      wake_messages_sent: false,
      task_status_mutated: false,
      run_status_mutated: false,
      room_status_mutated: false,
      provider_auth_commands_executed: false,
      external_fetch_performed: false,
    },
    privacy: {
      message_content_exposed: false,
      tool_payload_values_exposed: false,
      approval_payload_values_exposed: false,
      validator_issue_details_exposed: false,
      raw_transcript_exposed: false,
      detail: "Wake readiness combines metadata-only projections and does not schedule, resume, mutate, or expose raw content.",
    },
  });
  const view = toOperatorWakeReadinessViewModel(parsed);

  assert.equal(parsed.candidates[0].readiness, "hold");
  assert.equal(parsed.wake_contract.scheduler_started, false);
  assert.equal(parsed.privacy.raw_transcript_exposed, false);
  assert.equal(view.posture, "danger");
  assert.equal(view.metrics[0].value, "1");
  assert.equal(view.candidates[0].targetHash, "#/tasks/otask-1");
  assert.equal(view.candidates[1].targetHash, "#/runs/run-1");
  assert.match(view.contractLabel, /read-only/);
});

test("parseOperatorInboxResponse validates the inbox summary shape", () => {
  const parsed = parseOperatorInboxResponse({
    count: 2,
    items: [
      {
        id: "approval:approval-1",
        kind: "approval",
        severity: "warning",
        title: "Approval required for shell_execution",
        summary: "sample-agent requested shell_execution",
        run_id: "run-1",
        iteration_id: "iter-1",
        room_id: null,
        created_at: "2026-04-04T00:00:00Z",
        action_label: "Review approval",
      },
      {
        id: "validator:run-1:1",
        kind: "validator_failure",
        severity: "danger",
        title: "Validator failed for run-1",
        summary: "validator failed",
        run_id: "run-1",
        iteration_id: "iter-1",
        room_id: null,
        created_at: "2026-04-04T00:01:00Z",
        action_label: "Inspect run",
      },
    ],
  });

  assert.equal(parsed.count, 2);
  assert.equal(parsed.items[0].kind, "approval");
  assert.equal(parsed.items[1].severity, "danger");
});

test("parseOperatorAgentsResponse validates the agents projection shape", () => {
  const parsed = parseOperatorAgentsResponse({
    count: 1,
    agents: [
      {
        agent_id: "sample-agent",
        name: "sample-agent",
        role: "implementer",
        archetype: "Builder",
        status: "running",
        room_id: "room-1",
        task_count: 2,
        last_active: "2026-04-04T00:00:00Z",
        memory_count: 3,
        error_rate: 0.5,
        latest_run_id: "run-1",
        latest_run_status: "active",
        latest_blocker: "approval pending: shell_execution",
        pending_approvals: 1,
        workspace_ref: null,
      },
    ],
  });

  assert.equal(parsed.count, 1);
  assert.equal(parsed.agents[0].agent_id, "sample-agent");
  assert.equal(parsed.agents[0].latest_run_status, "active");
  assert.equal(parsed.agents[0].pending_approvals, 1);
});

test("parseOperatorTasksResponse and parseOperatorTaskDetailResponse validate the owned task shape", () => {
  const listParsed = parseOperatorTasksResponse({
    count: 1,
    tasks: [
      {
        task_id: "otask-1",
        title: "Introduce canonical operator task",
        objective: "Create the first owned operator API slice",
        status: "todo",
        priority: "high",
        owner_agent_id: "sample-agent",
        linked_run_id: "run-1",
        linked_iteration_id: "iter-1",
        linked_room_ids_json: ["room-1"],
        blocked_reason: null,
        acceptance_json: ["task exists"],
        workspace_ref: null,
        archived_at: null,
        archived_by: null,
        archive_note: null,
        created_at: "2026-04-04T00:00:00Z",
        updated_at: "2026-04-04T00:00:00Z",
      },
    ],
  });
  const detailParsed = parseOperatorTaskDetailResponse({
    task: {
      task_id: "otask-1",
      title: "Introduce canonical operator task",
      objective: "Create the first owned operator API slice",
      status: "todo",
      priority: "high",
      owner_agent_id: "sample-agent",
      linked_run_id: "run-1",
      linked_iteration_id: "iter-1",
      linked_room_ids_json: ["room-1"],
      blocked_reason: null,
      acceptance_json: ["task exists"],
      workspace_ref: null,
      archived_at: null,
      archived_by: null,
      archive_note: null,
      created_at: "2026-04-04T00:00:00Z",
      updated_at: "2026-04-04T00:00:00Z",
    },
    pr_ci_evidence: {
      generated_at: "2026-06-07T08:00:00Z",
      status: "danger",
      counts: {
        total: 2,
        pull_requests: 1,
        ci_runs: 1,
        failing: 1,
        pending: 0,
        successful: 0,
        merged: 0,
        rejected: 0,
      },
      resume_suggestions: ["review failing PR/CI evidence before resuming this task"],
      items: [
        {
          kind: "ci",
          evidence_id: "event-ci",
          provider: "github-actions",
          repository: "owner/repo",
          title: "unit tests",
          status: "completed",
          conclusion: "failure",
          url: "https://github.com/owner/repo/actions/runs/100",
          branch: "feature/evidence",
          commit_sha: "abcdef123456",
          observed_at: "2026-06-07T08:01:00Z",
          summary: "Unit tests failed.",
          evidence_refs: ["event:ci.evidence_observed:event-ci"],
        },
        {
          kind: "pull_request",
          evidence_id: "event-pr",
          provider: "github",
          repository: "owner/repo",
          title: "Add operator evidence",
          status: "open",
          conclusion: null,
          url: "https://github.com/owner/repo/pull/42",
          branch: "feature/evidence",
          commit_sha: "abcdef123456",
          observed_at: "2026-06-07T08:00:00Z",
          summary: "Review is waiting on CI.",
          evidence_refs: ["event:pr.evidence_observed:event-pr"],
        },
      ],
      privacy: {
        external_fetch_performed: false,
        auth_tokens_exposed: false,
        raw_logs_exposed: false,
        redaction: "task detail reads append-only PR/CI evidence events",
      },
    },
  });

  assert.equal(listParsed.count, 1);
  assert.equal(listParsed.tasks[0].task_id, "otask-1");
  assert.equal(detailParsed.task.owner_agent_id, "sample-agent");
  assert.equal(detailParsed.task.acceptance_json[0], "task exists");
  const detailView = toOperatorTaskDetail(detailParsed);
  assert.equal(detailView.linkedRunId, "run-1");
  assert.equal(detailView.linkedIterationId, "iter-1");
  assert.equal(detailView.linkedRoomIds[0], "room-1");
  assert.equal(detailView.archivedAt, null);
  assert.equal(detailView.archivedBy, null);
  assert.equal(detailView.archiveNote, null);
  assert.equal(detailView.prCiEvidence.posture, "danger");
  assert.equal(detailView.prCiEvidence.metrics[0].value, "1");
  assert.equal(detailView.prCiEvidence.items[0].statusLabel, "completed / failure");
  assert.equal(detailView.prCiEvidence.items[0].url, "https://github.com/owner/repo/actions/runs/100");
});

test("parseOperatorTaskDeleteResponse validates the delete payload shape", () => {
  const parsed = parseOperatorTaskDeleteResponse({
    deleted_task_id: "otask-1",
  });

  assert.equal(parsed.deleted_task_id, "otask-1");
});

test("parseOperatorTaskReconcilePreviewResponse validates task preview shape", () => {
  const parsed = parseOperatorTaskReconcilePreviewResponse({
    generated_at: "2026-06-07T00:00:00Z",
    decision_id: "reconcile-test",
    task_id: "otask-1",
    current_status: "todo",
    recommended_status: "blocked",
    confidence: "high",
    summary: "Reconciler recommends blocking the task until linked evidence is cleared.",
    requires_approval: true,
    blockers: ["linked run run-1 has pending approvals"],
    suggested_actions: ["clear linked run approvals before resuming this task"],
    evidence_refs: ["operator_task:otask-1", "approval:approval-1"],
  });
  const view = toOperatorTaskReconcilePreview(parsed);

  assert.equal(parsed.recommended_status, "blocked");
  assert.equal(parsed.decision_id, "reconcile-test");
  assert.equal(view.tone, "danger");
  assert.equal(view.decisionId, "reconcile-test");
  assert.equal(view.requiresApproval, true);
  assert.equal(view.evidenceRefs.length, 2);
});

test("parseOperatorWorkspacesResponse and parseOperatorWorkspaceDetailResponse validate the owned workspace shape", () => {
  const listParsed = parseOperatorWorkspacesResponse({
    count: 1,
    workspaces: [
      {
        workspace_id: "owork-1",
        label: "Dashboard repo",
        path: "packages/dashboard",
        kind: "repo",
        status: "active",
        owner_agent_id: "sample-agent",
        linked_run_id: "run-1",
        linked_iteration_id: "iter-1",
        task_ids_json: ["otask-1"],
        notes: "Primary frontend workspace.",
        archived_at: null,
        archived_by: null,
        archive_note: null,
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T00:00:00Z",
      },
    ],
  });
  const detailParsed = parseOperatorWorkspaceDetailResponse({
    workspace: {
      workspace_id: "owork-1",
      label: "Dashboard repo",
      path: "packages/dashboard",
      kind: "repo",
      status: "active",
      owner_agent_id: "sample-agent",
      linked_run_id: "run-1",
      linked_iteration_id: "iter-1",
      task_ids_json: ["otask-1"],
      notes: "Primary frontend workspace.",
      archived_at: null,
      archived_by: null,
      archive_note: null,
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z",
    },
  });

  assert.equal(listParsed.count, 1);
  assert.equal(listParsed.workspaces[0].workspace_id, "owork-1");
  assert.equal(detailParsed.workspace.path, "packages/dashboard");
  assert.equal(detailParsed.workspace.task_ids_json[0], "otask-1");
});

test("workspace quick archive stays gated on rationale and mutation bodies only carry archive note when archiving", () => {
  const draft = {
    label: "Dashboard repo",
    path: "packages/dashboard",
    kind: "repo",
    status: "active",
    archiveNote: "",
    ownerAgentId: "",
    linkedRunId: "",
    linkedIterationId: "",
    taskIds: "otask-1, otask-2",
    notes: "",
  };

  const gatedActions = getOperatorWorkspaceQuickStatusActions("active", draft);
  const gatedArchive = gatedActions.find((action) => action.status === "archived");
  assert.equal(gatedArchive?.disabled, true);
  assert.match(gatedArchive?.reason ?? "", /archive rationale/i);

  const archivableDraft = { ...draft, archiveNote: "Freeze after delivery." };
  const enabledArchive = getOperatorWorkspaceQuickStatusActions("active", archivableDraft).find(
    (action) => action.status === "archived",
  );
  assert.equal(enabledArchive?.disabled, false);
  assert.equal(enabledArchive?.reason, null);

  const activeBody = buildOperatorWorkspaceMutationBody(archivableDraft);
  assert.equal(Object.hasOwn(activeBody, "archive_note"), false);
  assert.deepEqual(activeBody.task_ids_json, ["otask-1", "otask-2"]);

  const archivedBody = buildOperatorWorkspaceMutationBody(archivableDraft, "archived");
  assert.equal(archivedBody.archive_note, "Freeze after delivery.");
});

test("task quick status body is based on persisted task state, not unsaved editor draft", () => {
  const draftBody = buildOperatorTaskDraftMutationBody({
    title: "Unsaved title",
    objective: "Unsaved objective",
    status: "todo",
    priority: "critical",
    ownerAgentId: "draft-owner",
    linkedRunId: "draft-run",
    linkedIterationId: "draft-iter",
    linkedRoomIds: "draft-room",
    blockedReason: "draft block",
    acceptance: "draft acceptance",
    workspaceRef: "draft-workspace",
  });
  const quickStatusBody = buildOperatorTaskStatusMutationBody({
    task_id: "otask-1",
    title: "Persisted title",
    objective: "Persisted objective",
    status: "todo",
    priority: "medium",
    owner_agent_id: "persisted-owner",
    linked_run_id: "persisted-run",
    linked_iteration_id: "persisted-iter",
    linked_room_ids_json: ["persisted-room"],
    blocked_reason: "persisted block",
    acceptance_json: ["persisted acceptance"],
    workspace_ref: "persisted-workspace",
    archived_at: null,
    archived_by: null,
    archive_note: null,
    created_at: "2026-04-05T00:00:00Z",
    updated_at: "2026-04-05T00:00:00Z",
  }, "in_progress");

  assert.equal(draftBody.title, "Unsaved title");
  assert.equal(quickStatusBody.title, "Persisted title");
  assert.equal(quickStatusBody.objective, "Persisted objective");
  assert.equal(quickStatusBody.status, "in_progress");
  assert.equal(quickStatusBody.priority, "medium");
  assert.deepEqual(quickStatusBody.linked_room_ids, ["persisted-room"]);
  assert.deepEqual(quickStatusBody.acceptance_json, ["persisted acceptance"]);
});

test("task filter storage helpers persist current filter state and presets", () => {
  const originalWindow = globalThis.window;
  const storage = new Map();
  globalThis.window = {
    location: { search: "", pathname: "/", hash: "" },
    history: { replaceState() {} },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
  };

  try {
    persistTaskFilterState({
      status: "blocked",
      ownerAgentId: "validator",
      includeArchived: true,
    });
    persistSavedTaskFilterPresets([
      {
        id: "preset-1",
        name: "Blocked queue",
        status: "blocked",
        ownerAgentId: "validator",
        includeArchived: true,
      },
    ]);

    const current = readInitialTaskFilterState();
    const presets = readSavedTaskFilterPresets();

    assert.equal(current.status, "blocked");
    assert.equal(current.ownerAgentId, "validator");
    assert.equal(current.includeArchived, true);
    assert.equal(presets.length, 1);
    assert.equal(presets[0].name, "Blocked queue");
    assert.equal(presets[0].includeArchived, true);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("parseRunDetailResponse validates the BE-1a detail shape", () => {
  const parsed = parseRunDetailResponse({
    run: {
      run_id: "run-1",
      status: "active",
      user_request: "Ship bridge",
      created_at: "2026-04-02T00:00:00Z",
      updated_at: "2026-04-02T00:01:00Z",
      current_iteration: 1,
      stop_reason: null,
    },
    iterations: [
      {
        iteration_id: "iter-1",
        status: "running",
        objective: "Do the thing",
        seq_no: 1,
      },
    ],
    latest_iteration: {
      iteration_id: "iter-1",
      status: "running",
      objective: "Do the thing",
      seq_no: 1,
    },
    task_plan: {
      current_plan: "Bridge plan",
      objective: "Do the thing",
      owner: "sample-agent",
      steps_json: [{ title: "step-1" }],
      acceptance_json: ["ship it"],
    },
    counts: {
      iterations: 1,
      validator_results: 2,
      approvals: 1,
      rooms: 1,
      messages: 4,
      tool_events: 2,
      insights: 1,
      handoff_packets: 0,
    },
  });

  assert.equal(parsed.run.run_id, "run-1");
  assert.equal(parsed.task_plan?.acceptance_json[0], "ship it");
});

test("forward route round-trips between hash and route object", () => {
  const ids = { runId: null, taskId: null, workspaceId: null, threadId: null, agentId: null };
  assert.deepEqual(parseForwardRoute("#/overview"), { screen: "overview", ...ids });
  assert.deepEqual(parseForwardRoute("#/inbox"), { screen: "inbox", ...ids });
  assert.deepEqual(parseForwardRoute("#/tasks"), { screen: "tasks", ...ids });
  assert.deepEqual(parseForwardRoute("#/tasks/otask-1"), { screen: "task-detail", ...ids, taskId: "otask-1" });
  assert.deepEqual(parseForwardRoute("#/workspaces"), { screen: "workspaces", ...ids });
  assert.deepEqual(parseForwardRoute("#/workspaces/owork-1"), { screen: "workspace-detail", ...ids, workspaceId: "owork-1" });
  assert.deepEqual(parseForwardRoute("#/runs"), { screen: "runs", ...ids });
  assert.deepEqual(parseForwardRoute("#/runs/run-1"), { screen: "run-detail", ...ids, runId: "run-1" });
  assert.deepEqual(parseForwardRoute("#/office-preview"), { screen: "office-preview", ...ids });
  assert.deepEqual(parseForwardRoute("#/threads/thread-1"), { screen: "thread-detail", ...ids, threadId: "thread-1" });
  assert.deepEqual(parseForwardRoute("#/agents?agent=architect"), { screen: "agents", ...ids, agentId: "architect" });
  assert.deepEqual(parseForwardRoute("#/agents/agent-1"), { screen: "agent-detail", ...ids, agentId: "agent-1" });
  assert.deepEqual(parseForwardRoute("#/approvals"), { screen: "approvals", ...ids });
  assert.equal(buildForwardRoute({ screen: "overview", ...ids }), "#/overview");
  assert.equal(buildForwardRoute({ screen: "inbox", ...ids }), "#/inbox");
  assert.equal(buildForwardRoute({ screen: "tasks", ...ids }), "#/tasks");
  assert.equal(buildForwardRoute({ screen: "task-detail", ...ids, taskId: "otask-1" }), "#/tasks/otask-1");
  assert.equal(buildForwardRoute({ screen: "workspaces", ...ids }), "#/workspaces");
  assert.equal(buildForwardRoute({ screen: "workspace-detail", ...ids, workspaceId: "owork-1" }), "#/workspaces/owork-1");
  assert.equal(buildForwardRoute({ screen: "run-detail", ...ids, runId: "run-1" }), "#/runs/run-1");
  assert.equal(buildForwardRoute({ screen: "office-preview", ...ids }), "#/office-preview");
  assert.equal(buildForwardRoute({ screen: "thread-detail", ...ids, threadId: "thread-1" }), "#/threads/thread-1");
  assert.equal(buildForwardRoute({ screen: "agents", ...ids, agentId: "architect" }), "#/agents?agent=architect");
  assert.equal(buildForwardRoute({ screen: "agent-detail", ...ids, agentId: "agent-1" }), "#/agents/agent-1");
  assert.equal(buildForwardRoute({ screen: "approvals", ...ids }), "#/approvals");
});

test("forward view models stay compact and UI-shaped", () => {
  const item = toRunListItemViewModel({
    run_id: "run-1",
    status: "active",
    user_request: "Ship bridge",
    created_at: "2026-04-02T00:00:00Z",
    updated_at: "2026-04-02T00:01:00Z",
    latest_iteration_id: "iter-1",
    latest_iteration_status: "running",
    counts: {
      iterations: 1,
      validator_results: 2,
      approvals: 1,
      rooms: 1,
      messages: 4,
      tool_events: 2,
      insights: 1,
      handoff_packets: 0,
    },
  });
  const detail = toRunDetailViewModel(
    parseRunDetailResponse({
      run: {
        run_id: "run-1",
        status: "active",
        user_request: "Ship bridge",
        created_at: "2026-04-02T00:00:00Z",
        updated_at: "2026-04-02T00:01:00Z",
        current_iteration: 1,
        stop_reason: null,
      },
      iterations: [],
      latest_iteration: null,
      task_plan: {
        current_plan: "Bridge plan",
        objective: "Do the thing",
        owner: "sample-agent",
        steps_json: [],
        acceptance_json: ["ship it"],
      },
      counts: {
        iterations: 1,
        validator_results: 2,
        approvals: 1,
        rooms: 1,
        messages: 4,
        tool_events: 2,
        insights: 1,
        handoff_packets: 0,
      },
    }),
  );

  assert.equal(item.runId, "run-1");
  assert.equal(item.metrics.length, 3);
  assert.equal(detail.acceptance[0], "ship it");
  assert.equal(detail.stats[0].label, "Iterations");
});

test("parseReplayResponse validates the replay timeline shape", () => {
  const parsed = parseReplayResponse({
    run: {
      run_id: "run-1",
      status: "active",
      user_request: "Ship bridge",
    },
    timeline: [
      {
        kind: "room",
        timestamp: "2026-04-02T00:00:00Z",
        summary: "review-room",
        payload: {
          room_id: "room-1",
          name: "review-room",
        },
      },
      {
        kind: "validator",
        timestamp: "2026-04-02T00:01:00Z",
        summary: "validator ok",
        payload: {},
      },
    ],
    approvals: [],
    insights: [],
    validator_history: [],
    handoff_packets: [],
  });

  assert.equal(parsed.timeline.length, 2);
  assert.equal(extractRoomOptions(parsed)[0].roomId, "room-1");
});

test("parseStateDocsResponse validates projected markdown payloads", () => {
  const parsed = parseStateDocsResponse({
    run_id: "run-1",
    documents: {
      task_plan: { path: ".conitens/context/task_plan.md", content: "plan" },
      findings: { path: ".conitens/context/findings.md", content: "findings" },
      progress: { path: ".conitens/context/progress.md", content: "progress" },
      latest_context: { path: ".conitens/context/LATEST_CONTEXT.md", content: "latest" },
    },
  });

  assert.equal(parsed.documents.findings.content, "findings");
  assert.equal(parsed.documents.latest_context.path, ".conitens/context/LATEST_CONTEXT.md");
});

test("parseContextLatestResponse preserves runtime and repo digests separately", () => {
  const parsed = parseContextLatestResponse({
    run_id: "run-1",
    runtime_latest: { path: ".conitens/context/LATEST_CONTEXT.md", content: "runtime" },
    repo_latest: { path: ".vibe/context/LATEST_CONTEXT.md", content: "repo" },
  });

  assert.equal(parsed.runtime_latest.content, "runtime");
  assert.equal(parsed.repo_latest?.content, "repo");
});

test("parseRoomTimelineResponse validates room timeline payloads", () => {
  const parsed = parseRoomTimelineResponse({
    room: {
      room_id: "room-1",
      name: "review-room",
      room_type: "review",
      status: "active",
      run_id: "run-1",
      iteration_id: "iter-1",
    },
    timeline: [
      {
        kind: "message",
        timestamp: "2026-04-02T00:00:00Z",
        summary: "hello",
        payload: {},
      },
    ],
    messages: [],
    tool_events: [],
    insights: [],
  });

  assert.equal(parsed.room.room_type, "review");
  assert.equal(parsed.timeline[0].kind, "message");
});

test("parseApprovalsResponse validates approval list payloads", () => {
  const parsed = parseApprovalsResponse({
    approvals: [
      {
        request_id: "approval-1",
        run_id: "run-1",
        iteration_id: "iter-1",
        task_id: "otask-1",
        actor: "sample-agent",
        action_type: "shell_execution",
        action_payload: { command: "echo hi" },
        risk_level: "high",
        status: "pending",
        reviewer: null,
        reviewer_note: null,
        created_at: "2026-04-02T00:00:00Z",
        updated_at: "2026-04-02T00:00:00Z",
      },
    ],
  });

  assert.equal(parsed.approvals[0].status, "pending");
  assert.equal(parsed.approvals[0].action_type, "shell_execution");
  assert.equal(parsed.approvals[0].task_id, "otask-1");
});

test("parseApprovalDetailResponse and parseApprovalResumeResponse validate mutation payloads", () => {
  const detail = parseApprovalDetailResponse({
    approval: {
      request_id: "approval-1",
      run_id: "run-1",
      iteration_id: "iter-1",
      actor: "sample-agent",
      action_type: "shell_execution",
      action_payload: { command: "echo hi" },
      risk_level: "high",
      status: "approved",
      reviewer: "owner",
      reviewer_note: "ok",
      created_at: "2026-04-02T00:00:00Z",
      updated_at: "2026-04-02T00:01:00Z",
    },
  });
  const resumed = parseApprovalResumeResponse({
    approval: detail.approval,
    state: {
      run_id: "run-1",
      current_step: "completed",
      stop_reason: null,
      approval_pending: false,
    },
  });

  assert.equal(detail.approval.reviewer, "owner");
  assert.equal(resumed.state.current_step, "completed");
});

test("parseStreamSnapshot validates live snapshot payloads", () => {
  const parsed = parseStreamSnapshot({
    generated_at: 123,
    run_id: "run-1",
    room_id: "room-1",
    pending_approvals: [],
    latest_run_event: { kind: "message" },
    latest_room_event: { kind: "room" },
  });

  assert.equal(parsed.run_id, "run-1");
  assert.equal(parsed.room_id, "room-1");
  assert.equal(parsed.generated_at, 123);
  assert.equal(parsed.latest_run_event?.kind, "message");
});

test("parseForwardEventStreamChunk parses snapshot and heartbeat frames", () => {
  const parsed = parseForwardEventStreamChunk(
    "event: snapshot\nid: 1\ndata: {\"ok\":true}\n\nevent: heartbeat\ndata: {\"ts\":1}\n\n",
  );

  assert.equal(parsed.remainder, "");
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.events[0].event, "snapshot");
  assert.equal(parsed.events[0].id, "1");
  assert.equal(parsed.events[0].data, "{\"ok\":true}");
  assert.equal(parsed.events[1].event, "heartbeat");
});

test("pickInitialApprovalId prefers pending approvals first", () => {
  assert.equal(
    pickInitialApprovalId([
      {
        request_id: "approval-1",
        run_id: "run-1",
        iteration_id: "iter-1",
        actor: "sample-agent",
        action_type: "shell_execution",
        action_payload: {},
        risk_level: "high",
        status: "approved",
        reviewer: "owner",
        reviewer_note: "ok",
        created_at: "2026-04-02T00:00:00Z",
        updated_at: "2026-04-02T00:01:00Z",
      },
      {
        request_id: "approval-2",
        run_id: "run-1",
        iteration_id: "iter-1",
        actor: "sample-agent",
        action_type: "network_access",
        action_payload: {},
        risk_level: "medium",
        status: "pending",
        reviewer: null,
        reviewer_note: null,
        created_at: "2026-04-02T00:02:00Z",
        updated_at: "2026-04-02T00:02:00Z",
      },
    ]),
    "approval-2",
  );
});

test("pickNextApprovalId resets stale selection when the current id is absent", () => {
  assert.equal(
    pickNextApprovalId("missing", [
      {
        request_id: "approval-2",
        run_id: "run-1",
        iteration_id: "iter-1",
        actor: "sample-agent",
        action_type: "network_access",
        action_payload: {},
        risk_level: "medium",
        status: "pending",
        reviewer: null,
        reviewer_note: null,
        created_at: "2026-04-02T00:02:00Z",
        updated_at: "2026-04-02T00:02:00Z",
      },
    ]),
    "approval-2",
  );
});

test("pickNextRoomId preserves the current room when it still exists", () => {
  assert.equal(
    pickNextRoomId("room-2", [
      { roomId: "room-1", label: "review" },
      { roomId: "room-2", label: "debate" },
    ]),
    "room-2",
  );
});

test("pickNextRoomId falls back to the first room when the current room is stale", () => {
  assert.equal(
    pickNextRoomId("missing-room", [
      { roomId: "room-1", label: "review" },
      { roomId: "room-2", label: "debate" },
    ]),
    "room-1",
  );
  assert.equal(pickNextRoomId(null, []), null);
});

test("FE-7 insight helpers merge run and room insights and preserve summaries", () => {
  const cards = toInsightCardViewModels(
    {
      run: { run_id: "run-1", status: "active", user_request: "Ship insight" },
      timeline: [],
      approvals: [],
      insights: [
        {
          id: 1,
          kind: "decision",
          summary: "Ship replay first",
          created_at: "2026-04-02T00:00:00Z",
          evidence_refs_json: ["msg-1"],
        },
      ],
      validator_history: [{ feedback_text: "validator says ok" }],
      handoff_packets: [],
    },
    {
      room: {
        room_id: "room-1",
        name: "review-room",
        room_type: "review",
        status: "active",
        run_id: "run-1",
        iteration_id: "iter-1",
      },
      timeline: [],
      messages: [],
      tool_events: [],
      insights: [
        {
          id: 2,
          kind: "risk",
          summary: "Approval flow can block deploy",
          created_at: "2026-04-02T00:01:00Z",
          evidence_refs_json: [],
        },
      ],
    },
  );

  assert.equal(cards.length, 2);
  assert.equal(cards[0].scope, "room");
  assert.equal(cards[1].scope, "run");
  assert.equal(summarizeValidatorCorrelations({ run: { run_id: "run-1", status: "active", user_request: "x" }, timeline: [], approvals: [], insights: [], validator_history: [{ feedback_text: "validator says ok" }], handoff_packets: [] })[0], "validator says ok");
  assert.equal(
    summarizeFindingsDocument({
      run_id: "run-1",
      documents: {
        task_plan: { path: "task", content: "" },
        findings: { path: "findings", content: "important finding" },
        progress: { path: "progress", content: "" },
        latest_context: { path: "latest", content: "" },
      },
    }),
    "important finding",
  );
});
