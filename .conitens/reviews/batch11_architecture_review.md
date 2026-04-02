# Batch 11 Architecture Review

## 1. Executive summary

Conitens now contains a substantial forward-looking Batch 1-11 architecture
under `scripts/ensemble_*.py`, `.conitens/`, `.agents/skills/`, and `.vibe/`.
At the module level, many of the intended boundaries are sound: persistent
SQLite state exists, compact task packets exist, approval pause/resume exists,
room/replay state is separate from execution packets, and the fast/slow
`.vibe` lanes are split in code.

The main architectural problem is not that the individual pieces are absent.
It is that the repository now carries **two partially overlapping control
planes**:

1. the accepted active runtime truth in `scripts/ensemble.py` + `.notes/` +
   `.agent/` per [CONITENS.md](D:/Google/.Conitens/CONITENS.md) and
   [docs/adr-0001-control-plane.md](D:/Google/.Conitens/docs/adr-0001-control-plane.md)
2. the forward Ralph-aware `.conitens` / `ensemble_loop_repository` stack,
   which is implemented but not promoted into the active runtime

That split creates most of the real risk:

- restartability is only partially realized at the **full** Batch 11 state
  level
- markdown digests behave more like checked-in summaries than current
  operational source-of-truth artifacts in this repo snapshot
- replay/room state exists in both legacy `.notes` files and newer SQLite
  tables
- the fast lane and sidecar tooling are present but have activation and
  freshness gaps

The repo is **ready for surgical refactor** if the target is explicitly the
forward `.conitens` architecture. It is **not** ready for an unscoped
"cleanup" because the first decision still needs to be whether the forward
stack is being promoted into the active runtime or kept as a parallel
reference/control surface.

## 2. What is architecturally sound

- The repo documents the runtime split clearly. [AGENTS.md](D:/Google/.Conitens/AGENTS.md),
  [CONITENS.md](D:/Google/.Conitens/CONITENS.md), and
  [docs/adr-0001-control-plane.md](D:/Google/.Conitens/docs/adr-0001-control-plane.md)
  consistently state that `scripts/ensemble.py` + `.notes/` + `.agent/` remain
  the active runtime truth while `.conitens` is the forward surface.
- The SQLite-backed forward state model is structurally coherent in
  [scripts/ensemble_loop_repository.py](D:/Google/.Conitens/scripts/ensemble_loop_repository.py):
  runs, iterations, validator results, stop conditions, escalations, context
  files, memory records, checkpoints, approvals, rooms, insights, and handoff
  packets are all modeled with additive migrations.
- The execution packet boundary is conceptually sound. [scripts/ensemble_context_assembler.py](D:/Google/.Conitens/scripts/ensemble_context_assembler.py)
  excludes identity memory and unapproved patches, uses a bounded recent
  message slice, and prefers handoff summaries before room transcript.
- Approval pause/resume is materially safer after Batch 10. [scripts/ensemble_approval.py](D:/Google/.Conitens/scripts/ensemble_approval.py)
  and [scripts/ensemble_orchestration.py](D:/Google/.Conitens/scripts/ensemble_orchestration.py)
  pin resume to `pending_approval_request_id` and reinject rejection feedback.
- Replay/room evidence is kept outside the execution backbone. [scripts/ensemble_room_service.py](D:/Google/.Conitens/scripts/ensemble_room_service.py),
  [scripts/ensemble_replay_service.py](D:/Google/.Conitens/scripts/ensemble_replay_service.py),
  and [scripts/ensemble_ag2_room_adapter.py](D:/Google/.Conitens/scripts/ensemble_ag2_room_adapter.py)
  keep room episodes as visible/replayable artifacts rather than the primary
  orchestrator state machine.
- Test coverage is materially better than typical for a staged architecture.
  `python -m unittest discover tests` passed with 106 tests, and `pnpm.cmd test`
  passed across the workspace during this audit.

## 3. Severity-ranked issues (P0/P1/P2/P3)

