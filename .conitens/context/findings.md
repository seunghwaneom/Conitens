# findings.md

## Unified Authority Repair Findings - 2026-07-10

- ADR-0004 now resolves the apparent dual ownership: the event ledger is
  durable workspace truth, Forward SQLite is a bounded operational
  owner/index, and no default-runtime promotion occurs without explicit replay,
  parity, privacy, failure-recovery, and operator-command gates.
- Room create/message/tool-event paths all had the same authority inversion:
  projection or SQLite mutation preceded append_event. Failure-first tests
  reproduced each path before repair; all three now append first and project
  only from the returned redacted event payload.
- Room message authority identity must exist before projection. New messages
  use stable msg:<room_id>:<uuid> identities in the event/log/return shape while
  the existing SQLite auto-increment remains the projection id under id.
  Repository callers in this codebase already consume the integer id, so no
  in-repo integer message_id dependency was found.
- Projection failure after a successful event is intentionally asymmetric:
  the exception propagates and the authority event remains for replay/rebuild.
  Tests now lock this behavior for room creation and messages instead of
  pretending the file and SQLite projections are a cross-store transaction.
- The first Windows path fix was too narrow: its username class treated the
  letter s as excluded and leaked common names such as eomsh/sam. Behavior
  locks now cover normal and duplicated backslashes plus POSIX home paths.
- Obsidian rebuild nondeterminism came from project_thread using wall-clock
  updated_at. Rebuild now carries the latest relevant event timestamp into the
  projection, and the test injects divergent clocks without sleeping.
- Legacy room resynchronization must prefer explicit evidence_refs over its
  attachment fallback and read the new content field before the text alias.
- Meeting start/say/end now commit canonical events before transcript or
  summary projection. Deliberation events carry stable message identity,
  content hashes, participant/room metadata, and a relative transcript ref;
  raw meeting text remains in the redacted evidence projection rather than the
  domain event. Missing meeting ids are rejected before either surface changes.
- Handoff create/transition now append before file, loop-state, or SQLite
  projection. Canonical events contain hashes, counts, safe file refs, and a
  handoff ref instead of raw summary/detail/result/worktree/lease values.
  Artifact-manifest failure is a secondary fixed warning and cannot invalidate
  a committed handoff.
- Spawn request is committed before workspace, memory, log, or process side
  effects. A clean short-lived provider is represented as requested, spawned,
  then terminated/completed; a pre-observation nonzero exit produces a
  recoverable error without a spawned record; all post-workspace failure phases
  clean a newly created worktree.
- Stop uses a distinct command lifecycle: command.issued precedes process
  termination, agent.terminated records observed success, and command.completed
  closes the request. If completion append fails after termination, a
  command.failed event and terminal stopped projection preserve the observed
  truth instead of leaving an active zombie record.
- The operations-layer suite remains pre-existing debt rather than a regression:
  the post-repair result is 2 failures and 9 errors across 23 tests, with the
  two removed errors attributable to the repaired lifecycle aliases. Remaining
  failures are unknown fixture/workflow/hook aliases, incomplete legacy
  registry metadata, and one provider workflow return-code mismatch.
- The full protocol suite remains at four known baseline failures: stale
  agent-event registry counts/subset assertions and the ThreadReducer ownership
  invariant for `.notes/40_Comms/**/*.md`. Focused handoff state/alias tests and
  the protocol build are green.
- Forward query privacy required a public projection layer rather than storage
  mutation. Repository rows retain internal paths, approval payloads, reviewer
  notes, and actors, while browser-visible builders now return exact whitelists
  with relative paths or `[REDACTED]`, metadata-only approval/SSE records, fixed
  validator summaries, and `local-operator` actor labels.
- Path normalization must fail closed: an absolute path outside the workspace
  cannot safely degrade to its basename, because that basename may itself be a
  local username. Outside absolute, UNC, and traversal-only values are opaque;
  safe in-workspace paths remain relative.
- Public query builders are now locked as non-mutating. Workspace task IDs are
  derived in memory and stale membership repair is not triggered by list/detail
  reads. Internal command behavior remains separate and is the later extraction
  target; the HTTP routes and current dashboard data shapes remain compatible.
- Windows CP949 exposed a transport boundary independent of content privacy.
  Forward JSON now uses ASCII escapes so valid Unicode survives parsing without
  requiring a UTF-8 console or corrupting the stored context text.

## Architecture Direction And Refactor Planning Findings - 2026-07-10

- Stable product identity across session history is a self-improving,
  event-sourced agent control center: Conitens supervises heterogeneous agent
  harnesses, owns approval/verification/evidence, and turns closed episodes into
  versioned skill, workflow, and agent-topology proposals. It is not another
  provider runtime or a raw transcript warehouse.
- The main architecture problem is boundary drift rather than missing features.
  The active default remains `scripts/ensemble.py + .notes + .agent`, while the
  additive forward status surface reports SQLite-owned authoritative state for
  runs, iterations, rooms/messages, approvals, tasks, and workspaces. A new
  ADR-0004 must define the relation and promotion gate before forward becomes a
  default runtime.
- Confirmed event-first violations include room, meeting-state, and spawn paths
  that write files or SQLite before appending the corresponding event. This is
  a known list, not a complete inventory.
- The Forward Bridge is not read-only in reality. It implements task/workspace
  CRUD, approval decision/resume, and a patch-approval shortcut; handlers call
  repositories/runtime services directly, and the bridge file has no
  `append_event()` call. Query, command, transport, and storage responsibilities
  must be characterized before extraction.
- Current room events are not yet sufficient for a deterministic room-log
  projector: `ROOM_MESSAGE` omits the message/evidence material needed to
  reconstruct the current log. Payload sufficiency is a P0 test gate before the
  first event-before-projection conversion.
- Meeting transcript JSONL remains the canonical append-only transcript/evidence
  ledger under redaction policy, but is not domain state authority. Unredacted
  private raw content must not enter events/operator payloads. The current
  `MEETING_MSG` masked-text contract needs an explicit privacy and replay decision
  rather than an implicit rewrite.
- Browser-visible payload safety is not fully established. The live forward
  status response and operator workspace model can expose absolute local paths.
  Existing payload shapes are therefore not preservation targets until a
  leakage characterization test is green.
- The largest active structural hotspots are `scripts/ensemble.py` (~5,683 LOC),
  `scripts/ensemble_forward_bridge.py` (~4,137 LOC), and dashboard `App.tsx`
  (~2,746 LOC, audit complexity 685). File size is secondary to their multiple
  reasons to change. The generated audit found no relative import cycles, so
  facade-preserving leaf extraction is feasible.
- `packages/command-center` is reference/parity, not an active refactor target.
  Its large files should not distort the backlog unless a later ADR promotes the
  surface.
- Recommended first implementation sequence is: authority/promotion ADR and
  bridge boundary correction; direct event/rebuild/bridge leakage and mutation
  characterization; room payload sufficiency; then the room event-first slice.
  Bridge and dashboard decomposition may proceed in parallel only after those
  contracts are locked.
- Three audit hypotheses were confirmed with observed evidence: legacy default
  and forward SQLite owners coexist; bridge mutations lack a bridge-level event
  append; and current payloads are both replay-insufficient (room message) and
  potentially path-leaking (forward/operator responses).

## Episode Closure Attempt Public Artifact Slice Findings - 2026-07-05

- The interview seed is best implemented as a new leaf module rather than by
  changing task close semantics. Existing `ensemble close` still owns legacy
  task archival, while `ensemble episode close <episode_id>` creates a closure
  attempt artifact for agent-improvement review.
- `task.artifact_added` was already allow-listed and `artifact.generated` was
  already aliased to it, but no existing code path emitted it directly. The
  closure attempt slice now uses it as the authoritative event for
  `episode_closure_bundle` artifacts without introducing `episode.*` events in
  PR1.
- Episode existence is intentionally minimal and event-sourced: an episode id
  exists if prior events mention it as `episode_id`, `task_id`, or `run_id` in
  scope/payload. Missing ids fail before any artifact, index, or projection is
  written.
- Deterministic closure rules are enough for PR1. Required summary fields or
  validation missing/failing produce `blocked`; low confidence or review
  ambiguity produces `needs_review`; only required fields plus validation pass
  and no blockers/review reasons produce `closed`.
- The public artifact store follows the L0/L1 boundary:
  `.notes/artifacts/agent-improvement/public/index.jsonl` and
  `public/digests/*.md` are default-readable, while
  `evidence/*.closure.json` holds the structured L2 evidence bundle. No L3 raw
  store, export command, approval escalation, RBAC, or provider raw I/O was
  added in this slice.
- The episode state file under `public/episodes/*.state.json` is a derived read
  model. It records the event id only for successful close, and leaves blocked
  attempts open or review-pending rather than making artifact state a second
  source of truth.
- Review found two important boundary risks and both were fixed before commit:
  CLI validation flags would have bypassed the verification event gate, so
  closure now derives validation only from prior event log entries; and `.notes`
  artifacts needed replayable event payload data, so `task.artifact_added` now
  carries the closure bundle and index record used to materialize the public
  projection files.
- Public L0/L1 closure text is not a raw log channel. Token/path-like content is
  redacted before append/projection, and raw transcript/provider prompt,
  provider completion, scratchpad, chain-of-thought, and private raw markers are
  rejected before any closure artifact or event is written.
- Episode ids are also treated as untrusted public text. Closure artifact ids,
  filenames, and projection filenames use opaque hash slugs, while the
  `task.artifact_added` scope records only the public surface and the payload
  stores a hash reference instead of the raw episode id.
- The closure implementation was split by responsibility so new closure source
  files stay within the OMO 250 pure-LOC ceiling: model types, artifact
  projection, and closure scoring/event append are separate modules.
- Full Forward Bridge HTTP regression remains unreliable on this Windows host
  because the tests bind fixed loopback ports and fail with `PermissionError:
  [WinError 10013]`, even after elevated retry. Non-server regression targets
  remain usable for this slice.

## Gajae-Code Harness Adapter Integration Findings - 2026-07-04

- Upstream tag verification via Git showed `v0.8.1` exists, even though a
  GitHub release search snippet still surfaced `v0.7.10` first. The installed
  sidecar and Codex plugin are pinned to `0.8.1`.
- GJC standalone installation required Bun `>=1.3.14`; the existing Bun was
  `1.3.7`, so the Windows Bun installer was rerun and the final checks reported
  `bun --version` as `1.3.14`, `gjc --version` as `gjc/0.8.1`, and
  `gjc --smoke-test` as `smoke-test: ok`.
- Codex remote sparse marketplace registration failed because the sparse root
  did not expose a supported marketplace manifest. The working fallback is a
  local pinned clone at `.omx/vendor/gajae-code-v0.8.1` registered as
  `gajae-code-local`, with `gajae-code@gajae-code-local` installed/enabled.
- The safe Conitens integration point is a metadata-only harness evidence
  event. `harness.evidence_observed` reuses the PR/CI raw-content rejection
  pattern and adds transcript/stdout/stderr/output/command rejection so GJC
  cannot become a hidden task or approval state writer.
- The Forward Bridge can show GJC in runtime roster and evidence health without
  exposing raw transcript text. Absolute local evidence paths are dropped from
  harness refs, and the dashboard presents harness evidence as a secondary
  evidence signal beside provider telemetry.
- The final adapter phase is intentionally a leaf script:
  `scripts/ensemble_gjc_adapter.py` accepts only the established harness
  evidence fields, turns relative evidence paths into `artifact:` refs, rejects
  absolute or traversal refs, and appends through `append_event()` only.
- Cleanup review found a real edge in the first adapter implementation:
  `artifact:`-prefixed refs still needed suffix validation. A failing test now
  covers `artifact:../...` and `artifact:C:/...`, and the normalizer rejects
  those before append.
- The fixed-port Forward Bridge HTTP regression bundle is not a reliable proof
  target on this Windows host right now: it fails during local loopback port
  binding with `PermissionError: [WinError 10013]`, including after elevated
  retry. Focused bridge tests that do not bind those ports pass, as do the
  approval/loop-state regressions and dashboard test/build gates.

## README And Office Preview Documentation Sync Findings - 2026-07-04

- The root README still described the dashboard as secondary and kept older
  Command Center-centered framing. The current forward operator UI is
  `packages/dashboard`, backed by the read-only Forward Bridge, while most
  remaining `packages/*` surfaces stay reference/parity material.
- Office Preview documentation needs to distinguish two asset contracts:
  Focused `Agents` cards use large `288x512` imagegen portrait PNGs from
  `public/agent-portraits/generated`, while `Topology` uses generated `64x64`
  sprite-gen atlases from `public/agent-sprites/generated`.
- `packages/dashboard/src/spatial-lens/assets/README.md` was stale: it still
  described the registry as placeholder-only and referenced an older generated
  manifest/sheet path. The actual registry now slices `office-fixtures.png`,
  references `office-floor-*.png`, and resolves generated local role sprite
  atlases.

## Large Imagegen Pixel Portrait Agent Integration Findings - 2026-06-30

- The generated avatar set is a different UI surface from the sprite-gen atlas:
  the approved images are large standalone full-body portraits, while the
  existing atlas is still useful for compact room/spatial avatar contexts.
- A small `agent-character-portraits.ts` registry is the lowest-risk runtime
  contract. It keeps role-to-PNG provenance explicit without changing the
  existing `agent-character-stage-model.ts` card semantics or sprite-gen
  manifest contract.
- The first browser pass proved that natural image dimensions alone are not
  enough visual proof. The portraits loaded as `288x512`, but CSS clipped them
  to upper-body/head views because the figure only had `min-height`.
- The corrected CSS gives the card figure a definite portrait viewport and sets
  the image height relative to that viewport. Browser QA now records rendered
  client rectangles and rejects clipped head-only thumbnails.
- The current demo cast renders four active cards; researcher is still
  registered and available through the portrait registry, but it will only
  appear in the Agent stage when a researcher resident/card is present.

## Front-Facing Pixel Portrait Agent Redesign Findings - 2026-06-28

- The user's attached references corrected the art direction: the target is a
  front-facing, full-body pixel human character lineup, not top-view office
  operators. The relevant signals are large readable heads/eyes, highlighted
  hair, clear torso/arm/hand/leg/shoe separation, and costume/prop
  differentiation.
- A 64px sprite-gen cell is the better source contract for this direction.
  It gives enough vertical room for full-body human proportions while the
  Agent stage can still render at 2x to keep four cards readable at 1220px
  and 1440px.
- The regression test needs to reject the old direction at the request level.
  It now checks for front-facing full-body language, user-supplied reference
  provenance, 64px `cellSize`, and absence of top-view/paper-doll/mascot
  wording in generated `sprite-request.json`.
- `OfficeAvatar` reused the generic `.selected` class, which applied a
  room-tile inset ring around the 128px selected sprite frame. The correct
  selection affordance belongs to the card and figure, not the sprite frame
  itself, so `.office-pixel-avatar.selected` clears that inherited ring.
- Read-only visual review accepted the corrected category but found weak cast
  differentiation. The follow-up sprite primitive pass increased eye contrast,
  enlarged role props, gave the researcher a longer coat silhouette, and added
  subtle non-active card floor light so the lineup reads less flat.
- Read-only UI review found the desktop evidence adequate but flagged missing
  820px and keyboard-focus proof. The browser QA harness now captures
  `agents-820.png` and records a focus sequence from the next-action CTA into
  the four card buttons with visible outlines.
- Visible magenta checks are still required after atlas regeneration because
  the sprite-gen workflow uses chroma-key extraction. Both Agents screenshots
  reported zero visible magenta pixels after the front-facing regeneration.

## Reference-Informed Pixel Office Agent Redesign Findings - 2026-06-28

- Firecrawl search found three useful art-direction anchors rather than a
  single asset to copy: SLYNYRD's top-down character process and animation
  catalogue, Masalimov Ilnur's Pixel Office 32x32 office pack, and Pixeline's
  32px top-down paper-doll character base. The right implementation is to
  extract silhouette and layering rules, not to import source art.
- The strongest transferable pattern is paper-doll readability: hair/head,
  chest/jacket, legs/boots, and tool/prop layers must stay visually separate.
  This matters more than adding tiny texture because dashboard-scale texture
  becomes noise.
- Top-down office references generally keep compact bodies anchored at the
  feet with a readable head/crown and shoulder block. Conitens can keep a
  48px production cell for clarity, but the figure should behave like a
  compact top-down office RPG character inside that cell.
- The Agent stage benefits from rendering the 48px generated cell at 3x. At
  1220px the cards still stay in one row, and the characters become a true
  first-read cast rather than small badges inside cards.
- Provenance needs to be machine-checked. Adding `referenceSources` to the
  generated manifest and `reference_sources` to each `sprite-request.json`
  prevents future runs from losing the search-derived design direction.

## Frontend-Skill 2D Human Sprite-Gen Redesign Findings - 2026-06-28

- The direct sprite-gen pipeline solved provenance, but the 32px human-like
  pass still read too close to simplified symbolic avatars at dashboard scale.
  Moving to 48px cells gives enough room for readable face details, hair,
  shoulders, clothing layers, hands, separated legs, boots, and role props
  without adding runtime dependencies.
- The Agent stage should display 48px sprites at 2x, not 3x or 4x. That keeps
  the visible card footprint close to the prior presentation while allowing the
  source art to carry more human anatomy and clothing detail.
- `prepare_sprite_run.py` injects default style text that includes
  simplified/chibi/mascot-friendly language. Since this batch explicitly
  rejects simplified characters, the generator must rewrite both
  `sprite-request.json` and generated prompts after prepare so future
  provenance matches the detailed 2D human character intent.
- The useful regression test is not just "atlas exists." It must also assert
  48px `cellSize`, generated QA notes, and request text preserve the detailed
  2D human, non-simple art direction.
- Windows reruns can hit stale generated QA folders. The asset generator needs
  `copytree(..., dirs_exist_ok=True)` so repeated sprite-gen regeneration is
  idempotent in this workspace.
- A second leftover source path existed outside the Agent stage:
  `spatial-lens/assets/assetRegistry.ts` still listed command-center agent PNGs.
  Even though the active viewport sprite component uses generated assets, the
  registry/API surface should not advertise the old source.

## Direct Sprite-Gen Agent Character Generation Findings - 2026-06-28

- The prior agent generator still had a provenance problem: it imported
  command-center sprite PNGs before sending them through sprite-gen extraction
  and composition. That kept the UI functional, but it did not satisfy the
  requirement to directly generate the agent designs through sprite-gen.
