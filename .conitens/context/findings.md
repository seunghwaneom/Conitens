# findings.md

## Guidance Files Found

- Root guidance: `AGENTS.md`
- Additional root operator guidance: `CLAUDE.md`
- Generated/runtime-scoped `AGENTS.md` files exist under `.notes/` and `.omx/`,
  but the root `AGENTS.md` governs the repository itself.

## Dashboard Frontend Rebaseline Facts

- `packages/dashboard/src/styles.css` had been reduced to token/panel imports
  while live routes still referenced missing global shell classes from the
  removed `styles/shell.css` and `styles/legacy.css`.
- New replacement foundation files now exist at:
  - `packages/dashboard/src/styles/forward-shell.css`
  - `packages/dashboard/src/styles/agent-layout.css`
- The dashboard shell now groups utility routes (`BG CLI`, `Tokens`, `Weekly`)
  separately from the primary operator workbench navigation in
  `packages/dashboard/src/App.tsx`.
- `packages/dashboard/src/components/ThreadBrowser.tsx` now treats no-token
  state as an explicit live-bridge empty state instead of attempting a failing
  fetch.
- `packages/dashboard/src/components/ThreadBrowser.tsx` and
  `packages/dashboard/src/components/ThreadDetail.tsx` now refetch when the
  bearer token changes and guard against stale async updates with cancellation
  flags.
- The thread filter now has a visible label plus `aria-label="Filter threads"`
  and uses `type="search"`, `spellCheck={false}`, and ellipsis-normalized
  placeholder copy.
- Loading copy across touched dashboard surfaces was normalized from `...` to
  `…`.
- `packages/dashboard/vite.config.ts` now declares `test.environment = "jsdom"`
  and `test.setupFiles = "./src/test-setup.ts"`, so dashboard tests no longer
  require per-file jsdom bootstrapping.
- Targeted tests now exist at:
  - `packages/dashboard/src/components/ThreadBrowser.test.tsx`
  - `packages/dashboard/src/components/ThreadDetail.test.tsx`
- Verified commands for this batch:
  - `npx tsc --noEmit -p packages/dashboard/tsconfig.json`
  - `npx vitest run packages/dashboard/src/components/ThreadBrowser.test.tsx packages/dashboard/src/components/ThreadDetail.test.tsx`
  - `npx vitest run --passWithNoTests` from `packages/dashboard`
  - `npx tsc -b packages/dashboard/tsconfig.json`
  - `npx vite build` from `packages/dashboard`
- Fresh Playwright screenshot evidence now exists under:
  - `output/playwright/frontend-rebaseline/.playwright-cli/page-2026-04-09T05-42-58-160Z.png`
  - `output/playwright/frontend-rebaseline/.playwright-cli/page-2026-04-09T05-43-15-610Z.png`
  - `output/playwright/frontend-rebaseline/.playwright-cli/page-2026-04-09T05-43-30-269Z.png`

## Codex Frontend Design Review 2026-04-09

- The current official OpenAI Codex frontend design use case is
  `Build responsive front-end designs` on the Codex use-cases page, and the
  associated OpenAI frontend guide reinforces strong references, explicit
  design-system constraints, and tool-assisted verification rather than
  underspecified prompting.
- Fresh local Playwright evidence now exists for the current dashboard shell:
  - `output/playwright/dashboard-overview-20260409-1440.png`
  - `output/playwright/dashboard-inbox-20260409-1440.png`
  - `output/playwright/dashboard-tasks-20260409-1440.png`
  - `output/playwright/dashboard-runs-20260409-1440.png`
  - `output/playwright/dashboard-office-preview-20260409-1440.png`
  - `output/playwright/dashboard-overview-20260409-820.png`
  - `output/playwright/dashboard-office-preview-20260409-820.png`
- Browser console inspection during that run showed `0` errors / `0` warnings.
- The top shell still overloads the header with 9 primary tabs, 3 utility tabs,
  and API/token meta in the same chip cluster via `packages/dashboard/src/App.tsx`
  and `packages/dashboard/src/styles/forward-shell.css`; the resulting narrow
  uppercase chip rows remain scan-heavy, especially in the `820px` capture.
- `packages/dashboard/src/screens/ForwardDashboardScreen.tsx` still forces a
  persistent left list + right detail split for overview, inbox, tasks, and
  runs, while `packages/dashboard/src/styles/live-panels.css` hard-codes the
  sidebar width to `344px`; fresh screenshots show that this steals meaningful
  space from the actual operator detail surfaces on every route.
- The demo onboarding / connect-to-bridge chrome still occupies the top fold on
  overview and runs (`OnboardingOverlay.tsx` plus `ForwardDashboardScreen.tsx`)
  before the user reaches actionable operator state.
- The spatial lens remains visually distinctive on desktop, but the `820px`
  capture shows that stacking six room scenes vertically turns it into a long
  poster-scroll instead of an operational drill-down; the current mobile
  fallback is driven by `office.module.css` and `office-stage.module.css`.
- Existing repo strategy already aligns with this review: `docs/adr-0002-product-surface-persistent-agents.md`
  demotes office-preview to secondary navigation, and
  `.conitens/reviews/paperclip_conitens_integration_plan_2026-04-04.md`
  recommends a persistent operator-object rail plus an attention-led top strip.

## Core Operator Routes Refactor 2026-04-09

- `packages/dashboard/src/App.tsx` now reduces the shell to four primary
  routes (`Overview`, `Inbox`, `Tasks`, `Runs`) and moves the rest into a
  secondary `More` surface plus a compact bridge-status cluster.
- `packages/dashboard/src/screens/AppRouter.tsx` now routes `overview`,
  `inbox`, `tasks`/`task-detail`, and `runs` through dedicated screens instead
  of falling back to `ForwardDashboardScreen`.
- New route screens now exist for the primary operator surfaces:
  - `packages/dashboard/src/screens/OverviewScreen.tsx`
  - `packages/dashboard/src/screens/InboxScreen.tsx`
  - `packages/dashboard/src/screens/TasksScreen.tsx`
  - `packages/dashboard/src/screens/RunsScreen.tsx`
- New shared route scaffolding now exists at:
  - `packages/dashboard/src/components/CoreRouteScaffold.tsx`
  - `packages/dashboard/src/components/CoreRouteScaffold.module.css`
- New hook boundaries now exist for the refactored routes:
  - `packages/dashboard/src/hooks/useBridgeStatus.ts`
  - `packages/dashboard/src/hooks/useOperatorSummaryData.ts`
  - `packages/dashboard/src/hooks/useOperatorInboxData.ts`
  - `packages/dashboard/src/hooks/useOperatorTasksData.ts`
  - `packages/dashboard/src/hooks/useRunsData.ts`
- `packages/dashboard/src/components/OperatorInboxPanel.tsx` plus
  `OperatorInboxPanel.module.css` now render the inbox as a denser list-first
  queue rather than a stack of card-like rows.
- `packages/dashboard/src/office.module.css` and
  `packages/dashboard/src/office-stage.module.css` now support a room-focus
  mobile fallback: a room strip selects the currently surfaced room, and the
  stage only renders the selected room at `<= 820px`.
- `packages/dashboard/src/forward-route.ts` now falls back to `overview` rather
  than `runs` for unrecognized hashes.
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
- Local verification now passes for:
  - `./node_modules/.bin/tsc --noEmit -p packages/dashboard/tsconfig.json`
  - `../../node_modules/.bin/tsc -b tsconfig.json && ../../node_modules/.bin/vite build --config vite.config.ts`
