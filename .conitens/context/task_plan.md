# task_plan.md

## Active Batch

- Batch: `Core operator routes residual risk cleanup`
- Name: `secondary-route locale coverage and dashboard test-script stabilization`
- Status: `complete`

## Goal

Resolve the remaining frontend risks after the core-route refactor: commit
selected runs into the URL hash, add a Korean/English language switch for the
core operator routes, tighten remaining bridge/inbox/mobile spatial details,
split the oversized task hook, extend locale coverage into key secondary
routes, stabilize the dashboard package test script, and keep the dashboard
behavior aligned with the refactored operator-workspace model.

## Deliverables

- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/screens/AppRouter.tsx`
- `packages/dashboard/src/screens/OverviewScreen.tsx`
- `packages/dashboard/src/screens/InboxScreen.tsx`
- `packages/dashboard/src/screens/TasksScreen.tsx`
- `packages/dashboard/src/screens/RunsScreen.tsx`
- `packages/dashboard/src/components/CoreRouteScaffold.tsx`
- `packages/dashboard/src/hooks/useBridgeStatus.ts`
- `packages/dashboard/src/hooks/useOperatorSummaryData.ts`
- `packages/dashboard/src/hooks/useOperatorInboxData.ts`
- `packages/dashboard/src/hooks/useOperatorTasksData.ts`
- `packages/dashboard/src/hooks/useRunsData.ts`
- `packages/dashboard/src/components/PixelOffice.tsx`
- `packages/dashboard/src/components/OperatorInboxPanel.tsx`
- `packages/dashboard/src/components/OperatorInboxPanel.module.css`
- `packages/dashboard/src/styles/forward-shell.css`
- `packages/dashboard/src/screens/CoreRouteWorkspace.module.css`
- `packages/dashboard/src/screens/TasksScreen.module.css`
- `packages/dashboard/src/office.module.css`
- `packages/dashboard/src/office-stage.module.css`
- `packages/dashboard/src/forward-route.ts`
- `packages/dashboard/src/store/ui-store.ts`
- `packages/dashboard/src/i18n.ts`
- `packages/dashboard/src/hooks/useOperatorTaskDerived.ts`
- `packages/dashboard/src/hooks/createOperatorTaskActions.ts`
- `packages/dashboard/src/components/AgentFleetOverview.tsx`
- `packages/dashboard/src/components/AgentProfilePanel.tsx`
- `packages/dashboard/src/components/ProposalQueuePanel.tsx`
- `packages/dashboard/src/components/ApprovalCenter.tsx`
- `packages/dashboard/src/components/ThreadBrowser.tsx`
- `packages/dashboard/src/components/ThreadDetail.tsx`
- `packages/dashboard/src/components/ThreadBrowser.test.tsx`
- `packages/dashboard/src/components/ThreadDetail.test.tsx`
- `packages/dashboard/scripts/run-vitest.cjs`
- `packages/dashboard/package.json`
- `output/playwright/dashboard-runs-20260409-riskfix-en-1440.png`
- `output/playwright/dashboard-overview-20260409-refactor-1440.png`
- `output/playwright/dashboard-inbox-20260409-refactor-1440.png`
- `output/playwright/dashboard-tasks-20260409-refactor-1440.png`
- `output/playwright/dashboard-runs-20260409-refactor-1440.png`
- `output/playwright/dashboard-office-preview-20260409-refactor-1440.png`
- `output/playwright/dashboard-overview-20260409-refactor-820.png`
- `output/playwright/dashboard-tasks-20260409-refactor-820.png`
- `output/playwright/dashboard-office-preview-20260409-refactor-820.png`
- `output/playwright/dashboard-runs-20260409-riskfix-ko-1440.png`
- `output/playwright/dashboard-runs-20260409-riskfix-en-1440.png`
- `.omx/artifacts/claude-frontend-core-routes-refactor-2026-04-09T10-01-05-586313Z.md`
- refreshed `.conitens/context/*`

## Non-Goals

- No runtime contract or bridge API changes
- No speculative marketing-site redesign or theme pivot
- No full secondary-route rewrite for `Workspaces`, `Agents`, `Threads`, or `Approvals`

## Acceptance

- [x] global shell reduced to 4 primary routes plus secondary/utility menu
- [x] `Overview`, `Inbox`, `Tasks`, and `Runs` render through dedicated screens instead of the shared monolith route branch
- [x] bridge connect UX moved into compact route scaffolds
- [x] `Tasks` now keeps queue rail + detail pane while filters/bulk controls live in a top toolbar
- [x] `Runs` now behaves as a browser + summary workspace separate from `Tasks`
- [x] mobile `office-preview` now shows a room strip with a single selected room stage instead of all room tiles stacked
- [x] selected run is now committed into the `runs` route hash
- [x] core operator routes support Korean/English switching from the shell
- [x] bridge tray form now requires both API root and bearer token before submit
- [x] oversized `useOperatorTasksData` has been split into smaller helper modules for derived state and actions
- [x] key secondary operator routes now follow the Korean/English toggle for static UI copy
- [x] dashboard package test script now runs through a repo-local real-Node Vitest wrapper
- [x] dashboard package suite passes through the package test script
- [x] fresh Playwright evidence captured for desktop and narrow viewport widths
- [x] Claude review artifact captured and immediate fixes applied
- [x] context files refreshed
