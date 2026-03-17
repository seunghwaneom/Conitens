# Conitens v2

> **Conitens v2는 이종 CLI 에이전트를 위한 마크다운 네이티브, 이벤트 소싱 협업 OS다.**

[![Tests](https://img.shields.io/badge/tests-153%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()
[![Node](https://img.shields.io/badge/Node-%E2%89%A522.12-green)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

Conitens v2 coordinates heterogeneous CLI agents (Claude Code, Gemini CLI, Codex CLI) through a markdown-native, event-sourced protocol. Files are the protocol — the `.conitens/` directory is the shared workspace, and `events/*.jsonl` is the single source of truth.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  5-Plane Taxonomy                                       │
├─────────────────────────────────────────────────────────┤
│  CONTROL   — MODE.md, personas, policies (human-owned)  │
│  COMMAND   — commands/*.md (intent, deleted after use)   │
│  EVENT     — events/*.jsonl (append-only, commit point)  │
│  ENTITY    — tasks/*.md, decisions/*.md (reducer-owned)  │
│  VIEW      — views/*.md (generated from events)          │
│  OPERATIONAL — runtime/locks, pids (not replay-relevant) │
└─────────────────────────────────────────────────────────┘
```

### Protocol Stack
```
Layer 5: A2A        — Remote agent federation
Layer 4: MCP        — Agent-to-tool (5 tools)
Layer 3: WebSocket  — Real-time event bus
Layer 2: SQLite     — Index/query (planned)
Layer 1: Files+JSONL+Git — Local truth & audit
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Initialize .conitens/ workspace
npx conitens init

# Run all tests
pnpm test

# Build all packages
pnpm -r build
```

## Packages

| Package | Description | Tests |
|---------|-------------|-------|
| `@conitens/protocol` | RFC-1.0.1 types, validators, path classification | 65 |
| `@conitens/core` | Headless orchestrator, reducers, replay, channels | 88 |
| `@conitens/tui` | Ink-based terminal dashboard (4 panels) | — |
| `@conitens/dashboard` | React 19 + Vite web dashboard (Kanban, Timeline, Office) | — |

## Core Modules

```
@conitens/core
├── event-log/        — JSONL append/read/replay with fsync
├── init/             — .conitens/ directory initializer
├── orchestrator/     — command → validate → dedupe → redact → append → reduce → delete
├── reducers/         — TaskReducer, StatusReducer, MemoryReducer, MemoryCuratorReducer
├── replay/           — Crash recovery: rebuild all state from events
├── agent-spawner/    — tmux session management for agent isolation
├── worktree/         — Git worktree manager for file isolation
├── ws-bus/           — WebSocket real-time event broadcasting
├── channels/         — Slack (Bolt.js), Telegram (grammY), Discord (discord.js) adapters
├── mode/             — MODE.md management + provider switching
├── generator/        — AGENTS.md instruction generation from personas
├── traces/           — OTEL-compatible trace logging (traces/*.jsonl)
├── mcp/              — MCP server exposing 5 tools
├── a2a/              — A2A federation client
├── plugins/          — Plugin manager with lifecycle hooks
└── cli.ts            — conitens init | serve | replay | doctor
```

## 7 Invariants

| # | Invariant |
|---|-----------|
| I-1 | `events/*.jsonl` append is the **only commit point** |
| I-2 | Views rebuild from **events only** (no runtime dependency) |
| I-3 | Agents don't directly modify entity/view files |
| I-4 | MODE.md changes **only provider bindings** |
| I-5 | All outbound messages pass **approval gates** |
| I-6 | Pre-append **redaction** of secrets is mandatory |
| I-7 | Each file has **exactly one owner** (writer) |

## Task State Machine

```
draft → planned → assigned → active ⇄ blocked
                                ↓
                              review
                           ↙    ↓    ↘
                      active   done   failed → assigned
         (anywhere) → cancelled
```

9 states, validated transitions via `canTransition()` from `@conitens/protocol`.

## Event Types (33)

Task (8), Handoff (4), Decision (3), Approval (3), Agent (4), Message (3), Memory (4), Mode (2), System (3), Command (1).

## Dashboard

The web dashboard (`@conitens/dashboard`) provides:

- **Overview** — Agent status sidebar + task list + live event log
- **Kanban** — Drag-and-drop task board with dnd-kit (9 columns = 9 states)
- **Timeline** — Recharts area chart of event volume over time
- **Office** — PixiJS 8 pixel office with agent avatars and task cards

```bash
cd packages/dashboard && pnpm dev  # http://localhost:3000
```

## TUI (Terminal)

```bash
# The TUI shows: Agent Status Bar, Task List, Live Log, Alerts
```

## Security

- All process spawning uses `execFile` (not `exec`) — no shell injection
- tmux commands validated against shell metacharacter injection
- Path traversal prevention via `validateId()` on all user-supplied identifiers
- Plugin invariant guards prevent mutation of event identity fields
- WebSocket supports optional token-based authentication
- Pre-append redaction handles strings, objects, and arrays
- Secrets blocked from outbound channel messages (I-5)

## Documentation

| Document | Purpose |
|----------|---------|
| [RFC-1.0.1](docs/RFC-1.0.1-merged.md) | Protocol specification (single source of truth) |
| [CLAUDE.md](CLAUDE.md) | Project instructions for Claude Code |
| [AGENTS.md](AGENTS.md) | Generated agent registry |

## Tech Stack

| Area | Technology |
|------|-----------|
| Runtime | Node.js ≥22.12, TypeScript 5.7 |
| Package Manager | pnpm 9 (monorepo workspaces) |
| Build | tsc (packages), Vite 7 (dashboard) |
| Test | Vitest |
| Frontend | React 19, Zustand 5, Recharts, dnd-kit, PixiJS 8 |
| TUI | Ink 5 (React for Terminal) |
| WebSocket | ws |
| Channels | Bolt.js, grammY, discord.js (structural adapters) |

## Development

```bash
# Run protocol tests only
cd packages/protocol && pnpm test

# Run core tests only
cd packages/core && pnpm test

# Build everything
pnpm -r build

# Start dev dashboard
cd packages/dashboard && pnpm dev
```

## License

MIT
