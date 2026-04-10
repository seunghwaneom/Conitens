import styles from './OperatorTaskDetailPanel.module.css';
import { Badge, Button, EmptyState, ErrorDisplay, LoadingState } from '../ds/index.js';
import type { OperatorTaskDetailViewModel } from "../operator-tasks-model.js";
import { pickText, localizeLabel, localizeStatus } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

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
  const locale = useUiStore((state) => state.locale);
  if (state === "loading") {
    return <LoadingState message={pickText(locale, { ko: "운영자 작업 로딩 중…", en: "Loading operator task…" })} />;
  }
  if (state === "error") {
    return <ErrorDisplay message={error ?? "Unknown error"} />;
  }
  if (state === "idle" || !task) {
    return (
      <div className={styles.placeholder}>
        <h3>{pickText(locale, { ko: "운영자 작업 선택", en: "Select an operator task" })}</h3>
        <EmptyState message={pickText(locale, { ko: "왼쪽 rail에서 작업을 선택하면 owned operator record를 확인할 수 있습니다.", en: "Choose a task from the left rail to inspect its owned operator record." })} />
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
        <Badge>{localizeStatus(locale, task.status)}</Badge>
      </div>
      <div className={styles.stats}>
        {task.stats.map((item) => (
          <div key={item.label}>
            <span>{localizeLabel(locale, item.label)}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {onQuickStatus ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.panelLabel}>{pickText(locale, { ko: "빠른 상태 변경", en: "Quick status" })}</p>
              <h3>{pickText(locale, { ko: "작업을 다음 상태로 이동", en: "Move the task forward" })}</h3>
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
                {localizeStatus(locale, status)}
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
              <p className={styles.panelLabel}>{pickText(locale, { ko: "승인 워크플로", en: "Approval workflow" })}</p>
              <h3>{pickText(locale, { ko: "이 작업에 대한 검토 요청", en: "Request review for this task" })}</h3>
            </div>
            <span className={stateClass(approvalRequestState)}>{approvalRequestState}</span>
          </div>
          <label className={styles.noteLabel}>
            <span>{pickText(locale, { ko: "사유", en: "Rationale" })}</span>
            <textarea
              value={approvalRationale}
              onChange={(event) => onApprovalRationaleChange?.(event.target.value)}
              rows={3}
              placeholder={pickText(locale, { ko: "왜 이 작업 변경이 명시적인 검토를 필요로 하는지 설명하세요.", en: "Explain why this task change needs explicit review." })}
            />
          </label>
          {approvalRequestedChanges.length > 0 ? (
            <ul className={styles.timeline}>
              <li>
                  <div className={styles.timelineTopline}>
                  <strong>{pickText(locale, { ko: "요청된 변경", en: "Requested changes" })}</strong>
                  </div>
                  <p>{approvalRequestedChanges.join(" | ")}</p>
                </li>
            </ul>
          ) : null}
          <div className={styles.actions}>
            <Button variant="secondary" type="button" onClick={onRequestApproval}>
              {pickText(locale, { ko: "승인 요청", en: "Request approval" })}
            </Button>
          </div>
          {approvalRequestError ? <p className={styles.error}>{approvalRequestError}</p> : null}
        </section>
      ) : null}
      {onArchive || onRestore || (onDelete && task.archivedAt) ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.panelLabel}>{pickText(locale, { ko: "라이프사이클", en: "Lifecycle" })}</p>
              <h3>{task.archivedAt ? pickText(locale, { ko: "보관된 작업 제어", en: "Archived task controls" }) : pickText(locale, { ko: "이 작업 보관", en: "Archive this task" })}</h3>
            </div>
            <span className={stateClass(lifecycleState)}>
              {lifecycleState}
            </span>
          </div>
          <p className={styles.helpText}>
            {task.archivedAt
              ? pickText(locale, { ko: "보관된 작업은 기본 task queue에서 제거됩니다. 검토 컨텍스트가 정리된 뒤 다시 활성화하거나 영구 삭제할 수 있습니다.", en: "Archived tasks are removed from the default task queue. You can restore them to active visibility or permanently delete them after review context is clear." })
              : pickText(locale, { ko: "보관은 linked run, replay, approval evidence를 삭제하지 않고 task를 기본 queue에서 제거합니다. 이 작업 또는 linked run에 pending approval이 있으면 보관이 차단됩니다.", en: "Archive removes the task from the default queue without deleting linked run, replay, or approval evidence. Archive is blocked while this task or its linked run has pending approvals." })}
          </p>
          {!task.archivedAt ? (
            <label className={styles.noteLabel}>
              <span>{pickText(locale, { ko: "보관 사유", en: "Archive rationale" })}</span>
              <textarea
                value={archiveRationale}
                onChange={(event) => onArchiveRationaleChange?.(event.target.value)}
                rows={3}
                placeholder={pickText(locale, { ko: "왜 이 작업이 active queue를 떠나는지 설명하세요.", en: "Explain why this task is leaving the active queue." })}
              />
            </label>
          ) : null}
          {task.archivedAt ? (
            <ul className={styles.timeline}>
                <li>
                  <div className={styles.timelineTopline}>
                    <strong>{pickText(locale, { ko: "보관자", en: "Archived by" })}</strong>
                  </div>
                  <p>{task.archivedBy ?? "unknown"}</p>
                </li>
              {task.archiveNote ? (
                <li>
                  <div className={styles.timelineTopline}>
                    <strong>{pickText(locale, { ko: "보관 사유", en: "Archive rationale" })}</strong>
                  </div>
                  <p>{task.archiveNote}</p>
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className={styles.actions}>
            {!task.archivedAt && onArchive ? (
              <Button variant="secondary" type="button" onClick={onArchive}>
                {pickText(locale, { ko: "작업 보관", en: "Archive task" })}
              </Button>
            ) : null}
            {task.archivedAt && onRestore ? (
              <Button variant="secondary" type="button" onClick={onRestore}>
                {pickText(locale, { ko: "작업 복원", en: "Restore task" })}
              </Button>
            ) : null}
            {task.archivedAt && onDelete ? (
              <Button variant="secondary" type="button" onClick={onDelete}>
                {pickText(locale, { ko: "작업 삭제", en: "Delete task" })}
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
            <p className={styles.panelLabel}>{pickText(locale, { ko: "소유권", en: "Ownership" })}</p>
            <h3>{pickText(locale, { ko: "운영자 작업 레코드", en: "Operator task record" })}</h3>
          </div>
        </div>
        <ul className={styles.timeline}>
          <li>
            <div className={styles.timelineTopline}>
              <strong>{pickText(locale, { ko: "담당자", en: "Owner" })}</strong>
            </div>
            <p>{task.owner}</p>
          </li>
          {task.blockedReason ? (
            <li>
              <div className={styles.timelineTopline}>
                <strong>{pickText(locale, { ko: "차단 사유", en: "Blocked reason" })}</strong>
              </div>
              <p>{task.blockedReason}</p>
            </li>
          ) : null}
          <li>
            <div className={styles.timelineTopline}>
              <strong>{pickText(locale, { ko: "완료 기준", en: "Acceptance" })}</strong>
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
