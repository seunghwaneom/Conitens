/**
 * PipelineDiegeticPanel — Diegetic 3D in-world pipeline command terminal.
 *
 * Sub-AC 7.2: Pipeline command interface from 3D room/office objects.
 *
 * Renders as a world-anchored HTML panel (via @react-three/drei Html) that
 * appears at room level when the user drills into a room.  Provides:
 *
 *   PIPELINE LIBRARY  — scrollable list of available pipelines filtered by
 *                        the room's role, with TRIGGER / CHAIN buttons
 *   ACTIVE RUNS       — live step-progress indicators for running pipelines
 *   CHAIN BUILDER     — inline add-to-chain button and chain trigger
 *   CANCEL            — cancel buttons on active/pending runs
 *
 * Design principles
 * ─────────────────
 *   - Diegetic: world-space HTML panel, not a screen overlay
 *   - Dark monospace terminal aesthetic matching the command-center theme
 *   - All dispatched commands are event-sourced through pipeline-store and
 *     the command-file writer (record transparency)
 *   - Optimistic UI: status shown immediately, reverted on error
 *   - Step-rail dot indicators for running pipelines (matching ReplayPipelineLayer style)
 *
 * Visibility rule
 * ──────────────
 * The panel is only visible when:
 *   drillLevel === "room" && drillRoom === room.id
 *
 * Positioning
 * ──────────
 * World-space position is derived from the room's center position passed as
 * a prop from SceneHierarchy / RoomGeometry parent nodes.
 */

import { useState, useCallback } from "react";
import { Html } from "@react-three/drei";
import { usePipelineStore } from "../store/pipeline-store.js";
import { usePipelineCommand } from "../hooks/use-pipeline-command.js";
import { useSpatialStore } from "../store/spatial-store.js";
import type { PipelineDefinition, PipelineRun } from "../store/pipeline-store.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** World-space Y position of the panel above the room floor. */
const PANEL_Y = 2.8;

/** Shared monospace font stack. */
const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

/** Max pipeline definitions shown in the library panel. */
const MAX_LIBRARY_DISPLAY = 6;

