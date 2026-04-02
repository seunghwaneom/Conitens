import React from "react";
import stageStyles from "../office-stage.module.css";

function getPulseClass(state: string | undefined, tone: string): string {
  if (state === "blocked") return "task-pulse-danger";
  if (state === "review") return "task-pulse-info";
  if (state === "active") return "task-pulse-warning";
  return `task-pulse-${tone}`;
}

export function TaskNode({
  taskId,
  tone,
  state,
  left,
  top,
}: {
  taskId: string;
  tone: "danger" | "warning" | "info" | "neutral";
  state?: string;
  left: number;
  top: number;
}) {
  return (
    <span
      className={[
        stageStyles["office-task-node"],
        stageStyles[`tone-${tone}`],
        stageStyles[getPulseClass(state, tone)],
      ].join(" ")}
      style={{ left: `${left}%`, top: `${top}%` }}
      data-task-label={`${taskId}${state ? ` / ${state}` : ""}`}
    >
      <span className={stageStyles["office-task-node-dot"]} aria-hidden="true" />
    </span>
  );
}
