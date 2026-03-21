#!/usr/bin/env node
/**
 * Post-install script for Conitens.
 * Displays setup instructions and validates the Python runtime.
 */

const { spawnSync } = require('child_process');
const path = require('path');

console.log(`
============================================================
  CONITENS v4.2.0
  Multi-Agent AI Orchestration and Operations Layer
============================================================
`);

function checkPython() {
  const commands = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  for (const cmd of commands) {
    try {
      const result = spawnSync(cmd, ['--version'], {
        stdio: 'pipe',
        windowsHide: true,
      });
      if (result.status === 0) {
        const version = result.stdout.toString().trim() || result.stderr.toString().trim();
        console.log(`Python found: ${version}`);
        return true;
      }
    } catch (error) {
      continue;
    }
  }

  console.log('Python 3.8+ is required but was not found.');
  console.log('Install: https://www.python.org/downloads/');
  return false;
}

checkPython();

console.log(`
Installation Complete

Quick Start:
  1. Navigate to your project directory
  2. Run: ensemble init-owner
  3. Run: ensemble new --mode GCC --case NEW_BUILD --title "My Task"
  4. Run: ensemble start
  5. Run: ensemble spawn providers
  6. Run: ensemble ui tui --once

Documentation:
  - USAGE_GUIDE.md
  - CONITENS.md
  - CLAUDE.md
  - AGENTS.md

Agent Integration:
  - Antigravity rules  -> .agent/rules/ensemble-protocol.md
  - Canonical workflows -> .agent/workflows/
  - Codex skills       -> .agents/skills/
  - Claude Code        -> CLAUDE.md
  - Codex              -> AGENTS.md

Commands (use 'ensemble' or 'conitens'):
  ensemble --help
  ensemble status
  ensemble new
  ensemble start
  ensemble log
  ensemble meet
  ensemble workflow
  ensemble office
  ensemble hooks
  ensemble mcp
  ensemble spawn
  ensemble memory
  ensemble room
  ensemble ui
  ensemble close

Scripts Directory:
  ${path.join(__dirname, '..', 'scripts')}
`);
