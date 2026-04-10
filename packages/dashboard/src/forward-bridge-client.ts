import {
  parseApprovalDetailResponse,
  parseOperatorAgentsResponse,
  parseOperatorInboxResponse,
  parseOperatorTaskDeleteResponse,
  parseOperatorTaskDetailResponse,
  parseOperatorTasksResponse,
  parseOperatorWorkspaceDetailResponse,
  parseOperatorWorkspacesResponse,
  parseApprovalResumeResponse,
  parseApprovalsResponse,
  parseOperatorSummaryResponse,
} from "./forward-bridge-parsers.ts";
import type {
  ForwardApprovalDetailResponse,
  ForwardOperatorAgentsResponse,
  ForwardOperatorInboxResponse,
  ForwardOperatorTaskDeleteResponse,
  ForwardOperatorTaskDetailResponse,
  ForwardOperatorTasksResponse,
  ForwardOperatorWorkspaceDetailResponse,
  ForwardOperatorWorkspacesResponse,
  ForwardApprovalResumeResponse,
  ForwardApprovalsResponse,
  ForwardBridgeConfig,
  ForwardOperatorSummaryResponse,
} from "./forward-bridge-types.ts";
import { createForwardAuthHeaders } from "./forward-bridge-auth.ts";

function normalizeApiRoot(apiRoot: string): string {
  return apiRoot.replace(/\/+$/, "");
}

async function createRequestError(response: Response): Promise<Error> {
  let detail = `Request failed: ${response.status}`;
  try {
    const payload = await response.json();
    if (payload && typeof payload === "object" && typeof payload.error === "string" && payload.error.trim()) {
      detail = payload.error;
    }
  } catch {
    // Ignore non-JSON error bodies and keep the status-based message.
  }
  return new Error(detail);
}

