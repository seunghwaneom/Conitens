# task_plan.md

## Active Batch

- Batch: Unified authority repair execution
- Status: in_progress
- Date: 2026-07-10
- Scope: Execute the approved architecture/refactor plan in reversible waves.
  This slice fixes the documented authority contract, locks append/redaction and
  rebuild behavior, converts room create/message/tool-event mutations to
  event-before-projection ordering, hardens every characterized browser-visible
  Forward query projection, and aligns meeting, handoff, spawn, and stop
  lifecycle mutations without promoting Forward.
- Acceptance: ADR-0004 must keep legacy as the default runtime and define
  Forward promotion gates; append failures must leave no room/tool projection;
  successful events must remain replayable when later projections fail; room
  message and tool-event payloads must be replay-sufficient and redacted;
  deterministic rebuild and browser-path safety must be tested; meeting and
  spawn events must contain metadata rather than private text, paths, commands,
  process output, or environment values; no approval or verification gate may
  be weakened.
- Implemented: Wave 0 authority/bridge docs and a machine-readable direct-write
  inventory; Wave 1 append/redaction/rebuild behavior locks; Wave 2A event-first
  room create, message, and tool-event paths with stable authority message IDs
  and preserved integer SQLite projection IDs; Wave 2B public serializers for
  context, workspace, approval, validator, actor, and SSE query payloads; Wave
  2C event-first meeting, handoff, spawn, clean-exit, error, and stop command
  lifecycles with metadata-only canonical events and recoverable secondary
  projection failures.
- Remaining: extract bridge query and command responsibilities behind the
  now-locked public contract, then proceed to dashboard thin-shell and
  improvement-loop waves behind dedicated gates.
- Verified: 56 authority/room regression tests and 65 Forward boundary/runtime
  tests pass; 150 dashboard tests also pass. The final meeting/spawn authority
  group passes 34/34, focused protocol tests pass 6/6, the protocol package
  builds, and Python compile/event-type sync/scoped diff checks pass. The full
  operations suite now has 2 failures and 9 errors across 23 tests, all in
  known allow-list/registry/provider-workflow debt; the full protocol suite has
  4 known baseline failures and 846 passing tests.

## Previous Batch

- Batch: `Architecture direction and refactor planning`
- Status: `complete`
- Date: 2026-07-10
- Scope: Analyze the project conversation history, current Python control plane,
  forward SQLite/runtime stack, Forward Bridge, dashboard, generated context,
  tests, and repository structure; then define a target architecture, product
  direction, promotion gate, and reversible refactor roadmap without changing
  runtime behavior.
- Acceptance: The plan must preserve the event-first authority, additive Python
  facade, approval/verify gates, metadata-only harness boundary, and current
  forward non-default status; distinguish durable authority, operational state,
  projection, evidence, and UI state; identify current contract violations with
  code evidence; separate active from reference/parity surfaces; specify
  behavior-lock tests, exit-gated waves, PR-sized slices, success metrics, risks,
  and forward promotion/quarantine criteria.
- Artifact: `docs/conitens-architecture-direction-refactor-plan-2026-07-10.md`.
  Supporting generated evidence is under `.audit/repo-structure-lens/` and
  `.omo/evidence/conitens-architecture-direction-refactor-plan-review.md`.
- Verified: Independent architecture, fact, security, goal/constraint, and
  manual Markdown QA lanes all passed. The plan was corrected for room event
  payload sufficiency, the canonical meeting transcript evidence boundary,
  browser-visible absolute-path leakage, the patch-approval bridge shortcut,
  phase-scoped metrics, and the occupied ADR-0003 number; the new decision is
  reserved as ADR-0004. The existing CLI facade and forward status surface were
  exercised read-only. No runtime implementation was changed.

## Previous Batch

- Batch: `Episode closure attempt public artifact slice`
- Status: `complete`
- Date: 2026-07-05
- Scope: Implement the minimal supervisor episode closure attempt vertical
  slice from the interview seed. `episode close <episode_id>` now evaluates
  deterministic closure rules for an existing event-sourced episode id, always
  emits `task.artifact_added` with the closure bundle as replayable event
  payload, materializes an `episode_closure_bundle` evidence JSON plus public
  digest/index from that event, updates only a derived episode status
  projection, and exposes `improvement list/show` L0/L1 CLI views.
- Acceptance: Missing episode ids error before artifact writes; required
  summary fields, failed/missing validation, and high-risk blockers produce a
  `blocked` closure bundle; low confidence or review ambiguity produces
  `needs_review`; successful validation with required fields produces `closed`;
  every closure bundle contains `episode_summary`, `scorecard`,
  `raw_access_audit`, and `next_workflow_recommendation`; raw access defaults
  to `raw_access_used=false` with no grants; validation comes only from prior
  validation events; public closure text and public episode labels are
  redacted/rejected at the boundary; artifact filenames and event scope do not
  expose raw episode ids; projection files are derived read models rather than
  source-of-truth state.
- Verified: Python compile passed for the changed CLI/module/test files;
  `tests.test_episode_closure` + `tests.test_episode_closure_cli_security`
  passed 13/13; non-server approval and loop-state regressions passed 26/26; a
  non-server Forward Bridge projection regression passed; scoped `git diff --check`
  passed with only the existing Windows LF/CRLF warning for `scripts/ensemble.py`.
  The full fixed-port Forward Bridge HTTP regression bundle still fails on this
  host with `PermissionError:
  [WinError 10013]` during loopback port bind, including after elevated retry.

## Previous Batch

- Batch: `Gajae-Code harness adapter integration`
- Status: `complete`
- Date: 2026-07-04
- Scope: Install Gajae-Code as a pinned external terminal harness, wire the
  Codex plugin marketplace, and add Conitens read-only harness evidence
  projections plus a metadata-only GJC adapter import surface without making
  GJC authoritative runtime state.
- Acceptance: Bun/GJC install checks pass; Codex plugin list shows
  `gajae-code@gajae-code-local` installed and enabled; `harness.evidence_observed`
  rejects raw transcript/stdout/stderr/prompt/diff/body/comment fields;
  `scripts/ensemble_gjc_adapter.py` imports only redacted GJC metadata and
  rejects unsafe evidence refs before append; the Forward Bridge exposes GJC
  runtime availability and metadata-only harness evidence; the dashboard parses
  and renders harness evidence as an evidence health signal rather than a
  primary control surface; existing bridge and dashboard regression gates pass.
- Verified: GJC install checks passed; focused backend harness tests passed;
  GJC adapter tests passed; manual adapter CLI QA passed; approval and
  loop-state regression tests passed; dashboard tests passed 150/150; dashboard
  production build passed; `git diff --check` reported only existing Windows
  LF/CRLF warnings. The full fixed-port Forward Bridge HTTP regression bundle
  remains environment-blocked on this Windows host by `PermissionError:
  [WinError 10013]` while binding loopback test ports, even when retried with
  elevated execution.

## Previous Batch

- Batch: `README and Office Preview documentation sync`
- Status: `complete`
- Date: 2026-07-04
- Scope: Refresh top-level and frontend asset documentation so README,
  `CONITENS.md`, Office Preview guidance, and the Spatial Lens asset README
  match the current dashboard/Forward Bridge/agent portrait architecture.
- Acceptance: README must identify `packages/dashboard` and the read-only
  Forward Bridge as current forward surfaces; Office Preview docs must separate
  Focused large portrait assets from Topology 64px sprite atlases; stale
  Spatial Lens asset-registry language must be removed; no code/runtime assets
  should be changed by this documentation-only pass.
- Verified: reviewed edited Markdown, searched for removed stale phrases, and
  inspected the documentation diff.

## Previous Batch

- Batch: `Large imagegen pixel portrait agent integration`
- Status: `complete`
- Date: 2026-06-30
- Scope: Apply the approved large standalone role character PNGs to the
  dashboard Agent stage while preserving the existing sprite-gen atlas pipeline
  for compact room/spatial avatar contexts.
- Acceptance: all five canonical roles must have generated portrait assets
  under `public/agent-portraits/generated`; Agent-stage cards must render those
  assets with imagegen provenance hooks; the visible cards must show full-body
  pixel characters rather than cropped heads, tiny sprites, sprite sheets, or
  palette-swap mini bodies; tests/build/browser QA must stay green.
- Verified: added RED contract for the missing portrait module and generated
  asset surface; copied all five role PNGs into dashboard public assets as
  `288x512` transparent RGBA portraits; wired
  `agent-character-portraits.ts` into `AgentCharacterStage`; enlarged the card
  portrait viewport and added browser QA rendered-size checks; targeted tests
  passed 150/150; full dashboard tests passed 150/150; dashboard production
  build passed; browser QA PASS at Agents 820/1220/1440, reduced motion, and
  Topology 1220; screenshot inspection confirmed full-body figures. Evidence:
  `.omo/evidence/agent-character-portraits-red.txt`,
  `.omo/evidence/agent-character-portraits-targeted.txt`,
  `.omo/evidence/dashboard-node-tests-agent-portraits.txt`,
  `.omo/evidence/dashboard-build-agent-portraits.txt`,
  `.omo/evidence/agent-character-stage-browser-qa-agent-portraits.txt`,
  `.omo/evidence/agent-portrait-asset-check.txt`, and
  `output/playwright/agent-character-stage/agents-1220.png`.

## Previous Batch

- Batch: `Front-facing pixel portrait agent redesign`
- Status: `complete`
- Date: 2026-06-28
- Scope: Apply the user's attached front-facing pixel character references to
  the sprite-gen agent cast, replacing the rejected top-view office character
  direction with direct-generated full-body human lineup sprites.
- Acceptance: generated agent sprites must read as front-facing full-body
  pixel humans with large readable heads/eyes, highlighted hair, clothing
  layers, separated legs/shoes, and role props; generated manifests and
  requests must record user-supplied front-facing reference provenance without
  copying source pixels; the Agent stage must render the 64px sprites at 2x
  without clipping; Spatial Lens character registry geometry must match the
  generated 64px atlas frames; no command-center/Claude/imported character
  sheet source may return.
- Verified: new RED contract failed first on old 48px/top-view artifacts;
  regenerated all five sprite-gen role atlases at 64px; inspected the combined
  contact sheet and Agents 820/1220/1440 screenshots; fixed a selected-avatar
  CSS ring that made the sprite frame look boxed; revised sprite eyes, role
  props, and silhouette cues after read-only visual critique; targeted
  agent/spatial tests passed; full dashboard tests passed 149/149; `tsc -b`
  passed; Vite production build passed; browser QA passed including 820px and
  CTA/card keyboard focus sequence; visible magenta checks returned 0 pixels.
  Evidence:
  `.omo/evidence/agent-sprite-gen-front-facing-run.txt`,
  `.omo/evidence/agent-character-stage-front-facing-targeted.txt`,
  `.omo/evidence/dashboard-node-tests-front-facing.txt`,
  `.omo/evidence/dashboard-tsc-front-facing.txt`,
  `.omo/evidence/dashboard-vite-build-front-facing.txt`,
  `.omo/evidence/agent-character-stage-browser-qa-front-facing.txt`,
  `.omo/evidence/front-facing-character-reference-notes.md`, and
  `output/playwright/agent-character-stage/front-facing-sprite-gen-contact.png`.

## Previous Batch

- Batch: `Reference-informed pixel office agent redesign`
- Status: `complete`
- Date: 2026-06-28
- Scope: Use web/image reference research for top-down pixel office character
  direction, then regenerate the agent sprite-gen character atlases and tune
  the Agent stage so characters read as a stronger 2D human operator cast.
- Acceptance: reference research must be recorded without copying source
  pixels; generated sprite requests and manifests must record the source URLs
  and no-copy art-direction note; characters must preserve the direct
  sprite-gen component-row pipeline; Agent-stage cards must keep 1220px and
  1440px layouts stable while making characters larger and more readable; no
  command-center/Claude/imported character sheet source may return.
- Verified: new manifest/reference test failed first on missing
  `referenceSources`; regenerated all roles; targeted agent/spatial tests
  passed; full dashboard tests passed 149/149; `tsc -b` passed; Vite
  production build passed; browser QA passed; visual contact sheet and
  1220/1440 screenshots inspected; exact/near magenta check returned 0;
  `git diff --check` passed with only LF/CRLF warnings. Evidence:
  `.omo/evidence/*reference-informed*.txt` and
  `output/playwright/agent-character-stage/reference-informed-sprite-gen-contact.png`.

## Previous Batch

- Batch: `Frontend-skill 2D human sprite-gen redesign`
- Status: `complete`
- Date: 2026-06-28
- Scope: Use the frontend-skill pass to replace the still-too-simple
  direct-generated agent silhouettes with detailed 2D human operator sprites
  while preserving the direct sprite-gen component-row pipeline, runtime
  manifest contract, and Agent/Topology/Classic app semantics.
- Acceptance: agent sprites must show readable 2D human faces, hair, clothing,
  separate limbs, boots, and role props; generated `sprite-request.json` and
  prompts must use detailed 2D cel-shaded human character language and avoid
  simplified avatar/chibi/mascot provenance; QA notes must record the
  non-simple 2D human character intent; the Agent stage must remain readable at
  1220px and 1440px with reduced-motion behavior preserved; no dashboard
  source should keep command-center agent PNG references.
- Verified: old generated request failed the new provenance test first; direct
  sprite-gen generation reran for all five roles at 48px `cellSize`;
  dashboard tests passed 149/149; `tsc -b` passed; Vite production build
  passed; browser QA passed; `git diff --check` passed; command-center agent
  PNG source grep is empty; visual contact sheet inspected at
  `output/playwright/agent-character-stage/2d-human-sprite-gen-contact.png`.
  Evidence: `.omo/evidence/*2d-human*.txt`.

## Previous Batch

- Batch: `Direct sprite-gen agent character generation`
- Status: `complete`
- Date: 2026-06-28
- Scope: Remove the borrowed/Claude/command-center character source path and
  regenerate agent character atlases directly from role-owned sprite-gen
  requests, while preserving the runtime public-asset contract and existing
  Agent/Topology/Classic app semantics.
- Acceptance: generated agent outputs must be created from direct sprite-gen
  component rows, not imported character sheets; generated QA notes must state
  the no command-center/Claude/imported-sheet provenance; each role keeps a
  distinct motion profile; the runtime manifest remains compact and
  dependency-free; the Agent stage keeps readable 1220px/1440px presentation,
  reduced-motion behavior, and the next-action CTA.
