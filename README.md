# Conitens

> **Conitens는 외부 CLI 에이전트를 위한 verify-gated operations/control plane이다.**

Conitens does not replace Claude Code, Codex, Gemini, or future runtimes. It coordinates them through files, workflow contracts, approvals, verify gates, events, meetings, office reports, and replayable artifacts.

## Current Product Line

The active control plane in this repository is:

- Core CLI: [scripts/ensemble.py](scripts/ensemble.py)
- Additive extensions: `scripts/ensemble_*.py`
- Runtime truth: `.notes/`
- Canonical config and control metadata: `.agent/`
- Compatibility skills: `.agents/skills/`

Notes path policy for this product line:

- lowercase canonical for extension surfaces such as `.notes/workflows`, `.notes/events`, `.notes/meetings`, `.notes/office`, `.notes/artifacts`, `.notes/handoffs`, `.notes/gates`
- legacy uppercase aliases remain readable and writable during the transition

This rule is formalized in [ADR-0001](docs/adr-0001-control-plane.md).

## Repository Layers

### Active Runtime

- `.notes/` stores task state, events, meetings, workflow runs, handoffs, office reports, and context snapshots.
- `.agent/` stores rules, workflows, canonical agent manifests, canonical skill manifests, and gate policies.
- `scripts/ensemble.py` preserves the existing operations core.
- `scripts/ensemble_workflow.py`, `scripts/ensemble_mcp_server.py`, `scripts/ensemble_office.py`, `scripts/ensemble_meeting.py`, and related modules extend that core additively.

### Reference / Parity Surfaces

- `packages/*`
- `docs/RFC-1.0.1-merged.md`
- older `.conitens`-first roadmap material

These remain important design references, but they are not the active runtime truth for the current product line unless a later ADR promotes them.

## Quick Start

```bash
ensemble init-owner
ensemble new --mode GCC --case MODIFY --title "Add typed workflow handoffs"
ensemble start
ensemble log --done "Prepared implementation slice" --change "scripts/ensemble_workflow.py" --next "Run verify"
ensemble verify --files scripts/ensemble_workflow.py
ensemble close
```

## Core Capabilities

- Verify-before-close task lifecycle
- Owner approval and question queue
- Append-only event logging
- Append-only meeting transcripts with derived summaries
- Markdown workflow contracts with run records
- Durable gate records and artifact manifests
- Read-only MCP resources/prompts/tools surface for safe inspection
- Static office reports for operational visibility
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
- [docs/control-plane-compatibility.md](docs/control-plane-compatibility.md): active vs reference surfaces
- [docs/OPERATIONS_LAYER.md](docs/OPERATIONS_LAYER.md): Core/Ext overview

## Development

```bash
python -m unittest tests.test_operations_layer
pnpm -r test
```

## Non-Goals For This Product Line

- remote write-capable MCP by default
- bypassing owner approval through Telegram, MCP, or workflow helpers
- replacing `scripts/ensemble.py` with a new runtime
- treating `.context/` or `.conitens/` as active task truth for the current branch
