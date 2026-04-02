# Batch 11 Refactor Plan

## 1. Refactor goals

- Reduce architectural duplication without changing the current product
  direction.
- Make restartability and source-of-truth boundaries explicit and testable.
- Keep execution packets selective and compact.
- Preserve validator-first completion semantics and approval safety.
- Keep the replay/room layer visible and evidence-oriented without promoting it
  into the orchestration backbone.
- Simplify the `.vibe` sidecar so its outputs are trustworthy and operationally
  useful.

## 2. Invariants that must remain true

- Ralph-aware execution remains disk-backed and restartable from persisted
  state.
- `task_plan.md`, `findings.md`, `progress.md`, and `LATEST_CONTEXT.md` remain
  part of the working shared-state story.
- `progress.md` remains append-only.
- Planner -> Execute -> Validate semantics remain visible.
- Validator remains the mandatory gate before success.
- AG2 remains confined to room/debate/review episodes, not the core state
  machine.
- OpenHands-compatible skill layout remains under `.agents/skills/*/SKILL.md`.
- No vector DB or embeddings are introduced.
- No repo-wide formatting or JSDoc sweep is introduced.
- Persona identity core remains non-auto-mutable.

## 3. Selected refactors

Only 5 high-leverage refactors are selected.

### Refactor 1: Complete the forward snapshot/restore contract

**Why this matters**

The forward `.conitens` architecture cannot honestly claim Batch 11
restartability until restore/debug surfaces cover the actual persisted state,
 not just the early Batch 1-3 subset.

**Current problem**

- `load_run_snapshot()` omits checkpoints, retry decisions, approvals, rooms,
  tool events, insights, handoff packets, and memory summaries.
- `StateRestoreService` and `LoopStateDebugWriter` therefore restore/debug an
  incomplete state model.
- The checked-in runtime DB is behind the declared schema and currently empty,
  which makes the checked-in `.conitens/context/*` files look operational when
  they are effectively architectural summaries in this repo snapshot.

**Affected modules/files**

- [ensemble_loop_repository.py](D:/Google/.Conitens/scripts/ensemble_loop_repository.py)
- [ensemble_state_restore.py](D:/Google/.Conitens/scripts/ensemble_state_restore.py)
- [ensemble_loop_debug.py](D:/Google/.Conitens/scripts/ensemble_loop_debug.py)
- [test_loop_state.py](D:/Google/.Conitens/tests/test_loop_state.py)
- [test_approval_controls.py](D:/Google/.Conitens/tests/test_approval_controls.py)
- [test_room_replay.py](D:/Google/.Conitens/tests/test_room_replay.py)

**Proposed change**

- Expand `load_run_snapshot()` to include:
  - orchestration checkpoints
  - retry decisions
  - approval requests
  - rooms/messages/tool_events
  - insights
  - handoff packets
  - at least a bounded memory summary keyed by namespace/agent
- Make `StateRestoreService` return that expanded snapshot.
- Make `loop_state.json` a full debug mirror of the expanded snapshot.
- Add a clear normalization step for checked-in runtime artifacts:
  treat checked-in `.conitens/context/*` as generated runtime artifacts only if
  the runtime DB is current and populated; otherwise document them as
  architectural summaries.

**Expected benefit**

- Stronger real restartability
- Better audit/debug visibility
- Fewer hidden assumptions for future agents
- Clearer source-of-truth contract for `.conitens`

**Risk level**

- Medium

**Rollback strategy**

- Keep the old snapshot shape available behind a helper during the refactor.
- If downstream callers break, temporarily expose both old and new snapshot
  keys until call sites are updated.

**Tests to add/update**

- Extend [test_loop_state.py](D:/Google/.Conitens/tests/test_loop_state.py) to
  assert restore/debug coverage for approvals, checkpoints, and replay state.
- Add an end-to-end restart test covering:
  run -> iteration -> approval pending -> resume -> room episode -> insight.

**Validation commands**

```powershell
python -m unittest tests.test_loop_state tests.test_approval_controls tests.test_room_replay
python -m unittest discover tests
```

**Done-when criteria**

- Restored snapshot includes all post-Batch11 persisted state categories.
- Debug mirror includes the same categories.
- There is at least one full restart test proving recovery without hidden chat
  history.