- Verified: direct sprite-gen generation ran for orchestrator, implementer,
  researcher, reviewer, and validator; dashboard tests passed 149/149;
  `tsc -b` passed; Vite production build passed; browser QA passed for Agents
  1220/1440, reduced motion, and Topology 1220; `git diff --check` passed.
  Evidence: `.omo/evidence/agent-sprite-gen-direct-run.txt`,
  `.omo/evidence/dashboard-node-tests-direct-sprite.txt`,
  `.omo/evidence/dashboard-tsc-direct-sprite.txt`,
  `.omo/evidence/dashboard-vite-build-direct-sprite.txt`,
  `.omo/evidence/agent-character-stage-browser-qa-direct-sprite.txt`, and
  `.omo/evidence/git-diff-check-direct-sprite.txt`.

## Previous Batch

- Batch: `LazyCodex frontend character-stage polish`
- Status: `complete`
- Date: 2026-06-28
- Scope: Apply the LazyCodex/frontend-skill pass to the existing sprite-gen
  Agent stage without changing runtime asset generation, routing, or
  Topology/Classic semantics.
- Acceptance: visible copy should be product/operator language rather than raw
  motion ids; the selected agent card should be the first-read visual anchor at
  1220px and 1440px; `data-motion-profile` and sprite-gen provenance must stay
  available for QA; blocked/review states must remain text-first and
  reduced-motion-safe.
- Verified: dashboard tests passed 149/149; `tsc -b` passed; Vite production
  build passed; `git diff --check` passed; browser QA passed for Agents
  1220/1440, reduced motion, and Topology 1220. Evidence:
  `.omo/evidence/dashboard-node-tests-frontend-skill.txt`,
  `.omo/evidence/dashboard-tsc-frontend-skill.txt`,
  `.omo/evidence/dashboard-vite-build-frontend-skill.txt`,
  `.omo/evidence/git-diff-check-frontend-skill.txt`, and
  `.omo/evidence/agent-character-stage-browser-qa-frontend-skill.txt`.

## Previous Batch

- Batch: `Sprite-gen agent character stage implementation`
- Status: `complete`
- Date: 2026-06-27
- Scope: Replace the office-centered Focused preview with a character-first
  Agent deck, use sprite-gen-backed agent atlases, diversify per-character
  motion profiles, and keep Topology/Classic mode semantics intact.
- Acceptance: Focused/Agents mode must not mount the floor viewport; it must
  show agent cards sourced from `public/agent-sprites/generated`, expose
  handoff/blocked/next signals, render at least four distinct visible
  role/motion profiles in the demo, preserve reduced-motion semantics, keep
  the 1220px nav on one row, and avoid runtime sprite dependencies.
- Verified: sprite-gen character manifests and QA GIF/contact sheets generated
  for orchestrator, implementer, researcher, reviewer, and validator; RED
  model/source test failed first on the missing character-stage module; final
  dashboard tests passed 149/149; `tsc -b` passed; Vite production build
  passed; browser QA passed for Agents 1220/1440, reduced motion, and
  Topology 1220. Evidence: `.omo/evidence/agent-sprite-gen-run.txt`,
  `.omo/evidence/dashboard-node-tests-final.txt`,
  `.omo/evidence/dashboard-tsc-final.txt`,
  `.omo/evidence/dashboard-vite-build-final.txt`, and
  `output/playwright/agent-character-stage-results.json`.

## Previous Batch

- Batch: `Office-preview character-first redesign guidance`
- Status: `complete`
- Date: 2026-06-27
- Scope: Produce implementation-ready redesign guidance for `#/office-preview`
  that de-emphasizes office staging, prioritizes distinct agent characters and
  diversified per-character motion, and preserves existing operator semantics,
  demo data shape, and no-new-runtime-deps constraints.
- Acceptance: guidance must define character-first principles, mode-by-mode UI
  intent, motion taxonomy, guardrails, success criteria, and binary QA
  scenarios for Focused, Floor Overview, and Classic.
- Verified: current implementation/design contract reviewed in `DESIGN.md`,
  `PixelOffice.tsx`, `OfficeStage.tsx`, `FocusedHandoffView.tsx`,
  `OfficeSidebar.tsx`, `AgentSprite.tsx`, and latest browser evidence under
  `output/playwright/sprite-gen-office-overhaul/`. Deliverables written to
  `DESIGN.md` and
  `docs/frontend/OFFICE_PREVIEW_CHARACTER_FIRST_REDESIGN.md`.

## Previous Batch

- Batch: `Sprite-gen office visual overhaul`
- Status: `complete`
- Date: 2026-06-27
- Scope: Install and use `aldegad/sprite-gen` as a local Codex skill to
  regenerate the dashboard office fixture atlas and floor tiles, then retune
  Classic/Overview office styling around the new signal-first pixel palette
  without adding runtime dependencies.
- Acceptance: `sprite-gen` must be installed locally; the office fixture sheet
  must preserve the existing 25-cell, 24px atlas contract; provenance must be
  testable; Focused remains workbench-dominant; Overview remains topology-first
  with dense room dressing hidden; Classic renders the revised office art
  without horizontal overflow.
- Verified: `sprite-gen` installed to
  `C:\Users\eomsh\.codex\skills\sprite-gen`; generator script ran the
  `unpack_atlas_run.py` imported-PNG path and `export_curated_pngs.py` curation
  export path for 25 fixture frames; targeted dashboard tests passed 17/17;
  full dashboard tests passed 145/145; dashboard production build passed;
  browser QA passed 6/6 scenarios for Focused 1220/1440, Floor Overview
  1440/1220, and Classic 1440/1220. Evidence:
  `output/playwright/sprite-gen-office-overhaul-results.json` plus screenshots
  under `output/playwright/sprite-gen-office-overhaul/`.

## Previous Batch

- Batch: `Ultrawork cleanup`
- Status: `complete`
- Date: 2026-06-14
- Scope: Remove evidence-backed stale files and generated/local artifacts
  without changing active Conitens behavior. Cleanup covered unused dashboard
  UI modules, one unreferenced command-center visual layer, tracked root
  screenshot artifacts, a tracked dashboard `tsconfig.tsbuildinfo`, duplicate
  local dependency/cache folders, old `.tmp` browser/screenshot artifacts, and
  ignored Playwright/Python cache output.
- Acceptance: deleted source symbols must have no active production
  references; dashboard tests/build must remain green; command-center cleanup
  must not introduce missing-symbol errors; high-risk runtime/projection
  surfaces such as `.notes/`, `.omx/`, `.conitens/runtime/`, and `.omo/evidence/`
  must be preserved, along with nested repositories under temp directories.
- Verified: baseline dashboard tests passed 144/144 before cleanup; post-cleanup
  dashboard tests passed 144/144; dashboard production build passed; deleted
  symbol grep found no active `AgentDetail`, `AgentStudio`, `ApprovalCenter`,
  `HandoffLink`, `KanbanBoard`, `OverviewDashboard`, `TaskDetailModal`,
  `ThreadBrowser`, `ThreadDetail`, `useWebSocket`, or
  `HierarchyDepthLODLayer` references; `git diff --check` passed.
  Command-center tests/build remain blocked by pre-existing unrelated failures
  in YAML agent parsing plus `src/main.tsx`/`src/office/RoomMonitor.ts`.

## Previous Batch

- Batch: `Office component reposition fix`
- Status: `complete`
- Date: 2026-06-14
- Scope: Correct the rejected Floor Overview result by moving the actual
  office/floor components. The prior OSS UX pass moved the preview shell and
  inspector rail but left `FloorViewport` internals unchanged; this pass
  changes shared room coordinates plus corridor/floorplate topology.
- Acceptance: real room DOM placements must show the new operator-chain
  arrangement in Floor Overview at 1440px and 1220px; the right-side offices
  must stack validation -> review -> research; Focused must remain the
  workbench-dominant surface; Classic must still render without Spatial Lens
  floor regressions at 1440px and 1220px.
- Verified: RED placement contract failed first on unchanged coordinates;
  targeted floor geometry/layout tests passed; full dashboard tests 144/144;
  dashboard production build passed; browser QA passed for Focused 1220/1440,
  Overview 1440/1220, and Classic 1440/1220. Evidence:
  `output/playwright/office-component-reposition-fix-results.json` plus
  screenshots under `output/playwright/office-component-reposition-fix/`.

## Previous Batch

- Batch: `Floor Overview OSS UX reposition`
- Status: `complete`
- Date: 2026-06-14
- Scope: Reposition Floor Overview as a map-first command center using OSS
  agent-management UX patterns: full floor map/canvas primary, adjacent
  overview inspector rail, run/task state in the same frame, and explicit
  lifecycle labels instead of position/color-only meaning.
- Acceptance: Floor Overview must expose a `floor-command-center` shell,
  keep the map wider than the inspector at 1440px and 1220px, avoid
  horizontal overflow, keep Focused as workbench-dominant, keep Classic
  isolated, and preserve stage tab accessibility.
- Verified: RED source contract failed first on missing `floor-command-center`;
  targeted tests 31/31; full dashboard tests 143/143; dashboard production
  build passed; browser QA passed for Focused 1220/1440, Floor Overview
  1440/1220, and Classic 1440. Evidence:
  `output/playwright/floor-overview-oss-ux-results.json` plus screenshots
  under `output/playwright/floor-overview-oss-ux/`.

## Previous Batch

- Review patch: `Focused workbench blocker fallback hardening`
- Status: `complete`
- Date: 2026-06-12
- Scope: Patch code-review findings in `focusedHandoffModel.ts` and
  `FocusedHandoffView.tsx`.
- Acceptance: the model must not invent a blocked owner gate when no task is
  actually blocked; blocked-age must start from block-opening events
  (`question.opened`, `approval.pending`, or `task.status_changed` to
  blocked), not arbitrary earlier task events.
- Verified: targeted `spatial-lens-pixel-grammar.test.mjs` 22/22,
  full dashboard tests 144/144, dashboard production build passed, repo
  structure post-write tracked graph cycles=0. `--include-untracked`
  post-write scan timed out twice because this workspace has large untracked
  directories; tracked graph plus real dashboard import/build covered the
  changed files.

- Batch: `Floor Overview declutter`
- Name: `Topology-first overview: mute interiors, keep signal`
- Status: `complete`
- Date: 2026-06-12
- Verified: tests 142/142 (141 + 1 new CSS-contract test), build pass,
  before/after browser evidence at
  `output/playwright/overview-declutter-results.json` — 6 dressing layers
  hidden, workstation/room-kit muted (opacity 0.5, saturate 0.55), floors
  calmed, 4 agent stations / 1 packet / 1 blocked marker at full strength.

### Problem

User feedback: Floor Overview is messy. Diagnosis from live capture: room
interior dressing (sticky notes, desk props) renders as sub-readable color
noise at 1x; the operator signal (handoff route, blocked marker, agents) is
visually drowned; bright room floors (Impl brown, Research/Validation white)
patchwork against the dark shell. FloorViewport now only ever renders in
Overview mode, so the 3x-era dressing density is pure noise at 1x.

### Approach (overview-only CSS, scoped under [data-viewport-mode="overview"])

1. Hide the decorative `RoomDressingLayer` content in overview.
2. Dim + desaturate `WorkstationLayer` and `RoomKitLayer` (texture, not
   noise) and calm room floor brightness.
3. Signal layers stay full strength (they are sibling layers of the room
   interiors): handoff route, blocked marker, packet, AgentLayer sprites,
   room plaques.
4. Lock the overview declutter CSS contract with a source-level test
   assertion. No data/template changes; dressing density tests untouched.

## Previous Batch

- Batch: `OSS agent-visualization research applied to Focused workbench`
- Name: `Blocked-age chip / semantic edges / event ticker`
- Status: `complete`
- Date: 2026-06-12
- Verified: tests 141/141 (139 baseline + 2 new), build pass, browser
  evidence at `output/playwright/ux-oss-workbench-upgrades-results.json`
  (blocked age chip `blocked 11m`, ticker
  `08:14:52 worker-1 artifact.written`, edges flow/held/held).

### Research → Design Decisions

Surveyed open-source agent visualization patterns:

- **Observability platforms** (Langfuse, AgentOps,
  disler/claude-code-hooks-multi-agent-observability): the universal pattern
  is timestamps + durations on every span — "how long has this been stuck"
  is a first-class operator signal. → **G1: blocked-age chip.** Derive how
  long the blocked gate has been waiting from the event log
  (`question.opened`/`approval.pending` for `q_184_owner_gate`), rendered on
  the blocked card and next-action row. Deterministic: age is computed
  relative to the latest event timestamp, never `Date.now()` (test- and
  replay-safe, consistent with I-2 replayability).
- **LangGraph Studio** (graph runtimes): edges carry runtime state; the
  active edge is highlighted. → **G2: semantic workbench edges.** Replace
  the ASCII `->` connectors with pixel-arrow connector elements exposing
  `data-workbench-edge` + edge state (`flow` for the active
  architect->sentinel handoff route, `held` for the edge blocked at the
  owner gate), with a subtle opacity pulse on the flowing edge (no
  fractional scale; pixel grammar preserved).
- **AI Town / ChatDev** (agent-world UIs) + Conitens' own event-first
  identity (I-1: `events/*.jsonl` is the protocol): the world surfaces the
  live event stream. → **G3: latest-event ticker** in the posture strip
  (`HH:MM:SS / actor / event.type`), sourced from the existing demo event
  log. This is event-log surface, not phase state, so it does not duplicate
  the workbench chain or the RECENT HANDOFFS rail (which lists handoffs).

### Implementation Scope (UI-only)

- `focusedHandoffModel.ts`: optional `events` input (default `[]`);
  derive `blockedAgeLabel`, `latestEventLabel`, and per-edge states;
  pure/deterministic.
- `OfficeStage.tsx` + `PixelOffice.tsx`: thread the existing `events` prop
  down to `FocusedHandoffView` (read-only, same pattern as task snapshots).
- `FocusedHandoffView.tsx`: render age chip, ticker, semantic edges.
- `spatial-lens.module.css`: edge/ticker/age-chip styles.
- `spatial-lens-pixel-grammar.test.mjs`: lock new model fields.
- All existing locked data hooks, class names, copy contracts unchanged.

## Previous Batch

- Batch: `Agent work-state vocabulary unification`
- Name: `Shared getAgentWorkState between workbench and sidebar rail`
- Status: `complete`
- Date: 2026-06-12

### Goal

Remove the conflicting status vocabulary between the Focused workbench and
the ACTIVE AGENTS sidebar rail: the workbench derived sentinel=REVIEW /
owner=BLOCKED while the rail printed raw runtime `resident.status`
(sentinel=running, owner=idle). AGENTS.md forbids duplicating conflicting
phase state across competing components.

### Changes

- `focusedHandoffModel.ts`: the private work-state derivation became an
  exported pure `getAgentWorkState(agentId, residents, tasks, handoffs)`
  taking a flat resident list; the workbench calls it with
  `rooms.flatMap((room) => room.residents)` (behavior unchanged).
