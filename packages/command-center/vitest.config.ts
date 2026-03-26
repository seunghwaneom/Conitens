/**
 * vitest.config.ts — Vitest configuration for @conitens/command-center
 *
 * Sub-AC 14.1: Extended to support two test projects:
 *
 *   1. "node" project — Pure Node environment for data/logic/store modules.
 *      No DOM, no WebGL.  Tests live in all src/**\/__tests__\/*.test.ts files.
 *      This was the original single-project configuration.
 *
 *   2. "scene" project — Node environment with Three.js global stubs installed
 *      via `src/testing/vitest-setup-three.ts`.  Targets tests in
 *      src/testing/__tests__\/*.test.ts and the scene test harness baseline.
 *      The setup file installs requestAnimationFrame, WebGL2RenderingContext,
 *      ResizeObserver, and other globals that Three.js expects.
 *
 * Why a project-per-environment approach?
 * ────────────────────────────────────────
 * Three.js object construction (Vector3, Matrix4, BufferGeometry, etc.) does
 * not require a real WebGL context — it only needs the global stubs.  By
 * isolating the scene project we avoid polluting the pure-node tests with
 * globals that could mask bugs (e.g., accidentally passing because
 * requestAnimationFrame is present when it shouldn't be).
 *
 * The "scene" project shares the same Node environment (not jsdom) because:
 *   • All scene module tests target pure exported functions, not React trees.
 *   • jsdom adds significant startup overhead for tests that don't use DOM.
 *   • WebGLRendererMock already provides a complete headless renderer stub.
 *
 * Uses tsconfig.test.json which re-includes __tests__ directories excluded
 * from the production tsconfig.json (to keep the `tsc -b` build clean).
 */
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    // Run in a pure Node environment — data modules have no browser deps
    environment: "node",
    // Glob for test files across all src modules
    include: ["src/**/__tests__/**/*.test.ts"],
    // Report failed + passed counts
    reporter: "verbose",
    // Install Three.js global stubs for all tests.
    // The setup file is a no-op for tests that don't need WebGL globals;
    // it only patches fields that are `undefined` in Node.js.
    setupFiles: [resolve(__dirname, "src/testing/vitest-setup-three.ts")],
    // Use the test-specific tsconfig so test files are properly included
    // without breaking the production tsc -b check
    typecheck: {
      tsconfig: resolve(__dirname, "tsconfig.test.json"),
    },
  },
});
