# Agent skill revision manual CLI QA

Date: 2026-07-10
Surface: real `scripts/ensemble.py --workspace <temporary-workspace> improvement ...` subprocesses

The repository's live `.agent` registry was not modified. Each scenario used a
fresh temporary workspace seeded with the canonical `context-curator` manifest,
an approved candidate, and a matching legacy owner record.

## Observed lifecycle

- `improvement --help` listed `revision-propose`.
- `revision-propose` returned `pending_apply` without changing the target.
- `revision-show` returned the same revision ID and metadata only.
- `revision-apply` returned `applied`.
- `revision-rollback` returned `rolled_back`.
- After deleting the projected skill file, `revision-rebuild` recreated exactly
  one target with the canonical base bytes.
- A final post-fix CLI probe observed owner rebuild exit 0 with one restored
  projection, while the same authority events without `OWNER.json` exited 1,
  created no `.agent`, used a generic error, and exposed no path or traceback.
- No projection temporary-file residue remained.
- No `.agents`, `.conitens`, `.vibe`, Forward, dashboard, or SQLite runtime
  surface appeared in the temporary workspace.

## Bad input

An unsafe revision input containing a secret-shaped value and an absolute local
path exited with code 1. The output used the generic revision failure prefix and
contained none of the secret, private path, workspace path, input filename, or a
Python traceback.

## Concurrency

- Permanent subprocess regression: two independent CLI processes applying the
  same revision both observed `applied`, while the event log contained exactly
  one `improvement.revision_applied` terminal event.
- Manual conflicting-process scenario: exit codes were `[0, 1]`, exactly one
  terminal apply event existed, the losing process failed stale without a
  traceback, and the final target matched the committed winner.

Verdict: PASS.
