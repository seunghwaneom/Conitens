import test from "node:test";
import assert from "node:assert/strict";
import { deriveForwardGraphModel } from "../src/forward-graph.ts";

test("deriveForwardGraphModel builds graph nodes and edges from detail and replay", () => {
  const model = deriveForwardGraphModel(
    {
      run: {
        run_id: "run-1",
        status: "active",
        user_request: "Ship graph",
        created_at: "2026-04-02T00:00:00Z",
        updated_at: "2026-04-02T00:01:00Z",
        current_iteration: 1,
        stop_reason: null,
      },
      iterations: [
        { iteration_id: "iter-1", status: "running", objective: "Bridge state", seq_no: 1 },
      ],
      latest_iteration: { iteration_id: "iter-1", status: "running", objective: "Bridge state", seq_no: 1 },
      task_plan: {
        current_plan: "Forward graph",
        objective: "Bridge state",
        owner: "sample-agent",
        steps_json: [],
        acceptance_json: [],
      },
      counts: {
        iterations: 1,
        validator_results: 1,
        approvals: 1,
        rooms: 1,
        messages: 1,
        tool_events: 0,
        insights: 1,
        handoff_packets: 0,
      },
    },
    {
      run: { run_id: "run-1", status: "active", user_request: "Ship graph" },
      timeline: [
        {
          kind: "room",
          timestamp: "2026-04-02T00:00:00Z",
          summary: "review-room",
          payload: { room_id: "room-1", name: "review-room" },
        },
      ],
      approvals: [{}],
      insights: [{}],
      validator_history: [{}],
      handoff_packets: [],
    },
    null,
  );

  assert.ok(model.nodes.some((node) => node.kind === "run"));
  assert.ok(model.nodes.some((node) => node.kind === "iteration"));
  assert.ok(model.nodes.some((node) => node.kind === "validator"));
  assert.ok(model.nodes.some((node) => node.kind === "approval"));
  assert.ok(model.nodes.some((node) => node.kind === "room"));
  assert.ok(model.nodes.some((node) => node.kind === "insight"));
  assert.ok(model.edges.length > 0);
});

test("deriveForwardGraphModel falls back to summary when structure is too sparse", () => {
  const model = deriveForwardGraphModel(
    {
      run: {
        run_id: "run-1",
        status: "active",
        user_request: "Sparse graph",
        created_at: "2026-04-02T00:00:00Z",
        updated_at: "2026-04-02T00:01:00Z",
        current_iteration: 0,
        stop_reason: null,
      },
      iterations: [],
      latest_iteration: null,
      task_plan: null,
      counts: {
        iterations: 0,
        validator_results: 0,
        approvals: 0,
        rooms: 0,
        messages: 0,
        tool_events: 0,
        insights: 0,
        handoff_packets: 0,
      },
    },
    {
      run: { run_id: "run-1", status: "active", user_request: "Sparse graph" },
      timeline: [],
      approvals: [],
      insights: [],
      validator_history: [],
      handoff_packets: [],
    },
    null,
  );

  assert.equal(model.edges.length, 0);
  assert.ok(model.summary.length >= 1);
});