- The safer path is to make each role a local sprite-gen request with its own
  deterministic component row, then use the sprite-gen extraction, preview, and
  atlas composition scripts as the asset pipeline. This removes the
  command-center/Claude/imported-sheet dependency while preserving the public
  runtime contract.
- Splitting `agent_sprite_design.py` from `generate_agent_sprite_assets.py`
  keeps role art direction and pipeline orchestration reviewable. Both files
  stay under the OMO 250 pure-LOC ceiling after the direct-generation rewrite.
- Generated 24px characters need a larger product-stage presentation than the
  earlier imported sheets. The Agent stage now uses 4x display scale for
  character cards while preserving the smaller default avatar scale elsewhere.
- No `kuma:image-gen` surface was available in this session, so the
  implementation uses direct local sprite-gen component-row generation rather
  than an external image-model pass. The generated QA notes record the
  no-import provenance explicitly.

## LazyCodex Frontend Character-Stage Polish Findings - 2026-06-28

- The sprite-gen Agent stage was functionally correct, but its visible notes
  still leaked implementation ids such as `command-pulse`. Keeping those ids
  in `data-motion-profile` while rendering operator-facing labels improves
  readability without weakening QA hooks or animation routing.
- The 1220px and 1440px screenshots need one dominant visual subject. A
  slightly wider, stronger selected-agent card creates that anchor while the
  remaining cards still fit in one comparison row.
- Blocked/review emphasis is safest as a secondary chip treatment. The
  semantic text remains the primary accessibility and operator signal, and
  reduced-motion mode continues to remove card transforms and sprite motion.

## Sprite-gen Agent Character Stage Findings - 2026-06-27

- The weakest remaining office-preview read was the Focused mode visual
  subject: floor/room staging still implied that the office was the product.
  Replacing Focused's floor surface with an Agent deck makes the characters,
  current handoff, blocked owner, and next action the first read.
- `sprite-gen` works best as an offline/public-asset pipeline for this app.
  The generated `public/agent-sprites/generated` atlases, role manifests, QA
  GIFs, and contact sheets keep provenance inspectable without adding a
  runtime dependency.
- The demo has two operationally distinct non-worker participants that would
  otherwise share an orchestrator visual profile: architect and owner. The
  character stage keeps the underlying task/room data unchanged but gives
  owner a reviewer-style approval visual profile so visible cards resolve to
  four distinct role/motion profiles: `command-pulse`, `verify-brace`,
  `review-scan`, and `build-shift`.
- The role-motion implementation keeps atlas frame changes as opacity-cycled
  stacked spans and applies role personality through transform/filter
  keyframes. This preserves GPU-friendly animation and reduced-motion
  fallback while avoiding canvas-only avatar rendering.
- 1220px is the important visual breakpoint for this pass. Keeping four agent
  cards on one row at 1060-1220px makes character comparison visible in the
  first viewport while preserving the one-row top nav contract.

## Office-Preview Character-First Redesign Guidance Findings - 2026-06-27

- The current `#/office-preview` structure already preserves the most
  important semantic split: `Focused` is workbench-first, `Overview` is
  topology-first, and `Classic` is scenic-room-first. The redesign should not
  collapse those roles; it should shift visual emphasis inside each mode.
- The strongest remaining office bias is not layout. It is visual weight:
  room fixtures, backdrop detail, and scenic thumbnails often compete with the
  agents/operators the user is meant to track.
- The safest leverage point is character readability, not topology surgery.
  Distinct silhouettes, restrained per-role motion, and lower-detail room
  dressing can materially improve scan speed without changing semantics,
  runtime contracts, or the asset pipeline.
- `FocusedHandoffView` already satisfies the rule that the active workbench is
  primary. The redesign target there is to make participant identity outrank
  room context, especially in the muted context strip.
- `Overview` already hides some clutter structurally, but the whole-floor read
  still leans office-first because room furniture remains more visually unique
  than some characters. Character silhouette and local contrast should carry
  more of the differentiation burden.
- `Classic` can remain the richest environmental mode, but it should read as
  "crew in rooms" rather than "rooms with tiny crew." That is a prop-density
  and camera-emphasis problem, not a data-model problem.

## Sprite-gen Office Visual Overhaul Findings - 2026-06-27

- `aldegad/sprite-gen` is most useful here as an asset-generation skill, not
  as an app runtime dependency. The safe path is: generate loose 24px fixture
  PNGs, import them through sprite-gen's curator-ready run format, export the
  curated PNGs, then compose the existing `office-fixtures.png` atlas contract.
- The runtime contract remains intentionally unchanged: `office-fixtures.png`
  stays `600x24`, fixture cells stay `24x24`, and registry ordering still
  matches `OFFICE_FIXTURE_REGISTRY`. The new
  `office-fixtures.meta.json` records the sprite-gen provenance and source
  rectangles so future visual swaps are testable.
- Replacing the fixture/floor art with a darker signal-first palette required
  retuning Classic room text, badge, window, and waiting-label contrast.
  Overview floor colors were moved onto the same office token family so Floor
  Overview no longer mixes bright lab/workshop patches with a dark topology
  shell.
- Browser QA is still the required final proof for office visual work. Static
  tests/build caught the atlas contract; the CDP QA proved Focused/Overview/
  Classic mode behavior, no horizontal overflow, tab keyboard behavior, and
  Overview map/inspector separation across 1220px and 1440px.

## Ultrawork Cleanup Findings - 2026-06-14

- The safest cleanup split was generated/local artifacts first, tracked stale
  dashboard files second, and high-risk runtime state never. `.notes/`, `.omx/`,
  `.conitens/runtime/`, `.omo/evidence/`, cloned research repositories, and
  active config/projection surfaces were left intact.
- The root `after-*.png` and `screenshot-*.png` files are tracked screenshot
  artifacts with zero basename references in non-image repo files. Current
  Spatial Lens/public asset PNGs are referenced and were preserved.
- `packages/dashboard/tsconfig.tsbuildinfo` was tracked even though
  `*.tsbuildinfo` is ignored. It is generated by `tsc -b`, so the cleanup
  removes it from tracked source control while allowing future ignored
  regeneration.
- Dashboard components `AgentDetail`, `AgentStudio`, `ApprovalCenter`,
  `HandoffLink`, `KanbanBoard`, `OverviewDashboard`, `TaskDetailModal`,
  `ThreadBrowser`, `ThreadDetail`, `Timeline`, and hook `useWebSocket` had no
  active production imports. Post-delete dashboard tests/build confirm they are
  not on the current app path.
- `HierarchyDepthLODLayer.tsx` had no external references in command-center
  source. Command-center build remains blocked by unrelated existing TypeScript
  errors in `src/main.tsx` and `src/office/RoomMonitor.ts`; the cleanup did not
  introduce missing-symbol errors.

## Office Component Reposition Fix Findings - 2026-06-14

- User feedback clarified that the previous "reposition" was insufficient
  because it only changed the preview shell/inspector composition. The real
  acceptance target is the actual Floor Overview office/floor geometry:
  `OFFICE_STAGE_ROOMS`, corridor graph, and floorplate layout.
- The safe shared source of truth is `office-stage-schema.ts`. Moving rooms
  there updates Classic directly and Overview through
  `createFloorViewportModel`; moving only CSS or sidebar layout does not
  satisfy "office component repositioning."
- The new operator-chain arrangement is locked by coordinates:
  Ops/Impl on the left, Validation/Review/Research stacked on the right, and
  Central Commons as the lower-center hub. Browser QA additionally reads
  each `[data-room-id]` inline placement from the rendered DOM.
- Reviewer caveat: Central Commons is partly below the first viewport in
  Overview screenshots. This is acceptable for the current operator-chain
  acceptance target because the critical rooms and rail are visible and
  non-overlapping; treat full Commons first-viewport visibility as a separate
  future design decision, not a blocker for this fix.

## Floor Overview OSS UX Reposition Findings - 2026-06-14

- Current OSS agent-management UIs converge on a primary graph/canvas plus an
  adjacent inspector or run rail: LangSmith/LangGraph Studio, AutoGen Studio,
  Flowise, Dify, Langfuse, AgentOps, and Open WebUI all separate the
  working surface from state/trace/administration detail. The transferable
  Conitens pattern is map-first overview plus a narrower operator inspector,
  not a second co-primary dashboard column.
- The safe local implementation surface is shell/sidebar composition:
  `PixelOffice.tsx`, `OfficeSidebar.tsx`, `office.module.css`, and
  `office-sidebar.module.css`. `FloorViewport` internals do not need to change
  for component repositioning and were left untouched in this pass.
- 1220px is the critical boundary. Initial browser QA passed mechanically but
  visual review found the rail too wide and too visually heavy. The final
  layout narrows the overview rail to 260px at 1220px while the floor map
  measures 869px wide; no horizontal overflow occurs.
- CSS Module selectors cannot style global utility classes such as `.muted`
  unless wrapped in `:global(...)`. The overview rail truncation rule for
  agent meta uses `.office-staff-main :global(.muted)`.

## Focused Workbench Review Patch Findings - 2026-06-12

- Code review found that `createFocusedHandoffWorkbenchModel()` treated
  `tasks[0]` as the blocked task fallback. That made active work such as
  `wf_apply` render as the BLOCKED owner-gate step when no task was actually
  blocked.
- The safe fallback is explicit: if no blocked task exists, the owner-gate
  slot renders `CLEAR`, the headline says `No blocked owner gate`, and the
  next action follows the review task when one exists.
- Blocked age must be computed from block-opening event types, not from the
  earliest event with the same task id. Prior lifecycle events such as
  `task.created` must not inflate the stuck-duration chip.

## Overview Declutter Findings - 2026-06-12

- Opacity/desaturation muting does NOT declutter a 1x pixel map — dozens of
  sub-readable shapes remain visually present. Structural removal
  (display:none for decoration layers) plus palette unification is what
  reads as "clean". User explicitly rejected the transparency approach.
- Remaining-prop attribution method: query each layer class inside a room
  and count visible generated sprites — Impl Office clutter decomposed into
  wall-detail (5), operational-overlay (6), room-kit (3) after dressing and
  workstation were hidden.
- The six `data-floor-style` base colors live at spatial-lens.module.css
  ~line 785; overview-scoped overrides are safe because Focused/Classic
  never mount FloorViewport.

## OSS Agent-Visualization Research Findings - 2026-06-12

- Surveyed: Langfuse, AgentOps,
  disler/claude-code-hooks-multi-agent-observability (event/duration
  surfaces), LangGraph Studio (stateful graph edges), a16z AI Town and
  ChatDev (pixel agent worlds with live activity streams).
- The transferable operator-dashboard patterns are: durations on stuck
  spans, runtime state on graph edges, and a visible live event stream.
  Pure aesthetic patterns (full world simulation, chat replay) do not fit
  the Focused workbench contract.
- Demo event timestamps are fixed ISO strings, so any age/duration label
  must be derived relative to the latest event timestamp — `Date.now()`
  against the 2026-03-21 demo data would render nonsense and break test
  determinism and I-2 replayability.

## State Vocabulary Findings - 2026-06-12

- The dashboard had two status vocabularies for the same agents: runtime
  status (`AgentState["status"]`, e.g. running/idle) and derived work state
  (BLOCKED/REVIEW/RUNNING/...). Operator-facing rails must use the derived
  work state; runtime status alone misreports handoff targets (sentinel) and
  gate owners (owner).
- `getTaskTone` in `src/utils.ts` already covers the work-state vocabulary
  (running/active→success, review→info, blocked→danger, default→neutral) and
  is the right tone source for any new status chip.

## Frontend GUI UX Review Findings - 2026-06-12

- The Focused context-strip thumbnails composed three layers fighting each
  other: a decorative gradient, a near-invisible generated room backdrop
  (opacity 0.34 + desaturation filter), and a scale-2 foreground sprite. For
  96x62 thumbs, the room art must lead and sprites work only as scale-1
  corner accents.
- Workbench step cards were stretched by two mechanisms at once: fixed
  min-heights (172/198px) and an internal `minmax(32px, 1fr)` spacer row.
  Removing only one would not have freed the space — the root `min-height`
  clamp would re-stretch the cards.
- `PixelOffice` rendered a second `Spatial Lens` kicker 60px under the page
  header's identical kicker; no test asserted it.

## Focused Workbench Polish Findings - 2026-06-12

- The duplicated `Owner approval required` copy had five render sites: the
  workbench h3, the CTA link, the blocked step meta, the approve step detail,
  and the `PixelOffice` focused summary reason (`office-summary-reason`).
  The model string itself stays in `focusedHandoffModel.ts` (tests assert it).
- The office-preview demo page can remount out of Focused mode after Vite HMR;
  browser checks must re-select the `Focused` stage button before measuring.
- `ensemble verify` is documented in CLAUDE.md (Ensemble v4.2) but the current
  `scripts/ensemble.py` CLI has no `verify` subcommand.

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

## Spatial Lens Verification Findings - 2026-06-11

- `pnpm.cmd --filter @conitens/dashboard test` passed with 138 tests.
- `pnpm.cmd --filter @conitens/dashboard build` passed and built 137 Vite
  modules.
- Browser verification evidence lives at
  `output/playwright/spatial-lens-verification-results.json`.
- Focused 1440px and 1220px verification reported:
  `focusedViewCount=1`, `workbenchCount=1`, `anyFloorCount=0`,
  `minimapCount=0`, `phaseRailCount=0`, `stepCount=4`, `contextCount=2`,
  `navRows=1`, and `horizontalOverflow=false`.
- Focused verification also confirmed visible `q_184_owner_gate`, visible
  `Owner approval required`, and visible
  `verify_append handoff: architect -> sentinel`.
- Overview 1440px verification reported `overviewFloorCount=1`; Classic
  1440px reported no Spatial Lens floor.
- Visual inspection of the 1220px Focused screenshot still shows the
  previously reviewed hierarchy caveats: repeated `Owner approval required`
  copy, heavy nested chrome, and context thumbnails below the first viewport.

## Spatial Lens UI Architecture Rule Facts

- `AGENTS.md` now contains a dedicated `Conitens UI Architecture Rules /
  Spatial Lens` section.
- The standing rule says Focused mode is not Floor Overview, must answer active
  actor, blocked task, next handoff owner, and next operator action in under
  three seconds, and must keep the Active Handoff Workbench as the primary
  visual surface.
- The same rule keeps the full pixel floor map owned by Floor Overview, hides
  minimap from Focused, prevents critical task cards from floating over noisy
  map art, and blocks duplicate phase/state surfaces.
- Future Spatial Lens UI changes should preserve existing demo data shapes,
  avoid new dependencies unless justified, and keep top navigation on one row
  at 1220px.

## Spatial Lens Focused Workbench IA Facts

- The user-approved implementation scope was a Focused-mode information
  architecture redesign, not visual polish: Focused must answer active actor,
  blocked task, next handoff owner, and next operator action in under three
  seconds.
- `OfficeStage.tsx` no longer renders `FloorViewport` for Focused mode.
  Focused renders `FocusedHandoffView`; Floor Overview remains the full
  `FloorViewport viewMode="overview"` topology surface; Classic remains the
  non-Spatial-Lens room scene.
- `focusedHandoffModel.ts` is the pure derivation point for the Focused
  workbench model. It uses existing `rooms`, `tasks`, and `handoffs` and keeps
  the current fixture chain `architect->sentinel->owner`, blocked task
  `q_184_owner_gate`, and review task `verify_append`.
- `FocusedHandoffView.tsx` exposes `data-focused-handoff-view="true"` and
  `data-active-handoff-workbench="true"` exactly once and renders four phase
  steps: Plan/running architect, blocked owner gate, Validate/review sentinel,
  and Approve/blocked owner.
- The next action is text-first and explicit: `Owner approval required`, with
  an approvals action link to `#/approvals`.
- The blocked task card is the highest-emphasis object and carries the
  model-derived line `verify_append handoff: architect -> sentinel`.
- Focused retains pixel-art identity through a muted two-room spatial context
  strip for Ops Control and Validation Office. Critical task cards are not
  placed on top of detailed map art.
- Focused no longer mounts the full floor map, route minimap, focused target
  edge, focused corridor continuity layer, offscreen rail, old focused
  handoff rail, or separate phase lane strip.
- `PixelOffice.tsx` now owns `stageMode` and preserves the existing
  `conitens.officeStageMode` session storage key. Focused compacts the summary
  band so live metrics do not compete with the workbench.
- `OfficeSidebar.tsx` accepts a mode prop so Focused rail content is
  de-emphasized below the primary surface.
- Browser evidence at `http://localhost:3003/#/office-preview` reports
  Focused 1440 and 1220 with one Focused view, one workbench, zero Spatial
  Lens floor mounts, zero minimaps, zero focused target edges, zero phase
  rails, four steps, two context thumbnails, visible blocked task, visible
  next action, visible handoff summary, one nav row, and no horizontal
  overflow. Overview 1440 still mounts one floor map; Classic mounts none.
- Verification passed targeted shell/Spatial Lens tests, TypeScript noEmit,
  full dashboard tests with 138 tests, dashboard production build, browser
  checks, and a dashboard-scoped repo-structure post-write gate with
  `cycles=0`.
- `.vibe/brain/precommit.py` was run and failed on existing command-center
  typecheck baseline regressions; its smoke unittest passed and it reported no
  staged/scannable files for this dashboard-focused change.

## Spatial Lens Prompt 4.14 Sprite-gen Curation Facts

- The user-requested reference repository was
  `https://github.com/aldegad/sprite-gen`.
- `sprite-gen` describes a component-row pipeline:
  `sprite-request.json -> layout guides + prompts -> image-gen state rows ->
  chroma alpha -> connected components -> transparent frames ->
  sprite-sheet-alpha.png + manifest.json.frame_layout`.
- The relevant design contract from `sprite-gen` is that runtime code should
  consume manifest rectangles and curation metadata rather than guessing sheet
  geometry from image alpha at render time.
- The Spatial Lens implementation reused that contract without adding a new
  runtime dependency: existing project-owned generated sheet files remain under
  `packages/dashboard/public/assets/spatial-lens/generated/`.
- `generatedAssetManifest.ts` now includes curation metadata for selected
  generated frames and adds manifest rects for `prop.auditTicket`,
  `prop.checkScanner`, and `character.ownerReviewing`.
- `GeneratedSprite.tsx` now emits `data-generated-sprite-curation` and
  curation offset CSS variables so generated frame provenance is inspectable in
  browser evidence.
