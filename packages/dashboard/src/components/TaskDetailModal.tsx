import React, { useEffect, useRef } from "react";
import type { TaskState, EventRecord } from "../store/event-store.js";
import { getTaskTone } from "../utils.js";

export function TaskDetailModal({
  task,
  events,
  onClose,
}: {
  task: TaskState;
  events: EventRecord[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    // Focus the dialog itself initially
    dialog.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = Array.from(dialog!.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const taskEvents = events
    .filter((e) => e.task_id === task.taskId)
    .slice(-20)
    .reverse();

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <p className="panel-kicker">TASK_DETAIL</p>
            <h2 id="task-detail-title" className="modal-title">{task.taskId}</h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close dialog">
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-meta-grid">
            <div className="modal-meta-item">
              <span className="status-card-label">state</span>
              <span className={`state-pill ${getTaskTone(task.state)}`}>
                {task.state}
              </span>
            </div>
            <div className="modal-meta-item">
              <span className="status-card-label">assignee</span>
              <strong>{task.assignee ?? "unassigned"}</strong>
            </div>
          </div>

          <div className="modal-section">
            <p className="panel-kicker">EVENT_HISTORY</p>
            {taskEvents.length === 0 ? (
              <div className="empty-state compact">No events for this task</div>
            ) : (
              <div className="stack">
                {taskEvents.map((event) => (
                  <div key={event.event_id} className="modal-event-row">
                    <span className="event-time">{event.ts.slice(11, 19)}</span>
                    <strong>{event.type}</strong>
                    <span className="muted">{event.actor.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
