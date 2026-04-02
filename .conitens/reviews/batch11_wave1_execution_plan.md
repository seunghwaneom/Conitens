# Batch 11 Wave 1 Execution Plan

## Execution status

- Wave 1-1: `complete`
- Wave 1-2: `complete`
- Wave 1-3: `complete`

## 1. Wave 1 summary

Wave 1 is the first surgical refactor wave after the Batch 11 architecture
audit. It is intentionally split into three subwaves so execution can stop
after each boundary if restartability, token discipline, or safety semantics
show drift.

Wave 1 focus:

- make the forward `.conitens` state boundary honest and recoverable
- reduce execution-context leakage and unnecessary loading
- clarify validator / retry / approval control flow without broad runtime
  promotion

Wave 1 explicitly does **not**:

- promote the forward stack into `scripts/ensemble.py`
- add LangGraph or AG2 dependencies
- add a new storage system
- do repo-wide cleanup, formatting, or JSDoc work

## 2. Wave 1-1 scope / touched files / invariants / tests / stop rules

### Scope

Source-of-truth and state-boundary cleanup for the forward `.conitens` stack.

Primary goals:

- expand restore/debug snapshot coverage to match post-Batch11 persisted state
- make runtime artifact status explicit where checked-in markdown/runtime DB
  drift currently exists
- keep restartability sourced from persisted state, not hidden session memory

### Likely touched files

- [ensemble_loop_repository.py](D:/Google/.Conitens/scripts/ensemble_loop_repository.py)
- [ensemble_state_restore.py](D:/Google/.Conitens/scripts/ensemble_state_restore.py)
- [ensemble_loop_debug.py](D:/Google/.Conitens/scripts/ensemble_loop_debug.py)
- [test_loop_state.py](D:/Google/.Conitens/tests/test_loop_state.py)
- [test_approval_controls.py](D:/Google/.Conitens/tests/test_approval_controls.py)
- [test_room_replay.py](D:/Google/.Conitens/tests/test_room_replay.py)
- Maybe only documentation/artifact policy notes if needed:
  - [LATEST_CONTEXT.md](D:/Google/.Conitens/.conitens/context/LATEST_CONTEXT.md)
  - [findings.md](D:/Google/.Conitens/.conitens/context/findings.md)
  - [progress.md](D:/Google/.Conitens/.conitens/context/progress.md)

### Invariants at risk

- Ralph-aware restartability from disk only
- validator history remaining recoverable after restart
- approvals remaining replayable after restart
- room/replay state remaining evidence-only and not becoming execution truth
- no silent divergence between DB snapshot and debug mirror

### Tests to run

Before edits:

```powershell
python -m unittest tests.test_loop_state tests.test_approval_controls tests.test_room_replay
```

After edits:

```powershell
python -m unittest tests.test_loop_state tests.test_approval_controls tests.test_room_replay
python -m unittest discover tests
```

### Stop rules

- Stop if `load_run_snapshot()` expansion forces a runtime-promotion decision
  into `scripts/ensemble.py`.
- Stop if adding missing snapshot categories requires a third new abstraction
  instead of extending the repository/restore/debug surfaces.
- Stop if restart tests begin depending on hidden in-memory state or test-order
  coupling.

## 3. Wave 1-2 scope / touched files / invariants / tests / stop rules

### Scope

ContextAssembler and token-discipline cleanup.

Primary goals:

- remove raw legacy room-transcript reads from execution packet assembly
- prefer bounded room summaries from the unified service path
- stop loading full skill bodies in delegation when metadata is sufficient

### Likely touched files

- [ensemble_context_assembler.py](D:/Google/.Conitens/scripts/ensemble_context_assembler.py)
- [ensemble_execution_loop.py](D:/Google/.Conitens/scripts/ensemble_execution_loop.py)
- [ensemble_skill_loader.py](D:/Google/.Conitens/scripts/ensemble_skill_loader.py)
- [ensemble_room_service.py](D:/Google/.Conitens/scripts/ensemble_room_service.py)
- [test_context_assembler.py](D:/Google/.Conitens/tests/test_context_assembler.py)
- [test_execution_loop.py](D:/Google/.Conitens/tests/test_execution_loop.py)
- [test_room_replay.py](D:/Google/.Conitens/tests/test_room_replay.py)

