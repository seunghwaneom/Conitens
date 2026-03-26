#!/usr/bin/env node
/**
 * verify-web-build.mjs — Sub-AC 13.1 web deployment verification
 *
 * Validates that a Vite web build of @conitens/command-center has produced a
 * complete, deployable static bundle (index.html + assets) targeting browser
 * environments.
 *
 * Checks performed
 * ─────────────────
 *  1. dist/index.html exists and is non-empty
 *  2. index.html contains a <div id="root"> mount point
 *  3. index.html contains a <script type="module"> entry-point reference
 *  4. index.html contains modulepreload hints for the Five named vendor chunks:
 *       vendor-react, vendor-three, vendor-zustand, vendor-r3f, vendor-yaml
 *  5. dist/assets/ directory exists and is non-empty
 *  6. The Six expected chunk types are present:
 *       vendor-three-*.js  (Three.js core; WebGL renderer requirement)
 *       vendor-r3f-*.js    (@react-three/fiber + @react-three/drei)
 *       vendor-react-*.js  (React + react-dom)
 *       vendor-zustand-*.js (Zustand state management)
 *       vendor-yaml-*.js   (YAML parser for room configs)
 *       index-*.js         (application bundle)
 *  7. Three.js chunk size ≥ 100 KB (sanity-check that it's a real build)
 *  8. Application bundle (index-*.js) size ≥ 50 KB
 *  9. dist/robots.txt present (public asset passthrough)
 * 10. index.html asset refs use absolute paths starting with "/" (not "./"
 *     which is the Electron build; web builds must use base="/")
 *
 * Usage
 * ─────
 *   node scripts/verify-web-build.mjs
 *   node scripts/verify-web-build.mjs --dist ./dist
 *
 * Exit codes
 * ──────────
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI argument parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const distArg = args.indexOf("--dist");
const DIST_DIR = distArg !== -1 && args[distArg + 1]
  ? resolve(args[distArg + 1])
  : resolve(__dirname, "..", "dist");

// ── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`  ✓  ${msg}`);
  passed++;
}

function fail(msg) {
  console.error(`  ✗  ${msg}`);
  failed++;
}

function fileSize(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

// ── Run checks ──────────────────────────────────────────────────────────────

console.log("┌─────────────────────────────────────────────────────────────────");
console.log("│  Web Build Verification — @conitens/command-center  (Sub-AC 13.1)");
console.log(`│  Dist directory: ${DIST_DIR}`);
console.log("└─────────────────────────────────────────────────────────────────");
console.log();

// ── 1. dist/index.html exists ───────────────────────────────────────────────

const indexHtml = join(DIST_DIR, "index.html");
if (!existsSync(indexHtml)) {
  fail(`dist/index.html not found at ${indexHtml}. Run 'pnpm build' first.`);
} else {
  pass("dist/index.html exists");

  const html = readFileSync(indexHtml, "utf-8");

  // ── 2. <div id="root"> mount point ───────────────────────────────────────

  if (html.includes('<div id="root">')) {
    pass(`index.html contains <div id="root"> mount point`);
  } else {
    fail(`index.html is missing <div id="root"> — React cannot mount`);
  }

  // ── 3. <script type="module"> entry reference ─────────────────────────────

  if (/<script[^>]+type="module"/.test(html)) {
    pass(`index.html contains <script type="module"> entry point`);
  } else {
    fail(`index.html is missing <script type="module"> — browser ESM entry missing`);
  }

  // ── 4. modulepreload hints for vendor chunks ───────────────────────────────

  const preloadVendors = ["vendor-react", "vendor-three", "vendor-zustand", "vendor-r3f", "vendor-yaml"];
  for (const vendor of preloadVendors) {
    if (html.includes(vendor)) {
      pass(`index.html contains modulepreload hint for ${vendor}`);
    } else {
      fail(`index.html missing modulepreload for ${vendor}`);
    }
  }

  // ── 10. Absolute paths (web build, not Electron build) ────────────────────

  // Web build with base="/" should use /assets/..., not ./assets/...
  const hasDotSlashAssets = /src="\.\/assets\//.test(html) || /href="\.\/assets\//.test(html);
  const hasAbsAssets       = /src="\/assets\//.test(html)  || /href="\/assets\//.test(html);

  if (hasDotSlashAssets && !hasAbsAssets) {
    fail(
      `index.html uses relative paths (./assets/) — this appears to be an Electron ` +
      `build (base="./"). Web builds must use absolute paths (base="/"). ` +
      `Run 'pnpm build' (without --mode electron) to produce the web build.`
    );
  } else if (hasAbsAssets) {
    pass(`index.html uses absolute asset paths (/assets/) — correct for web deployment`);
  } else {
    fail(`index.html contains no asset references — bundle may be malformed`);
  }
}

// ── 5. dist/assets/ directory ───────────────────────────────────────────────

const assetsDir = join(DIST_DIR, "assets");
if (!existsSync(assetsDir)) {
  fail(`dist/assets/ directory not found. Run 'pnpm build' first.`);
} else {
  const assetFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
  if (assetFiles.length === 0) {
    fail(`dist/assets/ contains no .js files`);
  } else {
    pass(`dist/assets/ exists with ${assetFiles.length} JavaScript chunk(s)`);

    // ── 6. Named chunk types ─────────────────────────────────────────────────

    const expectedChunkPrefixes = [
      "vendor-three",
      "vendor-r3f",
      "vendor-react",
      "vendor-zustand",
      "vendor-yaml",
      "index",
    ];

    for (const prefix of expectedChunkPrefixes) {
      const match = assetFiles.find((f) => f.startsWith(prefix + "-") && f.endsWith(".js"));
      if (match) {
        pass(`dist/assets/${match} present`);

        // ── 7. Three.js chunk size sanity ───────────────────────────────────

        if (prefix === "vendor-three") {
          const size = fileSize(join(assetsDir, match));
          const kb = Math.round(size / 1024);
          if (size >= 100 * 1024) {
            pass(`Three.js chunk is ${kb} KB (≥ 100 KB minimum — confirms full Three.js build)`);
          } else {
            fail(`Three.js chunk is only ${kb} KB — expected ≥ 100 KB (may be empty/stub)`);
          }
        }

        // ── 8. App bundle size sanity ───────────────────────────────────────

        if (prefix === "index") {
          const size = fileSize(join(assetsDir, match));
          const kb = Math.round(size / 1024);
          if (size >= 50 * 1024) {
            pass(`Application bundle is ${kb} KB (≥ 50 KB minimum — confirms full app build)`);
          } else {
            fail(`Application bundle is only ${kb} KB — expected ≥ 50 KB (may be empty/stub)`);
          }
        }
      } else {
        fail(`No chunk matching '${prefix}-*.js' found in dist/assets/`);
      }
    }
  }
}

// ── 9. robots.txt passthrough ────────────────────────────────────────────────

const robots = join(DIST_DIR, "robots.txt");
if (existsSync(robots)) {
  pass(`dist/robots.txt present (public asset passthrough working)`);
} else {
  fail(`dist/robots.txt missing — public/ directory passthrough may not be configured`);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log();
console.log("┌─────────────────────────────────────────────────────────────────");
console.log("│  Results:");
console.log(`│    Passed: ${passed}`);
console.log(`│    Failed: ${failed}`);
console.log(`│    Total : ${passed + failed}`);
console.log("└─────────────────────────────────────────────────────────────────");
console.log();

if (failed === 0) {
  console.log(`✓  Web build verification passed — ${passed} checks.`);
  console.log(`   Static bundle is deployable: serve dist/ with any HTTP server.`);
  console.log(`   Example: npx serve dist  OR  vite preview`);
  process.exit(0);
} else {
  console.error(`✗  Web build verification FAILED — ${failed} check(s) did not pass.`);
  console.error(`   Run 'pnpm build' to regenerate the static bundle, then re-run this script.`);
  process.exit(1);
}
