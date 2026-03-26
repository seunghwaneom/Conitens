/**
 * @module vitest-setup-three
 * Sub-AC 14.1 — Global Vitest setup for Three.js scene testing.
 *
 * This module is referenced by the `scene` test project in vitest.config.ts.
 * It installs lightweight global stubs that allow Three.js object construction
 * to proceed inside the Node.js environment without a real WebGL context.
 *
 * What gets installed
 * ───────────────────
 * • `globalThis.requestAnimationFrame` — immediate `setImmediate`-based stub
 * • `globalThis.cancelAnimationFrame` — no-op stub
 * • `globalThis.WebGL2RenderingContext` — empty class satisfying instanceof checks
 * • `globalThis.performance.now` — falls back to `Date.now` if not present
 * • `globalThis.URL.createObjectURL` — no-op stub (avoids errors in texture loading)
 * • `globalThis.URL.revokeObjectURL` — no-op stub
 *
 * What does NOT get installed
 * ───────────────────────────
 * • A real WebGL canvas — tests that need GPU rendering should compose with
 *   `WebGLRendererMock` from `three-renderer-mock.ts` directly.
 * • A DOM environment — use `environment: 'jsdom'` in the test project for
 *   tests that require document/window.
 *
 * Lifecycle
 * ─────────
 * Vitest calls this module's top-level side-effects once per worker.  The
 * stubs are intentionally non-destructive: they only patch `globalThis` fields
 * that are `undefined` or missing.  Real browser globals in jsdom/happy-dom
 * environments are not overwritten.
 */

// ─── requestAnimationFrame / cancelAnimationFrame ─────────────────────────

type GlobalWithRAF = typeof globalThis & {
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  WebGL2RenderingContext?: unknown;
};

const g = globalThis as GlobalWithRAF;

if (typeof g.requestAnimationFrame === "undefined") {
  let _rafId = 0;
  g.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = ++_rafId;
    setImmediate(() => {
      try {
        cb(typeof performance !== "undefined" ? performance.now() : Date.now());
      } catch {
        // swallow errors from RAF callbacks in tests
      }
    });
    return id;
  };
}

if (typeof g.cancelAnimationFrame === "undefined") {
  g.cancelAnimationFrame = (_id: number): void => {
    // no-op — the setImmediate cannot be cancelled, but test code should not
    // depend on RAF cancellation behaviour anyway
  };
}

// ─── WebGL2RenderingContext type stub ─────────────────────────────────────

if (typeof g.WebGL2RenderingContext === "undefined") {
  /** Minimal stub that satisfies `ctx instanceof WebGL2RenderingContext`. */
  // @ts-expect-error — intentionally incomplete stub for test-only context
  g.WebGL2RenderingContext = class WebGL2RenderingContext {} as unknown;
}

// ─── performance.now fallback ─────────────────────────────────────────────

if (typeof performance === "undefined") {
  (globalThis as Record<string, unknown>).performance = {
    now: () => Date.now(),
  };
}

// ─── URL stubs ────────────────────────────────────────────────────────────

if (typeof URL !== "undefined") {
  if (!URL.createObjectURL) {
    URL.createObjectURL = (_obj: Blob | MediaSource): string => {
      return "blob:mock://placeholder";
    };
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = (_url: string): void => {};
  }
}

// ─── ResizeObserver stub (needed by R3F Canvas) ────────────────────────────

if (typeof (globalThis as Record<string, unknown>).ResizeObserver === "undefined") {
  (globalThis as Record<string, unknown>).ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// ─── IntersectionObserver stub ────────────────────────────────────────────

if (typeof (globalThis as Record<string, unknown>).IntersectionObserver === "undefined") {
  (globalThis as Record<string, unknown>).IntersectionObserver = class IntersectionObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    takeRecords(): IntersectionObserverEntry[] { return []; }
  };
}

// ─── matchMedia stub ──────────────────────────────────────────────────────

if (typeof (globalThis as Record<string, unknown>).matchMedia === "undefined") {
  (globalThis as Record<string, unknown>).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
