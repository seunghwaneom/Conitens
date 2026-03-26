/**
 * platform/types.ts — Shared interface definitions for the platform abstraction layer.
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Defines the contracts that every platform adapter (web, electron) must
 * implement. Shared app logic imports ONLY from this file — it must never
 * reference `window.electronAPI` or Web-only APIs directly.
 *
 * Architecture
 * ────────────
 * ┌──────────────┐      ┌─────────────────────┐
 * │  App / Hooks │─────▶│  IPlatformAdapter   │ (this file)
 * └──────────────┘      └──────────┬──────────┘
 *                                  │ implemented by
 *             ┌────────────────────┴────────────────────┐
 *             ▼                                         ▼
 *   ┌──────────────────┐                   ┌─────────────────────┐
 *   │  WebAdapter      │                   │  ElectronAdapter    │
 *   │  (web-adapter)   │                   │  (electron-adapter) │
 *   └──────────────────┘                   └─────────────────────┘
 */

// ── Primitive types ───────────────────────────────────────────────────────────

/** Identifies which runtime context is active. */
export type PlatformContext = 'web' | 'electron';

/** Cleanup / unsubscribe function returned by event subscriptions. */
export type UnsubscribeFn = () => void;

// ── Window management ─────────────────────────────────────────────────────────

/** Snapshot of the native/browser window state. */
export interface WindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
  isMinimized: boolean;
}

/**
 * Per-platform window-management surface.
 *
 * In Electron, calls are forwarded through the IPC bridge in preload.ts.
 * In web, the adapter uses the Document Fullscreen API and browser history;
 * minimize/maximize/close operations silently no-op where unavailable.
 */
export interface PlatformWindowAdapter {
  /** Minimize the application window (desktop) or no-op (web). */
  minimize(): void;
  /** Toggle maximize / restore (desktop) or no-op (web). */
  maximize(): void;
  /** Close the application window (desktop) or no-op (web). */
  close(): void;
  /** Enter or exit fullscreen — 3D immersive mode. */
  toggleFullscreen(): void;
  /** Asynchronously retrieve current window state. */
  getState(): Promise<WindowState>;
  /**
   * Subscribe to maximize/restore events.
   * Returns an unsubscribe function for useEffect cleanup.
   */
  onMaximized(cb: (maximized: boolean) => void): UnsubscribeFn;
  /**
   * Subscribe to fullscreen-change events.
   * Returns an unsubscribe function for useEffect cleanup.
   */
  onFullScreen(cb: (fullScreen: boolean) => void): UnsubscribeFn;
}

// ── Notifications ─────────────────────────────────────────────────────────────

/** Options accepted by `PlatformNotificationAdapter.show`. */
export interface PlatformNotifyOptions {
  /**
   * Tag string used to de-duplicate or replace a previous notification
   * with the same tag (Web Notifications API semantics).
   */
  tag?: string;
  /** Suppress audio feedback for this notification. */
  silent?: boolean;
  /**
   * Icon to display alongside the notification body.
   * On web: any valid image URL.
   * On desktop (Electron): absolute path to an image file, or omit to use
   * the app icon.
   */
  icon?: string;
}

/**
 * Per-platform OS / browser notification surface.
 *
 * In Electron, uses the Notification class from the main process via IPC so
 * that OS-level notifications appear with the correct app identity.
 * In web, delegates to the browser Notification API.
 */
export interface PlatformNotificationAdapter {
  /** Whether OS/browser notifications are available in this context. */
  isSupported(): boolean;
  /**
   * Request or query notification permission.
   * Returns the resulting permission string:
   *   'granted' — notifications will show.
   *   'denied'  — user explicitly blocked; show() will be a no-op.
   *   'default' — not yet decided; show() may prompt the user.
   *
   * On platforms where no permission is required (Electron), resolves to
   * 'granted' immediately.
   */
  requestPermission(): Promise<NotificationPermission>;
  /**
   * Display an OS / browser notification.
   *
   * Silently no-ops when:
   *   - `isSupported()` is false
   *   - Permission is 'denied'
   *   - The app is not running (impossible here but included for completeness)
   */
  show(title: string, body: string, opts?: PlatformNotifyOptions): Promise<void>;
}

// ── File system ───────────────────────────────────────────────────────────────

/**
 * Per-platform file-system surface.
 *
 * In Electron, operations are forwarded via IPC to the Node.js main process
 * which can read/write the local filesystem (restricted to allowed paths).
 * In web, `isSupported()` returns false and all methods throw `PlatformFsError`.
 *
 * Security note: Electron FS access is restricted to paths inside the app's
 * userData directory and the project workspace root. Arbitrary absolute paths
 * outside those locations are rejected by the main process.
 */
export interface PlatformFsAdapter {
  /** Whether native filesystem access is available in this context. */
  isSupported(): boolean;
  /**
   * Read the entire contents of a UTF-8 encoded text file.
   * @throws {PlatformFsError} when unsupported, path denied, or I/O fails.
   */
  readText(path: string): Promise<string>;
  /**
   * Write (overwrite) a UTF-8 text file.
   * Parent directories are created automatically.
   * @throws {PlatformFsError} when unsupported, path denied, or I/O fails.
   */
  writeText(path: string, content: string): Promise<void>;
  /**
   * Return true if the file or directory at `path` exists.
   * Never throws — returns false on any error.
   */
  exists(path: string): Promise<boolean>;
  /**
   * List the basenames of all files (not subdirectories) within `directory`.
   * @throws {PlatformFsError} when unsupported, path denied, or I/O fails.
   */
  list(directory: string): Promise<string[]>;
}