- `OfficeSidebar.tsx`: rail badges now print the shared work state
  lowercased, badge tone reuses `getTaskTone` (consistent with TASK QUEUE
  chips), and the blocked dot derives from the same work state.
- `spatial-lens-pixel-grammar.test.mjs`: new regression test locks
  architect=RUNNING / sentinel=REVIEW / owner=BLOCKED from demo data and
  asserts the sidebar uses `getAgentWorkState(` and no longer prints
  `{resident.status}`.

### Verification

- Tests 139/139 (138 baseline + 1 new); build (tsc gate) passed.
- Browser at Focused 1440x900: rail badges architect=running(success),
  sentinel=review(info), owner=blocked(danger), worker-1=idle(neutral) —
  exactly matching workbench step states; `Owner approval required` still
  once; 1 workbench; no overflow.
- Evidence: `output/playwright/ux-state-vocabulary-results.json` and
  `output/playwright/ux-review-agent-rail-unified.png`.

## Previous Batch

- Batch: `Frontend GUI UX design review and improvement pass`
- Name: `Context thumb art / step card density / kicker dedupe`
- Status: `complete`
- Date: 2026-06-12

### Goal

Live-browser UX review of the office-preview GUI, then fix the three
highest-value issues found:

1. **Context thumbnail regression** — the Ops Control spatial-context thumb
   read as a broken white box: the generated room backdrop was suppressed
   (opacity 0.34 + heavy desaturation) while the white `prop.packet` sprite
   rendered at scale 2, centered, covering the 96x62 art box. Fixed by making
   the room art the protagonist (opacity 0.6, softened filter) and reducing
   the sprite to a scale-1 bottom-right corner accent.
2. **Step-card dead space** — workbench step cards were ~210px tall with
   ~60px empty middles (fixed min-heights 172/198px plus an internal 1fr
   spacer row). Removed both; cards now hug content at 142px (1440) / 129px
   (1220). Root min-height reduced to `clamp(380px, 34vw, 480px)` (1220
   override `clamp(340px, 38vw, 440px)`).
3. **Duplicated kicker** — the `Spatial Lens` kicker rendered in both the
   page header and the PixelOffice summary band 60px apart. Removed the band
   copy; the page-header instance is the single kicker.

### Verification

- `pnpm --filter @conitens/dashboard test` 138/138; build (tsc gate) passed.
- Browser: Focused 1440/1220 — card heights 142/129px, context strip top
  675/657px at scroll 0, kicker count 1, `Owner approval required` still
  exactly once, 1 workbench, 4 steps, nav 34px, no overflow. Overview keeps
  the floor map (zoom 1, 6 rooms); Classic mounts no Spatial Lens floor.
- Evidence: `output/playwright/ux-review-results.json` plus before/after
  screenshots `output/playwright/ux-review-*.png`.

## Previous Batch

- Batch: `Spatial Lens Focused Workbench polish pass`
- Name: `Workbench copy dedupe / chrome flatten / first-viewport fit`
- Status: `complete`
- Started: 2026-06-12
- Completed: 2026-06-12 — all three goals verified (tests 138/138, build
  pass, browser evidence at
  `output/playwright/spatial-lens-focused-polish-results.json`)

### Goal

Resolve the three documented Focused-mode caveats from LATEST_CONTEXT.md
without changing IA, canonical data, or test/browser contracts:

1. **Copy dedupe (G1)** — `Owner approval required` currently renders five
   times in one Focused screen (title h3, CTA link, blocked step meta,
   approve step detail, next-action row). Reduce to exactly one emphasized
   statement plus one action-verb CTA (`Open approvals`). The model contract
   (`nextActionLabel`, the literal string in `focusedHandoffModel.ts`) and
   browser visibility of `Owner approval required` must be preserved.
2. **Chrome flatten (G2)** — Focused stacks frame-in-frame chrome:
   `focused-workbench-root` (2px border + shadow) wraps
   `focused-workbench-main` (2px border + inset + shadow) wraps bordered step
   cards, bordered status items, bordered summary chip, bordered next-action
   box. Remove one full frame level (root becomes a borderless layout shell)
   and de-box the posture metrics so only meaningful objects carry borders.
3. **First-viewport fit (G3)** — spatial context thumbnails fall below the
   first 1220x900 viewport. Compress vertical density (root min-height clamp,
   paddings, gaps, step card height) so the context strip top edge is visible
   within 900px at 1220px width.

### Constraints (from tests + AGENTS.md)

- Keep all asserted data hooks: `data-focused-handoff-view`,
  `data-active-handoff-workbench`, `data-workbench-primary`,
  `data-workbench-phase-representation="single"`, `data-workbench-step-count`,
  `data-handoff-chain-task`, `data-next-operator-action`,
  `data-next-action-link="approvals"`, `data-focused-spatial-context="muted"`,
  the three `data-focused-view-layer` values, and `model.handoffSummaryLabel`
  usage in the view.
- Keep asserted CSS class names: `.focused-workbench-root`,
  `.focused-workbench-flow`, `.focused-workbench-handoff-summary`,
  `.focused-workbench-step[data-workbench-step="blocked"]`,
  `.focused-context-strip`.
- Four workbench steps, one workbench, no Focused floor map/minimap/phase
  rail, one nav row at 1220px, no horizontal overflow, no new dependencies.
- Visual/UI-only: no canonical runtime, `.notes`, `.agent`, provider,
  approval, bridge, scheduler, or task mutation surface changes.

### Verification Plan

- `pnpm.cmd --filter @conitens/dashboard test` (138 tests must pass).
- `pnpm.cmd --filter @conitens/dashboard build` (tsc gate).
- Playwright at `#/office-preview`: Focused 1440x900 and 1220x900 —
  `Owner approval required` text occurs exactly once in the workbench body,
  CTA reads `Open approvals`, context strip top `< 900px` at 1220x900,
  one nav row, no horizontal overflow; Overview/Classic unchanged.

## Previous Batch

- Batch: `Spatial Lens Focused Workbench IA redesign`
- Name: `Active Handoff Workbench`
- Status: `complete`

## Verification Refresh - 2026-06-11

- Dashboard tests passed: `pnpm.cmd --filter @conitens/dashboard test`
  reported 138 passing tests.
- Dashboard build passed: `pnpm.cmd --filter @conitens/dashboard build`.
- Browser verification passed for Focused 1440px, Focused 1220px, Overview
  1440px, and Classic 1440px.
- Focused verification confirmed one `FocusedHandoffView`, one active handoff
  workbench, no Focused floor map, no minimap, no phase rail, visible blocked
  task, visible next action, visible handoff summary, one nav row at 1220px,
  and no horizontal overflow.
- Evidence:
  `output/playwright/spatial-lens-verification-results.json`.

## Follow-Up Guidance Capture

- Added `Conitens UI Architecture Rules / Spatial Lens` to `AGENTS.md`.
- The fixed rule is that Focused mode is not Floor Overview: the Active
  Handoff Workbench is primary, the pixel floor map is secondary context,
  minimap stays out of Focused, duplicate phase/state surfaces are avoided,
  and the top nav must remain one row at 1220px.
- This was a documentation/agent-contract update only; the pending product/UI
  review patch plan is still not implemented until explicitly approved.

## Focused Workbench Goal

Implement the user-approved IA redesign so Focused mode is an operator
workbench, not a floor map with overlays. The user should be able to answer:
who is active, what task is blocked, who owns the next handoff, and what the
operator should do next in under three seconds.

## Focused Workbench Deliverables

- `OfficeStage` renders `FocusedHandoffView` for Focused mode and keeps
  `FloorViewport viewMode="overview"` only for Floor Overview.
- `focusedHandoffModel.ts` derives the active workbench model from existing
  `rooms`, `tasks`, and `handoffs`, preserving the demo chain
  `architect->sentinel->owner`.
- `FocusedHandoffWorkbench` renders one primary chain:
  `architect / PLAN / RUNNING` ->
  `q_184_owner_gate / BLOCKED / owner approval required` ->
  `sentinel / VALIDATE / REVIEW` -> `owner / APPROVE / BLOCKED`.
- The workbench includes one compact status header and an explicit next-action
  row linking `Owner approval required` to `#/approvals`.
- The blocked task card is the strongest workbench object and shows
  `verify_append handoff: architect -> sentinel`.
- Pixel-art identity is retained through a muted two-room
  `FocusedSpatialContextStrip` for Ops Control and Validation Office, not
  through the full floor map.
- Focused mode no longer mounts the route minimap, focused target edge,
  focused corridor continuity layer, old focused handoff rail, offscreen rail,
  or separate phase lane strip.
- `PixelOffice` owns `stageMode`, preserves
  `conitens.officeStageMode`, and compacts its Focused summary band.
- `OfficeSidebar` accepts a Focused mode prop and de-emphasizes rail content
  below the primary workbench.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, dependency, backend route, or task mutation
  surface changed.

## Focused Workbench Acceptance

- [x] Focused has exactly one primary object:
      `data-active-handoff-workbench="true"`.
- [x] Focused uses `FocusedHandoffView` as the Focused tab body.
- [x] Focused does not mount a full `data-spatial-lens-floor` or
      `data-viewport-mode="focused"` floor viewport.
- [x] Focused has 0 minimaps, 0 focused target edges, and 0 separate phase
      rails.
- [x] The workbench exposes `q_184_owner_gate`, `Owner approval required`,
      `verify_append handoff: architect -> sentinel`, `architect`,
      `sentinel`, `owner`, and four phase steps.
- [x] Floor Overview still mounts `FloorViewport viewMode="overview"`.
- [x] Classic still mounts no Spatial Lens floor.
- [x] Top nav remains one row at 1220px with no horizontal overflow.
- [x] Browser checks show no horizontal overflow at 1440px and 1220px.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Repo-structure post-write gate reports 0 cycles.
- [x] `.vibe/brain/precommit.py` was run; it failed on existing
      command-center typecheck baseline regressions outside this dashboard
      change.

## Focused Workbench Evidence

- `output/playwright/spatial-lens-focused-view-results.json`
- `output/playwright/spatial-lens-focused-view-focused-1440.png`
- `output/playwright/spatial-lens-focused-view-focused-1220.png`
- `output/playwright/spatial-lens-focused-view-overview-1440.png`
- `output/playwright/spatial-lens-focused-view-classic-1440.png`
- `packages/dashboard/.audit/repo-structure-lens/audit-summary.latest.md`

## Focused Workbench Remaining Gaps

- The workbench is still demo/projection-data driven and frontend-only.
- DAG topology, run trace, logs, and workspace evidence still belong in
  separate lens surfaces rather than in the Focused Spatial Lens view.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.16 focused handoff rail pass`
- Name: `Focused Handoff Rail`
- Status: `complete`

## Prompt 4.16 Summary

Prompt 4.16 added a central handoff rail, removed the focused minimap, and
made `q_184_owner_gate` / `owner-approval` more explicit, but Focused still
kept the full floor map as the dominant visual surface. The Focused Workbench
IA redesign supersedes that map-overlay hierarchy.

## Earlier Active Batch

- Batch: `Spatial Lens Prompt 4.14 visual polish pass`
- Name: `Sprite-gen Curated Office Kit`
- Status: `complete`

## Prompt 4.14 Goal

Use the `aldegad/sprite-gen` component-row / manifest / curation workflow as
the design reference for a small Spatial Lens office polish pass. Improve the
existing generated office designs by exposing curation metadata for generated
sprites and room backdrops, manifesting previously unused sheet frames, and
adding restrained curated office props without changing canonical runtime
truth.

## Prompt 4.14 Deliverables

- Added sprite-gen-style curation metadata to generated sprite and room
  backdrop manifest entries.
- Added runtime rects for `prop.auditTicket`, `prop.checkScanner`, and
  `character.ownerReviewing` from the existing project-owned generated sprite
  sheet.
- `GeneratedSprite` now exposes `data-generated-sprite-curation` plus
  curation offset CSS variables for manifest-sampled frames.
- `GeneratedRoomBackdropLayer` now exposes `data-generated-room-curation` and
  curation tile/anchor CSS variables.
- Each templated room now renders at least one curated room-kit sprite, raising
  the room-kit contract from 13 to 20 sprites across six rooms.
- Owner review / handoff-receiving state now uses the generated
  `character.ownerReviewing` frame.
- Spatial Lens CSS adds subtle curation-grid room material, generated sprite
  offset handling, and transparent-pixel drop shadows without skew,
  perspective, fractional scale, or new write surfaces.
- Generated asset, room dressing, and agent visual-state tests lock the new
  curation and sprite-frame contracts.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, new dependency, or task mutation surface changed.

## Prompt 4.14 Acceptance

- [x] Focused remains integer `3x` with camera stage transform
      `matrix(3, 0, 0, 3, 0, 0)`.
- [x] Focused renders 20 room-kit sprites, including 7 curated sprite-gen
      office props, and 3 component-row room backdrops.
- [x] Floor Overview remains integer `1x` topology mode and renders 0
      generated room backdrops.
- [x] Classic remains isolated with no Spatial Lens floor, 0 room-kit sprites,
      and 0 generated sprites.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.14 Evidence

- `output/playwright/spatial-lens-spritegen-results.json`
- `output/playwright/spatial-lens-spritegen-focused-1440.png`
- `output/playwright/spatial-lens-spritegen-focused-1220.png`
- `output/playwright/spatial-lens-spritegen-overview-1440.png`
- `output/playwright/spatial-lens-spritegen-classic-1440.png`
- `.omx/state/spatial-lens-spritegen/ralph-progress.json`
- `.audit/repo-structure-lens/audit-summary.latest.md`

## Prompt 4.14 Remaining Gaps

- The pass references sprite-gen architecture and uses the existing local
  generated sheet; it does not install sprite-gen as a runtime dependency.
- Generated room backdrops still cover only Ops Control and Validation Office.
  A larger pass should generate or slice exact-size room backdrops for all six
  room templates.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.13 visual polish pass`
- Name: `Focused Generated Room Backdrops`
- Status: `complete`

## Prompt 4.13 Goal

Move the Spatial Lens Focused camera closer to the generated room references by
using project-owned generated room backdrops as subtle room material for Ops
Control and the Validation receiving edge. Keep Floor Overview and Classic as
topology/debug modes, preserve integer camera zoom, and avoid canonical runtime
writes.

## Prompt 4.13 Deliverables

- Copied generated Ops Control and Validation Office room references into the
  dashboard public generated asset folder as room backdrop assets.
- Added `generatedRoomBackdrops.ts`, a bounded manifest for generated room
  backdrop usage, dimensions, opacity, and fitting metadata.
- Added `GeneratedRoomBackdropLayer`, a reusable backdrop renderer with stable
  `data-generated-room-backdrop*` hooks.
- `FloorViewport` now passes `showGeneratedBackdrops={isFocusedMode}` into
  `RoomZone`, so regular room backdrops render only in Focused mode.
