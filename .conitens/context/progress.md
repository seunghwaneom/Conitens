# progress.md

## Batch 0 Status

- [x] Repo inspected before edits
- [x] Existing guidance files identified
- [x] Batch 0 plan written
- [x] Required contract docs created or normalized
- [x] Required directories scaffolded
- [x] Verified repo scan recorded

## Batch 1 Status

- [x] Existing persistence/database layer inspected
- [x] Table placement and migration strategy proposed before edits
- [x] SQLite loop state modules implemented
- [x] Batch 1 smoke tests executed
- [x] Batch 1 context files refreshed to complete state

## Batch 1 Commands Run

- `tmux new-session -d -s batch1leader -c D:\Google\.Conitens powershell`
- `omx.cmd team 2:executor "...read-only analysis..."` inside the tmux leader
  pane; this failed because the leader workspace is dirty
- `omx.cmd ask claude -p "...Batch 1 design review..."`
- `python -m unittest tests.test_loop_state`
- `python -m unittest tests.test_operations_layer`

## Current Outcome

Batch 1 is complete as a persistence-only delivery. The repository now has a
minimal SQLite-backed loop-state backbone plus a debug JSON mirror rebuild path,
without adding orchestration, model-provider, or room-UI wiring.

## Batch 2 Status

- [x] Batch 1 state objects inspected before edits
- [x] State-to-markdown mapping proposed before implementation
- [x] Markdown runtime services implemented
- [x] Batch 2 test suite added
- [x] Batch 1 and existing Python regression suites still pass

## Batch 2 Commands Run

- `tmux new-session -d -s batch2leader -c D:\Google\.Conitens\.omx\tmp\batch2-team-snapshot powershell`
- `omx.cmd team 2:executor "...read-only analysis..."` inside the isolated tmux
  leader; this still failed with `leader_workspace_dirty_for_worktrees` and then
  `worktree_target_mismatch`
- `omx.cmd ask claude -p "...Batch 2 review..."`
- `python -m unittest tests.test_loop_state`
- `python -m unittest tests.test_context_markdown`
- `python -m unittest tests.test_operations_layer`

## Current Outcome

Batch 2 is complete as a markdown-runtime delivery. The repository now has
deterministic writers/readers for `task_plan.md`, `findings.md`, `progress.md`,
and `LATEST_CONTEXT.md`, plus append-only enforcement for progress and a full
regenerate-from-state helper.

## Batch 3 Status

- [x] Repo language mix inspected before edits
- [x] Initial scan globs decided before implementation
- [x] `.vibe` SQLite/FTS sidecar implemented
- [x] Batch 3 smoke tests added and passing
- [x] Real repo scan and digest generation executed

## Batch 3 Commands Run

- `omx.cmd ask claude -p "...Batch 3 review..."`
- `python -m unittest tests.test_vibe_brain`
- `python -m unittest tests.test_loop_state tests.test_context_markdown tests.test_operations_layer`
- `python .vibe/brain/indexer.py --root . --scan-all`
- `python .vibe/brain/indexer.py --root . --file scripts/ensemble_loop_repository.py`
- `python` inline call to `summarizer.write_latest_context(...)`

## Current Outcome

Batch 3 is complete as a repo-intelligence sidecar delivery. The repository now
has `.vibe` SQLite-backed indexing, heuristic symbol/dependency extraction,
single-file reindex, a polling watcher with debounce, and a separate
`.vibe/context/LATEST_CONTEXT.md` repo digest.

## Batch 4 Status

- [x] Existing lint/test/typecheck tooling inspected before edits
- [x] Baseline-gating integration proposed before implementation
- [x] Fast-lane and doctor modules implemented
- [x] Batch 4 smoke tests added and passing
- [x] Real fast-lane and doctor commands executed

## Batch 4 Commands Run

- `omx.cmd ask claude -p "...Batch 4 review..."`
- `python -m unittest tests.test_vibe_quality_gates`
- `python -m unittest tests.test_vibe_quality_gates tests.test_vibe_brain tests.test_loop_state tests.test_context_markdown tests.test_operations_layer`
- `python .vibe/brain/precommit.py --repo-root . --file .vibe/brain/precommit.py --file .vibe/brain/typecheck_baseline.py --file tests/test_vibe_quality_gates.py`
- `python .vibe/brain/doctor.py --repo-root .`
- `python -m unittest discover tests`

## Current Outcome

Batch 4 is complete as a quality-gates delivery. The repository now has a
staged-only fast lane, a separate doctor flow, cycle blocking, regression-only
typecheck baseline gating, hotspot reporting, and a hook installer.

## Batch 5 Status

- [x] Prior batch outputs inspected before edits
- [x] Persona/memory schema mapping proposed before implementation
- [x] Persona and memory modules implemented
- [x] Batch 5 test suite added and passing
- [x] Batch 1-4 regression suites still pass

## Batch 5 Commands Run

- `omx.cmd ask claude -p "...Batch 5 review..."`
- `python -m unittest tests.test_persona_memory`
- `python -m unittest tests.test_vibe_quality_gates tests.test_vibe_brain tests.test_loop_state tests.test_context_markdown tests.test_operations_layer`
- `python -m unittest discover tests`

## Current Outcome

Batch 5 is complete as a persona and memory boundary delivery. The repository
now has persona YAML contracts, namespaced long-term memory records, candidate
policy patch review storage, and explicit identity auto-edit protection.

## Batch 6 Status

- [x] Existing repo guidance and skill-like docs inspected before edits
- [x] OpenHands-compatible skill packaging plan defined before implementation
- [x] Local progressive-disclosure skill loader implemented
- [x] Required Batch 6 skill packs added
- [x] Full Python discovery still passes

## Batch 6 Commands Run

- `omx.cmd ask claude -p "...Batch 6 review..."`
- `python -m unittest tests.test_skill_loader`
- `python -m unittest tests.test_skill_loader tests.test_persona_memory tests.test_vibe_quality_gates tests.test_vibe_brain tests.test_loop_state tests.test_context_markdown tests.test_operations_layer`
- `python scripts/ensemble_skill_loader.py --workspace . --list`
- `python -m unittest discover tests`

