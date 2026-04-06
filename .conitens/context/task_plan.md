# task_plan.md

## Active Batch

- Batch: `Paperclip phase 2 owned API slice 21`
- Name: `add workspace archive blocker resolution UX`
- Status: `complete`

## Goal

Implement the twenty-first owned API slice from the Paperclip Phase 2 direction
by turning workspace archive blockers into actionable operator flows through
linked-task detach and archive actions directly from workspace detail.

## Deliverables

- `docs/PAPERCLIP_CONITENS_INTEGRATION_PLAN_2026-04-04.md`
- `docs/PAPERCLIP_CONITENS_PHASE1_BACKLOG_2026-04-04.md`
- `.conitens/reviews/paperclip_conitens_integration_plan_2026-04-04.md`
- `scripts/ensemble_loop_repository.py`
- `scripts/ensemble_forward_bridge.py`
- `scripts/ensemble_approval.py`
- `packages/dashboard/src/forward-bridge-types.ts`
- `packages/dashboard/src/forward-bridge-parsers.ts`
- `packages/dashboard/src/forward-bridge-client.ts`
- `packages/dashboard/src/forward-bridge.ts`
- `packages/dashboard/src/forward-route.ts`
- `packages/dashboard/src/operator-tasks-model.ts`
- `packages/dashboard/src/components/OperatorTaskDetailPanel.tsx`
- `packages/dashboard/src/components/OperatorTaskEditorPanel.tsx`
- `packages/dashboard/src/components/ForwardApprovalCenterPanel.tsx`
- `packages/dashboard/src/App.tsx`
- `packages/dashboard/tests/forward-bridge.test.mjs`
- `tests/test_loop_state.py`
- `tests/test_forward_bridge.py`
- `docs/frontend/VIEW_MODEL.md`
- refreshed `.conitens/context/task_plan.md`
- refreshed `.conitens/context/findings.md`
- refreshed `.conitens/context/progress.md`
- refreshed `.conitens/context/LATEST_CONTEXT.md`
- `.omx/context/paperclip-conitens-20260403T234631Z.md`

## Non-Goals

- no runtime replacement of `scripts/ensemble.py`
- no claim that forward stack already replaces the active runtime
- no operator task bulk actions in this slice
- no saved task filters in this slice
- no operator task execution/resume binding in this slice
- no workspace registry in this slice
- no budget registry in this slice
- no task bulk archive in this slice
- no task archive rationale history in this slice
- no archive search/indexing surface in this slice
- no task-level audit event timeline beyond stored archive metadata in this slice
- no bulk delete in this slice
- no server-side saved filter registry in this slice
- no cross-session server-side selection state in this slice
- no background bulk job runner in this slice
- no operator workspace delete flow in this slice
- no workspace lifecycle guardrails in this slice
- no full task/workspace bidirectional transaction layer in this slice
- no automatic migration of unresolved legacy workspace refs in this slice
- no server-side migration wizard in this slice
- no workspace search API in this slice
- no workspace delete flow in this slice
- no dedicated workspace archive endpoint in this slice
- no workspace archive history timeline in this slice
- no bulk workspace detach/archive in this slice
- no multi-select linked-task resolution in this slice
- no approval / validator gate weakening
- no new dependency introduction

## Acceptance

