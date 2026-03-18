# MCP Write Plan

This document describes future write-capable MCP tools without enabling them in
the current release.

## Current State

- MCP is read-only today.
- MCP is layered as resources, prompts, then tools.
- Read-only resources/prompts expose workflow definitions, workflow runs, gates,
  office snapshots, blocked-run summaries, approval preparation, and verify
  checklists before any write-capable tools are introduced.
- Read-only tools expose tasks, locks, questions, context, meetings, workflow
  runs, handoffs, registry summaries, and office snapshots.
- Write tools must not bypass existing question or owner approval policy.

## Candidate Write Tools

- `task.create`
- `task.log`
- `meeting.say`
- `question.approve`
- `workflow.run` with write-capable steps only after approval-aware design

## Approval Gate Requirements

### task.create

- allowed only when local policy permits task creation
- should emit an explicit event record before and after creation
- remote callers must not silently choose owner/executor fields

### task.log

- allowed only for the active task or an explicitly selected task
- should preserve existing task ownership and state rules
- if it changes `next_expected` or risk state, it must be auditable

### meeting.say

- relatively lower risk than file mutation
- still requires transcript redaction and event logging
- remote callers must not spoof sender identity without traceable actor metadata

### question.approve

- highest risk among current candidates
- must remain owner-gated
- remote callers may request approval flow, but must not finalize approval
  without local owner validation

## Read/Write Separation Strategy

- keep read-only tools in the default MCP surface
- place write-capable tools behind an explicit disabled-by-default registry
- require per-tool approval metadata, not a global "write enabled" switch

## Remote Policy Boundary

Remote callers must not be able to bypass:

- workspace policy
- owner validation
- verify-before-close
- question queue semantics

Required pattern:

1. remote request arrives
2. local policy evaluates it
3. question/approval is raised when needed
4. final execution occurs locally
5. event log records request, decision, and execution

## Audit Trail Requirements

Every future write-capable MCP tool should record:

- request event
- approval-required or approval-granted event
- execution result event
- actor and scope metadata
- redaction status
- `gate_record_v1` linkage when an approval pause is required
- `artifact_manifest_v1` linkage for output artifacts and execution evidence

## Not In Scope Yet

- direct remote file mutation
- remote close without verify
- remote owner-approval bypass
- remote workflow execution that can embed arbitrary write commands by default
