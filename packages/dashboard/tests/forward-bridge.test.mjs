import test from "node:test";
import assert from "node:assert/strict";
import {
  parseApprovalDetailResponse,
  parseApprovalResumeResponse,
  parseApprovalsResponse,
  parseContextLatestResponse,
  parseForwardEventStreamChunk,
  parseReplayResponse,
  parseRoomTimelineResponse,
  parseRunDetailResponse,
  parseRunsResponse,
  parseStateDocsResponse,
  parseStreamSnapshot,
} from "../src/forward-bridge.ts";
import { buildForwardRoute, parseForwardRoute } from "../src/forward-route.ts";
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
  assert.deepEqual(parseForwardRoute("#/runs"), { screen: "runs", runId: null });
  assert.deepEqual(parseForwardRoute("#/runs/run-1"), { screen: "run-detail", runId: "run-1" });
  assert.deepEqual(parseForwardRoute("#/office-preview"), { screen: "office-preview", runId: null });
  assert.equal(buildForwardRoute({ screen: "run-detail", runId: "run-1" }), "#/runs/run-1");
  assert.equal(buildForwardRoute({ screen: "office-preview", runId: null }), "#/office-preview");
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
