# Forward Public Boundary Slice Code Review

## Result

- codeQualityStatus: WATCH
- recommendation: APPROVE
- verdict: PASS
- confidence: high
- reviewed scope: `scripts/ensemble_forward.py`, `scripts/ensemble_forward_bridge.py`, `tests/test_forward_runtime_mode.py`, `tests/test_forward_bridge_boundary.py`, `tests/test_forward_live_approval.py`

## Skill Perspective Check

- `remove-ai-slops`: loaded and applied as the overfit/slop lens. The tests are now behavior-focused and adversarial for the public privacy boundary, not deletion-only or tautological. The approval, validator-summary, and SSE tests assert observable public payload contracts rather than mirroring implementation constants beyond the intentional fixed public summary string.
- `programming`: loaded, including `references/python/README.md`, and applied as the Python boundary/type/test-shape lens. The repair stays within the repo's existing dict-heavy style and keeps the change at the public serialization boundary. No new needless abstraction or untyped escape hatch beyond existing local conventions was introduced.

## Prior Major Closure Check

- Exact `archived_by` field leak: closed for workspace list/detail by forcing public `archived_by` to `None` at `scripts/ensemble_forward_bridge.py:349`.
- Local actor tokens in public free text: closed for the tested public boundary by applying `PUBLIC_LOCAL_USERNAME_PATTERNS` at `scripts/ensemble_forward.py:89` to `scripts/ensemble_forward.py:95` and `scripts/ensemble_forward.py:156` to `scripts/ensemble_forward.py:159`.
- Outside absolute path basename leak: closed by returning `[REDACTED]` for absolute workspace paths outside the active workspace at `scripts/ensemble_forward_bridge.py:302` to `scripts/ensemble_forward_bridge.py:307`.
- Relative traversal path leaks: closed for the `path` field by returning `[REDACTED]` for any relative path containing a `..` segment at `scripts/ensemble_forward_bridge.py:313` to `scripts/ensemble_forward_bridge.py:315`.
- Approval public projection: simple and appropriately metadata-only at `scripts/ensemble_forward_bridge.py:3287` to `scripts/ensemble_forward_bridge.py:3302`.
- Validator fixed summaries: live summary/inbox/agent paths now use `validation failed` at `scripts/ensemble_forward_bridge.py:2764` to `scripts/ensemble_forward_bridge.py:2767`, `scripts/ensemble_forward_bridge.py:2886`, and `scripts/ensemble_forward_bridge.py:3029` to `scripts/ensemble_forward_bridge.py:3034`.
- SSE metadata-only projection: simple and appropriate at `scripts/ensemble_forward_bridge.py:3357` to `scripts/ensemble_forward_bridge.py:3373`.

## Findings

### CRITICAL

None.

### HIGH / MAJOR

None.

### MEDIUM / MINOR

1. Workspace list task membership derivation remains N+1.

   Evidence:
   - `build_operator_workspaces_payload` calls `_derive_workspace_task_ids` once per workspace at `scripts/ensemble_forward_bridge.py:1225` to `scripts/ensemble_forward_bridge.py:1233`.
   - `_derive_workspace_task_ids` reloads all operator tasks each time at `scripts/ensemble_forward_bridge.py:963` to `scripts/ensemble_forward_bridge.py:968`.

   This remains a non-blocking performance concern outside the repaired privacy boundary.

### LOW / NIT

None.

## Test Substance Review

- `tests/test_forward_bridge_boundary.py:52` to `tests/test_forward_bridge_boundary.py:90` covers context redaction for workspace paths, Windows/home paths, `username=...`, `local/...`, secrets, and non-ASCII preservation.
- `tests/test_forward_bridge_boundary.py:92` to `tests/test_forward_bridge_boundary.py:170` covers in-workspace path preservation, outside absolute path redaction, username-like outside basename redaction, traversal-only redaction, `../private-owner` relative traversal redaction, `archived_by` omission, sanitized archive note, and no query-time sync writes.
- `tests/test_forward_bridge_boundary.py:167` to `tests/test_forward_bridge_boundary.py:249` covers approval action payload omission, local actor projection, validator fixed summaries, SSE metadata-only events, and secret omission.
- The untracked status of this test file was intentionally ignored per reviewer instruction; this review evaluates its substance, not staging/index state.

## Verification

- `python -B -m unittest tests.test_forward_bridge_boundary` passed: 3 tests.
- Current deletion review confirmed `build_operator_agents_payload` now returns directly to `build_run_detail_payload`; the stale post-return summary block is gone at `scripts/ensemble_forward_bridge.py:3138` to `scripts/ensemble_forward_bridge.py:3144`.
- Current deletion review confirmed `feedback_text-count=0` in `scripts/ensemble_forward_bridge.py`.
- Current delta compile check passed for 2 files: `scripts/ensemble_forward_bridge.py`, `tests/test_forward_bridge_boundary.py`.
- Current delta `git diff --check -- scripts/ensemble_forward_bridge.py tests/test_forward_bridge_boundary.py` exited 0; only LF-to-CRLF warnings were printed.
- Current delta relative-traversal probe passed: `../private-owner`, `safe/../private-owner`, `..`, `../..`, `./../private-owner`, and `..\\private-owner` all returned `[REDACTED]`, while `packages/dashboard` remained public.
- `python -B -m unittest tests.test_forward_live_approval.ForwardLiveApprovalTests.test_oversized_post_body_returns_413` passed after an initial combined-run transient Windows socket abort.
- `python -B -m unittest tests.test_forward_runtime_mode tests.test_forward_bridge_boundary tests.test_forward_live_approval` passed on rerun: 31 tests.
- In-memory compile check passed for 5 files: `scripts/ensemble_forward.py`, `scripts/ensemble_forward_bridge.py`, `tests/test_forward_runtime_mode.py`, `tests/test_forward_bridge_boundary.py`, `tests/test_forward_live_approval.py`.
- `git diff --check -- scripts/ensemble_forward.py scripts/ensemble_forward_bridge.py tests/test_forward_runtime_mode.py tests/test_forward_bridge_boundary.py tests/test_forward_live_approval.py` exited 0; only LF-to-CRLF warnings were printed.
- Custom public-boundary probe passed: no `private-owner` or `local/private-owner` appeared in serialized public workspace list/detail payloads; outside absolute paths, username-like outside basename paths, and traversal-only paths returned `[REDACTED]`; archive note returned `archived by [REDACTED]`.

## Blockers

None.
