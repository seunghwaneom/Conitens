# Repo Structure Lens Audit

- Generated: `2026-07-10T14:34:37+00:00`
- Mode: `post-write`
- Profile: `quick`
- Root: `D:\Google\.Conitens`
- Source files scanned: `670`
- Scan strategy: `git-ls-files`
- Include untracked files: `True`

## Top Risk Counters

- `289` Type escape cues: Replace escape hatches with explicit contracts.
- `109` Swallowed error cues: Handle errors at boundaries, not silently in helpers.
- `75` Large/complex functions: Flatten depth and split by behavior.
- `50` Large files: Separate layer/domain responsibilities.
- `50` Duplicate function-structure groups: Review before adding helpers.
- `46` Duplicate shape groups: Promote exact repeated shapes to a single source.
- `21` Weak test cues: Assert behavior and edge cases, not symbol presence.
- `18` Barrel files: Replace broad re-export surfaces with explicit imports where possible.
- `0` Dependency cycles: Break cycles before broad refactors.

## First Review Targets

- `packages/protocol/tests/protocol.test.ts` loc=3307 functions=0 layer=test
- `packages/command-center/src/components/HUD.tsx` loc=2773 functions=32 layer=ui
- `packages/dashboard/src/App.tsx` loc=2496 functions=24 layer=unclear
- `packages/command-center/src/components/RoomMappingPanel.tsx` loc=1731 functions=11 layer=ui
- `packages/command-center/src/scene/TaskConnectors.tsx` loc=1679 functions=12 layer=unclear
- `packages/command-center/src/store/agent-store.ts` loc=1677 functions=9 layer=state
- `packages/protocol/src/command-pipeline.ts` loc=1553 functions=24 layer=unclear
- `packages/command-center/src/scene/SceneHierarchy.tsx` loc=1544 functions=23 layer=unclear
- `packages/command-center/src/data/defaults/room-office-mapping.ts` loc=1506 functions=14 layer=unclear
- `packages/command-center/src/store/spatial-store.ts` loc=1417 functions=4 layer=state

## Complex Functions

- `packages/dashboard/src/App.tsx:115` `App` loc=2382 depth=8 complexity=626
- `packages/command-center/src/components/RoomMappingPanel.tsx:73` `RoomMappingPanel` loc=1427 depth=7 complexity=150
- `packages/command-center/src/hooks/use-action-dispatcher.ts:305` `useActionDispatcherImpl` loc=585 depth=9 complexity=151
- `packages/command-center/src/scene/GlobalDashboardPanel.tsx:435` `GlobalDashboardPanel` loc=487 depth=5 complexity=44
- `packages/command-center/src/components/HUD.tsx:78` `RoomDetailPanel` loc=372 depth=7 complexity=37
- `packages/command-center/src/components/TopologyPanel.tsx:54` `TopologyPanel` loc=354 depth=8 complexity=37
- `packages/command-center/src/components/HUD.tsx:862` `AgentDetailPanel` loc=337 depth=7 complexity=35
- `packages/command-center/src/testing/three-renderer-mock.ts:82` `makeWebGL2Context` loc=316 depth=5 complexity=24
- `packages/command-center/src/components/ContextMenuDispatcher.tsx:127` `useContextMenu` loc=306 depth=7 complexity=44
- `packages/command-center/src/components/HUD.tsx:1217` `BuildingContextPanel` loc=305 depth=6 complexity=31
- `packages/command-center/src/scene/TaskConnectors.tsx:1373` `TaskConnectorsLayer` loc=303 depth=5 complexity=24
- `packages/command-center/src/hooks/use-room-mapping-api.ts:540` `useRoomMappingApi` loc=301 depth=8 complexity=39
- `packages/command-center/src/office/PixelOffice.tsx:225` `PixelOffice` loc=293 depth=6 complexity=26
- `packages/command-center/src/components/ConveneMeetingDialog.tsx:43` `ConveneMeetingDialog` loc=290 depth=8 complexity=24
- `packages/command-center/src/components/HUD.tsx:1540` `FloorContextPanel` loc=285 depth=7 complexity=31

