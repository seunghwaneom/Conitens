# Dashboard Refactor Code + Security Review (2026-04-02)

## Scope

- Commit reviewed: `a621919`
- Areas inspected:
  - `packages/dashboard/src/components/ForwardShell.tsx`
  - `packages/dashboard/src/components/ProposalQueuePanel.tsx`
  - `packages/dashboard/src/components/TrustBadge.tsx`
  - `packages/dashboard/src/components/OverviewDashboard.tsx`
  - `packages/dashboard/src/components/KanbanBoard.tsx`
  - `packages/dashboard/src/components/TaskDetailModal.tsx`
  - `packages/dashboard/src/components/AgentRelationshipGraph.tsx`
  - `packages/dashboard/src/store/event-store.ts`
  - `packages/dashboard/src/demo-data.ts`
  - `packages/dashboard/src/dashboard-model.ts`
  - `packages/dashboard/src/forward-route.ts`

## Verification

- `pnpm --filter @conitens/dashboard build` -> passed
- `pnpm --filter @conitens/dashboard test` -> failed
  - `67` passed
  - `1` failed
  - failing test: `office snapshot maps room occupancy and handoff routes from current dashboard data`

## Findings

1. `HIGH` test suite does not pass after the refactor because demo timestamps
   were made dynamic without updating the existing fixed-value assertions.
2. `HIGH` the new demo Kanban/modal flow is still broken in practice because
   task selection and status changes depend on store state that is never seeded
   from the demo tasks.
3. `MEDIUM` the trust-state work is not actually mounted: `TrustBadge` and
   `getConnectionPresentation()` exist, but `ForwardShell` still renders raw
   chips and dynamic demo timestamps make simulated data look fresh.
4. `MEDIUM` overview CTA wiring is misleading: `Open Board` does not open a
   board view and `Open Timeline` routes to `#/runs` while `Timeline.tsx`
   remains unmounted.

## Security Posture

- No new CRITICAL/HIGH OWASP-style issue was found in the changed frontend
  surface.
- The main security-adjacent concern is integrity/trust signaling: simulated
  data and local-only interactions can still be mistaken for live operational
  state.

## Recommendation

- `REQUEST CHANGES`

Address the failing test, seed or remove the demo board/task-detail flow so it
actually works, and wire the trust indicator before treating this refactor as
complete.