### Invariants at risk

- execution packets stay compact and selective
- no full room transcript injection by default
- persona core remains separate from skill/runtime policy
- default skill layout remains OpenHands-compatible
- validator failure reason still flows into retry packets

### Tests to run

Before edits:

```powershell
python -m unittest tests.test_context_assembler tests.test_execution_loop tests.test_room_replay
```

After edits:

```powershell
python -m unittest tests.test_context_assembler tests.test_execution_loop tests.test_room_replay
python -m unittest discover tests
```

### Stop rules

- Stop if removing transcript fallback requires a wider room-abstraction merge
  than can be contained in this subwave.
- Stop if skill metadata-only loading breaks persona default skill resolution.
- Stop if packet size starts growing rather than shrinking under the existing
  fixtures.

## 4. Wave 1-3 scope / touched files / invariants / tests / stop rules

### Scope

Validator / retry / approval path cleanup.

Primary goals:

- make one component the clear owner of validator/retry/escalation flow
- preserve approval pause/resume semantics
- preserve validator as the final mandatory gate

### Likely touched files

- [ensemble_orchestration.py](D:/Google/.Conitens/scripts/ensemble_orchestration.py)
- [ensemble_execution_loop.py](D:/Google/.Conitens/scripts/ensemble_execution_loop.py)
- [ensemble_approval.py](D:/Google/.Conitens/scripts/ensemble_approval.py)
- [test_execution_loop.py](D:/Google/.Conitens/tests/test_execution_loop.py)
- [test_orchestration_skeleton.py](D:/Google/.Conitens/tests/test_orchestration_skeleton.py)
- [test_approval_controls.py](D:/Google/.Conitens/tests/test_approval_controls.py)

### Invariants at risk

- Planner -> Execute -> Validate remains visible
- validator remains the final gate before success
- retry/escalation logic remains deterministic and bounded
- risky actions still do not run without approval
- approval decisions remain recoverable and replayable

### Tests to run

Before edits:

```powershell
python -m unittest tests.test_execution_loop tests.test_orchestration_skeleton tests.test_approval_controls
```

After edits:

```powershell
python -m unittest tests.test_execution_loop tests.test_orchestration_skeleton tests.test_approval_controls
python -m unittest discover tests
```

### Stop rules

- Stop if the cleanup starts pushing toward runtime promotion or a LangGraph
  rewrite.
- Stop if approval pause/resume semantics become less explicit than they are
  now.
- Stop if the refactor introduces a third orchestration/loop owner instead of
  deleting duplication.

## 5. Exact validation order across the 3 subwaves

1. Pre-wave baseline:

```powershell
python -m unittest tests.test_loop_state tests.test_context_assembler tests.test_execution_loop tests.test_orchestration_skeleton tests.test_approval_controls tests.test_room_replay
python -m unittest discover tests
```

2. After Wave 1-1:

```powershell
python -m unittest tests.test_loop_state tests.test_approval_controls tests.test_room_replay
python -m unittest discover tests
```

3. After Wave 1-2:

```powershell
python -m unittest tests.test_context_assembler tests.test_execution_loop tests.test_room_replay
python -m unittest discover tests
```

4. After Wave 1-3:

```powershell
python -m unittest tests.test_execution_loop tests.test_orchestration_skeleton tests.test_approval_controls
python -m unittest discover tests
```

5. End of full Wave 1:

```powershell
python -m unittest discover tests
pnpm.cmd test
python .vibe/brain/precommit.py --repo-root . --file scripts/ensemble_loop_repository.py --file scripts/ensemble_context_assembler.py
```

## 6. Rollback points after each subwave

- **After Wave 1-1**
  - Roll back to the previous snapshot/restore/debug shape if expanded snapshot
    coverage destabilizes tests or crosses into runtime-promotion work.

- **After Wave 1-2**
  - Roll back to the previous ContextAssembler/delegation behavior if packet
    invariants fail or if token discipline regressions appear.

- **After Wave 1-3**
  - Roll back to the previous orchestration/loop ownership if validator,
    retry, or approval semantics become less explicit or less deterministic.
