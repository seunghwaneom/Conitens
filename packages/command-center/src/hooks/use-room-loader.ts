/**
 * use-room-loader.ts — React hook for loading room configs on mount.
 *
 * Attempts to dynamically load room configurations from YAML sources.
 * Falls back to static data if dynamic loading fails.
 *
 * After a successful YAML load, runs the procedural layout pass to:
 *   - Validate that all rooms occupy distinct, non-overlapping spatial cells
 *   - Auto-place any rooms that lack explicit `spatial.position` data
 *   - Record the placement log in the spatial store for event sourcing
 *
 * Loading priority:
 *   1. Vite virtual module (build-time embedded YAML)
 *   2. Dev server API (runtime fetch from /__rooms__/)
 *   3. Static fallback (hardcoded BUILDING constant)
 */
import { useEffect, useRef } from "react";
import { useSpatialStore } from "../store/spatial-store.js";
import { buildFromYaml, fetchRoomConfigs } from "../data/room-loader.js";
import {
  applyProceduralLayout,
  validateDistinctCells,
} from "../data/procedural-layout.js";
import type { BuildingDef } from "../data/building.js";

/** Try to import the virtual module (available when Vite plugin is active) */
async function tryVirtualModule(): Promise<{
  buildingYaml: string | null;
  roomYamls: Record<string, string>;
} | null> {
  try {
    // Dynamic import of virtual module — only exists when vite-rooms-plugin is active
    const mod = await import("virtual:room-configs");
    return mod;
  } catch {
    return null;
  }
}

/**
 * Run the procedural layout engine on a raw-parsed building.
 *
 * Returns the building with validated/auto-placed rooms plus the
 * placement log for event sourcing.
 */
function runProceduralLayout(building: BuildingDef): {
  layoutBuilding: BuildingDef;
  placementLog: ReturnType<typeof applyProceduralLayout>["placementLog"];
} {
  const { rooms, placementLog, overlapWarnings, autoPlacedIds } =
    applyProceduralLayout(building.rooms, building.floors);

  // Log any overlap warnings — these are informational, not blocking
  for (const warning of overlapWarnings) {
    console.warn(warning);
  }

  if (autoPlacedIds.length > 0) {
    console.info(
      `[room-loader] Auto-placed ${autoPlacedIds.length} room(s) without explicit ` +
        `spatial data: ${autoPlacedIds.join(", ")}`,
    );
  }

  // Validate distinct cells (debug-level check)
  const violations = validateDistinctCells(placementLog);
  for (const v of violations) {
    console.warn(v);
  }

  console.info(
    `[room-loader] Procedural layout: ${rooms.length} rooms across ` +
      `${building.floors.length} floor(s) — ` +
      `${placementLog.filter((e) => e.source === "yaml-explicit").length} explicit, ` +
      `${autoPlacedIds.length} auto-placed`,
  );

  return { layoutBuilding: { ...building, rooms }, placementLog };
}

/**
 * Hook: loads room configs from YAML and populates the spatial store.
 *
 * Call once at the app root. The store is populated asynchronously;
 * the 3D scene renders immediately with static fallback data and
 * transitions to dynamic data once loaded.
 */
export function useRoomLoader() {
  const loadBuilding = useSpatialStore((s) => s.loadBuilding);
  const setRoomCreationLog = useSpatialStore((s) => s.setRoomCreationLog);
  const setLoading = useSpatialStore((s) => s.setLoading);
  const setError = useSpatialStore((s) => s.setError);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    async function load() {
      setLoading(true);

      // Strategy 1: Try virtual module (build-time YAML injection)
      const virtualMod = await tryVirtualModule();
      if (virtualMod?.buildingYaml) {
        try {
          const raw = buildFromYaml(virtualMod.buildingYaml, virtualMod.roomYamls);
          if (raw.rooms.length > 0) {
            const { layoutBuilding, placementLog } = runProceduralLayout(raw);
            console.info(
              `[room-loader] Loaded ${layoutBuilding.rooms.length} rooms from ` +
                `virtual module (build-time YAML) — procedural layout applied`,
            );
            loadBuilding(layoutBuilding, "yaml");
            setRoomCreationLog(placementLog);
            return;
          }
        } catch (err) {
          console.warn("[room-loader] Virtual module parse failed:", err);
        }
      }

      // Strategy 2: Try runtime fetch from dev server
      const fetched = await fetchRoomConfigs();
      if (fetched && fetched.rooms.length > 0) {
        const { layoutBuilding, placementLog } = runProceduralLayout(fetched);
        console.info(
          `[room-loader] Loaded ${layoutBuilding.rooms.length} rooms from ` +
            `dev server API — procedural layout applied`,
        );
        loadBuilding(layoutBuilding, "yaml");
        setRoomCreationLog(placementLog);
        return;
      }

      // Strategy 3: Static fallback (already loaded in store)
      console.info("[room-loader] Using static fallback data");
      setLoading(false);
    }

    load().catch((err) => {
      console.error("[room-loader] Unexpected error:", err);
      setError(String(err));
    });
  }, [loadBuilding, setRoomCreationLog, setLoading, setError]);
}
