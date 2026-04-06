import type { OperatorWorkspaceDetailViewModel } from "../operator-workspaces-model.js";
import type { OperatorWorkspaceQuickStatusAction } from "../operator-workspace-actions.js";

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorWorkspaceDetailPanelProps {
  workspace: OperatorWorkspaceDetailViewModel | null;
  state: PanelState;
  error: string | null;
  mutationState?: PanelState;
  mutationError?: string | null;
  onQuickStatus?: (status: string) => void;
  quickStatusActions?: OperatorWorkspaceQuickStatusAction[];
  linkedTasks?: Array<{
    taskId: string;
    title: string;
    status: string;
    owner: string;
    archived: boolean;
  }>;
  linkedTasksState?: PanelState;
  linkedTasksError?: string | null;
  taskActionState?: PanelState;
  taskActionError?: string | null;
  taskActionMessage?: string | null;
  onOpenTask?: (taskId: string) => void;
  onDetachTask?: (taskId: string) => void;
  onArchiveTask?: (taskId: string) => void;
}

export function OperatorWorkspaceDetailPanel({
  workspace,
  state,
  error,
  mutationState = "idle",
  mutationError = null,
  onQuickStatus,
  quickStatusActions = [],
  linkedTasks = [],
  linkedTasksState = "idle",
  linkedTasksError = null,
  taskActionState = "idle",
  taskActionError = null,
  taskActionMessage = null,
  onOpenTask,
  onDetachTask,
  onArchiveTask,
}: OperatorWorkspaceDetailPanelProps) {
  if (state === "loading") {
    return <p className="forward-empty">Loading operator workspace...</p>;
  }
  if (state === "error") {
    return <p className="forward-error">{error}</p>;
  }
  if (state === "idle" || !workspace) {
    return (
      <div className="forward-placeholder">
        <h3>Select an operator workspace</h3>
        <p>Choose a workspace from the left rail to inspect its canonical record.</p>
      </div>
    );
  }
  const disabledQuickStatusReason = quickStatusActions.find((action) => action.disabled && action.reason)?.reason;

  return (
    <div className="forward-detail-body">
      <div className="forward-detail-hero">
        <div>
          <p className="forward-detail-label">{workspace.workspaceId}</p>
          <h3>{workspace.label}</h3>
          <p>{workspace.path}</p>
        </div>
        <span className="forward-status-pill">{workspace.status}</span>
      </div>
      <div className="forward-stats">
        {workspace.stats.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {onQuickStatus ? (
        <section className="forward-section">
          <div className="forward-section-header">
            <div>
              <p className="forward-panel-label">Quick status</p>
              <h3>Move the workspace forward</h3>
            </div>
            <span className={`forward-state state-${mutationState}`}>{mutationState}</span>
          </div>
          <div className="forward-approval-actions">
            {quickStatusActions.map((action) => (
              <button
                key={action.status}
                className="forward-chip-button"
                type="button"
                disabled={action.disabled}
                title={action.reason ?? undefined}
                onClick={() => onQuickStatus(action.status)}
              >
                {action.status}
              </button>
            ))}
          </div>
          {disabledQuickStatusReason ? <p className="forward-help">{disabledQuickStatusReason}</p> : null}
          {mutationError ? <p className="forward-error">{mutationError}</p> : null}
        </section>
      ) : null}
      <section className="forward-section">
        <div className="forward-section-header">
          <div>
            <p className="forward-panel-label">Linked tasks</p>
            <h3>Tasks currently attached to this workspace</h3>
          </div>
          <span className={`forward-state state-${taskActionState}`}>{taskActionState}</span>
        </div>
        {linkedTasksState === "loading" ? <p className="forward-empty">Loading linked tasks...</p> : null}
        {linkedTasksError ? <p className="forward-error">{linkedTasksError}</p> : null}
        {linkedTasksState === "ready" && linkedTasks.length === 0 ? (
          <p className="forward-empty">No linked tasks are currently attached.</p>
        ) : null}
        {linkedTasks.length > 0 ? (
          <ul className="forward-timeline">
            {linkedTasks.map((task) => (
              <li key={task.taskId}>
                <div className="forward-timeline-topline">
                  <strong>{task.title}</strong>
                  <span>{task.status}</span>
                </div>
                <p>{task.taskId} | owner {task.owner}</p>
                <div className="forward-approval-actions">
                  {onOpenTask ? (
                    <button className="forward-chip-button" type="button" onClick={() => onOpenTask(task.taskId)}>
                      Open task
                    </button>
                  ) : null}
                  {onDetachTask ? (
                    <button className="forward-chip-button" type="button" onClick={() => onDetachTask(task.taskId)}>
                      Detach
                    </button>
                  ) : null}
                  {!task.archived && onArchiveTask ? (
                    <button className="forward-chip-button" type="button" onClick={() => onArchiveTask(task.taskId)}>
                      Archive task
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {taskActionMessage ? <p className="forward-help">{taskActionMessage}</p> : null}
        {taskActionError ? <p className="forward-error">{taskActionError}</p> : null}
      </section>
      <section className="forward-section">
        <div className="forward-section-header">
          <div>
            <p className="forward-panel-label">Ownership</p>
            <h3>Workspace record</h3>
          </div>
        </div>
        <ul className="forward-timeline">
          <li>
            <div className="forward-timeline-topline">
              <strong>Owner</strong>
            </div>
            <p>{workspace.owner}</p>
          </li>
          {workspace.archivedAt ? (
            <li>
              <div className="forward-timeline-topline">
                <strong>Archived by</strong>
              </div>
              <p>{workspace.archivedBy ?? "unknown"}</p>
            </li>
          ) : null}
          {workspace.archiveNote ? (
            <li>
              <div className="forward-timeline-topline">
                <strong>Archive rationale</strong>
              </div>
              <p>{workspace.archiveNote}</p>
            </li>
          ) : null}
          <li>
            <div className="forward-timeline-topline">
              <strong>Linked task refs</strong>
            </div>
            <p>{workspace.taskIds.length > 0 ? workspace.taskIds.join(" | ") : "No linked task refs."}</p>
          </li>
          {workspace.notes ? (
            <li>
              <div className="forward-timeline-topline">
                <strong>Notes</strong>
              </div>
              <p>{workspace.notes}</p>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
