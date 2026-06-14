# Frontend Design And Architecture Improvement Plan

## TL;DR
> Summary:      Improve the Conitens `#/office-preview` Spatial Lens without rewriting it: keep Focused as the operator handoff workbench, keep Floor Overview as the full topology map, remove or de-contract dormant Focused map artifacts after proof, and strengthen real browser QA around placement.
> Deliverables:
> - Focused workbench hierarchy, copy, CTA, and layout tightened around the active blocker and next operator action.
> - Overview guardrails preserved so topology signals stay readable and declutter does not regress.
> - Dormant Focused floor-map artifacts removed from active contracts when static and browser proof show they are unmounted.
> - Agent-executed static, build, and browser evidence for Focused, Overview, Classic regression, and 1220px nav.
> Effort:       Large
> Risk:         Medium - dirty worktree, dormant artifacts still referenced by tests, and browser placement requires real-surface proof.

## Scope
### Must have
- Target `packages/dashboard` and the `#/office-preview` Spatial Lens route first.
- Preserve the AGENTS.md UI contract: Focused answers active/blocker/owner/next action quickly; Overview owns the full spatial map; Classic is a regression surface only for this pass.
- Re-read current dirty files before editing them, especially:
  - `packages/dashboard/src/components/PixelOffice.tsx`
  - `packages/dashboard/src/components/OfficeStage.tsx`
  - `packages/dashboard/src/components/OfficeSidebar.tsx`
  - `packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx`
  - `packages/dashboard/src/spatial-lens/model/focusedHandoffModel.ts`
  - `packages/dashboard/src/spatial-lens/components/FloorViewport.tsx`
  - `packages/dashboard/src/spatial-lens/viewport/viewportCamera.ts`
  - `packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css`
  - `packages/dashboard/tests/office-preview-shell.test.mjs`
  - `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`
  - `packages/dashboard/tests/spatial-lens-room-dressing.test.mjs`
- Use the existing model/component boundaries:
  - `PixelOffice` owns office shell state, mode persistence, and summary shell.
  - `OfficeStage` owns Focused / Floor Overview / Classic dispatch.
  - `focusedHandoffModel.ts` owns Focused semantic derivation.
  - `FocusedHandoffView` renders the active handoff workbench.
  - `FloorViewport` owns Overview topology map rendering.
- Consolidate duplicated Focused summary/next-action derivation so the shell and workbench cannot disagree.
- Make the Focused CTA model-driven:
  - `owner-approval`: label `Open approvals`, href `#/approvals`
  - `sentinel-review`: label `Open review queue`, href `#/tasks`
  - `monitor`: label `Monitor handoff`, href `#/office-preview`
- Keep blocked task as the visual peak while treating the approval gate as held/waiting rather than a second failure.
- Keep muted spatial context art subdued while preserving readable text; do not dim critical copy through broad parent opacity.
- Compress or collapse the Focused sidebar rail so it is tertiary and cannot compete with the workbench.
- Preserve Overview signal layers: route/packet, blocked marker, agents, room plaques, door frames.
- Preserve Overview declutter: `.room-dressing-layer`, `.workstation-layer`, and `.wall-detail-layer` remain hidden under `[data-viewport-mode="overview"]`.
- Clean dormant Focused map artifacts by deleting from active contracts after proof, not by creating an archive directory unless a local repo convention is found.
- Replace tests that preserve dormant Focused map artifacts with tests that guard against remounting or re-exporting them.
- Add browser QA with binary pass/fail observables and screenshot/JSON evidence.

### Must NOT have
- No backend, bridge, runtime, provider, approval, scheduler, or mutation-surface changes.
- No direct `.notes/` writes.
- No new dependencies.
- No broad repo formatting.
- No persona or identity-core edits.
- No Classic redesign in this pass. Classic is only verified to avoid mounting Spatial Lens floor/workbench surfaces unless a new explicit failure is found.
- No decorative room clutter reintroduced to Overview.
- No implementation that bypasses existing approval or verify gates.
- No deleting, weakening, skipping, or suppressing failing tests.
- No overwriting unrelated dirty worktree changes.
- No unnecessary changes to existing demo/fixture data shape; if a data-shape
  change is unavoidable, record the exact rationale and regression proof before
  touching UI implementation.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: Characterization/TDD for model, component, ARIA, and dormant-contract changes; browser failing-first evidence for placement and computed styles; full tests/build after implementation.