- `generatedRoomBackdrops.ts` now declares component-row curation tile/anchor
  metadata for Ops Control room usage, Validation Office room usage, and the
  Validation target-edge usage.
- `GeneratedRoomBackdropLayer.tsx` now emits
  `data-generated-room-curation` plus curation tile variables for CSS room
  material treatment.
- `roomKit.ts` now gives every templated room at least three room-kit sprites,
  with seven total curated office props across the six room templates.
- `AgentSprite.tsx` now maps owner reviewing / handoff-receiving state to
  `character.ownerReviewing`.
- Browser evidence reports Focused 1440:
  `cameraZoom: "3"`, `cameraTransform: matrix(3, 0, 0, 3, 0, 0)`, focused
  room `ops-control`, target room `validation-office`, route framing
  `source-corridor-target-edge`, 279 generated sprites, 7 curated generated
  sprites, 6 room-kit layers, 20 room-kit sprites, 7 curated room-kit sprites,
  3 component-row room backdrops, no console errors, and no horizontal
  overflow.
- Floor Overview remains `1x` topology with 0 generated room backdrops.
  Classic mounts no Spatial Lens floor and reports 0 generated sprites.
- Verification passed `pnpm.cmd --filter @conitens/dashboard test` with 133
  tests, `pnpm.cmd --filter @conitens/dashboard build`, browser checks, and a
  persisted visual verdict at 98/100.

## Spatial Lens Current Visual Audit Facts

- The read-only audit artifact now lives at
  `docs/design/spatial-lens-current-visual-audit.md`.
- The active route inspected for the audit was
  `http://localhost:3000/#/office-preview`.
- The current component chain is `App -> PixelOffice -> OfficeStage ->
  FloorViewport` for Focused/Floor Overview, with `OfficeRoomScene` retained
  as the Classic fallback.
- Focused mode is owned by `OfficeStage.tsx`, `FloorViewport.tsx`,
  `viewportCamera.ts`, `MinimapDock`, `AgentOffscreenRail`,
  `AgentLayer.tsx`, and Spatial Lens CSS. It remains the default and uses
  integer camera zoom `3x`.
- Floor Overview uses the same Spatial Lens floor branch with
  `viewMode="overview"` and integer zoom `1x`; Classic does not mount the
  Spatial Lens floor or generated sprites.
- The visual layout remains data-driven at the projection layer through
  `floorGeometry.ts`, `floorLayout.ts`, `corridorGraph.ts`,
  `roomPlacement.ts`, `roomTemplates.ts`, `roomDressing.ts`,
  `agentStations.ts`, and `agentVisualState.ts`.
- Current browser evidence reports Focused `cameraZoom: "3"`,
  `focusedRoomId: "ops-control"`, `targetRoomId: "validation-office"`,
  9 corridor nodes, 6 door corridor references, 1 handoff packet, 1 blocked
  marker, 4 agent stations, 2 offscreen agents, 6 character sprites, 0 floor
  canvases, no console/page errors, and no horizontal overflow.
- Floor Overview reports `cameraZoom: "1"`, all six rooms, 4 agent stations,
  0 offscreen agents, 1 handoff packet, 1 blocked marker, no console/page
  errors, and no horizontal overflow.
- Classic reports no Spatial Lens floor, no generated sprites, and no floor
  canvases.
- The audit concludes agents are now partially agent-first: readable generated
  character sprites, states, cues, and click selection exist, but the
  Validation receiving actor is not framed in the main Focused camera.
- The handoff is mixed but leaning in-world: generated packet and barrier
  markers are present, while long floor conduit segments still carry too much
  of the route story.
- No canonical runtime, `.notes`, `.agent`, approval, provider, bridge,
  scheduler, task mutation, asset-download, or production-code change was made
  for this audit.
- `packages/dashboard/package.json` defines `dev`, `test`, `build`, and
  `preview`; it does not define a lint script. The package build remains the
  typecheck gate because it runs `tsc -b && vite build`.

## Spatial Lens Prompt 4.7 Offscreen Awareness Facts

- Prompt 4.7 is a visual-projection-only change. It does not change canonical
  runtime truth, `.notes`, `.agent`, providers, approvals, bridge contracts,
  scheduler behavior, task mutation, external fetches, or assets.
- `AgentOffscreenRail` now exposes
  `data-agent-offscreen-treatment="compact-tab"` and keeps `worker-1`
  reachable outside the Focused camera.
- Focused offscreen awareness now measures as a transparent `112px` rail with
  one compact `112px x 30px` card and `26px` CSS min-height.
- `HandoffOverlay` route guide generation is intentionally narrowed to one
  source-side horizontal guide tile; exploratory `spine` and `target` guide
  variants are no longer present.
- `FloorViewport` now exposes `data-camera-stage="floor"` so browser checks
  can verify the actual camera transform without relying on generated CSS
  module class names.
- `FocusedRouteTargetEdge` now exposes
  `data-focused-target-route-pixel` and `data-focused-target-agent`, preserving
  stable browser hooks for the corridor-connected target edge.
- Browser diagnostics for Prompt 4.7 report Focused 1440:
  `cameraZoom: "3"`, camera stage transform
  `matrix(3, 0, 0, 3, 0, 0)`, focused room `ops-control`, target room
  `validation-office`, route framing `source-corridor-target-edge`, target
  continuity `corridor-connected`, target route pixels `one/two/three`,
  target agent `sentinel`, route minimap `Route Minimap`, 6 route segments,
  1 source-side route guide tile, 1 handoff packet, 1 packet slot, 1 blocked
  lane, 253 generated sprites, 6 character sprites, no console errors, and no
  horizontal overflow.
- Laptop-width Focused reports the same `3x` camera, route, packet, target,
  and compact offscreen rail contract with no horizontal overflow.
- Floor Overview remains `1x`, `data-overview-role="topology"`, and visibly
  labeled `1x Floor Overview`; Classic mounts no Spatial Lens floor and no
  generated sprites.
- Verification passed targeted Spatial Lens tests, full dashboard tests with
  124 tests, and dashboard production build.

## Spatial Lens Prompt 4.8 Corridor Continuity Facts

- Prompt 4.8 is a visual-projection-only change. It does not change canonical
  runtime truth, `.notes`, `.agent`, providers, approvals, bridge contracts,
  scheduler behavior, task mutation, external fetches, or assets.
- `FocusedCorridorContinuityLayer` derives three floor-material tiles from the
  first visible handoff route's existing door/spine points:
  `source-apron`, `spine-runner`, and `target-apron`.
- `FloorViewport` renders the continuity layer only in Focused mode. Floor
  Overview and Classic browser evidence both report 0 continuity tiles.
- The continuity treatment is deliberately not a route marker: it does not
  emit `data-handoff-route-guide`, and the accepted route guide density
  remains 1 source-side tile.
- Browser diagnostics for Prompt 4.8 report Focused 1440:
  `cameraZoom: "3"`, camera stage transform
  `matrix(3, 0, 0, 3, 0, 0)`, focused room `ops-control`, target room
  `validation-office`, route framing `source-corridor-target-edge`,
  continuity parts `source-apron/spine-runner/target-apron`, 6 route segments,
  1 route guide tile, route opacity `0.42`, route height `2px`, 1 handoff
  packet, 1 packet slot, target continuity `corridor-connected`, target
  agent `sentinel`, 253 generated sprites, 6 character sprites, no console
  errors, and no horizontal overflow.
- Laptop-width Focused reports the same `3x` continuity, packet, route, target,
  and compact offscreen rail contract with no horizontal overflow.
- Floor Overview remains `1x`, `data-overview-role="topology"`, and visibly
  labeled `1x Floor Overview`; Classic mounts no Spatial Lens floor and no
  generated sprites.
- Verification passed targeted Spatial Lens tests, full dashboard tests with
  125 tests, and dashboard production build.

## Spatial Lens Prompt 4.9 Viewport-Dominant Shell Facts

- Prompt 4.9 is a visual-layout-only change. It does not change canonical
  runtime truth, `.notes`, `.agent`, providers, approvals, bridge contracts,
  scheduler behavior, task mutation, external fetches, or assets.
- `PixelOffice` now exposes
  `data-office-preview-shell="viewport-dominant"` on the root office frame.
- `office.module.css` uses that hook to compact the summary band, metrics,
  focus line, and 1220px responsive layout specifically for the office preview
  shell.
- At laptop width, the summary band stays two-column and the secondary summary
  sentence is hidden to keep the pixel office higher in the first viewport.
- Browser diagnostics for Prompt 4.9 report Focused 1220:
  shell treatment `viewport-dominant`, summary height `96px`, floor top
  `y=362`, Focused `cameraZoom: "3"`, camera transform
  `matrix(3, 0, 0, 3, 0, 0)`, 3 continuity tiles, 1 route guide tile, 1
  handoff packet, 1 packet slot, target agent `sentinel`, compact offscreen
  rail `worker-1`, no console errors, and no horizontal overflow.
- Prompt 4.8's laptop Focused floor top was `y=430`; Prompt 4.9 moves it up by
  68px without removing the live metrics or focus line.
- Focused 1440 now reports floor top `y=326`, route framing
  `source-corridor-target-edge`, continuity tiles `3`, and no horizontal
  overflow.
- Floor Overview remains `1x`, `data-overview-role="topology"`, and visibly
  labeled `1x Floor Overview`; Classic mounts no Spatial Lens floor and no
  generated sprites.
- Verification passed targeted shell/Spatial Lens tests, full dashboard tests
  with 126 tests, and dashboard production build.

## Spatial Lens Prompt 4.1 Route Composition Facts

- Prompt 4.1 keeps Spatial Lens VIEWPORT read-only and changes only visual
  projection, camera, and UI rendering.
- `viewportCamera.ts` now applies a larger route pull when Focused has a
  connected handoff target. For the default Ops -> Validation route, Focused
  remains `3x` and reports scene bounds `15.833,1.833,33.333,33.333`.
- `FocusedRouteTargetEdge.tsx` renders the target room as a compact in-world
  receiving edge with a room plaque, status light, checklist board, inbox tray,
  packet sprite, and target resident sprite.
- In default Focused mode, the target edge is `validation-office`, includes
  sentinel, and exposes `data-focused-route-target-edge="true"`.
- `AgentOffscreenRail` now excludes both the focused room and target room, so
  sentinel moves from the offscreen rail into the receiving edge. The default
  offscreen rail now shows only `worker-1`.
- `FloorViewport` exposes
  `data-focused-route-framing="source-corridor-target-edge"` in Focused and
  `data-overview-role="topology"` in Floor Overview.
- Floor Overview keeps `cameraZoom: "1"`, all six rooms, and a visible
  `1x Floor Overview` label with topology-map treatment.
- Browser diagnostics for Prompt 4.1 reported Focused 1440:
  `cameraZoom: "3"`, `focusedRoomId: "ops-control"`,
  `targetRoomId: "validation-office"`, 1 target edge, 1 target packet,
  target agent `sentinel`, offscreen agent `worker-1`, 9 corridor nodes,
  6 door corridor references, 1 handoff packet, 1 blocked marker, 0 floor
  canvases, no console/page errors, and no horizontal overflow.
- Laptop-width Focused reported the same route-framing contract and no
  horizontal overflow.
- Classic reported no Spatial Lens floor and no generated sprites.
- Visual verdict improved to 87/100 but remains `revise`; the main remaining
  gap is target-edge/corridor continuity and route-line dominance.
- Verification passed `pnpm.cmd --filter @conitens/dashboard test` with 118
  tests and `pnpm.cmd --filter @conitens/dashboard build`.

## Spatial Lens Prompt 4.2 Target-edge Continuity Facts

- Prompt 4.2 remains a visual-projection-only change. It does not change
  canonical runtime truth, `.notes`, `.agent`, providers, approvals, bridge
  contracts, scheduler behavior, task mutation, external fetches, or assets.
- `FocusedRouteTargetEdge.tsx` now marks the receiving edge with
  `data-edge-continuity="corridor-connected"`.
- The Focused receiving edge now includes a corridor connector tile and three
  route pixels through `data-route-step` spans, so the target reads less like
  a detached inset.
- `FloorViewport.tsx` now renders `data-focused-source-plaque="true"` with
  the focused room label. Default Focused browser evidence reports source
  plaque text `Ops Control`.
- Focused route-line styling is quieter than Floor Overview: browser computed
  style reports route opacity `0.42` and route height `2px`; Overview keeps
  route opacity `0.86` and route height `4px`.
- Default Focused browser diagnostics report `cameraZoom: "3"`,
  `focusedRoomId: "ops-control"`, `targetRoomId: "validation-office"`,
  route framing `source-corridor-target-edge`, target continuity
  `corridor-connected`, 3 route pixels, target agent `sentinel`, source
  plaque `Ops Control`, offscreen agent `worker-1`, 9 corridor nodes,
  6 door corridor references, 1 handoff packet, 1 blocked marker, 0 floor
  canvases, no console/page errors, and no horizontal overflow.
- Laptop-width Focused reports the same route-framing, source-plaque, and
  corridor-connected target-edge contract with no horizontal overflow.
- Floor Overview remains `1x` topology and Classic remains isolated with no
  Spatial Lens floor.
- Visual verdict is now `pass`, score 90/100. Remaining gaps are polish-level:
  the Validation target is an edge rather than a full room, and future handoff
  storytelling should continue shifting from lines to object states.
- Verification passed the targeted Spatial Lens tests, full dashboard tests
  with 118 tests, and dashboard production build.

## Spatial Lens Prompt 4.3 Cleanup/Review Facts

- Prompt 4.3 is a behavior-preserving cleanup/review pass over the recent
  Focused route composition files.
- `FocusedRouteTargetEdge.tsx` now keeps the focused target route step ids in
  one local constant and maps them into the three `data-route-step` spans.
- `FocusedRouteTargetEdge.tsx` now derives target resident role/state/cue as
  one local visual context instead of repeating role/state/cue branches in JSX.
- `FloorViewport.tsx` now derives `isFocusedMode`, `isOverviewMode`, and
  `focusedRouteFraming` before JSX, reducing repeated `viewMode` conditionals
  while preserving the same data attributes.
- Browser verification after cleanup reported Focused 1440 with
  `cameraZoom: "3"`, `focusedRoomId: "ops-control"`,
  `targetRoomId: "validation-office"`, route framing
  `source-corridor-target-edge`, target continuity `corridor-connected`,
  3 target route pixels, source plaque `Ops Control`, target agent
  `sentinel`, offscreen agent `worker-1`, 9 corridor nodes,
  6 door corridor references, 1 handoff packet, 1 blocked marker,
  4 agent stations, 268 generated sprites, 6 character sprites,
  0 floor canvases, no console/page errors, and no horizontal overflow.
- Laptop-width Focused kept the same route framing and continuity contract with
  no horizontal overflow. Floor Overview remained `1x` topology with the
  `1x Floor Overview` label, and Classic mounted no Spatial Lens floor.
- Visual verdict remains `pass`, score 90/100. Remaining visual gaps are
  unchanged from Prompt 4.2: Ops Control density and the edge-style Validation
  target should be handled in a separate visual slice if needed.
- Verification passed targeted Spatial Lens tests, full dashboard tests with
  118 tests, dashboard production build, and real browser checks.

## Spatial Lens Prompt 4.4 Visual Polish Facts

- Prompt 4.4 remains a VIEWPORT-only visual polish pass. It does not change
  canonical runtime truth, `.notes`, `.agent`, providers, approvals, bridge
  contracts, scheduler behavior, external fetches, assets, or task mutation.
- `RoomZone.tsx` now exposes `data-room-floor-id` on each room floor so
  room-specific pixel floor treatments can be scoped without changing
  canonical room data.
- Ops Control room dressing removed the third console workstation and several
  duplicate clutter props: extra cable, floor alert lights, side monitor,
  sticky clusters, extra clipboard/file box, and the wall pin board.
- Ops Control still preserves the authored `architect-seat`,
  `floor-lead-seat`, and `handoff-seat` agent-slot contract.
- Browser verification after the polish pass reports Ops Control prop count 29
  and Ops workstation prop count 12, down from Prompt 4.3's 44 and 18.
- Ops Control now has a hard-pixel walk lane via the room-floor pseudo-element;
  browser computed style reports walk-lane opacity `0.72`.
- The Focused Validation target connector is wider (`72px` measured corridor
  connector), the threshold bridge extends further left, and packet/inbox
  positions are closer to the receiving threshold.
- The target-edge sentinel now renders at integer `2x`; browser computed style
  reports `matrix(2, 0, 0, 2, 0, 0)` for the target sprite transform.
- Default Focused browser diagnostics report `cameraZoom: "3"`,
  `focusedRoomId: "ops-control"`, `targetRoomId: "validation-office"`,
  route framing `source-corridor-target-edge`, target continuity
  `corridor-connected`, 3 route pixels, target agent `sentinel`, source plaque
  `Ops Control`, offscreen agent `worker-1`, 9 corridor nodes,
  6 door corridor references, 1 handoff packet, 1 blocked marker,
  4 agent stations, 253 generated sprites, 6 character sprites, 0 floor
  canvases, no console/page errors, and no horizontal overflow.
- Laptop-width Focused keeps the same route-framing and target-sprite scale
  contract with no horizontal overflow. Floor Overview remains `1x` topology
  and Classic remains isolated with no Spatial Lens floor.
- Visual verdict is `pass`, score 92/100. Remaining visual gap: the topology
  still leaves a large dark corridor span at `3x`; future polish should focus
  on route-object state or route dock restraint rather than adding props.
- Verification passed targeted Spatial Lens tests, full dashboard tests with
  118 tests, dashboard production build, and real browser checks.

## Spatial Lens Prompt 3.10 Focused Composition Facts

- Focused VIEWPORT rendering is owned by `FloorViewport`, camera/framing by
  `viewportCamera.ts`, local mode chrome by `OfficeStage`, and scene styling by
  `spatial-lens.module.css`.
- The previous awkward composition came from using a room-center camera with
  no positive frame inset, a 620px focused viewport height, and a top-right
  minimap that sat over the room scene.
- `viewportCamera.ts` now keeps Focused at integer `3x` and Overview at
  integer `1x`. Focused frame data includes `targetRoomId` and
  `sceneBounds`.
- With the default Ops Control focus and Ops -> Validation handoff, browser
  diagnostics report `data-camera-target-room-id="validation-office"` and
  `data-camera-scene-bounds="1,0,40,32"`.