### P0

- None found.

### P1

- **Forward runtime stack is implemented but not integrated into the active runtime truth.**
  The active runtime remains [CONITENS.md:21](D:/Google/.Conitens/CONITENS.md:21),
  [CONITENS.md:56](D:/Google/.Conitens/CONITENS.md:56), and
  [docs/adr-0001-control-plane.md:15](D:/Google/.Conitens/docs/adr-0001-control-plane.md:15).
  `bin/ensemble.js` still delegates only to [scripts/ensemble.py](D:/Google/.Conitens/bin/ensemble.js),
  and a repository search shows no references from `scripts/ensemble.py` to
  `ensemble_loop_repository`, `ensemble_orchestration`, `ensemble_execution_loop`,
  `ensemble_context_assembler`, `ensemble_approval`, `ensemble_room_service`, or
  `ensemble_replay_service`. The result is a parallel architecture, not a
  promoted one.
- **Restartability is incomplete at the full Batch 11 state level.**
  [scripts/ensemble_state_restore.py:15](D:/Google/.Conitens/scripts/ensemble_state_restore.py:15)
  restores via [scripts/ensemble_loop_repository.py:846](D:/Google/.Conitens/scripts/ensemble_loop_repository.py:846)
  `load_run_snapshot()`, but that snapshot only includes runs, iterations,
  validator results, stop conditions, escalations, task plan, findings, and
  progress entries. It omits orchestration checkpoints, retry decisions,
  approval requests, rooms/messages/tool events, insights, handoff packets, and
  memory records. [scripts/ensemble_loop_debug.py:19](D:/Google/.Conitens/scripts/ensemble_loop_debug.py:19)
  has the same omission.
- **The checked-in runtime artifacts are materially out of sync with the current forward schema.**
  The live checked-in `.conitens/runtime/loop_state.sqlite3` was inspected at
  `PRAGMA user_version=3` while [scripts/ensemble_loop_repository.py:18](D:/Google/.Conitens/scripts/ensemble_loop_repository.py:18)
  declares `SCHEMA_VERSION = 8`. The same DB currently contains zero rows in
  `runs`, `iterations`, `validator_results`, `context_task_plans`,
  `context_findings`, `context_progress_entries`, and `memory_records`. The
  checked-in `.conitens/context/*.md` files therefore read as documentation
  snapshots, not current runtime projections.
- **The Manus-style markdown "working source-of-truth" contract is not actually true in the repo snapshot.**
  [scripts/ensemble_context_markdown.py](D:/Google/.Conitens/scripts/ensemble_context_markdown.py)
  explicitly treats markdown as a deterministic projection from DB state, and
  current DB state is empty. Yet `.conitens/context/task_plan.md`,
  `.conitens/context/findings.md`, `.conitens/context/progress.md`, and
  `.conitens/context/LATEST_CONTEXT.md` are checked in with completed Batch 11
  narrative. This is operationally useful documentation, but it is not the same
  thing as current generated state.

### P2

- **Room/replay state has overlapping sources of truth.**
  The older room model in [scripts/ensemble_agents.py:515](D:/Google/.Conitens/scripts/ensemble_agents.py:515),
  [scripts/ensemble_agents.py:548](D:/Google/.Conitens/scripts/ensemble_agents.py:548),
  and [scripts/ensemble_agents.py:558](D:/Google/.Conitens/scripts/ensemble_agents.py:558)
  coexists with the Batch 11 model in [scripts/ensemble_room.py:47](D:/Google/.Conitens/scripts/ensemble_room.py:47),
  [scripts/ensemble_room_service.py:34](D:/Google/.Conitens/scripts/ensemble_room_service.py:34),
  and [scripts/ensemble_room_service.py:179](D:/Google/.Conitens/scripts/ensemble_room_service.py:179).
  The visible UI in [scripts/ensemble_ui.py](D:/Google/.Conitens/scripts/ensemble_ui.py) still
  populates room lists through `ensemble_agents.list_rooms()` rather than the
  newer SQLite-backed room service, so the new replay layer is not the sole
  visible room source.
