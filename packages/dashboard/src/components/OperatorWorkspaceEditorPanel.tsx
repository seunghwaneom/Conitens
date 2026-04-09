import { Button, ErrorDisplay } from '../ds/index.js';
import type { OperatorWorkspaceDraft } from "../operator-workspace-actions.js";
import styles from './OperatorWorkspaceEditorPanel.module.css';

type PanelState = "idle" | "loading" | "ready" | "error";

interface OperatorWorkspaceEditorPanelProps {
  mode: "create" | "edit";
  draft: OperatorWorkspaceDraft;
  state: PanelState;
  error: string | null;
  onChange: (draft: OperatorWorkspaceDraft) => void;
  onSubmit: () => void;
}

export function OperatorWorkspaceEditorPanel({
  mode,
  draft,
  state,
  error,
  onChange,
  onSubmit,
}: OperatorWorkspaceEditorPanelProps) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.panelLabel}>Workspace editor</p>
          <h3>{mode === "create" ? "Create operator workspace" : "Edit operator workspace"}</h3>
        </div>
        <span className={styles.state} data-state={state}>{state}</span>
      </div>
      <div className={styles.form}>
        <label>
          <span>Label</span>
          <input value={draft.label} onChange={(event) => onChange({ ...draft, label: event.target.value })} />
        </label>
        <label>
          <span>Path</span>
          <input value={draft.path} onChange={(event) => onChange({ ...draft, path: event.target.value })} />
        </label>
        <label>
          <span>Kind</span>
          <select value={draft.kind} onChange={(event) => onChange({ ...draft, kind: event.target.value })}>
            {["repo", "branch", "scratch", "review"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value })}>
            {["active", "idle", "blocked", "archived"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Archive rationale</span>
          <input value={draft.archiveNote} onChange={(event) => onChange({ ...draft, archiveNote: event.target.value })} />
        </label>
        <p className={styles.helpText}>Required when archiving, including the quick-archive action on workspace detail.</p>
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
      </div>
      {draft.taskIds.trim() ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.panelLabel}>Derived membership</p>
              <h3>Linked task refs</h3>
            </div>
          </div>
          <p className={styles.helpText}>{draft.taskIds}</p>
          <p className={styles.helpText}>Task refs are derived from task records and are not edited directly here.</p>
        </section>
      ) : null}
      <label className={styles.noteLabel}>
        <span>Notes</span>
        <textarea value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} rows={3} />
      </label>
      {error ? <ErrorDisplay message={error} /> : null}
      <div className={styles.actions}>
        <Button variant="primary" type="button" onClick={onSubmit}>
          {mode === "create" ? "Create workspace" : "Save workspace"}
        </Button>
      </div>
    </section>
  );
}
