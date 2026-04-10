# LATEST_CONTEXT.md

Read this file before substantial work.

## Current State

- Active batch: `Core operator routes refactor`
- Status: `complete`
- The reviewed 2026-04-09 frontend direction is now implemented for the primary
  dashboard surfaces: `Overview`, `Inbox`, `Tasks`, and `Runs` render through
  dedicated screens with route-specific layouts instead of sharing the old
  `ForwardDashboardScreen` run-browser frame.
- A follow-up risk pass is now applied too: the `Runs` screen commits its
  selected summary run into `#/runs?selected=...`, and the shell plus the core
  operator routes now support Korean/English switching without reload.
- A further residual-risk cleanup pass is now applied too: the task-route logic
  is no longer concentrated in one monolithic hook, because derived state and
  action handlers were split out of `useOperatorTasksData` into dedicated
  helper modules.
- Another follow-up is now complete too: the shared `ko` / `en` toggle now
  covers the key secondary operator routes (`Agents`, `Approvals`, `Threads`)
  instead of only the core routes, and the dashboard package now has a repo-
  local Vitest wrapper so the package `test` script no longer depends on the
  broken default host-shim path.
- The global shell is now materially lighter too: `packages/dashboard/src/App.tsx`
  keeps only four primary routes in the main nav, moves secondary/utility
  surfaces behind `More`, and collapses API/token posture into a compact bridge
  status cluster.
- Bridge connect UX no longer dominates the top fold on the primary routes:
  `CoreRouteScaffold` now hosts a compact bridge tray and collapsible connect
  form so the working surface remains visible first.
- `Tasks` now behaves like a canonical work queue with a top toolbar for
  filters/presets/bulk actions, a left queue rail, and a dedicated right detail
  pane plus editor surface.
- `Runs` now behaves like an execution browser instead of sharing the task/run
  monolith shell, with a list rail and a summary preview that links to the full
  `run-detail` evidence route.
- `Inbox` is now rendered as a denser action queue rather than a run-browser
  clone, and `Overview` now acts as a posture-first summary workspace.
- `office-preview` remains secondary navigation and now has a mobile room-strip
  fallback: at `<=820px` the stage shows the selected room only, avoiding the
  old six-room poster stack.
- That mobile room strip is now horizontally scrollable rather than a cramped
  two-column stack, which reduces how far the selected stage is pushed below
  the fold on narrow widths.
- Fresh Playwright evidence for the implemented refactor now exists at:
  - `output/playwright/dashboard-overview-20260409-refactor-1440.png`
  - `output/playwright/dashboard-inbox-20260409-refactor-1440.png`
  - `output/playwright/dashboard-tasks-20260409-refactor-1440.png`
  - `output/playwright/dashboard-runs-20260409-refactor-1440.png`
  - `output/playwright/dashboard-office-preview-20260409-refactor-1440.png`
  - `output/playwright/dashboard-overview-20260409-refactor-820.png`
  - `output/playwright/dashboard-tasks-20260409-refactor-820.png`
  - `output/playwright/dashboard-office-preview-20260409-refactor-820.png`
- Browser console inspection during the refactor verification again showed
  `0` errors / `0` warnings.
- A later Playwright follow-up now also confirms the risk-fix behavior:
  `#/runs?selected=demo-run-001` appears in the browser after selection, and
  an English-mode screenshot exists at
  `output/playwright/dashboard-runs-20260409-riskfix-en-1440.png`.
- The lingering dashboard test-runner question is also clarified now: the repo
  suite passes when invoked through the real Windows Node binary, and the local
  failure path is specifically the missing
  `C:\\Users\\eomsh\\.codex\\omx-host-shims\\node` worker executable used by the
  default `vitest` shell path in this environment.
- That runner risk is now mitigated at the repo level too: the dashboard
  package test script routes through `packages/dashboard/scripts/run-vitest.cjs`,
  which selects a real Node executable before launching `vitest.mjs`.
- Local verification now passes through dashboard typecheck, production build,
  and the full package test suite when the real Node executable is used
  directly or through the new wrapper. The remaining verification gap is not
  test failure but the environment-specific direct `vitest` launcher path that
  still points to the broken host shim.
- A local Claude review for the implemented refactor now exists at
  `.omx/artifacts/claude-frontend-core-routes-refactor-2026-04-09T10-01-05-586313Z.md`;
  its immediate findings (stale run-detail refresh, overview rail loading copy,
  inbox active-row class, and hash fallback) were applied in the same slice.
