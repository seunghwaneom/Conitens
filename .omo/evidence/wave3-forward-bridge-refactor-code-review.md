# Wave 3 Forward Bridge Refactor — Code Quality Review

- **Goal:** Verify the Wave 3 Forward Bridge boundary refactor against the PRD, test specification, compatibility contract, and current workspace state.
- **Review state:** 2026-07-11, after the latest observed concurrent edits.
- **codeQualityStatus:** `BLOCK`
- **recommendation:** `REQUEST_CHANGES`
- **confidence:** High

## Scope inspected

Production scope:

- `scripts/ensemble_forward_bridge.py`
- `scripts/ensemble_forward_bridge_query.py`
- `scripts/ensemble_forward_bridge_http.py`
- `scripts/ensemble_forward_bridge_commands.py`
- `scripts/ensemble_forward_bridge_stream.py`
- `scripts/ensemble_forward_public_context.py`
- `scripts/ensemble_conversation_read_service.py`
- `scripts/ensemble_agent_patch_service.py`
- `scripts/ensemble_agent_registry.py`

Corresponding architecture, public-context, conversation, patch-command, HTTP, boundary, approval, runtime, and compatibility tests were inspected. The PRD, test specification, task context, notepad, diff/stat, and referenced evidence artifacts were also inspected and treated as untrusted until independently checked.

## Skill-perspective check

The required `omo:programming` and `omo:remove-ai-slops` skills were loaded and applied. The diff violates both perspectives:

- The programming checker reports **68 violations** in the nine reviewed production files, including oversized extracted modules, repeated broad exception handling, a silent exception, a `type: ignore`, generic exceptions, and an unexhaustive variant match.
- The anti-slop pass found a conditional test that can execute no assertions, mocks that verify only delegation while missing the required workspace/audit behavior, duplicated public-shaping helpers, and a refactor that leaves two newly extracted modules as very large responsibility clusters.

The checked-in/recorded “green” evidence claiming no programming violations is not reliable for the current tree; the required checker independently contradicts it.

## Verification evidence

- `python -m py_compile` for all nine reviewed production modules: **PASS**.
- `git diff --check` for tracked scoped changes: **PASS**, with line-ending warnings only. Newly added/untracked modules are not covered by `git diff --check`.
- Focused suite:
  `python -m unittest tests.test_forward_bridge_architecture tests.test_forward_public_context tests.test_conversation_read_service tests.test_forward_patch_commands tests.test_forward_bridge_commands tests.test_forward_bridge_http tests.test_forward_bridge_boundary tests.test_forward_live_approval`
  — **FAIL: 1 failure / 52 tests**.
- Failure: `tests/test_forward_bridge_architecture.py:186-193` proves `build_runs_payload()` materializes `.conitens/runtime/loop_state.sqlite3` in an empty read-only workspace.
- Direct privacy probe: `Authorization: Bearer ...` and `AWS_ACCESS_KEY_ID=...` are returned unchanged by `_public_text`; an absolute `/data/...` path is redacted.
- Direct legacy-compatibility probe: a legacy-only `.notes/40_Comms/.../thread-legacy.md` is returned by detail fallback, but list and search both return zero results.
- Required programming checker: **68 violations in 9 files**.

## Findings

### CRITICAL

None.

### HIGH

#### H1 — A read-only query creates persistent repository state and the focused acceptance suite fails

`build_runs_payload()` eagerly constructs `LoopStateRepository` at `scripts/ensemble_forward_bridge_query.py:99-103`. On an empty workspace this creates `.conitens/runtime/loop_state.sqlite3`. The explicit regression test at `tests/test_forward_bridge_architecture.py:186-193` fails.

This violates query/read boundary ownership, makes GET-style reads mutate the filesystem, and leaves the current tree below its own acceptance gate.

#### H2 — The public-context allowlist leaks common secret-shaped values

`scripts/ensemble_forward_public_context.py:31-42` blocks only a narrow set of secret syntaxes, while `scripts/ensemble_forward_public_context.py:252-269` returns any unmatched string unchanged. Direct probes show these values are exposed verbatim:

- `Authorization: Bearer abcdefghijklmnopqrstuv`
- `AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE`

This violates the PRD requirement that public context expose an explicit safe projection and exclude secret-shaped values. The missing cases are realistic credential formats, not speculative edge cases.

#### H3 — Legacy-only threads disappear from list and search despite the compatibility contract

`ConversationReadService.thread_list()` and `thread_search()` enumerate only `_event_threads()` at `scripts/ensemble_conversation_read_service.py:101-126` and `scripts/ensemble_conversation_read_service.py:146-157`. Only direct detail has an explicit legacy fallback at `scripts/ensemble_forward_bridge_query.py:2706-2712`.

