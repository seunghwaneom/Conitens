/**
 * electron-api.d.ts — TypeScript declarations for the Electron contextBridge
 *
 * Sub-AC 13b: Desktop deployment
 * Sub-AC 13c: Platform abstraction layer — added ElectronNotificationsBridge
 *             and ElectronFsBridge.
 *
 * Extends the global Window interface to include the `electronAPI` object
 * injected by the preload script when running inside Electron.
 *
 * Usage in renderer components:
 * ```ts
 * // Guard: works in both Electron and browser deployments
 * if (window.electronAPI) {
 *   window.electronAPI.window.minimize();
 * }
 *
 * // React hook example
 * const isElectron = typeof window.electronAPI !== 'undefined';
 * ```
 *
 * Keep this in sync with electron/preload.ts — the shapes must match exactly.
 */

// ── Shared sub-types ──────────────────────────────────────────────────────────

/** Snapshot of the native window state. */
interface ElectronWindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
  isMinimized: boolean;
}

/** Runtime metadata about the Electron environment. */
interface ElectronAppInfo {
  version: string;
  platform: string;
  arch: string;
  isDev: boolean;
  name: string;
  electronVersion: string;
  nodeVersion: string;
  chromiumVersion: string;
}

/** Returns a cleanup / unsubscribe function. */
type UnsubscribeFn = () => void;

// ── Top-level API shape ───────────────────────────────────────────────────────

interface ElectronWindowBridge {
  /** Minimize the app window. */
  minimize: () => void;
  /** Toggle maximize / restore the app window. */
  maximize: () => void;
  /** Close the app window. */
  close: () => void;
  /** Enter or exit fullscreen (3D immersive mode). */
  toggleFullscreen: () => void;
  /** Asynchronously retrieve the current window state. */
  getState: () => Promise<ElectronWindowState>;
  /**
   * Subscribe to maximize / restore events.
   * The callback receives `true` when maximized, `false` when restored.
   * Returns an unsubscribe function — call it in `useEffect` cleanup.
   */
  onMaximized: (cb: (maximized: boolean) => void) => UnsubscribeFn;
  /**
   * Subscribe to fullscreen-change events.
   * Returns an unsubscribe function.
   */
  onFullScreen: (cb: (fullScreen: boolean) => void) => UnsubscribeFn;
}

interface ElectronAppBridge {
  /** Retrieve app version, platform, and runtime versions. */
  getInfo: () => Promise<ElectronAppInfo>;
}

interface ElectronShellBridge {
  /**
   * Open a URL in the system's default browser.
   * Only `http://` and `https://` URLs are forwarded; others are silently dropped.
   */
  openExternal: (url: string) => void;
}

interface ElectronDevtoolsBridge {
  /**
   * Toggle the Chromium DevTools panel.
   * This is a no-op in production (packaged) builds.
   */
  toggle: () => void;
}

// ── Sub-AC 13c: Notifications bridge ─────────────────────────────────────────

/** Options for native OS notification display. */
interface ElectronNotifyOptions {
  /** Unique tag for de-duplicating notifications (Web Notification semantics). */
  tag?: string;
  /** Suppress audio feedback. */
  silent?: boolean;
  /** Absolute path to an icon image (optional; defaults to app icon). */
  icon?: string;
}

/**
 * Native OS notification bridge.
 * Delegates to Electron's main-process `Notification` class via IPC.
 */
interface ElectronNotificationsBridge {
  /**
   * Display an OS-level notification.
   * Fire-and-forget — no response is returned.
   */
  show: (title: string, body: string, opts?: ElectronNotifyOptions) => void;
}

// ── Sub-AC 13c: System-tray bridge ───────────────────────────────────────────

/** Returns a cleanup / unsubscribe function from a subscription. */
type TrayUnsubscribeFn = () => void;

/**
 * System-tray bridge — manage the native OS tray icon from the renderer.
 *
 * Desktop-only feature. The renderer sends requests to the main process;
 * the main process pushes `tray:activated` events back when clicked.
 */
interface ElectronTrayBridge {
  /** Create/show the system-tray icon. No-op if already visible. */
  show: () => void;
  /** Destroy/hide the system-tray icon. */
  hide: () => void;
  /** Set the tooltip text shown when hovering the tray icon. */
  setTooltip: (text: string) => void;
  /**
   * Subscribe to tray-icon click events pushed by the main process.
   * Returns an unsubscribe function — call it in `useEffect` cleanup.
   */
  onActivate: (cb: () => void) => TrayUnsubscribeFn;
}

// ── Sub-AC 13c: File-system bridge ───────────────────────────────────────────

/**
 * File-system bridge — Node.js `fs` operations via IPC.
 *
 * All paths are validated by the main process against the allowed-roots list.
 * Requests for paths outside those locations are rejected with an EACCES error.
 */
interface ElectronFsBridge {
  /**
   * Read the entire contents of a UTF-8 encoded text file.
   * Rejects if the path is not allowed or the file does not exist.
   */
  readText: (path: string) => Promise<string>;
  /**
   * Write (overwrite) a UTF-8 text file.
   * Parent directories are created automatically.
   * Rejects if the path is not allowed.
   */
  writeText: (path: string, content: string) => Promise<void>;
  /**
   * Returns `true` if a file or directory exists at `path`.
   * Resolves to `false` on any error (never rejects).
   */
  exists: (path: string) => Promise<boolean>;
  /**
   * List the basenames of all files (not sub-directories) in `directory`.
   * Rejects if the path is not allowed.
   */
  list: (directory: string) => Promise<string[]>;
}

/** The full API surface exposed via contextBridge as `window.electronAPI`. */
interface ElectronAPI {
  window: ElectronWindowBridge;
  app: ElectronAppBridge;
  shell: ElectronShellBridge;
  devtools: ElectronDevtoolsBridge;
  /** Sub-AC 13c: Native OS notifications bridge. */
  notifications: ElectronNotificationsBridge;
  /** Sub-AC 13c: System-tray icon bridge (desktop-only feature). */
  tray: ElectronTrayBridge;
  /** Sub-AC 13c: File-system bridge (Node.js fs via IPC). */
  fs: ElectronFsBridge;
  /**
   * Current OS platform string (`'win32'` | `'darwin'` | `'linux'`).
   * Available synchronously — no async invoke needed.
   */
  platform: string;
  /**
   * `true` when running from source (not from a packaged `electron-builder` build).
   * Useful for conditionally showing debug panels.
   */
  isDev: boolean;
}

// ── Global augmentation ───────────────────────────────────────────────────────

declare global {
  interface Window {
    /**
     * Electron native bridge — present when the app runs inside Electron,
     * `undefined` when running in a regular browser (web deployment).
     *
     * Always guard with `if (window.electronAPI)` before calling methods.
     */
    readonly electronAPI?: ElectronAPI;
  }
}

// Mark this file as a module so the global augmentation works correctly.
export {};
