/**
 * spatial-layout-reconstruction.ts — Spatial layout recomputation from event log.
 *
 * Sub-AC 9c: Implements spatial_layout recomputation logic that replays
 * event_log entries from the nearest layout.init bootstrap up to the
 * replay_state cursor position, producing a reconstructed spatial snapshot.
 *
 * Architecture
 * ────────────
 *   reconstructSpatialLayoutAt(events, cursorIndexOrTs)
 *     1. Binary-search `events` backward from the cursor position to locate
 *        the nearest "layout.init" event (the bootstrap anchor).
 *     2. Seed a mutable SpatialLayoutWorkingState from that layout.init payload.
 *     3. Iterate events from the layout.init anchor index up to and including
 *        the cursor position, applying each layout.* delta event in sequence.
 *     4. Return an immutable ReconstructedSpatialLayout snapshot.
 *
 *   findNearestLayoutInit(events, upToIndex)
 *     Scan backward from upToIndex to find the last "layout.init" event.
 *     Returns the index of the found event, or -1 if none exists.
 *
 * Layout events handled
 * ─────────────────────
 *   layout.init        — Establishes the full baseline (rooms, agents, fixtures).
 *                        If multiple layout.init events precede the cursor, only
 *                        the LAST one (nearest to cursor) is used as the anchor.
 *   layout.node.moved  — Updates position/rotation/scale of a single named node.
 *   layout.reset       — Re-seeds from the nearest prior layout.init payload.
 *   layout.updated     — Applies new_snapshot if it contains rooms/agents/fixtures.
 *   layout.loaded      — Applies snapshot field (replaces current layout state).
 *   layout.created     — Records layout metadata; no geometric state change.
 *   layout.deleted     — Marks layout as deleted; geometry state frozen.
 *   layout.saved       — No geometric state change (persistence event).
 *   layout.changed     — Legacy; no geometric state change beyond timestamp.
 *
 * Design principles
 * ─────────────────
 *  - Record transparency: every mutation traces to a specific event (seq + ts).
 *  - Determinism: for a given (events, cursorIndex) pair, output is identical.
 *  - Immutability: input events array is never mutated; output is deep-cloned.
 *  - Forward-compatibility: unknown node types and missing fields are tolerated.
 *  - Cursor-anchored: the cursor defines the "until when" boundary; events with
 *    tsMs > cursor.cursorTs (or index > cursor.cursorIndex) are not applied.
 *
 * Usage
 * ─────
 *   import {
 *     reconstructSpatialLayoutAt,
 *     reconstructSpatialLayoutAtIndex,
 *     findNearestLayoutInitIndex,
 *     emptySpatialLayout,
 *   } from "./spatial-layout-reconstruction.js";
 *
 *   // From a cursor state (Sub-AC 9b)
 *   const layout = reconstructSpatialLayoutAt(events, cursor);
 *
 *   // From a raw timestamp
 *   const layout = reconstructSpatialLayoutAt(events, targetTsMs);
 *
 *   // From a cursor index directly
 *   const layout = reconstructSpatialLayoutAtIndex(events, cursorIndex);
 */

import type { TypedReplayEvent, StateChangeReplayEvent } from "./event-log-schema.js";
import type { ReplayCursorState } from "./replay-cursor.js";

// ── Re-export Vec3 from protocol for convenience ─────────────────────────────

/**
 * 3-component vector for position, rotation (Euler angles), and scale.
 * Matches the Vec3 defined in @conitens/protocol's layout module.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ── Output types ─────────────────────────────────────────────────────────────

/**
 * Reconstructed 3D spatial state of a single room node at a point in time.
 *
 * All positional data is derived exclusively from the event stream to ensure
 * determinism. The `lastEventSeq` and `lastEventTs` fields provide full
 * audit traceability.
 */
export interface ReconstructedRoomNode {
  /** Room identifier — matches the RoomDef.id from room-config-schema. */
  roomId: string;
  /** World-space position of the room's origin (metres, Y-up). */
  position: Vec3;
  /** Euler rotation (radians, Y-up right-handed). Defaults to {0,0,0}. */
  rotation: Vec3;
  /** Uniform scale. Defaults to {1,1,1}. */
  scale: Vec3;
  /** Floor number this room occupies. 0 if unknown. */
  floor: number;
  /** Sequence number of the most recent event that changed this node. */
  lastEventSeq: number;
  /** Unix timestamp (ms) of the most recent event that changed this node. */
  lastEventTs: number;
}