The resulting API is internally inconsistent: a legacy thread can be opened by ID but is absent from both discovery surfaces (`build_threads_payload` at `scripts/ensemble_forward_bridge_query.py:2690-2703` and search at `scripts/ensemble_forward_bridge_query.py:2741-2754`). A direct temporary-workspace probe reproduced this. This does not preserve the specified legacy-only historical thread response.

#### H4 — The common patch decision service discards its workspace and actor boundaries

`decide_agent_patch()` explicitly throws away `workspace`, `reason`, and `actor` at `scripts/ensemble_agent_patch_service.py:23-35`, then calls the legacy global `agent_apply_patch(patch_id)`. That legacy function resolves candidate patches and events through repository-global constants (`scripts/ensemble_agent_registry.py:31-35`, `scripts/ensemble_agent_registry.py:408-434`) and hard-codes the approver as `operator` at line 424.

A Forward server launched for another workspace can therefore approve against the repository-global patch store/event ledger, and a supplied reviewer identity is not represented in the audit event. The new unit test at `tests/test_forward_patch_commands.py:181-190` mocks the legacy function and asserts only `patch_id`, so it positively encodes the lost workspace/actor data instead of detecting it.

#### H5 — The extraction does not achieve a maintainable boundary and contradicts its green evidence

The required programming checker reports:

- `scripts/ensemble_forward_bridge_query.py:1` — 2601 pure LOC.
- `scripts/ensemble_forward_bridge_http.py:1` — 843 pure LOC, roughly 30 repeated broad catches, a silent SSE catch at lines 343-344, a `type: ignore` at line 874, and untyped `object` annotations.
- `scripts/ensemble_forward_bridge_commands.py:1` — 496 pure LOC.
- `scripts/ensemble_conversation_read_service.py:1` — 252 pure LOC.

The monolith is thinner, but query and HTTP remain large dispatcher/god modules. This creates a material maintenance burden and false confidence because recorded evidence says the same checker was green. Registry violations include substantial inherited code and are not attributed wholesale to this refactor; the new leaf modules are the blocker here.

### MEDIUM

#### M1 — The reject test can pass without executing any assertion

`tests/test_forward_patch_commands.py:212-235` places every result assertion behind a source-text check for the string `agent.patch_rejected`. Once that event name appears in the allowlist, the test body performs no assertion and passes regardless of behavior. This is a tautological/implementation-mirroring guard and gives false confidence around the required fail-closed rejection contract.

#### M2 — Public-shaping logic is duplicated across extracted layers

`_public_actor_label` is independently defined in query, commands, and stream (`scripts/ensemble_forward_bridge_query.py:159`, `scripts/ensemble_forward_bridge_commands.py:554`, `scripts/ensemble_forward_bridge_stream.py:28`). `_public_approval_record` is independently defined at query line 2639, commands line 498, and stream line 38. `_derive_workspace_task_ids` is duplicated at query line 693 and commands line 472.

These helpers protect privacy and response-shape compatibility. Multiple implementations can drift across HTTP reads, mutations, and SSE responses. Consolidation should reuse an existing narrowly owned projection helper rather than add another abstraction.

### LOW

#### L1 — Some architecture tests are brittle source/AST constraints

The architecture suite contains useful boundary checks, but callable-existence and source-name assertions primarily mirror implementation structure. Retain only constraints that represent a durable contract and pair them with observable behavior, especially filesystem non-mutation and late-binding behavior.

## Blockers before approval

1. Make read/query construction non-materializing and get the focused 52-test suite fully green.
2. Enforce a genuinely safe public-context projection for bearer credentials, cloud access keys, and equivalent secret-shaped inputs; add behavior tests.
3. Restore consistent legacy-only thread compatibility for list/search/detail, or revise the explicit acceptance contract and tests if discovery is intentionally event-only.
4. Preserve the supplied workspace and actor through patch approval; verify the correct workspace ledger, actor attribution, and approved-before-applied ordering without mocking away the boundary.
5. Reduce the newly extracted query/HTTP/commands responsibility clusters and resolve or explicitly justify the programming checker violations. Replace misleading checker evidence with reproducible current artifacts.
6. Replace the conditional no-assert rejection test with unconditional observable behavior assertions.

## Verdict

**FAIL.** The implementation preserves several compatibility seams and compiles, but it currently fails its focused test gate and has unresolved privacy, compatibility, workspace/audit-boundary, maintainability, and test-quality blockers. Approval is not warranted.
