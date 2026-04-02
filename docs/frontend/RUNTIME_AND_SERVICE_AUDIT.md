# Runtime And Service Audit

Date: `2026-04-02`
Reference: [conitens_frontend_rebaseline_v4_1.md](/D:/Google/.Conitens/docs/conitens_frontend_rebaseline_v4_1.md)

## Active runtime today

The active runtime today is still the legacy Python control plane:

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

## Forward runtime status

The forward runtime is implemented as a substantial additive stack under
`.conitens/` and `scripts/ensemble_*.py`, but it is not independently exposed
as the main runnable runtime today.

What exists:

- SQLite loop state and services
- context projection
- orchestration skeleton
- iterative execution loop
- approval controls
- room/replay/insight services

What is missing as an operator-facing contract:

- no `--forward` mode surfaced from [ensemble.py](/D:/Google/.Conitens/scripts/ensemble.py)
- no alternate CLI wrapper entrypoint promoted alongside
  [bin/ensemble.js](/D:/Google/.Conitens/bin/ensemble.js)
- no explicit docs claiming the forward stack is the current operator runtime

Conclusion:

- forward runtime is **implemented**
- forward runtime is **not yet independently runnable as the canonical frontend target**

## Can frontend safely target forward mode now?

Yes, with an explicit limitation.

The repo now exposes a clearly scoped forward entry contract:

- `ensemble forward status`
- `ensemble forward context-latest`
- compatibility alias: `ensemble --forward status`

This is enough to satisfy the v4.1 gate that required an explicit forward mode.
It does not promote the forward stack to the active runtime; it only makes the
forward target operator-visible and selectable.

Decision:

- frontend work is **unblocked for BE-1a and later forward-only work**
- frontend work must remain explicitly limited to the forward runtime surface

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
- a thin read-only adapter is technically plausible
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
- the v4.1 goal for BE-1a is a thin read-only adapter, not a new backend stack

If and only if the forward runtime is promoted or a clear `--forward` mode is
added, the best first BE-1a path is:

1. scope a forward-only read surface
2. reuse or extract the relevant routing/projection patterns from
   `ensemble_ui.py`
3. avoid adding FastAPI unless the existing surface becomes a measurable
   limitation

## Recommended next step: BE-1a or decoupling sprint

Neither BE-1a nor a service decoupling sprint should start first.

Recommended next step:

- add a clearly scoped forward runtime entry contract
  - either promote the forward stack, or
  - add an explicit `--forward` mode

Why not decoupling sprint:

- the audited forward service modules already import successfully and quickly
- the main blocker is runtime targeting, not service importability

Why BE-1a is now reasonable:

- the service layer imports cleanly
- an explicit forward entry contract now exists
- the frontend can target that forward-only surface without pretending it is
  the default runtime

## Summary verdict

- Active runtime today: legacy Python control plane
- Forward runtime status: implemented but not promoted/runnable as the current
  frontend target
- Frontend can safely target forward mode now: **Yes, explicitly through forward mode**
- Service module import status: **Pass**
- Recommended next step: **start BE-1a as a thin forward-only read bridge**
