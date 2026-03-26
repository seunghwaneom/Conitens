import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEventStore } from "../store/event-store.js";
import { isValidTransition } from "../utils.js";
import type { TaskState as TaskStateType } from "../store/event-store.js";

const COLUMNS: { id: string; label: string; color: string }[] = [
  { id: "draft", label: "Draft", color: "#6b7280" },
  { id: "planned", label: "Planned", color: "#9ca3af" },
  { id: "assigned", label: "Assigned", color: "#f59e0b" },
  { id: "active", label: "Active", color: "#22c55e" },
  { id: "blocked", label: "Blocked", color: "#ef4444" },
  { id: "review", label: "Review", color: "#0ea5e9" },
  { id: "done", label: "Done", color: "#16a34a" },
  { id: "failed", label: "Failed", color: "#b91c1c" },
  { id: "cancelled", label: "Cancelled", color: "#6b7280" },
];

export function KanbanBoard({
  tasks,
  onSelectTask,
}: {
  tasks: TaskStateType[];
  onSelectTask?: (taskId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const newState = over.id as string;
    const task = tasks.find((item) => item.taskId === taskId);
    if (task && task.state !== newState) {
      if (!isValidTransition(task.state, newState)) return;
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

  const activeTask = activeId ? tasks.find((task) => task.taskId === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="kanban-board">
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            label={column.label}
            color={column.color}
            count={tasks.filter((task) => task.state === column.id).length}
          >
            {tasks
              .filter((task) => task.state === column.id)
              .map((task) => (
                <TaskCard key={task.taskId} task={task} onSelect={onSelectTask} />
              ))}
          </KanbanColumn>
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="task-card is-dragging">
            <div className="task-card-title">{activeTask.taskId}</div>
            {activeTask.assignee ? (
              <div className="task-card-meta">{activeTask.assignee}</div>
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  id,
  label,
  color,
  count,
  children,
}: {
  id: string;
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <section ref={setNodeRef} className={`kanban-column${isOver ? " is-over" : ""}`} role="region" aria-label={label}>
      <div className="kanban-column-header" style={{ borderTop: `2px solid ${color}` }}>
        <span>{label}</span>
        <span className="kanban-column-count">{count}</span>
      </div>
      <div className="kanban-list">
        {count === 0 ? <div className="kanban-empty animated">No tasks yet...</div> : children}
      </div>
    </section>
  );
}

function TaskCard({ task, onSelect }: { task: TaskStateType; onSelect?: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.taskId,
  });

  const style = { transform: CSS.Translate.toString(transform) } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card${isDragging ? " is-dragging" : ""}`}
      {...listeners}
      {...attributes}
    >
      <div
        className="task-card-title task-card-link"
        onClick={(e) => { e.stopPropagation(); onSelect?.(task.taskId); }}
      >
        {task.taskId}
      </div>
      <div className="task-card-meta">{task.assignee ?? "unassigned"}</div>
    </div>
  );
}