- QA policy: every todo has agent-executed scenarios.
- Evidence: `.omo/evidence/task-<N>-frontend-design-architecture-improvement.<ext>` plus browser screenshots/JSON under `output/playwright/frontend-design-architecture-improvement-*`.

Baseline commands:

```bash
pnpm --filter @conitens/dashboard test
pnpm --filter @conitens/dashboard build
```

Browser server:

```bash
DASHBOARD_PORT=3000
while netstat -ano | grep -q ":${DASHBOARD_PORT} "; do DASHBOARD_PORT=$((DASHBOARD_PORT + 1)); done
BASE_URL="http://127.0.0.1:${DASHBOARD_PORT}/#/office-preview"
pnpm --filter @conitens/dashboard dev -- --host 127.0.0.1 --port "$DASHBOARD_PORT"
```

If port `3000` is occupied, use the next free port. T1 must record `DASHBOARD_PORT`
and `BASE_URL`; every browser snippet, script invocation, and evidence JSON must
consume that selected `BASE_URL` rather than hard-coding `3000`.

Browser state setup for every scenario:

```js
await page.goto(BASE_URL);
await page.evaluate(() => {
  window.sessionStorage.setItem("conitens.officeStageMode", "focused");
});
await page.reload();
await page.getByRole("button", { name: "Focused" }).click();
```

## Execution strategy
### Parallel execution waves
> Gate and final verification waves are intentionally single-task. The
> implementation wave maximizes parallelism only across real dependency edges.

Wave 1 (gate, no deps):
- T1. Rebaseline dirty worktree and lock failing-first evidence plan.

Wave 2a (after T1, parallel-safe with disjoint ownership):
- T2. Make Focused CTA and summary derivation model-owned.
- T4. Convert stage mode switch to tab semantics.
- T5. Remove or de-contract dormant Focused map artifacts after proof.
- T6. Preserve Overview topology and declutter guardrails.

Wave 2b (after T2, parallel-safe with any unfinished T4-T6 work):
- T3. Tighten Focused visual hierarchy and rail placement.

Wave 2c (after T2-T6):
- T7. Add real-route browser QA harness and evidence capture.

Wave 3 (final, after T2-T7):
- T8. Run full verification and reconcile Conitens context.

Critical path: T1 -> T2 -> T3/T7 -> T8.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1 | None | T2, T3, T4, T5, T6, T7, T8 | None |
| T2 | T1 | T3, T7, T8 | T4, T5, T6 |
| T3 | T1, T2 | T7, T8 | T4, T5, T6 |
| T4 | T1 | T7, T8 | T2, T5, T6; T3 after T2 |
| T5 | T1 | T7, T8 | T2, T3, T4, T6 |
| T6 | T1 | T7, T8 | T2, T3, T4, T5 |
| T7 | T1, T2, T3, T4, T5, T6 | T8 | None |
| T8 | T1-T7 | Final handoff | None |

## Todos
> Implementation + Test = ONE todo. Never separate.

- [ ] T1. Rebaseline dirty worktree and capture RED evidence plan
  What to do / Must NOT do:
  - Re-run `git status --short` and record dirty/untracked files before edits.
  - Re-read every file to be edited immediately before changing it.
  - Confirm `.omo/drafts/frontend-design-architecture-improvement.md` is the approved planning source.
  - Create `.omo/evidence/task-1-frontend-design-architecture-improvement.md` containing:
    - dirty worktree list,
    - selected dev server port,
    - selected `BASE_URL`,
    - planned browser script path,
    - initial failing-first checks to add before implementation for T2, T4, T5, and T7,
    - demo/fixture data files that must remain shape-compatible unless T8 records a justified exception.
  - Must NOT revert, overwrite, or normalize unrelated dirty files.
  Parallelization: Can parallel N | Wave 1 | Blocks all implementation todos
  References:
  - `AGENTS.md`
  - `.conitens/context/LATEST_CONTEXT.md`
  - `.vibe/context/LATEST_CONTEXT.md`
  - `.omo/drafts/frontend-design-architecture-improvement.md`
  Acceptance criteria (agent-executable):
  ```bash
  test -f .omo/evidence/task-1-frontend-design-architecture-improvement.md
  grep -q "dirty_worktree" .omo/evidence/task-1-frontend-design-architecture-improvement.md
  grep -q "BASE_URL" .omo/evidence/task-1-frontend-design-architecture-improvement.md
  grep -q "failing_first" .omo/evidence/task-1-frontend-design-architecture-improvement.md
  grep -q "demo_fixture_shape" .omo/evidence/task-1-frontend-design-architecture-improvement.md
  ```
  QA scenarios:
  - Tool: shell.
  - Invocation: `git status --short > .omo/evidence/task-1-git-status.txt`
  - PASS observable: evidence file names dirty/untracked files and explicitly says executor must not revert unrelated changes.
  Commit: Y | `chore(spatial-lens): record approved worktree baseline` | Files: `.omo/evidence/task-1-*`

