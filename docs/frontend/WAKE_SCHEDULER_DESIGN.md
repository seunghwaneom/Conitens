# Wake Scheduler Design Gate

Status: `design-ready`

This document defines the safety contract that must exist before Conitens adds
any live wake scheduling, wake message delivery, unattended resume, or status
mutation path. It does not implement a scheduler.

## Purpose

The existing wake-readiness projection answers: "which task, run, or room
subjects look ready, blocked, or stale from local evidence?"

A future wake scheduler would answer a riskier question: "which operator action
should Conitens actually initiate?" Because that second question can create
messages, resume work, or mutate task/run/room state, it must be gated by
explicit approval, verification, event logging, and audit rules.

## Current Safe Inputs

The scheduler may read only these existing local projections in its first
implementation slice:

- `GET /api/operator/wake-readiness`
- `ensemble forward wake-readiness`
- status-confidence diagnostics
- metadata-only turn records
- runtime-roster hints
- canonical operator task detail
- pending approval state

The scheduler must not read raw transcripts, tool payload values, approval
payload values, validator issue details, provider prompts, completions, raw PR
or CI logs, environment dumps, or provider auth output.

## Proposed Future Surfaces

The first implementation after this document should be a dry-run planner, not a
live scheduler:

- CLI: `ensemble forward wake-plan --dry-run`
- Bridge: `GET /api/operator/wake-plan`
- Output: deterministic plan rows derived from wake-readiness candidates
- Mutation: none
- Event append: none

Only a later explicit write slice may add durable wake-plan events. Proposed
event names are reserved for that future slice and must not be appended until
they are added to the protocol registry and raw-content rejection tests:

- `wake.plan_requested`
- `wake.plan_approved`
- `wake.plan_rejected`
- `wake.action_recorded`

## Approval Gate

No wake action may execute by default. A wake action means any operation that:

- sends a wake message
- resumes a paused run
- changes task, run, room, approval, or handoff state
- writes `.notes` projections through runtime paths
- launches an external provider or provider CLI
- calls an external GitHub, CI, chat, or calendar API

Before any wake action, the future scheduler must create an explicit approval
request that records:

- `wake_plan_id`
- candidate subject type and id
- linked task/run/room refs
- proposed action kind
- evidence refs
- source projection generation time
- expected mutation/event types
- reviewer identity required at decision time

Approval must be checked by id, not by "latest pending request". Resolved
approval decisions must not be mutated. A stale, missing, or mismatched approval
must block execution.

## Verification Gate

Immediately before executing an approved wake action, the scheduler must re-read
local evidence and reject execution when any of these checks fail:

- the candidate subject still exists
- linked task/run/room refs still match the approved plan
- wake-readiness still returns a compatible readiness value
- pending approvals have not changed in a way that adds a blocker
- runtime-roster still reports the chosen runtime as available when a runtime is
  required
- status-confidence evidence is not older than the configured stale threshold
- the action payload still contains no raw prompt/completion/transcript/log/body
  fields
- the reviewer identity matches the approved decision record

Verification failure should create a reviewed failure record in the future
event slice, not silently continue with a best-effort wake action.

## Mutation Gate

All future wake mutations must be event-first:

1. Validate the approved plan and fresh evidence.
2. Build a bounded event payload.
3. Reject raw-content fields before append.
4. Append the event through the existing event append path.
5. Only then update any projection files or derived state.

New modules must not write `.notes/` directly. They must emit events and let the
projection layer handle derived files. Task/run/room status mutation must stay
inside the canonical runtime/repository paths and must preserve existing
approval and verify gates.

## Privacy And Redaction

Wake plan and wake action payloads may contain:

- ids
- statuses
- confidence levels
- reason codes
- blocker codes
- bounded evidence refs
- source projection names
- counts
- timestamps
- runtime names
- reviewer identity labels

They must not contain:

- prompt, completion, request, response, or message body text
- raw transcript snippets
- raw tool payload values
- approval payload values
- validator issue bodies
- raw PR/CI logs, diffs, patches, comments, reviews, or output
- bearer tokens, provider API keys, cookies, credentials, or environment dumps
- URLs with credentials, query strings, or fragments

Any future serializer must include regression tests for these rejected fields.

## Operator UI Rules

A dashboard wake scheduler surface must separate three states:

- `read-only`: projected candidates and evidence links only
- `approval required`: a proposed plan exists but cannot execute
- `execution recorded`: an approved action was executed and linked to events

The UI must not render a one-click resume, auto-wake, or provider-auth control.
When execution is eventually implemented, the UI should route through the
existing approval center instead of creating a parallel decision path.

## Failure Modes

The scheduler must fail closed for:

- missing approval
- stale approval
- subject ref mismatch
- stale evidence
- missing runtime
- raw-content payload fields
- auth/reviewer mismatch
- external fetch requirement in a slice that has not explicitly enabled it
- any attempt to bypass append-before-mutation ordering

Failure output should be bounded and operator-readable: blocker code,
subject id, linked refs, evidence refs, and the next safe action. It should not
include raw content or secrets.

## Implementation Slice Order

1. `wake-plan --dry-run` pure planner:
   read-only, deterministic, no event writes, no dashboard mutation controls.
2. Protocol and event validation:
   add wake event types plus raw-content rejection tests.
3. Approval request creation:
   explicit write path that creates pending approval requests only.
4. Approved action recorder:
   appends bounded wake action events after fresh verification.
5. Dashboard approval handoff:
   show wake plans and route decisions through the existing approval center.
6. Optional external delivery adapter:
   only after a separate connector-specific security review.

## Acceptance For The Next Code Slice

The next code slice may implement only step 1:

- `wake-plan --dry-run` exists on the forward CLI.
- Optional bridge `GET /api/operator/wake-plan` exists.
- Output is deterministic for the same local evidence.
- Output includes plan id, action kind, subject refs, blockers, evidence refs,
  and approval requirement.
- No events, artifacts, `.notes`, task/run/room status, approvals, providers,
  or external systems are mutated.
- Tests prove raw-content fields are not exposed.
- Tests prove the dry-run planner fails closed for held candidates.
