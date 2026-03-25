/**
 * pipeline-store.ts — Zustand store for pipeline command interface state.
 *
 * Sub-AC 7.2: Pipeline command interface — trigger, chain, and cancel agent
 * pipelines directly from 3D room/office objects.
 *
 * Architecture
 * ────────────
 * This store holds:
 *   1. `definitions`   — catalog of known pipeline templates (static + dynamic)
 *   2. `runs`          — active / recent pipeline run states (event-sourced)
 *   3. `chainBuilder`  — transient state for the chain-builder UI
 *   4. `selectedRunId` — which run is focused in the 3D diegetic panel
 *   5. `events`        — append-only event log for record transparency
 *
 * Data feeds
 * ──────────
 *   - `handlePipelineEvent()` — called by use-pipeline-ws-bridge.ts for
 *     pipeline.started / pipeline.step / pipeline.completed / pipeline.failed
 *   - `addLocalRun()` — called by use-pipeline-command.ts when a trigger or
 *     chain command is dispatched optimistically (before WS confirmation)
 *   - `cancelRun()` — optimistic cancellation (rolled back if HTTP fails)
 *
 * Record transparency
 * ────────────────────
 * Every mutation appends an event to `events` (append-only, max MAX_EVENTS).
 * Events are categorised so the replay engine can reconstruct pipeline state
 * at any playhead timestamp without re-running all business logic.
 *
 * Design principles
 * ─────────────────
 *   - No direct store-to-store imports; use lazy .getState() pattern if needed
 *   - TTL eviction for completed/failed runs after COMPLETED_RUN_TTL_MS
 *   - Pipeline steps accumulate in-place; we never rewrite history
 *   - Chain runs track their constituent pipeline_ids for causal trace
 */

import { create } from "zustand";
import type { PipelineStepStatus } from "@conitens/protocol";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum event log entries to retain in memory. */
const MAX_EVENTS = 500;

/** Maximum pipeline run records to retain (oldest pruned when exceeded). */
const MAX_RUNS = 100;

/**
 * Duration (ms) before a completed / failed / cancelled run is evicted
 * from the `runs` map (but it remains in `events` for replay).
 */
export const COMPLETED_RUN_TTL_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline definition catalog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Static description of an available pipeline template.
 * Instances are shown in the diegetic 3D panel and HUD library.
 */
export interface PipelineDefinition {
  /** Unique machine-readable name (matches PipelineStartedPayload.pipeline_name). */
  pipeline_name: string;
  /** Human-readable display label. */
  label: string;
  /** Short description of what the pipeline does. */
  description: string;
  /** Ordered list of step names shown in the UI before execution. */
  steps: string[];
  /**
   * Room role tags — the pipeline is offered in the 3D panel only when
   * the focused room matches one of these roles.  Empty = offered everywhere.
   */
  room_roles: string[];
  /** Accent colour for this pipeline's visual identity. */
  color: string;
  /** Icon glyph (unicode) displayed in the 3D panel and HUD. */
  icon: string;
  /** Arbitrary tags for filtering in the HUD library. */
  tags?: string[];
}

/**
 * Built-in pipeline catalog.
 * These definitions are seeded on store initialisation and can be extended
 * at runtime via `addDefinition()`.
 */
