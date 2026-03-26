/**
 * platform/electron-adapter.ts — Electron-context implementations of IPlatformAdapter.
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Used when `detectPlatformContext()` returns 'electron'. All operations are
 * forwarded through `window.electronAPI` — the contextBridge object injected
 * by the preload script (electron/preload.ts).
 *
 * Capabilities provided
 * ──────────────────────
 *   Window management  ─ Full: minimize, maximize, close, fullscreen, state
 *                         query, maximize/fullscreen event subscriptions.
 *
 *   Notifications      ─ OS-native: forwarded via IPC to Electron's main
 *                         process Notification class.  Always 'granted' —
 *                         no browser permission prompt needed.
 *
 *   File system        ─ Node.js fs via IPC (main process).  Restricted to
 *                         paths that the main process has whitelisted (userData
 *                         and project workspace root). Returns PlatformFsError
 *                         on denial or I/O failure.
 *
 *   openExternal       ─ Electron shell.openExternal via IPC.
 *   getAppInfo         ─ Queries main process for app metadata.
 *
 * Security
 * ────────
 * This adapter calls ONLY methods defined on `window.electronAPI` —
 * no Node.js imports, no direct IPC from the renderer.  The preload script
 * enforces the allowlist of IPC channels.
 */

import type {
  IPlatformAdapter,
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
import { PlatformFsError } from './types.js';

// ── ElectronAPI accessor ──────────────────────────────────────────────────────

/**
 * Returns the `window.electronAPI` object.
 *
 * Throws a clear error if called outside Electron — this should never happen
 * because `ElectronAdapter` is only constructed after `detectPlatformContext()`
 * returns 'electron', but the guard makes misuse obvious.
 */
function getElectronAPI(): NonNullable<Window['electronAPI']> {
  const api = (window as Window & typeof globalThis).electronAPI;
  if (!api) {
    throw new Error(
      '[ElectronAdapter] window.electronAPI is not defined. ' +
        'Did you accidentally instantiate ElectronAdapter outside Electron?',
    );
  }
  return api;
}

// ── Window adapter ────────────────────────────────────────────────────────────

/**
 * Electron window adapter.
 *
 * All methods delegate to `window.electronAPI.window`.
 * Subscriptions forward to the IPC-based event listeners in the preload.
 */
class ElectronWindowAdapter implements PlatformWindowAdapter {
  minimize(): void {
    getElectronAPI().window.minimize();
  }

  maximize(): void {
    getElectronAPI().window.maximize();
  }

  close(): void {
    getElectronAPI().window.close();
  }

  toggleFullscreen(): void {
    getElectronAPI().window.toggleFullscreen();
  }

  async getState(): Promise<WindowState> {
    return getElectronAPI().window.getState();
  }

  onMaximized(cb: (maximized: boolean) => void): UnsubscribeFn {
    return getElectronAPI().window.onMaximized(cb);
  }

  onFullScreen(cb: (fullScreen: boolean) => void): UnsubscribeFn {
    return getElectronAPI().window.onFullScreen(cb);
  }
}

// ── Notification adapter ──────────────────────────────────────────────────────

/**
 * Electron notification adapter.
 *
 * Uses the `notify:show` IPC channel (send-only) to ask the main process to
 * display an OS-level notification via Electron's `Notification` class.
 *
 * Desktop apps always have 'granted' permission — no browser-style prompt.
 */
class ElectronNotificationAdapter implements PlatformNotificationAdapter {
  isSupported(): boolean {
    return true; // Always available in Electron desktop context
  }

  async requestPermission(): Promise<NotificationPermission> {
    // Electron does not gate notifications behind a permission dialog.
    return 'granted';
  }

  async show(
    title: string,
    body: string,
    opts?: PlatformNotifyOptions,
  ): Promise<void> {
    const api = getElectronAPI();
    // Use the extended notifications bridge if available (added in Sub-AC 13c).
    // Falls back gracefully if running against an older preload build.
    if (api.notifications?.show) {
      api.notifications.show(title, body, opts);
    } else {
      // Legacy fallback: log to console so notification intent is visible.
      console.info(`[Notification] ${title}: ${body}`);
    }
  }
}

// ── File-system adapter ───────────────────────────────────────────────────────

/**
 * Electron FS adapter.
 *
 * Sends `fs:*` IPC invocations to the main process which applies path
 * whitelisting and executes the underlying `fs` operations.
 *
 * The adapter wraps IPC errors in `PlatformFsError` so callers get a
 * consistent error type regardless of the underlying failure mode.
 */
class ElectronFsAdapter implements PlatformFsAdapter {
  isSupported(): boolean {
    return !!getElectronAPI().fs;
  }

  async readText(path: string): Promise<string> {
    const api = getElectronAPI();
    if (!api.fs) {
      throw new PlatformFsError(
        'Electron FS bridge not available. Ensure preload.ts is up to date.',
        'EUNSUPPORTED',
      );
    }
    try {
      return await api.fs.readText(path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as NodeJS.ErrnoException).code;
      throw new PlatformFsError(`readText('${path}') failed: ${msg}`, code);
    }
  }

  async writeText(path: string, content: string): Promise<void> {
    const api = getElectronAPI();
    if (!api.fs) {
      throw new PlatformFsError(
        'Electron FS bridge not available. Ensure preload.ts is up to date.',
        'EUNSUPPORTED',
      );
    }
    try {
      await api.fs.writeText(path, content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as NodeJS.ErrnoException).code;
      throw new PlatformFsError(`writeText('${path}') failed: ${msg}`, code);
    }
  }

  async exists(path: string): Promise<boolean> {
    const api = getElectronAPI();
    if (!api.fs) return false;
    try {
      return await api.fs.exists(path);
    } catch {
      return false;
    }
  }

  async list(directory: string): Promise<string[]> {
    const api = getElectronAPI();
    if (!api.fs) {
      throw new PlatformFsError(
        'Electron FS bridge not available. Ensure preload.ts is up to date.',
        'EUNSUPPORTED',
      );
    }
    try {
      return await api.fs.list(directory);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as NodeJS.ErrnoException).code;
      throw new PlatformFsError(`list('${directory}') failed: ${msg}`, code);
    }
  }
}

