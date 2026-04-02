# Event Mapping

Status: `settled for FE-0`

## Canonical source

Use the protocol registry in:

- `packages/protocol/src/event.ts`

This is the canonical event namespace source for frontend mapping work.

## FE-0 rule

Backend canonical names and UI projection names must remain distinct.

Examples:

| Backend canonical event | UI projection family |
| --- | --- |
| `task.created` | `task` |
| `task.status_changed` | `task` |
| `approval.requested` | `approval` |
| `approval.granted` | `approval` |
| `approval.denied` | `approval` |
| `handoff.requested` | `handoff` |
| `handoff.completed` | `handoff` |
| `agent.spawned` | `agent` |
| `agent.error` | `agent` |

## FE-1 impact

FE-1 run list does not yet render full replay events, but future FE-2/FE-3
work must use canonical event names from the protocol package and only derive
UI grouping labels as projections.