## Current Outcome

Batch 6 is complete as an OpenHands-compatible skill-packaging delivery. The
repository now has discoverable `.agents/skills/*/SKILL.md` packages, a local
progressive-disclosure loader, and persona skill refs that resolve against the
new compatibility layer.

## Batch 7 Status

- [x] Prior batch outputs inspected before edits
- [x] Packet composition order proposed before implementation
- [x] Context assembler implemented
- [x] Batch 7 packet tests added and passing
- [x] Full Python discovery still passes

## Batch 7 Commands Run

- `omx.cmd ask claude -p "...Batch 7 review..."`
- `python -m unittest tests.test_context_assembler`
- `python -m unittest discover tests`
- inline Python fixture assembly to capture packet size metrics and a packet
  snapshot path

## Current Outcome

Batch 7 is complete as a token-optimization core delivery. The repository now
has a deterministic Context Assembler that builds minimal TaskContextPacket
objects, integrates runtime/repo digests and memory retrieval, and keeps
execution packets smaller than archived history.

## Batch 8 Status

- [x] LangGraph suitability inspected before edits
- [x] Direct LangGraph blocker documented before fallback
- [x] Planner/build orchestration skeleton implemented
- [x] Persistent checkpoint/resume hooks implemented
- [x] Full Python discovery still passes

## Batch 8 Commands Run

- `omx.cmd ask claude -p "...Batch 8 review..."`
- `python -c "import importlib.util ..."` to confirm LangGraph availability
- `python -m unittest tests.test_orchestration_skeleton`
- `python -m unittest discover tests`

## Current Outcome

Batch 8 is complete as an orchestration-skeleton delivery. The repo now has a
local planner/build graph boundary with persistent checkpoints and a recorded
ADR for why direct LangGraph integration was deferred.

## Batch 9 Status

- [x] Batch 8 interfaces inspected before edits
- [x] Narrowest viable loop wiring chosen before implementation
- [x] Worker / validator / retry / reflection loop implemented
- [x] Batch 9 execution-loop tests added and passing
- [x] Full Python discovery still passes

## Batch 9 Commands Run

- `omx.cmd ask claude -p "...Batch 9 review..."`
- `python -m unittest tests.test_execution_loop`
- `python -m unittest tests.test_orchestration tests.test_orchestration_skeleton`
- `python -m unittest discover tests`
- inline Python fixture run to capture retry decisions and candidate patch output

## Current Outcome

Batch 9 is complete as a working iterative execution loop delivery. The repo
now has a narrow worker path, structured validation, persisted retry decisions,
reflection-driven candidate patch output, and a real loop inside the existing
planner/build orchestration boundary.

## Batch 10 Status

- [x] Existing action / tool boundaries inspected before edits
- [x] Approval insertion points proposed before implementation
- [x] Approval policy and queue persistence implemented
- [x] Pause / resume wiring implemented
- [x] Rejection feedback reinjection implemented
- [x] Audit trail events implemented
- [x] Batch 10 tests added and passing
- [x] Full Python discovery still passes

## Batch 10 Commands Run

- `python -m unittest tests.test_approval_controls`
- `python -m unittest tests.test_execution_loop tests.test_orchestration tests.test_orchestration_skeleton`
- `python -m unittest discover tests`
- `claude -p "...Batch 10 Conitens approval control review..."`

## Current Outcome

Batch 10 is complete as an approval-controls delivery. The repo now has a
policy-backed approval queue, persisted approval requests, checkpointed
approval pause / resume, rejection reinjection into runtime state, and an
append-only audit trail for approval decisions.

## Batch 11 Status

- [x] Existing UI / API replay surfaces inspected before edits
- [x] Collaboration-layer insertion points proposed before implementation
- [x] SQLite replay tables implemented
- [x] Room, replay, insight, and AG2-compatible adapter services implemented
- [x] Existing dashboard route extended for replay / insight visibility
- [x] Batch 11 tests added and passing
- [x] Full Python discovery still passes
- [x] External Claude review completed

## Batch 11 Commands Run

- `python -m unittest tests.test_room_replay`
- `python -m unittest tests.test_operations_layer`
- `python -m unittest discover tests`
- `omx.cmd ask claude -p "...Batch 11 collaboration and replay review..."`
- `claude -p "...final Batch 11 collaboration and replay review..."`

## Current Outcome

Batch 11 is complete as a collaboration-surface and replay-layer delivery. The
repo now has persisted room episodes, replay queries across room / run /
iteration scopes, typed insights with evidence refs, a replaceable AG2 room
adapter boundary, and a visible debug route that can show room and replay data
without promoting transcript state into the execution backbone.

## Post-Batch11 Audit Status

- [x] Guidance, contracts, runtime artifacts, and state surfaces inspected
- [x] Orchestration / approval / replay / persona / skill / `.vibe` modules inspected
- [x] Python and pnpm test suites run
- [x] Architecture review report written
- [x] Claude second-opinion attempts recorded

## Post-Batch11 Audit Commands Run

- `python -m unittest discover tests`
- `pnpm.cmd test`
- SQLite schema and row-count inspection against `.conitens/runtime/loop_state.sqlite3`
- focused repository searches over runtime integration, replay, approval, room,
  and `.vibe` seams
- multiple `claude -p` audit attempts, which timed out

## Current Outcome

The post-Batch11 audit is complete. The repo is suitable for surgical refactor
if the target is explicitly the forward `.conitens` architecture. It still
needs a runtime-promotion decision before any broad cleanup or convergence work.

## Post-Batch11 Refactor Planning Status

- [x] Review, guidance, and digest inputs reread before planning
- [x] High-leverage refactors selected and staged
- [x] Validation and rollback guidance written
- [x] Claude sanity-check attempts recorded
- [x] Refactor plan artifact written

## Post-Batch11 Refactor Planning Commands Run

