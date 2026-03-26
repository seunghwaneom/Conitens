/**
 * use-task-ws-bridge.ts — Task-store live data integration bridge.
 *
 * Sub-AC 5a: Task-agent mapping data model and store — mock/live data integration.
 *
 * This module provides:
 *   1. `useTaskWSBridge` — hook that initialises the task store with mock seed
 *      data when the store is empty, and routes incoming task.* WS events (forwarded
 *      from use-orchestrator-ws.ts via `dispatchTaskWSEvent`) to task-store actions.
 *   2. `TaskWSBridge` — null-render React component; mount once in App.tsx.
 *   3. `dispatchTaskWSEvent` — called by use-orchestrator-ws.ts for each task.*
 *      event it receives; routes the event payload to the correct task-store action.
 *
 * Architecture note
 * ─────────────────
 * The WS connection itself is managed by OrchestratorWSBridge (use-orchestrator-ws).
 * We do NOT open a second WebSocket here.  Instead:
 *   - use-orchestrator-ws.ts forwards task.* events by calling
 *     `dispatchTaskWSEvent()` from this module.
 *   - useTaskWSBridge listens for connection-status changes in the metrics
 *     store so it can log when live data starts or falls back to seed data.
 *   - On mount, if the task store is empty, the bridge seeds it with
 *     TASK_INITIAL_DATASET so the 3D scene always has something to show.
 *
 * Event routing matrix (protocol event → task-store action)
 * ──────────────────────────────────────────────────────────
 *   task.created        → createTask()
 *   task.assigned       → assignTask()
 *   task.status_changed → transitionTask() or bulkLoadTasks() on snapshot
 *   task.completed      → transitionTask("done")
 *   task.failed         → transitionTask("failed")
 *   task.cancelled      → transitionTask("cancelled")
 *   task.spec_updated   → updateTaskTitle()
 *   tasks.snapshot      → bulkLoadTasks()          (non-protocol, custom event)
 *   tasks.bulk_loaded   → bulkLoadTasks()
 *
 * Security: all event processing is read-only for the GUI layer.
 * The task store only writes local Zustand state; no data is sent back
 * to the orchestrator through this bridge.
 *
 * Usage (mount once in App.tsx):
 *   <TaskWSBridge />
 *
 * @module use-task-ws-bridge
 */

import { useEffect, useRef } from "react";
import { useTaskStore }   from "../store/task-store.js";
import { useMetricsStore } from "../store/metrics-store.js";
import { TASK_INITIAL_DATASET } from "../data/task-seed.js";
import type { TaskRecord, TaskStatus } from "../data/task-types.js";

// ── Types for incoming WS task events ─────────────────────────────────────

/** Minimal shape of a task.* event received from the orchestrator WS bus. */
export interface TaskWSEvent {
  /** Event type string (e.g. "task.created", "task.status_changed"). */
  type: string;
  /** Event payload — shape varies per event type. */
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp string from the orchestrator. */
  ts?: string;
  /** ID of the affected task (present on most task.* events). */
  task_id?: string;
  /** Actor that produced the event. */
  actor?: { kind: string; id: string };
}

// ── Set of task event type strings we handle ──────────────────────────────

export const TASK_WS_EVENT_TYPES = new Set([
  // Core protocol events from @conitens/protocol/event.ts
  "task.created",
  "task.assigned",
  "task.status_changed",
  "task.spec_updated",
  "task.artifact_added",
  "task.completed",
  "task.failed",
  "task.cancelled",
  // Store-internal bulk events we also accept over WS
  "tasks.bulk_loaded",
  // Custom snapshot event (sent by orchestrator on WS open)
  "tasks.snapshot",
]);

// ── Safe status extraction helper ─────────────────────────────────────────

const VALID_STATUSES = new Set<string>([
  "draft", "planned", "assigned", "active",
  "blocked", "review", "done", "failed", "cancelled",
]);

function safeStatus(raw: unknown): TaskStatus | null {
  return typeof raw === "string" && VALID_STATUSES.has(raw)
    ? (raw as TaskStatus)
    : null;
}

// ── dispatchTaskWSEvent — called by use-orchestrator-ws.ts ─────────────────

