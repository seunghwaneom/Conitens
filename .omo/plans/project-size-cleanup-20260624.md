# Project Size Cleanup 20260624

## TL;DR
> Summary:      Archive nonessential bulk outside `D:/Google/.Conitens`, then remove only verified regenerable or archived artifacts from the repo root while preserving runtime, identity, receipt, git, and worktree state. Expected reclaim is roughly 1.9 GB from `node_modules`, `.omx/tmp*`, research clones, `output`, `.codegraph`, build outputs, and small stale logs, with nested git worktrees protected by default.
> Deliverables:
> - Candidate manifest with size, git classification, archive action, and restore path
> - Archives under `D:/Google/.Conitens_archives/project-size-cleanup-20260624`
> - Cleanup receipts under `.omx/artifacts/project-size-cleanup/`
> - Agent evidence under `.omo/evidence/task-*-project-size-cleanup-20260624.*`
> - Final size/status proof showing same branch and no tracked diff
> Effort:       Medium
> Risk:         High - destructive filesystem cleanup across ignored runtime, evidence, cache, dependency, and nested worktree surfaces

## Scope
### Must have
- Preserve `.git/`, current branch `codex/push-local-cleanup-20260624`, current HEAD `7a8dc27`, and all tracked files.
- Preserve tracked source/docs/config, including `packages/`, `scripts/`, `docs/`, `tests/`, root docs/config, `.vibe/`, `.agents/`, `.agent/`, and `.conitens/personas/`.
- Preserve `.notes/`, `.conitens/runtime/`, `.agent/`, persona identity files, and all task receipt surfaces under `.omx/artifacts/`, `.omx/state/`, `.omx/plans/`, `.omx/run/`, `.omx/notepad.md`, and `.omx/logs/`.
- Archive outside the repo root at `D:/Google/.Conitens_archives/project-size-cleanup-20260624` before deleting any non-regenerable candidate.
- Remove only after path containment, protected-path, git classification, archive listing, and restore/hash checks pass.
- Candidate classes:
  - Archive then remove: `RESEARCH/agent-systems-comparison-2026-06-06/sources/repos/`, `output/`.
  - Archive then remove or remove as regenerable after manifest: root `node_modules/`, `packages/*/node_modules/`, `packages/*/dist/`, `packages/*/*.tsbuildinfo`, `.codegraph/`, `.omc/`, `packages/*/.omc/`, `scripts/.omc/`.
  - Archive/copy with junction-safe handling then remove: `.omx/tmp`, `.omx/tmp-pr15`, `.omx/tmp-pr17`, `.omx/tmp-playwright`.
  - Preserve by default: `.claude/worktrees/*`, `.tmp/codex-push-spatial-lens`, `.omx/team/*`.
  - Optional stale cleanup only after process checks: untracked `.omo/evidence/*dev-server.log`, `.omo/evidence/*dev-server.pid`, `.omo/evidence/task-7-dev-server.log`, `.omo/evidence/task-7-dev-server.pid`.
