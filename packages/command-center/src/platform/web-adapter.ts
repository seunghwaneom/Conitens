/**
 * platform/web-adapter.ts — Browser-context implementations of IPlatformAdapter.
 *
 * Sub-AC 13c: Platform abstraction layer.
 *
 * Used when `detectPlatformContext()` returns 'web'. Provides graceful
 * degradation for operations that are unavailable in the browser:
 *
 *   Window management  ─ minimize/maximize/close are no-ops; fullscreen uses
 *                         the Document Fullscreen API; state is inferred from
 *                         document properties.
 *
 *   Notifications      ─ Delegates to the browser's Notification API (requires
 *                         user permission).
 *
 *   File system        ─ Not supported. `isSupported()` returns false;
 *                         all operations throw PlatformFsError with code
 *                         'EUNSUPPORTED'. Callers should test `isSupported()`
 *                         before calling FS methods, or catch PlatformFsError.
 *
 *   openExternal       ─ Uses `window.open(url, '_blank', 'noopener')`.
 *   getAppInfo         ─ Returns static web metadata from import.meta.env.
 */

import type {
  IPlatformAdapter,
  PlatformWindowAdapter,
  PlatformNotificationAdapter,
  PlatformFsAdapter,
  PlatformTrayAdapter,
  PlatformRouterAdapter,
  PlatformAppInfo,
  PlatformNotifyOptions,
  UnsubscribeFn,
  WindowState,
} from './types.js';
import { PlatformFsError } from './types.js';

// ── Window adapter ────────────────────────────────────────────────────────────

/**
 * Web window adapter.
 *
 * Fullscreen is implemented via the Document Fullscreen API.
 * Maximize / minimize / close are browser concepts outside JS reach — they
 * silently no-op so shared app code can call them unconditionally.
 *
 * State-change subscriptions use `document` fullscreenchange events.  The
 * `onMaximized` subscription is a no-op (the browser never fires resize events
 * that indicate maximize intent reliably cross-browser).
 */
class WebWindowAdapter implements PlatformWindowAdapter {
  private _fullscreenCallbacks = new Set<(fs: boolean) => void>();

  constructor() {
    // Forward document fullscreenchange events to subscribers.
    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', this._onFullscreenChange);
    }
  }

  private _onFullscreenChange = (): void => {
    const isFs = document.fullscreenElement !== null;
    this._fullscreenCallbacks.forEach((cb) => cb(isFs));
  };

  minimize(): void {
    // No-op in web context — the browser controls window chrome.
  }

  maximize(): void {
    // No-op in web context.
  }

  close(): void {
    // Programmatic close is gated by browser security (only tabs that were
    // opened by script can be closed by script). Attempt it but expect it to
    // fail silently in most scenarios.
    try {
      window.close();
    } catch {
      // Swallow — non-critical.
    }
  }

  toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }

  async getState(): Promise<WindowState> {
    return {
      isMaximized: false, // Unknowable in plain browser
      isFullScreen:
        typeof document !== 'undefined' &&
        document.fullscreenElement !== null,
      isMinimized: false, // Unknowable in plain browser
    };
  }

  onMaximized(_cb: (maximized: boolean) => void): UnsubscribeFn {
    // Web browsers do not expose maximize/restore events via JS.
    // Return a no-op unsubscribe so callers need not special-case.
    return () => undefined;
  }

  onFullScreen(cb: (fullScreen: boolean) => void): UnsubscribeFn {
    this._fullscreenCallbacks.add(cb);
    return () => {
      this._fullscreenCallbacks.delete(cb);
    };
  }
}

// ── Notification adapter ──────────────────────────────────────────────────────

/**
 * Web notification adapter.
 *
 * Delegates to the browser's built-in `Notification` constructor.
 * The `Notification` API requires an explicit permission grant; callers should
 * call `requestPermission()` before the first `show()`.
 */
class WebNotificationAdapter implements PlatformNotificationAdapter {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return Notification.requestPermission();
  }

  async show(
    title: string,
    body: string,
    opts?: PlatformNotifyOptions,
  ): Promise<void> {
    if (!this.isSupported()) return;
    if (Notification.permission !== 'granted') return;

    try {
      new Notification(title, {
        body,
        tag: opts?.tag,
        silent: opts?.silent,
        icon: opts?.icon,
      });
    } catch (err) {
      // Non-fatal — notifications are enhancement-level, not required.
      console.warn('[WebNotificationAdapter] Failed to show notification:', err);
    }
  }
}

// ── File-system adapter ───────────────────────────────────────────────────────

/**
 * Web file-system adapter — not supported.
 *
 * The browser renderer has no access to the host filesystem. All methods
 * throw `PlatformFsError` with code `'EUNSUPPORTED'` to signal clearly that
 * callers must either guard with `isSupported()` or handle the error.
 *
 * Note: The Origin Private File System (OPFS) exists in modern browsers but
 * is deliberately excluded here because the command-center requires access to
 * real project-tree paths (`.conitens/`), which OPFS cannot provide.
 * Command writing uses the HTTP API (see `use-command-file-writer.ts`).
 */