/**
 * Route a task.* WS event to the appropriate task-store action.
 *
 * This is a pure function (no React hooks) so it can be called from
 * use-orchestrator-ws.ts's message handler directly.
 *
 * @param event - The task WS event received from the orchestrator bus.
 */
export function dispatchTaskWSEvent(event: TaskWSEvent): void {
  const store = useTaskStore.getState();
  const p     = event.payload;
  const taskId = (event.task_id ?? p["task_id"]) as string | undefined;

  switch (event.type) {

    // ── task.created ─────────────────────────────────────────────────────
    case "task.created": {
      if (!taskId) break;
      // If the task already exists locally (e.g. created by the GUI), skip.
      if (store.tasks[taskId]) break;

      const title   = typeof p["title"]    === "string" ? p["title"]    : "(untitled)";
      const desc    = typeof p["desc"]     === "string" ? p["desc"]     : undefined;
      const agentId = typeof p["agent_id"] === "string" ? p["agent_id"] : null;
      const status  = safeStatus(p["status"]) ?? "draft";
      const priority = typeof p["priority"] === "string" &&
                       ["critical","high","normal","low"].includes(p["priority"] as string)
                       ? (p["priority"] as "critical"|"high"|"normal"|"low")
                       : "normal";
      const tags    = Array.isArray(p["tags"])
                      ? (p["tags"] as unknown[]).filter((t): t is string => typeof t === "string")
                      : [];
      const parentId = typeof p["parent_task_id"] === "string" ? p["parent_task_id"] : null;

      // Inject the task with a known ID — we bypass createTask() which generates
      // a new random ID. Instead we use bulkLoadTasks() with a single-task array
      // so the store receives the orchestrator's canonical task ID.
      const tsNum = event.ts ? new Date(event.ts).getTime() : Date.now();
      const record: TaskRecord = {
        taskId,
        title,
        description: desc,
        status,
        priority,
        assignedAgentId: agentId,
        createdTs:    tsNum,
        updatedTs:    tsNum,
        startedTs:    status === "active" ? tsNum : null,
        completedTs:  ["done","failed","cancelled"].includes(status) ? tsNum : null,
        parentTaskId: parentId,
        tags,
        eventIds:     [],
      };
      store.bulkLoadTasks([record]);
      break;
    }

    // ── task.assigned ────────────────────────────────────────────────────
    case "task.assigned": {
      if (!taskId) break;
      const agentId = typeof p["agent_id"] === "string" ? p["agent_id"] : null;
      if (!agentId) break;
      if (!store.tasks[taskId]) break;
      store.assignTask(taskId, agentId);
      break;
    }

    // ── task.status_changed ──────────────────────────────────────────────
    case "task.status_changed": {
      if (!taskId) break;
      if (!store.tasks[taskId]) break;
      const toStatus = safeStatus(p["status"]);
      if (!toStatus) break;
      // transitionTask enforces the state machine — silently drops invalid transitions
      store.transitionTask(taskId, toStatus);
      break;
    }

    // ── task.completed ───────────────────────────────────────────────────
    case "task.completed": {
      if (!taskId) break;
      if (!store.tasks[taskId]) break;
      store.transitionTask(taskId, "done");
      break;
    }

    // ── task.failed ──────────────────────────────────────────────────────
    case "task.failed": {
      if (!taskId) break;
      if (!store.tasks[taskId]) break;
      store.transitionTask(taskId, "failed");
      break;
    }

    // ── task.cancelled ───────────────────────────────────────────────────
    case "task.cancelled": {
      if (!taskId) break;
      if (!store.tasks[taskId]) break;
      store.transitionTask(taskId, "cancelled");
      break;
    }

    // ── task.spec_updated ────────────────────────────────────────────────
    case "task.spec_updated": {
      if (!taskId) break;
      if (!store.tasks[taskId]) break;
      const title = typeof p["title"] === "string" ? p["title"] : undefined;
      const desc  = typeof p["description"] === "string" ? p["description"] : undefined;
      if (title) {
        store.updateTaskTitle(taskId, title, desc);
      }
      break;
    }

    // ── task.artifact_added ──────────────────────────────────────────────
    // Artifacts don't map to a specific store action; we tag the task.
    case "task.artifact_added": {
      if (!taskId) break;
      const task = store.tasks[taskId];
      if (!task) break;
      const artifactType = typeof p["artifact_type"] === "string"
        ? p["artifact_type"] : "artifact";
      const artifactTag = `artifact:${artifactType}`;
      if (!task.tags.includes(artifactTag)) {
        store.setTaskTags(taskId, [...task.tags, artifactTag]);
      }
      break;
    }

    // ── tasks.snapshot / tasks.bulk_loaded ───────────────────────────────
    case "tasks.snapshot":
    case "tasks.bulk_loaded": {
      // Accept an array of TaskRecord-shaped objects from the orchestrator.
      // Minimal validation: must be an array of objects with taskId + title.
      const rawTasks = p["tasks"];
      if (!Array.isArray(rawTasks)) break;

      const validRecords: TaskRecord[] = [];
      for (const raw of rawTasks) {
        if (
          raw &&
          typeof raw === "object" &&
          typeof (raw as Record<string, unknown>)["taskId"] === "string" &&
          typeof (raw as Record<string, unknown>)["title"]  === "string"
        ) {
          validRecords.push(raw as TaskRecord);
        }
      }

      if (validRecords.length > 0) {
        store.bulkLoadTasks(validRecords);
      }
      break;
    }

    default:
      // Unknown task event type — silently ignore for forward compatibility
      break;
  }
}