## Coupling

- No relative import cycles found by the heuristic graph.

### Fan-In Hubs

- `packages/dashboard/src/agent-profiles.ts` imported by `10` source files
- `packages/dashboard/src/spatial-lens/viewport/roomTemplates.ts` imported by `7` source files
- `packages/dashboard/src/forward-bridge-types.ts` imported by `6` source files
- `packages/dashboard/src/forward-route.ts` imported by `6` source files
- `packages/dashboard/src/office-presence-model.ts` imported by `6` source files
- `packages/dashboard/src/office-stage-schema.ts` imported by `6` source files
- `packages/dashboard/src/demo-data.ts` imported by `5` source files
- `packages/command-center/src/data/agents.ts` imported by `4` source files
- `packages/dashboard/src/dashboard-model.ts` imported by `4` source files
- `packages/dashboard/src/spatial-lens/viewport/floorLayout.ts` imported by `4` source files

### Fan-Out Hubs

- `packages/dashboard/tests/forward-bridge.test.mjs` imports `9` local source files
- `packages/dashboard/src/spatial-lens/model/floorGeometry.ts` imports `8` local source files
- `packages/dashboard/tests/office-presence-model.test.mjs` imports `8` local source files
- `packages/dashboard/src/agent-character-stage-model.ts` imports `7` local source files
- `packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs` imports `6` local source files
- `packages/dashboard/src/forward-bridge.ts` imports `5` local source files
- `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs` imports `5` local source files
- `packages/dashboard/src/office-presence-model.ts` imports `4` local source files
- `packages/dashboard/tests/agent-character-stage.test.mjs` imports `4` local source files
- `packages/dashboard/tests/agent-profiles.test.mjs` imports `4` local source files

## Duplicate Cues

- Shape hash `063df3b220e21f85`: `packages/command-center/src/data/building.ts:23`, `packages/command-center/src/data/entity-affordance-defs.ts:116`, `packages/command-center/src/data/entity-affordance-defs.ts:481`, `packages/command-center/src/replay/spatial-layout-reconstruction.ts:73`, `packages/command-center/src/scene/agent-interaction-intents.ts:86`, `packages/command-center/src/scene/building-interaction-intents.ts:70`
- Shape hash `56ea74018c70fa09`: `packages/dashboard/src/office-avatar-sprites.ts:26`, `packages/dashboard/src/office-stage-schema.ts:89`, `packages/dashboard/src/office-stage-schema.ts:102`, `packages/dashboard/src/spatial-lens/assets/assetRegistry.ts:21`, `packages/dashboard/src/spatial-lens/model/floorGeometry.ts:29`, `packages/dashboard/src/spatial-lens/viewport/floorLayout.ts:1`
- Shape hash `47835da0a39e07c4`: `packages/command-center/src/scene/agent-interaction-intents.ts:93`, `packages/command-center/src/scene/building-interaction-intents.ts:77`, `packages/command-center/src/scene/fixture-interaction-intents.ts:102`, `packages/command-center/src/scene/room-interaction-intents.ts:80`, `packages/dashboard/src/spatial-lens/assets/assetRegistry.ts:16`, `packages/dashboard/src/spatial-lens/assets/generatedAssetManifest.ts:13`
- Shape hash `7650db6833aa0dad`: `packages/dashboard/src/office-stage-schema.ts:49`, `packages/dashboard/src/office-stage-schema.ts:62`, `packages/dashboard/src/spatial-lens/model/floorGeometry.ts:36`, `packages/dashboard/src/spatial-lens/viewport/floorLayout.ts:8`
- Shape hash `c06c82fc926f4a10`: `packages/command-center/src/data/defaults/room-office-mapping.ts:279`, `packages/command-center/src/data/room-agent-hierarchy.ts:360`, `packages/command-center/src/data/room-config-schema.ts:593`, `packages/command-center/src/data/room-manifest-loader.ts:414`
- Shape hash `3ba4a24d83f48242`: `packages/command-center/src/scene/DashboardPanel.tsx:214`, `packages/command-center/src/scene/DashboardPanelInteraction.tsx:606`, `packages/command-center/src/scene/DashboardPanelMetrics.tsx:567`
- Shape hash `3ffde48eb8e6e974`: `packages/command-center/src/hooks/use-hierarchy-navigation.ts:154`, `packages/command-center/src/scene/RoomMappingEditor3D.tsx:235`, `packages/command-center/src/scene/RoomMappingEditor3D.tsx:500`
- Shape hash `813c0651b705637c`: `packages/command-center/src/scene/MetricsBillboard.tsx:82`, `packages/command-center/src/utils/canvas-charts.ts:277`, `packages/command-center/src/utils/canvas-charts.ts:394`
- Shape hash `95a53f547e8b24a8`: `packages/command-center/src/store/meeting-store.ts:104`, `packages/core/src/meeting-orchestrator/collaboration-session.ts:239`, `packages/protocol/src/meeting-state.ts:188`
- Shape hash `b22e9e5d79c9d139`: `packages/command-center/src/store/meeting-store.ts:158`, `packages/core/src/meeting-orchestrator/collaboration-session.ts:195`, `packages/protocol/src/meeting-state.ts:232`

