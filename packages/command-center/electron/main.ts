/**
 * electron/main.ts — Electron main process for Conitens Command Center
 *
 * Sub-AC 13b: Desktop deployment
 *
 * This is the entry point for the Electron shell. It:
 *  - Creates a BrowserWindow with command-center styling (dark, 3D-capable)
 *  - Loads the Vite dev server in development or dist/index.html in production
 *  - Sets up IPC handlers for window controls and native OS integrations
 *  - Enforces security best practices (contextIsolation, CSP, no nodeIntegration)
 *  - Implements single-instance lock to prevent duplicate windows
 *  - Pushes maximize/fullscreen state changes back to the renderer
 *
 * Compiled to dist-electron/main.cjs by the build:electron-main script
 * (esbuild → CommonJS, so __dirname / require are available).
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  nativeTheme,
  session,
  Notification,
  Tray,
  nativeImage,
} from 'electron';
import { join, resolve, normalize } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_NAME = 'Conitens Command Center';
/** Vite dev server URL — must match vite.config.ts server.port (3100). */
const DEV_SERVER_URL = 'http://localhost:3100';
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 700;
const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 960;

// ── Single-instance lock ──────────────────────────────────────────────────────
// Prevent the user from opening multiple command-center windows.

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is already running — let it handle focus, then quit.
  app.quit();
  process.exit(0);
}

// ── Window reference ──────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

// ── Tray reference ────────────────────────────────────────────────────────────
// Sub-AC 13c: system-tray icon — desktop-only feature.

let tray: Tray | null = null;

// ── Window factory ────────────────────────────────────────────────────────────

function createWindow(): void {
  const isDev = !app.isPackaged;

  // Force dark OS chrome so native title bars / scroll bars match the app.
  nativeTheme.themeSource = 'dark';

  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: APP_NAME,

    // Dark command-center background — prevents white flash before renderer loads.
    backgroundColor: '#0a0a0f',

    // Start hidden; show only after 'ready-to-show' fires to avoid flicker.
    show: false,

    // Hide the native menu bar in production; show in dev (DevTools access).
    autoHideMenuBar: !isDev,

    webPreferences: {
      // ── Security ───────────────────────────────────────────────────────
      // contextIsolation: true — preload runs in an isolated context;
      //   renderer code cannot access Node.js APIs directly.
      contextIsolation: true,
      // nodeIntegration: false — renderer cannot import Node.js modules.
      nodeIntegration: false,
      // webSecurity: true (default) — enforces same-origin policy.
      webSecurity: true,
      // sandbox: false — needed so preload can use contextBridge with Node APIs.
      // contextIsolation provides the equivalent safety guarantee.
      sandbox: false,
      // Preload script: injected before page scripts, bridging main ↔ renderer.
      preload: join(__dirname, 'preload.cjs'),
      // DevTools only in development.
      devTools: isDev,
      // Named session partition for persistence (localStorage, IndexedDB).
      partition: 'persist:command-center',
    },
  });

  // ── Content-Security-Policy ──────────────────────────────────────────────
  // Applied per-response so it covers both the Vite dev server (in dev) and
  // the local file:// origin (in production).
  session.fromPartition('persist:command-center').webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            [
              "default-src 'self'",
              // unsafe-inline + unsafe-eval: required by Three.js shader compilation
              // and by React in dev mode.  Acceptable for a local desktop app.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              // data: + blob: for inlined assets, canvas blobs, WebWorkers.
              "img-src 'self' data: blob:",
              // Allow WebSocket connections to the orchestrator.
              "connect-src 'self' ws://localhost:* http://localhost:*",
              // WebWorkers (Three.js draco decoder, etc.)
              "worker-src 'self' blob:",
              // Web fonts
              "font-src 'self' data:",
            ].join('; '),
          ],
        },
      });
    },
  );

  // ── Load content ───────────────────────────────────────────────────────────
  if (isDev) {
    // Development: load from Vite HMR dev server.
    mainWindow
      .loadURL(DEV_SERVER_URL)
      .catch((err: Error) => {
        console.error('[Electron] Failed to connect to dev server:', err.message);
        console.error('[Electron] Make sure "pnpm dev" is running on port 3100.');
      });
    // Detached DevTools window so it doesn't eat into the 3D viewport.
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load the Vite build output.
    const distIndex = join(__dirname, '..', 'dist', 'index.html');
    if (!existsSync(distIndex)) {
      console.error('[Electron] Production build not found at:', distIndex);
      console.error('[Electron] Run "pnpm electron:build" first.');
    }
    mainWindow.loadFile(distIndex).catch((err: Error) => {
      console.error('[Electron] Failed to load production build:', err.message);
    });
  }

  // ── Window show / focus ────────────────────────────────────────────────────
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // ── State-change notifications to renderer ─────────────────────────────────
  // Push maximize / restore events so the HUD can update its title-bar icons.
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false);
  });
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ── External link handling ─────────────────────────────────────────────────
  // Links that navigate away from the app origin open in the system browser
  // instead of spawning a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Localhost URLs are allowed inside the app (e.g. docs, preview server).
    if (
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('file://')
    ) {
      return { action: 'deny' };
    }
    // Everything else → system browser.
    shell.openExternal(url).catch(console.error);
    return { action: 'deny' };
  });

  // Prevent in-page navigation away from the app.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appOrigin = isDev
      ? DEV_SERVER_URL
      : `file://${join(__dirname, '..', 'dist')}`;
    if (!url.startsWith(appOrigin) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url).catch(console.error);
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.setName(APP_NAME);