/**
 * Reconstructed 3D spatial state of a single agent node at a point in time.
 */
export interface ReconstructedAgentNode {
  /** Agent identifier. */
  agentId: string;
  /** Room the agent currently occupies. null before first placement. */
  roomId: string | null;
  /** World-space position of the agent within the scene (or within their room). */
  position: Vec3;
  /** Euler rotation (radians). Defaults to {0,0,0}. */
  rotation: Vec3;
  /** Sequence number of the most recent event that changed this node. */
  lastEventSeq: number;
  /** Unix timestamp (ms) of the most recent event that changed this node. */
  lastEventTs: number;
}

/**
 * Reconstructed 3D spatial state of a single fixture node at a point in time.
 */
export interface ReconstructedFixtureNode {
  /** Stable fixture identifier. */
  fixtureId: string;
  /** Fixture archetype discriminator (e.g. "control_panel", "door_handle"). */
  fixtureType: string;
  /** Room this fixture belongs to. null if not room-scoped. */
  roomId: string | null;
  /** World-space position. */
  position: Vec3;
  /** Euler rotation (radians). Defaults to {0,0,0}. */
  rotation: Vec3;
  /** Fixture-type-specific configuration (opaque, preserved from layout.init). */
  config: Record<string, unknown>;
  /** Sequence number of the most recent event that changed this node. */
  lastEventSeq: number;
  /** Unix timestamp (ms) of the most recent event that changed this node. */
  lastEventTs: number;
}

/**
 * Reconstructed spatial layout snapshot at a single point in time.
 *
 * Produced by `reconstructSpatialLayoutAt()` or `reconstructSpatialLayoutAtIndex()`.
 * Contains the full 3D geometry state (positions, rotations, scales) for all
 * rooms, agents, and fixtures, derived deterministically from the event log.
 *
 * This type is JSON-serialisable — suitable for persisting replay snapshots.
 */
export interface ReconstructedSpatialLayout {
  /**
   * Target timestamp this snapshot represents (Unix ms).
   * Equal to the cursorTs when reconstructed from a cursor, or to the
   * timestamp of the last applied event when reconstructed by index.
   */
  ts: number;

  /**
   * Sequence number of the last layout event applied to produce this snapshot.
   * 0 if no layout events were applied (empty layout state).
   */
  seq: number;

  /**
   * Number of layout.* events applied since the nearest layout.init anchor.
   * Does NOT count the layout.init event itself — only deltas applied on top.
   */
  eventsApplied: number;

  /**
   * Identifier of the layout instance this snapshot represents.
   * Derived from the layout.init payload that anchors this reconstruction.
   * null if no layout.init was found before the cursor.
   */
  layoutId: string | null;

  /**
   * Identifier of the building entity this layout belongs to.
   * Derived from the layout.init payload. null if no layout.init was found.
   */
  buildingId: string | null;

  /**
   * Index in the events array of the layout.init event that anchored this
   * reconstruction. -1 if no layout.init was found.
   */
  anchorEventIndex: number;

  /**
   * Sequence number of the layout.init event that anchored this reconstruction.
   * 0 if no layout.init was found.
   */
  anchorSeq: number;

  /**
   * Whether this snapshot was produced from a valid layout.init anchor.
   * false means no layout.init was found before the cursor — all maps will
   * be empty and the snapshot represents an uninitialised layout.
   */
  hasAnchor: boolean;

  /** Per-room spatial nodes, keyed by roomId. */
  rooms: Record<string, ReconstructedRoomNode>;

  /** Per-agent spatial nodes, keyed by agentId. */
  agents: Record<string, ReconstructedAgentNode>;

  /** Per-fixture spatial nodes, keyed by fixtureId. */
  fixtures: Record<string, ReconstructedFixtureNode>;
}

// ── Default zero-vectors ─────────────────────────────────────────────────────

const ZERO_VEC3: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
const UNIT_VEC3: Vec3 = Object.freeze({ x: 1, y: 1, z: 1 });