- Function structure `44136fa355b3678a`: `packages/command-center/src/components/__tests__/meeting-protocol-panel.test.ts:37` `makeSession`, `packages/command-center/src/components/__tests__/meeting-protocol-panel.test.ts:63` `makeTask`, `packages/command-center/src/data/room-mapping-resolver.ts:115` `resolveAgentRoom`, `packages/command-center/src/hooks/__tests__/use-affordance-interaction-handlers.test.ts:90` `makeAffordance`, `packages/command-center/src/hooks/__tests__/use-affordance-interaction-handlers.test.ts:108` `makeCtx`, `packages/command-center/src/hooks/__tests__/use-room-config-control-plane.test.ts:66` `makeRoom`
- Function structure `2dbef921260d447a`: `packages/command-center/src/components/ActiveSessionsPanel.tsx:67` `ParticipantRow`, `packages/command-center/src/components/CommandLogPanel.tsx:546` `CommandStatusSummary`, `packages/command-center/src/components/MeetingProtocolPanel.tsx:244` `TaskRow`, `packages/command-center/src/components/MeetingProtocolPanel.tsx:285` `EventLogRow`, `packages/command-center/src/components/MeetingSessionPanel.tsx:81` `ParticipantRow`, `packages/command-center/src/components/MeetingSessionPanel.tsx:113` `TranscriptLine`
- Function structure `18af90b4398c12e5`: `.omo/evidence/run-agent-character-stage-qa.mjs:171` `collectExpression`, `.omo/evidence/run-frontend-design-architecture-qa.mjs:234` `collectScenarioExpression`, `.ref/dedupe.ts:13` `makeIdempotencyKey`, `packages/command-center/src/data/defaults/room-office-mapping.ts:1331` `getRoomOfficeMapping`, `packages/command-center/src/data/entity-affordance-defs.ts:236` `agentAffordanceId`, `packages/command-center/src/data/entity-affordance-defs.ts:244` `agentMenuAnchorId`
- Function structure `2b6259919e907430`: `packages/command-center/src/components/MeetingProtocolPanel.tsx:132` `ProtocolStepper`, `packages/command-center/src/components/MeetingProtocolPanel.tsx:210` `AgentRow`, `packages/command-center/src/components/TaskManagementPanel.tsx:202` `CreateTaskForm`, `packages/command-center/src/scene/AgentAvatar.tsx:255` `FootRing`, `packages/command-center/src/scene/AgentAvatar.tsx:364` `AgentBadge`, `packages/command-center/src/scene/BirdsEyeLODLayer.tsx:225` `BuildingFootprintOutline`
- Function structure `1f66313193e9864c`: `.ref/event.ts:43` `isValidEventType`, `.ref/task-state.ts:31` `isTerminal`, `packages/command-center/src/data/entity-affordance-defs.ts:78` `isAffordanceKind`, `packages/command-center/src/data/entity-affordance-defs.ts:107` `isControllableEntityType`, `packages/command-center/src/data/task-types.ts:85` `isTaskTerminal`, `packages/command-center/src/data/task-types.ts:89` `isTaskActive`
- Function structure `4cfd8b7de117e592`: `packages/command-center/src/data/agent-seed.ts:424` `computeWorldFromLocal`, `packages/command-center/src/data/agent-seed.ts:443` `validateSeedWorldPosition`, `packages/command-center/src/data/room-config-schema.ts:566` `buildPlacementFromTypeDefaults`, `packages/command-center/src/data/ui-fixture-registry.ts:543` `computeFixtureWorldPosition`, `packages/command-center/src/data/ui-fixture-registry.ts:562` `computeFixtureWorldRotation`, `packages/command-center/src/hooks/use-replay-spatial-layout.ts:294` `getReplayRoomPosition`
- Function structure `5152980d23865174`: `packages/command-center/src/components/PipelineCommandInterface.tsx:290` `DefinitionCard`, `packages/command-center/src/components/TaskManagementPanel.tsx:381` `CancelTaskConfirm`, `packages/command-center/src/scene/AgentAvatar.tsx:170` `AvatarBody`, `packages/command-center/src/scene/AgentAvatar.tsx:220` `AvatarHead`, `packages/command-center/src/scene/BirdsEyeConnectorLayer.tsx:200` `AgentRingIndicator`, `packages/command-center/src/scene/BirdsEyeConnectorLayer.tsx:248` `TaskDiscIndicator`
- Function structure `26414fac78176e5d`: `packages/command-center/src/data/defaults/room-office-mapping.ts:1339` `resetRoomOfficeMapping`, `packages/command-center/src/data/room-config-schema.ts:1040` `resetRoomConfig`, `packages/command-center/src/hooks/__tests__/use-replay-controller.test.ts:47` `resetSeq`, `packages/command-center/src/hooks/__tests__/use-replay-spatial-layout.test.ts:53` `resetSeq`, `packages/command-center/src/hooks/__tests__/use-room-mapping-3d.test.ts:104` `startDrag`, `packages/command-center/src/hooks/__tests__/use-room-mapping-3d.test.ts:111` `cancelDrag`
- Function structure `a4526f95d62d0ba0`: `packages/command-center/src/scene/agent-interaction-intents.ts:303` `makeAgentClickedIntent`, `packages/command-center/src/scene/agent-interaction-intents.ts:310` `makeAgentHoveredIntent`, `packages/command-center/src/scene/agent-interaction-intents.ts:317` `makeAgentUnhoveredIntent`, `packages/command-center/src/scene/agent-interaction-intents.ts:324` `makeAgentContextMenuIntent`, `packages/command-center/src/scene/building-interaction-intents.ts:240` `makeBuildingClickedIntent`, `packages/command-center/src/scene/building-interaction-intents.ts:247` `makeBuildingHoveredIntent`
- Function structure `1b30d2f093987379`: `packages/command-center/src/data/command-entity.ts:437` `createAndWriteCommandEntity`, `packages/command-center/src/data/command-file-pipeline.ts:194` `advancePipelineEntity`, `packages/command-center/src/data/ui-fixture-registry.ts:586` `computeScreenDimensions`, `packages/command-center/src/hooks/use-agent-fixture-command-bridge.ts:376` `buildAgentLifecycleFixtureDefs`, `packages/command-center/src/hooks/use-room-config-control-plane.ts:84` `parseRoomConfigFixtureId`, `packages/command-center/src/hooks/use-task-fixture-control-plane.ts:77` `parseTaskFixtureId`

