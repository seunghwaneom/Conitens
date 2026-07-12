recommendation: REJECT

# Episode Closure Attempt Gate Review

## originalIntent

Approve only the minimum episode closure attempt commit for commit/push. The
expected slice is `episode close <episode_id>` plus L0/L1 `improvement
list/show`, with the event log remaining authoritative, `.notes` outputs
replayable from `task.artifact_added`, no CLI validation bypass, safe public
text, 250 pure LOC compliance, and tests covering closed/blocked/needs_review,
path safety, redaction, and CLI behavior.

## desiredOutcome

The user should receive a commit-ready slice that can be staged and pushed
without unrelated dashboard/GJC/assets/docs changes, with review evidence strong
enough to prove the closure artifacts are derived projections and public-safe.

## userOutcomeReview

The closure behavior largely matches the requested user-visible outcome:
targeted tests pass, `close_episode()` appends `task.artifact_added` before
materializing projections, validation is derived from prior
`validation.passed` / `validation.failed` events, no CLI validation-pass flag is
present, and public text redaction/raw-marker rejection are covered.

The slice is not gate-approved because the review/evidence and commit-scope
conditions required for final approval are still not satisfied, and the direct
programming/slop pass found an unresolved production escape hatch.

## blockers

1. Missing required post-fix code-review artifact with explicit
   `omo:programming`, `omo:remove-ai-slops`, and overfit/slop coverage.
   Search across `.omo` and `.conitens` found only the notepad summary and
   unrelated older gate/code-review artifacts. The final-gate contract requires
   rejecting when this report coverage is absent, missing, or unsupported.

2. Unresolved programming/slop issue in production code:
   `scripts/ensemble_episode_artifacts.py` imports `typing.cast` at line 9 and
   uses `cast(...)` at lines 132-133 for `ClosureStatus` and `RiskLevel`.
   The loaded `omo:programming` criteria ban `cast()` as a type escape hatch,
   and the anti-slop pass treats unresolved escape hatches as maintenance debt.

3. Commit scope is not proven. `git diff --cached --name-status` is empty, while
   `git status --short` shows many unrelated tracked/untracked dirty files from
   dashboard, GJC/protocol/bridge, docs, assets, and prior evidence work. For a
   "scope only episode closure attempt commit" gate, approval requires either a
   staged scoped diff or an explicit staged-file manifest proving unrelated
   dirty state will be excluded.

4. Leader evidence is summarized but not backed by the requested artifacts.
   `.omo/notepads/episode-closure-review-commit-20260705.md` lists py_compile,
   tests, diff check, and manual CLI QA, but there are no corresponding
   closure-specific command-log artifacts or manual QA matrix under
   `.omo/evidence/`. The final-gate prompt requires artifact inspection rather
   than trusting prose summaries.

## checked artifact paths

- `.conitens/context/LATEST_CONTEXT.md`
- `.vibe/context/LATEST_CONTEXT.md`
- `.omo/notepads/episode-closure-review-commit-20260705.md`
- `scripts/ensemble.py`
- `scripts/ensemble_episode_model.py`
- `scripts/ensemble_episode_artifacts.py`
- `scripts/ensemble_episode_closure.py`
- `tests/test_episode_closure.py`
- `tests/test_episode_closure_cli_security.py`
- `tests/test_forward_bridge.py`
- `.omo/evidence/` search results for closure/code-review/gate evidence

## verificationPerformed

- `python -B -m py_compile scripts/ensemble_episode_model.py scripts/ensemble_episode_artifacts.py scripts/ensemble_episode_closure.py scripts/ensemble.py tests/test_episode_closure.py tests/test_episode_closure_cli_security.py`
  passed.
- `python -B -m unittest discover -s tests -p "test_episode_closure*.py" -v`
  passed 12/12.
- `python -B -m unittest discover -s tests -p "test_approval_controls.py" -v`
  passed 10/10.
- `python -B -m unittest discover -s tests -p "test_loop_state.py" -v`
  passed 16/16.
- `python -B -m unittest discover -s tests -p "test_forward_bridge.py" -k "operator_runtime_roster_projects_gjc_harness_evidence_without_mutation" -v`
  passed 1/1.
- `git diff --check -- ...` on the relevant tracked paths passed with only LF
  to CRLF warnings.
- Pure LOC counts confirmed: model 43, artifacts 242, closure 250, tests 145
  and 213.

## exactEvidenceGaps

- No closure-specific code-review report artifact with required skill
  perspective and overfit/slop coverage was found.
- No closure-specific manual QA matrix artifact was found.
- No closure-specific persisted command-output artifacts were found for the
  leader's py_compile/test/diff-check claims.
- No staged scoped diff exists for the commit/push gate.
