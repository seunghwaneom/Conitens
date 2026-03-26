/**
 * TaskMappingHUD.tsx — Screen-space 2D overlay for task-agent mapping.
 *
 * Sub-AC 5.3: Highest-priority visual treatment.
 *
 * This HUD renders OUTSIDE the Three.js Canvas as a CSS-positioned overlay.
 * It guarantees task-agent assignments remain the dominant visual signal
 * regardless of camera zoom, orientation, LOD tier, or scene fog.
 *
 * Why outside Canvas:
 *   Elements inside <Canvas> are in 3D world-space. At high camera distances
 *   or with heavy fog, task orbs + beams may become small or dim.  This 2D
 *   overlay is always pixel-crisp and covers the full viewport.
 *
 * Layout:
 *   Right edge panel   — scrollable task-agent card list (priority-sorted)
 *   Top of panel       — critical-task alert banner (pulsing red; shown only
 *                        when ≥1 critical+active task exists)
 *
 * Visual signals per card:
 *   Priority badge  — color-filled square with initial (C/H/N/L)
 *   Status accent   — border-left stripe color = STATUS_BEAM_COLOR
 *   Agent arrow     — "→ AgentName" in muted blue
 *   Status label    — 4-char abbreviated status in status color
 *   Elapsed time    — seconds/minutes since task was last updated
 *
 * Z-ordering:
 *   position: absolute; zIndex: 9999; pointer-events: none
 *   This places the HUD above the <Canvas> element in the stacking context.
 *
 * Performance:
 *   - Renders at React state-update frequency (not 60 fps)
 *   - Elapsed-time updates every 5 s via setInterval (negligible cost)
 *   - CSS animations handle the banner + card pulsing (no JS animation loop)
 *   - Max 8 cards rendered; overflow indicator shows hidden count
 *
 * Data flow (read-only, no events emitted):
 *   useTaskStore → assignments, tasks
 *   useAgentStore → agents (for agent display name)
 */

import { useMemo, useEffect, useState } from "react";
import { useTaskStore } from "../store/task-store.js";
import { useAgentStore } from "../store/agent-store.js";
import type { TaskRecord, TaskStatus, TaskPriority } from "../store/task-store.js";

// ── Color / label constants (must match TaskConnectors.tsx palette) ───────────

const PRIORITY_COLOR: Readonly<Record<TaskPriority, string>> = {
  critical: "#FF3D00",
  high:     "#FF9100",
  normal:   "#40C4FF",
  low:      "#B2DFDB",
};

const PRIORITY_LABEL: Readonly<Record<TaskPriority, string>> = {
  critical: "C",
  high:     "H",
  normal:   "N",
  low:      "L",
};

const STATUS_COLOR: Readonly<Record<TaskStatus, string>> = {
  draft:     "#444466",
  planned:   "#555588",
  assigned:  "#40C4FF",
  active:    "#00ff88",
  blocked:   "#FF9100",
  review:    "#aa88ff",
  done:      "#2a5a2a",
  failed:    "#ff4444",
  cancelled: "#333344",
};

const STATUS_LABEL: Readonly<Record<TaskStatus, string>> = {
  draft:     "DRFT",
  planned:   "PLAN",
  assigned:  "ASGN",
  active:    "ACTV",
  blocked:   "BLKD",
  review:    "REVW",
  done:      "DONE",
  failed:    "FAIL",
  cancelled: "CANC",
};

/** Statuses visible in the HUD (mirror of VISIBLE_STATUSES in TaskConnectors.tsx) */
const VISIBLE_STATUSES = new Set<TaskStatus>(["assigned", "active", "blocked", "review"]);

/** Sort weight: lower = shown first */
const PRIORITY_ORDER: Readonly<Record<TaskPriority, number>> = {
  critical: 0, high: 1, normal: 2, low: 3,
};
const STATUS_ORDER: Readonly<Record<TaskStatus, number>> = {
  active: 0, blocked: 1, review: 2, assigned: 3,
  draft: 4, planned: 5, done: 6, failed: 7, cancelled: 8,
};

/** Max task cards rendered in the panel */
const MAX_CARDS = 8;

// ── Elapsed-time formatter ────────────────────────────────────────────────────

