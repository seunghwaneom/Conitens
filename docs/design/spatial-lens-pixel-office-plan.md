# Spatial Lens Pixel Office Plan

Status: audit-only plan, no production behavior change.

## Goal

Upgrade Spatial Lens from a dark dashboard with embedded pixel room thumbnails
into an agent-first pixel office control shell inspired by Pixel Agents, while
preserving Conitens' event-first, approval-gated runtime contract.

Reference direction:

- Pixel Agents presents each agent as a character in a pixel office, with live
  visual activity states, speech bubbles, layout editing, persistent layouts,
  and modular office assets.
- Conitens should translate that into an agent-first spatial operations UI:
  agents, tasks, handoffs, approvals, and blockers are visible on the floor
  before the operator reads the side panel.

References:

- `https://github.com/pixel-agents-hq/pixel-agents`
- `C:\Users\eomsh\.codex\attachments\8a1dcc89-8638-4244-8687-57c77d5b5898\pasted-text.txt`

Hard boundaries:

- Current runtime truth remains `scripts/ensemble.py` plus `.notes/` and
  `.agent/`.
- Dashboard state is a projection/cache, not canonical truth.
- Inspect/read paths must stay separate from mutate/write paths.
- Do not vendor Pixel Agents assets until license and attribution are reviewed
  per asset.
- Do not grow `packages/dashboard/src/App.tsx`,
  `packages/command-center/src/components/HUD.tsx`, or the command-center
  stores as the primary implementation surface.

## Frontend Thesis

Visual thesis: a compact operator shell wrapped around a living pixel office,
with near-black system chrome, crisp hard-edged rooms, and agent/status motion
as the primary signal.

Content plan: floor first, inspector second, compact HUD third; detailed task,
trace, and approval text stays available only after selection.

Interaction thesis: select a room, agent, task, or handoff directly on the
floor; use short pixel-state cues for activity; keep all writes behind existing
explicit command or approval surfaces.

## Current Architecture

### Dashboard Spatial Lens Route

- `packages/dashboard/src/App.tsx` owns the forward shell route tree and treats
  `route.screen === "office-preview"` as a preview-only Spatial Lens route.
- `packages/dashboard/src/components/PixelOffice.tsx` is the current Spatial
  Lens orchestrator. It builds `createOfficePresenceModel()`, owns
  `selectedRoomId` and `selectedResidentId`, renders the summary band, then
  renders `OfficeStage` plus `OfficeSidebar`.
- `packages/dashboard/src/components/OfficeStage.tsx` renders the visible
  floor area. It already draws schema-driven corridors, focal lanes, corridor
  fixtures, and room scenes.
- `packages/dashboard/src/components/OfficeRoomScene.tsx` renders each room,
  its fixtures, visible task nodes, resident avatar slots, and room selection.
- `packages/dashboard/src/components/OfficeSidebar.tsx` renders the current
  right rail: focus card, active agents, task queue, and recent handoffs.
- `packages/dashboard/src/office-stage.module.css`,
  `packages/dashboard/src/office-sidebar.module.css`, and
  `packages/dashboard/src/office.module.css` hold most Spatial Lens styling.

### Dashboard Data Model

- `packages/dashboard/src/store/event-store.ts` defines the dashboard-local
  `TaskState`, `AgentState`, and `EventRecord` projection types used by the
  preview.
- `packages/dashboard/src/dashboard-model.ts` derives overview metrics and
  `OfficeHandoffSnapshot` from agents, tasks, and events.
- `packages/dashboard/src/office-presence-model.ts` maps dashboard agents,
  tasks, and events into room presence, residents, task nodes, and handoffs.
- `packages/dashboard/src/office-stage-schema.ts` defines the current room
  geometry, fixture placements, station anchors, task anchors, handoff anchors,
  doors, windows, corridors, focal lanes, and corridor fixtures.
- `packages/dashboard/src/office-fixture-registry.ts` maps fixture ids to the
  local `public/office-fixtures.png` sprite sheet.
- `packages/dashboard/src/office-avatar-sprites.ts` and
  `packages/dashboard/src/pixel-canvas-avatar.ts` provide local avatar sprite
  rendering; `OfficeAvatar.tsx` displays those sprites.
- `packages/dashboard/src/office-sidebar-view-model.ts` caps right-rail rows
  and builds the current focus strip copy.

### Command-Center Legacy/Sidecar State

These files are useful references but should not become the new implementation
surface for this dashboard redesign:

- `packages/command-center/src/store/spatial-store.ts` is a large
  event-sourced 3D spatial store with camera/building/room concerns.
- `packages/command-center/src/store/agent-store.ts` is a large agent avatar
  lifecycle store.
- `packages/command-center/src/store/task-store.ts` is a large task-agent
  mapping store.
- `packages/command-center/src/data/building.ts` remains a heavily referenced
  building definition source.
