# Project Size Cleanup Final Review Matrix

Date: 2026-06-24
Scope: `D:\Google\.Conitens`
Branch/HEAD: `codex/push-local-cleanup-20260624` / `7a8dc27`

## F1 Plan Compliance Audit: PASS

Evidence:
- Baseline RED: `.omx/artifacts/project-size-cleanup/baseline-size.txt`
  records `du -sh . = 2.3G`.
- Candidate manifest: `.omx/artifacts/project-size-cleanup/candidates.tsv`
  includes ignored/untracked cleanup classes and tracked/protected checks.
- Archive/remove receipts:
  `.omx/artifacts/project-size-cleanup/archive-manifest.txt` and
  `.omx/artifacts/project-size-cleanup/removal-receipt.txt`.
- Final GREEN: `.omx/artifacts/project-size-cleanup/final-size-map.txt`
  records `du -sh . = 308M`; `.omx/artifacts/project-size-cleanup/final-proof.txt`
  records `final_bytes=297187071`.

Conclusion: the user-visible deliverable was met; project root size dropped
from 2.3G to 308M while preserving tracked branch state.

## F2 Code Quality / Slop / Programming Review: PASS

Evidence:
- `git diff --name-status` printed no tracked diff.
- `git diff --check` passed after cleanup.
- PowerShell parse check passed:
  - `PARSE_OK .omx/artifacts/project-size-cleanup/run-cleanup.ps1`
  - `PARSE_OK .omx/artifacts/project-size-cleanup/cleanup-codegraph.ps1`
  - `PARSE_OK .omx/artifacts/project-size-cleanup/final-verify.ps1`
- No tracked production `.py`, `.ts`, `.tsx`, `.go`, or `.rs` file was
  modified.
- No tests were added, weakened, skipped, deleted, or made tautological.
- No new dependency was added.

Explicit `remove-ai-slops` coverage:
- No production abstraction, parser, normalization layer, or speculative helper
  was introduced.
- Cleanup scripts are untracked receipt artifacts scoped to archive/remove
  verification and are not shipped product code.
- The implementation preferred deletion/removal of ignored generated bulk over
  adding new layers.

Explicit `programming` coverage:
- The task did not alter tracked Python/TypeScript/Rust/Go source.
- Cleanup scripts guard branch/head, protected paths, tracked paths, archive
  outside-root placement, and archive listing before removal.
- Known parse issue from the first shell quoting attempt was corrected and
  verified with `PSParser`.

## F3 Real Manual QA Matrix: PASS

| Scenario | PASS Observable | Evidence |
| --- | --- | --- |
| Baseline RED captured | `2.3G .` | `.omx/artifacts/project-size-cleanup/baseline-size.txt` |
| Archive root outside project | archive root is `D:\Google\.Conitens_archives\project-size-cleanup-20260624` | `.omx/artifacts/project-size-cleanup/archive-manifest.txt` |
| Archive/list/hash proof | 7 `.tar.gz` archives with SHA256 and list samples | `.omx/artifacts/project-size-cleanup/final-proof.txt` |
| Restore smoke | `restore_file_count=4`, `restore_smoke_removed=true` | `.omx/artifacts/project-size-cleanup/final-proof.txt` |
| Protected runtime paths | all checked paths show `OK` | `.omx/artifacts/project-size-cleanup/protected-after.txt` |
| Worktree preservation | main plus registered nested worktrees still listed | `.omx/artifacts/project-size-cleanup/worktrees-after.txt` |
| Primary cleanup targets absent | `node_modules`, `output`, `.codegraph`, research repos absent | local sanity check output in turn transcript |
| Git health | branch/head unchanged; tracked diff empty; `git diff --check` passed | `.omx/artifacts/project-size-cleanup/final-proof.txt` |

Package tests/build were intentionally not run after cleanup because
`node_modules` was removed as a primary size offender; reinstalling dependencies
inside the repo would undo the cleanup. Restore command source remains available
through `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.

## F4 Scope Fidelity: PASS

Preserved:
- `.git`
- `.notes`
- `.conitens/runtime`
- `.agent`
- `.conitens/personas`
- `.omx/artifacts`, `.omx/state`, `.omx/plans`, `.omx/run`, `.omx/logs`
- `.omx/team` restored from archive after gate review identified the
  preserve-by-default scope guard
- registered worktrees:
  `.claude/worktrees/amazing-hamilton-bf9f87`,
  `.claude/worktrees/magical-roentgen-51a526`, and
  `.tmp/codex-push-spatial-lens`
- tracked `packages/protocol/.omc/state/subagent-tracking.json`

Removed only after archive/guard checks:
- dependency/build cache
- `.omx/tmp*`
- research cloned repos
- generated `output`
- untracked `.omc` caches
- stale `.omo/evidence/*dev-server.{log,pid}`
- `.codegraph` after verifying/stopping the matching codegraph daemon

Conclusion: no tracked product source/docs/config changed; all removals were
ignored/untracked generated, temp, cache, or archived research/output material.
The initial `.omx/team` removal was corrected by restoring it from
`omx-temp-workspaces.tar.gz`; the final protected-path proof now includes it.

## Overall Verdict

PASS. The cleanup satisfies F1-F4, reduces the project root to 308M, preserves
protected project/runtime state, and leaves no tracked diff.
