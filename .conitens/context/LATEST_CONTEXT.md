# LATEST_CONTEXT.md

Read this file before substantial work.

## Current State

- Active batch: Unified authority repair execution
- Status: in_progress (2026-07-11)
- Wave 0 is implemented: ADR-0004 defines the event ledger as durable workspace
  truth, Forward SQLite as a bounded operational owner/index, projections as
  rebuildable views, and explicit gates before any Forward default promotion.
- Wave 1 behavior locks now cover canonical append aliases, raw-field rejection,
  normal/duplicated Windows and POSIX user-path redaction, and deterministic
  event-derived Obsidian thread timestamps.
- Wave 2A is implemented for rooms: create, message, and tool-event paths append
  the authority event before file/SQLite projection and materialize from the
  returned redacted payload. Append failure leaves no projection; later
  projection failure propagates while the committed event remains replayable.
- New room messages expose a stable msg:<room_id>:<uuid> authority id and retain
  the SQLite integer under id as projection identity. Legacy import prefers
  explicit evidence_refs and remains compatible with attachment/text fallbacks.
- Verification is green for 56 authority, room/replay, loop-state,
  episode-security, and GJC tests, Python compile, inventory JSON, and scoped
  diff checks.
- Independent HEAVY review returned APPROVED after the tool-event authority,
  legacy import, projection failure, message identity, path-redaction, and
  deterministic-rebuild gaps were closed.
- Wave 2B locked path/token and mutation boundaries, but a later dynamic review
  found that arbitrary Forward context Markdown still preserves raw bodies,
  common secret shapes, and absolute POSIX paths. Promotion gate 6 therefore
  fails; an allowlisted public context projection remains Wave 3 debt.
- Forward JSON is ASCII-safe on legacy Windows consoles while parsed Unicode is
  preserved. The combined bridge/runtime suite passes 65/65, dashboard tests
  pass 150/150, and independent goal, code, security, compatibility, and manual
  QA lanes approved the current boundary.
- Wave 2C is implemented for meeting, handoff, spawn, and stop lifecycles.
  Authority events precede transcript, file, SQLite, loop-state, workspace, or
  process projections; canonical events are metadata-only; short clean exits,
  launch errors, cleanup failures, and command-completion failures preserve an
  explicit terminal/recoverable record rather than silently drifting state.
- The final meeting/spawn authority group passes 34/34; focused handoff
  protocol tests pass 6/6; protocol build, event-type sync, Python compile, and
  scoped diff checks pass. Code, security, compatibility, and test review lanes
  all returned unconditional scoped PASS. The operations baseline is 2 failures
  and 9 errors across 23 tests; the full protocol baseline is 4 failures and
  846 passes, all in separately identified registry/ownership debt.
- Waves 0-3 are complete, Wave 4 is partial, the bounded Wave 5 exact-key effect
  slice is implemented, and Wave 6 selected Forward quarantine. The next
  architecture priority is finishing the Wave 4 dashboard thin-shell boundaries,
  then continuing measured improvement and promotion gates. Forward remains
  non-default throughout.

- Active batch: `Architecture direction and refactor planning`
- Status: `complete` (2026-07-10)
- Accepted staged plan:
  `docs/conitens-architecture-direction-refactor-plan-2026-07-10.md`. It is a
  code- and conversation-backed architecture/refactor plan, not an active-runtime
  promotion or implementation change.
- Stable direction: Conitens is a self-improving, event-sourced agent control
  center above heterogeneous harnesses. It owns approval, verification, evidence,
  replay, episode closure, and versioned skill/workflow/agent-topology proposals;
  it does not replace provider runtimes or ingest private raw transcripts as
  control state.
- Current authority remains `scripts/ensemble.py + .notes + .agent`. The read-only
  forward status surface confirms `default_runtime=legacy` while also reporting
  SQLite-owned authoritative forward state. That dual ownership relation must be
  settled by the proposed `ADR-0004: unified authority and forward promotion
  gate` before any forward default promotion.
- Highest-priority correctness findings: known room/meeting-state/spawn paths
  write durable/projection data before events; the Forward Bridge mixes query,
  command, HTTP, SSE, policy, and storage; bridge operator mutations and the
  patch-approval shortcut have no bridge-level `append_event()` call; current
  room message events are not sufficient to rebuild the room log.
- Meeting transcript JSONL remains the canonical append-only transcript/evidence
  ledger under redaction policy but is not domain state authority. Current
  `MEETING_MSG` events include masked text; Wave 1 must explicitly test whether
  that policy-approved payload remains or moves to an evidence ref. Unredacted
  private raw content remains forbidden in events/operator payloads.
- Browser-visible path safety is not yet a current guarantee: forward/operator
  payloads can expose absolute local paths. The plan adds a leakage
  characterization gate before payload contracts are frozen.
- Target architecture has five planes: authority, execution, projection/index,
  operator, and improvement. All durable domain commands cross the authority
  plane; Forward SQLite remains bounded operational state/index until the
  promotion gate passes; dashboard remains an operator shell/view model.
- Refactor order: Wave 0 authority/ADR/docs; Wave 1 behavior locks; Wave 2
  event-first commit-order repair; Wave 3 bridge/backend and room/handoff read
  path decomposition; Wave 4 dashboard thin shell; Wave 5 improvement proposal
  loop; Wave 6 forward promotion or explicit quarantine.
- First implementation handoff: write ADR-0004 and fix bridge/state-owner docs;
  add direct `append_event`, deterministic rebuild, bridge mutation/leakage, and
  room payload-sufficiency tests; only then convert `ensemble_room.py` to
  event-before-projection behavior.
- `packages/command-center` remains reference/parity and should be frozen rather
  than refactored until a later promotion decision. No new dependency, vector
  DB, TypeScript control-plane rewrite, or repo-wide cleanup is proposed.
- Generated structure evidence is under `.audit/repo-structure-lens/`; goal,
  semantic cleanup, runtime hypothesis, independent review, and manual QA
  evidence is under
  `.omo/evidence/conitens-architecture-direction-refactor-plan-review.md` and
  `.omo/evidence/plan-manual-qa/`.
- Independent architecture critic, fact-check, security, goal/constraint gate,
  and manual artifact QA lanes passed after revisions. The plan file opens as
  strict UTF-8, its heading
  hierarchy and code fences are valid, both Mermaid blocks are plausible, and
  referenced local paths/tests exist. No runtime implementation changed.

- Active batch: `Episode closure attempt public artifact slice`
- Status: `complete` (2026-07-05)
- User ended the Hermes/Supervisor interview with an implementation seed for
  the minimum vertical slice: `conitens episode close <episode_id>` should
  evaluate deterministic closure rules, always leave an auditable public
  closure artifact, record it through `task.artifact_added`, update only a
  derived episode projection, and expose L0/L1 `improvement list/show` views.
- New seed artifact:
  `.omx/plans/prometheus-strict/episode-closure-attempt-seed.md`. The fixed
  PR1 boundaries are: no episode creation/execution system, no `episode.*`
  event types, no L3 raw access enforcement, no approval escalation, no web UI,
  no SQLite/vector index, and no provider raw I/O storage.
- New implementation: `scripts/ensemble_episode_model.py`,
  `scripts/ensemble_episode_artifacts.py`, and
  `scripts/ensemble_episode_closure.py`. The split keeps every new closure file
  at or below the 250 pure-LOC review ceiling. It treats the event log as source
  of truth, considers an episode id existing only when prior events mention it
  as `episode_id`, `task_id`, or `run_id`, rejects missing ids before writing
  artifacts, builds the required four-part bundle
  (`episode_summary`, `scorecard`, `raw_access_audit`,
  `next_workflow_recommendation`), appends `task.artifact_added` with the
  closure bundle and index record in the event payload, then materializes
  `.notes/artifacts/agent-improvement/evidence/*.closure.json`,
  `.notes/artifacts/agent-improvement/public/digests/*.md`,
  `.notes/artifacts/agent-improvement/public/index.jsonl`, and a derived
  `public/episodes/*.state.json` projection from that event payload.
- CLI wiring in `scripts/ensemble.py`: `episode close <episode_id>` creates a
  closure attempt; `improvement list` prints L0 artifact rows; `improvement
  show <artifact_id>` prints the L1 digest. Existing `ensemble close` task
  archival semantics were not changed.
- Deterministic scorecard rules: missing required summary fields, missing or
  failed validation, failed goal satisfaction, or high risk produce `blocked`;
  low confidence, medium risk, or explicit review reasons produce
  `needs_review`; only required fields plus validation pass and no blockers or
  review reasons produce `closed`. `raw_access_audit` defaults to
  `raw_access_used=false` and empty grants. Validation is derived only from
  prior `validation.passed` / `validation.failed` events; the CLI has no
  `--validation-passed` bypass. Public closure text and public episode labels
  are redacted for token/path patterns, raw episode ids never appear in closure
  artifact filenames or event scope, and raw transcript/provider scratchpad
  markers are rejected before append.
- Verification passed: Python compile for changed files; `tests.test_episode_closure`
  + `tests.test_episode_closure_cli_security` passed 13/13;
  `tests.test_approval_controls` + `tests.test_loop_state` passed 26/26; one
  non-server Forward Bridge projection regression passed; scoped `git diff --check`
  passed with only the known Windows LF/CRLF warning for `scripts/ensemble.py`.
- The requested full Forward Bridge/operator HTTP regression bundle still fails
  for this Windows host before exercising assertions because fixed loopback
  test ports cannot bind: `PermissionError: [WinError 10013]`, including after
  elevated retry. Treat this as an environment blocker, not evidence of this
  closure slice regressing bridge behavior.

- Active batch: `Gajae-Code harness adapter integration`
- Status: `complete` (2026-07-04)
- User asked to implement the prior Gajae-Code installation and Conitens Agent
  Control Plane refactor plan. The boundary remains: Conitens is the
  event-sourced control plane; GJC is an optional external terminal harness.
- Upstream tag verification found `v0.8.1`; GJC standalone is installed as
  `gajae-code@0.8.1`. Bun was upgraded from `1.3.7` to `1.3.14` because GJC
  requires Bun `>=1.3.14`. Verification passed for `bun --version`,
  `gjc --version`, and `gjc --smoke-test`.
- The remote sparse Codex marketplace add failed because the sparse checkout
  root did not contain a supported manifest. Fallback succeeded by cloning
  `Yeachan-Heo/gajae-code` at `v0.8.1` into
  `.omx/vendor/gajae-code-v0.8.1`, registering its `plugins` directory as
  `gajae-code-local`, and installing `gajae-code@gajae-code-local`.
- Protocol and backend now include `harness.evidence_observed`. `append_event()`
  rejects raw harness prompt/completion/request/response, stdout/stderr/output,
  transcript, log/content/body/diff/patch/comment, command, token, and secret
  fields before writing. The Forward Bridge projects harness metadata,
  evidence counts, redaction status, latest run/status/summary, and GJC runtime
  observation without exposing raw transcript text or absolute local evidence
  paths.
- Final adapter phase is implemented in `scripts/ensemble_gjc_adapter.py`. It
  imports one redacted GJC run metadata JSON file into exactly one
  `harness.evidence_observed` event, accepts only the established metadata
  fields, canonicalizes relative evidence paths into `artifact:` refs, rejects
  absolute/traversal refs including unsafe `artifact:` suffixes, and never
  writes task, approval, or projection state directly.
- Dashboard parser/types/model now accept the harness evidence block and render
  it as evidence health alongside provider telemetry. The visible section is
  now `Telemetry and harness evidence`, preserving Focused mode's workbench
  hierarchy and keeping logs as evidence rather than primary controls.
- Threat model and log taxonomy are documented in
  `docs/gjc-harness-adapter.md`.
- Verification passed for install checks (`bun --version`, `gjc --version`,
  `gjc --smoke-test`, and `codex plugin list`), Python syntax compile, focused
  backend harness tests, GJC adapter tests 5/5, manual adapter CLI QA, approval and
  loop-state regression tests, dashboard tests 150/150, dashboard production
  build, and `git diff --check` with only existing Windows LF/CRLF warnings.
  The planned fixed-port Forward Bridge HTTP regression bundle remains an
  environment blocker on this Windows host: `PermissionError: [WinError 10013]`
  occurs while binding local loopback test ports, including after elevated
  retry.

- Active batch: `README and Office Preview documentation sync`
- Status: `complete` (2026-07-04)
- User asked to update README and related docs. The docs now identify
  `packages/dashboard` as the active forward operator UI, with
  `scripts/ensemble_forward_bridge.py` as the read-only data bridge, while
  keeping `scripts/ensemble.py` + `.notes/` + `.agent/` as runtime truth.
- README and `CONITENS.md` now document Office Preview as an operator
  visualization with `Agents`, `Topology`, and `Classic` modes. Focused
  `Agents` uses large `288x512` imagegen portrait PNGs from
  `packages/dashboard/public/agent-portraits/generated`; `Topology` uses the
  Spatial Lens floor/fixture assets and `64x64` generated sprite-gen role
  atlases from `packages/dashboard/public/agent-sprites/generated`.
- `docs/frontend/OFFICE_PREVIEW_CHARACTER_FIRST_REDESIGN.md` now records the
  2026-07-04 portrait/sprite split and canonical roles. The Spatial Lens asset
  README now matches the mounted registry instead of the old placeholder-era
  text.
- Verification: reviewed edited Markdown, searched the user-facing docs for
  old placeholder wording, retired manifest names, old sprite source text, old
  Vite version text, and the old README date, then inspected the resulting doc
  diff.

- Previous active batch: `Large imagegen pixel portrait agent integration`
- Status: `complete` (2026-06-30)
- User asked to apply the newly generated large role character designs to the
  product UI. The Agent stage now resolves role-owned imagegen portrait PNGs
  from `packages/dashboard/public/agent-portraits/generated` through
  `agent-character-portraits.ts` instead of showing the compact `OfficeAvatar`
  sprite cells in the main character cards.
- All five canonical roles are registered as large standalone pixel portraits:
  orchestrator, implementer, researcher, reviewer, and validator. Runtime
  assets are `288x512` transparent RGBA PNGs marked with
  `imagegen-large-pixel-avatar` provenance. The sprite-gen atlas pipeline stays
  intact for room/spatial/classic compact avatar contexts.
- `AgentCharacterStage` renders the portrait cutouts as decorative full-body
  images with role/source DOM hooks. `office-stage.module.css` gives the
  character cards a definite large portrait viewport so the figures render as
  full-body characters rather than clipped head-only thumbnails.
- Browser QA now checks generated portrait paths, natural image size,
  provenance, reduced-motion behavior, and rendered client size. At 1220px the
  final portrait heights are roughly `360-423px`, with full-body characters
  visible in `output/playwright/agent-character-stage/agents-1220.png`.
- Verification passed: RED contract failed first on missing
  `agent-character-portraits.ts`; targeted dashboard tests passed 150/150; full
  dashboard tests passed 150/150; dashboard production build passed; browser QA
  PASS for Agents 820/1220/1440, reduced motion, and Topology 1220; asset check
  confirmed all five portrait PNGs are `288x512` RGBA with transparent corners;
  `git diff --check` passed with only Windows LF/CRLF warnings. Evidence:
  `.omo/evidence/agent-character-portraits-red.txt`,
  `.omo/evidence/agent-character-portraits-targeted.txt`,
  `.omo/evidence/dashboard-node-tests-agent-portraits.txt`,
  `.omo/evidence/dashboard-build-agent-portraits.txt`,
  `.omo/evidence/agent-character-stage-browser-qa-agent-portraits.txt`,
  `.omo/evidence/agent-portrait-asset-check.txt`, and
  `output/playwright/agent-character-stage-results.json`.

- Active batch: `Front-facing pixel portrait agent redesign`
- Status: `complete` (2026-06-28)
- User rejected the previous top-view office character direction and provided
  three front-facing pixel human character references. The accepted direction
  is now a character-lineup cast: front-facing full-body humans with large
  readable heads/eyes, highlighted hair, clothing layers, separated legs and
  shoes, and role props.
- Agent sprite generation remains direct sprite-gen component-row output. No
  source pixels, command-center sprites, Claude assets, imported sheets, or
  purchased assets are copied into runtime assets.
- `agent_sprite_design.py` now uses a `front-facing full-body pixel human
  character sprite` contract at 64px cell size. It redraws all five role
  sprites as upright human characters and keeps per-role motion/props:
  tablet, wrench, lens/book, clipboard, and shield.
- `generate_agent_sprite_assets.py` records the user-supplied front-facing
  reference provenance in generated `sprite-request.json`, root manifest
  `referenceSources`, and per-role QA notes.
- Agent-stage cards render the 64px generated character cells at 2x, and the
  Spatial Lens character asset registry now expects 64x64 source rectangles.
  CSS clears the inherited `.selected` avatar ring so selected characters do
  not look boxed by a sprite-frame outline.
- A read-only visual critique found the category correction successful but
  asked for stronger cast differentiation. The final generator pass increases
  face contrast, role prop mass, researcher coat silhouette, and subtle
  non-active card floor light.
- Verification passed: RED contract failed first on old 48px/top-view
  artifacts; regenerated all five sprite-gen role atlases; targeted
  agent/spatial tests passed; full dashboard tests 149/149; `tsc -b`; Vite
  production build; browser QA PASS for Agents 820/1220/1440, reduced motion,
  CTA/card keyboard focus sequence, and Topology 1220; visible magenta checks
  returned zero pixels; visual contact sheet and browser screenshot
  inspection. Evidence:
  `.omo/evidence/agent-sprite-gen-front-facing-run.txt`,
  `.omo/evidence/agent-character-stage-front-facing-targeted.txt`,
  `.omo/evidence/dashboard-node-tests-front-facing.txt`,
  `.omo/evidence/dashboard-tsc-front-facing.txt`,
  `.omo/evidence/dashboard-vite-build-front-facing.txt`,
  `.omo/evidence/agent-character-stage-browser-qa-front-facing.txt`,
  `.omo/evidence/front-facing-character-reference-notes.md`, and
  `output/playwright/agent-character-stage/front-facing-sprite-gen-contact.png`.

- Previous active batch: `Reference-informed pixel office agent redesign`
- Status: `complete` (2026-06-28)
- User asked to use "insane search" for pixel office character references, then
  redesign the agent characters through sprite-gen and the frontend skill.
  Firecrawl web/image search plus focused scrapes were used to extract art
  direction from SLYNYRD top-down character tutorials, Masalimov Ilnur's Pixel
  Office 32x32 page, and Pixeline's top-down 32px character base page. The
  sources are recorded in `.omo/evidence/pixel-office-character-reference-notes.md`.
