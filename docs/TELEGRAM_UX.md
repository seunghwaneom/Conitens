# Telegram UX Notes

Telegram remains OFF by default.

The goal of this document is to define safe notification and approval-request
UX without turning Telegram into a direct execution channel.

## Allowed Interaction Shapes

- notify
- approval-request
- meeting mirror
- lightweight status lookup

## Suggested Message Formats

### Notification

```text
[Conitens]
Task: TASK-ACTIVE-...
Status: VERIFY_FAIL
Why: import check failed in src/auth.py
Next: run ensemble verify after fix
```

### Approval Request

```text
[Approval Needed]
Gate: G-xxxxxxxxxx
Question: Q-20260311-001
Action: workflow.resume
Prompt: modify existing file src/auth.py
Resume Token: resume:run-...:owner-approval
Action Needed: local owner approval then local resume
```

### Meeting Mirror

```text
[Meeting MTG-20260311-001]
Topic: Investigate flaky verify
Last Message: CODEX at 2026-03-11T01:23:45Z
Recent:
- GEMINI: DECISION: use static office first
- CODEX: ACTION: add workflow explain tests
```

## Read-Only Query UX Drafts

- `/status`
  - show active task count, pending approvals, verify fail count, stale context
- `/runs`
  - show recent workflow runs with status and last failed step
- `/why-blocked`
  - show the most actionable blocked items from office-report logic

## Redaction Points

Apply shared redaction before:

- sending approval prompts
- mirroring meeting text
- forwarding verify failure details
- forwarding workflow stderr excerpts

## Explicit Non-Goals

- no direct local file writes from Telegram
- no direct owner approval finalization from Telegram
- no automatic close, verify, or workflow mutation from Telegram
- no default-on network behavior
- no bypass of `gate_record_v1` / `verify-before-close` flow
