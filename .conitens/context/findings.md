# findings.md

## Guidance Files Found

- Root guidance: `AGENTS.md`
- Additional root operator guidance: `CLAUDE.md`
- Generated/runtime-scoped `AGENTS.md` files exist under `.notes/` and `.omx/`,
  but the root `AGENTS.md` governs the repository itself.

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

## Paperclip Comparative Planning Facts

- `paperclipai/paperclip` is currently a public monorepo with a split
  `ui/`, `server/`, `packages/db`, `packages/adapters`, `packages/plugins`,
  `skills/`, and `docs/` product layout.
- The inspected Paperclip snapshot for this planning task was local clone
  commit `8adae84`.
- Paperclip product posture is "company/operator control plane" rather than
  "run/replay inspector"; its primary product objects are companies, agents,
  goals, projects, issues, approvals, costs, routines, and execution
  workspaces.
- Paperclip's frontend information architecture is materially broader than the
  current Conitens forward shell:
  - Paperclip routes include dashboard, inbox, issues, projects, goals, agents,
    costs, activity, org chart, approvals, plugins, and settings.
  - Current Conitens forward routes remain `runs`, `run-detail`,
    `office-preview`, and `agents`.
- Paperclip's UI spec explicitly targets a dense, keyboard-first, dark operator
  shell with a left sidebar, breadcrumb bar, main content, and contextual right
  panel.
- Paperclip's inbox is a true operator triage queue, not a passive log view.
  It groups approvals, failed runs, touched issues, alerts, and actionable
  work items.
- Paperclip's backend is more productized than current Conitens in explicit
  domain tables and REST surfaces:
  - `issues` carry `goalId`, `projectId`, `parentId`, `checkoutRunId`, and
    `executionWorkspaceId`
  - `agents` carry reporting lines, budgets, permissions, adapter/runtime config
  - `heartbeat_runs` carry invocation, usage, session, and log metadata
- Paperclip's heartbeat model is burst-based with session persistence and
  short-lived agent JWT context injection.
- Paperclip's adapter and plugin packaging are explicit product surfaces:
  adapters are package-scoped per runtime, and plugins use a documented SDK
  with host/worker lifecycle hooks.
- Current Conitens remains stronger than Paperclip in execution-loop rigor,
  approval/validator coupling, and replay/room/insight evidence separation.
- The highest-value adoption path is not a Paperclip clone. The recommended
  direction is:
  - preserve Conitens runtime truth and evidence-first loop semantics
  - import Paperclip's operator-product information architecture
  - add durable operator objects gradually on top of existing forward state
- Primary risk: exposing Paperclip-style product objects in the Conitens UI
  before assigning a canonical truth owner would create a third control-plane
  truth beside the active runtime and the additive forward stack.
- Safe sequence for adoption is:
  `read projection -> owned API / aggregation surface -> durable operator object`.

## Paperclip Phase 1 Backlog Facts

- The next concrete slice after comparative planning should stay read-only and
  projection-first rather than introducing canonical task/workspace entities.
- The current forward bridge type surface in
  `packages/dashboard/src/forward-bridge-types.ts` is run/replay/approval/room
  centric and has no operator summary or inbox projection types yet.
- The current parser contract coverage in
  `packages/dashboard/tests/forward-bridge.test.mjs` covers runs, run detail,
  replay, state docs, room timeline, approvals, and stream parsing, but not a
  higher-level overview or inbox route.
- The current backend bridge coverage in `tests/test_forward_bridge.py`
  validates `/api/runs`, `/api/runs/:id`, `/api/runs/:id/replay`,
  `/api/runs/:id/state-docs`, and `/api/rooms/:id/timeline`, but not any
  operator summary or attention aggregation route.
- The current route model in `packages/dashboard/src/forward-route.ts` still
  only exposes `runs`, `run-detail`, `office-preview`, and `agents`.
- The recommended Phase 1 route target is:
  `overview`, `inbox`, `runs`, `run-detail`, `agents`, `office`.
- The recommended first backend additions are read-only projections:
  - `/api/operator/summary`
  - `/api/operator/inbox`
- The recommended first frontend additions are:
  - `operator-summary-model.ts`
  - `operator-inbox-model.ts`
  - overview / inbox shell integration in `App.tsx`
- The recommended Phase 1 sequencing is:
  - summary projection first
  - inbox projection second
  - agents surface light upgrade third
- The detailed execution-ready backlog artifact for this slice now exists at:
  `docs/PAPERCLIP_CONITENS_PHASE1_BACKLOG_2026-04-04.md`