- **ContextAssembler still reads legacy transcript files directly.**
  [scripts/ensemble_context_assembler.py:201](D:/Google/.Conitens/scripts/ensemble_context_assembler.py:201)
  falls back to `show_room()` at
  [scripts/ensemble_context_assembler.py:221](D:/Google/.Conitens/scripts/ensemble_context_assembler.py:221),
  which reads `.notes/rooms/*.jsonl`, not the newer `messages` table. The slice
  is bounded, so this is not a catastrophic token leak, but it is a
  source-of-truth split and a context-discipline regression risk.
- **The orchestration layer duplicates iterative control logic.**
  [scripts/ensemble_orchestration.py:220](D:/Google/.Conitens/scripts/ensemble_orchestration.py:220),
  [scripts/ensemble_orchestration.py:225](D:/Google/.Conitens/scripts/ensemble_orchestration.py:225),
  [scripts/ensemble_orchestration.py:232](D:/Google/.Conitens/scripts/ensemble_orchestration.py:232),
  and `_apply_loop_result()` recreate control-flow logic that also exists in
  [scripts/ensemble_execution_loop.py](D:/Google/.Conitens/scripts/ensemble_execution_loop.py)
  `IterativeBuildLoop.run()`. There are effectively two loop controllers now:
  `BuildGraph.run()` and `IterativeBuildLoop.run()`.
- **The `.vibe` sidecar has duplicate configuration and state artifacts.**
  [.vibe/config.json:5](D:/Google/.Conitens/.vibe/config.json:5) and
  [.vibe/config.json:8](D:/Google/.Conitens/.vibe/config.json:8) both define
  `typecheck_baseline_path`, and [.vibe/config.json:6](D:/Google/.Conitens/.vibe/config.json:6)
  and [.vibe/config.json:7](D:/Google/.Conitens/.vibe/config.json:7) both
  define `doctor_report_path`. `.vibe/brain/context.sqlite3` and
  `.vibe/brain/context_repo.sqlite3` both exist, but only the former is wired
  by config. [`.vibe/context/LATEST_CONTEXT.md`](D:/Google/.Conitens/.vibe/context/LATEST_CONTEXT.md)
  is also stale relative to Batch 11 changes.
- **The fast lane is not obviously active by default.**
  [scripts/install_hooks.py:14](D:/Google/.Conitens/scripts/install_hooks.py:14)
  only writes `.githooks/pre-commit`; it does not activate `core.hooksPath`.
  There is a richer installer in [scripts/ensemble_hooks.py:257](D:/Google/.Conitens/scripts/ensemble_hooks.py:257)
  that can call `git config core.hooksPath`, but the standalone installer and
  the richer installer are divergent entrypoints.
- **Fast-lane smoke coverage is too narrow for the newer architecture.**
  [`.vibe/brain/run_core_tests.py:14`](D:/Google/.Conitens/.vibe/brain/run_core_tests.py:14)
  only chooses `tests.test_loop_state` and `tests.test_context_markdown` for
  broad `scripts/*` changes. Approval/orchestration/replay changes can pass the
  fast lane without running `tests.test_approval_controls`,
  `tests.test_execution_loop`, `tests.test_orchestration*`, or
  `tests.test_room_replay`.
- **The repo-intelligence DB helper has duplicate method definitions.**
  [`.vibe/brain/context_db.py:290`](D:/Google/.Conitens/.vibe/brain/context_db.py:290) and
  [`.vibe/brain/context_db.py:295`](D:/Google/.Conitens/.vibe/brain/context_db.py:295)
  both define `list_files()`, and
  [`.vibe/brain/context_db.py:322`](D:/Google/.Conitens/.vibe/brain/context_db.py:322) and
  [`.vibe/brain/context_db.py:402`](D:/Google/.Conitens/.vibe/brain/context_db.py:402)
  both define `query_scalar()`. The later definitions silently shadow the
  earlier ones.