- Agent sprite generation remains direct sprite-gen component-row output. No
  reference images, command-center sprites, Claude assets, or purchased sheets
  are imported into runtime assets.
- `agent_sprite_design.py` now uses a `reference-informed top-down pixel office
  human character sprite` contract. The drawing primitives emphasize compact
  RPG-office proportions, paper-doll readable hair/head/chest/legs layers,
  anchored boots, and distinct role props.
- `generate_agent_sprite_assets.py` writes reference source URLs and a no-copy
  art-direction note into generated `sprite-request.json`, root manifest
  `referenceSources`, and per-role QA notes.
- Agent-stage cards now render the 48px generated character cells at 3x so the
  cast is the dominant first read. Room/classic avatar defaults remain smaller.
- Verification passed: RED manifest provenance test failed first on missing
  `referenceSources`; regenerated all five sprite-gen role atlases; targeted
  agent/spatial tests passed; full dashboard tests 149/149; `tsc -b`; Vite
  production build; browser QA PASS for Agents 1220/1440, reduced motion, and
  Topology 1220; visual contact-sheet and browser screenshot inspection;
  exact/near magenta pixel check returned 0; `git diff --check` had no
  whitespace errors beyond Windows LF/CRLF warnings. Evidence:
  `.omo/evidence/agent-sprite-gen-reference-informed-run.txt`,
  `.omo/evidence/agent-character-stage-reference-targeted.txt`,
  `.omo/evidence/dashboard-node-tests-reference-informed.txt`,
  `.omo/evidence/dashboard-tsc-reference-informed.txt`,
  `.omo/evidence/dashboard-vite-build-reference-informed.txt`,
  `.omo/evidence/agent-character-stage-browser-qa-reference-informed.txt`, and
  `output/playwright/agent-character-stage/reference-informed-sprite-gen-contact.png`.

- Active batch: `Frontend-skill 2D human sprite-gen redesign`
- Status: `complete` (2026-06-28)
- User rejected the remaining simplified character read and explicitly asked
  for the frontend skill plus direct sprite-gen generation of richer 2D human
  characters. The agent sprite generator now produces 48px detailed
  cel-shaded human operator sprites with readable faces, hair, neck/shoulder/
  torso/arm/hand/leg/boot separation, clothing layers, and role props. The
  Agent stage displays those 48px sprites at 2x so first-viewport density
  stays close to the previous presentation while the source art has more room
  for anatomy and clothing detail.
- `agent_sprite_design.py` now owns role-specific human operator specs for
  orchestrator, implementer, researcher, reviewer, and validator. The direct
  sprite-gen request and generated prompts are rewritten to say
  `detailed 2D cel-shaded human character sprite` and generated request
  provenance is locked away from simplified avatar/chibi/mascot language.
- `generate_agent_sprite_assets.py` now tolerates stale generated QA folders
  during reruns with `dirs_exist_ok=True`, which keeps Windows regeneration
  repeatable after a previous sprite-gen pass.
- Spatial Lens asset registry character entries now point at the generated
  `public/agent-sprites/generated` atlases too, removing the remaining
  command-center agent PNG references from dashboard source.
- `agent-character-stage.test.mjs` locks both generated QA notes and
  `sprite-request.json` provenance plus the 48px `cellSize`, so future
  regeneration cannot silently fall back to smaller simplified art.
- Verification passed: RED provenance test failed first against the old
  generated request; regenerated all agent sprites; dashboard tests 149/149;
  `tsc -b`; Vite production build; browser QA PASS; `git diff --check`; and
  visual contact-sheet inspection at
  `output/playwright/agent-character-stage/2d-human-sprite-gen-contact.png`.
  Evidence: `.omo/evidence/agent-sprite-gen-2d-human-run.txt`,
  `.omo/evidence/dashboard-node-tests-2d-human.txt`,
  `.omo/evidence/dashboard-tsc-2d-human.txt`,
  `.omo/evidence/dashboard-vite-build-2d-human.txt`,
  `.omo/evidence/agent-character-stage-browser-qa-2d-human.txt`, and
  `.omo/evidence/git-diff-check-2d-human.txt`.

- Active batch: `Direct sprite-gen agent character generation`
- Status: `complete` (2026-06-28)
- Replaced the agent character asset source path so generated runtime atlases no
  longer import `packages/command-center/public/sprites` or any Claude/borrowed
  character sheet. `generate_agent_sprite_assets.py` now creates role-owned
  sprite-gen run folders, writes direct component-row PNGs, extracts frames,
  previews motion GIFs, and composes public atlases from that local request.
- Added `packages/dashboard/scripts/agent_sprite_design.py` to keep the direct
  role sprite specs and drawing primitives separate from the generation
  orchestration. The generator is now under the OMO 250 pure-LOC ceiling, and
  each generated role includes `sprite-request.json`, `raw/`, `frames/`,
  `prompts/`, `references/`, QA GIF/contact output, atlas report, manifest, and
  QA notes stating there is no command-center, Claude, or imported character
  sheet source.
- Character-stage cards now render the newly generated 24px sprites at integer
  4x scale so the agents, rather than the office shell, are the dominant visual
  read. Room/classic avatar usage keeps its smaller default scale.
- Verification passed: regenerated all agent sprite assets; dashboard tests
  149/149; `tsc -b`; Vite production build; browser QA PASS for Agents
  1220/1440, reduced motion, and Topology 1220; and `git diff --check`.
  Evidence: `.omo/evidence/agent-sprite-gen-direct-run.txt`,
  `.omo/evidence/dashboard-node-tests-direct-sprite.txt`,
  `.omo/evidence/dashboard-tsc-direct-sprite.txt`,
  `.omo/evidence/dashboard-vite-build-direct-sprite.txt`,
  `.omo/evidence/agent-character-stage-browser-qa-direct-sprite.txt`, and
  `.omo/evidence/git-diff-check-direct-sprite.txt`.

- Active batch: `LazyCodex frontend character-stage polish`
- Status: `complete` (2026-06-28)
- Ran a scoped LazyCodex/frontend-skill polish pass on the existing
  sprite-gen Agent stage. The visual thesis is a quiet operator roster where
  the selected agent character is the first-read anchor, not the office shell.
- `AgentCharacterStage` now uses product-facing copy (`Active agent cast`) and
  displays readable motion/trait labels such as `Command pulse` and
  `gate review` while keeping raw `data-motion-profile` ids intact for CSS,
  tests, and QA.
- `office-stage.module.css` gives the selected character card a stronger
  stage treatment, wider desktop grid share, clearer action-link affordance,
  and subtle state emphasis for `blocked` / `review` chips. Reduced-motion
  behavior remains preserved.
- Verification passed: dashboard tests 149/149; `tsc -b`; Vite production
  build; `git diff --check`; and browser QA PASS for Agents 1220/1440,
  reduced motion, and Topology 1220. Evidence:
  `.omo/evidence/dashboard-node-tests-frontend-skill.txt`,
  `.omo/evidence/dashboard-tsc-frontend-skill.txt`,
  `.omo/evidence/dashboard-vite-build-frontend-skill.txt`,
  `.omo/evidence/git-diff-check-frontend-skill.txt`, and
  `.omo/evidence/agent-character-stage-browser-qa-frontend-skill.txt`.

- Active batch: `Sprite-gen agent character stage implementation`
- Status: `complete` (2026-06-27)
- Focused office-preview is now character-first. The stage tab label is
  `Agents`, and Focused mode renders `AgentCharacterStage` rather than the
  Spatial Lens floor viewport. The stage exposes explicit `handoff`,
  `blocked`, and `next` signal cells plus agent character cards.
- Runtime agent visuals now resolve sprite-gen-backed public atlases from
  `packages/dashboard/public/agent-sprites/generated`. The app does not depend
  on sprite-gen at runtime. Generation/provenance is captured by
  `packages/dashboard/scripts/generate_agent_sprite_assets.py`,
  `public/agent-sprites/generated/manifest.json`, per-role manifests, QA GIFs,
  contact sheets, and QA notes.
- Visible character motion is diversified in the demo: architect uses
  `command-pulse`, sentinel uses `verify-brace`, owner-gate approval uses a
  reviewer-style `review-scan` approval profile, and worker-1 uses
  `build-shift`. Canonical generated assets also include researcher
  `research-orbit`.
- A review-found Focused regression was fixed: Agents mode again exposes an
  actionable next-operator CTA, `Open approvals`, linked to `#/approvals` with
  `data-next-action-kind="owner-approval"`.
- `OfficeAvatar` no longer renders canvas avatars. It renders stacked static
  sprite-gen atlas frames with opacity cycling and role transform/filter
  motion, preserving reduced-motion behavior. Character-stage avatars render
  at integer 3x scale; room/classic usage keeps the default 2x scale.
- Verification passed: RED character-stage test failed first on the missing
  model; final dashboard tests 149/149; `tsc -b`; Vite production build; and
  browser QA PASS for Agents 1220/1440, reduced motion, and Topology 1220.
  Evidence: `.omo/evidence/dashboard-node-tests-final.txt`,
  `.omo/evidence/dashboard-tsc-final.txt`,
  `.omo/evidence/dashboard-vite-build-final.txt`, and
  `output/playwright/agent-character-stage-results.json` with screenshots under
  `output/playwright/agent-character-stage/`.

- Active batch: `Office-preview character-first redesign guidance`
- Status: `complete` (2026-06-27)
- Reviewed the current office-preview contract in `DESIGN.md`,
  `PixelOffice.tsx`, `OfficeStage.tsx`, `FocusedHandoffView.tsx`,
  `OfficeSidebar.tsx`, and `AgentSprite.tsx`, plus the latest Focused /
  Overview / Classic browser evidence under
  `output/playwright/sprite-gen-office-overhaul/`.
- Updated `DESIGN.md` so Conitens now defines the office shell as secondary
  scenery and the agents/handoffs as the primary visual read. Preserved the
  existing dark shell, Focused/Overview/Classic split, semantic status colors,
  one-row top nav at `1220px`, and no-new-runtime-deps asset constraint.
- Added `docs/frontend/OFFICE_PREVIEW_CHARACTER_FIRST_REDESIGN.md` as the
  implementation handoff for the redesign. It defines character-first
  principles, per-mode UI intent, component guidance, motion taxonomy,
  Must/Must-not guardrails, success criteria, and binary QA scenarios.

- Active batch: `Sprite-gen office visual overhaul`
- Status: `complete` (2026-06-27)
- Installed `aldegad/sprite-gen` as a local Codex skill at
  `C:\Users\eomsh\.codex\skills\sprite-gen` and used its imported-PNG curation
  path for the office fixture refresh. The app does not depend on sprite-gen at
  runtime.
- Added `DESIGN.md` as the dashboard design contract for the office UI:
  signal-first pixel office, dark operator shell, Focused workbench dominance,
  topology-first Overview, and dependency-free generated public assets.
- Added `packages/dashboard/scripts/generate_office_sprite_assets.py`. It
  creates loose 24px fixture PNGs, runs sprite-gen
  `unpack_atlas_run.py --pngs-dir ...` and
  `export_curated_pngs.py --run-dir ...`, then composes
  `packages/dashboard/public/office-fixtures.png` and
  `office-fixtures.meta.json`.
- `office-fixtures.png` still preserves the existing runtime contract:
  `600x24`, 25 cells, 24px cell size, registry order matching
  `OFFICE_FIXTURE_REGISTRY`. `office-fixtures.meta.json` now records
  generator repo/version/pipeline and source rectangles.
- Regenerated the seven repeatable office floor tiles
  `office-floor-{control,corridor,lab,lane,lobby,stage,workspace}.png` and
  retuned `tokens.css`, `office-stage.module.css`, and
  `spatial-lens.module.css` around the darker office palette.
- Verification passed: new provenance test failed first on missing metadata;
  targeted tests 17/17; full dashboard tests 145/145; dashboard production
  build; browser QA 6/6 for Focused 1220/1440, Floor Overview 1440/1220, and
  Classic 1440/1220. Evidence:
  `output/playwright/sprite-gen-office-overhaul-results.json` and screenshots
  under `output/playwright/sprite-gen-office-overhaul/`.

- Active batch: `Ultrawork cleanup`
- Status: `complete` (2026-06-14)
- Removed evidence-backed stale files and local generated artifacts without
  changing active runtime behavior. Deleted unused dashboard modules:
  `AgentDetail.tsx`, `AgentStudio.tsx`, `ApprovalCenter.tsx`,
  `HandoffLink.tsx`, `KanbanBoard.tsx`, `OverviewDashboard.tsx`,
  `TaskDetailModal.tsx`, `ThreadBrowser.tsx`, `ThreadDetail.tsx`,
  `Timeline.tsx`, and `hooks/use-websocket.ts`; deleted unreferenced
  command-center visual layer `HierarchyDepthLODLayer.tsx`.
- Removed tracked artifact files: root `after-*.png`, root `screenshot-*.png`,
  and generated `packages/dashboard/tsconfig.tsbuildinfo` (already covered by
  `*.tsbuildinfo` ignore). Removed local ignored/untracked artifacts:
  `spatial-lens-focused-polish-*.png`, old root office/forward screenshots,
  duplicate `node_modules (1)`, `.pytest_cache`, Python `__pycache__`,
  Playwright local caches, `.audit`, selected old `.tmp` Chrome/screenshot/log
  artifacts, and `packages/dashboard/.audit`.
- Preserved high-risk runtime/projection surfaces: `.notes/`, `.omx/`,
  `.conitens/runtime/`, `.omo/evidence/`, cloned research repositories, and
  active local config.
- Verification passed: dashboard baseline tests 144/144 before cleanup,
  post-cleanup dashboard tests 144/144, dashboard production build,
  deleted-symbol grep (no active references), and `git diff --check`.
  Command-center package-wide tests/build remain blocked by unrelated existing
  failures: YAML agent extraction parses `undefined` entries, and build has
  TypeScript errors in `src/main.tsx` plus `src/office/RoomMonitor.ts`.

- Active batch: `Office component reposition fix`
- Status: `complete` (2026-06-14)
- User rejected the prior Floor Overview OSS UX reposition because the actual
  office/floor components had not moved; the prior batch explicitly left
  `FloorViewport` internals unchanged. The corrective pass now changes the
  real room schema and topology, not just the preview shell/inspector rail.
- `OFFICE_STAGE_ROOMS` now uses an operator-chain floor arrangement:
  `ops-control` at `3/3/30/20`, `impl-office` at `3/27/30/31`,
  `validation-office` at `61/3/30/22`, `review-office` at `61/29/30/23`,
  `research-lab` at `61/58/30/22`, and `project-main` at `34/60/24/32`.
  The right column now reads validation -> review -> research, while Central
  Commons becomes the lower-center hub.
- Supporting floor topology moved with the rooms:
  `corridorGraph.ts` updates room stubs, nodes, route points, and blocked-lane
  points; `floorLayout.ts` updates floorplate zones, wall seams, and columns.
  Classic reads the shared room schema directly, so Classic and Overview now
  share the same actual office placement.
- `spatial-lens-floor-geometry.test.mjs` locks the operator-chain coordinates.
  The test failed first against the unchanged room geometry, then passed after
  the schema/topology move.
- Browser QA now asserts `data-room-id` DOM placements for Overview 1440 and
  1220, verifies validation -> review -> research stacking, preserves
  Focused workbench/keyboard contracts, and includes Classic 1440 and 1220.
  Evidence: `output/playwright/office-component-reposition-fix-results.json`
  and screenshots under
  `output/playwright/office-component-reposition-fix/`.
- Verification passed: targeted floor geometry/layout tests, full dashboard
  tests 144/144, dashboard production build, `git diff --check`, browser QA
  across Focused 1220/1440, Overview 1440/1220, and Classic 1440/1220, plus
  read-only visual/operator reviews with PASS verdicts. No new dependencies.

- Active batch: `Floor Overview OSS UX reposition`
- Status: `complete` (2026-06-14)
- Repositioned Floor Overview into a map-first command-center layout based on
  OSS agent-management UX benchmarks (LangSmith/LangGraph Studio, AutoGen
  Studio, Flowise, Dify, Langfuse/AgentOps/Open WebUI patterns): the floor
  topology stays primary, and operational detail now sits in an adjacent
  overview inspector rail instead of reading as a detached generic sidebar.
- `PixelOffice` now derives shell/sidebar modes with
  `getOfficePreviewShellMode(stageMode)` and `getOfficeSidebarMode(stageMode)`.
  Floor Overview uses `data-office-preview-shell="floor-command-center"` and
  `data-office-sidebar-mode="overview"`. Focused remains
  `workbench-dominant`; Classic remains `viewport-dominant`.
- `OfficeSidebar` accepts `mode: "full" | "focused" | "overview"` and labels
  the overview focus card as `overview inspector`. In overview mode, Task
  Queue is ordered before Active Agents, the rail is scrollable, and agent meta
  truncates via a CSS Module-safe `:global(.muted)` selector.
- `office.module.css` keeps Overview as a two-column map+inspector frame at
  1440px and 1220px, with a narrower 1220px rail so the map remains dominant.
  Browser QA measured Overview 1220 floor width 869px vs inspector width
  260px, with no horizontal overflow.
- `FloorViewport` internals were intentionally not changed for this pass.
- Verification passed: RED source contract first failed on missing
  `floor-command-center`; targeted tests 31/31; full dashboard tests 143/143;
  dashboard production build; browser QA for Focused 1220/1440, Overview
  1440/1220, and Classic 1440. Evidence:
  `output/playwright/floor-overview-oss-ux-results.json`,
  `output/playwright/floor-overview-oss-ux/overview-1440.png`,
  `output/playwright/floor-overview-oss-ux/overview-1220.png`, plus
  `.omo/evidence/floor-overview-oss-ux-*.txt`.

- Previous active batch: `Frontend design architecture improvement execution`
- Status: `complete` (2026-06-14)
- Executed the approved `.omo/plans/frontend-design-architecture-improvement.md`
  slice for the dashboard Spatial Lens. Focused mode remains the Active
  Handoff Workbench, while Floor Overview is now the only full floor topology
  surface and Classic remains isolated.
- `createFocusedHandoffWorkbenchModel` still owns the public workbench model,
  but CTA derivation and event/edge derivation are split into
  `focusedNextAction.ts` and `focusedWorkbenchEvents.ts` to keep the model file
  under the 250 pure-LOC ceiling. The CTA is model-owned via
  `nextActionKind`, `nextActionCtaLabel`, and `nextActionHref`.
