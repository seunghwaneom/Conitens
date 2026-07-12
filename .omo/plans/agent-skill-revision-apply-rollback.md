# Cleanup/implementation plan — Agent skill revision apply/rollback

Date: 2026-07-10
Status: complete

## Behavior-first sequence

1. PIN candidate/legacy patch/approval behavior, current owner matching, skill
   registry validation, and protocol baseline.
2. Add failure-first `tests/test_agent_revision_application.py` for exact revision
   content, owner authorization, event ordering, stale writes, recovery, rollback,
   rebuild, concurrency, privacy, and CLI behavior.
3. Extract the existing read-only owner match into a leaf module and keep the
   monolithic `ensemble.py` functions as behavior-compatible wrappers.
4. Add one leaf agent-skill revision module that reuses candidate replay,
   `parse_simple_yaml()`, registry field definitions, and event helpers. Do not
   add a generic configuration framework.
5. Add only three canonical revision event types and regenerate the Python
   allow-list from the TypeScript dictionary.
6. Extend only the existing `improvement` CLI facade with proposal, show, apply,
   rollback, and rebuild actions.
7. Run PIN/RED/GREEN/REFACTOR/VERIFY. Fix every independent review finding before
   updating context or marking the slice complete.

## Simplification rules

- Delete duplicate owner-matching logic from `ensemble.py` only after wrapper PIN
  tests exist; do not alter owner initialization/write behavior.
- Reuse the existing candidate public validators, registry schema, simple YAML
  parser, canonical event append/load functions, and protocol generator.
- Prefer fixed schema functions and one deterministic serializer over a new
  abstraction hierarchy.
- Keep public reads metadata-only; avoid building a second redaction system.
- Add no dependency, database table, Forward bridge, dashboard route, or generic
  command-center refactor.

## Planned changed files

- new `scripts/ensemble_owner_auth.py`
- new `scripts/ensemble_agent_revisions.py`
- new `tests/test_agent_revision_application.py`
- focused compatibility edits in `scripts/ensemble.py`
- event dictionary/test edits in `packages/protocol/src/event.ts` and
  `packages/protocol/tests/improvement-event.test.ts`
- regenerated `scripts/ensemble_allowed_events.py`
- evidence, Ralph status, ultrawork notepad, and Conitens context updates after
  verification

## Preserve

- `scripts/ensemble.py` remains the compatibility facade and legacy runtime
  remains default.
- `events/*.jsonl` remains the only commit point.
- `.agent` remains canonical configuration; `.agents/skills` remains a separate
  compatibility surface.
- Current candidate, closure, approval, owner initialization, registry, Forward,
  and dashboard outputs remain compatible.

## Exclude

- No skill create/delete, multi-family config apply, persona-core change, runtime
  reload, automatic deployment, effect measurement, or compatibility generation.
- No global event-writer concurrency or generic approval-adapter rewrite.
- No exact restoration of YAML comments/formatting after canonical apply/rollback.

## Completion evidence required

- Failure-first evidence showing each missing contract before production edits.
- Focused and compatibility tests, compile/protocol verification, real CLI and
  filesystem inventory evidence.
- Runtime recovery/concurrency probes and scoped security review.
- Independent code/test/compatibility approval, zero-cycle post-write structure
  gate, and updated `.conitens`/`.vibe` context.

## Completion result

- All planned files and event contracts landed without new dependencies.
- Focused 46/46 and compatibility 104/104 Python tests passed.
- Protocol focused test/build, event sync, registry validation, compile, scoped
  diff check, manual CLI QA, three-hypothesis debugging audit, and zero-cycle
  post-write structure gate passed.
- Independent code, state-machine, architecture, completion, and security
  reviews approved the final slice.
- Evidence: `.omo/evidence/agent-skill-revision-green.txt`,
  `.omo/evidence/agent-skill-revision-manual-qa.md`,
  `.omo/evidence/agent-skill-revision-debugging-audit.md`, and
  `.omo/evidence/agent-skill-revision-review-work.md`.
