/**
 * electron/preload.ts — Electron preload script
 *
 * Sub-AC 13b: Desktop deployment
 * Sub-AC 13c: Platform abstraction layer — added fs + notifications bridges.
 *
 * Runs in the renderer process before page scripts, with access to Node.js APIs
 * (contextIsolation is true, sandbox is false).  Exposes a typed, minimal
 * bridge — window.electronAPI — via contextBridge so renderer code can
 * communicate with the main process without nodeIntegration.
 *
 * Security principle: the bridge is intentionally narrow.  Every IPC channel
 * that the renderer can use must be explicitly listed below.  Renderer code
 * cannot send arbitrary IPC messages.
 *
 * New channels (Sub-AC 13c):
 *   fs:read-text   (invoke) — Read a UTF-8 file via the main process.
 *   fs:write-text  (invoke) — Write/overwrite a UTF-8 file.
 *   fs:exists      (invoke) — Check whether a path exists.
 *   fs:list        (invoke) — List files in a directory.
 *   notify:show    (send)   — Display an OS native notification.
 *
 * Compiled to dist-electron/preload.cjs by the build:electron-main script.
 * The main process references it as:  join(__dirname, 'preload.cjs')
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// ── Allowed IPC channels ──────────────────────────────────────────────────────
// Any channel NOT listed here must not be callable from renderer code.

const SEND_CHANNELS = [
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:toggle-fullscreen',
  'shell:open-external',
  'devtools:toggle',
  // Sub-AC 13c: native OS notification (fire-and-forget)
  'notify:show',
  // Sub-AC 13c (tray): system-tray icon control (fire-and-forget)
  'tray:show',
  'tray:hide',
  'tray:set-tooltip',
] as const;

const INVOKE_CHANNELS = [
  'window:state',
  'app:info',
  // Sub-AC 13c: filesystem operations (all path-validated in the main process)
  'fs:read-text',
  'fs:write-text',
  'fs:exists',
  'fs:list',
] as const;

const RECEIVE_CHANNELS = [
  'window:maximized',
  'window:fullscreen-changed',
  // Sub-AC 13c (tray): pushed from main process when user clicks tray icon
  'tray:activated',
] as const;

type ReceiveChannel = (typeof RECEIVE_CHANNELS)[number];

// ── Bridge ────────────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('electronAPI', {
  /** Window control actions (fire-and-forget). */
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),

    /** Query current window state asynchronously. */
    getState: (): Promise<{
      isMaximized: boolean;
      isFullScreen: boolean;
      isMinimized: boolean;
    }> => ipcRenderer.invoke('window:state'),

    /**
     * Subscribe to maximize/restore events pushed from the main process.
     * Returns an unsubscribe function — call it in useEffect cleanup.
     *
     * @example
     * const unsub = window.electronAPI.window.onMaximized(setMaximized);
     * return unsub;
     */
    onMaximized: (cb: (maximized: boolean) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, value: boolean) => cb(value);
      ipcRenderer.on('window:maximized', handler);
      return () => ipcRenderer.removeListener('window:maximized', handler);
    },

    /**
     * Subscribe to fullscreen-change events.
     * Returns an unsubscribe function.
     */
    onFullScreen: (cb: (fullScreen: boolean) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, value: boolean) => cb(value);
      ipcRenderer.on('window:fullscreen-changed', handler);
      return () => ipcRenderer.removeListener('window:fullscreen-changed', handler);
    },
  },

  /** App metadata — version, platform, runtime versions. */
  app: {
    getInfo: (): Promise<{
      version: string;
      platform: string;
      arch: string;
      isDev: boolean;
      name: string;
      electronVersion: string;
      nodeVersion: string;
      chromiumVersion: string;
    }> => ipcRenderer.invoke('app:info'),
  },

  /** Shell utilities — open URLs in the OS default browser. */
  shell: {
    openExternal: (url: string) => ipcRenderer.send('shell:open-external', url),
  },

  /** Toggle Chromium DevTools (no-op in packaged / production builds). */
  devtools: {
    toggle: () => ipcRenderer.send('devtools:toggle'),
  },

  // ── Sub-AC 13c: Native OS notifications ────────────────────────────────────

  /**
   * Notifications bridge — show an OS-level notification from the main process.
   *
   * Fire-and-forget: the renderer sends the request and the main process shows
   * the notification using Electron's `Notification` class (no response needed).
   */
  notifications: {
    show: (
      title: string,
      body: string,
      opts?: { tag?: string; silent?: boolean; icon?: string },
    ): void =>
      ipcRenderer.send('notify:show', { title, body, ...opts }),
  },

  // ── Sub-AC 13c: System-tray bridge ─────────────────────────────────────────

  /**
   * Tray bridge — show/hide/configure the OS system-tray icon.
   *
   * Desktop-only feature. The renderer sends requests to the main process;
   * the main process pushes `tray:activated` events back when the user clicks
   * the tray icon.
   *
   * All operations are fire-and-forget (send-only) except `onActivate` which
   * subscribes to the reverse `tray:activated` push channel.
   */
  tray: {
    /** Create/show the system-tray icon (no-op if already visible). */
    show: (): void => ipcRenderer.send('tray:show'),
    /** Destroy/hide the system-tray icon. */
    hide: (): void => ipcRenderer.send('tray:hide'),
    /** Set the tooltip text shown when hovering the tray icon. */
    setTooltip: (text: string): void =>
      ipcRenderer.send('tray:set-tooltip', text),
    /**
     * Subscribe to tray-icon activation (click) events pushed by the main
     * process. Returns an unsubscribe function — call it in useEffect cleanup.
     *
     * @example
     * const unsub = window.electronAPI.tray.onActivate(() => showWindow());
     * return unsub;
     */
    onActivate: (cb: () => void): (() => void) => {
      const handler = () => cb();
      ipcRenderer.on('tray:activated', handler);
      return () => ipcRenderer.removeListener('tray:activated', handler);
    },
  },

  // ── Sub-AC 13c: File-system bridge ─────────────────────────────────────────

  /**
   * FS bridge — delegates to Node.js `fs` in the main process.
   *
   * Paths are validated by the main process; requests for paths outside the
   * allowed locations are rejected with an error.
   *
   * All operations are async (invoke-based) to avoid blocking the renderer.
   */
  fs: {
    /** Read a UTF-8 text file. Rejects if path is disallowed or not found. */
    readText: (path: string): Promise<string> =>
      ipcRenderer.invoke('fs:read-text', path),

    /** Write (overwrite) a UTF-8 text file. Rejects if path is disallowed. */
    writeText: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:write-text', path, content),

    /** Return true if the path exists (file or directory). Never rejects. */
    exists: (path: string): Promise<boolean> =>
      ipcRenderer.invoke('fs:exists', path),

    /** List file basenames in a directory. Rejects if path is disallowed. */
    list: (directory: string): Promise<string[]> =>
      ipcRenderer.invoke('fs:list', directory),
  },

  // Synchronous values — no async invoke needed, available immediately on mount.
  /** Current OS platform: 'win32' | 'darwin' | 'linux' */
  platform: process.platform as string,
  /**
   * true when running from source (not from an electron-builder package).
   *
   * Detection: electron-builder packages files into an ASAR archive, so the
   * preload's __dirname will contain 'app.asar' in production.  In development
   * (running via `electron .`) the path is a plain filesystem directory.
   *
   * NOTE: `app` from Electron is main-process-only; we cannot import it here.
   */
  isDev: !__dirname.includes('app.asar'),
});

// Suppress unused-variable warnings for the channel lists; they serve as
// documentation and may be used by a future generic bridge helper.
void SEND_CHANNELS;
void INVOKE_CHANNELS;
void (RECEIVE_CHANNELS as readonly ReceiveChannel[]);
