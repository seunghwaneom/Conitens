# Frontend Design Architecture Improvement Baseline

dirty_worktree: captured in .omo/evidence/task-1-git-status.txt
DASHBOARD_PORT: 3004
BASE_URL: http://127.0.0.1:3004/#/office-preview
browser_script: .omo/evidence/run-frontend-design-architecture-qa.mjs
failing_first: T2 model CTA, T4 tab semantics, T5 dormant focused map contract, T7 live-route QA harness
demo_fixture_shape: preserve packages/dashboard/src/demo-data.ts and existing fixture object shape unless T8 records a justified exception

## Dirty worktree
 M .conitens/context/LATEST_CONTEXT.md
 M .conitens/context/findings.md
 M .conitens/context/progress.md
 M .conitens/context/task_plan.md
 M AGENTS.md
 M packages/dashboard/src/App.tsx
 M packages/dashboard/src/components/OfficeSidebar.tsx
 M packages/dashboard/src/components/OfficeStage.tsx
 M packages/dashboard/src/components/PixelOffice.tsx
 M packages/dashboard/src/office-sidebar.module.css
 M packages/dashboard/src/office.module.css
 M packages/dashboard/src/spatial-lens/assets/GeneratedSprite.tsx
 M packages/dashboard/src/spatial-lens/assets/generatedAssetManifest.ts
 M packages/dashboard/src/spatial-lens/assets/generatedRoomBackdrops.ts
 M packages/dashboard/src/spatial-lens/components/FloorViewport.tsx
 M packages/dashboard/src/spatial-lens/components/HandoffOverlay.tsx
 M packages/dashboard/src/spatial-lens/components/RoomZone.tsx
 M packages/dashboard/src/spatial-lens/components/SceneDockOverlay.tsx
 M packages/dashboard/src/spatial-lens/index.ts
 M packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css
 M packages/dashboard/src/spatial-lens/viewport/AgentLayer.tsx
 M packages/dashboard/src/spatial-lens/viewport/AgentSprite.tsx
 M packages/dashboard/src/spatial-lens/viewport/GeneratedRoomBackdropLayer.tsx
 M packages/dashboard/src/spatial-lens/viewport/agentVisualState.ts
 M packages/dashboard/src/spatial-lens/viewport/roomKit.ts
 M packages/dashboard/src/styles/shell.css
 M packages/dashboard/tests/office-preview-shell.test.mjs
 M packages/dashboard/tests/spatial-lens-agent-visual-state.test.mjs
 M packages/dashboard/tests/spatial-lens-generated-assets.test.mjs
 M packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs
 M packages/dashboard/tests/spatial-lens-room-dressing.test.mjs
 M packages/dashboard/tsconfig.tsbuildinfo
?? .audit/
?? .conitens/context/spatial_lens_verification_2026-06-11.md
?? .omo/
?? .tmp/
?? packages/dashboard/.audit/
?? packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx
?? packages/dashboard/src/spatial-lens/model/focusedHandoffModel.ts
?? spatial-lens-focused-polish-1220.png
?? spatial-lens-focused-polish-1440.png