- That Claude review's higher-level cleanup recommendation still stands too:
  `useOperatorTasksData` needed structural cleanup; that split is now started,
  though a later pass could still decompose fetch orchestration further.
- Remaining translation debt is now narrower too: utility-only panels such as
  `Background CLI`, `Token Budget`, and `Weekly Report` still remain mostly
  English, but the primary operator flows plus key secondary routes are now
  locale-switchable.
- The dashboard shell rebaseline is now complete: replacement global shell
  foundations live in `packages/dashboard/src/styles/forward-shell.css` and
  `packages/dashboard/src/styles/agent-layout.css`, keeping the in-progress CSS
  split from regressing the live control plane.
- The dashboard header now separates primary operator routes from utility
  routes, preserving the dark Conitens shell while making the workbench IA
  clearer.
- `Threads` now treats the no-token posture as an explicit live-bridge empty
  state, refetches on token changes, and ships labelled filter UI plus updated
  ellipsis-normalized loading copy.
- New targeted regression coverage now exists for the `Threads` route token
  behavior in `packages/dashboard/src/components/ThreadBrowser.test.tsx` and
  `packages/dashboard/src/components/ThreadDetail.test.tsx`.
- The dashboard package test runner is now normalized too: `packages/dashboard`
  Vitest uses `jsdom` plus `src/test-setup.ts` by default, and the package test
  suite runs green without per-file environment bootstrapping.
- A follow-up live auth/CORS hardening slice is now complete too: browser
  bridge fetches send both bearer auth and `X-Conitens-Forward-Token`, and the
  loopback bridge now echoes requested auth headers in preflight responses.
- Fresh Playwright live verification now confirms that a real bridge can load
  `overview`, `runs`, and `threads` from the built dashboard shell without
  falling back to demo/no-token state.
- The related forward bridge/live approval Python baseline is now green too:
  approval events emit canonical protocol names, legacy execution-loop
  telemetry aliases resolve safely, insight mirroring is best-effort, and the
  approval resume round-trip test timeout now matches observed runtime.
- Dashboard verification for this slice passed through `npx`-based typecheck,
  targeted vitest coverage, a production Vite build, and refreshed Playwright
  screenshots for overview, threads, and office-preview.
- Current live runtime truth remains `scripts/ensemble.py` plus `.notes/` and
  `.agent/`.
- `.conitens/` now carries loop state, runtime digest markdown, persona shell
  files, namespaced memory records, candidate patch review storage,
  OpenHands-compatible skill packaging metadata, a Context Assembler, a local
  orchestration skeleton, a working iterative execution loop, and a persisted
  approval-control path for risky actions, plus a dual-written collaboration /
  replay layer for rooms, messages, insights, and handoff packets.
- Candidate patch review hardening now requires recorded proposal provenance and
  a concrete behavior delta before a candidate patch is surfaced as pending or
  allowed through the apply path.
- `.vibe/` carries repo intelligence plus fast-lane and doctor quality gates.
- A current Korean architecture/status overview now lives in
  `docs/current-architecture-status-ko.md`.
- Frontend v4.1 audit documents now live in `docs/frontend/`.
- An explicit additive forward entry surface now exists via `ensemble forward`.
- A forward-only read bridge now exists via `ensemble forward serve`.
- A BE-1b live/approval bridge now exists on the same forward surface.
- A minimal forward-only dashboard shell now exists in `packages/dashboard`.
- A real approval center now exists in the same shell.
- A read-only insights view now exists in the same shell.
- FE-3 read-only operational panels now exist for replay, state docs, digests,
  and room timeline.
- FE-5 graph/state inspector now exists in the same shell.
- A scoped FE-8 stabilization pass is now complete.
- FE-4 live room/replay updates now exist in the same shell.
- Reviewer identity for dashboard approval decisions is now stamped by the
  local forward bridge instead of trusted from the browser.
- Dashboard live SSE now uses bearer-authenticated `fetch()` rather than a
  query-token `EventSource` path.
- Loopback CORS is now explicitly served by the forward bridge so the local
  dashboard preview can call it across origins.
- Dashboard room selection now survives live/detail refresh when the same room
  still exists in refreshed replay data.
- Forward bridge 500 responses are now sanitized to a generic internal-error
  payload.
- Browser storage no longer persists the forward bridge bearer token.
- `pnpm audit` is now reduced to zero high/critical findings.
- Local bridge and dashboard preview execution were both verified after the
  hardening pass.
- A dedicated operator usage guide now exists at
  `docs/frontend/FORWARD_OPERATOR_USAGE.md`.
