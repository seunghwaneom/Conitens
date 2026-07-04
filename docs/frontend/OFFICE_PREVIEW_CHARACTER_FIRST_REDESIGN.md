# Office Preview Character-First Redesign

## Goal

Shift `#/office-preview` away from office-centered staging and toward agent-first readability without changing operator semantics, demo data shape, runtime dependencies, or the standing Focused/Overview/Classic mode contract.

## Scope

- Keep the existing dark shell, stage tabs, status vocabulary, and no-new-runtime-deps asset pipeline.
- Preserve Focused as the fastest operator surface for active actor, blocker, next handoff owner, and next operator action.
- De-emphasize office dressing, room furniture, and scenic floor storytelling wherever they compete with agent identity.
- Increase character distinctness through silhouette, palette accent, and motion differences by role and state.

## Implementation Update - 2026-07-04

- Focused mode now uses a character-first Agent deck instead of mounting the floor viewport.
- Focused mode resolves large role-owned portrait cutouts from `public/agent-portraits/generated` through `agent-character-portraits.ts`.
- Runtime portraits are `288x512` transparent PNGs with `imagegen-large-pixel-avatar` provenance for orchestrator, implementer, researcher, reviewer, and validator.
- Topology mode still resolves generated `64x64` sprite-gen static atlases from `public/agent-sprites/generated` through the Spatial Lens asset registry.
- Role motion profiles are explicit and testable: orchestrator `command-pulse`, implementer `build-shift`, researcher `research-orbit`, reviewer `review-scan`, validator `verify-brace`.
- The implementation keeps the no-new-runtime-deps constraint: sprite-gen and image generation are generation/curation pipelines, not app dependencies.

## Non-goals

- No full navigation redesign.
- No new motion library or runtime sprite dependency.
- No change to room topology semantics or handoff data model.
- No replacement of the Spatial Lens workbench with a floor map in Focused.

## Character-First Principles

1. Agent identity reads before room identity.
2. Motion communicates role/state, not decoration.
3. Office scenery supports orientation only after the operator signal is clear.
4. Every mode keeps one primary answer path for active, blocked, next handoff, and next action.
5. Distinction comes from silhouette, stance, and timing before extra color or effects.

## Mode-by-Mode UI Intent

### Focused

- Primary surface remains the Active Handoff Workbench.
- Active participants need character-weighted presence inside the workbench and context strip: larger portraits/sprites, stronger name-to-role pairing, and less room-thumbnail competition.
- The muted context strip should use reduced room art and more obvious participant silhouettes. Thumbnails should read as "who and where" rather than scenic vignettes.
- The office summary band should avoid selling the room fantasy. It should reinforce the active character, blocker, and action.

### Floor Overview

- The overview should read as a topology map with moving operators, not a furnished dollhouse.
- Room shells, corridors, and plaques stay; decorative furniture is reduced to a sparse signature set per room.
- Agents, packets, blocked markers, and handoff lanes carry the highest contrast and motion.
- The inspector rail should describe the selected agent or room in operator language, not scenic language.

### Classic

- Classic can keep the richest room context, but the camera must still privilege characters over props.
- Each room should have one signature prop cluster maximum; remaining furniture should flatten into backdrop texture.
- Occupancy states should feel like crew presence, not empty office staging. Character grouping and posture should do more of the storytelling than labeled furniture.

## Component Guidance

### Agent Portraits And Sprites

- Focused `Agents` mode should use the large portrait assets for first-read identity and keep full-body visibility inside each character card.
- Topology and compact spatial contexts should use the generated `64x64` sprite atlases so the map remains readable at dense zoom levels.
- Give each canonical role a unique silhouette that still survives at small sizes: orchestrator command-forward, implementer tool-forward, researcher lens/book-forward, reviewer clipboard-forward, validator checkpoint posture.
- Keep role distinction visible in idle state before labels render.
- Use state swaps sparingly. Role silhouette should stay stable while state changes adjust pose, held object, facing, or micro-accent.

### Focused Workbench

- Replace any remaining scenic emphasis with participant emphasis.
- The blocked step and next-action row should visually anchor the owner and validator characters, not room references.
- If an illustrative sprite appears in a step or header, it must map to the step owner/state and never be generic decoration.

### Focused Context Strip

- Backdrop opacity and detail should drop further than the character layer.
- Each thumb should show one dominant character and at most one support cue: gate icon, packet, or checkpoint device.
- Avoid equal visual weight between backdrop art and character sprite.

### Floor Viewport

- Character sprites need the strongest local contrast on the map.
- Route lines and blocked markers must never pass behind high-detail furniture clusters.
- Room identity should come from plaque, floor tint, and one signature prop family, not dense prop scatter.

### Sidebar / Inspector

- Selected-agent states should use the same role and state labels visible in the stage surface.
- In overview mode, the rail order should remain task queue before active agents if that best preserves blocker scanning, but the selected-agent card should show the clearest character ownership statement.
- Do not add a second competing handoff narrative in the rail.

## Motion Taxonomy