- `vitest run --passWithNoTests` still exits with code `1` in this environment
  while printing only the runner banner, so package tests remain unverified for
  this slice.
- Claude review artifact now exists at:
  - `.omx/artifacts/claude-frontend-core-routes-refactor-2026-04-09T10-01-05-586313Z.md`
- The Claude review's immediately actionable findings were applied:
  - `useRunsData` detail refresh now includes `liveRevision`
  - overview run rail now distinguishes loading from empty state
  - inbox rows no longer force an always-active class
  - hash fallback now returns `overview`
- Claude still flags two notable follow-ups:
  - `Runs` selection is still ephemeral in-page state rather than URL-committed
  - `useOperatorTasksData` remains a large all-in-one hook and should be split
    further in a later cleanup slice

## Core Route Risk Follow-up 2026-04-09

- `packages/dashboard/src/store/ui-store.ts` now persists a `locale` setting
  (`ko` / `en`) in local storage and applies it to `document.documentElement.lang`.
- `packages/dashboard/src/i18n.ts` now provides shared locale helpers for
  shell/core-route strings and common workflow/status labels.
- `packages/dashboard/src/App.tsx` now exposes a shell-level language toggle and
  localizes the compact primary nav, `More` menu, and bridge status labels.
- `packages/dashboard/src/components/CoreRouteScaffold.tsx` now localizes bridge
  tray copy and marks `apiRoot` / `token` as required form inputs.
- `packages/dashboard/src/screens/OverviewScreen.tsx`,
  `InboxScreen.tsx`, `TasksScreen.tsx`, and `RunsScreen.tsx` now localize their
  route headers and core static copy through the shared locale helpers.
- `packages/dashboard/src/components/OperatorSummaryPanel.tsx`,
  `OperatorInboxPanel.tsx`, `OperatorTaskDetailPanel.tsx`, and
  `OperatorTaskEditorPanel.tsx` now localize their static panel chrome and key
  labels, while live runtime payload text remains pass-through.
- `packages/dashboard/src/forward-route.ts` now supports `#/runs?selected=<id>`
  so the currently selected run in the `Runs` screen is URL-committed without
  colliding with `#/runs/<id>` for the full detail route.
- `packages/dashboard/src/hooks/useRunsData.ts` now accepts route-selected run
  state and keeps detail refresh synchronized with `liveRevision`.
- `packages/dashboard/src/screens/RunsScreen.tsx` now writes the selected run
  back into the `runs` route hash, including demo mode, which makes refresh and
  back/forward behavior consistent with the browser summary pane.
- `packages/dashboard/src/office.module.css` now changes the mobile room strip
  from a cramped two-column grid into a horizontal scrolling strip, reducing
  pre-stage vertical growth on narrow widths.
- Fresh Playwright verification now confirms:
  - `#/runs?selected=demo-run-001` is written after selecting the run in the
    refactored `Runs` screen
  - the shell can toggle between Korean and English
  - the risk-fix English capture now exists at
    `output/playwright/dashboard-runs-20260409-riskfix-en-1440.png`
- Remaining known frontend risks after this follow-up:
  - some live runtime strings from payload/view-model layers remain English and
    are not yet fully localized
  - the default local `vitest` invocation still exits through the broken
    `omx-host-shims/node` path in this environment unless the real Node binary
    is invoked directly

## Residual Risk Cleanup 2026-04-09

- `packages/dashboard/src/hooks/useOperatorTasksData.ts` no longer carries all
  task-route logic inline; derived state now lives in
  `packages/dashboard/src/hooks/useOperatorTaskDerived.ts` and mutation/action
  logic now lives in
  `packages/dashboard/src/hooks/createOperatorTaskActions.ts`.
- That split reduces the main hook's responsibility to store wiring,
  fetch/sync effects, and composition, lowering the likelihood of future
  cross-cutting regressions in the task route.
- The lingering `vitest` ambiguity is now resolved to an environment issue, not
  a repo code issue:
  - `cd packages/dashboard && CI=1 ./node_modules/.bin/vitest run ...` still
    fails because worker forks try to spawn
    `C:\\Users\\eomsh\\.codex\\omx-host-shims\\node` and hit `ENOENT`
  - `cd packages/dashboard && CI=1 '/mnt/c/Program Files/nodejs/node.exe' ./node_modules/vitest/vitest.mjs run --passWithNoTests`
    now passes the full dashboard suite (`8` files / `46` tests)
- Verified targeted examples for the same workaround:
  - `src/ds/Badge.test.tsx` passes
  - `src/components/ThreadBrowser.test.tsx` passes
- Remaining meaningful frontend risks after this cleanup:
  - full bilingual support is not complete yet because live payload-derived text
    and utility surfaces like `Background CLI`, `Token Budget`, and
    `Weekly Report` still remain mostly English
  - route-level accessibility looks consistent after the `<main>` audit, but no
    automated a11y check has been added

## Secondary Locale + Test Script Stabilization 2026-04-09

- `packages/dashboard/src/components/AgentFleetOverview.tsx`,
  `AgentProfilePanel.tsx`, and `ProposalQueuePanel.tsx` now respect the shared
  `ko` / `en` locale toggle for their static/operator-facing copy.
- `packages/dashboard/src/components/ApprovalCenter.tsx`,
  `ThreadBrowser.tsx`, and `ThreadDetail.tsx` now also respect the shared
  locale toggle for their primary UI copy and empty/loading states.
- The thread component tests were updated to match the new Korean default UI:
  - `packages/dashboard/src/components/ThreadBrowser.test.tsx`
  - `packages/dashboard/src/components/ThreadDetail.test.tsx`
- A repo-local Vitest launcher now exists at
  `packages/dashboard/scripts/run-vitest.cjs`. It resolves a real Node
  executable first and then launches `vitest.mjs`, avoiding the broken
  `omx-host-shims/node` worker path in this environment.
- `packages/dashboard/package.json` now points its `test` script at that
  wrapper, so the package can be tested through the normal package script path.
- Verified commands for the stabilized test path:
  - `cd packages/dashboard && node ./scripts/run-vitest.cjs --passWithNoTests`
  - result: `8` files / `46` tests passed
- The direct `vitest` binary path still reproduces the environment bug:
  - `spawn C:\\Users\\eomsh\\.codex\\omx-host-shims\\node ENOENT`
  - this is now explicitly an environment/runtime shim issue, not a failing
    dashboard code path

## Forward Bridge Browser Auth Facts

- Browser-based live bridge fetches were failing even with a valid bearer token.
- Shell-level `curl` to the same bridge/token returned `200`, while browser
  fetches returned `403` and then `CORS` failures, proving the issue sat in the
  browser auth/preflight path rather than repository state or token issuance.
- `packages/dashboard/src/forward-bridge-auth.ts` now sends both:
  - `Authorization: Bearer <token>`
  - `X-Conitens-Forward-Token: <token>`
- `scripts/ensemble_forward_bridge.py` now:
  - accepts either bearer auth or `X-Conitens-Forward-Token`
  - echoes requested auth headers back through `Access-Control-Allow-Headers`
    for loopback preflight responses
- `scripts/ensemble_approval.py` now emits canonical approval event types
  directly instead of relying on unsupported legacy uppercase names.
