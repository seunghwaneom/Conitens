/**
 * @module reducers
 * RFC-1.0.1 §11 — TaskReducer: owns tasks/*.md and views/TASKS.md.
 *
 * Invariants enforced:
 *   I-7: Only writes to tasks/*.md and views/TASKS.md (never task-specs/).
 *   Uses canTransition() from @conitens/protocol for all state transitions.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConitensEvent, TaskState } from "@conitens/protocol";
import { canTransition } from "@conitens/protocol";
import type { BaseReducer } from "./base-reducer.js";
import { validateId } from "../utils/safe-path.js";

interface TaskRecord {
  taskId: string;
  state: TaskState;
  assignee?: string;
  artifacts: string[];
  history: Array<{ ts: string; type: string; actor: string }>;
}

export class TaskReducer implements BaseReducer {
  readonly name = "TaskReducer";
  readonly inputEvents = [
    "task.created",
    "task.assigned",
    "task.status_changed",
    "task.spec_updated",
    "task.artifact_added",
    "task.completed",
    "task.failed",
    "task.cancelled",
  ];

  /** In-memory state rebuilt from events (for replay support). */
  private tasks = new Map<string, TaskRecord>();

  async reduce(event: ConitensEvent, conitensDir: string): Promise<void> {
    if (!event.type.startsWith("task.")) return;

    const taskId = event.task_id ?? (event.payload.task_id as string | undefined);
    if (!taskId) return;
    validateId(taskId, "task_id");

    switch (event.type) {
      case "task.created":
        this.tasks.set(taskId, {
          taskId,
          state: "draft",
          artifacts: [],
          history: [],
        });
        break;

      case "task.assigned": {
        const task = this.tasks.get(taskId);
        if (!task) return;
        // draft → planned → assigned: auto-step through planned if needed
        if (task.state === "draft") {
          task.state = "planned";
        }
        if (canTransition(task.state, "assigned")) {
          task.state = "assigned";
        }
        task.assignee = event.payload.assignee as string | undefined;
        break;
      }

      case "task.status_changed": {
        const task = this.tasks.get(taskId);
        if (!task) return;
        const newState = event.payload.to as TaskState | undefined;
        if (newState && canTransition(task.state, newState)) {
          task.state = newState;
        }
        break;
      }

      case "task.completed": {
        const task = this.tasks.get(taskId);
        if (!task) return;
        if (canTransition(task.state, "done")) {
          task.state = "done";
        }
        break;
      }

      case "task.failed": {
        const task = this.tasks.get(taskId);
        if (!task) return;
        if (canTransition(task.state, "failed")) {
          task.state = "failed";
        }
        break;
      }

      case "task.cancelled": {
        const task = this.tasks.get(taskId);
        if (!task) return;
        if (canTransition(task.state, "cancelled")) {
          task.state = "cancelled";
        }
        break;
      }

      case "task.artifact_added": {
        const task = this.tasks.get(taskId);
        if (!task) return;
        const artifact = event.payload.path as string | undefined;
        if (artifact) task.artifacts.push(artifact);
        break;
      }

      case "task.spec_updated":
        // TaskReducer does NOT modify task-specs/ (I-7: read-only reference).
        // No-op: spec updates are tracked in history only.
        break;
    }

    // Append to history for every handled event.
    const task = this.tasks.get(taskId);
    if (task) {
      task.history.push({
        ts: event.ts,
        type: event.type,
        actor: event.actor.id,
      });
      await this.writeTaskFile(taskId, conitensDir);
    }

    await this.writeTasksView(conitensDir);
  }

  private async writeTaskFile(taskId: string, conitensDir: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const tasksDir = join(conitensDir, "tasks");
    await mkdir(tasksDir, { recursive: true });

    const lines: string[] = [
      "---",
      "owner: TaskReducer",
      `task_id: ${task.taskId}`,
      `state: ${task.state}`,
    ];
    if (task.assignee) lines.push(`assignee: ${task.assignee}`);
    lines.push("---", "", `# ${task.taskId}`, "", `**State**: ${task.state}`);
    if (task.assignee) lines.push(`**Assignee**: ${task.assignee}`);
    if (task.artifacts.length > 0) {
      lines.push("", "## Artifacts", ...task.artifacts.map((a) => `- ${a}`));
    }
    lines.push("", "## History", ...task.history.map((h) => `- [${h.ts}] ${h.type} by ${h.actor}`));

    await writeFile(join(tasksDir, `${taskId}.md`), lines.join("\n") + "\n");
  }

  private async writeTasksView(conitensDir: string): Promise<void> {
    const viewsDir = join(conitensDir, "views");
    await mkdir(viewsDir, { recursive: true });

    const lines = ["# Tasks", ""];
    for (const [, task] of this.tasks) {
      const assigneePart = task.assignee ? ` (${task.assignee})` : "";
      lines.push(`- **${task.taskId}**: ${task.state}${assigneePart}`);
    }

    await writeFile(join(viewsDir, "TASKS.md"), lines.join("\n") + "\n");
  }

  /** Reset in-memory state for replay. */
  reset(): void {
    this.tasks.clear();
  }
}