- [x] canonical `operator_tasks` storage exists in the loop repository
- [x] `GET /api/operator/tasks` exists
- [x] `GET /api/operator/tasks/:task_id` exists
- [x] `POST /api/operator/tasks` exists
- [x] `PATCH /api/operator/tasks/:task_id` exists
- [x] `DELETE /api/operator/tasks/:task_id` exists
- [x] `POST /api/operator/tasks/:task_id/archive` exists
- [x] `POST /api/operator/tasks/:task_id/restore` exists
- [x] forward bridge types / parser / client support the new operator task contract
- [x] `tasks` and `task-detail` routes exist
- [x] tasks list/detail shell uses canonical operator task API data
- [x] task-detail now renders linked replay / approval context when `linked_run_id` exists
- [x] tasks shell now supports create/edit task form submission
- [x] tasks list now supports status and owner filtering
- [x] task-detail now supports quick status transitions
- [x] task-detail now renders linked state docs, digests, and room timeline when `linked_run_id` exists
- [x] invalid task status transitions are rejected
- [x] execution-sensitive task mutations are blocked while linked runs have pending approvals
- [x] task-scoped approval request creation exists
- [x] task-detail approval panel can filter approvals by `task_id`
- [x] task approval requests carry rationale and requested-change payloads
- [x] task editor previews changed fields before save
- [x] task editor highlights approval-sensitive changes before save
- [x] task-detail now exposes a delete action for canonical operator tasks
- [x] task deletion is blocked while task-scoped approvals remain pending
- [x] task deletion is blocked while linked-run approvals remain pending
- [x] task deletion now requires archive-first lifecycle progression
- [x] task records now carry `archived_at`
- [x] tasks list hides archived records by default
- [x] tasks list can include archived records on demand
- [x] task-detail now exposes archive and restore actions
- [x] archiving is blocked while task-scoped or linked-run approvals remain pending
- [x] bridge client surfaces backend delete/mutation error messages
- [x] operator tasks now store `archived_by`
- [x] operator tasks now store `archive_note`
- [x] archive now requires a non-empty rationale
- [x] archived task-detail renders archive metadata and rationale
- [x] archived tasks are read-only until restored
- [x] archived tasks cannot request new task-scoped approvals until restored
- [x] current task filters now persist locally
- [x] task filter presets can be saved locally and reapplied
- [x] bulk archive can act on the current filtered queue
- [x] bulk restore can act on the current filtered queue
- [x] bulk archive still requires a rationale
- [x] individual task rows can now be selected locally
- [x] bulk actions target selected tasks first when a selection exists
- [x] bulk result UI now shows structured success and failure details
- [x] canonical `operator_workspaces` storage exists
- [x] `GET /api/operator/workspaces` exists
- [x] `GET /api/operator/workspaces/:workspace_id` exists
- [x] `POST /api/operator/workspaces` exists
- [x] `PATCH /api/operator/workspaces/:workspace_id` exists
- [x] `workspaces` and `workspace-detail` routes exist
- [x] workspace list/detail/editor shell uses canonical workspace API data
- [x] task detail can deep-link into canonical workspace detail
- [x] task editor now uses canonical workspace options instead of free-form input
- [x] task create/update rejects unknown canonical workspace refs
- [x] workspace detail derives linked task refs from task records
- [x] task delete/update keeps derived workspace membership in sync
- [x] task editor now renders a richer selected-workspace summary
- [x] unresolved workspace refs now show explicit migration shortcuts in task detail
- [x] task detail can stage a workspace-ref migration and save it directly from the unresolved warning surface
- [x] operator workspace status transitions are now validated
- [x] archived workspaces are read-only until reactivated
- [x] task create/update cannot newly attach archived workspaces
- [x] workspace archive is blocked while active linked tasks remain attached
- [x] workspaces now store `archived_at`
- [x] workspaces now store `archived_by`
- [x] workspaces now store `archive_note`
- [x] archiving a workspace now requires a rationale
- [x] workspace detail now renders archive metadata and rationale
- [x] `GET /api/operator/tasks` now supports `workspace_ref` filtering
- [x] workspace detail now renders linked task blocker actions
- [x] linked tasks can be detached from workspace detail
- [x] linked tasks can be archived from workspace detail
- [x] detaching a linked task refreshes derived workspace membership
- [x] dashboard parser tests pass
- [x] loop repository and forward bridge tests pass
- [x] dashboard package build passes after the slice
- [x] context files were refreshed for this implementation task

## Post-Review Follow-Up 2026-04-05

- Goal: close the archived-workspace read-only bypass and the broken
  quick-archive affordance found in review.
- Scope:
  - reject `PATCH` on already-archived workspaces unless the request is
    reactivating the workspace
  - stop re-stamping archive metadata on archived workspace no-op patches
  - gate dashboard quick-archive behind an explicit archive rationale and keep
    the rationale field visible before archiving
  - add regression coverage for the bridge and dashboard helper paths
- Verification target:
  - `python3 -m unittest tests.test_forward_bridge tests.test_loop_state`
  - `node --experimental-strip-types --test --test-isolation=none tests/forward-bridge.test.mjs`
  - `npx --yes tsc -b`
  - `npx --yes vite build`
