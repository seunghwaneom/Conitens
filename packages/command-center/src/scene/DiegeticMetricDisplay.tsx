/**
 * DiegeticMetricDisplay.tsx — 3D diegetic metric display objects.
 *
 * Sub-AC 6a: Create 3D diegetic metric display objects (holographic panels,
 * in-world screens, floating indicators) using low-poly geometry that
 * physically exist within the command-center scene.
 *
 * ─── Display Object Catalog ───────────────────────────────────────────────
 *
 * 1. FloatingMetricOrb   — animated low-poly icosahedron that encodes a
 *    single metric value through rotation speed, scale pulse, and emissive
 *    color.  Zero HTML dependency — all information is in geometry.
 *
 * 2. StatusPillar        — vertical bar-chart column (BoxGeometry); height
 *    and emissive color represent a 0-100% metric value.  Small diamond cap
 *    and glow plane make the top visible from any camera angle.
 *
 * 3. MetricRingIndicator — TorusGeometry arc whose phiLength encodes a
 *    percent value.  Slow rotation + emissive fill communicates urgency.
 *
 * 4. SystemHealthBeacon  — large OctahedronGeometry diamond at the building
 *    lobby; pulses and changes colour based on aggregate system health.
 *    Surrounded by three MetricRingIndicator layers (CPU, memory, agents).
 *
 * 5. HolographicPanel    — translucent floating panel with:
 *    - BoxGeometry backing frame
 *    - PlaneGeometry screen surface
 *    - TorusGeometry scanning ring (orbiting)
 *    - PlaneGeometry scan-line sweep
 *    - BoxGeometry corner brackets
 *    - Html content overlay (secondary — metric rows with gauge bars)
 *
 * 6. DiegeticMetricLayer — scene-level component that places all objects
 *    across the building (reads spatial-store for positions, metrics-store
 *    for values).  Add to CommandCenterScene.tsx.
 *
 * ─── Design Principles ────────────────────────────────────────────────────
 *   - Primary visual: Three.js geometry + emissive materials (not HTML)
 *   - Low-poly flat shading throughout for command-center aesthetic
 *   - Animations in useFrame for smooth FPS-independent motion
 *   - Metrics read from metrics-store + agent-store (reactive Zustand)
 *   - Performance-gated via usePerformanceQuality()
 *     ('high': all objects  'medium': no orbs  'low': no panel/orbs)
 *   - All placement is deterministic from the building definition
 *
 * ─── Event-sourcing transparency ──────────────────────────────────────────
 *   Metric values originate from metrics-store which is populated by:
 *   a) Live ConitensEvents via WebSocket (ingestLiveEvent)
 *   b) Agent-store state (agentCounts)
 *   c) Brownian-noise simulation (CPU/memory — fallback when WS offline)
 *   All of this is append-only event-sourced — fully replayable.
 */

import { useRef, useMemo, memo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useMetricsStore } from "../store/metrics-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { usePerformanceQuality } from "./ScenePerformance.js";
import {
  useMetricsBinding,
  type MetricsBinding,
} from "../hooks/use-metrics-binding.js";

// ── Colour palette (command-center dark theme) ────────────────────────────

const PALETTE = {
  healthy:    "#00ff88",
  degraded:   "#ffcc00",
  busy:       "#ff8800",
  critical:   "#ff4455",
  idle:       "#4a6aff",
  inactive:   "#2a2a44",
  accent:     "#4a6aff",
  purple:     "#cc88ff",
  wire:       "#2a3a88",
  frameBody:  "#1a1a2a",
  standBody:  "#0e0e20",
  screenBg:   "#04041a",
} as const;

const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

// ── Utility helpers ────────────────────────────────────────────────────────

/** Map a 0-100 metric value to a red/orange/green colour string. */
function metricColor(value: number, inverse = false): string {
  const v = inverse ? 100 - value : value;
  if (v > 80) return PALETTE.critical;
  if (v > 60) return PALETTE.busy;
  if (v > 30) return PALETTE.degraded;
  return PALETTE.healthy;
}