class WebFsAdapter implements PlatformFsAdapter {
  isSupported(): boolean {
    return false;
  }

  private _unsupported(op: string): never {
    throw new PlatformFsError(
      `File system operation '${op}' is not supported in web context. ` +
        'Use the command HTTP API or switch to the desktop (Electron) build.',
      'EUNSUPPORTED',
    );
  }

  async readText(_path: string): Promise<string> {
    return this._unsupported('readText');
  }

  async writeText(_path: string, _content: string): Promise<void> {
    return this._unsupported('writeText');
  }

  async exists(_path: string): Promise<boolean> {
    return false; // Graceful — never throws
  }

  async list(_directory: string): Promise<string[]> {
    return this._unsupported('list');
  }
}

// ── Tray adapter (web — not supported) ───────────────────────────────────────

/**
 * Web tray adapter — not supported.
 *
 * Browsers have no system-tray concept. All methods are silent no-ops so
 * shared code can call them unconditionally without runtime errors.
 * `isSupported()` returns false — callers should guard with it to avoid
 * presenting tray-related UI options in the browser deployment.
 *
 * Desktop-only feature: enabled only in the Electron adapter.
 */
class WebTrayAdapter implements PlatformTrayAdapter {
  isSupported(): boolean {
    return false;
  }

  show(): void {
    // No-op: the browser has no tray concept.
  }

  hide(): void {
    // No-op: the browser has no tray concept.
  }

  setTooltip(_text: string): void {
    // No-op: the browser has no tray tooltip.
  }

  onActivate(_cb: () => void): UnsubscribeFn {
    // No-op: no tray events in the browser.
    return () => undefined;
  }
}

// ── Router adapter (web — History API) ────────────────────────────────────────

/**
 * Web URL routing adapter.
 *
 * Implements URL-based navigation using the browser History API so:
 *   - Deep-links are preserved across page refreshes.
 *   - The browser Back button works as expected.
 *   - URLs are shareable between users.
 *
 * `navigate(path)` calls `history.pushState` and notifies subscribers.
 * Subscribers also fire on browser-initiated navigation (Back/Forward).
 *
 * Web-only feature: the Electron adapter returns `isSupported() === false`.
 */
class WebRouterAdapter implements PlatformRouterAdapter {
  private readonly _callbacks = new Set<(path: string) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this._onPopState);
    }
  }

  private _onPopState = (): void => {
    const path = this.getCurrentPath();
    this._callbacks.forEach((cb) => cb(path));
  };

  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof history !== 'undefined' &&
      typeof history.pushState === 'function'
    );
  }

  navigate(path: string): void {
    if (!this.isSupported()) return;
    // Normalise: ensure path starts with '/'.
    const normPath = path.startsWith('/') ? path : `/${path}`;
    history.pushState(null, '', normPath);
    // pushState does not fire 'popstate' — notify subscribers manually.
    this._callbacks.forEach((cb) => cb(normPath));
  }

  getCurrentPath(): string {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname;
  }

  onNavigate(cb: (path: string) => void): UnsubscribeFn {
    this._callbacks.add(cb);
    return () => {
      this._callbacks.delete(cb);
    };
  }
}

// ── Unified web adapter ───────────────────────────────────────────────────────

/**
 * WebAdapter — the complete IPlatformAdapter for browser-only deployments.
 *
 * Instantiated once by `getPlatformAdapter()` when running outside Electron.
 */
export class WebAdapter implements IPlatformAdapter {
  readonly context = 'web' as const;
  readonly window: PlatformWindowAdapter = new WebWindowAdapter();
  readonly notifications: PlatformNotificationAdapter =
    new WebNotificationAdapter();
  readonly fs: PlatformFsAdapter = new WebFsAdapter();
  /** System-tray: not supported in web context — always no-ops. */
  readonly tray: PlatformTrayAdapter = new WebTrayAdapter();
  /** URL routing: supported via browser History API. */
  readonly router: PlatformRouterAdapter = new WebRouterAdapter();

  openExternal(url: string): void {
    // Allow only http/https to prevent javascript: injection.
    if (url.startsWith('https://') || url.startsWith('http://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async getAppInfo(): Promise<PlatformAppInfo> {
    const env = (
      typeof import.meta !== 'undefined'
        ? (import.meta.env as Record<string, unknown>)
        : {}
    ) as Record<string, string | undefined>;

    return {
      version: env['VITE_APP_VERSION'] ?? '0.0.0',
      platform: 'web',
      isDev: env['DEV'] === 'true' || env['MODE'] === 'development',
      name: env['VITE_APP_NAME'] ?? 'Conitens Command Center',
    };
  }
}
