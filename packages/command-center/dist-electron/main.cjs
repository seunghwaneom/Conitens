"use strict";

// electron/main.ts
var import_electron = require("electron");
var import_path = require("path");
var import_fs = require("fs");
var APP_NAME = "Conitens Command Center";
var DEV_SERVER_URL = "http://localhost:3100";
var MIN_WIDTH = 1200;
var MIN_HEIGHT = 700;
var DEFAULT_WIDTH = 1600;
var DEFAULT_HEIGHT = 960;
var gotLock = import_electron.app.requestSingleInstanceLock();
if (!gotLock) {
  import_electron.app.quit();
  process.exit(0);
}
var mainWindow = null;
function createWindow() {
  const isDev = !import_electron.app.isPackaged;
  import_electron.nativeTheme.themeSource = "dark";
  mainWindow = new import_electron.BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: APP_NAME,
    // Dark command-center background — prevents white flash before renderer loads.
    backgroundColor: "#0a0a0f",
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
      preload: (0, import_path.join)(__dirname, "preload.cjs"),
      // DevTools only in development.
      devTools: isDev,
      // Named session partition for persistence (localStorage, IndexedDB).
      partition: "persist:command-center"
    }
  });
  import_electron.session.fromPartition("persist:command-center").webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
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
              "font-src 'self' data:"
            ].join("; ")
          ]
        }
      });
    }
  );
  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL).catch((err) => {
      console.error("[Electron] Failed to connect to dev server:", err.message);
      console.error('[Electron] Make sure "pnpm dev" is running on port 3100.');
    });
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const distIndex = (0, import_path.join)(__dirname, "..", "dist", "index.html");
    if (!(0, import_fs.existsSync)(distIndex)) {
      console.error("[Electron] Production build not found at:", distIndex);
      console.error('[Electron] Run "pnpm electron:build" first.');
    }
    mainWindow.loadFile(distIndex).catch((err) => {
      console.error("[Electron] Failed to load production build:", err.message);
    });
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximized", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximized", false);
  });
  mainWindow.on("enter-full-screen", () => {
    mainWindow?.webContents.send("window:fullscreen-changed", true);
  });
  mainWindow.on("leave-full-screen", () => {
    mainWindow?.webContents.send("window:fullscreen-changed", false);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1") || url.startsWith("file://")) {
      return { action: "deny" };
    }
    import_electron.shell.openExternal(url).catch(console.error);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const appOrigin = isDev ? DEV_SERVER_URL : `file://${(0, import_path.join)(__dirname, "..", "dist")}`;
    if (!url.startsWith(appOrigin) && !url.startsWith("file://")) {
      event.preventDefault();
      import_electron.shell.openExternal(url).catch(console.error);
    }
  });
}
import_electron.app.setName(APP_NAME);
import_electron.app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
import_electron.app.whenReady().then(() => {
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
import_electron.ipcMain.on("window:minimize", () => {
  mainWindow?.minimize();
});
import_electron.ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
import_electron.ipcMain.on("window:close", () => {
  mainWindow?.close();
});
import_electron.ipcMain.on("window:toggle-fullscreen", () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});
import_electron.ipcMain.handle("window:state", () => ({
  isMaximized: mainWindow?.isMaximized() ?? false,
  isFullScreen: mainWindow?.isFullScreen() ?? false,
  isMinimized: mainWindow?.isMinimized() ?? false
}));
import_electron.ipcMain.handle("app:info", () => ({
  version: import_electron.app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  isDev: !import_electron.app.isPackaged,
  name: import_electron.app.getName(),
  electronVersion: process.versions["electron"] ?? "unknown",
  nodeVersion: process.versions.node,
  chromiumVersion: process.versions["chrome"] ?? "unknown"
}));
import_electron.ipcMain.on("shell:open-external", (_event, url) => {
  if (typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"))) {
    import_electron.shell.openExternal(url).catch(console.error);
  }
});
import_electron.ipcMain.on("devtools:toggle", () => {
  if (!import_electron.app.isPackaged && mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  }
});
import_electron.ipcMain.on("notify:show", (_event, payload) => {
  if (!import_electron.Notification.isSupported()) return;
  const p = typeof payload === "object" && payload !== null ? payload : {};
  const title = typeof p["title"] === "string" ? p["title"] : "Conitens";
  const body = typeof p["body"] === "string" ? p["body"] : "";
  const silent = p["silent"] === true;
  try {
    const n = new import_electron.Notification({ title, body, silent });
    n.show();
  } catch (err) {
    console.warn("[IPC:notify:show] Failed to show notification:", err);
  }
});
function getAllowedRoots() {
  const roots = [(0, import_path.normalize)(import_electron.app.getPath("userData"))];
  const wsRoot = process.env["CONITENS_WORKSPACE_ROOT"];
  if (wsRoot) {
    roots.push((0, import_path.normalize)(wsRoot));
  }
  return roots;
}
function isPathAllowed(requestedPath) {
  const normalised = (0, import_path.normalize)((0, import_path.resolve)(requestedPath));
  return getAllowedRoots().some((root) => normalised.startsWith(root));
}
function assertPathAllowed(requestedPath) {
  if (!isPathAllowed(requestedPath)) {
    throw Object.assign(
      new Error(`FS access denied: path '${requestedPath}' is outside the allowed roots.`),
      { code: "EACCES" }
    );
  }
}
import_electron.ipcMain.handle("fs:read-text", (_event, path) => {
  if (typeof path !== "string") throw new TypeError("fs:read-text: path must be a string");
  assertPathAllowed(path);
  return (0, import_fs.readFileSync)(path, "utf8");
});
import_electron.ipcMain.handle("fs:write-text", (_event, path, content) => {
  if (typeof path !== "string") throw new TypeError("fs:write-text: path must be a string");
  if (typeof content !== "string") throw new TypeError("fs:write-text: content must be a string");
  assertPathAllowed(path);
  const { dirname } = require("path");
  (0, import_fs.mkdirSync)(dirname(path), { recursive: true });
  (0, import_fs.writeFileSync)(path, content, "utf8");
});
import_electron.ipcMain.handle("fs:exists", (_event, path) => {
  if (typeof path !== "string") return false;
  if (!isPathAllowed(path)) return false;
  return (0, import_fs.existsSync)(path);
});
import_electron.ipcMain.handle("fs:list", (_event, directory) => {
  if (typeof directory !== "string") throw new TypeError("fs:list: directory must be a string");
  assertPathAllowed(directory);
  const entries = (0, import_fs.readdirSync)(directory, { withFileTypes: true });
  return entries.filter((e) => {
    try {
      return (0, import_fs.statSync)((0, import_path.join)(directory, e.name)).isFile();
    } catch {
      return false;
    }
  }).map((e) => e.name);
});
if (process.platform !== "darwin") {
  import_electron.app.whenReady().then(() => {
    if (import_electron.app.isPackaged) {
      import_electron.Menu.setApplicationMenu(null);
    }
  });
}