// ── Tray adapter (Electron) ───────────────────────────────────────────────────

/**
 * Electron tray adapter.
 *
 * Forwards show/hide/setTooltip calls through `window.electronAPI.tray` IPC
 * bridge and subscribes to `tray:activated` events pushed by the main process.
 *
 * Falls back gracefully if the tray bridge is absent (older preload build):
 * `isSupported()` returns false and all methods are no-ops.
 *
 * Desktop-only feature: `WebTrayAdapter.isSupported()` always returns false.
 */
class ElectronTrayAdapter implements PlatformTrayAdapter {
  isSupported(): boolean {
    return !!getElectronAPI().tray;
  }

  show(): void {
    getElectronAPI().tray?.show();
  }

  hide(): void {
    getElectronAPI().tray?.hide();
  }

  setTooltip(text: string): void {
    getElectronAPI().tray?.setTooltip(text);
  }

  onActivate(cb: () => void): UnsubscribeFn {
    const unsub = getElectronAPI().tray?.onActivate(cb);
    // Return a no-op unsubscribe when the tray bridge is absent.
    return unsub ?? (() => undefined);
  }
}

// ── Router adapter (Electron — in-process only) ────────────────────────────

/**
 * Electron router adapter — URL routing is not supported.
 *
 * Electron apps navigate through React state / Zustand stores, not browser
 * URLs. This adapter satisfies the `PlatformRouterAdapter` interface contract
 * with all no-ops so platform-agnostic code compiles unchanged.
 *
 * Web-only feature: `WebRouterAdapter.isSupported()` returns true.
 */
class ElectronRouterAdapter implements PlatformRouterAdapter {
  isSupported(): boolean {
    // URL-based routing is a web concern; Electron uses in-process navigation.
    return false;
  }

  navigate(_path: string): void {
    // No-op: Electron navigates via React state, not History API.
  }

  getCurrentPath(): string {
    // Return a stable root path so callers that unconditionally read the path
    // get a predictable value without throwing.
    return '/';
  }

  onNavigate(_cb: (path: string) => void): UnsubscribeFn {
    // No navigation events in Electron desktop context.
    return () => undefined;
  }
}

// ── Unified Electron adapter ──────────────────────────────────────────────────

/**
 * ElectronAdapter — the complete IPlatformAdapter for Electron desktop builds.
 *
 * Instantiated once by `getPlatformAdapter()` when `window.electronAPI` is
 * present.
 */
export class ElectronAdapter implements IPlatformAdapter {
  readonly context = 'electron' as const;
  readonly window: PlatformWindowAdapter = new ElectronWindowAdapter();
  readonly notifications: PlatformNotificationAdapter =
    new ElectronNotificationAdapter();
  readonly fs: PlatformFsAdapter = new ElectronFsAdapter();
  /** System-tray: native OS tray icon via IPC bridge. */
  readonly tray: PlatformTrayAdapter = new ElectronTrayAdapter();
  /** URL routing: not supported — Electron uses in-process navigation. */
  readonly router: PlatformRouterAdapter = new ElectronRouterAdapter();

  openExternal(url: string): void {
    getElectronAPI().shell.openExternal(url);
  }

  async getAppInfo(): Promise<PlatformAppInfo> {
    const info = await getElectronAPI().app.getInfo();
    return {
      version: info.version,
      platform: info.platform as PlatformAppInfo['platform'],
      arch: info.arch,
      isDev: info.isDev,
      name: info.name,
      runtimeVersions: {
        electron: info.electronVersion,
        node: info.nodeVersion,
        chromium: info.chromiumVersion,
      },
    };
  }
}
