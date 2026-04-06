# Paperclip -> Conitens Phase 1 Backlog

Date: `2026-04-04`
Depends on:

- [PAPERCLIP_CONITENS_INTEGRATION_PLAN_2026-04-04.md](/mnt/d/Google/.Conitens/docs/PAPERCLIP_CONITENS_INTEGRATION_PLAN_2026-04-04.md)
- [paperclip_conitens_integration_plan_2026-04-04.md](/mnt/d/Google/.Conitens/.conitens/reviews/paperclip_conitens_integration_plan_2026-04-04.md)

## Scope

This document turns the comparative Paperclip planning work into an executable
Phase 1 backlog for Conitens.

Phase 1 is intentionally limited to:

- read-only productization
- operator inbox and summary projections
- route and shell expansion in `packages/dashboard`
- forward bridge read aggregation only

Phase 1 explicitly does **not** include:

- runtime replacement
- canonical durable task schema
- write-capable task registry
- budget enforcement changes
- approval/validator policy weakening

Current runtime truth remains:

- `scripts/ensemble.py`
- `.notes/`
- `.agent/`

The forward stack remains additive.

## Phase 1 Goal

Make current Conitens feel like an operator workbench rather than only a
forward-runtime inspector, without introducing a third truth owner.

The Phase 1 outcome should be:

- `overview` and `inbox` become first-class routes
- operators can answer "what needs action now?" without drilling into replay
- UI derives stable operator objects from backend projections rather than
  ad hoc frontend heuristics

## Phase 1 Principles

1. `read projection -> owned API -> durable object`
2. UI must not invent task truth client-side
3. approval and validator semantics remain upstream of any new operator view
4. office / replay / room remain differentiated evidence surfaces
5. visual language stays Conitens-native

## Deliverables

### Product / UX

- operator IA update: `overview / inbox / runs / run-detail / agents / office`
- inbox triage model
- operator summary strip
- responsive shell notes for narrow widths

### Frontend

- route expansion in `packages/dashboard/src/forward-route.ts`
- shell orchestration updates in `packages/dashboard/src/App.tsx`
- new view-model modules for operator summary and inbox
- new dashboard components for attention lists and summary panels
- tests covering new route parsing and projection parsing

### Backend

- read-only forward bridge endpoints for operator summary and inbox projections
- repository query helpers if needed for aggregation
- tests covering endpoint shape and auth behavior

### Design System

- explicit component and token rules for the new operator surfaces
- no Tailwind or Paperclip visual system import

## Target Information Architecture

### Primary routes

- `overview`
- `inbox`
- `runs`
- `run-detail`
- `agents`
- `office`

### Route semantics

- `overview`: high-level operator posture, summary metrics, and attention strip
- `inbox`: approvals, questions, validator failures, blocked/stale work, handoff risk
- `runs`: execution traces list
- `run-detail`: replay, state docs, insights, approvals, graph, room context
- `agents`: fleet and latest operating posture
- `office`: spatial lens only

### Keep out of Phase 1

- `tasks`
- `workspaces`
- `budgets`
- `activity`

Those are valid future routes, but Phase 1 should first prove the projection
model through `overview` and `inbox`.

## Backend Backlog

### BE-1: Operator Summary Endpoint

Goal:

Add a compact read-only summary endpoint over current forward state.

Suggested route:

- `GET /api/operator/summary`

Suggested response shape:

```json
{
  "generated_at": "2026-04-04T00:00:00Z",
  "runs": {
    "active": 1,
    "blocked": 0,
    "awaiting_approval": 1,
    "latest_event_type": "APPROVAL_REQUESTED"
  },
  "approvals": {
    "pending": 2,
    "rejected_recent": 0
  },
  "rooms": {
    "active": 3,
    "questions_open": 1
  },
  "validation": {
    "failing_runs": 1,
    "latest_failure_reason": "..."
  },
  "handoffs": {
    "open": 2
  }
}
```

Primary files:

- [ensemble_forward_bridge.py](/mnt/d/Google/.Conitens/scripts/ensemble_forward_bridge.py)
- [ensemble_loop_repository.py](/mnt/d/Google/.Conitens/scripts/ensemble_loop_repository.py)
- [ensemble_replay_service.py](/mnt/d/Google/.Conitens/scripts/ensemble_replay_service.py)

Notes:

- projection only, no new source-of-truth table
- counts and latest reasons should come from existing persisted forward state

