/**
 * desktop-deployment.test.ts — Build pipeline validation for Sub-AC 13b (desktop deployment).
 *
 * Verifies that the Electron wrapper is correctly configured to:
 *  1. Package.json Electron scripts — electron:dev, electron:build, electron:dist (all platforms)
 *  2. electron/main.ts — app metadata, window config, security posture, IPC surface
 *  3. electron/preload.ts — contextBridge API shape, allowed channel lists
 *  4. electron-builder.config.cjs — appId, productName, per-platform targets and artifact names
 *  5. tsconfig.electron.json — CommonJS module target, correct lib/types for Node + Electron
 *  6. electron-api.d.ts — TypeScript Window augmentation, all API shapes declared
 *  7. build/entitlements.mac.plist — macOS hardened-runtime entitlements present
 *  8. .env.electron — relative base URL for file:// protocol compatibility
 *  9. build:electron-main esbuild command — CommonJS output, correct entry points
 *
 * These are static configuration tests — they read project files and assert that
 * the desktop deployment pipeline is configured correctly.  No Electron runtime is required.
 *
 * Test ID scheme:
 *   13b-N : Sub-AC 13b desktop (Electron) deployment pipeline
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Root of the command-center package (3 levels up from src/data/__tests__)
const PKG_ROOT = resolve(__dirname, "../../..");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a plain JSON file (strict — no comments, no trailing commas).
 * Use for package.json, electron-builder.config.cjs, etc.
 */