### P3

- **TaskDelegationAdapter loads full skill bodies when it only needs skill ids.**
  [scripts/ensemble_execution_loop.py:72](D:/Google/.Conitens/scripts/ensemble_execution_loop.py:72)
  calls `load_skill_content()` for every default skill even though it only uses
  `skill_id` downstream. This is not a prompt-packet leak by itself, but it is
  unnecessary loading and tightens coupling to the full SKILL body format.
- **The forward `.conitens/memory/` and `.conitens/rooms/` directories are effectively placeholders.**
  The actual persisted forward state lives in SQLite, and the legacy room state
  lives in `.notes/rooms`. The checked-in `.conitens/memory/` and
  `.conitens/rooms/` directories only contain `.gitkeep`, which makes their
  intended runtime meaning ambiguous.
- **Python test output shows a resource-leak warning.**
  During `python -m unittest discover tests`, Python emitted a
  `ResourceWarning` about a subprocess still running. It did not fail the suite,
  but it indicates a cleanup/observability gap in the test harness.

## 4. Invariant drift table

| Invariant | Intended contract | Actual state | Drift |
| --- | --- | --- | --- |
| Disk-backed restartability | Batch 11 state recoverable from persisted state only | `StateRestoreService` restores only the older snapshot subset | High |
| Markdown working source-of-truth | `.conitens/context/*` operationally reflect current state | checked-in markdown exists while current loop DB is empty | High |
| Validator is final quality gate | planner -> execute -> validate visible and enforced | true in forward stack; not wired into active `scripts/ensemble.py` runtime | Medium |
| No transcript-default execution context | packet should stay compact and selective | handoff-first works, but assembler still falls back to `.notes/rooms` transcript files | Medium |
| AG2 only for visible room episodes | replaceable room adapter, not orchestration backbone | adapter boundary is respected, but UI still reads older room model in places | Low |
| Mandatory repo digest freshness | `.vibe/context/LATEST_CONTEXT.md` reflects current repo state | digest is stale relative to Batch 11 changes | Medium |
| Staged-only fast lane | precommit should be active and cheap | logic exists, activation is not automatic, smoke set is too narrow | Medium |

## 5. Duplicate abstraction table

| Area | Overlapping abstractions | Evidence | Recommendation |
| --- | --- | --- | --- |
| Room model | `ensemble_agents` room helpers, `ensemble_room`, `ensemble_room_service` | [scripts/ensemble_agents.py:515](D:/Google/.Conitens/scripts/ensemble_agents.py:515), [scripts/ensemble_room.py:47](D:/Google/.Conitens/scripts/ensemble_room.py:47), [scripts/ensemble_room_service.py:34](D:/Google/.Conitens/scripts/ensemble_room_service.py:34) | Collapse on `RoomService` and make legacy helpers thin adapters only |
| Hook install | `scripts/install_hooks.py` vs `ensemble_hooks.install_hooks()` | [scripts/install_hooks.py:14](D:/Google/.Conitens/scripts/install_hooks.py:14), [scripts/ensemble_hooks.py:257](D:/Google/.Conitens/scripts/ensemble_hooks.py:257) | Keep one public hook installer |
| Loop control | `BuildGraph.run/_apply_loop_result` vs `IterativeBuildLoop.run` | [scripts/ensemble_orchestration.py](D:/Google/.Conitens/scripts/ensemble_orchestration.py), [scripts/ensemble_execution_loop.py](D:/Google/.Conitens/scripts/ensemble_execution_loop.py) | Pick one owner for retry/approval orchestration |
| Repo DB helper | duplicated `list_files()` and `query_scalar()` in `context_db.py` | [`.vibe/brain/context_db.py:290`](D:/Google/.Conitens/.vibe/brain/context_db.py:290), [`.vibe/brain/context_db.py:295`](D:/Google/.Conitens/.vibe/brain/context_db.py:295), [`.vibe/brain/context_db.py:322`](D:/Google/.Conitens/.vibe/brain/context_db.py:322), [`.vibe/brain/context_db.py:402`](D:/Google/.Conitens/.vibe/brain/context_db.py:402) | Remove the shadowed versions |
| Runtime state artifact | checked-in `.conitens/context/*.md` vs generated DB-backed files | `.conitens/context/*` content vs empty `.conitens/runtime/loop_state.sqlite3` | Decide whether these files are generated state or versioned documentation |