## Error And Fallback Cues

- `.omo/evidence/run-agent-character-stage-qa.mjs:82` no visible rethrow/report
- `bin/ensemble.js:47` no visible rethrow/report
- `bin/postinstall.cjs:33` no visible rethrow/report
- `packages/command-center/electron/main.ts:333` no visible rethrow/report
- `packages/command-center/electron/main.ts:457` no visible rethrow/report
- `packages/command-center/scripts/ci-test-count-check.mjs:63` empty catch
- `packages/command-center/scripts/ci-test-count-check.mjs:116` no visible rethrow/report
- `packages/command-center/scripts/ci-test-count-check.mjs:120` empty catch
- `packages/command-center/src/components/MeetingProtocolPanel.tsx:396` no visible rethrow/report
- `packages/command-center/src/data/__tests__/agent-ontology-init.test.ts:518` no visible rethrow/report
- `packages/command-center/src/data/__tests__/agent-ontology-init.test.ts:535` no visible rethrow/report
- `packages/command-center/src/data/__tests__/command-entity.test.ts:465` no visible rethrow/report
- `packages/command-center/src/data/__tests__/room-config-schema.test.ts:298` empty catch
- `packages/command-center/src/data/room-loader.ts:265` no visible rethrow/report
- `packages/command-center/src/data/room-manifest-loader.ts:226` no visible rethrow/report

