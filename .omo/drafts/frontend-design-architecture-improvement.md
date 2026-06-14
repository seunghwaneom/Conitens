# Frontend Design And Architecture Improvement Draft

Updated: 2026-06-13T13:28:20Z

## Request

User invoked `$omo:ulw-plan` and `$ultrawork` for frontend design, design element placement, and architecture improvement.

Planner scope only: do not edit product code before approval. Final work plan must be written to `.omo/plans/<slug>.md` only after explicit user approval.

## Skills And Mode

- `omo:ulw-plan`: Explicitly invoked. Controls explore-first planning, interview, approval gate, and final plan artifact.
- `ultrawork`: Explicitly invoked. Used for parallel read-only research lanes.
- `frontend-skill`: Relevant to UI hierarchy and operational workspace design. Loaded from `.agents/skills/frontend-skill/SKILL.md`; for dashboard surfaces, it recommends calm hierarchy, one primary workspace, one secondary context rail, sparse utility copy, minimal chrome, and avoiding unnecessary cards.
- `repo-structure-lens`: Relevant later if final plan includes broad TS/JS architecture cleanup. Not used yet because approval gate comes first.
- `validation-gate`: Relevant to planned QA evidence. Not used yet because this is not implementation.

Tier: HEAVY.
Justification: The request spans frontend design, element placement, and architecture across dashboard UI modules and asks for planning plus parallel work.

## Research Lanes

- Architecture lane: completed. Confirmed current Focused architecture is workbench-first and identified dormant focused-map artifacts as a planning risk.
- QA lane: completed. Confirmed existing static tests/build are green per lane report, but browser-route coverage is the missing proof class.
- UI designer lane: completed after draft creation. Integrated findings: Focused needs less duplicate focus/state copy, dynamic next-action CTA, clearer blocked-task vs waiting-gate treatment, less opacity on critical text, compact Focused rail, Overview signal-only additions, Classic should become dense operations/table mode if included, and mode switch should use tab semantics.
- Planner wave-order lane: completed after draft creation. Integrated findings: rebaseline first, then architecture inventory, design direction, Focused slice, Overview slice, shell/accessibility slice, architecture cleanup slice, final QA/evidence wave.

## Verified Facts

- `PixelOffice` owns shell-level mode and density: `packages/dashboard/src/components/PixelOffice.tsx` derives office presence, owns `stageMode`, persists `conitens.officeStageMode`, and switches `data-office-preview-shell` between `workbench-dominant` and `viewport-dominant`.
- `OfficeStage` is the stage boundary: `packages/dashboard/src/components/OfficeStage.tsx` defines `focused | overview | classic`; Focused renders `FocusedHandoffView`, Overview renders `FloorViewport viewMode="overview"`, Classic renders `OfficeRoomScene`.
- Focused semantics are model-owned: `packages/dashboard/src/spatial-lens/model/focusedHandoffModel.ts` derives the active blocker, review task, next action, handoff edges, four-step chain, blocked age, latest event label, and muted spatial contexts.
- Focused view exposes stable runtime hooks: `packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx` emits `data-focused-handoff-view`, `data-active-handoff-workbench`, `data-workbench-primary="active-handoff"`, `data-handoff-chain-task`, `data-next-operator-action`, and `data-focused-spatial-context="muted"`.
- Sidebar state vocabulary shares the Focused model: `packages/dashboard/src/components/OfficeSidebar.tsx` imports `getAgentWorkState`, so workbench and rail state labels are not derived independently.
- Overview owns the full floor map: `packages/dashboard/src/spatial-lens/components/FloorViewport.tsx` builds topology through `createFloorViewportModel`, renders room, handoff, agent, and door layers, and marks Overview with `data-overview-role="topology"`.
- Current tests already lock core contracts in `packages/dashboard/tests/office-preview-shell.test.mjs`, `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`, `packages/dashboard/tests/spatial-lens-room-dressing.test.mjs`, and related Spatial Lens tests.
- Existing browser evidence follows the `output/playwright/*.json` plus screenshot convention, including focused view, UX review, OSS workbench upgrades, verification, and overview declutter artifacts.

## Dirty Worktree Risk

Current worktree already contains many dashboard and context edits, including modified files under:

- `.conitens/context/*`
- `AGENTS.md`
- `packages/dashboard/src/components/*`
- `packages/dashboard/src/spatial-lens/**`
- `packages/dashboard/tests/*`