- Focused browser captures after Prompt 3.10 reported:
  - 1440px: stage rect 1080x750, dock rect 142x106, dock overlap 0 with
    Ops Control and Impl Office.
  - Laptop width: stage rect 1156x720, dock rect 142x106, dock overlap 0 with
    Ops Control and Impl Office.
  - Both: `cameraZoom: "3"`, 9 corridor nodes, 6 door frames, 6 door corridor
    refs, 259 generated sprites, 257 PixelProps, 1 handoff packet,
    1 blocked marker, 0 SVG routes, no console/page errors, and no horizontal
    overflow.
- Floor Overview still reports `cameraZoom: "1"` and all six rooms visible.
  CLASSIC still reports no Spatial Lens floor layers and 0 generated sprites.
- The remaining visual gap is no longer the focused camera shell; it is
  primarily that live residents still render via `OfficeAvatar` canvas marks
  and not generated character sprites.

## Spatial Lens Building Shell Cleanup Facts

- `CorridorLayer` renders the 9 actual corridor nodes from
  `CORRIDOR_NODES` with `data-corridor-node`.
- `DoorFrameLayer` previously reused `data-corridor-node` for door-frame
  references, which made browser diagnostics count 15 corridor-node elements:
  9 actual nodes plus 6 door-frame references.
- Door frames now expose their linked corridor node through
  `data-door-corridor-node`, so selectors can distinguish authored corridor
  graph nodes from door alignment metadata.
- `packages/dashboard/tests/spatial-lens-floor-layout.test.mjs` now asserts
  `CORRIDOR_NODES.length === 9`.
- Browser verification after the cleanup reported Focused 1440/1220 and Floor
  Overview 1440 with 6 floorplate zones, 16 building walls, 6 structural
  columns, 8 corridor lanes, 9 corridor nodes, 6 door frames, 6 door corridor
  references, 259 generated sprites, 257 PixelProps, 0 SVG routes, no
  console/page errors, and no horizontal overflow.
- CLASSIC 1220 still reported 0 Spatial Lens floor layers and 0 generated
  sprites.

## Spatial Lens Asset Registry Facts

- `packages/dashboard/src/spatial-lens/assets/assetRegistry.ts` defines the
  optional asset manifest contract for future pixel-office floor, wall,
  furniture, and character layers.
- The registry uses only existing local assets or `src: null` CSS placeholders:
  dashboard floor tiles under `packages/dashboard/public`, the existing
  `/office-fixtures.png` sprite sheet, and existing command-center agent sprite
  PNGs.
- `SPATIAL_LENS_MANUAL_IMPORT_ROOT` documents the future manual-import slot as
  `packages/dashboard/public/spatial-lens`.
- `validateSpatialLensAssetManifest()` rejects duplicate ids, malformed
  required fields, negative animation durations, and remote HTTP(S) asset
  sources.
- `packages/dashboard/tests/spatial-lens-asset-registry.test.mjs` now verifies
  group coverage, local-only sources, existing source files, lookup behavior,
  placeholder fallback behavior, and the manual-import root.
- The registry is exported from `packages/dashboard/src/spatial-lens/index.ts`
  but is not mounted into production routes yet.
- This slice copied no third-party assets and made no backend, approval,
  provider, bridge, scheduler, or task mutation changes.

## Spatial Lens FloorViewport Facts

- `packages/dashboard/src/spatial-lens/model/floorGeometry.ts` now maps
  existing `OfficeRoomPresence` data into typed static floor geometry for the
  new viewport.
- `FloorViewport`, `FloorGrid`, `RoomZone`, and `CorridorLane` live under
  `packages/dashboard/src/spatial-lens/components/` and render the existing
  projected rooms, corridors, focal lanes, room fixtures, task nodes, and
  avatars.
- `packages/dashboard/src/components/OfficeStage.tsx` now defaults to the new
  `Viewport` renderer and keeps the previous renderer reachable as `Classic`
  via `window.sessionStorage["conitens.officeStageMode"]`.
- The new viewport uses the Prompt 2 asset registry for floor and furniture
  asset ids, while continuing to reuse the existing projected dashboard data.
- `packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs` verifies room
  geometry mapping, floor surface selection, fixture asset resolution, and
  stale selection fallback.
- Browser verification at 1440px, 1220px, and 820px reported no console/page
  errors, no horizontal overflow, no checked text overflow, 6 rooms, 4
  corridor/focal lanes, 74 fixtures, and 4 agent buttons.
- Visual evidence lives at
  `output/playwright/spatial-lens-floor-viewport-results.json`,
  `output/playwright/spatial-lens-floor-viewport-1440.png`,
  `output/playwright/spatial-lens-floor-viewport-1220.png`, and
  `output/playwright/spatial-lens-floor-viewport-820.png`.
- This slice made no backend, approval, provider, bridge, scheduler,
  command-center store, `App.tsx`, or task mutation changes.

## Spatial Lens Prompt 3.5 Visual Delta Facts

- Prompt 3's visible change was too small because `VIEWPORT` used a separate
  renderer but retained card-like room styling: heavy per-room frames, beige
  header bands, inset room-floor boxes, and independent shadows.
- `VIEWPORT` and `CLASSIC` now remain separate branches: `CLASSIC` preserves
  the legacy `OfficeRoomScene`/`office-room-tile` map, while `VIEWPORT` renders
  through `FloorViewport`, `RoomZone`, `FloorGrid`, `CorridorLane`, and
  `HandoffOverlay`.
- `PixelOffice` passes existing `office.handoffs` into `OfficeStage`, and
  `OfficeStage` passes them to `FloorViewport`.
- `createFloorViewportModel()` now emits `handoffRoutes` and
  `blockedLaneMarkers`; when no live handoff is available, it creates a
  fallback Ops Control -> Validation Office route.
- `HandoffOverlay.tsx` renders one visible route line, packet marker, and
  blocked-lane barrier on the floor in VIEWPORT mode.
- VIEWPORT room labels are now small in-world dark nameplates and room status
  appears as small room flags rather than large card headers.
- Browser verification at 1440px, 1220px, and 820px reported no console/page
  errors, no horizontal overflow, no checked text overflow, 6 rooms, 4
  corridor/focal lanes, 74 fixtures, 4 agent buttons, 1 handoff route, 1
  packet marker, and 1 blocked-lane marker.
- Visual evidence lives at
  `output/playwright/spatial-lens-viewport-35-results.json`,
  `output/playwright/spatial-lens-viewport-35-1440.png`,
  `output/playwright/spatial-lens-viewport-35-1220.png`, and
  `output/playwright/spatial-lens-viewport-35-820.png`.
- This slice made no canonical runtime, `.notes`, `.agent`, approval,
  provider, bridge, scheduler, command-center store, `App.tsx`, or task
  mutation changes.

## Spatial Lens Prompt 3.7 Room Dressing Facts

- Prompt 3.7 addresses the remaining visual-density gap: Prompt 3.5 separated
  VIEWPORT from CLASSIC and added route/barrier overlays, but room interiors
  still depended on sparse schema fixtures and labels instead of room-specific
  object identity.
- `packages/dashboard/src/spatial-lens/viewport/roomTemplates.ts` now defines
  deterministic templates for all six office rooms with typed theme,
  wall/floor style, door, workstation, floor prop, wall prop, task slot, agent
  slot, blocked-lane slot, and handoff port fields.
- `packages/dashboard/src/spatial-lens/viewport/roomDressing.ts` expands those
  templates into renderable PixelProp specs and exposes helper contracts for
  prop counts, required layer groups, route ports, and blocked-lane slots.
- New small render layers under `packages/dashboard/src/spatial-lens/viewport/`
  are `PixelProp.tsx`, `WallDetailLayer.tsx`, `WorkstationLayer.tsx`,
  `RoomDressingLayer.tsx`, and `OperationalOverlayLayer.tsx`.
- `RoomZone` mounts the dressing layers only inside VIEWPORT room floors and
  exposes `data-room-id`, `data-room-theme`, wall style, and floor style for
  visual diagnostics.
- `floorGeometry.ts` now anchors handoff route endpoints to template
  `routePort` objects and anchors blocked markers to template barrier/cone
  objects when a room template provides them.
- CSS pixel placeholders now cover the required prop kinds: desk, chair,
  monitor, keyboard, laptop, serverRack, fileBox, documentStack, clipboard,
  stampPad, whiteboard, statusBoard, alertLight, plant, shelf, coffeeCup,
  cable, inboxTray, outboxTray, barrier, cone, routePort, sampleRack, machine,
  stickyNote, and bulletinBoard.
- Browser and test prop counts are: Ops Control 44, Impl Office 45, Research
  Lab 32, Validation Office 48, Review Office 34, Central Commons 54, for 257
  total PixelProps.
- Every room has at least 3 wall details and at least 2 workstation/task
  details; Validation Office includes a receiving handoff port.
- `packages/dashboard/tests/spatial-lens-room-dressing.test.mjs` verifies room
  template coverage, density minimums, required prop kind coverage, wall and
  workstation minimums, and operational anchor objects.
- Real browser verification at 1440px, 1220px, and 820px reported no
  console/page errors, no horizontal overflow, no non-empty text overflow, 6
  rooms, 257 PixelProps, 26 prop kinds, 16 route ports, 4 barriers, and 4
  cones.
- CLASSIC fallback remains separate and rendered zero new PixelProps in the
  browser check.
- Evidence lives at
  `output/playwright/spatial-lens-viewport-37-results.json`,
  `output/playwright/spatial-lens-viewport-37-1440.png`,
  `output/playwright/spatial-lens-viewport-37-1220.png`,
  `output/playwright/spatial-lens-viewport-37-820.png`,
  `output/playwright/spatial-lens-viewport-37-hidden-labels-1440.png`, and
  `output/playwright/spatial-lens-viewport-37-classic-1220.png`.
- This slice made no canonical runtime, `.notes`, `.agent`, approval,
  provider, bridge, scheduler, command-center store, `App.tsx`, or task
  mutation changes.

## Spatial Lens Generated Sprite Fidelity Facts

- The generated pixel office visual references now live at
  `docs/design/assets/spatial-lens/generated/spatial-lens-target-mockup.png`,
  `docs/design/assets/spatial-lens/generated/ops-control-room-reference.png`,
  and
  `docs/design/assets/spatial-lens/generated/validation-office-room-reference.png`.
- The generated public asset source lives under
  `packages/dashboard/public/assets/spatial-lens/generated/`.
- `pixel-office-asset-sheet-source.png` is the original generated 1536x1024
  green-screen sheet.
- `pixel-office-asset-sheet.png` is the chroma-keyed transparent source sheet.
- `pixel-office-asset-sheet-1x.png` is the active frontend sheet, 384x256,
  nearest-neighbor downsampled 4:1 for integer UI rendering.
- `docs/design/spatial-lens-pixel-office-reference.md` documents intended
  usage, forbidden treatments, image paths, and the project-owned generated
  asset license note.
- `packages/dashboard/src/spatial-lens/assets/generatedAssetManifest.ts`
  records manual sprite rects, anchors, integer `scale` values, source sheet
  dimensions, and PixelProp mapping for generated furniture/props/characters.
- `packages/dashboard/src/spatial-lens/assets/GeneratedSprite.tsx` renders
  background-position crops with `image-rendering: pixelated`.
- `PixelProp` now resolves generated sprites first and keeps CSS placeholder
  rendering as fallback.
- `HandoffOverlay` now renders generated sprite crops for the in-world packet
  and blocked barrier marker.
- `packages/dashboard/tests/spatial-lens-generated-assets.test.mjs` verifies
  the generated sheet path exists, source rects stay in bounds, required
  sprites exist, and critical PixelProp mappings resolve.
- Browser diagnostics for this slice reported 259 generated sprite nodes in
  Focused and Floor Overview, 257 PixelProps, 0 SVG routes, no console/page
  errors, no horizontal overflow, Focused `cameraZoom: "3"`, Overview
  `cameraZoom: "1"`, and Classic fallback with 0 generated sprites.
- Evidence lives at
  `output/playwright/spatial-lens-generated-assets-results.json`,
  `output/playwright/spatial-lens-generated-assets-focused-1440.png`,
  `output/playwright/spatial-lens-generated-assets-focused-1440-floor.png`,
  `output/playwright/spatial-lens-generated-assets-focused-1220.png`,
  `output/playwright/spatial-lens-generated-assets-focused-1220-floor.png`,
  `output/playwright/spatial-lens-generated-assets-overview-1440.png`,
  `output/playwright/spatial-lens-generated-assets-overview-1440-floor.png`,
  and `output/playwright/spatial-lens-generated-assets-classic-1220.png`.
- The current topology and `3x` focused camera can show Ops Control plus nearby
  corridor/Impl Office, but cannot fully frame both Ops Control and Validation
  Office at once without a camera/layout tradeoff.
- This slice made no canonical runtime, `.notes`, `.agent`, provider, approval,
  bridge, scheduler, command-center store, `App.tsx`, or task mutation changes.

## Spatial Lens Building Shell Composition Facts

- The layout/background-only generated reference now lives at
  `docs/design/assets/spatial-lens/generated/building-floorplate-layout-reference.png`.
- `packages/dashboard/src/spatial-lens/viewport/floorLayout.ts` defines the
  VIEWPORT building shell: bounds, 6 floorplate zones, 16 wall segments, and 6
  structural columns.
- `packages/dashboard/src/spatial-lens/viewport/corridorGraph.ts` defines a
  7% central corridor spine, 6 room connection stubs, 1 handoff hub pad,
  corridor nodes, door-aligned handoff routing, corridor hit testing, and
  corridor-anchored blocked lane placement.
- `packages/dashboard/src/spatial-lens/viewport/roomPlacement.ts` defines
  VIEWPORT-only door placements for all six rooms. This does not mutate
  canonical room/runtime truth.
- New render layers under `packages/dashboard/src/spatial-lens/components/`
  are `BuildingShellLayer.tsx`, `FloorplateLayer.tsx`,
  `CorridorLayer.tsx`, and `DoorFrameLayer.tsx`.
- `FloorViewport` now renders the layers in a separated stack: floorplate,
  shell, corridor, handoff overlay, room placement, and door frames.
- `floorGeometry.ts` now uses `FLOOR_CORRIDOR_SEGMENTS` rather than the old
  wide `OFFICE_STAGE_CORRIDORS` rectangles for VIEWPORT corridor rendering.
- Handoff route points now run through door thresholds and the central handoff
  hub. The generic blue route line was reduced to a lower-profile floor route
  channel.
- Blocked lane marker placement now comes from `getBlockedLaneCorridorPoint()`,
  so blocked work appears as a physical corridor obstruction instead of a room
  interior prop.
- Old room schema door glyphs are hidden in VIEWPORT; door frames are rendered
  from `DoorFrameLayer` so they align to the corridor graph.
- `packages/dashboard/tests/spatial-lens-floor-layout.test.mjs` verifies the
  connected floorplate, 7% corridor width, room door placements, hub route, and
  corridor-anchored blocked lane.
- `packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs` now verifies
  1 central corridor, 6 stubs, 1 hub, layout zones, and corridor-based route
  points.
- Browser diagnostics for this pass reported Focused `cameraZoom: "3"`,
  Overview `cameraZoom: "1"`, 6 floorplate zones, 16 building walls, 6
  columns, 8 corridor lanes, 15 corridor nodes, 6 door frames, 259 generated
  sprites, 257 PixelProps, 0 SVG routes, no console/page errors, and no
  horizontal overflow.
- Evidence lives at
  `output/playwright/spatial-lens-building-shell-results.json`,
  `output/playwright/spatial-lens-building-shell-focused-1440.png`,
  `output/playwright/spatial-lens-building-shell-focused-1440-floor.png`,
  `output/playwright/spatial-lens-building-shell-focused-1220.png`,
  `output/playwright/spatial-lens-building-shell-focused-1220-floor.png`,
  `output/playwright/spatial-lens-building-shell-overview-1440.png`,
  `output/playwright/spatial-lens-building-shell-overview-1440-floor.png`,
  and `output/playwright/spatial-lens-building-shell-classic-1220.png`.
- Remaining visual gap: room interiors are still dense, especially around wall
  prop repetition. The next visual slice should reduce/cluster room dressing
  and add walk-path constraints rather than increasing prop count.
- This slice made no canonical runtime, `.notes`, `.agent`, provider,
  approval, bridge, scheduler, command-center store, `App.tsx`, HUD, or task
  mutation changes.

## Agent Systems Comparison Facts

- The comparison baseline is Conitens `main` at
  `2c25a9e2aa998fe16edaa83792c52a9db14f2d3c`; the working tree already had
  local uncommitted changes when this research began.
- External snapshots inspected:
  - Agentland `0a57e92cff793ac81d77cbf494cdea44bbc4fee8`
  - Maestro `575efd0dccc7076c5df035813627cc0445e72d54`
  - Optio `9f5abb9de7f7bc07beeff8b79939505798ac1ed3`
  - Agent Squad `db10bf56aafcca4f04806be8e06c4d02eb4da2da`
  - AutoGen `027ecf0a379bcc1d09956d46d12d44a3ad9cee14`
  - Claw3D `eeb6f31f06c6c9a9f32bf359339fe547d5b92c47`
  - Pixel Agents `17ad25ddbfad3392628a2d91b5303335cc5c4923`
  - CLI-JAW `358c8511aa254d5dd0ce055f570f4e953f6d9ab8`
- Agentland is strongest as a provider-call observability reference: model,
  token, cost, latency, PII, lineage, policy, and compliance fields should
  inform Conitens event/projection additions before any proxy rewrite.
- Optio is strongest as a reconciler and PR/CI feedback-loop reference:
  Conitens should adapt pure decision, stale-state protection, and periodic
  resync for operator tasks before considering auto-merge behavior.
- Maestro and CLI-JAW are strongest as operator-UX references for multi-CLI
  session management, worktree-aware execution, install/doctor evidence,
  keyboard-first navigation, and runtime status.
- Agent Squad and AutoGen should be treated as routing/supervisor pattern
  references, not Conitens core dependencies.
- Claw3D and Pixel Agents are useful for runtime seam, transcript-derived
  status, layout/asset, and spatial diagnostics ideas, but Conitens should not
  recentre the product on spatial UI.
- AutoGen is now maintenance-mode according to its current README, so new
  Conitens work should not depend on it for core orchestration.
- Pixel Agents documents a Claude launch path that bypasses tool approval
  prompts; this is explicitly unsuitable for Conitens because approval and
  verify gates remain core safety boundaries.
