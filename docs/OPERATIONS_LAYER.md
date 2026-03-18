# Conitens Operations Layer

Conitens is the operational control plane around external agent runtimes.

## Core

[ensemble.py](../scripts/ensemble.py) remains the Core entrypoint.

Core owns:

- task lifecycle
- focus and status
- lock handling
- question and owner approval
- verify-before-close

## Ext

Extension modules add operational capabilities without replacing the Core:

- [ensemble_contracts.py](../scripts/ensemble_contracts.py)
- [ensemble_events.py](../scripts/ensemble_events.py)
- [ensemble_workflow.py](../scripts/ensemble_workflow.py)
- [ensemble_meeting.py](../scripts/ensemble_meeting.py)
- [ensemble_office.py](../scripts/ensemble_office.py)
- [ensemble_hooks.py](../scripts/ensemble_hooks.py)
- [ensemble_mcp_server.py](../scripts/ensemble_mcp_server.py)
- [ensemble_telegram.py](../scripts/ensemble_telegram.py)

## State Surfaces

### Canonical Configuration

- `.agent/`: canonical workflows and rules
- `.agents/skills/`: Codex compatibility skills

### Canonical Runtime State

- `.notes/`: task state, events, meetings, reports, context
- `.notes/context/LATEST_CONTEXT.md`: canonical context path
- `.notes/LATEST_CONTEXT.md`: legacy mirror for compatibility
- lowercase extension paths are canonical for new records:
  - `.notes/workflows/`
  - `.notes/events/`
  - `.notes/meetings/`
  - `.notes/office/`
  - `.notes/artifacts/`
  - `.notes/handoffs/`
  - `.notes/gates/`
- legacy uppercase aliases remain supported during the transition

### Compatibility Metadata

- `.vibe/`: version and compatibility metadata

### Non-Canonical Support State

- `.omx/`: OMX runtime state, plans, context snapshots, and execution support

`.omx/` is useful, but it is not the source of truth for Conitens task/event
state.

## Event Model

Events are append-only JSONL records.

They exist to make state reconstruction and operational replay possible.

Key properties:

- versioned schema
- redaction-aware payloads
- machine-readable actor and scope
- no summary-only truth source

## Meeting Model

Meetings are append-only transcripts with derived summaries.

Canonical:

- `.notes/meetings/MTG-*.jsonl`

Derived:

- `.notes/meetings/summaries/*.md`

This keeps human-readable summaries downstream of the transcript.

## Workflow Model

Workflows are markdown contracts with frontmatter.

The engine validates:

- required workflow fields
- required step fields
- supported `kind`
- supported `on_fail`
- template variables against declared inputs

The engine also supports:

- `explain`
- `dry-run`
- approval pause and resume
- per-run result files under `.notes/workflows/` with legacy alias support
- gate records under `.notes/gates/`
- typed handoff artifacts under `.notes/handoffs/`

## Office Report Model

Office reports are static snapshots, not real-time dashboards.

Current output modes:

- Markdown
- HTML

Current focus:

- task counts by status
- verify state
- pending approvals
- workflow runs
- gate records
- handoff artifacts
- artifact manifests
- stale task/meeting/context visibility
- why-blocked rollups

## Guardrails

- `verify` remains the gate before `close`
- approvals remain local-policy aware
- MCP is read-only today and layered as resources -> prompts -> tools
- Telegram is OFF by default
- remote channels must not bypass approval or directly mutate workspace state
- shared redaction applies before logs, summaries, or bridge output

## Platform Note

Workflow subprocesses force UTF-8 for nested CLI calls on Windows because
console-default encodings can corrupt Unicode output otherwise.