- `scripts/ensemble_allowed_events.py` now resolves the legacy approval and
  execution-loop names still emitted by older Conitens paths, including
  `APPROVAL_*`, `APPROVED`, `APPROVE_DENIED`, `WORKER_EXECUTED`,
  `VALIDATOR_*`, `REFLECTION_RECORDED`, and `INSIGHT_EXTRACTED`.
- `scripts/ensemble_insight_extractor.py` now treats mirrored ops-event writes
  as best-effort so unsupported telemetry cannot abort insight extraction.
- Raw-fetch dashboard surfaces that were still hand-rolling auth headers now
  use the shared auth helper, including threads, agent detail/list, approvals,
  background CLI, token budget, weekly report, and stream helpers.
- Ad hoc Python verification now confirms the fallback header path:
  `GET /api/runs` with `X-Conitens-Forward-Token` returns `200`.
- Fresh Playwright live evidence now exists showing successful live operator
  loads against a real bridge on port `8799`:
  - `output/playwright/live-bridge-verify-2026-04-09/.playwright-cli/page-2026-04-09T06-21-58-171Z.png`
  - `output/playwright/live-bridge-verify-2026-04-09/.playwright-cli/page-2026-04-09T06-22-29-890Z.png`
  - `output/playwright/live-bridge-verify-2026-04-09/.playwright-cli/page-2026-04-09T06-22-46-423Z.png`
- Python verification now passes for:
  - `tests.test_forward_bridge`
  - `tests.test_forward_live_approval`
  - targeted `tests.test_approval_controls.ApprovalControlTests.test_audit_trail_is_persisted`
- `test_approval_decision_and_resume_round_trip` now uses a `20s` timeout for
  the resume call because the real approved-resume path completes correctly but
  crossed the original `10s` threshold in this environment.

## Verified Repo Facts

- Root package manager is `pnpm@9.15.0`.
- The workspace is a pnpm monorepo covering `packages/*`.
- Current CLI entry is `bin/ensemble.js`, which delegates to `scripts/ensemble.py`.
- Current active runtime truth is documented as `scripts/ensemble.py` plus
  `.notes/` and `.agent/`.
- UI entry points exist in `packages/dashboard/src/main.tsx` and
  `packages/command-center/src/main.tsx`.
- Desktop entry point exists in `packages/command-center/electron/main.ts`.
- The TUI package exports from `packages/tui/src/index.ts`.
- No root lint command or lint config was found during this scan.
- No reusable SQLite repository or migration layer was found in the current
  Python runtime code.
- Existing Python test coverage already uses `unittest` under `tests/`.
- `docs/shared/agent-tiers.md` is currently missing.

## Post-Wave 1 Architecture Documentation

- `docs/current-architecture-status-ko.md` is the new current-state overview
  document for humans who need the present architecture and code status in one
  place.
- `docs/architecture.md` is not an adequate current-state reference; it reads
  like an older concept sketch rather than the present operational map.
- The new overview explicitly documents the split between active runtime truth
  (`scripts/ensemble.py` + `.notes/` + `.agent/`) and the additive forward
  `.conitens` / `scripts/ensemble_*.py` stack.
- The new overview also records the Wave 1 source-of-truth decisions, packet
  discipline outcomes, control-path simplifications, replay/approval/security
  status, and the remaining structural risks called out by the architecture
  review and stabilization pass.

## Frontend Rebaseline v4.1 Audit Facts

- `docs/conitens_frontend_rebaseline_v4_1.md` requires a control-plane gate:
  frontend work is blocked until the forward stack is promoted or an explicit
  `--forward` mode exists.
- `packages/protocol/src/event.ts` exists and provides a canonical event
  registry for frontend/event mapping work.
- `scripts/ensemble_room.py` exists, so the v4.1 pre-flight room artifact check
  passes.
- `.conitens/context/task_plan.md` exists, so the v4.1 pre-flight forward-mode
  context artifact check passes.
- `bin/ensemble.js` still delegates only to `scripts/ensemble.py`.
- No explicit `--forward` mode was found in current entrypoint-facing runtime
  files during the audit.
- Forward service modules are importable without full runtime bootstrapping:
  `ensemble_loop_repository`, `ensemble_context_markdown`,
  `ensemble_room_service`, `ensemble_replay_service`,
  `ensemble_insight_extractor`, `ensemble_approval`,
  `ensemble_context_assembler`.
- `scripts/ensemble_ui.py` already provides a lightweight local Python HTTP
  surface using stdlib `BaseHTTPRequestHandler` / `ThreadingHTTPServer`; no
  established FastAPI/Flask surface was found.
- Existing frontend stack already exists in `packages/dashboard` and
  `packages/command-center` with React 19, Vite, and zustand.
- The v4.1 audit outcome is that frontend implementation remains blocked until
  an explicit forward-runtime entry contract exists.

## Frontend Forward Entry Contract Facts

- `scripts/ensemble_forward.py` now provides an additive read-only forward
  runtime surface.
- `scripts/ensemble.py` now exposes:
  - `forward status`
  - `forward context-latest`
  - compatibility alias `--forward status`
- The new forward contract is explicitly read-only and does not promote the
  forward stack to active runtime truth.
- `forward context-latest` preserves the runtime/repo digest split instead of
  collapsing `.conitens/context/LATEST_CONTEXT.md` and
  `.vibe/context/LATEST_CONTEXT.md`.
- Focused regression coverage now exists in
  `tests/test_forward_runtime_mode.py`.
- `docs/shared/agent-tiers.md` is still missing, so the ultrawork skill had to
  fall back to the session model-routing table instead of the requested repo
  tier reference.
- Claude CLI consultation was attempted but timed out; the timeout artifact is
  `.omx/artifacts/claude-forward-runtime-entry-contract-timeout-2026-04-01T18-26-12-363Z.md`.

## Frontend BE-1a Bridge Facts

- `scripts/ensemble_forward_bridge.py` now provides a forward-only read bridge
  on loopback.
- `scripts/ensemble.py` now exposes `forward serve`.
- Implemented GET routes:
  - `/api/runs`
  - `/api/runs/:id`
  - `/api/runs/:id/replay`
  - `/api/runs/:id/state-docs`
  - `/api/runs/:id/context-latest`
  - `/api/rooms/:id/timeline`
- The bridge uses forward persisted state/services only and does not claim that
  the legacy runtime is replaced.
- `state-docs` and `context-latest` keep runtime and repo digests separate.
- Bridge state-doc path fields are workspace-relative rather than absolute.
- Root HTML no longer sets an auth cookie; bridge reads require bearer token
  plus loopback.
- Claude BE-1a review artifact is
  `.omx/artifacts/claude-be1a-forward-bridge-2026-04-01T18-26-12-363Z.md`.

## Frontend FE-0 / FE-1 Facts

- FE-0 docs now exist:
  - `docs/frontend/EVENT_MAPPING.md`
  - `docs/frontend/VIEW_MODEL.md`
  - `docs/frontend/MOCKING_POLICY.md`
  - `docs/frontend/BRIDGE_BOUNDARY.md`
- FE-1 shell now lives in `packages/dashboard/src/App.tsx`.
- FE-1 uses:
  - `packages/dashboard/src/forward-bridge.ts`
  - `packages/dashboard/src/forward-route.ts`
  - `packages/dashboard/src/forward-view-model.ts`