// When the user tries to open a second instance, focus the existing window.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();

  // macOS: recreate the window when the dock icon is clicked with no windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (Windows / Linux).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

/** Minimize the main window. */
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

/** Toggle maximize / restore. */
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

/** Close the main window. */
ipcMain.on('window:close', () => {
  mainWindow?.close();
});

/** Enter / exit fullscreen — for 3D immersive mode. */
ipcMain.on('window:toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

/** Query current window state (used by HUD on mount). */
ipcMain.handle('window:state', () => ({
  isMaximized: mainWindow?.isMaximized() ?? false,
  isFullScreen: mainWindow?.isFullScreen() ?? false,
  isMinimized: mainWindow?.isMinimized() ?? false,
}));

/** App metadata for the HUD info panel. */
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  isDev: !app.isPackaged,
  name: app.getName(),
  electronVersion: process.versions['electron'] ?? 'unknown',
  nodeVersion: process.versions.node,
  chromiumVersion: process.versions['chrome'] ?? 'unknown',
}));

/** Open an external URL in the system browser (used for docs / GitHub links). */
ipcMain.on('shell:open-external', (_event, url: unknown) => {
  if (
    typeof url === 'string' &&
    (url.startsWith('https://') || url.startsWith('http://'))
  ) {
    shell.openExternal(url).catch(console.error);
  }
});

/** Toggle Chromium DevTools (development only). */
ipcMain.on('devtools:toggle', () => {
  if (!app.isPackaged && mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  }
});

// ── Sub-AC 13c: Native OS notifications ───────────────────────────────────────

/**
 * Show an OS-level notification using Electron's main-process Notification class.
 *
 * Payload: { title: string; body: string; tag?: string; silent?: boolean; icon?: string }
 */
ipcMain.on('notify:show', (_event, payload: unknown) => {
  if (!Notification.isSupported()) return;

  const p = (typeof payload === 'object' && payload !== null)
    ? payload as Record<string, unknown>
    : {};

  const title = typeof p['title'] === 'string' ? p['title'] : 'Conitens';
  const body  = typeof p['body']  === 'string' ? p['body']  : '';
  const silent = p['silent'] === true;

  try {
    const n = new Notification({ title, body, silent });
    n.show();
  } catch (err) {
    console.warn('[IPC:notify:show] Failed to show notification:', err);
  }
});

// ── Sub-AC 13c: File-system IPC handlers ──────────────────────────────────────

/**
 * Path allowlist: FS operations are restricted to these root directories.
 *
 * Allowed locations:
 *   1. app.getPath('userData') — Electron's per-user app data directory.
 *   2. CONITENS_WORKSPACE_ROOT — the project root set via env var (local dev).
 *
 * Any path that does not start with one of these roots (after normalization)
 * is rejected with an EACCES-like error.
 */
function getAllowedRoots(): string[] {
  const roots: string[] = [normalize(app.getPath('userData'))];
  const wsRoot = process.env['CONITENS_WORKSPACE_ROOT'];
  if (wsRoot) {
    roots.push(normalize(wsRoot));
  }
  return roots;
}

