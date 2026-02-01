#!/usr/bin/env node
/**
 * Post-install script for Conitens
 * Displays setup instructions and validates environment
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║        ✨ C O N I T E N S   v4.2.0 — "Together We Shine"          ║
║              Multi-Agent AI Orchestration System                  ║
╚═══════════════════════════════════════════════════════════════════╝
`);

// Check Python version (shell-free for DEP0190 compliance)
function checkPython() {
    const commands = process.platform === 'win32'
        ? ['python', 'python3', 'py']
        : ['python3', 'python'];
    
    for (const cmd of commands) {
        try {
            const result = spawnSync(cmd, ['--version'], { 
                stdio: 'pipe',
                windowsHide: true
            });
            if (result.status === 0) {
                const version = result.stdout.toString().trim() || result.stderr.toString().trim();
                console.log(`✅ Python found: ${version}`);
                return true;
            }
        } catch (e) {
            continue;
        }
    }
    console.log(`❌ Python 3.8+ required but not found!`);
    console.log(`   Install: https://www.python.org/downloads/`);
    return false;
}

checkPython();

console.log(`
📦 Installation Complete!

🚀 Quick Start:
   1. Navigate to your project directory
   2. Run: ensemble init-owner
   3. Run: ensemble new --mode GCC --case NEW_BUILD --title "My Task"
   4. Run: ensemble start

📖 Documentation:
   - USAGE_GUIDE.md          → Full usage guide
   - CONITENS.md             → Protocol overview  
   - CLAUDE.md               → Claude Code integration
   - AGENTS.md               → Codex integration

🤖 Agent Integration:
   - Antigravity (Gemini)  → .agent/rules/ensemble-protocol.md
   - Claude Code           → CLAUDE.md (auto-loaded)
   - Codex Extension       → AGENTS.md (auto-loaded)

💡 Commands (use 'ensemble' or 'conitens'):
   ensemble --help         → Show all commands
   ensemble status         → Check current state
   ensemble new            → Create new task
   ensemble start          → Start task
   ensemble log            → Record progress
   ensemble close          → Complete task

🔧 Scripts Directory:
   ${path.join(__dirname, '..', 'scripts')}
   
   Available tools for agents:
   - ensemble.py           → Main CLI
   - ensemble_triage.py    → Failure analysis
   - ensemble_manifest.py  → Reproducibility tracking
   - ensemble_preflight.py → Data contract validation
   - ensemble_impact.py    → Dependency analysis
   - ensemble_weekly.py    → Self-improvement reports
   - ensemble_context.py   → LATEST_CONTEXT generation
`);
