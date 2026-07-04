/**
 * room-type-meta — shared room-type visual metadata for HUD components.
 *
 * Derived from ROLE_VISUALS to keep the HUD legend/detail components
 * always in sync with the 3D scene visuals.
 */
import { ROLE_VISUALS } from "../../scene/RoomTypeVisuals.js";

/**
 * Derive colors and icons directly from ROLE_VISUALS to keep
 * HUD legend always in sync with the 3D scene visuals.
 */
export const ROOM_TYPE_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_VISUALS).map(([type, v]) => [type, v.color]),
);

/** Icon glyphs per room type — sourced from ROLE_VISUALS */
export const ROOM_TYPE_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_VISUALS).map(([type, v]) => [type, v.icon]),
);

/** Geometry names per room type for legend */
export const ROOM_TYPE_SHAPES: Record<string, string> = {
  control: "Octahedron",
  office: "Cube",
  lab: "Icosahedron",
  lobby: "Torus",
  archive: "Cylinder",
  corridor: "Cone",
};

/** Animation description per room type for legend */
export const ROOM_TYPE_ANIM: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_VISUALS).map(([type, v]) => [type, v.animation]),
);
