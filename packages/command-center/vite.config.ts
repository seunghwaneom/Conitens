/**
 * vite.config.ts — Vite build configuration for @conitens/command-center
 *
 * Sub-AC 13a: Web deployment pipeline (browser targets: Chrome, Firefox, Safari)
 * Sub-AC 13b: Desktop (Electron) deployment pipeline
 *
 * Build modes:
 *   vite build              → production web build  (base: "/")
 *   vite build --mode electron → Electron renderer build (base: "./")
 *
 * The `--mode electron` variant loads .env.electron which sets
 * VITE_BASE_URL=./ so that all asset paths use relative URLs compatible
 * with Electron's file:// protocol.  The compiled Electron main process
 * (dist-electron/main.cjs) loads dist/index.html directly from the filesystem.
 *
 * Production web build features:
 *  - Explicit browser targets: Chrome 100+, Firefox 100+, Safari 15.4+ — all
 *    fully support ES2022, WebGL2 (Three.js r175 requirement), and modern CSS.
 *    Rationale: Three.js r175 requires WebGL2; Safari gained WebGL2 in v15.
 *  - Manual chunk splitting: three.js (~1.5 MB), R3F/Drei, React, Zustand are
 *    each emitted as named vendor chunks so the browser can cache them
 *    independently from application code.
 *  - chunkSizeWarningLimit raised to 2 MB — Three.js renders above the Vite
 *    default 500 KB and would otherwise emit spurious warnings.
 *  - Content-hashed asset filenames for long-lived browser caching.
 *  - Source maps disabled in production (reduces bundle size); inline source
 *    maps used in dev for fast feedback.
 *  - Base URL configurable via VITE_BASE_URL env var for subpath deployments
 *    (e.g. "/command-center/"); defaults to "/" (root).
 *
 * Browser compatibility
 * ─────────────────────
 *  Minimum supported versions (all support WebGL2 + ES2022):
 *    Chrome  / Chromium  100+  (released Apr 2022)
 *    Firefox             100+  (released May 2022)
 *    Safari              15.4+ (released Mar 2022)
 *    Edge                100+  (Chromium-based)
 *
 *  WebGL2 note: Three.js ≥ r150 defaults to WebGL2 with WebGL1 fallback.
 *  Safari 15+ has complete WebGL2 support. The app renders in Safari 15.4+.
 *
 * Environment variables (see .env, .env.development, .env.production, .env.electron):
 *  - VITE_WS_URL           — orchestrator WebSocket endpoint
 *  - VITE_API_BASE_URL     — control-plane REST API base URL
 *  - VITE_BASE_URL         — base path for HTML/asset links
 *  - VITE_APP_TITLE        — browser tab title
 *  - VITE_ORCHESTRATOR_URL — orchestrator control-plane URL (alias)
 */

import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { roomsPlugin } from "./src/data/vite-rooms-plugin.js";

/**
 * Minimum browser versions that support both ES2022 and WebGL2.
 * These are the production build targets for `vite build` (web mode).
 * Electron builds use a fixed Chromium version bundled with Electron 33+.
 *
 * Passed to Rollup/esbuild via `build.target`; esbuild will emit the minimal
 * downlevelling needed to run correctly in these browsers.
 */
const WEB_BROWSER_TARGETS = [
  "chrome100",   // Chrome 100+ — April 2022; ES2022, WebGL2, OffscreenCanvas
  "firefox100",  // Firefox 100+ — May 2022; ES2022, WebGL2
  "safari15",    // Safari 15.4+ — March 2022; ES2022, WebGL2, CSS layers
  "edge100",     // Edge 100+ — Chromium-based, same as Chrome 100
] as const;

