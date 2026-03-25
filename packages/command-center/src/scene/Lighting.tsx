/**
 * Lighting — Command-center dark theme lighting rig.
 *
 * Uses a combination of ambient, directional, and accent lights
 * to create the stylized low-poly command center look:
 * - Cool ambient fill
 * - Warm key light from upper-front for depth
 * - Subtle rim light for silhouette definition
 * - Accent-colored fill from below
 */
import { BUILDING } from "../data/building.js";

const BUILDING_W = 12;
const BUILDING_D = 6;
const TOTAL_H = 6;

export function Lighting() {
  return (
    <group name="lighting-rig">
      {/* Ambient fill — cool dark tone */}
      <ambientLight color={BUILDING.visual.ambientLight} intensity={0.4} />

      {/* Hemisphere light — dark blue sky / warm ground bounce */}
      <hemisphereLight
        color="#1a1a3a"
        groundColor="#2a1a0a"
        intensity={0.3}
      />

      {/* Key light — warm directional from upper-front-right */}
      <directionalLight
        position={[BUILDING_W + 4, TOTAL_H + 6, -4]}
        color="#ffeedd"
        intensity={0.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-BUILDING_W}
        shadow-camera-right={BUILDING_W}
        shadow-camera-top={TOTAL_H + 2}
        shadow-camera-bottom={-2}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-bias={-0.001}
      />

      {/* Fill light — cool blue from the left */}
      <directionalLight
        position={[-6, TOTAL_H / 2, BUILDING_D / 2]}
        color="#4466aa"
        intensity={0.2}
      />

      {/* Rim light — from behind for edge definition */}
      <directionalLight
        position={[BUILDING_W / 2, TOTAL_H + 2, BUILDING_D + 6]}
        color="#334466"
        intensity={0.15}
      />

      {/* Under-glow accent — subtle blue light from below */}
      <pointLight
        position={[BUILDING_W / 2, -0.5, BUILDING_D / 2]}
        color="#2244aa"
        intensity={0.3}
        distance={BUILDING_W}
        decay={2}
      />

      {/* Command center focal point light */}
      <spotLight
        position={[BUILDING_W / 2, TOTAL_H + 3, BUILDING_D / 2]}
        angle={Math.PI / 4}
        penumbra={0.6}
        color="#ffffff"
        intensity={0.2}
        distance={TOTAL_H + 6}
        decay={2}
        target-position={[BUILDING_W / 2, 0, BUILDING_D / 2]}
      />
    </group>
  );
}