- FE-1 connects to the forward bridge with `apiRoot + bearer token`.
- FE-1 loads real run data from `GET /api/runs`.
- FE-1 navigates by hash route to `#/runs/:id` and loads `GET /api/runs/:id`.
- FE-1 does not introduce writes, live transport, replay UI, or room compose.
- Typed parser/route/view-model tests now exist in
  `packages/dashboard/tests/forward-bridge.test.mjs`.
- Claude FE-0/FE-1 review attempt timed out; artifact:
  `.omx/artifacts/claude-fe0-fe1-review-timeout-2026-04-02T03-59-30-000Z.md`.

## Frontend FE-3 Facts

- FE-3 read-only operational panels now exist in:
  - `packages/dashboard/src/components/ForwardReplayPanel.tsx`
  - `packages/dashboard/src/components/ForwardStateDocsPanel.tsx`
  - `packages/dashboard/src/components/ForwardContextPanel.tsx`
  - `packages/dashboard/src/components/ForwardRoomPanel.tsx`
- `packages/dashboard/src/App.tsx` now loads:
  - `GET /api/runs/:id/replay`
  - `GET /api/runs/:id/state-docs`
  - `GET /api/runs/:id/context-latest`
  - `GET /api/rooms/:id/timeline` when room data exists
- Runtime digest and repo digest remain separate in the UI model and payload
  path.
- FE-3 remains read-only: no writes, no live transport, no router library, no
  legacy runtime fallback.
- FE-3 parser coverage was added to `packages/dashboard/tests/forward-bridge.test.mjs`.
- Claude FE-3 review attempt timed out; artifact:
  `.omx/artifacts/claude-fe3-review-timeout-2026-04-02T04-17-00-000Z.md`.

## Frontend FE-5 Facts

- FE-5 graph/state derivation now lives in
  `packages/dashboard/src/forward-graph.ts`.
- FE-5 graph panel now lives in
  `packages/dashboard/src/components/ForwardGraphPanel.tsx`.
- FE-5 uses only existing run detail, replay, and room timeline data.
- FE-5 remains read-only and does not introduce graph editing or live
  transport.
- FE-5 graph coverage now exists in
  `packages/dashboard/tests/forward-graph.test.mjs`.
- Claude FE-5 review succeeded with a narrowed invocation profile and accepted
  the scope as appropriate.

## Claude Latency Diagnosis

- `claude -p "Reply with exactly OK."` took about `15s`.
- `claude -p --bare --effort low ...` was much faster but failed in this
  environment with `Not logged in`, because bare mode bypasses the available
  auth path.
- `claude -p --effort low "<narrow review prompt>"` returned successfully in
  about `47s`.
- Practical fix in this environment:
  - use narrow review prompts
  - use `--effort low`
  - do not use `--bare` unless explicit API-key auth is configured
- Diagnosis artifact:
  `.omx/artifacts/claude-latency-diagnosis-2026-04-01T19-29-47-070Z.md`.

## Claude Review Reliability Facts

- `claude auth status` reports a logged-in first-party Claude Code session:
  - `loggedIn: true`
  - `authMethod: claude.ai`
  - `email: eomshwan@gmail.com`
- The user-requested stable profile now verified in this environment is:
  - `claude -p --effort medium "<prompt>"`
  - timeout `300` seconds
- A reusable helper now exists at
  `scripts/ensemble_claude_review.py`.
- Focused wrapper coverage now exists at
  `tests/test_claude_review_wrapper.py`.
- Verified wrapper artifact:
  `.omx/artifacts/claude-claude-auth-check-2026-04-01T19-36-53-767811Z.md`
- `--bare` remains unsuitable here because it reports `Not logged in` under the
  current auth setup.

## Frontend BE-1b Facts

- `scripts/ensemble_forward_bridge.py` now exposes:
  - `GET /api/approvals`
  - `GET /api/approvals/:request_id`
  - `POST /api/approvals/:request_id/decision`
  - `POST /api/approvals/:request_id/resume`
  - `GET /api/events/stream`
- `GET /api/events/stream` now emits:
  - `snapshot`
  - `heartbeat`
- SSE currently uses a query-token pattern because browser `EventSource`
  cannot set custom auth headers.
- `packages/dashboard/src/forward-bridge.ts` now has typed helpers for:
  - `forwardListApprovals`
  - `forwardGetApproval`
  - `forwardDecideApproval`
  - `forwardResumeApproval`
  - `openForwardEventStream`
- Resume now guards against stale request IDs by checking that the request
  matches the run's active `pending_approval_request_id`.
- Claude BE-1b review artifact:
  `.omx/artifacts/claude-be1b-design-review-2026-04-01T19-53-23-410770Z.md`

## Frontend FE-6 Facts

- FE-6 approval center now lives in
  `packages/dashboard/src/components/ForwardApprovalCenterPanel.tsx`.
- FE-6 uses the typed forward bridge helpers rather than the older
  `ApprovalGate.tsx` event-only mock behavior.
- FE-6 shows:
  - approval list
  - approval detail
  - reviewer note input
  - approve / reject / resume actions
- FE-6 intentionally defers `edited_payload` editing.
- FE-6 doc lives in `docs/frontend/FE6_APPROVAL_CENTER.md`.
- Claude FE-6 review artifact:
  `.omx/artifacts/claude-fe6-approval-center-review-2026-04-01T20-12-28-388886Z.md`

## Frontend FE-7 Facts

- FE-7 insights panel now lives in
  `packages/dashboard/src/components/ForwardInsightsPanel.tsx`.
- FE-7 uses existing data only:
  - `replay.insights`
  - `roomTimeline.insights`
  - `stateDocs.documents.findings.content`
  - `replay.validator_history`
- FE-7 adds no new backend route and no new insight-specific backend domain
  model.
- FE-7 intentionally keeps raw JSON fallback per insight card because the
  bridge insight shape is still loosely typed.
- FE-7 doc lives in `docs/frontend/FE7_INSIGHTS_VIEW.md`.
- Claude FE-7 review artifact:
  `.omx/artifacts/claude-fe7-insights-review-2026-04-01T20-23-07-599815Z.md`

## Frontend FE-8 Facts

- `packages/dashboard/src/components/ApprovalGate.tsx` was removed as a dead
  event-only mock surface.
- `packages/dashboard/src/forward-bridge.ts` now explicitly marks
  `openForwardEventStream()` as deferred for FE-4.
- `tests/test_forward_operator_flow.py` now covers the operator path:
  load runs -> load approvals -> decide -> resume -> verify detail.
- `docs/conitens_frontend_rebaseline_v4_1.md` now marks implemented FE phases
  as superseded-by-implementation.
- `docs/frontend/FE8_STABILIZATION.md` records the scoped stabilization pass.
- Claude FE-8 review artifact:
  `.omx/artifacts/claude-fe8-stabilization-review-2026-04-01T20-30-33-510648Z.md`

## Batch 1 Placement And Migration Strategy Used

- New persistence code lives in additive Python modules under `scripts/`.
- The primary state store is `.conitens/runtime/loop_state.sqlite3`.
- The debug mirror is `.conitens/runtime/loop_state.json`.
- Schema bootstrap uses `sqlite3` stdlib plus `PRAGMA user_version`.
- Migration version `1` creates `runs`, `iterations`, `validator_results`,
  `stop_conditions`, and `escalations`.

## Batch 2 Markdown Mapping

- `task_plan.md` is generated from persisted structured plan state keyed by
  `run_id`, including current plan, objective, ordered steps, owner, and
  acceptance criteria.
- `findings.md` is generated from categorized persisted findings entries using
  the categories `discovery`, `constraint`, `failed_hypothesis`,
  `validation_issue`, and `dependency_note`.
