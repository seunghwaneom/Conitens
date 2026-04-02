# Frontend State Boundary

## Rule

The frontend reads forward runtime state through the bridge. It does not become
the source of truth.

## Canonical owners

| Concept | Owner | Frontend treatment |
| --- | --- | --- |
| run state | `sqlite:runs` | read via `/api/runs` and `/api/runs/:id` |
| iteration state | `sqlite:iterations` | read via `/api/runs/:id` and replay |
| validator results | `sqlite:validator_results` | read via replay/detail only |
| approval decisions | `sqlite:approval_requests` | read via replay/detail only |
| room events | `sqlite:messages` | read via room timeline / replay |
| tool events | `sqlite:tool_events` | read via replay |
| insights | `sqlite:insights` | read via replay/room timeline |
| task plan status | `sqlite:context_task_plans` | projected into state-docs |
| immutable progress log | `sqlite:context_progress_entries` | projected into state-docs |

## Digest rule

Keep these separate:

- runtime digest = `.conitens/context/LATEST_CONTEXT.md`
- repo digest = `.vibe/context/LATEST_CONTEXT.md`

The bridge exposes both fields explicitly. UI consumers must not treat them as
aliases.

## Projection rule

For BE-1a, state-doc routes should use existing projection services and stored
state rather than reparsing checked-in markdown as if markdown were the primary
source of truth.

## Browser limitations

- browser state is cache and presentation state only
- replay transcript is display/evidence, not execution memory
- no write path is introduced in BE-1a
