# FE-6 Approval Center

Status: `implemented`

## Scope

FE-6 adds a forward-only approval center to `packages/dashboard`.

Included:

- pending/all approval list for the selected run
- approval detail view
- approve action
- reject action
- resume action when the approval has already been approved or edited
- reviewer note input
- server-owned reviewer attribution

## Deliberately deferred

- `edited_payload` editor
- policy editor UI
- audit-history-only screen
- live SSE refresh

The panel uses polling on load and refresh after actions instead of depending on
live transport.

## Data sources

- `forwardListApprovals`
- `forwardGetApproval`
- `forwardDecideApproval`
- `forwardResumeApproval`

## Runtime semantics

The UI follows the runtime semantics rather than inventing new ones:

- `Approve` records the approval decision only
- `Reject` records the rejection decision only
- `Resume` calls the dedicated resume endpoint after an approval decision

## Current implementation

Primary files:

- `packages/dashboard/src/components/ForwardApprovalCenterPanel.tsx`
- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/forward-bridge.ts`

## Validation

- dashboard test suite passes
- dashboard build passes
- forward live/approval bridge Python tests pass
