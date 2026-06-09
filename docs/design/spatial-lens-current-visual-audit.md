# Spatial Lens Current Visual Audit

Date: 2026-06-08

Scope: read-only visual/reference audit for the active `#/office-preview`
Spatial Lens route. This document inspects the current implementation and
browser evidence without changing production code, canonical data, assets, or
runtime behavior.

## Scope And Constraints

- Production code was not modified for this audit.
- No asset downloads or new generated assets were introduced.
- Canonical runtime truth stays unchanged: `scripts/ensemble.py`, `.notes/`,
  and `.agent/` remain outside this visual audit.
- The UI remains read-only for this step. No floor write action, task mutation,
  approval bypass, external fetch, auto-merge, or provider command execution is
  part of this audit.

## Runtime Evidence

The active route was inspected in a real browser at
`http://localhost:3000/#/office-preview`.

- Results JSON:
  `output/playwright/spatial-lens-current-audit-results.json`
- Focused 1440 screenshot:
  `output/playwright/spatial-lens-current-audit-focused-1440.png`
- Focused 1440 floor crop:
  `output/playwright/spatial-lens-current-audit-focused-1440-floor.png`
- Floor Overview 1440 screenshot:
  `output/playwright/spatial-lens-current-audit-overview-1440.png`
- Floor Overview 1440 floor crop:
  `output/playwright/spatial-lens-current-audit-overview-1440-floor.png`
- Classic 1440 screenshot:
  `output/playwright/spatial-lens-current-audit-classic-1440.png`
- Focused laptop-width screenshot:
  `output/playwright/spatial-lens-current-audit-focused-1220.png`

Measured mode evidence:

- Focused: `data-viewport-mode="focused"`, `data-camera-zoom="3"`,
  `data-focused-room-id="ops-control"`,
  `data-camera-target-room-id="validation-office"`,
  `data-camera-scene-bounds="1,0,40,32"`, 9 corridor nodes, 6 door corridor
  references, 1 handoff packet, 1 blocked marker, 4 agent stations, 2
  offscreen agents, 265 generated sprites, 6 character sprites, 0 floor
  canvases, 0 console/page errors, and 0 horizontal overflow.
- Floor Overview: `data-viewport-mode="overview"`, `data-camera-zoom="1"`,
  full scene bounds `0,0,100,100`, 6 room ids, 9 corridor nodes, 1 handoff
  packet, 1 blocked marker, 4 agent stations, 0 offscreen agents, 263
  generated sprites, 4 character sprites, 0 console/page errors, and 0
  horizontal overflow.
- Classic: no Spatial Lens floor, no generated sprites, no floor canvases, no
  horizontal overflow.

Note: the current browser audit selector looked for `data-door-frame` and
therefore reported 0 door frames. The current implementation exposes door
alignment through `.room-door-frame` plus `data-door-corridor-node`, and the
same audit measured 6 door corridor references. That is a selector/reporting
nuance, not evidence that the door layer is missing.

## Current Component Tree

The active app route is:

```text
packages/dashboard/src/App.tsx
  #/office-preview route
    PixelOffice
      createOfficePresenceModel(...)
      OfficeSidebar
      OfficeStage
        Focused or Floor Overview
          FloorViewport
            PixelThemeProvider
            FloorplateLayer
            BuildingShellLayer
            CorridorLayer
            HandoffOverlay
            RoomZone
              WallDetailLayer
              WorkstationLayer
              RoomDressingLayer
              OperationalOverlayLayer
            AgentLayer
              AgentStation
              AgentSprite
              AgentActivityCue
              AgentSpeechBubble
            DoorFrameLayer
            MinimapDock and AgentOffscreenRail in Focused mode
        Classic
          OfficeRoomScene legacy room renderer
```

Key files inspected:

- Route and demo mounting:
  `packages/dashboard/src/App.tsx`
- Office state and inspector plumbing:
  `packages/dashboard/src/components/PixelOffice.tsx`
- Mode ownership and Classic fallback:
  `packages/dashboard/src/components/OfficeStage.tsx`
- Right inspector:
  `packages/dashboard/src/components/OfficeSidebar.tsx`
- Spatial viewport composition:
  `packages/dashboard/src/spatial-lens/components/FloorViewport.tsx`
- Room renderer:
  `packages/dashboard/src/spatial-lens/components/RoomZone.tsx`
- Handoff and blocked-lane visuals:
  `packages/dashboard/src/spatial-lens/components/HandoffOverlay.tsx`
- Door alignment:
  `packages/dashboard/src/spatial-lens/components/DoorFrameLayer.tsx`
