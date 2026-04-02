# task_plan.md

## Active Batch

- Batch: `Pixel Office rail quieting`
- Name: `implement the approved quieting pass for the dashboard office rail`
- Status: `complete`

## Goal

Quiet the Pixel Office right rail without changing the existing cap/content
model, keep the diff confined to the owned sidebar files, and re-run the
dashboard package verification surfaces needed to prove the CSS pass did not
break the build.

## Deliverables

- `packages/dashboard/src/office-sidebar.module.css`
- `packages/dashboard/src/components/OfficeSidebar.tsx` only if markup changes
  become necessary
- Refreshed `.conitens/context/task_plan.md`
- Refreshed `.conitens/context/findings.md`
- Refreshed `.conitens/context/progress.md`
- Refreshed `.conitens/context/LATEST_CONTEXT.md`

## Non-Goals

- No stage-schema or room-layout changes
- No rail-cap or view-model changes
- No new dependencies
- No claim that unrelated dashboard test debt was fixed in this pass

## Acceptance

- [x] rail visuals were quieted without changing the row-cap/content model
- [x] small-text readability was improved in the rail
- [x] dashboard package build verification was rerun successfully
- [x] dashboard package test verification was rerun and the remaining unrelated
  failures were recorded accurately
- [x] context files were refreshed for the scoped rail task