/**
 * Safely cast an unknown value to a Vec3 if it has numeric x/y/z fields.
 * Falls back to `fallback` for missing or non-numeric components.
 *
 * @internal
 */
function toVec3(v: unknown, fallback: Vec3 = ZERO_VEC3): Vec3 {
  if (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as Record<string, unknown>)["x"] === "number" &&
    typeof (v as Record<string, unknown>)["y"] === "number" &&
    typeof (v as Record<string, unknown>)["z"] === "number"
  ) {
    const r = v as Record<string, unknown>;
    return { x: r["x"] as number, y: r["y"] as number, z: r["z"] as number };
  }
  return { ...fallback };
}

// ── Empty state factory ───────────────────────────────────────────────────────

/**
 * Create an empty, well-defined spatial layout with no geometry.
 *
 * Used as a fallback when no layout.init anchor is found in the event stream.
 */
export function emptySpatialLayout(ts = 0): ReconstructedSpatialLayout {
  return {
    ts,
    seq: 0,
    eventsApplied: 0,
    layoutId: null,
    buildingId: null,
    anchorEventIndex: -1,
    anchorSeq: 0,
    hasAnchor: false,
    rooms: {},
    agents: {},
    fixtures: {},
  };
}

// ── Deep clone ────────────────────────────────────────────────────────────────

/**
 * Deep-clone a ReconstructedSpatialLayout via JSON round-trip.
 * All values are JSON-serialisable (plain numbers, strings, objects).
 *
 * @internal
 */
function cloneLayout(layout: ReconstructedSpatialLayout): ReconstructedSpatialLayout {
  return JSON.parse(JSON.stringify(layout)) as ReconstructedSpatialLayout;
}

// ── Nearest layout.init search ────────────────────────────────────────────────

/**
 * Find the index in `events` of the last "layout.init" event whose
 * `seq` index is ≤ `upToIndex`.
 *
 * Scans backward from `upToIndex` so the nearest (most-recent) layout.init
 * bootstrap before the cursor is always chosen. This means replay starts
 * from the closest known baseline rather than the very first one.
 *
 * Returns -1 if no "layout.init" event is found.
 *
 * @param events      Sorted TypedReplayEvent array.
 * @param upToIndex   Upper bound (inclusive) for the search, 0-based.
 *                    Use `events.length - 1` to search the full array.
 *                    Values < 0 always return -1.
 */
export function findNearestLayoutInitIndex(
  events: readonly TypedReplayEvent[],
  upToIndex: number,
): number {
  if (events.length === 0 || upToIndex < 0) return -1;
  const bound = Math.min(upToIndex, events.length - 1);
  for (let i = bound; i >= 0; i--) {
    if (events[i].type === "layout.init") return i;
  }
  return -1;
}

// ── layout.init seeding ───────────────────────────────────────────────────────

/**
 * Seed a fresh mutable SpatialLayoutWorkingState from a layout.init event.
 *
 * @internal
 */
