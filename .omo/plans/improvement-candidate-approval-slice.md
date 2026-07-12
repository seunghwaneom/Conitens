# Cleanup/implementation plan — Improvement candidate approval slice

Date: 2026-07-10
Status: complete and verified

## Behavior-first sequence

1. PIN episode closure, legacy patch, approval, and protocol behavior.
2. Add focused failing tests for event-sourced candidate creation, privacy,
   versioning, risk, review decisions, and CLI compatibility.
3. Add one leaf candidate model/privacy module and one event-replay service.
4. Add the canonical event type at the TypeScript source and regenerate the
   Python allow-list.
5. Extend only the existing `improvement` CLI facade.
6. Run targeted, regression, protocol, compile, real-CLI, security, and review
   gates; fix every finding before context updates.

## Final verification

- Candidate suite: 27/27 passed.
- Candidate compatibility suite: 55/55 passed.
- Meeting/spawn authority plus candidate integration: 58/58 passed.
- Protocol candidate test and TypeScript build passed.
- Full protocol baseline remained unchanged at 847 passed and four known
  unrelated failures.
- Isolated CLI help/create/list/show/approve and invalid-input scenarios passed;
  only `.notes/events/events.jsonl` changed after candidate actions, with no
  `.agent` or SQLite mutation.
- Post-write structure gate reported zero dependency cycles.
- Independent final code review returned APPROVE and scoped security review
  returned unconditional PASS.

## Preserve

- `scripts/ensemble.py` remains the public compatibility facade.
- Episode closure event/artifact formats remain readable unchanged.
- Legacy improver and agent patch paths remain separate and unchanged.
- Event ledger is the only new candidate/decision authority.

## Exclude

- No LoopStateRepository schema change in this slice.
- No generic approval queue/adapter rewrite.
- No `.agent`, Forward, dashboard, or runtime-default change.
- No direct `.notes` projection write.
