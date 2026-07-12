# LATEST_CONTEXT

> Generated: 2026-07-10T14:42:04.229791Z
> Pack: conitens-repo-intel

## [1] Recent Changes
<!-- ## Recent Changes -->

- `scripts/ensemble_allowed_events.py`
- `scripts/ensemble_agent_revisions.py`
- `tests/test_agent_revision_application.py`
- `scripts/ensemble.py`
- `scripts/ensemble_owner_auth.py`
- `packages/protocol/tests/improvement-event.test.ts`
- `packages/protocol/src/event.ts`
- `tests/test_owner_auth_compatibility.py`

## [2] Critical Map
<!-- ## Critical Map -->

- `packages/command-center/src/App.tsx:87` App [exported, react, typescript]
- `packages/command-center/src/components/ActiveSessionsPanel.tsx:283` ActiveSessionsPanel [exported, react, typescript]
- `packages/command-center/src/components/ContextMenuDispatcher.tsx:127` useContextMenu [exported, react, typescript]
- `packages/command-center/src/components/ContextMenuDispatcher.tsx:444` ContextMenuPortal [exported, react, typescript]
- `packages/command-center/src/components/ConveneMeetingDialog.tsx:43` ConveneMeetingDialog [exported, react, typescript]
- `packages/command-center/src/components/HUD.tsx:2412` HUD [exported, react, typescript]
- `packages/command-center/src/components/MeetingProtocolPanel.tsx:308` MeetingProtocolPanel [exported, react, typescript]
- `packages/command-center/src/components/MeetingSessionPanel.tsx:134` MeetingSessionPanel [exported, react, typescript]

## [3] Warnings
<!-- ## Warnings -->

- `packages/command-center/src/store/spatial-store.ts` has high inbound dependency count (59)
- `packages/command-center/src/store/agent-store.ts` has high inbound dependency count (57)
- `packages/command-center/src/data/building.ts` has high inbound dependency count (38)
- `packages/command-center/src/store/task-store.ts` has high inbound dependency count (23)
- `packages/command-center/src/store/scene-event-log.ts` has high inbound dependency count (18)
- `packages/command-center/src/data/agents.ts` has high inbound dependency count (18)
- `packages/core/src/event-log/event-log.ts` has high inbound dependency count (14)
- `packages/command-center/src/store/metrics-store.ts` has high inbound dependency count (13)

## [4] Hotspots
<!-- ## Hotspots -->

- `packages/command-center/src/store/spatial-store.ts` loc=1417, functions=4, inbound_deps=59
- `packages/command-center/src/store/agent-store.ts` loc=1677, functions=2, inbound_deps=57
- `packages/command-center/src/data/building.ts` loc=434, functions=3, inbound_deps=38
- `packages/command-center/src/store/task-store.ts` loc=1066, functions=6, inbound_deps=23
- `packages/command-center/src/store/scene-event-log.ts` loc=567, functions=2, inbound_deps=18
- `packages/command-center/src/data/agents.ts` loc=208, functions=2, inbound_deps=18
- `packages/core/src/event-log/event-log.ts` loc=128, functions=0, inbound_deps=14
- `packages/command-center/src/store/metrics-store.ts` loc=508, functions=8, inbound_deps=13

## [5] Next Actions
<!-- ## Next Actions -->

- Investigate `packages/command-center/src/store/spatial-store.ts` has high inbound dependency count (59)
- Investigate `packages/command-center/src/store/agent-store.ts` has high inbound dependency count (57)
- Investigate `packages/command-center/src/data/building.ts` has high inbound dependency count (38)