- `progress.md` is generated from persisted append-only progress entries with
  `timestamp`, `run_id`, `iteration_id`, `actor`, and `summary`.
- `LATEST_CONTEXT.md` is derived from the current plan, the active run/step,
  blockers from findings, recent decisions, and next actions.

## Batch 2 Tradeoffs

- The markdown files are deterministic projections of persisted state; they are
  not treated as the sole structured source of truth.
- `progress.md` prioritizes append-only guarantees over manual editing
  convenience and rejects divergence before appending.
- Manual notes are only preserved where practical in non-audit files; strict
  round-trip fidelity is intentionally not guaranteed.

## Batch 3 Repo Intelligence Design

- Batch 3 supports the first-pass globs `*.py`, `*.ts`, `*.tsx`, `*.js`,
  `*.mjs`, and `*.cjs`, with repo-specific coverage focused on `scripts/`,
  `tests/`, `packages/`, and `.vibe/brain/`.
- `.vibe/context/LATEST_CONTEXT.md` is a separate repo-intelligence digest and
  remains distinct from `.conitens/context/LATEST_CONTEXT.md`.
- The sidecar is SQLite-first and uses FTS5 when available, with a fallback
  plain table for the `fts` surface.
- Parsing stays heuristic and resilient: function candidates, exported markers,
  dependency edges, and nearby doc comments are extracted without AST-perfect
  guarantees.
- The real repo scan covered 592 files on the current tree.

## Batch 3 Tradeoffs

- The parser is intentionally heuristic; it optimizes for agent navigation and
  repo summaries rather than compiler-grade correctness.
- The watcher uses polling plus debounce instead of filesystem-specific event
  dependencies, which keeps it portable but less instant.
- The current summarizer favors structural hotspots and exported symbols over
  semantic ranking because embeddings/vector search are explicitly out of scope.

## Batch 4 Quality Gate Design

- The fast lane is staged-only and intentionally narrow: impact analysis,
  cycle blocking, baseline-gated typecheck where available, and complexity
  warnings.
- The slow lane stays explicit in `doctor.py`: full scan, digest refresh,
  hotspot report, cycle detection, and optional slower checks.
- Only `@conitens/command-center` currently exposes package-local `typecheck`
  scripts, so baseline gating degrades gracefully for other touched areas.
- `scripts/install_hooks.py` installs a pre-commit hook that chains the `.vibe`
  fast lane without requiring repo-wide formatting or doc generation.

## Batch 4 Tradeoffs

- The measured fast lane on the current repo is about 13.6 seconds for three
  files, so it is usable but not yet at the ideal “few seconds” target.
- Baseline gating is package-aware, not whole-monorepo aware, because the repo
  does not yet expose consistent standalone typecheck surfaces outside
  `command-center`.

## Batch 4 Runtime Validation

- The measured fast lane on the current repo was about 11.1 seconds for an
  explicit one-file run that still triggered the cheap Python smoke suite.
- The real doctor flow found two existing dependency cycles under
  `packages/command-center/src/scene/*` and baseline regressions in
  `@conitens/command-center::typecheck` and `typecheck:test`.
- Full `python -m unittest discover tests` now passes, so the Python discovery
  surface is coherent across both the new Batch 4 gate tests and the older
  legacy `.vibe` tests.

## Batch 5 Persona And Memory Design

- Persona shell files live under `.conitens/personas/*.yaml` and stay small and
  human-reviewable.
- Long-term memory is persisted in SQLite as `memory_records`, scoped by
  `agent_id` plus `namespace`.
- Candidate self-improvement or policy changes are written to a separate review
  zone under `.conitens/personas/candidate_patches/` and mirrored in
  `candidate_policy_patches`.
- Retrieval is namespace-scoped and excludes identity memory and unapproved
  patches by default.

## Batch 5 Tradeoffs

- Persona shell remains file-first while memory and patch metadata are DB-backed;
  that split favors reviewability over a single storage format.
- Identity memory and persona core are intentionally excluded from automatic
  writes, even if that means some self-improvement candidates require manual
  review before they become retrievable.
- Memory records store summaries plus evidence references, not full transcript
  payloads, so retrieval stays compact and reviewable.

## Batch 6 Skill Packaging Design

- `.agent/skills/*.yaml` remains the canonical control-plane skill registry for
  existing Conitens surfaces, while `.agents/skills/*/SKILL.md` is now the
  OpenHands-compatible progressive-disclosure layer.
- The new loader is local and stdlib-only in
  `scripts/ensemble_skill_loader.py`; no direct OpenHands runtime dependency was
  added.
- Metadata-only loading reads markdown frontmatter first; full skill content is
  loaded on demand.
- Persona `default_skill_refs` now resolve against the `.agents/skills` loader,
  and `conitens-architect` was updated from `plan` to `plan-scope` to match the
  actual packaged skill name.

## Batch 6 Tradeoffs

- The repo now has two skill surfaces by design: `.agent/skills` for canonical
  runtime metadata and `.agents/skills` for compatibility/progressive
  disclosure. Batch 6 adds a bridge loader rather than collapsing them.
- Invalid SKILL.md files are rejected on direct load, but skipped during
  availability listing so one broken skill file does not hide every valid skill.
- I did not add a `.plugin/plugin.json` skeleton because the current repo
  already has a clear package boundary and a local compatibility loader was
  sufficient.

## Batch 8 LangGraph Suitability

- `langgraph` and `langchain_core` are not installed in the current Python
  surface.
- The repo still has no declared Python dependency manager (`pyproject.toml`,
  `requirements.txt`, or equivalent).
- Direct LangGraph adoption in this batch would require inventing a new Python
  dependency boundary first, which is exactly the architectural sprawl the
  batch told us to avoid.

## Batch 8 Fallback Design

- The repo now has local `PlannerGraph` and `BuildGraph` interfaces in
  `scripts/ensemble_orchestration.py`.
- Checkpointing is persisted in the existing loop SQLite store through
  `orchestration_checkpoints`.
- Planner/build separation, retry persistence, and resume hooks are real; the
  worker/validator nodes remain thin stubs for later replacement.
- The blocker and fallback are documented in
  `docs/adr-0002-langgraph-blocker.md`.

## Batch 9 Execution Loop Design

- Batch 9 keeps `BuildGraph` as the outer orchestration owner and adds the
  working iterative loop inside that boundary.
- The worker consumes `TaskContextPacket`, loads relevant skills, writes an
  artifact, and appends progress plus execution events.
- The validator evaluates acceptance criteria, persists validator results, and
  writes structured findings/progress on failure.
- The retry controller persists retry decisions with the policy:
  same-worker retry, planner revise, specialist swap, then human escalation.
- The reflector writes `reflection` and `episodic` memory plus unapproved
  procedural patch candidates only.

## Batch 9 Tradeoffs

- The default validator rule only hard-fails criteria expressed as
  `artifact_contains:<token>`; broader semantic validation is still deferred.
- Reflection writes review-only candidate patches rather than mutating persona
  shell or identity memory directly.
- The loop reuses the existing packet assembler and markdown/runtime digests
  instead of adding a second prompt/context path.

## Batch 10 Approval Insertion Points

- The narrowest viable approval interception point is
  `scripts/ensemble_execution_loop.py`, immediately after worker artifact
  emission and before validator execution.
