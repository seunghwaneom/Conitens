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

function asApprovalStatus(value: unknown, field: string): "pending" | "approved" | "edited" | "rejected" {
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

function normalizeApiRoot(apiRoot: string): string {
  return apiRoot.replace(/\/+$/, "");
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

export async function forwardGet<T>(
  config: ForwardBridgeConfig,
  path: string,
  parser: (payload: unknown) => T,
): Promise<T> {
  const response = await fetch(`${normalizeApiRoot(config.apiRoot)}${path}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return parser(await response.json());
}

export async function forwardPost<T>(
  config: ForwardBridgeConfig,
  path: string,
  body: Record<string, unknown>,
  parser: (payload: unknown) => T,
): Promise<T> {
  const response = await fetch(`${normalizeApiRoot(config.apiRoot)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return parser(await response.json());
}

export async function forwardListApprovals(
  config: ForwardBridgeConfig,
  filters: { runId?: string; iterationId?: string; status?: string } = {},
) {
  const search = new URLSearchParams();
  if (filters.runId) search.set("run_id", filters.runId);
  if (filters.iterationId) search.set("iteration_id", filters.iterationId);
  if (filters.status) search.set("status", filters.status);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return forwardGet(config, `/approvals${suffix}`, parseApprovalsResponse);
}

export async function forwardGetApproval(config: ForwardBridgeConfig, requestId: string) {
  return forwardGet(config, `/approvals/${encodeURIComponent(requestId)}`, parseApprovalDetailResponse);
}

export async function forwardDecideApproval(
  config: ForwardBridgeConfig,
  requestId: string,
  payload: { status: "approved" | "edited" | "rejected"; reviewer_note: string; edited_payload?: Record<string, unknown> },
) {
  return forwardPost(config, `/approvals/${encodeURIComponent(requestId)}/decision`, payload, parseApprovalDetailResponse);
}

export async function forwardResumeApproval(config: ForwardBridgeConfig, requestId: string) {
  return forwardPost(config, `/approvals/${encodeURIComponent(requestId)}/resume`, {}, parseApprovalResumeResponse);
}

export async function openForwardEventStream(
  config: ForwardBridgeConfig,
  filters: { runId?: string; roomId?: string } = {},
  handlers: {
    onMessage?: (message: ForwardStreamEventMessage) => void;
    onOpen?: () => void;
    onError?: (error: unknown) => void;
    onClose?: () => void;
  } = {},
): Promise<ForwardEventStreamHandle> {
  const search = new URLSearchParams();
  if (filters.runId) search.set("run_id", filters.runId);
  if (filters.roomId) search.set("room_id", filters.roomId);
  const controller = new AbortController();
  const response = await fetch(`${normalizeApiRoot(config.apiRoot)}/events/stream?${search.toString()}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "text/event-stream",
    },
    signal: controller.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Stream failed: ${response.status}`);
  }

  handlers.onOpen?.();

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  const closed = (async () => {
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          const parsed = parseForwardEventStreamChunk(buffer);
          for (const event of parsed.events) {
            handlers.onMessage?.(event);
          }
          handlers.onClose?.();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseForwardEventStreamChunk(buffer);
        buffer = parsed.remainder;
        for (const event of parsed.events) {
          handlers.onMessage?.(event);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        handlers.onError?.(error);
      }
    }
  })();

  return {
    close() {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    },
    closed,
  };
}

export function readInitialBridgeConfig() {
  const params = new URLSearchParams(window.location.search);
  const apiRootFromQuery = params.get("api");
  if (params.has("token")) {
    params.delete("token");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }
  const storedApiRoot = window.localStorage.getItem("conitens.forward.apiRoot");
  return {
    apiRoot: apiRootFromQuery || storedApiRoot || "http://127.0.0.1:8785/api",
    token: "",
  };
}

export function persistBridgeConfig(config: ForwardBridgeConfig) {
  window.localStorage.setItem("conitens.forward.apiRoot", config.apiRoot);
}
