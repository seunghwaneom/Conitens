/**
 * ReplayPipelineLayer.tsx — Sub-AC 9d
 *
 * 3D diegetic visualization of reconstructed pipeline states during scene replay.
 *
 * Each active pipeline is rendered as a floating low-poly status panel above
 * the building, encoding:
 *   - Pipeline name (HTML text badge)
 *   - Current step (highlighted segment in step-rail)
 *   - Overall status (color-coded: running=cyan, completed=green, failed=red)
 *   - Step progress (filled arc / fractional progress bar)
 *   - Step count (small dot rail — active dot glows)
 *
 * This layer reads directly from `useReplayControllerStore` (no prop-drilling
 * required).  It renders ONLY when:
 *   1. mode === "replay"
 *   2. At least one pipeline exists in the reconstructed scene state
 *
 * Visual language (dark-theme command-center palette):
 *   Running   → #00ccff (cyan)
 *   Completed → #00cc66 (green)
 *   Failed    → #ff4466 (red)
 *
 * Performance:
 *   - All per-pipeline geometry is created via useMemo and disposed on unmount
 *   - Animations run in useFrame without React state updates per frame
 *   - Panel count is limited to MAX_VISIBLE_PIPELINES (10) to keep frame budget
 *
 * Event sourcing:
 *   This layer is purely presentational — it reads from the reconstruction
 *   result and writes no new events.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useReplayStore } from "../store/replay-store.js";
import {
  useReplayControllerStore,
} from "../hooks/use-replay-controller.js";
import type { ReconstructedPipelineState } from "../replay/state-reconstruction-engine.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of pipeline panels rendered simultaneously (frame-budget cap). */
const MAX_VISIBLE_PIPELINES = 10;

/** World-space Y position of the first pipeline panel (above building roof). */
const PANEL_BASE_Y = 8.0;

/** Vertical gap between stacked pipeline panels. */
const PANEL_STEP_Y = 1.4;

/** Panel dimensions (world units). */
const PANEL_W = 3.6;
const PANEL_H = 0.8;
const PANEL_D = 0.04;

/** X origin of the pipeline column (right side of building). */
const PANEL_START_X = 13.5;

/** Z centre of the pipeline column. */
const PANEL_Z = 3.0;

// ── Color map ─────────────────────────────────────────────────────────────────

function statusColor(status: ReconstructedPipelineState["status"]): string {
  switch (status) {
    case "running":   return "#00ccff";
    case "completed": return "#00cc66";
    case "failed":    return "#ff4466";
  }
}

function statusEmissive(status: ReconstructedPipelineState["status"]): string {
  switch (status) {
    case "running":   return "#004466";
    case "completed": return "#004422";
    case "failed":    return "#440022";
  }
}

// ── StepRail — row of dots showing step progress ──────────────────────────────

interface StepRailProps {
  steps: string[];
  currentStep: string | null;
  status: ReconstructedPipelineState["status"];
  panelX: number;
  panelY: number;
}

