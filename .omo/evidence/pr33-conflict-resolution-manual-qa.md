# PR #33 Conflict Resolution Manual QA

Date: 2026-07-12
Surface under review: `D:\Google\.Conitens\.omx\worktrees\pr33-conflict-resolution`

## Verdict

PASS for the product/runtime integration. The two-parent merge object remains a
separate final delivery gate and is intentionally created only after this
verified tree and its evidence are committed.

## manualQa

### surfaceEvidence

| scenarioId | criterionRef | surface | exactInvocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| SE-DASHBOARD | dashboard shell and workspace flow | Dashboard tests | `pnpm --filter @conitens/dashboard test` | PASS (155/155 after the stale-detail regression was added) | A1, A2 |
| SE-PYTHON | episode closure and Forward behavior | Python focused regression | `python -m unittest tests.test_episode_closure tests.test_episode_closure_cli_security tests.test_forward_bridge tests.test_forward_runtime_mode` | PASS (73/73) | A2 |
| SE-PROTOCOL | known protocol baseline | Protocol test suite | `pnpm.cmd --filter @conitens/protocol test` | PASS as baseline (847 passed, 4 documented failures) | A3 |
| SE-BROWSER | Focused hierarchy and workspace navigation | Dashboard production preview at 1220x1000 | Navigate `#/office-preview`; navigate `#/workspaces`; click Demo workspace; inspect console and route | PASS (prior claim backed by browser QA artifact) | A4 |
| SE-HISTORY | required history-preserving merge | Git object graph | `git cat-file -p HEAD`; `git log --graph --oneline --decorate -12` | PENDING final delivery gate; reviewed tree is intentionally pre-merge | A5 |

### adversarialCases

| scenarioId | criterionRef | adversarialClass | expectedBehavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| ADV-PROTOCOL-BASELINE | protocol regression | pre-existing registry/ownership drift | Exactly the documented 847-pass/4-failure baseline; no new failure | PASS | A3 |
| ADV-BROWSER-CONSOLE | browser robustness | console errors during route transitions | Zero console errors on Focused and workspace list/detail routes | PASS | A4 |
| ADV-WORKSPACE-SELECTION | workspace interaction | stale/duplicate selection state | Exactly one selected Demo workspace and detail route after click | PASS | A4 |
| ADV-STALE-WORKSPACE-DRAFT | workspace interaction | route changes from workspace 1 to workspace 2 before detail loading finishes | No gateway update or refresh occurs until route and loaded-detail IDs match | PASS | A2 |
| ADV-MERGE-PARENTS | mergeability/history | linear replay substituted for required two-parent merge | Final integration commit has original PR head and current main as both parents | PENDING final delivery gate | A5 |

## artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | test-output | Dashboard baseline test run recorded in the Wave 3 green evidence | `.omo/evidence/wave3-forward-bridge-green.txt` |
| A2 | test-output | Current dashboard/protocol/Python rerun record with exact invocations and counts | `.omo/evidence/pr33-conflict-resolution-rerun.txt` |
| A3 | test-output | Protocol baseline evidence; current rerun reproduced 847 passed / 4 failed | `.omo/evidence/pr33-conflict-resolution-rerun.txt` |
| A4 | browser-report | Focused hierarchy and rebuilt workspace list-to-detail browser QA, including zero console errors | `.omo/evidence/dashboard-thin-shell-final-browser-qa.md`, `.omo/evidence/pr33-conflict-resolution-rerun.txt` |
| A5 | git-inspection | Pre-merge graph and proposed history-preserving construction | `.omo/evidence/pr33-conflict-resolution-rerun.txt`, `.omo/evidence/pr33-conflict-resolution-debugging-audit.md` |

## Remaining gap

Create and verify the intended two-parent merge commit, rerun the final gate, and
confirm GitHub reports the PR mergeable. No remaining product-runtime blocker is
known.
