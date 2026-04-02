# Pixel Office Design Improvement Plan

> Date: 2026-03-30  
> Scope: `packages/dashboard` pixel office tab rebuild  
> Reference: `docs/pixel_office_dashboard.html`

## 1. Intent

Rebuild the dashboard's **Office** tab so it reads like an operational dashboard
first and a pixel-office vignette second:

- one dominant visual anchor (the office stage)
- one narrow context rail (agents, tasks, handoffs)
- minimal chrome, flat hierarchy, restrained pixel language
- clear operator signal without turning the surface into a full simulator

## 2. Frontend Direction

### Visual thesis

Build a **stage-first control surface**: calm cream-and-sand pixel floorplate,
thin borders, compact pixel headlines, and dense but quiet operations data in a
single right rail.

### Content plan

1. **Hero** — the office stage / floorplate
2. **Support** — active agents list and task queue
3. **Detail** — recent handoffs and room pressure
4. **Final CTA** — keep approval/decision surfaces outside the office rail

### Interaction thesis

- room hover / selection should clarify, not decorate
- resident selection should update a compact detail row, not a dossier card
- handoff routes and speech bubbles should be brief ambient cues, not the main UI

## 3. Current Gap Summary

Based on the reference, current package structure, and Claude review:

1. the stage does not dominate enough
2. the office rail is too heavy and portrait-driven
3. the summary strip above the stage competes with the main layout
4. the room treatment is visually busier than the reference intent
5. the office tab currently behaves more like a mini simulation than a
   card-less operator dashboard

## 4. Product Decision

### Chosen direction

Adopt a **stage-first adaptation** of the current six-room office model.

This keeps the Conitens room semantics (`ops-control`, `impl-office`,
`validation-office`, etc.) while redesigning the presentation to match the
reference's hierarchy and restraint.

### Rejected options

#### A. Literal 4-room clone of the reference

- **Pros:** closest visual match
- **Cons:** discards current room semantics and existing dashboard data model

#### B. Keep current simulation-heavy composition

- **Pros:** least code churn
- **Cons:** preserves the main hierarchy problem and information overload

## 5. Rebuild Scope

### In scope

- remove the office summary strip above the stage
- rebalance the layout to a strong `stage + 340px rail` split
- simplify the right rail into flat operational sections
- reduce portrait/dossier complexity
- keep room selection and resident selection, but surface them compactly
- preserve current data hooks, room model, and tests where possible
- update planning artifacts and Figma design-system rules

### Out of scope

- changing the broader overview / kanban / timeline architecture
- replacing the office data model
- adding new dependencies
- adding a full game-engine style movement system

## 6. Implementation Phases

### Phase 1 — Structural reset

- remove `office-summary`
- tighten stage shell / panel padding
- make the stage the dominant canvas
- lock the rail width to the reference rhythm

### Phase 2 — Context rail simplification

- replace dossier-heavy content with:
  - active agents
  - task queue
  - recent handoffs
- keep one compact selected-room / selected-resident block
- drop canonical portrait emphasis

### Phase 3 — Stage polish

- reduce extra chrome where it weakens hierarchy
- keep pixel-room scenes, but make them flatter and easier to scan
- preserve room pressure and handoff cues

### Phase 4 — Verification

- dashboard tests
- dashboard build
- browser verification with Playwright
- final design delta review against `docs/pixel_office_dashboard.html`

## 7. Acceptance Criteria

1. the Office tab opens in a clear two-column layout with the stage visually dominant
2. the summary strip above the stage is removed
3. the right rail presents flat operational sections for:
   - active agents
   - task queue
   - recent handoffs
4. the rail no longer depends on a large portrait-led dossier card
5. the current room and resident selection model still works
6. `pnpm --dir packages/dashboard test` passes
7. `pnpm --dir packages/dashboard build` passes
8. Playwright can load the rebuilt office tab and capture a screenshot successfully

## 8. Execution Guidance

### Available agent types roster

- planner
- architect
- critic
- executor
- verifier
- vision

### Suggested staffing

- **lane 1 / executor / medium:** office layout + stage shell cleanup
- **lane 2 / executor / medium:** rail simplification + selection UX cleanup
- **lane 3 / verifier / medium:** build, tests, Playwright checks

### Launch hints

- Team execution: `omx team ralph 2:executor "rebuild packages/dashboard office tab to match docs/pixel_office_dashboard.html hierarchy"`
- Ralph follow-through: `ralph rebuild packages/dashboard office tab with verification using the approved PRD + test spec`

### Team → Ralph path

1. team handles bounded implementation lanes
2. leader integrates and resolves final polish
3. ralph verification closes the loop with fresh build/test/browser evidence