- The approval pause / resume owner is `BuildGraph` in
  `scripts/ensemble_orchestration.py`, because it already owns checkpoint state
  and resume semantics.
- Approval persistence belongs in the existing loop SQLite store so audit and
  replay stay in one place rather than splitting into a second control-plane DB.
- Policy definition lives under `.agent/policies/approval_actions.yaml`, which
  matches the repo's existing control-plane surface better than inventing a new
  policy root.

## Batch 10 Approval Design

- Approval requests are persisted in `approval_requests` with request id, run /
  iteration ids, actor, action type, payload, risk level, status, reviewer
  fields, and timestamps.
- Unknown action types now default to `review` unless policy explicitly says
  otherwise, so novel risky categories do not silently bypass the queue.
- Resume is bound to `pending_approval_request_id`, not to the latest approval
  row in an iteration.
- Approved or edited decisions resume the suspended worker path and re-run
  validation instead of fabricating completion.
- Rejected decisions write back into findings, progress, and validator-visible
  failure state so the next iteration context can see the rejection reason.

## Batch 10 Tradeoffs

- Approval immutability is enforced in the adapter path rather than at the
  SQLite schema layer; direct repository callers still need discipline.
- The policy file is re-read on each classification call. That keeps edits live
  without a cache invalidation path, at the cost of a small per-call file read.
- Approval records expose both `action_payload_json` and `action_payload` in the
  decoded repository shape to keep older callers stable while making the
  runtime-facing payload name explicit.
- `approval_requests` currently has no foreign-key constraint back to `runs` /
  `iterations`, so orphan cleanup still depends on application discipline.

## Batch 11 Existing UI / API Surfaces

- A lightweight authenticated debug web UI already exists in
  `scripts/ensemble_ui.py`, including `/api/dashboard`, room creation, room
  detail fetch, and timeline rendering.
- `packages/dashboard` is a visible web UI surface, and
  `packages/command-center` already has richer replay components, but Batch 11
  can land faster and with less blast radius by extending `ensemble_ui.py`.
- Existing room artifacts already live under `.notes/rooms/*.json` and
  `.notes/rooms/*.jsonl`.
- Existing handoff artifacts already live under `.notes/handoffs/*.json`.
- Existing replay/event evidence already lives under `.notes/events/events*.jsonl`.

## Batch 11 Collaboration And Replay Design

- Batch 11 keeps the visible room transcript as UI / replay evidence and adds a
  parallel SQLite projection for `rooms`, `messages`, `tool_events`,
  `insights`, and `handoff_packets`.
- `scripts/ensemble_room.py` now dual-writes new room activity into both the
  legacy `.notes/rooms` files and the SQLite runtime store.
- `scripts/ensemble_handoff.py` now mirrors handoff artifacts into
  `handoff_packets` while preserving the legacy `.notes/handoffs` files.
- `scripts/ensemble_room_service.py` is the additive service layer for room
  creation, message append, tool events, and room timeline assembly.
- `scripts/ensemble_replay_service.py` provides room, run, and iteration
  timelines plus validator, approval, insight, and handoff queries.
- `scripts/ensemble_insight_extractor.py` stores typed insights with evidence
  references instead of copying transcript text wholesale.
- `scripts/ensemble_ag2_room_adapter.py` uses a local fallback because AG2 /
  AutoGen packages are not installed in this environment.

## Batch 11 Tradeoffs

- The visible room flow is exposed through the existing Python dashboard route
  instead of a new React surface, which keeps the batch small and additive.
- AG2 is represented as a replaceable adapter boundary with runtime detection,
  not a hard dependency, because `ag2`, `autogen`, and `autogen_agentchat` are
  all absent locally.
- Legacy `.notes` compatibility is preserved through dual-write and first-read
  sync rather than a one-time migration.
- Replay queries currently compose multiple repository calls instead of a single
  prejoined timeline table, which keeps the schema simpler at the cost of some
  query duplication.
- Insight extraction is now idempotent by summary / kind / scope, but it still
  relies on lightweight heuristics rather than a richer reasoning pass.

## Post-Batch11 Audit Findings

- The forward Batch 1-11 stack is implemented, but the active runtime still
  remains `scripts/ensemble.py` + `.notes/` + `.agent/`; the forward stack is
  not yet promoted into the active CLI/runtime path.
- The checked-in `.conitens/runtime/loop_state.sqlite3` is behind the current
  repository schema and currently contains no runs, iterations, findings,
  progress entries, or memory records.
- `load_run_snapshot()` still omits newer Batch 8-11 state such as
  checkpoints, approvals, rooms/messages/tool events, insights, handoff
  packets, and memory records.
- The current `.conitens/context/*.md` files behave as checked-in architectural
  summaries in this repo snapshot, not as current DB-derived runtime state.
- `ContextAssembler` still falls back to legacy `.notes/rooms` transcript files
  when no handoff is available.
- Room state is duplicated across `ensemble_agents.py`, `ensemble_room.py`, and
  `ensemble_room_service.py`.
- `.vibe` currently has duplicate config keys, duplicate helper definitions,
  two SQLite files, and a stale `LATEST_CONTEXT.md`.
- Fast-lane hook activation is split across two installers and is not clearly
  active by default.

## Post-Batch11 Refactor Planning Decisions

- The selected refactor wave will stay additive and will not promote the
  forward `.conitens` stack into `scripts/ensemble.py` in this step.
- Wave 1 is intentionally isolated on `.vibe` simplification and fast-lane
  integrity so it can run safely without destabilizing the forward runtime
  model.
- Snapshot/restore completeness, room/handoff unification, and packet-source
  tightening are prioritized over deeper loop-control refactoring.
- Loop-control ownership cleanup is deferred to a later wave because it carries
  the highest semantic risk.

## Wave 1 Planning Decisions

- Wave 1 is split into:
  - 1-1 source-of-truth and state-boundary cleanup
  - 1-2 ContextAssembler and token-discipline cleanup
  - 1-3 validator / retry / approval path cleanup
- Wave 1-1 is safe to start first because it improves restore/debug honesty
  without forcing the runtime-promotion decision.
- Wave 1-2 intentionally follows 1-1 so packet input cleanup happens after the
  forward snapshot contract is clearer.
- Wave 1-3 stays last because validator/retry/approval ownership is the
  highest-risk semantic cleanup in the approved Wave 1 set.

## Wave 1-1 Findings

- `load_run_snapshot()` now includes post-Batch11 persisted state categories
  that were previously missing from restore/debug paths.
- The forward owner map for key operator-facing concepts is now explicit in the
  loop repository and debug mirror.
- The real workspace `.conitens/runtime/loop_state.sqlite3` was migrated to the
  current schema and `.conitens/runtime/loop_state.json` was regenerated.
- Active runtime vs forward runtime remains an intentional unresolved boundary;
  Wave 1-1 did not promote `.conitens` into `scripts/ensemble.py`.

## Wave 1-2 Findings

- `ContextAssembler` now uses explicit packet-source policy constants and
  metrics, making packet composition inspectable in one file.
- Raw legacy room transcript file reads were removed from the default packet
  assembly path.
- `recent_message_slice` now prefers handoff summary and otherwise uses bounded
  room episode summaries from `RoomService`.
- Default packet memory now excludes `identity` and `procedural` kinds.
- Delegation no longer requires full skill body loads to derive skill refs.

## Wave 1-3 Findings

- `IterativeBuildLoop.run()` is now the single owner of validator pass/fail,
  retry branching, escalation, and approval continuation behavior.