/** Map a health label to its canonical colour. */
function healthColor(health: string): string {
  switch (health) {
    case "error":    return PALETTE.critical;
    case "degraded": return PALETTE.busy;
    case "healthy":  return PALETTE.healthy;
    default:         return PALETTE.idle;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  1.  FloatingMetricOrb
// ═════════════════════════════════════════════════════════════════════════════

export interface FloatingMetricOrbProps {
  /** Current metric value 0-100.  Controls pulse scale and emissive intensity. */
  value: number;
  /** Health category — drives emissive colour. */
  health?: "healthy" | "degraded" | "error" | "unknown";
  /** World-space position. */
  position?: [number, number, number];
  /** Base spin speed (rad/s).  Multiplied by urgency derived from value. */
  baseSpeed?: number;
  /** Orb geometry radius (world units). */
  radius?: number;
  /** Optional text label shown above the orb via a tiny Html overlay. */
  label?: string;
}

/**
 * FloatingMetricOrb — animated low-poly IcosahedronGeometry that exists
 * physically in 3D space and encodes a metric through geometry behaviour:
 *
 *   - Rotation speed encodes urgency (fast = high value / busy)
 *   - Scale pulse encodes value spikes
 *   - Emissive colour encodes health (green / amber / red)
 *   - Vertical bob anchors it to a world position
 *
 * Three geometry layers: glow halo (BackSide) · wireframe overlay · solid core.
 * No HTML required — all information is in geometry.
 */
export const FloatingMetricOrb = memo(function FloatingMetricOrb({
  value,
  health = "healthy",
  position = [0, 0, 0],
  baseSpeed = 0.5,
  radius = 0.12,
  label,
}: FloatingMetricOrbProps) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef  = useRef<THREE.Mesh>(null);
  const wireRef  = useRef<THREE.Mesh>(null);
  const glowRef  = useRef<THREE.Mesh>(null);

  const color = useMemo(() => healthColor(health), [health]);

  const solidMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive:          color,
        emissiveIntensity: 0.3 + (value / 100) * 0.7,
        roughness:         0.7,
        metalness:         0.1,
        flatShading:       true,
        transparent:       true,
        opacity:           0.85,
      }),
    [color, value],
  );

  const wireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       PALETTE.wire,
        wireframe:   true,
        transparent: true,
        opacity:     0.35,
      }),
    [],
  );

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity:     0.06,
        side:        THREE.BackSide,
      }),
    [color],
  );

  useFrame(({ clock }) => {
    if (!coreRef.current || !groupRef.current) return;
    const t = clock.getElapsedTime();

    // Rotation speed encodes urgency: faster at high values
    const urgency = 0.5 + (value / 100) * 2.5;
    coreRef.current.rotation.x = t * baseSpeed * urgency * 0.7;
    coreRef.current.rotation.y = t * baseSpeed * urgency;

    // Scale pulse
    const pulse = 1 + Math.sin(t * 2 + value * 0.1) * 0.06;
    coreRef.current.scale.setScalar(pulse);

    if (wireRef.current) {
      wireRef.current.rotation.copy(coreRef.current.rotation);
    }

    // Vertical bob
    groupRef.current.position.y = position[1] + Math.sin(t * 0.8 + value * 0.05) * 0.05;

    // Glow opacity breathes
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.04 + Math.sin(t * 1.5) * 0.02 + (value / 100) * 0.04;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Outer glow halo — BackSide for soft surround */}
      <mesh ref={glowRef} material={glowMat}>
        <icosahedronGeometry args={[radius * 1.55, 0]} />
      </mesh>

      {/* Wireframe cage */}
      <mesh ref={wireRef} material={wireMat}>
        <icosahedronGeometry args={[radius * 1.03, 0]} />
      </mesh>

      {/* Solid flat-shaded core */}
      <mesh ref={coreRef} material={solidMat}>
        <icosahedronGeometry args={[radius, 0]} />
      </mesh>

      {/* Optional tiny label */}
      {label && (
        <Html
          center
          distanceFactor={8}
          position={[0, radius + 0.1, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span
            style={{
              fontSize: "6px",
              color,
              fontFamily: FONT,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              textShadow: `0 0 5px ${color}`,
            }}
          >
            {label}
          </span>
        </Html>
      )}
    </group>
  );
});

FloatingMetricOrb.displayName = "FloatingMetricOrb";

// ═════════════════════════════════════════════════════════════════════════════
//  2.  StatusPillar
// ═════════════════════════════════════════════════════════════════════════════

export interface StatusPillarProps {
  /** Metric value 0-100 — visualised as bar height. */
  value: number;
  /** Maximum bar height at value=100 (world units). */
  maxHeight?: number;
  /** Pillar XZ cross-section size. */
  width?: number;
  depth?: number;
  /** World-space position of the pillar base. */
  position?: [number, number, number];
  /** Short label shown above the pillar via Html overlay. */
  label?: string;
  /**
   * When true the colour polarity is inverted — high value = green
   * (useful for "availability" or "capacity remaining" metrics).
   */
  inverse?: boolean;
}

/**
 * StatusPillar — a vertical BoxGeometry bar that physically encodes a metric:
 *
 *   - Bar height   → metric value (0 → floor level, 100 → maxHeight)
 *   - Emissive colour → red / orange / green transition
 *   - Diamond cap  → OctahedronGeometry top marker
 *   - Glow plane   → PlaneGeometry emissive face (visible from front)
 *
 * Placed at room perimeters as physical bar-chart indicators.
 */
