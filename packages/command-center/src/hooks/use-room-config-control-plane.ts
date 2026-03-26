/**
 * use-room-config-control-plane.ts — Sub-AC 7d
 *
 * Bridges FixtureInteractionIntents emitted by spatial fixture controls
 * ON room entities to the room configuration control plane.
 *
 * Two fixtures are attached to each room:
 *   `{roomId}:capacity`  — FixtureHandle    — drag to adjust capacity ceiling;
 *                          color encodes current occupancy ratio
 *   `{roomId}:rules`     — FixtureMenuAnchor — open assignment-rule context menu
 *
 * Intent routing
 * ──────────────
 *   FIXTURE_HANDLE_DRAG_END   + suffix="capacity"
 *     → compute capacity delta from Y-axis drag distance
 *     → write config.building_layout command (layout.roomStates patch)
 *
 *   FIXTURE_MENU_ANCHOR_OPENED + suffix="rules"
 *     → invoke onMenuOpen callback with RoomConfigMenuEntry[]
 *       (entries dispatch config.room_mapping / config.building_layout on select)
 *
 *   All other intents → no-op
 *
 * 3D visual update
 * ────────────────
 *   buildRoomConfigFixtures(roomId, occupancy, maxOccupancy, visible) returns
 *   SpatialFixtureDescriptor[] with capacity handle color updated reactively:
 *     < 50% occupancy → green  (0x69f0ae)
 *     50–80%          → yellow (0xffd600)
 *     ≥ 80%           → red    (0xff3d00)
 *     unlimited (≤0)  → cyan   (0x00e5ff)
 *
 * Record transparency
 * ────────────────────
 *   Every command written by this control plane is recorded in the command
 *   lifecycle store (via useCommandFileWriter) for full event-sourced audit.
 *
 * Usage
 * ─────
 * ```tsx
 * const cp = useRoomConfigControlPlane();
 * <SpatialFixtureLayer
 *   entities={roomEntries}
 *   onIntent={(intent) => cp.handleFixtureIntent(intent, openMenu)}
 * />
 * ```
 */

import { useCallback } from "react";
import { useCommandFileWriter } from "./use-command-file-writer.js";
import type {
  FixtureInteractionIntent,
} from "../scene/fixture-interaction-intents.js";
import type { SpatialFixtureDescriptor } from "../scene/SpatialUiFixture.js";
import type { RoomMetadataEntry } from "../data/room-registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture ID helpers — encode roomId + action suffix in the fixtureId string
// ─────────────────────────────────────────────────────────────────────────────

/** Separator used in fixtureId encoding (mirrors task fixture convention). */
export const ROOM_FIXTURE_ID_SEP = ":" as const;

/** Fixture suffix for the capacity handle. */
export const ROOM_CONFIG_CAPACITY_SUFFIX = "capacity" as const;

/** Fixture suffix for the assignment-rules menu anchor. */
export const ROOM_CONFIG_RULES_SUFFIX = "rules" as const;

/** Build the canonical fixtureId for a room capacity handle. */
export function roomCapacityFixtureId(roomId: string): string {
  return `${roomId}${ROOM_FIXTURE_ID_SEP}${ROOM_CONFIG_CAPACITY_SUFFIX}`;
}

/** Build the canonical fixtureId for a room rules menu anchor. */
export function roomRulesFixtureId(roomId: string): string {
  return `${roomId}${ROOM_FIXTURE_ID_SEP}${ROOM_CONFIG_RULES_SUFFIX}`;
}

/**
 * Parse a fixtureId back into `{ roomId, suffix }`.
 * Returns null if the fixtureId is not in the expected pattern.
 */
