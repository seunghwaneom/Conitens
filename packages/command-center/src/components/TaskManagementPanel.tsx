/**
 * TaskManagementPanel.tsx — Floating modal overlay for task management.
 *
 * Sub-AC 7b: Task management controls (create / cancel / reprioritize)
 * accessible from 3D room or agent context.
 *
 * Three operation modes — each driven by `useTaskManagementStore`:
 *
 *   CREATE  — A structured form for creating a new task. Pre-fills the
 *              assignee when opened from an agent context, or leaves it
 *              unset when opened from a room context.  On submit, emits
 *              a `task.create` orchestration_command with the task payload.
 *
 *   CANCEL  — Confirmation dialog showing task title + optional reason
 *              text input.  On confirm, emits a `task.cancel` command.
 *
 *   REPRIORITIZE — Four-button priority picker (Critical / High / Normal / Low).
 *              On selection, emits a `task.update_spec` command with the
 *              new priority field.  Current priority is pre-highlighted.
 *
 * Design
 * ──────
 * Dark command-center aesthetic (matching HUD.tsx style constants).
 * Keyboard accessible: Escape closes without action, Enter submits form.
 * Optimistic UI: task-store is updated immediately before the command
 * round-trip completes (see use-action-dispatcher.ts).
 *
 * Record transparency
 * ────────────────────
 * Every open/close/submit/cancel event is recorded in the
 * `useTaskManagementStore.panelEvents` append-only log (UI audit trail).
 * Actual orchestration_commands are written by `handleTaskAction()` from
 * `useActionDispatcher`, which uses `useCommandFileWriter` internally.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  useTaskManagementStore,
  type TaskManagementMode,
} from "../hooks/use-task-management.js";
import { useActionDispatcher } from "../hooks/use-action-dispatcher.js";
import { useAgentStore } from "../store/agent-store.js";
import { useTaskStore } from "../store/task-store.js";
import {
  TASK_PRIORITY_COLOR,
  TASK_PRIORITY_LABEL,
  type TaskPriority,
  TERMINAL_TASK_STATES,
} from "../data/task-types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Priority ordering + meta
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: TaskPriority[] = ["critical", "high", "normal", "low"];

const PRIORITY_ICONS: Record<TaskPriority, string> = {
  critical: "🔴",
  high:     "🟠",
  normal:   "🔵",
  low:      "⚪",
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared style tokens (dark command-center palette)
// ─────────────────────────────────────────────────────────────────────────────

const FONT = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

const BASE_PANEL: React.CSSProperties = {
  position:       "fixed",
  zIndex:         8888,
  background:     "rgba(8, 10, 16, 0.97)",
  border:         "1px solid rgba(100, 180, 255, 0.3)",
  borderRadius:   6,
  boxShadow:      "0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(100,180,255,0.08)",
  fontFamily:     FONT,
  fontSize:       12,
  color:          "#ccd4e0",
  padding:        "18px 20px 16px",
  minWidth:       340,
  maxWidth:       420,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const PANEL_HEADER: React.CSSProperties = {
  display:       "flex",
  alignItems:    "center",
  justifyContent: "space-between",
  marginBottom:  14,
  paddingBottom: 10,
  borderBottom:  "1px solid rgba(100, 180, 255, 0.12)",
};

const PANEL_TITLE: React.CSSProperties = {
  fontSize:      13,
  fontWeight:    700,
  color:         "#aaaacc",
  letterSpacing: "0.08em",
};

const CLOSE_BTN: React.CSSProperties = {
  background:    "transparent",
  border:        "none",
  color:         "#555577",
  cursor:        "pointer",
  fontSize:      16,
  lineHeight:    1,
  padding:       "0 2px",
  fontFamily:    FONT,
};

const LABEL: React.CSSProperties = {
  display:       "block",
  fontSize:      9,
  color:         "#555577",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  marginBottom:  4,
  marginTop:     10,
};

const INPUT: React.CSSProperties = {
  width:          "100%",
  background:     "rgba(20, 22, 36, 0.9)",
  border:         "1px solid rgba(100, 180, 255, 0.2)",
  borderRadius:   3,
  color:          "#ccd4e0",
  fontFamily:     FONT,
  fontSize:       11,
  padding:        "5px 8px",
  outline:        "none",
  boxSizing:      "border-box" as const,
  transition:     "border-color 120ms ease",
};

const TEXTAREA: React.CSSProperties = {
  ...INPUT,
  resize:         "vertical" as const,
  minHeight:      60,
};

const SELECT: React.CSSProperties = {
  ...INPUT,
  cursor:         "pointer",
  appearance:     "none" as const,
};

const BTN_ROW: React.CSSProperties = {
  display:        "flex",
  gap:            6,
  marginTop:      16,
  justifyContent: "flex-end",
};

function baseBtn(variant: "primary" | "danger" | "ghost"): React.CSSProperties {
  const colors = {
    primary: {
      bg:     "rgba(74, 106, 255, 0.18)",
      border: "rgba(74, 106, 255, 0.45)",
      color:  "#7799ff",
    },
    danger: {
      bg:     "rgba(255, 61, 0, 0.14)",
      border: "rgba(255, 61, 0, 0.4)",
      color:  "#ff5555",
    },
    ghost: {
      bg:     "transparent",
      border: "rgba(100, 180, 255, 0.15)",
      color:  "#555577",
    },
  };
  const c = colors[variant];
  return {
    background:    c.bg,
    border:        `1px solid ${c.border}`,
    borderRadius:  3,
    color:         c.color,
    fontFamily:    FONT,
    fontSize:      10,
    letterSpacing: "0.08em",
    padding:       "5px 12px",
    cursor:        "pointer",
    textTransform: "uppercase" as const,
    transition:    "background 100ms ease, border-color 100ms ease",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-panel: Create Task Form
// ─────────────────────────────────────────────────────────────────────────────

function CreateTaskForm({
  onSubmit,
  onClose,
  defaultAgentId,
}: {
  onSubmit: (data: {
    title: string;
    description: string;
    priority: TaskPriority;
    assignTo: string;
    tags: string;
  }) => void;
  onClose: () => void;
  defaultAgentId: string;
}) {
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [priority,    setPriority]    = useState<TaskPriority>("normal");
  const [assignTo,    setAssignTo]    = useState(defaultAgentId);
  const [tags,        setTags]        = useState("");
  const [titleError,  setTitleError]  = useState("");

  const agents = useAgentStore((s) => s.agents);
  const agentList = Object.values(agents).filter(
    (a) => a.status !== "terminated" && a.status !== "inactive",
  );

  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-focus title field when form opens
  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!title.trim()) {
        setTitleError("Title is required");
        titleRef.current?.focus();
        return;
      }
      setTitleError("");
      onSubmit({ title: title.trim(), description, priority, assignTo, tags });
    },
    [title, description, priority, assignTo, tags, onSubmit],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-label="Create task">
      <form onSubmit={handleSubmit} noValidate>
        {/* Title */}
        <label style={LABEL} htmlFor="tm-title">TITLE *</label>
        <input
          ref={titleRef}
          id="tm-title"
          type="text"
          placeholder="Task title…"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleError(""); }}
          style={{
            ...INPUT,
            borderColor: titleError ? "rgba(255, 61, 0, 0.6)" : "rgba(100, 180, 255, 0.2)",
          }}
          maxLength={120}
          autoComplete="off"
        />
        {titleError && (
          <div style={{ color: "#ff5555", fontSize: 9, marginTop: 3 }}>{titleError}</div>
        )}

        {/* Description */}
        <label style={LABEL} htmlFor="tm-desc">DESCRIPTION</label>
        <textarea
          id="tm-desc"
          placeholder="Optional — what needs to be done?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={TEXTAREA}
          rows={2}
          maxLength={500}
        />

        {/* Priority */}
        <label style={LABEL}>PRIORITY</label>
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              style={{
                flex:          1,
                background:    priority === p
                  ? `${TASK_PRIORITY_COLOR[p]}22`
                  : "rgba(20, 22, 36, 0.8)",
                border:        `1px solid ${priority === p ? TASK_PRIORITY_COLOR[p] : "rgba(100,180,255,0.12)"}`,
                borderRadius:  3,
                color:         priority === p ? TASK_PRIORITY_COLOR[p] : "#555577",
                fontFamily:    FONT,
                fontSize:      9,
                padding:       "4px 0",
                cursor:        "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                transition:    "background 100ms, border-color 100ms, color 100ms",
              }}
              title={TASK_PRIORITY_LABEL[p]}
              aria-pressed={priority === p}
            >
              {PRIORITY_ICONS[p]} {p}
            </button>
          ))}
        </div>

        {/* Assignee */}
        {agentList.length > 0 && (
          <>
            <label style={LABEL} htmlFor="tm-assignee">ASSIGN TO (OPTIONAL)</label>
            <select
              id="tm-assignee"
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              style={SELECT}
            >
              <option value="">— Unassigned —</option>
              {agentList.map((a) => (
                <option key={a.def.agentId} value={a.def.agentId}>
                  {a.def.visual.icon} {a.def.name} ({a.status})
                </option>
              ))}
            </select>
          </>
        )}

        {/* Tags */}
        <label style={LABEL} htmlFor="tm-tags">TAGS (COMMA-SEPARATED)</label>
        <input
          id="tm-tags"
          type="text"
          placeholder="e.g.  bug, refactor, frontend"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          style={INPUT}
          autoComplete="off"
        />

        {/* Buttons */}
        <div style={BTN_ROW}>
          <button type="button" onClick={onClose} style={baseBtn("ghost")}>
            Cancel
          </button>
          <button
            type="submit"
            style={baseBtn("primary")}
            disabled={!title.trim()}
          >
            ⊕ Create Task
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-panel: Cancel Task Confirmation
// ─────────────────────────────────────────────────────────────────────────────