- `FocusedRouteTargetEdge` now renders the Validation target-edge backdrop
  under its checkpoint props.
- Spatial Lens CSS blends the generated backdrops beneath existing room depth,
  room-kit, workstation, dressing, and operational layers.
- Generated asset and room dressing tests lock the public asset files,
  manifest contract, Focused-only wiring, and target-edge backdrop hook.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, or task mutation surface changed.

## Prompt 4.13 Acceptance

- [x] Focused remains integer `3x` with camera stage transform
      `matrix(3, 0, 0, 3, 0, 0)`.
- [x] Focused renders 3 generated room backdrops: Ops room, Validation room,
      and Validation target edge.
- [x] Floor Overview remains integer `1x` topology mode and renders 0 generated
      room backdrops.
- [x] Classic remains isolated with no Spatial Lens floor, no generated
      sprites, and 0 generated room backdrops.
- [x] Existing room-kit, route framing, packet slot, route guide, Validation
      checkpoint props, and target sentinel remain intact.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.13 Evidence

- `output/playwright/spatial-lens-prompt53-results.json`
- `output/playwright/spatial-lens-prompt53-focused-1440.png`
- `output/playwright/spatial-lens-prompt53-focused-1220.png`
- `output/playwright/spatial-lens-prompt53-overview-1440.png`
- `output/playwright/spatial-lens-prompt53-classic-1440.png`
- `.omx/state/spatial-lens-prompt53/ralph-progress.json`

## Prompt 4.13 Remaining Gaps

- The backdrops are blended into existing authored room rectangles rather than
  exact-size room art. A larger pass should generate or slice room backdrops
  that match the actual geometry.
- Only Ops Control and Validation Office have generated backdrop coverage in
  this slice.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.12 visual polish pass`
- Name: `Generated Room-Kit Signature Sprites`
- Status: `complete`

## Prompt 4.12 Goal

Make the authored pixel-office rooms feel more like generated room kits by
adding a reusable, generated-sprite signature layer for each templated room.
Keep the work visual-only, use the existing project-owned generated sprite
sheet, preserve integer camera modes, and avoid canonical runtime writes.

## Prompt 4.12 Deliverables

- Added `roomKit.ts`, a pure room-template to generated-sprite signature
  mapping.
- Added `RoomKitLayer`, rendered inside `RoomZone` after the depth layer and
  before wall/workstation/dressing/operational layers.
- Each templated room now renders at least two generated room-kit sprites:
  Ops Control gets command screens and an active packet; Validation gets
  red/green gate lights and a received packet; the other rooms get small
  role-specific generated prop signatures.
- Spatial Lens CSS adds a flat, hard-pixel room-kit layer with no skew,
  perspective, soft shadows, or fractional scale transforms.
- Room dressing tests lock room-kit counts, component hooks, generated sprite
  usage, and required room signature sprite ids.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.

## Prompt 4.12 Acceptance

- [x] Focused remains integer `3x` with camera stage transform
      `matrix(3, 0, 0, 3, 0, 0)`.
- [x] Focused renders 6 room-kit layers and 13 room-kit generated sprites.
- [x] Ops Control room-kit signatures are visible in the Focused 1440px and
      laptop-width camera crop.
- [x] Floor Overview remains integer `1x` topology mode and renders the same
      room-kit layer contract at overview scale.
- [x] Classic remains isolated with no Spatial Lens floor, no generated
      sprites, and 0 room-kit layers.
- [x] Existing room depth, route continuity, packet slot, route guide,
      Validation checkpoint props, and target sentinel remain intact.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.12 Evidence

- `output/playwright/spatial-lens-prompt52-results.json`
- `output/playwright/spatial-lens-prompt52-focused-1440.png`
- `output/playwright/spatial-lens-prompt52-focused-1220.png`
- `output/playwright/spatial-lens-prompt52-overview-1440.png`
- `output/playwright/spatial-lens-prompt52-classic-1440.png`
- `.omx/state/spatial-lens-prompt52/ralph-progress.json`

## Prompt 4.12 Remaining Gaps

- This pass reuses the existing generated sprite sheet and places signature
  props into authored templates. The next major Pixel Agents parity step is
  true generated room backdrops or a manually sliced generated room mockup.
- Further changes should avoid adding route markers, oversized labels, or more
  operator-shell compression.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.11 visual polish pass`
- Name: `Room Depth Accent Layer`
- Status: `complete`

## Prompt 4.11 Goal

Make the room templates feel more like authored pixel-office rooms rather than
flat prop boards by adding a reusable depth layer for wall base, work mat, and
foreground lip accents. Keep the change visual-only and preserve canonical
runtime data, Focused/Floor Overview/Classic behavior, and existing route
contracts.

## Prompt 4.11 Deliverables

- Added `RoomDepthLayer`, a theme-aware decorative layer rendered inside
  templated `RoomZone` floors.
- `RoomDepthLayer` renders four hard-pixel accents per templated room:
  `back-wall-shadow`, `baseboard`, `work-mat`, and `foreground-lip`.
- Spatial Lens CSS defines low-contrast room-depth accents with specific
  treatments for ops, validation, impl, commons, research, and review themes.
- Room dressing tests now lock that `RoomZone` renders the depth layer and
  that the CSS exposes ops/validation theme-specific depth styling.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.

## Prompt 4.11 Acceptance

- [x] Focused remains integer `3x` with camera stage transform
      `matrix(3, 0, 0, 3, 0, 0)`.
- [x] Focused renders 6 room depth layers and 24 room depth accents.
- [x] Floor Overview remains integer `1x` topology mode and renders the same
      six templated room depth layers at overview scale.
- [x] Classic remains isolated with no Spatial Lens floor, no generated
      sprites, and 0 room depth layers.
- [x] Existing focused route continuity, packet slot, route guide, Validation
      checkpoint props, and target sentinel remain intact.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.11 Evidence

- `output/playwright/spatial-lens-prompt51-results.json`
- `output/playwright/spatial-lens-prompt51-focused-1440.png`
- `output/playwright/spatial-lens-prompt51-focused-1220.png`
- `output/playwright/spatial-lens-prompt51-overview-1440.png`
- `output/playwright/spatial-lens-prompt51-classic-1440.png`
- `.omx/state/spatial-lens-prompt51/ralph-progress.json`

## Prompt 4.11 Remaining Gaps

- The rooms now have authored depth accents, but the largest remaining parity
  gap is still true generated room art or a richer authored room-kit pass.
- Further changes should avoid adding more route markers or shell compression.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.10 visual polish pass`
- Name: `Validation Checkpoint Room Polish`
- Status: `complete`

## Prompt 4.10 Goal

Make the focused Validation Office target edge read as an actual checkpoint
room, not a sparse target card, by adding authored generated-sprite props for
the receiving/review workflow. Keep the change visual-only and preserve
Focused/Floor Overview/Classic behavior.

## Prompt 4.10 Deliverables

- `FocusedRouteTargetEdge` now marks the target floor with
  `data-focused-validation-checkpoint="true"`.
- Added generated sprite props for `clipboardRack`, `routePort`,
  `stampDesk`, `documentStack`, `greenStatusLight`, and `redStatusLight`.
- Spatial Lens CSS positions the new checkpoint props as an in-world review
  cluster around the existing checklist board, inbox, packet, and sentinel.
- Pixel grammar tests now lock the focused target edge as a validation
  checkpoint with the new sprite/data-hook contract.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.

## Prompt 4.10 Acceptance

- [x] Focused remains integer `3x` with camera stage transform
      `matrix(3, 0, 0, 3, 0, 0)`.
- [x] Floor Overview remains integer `1x` topology mode with no focused target
      edge or validation checkpoint props.
- [x] Classic remains isolated with no Spatial Lens floor and no generated
      sprites.
- [x] Focused renders checkpoint props:
      `clipboard-rack`, `route-port`, `stamp-desk`, `document-stack`,
      `green-light`, and `red-light`.
- [x] Focused keeps route continuity tiles, 1 source route guide tile, packet
      slot, target route pixels, and target sentinel.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.10 Evidence

- `output/playwright/spatial-lens-prompt50-results.json`
- `output/playwright/spatial-lens-prompt50-focused-1440.png`
- `output/playwright/spatial-lens-prompt50-focused-1220.png`
- `output/playwright/spatial-lens-prompt50-overview-1440.png`
- `output/playwright/spatial-lens-prompt50-classic-1440.png`
- `.omx/state/spatial-lens-prompt50/ralph-progress.json`

## Prompt 4.10 Remaining Gaps

- The Validation target edge now reads as a checkpoint room, but it is still an
  authored focused overlay rather than a fully generated room asset.
- The next best visual improvement is a larger generated-room/asset pass for
  richer room art, not additional dashboard shell compression.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.9 visual polish pass`
- Name: `Viewport-Dominant Operator Shell`
- Status: `complete`

## Prompt 4.9 Goal

Make the Spatial Lens page feel more like a live pixel office by reducing the
vertical dominance of the operator summary shell, especially at laptop width,
without changing runtime data, canonical state, view modes, inspector behavior,
or the Focused/Floor Overview/Classic contracts.

## Prompt 4.9 Deliverables

- `PixelOffice` now exposes
  `data-office-preview-shell="viewport-dominant"` as a stable layout contract.
- `office.module.css` uses that hook to compact the summary band, metric
  sizing, focus line, and 1220px responsive layout so the pixel office starts
  higher in the viewport.
- At laptop width, the summary band stays two-column instead of stacking
  vertically, and the secondary summary sentence is hidden to preserve the
  main working surface.
- Added `office-preview-shell.test.mjs` to lock the viewport-dominant shell
  hook and laptop-width summary behavior.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.

## Prompt 4.9 Acceptance

- [x] Focused remains integer `3x` with camera stage transform
      `matrix(3, 0, 0, 3, 0, 0)`.
- [x] Floor Overview remains integer `1x`, labeled `1x Floor Overview`.
- [x] Classic remains isolated with no Spatial Lens floor.
- [x] Office shell reports `data-office-preview-shell="viewport-dominant"`.
- [x] Laptop-width Focused floor starts higher than Prompt 4.8
      (`y=362` vs previous `y=430`).
- [x] Focused keeps route continuity tiles, 1 source route guide tile, compact
      route minimap, packet slot, target edge, and compact offscreen rail.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.9 Evidence

- `output/playwright/spatial-lens-prompt49-results.json`
- `output/playwright/spatial-lens-prompt49-focused-1440.png`
- `output/playwright/spatial-lens-prompt49-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt49-focused-1220.png`
- `output/playwright/spatial-lens-prompt49-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt49-overview-1440.png`
- `output/playwright/spatial-lens-prompt49-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt49-classic-1440.png`
- `.omx/state/spatial-lens-prompt49/ralph-progress.json`

## Prompt 4.9 Remaining Gaps

- The office scene now dominates more of the page, so further shell
  compression is not the best next move unless navigation itself is redesigned.
- Further Pixel Agents parity should move to generated room assets, richer
  prop/character art, or fuller authored Validation room continuity.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.8 visual polish pass`
- Name: `Focused Corridor Continuity Floor Tiles`
- Status: `complete`

## Prompt 4.8 Goal

Improve the remaining Ops-to-Validation visual separation by adding subtle,
authored floor continuity inside the Focused live camera. The layer should
read as office floor material, not a new route marker, and should stay absent
from Floor Overview and Classic.

## Prompt 4.8 Deliverables

- Added `FocusedCorridorContinuityLayer`, a visual-only Focused layer that
  derives three floor tiles from the existing handoff route door points:
  `source-apron`, `spine-runner`, and `target-apron`.
- `FloorViewport` renders the continuity layer only when `isFocusedMode` is
  true, preserving Floor Overview topology and Classic fallback behavior.
- Spatial Lens CSS adds low-contrast hard-pixel continuity tile styling below
  rooms and below route overlays, so the treatment reads as corridor material
  rather than dashboard chrome.
- Pixel grammar coverage locks the layer as floor tiles and asserts it does
  not add extra `data-handoff-route-guide` markers.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.

## Prompt 4.8 Acceptance

- [x] Focused remains integer `3x` with camera stage transform
      `matrix(3, 0, 0, 3, 0, 0)`.
- [x] Floor Overview remains integer `1x`, labeled `1x Floor Overview`, and
      does not render continuity tiles.
- [x] Classic remains isolated with no Spatial Lens floor and no continuity
      tiles.
- [x] Focused renders exactly three continuity floor tiles:
      `source-apron`, `spine-runner`, `target-apron`.
- [x] Focused still reports route framing `source-corridor-target-edge`.
- [x] Route guide density remains 1 source-side guide tile.
- [x] Handoff route still renders 1 physical packet slot and 1 handoff packet
      parented by that slot.
- [x] Validation target edge still reports `corridor-connected` with 3 target
      route pixels and target agent `sentinel`.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.8 Evidence

- `output/playwright/spatial-lens-prompt48-results.json`
- `output/playwright/spatial-lens-prompt48-focused-1440.png`
- `output/playwright/spatial-lens-prompt48-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt48-focused-1220.png`
- `output/playwright/spatial-lens-prompt48-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt48-overview-1440.png`
- `output/playwright/spatial-lens-prompt48-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt48-classic-1440.png`
- `.omx/state/spatial-lens-prompt48/ralph-progress.json`

## Prompt 4.8 Remaining Gaps

- The Focused camera now has better floor continuity, but the whole office is
  still assembled from authored topology and sprite grammar rather than a
  single generated-room background.
- Further Pixel Agents parity should focus on generated room art or a richer
  authored floorplate model, not additional route markers or awareness
  overlays.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.7 visual polish pass`
- Name: `Offscreen Awareness Rail Restraint`
- Status: `complete`

## Prompt 4.7 Goal

Reduce the remaining offscreen-worker awareness card in Focused VIEWPORT so it
reads as a compact pixel roster tab instead of a dashboard card sitting inside
the live office camera, while preserving read-only awareness, selection, route,
minimap, and Classic/Overview behavior.

## Prompt 4.7 Deliverables

- `AgentOffscreenRail` now exposes
  `data-agent-offscreen-treatment="compact-tab"` for explicit browser and
  regression checks.
- Offscreen awareness styling is reduced to a transparent 112px rail with a
  26px-min compact row, smaller sprite frame, muted secondary text, and no rail
  panel background/border/shadow.
- `HandoffOverlay` route guide code was simplified to the accepted final
  contract: one source-side horizontal guide tile only.
- `FocusedRouteTargetEdge` now exposes stable browser hooks for the target
  agent and three route pixels, and `FloorViewport` exposes
  `data-camera-stage="floor"` so camera scale verification does not depend on
  generated class names.
- Pixel grammar tests now lock compact offscreen awareness, target-edge hooks,
  route guide restraint, route minimap restraint, and integer camera scale.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.

