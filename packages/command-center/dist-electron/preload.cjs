"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  /** Window control actions (fire-and-forget). */
  window: {
    minimize: () => import_electron.ipcRenderer.send("window:minimize"),
    maximize: () => import_electron.ipcRenderer.send("window:maximize"),
    close: () => import_electron.ipcRenderer.send("window:close"),
    toggleFullscreen: () => import_electron.ipcRenderer.send("window:toggle-fullscreen"),
    /** Query current window state asynchronously. */
    getState: () => import_electron.ipcRenderer.invoke("window:state"),
    /**
     * Subscribe to maximize/restore events pushed from the main process.
     * Returns an unsubscribe function — call it in useEffect cleanup.
     *
     * @example
     * const unsub = window.electronAPI.window.onMaximized(setMaximized);
     * return unsub;
     */
    onMaximized: (cb) => {
      const handler = (_, value) => cb(value);
      import_electron.ipcRenderer.on("window:maximized", handler);
      return () => import_electron.ipcRenderer.removeListener("window:maximized", handler);
    },
    /**
     * Subscribe to fullscreen-change events.
     * Returns an unsubscribe function.
     */
    onFullScreen: (cb) => {
      const handler = (_, value) => cb(value);
      import_electron.ipcRenderer.on("window:fullscreen-changed", handler);
      return () => import_electron.ipcRenderer.removeListener("window:fullscreen-changed", handler);
    }
  },
  /** App metadata — version, platform, runtime versions. */
  app: {
    getInfo: () => import_electron.ipcRenderer.invoke("app:info")
  },
  /** Shell utilities — open URLs in the OS default browser. */
  shell: {
    openExternal: (url) => import_electron.ipcRenderer.send("shell:open-external", url)
  },
  /** Toggle Chromium DevTools (no-op in packaged / production builds). */
  devtools: {
    toggle: () => import_electron.ipcRenderer.send("devtools:toggle")
  },
  // ── Sub-AC 13c: Native OS notifications ────────────────────────────────────
  /**
   * Notifications bridge — show an OS-level notification from the main process.
   *
   * Fire-and-forget: the renderer sends the request and the main process shows
   * the notification using Electron's `Notification` class (no response needed).
   */
  notifications: {
    show: (title, body, opts) => import_electron.ipcRenderer.send("notify:show", { title, body, ...opts })
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
    readText: (path) => import_electron.ipcRenderer.invoke("fs:read-text", path),
    /** Write (overwrite) a UTF-8 text file. Rejects if path is disallowed. */
    writeText: (path, content) => import_electron.ipcRenderer.invoke("fs:write-text", path, content),
    /** Return true if the path exists (file or directory). Never rejects. */
    exists: (path) => import_electron.ipcRenderer.invoke("fs:exists", path),
    /** List file basenames in a directory. Rejects if path is disallowed. */
    list: (directory) => import_electron.ipcRenderer.invoke("fs:list", directory)
  },
  // Synchronous values — no async invoke needed, available immediately on mount.
  /** Current OS platform: 'win32' | 'darwin' | 'linux' */
  platform: process.platform,
  /**
   * true when running from source (not from an electron-builder package).
   *
   * Detection: electron-builder packages files into an ASAR archive, so the
   * preload's __dirname will contain 'app.asar' in production.  In development
   * (running via `electron .`) the path is a plain filesystem directory.
   *
   * NOTE: `app` from Electron is main-process-only; we cannot import it here.
   */
  isDev: !__dirname.includes("app.asar")
});