### Refactor 2: Unify room and handoff state around repository-backed services

**Why this matters**

The room/replay story is currently the largest duplication seam in the repo.
Three room abstractions and two handoff representations force future agents to
load more concepts than necessary and create source-of-truth ambiguity.

**Current problem**

- Room behavior exists in `ensemble_agents.py`, `ensemble_room.py`, and
  `ensemble_room_service.py`.
- The visible UI still lists rooms from the older `.notes`-centric path.
- Handoffs exist as both legacy JSON artifacts and newer `handoff_packets`
  rows, but the packet path is not yet the default consumption surface.

**Affected modules/files**

- [ensemble_agents.py](D:/Google/.Conitens/scripts/ensemble_agents.py)
- [ensemble_room.py](D:/Google/.Conitens/scripts/ensemble_room.py)
- [ensemble_room_service.py](D:/Google/.Conitens/scripts/ensemble_room_service.py)
- [ensemble_handoff.py](D:/Google/.Conitens/scripts/ensemble_handoff.py)
- [ensemble_replay_service.py](D:/Google/.Conitens/scripts/ensemble_replay_service.py)
- [ensemble_ui.py](D:/Google/.Conitens/scripts/ensemble_ui.py)
- [ensemble_office.py](D:/Google/.Conitens/scripts/ensemble_office.py)
- [test_room_replay.py](D:/Google/.Conitens/tests/test_room_replay.py)
- [test_operations_layer.py](D:/Google/.Conitens/tests/test_operations_layer.py)

**Proposed change**

- Make `RoomService` the single public room abstraction.
- Convert legacy room helpers in `ensemble_agents.py` into thin wrappers or
  remove them if no longer needed.
- Keep `.notes/rooms` as a compatibility persistence adapter, not a parallel
  public model.
- Make UI/office/replay consumption paths use `RoomService` / repository-backed
  queries for room lists and snapshots.
- Keep legacy handoff files writable/readable only as compatibility mirrors,
  with `handoff_packets` as the forward retrieval surface.

**Expected benefit**

- Clearer run/iteration/room boundary
- Less duplicated state handling
- Better replay traceability
- Fewer concepts for future agents to load

**Risk level**

- Medium

**Rollback strategy**

- Preserve compatibility wrappers for the old room functions during the wave.
- Keep legacy `.notes` file writes until all consumers are moved.

**Tests to add/update**

- Add explicit compatibility tests proving old room entrypoints still work
  during the transition.
- Update room/replay UI-facing tests to assert room lists come from the unified
  service path.

**Validation commands**

```powershell
python -m unittest tests.test_room_replay tests.test_operations_layer
python -m unittest discover tests
```

**Done-when criteria**

- New room consumers use `RoomService` rather than ad hoc legacy helpers.
- Room list, room snapshot, replay timeline, and handoff retrieval all resolve
  through one forward abstraction.

### Refactor 3: Tighten ContextAssembler and delegation inputs

**Why this matters**

This is the highest-leverage token/context discipline refactor. It narrows the
execution surface without changing user-visible behavior.

**Current problem**

- `ContextAssembler` still falls back to raw legacy room transcript files.
- `TaskDelegationAdapter` loads full skill bodies even though it only needs
  metadata/ids.
- The current packet path still forces future agents to understand both room
  transcript files and handoff summaries.

**Affected modules/files**

- [ensemble_context_assembler.py](D:/Google/.Conitens/scripts/ensemble_context_assembler.py)
- [ensemble_execution_loop.py](D:/Google/.Conitens/scripts/ensemble_execution_loop.py)
- [ensemble_skill_loader.py](D:/Google/.Conitens/scripts/ensemble_skill_loader.py)
- [ensemble_room_service.py](D:/Google/.Conitens/scripts/ensemble_room_service.py)
- [test_context_assembler.py](D:/Google/.Conitens/tests/test_context_assembler.py)
- [test_room_replay.py](D:/Google/.Conitens/tests/test_room_replay.py)

**Proposed change**

- Replace direct `show_room()` transcript fallback with a bounded room-summary
  query from the unified room service.
