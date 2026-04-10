import type { OperatorWorkspaceDetailViewModel } from "../operator-workspaces-model.js";
import type { OperatorWorkspaceQuickStatusAction } from "../operator-workspace-actions.js";
import { Badge, Button, EmptyState, ErrorDisplay, LoadingState } from "../ds/index.js";
import styles from "./OperatorWorkspaceDetailPanel.module.css";

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
    return <LoadingState message="Loading operator workspace…" />;
  }
  if (state === "error") {
    return <ErrorDisplay message={error ?? "Unknown error"} />;
  }
  if (state === "idle" || !workspace) {
    return (
      <div className={styles.placeholder}>
        <h3>Select an operator workspace</h3>
        <p>Choose a workspace from the left rail to inspect its canonical record.</p>
      </div>
    );
  }
  const disabledQuickStatusReason = quickStatusActions.find((action) => action.disabled && action.reason)?.reason;

  return (
    <div className={styles.detailBody}>
      <div className={styles.detailHero}>
        <div>
          <p className={styles.detailLabel}>{workspace.workspaceId}</p>
          <h3>{workspace.label}</h3>
          <p>{workspace.path}</p>
        </div>
        <Badge>{workspace.status}</Badge>
      </div>
      <div className={styles.stats}>
        {workspace.stats.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {onQuickStatus ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.panelLabel}>Quick status</p>
              <h3>Move the workspace forward</h3>
            </div>
            <span className={styles.state} data-state={mutationState}>{mutationState}</span>
          </div>
          <div className={styles.actions}>
            {quickStatusActions.map((action) => (
              <Button
                key={action.status}
                variant="secondary"
                disabled={action.disabled}
                title={action.reason ?? undefined}
                onClick={() => onQuickStatus(action.status)}
              >
                {action.status}
              </Button>
            ))}
          </div>
          {disabledQuickStatusReason ? <p className={styles.helpText}>{disabledQuickStatusReason}</p> : null}
          {mutationError ? <ErrorDisplay message={mutationError} /> : null}
        </section>
      ) : null}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.panelLabel}>Linked tasks</p>
            <h3>Tasks currently attached to this workspace</h3>
          </div>
          <span className={styles.state} data-state={taskActionState}>{taskActionState}</span>
        </div>
        {linkedTasksState === "loading" ? <LoadingState message="Loading linked tasks…" /> : null}
        {linkedTasksError ? <ErrorDisplay message={linkedTasksError} /> : null}
        {linkedTasksState === "ready" && linkedTasks.length === 0 ? (
          <EmptyState message="No linked tasks are currently attached." />
        ) : null}
        {linkedTasks.length > 0 ? (
          <ul className={styles.timeline}>
            {linkedTasks.map((task) => (
              <li key={task.taskId}>
                <div className={styles.timelineTopline}>
                  <strong>{task.title}</strong>
                  <span>{task.status}</span>
                </div>
                <p>{task.taskId} | owner {task.owner}</p>
                <div className={styles.actions}>
                  {onOpenTask ? (
                    <Button variant="secondary" onClick={() => onOpenTask(task.taskId)}>
                      Open task
                    </Button>
                  ) : null}
                  {onDetachTask ? (
                    <Button variant="secondary" onClick={() => onDetachTask(task.taskId)}>
                      Detach
                    </Button>
                  ) : null}
                  {!task.archived && onArchiveTask ? (
                    <Button variant="secondary" onClick={() => onArchiveTask(task.taskId)}>
                      Archive task
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {taskActionMessage ? <p className={styles.helpText}>{taskActionMessage}</p> : null}
        {taskActionError ? <ErrorDisplay message={taskActionError} /> : null}
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.panelLabel}>Ownership</p>
            <h3>Workspace record</h3>
          </div>
        </div>
        <ul className={styles.timeline}>
          <li>
            <div className={styles.timelineTopline}>
              <strong>Owner</strong>
            </div>
            <p>{workspace.owner}</p>
          </li>
          {workspace.archivedAt ? (
            <li>
              <div className={styles.timelineTopline}>
                <strong>Archived by</strong>
              </div>
              <p>{workspace.archivedBy ?? "unknown"}</p>
            </li>
          ) : null}
          {workspace.archiveNote ? (
            <li>
              <div className={styles.timelineTopline}>
                <strong>Archive rationale</strong>
              </div>
              <p>{workspace.archiveNote}</p>
            </li>
          ) : null}
          <li>
            <div className={styles.timelineTopline}>
              <strong>Linked task refs</strong>
            </div>
            <p>{workspace.taskIds.length > 0 ? workspace.taskIds.join(" | ") : "No linked task refs."}</p>
          </li>
          {workspace.notes ? (
            <li>
              <div className={styles.timelineTopline}>
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
