# Bridge Boundary

Status: current boundary corrected for ADR-0004

## Runtime Boundary

The Forward Bridge is:

- local
- loopback-only
- bearer-token protected
- forward-runtime scoped
- split into a side-effect-free query surface and an authenticated operator
  command surface

It is not accurate to describe the whole bridge as read-only. Current bridge
code exposes mutation routes for operator tasks, operator workspaces, approval
decisions, approval resume, task archive/restore/delete, workspace detach, and
patch approval shortcuts. Query routes must remain read-only, but command
routes are mutations and need explicit command/event/projector contracts.

## Query Surface

Query routes include `GET` read models and event/read streams. They must:

- require the existing bridge auth when sensitive data is exposed
- perform no repository, filesystem, event, approval, or runtime mutation
- return only redacted, relative, or opaque references for browser-visible data
- avoid raw transcript text, raw prompt/completion, stdout/stderr, approval
  payload values, tool payload values, tokens, usernames, and absolute paths
- be testable with mutation spies

Examples include run list/detail, room timeline, replay, runtime roster,
workflow contracts, wake readiness, status confidence, reconcile preview,
turn records, and task detail read models.

## Operator Command Surface

Operator command routes include authenticated `POST`, `PATCH`, and `DELETE`
operations. They may mutate Forward operational state, but they must be treated
as commands, not reads.

Every command route should define:

- actor/reviewer identity
- validated target id
- requested transition
- rationale or archive/review note when required
- idempotency or duplicate-handling behavior
- approval and verify gate behavior
- whether it appends an event now or is explicitly listed as forward-only
  operational state pending later repair
- projection/index updates and recovery behavior if they fail

Known current command areas:

- `/api/operator/tasks`
- `/api/operator/workspaces`
- `/api/operator/tasks/:id/archive`
- `/api/operator/tasks/:id/restore`
- `/api/operator/tasks/:id/detach-workspace`
- `/api/operator/tasks/:id/request-approval`
- `/api/approvals/:id/decision`
- `/api/approvals/:id/resume`
- `/api/approvals/:patch_id/approve`
- `/api/approvals/:patch_id/reject`

## Command Contract Inventory

`forward_only_projection_debt` means the route writes the quarantined Forward
SQLite/checkpoint model without first committing an equivalent workspace event.
These routes are not promoted authority. `event_first_projection` means the
ledger append precedes the SQLite/file projection, while automated projection
rebuild may still be future work.