## Paperclip Phase 1 Implementation Slice 1 Facts

- A read-only operator summary projection now exists at:
  `GET /api/operator/summary`.
- The new summary route is served by:
  `scripts/ensemble_forward_bridge.py`.
- The operator summary contract is now typed in:
  `packages/dashboard/src/forward-bridge-types.ts`.
- The operator summary parser now exists in:
  `packages/dashboard/src/forward-bridge-parsers.ts`.
- The operator summary client helper now exists in:
  `packages/dashboard/src/forward-bridge-client.ts`.
- The forward shell route grammar now includes a first-class `overview` route
  in:
  `packages/dashboard/src/forward-route.ts`.
- The new overview UI is shaped through:
  - `packages/dashboard/src/operator-summary-model.ts`
  - `packages/dashboard/src/components/OperatorSummaryPanel.tsx`
  - `packages/dashboard/src/App.tsx`
- The first implementation slice remains projection-first:
  - no durable task schema added
  - no inbox write path added
  - no approval semantics changed
- Verification succeeded for:
  - `python3 -m unittest tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 1 Implementation Slice 2 Facts

- A read-only operator inbox projection now exists at:
  `GET /api/operator/inbox`.
- The new inbox route is served by:
  `scripts/ensemble_forward_bridge.py`.
- The operator inbox contract is now typed in:
  `packages/dashboard/src/forward-bridge-types.ts`.
- The operator inbox parser now exists in:
  `packages/dashboard/src/forward-bridge-parsers.ts`.
- The operator inbox client helper now exists in:
  `packages/dashboard/src/forward-bridge-client.ts`.
- The forward shell route grammar now includes a first-class `inbox` route in:
  `packages/dashboard/src/forward-route.ts`.
- The new inbox UI is shaped through:
  - `packages/dashboard/src/operator-inbox-model.ts`
  - `packages/dashboard/src/components/OperatorInboxPanel.tsx`
  - `packages/dashboard/src/App.tsx`
- The inbox slice currently projects four kinds only:
  - `approval`
  - `validator_failure`
  - `handoff_attention`
  - `stale_run`
- The second implementation slice remains projection-first:
  - no durable task schema added
  - no inbox mutation path added
  - no approval semantics changed
- Verification succeeded for:
  - `python3 -m unittest tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 1 Implementation Slice 3 Facts

- A read-only operator agents projection now exists at:
  `GET /api/operator/agents`.
- The new agents route is served by:
  `scripts/ensemble_forward_bridge.py`.
- The operator agents contract is now typed in:
  `packages/dashboard/src/forward-bridge-types.ts`.
- The operator agents parser now exists in:
  `packages/dashboard/src/forward-bridge-parsers.ts`.
- The operator agents client helper now exists in:
  `packages/dashboard/src/forward-bridge-client.ts`.
- The live agents UI is shaped through:
  - `packages/dashboard/src/operator-agents-model.ts`
  - `packages/dashboard/src/App.tsx`
  - existing `AgentFleetOverview` / `AgentProfilePanel` components
- The agents slice currently derives roster entries from existing forward state:
  approvals, task-plan ownership, orchestration checkpoints, room participants,
  handoff packets, and memory records.
- The third implementation slice remains projection-first:
  - no durable agent registry added
  - no live relationship graph projection added
  - no live proposal/evolution projection added
