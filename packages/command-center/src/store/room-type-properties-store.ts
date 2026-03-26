/**
 * room-type-properties-store.ts — Zustand store for the active room-type-to-properties map.
 *
 * Sub-AC 2 (AC 12): Exposes the room-type-to-visual-properties map in a
 * mutable, observable Zustand store so the 3D scene can subscribe and
 * re-render when room type properties change at runtime.
 *
 * The store holds a `Record<RoomType, RoomTypeVisualProperties>` that is
 * the single runtime source of truth for:
 *   - Marker geometry visual config (color, emissive, icon, animation, scale)
 *   - Volume box visual config (fillColor, fillOpacity, edgeColor, edgeOpacity)
 *   - Floor stripe color
 *
 * Design principles:
 *   - Initialised from the compiled-in DEFAULT_ROOM_TYPE_PROPERTIES constants.
 *   - All mutations are recorded as events (record transparency).
 *   - The 3D scene subscribes via `useRoomTypePropertiesStore` — Zustand
 *     automatically re-renders any subscribed component when properties change.
 *   - Persists mutations to localStorage via the "room-type-props:v1" key so
 *     customisations survive page reloads.
 *
 * Integration:
 *   - RoomTypeVisuals.tsx reads `roomTypeProperties` via selector to render
 *     role-based markers and badges.
 *   - RoomVolume.tsx reads `roomTypeProperties` via selector to colour volumes.
 *   - Any command-file action can call `updateRoomTypeProperties` at runtime
 *     to restyle a room type and see the 3D scene update immediately.
 *
 * Room types (from building.ts RoomType):
 *   "control" | "office" | "lab" | "lobby" | "archive" | "corridor"
 */

import { create } from "zustand";

// ── RoomType (mirrored to avoid circular dep) ───────────────────────────────

export type RoomType =
  | "control"
  | "office"
  | "lab"
  | "lobby"
  | "archive"
  | "corridor";

export const ALL_ROOM_TYPES: readonly RoomType[] = [
  "control",
  "office",
  "lab",
  "lobby",
  "archive",
  "corridor",
] as const;

// ── Room Type Visual Properties ─────────────────────────────────────────────

/** Animation style for the floating 3D marker above each room. */
export type RoomMarkerAnimation = "pulse" | "rotate" | "bob" | "none";

/**
 * Consolidated visual properties for a single room type.
 *
 * Combines the marker config (floating geometry above the room) and the
 * volume config (the semi-transparent box that fills the room footprint)
 * into a single record so all per-type visuals can be updated atomically.
 */
export interface RoomTypeVisualProperties {
  // ── Marker visuals (geometry floating above the room) ──────────────────
  /** Primary marker / volume fill colour (hex) */
  color: string;
  /** Emissive glow colour (hex) */
  emissive: string;
  /** Emissive intensity (0–1) */
  emissiveIntensity: number;
  /** Unicode icon character for diegetic badge */
  icon: string;
  /** Short ALLCAPS abbreviation shown on the badge */
  label: string;
  /** Animation applied to the floating marker above the room */
  animation: RoomMarkerAnimation;
  /** Uniform scale of the marker geometry */
  markerScale: number;

  // ── Volume visuals (semi-transparent box filling room footprint) ────────
  /** Semi-transparent fill colour of the room box (usually same as color) */
  fillColor: string;
  /** Fill opacity in the normal (unhovered) state (0–1) */
  fillOpacity: number;
  /** Edge / wireframe colour (hex) */
  edgeColor: string;
  /** Edge opacity in the normal (unhovered) state (0–1) */
  edgeOpacity: number;
  /** Floor stripe colour (flat plane at floor level) */
  stripeColor: string;
  /** EdgeGeometry crease angle in degrees (lower = fewer, sharper edges) */
  edgeThresholdAngle: number;
}

/** Full map of room type → visual properties. */
export type RoomTypePropertiesMap = Record<RoomType, RoomTypeVisualProperties>;

// ── Default values ──────────────────────────────────────────────────────────

/**
 * Compiled-in defaults — mirrors the static constants in RoomTypeVisuals.tsx
 * and RoomVolume.tsx so the store initialises to the same visual state as the
 * previous hard-coded approach.
 *
 * These are the authoritative defaults; `resetToDefaults` restores them.
 */