- Record before/after size, file count, archive hash, and removal receipt for every cleaned path.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not edit product source, docs, config, identity, runtime, or tracked files.
- Do not delete `.notes/` just because it is ignored; it is runtime projection state.
- Do not delete `.omx/` as a whole; only `.omx/tmp*` is in default cleanup scope.
- Do not delete `.claude/worktrees/*` or `.tmp/codex-push-spatial-lens` with `Remove-Item`; they are registered git worktrees.
- Do not use `Compress-Archive` for full-tree preservation because Microsoft documents hidden-file omission and a 2 GB per-file ZIP API limit.
- Do not place archives under `D:/Google/.Conitens`; in-root archives would not reduce project size.
- Do not run `git reset`, `git checkout --`, `git clean`, repo-wide formatters, or `.git` maintenance.
- Do not commit cleanup artifacts by default; preserving current PR branch state means no tracked diff unless the caller separately asks to commit this plan.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + PowerShell/git/tar/robocopy checks. Product tests/builds are not required after dependency removal because reinstalling `node_modules` inside the repo would undo the size cleanup; run only external install smoke if disk/time permits.
- QA policy: every task has agent-executed scenarios
- Evidence: `.omo/evidence/task-<N>-project-size-cleanup-20260624.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Baseline inventory and cleanup manifest
- Task 2: Protected-path, worktree, and reparse-point gates
- Task 3: Archive root, receipt structure, and dry-run copy/archive gates

Wave 2 (after Wave 1):
- Task 4: depends [1, 2, 3] - dependency and build-output archive/removal
- Task 5: depends [1, 2, 3] - `.omx/tmp*` archive/removal with receipt preservation
- Task 6: depends [1, 2, 3] - research checkout archive/removal
- Task 7: depends [1, 2, 3] - generated output and stale dev-log archive/removal
- Task 8: depends [1, 2, 3] - regenerable tool cache archive/removal
- Task 9: depends [1, 2, 3] - nested worktree preservation audit

Wave 3 (after Wave 2):
- Task 10: depends [4, 5, 6, 7, 8, 9] - final size, git, runtime, and restore verification

Critical path: Task 1 -> Task 3 -> Task 4 -> Task 10

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1    | none       | 4, 5, 6, 7, 8, 9, 10 | 2, 3 |
| 2    | none       | 4, 5, 6, 7, 8, 9, 10 | 1, 3 |
| 3    | none       | 4, 5, 6, 7, 8, 10 | 1, 2 |
| 4    | 1, 2, 3    | 10 | 5, 6, 7, 8, 9 |
| 5    | 1, 2, 3    | 10 | 4, 6, 7, 8, 9 |
| 6    | 1, 2, 3    | 10 | 4, 5, 7, 8, 9 |
| 7    | 1, 2, 3    | 10 | 4, 5, 6, 8, 9 |
| 8    | 1, 2, 3    | 10 | 4, 5, 6, 7, 9 |
| 9    | 1, 2, 3    | 10 | 4, 5, 6, 7, 8 |
| 10   | 4, 5, 6, 7, 8, 9 | final | none |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Baseline Inventory And Cleanup Manifest

  What to do: Capture the current branch, HEAD, worktree list, tracked status, top-level sizes, largest files, ignored/untracked classifications, and the exact candidate list. Write receipts to `.omx/artifacts/project-size-cleanup/baseline-size.txt`, `.omx/artifacts/project-size-cleanup/candidates.tsv`, and `.omo/evidence/task-1-project-size-cleanup-20260624.txt`.
  Must NOT do: Do not move, remove, archive, or edit any candidate in this task.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [4, 5, 6, 7, 8, 9, 10] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:16` - baseline size map is required before cleanup.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:28` - baseline receipt path is `.omx/artifacts/project-size-cleanup/baseline-size.txt`.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:55` - `node_modules` baseline is about 942.16 MiB.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:56` - `.omx` is mixed; only temp payloads are default removable.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:57` - research cloned repos are archive candidates.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:61` - `output` is generated evidence and should be archived before removal.
  - Pattern:  `.gitignore:1` - root `node_modules/` is ignored.
  - Pattern:  `.gitignore:2` - `dist/` is ignored.
  - Pattern:  `.gitignore:3` - `*.tsbuildinfo` is ignored.
  - Pattern:  `.gitignore:14` - `RESEARCH/*/sources/repos/` is ignored.
  - Pattern:  `.git/info/exclude:8` - `output/` is locally excluded.
  - External: `https://learn.microsoft.com/en-us/windows/tar/` - built-in Windows tar can create/list/extract archives.

  Acceptance criteria (agent-executable only):
  - [ ] `powershell -NoProfile -Command "git -C 'D:/Google/.Conitens' rev-parse --abbrev-ref HEAD"` returns `codex/push-local-cleanup-20260624`.
  - [ ] `powershell -NoProfile -Command "git -C 'D:/Google/.Conitens' rev-parse --short HEAD"` returns `7a8dc27`.
  - [ ] `.omx/artifacts/project-size-cleanup/candidates.tsv` exists and contains rows for `node_modules`, `.omx/tmp`, `.omx/tmp-pr15`, `.omx/tmp-pr17`, `.omx/tmp-playwright`, `RESEARCH/agent-systems-comparison-2026-06-06/sources/repos`, `output`, `.codegraph`, and package `dist`/`node_modules` paths.
  - [ ] `.omx/artifacts/project-size-cleanup/candidates.tsv` has columns `relative_path`, `absolute_path`, `bytes`, `files`, `git_class`, `action`, `archive_name`, `restore_command`, and `protected`.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: baseline manifest generated
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; New-Item -ItemType Directory -Force -Path $receipt | Out-Null; git -C $root status --short --branch | Set-Content -LiteralPath (Join-Path $receipt 'baseline-size.txt'); git -C $root worktree list | Add-Content -LiteralPath (Join-Path $receipt 'baseline-size.txt'); Get-ChildItem -LiteralPath $root -Force -Directory | ForEach-Object { $files=Get-ChildItem -LiteralPath $_.FullName -Force -Recurse -File -ErrorAction SilentlyContinue; [pscustomobject]@{name=$_.Name; mb=[math]::Round((($files|Measure-Object Length -Sum).Sum)/1MB,2); files=($files|Measure-Object).Count; path=$_.FullName} } | Sort-Object mb -Descending | Format-Table -AutoSize | Out-String | Add-Content -LiteralPath (Join-Path $receipt 'baseline-size.txt'); 'relative_path`tabsolute_path`tbytes`tfiles`tgit_class`taction`tarchive_name`trestore_command`tprotected' | Set-Content -LiteralPath (Join-Path $receipt 'candidates.tsv')"
    Expected: `.omx/artifacts/project-size-cleanup/baseline-size.txt` and `.omx/artifacts/project-size-cleanup/candidates.tsv` exist; command exits 0.
    Evidence: .omo/evidence/task-1-project-size-cleanup-20260624.txt

  Scenario: branch mismatch fails manifest gate
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$branch=git -C 'D:/Google/.Conitens' rev-parse --abbrev-ref HEAD; if ($branch -ne 'codex/push-local-cleanup-20260624') { exit 22 }; $head=git -C 'D:/Google/.Conitens' rev-parse --short HEAD; if ($head -ne '7a8dc27') { exit 23 }; 'branch and head match expected cleanup baseline'"
    Expected: exit code 0 and output contains `branch and head match expected cleanup baseline`; any other branch/head exits nonzero before cleanup.
    Evidence: .omo/evidence/task-1-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): record project size baseline` | Files: [`.omx/artifacts/project-size-cleanup/baseline-size.txt`, `.omx/artifacts/project-size-cleanup/candidates.tsv`, `.omo/evidence/task-1-project-size-cleanup-20260624.txt`]

- [ ] 2. Protected Path, Worktree, And Reparse-Point Gates

  What to do: Write a hard denylist and verify no cleanup candidate overlaps protected paths. Record `git worktree list`, per-worktree status, and reparse points under `.omx/artifacts/project-size-cleanup/protected-paths.txt`, `worktrees.txt`, and `reparsepoints.txt`.
  Must NOT do: Do not remove `.claude/worktrees/*`, `.tmp/codex-push-spatial-lens`, `.notes/`, `.omx/artifacts/`, `.omx/state/`, `.omx/plans/`, `.omx/logs/`, `.omx/run/`, `.conitens/runtime/`, `.agent/`, `.conitens/personas/`, `.git/`, or any tracked file.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [4, 5, 6, 7, 8, 9, 10] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `AGENTS.md:11` - current runtime truth includes `scripts/ensemble.py`.
  - Pattern:  `AGENTS.md:12` - current runtime truth includes `.notes/` and `.agent/`.
  - Pattern:  `AGENTS.md:13` - event log is the sole commit point.
  - Pattern:  `AGENTS.md:15` - `.notes/` files are projections and should not be written directly.
  - Pattern:  `AGENTS.md:23` - `.agent/` is canonical config.
  - Pattern:  `AGENTS.md:26` - cleanup must be scoped, local, reversible.
  - Pattern:  `AGENTS.md:33` - persona identity core must not be auto-edited.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:22` - explicit no-mutate list for `.git`, `.notes`, `.omx` receipts, `.conitens/runtime`, `.agent`, persona identity, tracked source/docs.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:93` - `.claude/worktrees/amazing-hamilton-bf9f87` is a registered worktree.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:94` - `.claude/worktrees/magical-roentgen-51a526` is a registered worktree.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:95` - `.tmp/codex-push-spatial-lens` is a registered worktree.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:139` - registered worktrees must not be deleted with `Remove-Item`.
  - External: `https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/robocopy` - `/xj` excludes junction points and `/l` lists only.

  Acceptance criteria (agent-executable only):
  - [ ] `.omx/artifacts/project-size-cleanup/protected-paths.txt` lists every protected path and every registered worktree.
  - [ ] `.omx/artifacts/project-size-cleanup/reparsepoints.txt` lists `.omx/tmp/Program-reparsepoint-backup` if present.
  - [ ] No candidate row marked `action=remove` has `protected=true`.
  - [ ] `git worktree list` before cleanup includes the main worktree at `D:/Google/.Conitens`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: protected path gate passes current candidates
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Resolve-Path 'D:/Google/.Conitens').Path; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; New-Item -ItemType Directory -Force -Path $receipt | Out-Null; $protected=@('.git','.notes','.agent','.conitens/runtime','.conitens/personas','.omx/artifacts','.omx/state','.omx/plans','.omx/run','.omx/logs','.omx/notepad.md','.claude/worktrees','.tmp/codex-push-spatial-lens'); $protected | Set-Content -LiteralPath (Join-Path $receipt 'protected-paths.txt'); git -C $root worktree list | Set-Content -LiteralPath (Join-Path $receipt 'worktrees.txt'); Get-ChildItem -LiteralPath $root -Force -Recurse -Attributes ReparsePoint -ErrorAction SilentlyContinue | Select-Object FullName,Attributes,LinkType,Target | Format-List | Out-String | Set-Content -LiteralPath (Join-Path $receipt 'reparsepoints.txt'); $candidates=@('node_modules','.omx/tmp','.omx/tmp-pr15','.omx/tmp-pr17','.omx/tmp-playwright','RESEARCH/agent-systems-comparison-2026-06-06/sources/repos','output','.codegraph','packages/command-center/dist','packages/dashboard/dist'); foreach($c in $candidates){ $abs=(Join-Path $root $c); foreach($p in $protected){ $pabs=(Join-Path $root $p); if($abs -eq $pabs -or $abs.StartsWith($pabs + [IO.Path]::DirectorySeparatorChar)){ throw \"candidate overlaps protected path: $c -> $p\" } } }; 'protected path gate passed'"
    Expected: exit code 0 and output contains `protected path gate passed`.
    Evidence: .omo/evidence/task-2-project-size-cleanup-20260624.txt

  Scenario: protected path gate rejects `.notes`
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Resolve-Path 'D:/Google/.Conitens').Path; $protected=@('.notes'); $candidate='.notes'; $abs=Join-Path $root $candidate; foreach($p in $protected){ $pabs=Join-Path $root $p; if($abs -eq $pabs -or $abs.StartsWith($pabs + [IO.Path]::DirectorySeparatorChar)){ 'REJECTED protected path'; exit 0 } }; exit 42"
    Expected: exit code 0 and output contains `REJECTED protected path`.
    Evidence: .omo/evidence/task-2-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): guard protected runtime paths` | Files: [`.omx/artifacts/project-size-cleanup/protected-paths.txt`, `.omx/artifacts/project-size-cleanup/worktrees.txt`, `.omx/artifacts/project-size-cleanup/reparsepoints.txt`]

- [ ] 3. Archive Root, Receipt Structure, And Dry-Run Gates

  What to do: Create `D:/Google/.Conitens_archives/project-size-cleanup-20260624` outside the repo root and create a staging layout for archives, extracted restore checks, logs, and manifests. Prove the archive root is outside the project and that archive commands can list/extract before any cleanup task deletes sources.
  Must NOT do: Do not create archives under `D:/Google/.Conitens`; do not delete source paths in this task.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [4, 5, 6, 7, 8, 10] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:17` - cleanup should archive to `D:\Google\.Conitens_archives\project-size-cleanup-20260624`.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:24` - archives must be outside the project root.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:30` - archive receipt path is `.omx/artifacts/project-size-cleanup/archive-manifest.txt`.
  - External: `https://learn.microsoft.com/en-us/windows/tar/` - Windows tar supports creating, listing, and extracting archives.
  - External: `https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.archive/compress-archive?view=powershell-7.6` - `Compress-Archive` ignores hidden files/folders and has a 2 GB API file limit.
  - External: `https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash?view=powershell-7.6` - `Get-FileHash` computes SHA256 content hashes.

  Acceptance criteria (agent-executable only):
  - [ ] `D:/Google/.Conitens_archives/project-size-cleanup-20260624` exists and resolves outside `D:/Google/.Conitens`.
  - [ ] `.omx/artifacts/project-size-cleanup/archive-manifest.txt` exists.
  - [ ] A small dry-run archive can be created under the archive root, listed with `tar -tf`, extracted to `_restore-smoke`, hashed with `Get-FileHash`, and then removed from staging.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: archive root and tar smoke pass
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Resolve-Path 'D:/Google/.Conitens').Path; $archive='D:/Google/.Conitens_archives/project-size-cleanup-20260624'; $archiveFull=(New-Item -ItemType Directory -Force -Path $archive).FullName; if($archiveFull.StartsWith($root + [IO.Path]::DirectorySeparatorChar)){ throw 'archive root is inside project' }; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; New-Item -ItemType Directory -Force -Path $receipt | Out-Null; 'archive root: '+$archiveFull | Set-Content -LiteralPath (Join-Path $receipt 'archive-manifest.txt'); $smokeDir=Join-Path $archiveFull '_smoke_source'; New-Item -ItemType Directory -Force -Path $smokeDir | Out-Null; 'ok' | Set-Content -LiteralPath (Join-Path $smokeDir 'smoke.txt'); tar -czf (Join-Path $archiveFull '_smoke.tar.gz') -C $smokeDir smoke.txt; tar -tf (Join-Path $archiveFull '_smoke.tar.gz') | Tee-Object -FilePath (Join-Path $receipt 'archive-tar-smoke.txt'); $restore=Join-Path $archiveFull '_restore-smoke'; New-Item -ItemType Directory -Force -Path $restore | Out-Null; tar -xzf (Join-Path $archiveFull '_smoke.tar.gz') -C $restore; if((Get-FileHash -LiteralPath (Join-Path $smokeDir 'smoke.txt')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $restore 'smoke.txt')).Hash){ throw 'hash mismatch' }; Remove-Item -LiteralPath $smokeDir,$restore,(Join-Path $archiveFull '_smoke.tar.gz') -Recurse -Force; 'archive smoke passed'"
    Expected: exit code 0 and output contains `archive smoke passed`.
    Evidence: .omo/evidence/task-3-project-size-cleanup-20260624.txt

  Scenario: in-root archive path is rejected
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Resolve-Path 'D:/Google/.Conitens').Path; $bad=(Join-Path $root 'archive-inside-root'); if($bad.StartsWith($root + [IO.Path]::DirectorySeparatorChar)){ 'REJECTED in-root archive'; exit 0 }; exit 43"
    Expected: exit code 0 and output contains `REJECTED in-root archive`.
    Evidence: .omo/evidence/task-3-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): prepare external archive receipts` | Files: [`D:/Google/.Conitens_archives/project-size-cleanup-20260624`, `.omx/artifacts/project-size-cleanup/archive-manifest.txt`]

- [ ] 4. Dependency And Build-Output Archive/Removal

  What to do: Archive and remove regenerable JavaScript dependency/build artifacts: `node_modules/`, `packages/*/node_modules/`, `packages/*/dist/`, and `packages/*/*.tsbuildinfo`. Verify every target is ignored or untracked and not tracked before removal. Update `archive-manifest.txt` and `removal-receipt.txt`.
  Must NOT do: Do not remove `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `packages/*/src`, `packages/*/tests`, or any tracked asset/doc/source.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [10] | Blocked by: [1, 2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.gitignore:1` - `node_modules/` is ignored.
  - Pattern:  `.gitignore:2` - `dist/` is ignored.
  - Pattern:  `.gitignore:3` - `*.tsbuildinfo` is ignored.
  - Pattern:  `package.json:21` - package manager is `pnpm@9.15.0`.
  - Pattern:  `package.json:22` - workspace packages are under `packages/*`.
  - Pattern:  `package.json:77` - root test command is `pnpm -r test` after reinstall.
  - Pattern:  `package.json:78` - root build command is `pnpm -r build` after reinstall.
  - Pattern:  `packages/dashboard/package.json:8` - dashboard build regenerates dashboard `dist`.
  - Pattern:  `packages/dashboard/package.json:10` - dashboard tests require dependencies.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:55` - root `node_modules` is the largest safe regenerable target.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:79` - `node_modules` is in the remove-regenerable class.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:80` - package `node_modules` are in the remove-regenerable class.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:81` - package `dist` directories are in the remove-regenerable class.
  - External: `https://learn.microsoft.com/en-us/windows/tar/` - use `tar -czf` and `tar -tf` for archive/create/list.

  Acceptance criteria (agent-executable only):
  - [ ] `git -C D:/Google/.Conitens ls-files --error-unmatch node_modules` fails before removal.
  - [ ] `D:/Google/.Conitens_archives/project-size-cleanup-20260624/dependencies-build-cache.tar.gz` exists and `tar -tf` lists at least one archived dependency/build path.
  - [ ] `node_modules/`, existing `packages/*/node_modules/`, existing `packages/*/dist/`, and existing `packages/*/*.tsbuildinfo` are absent from the repo root after removal.
  - [ ] `git -C D:/Google/.Conitens diff --name-status` is empty after removal.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: dependency/build artifacts archived and removed
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $archive='D:/Google/.Conitens_archives/project-size-cleanup-20260624'; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; $targets=@('node_modules','packages/command-center/node_modules','packages/dashboard/node_modules','packages/core/node_modules','packages/protocol/node_modules','packages/tui/node_modules','packages/command-center/dist','packages/dashboard/dist','packages/core/dist','packages/protocol/dist','packages/tui/dist','packages/command-center/tsconfig.tsbuildinfo','packages/dashboard/tsconfig.tsbuildinfo'); $existing=@($targets | Where-Object { Test-Path -LiteralPath (Join-Path $root $_) }); foreach($t in $existing){ git -C $root ls-files --error-unmatch -- $t *> $null; if($LASTEXITCODE -eq 0){ throw \"tracked target rejected: $t\" } }; if($existing.Count -gt 0){ tar -czf (Join-Path $archive 'dependencies-build-cache.tar.gz') -C $root @existing; tar -tf (Join-Path $archive 'dependencies-build-cache.tar.gz') | Set-Content -LiteralPath (Join-Path $receipt 'dependencies-build-cache.list.txt'); Get-FileHash -LiteralPath (Join-Path $archive 'dependencies-build-cache.tar.gz') | Format-List | Add-Content -LiteralPath (Join-Path $receipt 'archive-manifest.txt'); foreach($t in $existing){ Remove-Item -LiteralPath (Join-Path $root $t) -Recurse -Force -ErrorAction Stop; \"removed`t$t\" | Add-Content -LiteralPath (Join-Path $receipt 'removal-receipt.txt') } }; git -C $root diff --name-status; 'dependency cleanup complete'"
    Expected: exit code 0; output contains `dependency cleanup complete`; `git diff --name-status` prints no tracked changes.
    Evidence: .omo/evidence/task-4-project-size-cleanup-20260624.txt

  Scenario: tracked dependency target is rejected
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $target='package.json'; git -C $root ls-files --error-unmatch -- $target *> $null; if($LASTEXITCODE -eq 0){ 'REJECTED tracked target'; exit 0 }; exit 44"
    Expected: exit code 0 and output contains `REJECTED tracked target`.
    Evidence: .omo/evidence/task-4-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): archive regenerable dependency artifacts` | Files: [`D:/Google/.Conitens_archives/project-size-cleanup-20260624/dependencies-build-cache.tar.gz`, `.omx/artifacts/project-size-cleanup/removal-receipt.txt`]

- [ ] 5. `.omx/tmp*` Archive/Removal With Receipt Preservation

  What to do: Archive and remove only `.omx/tmp`, `.omx/tmp-pr15`, `.omx/tmp-pr17`, and `.omx/tmp-playwright`. Use junction-safe copying/listing for archive staging (`robocopy /E /XJ`) and record any reparse points separately. Verify `.omx/artifacts`, `.omx/state`, `.omx/plans`, `.omx/run`, `.omx/logs`, and `.omx/notepad.md` remain.
  Must NOT do: Do not remove `.omx/` as a whole. Do not remove `.omx/team` by default. Do not follow or archive reparse-point targets.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [10] | Blocked by: [1, 2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.gitignore:9` - `.omx/` is ignored, but ignored does not mean disposable.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:56` - `.omx` is mixed; receipts must be preserved while old temp payloads are removable.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:74` - `.omx/artifacts`, `.omx/state`, `.omx/plans`, and `.omx/logs` are keep surfaces.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:86` - `.omx/tmp`, `.omx/tmp-playwright`, `.omx/tmp-pr15`, and `.omx/tmp-pr17` are temp candidates.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:96` - `.omx/team/pixel-office-dashboard-rebuild` needs active-session review before archive/removal.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:140` - preserve `.omx/artifacts`, `.omx/state`, `.omx/plans`, and `.omx/logs`.
  - External: `https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/robocopy` - `/xj` excludes junction points; exit codes `>= 8` indicate failure.

  Acceptance criteria (agent-executable only):
  - [ ] Archive staging under `D:/Google/.Conitens_archives/project-size-cleanup-20260624/omx-tmp-staging` exists before compression and is created with `robocopy /XJ`.
  - [ ] `omx-tmp-cache.tar.gz` exists and has a `tar -tf` list receipt.
  - [ ] `.omx/tmp`, `.omx/tmp-pr15`, `.omx/tmp-pr17`, and `.omx/tmp-playwright` are absent after verified archive.
  - [ ] `.omx/artifacts`, `.omx/state`, `.omx/plans`, `.omx/run`, `.omx/logs`, and `.omx/notepad.md` still exist after cleanup.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: omx tmp artifacts archived and removed without touching receipts
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $archive='D:/Google/.Conitens_archives/project-size-cleanup-20260624'; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; $sources=@('.omx/tmp','.omx/tmp-pr15','.omx/tmp-pr17','.omx/tmp-playwright'); $keep=@('.omx/artifacts','.omx/state','.omx/plans','.omx/run','.omx/logs','.omx/notepad.md'); foreach($k in $keep){ if(-not (Test-Path -LiteralPath (Join-Path $root $k))){ throw \"missing protected omx receipt before cleanup: $k\" } }; Get-ChildItem -LiteralPath (Join-Path $root '.omx') -Force -Recurse -Attributes ReparsePoint -ErrorAction SilentlyContinue | Select-Object FullName,Attributes,LinkType,Target | Format-List | Out-String | Set-Content -LiteralPath (Join-Path $receipt 'omx-reparsepoints.txt'); $stage=Join-Path $archive 'omx-tmp-staging'; New-Item -ItemType Directory -Force -Path $stage | Out-Null; foreach($s in $sources){ $src=Join-Path $root $s; if(Test-Path -LiteralPath $src){ $dest=Join-Path $stage ($s -replace '[\\/]', '_'); robocopy $src $dest /E /XJ /R:2 /W:2 /MT:16 /LOG+:(Join-Path $receipt 'omx-tmp-robocopy.log') | Out-Null; if($LASTEXITCODE -ge 8){ throw \"robocopy failed for $s with $LASTEXITCODE\" } } }; tar -czf (Join-Path $archive 'omx-tmp-cache.tar.gz') -C $stage .; tar -tf (Join-Path $archive 'omx-tmp-cache.tar.gz') | Set-Content -LiteralPath (Join-Path $receipt 'omx-tmp-cache.list.txt'); Get-FileHash -LiteralPath (Join-Path $archive 'omx-tmp-cache.tar.gz') | Format-List | Add-Content -LiteralPath (Join-Path $receipt 'archive-manifest.txt'); foreach($s in $sources){ $src=Join-Path $root $s; if(Test-Path -LiteralPath $src){ Remove-Item -LiteralPath $src -Recurse -Force -ErrorAction Stop; \"removed`t$s\" | Add-Content -LiteralPath (Join-Path $receipt 'removal-receipt.txt') } }; foreach($k in $keep){ if(-not (Test-Path -LiteralPath (Join-Path $root $k))){ throw \"missing protected omx receipt after cleanup: $k\" } }; 'omx tmp cleanup complete'"
    Expected: exit code 0 and output contains `omx tmp cleanup complete`; protected `.omx` receipt paths still exist.
    Evidence: .omo/evidence/task-5-project-size-cleanup-20260624.txt

  Scenario: `.omx/state` is rejected as cleanup target
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$target='.omx/state'; $protected=@('.omx/state','.omx/artifacts','.omx/plans','.omx/logs','.omx/run'); if($protected -contains $target){ 'REJECTED omx receipt target'; exit 0 }; exit 45"
    Expected: exit code 0 and output contains `REJECTED omx receipt target`.
    Evidence: .omo/evidence/task-5-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): archive transient omx temp state` | Files: [`D:/Google/.Conitens_archives/project-size-cleanup-20260624/omx-tmp-cache.tar.gz`, `.omx/artifacts/project-size-cleanup/omx-tmp-cache.list.txt`]

- [ ] 6. Research Checkout Archive/Removal

  What to do: Archive and remove ignored cloned research checkouts under `RESEARCH/agent-systems-comparison-2026-06-06/sources/repos/`. Preserve tracked research metadata: `README.md`, `state.json`, and `sources/sources.jsonl`.
  Must NOT do: Do not remove the `RESEARCH/agent-systems-comparison-2026-06-06/` directory itself or any tracked metadata under it.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [10] | Blocked by: [1, 2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.gitignore:14` - `RESEARCH/*/sources/repos/` is ignored.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:57` - tracked research metadata is tiny, ignored cloned repos are bulky.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:76` - tracked research metadata must be preserved.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:89` - `RESEARCH/.../sources/repos` is an archive-before-removal target.
  - Pattern:  `docs/adr-0002-product-surface-persistent-agents.md:65` - research outputs are archive-sensitive and should be preserved.
  - External: `https://learn.microsoft.com/en-us/windows/tar/` - use tar for full-tree archive/list/extract.

  Acceptance criteria (agent-executable only):
  - [ ] `research-sources-repos.tar.gz` exists under the external archive root and `tar -tf` lists repo checkout contents.
  - [ ] `RESEARCH/agent-systems-comparison-2026-06-06/sources/repos/` is absent after removal.
  - [ ] `git -C D:/Google/.Conitens ls-files --error-unmatch RESEARCH/agent-systems-comparison-2026-06-06/README.md`, `state.json`, and `sources/sources.jsonl` all succeed.
  - [ ] `git -C D:/Google/.Conitens diff --name-status -- RESEARCH` is empty.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: research cloned repos archived and removed
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $archive='D:/Google/.Conitens_archives/project-size-cleanup-20260624'; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; $target='RESEARCH/agent-systems-comparison-2026-06-06/sources/repos'; $src=Join-Path $root $target; if(Test-Path -LiteralPath $src){ git -C $root ls-files --error-unmatch -- $target *> $null; if($LASTEXITCODE -eq 0){ throw 'research repos unexpectedly tracked' }; tar -czf (Join-Path $archive 'research-sources-repos.tar.gz') -C (Split-Path $src -Parent) repos; tar -tf (Join-Path $archive 'research-sources-repos.tar.gz') | Set-Content -LiteralPath (Join-Path $receipt 'research-sources-repos.list.txt'); Get-FileHash -LiteralPath (Join-Path $archive 'research-sources-repos.tar.gz') | Format-List | Add-Content -LiteralPath (Join-Path $receipt 'archive-manifest.txt'); Remove-Item -LiteralPath $src -Recurse -Force -ErrorAction Stop; \"removed`t$target\" | Add-Content -LiteralPath (Join-Path $receipt 'removal-receipt.txt') }; foreach($tracked in @('RESEARCH/agent-systems-comparison-2026-06-06/README.md','RESEARCH/agent-systems-comparison-2026-06-06/state.json','RESEARCH/agent-systems-comparison-2026-06-06/sources/sources.jsonl')){ git -C $root ls-files --error-unmatch -- $tracked *> $null; if($LASTEXITCODE -ne 0){ throw \"missing tracked research metadata: $tracked\" } }; git -C $root diff --name-status -- RESEARCH; 'research cleanup complete'"
    Expected: exit code 0; output contains `research cleanup complete`; no tracked `RESEARCH` diff is printed.
    Evidence: .omo/evidence/task-6-project-size-cleanup-20260624.txt

  Scenario: tracked research metadata is rejected
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $target='RESEARCH/agent-systems-comparison-2026-06-06/sources/sources.jsonl'; git -C $root ls-files --error-unmatch -- $target *> $null; if($LASTEXITCODE -eq 0){ 'REJECTED tracked research metadata'; exit 0 }; exit 46"
    Expected: exit code 0 and output contains `REJECTED tracked research metadata`.
    Evidence: .omo/evidence/task-6-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): archive research source checkouts` | Files: [`D:/Google/.Conitens_archives/project-size-cleanup-20260624/research-sources-repos.tar.gz`, `.omx/artifacts/project-size-cleanup/research-sources-repos.list.txt`]

- [ ] 7. Generated Output And Stale Dev-Log Archive/Removal

  What to do: Archive and remove generated `output/` screenshots/results. Archive and remove only stale untracked dev-server log/pid files under `.omo/evidence/`; preserve all other `.omo/evidence` files and `.omo/ulw-loop/bootstrap-notepad.md` unless a later explicit cleanup expands scope.
  Must NOT do: Do not remove `.omo/evidence/` wholesale. Do not remove tracked `.omo` plan/evidence files. Do not remove `.omx/artifacts` or `.notes` evidence.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [10] | Blocked by: [1, 2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.git/info/exclude:8` - `output/` is excluded locally.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:61` - `output` is ignored screenshot/result evidence and should be archived before removal.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:90` - `output` is archive-before-removal.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:17` - pid/log temp files are regenerable artifacts.
  - Pattern:  `.conitens/context/LATEST_CONTEXT.md:23` - previous cleanup preserved `.omo/evidence`.
  - Pattern:  `.conitens/context/LATEST_CONTEXT.md:24` - previous cleanup preserved active local config and cloned research repositories.
  - External: `https://learn.microsoft.com/en-us/windows/tar/` - archive generated evidence before removal.

  Acceptance criteria (agent-executable only):
  - [ ] `output-generated-evidence.tar.gz` exists and has a `tar -tf` list receipt.
  - [ ] `output/` is absent after verified archive.
  - [ ] Only these `.omo/evidence` stale files may be removed if present: `floor-overview-oss-ux-dev-server.log`, `floor-overview-oss-ux-dev-server.pid`, `task-7-dev-server.log`, `task-7-dev-server.pid`.
  - [ ] `git -C D:/Google/.Conitens diff --name-status -- .omo output` is empty after cleanup.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: generated output archived and stale dev logs removed
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $archive='D:/Google/.Conitens_archives/project-size-cleanup-20260624'; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; $output=Join-Path $root 'output'; if(Test-Path -LiteralPath $output){ git -C $root ls-files --error-unmatch -- output *> $null; if($LASTEXITCODE -eq 0){ throw 'output unexpectedly tracked' }; tar -czf (Join-Path $archive 'output-generated-evidence.tar.gz') -C $root output; tar -tf (Join-Path $archive 'output-generated-evidence.tar.gz') | Set-Content -LiteralPath (Join-Path $receipt 'output-generated-evidence.list.txt'); Get-FileHash -LiteralPath (Join-Path $archive 'output-generated-evidence.tar.gz') | Format-List | Add-Content -LiteralPath (Join-Path $receipt 'archive-manifest.txt'); Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction Stop; \"removed`toutput\" | Add-Content -LiteralPath (Join-Path $receipt 'removal-receipt.txt') }; $stale=@('.omo/evidence/floor-overview-oss-ux-dev-server.log','.omo/evidence/floor-overview-oss-ux-dev-server.pid','.omo/evidence/task-7-dev-server.log','.omo/evidence/task-7-dev-server.pid'); $existing=@($stale | Where-Object { Test-Path -LiteralPath (Join-Path $root $_) }); if($existing.Count -gt 0){ tar -czf (Join-Path $archive 'omo-stale-dev-logs.tar.gz') -C $root @existing; foreach($f in $existing){ Remove-Item -LiteralPath (Join-Path $root $f) -Force -ErrorAction Stop; \"removed`t$f\" | Add-Content -LiteralPath (Join-Path $receipt 'removal-receipt.txt') } }; git -C $root diff --name-status -- .omo output; 'output cleanup complete'"
    Expected: exit code 0; output contains `output cleanup complete`; no tracked `.omo` or `output` diff is printed.
    Evidence: .omo/evidence/task-7-project-size-cleanup-20260624.txt

  Scenario: tracked `.omo` evidence is rejected
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $target='.omo/evidence/task-7-browser-qa.txt'; git -C $root ls-files --error-unmatch -- $target *> $null; if($LASTEXITCODE -eq 0){ 'REJECTED tracked omo evidence'; exit 0 }; 'tracked sample absent, rejection scenario inconclusive but non-destructive'; exit 0"
    Expected: exit code 0 and output either contains `REJECTED tracked omo evidence` or `rejection scenario inconclusive but non-destructive`.
    Evidence: .omo/evidence/task-7-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): archive generated output evidence` | Files: [`D:/Google/.Conitens_archives/project-size-cleanup-20260624/output-generated-evidence.tar.gz`, `.omx/artifacts/project-size-cleanup/output-generated-evidence.list.txt`]

- [ ] 8. Regenerable Tool Cache Archive/Removal

  What to do: Archive and remove regenerable local tool caches: `.codegraph/`, root `.omc/`, `packages/*/.omc/`, and `scripts/.omc/` if present. Treat `.claude/settings.local.json` as local config and preserve it.
  Must NOT do: Do not remove `.claude/CLAUDE.md`, `.claude/launch.json`, `.claude/start-core.js`, `.claude/start-dashboard.js`, `.claude/settings.local.json`, or `.claude/worktrees/*`.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [10] | Blocked by: [1, 2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.gitignore:21` - `.omc/` is ignored.
  - Pattern:  `.git/info/exclude:11` - `.codegraph` is locally excluded.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:58` - `.codegraph` is a regenerable local SQLite index.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:60` - `.claude` contains worktree/local config and requires review.
  - Pattern:  `.git/info/exclude:9` - `.claude/settings.local.json` is excluded local config.
  - Pattern:  `.git/info/exclude:10` - `.claude/worktrees/` is excluded but worktree-sensitive.
  - External: `https://learn.microsoft.com/en-us/windows/tar/` - archive local caches before removal.

  Acceptance criteria (agent-executable only):
  - [ ] `tool-caches.tar.gz` exists if any cache target existed, and has a `tar -tf` list receipt.
  - [ ] `.codegraph/`, root `.omc/`, `packages/*/.omc/`, and `scripts/.omc/` are absent after cleanup if they existed.
  - [ ] `.claude/settings.local.json` remains if it existed before cleanup.
  - [ ] `git -C D:/Google/.Conitens diff --name-status -- .codegraph .omc packages scripts .claude` is empty.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: regenerable tool caches archived and removed
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $archive='D:/Google/.Conitens_archives/project-size-cleanup-20260624'; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; $targets=@('.codegraph','.omc','packages/command-center/.omc','packages/dashboard/.omc','packages/core/.omc','packages/protocol/.omc','packages/tui/.omc','scripts/.omc'); $existing=@($targets | Where-Object { Test-Path -LiteralPath (Join-Path $root $_) }); foreach($t in $existing){ git -C $root ls-files --error-unmatch -- $t *> $null; if($LASTEXITCODE -eq 0){ throw \"tracked cache target rejected: $t\" } }; if($existing.Count -gt 0){ tar -czf (Join-Path $archive 'tool-caches.tar.gz') -C $root @existing; tar -tf (Join-Path $archive 'tool-caches.tar.gz') | Set-Content -LiteralPath (Join-Path $receipt 'tool-caches.list.txt'); Get-FileHash -LiteralPath (Join-Path $archive 'tool-caches.tar.gz') | Format-List | Add-Content -LiteralPath (Join-Path $receipt 'archive-manifest.txt'); foreach($t in $existing){ Remove-Item -LiteralPath (Join-Path $root $t) -Recurse -Force -ErrorAction Stop; \"removed`t$t\" | Add-Content -LiteralPath (Join-Path $receipt 'removal-receipt.txt') } }; if(Test-Path -LiteralPath (Join-Path $root '.claude/settings.local.json')){ 'preserved .claude/settings.local.json' | Add-Content -LiteralPath (Join-Path $receipt 'removal-receipt.txt') }; git -C $root diff --name-status -- .codegraph .omc packages scripts .claude; 'tool cache cleanup complete'"
    Expected: exit code 0; output contains `tool cache cleanup complete`; no tracked diff is printed.
    Evidence: .omo/evidence/task-8-project-size-cleanup-20260624.txt

  Scenario: `.claude/worktrees` is rejected as tool cache
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$target='.claude/worktrees'; if($target -eq '.claude/worktrees'){ 'REJECTED worktree cache target'; exit 0 }; exit 48"
    Expected: exit code 0 and output contains `REJECTED worktree cache target`.
    Evidence: .omo/evidence/task-8-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): archive regenerable tool caches` | Files: [`D:/Google/.Conitens_archives/project-size-cleanup-20260624/tool-caches.tar.gz`, `.omx/artifacts/project-size-cleanup/tool-caches.list.txt`]

- [ ] 9. Nested Worktree Preservation Audit

  What to do: Audit registered worktrees and prove the cleanup did not delete or corrupt `.claude/worktrees/amazing-hamilton-bf9f87`, `.claude/worktrees/magical-roentgen-51a526`, or `.tmp/codex-push-spatial-lens`. Leave them in place by default. If a future cleanup wants them removed, it must use `git worktree remove` only after separate explicit approval and archive.
  Must NOT do: Do not run `Remove-Item` on a registered worktree. Do not run `git worktree remove` in this plan.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [10] | Blocked by: [1, 2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:47` - worktree safety scan uses `git worktree list --porcelain` and per-worktree status.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:63` - `.tmp/codex-push-spatial-lens` is a registered worktree and must be preserved until explicit removal.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:93` - first Claude worktree is registered.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:94` - second Claude worktree is registered and contains untracked artifacts.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:95` - `.tmp/codex-push-spatial-lens` is a registered worktree.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:139` - manual deletion would corrupt git worktree metadata.

  Acceptance criteria (agent-executable only):
  - [ ] `.omx/artifacts/project-size-cleanup/worktrees-after.txt` exists.
  - [ ] `git worktree list` after cleanup still lists the main worktree at `D:/Google/.Conitens`.
  - [ ] If listed before cleanup, `.claude/worktrees/amazing-hamilton-bf9f87`, `.claude/worktrees/magical-roentgen-51a526`, and `.tmp/codex-push-spatial-lens` are still listed after cleanup.
  - [ ] Per-worktree `git status --short --branch` is captured for each listed nested worktree that still exists.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: registered nested worktrees are preserved
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; git -C $root worktree list | Set-Content -LiteralPath (Join-Path $receipt 'worktrees-after.txt'); $expected=@('D:/Google/.Conitens/.claude/worktrees/amazing-hamilton-bf9f87','D:/Google/.Conitens/.claude/worktrees/magical-roentgen-51a526','D:/Google/.Conitens/.tmp/codex-push-spatial-lens'); $list=git -C $root worktree list; foreach($w in $expected){ if(Test-Path -LiteralPath $w){ if(-not (($list -join \"`n\") -like \"*$w*\")){ throw \"existing worktree not registered: $w\" }; git -C $w status --short --branch | Add-Content -LiteralPath (Join-Path $receipt 'worktrees-after.txt') } }; 'worktree preservation audit complete'"
    Expected: exit code 0 and output contains `worktree preservation audit complete`.
    Evidence: .omo/evidence/task-9-project-size-cleanup-20260624.txt

  Scenario: worktree path is rejected from filesystem deletion
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$candidate='.tmp/codex-push-spatial-lens'; $registered=(git -C 'D:/Google/.Conitens' worktree list) -join \"`n\"; if($registered -like '*D:/Google/.Conitens/.tmp/codex-push-spatial-lens*'){ 'REJECTED registered worktree deletion'; exit 0 }; 'worktree not present, no deletion attempted'; exit 0"
    Expected: exit code 0 and output contains `REJECTED registered worktree deletion` or `worktree not present, no deletion attempted`.
    Evidence: .omo/evidence/task-9-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): preserve registered worktrees` | Files: [`.omx/artifacts/project-size-cleanup/worktrees-after.txt`]

- [ ] 10. Final Size, Git, Runtime, And Restore Verification

  What to do: Run final verification after all cleanup tasks. Capture final size, archive hashes, archive list samples, restore smoke extraction, protected runtime file existence, branch/head, git diff/status, and summary of removed paths. Write `.omx/artifacts/project-size-cleanup/final-proof.txt`.
  Must NOT do: Do not reinstall dependencies in the main repo as part of final verification. If package smoke is needed, use a disposable copy outside `D:/Google/.Conitens` and delete it afterward.

  Parallelization: Can parallel: NO | Wave 3 | Blocks: [] | Blocked by: [4, 5, 6, 7, 8, 9]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:18` - final proof requires final project size, archive manifest/checksum, and git status.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:19` - run non-install-dependent repo checks after dependency removal.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:31` - removal receipt path.
  - Pattern:  `.omx/state/project-size-cleanup/notepad.md:32` - final proof path.
  - Pattern:  `README.md:241` - reinstall command is `pnpm install` if dependencies are needed later.
  - Pattern:  `README.md:244` - build command is `pnpm build` after reinstall.
  - Pattern:  `README.md:247` - test command is `pnpm test` after reinstall.
  - Pattern:  `SECURITY.md:104` - verify before close.
  - Pattern:  `SECURITY.md:106` - `ensemble verify --files <modified-files>` is a documented verification form when files change.
  - External: `https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash?view=powershell-7.6` - use SHA256 archive hashes.
  - External: `https://learn.microsoft.com/en-us/windows/tar/` - archive listing/extraction verifies restorable archives.

  Acceptance criteria (agent-executable only):
  - [ ] `git -C D:/Google/.Conitens rev-parse --abbrev-ref HEAD` returns `codex/push-local-cleanup-20260624`.
  - [ ] `git -C D:/Google/.Conitens rev-parse --short HEAD` returns `7a8dc27` unless the only intentional change is committing this plan in a separate user-approved step.
  - [ ] `git -C D:/Google/.Conitens diff --name-status` prints no tracked changes.
  - [ ] Protected files exist: `.notes/EVENTS/events.jsonl`, `.notes/.notes/events/events.jsonl`, `.conitens/runtime/loop_state.sqlite3`, `.agent/policies/approval_actions.yaml`, `.conitens/personas/default-agent.yaml`, `.omx/state/project-size-cleanup/notepad.md`.
  - [ ] Final project size is recorded and excludes `D:/Google/.Conitens_archives/project-size-cleanup-20260624`.
  - [ ] Every archive under `D:/Google/.Conitens_archives/project-size-cleanup-20260624/*.tar.gz` has a SHA256 hash and can be listed with `tar -tf`.
  - [ ] At least one archive is extracted to `_restore-final-smoke`, file counts are recorded, and the smoke restore directory is deleted afterward.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: final cleanup proof passes
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $archive='D:/Google/.Conitens_archives/project-size-cleanup-20260624'; $receipt=Join-Path $root '.omx/artifacts/project-size-cleanup'; $final=Join-Path $receipt 'final-proof.txt'; 'FINAL PROJECT SIZE CLEANUP PROOF' | Set-Content -LiteralPath $final; git -C $root status --short --branch | Tee-Object -FilePath $final -Append; $branch=git -C $root rev-parse --abbrev-ref HEAD; $head=git -C $root rev-parse --short HEAD; if($branch -ne 'codex/push-local-cleanup-20260624'){ throw \"branch changed: $branch\" }; if($head -ne '7a8dc27'){ throw \"head changed: $head\" }; $diff=git -C $root diff --name-status; $diff | Add-Content -LiteralPath $final; if(($diff | Measure-Object).Count -ne 0){ throw 'tracked diff exists' }; $protected=@('.notes/EVENTS/events.jsonl','.notes/.notes/events/events.jsonl','.conitens/runtime/loop_state.sqlite3','.agent/policies/approval_actions.yaml','.conitens/personas/default-agent.yaml','.omx/state/project-size-cleanup/notepad.md'); foreach($p in $protected){ if(-not (Test-Path -LiteralPath (Join-Path $root $p))){ throw \"missing protected path: $p\" } }; $size=(Get-ChildItem -LiteralPath $root -Force -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum; ('final_bytes='+$size) | Add-Content -LiteralPath $final; Get-ChildItem -LiteralPath $archive -Filter '*.tar.gz' -File -ErrorAction SilentlyContinue | ForEach-Object { Get-FileHash -LiteralPath $_.FullName | Format-List | Add-Content -LiteralPath $final; tar -tf $_.FullName | Select-Object -First 20 | Add-Content -LiteralPath $final }; $first=Get-ChildItem -LiteralPath $archive -Filter '*.tar.gz' -File -ErrorAction SilentlyContinue | Select-Object -First 1; if($first){ $restore=Join-Path $archive '_restore-final-smoke'; New-Item -ItemType Directory -Force -Path $restore | Out-Null; tar -xzf $first.FullName -C $restore; ('restore_file_count=' + ((Get-ChildItem -LiteralPath $restore -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count)) | Add-Content -LiteralPath $final; Remove-Item -LiteralPath $restore -Recurse -Force }; git -C $root diff --check | Add-Content -LiteralPath $final; 'final verification complete'"
    Expected: exit code 0; output contains `final verification complete`; `.omx/artifacts/project-size-cleanup/final-proof.txt` exists.
    Evidence: .omo/evidence/task-10-project-size-cleanup-20260624.txt

  Scenario: missing protected runtime path fails final proof
    Tool:     bash
    Steps:    powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='D:/Google/.Conitens'; $protected='.conitens/runtime/loop_state.sqlite3'; if(-not (Test-Path -LiteralPath (Join-Path $root $protected))){ 'FAILED missing protected runtime path'; exit 0 }; 'protected runtime path present'; exit 0"
    Expected: exit code 0 and output contains `protected runtime path present`; if missing, output contains `FAILED missing protected runtime path` and the executor must stop before declaring complete.
    Evidence: .omo/evidence/task-10-project-size-cleanup-20260624-error.txt
  ```

  Commit: NO | Message: `chore(cleanup): prove project size cleanup` | Files: [`.omx/artifacts/project-size-cleanup/final-proof.txt`, `.omo/evidence/task-10-project-size-cleanup-20260624.txt`]

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [x] F1. Plan compliance audit - every task done, every acceptance criterion met
- [x] F2. Code quality review - diagnostics clean, idioms match, no dead code
- [x] F3. Real manual QA - every QA scenario executed with evidence captured
- [x] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced

Final verification evidence:
`.omo/evidence/project-size-cleanup-20260624-final-review-matrix.md`.

## Commit strategy
- Default cleanup execution makes no commit. The goal is to preserve current PR branch state while removing ignored/untracked/generated bulk.
- If the caller separately asks to commit the plan file, commit only `.omo/plans/project-size-cleanup-20260624.md`; do not include archives, receipts, dependency removals, or ignored runtime artifacts.
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>` body + footer).
- Atomic: every commit builds and passes tests on its own when dependencies are present.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Reference the plan file path in the final commit footer: `Plan: .omo/plans/project-size-cleanup-20260624.md`.
- If committing in this repo, also satisfy the Lore commit protocol from `AGENTS.md`: include decision rationale and useful trailers such as `Constraint:`, `Rejected:`, `Confidence:`, `Scope-risk:`, `Tested:`, and `Not-tested:`.

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
