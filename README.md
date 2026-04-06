# Conitens

> Last updated: 2026-04-07

> **Conitens는 외부 CLI 에이전트를 위한 verify-gated operations/control plane이다.**

Conitens does not replace Claude Code, Codex, Gemini, or future runtimes. It coordinates them through files, workflow contracts, approvals, verify gates, events, meetings, office reports, and replayable artifacts.

## Current Product Line

The active control plane in this repository is:

- Core CLI: [scripts/ensemble.py](scripts/ensemble.py)
- Additive extensions: `scripts/ensemble_*.py`
- Event log (sole commit point): `.notes/EVENTS/events.jsonl`
- Obsidian-compatible projections: `.notes/` (numbered vault: `00_Inbox/` through `80_Archive/`)
- Canonical agent config: `.agent/`
- Compatibility skills: `.agents/skills/`

### Priority: Persistent Agents & Communication Records

Per [ADR-0002](docs/adr-0002-product-surface-persistent-agents.md), the current focus is:

1. **Persistent agents** — create, modify, archive agent definitions via CLI
2. **Communication ledger** — record all user↔agent and agent↔agent conversations as event-sourced threads
3. **Obsidian-friendly records** — all `.notes/` files are projections from events, browsable in Obsidian
4. **CLI-first background operation** — detach/attach agent sessions without GUI
5. **Token optimization** — L0/L1/L2 compression tiers, budget enforcement

Office metaphor (Pixel Office, 3D Command Center) is maintained but deprioritized for new investment.

Architecture rule: `events/*.jsonl` is the sole commit point (I-1). `.notes/` Markdown files are **projections** regenerable from event replay (I-2). See [ADR-0001](docs/adr-0001-control-plane.md), [ADR-0002](docs/adr-0002-product-surface-persistent-agents.md).

## Repository Layers

### Active Runtime

- `.notes/` — Obsidian Vault (projections from events). Numbered structure: `00_Inbox/` through `80_Archive/`, with `.index/` for SQLite FTS.
- `.notes/EVENTS/events.jsonl` — append-only event log, sole commit point (I-1).
- `.agent/` — canonical agent config (manifests, policies, skills, workflows, providers, rooms).
- `scripts/ensemble.py` — existing operations core (preserved, never replaced).
- Extension modules (additive, event-first):
  - `ensemble_agent_registry.py` — persistent agent CRUD (create/list/patch/apply/archive)
  - `ensemble_comms.py` — communication ledger (thread create/append/close/search)
  - `ensemble_obsidian.py` — single-writer Obsidian projection layer with `rebuild_all()` (I-2)
  - `ensemble_background.py` — CLI background sessions (subprocess/tmux adapter)
  - `ensemble_token_budget.py` — L0/L1/L2 compression, budget enforcement
  - `ensemble_improver.py` — self-improvement loop (failure mining, candidate patches, weekly reports)
  - `ensemble_hermes.py` — Hermes profile mapping + OpenViking interface stubs
  - `ensemble_events.py` — event logging with type validation via `sync_event_types.py`

### Command Center (`packages/command-center`)

Visual interface for monitoring and controlling AI agents. Two view modes:

**2D Pixel Office (Default)** — PixiJS 8 top-down pixel-art office, inspired by [Claw Empire](https://github.com/GreenSheep01201/claw-empire):

- 9 rooms across 2 floors with room-type color coding
- 5 agent roles with animated 48x48 pixel-art sprite sheets
- Status-driven positioning (active→desk, idle→center, inactive→door)
- In-room diegetic monitors (CPU, MEM, queue metrics)
- Handoff arrows (animated agent-to-agent task flow)
- Speech bubbles (approval requests, agent output)
- Minimap with click-to-navigate
- Keyboard: 1-9 room jump, ESC zoom out
- Pan (drag) / Zoom (scroll)

**3D Command Center (Optional)** — Three.js/R3F diegetic 3D visualization:

- Low-poly building geometry with camera presets
- Bird's-eye orthographic mode with 4-tier LOD
- Display surfaces with live canvas-rendered metrics
- Event-sourced spatial state with replay

Toggle via button (top-right). Only one renderer active at a time.

```bash
cd packages/command-center && pnpm dev
# Open http://localhost:3100
```

### Dashboard (`packages/dashboard`)

Operational dashboard for persistent agents and communication threads. Screens:

- **Runs** — task execution list and detail
- **Threads** — communication ledger browser with search
- **Agents** — agent studio (list, detail, pending patches)
- **Approvals** — approval center for pending patches and gate decisions
- **Office Preview** — pixel office visualization (secondary)

Data source: Forward Bridge API (`scripts/ensemble_forward_bridge.py`) serving `/api/agents`, `/api/threads`, `/api/approvals`, `/api/runs`.

### Reference / Parity Surfaces

- `packages/protocol` — event types, validation, ownership rules
- `packages/core` — orchestrator, reducers, event log
- `docs/RFC-1.0.1.md` — protocol specification (canonical)

These remain important design references, but they are not the active runtime truth for the current product line unless a later ADR promotes them.

## Quick Start

```bash
# Task lifecycle
ensemble init-owner
ensemble new --mode SOLO --case MODIFY --title "Add typed workflow handoffs"
ensemble start
ensemble log --done "Prepared implementation slice" --change "scripts/ensemble_workflow.py" --next "Run verify"
ensemble verify --files scripts/ensemble_workflow.py
ensemble close

# Persistent agents
python scripts/ensemble_agent_registry.py create my-worker --role worker --persona "Backend specialist"
python scripts/ensemble_agent_registry.py list

# Communication threads
python scripts/ensemble_comms.py create --kind user_agent --workspace ws-main --participants "user,supervisor-core"
python scripts/ensemble_comms.py list
python scripts/ensemble_comms.py search "keyword"

# Background sessions
python scripts/ensemble_background.py up ws-main --agent worker --cmd "python my_task.py"
python scripts/ensemble_background.py ps
python scripts/ensemble_background.py logs ws-main worker
python scripts/ensemble_background.py stop ws-main worker

# Token budget
python scripts/ensemble_token_budget.py validate --file .notes/40_Comms/thread.md --type thread_summary

# Improvement reports
python scripts/ensemble_improver.py report
```

## Core Capabilities

- Verify-before-close task lifecycle
- Owner approval and question queue
- Append-only event logging (sole commit point, I-1)
- Event-first architecture: all mutations emit events, `.notes/` files are projections (I-2)
- Persistent agent registry (create, modify, archive via CLI)
- Communication ledger with thread-based recording (user-agent, agent-agent, agent-agent-user)
- Obsidian-compatible `.notes/` vault (frontmatter, wikilinks, tags)
- SQLite FTS thread search
- CLI-first background session management (detach/attach without GUI)
- L0/L1/L2 token compression with budget enforcement
- Self-improvement loop (failure mining, candidate patches, weekly reports)
- Approval-gated agent self-modification (patches require review)
- Markdown workflow contracts with run records
- Read-only MCP resources/prompts/tools surface
- Typed handoff artifacts for delegated workflow steps

## Workflow Example

Explain a workflow:

```bash
ensemble workflow explain --workflow wf.plan-execute-validate --set task_id=TASK-... --set files=scripts/ensemble_workflow.py --set summary="Implement workflow step kinds" --set implement_cmd="python -c \"print('implement')\""
```

Run until approval pause:

```bash
ensemble workflow run --workflow wf.plan-execute-validate --set task_id=TASK-... --set files=scripts/ensemble_workflow.py --set summary="Implement workflow step kinds" --set implement_cmd="python -c \"print('implement')\""
```

Approve and resume:

```bash
ensemble approve --latest
ensemble workflow resume --run run-YYYYMMDD-HHMMSS-wf-plan-execute-validate
```

## MCP Surface

List resources, prompts, and tools:

```bash
ensemble mcp serve
ensemble mcp tools
ensemble mcp resources
ensemble mcp prompts
```

Current ordering is resources -> prompts -> tools.

Read-only tools currently include:

- `task.list`
- `task.get`
- `questions.list`
- `locks.list`
- `context.get`
- `meetings.list`
- `workflow.runs`
- `handoffs.list`
- `registry.summary`
- `office.snapshot`

Prompt example:

```bash
ensemble mcp prompt-get --prompt workflow.blocked-summary --arguments "{}"
```

Feature-flagged parallel example:

```bash
ensemble workflow run --workflow wf.parallel-workcell --set task_id=TASK-... --set parallel_feature_flag=true
```

## Documentation

- [CONITENS.md](CONITENS.md): canonical architecture and state meaning
- [USAGE_GUIDE.md](USAGE_GUIDE.md): operator-oriented CLI usage
- [docs/adr-0001-control-plane.md](docs/adr-0001-control-plane.md): current truth boundaries
- [docs/adr-0002-product-surface-persistent-agents.md](docs/adr-0002-product-surface-persistent-agents.md): persistent agents, event-first architecture, .notes/ vault
- [docs/superpowers/plans/2026-04-06-conitens-improvement-plan.md](docs/superpowers/plans/2026-04-06-conitens-improvement-plan.md): 6-batch implementation plan (approved)
- [docs/control-plane-compatibility.md](docs/control-plane-compatibility.md): active vs reference surfaces
- [docs/OPERATIONS_LAYER.md](docs/OPERATIONS_LAYER.md): Core/Ext overview
- [docs/LOCAL_RUNTIME_POLICY.md](docs/LOCAL_RUNTIME_POLICY.md): what stays local-only vs tracked

## Tech Stack

| Layer | Technology |
|-------|-----------|
| 2D Rendering | PixiJS 8 |
| 3D Rendering | Three.js 0.175 + React Three Fiber v9 |
| UI Framework | React 19 |
| State Management | Zustand 5 |
| Build | Vite 7 |
| Testing | Vitest |
| Package Manager | pnpm (monorepo workspaces) |
| Runtime | Node.js 22+ |
| Operations CLI | Python (ensemble.py) |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Command Center dev server
cd packages/command-center && pnpm dev

# Generate sprite assets
cd packages/command-center
pnpm generate:sprites    # Agent sprite sheet PNGs
pnpm generate:tiles      # Room floor tileset PNG

# Operations CLI
python -m unittest tests.test_operations_layer
```

## Non-Goals For This Product Line

- Remote write-capable MCP by default
- Bypassing owner approval through Telegram, MCP, or workflow helpers
- Replacing `scripts/ensemble.py` with a new runtime
- Office metaphor expansion (frozen per ADR-0002; maintained, not extended)
- Full transcript prompt stuffing (use L0/L1 summaries instead)
- Unapproved agent self-modification (candidate patches require review)
- Vector DB or embeddings in v0
