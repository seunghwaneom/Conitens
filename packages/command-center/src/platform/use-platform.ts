/**
 * platform/use-platform.ts — React hook for accessing the platform adapter.
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Provides a stable reference to the `IPlatformAdapter` singleton inside
 * React components and hooks.  The adapter is constructed once at module
 * initialisation time so re-renders and StrictMode double-invocations do not
 * create multiple instances.
 *
 * Usage
 * ─────
 * ```tsx
 * import { usePlatform } from '../platform/use-platform.js';
 *
 * function TitleBar() {
 *   const { window: win, context } = usePlatform();
 *
 *   return (
 *     <div className="title-bar">
 *       {context === 'electron' && (
 *         <>
 *           <button onClick={() => win.minimize()}>─</button>
 *           <button onClick={() => win.maximize()}>□</button>
 *           <button onClick={() => win.close()}>✕</button>
 *         </>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 *
 * Subscribing to window events
 * ────────────────────────────
 * ```tsx
 * function FullscreenListener() {
 *   const { window: win } = usePlatform();
 *   const [isFs, setIsFs] = useState(false);
 *
 *   useEffect(() => {
 *     return win.onFullScreen(setIsFs); // returns unsubscribe fn
 *   }, [win]);
 *
 *   return <span>{isFs ? 'FULLSCREEN' : 'WINDOWED'}</span>;
 * }
 * ```
 */

import { useMemo } from 'react';
import { getPlatformAdapter } from './index.js';
import type { IPlatformAdapter } from './types.js';

/**
 * Returns the platform adapter singleton.
 *
 * The hook is a thin `useMemo` wrapper: the adapter is the same object on
 * every render (stable reference), so components that use it in dependency
 * arrays will not re-render needlessly.
 *
 * @returns The `IPlatformAdapter` for the current runtime context.
 */
export function usePlatform(): IPlatformAdapter {
  // useMemo with empty deps returns the same value every render.
  // getPlatformAdapter() itself is memoised at module level, so this is
  // purely a stable-ref guarantee for React's benefit.
  return useMemo(() => getPlatformAdapter(), []);
}

// Re-export frequently co-used types for import convenience.
export type { IPlatformAdapter } from './types.js';