- read-only review of `.conitens/reviews/batch11_architecture_review.md`
- reread `AGENTS.md`, `PLANS.md`, `IMPLEMENT.md`, `.conitens/context/*`, and
  `.vibe/context/LATEST_CONTEXT.md`
- two `claude -p` sanity-check attempts, both timed out

## Current Outcome

The surgical refactor plan is complete. Wave 1 is isolated enough to execute
immediately without forcing the runtime-promotion decision.

## Wave 1 Execution Planning Status

- [x] Required review/context files reread before decomposition
- [x] Wave 1 split into 1-1 / 1-2 / 1-3
- [x] Per-subwave touched files, invariants, tests, and stop conditions documented
- [x] Validation order and rollback points documented
- [x] Claude sanity-check timeout recorded

## Wave 1 Execution Planning Commands Run

- read-only review of `.conitens/reviews/batch11_architecture_review.md`
- read-only review of `.conitens/reviews/batch11_refactor_plan.md`
- `claude -p "...Wave 1 split sanity-check..."` which timed out

## Current Outcome

The Wave 1 execution checklist is complete. Wave 1-1 can start safely as the
first implementation subwave.

## Wave 1-1 Status

- [x] repository snapshot/restore/debug surfaces updated
- [x] key state owners made explicit
- [x] repo `.conitens` DB migrated and debug mirror regenerated
- [x] focused Wave 1-1 tests added/updated and passing
- [x] external Claude review completed

## Wave 1-1 Commands Run

- `python -m unittest tests.test_loop_state tests.test_context_markdown tests.test_room_replay`
- `python -m unittest tests.test_approval_controls`
- `python - <<...>>` to migrate `.conitens/runtime/loop_state.sqlite3` and regenerate `loop_state.json`
- `claude -p "...Wave 1-1 source-of-truth cleanup review..."`

## Current Outcome

Wave 1-1 is complete. The forward `.conitens` restore/debug path now reflects
the actual persisted Batch 11 state categories and the owner map for key state
concepts is explicit.

## Wave 1-2 Status

- [x] ContextAssembler source policy made explicit
- [x] raw room transcript fallback removed from default packet path
- [x] metadata-only skill delegation path implemented
- [x] focused packet tests added/updated and passing
- [x] external Claude review completed

## Wave 1-2 Commands Run

- `python -m unittest tests.test_context_assembler tests.test_execution_loop tests.test_room_replay tests.test_skill_loader`
- `python -m unittest tests.test_context_assembler`
- `python -m unittest tests.test_approval_controls`
- `claude -p "...Wave 1-2 context packet review..."`

## Current Outcome

Wave 1-2 is complete. Execution packets are now more intentional and bounded,
with explicit source/exclusion policy and less accidental packet bloat.

## Wave 1-3 Status

- [x] duplicate validator/retry/approval control path removed
- [x] repeated failure escalation path made reachable through persisted state
- [x] focused unhappy-path tests added/updated and passing
- [x] external Claude review completed

## Wave 1-3 Commands Run

- `python -m unittest tests.test_execution_loop tests.test_orchestration_skeleton tests.test_approval_controls`
- `python -m unittest tests.test_loop_state`
- `python -m unittest tests.test_room_replay`
- `python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble_execution_loop.py --file scripts/ensemble_orchestration.py --file scripts/ensemble_approval.py --file tests/test_execution_loop.py --file tests/test_approval_controls.py`
- `claude -p "...Wave 1-3 control path review..."`

## Current Outcome

Wave 1-3 is complete. The validator/retry/escalation/approval seam now has one
clear execution owner and the unhappy paths remain observable, bounded, and
replayable.

## Post-Wave-1 Stabilization Status

- [x] targeted invariants verified with tests/evidence
- [x] fast precommit explicitly exercised on Wave 1 files
- [x] external Claude stabilization review completed
- [x] stabilization report written

## Post-Wave-1 Stabilization Commands Run

- `python -m unittest tests.test_loop_state tests.test_context_markdown tests.test_execution_loop tests.test_approval_controls tests.test_room_replay tests.test_persona_memory tests.test_vibe_quality tests.test_vibe_quality_gates`
- `python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble_context_assembler.py --file scripts/ensemble_execution_loop.py --file scripts/ensemble_orchestration.py --file scripts/ensemble_approval.py --file tests/test_context_assembler.py --file tests/test_execution_loop.py --file tests/test_approval_controls.py`
- `claude -p "...post-refactor stabilization cross-check..."`
- `git status --short`

## Current Outcome

The Wave 1 stabilization pass is complete. No material implementation
regressions were found. The remaining risks are the stale `.vibe` repo digest
and the still-unresolved active-runtime split.

## Security Hardening Status

- [x] sensitive dashboard GET routes protected
- [x] room/spawn/path-like identifiers validated
- [x] focused UI/replay/security tests passed
- [x] final Claude review completed

## Security Hardening Commands Run

- `python -m unittest tests.test_operations_layer tests.test_room_replay tests.test_approval_controls`
- `python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble_ui.py --file scripts/ensemble_room.py --file scripts/ensemble_spawn.py --file tests/test_operations_layer.py --file tests/test_room_replay.py`
- `claude -p "...final security hardening check..."`
- attempted `omx.cmd team ...`, but team mode was blocked because the leader was not inside tmux

## Current Outcome

The targeted security hardening pass is complete. The original high-severity
dashboard read/auth and path-validation issues were addressed, and the final
Claude check reported no material issues.

## Frontend Rebaseline v4.1 Audit Status

- [x] v4.1 reference doc and current runtime/repo digests re-read
- [x] v4.1 pre-flight artifact checks completed
- [x] runtime/entrypoint and service import audit completed
- [x] frontend control-plane decision documented
- [x] context files refreshed

## Frontend Rebaseline v4.1 Audit Commands Run