- [ ] T2. Make Focused next action and shell summary model-owned
  What to do / Must NOT do:
  - Add characterization tests first for `createFocusedHandoffWorkbenchModel` covering `owner-approval`, `sentinel-review`, and `monitor`.
  - Extend the Focused model with CTA data rather than deriving CTA text/href in the component:
    - `owner-approval` -> `Open approvals`, `#/approvals`
    - `sentinel-review` -> `Open review queue`, `#/tasks`
    - `monitor` -> `Monitor handoff`, `#/office-preview`
  - Move Focused shell reason/summary derivation out of ad hoc `PixelOffice` task lookup and into the same model source or a small model-owned helper.
  - Keep no-blocker fallback behavior: no invented blocked owner gate, `CLEAR` step remains clear, `No blocked owner gate` remains available.
  - Must NOT duplicate blocker/next-action derivation in both `PixelOffice` and `focusedHandoffModel`.
  Parallelization: Can parallel Y | Wave 2 | Blocks T3, T7, T8
  References:
  - `packages/dashboard/src/components/PixelOffice.tsx`
  - `packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx`
  - `packages/dashboard/src/spatial-lens/model/focusedHandoffModel.ts`
  - `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`
  Acceptance criteria (agent-executable):
  ```bash
  node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs
  grep -q "nextActionHref" packages/dashboard/src/spatial-lens/model/focusedHandoffModel.ts
  grep -q "nextActionKind" packages/dashboard/src/spatial-lens/model/focusedHandoffModel.ts
  grep -q "href={model.nextActionHref}" packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx
  grep -q "data-next-action-kind={model.nextActionKind}" packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx
  ! grep -q 'href="#/approvals"' packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx
  ```
  QA scenarios:
  - RED command:
    ```bash
    node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs > .omo/evidence/task-2-red.txt 2>&1
    test $? -ne 0
    grep -E "nextActionHref|Open review queue|Monitor handoff" .omo/evidence/task-2-red.txt
    ```
  - RED PASS observable: command exits non-zero before production code because the model does not expose the expected CTA contract.
  - GREEN command:
    ```bash
    node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs > .omo/evidence/task-2-green.txt 2>&1
    test $? -eq 0
    grep -Eq "(^ok [0-9]+|#[[:space:]]*pass[[:space:]]+[0-9]+|Tests[[:space:]]+[0-9]+[[:space:]]+passed)" .omo/evidence/task-2-green.txt
    ```
  - GREEN PASS observable: targeted test exits `0`, `FocusedHandoffView.tsx` links through `model.nextActionHref`, and no hardcoded `href="#/approvals"` CTA remains.
  Commit: Y | `fix(spatial-lens): derive focused next action from model` | Files: `PixelOffice.tsx`, `FocusedHandoffView.tsx`, `focusedHandoffModel.ts`, `spatial-lens-pixel-grammar.test.mjs`