- Full findings and backlog now live in
  `docs/AGENT_SYSTEMS_COMPARISON_2026-06-06.md` and
  `.conitens/reviews/agent_systems_comparison_2026-06-06.md`.
- A static HTML version now lives at
  `docs/AGENT_SYSTEMS_COMPARISON_2026-06-06.html`; it reorganizes the Markdown
  report into executive summary, pinned source snapshots, feature gap matrix,
  P0/P1/P2 backlog, guardrails, and source links.

## Agent Systems P0 Evidence Foundation Facts

- The first implementation slice from the agent-systems comparison is now
  projection-first and read-only.
- `scripts/ensemble_forward_bridge.py` now exposes provider-call evidence
  through `GET /api/operator/evidence-summary`, install/runtime doctor evidence
  through `GET /api/operator/doctor-evidence`, and task reconciliation guidance
  through `GET /api/operator/tasks/:id/reconcile-preview`.
- `GET /api/operator/summary` now includes optional `evidence` and `doctor`
  blocks, while dashboard parsers still accept legacy summary payloads with
  those blocks absent.
- Provider evidence is derived from orchestration checkpoints and retry
  decisions, including model/provider, token, latency, cost, retry, approval,
  and PII-sensitivity posture when those metrics exist.
- The provider evidence projection explicitly avoids exposing raw prompt or
  completion content.
- Doctor evidence is a read-only local runtime/install projection covering loop
  state, active runtime contract, Python, Node, dashboard package manifest,
  bridge auth boundary, and events projection health.
- Doctor evidence records that bridge auth is required without returning the
  actual bearer token.
- Task reconcile preview is a pure recommendation surface: it reads the task,
  linked run, pending approvals, validator history, stale-run age, and blocked
  handoffs, then returns a recommended status, blockers, suggested actions, and
  evidence refs without mutating the task or approval records.
- The reconcile-preview route must remain registered before the generic
  `/api/operator/tasks/:id` detail route.
- Dashboard overview now renders evidence-health and doctor-evidence sections
  via the existing operator summary panel.
- Dashboard task detail now renders a separate read-only reconcile preview panel
  instead of mixing recommendation state into the mutable task form.
- `packages/protocol/src/event.ts` and `scripts/ensemble_allowed_events.py` now
  include canonical validation/insight event types and legacy aliases for
  approval, validator, room/tool, handoff, and insight fixtures used by existing
  evidence tests.
- Native sidecar agents were used for read-only architecture and frontend UX
  review; their key recommendations were preserving approval boundaries,
  keeping the preview read-only, routing reconcile-preview before task detail,
  and avoiding a new inbox kind until it has a navigable surface.

## Agent Systems P1 Wake-Readiness Dashboard Facts

- The wake-readiness backend projection is now consumed by the dashboard
  overview through `forwardGetOperatorWakeReadiness()`.
- `packages/dashboard/src/forward-bridge-types.ts`,
  `packages/dashboard/src/forward-bridge-parsers.ts`, and
  `packages/dashboard/src/forward-bridge-client.ts` carry the dashboard-side
  API contract for `/api/operator/wake-readiness`.
- `packages/dashboard/src/operator-wake-readiness-model.ts` converts
  wake-readiness payloads into overview metrics, candidate rows, source labels,
  privacy labels, and evidence target hashes.
- `packages/dashboard/src/components/OperatorWakeReadinessPanel.tsx` renders the
  projection on `#/overview` with existing `forward-section` styling.
- The overview fetch path is live-bridge only; demo mode and office preview keep
  the panel idle.
- The dashboard still stores the bearer token in memory only; the new
  wake-readiness fetch reuses the existing bridge config and authorization
  boundary.
- The dashboard slice adds no scheduler, wake-message sender, provider-auth
  command, external fetch, event append, task/run/room mutation, or approval
  bypass control.
- Browser verification captured
  `output/playwright/wake-readiness-overview-1220.png` after connecting a live
  local bridge; the bridge log showed authenticated 200 responses for
  `/api/operator/wake-readiness?limit=12`.

## Agent Systems P1 Wake Scheduler Design Gate Facts

- `docs/frontend/WAKE_SCHEDULER_DESIGN.md` now defines the required safety
  contract before any live wake scheduler implementation.
- The design gate keeps the existing `wake-readiness` projection read-only and
  separates it from future wake actions such as wake messages, run resume,
  status mutation, external fetches, or provider launches.
- The proposed first implementation slice is limited to
  `ensemble forward wake-plan --dry-run`, optionally mirrored by
  `GET /api/operator/wake-plan`.
- Future wake actions must require explicit approval-by-id and must fail closed
  for missing, stale, resolved, mismatched, or auth/reviewer-mismatched
  approvals.
- Future approved actions must re-read local evidence immediately before
  execution and reject stale evidence, ref mismatches, new blockers, missing
  runtimes, and raw-content payload fields.
- Future write slices must remain event-first: validate, build bounded payload,
  reject raw-content fields, append through the event path, and only then update
  projections or derived state.
- Wake plan/action payloads may include ids, statuses, confidence levels,
  reason/blocker codes, bounded evidence refs, source projection names, counts,
  timestamps, runtime names, and reviewer identity labels only.
- Wake plan/action payloads must not include prompt/completion/request/response
  content, raw transcripts, tool payload values, approval payload values,
  validator issue bodies, raw PR/CI logs/diffs/comments/output, tokens,
  credentials, environment dumps, or unsanitized URLs.
- This slice added no scheduler, wake-message sender, resume control, provider
  auth command, external fetch, event append, artifact write, `.notes` write,
  protocol registry change, dashboard execution control, or task/run/room
  mutation.

## Dashboard GUI Verification Facts

- A production dashboard build was run before the GUI check and completed
  successfully.
- The GUI check launched a real local forward bridge at
  `http://127.0.0.1:8810/api` and a dashboard preview at
  `http://127.0.0.1:4310`.
- Browser automation connected the overview setup form with the emitted bridge
  token and verified that `Wake readiness` rendered from the live bridge.
- Automated diagnostics for overview desktop (`1440px`), tablet (`820px`), and
  mobile (`390px`) reported no horizontal overflow, no console errors, no page
  errors, and no checked button/link/chip text overflow.
- Automated diagnostics for office preview (`1220px`) reported no horizontal
  overflow, no console errors, and no page errors. It flagged a tiny avatar-slot
  text overflow in pixel-room buttons, but visual inspection did not show a
  blocking rendering defect.
- Screenshot evidence exists at:
  - `output/playwright/gui-check-overview-1440.png`
  - `output/playwright/gui-check-overview-820.png`
  - `output/playwright/gui-check-overview-390.png`
  - `output/playwright/gui-check-office-preview-1220.png`
- Non-blocking GUI polish candidates:
  - After a successful live bridge connection, the setup form remains expanded
    and takes noticeable vertical space on mobile.
  - Some office-preview rail metadata is intentionally low-priority but appears
    close to the lower contrast edge on the dark background.
- This GUI verification slice made no runtime or product code changes.

## Dashboard GUI Polish Facts

- The live bridge setup form now collapses after submitting a non-empty bearer
  token.
- The header status row now includes a `Bridge settings` / `Hide settings`
  toggle so operators can reopen the setup form without keeping it in the
  primary live overview.
- The shared setup panel now renders only when explicitly opened, including the
  overview and approvals routes.
- Pixel Office sidebar rail rows now use shell-appropriate text and divider
  contrast instead of the lower-contrast legacy `var(--text)` rail color.
- Pixel Office rail section counts, focus metadata, focus pills, and overflow
  chips have slightly stronger contrast while keeping the dark operational
  tone.
- Pixel room avatar slots are now 34px wide, clearing the previous small
  text-overflow diagnostic without introducing visible stage clutter.
- Browser verification after the patch reported:
  - `setupVisibleAfterConnect: 0`
  - `settingsButtonVisible: 1`
  - no console errors
  - no page errors
  - no horizontal overflow on overview desktop/mobile or office preview
  - no checked text overflow on overview desktop/mobile or office preview
- Refreshed evidence lives at:
  - `output/playwright/gui-polish-check-results.json`
  - `output/playwright/gui-polish-overview-1440.png`
  - `output/playwright/gui-polish-overview-390.png`
  - `output/playwright/gui-polish-office-preview-1220.png`

## Pixel Office Reference-Quality Visual Facts

- The Pixel Agents reference was used as an art-direction quality bar only:
  Conitens copied no external Pixel Agents assets and added no new dependency.
- `packages/dashboard/src/components/OfficeStage.tsx` now renders
  `OFFICE_STAGE_CORRIDORS`, `OFFICE_STAGE_FOCAL_LANES`, and
  `OFFICE_STAGE_CORRIDOR_FIXTURES` as part of the stage background before room
  tiles.
- `packages/dashboard/src/components/OfficeRoomScene.tsx` now honors each
  room schema's `x`, `y`, `w`, and `h` percentages, so the schema controls the
  spatial floorplate instead of the previous CSS-grid placement.
- `packages/dashboard/src/components/OfficeAvatar.tsx` keeps the existing sprite
  source resolution but displays avatars at a larger pixel-art size.
- `packages/dashboard/src/office-stage.module.css` now makes the stage a dark
  tiled floorplate with corridor layers, room-wall bevels, pixel drop shadows,
  larger room fixtures, larger task markers, larger avatar rings, and darker
  room label/stat text.
- Real browser verification for the preview on port `4312` reported zero
  console/page errors, zero horizontal overflow, zero checked text overflow, 6
  rooms, 74 fixtures, 4 avatars, 2 corridors, and 2 focal lanes at 1440px,
  1220px, and 820px captures.
- Pixel Office evidence lives at:
  - `output/playwright/pixel-agents-quality-results.json`
  - `output/playwright/pixel-agents-quality-office-1440.png`
  - `output/playwright/pixel-agents-quality-office-1220.png`
  - `output/playwright/pixel-agents-quality-office-820.png`

## Spatial Lens Pixel Office Planning Facts

- The attached frontend review was decoded as UTF-8 and maps the next safe work
  to Prompt 0: audit-only plan first, no production UI changes.
- Pixel Agents current README describes the relevant reference traits as
  character-based agent visualization, live activity tracking, office layout
  editing, speech bubbles, persistent layouts, external asset directories, and
  a lightweight game loop with canvas rendering, BFS pathfinding, and character
  state machines.
- `docs/design/spatial-lens-pixel-office-plan.md` now captures the Conitens
  migration plan from the current Spatial Lens preview toward an agent-first
  pixel office shell.
- Current dashboard Spatial Lens path is
  `packages/dashboard/src/components/PixelOffice.tsx`, with `OfficeStage`,
  `OfficeRoomScene`, and `OfficeSidebar` as the immediate render surfaces.
- Current dashboard projection/data owners for the office are
  `packages/dashboard/src/dashboard-model.ts`,
  `packages/dashboard/src/office-presence-model.ts`,
  `packages/dashboard/src/office-stage-schema.ts`,
  `packages/dashboard/src/office-fixture-registry.ts`,
  `packages/dashboard/src/office-sidebar-view-model.ts`, and
  `packages/dashboard/src/store/event-store.ts`.
- `.vibe/context/LATEST_CONTEXT.md` and sampled headers confirm
  `packages/command-center/src/store/spatial-store.ts`,
  `packages/command-center/src/store/agent-store.ts`,
  `packages/command-center/src/store/task-store.ts`,
  `packages/command-center/src/data/building.ts`, and
  `packages/command-center/src/components/HUD.tsx` are reference/hotspot
  surfaces, not places to expand for this dashboard redesign.
- The next implementation slice should be Prompt 1 only: reusable
  pixel-control-plane primitives and tokens that do not change data flow or
  screen behavior.

## Spatial Lens Pixel Primitives Facts

- Prompt 1 is complete: reusable pixel-control-plane tokens and primitives now
  exist without being mounted into production routes.
- `packages/dashboard/src/spatial-lens/tokens.ts` defines the limited status
  palette: `live`, `active`, `review`, `blocked`, `idle`, and `success`.
- `normalizePixelStatusTone()` maps live/running to blue-live, active/working
  to green-active, review/assigned/waiting to amber-review, blocked/error/failed
  to red-blocked, done/completed/passed to success, and unknown/quiet states to
  idle.
- `packages/dashboard/src/spatial-lens/components/PixelPrimitives.tsx` exports
  `PixelThemeProvider`, `PixelFrame`, `PixelPanel`, `PixelButton`,
  `StatusPill`, `PixelDivider`, and `PixelTooltip`.
- `packages/dashboard/src/spatial-lens/styles/pixel-primitives.module.css`
  carries the dark operator shell variables, hard pixel borders, compact
  radius, and status tone classes for later FloorViewport/HUD/Inspector work.
- `packages/dashboard/src/spatial-lens/index.ts` is the import surface for the
  new primitives and token helpers.
- `packages/dashboard/tests/spatial-lens-primitives.test.mjs` covers the token
  palette and status normalization contract.
- Dashboard tests passed with 85 tests and dashboard production build passed
  after adding the primitives.
- The next implementation slice should be Prompt 2 only: a minimal optional
  asset registry/manual-import MVE with no third-party asset copy and no route
  wiring.
- Next Pixel Office design direction:
  - add a compact selected-room focus strip above the map
  - clarify rail hierarchy around focus, active lanes, and supporting queues
  - strengthen selected room/resident affordance with one consistent accent
  - keep the pixel map full-width and avoid wrapping the stage in extra cards

## Forward Doctor Evidence CLI Facts

- The next P0 install/doctor slice is now exposed through
  `python scripts/ensemble.py --workspace . forward doctor-evidence`.
- The command reuses the forward doctor projection and adds bounded runtime CLI
  availability/version probes for Python, Node, pnpm, Git, Codex, Claude,
  Gemini, and OpenCode.
- Default `doctor-evidence` output is stdout only; it does not create
  `.omx/artifacts/forward-doctor-evidence/` unless `--write-artifact` is
  supplied.
- `--write-artifact` is an explicit workspace mutation, not part of the
  read-only default surface. It writes JSON and Markdown evidence under
  `.omx/artifacts/forward-doctor-evidence/` and records provenance in
  `.notes/artifacts/manifest.jsonl`.
- The doctor evidence payload intentionally reports `workspace_root` as `.`,
  redacts workspace-contained paths to relative labels, and reduces external
  executable paths to basenames or `PATH:<tool>` references.
- Runtime version probes capture only a first-line, 200-character bounded
  string after secret-pattern redaction; outputs containing paths or email-like
  identifiers are dropped.
- Provider auth commands are not executed by this evidence flow, and the
  payload explicitly records that no environment dump or auth-token exposure is
  performed.
- Artifact writing refuses a symlinked
  `.omx/artifacts/forward-doctor-evidence` directory that resolves outside the
  workspace.
- A security-review sidecar flagged path leakage, read-only contract ambiguity,
  and PATH-probe output risk; those findings were addressed before closing the
  slice.

## Forward Evidence Verification Stabilization Facts

- On Windows, `shutil.which("node")` did not reliably select a test-local
  `node.cmd` fixture ahead of the installed Node runtime during doctor evidence
  probe redaction coverage.
- `scripts/ensemble_forward.py` now resolves exact PATH entries before
  `shutil.which()` and expands PATHEXT candidates for suffixless commands on
  Windows, so runtime probe fixtures and real command lookup follow PATH order.
- The doctor evidence redaction regression test now creates `node.cmd` on
  Windows and an executable `node` shell script on POSIX, preserving the same
  secret/path leakage assertion across platforms.
- `/api/operator/summary` was vulnerable to slow responses because it embedded
  the runtime roster and therefore ran detailed external CLI version probes
  during a broad overview request.
- `build_operator_runtime_roster_payload()` now accepts `probe_versions`; the
  standalone `/api/operator/runtime-roster` route keeps detailed bounded
  version probes, while the summary route embeds a lightweight availability /
  checkpoint roster without version probes.
- The local dashboard build initially failed because workspace dependencies had
  not been restored and `tsc` was unavailable to the dashboard package; running
  `CI=true pnpm install --frozen-lockfile` restored the locked dependency set.

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

## Dashboard UI Review Ultrawork Facts

- The dashboard task quick-status path now builds its mutation body from the
  persisted selected task record instead of the potentially dirty editor draft.
- `packages/dashboard/src/operator-task-actions.ts` now centralizes task draft
  mutation bodies and status-only mutation bodies so this behavior is
  regression-testable.
- The `/runs` loader in `packages/dashboard/src/App.tsx` now depends on
  `liveRevision`, so SSE snapshots and manual `r` refreshes update the runs rail
  instead of only refreshing detail panels.
- The dashboard shell header now separates route navigation from bridge status,
  uses `nav`, `aria-current`, `role=status`, and tablist/tab/tabpanel semantics
  for the agent and run-detail tabs.
- The task list row has better mobile/accessibility affordances through
  labelled selection checkboxes, grouped task rows, explicit button type, and a
  mobile card grid that brings detail content into view earlier.
- `packages/dashboard/tests/forward-bridge.test.mjs` now covers the updated
  route object contract and the task quick-status persisted-state regression.
- Visual verification artifacts for this pass were captured at
  `output/playwright/ui-fix-tasks-820.png` and
  `output/playwright/ui-fix-overview-1440.png`.

## Dashboard UI Review Follow-up Facts

- `packages/dashboard/src/App.tsx` now separates live stream snapshot refreshes
  from manual / mutation refreshes: stream snapshots increment a detail-focused
  `streamRevision`, while `/runs` continues to follow `liveRevision`. This
  prevents linked task/run streams from forcing the run rail back to `loading`
  on every snapshot.
- The global `#/approvals` route now renders a first-class approvals surface
  instead of falling through to generic run-detail content. In demo/no-token
  mode it shows a clear live-bridge-gated message because approval records are
  sensitive operational data.
- `#/agents/:id`, `#/threads`, and `#/threads/:id` now render explicit deferred
  route states with back navigation rather than misleading run-detail
  placeholders.
- Agent and run-detail tab controls now handle ArrowLeft, ArrowRight, Home, and
  End keyboard navigation in addition to their ARIA tab semantics.
- Bridge telemetry chips now use a quieter status style, and only the live
  connection chip is a live region. Static API/token text is no longer
  re-announced with every live status change.
- The `820px` task queue layout is back to a single-column operator queue,
  preserving the linear triage scan pattern while keeping selection controls
  visible.
- `packages/dashboard/src/components/ForwardApprovalCenterPanel.tsx` now allows
  unfiltered approval listing for the global approvals route while preserving
  run/task-scoped filtering where those ids are supplied.