- The 2026-04-02 frontend review's first implementation slice is now applied:
  pixel-office rail density caps plus a centered shell hard-lock.
- The next frontend-review slice is also applied: a compact one-line focus strip
  and quieter room tiles with redundant chrome removed.
- The next pixel-office review slice is now applied too: `Impl Office` and
  `Central Commons` fixture density were increased through the stage schema.
- The specialist-wing review slice is now applied too: fixture identity and
  chrome were refined for `Ops Control`, `Research Lab`, `Validation Office`,
  and `Review Office`.
- The ambient-signal review slice is now applied too: avatar motion is quieter,
  task markers are smaller, and flashing error animation was removed.
- A contained `#/office-preview` route now exists so pixel-office visual
  verification can happen without disturbing the main forward shell.
- Pixel-office Phase 4 verification now has real Playwright screenshot evidence
  with no major blocking visual issue found.
- A final proportional stage-fill polish is now applied, reducing dead space in
  the office preview.
- The office preview now has an operator-summary band, stage status pills, rail
  section counts, accessible avatar controls, reduced-motion handling, and
  refreshed browser evidence for the 2026-04-03 polish slice.
- A reference-driven workspace pass is now applied too: the preview has a
  correlated-signal strip and a sticky desktop context rail inspired by current
  open-source workflow / observability UIs, with refreshed screenshot evidence.
- Newly fetched `origin/main` now includes that preview hierarchy work via merge
  commit `9c4ba0e`, so the next frontend iteration should start from document
  rebaseline and structural cleanup rather than more branch-local preview work.
- `docs/frontend/FRONTEND_REVIEW_2026-04-02.md` is now rebaselined to that
  merged state and no longer treats shipped FE-4 / Pixel Office work as pending.
- A merged-main dashboard verification baseline is now captured too: tests,
  typecheck, and build all pass, and the next lane is structural cleanup of
  `styles.css` and `forward-bridge.ts`.
- A dashboard-wide design unification pass is now applied: the live shell is the
  shared visual baseline across runs, preview, and agents; onboarding is now an
  inline panel; preview composition is more stage-first; and route screenshot
  evidence exists for runs, run-detail, preview, and agents.
- Additional responsive evidence also now exists for `1220` and `820`
  breakpoints on the unified shell / preview surfaces.
- `forward-bridge.ts` is now structurally split into internal modules while
  preserving the dashboard app's existing public import surface.
- Local Claude review reliability is now improved with an explicit wrapper and
  a verified `medium` / 5-minute invocation profile.
- A Paperclip comparative planning pass is now complete too: `paperclipai/paperclip`
  was analyzed as a product and architecture reference, and additive adoption
  guidance for Conitens now exists in both `docs/` and `.conitens/reviews/`.
- The recommended direction from that planning pass is to import Paperclip's
  operator-product layer selectively, especially inbox/task/workspace
  information architecture, while preserving Conitens' stronger
  validator/approval/replay/room execution core.
- A detailed comparative planning artifact now exists at
  `docs/PAPERCLIP_CONITENS_INTEGRATION_PLAN_2026-04-04.md`, mapping how
  `paperclipai/paperclip` can inform current Conitens across UI/UX, frontend,
  backend, data model, and phased rollout.
- A repo-scoped comparative planning artifact for the same task now also exists
  at `.conitens/reviews/paperclip_conitens_integration_plan_2026-04-04.md`,
  written against direct source inspection of `paperclipai/paperclip` commit
  `8adae84`.
- That comparative plan recommends adopting Paperclip as a product/operator UX
  reference while preserving Conitens’ current forward-loop, replay, approval,
  room, and pixel-office differentiation instead of copying Paperclip’s runtime
  model literally.
- An OMX team-style parallel analysis launch for the Paperclip comparison was
  attempted and failed in this environment with `spawn EFTYPE`, so the work was
  completed through native parallel subagents instead.
- A follow-up Phase 1 backlog planning pass is now complete too, turning that
  comparative strategy into an executable read-only productization slice.
- The new Phase 1 backlog keeps the first implementation step projection-first:
  operator summary and inbox routes, new view-model layers, and forward bridge
  read aggregations before any durable task/workspace schema work.
- The concrete Phase 1 backlog artifact now exists at
  `docs/PAPERCLIP_CONITENS_PHASE1_BACKLOG_2026-04-04.md`.
- The first implementation slice from that backlog is now complete too:
  a read-only `GET /api/operator/summary` projection plus a first-class
  `overview` route in the forward shell.
- The overview slice added new bridge type/parser/client support, a dedicated
  operator summary view-model, and a new dashboard summary panel without
  introducing a durable task schema.
