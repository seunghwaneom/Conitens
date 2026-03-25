# 3D Command Center — Usage & Developer Guide

> Package: `@conitens/command-center` · Version 0.1.0
> Built through 7 generations of Ouroboros evolutionary development

---

## 1. Overview

The 3D Command Center is a **diegetic GUI for orchestrating heterogeneous AI agents** (Claude Code,
Gemini CLI, Codex CLI) in real time. Instead of a traditional dashboard of tables and charts, the
operator navigates a first-person 3D building where every agent, task, and pipeline is a physical
presence in the world.

### Philosophy

> Transparent recording → recursive improvement → self-evolution

Every operator action is an event. Every event is appended to the immutable event log. The log can
be replayed to reconstruct any past scene state, fed back into analysis, and used to drive
autonomous GUI improvements — closing the loop between observation and evolution.

### Spatial Hierarchy

```
Building  (packages/command-center)
  └── Floor (Ground / Operations)
        └── Room  (.agent/rooms/*.yaml — role group)
              └── Agent avatar  (pre-placed, awaiting spawn)
```

The building layout is defined in `.agent/rooms/_building.yaml` and individual room configs in
`.agent/rooms/<room-id>.yaml`. The spatial hierarchy maps directly to the RFC-1.0.1 control-plane
concepts: buildings contain offices (projects), offices contain rooms (role groups), rooms contain
agent instances.

### Built-in Rooms

| Room ID | Floor | Role |
|---|---|---|
| `project-main` | Ground | Lobby — user entry point |
| `archive-vault` | Ground | Replay & history archive |
| `stairwell` | Both | Vertical connector |
| `ops-control` | Operations | Manager command room |
| `impl-office` | Operations | Implementer workspace |
| `research-lab` | Operations | Researcher workspace |
| `validation-office` | Operations | Validator workspace |
| `review-office` | Operations | Reviewer workspace |
| `corridor-main` | Operations | Connecting hallway |

---

## 2. Getting Started

### Prerequisites

- Node.js >= 22.12.0
- pnpm >= 9

### Install

```bash
pnpm install
```

### Build

```bash
# Build all packages (protocol + core + command-center)
pnpm build

# Build only the web app
cd packages/command-center
pnpm build:web
```

### Run (Web)

```bash
cd packages/command-center
pnpm dev
# Opens http://localhost:3100
```

The dev server connects to the `@conitens/core` WebSocket bus (`ws://localhost:8080`) for live
events. If the core server is not running, the GUI falls back to simulated metrics data silently.

### Run (Desktop / Electron)

```bash
cd packages/command-center
pnpm electron:dev
# Starts Vite + Electron concurrently
```

To distribute a signed desktop binary:

```bash
pnpm electron:dist          # current platform
pnpm electron:dist:win      # Windows
pnpm electron:dist:mac      # macOS
pnpm electron:dist:linux    # Linux
```

### Run Tests

```bash
# From repo root
pnpm test

# Only command-center tests
cd packages/command-center
pnpm test

# CI test count gate (fails if test count drops)
pnpm test:ci
```

---

## 3. Key Features

The Command Center was validated against 16 Acceptance Criteria (AC). All 16 pass at Gen 7.

### AC 1 — 3D Building with Role-Based Rooms

Rooms are driven by YAML files in `.agent/rooms/`. The loader (`use-room-loader.ts`) watches for
config changes and hot-reloads room geometry and metadata without a page restart. The building
manifest (`_building.yaml`) defines floor plans, room adjacency, agent assignments, and visual
defaults (wall color, ambient light, grid visibility).

Adding a room: create `.agent/rooms/<id>.yaml` following the `_schema.yaml` contract, then add the
room ID to `_building.yaml → floor_plan[n].rooms`.

### AC 2 — Agent Avatars Pre-Placed as Inactive

On mount, `initializeAgents()` places every agent defined in `_building.yaml → agent_assignments`
into its home room with status `"inactive"` / `"awaiting spawn"`. Avatars appear with a staggered
fade-in animation (`spawnIndex × STAGGER_MS`). When a YAML building loads after the static
fallback, `reinitializePositions()` recomputes world positions without losing agent status or task
state.