## 6. State duplication / source-of-truth conflicts

- **Active runtime vs forward runtime**
  - Active: `scripts/ensemble.py` + `.notes/` + `.agent/`
  - Forward: `.conitens` + `ensemble_loop_repository`
  - Conflict: both are implemented, neither is clearly deprecated
- **Room state**
  - Legacy: `.notes/rooms/*.json` and `.jsonl` via `ensemble_agents` and `ensemble_room`
  - Forward: `rooms` and `messages` tables in `loop_state.sqlite3`
  - Conflict: UI room lists still come from legacy `list_rooms()`
- **Handoff state**
  - Legacy: `.notes/handoffs/*.json`
  - Forward: `handoff_packets` table
  - Conflict: packet storage exists, but the older handoff files are still the
    primary surface many modules consume
- **Context state**
  - Forward DB: `context_task_plans`, `context_findings`, `context_progress_entries`
  - Files: `.conitens/context/*.md`
  - Conflict: files are projections in code, but checked-in as static completed
    docs in repo state
- **Repo intelligence**
  - Primary config path points to `.vibe/brain/context.sqlite3`
  - Extra DB `.vibe/brain/context_repo.sqlite3` exists
  - Conflict: unclear whether the second DB is stale, shadow, or intentional

## 7. Token/context risks

- [scripts/ensemble_context_assembler.py:201](D:/Google/.Conitens/scripts/ensemble_context_assembler.py:201)
  still falls back to room transcript files through `show_room()`. The slice is
  capped and truncated, but the source is still transcript rather than the
  newer structured room tables.
- [scripts/ensemble_execution_loop.py:72](D:/Google/.Conitens/scripts/ensemble_execution_loop.py:72)
  loads full skill content bodies, which is unnecessary work and raises the
  chance of future prompt assembly accidentally binding to skill prose instead
  of metadata.
- The packet budget uses char/4 approximation only. This is acceptable for a
  provider-agnostic v0, but there is no test asserting packet size ceilings
  against richer room/replay states beyond the current small fixtures.
- The packet’s recent-message source uses handoffs first, which is good, but
  handoff coverage is not guaranteed. When handoff is absent, transcript fallback
  still exists.

## 8. Security/HITL risks

- The approval path itself is materially sound in the forward stack:
  [scripts/ensemble_approval.py](D:/Google/.Conitens/scripts/ensemble_approval.py),
  [scripts/ensemble_execution_loop.py](D:/Google/.Conitens/scripts/ensemble_execution_loop.py),
  and [scripts/ensemble_orchestration.py](D:/Google/.Conitens/scripts/ensemble_orchestration.py)
  prevent silent risky-action continuation and persist approval outcomes.
- The bigger risk is **recovery visibility**, not silent bypass:
  restore/debug snapshot helpers do not currently surface the full approval or
  checkpoint state.
- The visible dashboard route adds write endpoints in
  [scripts/ensemble_ui.py](D:/Google/.Conitens/scripts/ensemble_ui.py). These are
  protected by loopback checks and a dashboard token, which is good, but they
  are part of a different surface from the `.conitens` approval queue and could
  become another mutation path if they grow without shared policy integration.
- There is still no single end-to-end test proving that a pending approval can
  survive process restart and then resume correctly through the generic restore
  path rather than direct `BuildGraph.resume_after_approval()`.

## 9. Test and observability gaps

