# LATEST_CONTEXT.md

Read this file before substantial work.

## Current State

- Active batch: `Frontend design polish upgrade`
- Status: `complete`
- Current live runtime truth remains `scripts/ensemble.py` plus `.notes/` and
  `.agent/`.
- `.conitens/` now carries loop state, runtime digest markdown, persona shell
  files, namespaced memory records, candidate patch review storage,
  OpenHands-compatible skill packaging metadata, a Context Assembler, a local
  orchestration skeleton, a working iterative execution loop, and a persisted
  approval-control path for risky actions, plus a dual-written collaboration /
  replay layer for rooms, messages, insights, and handoff packets.
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
- Local Claude review reliability is now improved with an explicit wrapper and
  a verified `medium` / 5-minute invocation profile.

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
