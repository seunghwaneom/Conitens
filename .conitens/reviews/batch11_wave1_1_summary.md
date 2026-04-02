# Batch 11 Wave 1-1 Summary

## Concepts merged/deleted

- No broad deletions landed in Wave 1-1.
- The old and new restore/debug state shapes were merged into one expanded
  repository snapshot path.
- Forward state ownership is now centralized in the loop repository instead of
  being implicit across several modules.

## Authoritative owners after cleanup

- Run state: `sqlite:runs`
- Iteration state: `sqlite:iterations`
- Room event log: `sqlite:messages`
  - legacy `.notes/rooms/*.jsonl` remains a compatibility mirror/import surface
- Validator result: `sqlite:validator_results`
- Approval decision: `sqlite:approval_requests`
- Task plan status: `sqlite:context_task_plans`
  - `.conitens/context/task_plan.md` remains a deterministic projection
- Immutable progress log: `sqlite:context_progress_entries`
  - `.conitens/context/progress.md` remains an append-only projection

## Tests added/updated

- Updated [test_loop_state.py](D:/Google/.Conitens/tests/test_loop_state.py)
  with:
  - extended snapshot coverage assertions
  - debug snapshot owner-map assertions

## Remaining boundary ambiguity

- The active runtime truth is still `scripts/ensemble.py` + `.notes/` + `.agent/`.
- The new owner map clarifies the forward `.conitens` state boundary, but the
  forward stack is still not promoted into the active runtime.
- Room list/read paths in the visible UI still need unification in Wave 1-2 and
  later work.
