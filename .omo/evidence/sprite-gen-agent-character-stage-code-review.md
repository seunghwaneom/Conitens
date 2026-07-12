# Code Review: Sprite-gen Agent Character Stage

## Verdict

- codeQualityStatus: BLOCK
- recommendation: REQUEST_CHANGES
- reviewedAt: 2026-06-27
- scope: `#/office-preview` sprite-gen-backed Agent character stage implementation

## Skill-Perspective Check

- Ran required perspective loading before judging maintainability/test relevance:
  - `omo:remove-ai-slops`
  - `omo:programming` with TypeScript and Python references
  - `code-review`
  - `omo:frontend` design/perfection/redesign references
- remove-ai-slops perspective result: violations found in test shape, but the blocking production issue is user-facing behavior loss rather than cleanup slop.
- programming perspective result: flags brittle implementation-mirroring tests and non-actionable UI regressions; no `any`, `@ts-ignore`, or TypeScript build evidence failure found in reviewed source.

## Evidence Reviewed

- Source/diff: `git status --short`, `git diff --stat`, `git diff --check`, key source files with line numbers.
- Evidence artifacts:
  - `.omo/evidence/dashboard-node-tests-final.txt`
  - `.omo/evidence/dashboard-tsc-final.txt`
  - `.omo/evidence/dashboard-vite-build-final.txt`
  - `.omo/evidence/agent-character-stage-browser-qa-final.txt`
  - `output/playwright/agent-character-stage-results.json`
  - screenshots under `output/playwright/agent-character-stage/`
- Additional read-only check: no-artifact DOM check against the already-running dev server for Classic at `1220x900`. Classic mounted one shell, six room tiles, four sprite avatars, and no horizontal overflow.

## CRITICAL

None.

## HIGH

1. `packages/dashboard/src/components/AgentCharacterStage.tsx:31` drops the actionable next-operator CTA from Focused/Agents mode.

   `OfficeStage` now routes focused mode to `AgentCharacterStage` (`packages/dashboard/src/components/OfficeStage.tsx:163`) instead of `FocusedHandoffView`. The new stage renders `next` as inert definition-list text (`AgentCharacterStage.tsx:31-43`), and the new model only exposes `nextActionLabel` (`packages/dashboard/src/agent-character-stage-model.ts:67-72`). The previous focused workbench contract included a primary anchor using `model.nextActionHref` and `model.nextActionCtaLabel` (`packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx:70-76`), backed by typed destinations (`packages/dashboard/src/spatial-lens/model/focusedNextAction.ts:13-16`).

   Risk: Focused/Agents still tells the operator "Open owner approval" but no longer provides the direct action from the primary surface. That is a user-facing regression in the "what should the operator do next" contract and contradicts the redesign guidance that the primary workbench CTA remains in focus order.

   Required fix: carry the existing next-action kind/CTA/href contract into `AgentCharacterStage` and cover it with behavior-level DOM/browser assertions, not only source regex checks.

## MEDIUM

1. `packages/dashboard/src/office-stage.module.css:675` leaves transform transitions active under reduced motion.

   The card hover/selected state transitions `transform` (`office-stage.module.css:675`) and moves cards upward (`office-stage.module.css:678-682`). The reduced-motion media query disables `animation` only (`office-stage.module.css:978-989`), so reduced-motion users can still get transition-based motion. The browser QA only checked avatar `animationName`, not `transition` or hover/selection movement.

   Suggested fix: in the reduced-motion block, disable or neutralize transform transitions for character cards while preserving visible focus/selected state.

2. `packages/dashboard/src/components/AgentCharacterStage.tsx:49` exposes selected agent state only visually.

   Character cards are selectable buttons (`AgentCharacterStage.tsx:49-63`) but do not expose `aria-pressed`, `aria-current`, or an equivalent selected-state affordance. The class changes visually, but assistive tech will not know which character is selected.

   Suggested fix: add an explicit ARIA selected/current state appropriate to the interaction model and include it in browser/DOM QA.

3. New tests lean heavily on source-regex contracts instead of observable behavior.

   Examples include direct source assertions in `packages/dashboard/tests/agent-character-stage.test.mjs:56-68`, `packages/dashboard/tests/office-preview-shell.test.mjs:28-39`, and `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs:344-380`. These check implementation strings such as component names, data attributes, CSS selectors, and removals. The browser QA is useful, but it also missed the dropped CTA and Classic screenshot coverage.

   Suggested fix: keep only the minimum structural source contracts that match established repo style, and add DOM/browser assertions for the actual user contracts: actionable next CTA, selected-card accessibility, reduced-motion transition behavior, and Classic character occupancy.

## LOW

1. `packages/dashboard/src/components/OfficeStage.tsx:96` and `packages/dashboard/src/components/AgentCharacterStage.tsx:28` surface implementation/provenance language in product UI.

   Visible strings such as "Sprite-gen characters" and "Sprite-gen cast" are useful for developer provenance but read as implementation details inside the operator console. This weakens the operator-first copy direction in `DESIGN.md`.

   Suggested fix: keep sprite-gen provenance in data attributes/manifests/docs, and make visible copy operator-facing.

2. `packages/dashboard/scripts/generate_agent_sprite_assets.py:33` is a useful provenance script but does not follow the strict Python script shape from the programming lens.

   It lacks PEP 723 inline metadata and uses broad `dict` annotations for structured data. This is not runtime-facing, but it makes future regeneration less self-contained and less type-auditable.

   Suggested fix: add script metadata/run instructions and typed return structures if this generator is expected to be maintained.

3. `packages/dashboard/public/agent-sprites/generated` includes QA GIF/contact-sheet artifacts under `public/`.

   The generated tree is about `651K`, so this is not a large immediate performance concern, but Vite will ship the debug/provenance artifacts unless the build excludes them.

   Suggested fix: either accept this explicitly as public provenance or move heavy QA-only artifacts outside runtime public assets while keeping manifest paths auditable.

## Positive Checks

- `AgentCharacterStage` is character-first in the submitted screenshots.
- Agents mode no longer mounts the floor viewport in browser evidence.
- Topology still mounts one floor viewport in submitted evidence.
- Classic mounted successfully in an additional no-artifact DOM check.
- Generated sprite provenance is inspectable through manifests, reports, QA notes, and generated asset paths.
- `dashboard-node-tests-final.txt` reports 149/149 passing.
- `dashboard-vite-build-final.txt` reports a successful production build.
- `git diff --check` passed with only line-ending warnings.

## Blockers

- Restore an actionable next-operator CTA/href in Focused/Agents mode, preserving the prior focused workbench next-action contract.
