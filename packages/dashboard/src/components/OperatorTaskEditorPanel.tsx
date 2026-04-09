import styles from './OperatorTaskEditorPanel.module.css';
import { Button, ErrorDisplay } from '../ds/index.js';

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
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.panelLabel}>Task editor</p>
          <h3>{mode === "create" ? "Create operator task" : "Edit operator task"}</h3>
        </div>
        <span className={styles.state}>{state}</span>
      </div>
      <div className={styles.form}>
        <label>
          <span>Title</span>
          <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
        </label>
        <label>
          <span>Status</span>
          <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value })}>
            {["backlog", "todo", "in_progress", "blocked", "in_review", "done", "cancelled"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select value={draft.priority} onChange={(event) => onChange({ ...draft, priority: event.target.value })}>
            {["low", "medium", "high", "critical"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Owner agent</span>
          <input value={draft.ownerAgentId} onChange={(event) => onChange({ ...draft, ownerAgentId: event.target.value })} />
        </label>
        <label>
          <span>Linked run</span>
          <input value={draft.linkedRunId} onChange={(event) => onChange({ ...draft, linkedRunId: event.target.value })} />
        </label>
        <label>
          <span>Linked iteration</span>
          <input value={draft.linkedIterationId} onChange={(event) => onChange({ ...draft, linkedIterationId: event.target.value })} />
        </label>
        <label>
          <span>Linked rooms</span>
          <input value={draft.linkedRoomIds} onChange={(event) => onChange({ ...draft, linkedRoomIds: event.target.value })} placeholder="comma-separated room ids" />
        </label>
        <label>
          <span>Workspace</span>
          <select value={draft.workspaceRef} onChange={(event) => onChange({ ...draft, workspaceRef: event.target.value })}>
            <option value="">No canonical workspace</option>
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
              <p className={styles.panelLabel}>Workspace summary</p>
              <h3>{selectedWorkspaceOption.unresolved ? "Unresolved workspace ref" : selectedWorkspaceOption.label}</h3>
            </div>
          </div>
          <ul className={styles.timeline}>
            <li>
              <div className={styles.timelineTopline}>
                <strong>Path</strong>
              </div>
              <p>{selectedWorkspaceOption.path}</p>
            </li>
            <li>
              <div className={styles.timelineTopline}>
                <strong>Status</strong>
              </div>
              <p>{selectedWorkspaceOption.status} | owner {selectedWorkspaceOption.owner}</p>
            </li>
            <li>
              <div className={styles.timelineTopline}>
                <strong>Linked context</strong>
              </div>
              <p>
                {selectedWorkspaceOption.linkedRunId
                  ? `run ${selectedWorkspaceOption.linkedRunId} | task refs ${selectedWorkspaceOption.taskCount}`
                  : `unlinked | task refs ${selectedWorkspaceOption.taskCount}`}
              </p>
            </li>
          </ul>
          {selectedWorkspaceOption.unresolved ? (
            <p className={styles.helpText}>
              This task still points at a legacy workspace ref. Choose a canonical workspace below and save to complete the migration.
            </p>
          ) : null}
        </section>
      ) : null}
      <label className={styles.noteLabel}>
        <span>Objective</span>
        <textarea value={draft.objective} onChange={(event) => onChange({ ...draft, objective: event.target.value })} rows={4} />
      </label>
      <label className={styles.noteLabel}>
        <span>Blocked reason</span>
        <input value={draft.blockedReason} onChange={(event) => onChange({ ...draft, blockedReason: event.target.value })} />
      </label>
      <label className={styles.noteLabel}>
        <span>Acceptance</span>
        <textarea value={draft.acceptance} onChange={(event) => onChange({ ...draft, acceptance: event.target.value })} rows={3} placeholder="one item per line" />
      </label>
      {changePreview.length > 0 || approvalHint ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.panelLabel}>Mutation hints</p>
              <h3>What will change if you save</h3>
            </div>
          </div>
          {changePreview.length > 0 ? (
            <ul className={styles.timeline}>
              <li>
                <div className={styles.timelineTopline}>
                  <strong>Changed fields</strong>
                </div>
                <p>{changePreview.join(" | ")}</p>
              </li>
              {sensitiveChangePreview.length > 0 ? (
                <li>
                  <div className={styles.timelineTopline}>
                    <strong>Approval-sensitive fields</strong>
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
          {mode === "create" ? "Create task" : "Save task"}
        </Button>
      </div>
    </section>
  );
}
