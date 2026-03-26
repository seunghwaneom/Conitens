/**
 * ui-fixture-registry.ts — Entity registry for the `ui_fixture` entity type.
 *
 * Sub-AC 6a: Define and render the dashboard_panel ui_fixture entity.
 *
 * `ui_fixture` is a domain-level entity type representing interactive diegetic
 * surfaces embedded in the 3D command-center world.  Each fixture is a
 * first-class entity with:
 *   - A stable `fixture_id` (slug)
 *   - A `fixture_type` discriminator (e.g. `dashboard_panel`)
 *   - A `room_id` linking the fixture to its containing room
 *   - A full 3D `transform` (position, rotation, scale) in room-local space
 *   - Visual configuration (width, height, colors, label)
 *   - A `behavioral_contract` declaring what the fixture CAN DO
 *
 * Ontology budget note: `ui_fixture` is a *domain-level* entity using the
 * existing EntityRoomMapping shape (no new top-level entity fields added to
 * the ontology).
 *
 * Design principles:
 *   - RECORD TRANSPARENCY: `fixture.placed` events are emitted when fixtures
 *     are registered so that all state-changing actions are event-sourced.
 *   - REFLEXIVE CLOSURE: The registry can describe itself as an entry.
 *   - STATIC: Zero I/O on import — all defaults are inlined constants.
 *   - BEHAVIORAL CONTRACTS: Every fixture entry declares what it CAN DO.
 *
 * Mount conventions (matches DisplaySurfaces.tsx):
 *   facing='north' → panel normal points south (−Z) → rotationY = π
 *   facing='south' → panel normal points north (+Z) → rotationY = 0
 *   facing='east'  → panel normal points west  (−X) → rotationY = π/2
 *   facing='west'  → panel normal points east  (+X) → rotationY = −π/2
 */

// ---------------------------------------------------------------------------
// Fixture type discriminator
// ---------------------------------------------------------------------------

/**
 * All registered `ui_fixture` sub-types.
 *
 * `dashboard_panel` — A flat low-poly display surface (plane/quad) mounted
 *                     on a wall or desk, showing live metrics, task lists,
 *                     or status information in the 3D world.
 *
 * Additional types may be added in future ACs (e.g. `control_panel`,
 * `status_light`), but each addition must pass the stability check.
 */
export type UiFixtureType =
  | "dashboard_panel"    // flat wall/desk-mounted status display (Sub-AC 6a)
  | "control_panel"      // interactive button/lever panel
  | "status_light"       // indicator light cluster
  | "info_kiosk";        // freestanding information terminal

/** All registered ui_fixture types (ordered by sub-AC introduction) */
export const UI_FIXTURE_TYPES: readonly UiFixtureType[] = [
  "dashboard_panel",
  "control_panel",
  "status_light",
  "info_kiosk",
] as const;

/** O(1) membership test */
export const UI_FIXTURE_TYPE_SET: ReadonlySet<string> = new Set(UI_FIXTURE_TYPES);

