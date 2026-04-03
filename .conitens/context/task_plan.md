# task_plan.md

## Active Batch

- Batch: `Frontend design polish upgrade`
- Name: `office-preview reference-driven workspace pass`
- Status: `complete`

## Goal

Upgrade the `#/office-preview` surface using current open-source operator /
workflow UI references so the first viewport reads like a real workspace,
correlated signals are visible without scanning the rail, and preview
interactions stay accessible while preserving the existing stage-first layout
and runtime boundaries.

## Deliverables

- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/components/OfficeRoomScene.tsx`
- `packages/dashboard/src/components/OfficeSidebar.tsx`
- `packages/dashboard/src/components/OfficeStage.tsx`
- `packages/dashboard/src/components/PixelOffice.tsx`
- `packages/dashboard/src/office-sidebar-view-model.ts`
- `packages/dashboard/src/office.module.css`
- `packages/dashboard/src/office-stage.module.css`
- `packages/dashboard/src/office-sidebar.module.css`
- `packages/dashboard/src/styles.css`
- `packages/dashboard/tests/office-sidebar-view-model.test.mjs`
- `output/playwright/office-preview-2026-04-03-pre-polish.png`
- `output/playwright/office-preview-2026-04-03-polish.png`
- `output/playwright/office-preview-2026-04-03-research-pass.png`
- Refreshed `.conitens/context/*`

## Non-Goals

- No runtime promotion or bridge behavior change
- No broad dashboard redesign outside the preview shell
- No new dependencies
- No command-center or legacy control-plane edits
- No router or data-contract expansion

## Acceptance

- [x] office preview now has an intentional preview-summary band above the stage
- [x] a reference-driven correlated-signal strip now surfaces focus, queue head, and latest handoff above the stage
- [x] office stage header exposes room/live/focus status without adding heavy chrome
- [x] right rail sections expose counts and a clearer focus strip
- [x] right rail now behaves like a sticky context panel on desktop
- [x] clickable avatar controls are no longer hidden behind `aria-hidden`
- [x] reduced-motion handling now exists for preview animations
- [x] refreshed browser screenshot evidence exists for pre/post polish
- [x] dashboard tests, typecheck, and build were re-run for this slice
- [x] context files refreshed.
