# LATEST_CONTEXT

> Generated: 2026-03-31T23:49:41.652861Z
> Pack: conitens-repo-intel

## [1] Recent Changes

- `.vibe/brain/precommit.py`
- `.vibe/brain/typecheck_baseline.py`
- `.vibe/brain/indexer.py`
- `tests/test_vibe_quality_gates.py`
- `scripts/install_hooks.py`
- `tests/test_vibe_quality.py`
- `tests/test_vibe_brain.py`
- `tests/test_vibe_sidecar.py`

## [2] Critical Map

- `packages/command-center/src/App.tsx:87` App [exported, react, typescript]
- `packages/command-center/src/components/ActiveSessionsPanel.tsx:283` ActiveSessionsPanel [exported, react, typescript]
- `packages/command-center/src/components/ContextMenuDispatcher.tsx:127` useContextMenu [exported, react, typescript]
- `packages/command-center/src/components/ContextMenuDispatcher.tsx:444` ContextMenuPortal [exported, react, typescript]
- `packages/command-center/src/components/ConveneMeetingDialog.tsx:43` ConveneMeetingDialog [exported, react, typescript]
- `packages/command-center/src/components/HUD.tsx:2412` HUD [exported, react, typescript]
- `packages/command-center/src/components/MeetingProtocolPanel.tsx:308` MeetingProtocolPanel [exported, react, typescript]
- `packages/command-center/src/components/MeetingSessionPanel.tsx:134` MeetingSessionPanel [exported, react, typescript]

## [3] Warnings

- `packages/command-center/src/store/spatial-store.ts` has high inbound dependency count (59)
- `packages/command-center/src/store/agent-store.ts` has high inbound dependency count (57)
- `packages/command-center/src/data/building.ts` has high inbound dependency count (38)
- `packages/command-center/src/store/task-store.ts` has high inbound dependency count (23)
- `packages/command-center/src/store/scene-event-log.ts` has high inbound dependency count (18)
- `packages/command-center/src/data/agents.ts` has high inbound dependency count (18)
- `packages/core/src/event-log/event-log.ts` has high inbound dependency count (14)
- `packages/command-center/src/store/metrics-store.ts` has high inbound dependency count (13)

## [4] Hotspots

- `packages/command-center/src/store/spatial-store.ts` loc=1417, functions=4, inbound_deps=59
- `packages/command-center/src/store/agent-store.ts` loc=1677, functions=2, inbound_deps=57
- `packages/command-center/src/data/building.ts` loc=434, functions=3, inbound_deps=38
- `packages/command-center/src/store/task-store.ts` loc=1066, functions=6, inbound_deps=23
- `packages/command-center/src/store/scene-event-log.ts` loc=567, functions=2, inbound_deps=18
- `packages/command-center/src/data/agents.ts` loc=208, functions=2, inbound_deps=18
- `packages/core/src/event-log/event-log.ts` loc=128, functions=0, inbound_deps=14
- `packages/command-center/src/store/metrics-store.ts` loc=508, functions=8, inbound_deps=13

## [5] Next Actions

- Investigate `packages/command-center/src/store/spatial-store.ts` has high inbound dependency count (59)
- Investigate `packages/command-center/src/store/agent-store.ts` has high inbound dependency count (57)
- Investigate `packages/command-center/src/data/building.ts` has high inbound dependency count (38)