### AC 3 — Bird's-Eye View + Hierarchical Drill-Down

Three camera presets are available via the `HUD` camera controls:

| Preset | View |
|---|---|
| `birds-eye` | Full building overhead view |
| `room` | Focused view of a single room |
| `agent` | Close-up on a selected agent |

`BirdsEyeCamera.tsx` handles the overhead view; `BirdsEyeClickableNodes.tsx` renders clickable
room nodes at the LOD level. Keyboard shortcut `B` toggles bird's-eye. Camera state is
event-sourced in the spatial store — all camera changes are replayable.

### AC 4 — Three Interactive Layers

1. **Building layer** — select floors, overview room occupancy at a glance.
2. **Room layer** — enter a room, see agent avatars and in-world diegetic panels.
3. **Agent layer** — select an agent avatar to inspect status, active task, capabilities.

Navigation between layers is tracked via `interaction.*` events so operator patterns can be
analysed for GUI self-improvement (AC 11).

### AC 5 — Task-Agent Mapping Visualization

`HierarchySpatialTaskLayer` renders connector lines between task orbs and agent avatars. Each orb
carries a `CommandStatusBadge` showing current task state. `TaskGroupsBootstrap` creates one task
group per room and per agent on mount. The `task-store` is kept in sync via `TaskWSBridge` which
routes `task.*` WebSocket events from the orchestrator.

### AC 6 — Diegetic UI (In-World Monitor Screens)

Metrics and status information are displayed on `DashboardPanel` 3D surfaces inside each room
rather than as 2D HUD overlays. Components:

- `DashboardPanelMetrics.tsx` — live throughput, error-rate, latency charts rendered to canvas textures
- `DashboardPanelInteraction.tsx` — operator-interactable in-world controls
- `DiegeticMetricDisplay.tsx` — single-metric readout embedded in wall panels
- `DiegeticDetailPanel.tsx` — expandable detail overlay anchored to an agent or fixture
- `DiegeticCommandStatusIndicator.tsx` — coloured indicator light for command state

`MetricsTicker` drives a background RAF loop that refreshes canvas textures at ~30 fps.

### AC 7 — Full Control Plane

The operator can perform all control-plane operations from within the 3D world:

- **Assign task to agent** — `TaskManagementPanel` or right-click context menu
- **Convene a meeting** — `ConveneMeetingDialog` (described in AC 10)
- **Rearrange rooms** — `TopologyPanel` with keyboard shortcuts (`T` toggle, `Del` sever, `Esc` cancel)
- **Pipeline management** — `PipelineCommandInterface` (toggle with `P`)
- **Room mapping** — `RoomMappingPanel` with live hot-reload

All actions are dispatched through `ActionDispatcherProvider` which writes command files to the
`.conitens/commands/` directory, feeding the Orchestrator ingestion pipeline.

### AC 8 — Command-File Pipeline Integration

Every user action in the GUI is translated to a command file via `use-command-file-writer.ts` and
dispatched through `ActionDispatcherProvider`. The flow:

```
GUI action → ActionDispatcher → command file (.conitens/commands/*.md)
    → Orchestrator (chokidar watch) → validate → redact → append to event log
    → Reducers → WebSocket broadcast → GUI state update
```

`CommandLogPanel` shows a scrollable list of all command state transitions in real time.
`CommandDispatchStatusBar` surfaces the most recent command outcome at the top of the HUD.

### AC 9 — 3D Replay

The replay system reconstructs any past scene state from the event log:

| Component | Role |
|---|---|
| `SceneRecorder` | Captures agent-store + spatial-store state changes into `SceneEventLog` |
| `ReplayEngine` | RAF playback loop; drives the playhead |
| `SceneGraphReplayBridge` | Applies reconstructed diffs to 3D scene stores per tick |
| `ReplaySpatialLayoutMount` | Reconstructs 3D positions from `layout.*` events at cursor |
| `ReplayControlPanel` | HUD controls: play/pause/scrub, speed |

