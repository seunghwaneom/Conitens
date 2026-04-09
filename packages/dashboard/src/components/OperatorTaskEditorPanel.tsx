import styles from './OperatorTaskEditorPanel.module.css';
import { Button, ErrorDisplay } from '../ds/index.js';
import { pickText, localizeStatus } from "../i18n.js";
import { useUiStore } from "../store/ui-store.js";

type PanelState = "idle" | "loading" | "ready" | "error";

export interface OperatorTaskWorkspaceOption {
  id: string;
  label: string;
  path: string;
  status: string;
  owner: string;
  linkedRunId: string | null;
  taskCount: number;
  disabled?: boolean;
  unresolved?: boolean;
}

export interface OperatorTaskDraft {
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

interface OperatorTaskEditorPanelProps {
  mode: "create" | "edit";
  draft: OperatorTaskDraft;
  state: PanelState;
  error: string | null;
  workspaceOptions?: OperatorTaskWorkspaceOption[];
  selectedWorkspaceOption?: OperatorTaskWorkspaceOption | null;
  changePreview?: string[];
  sensitiveChangePreview?: string[];
  approvalHint?: string | null;
  onChange: (draft: OperatorTaskDraft) => void;
  onSubmit: () => void;
}

export function OperatorTaskEditorPanel({
  mode,
  draft,
  state,
  error,
  workspaceOptions = [],
  selectedWorkspaceOption = null,
  changePreview = [],
  sensitiveChangePreview = [],
  approvalHint = null,
  onChange,
  onSubmit,
}: OperatorTaskEditorPanelProps) {
  const locale = useUiStore((state) => state.locale);
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.panelLabel}>{pickText(locale, { ko: "작업 편집기", en: "Task editor" })}</p>
          <h3>{mode === "create" ? pickText(locale, { ko: "운영자 작업 생성", en: "Create operator task" }) : pickText(locale, { ko: "운영자 작업 수정", en: "Edit operator task" })}</h3>
        </div>
        <span className={styles.state}>{state}</span>
      </div>
      <div className={styles.form}>
        <label>
          <span>{pickText(locale, { ko: "제목", en: "Title" })}</span>
          <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
        </label>
        <label>
          <span>{pickText(locale, { ko: "상태", en: "Status" })}</span>
          <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value })}>
            {["backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"].map((item) => (
              <option key={item} value={item}>{localizeStatus(locale, item)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{pickText(locale, { ko: "우선순위", en: "Priority" })}</span>
          <select value={draft.priority} onChange={(event) => onChange({ ...draft, priority: event.target.value })}>
            {["low", "medium", "high", "critical"].map((item) => (
              <option key={item} value={item}>{pickText(locale, {
                ko: item === "low" ? "낮음" : item === "medium" ? "중간" : item === "high" ? "높음" : "치명적",
                en: item,
              })}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{pickText(locale, { ko: "담당 에이전트", en: "Owner agent" })}</span>
          <input value={draft.ownerAgentId} onChange={(event) => onChange({ ...draft, ownerAgentId: event.target.value })} />
        </label>
        <label>
          <span>{pickText(locale, { ko: "연결된 런", en: "Linked run" })}</span>
          <input value={draft.linkedRunId} onChange={(event) => onChange({ ...draft, linkedRunId: event.target.value })} />
        </label>
        <label>
          <span>{pickText(locale, { ko: "연결된 이터레이션", en: "Linked iteration" })}</span>
          <input value={draft.linkedIterationId} onChange={(event) => onChange({ ...draft, linkedIterationId: event.target.value })} />
        </label>
        <label>
          <span>{pickText(locale, { ko: "연결된 룸", en: "Linked rooms" })}</span>
          <input value={draft.linkedRoomIds} onChange={(event) => onChange({ ...draft, linkedRoomIds: event.target.value })} placeholder={pickText(locale, { ko: "쉼표로 구분된 room id", en: "comma-separated room ids" })} />
        </label>
        <label>
          <span>{pickText(locale, { ko: "워크스페이스", en: "Workspace" })}</span>
          <select value={draft.workspaceRef} onChange={(event) => onChange({ ...draft, workspaceRef: event.target.value })}>
            <option value="">{pickText(locale, { ko: "canonical workspace 없음", en: "No canonical workspace" })}</option>
            {workspaceOptions.map((option) => (
              <option key={option.id} value={option.id} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedWorkspaceOption ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.panelLabel}>{pickText(locale, { ko: "워크스페이스 요약", en: "Workspace summary" })}</p>
              <h3>{selectedWorkspaceOption.unresolved ? pickText(locale, { ko: "해결되지 않은 workspace ref", en: "Unresolved workspace ref" }) : selectedWorkspaceOption.label}</h3>
            </div>
          </div>
          <ul className={styles.timeline}>
            <li>
              <div className={styles.timelineTopline}>
                <strong>{pickText(locale, { ko: "경로", en: "Path" })}</strong>
              </div>
              <p>{selectedWorkspaceOption.path}</p>
            </li>
            <li>
              <div className={styles.timelineTopline}>
                <strong>{pickText(locale, { ko: "상태", en: "Status" })}</strong>
              </div>
              <p>{localizeStatus(locale, selectedWorkspaceOption.status)} | {pickText(locale, { ko: "담당자", en: "owner" })} {selectedWorkspaceOption.owner}</p>
            </li>
            <li>
              <div className={styles.timelineTopline}>
                <strong>{pickText(locale, { ko: "연결 컨텍스트", en: "Linked context" })}</strong>
              </div>
              <p>
                {selectedWorkspaceOption.linkedRunId
                  ? `${pickText(locale, { ko: "런", en: "run" })} ${selectedWorkspaceOption.linkedRunId} | ${pickText(locale, { ko: "작업 참조", en: "task refs" })} ${selectedWorkspaceOption.taskCount}`
                  : `${pickText(locale, { ko: "미연결", en: "unlinked" })} | ${pickText(locale, { ko: "작업 참조", en: "task refs" })} ${selectedWorkspaceOption.taskCount}`}
              </p>
            </li>
          </ul>
          {selectedWorkspaceOption.unresolved ? (
            <p className={styles.helpText}>
              {pickText(locale, { ko: "이 작업은 아직 legacy workspace ref를 가리키고 있습니다. 아래에서 canonical workspace를 선택하고 저장해 마이그레이션을 완료하세요.", en: "This task still points at a legacy workspace ref. Choose a canonical workspace below and save to complete the migration." })}
            </p>
          ) : null}
        </section>
      ) : null}
      <label className={styles.noteLabel}>
        <span>{pickText(locale, { ko: "목표", en: "Objective" })}</span>
        <textarea value={draft.objective} onChange={(event) => onChange({ ...draft, objective: event.target.value })} rows={4} />
      </label>
      <label className={styles.noteLabel}>
        <span>{pickText(locale, { ko: "차단 사유", en: "Blocked reason" })}</span>
        <input value={draft.blockedReason} onChange={(event) => onChange({ ...draft, blockedReason: event.target.value })} />
      </label>
      <label className={styles.noteLabel}>
        <span>{pickText(locale, { ko: "완료 기준", en: "Acceptance" })}</span>
        <textarea value={draft.acceptance} onChange={(event) => onChange({ ...draft, acceptance: event.target.value })} rows={3} placeholder={pickText(locale, { ko: "한 줄에 하나씩 입력", en: "one item per line" })} />
      </label>
      {changePreview.length > 0 || approvalHint ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.panelLabel}>{pickText(locale, { ko: "변경 힌트", en: "Mutation hints" })}</p>
              <h3>{pickText(locale, { ko: "저장 시 변경되는 내용", en: "What will change if you save" })}</h3>
            </div>
          </div>
          {changePreview.length > 0 ? (
            <ul className={styles.timeline}>
              <li>
                <div className={styles.timelineTopline}>
                  <strong>{pickText(locale, { ko: "변경 필드", en: "Changed fields" })}</strong>
                </div>
                <p>{changePreview.join(" | ")}</p>
              </li>
              {sensitiveChangePreview.length > 0 ? (
                <li>
                  <div className={styles.timelineTopline}>
                    <strong>{pickText(locale, { ko: "승인 민감 필드", en: "Approval-sensitive fields" })}</strong>
                  </div>
                  <p>{sensitiveChangePreview.join(" | ")}</p>
                </li>
              ) : null}
            </ul>
          ) : null}
          {approvalHint ? <p className={styles.helpText}>{approvalHint}</p> : null}
        </section>
      ) : null}
      {error ? <ErrorDisplay message={error} /> : null}
      <div className={styles.actions}>
        <Button variant="primary" type="button" onClick={onSubmit}>
          {mode === "create"
            ? pickText(locale, { ko: "작업 생성", en: "Create task" })
            : pickText(locale, { ko: "작업 저장", en: "Save task" })}
        </Button>
      </div>
    </section>
  );
}
