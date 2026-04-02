# task_plan.md

## Active Batch

- Batch: `Frontend review implementation`
- Name: `final stage-fill and verification refresh`
- Status: `complete`

## Goal

Close the last visible stage-fill polish gap, refresh screenshot evidence, and
align the review/context docs to the verified current state.

## Deliverables

- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/forward-route.ts`
- `packages/dashboard/src/styles.css`
- `packages/dashboard/src/office-stage.module.css`
- `packages/dashboard/src/office-sidebar.module.css`
- `packages/dashboard/tests/forward-bridge.test.mjs`
- `docs/frontend/FRONTEND_REVIEW_2026-04-02.md`
- `output/playwright/office-preview-2026-04-02-final.png`
- `output/playwright/office-preview-2026-04-02-final-2.png`
- Claude artifact: `.omx/artifacts/claude-pixel-office-final-polish-2026-04-01T23-21-29-714659Z.md`
- Claude artifact: `.omx/artifacts/claude-pixel-office-preview-route-2026-04-01T23-05-34-158743Z.md`
- Refreshed `.conitens/context/*`

## Non-Goals

- No runtime promotion in this step
- No broad cleanup sweep
- No bridge/control-plane behavior change in this step
- No new pixel-office redesign in this step
- No route expansion beyond verification needs in this step

## Acceptance

- [x] a contained `#/office-preview` route exists for design verification
- [x] the main forward shell remains the default route
- [x] route parsing/building is regression-tested
- [x] Playwright screenshot evidence exists for office preview
- [x] stage dead-space issue was reduced by flexible row sizing
- [x] review doc records Phase 4 verification as complete with minor polish debt only
- [x] the review doc now records completed slices and remaining work explicitly
- [x] Claude second-opinion artifact was captured for the preview-route slice
- [x] context files refreshed.
