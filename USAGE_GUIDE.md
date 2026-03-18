# Conitens Usage Guide

This guide focuses on day-to-day operator usage.

For canonical architecture, see [CONITENS.md](CONITENS.md).

## 1. Create And Finish A Task

```bash
ensemble init-owner
ensemble new --mode GCC --case MODIFY --title "Refactor auth module"
ensemble start
ensemble log --done "Updated auth flow" --change "src/auth.py" --next "Run verify"
ensemble verify --files src/auth.py
ensemble close
```

Notes:

- `verify` is expected before `close`
- `close` remains blocked when verify is missing or failed

## 2. Inspect Current State

```bash
ensemble status
ensemble status --questions
ensemble status --locks
ensemble questions list
```

Use these when you need to know:

- what is active
- whether approval is pending
- whether locks exist
- whether verify ran

## 3. Record Meetings

```bash
ensemble meet start --topic "Investigate flaky verify"
ensemble meet say --sender GEMINI --text "DECISION: use static report first"
ensemble meet say --sender CODEX --kind action_item --text "ACTION: add workflow explain tests"
ensemble meet end --summary-mode decisions
ensemble meet list
```

Rules:

- transcripts are append-only
- summaries are derived artifacts
- meeting data lives under `.notes/meetings/` with legacy alias support for `.notes/MEETINGS/`

## 4. Run Workflow Contracts

Explain a workflow without executing it:

```bash
ensemble workflow explain --workflow verify-close --set task_id=TASK-ACTIVE-... --set files=src/auth.py
```

Dry-run a workflow:

```bash
ensemble workflow run --workflow verify-close --set task_id=TASK-ACTIVE-... --set files=src/auth.py --dry-run
```

Run a workflow:

```bash
ensemble workflow run --workflow verify-close --set task_id=TASK-ACTIVE-... --set files=src/auth.py
```

Resume an approval-paused workflow:

```bash
ensemble approve --latest
ensemble workflow resume --run run-YYYYMMDD-HHMMSS-...
```

Rules:

- workflows are loaded from `.agent/workflows/`
- unknown contract fields warn and are ignored
- required fields and template inputs are validated before execution
- approval steps pause the run until the owner confirms and the run is resumed
- agent steps create manager-owned delegated records first and typed handoff artifacts only when ownership boundaries change
- gate records are written under `.notes/gates/` with legacy alias support

## 5. Generate Office Reports

```bash
ensemble office --format md
ensemble office --format html
```

Office reports help answer:

- what is active or blocked
- whether approvals are pending
- whether verify failed
- which meetings are stale
- which workflow run failed most recently

## 6. Install Local Hooks

```bash
ensemble hooks install
ensemble hooks install --configure-git
```

Hook behavior:

- pre-commit: staged-only checks
- post-commit: context refresh
- commit-msg: inject active task id when missing

## 7. Use MCP Read-Only Tools

List tools:

```bash
ensemble mcp tools
ensemble mcp resources
ensemble mcp prompts
```

MCP also exposes resources and prompts before tools at the protocol level.

Call a tool:

```bash
ensemble mcp call --tool task.list
ensemble mcp call --tool context.get
```

Current MCP scope is intentionally read-only.

Additional read-only inspection tools:

- `workflow.runs`
- `handoffs.list`
- `registry.summary`
- `office.snapshot`

Prompt rendering example:

```bash
ensemble mcp prompt-get --prompt workflow.blocked-summary --arguments "{}"
```

Feature-flagged parallel workflow:

```bash
ensemble workflow run --workflow wf.parallel-workcell --set task_id=TASK-... --set parallel_feature_flag=true
```

## 8. Telegram Skeleton

```bash
ensemble telegram status
ensemble telegram notify --text "verify failed"
ensemble telegram approval-request --text "Owner approval needed"
```

Rules:

- Telegram stays OFF by default
- it is notification-oriented only
- it must not bypass local approval policy

## 9. Directory Use

- `.agent/`: canonical rules and workflows
- `.agent/agents/`: canonical agent manifests
- `.agent/skills/`: canonical skill manifests
- `.agent/policies/`: gate policy metadata
- `.agents/skills/`: Codex compatibility skills
- `.notes/`: task state, events, meetings, office reports, context
- `.notes/workflows`, `.notes/events`, `.notes/meetings`, `.notes/office`, `.notes/artifacts`, `.notes/handoffs`, `.notes/gates`: lowercase canonical extension paths
- `.vibe/`: version and compatibility metadata

## 10. Document Roles

- [AGENTS.md](AGENTS.md): agent operating rules
- [README.md](README.md): intro and quick start
- [USAGE_GUIDE.md](USAGE_GUIDE.md): practical operator usage
- [docs/OPERATIONS_LAYER.md](docs/OPERATIONS_LAYER.md): Core/Ext overview
- [CONITENS.md](CONITENS.md): canonical architecture and state meaning