export const DEFAULT_ROOM_TYPE_PROPERTIES: RoomTypePropertiesMap = {
  control: {
    color: "#FF7043",
    emissive: "#FF4500",
    emissiveIntensity: 0.6,
    icon: "⬡",
    label: "CTRL",
    animation: "pulse",
    markerScale: 0.28,
    fillColor: "#FF7043",
    fillOpacity: 0.13,
    edgeColor: "#FF9966",
    edgeOpacity: 0.65,
    stripeColor: "#FF7043",
    edgeThresholdAngle: 15,
  },
  office: {
    color: "#66BB6A",
    emissive: "#33AA33",
    emissiveIntensity: 0.3,
    icon: "▣",
    label: "OFFC",
    animation: "bob",
    markerScale: 0.22,
    fillColor: "#66BB6A",
    fillOpacity: 0.09,
    edgeColor: "#88DD88",
    edgeOpacity: 0.50,
    stripeColor: "#66BB6A",
    edgeThresholdAngle: 15,
  },
  lab: {
    color: "#AB47BC",
    emissive: "#9933CC",
    emissiveIntensity: 0.5,
    icon: "◎",
    label: "LAB",
    animation: "rotate",
    markerScale: 0.25,
    fillColor: "#AB47BC",
    fillOpacity: 0.11,
    edgeColor: "#CC66DD",
    edgeOpacity: 0.58,
    stripeColor: "#AB47BC",
    edgeThresholdAngle: 15,
  },
  lobby: {
    color: "#4FC3F7",
    emissive: "#0099FF",
    emissiveIntensity: 0.4,
    icon: "◯",
    label: "MAIN",
    animation: "pulse",
    markerScale: 0.3,
    fillColor: "#4FC3F7",
    fillOpacity: 0.11,
    edgeColor: "#7DD8FF",
    edgeOpacity: 0.55,
    stripeColor: "#4FC3F7",
    edgeThresholdAngle: 15,
  },
  archive: {
    color: "#78909C",
    emissive: "#506878",
    emissiveIntensity: 0.2,
    icon: "▥",
    label: "ARCH",
    animation: "none",
    markerScale: 0.2,
    fillColor: "#78909C",
    fillOpacity: 0.07,
    edgeColor: "#90A8B4",
    edgeOpacity: 0.40,
    stripeColor: "#78909C",
    edgeThresholdAngle: 15,
  },
  corridor: {
    color: "#546E7A",
    emissive: "#3D5060",
    emissiveIntensity: 0.15,
    icon: "△",
    label: "PATH",
    animation: "none",
    markerScale: 0.15,
    fillColor: "#546E7A",
    fillOpacity: 0.04,
    edgeColor: "#7090A0",
    edgeOpacity: 0.28,
    stripeColor: "#546E7A",
    edgeThresholdAngle: 15,
  },
};

// ── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "conitens:room-type-props:v1";

function loadFromStorage(): RoomTypePropertiesMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoomTypePropertiesMap>;
    // Validate: every room type must be present
    if (!ALL_ROOM_TYPES.every((t) => parsed[t] != null)) return null;
    return parsed as RoomTypePropertiesMap;
  } catch {
    return null;
  }
}

function saveToStorage(props: RoomTypePropertiesMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(props));
  } catch {
    // Quota or SSR — silently ignore
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // SSR — silently ignore
  }
}

// ── Event types ─────────────────────────────────────────────────────────────

export type RoomTypePropertiesEventType =
  | "room_type_props.loaded_from_storage"   // Restored from localStorage on startup
  | "room_type_props.updated"               // One room type's properties patched
  | "room_type_props.reset";                // All types reset to compiled defaults

export interface RoomTypePropertiesEvent {
  id: string;
  type: RoomTypePropertiesEventType;
  ts: number;
  payload: Record<string, unknown>;
}

let _counter = 0;
function nextId(): string {
  return `rtpe-${Date.now()}-${++_counter}`;
}

// ── Store shape ─────────────────────────────────────────────────────────────

export interface RoomTypePropertiesStoreState {
  /**
   * Active room-type-to-visual-properties map.
   *
   * This is the reactive single source of truth consumed by the 3D scene.
   * Any Zustand subscriber that reads from this record will automatically
   * re-render when it changes.
   */
  roomTypeProperties: RoomTypePropertiesMap;

  /** Append-only event log for record transparency */
  events: RoomTypePropertiesEvent[];

  /** Where the initial properties were loaded from */
  source: "defaults" | "storage";

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Patch properties for a specific room type.
   *
   * Only the supplied keys are updated; unmentioned keys are preserved.
   * The change is persisted to localStorage and recorded as an event.
   *
   * @example
   * // Make the control room glow red
   * updateRoomTypeProperties("control", { color: "#FF0000", emissive: "#FF0000" });
   */
  updateRoomTypeProperties: (
    roomType: RoomType,
    updates: Partial<RoomTypeVisualProperties>,
  ) => void;