export async function forwardGet<T>(
  config: ForwardBridgeConfig,
  path: string,
  parser: (payload: unknown) => T,
): Promise<T> {
  const response = await fetch(`${normalizeApiRoot(config.apiRoot)}${path}`, {
    headers: createForwardAuthHeaders(config.token),
  });
  if (!response.ok) {
    throw await createRequestError(response);
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
    headers: createForwardAuthHeaders(config.token, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await createRequestError(response);
  }
  return parser(await response.json());
}

export async function forwardPatch<T>(
  config: ForwardBridgeConfig,
  path: string,
  body: Record<string, unknown>,
  parser: (payload: unknown) => T,
): Promise<T> {
  const response = await fetch(`${normalizeApiRoot(config.apiRoot)}${path}`, {
    method: "PATCH",
    headers: createForwardAuthHeaders(config.token, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await createRequestError(response);
  }
  return parser(await response.json());
}

export async function forwardDelete<T>(
  config: ForwardBridgeConfig,
  path: string,
  parser: (payload: unknown) => T,
): Promise<T> {
  const response = await fetch(`${normalizeApiRoot(config.apiRoot)}${path}`, {
    method: "DELETE",
    headers: createForwardAuthHeaders(config.token),
  });
  if (!response.ok) {
    throw await createRequestError(response);
  }
  return parser(await response.json());
}

export async function forwardListApprovals(
  config: ForwardBridgeConfig,
  filters: { runId?: string; iterationId?: string; taskId?: string; status?: string } = {},
): Promise<ForwardApprovalsResponse> {
  const search = new URLSearchParams();
  if (filters.runId) search.set("run_id", filters.runId);
  if (filters.iterationId) search.set("iteration_id", filters.iterationId);
  if (filters.taskId) search.set("task_id", filters.taskId);
  if (filters.status) search.set("status", filters.status);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return forwardGet(config, `/approvals${suffix}`, parseApprovalsResponse);
}

export async function forwardGetOperatorSummary(
  config: ForwardBridgeConfig,
): Promise<ForwardOperatorSummaryResponse> {
  return forwardGet(config, "/operator/summary", parseOperatorSummaryResponse);
}

export async function forwardGetOperatorInbox(
  config: ForwardBridgeConfig,
): Promise<ForwardOperatorInboxResponse> {
  return forwardGet(config, "/operator/inbox", parseOperatorInboxResponse);
}

export async function forwardGetOperatorAgents(
  config: ForwardBridgeConfig,
): Promise<ForwardOperatorAgentsResponse> {
  return forwardGet(config, "/operator/agents", parseOperatorAgentsResponse);
}

export async function forwardGetOperatorTasks(
  config: ForwardBridgeConfig,
  filters: { status?: string; ownerAgentId?: string; workspaceRef?: string; includeArchived?: boolean } = {},
): Promise<ForwardOperatorTasksResponse> {
  const search = new URLSearchParams();
  if (filters.status) search.set("status", filters.status);
  if (filters.ownerAgentId) search.set("owner_agent_id", filters.ownerAgentId);
  if (filters.workspaceRef) search.set("workspace_ref", filters.workspaceRef);
  if (filters.includeArchived) search.set("include_archived", "1");
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return forwardGet(config, `/operator/tasks${suffix}`, parseOperatorTasksResponse);
}

export async function forwardGetOperatorTask(
  config: ForwardBridgeConfig,
  taskId: string,
): Promise<ForwardOperatorTaskDetailResponse> {
  return forwardGet(config, `/operator/tasks/${encodeURIComponent(taskId)}`, parseOperatorTaskDetailResponse);
}

export async function forwardGetOperatorWorkspaces(
  config: ForwardBridgeConfig,
  filters: { status?: string; ownerAgentId?: string } = {},
): Promise<ForwardOperatorWorkspacesResponse> {
  const search = new URLSearchParams();
  if (filters.status) search.set("status", filters.status);
  if (filters.ownerAgentId) search.set("owner_agent_id", filters.ownerAgentId);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return forwardGet(config, `/operator/workspaces${suffix}`, parseOperatorWorkspacesResponse);
}

export async function forwardGetOperatorWorkspace(
  config: ForwardBridgeConfig,
  workspaceId: string,
): Promise<ForwardOperatorWorkspaceDetailResponse> {
  return forwardGet(config, `/operator/workspaces/${encodeURIComponent(workspaceId)}`, parseOperatorWorkspaceDetailResponse);
}

export async function forwardCreateOperatorTask(
  config: ForwardBridgeConfig,
  body: Record<string, unknown>,
): Promise<ForwardOperatorTaskDetailResponse> {
  return forwardPost(config, "/operator/tasks", body, parseOperatorTaskDetailResponse);
}

export async function forwardCreateOperatorWorkspace(
  config: ForwardBridgeConfig,
  body: Record<string, unknown>,
): Promise<ForwardOperatorWorkspaceDetailResponse> {
  return forwardPost(config, "/operator/workspaces", body, parseOperatorWorkspaceDetailResponse);
}

export async function forwardUpdateOperatorTask(
  config: ForwardBridgeConfig,
  taskId: string,
  body: Record<string, unknown>,
): Promise<ForwardOperatorTaskDetailResponse> {
  return forwardPatch(config, `/operator/tasks/${encodeURIComponent(taskId)}`, body, parseOperatorTaskDetailResponse);
}

export async function forwardUpdateOperatorWorkspace(
  config: ForwardBridgeConfig,
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<ForwardOperatorWorkspaceDetailResponse> {
  return forwardPatch(config, `/operator/workspaces/${encodeURIComponent(workspaceId)}`, body, parseOperatorWorkspaceDetailResponse);
}

export async function forwardDeleteOperatorTask(
  config: ForwardBridgeConfig,
  taskId: string,
): Promise<ForwardOperatorTaskDeleteResponse> {
  return forwardDelete(config, `/operator/tasks/${encodeURIComponent(taskId)}`, parseOperatorTaskDeleteResponse);
}

export async function forwardArchiveOperatorTask(
  config: ForwardBridgeConfig,
  taskId: string,
  body: Record<string, unknown>,
): Promise<ForwardOperatorTaskDetailResponse> {
  return forwardPost(config, `/operator/tasks/${encodeURIComponent(taskId)}/archive`, body, parseOperatorTaskDetailResponse);
}

export async function forwardDetachOperatorTaskWorkspace(
  config: ForwardBridgeConfig,
  taskId: string,
): Promise<ForwardOperatorTaskDetailResponse> {
  return forwardPost(config, `/operator/tasks/${encodeURIComponent(taskId)}/detach-workspace`, {}, parseOperatorTaskDetailResponse);
}

export async function forwardRestoreOperatorTask(
  config: ForwardBridgeConfig,
  taskId: string,
): Promise<ForwardOperatorTaskDetailResponse> {
  return forwardPost(config, `/operator/tasks/${encodeURIComponent(taskId)}/restore`, {}, parseOperatorTaskDetailResponse);
}

export async function forwardRequestOperatorTaskApproval(
  config: ForwardBridgeConfig,
  taskId: string,
  body: Record<string, unknown> = {},
): Promise<ForwardApprovalDetailResponse> {
  return forwardPost(config, `/operator/tasks/${encodeURIComponent(taskId)}/request-approval`, body, parseApprovalDetailResponse);
}

export async function forwardGetApproval(
  config: ForwardBridgeConfig,
  requestId: string,
): Promise<ForwardApprovalDetailResponse> {
  return forwardGet(config, `/approvals/${encodeURIComponent(requestId)}`, parseApprovalDetailResponse);
}

export async function forwardDecideApproval(
  config: ForwardBridgeConfig,
  requestId: string,
  payload: { status: "approved" | "edited" | "rejected"; reviewer_note: string; edited_payload?: Record<string, unknown> },
): Promise<ForwardApprovalDetailResponse> {
  return forwardPost(config, `/approvals/${encodeURIComponent(requestId)}/decision`, payload, parseApprovalDetailResponse);
}

export async function forwardResumeApproval(
  config: ForwardBridgeConfig,
  requestId: string,
): Promise<ForwardApprovalResumeResponse> {
  return forwardPost(config, `/approvals/${encodeURIComponent(requestId)}/resume`, {}, parseApprovalResumeResponse);
}