- Follow-up browser verification artifacts were captured at:
  `output/playwright/ui-fixes-overview-1440.png`,
  `output/playwright/ui-fixes-tasks-820.png`,
  `output/playwright/ui-fixes-approvals-1220.png`, and
  `output/playwright/ui-fixes-agent-deferred-1220.png`.

## Dashboard Insane-Design Apply Facts

- The dashboard visual refinement used the bundled
  `insane-design-codex/examples/linear/design.md` as the primary reference,
  with `retool` and `posthog` considered but not adopted because the forward
  shell is a dense operator tool rather than a warm marketing/docs surface.
- `packages/dashboard/src/styles/tokens.css` now carries a Linear-like
  near-black neutral ramp, restricted indigo accent, 6px control radius, 8px
  panel radius, 160ms motion, and a layered low shadow token.
- `packages/dashboard/src/styles/shell.css` removes the broad cyan/green radial
  glows from the forward shell background, reduces the shell heading scale,
  sets shell heading letter spacing to zero, and aligns route chips, telemetry,
  forms, tabs, onboarding, and demo banner controls to the new token layer.
- `packages/dashboard/src/styles/live-panels.css` tightens panel density and
  applies the shared radius/accent treatment to sidebar/detail panels, run rows,
  timeline cards, stats, quick action chips, and task selection controls.
- Edited CSS passed grep checks for the relevant insane-design DON'T patterns:
  no `radial-gradient`, old cyan accent hexes, `border-radius: 14px`, or
  negative/high shell letter-spacing remain in the touched shell styles.
- Visual verification artifacts for this pass were captured at
  `output/playwright/insane-design-overview-1440.png` and
  `output/playwright/insane-design-tasks-820.png`.

## Spatial Lens + Agents Coherence Facts

- `#/office-preview` now frames its summary as `Current floor posture`, with
  live rooms, blocked lanes, active handoffs, selected focus, and a concise
  reason line derived from the existing office presence projection.
- The Spatial Lens rail now starts with the selected room/resident focus card,
  followed by active agents, task queue, and handoffs, so selection results are
  visible before the long operational lists.
- Spatial Lens resident focus exposes `Open in Agents` / `View in Agents`
  affordances that navigate to `#/agents?agent=<id>`.
- `#/agents/:id` remains a deferred unsupported detail route; the coherence
  pass uses `#/agents?agent=<id>` to keep selected-agent state inside the
  existing agents surface.
- The Agents fleet now sorts by operational attention: needs review, running,
  blocked, stable, then dormant, with pending approvals and task volume as
  tie-breakers.
- The Agents profile now starts with `Current assignment`, including room,
  latest run, run status, and workspace, and the room chip navigates back to
  `#/office-preview` with the room focus stored in browser session storage.
- Disabled Pause / Resume / Retire controls were removed from the profile
  surface because lifecycle mutation controls remain deferred.
- The relationship tab is now explicitly labelled as a read-only demo
  coordination map with deferred live graph editing, rather than implying a
  mutable graph surface.
- Visual verification artifacts for this pass were captured at
  `output/playwright/coherence-office-1440.png`,
  `output/playwright/coherence-office-820.png`,
  `output/playwright/coherence-agents-1440.png`,
  `output/playwright/coherence-agents-820.png`, and
  `output/playwright/coherence-agents-relationships-1440-full.png`.

## Agent Systems P0 Completion Slice Facts

- `docs/AGENT_SYSTEMS_COMPARISON_2026-06-06.html` is now regenerated as a
  readable UTF-8 Korean static report. The document preserves the comparison
  baseline, executive findings, gap matrix, P0/P1/P2 backlog, guardrails, and
  source snapshot facts from the Markdown artifact without touching product
  runtime behavior.
- `packages/protocol/src/event.ts` now includes canonical event type
  `provider.call_recorded`, a `ProviderCallRecordedPayload` interface, and a
  forbidden raw-content field list for provider telemetry.
- `scripts/sync_event_types.py` regenerated `scripts/ensemble_allowed_events.py`
  with 141 event types, including `provider.call_recorded`.
- `scripts/ensemble_events.py` now rejects `provider.call_recorded` payloads
  containing raw prompt, completion, content, messages, request, response, or
  `*_content` fields before append-only event writes occur.
- `scripts/ensemble_forward_bridge.py` now reads provider-call event rows and
  legacy `loop_cost_metrics_json` checkpoint rows for evidence summary.
  Provider-call events are the preferred source when present; checkpoint rows
  remain available as fallback provenance.
- Provider token aggregation now prefers `total_tokens` over summing
  input/output tokens, avoiding double-counting canonical provider events.
- `scripts/ensemble_operator_reconciler.py` is a new pure decision module. It
  accepts task, linked run, approvals, validator history, blocked handoffs, and
  stale-age input, then returns `recommended_status`, `confidence`, blockers,
  suggested actions, approval requirement, evidence refs, and a deterministic
  `decision_id`.
- The forward bridge reconcile-preview endpoint is now a repository adapter
  around the pure reconciler and remains read-only.
- Dashboard reconcile-preview parsing and view-model contracts now carry the
  backend `decision_id`; demo fallback data was updated to satisfy the same
  type contract.
- P1 PR/CI evidence ingestion remains the next candidate. The next slice should
  attach read-only GitHub/CI evidence to task detail and avoid auto-merge,
  unattended resume, and auth command execution.

## Agent Systems P1 PR/CI Evidence Slice Facts

- `packages/protocol/src/event.ts` now includes canonical
  `pr.evidence_observed` and `ci.evidence_observed` event types plus bounded
  PR/CI evidence payload contracts.
- `scripts/sync_event_types.py` regenerated
  `scripts/ensemble_allowed_events.py` with 143 event types, including the new
  PR/CI evidence events.
- `scripts/ensemble_events.py` now rejects PR/CI evidence payloads that include
  raw logs, diffs, patches, PR bodies, comments, reviews, tokens, secrets, or
  similar raw external content before append-only writes occur.
- The raw-field guard normalizes common snake_case, camelCase, and compact key
  variants so fields like `raw_log`, `rawLog`, `reviewBody`, and `authToken`
  are treated as forbidden.
- `scripts/ensemble_forward_bridge.py` now projects PR/CI evidence into
  operator task detail from local append-only events only; this slice performs
  no external GitHub or CI API fetch.
- PR/CI evidence is scoped to the canonical operator task through `task_id`, or
  to the task's linked execution through `run_id` / `conitens_run_id`.
- The PR/CI projection sanitizes evidence URLs by removing credentials, query
  strings, and fragments before exposing links to the dashboard.
- Task detail PR/CI evidence reports bounded posture, counts, suggestions,
  privacy metadata, and evidence rows; it does not mutate task status, resume a
  run, request provider auth, or attempt merge behavior.
- `packages/dashboard` parser, type, view-model, demo fallback, and
  `OperatorTaskDetailPanel` now carry and render the read-only PR/CI evidence
  block.
- Regression coverage now checks raw PR/CI content rejection, event scoping,
  URL sanitization, commit shortening, unrelated-event exclusion, dashboard
  parsing, and dashboard view-model mapping.

## Agent Systems P1 PR/CI Evidence Producer Facts

- `ensemble forward append-pr-ci-evidence --input <json>` is now the explicit
  first producer for PR/CI evidence events.
- The producer accepts reviewed local JSON only; it does not call GitHub, CI,
  provider auth commands, or any external service.
- Input may be a single object, an array of objects, or an object containing an
  `items` array.
- Every evidence item must resolve to `pr.evidence_observed` or
  `ci.evidence_observed`, include `provider`, `status`, and a canonical
  operator `task_id`, and the task must already exist in `operator_tasks`.
- If an input item supplies `run_id` / `conitens_run_id`, it must match the
  task's linked run when the task has one; otherwise the producer inherits the
  task's linked run id.
- URL metadata is sanitized before append, removing credentials, query strings,
  and fragments from event payloads.
- Unknown fields are rejected to prevent accidental external-data leakage.
- Raw external-content fields are rejected before any event is written, and the
  existing append-time guard remains in place as a second boundary.
- `scripts/ensemble_events.py` now exposes
  `external_evidence_forbidden_payload_fields()` so producer paths can validate
  the whole input batch before append.
- The producer normalizes and validates all input items before writing events,
  so a rejected batch leaves no partial PR/CI evidence events behind.
- CLI output is bounded to event ids, counts, task/run refs, status/conclusion,
  and privacy booleans.
- The existing task-detail `pr_ci_evidence` projection immediately picks up
  events produced by this command.

## Agent Systems P1 PR/CI Local Export Importer Facts

- `ensemble forward import-pr-ci-evidence --input <json> --task-id <id>` is now
  the first read-only local importer for PR/CI evidence.
- The importer converts local GitHub PR and GitHub Actions export JSON into the
  reviewed `items` shape accepted by `append-pr-ci-evidence`.
- Supported input shapes include a single object, an array, and common wrappers
  such as `pull_request`, `workflow_runs`, `runs`, `check_runs`, and `items`.
- The importer requires a canonical operator task id and reads task state only
  to validate task existence and linked-run scope.
- If `--run-id` is supplied and the task already has `linked_run_id`, the ids
  must match; otherwise the import fails before output.
- If `--run-id` is omitted, the task's linked run id is inherited into the
  prepared evidence items when available.
- Import output is validated through the same producer normalization path before
  it is returned, so the generated `items` payload is append-compatible.
- Import is read-only: it does not append events, mutate tasks, call external
  APIs, run provider auth commands, or inspect the environment.
- URL fields are sanitized before output, removing credentials, query strings,
  and fragments.
- Raw source-export fields such as PR body, logs, comments, diffs, patches,
  output, and text are ignored and not retained in output.
- Tests now prove the two-step flow: import produces sanitized reviewed items
  with no event writes, then append records those items and task-detail
  projection displays them.

## Agent Systems P1 PR/CI Operator Docs Facts

- `docs/frontend/PR_CI_EVIDENCE_WORKFLOW.md` now documents the local
  import-review-append PR/CI evidence workflow.
- The workflow doc names the implemented commands:
  `ensemble forward import-pr-ci-evidence` and
  `ensemble forward append-pr-ci-evidence`.
- The documented flow keeps import read-only and makes append the explicit
  event-log write step.
- The doc lists supported local export shapes, common GitHub PR fields, common
  GitHub Actions fields, required task/run scoping, privacy checks, and
  troubleshooting messages.
- The examples avoid real tokens and keep raw PR bodies, comments, diffs,
  patches, logs, reviews, and token fields out of the documented append path.
- `docs/frontend/FORWARD_OPERATOR_USAGE.md` now links to the dedicated PR/CI
  evidence workflow and includes the compact two-command sequence.

## Agent Systems P1 PR/CI Evidence Redaction Patch Facts

- A code/security review found that `import-pr-ci-evidence` stripped unsafe URL
  parts and omitted raw fields, but still returned token-like strings when they
  appeared inside allowed metadata values such as PR titles, workflow names, or
  branches.
- The append path also built CLI summaries from pre-redaction normalized
  payloads, so manually reviewed JSON could leak token-like metadata to stdout
  even though the stored event payload was redacted.
- `scripts/ensemble_forward.py` now redacts reviewed metadata values before
  import output and uses the redacted `append_event()` payload for append
  summaries.
- The importer now reports the effective inherited `run_id` at the top level
  when a task has a linked run and `--run-id` is omitted.
- The shared `sk-...` redaction regex was narrowed so `otask-...` identifiers
  are no longer partially redacted.
- Regression coverage now checks metadata token redaction, identifier
  preservation, inherited `run_id` reporting, no import event writes, and
  import-to-append compatibility.

## Agent Systems P1 Runtime Roster CLI Slice Facts

- The existing `/api/operator/runtime-roster` bridge payload is now reusable
  from `ensemble forward runtime-roster`.
- The CLI action returns `kind: forward_runtime_roster`, `workspace_root: .`,
  `probe_versions`, runtime rows, counts, and the same privacy block as the
  bridge payload.
- `--no-version-probe` skips short version probes while preserving command
  availability and checkpoint-observation metadata.
- The command is read-only: it writes no events, writes no artifacts, does not
  dump the environment, and does not run provider auth commands.
- Regression coverage verifies the JSON shape, privacy booleans, no event
  writes, no doctor artifact directory, and no workspace/auth leakage in CLI
  output.

## Agent Systems P1 Turn Records Projection Slice Facts

- Existing room messages and tool events already form a persisted per-turn
  source in SQLite; this slice adds a read-only projection instead of a new
  table or wake scheduler.
- `build_operator_turn_records_payload()` combines room messages and tool
  events, sorts them by creation time, bounds returned rows, and reports counts
  plus wake-source summaries.
- Turn record rows expose scope, sender/tool metadata, message type, content
  length, metadata keys, payload keys, and evidence refs.
- Turn record rows deliberately omit message content, tool payload values,
  metadata values, and raw transcripts.
- `GET /api/operator/turn-records` requires normal bridge bearer auth and
  accepts optional `run_id`, `room_id`, and `limit` filters.
- `ensemble forward turn-records` exposes the same read-only projection from
  the CLI.
- Regression coverage verifies that transcript text and tool payload values do
  not appear in CLI or bridge JSON and that the CLI read does not append new
  events.

## Agent Systems P1 Workflow Contracts Projection Slice Facts

- Existing workflow contracts already live under `.agent/workflows/*.md` and
  use `ensemble_workflow.load_workflow()` plus `validate_workflow()` as the
  frontmatter contract parser/validator.
- `build_operator_workflow_contracts_payload()` now projects those contracts
  without invoking workflow execution, creating workflow runs, resuming work, or
  mutating approval/task state.
- Workflow contract rows expose workflow slug/name/path, schema version,
  execution support posture, required and optional input names, step ids/kinds,
  template variable names, approval posture, parallel posture, event-emission
  posture, and bounded validation warnings/errors.
- Workflow contract rows deliberately omit raw workflow bodies, rendered command
  values, rendered question values, and rendered payload values.
- `GET /api/operator/workflow-contracts` requires normal bridge bearer auth and
  accepts an optional `workflow` slug/file-stem filter.
- `ensemble forward workflow-contracts` exposes the same read-only projection
  from the CLI with optional `--workflow`.
- A real repo smoke found 6 workflow contracts, all ready: `incident-triage`,
  `research-build-review`, `verify-close`, `wf.parallel-workcell`,
  `wf.plan-execute-validate`, and `wf.research-plan-validate`.
- Regression coverage verifies that command/question/payload values do not
  appear in CLI or bridge JSON and that the CLI/API reads do not append events.

## Agent Systems P1 Status Confidence Diagnostics Slice Facts

- `build_operator_status_confidence_payload()` now projects local task, run,
  and room status confidence from existing SQLite state only.
- The projection reads operator tasks, runs, rooms, validator results, pending
  approval requests, blocked handoffs, room messages, and tool-event metadata
  without writing events or artifacts.
- Diagnostic rows expose subject type/id, current status, confidence level,
  confidence score, attention flags, reason codes, linked refs, signal counts,
  and bounded evidence refs.
- Implemented reason-code families include stale active runs, stale linked
  runs, pending approvals, blocked handoffs, latest validator failure, missing
  linked run records, unverified review/done status, no iteration evidence, and
  no room activity.
- Diagnostic rows deliberately omit message content, validator issue details,
  approval action payload values, tool payload values, and raw transcripts.
- `GET /api/operator/status-confidence` requires normal bridge bearer auth and
  accepts optional `task_id`, `run_id`, `room_id`, and `limit` filters.
- `ensemble forward status-confidence` exposes the same read-only projection
  from the CLI.
- Regression coverage verifies stale/pending/validator reason codes, no raw
  content leakage, bearer auth on the bridge route, and no event writes during
  CLI/API reads.

## Agent Systems P1 Multi-CLI Runtime Roster UX Slice Facts

- `build_operator_runtime_roster_payload()` now accepts optional `runtime_id`
  and `category` filters while preserving the original unfiltered roster shape.
- Supported runtime ids are `codex`, `claude`, `gemini`, `opencode`, `python`,
  `node`, `pnpm`, and `git`; supported categories are `agent_runtime` and
  `toolchain`.
- `GET /api/operator/runtime-roster` now accepts `runtime`, `category`, and
  `probe_versions` query parameters.
- `ensemble forward runtime-roster` now supports `--runtime`, `--category`, and
  `--agent-runtimes-only`; the last option is a shortcut for
  `--category agent_runtime`.
- Runtime roster output now includes `scope`, `ux_summary`, and
  `operator_hints`. UX summary names observed, available-unobserved, missing,
  and preferred agent runtimes plus bounded next actions.
- Operator hints provide per-runtime readiness labels without attempting to
  launch runtimes or run provider authentication commands.
- Privacy metadata now explicitly records `provider_auth_commands_executed:
  false`.
- Regression coverage verifies filtered CLI/API roster output, observed Codex
  checkpoint evidence, no auth/header leakage, no event writes, and continued
  compatibility for the existing unfiltered route.

## Agent Systems P1 Wake-Readiness Projection Slice Facts

- `build_operator_wake_readiness_payload()` now composes three existing
  read-only projections: status-confidence diagnostics, metadata-only turn
  records, and the agent-runtime roster.
- `GET /api/operator/wake-readiness` requires normal bridge bearer auth and
  accepts optional `task_id`, `run_id`, `room_id`, and `limit` filters.
- `ensemble forward wake-readiness` exposes the same projection from the CLI.
- Candidate rows expose subject type/id, current status, readiness,
  confidence, attention flags, reason codes, blockers, suggested actions,
  approval requirement, preferred agent runtime, linked refs, turn metadata
  counts, signal counts, and bounded evidence refs.
- Readiness values are projection-only decisions such as `ready`,
  `needs_review`, `attention`, `hold`, `wait_for_runtime`, and
  `needs_context`; they do not mutate task/run/room status.
- Pending approval or blocked evidence forces `hold`; missing agent runtime
  posture produces `wait_for_runtime`; stale evidence produces `attention`;
  partial confidence produces `needs_review`.
- `wake_contract` records that the projection is read-only and performs no
  scheduler start, wake message send, task/run/room status mutation, provider
  auth command execution, or external fetch.
- Privacy metadata records that message content, tool payload values, approval
  payload values, validator issue details, and raw transcripts are not exposed.
- Regression coverage verifies CLI/API read-only behavior, bearer auth on the
  bridge route, no transcript/tool payload leakage, no event writes, and
  runtime-roster source composition.