- `BuildGraph` no longer duplicates the execution-loop branching logic.
- Repeated failure can now reach escalation through repeated persisted build
  attempts without resetting retry state.
- Human escalation is no longer conflated with `approval_pending`.

## Post-Wave-1 Stabilization Findings

- No material implementation regressions were found in the forward `.conitens`
  stack after Wave 1.
- The strongest residual risk is operational: `.vibe/context/LATEST_CONTEXT.md`
  is stale and therefore not yet trustworthy as a repo-intelligence input.
- The active runtime split remains unresolved and should still be treated as an
  architectural caution for broader adoption.

## Security Hardening Findings

- Sensitive dashboard `GET /api/*` routes now require the same loopback +
  dashboard-token boundary as write routes.
- `room_id` and `spawn_id` now have centralized traversal-resistant validation
  before path construction.
- Secondary identifier fields such as `question_id`, `provider_id`, `agent_id`,
  `workspace_id`, `task_id`, `run_id`, and `iteration_id` are now validated at
  the API boundary in the routes touched by this pass.
- Final Claude review found no remaining material trust-boundary bypass in the
  hardened files reviewed.

## Batch 7 Packet Composition

- Packet composition order is: persona core, objective/current step, relevant
  findings, validator retry reason, runtime/repo digests, episodic memory
  top-k, recent handoff/message slice, tool whitelist, token budget, and
  done-when criteria.
- The assembler prefers latest handoff summary over raw room history and only
  falls back to a narrow recent message slice when no handoff is available.
- Persona core stays small and stable by excluding private policy and
  self-improvement config from the execution packet.
- Unapproved patches and identity memory stay excluded from default retrieval.

## Batch 7 Tradeoffs

- Packet generation is deterministic for the same state, but packet snapshot
  file names are debug artifacts and not part of the deterministic payload
  contract.
- Token budgeting uses character-based approximate token counts instead of a
  provider-specific tokenizer; this keeps the core portable but less exact.
- The assembler reads markdown digests plus structured state and therefore
  favors compact recent summaries over full replay history by design.

## Observed Gaps

- `packages/tui/package.json` points the `dev` script at `src/index.tsx`, while
  the repo currently contains `src/index.ts`.
- `omx team` requires a clean worktree handoff; this workspace is currently
  dirty, so Batch 1 analysis could not stay on the full team path.
- An isolated snapshot repo still hit `leader_workspace_dirty_for_worktrees`
  and `worktree_target_mismatch`, so Batch 2 used a non-team fallback after
  exercising the real `omx team` path.

## Frontend FE-4 Facts

- FE-4 live stream hook now lives in
  `packages/dashboard/src/hooks/use-forward-stream.ts`.
- FE-4 uses the existing SSE bridge and does not introduce WebSocket or a new
  router.
- FE-4 refreshes replay/room/detail data on `snapshot` events instead of
  treating the browser as the event source of truth.
- FE-4 doc lives in `docs/frontend/FE4_LIVE_ROOM_UPDATES.md`.
- Claude FE-4 review artifact:
  `.omx/artifacts/claude-fe4-live-room-review-2026-04-01T20-38-34-888014Z.md`

## Forward Review Hardening Facts

- `scripts/ensemble_forward_bridge.py` now stamps approval decisions with a
  bridge-owned reviewer identity and ignores browser-supplied reviewer labels.
- `launch_forward_bridge(...)` and `forward serve` now accept an optional
  `reviewer_identity`; when omitted, the bridge defaults to a local
  `local/<os-user>` identity.
- Forward bridge 500 responses now return `Internal forward bridge error.`
  instead of reflecting raw exception text back to the browser.
- `packages/dashboard/src/components/ForwardApprovalCenterPanel.tsx` no longer
  exposes a freeform reviewer field; the browser now sends reviewer note only.
- `packages/dashboard/src/App.tsx` now preserves the currently selected room
  across replay/detail refresh when that room still exists in the refreshed
  replay payload.
- `packages/dashboard/src/App.tsx` now tracks panel-scoped errors instead of a
  single shared error string for all run-detail subpanels.
- The dashboard bearer-token input now uses a password field with
  `autocomplete=off`.
- `packages/dashboard/src/forward-bridge.ts` no longer persists the bearer
  token in browser storage; only the API root is persisted locally.
- FE-4 live streaming now uses `fetch()` plus `Authorization` header instead of
  `EventSource` plus query-token auth.
- `scripts/ensemble_forward_bridge.py` now serves loopback-only CORS headers
  and explicit `OPTIONS` responses for local dashboard preview requests.
- `packages/dashboard/src/forward-view-model.ts` now exposes `pickNextRoomId()`
  and `packages/dashboard/tests/forward-bridge.test.mjs` covers the room
  selection persistence rule.
- Local real-program execution was verified after the hardening pass:
  - forward bridge is currently running on `http://127.0.0.1:8791/`
  - stamped reviewer identity is `local/eomshwan`
  - session metadata is written to `.omx/artifacts/forward-live-session/bridge-meta.json`
  - dashboard preview is currently running on `http://127.0.0.1:4291/`
  - authenticated `GET /api/runs` returned successfully with `count=0`
  - `OPTIONS /api/runs` preflight returned `204` with `Access-Control-Allow-Origin: http://127.0.0.1:4291`

## Residual Security Debt

- `pnpm audit` no longer reports any high or critical findings after the
  dependency updates in this pass.
- One moderate advisory remains in the `vitest -> vite 5 -> esbuild 0.21.5`
  test-only toolchain path under `packages/command-center`.
- Updating `vitest` far enough to remove that advisory currently breaks the
  repo's `typecheck:test` baseline, so that step was intentionally deferred.

## Forward Operator Usage Doc Facts

- A dedicated operator-facing usage guide now exists at
  `docs/frontend/FORWARD_OPERATOR_USAGE.md`.
- The guide is written against the actual current bridge/dashboard behavior,
  including:
  - forward bridge startup
  - dashboard preview startup
  - setup-form connection flow
  - approval center usage
  - live snapshot behavior
  - stop/shutdown procedure
  - troubleshooting and current-session inspection
- The guide points operators to the live-session artifact
  `.omx/artifacts/forward-live-session/bridge-meta.json` instead of embedding an
  ephemeral bearer token in repo docs.

## Frontend Review 2026-04-02 Implementation Facts

- `docs/frontend/FRONTEND_REVIEW_2026-04-02.md` decodes correctly as UTF-8 and
  identifies the smallest high-value implementation slice as:
  - rail density caps
  - shell hard-lock
  - room geometry verification
- Claude second-opinion agreed that the best immediate slice was rail row caps
  plus shell hard-lock, and the artifact is
  `.omx/artifacts/claude-frontend-review-20260402-2026-04-01T22-34-32-425240Z.md`.
- `packages/dashboard/src/office-sidebar-view-model.ts` now centralizes visible
  row caps for the pixel-office rail:
  - agents: 4
  - tasks: 4
  - handoffs: 3
- `packages/dashboard/src/components/OfficeSidebar.tsx` now renders only the
  capped slices and shows overflow chips instead of letting the rail grow
  without bound.
- `packages/dashboard/src/components/PixelOffice.tsx` no longer pre-slices task
  rows to 6; the sidebar rail now owns the visible-row rule.
- `packages/dashboard/src/office.module.css` now hard-locks the pixel-office
  shell to a centered `1440px` max width with `980px` minimum height on desktop.
