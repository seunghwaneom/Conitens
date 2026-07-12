# Dashboard thin-shell cleanup plan: workspace controller

Date: 2026-07-10

Status: complete

## Goal

Move the operator-workspace resource and mutation orchestration out of
`packages/dashboard/src/App.tsx` into one feature-owned React hook while
preserving every route, bridge request, rendered prop, visual token, and demo
fallback.

## Behavior lock

Before production edits:

1. Keep the full dashboard baseline green (150/150).
2. Add a source-level characterization that locks create/update, archive
   rationale gating, detach/archive refresh ordering, and single ownership of
   each workspace bridge command.
3. Run that characterization against the current `App.tsx` implementation.

## Smallest seam

- Add `src/features/workspaces/use-operator-workspace-controller.ts`.
- Move workspace list/detail/linked-task resource state and effects, draft
  synchronization, refresh/navigation, and create/update/quick-status/detach/
  linked-task archive handlers into the hook.
- Keep view-model conversion, task-to-workspace option composition, route
  rendering, and all JSX in `App.tsx` for this slice.
- Keep public bridge client/parser/type exports unchanged.

## Constraints

- No CSS, copy, asset, route, payload, or backend change.
- No new dependency and no React dev-tool installation.
- Preserve dirty user-owned dashboard changes and avoid unrelated formatting.
- Do not move task or approval orchestration in the same patch.

## Verification

- Targeted workspace characterization test.
- Full dashboard tests.
- TypeScript/Vite production build; preserve and report the known locked
  `dist/index (1).html` artifact if it alone blocks Vite output cleanup.
- Scoped diff/duplicate-command scan.
- Real-browser visual parity at Focused, task, and workspace routes, followed
  by independent code/test/visual review.

## Review-found correctness repairs

The manual and independent review gate may correct workspace behavior exposed
by this slice when the repair remains local and dependency-free. Lock these
before editing production code:

- the workspace-list error must be the message rendered when the list route is
  in its error state;
- the workspace represented by the visible detail pane must expose the same
  selected state visually and through an explicit ARIA contract.

## Review-found structural repair

The first extraction put resource loading, draft synchronization, and commands
inside one 323-pure-LOC hook. Final implementation therefore uses three small
feature-owned boundaries instead of treating a single large hook as the goal:

- `use-operator-workspace-resources.ts` owns list/detail/linked-task reads and
  refresh/navigation;
- `operator-workspace-command-service.ts` owns dependency-injected workspace
  and linked-task mutations plus feedback/refresh ordering;
- `use-operator-workspace-controller.ts` composes those boundaries, draft
  synchronization, and UI-facing action/state names.

The command service is exercised at runtime with an injected fake gateway.
Source assertions remain only as secondary ownership and accessibility locks.
The final pure-LOC counts are 178, 133, and 154 respectively.

## Completion evidence

- Targeted runtime/structure tests: 4/4.
- Full dashboard tests: 154/154.
- TypeScript no-emit validation and production build: pass; 146 modules.
- 1220px/820px browser QA: no horizontal overflow or console warning/error;
  one-row desktop nav; selected state is visual and semantic; actual list click
  opens the detail route.
- Repo Structure Lens post-write audit: zero dependency cycles.
- Independent code review: APPROVE.
- Independent test review: PASS.
- Independent UI/accessibility review: PASS.