function CancelTaskConfirm({
  taskId,
  taskTitle,
  onConfirm,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("user_requested");
  const reasonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => reasonRef.current?.focus(), 50);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Enter" && e.metaKey) {
        onConfirm(reason);
      }
    },
    [onClose, onConfirm, reason],
  );

  return (
    <div onKeyDown={handleKeyDown} role="alertdialog" aria-modal="true" aria-label="Cancel task confirmation">
      {/* Task badge */}
      <div style={{
        background:   "rgba(255, 61, 0, 0.06)",
        border:       "1px solid rgba(255, 61, 0, 0.2)",
        borderRadius: 3,
        padding:      "8px 10px",
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 9, color: "#555577", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
          TASK TO CANCEL
        </div>
        <div style={{ color: "#ccd4e0", fontWeight: 600, fontSize: 12 }}>
          {taskTitle}
        </div>
        <div style={{ fontSize: 9, color: "#444466", marginTop: 2 }}>
          ID: {taskId}
        </div>
      </div>

      <p style={{ fontSize: 11, color: "#888899", margin: "0 0 12px" }}>
        This will mark the task as{" "}
        <span style={{ color: "#ff5555" }}>CANCELLED</span>.
        The action is event-sourced and traceable.
      </p>

      <label style={LABEL} htmlFor="tm-cancel-reason">REASON (OPTIONAL)</label>
      <input
        ref={reasonRef}
        id="tm-cancel-reason"
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={INPUT}
        placeholder="user_requested"
        autoComplete="off"
        maxLength={120}
      />

      <div style={{ fontSize: 9, color: "#333355", marginTop: 4 }}>
        Tip: ⌘+Enter to confirm quickly
      </div>

      <div style={BTN_ROW}>
        <button type="button" onClick={onClose} style={baseBtn("ghost")}>
          Keep task
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason)}
          style={baseBtn("danger")}
        >
          ⊗ Cancel Task
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-panel: Reprioritize Task
// ─────────────────────────────────────────────────────────────────────────────

function ReprioritizeTaskPanel({
  taskId,
  taskTitle,
  currentPriority,
  onSelect,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  currentPriority: TaskPriority;
  onSelect: (newPriority: TaskPriority) => void;
  onClose: () => void;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-label="Reprioritize task">
      {/* Task badge */}
      <div style={{
        background:   "rgba(100, 180, 255, 0.05)",
        border:       "1px solid rgba(100, 180, 255, 0.15)",
        borderRadius: 3,
        padding:      "8px 10px",
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 9, color: "#555577", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
          TASK
        </div>
        <div style={{ color: "#ccd4e0", fontWeight: 600, fontSize: 12 }}>
          {taskTitle}
        </div>
        <div style={{ fontSize: 9, color: "#444466", marginTop: 2 }}>
          ID: {taskId} · Current: {TASK_PRIORITY_LABEL[currentPriority]}
        </div>
      </div>

      <div style={{ fontSize: 9, color: "#555577", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
        SELECT NEW PRIORITY
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {PRIORITY_ORDER.map((p) => {
          const isCurrent = p === currentPriority;
          const color = TASK_PRIORITY_COLOR[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => onSelect(p)}
              disabled={isCurrent}
              style={{
                display:       "flex",
                alignItems:    "center",
                gap:           10,
                background:    isCurrent ? `${color}18` : "rgba(20, 22, 36, 0.8)",
                border:        `1px solid ${isCurrent ? color : "rgba(100,180,255,0.12)"}`,
                borderRadius:  3,
                color:         isCurrent ? color : "#8888aa",
                fontFamily:    FONT,
                fontSize:      11,
                padding:       "7px 10px",
                cursor:        isCurrent ? "default" : "pointer",
                textAlign:     "left",
                transition:    "background 100ms, border-color 100ms, color 100ms",
                opacity:       isCurrent ? 0.7 : 1,
              }}
              title={isCurrent ? "Already at this priority" : `Set to ${TASK_PRIORITY_LABEL[p]}`}
              aria-pressed={isCurrent}
            >
              <span style={{ fontSize: 14 }}>{PRIORITY_ICONS[p]}</span>
              <span style={{ flex: 1, letterSpacing: "0.05em" }}>
                {TASK_PRIORITY_LABEL[p]}
              </span>
              {isCurrent && (
                <span style={{ fontSize: 9, color: color, letterSpacing: "0.08em" }}>
                  ← CURRENT
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={BTN_ROW}>
        <button type="button" onClick={onClose} style={baseBtn("ghost")}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root: TaskManagementPanel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `TaskManagementPanel` — mount once inside `<HUD>`.
 *
 * Renders null when `mode === null` (panel closed).  When open, renders as
 * a centred fixed overlay with a backdrop click-away handler.
 *
 * All three operation modes (create / cancel / reprioritize) dispatch
 * orchestration_commands via `useActionDispatcher().handleTaskAction()`.
 */
export function TaskManagementPanel() {
  const {
    mode,
    originType,
    originId,
    targetTaskId,
    targetTaskTitle,
    targetTaskStatus,
    targetTaskPriority,
    close,
    recordPanelEvent,
  } = useTaskManagementStore();

  const dispatcher = useActionDispatcher();
  const panelRef   = useRef<HTMLDivElement>(null);

  // ESC key global listener
  useEffect(() => {
    if (mode === null) return;
    function handleGlobalKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        recordPanelEvent("panel.cancelled_by_user", { mode });
        close();
      }
    }
    document.addEventListener("keydown", handleGlobalKey, true);
    return () => document.removeEventListener("keydown", handleGlobalKey, true);
  }, [mode, close, recordPanelEvent]);

  // Backdrop click handler
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        recordPanelEvent("panel.cancelled_by_user", { mode });
        close();
      }
    },
    [close, mode, recordPanelEvent],
  );

  if (mode === null) return null;

  // ── Panel title by mode ──────────────────────────────────────────────────

  const PANEL_TITLES: Record<NonNullable<TaskManagementMode>, string> = {
    create:       "⊕ NEW TASK",
    cancel:       "⊗ CANCEL TASK",
    reprioritize: "↕ REPRIORITIZE TASK",
  };

  // ── Create Task handler ──────────────────────────────────────────────────

  const handleCreateSubmit = useCallback(
    async (data: {
      title: string;
      description: string;
      priority: TaskPriority;
      assignTo: string;
      tags: string;
    }) => {
      const taskId = `task-${Date.now()}-gui`;
      const parsedTags = data.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      recordPanelEvent("panel.submitted_create", {
        taskId,
        title: data.title,
        priority: data.priority,
        assignTo: data.assignTo || null,
        tagCount: parsedTags.length,
      });

      // Optimistic store mutation (instant UI feedback)
      useTaskStore.getState().createTask({
        title:           data.title,
        description:     data.description || undefined,
        priority:        data.priority,
        assignedAgentId: data.assignTo || undefined,
        tags:            parsedTags,
      });

      // Emit orchestration_command via dispatcher → command file writer
      await dispatcher.handleTaskAction(taskId, "create", {
        task_id:     taskId,
        title:       data.title,
        description: data.description || undefined,
        assigned_to: data.assignTo || undefined,
        priority:    priorityToProtocolNum(data.priority),
        metadata: {
          tags:        parsedTags,
          origin_type: originType,
          origin_id:   originId,
        },
      });

      close();
    },
    [dispatcher, originType, originId, close, recordPanelEvent],
  );

  // ── Cancel Task handler ──────────────────────────────────────────────────

  const handleCancelConfirm = useCallback(
    async (reason: string) => {
      if (!targetTaskId || !targetTaskStatus) return;

      // Guard: non-cancellable terminal tasks
      if (TERMINAL_TASK_STATES.has(targetTaskStatus)) {
        console.warn(
          `[TaskManagementPanel] Task ${targetTaskId} is already terminal (${targetTaskStatus}); cannot cancel.`,
        );
        close();
        return;
      }

      recordPanelEvent("panel.submitted_cancel", {
        taskId: targetTaskId,
        reason,
      });

      // Optimistic store mutation
      useTaskStore.getState().transitionTask(targetTaskId, "cancelled");

      // Emit orchestration_command
      await dispatcher.handleTaskAction(targetTaskId, "cancel", {
        task_id: targetTaskId,
        reason:  reason || "user_requested",
      });

      close();
    },
    [targetTaskId, targetTaskStatus, dispatcher, close, recordPanelEvent],
  );

  // ── Reprioritize Task handler ────────────────────────────────────────────

  const handleReprioritizeSelect = useCallback(
    async (newPriority: TaskPriority) => {
      if (!targetTaskId) return;

      recordPanelEvent("panel.submitted_reprioritize", {
        taskId:      targetTaskId,
        newPriority,
        prevPriority: targetTaskPriority,
      });

      // Optimistic store mutation
      useTaskStore.getState().setTaskPriority(targetTaskId, newPriority);

      // Emit orchestration_command via update_spec
      await dispatcher.handleTaskAction(targetTaskId, "update_spec", {
        task_id:  targetTaskId,
        priority: priorityToProtocolNum(newPriority),
      });

      close();
    },
    [targetTaskId, targetTaskPriority, dispatcher, close, recordPanelEvent],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    /* Backdrop */
    <div
      onClick={handleBackdropClick}
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         8887,
        background:     "rgba(0, 0, 0, 0.5)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
    >
      {/* Panel */}
      <div ref={panelRef} style={BASE_PANEL}>
        {/* Header */}
        <div style={PANEL_HEADER}>
          <div style={PANEL_TITLE}>{PANEL_TITLES[mode]}</div>
          <button
            type="button"
            onClick={() => {
              recordPanelEvent("panel.cancelled_by_user", { mode });
              close();
            }}
            style={CLOSE_BTN}
            title="Close (Esc)"
            aria-label="Close task management panel"
          >
            ✕
          </button>
        </div>

        {/* Origin context badge (for "create" from agent/room) */}
        {mode === "create" && originId && (
          <div style={{
            fontSize:     9,
            color:        "#444466",
            letterSpacing: "0.08em",
            marginBottom: 10,
            background:   "rgba(100, 180, 255, 0.04)",
            border:       "1px solid rgba(100, 180, 255, 0.08)",
            borderRadius: 3,
            padding:      "4px 8px",
          }}>
            <span style={{ color: "#4a6aff" }}>
              {originType === "agent" ? "⬡" : "⊟"}
            </span>{" "}
            Context: {originType?.toUpperCase()} · {originId}
          </div>
        )}

        {/* Mode-specific content */}
        {mode === "create" && (
          <CreateTaskForm
            onSubmit={handleCreateSubmit}
            onClose={() => {
              recordPanelEvent("panel.cancelled_by_user", { mode });
              close();
            }}
            defaultAgentId={originType === "agent" ? (originId ?? "") : ""}
          />
        )}

        {mode === "cancel" && targetTaskId && targetTaskTitle && targetTaskStatus && (
          <CancelTaskConfirm
            taskId={targetTaskId}
            taskTitle={targetTaskTitle}
            onConfirm={handleCancelConfirm}
            onClose={() => {
              recordPanelEvent("panel.cancelled_by_user", { mode });
              close();
            }}
          />
        )}

        {mode === "reprioritize" && targetTaskId && targetTaskTitle && targetTaskPriority && (
          <ReprioritizeTaskPanel
            taskId={targetTaskId}
            taskTitle={targetTaskTitle}
            currentPriority={targetTaskPriority}
            onSelect={handleReprioritizeSelect}
            onClose={() => {
              recordPanelEvent("panel.cancelled_by_user", { mode });
              close();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert local TaskPriority string → protocol numeric priority (1–4).
 * Protocol: 1 = lowest (low), 5 = highest (critical); we use 1-4 range.
 *   critical → 4, high → 3, normal → 2, low → 1
 */
function priorityToProtocolNum(p: TaskPriority): 1 | 2 | 3 | 4 | 5 {
  const map: Record<TaskPriority, 1 | 2 | 3 | 4 | 5> = {
    critical: 4,
    high:     3,
    normal:   2,
    low:      1,
  };
  return map[p];
}
