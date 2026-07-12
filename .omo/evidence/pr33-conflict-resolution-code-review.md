# PR #33 stale-workspace-draft focused code review

Date: 2026-07-12

## Scope

Focused re-review of the product-code fix for the workspace route-change stale-draft race. The final two-parent merge/history work is explicitly excluded and remains pending after the evidence commit.

## Verdict

- `codeQualityStatus`: CLEAR
- `recommendation`: APPROVE
- Product-code verdict: PASS
- Blockers: none within the reviewed scope

## Findings by severity

### CRITICAL

None.

### HIGH

None.

### MEDIUM

None.

### LOW

None required before approval. The stale-detail regression test exercises the command-service submission boundary; the other commands share the same small identity guard and are also hidden by controller/screen readiness checks.

## Review basis

- `use-operator-workspace-resources.ts` clears the prior detail and linked-task projection before loading a new workspace ID.
- `use-operator-workspace-controller.ts` derives readiness from exact route/detail identity, clears the draft while identity is unresolved, and sends the loaded ID into every mutating command.
- `operator-workspace-command-service.ts` independently fails closed when route and loaded-detail identities differ, preventing stale submit, status, detach, and archive bridge calls.
- `OperatorWorkbenchScreen.tsx` hides editor and action callbacks until the matching detail is ready.
- The new regression test is behavioral: it proves a route for workspace 2 cannot submit workspace 1's loaded draft and that no gateway or refresh call occurs.
- Independent verification: `pnpm.cmd --filter @conitens/dashboard test` passed 155/155; `git diff --check` reported no whitespace errors (only Windows line-ending notices).
- The submitted rerun text still reports 154 tests and therefore is stale; the independent 155-test run is the evidence used for this verdict. The production-build claim was inspected in the debugging audit but was not rerun during this read-only review.

## Skill-perspective check

The `omo:programming` and `omo:remove-ai-slops` perspectives were loaded and applied. The fix introduces no untyped escape hatch, needless abstraction, production parsing/normalization, or implementation-mirroring/deletion-only/tautological test. The added identity guard is boundary-required validation, and the regression test checks observable command behavior rather than mirroring constants. No violation of either skill perspective was found.
