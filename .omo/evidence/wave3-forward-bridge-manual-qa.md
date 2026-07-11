# Wave 3 Forward Bridge manual QA

Date: 2026-07-11 (Asia/Seoul)

## CLI surface

- `python scripts/ensemble.py forward --help` exited 0 and listed the supported Forward actions.
- `python scripts/ensemble.py --workspace . forward status --format json` exited 0 and reported `default_runtime: legacy`.
- `python scripts/ensemble.py --workspace . forward context-latest --format json` exited 0 and returned the bounded public latest-context envelope.
- `python scripts/ensemble.py --workspace . --forward start` exited 2 with the status-only compatibility error.

## Live HTTP surface

A real bridge was launched on loopback with an ephemeral port and bearer token. The token is intentionally omitted from this evidence.

- `GET /`: 200.
- Unauthenticated `GET /api/runs`: 403.
- Authenticated `GET /api/runs`: 200 with `{runs: [], count: 0}`.
- Authenticated `GET /api/operator/summary`: 200; bounded evidence/doctor/runtime-roster metadata only, no raw transcript/request/response content and no bearer token.
- Traversal-shaped `GET /api/agents/..%2Fprivate-agent`: 400 without echoing the identifier.
- Searching for a seeded raw private message term returned `total: 0`.
- Searching for seeded public thread metadata returned `total: 1`.
- Approval, inbox, agent, and direct handoff projections omitted seeded credential/path values; unsafe actors projected as `agent`, unsafe blocked text projected as `handoff blocked`, and public handoff `packet_json` was empty.
- The SSE snapshot projected an unsafe approval actor as `agent`, and a workspace command response projected an unsafe owner as `null`.
- The root page listed all 13 supported operator mutation surfaces as well as read routes.
- Malformed JSON `POST /api/operator/tasks`: 400.
- Negative `Content-Length` `POST /api/operator/tasks`: 400 before body processing.
- A 1,100,000-byte authenticated request returned 413 without a Windows connection reset. A subsequent authenticated `GET /api/runs` returned 200 with parseable JSON, proving the server remained live. The same overflow scenario passed ten consecutive times after the bounded request-drain repair.
- An extreme declared content length was rejected without attempting an unbounded drain.
- Authenticated `GET /api/events/stream`: received `snapshot` and `heartbeat` SSE frames. The client then ended its two-second observation window with curl exit 28, which is expected for a persistent stream.

## Cleanup

- The bridge process was interrupted after QA.
- The final ephemeral bridge was shut down in a `finally` block; its server thread
  joined within five seconds and no listener remained.