- Verification for that slice passed through Python forward-bridge tests,
  dashboard parser tests, and a package-scoped dashboard build.
- The second implementation slice from that backlog is now complete too:
  a read-only `GET /api/operator/inbox` projection plus a first-class `inbox`
  route in the forward shell.
- The inbox slice added new bridge type/parser/client support, a dedicated
  operator inbox view-model, and a new dashboard inbox panel without
  introducing a durable task/workspace registry.
- The inbox slice currently projects approvals, validator failures, blocked
  handoffs, and stale runs only; broader task/workspace objects remain deferred.
- Verification for that slice also passed through Python forward-bridge tests,
  dashboard parser tests, and a package-scoped dashboard build.
- The third implementation slice from that backlog is now complete too:
  a read-only `GET /api/operator/agents` projection plus a live operator roster
  upgrade on the `agents` route.
- The agents slice added new bridge type/parser/client support, a dedicated
  operator agents view-model, and live roster metadata in the existing agents
  surface without introducing a durable agent registry.
- The agents slice currently derives roster entries from approvals, task-plan
  ownership, orchestration checkpoints, room participants, handoff packets, and
  memory records only; live graph and proposal/evolution projections remain
  deferred.
- Verification for that slice also passed through Python forward-bridge tests,
  dashboard parser tests, and a package-scoped dashboard build.
- The first Phase 2 owned API slice is now complete too:
  canonical `operator_tasks` storage now exists in the loop repository and is
  exposed through `GET/POST /api/operator/tasks` plus task detail reads.
- This tasks slice is intentionally backend-first: no tasks UI route, no
  editing/deletion path, and no run execution binding yet.
- Repository snapshots now include operator tasks linked to a run, and the new
  bridge contract has parser/client coverage plus repository/bridge test
  coverage.
- The second Phase 2 owned API slice is now complete too:
  the forward shell now includes `tasks` and `task-detail` routes backed by the
  canonical operator task API.
- The tasks slice added a dedicated operator tasks view-model and a task detail
  panel, making canonical operator tasks visible in the dashboard for the first
  time.
- This tasks UI slice is still intentionally narrow: no task create/edit UI, no
  run execution binding, and no task-specific replay composition yet.
- The third Phase 2 owned API slice is now complete too:
  `task-detail` now renders linked approval and replay context when a canonical
  operator task has `linked_run_id`.
- This linkage slice still leaves task-specific room/state-doc composition
  deferred, but it closes the main gap between durable task records and
  execution evidence.
- The fourth Phase 2 owned API slice is now complete too:
  canonical operator tasks now support create and update flows from the shell.
- The tasks shell now exposes a minimal create form on `tasks` and an edit form
  on `task-detail`, backed by canonical API writes.
- This write slice still leaves delete flows, execution/resume controls, and
  deeper task-specific evidence composition deferred.
- The fifth Phase 2 owned API slice is now complete too:
  tasks now support status/owner filtering and quick status transitions.
- This workflow slice makes the tasks surface behave more like an operator work
  queue while still leaving bulk actions, saved filters, and delete flows
  deferred.
- The sixth Phase 2 owned API slice is now complete too:
  `task-detail` now composes linked state docs, runtime/repo digests, and room
  timeline in addition to linked approvals and replay.
- This evidence-composition slice makes canonical operator tasks feel closer to
  full operator dossiers, while task-specific write flows for rooms/state docs
  remain deferred.
- The seventh Phase 2 owned API slice is now complete too:
  task mutations now enforce status-transition guardrails and approval-sensitive
  conflict checks.
- This guardrail slice prevents canonical task state from drifting away from
  paused execution state when linked runs still have pending approvals.
- The eighth Phase 2 owned API slice is now complete too:
  canonical operator tasks can now request and display task-scoped approvals.
- This approval-linkage slice adds `task_id`-aware approvals and a direct
  `request approval` action from task-detail, while leaving approval templates
  and deeper task-specific approval UX deferred.
- The ninth Phase 2 owned API slice is now complete too:
  task approvals now carry rationale and requested-change payloads.
- This approval-UX slice makes task-scoped approval review more legible without
  changing the underlying approval decision flow.
- The tenth Phase 2 owned API slice is now complete too:
  the task editor now previews changed fields and approval-sensitive changes
  before save.
- This mutation-hint slice makes approval requirements more legible earlier in
  the operator workflow, without changing the underlying guardrail semantics.
