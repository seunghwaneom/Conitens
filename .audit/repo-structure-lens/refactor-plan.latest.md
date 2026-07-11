# Repo Structure Lens Refactor Plan

- Evidence: `.audit/repo-structure-lens/checklist-facts.json`
- Generated: `2026-07-10T00:00:02+00:00`

## Cleanup Boundary

- Preserve behavior first. Add regression tests around visible behavior before moving code.
- Prefer deleting duplicate helpers or replacing call sites with existing SSOT utilities.
- Do not widen fallback handling. Move error handling to explicit boundaries.
- Keep each slice reversible and verify after each slice.

## Suggested Slices

1. Flatten/split `packages/dashboard/src/App.tsx:127` `App` (loc=2620, depth=8, complexity=685).
2. Flatten/split `packages/command-center/src/components/RoomMappingPanel.tsx:73` `RoomMappingPanel` (loc=1427, depth=7, complexity=150).
3. Flatten/split `packages/command-center/src/hooks/use-action-dispatcher.ts:305` `useActionDispatcherImpl` (loc=585, depth=9, complexity=151).
4. Flatten/split `packages/command-center/src/scene/GlobalDashboardPanel.tsx:435` `GlobalDashboardPanel` (loc=487, depth=5, complexity=44).
5. Flatten/split `packages/command-center/src/components/HUD.tsx:78` `RoomDetailPanel` (loc=372, depth=7, complexity=37).
6. Flatten/split `packages/command-center/src/components/TopologyPanel.tsx:54` `TopologyPanel` (loc=354, depth=8, complexity=37).
7. Flatten/split `packages/command-center/src/components/HUD.tsx:862` `AgentDetailPanel` (loc=337, depth=7, complexity=35).
8. Flatten/split `packages/command-center/src/testing/three-renderer-mock.ts:82` `makeWebGL2Context` (loc=316, depth=5, complexity=24).
9. Choose an SSOT for duplicate shape `063df3b220e21f85` across `packages/command-center/src/data/building.ts:23`, `packages/command-center/src/data/entity-affordance-defs.ts:116`, `packages/command-center/src/data/entity-affordance-defs.ts:481`, `packages/command-center/src/replay/spatial-layout-reconstruction.ts:73`, `packages/command-center/src/scene/agent-interaction-intents.ts:86`.
10. Choose an SSOT for duplicate shape `56ea74018c70fa09` across `packages/dashboard/src/office-avatar-sprites.ts:26`, `packages/dashboard/src/office-stage-schema.ts:89`, `packages/dashboard/src/office-stage-schema.ts:102`, `packages/dashboard/src/spatial-lens/assets/assetRegistry.ts:21`, `packages/dashboard/src/spatial-lens/model/floorGeometry.ts:29`.
11. Choose an SSOT for duplicate shape `47835da0a39e07c4` across `packages/command-center/src/scene/agent-interaction-intents.ts:93`, `packages/command-center/src/scene/building-interaction-intents.ts:77`, `packages/command-center/src/scene/fixture-interaction-intents.ts:102`, `packages/command-center/src/scene/room-interaction-intents.ts:80`, `packages/dashboard/src/spatial-lens/assets/assetRegistry.ts:16`.
12. Choose an SSOT for duplicate shape `7650db6833aa0dad` across `packages/dashboard/src/office-stage-schema.ts:49`, `packages/dashboard/src/office-stage-schema.ts:62`, `packages/dashboard/src/spatial-lens/model/floorGeometry.ts:36`, `packages/dashboard/src/spatial-lens/viewport/floorLayout.ts:8`.
13. Choose an SSOT for duplicate shape `c06c82fc926f4a10` across `packages/command-center/src/data/defaults/room-office-mapping.ts:279`, `packages/command-center/src/data/room-agent-hierarchy.ts:360`, `packages/command-center/src/data/room-config-schema.ts:593`, `packages/command-center/src/data/room-manifest-loader.ts:414`.
14. Choose an SSOT for duplicate shape `3ba4a24d83f48242` across `packages/command-center/src/scene/DashboardPanel.tsx:214`, `packages/command-center/src/scene/DashboardPanelInteraction.tsx:606`, `packages/command-center/src/scene/DashboardPanelMetrics.tsx:567`.
15. Review barrel `packages/core/src/index.ts` (reexports=18, star=18).
16. Review barrel `packages/core/src/reducers/index.ts` (reexports=6, star=0).
17. Review barrel `packages/tui/src/index.ts` (reexports=5, star=0).
18. Review barrel `packages/core/src/channels/index.ts` (reexports=4, star=0).
19. Review barrel `packages/core/src/a2a/index.ts` (reexports=1, star=0).
20. Review barrel `packages/core/src/agent-spawner/index.ts` (reexports=1, star=0).

## Test Locking Checklist

- Add behavior assertions for empty input, null/undefined, boundary values, and failure paths.
- Mock only external IO or process boundaries.
- Verify side effects through public behavior, not implementation function names.

## Review Gates

- No new `as any`, `as unknown as`, empty catch, or broad fallback cues.
- No new cycles or fan-in/fan-out hotspot increases without an explicit rationale.
- No new helper/shape when an existing symbol or duplicate shape cue already covers it.