- [ ] T3. Tighten Focused hierarchy, copy density, and tertiary rail placement
  What to do / Must NOT do:
  - Preserve Focused hierarchy: compact posture metrics -> active handoff chain -> muted spatial context.
  - Reduce duplicate focus/state copy across shell summary, stage header, posture strip, workbench, and sidebar.
  - Keep the blocked task as the visual peak.
  - Style the approval gate as held/waiting rather than a second red failure when it is not the actual blocked task.
  - Keep spatial context art muted, but avoid applying broad opacity to actionable text.
  - Allow focused context copy to wrap to two lines where needed rather than truncating critical labels.
  - Compress or collapse the Focused rail into tertiary summaries; it must not read as a competing primary panel.
  - Must NOT put critical task cards on noisy pixel art.
  Parallelization: Can parallel Y | Wave 2 | Blocks T7, T8
  References:
  - `AGENTS.md` Spatial Lens rules
  - `packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx`
  - `packages/dashboard/src/components/OfficeSidebar.tsx`
  - `packages/dashboard/src/office-sidebar.module.css`
  - `packages/dashboard/src/office.module.css`
  - `packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css`
  - `packages/dashboard/tests/office-preview-shell.test.mjs`
  - `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`
  Acceptance criteria (agent-executable):
  ```bash
  node --experimental-strip-types --test packages/dashboard/tests/office-preview-shell.test.mjs packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs
  grep -q "data-focused-spatial-context=\"muted\"" packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx
  grep -q "data-office-sidebar-mode={mode}" packages/dashboard/src/components/OfficeSidebar.tsx
  ```
  QA scenarios:
  - Browser action:
    ```js
    await page.setViewportSize({ width: 1220, height: 900 });
    await page.goto(BASE_URL);
    await page.getByRole("tab", { name: "Focused" }).click().catch(async () => {
      await page.getByRole("button", { name: "Focused" }).click();
    });
    ```
  - PASS observable:
    ```js
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const workbench = await page.locator('[data-active-handoff-workbench="true"]').boundingBox();
    const context = await page.locator('[data-focused-spatial-context="muted"]').boundingBox();
    expect(overflow).toBe(0);
    expect(workbench.y).toBeLessThan(260);
    expect(context.y + context.height).toBeLessThanOrEqual(900);
    ```
  - Evidence: `output/playwright/frontend-design-architecture-improvement-focused-fit-1220.png`, `.json`.
  Commit: Y | `fix(spatial-lens): clarify focused workbench hierarchy` | Files: Focused view, sidebar, office/spatial CSS, shell tests

