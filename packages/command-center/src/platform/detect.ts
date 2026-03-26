/**
 * platform/detect.ts — Runtime context detection.
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Determines whether the app is running inside Electron (desktop) or a
 * regular browser (web) by checking for the `window.electronAPI` object
 * injected by the Electron preload script.
 *
 * Rules
 * ─────
 * • Detection is synchronous — no async I/O needed.
 * • Guards for `typeof window` make this safe in SSR / Node.js test runners.
 * • The result is memoised so repeated calls are free.
 * • Never import Electron modules here — this file runs in the renderer.
 */

import type { PlatformContext } from './types.js';

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * Detect whether the app is running inside Electron.
 *
 * The Electron preload script exposes `window.electronAPI` via contextBridge.
 * Its presence is the authoritative signal; we do NOT rely on user-agent
 * strings or navigator properties which are easy to spoof.
 */
export function detectPlatformContext(): PlatformContext {
  if (
    typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI !== undefined
  ) {
    return 'electron';
  }
  return 'web';
}

/**
 * Returns true when running inside the Electron shell.
 *
 * Shorthand for `detectPlatformContext() === 'electron'`.
 *
 * @example
 * ```ts
 * if (isElectron()) {
 *   console.log('Native desktop features available');
 * }
 * ```
 */
export function isElectron(): boolean {
  return detectPlatformContext() === 'electron';
}

/**
 * Returns true when running in a regular browser (no Electron bridge).
 *
 * Shorthand for `detectPlatformContext() === 'web'`.
 */
export function isWeb(): boolean {
  return detectPlatformContext() === 'web';
}