export const BUILT_IN_PIPELINE_DEFINITIONS: PipelineDefinition[] = [
  {
    pipeline_name: "agent-bootstrap",
    label: "Agent Bootstrap",
    description: "Spawn, configure, and assign an agent to its designated room.",
    steps: ["spawn-process", "inject-config", "verify-heartbeat", "assign-room"],
    room_roles: ["management", "research", "operations"],
    color: "#44aaff",
    icon: "⬡",
    tags: ["lifecycle", "setup"],
  },
  {
    pipeline_name: "task-fulfillment",
    label: "Task Fulfillment",
    description: "Create a task, assign it to the best available agent, and monitor completion.",
    steps: ["create-task", "select-agent", "assign-task", "monitor-progress", "collect-output"],
    room_roles: [],
    color: "#00ddaa",
    icon: "▣",
    tags: ["task", "assignment"],
  },
  {
    pipeline_name: "research-cycle",
    label: "Research Cycle",
    description: "Run a full research-analyse-report pipeline in the research lab.",
    steps: ["gather-sources", "analyse-data", "synthesise-findings", "publish-report"],
    room_roles: ["research"],
    color: "#ffcc44",
    icon: "◈",
    tags: ["research", "reporting"],
  },
  {
    pipeline_name: "system-health-check",
    label: "System Health Check",
    description: "Run a diagnostic sweep across all active agents and report anomalies.",
    steps: ["collect-agent-status", "evaluate-metrics", "flag-anomalies", "emit-report"],
    room_roles: ["operations", "management"],
    color: "#ff9944",
    icon: "◎",
    tags: ["diagnostics", "health"],
  },
  {
    pipeline_name: "agent-failover",
    label: "Agent Failover",
    description: "Detect a crashed agent and restart it in its assigned room.",
    steps: ["detect-failure", "terminate-stale", "respawn-agent", "reassign-tasks"],
    room_roles: ["operations"],
    color: "#ff4466",
    icon: "⟳",
    tags: ["recovery", "lifecycle"],
  },
  {
    pipeline_name: "config-sync",
    label: "Config Sync",
    description: "Propagate updated room-mapping and persona config to all agents.",
    steps: ["validate-config", "broadcast-update", "verify-acknowledgements"],
    room_roles: ["management"],
    color: "#aa88ff",
    icon: "⬜",
    tags: ["config", "sync"],
  },
  {
    pipeline_name: "meeting-debrief",
    label: "Meeting Debrief",
    description: "After a meeting ends, collect transcripts and summarise outcomes.",
    steps: ["fetch-transcript", "summarise-decisions", "assign-followup-tasks"],
    room_roles: ["collaboration", "management"],
    color: "#66ffcc",
    icon: "≡",
    tags: ["meeting", "reporting"],
  },
  {
    pipeline_name: "self-improvement-cycle",
    label: "Self-Improvement Cycle",
    description: "Record → analyse → propose GUI improvements → validate → apply.",
    steps: ["snapshot-events", "analyse-patterns", "propose-improvements", "validate-proposal", "apply-patch"],
    room_roles: [],
    color: "#ff66aa",
    icon: "∞",
    tags: ["self-evolution", "meta"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline run state
// ─────────────────────────────────────────────────────────────────────────────

/** Overall run lifecycle status. */
export type PipelineRunStatus =
  | "pending"    // issued locally, waiting for pipeline.started confirmation
  | "running"    // pipeline.started received
  | "completed"  // pipeline.completed received
  | "failed"     // pipeline.failed received
  | "cancelled"; // user-requested cancellation

/** A single step's accumulated state within a run. */
export interface PipelineRunStep {
  step_index: number;
  step_name: string;
  status: PipelineStepStatus;
  error_message?: string;
  error_code?: string;
  duration_ms?: number;
  output?: Record<string, unknown>;
}

/** Full state of a pipeline run. */
export interface PipelineRun {
  /** Stable identifier correlating all events for this run. */
  pipeline_id: string;
  /** Definition name — links to PipelineDefinition.pipeline_name. */
  pipeline_name: string;
  /** Current overall status. */
  status: PipelineRunStatus;
  /** Ordered list of step states. */
  steps: PipelineRunStep[];
  /** Index of the currently executing step (-1 if none). */
  current_step_index: number;
  /** Room that triggered this run (if any). */
  room_id?: string;
  /** Agents scoped by this run (if any). */
  agent_ids?: string[];
  /** command_id that triggered this run (correlates with CommandLifecycleStore). */
  initiated_by_command?: string;
  /** For chain runs: the chain command_id that spawned this pipeline. */
  chain_id?: string;
  /** Wall-clock ms when the run was created locally (before WS confirmation). */
  initiated_at_ms: number;
  /** Wall-clock ms when the run reached a terminal status. */
  completed_at_ms?: number;
  /** Total duration_ms from pipeline.completed / pipeline.failed. */
  duration_ms?: number;
  /** True if this run was started optimistically (awaiting WS confirmation). */
  is_optimistic?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain builder state
// ─────────────────────────────────────────────────────────────────────────────

/** One entry in the chain builder's ordered list. */
export interface ChainEntry {
  /** UUID assigned on add — stable key for React lists. */
  id: string;
  pipeline_name: string;
  params?: Record<string, unknown>;
}

export interface ChainBuilderState {
  /** Whether the chain builder modal is open. */
  isOpen: boolean;
  /** Room context for the chain being built. */
  room_id?: string;
  /** Ordered list of pipelines in the chain. */
  entries: ChainEntry[];
  /** Human-readable label for this chain. */
  label: string;
  /** Whether to continue the chain on step failure. */
  continue_on_error: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline store event log
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineStoreEventType =
  | "pipeline.run.added"      // local optimistic add or WS-confirmed start
  | "pipeline.run.step"       // step status update
  | "pipeline.run.completed"  // pipeline completed
  | "pipeline.run.failed"     // pipeline failed
  | "pipeline.run.cancelled"  // user cancelled
  | "pipeline.definition.added" // new definition registered
  | "chain.builder.opened"
  | "chain.builder.closed"
  | "chain.builder.entry_added"
  | "chain.builder.entry_removed"
  | "chain.builder.reordered";

export interface PipelineStoreEvent {
  id: string;
  type: PipelineStoreEventType;
  ts: number;
  payload: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineStoreState {
  // ── Data ──────────────────────────────────────────────────────────────────
  /** Known pipeline definitions (static catalog + runtime additions). */
  definitions: PipelineDefinition[];
  /** Active and recent pipeline runs, keyed by pipeline_id. */
  runs: Map<string, PipelineRun>;
  /** Id of the currently focused run (shown in 3D diegetic panel). */
  selectedRunId: string | null;
  /** Chain builder transient UI state. */
  chainBuilder: ChainBuilderState;
  /** Append-only store event log. */
  events: PipelineStoreEvent[];

  // ── Definition management ──────────────────────────────────────────────────
  addDefinition(def: PipelineDefinition): void;
  /** Get definitions applicable to a given room role. */
  getDefinitionsForRoom(roomRole: string): PipelineDefinition[];

  // ── Run lifecycle ──────────────────────────────────────────────────────────
  /**
   * Add an optimistic local run before receiving WS confirmation.
   * Called immediately when the user triggers a pipeline.
   */
  addLocalRun(run: Omit<PipelineRun, "steps" | "current_step_index" | "is_optimistic"> & { steps?: PipelineRunStep[] }): void;
  /**
   * Handle a pipeline.started WS event — confirms an optimistic run or adds a
   * new run if there was no prior optimistic entry.
   */
  handlePipelineStarted(payload: {
    pipeline_id: string;
    pipeline_name: string;
    steps: string[];
    initiated_by_command?: string;
    started_at_ms?: number;
  }): void;
  /**
   * Handle a pipeline.step WS event — update a step's status in the run.
   */
  handlePipelineStep(payload: {
    pipeline_id: string;
    step_index: number;
    step_name: string;
    step_status: PipelineStepStatus;
    output?: Record<string, unknown>;
    error_message?: string;
    error_code?: string;
    duration_ms?: number;
  }): void;
  /**
   * Handle a pipeline.completed WS event.
   */
  handlePipelineCompleted(payload: {
    pipeline_id: string;
    pipeline_name: string;
    steps_total: number;
    steps_completed: number;
    duration_ms?: number;
    artifacts?: Record<string, unknown>;
  }): void;
  /**
   * Handle a pipeline.failed WS event.
   */
  handlePipelineFailed(payload: {
    pipeline_id: string;
    pipeline_name: string;
    failed_step_index: number;
    failed_step_name: string;
    error_code: string;
    error_message: string;
    steps_completed: number;
    duration_ms?: number;
  }): void;
  /**
   * Optimistically cancel a run.  If the HTTP request fails the caller must
   * call revertCancelRun() to restore the prior status.
   */
  cancelRun(pipeline_id: string, reason?: string): void;
  /** Revert an optimistic cancellation (called on HTTP failure). */
  revertCancelRun(pipeline_id: string, prevStatus: PipelineRunStatus): void;
  /** Evict TTL-expired completed / failed / cancelled runs. */
  evictExpiredRuns(): void;

  // ── Selection ──────────────────────────────────────────────────────────────
  selectRun(pipeline_id: string | null): void;

  // ── Chain builder ─────────────────────────────────────────────────────────
  openChainBuilder(room_id?: string): void;
  closeChainBuilder(): void;
  addChainEntry(pipeline_name: string, params?: Record<string, unknown>): void;
  removeChainEntry(id: string): void;
  reorderChainEntries(from: number, to: number): void;
  setChainLabel(label: string): void;
  setContinueOnError(value: boolean): void;
  clearChainEntries(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEventId(): string {
  return `pev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makePipelineId(): string {
  return `pip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function appendEvent(
  events: PipelineStoreEvent[],
  type: PipelineStoreEventType,
  payload: Record<string, unknown>,
): PipelineStoreEvent[] {
  const next: PipelineStoreEvent[] = [
    ...events,
    { id: makeEventId(), type, ts: Date.now(), payload },
  ];
  return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store creation
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_CHAIN_BUILDER: ChainBuilderState = {
  isOpen: false,
  room_id: undefined,
  entries: [],
  label: "",
  continue_on_error: false,
};

export const usePipelineStore = create<PipelineStoreState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  definitions: [...BUILT_IN_PIPELINE_DEFINITIONS],
  runs: new Map(),
  selectedRunId: null,
  chainBuilder: INITIAL_CHAIN_BUILDER,
  events: [],

  // ── Definition management ──────────────────────────────────────────────────

  addDefinition(def) {
    set((s) => ({
      definitions: [...s.definitions.filter(d => d.pipeline_name !== def.pipeline_name), def],
      events: appendEvent(s.events, "pipeline.definition.added", { pipeline_name: def.pipeline_name }),
    }));
  },

  getDefinitionsForRoom(roomRole) {
    const { definitions } = get();
    return definitions.filter(
      (d) => d.room_roles.length === 0 || d.room_roles.includes(roomRole),
    );
  },

  // ── Run lifecycle ──────────────────────────────────────────────────────────

  addLocalRun({ steps, ...runData }) {
    const fullRun: PipelineRun = {
      steps: steps ?? [],
      current_step_index: -1,
      is_optimistic: true,
      ...runData,
    };
    set((s) => {
      const runs = new Map(s.runs);
      // Prune oldest runs if over limit
      if (runs.size >= MAX_RUNS) {
        const sorted = [...runs.entries()].sort((a, b) => a[1].initiated_at_ms - b[1].initiated_at_ms);
        runs.delete(sorted[0][0]);
      }
      runs.set(fullRun.pipeline_id, fullRun);
      return {
        runs,
        events: appendEvent(s.events, "pipeline.run.added", {
          pipeline_id: fullRun.pipeline_id,
          pipeline_name: fullRun.pipeline_name,
          is_optimistic: true,
        }),
      };
    });
  },

  handlePipelineStarted(payload) {
    set((s) => {
      const runs = new Map(s.runs);
      const existing = runs.get(payload.pipeline_id);

      const stepStates: PipelineRunStep[] = payload.steps.map((name, idx) => ({
        step_index: idx,
        step_name: name,
        status: "pending" as PipelineStepStatus,
      }));

      if (existing) {
        // Confirm the optimistic run — clear is_optimistic flag, populate steps
        runs.set(payload.pipeline_id, {
          ...existing,
          status: "running",
          steps: stepStates,
          is_optimistic: false,
          initiated_at_ms: payload.started_at_ms ?? existing.initiated_at_ms,
          initiated_by_command: payload.initiated_by_command ?? existing.initiated_by_command,
        });
      } else {
        // New run received from WS without prior optimistic entry
        const def = s.definitions.find(d => d.pipeline_name === payload.pipeline_name);
        runs.set(payload.pipeline_id, {
          pipeline_id: payload.pipeline_id,
          pipeline_name: payload.pipeline_name,
          status: "running",
          steps: stepStates,
          current_step_index: 0,
          initiated_at_ms: payload.started_at_ms ?? Date.now(),
          initiated_by_command: payload.initiated_by_command,
          room_id: def?.room_roles[0],
          is_optimistic: false,
        });
        // Prune oldest if over limit
        if (runs.size > MAX_RUNS) {
          const sorted = [...runs.entries()].sort((a, b) => a[1].initiated_at_ms - b[1].initiated_at_ms);
          runs.delete(sorted[0][0]);
        }
      }

      return {
        runs,
        events: appendEvent(s.events, "pipeline.run.added", {
          pipeline_id: payload.pipeline_id,
          pipeline_name: payload.pipeline_name,
          is_optimistic: false,
        }),
      };
    });
  },

  handlePipelineStep(payload) {
    set((s) => {
      const runs = new Map(s.runs);
      const run = runs.get(payload.pipeline_id);
      if (!run) return {};

      const updatedSteps = run.steps.map((step) =>
        step.step_index === payload.step_index
          ? {
              ...step,
              status: payload.step_status,
              output: payload.output,
              error_message: payload.error_message,
              error_code: payload.error_code,
              duration_ms: payload.duration_ms,
            }
          : step,
      );

      // If step doesn't exist yet (started before step list was known), push it
      const exists = updatedSteps.some(s => s.step_index === payload.step_index);
      if (!exists) {
        updatedSteps.push({
          step_index: payload.step_index,
          step_name: payload.step_name,
          status: payload.step_status,
          output: payload.output,
          error_message: payload.error_message,
          error_code: payload.error_code,
          duration_ms: payload.duration_ms,
        });
        updatedSteps.sort((a, b) => a.step_index - b.step_index);
      }

      const currentIdx = payload.step_status === "started"
        ? payload.step_index
        : run.current_step_index;

      runs.set(payload.pipeline_id, {
        ...run,
        steps: updatedSteps,
        current_step_index: currentIdx,
      });

      return {
        runs,
        events: appendEvent(s.events, "pipeline.run.step", {
          pipeline_id: payload.pipeline_id,
          step_index: payload.step_index,
          step_name: payload.step_name,
          step_status: payload.step_status,
        }),
      };
    });
  },

  handlePipelineCompleted(payload) {
    set((s) => {
      const runs = new Map(s.runs);
      const run = runs.get(payload.pipeline_id);
      if (!run) return {};

      runs.set(payload.pipeline_id, {
        ...run,
        status: "completed",
        duration_ms: payload.duration_ms,
        completed_at_ms: Date.now(),
      });

      return {
        runs,
        events: appendEvent(s.events, "pipeline.run.completed", {
          pipeline_id: payload.pipeline_id,
          pipeline_name: payload.pipeline_name,
          duration_ms: payload.duration_ms,
        }),
      };
    });
  },

  handlePipelineFailed(payload) {
    set((s) => {
      const runs = new Map(s.runs);
      const run = runs.get(payload.pipeline_id);
      if (!run) return {};

      // Mark the failed step
      const updatedSteps = run.steps.map((step) =>
        step.step_index === payload.failed_step_index
          ? { ...step, status: "failed" as PipelineStepStatus, error_message: payload.error_message, error_code: payload.error_code }
          : step,
      );

      runs.set(payload.pipeline_id, {
        ...run,
        status: "failed",
        steps: updatedSteps,
        duration_ms: payload.duration_ms,
        completed_at_ms: Date.now(),
      });

      return {
        runs,
        events: appendEvent(s.events, "pipeline.run.failed", {
          pipeline_id: payload.pipeline_id,
          failed_step_name: payload.failed_step_name,
          error_code: payload.error_code,
        }),
      };
    });
  },

  cancelRun(pipeline_id, reason) {
    set((s) => {
      const runs = new Map(s.runs);
      const run = runs.get(pipeline_id);
      if (!run) return {};

      runs.set(pipeline_id, {
        ...run,
        status: "cancelled",
        completed_at_ms: Date.now(),
      });

      return {
        runs,
        events: appendEvent(s.events, "pipeline.run.cancelled", {
          pipeline_id,
          reason: reason ?? "user_requested",
        }),
      };
    });
  },

  revertCancelRun(pipeline_id, prevStatus) {
    set((s) => {
      const runs = new Map(s.runs);
      const run = runs.get(pipeline_id);
      if (!run) return {};
      runs.set(pipeline_id, { ...run, status: prevStatus, completed_at_ms: undefined });
      return { runs };
    });
  },

  evictExpiredRuns() {
    const now = Date.now();
    set((s) => {
      const runs = new Map(s.runs);
      for (const [id, run] of runs) {
        if (
          (run.status === "completed" || run.status === "failed" || run.status === "cancelled") &&
          run.completed_at_ms !== undefined &&
          now - run.completed_at_ms > COMPLETED_RUN_TTL_MS
        ) {
          runs.delete(id);
        }
      }
      return { runs };
    });
  },

  // ── Selection ──────────────────────────────────────────────────────────────

  selectRun(pipeline_id) {
    set({ selectedRunId: pipeline_id });
  },

  // ── Chain builder ──────────────────────────────────────────────────────────

  openChainBuilder(room_id) {
    set((s) => ({
      chainBuilder: { ...INITIAL_CHAIN_BUILDER, isOpen: true, room_id },
      events: appendEvent(s.events, "chain.builder.opened", { room_id: room_id ?? null }),
    }));
  },

  closeChainBuilder() {
    set((s) => ({
      chainBuilder: { ...s.chainBuilder, isOpen: false },
      events: appendEvent(s.events, "chain.builder.closed", {}),
    }));
  },

  addChainEntry(pipeline_name, params) {
    const id = makePipelineId();
    set((s) => ({
      chainBuilder: {
        ...s.chainBuilder,
        entries: [...s.chainBuilder.entries, { id, pipeline_name, params }],
      },
      events: appendEvent(s.events, "chain.builder.entry_added", { id, pipeline_name }),
    }));
  },

  removeChainEntry(id) {
    set((s) => ({
      chainBuilder: {
        ...s.chainBuilder,
        entries: s.chainBuilder.entries.filter((e) => e.id !== id),
      },
      events: appendEvent(s.events, "chain.builder.entry_removed", { id }),
    }));
  },

  reorderChainEntries(from, to) {
    set((s) => {
      const entries = [...s.chainBuilder.entries];
      const [moved] = entries.splice(from, 1);
      entries.splice(to, 0, moved);
      return {
        chainBuilder: { ...s.chainBuilder, entries },
        events: appendEvent(s.events, "chain.builder.reordered", { from, to }),
      };
    });
  },

  setChainLabel(label) {
    set((s) => ({
      chainBuilder: { ...s.chainBuilder, label },
    }));
  },

  setContinueOnError(value) {
    set((s) => ({
      chainBuilder: { ...s.chainBuilder, continue_on_error: value },
    }));
  },

  clearChainEntries() {
    set((s) => ({
      chainBuilder: { ...s.chainBuilder, entries: [] },
    }));
  },
}));