export function parseRoomConfigFixtureId(
  fixtureId: string,
): { roomId: string; suffix: string } | null {
  const sepIdx = fixtureId.lastIndexOf(ROOM_FIXTURE_ID_SEP);
  if (sepIdx === -1) return null;
  const roomId = fixtureId.slice(0, sepIdx);
  const suffix = fixtureId.slice(sepIdx + 1);
  if (!roomId || !suffix) return null;
  return { roomId, suffix };
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual config — capacity occupancy ratio → Three.js numeric color
// ─────────────────────────────────────────────────────────────────────────────

/** Capacity handle color when occupancy is below 50% (healthy). */
export const ROOM_CAPACITY_OK_COLOR        = 0x69f0ae; // green

/** Capacity handle color when occupancy is 50–80% (moderate). */
export const ROOM_CAPACITY_MID_COLOR       = 0xffd600; // yellow

/** Capacity handle color when occupancy is ≥ 80% (near/at capacity). */
export const ROOM_CAPACITY_FULL_COLOR      = 0xff3d00; // red

/** Capacity handle color when room has no capacity ceiling (unlimited). */
export const ROOM_CAPACITY_UNLIMITED_COLOR = 0x00e5ff; // cyan

/** Assignment-rules menu anchor color (command accent magenta). */
export const ROOM_RULES_MENU_COLOR         = 0xe040fb; // magenta

/** Fixture color when interaction is disabled (grey). */
export const ROOM_FIXTURE_DISABLED_COLOR   = 0x444444; // grey

/**
 * Return the Three.js hex color for the capacity handle based on occupancy ratio.
 *
 * @param occupancy    Current agent count in the room.
 * @param maxOccupancy Maximum allowed occupancy (-1 = unlimited, no ceiling).
 */
export function getRoomCapacityColor(
  occupancy: number,
  maxOccupancy: number,
): number {
  if (maxOccupancy <= 0) return ROOM_CAPACITY_UNLIMITED_COLOR;
  const ratio = occupancy / maxOccupancy;
  if (ratio >= 0.8) return ROOM_CAPACITY_FULL_COLOR;
  if (ratio >= 0.5) return ROOM_CAPACITY_MID_COLOR;
  return ROOM_CAPACITY_OK_COLOR;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capacity delta computation — Y-axis drag → integer occupancy ceiling change
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scale factor: how many capacity units to change per world-unit of Y drag.
 * 1 world-unit drag → ±2 capacity slots.
 */
export const CAPACITY_DRAG_SCALE = 2;

/**
 * Minimum capacity ceiling the drag control can produce.
 * Prevents the ceiling from being dragged below 1.
 */
export const CAPACITY_MIN = 1;

/**
 * Maximum capacity ceiling the drag control can produce.
 * Prevents extreme accidental drags.
 */
export const CAPACITY_MAX = 50;

/**
 * Compute the new capacity ceiling from a drag interaction.
 *
 * If the drag origin or end world positions are missing (e.g. touch-cancel)
 * the function returns `null` (no change).
 *
 * @param currentMax  Current maxOccupancy (-1 = unlimited treated as 8).
 * @param dragOriginY World-Y at drag start.
 * @param dragEndY    World-Y at drag end.
 */
export function computeNewCapacityFromDrag(
  currentMax: number,
  dragOriginY: number,
  dragEndY: number,
): number {
  const base   = currentMax > 0 ? currentMax : 8; // treat unlimited as a base of 8
  const delta  = Math.round((dragEndY - dragOriginY) * CAPACITY_DRAG_SCALE);
  const next   = base + delta;
  return Math.max(CAPACITY_MIN, Math.min(CAPACITY_MAX, next));
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRoomConfigFixtures — pure factory (no hooks, fully testable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the `SpatialFixtureDescriptor[]` for a single room entity.
 *
 * Returns two fixtures:
 *   [0] capacity handle   — FixtureHandle, occupancy-ratio colour, left offset
 *   [1] rules menu anchor — FixtureMenuAnchor, magenta, right offset
 *
 * Local offsets position the fixtures near the room label / above the floor:
 *   capacity handle  → x = −0.35, y = 0.9 (left of centre, above floor)
 *   rules anchor     → x = +0.35, y = 0.9 (right of centre, above floor)
 *
 * @param roomId       Stable room identifier.
 * @param occupancy    Current agent count in the room.
 * @param maxOccupancy Maximum allowed occupancy (-1 = unlimited).
 * @param visible      If false, all fixtures are disabled (replay mode).
 */
export function buildRoomConfigFixtures(
  roomId: string,
  occupancy: number,
  maxOccupancy: number,
  visible = true,
): SpatialFixtureDescriptor[] {
  const capacityColor = visible
    ? getRoomCapacityColor(occupancy, maxOccupancy)
    : ROOM_FIXTURE_DISABLED_COLOR;

  return [
    // Fixture 0: Capacity handle — drag up/down to adjust the occupancy ceiling
    {
      fixtureId:   roomCapacityFixtureId(roomId),
      kind:        "handle" as const,
      color:       capacityColor,
      disabled:    !visible,
      localOffset: { x: -0.35, y: 0.9, z: 0 },
    },
    // Fixture 1: Assignment-rules menu anchor — opens role/policy configuration menu
    {
      fixtureId:   roomRulesFixtureId(roomId),
      kind:        "menu_anchor" as const,
      color:       visible ? ROOM_RULES_MENU_COLOR : ROOM_FIXTURE_DISABLED_COLOR,
      disabled:    !visible,
      localOffset: { x: 0.35, y: 0.9, z: 0 },
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRoomConfigMenuEntries — pure factory for assignment-rules context menu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Access policy values the room can be set to via the rules menu.
 * Mirrors the `accessPolicy` field on `RoomMetadataEntry`.
 */
export type RoomAccessPolicy =
  | "open"
  | "members-only"
  | "approval-required";

/** All access policies in UI display order. */
export const ROOM_ACCESS_POLICIES: readonly RoomAccessPolicy[] = [
  "open",
  "members-only",
  "approval-required",
] as const;

/**
 * Human-readable labels and icons for each access policy.
 */
export const ROOM_ACCESS_POLICY_LABEL: Record<RoomAccessPolicy, string> = {
  "open":               "Open access",
  "members-only":       "Members only",
  "approval-required":  "Approval required",
};

export const ROOM_ACCESS_POLICY_ICON: Record<RoomAccessPolicy, string> = {
  "open":               "○",
  "members-only":       "◉",
  "approval-required":  "◈",
};

/**
 * Shape of each entry in the room config rules context menu.
 * Passed to `contextMenuStore.openMenu()` when the rules anchor is clicked.
 */
export interface RoomConfigMenuEntry {
  label:     string;
  icon:      string;
  /** Item identifying the target entity and action. */
  item:      { entityType: "room"; entityId: string; action: string };
  variant?:  "normal" | "destructive" | "warning" | "disabled";
  separator?: boolean;
  /** Optional direct handler — invoked on menu selection. */
  onSelect?: () => void;
}

/**
 * Build the assignment-rules context menu entries for a room.
 *
 * The menu provides:
 *   • Access policy group (open / members-only / approval-required)
 *     Current policy is marked "← current" and is disabled.
 *   • "Set as fallback room" — marks this room as the global fallback
 *     for unmatched agent role assignments.
 *
 * @param room              Room metadata (access policy, name, etc.)
 * @param onPolicyChange    Callback invoked when user selects a new access policy.
 * @param onSetFallback     Callback invoked when user selects "Set as fallback".
 */
export function buildRoomConfigMenuEntries(
  room: RoomMetadataEntry,
  onPolicyChange: (roomId: string, policy: RoomAccessPolicy) => void,
  onSetFallback:  (roomId: string) => void,
): RoomConfigMenuEntry[] {
  const currentPolicy = room.accessPolicy as RoomAccessPolicy;

  const policyEntries: RoomConfigMenuEntry[] = ROOM_ACCESS_POLICIES.map(
    (policy): RoomConfigMenuEntry => ({
      label:    currentPolicy === policy
        ? `${ROOM_ACCESS_POLICY_LABEL[policy]} ← current`
        : ROOM_ACCESS_POLICY_LABEL[policy],
      icon:     ROOM_ACCESS_POLICY_ICON[policy],
      item:     { entityType: "room", entityId: room.roomId, action: "set_access_policy" },
      variant:  currentPolicy === policy ? "disabled" : "normal",
      onSelect: currentPolicy === policy
        ? undefined
        : () => onPolicyChange(room.roomId, policy),
    }),
  );

  return [
    // Access policy group header (non-interactive)
    {
      label:    "── Access Policy ──",
      icon:     "",
      item:     { entityType: "room", entityId: room.roomId, action: "noop" },
      variant:  "disabled",
      separator: false,
    },
    ...policyEntries,
    // Separator before fallback option
    {
      label:    "── Routing ──",
      icon:     "",
      item:     { entityType: "room", entityId: room.roomId, action: "noop" },
      variant:  "disabled",
      separator: true,
    },
    {
      label:    "Set as fallback room",
      icon:     "◎",
      item:     { entityType: "room", entityId: room.roomId, action: "set_fallback" },
      variant:  "normal",
      separator: false,
      onSelect: () => onSetFallback(room.roomId),
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useRoomConfigControlPlane
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return value of `useRoomConfigControlPlane`.
 */
export interface RoomConfigControlPlane {
  /**
   * Route a FixtureInteractionIntent from a room-entity fixture.
   *
   * Routing table:
   *   FIXTURE_HANDLE_DRAG_END   + suffix="capacity"
   *     → compute capacity delta from Y drag
   *     → write config.building_layout command (room capacity patch)
   *
   *   FIXTURE_MENU_ANCHOR_OPENED + suffix="rules"
   *     → invoke `onMenuOpen` with RoomConfigMenuEntry[]
   *
   *   All other intents → no-op
   */
  handleFixtureIntent: (
    intent:      FixtureInteractionIntent,
    roomEntry:   RoomMetadataEntry,
    occupancy:   number,
    onMenuOpen?: (entries: RoomConfigMenuEntry[], x: number, y: number) => void,
  ) => void;

  /**
   * Build SpatialFixtureDescriptor[] for a given room.
   * Delegates to buildRoomConfigFixtures(roomId, occupancy, maxOccupancy, visible).
   */
  getFixturesForRoom: (
    roomId:       string,
    occupancy:    number,
    maxOccupancy: number,
    visible?:     boolean,
  ) => SpatialFixtureDescriptor[];

  /**
   * Build the context menu entries for a room's rules anchor.
   * Delegates to buildRoomConfigMenuEntries(room, ...) with command-dispatch callbacks.
   */
  menuEntriesForRoom: (
    room:        RoomMetadataEntry,
    onMenuOpen?: (entries: RoomConfigMenuEntry[], x: number, y: number) => void,
  ) => RoomConfigMenuEntry[];
}

/**
 * `useRoomConfigControlPlane` — Sub-AC 7d hook.
 *
 * Bridges 3D fixture interaction intents on room entities to the room
 * configuration command layer.  Must be called inside a React tree that
 * has access to `useCommandFileWriter`.
 *
 * Record transparency
 * ────────────────────
 * Every orchestration command dispatched is recorded in the command lifecycle
 * store (via useCommandFileWriter), so all room config changes are fully
 * event-sourced and appear in the 3D replay event log.
 */
export function useRoomConfigControlPlane(): RoomConfigControlPlane {
  const cmdWriter = useCommandFileWriter();

  // ── Access policy dispatch ────────────────────────────────────────────────

  const dispatchAccessPolicy = useCallback(
    async (roomId: string, policy: RoomAccessPolicy): Promise<void> => {
      await cmdWriter
        .writeCommand(
          "config.building_layout",
          {
            layout: {
              roomStates: {
                [roomId]: { accessPolicy: policy },
              },
            },
            label: `room-access-policy-${roomId}-${policy}`,
          },
        )
        .catch((err) => {
          console.warn(
            "[RoomConfigControlPlane] dispatchAccessPolicy failed:",
            err,
          );
        });
    },
    [cmdWriter],
  );

  // ── Fallback room dispatch ────────────────────────────────────────────────

  const dispatchSetFallback = useCallback(
    async (roomId: string): Promise<void> => {
      await cmdWriter
        .writeCommand(
          "config.room_mapping",
          {
            mappings: [],        // no role re-mappings — only fallback change
            replace: false,
          },
        )
        .catch((err) => {
          console.warn(
            "[RoomConfigControlPlane] dispatchSetFallback failed:",
            err,
          );
        });
      // Also record the fallback change as a building_layout patch for replay
      await cmdWriter
        .writeCommand(
          "config.building_layout",
          {
            layout: { fallbackRoom: roomId },
            label:  `set-fallback-room-${roomId}`,
          },
        )
        .catch(() => undefined);
    },
    [cmdWriter],
  );

  // ── Capacity dispatch ─────────────────────────────────────────────────────

  const dispatchCapacityChange = useCallback(
    async (roomId: string, newCapacity: number): Promise<void> => {
      await cmdWriter
        .writeCommand(
          "config.building_layout",
          {
            layout: {
              roomStates: {
                [roomId]: { maxOccupancy: newCapacity },
              },
            },
            label: `room-capacity-${roomId}-${newCapacity}`,
          },
        )
        .catch((err) => {
          console.warn(
            "[RoomConfigControlPlane] dispatchCapacityChange failed:",
            err,
          );
        });
    },
    [cmdWriter],
  );

  // ── Main intent router ────────────────────────────────────────────────────

  const handleFixtureIntent = useCallback(
    (
      intent:    FixtureInteractionIntent,
      roomEntry: RoomMetadataEntry,
      occupancy: number,
      onMenuOpen?: (entries: RoomConfigMenuEntry[], x: number, y: number) => void,
    ): void => {
      // Only DRAG_END and MENU_ANCHOR_OPENED are actionable.
      if (
        intent.intent !== "FIXTURE_HANDLE_DRAG_END" &&
        intent.intent !== "FIXTURE_MENU_ANCHOR_OPENED"
      ) {
        return;
      }

      const parsed = parseRoomConfigFixtureId(intent.fixtureId);
      if (!parsed) return;

      const { roomId, suffix } = parsed;

      // ── Capacity handle drag ──────────────────────────────────────────────

      if (
        intent.intent === "FIXTURE_HANDLE_DRAG_END" &&
        suffix === ROOM_CONFIG_CAPACITY_SUFFIX
      ) {
        const dragOriginY = intent.dragOriginWorld?.y ?? null;
        const dragEndY    = intent.dragEndWorld?.y    ?? null;

        if (dragOriginY === null || dragEndY === null) return;

        const newCapacity = computeNewCapacityFromDrag(
          roomEntry.maxOccupancy,
          dragOriginY,
          dragEndY,
        );

        void dispatchCapacityChange(roomId, newCapacity);
        return;
      }

      // ── Rules menu anchor ─────────────────────────────────────────────────

      if (
        intent.intent === "FIXTURE_MENU_ANCHOR_OPENED" &&
        suffix === ROOM_CONFIG_RULES_SUFFIX
      ) {
        const screenPos = intent.screen_position;
        if (!screenPos) return;

        const entries = buildRoomConfigMenuEntries(
          roomEntry,
          (id, policy) => void dispatchAccessPolicy(id, policy),
          (id)          => void dispatchSetFallback(id),
        );

        onMenuOpen?.(entries, screenPos.x, screenPos.y);
      }
    },
    [dispatchCapacityChange, dispatchAccessPolicy, dispatchSetFallback],
  );

  // ── Convenience delegates ─────────────────────────────────────────────────

  const getFixturesForRoom = useCallback(
    (
      roomId:       string,
      occupancy:    number,
      maxOccupancy: number,
      visible = true,
    ): SpatialFixtureDescriptor[] =>
      buildRoomConfigFixtures(roomId, occupancy, maxOccupancy, visible),
    [],
  );

  const menuEntriesForRoom = useCallback(
    (
      room: RoomMetadataEntry,
    ): RoomConfigMenuEntry[] =>
      buildRoomConfigMenuEntries(
        room,
        (id, policy) => void dispatchAccessPolicy(id, policy),
        (id)          => void dispatchSetFallback(id),
      ),
    [dispatchAccessPolicy, dispatchSetFallback],
  );

  return { handleFixtureIntent, getFixturesForRoom, menuEntriesForRoom };
}
