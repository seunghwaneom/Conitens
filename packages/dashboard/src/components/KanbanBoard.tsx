import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { useEventStore } from "../store/event-store.js";
import type { TaskState as TaskStateType } from "../store/event-store.js";

const COLUMNS: { id: string; label: string; color: string }[] = [
  { id: "draft", label: "Draft", color: "#64748b" },
  { id: "planned", label: "Planned", color: "#8b5cf6" },
  { id: "assigned", label: "Assigned", color: "#f59e0b" },
  { id: "active", label: "Active", color: "#3b82f6" },
  { id: "blocked", label: "Blocked", color: "#ef4444" },
  { id: "review", label: "Review", color: "#f97316" },
  { id: "done", label: "Done", color: "#22c55e" },
  { id: "failed", label: "Failed", color: "#dc2626" },
  { id: "cancelled", label: "Cancelled", color: "#6b7280" },
];

const columnStyle: React.CSSProperties = {
  minWidth: "160px",
  background: "#1e293b",
  borderRadius: "8px",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const cardStyle: React.CSSProperties = {
  background: "#0f172a",
  borderRadius: "6px",
  padding: "8px 12px",
  fontSize: "13px",
  cursor: "grab",
  border: "1px solid #334155",
};

export function KanbanBoard() {
  const { tasks } = useEventStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const newState = over.id as string;
    const task = tasks.find((t) => t.taskId === taskId);
    if (task && task.state !== newState) {
      // In a real app, this would submit a command to the orchestrator
      // For now, update the store directly for visual feedback
      useEventStore.getState().addEvent({
        event_id: `evt_drag_${Date.now()}`,
        type: "task.status_changed",
        ts: new Date().toISOString(),
        actor: { kind: "user", id: "dashboard" },
        task_id: taskId,
        payload: { to: newState },
      });
    }
  };

  const activeTask = activeId ? tasks.find((t) => t.taskId === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: "flex", gap: "12px", overflowX: "auto", padding: "16px" }}>
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.state === col.id);
          return (
            <KanbanColumn key={col.id} id={col.id} label={col.label} color={col.color}>
              {colTasks.map((task) => (
                <TaskCard key={task.taskId} task={task} />
              ))}
            </KanbanColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div style={{ ...cardStyle, opacity: 0.8, border: "1px solid #38bdf8" }}>
            <div style={{ fontWeight: 600 }}>{activeTask.taskId}</div>
            {activeTask.assignee && (
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>{activeTask.assignee}</div>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ id, label, color, children }: {
  id: string;
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} style={columnStyle}>
      <div style={{ fontWeight: 600, fontSize: "12px", color, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", minHeight: "60px" }}>
        {children}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: TaskStateType }) {
  return (
    <div id={task.taskId} style={cardStyle}>
      <div style={{ fontWeight: 600 }}>{task.taskId}</div>
      {task.assignee && (
        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{task.assignee}</div>
      )}
    </div>
  );
}
