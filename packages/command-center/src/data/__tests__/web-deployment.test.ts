/**
 * web-deployment.test.ts — Build pipeline validation for Sub-AC 13a (web deployment).
 *
 * Verifies:
 *  1. The package.json scripts include the required web build commands
 *  2. The vite.config.ts targets the correct browser versions (Chrome, Firefox, Safari)
 *  3. The tsconfig.json correctly excludes test files from the production build
 *  4. The tsconfig.test.json exists and extends the production tsconfig
 *  5. Environment variable declarations cover all required VITE_* keys
 *
 * These are static configuration tests — they read project files and assert that
 * the deployment pipeline is configured correctly.  No browser runtime is required.
 *
 * Test ID scheme:
 *   13a-N : Sub-AC 13a web deployment pipeline
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Root of the command-center package (3 levels up from src/data/__tests__)
// src/data/__tests__ → src/data → src → command-center (PKG_ROOT)
const PKG_ROOT = resolve(__dirname, "../../..");
const SRC_ROOT = resolve(PKG_ROOT, "src");

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(relPath: string): Record<string, unknown> {
  const abs = resolve(PKG_ROOT, relPath);
  return JSON.parse(readFileSync(abs, "utf-8")) as Record<string, unknown>;
}

function readText(relPath: string): string {
  return readFileSync(resolve(PKG_ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return existsSync(resolve(PKG_ROOT, relPath));
}

// ── 1. package.json scripts ────────────────────────────────────────────────────

describe("package.json — web deployment scripts (13a-1)", () => {
  let scripts: Record<string, string>;

  beforeAll(() => {
    const pkg = readJson("package.json");
    scripts = pkg["scripts"] as Record<string, string>;
  });

  it("has a 'dev' script that starts the Vite dev server", () => {
    expect(scripts["dev"]).toContain("vite");
  });

  it("has a 'build' script that type-checks then runs vite build", () => {
    const build = scripts["build"];
    expect(build).toBeDefined();
    expect(build).toContain("tsc");
    expect(build).toContain("vite build");
  });

  it("has a 'preview' script to serve the production build locally", () => {
    expect(scripts["preview"]).toContain("vite preview");
  });

  it("has a 'build:preview' script that chains build then preview", () => {
    const bp = scripts["build:preview"];
    expect(bp).toBeDefined();
    // Should reference both build and preview phases
    expect(bp).toMatch(/build/);
    expect(bp).toMatch(/preview/);
  });

  it("has a 'typecheck' script for CI type-only validation", () => {
    const tc = scripts["typecheck"];
    expect(tc).toBeDefined();
    expect(tc).toContain("tsc");
    expect(tc).toContain("noEmit");
  });

  it("has a 'typecheck:test' script for validating test-file types separately", () => {
    const tc = scripts["typecheck:test"];
    expect(tc).toBeDefined();
    expect(tc).toContain("tsconfig.test.json");
  });
});

// ── 2. Vite config — browser targets ─────────────────────────────────────────

describe("vite.config.ts — browser target configuration (13a-2)", () => {
  let viteConfig: string;

  beforeAll(() => {
    viteConfig = readText("vite.config.ts");
  });

  it("defines WEB_BROWSER_TARGETS constant with Chrome target", () => {
    expect(viteConfig).toMatch(/chrome\d+/i);
  });

  it("defines WEB_BROWSER_TARGETS constant with Firefox target", () => {
    expect(viteConfig).toMatch(/firefox\d+/i);
  });

  it("defines WEB_BROWSER_TARGETS constant with Safari target", () => {
    expect(viteConfig).toMatch(/safari\d+/i);
  });

  it("includes Edge target for Chromium-based compatibility", () => {
    expect(viteConfig).toMatch(/edge\d+/i);
  });

  it("applies WEB_BROWSER_TARGETS to build.target in web mode", () => {
    // The config should use the targets array for web (non-electron) builds
    expect(viteConfig).toMatch(/WEB_BROWSER_TARGETS/);
    expect(viteConfig).toMatch(/target.*WEB_BROWSER_TARGETS|WEB_BROWSER_TARGETS.*target/);
  });

  it("uses content-hashed chunk filenames for long-lived browser caching", () => {
    expect(viteConfig).toContain("chunkFileNames");
    expect(viteConfig).toContain("[hash]");
  });

  it("applies manual chunk splitting to separate vendor bundles", () => {
    expect(viteConfig).toContain("manualChunks");
    expect(viteConfig).toContain("vendor-three");
    expect(viteConfig).toContain("vendor-react");
    expect(viteConfig).toContain("vendor-r3f");
  });

  it("configures dev server on port 3100", () => {
    expect(viteConfig).toContain("3100");
  });

  it("raises chunkSizeWarningLimit above default for Three.js", () => {
    // Default is 500 KB; Three.js is ~690 KB minified.
    // Value may use JS numeric separators (e.g. 2_000) so we match digits+separators.
    expect(viteConfig).toContain("chunkSizeWarningLimit");
    // Must have a value that is at least 4 digits / 4 chars (≥1000) after the key
    expect(viteConfig).toMatch(/chunkSizeWarningLimit[^,\n]*[1-9][0-9_]{3}/);
  });

  it("documents WebGL2 Safari compatibility requirement (safari15+)", () => {
    // Safari 15+ is the minimum that supports WebGL2 fully
    expect(viteConfig).toMatch(/safari1[5-9]/i);
  });
});

// ── 3. tsconfig.json — test file exclusion ────────────────────────────────────

describe("tsconfig.json — production build excludes test files (13a-3)", () => {
  let tsconfig: Record<string, unknown>;

  beforeAll(() => {
    tsconfig = readJson("tsconfig.json");
  });

  it("includes src/ directory for production code", () => {
    const include = tsconfig["include"] as string[] | undefined;
    expect(include).toBeDefined();
    expect(include).toContain("src");
  });

  it("excludes __tests__ directories from production type-check", () => {
    const exclude = tsconfig["exclude"] as string[] | undefined;
    expect(exclude).toBeDefined();
    const hasTestExclusion = exclude!.some(
      (p) => p.includes("__tests__") || p.includes(".test.ts") || p.includes(".spec.ts")
    );
    expect(hasTestExclusion).toBe(true);
  });

  it("targets ES2022 for modern browser support", () => {
    const opts = tsconfig["compilerOptions"] as Record<string, unknown>;
    expect(opts["target"]).toBe("ES2022");
  });

  it("uses bundler module resolution (Vite-compatible)", () => {
    const opts = tsconfig["compilerOptions"] as Record<string, unknown>;
    expect(opts["moduleResolution"]).toBe("bundler");
  });

  it("includes DOM lib for browser API access", () => {
    const opts = tsconfig["compilerOptions"] as Record<string, unknown>;
    const lib = opts["lib"] as string[];
    expect(lib).toContain("DOM");
  });

  it("enables strict mode for type safety", () => {
    const opts = tsconfig["compilerOptions"] as Record<string, unknown>;
    expect(opts["strict"]).toBe(true);
  });
});

// ── 4. tsconfig.test.json — test-file type configuration ─────────────────────

describe("tsconfig.test.json — test file type configuration (13a-4)", () => {
  let tsconfigTest: Record<string, unknown>;

  beforeAll(() => {
    tsconfigTest = readJson("tsconfig.test.json");
  });

  it("exists as a separate tsconfig for test files", () => {
    expect(fileExists("tsconfig.test.json")).toBe(true);
  });

  it("extends the production tsconfig.json", () => {
    expect(tsconfigTest["extends"]).toBe("./tsconfig.json");
  });

  it("includes all src/ files (no test exclusions)", () => {
    const include = tsconfigTest["include"] as string[] | undefined;
    expect(include).toBeDefined();
    expect(include).toContain("src");
  });

  it("has an empty exclude array to include test files", () => {
    const exclude = tsconfigTest["exclude"] as unknown[];
    // Either not defined (inheriting nothing) or explicitly empty
    expect(exclude === undefined || exclude.length === 0).toBe(true);
  });
});

// ── 5. Environment variable declarations ──────────────────────────────────────

describe("env.d.ts — VITE_* environment variable declarations (13a-5)", () => {
  let envDts: string;

  beforeAll(() => {
    envDts = readText("src/env.d.ts");
  });

  it("declares VITE_WS_URL for orchestrator WebSocket endpoint", () => {
    expect(envDts).toContain("VITE_WS_URL");
  });

  it("declares VITE_APP_TITLE for browser tab title", () => {
    expect(envDts).toContain("VITE_APP_TITLE");
  });

  it("declares VITE_BASE_URL for subpath deployment support", () => {
    expect(envDts).toContain("VITE_BASE_URL");
  });

  it("declares VITE_ORCHESTRATOR_URL for control-plane REST API", () => {
    expect(envDts).toContain("VITE_ORCHESTRATOR_URL");
  });

  it("includes vite/client reference for Vite built-in types", () => {
    expect(envDts).toContain("vite/client");
  });
});

// ── 6. .env files — production configuration ─────────────────────────────────

describe(".env files — deployment configuration (13a-6)", () => {
  it(".env base file exists with shared defaults", () => {
    expect(fileExists(".env")).toBe(true);
  });

  it(".env.development exists for dev-mode overrides", () => {
    expect(fileExists(".env.development")).toBe(true);
  });

  it(".env.production exists for production build overrides", () => {
    expect(fileExists(".env.production")).toBe(true);
  });

  it(".env.electron exists for Electron renderer build", () => {
    expect(fileExists(".env.electron")).toBe(true);
  });

  it(".env base sets VITE_WS_URL to localhost (local-only deployment)", () => {
    const env = readText(".env");
    expect(env).toContain("VITE_WS_URL=ws://localhost");
  });

  it(".env base sets VITE_BASE_URL to root path /", () => {
    const env = readText(".env");
    expect(env).toContain("VITE_BASE_URL=/");
  });

  it(".env.production does NOT use a remote domain (local-only constraint)", () => {
    const env = readText(".env.production");
    // Must stay on localhost — project constraint: local-only deployment
    expect(env).not.toMatch(/wss?:\/\/(?!localhost)/);
  });
});

// ── 7. index.html — entry point quality ──────────────────────────────────────

describe("index.html — browser entry point (13a-7)", () => {
  let html: string;

  beforeAll(() => {
    html = readText("index.html");
  });

  it("includes viewport meta tag for mobile/display scaling", () => {
    expect(html).toContain('name="viewport"');
  });

  it("uses UTF-8 charset declaration", () => {
    expect(html).toContain('charset="UTF-8"');
  });

  it("uses dynamic VITE_APP_TITLE placeholder for Vite env substitution", () => {
    expect(html).toContain("%VITE_APP_TITLE%");
  });

  it("loads main entry as ES module (type='module')", () => {
    expect(html).toContain('type="module"');
    expect(html).toContain("src/main.tsx");
  });

  it("sets background to dark command-center colour (#0a0a14) to prevent flash of white", () => {
    expect(html).toContain("#0a0a14");
  });

  it("has a #root mount point for React", () => {
    expect(html).toContain('id="root"');
  });

  it("includes app description meta tag for SEO / accessibility", () => {
    expect(html).toContain('name="description"');
  });
});