/** Max active runs shown in the active panel. */
const MAX_ACTIVE_DISPLAY = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Status styling helpers
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
    default:          return "#333355"; // pending
  }
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Step-rail dot indicator row for a pipeline run. */
function StepRailDots({ run }: { run: PipelineRun }) {
  if (run.steps.length === 0) {
    // Unknown steps — show indeterminate dots based on definition
    return (
      <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: i === 0 && run.status === "running" ? "#44aaff" : "#222233",
              boxShadow: i === 0 && run.status === "running" ? "0 0 4px #44aaff88" : "none",
            }}
          />
        ))}
        <span style={{ fontSize: "6px", color: "#333355", letterSpacing: "0.06em" }}>
          {run.status === "running" ? "RUNNING" : run.status.toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "3px", alignItems: "center", flexWrap: "wrap" }}>
      {run.steps.map((step) => {
        const color = getStepColor(step.status);
        const isActive = step.status === "started";
        return (
          <div
            key={step.step_index}
            title={`${step.step_name}: ${step.status}`}
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: color,
              boxShadow: isActive ? `0 0 5px ${color}88` : "none",
              transition: "background 0.3s ease, box-shadow 0.3s ease",
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

/** Single active run card. */
function ActiveRunCard({
  run,
  onCancel,
  isCancelling,
}: {
  run: PipelineRun;
  onCancel: (id: string) => void;
  isCancelling: boolean;
}) {
  const statusColor = getStatusColor(run.status);
  const completedSteps = run.steps.filter((s) => s.status === "completed").length;
  const totalSteps = run.steps.length;
  const progress = totalSteps > 0 ? completedSteps / totalSteps : 0;
  const canCancel = run.status === "pending" || run.status === "running";

  return (
    <div
      style={{
        padding: "6px 8px",
        borderRadius: "4px",
        border: `1px solid ${statusColor}22`,
        background: `${statusColor}06`,
        marginBottom: "4px",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
        {/* Status dot */}
        <div
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: statusColor,
            boxShadow: run.status === "running" ? `0 0 5px ${statusColor}88` : "none",
            flexShrink: 0,
          }}
        />
        {/* Pipeline name */}
        <span
          style={{
            fontSize: "7.5px",
            fontWeight: 600,
            color: "#aaaacc",
            letterSpacing: "0.05em",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {run.pipeline_name}
        </span>
        {/* Duration */}
        {run.duration_ms !== undefined && (
          <span style={{ fontSize: "6.5px", color: "#444466", letterSpacing: "0.04em" }}>
            {formatDuration(run.duration_ms)}
          </span>
        )}
        {/* Cancel button */}
        {canCancel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel(run.pipeline_id);
            }}
            disabled={isCancelling}
            title="Cancel this pipeline"
            style={{
              fontFamily: FONT,
              fontSize: "6px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              cursor: isCancelling ? "default" : "pointer",
              padding: "1px 5px",
              borderRadius: "2px",
              border: "1px solid #ff444422",
              background: isCancelling ? "transparent" : "#ff44440a",
              color: isCancelling ? "#333344" : "#ff6666",
              flexShrink: 0,
              lineHeight: 1.4,
            }}
          >
            {isCancelling ? "…" : "✕"}
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
            marginBottom: "4px",
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
      <StepRailDots run={run} />

      {/* Current step name */}
      {run.current_step_index >= 0 && run.steps[run.current_step_index] && (
        <div
          style={{
            fontSize: "6px",
            color: "#444466",
            letterSpacing: "0.04em",
            marginTop: "3px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          ▷ {run.steps[run.current_step_index]!.step_name}
        </div>
      )}
    </div>
  );
}

/** Single pipeline definition card in the library. */
function PipelineLibraryCard({
  def,
  onTrigger,
  onAddToChain,
  isTriggerPending,
}: {
  def: PipelineDefinition;
  onTrigger: (name: string) => void;
  onAddToChain: (name: string) => void;
  isTriggerPending: boolean;
}) {
  return (
    <div
      style={{
        padding: "5px 7px",
        borderRadius: "4px",
        border: `1px solid ${def.color}22`,
        background: `${def.color}06`,
        marginBottom: "3px",
        display: "flex",
        alignItems: "center",
        gap: "5px",
      }}
    >
      {/* Icon + name */}
      <span style={{ fontSize: "10px", color: def.color, flexShrink: 0 }}>{def.icon}</span>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div
          style={{
            fontSize: "7.5px",
            fontWeight: 600,
            color: "#aaaacc",
            letterSpacing: "0.05em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {def.label}
        </div>
        <div
          style={{
            fontSize: "6px",
            color: "#444466",
            letterSpacing: "0.03em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {def.steps.length} step{def.steps.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ADD TO CHAIN button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAddToChain(def.pipeline_name);
        }}
        title={`Add "${def.label}" to chain`}
        style={{
          fontFamily: FONT,
          fontSize: "6px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          cursor: "pointer",
          padding: "2px 5px",
          borderRadius: "2px",
          border: `1px solid ${def.color}33`,
          background: `${def.color}0a`,
          color: def.color + "88",
          lineHeight: 1.4,
          flexShrink: 0,
        }}
      >
        ⊕ CHAIN
      </button>

      {/* TRIGGER button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTrigger(def.pipeline_name);
        }}
        disabled={isTriggerPending}
        title={`Trigger "${def.label}"`}
        style={{
          fontFamily: FONT,
          fontSize: "6px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          cursor: isTriggerPending ? "default" : "pointer",
          padding: "2px 6px",
          borderRadius: "2px",
          border: `1px solid ${isTriggerPending ? "#222233" : def.color + "66"}`,
          background: isTriggerPending ? "rgba(20,20,32,0.5)" : `${def.color}16`,
          color: isTriggerPending ? "#333355" : def.color,
          lineHeight: 1.4,
          flexShrink: 0,
          transition: "all 0.15s ease",
        }}
      >
        {isTriggerPending ? "…" : "▶ RUN"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineDiegeticPanelProps {
  /** World-space position of the room centre (x, z). Y is fixed at PANEL_Y. */
  position: [number, number, number];
  /** The room id this panel is anchored to. */
  roomId: string;
  /** The room's role — used to filter relevant pipeline definitions. */
  roomRole: string;
  /** Accent color matching the room's visual identity. */
  accentColor?: string;
}

/**
 * PipelineDiegeticPanel — world-anchored HTML pipeline control terminal.
 *
 * Only visible when the user has drilled into the matching room.
 */
export function PipelineDiegeticPanel({
  position,
  roomId,
  roomRole,
  accentColor = "#44aaff",
}: PipelineDiegeticPanelProps) {
  // ── Visibility guard ──────────────────────────────────────────────────────
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillRoom  = useSpatialStore((s) => s.drillRoom);
  const isVisible  = drillLevel === "room" && drillRoom === roomId;

  // ── Pipeline state ────────────────────────────────────────────────────────
  const definitions    = usePipelineStore((s) => s.getDefinitionsForRoom(roomRole));
  const runs           = usePipelineStore((s) => s.runs);
  const addChainEntry  = usePipelineStore((s) => s.addChainEntry);
  const chainEntries   = usePipelineStore((s) => s.chainBuilder.entries);
  const openChainBuilder = usePipelineStore((s) => s.openChainBuilder);
  const triggerChain   = usePipelineStore((s) => s.chainBuilder);

  // ── Command actions ───────────────────────────────────────────────────────
  const {
    triggerPipeline,
    triggerChain: dispatchChain,
    cancelPipeline,
    pendingTriggers,
    pendingCancels,
    lastError,
  } = usePipelineCommand();

  // ── Local UI state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"library" | "active">("library");
  const [libPage, setLibPage] = useState(0);

  // Active runs for this room
  const activeRuns = [...runs.values()].filter(
    (r) => r.room_id === roomId && (r.status === "pending" || r.status === "running"),
  );

  // Recent completed/failed runs for this room (up to 3)
  const recentRuns = [...runs.values()]
    .filter(
      (r) =>
        r.room_id === roomId &&
        (r.status === "completed" || r.status === "failed" || r.status === "cancelled"),
    )
    .sort((a, b) => (b.completed_at_ms ?? 0) - (a.completed_at_ms ?? 0))
    .slice(0, 3);

  // Library pagination
  const libStart = libPage * MAX_LIBRARY_DISPLAY;
  const libDefs  = definitions.slice(libStart, libStart + MAX_LIBRARY_DISPLAY);
  const hasNextPage = (libStart + MAX_LIBRARY_DISPLAY) < definitions.length;
  const hasPrevPage = libPage > 0;

  // Chain entry count
  const chainCount = chainEntries.length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleTrigger = useCallback(
    (pipeline_name: string) => {
      triggerPipeline(pipeline_name, { room_id: roomId });
      setActiveTab("active");
    },
    [triggerPipeline, roomId],
  );

  const handleAddToChain = useCallback(
    (pipeline_name: string) => {
      addChainEntry(pipeline_name);
    },
    [addChainEntry],
  );

  const handleTriggerChain = useCallback(async () => {
    await dispatchChain({ room_id: roomId });
    setActiveTab("active");
  }, [dispatchChain, roomId]);

  const handleCancel = useCallback(
    (pipeline_id: string) => {
      cancelPipeline(pipeline_id, "user_requested");
    },
    [cancelPipeline],
  );

  if (!isVisible) return null;

  return (
    <Html
      position={position.map((v, i) => (i === 1 ? PANEL_Y : v)) as [number, number, number]}
      center
      distanceFactor={8}
      zIndexRange={[200, 0]}
      style={{ pointerEvents: "none" }}
    >
      {/*
       * Outer wrapper: pointer-events none (set on Html above).
       * Inner container re-enables pointer events for button/tab interactions.
       * stopPropagation prevents events from leaking into the 3D canvas.
       */}
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          pointerEvents: "auto",
          minWidth: "280px",
          maxWidth: "320px",
          maxHeight: "400px",
          background: "rgba(4, 4, 12, 0.97)",
          border: `1px solid ${accentColor}44`,
          borderRadius: "6px",
          padding: "10px 12px",
          backdropFilter: "blur(12px)",
          boxShadow: `
            0 0 0 1px ${accentColor}18,
            0 0 32px ${accentColor}14,
            0 12px 32px rgba(0,0,0,0.80)
          `,
          fontFamily: FONT,
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Panel header ── */}
        <div
          style={{
            fontSize: "7px",
            color: "#333355",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span style={{ color: accentColor + "99" }}>⬡</span>
          <span>PIPELINE CONTROL</span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: "6.5px",
              color: accentColor + "88",
              fontWeight: 600,
              letterSpacing: "0.06em",
            }}
          >
            {roomRole.toUpperCase()}
          </span>
          {/* Active run count badge */}
          {activeRuns.length > 0 && (
            <span
              style={{
                padding: "1px 4px",
                borderRadius: "10px",
                background: "#44aaff22",
                border: "1px solid #44aaff44",
                fontSize: "6px",
                color: "#44aaff",
                fontWeight: 700,
                letterSpacing: "0.06em",
                flexShrink: 0,
              }}
            >
              {activeRuns.length} ACTIVE
            </span>
          )}
        </div>

        {/* ── Separator ── */}
        <div
          style={{
            height: "1px",
            background: `linear-gradient(90deg, ${accentColor}33 0%, transparent 100%)`,
            marginBottom: "8px",
          }}
        />

        {/* ── Tab bar ── */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "8px",
          }}
        >
          {(["library", "active"] as const).map((tab) => (
            <button
              key={tab}
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab(tab);
              }}
              style={{
                fontFamily: FONT,
                fontSize: "6.5px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                padding: "2px 8px",
                borderRadius: "3px",
                border: `1px solid ${activeTab === tab ? accentColor + "66" : "#222233"}`,
                background: activeTab === tab ? `${accentColor}16` : "transparent",
                color: activeTab === tab ? accentColor : "#333355",
                textTransform: "uppercase",
                lineHeight: 1.5,
                transition: "all 0.15s ease",
              }}
            >
              {tab === "active"
                ? `ACTIVE${activeRuns.length > 0 ? ` (${activeRuns.length})` : ""}`
                : "LIBRARY"}
            </button>
          ))}
        </div>

        {/* ── Tab: Library ── */}
        {activeTab === "library" && (
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {libDefs.length === 0 ? (
              <div
                style={{ fontSize: "7px", color: "#333355", textAlign: "center", padding: "12px 0" }}
              >
                No pipelines available for this room role.
              </div>
            ) : (
              libDefs.map((def) => (
                <PipelineLibraryCard
                  key={def.pipeline_name}
                  def={def}
                  onTrigger={handleTrigger}
                  onAddToChain={handleAddToChain}
                  isTriggerPending={pendingTriggers.has(def.pipeline_name)}
                />
              ))
            )}

            {/* Pagination */}
            {(hasPrevPage || hasNextPage) && (
              <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setLibPage((p) => p - 1); }}
                  disabled={!hasPrevPage}
                  style={{
                    fontFamily: FONT, fontSize: "6px", fontWeight: 700,
                    cursor: hasPrevPage ? "pointer" : "default",
                    padding: "2px 6px", borderRadius: "2px",
                    border: `1px solid ${hasPrevPage ? "#334466" : "#1a1a2e"}`,
                    background: "transparent",
                    color: hasPrevPage ? "#6688aa" : "#222233",
                  }}
                >
                  ‹ PREV
                </button>
                <span style={{ flex: 1 }} />
                <button
                  onClick={(e) => { e.stopPropagation(); setLibPage((p) => p + 1); }}
                  disabled={!hasNextPage}
                  style={{
                    fontFamily: FONT, fontSize: "6px", fontWeight: 700,
                    cursor: hasNextPage ? "pointer" : "default",
                    padding: "2px 6px", borderRadius: "2px",
                    border: `1px solid ${hasNextPage ? "#334466" : "#1a1a2e"}`,
                    background: "transparent",
                    color: hasNextPage ? "#6688aa" : "#222233",
                  }}
                >
                  NEXT ›
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Active runs ── */}
        {activeTab === "active" && (
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {activeRuns.length === 0 && recentRuns.length === 0 ? (
              <div
                style={{ fontSize: "7px", color: "#333355", textAlign: "center", padding: "12px 0" }}
              >
                No active pipelines.
              </div>
            ) : (
              <>
                {activeRuns.slice(0, MAX_ACTIVE_DISPLAY).map((run) => (
                  <ActiveRunCard
                    key={run.pipeline_id}
                    run={run}
                    onCancel={handleCancel}
                    isCancelling={pendingCancels.has(run.pipeline_id)}
                  />
                ))}

                {/* Recent terminal runs */}
                {recentRuns.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: "6px",
                        color: "#222233",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        marginTop: "6px",
                        marginBottom: "3px",
                        borderTop: "1px solid #111122",
                        paddingTop: "5px",
                      }}
                    >
                      RECENT
                    </div>
                    {recentRuns.map((run) => (
                      <ActiveRunCard
                        key={run.pipeline_id}
                        run={run}
                        onCancel={handleCancel}
                        isCancelling={pendingCancels.has(run.pipeline_id)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Chain builder strip ── */}
        {chainCount > 0 && (
          <div
            style={{
              marginTop: "8px",
              paddingTop: "6px",
              borderTop: "1px solid #1a1a2e",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {/* Chain entry pills */}
              <div style={{ display: "flex", gap: "3px", flex: 1, overflowX: "hidden" }}>
                {chainEntries.slice(0, 4).map((entry, i) => {
                  const def = definitions.find((d) => d.pipeline_name === entry.pipeline_name);
                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                        padding: "1px 4px",
                        borderRadius: "3px",
                        border: `1px solid ${def?.color ?? "#334466"}33`,
                        background: `${def?.color ?? "#334466"}0a`,
                        fontSize: "6px",
                        color: def?.color ?? "#6688aa",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        flexShrink: 0,
                      }}
                    >
                      {def?.icon ?? "⬡"}
                      {i < chainEntries.length - 1 && (
                        <span style={{ color: "#333355" }}>→</span>
                      )}
                    </div>
                  );
                })}
                {chainCount > 4 && (
                  <span style={{ fontSize: "6px", color: "#333355" }}>
                    +{chainCount - 4}
                  </span>
                )}
              </div>

              {/* TRIGGER CHAIN button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTriggerChain();
                }}
                title={`Trigger chain of ${chainCount} pipeline${chainCount !== 1 ? "s" : ""}`}
                style={{
                  fontFamily: FONT,
                  fontSize: "6.5px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  padding: "3px 8px",
                  borderRadius: "3px",
                  border: `1px solid ${accentColor}55`,
                  background: `${accentColor}16`,
                  color: accentColor,
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  lineHeight: 1.4,
                  flexShrink: 0,
                  transition: "all 0.15s ease",
                }}
              >
                <span>⬡→</span>
                <span>RUN CHAIN ({chainCount})</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Error message ── */}
        {lastError && (
          <div
            style={{
              marginTop: "6px",
              padding: "4px 6px",
              borderRadius: "3px",
              border: "1px solid #ff444422",
              background: "#ff44440a",
              fontSize: "6.5px",
              color: "#ff6666",
              letterSpacing: "0.03em",
              lineHeight: 1.5,
            }}
          >
            ✗ {lastError}
          </div>
        )}

        {/* ── Footer ── */}
        <div
          style={{
            marginTop: "6px",
            paddingTop: "5px",
            borderTop: "1px solid #111122",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "6px", color: "#1e1e2e", letterSpacing: "0.06em" }}>
            {roomId.toUpperCase().slice(0, 16)}
          </span>
          <span style={{ fontSize: "6px", color: "#1e1e2e", letterSpacing: "0.06em" }}>
            PIPELINE ⬡ EVENT-SOURCED
          </span>
        </div>
      </div>
    </Html>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene layer — renders panels for all rooms when drill level is "room"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PipelineDiegeticLayer — renders PipelineDiegeticPanel for the currently-drilled room.
 *
 * Placed inside the Canvas in CommandCenterScene.tsx.
 * Reads the drilled room from the spatial store and renders one panel
 * at the room's computed world position.
 *
 * Position computation: for now we use the room centre from the spatial store
 * (or a sensible default if unavailable — the panel is hidden when drillLevel
 * is not "room" so the exact position only matters in-context).
 */
export function PipelineDiegeticLayer() {
  const drillLevel = useSpatialStore((s) => s.drillLevel);
  const drillRoom  = useSpatialStore((s) => s.drillRoom);
  const rooms      = useSpatialStore((s) => s.building.rooms);

  if (drillLevel !== "room" || !drillRoom) return null;

  // RoomDef uses roomId (not id) as the identifier field
  const room = rooms.find((r) => r.roomId === drillRoom);
  if (!room) return null;

  // Use room spatial data from positionHint.center (most accurate) or position
  const center = room.positionHint?.center ?? room.position;
  const pos: [number, number, number] = center
    ? [center.x, 0, center.z]
    : [6, 0, 3];

  // RoomDef uses colorAccent (not color) and roomType (not type)
  const accentColor = room.colorAccent ?? "#44aaff";
  const roomRole    = room.roomType ?? "office";

  return (
    <PipelineDiegeticPanel
      position={pos}
      roomId={drillRoom}
      roomRole={roomRole}
      accentColor={accentColor}
    />
  );
}