- `.vibe/context/LATEST_CONTEXT.md` already flags these as dependency
  hotspots. New work should read from existing contracts or typed adapters, not
  expand those stores further.

## Current Hotspots

- `packages/dashboard/src/App.tsx` is already the shell and route owner. Limit
  future changes to route wiring or one small mount point.
- `packages/dashboard/src/components/PixelOffice.tsx` mixes summary copy,
  selection state, model creation, and layout composition. It is the likely
  extraction point for `SpatialLensShell`.
- `packages/dashboard/src/components/OfficeStage.tsx` is beginning to hold
  background, floor, corridor, fixture, and room rendering. It should split
  into `FloorViewport` and layers before adding task/handoff animations.
- `packages/dashboard/src/components/OfficeRoomScene.tsx` currently combines
  room frame, name/status, floor, fixtures, task nodes, and avatars. It should
  split into `RoomZone`, `FurnitureLayer`, `AgentLayer`, and `TaskObjectLayer`.
- `packages/dashboard/src/components/OfficeSidebar.tsx` is still a broad rail.
  It should become a selection-based `InspectorPanel`.
- `packages/dashboard/src/office-stage.module.css` carries most map styling.
  Future work should move new layer styles next to the new feature folder and
  keep the legacy module as a compatibility surface during migration.

## Proposed Component Boundary

Create a small feature folder instead of expanding current monoliths:

```text
packages/dashboard/src/spatial-lens/
  components/
    SpatialLensShell.tsx
    CompactSpatialHeader.tsx
    FloorViewport.tsx
    FloorGrid.tsx
    RoomZone.tsx
    CorridorLane.tsx
    FurnitureLayer.tsx
    AgentLayer.tsx
    AgentSprite.tsx
    TaskObjectLayer.tsx
    TaskObject.tsx
    HandoffLayer.tsx
    HandoffLane.tsx
    BlockedLaneMarker.tsx
    InspectorPanel.tsx
    EventTicker.tsx
  model/
    floorGeometry.ts
    visualState.ts
    selection.ts
    handoffPaths.ts
    taskObjects.ts
  assets/
    assetRegistry.ts
  styles/
    spatial-lens.module.css
    pixel-primitives.module.css
```

Mounting strategy:

- `PixelOffice.tsx` should eventually become a thin adapter around
  `SpatialLensShell`.
- `OfficeStage.tsx`, `OfficeRoomScene.tsx`, and `OfficeSidebar.tsx` can remain
  compatibility wrappers while new pieces are introduced behind a preview flag
  or route-local toggle.
- `App.tsx` should only keep the existing `#/office-preview` mount and avoid
  owning spatial state beyond route selection.

## Proposed Data Contracts

The first implementation pass can keep percent-based geometry to avoid a risky
coordinate rewrite. The model boundary should still make tile conversion
explicit so a future canvas renderer can replace DOM layers.

```ts
export type TileCoord = { x: number; y: number };
export type TileSize = { w: number; h: number };

export interface FloorViewportModel {
  rooms: RoomZoneModel[];
  corridors: CorridorLaneModel[];
  agents: AgentSpriteModel[];
  tasks: TaskObjectModel[];
  handoffs: HandoffLaneModel[];
  selection: SpatialSelection;
  hud: FloorHudModel;
}

export interface RoomZoneModel {
  id: string;
  label: string;
  kind: "ops" | "impl" | "research" | "validation" | "review" | "commons";
  origin: TileCoord;
  size: TileSize;
  floor: "wood" | "lab" | "office" | "commons";
  status: "live" | "occupied" | "quiet" | "blocked";
  anchors: {
    stations: Record<string, TileCoord>;
    handoff: TileCoord;
    overflow: TileCoord;
  };
}

export type AgentVisualState =
  | "idle"
  | "walking"
  | "working"
  | "reviewing"
  | "blocked"
  | "waiting_for_input"
  | "handoff_sending"
  | "handoff_receiving";

export type AgentVisualRole =
  | "architect"
  | "sentinel"
  | "owner"
  | "worker"
  | "recorder"
  | "improver"
  | "unknown";

export interface AgentSpriteModel {
  agentId: string;
  role: AgentVisualRole;
  visualState: AgentVisualState;
  roomId: string;
  stationId: string;
  facing: "up" | "down" | "left" | "right";
  statusTone: "live" | "review" | "blocked" | "idle";
  activityIcon?: "typing" | "reading" | "terminal" | "approval" | "blocked";
  speechBubble?: {
    tone: "info" | "warning" | "danger";
    label: string;
  };
}

export interface TaskObjectModel {
  taskId: string;
  status: "active" | "review" | "blocked" | "assigned" | "completed" | "unknown";
  roomId: string;
  anchor: TileCoord;
  objectKind: "laptop" | "clipboard" | "red-folder" | "envelope" | "stamp";
  ownerAgentId?: string;
}

export interface HandoffLaneModel {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  fromAgentId: string;
  toAgentId?: string;
  taskId: string;
  status: "routing" | "waiting" | "accepted" | "blocked";
  path: TileCoord[];
}

export type SpatialSelection =
  | { kind: "room"; roomId: string }
  | { kind: "agent"; agentId: string }
  | { kind: "task"; taskId: string }
  | { kind: "handoff"; handoffId: string };
```

