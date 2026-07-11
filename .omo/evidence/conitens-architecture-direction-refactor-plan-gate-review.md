# Conitens Architecture Direction Refactor Plan Gate Review

recommendation: PASS

## originalIntent

The user asked to analyze the project conversations/code and produce a plan for Conitens architecture, direction, and refactoring. The expected user-visible outcome is a planning artifact that explains the target direction and gives a safe, actionable refactor sequence without starting unauthorized implementation.

## desiredOutcome

- A single architecture/refactor plan grounded in current Conitens contracts.
- No implementation changes hidden inside the planning pass.
- No contradiction with the active runtime contract: `scripts/ensemble.py` + `.notes/` + `.agent`.
- No violation of event-first state rules: `events/*.jsonl` / `append_event()` remain the durable commit path before projections.
- Forward/SQLite/dashboard work remains gated by explicit promotion criteria.
- Refactoring sequence is test-first, additive Python, approval/verify preserving, and split into reviewable slices.

## userOutcomeReview

The plan document largely satisfies the planning outcome. It explicitly says event ledger remains durable truth while `.notes` and dashboard are projections, Forward SQLite is bounded state/index until promotion, `ensemble.py` is not replaced, and Python is not rewritten into TypeScript. It identifies P0 authority failures around event commit order, bridge mutation boundaries, and split durable ownership, then sequences Wave 0 authority docs, Wave 1 behavior lock, Wave 2 commit-order repair, Wave 3 bridge separation, Wave 4 dashboard shell split, Wave 5 improvement loop, and Wave 6 promotion/isolation decision.

Final re-review found the prior blockers addressed: Wave 0 now uses unused `ADR-0004`; the semantic review artifact covers user-goal traceability plus remove-ai-slops/programming criteria; and the manual QA matrix exists with scenario/adversarial evidence. The dirty worktree remains explicitly scoped, with no clean-diff claim made.

## checkedArtifactPaths

- `docs/conitens-architecture-direction-refactor-plan-2026-07-10.md`
- `AGENTS.md`
- `CONITENS.md`
- `docs/adr-0001-control-plane.md`
- `docs/adr-0002-product-surface-persistent-agents.md`
- `docs/adr-0002-langgraph-blocker.md`
- `docs/adr-0003-langgraph-orchestration-blocker.md`
- `docs/current-architecture-status-ko.md`
- `.conitens/context/LATEST_CONTEXT.md`
- `.vibe/context/LATEST_CONTEXT.md`
- `.conitens/context/task_plan.md`
- `.conitens/context/findings.md`
- `.conitens/context/progress.md`
- `.omx/notepad.md`
- `.omo/evidence/plan-manual-qa/utf8-check.txt`
- `.omo/evidence/plan-manual-qa/structure-fences-mermaid-paths-commands.txt`
- `.omo/evidence/plan-manual-qa/structure-fences-mermaid-paths-commands-corrected.txt`
- `.omo/evidence/plan-manual-qa/manualQa-matrix.json`
- `.omo/evidence/conitens-architecture-direction-refactor-plan-review.md`

## resolvedBlockers

1. ADR numbering collision resolved.
   - Previous issue: Wave 0 planned `ADR-0003`, conflicting with accepted `docs/adr-0003-langgraph-orchestration-blocker.md`.
   - Latest plan evidence: Wave 0 line 422 now plans `ADR-0004: unified authority and forward promotion gate`.
   - `Get-ChildItem docs -Filter 'adr-0004*.md'` found no existing ADR-0004 file.

2. Semantic review artifact supplied.
   - Evidence: `.omo/evidence/conitens-architecture-direction-refactor-plan-review.md`.
   - It includes user-goal traceability, semantic cleanup review, anti-slop/programming coverage, three runtime audit hypotheses, and dirty-worktree attribution limits.

3. Manual QA matrix supplied.
   - Evidence: `.omo/evidence/plan-manual-qa/manualQa-matrix.json`.
   - It references UTF-8, structure, fence, Mermaid, path, command/test, recommendation-discoverability, and adversarial static checks.

4. Dirty/untracked workspace attribution handled.
   - The review artifact explicitly scopes attribution and makes no clean-diff claim.

## planContentReview

PASS: Repo authority alignment.
- Plan lines 31-36 preserve event ledger authority, `.notes`/dashboard projection status, Forward SQLite bounded status, existing CLI/file facade preservation, and no Python-to-TypeScript rewrite.
- This aligns with `AGENTS.md` lines 11-21, `CONITENS.md` event/source-of-truth language, ADR-0001 lines 9-25, and ADR-0002 lines 20-44/73.

PASS: P0 diagnosis is relevant and evidence-backed.
- Plan lines 138-160 identify event commit-point violations, Forward Bridge read-only-vs-mutation mismatch, and unclear event/SQLite ownership.
- These match the governing risks in `AGENTS.md` and `docs/current-architecture-status-ko.md`.

PASS: Actionable sequencing.
- Wave 0 lines 395-413 freezes authority and inventories direct writes before implementation.
- Wave 1 lines 415-436 locks behavior with targeted tests before refactor.
- Wave 2 lines 438-459 repairs commit order and preserves approval/verify gates.
- Wave 3 lines 461-487 splits bridge transport/query/command/storage with facade compatibility.
- Wave 4 lines 489-531 splits dashboard only after parser/mutation characterization.
- PR sequence lines 592-612 keeps slices small and reviewable.

PASS: Approval/verify and promotion gates are preserved.
- Plan lines 341-353 require event-first/outbox, agreed ownership, replay/restore equivalence, approval/verify parity, migration/rollback docs, security regression, and ADR replacement before Forward promotion.
- Plan lines 543-550 keep self-improvement apply behind owner approval.

PASS: remove-ai-slops/programming direct pass over the plan.
- No unauthorized implementation.
- No new dependencies proposed.
- No speculative TypeScript control-plane rewrite.
- No `packages/command-center` cleanup drift before promotion ADR.
- Test plan is mostly behavior/contract-oriented, not deletion-only or tautological.
- Plan prefers deletion/reuse/small leaf modules over broad abstraction and names concrete facades/modules.

PASS: ADR numbering collision resolved.
- Latest plan uses `ADR-0004: unified authority and forward promotion gate`.
- Existing accepted ADR-0003 remains untouched.

RESIDUAL RISK: The plan names future modules before a full direct-write inventory exists.
- This is mitigated by Wave 0 requiring a machine-readable direct-write inventory before mutation PRs.

## residualNotes

- No tracked Git diff can be claimed for the plan because the file remains untracked in a dirty workspace; this is explicitly scoped and is not blocking for direct artifact review.
- Static artifact `.omo/evidence/plan-manual-qa/structure-fences-mermaid-paths-commands.txt` has a false failure against dotted unittest module names; the corrected artifact resolves it, but both should be retained as evidence of correction rather than treated as a clean single-pass QA record.

## finalVerdict

PASS. The updated plan and evidence package now support approval for the planning artifact. No remaining blocking issue found.
