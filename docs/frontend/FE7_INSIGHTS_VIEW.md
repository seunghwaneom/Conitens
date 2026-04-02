# FE-7 Insights View

Status: `implemented`

## Scope

FE-7 adds a read-only insights surface to the forward dashboard.

Included:

- structured insight cards from existing replay/room insight records
- findings summary block sourced from state docs
- recent validator correlation block
- raw JSON fallback per insight card

## Data sources

No new backend route or domain model was added.

FE-7 uses only already-loaded data:

- `replay.insights`
- `roomTimeline.insights`
- `stateDocs.documents.findings.content`
- `replay.validator_history`

## Key rule

Insight records remain defensively rendered because their bridge shape is still
loosely typed. FE-7 prefers graceful fallback over pretending the shape is more
stable than it is.

## Deliberately deferred

- insight filtering/search
- cross-run insight comparison
- insight editing/annotation
- new backend insight schema

## Primary files

- `packages/dashboard/src/components/ForwardInsightsPanel.tsx`
- `packages/dashboard/src/forward-view-model.ts`
- `packages/dashboard/src/App.tsx`

## Validation

- dashboard tests pass
- dashboard build passes
- bridge regression tests still pass
