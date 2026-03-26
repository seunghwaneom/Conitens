/**
 * main.tsx — React application entry for @conitens/command-center
 *
 * Sub-AC 13a: Web deployment pipeline — WebGL2 capability gate
 *
 * Performs a synchronous WebGL2 capability check before mounting the React
 * application.  Three.js r175 uses WebGL2 as its primary renderer back-end;
 * all supported browser targets (Chrome 100+, Firefox 100+, Safari 15.4+,
 * Edge 100+) have full WebGL2 support, but hardware acceleration can be
 * disabled at the OS / driver / browser level.  Without this gate the app
 * renders a blank black canvas with no feedback to the user.
 *
 * WebGPU note: Three.js r175 includes an experimental WebGPU renderer.
 * This entry point probes for WebGPU availability asynchronously and stores
 * the boolean result on `window.__WEBGPU_AVAILABLE__` so future renderer-
 * selection logic in CommandCenterScene can optionally switch to it.
 * The probe is non-blocking — the app always starts on the WebGL2 path.
 */

import { createRoot } from "react-dom/client";
import { App } from "./App.js";

// ── Types ─────────────────────────────────────────────────────────────────

/** Result returned by the WebGL2 capability probe. */
interface WebGL2ProbeResult {
  /** True when a WebGL2 context was acquired successfully. */
  supported: boolean;
  /**
   * Human-readable diagnostic when `supported` is false.
   * Empty string when `supported` is true.
   */
  reason: string;
  /**
   * Unmasked GPU renderer string when available, or "unknown" / "error".
   * Useful for bug reports and telemetry.
   */
  renderer: string;
}

// Extend the global `window` type for the WebGPU availability flag.
declare global {
  interface Window {
    /**
     * Set asynchronously by `probeWebGPU()` after the WebGPU adapter
     * request resolves.  Undefined until the probe completes.
     */
    __WEBGPU_AVAILABLE__?: boolean;
  }
}

// ── WebGL2 capability probe ────────────────────────────────────────────────

/**
 * Probes for WebGL2 by attempting to acquire a context on a 1×1 off-screen
 * canvas.  Synchronous; disposes the context immediately after probing so no
 * GPU resources are held.
 *
 * @returns Probe result indicating support status, diagnostics, and renderer.
 */
function probeWebGL2(): WebGL2ProbeResult {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext("webgl2");

    if (!gl) {
      return {
        supported: false,
        reason:
          "WebGL2 is not available in this browser or GPU configuration. " +
          "Hardware acceleration may be disabled, or the GPU driver does not " +
          "support OpenGL ES 3.0. " +
          "Try enabling hardware acceleration in your browser settings, " +
          "or use Chrome 100+, Firefox 100+, Edge 100+, or Safari 15.4+.",
        renderer: "none",
      };
    }

    // Read the unmasked renderer string for diagnostics before releasing.
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debugInfo
      ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string)
      : "unknown";

    // Explicitly release the context so the GPU handle is freed immediately.
    gl.getExtension("WEBGL_lose_context")?.loseContext();

    return { supported: true, reason: "", renderer };
  } catch (err) {
    return {
      supported: false,
      reason: `WebGL2 initialisation threw an unexpected error: ${
        err instanceof Error ? err.message : String(err)
      }`,
      renderer: "error",
    };
  }
}

// ── WebGPU availability probe (async, non-blocking) ───────────────────────

/**
 * Probes for WebGPU support and stores the boolean result on `window.__WEBGPU_AVAILABLE__`.
 *
 * Called after the WebGL2 gate passes.  The probe is intentionally fire-and-
 * forget — the main React application mounts and renders on the WebGL2 path
 * immediately; WebGPU availability only becomes relevant if/when the renderer
 * later opts in to the Three.js WebGPU back-end.
 *
 * The navigator.gpu API is not yet universally typed; the cast to the
 * provisional GPU interface keeps strict TypeScript happy without requiring an
 * additional @types package.
 */
function probeWebGPU(): void {
  // GPURequestAdapterOptions is only available when "WebGPU" is in tsconfig lib.
  // Use `object` as the opts type to stay compatible with ES2022+DOM lib.
  interface NavigatorWithGPU extends Navigator {
    gpu?: {
      requestAdapter(opts?: object): Promise<unknown>;
    };
  }

  const nav = navigator as NavigatorWithGPU;

  if (!nav.gpu) {
    window.__WEBGPU_AVAILABLE__ = false;
    return;
  }

  nav.gpu
    .requestAdapter()
    .then((adapter) => {
      window.__WEBGPU_AVAILABLE__ = adapter !== null;
    })
    .catch(() => {
      window.__WEBGPU_AVAILABLE__ = false;
    });
}

// ── Error screen markup (no React or Three.js dependency) ─────────────────

/**
 * Returns inline-HTML for the WebGL2-unavailable error screen.
 * Styled to match the command-center dark theme (#0a0a14) without any
 * external dependency — intentionally avoids React or CSS imports so the
 * error is displayed even if module bundling partially fails.
 */
function buildErrorScreen(reason: string): string {
  // Escape HTML entities to prevent XSS from renderer strings in the reason.
  const safe = reason
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return /* html */ `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: #0a0a14;
      font-family: 'Courier New', Courier, monospace;
      color: #ccc;
      box-sizing: border-box;
    ">
      <div style="
        max-width: 560px;
        width: 90%;
        text-align: center;
        padding: 2rem;
        border: 1px solid rgba(255, 79, 79, 0.27);
        border-radius: 6px;
        background: #0f0f1e;
        box-sizing: border-box;
      ">
        <div style="
          font-size: 2.25rem;
          margin-bottom: 0.75rem;
          color: #ff6b6b;
        ">&#x26A0;</div>
        <h1 style="
          font-size: 1.1rem;
          color: #ff6b6b;
          margin: 0 0 0.75rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 600;
        ">WebGL2 Required</h1>
        <p style="
          color: #aaa;
          line-height: 1.65;
          margin: 0 0 1.25rem;
          font-size: 0.875rem;
        ">${safe}</p>
        <hr style="border: none; border-top: 1px solid #1e1e2e; margin: 0 0 1rem;" />
        <p style="
          color: #555;
          font-size: 0.75rem;
          margin: 0;
          line-height: 1.5;
        ">
          Conitens Command Center requires WebGL2 (Three.js r175+).<br />
          Supported: Chrome&#xA0;100+, Firefox&#xA0;100+, Edge&#xA0;100+, Safari&#xA0;15.4+.
        </p>
      </div>
    </div>
  `;
}

// ── Application mount ─────────────────────────────────────────────────────

const rootEl = document.getElementById("root");

// Guard: the #root element must be present in index.html.
// This error is a developer mistake, not a runtime capability failure.
if (!rootEl) {
  throw new Error(
    "[command-center] Critical: #root element not found in index.html. " +
      "The React application cannot be mounted."
  );
}

// Run the synchronous WebGL2 probe.
const webgl2 = probeWebGL2();

if (!webgl2.supported) {
  // WebGL2 unavailable — surface a styled, readable error to the user.
  // No React or Three.js dependency so this always renders.
  rootEl.innerHTML = buildErrorScreen(webgl2.reason);
} else {
  // WebGL2 is available.
  // 1. Fire the async WebGPU probe in the background (non-blocking).
  probeWebGPU();

  // 2. Mount the React application tree.
  createRoot(rootEl).render(<App />);
}