- `packages/dashboard/src/office-stage.module.css` now lets the stage panel fill
  the locked shell height so the stage remains visually dominant over the rail.
- The review doc's room-geometry ordering (`control/impl | commons | research/
  validation/review`) already matched the current `office-stage-shell`
  grid-template-areas, so no geometry remap was required in this slice.

## Frontend Review 2026-04-02 Slice 2 Facts

- Claude recommended the next smallest high-value slice as:
  - focus strip compaction
  - room tile chrome reduction
  and the artifact is
  `.omx/artifacts/claude-pixel-office-next-slice-2026-04-01T22-42-29-494093Z.md`.
- `packages/dashboard/src/office-sidebar-view-model.ts` now also exposes
  `buildOfficeFocusStripView(...)` so focus-strip wording is centralized and
  regression-testable.
- `packages/dashboard/src/components/OfficeSidebar.tsx` no longer renders the
  selected agent/room as a multi-block dossier. It now renders a compact single
  summary row.
- `packages/dashboard/src/components/OfficeRoomScene.tsx` no longer renders the
  duplicated room team label or the room-bottom progress bar.
- `packages/dashboard/src/office-stage.module.css` now uses tighter room-tile
  spacing and smaller room-stat text to reduce chrome around the stage.
- The stage still preserves the existing six-room semantic layout and current
  grid-area ordering; this slice changed presentation, not topology.

## Frontend Review 2026-04-02 Density Slice Facts

- Claude recommended the next smallest room-density slice as:
  - densify `Impl Office`
  - optionally add minimal ambient fill to `Central Commons`
  and the artifact is
  `.omx/artifacts/claude-pixel-office-density-slice-2026-04-01T22-50-36-006597Z.md`.
- `packages/dashboard/src/office-stage-schema.ts` now densifies `impl-office`
  by adding:
  - `monitor`
  - `lamp`
  - `note`
  - `cabinet`
  - `coffee`
- The same schema now adds small ambient fill to `project-main` / `Central Commons`
  via:
  - `lamp`
  - `coffee`
- This slice intentionally stayed data-only inside the stage schema and did not
  widen into specialist-wing fixture changes yet.

## Frontend Review 2026-04-02 Specialist Slice Facts

- Claude recommended the next specialist-wing slice as:
  - leaner `Ops Control`
  - subtle ambient indicator in `Research Lab`
  - restrained urgency marker in `Validation Office`
  - leaner `Review Office`
  - lighter chrome for specialist rooms
  and the artifact is
  `.omx/artifacts/claude-pixel-office-specialist-slice-2026-04-01T22-55-40-943519Z.md`.
- `packages/dashboard/src/office-stage-schema.ts` now sharpens specialist room
  identities by:
  - removing one extra chair from `ops-control`
  - adding one `lamp` to `research-lab`
  - adding one `clock` to `validation-office`
  - removing the `bench` from `review-office`
- `packages/dashboard/src/office-stage.module.css` now reduces specialist-wing
  chrome by:
  - hiding room corner posts for research/validation/review
  - softening specialist-room scene borders
  - giving validation warning state a subtle inner tint
  - slightly increasing support-room scene height
  - reducing top-wall height on specialist rooms

## Frontend Review 2026-04-02 Ambient Slice Facts

- Claude recommended the next ambient-signal slice as:
  - quieter avatar motion
  - smaller task markers
  - no flashing error avatars
  and the artifact is
  `.omx/artifacts/claude-pixel-office-ambient-slice-2026-04-01T22-59-45-773551Z.md`.
- `packages/dashboard/src/office-stage.module.css` now reduces
  `office-task-node` from `14x12` to `10x8` and reduces the inner dot to `3x3`.
- The same CSS now removes the outer task-node ring so task markers remain
  visible but less dominant against the stage.
- Avatar motion now uses slower `ease-in-out` idle motion with `1px` vertical
  travel instead of the earlier more game-like stepping animation.
- Error avatars no longer use the fast `status-flash` effect and now rely on a
  quieter pulse plus the existing danger ring.

## Frontend Review 2026-04-02 Preview Route Facts

- `packages/dashboard/src/main.tsx` still renders the forward operator shell as
  the main app entrypoint.
- `PixelOffice` existed but was not mounted from the current app entry before
  this slice, which made the review doc's planned browser verification path
  effectively blocked.
- `packages/dashboard/src/forward-route.ts` now supports `#/office-preview` as a
  design-only route alongside `#/runs` and `#/runs/:id`.
- `packages/dashboard/src/App.tsx` now mounts `PixelOffice` under
  `#/office-preview` using static sample data from `demo-data.ts`, while keeping
  the main forward shell as the default route.
- The preview route is explicitly labeled as design-only and separate from live
  forward runtime state.
- `packages/dashboard/tests/forward-bridge.test.mjs` now covers the new route
  round-trip.
- `docs/frontend/FRONTEND_REVIEW_2026-04-02.md` now has an upfront update note
  listing completed slices and the real remaining tasks.

## Frontend Review 2026-04-02 Phase 4 Verification Facts

- Playwright Chromium was installed locally and used to capture a real preview
  screenshot for the pixel-office route.
- Browser verification command used:
  - `npx playwright screenshot --browser chromium --viewport-size "1440,980" --wait-for-timeout 2500 "http://127.0.0.1:4291/#/office-preview" "output/playwright/office-preview-2026-04-02-final.png"`
- The captured artifact is
  `output/playwright/office-preview-2026-04-02-final.png`.
- A refreshed post-polish artifact now also exists at
  `output/playwright/office-preview-2026-04-02-final-2.png`.
- Vision review of the final screenshot reported no major blocking visual issue
  for Phase 4 verification.
- Minor residual polish debt from the screenshot review:
  - right-rail task rows remain a bit cramped

## Frontend Review 2026-04-02 Final Polish Facts

- Claude recommended a final polish slice centered on:
  - flexible stage row sizing
  - slight right-rail breathing room
  and the artifact is
  `.omx/artifacts/claude-pixel-office-final-polish-2026-04-01T23-21-29-714659Z.md`.
- `packages/dashboard/src/office-stage.module.css` now uses proportional
  `minmax(..., fr)` row sizing instead of rigid pixel row heights, so the stage
  fills the available vertical shell space more evenly.
- `packages/dashboard/src/office-sidebar.module.css` now gives rail rows and
  task line groups slightly more vertical breathing room.

## Candidate Patch Hardening Facts

- `scripts/ensemble_agent_registry.py` now treats candidate patch files as
  pending only when the file metadata matches a recorded
  `agent.patch_proposed` or `improver.patch_generated` event and no terminal
  patch event exists yet.
- The same registry path now rejects apply attempts for candidate patch files
  that are missing proposal provenance, target the wrong agent, or contain no
  concrete behavior delta beyond headings/rationale/placeholders.
- `agent_patch()` now rejects placeholder or rationale-only content before it
  emits `agent.patch_proposed`, so the event log is not polluted by empty patch
  proposals.
- `scripts/ensemble_improver.py` now requires explicit proposal content via
  `--proposal` or `--proposal-file` before writing persona, skill, or workflow
  candidate patch files.
- The out-of-band placeholder artifact
  `.conitens/personas/candidate_patches/supervisor-core-2026-04-06-001.md` was
  removed from the working tree.
- `tests/test_candidate_patch_hardening.py` now locks the regression surface for
  unlogged files, placeholder files, and the valid event-backed apply path.