- `OfficeStage` stage controls now use real `tablist` / `tab` / `tabpanel`
  semantics with ArrowLeft/ArrowRight keyboard switching. Focused never passes
  `viewMode="focused"` into `FloorViewport`.
- Removed dormant Focused-map surfaces:
  `FocusedRouteTargetEdge.tsx`, `FocusedCorridorContinuityLayer.tsx`,
  `MinimapDock.tsx`, and the `AgentOffscreenRail` export. Final source grep
  found no active `FocusedRouteTargetEdge`, `FocusedCorridorContinuityLayer`,
  `MinimapDock`, `AgentOffscreenRail`, `viewMode="focused"`, or
  `data-operator-focus-map` references under `packages/dashboard/src`.
- Browser QA uses `.omo/evidence/run-frontend-design-architecture-qa.mjs`,
  a dependency-free Chrome/Edge CDP harness. Evidence:
  `output/playwright/frontend-design-architecture-improvement-results.json`
  plus screenshots under
  `output/playwright/frontend-design-architecture-improvement/`.
- Verification passed: `pnpm.cmd --filter @conitens/dashboard test`
  (142/142), `pnpm.cmd --filter @conitens/dashboard build`, targeted Spatial
  Lens tests, final browser QA for Focused 1220/1440, Overview 1440, and
  Classic 1440, and model split LOC check (248/59/67).
- Post-review fix: the first review pass found that inactive tabs pointed to
  missing tabpanels and arrow-key switching did not move focus. `OfficeStage`
  now keeps all three controlled tabpanels in the DOM, hides inactive panels,
  and focuses the newly selected tab after ArrowLeft/ArrowRight. Browser QA now
  records `tabpanelCount=3`, `activeTabpanelCount=1`,
  `tabsControlExistingPanels=true`, and keyboard focus/selection transitions.
  Re-review passed with no remaining blockers.

- Latest review patch: `Focused workbench blocker fallback hardening`
  (complete, 2026-06-12). Code-review follow-up fixed
  `createFocusedHandoffWorkbenchModel` so the workbench no longer invents a
  BLOCKED owner-gate step from `tasks[0]` when no task is blocked. The
  owner-gate slot now renders `CLEAR`, headline `No blocked owner gate`, and
  a model-derived `nextActionDetail` for review/monitoring states.
- Blocked-age now starts from block-opening events (`question.opened`,
  `approval.pending`, or `task.status_changed` to blocked), ignoring earlier
  lifecycle events such as `task.created`. Regression coverage added for both
  no-blocker fallback and age-event filtering.
- Verification: targeted `spatial-lens-pixel-grammar.test.mjs` 22/22, full
  dashboard tests 144/144, dashboard build passed, repo-structure post-write
  tracked graph cycles=0. `--include-untracked` post-write scan timed out
  twice due current large untracked workspace artifacts; tracked graph plus
  real dashboard test/build covered the changed files.