function seedFromLayoutInit(
  event: StateChangeReplayEvent,
  targetLayout: ReconstructedSpatialLayout,
  anchorIndex: number,
): void {
  const p = event.typedPayload;

  // Validate required fields from the layout.init payload
  const layoutId = typeof p["layout_id"] === "string" ? p["layout_id"] : null;
  const buildingId = typeof p["building_id"] === "string" ? p["building_id"] : null;

  if (!layoutId || !buildingId) return;

  // Record anchor metadata
  targetLayout.layoutId = layoutId;
  targetLayout.buildingId = buildingId;
  targetLayout.anchorEventIndex = anchorIndex;
  targetLayout.anchorSeq = event.seq;
  targetLayout.hasAnchor = true;
  targetLayout.seq = event.seq;
  targetLayout.ts = event.tsMs;

  // Clear existing geometry (re-seed from scratch)
  targetLayout.rooms = {};
  targetLayout.agents = {};
  targetLayout.fixtures = {};

  // ── Seed rooms ─────────────────────────────────────────────────────────────
  const rawRooms = p["rooms"];
  if (Array.isArray(rawRooms)) {
    for (const room of rawRooms as unknown[]) {
      if (typeof room !== "object" || room === null || Array.isArray(room)) continue;
      const r = room as Record<string, unknown>;
      const roomId = typeof r["room_id"] === "string" ? r["room_id"] : null;
      if (!roomId) continue;

      targetLayout.rooms[roomId] = {
        roomId,
        position: toVec3(r["position"]),
        rotation: toVec3(r["rotation"]),
        scale: toVec3(r["scale"], UNIT_VEC3),
        floor: typeof r["floor"] === "number" ? r["floor"] : 0,
        lastEventSeq: event.seq,
        lastEventTs: event.tsMs,
      };
    }
  }

  // ── Seed agents ────────────────────────────────────────────────────────────
  const rawAgents = p["agents"];
  if (Array.isArray(rawAgents)) {
    for (const agent of rawAgents as unknown[]) {
      if (typeof agent !== "object" || agent === null || Array.isArray(agent)) continue;
      const a = agent as Record<string, unknown>;
      const agentId = typeof a["agent_id"] === "string" ? a["agent_id"] : null;
      if (!agentId) continue;

      targetLayout.agents[agentId] = {
        agentId,
        roomId: typeof a["room_id"] === "string" ? a["room_id"] : null,
        position: toVec3(a["position"]),
        rotation: toVec3(a["rotation"]),
        lastEventSeq: event.seq,
        lastEventTs: event.tsMs,
      };
    }
  }

  // ── Seed fixtures ──────────────────────────────────────────────────────────
  const rawFixtures = p["fixtures"];
  if (Array.isArray(rawFixtures)) {
    for (const fixture of rawFixtures as unknown[]) {
      if (typeof fixture !== "object" || fixture === null || Array.isArray(fixture)) continue;
      const f = fixture as Record<string, unknown>;
      const fixtureId = typeof f["fixture_id"] === "string" ? f["fixture_id"] : null;
      const fixtureType = typeof f["fixture_type"] === "string" ? f["fixture_type"] : "unknown";
      if (!fixtureId) continue;

      const rawConfig = f["initial_config"];
      const config =
        typeof rawConfig === "object" && rawConfig !== null && !Array.isArray(rawConfig)
          ? (rawConfig as Record<string, unknown>)
          : {};

      targetLayout.fixtures[fixtureId] = {
        fixtureId,
        fixtureType,
        roomId: typeof f["room_id"] === "string" ? f["room_id"] : null,
        position: toVec3(f["position"]),
        rotation: toVec3(f["rotation"]),
        config,
        lastEventSeq: event.seq,
        lastEventTs: event.tsMs,
      };
    }
  }
}

// ── layout.node.moved reducer ─────────────────────────────────────────────────

/**
 * Apply a layout.node.moved event to the working layout.
 *
 * Reads:
 *   - node_id    (required)  — identifies the scene node being moved
 *   - node_type  (required)  — "room" | "agent" | "desk" | "camera" | "building" | "prop"
 *   - to_position (required) — Vec3 target position
 *   - to_rotation (optional) — Vec3 target rotation
 *   - to_scale    (optional) — Vec3 target scale (rooms only)
 *
 * @internal
 */
