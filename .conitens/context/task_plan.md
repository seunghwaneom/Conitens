# task_plan.md

## Active Batch

- Batch: `Pixel Office architectural quieting`
- Name: `research 2D pixel-office references and apply a schema-preserving quieting pass to the dashboard preview`
- Status: `partial`

## Goal

Ground the Conitens Pixel Office in stronger 2D pixel-operator references, then
reduce simulation energy and rail weight without changing the existing room
schema or floorplate contract.

## Deliverables

- `.omx/context/conitens-pixel-office-refresh-20260402T204552Z.md`
- `.omx/plans/ralplan-pixel-office-design-refresh-2026-04-03.md`
- `.omx/plans/prd-pixel-office-design-refresh.md`
- `.omx/plans/test-spec-pixel-office-design-refresh.md`
- `output/pencil/pixel-office-upgrade-v3.pen`
- `output/pencil/exports/iAXv0.png`
- `packages/dashboard/src/components/OfficeRoomScene.tsx`
- `packages/dashboard/src/components/TaskNode.tsx`
- `packages/dashboard/src/components/OfficeSidebar.tsx`
- `packages/dashboard/src/office-sidebar.module.css`
- `packages/dashboard/src/office.module.css`
- `packages/dashboard/src/office-stage-schema.ts`
- `packages/dashboard/src/office-stage.module.css`
- `packages/dashboard/src/office-sidebar.module.css`
- Refreshed `.conitens/context/task_plan.md`
- Refreshed `.conitens/context/findings.md`
- Refreshed `.conitens/context/progress.md`
- Refreshed `.conitens/context/LATEST_CONTEXT.md`

## Non-Goals

- No room ID changes
- No `OFFICE_STAGE_ROOMS` geometry rewrite
- No `ROOM_GRID_AREAS` rewrite
- No new dependencies
- No false claim that team mode succeeded in this dirty-worktree session

## Acceptance

- [x] reference direction was researched and summarized
- [x] consensus plan plus PRD/test-spec artifacts were written
- [x] stage/rail quieting changes were applied in the owned preview files
- [x] dashboard package build verification was rerun successfully
- [x] dashboard package test verification fully passed
- [ ] fresh screenshot-based visual QA reached pass threshold
- [x] context files were refreshed for the scoped rail task