export const StatusPillar = memo(function StatusPillar({
  value,
  maxHeight = 0.65,
  width = 0.08,
  depth = 0.08,
  position = [0, 0, 0],
  label,
  inverse = false,
}: StatusPillarProps) {
  const barRef  = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const color  = useMemo(() => metricColor(value, inverse), [value, inverse]);
  const height = useMemo(
    () => Math.max(0.015, (value / 100) * maxHeight),
    [value, maxHeight],
  );

  const barMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive:          color,
        emissiveIntensity: 0.35 + (value / 100) * 0.35,
        roughness:         0.6,
        metalness:         0.2,
        flatShading:       true,
      }),
    [color, value],
  );

  const baseMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       "#1a1a2e",
        transparent: true,
        opacity:     0.9,
      }),
    [],
  );

  const capMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity:     0.9,
      }),
    [color],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Subtle Y-scale breathing at high values
    if (barRef.current && value > 70) {
      barRef.current.scale.y = 1 + Math.sin(t * 3) * 0.025;
    }

    // Glow pulse
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.12 + Math.sin(t * 2.2) * 0.05;
    }
  });

  return (
    <group position={position}>
      {/* Base plate */}
      <mesh material={baseMat} position={[0, 0.005, 0]}>
        <boxGeometry args={[width + 0.04, 0.01, depth + 0.04]} />
      </mesh>

      {/* Bar — origin at y=0 (base), grows upward */}
      <mesh ref={barRef} material={barMat} position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
      </mesh>

      {/* Front emissive glow plane */}
      <mesh
        ref={glowRef}
        position={[0, height / 2, depth / 2 + 0.006]}
      >
        <planeGeometry args={[width + 0.02, height + 0.02]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Diamond cap at bar top */}
      <mesh material={capMat} position={[0, height + 0.008, 0]}>
        <octahedronGeometry args={[width * 0.45, 0]} />
      </mesh>

      {/* Label */}
      {label && (
        <Html
          center
          distanceFactor={8}
          position={[0, maxHeight + 0.1, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span
            style={{
              fontSize: "6px",
              color: "#8888bb",
              fontFamily: FONT,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
        </Html>
      )}
    </group>
  );
});

StatusPillar.displayName = "StatusPillar";

// ═════════════════════════════════════════════════════════════════════════════
//  3.  MetricRingIndicator
// ═════════════════════════════════════════════════════════════════════════════

export interface MetricRingIndicatorProps {
  /** Metric value 0-100 — arc-fill and glow intensity. */
  value: number;
  /** Torus major radius. */
  radius?: number;
  /** Torus tube thickness. */
  tube?: number;
  /** World-space position (relative to parent group). */
  position?: [number, number, number];
  /** Plane orientation: 'horizontal' = ring lies flat; 'vertical' = upright. */
  orientation?: "horizontal" | "vertical";
  /** Override colour; defaults to metricColor(value). */
  color?: string;
  /** Additional Y-axis offset to the slow rotation (for layered rings). */
  rotationOffset?: number;
}

/**
 * MetricRingIndicator — a partial TorusGeometry arc that encodes a percent
 * metric via phiLength (arc-fill from 0 → 2π).
 *
 *   - Background track ring (dim, full circle)
 *   - Value arc (partial torus, phiLength = value/100 × 2π)
 *   - Slow Y-axis rotation for visual dynamism
 *   - Emissive intensity increases with value
 */
export const MetricRingIndicator = memo(function MetricRingIndicator({
  value,
  radius = 0.22,
  tube = 0.018,
  position = [0, 0, 0],
  orientation = "horizontal",
  color: colorOverride,
  rotationOffset = 0,
}: MetricRingIndicatorProps) {
  const groupRef = useRef<THREE.Group>(null);
  const arcRef   = useRef<THREE.Mesh>(null);

  const color = useMemo(
    () => colorOverride ?? metricColor(value),
    [value, colorOverride],
  );

  const phiLength = useMemo(
    () => (Math.max(0.01, value) / 100) * Math.PI * 2,
    [value],
  );

  const arcMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive:          color,
        emissiveIntensity: 0.45 + (value / 100) * 0.45,
        roughness:         0.5,
        metalness:         0.3,
        flatShading:       false,
        transparent:       true,
        opacity:           0.88,
      }),
    [color, value],
  );

  const trackMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       "#1a1a30",
        transparent: true,
        opacity:     0.38,
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y = t * 0.28 + rotationOffset;

    // Pulse emissive for high values
    if (arcRef.current && value > 70) {
      const mat = arcRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.2;
    }
  });

  const rotation: [number, number, number] =
    orientation === "horizontal" ? [-Math.PI / 2, 0, 0] : [0, 0, 0];

  return (
    <group ref={groupRef} position={position}>
      {/* Background track — full circle */}
      <mesh material={trackMat} rotation={rotation}>
        <torusGeometry args={[radius, tube * 0.55, 6, 36]} />
      </mesh>

      {/* Value arc — partial torus */}
      <mesh ref={arcRef} material={arcMat} rotation={rotation}>
        <torusGeometry args={[radius, tube, 8, 48, phiLength]} />
      </mesh>
    </group>
  );
});

