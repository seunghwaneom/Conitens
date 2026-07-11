# Dashboard thin-shell workspace controller code review

Review date: 2026-07-10

## Scope

Reviewed only the requested files:

- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/features/workspaces/use-operator-workspace-controller.ts`
- `packages/dashboard/tests/dashboard-thin-shell.test.mjs`
- `.omo/plans/dashboard-thin-shell-workspace-controller.md`

The targeted `git diff` was inspected. Because the hook, test, and plan are untracked, their current file contents were inspected directly with line numbers.

## Skill perspective check

Ran the required skill-perspective check before judging tests and maintainability:

- Loaded `omo:remove-ai-slops` from `C:/Users/eomsh/.codex/plugins/cache/sisyphuslabs/omo/4.16.1/skills/remove-ai-slops/SKILL.md`.
- Loaded `omo:programming` from `C:/Users/eomsh/.codex/plugins/cache/sisyphuslabs/omo/4.16.1/skills/programming/SKILL.md`.
- Loaded the TypeScript reference at `.../skills/programming/references/typescript/README.md`.

Result: the diff violates both perspectives. The new hook exceeds the 250 pure-LOC ceiling, and the added test includes source-inspection/refactor-shape assertions that mirror the implementation rather than exercising observable behavior.

## Verification run

- `pnpm --filter @conitens/dashboard exec node --test tests/dashboard-thin-shell.test.mjs`: PASS, 2/2.
- `pnpm --filter @conitens/dashboard test`: PASS, 152/152.
- `pnpm --filter @conitens/dashboard build`: PASS, `tsc -b && vite build`.
- `git diff --check -- packages/dashboard/src/App.tsx packages/dashboard/src/features/workspaces/use-operator-workspace-controller.ts packages/dashboard/tests/dashboard-thin-shell.test.mjs .omo/plans/dashboard-thin-shell-workspace-controller.md`: PASS with the known `App.tsx` LF/CRLF warning only.
- Pure LOC measured with blank/comment lines excluded:
  - `packages/dashboard/src/features/workspaces/use-operator-workspace-controller.ts`: 323
  - `packages/dashboard/src/App.tsx`: 2434
  - `packages/dashboard/tests/dashboard-thin-shell.test.mjs`: 76

## Findings

### CRITICAL

None.

### HIGH

1. `packages/dashboard/src/features/workspaces/use-operator-workspace-controller.ts:54` - The newly added hook is 323 pure LOC, over the repo programming ceiling of 250 pure LOC. It also owns several responsibilities in one file: workspace list/detail loading effects (`:86`, `:122`, `:149`), draft synchronization (`:176`), route navigation/refresh (`:201`, `:212`), workspace create/update (`:240`, `:262`), and linked-task detach/archive orchestration (`:282`, `:298`). This is a new oversized module, not only inherited `App.tsx` debt, and it recreates the thin-shell problem inside a feature file. Split before approval, for example into resource-loading, draft sync, and mutation/action units with a small composing hook.

2. `packages/dashboard/tests/dashboard-thin-shell.test.mjs:22` - The added test is a source parser that slices function text and checks substring order/occurrence (`:36`-`:71`), plus a refactor-shape assertion that `App.tsx` no longer contains workspace bridge calls (`:73`-`:87`). This is implementation-mirroring coverage. It would not prove that the UI submits through the returned handlers, that the hook calls bridge functions with the current config/route/draft at runtime, or that loading/error states render correctly. It creates false confidence for this refactor and is brittle to harmless formatting, naming, or extraction changes. Replace or supplement it with runtime behavior tests that exercise the hook/App through mocked bridge calls and assert observable bridge calls, state transitions, and rendered prop behavior.

### MEDIUM

1. `packages/dashboard/src/App.tsx:233` - Calling `useOperatorWorkspaceController` before the remaining `App` effects changes effect registration order. The moved workspace loading effects now register before the hash/default-route effect at `App.tsx:323` and before the task list effect at `App.tsx:456`. In `HEAD`, the workspace list effect ran after the task list and task detail/reconcile effects. On task routes, this can change observable bridge GET ordering from task-first to workspace-first. If bridge command ordering is part of the preservation contract, move the composing hook call to the original relative point or split the hook so its effects register where the removed effects used to live, then lock that ordering with a runtime test.

### LOW

1. `packages/dashboard/src/App.tsx:115` - `App.tsx` remains far over the repo's 250 pure-LOC ceiling. I am not treating this as a blocker for this slice because it is pre-existing debt and the current goal is an incremental thin-shell extraction, but the new hook should not add a second oversized surface.

## Notes

- The production workspace code is textually close to the removed `App.tsx` code. Cancellation flags, dependency arrays, mutation sequencing, and loading/error state assignments are mostly preserved.
- The dashboard package tests and build are green, so the blockers are code-quality and maintainability issues, not current compile/test failures.
- Visual evidence files exist under `.omo/evidence/dashboard-thin-shell-visual-qa/`, but no textual visual QA report was found in the targeted evidence search.

## Result

codeQualityStatus: BLOCK

recommendation: REQUEST_CHANGES

blockers:

- Split the new oversized workspace controller module below the 250 pure-LOC ceiling while preserving behavior.
- Replace or supplement the source-inspection thin-shell test with runtime behavior coverage for workspace bridge calls, handler wiring, state transitions, and error/loading semantics.
