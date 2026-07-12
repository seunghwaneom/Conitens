# Episode Closure Attempt Staging Manifest

Date: 2026-07-05
Branch: codex/episode-closure-attempt

## Intended Staged Files

- `.conitens/context/LATEST_CONTEXT.md`
- `.conitens/context/findings.md`
- `.conitens/context/progress.md`
- `.conitens/context/task_plan.md`
- `.omo/evidence/episode-closure-attempt-command-log.md`
- `.omo/evidence/episode-closure-attempt-manual-qa.md`
- `.omo/evidence/episode-closure-attempt-review-and-slop-report.md`
- `.omo/evidence/episode-closure-attempt-staging-manifest.md`
- `.omo/notepads/episode-closure-review-commit-20260705.md`
- `scripts/ensemble.py`
- `scripts/ensemble_episode_artifacts.py`
- `scripts/ensemble_episode_closure.py`
- `scripts/ensemble_episode_model.py`
- `tests/test_episode_closure.py`
- `tests/test_episode_closure_cli_security.py`

## Excluded Dirty Files

The worktree contains unrelated dashboard, GJC adapter, generated asset, and previous evidence changes. They are intentionally excluded from this commit.

## Verification Requirement

Before commit, compare this manifest with `git diff --cached --name-status` and update the manifest if the cached file set differs.
