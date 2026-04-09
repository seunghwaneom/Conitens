import styles from './OperatorTaskDetailPanel.module.css';
import { Badge, Button, EmptyState, ErrorDisplay, LoadingState } from '../ds/index.js';
import type { OperatorTaskDetailViewModel } from "../operator-tasks-model.js";

type PanelState = "idle" | "loading" | "ready" | "error";
const QUICK_STATUS_TRANSITIONS: Record<string, string[]> = {
  backlog: ["todo", "cancelled"],
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "in_review", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  in_review: ["in_progress", "blocked", "done", "cancelled"],
  done: [],
  cancelled: [],
};

interface OperatorTaskDetailPanelProps {
  task: OperatorTaskDetailViewModel | null;
  state: PanelState;
  error: string | null;
  mutationState?: PanelState;
  mutationError?: string | null;
  onQuickStatus?: (status: string) => void;
  archiveState?: PanelState;
  archiveError?: string | null;
  onArchive?: () => void;
  onRestore?: () => void;
  archiveRationale?: string;
  onArchiveRationaleChange?: (value: string) => void;
  deleteState?: PanelState;
  deleteError?: string | null;
  onDelete?: () => void;
  approvalRequestState?: PanelState;
  approvalRequestError?: string | null;
  onRequestApproval?: () => void;
  approvalRationale?: string;
  onApprovalRationaleChange?: (value: string) => void;
  approvalRequestedChanges?: string[];
}

function stateClass(panelState: PanelState): string {
  const map: Partial<Record<PanelState, string>> = {
    loading: styles.stateLoading,
    ready: styles.stateReady,
    error: styles.stateError,
  };
  return [styles.state, map[panelState]].filter(Boolean).join(' ');
}

