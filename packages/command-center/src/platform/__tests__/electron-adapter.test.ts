// @vitest-environment jsdom
/**
 * electron-adapter.test.ts — Unit tests for platform/electron-adapter.ts
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Tests:
 *   13c-elec-1   ElectronAdapter.context is 'electron'
 *   13c-elec-2   window.minimize delegates to electronAPI.window.minimize
 *   13c-elec-3   window.maximize delegates to electronAPI.window.maximize
 *   13c-elec-4   window.close delegates to electronAPI.window.close
 *   13c-elec-5   window.toggleFullscreen delegates to electronAPI.window.toggleFullscreen
 *   13c-elec-6   window.getState resolves with data from electronAPI.window.getState
 *   13c-elec-7   window.onMaximized forwards to electronAPI.window.onMaximized
 *   13c-elec-8   window.onFullScreen forwards to electronAPI.window.onFullScreen
 *   13c-elec-9   notifications.isSupported() returns true
 *   13c-elec-10  notifications.requestPermission() resolves to 'granted'
 *   13c-elec-11  notifications.show() calls electronAPI.notifications.show
 *   13c-elec-12  notifications.show() gracefully falls back when bridge absent
 *   13c-elec-13  fs.isSupported() returns true when electronAPI.fs exists
 *   13c-elec-14  fs.readText delegates to electronAPI.fs.readText
 *   13c-elec-15  fs.writeText delegates to electronAPI.fs.writeText
 *   13c-elec-16  fs.exists delegates to electronAPI.fs.exists
 *   13c-elec-17  fs.list delegates to electronAPI.fs.list
 *   13c-elec-18  fs operations wrap IPC errors in PlatformFsError
 *   13c-elec-19  openExternal calls electronAPI.shell.openExternal
 *   13c-elec-20  getAppInfo maps electronAPI.app.getInfo to PlatformAppInfo
 *   13c-elec-21  constructor throws descriptively when electronAPI is missing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElectronAdapter } from '../electron-adapter.js';
import { PlatformFsError } from '../types.js';

// ── Mock electronAPI factory ──────────────────────────────────────────────────

function makeMockElectronAPI(overrides: Partial<Record<string, unknown>> = {}) {
  const api = {
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      toggleFullscreen: vi.fn(),
      getState: vi.fn().mockResolvedValue({ isMaximized: false, isFullScreen: false, isMinimized: false }),
      onMaximized: vi.fn().mockReturnValue(() => undefined),
      onFullScreen: vi.fn().mockReturnValue(() => undefined),
    },
    app: {
      getInfo: vi.fn().mockResolvedValue({
        version: '1.2.3',
        platform: 'linux',
        arch: 'x64',
        isDev: true,
        name: 'Conitens',
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
      readText: vi.fn().mockResolvedValue('file-content'),
      writeText: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue(['a.txt', 'b.txt']),
    },
    platform: 'linux' as string,
    isDev: true,
    ...overrides,
  };
  return api;
}

function injectAPI(api: ReturnType<typeof makeMockElectronAPI>): void {
  Object.defineProperty(globalThis.window, 'electronAPI', {
    value: api,
    configurable: true,
    writable: true,
  });
}

function removeAPI(): void {
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

describe('ElectronAdapter', () => {
  let mockAPI: ReturnType<typeof makeMockElectronAPI>;
  let adapter: ElectronAdapter;

  beforeEach(() => {
    mockAPI = makeMockElectronAPI();
    injectAPI(mockAPI);
    adapter = new ElectronAdapter();
  });

  afterEach(() => {
    removeAPI();
    vi.restoreAllMocks();
  });

  it('13c-elec-1: context is "electron"', () => {
    expect(adapter.context).toBe('electron');
  });

  // ── window ────────────────────────────────────────────────────────────────────

  it('13c-elec-2: window.minimize delegates to electronAPI.window.minimize', () => {
    adapter.window.minimize();
    expect(mockAPI.window.minimize).toHaveBeenCalledOnce();
  });

  it('13c-elec-3: window.maximize delegates to electronAPI.window.maximize', () => {
    adapter.window.maximize();
    expect(mockAPI.window.maximize).toHaveBeenCalledOnce();
  });

  it('13c-elec-4: window.close delegates to electronAPI.window.close', () => {
    adapter.window.close();
    expect(mockAPI.window.close).toHaveBeenCalledOnce();
  });

  it('13c-elec-5: window.toggleFullscreen delegates to electronAPI.window.toggleFullscreen', () => {
    adapter.window.toggleFullscreen();
    expect(mockAPI.window.toggleFullscreen).toHaveBeenCalledOnce();
  });

  it('13c-elec-6: window.getState resolves with electronAPI data', async () => {
    mockAPI.window.getState.mockResolvedValueOnce({
      isMaximized: true,
      isFullScreen: false,
      isMinimized: false,
    });
    const state = await adapter.window.getState();
    expect(state.isMaximized).toBe(true);
    expect(state.isFullScreen).toBe(false);
  });

  it('13c-elec-7: window.onMaximized returns unsubscribe from electronAPI.window.onMaximized', () => {
    const unsub = vi.fn();
    mockAPI.window.onMaximized.mockReturnValue(unsub);

    const cb = vi.fn();
    const returned = adapter.window.onMaximized(cb);
    expect(mockAPI.window.onMaximized).toHaveBeenCalledWith(cb);
    expect(returned).toBe(unsub);
  });

  it('13c-elec-8: window.onFullScreen returns unsubscribe from electronAPI.window.onFullScreen', () => {
    const unsub = vi.fn();
    mockAPI.window.onFullScreen.mockReturnValue(unsub);

    const cb = vi.fn();
    const returned = adapter.window.onFullScreen(cb);
    expect(mockAPI.window.onFullScreen).toHaveBeenCalledWith(cb);
    expect(returned).toBe(unsub);
  });

  // ── notifications ─────────────────────────────────────────────────────────────

  it('13c-elec-9: notifications.isSupported() returns true', () => {
    expect(adapter.notifications.isSupported()).toBe(true);
  });

  it('13c-elec-10: notifications.requestPermission() resolves to "granted"', async () => {
    const perm = await adapter.notifications.requestPermission();
    expect(perm).toBe('granted');
  });

  it('13c-elec-11: notifications.show() calls electronAPI.notifications.show', async () => {
    await adapter.notifications.show('Title', 'Body', { silent: true });
    expect(mockAPI.notifications.show).toHaveBeenCalledWith('Title', 'Body', { silent: true });
  });

  it('13c-elec-12: notifications.show() falls back gracefully when bridge is absent', async () => {
    injectAPI({ ...mockAPI, notifications: undefined as unknown as typeof mockAPI.notifications });
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const adapterNoNotify = new ElectronAdapter();

    await expect(adapterNoNotify.notifications.show('T', 'B')).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Notification]'));
  });

  // ── fs ────────────────────────────────────────────────────────────────────────

  it('13c-elec-13: fs.isSupported() returns true when electronAPI.fs exists', () => {
    expect(adapter.fs.isSupported()).toBe(true);
  });

  it('13c-elec-14: fs.readText delegates to electronAPI.fs.readText', async () => {
    const result = await adapter.fs.readText('/allowed/path/file.txt');
    expect(mockAPI.fs.readText).toHaveBeenCalledWith('/allowed/path/file.txt');
    expect(result).toBe('file-content');
  });

  it('13c-elec-15: fs.writeText delegates to electronAPI.fs.writeText', async () => {
    await adapter.fs.writeText('/allowed/path/file.txt', 'new-content');
    expect(mockAPI.fs.writeText).toHaveBeenCalledWith('/allowed/path/file.txt', 'new-content');
  });

  it('13c-elec-16: fs.exists delegates to electronAPI.fs.exists', async () => {
    const result = await adapter.fs.exists('/some/path');
    expect(mockAPI.fs.exists).toHaveBeenCalledWith('/some/path');
    expect(result).toBe(true);
  });

  it('13c-elec-17: fs.list delegates to electronAPI.fs.list', async () => {
    const result = await adapter.fs.list('/some/dir');
    expect(mockAPI.fs.list).toHaveBeenCalledWith('/some/dir');
    expect(result).toEqual(['a.txt', 'b.txt']);
  });

  it('13c-elec-18: fs errors from IPC are wrapped in PlatformFsError', async () => {
    const ipcError = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    mockAPI.fs.readText.mockRejectedValue(ipcError);

    await expect(adapter.fs.readText('/missing/file.txt')).rejects.toBeInstanceOf(PlatformFsError);
    try {
      await adapter.fs.readText('/missing/file.txt');
    } catch (e) {
      expect((e as PlatformFsError).code).toBe('ENOENT');
    }
  });

  it('13c-elec-13b: fs.isSupported() returns false when electronAPI.fs is absent', () => {
    injectAPI({ ...mockAPI, fs: undefined as unknown as typeof mockAPI.fs });
    const adapterNoFs = new ElectronAdapter();
    expect(adapterNoFs.fs.isSupported()).toBe(false);
  });

  // ── openExternal ──────────────────────────────────────────────────────────────

  it('13c-elec-19: openExternal delegates to electronAPI.shell.openExternal', () => {
    adapter.openExternal('https://docs.example.com');
    expect(mockAPI.shell.openExternal).toHaveBeenCalledWith('https://docs.example.com');
  });

  // ── getAppInfo ────────────────────────────────────────────────────────────────

  it('13c-elec-20: getAppInfo maps electronAPI.app.getInfo to PlatformAppInfo', async () => {
    const info = await adapter.getAppInfo();
    expect(info).toEqual({
      version: '1.2.3',
      platform: 'linux',
      arch: 'x64',
      isDev: true,
      name: 'Conitens',
      runtimeVersions: {
        electron: '33.0.0',
        node: '22.0.0',
        chromium: '128.0.0',
      },
    });
  });

  // ── error when electronAPI missing ────────────────────────────────────────────

  it('13c-elec-21: window methods throw descriptively when electronAPI is not defined', () => {
    removeAPI();
    const badAdapter = new ElectronAdapter();
    expect(() => badAdapter.window.minimize()).toThrow(/electronAPI/);
  });
});