- The eleventh Phase 2 owned API slice is now complete too:
  canonical operator tasks can now be deleted from the shell through a guarded
  `DELETE /api/operator/tasks/:task_id` path.
- This delete slice blocks removal while task-scoped or linked-run approvals
  are still pending, keeps linked execution evidence intact, and surfaces
  backend error payloads directly in the task UI instead of status-only errors.
- The twelfth Phase 2 owned API slice is now complete too:
  canonical operator tasks now support archive-first lifecycle control through
  `archived_at`, plus dedicated archive and restore bridge actions.
- This archive slice hides archived tasks from the default queue, allows
  operators to opt back into viewing them, and requires archive-first
  progression before permanent delete is allowed.
- The thirteenth Phase 2 owned API slice is now complete too:
  archive actions now record `archived_by` and `archive_note`, and archived
  tasks are treated as read-only records until restored.
- A 2026-04-05 post-review follow-up is now applied too:
  archived workspaces reject same-status `PATCH` mutations until reactivated,
  preventing archive metadata rewrites through the generic bridge surface.
- The same follow-up also fixes the dashboard quick-archive affordance:
  archive rationale stays visible before archiving, quick archive is disabled
  until the rationale exists, and dashboard helper coverage now locks that
  behavior in.
- This archive-guardrail slice blocks archived task edits and archived
  task-scoped approval requests, and makes archive rationale a first-class part
  of the task-detail lifecycle UI.
- The fourteenth Phase 2 owned API slice is now complete too:
  task sidebar filters now persist locally, named filter presets can be saved
  and reapplied, and bulk archive / restore can operate on the current filtered
  queue.
- This saved-filter / bulk-action slice stays frontend-local for presets, keeps
  bulk delete deferred, and preserves archive-first rationale requirements even
  when multiple tasks are archived together.
- The fifteenth Phase 2 owned API slice is now complete too:
  task sidebar rows now support per-task selection, and bulk lifecycle actions
  prefer selected tasks before falling back to the filtered queue.
- This selection/reporting slice also upgrades bulk result feedback from a flat
  error summary to a structured success/failure report in the sidebar.
- The sixteenth Phase 2 owned API slice is now complete too:
  canonical operator workspaces now exist as owned objects with list/detail and
  create/update bridge surfaces plus a minimal workspace shell route.
- This workspace slice turns `workspace_ref` into a possible durable link
  target, but still leaves referential integrity and workspace lifecycle policy
  as later work.
- The seventeenth Phase 2 owned API slice is now complete too:
  task/workspace linkage now validates canonical workspace ids and the task
  editor uses workspace selection instead of a free-form workspace field.
- This integrity slice also derives workspace-linked task refs from task truth
  so workspace detail reflects actual task membership rather than trusting
  user-edited workspace task-id payloads.
- The eighteenth Phase 2 owned API slice is now complete too:
  task workspace selection now renders richer canonical workspace context and
  unresolved legacy workspace refs can be migrated in-place from task detail.
- This selector slice is frontend-only and does not add new backend routes, but
  it makes canonical workspace adoption materially easier for existing tasks.
- The nineteenth Phase 2 owned API slice is now complete too:
  workspaces now have the first lifecycle/policy guardrails, including validated
  status transitions, archived-workspace read-only behavior, and archive
  blocking while active linked tasks remain attached.
- This workspace-policy slice also prevents new task links to archived
  workspaces and stops the workspace editor from implying that task membership
  is manually authoritative.
- The twentieth Phase 2 owned API slice is now complete too:
  workspaces now carry archive metadata and rationale, and workspace archiving
  requires an explicit reason instead of only changing status.
- This workspace-archive-metadata slice brings workspace archive behavior closer
  to task archive behavior without introducing a dedicated archive event log yet.
- The twenty-first Phase 2 owned API slice is now complete too:
  workspace detail now loads linked tasks and provides direct detach/archive
  actions to resolve workspace archive blockers in place.
- This blocker-resolution slice adds a targeted task/workspace detach path and a
  workspace-scoped task filter without widening into full bulk resolution flows.

## Guardrails

- Use bounded context from the files in `.conitens/context/`.
- Do not stuff full transcripts into worker prompts.
- Do not auto-edit persona identity core.
- Do not introduce embeddings or vector DB in v0.
- Keep LangGraph core-only and AG2 episode-only.
- Keep the loop state provider-agnostic and independent from planner/worker
  orchestration.
