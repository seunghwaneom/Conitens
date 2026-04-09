#!/usr/bin/env node
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const candidateExecutables = [
  process.env.REAL_NODE_PATH,
  "/mnt/c/Program Files/nodejs/node.exe",
  "C:\\Program Files\\nodejs\\node.exe",
  process.execPath,
].filter(Boolean);

const nodeExecutable = candidateExecutables.find((candidate) => {
  if (candidate === process.execPath) return true;
  return existsSync(candidate);
});

if (!nodeExecutable) {
  console.error("No usable Node executable found for Vitest.");
  process.exit(1);
}

const vitestEntry = resolve(__dirname, "../node_modules/vitest/vitest.mjs");
const result = spawnSync(nodeExecutable, [vitestEntry, "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

console.error(result.error ? String(result.error) : "Vitest launcher failed.");
process.exit(1);
