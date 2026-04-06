import type {
  ForwardOperatorTaskDetailResponse,
  ForwardOperatorTaskRecord,
  ForwardOperatorTasksResponse,
} from "./forward-bridge.js";
import { buildForwardRoute } from "./forward-route.ts";

export interface OperatorTaskListItemViewModel {
  taskId: string;
  title: string;
  status: string;
  subtitle: string;
  metrics: string[];
  targetHash: string;
}

export interface OperatorTaskDetailViewModel {
  taskId: string;
  title: string;
  status: string;
  objective: string;
  owner: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveNote: string | null;
  linkedRunId: string | null;
  linkedIterationId: string | null;
  linkedRoomIds: string[];
  blockedReason: string | null;
  acceptance: string[];
  stats: Array<{ label: string; value: string }>;
}

function statusLabel(task: ForwardOperatorTaskRecord): string {
  return task.status.replaceAll("_", " ");
}

export function toOperatorTaskListItems(
  response: ForwardOperatorTasksResponse,
): OperatorTaskListItemViewModel[] {
  return response.tasks.map((task) => ({
    taskId: task.task_id,
    title: task.title,
    status: task.status,
    subtitle: [
      task.archived_at ? "archived" : null,
      task.owner_agent_id,
      statusLabel(task),
    ].filter(Boolean).join(" | "),
    metrics: [
      `priority ${task.priority}`,
      task.linked_run_id ? `run ${task.linked_run_id}` : "unlinked",
      `${task.acceptance_json.length} acceptance`,
    ],
    targetHash: buildForwardRoute({ screen: "task-detail", runId: null, taskId: task.task_id }),
  }));
}

export function toOperatorTaskDetail(
  response: ForwardOperatorTaskDetailResponse,
): OperatorTaskDetailViewModel {
  const task = response.task;
  return {
    taskId: task.task_id,
    title: task.title,
    status: task.status,
    objective: task.objective,
    owner: task.owner_agent_id ?? "unassigned",
    archivedAt: task.archived_at,
    archivedBy: task.archived_by,
    archiveNote: task.archive_note,
    linkedRunId: task.linked_run_id,
    linkedIterationId: task.linked_iteration_id,
    linkedRoomIds: task.linked_room_ids_json,
    blockedReason: task.blocked_reason,
    acceptance: task.acceptance_json,
    stats: [
      { label: "Priority", value: task.priority },
      { label: "Archived", value: task.archived_at ? "yes" : "no" },
      { label: "Run", value: task.linked_run_id ?? "none" },
      { label: "Iteration", value: task.linked_iteration_id ?? "none" },
      { label: "Rooms", value: String(task.linked_room_ids_json.length) },
      { label: "Workspace", value: task.workspace_ref ?? "none" },
    ],
  };
}
