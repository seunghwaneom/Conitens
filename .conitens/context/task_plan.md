# task_plan.md

## Active Batch

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
