// @vitest-environment jsdom
/**
 * tray-router-adapters.test.ts — Unit tests for tray + router adapters
 *
 * Sub-AC 3 of AC 13: Shared environment abstraction.
 *
 * Verifies that:
 *   (a) Desktop-only features (tray icon) are enabled in ElectronAdapter and
 *       gracefully disabled (isSupported=false + all no-ops) in WebAdapter.
 *   (b) Web-only features (URL routing) are enabled in WebAdapter and
 *       gracefully disabled (isSupported=false + all no-ops) in ElectronAdapter.
 *   (c) Core GUI code can call all methods on both adapters without branching —
 *       the adapter layer absorbs the platform difference.
 *
 * Test IDs:
 *   13c-tray-1   WebTrayAdapter.isSupported() returns false
 *   13c-tray-2   WebTrayAdapter.show/hide/setTooltip do not throw
 *   13c-tray-3   WebTrayAdapter.onActivate returns a no-op unsubscribe
 *   13c-tray-4   ElectronTrayAdapter.isSupported() returns true when bridge present
 *   13c-tray-5   ElectronTrayAdapter.isSupported() returns false when bridge absent
 *   13c-tray-6   ElectronTrayAdapter.show delegates to electronAPI.tray.show
 *   13c-tray-7   ElectronTrayAdapter.hide delegates to electronAPI.tray.hide
 *   13c-tray-8   ElectronTrayAdapter.setTooltip delegates to electronAPI.tray.setTooltip
 *   13c-tray-9   ElectronTrayAdapter.onActivate forwards to bridge and returns unsubscribe
 *
 *   13c-router-1   ElectronRouterAdapter.isSupported() returns false
 *   13c-router-2   ElectronRouterAdapter.navigate/getCurrentPath/onNavigate do not throw
 *   13c-router-3   ElectronRouterAdapter.getCurrentPath always returns '/'
 *   13c-router-4   WebRouterAdapter.isSupported() returns true in jsdom
 *   13c-router-5   WebRouterAdapter.navigate calls history.pushState
 *   13c-router-6   WebRouterAdapter.navigate notifies subscribers
 *   13c-router-7   WebRouterAdapter.getCurrentPath returns window.location.pathname
 *   13c-router-8   WebRouterAdapter.onNavigate fires on popstate events
 *   13c-router-9   WebRouterAdapter.onNavigate unsubscribe removes callback
 *   13c-router-10  WebRouterAdapter.navigate normalises paths to start with '/'
 *
 *   13c-env-1   tray is desktop-only (electron=true, web=false)
 *   13c-env-2   router is web-only (electron=false, web=true)
 *   13c-env-3   shared GUI code can call tray/router methods on both adapters
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAdapter } from '../web-adapter.js';
import { ElectronAdapter } from '../electron-adapter.js';

// ── Mock ElectronAPI factory ──────────────────────────────────────────────────

function makeMockElectronAPI(hasTray = true) {
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
        name: 'Conitens',
        electronVersion: '33.0.0',
        nodeVersion: '22.0.0',
        chromiumVersion: '128.0.0',
      }),
    },
    shell: { openExternal: vi.fn() },
    devtools: { toggle: vi.fn() },
    notifications: { show: vi.fn() },
    fs: {
      readText: vi.fn().mockResolvedValue(''),
      writeText: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      list: vi.fn().mockResolvedValue([]),
    },
    // Tray bridge — conditionally included
    ...(hasTray
      ? {
          tray: {
            show: vi.fn(),
            hide: vi.fn(),
            setTooltip: vi.fn(),
            onActivate: vi.fn().mockReturnValue(() => undefined),
          },
        }
      : {}),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sub-AC 3 (AC-13c): Tray adapter', () => {
  let webAdapter: WebAdapter;
  let electronAdapter: ElectronAdapter;
  let mockAPI: ReturnType<typeof makeMockElectronAPI>;

  beforeEach(() => {
    mockAPI = makeMockElectronAPI(true);
    injectElectronAPI(mockAPI);
    webAdapter = new WebAdapter();
    electronAdapter = new ElectronAdapter();
  });

  afterEach(() => {
    removeElectronAPI();
    vi.restoreAllMocks();
  });

  // ── Web tray (unsupported) ─────────────────────────────────────────────────

  it('13c-tray-1: WebTrayAdapter.isSupported() returns false', () => {
    expect(webAdapter.tray.isSupported()).toBe(false);
  });

  it('13c-tray-2: WebTrayAdapter show/hide/setTooltip do not throw', () => {
    expect(() => webAdapter.tray.show()).not.toThrow();
    expect(() => webAdapter.tray.hide()).not.toThrow();
    expect(() => webAdapter.tray.setTooltip('hello')).not.toThrow();
  });

  it('13c-tray-3: WebTrayAdapter.onActivate returns a callable no-op unsubscribe', () => {
    const cb = vi.fn();
    const unsub = webAdapter.tray.onActivate(cb);
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
    // Callback should never be called on web
    expect(cb).not.toHaveBeenCalled();
  });

  // ── Electron tray (supported) ─────────────────────────────────────────────

  it('13c-tray-4: ElectronTrayAdapter.isSupported() returns true when tray bridge present', () => {
    expect(electronAdapter.tray.isSupported()).toBe(true);
  });

  it('13c-tray-5: ElectronTrayAdapter.isSupported() returns false when tray bridge absent', () => {
    removeElectronAPI();
    const apiWithoutTray = makeMockElectronAPI(false);
    injectElectronAPI(apiWithoutTray);
    const adapterNoTray = new ElectronAdapter();
    expect(adapterNoTray.tray.isSupported()).toBe(false);
  });

  it('13c-tray-6: ElectronTrayAdapter.show delegates to electronAPI.tray.show', () => {
    electronAdapter.tray.show();
    expect(mockAPI.tray!.show).toHaveBeenCalledOnce();
  });

  it('13c-tray-7: ElectronTrayAdapter.hide delegates to electronAPI.tray.hide', () => {
    electronAdapter.tray.hide();
    expect(mockAPI.tray!.hide).toHaveBeenCalledOnce();
  });

  it('13c-tray-8: ElectronTrayAdapter.setTooltip delegates to electronAPI.tray.setTooltip', () => {
    electronAdapter.tray.setTooltip('Command Center Active');
    expect(mockAPI.tray!.setTooltip).toHaveBeenCalledWith('Command Center Active');
  });

  it('13c-tray-9: ElectronTrayAdapter.onActivate forwards to bridge and returns an unsubscribe fn', () => {
    const cb = vi.fn();
    const unsub = electronAdapter.tray.onActivate(cb);
    expect(mockAPI.tray!.onActivate).toHaveBeenCalledWith(cb);
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});

describe('Sub-AC 3 (AC-13c): Router adapter', () => {
  let webAdapter: WebAdapter;
  let electronAdapter: ElectronAdapter;
  let mockAPI: ReturnType<typeof makeMockElectronAPI>;

  beforeEach(() => {
    mockAPI = makeMockElectronAPI(true);
    injectElectronAPI(mockAPI);
    webAdapter = new WebAdapter();
    electronAdapter = new ElectronAdapter();
  });

  afterEach(() => {
    removeElectronAPI();
    vi.restoreAllMocks();
    // Reset location.pathname to '/' after each test
    if (typeof history !== 'undefined') {
      history.replaceState(null, '', '/');
    }
  });

  // ── Electron router (not supported) ──────────────────────────────────────

  it('13c-router-1: ElectronRouterAdapter.isSupported() returns false', () => {
    expect(electronAdapter.router.isSupported()).toBe(false);
  });

  it('13c-router-2: ElectronRouterAdapter navigate/onNavigate do not throw', () => {
    const cb = vi.fn();
    expect(() => electronAdapter.router.navigate('/scene')).not.toThrow();
    const unsub = electronAdapter.router.onNavigate(cb);
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
    // Callback never fires on Electron
    expect(cb).not.toHaveBeenCalled();
  });

  it('13c-router-3: ElectronRouterAdapter.getCurrentPath always returns "/"', () => {
    expect(electronAdapter.router.getCurrentPath()).toBe('/');
    electronAdapter.router.navigate('/scene');
    // Still returns '/' — Electron does not do URL routing
    expect(electronAdapter.router.getCurrentPath()).toBe('/');
  });

  // ── Web router (History API) ───────────────────────────────────────────────

  it('13c-router-4: WebRouterAdapter.isSupported() returns true in jsdom', () => {
    expect(webAdapter.router.isSupported()).toBe(true);
  });

  it('13c-router-5: WebRouterAdapter.navigate calls history.pushState', () => {
    const pushSpy = vi.spyOn(history, 'pushState');
    webAdapter.router.navigate('/scene');
    expect(pushSpy).toHaveBeenCalledWith(null, '', '/scene');
  });

  it('13c-router-6: WebRouterAdapter.navigate notifies subscribers immediately', () => {
    const cb = vi.fn();
    webAdapter.router.onNavigate(cb);
    webAdapter.router.navigate('/agents');
    expect(cb).toHaveBeenCalledWith('/agents');
  });

  it('13c-router-7: WebRouterAdapter.getCurrentPath returns window.location.pathname', () => {
    history.pushState(null, '', '/my-path');
    expect(webAdapter.router.getCurrentPath()).toBe('/my-path');
    // Restore URL for subsequent tests
    history.replaceState(null, '', '/');
  });

  it('13c-router-8: WebRouterAdapter.onNavigate fires on popstate events', () => {
    const cb = vi.fn();
    // Each WebAdapter creates its own WebRouterAdapter which registers its
    // own popstate listener — use a fresh adapter
    const freshAdapter = new WebAdapter();
    freshAdapter.router.onNavigate(cb);

    // Use replaceState to set the URL (jsdom handles this correctly, updating
    // window.location.pathname without mocking the whole location object).
    history.replaceState(null, '', '/popstate-path');
    // Simulate a browser-initiated navigation (Back/Forward button).
    window.dispatchEvent(new PopStateEvent('popstate', {}));
    expect(cb).toHaveBeenCalledWith('/popstate-path');
    // Restore URL for subsequent tests
    history.replaceState(null, '', '/');
  });

  it('13c-router-9: WebRouterAdapter.onNavigate unsubscribe removes callback', () => {
    const cb = vi.fn();
    const unsub = webAdapter.router.onNavigate(cb);
    unsub();
    webAdapter.router.navigate('/after-unsub');
    expect(cb).not.toHaveBeenCalled();
  });

  it('13c-router-10: WebRouterAdapter.navigate normalises paths to start with "/"', () => {
    const pushSpy = vi.spyOn(history, 'pushState');
    webAdapter.router.navigate('scene'); // no leading slash
    expect(pushSpy).toHaveBeenCalledWith(null, '', '/scene');
  });
});

describe('Sub-AC 3 (AC-13c): Environment feature gating', () => {
  let webAdapter: WebAdapter;
  let electronAdapter: ElectronAdapter;

  beforeEach(() => {
    const mockAPI = makeMockElectronAPI(true);
    injectElectronAPI(mockAPI);
    webAdapter = new WebAdapter();
    electronAdapter = new ElectronAdapter();
  });

  afterEach(() => {
    removeElectronAPI();
    vi.restoreAllMocks();
    if (typeof history !== 'undefined') {
      history.replaceState(null, '', '/');
    }
  });

  it('13c-env-1: tray icon is a desktop-only feature', () => {
    expect(electronAdapter.tray.isSupported()).toBe(true);  // desktop: on
    expect(webAdapter.tray.isSupported()).toBe(false);       // web:     off
  });

  it('13c-env-2: URL routing is a web-only feature', () => {
    expect(webAdapter.router.isSupported()).toBe(true);       // web:     on
    expect(electronAdapter.router.isSupported()).toBe(false); // desktop: off
  });

  it('13c-env-3: shared GUI code can call tray/router methods on both adapters without branching', async () => {
    /**
     * Simulate a platform-agnostic component that:
     *   1. Tries to show the tray icon and set a tooltip.
     *   2. Subscribes to tray activation.
     *   3. Queries the current path.
     *   4. Navigates to '/scene'.
     *   5. Subscribes to navigation events.
     *
     * The SAME function must work against both adapters without conditional logic.
     */
    async function guiInit(
      adapter: typeof webAdapter | typeof electronAdapter,
    ): Promise<{
      traySupported: boolean;
      routerSupported: boolean;
      currentPath: string;
    }> {
      // Tray operations — safe on any adapter
      adapter.tray.show();
      adapter.tray.setTooltip('Conitens Command Center');
      const unsubTray = adapter.tray.onActivate(() => undefined);
      expect(typeof unsubTray).toBe('function');
      unsubTray();

      // Router operations — safe on any adapter
      adapter.router.navigate('/scene');
      const currentPath = adapter.router.getCurrentPath();
      const unsubRouter = adapter.router.onNavigate(() => undefined);
      expect(typeof unsubRouter).toBe('function');
      unsubRouter();

      return {
        traySupported: adapter.tray.isSupported(),
        routerSupported: adapter.router.isSupported(),
        currentPath,
      };
    }

    const webResult = await guiInit(webAdapter);
    const electronResult = await guiInit(electronAdapter);

    // Documented behavioral differences — not bugs
    expect(webResult.traySupported).toBe(false);
    expect(webResult.routerSupported).toBe(true);
    expect(webResult.currentPath).toBe('/scene'); // history.pushState was called

    expect(electronResult.traySupported).toBe(true);
    expect(electronResult.routerSupported).toBe(false);
    expect(electronResult.currentPath).toBe('/'); // Electron always returns '/'
  });
});
