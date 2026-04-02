# Control Plane Decision For Frontend Rebaseline v4.1

Date: `2026-04-02`
Status: `unblocked for forward-only bridge work`

## Decision

Begin BE-1a and FE-0 only against the explicit forward runtime surface.

The repo now exposes a narrow forward entry contract:

1. `ensemble forward status`
2. `ensemble forward context-latest`
3. compatibility alias `ensemble --forward status`

## Drivers

- v4.1 explicitly says frontend targets forward runtime only unless a legacy
  bridge is added
- current active runtime truth is still `scripts/ensemble.py` + `.notes/` +
  `.agent/`
- the new forward mode is explicit and additive rather than implicit
- this clears the v4.1 gate without silently repointing the default runtime

## Alternatives considered

### Alternative A: Start BE-1a anyway against the forward services

Rejected for now.

- Pros:
  - service modules are importable
  - existing local HTTP shell can likely host thin read-only routes
- Cons:
  - violates the v4.1 gate
  - frontend target would not match the current operator entry contract
  - increases control-plane ambiguity

### Alternative B: Build against the active legacy runtime first

Rejected for this track.

- Pros:
  - operator truth exists today
- Cons:
  - contradicts the v4.1 forward-only targeting rule
  - would likely create throwaway bridge work

### Alternative C: Stop at P0 audit and require forward entry clarification

Superseded.

- Pros:
  - honors the spec gate exactly
  - preserves source-of-truth boundaries
  - avoids frontend work against an unstable target
- Cons:
  - delays visible frontend progress

## Consequences

- BE-1a now exists as a forward-only bridge task
- BE-1b now exists as a forward-only live/approval bridge task
- FE-0 contracts are now written
- FE-1 minimal shell/run-list UI now exists in `packages/dashboard`
- FE-3 read-only operational screens now exist on top of the same shell
- FE-4 live room/replay updates now exist on top of the same shell
- FE-5 read-only graph/state inspector now exists on top of the same shell
- FE-6 approval center now exists on top of the same shell
- FE-7 insights view now exists on top of the same shell
- FE-8 stabilization has now landed in scoped form
- the active runtime truth remains unchanged
- frontend work must not use legacy runtime implicitly

## Release criteria to unblock frontend work

The unblock condition is now met by the explicit forward entry contract plus
updated compatibility docs.

## Follow-up recommendation

The minimal v4.1 forward dashboard path is now implemented.

Recommended next step:

- stop and review before adding any new frontend surface beyond the current
  read-mostly operator shell
