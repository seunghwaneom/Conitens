# Wave 3 HTTP quality split evidence

## Owned implementation

- `scripts/ensemble_forward_bridge_http.py`: server lifecycle and compatibility facade, 170 pure LOC.
- `scripts/ensemble_forward_bridge_http_protocol.py`: HTTP/auth/body/binding protocol, 117 pure LOC.
- `scripts/ensemble_forward_bridge_http_payloads.py`: public replay and agent projections, 136 pure LOC.
- `scripts/ensemble_forward_bridge_http_operator.py`: operator read routes, 146 pure LOC.
- `scripts/ensemble_forward_bridge_http_resources.py`: agent/thread/approval/run/room routes, 156 pure LOC.
- `scripts/ensemble_forward_bridge_http_routes.py`: root, stream, and route composition, 72 pure LOC.

## Static verification

Invocation: `python check-no-excuse-rules.py` with all six owned modules.

Observable: `no violations in 6 file(s)`.

Invocation: `python -m py_compile` with all six owned modules.

Observable: exit code 0.

## Regression verification

Invocation: `python -m unittest tests.test_forward_bridge_http` plus the HTTP architecture monkeypatch/import checks and the public replay/agent privacy boundary test.

Observable: `Ran 13 tests` and `OK`.

The earlier combined 22-test run also exposed three concurrent failures outside the owned HTTP files: a missing query-core symbol, an existing-query SQLite sidecar mutation, and a missing command-inventory documentation phrase. None originated in the HTTP split.

## Manual HTTP QA

Scenario: launch `launch_forward_bridge('.', port=0)` as a real TCP server and drive it with `curl.exe`.

Observables:

- `GET /` returned 200.
- unauthenticated `GET /api/agents` returned 403.
- authenticated `GET /api/agents` returned 200.
- authenticated traversal-shaped `GET /api/agents/..%2Fprivate` returned 400.

The temporary listener was stopped after the scenario.
