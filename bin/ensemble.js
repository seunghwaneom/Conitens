#!/usr/bin/env node
/**
 * Ensemble CLI Wrapper
 * 
 * This wrapper enables `ensemble` command globally after npm install -g
 * It delegates all commands to the Python ensemble.py script.
 * 
 * Usage:
 *   ensemble new --mode GCC --case NEW_BUILD --title "Task Title"
 *   ensemble start [--task TASK-ID]
 *   ensemble log --done "..." --change "..." --next "..."
 *   ensemble close [--task TASK-ID]
 *   ensemble status [--halted] [--dumped]
 *   ensemble --help
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Resolve the scripts directory relative to this file
const scriptsDir = path.join(__dirname, '..', 'scripts');
const ensemblePy = path.join(scriptsDir, 'ensemble.py');

// Check if Python script exists
if (!fs.existsSync(ensemblePy)) {
    console.error(`❌ Error: ensemble.py not found at ${ensemblePy}`);
    console.error('Please ensure the package is installed correctly.');
    process.exit(1);
}

// Detect Python executable (shell-free for DEP0190 compliance)
function getPythonCommand() {
    const commands = process.platform === 'win32' 
        ? ['python', 'python3', 'py']  // Windows: python이 더 흔함
        : ['python3', 'python'];        // Unix: python3 우선
    
    for (const cmd of commands) {
        try {
            const result = require('child_process').spawnSync(cmd, ['--version'], { 
                stdio: 'pipe',
                windowsHide: true
            });
            if (result.status === 0) {
                return cmd;
            }
        } catch (e) {
            continue;
        }
    }
    return process.platform === 'win32' ? 'python' : 'python3';
}

const pythonCmd = getPythonCommand();

// Pass all arguments to the Python script
const args = process.argv.slice(2);

// Windows에서 shell 없이 Python 실행 (DEP0190 완전 제거)
const spawnOptions = {
    stdio: 'inherit',
    cwd: process.cwd(),
    windowsHide: true,
    env: {
        ...process.env,
        // Ensure UTF-8 encoding for cross-platform compatibility
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
    }
};

// Windows에서는 .exe 확장자로 직접 실행 (shell 불필요)
// shell: true + args 조합은 Node.js DEP0190 경고 발생
const child = spawn(pythonCmd, [ensemblePy, ...args], spawnOptions);

child.on('error', (err) => {
    if (err.code === 'ENOENT') {
        console.error(`❌ Error: Python not found. Please install Python 3.8+`);
        console.error(`   Tried: ${pythonCmd}`);
        console.error(`   Install: https://www.python.org/downloads/`);
    } else {
        console.error(`❌ Error: ${err.message}`);
    }
    process.exit(1);
});

child.on('close', (code) => {
    process.exit(code || 0);
});
