import React from "react";
import stageStyles from "../office-stage.module.css";

export function TaskNode({
  taskId,
  tone,
  left,
  top,
}: {
  taskId: string;
  tone: "danger" | "warning" | "info" | "neutral";
  left: number;
  top: number;
}) {
  return (
    <span
      className={[stageStyles["office-task-node"], stageStyles[`tone-${tone}`]].join(" ")}
      style={{ "--node-left": `${left}%`, "--node-top": `${top}%` } as React.CSSProperties}
      title={`${taskId} / ${tone}`}
    >
      <span className={stageStyles["office-task-node-dot"]} aria-hidden="true" />
    </span>
  );
}
