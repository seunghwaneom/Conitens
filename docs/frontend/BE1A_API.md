# BE-1a Forward Read Bridge

Status: `implemented`

## Purpose

BE-1a is the thin read-only bridge for the explicit forward runtime surface.
It exposes forward `.conitens` state and service projections without changing
the legacy runtime default.

## Framework choice

Chosen framework: existing Python stdlib HTTP pattern.

Why:

- the repo already had an authenticated local HTTP surface in
  `scripts/ensemble_ui.py`
- forward services import cleanly without full runtime bootstrapping
- no established FastAPI/Flask surface exists in the current Python runtime

## Entry commands

```powershell
python scripts/ensemble.py --workspace . forward serve --host 127.0.0.1 --port 8785
python scripts/ensemble.py --workspace . forward serve --host 127.0.0.1 --port 8785 --once
```

The command prints JSON containing:

- `url`
- `api_root`
- `token`

## Security boundary

- loopback-only
- read-only
- `Authorization: Bearer <token>` supported
- no write endpoints
- state-doc path fields are workspace-relative, not absolute

## Endpoint set

### `GET /api/runs`

Returns the forward run list.

Shape:

```json
{
  "runs": [
    {
      "run_id": "run-...",
      "status": "active",
      "latest_iteration_id": "iter-...",
      "latest_iteration_status": "running",
      "counts": {
        "iterations": 1,
        "validator_results": 1,
        "approvals": 1,
        "rooms": 1,
        "messages": 1,
        "tool_events": 0,
        "insights": 1,
        "handoff_packets": 0
      }
    }
  ],
  "count": 1
}
```

### `GET /api/runs/:id`

Returns run detail, iterations, task plan, and aggregate counts.

### `GET /api/runs/:id/replay`

Returns the forward replay projection from `ReplayService.run_timeline(run_id)`.

### `GET /api/runs/:id/state-docs`

Returns rendered state documents derived from forward persisted state:

- task plan
- findings
- progress
- latest context

These are rendered from existing projection services rather than parsed from
checked-in markdown files.

### `GET /api/runs/:id/context-latest`

Returns:

- `runtime_latest`
- `repo_latest`

The digest split is preserved. The route does not collapse them into one field.

### `GET /api/rooms/:id/timeline`

Returns the forward room timeline from the settled room mapping.

## Local validation

Implemented validations:

- route shape tests
- integration smoke for `/api/runs`
- integration smoke for `/api/runs/:id/replay`
- invalid identifier rejection

## Out of scope

- no write endpoints
- no SSE/WebSocket
- no approvals mutation UI/API here
- no frontend app implementation in this step