- Agent rendering:
  `packages/dashboard/src/spatial-lens/viewport/AgentLayer.tsx`,
  `packages/dashboard/src/spatial-lens/viewport/AgentStation.tsx`,
  `packages/dashboard/src/spatial-lens/viewport/AgentSprite.tsx`
- Camera framing:
  `packages/dashboard/src/spatial-lens/viewport/viewportCamera.ts`
- Room templates and props:
  `packages/dashboard/src/spatial-lens/viewport/roomTemplates.ts`,
  `packages/dashboard/src/spatial-lens/viewport/roomDressing.ts`
- Corridor, floorplate, and door topology:
  `packages/dashboard/src/spatial-lens/viewport/corridorGraph.ts`,
  `packages/dashboard/src/spatial-lens/viewport/floorLayout.ts`,
  `packages/dashboard/src/spatial-lens/viewport/roomPlacement.ts`
- Shared visual CSS:
  `packages/dashboard/src/spatial-lens/styles/spatial-lens.module.css`

## Mode Ownership

Focused mode is owned by `OfficeStage.tsx`, `FloorViewport.tsx`,
`viewportCamera.ts`, `MinimapDock`, `AgentOffscreenRail`, and
`spatial-lens.module.css`. It is the default mode, uses integer camera zoom
`3x`, focuses `ops-control`, and keeps whole-floor awareness through a compact
minimap/offscreen rail.

Floor Overview is owned by the same `OfficeStage.tsx` and `FloorViewport.tsx`
branch, but passes `viewMode="overview"`. It uses integer camera zoom `1x`,
full scene bounds, all six rooms, and no offscreen rail. It remains a topology
and debug-oriented view rather than the primary Pixel Agents-like camera.

Classic is owned by the Classic branch in `OfficeStage.tsx` and the legacy
`OfficeRoomScene` renderer. It does not mount the Spatial Lens floor, generated
sprite sheet, Focused camera, corridor graph layers, or agent sprite layer.

## Data And Geometry Ownership

The layout is mostly data-driven inside the Spatial Lens adapter layer:

- `createOfficePresenceModel(...)` in
  `packages/dashboard/src/office-presence-model.ts` projects current demo/live
  office state into rooms, residents, tasks, and handoffs.
- `createFloorViewportModel(...)` in
  `packages/dashboard/src/spatial-lens/model/floorGeometry.ts` adapts room and
  handoff state into renderable floor geometry.
- `SPATIAL_LENS_BUILDING_LAYOUT` in `floorLayout.ts` owns the shared
  floorplate, shell, walls, and columns.
- `corridorGraph.ts` owns the central corridor spine, hub, stubs, route
  generation, and blocked-lane corridor placement.
- `roomPlacement.ts` owns VIEWPORT-only door placement for the six room ids.
- `roomTemplates.ts` and `roomDressing.ts` own authored room props, route
  ports, blocked-lane slots, and workstation clusters.
- `agentStations.ts` and `agentVisualState.ts` map residents and task/handoff
  snapshots into deterministic station, role, state, and cue choices.

This is not canonical runtime data. It is a read-only visual projection over
existing office/task/handoff state.

## What Is Working Well

- The implementation now has a real mode contract: Focused, Floor Overview,
  and Classic are separate user-facing choices.
- Focused uses integer `3x` camera zoom and shows character sprites at a
  readable scale rather than tiny floorplan markers.
- Floor Overview uses integer `1x` and remains available for topology/debug
  inspection.
- Classic remains available and isolated from Spatial Lens generated sprites.
- Room/corridor/door topology is authored through explicit model files rather
  than scattered ad hoc DOM placement.
- The main handoff has an in-world packet marker, and blocked work has a
  physical marker instead of only a dashboard badge.
- Agent rendering has moved out of per-room canvas avatars and into a shared
  floor-camera layer with generated character sprites.
- Right inspector selection is connected to station clicks without introducing
  write actions.

## Visual Issues

- Focused mode still reads as Ops Control plus a nearby office edge, while the
  Validation receiving edge is mostly represented by the offscreen rail. The
  camera records `validation-office` as the target, but the main scene does not
  yet compose Ops Control, corridor, and Validation as one live handoff moment.
- Ops Control remains prop-dense. The command-center identity is present, but
  the workstation cluster and walk path are crowded compared with the Pixel
  Agents-style reference.
- Handoff has in-world packet and route anchors, but the route still depends on
  long floor conduit segments. It is better than a generic SVG dashboard line,
  but the packet/ports should carry more of the story than the line.
- The offscreen rail is functional, but visually less authored than a compact
  room rail or mini live-strip.
- Floor Overview is stable, but it currently shares most rendering layers with
  Focused. That is efficient, yet it makes the overview feel visually close to
  the main scene unless the label and camera scale are noticed.