function isPathAllowed(requestedPath: string): boolean {
  const normalised = normalize(resolve(requestedPath));
  return getAllowedRoots().some((root) => normalised.startsWith(root));
}

function assertPathAllowed(requestedPath: string): void {
  if (!isPathAllowed(requestedPath)) {
    throw Object.assign(
      new Error(`FS access denied: path '${requestedPath}' is outside the allowed roots.`),
      { code: 'EACCES' },
    );
  }
}

/** Read a UTF-8 text file. */
ipcMain.handle('fs:read-text', (_event, path: unknown): string => {
  if (typeof path !== 'string') throw new TypeError('fs:read-text: path must be a string');
  assertPathAllowed(path);
  return readFileSync(path, 'utf8');
});

/** Write/overwrite a UTF-8 text file (creates parent directories as needed). */
ipcMain.handle('fs:write-text', (_event, path: unknown, content: unknown): void => {
  if (typeof path !== 'string') throw new TypeError('fs:write-text: path must be a string');
  if (typeof content !== 'string') throw new TypeError('fs:write-text: content must be a string');
  assertPathAllowed(path);
  // Ensure parent directory exists.
  const { dirname } = require('path') as typeof import('path');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
});

/** Return true if a file or directory exists at the given path. */
ipcMain.handle('fs:exists', (_event, path: unknown): boolean => {
  if (typeof path !== 'string') return false;
  if (!isPathAllowed(path)) return false;
  return existsSync(path);
});

/** List file basenames (not sub-directories) within a directory. */
ipcMain.handle('fs:list', (_event, directory: unknown): string[] => {
  if (typeof directory !== 'string') throw new TypeError('fs:list: directory must be a string');
  assertPathAllowed(directory);
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries
    .filter((e) => {
      try { return statSync(join(directory, e.name)).isFile(); } catch { return false; }
    })
    .map((e) => e.name);
});

// ── Sub-AC 13c: System-tray IPC handlers ──────────────────────────────────────
//
// The renderer calls these via window.electronAPI.tray.{show,hide,setTooltip}.
// The main process manages the Tray lifecycle and pushes `tray:activated` back
// to the renderer when the user clicks the tray icon.

/**
 * Build a minimal tray icon image.
 *
 * Tries the bundled icon asset first; falls back to a 16×16 empty image so
 * the Tray constructor never throws on a missing file.  The empty image
 * results in a blank / transparent tray entry — acceptable for development;
 * production builds should provide a real icon via the assets directory.
 */
function buildTrayIcon(): Electron.NativeImage {
  const iconPath = join(__dirname, '..', 'dist', 'favicon.ico');
  if (existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  }
  // Fallback: 1×1 transparent PNG encoded as a data URL.
  const TRANSPARENT_1X1_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';
  return nativeImage.createFromDataURL(TRANSPARENT_1X1_PNG);
}

/** Create or return the existing Tray instance. */
function getOrCreateTray(): Tray {
  if (!tray) {
    tray = new Tray(buildTrayIcon());
    tray.setToolTip(APP_NAME);

    // Push `tray:activated` to the renderer when the user clicks the icon.
    tray.on('click', () => {
      mainWindow?.webContents.send('tray:activated');
    });
    // On macOS, double-click is the primary activation gesture.
    tray.on('double-click', () => {
      mainWindow?.webContents.send('tray:activated');
    });
  }
  return tray;
}

/** Show (create) the system-tray icon. */
ipcMain.on('tray:show', () => {
  try {
    getOrCreateTray();
  } catch (err) {
    console.warn('[IPC:tray:show] Failed to create tray icon:', err);
  }
});

/** Hide (destroy) the system-tray icon. */
ipcMain.on('tray:hide', () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

/** Set the tooltip text on the tray icon. */
ipcMain.on('tray:set-tooltip', (_event, tooltip: unknown) => {
  if (tray && typeof tooltip === 'string') {
    tray.setToolTip(tooltip);
  }
});

// ── macOS: remove default menu in production ──────────────────────────────────
// The default Electron menu is useful in dev (Edit, View → DevTools).
// In production it's replaced with null (no menu bar on Windows/Linux;
// macOS keeps the system menu bar but application menu is removed).
if (process.platform !== 'darwin') {
  app.whenReady().then(() => {
    if (app.isPackaged) {
      Menu.setApplicationMenu(null);
    }
  });
}
