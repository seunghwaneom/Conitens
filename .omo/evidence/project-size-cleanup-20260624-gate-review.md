# Project Size Cleanup Gate Review

recommendation: APPROVE

## originalIntent

Reduce the abnormal `D:\Google\.Conitens` project size from 2GB+ by archiving
nonessential bulk outside the repo, removing only reviewed generated/cache/temp
material, preserving runtime/git/identity/worktree/team state, and proving the
result with no tracked diff.

## desiredOutcome

- Capture baseline size and cleanup candidates before mutation.
- Archive non-regenerable or evidence-bearing bulk outside the repo at
  `D:\Google\.Conitens_archives\project-size-cleanup-20260624`.
- Remove only ignored/untracked generated, dependency, cache, output, or temp
  paths after path, archive, and git checks.
- Preserve protected project/runtime state, including `.notes`, `.agent`,
  `.conitens/runtime`, `.conitens/personas`, `.omx/artifacts`, `.omx/state`,
  `.omx/plans`, `.omx/run`, `.omx/logs`, registered worktrees, and `.omx/team`.
- Record final size/status proof, archive hashes/listings, restore smoke,
  protected-path proof, script parse proof, and F1-F4 review evidence.
- Leave tracked product source, docs, config, and tests unchanged.

## userOutcomeReview

The prior blocker is resolved in the final artifacts and live workspace state.

- `.omo/evidence/task-restore-omx-team-project-size-cleanup-20260624.txt`
  records `restored .omx/team bytes=24070752 files=1542`.
- Live `.omx/team` exists and independently measures `bytes=24070752 files=1542`.
- `.omx/artifacts/project-size-cleanup/removal-receipt.txt` retains the
  historical removal entry and appends
  `restored .omx\team bytes=24070752 files=1542 label=scope-fidelity-restore`.
- `.omx/artifacts/project-size-cleanup/run-cleanup.ps1` no longer contains a
  `.omx\team` or `.omx/team` target.
- `.omx/artifacts/project-size-cleanup/final-verify.ps1` includes `.omx\team`
  in the protected-path list, and `protected-after.txt` plus `final-proof.txt`
  both record `OK .omx\team`.
- `final-proof.txt` records branch `codex/push-local-cleanup-20260624`, head
  `7a8dc27`, empty tracked diff, `final_bytes=297187071`, `final_files=11288`,
  archive hashes/list samples, restore smoke success, and final verification
  completion.
- `final-size-map.txt` records `du -sh . = 308M`; live pre-report size check
  measured `297198988` bytes. The small delta is later untracked evidence
  artifact churn.
- Live `git diff --name-status`, `git diff --cached --name-status`,
  `git ls-files --deleted`, and `git diff --check` are empty.
- Archive root resolves outside the project root.
- Live archive byte counts and SHA256 hashes match `archive-manifest.txt`; every
  `.tar.gz` listed non-empty with `tar -tf`.
- Primary cleanup targets are absent: root/package `node_modules`, package
  `dist`, selected `tsconfig.tsbuildinfo`, `.omx/tmp*`, research source repos,
  `output`, `.omc`, package `.omc`, `scripts/.omc`, and `.codegraph`.
- Registered worktrees remain listed in `worktrees-after.txt`.
- Package tests/build were intentionally not run after dependency removal;
  restore sources remain present in `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, and package manifests.

## blockers

None.

The previous blocker, `.omx/team` removal despite preserve-by-default scope, is
corrected by restore evidence, live byte/file-count verification, protected-path
proof, and cleanup-script target removal.

## directSlopAndProgrammingPass

`remove-ai-slops` direct pass:

- Tracked diff is empty, so no tracked production code or tests were added,
  weakened, deleted, or replaced with deletion-only/tautological coverage.
- No implementation-mirroring tests, excessive tests, speculative production
  abstractions, parsing layers, normalization layers, or helper extractions were
  introduced.
- Removals were scoped to ignored/untracked dependency/build/cache/temp/output
  artifacts, with archive/receipt proof where needed.

`programming` direct pass:

- No tracked `.py`, `.pyi`, `.rs`, `.ts`, `.tsx`, `.mts`, `.cts`, `.go`, or
  manifest source file was modified.
- Cleanup scripts are untracked evidence artifacts and parse successfully with
  PowerShell scriptblock parsing.
- The scripts enforce branch/head, archive-outside-root, tracked-path, and
  protected-path checks for their active targets; final verification now treats
  `.omx/team` as protected.

Report coverage check:

- `.omo/evidence/project-size-cleanup-20260624-final-review-matrix.md`
  explicitly includes `remove-ai-slops` and `programming` coverage under F2.
- That coverage is supported by the live empty tracked diff, parse checks, and
  absence of test/production source changes.

## checkedArtifactPaths

- `.conitens/context/LATEST_CONTEXT.md`
- `.vibe/context/LATEST_CONTEXT.md`
- `C:/Users/eomsh/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`
- `C:/Users/eomsh/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md`
- `.omo/plans/project-size-cleanup-20260624.md`
- `.omx/state/project-size-cleanup/notepad.md`
- `.omo/evidence/project-size-cleanup-20260624-final-review-matrix.md`
- `.omo/evidence/project-size-cleanup-readonly-audit-hook-verification-20260624.md`
- `.omo/evidence/task-cleanup-project-size-cleanup-20260624.txt`
- `.omo/evidence/task-codegraph-project-size-cleanup-20260624.txt`
- `.omo/evidence/task-10-project-size-cleanup-20260624.txt`
- `.omo/evidence/task-restore-omx-team-project-size-cleanup-20260624.txt`
- `.omx/artifacts/project-size-cleanup/baseline-size.txt`
- `.omx/artifacts/project-size-cleanup/candidates.tsv`
- `.omx/artifacts/project-size-cleanup/planned-actions.txt`
- `.omx/artifacts/project-size-cleanup/package-restore-sources.txt`
- `.omx/artifacts/project-size-cleanup/archive-manifest.txt`
- `.omx/artifacts/project-size-cleanup/removal-receipt.txt`
- `.omx/artifacts/project-size-cleanup/final-proof.txt`
- `.omx/artifacts/project-size-cleanup/final-size-map.txt`
- `.omx/artifacts/project-size-cleanup/protected-after.txt`
- `.omx/artifacts/project-size-cleanup/worktrees-after.txt`
- `.omx/artifacts/project-size-cleanup/run-cleanup.ps1`
- `.omx/artifacts/project-size-cleanup/cleanup-codegraph.ps1`
- `.omx/artifacts/project-size-cleanup/final-verify.ps1`
- `.omx/artifacts/project-size-cleanup/*.list.txt`
- `D:\Google\.Conitens_archives\project-size-cleanup-20260624`

## exactEvidenceGaps

No approval-blocking evidence gaps remain.

The final review matrix has been reconciled to the post-restore outcome:
`final-proof.txt` records `297187071` bytes, `final-size-map.txt` records
`308M`, and live `.omx/team` is restored.