// ── useTaskWSBridge hook ───────────────────────────────────────────────────

/**
 * useTaskWSBridge — manages initial task seeding and live-data readiness.
 *
 * Behaviour:
 *   1. On mount: if the task store is empty, seed it with TASK_INITIAL_DATASET.
 *      This ensures the 3D scene always has meaningful data to display
 *      even when the orchestrator is not running.
 *   2. Watches the metrics-store connection status so it can log a
 *      "live data active" message when the WS connects and task events
 *      start flowing (actual event routing is in dispatchTaskWSEvent).
 *   3. On unmount: does NOT clear the task store — tasks should persist
 *      for the lifetime of the app session.
 *
 * @returns `{ seeded, connectionStatus }` for debugging / telemetry.
 */
export function useTaskWSBridge(): {
  seeded: boolean;
  connectionStatus: string;
} {
  const seededRef       = useRef(false);
  const connectionStatus = useMetricsStore((s) => s.connectionStatus);

  // ── Initial seed ────────────────────────────────────────────────────────
  useEffect(() => {
    if (seededRef.current) return;

    const taskCount = Object.keys(useTaskStore.getState().tasks).length;
    if (taskCount === 0) {
      // Store is empty — populate with mock seed data for offline/demo mode.
      useTaskStore.getState().bulkLoadTasks(TASK_INITIAL_DATASET as TaskRecord[]);
      seededRef.current = true;
      if (process.env.NODE_ENV !== "test") {
        console.info(
          `[TaskWSBridge] Seeded task store with ${TASK_INITIAL_DATASET.length} mock tasks ` +
          "(offline/demo mode).  Live data will replace on WS connect.",
        );
      }
    } else {
      // Store already has tasks (e.g. from a previous session or hot reload).
      seededRef.current = true;
    }
  }, []); // run once on mount

  // ── Log live-data readiness ─────────────────────────────────────────────
  const prevStatusRef = useRef<string>("disconnected");
  useEffect(() => {
    if (
      connectionStatus === "connected" &&
      prevStatusRef.current !== "connected"
    ) {
      if (process.env.NODE_ENV !== "test") {
        console.info(
          "[TaskWSBridge] Orchestrator WS connected — task events are now live.",
        );
      }
    }
    prevStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  return { seeded: seededRef.current, connectionStatus };
}

// ── TaskWSBridge — null-render component ──────────────────────────────────

/**
 * TaskWSBridge — headless React component that mounts the task bridge.
 *
 * Renders null (no DOM output); purely manages side-effects.
 * Mount once in App.tsx alongside OrchestratorWSBridge and MetricsTicker.
 *
 * @example
 *   // In App.tsx:
 *   <TaskWSBridge />
 */
export function TaskWSBridge(): null {
  useTaskWSBridge();
  return null;
}
