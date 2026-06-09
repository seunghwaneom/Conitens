import type { ForwardOperatorTaskRecord } from "./forward-bridge.js";

export interface OperatorTaskMutationDraft {
  title: string;
  objective: string;
  status: string;
  priority: string;
  ownerAgentId: string;
  linkedRunId: string;
  linkedIterationId: string;
  linkedRoomIds: string;
  blockedReason: string;
  acceptance: string;
  workspaceRef: string;
}

export interface OperatorTaskMutationBody {
  [key: string]: unknown;
  title: string;
  objective: string;
  status: string;
  priority: string;
  owner_agent_id?: string;
  linked_run_id?: string;
  linked_iteration_id?: string;
  linked_room_ids: string[];
  blocked_reason?: string;
  acceptance_json: string[];
  workspace_ref?: string;
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalText(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function buildOperatorTaskDraftMutationBody(
  draft: OperatorTaskMutationDraft,
): OperatorTaskMutationBody {
  return {
    title: draft.title,
    objective: draft.objective,
    status: draft.status,
    priority: draft.priority,
    owner_agent_id: optionalText(draft.ownerAgentId),
    linked_run_id: optionalText(draft.linkedRunId),
    linked_iteration_id: optionalText(draft.linkedIterationId),
    linked_room_ids: splitCsv(draft.linkedRoomIds),
    blocked_reason: optionalText(draft.blockedReason),
    acceptance_json: splitLines(draft.acceptance),
    workspace_ref: optionalText(draft.workspaceRef),
  };
}

export function buildOperatorTaskStatusMutationBody(
  task: ForwardOperatorTaskRecord,
  status: string,
): OperatorTaskMutationBody {
  return {
    title: task.title,
    objective: task.objective,
    status,
    priority: task.priority,
    owner_agent_id: optionalText(task.owner_agent_id),
    linked_run_id: optionalText(task.linked_run_id),
    linked_iteration_id: optionalText(task.linked_iteration_id),
    linked_room_ids: task.linked_room_ids_json,
    blocked_reason: optionalText(task.blocked_reason),
    acceptance_json: task.acceptance_json,
    workspace_ref: optionalText(task.workspace_ref),
  };
}