MetricRingIndicator.displayName = "MetricRingIndicator";

// ═════════════════════════════════════════════════════════════════════════════
//  4.  SystemHealthBeacon
// ═════════════════════════════════════════════════════════════════════════════

export interface SystemHealthBeaconProps {
  /** World-space position (default: building centre at ground floor). */
  position?: [number, number, number];
  /** Uniform scale multiplier. */
  scale?: number;
}

/**
 * SystemHealthBeacon — a multi-layer OctahedronGeometry diamond that serves
 * as the visual centrepiece of the lobby floor.
 *
 * Layers (outer → inner):
 *   1. Outer glow sphere   (IcosahedronGeometry detail=1, BackSide)
 *   2. Wireframe cage      (OctahedronGeometry detail=1, wireframe)
 *   3. Solid diamond core  (OctahedronGeometry detail=0, flat-shaded)
 *   4. Three MetricRingIndicators (CPU/MEM/active-ratio, different radii)
 *   5. Html label (secondary — system health text above the beacon)
 *
 * Metric encodings:
 *   - Rotation speed → event throughput
 *   - Emissive colour → health state (green / amber / red / blue)
 *   - Scale pulse    → CPU spikes
 *   - Ring arc fills → CPU / memory / active-agent ratio
 */
export function SystemHealthBeacon({
  position = [6, 0.3, 3],
  scale = 1,
}: SystemHealthBeaconProps) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef  = useRef<THREE.Mesh>(null);
  const wireRef  = useRef<THREE.Mesh>(null);
  const glowRef  = useRef<THREE.Mesh>(null);

  // ── Store subscriptions ───────────────────────────────────────────────
  const snapshot    = useMetricsStore((s) => s.snapshot);
  const agentCounts = snapshot.agentCounts;
  const cpu         = snapshot.system.cpu;
  const memory      = snapshot.system.memory;
  const throughput  = snapshot.system.eventsPerTick;

  // Derived health state
  const health = useMemo(() => {
    if (agentCounts.error > 0)                            return "error";
    if (cpu > 80 || memory > 80)                         return "degraded";
    if (agentCounts.active + agentCounts.busy > 0)       return "healthy";
    return "idle";
  }, [agentCounts, cpu, memory]);

  const coreColor = useMemo(() => healthColor(health), [health]);

  const activeRatio = useMemo(
    () =>
      agentCounts.total > 0
        ? ((agentCounts.active + agentCounts.busy) / agentCounts.total) * 100
        : 0,
    [agentCounts],
  );

  const coreMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color:             coreColor,
        emissive:          coreColor,
        emissiveIntensity: 0.5,
        roughness:         0.4,
        metalness:         0.3,
        flatShading:       true,
        transparent:       true,
        opacity:           0.88,
      }),
    [coreColor],
  );

  const wireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       coreColor,
        wireframe:   true,
        transparent: true,
        opacity:     0.22,
      }),
    [coreColor],
  );

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       coreColor,
        transparent: true,
        opacity:     0.05,
        side:        THREE.BackSide,
      }),
    [coreColor],
  );

  useFrame(({ clock }) => {
    if (!coreRef.current || !groupRef.current) return;
    const t = clock.getElapsedTime();

    // Rotation speed driven by throughput
    const spinSpeed = 0.15 + Math.min(throughput * 0.05, 1.2);
    coreRef.current.rotation.y = t * spinSpeed;
    coreRef.current.rotation.x = t * spinSpeed * 0.4;

    if (wireRef.current) {
      wireRef.current.rotation.y = -t * spinSpeed * 0.6;
      wireRef.current.rotation.x =  t * spinSpeed * 0.3;
    }

    // Scale pulse from CPU
    const cpuPulse = 1 + (cpu / 100) * Math.sin(t * 3) * 0.06;
    groupRef.current.scale.setScalar(scale * cpuPulse);

    // Glow breathes
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.04 + Math.sin(t * 1.2) * 0.02 + (cpu / 100) * 0.04;
    }

    // Core emissive reacts to health (flash on error)
    const mat = coreRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = health === "error"
      ? 0.6 + Math.abs(Math.sin(t * 8)) * 0.35
      : 0.4 + (activeRatio / 100) * 0.4;
  });

  return (
    <group position={position} scale={scale}>
      {/* Outer glow sphere */}
      <mesh ref={glowRef} material={glowMat}>
        <icosahedronGeometry args={[0.56, 1]} />
      </mesh>

      {/* Wireframe cage */}
      <mesh ref={wireRef} material={wireMat}>
        <octahedronGeometry args={[0.44, 1]} />
      </mesh>

      {/* Solid diamond core */}
      <mesh ref={coreRef} material={coreMat}>
        <octahedronGeometry args={[0.28, 0]} />
      </mesh>

      {/* CPU ring — horizontal */}
      <MetricRingIndicator
        value={cpu}
        radius={0.38}
        tube={0.015}
        position={[0, 0, 0]}
        orientation="horizontal"
        color={metricColor(cpu)}
        rotationOffset={0}
      />

      {/* Memory ring — horizontal, wider, offset rotation */}
      <group rotation={[0, Math.PI / 4, 0]}>
        <MetricRingIndicator
          value={memory}
          radius={0.46}
          tube={0.012}
          position={[0, 0, 0]}
          orientation="horizontal"
          color={metricColor(memory)}
          rotationOffset={Math.PI / 3}
        />
      </group>

      {/* Active-agents ring — vertical upright */}
      <MetricRingIndicator
        value={activeRatio}
        radius={0.34}
        tube={0.014}
        position={[0, 0, 0]}
        orientation="vertical"
        color={PALETTE.accent}
        rotationOffset={Math.PI / 6}
      />

      {/* Html label — secondary, provides readable text above the beacon */}
      <Html
        center
        distanceFactor={12}
        position={[0, 0.72, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div style={{ textAlign: "center", fontFamily: FONT }}>
          <div
            style={{
              fontSize: "8px",
              color: coreColor,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 700,
              textShadow: `0 0 8px ${coreColor}`,
              whiteSpace: "nowrap",
            }}
          >
            SYSTEM {health.toUpperCase()}
          </div>
          <div
            style={{
              fontSize: "6px",
              color: "#666699",
              letterSpacing: "0.08em",
              marginTop: 1,
              whiteSpace: "nowrap",
            }}
          >
            {agentCounts.active + agentCounts.busy} active ·{" "}
            {agentCounts.error} err
          </div>
        </div>
      </Html>
    </group>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  5.  HolographicPanel
// ═════════════════════════════════════════════════════════════════════════════

export type MetricHealthLabel =
  | "healthy"
  | "degraded"
  | "error"
  | "unknown";

export interface MetricRow {
  label:   string;
  value:   number;
  unit?:   string;
  health?: MetricHealthLabel;
}

export interface HolographicPanelProps {
  /** Panel title text. */
  title: string;
  /** Metric rows to render inside the panel. */
  metrics: MetricRow[];
  /** World-space position. */
  position?: [number, number, number];
  /** Y-axis rotation in radians. */
  rotationY?: number;
  /** Panel width in world units. */
  width?: number;
  /** Panel height in world units. */
  height?: number;
  /** Accent colour used for borders and glow. */
  accentColor?: string;
}

/**
 * HolographicPanel — a translucent floating panel with physical 3D geometry.
 *
 * Geometry layers (back → front):
 *   1. BoxGeometry backing frame (dark body)
 *   2. PlaneGeometry screen surface (semi-transparent)
 *   3. BoxGeometry accent strips (top / bottom borders)
 *   4. BoxGeometry corner brackets (4×)
 *   5. BoxGeometry depth side-bars
 *   6. TorusGeometry scanning ring (orbiting in front)
 *   7. PlaneGeometry scan-line sweep (vertical pass)
 *   8. Html content (metric rows + gauge bars — secondary/readable layer)
 *
 * The panel is self-contained: caller supplies `metrics` prop.
 * For auto-populated panels see DiegeticMetricLayer below.
 */
export const HolographicPanel = memo(function HolographicPanel({
  title,
  metrics,
  position = [0, 2.5, 0],
  rotationY = 0,
  width = 1.2,
  height = 0.8,
  accentColor = PALETTE.accent,
}: HolographicPanelProps) {
  const scanRingRef = useRef<THREE.Mesh>(null);
  const scanLineRef = useRef<THREE.Mesh>(null);
  const screenRef   = useRef<THREE.Mesh>(null);

  const halfW = width / 2;
  const halfH = height / 2;
  const CORNER = 0.075;

  // ── Materials ──────────────────────────────────────────────────────────
  const frameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color:       PALETTE.frameBody,
        roughness:   0.8,
        metalness:   0.5,
        flatShading: true,
      }),
    [],
  );

  const screenMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       PALETTE.screenBg,
        transparent: true,
        opacity:     0.84,
        side:        THREE.FrontSide,
      }),
    [],
  );

  const accentMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       accentColor,
        transparent: true,
        opacity:     0.75,
      }),
    [accentColor],
  );

  const scanMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       accentColor,
        transparent: true,
        opacity:     0.14,
        side:        THREE.DoubleSide,
      }),
    [accentColor],
  );

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       accentColor,
        transparent: true,
        opacity:     0.38,
      }),
    [accentColor],
  );

  // ── Animation ──────────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Scanning ring orbits the panel
    if (scanRingRef.current) {
      scanRingRef.current.rotation.x = t * 1.1;
      scanRingRef.current.rotation.z = t * 0.7;
      (scanRingRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.22 + Math.sin(t * 1.8) * 0.1;
    }

    // Scan-line sweeps downward across the screen
    if (scanLineRef.current) {
      scanLineRef.current.position.y =
        ((t * 0.38) % 1) * height - halfH;
      (scanLineRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.10 + Math.sin(t * 2.2) * 0.05;
    }

    // Screen surface gentle glow breathe
    if (screenRef.current) {
      (screenRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.82 + Math.sin(t * 0.65) * 0.04;
    }
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>

      {/* ── 3D Geometry — primary visual ───────────────────────────────── */}

      {/* Backing frame — gives depth and shadow */}
      <mesh material={frameMat} position={[0, 0, -0.026]}>
        <boxGeometry args={[width + 0.09, height + 0.09, 0.045]} />
      </mesh>

      {/* Screen surface */}
      <mesh ref={screenRef} material={screenMat}>
        <planeGeometry args={[width, height]} />
      </mesh>

      {/* Top accent strip */}
      <mesh material={accentMat} position={[0, halfH + 0.01, 0.006]}>
        <boxGeometry args={[width + 0.065, 0.022, 0.005]} />
      </mesh>

      {/* Bottom accent strip */}
      <mesh material={accentMat} position={[0, -(halfH + 0.01), 0.006]}>
        <boxGeometry args={[width + 0.065, 0.014, 0.005]} />
      </mesh>

      {/* Corner bracket — top-left */}
      <mesh material={accentMat} position={[-halfW + CORNER / 2, halfH - CORNER / 2, 0.01]}>
        <boxGeometry args={[CORNER, CORNER, 0.008]} />
      </mesh>
      {/* Corner bracket — top-right */}
      <mesh material={accentMat} position={[halfW - CORNER / 2, halfH - CORNER / 2, 0.01]}>
        <boxGeometry args={[CORNER, CORNER, 0.008]} />
      </mesh>
      {/* Corner bracket — bottom-left */}
      <mesh material={accentMat} position={[-halfW + CORNER / 2, -(halfH - CORNER / 2), 0.01]}>
        <boxGeometry args={[CORNER, CORNER, 0.008]} />
      </mesh>
      {/* Corner bracket — bottom-right */}
      <mesh material={accentMat} position={[halfW - CORNER / 2, -(halfH - CORNER / 2), 0.01]}>
        <boxGeometry args={[CORNER, CORNER, 0.008]} />
      </mesh>

      {/* Depth side-bars (left & right) */}
      <mesh position={[-(halfW + 0.022), 0, -0.022]}>
        <boxGeometry args={[0.04, height + 0.09, 0.065]} />
        <meshBasicMaterial color={PALETTE.standBody} />
      </mesh>
      <mesh position={[halfW + 0.022, 0, -0.022]}>
        <boxGeometry args={[0.04, height + 0.09, 0.065]} />
        <meshBasicMaterial color={PALETTE.standBody} />
      </mesh>

      {/* Orbiting scanning ring */}
      <mesh ref={scanRingRef} material={ringMat} position={[0, 0, 0.055]}>
        <torusGeometry args={[Math.min(halfW, halfH) * 0.72, 0.007, 6, 32]} />
      </mesh>

      {/* Horizontal scan-line sweep */}
      <mesh ref={scanLineRef} material={scanMat} position={[0, 0, 0.006]}>
        <planeGeometry args={[width, 0.035]} />
      </mesh>

      {/* ── Html content — secondary readable layer ─────────────────── */}
      <Html
        center
        distanceFactor={14}
        position={[0, 0, 0.022]}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            width: `${Math.round(width * 118)}px`,
            fontFamily: FONT,
            padding: "5px 8px",
            background: "transparent",
            pointerEvents: "none",
          }}
        >
          {/* Title bar */}
          <div
            style={{
              fontSize: "7px",
              color: accentColor,
              letterSpacing: "0.14em",
              fontWeight: 700,
              textTransform: "uppercase",
              borderBottom: `1px solid ${accentColor}44`,
              paddingBottom: 3,
              marginBottom: 5,
              textShadow: `0 0 6px ${accentColor}`,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>

          {/* Metric rows */}
          {metrics.map((m, i) => {
            const mColor = m.health ? healthColor(m.health) : metricColor(m.value);
            const pct    = Math.min(100, Math.max(0, m.value));
            return (
              <div
                key={i}
                style={{
                  display:       "flex",
                  alignItems:    "center",
                  justifyContent:"space-between",
                  marginBottom:  3,
                  gap:           5,
                }}
              >
                <span
                  style={{
                    fontSize:    "6px",
                    color:       "#6666aa",
                    letterSpacing:"0.06em",
                    flexShrink:  0,
                    whiteSpace:  "nowrap",
                    minWidth:    32,
                  }}
                >
                  {m.label}
                </span>
                <div
                  style={{
                    flex:        1,
                    height:      3,
                    background:  "rgba(28,28,55,0.7)",
                    borderRadius: 2,
                    overflow:    "hidden",
                    minWidth:    20,
                  }}
                >
                  <div
                    style={{
                      width:       `${pct}%`,
                      height:      "100%",
                      background:  mColor,
                      boxShadow:   `0 0 4px ${mColor}`,
                      transition:  "width 0.5s ease-out",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize:    "7px",
                    color:       mColor,
                    fontWeight:  700,
                    letterSpacing:"0.04em",
                    flexShrink:  0,
                    whiteSpace:  "nowrap",
                    textShadow:  `0 0 4px ${mColor}55`,
                    minWidth:    24,
                    textAlign:   "right",
                  }}
                >
                  {Math.round(pct)}{m.unit ?? "%"}
                </span>
              </div>
            );
          })}
        </div>
      </Html>
    </group>
  );
});

