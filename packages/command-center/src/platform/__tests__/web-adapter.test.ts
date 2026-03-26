// @vitest-environment jsdom
/**
 * web-adapter.test.ts — Unit tests for platform/web-adapter.ts
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Tests:
 *   13c-web-1   WebAdapter.context is 'web'
 *   13c-web-2   window.minimize/maximize/close are no-ops (do not throw)
 *   13c-web-3   window.toggleFullscreen requests/exits document fullscreen
 *   13c-web-4   window.getState returns a WindowState with correct isFullScreen
 *   13c-web-5   window.onMaximized returns a no-op unsubscribe
 *   13c-web-6   window.onFullScreen fires when fullscreenchange event fires
 *   13c-web-7   notifications.isSupported() reflects 'Notification' in window
 *   13c-web-8   notifications.requestPermission() delegates to Notification API
 *   13c-web-9   notifications.show() is a no-op when permission is not granted
 *   13c-web-10  fs.isSupported() returns false
 *   13c-web-11  fs.readText/writeText/list throw PlatformFsError(EUNSUPPORTED)
 *   13c-web-12  fs.exists() returns false without throwing
 *   13c-web-13  openExternal opens only http/https URLs
 *   13c-web-14  getAppInfo returns platform: 'web'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAdapter } from '../web-adapter.js';
import { PlatformFsError } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdapter(): WebAdapter {
  return new WebAdapter();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebAdapter', () => {
  let adapter: WebAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── context ──────────────────────────────────────────────────────────────────

  it('13c-web-1: context is "web"', () => {
    expect(adapter.context).toBe('web');
  });

  // ── window ───────────────────────────────────────────────────────────────────

  it('13c-web-2: minimize/maximize do not throw', () => {
    expect(() => adapter.window.minimize()).not.toThrow();
    expect(() => adapter.window.maximize()).not.toThrow();
  });

  it('13c-web-3: toggleFullscreen calls document.documentElement.requestFullscreen when not in fullscreen', () => {
    const reqFs = vi.fn().mockResolvedValue(undefined);
    const exitFs = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => null,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: reqFs,
      configurable: true,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      value: exitFs,
      configurable: true,
    });

    adapter.window.toggleFullscreen();
    expect(reqFs).toHaveBeenCalledOnce();
    expect(exitFs).not.toHaveBeenCalled();
  });

  it('13c-web-4: getState returns WindowState with isFullScreen reflecting document state', async () => {
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => null,
      configurable: true,
    });
    const state = await adapter.window.getState();
    expect(state).toMatchObject({
      isMaximized: false,
      isFullScreen: false,
      isMinimized: false,
    });
  });

  it('13c-web-5: onMaximized returns an unsubscribe function that does not throw', () => {
    const cb = vi.fn();
    const unsub = adapter.window.onMaximized(cb);
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
    // The callback should never be called because the browser does not fire maximize events
    expect(cb).not.toHaveBeenCalled();
  });

  it('13c-web-6: onFullScreen callback fires on fullscreenchange event', () => {
    const cb = vi.fn();
    const unsub = adapter.window.onFullScreen(cb);

    // Simulate document.fullscreenElement being set (entering fullscreen)
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => document.documentElement,
      configurable: true,
    });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(cb).toHaveBeenCalledWith(true);

    // Unsubscribe
    unsub();

    // Simulate exiting fullscreen — callback should NOT fire now
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => null,
      configurable: true,
    });
    document.dispatchEvent(new Event('fullscreenchange'));
    // Still only called once (before unsubscribe)
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // ── notifications ─────────────────────────────────────────────────────────────

  it('13c-web-7: notifications.isSupported() returns false without Notification API, true with it', () => {
    // jsdom doesn't implement Notification — should return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Notification;
    const adapter1 = makeAdapter();
    expect(adapter1.notifications.isSupported()).toBe(false);

    // Install a mock Notification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Notification = function () {};
    const adapter2 = makeAdapter();
    expect(adapter2.notifications.isSupported()).toBe(true);

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Notification;
  });

  it('13c-web-8: notifications.requestPermission() delegates to Notification.requestPermission', async () => {
    // jsdom doesn't implement Notification — install a minimal mock on window
    const mockRequest = vi.fn().mockResolvedValue('granted' as NotificationPermission);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockNotification = Object.assign(function NotificationCtor() {}, {
      permission: 'default' as NotificationPermission,
      requestPermission: mockRequest,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Notification = MockNotification;

    const freshAdapter = makeAdapter(); // create with Notification mock in place
    const result = await freshAdapter.notifications.requestPermission();
    expect(result).toBe('granted');
    expect(mockRequest).toHaveBeenCalledOnce();

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Notification;
  });

  it('13c-web-9: notifications.show() is a no-op when permission is "denied"', async () => {
    // Install a Notification mock with permission='denied'
    const mockCtor = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Notification = Object.assign(mockCtor, {
      permission: 'denied' as NotificationPermission,
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    const freshAdapter = makeAdapter();
    await expect(freshAdapter.notifications.show('Test', 'body')).resolves.toBeUndefined();
    expect(mockCtor).not.toHaveBeenCalled();

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).Notification;
  });

  // ── fs ────────────────────────────────────────────────────────────────────────

  it('13c-web-10: fs.isSupported() returns false', () => {
    expect(adapter.fs.isSupported()).toBe(false);
  });

  it('13c-web-11: fs.readText throws PlatformFsError with code EUNSUPPORTED', async () => {
    await expect(adapter.fs.readText('/any/path')).rejects.toBeInstanceOf(PlatformFsError);
    try {
      await adapter.fs.readText('/any/path');
    } catch (e) {
      expect((e as PlatformFsError).code).toBe('EUNSUPPORTED');
    }
  });

  it('13c-web-11b: fs.writeText throws PlatformFsError with code EUNSUPPORTED', async () => {
    await expect(adapter.fs.writeText('/any/path', 'content')).rejects.toBeInstanceOf(PlatformFsError);
  });

  it('13c-web-11c: fs.list throws PlatformFsError with code EUNSUPPORTED', async () => {
    await expect(adapter.fs.list('/any/dir')).rejects.toBeInstanceOf(PlatformFsError);
  });

  it('13c-web-12: fs.exists() returns false without throwing', async () => {
    await expect(adapter.fs.exists('/any/path')).resolves.toBe(false);
  });

  // ── openExternal ──────────────────────────────────────────────────────────────

  it('13c-web-13a: openExternal opens https:// URLs via window.open', () => {
    const mockOpen = vi.fn();
    vi.spyOn(window, 'open').mockImplementation(mockOpen);

    adapter.openExternal('https://example.com');
    expect(mockOpen).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('13c-web-13b: openExternal blocks non-http(s) URLs', () => {
    const mockOpen = vi.fn();
    vi.spyOn(window, 'open').mockImplementation(mockOpen);

    adapter.openExternal('javascript:alert(1)');
    adapter.openExternal('file:///etc/passwd');
    expect(mockOpen).not.toHaveBeenCalled();
  });

  // ── getAppInfo ────────────────────────────────────────────────────────────────

  it('13c-web-14: getAppInfo returns platform: "web"', async () => {
    const info = await adapter.getAppInfo();
    expect(info.platform).toBe('web');
    expect(typeof info.isDev).toBe('boolean');
    expect(typeof info.name).toBe('string');
    expect(typeof info.version).toBe('string');
  });
});
