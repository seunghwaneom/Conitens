# Episode Closure Review Commit Notepad

Date: 2026-07-05
Mode: ultrawork + ultraqa + review-work
Tier: HEAVY

## Scope

Review, patch, verify, commit, and push the minimal episode closure attempt
vertical slice:

- `scripts/ensemble_episode_closure.py`
- `scripts/ensemble.py` CLI wiring for `episode close` and `improvement list/show`
- `tests/test_episode_closure.py`
- Conitens context updates that describe this slice

Do not include unrelated dashboard, GJC adapter, asset, or documentation work in
the closure-slice commit unless explicitly required.

## Gates

- Review lanes must check correctness, security/data boundary, and test adequacy.
- Manual QA must exercise the public CLI surface, not only unit tests.
- Commit only scoped files and preserve other dirty worktree changes.

## Review Findings Fixed

- Removed CLI validation override. Closure status now derives validation only
  from prior `validation.passed` / `validation.failed` events.
- Added public text boundary handling: token/path-like text is redacted before
  event append/projection, and raw transcript/provider scratchpad markers are
  rejected before artifacts or events are written.
- Moved closure bundle and index record into the `task.artifact_added` payload.
  Public `.notes/artifacts/agent-improvement` files are materialized from the
  event payload rather than acting as independent truth.
- Split the closure implementation into model, artifact projection, and closure
  scoring modules to satisfy the 250 pure-LOC gate.
- Split tests into core and CLI/security modules.
- Replaced public closure artifact slugs with opaque episode hashes and removed
  raw episode ids from closure event scope.

## Verification Evidence

- `python -m py_compile scripts/ensemble_episode_model.py
  scripts/ensemble_episode_artifacts.py scripts/ensemble_episode_closure.py
  scripts/ensemble.py tests/test_episode_closure.py
  tests/test_episode_closure_cli_security.py` passed.
- `python -m unittest tests.test_episode_closure
  tests.test_episode_closure_cli_security tests.test_approval_controls
  tests.test_loop_state` passed 39 tests.
- Non-server Forward Bridge regression passed:
  `tests.test_forward_bridge.ForwardBridgeTests.test_operator_runtime_roster_projects_gjc_harness_evidence_without_mutation`.
- Scoped `git diff --check` passed with only existing LF/CRLF warnings.
- Manual CLI QA passed: `episode close ep-manual` produced `blocked` before
  validation, then `closed` after a `validation.passed` event, and
  `improvement list/show` displayed the L0/L1 public artifact.
