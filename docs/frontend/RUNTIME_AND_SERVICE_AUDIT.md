# Runtime And Service Audit

Date: `2026-04-02`
Reference: [conitens_frontend_rebaseline_v4_1.md](/D:/Google/.Conitens/docs/conitens_frontend_rebaseline_v4_1.md)

## Active runtime at the 2026-04-02 baseline

The active runtime at that baseline was the legacy Python control plane:

- `scripts/ensemble.py`
- `.notes/`
- `.agent/`

Evidence:

- [bin/ensemble.js](/D:/Google/.Conitens/bin/ensemble.js) delegates only to
  [ensemble.py](/D:/Google/.Conitens/scripts/ensemble.py).
- [control-plane-compatibility.md](/D:/Google/.Conitens/docs/control-plane-compatibility.md)
  explicitly states that lineage 1 remains the operational source of truth.
- [LATEST_CONTEXT.md](/D:/Google/.Conitens/.conitens/context/LATEST_CONTEXT.md)
  still describes the forward `.conitens` stack as additive, not promoted.

## Forward runtime status at the 2026-04-02 baseline

At that baseline, the forward runtime was implemented as a substantial additive
stack under `.conitens/` and `scripts/ensemble_*.py`, but it was not independently
exposed as the main runnable runtime.

What exists:

- SQLite loop state and services
- context projection
- orchestration skeleton
- iterative execution loop
- approval controls
- room/replay/insight services

What was missing at that baseline as an operator-facing contract:

- no `--forward` mode surfaced from [ensemble.py](/D:/Google/.Conitens/scripts/ensemble.py)
- no alternate CLI wrapper entrypoint promoted alongside
  [bin/ensemble.js](/D:/Google/.Conitens/bin/ensemble.js)
- no explicit docs claiming the forward stack is the current operator runtime

Baseline conclusion:

- forward runtime is **implemented**
- forward runtime is **not yet independently runnable as the canonical frontend target**

## Current status after the explicit Forward entry contract

Forward can be targeted only as a quarantined local operator sidecar, not as a
security-cleared or canonical runtime.

The repo now exposes a clearly scoped forward entry contract:

- `ensemble forward status`
- `ensemble forward context-latest`
- compatibility alias: `ensemble --forward status`

This satisfies the v4.1 prerequisite that required an explicit forward mode.
It does not promote the forward stack to the active runtime; it only makes the
forward target operator-visible and selectable.

Decision:

- local frontend development is **unblocked for quarantined BE-1a work**
- public-context redaction remains a blocker for any security-cleared or
  promoted operator surface

## Existing service modules and their import status

Measured from `scripts/` via direct Python import:

| Module | Import status | Time |
| --- | --- | ---: |
| `ensemble_loop_repository` | PASS | `68.4ms` |
| `ensemble_context_markdown` | PASS | `1.1ms` |
| `ensemble_room_service` | PASS | `19.9ms` |
| `ensemble_replay_service` | PASS | `0.6ms` |
| `ensemble_insight_extractor` | PASS | `0.8ms` |
| `ensemble_approval` | PASS | `16.0ms` |
| `ensemble_context_assembler` | PASS | `5.3ms` |

Interpretation:

- the service layer is not heavily boot-coupled
- a thin query adapter is technically plausible
- the current blocker is control-plane/runtime scope, not importability

## Existing room abstraction mapping candidates

The repo still carries overlapping room abstractions.

Legacy/operator-facing room lineage:

- [ensemble_agents.py](/D:/Google/.Conitens/scripts/ensemble_agents.py)
- `.notes/rooms/*.json` / `.jsonl`
- [ensemble_ui.py](/D:/Google/.Conitens/scripts/ensemble_ui.py) currently still
  imports `list_rooms` from `ensemble_agents`

Forward room/replay lineage:

- [ensemble_room.py](/D:/Google/.Conitens/scripts/ensemble_room.py)
- [ensemble_room_service.py](/D:/Google/.Conitens/scripts/ensemble_room_service.py)
- `rooms`, `messages`, `tool_events`, `insights`, `handoff_packets` tables in
  `.conitens/runtime/loop_state.sqlite3`

Mapping recommendation:

- treat the forward room service as the intended frontend target
- do not finalize room UI against the legacy `.notes` room list path
- keep room surface behind the same forward-mode gate as the rest of the bridge

## Existing protocol/event type sources

Protocol/event registry exists.

Verified source:

- [event.ts](/D:/Google/.Conitens/packages/protocol/src/event.ts)

This gives the repo a canonical event dictionary for frontend mapping work.
That is better than deriving all event names ad hoc from replay tables alone.

## Recommended HTTP framework for BE-1a

Recommendation: reuse the existing local Python HTTP surface first, not FastAPI.

Reason:

- the repo already has a working authenticated local HTTP shell in
  [ensemble_ui.py](/D:/Google/.Conitens/scripts/ensemble_ui.py)
- no established Python web framework is currently present
- the v4.1 goal for BE-1a is a thin query adapter, not a new backend stack

Current status after the 2026-07-11 promotion review: Forward is quarantined,
not promoted. Gates 1, 6, and 7 are contradicted, and gates 2, 3, 4, 5, and 8
remain unproven. Gate 6 fails because arbitrary browser-visible context Markdown
can retain raw prompt, transcript, stdout, and stderr bodies, secret-shaped
strings, and absolute POSIX paths. The current blacklist sanitizer is not an
allowlisted public projection. Forward should be described as an additive
operator/read-model sidecar with bounded authenticated command routes; current
authority remains `scripts/ensemble.py` plus `.notes/`, `.agent/`, and the
event ledger, with `default_runtime=legacy`.

The explicit `forward <action>` entry contract now satisfies the original
runtime-targeting prerequisite. The implemented BE-1a path therefore remains:

1. scope a forward-only read surface
2. reuse or extract the relevant routing/projection patterns from
   `ensemble_ui.py`
3. avoid adding FastAPI unless the existing surface becomes a measurable
   limitation

## Current next step after BE-1a

The earlier recommendation to establish a scoped Forward entry contract is
complete. It did not promote Forward.

Recommended next step:

- keep the explicit Forward entry contract quarantined
- separate query and operator-command boundaries before reconsidering promotion
- retain the legacy runtime as default authority

Why not decoupling sprint:

- the audited forward service modules already import successfully and quickly
- the main blockers are authority boundaries and public-context redaction, not
  service importability

Why quarantined BE-1a development remains reasonable:

- the service layer imports cleanly
- an explicit forward entry contract now exists
- the frontend can target that forward-only surface for local development
  without pretending it is the default runtime or security-cleared

## Summary verdict

- Active runtime today: legacy Python control plane
- Forward runtime status: implemented as the current explicit dashboard sidecar,
  but not promoted to default runtime authority
- Frontend can target forward mode now: **Only as a quarantined local sidecar; public-context redaction remains a blocker**
- Service module import status: **Pass**
- Recommended next step: **keep BE-1a scoped to the forward query surface and quarantine Forward until promotion gates pass**