- Keep `progress.md` append-only and reject divergence before appending.
- Keep `.conitens/context/LATEST_CONTEXT.md` as runtime loop digest only.
- Keep `.vibe/context/LATEST_CONTEXT.md` as repo intelligence digest only.
- Keep embeddings and vector search out of the `.vibe` sidecar for v0.
- Keep the fast lane staged-only and the doctor lane explicit.
- Keep typecheck baseline gating regression-only for legacy debt.
- Keep persona shell and identity memory outside automatic mutation paths.
- Keep namespaces isolated during retrieval.
- Read both runtime and repo digests before major work when the task touches
  planning or repo intelligence.
- Prefer one task per iteration unless a batch explicitly groups work.
- Never inject full room transcript by default in execution packets.
- Keep LangGraph behind an interface boundary until the repo has an explicit
  Python dependency surface.
- Keep reflection outputs review-only when they propose patches.
- Keep risky actions behind the approval queue; do not execute them silently.
- Default unknown approval action types to review, not silent allow.
- Resume approvals by `pending_approval_request_id`, not by "latest request".
- Do not mutate resolved approval decisions through the normal adapter path.
- Keep room transcript as UI / replay evidence, not execution source of truth.
- Keep execution packets sourced from persisted state and ContextAssembler.
- Keep AG2 confined behind the replaceable room adapter boundary.
- Keep replay insights evidence-backed and append-only.
- Keep dashboard reads and writes behind consistent loopback + dashboard-token
  boundaries when they expose sensitive operational data.
- Frontend v4.1 is now unblocked only for forward-only work because an explicit
  forward entry mode exists.
- Do not build the new frontend against legacy runtime implicitly.
- Keep the new forward bridge read-only until a later batch explicitly adds
  live updates or mutation paths.
- Keep FE-5 read-only; defer live transport, mutation UI, and graph editing.
- FE-6 approval actions are now available through the forward shell.
- FE-7 remains read-only and uses existing bridge insight data only.
- FE-4 now uses `openForwardEventStream()` through a small hook without adding
  a new transport type.
- For local Claude reviews in this environment, use `claude -p --effort medium`
  with a `300s` timeout and avoid `--bare`.
- A test-only moderate advisory remains under `packages/command-center` via
  `vitest -> vite 5 -> esbuild 0.21.5`; upgrading that path currently breaks
  the repo's `typecheck:test` baseline.
- Treat `.conitens/reviews/batch11_architecture_review.md` as the current audit
  handoff artifact for refactor planning.
- Treat `.conitens/reviews/batch11_refactor_plan.md` as the execution handoff
  artifact for the next refactor prompt.
- Treat `.conitens/reviews/batch11_wave1_execution_plan.md` as the concrete
  implementation checklist for Wave 1.
- Treat `.conitens/reviews/batch11_wave1_1_summary.md` as the outcome note for
  the completed subwave.
- Treat `.conitens/reviews/batch11_wave1_2_summary.md` as the packet-discipline
  outcome note for the completed subwave.
- Treat `.conitens/reviews/batch11_wave1_3_summary.md` as the control-path
  outcome note for the completed subwave.
- Treat `.conitens/reviews/batch11_stabilization_report.md` as the post-Wave 1
  readiness artifact.

## File Pointers

- Plan: `.conitens/context/task_plan.md`
- Repo facts: `.conitens/context/findings.md`
- Status: `.conitens/context/progress.md`
- Loop vocabulary: `.conitens/loops/LOOP_PROTOCOL.md`
- Runtime state: `.conitens/runtime/loop_state.sqlite3`
- Debug mirror: `.conitens/runtime/loop_state.json`
- Repository: `scripts/ensemble_loop_repository.py`
- Batch 1 services: `scripts/ensemble_run_service.py`,
  `scripts/ensemble_iteration_service.py`,
  `scripts/ensemble_state_restore.py`,
  `scripts/ensemble_loop_debug.py`
- Batch 2 services: `scripts/ensemble_context_markdown.py`
- Batch 3 config: `.vibe/config.json`
- Batch 3 brain: `.vibe/brain/context_db.py`,
  `.vibe/brain/indexer.py`, `.vibe/brain/watcher.py`,
  `.vibe/brain/summarizer.py`
- Batch 3 digest: `.vibe/context/LATEST_CONTEXT.md`
- Batch 4 gates: `.vibe/brain/impact_analyzer.py`,
  `.vibe/brain/check_circular.py`,
  `.vibe/brain/check_complexity.py`,
  `.vibe/brain/dependency_hotspots.py`,
  `.vibe/brain/typecheck_baseline.py`,
  `.vibe/brain/precommit.py`,
  `.vibe/brain/doctor.py`,
  `.vibe/brain/run_core_tests.py`