## Prompt 4.7 Acceptance

- [x] Focused remains integer `3x` with camera stage transform
      `matrix(3, 0, 0, 3, 0, 0)`.
- [x] Floor Overview remains integer `1x` and labeled
      `1x Floor Overview`.
- [x] Classic remains isolated with no Spatial Lens floor.
- [x] Focused offscreen rail remains available for `worker-1` but is reduced
      to `112px` wide, transparent rail, `26px` min-height card.
- [x] Focused route guide remains restrained to 1 source-side horizontal tile.
- [x] Focused still reports route framing `source-corridor-target-edge`.
- [x] Validation target edge still reports `corridor-connected` with 3 target
      route pixels and target agent `sentinel`.
- [x] Handoff route still renders 1 physical packet slot and 1 handoff packet
      parented by that slot.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.7 Evidence

- `output/playwright/spatial-lens-prompt47-results.json`
- `output/playwright/spatial-lens-prompt47-focused-1440.png`
- `output/playwright/spatial-lens-prompt47-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt47-focused-1220.png`
- `output/playwright/spatial-lens-prompt47-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt47-overview-1440.png`
- `output/playwright/spatial-lens-prompt47-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt47-classic-1440.png`
- `.omx/state/spatial-lens-prompt47/ralph-progress.json`

## Prompt 4.7 Remaining Gaps

- Focused now reads as a live pixel office camera, but the room/corridor
  continuity is still authored topology rather than one unified generated
  background.
- Further improvements should move to authored topology or generated-room
  continuity, not additional route markers or larger awareness overlays.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.6 visual polish pass`
- Name: `Corridor Route Storytelling Restraint`
- Status: `complete`

## Prompt 4.6 Goal

Improve the remaining wide Ops-to-Validation corridor span with a minimal
in-world route cue, without adding larger overlays, changing canonical route
data, increasing Ops clutter, or weakening the Prompt 4.5 packet/minimap
contracts.

## Prompt 4.6 Deliverables

- `HandoffOverlay` now derives corridor guide tiles from existing route
  points without mutating the floor model or canonical runtime state.
- The final guide treatment is intentionally restrained: one source-side
  horizontal `data-handoff-route-guide` tile in Focused/Overview.
- CSS adds hard-pixel `.handoff-route-guide-tile` styling with no perspective,
  no skew, no fractional scale, and no soft shadow.
- Pixel grammar coverage now locks that route guide tiles exist as a
  storytelling layer while keeping integer scale coverage.
- Prompt 4.5 contracts remain intact: `Route Minimap` stays compact,
  handoff packet remains parented by `data-handoff-packet-slot`, Focused stays
  `3x`, Floor Overview stays `1x`, and Classic mounts no Spatial Lens floor.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.

## Prompt 4.6 Acceptance

- [x] Focused remains integer `3x`.
- [x] Floor Overview remains integer `1x`.
- [x] Classic remains isolated with no Spatial Lens floor.
- [x] Focused route guide tiles are restrained to 1 source-side tile.
- [x] Focused still reports route framing `source-corridor-target-edge`.
- [x] Validation target edge still reports `corridor-connected`.
- [x] Handoff route still renders exactly 1 packet and 1 packet slot.
- [x] Route minimap remains `104px x 64px`.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.6 Evidence

- `output/playwright/spatial-lens-prompt46-results.json`
- `output/playwright/spatial-lens-prompt46-focused-1440.png`
- `output/playwright/spatial-lens-prompt46-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt46-focused-1220.png`
- `output/playwright/spatial-lens-prompt46-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt46-overview-1440.png`
- `output/playwright/spatial-lens-prompt46-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt46-classic-1440.png`
- `.omx/state/spatial-lens-prompt46/ralph-progress.json`

## Prompt 4.6 Remaining Gaps

- The wide corridor span is now lightly annotated, but not structurally solved.
  A deeper solution would need authored floor topology or generated room art,
  not more route markers.
- Stop incremental route-marker additions unless a new visual reference calls
  for them.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.5 visual polish pass`
- Name: `Route Minimap Restraint and In-world Packet Slot`
- Status: `complete`

## Prompt 4.5 Goal

Make the Focused VIEWPORT route support feel less like dashboard chrome and
more like part of the pixel office world by reducing the route minimap's
visual dominance and anchoring the moving handoff packet to a physical floor
slot, while preserving the existing read-only camera/mode contract.

## Prompt 4.5 Deliverables

- `SceneDockOverlay` now exposes `data-scene-dock-role`, and `MinimapDock`
  labels the route helper as `Route Minimap` instead of `Route Dock`.
- Focused route minimap styling is smaller and lower contrast:
  `104px x 64px`, 1px border, muted label, and subdued room status colors.
- `HandoffOverlay` now renders the generated packet sprite inside a
  `data-handoff-packet-slot` wrapper so the route packet reads as an
  in-world object sitting on a floor dock.
- Spatial Lens pixel grammar coverage now locks the packet-slot contract,
  compact route minimap contract, and integer CSS scale transforms.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.

## Prompt 4.5 Acceptance

- [x] Focused remains integer `3x`.
- [x] Floor Overview remains integer `1x`.
- [x] Classic remains isolated with no Spatial Lens floor.
- [x] Focused route minimap is visually secondary and reports
      `104px x 64px`.
- [x] Handoff route renders exactly one packet and one packet slot; the packet
      is parented by the physical slot wrapper.
- [x] Focused still reports route framing `source-corridor-target-edge`.
- [x] Validation target edge still reports `corridor-connected`.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.5 Evidence

- `output/playwright/spatial-lens-prompt45-results.json`
- `output/playwright/spatial-lens-prompt45-focused-1440.png`
- `output/playwright/spatial-lens-prompt45-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt45-focused-1220.png`
- `output/playwright/spatial-lens-prompt45-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt45-overview-1440.png`
- `output/playwright/spatial-lens-prompt45-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt45-classic-1440.png`
- `.omx/state/spatial-lens-prompt45/ralph-progress.json`

## Prompt 4.5 Remaining Gaps

- The current topology still leaves a wide dark corridor span between Ops
  Control and Validation at `3x`; this is accepted while the canonical room
  layout remains unchanged.
- The Validation receiving edge is now connected and readable, but still an
  authored edge panel rather than a fully continuous room interior.
- Any next visual slice should polish corridor storytelling only with
  world-authored details, not bigger overlays or more Ops clutter.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.4 visual polish pass`
- Name: `Ops Walk-path and Validation Threshold Polish`
- Status: `complete`

## Prompt 4.4 Goal

Make the default Focused VIEWPORT feel less cluttered and more like a readable
live pixel office camera by reducing Ops Control prop density, exposing a
clearer Ops walk path, and making the Validation receiving edge/actor more
integrated with the corridor.

## Prompt 4.4 Deliverables

- `RoomZone` now exposes `data-room-floor-id` on the room floor so VIEWPORT
  CSS can target room-specific floor treatments without changing canonical
  data.
- Ops Control room dressing now removes the third console cluster and several
  duplicate visual-noise props while preserving authored agent slots and
  operational affordances.
- Ops Control gets a subtle hard-pixel walk lane on the room floor.
- The Focused Validation target corridor connector is wider and the threshold
  bridge extends further into the receiving edge.
- The target-edge packet/inbox are pulled toward the threshold, and sentinel
  renders at integer `2x` inside the target edge so the receiving actor is
  readable without browser zoom.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.

## Prompt 4.4 Acceptance

- [x] Focused remains integer `3x`.
- [x] Floor Overview remains integer `1x`.
- [x] Classic remains isolated with no Spatial Lens floor.
- [x] Ops Control prop count is reduced from Prompt 4.3's 44 to 29.
- [x] Ops Control workstation prop count is reduced from 18 to 12.
- [x] Focused still reports route framing `source-corridor-target-edge`.
- [x] Validation target edge still reports `corridor-connected`.
- [x] Target sentinel is readable at integer `2x`.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict remains above the 90 threshold.

## Prompt 4.4 Evidence

- `output/playwright/spatial-lens-prompt44-results.json`
- `output/playwright/spatial-lens-prompt44-focused-1440.png`
- `output/playwright/spatial-lens-prompt44-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt44-focused-1220.png`
- `output/playwright/spatial-lens-prompt44-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt44-overview-1440.png`
- `output/playwright/spatial-lens-prompt44-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt44-classic-1440.png`
- `.omx/state/spatial-lens-prompt44/ralph-progress.json`

## Prompt 4.4 Remaining Gaps

- The current topology still leaves a large dark corridor span between Ops
  Control and Validation at `3x`. This is an accepted tradeoff for preserving
  readable Ops scale.
- The next visual step should focus on route-object state or route dock
  restraint rather than adding more props.

## Next Candidate

Optional visual polish slice: reduce route dock dominance or make the handoff
packet state feel more in-world without changing canonical data.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.3 cleanup/review pass`
- Name: `Focused Route Code Cleanup and Visual Regression Check`
- Status: `complete`

## Prompt 4.3 Goal

Run a behavior-preserving cleanup pass over the recent Focused route
composition code, lock the current visual contract with tests/browser evidence,
and avoid new composition, CSS, canonical data, or mutation changes.

## Prompt 4.3 Deliverables

- `FocusedRouteTargetEdge.tsx` now derives target resident visual context once
  and renders the three target route pixels from a stable local step list.
- `FloorViewport.tsx` now centralizes `focused` / `overview` mode checks and
  focused route framing derivation before JSX.
- Prompt 4.2 visual behavior is preserved: Focused stays `3x`, Floor Overview
  stays `1x`, Classic mounts no Spatial Lens floor, and the Ops ->
  Validation route framing remains `source-corridor-target-edge`.
- No CSS/layout scale values, canonical runtime truth, `.notes`, `.agent`,
  provider, approval, bridge, scheduler, external fetch, asset download, or
  task mutation surface changed.

## Prompt 4.3 Acceptance

- [x] Cleanup scope stayed limited to Focused route composition code.
- [x] Behavior was locked with targeted Spatial Lens tests before edits.
- [x] Targeted Spatial Lens tests still pass after cleanup.
- [x] Full dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Focused browser evidence still reports `cameraZoom: "3"`,
      `focusedRoomId: "ops-control"`, `targetRoomId: "validation-office"`,
      route framing `source-corridor-target-edge`, target continuity
      `corridor-connected`, 3 target route pixels, 1 blocked marker, 4 agent
      stations, and 0 floor canvases.
- [x] Visual verdict remains at the pass threshold, 90/100.

## Prompt 4.3 Evidence

- `output/playwright/spatial-lens-prompt43-results.json`
- `output/playwright/spatial-lens-prompt43-focused-1440.png`
- `output/playwright/spatial-lens-prompt43-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt43-focused-1220.png`
- `output/playwright/spatial-lens-prompt43-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt43-overview-1440.png`
- `output/playwright/spatial-lens-prompt43-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt43-classic-1440.png`
- `.omx/state/spatial-lens-prompt43/ralph-progress.json`

## Prompt 4.3 Remaining Gaps

- This was a cleanup-only pass, so Ops Control density and Validation edge
  composition remain intentionally unchanged.
- If the next slice is visual, keep it separate and focus on Ops Control
  walk-path clarity plus a more integrated Validation threshold.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.2 target-edge continuity pass`
- Name: `Connected Receiving Edge and Quieter Handoff Route`
- Status: `complete`

## Prompt 4.2 Goal

Make the Prompt 4.1 Validation receiving edge feel physically connected to the
Focused route camera rather than like a detached inset, restore Ops Control
identity inside the route-side crop, and reduce route-line dominance while
preserving the `3x` Focused / `1x` Floor Overview / Classic contract.

## Prompt 4.2 Deliverables

- `FocusedRouteTargetEdge` now exposes
  `data-edge-continuity="corridor-connected"`.
- The receiving edge now includes a corridor connector tile and three in-world
  route pixels leading into the Validation threshold.
- `FloorViewport` renders a small in-world source plaque for the focused room,
  restoring `Ops Control` identity inside the cropped route-side camera.
- Focused handoff route segments are quieter: browser computed style reports
  opacity `0.42` and route height `2px`, while Floor Overview keeps the
  stronger topology route style at opacity `0.86` and height `4px`.
- Focused keeps the target-room sentinel inside the receiving edge and keeps
  `worker-1` as the only default offscreen rail entry.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, task mutation, external fetch, or asset download was introduced.

## Prompt 4.2 Acceptance

- [x] Focused remains integer `3x`.
- [x] Floor Overview remains integer `1x` topology.
- [x] Classic remains isolated with no Spatial Lens floor.
- [x] Focused includes source plaque `Ops Control`.
- [x] Validation target edge reports `corridor-connected` continuity and
      renders three route pixels.
- [x] Focused route line is visually reduced compared with Floor Overview.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Visual verdict reaches the 90 threshold.

## Prompt 4.2 Evidence

- `output/playwright/spatial-lens-prompt42-results.json`
- `output/playwright/spatial-lens-prompt42-focused-1440.png`
- `output/playwright/spatial-lens-prompt42-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt42-focused-1220.png`
- `output/playwright/spatial-lens-prompt42-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt42-overview-1440.png`
- `output/playwright/spatial-lens-prompt42-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt42-classic-1440.png`
- `.omx/state/spatial-lens-prompt42/ralph-progress.json`

## Prompt 4.2 Remaining Gaps

- Validation is still represented as a receiving edge, not a full room in the
  main `3x` camera. This is an intentional compromise that preserves readable
  Ops scale.
- Ops Control and Validation room templates remain dense. Future visual work
  should simplify existing clusters rather than add props.
- Further route storytelling should be object/state-led, not line-led.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4.1 route composition pass`
- Name: `Focused Route Camera and Target Edge`
- Status: `complete`

## Prompt 4.1 Goal

Move the default Focused VIEWPORT closer to a Pixel Agents-style live office
camera by framing the Ops Control source, corridor, and Validation receiving
edge together while preserving Floor Overview as the explicit `1x` topology
mode and Classic as fallback.

## Prompt 4.1 Deliverables

- `viewportCamera.ts` now pulls the Focused `3x` camera toward the connected
  handoff route when a target room exists.
- Focused scene bounds now describe the actual visible camera window:
  `15.833,1.833,33.333,33.333` for the default Ops -> Validation route.
- Added `FocusedRouteTargetEdge`, an in-world Validation receiving edge with
  checklist board, inbox tray, packet, and sentinel sprite selection.
- `AgentOffscreenRail` now excludes the target room so sentinel appears in the
  receiving edge instead of a list-like offscreen card.
- Floor Overview now exposes `data-overview-role="topology"` and labels itself
  `1x Floor Overview` / `topology map`.