// ── Tray icon ─────────────────────────────────────────────────────────────────

/**
 * Per-platform system-tray adapter.
 *
 * In Electron, delegates to the native `Tray` class via IPC so the OS
 * taskbar / menu-bar shows a command-center icon.
 * In web, `isSupported()` returns false and all operations silently no-op —
 * the browser has no concept of a system tray.
 *
 * Desktop-only feature, conditionally enabled at runtime via the adapter.
 */
export interface PlatformTrayAdapter {
  /** Whether a system-tray icon is available in this context. */
  isSupported(): boolean;
  /**
   * Show (create) the tray icon.
   * On Electron: creates the native Tray if not yet present.
   * On web: no-op.
   */
  show(): void;
  /**
   * Hide (destroy) the tray icon.
   * On Electron: destroys the native Tray instance.
   * On web: no-op.
   */
  hide(): void;
  /**
   * Set the tooltip text shown when hovering the tray icon.
   * On web: no-op.
   */
  setTooltip(text: string): void;
  /**
   * Subscribe to tray-icon activation (click) events.
   * On web, the callback is never called.
   * Returns an unsubscribe function for useEffect cleanup.
   */
  onActivate(cb: () => void): UnsubscribeFn;
}

// ── URL routing ───────────────────────────────────────────────────────────────

/**
 * Per-platform URL routing adapter.
 *
 * In web, delegates to the browser History API (pushState / popState) so
 * deep-links, back-button, and shareable URLs work as expected.
 * In Electron, `isSupported()` returns false; `navigate()` is a no-op and
 * in-process navigation is handled by React state / Zustand routing.
 *
 * Web-only feature, conditionally enabled at runtime via the adapter.
 */
export interface PlatformRouterAdapter {
  /** Whether URL-based routing is available in this context. */
  isSupported(): boolean;
  /**
   * Navigate to `path`.
   * On web: calls `history.pushState` and notifies `onNavigate` subscribers.
   * On Electron: no-op (routing is handled in-process).
   */
  navigate(path: string): void;
  /**
   * Return the current URL path (e.g. `'/scene'`).
   * On Electron: always returns `'/'`.
   */
  getCurrentPath(): string;
  /**
   * Subscribe to navigation events (`popstate` / `hashchange`).
   * Returns an unsubscribe function for useEffect cleanup.
   * On Electron, the callback is never called.
   */
  onNavigate(cb: (path: string) => void): UnsubscribeFn;
}

// ── App metadata ──────────────────────────────────────────────────────────────

/** Runtime metadata about the running application. */
export interface PlatformAppInfo {
  /** Application version string (semver). */
  version: string;
  /**
   * OS platform identifier.
   * 'web' is returned when running in a plain browser.
   */
  platform: 'web' | 'win32' | 'darwin' | 'linux';
  /** CPU architecture (desktop only; undefined on web). */
  arch?: string;
  /** True when running from source rather than a packaged production build. */
  isDev: boolean;
  /** Application name. */
  name: string;
  /** Engine version strings (node, chromium, electron — desktop only). */
  runtimeVersions?: Record<string, string>;
}

// ── Unified adapter ───────────────────────────────────────────────────────────

/**
 * IPlatformAdapter — the single surface through which all environment-specific
 * capabilities are accessed.
 *
 * Obtain the singleton via `getPlatformAdapter()` (synchronous) or the React
 * hook `usePlatform()`.  Never construct adapters directly in app code.
 *
 * @example
 * ```ts
 * import { usePlatform } from '../platform/use-platform.js';
 *
 * function MyComponent() {
 *   const platform = usePlatform();
 *   return (
 *     <button onClick={() => platform.window.minimize()}>Minimise</button>
 *   );
 * }
 * ```
 */
export interface IPlatformAdapter {
  /** Which context is active. */
  readonly context: PlatformContext;
  /** Window management (minimize, maximize, fullscreen, state events). */
  readonly window: PlatformWindowAdapter;
  /** OS / browser notification dispatch. */
  readonly notifications: PlatformNotificationAdapter;
  /** Native filesystem access (desktop only; degrades on web). */
  readonly fs: PlatformFsAdapter;
  /**
   * System-tray icon (desktop / Electron only; graceful no-op on web).
   *
   * Check `tray.isSupported()` before calling tray methods, or rely on the
   * no-op guarantees documented on each method.
   */
  readonly tray: PlatformTrayAdapter;
  /**
   * URL-based routing (web only; no-op on Electron).
   *
   * Check `router.isSupported()` before relying on routing; Electron builds
   * manage navigation through React state instead.
   */
  readonly router: PlatformRouterAdapter;
  /**
   * Open a URL in the system's default browser.
   * On web, calls `window.open(url, '_blank')`.
   * On Electron, delegates to `shell.openExternal` via IPC.
   */
  openExternal(url: string): void;
  /** Retrieve runtime application metadata. */
  getAppInfo(): Promise<PlatformAppInfo>;
}

// ── Error types ───────────────────────────────────────────────────────────────

/**
 * Thrown by `PlatformFsAdapter` when the operation is unavailable or fails.
 *
 * The `code` field mirrors common Node.js error codes ('ENOENT', 'EACCES', …)
 * where applicable, so callers can handle them uniformly.
 */
export class PlatformFsError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'PlatformFsError';
  }
}