export function OperatorTaskDetailPanel({
  task,
  state,
  error,
  mutationState = "idle",
  mutationError = null,
  onQuickStatus,
  archiveState = "idle",
  archiveError = null,
  onArchive,
  onRestore,
  archiveRationale = "",
  onArchiveRationaleChange,
  deleteState = "idle",
  deleteError = null,
  onDelete,
  approvalRequestState = "idle",
  approvalRequestError = null,
  onRequestApproval,
  approvalRationale = "",
  onApprovalRationaleChange,
  approvalRequestedChanges = [],
}: OperatorTaskDetailPanelProps) {
  if (state === "loading") {
    return <LoadingState message="Loading operator task..." />;
  }
  if (state === "error") {
    return <ErrorDisplay message={error ?? "Unknown error"} />;
  }
  if (state === "idle" || !task) {
    return (
      <div className={styles.placeholder}>
        <h3>Select an operator task</h3>
        <EmptyState message="Choose a task from the left rail to inspect its owned operator record." />
      </div>
    );
  }
  const lifecycleState = task.archivedAt
    ? (archiveState !== "idle" ? archiveState : deleteState)
    : archiveState;

  return (
    <div className={styles.detailBody}>
      <div className={styles.detailHero}>
        <div>
          <p className={styles.detailLabel}>{task.taskId}</p>
          <h3>{task.title}</h3>
          <p>{task.objective}</p>
        </div>
        <Badge>{task.status}</Badge>
      </div>
      <div className={styles.stats}>
        {task.stats.map((item) => (
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
              <h3>Move the task forward</h3>
            </div>
            <span className={stateClass(mutationState)}>{mutationState}</span>
          </div>
          <div className={styles.actions}>
            {(QUICK_STATUS_TRANSITIONS[task.status] ?? []).map((status) => (
              <Button
                key={status}
                variant="secondary"
                type="button"
                onClick={() => onQuickStatus(status)}
              >
                {status}
              </Button>
            ))}
          </div>
          {mutationError ? <p className={styles.error}>{mutationError}</p> : null}
        </section>
      ) : null}
      {onRequestApproval ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.panelLabel}>Approval workflow</p>
              <h3>Request review for this task</h3>
            </div>
            <span className={stateClass(approvalRequestState)}>{approvalRequestState}</span>
          </div>
          <label className={styles.noteLabel}>
            <span>Rationale</span>
            <textarea
              value={approvalRationale}
              onChange={(event) => onApprovalRationaleChange?.(event.target.value)}
              rows={3}
              placeholder="Explain why this task change needs explicit review."
            />
          </label>
          {approvalRequestedChanges.length > 0 ? (
            <ul className={styles.timeline}>
              <li>
                <div className={styles.timelineTopline}>
                  <strong>Requested changes</strong>
                </div>
                <p>{approvalRequestedChanges.join(" | ")}</p>
              </li>
            </ul>
          ) : null}
          <div className={styles.actions}>
            <Button variant="secondary" type="button" onClick={onRequestApproval}>
              Request approval
            </Button>
          </div>
          {approvalRequestError ? <p className={styles.error}>{approvalRequestError}</p> : null}
        </section>
      ) : null}
      {onArchive || onRestore || (onDelete && task.archivedAt) ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.panelLabel}>Lifecycle</p>
              <h3>{task.archivedAt ? "Archived task controls" : "Archive this task"}</h3>
            </div>
            <span className={stateClass(lifecycleState)}>
              {lifecycleState}
            </span>
          </div>
          <p className={styles.helpText}>
            {task.archivedAt
              ? "Archived tasks are removed from the default task queue. You can restore them to active visibility or permanently delete them after review context is clear."
              : "Archive removes the task from the default queue without deleting linked run, replay, or approval evidence. Archive is blocked while this task or its linked run has pending approvals."}
          </p>
          {!task.archivedAt ? (
            <label className={styles.noteLabel}>
              <span>Archive rationale</span>
              <textarea
                value={archiveRationale}
                onChange={(event) => onArchiveRationaleChange?.(event.target.value)}
                rows={3}
                placeholder="Explain why this task is leaving the active queue."
              />
            </label>
          ) : null}
          {task.archivedAt ? (
            <ul className={styles.timeline}>
              <li>
                <div className={styles.timelineTopline}>
                  <strong>Archived by</strong>
                </div>
                <p>{task.archivedBy ?? "unknown"}</p>
              </li>
              {task.archiveNote ? (
                <li>
                  <div className={styles.timelineTopline}>
                    <strong>Archive rationale</strong>
                  </div>
                  <p>{task.archiveNote}</p>
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className={styles.actions}>
            {!task.archivedAt && onArchive ? (
              <Button variant="secondary" type="button" onClick={onArchive}>
                Archive task
              </Button>
            ) : null}
            {task.archivedAt && onRestore ? (
              <Button variant="secondary" type="button" onClick={onRestore}>
                Restore task
              </Button>
            ) : null}
            {task.archivedAt && onDelete ? (
              <Button variant="secondary" type="button" onClick={onDelete}>
                Delete task
              </Button>
            ) : null}
          </div>
          {archiveError ? <p className={styles.error}>{archiveError}</p> : null}
          {deleteError ? <p className={styles.error}>{deleteError}</p> : null}
        </section>
      ) : null}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.panelLabel}>Ownership</p>
            <h3>Operator task record</h3>
          </div>
        </div>
        <ul className={styles.timeline}>
          <li>
            <div className={styles.timelineTopline}>
              <strong>Owner</strong>
            </div>
            <p>{task.owner}</p>
          </li>
          {task.blockedReason ? (
            <li>
              <div className={styles.timelineTopline}>
                <strong>Blocked reason</strong>
              </div>
              <p>{task.blockedReason}</p>
            </li>
          ) : null}
          <li>
            <div className={styles.timelineTopline}>
              <strong>Acceptance</strong>
            </div>
            {task.acceptance.length > 0 ? (
              <p>{task.acceptance.join(" | ")}</p>
            ) : (
              <p>No acceptance criteria recorded.</p>
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}