/** Type guard: narrows an unknown string to UiFixtureType */
export function isUiFixtureType(s: string): s is UiFixtureType {
  return UI_FIXTURE_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// Spatial transform
// ---------------------------------------------------------------------------

/**
 * 3D transform for a fixture in room-local coordinate space.
 *
 * - `position`  — room-local origin offset (x right, y up, z toward viewer)
 * - `rotation`  — Euler angles in radians (Y-axis is dominant for wall panels)
 * - `scale`     — uniform or per-axis scale (default 1)
 * - `facing`    — semantic wall/desk attachment direction
 * - `mountType` — how the fixture attaches to building geometry
 */
export interface UiFixtureTransform {
  /** Room-local position offset */
  position: { x: number; y: number; z: number };
  /** Euler rotation (radians). rotationY derived from `facing`. */
  rotation: { x: number; y: number; z: number };
  /** Per-axis scale (usually 1) */
  scale: { x: number; y: number; z: number };
  /** Which direction the fixture face is oriented toward */
  facing: "north" | "south" | "east" | "west" | "up";
  /** How the fixture is attached to the room */
  mountType: "wall" | "desk" | "floor" | "ceiling";
}

// ---------------------------------------------------------------------------
// Dashboard panel metadata (data-source bindings)
// ---------------------------------------------------------------------------

/**
 * Metadata bindings for a `dashboard_panel` fixture declaring which live
 * data sources populate the panel's three primary display sections.
 *
 * Sub-AC 6a requirement: fixtures must declare sources for
 *   - live agent count        (changes every agent lifecycle event)
 *   - task status summary     (changes every task-state transition)
 *   - event rate              (changes every EventLog append)
 *
 * Values are store-key strings that the rendering layer resolves at runtime.
 * Using string references (not imports) keeps the registry free of circular
 * dependencies on store modules.
 *
 * @example
 *   live_agent_count_source:    "agent-store"
 *   task_status_summary_source: "task-store"
 *   event_rate_source:          "event-log"
 */
export interface DashboardPanelMetadata {
  /**
   * Store key from which to read the live agent count.
   * Typically "agent-store" — the Zustand registry of active agents.
   */
  live_agent_count_source: string;
  /**
   * Store key from which to read the task status summary
   * (breakdown of tasks by status: active, blocked, done, etc.).
   * Typically "task-store".
   */
  task_status_summary_source: string;
  /**
   * Store key from which to read the current event rate
   * (events per second emitted by the orchestrator EventLog).
   * Typically "event-log".
   */
  event_rate_source: string;
}

// ---------------------------------------------------------------------------
// Dashboard panel visual config
// ---------------------------------------------------------------------------

/**
 * Visual configuration for a `dashboard_panel` fixture.
 *
 * The panel renders as:
 *  - An outer bezel/frame (low-poly flat rectangle)
 *  - An inner screen face with emissive accent color
 *  - Optional scan-line overlay (dark stripes, low opacity)
 */
export interface DashboardPanelVisualConfig {
  /** Panel width in grid units (x-axis extent) */
  width: number;
  /** Panel height in grid units (y-axis extent) */
  height: number;
  /** Bezel/frame hex colour */
  bezelColor: string;
  /** Screen face base hex colour (usually dark) */
  screenColor: string;
  /** Emissive accent tint applied to screen face */
  accentColor: string;
  /** Emissive intensity (0–3); default 0.4 */
  emissiveIntensity: number;
  /** Whether scan-line overlay is rendered */
  scanLines: boolean;
  /** Opacity of the scan-line overlay (0–1) */
  scanLineOpacity: number;
}

// ---------------------------------------------------------------------------
// ui_fixture definition interface
// ---------------------------------------------------------------------------

/**
 * A single registered `ui_fixture` entity.
 *
 * Follows the EntityRoomMapping shape (same ontology level, same field budget)
 * while adding fixture-specific spatial and visual fields.
 */
export interface UiFixtureDef {
  // ── Identity ──────────────────────────────────────────────────────────
  /** Stable slug identifier (e.g. "ops-dashboard-main") */
  fixture_id: string;
  /** Human-readable display name */
  fixture_name: string;
  /** Fixture sub-type discriminator */
  fixture_type: UiFixtureType;

  // ── Room assignment ────────────────────────────────────────────────────
  /** Owning room (from BUILDING.rooms[].roomId) */
  room_id: string;

  // ── Spatial transform ──────────────────────────────────────────────────
  /** Room-local 3D transform */
  transform: UiFixtureTransform;

  // ── Visual config ──────────────────────────────────────────────────────
  /**
   * Visual configuration. Shape depends on `fixture_type`.
   * For `dashboard_panel` this is a DashboardPanelVisualConfig.
   */
  visual: DashboardPanelVisualConfig;

  // ── Content ────────────────────────────────────────────────────────────
  /**
   * What content type the panel displays.
   * Determines which data source populates the screen texture.
   *
   * Examples: "task_list", "agent_status", "event_log", "metrics"
   */
  content_type: string;

  // ── Live data-source metadata ──────────────────────────────────────────
  /**
   * Metadata bindings for live data sources.
   *
   * For `dashboard_panel` fixtures this declares which stores supply the
   * three canonical metric sections:
   *   - live agent count
   *   - task status summary
   *   - event rate
   *
   * Optional because non-dashboard fixtures (status_light, info_kiosk)
   * may not expose all three metrics.  dashboard_panel fixtures SHOULD
   * always supply all three fields.
   */
  metadata?: DashboardPanelMetadata;

  // ── Behavioral contract ────────────────────────────────────────────────
  /**
   * What this fixture CAN DO in its assigned room.
   * At least one action is required (prevents noun-verb asymmetry).
   */
  behavioral_contract: {
    actions: readonly string[];
    reads?: readonly string[];
    emits?: readonly string[];
  };

  // ── Ontology ───────────────────────────────────────────────────────────
  /** Ontology level (always "domain" for ui_fixture) */
  ontology_level: "domain";

  // ── Audit ─────────────────────────────────────────────────────────────
  /** Human-readable rationale for this fixture's placement */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Helper: compute rotationY from facing
// ---------------------------------------------------------------------------

/**
 * Convert a `facing` direction to a Y-axis rotation in radians.
 * Matches the convention in DisplaySurfaces.tsx so both systems are consistent.
 *
 * facing='north' → π     (panel face points south, −Z)
 * facing='south' → 0     (panel face points north, +Z)
 * facing='east'  → π/2   (panel face points west,  −X)
 * facing='west'  → −π/2  (panel face points east,  +X)
 * facing='up'    → 0     (floor-standing, face points up)
 */
export function facingToRotY(
  facing: UiFixtureTransform["facing"],
): number {
  switch (facing) {
    case "north": return Math.PI;
    case "south": return 0;
    case "east":  return Math.PI / 2;
    case "west":  return -Math.PI / 2;
    case "up":    return 0;
  }
}

// ---------------------------------------------------------------------------
// Default dashboard_panel visual config factory
// ---------------------------------------------------------------------------

/**
 * Construct a default DashboardPanelVisualConfig for a given room accent color.
 * Used when building the default registry entries.
 */
export function defaultDashboardPanelVisual(
  accentColor: string,
  opts?: Partial<DashboardPanelVisualConfig>,
): DashboardPanelVisualConfig {
  return {
    width:             1.6,
    height:            0.9,
    bezelColor:        "#1a1a2a",
    screenColor:       "#0a0a14",
    accentColor,
    emissiveIntensity: 0.4,
    scanLines:         true,
    scanLineOpacity:   0.06,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// Default ui_fixture registry — initial placements
// ---------------------------------------------------------------------------

/**
 * The canonical list of pre-placed `ui_fixture` entities.
 *
 * Every entry here will emit a `fixture.placed` event on scene boot so that
 * the event log contains a complete audit trail of the initial fixture layout.
 *
 * Placement rationale:
 *
 *   ops-dashboard-main      — Primary command dashboard in Operations Control;
 *                             wall-mounted above the command desk, facing into
 *                             the room.  Shows agent status + task overview.
 *
 *   ops-dashboard-secondary — Secondary task board in Operations Control;
 *                             side wall, showing task queue and priorities.
 *
 *   lobby-status-panel      — Status panel in Project Main lobby;
 *                             reception wall, showing project health overview.
 *
 *   impl-diff-panel         — Code diff / pipeline panel in Implementation
 *                             Office; north wall above workstations.
 *
 * Room-local coordinate convention:
 *   All positions are relative to the room's own origin (room.position).
 *   The scene translates these to world space during render.
 */
export const DEFAULT_UI_FIXTURES: readonly UiFixtureDef[] = [
  // ── Operations Control (ops-control) ──────────────────────────────────────
  {
    fixture_id:    "ops-dashboard-main",
    fixture_name:  "Operations Dashboard",
    fixture_type:  "dashboard_panel",
    room_id:       "ops-control",
    transform: {
      position:  { x: 2.5, y: 1.5, z: 3.85 },  // north wall, above command desk
      rotation:  { x: 0, y: Math.PI, z: 0 },    // facing south (into room)
      scale:     { x: 1, y: 1, z: 1 },
      facing:    "north",
      mountType: "wall",
    },
    visual: defaultDashboardPanelVisual("#FF7043", { width: 1.8, height: 1.0 }),
    content_type:  "agent_status",
    // Sub-AC 6a: live data-source metadata bindings
    metadata: {
      live_agent_count_source:    "agent-store",
      task_status_summary_source: "task-store",
      event_rate_source:          "event-log",
    },
    behavioral_contract: {
      actions: ["display agent status", "render task overview", "emit fixture.panel_toggled on click"],
      reads:   ["agent-store", "task-store"],
      emits:   ["fixture.panel_toggled"],
    },
    ontology_level: "domain",
    rationale: "Primary command panel in Operations Control; provides at-a-glance agent status and task queue to the operator.",
  },

  {
    fixture_id:    "ops-dashboard-secondary",
    fixture_name:  "Task Priority Board",
    fixture_type:  "dashboard_panel",
    room_id:       "ops-control",
    transform: {
      position:  { x: 0.4, y: 1.3, z: 3.85 },  // north wall, left side
      rotation:  { x: 0, y: Math.PI, z: 0 },    // facing south
      scale:     { x: 1, y: 1, z: 1 },
      facing:    "north",
      mountType: "wall",
    },
    visual: defaultDashboardPanelVisual("#FF7043", { width: 1.2, height: 0.8 }),
    content_type:  "task_list",
    // Sub-AC 6a: live data-source metadata bindings
    metadata: {
      live_agent_count_source:    "agent-store",
      task_status_summary_source: "task-store",
      event_rate_source:          "event-log",
    },
    behavioral_contract: {
      actions: ["display task list", "highlight priority tasks", "emit fixture.panel_toggled on click"],
      reads:   ["agent-store", "task-store"],
      emits:   ["fixture.panel_toggled"],
    },
    ontology_level: "domain",
    rationale: "Secondary task board showing prioritised queue; allows operator to quickly identify blocked or critical tasks.",
  },

  // ── Project Main (project-main) ───────────────────────────────────────────
  {
    fixture_id:    "lobby-status-panel",
    fixture_name:  "Project Status Panel",
    fixture_type:  "dashboard_panel",
    room_id:       "project-main",
    transform: {
      position:  { x: 2.0, y: 1.5, z: 3.85 },  // north wall (status-board slot)
      rotation:  { x: 0, y: Math.PI, z: 0 },    // facing south (into lobby)
      scale:     { x: 1, y: 1, z: 1 },
      facing:    "north",
      mountType: "wall",
    },
    visual: defaultDashboardPanelVisual("#4FC3F7", { width: 1.6, height: 0.9 }),
    content_type:  "metrics",
    // Sub-AC 6a: live data-source metadata bindings
    metadata: {
      live_agent_count_source:    "agent-store",
      task_status_summary_source: "task-store",
      event_rate_source:          "event-log",
    },
    behavioral_contract: {
      actions: ["display project health metrics", "show recent event log entries"],
      reads:   ["metrics-store", "scene-event-log"],
      emits:   ["fixture.panel_toggled"],
    },
    ontology_level: "domain",
    rationale: "Reception area status panel providing a project-wide health summary visible on entry to the building.",
  },

  // ── Implementation Office (impl-office) ───────────────────────────────────
  {
    fixture_id:    "impl-diff-panel",
    fixture_name:  "Code Pipeline Panel",
    fixture_type:  "dashboard_panel",
    room_id:       "impl-office",
    transform: {
      position:  { x: 2.0, y: 1.5, z: 2.85 },  // north wall (diff-screen slot)
      rotation:  { x: 0, y: Math.PI, z: 0 },    // facing south
      scale:     { x: 1, y: 1, z: 1 },
      facing:    "north",
      mountType: "wall",
    },
    visual: defaultDashboardPanelVisual("#66BB6A", { width: 1.4, height: 0.85 }),
    content_type:  "event_log",
    // Sub-AC 6a: live data-source metadata bindings
    metadata: {
      live_agent_count_source:    "agent-store",
      task_status_summary_source: "task-store",
      event_rate_source:          "event-log",
    },
    behavioral_contract: {
      actions: ["display pipeline status", "show implementation task progress"],
      reads:   ["pipeline-store", "task-store"],
      emits:   ["fixture.panel_toggled"],
    },
    ontology_level: "domain",
    rationale: "Wall-mounted code pipeline panel in Implementation Office; shows live pipeline state and diff summaries.",
  },
] as const;

// ---------------------------------------------------------------------------
// Registry lookup helpers
// ---------------------------------------------------------------------------

/**
 * Map from fixture_id → UiFixtureDef for O(1) lookup.
 */
export const UI_FIXTURE_MAP: ReadonlyMap<string, UiFixtureDef> = new Map(
  DEFAULT_UI_FIXTURES.map((f) => [f.fixture_id, f]),
);

/**
 * Get a UiFixtureDef by its fixture_id. Returns `undefined` if not found.
 */
export function getUiFixture(fixtureId: string): UiFixtureDef | undefined {
  return UI_FIXTURE_MAP.get(fixtureId);
}

/**
 * Get all fixtures registered in a specific room.
 */
export function getFixturesForRoom(roomId: string): readonly UiFixtureDef[] {
  return DEFAULT_UI_FIXTURES.filter((f) => f.room_id === roomId);
}

/**
 * Get all fixtures of a specific type.
 */
export function getFixturesByType(fixtureType: UiFixtureType): readonly UiFixtureDef[] {
  return DEFAULT_UI_FIXTURES.filter((f) => f.fixture_type === fixtureType);
}

/**
 * Get all `dashboard_panel` fixtures across all rooms.
 * Convenience wrapper around getFixturesByType('dashboard_panel').
 */
export function getDashboardPanels(): readonly UiFixtureDef[] {
  return getFixturesByType("dashboard_panel");
}

/**
 * Validate that all registered fixtures have:
 *   1. Unique fixture_ids
 *   2. Non-empty behavioral_contract.actions
 *   3. Valid fixture_type
 *   4. Non-empty room_id
 *
 * Returns an array of validation error strings (empty = valid).
 */
export function validateUiFixtureRegistry(
  fixtures: readonly UiFixtureDef[] = DEFAULT_UI_FIXTURES,
): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const f of fixtures) {
    if (seenIds.has(f.fixture_id)) {
      errors.push(`Duplicate fixture_id: "${f.fixture_id}"`);
    }
    seenIds.add(f.fixture_id);

    if (!isUiFixtureType(f.fixture_type)) {
      errors.push(
        `Unknown fixture_type "${f.fixture_type}" on fixture "${f.fixture_id}"`,
      );
    }

    if (!f.room_id) {
      errors.push(`Missing room_id on fixture "${f.fixture_id}"`);
    }

    if (!f.behavioral_contract.actions.length) {
      errors.push(
        `No behavioral_contract.actions on fixture "${f.fixture_id}"`,
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Geometry helpers (pure, no Three.js import — tested headlessly)
// ---------------------------------------------------------------------------

/**
 * Compute the world-space position of a fixture given the room's world-space
 * origin.  The room origin is room.position (from BuildingDef), already
 * expressed in world units.
 *
 * @param roomOrigin  Room's world-space origin { x, y, z }
 * @param transform   Fixture's room-local transform
 * @returns           World-space position { x, y, z }
 */
export function computeFixtureWorldPosition(
  roomOrigin: { x: number; y: number; z: number },
  transform: UiFixtureTransform,
): { x: number; y: number; z: number } {
  return {
    x: roomOrigin.x + transform.position.x,
    y: roomOrigin.y + transform.position.y,
    z: roomOrigin.z + transform.position.z,
  };
}

/**
 * Compute a fixture's full world-space rotation by merging the room's base
 * rotation (typically zero) with the fixture's local rotation.
 *
 * @param localRotation  Room-local Euler rotation { x, y, z } in radians
 * @param roomRotationY  Room's Y-rotation in world space (usually 0)
 * @returns              World-space Euler rotation { x, y, z }
 */
export function computeFixtureWorldRotation(
  localRotation: { x: number; y: number; z: number },
  roomRotationY: number = 0,
): { x: number; y: number; z: number } {
  return {
    x: localRotation.x,
    y: localRotation.y + roomRotationY,
    z: localRotation.z,
  };
}

/**
 * Compute bezel border thickness in grid units.
 * Bezel occupies a fixed 8% of the smaller dimension.
 */
export function computeBezelThickness(width: number, height: number): number {
  return Math.min(width, height) * 0.08;
}

/**
 * Compute screen face dimensions (inset from bezel).
 *
 * @returns { screenW, screenH } — inner screen dimensions
 */
export function computeScreenDimensions(
  width: number,
  height: number,
): { screenW: number; screenH: number } {
  const bezel = computeBezelThickness(width, height);
  return {
    screenW: width  - bezel * 2,
    screenH: height - bezel * 2,
  };
}