### BE-2: Operator Inbox Endpoint

Goal:

Expose action-ordered attention items as a backend projection.

Suggested route:

- `GET /api/operator/inbox`

Suggested response shape:

```json
{
  "items": [
    {
      "id": "approval:approval-123",
      "kind": "approval",
      "severity": "warning",
      "title": "Approval required for shell_execution",
      "summary": "sample-agent requested shell_execution",
      "run_id": "run-1",
      "iteration_id": "iter-1",
      "room_id": null,
      "created_at": "2026-04-04T00:00:00Z",
      "action_label": "Review approval"
    }
  ],
  "count": 1
}
```

Inbox kinds for Phase 1:

- `approval`
- `question`
- `validator_failure`
- `blocked_run`
- `stale_run`
- `handoff_attention`

Primary files:

- [ensemble_forward_bridge.py](/mnt/d/Google/.Conitens/scripts/ensemble_forward_bridge.py)
- [ensemble_approval.py](/mnt/d/Google/.Conitens/scripts/ensemble_approval.py)
- [ensemble_replay_service.py](/mnt/d/Google/.Conitens/scripts/ensemble_replay_service.py)
- [ensemble_room_service.py](/mnt/d/Google/.Conitens/scripts/ensemble_room_service.py)

Notes:

- use stable item IDs derived from existing objects
- items must link back to existing run / iteration / room / approval IDs
- do not create standalone mutable inbox records in Phase 1

### BE-3: Repository Query Helpers

Goal:

Avoid putting aggregation logic inline in the HTTP handler.

Suggested additions:

- `list_active_runs()`
- `list_pending_approval_requests()`
- `list_recent_validator_failures(limit=...)`
- `list_room_questions_open(limit=...)`
- `list_open_handoff_packets(limit=...)`

Primary file:

- [ensemble_loop_repository.py](/mnt/d/Google/.Conitens/scripts/ensemble_loop_repository.py)

Constraint:

- no schema change in Phase 1 unless a missing index becomes necessary after implementation

## Frontend Backlog

### FE-1: Route Expansion

Goal:

Expand the shell from the current four-route model to the Phase 1 operator IA.

Current file:

- [forward-route.ts](/mnt/d/Google/.Conitens/packages/dashboard/src/forward-route.ts)

Changes:

- add `overview`
- add `inbox`
- rename `office-preview` display semantics to `office` while preserving the existing route if needed as compatibility alias
- keep `runs`, `run-detail`, `agents`

Acceptance:

- hash parsing round-trips
- old `#/office-preview` stays compatible or redirects cleanly

### FE-2: Operator Summary View Model

Goal:

Introduce a stable UI contract for overview rendering.

Add file:

- `packages/dashboard/src/operator-summary-model.ts`

Suggested exported types:

- `OperatorSummaryViewModel`
- `OperatorSummaryMetric`
- `OperatorAttentionStripItem`

Input source:

- `/api/operator/summary`

Constraint:

- no direct derivation from mixed local demo state and live bridge state

### FE-3: Operator Inbox View Model

Goal:

Convert raw inbox projection payloads into UI-shaped objects.

Add file:

- `packages/dashboard/src/operator-inbox-model.ts`

Suggested exported types:

- `OperatorInboxItemViewModel`
- `OperatorInboxGroupViewModel`

Input source:

- `/api/operator/inbox`

Expected responsibilities:

- severity to visual tone mapping
- action label normalization
- target-link generation back to existing routes

### FE-4: Shell Orchestration

Goal:

Make `App.tsx` load overview/inbox data alongside existing run detail flows.

Primary file:

- [App.tsx](/mnt/d/Google/.Conitens/packages/dashboard/src/App.tsx)

Changes:

- add overview state and error handling
- add inbox state and error handling
- render overview as the default route instead of runs
- keep run-detail loading path unchanged

Constraint:

- existing replay / state-doc / room / approval center flows must remain intact

### FE-5: New Components

Suggested additions:

- `OperatorSummaryPanel.tsx`
- `OperatorInboxPanel.tsx`
- `AttentionStrip.tsx`
- `InboxList.tsx`

Location:

- `packages/dashboard/src/components/`

Design rules:

- reuse shell tokens and panel grammar
- no Paperclip-style generic card mosaic
- keep office and replay panels visually related but functionally separate

### FE-6: Agents Surface Light Upgrade