- Verification succeeded for:
  - `python3 -m unittest tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 2 Owned API Slice 1 Facts

- Canonical `operator_tasks` storage now exists in:
  `scripts/ensemble_loop_repository.py`.
- The loop-state schema version is now `9`.
- `operator_tasks` is now recorded as an additive authoritative owner in the
  repository state-owner map.
- The first owned task API slice now exists at:
  - `GET /api/operator/tasks`
  - `GET /api/operator/tasks/:task_id`
  - `POST /api/operator/tasks`
- The new owned task bridge contract is now typed in:
  `packages/dashboard/src/forward-bridge-types.ts`.
- The owned task parser/client support now exists in:
  - `packages/dashboard/src/forward-bridge-parsers.ts`
  - `packages/dashboard/src/forward-bridge-client.ts`
- The owned task slice is backend-first:
  - no tasks UI route yet
  - no edit/delete task API yet
  - no run execution binding yet
- Repository snapshots now include operator tasks linked to a run.
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Workspace Archive Follow-Up Facts

- `scripts/ensemble_forward_bridge.py` now treats archived operator workspaces
  as immutable through the generic `PATCH` surface unless the request is a
  reactivation (`status != archived`).
- The bridge update path now stamps `archived_by` only on the active-to-archived
  transition instead of every archived-status patch attempt.
- Dashboard workspace mutation assembly is now centralized in
  `packages/dashboard/src/operator-workspace-actions.ts`, which also owns
  quick-status archive gating.
- The workspace editor now keeps the archive rationale field visible before
  archiving so the quick-status archive action is no longer a false affordance.
- Regression coverage now includes:
  - archived workspace `PATCH` rejection while status remains `archived`
  - quick-archive gating and workspace mutation body shaping on the dashboard

## Paperclip Phase 2 Owned API Slice 2 Facts

- The forward shell route grammar now includes:
  - `tasks`
  - `task-detail`
- The tasks shell now reads canonical operator task data via:
  - `GET /api/operator/tasks`
  - `GET /api/operator/tasks/:task_id`
- The tasks UI is shaped through:
  - `packages/dashboard/src/operator-tasks-model.ts`
  - `packages/dashboard/src/components/OperatorTaskDetailPanel.tsx`
  - `packages/dashboard/src/App.tsx`
- The tasks slice currently provides:
  - sidebar list of operator tasks
  - detail panel for the selected canonical task
  - demo fallback when no live bridge is connected
- The tasks slice is still intentionally narrow:
  - no task create/edit UI
  - no execution binding UI
  - no task-specific replay composition UI
- Verification succeeded for:
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 2 Owned API Slice 3 Facts

- `task-detail` now reuses linked execution data when the canonical operator
  task record includes `linked_run_id`.
- The linked execution context is rendered through the existing:
  - `ForwardApprovalCenterPanel`
  - `ForwardReplayPanel`
- The task-detail linkage now depends on:
  - `packages/dashboard/src/operator-tasks-model.ts`
  - `packages/dashboard/src/App.tsx`
  - `packages/dashboard/src/components/OperatorTaskDetailPanel.tsx`
- The linked execution slice is still intentionally narrow:
  - no task-specific room panel
  - no task-specific state-doc panel
  - no create/edit task UI
- Verification succeeded for:
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 2 Owned API Slice 4 Facts

- Canonical operator task write semantics now include:
  - `PATCH /api/operator/tasks/:task_id`
- The task update path is implemented in:
  - `scripts/ensemble_loop_repository.py`
  - `scripts/ensemble_forward_bridge.py`
- The frontend task editor flow is implemented through:
  - `packages/dashboard/src/components/OperatorTaskEditorPanel.tsx`
  - `packages/dashboard/src/App.tsx`
- The tasks shell now supports:
  - create task form on `tasks`
  - edit task form on `task-detail`
  - canonical refresh after create/update
- The write slice is still intentionally narrow:
  - no task delete flow
  - no task execution/resume controls
  - no task-specific room/state-doc composition
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 2 Owned API Slice 5 Facts

- The tasks shell now supports client-side filters for:
  - task status
  - owner agent id
- The filters are implemented in:
  - `packages/dashboard/src/App.tsx`
  - existing `GET /api/operator/tasks` query params
- `task-detail` now exposes quick status transition controls for:
  - `todo`
  - `in_progress`
  - `blocked`
  - `in_review`
  - `done`
- Quick status transitions reuse the canonical task update path:
  - `PATCH /api/operator/tasks/:task_id`
- The quick-status and filter slice is still intentionally narrow:
  - no saved filters
  - no bulk actions
  - no task delete flow
- Verification succeeded for:
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 2 Owned API Slice 6 Facts

- `task-detail` now renders linked state docs and context digests in addition to
  linked replay and approval context.
- `task-detail` now renders a room timeline panel scoped to linked room ids when
  the canonical operator task provides them.
- The linked evidence composition now depends on:
  - `packages/dashboard/src/operator-tasks-model.ts`
  - `packages/dashboard/src/App.tsx`
  - existing `ForwardStateDocsPanel`
  - existing `ForwardContextPanel`
  - existing `ForwardRoomPanel`
- The evidence-composition slice is still intentionally narrow:
  - no task-specific room write flow
  - no task-specific state-doc write flow
  - no task-specific graph composition
- Verification succeeded for:
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 2 Owned API Slice 7 Facts

- Operator task status transitions are now validated in:
  `scripts/ensemble_loop_repository.py`.
- The current allowed transition set prevents terminal-state reopening and
  skips directly from `todo` to `done`.
- Approval-sensitive operator task mutations are now checked in:
  `scripts/ensemble_forward_bridge.py`.
- When a linked run has a pending approval, execution-sensitive task mutations
  now return HTTP `409` instead of silently drifting operator state.
- The guarded fields currently include:
  - `status`
  - `owner_agent_id`
  - `linked_run_id`
  - `linked_iteration_id`
  - `linked_room_ids`
  - `workspace_ref`
- Quick status UI now only renders valid next transitions in:
  `packages/dashboard/src/components/OperatorTaskDetailPanel.tsx`.
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 2 Owned API Slice 8 Facts

- Approval records now support optional `task_id` linkage in the approval store
  and bridge contract.
- Task-scoped approval filtering now works through:
  - `GET /api/approvals?task_id=...`
- Canonical operator tasks can now request approvals through:
  - `POST /api/operator/tasks/:task_id/request-approval`
- Task approval requests currently create `operator_task_update` approvals using
  the current canonical task snapshot as payload.
- The task approval slice is wired through:
  - `scripts/ensemble_approval.py`
  - `scripts/ensemble_loop_repository.py`
  - `scripts/ensemble_forward_bridge.py`
  - `packages/dashboard/src/components/ForwardApprovalCenterPanel.tsx`
  - `packages/dashboard/src/App.tsx`
- The approval-linkage slice is still intentionally narrow:
  - no task-scoped approval templates
  - no task-scoped approval editing workflow beyond the generic approval panel
  - no automatic approval creation on every task mutation
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 2 Owned API Slice 9 Facts

- Task approval requests now accept and persist:
  - `rationale`
  - `requested_changes`
  - `draft_snapshot`
- The request payload enrichment is implemented in:
  - `scripts/ensemble_forward_bridge.py`
  - `packages/dashboard/src/App.tsx`
- Task approval UX now shows:
  - a rationale textarea
  - a requested-changes summary
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

## Paperclip Phase 2 Owned API Slice 10 Facts

- The task editor now previews changed fields before save.
- The same editor now highlights approval-sensitive fields separately when the
  current canonical task is linked to a run.
- The mutation-hint slice is implemented in:
  - `packages/dashboard/src/App.tsx`
  - `packages/dashboard/src/components/OperatorTaskEditorPanel.tsx`
- The approval request payload now reuses the same change-detection result that
  the editor previews to the operator.
- Verification succeeded for:
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - dashboard package build via package-scoped TypeScript build plus Vite build

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

## Frontend Design Polish 2026-04-03 Facts

- `packages/dashboard/src/components/PixelOffice.tsx` now renders a preview
  summary band above the stage with live-room, running-agent, surfaced-task,
  and live-route metrics derived from the existing office model.
- `packages/dashboard/src/office.module.css` now allocates a wider
  approximately-`1fr / 336px` stage-to-rail split and styles the new preview
  summary band without introducing a separate card stack.
- `packages/dashboard/src/components/OfficeStage.tsx` and
  `packages/dashboard/src/office-stage.module.css` now expose compact room/live/
  focus status pills in the stage header and add stronger focus visibility for
  room tiles and avatar slots.
- `packages/dashboard/src/components/OfficeSidebar.tsx` now shows section-level
  counts for active agents, surfaced tasks, and live routes, and the focus
  strip now uses explicit `eyebrow`, `headline`, `summary`, and `detail`
  fields from `buildOfficeFocusStripView(...)`.
- `packages/dashboard/src/components/OfficeRoomScene.tsx` no longer places
  clickable avatar controls inside an `aria-hidden` scene container, and avatar
  buttons now carry explicit labels.
- `packages/dashboard/src/office-stage.module.css` now includes a
  `prefers-reduced-motion: reduce` branch that disables the preview's looping
  badge/avatar motion.
- Refreshed browser evidence for this slice now exists at:
  - `output/playwright/office-preview-2026-04-03-pre-polish.png`
  - `output/playwright/office-preview-2026-04-03-polish.png`

## Frontend Design Research 2026-04-03 Facts

- Current official reference review on 2026-04-03 used these surfaces:
  - n8n editor docs for `top bar`, `canvas`, and right-side `nodes panel`
  - Plane homepage for unified workspace / multiple-layout product framing
  - SigNoz homepage for correlated signals across traces, metrics, and logs
  - Langfuse official product description for traces / observations / sessions
- The follow-up preview pass translated those references into Conitens by:
  - adding a correlated-signal strip for focus, queue head, and latest handoff
  - making the right rail sticky on desktop so the stage remains the primary
    canvas while secondary context stays anchored
  - keeping the stage itself dominant instead of expanding card chrome
- Refreshed browser evidence for the research-driven pass now exists at:
  - `output/playwright/office-preview-2026-04-03-research-pass.png`

## Frontend Post-Main Rebaseline Facts

- `git fetch origin main` on 2026-04-03 advanced `origin/main` from
  `78668f5` to `9c4ba0e`.
- `origin/main` now contains merge commit
  `9c4ba0e8d8c3de1a14e76bc9a538ba79ee5293ef`:
  `feat: refine pixel office preview hierarchy and web reflection (#19)`.
- The fetched merge commit already includes the recent Pixel Office preview
  hierarchy, correlated-signal strip, sticky rail, and context artifact
  refresh, so that work should no longer be treated as upcoming branch-local
  implementation.
- `git diff HEAD..origin/main` is empty for tracked source files; the practical
  delta is branch topology, not unmerged frontend code.
- The current planning mismatch is now document-driven:
  - `docs/frontend/FRONTEND_REVIEW_2026-04-02.md` still lists FE-4 SSE refresh
    as an open gap even though merged code/context say live refresh is
    implemented.
  - the same review doc still frames large parts of Pixel Office checklist /
    design-improvement work as pending even though later slices are already on
    `main`.
- Based on merged `main`, the next frontend priorities are:
  1. planning / review doc rebaseline against actual merged behavior
  2. structural cleanup (`styles.css`, `forward-bridge.ts`) only after docs stop
     describing already-landed work as pending
  3. optional minor UX polish only after the merged baseline is documented

## Frontend Review Doc Rebaseline Facts

- `docs/frontend/FRONTEND_REVIEW_2026-04-02.md` now treats FE-4 live refresh as
  complete instead of an open deferred gap.
- The same review doc now treats recent Pixel Office preview hierarchy work as
  merged state rather than future implementation.
- The review doc's remaining work is now reordered to:
  1. review/planning truth sync
  2. merged-main baseline capture
  3. structural cleanup of `styles.css` and `forward-bridge.ts`
  4. optional minor UX follow-up
- The review doc keeps forward-only architecture constraints and deferred items
  explicit, but no longer uses outdated checklist tables as the primary next
  action surface.

## Frontend Dashboard Baseline Capture Facts

- The merged-main dashboard baseline was captured on 2026-04-03 with:
  - `node --experimental-strip-types --test --test-isolation=none tests/*.test.mjs`
  - `node 'D:\Google\.Conitens\node_modules\typescript\bin\tsc' -b`
  - `node 'D:\Google\.Conitens\node_modules\vite\bin\vite.js' build`
- Verification results:
  - tests passed: `68 passed / 0 failed`
  - typecheck passed
  - build passed
- Baseline evidence artifact now exists at:
  - `.omx/artifacts/frontend-dashboard-baseline-capture-2026-04-03T04-27-51Z.md`
- `packages/dashboard/tsconfig.tsbuildinfo` was regenerated by verification and
  then restored to the HEAD version so this slice remains evidence-only.
- The next implementation lane after this baseline capture is structural
  cleanup of `styles.css` and `forward-bridge.ts`.

## Dashboard Design Unification Facts

- `packages/dashboard/src/styles.css` is now an import hub and the route-level
  visual language is layered through:
  - `styles/legacy.css`
  - `styles/tokens.css`
  - `styles/shell.css`
  - `styles/live-panels.css`
  - `styles/office-preview.css`
  - `styles/agents.css`
- The live shell is now the visual baseline across `runs`, `run-detail`,
  `office-preview`, and `agents`; preview no longer uses a separate light-page
  shell treatment.
- `packages/dashboard/src/components/OnboardingOverlay.tsx` is no longer a
  blocking fixed overlay; it now behaves as an inline onboarding panel inside
  the runs shell.
- `packages/dashboard/src/components/PixelOffice.tsx` and
  `packages/dashboard/src/office.module.css` now compress the top strip and let
  the stage dominate the viewport again.
- `packages/dashboard/src/office-stage.module.css` now increases side-room
  weight, reduces preview chrome weight, and gives the stage a calmer dark-shell
  surround.
- `packages/dashboard/src/office-stage-schema.ts` now densifies and reclusters
  `Central Commons`, `Impl Office`, `Validation Office`, and `Review Office`
  while keeping the six-room semantic model and IDs intact.
- `packages/dashboard/src/components/Forward*Panel.tsx` headings now use a
  tighter utility-copy style so live shell panels read like the same product as
  the preview lens.
- Visual evidence for the unified pass now exists at:
  - `output/playwright/dashboard-runs-unified-1440.png`
  - `output/playwright/dashboard-run-detail-unified-1440.png`
  - `output/playwright/dashboard-preview-unified-1440.png`
  - `output/playwright/dashboard-agents-unified-1440.png`
- Additional responsive evidence now exists at:
  - `output/playwright/dashboard-runs-unified-1220.png`
  - `output/playwright/dashboard-preview-unified-1220.png`
  - `output/playwright/dashboard-preview-unified-820.png`
- Architect-style plan review returned `APPROVED` with one non-blocking note:
  capture dashboard test/typecheck/build baseline before Phase 2 structural
  cleanup so the later "no regression" claim has a known starting point.

## Forward Bridge Cleanup Facts

- `packages/dashboard/src/forward-bridge.ts` is now a stable barrel export
  rather than a single mixed-responsibility module.
- Internal bridge responsibilities are now split into:
  - `forward-bridge-types.ts`
  - `forward-bridge-parsers.ts`
  - `forward-bridge-client.ts`
  - `forward-bridge-storage.ts`
  - `forward-bridge-stream.ts`
- Existing imports from `./forward-bridge.js` remain valid; the split is
  internal-only and does not change the public frontend bridge surface.
- Because dashboard tests use `node --experimental-strip-types`, the new bridge
  barrel and internal modules now use `.ts` specifiers internally for runtime
  compatibility while outward-facing app imports remain unchanged.
- Post-split verification results:
  - tests passed: `68 passed / 0 failed`
  - typecheck passed
  - build passed

## Paperclip Phase 2 Owned API Slice 11 Facts

- Canonical operator tasks can now be deleted through:
  - `DELETE /api/operator/tasks/:task_id`
- Repository deletion semantics now exist in:
  - `scripts/ensemble_loop_repository.py`
- Forward bridge delete guardrails now exist in:
  - `scripts/ensemble_forward_bridge.py`
- Delete is blocked when either of these conditions holds:
  - the task itself has pending task-scoped approvals
  - the linked run still has pending approvals
- The task-detail UI now exposes a delete action in:
  - `packages/dashboard/src/components/OperatorTaskDetailPanel.tsx`
  - `packages/dashboard/src/App.tsx`
- Successful delete transitions the shell back to the filtered task list rather
  than leaving a stale detail route selected.
- The frontend bridge client now surfaces backend error payloads instead of
  showing only status-only placeholders like `Request failed: 409`.
- Parser coverage now includes the delete response contract in:
  - `packages/dashboard/tests/forward-bridge.test.mjs`
- Repository / bridge coverage now includes:
  - repository delete semantics
  - bridge delete success path
  - bridge delete blocking when approvals are pending
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 12 Facts

- Canonical operator tasks now carry `archived_at` as a separate lifecycle
  field in:
  - `scripts/ensemble_loop_repository.py`
  - `packages/dashboard/src/forward-bridge-types.ts`
- The loop-state schema version is now `11`.
- Operator task lifecycle endpoints now include:
  - `POST /api/operator/tasks/:task_id/archive`
  - `POST /api/operator/tasks/:task_id/restore`
- `GET /api/operator/tasks` now hides archived tasks by default and supports
  `include_archived=1` for operator review.
- Deletion is no longer the default cleanup path:
  - `DELETE /api/operator/tasks/:task_id` now requires the task to be archived first
  - archive and restore are both blocked while task-scoped or linked-run approvals remain pending
- The dashboard task shell now exposes:
  - an archived visibility filter in the task sidebar
  - archive action for active tasks
  - restore and delete actions for archived tasks
- Archive-aware lifecycle shaping now lives in:
  - `packages/dashboard/src/App.tsx`
  - `packages/dashboard/src/components/OperatorTaskDetailPanel.tsx`
  - `packages/dashboard/src/operator-tasks-model.ts`
- Repository / bridge coverage now includes:
  - archive and restore repository semantics
  - archive default-hidden list behavior
  - archive / restore bridge routes
  - delete blocked until archive-first progression
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 13 Facts

- Canonical operator tasks now also store archive metadata:
  - `archived_by`
  - `archive_note`
- The loop-state schema version is now `12`.
- Archive is no longer a silent lifecycle toggle:
  - `POST /api/operator/tasks/:task_id/archive` now requires a non-empty `archive_note`
  - the bridge records the current reviewer identity into `archived_by`
- Archived task mutation guardrails now exist in:
  - `scripts/ensemble_forward_bridge.py`
  - `packages/dashboard/src/App.tsx`
- The new guardrail semantics are:
  - archived tasks are read-only until restored
  - archived tasks cannot request new task-scoped approvals until restored
  - archived task detail shows archive metadata instead of the normal edit workflow
- Archive rationale capture and display now live in:
  - `packages/dashboard/src/components/OperatorTaskDetailPanel.tsx`
  - `packages/dashboard/src/operator-tasks-model.ts`
  - `packages/dashboard/src/App.tsx`
- Repository / bridge coverage now includes:
  - archive metadata persistence
  - archived-task patch rejection
  - archived-task approval-request rejection
  - archive blocked when task-scoped approval is already pending
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 14 Facts

- Task sidebar filter state now persists locally through:
  - `packages/dashboard/src/forward-bridge-storage.ts`
- Named task filter presets can now be saved, applied, and deleted locally via:
  - `packages/dashboard/src/App.tsx`
  - `packages/dashboard/src/forward-bridge-storage.ts`
- The saved-filter surface is intentionally local-only:
  - no new backend API
  - no canonical server-side preset registry
- Bulk lifecycle actions now operate on the current filtered queue:
  - bulk archive for visible non-archived tasks
  - bulk restore for visible archived tasks
- Bulk actions still preserve the archive-first guardrails:
  - bulk archive requires one shared rationale
  - bulk delete remains deferred
  - per-task bridge failures are aggregated back into a sidebar error summary
- Lightweight frontend regression coverage now includes local storage helpers in:
  - `packages/dashboard/tests/forward-bridge.test.mjs`
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 15 Facts

- Task sidebar rows now support per-task local selection in:
  - `packages/dashboard/src/App.tsx`
  - `packages/dashboard/src/styles/live-panels.css`
- Bulk lifecycle targeting rules are now:
  - use selected visible tasks first when any are selected
  - otherwise fall back to the current filtered queue
- Bulk lifecycle result reporting is now structured:
  - success task ids are retained
  - failure task ids and error messages are retained
  - sidebar UI renders a latest bulk report instead of only a one-line failure summary
- Selection remains intentionally local and ephemeral:
  - no backend selection registry
  - selection is pruned when tasks leave the visible filtered queue
- Existing storage coverage remains sufficient for this slice because the new
  persistence surface is still local-only; no new backend contract was added.
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 16 Facts

- Canonical operator workspace storage now exists in:
  - `scripts/ensemble_loop_repository.py`
- The loop-state schema version is now `13`.
- The first owned workspace API slice now exists at:
  - `GET /api/operator/workspaces`
  - `GET /api/operator/workspaces/:workspace_id`
  - `POST /api/operator/workspaces`
  - `PATCH /api/operator/workspaces/:workspace_id`
- The new owned workspace bridge contract is now typed in:
  - `packages/dashboard/src/forward-bridge-types.ts`
  - `packages/dashboard/src/forward-bridge-parsers.ts`
  - `packages/dashboard/src/forward-bridge-client.ts`
- The forward shell route grammar now includes:
  - `workspaces`
  - `workspace-detail`
- Workspace UI shaping now exists through:
  - `packages/dashboard/src/operator-workspaces-model.ts`
  - `packages/dashboard/src/components/OperatorWorkspaceDetailPanel.tsx`
  - `packages/dashboard/src/components/OperatorWorkspaceEditorPanel.tsx`
  - `packages/dashboard/src/App.tsx`
- Task detail now exposes a canonical workspace deep-link when `workspace_ref`
  is populated, but workspace/task referential integrity is still soft.
- This workspace slice is intentionally narrow:
  - no workspace delete flow
  - no workspace archive lifecycle
  - no automatic task/workspace backfill or synchronization
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 17 Facts

- Task/workspace linkage is now constrained by canonical workspace ids in:
  - `scripts/ensemble_forward_bridge.py`
  - `packages/dashboard/src/App.tsx`
  - `packages/dashboard/src/components/OperatorTaskEditorPanel.tsx`
- The new guardrail semantics are:
  - task create rejects unknown `workspace_ref`
  - task update rejects changed unknown `workspace_ref`
  - unchanged legacy unresolved refs are tolerated so existing records do not hard-break
- Workspace membership now derives from task truth:
  - workspace detail and workspace list `task_ids_json` are derived from tasks whose `workspace_ref` matches the workspace id
  - task create/update/delete refresh derived workspace membership
- The task editor no longer treats workspace as a free-form string in normal use:
  - it renders a selector populated from canonical operator workspaces
  - unresolved current refs are surfaced as a special placeholder option
- Task detail now only deep-links to a workspace when that canonical workspace is actually present in the current workspace registry.
- Additional bridge coverage now includes:
  - rejecting unknown task `workspace_ref`
  - deriving workspace-linked task refs from tasks
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 18 Facts

- Task workspace selection UX is now richer in:
  - `packages/dashboard/src/components/OperatorTaskEditorPanel.tsx`
  - `packages/dashboard/src/App.tsx`
- The task editor now shows selected canonical workspace context:
  - path
  - status / owner
  - linked run and task-ref count
- Unresolved legacy workspace refs no longer end at a passive warning:
  - task detail now shows shortcut buttons for nearby canonical workspaces
  - the user can stage a replacement workspace id and save the migration directly
- The unresolved selector behavior is intentionally narrow:
  - unresolved refs are exposed as a placeholder option only when already present on the task
  - create flow still cannot pick arbitrary unresolved workspace ids
- Verification succeeded for:
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 19 Facts

- Workspace lifecycle guardrails now exist in:
  - `scripts/ensemble_loop_repository.py`
  - `scripts/ensemble_forward_bridge.py`
  - `packages/dashboard/src/components/OperatorWorkspaceDetailPanel.tsx`
  - `packages/dashboard/src/App.tsx`
- The new workspace policy semantics are:
  - workspace status transitions are validated
  - archived workspaces are read-only until reactivated
  - task create/update cannot newly attach archived workspaces
  - workspace archive is blocked while active linked tasks remain attached
- The workspace editor no longer presents linked task refs as editable truth:
  task refs are shown as derived membership only.
- Additional regression coverage now includes:
  - invalid workspace status transition rejection
  - archived workspace attach rejection
  - workspace archive blocked by active linked tasks
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 20 Facts

- Workspace archive metadata now exists in:
  - `scripts/ensemble_loop_repository.py`
  - `scripts/ensemble_forward_bridge.py`
  - `packages/dashboard/src/operator-workspaces-model.ts`
  - `packages/dashboard/src/components/OperatorWorkspaceDetailPanel.tsx`
  - `packages/dashboard/src/components/OperatorWorkspaceEditorPanel.tsx`
- The loop-state schema version is now `14`.
- Workspaces now store:
  - `archived_at`
  - `archived_by`
  - `archive_note`
- Workspace archive policy is now closer to task archive policy:
  - archiving a workspace requires a rationale
  - creating an archived workspace requires a rationale
  - workspace detail renders archive metadata and rationale
- The workspace editor now exposes archive rationale when status is set to `archived`.
- Additional regression coverage now includes:
  - archived workspace create requires rationale
  - workspace archive blocked by active linked tasks after rationale passes validation
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`

## Paperclip Phase 2 Owned API Slice 21 Facts

- Workspace archive blocker resolution now exists in:
  - `scripts/ensemble_loop_repository.py`
  - `scripts/ensemble_forward_bridge.py`
  - `packages/dashboard/src/App.tsx`
  - `packages/dashboard/src/components/OperatorWorkspaceDetailPanel.tsx`
- `GET /api/operator/tasks` now supports `workspace_ref` filtering for
  workspace-detail views.
- The new blocker-resolution surface in workspace detail supports:
  - open linked task
  - detach linked task from current workspace
  - archive linked task using the current workspace archive rationale or a deterministic fallback
- A targeted task detach route now exists at:
  - `POST /api/operator/tasks/:task_id/detach-workspace`
- Detach/resolve actions refresh derived workspace membership immediately after
  mutation so workspace detail reflects the current blocker set.
- Additional regression coverage now includes:
  - repository task-workspace detach
  - bridge task-workspace detach updates workspace membership
- Verification succeeded for:
  - `python3 -m unittest tests.test_loop_state tests.test_forward_bridge`
  - `node --experimental-strip-types --test --test-isolation=none packages/dashboard/tests/forward-bridge.test.mjs`
  - `cd packages/dashboard && node ../../node_modules/typescript/bin/tsc -b`
  - `cd packages/dashboard && node ../../node_modules/vite/bin/vite.js build`