Replay is triggered by `interaction.replay_triggered`. During replay, live WS events are paused
and the scene is driven entirely by the cursor store.

### AC 10 — Meeting Convocation

Meetings follow a four-phase protocol: `convene → deliberate → resolve → adjourn`.

Event sequence:
```
meeting.scheduled → meeting.started
  → meeting.participant.joined (×N)
  → meeting.deliberation
  → meeting.resolved → meeting.task.spawned (×M)
  → meeting.ended
```

`ConveneMeetingDialog` posts a meeting request to the `MeetingHttpServer` (port 8081). Agent
avatars physically gather in the designated room (`gatherAgentsForMeeting`) and disperse on
`meeting.ended` (`disperseAgentsFromMeeting`). `ActiveSessionsPanel` lists live session handles;
`MeetingSessionPanel` shows the full transcript and termination controls. `MeetingProtocolPanel`
visualizes the current phase.

### AC 11 — GUI Self-Improvement Cycle

The Command Center is instrumented with full telemetry:

1. `InteractionReducer` records all `interaction.*` events to `runtime/interactions/*.json`
2. `FixtureReducer` records all `fixture.*` events to `runtime/fixtures/*.json`
3. Telemetry is stored separately from the primary event log (RFC-1.0.1 §4 Sub-AC 4 isolation)
4. Analysis of activation heatmaps, dwell times, and command-conversion rates drives autonomous
   layout and fixture changes — emitted as `layout.*` and `fixture.*` events that enter the normal
   pipeline, producing a self-improving GUI loop.

### AC 12 — Room Mapping

`RoomMappingPanel` exposes the full room → role mapping to the operator. Overrides are persisted to
`localStorage` and re-applied on startup by `RoomMappingHotReloadBridge`. The canonical defaults
are in `_room-mapping.yaml`. The `room-mapping-store` and `room-mapping-persistence` modules
handle in-memory state and persistence respectively.

### AC 13 — Web + Desktop Deployment

| Mode | Command | Port |
|---|---|---|
| Web (dev) | `pnpm dev` | 3100 |
| Web (preview) | `pnpm preview` | vite default |
| Desktop (dev) | `pnpm electron:dev` | 3100 + Electron |
| Desktop (dist) | `pnpm electron:dist` | native binary |

Electron entry point: `electron/main.ts`. The preload script (`electron/preload.ts`) exposes a
typed `window.electronAPI` bridge for file system access not available in the web sandbox.

### AC 14 — Automated Test Suite

The test suite runs with Vitest across 193 test files. The CI gate script
(`scripts/ci-test-count-check.mjs`) fails the build if the total test count drops below the
expected threshold, preventing silent regression by test deletion.

```bash
pnpm test        # run all tests
pnpm test:ci     # run + count gate
```

### AC 15 — Scale Support

The scene is designed for:

- 3–20 concurrent agent avatars
- Up to 200 visible tasks
- 30 fps sustained on mid-range hardware

Performance mechanisms: `BirdsEyeLODLayer` (LOD switching at camera distance thresholds),
`VirtualizedTaskOrbLayer` (renders only task orbs within the camera frustum),
`BatchedConnectorLines` (batched geometry for connector lines), `spatial-index-store`
(spatial indexing for fast nearest-neighbor queries).

### AC 16 — New EventTypes

The following EventType families were added for the 3D Command Center, extending the base
RFC-1.0.1 set. See Section 5 for the full list.

| Family | Events added | Purpose |
|---|---|---|
| `layout.*` | 10 | Spatial bootstrapping and mutation |
| `meeting.*` | 10 | Room-based collaboration lifecycle |
| `agent.*` (extended) | 13 | Idle, health, capability, spatial, lifecycle ops |
| `command.*` (extended) | 8 | Full control-plane dispatching lifecycle |
| `pipeline.*` | 9 | Multi-step execution with stage symmetry |
| `schema.*` | 8 | Ontology self-registration and evolution |
| `interaction.*` | 11 | GUI operator input and 3D pointer events |
| `fixture.*` | 8 | Diegetic in-world affordance state changes |