function applyNodeMoved(
  layout: ReconstructedSpatialLayout,
  event: StateChangeReplayEvent,
): void {
  const p = event.typedPayload;
  const nodeId = typeof p["node_id"] === "string" ? p["node_id"] : null;
  const nodeType = typeof p["node_type"] === "string" ? p["node_type"] : null;
  if (!nodeId || !nodeType) return;

  const toPosition = toVec3(p["to_position"]);
  const hasNewRotation = isVec3Like(p["to_rotation"]);
  const hasNewScale = isVec3Like(p["to_scale"]);

  switch (nodeType) {
    case "room": {
      const existing = layout.rooms[nodeId];
      if (!existing) {
        // Defensive: create node if not yet seeded (e.g., event stream incomplete)
        layout.rooms[nodeId] = {
          roomId: nodeId,
          position: toPosition,
          rotation: hasNewRotation ? toVec3(p["to_rotation"]) : { ...ZERO_VEC3 },
          scale: hasNewScale ? toVec3(p["to_scale"], UNIT_VEC3) : { ...UNIT_VEC3 },
          floor: 0,
          lastEventSeq: event.seq,
          lastEventTs: event.tsMs,
        };
      } else {
        layout.rooms[nodeId] = {
          ...existing,
          position: toPosition,
          rotation: hasNewRotation ? toVec3(p["to_rotation"]) : existing.rotation,
          scale: hasNewScale ? toVec3(p["to_scale"], UNIT_VEC3) : existing.scale,
          lastEventSeq: event.seq,
          lastEventTs: event.tsMs,
        };
      }
      break;
    }

    case "agent": {
      const existing = layout.agents[nodeId];
      if (!existing) {
        layout.agents[nodeId] = {
          agentId: nodeId,
          roomId: null,
          position: toPosition,
          rotation: hasNewRotation ? toVec3(p["to_rotation"]) : { ...ZERO_VEC3 },
          lastEventSeq: event.seq,
          lastEventTs: event.tsMs,
        };
      } else {
        layout.agents[nodeId] = {
          ...existing,
          position: toPosition,
          rotation: hasNewRotation ? toVec3(p["to_rotation"]) : existing.rotation,
          lastEventSeq: event.seq,
          lastEventTs: event.tsMs,
        };
      }
      break;
    }

    case "desk":
    case "camera":
    case "building":
    case "prop": {
      // Treat these as fixtures — keyed by nodeId
      const existing = layout.fixtures[nodeId];
      if (!existing) {
        layout.fixtures[nodeId] = {
          fixtureId: nodeId,
          fixtureType: nodeType,
          roomId: null,
          position: toPosition,
          rotation: hasNewRotation ? toVec3(p["to_rotation"]) : { ...ZERO_VEC3 },
          config: {},
          lastEventSeq: event.seq,
          lastEventTs: event.tsMs,
        };
      } else {
        layout.fixtures[nodeId] = {
          ...existing,
          position: toPosition,
          rotation: hasNewRotation ? toVec3(p["to_rotation"]) : existing.rotation,
          lastEventSeq: event.seq,
          lastEventTs: event.tsMs,
        };
      }
      break;
    }

    default:
      // Forward-compatible: unknown node types silently skipped
      break;
  }
}

/** Quick structural check: does `v` look like a Vec3? @internal */
function isVec3Like(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["x"] === "number" &&
    typeof r["y"] === "number" &&
    typeof r["z"] === "number"
  );
}

// ── layout.updated reducer ────────────────────────────────────────────────────

/**
 * Apply a layout.updated event.
 *
 * If the event carries a `new_snapshot` that contains `rooms`, `agents`, or
 * `fixtures` arrays, those arrays replace the corresponding geometry maps.
 * This allows bulk layout reflows to be fully captured in a single event.
 *
 * If `new_snapshot` is absent or does not contain geometry arrays, the event
 * is recorded (seq/ts updated) but geometry is unchanged.
 *
 * @internal
 */