## Spatial Lens Pixel Art Direction Reset Facts

- The Prompt 3.8 art-direction reset is VIEWPORT-only and keeps the CLASSIC
  `OfficeRoomScene` branch available through
  `window.sessionStorage["conitens.officeStageMode"]`.
- `docs/design/spatial-lens-pixel-art-direction.md` is now the local visual
  contract for Spatial Lens: no CSS perspective, no transform skew, no
  isometric diagonal projection, no soft 3D shadows, and no blurred glow.
- `pixelSpriteGrammar.ts` centralizes the VIEWPORT sprite contract:
  `TILE_PX = 16`, `SPRITE_SCALE = 2`, `SHADOW_PX = 1`,
  `WALL_HEIGHT_TILES = 2`, `PROP_ANCHOR_RULE = "bottom-center"`, semantic
  palette tokens, tile snapping, and deterministic y/layer sorting.
- `viewportCamera.ts` provides a pure focused-camera frame helper. The default
  focus is Ops Control and camera offsets are clamped so the enlarged
  floorplate does not drift down/right into empty off-floor space.
- VIEWPORT now renders a visible `FloorMiniMap` overlay for overview while the
  main surface stays focused-camera instead of all-six-room thumbnail mode.
- `PixelProp` now snaps percent coordinates to a 24-column tile field, applies
  bottom-center anchors, and assigns z-index through `getPixelLayerIndex()`.
- VIEWPORT room dressing outputs are y-sorted before rendering, and temporary
  agent placeholders use the same z-index grammar plus a small operational
  offset.
- Dressed VIEWPORT rooms no longer render the legacy room fixture layer;
  CLASSIC continues using its existing renderer.
- Handoff routes now render as pixel-aligned floor conduit spans plus start/end
  beacons and one packet marker. The previous SVG dashed route classes are no
  longer present in Spatial Lens CSS.
- Blocked lanes render as in-world barrier/stop-marker spans with hard-pixel
  feet instead of a chart-style overlay.
- A scoped CSS scan over `packages/dashboard/src/spatial-lens` found zero
  `filter`, `drop-shadow`, `perspective`, `skew`, `rotate`,
  `stroke-dasharray`, route SVG class, or radial glow patterns after the reset.
- Browser diagnostics for the final reset found `data-viewport-camera` set to
  `focused`, `focusedRoomId` set to `ops-control`, 257 PixelProps, 0 legacy
  fixtures inside dressed rooms, 6 minimap rooms, 0 SVG routes, 4 conduit route
  segments, 1 packet marker, 1 blocked marker, no computed filter use, and no
  horizontal overflow across 1440px, 1220px, and 820px captures.
- CLASSIC fallback diagnostics found no Spatial Lens floor and 0 new
  PixelProps, confirming the reset did not change the CLASSIC branch.

## Spatial Lens Camera And Scale Pass Facts

- The Prompt 3.9 camera/scale pass keeps the same spatial-lens data/model
  surface and changes only UI camera/mode rendering.
- `OfficeStage` now has three user-visible modes: `Focused`, `Floor Overview`,
  and `Classic`. The previous stored `viewport` value is treated as `Focused`
  on load.
- `FloorViewport` receives a `viewMode` prop for `focused` or `overview` and
  exposes `data-viewport-mode`, `data-viewport-camera`, and
  `data-camera-zoom` for browser validation.
- `FLOOR_VIEWPORT_CAMERA_ZOOMS` is the local zoom contract:
  Focused uses integer `3x`, Floor Overview uses integer `1x`.
- Focused mode applies `transform: scale(3)` to the floor camera, so rooms,
  furniture, handoff conduits, and agent placeholders are physically enlarged
  together instead of merely receiving a larger layout box.
- Floor Overview uses `scale(1)`, hides the minimap, shows all rooms, and
  renders a visible `Floor Overview` plaque to distinguish topology/debug mode
  from the live-office camera.
- Focused mode keeps `FloorMiniMap` visible for whole-floor awareness while the
  main camera shows fewer rooms.
- Focused room labels/status lights are smaller at base CSS size so 3x zoom
  leaves them as in-world plaques/lights instead of large dashboard labels.
- Final Playwright diagnostics for Focused 1440px and 1220px reported
  `cameraZoom: "3"`, `cameraTransform: matrix(3, 0, 0, 3, 0, 0)`,
  `focusedRoomId: ops-control`, visible rooms `ops-control` and `impl-office`,
  257 PixelProps, 0 SVG routes, 4 route segments, no horizontal overflow, and
  no page/console errors.
- Final Focused measurements: Ops Control room bounds about `950x330` at
  1440px, first desk bounds `204x102`, agent placeholder bounds `162x186`, and
  focused title plaque bounds `112x30`.
- Final Overview diagnostics reported `cameraZoom: "1"`, all six rooms
  visible, no minimap, and the overview plaque visible.
- Final Classic diagnostics reported no Spatial Lens floor, 0 PixelProps, 81
  legacy classic room nodes, and no horizontal overflow.

## Spatial Lens Prompt 4 Agent-first Live Activity Facts

- The Prompt 4 pass is VIEWPORT-only and keeps canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, and task mutation
  surfaces unchanged.
- `agentStations.ts` derives deterministic station ids from authored room
  template `agentSlots`; no random resident placement was introduced.
- `agentVisualState.ts` now provides pure role/state/station/cue mapping for
  agents, tasks, and handoffs. Covered states include active, blocked, review,
  assigned, idle, handoff send, and handoff receive.
- `AgentLayer` renders live residents in the shared floor-camera coordinate
  system instead of inside individual `RoomZone` avatar canvases.
- `RoomZone` no longer renders `OfficeAvatar` for Spatial Lens; browser checks
  reported `floorCanvasCount: 0`.
- Generated character sprites are used for architect, owner, sentinel, and
  worker roles through `AgentSprite`; CSS placeholders remain unnecessary for
  the current demo agents.
- `PixelOffice`, `OfficeStage`, and `FloorViewport` pass task snapshots
  read-only so visual states can reflect blocked/review/active/assigned work.
- Focused 1440px browser diagnostics reported `cameraZoom: "3"`,
  `focusedRoomId: "ops-control"`, `targetRoomId: "validation-office"`, 4
  agent stations, 2 offscreen agents, 1 offscreen rail, 6 generated character
  sprites, and no console/page errors or horizontal overflow.
- Focused agent states were:
  architect `working` + `active`,
  owner `blocked` + `blocked`,
  sentinel `reviewing` + `handoff_receive`, and
  worker-1 `waiting_for_input` + `assigned`.
- Focused visible station bounds were about `126x168` CSS pixels after the 3x
  camera transform, satisfying the readable character-size goal.
- Clicking the owner station in the real browser updated
  `data-agent-selected` from architect to owner; decorative sprite/cue spans
  ignore pointer events so the station button is the stable hit target.
- Floor Overview kept all four agent stations visible at `1x` with about
  `42x56` station bounds. CLASSIC reported zero Spatial Lens floor nodes and
  zero generated sprites, preserving the fallback branch.
- Visual verdict is `revise`, score 84/100. The remaining visual gap is not
  agent readability; it is composition fidelity: Validation Office is still
  offscreen in Focused and Ops Control remains prop-dense.

## Spatial Lens Prompt 4.5 Route Object Polish Facts

- The Prompt 4.5 pass is VIEWPORT-only and keeps canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, external fetch,
  asset download, and task mutation surfaces unchanged.
- `SceneDockOverlay` now exposes `data-scene-dock-role`, allowing the route
  helper to be styled as a compact minimap without changing floor data.
- `MinimapDock` now labels the helper `Route Minimap` / `Floor Minimap`
  instead of the louder `Route Dock` / `Floor Dock` language.
- Focused route minimap browser evidence reports a 1px bordered
  `104px x 64px` minimap, muted label color, and role `route`.
- `HandoffOverlay` now wraps the generated packet sprite in
  `data-handoff-packet-slot`, so the visible route packet is parented by an
  in-world floor slot rather than floating as a standalone overlay icon.
- Browser evidence reports exactly 1 handoff packet, 1 packet slot,
  `packetParentIsSlot: true`, and Focused route style remains subdued at
  opacity `0.42` and height `2px`.
- Focused camera evidence remains stable:
  `cameraZoom: "3"`, `cameraTransform: matrix(3, 0, 0, 3, 0, 0)`,
  focused room `ops-control`, target room `validation-office`, route framing
  `source-corridor-target-edge`, scene bounds `15.833,1.833,33.333,33.333`,
  target edge `corridor-connected`, 3 target route pixels, and sentinel target
  sprite transform `matrix(2, 0, 0, 2, 0, 0)`.
- Laptop-width Focused keeps the same `3x` route/minimap/packet-slot contract
  with no horizontal overflow.
- Floor Overview remains `1x`, `overviewRole: topology`, and visibly labeled
  `1x Floor Overview`; Classic still mounts no Spatial Lens floor and reports
  0 generated sprites.
- New pixel grammar coverage locks the route minimap label/size contract, the
  physical packet-slot wrapper, and CSS integer scale transform usage.
- Visual verdict is `pass`, score 94/100. Remaining visual gap is corridor
  storytelling across the wide authored Ops -> Validation span, not camera
  scale, route dock dominance, or packet object state.

## Spatial Lens Prompt 4.6 Corridor Route Storytelling Facts

- The Prompt 4.6 pass is VIEWPORT-only and keeps canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, external fetch,
  asset download, and task mutation surfaces unchanged.
- `HandoffOverlay` now derives a `data-handoff-route-guide` visual layer from
  existing route points. It does not change `createFloorViewportModel`,
  route point data, handoff truth, approvals, or write paths.
- The final route guide is intentionally restrained to one source-side
  horizontal guide tile after visual inspection showed additional spine/target
  guide tiles felt detached in the focused crop.
- `.handoff-route-guide-tile` uses hard-pixel border/background treatment,
  no perspective, no skew, no fractional scale, and no soft shadow.
- Browser evidence reports Focused 1440:
  `cameraZoom: "3"`, `cameraTransform: matrix(3, 0, 0, 3, 0, 0)`,
  focused room `ops-control`, target room `validation-office`, route framing
  `source-corridor-target-edge`, scene bounds `15.833,1.833,33.333,33.333`,
  1 route guide tile with kind `source` and axis `x`, route minimap
  `104px x 64px`, 1 packet slot, 1 packet, `packetParentIsSlot: true`,
  target edge `corridor-connected`, 3 target route pixels, and no horizontal
  overflow.
- Laptop-width Focused keeps the same `3x`, route guide, route minimap,
  packet-slot, and target-edge contracts with no horizontal overflow.
- Floor Overview remains `1x`, `overviewRole: topology`, and visibly labeled
  `1x Floor Overview`; Classic still mounts no Spatial Lens floor, 0 route
  guide tiles, and 0 generated sprites.
- New pixel grammar coverage locks the route guide layer alongside the
  existing packet-slot, minimap, and integer-scale contracts.
- Visual verdict is `pass`, score 95/100. Remaining visual gap is structural:
  the wide corridor would need authored topology or generated room art, not
  more route-marker overlays.

## Spatial Lens Prompt 4.10 Validation Checkpoint Room Polish Facts

- The Prompt 4.10 pass is VIEWPORT-only and keeps canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, external fetch,
  asset download, and task mutation surfaces unchanged.
- `FocusedRouteTargetEdge` now exposes
  `data-focused-validation-checkpoint="true"` on the target floor.
- Focused Validation checkpoint props are generated sprites:
  `prop.clipboardRack`, `prop.routePort`, `furniture.stampDesk`,
  `prop.documentStack`, `prop.greenStatusLight`, and `prop.redStatusLight`.
- Each new target-edge sprite uses an integer sprite scale of `1` or `2`;
  no skew, perspective, soft shadow, or fractional transform scale was added.
- Browser evidence reports Focused 1440:
  `cameraZoom: "3"`, `cameraTransform: matrix(3, 0, 0, 3, 0, 0)`,
  focused room `ops-control`, target room `validation-office`, route framing
  `source-corridor-target-edge`, 3 continuity tiles, 1 route guide tile,
  1 packet slot, 3 target route pixels, target agent `sentinel`, 259
  generated sprites, the six focused validation props, no console errors, and
  no horizontal overflow.
- Laptop-width Focused keeps the same `3x` checkpoint/route contract with no
  horizontal overflow.
- Floor Overview remains `1x` topology mode and renders no focused target
  edge or focused validation checkpoint props. Classic still mounts no Spatial
  Lens floor and reports 0 generated sprites.
- New pixel grammar coverage locks the Validation checkpoint sprite contract
  alongside existing packet-slot, minimap, target-edge, corridor-continuity,
  and integer-scale contracts.
- Visual verdict is `pass`, score 98/100. The remaining visual gap is that the
  Validation checkpoint is still an authored focused overlay rather than a
  fully generated room asset.

## Spatial Lens Prompt 4.11 Room Depth Accent Layer Facts

- The Prompt 4.11 pass is VIEWPORT-only and keeps canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, external fetch,
  asset download, and task mutation surfaces unchanged.
- `RoomDepthLayer` is a reusable decorative room layer driven only by the
  existing `RoomTemplate` `roomId` and `theme`.
- Each templated room renders four accents:
  `back-wall-shadow`, `baseboard`, `work-mat`, and `foreground-lip`.
- The depth accents are CSS hard-pixel treatments; no new image dependency,
  perspective, skew, soft shadow, or fractional transform scale was added.
- Browser evidence reports Focused 1440:
  `cameraZoom: "3"`, `cameraTransform: matrix(3, 0, 0, 3, 0, 0)`, 6 room
  depth layers, 24 room depth accents, all six room themes represented,
  3 continuity tiles, 1 route guide tile, 1 packet slot, six focused
  Validation checkpoint props, no console errors, and no horizontal overflow.
- Laptop-width Focused keeps the same `3x` room-depth/route/checkpoint
  contract with no horizontal overflow.
- Floor Overview remains `1x` topology and renders the six room depth layers
  at overview scale. Classic still mounts no Spatial Lens floor and reports 0
  room depth layers and 0 generated sprites.
- Room dressing tests lock the `RoomDepthLayer` render path and theme-specific
  CSS contract.
- Visual verdict is `pass`, score 98/100. The remaining visual gap is true
  generated room art or a richer room-kit asset pass, not route overlays or
  shell compression.

## Spatial Lens Prompt 4.12 Generated Room-Kit Signature Facts

- The Prompt 4.12 pass is VIEWPORT-only and keeps canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, external fetch,
  asset download, and task mutation surfaces unchanged.
- `roomKit.ts` maps each existing `RoomTemplateId` to generated sprite
  signature props without changing canonical floor, task, handoff, or agent
  data.
- `RoomKitLayer` renders inside `RoomZone` after `RoomDepthLayer` and before
  wall, workstation, dressing, and operational layers.
- Every templated room now has at least two room-kit generated sprites. Ops
  Control uses `prop.doubleMonitor` and `prop.packet`; Validation Office uses
  `prop.greenStatusLight`, `prop.redStatusLight`, and `prop.packet`.
- The room-kit layer uses absolute hard-pixel positioning, generated sprite
  crops, and integer sprite scale `1`; no skew, perspective, soft shadow, or
  fractional transform scale was added.
- Browser evidence reports Focused 1440:
  `cameraZoom: "3"`, `cameraTransform: matrix(3, 0, 0, 3, 0, 0)`, focused
  room `ops-control`, target room `validation-office`, route framing
  `source-corridor-target-edge`, 6 room-kit layers, 13 room-kit sprites,
  272 generated sprites, 6 depth layers, 24 depth accents, 3 continuity tiles,
  1 route guide tile, 1 packet slot, no console errors, and no horizontal
  overflow.
- Laptop-width Focused keeps the same `3x` room-kit/route/depth/checkpoint
  contract with no horizontal overflow, and the Ops Control command-screen and
  active-packet signatures remain visible in the camera crop.
- Floor Overview remains `1x` topology and renders 6 room-kit layers and
  13 room-kit sprites at overview scale. Classic still mounts no Spatial Lens
  floor and reports 0 room-kit layers and 0 generated sprites.
- Room dressing tests lock the room-kit counts, `RoomKitLayer` render path,
  data hooks, and required generated sprite ids.
- Visual verdict is `pass`, score 98/100. The remaining visual gap is true
  generated room backdrops or a manually sliced generated room mockup, not
  additional route markers, labels, or shell compression.

## Spatial Lens Prompt 4.13 Focused Generated Room Backdrop Facts

- The Prompt 4.13 pass is VIEWPORT-only and keeps canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, external fetch,
  and task mutation surfaces unchanged.
- Public generated backdrop assets now exist at
  `packages/dashboard/public/assets/spatial-lens/generated/ops-control-room-backdrop.png`
  and
  `packages/dashboard/public/assets/spatial-lens/generated/validation-office-room-backdrop.png`.
- `generatedRoomBackdrops.ts` defines the bounded backdrop manifest for Ops
  Control room usage, Validation Office room usage, and Validation target-edge
  usage.
- `GeneratedRoomBackdropLayer` renders stable
  `data-generated-room-backdrop`, `data-generated-room-backdrop-room`, and
  `data-generated-room-backdrop-usage` hooks.
- `FloorViewport` passes `showGeneratedBackdrops={isFocusedMode}` to
  `RoomZone`, so regular room backdrops render only in Focused mode.
- `FocusedRouteTargetEdge` renders the Validation target-edge backdrop under
  its checkpoint sprite props.
- Browser evidence reports Focused 1440:
  `cameraZoom: "3"`, `cameraTransform: matrix(3, 0, 0, 3, 0, 0)`, focused
  room `ops-control`, target room `validation-office`, route framing
  `source-corridor-target-edge`, 3 generated room backdrops, 2 room backdrops,
  1 focused target-edge backdrop, 6 room-kit layers, 13 room-kit sprites,
  272 generated sprites, no console errors, and no horizontal overflow.
- Laptop-width Focused keeps the same `3x` generated-backdrop/room-kit/route
  contract with no horizontal overflow.
- Floor Overview remains `1x` topology and reports 0 generated room backdrops.
  Classic still mounts no Spatial Lens floor and reports 0 generated room
  backdrops and 0 generated sprites.
- Generated asset tests lock public backdrop file presence and manifest
  bounds. Room dressing tests lock Focused-only backdrop wiring and the
  target-edge backdrop hook.
