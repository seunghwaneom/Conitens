/**
 * platform/index.ts — Platform adapter factory and public API entry-point.
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Usage
 * ─────
 * ```ts
 * // Anywhere (synchronous, after app mount):
 * import { getPlatformAdapter } from '../platform/index.js';
 * const platform = getPlatformAdapter();
 * platform.window.minimize();
 *
 * // In React components (preferred):
 * import { usePlatform } from '../platform/use-platform.js';
 * const { window: win } = usePlatform();
 * ```
 *
 * Singleton guarantee
 * ───────────────────
 * `getPlatformAdapter()` constructs the adapter once on first call and caches
 * the result. Subsequent calls return the same instance, so event listener
 * registrations, permission state, etc. are shared across the entire app.
 *
 * Context override (testing)
 * ──────────────────────────
 * Call `_overridePlatformAdapter(mock)` to inject a mock adapter for tests.
 * Call `_resetPlatformAdapter()` to restore auto-detection.
 * These functions are intentionally NOT re-exported from the public index;
 * import them directly when needed in test files.
 */

import { detectPlatformContext } from './detect.js';
import { WebAdapter } from './web-adapter.js';
import { ElectronAdapter } from './electron-adapter.js';
import type { IPlatformAdapter, PlatformContext } from './types.js';

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Cached adapter instance — null until first call to getPlatformAdapter(). */
let _cachedAdapter: IPlatformAdapter | null = null;

/**
 * Return the platform adapter singleton for the current runtime context.
 *
 * On first call the context is detected automatically; the correct adapter is
 * constructed and cached. All subsequent calls return the cached instance.
 *
 * @example
 * ```ts
 * const adapter = getPlatformAdapter();
 * await adapter.notifications.show('Task complete', 'Agent researcher-1 finished.');
 * ```
 */
export function getPlatformAdapter(): IPlatformAdapter {
  if (_cachedAdapter === null) {
    _cachedAdapter = _createAdapter(detectPlatformContext());
  }
  return _cachedAdapter;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** Build the appropriate adapter for the given context. */
function _createAdapter(context: PlatformContext): IPlatformAdapter {
  switch (context) {
    case 'electron':
      return new ElectronAdapter();
    case 'web':
      return new WebAdapter();
    default: {
      // TypeScript exhaustiveness check; also a runtime safety net.
      const _exhaustive: never = context;
      console.warn(
        `[getPlatformAdapter] Unknown context '${String(_exhaustive)}'; falling back to web adapter.`,
      );
      return new WebAdapter();
    }
  }
}

// ── Test helpers (not re-exported; import directly from this module) ──────────

/**
 * Inject a mock adapter — for use in tests only.
 *
 * @example
 * ```ts
 * import { _overridePlatformAdapter, _resetPlatformAdapter } from '../platform/index.js';
 * import { mockPlatformAdapter } from '../platform/__tests__/helpers.js';
 *
 * beforeEach(() => _overridePlatformAdapter(mockPlatformAdapter));
 * afterEach(() => _resetPlatformAdapter());
 * ```
 */
export function _overridePlatformAdapter(adapter: IPlatformAdapter): void {
  _cachedAdapter = adapter;
}

/**
 * Remove any injected override and force re-detection on the next call to
 * `getPlatformAdapter()`.
 */
export function _resetPlatformAdapter(): void {
  _cachedAdapter = null;
}

// ── Public re-exports ─────────────────────────────────────────────────────────

export { detectPlatformContext, isElectron, isWeb } from './detect.js';
export type {
  IPlatformAdapter,
  PlatformContext,
  PlatformWindowAdapter,
  PlatformNotificationAdapter,
  PlatformFsAdapter,
  PlatformTrayAdapter,
  PlatformRouterAdapter,
  PlatformAppInfo,
  PlatformNotifyOptions,
  UnsubscribeFn,
  WindowState,
} from './types.js';
export { PlatformFsError } from './types.js';
