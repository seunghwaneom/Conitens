# PLANS.md

## Batch 0 - Foundation Contract

Acceptance: Required root docs, `.conitens/context/*`, loop protocol, and
scaffold directories exist and describe a disk-backed, restartable architecture
without adding runtime wiring.

## Batch 1 - Run Ledger

Acceptance: A run ID, on-disk run folder shape, and restart-from-disk contract
exist for Ralph-aware execution.

## Batch 2 - Iteration State

Acceptance: Iteration boundaries, step recording, and replayable verification
artifacts are defined without relying on prompt history.

## Batch 3 - Context Refresh

Acceptance: `task_plan.md`, `findings.md`, `progress.md`, and
`LATEST_CONTEXT.md` have explicit write/update rules and handoff semantics.

## Batch 4 - Approval Gates

Acceptance: Approval state transitions, question gates, and owner boundaries
are defined for human and agent actions.

## Batch 5 - Persona Boundary

Acceptance: Persona storage and identity-core protection rules are defined, and
identity auto-edit remains prohibited.

## Batch 6 - Skill Surface

Acceptance: `.agents/skills/*/SKILL.md` loading rules, compatibility intent,
and discovery boundaries are documented.

## Batch 7 - Vibe Sidecar

Acceptance: `.vibe/` responsibilities for repo intelligence, gates, and
fast-lane tooling are defined without becoming runtime truth.

## Batch 8 - Worker Context Packing

Acceptance: Worker prompts use compact summaries and artifact references, and
full transcript injection remains prohibited.

## Batch 9 - Room Episodes

Acceptance: User-visible room, debate, and review episodes are defined, with
AG2 scoped only to those episodes.

## Batch 10 - Orchestration Core

Acceptance: LangGraph integration points are defined for orchestration-core
state flow without collapsing current Conitens runtime boundaries.

## Batch 11 - Replay And Hardening

Acceptance: End-to-end replay, operator runbooks, migration notes, and
verification checklists exist for the v0 disk-backed system.

## Frontend Rebaseline v4.1 - P0 Runtime/Service Audit

Goal:
- determine whether frontend work is unblocked under
  `docs/conitens_frontend_rebaseline_v4_1.md`
- confirm actual runtime target, service importability, room mapping candidates,
  and bridge direction before any frontend implementation

Planned steps:
1. verify pre-flight artifacts and actual runtime entrypoints
2. audit forward-runtime importability and bridge candidates
3. write `docs/frontend/RUNTIME_AND_SERVICE_AUDIT.md`
4. write `docs/frontend/CONTROL_PLANE_DECISION.md`
5. stop if forward-runtime targeting remains blocked

Current decision:
- explicit forward-runtime entry contract added:
  - `ensemble forward status`
  - `ensemble forward context-latest`
  - `ensemble --forward status`
- BE-1a forward-only bridge is now implemented:
  - `ensemble forward serve`
  - `GET /api/runs`
  - `GET /api/runs/:id`
  - `GET /api/runs/:id/replay`
  - `GET /api/runs/:id/state-docs`
  - `GET /api/runs/:id/context-latest`
  - `GET /api/rooms/:id/timeline`
- FE-0 contracts/mappings are now written
- FE-1 shell/run list is now implemented in `packages/dashboard`
- FE-3 replay/state-doc/context/room panels are now implemented in `packages/dashboard`
- FE-4 live room updates are now implemented in `packages/dashboard`
- FE-5 graph/state inspector is now implemented in `packages/dashboard`
- BE-1b live/approval bridge is now implemented
- FE-6 approval center is now implemented in `packages/dashboard`
- FE-7 insights view is now implemented in `packages/dashboard`
- FE-8 stabilization / cleanup is now implemented in scoped form
- next recommended step: stop and review before introducing any new frontend surface