| Method and route | Actor handling | Target and transition | Duplicate/idempotency behavior | Approval/verify gate | Authority and recovery |
| --- | --- | --- | --- | --- | --- |
| `POST /api/operator/tasks` | Reviewer is currently discarded | Validate supplied ids; create task | Generated ids avoid normal collision; supplied duplicates fail | No approval; later close/archive gates apply | `forward_only_projection_debt`; no event replay or automatic recovery |
| `PATCH /api/operator/tasks/:id` | Reviewer is currently discarded | Validate task and linked references; update task | Missing target fails; repeat is last-write-wins | Status/workspace/archive transition checks; no separate verify event | `forward_only_projection_debt`; no event replay or automatic recovery |
| `DELETE /api/operator/tasks/:id` | Reviewer is currently discarded | Validate target; permanently delete eligible task | Missing/deleted target fails | Delete guard blocks unsafe active state | `forward_only_projection_debt`; destructive projection has no replay recovery |
| `POST /api/operator/tasks/:id/archive` | Reviewer is stored as `archived_by` | Validate target; archive with required note | Already archived/invalid state fails | Archive transition guard | `forward_only_projection_debt`; no event replay or automatic recovery |
| `POST /api/operator/tasks/:id/restore` | Reviewer is currently discarded | Validate target; restore archived task | Non-archived target fails | Restore transition guard | `forward_only_projection_debt`; no event replay or automatic recovery |
| `POST /api/operator/tasks/:id/detach-workspace` | Reviewer is currently discarded | Validate target; clear workspace reference | Repeating after detach is rejected by transition checks | Task update and workspace-membership checks | `forward_only_projection_debt`; membership refresh has no replay recovery |
| `POST /api/operator/tasks/:id/request-approval` | Reviewer becomes approval actor | Validate task/run/iteration; create pending request | Existing pending request blocks duplicates | Creates the approval gate; does not bypass it | `event_first_projection`; authority survives projection failure, but automated approval projection rebuild remains pending |
| `POST /api/operator/workspaces` | Reviewer is stored only when initially archived | Validate supplied ids/path; create workspace | Generated ids avoid normal collision; supplied duplicates fail | Archive rationale required for archived creation | `forward_only_projection_debt`; workspace/task membership refresh has no replay recovery |
| `PATCH /api/operator/workspaces/:id` | Reviewer is stored only on archive transition | Validate target and task ids; update workspace | Missing target fails; repeat is last-write-wins | Workspace transition and archive rationale checks | `forward_only_projection_debt`; membership refresh has no replay recovery |
| `POST /api/approvals/:id/decision` | Reviewer is committed to the decision event and projection | Validate request; pending to approved/edited/rejected | Non-pending request rejects another decision | This is the explicit owner/reviewer gate | `event_first_projection`; event precedes SQLite, automated rebuild remains pending |
| `POST /api/approvals/:id/resume` | Reviewer is currently discarded | Validate request and active pending checkpoint; resume build | Invalid or inactive checkpoint fails | Requires the matching decided approval; runtime validation follows normal graph flow | `forward_only_projection_debt`; checkpoint/runtime recovery is owned by orchestration, with no bridge event |
| `DELETE /api/approvals/:patch_id/approve` | Reviewer is committed to patch approval | Validate patch/proposal; approve then record applied terminal | Approval is retryable; exactly one applied terminal blocks repeats | Explicit reviewer approval; no persona file mutation occurs in this compatibility path | `event_first_projection`; retry resumes after approval-append success and applied-append failure |
| `DELETE /api/approvals/:patch_id/reject` | Reviewer/reason are accepted but not persisted | Validate patch id; return rejection acknowledgement | Repeat returns the same non-durable acknowledgement | Explicit reviewer rejection | `forward_only_projection_debt`; deliberately non-durable until a registered rejection event exists |

The inventory is a quarantine ledger, not a promotion waiver. Any row marked
`forward_only_projection_debt`, or any `event_first_projection` row without a
tested replay/rebuild path, keeps the Forward sidecar below ADR-0004's promotion gate.
Actor propagation gaps listed above are also promotion blockers.

## Storage And Event Boundary

Bridge transport code should handle auth, body limits, request parsing,
routing, response encoding, CORS/loopback rules, and errors. Storage policy
belongs behind query builders and command services.

Target module split:

- query builders: read-only read models
- command services: validated mutations, approval/risk policy, event behavior
- HTTP/transport: auth, routing, request/response only
- stream helpers: SSE/subscription behavior

Until the command services are introduced, bridge mutations remain documented
debt. They must not be mistaken for read-only behavior and must not be used as a
reason to promote Forward SQLite to workspace authority.

## FE Boundary

The dashboard may:

- connect to the bridge with `apiRoot + bearer token`
- render query payloads
- submit authenticated operator commands
- keep ephemeral UI state such as selection, route, filter, and form state

The dashboard must not:

- own durable task, approval, room, run, or workspace state
- expose absolute local paths, local usernames, tokens, or secret-shaped raw
  strings in browser-visible UI
- treat pixel/spatial UI state as authority for blocker, owner, or next action
- bypass approval or verify gates

## Compatibility

Earlier BE-1a/FE-1 work proved a read-only entry path for initial Forward
views. That historical slice remains valid for those specific `GET` routes, but
the current bridge has grown beyond BE-1a. New work must use the corrected
query-plus-command boundary above.