function fmtElapsed(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

// ── CSS keyframe animations ───────────────────────────────────────────────────

const HUD_KEYFRAMES = `
  @keyframes hud-pulse-critical {
    0%, 100% {
      border-color: #FF3D00;
      box-shadow: 0 0 6px #FF3D0060, inset 0 0 4px #FF3D0020;
    }
    50% {
      border-color: #ff6644;
      box-shadow: 0 0 18px #FF3D00a0, inset 0 0 8px #FF3D0040;
    }
  }
  @keyframes hud-pulse-card {
    0%, 100% { border-left-color: #FF3D00; }
    50%       { border-left-color: #ff7755; }
  }
  @keyframes hud-scanline {
    0%   { transform: translateY(-100%); opacity: 0; }
    10%  { opacity: 0.15; }
    90%  { opacity: 0.15; }
    100% { transform: translateY(100%); opacity: 0; }
  }
`;

// ── TaskMappingCard ───────────────────────────────────────────────────────────

interface TaskMappingCardProps {
  task:      TaskRecord;
  agentName: string;
}

/**
 * Single task-agent entry in the HUD panel.
 *
 * Two-row layout:
 *   Row 1: [Priority badge] [Task title (truncated)]
 *   Row 2: [→ Agent name]   [Status label] [Elapsed]
 *
 * Critical+active cards have a pulsing border-left animation.
 */
function TaskMappingCard({ task, agentName }: TaskMappingCardProps) {
  const priorityColor = PRIORITY_COLOR[task.priority];
  const statusColor   = STATUS_COLOR[task.status];
  const isCritical    = task.priority === "critical";
  const isActive      = task.status === "active";
  const isBlocked     = task.status === "blocked";

  return (
    <div
      style={{
        borderLeft:   `3px solid ${statusColor}`,
        borderTop:    `1px solid ${isCritical ? priorityColor + "55" : "#ffffff14"}`,
        borderRight:  "1px solid #ffffff0c",
        borderBottom: "1px solid #ffffff0c",
        borderRadius: "0 3px 3px 0",
        padding: "4px 7px 4px 6px",
        background: isCritical
          ? "rgba(255, 61, 0, 0.09)"
          : isBlocked
          ? "rgba(255, 145, 0, 0.06)"
          : "rgba(8, 8, 22, 0.88)",
        backdropFilter: "blur(5px)",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        animation: (isCritical && isActive) ? "hud-pulse-card 1.4s ease-in-out infinite" : undefined,
      }}
    >
      {/* Row 1: priority badge + task title */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: 2,
            background: priorityColor,
            color: isCritical ? "#fff" : "#000",
            fontSize: "7px",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 0 4px ${priorityColor}80`,
          }}
        >
          {PRIORITY_LABEL[task.priority]}
        </span>
        <span
          style={{
            fontSize: "8px",
            color: isCritical ? priorityColor : "#ccd6f6",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            letterSpacing: "0.03em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 108,
          }}
        >
          {task.title.length > 18
            ? `${task.title.slice(0, 18)}\u2026`
            : task.title}
        </span>
      </div>

      {/* Row 2: agent name, status, elapsed */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: "7px",
            color: "#6a7caa",
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 72,
            flexShrink: 1,
          }}
        >
          {"\u2192"} {agentName.length > 11 ? `${agentName.slice(0, 11)}\u2026` : agentName}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span
            style={{
              fontSize: "6px",
              color: statusColor,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}
          >
            {STATUS_LABEL[task.status]}
          </span>
          <span
            style={{
              fontSize: "6px",
              color: "#445566",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {fmtElapsed(task.updatedTs)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── CriticalTaskBanner ────────────────────────────────────────────────────────

/**
 * Pulsing alert banner shown when ≥1 critical+active task exists.
 *
 * Appears above the card list with a red pulsing border and glow.
 * Shows the primary task title and a count badge for additional tasks.
 */
function CriticalTaskBanner({ tasks }: { tasks: TaskRecord[] }) {
  if (tasks.length === 0) return null;

  const primary = tasks[0];
  const extras  = tasks.length - 1;

  return (
    <div
      style={{
        borderRadius: 3,
        padding: "5px 8px",
        background: "rgba(255, 61, 0, 0.13)",
        border: "1px solid #FF3D00",
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        animation: "hud-pulse-critical 1.0s ease-in-out infinite",
        marginBottom: 4,
      }}
    >
      {/* Alert glyph */}
      <span
        style={{
          fontSize: "9px",
          color: "#FF3D00",
          fontWeight: 700,
          flexShrink: 0,
          lineHeight: 1.4,
        }}
      >
        {"\u26a1"}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row */}
        <div
          style={{
            fontSize: "7px",
            color: "#FF3D00",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            letterSpacing: "0.10em",
            whiteSpace: "nowrap",
            marginBottom: 2,
          }}
        >
          CRITICAL{extras > 0 ? ` \u00d7${tasks.length}` : ""}
        </div>

        {/* Primary task title */}
        <div
          style={{
            fontSize: "7px",
            color: "#ffaa88",
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {primary.title.length > 22
            ? `${primary.title.slice(0, 22)}\u2026`
            : primary.title}
        </div>
      </div>
    </div>
  );
}

// ── TaskMappingHUD ────────────────────────────────────────────────────────────

/**
 * Screen-space 2D overlay displaying task-agent mappings as the dominant
 * visual signal in the command center.
 *
 * Mount this component INSIDE the same div that wraps <Canvas>, after the
 * <Canvas> element, so it overlays the 3D scene:
 *
 *   <div style={{ position: "relative" }}>
 *     <Canvas ... />
 *     <TaskMappingHUD />
 *   </div>
 *
 * The component is pointer-events: none — the 3D scene remains interactive.
 */
export function TaskMappingHUD() {
  const assignments = useTaskStore((s) => s.assignments);
  const tasks       = useTaskStore((s) => s.tasks);
  const agents      = useAgentStore((s) => s.agents);

  // Tick state for elapsed-time refresh (every 5 s — cheap setInterval)
  const [_tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  // ── Build prioritized task-agent pair list ────────────────────────────────

  const activePairs = useMemo(() => {
    return Object.values(assignments)
      .filter((a) => {
        const t = tasks[a.taskId];
        return t && VISIBLE_STATUSES.has(t.status);
      })
      .map((a) => ({
        task:  tasks[a.taskId],
        agent: agents[a.agentId],
      }))
      .filter((p): p is { task: TaskRecord; agent: NonNullable<typeof p.agent> } =>
        Boolean(p.task && p.agent),
      )
      .sort((a, b) => {
        const pd = PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority];
        if (pd !== 0) return pd;
        return STATUS_ORDER[a.task.status] - STATUS_ORDER[b.task.status];
      });
    // _tick in deps triggers elapsed-time refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, tasks, agents, _tick]);

  // Critical+active tasks for the banner
  const criticalActive = useMemo(
    () =>
      activePairs
        .filter((p) => p.task.priority === "critical" && p.task.status === "active")
        .map((p) => p.task),
    [activePairs],
  );

  // Hidden count (tasks beyond MAX_CARDS)
  const hiddenCount = Math.max(0, activePairs.length - MAX_CARDS);
  const visiblePairs = activePairs.slice(0, MAX_CARDS);

  if (activePairs.length === 0) return null;

  return (
    <>
      {/* Inject CSS keyframe animations once into the document */}
      <style>{HUD_KEYFRAMES}</style>

      {/*
       * HUD panel — right edge, non-interactive overlay.
       *
       * z-index: 9999 ensures this is above the <Canvas> element in the
       * stacking context.  pointer-events: none lets click events pass through
       * to the 3D scene beneath.
       *
       * top: 64px — leaves room for any top-bar HUD elements from HUD.tsx.
       */}
      <div
        style={{
          position: "absolute",
          top: 64,
          right: 8,
          width: 172,
          maxHeight: "calc(100% - 80px)",
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          pointerEvents: "none",
          zIndex: 9999,
          // Hide scrollbar but allow scrolling
          scrollbarWidth: "none",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          style={{
            fontSize: "7px",
            color: "#3a5aee",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            borderBottom: "1px solid #3a5aee38",
            paddingBottom: 3,
            marginBottom: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Task {"\u00b7"} Agent</span>
          <span style={{ color: "#445566", fontWeight: 400 }}>
            {activePairs.length}
          </span>
        </div>

        {/* ── Critical alert banner (conditional) ────────────────────── */}
        <CriticalTaskBanner tasks={criticalActive} />

        {/* ── Task-agent cards ────────────────────────────────────────── */}
        {visiblePairs.map(({ task, agent }) => (
          <TaskMappingCard
            key={task.taskId}
            task={task}
            agentName={agent.def?.name ?? agent.def?.agentId ?? "unknown"}
          />
        ))}

        {/* ── Overflow indicator ──────────────────────────────────────── */}
        {hiddenCount > 0 && (
          <div
            style={{
              fontSize: "6px",
              color: "#445566",
              fontFamily: "'JetBrains Mono', monospace",
              textAlign: "right",
              paddingRight: 4,
              paddingTop: 1,
            }}
          >
            +{hiddenCount} more
          </div>
        )}
      </div>
    </>
  );
}
