// @vitest-environment jsdom
/**
 * platform-parity.smoke.test.ts — Feature-parity smoke test for Sub-AC 13c.
 *
 * Sub-AC 13c: "Abstract any platform-specific APIs (file system, IPC, native
 * menus) behind a runtime-detected adapter so the core 3D GUI code runs
 * unchanged in both web and desktop targets, with a smoke-test confirming
 * feature parity between the two deployment modes."
 *
 * This file is that smoke test.
 *
 * ─── What it proves ──────────────────────────────────────────────────────────
 *
 * Parity guarantee:
 *   Every method defined on IPlatformAdapter is present and callable on BOTH
 *   WebAdapter and ElectronAdapter without throwing unexpected errors.
 *
 * Behavioral contract:
 *   Documented differences (e.g., fs unsupported on web, always-granted
 *   notifications on Electron) are verified to ensure each adapter behaves
 *   exactly as documented — callers need only switch the adapter instance, not
 *   the calling code.
 *
 * Shared-code simulation:
 *   A "shared GUI function" (`runGuiOperation`) is called with both adapters to
 *   demonstrate that a single implementation targets both deployment modes.
 *
 * ─── Test IDs ─────────────────────────────────────────────────────────────────
 *   13c-parity-1   Both adapters expose all required IPlatformAdapter methods
 *   13c-parity-2   context field uniquely identifies each adapter
 *   13c-parity-3   window.getState() resolves to a valid WindowState on both
 *   13c-parity-4   window.onMaximized returns a callable unsubscribe on both
 *   13c-parity-5   window.onFullScreen returns a callable unsubscribe on both
 *   13c-parity-6   notifications.isSupported() returns true on electron, false on web (no Notification API)
 *   13c-parity-7   notifications.requestPermission() always resolves on both
 *   13c-parity-8   notifications.show() never throws on either adapter
 *   13c-parity-9   fs.isSupported() is true on electron, false on web
 *   13c-parity-10  fs.exists() never throws on either adapter (graceful)
 *   13c-parity-11  fs.readText/writeText/list on web throw PlatformFsError(EUNSUPPORTED)
 *   13c-parity-12  fs.readText/writeText/list on electron resolve/reject via IPC
 *   13c-parity-13  openExternal is callable on both without throwing
 *   13c-parity-14  getAppInfo resolves on both adapters
 *   13c-parity-15  Shared GUI code runs unchanged against both adapters
 *   13c-parity-16  _overridePlatformAdapter + _resetPlatformAdapter allow safe test isolation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAdapter } from '../web-adapter.js';
import { ElectronAdapter } from '../electron-adapter.js';
import {
  getPlatformAdapter,
  _overridePlatformAdapter,
  _resetPlatformAdapter,
  PlatformFsError,
} from '../index.js';
import type { IPlatformAdapter } from '../types.js';

// ── Mock ElectronAPI factory ──────────────────────────────────────────────────

function makeMockElectronAPI() {
  return {
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      toggleFullscreen: vi.fn(),
      getState: vi.fn().mockResolvedValue({
        isMaximized: false,
        isFullScreen: false,
        isMinimized: false,
      }),
      onMaximized: vi.fn().mockReturnValue(() => undefined),
      onFullScreen: vi.fn().mockReturnValue(() => undefined),
    },
    app: {
      getInfo: vi.fn().mockResolvedValue({
        version: '1.0.0',
        platform: 'linux',
        arch: 'x64',
        isDev: true,
        name: 'Conitens Command Center',
        electronVersion: '33.0.0',
        nodeVersion: '22.0.0',
        chromiumVersion: '128.0.0',
      }),
    },
    shell: {
      openExternal: vi.fn(),
    },
    devtools: {
      toggle: vi.fn(),
    },
    notifications: {
      show: vi.fn(),
    },
    fs: {
      readText: vi.fn().mockResolvedValue('hello world'),
      writeText: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue(['file-a.ts', 'file-b.ts']),
    },
    platform: 'linux',
    isDev: true,
  };
}

function injectElectronAPI(api: ReturnType<typeof makeMockElectronAPI>): void {
  Object.defineProperty(globalThis.window, 'electronAPI', {
    value: api,
    configurable: true,
    writable: true,
  });
}

function removeElectronAPI(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis.window as any).electronAPI;
  } catch {
    Object.defineProperty(globalThis.window, 'electronAPI', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }
}

// ── Shared application-level function ─────────────────────────────────────────
//
// This simulates what the 3D GUI code does — it accepts any IPlatformAdapter
// and exercises the common operations.  The SAME function must work against
// both adapters without branching.

interface GuiOperationResult {
  context: string;
  windowState: { isMaximized: boolean; isFullScreen: boolean; isMinimized: boolean };
  notificationsSupported: boolean;
  fsSupported: boolean;
  appInfo: { version: string; platform: string; name: string; isDev: boolean };
  unsubWindow: boolean; // whether onMaximized returned a callable function
}

/**
 * Simulates a GUI bootstrap sequence that any adapter-agnostic component
 * would run.  No platform branching occurs here.
 */
