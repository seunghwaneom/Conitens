# Bridge Boundary

Status: `settled for FE-0`

## BE-1a boundary

The bridge is:

- local
- loopback-only
- bearer-token protected
- read-only
- forward-runtime scoped

## Not in BE-1a

- no writes
- no approvals mutation
- no SSE / WebSocket
- no room compose
- no browser-owned execution state

## FE-1 boundary

FE-1 proves only that:

- the shell can connect to the bridge
- the run list can load from `GET /api/runs`
- a selected run can navigate to a detail route and load `GET /api/runs/:id`

Replay, state-docs, and room surfaces remain later screens even though the
bridge already exposes them.