### Role Idle Motion

- Orchestrator: low-frequency command scan or note-check loop.
- Implementer: compact tool or keyboard cadence.
- Researcher: slower lens/book review loop.
- Reviewer: restrained clipboard or stamp/approval pause.
- Validator: still base with brief checkpoint pulse.

### State Motion

- Running: subtle continuous loop, 900-1400ms cadence.
- Review: slower hold-and-check motion, 1200-1800ms cadence.
- Blocked: mostly static with one intermittent alert cue, 1600ms+ cadence.
- Handoff sending: short directional gesture toward lane target.
- Handoff receiving: short acknowledgment motion facing the incoming lane.

### System Motion

- Selection/focus: 160ms outline/contrast lift only.
- Active handoff edge: existing semantic pulse stays, but character motion should not pulse in sync.
- Blocked marker: one localized alert rhythm only; do not stack glow, bounce, and color cycling together.

### Reduced Motion

- Freeze idle loops and directional gestures.
- Preserve semantic state through pose, badge, contrast, and icon alone.
- Keep focus, tab, and CTA state changes visible without animation dependency.

## Interaction States

### Focus Order

1. Stage mode tabs
2. Primary workbench CTA
3. Selected-agent or selected-room inspector action
4. Active agent list
5. Remaining queue/handoff items

### Keyboard Expectations

- Existing arrow-key tab switching remains unchanged.
- If agent selection becomes more character-driven in the viewport, every selectable character must keep a visible focus ring and a text label relationship.
- Selection changes must update inspector and summary text without moving focus unexpectedly.

### Loading, Empty, Error

- Loading: character placeholders or silhouette skeletons, not furnished room shimmer.
- Empty: no-office language. Example direction: "No active agents online" with dormant character slots.
- Error: explain which operator surface failed, keep last-known semantic labels if possible, and never replace the whole frame with scenic art.

## Must

- Must keep Focused readable in under three seconds for active, blocked, next handoff, and next action.
- Must preserve one-row top nav at `1220px`.
- Must keep status colors semantically stable.
- Must preserve no-new-runtime-deps and existing demo data shape.
- Must ensure character sprites remain readable at both `1220px` and `1440px`.
- Must respect reduced-motion preferences with no semantic loss.

## Must Not

- Must not re-promote the floor map inside Focused.
- Must not let room props outrank agents, packets, or blocked markers.
- Must not duplicate the same handoff or status meaning across workbench, map, and rail with conflicting wording.
- Must not solve differentiation only with labels; silhouette and pose need to carry part of the load.
- Must not introduce decorative motion that looks active when the agent is idle or blocked.
- Must not require new runtime libraries for animation or sprite handling.

## Binary Visual QA Observations

These should be evaluated as pass/fail.

- Focused: within one viewport, the active actor, blocked owner gate, and next operator action are visible without scrolling.
- Focused: the dominant visual read is the handoff participants, not the room thumbnails.
- Focused: context thumbnails show one clear character subject each; backdrop art does not visually overpower the sprite.
- Overview: agents, blocked markers, and handoff routes are easier to spot than furniture clusters.
- Overview: every room still has a distinct identity with sparse cues, not dense prop noise.
- Classic: rooms feel occupied by agents, not staged by furniture.
- All modes: orchestrator, implementer, researcher, reviewer, and validator are distinguishable at a glance without reading names.
- All modes: motion differences are noticeable by role/state but remain restrained and non-cartoonish.
- All modes: reduced-motion mode preserves all operational meaning.

## Success Criteria

- Operators can identify the active agent and blocked owner in Focused before parsing room context.
- Floor Overview reads as an agent/topology surface rather than an office illustration.
- Classic keeps flavor without becoming the canonical semantic surface.
- Character differentiation is visible through silhouette plus motion, not just labels.
- Existing keyboard, status, and no-overflow contracts remain intact.

## QA Scenarios

1. Focused at `1440x900`: verify active actor, blocked gate, next action, and two participant characters are visible at scroll 0.
2. Focused at `1220x900`: verify context strip remains secondary and does not push critical action below the fold.
3. Overview at `1440x900`: verify blocked lane, packet, and all active agents pop before furniture.
4. Overview at `1220x900`: verify map stays primary over the rail and character sprites remain legible.
5. Classic at `1440x900`: verify character occupancy reads before room dressing.
6. Reduced motion: verify all role/state meaning survives with animation disabled.
7. Keyboard: verify tab switching, selected-agent focus visibility, and inspector updates remain deterministic.
8. Empty/error/loading: verify each state stays character-first and operator-readable.

## Unresolved Decisions Requiring Product Input

- Whether Classic should stay as a supported operator mode or become an explicitly secondary "ambient" view.
- Whether per-role sprite expansion should stop at four canonical roles or include additional state-specific variants for each role.
- Whether the selected-agent card in Overview should prioritize role/archetype copy or current handoff responsibility copy when space is tight.
- Whether room names stay office-flavored or shift toward more abstract operational zones as office emphasis decreases.