- Keep handoff summary first, then use bounded room summaries only if needed.
- Add a metadata-only skill resolution path and make `TaskDelegationAdapter`
  depend on that rather than full `load_skill_content()`.
- Add a hard internal max for recent message count and total chars regardless
  of caller-supplied limits.

**Expected benefit**

- Less context bloat
- Fewer hidden transcript dependencies
- Cleaner persona/skill/task-kernel separation
- Lower chance of prompt packet regression

**Risk level**

- Small to medium

**Rollback strategy**

- Keep the old transcript fallback behind a private compatibility branch until
  the new bounded room-summary path is verified.
- Keep the old full-skill loader path available for debugging until the
  metadata-only path is stable.

**Tests to add/update**

- Extend [test_context_assembler.py](D:/Google/.Conitens/tests/test_context_assembler.py)
  to assert the room-summary path is used instead of raw transcript-file reads.
- Add tests asserting skill bodies are not loaded in the delegation path.

**Validation commands**

```powershell
python -m unittest tests.test_context_assembler tests.test_execution_loop tests.test_room_replay
python -m unittest discover tests
```

**Done-when criteria**

- Execution packet assembly no longer depends on raw legacy room transcript
  files.
- Delegation no longer loads full skill bodies for normal execution.
- Packet size limits remain stable under richer room/replay fixtures.

### Refactor 4: Collapse duplicate validator/retry/escalation control flow

**Why this matters**

There should be one obvious owner for iteration control. Right now there are
two overlapping loops, which makes restartability and approval semantics harder
to reason about.

**Current problem**

- `BuildGraph` owns a partial iterative loop.
- `IterativeBuildLoop.run()` also owns iterative control.
- Approval, retry, reflection, and completion semantics therefore live in two
  places.

**Affected modules/files**

- [ensemble_orchestration.py](D:/Google/.Conitens/scripts/ensemble_orchestration.py)
- [ensemble_execution_loop.py](D:/Google/.Conitens/scripts/ensemble_execution_loop.py)
- [test_orchestration_skeleton.py](D:/Google/.Conitens/tests/test_orchestration_skeleton.py)
- [test_execution_loop.py](D:/Google/.Conitens/tests/test_execution_loop.py)
- [test_approval_controls.py](D:/Google/.Conitens/tests/test_approval_controls.py)

**Proposed change**

- Choose one owner for iteration control flow.
- Keep `BuildGraph` as the orchestration shell and make the execution loop own
  all validator/retry/escalation branching, or do the inverse, but not both.
- Reduce `worker_stub` / `validator_stub` / `reflector_stub` naming drift once
  actual behavior is delegated to the chosen owner.
- Keep approval pause/resume semantics intact and fully covered by tests.

**Expected benefit**

- Cleaner execution semantics
- Easier restartability reasoning
- Lower chance of validator bypass or control-flow divergence

**Risk level**

- Medium to high

**Rollback strategy**

- Refactor behind a feature branch with behavior-preserving tests first.
- Keep the previous control owner available until the unified path passes the
  existing approval and retry suites.

**Tests to add/update**

- Add one end-to-end loop-control test that covers success, retry, approval
  pause/resume, and rejection in a single scenario.
- Update orchestration tests to assert exactly one control owner drives retry
  decisions.

**Validation commands**

```powershell
python -m unittest tests.test_execution_loop tests.test_orchestration_skeleton tests.test_approval_controls
python -m unittest discover tests
```

**Done-when criteria**

- There is one clear control-flow owner for validator/retry/escalation.
- Approval and retry behavior remain deterministic and fully tested.
- No duplicated loop branches remain for the same state transition.

### Refactor 5: Simplify and harden the `.vibe` sidecar

**Why this matters**

`.vibe` is supposed to be the repo-intelligence and fast-lane support surface.
Right now it carries avoidable duplication and operational ambiguity.

**Current problem**

- `.vibe/config.json` has duplicate keys.
- `.vibe/brain/context_db.py` has duplicate method definitions.
- Two SQLite files exist under `.vibe/brain`.
- `LATEST_CONTEXT.md` is stale in the checked-in repo.
- Hook installation is split across two entrypoints.
- Fast-lane smoke routing is too narrow for the newer architecture.

