/**
 * StoreDrivenDashboardPanels.tsx — Entity-store-driven rendering bridge for
 * dashboard_panel ui_fixture entities.
 *
 * Sub-AC 6b: Implement 3D rendering of the dashboard_panel ui_fixture as a
 * low-poly surface inside its assigned room, ensuring it appears as a spatial
 * object within the scene and is retrievable/renderable from the entity store.
 *
 * ## Design
 *
 * All previous dashboard-panel rendering (DashboardPanel.tsx,
 * DashboardPanelMetrics.tsx) reads from the *static* ui-fixture-registry — a
 * compile-time constant.  This module provides the runtime counterpart:
 *
 *   useUiFixtureStore (entity store)
 *         │
 *         ▼
 *   selectDashboardPanelFixtures()   — pick dashboard_panel entries
 *         │
 *         ▼
 *   groupFixturesByRoom()             — partition by room_id
 *         │
 *         ▼
 *   computeStoreRenderEntries()       — pair each fixture with its roomOrigin
 *         │
 *         ▼
 *   StoreDrivenDashboardPanelSet      — renders DashboardPanel for every entry
 *         │
 *         ▼
 *   StoreDrivenDashboardPanels        — building-level; init store, render all
 *
 * ## Pure-logic helpers (exported — testable without React/Three.js)
 *
 *   selectDashboardPanelFixtures(fixtures)            — O(n) type filter
 *   groupFixturesByRoom(fixtures)                     — Map<roomId, UiFixtureDef[]>
 *   isDashboardPanelRenderable(fixture, roomOrigins)  — has room origin?
 *   computeStoreRenderEntries(fixtures, roomOrigins)  — pairing list
 *   computePanelGroupName(fixtureId)                  — Three.js group name string
 *   computeFixtureRenderOrder(fixture)                — scene render order
 *
 * ## Entity store contract
 *
 *   - `useUiFixtureStore.initFixtures()` must be called before rendering.
 *     `StoreDrivenDashboardPanels` calls this automatically on mount.
 *   - All fixture mutations go through `useUiFixtureStore.registerFixture()`;
 *     the component subscribes reactively and re-renders on store change.
 *   - The store emits `fixture.placed` for each panel on `initFixtures()`.
 *
 * ## Coordinate conventions
 *
 *   Panels are placed at roomOrigin + fixture.transform.position.
 *   Rotation is fixture.transform.rotation (Euler, radians).
 *   All coordinate computation is delegated to `DashboardPanel`.
 *
 * ## Event sourcing
 *
 *   fixture.placed     — emitted by each DashboardPanel on mount (via DashboardPanel.tsx)
 *   fixture.initialized— emitted by the store's initFixtures()
 */

import { memo, useEffect } from "react";
import type { UiFixtureDef } from "../data/ui-fixture-registry.js";
import {
  useUiFixtureStore,
  type UiFixtureState,
} from "../store/ui-fixture-store.js";
import { DashboardPanel, DASHBOARD_PANEL_RENDER_ORDER } from "./DashboardPanel.js";

// ── Exported pure-logic helpers ───────────────────────────────────────────────

/**
 * Extract all `dashboard_panel` fixtures from a flat record of UiFixtureDef
 * entries (as stored in `useUiFixtureStore.fixtures`).
 *
 * Purely a type-filter; performs no sorting.
 *
 * @param fixtures  The `fixtures` record from the entity store
 * @returns         Array of dashboard_panel entries (may be empty)
 */
export function selectDashboardPanelFixtures(
  fixtures: Record<string, UiFixtureDef>,
): UiFixtureDef[] {
  return Object.values(fixtures).filter(
    (f) => f.fixture_type === "dashboard_panel",
  );
}

/**
 * Partition a list of fixtures into per-room groups.
 *
 * @param fixtures  Flat array of UiFixtureDef (any type)
 * @returns         Map<roomId, UiFixtureDef[]> — ordered by first appearance
 */
export function groupFixturesByRoom(
  fixtures: readonly UiFixtureDef[],
): Map<string, UiFixtureDef[]> {
  const map = new Map<string, UiFixtureDef[]>();
  for (const f of fixtures) {
    const existing = map.get(f.room_id);
    if (existing) {
      existing.push(f);
    } else {
      map.set(f.room_id, [f]);
    }
  }
  return map;
}