function readJson(relPath: string): Record<string, unknown> {
  const abs = resolve(PKG_ROOT, relPath);
  const text = readFileSync(abs, "utf-8");
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Parse a JSONC (JSON with Comments) file.
 * TypeScript tsconfig files allow:
 *  - Block comments: /* ... * /
 *  - Single-line comments starting with //
 *  - Trailing commas before } or ]
 *
 * We strip those before passing to JSON.parse.
 * NOTE: This simple stripper is comment-aware but NOT string-literal-aware —
 * it works correctly for tsconfig files because their string values do not
 * contain // sequences.  Do NOT use for package.json or other files whose
 * string values may contain URL paths.
 */
function readJsonc(relPath: string): Record<string, unknown> {
  const abs = resolve(PKG_ROOT, relPath);
  let text = readFileSync(abs, "utf-8");

  // Strip block comments (/** ... */ and /* ... */)
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip single-line comments (// ...) — safe for tsconfig files
  // Uses a negative-lookbehind to avoid stripping inside string values
  // that contain colons (e.g. "https://..."). A full JSONC parser would be
  // more robust, but this covers all TypeScript config files correctly.
  text = text.replace(/^\s*\/\/[^\n]*/gm, "");
  // Remove trailing commas before } or ]
  text = text.replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(text) as Record<string, unknown>;
}

function readText(relPath: string): string {
  return readFileSync(resolve(PKG_ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return existsSync(resolve(PKG_ROOT, relPath));
}

// ── 1. package.json — Electron scripts ────────────────────────────────────────

describe("package.json — Electron deployment scripts (13b-1)", () => {
  let scripts: Record<string, string>;

  beforeAll(() => {
    const pkg = readJson("package.json");
    scripts = pkg["scripts"] as Record<string, string>;
  });

  it("has 'build:electron-main' script using esbuild", () => {
    const s = scripts["build:electron-main"];
    expect(s).toBeDefined();
    expect(s).toContain("esbuild");
    // Must compile electron/main.ts and electron/preload.ts
    expect(s).toContain("electron/main.ts");
    expect(s).toContain("electron/preload.ts");
  });

  it("'build:electron-main' outputs CommonJS format to dist-electron/", () => {
    const s = scripts["build:electron-main"];
    expect(s).toContain("--format=cjs");
    expect(s).toContain("dist-electron");
  });

  it("'build:electron-main' targets Node.js platform", () => {
    const s = scripts["build:electron-main"];
    expect(s).toContain("--platform=node");
  });

  it("'build:electron-main' outputs .cjs extension for Electron compatibility", () => {
    const s = scripts["build:electron-main"];
    expect(s).toContain(".cjs");
  });

  it("has 'electron:dev' script that runs Vite dev server and Electron together", () => {
    const s = scripts["electron:dev"];
    expect(s).toBeDefined();
    expect(s).toContain("electron");
    // Must wait for dev server before launching Electron
    expect(s).toContain("wait-on");
    expect(s).toContain("localhost:3100");
  });

  it("'electron:dev' uses concurrently to run Vite and Electron in parallel", () => {
    const s = scripts["electron:dev"];
    expect(s).toContain("concurrently");
  });

  it("has 'electron:build' script that compiles main process then runs Vite in electron mode", () => {
    const s = scripts["electron:build"];
    expect(s).toBeDefined();
    expect(s).toContain("build:electron-main");
    expect(s).toContain("vite build");
    expect(s).toContain("electron");
  });

  it("has 'electron:dist' script for packaging the current platform", () => {
    const s = scripts["electron:dist"];
    expect(s).toBeDefined();
    expect(s).toContain("electron-builder");
    expect(s).toContain("electron-builder.config.cjs");
  });

  it("has 'electron:dist:win' script for Windows packaging", () => {
    const s = scripts["electron:dist:win"];
    expect(s).toBeDefined();
    expect(s).toContain("electron-builder");
    expect(s).toContain("--win");
  });

  it("has 'electron:dist:mac' script for macOS packaging", () => {
    const s = scripts["electron:dist:mac"];
    expect(s).toBeDefined();
    expect(s).toContain("electron-builder");
    expect(s).toContain("--mac");
  });

  it("has 'electron:dist:linux' script for Linux packaging", () => {
    const s = scripts["electron:dist:linux"];
    expect(s).toBeDefined();
    expect(s).toContain("electron-builder");
    expect(s).toContain("--linux");
  });

  it("has 'typecheck:electron' script for validating Electron source types", () => {
    const s = scripts["typecheck:electron"];
    expect(s).toBeDefined();
    expect(s).toContain("tsconfig.electron.json");
  });

  it("has electron and electron-builder in devDependencies", () => {
    const pkg = readJson("package.json");
    const dev = pkg["devDependencies"] as Record<string, string>;
    expect(dev["electron"]).toBeDefined();
    expect(dev["electron-builder"]).toBeDefined();
  });

  it("has electron version 33+ (supports Chromium with WebGL2 + ES2022)", () => {
    const pkg = readJson("package.json");
    const dev = pkg["devDependencies"] as Record<string, string>;
    // Version string like "^33.0.0" — extract major version
    const versionStr = dev["electron"] ?? "";
    const match = versionStr.match(/(\d+)/);
    expect(match).not.toBeNull();
    const major = parseInt(match![1], 10);
    expect(major).toBeGreaterThanOrEqual(33);
  });

  it("sets package 'main' to dist-electron/main.cjs for Electron entry", () => {
    const pkg = readJson("package.json");
    expect(pkg["main"]).toBe("dist-electron/main.cjs");
  });
});

// ── 2. electron/main.ts — app metadata and window configuration ───────────────

describe("electron/main.ts — app metadata, window config, security (13b-2)", () => {
  let mainTs: string;

  beforeAll(() => {
    mainTs = readText("electron/main.ts");
  });

  it("file exists at electron/main.ts", () => {
    expect(fileExists("electron/main.ts")).toBe(true);
  });

  it("sets APP_NAME to 'Conitens Command Center'", () => {
    expect(mainTs).toContain("Conitens Command Center");
  });

  it("creates a BrowserWindow with the correct default dimensions (1600×960)", () => {
    expect(mainTs).toContain("1600");
    expect(mainTs).toContain("960");
  });

  it("enforces minimum window dimensions (1200×700)", () => {
    expect(mainTs).toContain("1200");
    expect(mainTs).toContain("700");
  });

  it("sets dark background colour (#0a0a0f) to prevent flash of white", () => {
    expect(mainTs).toContain("#0a0a0f");
  });

  it("enables contextIsolation for renderer security", () => {
    expect(mainTs).toContain("contextIsolation: true");
  });

  it("disables nodeIntegration for renderer security", () => {
    expect(mainTs).toContain("nodeIntegration: false");
  });

  it("references preload.cjs in webPreferences", () => {
    expect(mainTs).toContain("preload.cjs");
  });

  it("implements single-instance lock to prevent duplicate windows", () => {
    expect(mainTs).toContain("requestSingleInstanceLock");
  });

  it("loads dev server URL (http://localhost:3100) in development", () => {
    expect(mainTs).toContain("localhost:3100");
  });

  it("loads dist/index.html file in production", () => {
    expect(mainTs).toContain("dist");
    expect(mainTs).toContain("index.html");
  });

  it("applies Content-Security-Policy headers per-response", () => {
    expect(mainTs).toContain("Content-Security-Policy");
  });

  it("CSP allows WebSocket connections to localhost orchestrator", () => {
    expect(mainTs).toContain("ws://localhost");
  });

  it("handles window maximize/restore events and notifies renderer", () => {
    expect(mainTs).toContain("window:maximized");
    expect(mainTs).toContain("maximize");
    expect(mainTs).toContain("unmaximize");
  });

  it("handles fullscreen enter/leave events and notifies renderer", () => {
    expect(mainTs).toContain("window:fullscreen-changed");
    expect(mainTs).toContain("enter-full-screen");
    expect(mainTs).toContain("leave-full-screen");
  });

  it("exposes IPC handler for app:info (version, platform, arch, etc.)", () => {
    expect(mainTs).toContain("app:info");
    expect(mainTs).toContain("version");
    expect(mainTs).toContain("platform");
    expect(mainTs).toContain("arch");
    expect(mainTs).toContain("electronVersion");
  });

  it("exposes IPC handler for window:state (isMaximized, isFullScreen)", () => {
    expect(mainTs).toContain("window:state");
    expect(mainTs).toContain("isMaximized");
    expect(mainTs).toContain("isFullScreen");
  });

  it("handles window:minimize, window:maximize, window:close IPC messages", () => {
    expect(mainTs).toContain("window:minimize");
    expect(mainTs).toContain("window:maximize");
    expect(mainTs).toContain("window:close");
  });

  it("handles window:toggle-fullscreen for 3D immersive mode", () => {
    expect(mainTs).toContain("window:toggle-fullscreen");
    expect(mainTs).toContain("setFullScreen");
  });

  it("handles shell:open-external to open URLs in system browser", () => {
    expect(mainTs).toContain("shell:open-external");
    expect(mainTs).toContain("openExternal");
  });

  it("prevents renderer navigation away from app origin", () => {
    expect(mainTs).toContain("will-navigate");
    expect(mainTs).toContain("preventDefault");
  });

  it("uses setWindowOpenHandler to block new windows (security)", () => {
    expect(mainTs).toContain("setWindowOpenHandler");
    expect(mainTs).toContain("action: 'deny'");
  });

  it("sets app.name via app.setName", () => {
    expect(mainTs).toContain("app.setName");
  });

  it("uses nativeTheme.themeSource = 'dark' for OS chrome styling", () => {
    expect(mainTs).toContain("nativeTheme");
    expect(mainTs).toContain("dark");
  });

  it("quits app on window-all-closed (Windows/Linux behaviour)", () => {
    expect(mainTs).toContain("window-all-closed");
    expect(mainTs).toContain("app.quit");
  });

  it("recreates window on macOS dock activate event", () => {
    expect(mainTs).toContain("activate");
    expect(mainTs).toContain("darwin");
  });

  it("waits for 'ready-to-show' before showing window (avoids flicker)", () => {
    expect(mainTs).toContain("ready-to-show");
    expect(mainTs).toContain("show");
  });
});

// ── 3. electron/preload.ts — contextBridge API ────────────────────────────────

describe("electron/preload.ts — contextBridge API (13b-3)", () => {
  let preloadTs: string;

  beforeAll(() => {
    preloadTs = readText("electron/preload.ts");
  });

  it("file exists at electron/preload.ts", () => {
    expect(fileExists("electron/preload.ts")).toBe(true);
  });

  it("uses contextBridge.exposeInMainWorld to expose API safely", () => {
    expect(preloadTs).toContain("contextBridge");
    expect(preloadTs).toContain("exposeInMainWorld");
    expect(preloadTs).toContain("electronAPI");
  });

  it("exposes window.minimize via ipcRenderer.send", () => {
    expect(preloadTs).toContain("window:minimize");
    expect(preloadTs).toContain("minimize");
  });

  it("exposes window.maximize via ipcRenderer.send", () => {
    expect(preloadTs).toContain("window:maximize");
    expect(preloadTs).toContain("maximize");
  });

  it("exposes window.close via ipcRenderer.send", () => {
    expect(preloadTs).toContain("window:close");
    expect(preloadTs).toContain("close");
  });

  it("exposes window.toggleFullscreen via ipcRenderer.send", () => {
    expect(preloadTs).toContain("window:toggle-fullscreen");
    expect(preloadTs).toContain("toggleFullscreen");
  });

  it("exposes window.getState via ipcRenderer.invoke", () => {
    expect(preloadTs).toContain("window:state");
    expect(preloadTs).toContain("getState");
    expect(preloadTs).toContain("invoke");
  });

  it("exposes window.onMaximized subscription with unsubscribe pattern", () => {
    expect(preloadTs).toContain("window:maximized");
    expect(preloadTs).toContain("onMaximized");
    expect(preloadTs).toContain("removeListener");
  });

  it("exposes window.onFullScreen subscription with unsubscribe pattern", () => {
    expect(preloadTs).toContain("window:fullscreen-changed");
    expect(preloadTs).toContain("onFullScreen");
  });

  it("exposes app.getInfo via ipcRenderer.invoke for metadata", () => {
    expect(preloadTs).toContain("app:info");
    expect(preloadTs).toContain("getInfo");
  });

  it("exposes shell.openExternal for opening URLs in system browser", () => {
    expect(preloadTs).toContain("shell:open-external");
    expect(preloadTs).toContain("openExternal");
  });

  it("exposes devtools.toggle for toggling DevTools", () => {
    expect(preloadTs).toContain("devtools:toggle");
    expect(preloadTs).toContain("toggle");
  });

  it("exposes synchronous platform string (no async invoke)", () => {
    expect(preloadTs).toContain("platform");
    expect(preloadTs).toContain("process.platform");
  });

  it("exposes synchronous isDev flag to detect packaged vs development", () => {
    expect(preloadTs).toContain("isDev");
    expect(preloadTs).toContain("app.asar");
  });

  it("defines explicit allowed channel lists (SEND_CHANNELS, INVOKE_CHANNELS, RECEIVE_CHANNELS)", () => {
    expect(preloadTs).toContain("SEND_CHANNELS");
    expect(preloadTs).toContain("INVOKE_CHANNELS");
    expect(preloadTs).toContain("RECEIVE_CHANNELS");
  });
});

// ── 4. electron-builder.config.cjs — packaging configuration ─────────────────

describe("electron-builder.config.cjs — cross-platform packaging (13b-4)", () => {
  let builderConfig: string;

  beforeAll(() => {
    builderConfig = readText("electron-builder.config.cjs");
  });

  it("file exists at electron-builder.config.cjs", () => {
    expect(fileExists("electron-builder.config.cjs")).toBe(true);
  });

  it("sets appId to 'com.conitens.command-center'", () => {
    expect(builderConfig).toContain("com.conitens.command-center");
  });

  it("sets productName to 'Conitens Command Center'", () => {
    expect(builderConfig).toContain("Conitens Command Center");
  });

  it("points main entry to dist-electron/main.cjs", () => {
    expect(builderConfig).toContain("dist-electron/main.cjs");
  });

  it("includes dist/**/* for web build assets", () => {
    expect(builderConfig).toContain("dist/**/*");
  });

  it("includes dist-electron/**/* for compiled Electron process", () => {
    expect(builderConfig).toContain("dist-electron/**/*");
  });

  it("enables ASAR packaging", () => {
    expect(builderConfig).toContain("asar: true");
  });

  it("disables auto-update (publish: null) for local-only deployment", () => {
    expect(builderConfig).toContain("publish: null");
  });

  it("configures Windows NSIS installer target", () => {
    expect(builderConfig).toContain("nsis");
    expect(builderConfig).toContain("x64");
  });

  it("configures Windows portable executable target", () => {
    expect(builderConfig).toContain("portable");
  });

  it("configures Windows arm64 architecture support", () => {
    expect(builderConfig).toContain("arm64");
  });

  it("NSIS installer allows changing installation directory", () => {
    expect(builderConfig).toContain("allowToChangeInstallationDirectory: true");
  });

  it("NSIS installer creates desktop shortcut", () => {
    expect(builderConfig).toContain("createDesktopShortcut: true");
  });

  it("NSIS installer creates Start Menu shortcut", () => {
    expect(builderConfig).toContain("createStartMenuShortcut: true");
  });

  it("configures macOS DMG target for x64 and arm64", () => {
    expect(builderConfig).toContain("dmg");
    // Both architectures needed for Universal distribution
    expect(builderConfig.match(/arm64/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("configures macOS ZIP target for auto-update compatibility", () => {
    expect(builderConfig).toContain("zip");
  });

  it("sets macOS category to developer-tools", () => {
    expect(builderConfig).toContain("developer-tools");
  });

  it("enables macOS hardened runtime (required for notarization)", () => {
    expect(builderConfig).toContain("hardenedRuntime: true");
  });

  it("references macOS entitlements file", () => {
    expect(builderConfig).toContain("entitlements");
    expect(builderConfig).toContain("entitlements.mac.plist");
  });

  it("configures Linux AppImage target for x64 and arm64", () => {
    expect(builderConfig).toContain("AppImage");
  });

  it("configures Linux Debian .deb package target", () => {
    expect(builderConfig).toContain("deb");
  });

  it("sets Linux category to 'Development'", () => {
    expect(builderConfig).toContain("Development");
  });

  it("sets release output directory", () => {
    expect(builderConfig).toContain("release");
  });

  it("uses 'asInvoker' execution level (no UAC prompt on Windows)", () => {
    expect(builderConfig).toContain("asInvoker");
  });
});

// ── 5. tsconfig.electron.json — TypeScript config for main/preload ────────────

describe("tsconfig.electron.json — Electron main process TypeScript config (13b-5)", () => {
  let tsconfigElectron: Record<string, unknown>;

  beforeAll(() => {
    // tsconfig files are JSONC (allow comments + trailing commas)
    tsconfigElectron = readJsonc("tsconfig.electron.json");
  });

  it("file exists at tsconfig.electron.json", () => {
    expect(fileExists("tsconfig.electron.json")).toBe(true);
  });

  it("uses CommonJS module format (required for Electron main process)", () => {
    const opts = tsconfigElectron["compilerOptions"] as Record<string, unknown>;
    expect(opts["module"]).toBe("CommonJS");
  });

  it("uses Node.js module resolution strategy", () => {
    const opts = tsconfigElectron["compilerOptions"] as Record<string, unknown>;
    expect(opts["moduleResolution"]).toBe("node");
  });

  it("targets ES2022 (supported by Node.js 22 bundled with Electron 33+)", () => {
    const opts = tsconfigElectron["compilerOptions"] as Record<string, unknown>;
    expect(opts["target"]).toBe("ES2022");
  });

  it("uses noEmit: true (type-checking only; esbuild does the compilation)", () => {
    const opts = tsconfigElectron["compilerOptions"] as Record<string, unknown>;
    expect(opts["noEmit"]).toBe(true);
  });

  it("does NOT include DOM lib (main process has no browser APIs)", () => {
    const opts = tsconfigElectron["compilerOptions"] as Record<string, unknown>;
    const lib = opts["lib"] as string[] | undefined;
    expect(lib).toBeDefined();
    // lib should contain ES2022 but NOT DOM
    expect(lib!.some((l) => l.toUpperCase().includes("DOM"))).toBe(false);
  });

  it("includes 'node' and 'electron' in types for correct API definitions", () => {
    const opts = tsconfigElectron["compilerOptions"] as Record<string, unknown>;
    const types = opts["types"] as string[] | undefined;
    expect(types).toBeDefined();
    expect(types).toContain("node");
    expect(types).toContain("electron");
  });

  it("includes only the electron/ directory (not src/)", () => {
    const include = tsconfigElectron["include"] as string[] | undefined;
    expect(include).toBeDefined();
    expect(include).toContain("electron");
    // src/ should NOT be included in the Electron main tsconfig
    expect(include!.includes("src")).toBe(false);
  });

  it("enables strict mode for type safety", () => {
    const opts = tsconfigElectron["compilerOptions"] as Record<string, unknown>;
    expect(opts["strict"]).toBe(true);
  });
});

// ── 6. electron-api.d.ts — TypeScript Window augmentation ────────────────────

describe("electron-api.d.ts — Electron API type declarations (13b-6)", () => {
  let apiDts: string;

  beforeAll(() => {
    apiDts = readText("src/electron-api.d.ts");
  });

  it("file exists at src/electron-api.d.ts", () => {
    expect(fileExists("src/electron-api.d.ts")).toBe(true);
  });

  it("declares ElectronWindowState interface with isMaximized, isFullScreen, isMinimized", () => {
    expect(apiDts).toContain("ElectronWindowState");
    expect(apiDts).toContain("isMaximized");
    expect(apiDts).toContain("isFullScreen");
    expect(apiDts).toContain("isMinimized");
  });

  it("declares ElectronAppInfo interface with version, platform, arch", () => {
    expect(apiDts).toContain("ElectronAppInfo");
    expect(apiDts).toContain("version");
    expect(apiDts).toContain("platform");
    expect(apiDts).toContain("arch");
    expect(apiDts).toContain("electronVersion");
    expect(apiDts).toContain("nodeVersion");
    expect(apiDts).toContain("chromiumVersion");
  });

  it("declares ElectronWindowBridge with all window control methods", () => {
    expect(apiDts).toContain("ElectronWindowBridge");
    expect(apiDts).toContain("minimize");
    expect(apiDts).toContain("maximize");
    expect(apiDts).toContain("close");
    expect(apiDts).toContain("toggleFullscreen");
    expect(apiDts).toContain("getState");
    expect(apiDts).toContain("onMaximized");
    expect(apiDts).toContain("onFullScreen");
  });

  it("declares ElectronAppBridge with getInfo method", () => {
    expect(apiDts).toContain("ElectronAppBridge");
    expect(apiDts).toContain("getInfo");
  });

  it("declares ElectronShellBridge with openExternal method", () => {
    expect(apiDts).toContain("ElectronShellBridge");
    expect(apiDts).toContain("openExternal");
  });

  it("declares ElectronDevtoolsBridge with toggle method", () => {
    expect(apiDts).toContain("ElectronDevtoolsBridge");
    expect(apiDts).toContain("toggle");
  });

  it("declares top-level ElectronAPI interface combining all bridges", () => {
    expect(apiDts).toContain("ElectronAPI");
    expect(apiDts).toContain("window: ElectronWindowBridge");
    expect(apiDts).toContain("app: ElectronAppBridge");
    expect(apiDts).toContain("shell: ElectronShellBridge");
    expect(apiDts).toContain("devtools: ElectronDevtoolsBridge");
  });

  it("declares platform and isDev as synchronous string/boolean fields on ElectronAPI", () => {
    expect(apiDts).toContain("platform: string");
    expect(apiDts).toContain("isDev: boolean");
  });

  it("augments global Window interface with optional electronAPI", () => {
    expect(apiDts).toContain("declare global");
    expect(apiDts).toContain("interface Window");
    expect(apiDts).toContain("electronAPI");
    // Must be optional (?) — not present in browser deployments
    expect(apiDts).toContain("electronAPI?");
  });

  it("exports empty object to ensure global augmentation works as a module", () => {
    expect(apiDts).toContain("export {}");
  });
});

// ── 7. build/entitlements.mac.plist — macOS hardened runtime ─────────────────

describe("build/entitlements.mac.plist — macOS security entitlements (13b-7)", () => {
  let plist: string;

  beforeAll(() => {
    plist = readText("build/entitlements.mac.plist");
  });

  it("file exists at build/entitlements.mac.plist", () => {
    expect(fileExists("build/entitlements.mac.plist")).toBe(true);
  });

  it("is a valid Apple plist XML document", () => {
    expect(plist).toContain("<?xml");
    expect(plist).toContain("<!DOCTYPE plist");
    expect(plist).toContain("<plist");
  });

  it("grants JIT compilation entitlement (required by Chromium/V8)", () => {
    expect(plist).toContain("com.apple.security.cs.allow-jit");
    // The key must be followed by <true/>
    const jitIdx = plist.indexOf("com.apple.security.cs.allow-jit");
    const afterJit = plist.slice(jitIdx, jitIdx + 200);
    expect(afterJit).toContain("<true/>");
  });

  it("grants unsigned executable memory entitlement (Electron native modules)", () => {
    expect(plist).toContain("com.apple.security.cs.allow-unsigned-executable-memory");
  });

  it("grants DYLD environment variables entitlement", () => {
    expect(plist).toContain("com.apple.security.cs.allow-dyld-environment-variables");
  });

  it("grants network client entitlement (WebSocket to orchestrator)", () => {
    expect(plist).toContain("com.apple.security.network.client");
  });
});

// ── 8. .env.electron — Electron renderer build environment ────────────────────

describe(".env.electron — Electron renderer environment configuration (13b-8)", () => {
  let envElectron: string;

  beforeAll(() => {
    envElectron = readText(".env.electron");
  });

  it("file exists at .env.electron", () => {
    expect(fileExists(".env.electron")).toBe(true);
  });

  it("sets VITE_BASE_URL=./ for file:// protocol compatibility", () => {
    // Relative ./ is required for Electron's file:// protocol asset loading
    expect(envElectron).toContain("VITE_BASE_URL=./");
  });

  it("sets VITE_WS_URL to localhost (orchestrator runs on same machine)", () => {
    expect(envElectron).toContain("VITE_WS_URL=ws://localhost");
  });

  it("sets VITE_APP_TITLE to 'Conitens Command Center' (no [DEV] suffix)", () => {
    expect(envElectron).toContain("VITE_APP_TITLE=Conitens Command Center");
    // Production Electron build should not have [DEV] suffix
    expect(envElectron).not.toContain("[DEV]");
  });

  it("does NOT use an absolute / root-relative base URL", () => {
    // An absolute path like VITE_BASE_URL=/ breaks file:// loading in Electron
    const lines = envElectron.split("\n");
    const baseLine = lines.find((l) => l.startsWith("VITE_BASE_URL="));
    expect(baseLine).toBeDefined();
    // Value must be "./" not "/"
    expect(baseLine!.trim()).toBe("VITE_BASE_URL=./");
  });
});

// ── 9. vite.config.ts — Electron build mode ──────────────────────────────────

describe("vite.config.ts — Electron build mode integration (13b-9)", () => {
  let viteConfig: string;

  beforeAll(() => {
    viteConfig = readText("vite.config.ts");
  });

  it("detects Electron mode via 'mode === electron'", () => {
    expect(viteConfig).toContain("electron");
    expect(viteConfig).toMatch(/mode.*===.*["']electron["']|["']electron["'].*===.*mode/);
  });

  it("uses ES2022 target for Electron build (Chromium 33+ natively supports it)", () => {
    expect(viteConfig).toContain("es2022");
  });

  it("applies different targets for Electron vs web builds", () => {
    // isElectron branch uses 'es2022', non-electron uses WEB_BROWSER_TARGETS
    expect(viteConfig).toContain("isElectron");
    expect(viteConfig).toContain("WEB_BROWSER_TARGETS");
  });

  it("reads VITE_BASE_URL env var for base path (enables ./ in .env.electron)", () => {
    expect(viteConfig).toContain("VITE_BASE_URL");
    // The base should be derived from env var, not hardcoded
    expect(viteConfig).toContain('env["VITE_BASE_URL"]');
  });
});

// ── 10. Required files presence check ─────────────────────────────────────────

describe("Required Electron deployment files — presence check (13b-10)", () => {
  const requiredFiles = [
    "electron/main.ts",
    "electron/preload.ts",
    "electron-builder.config.cjs",
    "tsconfig.electron.json",
    "src/electron-api.d.ts",
    "build/entitlements.mac.plist",
    ".env.electron",
    "build/icons/README.md",
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(fileExists(file)).toBe(true);
    });
  }
});