Pure model functions:

- `toFloorViewportModel({ agents, tasks, events, stageSchema })`
- `mapAgentToVisualState(agent, tasks, handoffs)`
- `mapTaskToObject(task)`
- `routeHandoffPath(handoff, rooms)`
- `reduceSpatialSelection(previous, action, model)`

These functions must not mutate source data and must not call bridge mutation
actions.

## Migration Order

1. Audit-only plan: this document.
2. Pixel tokens and primitives: add `pixel-primitives.module.css` plus small
   primitives such as `PixelFrame`, `PixelButton`, `StatusPill`, and
   `PixelDivider`; do not change data flow.
3. Asset registry MVE: add `spatial-lens/assets/assetRegistry.ts` with local
   placeholders and manifest types for floors, walls, furniture, and
   characters; do not download or vendor third-party assets.
4. Static FloorViewport: build `FloorViewport`, `FloorGrid`, `RoomZone`, and
   `CorridorLane` from typed fixture data behind the existing preview route or
   a local toggle.
5. RoomZone layer split: move room frame, name plate, status flag, floor tiles,
   walls, fixtures, and awaiting marker out of `OfficeRoomScene`.
6. AgentSprite layer: add pure `mapAgentToVisualState()` and render role/state
   cues for architect, sentinel, owner, and worker fixture agents.
7. TaskObject layer: map active, review, blocked, assigned, and completed tasks
   to floor objects before they appear in text lists.
8. HandoffLane and BlockedLane: route handoffs between room `handoffAnchor`s
   and render blocked lanes as red paths plus small barrier markers.
9. InspectorPanel: replace the right rail with a selection-based inspector for
   room, agent, task, and handoff, preserving raw trace links and read-only
   posture.
10. Compact HUD/header: reduce top chrome on `#/office-preview`, move live room
    counts, blocked lanes, handoff counts, and focus labels into a compact HUD.
11. Visual QA and regression guard: remove duplicated colors, ensure missing
    asset fallbacks, confirm pixel crispness, and add checklist evidence.

## Validation Commands

Minimum checks for design-only steps:

```powershell
git diff --check -- docs/design/spatial-lens-pixel-office-plan.md .conitens/context/task_plan.md .conitens/context/progress.md .conitens/context/findings.md .conitens/context/LATEST_CONTEXT.md
Select-String -Path docs/design/spatial-lens-pixel-office-plan.md -Pattern "Current Architecture","Proposed Component Boundary","Proposed Data Contracts","Migration Order","Validation Commands","Risks"
```

Minimum checks for frontend implementation steps:

```powershell
pnpm.cmd --filter @conitens/dashboard test
pnpm.cmd --filter @conitens/dashboard build
```

Visual checks for any rendered UI change:

```powershell
pnpm.cmd --filter @conitens/dashboard preview --host 127.0.0.1 --port <port>
```

Then capture `#/office-preview` at 1440px, 1220px, and 820px. Required browser
diagnostics:

- no console or page errors
- no horizontal overflow
- no checked text overflow
- floor viewport is the dominant element at 1440px
- active, review, blocked, assigned, and handoff states are visible before
  reading the inspector
- right panel reflects selection and remains read-only

## Risks

- Visual overreach: pixel art must not hide operational trust signals. Keep
  canonical ids, trace links, approval posture, and handoff evidence in the
  inspector.
- Asset licensing: Pixel Agents includes open-source office assets, but
  character assets are credited separately. Do not copy assets until license
  and attribution are reviewed per asset.
- Monolith expansion: avoid large edits to `App.tsx`, `HUD.tsx`, command-center
  stores, or the current dashboard stage components. Add small feature modules
  and keep wrappers thin.
- State confusion: floor selection is UI state only. It must not write tasks,
  approvals, runs, rooms, `.notes`, or `.agent`.
- Animation drift: live movement and path animation can misrepresent real
  runtime state. Start with deterministic static markers, then animate only
  from bounded evidence.
- Responsive compression: the floor must remain legible down to laptop width.
  If mobile cannot show the full office, prefer pan/zoom or inspector-first
  fallback over shrinking text into unreadability.

## Definition Of Done For This Plan

- This markdown plan exists at `docs/design/spatial-lens-pixel-office-plan.md`.
- It references actual Conitens repo paths.
- It defines component boundaries, data contracts, migration order, validation
  commands, and risks.
- It does not modify production UI code.
