/**
 * RoomConfigFixtureLayer.tsx — Sub-AC 7d
 *
 * 3D layer that attaches interactive ui_fixture controls (capacity handle,
 * assignment-rules menu anchor) to each room volume in the scene.
 *
 * When a fixture is manipulated, it routes through the room configuration
 * control plane to produce an orchestration_command:
 *
 * Control plane wiring
 * ────────────────────
 *   FixtureHandle  (capacity)   → drag Y-axis
 *                               ↓ useRoomConfigControlPlane.handleFixtureIntent
 *                               ↓ dispatchCapacityChange()
 *                               ↓ cmdWriter.writeCommand("config.building_layout", ...)
 *                               ↓ orchestration_command written to watch dir
 *
 *   FixtureMenuAnchor (rules)   → open menu
 *                               ↓ useRoomConfigControlPlane.handleFixtureIntent
 *                               ↓ buildRoomConfigMenuEntries → onMenuOpen callback
 *                               ↓ onSelect → dispatchAccessPolicy / dispatchSetFallback
 *                               ↓ cmdWriter.writeCommand("config.building_layout" / "config.room_mapping")
 *                               ↓ orchestration_command written to watch dir
 *
 * 3D visual update contract
 * ─────────────────────────
 *   The fixture colors update reactively because buildRoomConfigFixtures()
 *   is called on every render pass and reads current occupancy from the
 *   Zustand agent-store.  Zustand mutations (from WebSocket agent events)
 *   trigger re-renders automatically.
 *
 *     occupancy < 50%   → capacity handle = green
 *     occupancy 50–80%  → capacity handle = yellow
 *     occupancy ≥ 80%   → capacity handle = red
 *     unlimited (max<0) → capacity handle = cyan
 *
 * Integration
 * ───────────
 * Mount `<RoomConfigFixtureLayer>` inside the R3F Canvas, sibling to
 * `<TaskOrbControlFixturesLayer>`.  It has no Three.js geometry itself —
 * it delegates all rendering to `SpatialFixtureLayer` from SpatialUiFixture.tsx.
 *
 * @example
 * ```tsx
 * <TaskOrbControlFixturesLayer />
 * <RoomConfigFixtureLayer />
 * ```
 */

import { memo, useCallback, useMemo } from "react";
import { useAgentStore }        from "../store/agent-store.js";
import { useContextMenuStore }  from "../components/ContextMenuDispatcher.js";
import {
  SpatialFixtureLayer,
  type SpatialFixtureEntityEntry,
} from "./SpatialUiFixture.js";
import {
  useRoomConfigControlPlane,
  buildRoomConfigFixtures,
  type RoomConfigMenuEntry,
} from "../hooks/use-room-config-control-plane.js";
import type { FixtureInteractionIntent } from "./fixture-interaction-intents.js";
import { ROOM_REGISTRY, type RoomMetadataEntry } from "../data/room-registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Y offset added to the room center to float fixtures above the floor plane.
 * Room centers are at floor height; this elevates fixtures to eye-level labels.
 */
export const ROOM_CONFIG_FIXTURE_Y_OFFSET = 1.2;

/**
 * Y offset for fixtures in rooms that are on upper floors.
 * Computed as floorIndex * FLOOR_HEIGHT + ROOM_CONFIG_FIXTURE_Y_OFFSET.
 * FLOOR_HEIGHT is 4.0 (from BirdsEyeOverlay.js / RoomGeometry.tsx).
 */
export const FLOOR_HEIGHT_UNITS = 4.0;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests — no React/Three.js required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the world position for a room's configuration fixture cluster.
 *
 * Places fixtures at the room's 3D center plus a Y elevation offset so they
 * float above the room floor without overlapping agent avatars.
 *
 * @param room  Room metadata entry (provides positionHint.center and floor).
 */
export function computeRoomFixtureWorldPos(
  room: RoomMetadataEntry,
): { x: number; y: number; z: number } {
  const { center } = room.positionHint;
  return {
    x: center.x,
    y: center.y + ROOM_CONFIG_FIXTURE_Y_OFFSET,
    z: center.z,
  };
}