## Data And Runtime Issues

- No canonical data violation was found in this audit. The Spatial Lens floor
  reads projected state and does not write task/runtime truth.
- No evidence of new floor mutate/write actions was found in the inspected
  route.
- Room/corridor layout is data-driven, but it is still authored through static
  percent-based specifications. That is appropriate for this UI pass, but it
  means camera composition improvements should change the visual adapter, not
  canonical room/task data.
- `packages/dashboard/package.json` does not define a `lint` script. The
  practical typecheck gate for this package is the `build` script, which runs
  `tsc -b && vite build`.

## Agent-first Assessment

Agent-first status: partially achieved, with a clear next composition gap.

The current Focused view now shows readable sprite-backed agents, distinct
visual states, activity cues, and click selection. Architect and owner appear
as in-room actors in Ops Control, and sentinel/worker remain discoverable
through the offscreen rail. This is materially closer to a live office than
the older floorplan-style viewport.

It is not fully Pixel Agents-like yet because the handoff target actor is not
framed in the main camera at the same time as Ops Control. The user can infer
the handoff from packet/route/offscreen cues, but the primary camera does not
yet show the source and receiving moment together.

## Handoff Assessment

Handoff status: mixed, leaning in-world.

In-world parts:

- `HandoffOverlay.tsx` renders a generated `prop.packet` sprite.
- Blocked work renders a generated barrier marker.
- Route endpoints are anchored to door/corridor/route-port geometry.

Overlay-like parts:

- The route still uses visible floor conduit segments across the camera.
- The packet is present, but the route line remains the dominant continuity
  cue in Overview and parts of Focused.

Recommended direction: make packet, outbox/inbox, route ports, and short
stepped tiles tell the story first; keep lines as a quiet secondary debug aid.

## Room And Corridor Data-driven Assessment

Room and corridor layout is data-driven at the visual-adapter level.

- Rooms come from the office presence model and are adapted through
  `createFloorViewportModel(...)`.
- Corridor graph nodes, stubs, hub, and blocked-lane placement are centralized
  in `corridorGraph.ts`.
- Door placements are centralized in `roomPlacement.ts`.
- Room props and operational anchors are centralized in `roomTemplates.ts` and
  `roomDressing.ts`.

This is the right boundary. Future changes should keep the visual adapter
additive and avoid turning Spatial Lens into canonical runtime truth.

## Recommended Next 5 Implementation Tasks

1. Focused route-composition pass:
   keep integer `3x`, default `ops-control`, and adjust camera/framing or
   authored room-edge composition so the Ops Control source, corridor, and
   Validation receiving edge can coexist in the main camera.
2. Floor Overview stabilization pass:
   keep all six rooms visible at `1x`, make the overview/minimap label and
   topology/debug purpose unmistakable, and add regression checks that Focused
   and Overview cannot drift into the same visual contract.
3. Handoff in-world polish:
   reduce route-line dominance, strengthen outbox/inbox/route-port/packet
   visuals, and test that packet/barrier anchors remain present in Focused and
   Overview.
4. Agent live-activity readability pass:
   ensure sentinel and other non-focused agents have authored room-rail or
   camera-adjacent presence, keep station hit targets stable, and preserve
   inspector selection behavior.
5. Behavior-preserving refactor:
   after the visual contract is stable, split Focused/Overview adapter concerns
   where it reduces conditional complexity, prune dead Spatial Lens CSS, and
   keep Classic untouched.

## Validation Commands From package.json

Actual dashboard scripts in `packages/dashboard/package.json`:

- Dev server: `pnpm.cmd --filter @conitens/dashboard dev`
- Test: `pnpm.cmd --filter @conitens/dashboard test`
- Build and typecheck gate:
  `pnpm.cmd --filter @conitens/dashboard build`
- Preview: `pnpm.cmd --filter @conitens/dashboard preview`
- Lint: no package script is defined.

For the next implementation slice, the minimum validation set should be:

```powershell
pnpm.cmd --filter @conitens/dashboard test
pnpm.cmd --filter @conitens/dashboard build
```

For this audit-only slice, validation should verify the document exists,
references actual repo paths, and captures the active browser evidence without
production code edits.

## Conclusion

The current Spatial Lens is no longer a plain floorplan: it has a Focused
camera, generated sprites, agent stations, in-world packet/barrier markers,
data-driven floor/corridor geometry, and a preserved Classic fallback.

The next quality threshold is not more decoration. It is camera composition:
Focused should show the live Ops Control handoff story, including enough of
the Validation receiving edge to feel like a working office scene rather than
a source room plus offscreen target indicator.
