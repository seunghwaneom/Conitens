# View Model

Status: `updated through phase 2 owned API slice 21`

## FE-1.1 operator overview model

### Operator summary

Derived from `GET /api/operator/summary`:

- `postureLabel`
- `latestRunLabel`
- `metrics[]`
- `attention[]`

## FE-1.2 operator inbox model

### Operator inbox

Derived from `GET /api/operator/inbox`:

- `items[]`
- `count`

UI shaping:

- `tone`
- `title`
- `detail`
- `meta`
- `actionLabel`
- `targetHash`

## FE-1.3 operator agents model

### Operator agents

Derived from `GET /api/operator/agents`:

- `agents[]`
- `count`

UI shaping:

- `AgentProfile[]`
- latest run metadata
- latest blocker metadata
- pending approval count
- workspace attachment placeholder

## Phase 2 owned API note

### Operator tasks contract

Backend contract now exists for:

- `GET /api/operator/tasks`
- `GET /api/operator/tasks/:task_id`
- `POST /api/operator/tasks`
- `PATCH /api/operator/tasks/:task_id`
- `DELETE /api/operator/tasks/:task_id`
- `POST /api/operator/tasks/:task_id/archive`
- `POST /api/operator/tasks/:task_id/restore`

Current status:

- canonical storage exists
- parser/client support exists
- tasks route/view-model is now attached
- detail panel is now attached
- create/edit task form is now attached
- linked run / replay / approval context is now attached on `task-detail` when a task has `linked_run_id`
- tasks list now supports status/owner filtering
- task-detail now supports quick status transitions
- task mutation errors now include status-transition and pending-approval guardrails
- task approval requests now carry rationale and requested-change payloads
- task editor now previews changed fields and approval-sensitive fields before save
- task-detail now exposes a delete action for the canonical task record
- delete is blocked while task-scoped or linked-run approvals remain pending
- bridge client errors now surface backend error messages instead of status-only placeholders
- operator tasks now carry `archived_at` as a separate lifecycle field
- operator tasks now also carry `archived_by` and `archive_note`
- tasks list now hides archived records by default and can opt into showing them
- task-detail now exposes archive / restore lifecycle actions
- delete now requires archiving first instead of acting as the default cleanup path
- archive now requires an explicit rationale
- archived task-detail now shows archive metadata and rationale
- archived tasks are now read-only in the shell until restored
- archived tasks cannot request new task-scoped approvals until restored
- current task filters now persist locally between reloads
- named task filter presets can now be saved and reapplied from the sidebar
- bulk archive and bulk restore now operate on the current filtered task queue
- task rows now support per-task local selection in the sidebar
- bulk actions now target selected tasks first and fall back to the filtered queue
- bulk lifecycle UI now renders a structured success/failure report instead of only a flat error string

### Operator workspaces contract

Backend contract now exists for:

- `GET /api/operator/workspaces`
- `GET /api/operator/workspaces/:workspace_id`
- `POST /api/operator/workspaces`
- `PATCH /api/operator/workspaces/:workspace_id`

Current status:

- canonical workspace storage exists
- parser/client support exists
- `workspaces` and `workspace-detail` routes are now attached
- workspace list/detail/editor shell is now attached
- task detail can now link to a canonical workspace route when `workspace_ref` is populated
- task editor now uses canonical workspace options instead of a free-form workspace input
- task create/update now rejects unknown workspace ids except for unchanged legacy refs
- workspace detail task refs are now derived from task records rather than trusted from free-form workspace input
- task editor now shows a richer workspace summary for the selected canonical workspace
- unresolved legacy workspace refs now have an explicit in-place migration flow in task detail
- workspace detail now exposes quick status controls
- archived workspaces now become read-only in the shell until reactivated
- task create cannot attach new links to archived workspaces
- workspace archive is blocked while active linked tasks still point at that workspace
- workspaces now carry archive metadata and rationale
- workspace archive now requires a rationale, mirroring task archive expectations
- workspace detail now renders linked task blocker actions
- linked tasks can now be detached from the current workspace from workspace detail
- workspace detail can now archive linked tasks to clear archive blockers

## FE-1 shell model

### Run list item

Derived from `GET /api/runs`:

- `runId`
- `title`
- `status`
- `subtitle`
- `metrics[]`

### Run detail

Derived from `GET /api/runs/:id`:

- `runId`
- `title`
- `status`
- `latestIteration`
- `objective`
- `acceptance[]`
- `stats[]`

## Naming rule

UI model names do not have to equal backend field names exactly, but the
mapping must be explicit and traceable.

Implemented FE-1 mapping modules:

- `packages/dashboard/src/forward-view-model.ts`
- `packages/dashboard/src/forward-bridge.ts`
- `packages/dashboard/src/forward-route.ts`

Implemented overview-slice mapping modules:

- `packages/dashboard/src/operator-summary-model.ts`
- `packages/dashboard/src/forward-bridge.ts`
- `packages/dashboard/src/forward-route.ts`

Implemented inbox-slice mapping modules:

- `packages/dashboard/src/operator-inbox-model.ts`
- `packages/dashboard/src/forward-bridge.ts`
- `packages/dashboard/src/forward-route.ts`

Implemented agents-slice mapping modules:

- `packages/dashboard/src/operator-agents-model.ts`
- `packages/dashboard/src/forward-bridge.ts`

Implemented owned-task contract modules:

- `packages/dashboard/src/forward-bridge.ts`

Implemented tasks-slice mapping modules:

- `packages/dashboard/src/operator-tasks-model.ts`
- `packages/dashboard/src/forward-bridge.ts`
- `packages/dashboard/src/forward-route.ts`