- `.omo/evidence/run-agent-character-stage-qa.mjs:29` broad ?? fallback
- `.omo/evidence/run-frontend-design-architecture-qa.mjs:44` broad ?? fallback
- `.ref/event.ts:102` broad ?? fallback
- `packages/command-center/src/components/__tests__/room-mapping-panel.test.ts:35` broad ?? fallback
- `packages/command-center/src/components/ContextMenuDispatcher.tsx:310` broad ?? fallback
- `packages/command-center/src/components/MeetingSessionPanel.tsx:146` broad ?? fallback
- `packages/command-center/src/components/NavigationBreadcrumb.tsx:246` broad ?? fallback
- `packages/command-center/src/components/NavigationBreadcrumb.tsx:249` broad ?? fallback
- `packages/command-center/src/components/PipelineCommandInterface.tsx:339` broad ?? fallback
- `packages/command-center/src/components/PipelineCommandInterface.tsx:577` broad ?? fallback
- `packages/command-center/src/components/PipelineCommandInterface.tsx:586` broad ?? fallback
- `packages/command-center/src/components/RoomMappingPanel.tsx:974` broad ?? fallback
- `packages/command-center/src/components/TaskManagementPanel.tsx:659` broad || fallback
- `packages/command-center/src/data/__tests__/agent-task-scale.test.ts:661` broad ?? fallback
- `packages/command-center/src/data/__tests__/layout-init-seeder.test.ts:124` broad ?? fallback

## Test Cues

- `packages/core/tests/instruction-generator.test.ts` assertions=12 low_value=10 mocks=0 edgecase_terms=0
- `packages/core/tests/mve.test.ts` assertions=12 low_value=10 mocks=0 edgecase_terms=0
- `packages/core/tests/reducers.test.ts` assertions=12 low_value=10 mocks=0 edgecase_terms=0
- `packages/command-center/src/scene/__tests__/isolated-build-render-nav.test.ts` assertions=99 low_value=9 mocks=0 edgecase_terms=0
- `packages/core/tests/replay.test.ts` assertions=14 low_value=8 mocks=0 edgecase_terms=0
- `packages/command-center/src/data/__tests__/data-source-config.test.ts` assertions=15 low_value=3 mocks=0 edgecase_terms=0
- `packages/core/tests/trace-logger.test.ts` assertions=16 low_value=2 mocks=0 edgecase_terms=0
- `packages/command-center/src/data/__tests__/status-animation-map.test.ts` assertions=14 low_value=1 mocks=0 edgecase_terms=0
- `packages/core/tests/mode-manager.test.ts` assertions=12 low_value=1 mocks=0 edgecase_terms=0
- `packages/command-center/src/data/__tests__/agent-sprite-map.test.ts` assertions=14 low_value=0 mocks=0 edgecase_terms=0
- `packages/command-center/src/scene/__tests__/birds-eye-clickable-nodes.test.ts` assertions=90 low_value=0 mocks=0 edgecase_terms=0
- `packages/command-center/src/scene/__tests__/birds-eye-lod-layer.test.ts` assertions=57 low_value=0 mocks=0 edgecase_terms=0
- `packages/core/src/command-watcher/__tests__/command-router.test.ts` assertions=42 low_value=0 mocks=0 edgecase_terms=0
- `packages/dashboard/tests/agent-character-stage.test.mjs` assertions=53 low_value=0 mocks=0 edgecase_terms=0
- `packages/dashboard/tests/agent-profiles.test.mjs` assertions=13 low_value=0 mocks=0 edgecase_terms=0

