// @vitest-environment jsdom
/**
 * detect.test.ts — Unit tests for platform/detect.ts
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Tests:
 *   13c-detect-1  detectPlatformContext returns 'electron' when window.electronAPI is present
 *   13c-detect-2  detectPlatformContext returns 'web' when window.electronAPI is absent
 *   13c-detect-3  detectPlatformContext returns 'web' in SSR-like (no window) environment
 *   13c-detect-4  isElectron() is true iff detectPlatformContext() === 'electron'
 *   13c-detect-5  isWeb() is true iff detectPlatformContext() === 'web'
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectPlatformContext, isElectron, isWeb } from '../detect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Store original window descriptor so we can restore after each test. */
const originalWindow = globalThis.window;

function stubElectronAPI(value: unknown): void {
  Object.defineProperty(globalThis.window, 'electronAPI', {
    value,
    configurable: true,
    writable: true,
  });
}

function removeElectronAPI(): void {
  try {
    // Delete any existing descriptor injected by a prior test.
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

describe('detectPlatformContext', () => {
  afterEach(() => {
    removeElectronAPI();
    vi.restoreAllMocks();
  });

  it('13c-detect-1: returns "electron" when window.electronAPI is defined', () => {
    stubElectronAPI({ window: {}, app: {}, shell: {}, devtools: {}, platform: 'linux', isDev: true });
    expect(detectPlatformContext()).toBe('electron');
  });

  it('13c-detect-2: returns "web" when window.electronAPI is undefined', () => {
    removeElectronAPI();
    expect(detectPlatformContext()).toBe('web');
  });

  it('13c-detect-3: returns "web" when globalThis.window is undefined (SSR / Node.js)', () => {
    // Temporarily hide `window`
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      expect(detectPlatformContext()).toBe('web');
    } finally {
      // Restore window
      if (desc) {
        Object.defineProperty(globalThis, 'window', desc);
      }
    }
  });

  it('13c-detect-4: isElectron() matches detectPlatformContext() === "electron"', () => {
    stubElectronAPI({});
    expect(isElectron()).toBe(true);
    expect(isElectron()).toBe(detectPlatformContext() === 'electron');

    removeElectronAPI();
    expect(isElectron()).toBe(false);
  });

  it('13c-detect-5: isWeb() is the inverse of isElectron()', () => {
    stubElectronAPI({});
    expect(isWeb()).toBe(false);

    removeElectronAPI();
    expect(isWeb()).toBe(true);
  });
});
