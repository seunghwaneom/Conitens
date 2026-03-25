// @vitest-environment jsdom
/**
 * platform-factory.test.ts — Unit tests for platform/index.ts factory + singleton
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Tests:
 *   13c-factory-1  getPlatformAdapter returns WebAdapter when no electronAPI
 *   13c-factory-2  getPlatformAdapter returns ElectronAdapter when electronAPI present
 *   13c-factory-3  getPlatformAdapter returns the same instance on repeated calls (singleton)
 *   13c-factory-4  _overridePlatformAdapter injects a mock; getPlatformAdapter returns it
 *   13c-factory-5  _resetPlatformAdapter clears the override; auto-detection resumes
 *   13c-factory-6  PlatformFsError is exported from the index
 *   13c-factory-7  Re-exported helpers (detectPlatformContext, isElectron, isWeb) work
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPlatformAdapter,
  _overridePlatformAdapter,
  _resetPlatformAdapter,
  detectPlatformContext,
  isElectron,
  isWeb,
  PlatformFsError,
} from '../index.js';
import type { IPlatformAdapter } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stubElectronAPI(value: unknown): void {
  Object.defineProperty(globalThis.window, 'electronAPI', {
    value,
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

function makeMockAdapter(ctx: 'web' | 'electron' = 'web'): IPlatformAdapter {
  return {
    context: ctx,
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      toggleFullscreen: vi.fn(),
      getState: vi.fn().mockResolvedValue({ isMaximized: false, isFullScreen: false, isMinimized: false }),
      onMaximized: vi.fn().mockReturnValue(() => undefined),
      onFullScreen: vi.fn().mockReturnValue(() => undefined),
    },
    notifications: {
      isSupported: vi.fn().mockReturnValue(false),
      requestPermission: vi.fn().mockResolvedValue('granted' as NotificationPermission),
      show: vi.fn().mockResolvedValue(undefined),
    },
    fs: {
      isSupported: vi.fn().mockReturnValue(false),
      readText: vi.fn().mockRejectedValue(new PlatformFsError('mock', 'EUNSUPPORTED')),
      writeText: vi.fn().mockRejectedValue(new PlatformFsError('mock', 'EUNSUPPORTED')),
      exists: vi.fn().mockResolvedValue(false),
      list: vi.fn().mockRejectedValue(new PlatformFsError('mock', 'EUNSUPPORTED')),
    },
    openExternal: vi.fn(),
    getAppInfo: vi.fn().mockResolvedValue({
      version: '0.0.0',
      platform: ctx === 'electron' ? 'linux' : 'web',
      isDev: true,
      name: 'Test',
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getPlatformAdapter factory', () => {
  beforeEach(() => {
    _resetPlatformAdapter();
    removeElectronAPI();
  });

  afterEach(() => {
    _resetPlatformAdapter();
    removeElectronAPI();
    vi.restoreAllMocks();
  });

  it('13c-factory-1: returns WebAdapter (context === "web") when no electronAPI', () => {
    const adapter = getPlatformAdapter();
    expect(adapter.context).toBe('web');
  });

  it('13c-factory-2: returns ElectronAdapter (context === "electron") when electronAPI present', () => {
    stubElectronAPI({
      window: {
        minimize: vi.fn(),
        maximize: vi.fn(),
        close: vi.fn(),
        toggleFullscreen: vi.fn(),
        getState: vi.fn().mockResolvedValue({ isMaximized: false, isFullScreen: false, isMinimized: false }),
        onMaximized: vi.fn().mockReturnValue(() => undefined),
        onFullScreen: vi.fn().mockReturnValue(() => undefined),
      },
      app: { getInfo: vi.fn().mockResolvedValue({}) },
      shell: { openExternal: vi.fn() },
      devtools: { toggle: vi.fn() },
      notifications: { show: vi.fn() },
      fs: {
        readText: vi.fn(),
        writeText: vi.fn(),
        exists: vi.fn(),
        list: vi.fn(),
      },
      platform: 'linux',
      isDev: true,
    });

    const adapter = getPlatformAdapter();
    expect(adapter.context).toBe('electron');
  });

  it('13c-factory-3: getPlatformAdapter returns the same instance on repeated calls', () => {
    const a = getPlatformAdapter();
    const b = getPlatformAdapter();
    expect(a).toBe(b);
  });

  it('13c-factory-4: _overridePlatformAdapter injects a mock adapter', () => {
    const mock = makeMockAdapter('electron');
    _overridePlatformAdapter(mock);

    const adapter = getPlatformAdapter();
    expect(adapter).toBe(mock);
    expect(adapter.context).toBe('electron');
  });

  it('13c-factory-5: _resetPlatformAdapter restores auto-detection', () => {
    const mock = makeMockAdapter('electron');
    _overridePlatformAdapter(mock);
    expect(getPlatformAdapter()).toBe(mock);

    _resetPlatformAdapter();
    removeElectronAPI();
    const fresh = getPlatformAdapter();
    expect(fresh).not.toBe(mock);
    expect(fresh.context).toBe('web');
  });

  it('13c-factory-6: PlatformFsError is exported and is a proper Error subclass', () => {
    const err = new PlatformFsError('test message', 'ENOENT');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PlatformFsError);
    expect(err.message).toBe('test message');
    expect(err.code).toBe('ENOENT');
    expect(err.name).toBe('PlatformFsError');
  });

  it('13c-factory-7: re-exported helpers work correctly', () => {
    removeElectronAPI();
    expect(detectPlatformContext()).toBe('web');
    expect(isElectron()).toBe(false);
    expect(isWeb()).toBe(true);

    stubElectronAPI({ window: {}, app: {}, shell: {}, devtools: {}, notifications: {}, fs: {}, platform: 'win32', isDev: false });
    expect(detectPlatformContext()).toBe('electron');
    expect(isElectron()).toBe(true);
    expect(isWeb()).toBe(false);
  });
});