- Hook installer: `scripts/install_hooks.py`
- Batch 5 personas: `.conitens/personas/*.yaml`
- Batch 5 memory module: `scripts/ensemble_persona_memory.py`
- Batch 5 patch zone: `.conitens/personas/candidate_patches/`
- Candidate patch hardening: `scripts/ensemble_agent_registry.py`,
  `scripts/ensemble_improver.py`,
  `tests/test_candidate_patch_hardening.py`
- Batch 6 skills: `.agents/skills/*/SKILL.md`
- Batch 6 loader: `scripts/ensemble_skill_loader.py`
- Batch 7 assembler: `scripts/ensemble_context_assembler.py`
- Batch 7 snapshots: `.conitens/runtime/packet_snapshots/`
- Batch 8 orchestration: `scripts/ensemble_orchestration.py`
- Batch 8 ADR: `docs/adr-0002-langgraph-blocker.md`
- Batch 9 execution loop: `scripts/ensemble_execution_loop.py`
- Batch 10 approval policy: `.agent/policies/approval_actions.yaml`
- Batch 10 approval adapter: `scripts/ensemble_approval.py`
- Batch 10 approval state: `approval_requests` in
  `.conitens/runtime/loop_state.sqlite3`
- Batch 11 room service: `scripts/ensemble_room_service.py`
- Batch 11 replay service: `scripts/ensemble_replay_service.py`
- Batch 11 insight extractor: `scripts/ensemble_insight_extractor.py`
- Batch 11 AG2 room adapter: `scripts/ensemble_ag2_room_adapter.py`
- Batch 11 visible route: `scripts/ensemble_ui.py`
- Batch 11 replay / insight MCP reads: `scripts/ensemble_mcp_server.py`
- Post-Batch11 review: `.conitens/reviews/batch11_architecture_review.md`
- Post-Batch11 refactor plan: `.conitens/reviews/batch11_refactor_plan.md`
- Wave 1 execution plan: `.conitens/reviews/batch11_wave1_execution_plan.md`
- Wave 1-1 summary: `.conitens/reviews/batch11_wave1_1_summary.md`
- Wave 1-2 summary: `.conitens/reviews/batch11_wave1_2_summary.md`
- Wave 1-3 summary: `.conitens/reviews/batch11_wave1_3_summary.md`
- Post-Wave 1 stabilization report: `.conitens/reviews/batch11_stabilization_report.md`
- Current architecture/status overview: `docs/current-architecture-status-ko.md`
- Frontend runtime/service audit: `docs/frontend/RUNTIME_AND_SERVICE_AUDIT.md`
- Frontend control-plane decision: `docs/frontend/CONTROL_PLANE_DECISION.md`
- Frontend BE-1a API: `docs/frontend/BE1A_API.md`
- Frontend state boundary: `docs/frontend/STATE_BOUNDARY.md`
- Frontend room mapping: `docs/frontend/ROOM_MAPPING.md`
- Frontend event mapping: `docs/frontend/EVENT_MAPPING.md`
- Frontend view model: `docs/frontend/VIEW_MODEL.md`
- Frontend mocking policy: `docs/frontend/MOCKING_POLICY.md`
- Frontend bridge boundary: `docs/frontend/BRIDGE_BOUNDARY.md`
- Frontend BE-1b API: `docs/frontend/BE1B_API.md`
- Frontend review doc: `docs/frontend/FRONTEND_REVIEW_2026-04-02.md`
- Paperclip comparative plan: `docs/PAPERCLIP_CONITENS_INTEGRATION_PLAN_2026-04-04.md`
- Paperclip Phase 1 backlog: `docs/PAPERCLIP_CONITENS_PHASE1_BACKLOG_2026-04-04.md`
- Paperclip comparative review artifact:
  `.conitens/reviews/paperclip_conitens_integration_plan_2026-04-04.md`
- Operator summary bridge module:
  `scripts/ensemble_forward_bridge.py`
- Overview summary model:
  `packages/dashboard/src/operator-summary-model.ts`
- Overview summary panel:
  `packages/dashboard/src/components/OperatorSummaryPanel.tsx`
- Operator inbox model:
  `packages/dashboard/src/operator-inbox-model.ts`
- Operator inbox panel:
  `packages/dashboard/src/components/OperatorInboxPanel.tsx`
- Operator agents model:
  `packages/dashboard/src/operator-agents-model.ts`
- Operator tasks repository owner:
  `scripts/ensemble_loop_repository.py`
