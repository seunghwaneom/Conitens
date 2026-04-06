import type { ForwardOperatorWorkspaceRecord } from "./forward-bridge-types.ts";

export interface OperatorWorkspaceDraft {
  label: string;
  path: string;
  kind: string;
  status: string;
  archiveNote: string;
  ownerAgentId: string;
  linkedRunId: string;
  linkedIterationId: string;
  taskIds: string;
  notes: string;
}

export interface OperatorWorkspaceQuickStatusAction {
  status: ForwardOperatorWorkspaceRecord["status"];
  disabled: boolean;
  reason: string | null;
}

const QUICK_WORKSPACE_TRANSITIONS: Record<
  ForwardOperatorWorkspaceRecord["status"],
  ForwardOperatorWorkspaceRecord["status"][]
> = {
  active: ["idle", "blocked", "archived"],
  idle: ["active", "blocked", "archived"],
  blocked: ["active", "idle", "archived"],
  archived: ["active"],
};

export const QUICK_ARCHIVE_RATIONALE_HELP =
  "Add an archive rationale in the editor before quick-archiving this workspace.";

function isOperatorWorkspaceStatus(status: string): status is ForwardOperatorWorkspaceRecord["status"] {
  return status in QUICK_WORKSPACE_TRANSITIONS;
}

function parseWorkspaceTaskIds(taskIds: string): string[] {
  return taskIds
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function operatorWorkspaceNeedsArchiveRationale(
  status: string,
  draft: Pick<OperatorWorkspaceDraft, "archiveNote">,
): boolean {
  return status === "archived" && !draft.archiveNote.trim();
}

export function buildOperatorWorkspaceMutationBody(
  draft: OperatorWorkspaceDraft,
  statusOverride: string = draft.status,
): Record<string, unknown> {
  const status = statusOverride.trim() || draft.status;
  const archiveNote = draft.archiveNote.trim();
  const ownerAgentId = draft.ownerAgentId.trim();
  const linkedRunId = draft.linkedRunId.trim();
  const linkedIterationId = draft.linkedIterationId.trim();
  const notes = draft.notes.trim();

  return {
    label: draft.label,
    path: draft.path,
    kind: draft.kind,
    status,
    ...(status === "archived" && archiveNote ? { archive_note: archiveNote } : {}),
    ...(ownerAgentId ? { owner_agent_id: ownerAgentId } : {}),
    ...(linkedRunId ? { linked_run_id: linkedRunId } : {}),
    ...(linkedIterationId ? { linked_iteration_id: linkedIterationId } : {}),
    task_ids_json: parseWorkspaceTaskIds(draft.taskIds),
    ...(notes ? { notes } : {}),
  };
}

export function getOperatorWorkspaceQuickStatusActions(
  currentStatus: string,
  draft: Pick<OperatorWorkspaceDraft, "archiveNote">,
): OperatorWorkspaceQuickStatusAction[] {
  if (!isOperatorWorkspaceStatus(currentStatus)) {
    return [];
  }
  return (QUICK_WORKSPACE_TRANSITIONS[currentStatus] ?? []).map((status) => ({
    status,
    disabled: operatorWorkspaceNeedsArchiveRationale(status, draft),
    reason:
      status === "archived" && operatorWorkspaceNeedsArchiveRationale(status, draft)
        ? QUICK_ARCHIVE_RATIONALE_HELP
        : null,
  }));
}