function applyLayoutUpdated(
  layout: ReconstructedSpatialLayout,
  event: StateChangeReplayEvent,
): void {
  const p = event.typedPayload;
  const newSnapshot = p["new_snapshot"];
  if (typeof newSnapshot !== "object" || newSnapshot === null || Array.isArray(newSnapshot)) {
    return;
  }
  const snap = newSnapshot as Record<string, unknown>;

  // Rooms
  if (Array.isArray(snap["rooms"])) {
    for (const room of snap["rooms"] as unknown[]) {
      if (typeof room !== "object" || room === null) continue;
      const r = room as Record<string, unknown>;
      const roomId = typeof r["room_id"] === "string" ? r["room_id"] : null;
      if (!roomId) continue;
      const existing = layout.rooms[roomId];
      layout.rooms[roomId] = {
        roomId,
        position: toVec3(r["position"], existing?.position ?? ZERO_VEC3),
        rotation: toVec3(r["rotation"], existing?.rotation ?? ZERO_VEC3),
        scale: toVec3(r["scale"], existing?.scale ?? UNIT_VEC3),
        floor: typeof r["floor"] === "number" ? r["floor"] : existing?.floor ?? 0,
        lastEventSeq: event.seq,
        lastEventTs: event.tsMs,
      };
    }
  }

  // Agents
  if (Array.isArray(snap["agents"])) {
    for (const agent of snap["agents"] as unknown[]) {
      if (typeof agent !== "object" || agent === null) continue;
      const a = agent as Record<string, unknown>;
      const agentId = typeof a["agent_id"] === "string" ? a["agent_id"] : null;
      if (!agentId) continue;
      const existing = layout.agents[agentId];
      layout.agents[agentId] = {
        agentId,
        roomId: typeof a["room_id"] === "string" ? a["room_id"] : existing?.roomId ?? null,
        position: toVec3(a["position"], existing?.position ?? ZERO_VEC3),
        rotation: toVec3(a["rotation"], existing?.rotation ?? ZERO_VEC3),
        lastEventSeq: event.seq,
        lastEventTs: event.tsMs,
      };
    }
  }

  // Fixtures
  if (Array.isArray(snap["fixtures"])) {
    for (const fixture of snap["fixtures"] as unknown[]) {
      if (typeof fixture !== "object" || fixture === null) continue;
      const f = fixture as Record<string, unknown>;
      const fixtureId = typeof f["fixture_id"] === "string" ? f["fixture_id"] : null;
      if (!fixtureId) continue;
      const existing = layout.fixtures[fixtureId];
      const rawConfig = f["initial_config"] ?? f["config"];
      const config =
        typeof rawConfig === "object" && rawConfig !== null && !Array.isArray(rawConfig)
          ? (rawConfig as Record<string, unknown>)
          : existing?.config ?? {};
      layout.fixtures[fixtureId] = {
        fixtureId,
        fixtureType: typeof f["fixture_type"] === "string" ? f["fixture_type"] : existing?.fixtureType ?? "unknown",
        roomId: typeof f["room_id"] === "string" ? f["room_id"] : existing?.roomId ?? null,
        position: toVec3(f["position"], existing?.position ?? ZERO_VEC3),
        rotation: toVec3(f["rotation"], existing?.rotation ?? ZERO_VEC3),
        config,
        lastEventSeq: event.seq,
        lastEventTs: event.tsMs,
      };
    }
  }
}

// ── layout.loaded reducer ─────────────────────────────────────────────────────

/**
 * Apply a layout.loaded event.
 *
 * The `snapshot` field fully replaces the current layout state (equivalent
 * to a re-seed). If `snapshot` contains rooms/agents/fixtures, those are
 * applied verbatim. If it does not, the geometry maps are cleared (the loaded
 * layout was empty or opaque).
 *
 * @internal
 */
function applyLayoutLoaded(
  layout: ReconstructedSpatialLayout,
  event: StateChangeReplayEvent,
): void {
  const p = event.typedPayload;
  const snapshot = p["snapshot"];
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return;
  }
  const snap = snapshot as Record<string, unknown>;

  // A loaded snapshot fully replaces geometry — clear first
  layout.rooms = {};
  layout.agents = {};
  layout.fixtures = {};

  // Apply as if it were a new layout.init payload (same shape)
  if (typeof snap["layout_id"] === "string") layout.layoutId = snap["layout_id"];
  if (typeof snap["building_id"] === "string") layout.buildingId = snap["building_id"];

  if (Array.isArray(snap["rooms"])) {
    for (const room of snap["rooms"] as unknown[]) {
      if (typeof room !== "object" || room === null) continue;
      const r = room as Record<string, unknown>;
      const roomId = typeof r["room_id"] === "string" ? r["room_id"] : null;
      if (!roomId) continue;
      layout.rooms[roomId] = {
        roomId,
        position: toVec3(r["position"]),
        rotation: toVec3(r["rotation"]),
        scale: toVec3(r["scale"], UNIT_VEC3),
        floor: typeof r["floor"] === "number" ? r["floor"] : 0,
        lastEventSeq: event.seq,
        lastEventTs: event.tsMs,
      };
    }
  }

  if (Array.isArray(snap["agents"])) {
    for (const agent of snap["agents"] as unknown[]) {
      if (typeof agent !== "object" || agent === null) continue;
      const a = agent as Record<string, unknown>;
      const agentId = typeof a["agent_id"] === "string" ? a["agent_id"] : null;
      if (!agentId) continue;
      layout.agents[agentId] = {
        agentId,
        roomId: typeof a["room_id"] === "string" ? a["room_id"] : null,
        position: toVec3(a["position"]),
        rotation: toVec3(a["rotation"]),
        lastEventSeq: event.seq,
        lastEventTs: event.tsMs,
      };
    }
  }
}