---

## 4. Ontology — ConitensWorldModel

The world model captures the full state of the Command Center as 16 fields. This is the
reflexive-closure of the system: the ontology itself is representable within the event log via
`schema.*` events.

| Field | Description |
|---|---|
| `building` | Top-level spatial container; one per deployment |
| `office` | Named project space within a building (future: multi-project) |
| `room` | Role-group space within an office; maps to `.agent/rooms/*.yaml` |
| `agent_instance` | Live or inactive agent placed in a room |
| `task` | Unit of work tracked through the task state machine |
| `task_agent_mapping` | Association between a task and its assigned agent |
| `meeting` | A convened deliberation session within a room |
| `spatial_layout` | 3D position and geometry of all scene nodes |
| `replay_state` | Playhead, speed, and event cursor for 3D replay |
| `command` | A control-plane intent written to `.conitens/commands/` |
| `pipeline` | A multi-step execution run across one or more agents |
| `event_log` | The append-only JSONL record — single source of truth |
| `ontology_schema` | Self-description of the world model (reflexive closure) |
| `interaction_intent` | Pending or in-flight GUI operator intent |
| `ui_fixture` | Diegetic 3D affordance (panel, handle, button) |
| `view_window` | Active camera viewport and navigation state |

---

## 5. Event Types Reference

121 EventTypes total, defined in `packages/protocol/src/event.ts`.

### Core RFC-1.0.1 events (57)

| Category | EventTypes |
|---|---|
| `task.*` (8) | `task.created`, `task.assigned`, `task.status_changed`, `task.spec_updated`, `task.artifact_added`, `task.completed`, `task.failed`, `task.cancelled` |
| `handoff.*` (4) | `handoff.requested`, `handoff.accepted`, `handoff.rejected`, `handoff.completed` |
| `decision.*` (3) | `decision.proposed`, `decision.accepted`, `decision.rejected` |
| `approval.*` (3) | `approval.requested`, `approval.granted`, `approval.denied` |
| `agent.*` core (4) | `agent.spawned`, `agent.heartbeat`, `agent.error`, `agent.terminated` |
| `message.*` (3) | `message.received`, `message.sent`, `message.internal` |
| `memory.*` (4) | `memory.recalled`, `memory.update_proposed`, `memory.update_approved`, `memory.update_rejected` |
| `mode.*` (2) | `mode.switch_requested`, `mode.switch_completed` |
| `system.*` (3) | `system.started`, `system.shutdown`, `system.reconciliation` |
| `command.*` core (5) | `command.issued`, `command.acknowledged`, `command.completed`, `command.failed`, `command.rejected` |
| `pipeline.*` core (4) | `pipeline.started`, `pipeline.step`, `pipeline.completed`, `pipeline.failed` |

### 3D Command Center extensions (64)