/**
 * Build `SpatialFixtureEntityEntry[]` for all rooms in the registry.
 *
 * @param rooms          All room metadata entries to attach fixtures to.
 * @param occupancyMap   Map of roomId → current agent count.
 * @param visible        Whether fixtures are interactive (false = replay mode).
 */
export function buildRoomConfigEntries(
  rooms: readonly RoomMetadataEntry[],
  occupancyMap: ReadonlyMap<string, number>,
  visible = true,
): SpatialFixtureEntityEntry[] {
  return rooms.map((room): SpatialFixtureEntityEntry => {
    const occupancy    = occupancyMap.get(room.roomId) ?? 0;
    const maxOccupancy = room.maxOccupancy;

    return {
      entityRef:           { entityType: "room", entityId: room.roomId },
      entityWorldPosition: computeRoomFixtureWorldPos(room),
      fixtures:            buildRoomConfigFixtures(
        room.roomId,
        occupancy,
        maxOccupancy,
        visible,
      ),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RoomConfigFixtureLayer — 3D scene component
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomConfigFixtureLayerProps {
  /**
   * Whether the fixture layer is visible (interactive).
   * Pass `false` during replay mode to disable interaction.
   * Default: true.
   */
  visible?: boolean;
}

/**
 * `RoomConfigFixtureLayer` — Sub-AC 7d top-level component.
 *
 * Renders interactive fixture controls (capacity handle, assignment-rules
 * menu anchor) on each room.  Wires all fixture intents to the room
 * configuration control plane, producing orchestration_commands on user
 * manipulation.
 *
 * Mount once inside the R3F Canvas, as a sibling to other fixture layers.
 *
 * @example
 * ```tsx
 * <TaskOrbControlFixturesLayer />
 * <RoomConfigFixtureLayer />
 * ```
 */
export const RoomConfigFixtureLayer = memo(
  function RoomConfigFixtureLayer({
    visible = true,
  }: RoomConfigFixtureLayerProps) {
    const controlPlane = useRoomConfigControlPlane();
    const openMenu     = useContextMenuStore((s) => s.openMenu);

    // ── Compute per-room occupancy from agent-store ───────────────────────

    const occupancyMap = useAgentStore((s) => {
      const map = new Map<string, number>();
      for (const entry of Object.values(s.agents)) {
        const roomId = entry.roomId;
        if (roomId) {
          map.set(roomId, (map.get(roomId) ?? 0) + 1);
        }
      }
      return map;
    });

    // ── Collect all rooms from static registry ────────────────────────────

    const rooms: readonly RoomMetadataEntry[] = useMemo(
      () => Object.values(ROOM_REGISTRY),
      [],
    );

    // ── Build fixture entity entries ────────────────────────────────────

    const fixtureEntries = useMemo(
      () => buildRoomConfigEntries(rooms, occupancyMap, visible),
      [rooms, occupancyMap, visible],
    );

    // ── Handle fixture intents → room config control plane ──────────────

    const handleIntent = useCallback(
      (intent: FixtureInteractionIntent) => {
        // Find the room entry that owns this fixture
        const parsed = (() => {
          const sepIdx = intent.fixtureId.lastIndexOf(":");
          if (sepIdx === -1) return null;
          const roomId = intent.fixtureId.slice(0, sepIdx);
          const suffix = intent.fixtureId.slice(sepIdx + 1);
          return roomId && suffix ? { roomId, suffix } : null;
        })();

        if (!parsed) return;

        const roomEntry = ROOM_REGISTRY[parsed.roomId];
        if (!roomEntry) return;

        const occupancy = occupancyMap.get(parsed.roomId) ?? 0;

        controlPlane.handleFixtureIntent(
          intent,
          roomEntry,
          occupancy,
          (entries: RoomConfigMenuEntry[], x: number, y: number) => {
            openMenu(entries as never[], x, y);
          },
        );
      },
      [controlPlane, occupancyMap, openMenu],
    );

    return (
      <SpatialFixtureLayer
        entities={fixtureEntries}
        onIntent={handleIntent}
        visible={visible}
      />
    );
  },
);