  /**
   * Reset ALL room types back to DEFAULT_ROOM_TYPE_PROPERTIES.
   * Also clears localStorage so the next page load starts from defaults.
   */
  resetToDefaults: () => void;

  /**
   * Return the visual properties for a single room type.
   * Convenience getter — equivalent to `roomTypeProperties[roomType]`.
   */
  getPropertiesForType: (roomType: RoomType) => RoomTypeVisualProperties;
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

function buildInitialState(): Pick<
  RoomTypePropertiesStoreState,
  "roomTypeProperties" | "events" | "source"
> {
  const persisted = loadFromStorage();

  if (persisted) {
    const loadEvent: RoomTypePropertiesEvent = {
      id: nextId(),
      type: "room_type_props.loaded_from_storage",
      ts: Date.now(),
      payload: { reason: "Room type properties restored from localStorage" },
    };
    return {
      roomTypeProperties: persisted,
      events: [loadEvent],
      source: "storage",
    };
  }

  // Deep-clone defaults so mutations never touch the original constant
  const defaultProps = deepCloneDefaults();
  return {
    roomTypeProperties: defaultProps,
    events: [],
    source: "defaults",
  };
}

function deepCloneDefaults(): RoomTypePropertiesMap {
  const clone = {} as RoomTypePropertiesMap;
  for (const type of ALL_ROOM_TYPES) {
    clone[type] = { ...DEFAULT_ROOM_TYPE_PROPERTIES[type] };
  }
  return clone;
}

const INITIAL = buildInitialState();

// ── Store ────────────────────────────────────────────────────────────────────

/**
 * useRoomTypePropertiesStore — reactive store for room-type visual properties.
 *
 * 3D scene components subscribe to this store to get the current room-type
 * visual configuration. When any property is updated (e.g. color changes),
 * all subscribed components automatically re-render.
 *
 * @example
 * // In a 3D scene component:
 * const props = useRoomTypePropertiesStore(s => s.roomTypeProperties);
 * const controlColor = props.control.color; // Reactive — updates on change
 *
 * @example
 * // Select a single room type's properties:
 * const labProps = useRoomTypePropertiesStore(s => s.roomTypeProperties.lab);
 */
export const useRoomTypePropertiesStore =
  create<RoomTypePropertiesStoreState>((set, get) => ({
    ...INITIAL,

    updateRoomTypeProperties: (roomType, updates) => {
      const current = get().roomTypeProperties[roomType];
      // No-op if no actual change
      const hasChange = Object.entries(updates).some(
        ([k, v]) => current[k as keyof RoomTypeVisualProperties] !== v,
      );
      if (!hasChange) return;

      const event: RoomTypePropertiesEvent = {
        id: nextId(),
        type: "room_type_props.updated",
        ts: Date.now(),
        payload: {
          roomType,
          updates,
          reason: `Room type '${roomType}' properties updated`,
        },
      };

      set((state) => {
        const newProps: RoomTypePropertiesMap = {
          ...state.roomTypeProperties,
          [roomType]: { ...state.roomTypeProperties[roomType], ...updates },
        };
        saveToStorage(newProps);
        return {
          roomTypeProperties: newProps,
          events: [...state.events, event],
        };
      });
    },

    resetToDefaults: () => {
      clearStorage();

      const event: RoomTypePropertiesEvent = {
        id: nextId(),
        type: "room_type_props.reset",
        ts: Date.now(),
        payload: { reason: "All room type properties reset to compiled defaults" },
      };

      const defaultProps = deepCloneDefaults();

      set((state) => ({
        roomTypeProperties: defaultProps,
        events: [...state.events, event],
        source: "defaults" as const,
      }));
    },

    getPropertiesForType: (roomType) => {
      return get().roomTypeProperties[roomType];
    },
  }));

// ── Selector hooks — pre-built fine-grained selectors ────────────────────────

/**
 * Subscribe to a single room type's properties.
 * The component only re-renders when that specific room type's properties change.
 *
 * @example
 * const controlProps = useRoomTypeProperties("control");
 */
export function useRoomTypeProperties(
  roomType: RoomType,
): RoomTypeVisualProperties {
  return useRoomTypePropertiesStore(
    (s) => s.roomTypeProperties[roomType],
  );
}

/**
 * Subscribe to the full room-type-properties map.
 * Re-renders when any room type's properties change.
 */
export function useAllRoomTypeProperties(): RoomTypePropertiesMap {
  return useRoomTypePropertiesStore((s) => s.roomTypeProperties);
}
