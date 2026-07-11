# Gate Review: Sprite-gen Agent Character Stage

recommendation: APPROVE

## blockers

None.

## originalIntent

User wanted the Conitens dashboard office-preview Focused mode to become an agent-character-first stage backed by sprite-gen assets and distinct per-agent motion, while preserving the operator contract from Focused mode: who is active, what is blocked, who owns the next handoff, and what the operator should do next.

## desiredOutcome

- Focused/Agents mode renders the Agent character stage instead of a floor viewport.
- The stage preserves an actionable next-operator CTA, specifically owner approval to `#/approvals` for the demo blocked owner gate.
- Selected character cards expose state to assistive technology.
- Reduced-motion mode disables character-card transition motion.
- Visible copy says "Agent cast", not "Sprite-gen cast" or other implementation/provenance copy.
- Tests, TypeScript, Vite build, and browser QA evidence support the result.

## userOutcomeReview

APPROVE. The previous HIGH blocker is resolved from the user's perspective. `AgentCharacterStage` renders a real anchor for the next action at `packages/dashboard/src/components/AgentCharacterStage.tsx:43`, with `href={model.nextActionHref}` at line 45, `data-next-action-kind={model.nextActionKind}` at line 46, and visible label `{model.nextActionCtaLabel}` at line 49. The model now derives those fields from `deriveFocusedNextAction` at `packages/dashboard/src/agent-character-stage-model.ts:77` and returns them at lines 92-96.

The browser artifact confirms the user-visible result: `output/playwright/agent-character-stage-results.json` reports for `agents-1220`, `agents-1440`, and `agents-reduced-motion`: `nextActionKind: "owner-approval"`, `nextActionHref: "#/approvals"`, and `nextActionText: "Open approvals"`. The `agents-1220.png` screenshot visibly shows the `Next` cell with `Open approvals`.

The previous MEDIUM findings are also resolved enough for this gate:

- Reduced motion: CSS disables `animation` and `transition` for `.agent-character-card` under `prefers-reduced-motion` at `packages/dashboard/src/office-stage.module.css:994-1006`, and neutralizes hover/selected transform at lines 1008-1011. Browser QA records card transitions as `0s` in reduced-motion mode.
- Selected state: character cards now set `aria-pressed={card.selected}` at `packages/dashboard/src/components/AgentCharacterStage.tsx:70`. Browser QA records `cardPressedStates` including `"true"`.
- Test overfit/slop: source-regex tests remain, but the fix is no longer proved only by implementation strings. The model test asserts the owner-approval kind/label/href at `packages/dashboard/tests/agent-character-stage.test.mjs:43-47`, and the CDP browser harness asserts DOM CTA href/text/kind, `aria-pressed`, and reduced-motion transition duration at `.omo/evidence/run-agent-character-stage-qa.mjs:246-272`.

## checkedArtifactPaths

- `.conitens/context/LATEST_CONTEXT.md`
- `.vibe/context/LATEST_CONTEXT.md`
- `.omx/notepad.md`
- `.omo/evidence/sprite-gen-agent-character-stage-code-review.md`
- `.omo/evidence/dashboard-node-tests-final.txt`
- `.omo/evidence/dashboard-tsc-final.txt`
- `.omo/evidence/dashboard-vite-build-final.txt`
- `.omo/evidence/agent-character-stage-browser-qa-final.txt`
- `.omo/evidence/git-diff-check-final.txt`
- `.omo/evidence/agent-character-stage-red.txt`
- `.omo/evidence/run-agent-character-stage-qa.mjs`
- `output/playwright/agent-character-stage-results.json`
- `output/playwright/agent-character-stage/agents-1220.png`
- `output/playwright/agent-character-stage/agents-1440.png`
- `output/playwright/agent-character-stage/agents-reduced-motion.png`
- `output/playwright/agent-character-stage/topology-1220.png`
- `packages/dashboard/src/agent-character-stage-model.ts`
- `packages/dashboard/src/components/AgentCharacterStage.tsx`
- `packages/dashboard/src/components/OfficeStage.tsx`
- `packages/dashboard/src/components/OfficeAvatar.tsx`
- `packages/dashboard/src/office-avatar-sprites.ts`
- `packages/dashboard/src/agent-sprite-manifest.generated.ts`
- `packages/dashboard/src/office-stage.module.css`
- `packages/dashboard/tests/agent-character-stage.test.mjs`
- `packages/dashboard/tests/office-preview-shell.test.mjs`
- `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`
- `packages/dashboard/scripts/generate_agent_sprite_assets.py`
- `packages/dashboard/public/agent-sprites/generated/manifest.json`

## priorReviewCoverage

The previous code review explicitly loaded and reported the required perspectives: `omo:remove-ai-slops` and `omo:programming` are listed at `.omo/evidence/sprite-gen-agent-character-stage-code-review.md:12-18`. It also identified the relevant overfit/slop class, namely implementation-mirroring/source-regex tests, at lines 60-64. I did not treat that report as proof; I repeated the direct pass over the current diff, tests, production code, and QA artifacts.

## directSlopPass

- Oversized TypeScript source: no blocker. Pure LOC counts checked: `agent-character-stage-model.ts` 161, `AgentCharacterStage.tsx` 100, `OfficeAvatar.tsx` 71, `OfficeStage.tsx` 238, `office-avatar-sprites.ts` 141, `agent-sprite-manifest.generated.ts` 33.
- Overfit or tautological tests: no blocker. Some source-contract tests remain, but the user-facing bug classes are covered by model assertions and browser DOM assertions. No deletion-only test is the only proof of the CTA or reduced-motion behavior.
- Production slop: no blocking dead code, speculative layer, broad catch, `any`, `@ts-ignore`, or oversized module found in the reviewed TS/TSX production path.
- Generator/public QA artifacts: not a blocker for this re-review. The generator is 187 pure LOC and the public generated sprite tree is about 363 KB. Prior LOW concerns about Python script strictness and public QA artifacts remain non-blocking because they do not affect the shipped CTA, accessibility, or motion contract.

## verificationEvidence

- RED evidence exists: `.omo/evidence/agent-character-stage-red.txt` shows the initial test failed before the model existed.
- Node tests: `.omo/evidence/dashboard-node-tests-final.txt` reports 149 tests, 149 pass, 0 fail.
- TypeScript: `.omo/evidence/dashboard-tsc-final.txt` reports `tsc -b passed`.
- Build: `.omo/evidence/dashboard-vite-build-final.txt` reports a successful Vite production build.
- Browser QA: `.omo/evidence/agent-character-stage-browser-qa-final.txt` reports PASS, and `output/playwright/agent-character-stage-results.json` reports PASS for Agents 1220, Agents 1440, Agents reduced-motion, and Topology 1220.
- Whitespace check: `.omo/evidence/git-diff-check-final.txt` and my `git diff --check` read show only line-ending warnings, no whitespace errors.

## evidenceGaps

- I did not rerun Vite build or TypeScript because this was a read-only gate re-review and those commands can rewrite build or incremental artifacts. I inspected the recorded logs and cross-checked them against current source and QA JSON instead.
- There is no separate post-fix code-review report artifact beyond this gate review. The previous code review is the pre-fix blocker report; this file is the post-fix re-review artifact.