- `Get-Content .conitens/context/LATEST_CONTEXT.md`
- `Get-Content .vibe/context/LATEST_CONTEXT.md`
- `Get-Content docs/conitens_frontend_rebaseline_v4_1.md`
- `Get-Content C:\\Users\\eomsh\\.codex\\skills\\ouroboros\\upstream\\skills\\ralph\\SKILL.md`
- `Test-Path packages/protocol/src/event.ts; Test-Path scripts/ensemble_room.py; Test-Path .conitens/context/task_plan.md`
- `Get-Content scripts/ensemble.py`
- `Get-Content bin/ensemble.js`
- `Get-Content scripts/ensemble_orchestration.py`
- `Get-Content scripts/ensemble_ui.py`
- Python inline import audit for forward service modules
- `rg -n ... BuildGraph / IterativeBuildLoop / ensemble_loop_repository / --forward ...`
- `omx team --help`
- `git status --short`

## Current Outcome

The frontend rebaseline work is currently blocked at the implementation stage.
The repo now has a documented P0 runtime/service audit and a control-plane
decision that says to establish an explicit forward-runtime entry contract
before starting BE-1a / FE-0 / FE-1.

## Post-Wave 1 Architecture Documentation Status

- [x] Existing review/context/runtime docs re-read before writing
- [x] Current architecture/status document added under `docs/`
- [x] `.conitens/context/*` refreshed for the documentation task

## Post-Wave 1 Architecture Documentation Commands Run

- `Get-Content .conitens/context/LATEST_CONTEXT.md`
- `Get-Content .vibe/context/LATEST_CONTEXT.md`
- `Get-Content .conitens/reviews/batch11_architecture_review.md`
- `Get-Content .conitens/reviews/batch11_stabilization_report.md`
- `Get-Content .conitens/reviews/batch11_wave1_1_summary.md`
- `Get-Content .conitens/reviews/batch11_wave1_2_summary.md`
- `Get-Content .conitens/reviews/batch11_wave1_3_summary.md`
- `Get-Content docs/architecture.md`
- `Get-Content docs/control-plane-compatibility.md`
- `git status --short`

## Current Outcome

The repository now has a single Korean current-state document that explains the
active runtime lineage, the forward `.conitens` stack, the `.vibe` sidecar,
the Wave 1 refactor outcomes, the security hardening status, and the remaining
architectural risks without changing code behavior.

## Frontend Forward Entry Contract Status

- [x] minimal forward runtime command surface implemented
- [x] `ensemble.py` wired with additive forward entry path
- [x] focused forward CLI tests passed
- [x] existing operations-layer regression suite passed
- [x] `.vibe` fast lane passed on changed code
- [x] Claude consultation attempted and timeout artifact recorded

## Frontend Forward Entry Contract Commands Run

- `Get-Content scripts/ensemble.py`
- `Get-Content scripts/ensemble_ui.py`
- `Get-Content scripts/ensemble_loop_repository.py`
- `Get-Content scripts/ensemble_loop_paths.py`
- `Get-Content scripts/ensemble_state_restore.py`
- `python -m unittest tests.test_forward_runtime_mode`
- `python -m unittest tests.test_operations_layer`
- `python scripts/ensemble.py --workspace . forward status --format json`
- `python scripts/ensemble.py --workspace . --forward status`
- `python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble.py --file scripts/ensemble_forward.py --file tests/test_forward_runtime_mode.py`
- `claude -p "...minimal explicit forward-runtime contract only..."` (timed out)
- `claude -p "...review: add minimal explicit forward-runtime contract only..."` (timed out)

## Current Outcome

The repo now has an explicit forward-runtime entry contract without changing the
legacy runtime default. This clears the v4.1 frontend gate for forward-only
BE-1a work while keeping the control-plane split explicit.

## Frontend BE-1a Bridge Status

- [x] forward-only read bridge implemented
- [x] BE-1a docs added
- [x] focused bridge tests passed
- [x] existing operations/replay regressions passed
- [x] `.vibe` fast lane passed on changed files
- [x] Claude BE-1a review captured and high-value notes applied

## Frontend BE-1a Bridge Commands Run

- `python -m unittest tests.test_forward_runtime_mode tests.test_forward_bridge`
- `python -m unittest tests.test_operations_layer tests.test_room_replay`
- `python scripts/ensemble.py --workspace . forward serve --host 127.0.0.1 --port 8890 --once`
- `python scripts/ensemble.py --workspace . forward context-latest --format json`
- `python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble.py --file scripts/ensemble_forward.py --file scripts/ensemble_forward_bridge.py --file tests/test_forward_runtime_mode.py --file tests/test_forward_bridge.py`
- `claude -p "...BE-1a review..."`

## Current Outcome

BE-1a is complete. The repo now has a forward-only local read bridge that
exposes runs, replay, state docs, context-latest, and room timeline data
without promoting the forward stack to the default runtime.

## Frontend FE-0 / FE-1 Status

- [x] FE-0 docs added
- [x] FE-1 shell/run list implemented
- [x] dashboard package tests passed
- [x] dashboard package build passed
- [x] bridge regression tests still passed
- [x] `.vibe` fast lane passed on touched frontend files
- [x] Claude FE-0/FE-1 review attempt recorded

## Frontend FE-0 / FE-1 Commands Run

- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- `python -m unittest tests.test_forward_bridge tests.test_forward_runtime_mode`
- `python .vibe/brain/precommit.py --repo-root . --file packages/dashboard/src/App.tsx --file packages/dashboard/src/forward-bridge.ts --file packages/dashboard/src/forward-route.ts --file packages/dashboard/src/forward-view-model.ts --file packages/dashboard/tests/forward-bridge.test.mjs`
- `claude -p "...FE-0/FE-1 review..."`

## Current Outcome

FE-0 and FE-1 are complete. The frontend now has a minimal forward-only shell
that can connect to the BE-1a bridge, load the run list from real API data,
and navigate to a run detail route without introducing writes or live
transport.

## Frontend FE-3 Status

- [x] replay panel implemented
- [x] state-docs panel implemented
- [x] context digests panel implemented
- [x] room timeline panel implemented when room data exists
- [x] dashboard package tests passed
- [x] dashboard package build passed
- [x] bridge regression tests still passed
- [x] `.vibe` fast lane passed on touched files
- [x] Claude FE-3 review attempt recorded