Untracked dashboard files include:

- `packages/dashboard/src/spatial-lens/components/FocusedHandoffView.tsx`
- `packages/dashboard/src/spatial-lens/model/focusedHandoffModel.ts`

Plan must treat these as existing user/agent work. Executor must not revert or overwrite them casually. If final plan edits these files, it must start by re-reading current contents.

## Planning Thesis

Visual thesis: Conitens Spatial Lens should read as a calm operator control surface: Focused is a handoff workbench, Floor Overview is a topology map, and Classic is a legacy dense camera/table fallback.

Content hierarchy:

1. Focused: make the active blocker, owner, validation handoff, and next action answerable in under 3 seconds.
2. Floor Overview: preserve full spatial topology while reducing non-operational visual noise.
3. Classic: keep as fallback context, not the design protagonist.

Interaction thesis:

- Use mode switching as a clear mental model: Focused, Floor Overview, Classic.
- Use restrained state motion only for live flow or blocked attention, with reduced-motion support.
- Use browser-level QA to verify real placement, viewport fit, and no overlap.

## Likely Approach To Plan

Recommended default: targeted guarded improvement pass, not a rewrite.

Scope IN:

- Consolidate Focused summary/next-action derivation so `PixelOffice` summary does not drift from `focusedHandoffModel`.
- Make the primary Focused CTA dynamic from `model.nextActionKind` instead of always rendering `Open approvals`.
- Reduce duplicate Focused copy across summary band, stage header, posture strip, workbench, and sidebar.
- Treat the blocked task as the visual peak while styling the approval gate as waiting/held, not as a second failure.
- Keep muted spatial context art subdued while preserving readable text, including two-line wrapping where needed.
- Compress or collapse the Focused sidebar rail so it cannot compete with the workbench.
- Make active vs dormant Spatial Lens surfaces explicit, then either remove or quarantine dormant Focused floor-map artifacts.
- Preserve Overview as topology and signal tracing only; do not reintroduce decorative room clutter.
- If Classic is in scope, align it with the repo rule that Classic owns dense dashboard/table views instead of another spatial camera.
- Improve mode switching semantics with `tablist` / `tab` / `tabpanel` behavior if shell accessibility is in scope.
- Strengthen runtime browser QA for Focused, Overview, Classic, 1220px nav, first viewport fit, and computed overview declutter.
- Make layout hierarchy improvements only where browser evidence shows overlap, duplicate state, or weak primary/secondary ordering.

Scope OUT:

- No backend/runtime state mutation work.
- No `.notes/` direct writes.
- No new dependencies.
- No vector DB, embeddings, LangGraph, or AG2 work.
- No persona/identity-core edits.
- No broad repo formatting.
- No replacing `scripts/ensemble.py`.

## Key Architecture Decision Needed

Dormant Focused map artifacts exist after Focused moved to `FocusedHandoffView`.

Observed artifacts:

- `FloorViewport.tsx` still supports `viewMode === "focused"` and emits `data-operator-focus-map`.
- `FocusedCorridorContinuityLayer.tsx` exists and is still tested.
- `FocusedRouteTargetEdge.tsx` exists and is still tested.
- CSS still includes `.phase-lane-indicator`, `.focused-corridor-continuity-layer`, `.focused-target-edge`, `.focused-handoff-rail`, and `.agent-offscreen-rail`.
- Tests simultaneously assert `OfficeStage` does not pass `viewMode="focused"`.

Recommended default: archive/remove dormant Focused map code from active contracts where safe, while preserving Overview topology and Workbench-first Focused behavior. This reduces future regression risk that Focused becomes map-dominant again.

Alternative: keep dormant artifacts but add explicit comments/tests marking them deprecated and non-mounted. Lower immediate risk, higher future ambiguity.

## Recommended Wave Order

1. Rebaseline and scope lock
   - Re-read dirty files, confirm current screenshots/evidence, and decide whether this plan is `#/office-preview` only or broader dashboard shell.
   - Blocks all later waves.

2. Architecture and contract inventory
   - Lock boundaries: `App` route shell, `PixelOffice` state/container, `OfficeStage` mode dispatcher, Focused/Overview/Classic subviews.
   - Inventory data hooks that must survive: active workbench, next action, workbench steps, overview mode, nav semantics.

3. Design and element placement direction
   - Decide Focused handoff hierarchy, sidebar density, spatial context strip, Overview signal layers, nav/header density, and Classic role before code.