// ── Primary reconstruction entry points ──────────────────────────────────────

/**
 * Reconstruct the spatial layout at the position indicated by `cursor`.
 *
 * Accepts either a {@link ReplayCursorState} object or a raw timestamp (number).
 * When a timestamp is provided the function finds the last event with
 * tsMs ≤ targetTs and uses that as the effective cursor position.
 *
 * @param events  Sorted TypedReplayEvent array.
 * @param cursor  Either a ReplayCursorState (from Sub-AC 9b) or a Unix ms
 *                timestamp. Passing -Infinity / 0 returns an empty layout.
 *
 * @returns An immutable ReconstructedSpatialLayout snapshot.
 */
export function reconstructSpatialLayoutAt(
  events: readonly TypedReplayEvent[],
  cursor: ReplayCursorState | number,
): ReconstructedSpatialLayout {
  if (typeof cursor === "number") {
    // Timestamp path: find the last event at or before targetTs
    const targetTs = cursor;
    if (events.length === 0 || targetTs < 0) return emptySpatialLayout(targetTs);

    let cursorIndex = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].tsMs <= targetTs) {
        cursorIndex = i;
        break;
      }
    }
    return reconstructSpatialLayoutAtIndex(events, cursorIndex);
  }

  // Cursor path
  const { cursorIndex } = cursor;
  return reconstructSpatialLayoutAtIndex(
    events,
    cursorIndex,
    typeof cursor.cursorTs === "number" ? cursor.cursorTs : 0,
  );
}

/**
 * Reconstruct the spatial layout at a specific event index.
 *
 * This is the core reconstruction function. Given a 0-based `cursorIndex`
 * into `events`:
 *
 *   1. Scan backward from `cursorIndex` to find the nearest layout.init event.
 *   2. Seed the working layout from that event.
 *   3. Apply all intervening layout.* events up to and including `cursorIndex`.
 *   4. Return an immutable snapshot.
 *
 * If `cursorIndex` is -1 (before-start sentinel) or no layout.init anchor
 * is found, returns an empty spatial layout.
 *
 * @param events       Sorted TypedReplayEvent array.
 * @param cursorIndex  0-based index of the cursor, or -1 for before-start.
 * @param targetTs     Optional explicit target timestamp for the snapshot `ts`
 *                     field. Defaults to the timestamp of events[cursorIndex].
 */
export function reconstructSpatialLayoutAtIndex(
  events: readonly TypedReplayEvent[],
  cursorIndex: number,
  targetTs?: number,
): ReconstructedSpatialLayout {
  if (events.length === 0 || cursorIndex < 0) {
    return emptySpatialLayout(targetTs ?? 0);
  }

  const effectiveCursorIndex = Math.min(cursorIndex, events.length - 1);
  const snapshotTs = targetTs ?? events[effectiveCursorIndex].tsMs;

  // ── Step 1: find nearest layout.init anchor ─────────────────────────────────
  const anchorIndex = findNearestLayoutInitIndex(events, effectiveCursorIndex);

  if (anchorIndex === -1) {
    // No layout.init found — return empty layout with timestamp context
    return emptySpatialLayout(snapshotTs);
  }

  // ── Step 2: seed from layout.init anchor ───────────────────────────────────
  const anchorEvent = events[anchorIndex];
  if (anchorEvent.replayCategory !== "state_change" || anchorEvent.type !== "layout.init") {
    // Unexpected type mismatch — return empty
    return emptySpatialLayout(snapshotTs);
  }

  const layout: ReconstructedSpatialLayout = {
    ts: snapshotTs,
    seq: 0,
    eventsApplied: 0,
    layoutId: null,
    buildingId: null,
    anchorEventIndex: anchorIndex,
    anchorSeq: 0,
    hasAnchor: false,
    rooms: {},
    agents: {},
    fixtures: {},
  };

  seedFromLayoutInit(anchorEvent as StateChangeReplayEvent, layout, anchorIndex);

  // ── Step 3: apply layout.* delta events after the anchor ───────────────────
  for (let i = anchorIndex + 1; i <= effectiveCursorIndex; i++) {
    const event = events[i];

    // Only process state_change events in the "layout" domain
    if (event.replayCategory !== "state_change") continue;
    const sce = event as StateChangeReplayEvent;
    if (sce.domain !== "layout") continue;

    layout.seq = sce.seq;
    layout.ts = sce.tsMs;
    layout.eventsApplied += 1;

    switch (sce.type) {
      case "layout.node.moved":
        applyNodeMoved(layout, sce);
        break;

      case "layout.updated":
        applyLayoutUpdated(layout, sce);
        break;

      case "layout.loaded":
        applyLayoutLoaded(layout, sce);
        break;

      case "layout.reset": {
        // Re-seed from the anchor layout.init (resets all deltas)
        seedFromLayoutInit(anchorEvent as StateChangeReplayEvent, layout, anchorIndex);
        layout.seq = sce.seq;
        layout.ts = sce.tsMs;
        // eventsApplied continues accumulating for audit transparency
        break;
      }

      case "layout.init": {
        // A later layout.init supersedes the anchor — re-seed from this event
        // (This handles re-initialisation after layout.reset or cold restarts)
        seedFromLayoutInit(sce, layout, i);
        // Update anchor metadata to reflect the new anchor
        layout.anchorEventIndex = i;
        layout.anchorSeq = sce.seq;
        break;
      }

      case "layout.created":
      case "layout.deleted":
      case "layout.saved":
      case "layout.changed":
      default:
        // No geometric state change for these event types
        break;
    }
  }

  // Ensure snapshot ts matches the requested cursor ts, not the last event ts
  layout.ts = snapshotTs;

  return cloneLayout(layout);
}

