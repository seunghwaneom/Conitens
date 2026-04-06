import type {
  ForwardOperatorWorkspaceDetailResponse,
  ForwardOperatorWorkspaceRecord,
  ForwardOperatorWorkspacesResponse,
} from "./forward-bridge.js";
import { buildForwardRoute } from "./forward-route.ts";

export interface OperatorWorkspaceListItemViewModel {
  workspaceId: string;
  label: string;
  status: string;
  subtitle: string;
  metrics: string[];
  targetHash: string;
}

export interface OperatorWorkspaceDetailViewModel {
  workspaceId: string;
  label: string;
  path: string;
  kind: string;
  status: string;
  owner: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveNote: string | null;
  linkedRunId: string | null;
  linkedIterationId: string | null;
  taskIds: string[];
  notes: string | null;
  stats: Array<{ label: string; value: string }>;
}

function workspaceSubtitle(workspace: ForwardOperatorWorkspaceRecord): string {
  return [workspace.owner_agent_id, workspace.kind, workspace.status].filter(Boolean).join(" | ");
}

export function toOperatorWorkspaceListItems(
  response: ForwardOperatorWorkspacesResponse,
): OperatorWorkspaceListItemViewModel[] {
  return response.workspaces.map((workspace) => ({
    workspaceId: workspace.workspace_id,
    label: workspace.label,
    status: workspace.status,
    subtitle: workspaceSubtitle(workspace),
    metrics: [
      workspace.path,
      workspace.linked_run_id ? `run ${workspace.linked_run_id}` : "unlinked",
      `${workspace.task_ids_json.length} task refs`,
    ],
    targetHash: buildForwardRoute({ screen: "workspace-detail", runId: null, taskId: null, workspaceId: workspace.workspace_id }),
  }));
}

export function toOperatorWorkspaceDetail(
  response: ForwardOperatorWorkspaceDetailResponse,
): OperatorWorkspaceDetailViewModel {
  const workspace = response.workspace;
  return {
    workspaceId: workspace.workspace_id,
    label: workspace.label,
    path: workspace.path,
    kind: workspace.kind,
    status: workspace.status,
    owner: workspace.owner_agent_id ?? "unassigned",
    archivedAt: workspace.archived_at,
    archivedBy: workspace.archived_by,
    archiveNote: workspace.archive_note,
    linkedRunId: workspace.linked_run_id,
    linkedIterationId: workspace.linked_iteration_id,
    taskIds: workspace.task_ids_json,
    notes: workspace.notes,
    stats: [
      { label: "Kind", value: workspace.kind },
      { label: "Status", value: workspace.status },
      { label: "Run", value: workspace.linked_run_id ?? "none" },
      { label: "Iteration", value: workspace.linked_iteration_id ?? "none" },
      { label: "Tasks", value: String(workspace.task_ids_json.length) },
    ],
  };
}
