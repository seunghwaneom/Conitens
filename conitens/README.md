<div align="center">

# ✨ Conitens

**"Together We Shine"** — Multi-Agent AI Orchestration System

[![npm version](https://img.shields.io/npm/v/@seunghwan/conitens.svg)](https://www.npmjs.com/package/@seunghwan/conitens)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/python-%3E%3D3.8-blue.svg)](https://www.python.org/)

[English](#-quick-start) • [한국어](docs/README.ko.md)

**Orchestrate Gemini, Claude Code, and Codex as a unified development team**

</div>

---

## 🎯 What is Conitens?

**Conitens** (from Latin *Co-* "together" + *Nitens* "shining") transforms multiple AI agents into a **coordinated software development team**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONITENS ORCHESTRATION                        │
├─────────────────────────────────────────────────────────────────┤
│  🧠 Gemini 3 Pro     → Planner (2M+ context, Deep Think)        │
│  🔧 Claude Code      → Implementer (Terminal, Tool Calling)     │
│  🛡️ Codex            → Validator (Security Audit, Review)       │
├─────────────────────────────────────────────────────────────────┤
│  📁 Shared State: .notes/INBOX → ACTIVE → COMPLETED             │
│  📝 Single Source of Truth: task.md                             │
│  🔒 Safety: Mandatory verification before close                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Conitens?

| Problem with Single AI | Conitens Solution |
|------------------------|-------------------|
| Context limit → Forgets instructions | Role separation + Shared state files |
| Hallucination increases with complexity | Independent verification by Codex |
| No self-review capability | Mandatory `verify` before `close` |
| Quota exhaustion blocks work | Switch between 3 agents seamlessly |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 16.0.0
- **Python** ≥ 3.8 (no pip dependencies required)
- **Git** (optional, for version control integration)

### Installation

```bash
# Global install (recommended)
npm install -g @seunghwan/conitens

# Or local install
npm install @seunghwan/conitens
```

> 💡 Both `ensemble` and `conitens` commands are available after installation.

### First Project Setup

```bash
# Navigate to your project
cd /path/to/your/project

# Initialize ownership
ensemble init-owner

# Create your first task
ensemble new --mode GCC --case NEW_BUILD --title "Implement login feature"

# Start working
ensemble start

# Log progress
ensemble log --done "Created auth module" --change "src/auth.py" --next "Add tests"

# Verify before closing (mandatory in v4.2+)
ensemble verify --files src/auth.py

# Complete the task
ensemble close
```

---

## 📖 Core Concepts

### Execution Patterns

| Pattern | Code | Flow | Use Case |
|---------|------|------|----------|
| **Serial** | `SRL` | G→C→C | Planning → Implementation → Verification |
| **Parallel** | `PAR` | Independent | Role-based file separation |
| **Free** | `FRE` | Any order | Flexible collaboration |

### Task Lifecycle

```
INBOX → ACTIVE → (verify) → COMPLETED
             ↓                   ↑
          HALTED ←───────────────┤
             ↓                   │
          DUMPED                 │
                                 │
          (reopen) ──────────────┘
```

### Directory Structure

```
your-project/
├── .notes/
│   ├── INBOX/           # Pending tasks
│   ├── ACTIVE/          # Current work (max 1 in SRL mode)
│   ├── COMPLETED/       # Done tasks
│   ├── HALTED/          # Paused (resumable)
│   ├── DUMPED/          # Abandoned
│   ├── JOURNAL/         # Session journals
│   ├── ERRORS/          # Error registry
│   └── WORKSPACE_POLICY.json
├── .agent/              # Agent configurations
│   ├── rules/
│   ├── skills/
│   └── workflows/
├── .vibe/               # Context & metadata
│   ├── VERSION
│   ├── config.json
│   └── context/
├── CLAUDE.md            # Claude Code instructions
└── AGENTS.md            # Codex instructions
```

---

## 🔧 CLI Commands

### Core Workflow

| Command | Description |
|---------|-------------|
| `ensemble new` | Create new task |
| `ensemble start` | Begin working on task |
| `ensemble log` | Record progress |
| `ensemble verify` | ⚠️ **Mandatory** code verification |
| `ensemble close` | Complete task |
| `ensemble reopen` | Reactivate completed task |

### Task Management

| Command | Description |
|---------|-------------|
| `ensemble status` | Show current state |
| `ensemble halt` | Pause task (resumable) |
| `ensemble dump` | Abandon task |
| `ensemble lock` | Manage file locks |

### Quality & Analysis

| Command | Description |
|---------|-------------|
| `ensemble error` | Error registry management |
| `ensemble triage` | Failure analysis |
| `ensemble impact` | Dependency analysis |
| `ensemble preflight` | Data contract validation |
| `ensemble context` | Update LATEST_CONTEXT.md |
| `ensemble weekly` | Self-improvement report |

### Upgrade & Maintenance (v4.2+)

| Command | Description |
|---------|-------------|
| `ensemble upgrade-scan` | Extract upgrade candidates from journals |
| `ensemble upgrade-setup` | Prepare version upgrade (owner only) |
| `ensemble upgrade` | Execute upgrade (owner only) |
| `ensemble report` | Generate issue report for GitHub |

---

## 🤖 Agent Integration

### Antigravity (Gemini)

Configuration: `.agent/rules/ensemble-protocol.md`

```markdown
# Auto-trigger rules
- "~해줘" / "implement X" → ensemble new
- Code complete → ensemble log
- Before close → ensemble verify
```

### Claude Code

Configuration: `CLAUDE.md` (auto-loaded)

### Codex

Configuration: `AGENTS.md` (auto-loaded)

---

## 🛡️ Safety Features

### Mandatory Verification (v4.2+)

```bash
# Close without verify → BLOCKED
ensemble close  # ❌ Error: Verify required

# Proper workflow
ensemble verify --files src/main.py
ensemble close  # ✅ Success
```

### Verification Levels

| Level | Check | On Fail |
|-------|-------|---------| 
| L1 | Syntax (`py_compile`, `node --check`) | 🔴 BLOCK |
| L2 | Import/Require resolution | 🔴 BLOCK |
| L3 | Smoke test | 🟡 WARN |

### File Locking

```bash
ensemble lock acquire --file src/api.py --agent CLAUDE
ensemble lock release --file src/api.py --agent CLAUDE
ensemble lock list
```

---

## 📊 Self-Improvement

### Weekly Reports

```bash
ensemble weekly
# Generates: .notes/WEEKLY/WEEKLY-2026-W05.md
```

### Error Registry

```bash
# Register error
ensemble error register --type IMPORT --file src/api.py --msg "Module not found"

# Search errors
ensemble error search --status OPEN

# Generate findings
ensemble error findings
```

### Impact Analysis

```bash
ensemble impact --file src/core.py
# Shows: Affected files, risk score, recommendations
```

---

## 🔄 Upgrading

### Self-Upgrade System (v4.2+)

```bash
# 1. Scan journals for upgrade candidates
ensemble upgrade-scan --since 2026-01-01

# 2. Prepare upgrade (owner only)
ensemble upgrade-setup --version 4.3.0

# 3. Execute upgrade
ensemble upgrade --push
```

### Manual Upgrade

```bash
npm update -g @seunghwan/conitens
```

---

## 🌐 Supported Environments

| Environment | Status | Notes |
|-------------|--------|-------|
| Linux (EXT4, XFS) | ✅ Full | Recommended |
| macOS (APFS) | ✅ Full | |
| Windows (NTFS) | ⚠️ Partial | File lock may differ |
| WSL2 (Linux FS) | ✅ Full | Use `~/projects/...` |
| WSL2 (/mnt/c) | ❌ Not recommended | Lock issues |

---

## 📚 Documentation

- [USAGE_GUIDE.md](USAGE_GUIDE.md) — Detailed usage instructions
- [CONITENS.md](CONITENS.md) — Protocol specification
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [docs/UPGRADE_PROCESS.md](docs/UPGRADE_PROCESS.md) — Upgrade workflow
- [docs/GITHUB_MANAGEMENT.md](docs/GITHUB_MANAGEMENT.md) — Repository management

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Contribution Steps

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Reporting Issues

Use our issue templates:
- 🐛 [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md)
- ✨ [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md)
- 📈 [Upgrade Suggestion](.github/ISSUE_TEMPLATE/upgrade_suggestion.md)

Or let an AI agent help:
```bash
ensemble report --type bug
# Agent guides you through report creation
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Antigravity IDE** — Gemini integration framework
- **Claude Code** — Anthropic's coding assistant
- **Codex** — OpenAI's code model
- **vibe-kit** — Inspiration for context management

---

## ⚖️ Legal Notices

### Trademark Notice

- "Claude" and "Claude Code" are trademarks of Anthropic, PBC.
- "Gemini" is a trademark of Google LLC.
- "Codex" is associated with OpenAI.

**Conitens is an independent project and is not affiliated with, endorsed by, or sponsored by Anthropic, Google, or OpenAI.** This tool coordinates workflows across these AI services but does not include or redistribute their software.

### Disclaimer: AI-Generated Content

Code generated through AI assistants coordinated by Conitens may have uncertain copyright status under current law. Users are responsible for:

- Reviewing and modifying AI-generated code before use
- Ensuring compliance with respective AI service terms of service
- Adding substantial human contribution before claiming ownership
- Understanding that AI outputs may not be copyrightable

### Responsibility

Conitens is a coordination tool that helps orchestrate AI coding assistants. **All code changes should be reviewed by humans before deployment.** The project maintainers are not responsible for:

- Errors or bugs in AI-generated code
- Security vulnerabilities introduced by AI suggestions
- Any damages resulting from the use of this software

Use at your own risk. See [LICENSE](LICENSE) for full terms.

---

<div align="center">

**✨ Together We Shine ✨**

Built with ❤️ for the AI-assisted development community

[Report Bug](https://github.com/seunghwan/conitens/issues) · [Request Feature](https://github.com/seunghwan/conitens/issues) · [Discussions](https://github.com/seunghwan/conitens/discussions)

</div>
