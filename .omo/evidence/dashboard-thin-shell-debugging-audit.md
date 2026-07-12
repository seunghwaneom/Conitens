# Dashboard thin-shell debugging audit

Date: 2026-07-10

## Hypothesis 1 — App still duplicates workspace authority

Predicted symptom: `App.tsx` retains workspace create/update/get/detach bridge
calls or owns a second set of workspace mutation handlers.

Evidence: scoped reference search finds `App -> useOperatorWorkspaceController`,
`controller -> resources/service`, and the runtime test -> injectable service.
No direct workspace create/update/get/detach bridge reference remains in App.

Verdict: rejected.

## Hypothesis 2 — extraction changed request/effect ordering

Predicted symptom: workspace read effects register before the existing task-list
effect and alter observable bridge GET order.

Evidence: the task-list effect ends at the App composition seam before
`useOperatorWorkspaceController` is called. Independent code review confirmed
the preserved ordering at `App.tsx:459-484`.

Verdict: rejected.

## Hypothesis 3 — passing source checks hide a broken runtime command path

Predicted symptom: create/update/detach/archive handlers have incorrect bridge,
feedback, guard, or refresh ordering while string assertions still pass.

Evidence: `createOperatorWorkspaceCommandService()` receives a fake runtime
gateway; tests assert the exact observable sequence for create, archive-status
update, detach, linked-task archive, and the pre-bridge archive-rationale guard.
The targeted suite passed 4/4 and the full dashboard suite passed 154/154.

Verdict: rejected.

## Build and rendering cross-check

TypeScript validation and the normal Vite production build both passed. Fresh
browser QA of that build found no console warning/error or horizontal overflow
at 1220px/820px, and a real workspace-button click opened the detail route.

Audit result: PASS.
