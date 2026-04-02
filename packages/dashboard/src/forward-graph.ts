import type {
  ForwardReplayResponse,
  ForwardRoomTimelineResponse,
  ForwardRunDetailResponse,
} from "./forward-bridge.js";

export interface ForwardGraphNode {
  id: string;
  label: string;
  kind: "run" | "plan" | "iteration" | "validator" | "approval" | "room" | "insight";
  column: number;
  row: number;
}

export interface ForwardGraphEdge {
  from: string;
  to: string;
}

export interface ForwardGraphModel {
  nodes: ForwardGraphNode[];
  edges: ForwardGraphEdge[];
  summary: string[];
}

export function deriveForwardGraphModel(
  detail: ForwardRunDetailResponse,
  replay: ForwardReplayResponse,
  roomTimeline: ForwardRoomTimelineResponse | null,
): ForwardGraphModel {
  const nodes: ForwardGraphNode[] = [];
  const edges: ForwardGraphEdge[] = [];
  const summary: string[] = [];

  nodes.push({
    id: `run:${detail.run.run_id}`,
    label: detail.run.run_id,
    kind: "run",
    column: 0,
    row: 0,
  });

  if (detail.task_plan) {
    nodes.push({
      id: `plan:${detail.run.run_id}`,
      label: detail.task_plan.current_plan,
      kind: "plan",
      column: 1,
      row: 0,
    });
    edges.push({ from: `run:${detail.run.run_id}`, to: `plan:${detail.run.run_id}` });
    summary.push(`Plan available: ${detail.task_plan.current_plan}`);
  }

  detail.iterations.forEach((iteration, index) => {
    nodes.push({
      id: `iteration:${iteration.iteration_id}`,
      label: iteration.objective,
      kind: "iteration",
      column: 1,
      row: index + 1,
    });
    edges.push({ from: `run:${detail.run.run_id}`, to: `iteration:${iteration.iteration_id}` });
  });

  if (replay.validator_history.length > 0 && detail.latest_iteration) {
    nodes.push({
      id: `validator:${detail.run.run_id}`,
      label: `${replay.validator_history.length} validator result(s)`,
      kind: "validator",
      column: 2,
      row: 0,
    });
    edges.push({ from: `iteration:${detail.latest_iteration.iteration_id}`, to: `validator:${detail.run.run_id}` });
    summary.push(`Validator results: ${replay.validator_history.length}`);
  }

  if (replay.approvals.length > 0 && detail.latest_iteration) {
    nodes.push({
      id: `approval:${detail.run.run_id}`,
      label: `${replay.approvals.length} approval(s)`,
      kind: "approval",
      column: 2,
      row: 1,
    });
    edges.push({ from: `iteration:${detail.latest_iteration.iteration_id}`, to: `approval:${detail.run.run_id}` });
    summary.push(`Approvals: ${replay.approvals.length}`);
  }

  const roomEntries = replay.timeline.filter((item) => item.kind === "room");
  roomEntries.forEach((entry, index) => {
    const roomId = typeof entry.payload.room_id === "string" ? entry.payload.room_id : `room-${index}`;
    const roomLabel = typeof entry.payload.name === "string" ? entry.payload.name : entry.summary;
    nodes.push({
      id: `room:${roomId}`,
      label: roomLabel,
      kind: "room",
      column: 3,
      row: index,
    });
    edges.push({ from: `run:${detail.run.run_id}`, to: `room:${roomId}` });
  });
  if (roomEntries.length > 0) {
    summary.push(`Rooms: ${roomEntries.length}`);
  }

  const insightCount = replay.insights.length + (roomTimeline?.insights.length || 0);
  if (insightCount > 0) {
    nodes.push({
      id: `insight:${detail.run.run_id}`,
      label: `${insightCount} insight(s)`,
      kind: "insight",
      column: 4,
      row: 0,
    });
    edges.push({ from: `run:${detail.run.run_id}`, to: `insight:${detail.run.run_id}` });
    summary.push(`Insights: ${insightCount}`);
  }

  if (nodes.length <= 1 || edges.length === 0) {
    return {
      nodes,
      edges,
      summary: summary.length > 0 ? summary : ["No structured graph data surfaced yet."],
    };
  }

  return { nodes, edges, summary };
}