Goal:

Make the `agents` route closer to an operator roster without inventing durable task ownership yet.

Suggested additions:

- latest run status
- latest blocker / approval sensitivity marker
- current room / current run linkage if derivable

Primary touchpoints:

- existing `agents` route in [App.tsx](/mnt/d/Google/.Conitens/packages/dashboard/src/App.tsx)
- any fleet/relationship components already used there

## API / Contract Backlog

### Forward bridge type additions

Primary file:

- [forward-bridge-types.ts](/mnt/d/Google/.Conitens/packages/dashboard/src/forward-bridge-types.ts)

Add:

- `ForwardOperatorSummaryResponse`
- `ForwardOperatorInboxResponse`
- `ForwardOperatorInboxItem`

### Parser additions

Primary file:

- `packages/dashboard/src/forward-bridge-parsers.ts`

Add:

- `parseOperatorSummaryResponse`
- `parseOperatorInboxResponse`

### Client additions

Primary file:

- `packages/dashboard/src/forward-bridge-client.ts`

Add:

- `forwardGetOperatorSummary`
- `forwardGetOperatorInbox`

### View model contract update

Primary doc:

- [VIEW_MODEL.md](/mnt/d/Google/.Conitens/docs/frontend/VIEW_MODEL.md)

Update with:

- overview model
- inbox model
- naming and ownership rule that operator objects come from backend projections, not UI heuristics

## Testing Backlog

### Backend tests

Primary file:

- [test_forward_bridge.py](/mnt/d/Google/.Conitens/tests/test_forward_bridge.py)

Add cases for:

- `/api/operator/summary` requires auth and returns expected shape
- `/api/operator/inbox` requires auth and returns stable item IDs
- inbox contains approval-derived items from existing fixtures
- summary keeps runtime/repo digest boundary unaffected

### Frontend parser tests

Primary file:

- [forward-bridge.test.mjs](/mnt/d/Google/.Conitens/packages/dashboard/tests/forward-bridge.test.mjs)

Add cases for:

- `parseOperatorSummaryResponse`
- `parseOperatorInboxResponse`
- route round-trip for `overview` and `inbox`
- view-model shaping for severity/action labels

### UI integration checks

Suggested verification after implementation:

- `node --experimental-strip-types --test --test-isolation=none tests/*.test.mjs`
- `python -m unittest tests.test_forward_bridge`
- `node 'D:\\Google\\.Conitens\\node_modules\\typescript\\bin\\tsc' -b`
- `node 'D:\\Google\\.Conitens\\node_modules\\vite\\bin\\vite.js' build`

## Design System Rules For Phase 1

- Keep shell tokens anchored in [tokens.css](/mnt/d/Google/.Conitens/packages/dashboard/src/styles/tokens.css).
- Keep shell composition anchored in [shell.css](/mnt/d/Google/.Conitens/packages/dashboard/src/styles/shell.css).
- Do not import Paperclip’s Tailwind conventions.
- Prefer rails, strips, and stacked operator panels over generic dashboards full of equal-weight cards.
- Use the existing Conitens typography system unless a separate brand pass explicitly changes it.
- Keep `office` as a differentiated spatial mode.
- Keep replay, room, approval, and insight panels readable as evidence panels, not as generic comments.

## Sequencing

### Slice 1

- BE-1 operator summary
- bridge types / parsers / client support
- FE route expansion for `overview`
- summary panel

### Slice 2

- BE-2 operator inbox
- inbox model
- inbox panel
- top attention strip

### Slice 3

- agents surface light upgrade
- responsive shell adjustments
- docs and screenshots

## Acceptance Criteria

Phase 1 is complete when:

- `overview` and `inbox` exist as first-class routes
- attention items come from backend projections, not frontend heuristics
- no new route implies the forward stack replaced active runtime truth
- run-detail, replay, approval center, room panel, and office surfaces still work
- tests cover new parser and bridge contracts

## Risks

### P1

- frontend heuristics become de facto task truth
- new inbox surface duplicates approval semantics instead of projecting them
- route sprawl makes the shell harder to navigate

### P2

- Paperclip visual ideas overpower Conitens identity
- agents route mixes demo semantics and live semantics
- operator summary becomes another metrics page instead of an action surface

## Out Of Scope For This Document

- Phase 2 durable operator APIs
- Phase 3 canonical task/workspace/agent object model
- actual code implementation

