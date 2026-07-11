# Agent skill revision review-work closure

Date: 2026-07-10
Scope: bounded event-sourced `.agent/skills/*.yaml` revision proposal, apply,
rollback, rebuild, CLI, owner compatibility, and protocol registration.

## Review results

- Code review: APPROVE, zero findings after 46 focused tests, Python AST/compile,
  TypeScript compile, and focused protocol test.
- State-machine audit: APPROVE. Proposal, exact request/grant, terminal apply,
  active-stack rollback, retries, and malformed/duplicate/out-of-order replay are
  closed by code and tests.
- Architecture/scope review: APPROVE / CLEAR. The implementation is an additive
  leaf under the existing `improvement` facade and does not promote Forward,
  dashboard, SQLite, `.conitens`, or `.agents/skills`.
- Completion verification: PASS. Documentation freshness was the only reported
  gap and is closed in the same change set.
- Security review: initial REQUEST CHANGES for ownerless rebuild. A dedicated
  failing test reproduced the issue; `rebuild_agent_skill_revisions()` now calls
  `require_project_owner()` before replay/materialization. Security rereview:
  APPROVE.

## Simplifications and boundaries

- Reused candidate replay, existing registry fields, simple YAML parser,
  `append_event()`, and the legacy owner matcher.
- Extracted owner matching to one leaf module while retaining `ensemble.py`
  compatibility wrappers.
- Added no dependency, generic config framework, database table, Forward route,
  dashboard component, or runtime promotion.
- Kept one leaf revision service until its replay/materialization invariants were
  proven. A split into reducer/materializer modules is deferred until more target
  families or materially richer revision behavior justify it.

## Residual risks

- Low: the preserved legacy owner contract accepts git-email fallback.
- Low: the cross-process lock uses the system temp directory; deliberately
  divergent `TMP/TEMP` environments could avoid shared serialization, although
  stale hashes and replay validation limit the outcome.
- Global debt: `append_event()` crash durability/fsync is outside this slice.
- Maintainability: `ensemble_agent_revisions.py` concentrates validation, replay,
  authorization, and materialization. Accept now; split only with growth.
- Full protocol remains at its exact known baseline of 847 passes and 4 unrelated
  failures. The worktree is broadly dirty, so review and diff evidence is scoped.

Verdict: ACCEPT.