// ── Convenience query helpers ─────────────────────────────────────────────────

/**
 * List all room IDs present in the reconstructed spatial layout.
 *
 * @param layout  A ReconstructedSpatialLayout snapshot.
 * @returns       Array of room ID strings (alphabetically sorted for determinism).
 */
export function listRoomIds(layout: ReconstructedSpatialLayout): string[] {
  return Object.keys(layout.rooms).sort();
}

/**
 * List all agent IDs present in the reconstructed spatial layout.
 *
 * @param layout  A ReconstructedSpatialLayout snapshot.
 * @returns       Array of agent ID strings (alphabetically sorted).
 */
export function listSpatialAgentIds(layout: ReconstructedSpatialLayout): string[] {
  return Object.keys(layout.agents).sort();
}

/**
 * List all fixture IDs present in the reconstructed spatial layout.
 *
 * @param layout  A ReconstructedSpatialLayout snapshot.
 * @returns       Array of fixture ID strings (alphabetically sorted).
 */
export function listFixtureIds(layout: ReconstructedSpatialLayout): string[] {
  return Object.keys(layout.fixtures).sort();
}

/**
 * Trace the full position history of a room node across all layout events.
 *
 * Returns one entry per layout event that modified the given room's position,
 * from the earliest layout.init through any layout.node.moved events.
 *
 * @param events  Sorted TypedReplayEvent array.
 * @param roomId  Room identifier to trace.
 */
export function traceRoomPositionHistory(
  events: readonly TypedReplayEvent[],
  roomId: string,
): Array<{ ts: number; seq: number; position: Vec3; eventType: string }> {
  const history: Array<{ ts: number; seq: number; position: Vec3; eventType: string }> = [];

  for (const event of events) {
    if (event.replayCategory !== "state_change") continue;
    const sce = event as StateChangeReplayEvent;

    if (sce.type === "layout.init") {
      const rawRooms = sce.typedPayload["rooms"];
      if (Array.isArray(rawRooms)) {
        for (const room of rawRooms as unknown[]) {
          if (typeof room !== "object" || room === null) continue;
          const r = room as Record<string, unknown>;
          if (r["room_id"] === roomId) {
            history.push({
              ts: sce.tsMs,
              seq: sce.seq,
              position: toVec3(r["position"]),
              eventType: "layout.init",
            });
          }
        }
      }
    } else if (sce.type === "layout.node.moved") {
      const p = sce.typedPayload;
      if (p["node_id"] === roomId && p["node_type"] === "room") {
        history.push({
          ts: sce.tsMs,
          seq: sce.seq,
          position: toVec3(p["to_position"]),
          eventType: "layout.node.moved",
        });
      }
    }
  }

  return history;
}