- Focused exposes `data-focused-route-framing="source-corridor-target-edge"`.
- Focused camera remains integer `3x`; Floor Overview remains integer `1x`;
  Classic remains separate.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, task mutation, external fetch, or asset download was introduced.

## Prompt 4.1 Acceptance

- [x] Focused remains the default live camera at `3x`.
- [x] Focused default room remains `ops-control`.
- [x] Focused route framing includes the central corridor edge and a visible
      Validation receiving edge.
- [x] Target edge renders sentinel and a packet/inbox/checklist cluster.
- [x] Offscreen rail no longer duplicates the target-room sentinel and only
      shows non-focused, non-target agents.
- [x] Floor Overview remains `1x`, all-room topology, and visibly labeled as
      topology.
- [x] Classic remains available and mounts no Spatial Lens floor.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Browser checks show no console/page errors and no horizontal overflow at
      1440px and laptop width.

## Prompt 4.1 Evidence

- `output/playwright/spatial-lens-prompt41-results.json`
- `output/playwright/spatial-lens-prompt41-focused-1440.png`
- `output/playwright/spatial-lens-prompt41-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt41-focused-1220.png`
- `output/playwright/spatial-lens-prompt41-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt41-overview-1440.png`
- `output/playwright/spatial-lens-prompt41-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt41-classic-1440.png`
- `.omx/state/spatial-lens-prompt41/ralph-progress.json`

## Prompt 4.1 Remaining Gaps

- Visual verdict is 87/100, still below the 90 threshold.
- Validation edge is much clearer than the old offscreen rail, but it still
  reads partly like a framed receiving edge rather than a fully continuous
  room connected to the corridor.
- The route-side camera crop improves handoff composition but loses some of
  the full Ops Control room identity.
- A future pass should reduce route-line dominance and make outbox, packet,
  inbox, and sentinel carry more of the handoff story.

## Next Candidate

Prompt 4.2: target-edge continuity and route storytelling. Keep the current
`3x` / `1x` mode contract, but make the Validation receiving edge feel more
physically connected to the corridor and restore a small in-world Ops identity
cue in the cropped route-side camera.

## Previous Active Batch

- Batch: `Spatial Lens current visual audit`
- Name: `Visual Reference Audit and Next Slice Selection`
- Status: `complete`

## Visual Audit Goal

Inspect the active Spatial Lens `#/office-preview` route and document the
current Focused, Floor Overview, Classic, component ownership, data ownership,
visual gaps, and next implementation priorities without modifying production
code.

## Visual Audit Deliverables

- Added `docs/design/spatial-lens-current-visual-audit.md`.
- Recorded current component tree from `App -> PixelOffice -> OfficeStage ->
  FloorViewport` and the Classic fallback branch.
- Identified the files owning Focused, Floor Overview, Classic, camera,
  room/corridor geometry, room dressing, handoff rendering, agent rendering,
  and right inspector selection.
- Separated visual gaps from data/runtime issues.
- Recorded package validation commands from `packages/dashboard/package.json`.
- Preserved the existing canonical runtime truth and introduced no production
  code edits, asset downloads, or write actions.

## Visual Audit Acceptance

- [x] Audit markdown exists under `docs/design/`.
- [x] Audit references actual repo paths and browser evidence paths.
- [x] Audit separates visual issues from data/runtime issues.
- [x] Audit answers whether agents are agent-first, handoff is in-world, and
      room/corridor layout is data-driven.
- [x] Audit lists the next five implementation tasks.
- [x] Audit records exact dashboard package commands and notes the missing
      lint script.

## Visual Audit Evidence

- `docs/design/spatial-lens-current-visual-audit.md`
- `output/playwright/spatial-lens-current-audit-results.json`
- `output/playwright/spatial-lens-current-audit-focused-1440.png`
- `output/playwright/spatial-lens-current-audit-focused-1440-floor.png`
- `output/playwright/spatial-lens-current-audit-overview-1440.png`
- `output/playwright/spatial-lens-current-audit-overview-1440-floor.png`
- `output/playwright/spatial-lens-current-audit-classic-1440.png`
- `output/playwright/spatial-lens-current-audit-focused-1220.png`

## Next Candidate

