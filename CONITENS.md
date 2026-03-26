# CONITENS v4.2.0

Conitens is an operations layer for agentic engineering.

It does not try to replace external AI runtimes. Instead, it coordinates them
through files, CLI contracts, approvals, verification, meetings, replayable
events, and static operational reports.

## What Conitens Is

- External runtimes such as Claude Code, Gemini, Codex, and future agents own
  reasoning and generation.
- Conitens owns state, approvals, verify gates, workflow execution, event
  logging, meeting capture, office reporting, and replayable artifacts.
- The system favors append-only machine state over narrative summaries.

## Core And Ext

### Core

The Core remains centered on [scripts/ensemble.py](scripts/ensemble.py).

Core responsibilities:

- task lifecycle in `.notes/`
- focus management
- lock handling
- question and approval flow
- verify-before-close enforcement
- existing task/status/error/context entrypoints

### Ext

The Ext layer adds new capabilities without replacing Core behavior.

Implemented extension modules:

- [ensemble_contracts.py](scripts/ensemble_contracts.py)
- [ensemble_events.py](scripts/ensemble_events.py)
- [ensemble_workflow.py](scripts/ensemble_workflow.py)
- [ensemble_meeting.py](scripts/ensemble_meeting.py)
- [ensemble_office.py](scripts/ensemble_office.py)
- [ensemble_hooks.py](scripts/ensemble_hooks.py)
- [ensemble_mcp_server.py](scripts/ensemble_mcp_server.py)
- [ensemble_telegram.py](scripts/ensemble_telegram.py)

The guiding rule is simple:

Conitens extends by adding an Ext layer around the existing Core, not by
replacing the Core with a new state engine.

## Canonical Surfaces

Current control-plane decision:

- active runtime truth = `scripts/ensemble.py` + `.notes/` + `.agent/`
- canonical agent/skill/gate metadata = `.agent/agents/`, `.agent/skills/`, `.agent/policies/`
- lowercase canonical extension paths = `.notes/workflows/`, `.notes/events/`, `.notes/meetings/`, `.notes/office/`, `.notes/artifacts/`, `.notes/handoffs/`, `.notes/gates/`
- legacy uppercase aliases remain readable and writable during the transition
- reference/parity surfaces only = `packages/*`, RFC-era `.conitens` material, older roadmap documents

See [docs/adr-0001-control-plane.md](docs/adr-0001-control-plane.md) and [docs/control-plane-compatibility.md](docs/control-plane-compatibility.md).

### CLI Surface

Current CLI entrypoints include:

- `ensemble workflow`
- `ensemble meet`
- `ensemble hooks`
- `ensemble office`
- `ensemble mcp`
- `ensemble telegram`

The classic task lifecycle commands remain part of the Core:

- `ensemble new`
- `ensemble start`
- `ensemble log`
- `ensemble verify`
- `ensemble close`
- `ensemble status`
- `ensemble approve`
- `ensemble questions`

### Config Surface

- `.agent/` is the canonical Conitens configuration surface.
- `.agents/skills/` is the Codex compatibility layer.

#### `.agent/`

Use `.agent/` for:

- workflow contracts
- rules
- agent manifests
- skill manifests
- gate policies
- canonical operational behavior

Important paths:

- [.agent/rules/ensemble-protocol.md](.agent/rules/ensemble-protocol.md)
- [.agent/agents/manager.yaml](.agent/agents/manager.yaml)
- [.agent/skills/task-planner.yaml](.agent/skills/task-planner.yaml)
- [.agent/policies/gates.yaml](.agent/policies/gates.yaml)
- [.agent/workflows/verify-close.md](.agent/workflows/verify-close.md)
- [.agent/workflows/research-build-review.md](.agent/workflows/research-build-review.md)
- [.agent/workflows/incident-triage.md](.agent/workflows/incident-triage.md)
- [.agent/workflows/wf.plan-execute-validate.md](.agent/workflows/wf.plan-execute-validate.md)

#### `.agents/skills/`

Use `.agents/skills/` for Codex-facing skill discovery and compatibility.

Current skills:

- [.agents/skills/conitens-core/SKILL.md](.agents/skills/conitens-core/SKILL.md)
- [.agents/skills/meeting-recorder/SKILL.md](.agents/skills/meeting-recorder/SKILL.md)
- [.agents/skills/office-report/SKILL.md](.agents/skills/office-report/SKILL.md)
- [.agents/skills/mcp-readonly/SKILL.md](.agents/skills/mcp-readonly/SKILL.md)

## Runtime State

`.notes/` is the operational state surface.

It stores both Core task state and Ext operational artifacts.

Important areas:

- `.notes/INBOX/`, `.notes/ACTIVE/`, `.notes/COMPLETED/`
- `.notes/HALTED/`, `.notes/DUMPED/`
- `.notes/JOURNAL/`
- `.notes/events/` with legacy alias `.notes/EVENTS/`
- `.notes/meetings/` with legacy alias `.notes/MEETINGS/`
- `.notes/meetings/summaries/`
- `.notes/context/LATEST_CONTEXT.md`
- `.notes/workflows/`
- `.notes/artifacts/`
- `.notes/handoffs/`
- `.notes/gates/`
- `.notes/office/` with legacy alias `.notes/OFFICE/`

### Event Philosophy

Events are append-only.

Conitens records operational interactions as JSONL so state can be replayed or
summarized later. Events should be treated as a canonical audit trail, while
summaries are derived views.

### Meeting Philosophy

Meeting transcripts are append-only.

- transcript JSONL is canonical
- summaries are derived
- summaries may be regenerated from transcript

This keeps human-readable coordination notes downstream of the machine log.

## Verification And Approval

### Verify Before Close

`verify-before-close` remains a non-negotiable rule.

Conitens must not create a default path that closes code work without passing
through verification. Workflow support does not weaken this rule. It makes the
rule more visible and more automatable.

### Approval Gate

Approval and question flow remain Core safety mechanisms.

Write or execute paths exposed through Ext features must preserve that gate:

- workflow steps that call Core write/exec commands
- hook automation
- future MCP write tools
- Telegram approval forwarding

Remote or indirect channels must not bypass local approval policy.

## Workflow Contracts

Workflow contracts are markdown files with frontmatter-based schema fields.

Current design goals:

- `schema_v` versioning
- explicit inputs
- step-by-step CLI execution
- step result recording with `run_id`
- forward compatibility through warning-and-ignore behavior for unknown fields

Workflow execution keeps the `.agent` registration guard and records results in
`.notes/workflows/` with legacy alias support for `.notes/WORKFLOWS/`.

The current engine supports typed handoff and approval-aware steps while keeping
`verify-before-close` intact.

## Office Reports

Office reports are static operational snapshots.

They are intentionally static-first:

- Markdown output
- HTML output
- no real-time UI required for the base architecture

The report is meant to help answer operational questions such as:

- what is active now
- what is blocked
- whether verify ran
- whether approvals are pending
- which meetings or workflow runs changed most recently
- whether delegated handoffs are blocked
- whether registry metadata is valid

## MCP Status

The current MCP surface is read-only by design and ordered as:

1. resources
2. prompts
3. tools

Safe tools currently focus on inspection:

- `task.list`
- `task.get`
- `locks.list`
- `questions.list`
- `context.get`
- `meetings.list`
- `workflow.runs`
- `handoffs.list`
- `registry.summary`
- `office.snapshot`

Resources and prompts expose workflow definitions, workflow runs, gate records,
office snapshots, blocked-run summaries, approval-request preparation, and
verify checklist generation without promoting write-capable tools first.

The local CLI now exposes these layers for demo and inspection:

- `ensemble mcp resources`
- `ensemble mcp resource-read --uri ...`
- `ensemble mcp prompts`
- `ensemble mcp prompt-get --prompt ... --arguments ...`

Write-capable MCP tools are not part of the current safe default. They require
an explicit approval-gated design.

## Telegram Status

Telegram is a skeleton integration and remains OFF by default.

Current scope is intentionally narrow:

- notification formatting
- approval-request forwarding
- meeting mirroring
- status-oriented UX preparation

Telegram must not directly mutate local files or silently execute write actions.

## Encoding And Platform Notes

Windows console encoding can break nested workflow subprocesses when the Python
CLI emits Unicode. Because of that, workflow subprocess execution now forces a
UTF-8 environment for nested `ensemble.py` calls.

This is an implementation safeguard, not a change in architectural policy.

## SSOT Boundaries

The single source of truth is not "whatever file exists under the repo root."

The intended canonical hierarchy is:

1. machine-generated state in `.notes/`
2. canonical contracts in `.agent/`
3. compatibility skill metadata in `.agents/skills/`
4. human-readable documentation

`.omx/` contains runtime state for OMX tooling, planning, and execution support,
but it is not the canonical Conitens operational state model for task/verify/
meeting/event truth.

## Current Safe Defaults

- Core preserved
- Ext layered on top
- verify-before-close preserved
- append-only events
- append-only meeting transcripts
- summary as derivative output
- MCP read-only
- Telegram OFF by default
- stdlib-first implementation approach
- file-based task state compatibility retained
- `LATEST_CONTEXT.md` written to canonical path with legacy mirror support

## Next Expansion Rule

When Conitens grows further, prefer:

- stronger contracts
- clearer approval boundaries
- richer observability
- safer replayability

Do not prefer:

- hidden automation
- remote write shortcuts
- parallel feature growth without operational clarity
