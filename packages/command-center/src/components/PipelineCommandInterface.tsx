/**
 * PipelineCommandInterface — 2D HUD overlay for pipeline management.
 *
 * Sub-AC 7.2: Pipeline command interface.
 *
 * Provides the full-featured pipeline management surface outside the 3D canvas:
 *
 *   PIPELINE LIBRARY  — searchable catalog of all pipeline definitions
 *                        with category filtering by tags and room roles
 *   ACTIVE RUNS       — live timeline of running pipelines across all rooms,
 *                        with real-time step-progress indicators
 *   CHAIN BUILDER     — drag-to-reorder multi-pipeline chain configuration
 *                        with TRIGGER CHAIN and CLEAR buttons
 *   HISTORY           — recent completed / failed runs
 *
 * This panel complements the diegetic 3D PipelineDiegeticPanel (which is
 * room-scoped), providing a global cross-room view of pipeline activity.
 *
 * Design principles
 * ─────────────────
 *   - Dark command-center aesthetic (matching HUD.tsx patterns)
 *   - All actions route through usePipelineCommand (record transparency)
 *   - Collapsible: collapsed by default to respect HUD real-estate
 *   - Toggle with keyboard shortcut P (when body has focus)
 *
 * Record transparency
 * ────────────────────
 * The component reads from pipeline-store (event-sourced) and dispatches
 * actions through usePipelineCommand, which writes command files ensuring
 * every user interaction is event-sourced.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { usePipelineStore } from "../store/pipeline-store.js";
import { usePipelineCommand } from "../hooks/use-pipeline-command.js";
import type { PipelineDefinition, PipelineRun, ChainEntry } from "../store/pipeline-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

const PANEL_ACCENT = "#aa66ff";

// ─────────────────────────────────────────────────────────────────────────────
// Styling helpers
// ─────────────────────────────────────────────────────────────────────────────

function getStatusColor(status: string): string {
  switch (status) {
    case "pending":   return "#ffcc44";
    case "running":   return "#44aaff";
    case "completed": return "#00ff88";
    case "failed":    return "#ff4444";
    case "cancelled": return "#888899";
    default:          return "#555566";
  }
}

function getStepColor(status: string): string {
  switch (status) {
    case "completed": return "#00ff88";
    case "started":   return "#44aaff";
    case "failed":    return "#ff4444";
    case "skipped":   return "#888899";
    default:          return "#222233";
  }
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTs(ms: number): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Step-rail row — compact inline dots. */
function StepRail({ run }: { run: PipelineRun }) {
  if (run.steps.length === 0) {
    return <span style={{ fontSize: "8px", color: "#333355" }}>—</span>;
  }
  return (
    <div style={{ display: "flex", gap: "3px", alignItems: "center", flexWrap: "wrap" }}>
      {run.steps.map((step, i) => {
        const color = getStepColor(step.status);
        const isActive = step.status === "started";
        return (
          <div
            key={i}
            title={`${step.step_name}: ${step.status}`}
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: color,
              boxShadow: isActive ? `0 0 6px ${color}88` : "none",
              flexShrink: 0,
              transition: "background 0.3s ease",
            }}
          />
        );
      })}
    </div>
  );
}