- **Missing end-to-end recovery test across new state tables**
  - Existing coverage:
    - [tests/test_loop_state.py:65](D:/Google/.Conitens/tests/test_loop_state.py:65) restores only the older run/iteration snapshot
    - [tests/test_approval_controls.py:155](D:/Google/.Conitens/tests/test_approval_controls.py:155) tests approval resume in an isolated temp workspace
    - [tests/test_room_replay.py:239](D:/Google/.Conitens/tests/test_room_replay.py:239) tests replay API visibility
  - Missing:
    - full restart proof for orchestration checkpoint + approval pending + replay state + insight state
- **Fast-lane smoke does not cover newer critical modules**
  - `run_core_tests.py` does not route approval/orchestration/replay changes to
    their corresponding tests
- **Hook activation is not proven**
  - tests only verify installer behavior or existence, not that Git will
    actually invoke the hook in a normal developer repo
- **Repo-intelligence freshness is not guarded**
  - tests cover generation behavior, but there is no freshness assertion that
    `.vibe/context/LATEST_CONTEXT.md` matches recent indexed changes in the real
    repo
- **ResourceWarning in Python suite**
  - the suite passes, but a lingering subprocess warning suggests at least one
    test fixture leaks cleanup state

## 10. Delete/merge/simplify candidates

- Merge `scripts/install_hooks.py` into `scripts/ensemble_hooks.py` and remove
  the standalone installer.
- Collapse room handling behind `RoomService`; deprecate direct room helpers in
  `ensemble_agents.py` and make `ensemble_room.py` a persistence adapter only.
- Narrow `TaskDelegationAdapter` to metadata-only skill resolution.
- Remove duplicate methods from `.vibe/brain/context_db.py`.
- Delete or formally retire `.vibe/brain/context_repo.sqlite3` if it is not a
  supported state surface.
- Decide whether `.conitens/context/*.md` are generated runtime artifacts or
  versioned architectural summaries; stop treating them as both.

## 11. Top 5 refactors by leverage

1. **Promote or explicitly quarantine the forward `.conitens` runtime**
   - Either integrate it into the active CLI/runtime path or mark it as
     non-operational reference code with stronger wording and narrower
     interfaces.
2. **Expand `load_run_snapshot()` into a real post-Batch11 run snapshot**
   - Include checkpoints, retry decisions, approvals, rooms, tool events,
     insights, handoff packets, and maybe memory summaries.
3. **Unify room state around `RoomService`**
   - Make the UI, replay, and packet fallback read from one room abstraction.
4. **Fix `.vibe` sidecar duplication**
   - single config, single DB, single hook installer, single `ContextDB`
     method definitions.
5. **Broaden fast-lane smoke routing**
   - include approval/orchestration/replay test surfaces for changes touching
     those modules.

## 12. Recommended refactor order

1. **Decide runtime promotion boundary first**
   - Clarify whether the Batch 1-11 stack is being promoted or kept parallel.
2. **Refactor snapshot/restore and debug surfaces**
   - Make recovery and debug JSON reflect actual Batch 11 state.
3. **Unify room/handoff abstractions**
   - Collapse duplicate room layers before further replay/UI work.
4. **Tighten packet input sources**
   - Move transcript fallback off raw `.notes` room files and onto the unified
     room service or remove it.
5. **Simplify `.vibe`**
   - remove duplicate config keys and DB helpers, then tighten fast-lane smoke
     routing and activation.
6. **Then do module-level cleanup**
   - remove shadowed helpers, rename misleading stubs, narrow APIs.

## 13. Minimal validation commands to run after refactor

```powershell
python -m unittest tests.test_loop_state tests.test_context_markdown tests.test_context_assembler tests.test_orchestration_skeleton tests.test_execution_loop tests.test_approval_controls tests.test_room_replay
python -m unittest tests.test_operations_layer
python -m unittest discover tests
pnpm.cmd test
python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble_loop_repository.py --file scripts/ensemble_context_assembler.py
```
