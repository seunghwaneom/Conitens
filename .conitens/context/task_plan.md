# task_plan.md

## Active Batch

- Batch: `Forward review hardening`
- Name: `candidate patch provenance and content gate`
- Status: `complete`

## Goal

Close the persona candidate-patch gap where raw files on disk could appear as
pending or applied changes without a proposal event or a reviewable behavior
delta.

## Deliverables

- `scripts/ensemble_agent_registry.py`
- `scripts/ensemble_improver.py`
- `tests/test_candidate_patch_hardening.py`
- removal of `.conitens/personas/candidate_patches/supervisor-core-2026-04-06-001.md`
- refreshed `.conitens/context/*`

## Non-Goals

- No repo-wide event path migration in this change set
- No persona-core mutation or approval-policy redesign
- No broad cleanup outside the candidate patch surface

## Acceptance

- [x] unlogged candidate patch files are not surfaced as pending patches
- [x] placeholder-only candidate patch files are not surfaced as pending patches
- [x] apply path rejects candidate patches without a proposal event
- [x] apply path rejects candidate patches without a concrete behavior delta
- [x] improver patch generation requires explicit proposal content
- [x] targeted regression tests cover invalid and valid candidate patch flows
- [x] context files refreshed
