/**
 * CameraModeControls — camera mode toggle + Bird's-eye zoom/pan controls.
 */
import { type CameraPreset } from "../../scene/CameraRig.js";
import {
  BIRDS_EYE_MIN_ZOOM,
  BIRDS_EYE_MAX_ZOOM,
  BIRDS_EYE_DEFAULT_ZOOM,
  BIRDS_EYE_KEY_PAN_STEP,
  clampBirdsEyeZoom,
  clampBirdsEyePan,
  defaultBirdsEyeView,
} from "../../scene/BirdsEyeCamera.js";
import { useSpatialStore } from "../../store/spatial-store.js";
import { styles } from "./hud-styles.js";

/** Camera mode toggle + Bird's-eye zoom/pan controls */
export function CameraModeControls({ cameraPreset, onPresetChange }: {
  cameraPreset: CameraPreset;
  onPresetChange: (preset: CameraPreset) => void;
}) {
  const cameraMode = useSpatialStore((s) => s.cameraMode);
  const setCameraMode = useSpatialStore((s) => s.setCameraMode);
  const birdsEyeZoom = useSpatialStore((s) => s.birdsEyeZoom);
  const birdsEyePan = useSpatialStore((s) => s.birdsEyePan);
  const setBirdsEyeZoom = useSpatialStore((s) => s.setBirdsEyeZoom);
  const setBirdsEyePan = useSpatialStore((s) => s.setBirdsEyePan);

  return (
    <>
      {/* Camera mode toggle */}
      <div style={styles.sectionLabel}>CAMERA MODE <span style={{ color: "#333355", fontWeight: 400 }}>— press B to toggle</span></div>
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginBottom: 8 }}>
        <button
          onClick={() => setCameraMode("perspective")}
          style={{
            ...styles.presetBtn,
            ...(cameraMode === "perspective" ? styles.presetBtnActive : {}),
            pointerEvents: "auto",
          }}
          title="Perspective orbit camera (B key to toggle)"
        >
          ◇ PERSPECTIVE
        </button>
        <button
          onClick={() => setCameraMode("birdsEye")}
          style={{
            ...styles.presetBtn,
            ...(cameraMode === "birdsEye" ? styles.presetBtnActive : {}),
            pointerEvents: "auto",
          }}
          title="Bird's-eye orthographic top-down (B key to toggle)"
        >
          ◎ BIRD&apos;S EYE
        </button>
      </div>

      {/* Perspective camera presets (only when in perspective mode) */}
      {cameraMode === "perspective" && (
        <>
          <div style={styles.sectionLabel}>CAMERA PRESET</div>
          <div style={styles.presetRow}>
            {(
              ["overview", "overhead", "cutaway", "groundFloor", "opsFloor"] as CameraPreset[]
            ).map((preset) => (
              <button
                key={preset}
                onClick={() => onPresetChange(preset)}
                style={{
                  ...styles.presetBtn,
                  ...(cameraPreset === preset ? styles.presetBtnActive : {}),
                }}
              >
                {preset.replace(/([A-Z])/g, " $1").toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Bird's-eye zoom & pan controls (only when in birds-eye mode) */}
      {cameraMode === "birdsEye" && (
        <>
          {/* ── Zoom row ── */}
          <div style={styles.sectionLabel}>ZOOM</div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
            <button
              onClick={() => setBirdsEyeZoom(clampBirdsEyeZoom(birdsEyeZoom, 2))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: "4px 10px" }}
              title="Zoom out (- key)"
            >
              −
            </button>
            {/* Zoom bar: filled fraction = (MAX - current) / (MAX - MIN) so full = zoomed in */}
            <div style={{ ...styles.zoomBar, width: 80 }}>
              <div style={{
                ...styles.zoomBarFill,
                width: `${((BIRDS_EYE_MAX_ZOOM - birdsEyeZoom) / (BIRDS_EYE_MAX_ZOOM - BIRDS_EYE_MIN_ZOOM)) * 100}%`,
              }} />
              <span style={styles.zoomLabel}>
                {Math.round(((BIRDS_EYE_MAX_ZOOM - birdsEyeZoom) / (BIRDS_EYE_MAX_ZOOM - BIRDS_EYE_MIN_ZOOM)) * 100)}%
              </span>
            </div>
            <button
              onClick={() => setBirdsEyeZoom(clampBirdsEyeZoom(birdsEyeZoom, -2))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: "4px 10px" }}
              title="Zoom in (+ key)"
            >
              +
            </button>
          </div>

          {/* ── Pan directional pad (Sub-AC 3a) ── */}
          <div style={styles.sectionLabel}>PAN</div>
          {/*
           * 4-direction arrow pad for explicit click-to-pan navigation.
           * Each button calls clampBirdsEyePan to apply the same clamping
           * logic as the keyboard/mouse handlers in BirdsEyeCamera.tsx.
           *
           * Layout (3×3 grid):
           *   [  ]  [↑]  [  ]
           *   [←]  [·]  [→]
           *   [  ]  [↓]  [  ]
           */}
          <div
            role="group"
            aria-label="Pan controls"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 26px)",
              gridTemplateRows: "repeat(3, 22px)",
              gap: 2,
              justifyContent: "flex-end",
              marginTop: 2,
              marginBottom: 2,
            }}
          >
            {/* Row 1: [empty] [↑] [empty] */}
            <span />
            <button
              onClick={() => setBirdsEyePan(clampBirdsEyePan(birdsEyePan, [0, -BIRDS_EYE_KEY_PAN_STEP]))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: 0, fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Pan north (↑ key)"
              aria-label="Pan up"
            >
              ↑
            </button>
            <span />

            {/* Row 2: [←] [·] [→] */}
            <button
              onClick={() => setBirdsEyePan(clampBirdsEyePan(birdsEyePan, [-BIRDS_EYE_KEY_PAN_STEP, 0]))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: 0, fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Pan west (← key)"
              aria-label="Pan left"
            >
              ←
            </button>
            {/* Center dot — clicking resets to center-pan (but not zoom) */}
            <button
              onClick={() => setBirdsEyePan([0, 0])}
              style={{
                ...styles.presetBtn,
                pointerEvents: "auto",
                padding: 0,
                fontSize: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(74, 106, 255, 0.1)",
                borderColor: "#4a6aff44",
              }}
              title="Re-center pan (click to return to building center)"
              aria-label="Center pan"
            >
              ·
            </button>
            <button
              onClick={() => setBirdsEyePan(clampBirdsEyePan(birdsEyePan, [BIRDS_EYE_KEY_PAN_STEP, 0]))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: 0, fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Pan east (→ key)"
              aria-label="Pan right"
            >
              →
            </button>

            {/* Row 3: [empty] [↓] [empty] */}
            <span />
            <button
              onClick={() => setBirdsEyePan(clampBirdsEyePan(birdsEyePan, [0, BIRDS_EYE_KEY_PAN_STEP]))}
              style={{ ...styles.presetBtn, pointerEvents: "auto", padding: 0, fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Pan south (↓ key)"
              aria-label="Pan down"
            >
              ↓
            </button>
            <span />
          </div>

          {/* ── Reset view ── */}
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              onClick={() => {
                const { zoom, pan } = defaultBirdsEyeView();
                setBirdsEyePan(pan);
                setBirdsEyeZoom(zoom);
              }}
              style={{ ...styles.presetBtn, pointerEvents: "auto", fontSize: "8px" }}
              title={`Reset view to center, zoom ${BIRDS_EYE_DEFAULT_ZOOM} (Home key)`}
            >
              ⌂ RESET VIEW
            </button>
          </div>
          <div style={{ marginTop: 4, fontSize: "8px", color: "#444466", textAlign: "right" }}>
            Scroll to zoom · Shift+drag to pan · Arrow keys · Home to reset · B to exit
          </div>
        </>
      )}
    </>
  );
}