/**
 * Determine whether a fixture can be rendered in the scene.
 *
 * A fixture is renderable when:
 *   1. Its `room_id` has a corresponding entry in `roomOrigins`
 *   2. The room origin has finite x, y, z coordinates
 *
 * @param fixture     The fixture definition
 * @param roomOrigins Map of roomId → world-space origin
 * @returns           true when the fixture can be placed in the scene
 */
export function isDashboardPanelRenderable(
  fixture: UiFixtureDef,
  roomOrigins: ReadonlyMap<string, { x: number; y: number; z: number }>,
): boolean {
  const origin = roomOrigins.get(fixture.room_id);
  if (!origin) return false;
  return (
    Number.isFinite(origin.x) &&
    Number.isFinite(origin.y) &&
    Number.isFinite(origin.z)
  );
}

/** A single resolved entry for the store-driven renderer. */
export interface StorePanelRenderEntry {
  /** The fixture definition from the entity store. */
  fixture: UiFixtureDef;
  /** Resolved world-space origin for the fixture's room. */
  roomOrigin: { x: number; y: number; z: number };
}

/**
 * Build the ordered list of (fixture, roomOrigin) pairs that the renderer
 * will turn into Three.js scene objects.
 *
 * Fixtures whose room is not present in `roomOrigins` are silently skipped —
 * this matches the `BuildingDashboardPanels` contract where missing origins
 * produce no render (graceful omission).
 *
 * @param fixtures    Array of dashboard_panel UiFixtureDef entries
 * @param roomOrigins Map of roomId → world-space origin
 * @returns           Ordered list of renderable entries
 */
export function computeStoreRenderEntries(
  fixtures: readonly UiFixtureDef[],
  roomOrigins: ReadonlyMap<string, { x: number; y: number; z: number }>,
): StorePanelRenderEntry[] {
  const entries: StorePanelRenderEntry[] = [];
  for (const fixture of fixtures) {
    if (!isDashboardPanelRenderable(fixture, roomOrigins)) continue;
    const roomOrigin = roomOrigins.get(fixture.room_id)!;
    entries.push({ fixture, roomOrigin });
  }
  return entries;
}

/**
 * Compute the Three.js group `name` attribute for a dashboard panel.
 *
 * Naming convention:  `dashboard-panel-{fixtureId}`
 * This matches the convention in DashboardPanel.tsx so that the names are
 * consistent whether the panel was placed by the static or store-driven path.
 *
 * @param fixtureId  Stable fixture identifier
 */
export function computePanelGroupName(fixtureId: string): string {
  return `dashboard-panel-${fixtureId}`;
}

/**
 * Compute the Three.js render order for a ui_fixture based on its type.
 *
 * dashboard_panel → DASHBOARD_PANEL_RENDER_ORDER (2)
 * Other types   → 1 (below dashboard panels, above floor geometry)
 *
 * @param fixture  The fixture definition
 * @returns        Non-negative integer render order
 */
export function computeFixtureRenderOrder(fixture: UiFixtureDef): number {
  if (fixture.fixture_type === "dashboard_panel") {
    return DASHBOARD_PANEL_RENDER_ORDER;
  }
  return 1;
}

// ── Zustand selector ──────────────────────────────────────────────────────────

/**
 * Zustand selector: extract the entity store's fixture registry and
 * initialization flag.
 *
 * Used by the store-driven components to subscribe reactively to fixture
 * changes without re-rendering the entire store state.
 */
export function selectFixtureRegistrySlice(state: UiFixtureState): {
  fixtures: Record<string, UiFixtureDef>;
  initialized: boolean;
  selectedFixtureId: string | null;
} {
  return {
    fixtures:          state.fixtures,
    initialized:       state.initialized,
    selectedFixtureId: state.selectedFixtureId,
  };
}

// ── React components ──────────────────────────────────────────────────────────

export interface StoreDrivenDashboardPanelSetProps {
  /** All render entries for the current render (fixture + resolved origin). */
  entries: readonly StorePanelRenderEntry[];
  /** Currently selected fixture_id (for highlight). */
  selectedFixtureId?: string | null;
  /** Selection callback — receives fixture_id. */
  onSelect?: (fixtureId: string) => void;
}

/**
 * StoreDrivenDashboardPanelSet — renders all pre-resolved fixture entries.
 *
 * Stateless: does not read from any store — all data flows in via props.
 * This makes the component easy to test (mock entries, no store setup).
 *
 * Each `DashboardPanel` is wrapped in a room-origin group so that the panel's
 * room-local transform is correctly applied on top of the room's world position.
 */
