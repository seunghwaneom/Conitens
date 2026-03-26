/**
 * layout-init-seeder.ts — Bootstrap LayoutInitPayload builder.
 *
 * Sub-AC 9a: Builds the `layout.init` event payload that seeds the scene
 * event_log at creation time, capturing the complete initial spatial_layout
 * state so the replay engine has a valid baseline for scene reconstruction.
 *
 * Design:
 *   - Pure module (no React, no Zustand side-effects) — fully testable in isolation.
 *   - Derives LayoutInitPayload from static BUILDING + AGENT_INITIAL_PLACEMENTS.
 *   - Returns an immutable payload record; the caller (use-layout-init-seeder.ts)
 *     wraps it in a SceneLogEntry with an ID and sequence number.
 *   - Fixtures are extracted from room furniture slots so pre-placed props are
 *     captured in the init event, enabling full cold-start replay.
 *
 * Usage:
 *   import { buildLayoutInitPayload, PRIMARY_LAYOUT_ID } from './layout-init-seeder.js';
 *   const payload = buildLayoutInitPayload();   // uses static BUILDING + AGENTS
 *
 * AC traceability:
 *   Sub-AC 9a — seed event_log with bootstrap layout.init events at creation time
 */

import type { BuildingDef, RoomDef } from "./building.js";
import type { AgentSeedRecord } from "./agent-seed.js";
import type {
  LayoutInitPayload,
  RoomInitNode,
  AgentInitNode,
  FixtureInitNode,
} from "@conitens/protocol";
import { BUILDING } from "./building.js";
import { AGENT_INITIAL_PLACEMENTS } from "./agent-seed.js";

// ── Constants ─────────────────────────────────────────────────────────────

/**
 * Canonical layout ID for the primary command-center layout.
 *
 * This ID is stable across sessions — it identifies the logical spatial
 * configuration, not a session-specific instance. All layout.init events
 * for the default scene use this ID so replay can correlate events across
 * sessions without ambiguity.
 */
export const PRIMARY_LAYOUT_ID = "main-layout";

/**
 * Schema version for layout.init snapshot fields.
 * Bump when the LayoutInitPayload shape changes in a backward-incompatible way.
 */
export const LAYOUT_INIT_SCHEMA_VERSION = "layout-init@1.0.0";

// ── Room Node Builder ─────────────────────────────────────────────────────

/**
 * Map a RoomDef to a RoomInitNode for the layout.init payload.
 *
 * Only the fields required by LayoutInitPayload are copied; the full
 * RoomDef (furniture, doors, windows, meta) is not embedded here since
 * the replay engine only needs spatial descriptors for scene reconstruction.
 */
function buildRoomInitNode(room: RoomDef): RoomInitNode {
  return {
    room_id: room.roomId,
    position: { x: room.position.x, y: room.position.y, z: room.position.z },
    floor: room.floor,
  };
}

// ── Agent Node Builder ────────────────────────────────────────────────────

/**
 * Map an AgentSeedRecord to an AgentInitNode for the layout.init payload.
 *
 * Uses the pre-computed worldPosition from the seed record so that the
 * replay engine can place agents directly without re-deriving positions
 * from room coordinates and local offsets.
 */
function buildAgentInitNode(seed: AgentSeedRecord): AgentInitNode {
  const wp = seed.position.worldPosition;
  return {
    agent_id: seed.agentId,
    room_id: seed.roomId,
    position: { x: wp.x, y: wp.y, z: wp.z },
  };
}

// ── Fixture Node Builder ──────────────────────────────────────────────────

/**
 * Extract FixtureInitNodes from all room furniture slots in the building.
 *
 * Each furniture slot becomes a fixture descriptor with a stable composite ID:
 *   `{roomId}.{furnitureType}.{indexWithinRoom}`
 *
 * The index disambiguates multiple pieces of the same type in the same room
 * (e.g. two "workstation" desks in impl-office both get unique IDs).
 */