HolographicPanel.displayName = "HolographicPanel";

// ═════════════════════════════════════════════════════════════════════════════
//  6.  DiegeticMetricLayer  (scene-level orchestrator)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * DiegeticMetricLayer — places all diegetic metric display objects across
 * the building by reading the spatial-store building definition and
 * metrics-store snapshot.
 *
 * Objects placed:
 *   • SystemHealthBeacon  — at the lobby room centre (or building centre)
 *   • HolographicPanel × 2 — "CONTROL PLANE" and "AGENT OPS" panels on walls
 *   • StatusPillar × 3    — CPU / MEM / QUEUE at the west wall entrance
 *   • FloatingMetricOrb   — one per room (quality-gated: only at 'high'/'medium')
 *
 * Performance gating:
 *   'high'   → all objects
 *   'medium' → no per-room orbs
 *   'low'    → only StatusPillars and SystemHealthBeacon (no Html panels)
 *
 * Add to CommandCenterScene.tsx alongside GlobalDashboardPanel:
 *   <DiegeticMetricLayer />
 */
export function DiegeticMetricLayer() {
  const quality = usePerformanceQuality();

  // ── Data binding layer (Sub-AC 6b) ────────────────────────────────────
  // All live metrics flow through useMetricsBinding() — the single stable
  // interface between the metrics-store and every diegetic display object.
  const binding: MetricsBinding = useMetricsBinding();
  const {
    agentStatus: agentCounts,
    cpu,
    memory,
    throughputPct,
    errorRate,
    taskQueueDepth: taskQueue,
    uptimeLabel,
    systemHealth,
  } = binding;

  // Also read the building shape from spatial-store (geometry only — not metrics)
  const building = useSpatialStore((s) => s.building);

  // ── Derived holographic panel metrics ─────────────────────────────────

  const controlMetrics: MetricRow[] = useMemo(
    () => [
      {
        label:  "CPU",
        value:  cpu,
        health: cpu > 80 ? "error" : cpu > 60 ? "degraded" : "healthy",
      },
      {
        label:  "MEMORY",
        value:  memory,
        health: memory > 80 ? "error" : memory > 60 ? "degraded" : "healthy",
      },
      {
        label: "ACTIVE",
        value: agentCounts.total > 0
          ? ((agentCounts.active + agentCounts.busy) / agentCounts.total) * 100
          : 0,
        unit:  "",
      },
      {
        label:  "ERR RATE",
        value:  errorRate,
        health: errorRate > 0 ? "error" : "healthy",
        unit:   "%",
      },
      {
        label: "THROUGHPUT",
        value: throughputPct,
        unit:  "%",
      },
      {
        label: "UPTIME",
        value: 100, // always full — display label via unit
        health: (systemHealth === "error" ? "error" : systemHealth === "degraded" ? "degraded" : "healthy") as MetricHealthLabel,
        unit:   uptimeLabel,
      },
    ],
    [cpu, memory, agentCounts, throughputPct, errorRate, systemHealth, uptimeLabel],
  );

  const agentMetrics: MetricRow[] = useMemo(
    () => [
      {
        label: "ACTIVE",
        value: agentCounts.total > 0
          ? (agentCounts.active / agentCounts.total) * 100
          : 0,
        health: agentCounts.active > 0 ? "healthy" : "unknown",
      },
      {
        label: "BUSY",
        value: agentCounts.total > 0
          ? (agentCounts.busy / agentCounts.total) * 100
          : 0,
        health: agentCounts.busy > 0 ? "degraded" : "unknown",
      },
      {
        label: "IDLE",
        value: agentCounts.total > 0
          ? (agentCounts.idle / agentCounts.total) * 100
          : 0,
      },
      {
        label:  "ERR %",
        // Use error rate from binding (authoritative derived value)
        value:  errorRate,
        health: agentCounts.error > 0 ? "error" : "healthy",
        unit:   "%",
      },
    ],
    [agentCounts, errorRate],
  );

  // ── Status pillar positions (west wall, ground floor) ──────────────────
  // Pillars use binding's normalised taskQueuePct for consistent scale

  const { taskQueuePct } = binding;

  const pillarMetrics = useMemo(
    () => [
      {
        label:   "CPU",
        value:   cpu,
        pos:     [-0.38, 0, 1.4] as [number, number, number],
      },
      {
        label:   "MEM",
        value:   memory,
        pos:     [-0.38, 0, 2.4] as [number, number, number],
      },
      {
        label:   "QUEUE",
        value:   taskQueuePct,  // normalised 0-100 from binding
        pos:     [-0.38, 0, 3.4] as [number, number, number],
        inverse: true,
      },
    ],
    [cpu, memory, taskQueuePct],
  );

  // ── Per-room floating orbs ─────────────────────────────────────────────

  // Room activity is a spatial concern — subscribe directly to spatial-store
  // so that room activity changes drive orb updates independently of metrics tick.
  const roomStates = useSpatialStore((s) => s.roomStates);

  const roomOrbs = useMemo(() => {
    return building.rooms.slice(0, 10).map((room) => {
      const activity = roomStates[room.roomId]?.activity ?? "idle";
      const health: "healthy" | "degraded" | "error" | "unknown" =
        activity === "error"  ? "error"    :
        activity === "busy"   ? "degraded" :
        activity === "active" ? "healthy"  :
        "unknown";
      const value =
        activity === "busy"   ? 78 :
        activity === "active" ? 50 :
        activity === "error"  ? 95 :
        15;

      const cx = room.position.x + room.dimensions.x / 2;
      const cz = room.position.z + room.dimensions.z / 2;
      const cy = (room.floor ?? 0) * 3 + 2.9;

      return {
        id:       room.roomId,
        health,
        value,
        position: [cx, cy, cz] as [number, number, number],
        label:    room.roomId.slice(0, 6).toUpperCase(),
      };
    });
  }, [building.rooms, roomStates]);

  // ── Lobby / beacon position ────────────────────────────────────────────

  const beaconPosition: [number, number, number] = useMemo(() => {
    const lobby = building.rooms.find((r) => r.roomType === "lobby");
    if (lobby) {
      return [
        lobby.position.x + lobby.dimensions.x / 2,
        (lobby.floor ?? 0) * 3 + 0.32,
        lobby.position.z + lobby.dimensions.z / 2,
      ];
    }
    return [6, 0.32, 3];
  }, [building.rooms]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <group name="diegetic-metric-layer">

      {/* ── System health beacon — lobby centre ───────────────────────── */}
      <SystemHealthBeacon position={beaconPosition} />

      {/* ── Holographic panels — only at medium+ quality ─────────────── */}
      {quality !== "low" && (
        <>
          {/* Control-plane overview panel — upper-left internal wall */}
          <HolographicPanel
            title="CONTROL PLANE"
            metrics={controlMetrics}
            position={[1.4, 2.9, 0.18]}
            rotationY={0.06}
            width={1.45}
            height={0.92}
            accentColor={PALETTE.accent}
          />

          {/* Agent ops panel — right side internal wall */}
          <HolographicPanel
            title="AGENT OPS"
            metrics={agentMetrics}
            position={[11.1, 2.9, 2.6]}
            rotationY={-Math.PI * 0.55}
            width={1.25}
            height={0.78}
            accentColor={PALETTE.purple}
          />
        </>
      )}

      {/* ── Status pillars — always visible (geometry only, minimal HTML) */}
      {pillarMetrics.map((p) => (
        <StatusPillar
          key={p.label}
          value={p.value}
          position={p.pos}
          label={p.label}
          maxHeight={0.72}
          inverse={(p as { inverse?: boolean }).inverse}
        />
      ))}

      {/* ── Per-room activity orbs — high quality only ────────────────── */}
      {quality === "high" &&
        roomOrbs.map((orb) => (
          <FloatingMetricOrb
            key={orb.id}
            value={orb.value}
            health={orb.health}
            position={orb.position}
            radius={0.1}
            baseSpeed={0.38}
          />
        ))}
    </group>
  );
}
