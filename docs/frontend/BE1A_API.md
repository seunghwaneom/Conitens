# BE-1a Forward Bridge Query Surface

Status: `implemented`

## Purpose

BE-1a documented the initial query surface for the explicit forward runtime
target. The current Forward Bridge now includes query/read-model routes plus
bounded authenticated operator command routes. It remains quarantined and does
not change the legacy runtime default.

Current gate assessment: Forward fails promotion now. Gates 1, 6, and 7 are
contradicted by current bridge behavior, and gates 2, 3, 4, 5, and 8 remain
unproven. Gate 6 fails because arbitrary context Markdown is not an allowlisted
public projection and can retain raw bodies, secret-shaped strings, and absolute
POSIX paths. Treat Forward as an additive operator/read-model sidecar while
`scripts/ensemble.py` plus `.notes/`, `.agent/`, and the event ledger remain
the current authority.

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
- query routes must be side-effect free
- `Authorization: Bearer <token>` supported
- bounded authenticated operator command routes exist outside the BE-1a query subset
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

- new operator command design beyond the bounded authenticated routes already present
- no SSE/WebSocket
- no new approvals mutation UI/API here
- no frontend app implementation in this step