function buildFixtureInitNodes(building: BuildingDef): FixtureInitNode[] {
  const fixtures: FixtureInitNode[] = [];
  for (const room of building.rooms) {
    for (let i = 0; i < room.furniture.length; i++) {
      const slot = room.furniture[i];
      fixtures.push({
        fixture_id: `${room.roomId}.${slot.type}.${i}`,
        fixture_type: slot.type,
        room_id: room.roomId,
        position: {
          x: slot.position.x,
          y: slot.position.y,
          z: slot.position.z,
        },
      });
    }
  }
  return fixtures;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Build the LayoutInitPayload for the command-center's initial spatial state.
 *
 * Derives:
 *   - `rooms`    — all room positions and floor numbers from BuildingDef.rooms
 *   - `agents`   — world-space initial positions from AgentSeedRecord[]
 *   - `fixtures` — pre-placed furniture from BuildingDef.rooms[].furniture
 *
 * The returned payload is:
 *   - Fully serialisable to JSON (no circular refs, no class instances)
 *   - Immutable by design (plain objects with value semantics)
 *   - Deterministic: identical inputs always produce identical output
 *
 * @param building - BuildingDef with floor/room/furniture data.
 *                   Defaults to BUILDING (the static command-center config).
 * @param agents   - Seed records with initial world-space positions.
 *                   Defaults to AGENT_INITIAL_PLACEMENTS.
 * @returns        - LayoutInitPayload ready to embed in a SceneLogEntry.
 */
export function buildLayoutInitPayload(
  building: BuildingDef = BUILDING,
  agents: readonly AgentSeedRecord[] = AGENT_INITIAL_PLACEMENTS,
): LayoutInitPayload {
  const rooms = building.rooms.map(buildRoomInitNode);
  const agentNodes = agents.map(buildAgentInitNode);
  const fixtures = buildFixtureInitNodes(building);

  return {
    layout_id: PRIMARY_LAYOUT_ID,
    building_id: building.buildingId,
    rooms,
    agents: agentNodes,
    fixtures,
    source: "config",
    initiated_by: "system",
    snapshot_schema_version: LAYOUT_INIT_SCHEMA_VERSION,
    // Embed a compact scene snapshot for cold-start replay:
    // The full room/agent/fixture arrays above ARE the snapshot — we also
    // provide a summary record in snapshot for quick introspection.
    snapshot: {
      schema_version: LAYOUT_INIT_SCHEMA_VERSION,
      building_id: building.buildingId,
      room_count: rooms.length,
      agent_count: agentNodes.length,
      fixture_count: fixtures.length,
      floor_count: building.floors.length,
      floors: building.floors.map((f) => ({
        floor: f.floor,
        name: f.name,
        room_ids: f.roomIds,
      })),
    },
  };
}

/**
 * Build a minimal LayoutInitPayload for testing and ad-hoc initialisation.
 *
 * Useful when a full BuildingDef is unavailable (unit tests, fixtures,
 * programmatic scene setup). Only the required fields are populated; optional
 * arrays (agents, fixtures) are omitted.
 *
 * @param buildingId - Arbitrary building identifier string.
 * @param layoutId   - Arbitrary layout identifier string.
 * @param rooms      - Minimal room descriptors: id, position, optional floor.
 */
export function buildMinimalLayoutInitPayload(
  buildingId: string,
  layoutId: string,
  rooms: Array<{
    roomId: string;
    position: { x: number; y: number; z: number };
    floor?: number;
  }>,
): LayoutInitPayload {
  return {
    layout_id: layoutId,
    building_id: buildingId,
    rooms: rooms.map((r) => ({
      room_id: r.roomId,
      position: { x: r.position.x, y: r.position.y, z: r.position.z },
      ...(r.floor !== undefined ? { floor: r.floor } : {}),
    })),
    source: "config",
    initiated_by: "system",
  };
}

/**
 * Count the total number of fixtures that buildLayoutInitPayload would emit
 * for a given building. Used by tests to pre-compute expected fixture counts.
 */
export function countBuildingFixtures(building: BuildingDef = BUILDING): number {
  return building.rooms.reduce((sum, room) => sum + room.furniture.length, 0);
}