4. Focused workbench slice
   - Refine spacing, next-action prominence, blocked/review/clear states, sidebar relationship, and context strip placement.
   - Keep `createFocusedHandoffWorkbenchModel` pure and protect no-blocker fallback.

5. Overview spatial placement slice
   - Validate room-kit signal, route/packet/blocked markers, room palette, layer visibility, and agent legibility at 1x.
   - Can parallelize with the Focused slice after design direction if file ownership is disjoint.

6. Shell/accessibility/responsive slice
   - Cover nav labels, mode switch semantics, landmarks, 1220/900/820/mobile layouts, and overflow.
   - Can parallelize with Focused/Overview if scoped to shell CSS and route chrome.

7. Architecture cleanup slice
   - Only after visual direction stabilizes. Reduce ambiguity from dormant Focused map artifacts and duplicated derivation; avoid live bridge/runtime changes.

8. Final QA/evidence wave
   - Run dashboard tests, dashboard build, and browser scenarios with JSON/screenshots under `output/playwright/` or `.omo/evidence/`.

## Test Strategy Decision Needed

Recommended default: TDD/characterization first for behavior that changes, tests-after for pure CSS placement where the failing proof is browser evidence.

Minimum verification for final implementation plan:

- `pnpm --filter @conitens/dashboard test`
- `pnpm --filter @conitens/dashboard build`
- Browser route QA against `http://127.0.0.1:<port>/#/office-preview`
- Screenshot and JSON evidence under `output/playwright/`

Required browser scenarios:

1. Focused Workbench Dominates
   - Select Focused.
   - Assert one `data-office-preview-shell="workbench-dominant"`, one `data-focused-handoff-view="true"`, one `data-active-handoff-workbench="true"`, zero `data-spatial-lens-floor="static"`, four `data-workbench-step`, one blocked step, and one owner-approval next action.

2. Focused Placement Fits First Viewport
   - Viewport `1220x900`.
   - Assert no horizontal overflow.
   - Assert workbench and muted spatial context strip fit in the first viewport.
   - Assert nav rows equal `1`.

3. Overview Owns Full Floor Map
   - Select Floor Overview.
   - Assert one `data-spatial-lens-floor="static"` with `data-viewport-mode="overview"`, one `data-overview-role="topology"`, zero focused handoff view, one handoff route, one blocked marker.
   - Assert `.room-dressing-layer`, `.workstation-layer`, and `.wall-detail-layer` compute to `display: none` in overview.

4. Classic Does Not Mount Spatial Lens Floor
   - Select Classic.
   - Assert zero `data-spatial-lens-floor="static"`, zero `data-focused-handoff-view="true"`, and one classic stage.

## Remaining Ambiguities For User

1. Primary scope choice:
   - Recommended: `#/office-preview` Spatial Lens first: Focused-first guarded pass plus Overview guardrails. This targets the current product rule and the biggest architecture risk.
   - Broader: equal redesign pass across Focused, Floor Overview, and Classic. More expensive and higher risk with the dirty worktree.
   - Cleanup-only: no visual redesign; only remove/quarantine dormant focused-map architecture and add QA.

2. Dormant Focused map artifacts:
   - Recommended: remove/archive from active contracts when proven unmounted, then update tests.
   - Conservative: keep them but mark deprecated/non-mounted and add guards against remounting.

3. Test strategy:
   - Recommended: characterization/TDD for model/component contracts, browser failing-first evidence for placement, then full dashboard test/build.
   - Tests-after only: faster, but weaker against architecture drift.
   - No new tests: not recommended; browser QA still required.

4. Classic role:
   - Recommended if included: turn Classic into dense operations/table mode with task queue, recent handoffs, agent roster, and selected-room summary.
   - Conservative: keep Classic as current live-camera fallback and only verify it does not mount Spatial Lens floor.

## Approval Brief To Present

I found that the current UI is already on the right architectural track: Focused is `FocusedHandoffView`, Overview is `FloorViewport`, and Classic is separate. The next plan should not rewrite the UI; it should tighten the Workbench-first design, consolidate duplicated Focused summary derivation, and clean up or quarantine dormant Focused map artifacts.

Recommended approach: Focused-first guarded pass plus Overview guardrails, remove/archive dormant focused-map artifacts where safe, and use characterization/TDD plus browser-route evidence.

Wait for explicit user approval before writing `.omo/plans/frontend-design-architecture-improvement.md`.