| Category | EventTypes |
|---|---|
| `agent.*` extended (13) | `agent.migrated`, `agent.lifecycle.changed`, `agent.idle`, `agent.health_changed`, `agent.capability_changed`, `agent.persona_updated`, `agent.moved`, `agent.assigned`, `agent.status_changed`, `agent.task.started`, `agent.task.completed`, `agent.spawn_requested`, `agent.paused`, `agent.resumed`, `agent.suspended`, `agent.retire_requested`, `agent.retired`, `agent.migration_requested` |
| `command.*` extended (7) | `command.dispatched`, `command.queued`, `command.retried`, `command.timeout`, `command.cancelled`, `command.escalated`, `command.state_changed` |
| `pipeline.*` extended (5) | `pipeline.stage_started`, `pipeline.stage_completed`, `pipeline.stage_failed`, `pipeline.task_routed`, `pipeline.cancelled` |
| `layout.*` (10) | `layout.init`, `layout.created`, `layout.update`, `layout.updated`, `layout.deleted`, `layout.node.moved`, `layout.changed`, `layout.reset`, `layout.saved`, `layout.loaded` |
| `meeting.*` (10) | `meeting.scheduled`, `meeting.started`, `meeting.ended`, `meeting.participant.joined`, `meeting.participant.left`, `meeting.deliberation`, `meeting.resolved`, `meeting.task.spawned`, `meeting.cancelled`, `meeting.rescheduled` |
| `schema.*` (8) | `schema.registered`, `schema.updated`, `schema.deprecated`, `schema.removed`, `schema.validation_started`, `schema.validated`, `schema.migration_started`, `schema.migrated` |
| `interaction.*` (11) | `interaction.user_input`, `interaction.selection_changed`, `interaction.replay_triggered`, `interaction.viewport_changed`, `interaction.selected`, `interaction.hovered`, `interaction.dismissed`, `interaction.click`, `interaction.drag`, `interaction.hover`, `interaction.command_executed`, `interaction.notification_received` |
| `fixture.*` (8) | `fixture.panel_toggled`, `fixture.handle_pulled`, `fixture.button_pressed`, `fixture.state_changed`, `fixture.placed`, `fixture.removed`, `fixture.updated`, `fixture.state_sync` |

> Obsolete aliases (`task.updated`, `message.new`, `artifact.generated`, `approval.required`,
> `memory.updated`) are resolved by `resolveAlias()` in `event.ts` — they map to their canonical
> successors and must not be emitted by new code.

---

## 6. Development

### Monorepo Structure

```
packages/
  protocol/          @conitens/protocol — types, validation, path classification
  core/              @conitens/core     — orchestrator, reducers, event log, ws-bus
  command-center/    @conitens/command-center — 3D GUI (React Three Fiber + Electron)
  tui/               @conitens/tui      — Ink terminal monitor
  dashboard/         @conitens/dashboard — 2D web dashboard
```

### Key Files

| File | Purpose |
|---|---|
| `packages/protocol/src/event.ts` | `EVENT_TYPES` array — canonical EventType dictionary |
| `packages/protocol/src/ownership.ts` | `REDUCERS` table — 17 reducers with owned files |
| `packages/protocol/src/paths.ts` | `classifyPath()` — assigns every `.conitens/` path to a plane |
| `packages/protocol/src/task-state.ts` | `VALID_TRANSITIONS` — task state machine |
| `packages/protocol/src/redaction.ts` | `redactPayload()` — pre-append secret masking |
| `packages/core/src/orchestrator/orchestrator.ts` | chokidar watch → validate → append → reduce |
| `packages/core/src/reducers/index.ts` | Reducer registry |
| `packages/command-center/src/App.tsx` | Root component; mounts all bridges and scene |
| `packages/command-center/src/scene/CommandCenterScene.tsx` | Three.js canvas root |
| `.agent/rooms/_building.yaml` | Building manifest (floors, rooms, agents) |
| `.agent/rooms/_schema.yaml` | YAML schema for room config files |
| `.agent/rooms/_room-mapping.yaml` | Default role → room mappings |

### Adding a New EventType

1. Append the string literal to `EVENT_TYPES` in `packages/protocol/src/event.ts`.
2. Add the EventType to the appropriate `REDUCERS[n].inputEvents` array in
   `packages/protocol/src/ownership.ts`, or create a new `ReducerDescriptor` entry.
3. Update `classifyPath()` in `packages/protocol/src/paths.ts` if the new reducer writes to a new
   path pattern.
4. Run `pnpm test` — the exhaustiveness tests in `packages/protocol/tests/protocol.test.ts` will
   catch any mismatch between the EventType array and the reducer coverage.

### Adding a New Reducer

1. Add the `ReducerName` literal to the union type in `packages/protocol/src/ownership.ts`.
2. Push a `ReducerDescriptor` to the `REDUCERS` array with `ownedFiles`, `inputEvents`, and
   `readsFrom`.
3. Implement the reducer class in `packages/core/src/reducers/` following the `BaseReducer`
   interface.
