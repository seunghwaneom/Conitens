# Forward Public Boundary Security Review

Date: 2026-07-10
Reviewer: Codex security rerun
Verdict: PASS
Severity: none

## Scope

- `docs/adr-0004-unified-authority-and-forward-promotion-gate.md`
- `docs/frontend/BRIDGE_BOUNDARY.md`
- `scripts/ensemble_forward.py`
- `scripts/ensemble_forward_bridge.py`
- `scripts/ensemble_loop_repository.py`
- `tests/test_forward_runtime_mode.py`
- `tests/test_forward_bridge_boundary.py`
- `tests/test_forward_live_approval.py`

## What Was Verified

1. Approval list/detail/request/decision/resume route responses.
2. SSE snapshot redaction for pending approvals and latest run/room events.
3. Validator-feedback exposure in summary, inbox, and agents views.
4. Context and run-context payload redaction for workspace paths, outside paths, usernames, and secret-shaped values.
5. Workspace public-path shaping for inside-root, outside-root, traversal, and archived-by fields.

## Verification Evidence

### Focused test suite

`python -m unittest tests.test_forward_bridge_boundary tests.test_forward_runtime_mode tests.test_forward_live_approval`

Latest rerun result: `Ran 31 tests in 32.730s` and `OK`.

Delta-specific rerun: `python -m unittest tests.test_forward_bridge_boundary`

Result: `Ran 3 tests in 0.722s` and `OK`.

### Passing route probes

The following surfaces now return metadata-only approval projections:

- `GET /api/approvals`
- `GET /api/approvals/:id`
- `POST /api/operator/tasks/:id/request-approval`
- `POST /api/approvals/:id/decision`
- `POST /api/approvals/:id/resume` error payload
- `GET /api/events/stream`

Relevant code:

- `scripts/ensemble_forward_bridge.py:3240-3285`
- `scripts/ensemble_forward_bridge.py:3332-3373`
- `scripts/ensemble_forward_bridge.py:3912-3975`

Observed response shape from the live probe:

- `actor` and `reviewer` were normalized to `local-operator`
- `action_payload` was `{}`
- `reviewer_note` was `null`
- secrets from `rationale`, `requested_changes`, `draft_snapshot`, `edited_payload`, and `reviewer_note` were absent
- live `/api/operator/inbox` and `/api/operator/agents` no longer exposed `private-owner`
- live `/api/operator/agents` returned `agent_id` values `['local-operator', 'sample-agent']`

### Passing content/path probes

Relevant code:

- `scripts/ensemble_forward.py:127-151`
- `scripts/ensemble_forward_bridge.py:298-349`
- `scripts/ensemble_forward_bridge.py:3179-3237`

Observed behavior:

- context payloads removed workspace absolute paths, outside Windows paths, `C:\Users\...` usernames, and secret-shaped strings
- workspace query payloads reduced inside-root paths to relative labels
- outside-root, Windows-drive, and UNC-style absolute paths now return `[REDACTED]`
- any relative path containing `..` now returns `[REDACTED]`, including `../private-owner`
- `archived_by` was omitted from public workspace payloads

## Findings

No blocking findings remain in the reviewed scope.

Previously observed username leaks are repaired:

- inbox approval summaries now route actor text through `_public_actor_label(...)` at `scripts/ensemble_forward_bridge.py:2854-2863`
- agent ingestion and comparisons now normalize public identities at `scripts/ensemble_forward_bridge.py:2975-3084`
- boundary regression coverage now uses `actor="local/private-owner"` and asserts the serialized public payload omits `private-owner` at `tests/test_forward_bridge_boundary.py:157-239`

## Residual Notes

- `build_operator_summary_payload` now emits `validation failed` instead of raw validator feedback at `scripts/ensemble_forward_bridge.py:2757-2764`.
- `build_operator_inbox_payload` also emits `validation failed` for validator items at `scripts/ensemble_forward_bridge.py:2870-2888`.
- `build_operator_agents_payload` now uses `validation failed` for validator blockers at `scripts/ensemble_forward_bridge.py:3021-3026`.
- SSE latest event payloads are reduced to `{kind,timestamp,id?}` at `scripts/ensemble_forward_bridge.py:3366-3373`, so transcript/tool/approval payload and summary values are no longer exposed there.

## Final Assessment

The prior approval-payload, validator-feedback, SSE event-detail, context redaction, workspace path, and local-username blockers are closed in the reviewed public-boundary slice. The current scope passes the rerun security review.
