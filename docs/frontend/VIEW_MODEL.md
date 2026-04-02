# View Model

Status: `settled for FE-0`

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