**Affected modules/files**

- [.vibe/config.json](D:/Google/.Conitens/.vibe/config.json)
- [context_db.py](D:/Google/.Conitens/.vibe/brain/context_db.py)
- [precommit.py](D:/Google/.Conitens/.vibe/brain/precommit.py)
- [run_core_tests.py](D:/Google/.Conitens/.vibe/brain/run_core_tests.py)
- [doctor.py](D:/Google/.Conitens/.vibe/brain/doctor.py)
- [summarizer.py](D:/Google/.Conitens/.vibe/brain/summarizer.py)
- [scripts/install_hooks.py](D:/Google/.Conitens/scripts/install_hooks.py)
- [scripts/ensemble_hooks.py](D:/Google/.Conitens/scripts/ensemble_hooks.py)
- [test_vibe_quality.py](D:/Google/.Conitens/tests/test_vibe_quality.py)
- [test_vibe_quality_gates.py](D:/Google/.Conitens/tests/test_vibe_quality_gates.py)
- [test_vibe_brain.py](D:/Google/.Conitens/tests/test_vibe_brain.py)

**Proposed change**

- Deduplicate config keys and make one config canonical.
- Remove shadowed helper definitions from `context_db.py`.
- Decide which `.vibe` SQLite DB is canonical and delete/retire the other.
- Merge hook installation onto one entrypoint and make activation explicit.
- Broaden smoke selection for approval/orchestration/replay changes.
- Add a freshness check or regeneration expectation for `.vibe/context/LATEST_CONTEXT.md`.

**Expected benefit**

- More trustworthy repo-intelligence output
- Less operational confusion
- Better fast-lane reliability
- Lower sidecar maintenance burden

**Risk level**

- Small

**Rollback strategy**

- Keep backup copies of the old config/DB path until the sidecar opens
  successfully after the merge.
- Preserve the older hook installer as a temporary compatibility wrapper if
  needed.

**Tests to add/update**

- Add tests for hook activation semantics or at least installer selection.
- Extend fast-lane tests to assert replay/approval/orchestration changes select
  their smoke suites.
- Add a freshness-oriented repo-digest test if practical.

**Validation commands**

```powershell
python -m unittest tests.test_vibe_quality tests.test_vibe_quality_gates tests.test_vibe_brain
python -m unittest discover tests
python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble_approval.py --file scripts/ensemble_orchestration.py
python .vibe/brain/doctor.py --repo-root .
```

**Done-when criteria**

- One `.vibe` config path per setting.
- One canonical `.vibe` SQLite DB.
- One public hook installer path.
- Fast-lane smoke selection covers new architecture-critical changes.

## 4. Suggested execution order

### Wave 1 (small, safest)

- Refactor 5: Simplify and harden the `.vibe` sidecar

Reason:
- isolated from the core forward runtime
- low rollback cost
- removes duplication before deeper refactors

### Wave 2 (medium)

- Refactor 1: Complete the forward snapshot/restore contract

Reason:
- highest restartability leverage
- clarifies what the forward runtime actually means before deeper integration

### Wave 3 (medium)

- Refactor 2: Unify room and handoff state around repository-backed services
- Refactor 3: Tighten ContextAssembler and delegation inputs

Reason:
- these two refactors reinforce each other
- packet tightening is cleaner once room state has one forward abstraction

### Wave 4 (optional, higher-risk)

- Refactor 4: Collapse duplicate validator/retry/escalation control flow

Reason:
- highest semantic risk
- should land only after restore/state and packet boundaries are stable

## 5. Refactors explicitly deferred

- Promoting the forward `.conitens` stack into the active `scripts/ensemble.py`
  runtime and CLI entrypoint
- Direct LangGraph integration instead of the current local boundary
- Real AG2/AutoGen dependency adoption
- React/dashboard or command-center replay UI migration beyond the current
  Python debug route
- Any vector DB, embeddings, or semantic replay retrieval
- Repo-wide formatting, naming normalization, or JSDoc generation

## 6. Estimated diff scope

- Wave 1: **small**
- Wave 2: **medium**
- Wave 3: **medium**
- Wave 4: **medium to large**