/** Single run row in the "Active" and "History" tabs. */
function RunRow({
  run,
  onCancel,
  isCancelling,
  onSelect,
  isSelected,
}: {
  run: PipelineRun;
  onCancel?: (id: string) => void;
  isCancelling?: boolean;
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const statusColor = getStatusColor(run.status);
  const completedSteps = run.steps.filter((s) => s.status === "completed").length;
  const totalSteps = run.steps.length;
  const progress = totalSteps > 0 ? completedSteps / totalSteps : 0;
  const canCancel = onCancel && (run.status === "pending" || run.status === "running");

  return (
    <div
      onClick={() => onSelect(run.pipeline_id)}
      style={{
        padding: "7px 10px",
        borderRadius: "4px",
        border: `1px solid ${isSelected ? statusColor + "44" : "#1a1a2a"}`,
        background: isSelected ? `${statusColor}06` : "rgba(8,8,20,0.5)",
        marginBottom: "4px",
        cursor: "pointer",
        transition: "border-color 0.15s ease, background 0.15s ease",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
        {/* Status dot */}
        <div
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: statusColor,
            boxShadow: run.status === "running" ? `0 0 6px ${statusColor}88` : "none",
            flexShrink: 0,
          }}
        />
        {/* Pipeline name */}
        <span
          style={{
            fontSize: "9px",
            fontWeight: 600,
            color: "#aaaacc",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {run.pipeline_name}
        </span>
        {/* Room badge */}
        {run.room_id && (
          <span
            style={{
              fontSize: "7px",
              color: "#444466",
              padding: "1px 4px",
              border: "1px solid #222233",
              borderRadius: "2px",
            }}
          >
            {run.room_id.slice(0, 12)}
          </span>
        )}
        {/* Duration */}
        {run.duration_ms !== undefined && (
          <span style={{ fontSize: "7.5px", color: "#444466" }}>
            {formatDuration(run.duration_ms)}
          </span>
        )}
        {/* Timestamp */}
        <span style={{ fontSize: "7px", color: "#333355" }}>
          {formatTs(run.initiated_at_ms)}
        </span>
        {/* Cancel button */}
        {canCancel && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(run.pipeline_id); }}
            disabled={isCancelling}
            title="Cancel pipeline"
            style={{
              fontFamily: FONT,
              fontSize: "7px",
              cursor: isCancelling ? "default" : "pointer",
              padding: "1px 6px",
              borderRadius: "2px",
              border: "1px solid #ff444422",
              background: "transparent",
              color: isCancelling ? "#333344" : "#ff6666",
            }}
          >
            {isCancelling ? "…" : "✕ CANCEL"}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div
          style={{
            height: "2px",
            background: "#1a1a2e",
            borderRadius: "1px",
            marginBottom: "5px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(progress * 100)}%`,
              background: statusColor,
              borderRadius: "1px",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}

      {/* Step rail */}
      <StepRail run={run} />

      {/* Expanded: current step */}
      {isSelected && run.current_step_index >= 0 && run.steps[run.current_step_index] && (
        <div
          style={{
            marginTop: "5px",
            fontSize: "7.5px",
            color: "#6688aa",
            letterSpacing: "0.04em",
          }}
        >
          ▷ {run.steps[run.current_step_index]!.step_name}
          {run.steps[run.current_step_index]!.duration_ms
            ? ` (${formatDuration(run.steps[run.current_step_index]!.duration_ms)})`
            : ""}
        </div>
      )}

      {/* Expanded: error message on failed runs */}
      {isSelected && run.status === "failed" && (
        <div
          style={{
            marginTop: "5px",
            padding: "4px 6px",
            borderRadius: "3px",
            background: "#ff444408",
            border: "1px solid #ff444422",
            fontSize: "7.5px",
            color: "#ff8888",
            letterSpacing: "0.03em",
          }}
        >
          {run.steps.find((s) => s.status === "failed")?.error_message ?? "Pipeline failed"}
        </div>
      )}
    </div>
  );
}

/** Pipeline definition card in the Library tab. */
function DefinitionCard({
  def,
  onTrigger,
  onAddToChain,
  isTriggerPending,
}: {
  def: PipelineDefinition;
  onTrigger: (name: string, roomId?: string) => void;
  onAddToChain: (name: string) => void;
  isTriggerPending: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      style={{
        padding: "7px 10px",
        borderRadius: "4px",
        border: `1px solid ${def.color}22`,
        background: `${def.color}05`,
        marginBottom: "4px",
      }}
    >
      {/* Header row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
        onClick={() => setIsExpanded((v) => !v)}
      >
        <span style={{ fontSize: "13px", color: def.color, flexShrink: 0 }}>{def.icon}</span>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div
            style={{
              fontSize: "9px",
              fontWeight: 600,
              color: "#aaaacc",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {def.label}
          </div>
          <div style={{ fontSize: "7px", color: "#444466" }}>
            {def.steps.length} steps
            {def.room_roles.length > 0 && ` · ${def.room_roles.join(", ")}`}
          </div>
        </div>
        {/* Tags */}
        <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
          {(def.tags ?? []).slice(0, 2).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: "6.5px",
                color: "#334466",
                padding: "1px 4px",
                border: "1px solid #223",
                borderRadius: "2px",
                letterSpacing: "0.04em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        {/* Add to chain */}
        <button
          onClick={(e) => { e.stopPropagation(); onAddToChain(def.pipeline_name); }}
          title="Add to chain"
          style={{
            fontFamily: FONT,
            fontSize: "7px",
            fontWeight: 700,
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: "2px",
            border: `1px solid ${def.color}33`,
            background: `${def.color}0a`,
            color: def.color + "88",
          }}
        >
          ⊕ CHAIN
        </button>
        {/* Trigger */}
        <button
          onClick={(e) => { e.stopPropagation(); onTrigger(def.pipeline_name); }}
          disabled={isTriggerPending}
          title={`Trigger "${def.label}"`}
          style={{
            fontFamily: FONT,
            fontSize: "7px",
            fontWeight: 700,
            cursor: isTriggerPending ? "default" : "pointer",
            padding: "2px 8px",
            borderRadius: "2px",
            border: `1px solid ${isTriggerPending ? "#222233" : def.color + "66"}`,
            background: isTriggerPending ? "transparent" : `${def.color}16`,
            color: isTriggerPending ? "#333355" : def.color,
          }}
        >
          {isTriggerPending ? "…" : "▶ RUN"}
        </button>
      </div>

      {/* Expanded: step list + description */}
      {isExpanded && (
        <div style={{ marginTop: "7px", paddingTop: "6px", borderTop: `1px solid ${def.color}22` }}>
          <div style={{ fontSize: "7.5px", color: "#667788", marginBottom: "6px", lineHeight: 1.6 }}>
            {def.description}
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {def.steps.map((step, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  border: `1px solid ${def.color}22`,
                  background: `${def.color}08`,
                  fontSize: "7px",
                  color: "#667788",
                }}
              >
                <span style={{ color: "#333355", fontWeight: 700 }}>{i + 1}.</span>
                {step}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Chain entry row with remove button. */
function ChainEntryRow({
  entry,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  entry: ChainEntry;
  index: number;
  total: number;
  onRemove: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const def = usePipelineStore.getState().definitions.find(
    (d) => d.pipeline_name === entry.pipeline_name,
  );
  const color = def?.color ?? "#6688aa";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 8px",
        borderRadius: "3px",
        border: `1px solid ${color}22`,
        background: `${color}06`,
        marginBottom: "3px",
      }}
    >
      <span style={{ fontSize: "9px", color, flexShrink: 0 }}>{def?.icon ?? "⬡"}</span>
      <span style={{ fontSize: "8px", color: "#aaaacc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {def?.label ?? entry.pipeline_name}
      </span>
      {/* Reorder */}
      <button
        onClick={onMoveUp}
        disabled={index === 0}
        style={{
          fontFamily: FONT, fontSize: "8px", cursor: index === 0 ? "default" : "pointer",
          padding: "1px 4px", borderRadius: "2px",
          border: "1px solid #222233", background: "transparent",
          color: index === 0 ? "#222233" : "#556677",
        }}
      >
        ↑
      </button>
      <button
        onClick={onMoveDown}
        disabled={index === total - 1}
        style={{
          fontFamily: FONT, fontSize: "8px", cursor: index === total - 1 ? "default" : "pointer",
          padding: "1px 4px", borderRadius: "2px",
          border: "1px solid #222233", background: "transparent",
          color: index === total - 1 ? "#222233" : "#556677",
        }}
      >
        ↓
      </button>
      <button
        onClick={() => onRemove(entry.id)}
        style={{
          fontFamily: FONT, fontSize: "7px", cursor: "pointer",
          padding: "1px 5px", borderRadius: "2px",
          border: "1px solid #ff444422", background: "transparent",
          color: "#ff6666",
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineCommandInterfaceProps {
  /** Start collapsed (default true). */
  defaultExpanded?: boolean;
}

/**
 * PipelineCommandInterface — 2D screen-space pipeline management HUD panel.
 *
 * Mount in App.tsx or HUD.tsx (rendered outside the Canvas).
 * Toggle with keyboard shortcut P.
 */
export function PipelineCommandInterface({
  defaultExpanded = false,
}: PipelineCommandInterfaceProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<"library" | "active" | "chain" | "history">("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Store selectors ────────────────────────────────────────────────────────
  const definitions    = usePipelineStore((s) => s.definitions);
  const runs           = usePipelineStore((s) => s.runs);
  const selectedRunId  = usePipelineStore((s) => s.selectedRunId);
  const chainBuilder   = usePipelineStore((s) => s.chainBuilder);
  const selectRun      = usePipelineStore((s) => s.selectRun);
  const removeEntry    = usePipelineStore((s) => s.removeChainEntry);
  const reorderEntries = usePipelineStore((s) => s.reorderChainEntries);
  const setLabel       = usePipelineStore((s) => s.setChainLabel);
  const setContinue    = usePipelineStore((s) => s.setContinueOnError);
  const clearEntries   = usePipelineStore((s) => s.clearChainEntries);
  const addChainEntry  = usePipelineStore((s) => s.addChainEntry);

  // ── Command actions ────────────────────────────────────────────────────────
  const {
    triggerPipeline,
    triggerChain,
    cancelPipeline,
    pendingTriggers,
    pendingCancels,
    lastError,
  } = usePipelineCommand();

  // ── Keyboard shortcut: P to toggle ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "p" &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        document.activeElement === document.body
      ) {
        setIsExpanded((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────

  const allRuns = [...runs.values()];
  const activeRuns = allRuns.filter((r) => r.status === "pending" || r.status === "running");
  const historyRuns = allRuns
    .filter((r) => r.status === "completed" || r.status === "failed" || r.status === "cancelled")
    .sort((a, b) => (b.completed_at_ms ?? 0) - (a.completed_at_ms ?? 0))
    .slice(0, 20);

  // Collect all unique tags for the filter bar
  const allTags = [...new Set(definitions.flatMap((d) => d.tags ?? []))].slice(0, 8);

  const filteredDefs = definitions.filter((d) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!d.label.toLowerCase().includes(q) && !d.pipeline_name.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (tagFilter && !(d.tags ?? []).includes(tagFilter)) return false;
    return true;
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleTrigger = useCallback(
    (pipeline_name: string) => {
      triggerPipeline(pipeline_name);
      setActiveTab("active");
    },
    [triggerPipeline],
  );

  const handleCancel = useCallback(
    (pipeline_id: string) => {
      cancelPipeline(pipeline_id, "user_requested");
    },
    [cancelPipeline],
  );

  const handleTriggerChain = useCallback(async () => {
    await triggerChain();
    setActiveTab("active");
  }, [triggerChain]);

  if (!isExpanded) {
    // Collapsed: show just the toggle button with active run count badge
    return (
      <div
        style={{
          position: "fixed",
          bottom: "64px",
          right: "16px",
          zIndex: 8000,
        }}
      >
        <button
          onClick={() => setIsExpanded(true)}
          title="Open Pipeline Command Interface (P)"
          style={{
            fontFamily: FONT,
            fontSize: "8px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: "pointer",
            padding: "5px 10px",
            borderRadius: "4px",
            border: `1px solid ${PANEL_ACCENT}44`,
            background: "rgba(4,4,12,0.95)",
            color: PANEL_ACCENT,
            display: "flex",
            alignItems: "center",
            gap: "5px",
            backdropFilter: "blur(8px)",
            boxShadow: `0 0 16px ${PANEL_ACCENT}18, 0 4px 16px rgba(0,0,0,0.6)`,
          }}
        >
          <span style={{ fontSize: "10px" }}>⬡</span>
          <span>PIPELINES</span>
          {activeRuns.length > 0 && (
            <span
              style={{
                padding: "1px 5px",
                borderRadius: "8px",
                background: "#44aaff22",
                border: "1px solid #44aaff44",
                color: "#44aaff",
                fontSize: "7px",
                fontWeight: 700,
              }}
            >
              {activeRuns.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        width: "440px",
        maxHeight: "580px",
        zIndex: 8000,
        background: "rgba(4,4,12,0.97)",
        border: `1px solid ${PANEL_ACCENT}44`,
        borderRadius: "8px",
        backdropFilter: "blur(16px)",
        boxShadow: `
          0 0 0 1px ${PANEL_ACCENT}18,
          0 0 32px ${PANEL_ACCENT}14,
          0 16px 48px rgba(0,0,0,0.85)
        `,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "10px 14px 8px",
          borderBottom: "1px solid #111122",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "12px", color: PANEL_ACCENT }}>⬡</span>
        <span
          style={{
            fontSize: "8px",
            fontWeight: 700,
            color: "#8888cc",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          PIPELINE COMMAND INTERFACE
        </span>
        {/* Chain entry badge */}
        {chainBuilder.entries.length > 0 && (
          <span
            style={{
              padding: "1px 5px",
              borderRadius: "8px",
              background: `${PANEL_ACCENT}22`,
              border: `1px solid ${PANEL_ACCENT}44`,
              color: PANEL_ACCENT,
              fontSize: "7px",
              fontWeight: 700,
            }}
          >
            CHAIN: {chainBuilder.entries.length}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Keyboard shortcut hint */}
        <span style={{ fontSize: "7px", color: "#222233" }}>[P]</span>
        {/* Collapse button */}
        <button
          onClick={() => setIsExpanded(false)}
          style={{
            fontFamily: FONT,
            fontSize: "9px",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: "3px",
            border: "1px solid #222233",
            background: "transparent",
            color: "#444466",
          }}
        >
          ✕
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div
        style={{
          display: "flex",
          gap: "0",
          borderBottom: "1px solid #111122",
          flexShrink: 0,
        }}
      >
        {(["library", "active", "chain", "history"] as const).map((tab) => {
          const label =
            tab === "active"
              ? `ACTIVE${activeRuns.length > 0 ? ` (${activeRuns.length})` : ""}`
              : tab === "chain"
              ? `CHAIN${chainBuilder.entries.length > 0 ? ` (${chainBuilder.entries.length})` : ""}`
              : tab.toUpperCase();
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontFamily: FONT,
                fontSize: "7px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                flex: 1,
                padding: "7px 4px",
                border: "none",
                borderBottom: `2px solid ${isActive ? PANEL_ACCENT : "transparent"}`,
                background: isActive ? `${PANEL_ACCENT}0a` : "transparent",
                color: isActive ? PANEL_ACCENT : "#333355",
                textTransform: "uppercase",
                transition: "all 0.15s ease",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Tab body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", minHeight: 0 }}>

        {/* ── Library ── */}
        {activeTab === "library" && (
          <>
            {/* Search + filter row */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px", alignItems: "center" }}>
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="Search pipelines…"
                style={{
                  flex: 1,
                  fontFamily: FONT,
                  fontSize: "8px",
                  color: "#aaaacc",
                  background: "rgba(8,8,20,0.8)",
                  border: "1px solid #222233",
                  borderRadius: "3px",
                  padding: "4px 8px",
                  outline: "none",
                  caretColor: PANEL_ACCENT,
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    fontFamily: FONT, fontSize: "8px",
                    cursor: "pointer", padding: "3px 6px",
                    borderRadius: "3px", border: "1px solid #222233",
                    background: "transparent", color: "#444466",
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Tag filter row */}
            {allTags.length > 0 && (
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "8px" }}>
                <button
                  onClick={() => setTagFilter("")}
                  style={{
                    fontFamily: FONT, fontSize: "6.5px",
                    cursor: "pointer", padding: "2px 6px",
                    borderRadius: "2px",
                    border: `1px solid ${tagFilter === "" ? PANEL_ACCENT + "55" : "#222233"}`,
                    background: tagFilter === "" ? `${PANEL_ACCENT}10` : "transparent",
                    color: tagFilter === "" ? PANEL_ACCENT : "#444466",
                  }}
                >
                  ALL
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tag === tagFilter ? "" : tag)}
                    style={{
                      fontFamily: FONT, fontSize: "6.5px",
                      cursor: "pointer", padding: "2px 6px",
                      borderRadius: "2px",
                      border: `1px solid ${tagFilter === tag ? PANEL_ACCENT + "55" : "#222233"}`,
                      background: tagFilter === tag ? `${PANEL_ACCENT}10` : "transparent",
                      color: tagFilter === tag ? PANEL_ACCENT : "#444466",
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Definition cards */}
            {filteredDefs.length === 0 ? (
              <div style={{ fontSize: "8px", color: "#333355", textAlign: "center", padding: "20px 0" }}>
                No pipelines match the current filter.
              </div>
            ) : (
              filteredDefs.map((def) => (
                <DefinitionCard
                  key={def.pipeline_name}
                  def={def}
                  onTrigger={handleTrigger}
                  onAddToChain={addChainEntry}
                  isTriggerPending={pendingTriggers.has(def.pipeline_name)}
                />
              ))
            )}
          </>
        )}

        {/* ── Active ── */}
        {activeTab === "active" && (
          <>
            {activeRuns.length === 0 ? (
              <div style={{ fontSize: "8px", color: "#333355", textAlign: "center", padding: "20px 0" }}>
                No active pipeline runs.
              </div>
            ) : (
              activeRuns.map((run) => (
                <RunRow
                  key={run.pipeline_id}
                  run={run}
                  onCancel={handleCancel}
                  isCancelling={pendingCancels.has(run.pipeline_id)}
                  onSelect={selectRun}
                  isSelected={selectedRunId === run.pipeline_id}
                />
              ))
            )}
          </>
        )}

        {/* ── Chain builder ── */}
        {activeTab === "chain" && (
          <>
            {/* Label input */}
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "7px", color: "#333355", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>
                CHAIN LABEL
              </div>
              <input
                value={chainBuilder.label}
                onChange={(e) => setLabel(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="Custom chain label (optional)…"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: FONT,
                  fontSize: "8px",
                  color: "#aaaacc",
                  background: "rgba(8,8,20,0.8)",
                  border: "1px solid #222233",
                  borderRadius: "3px",
                  padding: "4px 8px",
                  outline: "none",
                  caretColor: PANEL_ACCENT,
                }}
              />
            </div>

            {/* Continue on error toggle */}
            <div
              style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}
            >
              <button
                onClick={() => setContinue(!chainBuilder.continue_on_error)}
                style={{
                  fontFamily: FONT, fontSize: "7px", fontWeight: 700,
                  cursor: "pointer",
                  padding: "3px 10px", borderRadius: "3px",
                  border: `1px solid ${chainBuilder.continue_on_error ? "#00ff8844" : "#222233"}`,
                  background: chainBuilder.continue_on_error ? "#00ff8808" : "transparent",
                  color: chainBuilder.continue_on_error ? "#00ff88" : "#444466",
                }}
              >
                {chainBuilder.continue_on_error ? "✓ CONTINUE ON ERROR" : "○ STOP ON ERROR"}
              </button>
              <span style={{ fontSize: "7px", color: "#222233" }}>
                {chainBuilder.continue_on_error
                  ? "Chain continues even if a pipeline fails"
                  : "Chain stops if any pipeline fails"}
              </span>
            </div>

            {/* Chain entries */}
            <div style={{ fontSize: "7px", color: "#333355", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>
              PIPELINE SEQUENCE ({chainBuilder.entries.length})
            </div>
            {chainBuilder.entries.length === 0 ? (
              <div
                style={{
                  padding: "12px",
                  border: "1px dashed #222233",
                  borderRadius: "4px",
                  textAlign: "center",
                  fontSize: "7.5px",
                  color: "#333355",
                  marginBottom: "8px",
                }}
              >
                Add pipelines from the Library tab using the ⊕ CHAIN button.
              </div>
            ) : (
              <div style={{ marginBottom: "8px" }}>
                {chainBuilder.entries.map((entry, i) => (
                  <ChainEntryRow
                    key={entry.id}
                    entry={entry}
                    index={i}
                    total={chainBuilder.entries.length}
                    onRemove={removeEntry}
                    onMoveUp={() => reorderEntries(i, i - 1)}
                    onMoveDown={() => reorderEntries(i, i + 1)}
                  />
                ))}
              </div>
            )}

            {/* Chain action buttons */}
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={handleTriggerChain}
                disabled={chainBuilder.entries.length === 0}
                style={{
                  fontFamily: FONT, fontSize: "8px", fontWeight: 700,
                  letterSpacing: "0.08em",
                  cursor: chainBuilder.entries.length === 0 ? "default" : "pointer",
                  flex: 1, padding: "6px 10px", borderRadius: "4px",
                  border: `1px solid ${chainBuilder.entries.length === 0 ? "#222233" : PANEL_ACCENT + "66"}`,
                  background: chainBuilder.entries.length === 0 ? "transparent" : `${PANEL_ACCENT}16`,
                  color: chainBuilder.entries.length === 0 ? "#333355" : PANEL_ACCENT,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                }}
              >
                <span>⬡→</span>
                <span>
                  {chainBuilder.entries.length > 0
                    ? `TRIGGER CHAIN (${chainBuilder.entries.length})`
                    : "TRIGGER CHAIN"}
                </span>
              </button>
              <button
                onClick={clearEntries}
                disabled={chainBuilder.entries.length === 0}
                style={{
                  fontFamily: FONT, fontSize: "7.5px",
                  cursor: chainBuilder.entries.length === 0 ? "default" : "pointer",
                  padding: "6px 10px", borderRadius: "4px",
                  border: `1px solid ${chainBuilder.entries.length === 0 ? "#1a1a2e" : "#ff444422"}`,
                  background: "transparent",
                  color: chainBuilder.entries.length === 0 ? "#222233" : "#ff6666",
                }}
              >
                CLEAR
              </button>
            </div>
          </>
        )}

        {/* ── History ── */}
        {activeTab === "history" && (
          <>
            {historyRuns.length === 0 ? (
              <div style={{ fontSize: "8px", color: "#333355", textAlign: "center", padding: "20px 0" }}>
                No completed pipeline runs yet.
              </div>
            ) : (
              historyRuns.map((run) => (
                <RunRow
                  key={run.pipeline_id}
                  run={run}
                  onSelect={selectRun}
                  isSelected={selectedRunId === run.pipeline_id}
                />
              ))
            )}
          </>
        )}

        {/* ── Error message ── */}
        {lastError && (
          <div
            style={{
              marginTop: "8px",
              padding: "6px 8px",
              borderRadius: "3px",
              border: "1px solid #ff444422",
              background: "#ff44440a",
              fontSize: "7.5px",
              color: "#ff6666",
              letterSpacing: "0.03em",
            }}
          >
            ✗ {lastError}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          padding: "6px 14px",
          borderTop: "1px solid #111122",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "6.5px", color: "#1e1e2e", letterSpacing: "0.06em" }}>
          {definitions.length} PIPELINES DEFINED
        </span>
        <span style={{ fontSize: "6.5px", color: "#1e1e2e", letterSpacing: "0.06em" }}>
          PIPELINE ⬡ EVENT-SOURCED · [P] TOGGLE
        </span>
      </div>
    </div>
  );
}
