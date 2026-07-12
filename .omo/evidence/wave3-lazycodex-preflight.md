# Wave 3 LazyCodex Executor Preflight

Date: 2026-07-11
Status: ready for implementation only after the parent confirms both Wave 3 plan artifacts exist and RED evidence has been captured

## Scope honored

- Read-only preparation was completed against the Wave 3 context packet, the accepted architecture plan, ADR-0004, the Forward Bridge facade, focused Forward tests, and dashboard consumers.
- No production or test file was edited.
- This receipt is the only file created in this preflight turn. `.omo/evidence/` already exists and is the repository's established evidence workflow.
- Forward remains quarantined and `default_runtime=legacy` remains unchanged.

## Directly verified facts

1. `scripts/ensemble_forward_bridge.py` is 4,237 lines and currently owns query builders, operator mutations, HTTP routing/auth/response handling, and SSE polling/serialization.
2. ADR-0004 explicitly requires `scripts/ensemble_forward_bridge.py` to remain the launch/import compatibility facade while internals move into query, command, HTTP, and stream leaves.
3. The handler directly calls `LoopStateRepository` mutation methods for task/workspace create and update, and directly imports/calls `agent_apply_patch()` for `DELETE /api/approvals/:patch/approve`.
4. Existing query characterization already proves workspace list/detail does not call `update_operator_workspace`, but it does not yet prove a module boundary or write-free behavior for the broader query family.
5. Browser-visible context is not allowlisted. `build_run_state_docs_payload()` and `build_run_context_latest_payload()` sanitize arbitrary rendered/read Markdown, then return it under the existing `{path, content}` envelope.
6. Dashboard consumers render that `content` verbatim:
   - `ForwardContextPanel` renders `runtime_latest.content` and `repo_latest.content`.
   - `ForwardStateDocsPanel` renders every document body.
   - The parser contract requires the current `run_id`, `documents`, `runtime_latest`, `repo_latest`, `path`, and `content` keys.
7. Facade compatibility is test-observable: `tests/test_forward_live_approval.py` patches `ensemble_forward_bridge.build_run_detail_payload`; `tests/test_forward_bridge.py` patches `ensemble_forward_bridge.build_runtime_cli_checks`. Moving handler lookups directly to leaf-module globals would silently bypass these patches.
8. The shared worktree already contains changes to `scripts/ensemble_forward_bridge.py`, `tests/test_forward_bridge.py`, and `tests/test_forward_live_approval.py`; `tests/test_forward_bridge_boundary.py` and ADR-0004 are untracked. Implementation must inspect and preserve those exact working-tree versions before every edit.

## Smallest safe first implementation slice

Extract the read-only run query family into a new additive leaf while preserving facade-owned lookup behavior:

- Add `scripts/ensemble_forward_bridge_query.py` containing `_run_counts()`, `build_runs_payload()`, and `build_run_detail_payload()`.
- Re-export those public functions from `scripts/ensemble_forward_bridge.py` with the same names and keep them in `__all__`.
- Keep HTTP handler calls resolved through the facade globals during this first slice. Do not have the handler call `ensemble_forward_bridge_query.build_run_detail_payload()` directly; the existing facade patch contract must continue to work.
- Add RED characterization proving the new leaf exists, the facade exports are identity-compatible, run list/detail payloads are unchanged, and the query path performs zero repository mutation calls.

Why this slice is first: it is a cohesive read-only seam with low dependency fan-out, exercises the required facade pattern, and does not combine structural extraction with the security-sensitive context projection redesign or command semantics. It establishes the import/re-export technique that later query extractions can repeat.

The allowlisted public-context change should be the next independent RED/green slice, not folded into this move-only extraction. It must preserve the existing payload envelope but generate `content` from an explicit structured-field allowlist. It must not read arbitrary Markdown and then attempt blacklist redaction. The precise field allowlist should be fixed by the test specification; current dashboard code only requires the envelope and string content, not any particular raw Markdown sentence.

## Owned files for the first implementation slice

- New: `scripts/ensemble_forward_bridge_query.py`
- Existing facade: `scripts/ensemble_forward_bridge.py`
- Preferred focused characterization: `tests/test_forward_bridge_boundary.py`

No other production or dashboard file is required for the first slice. Because the two existing files are dirty/untracked, edits must be narrow and based on the live working-tree content, never on `HEAD` replacement.

