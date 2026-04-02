# Batch 11 Wave 1-3 Summary

## Simplified control paths

- `IterativeBuildLoop.run()` is now the single execution owner for:
  - validator pass -> success
  - validator fail -> retry / planner revise / specialist swap
  - repeated failure -> human escalation
  - risky action -> approval gate
  - approved/edited risky action -> re-enter worker + validator
- `BuildGraph` now acts as the orchestration shell and checkpoint wrapper,
  rather than a second loop owner.

## Bypasses removed

- Duplicate retry/approval branching in `BuildGraph._apply_loop_result()` was
  removed.
- Human escalation no longer masquerades as `approval_pending`.
- Repeated `BuildGraph.run()` calls now reuse existing nonterminal retry state
  instead of resetting the retry counter to zero.

## Tests added for unhappy paths

- Updated [test_execution_loop.py](D:/Google/.Conitens/tests/test_execution_loop.py)
  with a repeated-failure escalation test that proves:
  - retry state persists across repeated `BuildGraph.run()` calls
  - escalation is reachable without abusing `approval_pending`
  - retry decisions remain observable and ordered

## Remaining risks for Wave 2

- Active runtime truth is still separate from the forward `.conitens` stack.
- Room/handoff duplication is still present outside the packet path.
- `.vibe` sidecar duplication and staleness issues remain.