4. Register it in `packages/core/src/reducers/index.ts`.
5. The ownership-uniqueness test in `protocol.test.ts` will fail if two reducers claim the same
   output file — fix the conflict before merging.

### Adding a Room

1. Create `.agent/rooms/<room-id>.yaml` following `.agent/rooms/_schema.yaml`.
2. Add `<room-id>` to the appropriate `floor_plan[n].rooms` list in `.agent/rooms/_building.yaml`.
3. Optionally add adjacency entries and assign an agent in `agent_assignments`.
4. The `use-room-loader` hook will pick up the new file on next load (hot-reload in dev).

### 7 Invariants — Never Violate

| # | Invariant |
|---|---|
| I-1 | `events/*.jsonl` append is the **only** commit point |
| I-2 | All view-plane files must be regenerable from the event log alone (no runtime dependency) |
| I-3 | Agents and channel adapters must not directly modify view or entity files |
| I-4 | `MODE.md` changes provider binding only |
| I-5 | All external dispatch requires an approval gate |
| I-6 | Every event payload must pass `redactPayload()` before append |
| I-7 | Each file has exactly one owner (writer) — see `findOwner()` in `ownership.ts` |

---

## 7. Evolution History — 7-Generation Ouroboros Development

The Command Center was developed through the Ouroboros evolutionary loop:
`Interview → Seed → Execute → Evaluate → Evolve`.

| Gen | AC Pass | Score | Key Development |
|---|---|---|---|
| 1 | 13/16 | ~0.81 | Initial ontology (9 fields), basic 3D scene, bird's-eye view |
| 2 | 13/16 | 0.81 | Ontology growth to 12 fields; Wonder questions surfaced missing meeting + schema concepts |
| 3 | 13/16 | 0.81 | Diegetic fixtures added; interaction telemetry wired; 3 ACs still blocked on meeting convocation |
| 4 | 3/16 | 0.19 | **Collapse** — too many fine-grained ontology entities caused incoherence; meeting + pipeline entities exploded the model |
| 5 | 16/16 | 1.0 | **"Less is more" breakthrough** — collapsed 22 micro-entities back to 16 composable fields; all AC unblocked |
| 6 | 15/16 | 0.94 | 93.75% convergence; AC 11 (self-improvement cycle) partial; telemetry isolation refined |
| 7 | 16/16 | 1.0 | **100% convergence** — fixture.state_sync chain completed; code-review fixes (I-6 redaction, TTL dedupe, DRY pipeline extraction); 9,368 tests passing |

### Key Lessons from the Evolutionary Loop

- **Ontology size is not ontology quality.** Gen 4's collapse showed that 22 micro-entities with
  overlapping concerns are harder to reason about than 16 well-scoped composable fields.
- **Reflexive closure requires discipline.** The `ontology_schema` field (AC 16 / `schema.*`
  events) could not be added as an afterthought — it had to be a first-class field from Gen 5
  onward for the self-registration tests to pass.
- **Diegetic beats overlay.** Operator comprehension improved substantially when metrics moved from
  2D HUD overlays onto in-world monitor screens (Gen 3 → Gen 5 retention).
- **Event symmetry reduces bugs.** Adding symmetric `stage_started` / `stage_completed` /
  `stage_failed` events (Sub-AC 16c) eliminated an entire class of "where did the pipeline go?"
  replay reconstruction bugs that appeared in Gens 2–4.

---

## Appendix: Useful Commands

```bash
# Start full stack (core + command-center)
pnpm --filter @conitens/core dev &
pnpm --filter @conitens/command-center dev

# Type-check only (no emit)
pnpm --filter @conitens/command-center typecheck

# Protocol invariant tests only
pnpm --filter @conitens/protocol test

# Verify web build output
pnpm --filter @conitens/command-center build:web:verify

# Electron distribution (all platforms via CI)
pnpm --filter @conitens/command-center electron:dist
```

---

*Guide version: 1.0 · 2026-03-26*