Prompt 4.1 / Use Case B: Focused route-composition plus Floor Overview
stabilization. Keep `3x` Focused and `1x` Overview, keep Classic available,
and frame the Ops Control source, corridor, and Validation receiving edge more
convincingly before additional refactors.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 4 agent-first live activity pass`
- Name: `AgentSprite Stations and Live Activity Cues`
- Status: `complete`

## Prompt 4 Goal

Make Focused VIEWPORT agent-first by replacing the legacy room-local canvas
avatars with generated sprite-sheet-backed pixel characters, authored agent
stations, state/cue mapping, and offscreen awareness. This pass is read-only
UI rendering only; no canonical state, `.notes`, `.agent`, provider, approval,
bridge, scheduler, or task mutation surfaces are changed.

## Prompt 4 Deliverables

- Added `viewport/agentStations.ts` with authored station specs derived from
  room templates rather than random placement.
- Added `viewport/agentVisualState.ts` pure utilities:
  `mapAgentToVisualRole`, `mapAgentToVisualState`, `mapAgentToStation`,
  `mapTaskToActivityCue`, `mapHandoffToActivityCue`, and
  `chooseAgentActivityCue`.
- Added `AgentLayer`, `AgentStation`, `AgentSprite`, `AgentActivityCue`,
  `AgentSpeechBubble`, and `AgentOffscreenRail`.
- `FloorViewport` now renders generated character sprites in the shared floor
  camera coordinate system and exposes diagnostics such as
  `data-agent-station-id`, `data-agent-visual-state`, `data-agent-cue`, and
  `data-agent-selected`.
- `RoomZone` no longer renders the Spatial Lens `OfficeAvatar` canvas layer;
  room overflow/awaiting markers remain passive.
- `PixelOffice -> OfficeStage -> FloorViewport` now passes task snapshots
  read-only so agent states can distinguish active, blocked, review, assigned,
  and handoff cues.
- Focused mode shows architect and owner as large in-room characters at Ops
  stations; sentinel and worker remain available through the offscreen rail
  when outside the current 3x camera.
- Decorative sprite/cue internals ignore pointer events so station buttons are
  the stable interaction target. Pointer down/up/click select the resident for
  the existing inspector state.

## Prompt 4 Acceptance

- [x] Architect appears in Ops Control at `ops-control.architect-seat` as
      `character.architectWorking` with an `active` cue.
- [x] Owner appears in Ops Control at `ops-control.floor-lead-seat` as a
      blocked owner sprite with a red `blocked` cue.
- [x] Sentinel maps to Validation Office reviewer state and appears in the
      focused offscreen rail with a `handoff_receive` cue when outside camera.
- [x] Worker-1 maps to Impl Office with an `assigned` cue and focused
      offscreen indicator.
- [x] Focused camera remains integer `3x`; Floor Overview remains `1x`;
      CLASSIC remains available.
- [x] Spatial Lens floor contains zero legacy avatar canvases.
- [x] Agent click selection updates the existing selected resident state.
- [x] Dashboard tests and production build pass.
- [x] Browser checks show no console/page errors or horizontal overflow.

## Prompt 4 Evidence

- `packages/dashboard/tests/spatial-lens-agent-visual-state.test.mjs`
- `output/playwright/spatial-lens-agent-pass-results.json`
- `output/playwright/spatial-lens-agent-pass-focused-1440.png`
- `output/playwright/spatial-lens-agent-pass-focused-1440-floor.png`
- `output/playwright/spatial-lens-agent-pass-focused-1220.png`
- `output/playwright/spatial-lens-agent-pass-focused-1220-floor.png`
- `output/playwright/spatial-lens-agent-pass-overview-1440.png`
- `output/playwright/spatial-lens-agent-pass-overview-1440-floor.png`
- `output/playwright/spatial-lens-agent-pass-classic-1440.png`
- `.omx/state/spatial-lens-agent-pass/ralph-progress.json`

## Prompt 4 Remaining Gaps

- Visual verdict is 84/100, still below the 90 threshold.
- Validation Office is represented through the offscreen rail in Focused
  rather than being framed inside the main camera alongside Ops Control.
- Ops Control remains prop-dense around the visible work path. Future passes
  should trim or cluster existing props before adding new assets.
- The offscreen rail is functional but less authored than the generated target
  mockup's room-aware rail/minimap treatment.

## Next Candidate

Prompt 4.1: Focused composition refinement. Keep `3x` integer scale and the
new agent layer, but tune camera bounds and room/rail composition so Ops
Control, the corridor, and the Validation receiving edge can coexist without
returning to a minimap feel.

## Previous Active Batch

- Batch: `Spatial Lens Prompt 3.10 focused composition pass`
- Name: `Focused Camera, Scene Dock, and Shell Balance`
- Status: `complete`

## Prompt 3.10 Goal

Make Focused VIEWPORT feel like the primary live pixel office camera instead
of a cropped floor overview inside a dashboard panel. This pass is camera,
composition, dock, and shell integration only; AgentSprite work remains Prompt
4.

## Prompt 3.10 Deliverables

- `viewportCamera.ts` now defines focused camera contracts:
  `CameraSceneBounds`, `FocusedViewportFrame`, and `FocusedCamera`.
- Focused camera keeps integer zoom `3x`, defaults to Ops Control, and biases
  toward a handoff-connected target room. The default Ops route exposes
  `validation-office` as `data-camera-target-room-id`.
- `FloorViewport` now passes handoff routes to the camera and exposes camera
  target/bounds diagnostics.
- New `SceneDockOverlay` and `MinimapDock` deliberately dock the minimap in
  the upper camera frame area rather than over room props.
- Focused viewport height increased to a dominant scene surface:
  1440px browser capture measured 750px tall; laptop capture measured 720px.
- Focused mode local chrome is reduced: `Live camera` label, compact mode
  toggle, and hidden secondary map pills.
- Floor Overview and CLASSIC remain available and distinct.
- Right inspector visual weight was reduced through a 280px desktop rail and
  tighter spacing.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, or task mutation surfaces were changed.

## Prompt 3.10 Acceptance

- [x] Empty black area below the focused scene is materially reduced.
- [x] Focused viewport is larger and visually dominant in the Spatial Lens
      section.
- [x] Ops Control remains the default focused room.
- [x] Camera uses integer `3x`; Floor Overview uses integer `1x`.
- [x] Focused exposes adjacent corridor intentionally and records the handoff
      target in diagnostics.
- [x] Minimap is docked and does not overlap Ops Control or Impl Office in
      final browser metrics.
- [x] Floor Overview remains the whole-floor topology view.
- [x] CLASSIC remains available and reports zero Spatial Lens floor layers.
- [x] Dashboard tests and production build pass.
- [x] Browser checks show no console/page errors or horizontal overflow.

## Prompt 3.10 Evidence

- `output/playwright/spatial-lens-prompt310-results.json`
- `output/playwright/spatial-lens-prompt310-focused-1440.png`
- `output/playwright/spatial-lens-prompt310-focused-1440-floor.png`
- `output/playwright/spatial-lens-prompt310-focused-1220.png`
- `output/playwright/spatial-lens-prompt310-focused-1220-floor.png`
- `output/playwright/spatial-lens-prompt310-overview-1440.png`
- `output/playwright/spatial-lens-prompt310-overview-1440-floor.png`
- `output/playwright/spatial-lens-prompt310-classic-1220.png`
- `.omx/state/spatial-lens-prompt310/ralph-progress.json`

## Prompt 3.10 Remaining Gaps

- Visual verdict is 78/100, still below the 90 threshold.
- Live agents still render through existing `OfficeAvatar` canvas marks rather
  than generated character sprites.
- Impl Office remains a partial adjacent-room crop. It is cleaner and no
  longer obscured by the minimap, but a future authored room rail/strip may
  make the crop feel even more intentional.

## Next Candidate

Prompt 4: Real AgentSprite / Live Activity Cues. Implement generated or
project-owned pixel character sprites for architect, sentinel, owner, worker,
and visual states before adding more room props.

## Previous Active Batch

- Batch: `Spatial Lens building shell cleanup`
- Name: `Corridor Node Diagnostic Boundary Cleanup`
- Status: `complete`

## Cleanup Goal

Remove the one high-signal slop issue found after the building shell pass:
door frames reused the generic `data-corridor-node` diagnostic attribute, so
browser checks counted 9 real corridor nodes plus 6 door-frame references as
15 corridor nodes.

## Cleanup Deliverables

- `DoorFrameLayer` now uses `data-door-corridor-node` for the linked corridor
  node id.
- `CorridorLayer` remains the sole renderer of actual `data-corridor-node`
  elements.
- `spatial-lens-floor-layout.test.mjs` now asserts the authored
  `CORRIDOR_NODES.length === 9` contract.
- Browser diagnostics now show 9 corridor nodes, 6 door frames, 6 door
  corridor references, and 0 door frames carrying `data-corridor-node`.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, task mutation, camera, or visual topology behavior was changed.

## Cleanup Acceptance

- [x] Door-frame diagnostics no longer inflate corridor-node counts.
- [x] Focused remains `3x` and shows Ops Control plus Impl Office.
- [x] Floor Overview remains `1x` and shows all six rooms.
- [x] CLASSIC remains available and has no Spatial Lens floor layers.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Browser checks show no console/page errors or horizontal overflow.

## Cleanup Evidence

- `output/playwright/spatial-lens-cleanup-results.json`
- `output/playwright/spatial-lens-cleanup-focused-1440.png`
- `output/playwright/spatial-lens-cleanup-focused-1440-floor.png`
- `output/playwright/spatial-lens-cleanup-focused-1220.png`
- `output/playwright/spatial-lens-cleanup-focused-1220-floor.png`
- `output/playwright/spatial-lens-cleanup-overview-1440.png`
- `output/playwright/spatial-lens-cleanup-overview-1440-floor.png`
- `output/playwright/spatial-lens-cleanup-classic-1220.png`

## Previous Active Batch

- Batch: `Spatial Lens building shell composition`
- Name: `Connected Floorplate, Corridor Graph, Door Anchoring`
- Status: `complete`

## Goal

Fix the spatial composition problem in Spatial Lens VIEWPORT: rooms should read
as part of one coherent pixel office building instead of floating rectangular
rooms on a dark void. This is a building shell, corridor graph, floorplate,
door alignment, and in-world route pass; it is not a prop-count pass.

## Deliverables

- New layout/background reference added at
  `docs/design/assets/spatial-lens/generated/building-floorplate-layout-reference.png`.
- `viewport/floorLayout.ts` defines the shared building floorplate zones,
  outer/inner/trim wall segments, structural columns, and bounds.
- `viewport/corridorGraph.ts` defines a narrow central corridor spine, six
  room connection stubs, a handoff hub pad, corridor nodes, door-aligned route
  generation, blocked-lane corridor placement, and corridor hit testing.
- `viewport/roomPlacement.ts` defines VIEWPORT-only door placements for all six
  rooms without changing canonical room/runtime data.
- New render layers:
  `BuildingShellLayer`, `FloorplateLayer`, `CorridorLayer`, and
  `DoorFrameLayer`.
- `FloorViewport` now renders floorplate, shell, corridor, route, room, and
  door layers separately and exposes `data-building-shell="connected"`.
- `floorGeometry.ts` now uses the corridor graph instead of the old wide
  corridor rectangles and routes handoffs through door thresholds plus the
  corridor hub.
- Blocked lane markers now anchor to corridor tiles rather than room interior
  task slots.
- Corridor styling now uses a 7% overview spine, stubs, hub, thresholds,
  route nodes, wall trim, and facility floorplate background.
- Room door glyphs from the old room schema are hidden in VIEWPORT; door frames
  now come from the door alignment layer.
- `spatial-lens-floor-layout.test.mjs` locks floorplate, corridor width,
  door placement, route hub, and blocked-lane corridor contracts.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, `App.tsx`, HUD, or task mutation surfaces were changed.

## Acceptance

- [x] VIEWPORT no longer relies on pure dark void behind floating rooms.
- [x] Floor Overview reads as one connected building floorplate.
- [x] Central corridor overview width is about 74px at 1440px (`7%`) rather
      than a 120px+ debug strip.
- [x] Six door frames align room edges to corridor stubs.
- [x] Right-side rooms have visible corridor connection stubs.
- [x] Handoff route uses Ops door, corridor hub, Validation door, packet, and
      in-world route channel.
- [x] Blocked lane marker anchors to a corridor tile.
- [x] CLASSIC remains available and unchanged.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Browser checks show no console/page errors, no horizontal overflow, and
      no checked text overflow.

## Visual Evidence

- `output/playwright/spatial-lens-building-shell-results.json`
- `output/playwright/spatial-lens-building-shell-focused-1440.png`
- `output/playwright/spatial-lens-building-shell-focused-1440-floor.png`
- `output/playwright/spatial-lens-building-shell-focused-1220.png`
- `output/playwright/spatial-lens-building-shell-focused-1220-floor.png`
- `output/playwright/spatial-lens-building-shell-overview-1440.png`
- `output/playwright/spatial-lens-building-shell-overview-1440-floor.png`
- `output/playwright/spatial-lens-building-shell-classic-1220.png`

## Next Candidate

The next slice should tune room interior composition against the generated
room references: reduce repetitive wall crowding, introduce authored walk-path
clearance rules, and place generated character sprites. Do not add more props
until shared shell, connected corridor graph, door alignment, and in-world
handoff/blocking stay stable.

## Previous Batch

- Batch: `Spatial Lens generated sprite fidelity`
- Name: `Generated Pixel Office References and Sprite Manifest`
- Status: `complete`

### Goal

Replace the remaining CSS-imagined pixel props with a generated, project-owned
pixel office reference and sprite-source workflow. Spatial Lens VIEWPORT should
use reusable generated sprite grammar, manual slicing metadata, and preserved
fallbacks rather than ad hoc pseudo-3D CSS.

### Deliverables

- Generated visual references added under
  `docs/design/assets/spatial-lens/generated/`.
- Public generated asset sheet files added under
  `packages/dashboard/public/assets/spatial-lens/generated/`.
- `pixel-office-asset-sheet-source.png` is the original generated green-screen
  sheet; `pixel-office-asset-sheet.png` is the chroma-keyed transparent source;
  `pixel-office-asset-sheet-1x.png` is the 384x256 nearest-neighbor frontend
  sheet downsampled 4:1 from the source.
- `docs/design/spatial-lens-pixel-office-reference.md` documents generated
  image paths, usage, art direction, forbidden treatments, and license note.
- `generatedAssetManifest.ts` defines manual rects, anchors, integer scale
  values, and PixelProp mapping for generated furniture, props, and character
  placeholders.
- `GeneratedSprite.tsx` renders sprite-sheet crops with `image-rendering:
  pixelated`, bounded local paths, and integer scale values only.
- `PixelProp` now prefers generated sprites when a manifest entry exists and
  falls back to the existing CSS pixel placeholder rules if not.
- `HandoffOverlay` now renders packet and blocked barrier markers from the
  generated sprite sheet.
- `spatial-lens-generated-assets.test.mjs` locks generated sheet existence,
  required sprite entries, rect bounds, and PixelProp sprite mapping.
- No canonical runtime, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, or task mutation surfaces were changed.

### Acceptance

- [x] Generated full UI, Ops Control room, Validation Office room, and asset
      sheet references are preserved in repo-owned paths.
- [x] Generated asset sheet is converted to transparent PNG and a 1x frontend
      sheet.
- [x] Manual sprite manifest includes console desk, monitor, chair, status
      board, inbox tray, outbox tray, packet, barrier, cone, architect, and
      sentinel entries.
- [x] PixelProp uses generated sprites for known props and keeps CSS fallback
      for missing sprites.
- [x] Handoff packet and blocked lane marker use generated sprite crops.
- [x] Focused remains default at integer camera zoom `3x`.
- [x] Floor Overview remains available at integer camera zoom `1x`.
- [x] Classic remains available and unchanged.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Real browser checks at 1440px and laptop width report no console/page
      errors or horizontal overflow.

### Visual Evidence

- `output/playwright/spatial-lens-generated-assets-results.json`
- `output/playwright/spatial-lens-generated-assets-focused-1440.png`
- `output/playwright/spatial-lens-generated-assets-focused-1440-floor.png`
- `output/playwright/spatial-lens-generated-assets-focused-1220.png`
- `output/playwright/spatial-lens-generated-assets-focused-1220-floor.png`
- `output/playwright/spatial-lens-generated-assets-overview-1440.png`
- `output/playwright/spatial-lens-generated-assets-overview-1440-floor.png`
- `output/playwright/spatial-lens-generated-assets-classic-1220.png`

### Next Candidate

The next visual slice should tune authored room templates against the generated
room references: reduce repeated prop crowding, add authored character sprites
from the generated sheet, and decide whether a route-aware camera should shift
right toward Ops -> Validation without breaking the `3x` focused-camera
contract.

## Earlier Batch

- Batch: `Spatial Lens camera and scale pass`
- Name: `Prompt 3.9 Focused Live Office Camera`
- Status: `complete`

### Goal

Make Spatial Lens `VIEWPORT` feel like a live pixel office camera instead of a
whole-building minimap. The default experience should enlarge Ops Control and
nearby office context, while topology/debug views remain available through
Floor Overview and Classic.

### Deliverables

- `OfficeStage` now exposes three modes: `Focused`, `Floor Overview`, and
  `Classic`. Stored legacy `viewport` mode migrates to `Focused`.
- `FloorViewport` accepts `viewMode="focused" | "overview"` and exposes
  `data-viewport-mode`, `data-viewport-camera`, and `data-camera-zoom`.
- `viewportCamera.ts` now defines
  `FLOOR_VIEWPORT_CAMERA_ZOOMS = { focused: 3, overview: 1 }` and keeps camera
  zoom to integer values only.
- Focused mode uses `transform: scale(3)` on the floor camera so rooms,
  furniture, handoff conduits, and temporary agent placeholders are actually
  enlarged together.
- Floor Overview uses `scale(1)`, shows all rooms, hides the minimap, and shows
  a visible `Floor Overview` plaque so it reads as topology/debug mode.
- Focused mode keeps the compact minimap visible for whole-floor awareness.
- Focused room plaques/status lights were reduced at the base CSS size so they
  remain in-world labels after 3x camera zoom instead of dominating the scene.
- `spatial-lens-pixel-grammar.test.mjs` locks integer focused/overview camera
  zoom and full-topology overview framing.
- `.omx/state/spatial-lens-camera/ralph-progress.json` records the visual
  verdict for the camera pass.

### Non-Goals

- No canonical runtime, `.notes`, `.agent`, approval, bridge, provider,
  scheduler, PR/CI, or task mutation changes.
- No floor write actions.
- No external assets or dependencies.
- No AgentSprite, TaskObject, HandoffLane, or inspector lifecycle work.
- No CLASSIC renderer rewrite.

### Acceptance

- [x] Focused is the default Spatial Lens mode.
- [x] Focused starts on Ops Control.
- [x] Focused shows Ops Control, nearby corridor, and adjacent Impl Office at
      1440px and laptop width.
- [x] Focused does not require all six rooms in the main camera.
- [x] Floor Overview remains available and visibly labeled as overview.
- [x] Classic remains available.
- [x] Camera zoom values are integer-only: Focused `3x`, Overview `1x`.
- [x] Focused camera transform is `matrix(3, 0, 0, 3, 0, 0)`.
- [x] Focused furniture is readable without browser zoom; measured desk bounds
      are `204x102`.
- [x] Focused agent placeholder bounds are `162x186`.
- [x] Focused mode has a compact minimap.
- [x] Floor Overview shows all six rooms at `1x`.
- [x] Classic fallback renders no Spatial Lens floor and zero new PixelProps.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Desktop/laptop Playwright captures have no console/page errors and no
      horizontal overflow.

### Visual Evidence

- `output/playwright/spatial-lens-camera-results.json`
- `output/playwright/spatial-lens-camera-focused-1440.png`
- `output/playwright/spatial-lens-camera-focused-1440-floor.png`
- `output/playwright/spatial-lens-camera-focused-1220.png`
- `output/playwright/spatial-lens-camera-focused-1220-floor.png`
- `output/playwright/spatial-lens-camera-overview-1440.png`
- `output/playwright/spatial-lens-camera-overview-1440-floor.png`
- `output/playwright/spatial-lens-camera-classic-1220.png`

### Next Candidate

The next visual quality slice is authored sprite fidelity: convert recurring
CSS placeholder furniture/agents into a small local sprite sheet and only then
begin AgentSprite/TaskObject lifecycle work.

---

## Spatial Lens Prompt 4.15 Operator Focus Map Pass

- Batch: `Spatial Lens operator focus map pass`
- Name: `Prompt 4.15 Operator Focus Map`
- Status: `complete`

### Goal

Apply the attached research conclusion that Spatial Lens should be an operator
focus view, not the canonical workflow control plane. The focused map should
show the current active operators, blocked/handoff spatial cues, and a small
phase frame, while task queue and topology semantics stay outside the room
floor.

### Deliverables

- `FloorViewport` now marks Focused mode as `data-operator-focus-map="true"`
  and `data-map-task-treatment="rail-only"`.
- `RoomZone` accepts `showTaskNodes`; Focused mode disables in-room task dots
  while Overview keeps room task nodes for topology/debug orientation.
- `agentVisualState.ts` exposes `shouldRenderAgentInOperatorFocusMap()` and
  `AgentLayer`/`AgentOffscreenRail` use it in Focused mode.
- Focused mode now renders a compact `PLAN / BUILD / VALIDATE / APPROVE`
  phase lane strip.
- `SceneDockOverlay` makes the route minimap a collapsed-reveal dock in
  Focused mode.
- `HandoffOverlay` adds one labeled/pulsed handoff edge, derived from existing
  route points.
- The focused Validation edge is shifted left enough to leave visible right
  breathing room from the rail/sidebar.
- `.omx/state/spatial-lens-operator-focus/ralph-progress.json` records the
  visual verdict and evidence paths.

### Non-Goals

- No Dagre/ELK dependency.
- No new Topology Lens, Run Lens, Workspace Lens, or route.
- No canonical runtime truth, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, or task mutation surface changes.
- No room-coordinate source-of-truth changes.

### Acceptance

- [x] Focused Spatial Lens identifies itself as an operator focus map.
- [x] Focused room task dots are suppressed.
- [x] Overview still shows full topology with room task nodes.
- [x] Focused floor agents show active operators only: `architect` and
      `sentinel` in the demo evidence.
- [x] Idle/assigned-only agents remain in the roster/rail, not on the floor.
- [x] Focused phase lanes show Plan as focus and Validate as target for the
      Ops-to-Validation handoff.
- [x] Route minimap is hidden by default and revealable by hover/focus.
- [x] Handoff edge is visibly labeled/pulsed without adding more guide tiles.
- [x] Desktop and laptop focused views have zero horizontal overflow and zero
      console/page errors.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.

### Visual Evidence

- `output/playwright/spatial-lens-operator-focus-results.json`
- `output/playwright/spatial-lens-operator-focus-focused-1440.png`
- `output/playwright/spatial-lens-operator-focus-focused-1220.png`
- `output/playwright/spatial-lens-operator-focus-overview-1440.png`
- `output/playwright/spatial-lens-operator-focus-classic-1440.png`

### Next Candidate

Create a separate Topology Lens / Run Lens plan so DAG layout, node execution
cards, logs, and workspace evidence move out of the Spatial Lens floor.
## Frontend Design Architecture Improvement Execution

- Batch: `Frontend design architecture improvement execution`
- Plan: `.omo/plans/frontend-design-architecture-improvement.md`
- Status: `complete`

### Goal

Execute the approved Spatial Lens frontend design/architecture plan: keep
Focused as a workbench-first operator view, keep Floor Overview as the only
full topology surface, remove dormant Focused-map affordances, and make the
mode switch and CTA contracts model-owned and testable.

### Deliverables

- `FocusedHandoffView` uses model-owned next-action CTA kind, label, and href.
- `focusedHandoffModel.ts` delegates CTA derivation to
  `focusedNextAction.ts` and event/edge derivation to
  `focusedWorkbenchEvents.ts`.
- `OfficeStage` mode controls use ARIA tabs and keyboard arrow navigation.
- `FloorViewport` is Overview-first and no longer carries a Focused map path.
- Deleted dormant Focused map components:
  `FocusedRouteTargetEdge.tsx`, `FocusedCorridorContinuityLayer.tsx`, and
  `MinimapDock.tsx`.
- Removed `AgentOffscreenRail` from `AgentLayer.tsx` and Spatial Lens exports.
- Added repeatable browser QA harness:
  `.omo/evidence/run-frontend-design-architecture-qa.mjs`.

### Acceptance

- [x] Focused renders the Active Handoff Workbench and no floor viewport.
- [x] Overview renders the full floor topology and no Focused workbench.
- [x] Classic renders no Spatial Lens floor.
- [x] Stage mode controls expose tablist/tab/tabpanel semantics.
- [x] Source grep finds no dormant Focused-map symbols under
      `packages/dashboard/src`.
- [x] Dashboard tests pass.
- [x] Dashboard production build passes.
- [x] Browser QA screenshots and JSON evidence pass.
- [x] Post-review tab accessibility blocker fixed and re-reviewed.

### Evidence

- `.omo/evidence/task-8-dashboard-test.txt`
- `.omo/evidence/task-8-dashboard-build.txt`
- `.omo/evidence/task-7-browser-qa.txt`
- `.omo/evidence/task-8-final-dormant-src-grep.txt`
- `.omo/evidence/task-8-model-split-loc.txt`
- `.omo/evidence/task-8-accessibility-fix-targeted-tests.txt`
- `.omo/evidence/task-8-accessibility-browser-summary.json`
- `output/playwright/frontend-design-architecture-improvement-results.json`
- `output/playwright/frontend-design-architecture-improvement/focused-1220.png`
- `output/playwright/frontend-design-architecture-improvement/focused-1440.png`
- `output/playwright/frontend-design-architecture-improvement/overview-1440.png`
- `output/playwright/frontend-design-architecture-improvement/classic-1440.png`

## Gajae-Code Final Adapter Implementation

- Batch: `GJC final adapter / control-plane leaf import`
- Status: `complete`
- Mode: Ralph + Ultrawork

### Goal

Implement the final phase of the approved Gajae-Code plan without weakening
Conitens' control-plane boundary: GJC remains an external terminal harness,
while Conitens `append_event()` remains the only authoritative mutation path.

### Deliverables

- Added `scripts/ensemble_gjc_adapter.py`, a dependency-free leaf adapter that
  imports one redacted GJC run metadata JSON file.
- Added `tests/test_gjc_adapter.py` for metadata import, raw-field rejection,
  unsafe path rejection, symbolic-ref rejection, and CLI stderr redaction.
- Added `.omo/evidence/gjc-adapter-manual-fixture.json` as a safe manual QA
  fixture.
- Updated `docs/gjc-harness-adapter.md` with the import command and symbolic
  ref contract.
- Refreshed Ralph/Ultrawork evidence in `.omo/notepads/` and `.omx/context/`.

### Acceptance

- [x] Adapter appends exactly one `harness.evidence_observed` event through
      `append_event()`.
- [x] Adapter does not write task lifecycle, approval state, or `.notes`
      projections directly.
- [x] Raw prompt/completion/stdout/stderr/transcript/log/body/diff/patch/
      comment/command/token/secret fields are rejected before append.
- [x] Relative artifact refs are canonicalized; absolute paths and traversal
      are rejected.
- [x] Symbolic refs are opaque IDs only; slash, backslash, traversal, and
      drive-letter syntax are rejected.
- [x] CLI rejection stderr does not leak the original unsafe ref/path.
- [x] Existing bridge/dashboard projections continue to pass.

### Evidence

- `python -m unittest tests.test_gjc_adapter` passed 7/7.
- `python -m py_compile scripts/ensemble_gjc_adapter.py scripts/ensemble_events.py scripts/ensemble_forward.py scripts/ensemble_forward_bridge.py` passed.
- `python -m unittest tests.test_gjc_adapter tests.test_forward_runtime_mode tests.test_approval_controls tests.test_loop_state` passed 51/51.
- Focused Forward Bridge GJC evidence tests passed 3/3.
- `pnpm --filter @conitens/dashboard test` passed 150/150.
- `pnpm --filter @conitens/dashboard build` passed.
- `gjc --version` returned `gjc/0.8.1`; `gjc --smoke-test` returned
  `smoke-test: ok`.

## Wave 5 Improvement Candidate Approval Slice - 2026-07-10

- Status: `complete`
- Mode: Ralph + Ultrawork
- Stop line: approval/rejection only; no `.agent` apply/rollback, Forward,
  dashboard, SQLite candidate authority, effect measurement, or runtime-default
  promotion.

### Deliverables

- Added a typed/versioned candidate model and event-replay service.
- Added canonical `improvement.candidate_proposed` protocol registration and
  regenerated the Python event allow-list.
- Extended the existing `improvement` CLI with candidate
  create/list/show/decide actions.
- Added focused replay, privacy, versioning, approval-correlation, CLI, and
  protocol tests.

### Acceptance

- [x] Candidate event precedes the metadata-only approval request.
- [x] Exact retry is idempotent; changed proposals increment valid lineage
      versions; malformed replay cannot poison version allocation.
- [x] Deterministic risk upgrades topology/protected changes and requires owner
      review.
- [x] Only exact post-proposal approval events with valid actor types can decide
      a candidate.
- [x] Public reads reject private/path/secret-shaped, forged-provenance, and
      non-string replay content.
- [x] Isolated CLI QA confirms only the event ledger changes; `.agent` and
      SQLite remain unchanged.
- [x] Candidate 27/27, compatibility 55/55, authority integration 58/58,
      protocol candidate test, TypeScript build, compile, and structure gates
      pass.
- [x] Independent final code review APPROVE and scoped security PASS obtained.

### Follow-on Ralph gate

Completed by the materializable agent-skill revision slice below. Candidate
metadata remains non-executable; only a separately validated structured revision
can reach the owner-gated apply path.

### Evidence

- `.omx/plans/prd-improvement-candidate-pipeline.md`
- `.omx/plans/test-spec-improvement-candidate-pipeline.md`
- `.omo/evidence/improvement-candidate-green.txt`
- `.omo/evidence/improvement-candidate-debugging-audit.md`
- `.omo/evidence/improvement-candidate-review-work.md`

## Wave 5 Agent Skill Revision Apply/Rollback Slice - 2026-07-10

- Status: `complete`
- Mode: Ralph + Ultrawork
- Stop line: one existing `.agent/skills/<skill>.yaml` target at a time; no
  create/delete, persona core, `.agents/skills`, Forward, dashboard, SQLite
  authority, runtime promotion, or automatic deployment.

### Deliverables

- Added digest-bound structured revision proposal/replay in
  `scripts/ensemble_agent_revisions.py`.
- Extracted read-only legacy owner matching to `scripts/ensemble_owner_auth.py`
  while preserving `ensemble.py` wrappers.
- Added owner-gated event-first apply, rollback, deterministic rebuild, atomic
  projection, stale/drift/path checks, and cross-process serialization.
- Added the existing-facade CLI actions `revision-propose`, `revision-show`,
  `revision-apply`, `revision-rollback`, and `revision-rebuild`.
- Registered exactly three revision events in the protocol and regenerated the
  Python allow-list.

### Acceptance

- [x] Candidate review and config-write authorization remain separate.
- [x] Proposal binds candidate ID/version/proposal digest, target, source hash,
      base canonical hash, and next canonical hash.
- [x] Apply and rollback append terminal authority events before atomic writes.
- [x] Rebuild requires a live owner and deterministically replays the active
      revision stack; ownerless rebuild creates no `.agent` output.
- [x] Malformed, forged, duplicate, out-of-order, stale, unsafe-path, private,
      secret-shaped, and externally drifted inputs fail closed.
- [x] Focused 46/46 and compatibility 104/104 tests passed.
- [x] Real CLI lifecycle, recovery, privacy, and process-concurrency QA passed.
- [x] Protocol focused test/build, registry, compile, sync, scoped diff, and
      zero-cycle structure gates passed.
- [x] Independent code, state-machine, architecture, completion, and security
      reviews approved the final slice.

### Next gate

Keep the current leaf module until another revision target family or richer
revision semantics creates real reuse pressure. The next improvement-loop slice
now measures post-apply effect and regression from exact-key public evidence.
After this bounded slice, return to Wave 3 bridge query/command decomposition and
public-context allowlisting; do not promote Forward or infer comparability from
candidate prose.

### Evidence

- `.omx/plans/prd-agent-skill-revision-apply-rollback.md`
- `.omx/plans/test-spec-agent-skill-revision-apply-rollback.md`
- `.omo/evidence/agent-skill-revision-green.txt`
- `.omo/evidence/agent-skill-revision-manual-qa.md`
- `.omo/evidence/agent-skill-revision-debugging-audit.md`
- `.omo/evidence/agent-skill-revision-review-work.md`

## Wave 5 Effect Observation And Wave 6 Forward Quarantine - 2026-07-11

- Status: `complete`
- Mode: Ralph + Ultrawork
- Stop line: exact comparison keys and metadata-only event replay only; no causal
  claim, effect projection, SQLite authority, dashboard route, automatic apply,
  authority-bearing Forward command change, or runtime-default promotion. The
  read-only runtime-roster may skip optional version probes by default.

### Deliverables

- Added optional exact `comparison_key` persistence across closure API, bundle,
  authority event, public index, projection rebuild, and CLI.
- Added event-only `improvement.effect_observed` observe/show/list replay with
  bounded metrics, explicit unknowns, and `causal_attribution=not_claimed`.
- Reused the revision workspace file lock so observation and apply/rollback are
  serialized across processes.
- Replays revision state from the event prefix before the first effect event, so
  later rollback preserves historical observations and reordered events fail.
- Added strict recursive JSON type equality, exact nested closure schemas, public
  text validation, traversal rejection, and bounded candidate provenance.
- Accepted Forward quarantine in ADR-0004; `default_runtime=legacy` remains
  unchanged and future promotion requires a new ADR proving all eight gates.
- Aligned closure creation with effect replay's public-text policy: absolute
  POSIX paths fail before append and unsafe episode IDs publish opaque hashes.
- Removed optional external version probes from the default HTTP roster read;
  explicit `probe_versions=1` diagnostics remain supported.

### Acceptance

- [x] Focused effect suite passes 26 tests, including process concurrency,
      post-observation rollback, event reordering, bool/int confusion, nested
      private content, safe multiline prose, public path rejection, and
      >50-event provenance.
- [x] Final adjacent candidate/revision/closure/owner/event-authority bundle
      passes 121/121.
- [x] Forward runtime + bridge acceptance passes 54/54; the formerly timing-out
      roster endpoint defaults optional probes off and retains explicit opt-in.
- [x] Protocol focused 1/1, TypeScript build, Python compile, 151-event/32-alias
      registry generation, and the known full-protocol 847-pass/4-failure
      baseline all match.
- [x] Real CLI happy-path and unsafe-input QA passed for closure and effect
      surfaces; no effect projection or SQLite state was created.
- [x] Final settled-state review-work, code/security/scope/context/state-machine
      rereviews, context/evidence closure, and temporary debug cleanup passed.

### Evidence

- `.omo/evidence/improvement-effect-green.txt`
- `.omo/evidence/improvement-effect-debugging-audit.md`
- `.omo/evidence/improvement-effect-review-work.md`

### Next gate

Wave 3 is the next architecture priority: split Forward query/command/transport
responsibilities, converge primary read paths, and replace arbitrary public
context Markdown with an allowlisted metadata projection. The current Forward
privacy gate fails on raw bodies, secret-shaped strings, and absolute POSIX paths;
quarantine is the control, not a claim that this debt is solved.

## Wave 3 Forward Bridge Boundary Refactor - 2026-07-11

- Status: `complete`
- Mode: Ralph + Ultrawork
- Stop line: boundary repair only; no Forward promotion, runtime-default change,
  new dependency, persona-core migration, or unrelated cleanup.

### Deliverables

- Reduced `ensemble_forward_bridge.py` to a compatibility/assembly facade and
  separated query, command, stream, HTTP, public-context, collaboration-read,
  and patch-decision responsibilities into bounded leaves.
- Made missing-workspace reads non-materializing and existing SQLite access
  explicitly read-only with WAL-aware immutable handling.
- Replaced arbitrary Markdown passthrough with allowlisted public projections;
  public thread search is metadata-only and public actors, reviewers, handoff
  reasons, paths, credentials, and error values are sanitized or omitted.
- Preserved repository-primary collaboration reads with contained legacy thread
  compatibility, facade monkeypatch contracts, dashboard response contracts,
  SSE framing, and CLI behavior.
- Centralized patch decisions and made approval/event ordering retry-safe and
  workspace/actor/reason aware.
- Centralized public approval/actor/handoff shaping across query, command, and SSE
  paths; replaced query wildcard/dynamic-export chains with explicit owner imports;
  and exhaustively documented all 13 operator mutation routes.
- Kept Forward a loopback-authenticated quarantined sidecar with
  `default_runtime=legacy`; root and boundary docs inventory both reads and
  operator mutation routes.

### Acceptance

- [x] Focused boundary bundle passes 67/67 in 9.826 seconds.
- [x] Complete Wave 3 bundle passes 158/158 in 94.117 seconds.
- [x] HTTP overflow unit/stress bundle passes 11/11, including ten real loopback
      oversized requests without Windows connection resets.
- [x] Dashboard passes 154/154 and its TypeScript/Vite production build passes.
- [x] All 37 Wave 3 Python files pass the no-excuse checker; changed Python
      compiles and diff validation passes.
- [x] Real CLI and loopback HTTP QA covers authentication, traversal, privacy,
      metadata-only search, SSE, malformed/negative/oversized bodies, and cleanup.
- [x] The adjacent legacy suite is classified, not hidden: 51 tests with 2 known
      failures and 9 known errors in legacy event aliases/persona manifests; no
      Forward Bridge module participates in those paths.
- [x] Settled code review is `CLEAR / APPROVE` and the independent final gate is
      `APPROVE`; neither reports a blocker.

### Evidence

- `.omx/plans/prd-wave3-forward-bridge-refactor.md`
- `.omx/plans/test-spec-wave3-forward-bridge-refactor.md`
- `.omo/evidence/wave3-forward-bridge-green.txt`
- `.omo/evidence/wave3-forward-bridge-manual-qa.md`
- `.omo/evidence/wave3-debugging-audit.md`
- `.omo/evidence/wave3-forward-bridge-review-work.md`
- `.omo/evidence/wave3-forward-bridge-settled-code-review.md`
- `.omo/evidence/wave3-forward-bridge-refactor-gate-review.md`

### Next gate

Do not promote Forward. A future promotion slice must resolve and prove the
documented Forward-only direct SQLite projection and approval reviewer semantics,
along with every ADR-0004 gate. Separately plan the legacy event-alias and persona
schema migration; do not mix it into bridge boundary work.

## PR hardening follow-up (2026-07-11)

- [x] Restore Active Handoff Workbench ahead of the character stage in Focused mode.
- [x] Serialize improvement-candidate terminal decisions with a workspace lock.
- [x] Make `forward status` avoid creating `.conitens` paths on an empty workspace.
- [x] Remove Git email as a project-owner authorization factor.
- [x] Run integrated tests, build, and browser QA before final review and PR creation.

## PR #33 conflict integration (2026-07-12)

- [x] Identify cleanup history superseded by `main` and isolate the five PR-specific commits.
- [x] Preserve `main`'s extracted dashboard shell while composing the PR workspace controller.
- [x] Move workspace list selection and error semantics to the extracted workbench screen.
- [x] Preserve Forward quarantine and legacy runtime authority in merged documentation.
- [x] Pass integrated Python, protocol, dashboard, and manual browser verification.
- [x] Fix the review-discovered stale workspace draft race with failure-first coverage.
- [ ] Publish the two-parent merge commit and confirm GitHub reports PR #33 mergeable.