## Facade compatibility traps

- Preserve every current public import from `ensemble_forward_bridge`, including underscored `_stream_snapshot_payload` while tests still import it.
- Preserve `__all__` names and call signatures exactly.
- Preserve exceptions (`FileNotFoundError`, `ValueError`, `RuntimeError`) and payload key/order-independent shape.
- Preserve facade monkeypatch interception. A leaf import such as `from ...query import build_run_detail_payload` is compatible only while the handler resolves the facade global at call time.
- Avoid circular imports: query leaves may import repositories/services, but must never import the facade.
- Do not move `build_runtime_cli_checks` lookup in the same slice; tests patch the facade binding.
- Do not mix context allowlisting into a mechanical move. Context requires a behavioral RED test that rejects benign-looking raw body lines, secret shapes, and POSIX paths even when blacklist patterns miss them.
- Do not route patch approval through `agent_apply_patch()` from the new command leaf. That shortcut must be replaced by the established approval/command/event service under its own RED test.
- Do not rename routes, response fields, CLI imports, launch functions, auth behavior, body limits, or fixed error status mappings.

## Planned verification matrix

### Slice 1: query extraction

- Scenario: facade and leaf expose compatible run query functions.
  - Invocation: `python -m unittest tests.test_forward_bridge_boundary`
  - Binary observable: exit code 0; new facade/leaf identity and payload-equivalence assertions pass.
  - Capture: `.omo/evidence/wave3-query-extraction-green.txt`
- Scenario: run query builders never mutate repository state.
  - Invocation: `python -m unittest tests.test_forward_bridge_boundary`
  - Binary observable: mutation spies remain at zero and the suite exits 0.
  - Capture: `.omo/evidence/wave3-query-extraction-green.txt`
- Scenario: existing Forward API behavior is preserved.
  - Invocation: `python -m unittest tests.test_forward_bridge_boundary tests.test_forward_bridge tests.test_forward_live_approval tests.test_forward_runtime_mode tests.test_forward_operator_flow`
  - Binary observable: exit code 0 with no new failures; fixed-port cases may be replaced only by the test-spec-approved non-binding handler scenario on this Windows host.
  - Capture: `.omo/evidence/wave3-forward-adjacent-green.txt`
- Scenario: all touched Python modules compile.
  - Invocation: `python -m py_compile scripts/ensemble_forward_bridge.py scripts/ensemble_forward_bridge_query.py tests/test_forward_bridge_boundary.py`
  - Binary observable: exit code 0 and empty stderr.
  - Capture: `.omo/evidence/wave3-python-compile.txt`
- Scenario: scoped diff has no whitespace errors.
  - Invocation: `git diff --check -- scripts/ensemble_forward_bridge.py scripts/ensemble_forward_bridge_query.py tests/test_forward_bridge_boundary.py`
  - Binary observable: exit code 0; no error lines.
  - Capture: `.omo/evidence/wave3-diff-check.txt`

### Later context-allowlist slice

- Scenario: browser context contains only generated allowlisted fields while retaining the current envelope.
  - Invocation: `python -m unittest tests.test_forward_bridge_boundary tests.test_forward_runtime_mode`
  - Binary observable: exit code 0; raw prompt/transcript/stdout/stderr body lines, secret-shaped strings, absolute Windows/POSIX paths, and local usernames are absent; expected public structured fields remain.
  - Capture: `.omo/evidence/wave3-public-context-green.txt`
- Scenario: dashboard parsers remain compatible with the envelope.
  - Invocation: `pnpm.cmd --filter @conitens/dashboard test`
  - Binary observable: exit code 0 with the current dashboard test count or higher.
  - Capture: `.omo/evidence/wave3-dashboard-tests.txt`

## Implementation gate

Do not edit production or tests until the parent explicitly confirms all three conditions:

1. `.omx/plans/prd-wave3-forward-bridge-refactor.md` exists.
2. `.omx/plans/test-spec-wave3-forward-bridge-refactor.md` exists.
3. RED evidence for the selected first slice has been captured and fails for the intended contract reason.

Once confirmed, re-read the Python programming reference, inspect the live dirty diffs for owned files, make the minimum green change, and record every command's raw output at the artifact paths above.
