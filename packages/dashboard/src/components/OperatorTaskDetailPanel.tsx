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
    return <p className="forward-empty">Loading operator task...</p>;
  }
  if (state === "error") {
    return <p className="forward-error">{error}</p>;
  }
  if (state === "idle" || !task) {
    return (
      <div className="forward-placeholder">
        <h3>Select an operator task</h3>
        <p>Choose a task from the left rail to inspect its owned operator record.</p>
      </div>
    );
  }
  const lifecycleState = task.archivedAt
    ? (archiveState !== "idle" ? archiveState : deleteState)
    : archiveState;

  return (
    <div className="forward-detail-body">
      <div className="forward-detail-hero">
        <div>
          <p className="forward-detail-label">{task.taskId}</p>
          <h3>{task.title}</h3>
          <p>{task.objective}</p>
        </div>
        <span className="forward-status-pill">{task.status}</span>
      </div>
      <div className="forward-stats">
        {task.stats.map((item) => (
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
              <h3>Move the task forward</h3>
            </div>
            <span className={`forward-state state-${mutationState}`}>{mutationState}</span>
          </div>
          <div className="forward-approval-actions">
            {(QUICK_STATUS_TRANSITIONS[task.status] ?? []).map((status) => (
              <button
                key={status}
                className="forward-chip-button"
                type="button"
                onClick={() => onQuickStatus(status)}
              >
                {status}
              </button>
            ))}
          </div>
          {mutationError ? <p className="forward-error">{mutationError}</p> : null}
        </section>
      ) : null}
      {onRequestApproval ? (
        <section className="forward-section">
          <div className="forward-section-header">
            <div>
              <p className="forward-panel-label">Approval workflow</p>
              <h3>Request review for this task</h3>
            </div>
            <span className={`forward-state state-${approvalRequestState}`}>{approvalRequestState}</span>
          </div>
          <label className="forward-approval-note">
            <span>Rationale</span>
            <textarea
              value={approvalRationale}
              onChange={(event) => onApprovalRationaleChange?.(event.target.value)}
              rows={3}
              placeholder="Explain why this task change needs explicit review."
            />
          </label>
          {approvalRequestedChanges.length > 0 ? (
            <ul className="forward-timeline">
              <li>
                <div className="forward-timeline-topline">
                  <strong>Requested changes</strong>
                </div>
                <p>{approvalRequestedChanges.join(" | ")}</p>
              </li>
            </ul>
          ) : null}
          <div className="forward-approval-actions">
            <button className="forward-chip-button" type="button" onClick={onRequestApproval}>
              Request approval
            </button>
          </div>
          {approvalRequestError ? <p className="forward-error">{approvalRequestError}</p> : null}
        </section>
      ) : null}
      {onArchive || onRestore || (onDelete && task.archivedAt) ? (
        <section className="forward-section">
          <div className="forward-section-header">
            <div>
              <p className="forward-panel-label">Lifecycle</p>
              <h3>{task.archivedAt ? "Archived task controls" : "Archive this task"}</h3>
            </div>
            <span className={`forward-state state-${lifecycleState}`}>
              {lifecycleState}
            </span>
          </div>
          <p className="forward-help">
            {task.archivedAt
              ? "Archived tasks are removed from the default task queue. You can restore them to active visibility or permanently delete them after review context is clear."
              : "Archive removes the task from the default queue without deleting linked run, replay, or approval evidence. Archive is blocked while this task or its linked run has pending approvals."}
          </p>
          {!task.archivedAt ? (
            <label className="forward-approval-note">
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
            <ul className="forward-timeline">
              <li>
                <div className="forward-timeline-topline">
                  <strong>Archived by</strong>
                </div>
                <p>{task.archivedBy ?? "unknown"}</p>
              </li>
              {task.archiveNote ? (
                <li>
                  <div className="forward-timeline-topline">
                    <strong>Archive rationale</strong>
                  </div>
                  <p>{task.archiveNote}</p>
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className="forward-approval-actions">
            {!task.archivedAt && onArchive ? (
              <button className="forward-chip-button" type="button" onClick={onArchive}>
                Archive task
              </button>
            ) : null}
            {task.archivedAt && onRestore ? (
              <button className="forward-chip-button" type="button" onClick={onRestore}>
                Restore task
              </button>
            ) : null}
            {task.archivedAt && onDelete ? (
              <button className="forward-chip-button" type="button" onClick={onDelete}>
                Delete task
              </button>
            ) : null}
          </div>
          {archiveError ? <p className="forward-error">{archiveError}</p> : null}
          {deleteError ? <p className="forward-error">{deleteError}</p> : null}
        </section>
      ) : null}
      <section className="forward-section">
        <div className="forward-section-header">
          <div>
            <p className="forward-panel-label">Ownership</p>
            <h3>Operator task record</h3>
          </div>
        </div>
        <ul className="forward-timeline">
          <li>
            <div className="forward-timeline-topline">
              <strong>Owner</strong>
            </div>
            <p>{task.owner}</p>
          </li>
          {task.blockedReason ? (
            <li>
              <div className="forward-timeline-topline">
                <strong>Blocked reason</strong>
              </div>
              <p>{task.blockedReason}</p>
            </li>
          ) : null}
          <li>
            <div className="forward-timeline-topline">
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