## Frontend FE-3 Commands Run

- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- `python -m unittest tests.test_forward_bridge tests.test_forward_runtime_mode`
- `python .vibe/brain/precommit.py --repo-root . --file packages/dashboard/src/App.tsx --file packages/dashboard/src/forward-bridge.ts --file packages/dashboard/src/forward-view-model.ts --file packages/dashboard/src/components/ForwardReplayPanel.tsx --file packages/dashboard/src/components/ForwardStateDocsPanel.tsx --file packages/dashboard/src/components/ForwardContextPanel.tsx --file packages/dashboard/src/components/ForwardRoomPanel.tsx --file packages/dashboard/tests/forward-bridge.test.mjs`
- `claude -p "...FE-3 final review..."`

## Current Outcome

FE-3 is complete. The forward-only dashboard shell can now inspect replay
events, projected state docs, separated runtime/repo digests, and room timeline
data without adding writes or live transport.

## Frontend FE-5 Status

- [x] graph/state inspector implemented
- [x] graph derivation tests added
- [x] dashboard package tests passed
- [x] dashboard package build passed
- [x] bridge regression tests still passed
- [x] `.vibe` fast lane passed on touched files
- [x] Claude FE-5 review succeeded
- [x] Claude latency diagnosis recorded

## Frontend FE-5 Commands Run

- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- `python -m unittest tests.test_forward_bridge tests.test_forward_runtime_mode`
- `python .vibe/brain/precommit.py --repo-root . --file packages/dashboard/src/App.tsx --file packages/dashboard/src/forward-graph.ts --file packages/dashboard/src/components/ForwardGraphPanel.tsx --file packages/dashboard/tests/forward-graph.test.mjs`
- `claude -p --effort low "...FE-5 final review..."`
- Claude latency benchmark commands:
  - `claude -p "Reply with exactly OK."`
  - `claude -p --bare --effort low "Reply with exactly OK."`
  - `claude -p --bare --effort low "<review prompt>"`
  - `claude -p --effort low "<review prompt>"`

## Current Outcome

FE-5 is complete. The forward-only dashboard shell now includes a read-only
graph/state inspector, and the Claude review path was stabilized for this
environment by switching to narrow prompts with `--effort low` and avoiding
`--bare`.

## Claude Review Reliability Status

- [x] logged-in Claude Code session verified
- [x] reusable local review wrapper added
- [x] wrapper test suite passed
- [x] wrapper smoke run passed with `medium` effort and `300s` timeout
- [x] `.vibe` fast lane passed on wrapper files

## Claude Review Reliability Commands Run

- `claude auth status`
- `python -m unittest tests.test_claude_review_wrapper`
- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug claude-auth-check "Reply with exactly OK."`
- `python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble_claude_review.py --file tests/test_claude_review_wrapper.py`

## Current Outcome

The repo now has a reusable local Claude review helper that confirms the
logged-in Claude Code session and runs reviews with the requested `medium`
effort plus a 5-minute timeout.

## Frontend BE-1b Status

- [x] approval list/read routes implemented
- [x] approval decision/resume routes implemented
- [x] SSE snapshot/heartbeat stream implemented
- [x] typed frontend approval/SSE wrappers added
- [x] backend tests passed
- [x] dashboard tests passed
- [x] dashboard build passed
- [x] `.vibe` fast lane passed on touched files
- [x] Claude BE-1b review captured with medium/300s profile

## Frontend BE-1b Commands Run

- `python -m unittest tests.test_claude_review_wrapper tests.test_forward_live_approval tests.test_forward_bridge tests.test_forward_runtime_mode`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- `python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble_forward_bridge.py --file packages/dashboard/src/forward-bridge.ts --file tests/test_forward_live_approval.py --file packages/dashboard/tests/forward-bridge.test.mjs`
- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug be1b-design-review "...BE-1b design review..."`

## Current Outcome

BE-1b is complete. The forward bridge now supports approval read/mutate
semantics plus a one-way SSE stream, and the frontend has typed approval/SSE
wrappers ready for later FE-4 / FE-6 work.

## Frontend FE-6 Status

- [x] approval center panel implemented
- [x] dashboard package tests passed
- [x] dashboard package build passed
- [x] bridge backend tests passed
- [x] `.vibe` fast lane passed on touched files
- [x] Claude FE-6 review artifact captured

## Frontend FE-6 Commands Run

- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- `python -m unittest tests.test_forward_live_approval tests.test_forward_bridge tests.test_forward_runtime_mode`
- `python .vibe/brain/precommit.py --repo-root . --file packages/dashboard/src/App.tsx --file packages/dashboard/src/components/ForwardApprovalCenterPanel.tsx --file packages/dashboard/src/forward-bridge.ts --file packages/dashboard/tests/forward-bridge.test.mjs --file scripts/ensemble_forward_bridge.py --file tests/test_forward_live_approval.py`

## Current Outcome

FE-6 is complete. The dashboard now has a real approval center backed by the
forward bridge, with approve/reject/resume actions and run-scoped approval
detail.

## Frontend FE-7 Status

- [x] insights panel implemented
- [x] findings summary block implemented
- [x] validator correlation block implemented
- [x] dashboard package tests passed
- [x] dashboard package build passed
- [x] bridge backend tests still passed
- [x] `.vibe` fast lane passed on touched files
- [x] Claude FE-7 review artifact captured

## Frontend FE-7 Commands Run

- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- `python -m unittest tests.test_forward_live_approval tests.test_forward_bridge tests.test_forward_runtime_mode`
- `python .vibe/brain/precommit.py --repo-root . --file packages/dashboard/src/App.tsx --file packages/dashboard/src/components/ForwardInsightsPanel.tsx --file packages/dashboard/src/forward-view-model.ts --file packages/dashboard/tests/forward-bridge.test.mjs`
- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug fe7-insights-review "...FE-7 final review..."`

## Current Outcome

FE-7 is complete. The dashboard now exposes insight cards, findings summary,
and validator correlation using the existing bridge data with no new backend
domain model.

## Frontend FE-8 Status

- [x] dead frontend surface removed where safe
- [x] forward operator smoke test added
- [x] planning doc status aligned with implemented phases
- [x] dashboard package tests passed
- [x] dashboard package build passed
- [x] bridge backend tests passed
- [x] `.vibe` fast lane passed on touched files
- [x] Claude FE-8 review artifact captured

## Frontend FE-8 Commands Run

- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- `python -m unittest tests.test_forward_operator_flow tests.test_forward_live_approval tests.test_forward_bridge tests.test_forward_runtime_mode`
- `python .vibe/brain/precommit.py --repo-root . --file packages/dashboard/src/forward-bridge.ts --file tests/test_forward_operator_flow.py --file docs/conitens_frontend_rebaseline_v4_1.md --file docs/frontend/FE8_STABILIZATION.md`
- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug fe8-stabilization-review "...FE-8 review..."`

## Current Outcome

FE-8 is complete. The forward dashboard/bridge surface now has explicit
deferred notes, a dead mock surface removed, an end-to-end operator smoke test,
and aligned planning/status docs.

## Frontend FE-4 Status

- [x] live stream hook implemented
- [x] replay/room views refresh from SSE snapshots
- [x] dashboard package tests passed
- [x] dashboard package build passed
- [x] bridge backend tests passed
- [x] Claude FE-4 review artifact captured

## Frontend FE-4 Commands Run

- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- `python -m unittest tests.test_forward_operator_flow tests.test_forward_live_approval tests.test_forward_bridge tests.test_forward_runtime_mode`
- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug fe4-live-room-review "...FE-4 review..."`

## Current Outcome

FE-4 is complete. The forward dashboard now consumes the existing SSE bridge
for live room/replay refresh while still treating the browser as a read-mostly
projection layer.

## Forward Review Hardening Status

- [x] reviewer attribution moved to the bridge/server side
- [x] live stream auth moved off query-token EventSource path
- [x] loopback CORS added for local dashboard preview origin
- [x] room selection persistence fixed for live/detail refresh
- [x] panel-scoped error state introduced in the dashboard shell
- [x] bridge 500 responses sanitized
- [x] approval center reviewer input removed
- [x] dashboard bearer token removed from browser storage persistence
- [x] dependency audit reduced to no high/critical findings
- [x] focused regression tests added before/with cleanup edits
- [x] dashboard build passed
- [x] fast precommit exercised on the changed surface
- [x] actual bridge/dashboard program run verified

## Forward Review Hardening Commands Run

- `pnpm --filter @conitens/dashboard test`
- `python -m unittest tests.test_forward_live_approval tests.test_forward_operator_flow`
- `python -m unittest tests.test_forward_live_approval tests.test_forward_operator_flow tests.test_forward_bridge tests.test_forward_runtime_mode`
- `pnpm --filter @conitens/dashboard build`
- `pnpm install`
- `pnpm audit --json`
- `pnpm --filter @conitens/command-center test`
- `pnpm --filter @conitens/command-center typecheck`
- `python .vibe/brain/precommit.py --repo-root . --file packages/dashboard/src/App.tsx --file packages/dashboard/src/components/ForwardApprovalCenterPanel.tsx --file packages/dashboard/src/forward-bridge.ts --file packages/dashboard/src/forward-view-model.ts --file packages/dashboard/tests/forward-bridge.test.mjs --file scripts/ensemble.py --file scripts/ensemble_forward.py --file scripts/ensemble_forward_bridge.py --file tests/test_forward_live_approval.py --file tests/test_forward_operator_flow.py --file docs/frontend/BE1B_API.md --file docs/frontend/FE6_APPROVAL_CENTER.md`
- real bridge run via `python -u scripts/ensemble.py --workspace . forward serve --host 127.0.0.1 --port 0 --reviewer local/eomshwan`
- real dashboard preview run via `pnpm --filter @conitens/dashboard preview --host 127.0.0.1 --port 4291`

## Current Outcome

The forward bridge/dashboard review hardening pass is complete. Reviewer
identity is now bridge-owned, live refresh preserves room selection, detail
panels do not share one global error string, internal bridge failures are
sanitized, loopback CORS is now explicit for local preview usage, dependency
audit no longer has high/critical findings, and the local bridge plus dashboard
preview were both started and reached successfully. The `.vibe` fast lane still
reports existing `@conitens/command-center` typecheck baseline regressions
outside the edited dashboard/bridge code.

## Forward Operator Docs Status

- [x] detailed operator usage guide added under `docs/frontend/`
- [x] startup/connect/approval/live/stop/troubleshooting flow documented
- [x] current live-session artifact path documented
- [x] `.conitens/context/*` refreshed

## Forward Operator Docs Commands Run

- `Get-ChildItem docs/frontend`
- `Get-Content docs/frontend/BE1B_API.md`
- `Get-Content docs/frontend/FE6_APPROVAL_CENTER.md`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`

## Current Outcome

The repo now has a dedicated practical usage guide for the forward operator
surface. An operator can use it to launch the bridge, launch the dashboard,
connect with the token, inspect runs, handle approvals, understand live refresh,
and find the current local session artifact without relying on chat history.

## Frontend Review 2026-04-02 Implementation Status

- [x] review doc decoded and action items extracted
- [x] Claude second-opinion captured
- [x] pixel-office rail density caps implemented
- [x] pixel-office shell hard-lock implemented
- [x] new rail-cap helper covered by tests
- [x] dashboard tests and build passed
- [x] `.conitens/context/*` refreshed

## Frontend Review 2026-04-02 Commands Run

- `Get-Content docs/frontend/FRONTEND_REVIEW_2026-04-02.md`
- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug frontend-review-20260402 "..."`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`

## Current Outcome

The frontend review implementation pass is complete for the smallest
high-impact pixel-office slice. The rail is now scan-budgeted, overflow is
explicitly summarized instead of endlessly stacked, and the shell is locked to
the intended stage-first footprint without changing the bridge/control-plane
contract.

## Frontend Review 2026-04-02 Slice 2 Status

- [x] Claude recommendation for next pixel-office slice captured
- [x] focus strip compaction implemented
- [x] room tile redundant chrome reduced
- [x] new focus-strip helper covered by tests
- [x] dashboard tests and build passed
- [x] `.conitens/context/*` refreshed

## Frontend Review 2026-04-02 Slice 2 Commands Run

- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug pixel-office-next-slice "..."`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`

## Current Outcome

The second frontend-review slice is complete. The right rail now ends in a
compact focus strip instead of a dossier-style card, and each room tile shows
less redundant chrome so the office stage reads more like a quiet operational
floorplate.

## Frontend Review 2026-04-02 Density Slice Status

- [x] Claude recommendation for room-density slice captured
- [x] Impl Office density increased in the stage schema
- [x] Central Commons dead-floor space lightly reduced
- [x] schema density assertions added to tests
- [x] dashboard tests and build passed
- [x] `.conitens/context/*` refreshed

## Frontend Review 2026-04-02 Density Slice Commands Run

- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug pixel-office-density-slice "..."`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`

## Current Outcome

The pixel-office density slice is complete. `Impl Office` is no longer the
sparsest oversized room in the floorplate, and `Central Commons` now has enough
ambient fill to read less like a dead void while preserving the quiet
operator-dashboard feel.

## Frontend Review 2026-04-02 Specialist Slice Status

- [x] Claude recommendation for specialist-wing slice captured
- [x] specialist-wing fixture polish implemented
- [x] specialist-wing chrome reduction implemented
- [x] schema and CSS changes verified by dashboard tests/build
- [x] `.conitens/context/*` refreshed

## Frontend Review 2026-04-02 Specialist Slice Commands Run

- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug pixel-office-specialist-slice "..."`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`

## Current Outcome

The specialist-wing slice is complete. `Ops Control`, `Research Lab`,
`Validation Office`, and `Review Office` now read as quieter, more distinct
secondary rooms around the dominant commons/impl core, with less decorative
chrome and clearer fixture identity.

## Frontend Review 2026-04-02 Ambient Slice Status

- [x] Claude recommendation for ambient-signal slice captured
- [x] avatar motion was softened
- [x] task markers were reduced
- [x] flashing error animation was removed
- [x] dashboard tests and build passed
- [x] `.conitens/context/*` refreshed

## Frontend Review 2026-04-02 Ambient Slice Commands Run

- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug pixel-office-ambient-slice "..."`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`

## Current Outcome

The ambient-signal slice is complete. The office stage still communicates room
status and task urgency, but avatars and task markers now behave more like
background operator cues and less like game actors competing with the layout.

## Frontend Review 2026-04-02 Preview Route Status

- [x] preview-route gap confirmed
- [x] Claude recommendation for preview-route slice captured
- [x] `#/office-preview` route added
- [x] route regression test added
- [x] dashboard tests and build passed
- [x] review doc refreshed with current slice status
- [x] `.conitens/context/*` refreshed

## Frontend Review 2026-04-02 Preview Route Commands Run

- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug pixel-office-preview-route "..."`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`

## Current Outcome

The pixel-office preview-route slice is complete. The forward shell remains the
default app surface, and a contained `#/office-preview` path now exists so the
review doc's browser-based visual verification can proceed without coupling
pixel-office layout work to the live forward operator shell.

## Frontend Review 2026-04-02 Phase 4 Verification Status

- [x] Playwright Chromium installed
- [x] office-preview route screenshot captured
- [x] visual review completed
- [x] review doc updated with verification outcome
- [x] `.conitens/context/*` refreshed

## Frontend Review 2026-04-02 Phase 4 Verification Commands Run

- `npx playwright install chromium`
- `npx playwright screenshot --browser chromium --viewport-size "1440,980" --wait-for-timeout 2500 "http://127.0.0.1:4291/#/office-preview" "output/playwright/office-preview-2026-04-02-final.png"`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`

## Current Outcome

Phase 4 verification is complete enough to close the review document's browser
validation step. The office preview has screenshot evidence, the final visual
check found no major blocker, and the remaining issues are minor polish debt
rather than architecture or correctness problems.

## Frontend Review 2026-04-02 Final Polish Status

- [x] Claude recommendation for final polish slice captured
- [x] stage rows made flexible to reduce dead space
- [x] rail row spacing slightly relaxed
- [x] refreshed Playwright screenshot captured
- [x] review/context docs refreshed

## Frontend Review 2026-04-02 Final Polish Commands Run

- `python scripts/ensemble_claude_review.py --workspace . --timeout-seconds 300 --effort medium --slug pixel-office-final-polish "..."`
- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- `npx playwright screenshot --browser chromium --viewport-size "1440,980" --wait-for-timeout 2500 "http://127.0.0.1:4291/#/office-preview" "output/playwright/office-preview-2026-04-02-final-2.png"`

## Current Outcome

The final polish slice is complete. The office stage now fills the preview shell
more proportionally, the right rail breathes slightly better, and the frontend
review document is effectively down to minor optional polish and structural
cleanup rather than visual or behavioral blockers.

## Dashboard Real-User Review Status

- [x] current runtime/repo context reread before review
- [x] latest dashboard change window identified from recent commits
- [x] key Wave A-D files inspected directly
- [x] team-mode attempt executed and failure captured accurately
- [x] durable real-user review artifact written
- [x] `.conitens/context/*` refreshed

## Dashboard Real-User Review Commands Run

- `Get-Content .conitens/context/LATEST_CONTEXT.md`
- `Get-Content .vibe/context/LATEST_CONTEXT.md`
- `git log --oneline --decorate -n 8`
- `git diff --stat HEAD~5..HEAD`
- `Get-Content docs/frontend/FRONTEND_REVIEW_2026-04-02.md`
- `omx_run_team_start(...)`
- `omx_run_team_status(jobId=omx-mnh7v86v)`
- numbered file reads over:
  - `packages/dashboard/src/App.tsx`
  - `packages/dashboard/src/styles.css`
  - `packages/dashboard/src/forward-route.ts`
  - `packages/dashboard/src/components/AgentFleetOverview.tsx`
  - `packages/dashboard/src/components/AgentProfilePanel.tsx`
  - `packages/dashboard/src/components/AgentRelationshipGraph.tsx`
  - `packages/dashboard/src/components/OnboardingOverlay.tsx`
  - `packages/dashboard/src/components/ProposalQueuePanel.tsx`
  - `packages/dashboard/src/agent-fleet-model.ts`
  - `packages/dashboard/src/evolution-model.ts`
- `view_image output/playwright/office-preview-2026-04-02-final-2.png`

## Current Outcome

The dashboard real-user review is complete as a read-only product/code review.
The strongest issues are trust-boundary problems on the new `Agents` surface:
demo-backed data and local-only actions are currently presented with the visual
weight of live operational controls. The resulting review artifact prioritizes
making demo/live boundaries explicit, removing fake controls, and then wiring
the highest-value agent/fleet views to real bridge-backed data.

## Dashboard Refactor Review Status

- [x] latest dashboard refactor commit identified
- [x] changed files inspected directly
- [x] dashboard build rerun successfully
- [x] dashboard test suite rerun and failure captured
- [x] code + security review artifact written
- [x] `.conitens/context/*` refreshed

## Dashboard Refactor Review Commands Run

- `git log --oneline --decorate -n 12`
- `git show --stat --name-only -n 1 HEAD`
- numbered file reads over:
  - `packages/dashboard/src/components/ForwardShell.tsx`
  - `packages/dashboard/src/components/ProposalQueuePanel.tsx`
  - `packages/dashboard/src/components/TrustBadge.tsx`
  - `packages/dashboard/src/components/OverviewDashboard.tsx`
  - `packages/dashboard/src/components/KanbanBoard.tsx`
  - `packages/dashboard/src/components/TaskDetailModal.tsx`
  - `packages/dashboard/src/components/AgentRelationshipGraph.tsx`
  - `packages/dashboard/src/store/event-store.ts`
  - `packages/dashboard/src/demo-data.ts`
  - `packages/dashboard/src/dashboard-model.ts`
  - `packages/dashboard/src/forward-route.ts`
  - `packages/dashboard/src/components/Timeline.tsx`
- `pnpm.cmd --filter @conitens/dashboard build`
- `pnpm.cmd --filter @conitens/dashboard test`

## Current Outcome

The dashboard refactor review is complete. Build verification passed, but the
dashboard package test suite still has one failing assertion after the refactor.
The strongest code findings are a broken demo board/task-detail flow and trust
state work that was introduced but not actually mounted in the rendered shell.

## Dashboard Refactor Fix Execution Status

- [x] review findings were converted into a scoped fix plan
- [x] demo board/task-detail flow was repaired
- [x] trust-state indicator was mounted in the shell
- [x] deterministic demo timestamp behavior was restored
- [x] dashboard package build passed
- [x] dashboard package tests passed
- [x] execution summary and `.conitens/context/*` were refreshed

## Dashboard Refactor Fix Execution Commands Run

- `tmux new-session -d -s omx_dashboard_refactor`
- `omx.cmd team --help`
- `omx_run_team_start(...)`
- `omx_run_team_status(jobId=omx-mnhgmhvy)`
- numbered file reads over:
  - `packages/dashboard/src/components/ForwardShell.tsx`
  - `packages/dashboard/src/components/OverviewDashboard.tsx`
  - `packages/dashboard/src/components/KanbanBoard.tsx`
  - `packages/dashboard/src/components/TaskDetailModal.tsx`
  - `packages/dashboard/src/components/TrustBadge.tsx`
  - `packages/dashboard/src/store/event-store.ts`
  - `packages/dashboard/src/demo-data.ts`
  - `packages/dashboard/src/dashboard-model.ts`
  - `packages/dashboard/tests/dashboard-model.test.mjs`
  - `packages/dashboard/tests/event-store.test.mjs`
- `pnpm.cmd --filter @conitens/dashboard build`
- `pnpm.cmd --filter @conitens/dashboard test`

## Current Outcome

The dashboard refactor fix pass is complete. The package now rebuilds cleanly,
the full dashboard test suite is green again, demo task interactions are backed
by a seeded/resolved store path, and the trust indicator is finally mounted in
the rendered shell. Team mode was attempted again but still cannot run end to
end in this session because the OMX runtime does not see a tmux-backed leader
pane.

## Pixel Office Rail Quieting Status

- [x] current rail CSS and approved review guidance inspected before edits
- [x] rail styling kept within the owned sidebar surface
- [x] small-text readability improved without changing row caps or data model
- [x] dashboard package build rerun successfully
- [x] dashboard package test run rerun and unrelated failures recorded
- [x] `.conitens/context/*` refreshed for the scoped rail pass

## Pixel Office Rail Quieting Commands Run

- `Get-Content .conitens/context/LATEST_CONTEXT.md`
- `Get-Content .vibe/context/LATEST_CONTEXT.md`
- `Get-Content docs/frontend/FRONTEND_REVIEW_2026-04-02.md`
- `Get-Content packages/dashboard/src/office-sidebar.module.css`
- `Get-Content packages/dashboard/src/components/OfficeSidebar.tsx`
- `git diff -- packages/dashboard/src/office-sidebar.module.css`
- `npx tsc --noEmit --pretty false --project D:\Google\.Conitens\packages\dashboard\tsconfig.json`
- `pnpm --filter @conitens/dashboard build`
- `pnpm --filter @conitens/dashboard test`

## Current Outcome

The rail half of the approved Pixel Office quieting pass is complete. The right
rail is flatter and quieter, dense copy is easier to scan, and the blocked
signal now matches the repo's non-flashing ambient direction. The dashboard
build passes, while the remaining dashboard test failures are unrelated
fixture-schema assertions already outside this rail-only scope.