async function runGuiBootstrap(adapter: IPlatformAdapter): Promise<GuiOperationResult> {
  // 1. Query window state
  const windowState = await adapter.window.getState();

  // 2. Subscribe to maximize events (returns unsubscribe)
  const unsub = adapter.window.onMaximized(() => undefined);

  // 3. Check notification support
  const notificationsSupported = adapter.notifications.isSupported();

  // 4. Check fs support
  const fsSupported = adapter.fs.isSupported();

  // 5. Query app metadata
  const appInfo = await adapter.getAppInfo();

  // 6. Try to show a notification (should never throw)
  await adapter.notifications.show('Bootstrap', 'GUI initialised');

  // 7. Unsubscribe from window events (cleanup)
  unsub();

  return {
    context: adapter.context,
    windowState,
    notificationsSupported,
    fsSupported,
    appInfo: {
      version: appInfo.version,
      platform: appInfo.platform,
      name: appInfo.name,
      isDev: appInfo.isDev,
    },
    unsubWindow: typeof unsub === 'function',
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('Sub-AC 13c feature-parity smoke test', () => {
  let mockAPI: ReturnType<typeof makeMockElectronAPI>;
  let webAdapter: WebAdapter;
  let electronAdapter: ElectronAdapter;

  beforeEach(() => {
    _resetPlatformAdapter();
    mockAPI = makeMockElectronAPI();
    injectElectronAPI(mockAPI);
    webAdapter = new WebAdapter();
    electronAdapter = new ElectronAdapter();
  });

  afterEach(() => {
    removeElectronAPI();
    _resetPlatformAdapter();
    vi.restoreAllMocks();
  });

  // ── 13c-parity-1: Interface completeness ────────────────────────────────────

  it('13c-parity-1: both adapters expose all IPlatformAdapter methods', () => {
    const requiredMethods = [
      'openExternal',
      'getAppInfo',
    ] as const;

    const requiredWindowMethods = [
      'minimize',
      'maximize',
      'close',
      'toggleFullscreen',
      'getState',
      'onMaximized',
      'onFullScreen',
    ] as const;

    const requiredNotificationMethods = [
      'isSupported',
      'requestPermission',
      'show',
    ] as const;

    const requiredFsMethods = [
      'isSupported',
      'readText',
      'writeText',
      'exists',
      'list',
    ] as const;

    // Sub-AC 3: tray sub-adapter (desktop-only, but the interface must be
    // present on both adapters — web returns isSupported()=false)
    const requiredTrayMethods = [
      'isSupported',
      'show',
      'hide',
      'setTooltip',
      'onActivate',
    ] as const;

    // Sub-AC 3: router sub-adapter (web-only, but the interface must be
    // present on both adapters — Electron returns isSupported()=false)
    const requiredRouterMethods = [
      'isSupported',
      'navigate',
      'getCurrentPath',
      'onNavigate',
    ] as const;

    for (const adapter of [webAdapter, electronAdapter] as IPlatformAdapter[]) {
      // Top-level methods
      for (const method of requiredMethods) {
        expect(typeof adapter[method], `${adapter.context}.${method}`).toBe('function');
      }
      // Window sub-adapter
      for (const method of requiredWindowMethods) {
        expect(typeof adapter.window[method], `${adapter.context}.window.${method}`).toBe('function');
      }
      // Notifications sub-adapter
      for (const method of requiredNotificationMethods) {
        expect(typeof adapter.notifications[method], `${adapter.context}.notifications.${method}`).toBe('function');
      }
      // FS sub-adapter
      for (const method of requiredFsMethods) {
        expect(typeof adapter.fs[method], `${adapter.context}.fs.${method}`).toBe('function');
      }
      // Sub-AC 3: Tray sub-adapter (present on both; isSupported() differs)
      for (const method of requiredTrayMethods) {
        expect(typeof adapter.tray[method], `${adapter.context}.tray.${method}`).toBe('function');
      }
      // Sub-AC 3: Router sub-adapter (present on both; isSupported() differs)
      for (const method of requiredRouterMethods) {
        expect(typeof adapter.router[method], `${adapter.context}.router.${method}`).toBe('function');
      }
    }
  });

  // ── 13c-parity-2: context ──────────────────────────────────────────────────

  it('13c-parity-2: context field uniquely identifies each adapter', () => {
    expect(webAdapter.context).toBe('web');
    expect(electronAdapter.context).toBe('electron');
    expect(webAdapter.context).not.toBe(electronAdapter.context);
  });

  // ── 13c-parity-3: window.getState ─────────────────────────────────────────

  it('13c-parity-3: window.getState() resolves to a valid WindowState on both adapters', async () => {
    for (const adapter of [webAdapter, electronAdapter] as IPlatformAdapter[]) {
      const state = await adapter.window.getState();
      expect(state, `${adapter.context} window state`).toMatchObject({
        isMaximized: expect.any(Boolean),
        isFullScreen: expect.any(Boolean),
        isMinimized: expect.any(Boolean),
      });
    }
  });

  // ── 13c-parity-4: window.onMaximized ──────────────────────────────────────

  it('13c-parity-4: window.onMaximized returns a callable unsubscribe fn on both', () => {
    for (const adapter of [webAdapter, electronAdapter] as IPlatformAdapter[]) {
      const unsub = adapter.window.onMaximized(() => undefined);
      expect(typeof unsub, `${adapter.context} onMaximized unsub`).toBe('function');
      expect(() => unsub(), `${adapter.context} unsub does not throw`).not.toThrow();
    }
  });

  // ── 13c-parity-5: window.onFullScreen ─────────────────────────────────────

  it('13c-parity-5: window.onFullScreen returns a callable unsubscribe fn on both', () => {
    for (const adapter of [webAdapter, electronAdapter] as IPlatformAdapter[]) {
      const unsub = adapter.window.onFullScreen(() => undefined);
      expect(typeof unsub, `${adapter.context} onFullScreen unsub`).toBe('function');
      expect(() => unsub(), `${adapter.context} unsub does not throw`).not.toThrow();
    }
  });

  // ── 13c-parity-6: notifications.isSupported ───────────────────────────────

  it('13c-parity-6: notifications.isSupported() returns true on electron, false on web (no Notification API in jsdom)', () => {
    // jsdom provides no Notification API by default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Notification;

    const freshWeb = new WebAdapter();
    expect(freshWeb.notifications.isSupported()).toBe(false);
    expect(electronAdapter.notifications.isSupported()).toBe(true);
  });

  // ── 13c-parity-7: notifications.requestPermission ─────────────────────────

  it('13c-parity-7: notifications.requestPermission() always resolves on both adapters', async () => {
    // Web: returns 'denied' when Notification is absent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Notification;
    const webPerm = await webAdapter.notifications.requestPermission();
    expect(['granted', 'denied', 'default']).toContain(webPerm);

    // Electron: always resolves to 'granted'
    const electronPerm = await electronAdapter.notifications.requestPermission();
    expect(electronPerm).toBe('granted');
  });

  // ── 13c-parity-8: notifications.show() ────────────────────────────────────

  it('13c-parity-8: notifications.show() never throws on either adapter', async () => {
    for (const adapter of [webAdapter, electronAdapter] as IPlatformAdapter[]) {
      await expect(
        adapter.notifications.show('Test Title', 'Test body', { silent: true }),
      ).resolves.toBeUndefined();
    }
  });

  // ── 13c-parity-9: fs.isSupported ──────────────────────────────────────────

  it('13c-parity-9: fs.isSupported() is true on electron, false on web', () => {
    expect(webAdapter.fs.isSupported()).toBe(false);
    expect(electronAdapter.fs.isSupported()).toBe(true);
  });

  // ── 13c-parity-10: fs.exists() ────────────────────────────────────────────

  it('13c-parity-10: fs.exists() resolves without throwing on both adapters', async () => {
    // Web: always false
    await expect(webAdapter.fs.exists('/any/path')).resolves.toBe(false);

    // Electron: delegates to IPC
    mockAPI.fs.exists.mockResolvedValueOnce(true);
    await expect(electronAdapter.fs.exists('/allowed/path')).resolves.toBe(true);
  });

  // ── 13c-parity-11: fs unsupported on web ──────────────────────────────────

  it('13c-parity-11: fs.readText/writeText/list on web throw PlatformFsError(EUNSUPPORTED)', async () => {
    const ops: Array<() => Promise<unknown>> = [
      () => webAdapter.fs.readText('/any/path'),
      () => webAdapter.fs.writeText('/any/path', 'content'),
      () => webAdapter.fs.list('/any/dir'),
    ];

    for (const op of ops) {
      let caught: unknown;
      try {
        await op();
      } catch (e) {
        caught = e;
      }
      expect(caught, 'should throw PlatformFsError').toBeInstanceOf(PlatformFsError);
      expect((caught as PlatformFsError).code).toBe('EUNSUPPORTED');
    }
  });

  // ── 13c-parity-12: fs supported on electron ───────────────────────────────

  it('13c-parity-12: fs.readText/writeText/list on electron resolve/reject via IPC', async () => {
    // readText
    const text = await electronAdapter.fs.readText('/allowed/file.txt');
    expect(text).toBe('hello world');
    expect(mockAPI.fs.readText).toHaveBeenCalledWith('/allowed/file.txt');

    // writeText
    await expect(electronAdapter.fs.writeText('/allowed/out.txt', 'data')).resolves.toBeUndefined();
    expect(mockAPI.fs.writeText).toHaveBeenCalledWith('/allowed/out.txt', 'data');

    // list
    const files = await electronAdapter.fs.list('/allowed/dir');
    expect(files).toEqual(['file-a.ts', 'file-b.ts']);
    expect(mockAPI.fs.list).toHaveBeenCalledWith('/allowed/dir');
  });

  // ── 13c-parity-13: openExternal ────────────────────────────────────────────

  it('13c-parity-13: openExternal is callable on both adapters without throwing', () => {
    const mockOpen = vi.fn();
    vi.spyOn(window, 'open').mockImplementation(mockOpen);

    expect(() => webAdapter.openExternal('https://example.com')).not.toThrow();
    expect(mockOpen).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');

    expect(() => electronAdapter.openExternal('https://docs.example.com')).not.toThrow();
    expect(mockAPI.shell.openExternal).toHaveBeenCalledWith('https://docs.example.com');
  });

  // ── 13c-parity-14: getAppInfo ──────────────────────────────────────────────

  it('13c-parity-14: getAppInfo resolves on both adapters with a valid PlatformAppInfo', async () => {
    // Web adapter
    const webInfo = await webAdapter.getAppInfo();
    expect(webInfo.platform).toBe('web');
    expect(typeof webInfo.version).toBe('string');
    expect(typeof webInfo.name).toBe('string');
    expect(typeof webInfo.isDev).toBe('boolean');

    // Electron adapter
    const electronInfo = await electronAdapter.getAppInfo();
    expect(electronInfo.platform).toBe('linux'); // from mock
    expect(electronInfo.version).toBe('1.0.0');
    expect(electronInfo.name).toBe('Conitens Command Center');
    expect(electronInfo.isDev).toBe(true);
    expect(electronInfo.runtimeVersions).toMatchObject({
      electron: '33.0.0',
      node: '22.0.0',
      chromium: '128.0.0',
    });
  });

  // ── 13c-parity-15: Shared GUI bootstrap code ──────────────────────────────

  it('13c-parity-15: shared GUI bootstrap code runs unchanged against both adapters', async () => {
    // This is the key parity assertion: the SAME runGuiBootstrap function
    // is called against both adapters with no branching.

    const webResult = await runGuiBootstrap(webAdapter);
    const electronResult = await runGuiBootstrap(electronAdapter);

    // Both return a valid result shape
    expect(webResult.context).toBe('web');
    expect(electronResult.context).toBe('electron');

    // Both return a valid WindowState shape (specific fullscreen value may vary
    // depending on document state from concurrent tests — only the shape matters here)
    expect(webResult.windowState).toMatchObject({
      isMaximized: expect.any(Boolean),
      isFullScreen: expect.any(Boolean),
      isMinimized: expect.any(Boolean),
    });
    expect(electronResult.windowState).toMatchObject({
      isMaximized: expect.any(Boolean),
      isFullScreen: expect.any(Boolean),
      isMinimized: expect.any(Boolean),
    });

    // Both return valid app info
    expect(webResult.appInfo.platform).toBe('web');
    expect(electronResult.appInfo.platform).toBe('linux');

    // Documented behavioral differences (not branching failures):
    expect(webResult.notificationsSupported).toBe(false); // no Notification API in jsdom
    expect(electronResult.notificationsSupported).toBe(true);

    expect(webResult.fsSupported).toBe(false);
    expect(electronResult.fsSupported).toBe(true);

    // Both returned callable unsubscribe functions
    expect(webResult.unsubWindow).toBe(true);
    expect(electronResult.unsubWindow).toBe(true);
  });

  // ── 13c-parity-16: Test-isolation helpers ────────────────────────────────

  it('13c-parity-16: _overridePlatformAdapter and _resetPlatformAdapter allow safe test isolation', () => {
    _resetPlatformAdapter();
    removeElectronAPI();

    // getPlatformAdapter defaults to web when no electronAPI
    const defaultAdapter = getPlatformAdapter();
    expect(defaultAdapter.context).toBe('web');

    // Override with a mock electron adapter
    _overridePlatformAdapter(electronAdapter);
    expect(getPlatformAdapter()).toBe(electronAdapter);
    expect(getPlatformAdapter().context).toBe('electron');

    // Reset restores auto-detection
    _resetPlatformAdapter();
    removeElectronAPI();
    const restored = getPlatformAdapter();
    expect(restored.context).toBe('web');
    expect(restored).not.toBe(electronAdapter);
  });
});
