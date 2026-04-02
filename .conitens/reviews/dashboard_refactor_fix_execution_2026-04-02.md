# Dashboard Refactor Fix Execution (2026-04-02)

## Goal

Fix the concrete regressions identified in the dashboard refactor review for
commit `a621919`, then re-run dashboard package verification until green.

## Implemented

- `packages/dashboard/src/components/ForwardShell.tsx`
  - standardized demo fallback through the resolved dashboard data path
  - made demo run list/detail read from resolved task/event/agent state
  - kept seeded demo store flow active for interactive board behavior
  - kept `TrustBadge` mounted in the shell header
  - completed the demo `board/timeline` toggle path
- `packages/dashboard/tests/dashboard-model.test.mjs`
  - updated the handoff timestamp assertion to use the current demo event value
    instead of a stale fixed timestamp literal
- `packages/dashboard/tests/event-store.test.mjs`
  - added coverage for the `seedDemo()` path followed by a later
    `task.status_changed` interaction

## Verification

- `pnpm --filter @conitens/dashboard build` -> passed
- `pnpm --filter @conitens/dashboard test` -> passed
  - `70` passed
  - `0` failed

## Team / Ralph / Ultrawork Notes

- Ralph-style fix/verify loop completed successfully in this session.
- `ultrawork` state was activated for the execution pass.
- Real `omx team` launch remains blocked by this environment:
  - `omx_run_team_start(...)` returned job `omx-mnhgmhvy`
  - `omx_run_team_status(jobId=omx-mnhgmhvy)` -> `failed`
  - error: `Team mode requires running inside tmux current leader pane`

## Remaining Risks

- The new `agent-store`, `navigation-store`, and `useAsyncResource` surfaces
  are still not integrated into the production path.
- The team-runtime request could not be honored end-to-end because this
  environment lacks a usable tmux-backed team launch path.