- Visual verdict is `pass`, score 98/100. Remaining visual gaps are exact-size
  room backdrop generation/slicing for all six rooms and reducing duplicated
  authored props once generated room art carries enough identity.

## Spatial Lens Prompt 4.15 Operator Focus Map Facts

- The Prompt 4.15 pass is VIEWPORT/UI-only and keeps canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, external fetch,
  dependency, and task mutation surfaces unchanged.
- The attached research compared AutoGen Studio, LangGraph/LangSmith,
  CrewAI, Dify, Flowise, n8n, OpenHands, and AGDebugger patterns and concluded
  that Spatial Lens should be an operator focus map while DAG / trace / queue /
  workspace surfaces carry canonical structure.
- This pass deliberately did not add Dagre, ELK, React Flow, a Topology Lens,
  or a Run Lens. It implemented the fast focused-view cleanup on existing
  Spatial Lens components.
- `FloorViewport` exposes `data-operator-focus-map="true"` only in Focused
  mode and sets `data-map-task-treatment="rail-only"` in Focused versus
  `"room-nodes"` in Overview.
- `RoomZone` now has a `showTaskNodes` prop and emits
  `data-room-task-treatment`, so Focused suppresses room task dots while
  Overview keeps task nodes as topology/debug context.
- `shouldRenderAgentInOperatorFocusMap()` is the Focused-mode agent floor
  predicate. It keeps running, working, reviewing, and handoff actors, but
  excludes idle, assigned-only, and blocked-only agents from the floor.
- In browser evidence, Focused mode floor agents are only `architect` and
  `sentinel`; `owner` and `worker-1` remain in the Active Agents rail.
- The phase lane indicator is present only in Focused mode. In the demo
  route, `PLAN` is `focus`, `VALIDATE` is `target`, and `BUILD`/`APPROVE` are
  quiet.
- The route minimap is still present for orientation but has
  `data-scene-dock-state="collapsed-reveal"` and its `.floor-minimap` body is
  hidden by default (`visibility: hidden`, opacity `0`, max-height `0px`).
- `HandoffOverlay` now renders exactly one `data-handoff-edge-label` and one
  `data-handoff-route-pulse` for the demo route, without increasing route
  guide tile count beyond the existing single guide tile.
- Focused Validation target edge right gap increased to 46px at desktop and
  36px at laptop width in the captured evidence.
- Focused browser evidence reports 0 rail-only room task nodes, 0 horizontal
  overflow, and 0 console/page errors at both desktop and laptop widths.
- Floor Overview remains a 1x topology/debug mode with all four demo agents
  and room task nodes. Classic remains isolated with no Spatial Lens floor.
- Targeted Spatial Lens tests, TypeScript build mode, full dashboard tests
  (136), dashboard production build, Playwright evidence, visual verdict, and
  repo-structure post-write gate all passed.
- Visual verdict is `pass`, score 94/100. Remaining UX work should create
  separate Topology Lens and Run Lens surfaces rather than adding more
  workflow text, route markers, or execution-card semantics to Spatial Lens.

## Spatial Lens Prompt 4.16 Focused Handoff Rail Facts

- The Prompt 4.16 pass is VIEWPORT/UI-only and keeps canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, external fetch,
  dependency, and task mutation surfaces unchanged.
- The latest attached critique said Focused still looked like Floor Overview:
  the left Ops room, wide empty corridor, and right Validation room remained
  the dominant structure, while `HANDOFF` text and the route minimap did not
  answer which task was blocked or what the next action was.
- `FloorViewport.tsx` now builds a focused handoff chain from existing
  `rooms`, `tasks`, and `handoffs`, without adding a new data source. In demo
  evidence the chain is `architect->sentinel->owner`.
- Focused mode now renders exactly one `data-focused-handoff-rail="true"`
  element with `data-handoff-chain-task="q_184_owner_gate"`,
  `data-handoff-chain-state="blocked"`, and
  `data-next-operator-action="owner-approval"`.
- The handoff rail card displays `q_184_owner_gate`, `BLOCKED`, owner approval
  requirement, and the supporting handoff task
  `verify_append: architect -> sentinel`.
- The phase lane indicator now carries agent and work-state hooks:
  Plan `architect/RUNNING`, Build `worker-1/IDLE`,
  Validate `sentinel/REVIEW`, and Approve `owner/BLOCKED`.
- `RoomZone.tsx` now emits `data-room-focus-role` so Focused mode can dim
  background rooms and keep source/target rooms as supporting context.
- Focused mode no longer imports or renders `MinimapDock`; browser evidence
  reports `minimapCount: 0`.
- `HandoffOverlay.tsx` no longer renders `data-handoff-edge-label` or literal
  `HANDOFF`; browser evidence reports `handoffLabelCount: 0` while retaining
  one route pulse.
- The top forward nav labels are shortened to `Approve`, `Workspace`, and
  `Spatial`, and `shell.css` keeps desktop nav chips on one row. Browser
  evidence reports `navRows: 1` at 1220px and 1440px with no horizontal
  overflow.
- Browser evidence at `http://localhost:3002/#/office-preview` reports
  Focused 1440: `cameraZoom: "3"`, route framing
  `source-corridor-target-edge`, floor agents `architect` and `sentinel`,
  room focus roles `source:1/background:4/target:1`, central handoff rail
  width 512px, 0 minimaps, 0 handoff labels, 0 console/page errors, and 0
  horizontal overflow.
- Laptop-width Focused reports the same handoff task, blocked state, route,
  owner-approval next action, 0 minimaps, 0 handoff labels, 1 nav row, and 0
  horizontal overflow.
- Floor Overview remains `1x`, `mapTaskTreatment: room-nodes`, no focused
  handoff rail, and all four demo agents. Classic remains isolated with no
  Spatial Lens floor.
- Verification passed targeted Spatial Lens tests, TypeScript noEmit, full
  dashboard tests with 136 tests, dashboard production build, Playwright
  checks, visual verdict, and repo-structure pre/post-write gates.
## Frontend Design Architecture Improvement Facts

- The executed slice is frontend-only. It adds no canonical runtime truth,
  `.notes`, `.agent`, provider, approval, bridge, scheduler, external fetch,
  dependency, backend route, or task mutation surface.
- The Focused workbench CTA is no longer hardcoded in the component. The anchor
  uses `model.nextActionHref`, `model.nextActionKind`, and
  `model.nextActionCtaLabel`; the current demo state resolves to
  `owner-approval`, `Open approvals`, and `#/approvals`.
- `focusedNextAction.ts` owns CTA derivation. `focusedWorkbenchEvents.ts` owns
  latest-event, blocked-age, and workbench-edge derivation. The public
  `FocusedHandoffWorkbenchModel` shape remains stable.
- `OfficeStage` now has one `role="tablist"`, three `role="tab"` buttons, and
  one active `role="tabpanel"`. `aria-pressed` is no longer used for stage
  modes.
- Focused mode renders `FocusedHandoffView` directly and does not pass
  `viewMode="focused"` to `FloorViewport`.
- `FloorViewport` defaults to Overview semantics: `data-overview-role` is
  topology, `data-map-task-treatment` is `room-nodes`, generated room
  backdrops are disabled, and room task nodes remain enabled.
- The dormant Focused-map component files
  `FocusedRouteTargetEdge.tsx`, `FocusedCorridorContinuityLayer.tsx`, and
  `MinimapDock.tsx` were deleted. `AgentOffscreenRail` was removed from
  `AgentLayer.tsx` and the Spatial Lens index export.
- Final source grep under `packages/dashboard/src` found no
  `FocusedRouteTargetEdge`, `FocusedCorridorContinuityLayer`, `MinimapDock`,
  `AgentOffscreenRail`, `viewMode="focused"`, or `data-operator-focus-map`
  references.
- Browser QA against `http://localhost:3004/#/office-preview` reports Focused
  1220 and 1440 with one workbench, zero floor viewports, four workbench steps,
  model-owned owner-approval CTA, one nav row, no horizontal overflow, and
  muted spatial context visible in the first viewport.
- Browser QA reports Overview 1440 with one floor viewport, topology role,
  room-node task treatment, hidden dense dressing layers, no Focused workbench,
  and no horizontal overflow. Classic 1440 reports no Focused workbench and no
  Spatial Lens floor.
- Post-review accessibility finding: a valid ARIA tabs implementation requires
  every tab's `aria-controls` to resolve to an existing panel and arrow-key
  navigation to move focus with selection. `OfficeStage` now renders all three
  tabpanels with inactive panels hidden, and browser QA verifies ArrowRight
  selects/focuses Floor Overview and ArrowLeft selects/focuses Focused.

## Gajae-Code Final Adapter Findings

- The original control-plane plan remains sound: GJC should be an external
  terminal harness, not an authoritative task/approval/projection writer.
- The final missing implementation surface was a real adapter that converts a
  redacted GJC run metadata file into one append-only
  `harness.evidence_observed` event.
- Raw harness bodies remain outside Conitens state. The adapter rejects raw
  prompt/completion/stdout/stderr/transcript/log/body/diff/patch/comment/
  command/token/secret fields recursively before appending.
- Review found that validating only `artifact:` refs was too loose: symbolic
  refs such as `gjc:` and `event:` could smuggle path-looking values. The fix
  treats symbolic refs as opaque IDs and rejects slash, backslash, traversal,
  and drive-letter syntax.
- Review also found that unsafe-ref errors leaked the original rejected path in
  CLI stderr. The fix returns generic classifications such as absolute path,
  traversal, symbolic id, or control character without echoing the ref.

## Wave 5 Improvement Candidate Findings - 2026-07-10

- The safe authority split is candidate/approval events now, `.agent`
  projection later. Existing `scripts/ensemble_approval.py` and
  `LoopStateRepository` remain SQLite-first and are not valid authorities for
  this pipeline.
- Candidate identity is closure/kind/target-derived; proposal digests use
  canonical JSON so structured field boundaries cannot collide.
- Replay must validate the full identity, digest, deterministic risk, exact
  closure provenance, request metadata/scope, actor type, event order, and
  terminal decision agreement before a record can render or affect versioning.
- Permissive scalar-to-string coercion is unsafe at replay boundaries. A forged
  numeric target/summary record passed the first review and advanced a version;
  strict string validation now rejects it and its version is ignored.
- Approval actor validation is currently structural, not cryptographic. The
  future apply boundary must enforce real owner permission rather than treating
  a well-shaped event actor as sufficient authorization.
- The current candidate carries bounded metadata summaries, not executable or
  materializable config content. Apply logic must not synthesize a patch from
  those summaries.
- Full-ledger replay and concurrent version allocation remain future scale/
  concurrency concerns; neither justifies SQLite authority in this phase.
- Final isolated QA showed candidate actions mutate only
  `.notes/events/events.jsonl`; `.agent` and SQLite snapshots are unchanged.

## Wave 5 Agent Skill Revision Findings - 2026-07-10

- Candidate summaries remain metadata only. Materialization begins from a
  separately supplied, schema-v1 structured manifest and binds the exact
  candidate proposal digest into revision identity and every authorization/
  terminal event.
- `.agent/skills` is the canonical configuration surface, but every mutation in
  this flow is an event-authorized materialization. Proposal, apply, rollback,
  and rebuild never create a second SQLite or Forward authority.
- Candidate-review approval is necessary but insufficient. Apply, rollback, and
  rebuild perform a live match against the existing `.notes/OWNER.json` contract.
- Replay correctness depends on full envelopes and order, not payload shape
  alone. Proposal actor/scope, candidate approval precedence, exact requests and
  owner grants, terminal reasons, duplicate events, and the target active stack
  are all validated before materialization.
- Retry must distinguish expected recovery from external drift. A committed
  terminal can repair only missing/expected prior bytes; arbitrary target edits
  fail closed and require an explicit owner-authorized rebuild.
- Path safety covers `.agent`, `.agent/skills`, the target parent, and the target
  itself against symlinks/junctions and resolution outside the workspace.
- Security review found that ownerless rebuild initially trusted well-shaped
  owner events. A failure-first test reproduced it; rebuild now verifies the live
  project owner before replay or any `.agent` creation.
- The current leaf service intentionally concentrates validation, replay,
  authorization, and materialization. Split it only when additional target
  families or richer semantics justify a stable reducer/materializer boundary.
- Residual local-model risks are the preserved git-email owner fallback, tempdir
  lock divergence for deliberately different environments, and global event-log
  crash durability. None is promoted as solved by this slice.

## Wave 5 Effect Observation And Wave 6 Quarantine Findings - 2026-07-11

- Comparable work cannot be inferred safely from prose. The minimum trustworthy
  identity is an explicit bounded `comparison_key` copied into both closure
  artifacts and compared by exact equality.
- Effect records are observations, not causal proof. The event stores only
  closure/revision/candidate references, bounded metrics, deltas, classifications,
  and `causal_attribution=not_claimed`.
- Historical replay must evaluate authority as of the effect event. Using final
  revision state made a later valid rollback erase the readability of an earlier
  valid observation; prefix replay fixes that temporal category error.
- Command-level read/check/append transactions need a shared cross-process lock.
  A process-local lock allowed two different actors to append conflicting events
  for one deterministic observation identity.
- Python equality is not an exact JSON type check because booleans compare equal
  to integers. Replay now compares recursive type identity and value, including
  envelope `event_v`, scope, and redaction fields.
- Closure replay must validate nested schemas and public values before trusting
  recomputed hashes. A forged nested prompt/path/secret can otherwise be rehashed,
  while digest rendering may ignore the injected field.
- Candidate provenance intentionally bounds `source_event_ids` to 50. Effect
  linkage compares that prefix while still computing metrics from the complete,
  independently validated closure source set.
- Provider totals are exact only when every referenced provider call carries the
  relevant telemetry; partial telemetry remains unknown instead of becoming a
  misleading partial sum.
- Forward promotion gate 6 fails. Arbitrary context Markdown can preserve raw
  prompt/transcript/stdout/stderr bodies, common secret shapes, and absolute POSIX
  paths. A blacklist sanitizer cannot replace an allowlisted public projection.
- Forward remains an explicit, loopback-authenticated but quarantined sidecar.
  No authority-bearing command handler or runtime default was promoted.
- Closure creation and effect replay initially disagreed about absolute POSIX
  paths. Creation now applies the shared public-text policy before append, while
  unsafe episode IDs retain compatibility through deterministic opaque refs.
- Runtime-roster default version probing exceeded the 10-second client timeout
  on a reproducible host path. The HTTP read now defaults probes off and preserves
  `probe_versions=1` as explicit diagnostics; this is bounded-read reliability,
  not Forward promotion.
- Final evidence is 26/26 focused effect, 19/19 closure security, 121/121
  adjacent, 54/54 Forward, protocol focused/build/compile/sync green, and the
  unchanged full-protocol 847-pass/4-known-failure baseline.
- Independent goal/scope, QA, code, security, context/history, and replay/state
  reviews all returned PASS on the settled slice.

## Wave 3 Forward Bridge Boundary Findings - 2026-07-11

- A compatibility facade can preserve dashboard, CLI, and monkeypatch behavior
  while ownership moves into small query, command, stream, HTTP, public-context,
  collaboration-read, and patch-decision leaves.
- Read-only SQLite means both logical and physical non-mutation. Missing databases
  must not be created; existing WAL databases cannot be opened immutable without
  accounting for live WAL/SHM sidecars.
- Public output allowlists are necessary but not sufficient if search still reads
  private bodies. A boolean match on a raw message is a presence oracle, so thread
  search now matches only structural/public metadata.
- Actor labels, reviewer labels, handoff blocked reasons, summaries, and fallback
  error strings are all public data once they cross the bridge. They require the
  same strict sanitizer and neutral fallback policy as context projections.
- Approval correctness needs two distinct guarantees: the event ledger precedes
  SQLite projection, and a partial approved-but-not-applied patch remains safely
  retryable with workspace/actor/reason intact.
- On Windows, replying 413 before consuming a slightly over-limit request can
  reset the connection. A strictly bounded drain stabilizes normal overflow while
  extreme declared lengths remain undrained and rejected.
- Split quality must be measured on the new boundary leaves. The 37 Wave 3 files
  have zero no-excuse violations; four older large modules still carry documented
  legacy violations and were not widened into this refactor.
- Public projection logic must not be independently reimplemented per transport.
  Approval, actor, and handoff records now share one allowlisted projection used
  by query, command, and SSE paths; handoff packet bodies never cross the boundary.
- Explicit file splits are insufficient when wildcard imports recreate a hidden
  monolith. The 19 query modules now import their real owners directly, the facade
  re-exports a fixed 27-name contract, and architecture tests reject wildcard or
  dynamic-global exports.
- Route inventory is an executable contract: the root page is tested against all
  13 authenticated operator mutations, not a representative subset.
- Forward remains quarantined. Direct Forward-only SQLite projections and approval
  reviewer semantics are promotion debt; neither became event-ledger authority.
- The adjacent 2-failure/9-error baseline is causally isolated to legacy uppercase
  event names and three legacy persona manifests. It requires a separate semantic
  migration and explicit persona-core authorization.
- Independent settled review found no remaining scoped code-quality issue
  (`CLEAR / APPROVE`), and the final gate approved the refactor with no blockers.
- PR hardening found three boundary regressions after that snapshot: Focused mode
  omitted its primary handoff workbench, concurrent candidate decisions could both
  append, and read-only `forward status` created runtime directories. Regression
  tests now cover each repaired boundary.
- Git-config email is mutable repository/user metadata and cannot authorize owner
  actions; only UID or the recorded username-plus-hostname identity may authorize.

## PR #33 conflict integration findings - 2026-07-12

- The apparent 39-path merge conflict overstated the semantic conflict because
  cleanup intent on the PR branch was superseded by a broader cleanup record on
  `main`.
- Choosing the PR side wholesale for `packages/dashboard/src/App.tsx` would have
  deleted the screen and data-hook extraction landed on `main`. The safe merge
  keeps the thin shell and wires the PR controller into that existing boundary.
- The PR regression test assumed workspace list markup remained in `App.tsx`.
  After the extraction, the same behavior is owned by
  `OperatorWorkbenchScreen.tsx`, so the test now reads the actual owner rather
  than forcing a monolithic layout.
- The verified two-parent merge commit preserves both the public PR history and
  current `main` while publishing the reviewed integration tree as a
  fast-forward update to the PR branch.
- Review found a real workspace route-transition race: the old detail draft could
  remain actionable after selecting a new workspace. Resources now clear stale
  projections, the controller and command boundary require exact route/detail ID
  identity, and the screen hides mutations until the new detail is ready.