- Active batch: `Floor Overview declutter v2 (structural)`
- Status: `complete` (2026-06-12)
- User rejected the first declutter approach ("투명도 넣는다고 나아지진
  않아") — opacity muting leaves shape clutter. v2 replaces it with
  structural removal: in overview, `.room-dressing-layer`,
  `.workstation-layer`, and `.wall-detail-layer` are `display: none` (no
  half-opacity rules remain), the room-kit signature sprites and
  operational-overlay task affordances render at full strength, and the six
  `data-floor-style` floor colors are overridden to a unified dark
  theme-tinted palette (`command-grid #203043`, `maker-plank #382c20`,
  `quiet-lab #25302c`, `checkpoint-tile #26302b`, `quiet-review #25323e`,
  `commons-stage #34291d`) killing the white/brown patchwork.
- Browser verified: workstation/dressing/wall-detail all hidden, room-kit
  opacity 1, six dark floor computed colors confirmed, route/packet/blocked
  marker/agents/plaques crisp. Tests 142/142, build passed.
- Evidence: `output/playwright/overview-declutter-v3.png` (final),
  `overview-declutter-v2.png` (intermediate), alongside the v1
  before/after pair.

- Previous batch result (superseded): `Floor Overview declutter` (v1)
- User feedback was that Floor Overview is messy. Root cause: the room
  dressing density authored for the old 3x Focused camera renders as
  sub-readable color noise at 1x, and FloorViewport now only ever renders in
  Overview mode. Fix is overview-scoped CSS only (under
  `.floor-viewport[data-viewport-mode="overview"]`): `.room-dressing-layer`
  hidden, `.workstation-layer`/`.room-kit-layer` muted (opacity 0.5,
  saturate 0.55), `.room-floor` calmed (saturate 0.7, brightness 0.92).
  Signal layers (AgentLayer, HandoffOverlay route/packet, blocked marker,
  door frames, room plaques) are siblings of `.room-floor` and stay at full
  strength. No component, template, or data contract changed.
- Browser verified at 1440x900: 0 visible dressing layers (6 mounted),
  computed opacity/filter values confirmed, 4 agent stations, 1 packet,
  1 blocked marker, no overflow. Tests 142/142 (1 new CSS-contract
  assertion in spatial-lens-room-dressing.test.mjs), build passed.
- Evidence: `output/playwright/overview-declutter-results.json` with
  before/after screenshots `overview-declutter-{before,after}.png`.

- Previous batch: `OSS agent-visualization research applied to Focused workbench`
- Status: `complete` (2026-06-12)
- Researched open-source agent-visualization patterns and applied three to
  the Focused workbench: (1) **blocked-age chip** (Langfuse/AgentOps
  duration-on-stuck-span pattern) — `blocked 11m` rendered on the blocked
  card and next-action row, derived from the event log
  (`question.opened` for `q_184_owner_gate` vs the latest event timestamp,
  never `Date.now()`, replay-deterministic); (2) **semantic workbench
  edges** (LangGraph Studio stateful-edge pattern) — connectors are now
  model-derived `edges` (`plan-blocked=flow`, `blocked-validate=held`,
  `validate-approve=held`) rendered as hard-pixel arrows with an
  opacity-only pulse on the flow edge and `prefers-reduced-motion` support;
  (3) **latest-event ticker** (AI Town/ChatDev live-stream pattern plus
  Conitens I-1 event-first identity) — the posture strip shows
  `08:14:52 worker-1 artifact.written` with `data-latest-event`.
- `events` are threaded read-only `PixelOffice -> OfficeStage ->
  FocusedHandoffView` as an optional prop defaulting to `[]`; the model
  accepts optional `events` and stays pure. No canonical runtime, `.notes`,
  `.agent`, provider, approval, bridge, scheduler, or task mutation surface
  changed.
- Verification: tests 141/141 (139 baseline + 2 new model tests), build
  passed, browser evidence at
  `output/playwright/ux-oss-workbench-upgrades-results.json` with
  screenshot `ux-oss-workbench-upgrades.png`. All prior contracts held
  (one `Owner approval required`, 1 workbench, 4 steps, no overflow).
- A dev server was left running at `http://localhost:3003/#/office-preview`
  for the user (ports 3000-3002 are held by a parallel session).

- Previous batch: `Agent work-state vocabulary unification`
- Status: `complete` (2026-06-12)
- The ACTIVE AGENTS sidebar rail previously printed raw runtime
  `resident.status` (sentinel=running, owner=idle) while the Focused
  workbench derived work states (sentinel=REVIEW, owner=BLOCKED) — a
  conflicting-state duplication AGENTS.md forbids. The derivation is now a
  single exported pure function `getAgentWorkState(agentId, residents,
  tasks, handoffs)` in `focusedHandoffModel.ts`; the workbench passes
  `rooms.flatMap((room) => room.residents)` (behavior unchanged) and
  `OfficeSidebar` badges print the shared state lowercased with
  `getTaskTone` tones.
- Browser-verified rail/workbench agreement: architect=running(success),
  sentinel=review(info), owner=blocked(danger), worker-1=idle(neutral).
- Tests 139/139 (one new regression test locks the shared vocabulary and
  that the sidebar no longer prints `{resident.status}`); build passed.
- Evidence: `output/playwright/ux-state-vocabulary-results.json`,
  `output/playwright/ux-review-agent-rail-unified.png`.
- Note: ports 3000/3001 were already occupied by a parallel session's dev
  servers during verification; this batch verified on port 3002.

- Previous batch: `Frontend GUI UX design review and improvement pass`
- Status: `complete` (2026-06-12)
- A live-browser UX review of `#/office-preview` found and fixed three
  issues: (1) the Ops Control spatial-context thumbnail read as a broken
  white box because the room backdrop was suppressed to opacity 0.34 while a
  scale-2 white packet sprite covered the art — the backdrop is now the
  protagonist (opacity 0.6, softer filter) with a scale-1 bottom-right sprite
  accent; (2) workbench step cards carried ~60px of dead vertical space from
  fixed min-heights and an internal 1fr spacer row — cards now hug content at
  142px (1440) / 129px (1220), root min-height `clamp(380px, 34vw, 480px)`,
  1220 override `clamp(340px, 38vw, 440px)`; (3) the duplicated
  `Spatial Lens` kicker in the PixelOffice summary band was removed (the
  page-header kicker is the single instance).
- Verification: tests 138/138, build passed, browser evidence at
  `output/playwright/ux-review-results.json` with before/after screenshots
  `output/playwright/ux-review-*.png`. Focused contracts held: one
  `Owner approval required`, 1 workbench, 4 steps, nav 34px one row, no
  overflow; Overview keeps the floor map; Classic mounts no Spatial Lens
  floor. Context strip top is now 675px (1440) / 657px (1220) at scroll 0.

- Previous batch: `Spatial Lens Focused Workbench polish pass`
- Status: `complete` (2026-06-12)
- This pass resolved the three documented Focused-mode caveats from the IA
  redesign: duplicated `Owner approval required` copy, heavy nested chrome,
  and spatial context thumbnails below the first 1220x900 viewport.
- Copy dedupe: `Owner approval required` now renders exactly once in Focused,
  in the `Next operator action` row. The workbench h3 reads
  `q_184_owner_gate blocked at owner gate` (new derived `headline` model
  field), the CTA reads `Open approvals`, the blocked step meta reads
  `waiting on owner`, the approve step detail reads
  `gate opens after approval`, and the `PixelOffice` focused summary reason
  reads `q_184_owner_gate is waiting at the owner gate.` The literal string
  and `nextActionLabel` remain in `focusedHandoffModel.ts` per test contract.
- Chrome flatten: `.focused-workbench-root` is now a borderless layout shell
  (no border/box-shadow), posture metrics are divider-separated text instead
  of four bordered cards, and `.focused-workbench-main` is the single framed
  surface. All test-asserted class names and data hooks are unchanged.
- Viewport fit: root min-height `clamp(440px, 40vw, 560px)`, tightened
  paddings/gaps/h3 clamp; at scroll 0 the context strip top measured 756px at
  1220x900 and 774px at 1440x900, inside the first viewport.
- Verification: `pnpm --filter @conitens/dashboard test` 138/138,
  `pnpm --filter @conitens/dashboard build` passed, browser evidence at
  `output/playwright/spatial-lens-focused-polish-results.json` with
  screenshots `spatial-lens-focused-polish-{1220,1440}.png`. Overview keeps
  the full floor map; Classic mounts no Spatial Lens floor.
- Note: the office-preview page can remount out of Focused mode after Vite
  HMR; browser checks must re-select the `Focused` stage button first.
  `ensemble verify` does not exist in the current ensemble CLI.

- Verification refresh on 2026-06-11 passed dashboard tests
  (`pnpm.cmd --filter @conitens/dashboard test`, 138 tests), dashboard
  production build (`pnpm.cmd --filter @conitens/dashboard build`), and browser
  verification for Focused 1440px, Focused 1220px, Overview 1440px, and
  Classic 1440px.
- Latest browser evidence lives at
  `output/playwright/spatial-lens-verification-results.json` with screenshots
  `output/playwright/spatial-lens-verification-focused-1220.png`,
  `output/playwright/spatial-lens-verification-focused-1440.png`,
  `output/playwright/spatial-lens-verification-overview-1440.png`, and
  `output/playwright/spatial-lens-verification-classic-1440.png`.
- Browser verification confirmed Focused has one `FocusedHandoffView`, one
  active handoff workbench, no Spatial Lens floor map, no minimap, no phase
  rail, visible `q_184_owner_gate`, visible `Owner approval required`, visible
  `verify_append handoff: architect -> sentinel`, one nav row at 1220px, and
  no horizontal overflow. Overview keeps the full floor map; Classic has no
  Spatial Lens floor.
- Remaining product/UI caveats are unchanged: repeated `Owner approval
  required` copy, heavy nested chrome, and spatial context thumbnails below the
  first 1220x900 viewport.

- Active batch: `Spatial Lens Focused Workbench IA redesign`
- Status: `complete`
- Follow-up guidance from the latest attached prompt pack is now recorded in
  `AGENTS.md` under `Conitens UI Architecture Rules / Spatial Lens`, so future
  UI passes must treat Focused as an operator handoff workbench, keep Floor
  Overview as the full spatial map, avoid duplicate phase/state surfaces, and
  preserve the 1220px one-row nav constraint.
- The latest user-approved plan replaced the map-dominant Focused mode with a
  Workbench-first operator view. Focused no longer renders `FloorViewport`;
  Floor Overview remains the only full pixel-map topology surface, and Classic
  remains the legacy room-scene fallback.
- `FocusedHandoffView` is now the single primary Focused tab body, with
  `data-focused-handoff-view="true"`,
  `data-active-handoff-workbench="true"`, and one left-to-right chain:
  `architect / PLAN / RUNNING` ->
  `q_184_owner_gate / BLOCKED / owner approval required` ->
  `sentinel / VALIDATE / REVIEW` -> `owner / APPROVE / BLOCKED`.
- The blocked task and next operator action are readable without inspecting
  sprites. The blocked card carries the strongest emphasis, the handoff
  summary reads `verify_append handoff: architect -> sentinel`, and the next
  action row says `Owner approval required` with a link to `#/approvals`.
- The Focused workbench has one compact status header for live rooms, blocked
  lanes, handoffs, and current focus. Pixel-office identity is retained only
  as a muted two-room spatial context strip for Ops Control and Validation
  Office, not as the dominant floor map.
- The Focused path no longer mounts the full floor map, route minimap,
  focused route target edge, focused corridor continuity layer, agent offscreen
  rail, old focused handoff rail, or separate phase lane strip.
- `focusedHandoffModel.ts` now owns the pure derivation of the active
  workbench model from existing `rooms`, `tasks`, and `handoffs`. The current
  fixture behavior keeps `q_184_owner_gate` as the blocked owner gate,
  `verify_append` as the review task, and `architect->sentinel->owner` as the
  active route.
- `PixelOffice` now owns `stageMode` while preserving
  `conitens.officeStageMode`, and its Focused summary band is compact so
  metrics do not compete with the workbench. `OfficeSidebar` accepts a mode
  prop and de-emphasizes its rail content under Focused mode.
- The pass is frontend/UI-only. It adds no canonical runtime truth, `.notes`,
  `.agent`, provider, approval, bridge, scheduler, external fetch, dependency,
  backend route, or task mutation surface.
- Regression coverage now locks that Focused renders exactly one workbench,
  does not mount a Focused floor viewport, has no minimap/target edge/phase
  rail, exposes four phase steps, and keeps Overview as the full floor map.
- Browser evidence at `http://localhost:3003/#/office-preview` reports
  Focused 1440 and 1220: one `FocusedHandoffView`, one workbench, zero
  Spatial Lens floor mounts, zero minimaps, zero focused target edges, zero
  phase rails, four workbench steps, two context thumbnails, visible
  `q_184_owner_gate`, visible `Owner approval required`, visible
  `verify_append handoff: architect -> sentinel`, one nav row, and no
  horizontal overflow. Overview 1440 keeps one floor map, while Classic mounts
  no Spatial Lens floor.
- Verification passed targeted Spatial Lens/shell tests, TypeScript noEmit,
  full `pnpm.cmd --filter @conitens/dashboard test` with 138 tests,
  `pnpm.cmd --filter @conitens/dashboard build`, browser evidence, and the
  dashboard-scoped repo-structure post-write gate with `cycles=0`.
  `.vibe/brain/precommit.py` was run and failed on existing
  `@conitens/command-center` typecheck baseline regressions, with no staged or
  scannable files in its report and smoke unittest passing.
- Evidence lives at
  `output/playwright/spatial-lens-focused-view-results.json`,
  `output/playwright/spatial-lens-focused-view-focused-1440.png`,
  `output/playwright/spatial-lens-focused-view-focused-1220.png`,
  `output/playwright/spatial-lens-focused-view-overview-1440.png`,
  `output/playwright/spatial-lens-focused-view-classic-1440.png`, and
  `packages/dashboard/.audit/repo-structure-lens/audit-summary.latest.md`.

- Previous active batch: `Spatial Lens Prompt 4.16 focused handoff rail pass`
- Status: `complete`
- The previous pass added a central handoff rail but still kept the full pixel
  floor as Focused mode's protagonist. The Workbench redesign supersedes that
  map-overlay hierarchy.

- Previous active batch: `Spatial Lens Prompt 4.15 operator focus map pass`
- Status: `complete`
- The previous pass converted Focused into an operator focus map with rail-only
  task treatment, active-only floor agents, phase lane strip, collapsed
  minimap, and one labeled handoff edge. Prompt 4.16 supersedes its minimap and
  literal `HANDOFF` label choices.

- Previous active batch: `Spatial Lens Prompt 4.14 visual polish pass`
- Status: `complete`
- The latest user request asked to use or reference `aldegad/sprite-gen` to
  improve the office designs.
- Applied the `sprite-gen` component-row / manifest / curation idea to the
  existing Spatial Lens pixel office without adding a new runtime dependency.
- `generatedAssetManifest.ts` now carries curation metadata for selected
  generated frames and exposes previously unused local sheet frames:
  `prop.auditTicket`, `prop.checkScanner`, and `character.ownerReviewing`.
- `GeneratedSprite` now exposes `data-generated-sprite-curation` and
  curation offset CSS variables, so browser evidence can distinguish curated
  generated frames from ordinary generated sprites.
- `generatedRoomBackdrops.ts` now declares component-row curation tile and
  anchor metadata for the Ops Control room, Validation Office room, and the
  Validation target-edge backdrop.
- `GeneratedRoomBackdropLayer` now emits `data-generated-room-curation` and
  tile/anchor CSS variables used by the Spatial Lens room material styling.
- `roomKit.ts` now adds curated office props to every templated room, raising
  the generated room-kit contract from 13 to 20 sprites across six rooms.
- Owner review / handoff-receiving visual state now resolves to
  `character.ownerReviewing`.
- Spatial Lens CSS adds subtle curation-grid room material and generated
  sprite offset/drop-shadow handling while preserving hard-pixel integer-scale
  grammar; no skew, perspective, fractional scale, or new write surface was
  added.
- The pass is visual-only and uses existing project-owned generated assets. It
  adds no canonical runtime truth, `.notes`, `.agent`, provider, approval,
  bridge, scheduler, external fetch, new dependency, or task mutation surface.
- Regression coverage now locks sprite curation metadata, room backdrop
  curation metadata, generated renderer hooks, curated room-kit counts, and the
  owner reviewing sprite contract.
- Browser evidence at `http://localhost:3000/#/office-preview` reported
  Focused 1440: `cameraZoom: "3"`, camera stage transform
  `matrix(3, 0, 0, 3, 0, 0)`, focused room `ops-control`, target room
  `validation-office`, route framing `source-corridor-target-edge`,
  279 generated sprites, 7 curated generated sprites, 6 room-kit layers,
  20 room-kit sprites, 7 curated room-kit sprites, 3 component-row room
  backdrops, 1 focused target-edge backdrop, 0 console/page errors, and
  0 horizontal overflow.
- Laptop-width Focused kept the same `3x` camera, 20 room-kit sprite, curated
  sprite, and component-row backdrop contract with no horizontal overflow.
  Floor Overview remains `1x` topology with 0 generated room backdrops.
  Classic mounts no Spatial Lens floor and reports 0 generated sprites.
- Verification passed full `pnpm.cmd --filter @conitens/dashboard test` with
  133 tests and `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-spritegen-results.json`,
  `output/playwright/spatial-lens-spritegen-focused-1440.png`,
  `output/playwright/spatial-lens-spritegen-focused-1220.png`,
  `output/playwright/spatial-lens-spritegen-overview-1440.png`,
  `output/playwright/spatial-lens-spritegen-classic-1440.png`,
  `.omx/state/spatial-lens-spritegen/ralph-progress.json`, and
  `.audit/repo-structure-lens/audit-summary.latest.md`.
- Visual verdict is `pass`, score 98/100. Further Pixel Agents parity should
  generate or slice exact-size room backdrops for all six rooms and then
  reduce duplicated authored props where the room art carries enough identity.

- Previous active batch: `Spatial Lens Prompt 4.13 visual polish pass`
- Status: `complete`
- The latest "next step" request advanced from Prompt 4.12 generated room-kit
  signatures into Focused-mode generated room backdrops for the Spatial Lens
  pixel office.
- Copied generated Ops Control and Validation Office room references into
  `packages/dashboard/public/assets/spatial-lens/generated/` as
  `ops-control-room-backdrop.png` and `validation-office-room-backdrop.png`.
- Added `generatedRoomBackdrops.ts`, a bounded manifest for generated room
  backdrop ids, public src paths, dimensions, usage, opacity, and fitting
  metadata.
- Added `GeneratedRoomBackdropLayer`, a reusable backdrop renderer with stable
  `data-generated-room-backdrop*` hooks.
- `FloorViewport` now passes `showGeneratedBackdrops={isFocusedMode}` into
  `RoomZone`, so regular room backdrops render only in Focused mode.
- `FocusedRouteTargetEdge` now renders the Validation target-edge backdrop
  beneath its checkpoint sprite props.
- Spatial Lens CSS blends generated backdrops under existing room depth,
  room-kit, workstation, dressing, and operational layers; no skew,
  perspective, fractional scale, or new write surface was added.
- The new backdrop layer is visual-only and driven by existing `RoomTemplate`
  ids plus the existing project-owned generated reference files. It adds no
  canonical runtime truth, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, or task mutation surface.
- Generated asset tests now lock public backdrop file presence and manifest
  bounds. Room dressing tests lock Focused-only backdrop wiring and the
  target-edge backdrop hook.
- Browser evidence at `http://localhost:3000/#/office-preview` reported
  Focused 1440: `cameraZoom: "3"`, camera stage transform
  `matrix(3, 0, 0, 3, 0, 0)`, focused room `ops-control`, target room
  `validation-office`, route framing `source-corridor-target-edge`,
  3 generated room backdrops, 2 regular room backdrops, 1 focused target-edge
  backdrop, 6 room-kit layers, 13 room-kit sprites, 272 generated sprites,
  0 console/page errors, and 0 horizontal overflow.
- Laptop-width Focused kept the same `3x` generated-backdrop/room-kit/route
  contract with no horizontal overflow. Floor Overview remains `1x` topology
  with 0 generated room backdrops and 261 generated sprites. Classic mounts no
  Spatial Lens floor and reports 0 generated room backdrops and 0 generated
  sprites.
- Verification passed targeted Spatial Lens tests, full
  `pnpm.cmd --filter @conitens/dashboard test` with 131 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-prompt53-results.json`,
  `output/playwright/spatial-lens-prompt53-focused-1440.png`,
  `output/playwright/spatial-lens-prompt53-focused-1220.png`,
  `output/playwright/spatial-lens-prompt53-overview-1440.png`,
  `output/playwright/spatial-lens-prompt53-classic-1440.png`, and
  `.omx/state/spatial-lens-prompt53/ralph-progress.json`.
- Visual verdict is `pass`, score 98/100. Further Pixel Agents parity should
  generate or slice exact-size room backdrops for all six rooms and then
  reduce duplicated authored props where the room art carries enough identity.

- Previous active batch: `Spatial Lens Prompt 4.12 visual polish pass`
- Status: `complete`
- The latest "next step" request advanced from Prompt 4.11 room depth polish
  into generated room-kit signature sprites for the Spatial Lens pixel office.
- Added `roomKit.ts`, a pure room-template to generated-sprite signature map.
- Added `RoomKitLayer`, rendered inside `RoomZone` after `RoomDepthLayer` and
  before wall/workstation/dressing/operational layers.
- Every templated room now renders at least two room-kit generated sprites:
  Ops Control has command screens and an active packet, Validation Office has
  red/green gate lights and a received packet, and the remaining rooms have
  small role-specific generated prop signatures.
- The new room-kit layer is visual-only and driven by existing `RoomTemplate`
  ids/themes plus the existing project-owned generated sprite sheet. It adds
  no canonical runtime truth, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface.
- Room dressing tests now lock room-kit counts, the `RoomKitLayer` render path,
  data hooks, and required generated sprite ids.
- Browser evidence at `http://localhost:3000/#/office-preview` reported
  Focused 1440: `cameraZoom: "3"`, camera stage transform
  `matrix(3, 0, 0, 3, 0, 0)`, focused room `ops-control`, target room
  `validation-office`, route framing `source-corridor-target-edge`, 6 room-kit
  layers, 13 room-kit sprites, 272 generated sprites, 6 room depth layers,
  24 depth accents, 3 continuity tiles, 1 source-side route guide tile,
  1 packet slot, six focused Validation checkpoint props, 0 console/page
  errors, and 0 horizontal overflow.
- Laptop-width Focused kept the same `3x` room-kit/route/depth/checkpoint
  contract with no horizontal overflow. The Ops Control command-screen and
  active-packet room-kit signatures remain visible in the Focused camera crop.
- Floor Overview remains `1x` topology and renders 6 room-kit layers and
  13 room-kit sprites at overview scale. Classic mounts no Spatial Lens floor
  and reports 0 room-kit layers, 0 room-kit sprites, and 0 generated sprites.
- Verification passed targeted Spatial Lens tests, full
  `pnpm.cmd --filter @conitens/dashboard test` with 129 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-prompt52-results.json`,
  `output/playwright/spatial-lens-prompt52-focused-1440.png`,
  `output/playwright/spatial-lens-prompt52-focused-1220.png`,
  `output/playwright/spatial-lens-prompt52-overview-1440.png`,
  `output/playwright/spatial-lens-prompt52-classic-1440.png`, and
  `.omx/state/spatial-lens-prompt52/ralph-progress.json`.
- Visual verdict is `pass`, score 98/100. Further Pixel Agents parity should
  use true generated room backdrops or manually sliced generated room mockups,
  not route-marker density, oversized labels, or shell compression.

- Previous active batch: `Spatial Lens Prompt 4.11 visual polish pass`
- Status: `complete`
- The latest "next step" request advanced from Prompt 4.10 into room/asset
  depth polish for the Spatial Lens pixel office.
- Added `RoomDepthLayer`, a reusable decorative layer rendered inside templated
  `RoomZone` floors before wall, workstation, dressing, and operational prop
  layers.
- Each templated room now renders four hard-pixel depth accents:
  `back-wall-shadow`, `baseboard`, `work-mat`, and `foreground-lip`.
- `spatial-lens.module.css` provides low-contrast theme-specific depth
  treatments for ops, validation, impl, commons, research, and review rooms.
- The new depth layer is visual-only and driven by existing `RoomTemplate`
  `roomId`/`theme`; no canonical runtime truth, `.notes`, `.agent`, provider,
  approval, bridge, scheduler, external fetch, asset download, or task
  mutation surface changed.
- Room dressing tests now lock the `RoomDepthLayer` render path and
  ops/validation theme-specific CSS contract.
- Browser evidence at `http://localhost:3000/#/office-preview` reported
  Focused 1440: `cameraZoom: "3"`, camera stage transform
  `matrix(3, 0, 0, 3, 0, 0)`, focused room `ops-control`, target room
  `validation-office`, route framing `source-corridor-target-edge`, 6 room
  depth layers, 24 depth accents, all six themes represented, 3 continuity
  tiles, 1 source-side route guide tile, 1 packet slot, six focused
  Validation checkpoint props, 0 console/page errors, and 0 horizontal
  overflow.
- Laptop-width Focused kept the same `3x` room-depth/route/checkpoint contract
  with no horizontal overflow. Floor Overview remains `1x` topology and
  renders six room depth layers at overview scale; Classic mounts no Spatial
  Lens floor and reports 0 room depth layers and 0 generated sprites.
- Verification passed targeted Spatial Lens tests, full
  `pnpm.cmd --filter @conitens/dashboard test` with 128 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-prompt51-results.json`,
  `output/playwright/spatial-lens-prompt51-focused-1440.png`,
  `output/playwright/spatial-lens-prompt51-focused-1220.png`,
  `output/playwright/spatial-lens-prompt51-overview-1440.png`,
  `output/playwright/spatial-lens-prompt51-classic-1440.png`, and
  `.omx/state/spatial-lens-prompt51/ralph-progress.json`.
- Visual verdict is `pass`, score 98/100. Further Pixel Agents parity should
  use true generated room art or a richer generated room-kit asset pass, not
  shell compression or extra route-marker density.

- Previous active batch: `Spatial Lens Prompt 4.10 visual polish pass`
- Status: `complete`
- The latest "next step" request advanced from Prompt 4.9 viewport dominance
  into richer Validation target-edge room art.
- `FocusedRouteTargetEdge` now marks the focused Validation target floor with
  `data-focused-validation-checkpoint="true"`.
- The focused target edge now renders generated sprite props for
  `clipboard-rack`, `route-port`, `stamp-desk`, `document-stack`,
  `green-light`, and `red-light`, alongside the existing checklist board,
  inbox tray, packet, and sentinel.
- The new props are visual-only generated sprites using integer scale `1` or
  `2`; no canonical runtime truth, `.notes`, `.agent`, provider, approval,
  bridge, scheduler, external fetch, asset download, or task mutation surface
  changed.
- Spatial Lens pixel grammar tests now lock the Validation checkpoint sprite
  contract in addition to route guide restraint, packet slot, compact route
  minimap, focused target hooks, compact offscreen awareness, focused corridor
  continuity, and CSS integer scale transforms.
- Browser evidence at `http://localhost:3000/#/office-preview` reported
  Focused 1440: `cameraZoom: "3"`, camera stage transform
  `matrix(3, 0, 0, 3, 0, 0)`, focused room `ops-control`, target room
  `validation-office`, route framing `source-corridor-target-edge`, 3
  continuity tiles, 1 source-side route guide tile, 1 packet slot, 3 target
  route pixels, target agent `sentinel`, 259 generated sprites, the six
  focused validation props, 0 console/page errors, and 0 horizontal overflow.
- Laptop-width Focused kept the same `3x` checkpoint/route contract with no
  horizontal overflow. Floor Overview remains `1x` topology and renders no
  focused target edge or validation checkpoint props; Classic mounts no
  Spatial Lens floor and reports 0 generated sprites.
- Verification passed targeted Spatial Lens tests, full
  `pnpm.cmd --filter @conitens/dashboard test` with 127 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-prompt50-results.json`,
  `output/playwright/spatial-lens-prompt50-focused-1440.png`,
  `output/playwright/spatial-lens-prompt50-focused-1220.png`,
  `output/playwright/spatial-lens-prompt50-overview-1440.png`,
  `output/playwright/spatial-lens-prompt50-classic-1440.png`, and
  `.omx/state/spatial-lens-prompt50/ralph-progress.json`.
- Visual verdict is `pass`, score 98/100. Further visual improvement should
  move to a generated-room/asset-depth pass rather than more shell compression
  or route-marker overlays.

- Previous active batch: `Spatial Lens Prompt 4.9 visual polish pass`
- Status: `complete`
- The latest "next step" request advanced from Prompt 4.8 into viewport
  dominance for the Spatial Lens operator shell.
- `PixelOffice` now exposes
  `data-office-preview-shell="viewport-dominant"` on the root office frame.
- `office.module.css` uses that hook to compact the summary band, metrics,
  focus line, and 1220px responsive layout so the pixel office starts higher
  in the first viewport.
- At laptop width, the summary band remains two-column and hides the secondary
  summary sentence. Browser evidence reports Focused floor top `y=362`, down
  from Prompt 4.8's `y=430`.
- Prompt 4.8 contracts remain intact: Focused corridor continuity tiles remain
  `source-apron/spine-runner/target-apron`, route guide density remains 1
  source-side tile, Focused keeps compact `Route Minimap`, the handoff packet
  remains parented by `data-handoff-packet-slot`, and the focused route remains
  quiet at opacity `0.42` and height `2px`.
- Spatial Lens pixel grammar tests now lock route guide restraint, packet
  slot, compact route minimap, focused target hooks, compact offscreen
  awareness, focused corridor continuity, and CSS integer scale transforms.
  A new office shell test locks the viewport-dominant layout hook.
- No canonical runtime truth, `.notes`, `.agent`, provider, approval, bridge,
  scheduler, external fetch, asset download, or task mutation surface changed.
- Browser evidence at `http://localhost:3000/#/office-preview` reported
  Focused 1440: `cameraZoom: "3"`, camera stage transform
  `matrix(3, 0, 0, 3, 0, 0)`, focused room `ops-control`, target room
  `validation-office`, route framing `source-corridor-target-edge`, target
  continuity `corridor-connected`, continuity parts
  `source-apron/spine-runner/target-apron`, 3 target route pixels, target
  agent `sentinel`, route minimap `Route Minimap`, 6 route segments, 1
  source-side route guide tile, 1 handoff packet, 1 packet slot, 253 generated
  sprites, 6 character sprites, 0 console/page errors, and 0 horizontal
  overflow. Focused 1440 floor top is now `y=326`.
- Laptop-width Focused kept the same `3x`
  continuity/route-guide/minimap/packet-slot/target-edge/offscreen-tab
  contract with no horizontal overflow. Laptop Focused floor top is `y=362`.
  Floor Overview remains `1x` topology with `1x Floor Overview` and 0
  continuity tiles; Classic mounts no Spatial Lens floor, 0 continuity tiles,
  0 route guide tiles, and 0 generated sprites.
- Verification passed targeted Spatial Lens tests, full
  `pnpm.cmd --filter @conitens/dashboard test` with 126 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-prompt49-results.json`,
  `output/playwright/spatial-lens-prompt49-focused-1440.png`,
  `output/playwright/spatial-lens-prompt49-focused-1440-floor.png`,
  `output/playwright/spatial-lens-prompt49-focused-1220.png`,
  `output/playwright/spatial-lens-prompt49-focused-1220-floor.png`,
  `output/playwright/spatial-lens-prompt49-overview-1440.png`,
  `output/playwright/spatial-lens-prompt49-overview-1440-floor.png`,
  `output/playwright/spatial-lens-prompt49-classic-1440.png`, and
  `.omx/state/spatial-lens-prompt49/ralph-progress.json`.
- Visual verdict is `pass`, score 97/100. Further visual improvement should
  move to generated room art, richer prop/character assets, or fuller authored
  Validation room continuity rather than more shell compression.

- Previous active batch: `Spatial Lens Prompt 4.8 visual polish pass`
- Status: `complete`
- Prompt 4.8 added Focused-only floor continuity tiles for the
  Ops-to-Validation route before Prompt 4.9 made the shell more
  viewport-dominant.

- Previous active batch: `Spatial Lens Prompt 4.7 visual polish pass`
- Status: `complete`
- Prompt 4.7 reduced offscreen awareness to a compact tab and added stable
  browser hooks for target-route and camera verification before Prompt 4.8
  improved floor continuity.

- Previous active batch: `Spatial Lens Prompt 4.6 visual polish pass`
- Status: `complete`
- Prompt 4.6 added the restrained source-side route guide tile and locked the
  packet-slot/minimap/route-guide contract before Prompt 4.7 reduced offscreen
  awareness chrome.

- Previous active batch: `Spatial Lens Prompt 4.5 visual polish pass`
- Status: `complete`
- Prompt 4.5 reduced route dock dominance, renamed the helper to
  `Route Minimap`, and made the handoff packet a single generated sprite
  anchored inside a physical floor slot.

- Previous active batch: `Spatial Lens Prompt 4.4 visual polish pass`
- Status: `complete`
- Prompt 4.4 reduced Ops Control density, added the hard-pixel walk lane, and
  made the Validation receiving threshold more integrated while preserving
  the existing `3x` Focused / `1x` Overview / Classic contract.

- Previous active batch: `Spatial Lens Prompt 4.3 cleanup/review pass`
- Status: `complete`
- The latest "next step" request advanced the now-passing Prompt 4.2 visual
  work into a behavior-preserving cleanup/review pass.
- `FocusedRouteTargetEdge.tsx` now derives target resident visual context once
  and maps a local `["one", "two", "three"]` route-step list into the target
  edge pixels.
- `FloorViewport.tsx` now derives `isFocusedMode`, `isOverviewMode`, and
  `focusedRouteFraming` before JSX, reducing repeated mode conditionals while
  preserving the same DOM data contract.
- No CSS/layout scale values, canonical runtime truth, `.notes`, `.agent`,
  provider, approval, bridge, scheduler, external fetch, asset download, or
  task mutation surface changed.
- Browser evidence at `http://localhost:3000/#/office-preview` reported
  Focused 1440: `cameraZoom: "3"`, focused room `ops-control`, target room
  `validation-office`, route framing `source-corridor-target-edge`, target
  continuity `corridor-connected`, 3 target route pixels, target agent
  `sentinel`, source plaque `Ops Control`, offscreen agent `worker-1`,
  9 corridor nodes, 6 door corridor refs, 1 handoff packet, 1 blocked marker,
  4 agent stations, 268 generated sprites, 6 character sprites, 0 floor
  canvases, 0 console/page errors, and 0 horizontal overflow.
- Laptop-width Focused kept the same route-framing/source-plaque/target-edge
  contract with no horizontal overflow. Floor Overview remains `1x` topology
  with `1x Floor Overview`; Classic mounts no Spatial Lens floor.
- Verification passed targeted Spatial Lens tests before and after cleanup,
  full `pnpm.cmd --filter @conitens/dashboard test` with 118 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-prompt43-results.json`,
  `output/playwright/spatial-lens-prompt43-focused-1440.png`,
  `output/playwright/spatial-lens-prompt43-focused-1440-floor.png`,
  `output/playwright/spatial-lens-prompt43-focused-1220.png`,
  `output/playwright/spatial-lens-prompt43-focused-1220-floor.png`,
  `output/playwright/spatial-lens-prompt43-overview-1440.png`,
  `output/playwright/spatial-lens-prompt43-overview-1440-floor.png`,
  `output/playwright/spatial-lens-prompt43-classic-1440.png`, and
  `.omx/state/spatial-lens-prompt43/ralph-progress.json`.
- Visual verdict remains `pass`, score 90/100. Remaining visual work is a
  separate polish slice if desired: reduce Ops Control density/walk-path
  clutter and make the Validation threshold feel more integrated without
  adding props or changing canonical data.

- Previous active batch: `Spatial Lens Prompt 4.2 target-edge continuity pass`
- Status: `complete`
- The latest "next step" request advanced Prompt 4.1 into target-edge
  continuity and route storytelling.
- Focused remains integer `3x`, Floor Overview remains integer `1x`, and
  Classic remains isolated with no Spatial Lens floor.
- `FocusedRouteTargetEdge.tsx` now reports
  `data-edge-continuity="corridor-connected"` and renders a corridor connector
  plus three route pixels into the Validation threshold.
- `FloorViewport.tsx` now renders a small
  `data-focused-source-plaque="true"` label so the route-side crop still
  identifies `Ops Control`.
- Focused route-line styling is intentionally quieter than Floor Overview:
  browser computed style reports opacity `0.42` and height `2px` in Focused,
  while Overview remains opacity `0.86` and height `4px`.
- Browser evidence at `http://localhost:3000/#/office-preview` reported
  Focused 1440: route framing `source-corridor-target-edge`, target continuity
  `corridor-connected`, route pixels 3, target packet 1, target agent
  `sentinel`, source plaque `Ops Control`, offscreen agent `worker-1`,
  9 corridor nodes, 6 door corridor refs, 1 handoff packet, 1 blocked marker,
  0 floor canvases, 0 console/page errors, and 0 horizontal overflow.
- Laptop-width Focused reports the same route-framing/source-plaque/target-edge
  contract and no horizontal overflow.
- Verification passed targeted Spatial Lens tests, full
  `pnpm.cmd --filter @conitens/dashboard test` with 118 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-prompt42-results.json`,
  `output/playwright/spatial-lens-prompt42-focused-1440.png`,
  `output/playwright/spatial-lens-prompt42-focused-1440-floor.png`,
  `output/playwright/spatial-lens-prompt42-focused-1220.png`,
  `output/playwright/spatial-lens-prompt42-focused-1220-floor.png`,
  `output/playwright/spatial-lens-prompt42-overview-1440.png`,
  `output/playwright/spatial-lens-prompt42-overview-1440-floor.png`,
  `output/playwright/spatial-lens-prompt42-classic-1440.png`, and
  `.omx/state/spatial-lens-prompt42/ralph-progress.json`.
- Visual verdict is `pass`, score 90/100. Remaining visual work is now
  polish/cleanup: keep the current route contract stable, avoid adding props,
  and consider a behavior-preserving cleanup/review pass before any deeper
  room-template simplification.

- Previous active batch: `Spatial Lens Prompt 4.1 route composition pass`
- Status: `complete`
- The latest "next step" request advanced from the visual audit into Focused
  route composition plus Floor Overview stabilization.
- Focused remains integer `3x`, defaults to `ops-control`, and now pulls the
  camera toward the Ops -> Validation handoff route. Default Focused scene
  bounds are `15.833,1.833,33.333,33.333`.
- `FocusedRouteTargetEdge.tsx` now renders a Validation receiving edge inside
  Focused with a room plaque, status light, checklist board, inbox tray,
  packet sprite, and sentinel sprite.
- `FloorViewport` exposes
  `data-focused-route-framing="source-corridor-target-edge"` for the default
  Focused route and `data-overview-role="topology"` for Floor Overview.
- `AgentOffscreenRail` excludes the target room, so sentinel is no longer a
  list-like offscreen card. Default Focused now shows sentinel in the
  receiving edge and `worker-1` in the offscreen rail.
- Floor Overview remains integer `1x`, all-room topology, and is labeled
  `1x Floor Overview` with topology-map treatment. Classic remains available
  and mounts no Spatial Lens floor.
- Browser evidence at `http://localhost:3000/#/office-preview` reported
  Focused 1440: route framing `source-corridor-target-edge`, target edge 1,
  target packet 1, target agent `sentinel`, offscreen agent `worker-1`,
  9 corridor nodes, 6 door corridor refs, 1 handoff packet, 1 blocked marker,
  0 floor canvases, 0 console/page errors, and 0 horizontal overflow.
- Laptop-width Focused reported the same route-framing contract and no
  horizontal overflow.
- Verification passed targeted Spatial Lens tests, full
  `pnpm.cmd --filter @conitens/dashboard test` with 118 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-prompt41-results.json`,
  `output/playwright/spatial-lens-prompt41-focused-1440.png`,
  `output/playwright/spatial-lens-prompt41-focused-1440-floor.png`,
  `output/playwright/spatial-lens-prompt41-focused-1220.png`,
  `output/playwright/spatial-lens-prompt41-focused-1220-floor.png`,
  `output/playwright/spatial-lens-prompt41-overview-1440.png`,
  `output/playwright/spatial-lens-prompt41-overview-1440-floor.png`,
  `output/playwright/spatial-lens-prompt41-classic-1440.png`, and
  `.omx/state/spatial-lens-prompt41/ralph-progress.json`.
- Visual verdict is `revise`, score 87/100. The next visual priority is
  target-edge continuity: make the Validation receiving edge feel less framed
  and more physically connected to the corridor, restore a small in-world Ops
  identity cue in the route-side crop, and reduce route-line dominance.

- Previous active batch: `Spatial Lens current visual audit`
- Status: `complete`
- The latest attached request was scoped to Use Case A, a Visual Reference
  Audit. Production code was intentionally not modified in this step.
- The audit artifact is
  `docs/design/spatial-lens-current-visual-audit.md`.
- Active route evidence came from
  `http://localhost:3000/#/office-preview` and
  `output/playwright/spatial-lens-current-audit-results.json`.
- Focused currently reports `data-viewport-mode="focused"`,
  `data-camera-zoom="3"`, `data-focused-room-id="ops-control"`,
  `data-camera-target-room-id="validation-office"`, 9 corridor nodes, 6 door
  corridor references, 1 handoff packet, 1 blocked marker, 4 agent stations,
  2 offscreen agents, 6 character sprites, 0 floor canvases, no console/page
  errors, and no horizontal overflow.
- Floor Overview reports `data-camera-zoom="1"`, all six rooms, 4 agent
  stations, 1 handoff packet, 1 blocked marker, no console/page errors, and no
  horizontal overflow. Classic reports no Spatial Lens floor and no generated
  sprites.
- Audit conclusion: agents are now partially agent-first and the handoff is
  mixed but leaning in-world. The next implementation priority is composition:
  keep Focused at integer `3x` while bringing the Ops Control source, corridor,
  and Validation receiving edge into the main camera, then stabilize Floor
  Overview as the explicit `1x` topology/debug mode.
- `packages/dashboard/package.json` provides `dev`, `test`, `build`, and
  `preview`; it has no lint script. `build` is the practical typecheck gate
  because it runs `tsc -b && vite build`.

- Previous active batch: `Spatial Lens Prompt 4 agent-first live activity pass`
- Status: `complete`
- The latest attached request asked for AgentSprite/live-activity work rather
  than another layout or prop pass. Scope stayed on read-only Spatial Lens
  VIEWPORT rendering, pure visual mapping, generated character sprites,
  offscreen awareness, and selection plumbing.
- New Prompt 4 files are
  `agentStations.ts`, `agentVisualState.ts`, `AgentLayer.tsx`,
  `AgentSprite.tsx`, `AgentStation.tsx`, `AgentActivityCue.tsx`,
  `AgentSpeechBubble.tsx`, and
  `tests/spatial-lens-agent-visual-state.test.mjs`.
- `PixelOffice -> OfficeStage -> FloorViewport` now passes task snapshots
  read-only so the agent layer can show active, blocked, review, handoff, and
  assigned cues. No canonical runtime, `.notes`, `.agent`, provider, approval,
  bridge, scheduler, or task mutation surface was changed.
- `RoomZone` no longer renders the Spatial Lens `OfficeAvatar` canvas layer.
  The live agents now render in `AgentLayer` using generated sprite ids such
  as `character.architectWorking`, `character.ownerIdle`,
  `character.sentinelReviewing`, and `character.workerIdle`.
- Focused 1440px browser diagnostics against
  `http://localhost:3000/#/office-preview` reported `cameraZoom: "3"`,
  `focusedRoomId: "ops-control"`, `targetRoomId: "validation-office"`, 4
  agent stations, 2 offscreen agents, 1 offscreen rail, 6 generated character
  sprites, 0 Spatial Lens floor canvases, 0 console/page errors, and 0
  horizontal overflow.
- Focused agent states are now explicit: architect `working` + `active`, owner
  `blocked` + `blocked`, sentinel `reviewing` + `handoff_receive`, and
  worker-1 `waiting_for_input` + `assigned`.
- Agent station click selection was verified in a real browser: clicking owner
  changed `data-agent-selected` from architect to owner. Decorative sprite/cue
  spans now use `pointer-events: none` so station buttons are the stable hit
  target.
- Floor Overview remains `1x` and shows all four demo agents; CLASSIC remains
  available with zero Spatial Lens floor nodes and zero generated sprites.
- Verification passed the targeted agent visual-state test, full
  `pnpm.cmd --filter @conitens/dashboard test` with 118 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- Evidence lives at
  `output/playwright/spatial-lens-agent-pass-results.json`,
  `output/playwright/spatial-lens-agent-pass-focused-1440.png`,
  `output/playwright/spatial-lens-agent-pass-focused-1440-floor.png`,
  `output/playwright/spatial-lens-agent-pass-focused-1220.png`,
  `output/playwright/spatial-lens-agent-pass-focused-1220-floor.png`,
  `output/playwright/spatial-lens-agent-pass-overview-1440.png`,
  `output/playwright/spatial-lens-agent-pass-overview-1440-floor.png`,
  `output/playwright/spatial-lens-agent-pass-classic-1440.png`, and
  `.omx/state/spatial-lens-agent-pass/ralph-progress.json`.
- Visual verdict is `revise`, score 84/100. The agent-first acceptance is met,
  but the next visual priority is composition fidelity: keep `3x` scale while
  bringing the Validation receiving edge into the main camera and reducing Ops
  Control prop crowding.

- Active batch: `Spatial Lens Prompt 3.10 focused composition pass`
- Status: `complete`
- The latest attached request asked for a Focused View composition pass before
  Prompt 4 AgentSprite work. Scope stayed on camera, viewport sizing, minimap
  docking, local map chrome, and right-inspector visual weight. No new random
  props were added.
- `viewportCamera.ts` now exposes `CameraSceneBounds`, `FocusedViewportFrame`,
  and `FocusedCamera` contracts. Focused mode keeps integer `3x` zoom, defaults
  to Ops Control, and biases slightly toward a connected handoff target when
  the selected room participates in a route. Current default target is
  `validation-office`; scene bounds are `1,0,40,32`.
- `FloorViewport` now emits `data-camera-target-room-id` and
  `data-camera-scene-bounds`, passes handoff routes into the camera, and uses
  the new `MinimapDock`/`SceneDockOverlay` instead of placing the minimap over
  room props.
- Focused viewport height increased and now uses a camera frame treatment:
  1440px capture measured 1080x750, laptop capture measured 1156x720. The
  large black void below the scene is materially reduced.
- Focused local map chrome now reads `Live camera`; Floor Overview reads
  `Floor overview`. Focused mode hides secondary room-count/status pills and
  keeps the mode toggle compact.
- Right inspector width changed from 292px to 280px with slightly tighter
  rail spacing. The right rail remains functional and visually secondary to
  the scene.
- Browser verification for Prompt 3.10 reported Focused `cameraZoom: "3"`,
  Overview `cameraZoom: "1"`, 9 corridor nodes, 6 door frames, 6 door corridor
  refs, 259 generated sprites, 257 PixelProps, 1 packet, 1 blocked marker,
  dock overlap area 0 for Ops Control and Impl Office at 1440px and laptop
  width, 0 console/page errors, 0 SVG routes, and 0 horizontal overflow.
- Visual verdict improved from 68 to 78 but remains `revise` because live
  agents still render through `OfficeAvatar` canvas rather than generated
  character sprites, and Impl Office remains an adjacent partial crop rather
  than an authored room rail/strip.
- Prompt 3.10 evidence lives at
  `output/playwright/spatial-lens-prompt310-results.json`,
  `output/playwright/spatial-lens-prompt310-focused-1440.png`,
  `output/playwright/spatial-lens-prompt310-focused-1440-floor.png`,
  `output/playwright/spatial-lens-prompt310-focused-1220.png`,
  `output/playwright/spatial-lens-prompt310-focused-1220-floor.png`,
  `output/playwright/spatial-lens-prompt310-overview-1440.png`,
  `output/playwright/spatial-lens-prompt310-overview-1440-floor.png`, and
  `output/playwright/spatial-lens-prompt310-classic-1220.png`.
- Prompt 3.10 visual verdict is recorded at
  `.omx/state/spatial-lens-prompt310/ralph-progress.json`.
- Verification passed `node --experimental-strip-types --test
  packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs
  packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`,
  `pnpm.cmd --filter @conitens/dashboard test` with 112 tests,
  `pnpm.cmd --filter @conitens/dashboard build`, browser checks, and scoped
  `git diff --check`. No dashboard lint script exists.
- Next implementation priority is Prompt 4: Real AgentSprite / Live Activity
  Cues. Keep Floor Overview and CLASSIC available, and do not add more props
  before agents become visible protagonists.

- Active batch: `Spatial Lens runtime visual review`
- Status: `reviewed`
- Actual browser execution at `http://localhost:4317/#/office-preview`
  captured Focused 1440px, Focused laptop width, Floor Overview 1440px, and
  CLASSIC 1220px.
- Runtime metrics stayed healthy: Focused `cameraZoom: "3"`, Overview
  `cameraZoom: "1"`, 0 console errors, 0 page errors, 0 horizontal overflow,
  9 corridor nodes, 6 door frames, 6 door corridor references, 259 generated
  sprites, 257 PixelProps, 1 handoff packet, 1 blocked marker, and 0 SVG
  routes.
- Visual verdict is `revise`, score 68/100, recorded at
  `.omx/state/spatial-lens-runtime-review/ralph-progress.json`.
- Main review findings: Focused currently frames Ops Control plus Impl Office
  rather than Ops Control plus corridor plus Validation Office; generated
  character sprites exist but live residents still render through the existing
  `OfficeAvatar` canvas; Ops Control prop density is high enough to weaken
  walk-path clarity; room stats still read partly like dashboard overlays.
- Next implementation priority: route-aware Focused camera framing, generated
  character sprite rendering for Spatial Lens residents, then room template
  density/walk-path cleanup.
- Runtime review evidence lives at
  `output/playwright/spatial-lens-runtime-review-results.json`,
  `output/playwright/spatial-lens-runtime-review-focused-1440.png`,
  `output/playwright/spatial-lens-runtime-review-focused-1440-floor.png`,
  `output/playwright/spatial-lens-runtime-review-focused-1220.png`,
  `output/playwright/spatial-lens-runtime-review-focused-1220-floor.png`,
  `output/playwright/spatial-lens-runtime-review-overview-1440.png`,
  `output/playwright/spatial-lens-runtime-review-overview-1440-floor.png`,
  and `output/playwright/spatial-lens-runtime-review-classic-1220.png`.

- Active batch: `Spatial Lens building shell cleanup`
- Status: `complete`
- An ai-slop cleanup pass fixed the diagnostic/data-boundary ambiguity between
  corridor nodes and door frames. `DoorFrameLayer` now exposes door references
  with `data-door-corridor-node` instead of reusing `data-corridor-node`.
- Browser diagnostics now report the intended separated counts: 9 actual
  corridor nodes, 6 door frames, 6 door corridor references, and 0 door frames
  carrying `data-corridor-node`.
- `spatial-lens-floor-layout.test.mjs` now locks the authored corridor node
  count at 9 so the rendered DOM diagnostic and layout contract stay aligned.
- Cleanup visual/browser evidence lives at
  `output/playwright/spatial-lens-cleanup-results.json`,
  `output/playwright/spatial-lens-cleanup-focused-1440.png`,
  `output/playwright/spatial-lens-cleanup-focused-1440-floor.png`,
  `output/playwright/spatial-lens-cleanup-focused-1220.png`,
  `output/playwright/spatial-lens-cleanup-focused-1220-floor.png`,
  `output/playwright/spatial-lens-cleanup-overview-1440.png`,
  `output/playwright/spatial-lens-cleanup-overview-1440-floor.png`, and
  `output/playwright/spatial-lens-cleanup-classic-1220.png`.
- Cleanup verification passed `pnpm.cmd --filter @conitens/dashboard test`
  with 111 tests, `pnpm.cmd --filter @conitens/dashboard build`, targeted
  floor layout/geometry tests, browser checks at 1440px and laptop width, and
  scoped diff checks. No dashboard lint script exists; build remains the
  typecheck gate.

- Active batch: `Spatial Lens building shell composition`
- Status: `complete`
- The latest attached request changed the priority from adding sprite/furniture
  detail to fixing spatial composition: shared building shell, connected
  corridor graph, door-aligned room placement, non-floating background,
  readable negative space, in-world handoff route, and physical blocked lane.
- A layout/background-only generated reference now lives at
  `docs/design/assets/spatial-lens/generated/building-floorplate-layout-reference.png`.
- New typed layout files:
  `packages/dashboard/src/spatial-lens/viewport/floorLayout.ts`,
  `packages/dashboard/src/spatial-lens/viewport/corridorGraph.ts`, and
  `packages/dashboard/src/spatial-lens/viewport/roomPlacement.ts`.
- `floorLayout.ts` defines a shared building shell with 6 floorplate zones, 16
  wall segments, 6 structural columns, and facility bounds.
- `corridorGraph.ts` defines a 7% central corridor spine, 6 room connection
  stubs, 1 handoff hub pad, corridor nodes, door-aligned handoff route
  generation, blocked-lane corridor placement, and corridor hit testing.
- `roomPlacement.ts` defines VIEWPORT-only door placements for all six rooms
  without changing canonical room/runtime data.
- New render layers:
  `BuildingShellLayer`, `FloorplateLayer`, `CorridorLayer`, and
  `DoorFrameLayer`.
- `FloorViewport` now renders separated layout layers in order: floorplate,
  building shell, corridor, handoff overlay, room placement, and door frames.
  It also exposes `data-building-shell="connected"`.
- `floorGeometry.ts` now uses `FLOOR_CORRIDOR_SEGMENTS` instead of the old wide
  `OFFICE_STAGE_CORRIDORS`/focal-lane rectangles for VIEWPORT corridor
  rendering.
- Handoff routes now go through Ops door threshold, central corridor hub, and
  Validation door threshold. The route visual was reduced from a blue dashboard
  overlay to a lower-profile in-world floor route channel.
- Blocked lane markers now anchor to corridor tiles via
  `getBlockedLaneCorridorPoint()` instead of room interior task slots.
- VIEWPORT room schema door glyphs are hidden; door frames come from the
  door-alignment layer so doors visually connect to corridor stubs.
- Added `packages/dashboard/tests/spatial-lens-floor-layout.test.mjs` and
  updated `packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`.
- Browser diagnostics for this pass:
  - Focused 1440/1220: `cameraZoom: "3"`, 6 floorplate zones, 16 walls, 6
    columns, 8 corridor lanes, 9 corridor nodes, 6 door frames, 6 door
    corridor references, 259 generated sprites, 257 PixelProps, 0 SVG routes,
    no console/page errors, no horizontal overflow.
  - Floor Overview 1440: `cameraZoom: "1"` and central corridor measured about
    74px wide, satisfying the 48-72px target within border/render rounding.
  - Classic 1220: no Spatial Lens floor layers and 0 generated sprites.
- Latest visual evidence lives at
  `output/playwright/spatial-lens-building-shell-results.json`,
  `output/playwright/spatial-lens-building-shell-focused-1440.png`,
  `output/playwright/spatial-lens-building-shell-focused-1440-floor.png`,
  `output/playwright/spatial-lens-building-shell-focused-1220.png`,
  `output/playwright/spatial-lens-building-shell-focused-1220-floor.png`,
  `output/playwright/spatial-lens-building-shell-overview-1440.png`,
  `output/playwright/spatial-lens-building-shell-overview-1440-floor.png`,
  and `output/playwright/spatial-lens-building-shell-classic-1220.png`.
- Verification for this slice passed
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-floor-layout.test.mjs packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`,
  the existing Spatial Lens targeted tests, `pnpm.cmd --filter
  @conitens/dashboard test` with 111 tests, `pnpm.cmd --filter
  @conitens/dashboard build`, and `git diff --check` for touched Spatial Lens
  files.
- No package lint script exists in `packages/dashboard/package.json`; `build`
  still runs `tsc -b` as the typecheck gate.
- Remaining visual gap: room interiors are still dense/repetitive around wall
  props. The next slice should reduce/clump room dressing and enforce walk-path
  clearance, not add more props.

- Active batch: `Spatial Lens generated sprite fidelity`
- Status: `complete`
- The latest user direction changed the visual workflow from CSS-imagined pixel
  art to generated visual references plus sprite-sheet-backed implementation.
- Generated references were created for the target Spatial Lens UI mockup, Ops
  Control room, Validation Office room, and a pixel office asset sheet.
- Generated reference images now live at
  `docs/design/assets/spatial-lens/generated/spatial-lens-target-mockup.png`,
  `docs/design/assets/spatial-lens/generated/ops-control-room-reference.png`,
  and
  `docs/design/assets/spatial-lens/generated/validation-office-room-reference.png`.
- Generated public assets now live under
  `packages/dashboard/public/assets/spatial-lens/generated/`.
- `pixel-office-asset-sheet-source.png` is the original 1536x1024 generated
  green-screen sheet, `pixel-office-asset-sheet.png` is the chroma-keyed
  transparent source sheet, and `pixel-office-asset-sheet-1x.png` is the active
  384x256 nearest-neighbor frontend sheet downsampled 4:1.
- `docs/design/spatial-lens-pixel-office-reference.md` documents image paths,
  intended usage, art-direction notes, forbidden treatments, and the generated
  project-owned asset license note.
- `packages/dashboard/src/spatial-lens/assets/generatedAssetManifest.ts` now
  defines manual sprite rects, anchors, local sheet path, source/downsample
  dimensions, integer `scale` values, and PixelProp mappings.
- `packages/dashboard/src/spatial-lens/assets/GeneratedSprite.tsx` renders
  manifest-backed sprite-sheet crops with `image-rendering: pixelated`.
- `PixelProp` now prefers generated sprites when a manifest entry exists and
  falls back to existing CSS pixel placeholders when missing.
- `HandoffOverlay` now renders handoff packet and blocked barrier markers from
  the generated sheet instead of CSS-only shapes.
- `packages/dashboard/tests/spatial-lens-generated-assets.test.mjs` verifies
  generated sheet existence, required sprite ids, rect bounds, integer scale,
  and critical PixelProp mappings.
- Focused 1440px and 1220px browser diagnostics reported `cameraZoom: "3"`,
  259 generated sprite nodes, 257 PixelProps, 0 SVG routes, generated sprite
  backgrounds for packet/barrier/console/status board, no console/page errors,
  no horizontal overflow, and no checked text overflow.
- Floor Overview browser diagnostics reported `cameraZoom: "1"` and generated
  sprite rendering while remaining the topology/debug mode. Classic diagnostics
  reported no Spatial Lens floor and 0 generated sprites.
- Latest visual evidence lives at
  `output/playwright/spatial-lens-generated-assets-results.json`,
  `output/playwright/spatial-lens-generated-assets-focused-1440.png`,
  `output/playwright/spatial-lens-generated-assets-focused-1440-floor.png`,
  `output/playwright/spatial-lens-generated-assets-focused-1220.png`,
  `output/playwright/spatial-lens-generated-assets-focused-1220-floor.png`,
  `output/playwright/spatial-lens-generated-assets-overview-1440.png`,
  `output/playwright/spatial-lens-generated-assets-overview-1440-floor.png`,
  and `output/playwright/spatial-lens-generated-assets-classic-1220.png`.
- Verification for this slice passed
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-generated-assets.test.mjs`,
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs packages/dashboard/tests/spatial-lens-room-dressing.test.mjs packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`,
  `pnpm.cmd --filter @conitens/dashboard test` with 107 tests, and
  `pnpm.cmd --filter @conitens/dashboard build`.
- No package lint script exists in `packages/dashboard/package.json`; the build
  command ran `tsc -b` as the typecheck gate.
- Remaining visual gap: the generated sheet improved sprite fidelity, but the
  current room templates are denser than the references. The existing topology
  plus Focused `3x` camera cannot fully frame Ops Control and Validation Office
  simultaneously without a route-aware camera or authored layout tradeoff.
- Next safe visual slice: tune room template density against the generated room
  references, then decide whether to add route-aware camera framing or generated
  character sprite placement.

- Active batch: `Spatial Lens camera and scale pass`
- Status: `complete`
- Prompt 3.9 from the user feedback is now complete. The remaining issue after
  Prompt 3.8 was that VIEWPORT still felt like a whole-building overview rather
  than a Pixel Agents-style live office camera.
- `OfficeStage` now exposes three modes: `Focused`, `Floor Overview`, and
  `Classic`. Legacy stored `viewport` mode now loads as `Focused`.
- `Focused` is the default VIEWPORT experience. `Floor Overview` remains the
  topology/debug surface and `Classic` remains the legacy branch.
- `FloorViewport` now accepts `viewMode="focused" | "overview"` and emits
  `data-viewport-mode`, `data-viewport-camera`, and `data-camera-zoom`.
- `viewportCamera.ts` now exports `FLOOR_VIEWPORT_CAMERA_ZOOMS` with integer
  zoom values only: Focused `3x`, Overview `1x`.
- Focused mode now uses actual `transform: scale(3)` on the floor camera. This
  enlarges rooms, furniture, handoff conduits, and temporary agent placeholders
  together; it no longer only enlarges the layout coordinate box.
- Focused mode starts on Ops Control and shows Ops Control plus nearby corridor
  and adjacent Impl Office at desktop and laptop widths. It does not try to
  keep all six rooms visible in the main camera.
- Floor Overview uses `scale(1)`, shows all six rooms, hides the minimap, and
  renders a visible `Floor Overview` plaque.
- Focused keeps the compact minimap for whole-floor awareness.
- Focused room plaques/status lights were reduced at base CSS size so 3x zoom
  leaves them as small in-world labels/lights instead of oversized dashboard
  overlays.
- Final browser evidence lives at
  `output/playwright/spatial-lens-camera-results.json`,
  `output/playwright/spatial-lens-camera-focused-1440.png`,
  `output/playwright/spatial-lens-camera-focused-1440-floor.png`,
  `output/playwright/spatial-lens-camera-focused-1220.png`,
  `output/playwright/spatial-lens-camera-focused-1220-floor.png`,
  `output/playwright/spatial-lens-camera-overview-1440.png`,
  `output/playwright/spatial-lens-camera-overview-1440-floor.png`, and
  `output/playwright/spatial-lens-camera-classic-1220.png`.
- Focused 1440px diagnostics reported `cameraZoom: "3"`,
  `cameraTransform: matrix(3, 0, 0, 3, 0, 0)`,
  `focusedRoomId: ops-control`, visible rooms `ops-control` and `impl-office`,
  desk bounds `204x102`, agent placeholder bounds `162x186`, 257 PixelProps, 0
  SVG routes, 4 route segments, no console/page errors, and no horizontal
  overflow.
- Focused 1220px diagnostics reported the same `3x` camera contract and visible
  rooms `ops-control` plus `impl-office`.
- Floor Overview diagnostics reported `cameraZoom: "1"`, all six rooms
  visible, no minimap, and an overview plaque. Classic diagnostics reported no
  Spatial Lens floor and 0 new PixelProps.
- Verification for Prompt 3.9 passed
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`,
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`,
  `pnpm.cmd --filter @conitens/dashboard test` with 104 tests,
  `pnpm.cmd --filter @conitens/dashboard build`, scoped pseudo-3D regression
  scans, touched-file trailing whitespace checks, and Playwright captures.
- Visual verdict for this pass is recorded at
  `.omx/state/spatial-lens-camera/ralph-progress.json`.
- The next safe visual slice remains authored sprite fidelity and later
  AgentSprite/TaskObject lifecycle work.
- Prompt 3.8 from the attached art-direction reset is now complete. The issue
  after Prompt 3.7 was not missing detail; it was that VIEWPORT still read as a
  top-down map with mixed pseudo-3D CSS treatment, heavy dashboard overlays,
  SVG-like routes, and no single sprite/projection grammar.
- VIEWPORT now follows a 2D orthographic RPG/cutaway-office projection contract
  documented in `docs/design/spatial-lens-pixel-art-direction.md`.
- New files:
  `packages/dashboard/src/spatial-lens/viewport/pixelSpriteGrammar.ts`,
  `packages/dashboard/src/spatial-lens/viewport/viewportCamera.ts`,
  `packages/dashboard/src/spatial-lens/components/FloorMiniMap.tsx`,
  `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`, and
  `.omx/state/spatial-lens-art-direction/ralph-progress.json`.
- Updated files:
  `packages/dashboard/src/spatial-lens/components/FloorViewport.tsx`,
  `packages/dashboard/src/spatial-lens/components/HandoffOverlay.tsx`,
  `packages/dashboard/src/spatial-lens/components/RoomZone.tsx`,
  `packages/dashboard/src/spatial-lens/viewport/PixelProp.tsx`,
  `packages/dashboard/src/spatial-lens/viewport/roomDressing.ts`,
  `packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css`,
  `packages/dashboard/src/spatial-lens/index.ts`, and the
  `.conitens/context/*` handoff files.
- `pixelSpriteGrammar.ts` is the canonical local VIEWPORT sprite contract for
  this slice: 16px tiles, integer `SPRITE_SCALE = 2`, 1px hard shadow, 2px
  outline, bottom-center prop anchors, semantic palette tokens, 24-column tile
  snapping, and deterministic y/layer sorting.
- `viewportCamera.ts` makes VIEWPORT focused-camera by default, focusing Ops
  Control unless a selected room is available. Camera offsets are clamped so
  the enlarged floorplate does not create blank off-floor space.
- `FloorMiniMap` provides the whole-floor overview while the main VIEWPORT
  shows fewer rooms at a larger, readable scale.
- `PixelProp` now snaps x/y values to the tile field and all room dressing
  outputs are y-sorted before rendering. Temporary agent placeholders use the
  same z-index grammar.
- Dressed VIEWPORT rooms suppress legacy fixture rendering; CLASSIC remains a
  separate branch and still renders zero new Spatial Lens PixelProps.
- `HandoffOverlay` now renders pixel-aligned floor conduit spans, beacons, a
  packet marker, and in-world blocked markers instead of SVG dashed route
  lines.
- Spatial Lens CSS now removes `filter`, `drop-shadow`, `perspective`, `skew`,
  `rotate`, `stroke-dasharray`, old route SVG classes, and radial glow patterns
  from the feature surface.
- Browser diagnostics at 1440px, 1220px, and 820px reported zero console/page
  errors, zero horizontal overflow, `data-viewport-camera="focused"`,
  `focusedRoomId="ops-control"`, 257 PixelProps, 0 legacy fixtures inside
  dressed rooms, 6 minimap rooms, 0 SVG routes, 4 route conduit segments, 1
  handoff packet, 1 blocked marker, and 0 computed filter uses. CLASSIC
  fallback rendered no Spatial Lens floor and 0 new PixelProps.
- Visual evidence lives at
  `output/playwright/spatial-lens-art-direction-results.json`,
  `output/playwright/spatial-lens-art-direction-1440.png`,
  `output/playwright/spatial-lens-art-direction-1220.png`,
  `output/playwright/spatial-lens-art-direction-820.png`,
  `output/playwright/spatial-lens-art-direction-hidden-labels-1440.png`, and
  `output/playwright/spatial-lens-art-direction-classic-1220.png`.
- Verification for Prompt 3.8 passed
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs`,
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-room-dressing.test.mjs`,
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`,
  `pnpm.cmd --filter @conitens/dashboard test` with 103 tests,
  `pnpm.cmd --filter @conitens/dashboard build`, scoped pseudo-3D pattern
  scans, and touched-file trailing whitespace checks.
- The next safe implementation slice is authored sprite fidelity: promote
  recurring CSS placeholder furniture into a small local sprite sheet, then
  proceed to AgentSprite/TaskObject lifecycle only after this projection
  grammar stays stable.
- Prompt 3.7 from the attached review is now complete. The remaining issue
  after Prompt 3.5 was not routing or frame separation; it was that VIEWPORT
  room interiors still read as sparse rectangles with a few old fixtures and
  labels instead of semantically dressed pixel-office rooms.
- VIEWPORT now has a deterministic room dressing system under
  `packages/dashboard/src/spatial-lens/viewport/`.
- New files:
  `packages/dashboard/src/spatial-lens/viewport/roomTemplates.ts`,
  `packages/dashboard/src/spatial-lens/viewport/roomDressing.ts`,
  `packages/dashboard/src/spatial-lens/viewport/PixelProp.tsx`,
  `packages/dashboard/src/spatial-lens/viewport/RoomDressingLayer.tsx`,
  `packages/dashboard/src/spatial-lens/viewport/WallDetailLayer.tsx`,
  `packages/dashboard/src/spatial-lens/viewport/WorkstationLayer.tsx`,
  `packages/dashboard/src/spatial-lens/viewport/OperationalOverlayLayer.tsx`,
  and `packages/dashboard/tests/spatial-lens-room-dressing.test.mjs`.
- Updated files:
  `packages/dashboard/src/spatial-lens/components/RoomZone.tsx`,
  `packages/dashboard/src/spatial-lens/model/floorGeometry.ts`,
  `packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css`,
  `packages/dashboard/src/spatial-lens/index.ts`, and
  `packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`.
- `roomTemplates.ts` defines room-specific themes, wall/floor styles, doors,
  workstations, wall props, floor props, task slots, agent slots, blocked-lane
  slots, and handoff ports for Ops Control, Impl Office, Research Lab,
  Validation Office, Review Office, and Central Commons.
- `roomDressing.ts` expands those templates into wall/workstation/floor/
  operational PixelProps and exposes count plus route/blocker helpers.
- `RoomZone` now renders `WallDetailLayer`, `WorkstationLayer`,
  `RoomDressingLayer`, and `OperationalOverlayLayer` inside VIEWPORT room
  floors only.
- `floorGeometry.ts` now anchors handoff route endpoints to template
  `routePort` objects and blocked markers to template barrier/cone slots when
  available.
- CSS pixel prop placeholders now cover 26 required prop kinds: desk, chair,
  monitor, keyboard, laptop, serverRack, fileBox, documentStack, clipboard,
  stampPad, whiteboard, statusBoard, alertLight, plant, shelf, coffeeCup,
  cable, inboxTray, outboxTray, barrier, cone, routePort, sampleRack, machine,
  stickyNote, and bulletinBoard.
- Verified prop counts are: Ops Control 44, Impl Office 45, Research Lab 32,
  Validation Office 48, Review Office 34, Central Commons 54, for 257 total
  VIEWPORT PixelProps.
- Every room has at least 3 wall details and at least 2 workstation/task
  details; Validation Office includes a visible receiving handoff port.
- Verification for Prompt 3.7 passed
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-room-dressing.test.mjs`,
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`,
  `pnpm.cmd --filter @conitens/dashboard test` with 99 tests,
  `pnpm.cmd --filter @conitens/dashboard build`, and touched-file trailing
  whitespace checks.
- Browser diagnostics at 1440px, 1220px, and 820px reported zero console/page
  errors, zero horizontal overflow, zero non-empty text overflow, 6 rooms, 257
  PixelProps, 26 prop kinds, 1 handoff route, 1 handoff packet, 1 blocked
  marker, 16 route ports, 4 barriers, and 4 cones. CLASSIC fallback rendered
  zero new PixelProps.
- Visual evidence lives at
  `output/playwright/spatial-lens-viewport-37-results.json`,
  `output/playwright/spatial-lens-viewport-37-1440.png`,
  `output/playwright/spatial-lens-viewport-37-1220.png`,
  `output/playwright/spatial-lens-viewport-37-820.png`,
  `output/playwright/spatial-lens-viewport-37-hidden-labels-1440.png`, and
  `output/playwright/spatial-lens-viewport-37-classic-1220.png`.
- The next safe implementation slice is Prompt 3.8 wall, door, corridor, and
  route-port polish. Full AgentSprite, TaskObject, HandoffLane, InspectorPanel,
  and HUD reduction remain later work.
- Prompt 3.5 from the attached review is now complete. The prior Prompt 3
  looked too similar because `RoomZone` still carried old room-card visual
  hierarchy: heavy independent frames, beige header bands, inset room-floor
  boxes, and large shadows.
- VIEWPORT remains the default Spatial Lens mode and CLASSIC remains available
  through `window.sessionStorage["conitens.officeStageMode"]`.
- VIEWPORT and CLASSIC are separate rendering branches: CLASSIC preserves the
  legacy `OfficeRoomScene`/`office-room-tile` map, while VIEWPORT renders
  through `FloorViewport`, `RoomZone`, `FloorGrid`, `CorridorLane`, and the new
  `HandoffOverlay`.
- New file:
  `packages/dashboard/src/spatial-lens/components/HandoffOverlay.tsx`.
- Updated files:
  `packages/dashboard/src/components/PixelOffice.tsx`,
  `packages/dashboard/src/components/OfficeStage.tsx`,
  `packages/dashboard/src/spatial-lens/components/FloorViewport.tsx`,
  `packages/dashboard/src/spatial-lens/components/RoomZone.tsx`,
  `packages/dashboard/src/spatial-lens/model/floorGeometry.ts`,
  `packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css`,
  `packages/dashboard/src/spatial-lens/index.ts`, and
  `packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`.
- `createFloorViewportModel()` now emits visible `handoffRoutes` and
  `blockedLaneMarkers`; when live handoff data is absent it falls back to an
  Ops Control -> Validation Office route.
- `HandoffOverlay` renders a route line, packet marker, and blocked-lane
  barrier on the floor in VIEWPORT mode.
- VIEWPORT room zones now use thinner wall treatment, floor-level overlays,
  in-world dark nameplates, and small status flags instead of old room-card
  headers and heavy shadows.
- Verification for Prompt 3.5 passed
  `node --experimental-strip-types --test packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`,
  `pnpm.cmd --filter @conitens/dashboard test` with 95 tests,
  `pnpm.cmd --filter @conitens/dashboard build`, a scoped `git diff --check`,
  and real browser captures at 1440px, 1220px, and 820px.
- Browser diagnostics reported zero console/page errors, zero horizontal
  overflow, zero checked text overflow, 6 rooms, 4 corridor/focal lanes, 74
  fixtures, 4 agent buttons, 1 handoff route, 1 handoff packet, and 1 blocked
  lane marker. The VIEWPORT/CLASSIC toggle worked both ways.
- Visual evidence lives at
  `output/playwright/spatial-lens-viewport-35-results.json`,
  `output/playwright/spatial-lens-viewport-35-1440.png`,
  `output/playwright/spatial-lens-viewport-35-1220.png`, and
  `output/playwright/spatial-lens-viewport-35-820.png`.
- Prompt 3.5 remains complete as the previous separation slice.
- Prompt 3 is also complete: a static `FloorViewport` path exists under
  `packages/dashboard/src/spatial-lens/` and is mounted into the office-preview
  route through `OfficeStage`.
- Prompt 2 is also complete: `SPATIAL_LENS_ASSET_MANIFEST` covers floor, wall,
  furniture, and character assets with local assets or CSS placeholders, and
  `SPATIAL_LENS_MANUAL_IMPORT_ROOT` documents
  `packages/dashboard/public/spatial-lens`.
- Prompt 1 is also complete: `normalizePixelStatusTone()`,
  `PixelThemeProvider`, `PixelFrame`, `PixelPanel`, `PixelButton`,
  `StatusPill`, `PixelDivider`, and `PixelTooltip` are importable from
  `packages/dashboard/src/spatial-lens/index.ts` without current route changes.
- `docs/design/spatial-lens-pixel-office-plan.md` now exists as the audit-only
  Prompt 0 plan for moving Spatial Lens toward an agent-first pixel office
  control shell.
- The plan references actual Conitens paths, documents current Spatial Lens
  architecture, hotspots, proposed feature-folder component boundaries, typed
  model contracts, migration order, validation commands, and risks.
- This planning slice made no production UI, backend, protocol, approval,
  bridge, runtime, scheduler, PR/CI, or asset-copy changes.
- Avoid expanding `packages/dashboard/src/App.tsx`,
  `packages/command-center/src/components/HUD.tsx`,
  `packages/command-center/src/store/spatial-store.ts`,
  `packages/command-center/src/store/agent-store.ts`, and
  `packages/command-center/src/store/task-store.ts` for the pixel-office
  redesign.
- Pixel Office now has a reference-quality visual pass inspired by the
  `pixel-agents-hq/pixel-agents` office-map quality bar, without copying
  external assets or adding dependencies.
- `OfficeStage` now renders schema-driven corridors, focal lanes, and corridor
  fixtures behind rooms; `OfficeRoomScene` now positions rooms from schema
  `x/y/w/h`; `OfficeAvatar` displays existing sprites at a larger pixel-art
  size.
- `office-stage.module.css` now treats the stage as a dark tiled floorplate
  with room-wall bevels, pixel drop shadows, larger fixtures/task markers,
  larger avatar rings, and more readable room labels/stats.
- Verification for the Pixel Office visual slice passed
  `pnpm.cmd --filter @conitens/dashboard test`,
  `pnpm.cmd --filter @conitens/dashboard build`, and real browser captures at
  1440px, 1220px, and 820px. The Playwright diagnostics reported zero
  console/page errors, zero horizontal overflow, zero checked text overflow, 6
  rooms, 74 fixtures, 4 avatars, 2 corridors, and 2 focal lanes.
- Pixel Office visual evidence lives at
  `output/playwright/pixel-agents-quality-results.json`,
  `output/playwright/pixel-agents-quality-office-1440.png`,
  `output/playwright/pixel-agents-quality-office-1220.png`, and
  `output/playwright/pixel-agents-quality-office-820.png`.
- An external agent-systems comparison pass is now complete too, covering
  Agentland, Maestro, Optio, Agent Squad, AutoGen, Claw3D, Pixel Agents, and
  CLI-JAW against current Conitens.
- The comparison artifact now exists at
  `docs/AGENT_SYSTEMS_COMPARISON_2026-06-06.md`, with a repo-scoped mirror at
  `.conitens/reviews/agent_systems_comparison_2026-06-06.md`.
- A static HTML version of the same comparison now exists at
  `docs/AGENT_SYSTEMS_COMPARISON_2026-06-06.html`; it summarizes the executive
  findings, pinned snapshots, feature gap matrix, P0/P1/P2 backlog, guardrails,
  and source links in a browser-readable format.
- The comparison keeps Conitens' current identity unchanged: external runtimes
  own reasoning/generation, while Conitens remains the event-first,
  approval-gated operations/control plane.
- The highest-priority recommendations are provider-call telemetry projections,
  an operator task reconciler, and install/runtime doctor evidence.
- The first P0 implementation slice from that comparison is now complete:
  read-only provider evidence, doctor evidence, and task reconcile preview
  projections are available through the forward bridge and dashboard.
- New read-only forward bridge routes are
  `/api/operator/evidence-summary`, `/api/operator/doctor-evidence`, and
  `/api/operator/tasks/:id/reconcile-preview`.
- Dashboard overview now surfaces evidence-health and doctor-evidence posture,
  and task detail now surfaces a separate read-only reconcile preview panel.
- The P0 slice preserves Conitens' approval boundary: reconcile preview does
  not mutate tasks or approvals, doctor evidence does not expose bearer tokens,
  and provider evidence does not expose raw prompt/completion content.
- Protocol event aliases now map legacy approval, validator, room/tool,
  handoff, and insight fixtures to canonical event types used by the forward
  evidence tests.
- The install/runtime doctor recommendation now has a user-facing CLI flow:
  `python scripts/ensemble.py --workspace . forward doctor-evidence --format json`.
- `forward doctor-evidence --write-artifact` explicitly writes redacted JSON
  and Markdown support artifacts under `.omx/artifacts/forward-doctor-evidence/`
  and records provenance in `.notes/artifacts/manifest.jsonl`.
- Doctor evidence output is path-sanitized: workspace paths are relative,
  external executable paths are reduced to basenames or `PATH:<tool>`, secret-like
  version probe output is redacted, and provider auth commands/environment dumps
  are not executed.
- Artifact writing has a symlink escape guard so the configured evidence
  directory cannot resolve outside the workspace.
- A post-resume verification stabilization pass is now complete too:
  runtime CLI probe resolution is Windows/PATHEXT-aware, the secret/path
  redaction regression uses platform-appropriate fake Node commands, and
  `/api/operator/summary` embeds a lightweight runtime roster without running
  external version probes.
- The standalone `/api/operator/runtime-roster` route still performs detailed
  bounded command/version probes; the summary route now preserves availability
  and checkpoint posture without taking on that latency.
- Verification after the stabilization pass passed through Python forward
  bridge/runtime/approval tests plus dashboard package tests and build, after
  restoring workspace dependencies with the frozen pnpm lockfile.
- The agent-systems P0 completion slice is now complete too:
  `docs/AGENT_SYSTEMS_COMPARISON_2026-06-06.html` has been regenerated as a
  readable UTF-8 Korean static report, preserving the Markdown comparison's
  baseline, findings, backlog, guardrails, and source snapshots without
  changing product runtime behavior.
- Provider-call telemetry now has a canonical event contract:
  `provider.call_recorded` is in `packages/protocol/src/event.ts` and the
  generated `scripts/ensemble_allowed_events.py` registry.
- `scripts/ensemble_events.py` now rejects raw-content fields on
  `provider.call_recorded` payloads before append-only event writes, preserving
  the no raw prompt/completion/request/response boundary.
- `build_operator_evidence_summary_payload()` now reads both
  `provider.call_recorded` event rows and legacy `loop_cost_metrics_json`
  checkpoint rows; event-log rows are preferred when present and checkpoint
  rows remain fallback provenance.
- Operator task reconciliation is now split into
  `scripts/ensemble_operator_reconciler.py`, a pure read-only decision module
  that returns a deterministic `decision_id` plus recommendation, confidence,
  blockers, suggested actions, approval requirement, and evidence refs.
- `/api/operator/tasks/:id/reconcile-preview` remains read-only and now acts as
  a bridge adapter around the pure reconciler; dashboard parser/type/view-model
  contracts carry the returned `decision_id`.
- Verification for the P0 completion slice passed through Python forward
  bridge/runtime/approval/reconciler tests, dashboard package tests and build,
  protocol event sync, and static HTML UTF-8/mojibake checks.
- The first P1 PR/CI evidence slice is now complete too:
  `pr.evidence_observed` and `ci.evidence_observed` are canonical protocol
  event types and are synced into the generated Python allowed-event registry.
- PR/CI evidence append now rejects raw logs, diffs, patches, PR bodies,
  comments, reviews, tokens, secrets, and similar raw external content before
  writing append-only events.
- Operator task detail now includes a read-only `pr_ci_evidence` projection
  derived from local events only. It matches evidence by `task_id` or the task's
  linked `run_id`, strips URL credentials/query strings/fragments, and reports
  posture, counts, suggestions, and privacy metadata.
- Dashboard task detail now renders that PR/CI posture beside the task dossier
  without adding merge, resume, provider-auth, or task-status mutation controls.
- Verification for the P1 PR/CI slice passed through the focused PR/CI bridge
  regression, Python forward bridge/runtime/approval/reconciler tests,
  dashboard package tests, dashboard build, and protocol event sync.
- The first PR/CI evidence producer slice is now complete too:
  `ensemble forward append-pr-ci-evidence --input <json>` accepts reviewed local
  JSON and appends bounded `pr.evidence_observed` / `ci.evidence_observed`
  events for an existing canonical operator task.
- The producer performs no GitHub/CI API fetch and no provider auth command. It
  validates all input items before append, rejects unknown/raw external-content
  fields, strips URL credentials/query strings/fragments, requires a real
  `task_id`, and blocks mismatched `run_id` when the task is already linked to
  another run.
- Producer output is bounded to event ids, task/run refs, counts, statuses, and
  privacy booleans, and the existing task-detail PR/CI projection immediately
  displays the produced events.
- Verification for the producer slice passed through focused append/rejection
  CLI tests, Python forward runtime/bridge/approval/reconciler tests, and
  compileall over the touched Python files.
- The local PR/CI export importer slice is now complete too:
  `ensemble forward import-pr-ci-evidence --input <json> --task-id <id>`
  converts local GitHub PR / GitHub Actions export JSON into the reviewed
  `items` shape consumed by `append-pr-ci-evidence`.
- The importer is read-only and performs no event append, task mutation,
  external API fetch, provider auth command, or environment inspection. It
  validates the canonical task id, checks supplied `--run-id` against the
  task's linked run, inherits the linked run when omitted, and validates the
  generated items through the producer normalization path before output.
- Import output strips URL credentials/query strings/fragments and omits raw
  source-export fields such as PR bodies, logs, comments, diffs, patches,
  output, and text.
- Verification for the importer slice passed through focused import/no-write
  and mismatched-run tests, Python forward runtime/bridge/approval/reconciler
  tests, and compileall over touched Python files.
- PR/CI operator examples/docs are now complete too:
  `docs/frontend/PR_CI_EVIDENCE_WORKFLOW.md` documents the local
  import-review-append flow, and `docs/frontend/FORWARD_OPERATOR_USAGE.md` links
  to it with the compact two-command sequence.
- The PR/CI workflow doc keeps the boundary explicit: import is read-only,
  append is the explicit event-log write, and live fetch, provider auth,
  environment dump, raw logs/diffs/comments/tokens, auto-merge, unattended
  resume, task mutation, and dashboard changes remain excluded.
- Verification for the docs slice passed through static command/safety checks
  and focused forward import/append runtime tests.
- A follow-up code/security review patch is complete for the PR/CI evidence
  lane. Importer review output now redacts token-like strings inside retained
  metadata values, append summaries use the redacted event payload, and the
  importer top-level `run_id` reports the effective inherited linked run id.
- The shared `sk-...` redaction regex no longer matches the `sk-` substring
  inside `otask-...` identifiers, preserving task ids while still redacting real
  secret-like values.
- Regression coverage now includes metadata value redaction, identifier
  preservation, inherited `run_id` reporting, no import writes, and
  import-to-append compatibility.
- A runtime roster CLI slice is now complete too:
  `python scripts/ensemble.py --workspace . forward runtime-roster --format json`
  exposes the existing operator runtime roster without starting the bridge.
- `forward runtime-roster --no-version-probe` gives a fast read-only roster
  check using command availability and checkpoint-observation metadata only.
  The command writes no events/artifacts, does not dump the environment, and
  does not run provider auth commands.
- The multi-CLI runtime roster UX slice is now complete too:
  `forward runtime-roster` supports `--runtime`, `--category`, and
  `--agent-runtimes-only`, while `/api/operator/runtime-roster` accepts matching
  `runtime`, `category`, and `probe_versions` query filters.
- Runtime roster output now includes `scope`, `ux_summary`, and
  `operator_hints` so operators can distinguish observed,
  available-unobserved, and missing CLI runtimes without launch controls,
  provider auth commands, environment dumps, or writes.
- A metadata-only turn records projection is now complete:
  `GET /api/operator/turn-records` and `ensemble forward turn-records` expose
  persisted room message/tool-event turn metadata with optional run, room, and
  limit filters.
- Turn records expose sender/tool metadata, scope, content length, metadata
  keys, payload keys, and evidence refs only. Message content, tool payload
  values, metadata values, and raw transcripts remain omitted.
- A read-only workflow contracts projection is now complete too:
  `GET /api/operator/workflow-contracts` and
  `ensemble forward workflow-contracts` expose `.agent/workflows/*.md`
  contract inventory with optional workflow filtering.
- Workflow contracts expose slug/name/path, input names, step ids/kinds,
  approval posture, parallel posture, event-emission posture, and validation
  errors/warnings only. They do not execute commands, create workflow runs,
  bypass approvals, or expose rendered command/payload values.
- Current repo workflow contract smoke found 6 contracts and all validate as
  ready.
- A read-only status-confidence diagnostics projection is now complete too:
  `GET /api/operator/status-confidence` and
  `ensemble forward status-confidence` explain task/run/room status confidence
  from local SQLite evidence with optional task, run, room, and limit filters.
- Status-confidence diagnostics expose subject ids, current status, confidence
  level, reason codes, attention flags, linked refs, signal counts, and evidence
  refs only. They do not mutate task/run/room status, launch resync, call
  external systems, or expose message content, approval payload values,
  validator issue details, tool payload values, or raw transcripts.
- A read-only wake-readiness projection is now complete too:
  `GET /api/operator/wake-readiness` and `ensemble forward wake-readiness`
  combine status-confidence diagnostics, metadata-only turn records, and
  agent-runtime roster hints with optional task, run, room, and limit filters.
- Wake-readiness candidates expose readiness, confidence, blockers, suggested
  actions, approval requirement, linked refs, turn metadata counts, preferred
  agent runtime, signal counts, and bounded evidence refs only.
- Wake-readiness explicitly does not start a scheduler, send wake messages,
  mutate task/run/room status, execute provider auth commands, fetch external
  systems, append events, write artifacts, or expose raw transcript, tool
  payload, approval payload, or validator details.
- The read-only dashboard consumption slice for wake-readiness is now complete:
  the overview calls `/api/operator/wake-readiness?limit=12` on live bridge
  connections and renders readiness metrics, source projection counts,
  candidate evidence links, privacy detail, and read-only contract posture.
- Dashboard wake-readiness support lives in
  `packages/dashboard/src/forward-bridge-types.ts`,
  `packages/dashboard/src/forward-bridge-parsers.ts`,
  `packages/dashboard/src/forward-bridge-client.ts`,
  `packages/dashboard/src/operator-wake-readiness-model.ts`, and
  `packages/dashboard/src/components/OperatorWakeReadinessPanel.tsx`.
- The dashboard slice preserves the same boundary: no scheduler, wake message,
  task/run/room mutation, event append, provider-auth command, external fetch,
  raw transcript/tool/approval/validator payload exposure, or new mutation
  control.
- Browser evidence for the wake-readiness overview exists at
  `output/playwright/wake-readiness-overview-1220.png`
  (`SHA256 ABBF537527917122870248AFA1F4880F842721BE1592A29C729D59FB6FC65193`).
- Remaining secondary recommendation is live wake scheduling, but it remains
  deferred behind a future approval/verification/mutation-gate design slice; a
  smaller read-only task/run/room-scoped dashboard filtering polish would also
  be safe.
- The wake scheduler design gate slice is now complete:
  `docs/frontend/WAKE_SCHEDULER_DESIGN.md` defines the required approval,
  verification, mutation, audit, privacy, UI, failure-mode, and implementation
  ordering contract before any live wake scheduling.
- The design gate keeps live scheduling unimplemented. It adds no wake message
  delivery, unattended resume, task/run/room mutation, provider auth command,
  external fetch, event append, artifact write, `.notes` write, protocol
  registry change, or dashboard execution control.
- Future wake actions must be approval-by-id, re-verify fresh local evidence
  immediately before execution, append bounded events before any derived state
  mutation, and reject raw prompt/completion/transcript/log/body/secret content.
- The next code slice is narrowed to a pure read-only
  `ensemble forward wake-plan --dry-run` planner, optionally mirrored by
  `GET /api/operator/wake-plan`, with deterministic plan rows and no writes.
- A live dashboard GUI verification slice is now complete too:
  `pnpm.cmd --filter @conitens/dashboard build` passed, a local forward bridge
  and dashboard preview were run, the overview connected to the live bridge
  token, and Playwright captured desktop/tablet/mobile overview plus
  office-preview screenshots under `output/playwright/`.
- GUI diagnostics found no console errors, page errors, horizontal overflow, or
  checked control text overflow on overview desktop/tablet/mobile. Office
  preview had no horizontal overflow or page errors; a tiny avatar-slot
  text-overflow diagnostic was visually non-blocking.
- Current GUI polish candidates are non-blocking: collapse or tuck away the
  live bridge setup form after successful connection, and raise contrast for
  low-priority office-preview rail metadata.
- The dashboard GUI polish slice is now complete:
  live bridge setup collapses after a successful token submit, the header keeps
  an explicit `Bridge settings` toggle, Pixel Office rail metadata contrast is
  stronger, and the pixel avatar slot width clears the prior tiny text-overflow
  diagnostic.
- Refreshed GUI evidence exists at
  `output/playwright/gui-polish-check-results.json`,
  `output/playwright/gui-polish-overview-1440.png`,
  `output/playwright/gui-polish-overview-390.png`, and
  `output/playwright/gui-polish-office-preview-1220.png`.
- Current Pixel Office improvement direction: add a compact selected-room focus
  strip above the map, clarify rail hierarchy around focus/active
  lanes/supporting queues, use one consistent accent for selected
  room/resident state, and keep the pixel map full-width without extra stage
  cards.
- Explicit non-adoptions from the comparison: no AutoGen or Agent Squad core
  dependency, no full Agentland reverse proxy in the first slice, no Optio
  Kubernetes requirement, and no approval-bypass launch controls.
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
- A Spatial Lens + Agents coherence pass is now applied: `#/office-preview`
  is room-first with current floor posture and focus-first rail hierarchy,
  while `#/agents` is attention-first with current assignment context.
- Spatial Lens and Agents now have a reversible UI-only navigation path:
  room/resident focus opens `#/agents?agent=<id>`, and agent room chips return
  to `#/office-preview` with room focus stored in browser session storage.
- Agent lifecycle mutation controls, `#/agents/:id` detail routes, live graph
  editing, and room transcript/action execution remain deferred.
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
- A dashboard UI review ultrawork pass is now complete too:
  task quick-status mutations are based on persisted task state instead of
  unsaved editor drafts, route contract coverage is updated, and `/runs`
  refresh now follows `liveRevision`.
- The same pass separates shell route navigation from bridge status, adds
  stronger nav/tab accessibility semantics, and improves the `#/tasks` mobile
  queue/detail flow with refreshed Playwright evidence.
- A follow-up user-perspective UI fix pass is now complete too:
  live stream snapshots use a detail-scoped refresh revision so linked
  run/task streams no longer force the runs rail into repeated loading churn.
- The follow-up also makes `#/approvals` a clear global approval queue route,
  turns unsupported agent/thread deep links into explicit deferred states,
  backs ARIA tab semantics with keyboard navigation, narrows live-region
  announcements to the live status chip, and returns the mobile task queue to a
  single-column scan pattern.
- Refreshed browser evidence for that follow-up now exists at
  `output/playwright/ui-fixes-overview-1440.png`,
  `output/playwright/ui-fixes-tasks-820.png`,
  `output/playwright/ui-fixes-approvals-1220.png`, and
  `output/playwright/ui-fixes-agent-deferred-1220.png`.
- A bundled `insane-design-codex` apply pass is now complete too:
  the dashboard shell uses the Linear reference as its primary design contract,
  with near-black neutral surfaces, restrained indigo accent states, compact
  6/8px radius tokens, 160ms interaction timing, and quieter header/panel
  density.
- This design pass is CSS-only across dashboard tokens, shell, and live panels;
  it does not change forward bridge behavior, routes, backend contracts, or
  operator data models.
- Browser evidence for the insane-design pass now exists at
  `output/playwright/insane-design-overview-1440.png` and
  `output/playwright/insane-design-tasks-820.png`.

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
- Dashboard task action helpers:
  `packages/dashboard/src/operator-task-actions.ts`
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
- Operator evidence summary model:
  `packages/dashboard/src/operator-summary-model.ts`
- Operator reconcile preview model:
  `packages/dashboard/src/operator-reconciler-model.ts`
- Operator reconcile preview panel:
  `packages/dashboard/src/components/OperatorTaskReconcilePreviewPanel.tsx`
- Protocol event registry: `packages/protocol/src/event.ts`
- Generated Python allowed-events registry:
  `scripts/ensemble_allowed_events.py`
- Forward doctor evidence CLI owner:
  `scripts/ensemble_forward.py`
- Forward runtime mode tests:
  `tests/test_forward_runtime_mode.py`
- Latest office-preview evidence:
  `output/playwright/office-preview-2026-04-03-polish.png`
- Dashboard FE-1 shell: `packages/dashboard/src/App.tsx`
- Dashboard FE-1 client: `packages/dashboard/src/forward-bridge.ts`
- Dashboard FE-1 route: `packages/dashboard/src/forward-route.ts`
- Dashboard FE-1 view model: `packages/dashboard/src/forward-view-model.ts`
- Dashboard FE-1 tests: `packages/dashboard/tests/forward-bridge.test.mjs`
- Latest Spatial Lens + Agents evidence:
  `output/playwright/coherence-office-1440.png`,
  `output/playwright/coherence-office-820.png`,
  `output/playwright/coherence-agents-1440.png`,
  `output/playwright/coherence-agents-820.png`,
  `output/playwright/coherence-agents-relationships-1440-full.png`
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

## Latest Update: Gajae-Code Final Adapter

- Timestamp: `2026-07-04T15:14:31Z`
- Gajae-Code is installed and verified as `gjc/0.8.1`; `gjc --smoke-test`
  returns `smoke-test: ok`.
- Conitens now has a leaf adapter at `scripts/ensemble_gjc_adapter.py` that
  imports one redacted GJC metadata JSON file into one
  `harness.evidence_observed` event via `append_event()`.
- The adapter rejects unknown fields, raw harness body fields, unsafe artifact
  paths, unsafe symbolic refs, and CLI error paths that would leak the original
  unsafe ref.
- Symbolic refs (`gjc:`, `event:`, `pr:`, `ci:`) are opaque IDs only; they do
  not carry path semantics.
- Contract docs live in `docs/gjc-harness-adapter.md`; tests live in
  `tests/test_gjc_adapter.py`; safe manual fixture lives in
  `.omo/evidence/gjc-adapter-manual-fixture.json`.
- Verification passed:
  `python -m unittest tests.test_gjc_adapter`,
  `python -m unittest tests.test_gjc_adapter tests.test_forward_runtime_mode tests.test_approval_controls tests.test_loop_state`,
  focused Forward Bridge GJC tests, Python `py_compile`,
  `pnpm --filter @conitens/dashboard test`,
  `pnpm --filter @conitens/dashboard build`, and `git diff --check`.
- Architect rereview returned `APPROVED` after symbolic-ref validation and CLI
  stderr-redaction fixes.
- Remaining known host limitation: full fixed-port Forward Bridge HTTP
  regression is still blocked on this Windows host by `PermissionError:
  [WinError 10013]`; focused non-binding bridge tests remain the backend proof
  channel.

## Latest Update: Event-Sourced Improvement Candidate Approval

- Timestamp: `2026-07-10`
- Conitens now connects a recorded episode closure to a typed, schema-v1,
  versioned improvement candidate, deterministic risk, metadata-only approval
  request, and event-derived approval/rejection outcome.
- Authority remains the event ledger. Candidate list/show replay events directly;
  no candidate SQLite table or file projection was added.
- The compatibility CLI exposes `improvement candidate-create`,
  `candidate-list`, `candidate-show`, and `candidate-decide`; legacy
  `improvement list/show` remains unchanged.
- Replay rejects malformed identity/digest/risk/provenance, wrong-order or
  wrong-actor approvals, private/path/secret-shaped input, and non-string
  candidate fields before they render or affect version allocation.
- Final verification: candidate 27/27, compatibility 55/55, authority
  integration 58/58, focused protocol test and TypeScript build passed. Full
  protocol remained at its known baseline of four failures and 847 passes.
- Isolated CLI QA changed only `.notes/events/events.jsonl`; `.agent`, SQLite,
  Forward, dashboard, and default runtime were untouched.
- Final code review returned APPROVE and scoped security review returned
  unconditional PASS.
- The former next gate is complete: bounded structured revision content now has
  event-first apply/rollback/rebuild and live owner authorization. Candidate
  metadata summaries remain non-executable.

## Latest Update: Event-Sourced Agent Skill Revision Apply/Rollback

- Timestamp: `2026-07-10`
- An approved `skill_patch` candidate can now produce a separate structured,
  candidate-digest-bound revision for exactly one existing
  `.agent/skills/<skill>.yaml` target.
- Apply, rollback, and rebuild require the existing live project-owner match.
  Apply/rollback append authority events before atomic projection; rebuild
  derives the target active stack from valid events and rejects ownerless use.
- Replay validates full event envelopes, candidate approval precedence, exact
  request/grant/terminal correlation, hashes, reasons, duplicates, ordering, and
  sequential rollback stack state.
- Manifest validation is fixed-schema, bounded, privacy-safe, warning-free, and
  path-safe. External drift and post-replace corruption fail closed.
- The compatibility CLI exposes revision propose/show/apply/rollback/rebuild as
  metadata-only ASCII-safe JSON. The live repository's `.agent` registry was not
  modified during QA.
- Final verification: focused 46/46, compatibility 104/104, registry 8/0/0,
  protocol focused test/build, compile, sync, scoped diff, manual CLI recovery/
  privacy/concurrency, and zero-cycle structure gate passed. Full protocol stayed
  at its known 847-pass/4-failure baseline.
- Independent code, state-machine, architecture, completion, and security
  reviews approved after the ownerless-rebuild security RED was fixed.
- Forward, dashboard, SQLite authority, `.conitens`, `.agents/skills`, default
  runtime, and automatic deployment remain outside this slice.
- The post-apply effect/regression gate is now implemented as a bounded exact-key
  event-only slice. Split the revision leaf into reducer/materializer modules only
  when another target family or richer semantics creates real reuse pressure.

## Latest Update: Exact-Key Improvement Effect And Forward Quarantine

- Timestamp: `2026-07-11`
- Closure attempts now accept an optional exact comparison key and persist it in
  the closure bundle, authority event, public index, projection rebuild, and CLI.
- `improvement.effect_observed` connects a source closure, approved candidate,
  owner-applied revision, and later exact-key closure without claiming causality.
- Observe/show/list replay events directly; no effect projection, SQLite table,
  dashboard route, or Forward authority was added.
- Replay is temporal and fail-closed: it uses the event prefix before the first
  effect event, preserves valid observations after later rollback, rejects
  reordered/forged histories, and compares JSON types exactly.
- Observation shares the revision workspace file lock across processes. One of
  two conflicting processes commits; the other fails closed without corrupting
  replay.
- Nested closure content is exact-schema and public-text validated; secret/path/
  raw injection, traversal comparison keys, partial telemetry totals, and bounded
  provenance edge cases have regression coverage.
- Forward is quarantined by accepted ADR-0004. Gates 1, 6, and 7 are contradicted;
  gates 2, 3, 4, 5, and 8 remain unproven; `default_runtime=legacy` is unchanged.
- Gate 6 specifically fails because arbitrary context Markdown can preserve raw
  bodies, secret-shaped strings, and absolute POSIX paths. Wave 3 must replace
  blacklist sanitization with an allowlisted public projection before promotion.
- Closure creation now uses the same bounded public-text policy as effect replay:
  absolute POSIX paths reject before append, while unsafe episode IDs publish
  only deterministic `episode-sha256:` refs.
- The read-only HTTP runtime-roster now skips optional external version probes by
  default after a reproducible 10-second timeout; `probe_versions=1` remains an
  explicit diagnostic path. This does not change authority or runtime default.
- Final verification passes effect 26/26, closure security 19/19, adjacent
  121/121, and Forward runtime + bridge 54/54. Protocol focused 1/1, TypeScript
  build, Python compile, and 151-event/32-alias sync pass; the full protocol stays
  at its known 847-pass/4-failure baseline.
- Goal/scope, QA, code, security, context/history, and replay/state-machine review
  lanes all pass for that slice. Wave 3 subsequently completed the query/command/
  transport separation and allowlisted public context described below. The next
  architecture priority is Wave 4 thin-shell completion; Forward promotion remains
  prohibited.

## Latest Update: Wave 3 Forward Bridge Boundary Refactor

- Timestamp: `2026-07-11`
- Wave 3 is complete: `ensemble_forward_bridge.py` is now a compatibility and
  dependency-assembly facade over separately owned query, command, stream, HTTP,
  public-context, collaboration-read, legacy compatibility, and patch-decision
  boundaries.
- Query/GET paths no longer materialize an absent SQLite database. Existing
  databases use explicit read-only URI access with WAL-aware immutable handling.
- Browser context and state documents are built from allowlisted fields rather
  than arbitrary Markdown. Paths, credentials, secret-shaped strings, local
  identity labels, raw bodies, and unsafe handoff reasons are omitted or replaced
  with neutral public values.
- Thread search is metadata-only. It cannot test for the presence of raw event or
  legacy message text; repository-backed collaboration data remains primary and
  contained legacy discovery remains available for historical compatibility.
- Patch approve/reject routes share one service. Approval carries workspace,
  actor, and reason; approved is retryable and applied is terminal. Approval
  request/decision authority events precede their SQLite projections.
- HTTP keeps loopback/origin/bearer boundaries, uses constant-time token compare,
  bounded/sanitized errors, inventories mutation routes, and handles slightly
  oversized Windows requests with a bounded drain while rejecting extreme lengths
  without unbounded reads.
- Public approval, actor, and handoff data now cross one shared allowlisted
  projection used by query, command, and SSE paths. Query modules import their true
  owners directly through an explicit 27-name facade; wildcard and dynamic-global
  exports are rejected. The root contract lists all 13 operator mutations.
- Verification passes focused 67/67 and complete Wave 3 158/158 tests, HTTP
  overflow stress 11/11, dashboard 154/154, dashboard production build, Python
  compile, 37-file scoped no-excuse, diff validation, and real CLI/live loopback
  privacy/auth/traversal/SSE/body-limit QA.
- The adjacent legacy suite remains at 51 tests with 2 failures and 9 errors from
  uppercase event-alias drift and three legacy persona manifests; no Forward
  Bridge module participates. This is a separate migration, not hidden Wave 3
  fallout.
- Forward remains a quarantined sidecar and `default_runtime=legacy` is unchanged.
  Direct Forward-only SQLite projections and approval reviewer semantics remain
  documented promotion blockers. No ADR-0004 promotion claim is made.
- Independent settled code review is `CLEAR / APPROVE`; the final LazyCodex gate
  is `APPROVE`. Neither reports a scoped finding or blocker.
- A subsequent PR-hardening pass restored the Focused-mode Active Handoff
  Workbench, made candidate terminal decisions atomic, stopped `forward status`
  from materializing an empty runtime, and removed Git email as an owner
  authorization factor. Integrated validation passes Python 119/119, dashboard
  154/154, the production build, and live Chrome hierarchy/console checks. Final
  security and code-quality review approve the staged diff; commit, push, and PR
  creation remain.
- Durable evidence lives in `.omo/evidence/wave3-forward-bridge-green.txt`,
  `.omo/evidence/wave3-forward-bridge-manual-qa.md`,
  `.omo/evidence/wave3-debugging-audit.md`, and
  `.omo/evidence/wave3-forward-bridge-review-work.md`, with independent decisions
  in `.omo/evidence/wave3-forward-bridge-settled-code-review.md` and
  `.omo/evidence/wave3-forward-bridge-refactor-gate-review.md`.
