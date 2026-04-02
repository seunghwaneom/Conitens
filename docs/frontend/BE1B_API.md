# BE-1b Forward Live And Approval Bridge

Status: `implemented`

## Scope

BE-1b extends the forward-only bridge with:

- approval list/read routes
- approval decision/resume routes
- one-way SSE stream for run/room updates
- typed frontend bridge helpers for approvals and SSE subscription

This milestone does **not** add approval UI yet.

## Endpoint set

### `GET /api/approvals`

Supported query params:

- `run_id`
- `iteration_id`
- `status`

### `GET /api/approvals/:request_id`

Returns a single approval request record.

### `POST /api/approvals/:request_id/decision`

Request body:

```json
{
  "status": "approved",
  "reviewer_note": "approved"
}
```

Reviewer identity is bridge-owned and stamped server-side. The browser may submit
only the decision status, reviewer note, and optional edited payload.

Supported statuses:

- `approved`
- `edited`
- `rejected`

### `POST /api/approvals/:request_id/resume`

Resumes the build graph for the request's run after the approval decision has
been recorded.

Guard:

- resume is rejected unless the request matches the run's active
  `pending_approval_request_id`

### `GET /api/events/stream`

SSE endpoint.

Supported query params:

- `run_id`
- `room_id`

Stream behavior:

- first event is always `snapshot`
- unchanged state emits `heartbeat`
- changed state emits a new `snapshot`

## Auth and transport note

All bridge routes, including SSE, now use the same bearer auth header.

The dashboard consumes SSE through `fetch()` with `Authorization` rather than a
query token, which removes the earlier URL/query-string credential exposure.

The bridge now also returns loopback-only CORS headers so a local dashboard
preview origin can call the loopback bridge safely.

## Reconnection semantics

No sequence numbering exists yet.

Therefore:

- treat each `snapshot` as a fresh point-in-time view
- do not assume gap recovery
- reconnect with the same `run_id` / `room_id` filters

## Frontend bridge helpers

Typed helpers now exist in:

- `packages/dashboard/src/forward-bridge.ts`

Added helpers:

- `forwardListApprovals`
- `forwardGetApproval`
- `forwardDecideApproval`
- `forwardResumeApproval`
- `openForwardEventStream`

## Deliberately deferred

- approval center UI
- live replay UI
- sequence numbers / replay gap recovery
- WebSocket transport
- any mutation outside approval semantics