export const StoreDrivenDashboardPanelSet = memo(function StoreDrivenDashboardPanelSet({
  entries,
  selectedFixtureId,
  onSelect,
}: StoreDrivenDashboardPanelSetProps) {
  // Group entries by room for efficient group placement
  const byRoom = new Map<string, StorePanelRenderEntry[]>();
  for (const entry of entries) {
    const key = entry.fixture.room_id;
    const existing = byRoom.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      byRoom.set(key, [entry]);
    }
  }

  return (
    <group name="store-driven-dashboard-panels">
      {[...byRoom.entries()].map(([roomId, roomEntries]) => {
        // All entries in this group share the same roomOrigin
        const { roomOrigin } = roomEntries[0];
        return (
          <group
            key={roomId}
            name={`store-panel-room-${roomId}`}
            position={[roomOrigin.x, roomOrigin.y, roomOrigin.z]}
          >
            {roomEntries.map(({ fixture }) => (
              <DashboardPanel
                key={fixture.fixture_id}
                fixture={fixture}
                isActive={selectedFixtureId === fixture.fixture_id}
                onSelect={onSelect}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
});

export interface StoreDrivenDashboardPanelsProps {
  /**
   * Map of roomId → world-space origin for translating room-local fixture
   * positions into scene coordinates.
   *
   * Fixtures whose roomId is absent from this map are silently skipped.
   */
  roomOrigins: ReadonlyMap<string, { x: number; y: number; z: number }>;
  /**
   * Currently selected fixture_id (for active-state highlight).
   * If null/undefined, no panel is highlighted.
   */
  selectedFixtureId?: string | null;
  /**
   * Called when an operator clicks a panel.
   * Receives the fixture_id of the panel that was selected.
   */
  onSelect?: (fixtureId: string) => void;
}

/**
 * StoreDrivenDashboardPanels — building-level store-driven dashboard panel
 * renderer.
 *
 * Lifecycle:
 *   1. On mount, calls `useUiFixtureStore.initFixtures()` to seed the entity
 *      store from `DEFAULT_UI_FIXTURES` (idempotent — safe to call multiple times).
 *   2. Subscribes to the entity store's `fixtures` map via Zustand selector.
 *   3. Filters to `dashboard_panel` type, pairs with room origins, renders.
 *
 * This component is the **primary rendering entry point** for the store-driven
 * pipeline.  In a production scene, mount exactly once inside the 3D canvas:
 *
 * ```tsx
 * <Canvas>
 *   <StoreDrivenDashboardPanels
 *     roomOrigins={roomOrigins}
 *     onSelect={handlePanelSelect}
 *   />
 * </Canvas>
 * ```
 *
 * Sub-AC 6b contract:
 *   - Panels appear as spatial objects in the scene (via `DashboardPanel`).
 *   - Panels are retrieved from the entity store (via `useUiFixtureStore`).
 *   - All mutations to the entity store (add/remove/update) are reflected
 *     automatically — the component subscribes reactively.
 */
export const StoreDrivenDashboardPanels = memo(function StoreDrivenDashboardPanels({
  roomOrigins,
  selectedFixtureId,
  onSelect,
}: StoreDrivenDashboardPanelsProps) {
  // Read only the relevant slice to avoid unnecessary re-renders
  const { fixtures, initialized, selectedFixtureId: storeSelected } =
    useUiFixtureStore(selectFixtureRegistrySlice);
  const initFixtures   = useUiFixtureStore((s) => s.initFixtures);
  const selectFixture  = useUiFixtureStore((s) => s.selectFixture);

  // Boot the entity store on first mount (idempotent — safe if called twice)
  useEffect(() => {
    initFixtures();
  }, [initFixtures]);

  if (!initialized) return null;

  // Build the render list from the live entity store
  const dashboardPanels = selectDashboardPanelFixtures(fixtures);
  const entries = computeStoreRenderEntries(dashboardPanels, roomOrigins);

  if (entries.length === 0) return null;

  // Merge prop-level selection with store-level selection (prop takes priority)
  const resolvedSelectedId = selectedFixtureId ?? storeSelected;

  const handleSelect = (fixtureId: string) => {
    selectFixture(fixtureId);
    onSelect?.(fixtureId);
  };

  return (
    <StoreDrivenDashboardPanelSet
      entries={entries}
      selectedFixtureId={resolvedSelectedId}
      onSelect={handleSelect}
    />
  );
});