- Forward operator usage guide: `docs/frontend/FORWARD_OPERATOR_USAGE.md`
- Frontend FE-6 approval center: `docs/frontend/FE6_APPROVAL_CENTER.md`
- Frontend FE-7 insights view: `docs/frontend/FE7_INSIGHTS_VIEW.md`
- Frontend FE-4 live room updates: `docs/frontend/FE4_LIVE_ROOM_UPDATES.md`
- Frontend FE-8 stabilization: `docs/frontend/FE8_STABILIZATION.md`
- Forward runtime entry module: `scripts/ensemble_forward.py`
- Forward bridge module: `scripts/ensemble_forward_bridge.py`
- Forward runtime CLI tests: `tests/test_forward_runtime_mode.py`
- Forward bridge tests: `tests/test_forward_bridge.py`
- Latest office-preview evidence:
  `output/playwright/office-preview-2026-04-03-polish.png`
- Dashboard FE-1 shell: `packages/dashboard/src/App.tsx`
- Dashboard FE-1 client: `packages/dashboard/src/forward-bridge.ts`
- Dashboard FE-1 route: `packages/dashboard/src/forward-route.ts`
- Dashboard FE-1 view model: `packages/dashboard/src/forward-view-model.ts`
- Dashboard FE-1 tests: `packages/dashboard/tests/forward-bridge.test.mjs`
- Forward approval/live tests: `tests/test_forward_live_approval.py`
- Dashboard FE-3 replay panel: `packages/dashboard/src/components/ForwardReplayPanel.tsx`
- Dashboard FE-3 state-docs panel: `packages/dashboard/src/components/ForwardStateDocsPanel.tsx`
- Dashboard FE-3 context panel: `packages/dashboard/src/components/ForwardContextPanel.tsx`
- Dashboard FE-3 room panel: `packages/dashboard/src/components/ForwardRoomPanel.tsx`
- Dashboard FE-5 graph model: `packages/dashboard/src/forward-graph.ts`
- Dashboard FE-5 graph panel: `packages/dashboard/src/components/ForwardGraphPanel.tsx`
- Dashboard FE-5 graph tests: `packages/dashboard/tests/forward-graph.test.mjs`
- Dashboard FE-6 approval panel: `packages/dashboard/src/components/ForwardApprovalCenterPanel.tsx`
- Dashboard FE-7 insights panel: `packages/dashboard/src/components/ForwardInsightsPanel.tsx`
- Dashboard FE-4 hook: `packages/dashboard/src/hooks/use-forward-stream.ts`
- Forward operator flow smoke: `tests/test_forward_operator_flow.py`
- Claude review wrapper: `scripts/ensemble_claude_review.py`
- Claude review wrapper tests: `tests/test_claude_review_wrapper.py`
- Claude auth-check artifact: `.omx/artifacts/claude-claude-auth-check-2026-04-01T19-36-53-767811Z.md`
- Claude timeout artifact: `.omx/artifacts/claude-forward-runtime-entry-contract-timeout-2026-04-01T18-26-12-363Z.md`
- Claude BE-1a review artifact: `.omx/artifacts/claude-be1a-forward-bridge-2026-04-01T18-26-12-363Z.md`
- Claude BE-1b review artifact: `.omx/artifacts/claude-be1b-design-review-2026-04-01T19-53-23-410770Z.md`
- Claude FE-6 review artifact: `.omx/artifacts/claude-fe6-approval-center-review-2026-04-01T20-12-28-388886Z.md`
- Claude FE-7 review artifact: `.omx/artifacts/claude-fe7-insights-review-2026-04-01T20-23-07-599815Z.md`
- Claude FE-4 review artifact: `.omx/artifacts/claude-fe4-live-room-review-2026-04-01T20-38-34-888014Z.md`
- Claude FE-8 review artifact: `.omx/artifacts/claude-fe8-stabilization-review-2026-04-01T20-30-33-510648Z.md`
- Claude FE-0/FE-1 timeout artifact: `.omx/artifacts/claude-fe0-fe1-review-timeout-2026-04-02T03-59-30-000Z.md`
- Claude FE-3 timeout artifact: `.omx/artifacts/claude-fe3-review-timeout-2026-04-02T04-17-00-000Z.md`
- Claude FE-5 review artifact: `.omx/artifacts/claude-fe5-review-2026-04-01T19-29-47-070Z.md`
- Claude latency diagnosis artifact: `.omx/artifacts/claude-latency-diagnosis-2026-04-01T19-29-47-070Z.md`
- Final security hardening review: `.omx/artifacts/claude-security-hardening-final-2026-04-01T04-56-32-526Z.md`
