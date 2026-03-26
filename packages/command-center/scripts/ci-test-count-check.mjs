#!/usr/bin/env node
/**
 * ci-test-count-check.mjs — Sub-AC 14.4 CI gate
 *
 * Runs the Vitest test suite for @conitens/command-center and asserts that
 * the total number of passing tests meets or exceeds the MIN_PASS_COUNT
 * threshold (default: 8).
 *
 * Usage
 * ─────
 *   node scripts/ci-test-count-check.mjs
 *   node scripts/ci-test-count-check.mjs --min 16
 *   node scripts/ci-test-count-check.mjs --filter "14.4"
 *   node scripts/ci-test-count-check.mjs --file replay-playback-scale
 *
 * Exit codes
 * ──────────
 *   0 — All tests passed AND pass count ≥ MIN_PASS_COUNT
 *   1 — Test suite failed OR pass count < MIN_PASS_COUNT
 *
 * Environment
 * ───────────
 *   CI=true  — set automatically by most CI systems; enables stricter output
 *
 * Implementation
 * ──────────────
 *   Runs `pnpm vitest run --reporter=json --outputFile=<tmp>` to write JSON
 *   results to a temp file, then reads and parses the file.  This avoids
 *   pipe buffer overflow for large test suites (5000+ tests).
 *
 *   Zero-dependency: pure Node.js built-ins only.
 */

import { spawnSync }                from "node:child_process";
import { readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { resolve, dirname }         from "node:path";
import { fileURLToPath }            from "node:url";
import { tmpdir }                   from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR   = resolve(__dirname, "..");

// ── CLI argument parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] !== undefined ? args[idx + 1] : null;
}

const MIN_PASS_COUNT = parseInt(getArgValue("--min") ?? "8", 10);
const FILTER_PATTERN = getArgValue("--filter");
const FILE_PATTERN   = getArgValue("--file");

// ── Temp file for JSON output ───────────────────────────────────────────────

const TMP_DIR  = resolve(tmpdir(), "conitens-ci");
const TMP_FILE = resolve(TMP_DIR, `vitest-results-${Date.now()}.json`);

try {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
} catch { /* ignore */ }

// ── Build vitest command ────────────────────────────────────────────────────

const pnpmBin = "pnpm";

const vitestArgs = [
  "vitest",
  "run",
  "--reporter=verbose",
  "--reporter=json",
  `--outputFile=${TMP_FILE}`,
];

if (FILTER_PATTERN) vitestArgs.push("--testNamePattern", FILTER_PATTERN);
if (FILE_PATTERN)   vitestArgs.push(FILE_PATTERN);

console.log("┌─────────────────────────────────────────────────────────────────");
console.log("│  CI Test Count Check — @conitens/command-center");
console.log(`│  Minimum required passing tests: ${MIN_PASS_COUNT}`);
if (FILTER_PATTERN) console.log(`│  Test name filter: ${FILTER_PATTERN}`);
if (FILE_PATTERN)   console.log(`│  File filter: ${FILE_PATTERN}`);
console.log("└─────────────────────────────────────────────────────────────────");
console.log();

// ── Run vitest ─────────────────────────────────────────────────────────────

const result = spawnSync(pnpmBin, vitestArgs, {
  cwd:   PKG_DIR,
  // shell required on Windows to resolve pnpm from PATH
  shell: process.platform === "win32",
  // Show output in real time (both stdout + stderr to terminal)
  stdio: "inherit",
  env:   { ...process.env, FORCE_COLOR: "1" },
  // 5-minute timeout
  timeout: 300_000,
});

// ── Parse JSON results ───────────────────────────────────────────────────────

let passedCount = 0;
let failedCount = 0;
let totalCount  = 0;
let jsonParsed  = false;

if (existsSync(TMP_FILE)) {
  try {
    const text = readFileSync(TMP_FILE, "utf-8");
    const data = JSON.parse(text);
    passedCount = data.numPassedTests ?? 0;
    failedCount = data.numFailedTests ?? 0;
    totalCount  = data.numTotalTests  ?? 0;
    jsonParsed  = true;
  } catch (err) {
    console.warn(`⚠  Could not parse JSON results from ${TMP_FILE}: ${err.message}`);
  }
  // Clean up temp file
  try { unlinkSync(TMP_FILE); } catch { /* ignore */ }
} else {
  console.warn(
    `⚠  JSON output file not found at ${TMP_FILE}.\n` +
    "   Falling back to process exit code only.",
  );
}

// ── Evaluate results ─────────────────────────────────────────────────────────

console.log();
console.log("┌─────────────────────────────────────────────────────────────────");
console.log("│  Results:");
if (jsonParsed) {
  console.log(`│    Total tests  : ${totalCount}`);
  console.log(`│    Passed       : ${passedCount}`);
  console.log(`│    Failed       : ${failedCount}`);
}
console.log(`│    Required ≥   : ${MIN_PASS_COUNT} passing`);
console.log("└─────────────────────────────────────────────────────────────────");
console.log();

const vitestPassed = result.status === 0;
const countPassed  = !jsonParsed ? true : passedCount >= MIN_PASS_COUNT;
const allPassed    = vitestPassed && countPassed;

if (!vitestPassed) {
  const code = result.status ?? "(null — spawn failed)";
  console.error(`✗  Vitest exited with code ${code}.`);
  if (result.error) console.error(`   spawn error: ${result.error.message}`);
}

if (jsonParsed && !countPassed) {
  console.error(`✗  Pass count ${passedCount} < required minimum ${MIN_PASS_COUNT}.`);
}

if (allPassed) {
  if (jsonParsed) {
    console.log(
      `✓  All tests passed — ${passedCount}/${totalCount} passing` +
      ` (required ≥ ${MIN_PASS_COUNT}).`,
    );
  } else {
    console.log(`✓  Vitest exited successfully (exit code 0).`);
  }
  process.exit(0);
} else {
  process.exit(1);
}