## Post-Write Ripple Gate

- Changed source files from git status: `26`
- `.omo/evidence/run-agent-character-stage-qa.mjs` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/src/App.tsx` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/src/agent-character-portraits.ts` direct_dependents=1 transitive_dependents=1
  - direct: `packages/dashboard/tests/agent-character-stage.test.mjs`
- `packages/dashboard/src/agent-character-stage-model.ts` direct_dependents=1 transitive_dependents=1
  - direct: `packages/dashboard/tests/agent-character-stage.test.mjs`
- `packages/dashboard/src/agent-sprite-manifest.generated.ts` direct_dependents=2 transitive_dependents=14
  - direct: `packages/dashboard/src/agent-character-stage-model.ts`
  - direct: `packages/dashboard/src/office-avatar-sprites.ts`
- `packages/dashboard/src/components/AgentCharacterStage.tsx` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/src/components/OfficeAvatar.tsx` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/src/components/OfficeStage.tsx` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/src/components/OperatorSummaryPanel.tsx` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/src/forward-bridge-parsers.ts` direct_dependents=3 transitive_dependents=6
  - direct: `packages/dashboard/src/forward-bridge-client.ts`
  - direct: `packages/dashboard/src/forward-bridge-stream.ts`
  - direct: `packages/dashboard/src/forward-bridge.ts`
- `packages/dashboard/src/forward-bridge-types.ts` direct_dependents=6 transitive_dependents=9
  - direct: `packages/dashboard/src/forward-bridge-client.ts`
  - direct: `packages/dashboard/src/forward-bridge-parsers.ts`
  - direct: `packages/dashboard/src/forward-bridge-storage.ts`
  - direct: `packages/dashboard/src/forward-bridge-stream.ts`
  - direct: `packages/dashboard/src/forward-bridge.ts`
  - direct: `packages/dashboard/src/operator-workspace-actions.ts`
- `packages/dashboard/src/office-avatar-sprites.ts` direct_dependents=3 transitive_dependents=13
  - direct: `packages/dashboard/src/agent-character-stage-model.ts`
  - direct: `packages/dashboard/src/office-stage-schema.ts`
  - direct: `packages/dashboard/tests/office-presence-model.test.mjs`
- `packages/dashboard/src/operator-summary-model.ts` direct_dependents=1 transitive_dependents=1
  - direct: `packages/dashboard/tests/forward-bridge.test.mjs`
- `packages/dashboard/src/spatial-lens/assets/assetRegistry.ts` direct_dependents=3 transitive_dependents=5
  - direct: `packages/dashboard/src/spatial-lens/model/floorGeometry.ts`
  - direct: `packages/dashboard/tests/spatial-lens-asset-registry.test.mjs`
  - direct: `packages/dashboard/tests/spatial-lens-floor-geometry.test.mjs`
- `packages/dashboard/tests/agent-character-stage.test.mjs` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/tests/dashboard-thin-shell.test.mjs` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/tests/forward-bridge.test.mjs` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/tests/office-generated-fixtures.test.mjs` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/tests/office-preview-shell.test.mjs` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/tests/spatial-lens-asset-registry.test.mjs` direct_dependents=0 transitive_dependents=0
- `packages/dashboard/tests/spatial-lens-pixel-grammar.test.mjs` direct_dependents=0 transitive_dependents=0
- `packages/protocol/src/event.ts` direct_dependents=0 transitive_dependents=0
- `packages/protocol/src/ownership.ts` direct_dependents=0 transitive_dependents=0
- `packages/protocol/src/task-state.ts` direct_dependents=0 transitive_dependents=0
- `packages/protocol/tests/improvement-event.test.ts` direct_dependents=0 transitive_dependents=0

## How To Read This

These are evidence cues for Codex review, not a semantic proof. Open raw JSON for exact data, then inspect source files before changing contracts.