function StepRail({ steps, currentStep, status, panelX, panelY }: StepRailProps) {
  const color        = statusColor(status);
  const totalSteps   = steps.length;
  if (totalSteps === 0) return null;

  const dotSpacing = Math.min(0.26, (PANEL_W - 0.3) / totalSteps);
  const startX     = panelX - (dotSpacing * (totalSteps - 1)) / 2;
  const dotY       = panelY - 0.15;
  const currentIdx = currentStep ? steps.indexOf(currentStep) : -1;

  return (
    <>
      {steps.map((step, idx) => {
        const isActive    = idx === currentIdx;
        const isCompleted = idx < currentIdx || status === "completed";
        const dotColor    = isActive || isCompleted ? color : "#333355";
        const dotEmissive = isActive ? color : "#000000";
        const dotSize     = isActive ? 0.055 : 0.040;

        return (
          <mesh
            key={`${step}-${idx}`}
            position={[startX + idx * dotSpacing, dotY, PANEL_D + 0.01]}
            renderOrder={998}
          >
            <sphereGeometry args={[dotSize, 5, 4]} />
            <meshStandardMaterial
              color={dotColor}
              emissive={dotEmissive}
              emissiveIntensity={isActive ? 1.2 : 0}
              roughness={0.4}
              metalness={0.3}
              flatShading
              depthTest={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

// ── PipelinePanel — single pipeline card ─────────────────────────────────────

interface PipelinePanelProps {
  pipeline: ReconstructedPipelineState;
  index: number;
}

function PipelinePanel({ pipeline, index }: PipelinePanelProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const color   = statusColor(pipeline.status);
  const emissive = statusEmissive(pipeline.status);

  const panelX = PANEL_START_X + PANEL_W / 2;
  const panelY = PANEL_BASE_Y + index * PANEL_STEP_Y;

  // Subtle pulse for running pipelines
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    if (pipeline.status !== "running") return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.08 + Math.sin(clock.getElapsedTime() * 2.0 + index * 0.7) * 0.06;
  });

  // Progress fraction (0..1) based on step position
  const stepProgress = useMemo(() => {
    if (pipeline.steps.length === 0) return 0;
    if (pipeline.status === "completed") return 1;
    if (pipeline.status === "failed") return pipeline.currentStep
      ? (pipeline.steps.indexOf(pipeline.currentStep) + 0.5) / pipeline.steps.length
      : 0;
    if (!pipeline.currentStep) return 0;
    const idx = pipeline.steps.indexOf(pipeline.currentStep);
    return idx < 0 ? 0 : (idx + 0.5) / pipeline.steps.length;
  }, [pipeline.steps, pipeline.currentStep, pipeline.status]);

  // Progress bar geometry (filled portion)
  const progressWidth = Math.max(0.02, (PANEL_W - 0.3) * stepProgress);

  return (
    <group name={`replay-pipeline-${pipeline.pipelineId}`}>
      {/* Main backing panel */}
      <mesh
        ref={meshRef}
        position={[panelX, panelY, PANEL_Z]}
        renderOrder={997}
      >
        <boxGeometry args={[PANEL_W, PANEL_H, PANEL_D]} />
        <meshStandardMaterial
          color="#0a0a1e"
          emissive={emissive}
          emissiveIntensity={0.08}
          roughness={0.9}
          metalness={0.1}
          flatShading
          depthTest={false}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Accent strip (left edge) */}
      <mesh
        position={[PANEL_START_X + 0.04, panelY, PANEL_Z + PANEL_D / 2 + 0.005]}
        renderOrder={998}
      >
        <boxGeometry args={[0.07, PANEL_H - 0.1, 0.01]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          roughness={0.3}
          metalness={0.5}
          depthTest={false}
        />
      </mesh>

      {/* Progress bar track */}
      <mesh
        position={[PANEL_START_X + 0.15 + (PANEL_W - 0.3) / 2, panelY - 0.25, PANEL_Z + PANEL_D / 2 + 0.005]}
        renderOrder={998}
      >
        <boxGeometry args={[PANEL_W - 0.3, 0.04, 0.01]} />
        <meshBasicMaterial
          color="#1a1a3a"
          transparent
          opacity={0.6}
          depthTest={false}
        />
      </mesh>

      {/* Progress bar fill */}
      {progressWidth > 0.02 && (
        <mesh
          position={[
            PANEL_START_X + 0.15 + progressWidth / 2,
            panelY - 0.25,
            PANEL_Z + PANEL_D / 2 + 0.008,
          ]}
          renderOrder={999}
        >
          <boxGeometry args={[progressWidth, 0.04, 0.01]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.9}
            roughness={0.2}
            depthTest={false}
          />
        </mesh>
      )}

      {/* Step dots */}
      <StepRail
        steps={pipeline.steps}
        currentStep={pipeline.currentStep}
        status={pipeline.status}
        panelX={panelX}
        panelY={panelY}
      />

      {/* Diegetic HTML label */}
      <Html
        position={[PANEL_START_X + 0.16, panelY + 0.12, PANEL_Z + PANEL_D]}
        distanceFactor={10}
        style={{ pointerEvents: "none" }}
        occlude={false}
      >
        <div
          style={{
            display:      "flex",
            flexDirection: "column",
            gap:          "1px",
            whiteSpace:   "nowrap",
            transform:    "translate(0, -50%)",
          }}
        >
          {/* Pipeline name */}
          <span
            style={{
              color:       color,
              fontSize:    "8px",
              fontFamily:  "'JetBrains Mono', monospace",
              fontWeight:  700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {pipeline.pipelineName || pipeline.pipelineId}
          </span>

          {/* Current step */}
          {pipeline.currentStep && (
            <span
              style={{
                color:      "#8888aa",
                fontSize:   "7px",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.04em",
              }}
            >
              ▸ {pipeline.currentStep}
            </span>
          )}
        </div>
      </Html>

      {/* Status badge (top-right corner of panel) */}
      <Html
        position={[PANEL_START_X + PANEL_W - 0.05, panelY + 0.25, PANEL_Z + PANEL_D]}
        distanceFactor={10}
        style={{ pointerEvents: "none" }}
        occlude={false}
      >
        <span
          style={{
            color:         color,
            fontSize:      "6px",
            fontFamily:    "'JetBrains Mono', monospace",
            fontWeight:    600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity:       0.85,
          }}
        >
          {pipeline.status.toUpperCase()}
        </span>
      </Html>
    </group>
  );
}

// ── Column header ─────────────────────────────────────────────────────────────

function PipelineColumnHeader({ count }: { count: number }) {
  return (
    <group name="replay-pipeline-header">
      {/* Vertical separator line connecting panels to building */}
      <mesh
        position={[PANEL_START_X - 0.02, (PANEL_BASE_Y + count * PANEL_STEP_Y) / 2, PANEL_Z]}
        renderOrder={996}
      >
        <boxGeometry args={[0.03, PANEL_BASE_Y + count * PANEL_STEP_Y, 0.01]} />
        <meshBasicMaterial color="#4a6aff" transparent opacity={0.25} depthTest={false} />
      </mesh>

      {/* Column label */}
      <Html
        position={[PANEL_START_X + PANEL_W / 2, PANEL_BASE_Y + count * PANEL_STEP_Y + 0.6, PANEL_Z]}
        distanceFactor={12}
        style={{ pointerEvents: "none" }}
        occlude={false}
      >
        <div
          style={{
            color:         "#4a6aff",
            fontSize:      "7px",
            fontFamily:    "'JetBrains Mono', monospace",
            fontWeight:    600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            opacity:       0.75,
            textAlign:     "center",
          }}
        >
          ⏪ REPLAY PIPELINES · {count}
        </div>
      </Html>
    </group>
  );
}

// ── Layer entry point ─────────────────────────────────────────────────────────

/**
 * ReplayPipelineLayer — Renders active pipeline states during scene replay.
 *
 * Place inside the R3F <Canvas> (within <CommandCenterScene>).
 * Reads from useReplayControllerStore — no props needed.
 *
 * Guard: renders nothing in live mode or when there are no pipelines.
 */
export function ReplayPipelineLayer() {
  const mode      = useReplayStore((s) => s.mode);
  const sceneState = useReplayControllerStore((s) => s.sceneState);

  if (mode !== "replay" || !sceneState) return null;

  const allPipelines = Object.values(sceneState.pipelines);
  if (allPipelines.length === 0) return null;

  // Sort: running first, then completed, then failed; limit to cap
  const sorted = [...allPipelines].sort((a, b) => {
    const order = { running: 0, completed: 1, failed: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  const visible = sorted.slice(0, MAX_VISIBLE_PIPELINES);

  return (
    <group name="replay-pipeline-layer">
      <PipelineColumnHeader count={visible.length} />
      {visible.map((pipeline, idx) => (
        <PipelinePanel
          key={pipeline.pipelineId}
          pipeline={pipeline}
          index={idx}
        />
      ))}
    </group>
  );
}