export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_ prefix) for config-time use.
  // Only VITE_* vars are exposed to client code via import.meta.env.
  const env = loadEnv(mode, process.cwd(), "");

  const isProduction = mode === "production";
  const isElectron = mode === "electron";
  const base = env["VITE_BASE_URL"] ?? "/";

  return {
    // ── Plugins ───────────────────────────────────────────────────────────
    plugins: [
      react(),
      roomsPlugin(resolve(__dirname, "../..")),
    ],

    // ── Base URL ──────────────────────────────────────────────────────────
    // Allows deploying to a subpath (e.g. /command-center/) without changing
    // source files.  Set VITE_BASE_URL in .env.production for non-root deploys.
    base,

    // ── Dev server ────────────────────────────────────────────────────────
    server: {
      port: 3100,
      strictPort: false,
      // CORS headers for WebSocket connections to the orchestrator.
      // Proxying keeps the browser from hitting cross-origin restrictions.
      // Uncomment and configure if the orchestrator runs on a separate port:
      // proxy: {
      //   "/ws": { target: env["VITE_WS_URL"] ?? "ws://localhost:8080", ws: true },
      //   "/api": { target: env["VITE_API_BASE_URL"] ?? "http://localhost:8080" },
      // },
    },

    // ── Preview (production build preview) ────────────────────────────────
    preview: {
      port: 3100,
      strictPort: false,
    },

    // ── Build ─────────────────────────────────────────────────────────────
    build: {
      outDir: "dist",
      emptyOutDir: true,

      /**
       * Build target:
       *  - Web build:     explicit browser array (WEB_BROWSER_TARGETS)
       *  - Electron build: ES2022 — the Chromium version bundled with
       *                    Electron 33+ fully supports ES2022 natively.
       *
       * Using the browser-specific array lets esbuild emit the exact syntax
       * supported by the listed browsers without unnecessary polyfills.
       */
      target: isElectron ? "es2022" : WEB_BROWSER_TARGETS,

      // Three.js exceeds the default 500 KB chunk warning — raise to 2 MB.
      // Individual vendor chunks are expected to be large for a 3D app.
      chunkSizeWarningLimit: 2_000,

      // Source maps: disabled in production (keeps bundle small and clean);
      // inline maps in development for instant DevTools source navigation.
      sourcemap: isProduction ? false : "inline",

      rollupOptions: {
        output: {
          /**
           * Manual chunk splitting strategy.
           *
           * Three.js and the R3F ecosystem are very large and change infrequently.
           * Splitting them into separate named chunks lets the browser cache them
           * across application code releases.
           *
           * Chunk budget (approximate, minified + gzip):
           *   vendor-three   ~  580 KB   (three.js core)
           *   vendor-r3f     ~  320 KB   (@react-three/fiber + @react-three/drei)
           *   vendor-react   ~  140 KB   (react + react-dom)
           *   vendor-zustand ~    8 KB   (zustand)
           *   vendor-yaml    ~   35 KB   (yaml parser)
           *   index          ~  variable  (application code)
           *
           * Browser caching strategy:
           *   Vendor chunks have long-lived hashes (content changes rarely).
           *   Application code chunk (index) changes on every release.
           *   Split loading: browser fetches only the changed chunk on update.
           */
          manualChunks(id: string) {
            // Three.js core — largest single dependency
            if (id.includes("node_modules/three/")) {
              return "vendor-three";
            }
            // React Three Fiber + Drei — R3F rendering pipeline
            if (
              id.includes("node_modules/@react-three/fiber") ||
              id.includes("node_modules/@react-three/drei")
            ) {
              return "vendor-r3f";
            }
            // React core runtime
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/scheduler/")
            ) {
              return "vendor-react";
            }
            // Zustand state management
            if (id.includes("node_modules/zustand/")) {
              return "vendor-zustand";
            }
            // YAML parser (used to load room configs)
            if (id.includes("node_modules/yaml/")) {
              return "vendor-yaml";
            }
          },

          // Content-hashed filenames for long-lived browser caching.
          // The hash changes only when the chunk's content changes.
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },

    // ── Asset inlining ────────────────────────────────────────────────────
    // Assets smaller than 4 KB are inlined as data URIs to reduce round-trips.
    assetsInlineLimit: 4_096,
  };
});
