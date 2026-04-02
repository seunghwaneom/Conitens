import type {
  ForwardApprovalRecord,
  ForwardReplayResponse,
  ForwardRoomTimelineResponse,
  ForwardRunDetailResponse,
  ForwardRunSummary,
  ForwardStateDocsResponse,
} from "./forward-bridge.js";

export interface RunListItemViewModel {
  runId: string;
  title: string;
  status: string;
  subtitle: string;
  metrics: string[];
}

export interface RunDetailViewModel {
  runId: string;
  title: string;
  status: string;
  latestIteration: string;
  objective: string;
  acceptance: string[];
  stats: Array<{ label: string; value: string }>;
}

export interface RoomOptionViewModel {
  roomId: string;
  label: string;
}

export interface InsightCardViewModel {
  id: string;
  kind: string;
  scope: "run" | "room";
  summary: string;
  timestamp: string;
  evidenceCount: number;
  rawJson: string;
}

export function pickInitialApprovalId(approvals: ForwardApprovalRecord[]): string | null {
  if (approvals.length === 0) {
    return null;
  }
  const pending = approvals.find((item) => item.status === "pending");
  return pending?.request_id || approvals[0].request_id;
}

export function pickNextApprovalId(
  currentId: string | null,
  approvals: ForwardApprovalRecord[],
): string | null {
  if (currentId && approvals.some((item) => item.request_id === currentId)) {
    return currentId;
  }
  return pickInitialApprovalId(approvals);
}

export function pickNextRoomId(
  currentId: string | null,
  rooms: RoomOptionViewModel[],
): string | null {
  if (currentId && rooms.some((item) => item.roomId === currentId)) {
    return currentId;
  }
  return rooms[0]?.roomId ?? null;
}

export function toInsightCardViewModels(
  replay: ForwardReplayResponse | null,
  roomTimeline: ForwardRoomTimelineResponse | null,
): InsightCardViewModel[] {
  const cards = new Map<string, InsightCardViewModel>();

  function ingest(items: Array<Record<string, unknown>>, scope: "run" | "room") {
    for (const item of items) {
      const id = typeof item.id === "number" ? String(item.id) : typeof item.id === "string" ? item.id : null;
      const kind = typeof item.kind === "string" ? item.kind : "insight";
      const summary = typeof item.summary === "string" ? item.summary : JSON.stringify(item);
      const timestamp =
        typeof item.created_at === "string"
          ? item.created_at
          : typeof item.timestamp === "string"
            ? item.timestamp
            : "unknown";
      const evidenceRefs = Array.isArray(item.evidence_refs_json)
        ? item.evidence_refs_json
        : Array.isArray(item.evidence_refs)
          ? item.evidence_refs
          : [];
      const key = id || `${scope}:${kind}:${summary}`;
      if (cards.has(key)) {
        continue;
      }
      cards.set(key, {
        id: key,
        kind,
        scope,
        summary,
        timestamp,
        evidenceCount: evidenceRefs.length,
        rawJson: JSON.stringify(item, null, 2),
      });
    }
  }

  ingest(replay?.insights || [], "run");
  ingest(roomTimeline?.insights || [], "room");

  return [...cards.values()].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function summarizeFindingsDocument(stateDocs: ForwardStateDocsResponse | null): string {
  return stateDocs?.documents.findings.content || "";
}

export function summarizeValidatorCorrelations(replay: ForwardReplayResponse | null): string[] {
  return (replay?.validator_history || [])
    .map((item) => (typeof item.feedback_text === "string" ? item.feedback_text : null))
    .filter((item): item is string => Boolean(item))
    .slice(-3);
}

export function toRunListItemViewModel(run: ForwardRunSummary): RunListItemViewModel {
  return {
    runId: run.run_id,
    title: run.user_request,
    status: run.status,
    subtitle: run.latest_iteration_id
      ? `${run.latest_iteration_id} | ${run.latest_iteration_status ?? "unknown"}`
      : "No iterations yet",
    metrics: [
      `${run.counts.iterations} iterations`,
      `${run.counts.validator_results} validations`,
      `${run.counts.approvals} approvals`,
    ],
  };
}

export function toRunDetailViewModel(detail: ForwardRunDetailResponse): RunDetailViewModel {
  return {
    runId: detail.run.run_id,
    title: detail.run.user_request,
    status: detail.run.status,
    latestIteration: detail.latest_iteration
      ? `${detail.latest_iteration.iteration_id} | ${detail.latest_iteration.status}`
      : "No iterations yet",
    objective: detail.task_plan?.objective || detail.run.user_request,
    acceptance: detail.task_plan?.acceptance_json || [],
    stats: [
      { label: "Iterations", value: String(detail.counts.iterations) },
      { label: "Validator", value: String(detail.counts.validator_results) },
      { label: "Approvals", value: String(detail.counts.approvals) },
      { label: "Rooms", value: String(detail.counts.rooms) },
      { label: "Insights", value: String(detail.counts.insights) },
    ],
  };
}

export function extractRoomOptions(replay: ForwardReplayResponse): RoomOptionViewModel[] {
  const seen = new Map<string, RoomOptionViewModel>();
  for (const item of replay.timeline) {
    if (item.kind !== "room") {
      continue;
    }
    const roomId = typeof item.payload.room_id === "string" ? item.payload.room_id : null;
    if (!roomId || seen.has(roomId)) {
      continue;
    }
    const name = typeof item.payload.name === "string" ? item.payload.name : item.summary;
    seen.set(roomId, { roomId, label: name });
  }
  return [...seen.values()];
}