- [ ] T4. Convert stage mode switch to tab semantics
  What to do / Must NOT do:
  - Replace pressed-button mode switch semantics with `tablist`, `tab`, and `tabpanel` semantics.
  - Add stable `id` / `aria-controls` / `aria-labelledby` links for Focused, Floor Overview, and Classic panels.
  - Use `aria-selected`, not only `aria-pressed`.
  - Support Left/Right arrow keyboard movement across tabs.
  - Preserve existing visual labels: `Focused`, `Floor Overview`, `Classic`.
  - Preserve session persistence with `conitens.officeStageMode`.
  - Must NOT change route or stage mode names.
  Parallelization: Can parallel Y | Wave 2 | Blocks T7, T8
  References:
  - `packages/dashboard/src/components/OfficeStage.tsx`
  - `packages/dashboard/src/office-stage.module.css`
  - `packages/dashboard/tests/office-preview-shell.test.mjs`
  Acceptance criteria (agent-executable):
  ```bash
  node --experimental-strip-types --test packages/dashboard/tests/office-preview-shell.test.mjs
  grep -q "role=\"tablist\"" packages/dashboard/src/components/OfficeStage.tsx
  grep -q "role=\"tab\"" packages/dashboard/src/components/OfficeStage.tsx
  grep -q "aria-selected" packages/dashboard/src/components/OfficeStage.tsx
  grep -q "aria-controls" packages/dashboard/src/components/OfficeStage.tsx
  grep -q "aria-labelledby" packages/dashboard/src/components/OfficeStage.tsx
  grep -Eq 'id=\{?["`].*(focused|overview|classic).*tab' packages/dashboard/src/components/OfficeStage.tsx
  grep -Eq 'id=\{?["`].*(focused|overview|classic).*panel' packages/dashboard/src/components/OfficeStage.tsx
  grep -q "role=\"tabpanel\"" packages/dashboard/src/components/OfficeStage.tsx
  ```
  QA scenarios:
  - RED command:
    ```bash
    node --experimental-strip-types --test packages/dashboard/tests/office-preview-shell.test.mjs > .omo/evidence/task-4-red.txt 2>&1
    test $? -ne 0
    grep -E "tablist|tabpanel|aria-selected|aria-controls|aria-labelledby|ArrowRight|ArrowLeft" .omo/evidence/task-4-red.txt
    ```
  - RED PASS observable: command exits non-zero before implementation because `OfficeStage.tsx` still uses pressed-button mode semantics.
  - GREEN browser:
    ```js
    await page.goto(BASE_URL);
    await page.getByRole("tab", { name: "Focused" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Floor Overview" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Focused" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Focused" })).toBeVisible();
    const tabPanelLinks = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].map((tab) => {
        const panelId = tab.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;
        return {
          tabId: tab.id,
          panelId,
          panelExists: Boolean(panel),
          linkedBack: panel?.getAttribute("aria-labelledby") === tab.id,
        };
      }),
    );
    expect(tabPanelLinks.every((link) => link.tabId && link.panelExists && link.linkedBack)).toBe(true);
    ```
  - Evidence: `output/playwright/frontend-design-architecture-improvement-tabs.json`.
  Commit: Y | `fix(spatial-lens): expose stage modes as tabs` | Files: `OfficeStage.tsx`, `office-stage.module.css`, `office-preview-shell.test.mjs`

- [ ] T5. Remove dormant Focused map artifacts from active contracts after proof
  What to do / Must NOT do:
  - Start with a deletion/update manifest in `.omo/evidence/task-5-dormant-focused-map-manifest.md`.
  - Use static proof before deletion:
    ```bash
    grep -RIn "FocusedRouteTargetEdge\\|FocusedCorridorContinuityLayer\\|MinimapDock\\|AgentOffscreenRail\\|viewMode=\\\"focused\\\"\\|data-operator-focus-map" packages/dashboard/src packages/dashboard/tests
    ```
  - Remove or de-contract dormant Focused map artifacts only when no active import/render path remains.
  - Include these surfaces in the manifest:
    - `packages/dashboard/src/spatial-lens/components/FocusedRouteTargetEdge.tsx`
    - `packages/dashboard/src/spatial-lens/components/FocusedCorridorContinuityLayer.tsx`
    - `packages/dashboard/src/spatial-lens/components/MinimapDock.tsx`
    - `packages/dashboard/src/spatial-lens/viewport/AgentLayer.tsx` exported `AgentOffscreenRail`
    - `packages/dashboard/src/spatial-lens/components/FloorViewport.tsx` focused-mode branches
    - `packages/dashboard/src/spatial-lens/viewport/viewportCamera.ts` focused mode type/zoom branches, if no longer used
    - focused-map CSS selectors in `spatial-lens.module.css`
    - exports in `spatial-lens/index.ts`
    - tests in `spatial-lens-pixel-grammar.test.mjs` and `spatial-lens-room-dressing.test.mjs`
  - Replace tests that assert dormant components exist with tests proving Focused cannot mount map/minimap/target/corridor artifacts.
  - Must NOT create an archive directory unless an existing repo convention is found.
  - Must NOT remove Overview topology or generated assets used by Focused context thumbnails.
  Parallelization: Can parallel Y | Wave 2 | Blocks T7, T8
  References:
  - `packages/dashboard/src/spatial-lens/components/FloorViewport.tsx`
  - `packages/dashboard/src/spatial-lens/viewport/viewportCamera.ts`
  - `packages/dashboard/src/spatial-lens/components/FocusedRouteTargetEdge.tsx`
  - `packages/dashboard/src/spatial-lens/components/FocusedCorridorContinuityLayer.tsx`
  - `packages/dashboard/src/spatial-lens/components/MinimapDock.tsx`
  - `packages/dashboard/src/spatial-lens/viewport/AgentLayer.tsx`
  - `packages/dashboard/src/spatial-lens/index.ts`
  - `packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css`
  - `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`
  - `packages/dashboard/tests/spatial-lens-room-dressing.test.mjs`
  Acceptance criteria (agent-executable):
  ```bash
  node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs packages/dashboard/tests/spatial-lens-room-dressing.test.mjs
  ! grep -RIn "viewMode=\\\"focused\\\"" packages/dashboard/src
  ! grep -RIn "data-operator-focus-map" packages/dashboard/src
  ! grep -RIn "FocusedRouteTargetEdge\\|FocusedCorridorContinuityLayer" packages/dashboard/src/spatial-lens/index.ts packages/dashboard/src/spatial-lens/components
  grep -RIn "data-operator-focus-map\|FocusedRouteTargetEdge\|FocusedCorridorContinuityLayer" packages/dashboard/tests
  ```
  QA scenarios:
  - Browser Focused proof:
    ```js
    await page.goto(BASE_URL);
    await page.getByRole("tab", { name: "Focused" }).click().catch(async () => {
      await page.getByRole("button", { name: "Focused" }).click();
    });
    await expect(page.locator('[data-spatial-lens-floor="static"]')).toHaveCount(0);
    await expect(page.locator('[data-operator-focus-map="true"]')).toHaveCount(0);
    await expect(page.locator('[data-focused-route-target-edge="true"]')).toHaveCount(0);
    await expect(page.locator('[data-focused-corridor-continuity-layer="true"]')).toHaveCount(0);
    ```
  - Evidence: `.omo/evidence/task-5-dormant-focused-map-manifest.md`, `output/playwright/frontend-design-architecture-improvement-focused-no-map.json`.
  Commit: Y | `refactor(spatial-lens): remove dormant focused map contracts` | Files: Spatial Lens components, exports, CSS, tests

- [ ] T6. Preserve Overview topology and declutter guardrails
  What to do / Must NOT do:
  - Keep Floor Overview map-primary and rail-secondary.
  - Preserve `FloorViewport viewMode="overview"` from `OfficeStage`.
  - Preserve `data-spatial-lens-floor="static"` and `data-overview-role="topology"` in Overview.
  - Preserve signal layers: handoff route/packet, blocked marker, agents, plaques, door frames.
  - Preserve CSS hiding of `.room-dressing-layer`, `.workstation-layer`, and `.wall-detail-layer` under `[data-viewport-mode="overview"]`.
  - If adding any Overview chrome, limit it to a compact signal legend/filter row and keep it out of this pass unless needed by failing QA.
  - Must NOT reintroduce in-room task cards or decorative dressing at 1x Overview.
  Parallelization: Can parallel Y | Wave 2 | Blocks T7, T8
  References:
  - `packages/dashboard/src/components/OfficeStage.tsx`
  - `packages/dashboard/src/spatial-lens/components/FloorViewport.tsx`
  - `packages/dashboard/src/spatial-lens/components/HandoffOverlay.tsx`
  - `packages/dashboard/src/spatial-lens/components/RoomZone.tsx`
  - `packages/dashboard/src/spatial-lens/viewport/AgentLayer.tsx`
  - `packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css`
  - `packages/dashboard/tests/spatial-lens-room-dressing.test.mjs`
  Acceptance criteria (agent-executable):
  ```bash
  node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-room-dressing.test.mjs packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs
  grep -q 'viewMode="overview"' packages/dashboard/src/components/OfficeStage.tsx
  grep -q 'data-overview-role' packages/dashboard/src/spatial-lens/components/FloorViewport.tsx
  grep -q 'room-dressing-layer' packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css
  ```
  QA scenarios:
  - Browser action:
    ```js
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE_URL);
    await page.getByRole("tab", { name: "Floor Overview" }).click().catch(async () => {
      await page.getByRole("button", { name: "Floor Overview" }).click();
    });
    ```
  - PASS observable:
    ```js
    await expect(page.locator('[data-spatial-lens-floor="static"][data-viewport-mode="overview"]')).toHaveCount(1);
    await expect(page.locator('[data-overview-role="topology"]')).toHaveCount(1);
    await expect(page.locator('[data-focused-handoff-view="true"]')).toHaveCount(0);
    const hidden = await page.evaluate(() => ({
      dressing: [...document.querySelectorAll(".room-dressing-layer")].every((n) => getComputedStyle(n).display === "none"),
      workstation: [...document.querySelectorAll(".workstation-layer")].every((n) => getComputedStyle(n).display === "none"),
      wall: [...document.querySelectorAll(".wall-detail-layer")].every((n) => getComputedStyle(n).display === "none"),
    }));
    expect(hidden).toEqual({ dressing: true, workstation: true, wall: true });
    ```
  - Evidence: `output/playwright/frontend-design-architecture-improvement-overview-1440.png`, `.json`.
  Commit: Y | `test(spatial-lens): preserve overview topology guardrails` | Files: Overview tests/CSS only if needed

- [ ] T7. Add real-route browser QA harness and evidence capture
  What to do / Must NOT do:
  - Add a repo-local browser verification script only if no equivalent existing script already covers the exact scenarios.
  - Prefer existing project patterns under `output/playwright/` for screenshots and JSON.
  - Script must start from a live Vite page, explicitly select each mode, and write JSON plus screenshots.
  - Use binary observables, not prose:
    - Focused: one workbench, zero floor map, four steps, blocked step, owner/sentinel/monitor CTA assertions as applicable.
    - Focused fit: `scrollWidth - clientWidth === 0`, workbench y < 260, context bottom <= 900 at `1220x900`, nav rows == 1.
    - Overview: one topology floor, signal layers present, clutter layers computed hidden.
    - Classic regression: zero `data-spatial-lens-floor`, zero Focused workbench. No Classic redesign.
  - Must NOT treat screenshots alone as pass/fail.
  Parallelization: Can parallel N | Wave 2 after relevant UI/code changes | Blocks T8
  References:
  - `output/playwright/*.json`
  - `packages/dashboard/package.json`
  - `packages/dashboard/tests/office-preview-shell.test.mjs`
  - `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`
  Acceptance criteria (agent-executable):
  ```bash
  test -f output/playwright/frontend-design-architecture-improvement-results.json
  grep -q '"focused-1220"' output/playwright/frontend-design-architecture-improvement-results.json
  grep -q '"overview-1440"' output/playwright/frontend-design-architecture-improvement-results.json
  grep -q '"classic-regression"' output/playwright/frontend-design-architecture-improvement-results.json
  ```
  QA scenarios:
  - Server:
    ```bash
    pnpm --filter @conitens/dashboard dev -- --host 127.0.0.1 --port "$DASHBOARD_PORT"
    ```
  - Browser script invocation:
    ```bash
    node .omo/evidence/run-frontend-design-architecture-qa.mjs --url "$BASE_URL"
    ```
  - Evidence:
    - `output/playwright/frontend-design-architecture-improvement-focused-1220.png`
    - `output/playwright/frontend-design-architecture-improvement-focused-1440.png`
    - `output/playwright/frontend-design-architecture-improvement-overview-1440.png`
    - `output/playwright/frontend-design-architecture-improvement-classic-1440.png`
    - `output/playwright/frontend-design-architecture-improvement-results.json`
  Commit: Y | `test(spatial-lens): add real route layout verification` | Files: `.omo/evidence/run-frontend-design-architecture-qa.mjs`, evidence outputs, tests if integrated

- [ ] T8. Run full verification and reconcile Conitens context
  What to do / Must NOT do:
  - Run all dashboard verification:
    ```bash
    pnpm --filter @conitens/dashboard test
    pnpm --filter @conitens/dashboard build
    ```
  - Run the browser QA script from T7 against the live route.
  - Run a repo-structure post-write or equivalent import/graph check for changed TS/JS/CSS files. If the Repo Structure Lens MCP/skill is available, use `repo-structure-postwrite`; otherwise record the fallback command and why.
  - Update `.conitens/context/task_plan.md`, `.conitens/context/findings.md`, `.conitens/context/progress.md`, and `.conitens/context/LATEST_CONTEXT.md` because the task meaningfully changes UI context.
  - Refresh or explicitly record freshness status for `.vibe/context/LATEST_CONTEXT.md` because repo-intelligence context is currently stale relative to recent Spatial Lens work.
  - Verify existing demo/fixture data shape stayed compatible, or record the exact justified exception and regression proof.
  - Include verification evidence paths and remaining risks in context.
  - Must NOT claim completion from green tests without browser evidence.
  Parallelization: Can parallel N | Wave 3 | Blocks final handoff
  References:
  - `.conitens/context/task_plan.md`
  - `.conitens/context/findings.md`
  - `.conitens/context/progress.md`
  - `.conitens/context/LATEST_CONTEXT.md`
  - `.vibe/context/LATEST_CONTEXT.md`
  - `packages/dashboard/package.json`
  - `output/playwright/frontend-design-architecture-improvement-results.json`
  Acceptance criteria (agent-executable):
  ```bash
  pnpm --filter @conitens/dashboard test
  pnpm --filter @conitens/dashboard build
  test -f output/playwright/frontend-design-architecture-improvement-results.json
  grep -q "Frontend design architecture improvement" .conitens/context/LATEST_CONTEXT.md
  grep -Eq "fresh|stale|regenerated|not applicable" .vibe/context/LATEST_CONTEXT.md .omo/evidence/task-8-final-verification.md
  grep -q "demo_fixture_shape" .omo/evidence/task-8-final-verification.md
  ```
  QA scenarios:
  - Browser final proof command:
    ```bash
    node .omo/evidence/run-frontend-design-architecture-qa.mjs --url "$BASE_URL" > .omo/evidence/task-8-browser-qa.txt 2>&1
    test $? -eq 0
    grep -Eq '"status"[[:space:]]*:[[:space:]]*"PASS"' output/playwright/frontend-design-architecture-improvement-results.json
    ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"FAIL"' output/playwright/frontend-design-architecture-improvement-results.json
    ```
  - Context proof command:
    ```bash
    grep -q "Frontend design architecture improvement" .conitens/context/LATEST_CONTEXT.md
    grep -q "frontend-design-architecture-improvement-results.json" .conitens/context/LATEST_CONTEXT.md .conitens/context/progress.md
    grep -q "Focused" .conitens/context/findings.md
    ```
  - PASS observable: browser JSON contains only PASS scenarios, context files name the batch plus final evidence paths, `.vibe/context/LATEST_CONTEXT.md` freshness is refreshed or explicitly justified, and demo/fixture data-shape compatibility is recorded.
  - Evidence: `.omo/evidence/task-8-final-verification.md`.
  Commit: Y | `docs(spatial-lens): record frontend design architecture verification` | Files: context docs, evidence summary

## Final verification wave (after ALL todos)
> Runs in parallel. ALL must approve through recorded evidence. After F1-F4 pass, the executor may declare implementation complete autonomously without another user interview.

- [ ] F1. Plan compliance audit
  - Tool: reviewer/subagent or direct checklist.
  - Verify every todo above has implementation, test, browser QA, evidence path, and commit intent.
  - Evidence: `.omo/evidence/f1-plan-compliance.md`

- [ ] F2. Code quality review
  - Tool: code-review stance on changed files.
  - Verify no new dependency, no broad formatting, no duplicated Focused derivation, no dormant Focused map remount path.
  - Evidence: `.omo/evidence/f2-code-quality.md`

- [ ] F3. Real browser QA
  - Tool: Browser/Playwright against live Vite page.
  - Invocation:
    ```bash
    node .omo/evidence/run-frontend-design-architecture-qa.mjs --url "$BASE_URL"
    ```
  - Evidence: `output/playwright/frontend-design-architecture-improvement-results.json`

- [ ] F4. Scope fidelity
  - Verify no backend, bridge, runtime mutation, `.notes`, dependency, persona, unnecessary demo/fixture data-shape change, or Classic redesign slipped into the diff.
  - Evidence: `.omo/evidence/f4-scope-fidelity.md`

## Commit strategy
- Do not auto-commit unless the user authorizes commits for execution.
- If commits are authorized, keep commits atomic and conventional:
  - `chore(spatial-lens): record approved worktree baseline`
  - `fix(spatial-lens): derive focused next action from model`
  - `fix(spatial-lens): clarify focused workbench hierarchy`
  - `fix(spatial-lens): expose stage modes as tabs`
  - `refactor(spatial-lens): remove dormant focused map contracts`
  - `test(spatial-lens): preserve overview topology guardrails`
  - `test(spatial-lens): add real route layout verification`
  - `docs(spatial-lens): record frontend design architecture verification`
- Commit messages must follow the Lore protocol if commits are made.
- Final commit footer, if a final commit is made:
  `Plan: .omo/plans/frontend-design-architecture-improvement.md`

## Success criteria
- Focused mode remains the primary Active Handoff Workbench and does not mount the full floor map.
- Focused answers active agent, blocked task, next owner/handoff, and next operator action in the first viewport at `1220x900`.
- Focused CTA label and target derive from model state for `owner-approval`, `sentinel-review`, and `monitor`.
- PixelOffice summary and Focused workbench derive next-action/blocker semantics from one model-owned source.
- Overview remains the only full Spatial Lens topology map and keeps clutter layers hidden at 1x.
- Dormant Focused map artifacts are removed from active contracts after static and browser proof, or explicitly proven non-mounted if any must remain temporarily.
- Stage mode switch exposes correct tab semantics and keyboard movement.
- Classic is not redesigned; it is verified only as a no-Spatial-Lens-floor regression surface.
- Dashboard tests pass.
- Dashboard build passes.
- Browser QA JSON and screenshots prove Focused, Overview, Classic regression, and 1220px nav/overflow behavior.
- `.conitens/context/*` reflects the completed UI context if the implementation is executed.
- `.vibe/context/LATEST_CONTEXT.md` is refreshed or explicitly marked stale/not-applicable with evidence.
- Existing demo/fixture data shape remains compatible unless a justified exception is recorded with regression proof.

## Metis Gap Fixes Folded In
- Classic scope resolved: no Classic redesign; regression guard only.
- Dormant cleanup semantics resolved: delete/de-contract active contracts after zero-use proof; no archive directory unless a repo convention exists.
- Proof standard resolved: require static grep proof plus browser zero-mount proof.
- CTA mapping resolved for all `nextActionKind` values.
- Tab semantics made explicit.
- Dirty worktree handling added as T1 gate.
- Dormant deletion/test-update order added in T5.
- Browser HMR/session-state issue handled by explicitly selecting target mode in every scenario.
- Static analysis/import graph check added in T8.
- Review-work fixes folded in: selected `BASE_URL` replaces hard-coded browser ports, CTA checks require model-bound links, tab checks cover ARIA wiring and both arrow directions, T5 source absence checks no longer conflict with selector-based zero-mount tests, `.vibe` freshness is explicit, and demo/fixture data-shape preservation is enforceable.
